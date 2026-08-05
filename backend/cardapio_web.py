"""
Integração real com a API da Cardápio Web (https://docs.cardapioweb.com/).

Endpoint de histórico NÃO retorna o valor do pedido — só id, status e canal.
Por isso, pra cada pedido é preciso uma segunda chamada no endpoint de
detalhes pra pegar o campo "total". Limites de requisição documentados:
- /orders/history: 5 requisições por minuto
- /orders/{id}: 300 requisições a cada 3 minutos (~100/min)
"""

import time
import requests

BASE_URL = "https://integracao.cardapioweb.com/api/partner/v1"

# Fica abaixo do limite de 100 req/min do endpoint de detalhes do pedido.
ESPERA_ENTRE_CHAMADAS_SEGUNDOS = 0.65

# Só esses status representam uma venda de fato concluída. Pedidos em
# andamento (confirmed, ready, released, waiting_to_catch, etc.) ainda podem
# ser cancelados ou simplesmente não terminaram — não devem contar no
# faturamento do dia. "closed" sozinho (versão antiga) deixava de fora
# pedidos entregues nunca formalmente "fechados"; contar tudo que não é
# cancelado/pendente (versão seguinte) contava pedidos ainda em andamento.
# O correto é essa lista fechada de status realmente finalizados.
STATUS_CONCLUIDOS = {"closed", "delivered"}


def _formatar_data_hora(dia, momento):
    hora = "00:00:00" if momento == "inicio" else "23:59:59"
    return f"{dia.strftime('%Y-%m-%d')}T{hora}-03:00"


def buscar_pedidos_do_dia(token, dia):
    """Retorna lista de {"id": int, "sales_channel": str, "status": str} pra
    um dia, com TODOS os status (filtragem de cancelados fica por conta de
    quem consome, em buscar_resumo_do_dia)."""
    pedidos = []
    pagina = 1
    total_paginas = 1

    while pagina <= total_paginas:
        params = {
            "start_date": _formatar_data_hora(dia, "inicio"),
            "end_date": _formatar_data_hora(dia, "fim"),
            "page": pagina,
            "per_page": 100,
        }
        resposta = requests.get(
            f"{BASE_URL}/orders/history",
            headers={"X-API-KEY": token},
            params=params,
            timeout=15,
        )

        if not resposta.ok:
            raise RuntimeError(
                f"Cardápio Web: falha ao buscar histórico (status {resposta.status_code})"
            )

        dados = resposta.json()
        pedidos.extend(
            {"id": p["id"], "sales_channel": p["sales_channel"], "status": p["status"]}
            for p in dados.get("orders", [])
        )
        total_paginas = dados.get("pagination", {}).get("total_pages", 1)
        pagina += 1

    return pedidos


def buscar_detalhes_pedido(token, pedido_id):
    resposta = requests.get(
        f"{BASE_URL}/orders/{pedido_id}",
        headers={"X-API-KEY": token},
        timeout=15,
    )
    if not resposta.ok:
        raise RuntimeError(
            f"Cardápio Web: falha ao buscar pedido {pedido_id} (status {resposta.status_code})"
        )
    return resposta.json()


def _total_com_desconto_ifood(detalhes, sales_channel):
    total = float(detalhes["total"])
    if sales_channel != "ifood":
        return total

    # A Cardápio Web mostra "Descontos iFood" separado do total do pedido —
    # é a parte do desconto que o iFood reembolsa ao restaurante (promoções
    # patrocinadas pelo iFood, não pela loja), então entra como faturamento
    # a mais nesse canal.
    desconto_ifood = sum(
        d.get("total") or 0.0
        for d in (detalhes.get("discounts") or [])
        if d.get("sponsorship") == "ifood"
    )
    return total + desconto_ifood


def buscar_resumo_do_dia(token, dia):
    """
    Retorna {"faturamento_dia": float, "quantidade_pedidos": int,
    "canais": [{"canal": str, "quantidade_pedidos": int, "faturamento": float}]}
    """
    todos_pedidos = buscar_pedidos_do_dia(token, dia)
    pedidos = [p for p in todos_pedidos if p["status"] in STATUS_CONCLUIDOS]

    canais = {}
    faturamento_dia = 0.0

    for pedido in pedidos:
        detalhes = buscar_detalhes_pedido(token, pedido["id"])
        total = _total_com_desconto_ifood(detalhes, pedido["sales_channel"])
        faturamento_dia += total

        canal = canais.setdefault(
            pedido["sales_channel"],
            {"canal": pedido["sales_channel"], "quantidade_pedidos": 0, "faturamento": 0.0},
        )
        canal["quantidade_pedidos"] += 1
        canal["faturamento"] += total

        time.sleep(ESPERA_ENTRE_CHAMADAS_SEGUNDOS)

    return {
        "faturamento_dia": faturamento_dia,
        "quantidade_pedidos": len(pedidos),
        "canais": list(canais.values()),
    }
