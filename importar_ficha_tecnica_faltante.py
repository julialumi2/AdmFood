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
            _normalizar_nome_insumo(l["nome"]): {"id": l["id"], "nome": l["nome"]}
            for l in conn.execute("SELECT id, nome FROM insumo").fetchall()
        }
        itens = {
            _normalizar_nome_insumo(l["nome"]): {"id": l["id"], "nome": l["nome"]}
            for l in conn.execute("SELECT id, nome FROM item_cardapio").fetchall()
        }
        com_ficha = {
            l["item_id"] for l in
            conn.execute("SELECT DISTINCT item_id FROM ficha_tecnica WHERE loja = ?", (LOJA,)).fetchall()
        }

    criados_item = criados_insumo = preenchidos = 0
    for produto, info in produtos.items():
        alvo = itens.get(_normalizar_nome_insumo(produto)) or itens.get(_normalizar_nome_insumo(_sem_sufixo(produto)))

        if alvo and alvo["id"] in com_ficha:
            continue  # já tem receita — não mexe

        origem = f"{produto!r}"
        if alvo:
            destino = f"item já cadastrado {alvo['nome']!r}"
        else:
            destino = f"item novo {_sem_sufixo(produto)!r}"
            criados_item += 1

        faltando = [i["nome"] for i in info["insumos"] if not _resolver_insumo(i["nome"], insumos_cadastrados)]
        criados_insumo += len(faltando)
        print(f"\n  {origem} -> {destino}  ({len(info['insumos'])} insumos)")
        for nome_faltante in faltando:
            # Mostra o mais parecido que já existe: se for a mesma coisa com
            # outro nome, é melhor corrigir a planilha do que criar um insumo
            # repetido e partir o estoque do mesmo produto em dois.
            perto = difflib.get_close_matches(
                _normalizar_nome_insumo(nome_faltante), list(insumos_cadastrados), n=1, cutoff=0.6)
            dica = f"   ⚠ parecido com {insumos_cadastrados[perto[0]]['nome']!r}" if perto else ""
            print(f"     cria insumo {nome_faltante!r}{dica}")
        sem_qtd = [i["nome"] for i in info["insumos"] if i["quantidade"] is None]
        if sem_qtd:
            print(f"     sem quantidade na planilha (entram como '—'): {', '.join(sem_qtd)}")

        if not aplicar:
            preenchidos += 1
            continue

        item_id = alvo["id"] if alvo else criar_item_cardapio(_sem_sufixo(produto), info["categoria"])
        links = []
        for i in info["insumos"]:
            insumo = _resolver_insumo(i["nome"], insumos_cadastrados)
            if insumo:
                insumo_id = insumo["id"]
            else:
                insumo_id = criar_insumo(i["nome"], "Ingrediente", i["unidade"], list(LOJAS.keys()))
                insumos_cadastrados[_normalizar_nome_insumo(i["nome"])] = {"id": insumo_id, "nome": i["nome"]}
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
