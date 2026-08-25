"""
Integração real com a API da Cardápio Web (https://docs.cardapioweb.com/).

Endpoint de histórico NÃO retorna o valor do pedido — só id, status e canal.
Por isso, pra cada pedido é preciso uma segunda chamada no endpoint de
detalhes pra pegar o campo "total". Limites de requisição documentados:
- /orders/history: 5 requisições por minuto
- /orders/{id}: 300 requisições a cada 3 minutos (~100/min)
"""

import time
from datetime import datetime

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
            {
                "id": p["id"],
                "sales_channel": p["sales_channel"],
                "status": p["status"],
                "created_at": p["created_at"],
                "updated_at": p["updated_at"],
            }
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


def _itens_vendidos(detalhes):
    """Achata `detalhes["items"]` numa lista [{"nome", "quantidade"}] — usado
    pra estimar consumo de insumo (ficha técnica × vendas reais, ver seção
    6.6 da documentação). Combo não tem receita própria na Ficha Técnica (que
    é por prato), então é desmontado nos itens internos; a quantidade de
    cada um é MULTIPLICADA pela quantidade do combo em si (assumindo que a
    quantidade do item interno é "por combo" — não confirmado com exemplo
    real de combo com quantidade > 1, revisar se aparecer inconsistência)."""
    itens = []
    for item in detalhes.get("items") or []:
        quantidade = item.get("quantity") or 0
        if item.get("kind") == "combo":
            for interno in item.get("items") or []:
                itens.append({
                    "nome": interno.get("name", ""),
                    "quantidade": (interno.get("quantity") or 0) * quantidade,
                })
        else:
            itens.append({"nome": item.get("name", ""), "quantidade": quantidade})
    return [i for i in itens if i["nome"] and i["quantidade"]]


def _duracao_minutos(criado_em, atualizado_em):
    """Tempo do pedido inteiro, do recebido ao fechado/entregue — a API não
    marca separadamente quando a cozinha terminou de preparar, só quando o
    pedido é finalizado (que já inclui o tempo de entrega quando houver).
    Usado na tela de Preparo (ver seção 6.2 da documentação)."""
    inicio = datetime.fromisoformat(criado_em)
    fim = datetime.fromisoformat(atualizado_em)
    return max((fim - inicio).total_seconds() / 60, 0.0)


def buscar_resumo_do_dia(token, dia):
    """
    Retorna {"faturamento_dia": float, "quantidade_pedidos": int,
    "canais": [{"canal": str, "quantidade_pedidos": int, "faturamento": float}],
    "pedidos_detalhados": [{"id", "canal", "criado_em", "atualizado_em",
    "duracao_minutos", "itens": [{"nome", "quantidade"}]}]}
    """
    todos_pedidos = buscar_pedidos_do_dia(token, dia)
    pedidos = [p for p in todos_pedidos if p["status"] in STATUS_CONCLUIDOS]

    canais = {}
    faturamento_dia = 0.0
    pedidos_detalhados = []

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

        pedidos_detalhados.append({
            "id": pedido["id"],
            "canal": pedido["sales_channel"],
            "criado_em": pedido["created_at"],
            "atualizado_em": pedido["updated_at"],
            "duracao_minutos": _duracao_minutos(pedido["created_at"], pedido["updated_at"]),
            "itens": _itens_vendidos(detalhes),
        })

        time.sleep(ESPERA_ENTRE_CHAMADAS_SEGUNDOS)

    return {
        "faturamento_dia": faturamento_dia,
        "quantidade_pedidos": len(pedidos),
        "canais": list(canais.values()),
        "pedidos_detalhados": pedidos_detalhados,
    }
