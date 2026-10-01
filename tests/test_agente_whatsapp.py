# -*- coding: utf-8 -*-
"""O agente do WhatsApp.

Duas partes:

  1. O TRANSPORTE — quem entra, quem não entra, e não responder duas
     vezes. É onde mora o risco de segurança: o robô não tem tela pra
     esconder faturamento de quem não é admin, então quem consegue falar
     com ele vê tudo.

  2. AS RESPOSTAS — em especial o relatório de faturamento, que precisa
     sair IDÊNTICO ao que ela monta à mão hoje. O valor da coisa é o
     chefe não ter que reaprender a ler.

A Evolution não é chamada em teste nenhum: `responder` vira um espião.
É assim que dá pra construir o agente inteiro antes do chip existir.
"""
import os
from datetime import date, timedelta

from _base import Mundo, conferir, secao, terminar

mundo = Mundo()

os.environ["WHATSAPP_WEBHOOK_TOKEN"] = "segredo-do-teste"
os.environ["EVOLUTION_URL"] = "https://zap.exemplo.invalid"
os.environ["EVOLUTION_INSTANCIA"] = "admfood"
os.environ["EVOLUTION_API_KEY"] = "chave-de-teste"

from backend import whatsapp_bot  # noqa: E402
from backend.armazenamento import definir_whatsapp_do_usuario  # noqa: E402

# Quem pode falar com o robô agora é quem tem WhatsApp no CADASTRO — a
# permissão é o perfil do sistema, não uma lista no ambiente (pedido do
# chefe, 30/09). Quem testa isso a fundo é o test_agente_permissao.
definir_whatsapp_do_usuario(mundo.ADMIN, "5511999990001")
definir_whatsapp_do_usuario(mundo.GERENTE, "+55 11 99999-0002")

enviados = []
whatsapp_bot.responder = lambda numero, texto: enviados.append((numero, texto))

URL = "/api/whatsapp/webhook/segredo-do-teste"
cliente = mundo.app.test_client()
admin = mundo.cliente(mundo.ADMIN)


def mensagem(texto="oi", numero="5511999990001", fromMe=False, id="MSG1",
             nome="Julia Lumi", grupo=False):
    jid = "120363@g.us" if grupo else f"{numero}@s.whatsapp.net"
    return {
        "event": "messages.upsert",
        "data": {
            "key": {"remoteJid": jid, "fromMe": fromMe, "id": id},
            "pushName": nome,
            "message": {"conversation": texto},
        },
    }


# =====================================================================
secao("1) o caminho feliz")
enviados.clear()
r = cliente.post(URL, json=mensagem("oi", id="A1"))
conferir("200", r.status_code, 200)
conferir("respondeu", r.get_json().get("respondido"), True)
conferir("pro número certo", enviados[0][0], "5511999990001")
# O nome vem do CADASTRO, não do pushName que quem manda escolhe.
conferir("cumprimenta pelo primeiro nome do cadastro",
         enviados[0][1].startswith("Oi, Admin!"), True)
conferir("e diz o que sabe fazer", "o que falta comprar" in enviados[0][1], True)

secao("2) o segredo da URL")
conferir("token errado é 404",
         cliente.post("/api/whatsapp/webhook/chutado", json=mensagem(id="A2")).status_code, 404)

secao("2b) sem token configurado, o webhook fica FECHADO")
# Deploy pela metade não pode virar porta aberta.
guardado = os.environ.pop("WHATSAPP_WEBHOOK_TOKEN")
conferir("qualquer token é 404", cliente.post(URL, json=mensagem(id="A3")).status_code, 404)
os.environ["WHATSAPP_WEBHOOK_TOKEN"] = guardado

secao("3) quem NÃO recebe resposta")
enviados.clear()
casos = [
    (mensagem(fromMe=True, id="B1"), "propria", "mensagem do próprio robô"),
    (mensagem(numero="5511000000000", id="B2"), "nao cadastrado", "número não cadastrado"),
    (mensagem(grupo=True, id="B3"), "sem numero ou sem texto", "grupo"),
]
for corpo, esperado, rotulo in casos:
    conferir(rotulo, cliente.post(URL, json=corpo).get_json().get("ignorado"), esperado)

sem_texto = mensagem(id="B4")
sem_texto["data"]["message"] = {"audioMessage": {}}
conferir("áudio", cliente.post(URL, json=sem_texto).get_json().get("ignorado"), "sem numero ou sem texto")
outro = mensagem(id="B5")
outro["event"] = "connection.update"
conferir("outro evento", cliente.post(URL, json=outro).get_json().get("ignorado"), "evento")
conferir("nada foi enviado em nenhum desses", enviados, [])

secao("4) não responde duas vezes")
enviados.clear()
cliente.post(URL, json=mensagem("oi", id="REPETIDA"))
segunda = cliente.post(URL, json=mensagem("oi", id="REPETIDA"))
conferir("a segunda é ignorada", segunda.get_json().get("ignorado"), "repetida")
conferir("enviou uma vez só", len(enviados), 1)

secao("5) número escrito de outro jeito na lista")
enviados.clear()
cliente.post(URL, json=mensagem("oi", numero="5511999990002", id="C1", nome="Ket"))
conferir("cadastrado como +55 11 99999-0002, recebido como 5511999990002", len(enviados), 1)

secao("6) mensagem citada (responder no WhatsApp)")
enviados.clear()
citada = mensagem(id="C2")
citada["data"]["message"] = {"extendedTextMessage": {"text": "o que falta comprar"}}
cliente.post(URL, json=citada)
conferir("lê o texto da citação", len(enviados), 1)

# =====================================================================
# AS RESPOSTAS
# =====================================================================
from app import montar_resposta_do_agente, relatorio_de_faturamento, _status_do_dia  # noqa: E402

LOJAS = mundo.LOJAS


def perguntar(texto):
    return montar_resposta_do_agente(texto, LOJAS, "Julia")


secao("7) o status compara com a média dos mesmos dias da semana")
# Os quatro casos reais do relatório dela de 27/09.
conferir("Artesanos 7.540 vs média 9.850 → ABAIXO",
         _status_do_dia(7540.36, [9372.33, 10002.07, 11081.82, 8943.53]), "🚨 ABAIXO")
conferir("ZN 9.568 vs média 9.359 → NA MÉDIA",
         _status_do_dia(9568.59, [11409.96, 8787.16, 8797.95, 8439.37]), "⚠️ NA MÉDIA")
conferir("Simus 4.966 vs média 4.095 → CRESCENDO",
         _status_do_dia(4966.45, [4383.17, 3733.50, 3863.61, 4399.63]), "✅ CRESCENDO")
conferir("Açaí 6.497 vs média 2.534 → CRESCENDO",
         _status_do_dia(6497.29, [826.08, 1925.69, 3524.59, 3859.75]), "✅ CRESCENDO")
conferir("sem histórico, não inventa comparação",
         _status_do_dia(1000, [0, 0, 0, 0]), "⚠️ SEM COMPARAÇÃO")

secao("8) o relatório sai no formato da mensagem que ela manda hoje")
LOJA = LOJAS[0]
ONTEM = (date.today() - timedelta(days=1)).isoformat()
with mundo.conexao() as conn:
    conn.execute("INSERT OR REPLACE INTO faturamento_diario "
                 "(unidade, dia, faturamento_dia, ticket_medio, quantidade_pedidos) "
                 "VALUES (?, ?, 3000, 50, 60)", (LOJA, ONTEM))
    for canal, valor in (("ifood", 1648.95), ("catalog", 701.98), ("food99", 2559.53)):
        conn.execute("INSERT OR REPLACE INTO faturamento_canal "
                     "(unidade, dia, canal, quantidade_pedidos, faturamento) VALUES (?, ?, ?, 10, ?)",
                     (LOJA, ONTEM, canal, valor))

texto = relatorio_de_faturamento(ONTEM, [LOJA])
linhas = texto.split("\n")
conferir("o título é o da mensagem dela", linhas[0], "*Faturamento do dia %s*" % LOJA)
conferir("a data vem por extenso", " - dia " in linhas[1], True)
# Os nomes exatos da mensagem dela: "iFood" com i minúsculo e
# "99 Food" com espaço. O ponto da resposta é chegar idêntica.
for emoji, nome in (("💵", "Presencial"), ("📱", "iFood"), ("🌐", "Cardápio Web"), ("🛵", "99 Food")):
    conferir("tem a linha de %s com %s" % (nome, emoji),
             any(l.startswith("%s %s: R$ " % (emoji, nome)) for l in linhas), True)
conferir("iFood com o valor certo",
         any(l == "📱 iFood: R$ 1.648,95" for l in linhas), True)
conferir("tem Total do dia", any(l.startswith("Total do dia: R$ ") for l in linhas), True)
conferir("tem Status", any(l.startswith("Status: ") for l in linhas), True)
conferir("lista 4 semanas anteriores",
         len([l for l in linhas if l.startswith("- ")]), 4)
conferir("o total soma os canais",
         any(l == "Total do dia: R$ 4.910,46" for l in linhas), True)

secao("8b) a ordem das lojas é a da mensagem dela, não a do config")
from app import _ordem_do_relatorio  # noqa: E402
conferir("Artesanos, ZN, Simus, Açaí",
         _ordem_do_relatorio(list(reversed(LOJAS))),
         ["Hamburgueria Artesanos", "Tradiça ZN", "Tradiça Simus", "Açaí Na Lata"])
conferir("loja nova vai pro fim em vez de sumir",
         _ordem_do_relatorio(["Loja Nova", "Tradiça ZN"]), ["Tradiça ZN", "Loja Nova"])

secao("9) o Açaí sai com o nome fantasia, como no relatório dela")
conferir("Açaí NaLata, não Açaí Na Lata",
         relatorio_de_faturamento(ONTEM, ["Açaí Na Lata"]).split("\n")[0],
         "*Faturamento do dia Açaí NaLata*")

secao("10) o roteador entende as quatro perguntas")
mundo.insumo("Bacon do teste", lojas=[LOJA], quantidade=0, minimo=8, unidade="kg")
with mundo.conexao() as conn:
    conn.execute("INSERT INTO contagem (loja, descricao, status, token, prazo_validade, criado_em, aprovada_em) "
                 "VALUES (?, 't', 'aprovada', 'tok-agente', '2099-01-01T00:00', ?, ?)",
                 (LOJA, date.today().isoformat(), date.today().isoformat()))

conferir("vendas", "Faturamento do dia" in perguntar("quanto vendeu ontem?"), True)
conferir("vendas com data", "Faturamento do dia" in perguntar("quanto faturou dia 27/09"), True)
conferir("o que falta comprar", "abaixo do mínimo" in perguntar("o que falta comprar?"), True)
conferir("reservas", "reserva" in perguntar("tem reserva hoje?").lower(), True)
conferir("estoque de um insumo", "Bacon do teste" in perguntar("quanto tem de bacon?"), True)
conferir("ajuda", "sei responder" in perguntar("ajuda"), True)

secao("11) o que ele NÃO entende, ele não chuta")
resposta = perguntar("cancela a reserva da Marina e manda mensagem pro fornecedor")
conferir("diz que só consulta", "só *consulto*" in resposta, True)
conferir("e lista o que sabe fazer", "sei responder" in resposta, True)
# Antes, isso casava com "reserva" e ele devolvia a LISTA de reservas —
# a pessoa podia achar que tinha cancelado.
conferir("NÃO responde com a agenda", "turno de" in resposta, False)
for pedido in ("cria uma reserva pra 4 pessoas", "confirma o recebimento do pedido 10027",
               "atualiza o estoque de bacon", "manda isso pro grupo"):
    conferir("recusa: " + pedido, "só *consulto*" in perguntar(pedido), True)

resposta = perguntar("qual a cor do céu")
conferir("o que não é do sistema também não vira chute", "sei responder" in resposta, True)

secao("12) insumo que não existe")
conferir("diz que não achou", "Não achei" in perguntar("quanto tem de caviar?"), True)

secao("12b) a data pedida é a data respondida")
# Até 01/10 o robô respondia TODA pergunta com data com o movimento de
# ONTEM. O normalizador do agente é o de nome de insumo e troca pontuação
# por espaço, então "27/09" chegava no _dia_citado como "27 09" e a regex
# de data não casava mais — caía no fallback silencioso.
#
# O teste da seção 10 não pegou porque conferia só que a resposta TINHA
# "Faturamento do dia", não QUAL dia ela trazia. Daí conferir o dia aqui:
# o perigo deste bug era parecer resposta certa.
from app import _dia_citado  # noqa: E402

LOJAS_DO_TESTE = list(mundo.LOJAS)
hoje = date.today()
conferir("dia 27/09 é 27/09", _dia_citado("quanto vendeu dia 27/09", LOJAS_DO_TESTE),
         date(hoje.year, 9, 27).isoformat())
conferir("aceita 30-09", _dia_citado("quanto vendeu 30-09", LOJAS_DO_TESTE),
         date(hoje.year, 9, 30).isoformat())
conferir("aceita espaço na barra", _dia_citado("vendas de 1 / 10", LOJAS_DO_TESTE),
         date(hoje.year, 10, 1).isoformat())
conferir("sem data é ontem", _dia_citado("quanto vendeu", LOJAS_DO_TESTE),
         (hoje - timedelta(days=1)).isoformat())
conferir("anteontem continua valendo", _dia_citado("quanto vendeu anteontem", LOJAS_DO_TESTE),
         (hoje - timedelta(days=2)).isoformat())
# Dois números soltos NÃO são data: num texto de restaurante isso é
# quantidade muito mais vezes que dia.
conferir("'27 09' sem barra não vira data",
         _dia_citado("vendi 27 09 unidades", LOJAS_DO_TESTE),
         (hoje - timedelta(days=1)).isoformat())
conferir("e a resposta nomeia o dia pedido",
         "27/09" in perguntar("quanto faturou dia 27/09"), True)

# Dia da semana e período ele não sabe ler. O certo é dizer isso, não
# devolver ontem de cara limpa — era o que acontecia até 01/10.
for pedido in ("quanto vendeu segunda", "quanto vendeu sabado",
               "quanto vendeu essa semana", "quanto vendeu no mes",
               "quanto vendeu em janeiro", "quanto vendeu semana passada"):
    conferir("não chuta: " + pedido, _dia_citado(pedido, LOJAS_DO_TESTE), None)
conferir("e avisa em vez de responder outro dia",
         "não consegui ler qual" in perguntar("quanto vendeu segunda"), True)
conferir("'quanto vendeu' puro continua sendo ontem",
         _dia_citado("quanto vendeu", LOJAS_DO_TESTE),
         (hoje - timedelta(days=1)).isoformat())

secao("12c) jeitos de perguntar que o ensaio de 01/10 pegou")
conferir("'quanto vendemos' é venda", "Faturamento do dia" in perguntar("quanto vendemos ontem"), True)
conferir("'quem reservou' é reserva", "turno de" in perguntar("quem reservou hoje"), True)
conferir("'acabou o X' é estoque", "Bacon do teste" in perguntar("acabou o bacon?"), True)
# "tem gente marcada hoje" caía na regra de estoque e o robô respondia
# "não achei nenhum insumo com 'gente marcada hoje' no nome".
conferir("'gente marcada' não vira busca de insumo",
         "Não achei" in perguntar("tem gente marcada hoje"), False)

secao("13) a rota de teste, sem WhatsApp nenhum")
r = admin.post("/api/whatsapp/teste", json={"texto": "o que falta comprar", "nome": "Julia"})
conferir("200", r.status_code, 200)
conferir("mostra o que responderia", "abaixo do mínimo" in r.get_json()["responderia"], True)
conferir("sem texto é 400", admin.post("/api/whatsapp/teste", json={}).status_code, 400)
conferir("e é só de admin",
         mundo.cliente(mundo.GERENTE).post("/api/whatsapp/teste", json={"texto": "oi"}).status_code, 403)

terminar()
