# -*- coding: utf-8 -*-
"""Completa a Ficha Técnica do Artesanos a partir da planilha do chefe
(Ficha_Tecnica_CMV_Artesanos_Burger.xlsx), pegando o que ficou de fora na
importação anterior.

Por que ficou de fora: o nome do produto na planilha nem sempre é o nome
cadastrado. "CLASSICO (simples)" na planilha é o item "CLASSICO" no
sistema, e o casamento por nome exato não pegou — o resultado é um produto
que **casa com a venda mas não desconta nada do estoque**, porque a receita
está vazia. Pior que ficar pendente, porque não aparece em fila nenhuma.

O script casa por nome normalizado e, se não achar, tenta de novo sem o
sufixo entre parênteses. Produto que não existe é criado; insumo que não
existe também. **Só preenche receita vazia** — nunca sobrescreve o que já
está cadastrado, que pode ter sido ajustado à mão depois.

Uso:
  python importar_ficha_tecnica_faltante.py            # simulação
  python importar_ficha_tecnica_faltante.py --apply    # grava
"""
import difflib
import sys

import openpyxl

from backend.armazenamento import (
    inicializar_banco,
    criar_insumo,
    criar_item_cardapio,
    definir_ficha_tecnica,
    conexao,
    _normalizar_nome_insumo,
)
from backend.nomes_insumo import resolver as _resolver_insumo, sem_sufixo as _sem_sufixo
from config import LOJAS
from importar_custos_insumo import _unidade, _FATOR, _FATOR_COM_SUPOSICAO

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

PLANILHA_PADRAO = r"C:\Users\Guilherme\Downloads\Ficha_Tecnica_CMV_Artesanos_Burger.xlsx"
LOJA = "Hamburgueria Artesanos"
ABA = "Ficha Técnica"
PRIMEIRA_LINHA = 5

# Colunas (índice 0) da aba "Ficha Técnica"
COL_CATEGORIA, COL_PRODUTO, COL_INSUMO, COL_UNIDADE, COL_QUANTIDADE = 0, 1, 3, 4, 5

def _converter_quantidade(quantidade, unidade_planilha, unidade_cadastro):
    """Quantidade da planilha na unidade do cadastro, ou None quando não dá
    pra converter sem assumir peso por unidade. Sem isso, "0,11 kg" de carne
    virava 0,11 g num insumo contado em grama — o mesmo tipo de erro que já
    produziu um CMV de 18.000% neste sistema. g <-> ml assume densidade ≈ 1,
    a mesma suposição documentada em importar_custos_insumo.py (molhos)."""
    origem, destino = _unidade(unidade_planilha), _unidade(unidade_cadastro)
    if quantidade is None or not origem or not destino or origem == destino:
        return quantidade
    fator = _FATOR.get((origem, destino)) or _FATOR_COM_SUPOSICAO.get((origem, destino))
    return round(quantidade * fator, 4) if fator else None


_PESO_OU_VOLUME = {"g", "kg", "ml", "l"}


def quantidade_para_insumo(quantidade, unidade_origem, insumo):
    """Quantidade da planilha na unidade do insumo cadastrado, inclusive o
    contado por embalagem (un, pct, cx, galão...) que tem conteúdo
    cadastrado (1 un = 1000 g): 14 g viram 0,014 un. Vale pra qualquer
    embalagem, igual ao campo "Cada unidade tem" do cadastro e ao seletor
    g/un da ficha. None quando não dá — embalagem sem conteúdo cadastrado,
    ou grandezas diferentes."""
    if quantidade is None:
        return None
    destino = _unidade(insumo["unidade_medida"])
    if destino and destino not in _PESO_OU_VOLUME and _unidade(unidade_origem) != destino:
        conteudo = insumo.get("conteudo_por_unidade")
        if not conteudo:
            return None
        no_conteudo = _converter_quantidade(quantidade, unidade_origem, insumo.get("unidade_conteudo") or "g")
        return round(no_conteudo / conteudo, 6) if no_conteudo is not None else None
    return _converter_quantidade(quantidade, unidade_origem, insumo["unidade_medida"])


def custo_para_insumo(custo, unidade_origem, insumo):
    """Preço por unidade da planilha (por kg, por g...) no preço por unidade
    do insumo cadastrado — o inverso da quantidade: R$ 19,90/kg num saco de
    1 kg dá R$ 19,90 por saco. None quando a quantidade não converte."""
    fator = quantidade_para_insumo(1.0, unidade_origem, insumo)
    return round(custo / fator, 6) if fator else None


def _ler_planilha(caminho):
    wb = openpyxl.load_workbook(caminho, data_only=True)
    if ABA not in wb.sheetnames:
        raise SystemExit(f"Aba {ABA!r} não encontrada. Abas: {wb.sheetnames}")
    produtos = {}
    for linha in wb[ABA].iter_rows(min_row=PRIMEIRA_LINHA, values_only=True):
        produto = str(linha[COL_PRODUTO]).strip() if linha[COL_PRODUTO] else ""
        insumo = str(linha[COL_INSUMO]).strip() if linha[COL_INSUMO] else ""
        if not produto or not insumo:
            continue
        quantidade = linha[COL_QUANTIDADE]
        try:
            quantidade = round(float(quantidade), 4) if quantidade not in (None, "") else None
        except (TypeError, ValueError):
            quantidade = None
        info = produtos.setdefault(produto, {
            "categoria": str(linha[COL_CATEGORIA]).strip() if linha[COL_CATEGORIA] else "Geral",
            "insumos": [],
        })
        info["insumos"].append({
            "nome": insumo,
            "unidade": str(linha[COL_UNIDADE]).strip() if linha[COL_UNIDADE] else "un",
            "quantidade": quantidade,
        })
    return produtos


def importar(caminho, aplicar=False):
    inicializar_banco()
    if LOJA not in LOJAS:
        raise SystemExit(f"Loja {LOJA!r} não está em config.LOJAS")

    produtos = _ler_planilha(caminho)

    with conexao() as conn:
        insumos_cadastrados = {
            _normalizar_nome_insumo(l["nome"]): {"id": l["id"], "nome": l["nome"], "unidade_medida": l["unidade_medida"]}
            for l in conn.execute("SELECT id, nome, unidade_medida FROM insumo").fetchall()
        }
        itens = {
            _normalizar_nome_insumo(l["nome"]): {"id": l["id"], "nome": l["nome"]}
            for l in conn.execute("SELECT id, nome FROM item_cardapio").fetchall()
        }
        ficha_atual = {}
        for l in conn.execute(
            "SELECT item_id, insumo_id, quantidade FROM ficha_tecnica WHERE loja = ?", (LOJA,)
        ).fetchall():
            ficha_atual.setdefault(l["item_id"], []).append(
                {"insumoId": l["insumo_id"], "quantidade": l["quantidade"]}
            )

    criados_item = criados_insumo = preenchidos = 0
    for produto, info in produtos.items():
        alvo = itens.get(_normalizar_nome_insumo(produto)) or itens.get(_normalizar_nome_insumo(_sem_sufixo(produto)))

        existentes = ficha_atual.get(alvo["id"], []) if alvo else []
        por_insumo = {l["insumoId"]: l for l in existentes}

        # Insumo que a receita ainda não tem entra novo. Quantidade que já
        # está preenchida fica intocada — pode ter sido ajustada à mão, e a
        # planilha não sabe disso. Mas quantidade NULA é preenchida: linha
        # sem gramatura não desconta estoque nem entra no custo, então ela
        # é indistinguível de não existir, e a planilha tem o número.
        faltantes, completar, incompativeis = [], [], []
        for i in info["insumos"]:
            insumo = _resolver_insumo(i["nome"], insumos_cadastrados)
            atual = por_insumo.get(insumo["id"]) if insumo else None
            if insumo and i["quantidade"] is not None:
                convertida = _converter_quantidade(i["quantidade"], i["unidade"], insumo["unidade_medida"])
                if convertida is None:
                    # un x g, por exemplo: converter exigiria saber quanto
                    # pesa uma unidade. Fica de fora e aparece no relatório.
                    if atual is None or atual["quantidade"] is None:
                        incompativeis.append((i, insumo))
                    continue
                i = {**i, "quantidade": convertida, "unidade": insumo["unidade_medida"]}
            if atual is None:
                faltantes.append(i)
            elif atual["quantidade"] is None and i["quantidade"] is not None:
                completar.append((atual, i))

        for i, insumo in incompativeis:
            print(f"  ! {produto!r}: {i['nome']!r} está em {i['unidade']!r} na planilha e em "
                  f"{insumo['unidade_medida']!r} no cadastro — não dá pra converter, fica de fora")

        if not faltantes and not completar:
            continue  # receita completa — nada a fazer

        origem = f"{produto!r}"
        if alvo and existentes:
            partes = []
            if faltantes: partes.append(f"+{len(faltantes)} insumo(s)")
            if completar: partes.append(f"{len(completar)} gramatura(s)")
            destino = f"completa {alvo['nome']!r} ({', '.join(partes)})"
        elif alvo:
            destino = f"item já cadastrado {alvo['nome']!r}"
        else:
            destino = f"item novo {_sem_sufixo(produto)!r}"
            criados_item += 1

        faltando = [i["nome"] for i in faltantes if not _resolver_insumo(i["nome"], insumos_cadastrados)]
        criados_insumo += len(faltando)
        print(f"\n  {origem} -> {destino}  ({len(info['insumos'])} insumos)")
        for atual, da_planilha in completar:
            print(f"     gramatura de {da_planilha['nome']!r}: — -> {da_planilha['quantidade']} {da_planilha['unidade']}")
        for nome_faltante in faltando:
            # Mostra o mais parecido que já existe: se for a mesma coisa com
            # outro nome, é melhor corrigir a planilha do que criar um insumo
            # repetido e partir o estoque do mesmo produto em dois.
            perto = difflib.get_close_matches(
                _normalizar_nome_insumo(nome_faltante), list(insumos_cadastrados), n=1, cutoff=0.6)
            dica = f"   ⚠ parecido com {insumos_cadastrados[perto[0]]['nome']!r}" if perto else ""
            print(f"     cria insumo {nome_faltante!r}{dica}")
        sem_qtd = [i["nome"] for i in faltantes if i["quantidade"] is None]
        if sem_qtd:
            print(f"     sem quantidade na planilha (entram como '—'): {', '.join(sem_qtd)}")

        if not aplicar:
            preenchidos += 1
            continue

        item_id = alvo["id"] if alvo else criar_item_cardapio(_sem_sufixo(produto), info["categoria"])
        for atual, da_planilha in completar:
            atual["quantidade"] = da_planilha["quantidade"]
        links = list(existentes)
        for i in faltantes:
            insumo = _resolver_insumo(i["nome"], insumos_cadastrados)
            if insumo:
                insumo_id = insumo["id"]
            else:
                # Só no Artesanos: vincular às 4 lojas foi o que encheu o
                # estoque da Tradiça e do Açaí de insumo de hambúrguer.
                insumo_id = criar_insumo(i["nome"], "Ingrediente", i["unidade"], [LOJA])
                insumos_cadastrados[_normalizar_nome_insumo(i["nome"])] = {
                    "id": insumo_id, "nome": i["nome"], "unidade_medida": i["unidade"]}
            links.append({"insumoId": insumo_id, "quantidade": i["quantidade"]})
        definir_ficha_tecnica(item_id, LOJA, links)
        preenchidos += 1

    print()
    if not produtos:
        print("Nenhum produto lido da planilha.")
    elif not preenchidos:
        print("Nada a fazer — todo produto da planilha já tem receita cadastrada.")
    elif aplicar:
        print(f"Preenchidas {preenchidos} receitas ({criados_item} itens novos, {criados_insumo} insumos novos).")
    else:
        print(f"Simulação: preencheria {preenchidos} receitas ({criados_item} itens novos, {criados_insumo} insumos novos).")
        print("Confira acima e rode de novo com --apply pra gravar.")


if __name__ == "__main__":
    argumentos = [a for a in sys.argv[1:] if a != "--apply"]
    importar(argumentos[0] if argumentos else PLANILHA_PADRAO, aplicar="--apply" in sys.argv)
