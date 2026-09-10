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
# Sincronizar um dia só (o que roda de 15 em 15 min) cabe folgado aqui; carga
# de histórico longa deve afrouxar isso — ver `sincronizar_periodo.py`.
ESPERA_ENTRE_CHAMADAS_SEGUNDOS = 0.65

# O histórico tem limite próprio e bem mais apertado (5/min). Um dia com
# poucos pedidos termina rápido demais e encostaria nesse teto ao emendar o
# dia seguinte, então a espera é cobrada aqui, não no chamador.
ESPERA_ENTRE_HISTORICOS_SEGUNDOS = 13

# Quantas vezes repetir uma chamada que voltou 429. Sem isso, estourar o
# limite uma vez derruba tudo em cascata: a tentativa seguinte cai no mesmo
# minuto cheio e falha igual. Foi o que aconteceu num backfill de 90 dias em
# 09/09/2026 — 1 dia gravado e 76 falhas seguidas. O padrão é curto de
# propósito (a sincronização automática não pode ficar pendurada); scripts de
# carga aumentam esse número, porque lá esperar é melhor que perder o dia.
TENTATIVAS_EM_429 = 2
ESPERA_INICIAL_EM_429_SEGUNDOS = 15
ESPERA_MAXIMA_EM_429_SEGUNDOS = 120

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


_ultimo_historico = 0.0


def _respeitar_janela_historico():
    """Segura a chamada até completar a janela do /orders/history (5/min).
    Um dia com poucos pedidos termina em segundos e emendaria no dia
    seguinte dentro do mesmo minuto — a espera é cobrada aqui pra que
    nenhum chamador precise saber desse limite."""
    global _ultimo_historico
    faltando = ESPERA_ENTRE_HISTORICOS_SEGUNDOS - (time.monotonic() - _ultimo_historico)
    if _ultimo_historico and faltando > 0:
        time.sleep(faltando)
    _ultimo_historico = time.monotonic()


def _espera_apos_429(resposta, tentativa):
    """A API manda `Retry-After` quando sabe o tempo exato; sem ele, dobra a
    espera a cada tentativa até o teto."""
    cabecalho = resposta.headers.get("Retry-After")
    if cabecalho:
        try:
            return min(float(cabecalho), ESPERA_MAXIMA_EM_429_SEGUNDOS)
        except ValueError:
            pass
    return min(ESPERA_INICIAL_EM_429_SEGUNDOS * (2 ** tentativa), ESPERA_MAXIMA_EM_429_SEGUNDOS)


def _buscar(url, token, descricao, params=None):
    """GET com repetição em 429. Qualquer outro erro sobe na hora — só o
    limite de requisição melhora com espera."""
    for tentativa in range(TENTATIVAS_EM_429 + 1):
        resposta = requests.get(
            url, headers={"X-API-KEY": token}, params=params, timeout=15
        )
        if resposta.status_code != 429 or tentativa == TENTATIVAS_EM_429:
            break
        time.sleep(_espera_apos_429(resposta, tentativa))

    if not resposta.ok:
        raise RuntimeError(
            f"Cardápio Web: falha ao buscar {descricao} (status {resposta.status_code})"
        )
    return resposta.json()


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
        _respeitar_janela_historico()
        dados = _buscar(f"{BASE_URL}/orders/history", token, "histórico", params)
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
    return _buscar(f"{BASE_URL}/orders/{pedido_id}", token, f"pedido {pedido_id}")


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
    pra estimar consumo de insumo (ficha técnica × vendas reais, seção 6.6) e
    pra baixa automática de estoque (Etapa 0 do motor de compra, seção 6.11).

    Investigado ao vivo em 2026-09-08 (a Julia pediu pra "combo" não
    precisar de Ficha Técnica própria, só descontar o(s) lanche(s) de
    dentro): `kind == "combo"` NUNCA aparece na prática pra essa loja — todo
    combo/kit vem como `kind == "regular_item"` só mesmo, e existem 3
    formatos reais diferentes, tratados nessa ordem:

    1. Tem `options` com um grupo de escolha de lanche (nome do grupo
       contém "burger", ex: "SEUS BURGERS" no COMBO CASAL) — cada opção
       desse grupo É um lanche vendido, com a quantidade certa já vindo
       separada (dá pra ter 2 lanches diferentes num combo pra duas
       pessoas). Não entra bebida/batata/maionese aqui de propósito —
       complemento escolhido fica fora desta entrega (ver seção 6.11).
    2. Sem esse grupo, mas o nome do item tem um "Lanche + Extra + Extra"
       colado (ex: "Tasty + Batata + Bebida + Maionese") — o lanche é a
       parte antes do primeiro " + ".
    3. Nem uma coisa nem outra (ex: "Combo de sexta 99 Food - 2 smash's
       tradicionais", sem `options` e sem "+" no nome) — não dá pra
       decompor sozinho; cai como produto pendente pro vínculo manual
       resolver (que aceita "quantos lanches" além de "qual lanche")."""
    itens = []
    for item in detalhes.get("items") or []:
        quantidade = item.get("quantity") or 0
        if not quantidade:
            continue

        opcoes_lanche = [
            opcao for opcao in (item.get("options") or [])
            if "burger" in (opcao.get("option_group_name") or "").lower()
        ]
        if opcoes_lanche:
            for opcao in opcoes_lanche:
                itens.append({
                    "nome": opcao.get("name", ""),
                    "quantidade": (opcao.get("quantity") or 0) * quantidade,
                })
            continue

        nome = item.get("name") or ""
        if " + " in nome:
            itens.append({"nome": nome.split(" + ", 1)[0], "quantidade": quantidade})
            continue

        itens.append({"nome": nome, "quantidade": quantidade})
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
