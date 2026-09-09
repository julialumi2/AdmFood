# -*- coding: utf-8 -*-
"""Sincroniza um intervalo de dias de uma loja com a Cardápio Web, em vez
de um dia só como o `sincronizar.py`. Serve pra puxar histórico de uma vez
— ex: carregar 90 dias de venda pra ver a Curva ABC com dado de verdade.

Uma chamada por dia, então rodar 90 dias demora; segunda-feira é pulada
(loja fechada). Reprocessar um dia já sincronizado é seguro: cada dia é
regravado inteiro, e a baixa de estoque é idempotente (aplica só a
diferença em relação ao que já tinha descontado).

Uso:
  python sincronizar_periodo.py "Hamburgueria Artesanos" 30
  python sincronizar_periodo.py "Hamburgueria Artesanos" 90
"""
import sys
from datetime import date, timedelta

from config import LOJAS
from backend.cardapio_web import buscar_resumo_do_dia
from backend.armazenamento import (
    inicializar_banco,
    salvar_resumo_do_dia,
    salvar_pedidos_do_dia,
    salvar_itens_vendidos_do_dia,
)

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

DIA_FECHADO = 0  # segunda-feira


def sincronizar_periodo(unidade, dias):
    if unidade not in LOJAS:
        raise SystemExit(f"Loja {unidade!r} não existe. Opções: {list(LOJAS)}")
    token = LOJAS[unidade].get("cardapio_web_token")
    if not token:
        raise SystemExit(f"{unidade}: token da Cardápio Web não configurado.")

    inicializar_banco()
    hoje = date.today()
    ok = falhas = pulados = 0
    faturamento = 0.0

    for passo in range(dias, 0, -1):
        dia = hoje - timedelta(days=passo)
        if dia.weekday() == DIA_FECHADO:
            pulados += 1
            continue
        try:
            resumo = buscar_resumo_do_dia(token, dia)
            dia_iso = dia.isoformat()
            salvar_resumo_do_dia(unidade, dia_iso, resumo)
            salvar_pedidos_do_dia(unidade, dia_iso, resumo["pedidos_detalhados"])
            salvar_itens_vendidos_do_dia(unidade, dia_iso, resumo["pedidos_detalhados"])
            ok += 1
            faturamento += resumo["faturamento_dia"]
            print(f"  {dia_iso}: R$ {resumo['faturamento_dia']:.2f}, {resumo['quantidade_pedidos']} pedidos")
        except Exception as erro:
            falhas += 1
            print(f"  {dia.isoformat()}: FALHOU — {erro}")

    print(f"\n{unidade}: {ok} dias sincronizados, {falhas} falhas, {pulados} segundas puladas.")
    print(f"Faturamento somado no período: R$ {faturamento:,.2f}".replace(",", "."))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit('Uso: python sincronizar_periodo.py "Nome da Loja" DIAS')
    sincronizar_periodo(sys.argv[1], int(sys.argv[2]))
