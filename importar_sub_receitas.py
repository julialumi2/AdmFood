# -*- coding: utf-8 -*-
"""Importa a receita das 9 misturas feitas na casa (aba "Sub-Receitas" da
planilha de CMV do Artesanos): Tempero Smash, Tempero Batata, Maionese da
Casa, Molho Especial, Massa de Dadinho, Cebola Crispy, Bacon Empanado,
Sweet Barbecue e Cebola Caramelizada.

Pra que serve: com a receita cadastrada, o custo da mistura passa a ser
calculado (e se corrige sozinho quando o preço de um ingrediente muda), e
vender um produto que leva a mistura desconta os ingredientes do estoque —
sal, páprica, açúcar —, que é o que a casa compra. Pedido da Julia em
09/09/2026, pra planilha sair de cena.

Receita dentro de receita: o Molho Especial leva 2,8 kg de Maionese da
Casa, que tem receita própria. O sistema resolve em cascata.

O que não entra completo, e por quê:
- "Limão (suco)" da Maionese: a receita pede gramas de suco, o cadastro
  conta limão por unidade. Converter exigiria saber quanto suco dá um
  limão, então a linha entra com a quantidade em branco (e a receita fica
  incompleta até alguém preencher) em vez de sumir.
- Na planilha, toda mistura rende exatamente a soma dos ingredientes. Pra
  tempero é isso mesmo; cebola caramelizada, cebola crispy e bacon
  empanado vão ao fogo e rendem menos. O rendimento entra como está na
  planilha e fica marcado pra conferir na tela (Estoque → receita).

Ingrediente que não existe é criado, vinculado ao Artesanos, com o custo
unitário da própria sub-receita. Idempotente: mistura que já tem receita
não é tocada (pode ter sido ajustada na tela).

Uso:
  python importar_sub_receitas.py [planilha.xlsx]            # simulação
  python importar_sub_receitas.py [planilha.xlsx] --apply    # grava
"""
import sys
from datetime import datetime

import openpyxl

from backend.armazenamento import (
    conexao,
    criar_insumo,
    definir_receita_insumo,
    inicializar_banco,
    mapa_receita_insumo,
    _normalizar_nome_insumo,
)
from backend.nomes_insumo import resolver
from importar_custos_insumo import _unidade
from importar_ficha_tecnica_faltante import _converter_quantidade

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

PLANILHA_PADRAO = r"C:\Users\Guilherme\Downloads\Ficha_Tecnica_CMV_Artesanos_Burger.xlsx"
ABA = "Sub-Receitas"
LOJA = "Hamburgueria Artesanos"

# Título do bloco na planilha (normalizado) -> insumo-mistura do cadastro
MISTURAS = {
    "tempero smash": "Tempero Smash (mistura)",
    "tempero batata": "Tempero Batata (mistura)",
    "maionese da casa": "Maionese da Casa (caseira)",
    "molho especial": "Molho especial",
    "massa dadinho de tapioca": "Massa Dadinho de Tapioca (pronta)",
    "cebola crispy": "Cebola crispy",
    "bacon empanado": "Bacon empanado",
    "sweet barbecue": "Sweet barbecue",
    "cebola caramelizada": "Cebola caramelizada",
}
# Vão ao fogo: o rendimento real é menor que a soma dos ingredientes.
RENDIMENTO_A_CONFERIR = {"cebola crispy", "bacon empanado", "cebola caramelizada"}

# Ingrediente que precisa ser criado com um nome mais limpo que o da
# planilha. O nome da planilha continua casando com ele (resolver tira o
# parêntese do fim).
CRIAR_COMO = {
    "cebola in natura para empanar": "Cebola",
    "molho barbecue base": "Molho barbecue",
}

LINHAS_DE_TOTAL = {"total da receita", "custo por kg"}


def _ler_sub_receitas(caminho):
    """[{"titulo", "rendimento", "ingredientes": [{"nome", "unidade", "quantidade", "custo"}]}]"""
    wb = openpyxl.load_workbook(caminho, data_only=True)
    if ABA not in wb.sheetnames:
        raise SystemExit(f"Aba {ABA!r} não encontrada. Abas: {wb.sheetnames}")
    receitas, atual = [], None
    for linha in wb[ABA].iter_rows(min_row=4, values_only=True):
        nome, unidade, quantidade, custo = (list(linha) + [None] * 4)[:4]
        nome = str(nome).strip() if nome else ""
        normal = _normalizar_nome_insumo(nome)
        if not nome or normal == "insumo base":
            continue
        if normal == "total da receita":
            atual["rendimento"] = quantidade
            continue
        if normal in LINHAS_DE_TOTAL:
            continue
        if not isinstance(quantidade, (int, float)):  # título de um bloco novo
            atual = {"titulo": normal, "rendimento": None, "ingredientes": []}
            receitas.append(atual)
            continue
        atual["ingredientes"].append({
            "nome": nome, "unidade": _unidade(unidade), "quantidade": float(quantidade),
            "custo": float(custo) if isinstance(custo, (int, float)) else None,
        })
    return receitas


def importar(caminho=PLANILHA_PADRAO, aplicar=False):
    inicializar_banco()
    receitas = _ler_sub_receitas(caminho)
    ja_tem_receita = set(mapa_receita_insumo())
    with conexao() as conn:
        cadastro = {
            _normalizar_nome_insumo(l["nome"]): dict(l)
            for l in conn.execute("SELECT id, nome, unidade_medida FROM insumo").fetchall()
        }

    plano, criar, avisos = [], {}, []
    print(f"=== {len(receitas)} sub-receitas na planilha ===")
    for receita in receitas:
        nome_mistura = MISTURAS.get(receita["titulo"])
        mistura = cadastro.get(_normalizar_nome_insumo(nome_mistura)) if nome_mistura else None
        if not mistura:
            print(f"   ! {receita['titulo']!r}: sem insumo correspondente no cadastro — pulada")
            continue
        if mistura["id"] in ja_tem_receita:
            print(f"   {mistura['nome']:34} já tem receita — mantida")
            continue

        # A planilha soma g e ml como se fossem a mesma coisa (densidade ≈ 1,
        # mesma suposição do import de custo); o rendimento vai pra unidade
        # da mistura (Massa de Dadinho é contada em kg).
        rendimento = _converter_quantidade(receita["rendimento"], "g", mistura["unidade_medida"])
        if not rendimento:
            print(f"   ! {mistura['nome']}: rendimento {receita['rendimento']!r} não converte pra "
                  f"{mistura['unidade_medida']!r} — pulada")
            continue

        linhas, fora = [], []
        for ingrediente in receita["ingredientes"]:
            # Ingrediente que é outra mistura ("Maionese da Casa" dentro do
            # Molho Especial) casa com a mistura cadastrada, que se chama
            # "Maionese da Casa (caseira)" — senão viraria um insumo novo
            # "comprado pronto" e a cascata quebraria.
            outra_mistura = MISTURAS.get(_normalizar_nome_insumo(ingrediente["nome"]))
            existente = (cadastro.get(_normalizar_nome_insumo(outra_mistura)) if outra_mistura
                         else resolver(ingrediente["nome"], cadastro))
            if existente is None:
                nome_novo = CRIAR_COMO.get(_normalizar_nome_insumo(ingrediente["nome"]), ingrediente["nome"])
                criar.setdefault(nome_novo, {"unidade": ingrediente["unidade"], "custo": ingrediente["custo"]})
                linhas.append((nome_novo, ingrediente["quantidade"]))
                continue
            quantidade = _converter_quantidade(ingrediente["quantidade"], ingrediente["unidade"], existente["unidade_medida"])
            if quantidade is None:
                # Entra na receita com a quantidade em branco, não fica de
                # fora: sem a linha, a receita pareceria completa e o custo
                # sairia menor que o real. Em branco, a receita fica
                # incompleta (vale o custo digitado) e a tela mostra a linha
                # esperando a quantidade na unidade do cadastro.
                fora.append(f"{ingrediente['nome']} ({ingrediente['unidade']} na planilha, "
                            f"{existente['unidade_medida']} no cadastro)")
                linhas.append((existente["nome"], None))
                continue
            linhas.append((existente["nome"], quantidade))

        plano.append((mistura, rendimento, linhas))
        conferir = "  ⚠ rende a soma dos ingredientes — conferir" if receita["titulo"] in RENDIMENTO_A_CONFERIR else ""
        print(f"   {mistura['nome']:34} rende {rendimento:g} {mistura['unidade_medida']}{conferir}")
        print(f"      {', '.join(f'{n} {q:g}' if q is not None else f'{n} (em branco)' for n, q in linhas)}")
        for motivo in fora:
            print(f"      ! quantidade em branco: {motivo} — não dá pra converter sem saber o peso por unidade")
            avisos.append(f"{mistura['nome']}: {motivo}")

    if criar:
        print(f"\n=== Ingredientes novos ({len(criar)}) — vinculados ao {LOJA} ===")
        for nome, info in criar.items():
            custo = f"R$ {info['custo']}/{info['unidade']}" if info["custo"] is not None else "sem custo"
            print(f"   {nome:28} {info['unidade']:<3} {custo}")

    if not aplicar:
        print("\nSimulação. Rode de novo com --apply pra gravar.")
        return

    agora = datetime.now().isoformat()
    for nome, info in criar.items():
        insumo_id = criar_insumo(nome, "Ingrediente", info["unidade"], [LOJA])
        if info["custo"] is not None:
            with conexao() as conn:
                conn.execute("UPDATE insumo SET custo_referencia = ? WHERE id = ?", (info["custo"], insumo_id))
        cadastro[_normalizar_nome_insumo(nome)] = {"id": insumo_id, "nome": nome, "unidade_medida": info["unidade"]}

    for mistura, rendimento, linhas in plano:
        ingredientes = [{"insumoId": cadastro[_normalizar_nome_insumo(n)]["id"], "quantidade": q} for n, q in linhas]
        definir_receita_insumo(mistura["id"], rendimento, ingredientes)
        # Ingrediente que já existia de outra loja (o Sal da Tradiça) passa a
        # ser usado no Artesanos também: aparece no estoque de lá.
        with conexao() as conn:
            for ingrediente in ingredientes:
                conn.execute("INSERT OR IGNORE INTO insumo_loja (insumo_id, loja) VALUES (?, ?)",
                             (ingrediente["insumoId"], LOJA))
                conn.execute(
                    "INSERT OR IGNORE INTO estoque_insumo (insumo_id, loja, quantidade_atual, estoque_minimo, atualizado_em) "
                    "VALUES (?, ?, 0, 0, ?)", (ingrediente["insumoId"], LOJA, agora))

    print(f"\nReceitas gravadas: {len(plano)}. Ingredientes criados: {len(criar)}.")
    for aviso in avisos:
        print(f"Pendente: {aviso}")


if __name__ == "__main__":
    argumentos = [a for a in sys.argv[1:] if a != "--apply"]
    importar(argumentos[0] if argumentos else PLANILHA_PADRAO, aplicar="--apply" in sys.argv)
