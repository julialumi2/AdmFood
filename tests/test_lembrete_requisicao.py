# -*- coding: utf-8 -*-
"""O lembrete de requisição do domingo.

Pedido dela (01/10): "eu precisava que o sistema enviasse o link de
requisição sozinho todo domingo para o funcionário do açaí".

O sistema NÃO cria a requisição — quem cria é a Ket. O lembrete só pega a
que está aberta e manda o link pra quem conta o estoque daquela loja. Por
isso o que mais importa aqui é o que ele faz quando NÃO tem o que mandar:
cada um desses casos some do mesmo jeito no celular de quem esperava, e
só o painel distingue.
"""
import os
from datetime import datetime, timedelta

from _base import Mundo, conferir, secao, terminar

mundo = Mundo()

os.environ["EVOLUTION_URL"] = "https://zap.exemplo.invalid"
os.environ["EVOLUTION_INSTANCIA"] = "admfood"
os.environ["EVOLUTION_API_KEY"] = "chave-de-teste"

import app as aplicacao  # noqa: E402
from backend import whatsapp_bot  # noqa: E402
from backend.armazenamento import (  # noqa: E402
    criar_contagem,
    criar_contato_contagem,
    listar_contagens,
)

LOJA = mundo.LOJA_DA_EQUIPE
aplicacao.LOJAS_DO_LEMBRETE_DE_REQUISICAO = (LOJA,)
aplicacao.URL_PUBLICA = "https://admfood.exemplo.com.br"

enviados = []
whatsapp_bot.responder = lambda numero, texto: enviados.append((numero, texto))

DAQUI_A_3_DIAS = (datetime.now() + timedelta(days=3)).isoformat(timespec="minutes")
ONTEM = (datetime.now() - timedelta(days=1)).isoformat(timespec="minutes")


def previa():
    return aplicacao.previa_do_lembrete_de_requisicao([LOJA])[0]


secao("1) sem requisição aberta, ele diz por quê")
conferir("não inventa requisição", previa()["motivo"], "nenhuma requisição aberta e no prazo")
conferir("e não manda nada", previa()["mensagens"], [])

secao("2) requisição aberta, mas ninguém cadastrado pra receber")
# É o caso do Açaí em produção: é a única das quatro lojas sem ninguém em
# "quem conta o estoque" (conferido em 01/10).
criar_contagem(LOJA, "Requisição da Ket", DAQUI_A_3_DIAS)
conferir("aponta o cadastro que falta", previa()["motivo"],
         "ninguém cadastrado em quem conta o estoque")

secao("3) com os dois, monta a mensagem")
criar_contato_contagem(LOJA, "Ketlyn Souza", "5511999998888")
item = previa()
conferir("sem motivo que impeça", item["motivo"], None)
conferir("uma mensagem", len(item["mensagens"]), 1)
msg = item["mensagens"][0]["texto"]
conferir("chama pelo primeiro nome", msg.startswith("Oi, Ketlyn!"), True)
conferir("tem o link com o token",
         "https://admfood.exemplo.com.br/preencher_contagem.html?token=" in msg, True)
conferir("diz o prazo", "até" in msg, True)
# O telefone nunca sai inteiro na prévia: a tela é de gestão, mas o
# número é de um funcionário.
conferir("telefone mascarado na prévia", item["mensagens"][0]["telefone"], "5511...8888")
conferir("e não sai inteiro", "5511999998888" in str(item), False)

secao("4) requisição vencida não vira link morto")
with mundo.conexao() as conn:
    conn.execute("UPDATE contagem SET prazo_validade = ? WHERE loja = ?", (ONTEM, LOJA))
conferir("prazo vencido conta como não ter", previa()["motivo"],
         "nenhuma requisição aberta e no prazo")
with mundo.conexao() as conn:
    conn.execute("UPDATE contagem SET prazo_validade = ? WHERE loja = ?", (DAQUI_A_3_DIAS, LOJA))

secao("5) sem URL_PUBLICA ele não manda meio link")
aplicacao.URL_PUBLICA = ""
conferir("falha fechando", previa()["motivo"],
         "URL_PUBLICA não configurada — não sei montar o link")
aplicacao.URL_PUBLICA = "https://admfood.exemplo.com.br"

secao("6) o job manda, e registra o que fez")
enviados.clear()
conferir("enviou 1", aplicacao._rodar_lembrete_de_requisicao(), 1)
conferir("pro telefone certo", enviados[0][0], "5511999998888")
conferir("com o link dentro", "preencher_contagem.html?token=" in enviados[0][1], True)

secao("7) a requisição mais recente é a que vale")
criar_contagem(LOJA, "Requisição nova", DAQUI_A_3_DIAS)
nova = max((c for c in listar_contagens() if c["loja"] == LOJA),
           key=lambda c: c["criado_em"] or "")
conferir("pega a última criada",
         aplicacao.requisicao_aberta_da_loja(LOJA)["id"], nova["id"])

secao("8) a rota de prévia, sem esperar domingo nem chip")
admin = mundo.cliente(mundo.ADMIN)
r = admin.get("/api/requisicoes/lembrete")
conferir("200", r.status_code, 200)
corpo = r.get_json()
conferir("diz o dia", corpo["dia"], "domingo")
conferir("e a hora", corpo["hora"], "09:00")
conferir("não é de operação",
         mundo.cliente(mundo.OPERACAO).get("/api/requisicoes/lembrete").status_code, 403)

terminar()
