# -*- coding: utf-8 -*-
"""Importa o histórico semanal por canal da planilha do chefe da Julia
("RELATÓRIO VENDAS SEMANAL.xlsx") pra tabela faturamento_canal_semanal, que
alimenta a tela "Vendas Semanais".

O mesmo trabalho dá pra fazer pelo botão "Importar planilha" da própria
tela (que é o caminho normal, inclusive em produção). Este script existe
pra rodar local, sem navegador, com simulação antes de gravar.

Uso:
  python importar_vendas_semanais.py [caminho.xlsx]           # simulação
  python importar_vendas_semanais.py [caminho.xlsx] --apply   # grava
"""
import sys
from datetime import datetime

from backend.armazenamento import (
    inicializar_banco,
    salvar_faturamento_canal_semanal_se_ausente,
    salvar_resultado_semanal_se_ausente,
)
from backend.vendas_semanais_planilha import ler_vendas_semanais_da_planilha

# O console do Windows abre em cp1252 e engasga com "Tradiça"/"Açaí".
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

PLANILHA_PADRAO = r"C:\Users\Guilherme\Downloads\Cópia de RELATÓRIO VENDAS SEMANAL.xlsx"


def _brl(valor):
    return f"{valor:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")


def importar(caminho, aplicar=False):
    inicializar_banco()
    por_loja, avisos = ler_vendas_semanais_da_planilha(caminho, datetime.now().date())

    if avisos:
        print("Linhas que ficaram de fora (corrija a planilha e rode de novo — não duplica):")
        for aviso in avisos:
            print(f"  - {aviso}")

    gravadas = existentes = 0
    for loja, semanas in por_loja.items():
        print(f"\n### {loja}")
        if not semanas:
            print("  nenhuma semana válida")
            continue
        print(f"  {len(semanas)} semanas: {semanas[0][0]} até {semanas[-1][1]}")

        for inicio, fim, canais, extras in semanas:
            if aplicar:
                salvar_resultado_semanal_se_ausente(
                    loja, inicio.isoformat(), fim.isoformat(), extras['cmv'], extras['promoLoja']
                )
            for canal, valor in canais.items():
                if not aplicar:
                    gravadas += 1
                elif salvar_faturamento_canal_semanal_se_ausente(
                    loja, inicio.isoformat(), fim.isoformat(), canal, valor
                ):
                    gravadas += 1
                else:
                    existentes += 1

        amostra = semanas[:2] + semanas[-2:] if len(semanas) > 4 else semanas
        for inicio, fim, canais, _extras in amostra:
            resumo = "  ".join(f"{c}={_brl(v)}" for c, v in canais.items())
            print(f"    {inicio} a {fim}: {resumo}")

    print()
    if aplicar:
        print(f"Gravadas {gravadas} linhas. {existentes} já existiam e foram mantidas como estavam.")
    else:
        print(f"Simulação: gravaria {gravadas} linhas (canal × semana).")
        print("Confira os números acima e rode de novo com --apply pra gravar.")


if __name__ == "__main__":
    argumentos = [a for a in sys.argv[1:] if a != "--apply"]
    importar(argumentos[0] if argumentos else PLANILHA_PADRAO, aplicar="--apply" in sys.argv)
