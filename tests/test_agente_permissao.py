# -*- coding: utf-8 -*-
"""O robô respeita o perfil de quem pergunta.

Pedido do chefe da Julia (30/09):

  "Limitado aos acessos que a pessoa tem. Ele nunca deve responder algo
   pra alguém que não tenha acesso a determinado dado. Exemplo: vamos
   dizer que a equipe também tenha acesso a IA, não tem pq a IA dar
   alguma resposta sobre faturamento."

É a regra mais importante do robô: sem ela, ele vira porta lateral pra
contornar os três perfis do sistema. Um funcionário que não vê
faturamento na tela não pode ver faturamento no WhatsApp.

E recusar não pode vazar: nada de "foi R$ X, mas você não pode ver".
"""
import os

from _base import Mundo, conferir, secao, terminar

mundo = Mundo()

os.environ["WHATSAPP_WEBHOOK_TOKEN"] = "segredo-do-teste"
os.environ["EVOLUTION_URL"] = "https://zap.exemplo.invalid"
os.environ["EVOLUTION_INSTANCIA"] = "admfood"
os.environ["EVOLUTION_API_KEY"] = "chave-de-teste"

from backend import whatsapp_bot  # noqa: E402
from backend.armazenamento import (  # noqa: E402
    buscar_usuario_por_whatsapp,
    definir_whatsapp_do_usuario,
)
from app import montar_resposta_do_agente  # noqa: E402

enviados = []
whatsapp_bot.responder = lambda numero, texto: enviados.append((numero, texto))
URL = "/api/whatsapp/webhook/segredo-do-teste"
cliente = mundo.app.test_client()

MINHA = mundo.LOJA_DA_EQUIPE
OUTRA = next(l for l in mundo.LOJAS if l != MINHA)

NUM_ADMIN = "5511999990001"
NUM_GERENTE = "5511999990002"
NUM_OPERACAO = "5511999990003"
definir_whatsapp_do_usuario(mundo.ADMIN, NUM_ADMIN)
definir_whatsapp_do_usuario(mundo.GERENTE, "(11) 99999-0002")   # de propósito formatado
definir_whatsapp_do_usuario(mundo.OPERACAO, NUM_OPERACAO)


def mensagem(texto, numero, id):
    return {"event": "messages.upsert", "data": {
        "key": {"remoteJid": f"{numero}@s.whatsapp.net", "fromMe": False, "id": id},
        "pushName": "Qualquer Nome", "message": {"conversation": texto}}}


def perguntar_como(numero, texto, id):
    enviados.clear()
    cliente.post(URL, json=mensagem(texto, numero, id))
    return enviados[0][1] if enviados else None


secao("1) o número acha a pessoa, mesmo formatado diferente")
conferir("dígitos puros", (buscar_usuario_por_whatsapp(NUM_ADMIN) or {}).get("id"), mundo.ADMIN)
conferir("cadastrado com máscara, recebido em dígitos",
         (buscar_usuario_por_whatsapp("5511999990002") or {}).get("id"), mundo.GERENTE)
conferir("número curto demais não casa com ninguém",
         buscar_usuario_por_whatsapp("999"), None)
conferir("número que não é de ninguém", buscar_usuario_por_whatsapp("5511000000000"), None)

secao("2) conta desativada deixa de ser atendida — na hora")
with mundo.conexao() as conn:
    conn.execute("UPDATE usuario SET ativo = 0 WHERE id = ?", (mundo.OPERACAO,))
conferir("não acha mais", buscar_usuario_por_whatsapp(NUM_OPERACAO), None)
conferir("e o webhook ignora",
         cliente.post(URL, json=mensagem("oi", NUM_OPERACAO, "D1")).get_json().get("ignorado"),
         "nao cadastrado")
with mundo.conexao() as conn:
    conn.execute("UPDATE usuario SET ativo = 1 WHERE id = ?", (mundo.OPERACAO,))

secao("3) número não cadastrado não recebe NADA")
# Nem "não te conheço": qualquer resposta já confirma que o número é de
# um sistema, e aí vale a pena insistir.
enviados.clear()
r = cliente.post(URL, json=mensagem("quanto vendeu ontem?", "5511000000000", "E1"))
conferir("ignorado", r.get_json().get("ignorado"), "nao cadastrado")
conferir("e nada foi enviado", enviados, [])

secao("4) FATURAMENTO: só o admin")
# É o exemplo que o chefe deu, palavra por palavra.
resposta_admin = perguntar_como(NUM_ADMIN, "quanto vendeu ontem?", "F1")
conferir("admin recebe o relatório", "Faturamento do dia" in resposta_admin, True)

for rotulo, numero, id in (("gerente", "5511999990002", "F2"), ("operação", NUM_OPERACAO, "F3")):
    resposta = perguntar_como(numero, "quanto vendeu ontem?", id)
    conferir(rotulo + " é recusado", "informação de gestão" in resposta, True)
    conferir(rotulo + ": não vaza valor nenhum", "R$" in resposta, False)
    conferir(rotulo + ": não vaza nome de loja", "Faturamento do dia" in resposta, False)

secao("4b) e nem por outro nome")
for palavra in ("qual foi o ticket medio", "qual a margem", "quanto de lucro", "qual o cmv"):
    conferir("recusa: " + palavra,
             "informação de gestão" in montar_resposta_do_agente(
                 palavra, mundo.LOJAS, usuario={"papel": "operacao", "loja": MINHA}), True)

secao("5) o que a operação PODE saber, ela sabe")
mundo.insumo("Bacon da permissao", lojas=[MINHA], quantidade=0, minimo=8, unidade="kg")
from datetime import date  # noqa: E402
with mundo.conexao() as conn:
    conn.execute("INSERT INTO contagem (loja, descricao, status, token, prazo_validade, criado_em, aprovada_em) "
                 "VALUES (?, 't', 'aprovada', 'tok-perm', '2099-01-01T00:00', ?, ?)",
                 (MINHA, date.today().isoformat(), date.today().isoformat()))
conferir("estoque de um insumo",
         "Bacon da permissao" in perguntar_como(NUM_OPERACAO, "quanto tem de bacon?", "G1"), True)
conferir("o que falta comprar",
         "abaixo do mínimo" in perguntar_como(NUM_OPERACAO, "o que falta comprar?", "G2"), True)
conferir("reservas",
         "reserva" in perguntar_como(NUM_OPERACAO, "reservas de hoje", "G3").lower(), True)

secao("6) e só da loja DELA")
# Um insumo que só existe na outra loja não pode aparecer.
mundo.insumo("Segredo da outra loja", lojas=[OUTRA], quantidade=5, minimo=1, unidade="kg")
resposta = perguntar_como(NUM_OPERACAO, "quanto tem de segredo?", "H1")
conferir("não encontra insumo de outra loja", "Não achei" in resposta, True)
conferir("o admin encontra",
         "Segredo da outra loja" in perguntar_como(NUM_ADMIN, "quanto tem de segredo?", "H2"), True)

secao("7) cadastro sem loja não recebe dado de loja nenhuma")
sem_loja = mundo.sem_loja("operacao")
definir_whatsapp_do_usuario(sem_loja, "5511988880000")
resposta = perguntar_como("5511988880000", "quanto tem de bacon?", "I1")
conferir("avisa que falta loja no cadastro", "sem loja definida" in resposta, True)
conferir("e não devolve estoque", "Bacon" in resposta, False)

secao("8) tirar o WhatsApp tira do robô, sem desativar a conta")
definir_whatsapp_do_usuario(mundo.OPERACAO, "")
conferir("não acha mais", buscar_usuario_por_whatsapp(NUM_OPERACAO), None)
conferir("mas a conta continua ativa",
         mundo.cliente(mundo.OPERACAO).get("/api/alertas").status_code, 200)

secao("9) o painel de diagnostico registra, mas nao guarda telefone")
# Sem este painel, robo calado tem quatro causas e todas dao o mesmo
# silencio. Com ele, cada silencio tem nome.
from backend.armazenamento import listar_chamadas_webhook  # noqa: E402

chamadas = listar_chamadas_webhook()
resultados = [c["resultado"] for c in chamadas]
conferir("registrou uma resposta", any(r.startswith("respondido") for r in resultados), True)
conferir("registrou o numero desconhecido",
         any("nao cadastrado" in r for r in resultados), True)

# A promessa que o painel faz: da pra reconhecer o proprio numero, nao
# da pra montar lista de telefone a partir dele.
numeros = [c["numero"] for c in chamadas if c["numero"]]
conferir("nenhum numero inteiro foi gravado",
         any(n in numeros for n in (NUM_ADMIN, NUM_OPERACAO, "5511000000000")), False)
conferir("mas da pra reconhecer pelo fim", any(n.endswith("0001") for n in numeros), True)
conferir("mascarado no meio", all("..." in n for n in numeros), True)

terminar()
