# -*- coding: utf-8 -*-
"""Reservas de mesa.

O ponto que mais importa aqui é o dia operacional: reserva de sábado
01:00 numa loja que fecha às 4h pertence ao turno de SEXTA. Se isso
estiver errado, o aviso das 15h de sexta não mostra a mesa da 1h da
manhã — justamente a que precisa ser preparada.

Cobre também o escopo por loja, que em reserva não é detalhe de tela:
tem nome e telefone de cliente, e dado de uma loja não pode vazar pra
outra.
"""
from datetime import date, datetime, timedelta

from _base import Mundo, conferir, secao, terminar

mundo = Mundo()
admin = mundo.cliente(mundo.ADMIN)
gerente = mundo.cliente(mundo.GERENTE)
operacao = mundo.cliente(mundo.OPERACAO)

MINHA = mundo.LOJA_DA_EQUIPE
OUTRA = next(l for l in mundo.LOJAS if l != MINHA)

from backend.armazenamento import (  # noqa: E402
    definir_hora_virada,
    dia_operacional_de,
    marcar_reservas_avisadas,
    reservas_por_avisar,
)

secao("1) o dia operacional é o que manda")
# A loja fecha às 4h30: antes disso, ainda é o turno da noite anterior.
conferir("sábado 01:00 pertence a sexta",
         dia_operacional_de("2026-10-03T01:00", "04:30"), "2026-10-02")
conferir("sábado 04:29 ainda é sexta",
         dia_operacional_de("2026-10-03T04:29", "04:30"), "2026-10-02")
conferir("sábado 04:30 já é sábado",
         dia_operacional_de("2026-10-03T04:30", "04:30"), "2026-10-03")
conferir("sábado 20:00 é sábado",
         dia_operacional_de("2026-10-03T20:00", "04:30"), "2026-10-03")
conferir("sem virada (00:00), a data é a própria",
         dia_operacional_de("2026-10-03T01:00", "00:00"), "2026-10-03")

secao("2) a reserva guarda o turno, não só a data")
definir_hora_virada(MINHA, "04:30", "teste")
r = admin.post("/api/reservas", json={
    "loja": MINHA, "nome": "Cliente da Madrugada", "pessoas": 4,
    "quando": "2026-10-03T01:00", "telefone": "11999990000",
})
conferir("criou", r.status_code, 201)
madrugada = r.get_json()["reserva"]
conferir("caiu no turno de sexta", madrugada["dia_operacional"], "2026-10-02")
conferir("mas a hora marcada é a que o cliente disse", madrugada["quando"], "2026-10-03T01:00")
conferir("status padrão", madrugada["status"], "confirmada")
conferir("origem padrão", madrugada["origem"], "sistema")

secao("3) a listagem do turno traz a mesa da madrugada")
d = admin.get("/api/reservas?de=2026-10-02&ate=2026-10-02").get_json()
conferir("aparece na sexta", [x["nome"] for x in d["reservas"]], ["Cliente da Madrugada"])
conferir("e soma as pessoas", d["pessoas"], 4)
vazio = admin.get("/api/reservas?de=2026-10-03&ate=2026-10-03").get_json()
conferir("não aparece no sábado", vazio["reservas"], [])

secao("4) remarcar recalcula o turno")
r = admin.put("/api/reservas/%d" % madrugada["id"], json={"quando": "2026-10-03T20:00"})
conferir("remarcou", r.status_code, 200)
conferir("agora é sábado", r.get_json()["reserva"]["dia_operacional"], "2026-10-03")

secao("5) o que o sistema recusa")
casos = [
    ({"loja": MINHA, "nome": "", "pessoas": 2, "quando": "2026-10-03T20:00"}, "sem nome"),
    ({"loja": MINHA, "nome": "X", "pessoas": 0, "quando": "2026-10-03T20:00"}, "zero pessoas"),
    ({"loja": MINHA, "nome": "X", "pessoas": 9999, "quando": "2026-10-03T20:00"}, "pessoas demais"),
    ({"loja": MINHA, "nome": "X", "pessoas": 2, "quando": "amanhã à noite"}, "data em texto"),
    ({"loja": "Loja Que Não Existe", "nome": "X", "pessoas": 2, "quando": "2026-10-03T20:00"}, "loja inválida"),
    ({"loja": MINHA, "nome": "X", "pessoas": 2, "quando": "2026-10-03T20:00", "origem": "telepatia"}, "origem inválida"),
]
for corpo, rotulo in casos:
    conferir(rotulo + " é recusado", admin.post("/api/reservas", json=corpo).status_code, 400)

secao("6) cancelar é status, não apagar")
alvo = admin.post("/api/reservas", json={
    "loja": MINHA, "nome": "Vai desmarcar", "pessoas": 2, "quando": "2026-10-03T21:00"}).get_json()["reserva"]
admin.put("/api/reservas/%d" % alvo["id"], json={"status": "cancelada"})
listados = admin.get("/api/reservas?de=2026-10-03&ate=2026-10-03").get_json()["reservas"]
conferir("some da lista do dia", [x["nome"] for x in listados], ["Cliente da Madrugada"])
com_cancelada = admin.get("/api/reservas?de=2026-10-03&ate=2026-10-03&status=cancelada").get_json()["reservas"]
conferir("mas continua no banco", [x["nome"] for x in com_cancelada], ["Vai desmarcar"])
conferir("não existe DELETE", admin.delete("/api/reservas/%d" % alvo["id"]).status_code, 405)

secao("7) escopo por loja — reserva tem nome e telefone de cliente")
da_outra = admin.post("/api/reservas", json={
    "loja": OUTRA, "nome": "Cliente da outra loja", "pessoas": 2,
    "quando": "2026-10-03T20:00", "telefone": "11988887777"}).get_json()["reserva"]

d = gerente.get("/api/reservas?de=2026-10-03&ate=2026-10-03").get_json()
conferir("o gerente não vê a reserva da outra loja",
         [x["nome"] for x in d["reservas"]], ["Cliente da Madrugada"])
d = gerente.get("/api/reservas?de=2026-10-03&ate=2026-10-03&loja=" + OUTRA.replace(" ", "%20")).get_json()
conferir("nem pedindo a outra loja de propósito",
         [x["nome"] for x in d["reservas"]], ["Cliente da Madrugada"])
conferir("e não consegue abrir pelo id",
         gerente.put("/api/reservas/%d" % da_outra["id"], json={"pessoas": 99}).status_code, 404)
conferir("o admin vê as duas",
         len(admin.get("/api/reservas?de=2026-10-03&ate=2026-10-03").get_json()["reservas"]), 2)

secao("8) a operação também usa — é ela que atende o telefone")
r = operacao.post("/api/reservas", json={
    "loja": MINHA, "nome": "Anotada pelo salão", "pessoas": 6,
    "quando": "2026-10-03T19:00", "origem": "telefone"})
conferir("a operação cria", r.status_code, 201)
conferir("e a reserva nasce na loja dela", r.get_json()["reserva"]["loja"], MINHA)

secao("9) a fila de avisos não repete")
por_avisar = reservas_por_avisar([MINHA])
conferir("tem reserva esperando aviso", len(por_avisar) > 0, True)
conferir("cancelada não entra na fila",
         [x["nome"] for x in por_avisar if x["nome"] == "Vai desmarcar"], [])
quantas = marcar_reservas_avisadas([x["id"] for x in por_avisar])
conferir("marcou todas", quantas, len(por_avisar))
conferir("e a fila esvaziou", reservas_por_avisar([MINHA]), [])

secao("10) sem período, traz o turno de agora")
agora = datetime.now()
d = admin.get("/api/reservas").get_json()
esperado = dia_operacional_de(agora.isoformat(timespec="minutes"), "04:30")
conferir("o período começa no turno de hoje", d["de"] <= esperado <= d["ate"], True)

terminar()
