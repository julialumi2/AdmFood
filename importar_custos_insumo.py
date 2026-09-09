# -*- coding: utf-8 -*-
"""Importa o custo por unidade de cada insumo da aba "Insumos" da planilha
de CMV do chefe (Ficha_Tecnica_CMV_Artesanos_Burger.xlsx).

Pra que serve: sem custo de insumo, o CMV de produto nenhum pode ser
calculado, e a Curva ABC de Cardápio não consegue classificar ninguém — o
sistema só saberia volume e receita. O custo da compra recebida é melhor
(é o dinheiro que saiu de verdade), mas até existir uma compra registrada
esse é o número que a casa usa.

Grava em `insumo.custo_referencia`, que é o último da fila em
`_mapa_preco_insumo`: assim que uma cotação ou uma compra recebida entrar
pro mesmo insumo, ela passa na frente sozinha.

Uso:
  python importar_custos_insumo.py            # simulação
  python importar_custos_insumo.py --apply    # grava
"""
import sys

import openpyxl

from backend.armazenamento import inicializar_banco, conexao, _normalizar_nome_insumo
from backend.nomes_insumo import resolver

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

PLANILHA_PADRAO = r"C:\Users\Guilherme\Downloads\Ficha_Tecnica_CMV_Artesanos_Burger.xlsx"
ABA = "Insumos"
PRIMEIRA_LINHA = 5
COL_NOME, COL_UNIDADE, COL_CUSTO = 0, 1, 2


def importar(caminho, aplicar=False):
    inicializar_banco()
    wb = openpyxl.load_workbook(caminho, data_only=True)
    if ABA not in wb.sheetnames:
        raise SystemExit(f"Aba {ABA!r} não encontrada. Abas: {wb.sheetnames}")

    da_planilha = {}
    for linha in wb[ABA].iter_rows(min_row=PRIMEIRA_LINHA, values_only=True):
        nome = str(linha[COL_NOME]).strip() if linha[COL_NOME] else ""
        custo = linha[COL_CUSTO]
        # Linha de seção ("PÃES") vem sem custo — não é insumo.
        if not nome or not isinstance(custo, (int, float)):
            continue
        da_planilha[_normalizar_nome_insumo(nome)] = {"nome": nome, "custo": round(float(custo), 4)}

    with conexao() as conn:
        cadastrados = {
            _normalizar_nome_insumo(l["nome"]): dict(l)
            for l in conn.execute("SELECT id, nome, custo_referencia FROM insumo").fetchall()
        }

    casados, novos_valores, sem_cadastro = [], 0, []
    for info in da_planilha.values():
        alvo = resolver(info["nome"], cadastrados)
        if not alvo:
            sem_cadastro.append(info["nome"])
            continue
        casados.append((alvo, info))
        if alvo["custo_referencia"] != info["custo"]:
            novos_valores += 1

    print(f"Planilha: {len(da_planilha)} insumos com custo")
    print(f"Casaram com o cadastro: {len(casados)}  |  sem insumo cadastrado: {len(sem_cadastro)}")
    if sem_cadastro:
        print("\nSem cadastro no sistema (não vão entrar — cadastre o insumo antes, se for usar):")
        for nome in sem_cadastro:
            print(f"   {nome}")

    print(f"\nValores a gravar/atualizar: {novos_valores}")
    for alvo, info in casados[:8]:
        antes = "—" if alvo["custo_referencia"] is None else f"R$ {alvo['custo_referencia']}"
        print(f"   {alvo['nome'][:34]:34} {antes:>10}  ->  R$ {info['custo']}")
    if len(casados) > 8:
        print(f"   ... e mais {len(casados) - 8}")

    if not aplicar:
        print("\nSimulação. Rode de novo com --apply pra gravar.")
        return

    with conexao() as conn:
        for alvo, info in casados:
            conn.execute("UPDATE insumo SET custo_referencia = ? WHERE id = ?", (info["custo"], alvo["id"]))
    print(f"\nGravados {len(casados)} custos.")


if __name__ == "__main__":
    argumentos = [a for a in sys.argv[1:] if a != "--apply"]
    importar(argumentos[0] if argumentos else PLANILHA_PADRAO, aplicar="--apply" in sys.argv)
