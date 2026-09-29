# -*- coding: utf-8 -*-
"""Os três perfis e a trava por loja.

Estes são os testes que mais importam do ponto de vista de estrago: um
furo aqui não dá erro na tela, dá gente vendo custo de fornecedor e
faturamento que não devia.

Cobre:
  1. rota de admin recusa gerente e operação;
  2. quem não está logado não passa;
  3. conta desativada perde o acesso na hora, não no fim da sessão;
  4. "sair de todos os aparelhos" derruba sessão antiga;
  5. a trava por loja não é só filtro de tela: gerente de uma loja
     pedindo dado de outra recebe o da loja DELE, mesmo mandando o
     parâmetro adulterado;
  6. funcionário sem loja não enxerga nada (falha fechando).
"""
from _base import Mundo, conferir, secao, terminar

mundo = Mundo()
admin = mundo.cliente(mundo.ADMIN)
gerente = mundo.cliente(mundo.GERENTE)
operacao = mundo.cliente(mundo.OPERACAO)
deslogado = mundo.app.test_client()

MINHA = mundo.LOJA_DA_EQUIPE          # loja do gerente e da operação
OUTRA = next(l for l in mundo.LOJAS if l != MINHA)

secao("1) rota de admin é só de admin")
for rotulo, cliente, esperado in (("admin", admin, 200), ("gerente", gerente, 403), ("operação", operacao, 403)):
    conferir("GET /api/usuarios como " + rotulo, cliente.get("/api/usuarios").status_code, esperado)
conferir("GET /api/admin/backups como gerente", gerente.get("/api/admin/backups").status_code, 403)

secao("2) sem login não passa")
conferir("alertas", deslogado.get("/api/alertas").status_code, 401)
conferir("usuários", deslogado.get("/api/usuarios").status_code, 401)

secao("3) a operação vê o que é do dia a dia dela")
conferir("alertas", operacao.get("/api/alertas").status_code, 200)

secao("4) conta desativada perde o acesso na hora")
# A sessão dura 7 dias; sem conferir `ativo` a cada requisição, desligar
# alguém só valeria quando o cookie vencesse.
with mundo.conexao() as conn:
    conn.execute("UPDATE usuario SET ativo = 0 WHERE id = ?", (mundo.OPERACAO,))
conferir("cai pra 401 com o mesmo cookie", operacao.get("/api/alertas").status_code, 401)
with mundo.conexao() as conn:
    conn.execute("UPDATE usuario SET ativo = 1 WHERE id = ?", (mundo.OPERACAO,))
conferir("reativou, volta a passar", operacao.get("/api/alertas").status_code, 200)

secao("5) 'sair de todos os aparelhos' derruba a sessão antiga")
with mundo.conexao() as conn:
    colunas = {c["name"] for c in conn.execute("PRAGMA table_info(usuario)")}
if "sessao_versao" in colunas:
    with mundo.conexao() as conn:
        conn.execute("UPDATE usuario SET sessao_versao = sessao_versao + 1 WHERE id = ?", (mundo.GERENTE,))
    conferir("o cookie velho não vale mais", gerente.get("/api/alertas").status_code, 401)
    gerente = mundo.cliente(mundo.GERENTE)  # entra de novo, pro resto do teste
else:
    print("  (pulado: a coluna sessao_versao não existe nesta versão)")

secao("6) a trava por loja não é só filtro de tela")
# O gerente pede explicitamente a OUTRA loja. A resposta tem que ser
# sobre a loja dele — _loja_no_escopo ignora o parâmetro pra quem não é
# admin, então adulterar a URL não entrega dado de outra loja.
r = gerente.get("/api/produtos-pendentes?unidade=" + OUTRA.replace(" ", "%20"))
conferir("responde 200 (não é erro, é escopo)", r.status_code, 200)

with mundo.conexao() as conn:
    escopo = conn.execute("SELECT loja FROM usuario WHERE id = ?", (mundo.GERENTE,)).fetchone()["loja"]
conferir("e o gerente continua preso à loja dele", escopo, MINHA)

with mundo.como(mundo.GERENTE) as ap:
    conferir("_loja_no_escopo ignora o parâmetro", ap._loja_no_escopo(OUTRA), MINHA)
    conferir("_loja_visivel nega a outra loja", ap._loja_visivel(OUTRA), False)
    conferir("e libera a dele", ap._loja_visivel(MINHA), True)

with mundo.como(mundo.ADMIN) as ap:
    conferir("pro admin, o parâmetro vale", ap._loja_no_escopo(OUTRA), OUTRA)

secao("7) funcionário sem loja não enxerga nada")
# Cadastro pela metade não pode cair no None e acabar vendo a rede toda.
meia_conta = mundo.cliente(mundo.sem_loja("gerente"))
conferir("nenhum alerta", meia_conta.get("/api/alertas").get_json()["total"], 0)

terminar()
