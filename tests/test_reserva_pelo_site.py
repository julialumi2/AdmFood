# -*- coding: utf-8 -*-
"""A reserva que o próprio cliente faz, pela página pública.

Três regras do chefe da Julia (02/10) moram aqui: grupo de 5 a 40
pessoas, teto de lugares por dia, e a página tendo que dizer se cabe
ANTES de a pessoa preencher o resto — pra ela trocar de data em vez de
levar um "não" no fim.

O que mais importa testar é o que separa o site da casa: o teto é do
formulário, não do restaurante. Quem atende precisa continuar podendo
encaixar a mesa que o dono mandou encaixar, e um teto que travasse
também o balcão seria um bug caro de descobrir no sábado à noite.
"""
from datetime import date, timedelta

from _base import Mundo, conferir, secao, terminar

mundo = Mundo()

import app as aplicacao  # noqa: E402
from backend.armazenamento import (  # noqa: E402
    LUGARES_POR_DIA_PADRAO,
    atualizar_reserva,
    criar_reserva,
    definir_hora_virada,
    gravar_lugares_por_dia,
    lugares_por_dia_da_loja,
    lugares_reservados_no_dia,
)

LOJA = aplicacao.LOJA_DO_SITE_DE_RESERVAS
MINIMO = aplicacao.MINIMO_PESSOAS_NO_SITE
MAXIMO = aplicacao.MAXIMO_PESSOAS_NO_SITE


def anonimo():
    """Cliente sem login nenhum — é assim que o visitante chega."""
    return mundo.app.test_client()


def liberar_o_limite_por_ip():
    """Os testes vêm todos do mesmo 127.0.0.1, e o limite por IP é de 3
    por 10 minutos. Sem zerar, o quarto caso falharia por 429 e não pelo
    motivo dele."""
    aplicacao._reservas_publicas_recentes.clear()
    aplicacao._consultas_de_vaga.clear()


def em(dias, hora="20:00"):
    return "%sT%s" % ((date.today() + timedelta(days=dias)).isoformat(), hora)


def pedir(quando, pessoas, nome="Cliente do Site", telefone="15999990000"):
    liberar_o_limite_por_ip()
    return anonimo().post("/api/reservas/publica", json={
        "nome": nome, "telefone": telefone, "quando": quando, "pessoas": pessoas,
    })


def vagas(dia_iso, hora=None):
    liberar_o_limite_por_ip()
    url = "/api/reservas/disponibilidade?data=%s" % dia_iso
    if hora:
        url += "&hora=%s" % hora
    return anonimo().get(url)


def recusou(funcao):
    """True quando a função levantou ValueError. Existe porque metade do
    que se quer provar aqui é o que o sistema NÃO deixa passar."""
    try:
        funcao()
    except ValueError:
        return True
    return False


secao("1) o formulário é pra grupo — 5 a 40 pessoas")
r = pedir(em(7), MINIMO - 1)
conferir("4 pessoas é recusado", r.status_code, 400)
conferir("e a recusa diz o que fazer em vez de só negar",
         "chegar direto" in r.get_json()["erro"], True)
conferir("41 pessoas é recusado", pedir(em(7), MAXIMO + 1).status_code, 400)
conferir("5 pessoas passa", pedir(em(7), MINIMO).status_code, 201)
conferir("40 pessoas passa", pedir(em(8), MAXIMO).status_code, 201)
conferir("sem número de pessoas, recusa", pedir(em(7), None).status_code, 400)
conferir("texto no lugar do número, recusa", pedir(em(7), "muitas").status_code, 400)

secao("2) a disponibilidade responde antes de a pessoa preencher")
dia_vazio = (date.today() + timedelta(days=20)).isoformat()
corpo = vagas(dia_vazio).get_json()
conferir("dia vazio tem o teto inteiro livre", corpo["livres"], LUGARES_POR_DIA_PADRAO)
conferir("e aceita reserva", corpo["aceita"], True)
conferir("o teto vai junto, pra página poder dizer a proporção",
         corpo["teto"], LUGARES_POR_DIA_PADRAO)
conferir("o mínimo vem do servidor, não do HTML", corpo["minimo"], MINIMO)
conferir("data de ontem é recusada",
         vagas((date.today() - timedelta(days=1)).isoformat()).status_code, 400)
conferir("data de daqui a 2 anos é recusada",
         vagas((date.today() + timedelta(days=730)).isoformat()).status_code, 400)
conferir("data sem sentido é recusada", vagas("31/02/2026").status_code, 400)
# Quem consulta é um desconhecido: pode saber quanto cabe, não quem vem.
conferir("a resposta não leva nome nem telefone de ninguém",
         any(c in corpo for c in ("nome", "telefone", "reservas")), False)

secao("3) o teto por dia segura o formulário")
dia = (date.today() + timedelta(days=30)).isoformat()
# 55 lugares já marcados pela casa, sem passar pelo site.
criar_reserva(LOJA, "Grupo da casa", 55, dia + "T20:00", origem="telefone")
conferir("sobram 5", vagas(dia).get_json()["livres"], 5)
conferir("e 5 ainda cabe", vagas(dia).get_json()["aceita"], True)
r = pedir(dia + "T20:00", 6)
conferir("pedir 6 é recusado", r.status_code, 409)
conferir("e a recusa diz quantos sobraram", r.get_json()["livres"], 5)
conferir("a recusa marca que é lotação, não erro de preenchimento",
         r.get_json()["lotado"], True)
conferir("pedir exatamente os 5 que sobraram passa",
         pedir(dia + "T20:00", 5).status_code, 201)
conferir("agora não sobra nada", vagas(dia).get_json()["livres"], 0)
conferir("e a página já avisa que não aceita", vagas(dia).get_json()["aceita"], False)

secao("4) sobrar menos que o mínimo é o mesmo que não sobrar")
dia_quase = (date.today() + timedelta(days=31)).isoformat()
criar_reserva(LOJA, "Grupo da casa", LUGARES_POR_DIA_PADRAO - 3,
              dia_quase + "T20:00", origem="telefone")
corpo = vagas(dia_quase).get_json()
conferir("sobram 3 lugares", corpo["livres"], 3)
conferir("mas o formulário já diz que não aceita", corpo["aceita"], False)
conferir("e o máximo que ele oferece é o que sobrou", corpo["maximo"], 3)

secao("5) o teto é do site — a casa continua podendo encaixar")
dia_cheio = (date.today() + timedelta(days=32)).isoformat()
criar_reserva(LOJA, "Lotou", LUGARES_POR_DIA_PADRAO, dia_cheio + "T20:00",
              origem="telefone")
conferir("pelo site, não cabe mais", pedir(dia_cheio + "T20:00", 5).status_code, 409)
encaixe = criar_reserva(LOJA, "Encaixe do dono", 8, dia_cheio + "T21:00",
                        origem="telefone")
conferir("mas quem atende encaixa", encaixe > 0, True)
conferir("e a conta do dia passa do teto, que é a verdade",
         lugares_reservados_no_dia(LOJA, dia_cheio), LUGARES_POR_DIA_PADRAO + 8)

secao("6) cancelada devolve o lugar")
dia_cancela = (date.today() + timedelta(days=33)).isoformat()
rid = criar_reserva(LOJA, "Vai desmarcar", LUGARES_POR_DIA_PADRAO,
                    dia_cancela + "T20:00", origem="telefone")
conferir("com o dia cheio, o site recusa",
         pedir(dia_cancela + "T20:00", 5).status_code, 409)
atualizar_reserva(rid, {"status": "cancelada"})
conferir("depois do cancelamento o dia volta a caber",
         vagas(dia_cancela).get_json()["livres"], LUGARES_POR_DIA_PADRAO)
conferir("e o site aceita de novo",
         pedir(dia_cancela + "T20:00", 5).status_code, 201)

secao("7) o teto conta por turno, não por data do calendário")
# A casa vira às 04:30: 01:00 de um dia pertence ao turno da véspera.
definir_hora_virada(LOJA, "04:30")
vespera = (date.today() + timedelta(days=40)).isoformat()
madrugada = (date.today() + timedelta(days=41)).isoformat()
criar_reserva(LOJA, "Mesa da noite", 58, vespera + "T21:00", origem="telefone")
conferir("a madrugada do dia seguinte conta no turno da véspera",
         vagas(madrugada, "01:00").get_json()["livres"], 2)
conferir("enquanto a noite do dia seguinte está livre",
         vagas(madrugada, "21:00").get_json()["livres"], LUGARES_POR_DIA_PADRAO)
conferir("e o site recusa a mesa da madrugada que não cabe no turno cheio",
         pedir(madrugada + "T01:00", 5).status_code, 409)
definir_hora_virada(LOJA, "00:00")

secao("8) o teto é dela, não do código")
conferir("sem linha, vale o padrão", lugares_por_dia_da_loja(LOJA), LUGARES_POR_DIA_PADRAO)
gravar_lugares_por_dia(LOJA, 100)
conferir("depois de mudar, vale o novo", lugares_por_dia_da_loja(LOJA), 100)
dia_maior = (date.today() + timedelta(days=50)).isoformat()
conferir("e a página já responde com o teto novo",
         vagas(dia_maior).get_json()["livres"], 100)
conferir("teto zero é recusado", recusou(lambda: gravar_lugares_por_dia(LOJA, 0)), True)
conferir("teto em texto é recusado", recusou(lambda: gravar_lugares_por_dia(LOJA, "dez")), True)
conferir("teto em branco volta pro padrão",
         gravar_lugares_por_dia(LOJA, ""), LUGARES_POR_DIA_PADRAO)
conferir("e volta a valer o padrão", lugares_por_dia_da_loja(LOJA), LUGARES_POR_DIA_PADRAO)

terminar()
