# -*- coding: utf-8 -*-
"""O aviso de reservas no grupo da liderança.

Pedido do chefe da Julia (30/09): "agente de IA mandando no grupo da
liderança todo dia às 15h quais são as reservas do dia (segunda, as
reservas da semana) e reservas novas assim que agendadas".

O chip ainda não existe, então é aqui que o aviso é conferido. O que
mais importa não é o texto sair bonito — é ele **não sair duas vezes** e
**não despejar o cadastro inteiro** na primeira vez que ligar.
"""
import os
from datetime import date, datetime, timedelta

from _base import Mundo, conferir, secao, terminar

mundo = Mundo()

os.environ["EVOLUTION_URL"] = "https://zap.exemplo.invalid"
os.environ["EVOLUTION_INSTANCIA"] = "admfood"
os.environ["EVOLUTION_API_KEY"] = "chave-de-teste"

import app as appmod  # noqa: E402
from backend import whatsapp_bot  # noqa: E402
from backend.armazenamento import (  # noqa: E402
    atualizar_reserva,
    criar_reserva,
    reservas_por_avisar,
)

enviados = []
whatsapp_bot.responder = lambda numero, texto: enviados.append((numero, texto))

GRUPO = "120363000000000000@g.us"
appmod.GRUPO_WHATSAPP_LIDERANCA = GRUPO

LOJA = mundo.LOJA_DA_EQUIPE
OUTRA = next(l for l in mundo.LOJAS if l != LOJA)
HOJE = date.today()


def marcar(loja, nome, pessoas, quando, **extra):
    return criar_reserva(loja=loja, nome=nome, pessoas=pessoas,
                         quando_iso=quando, **extra)


def as_20h(dia):
    return datetime.combine(dia, datetime.min.time()).replace(hour=20).isoformat(timespec="minutes")


def rodar_o_das_15h():
    enviados.clear()
    appmod._rodar_aviso_de_reservas()
    return enviados[0][1] if enviados else None


def rodar_o_de_novas():
    enviados.clear()
    quantas = appmod._rodar_aviso_de_reservas_novas()
    return quantas, (enviados[0][1] if enviados else None)


secao("1) dia sem reserva nenhuma: o robô fica calado")
# Aviso diário em dia vazio é ruído, e ruído diário ensina a ignorar o
# aviso. O da semana é diferente — ver seção 4.
conferir("não monta texto", appmod.texto_do_aviso_do_dia(HOJE.isoformat(), mundo.LOJAS), None)
conferir("e não manda nada", rodar_o_das_15h() if HOJE.weekday() != 0 else None, None)


secao("2) o aviso do dia traz quem vem hoje, separado por loja")
marcar(LOJA, "Marina", 4, as_20h(HOJE))
marcar(LOJA, "Joao Pedro", 2, as_20h(HOJE).replace("T20:00", "T21:30"))
marcar(OUTRA, "Ana", 6, as_20h(HOJE), status="pendente")

texto = appmod.texto_do_aviso_do_dia(HOJE.isoformat(), mundo.LOJAS)
for quem in ("Marina", "Joao Pedro", "Ana"):
    conferir("cita " + quem, quem in texto, True)
conferir("hora de cada uma", "21:30" in texto and "20:00" in texto, True)
conferir("marca a que falta confirmar", "a confirmar" in texto, True)
conferir("soma as pessoas", "12 pessoas" in texto, True)
conferir("soma as reservas", "3 reservas" in texto, True)


secao("3) reserva de outro dia não entra no aviso de hoje")
marcar(LOJA, "Daqui a cinco dias", 2, as_20h(HOJE + timedelta(days=5)))
conferir("fora do aviso do dia",
         "Daqui a cinco dias" in appmod.texto_do_aviso_do_dia(HOJE.isoformat(), mundo.LOJAS), False)


secao("4) segunda-feira é a semana inteira, e sai mesmo vazia")
# Uma vez por semana o grupo precisa ver que o robô está vivo. E
# "nenhuma reserva na semana" é informação pra quem escala equipe.
#
# As datas aqui são contadas a partir da segunda, não de hoje: contar a
# partir de hoje faria o teste passar ou falhar conforme o dia em que
# ele roda.
segunda = HOJE - timedelta(days=HOJE.weekday())
marcar(LOJA, "Domingo desta semana", 2, as_20h(segunda + timedelta(days=6)))
marcar(LOJA, "Segunda que vem", 2, as_20h(segunda + timedelta(days=7)))

semana = appmod.texto_do_aviso_da_semana(segunda.isoformat(), mundo.LOJAS)
conferir("é o da semana", "Reservas da semana" in semana, True)
conferir("pega até o domingo", "Domingo desta semana" in semana, True)
conferir("e para na segunda seguinte", "Segunda que vem" in semana, False)
conferir("traz as de hoje também", "Marina" in semana, True)
conferir("diz a loja de cada uma (a semana mistura)", "Ana" in semana, True)

longe = (HOJE + timedelta(days=90)) - timedelta(days=(HOJE + timedelta(days=90)).weekday())
vazia = appmod.texto_do_aviso_da_semana(longe.isoformat(), mundo.LOJAS)
conferir("semana vazia ainda manda mensagem", vazia is not None, True)
conferir("e diz que está vazia", "Nenhuma reserva" in vazia, True)


secao("5) reserva nova vira aviso — uma vez só")
# É a trava mais importante: sem `avisado_em`, o job de 2 em 2 minutos
# reavisaria a mesma reserva o dia inteiro.
quantas, texto = rodar_o_de_novas()
conferir("avisou as que existem", quantas > 0, True)
conferir("numa mensagem só", len(enviados), 1)
conferir("foi pro grupo", enviados[0][0], GRUPO)

quantas, texto = rodar_o_de_novas()
conferir("rodando de novo, não avisa nada", quantas, 0)
conferir("e não manda mensagem", enviados, [])


secao("6) uma reserva nova sozinha ganha mensagem detalhada")
marcar(LOJA, "Beatriz", 8, as_20h(HOJE + timedelta(days=2)), observacao="Aniversario")
quantas, texto = rodar_o_de_novas()
conferir("uma só", quantas, 1)
conferir("diz Reserva nova", "Reserva nova" in texto, True)
conferir("com o nome", "Beatriz" in texto, True)
conferir("com o tamanho da mesa", "8 pessoas" in texto, True)
conferir("e com a observação", "Aniversario" in texto, True)


secao("7) várias juntas viram UMA mensagem")
# Cinco avisos seguidos no grupo incomodam mais do que informam.
for i in range(4):
    marcar(LOJA, "Cliente %d" % i, 2, as_20h(HOJE + timedelta(days=3)))
quantas, texto = rodar_o_de_novas()
conferir("avisou as 4", quantas, 4)
conferir("numa mensagem só", len(enviados), 1)
conferir("diz quantas são", "4 reservas novas" in texto, True)


secao("8) cadastro antigo NÃO é despejado no grupo")
# Se o aviso ligar depois de já haver reservas no sistema, elas não são
# "novas" pra ninguém — sairiam todas de uma vez no grupo.
velha = marcar(LOJA, "Anotada semana passada", 2, as_20h(HOJE + timedelta(days=4)))
with mundo.conexao() as conn:
    conn.execute("UPDATE reserva SET criado_em = ? WHERE id = ?",
                 ((datetime.now() - timedelta(days=3)).isoformat(), velha))
quantas, texto = rodar_o_de_novas()
conferir("não avisou", quantas, 0)
conferir("nada foi enviado", enviados, [])
conferir("mas saiu da fila (não fica tentando pra sempre)",
         any(r["id"] == velha for r in reservas_por_avisar(mundo.LOJAS)), False)


secao("9) cancelada não vira aviso")
cancelada = marcar(LOJA, "Desmarcou", 2, as_20h(HOJE + timedelta(days=6)))
atualizar_reserva(cancelada, {"status": "cancelada"})
quantas, texto = rodar_o_de_novas()
conferir("não avisou a cancelada", quantas, 0)
conferir("e ela some do aviso do dia dela",
         "Desmarcou" in (appmod.texto_do_aviso_da_semana(segunda.isoformat(), mundo.LOJAS) or ""),
         False)


secao("10) sem Evolution, a reserva espera em vez de sumir")
# Sem chip ainda: se marcasse como avisada sem enviar, a reserva nunca
# apareceria no grupo depois que ele ligasse.
appmod.GRUPO_WHATSAPP_LIDERANCA = ""
guardada = marcar(LOJA, "Esperando o chip", 3, as_20h(HOJE + timedelta(days=1)))
quantas, _ = rodar_o_de_novas()
conferir("não avisou", quantas, 0)
conferir("continua na fila",
         any(r["id"] == guardada for r in reservas_por_avisar(mundo.LOJAS)), True)

appmod.GRUPO_WHATSAPP_LIDERANCA = GRUPO
quantas, texto = rodar_o_de_novas()
conferir("com o grupo configurado, sai", quantas, 1)
conferir("é a que estava esperando", "Esperando o chip" in texto, True)


secao("11) o envio nunca derruba o job")
# Job agendado que morre por causa de rede para de rodar pra sempre, sem
# ninguém perceber.
def cair(numero, texto):
    raise RuntimeError("Evolution fora do ar")


whatsapp_bot.responder = cair
enviou, motivo = appmod.mandar_pro_grupo_da_lideranca("qualquer coisa")
conferir("devolve que não enviou", enviou, False)
conferir("e diz o motivo", "falha ao enviar" in motivo, True)

marcar(LOJA, "Durante a queda", 2, as_20h(HOJE + timedelta(days=7)))
conferir("o job não levanta exceção", appmod._rodar_aviso_de_reservas_novas(), 0)
conferir("o das 15h também não", appmod._rodar_aviso_de_reservas(), False)
whatsapp_bot.responder = lambda numero, texto: enviados.append((numero, texto))


secao("12) a prévia na tela mostra o mesmo texto, e é coisa de gestão")
conferir("operação não vê",
         mundo.cliente(mundo.OPERACAO).get("/api/reservas/aviso").status_code, 403)

r = mundo.cliente(mundo.ADMIN).get("/api/reservas/aviso?tipo=dia")
conferir("admin vê", r.status_code, 200)
conferir("com o texto do dia", "Marina" in (r.get_json().get("texto") or ""), True)
conferir("e diz a hora", r.get_json().get("hora"), "15:00")

r = mundo.cliente(mundo.ADMIN).get("/api/reservas/aviso?tipo=semana")
conferir("dá pra pedir o da semana", "Reservas da semana" in r.get_json()["texto"], True)

terminar()
