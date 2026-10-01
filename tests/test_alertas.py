# -*- coding: utf-8 -*-
"""O sininho de alertas.

Cobre as três regras que já quebraram uma vez cada:

  1. o badge conta TUDO, mesmo o que não coube na lista de 10 — ele ficou
     preso num número que nunca zerava (28/09);
  2. "marcar como lido" cala tudo que está ativo, não só o visível — era
     a causa do badge preso;
  3. o alerta de backup vem em primeiro e "lido" nele vale só a semana —
     um clique não pode desligar pra sempre o aviso que protege contra
     perder o sistema (29/09).
"""
import uuid
from datetime import date, datetime, timedelta

from _base import Mundo, conferir, secao, terminar

mundo = Mundo()
admin = mundo.cliente(mundo.ADMIN)
gerente = mundo.cliente(mundo.GERENTE)
LOJA = mundo.LOJAS[0]


def alertas(cliente=admin):
    return cliente.get("/api/alertas").get_json()


def do_tipo(dados, tipo):
    return [a for a in dados["alertas"] if a["tipo"] == tipo]


def contagem_aprovada_em(loja, quando):
    """Loja sem contagem recente vira alerta próprio e cala o de estoque —
    aqui a gente finge que contou, pra isolar o que está sendo testado.

    Token por uuid: ele é único no banco, e "Tradiça ZN" e "Tradiça Simus"
    colidiriam em qualquer recorte do nome."""
    with mundo.conexao() as conn:
        conn.execute(
            "INSERT INTO contagem (loja, descricao, status, token, prazo_validade, criado_em, aprovada_em) "
            "VALUES (?, 'do teste', 'aprovada', ?, '2099-01-01T00:00', ?, ?)",
            (loja, uuid.uuid4().hex, quando, quando))


hoje = date.today()
for loja in mundo.LOJAS:
    contagem_aprovada_em(loja, hoje.isoformat())

# Uma cópia recém-baixada, pra o alerta de backup não poluir os primeiros
# blocos. Ele tem bloco próprio no fim.
with mundo.conexao() as conn:
    conn.execute("INSERT INTO execucao_rotina (nome, ultima_em, detalhe) VALUES ('backup_baixado', ?, 'teste')",
                 (datetime.now().isoformat(),))

secao("1) sem nada errado, o sininho fica quieto")
conferir("nenhum alerta", alertas()["total"], 0)

secao("2) insumo abaixo do mínimo acende")
baixo = mundo.insumo("Insumo que acabou", lojas=[LOJA], quantidade=1, minimo=9)
d = alertas()
conferir("um alerta", d["total"], 1)
conferir("é de estoque", do_tipo(d, "estoque")[0]["titulo"], "Insumo que acabou")

secao("3) o badge conta o que não coube na lista")
QUANTOS = 25
for i in range(QUANTOS):
    mundo.insumo("Insumo baixo %02d" % i, lojas=[LOJA], quantidade=1, minimo=9)
d = alertas()
conferir("badge conta todos", d["total"], QUANTOS + 1)
conferir("a lista corta em 10", len(d["alertas"]), 10)
conferir("e diz quantos ficaram de fora", d["escondidos"], QUANTOS + 1 - 10)

secao("4) marcar como lido zera o badge, mesmo com mais que cabe na tela")
r = admin.post("/api/alertas/lidos")
conferir("marcou", r.status_code, 200)
conferir("calou mais do que estava visível", r.get_json()["lidos"] >= QUANTOS, True)
conferir("BADGE ZEROU", alertas()["total"], 0)
conferir("mas os alertas continuam na lista", len(alertas()["alertas"]) > 0, True)

secao("5) 'lido' é por pessoa, não por sistema")
conferir("o gerente ainda vê os alertas da loja dele", alertas(gerente)["total"] > 0, True)

secao("5b) funcionário sem loja não enxerga nada (falha fechando)")
# Regra de _loja_do_usuario: cadastro pela metade não pode cair no None e
# acabar vendo a rede inteira. Vale a pena travar isso num teste — é
# decisão de segurança, e o jeito "óbvio" de escrever a função faz o
# contrário.
meia_conta = mundo.cliente(mundo.sem_loja("gerente"))
conferir("nenhum alerta", meia_conta.get("/api/alertas").get_json()["total"], 0)

secao("6) alerta que se resolve perde a marca e pode acender de novo")
with mundo.conexao() as conn:
    conn.execute("UPDATE estoque_insumo SET quantidade_atual = 500 WHERE insumo_id = ?", (baixo,))
alertas()  # é nesta leitura que a limpeza acontece
with mundo.conexao() as conn:
    conn.execute("UPDATE estoque_insumo SET quantidade_atual = 1 WHERE insumo_id = ?", (baixo,))
voltou = next((a for a in alertas()["alertas"] if a["titulo"] == "Insumo que acabou"), None)
conferir("voltou pra lista", voltou is not None, True)
conferir("e voltou NÃO lido", (voltou or {}).get("lido"), False)

secao("7) loja sem contagem vira um alerta só, não um por insumo")
with mundo.conexao() as conn:
    conn.execute("DELETE FROM contagem WHERE loja = ?", (LOJA,))
d = alertas()
conferir("um alerta de contagem", len(do_tipo(d, "contagem")), 1)
conferir("e nenhum de estoque dessa loja", len(do_tipo(d, "estoque")), 0)
for loja in mundo.LOJAS:
    contagem_aprovada_em(loja, hoje.isoformat())

secao("7b) a rampa antes do penhasco: contagem envelhecendo")
# Até 01/10 a confiança no saldo era binária: até 21 dias o sistema não
# dizia nada, e no dia 21 a história virava do avesso. Medido naquele dia:
# três lojas a 20 dias respondiam por 196 dos 235 "críticos" — e ninguém
# tinha sido avisado.
from app import DIAS_PRA_CONTAGEM_ENVELHECER, DIAS_SEM_CONTAGEM_PRA_AVISAR  # noqa: E402


def so_contou_em(loja, quando):
    """O sistema olha a contagem MAIS RECENTE, então pra envelhecer a loja
    não basta inserir uma antiga — as outras precisam sair."""
    with mundo.conexao() as conn:
        conn.execute("DELETE FROM contagem WHERE loja = ?", (loja,))
    contagem_aprovada_em(loja, quando)


so_contou_em(LOJA, (hoje - timedelta(days=DIAS_PRA_CONTAGEM_ENVELHECER + 2)).isoformat())
d = alertas()
envelhecendo = [a for a in do_tipo(d, "contagem") if "envelhecendo" in a["chave"]]
conferir("avisa antes de vencer", len(envelhecendo), 1)
conferir("sem ser grave: o saldo ainda vale", envelhecendo[0]["grave"], False)
conferir("e os alertas de insumo continuam de pé", len(do_tipo(d, "estoque")) > 0, True)

so_contou_em(LOJA, (hoje - timedelta(days=DIAS_PRA_CONTAGEM_ENVELHECER - 2)).isoformat())
d = alertas()
conferir("contagem fresca não vira aviso",
         [a for a in do_tipo(d, "contagem") if "envelhecendo" in a["chave"]], [])

secao("7c) a Home não conta loja cuja contagem venceu")
# O sininho dizia "o saldo dessa loja não vale até contar" e a Home somava
# os críticos dela no total assim mesmo — as duas telas se contradiziam.
so_contou_em(LOJA, (hoje - timedelta(days=DIAS_SEM_CONTAGEM_PRA_AVISAR + 3)).isoformat())
casa = admin.get("/api/home/gestao").get_json()["estoqueCritico"]
minha = next(l for l in casa["porLoja"] if l["loja"] == LOJA)
conferir("a loja aparece na lista", minha["loja"], LOJA)
conferir("marcada como fora do prazo", minha["contagemVale"], False)
conferir("com a idade junto", minha["diasSemContagem"], DIAS_SEM_CONTAGEM_PRA_AVISAR + 3)
conferir("e os críticos dela não entram no total", casa["total"], 0)
conferir("o painel manda a régua pra tela usar a mesma",
         casa["diasPraDesconfiar"], DIAS_SEM_CONTAGEM_PRA_AVISAR)

so_contou_em(LOJA, hoje.isoformat())
casa = admin.get("/api/home/gestao").get_json()["estoqueCritico"]
conferir("contada hoje, volta pra conta", casa["total"] > 0, True)

secao("8) backup: cobra, vem em primeiro, e some quando ela baixa")
with mundo.conexao() as conn:
    conn.execute("DELETE FROM execucao_rotina WHERE nome = 'backup_baixado'")
    conn.execute("DELETE FROM alerta_lido")
d = alertas()
conferir("acende", len(do_tipo(d, "backup")), 1)
conferir("vem em PRIMEIRO na lista", d["alertas"][0]["tipo"], "backup")
conferir("diz que nunca saiu", do_tipo(d, "backup")[0]["detalhe"], "Nenhuma cópia foi baixada ainda")
conferir("é grave", do_tipo(d, "backup")[0]["grave"], True)
conferir("o gerente não vê (backup é só admin)", len(do_tipo(alertas(gerente), "backup")), 0)

with mundo.conexao() as conn:
    conn.execute("INSERT INTO execucao_rotina (nome, ultima_em, detalhe) VALUES ('backup_baixado', ?, 'teste')",
                 ((datetime.now() - timedelta(days=8)).isoformat(),))
b = do_tipo(alertas(), "backup")
conferir("passados 8 dias, volta", len(b), 1)
conferir("conta os dias", b[0]["detalhe"], "A última foi baixada há 8 dias")
conferir("8 dias ainda não é grave", b[0]["grave"], False)

secao("9) 'lido' no backup vale só a semana")
admin.post("/api/alertas/lidos")
b = do_tipo(alertas(), "backup")[0]
ano, semana, _ = hoje.isocalendar()
conferir("ficou lido agora", b["lido"], True)
conferir("a chave carrega ano-semana", b["chave"], "backup|%d-%02d" % (ano, semana))
print("     -> como a chave muda de semana, o aviso volta não lido na próxima")

terminar()
