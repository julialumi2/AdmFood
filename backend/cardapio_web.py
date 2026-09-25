"""
Integração real com a API da Cardápio Web (https://docs.cardapioweb.com/).

Endpoint de histórico NÃO retorna o valor do pedido — só id, status e canal.
Por isso, pra cada pedido é preciso uma segunda chamada no endpoint de
detalhes pra pegar o campo "total". Limites de requisição documentados:
- /orders/history: 5 requisições por minuto
- /orders/{id}: 300 requisições a cada 3 minutos (~100/min)
"""

import re
import time
from datetime import datetime, timedelta

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


def _formatar_data_hora(dia, momento, hora_virada="00:00"):
    """As duas pontas da janela do dia OPERACIONAL da loja (25/09).

    `hora_virada` é a hora em que o dia vira pra essa loja: antes dela, a
    venda ainda é do dia anterior. Artesanos e Tradiças ficam abertas até
    2h ou 4h, e essas vendas caíam no dia seguinte.

    Com "00:00" dá exatamente o que dava antes: 00:00:00 até 23:59:59.
    Com "05:00", o dia começa às 05:00 e termina 04:59:59 do dia seguinte.
    """
    h, m = (int(p) for p in hora_virada.split(":"))
    inicio = datetime(dia.year, dia.month, dia.day, h, m)
    momento_exato = inicio if momento == "inicio" else inicio + timedelta(days=1) - timedelta(seconds=1)
    return f"{momento_exato.strftime('%Y-%m-%dT%H:%M:%S')}-03:00"


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


def buscar_pedidos_do_dia(token, dia, hora_virada="00:00"):
    """Retorna lista de {"id": int, "sales_channel": str, "status": str} pra
    um dia, com TODOS os status (filtragem de cancelados fica por conta de
    quem consome, em buscar_resumo_do_dia). `hora_virada`: ver
    _formatar_data_hora."""
    pedidos = []
    pagina = 1
    total_paginas = 1

    while pagina <= total_paginas:
        params = {
            "start_date": _formatar_data_hora(dia, "inicio", hora_virada),
            "end_date": _formatar_data_hora(dia, "fim", hora_virada),
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


# Tamanho do copo no Açaí: vem como opção ("Tamanho: 330ml"; nos combos sem
# nome de grupo) ou colado no nome ("NaLata Paçoca - 500ML"). O cadastro
# chama o produto "NaLata Paçoca 500ml", então o tamanho vira parte do nome.
# Só volume em ml conta como tamanho — "Tamanho: Média" de uma batata não
# mexe em nome nenhum.
_TAMANHO = re.compile(r"^\d+\s*ml$", re.IGNORECASE)
_TAMANHO_NO_NOME = re.compile(r"^(.*?)\s+-\s+(\d+\s*ml)$", re.IGNORECASE)
# "NaLata 330ml + 3 complementos" é UM produto, não um combo "Lanche + Extra".
_MONTE_O_SEU = re.compile(r"\+\s*\d+\s*complementos?\b", re.IGNORECASE)


_TAMANHO_EM_QUALQUER_PARTE = re.compile(r"\d+\s*ml\b", re.IGNORECASE)

# Batata do combo (pedido da Julia, 2026-09-15): o combo desconta o lanche e
# a batata que vem junto — "Tasty + Batata + Bebida" é 1 batata, "Combo
# Casal (01 Clássico+01 Bacon+02 batatas...)" são 2. Entra como uma linha
# "Batata Individual" (item do cardápio com ficha por loja). Bebida e
# maionese continuam de fora: o nome não diz qual é.
BATATA_DO_COMBO = "Batata Individual"
_BATATAS_COM_QUANTIDADE = re.compile(r"(\d+)\s*batatas?\b", re.IGNORECASE)
_BATATA = re.compile(r"\bbatatas?\b", re.IGNORECASE)


def _grupo_de_lanche(grupo):
    """Grupo de opções em que cada opção escolhida é um lanche vendido:
    "SEUS BURGERS" (Combo Casal do Artesanos) e "Escolha seus 3 Dogs com
    20%OFF" (combos das Tradiças, 2026-09-15 — sem isso o combo ficava
    como produto não reconhecido e os dogs escolhidos não saíam do estoque).
    "Quer Purê nos 3 dogs?" não é escolha de lanche."""
    grupo = (grupo or "").lower()
    return "burger" in grupo or ("dog" in grupo and "escolha" in grupo)


def _eh_bebida_escolhida(opcao):
    """Bebida escolhida dentro do combo ("E uma bebida, vai?"): vira item
    vendido, menos a resposta "Não, obrigado!"."""
    grupo = (opcao.get("option_group_name") or "").lower()
    nome = (opcao.get("name") or "").strip().lower()
    return "bebida" in grupo and bool(nome) and not nome.startswith(("não", "nao"))


def _batatas_do_combo(texto):
    """Quantas batatas o texto do combo menciona: "02 batatas" = 2, "Batata" = 1, nenhuma = 0."""
    quantidade = _BATATAS_COM_QUANTIDADE.search(texto or "")
    if quantidade:
        return int(quantidade.group(1))
    return 1 if _BATATA.search(texto or "") else 0


def _eh_tamanho(opcao):
    """Opção de tamanho nunca é complemento: grupo "Tamanho" (qualquer valor,
    "330ml" ou "Média") ou, sem grupo — como vem nos combos —, um volume."""
    nome = (opcao.get("name") or "").strip()
    grupo = (opcao.get("option_group_name") or "").strip().lower()
    return grupo == "tamanho" or (not grupo and bool(_TAMANHO.match(nome)))


def _tamanho_da_opcao(opcao):
    """O volume ("330ml") que completa o nome do produto, ou None."""
    nome = (opcao.get("name") or "").strip()
    return nome if _eh_tamanho(opcao) and _TAMANHO.match(nome) else None


def _achatar_combos(itens, multiplicador=1):
    """Item com `kind == "combo"` traz os produtos de verdade em `items` —
    visto ao vivo no Açaí em 2026-09-11: "Combo Filminho NaLata - 2 x 500ml"
    vem com dois "NaLata 500ml + 3 complementos", cada um com os próprios
    toppings. Desce até eles, multiplicando pela quantidade do combo."""
    for item in itens or []:
        quantidade = (item.get("quantity") or 0) * multiplicador
        if item.get("items"):
            yield from _achatar_combos(item["items"], quantidade)
        else:
            yield item, quantidade


def _itens_vendidos(detalhes):
    """Achata `detalhes["items"]` numa lista [{"nome", "quantidade"}] — usado
    pra estimar consumo de insumo (ficha técnica × vendas reais, seção 6.6) e
    pra baixa automática de estoque (Etapa 0 do motor de compra, seção 6.11).

    Investigado ao vivo em 2026-09-08 (a Julia pediu pra "combo" não
    precisar de Ficha Técnica própria, só descontar o(s) lanche(s) de
    dentro): `kind == "combo"` NUNCA aparece na prática pra essa loja — todo
    combo/kit vem como `kind == "regular_item"` só mesmo, e existem 3
    formatos reais diferentes, tratados nessa ordem:

    1. Tem `options` com um grupo de escolha de lanche (ver
       _grupo_de_lanche: "SEUS BURGERS" no COMBO CASAL, "Escolha seus 3
       Dogs" nos combos das Tradiças) — cada opção desse grupo É um lanche
       vendido, com a quantidade certa já vindo separada (dá pra ter 2
       lanches diferentes num combo pra duas pessoas). A bebida escolhida
       no combo também vira item (desde 2026-09-15); a batata entra pelo
       nome do combo (_batatas_do_combo); maionese e o resto das opções
       ficam de fora.
    2. Sem esse grupo, mas o nome do item tem um "Lanche + Extra + Extra"
       colado (ex: "Tasty + Batata + Bebida + Maionese") — o lanche é a
       parte antes do primeiro " + ".
    3. Nem uma coisa nem outra (ex: "Combo de sexta 99 Food - 2 smash's
       tradicionais", sem `options` e sem "+" no nome) — não dá pra
       decompor sozinho; cai como produto pendente pro vínculo manual
       resolver (que aceita "quantos lanches" além de "qual lanche").

    Complementos (2026-09-10, Açaí Na Lata): no "monte o seu" a receita é o
    que o cliente escolhe, então cada opção do item — "ESCOLHA 3 Toppings",
    "Escolha até 5 adicionais", os pagos de "Toppings EXTRAS", as frutas do
    Frutas ao Creme — vai em `complementos`, com a quantidade já
    multiplicada pela do item (dá pra escolher o mesmo duas vezes). A opção
    de tamanho não é complemento: ela completa o nome do produto. No
    formato 1 as outras opções continuam de fora, como antes.

    `kind == "combo"` apareceu no Açaí (2026-09-11) com os produtos dentro
    de `items` — `_achatar_combos` entrega cada um deles aqui, como se
    tivessem sido vendidos soltos."""
    itens = []
    for item, quantidade in _achatar_combos(detalhes.get("items")):
        if not quantidade:
            continue
        opcoes = item.get("options") or []

        opcoes_lanche = [
            opcao for opcao in opcoes
            if _grupo_de_lanche(opcao.get("option_group_name"))
        ]
        if opcoes_lanche:
            for opcao in opcoes_lanche + [o for o in opcoes if _eh_bebida_escolhida(o)]:
                itens.append({
                    "nome": opcao.get("name", ""),
                    "quantidade": (opcao.get("quantity") or 0) * quantidade,
                    "complementos": [],
                })
            # O Combo Casal leva 2 batatas mesmo quando o nome não diz
            # (composição combinada com a Julia em 2026-09-14).
            nome_combo = item.get("name") or ""
            batatas = _batatas_do_combo(nome_combo) or (2 if "casal" in nome_combo.lower() else 0)
            if batatas:
                itens.append({"nome": BATATA_DO_COMBO, "quantidade": batatas * quantidade, "complementos": []})
            continue

        nome = (item.get("name") or "").strip()
        batatas = 0
        tamanho = next((t for t in map(_tamanho_da_opcao, opcoes) if t), None)
        no_nome = _TAMANHO_NO_NOME.match(nome)
        if no_nome:
            nome, tamanho = no_nome.group(1), no_nome.group(2)
        # Nome que já traz o tamanho ("Combo Filhinho - 2 X 500ml") fica como
        # está — o "500ml" solto do combo é de cada copo, não do nome.
        if tamanho and not _TAMANHO_EM_QUALQUER_PARTE.search(nome):
            # "330 ml" e "330ml" são o mesmo copo; o cadastro escreve junto.
            nome = f"{nome} {re.sub(r'\s+', '', tamanho)}"
        elif not tamanho and " + " in nome and not _MONTE_O_SEU.search(nome):
            nome, resto = nome.split(" + ", 1)
            batatas = _batatas_do_combo(resto)

        complementos = [
            {
                "nome": (opcao.get("name") or "").strip(),
                "quantidade": (opcao.get("quantity") or 0) * quantidade,
                "grupo": opcao.get("option_group_name"),
                "preco": opcao.get("unit_price") or 0.0,
            }
            for opcao in opcoes
            if not _eh_tamanho(opcao)
        ]
        itens.append({
            "nome": nome,
            "quantidade": quantidade,
            "complementos": [c for c in complementos if c["nome"] and c["quantidade"]],
        })
        if batatas:
            itens.append({"nome": BATATA_DO_COMBO, "quantidade": batatas * quantidade, "complementos": []})
    return [i for i in itens if i["nome"] and i["quantidade"]]


def _duracao_minutos(criado_em, atualizado_em):
    """Tempo do pedido inteiro, do recebido ao fechado/entregue — a API não
    marca separadamente quando a cozinha terminou de preparar, só quando o
    pedido é finalizado (que já inclui o tempo de entrega quando houver).
    Usado na tela de Preparo (ver seção 6.2 da documentação)."""
    inicio = datetime.fromisoformat(criado_em)
    fim = datetime.fromisoformat(atualizado_em)
    return max((fim - inicio).total_seconds() / 60, 0.0)


def buscar_resumo_do_dia(token, dia, hora_virada="00:00"):
    """
    Retorna {"faturamento_dia": float, "quantidade_pedidos": int,
    "canais": [{"canal": str, "quantidade_pedidos": int, "faturamento": float}],
    "pedidos_detalhados": [{"id", "canal", "tipo", "criado_em", "atualizado_em",
    "duracao_minutos", "itens": [{"nome", "quantidade"}]}]}

    "tipo" é o order_type da Cardápio Web (delivery, takeout, onsite,
    closed_table): a embalagem pra viagem só desconta em delivery e retirada.
    """
    todos_pedidos = buscar_pedidos_do_dia(token, dia, hora_virada)
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
            "tipo": detalhes.get("order_type"),
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
