# -*- coding: utf-8 -*-
"""O detalhe de pedido já fechado não é buscado duas vezes.

O histórico da Cardápio Web não traz o valor do pedido: pra cada um é
preciso uma segunda chamada em /orders/{id}, com 0,65s de espera entre
elas. Só que o dia de HOJE é sincronizado de 15 em 15 minutos (96 vezes
por dia) e a rotina das 6h reconfere os 7 dias anteriores — então o mesmo
pedido, já fechado, era rebuscado dezenas de vezes por dia.

O que torna o cache seguro é o `updated_at` que a própria CW devolve no
histórico. Pedido reaberto volta com updated_at novo e o guardado deixa de
valer. Sem isso, cache viraria faturamento errado — o pior lugar possível
pra errar —, e é justamente esse caso que
DIAS_RECONFERIDOS_NA_SINCRONIZACAO_DIARIA existe pra pegar.
"""
from _base import Mundo, conferir, secao, terminar

mundo = Mundo()

from backend import cardapio_web  # noqa: E402
from backend.armazenamento import (  # noqa: E402
    detalhes_cw_guardados,
    guardar_detalhes_cw,
)

LOJA = mundo.LOJA_DA_EQUIPE

# --- a Cardápio Web de mentira ---------------------------------------
historico = [
    {"id": 101, "sales_channel": "ifood", "status": "closed",
     "created_at": "2026-09-30T19:00:00-03:00", "updated_at": "2026-09-30T19:40:00-03:00"},
    {"id": 102, "sales_channel": "cardapio_web", "status": "delivered",
     "created_at": "2026-09-30T20:00:00-03:00", "updated_at": "2026-09-30T20:30:00-03:00"},
    {"id": 103, "sales_channel": "cardapio_web", "status": "confirmed",
     "created_at": "2026-09-30T21:00:00-03:00", "updated_at": "2026-09-30T21:05:00-03:00"},
]
detalhes = {
    101: {"total": "80.00", "order_type": "delivery", "discounts": [],
          "items": [{"kind": "regular_item", "name": "X-Burger", "quantity": 2}]},
    102: {"total": "45.50", "order_type": "takeout", "discounts": [],
          "items": [{"kind": "regular_item", "name": "Açaí 500ml", "quantity": 1}]},
}
chamadas = []

cardapio_web.buscar_pedidos_do_dia = lambda token, dia, hora_virada="00:00": list(historico)
cardapio_web.buscar_detalhes_pedido = lambda token, pid: (chamadas.append(pid)
                                                          or dict(detalhes[pid]))
cardapio_web.time.sleep = lambda s: None       # o teste não espera limite de API


def sincronizar():
    return cardapio_web.buscar_resumo_do_dia(
        "token", "2026-09-30",
        buscar_guardados=lambda ids: detalhes_cw_guardados(LOJA, ids))


secao("1) a primeira vez busca o detalhe de cada pedido concluído")
chamadas.clear()
r1 = sincronizar()
# O 103 está em "confirmed": nem entra na conta, não é venda concluída.
conferir("buscou só os dois concluídos", sorted(chamadas), [101, 102])
conferir("buscados", r1["detalhes_buscados"], 2)
conferir("reaproveitados", r1["detalhes_reaproveitados"], 0)
conferir("faturamento", round(r1["faturamento_dia"], 2), 125.50)
guardar_detalhes_cw(LOJA, r1["pedidos_detalhados"])

secao("2) a segunda não busca nada, e o número é o mesmo")
chamadas.clear()
r2 = sincronizar()
conferir("nenhuma chamada na API", chamadas, [])
conferir("tudo reaproveitado", r2["detalhes_reaproveitados"], 2)
conferir("faturamento idêntico", r2["faturamento_dia"], r1["faturamento_dia"])
conferir("mesmos canais", sorted((c["canal"], round(c["faturamento"], 2)) for c in r2["canais"]),
         sorted((c["canal"], round(c["faturamento"], 2)) for c in r1["canais"]))
conferir("e os itens vieram junto",
         [p["itens"] for p in r2["pedidos_detalhados"]],
         [p["itens"] for p in r1["pedidos_detalhados"]])

secao("3) pedido reaberto volta a ser buscado")
# É o caso real: um pedido fechado pode ser reaberto do lado da CW e voltar
# com outro valor. Ele volta com updated_at novo.
historico[0]["updated_at"] = "2026-10-01T10:00:00-03:00"
detalhes[101]["total"] = "95.00"
chamadas.clear()
r3 = sincronizar()
conferir("buscou só o que mudou", chamadas, [101])
conferir("o outro continuou guardado", r3["detalhes_reaproveitados"], 1)
conferir("e o faturamento acompanhou", round(r3["faturamento_dia"], 2), 140.50)
guardar_detalhes_cw(LOJA, r3["pedidos_detalhados"])

secao("4) o desconto do iFood continua entrando")
# O 101 é ifood: o desconto patrocinado pelo iFood soma no faturamento. Se
# o cache guardasse o total cru, esse dinheiro sumiria na segunda rodada.
detalhes[101]["discounts"] = [{"total": 10.0, "sponsorship": "ifood"}]
historico[0]["updated_at"] = "2026-10-01T11:00:00-03:00"
chamadas.clear()
r4 = sincronizar()
conferir("com desconto iFood somado", round(r4["faturamento_dia"], 2), 150.50)
guardar_detalhes_cw(LOJA, r4["pedidos_detalhados"])
chamadas.clear()
r5 = sincronizar()
conferir("e o guardado traz o mesmo valor", round(r5["faturamento_dia"], 2), 150.50)
conferir("sem chamar a API", chamadas, [])

secao("5) sem cache nenhum, funciona como sempre funcionou")
chamadas.clear()
r6 = cardapio_web.buscar_resumo_do_dia("token", "2026-09-30")
conferir("busca tudo", sorted(chamadas), [101, 102])
conferir("mesmo faturamento", round(r6["faturamento_dia"], 2), 150.50)

secao("6) banco com problema não derruba a sincronização")
chamadas.clear()


def exploda(ids):
    raise RuntimeError("banco fora do ar")


r7 = cardapio_web.buscar_resumo_do_dia("token", "2026-09-30", buscar_guardados=exploda)
conferir("caiu pra API", sorted(chamadas), [101, 102])
conferir("e o número saiu certo", round(r7["faturamento_dia"], 2), 150.50)

terminar()
