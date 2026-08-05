"""
Completa a contagem de pedidos (e recalcula o ticket médio) dos dias
históricos importados da planilha, que não trazem esse dado — só o
faturamento total do dia.

Busca na própria API da Cardápio Web quantos pedidos concluídos (status
"closed"/"delivered") existiram em cada dia. Não busca o valor de cada
pedido (isso já vem da planilha) — só a contagem, o que evita o endpoint
mais lento de detalhe por pedido.

Respeita o limite de 5 requisições/minuto do endpoint /orders/history.
Idempotente: só processa dias com quantidade_pedidos = 0, então pode ser
interrompido e rodado de novo sem duplicar trabalho.

Uso:
  python completar_pedidos_historico.py            # roda tudo
  python completar_pedidos_historico.py --limite 20 # só os 20 primeiros (teste)
"""

import sys
import time
from datetime import date

from config import LOJAS
from backend.cardapio_web import buscar_pedidos_do_dia, STATUS_CONCLUIDOS
from backend.armazenamento import dias_sem_pedidos_contados, atualizar_pedidos_dia

ESPERA_ENTRE_DIAS_SEGUNDOS = 13  # abaixo do limite de 5 req/min do /orders/history

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def completar(limite=None):
    dias = dias_sem_pedidos_contados()
    if limite:
        dias = dias[:limite]

    total = len(dias)
    print(f"{total} dias para completar.\n")

    sucesso = 0
    falhas = []

    for i, item in enumerate(dias, start=1):
        unidade = item["unidade"]
        dia_iso = item["dia"]
        token = LOJAS.get(unidade, {}).get("cardapio_web_token")

        if not token:
            falhas.append((unidade, dia_iso, "sem token configurado"))
            continue

        try:
            pedidos = buscar_pedidos_do_dia(token, date.fromisoformat(dia_iso))
            qtd = sum(1 for p in pedidos if p["status"] in STATUS_CONCLUIDOS)
            atualizar_pedidos_dia(unidade, dia_iso, qtd)
            sucesso += 1
            print(f"[{i}/{total}] {unidade} {dia_iso}: {qtd} pedidos")
        except Exception as erro:
            falhas.append((unidade, dia_iso, str(erro)))
            print(f"[{i}/{total}] {unidade} {dia_iso}: ERRO ({erro})")

        if i < total:
            time.sleep(ESPERA_ENTRE_DIAS_SEGUNDOS)

    print(f"\n=== RESUMO ===")
    print(f"Completados: {sucesso}/{total}")
    if falhas:
        print(f"Falhas ({len(falhas)}):")
        for unidade, dia_iso, motivo in falhas[:20]:
            print(f"  - {unidade} {dia_iso}: {motivo}")
        print("Rode o script de novo pra tentar essas novamente (só reprocessa dias com 0 pedidos).")


if __name__ == "__main__":
    limite = None
    if "--limite" in sys.argv:
        idx = sys.argv.index("--limite")
        limite = int(sys.argv[idx + 1])
    completar(limite=limite)
