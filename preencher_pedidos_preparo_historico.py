"""
Preenche o histórico de tempo de preparo (pedido_preparo) pros dias que já
têm faturamento sincronizado mas ainda não têm o detalhe de tempo por
pedido — necessário pra tela de Preparo mostrar dados de antes dessa
tabela existir.

Busca na API da Cardápio Web os pedidos concluídos de cada dia, junto com
os horários de criação/fechamento. Respeita o limite de 5 requisições por
minuto do endpoint /orders/history (uma chamada por dia por loja).

Idempotente: só processa dias que ainda não têm pedido_preparo, então pode
ser interrompido e rodado de novo sem duplicar trabalho.

Uso:
  python preencher_pedidos_preparo_historico.py             # roda tudo
  python preencher_pedidos_preparo_historico.py --limite 20 # só os 20 primeiros (teste)
"""

import sys
import time
from datetime import date, datetime

from config import LOJAS
from backend.cardapio_web import buscar_pedidos_do_dia, STATUS_CONCLUIDOS
from backend.armazenamento import inicializar_banco, dias_sem_pedidos_preparo, salvar_pedidos_do_dia

ESPERA_ENTRE_DIAS_SEGUNDOS = 13  # abaixo do limite de 5 req/min do /orders/history

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def _duracao_minutos(criado_em, atualizado_em):
    inicio = datetime.fromisoformat(criado_em)
    fim = datetime.fromisoformat(atualizado_em)
    return max((fim - inicio).total_seconds() / 60, 0.0)


def preencher(limite=None):
    dias = dias_sem_pedidos_preparo()
    if limite:
        dias = dias[:limite]

    total = len(dias)
    print(f"{total} dias para preencher.\n")

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
            concluidos = [p for p in pedidos if p["status"] in STATUS_CONCLUIDOS]
            detalhados = [
                {
                    "id": p["id"],
                    "canal": p["sales_channel"],
                    "criado_em": p["created_at"],
                    "atualizado_em": p["updated_at"],
                    "duracao_minutos": _duracao_minutos(p["created_at"], p["updated_at"]),
                }
                for p in concluidos
            ]
            salvar_pedidos_do_dia(unidade, dia_iso, detalhados)
            sucesso += 1
            print(f"[{i}/{total}] {unidade} {dia_iso}: {len(detalhados)} pedidos")
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
        print("Rode o script de novo pra tentar essas novamente (só reprocessa dias sem pedido_preparo).")


if __name__ == "__main__":
    inicializar_banco()

    limite = None
    if "--limite" in sys.argv:
        idx = sys.argv.index("--limite")
        limite = int(sys.argv[idx + 1])

    preencher(limite=limite)
