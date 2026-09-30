# -*- coding: utf-8 -*-
"""O link que o fornecedor abre pra mandar preço.

É a única porta do sistema que fica aberta sem login: quem tem o link
escreve no banco. E o que ele escreve vira preço de insumo, que vira
CMV, que vira margem — ou seja, um número errado entrando aqui
contamina a decisão de cardápio semanas depois, sem ninguém ver de onde
veio.

Cada trava aqui nasceu de um problema real:

- Infinity/NaN passavam no `> 0` e viravam custo de insumo (QA 25/09)
- Preço acima do razoável: o fornecedor digitava o valor do quilo num
  item vendido por grama (teste das 4 lojas, 22/09)
- Cotação já encerrada continuava aceitando preço pelo link, e esse
  preço virava custo sem aparecer em lugar nenhum (QA 22/09)
- Prazo no passado nascia vencido (QA 22/09)
- "Não vendo" e "em falta" são coisas diferentes: o primeiro tranca o
  insumo pras próximas cotações do fornecedor, o segundo não (25/09)
"""
from datetime import datetime, timedelta

from _base import Mundo, conferir, secao, terminar

mundo = Mundo()

LOJA = mundo.LOJA_DA_EQUIPE
FUTURO = (datetime.now() + timedelta(days=3)).isoformat(timespec="minutes")
PASSADO = (datetime.now() - timedelta(days=1)).isoformat(timespec="minutes")

admin = mundo.cliente(mundo.ADMIN)
publico = mundo.app.test_client()          # sem login: é assim que o fornecedor entra

# ---------------------------------------------------------------- cenário
QUEIJO = mundo.insumo("Queijo do teste", lojas=[LOJA], unidade="kg")
BACON = mundo.insumo("Bacon do teste", lojas=[LOJA], unidade="kg")
ALHO = mundo.insumo("Alho do teste", lojas=[LOJA], unidade="kg")
FORNECEDOR = mundo.fornecedor("Distribuidora do Teste")

from backend.armazenamento import criar_cotacao  # noqa: E402


def montar_cotacao(titulo, insumos):
    cotacao_id = criar_cotacao(titulo)
    with mundo.conexao() as conn:
        for insumo_id in insumos:
            conn.execute("INSERT INTO cotacao_item (cotacao_id, insumo_id, quantidade_total) "
                         "VALUES (?, ?, ?)", (cotacao_id, insumo_id, 10))
    return cotacao_id


def convidar(cotacao_id, prazo=FUTURO, fornecedor=None):
    """Cada seção que mexe em "não vendo" pede um fornecedor NOVO.

    O fornecedor acumula estado entre as cotações — ele fica ligado ao
    que já cotou, e o "não vendo" tranca o insumo pras próximas. Isso é
    o sistema funcionando; reaproveitar o mesmo fornecedor aqui faria
    uma seção derrubar a outra e eu ia culpar o código."""
    fornecedor = fornecedor or FORNECEDOR
    r = admin.post("/api/cotacoes/%d/convites" % cotacao_id,
                   json={"prazoValidade": prazo, "fornecedorIds": [fornecedor]})
    with mundo.conexao() as conn:
        linha = conn.execute("SELECT token FROM cotacao_convite WHERE cotacao_id = ? "
                             "AND fornecedor_id = ?", (cotacao_id, fornecedor)).fetchone()
    return r, (linha["token"] if linha else None)


def responder(token, **corpo):
    return publico.post("/api/cotacoes/convite/%s/responder" % token, json=corpo)


secao("1) o caminho feliz: o fornecedor abre o link e manda preço")
cot = montar_cotacao("Cotação do teste", [QUEIJO, BACON, ALHO])
r, token = convidar(cot)
conferir("o convite foi criado", r.status_code, 200)
conferir("e tem token", bool(token), True)

pagina = publico.get("/api/cotacoes/convite/%s" % token)
conferir("o link abre sem login", pagina.status_code, 200)
nomes = [i["nome"] for i in (pagina.get_json().get("itens") or [])]
conferir("e mostra os itens da cotação", sorted(nomes),
         sorted(["Queijo do teste", "Bacon do teste", "Alho do teste"]))

conferir("o preço é aceito", responder(token, precos={str(QUEIJO): 42.50}).status_code, 200)


secao("2) o mesmo token não responde duas vezes")
# Sem isso, quem tem o link reescreve o preço depois da compradora decidir.
conferir("segunda tentativa é recusada", responder(token, precos={str(BACON): 9}).status_code, 400)


secao("3) Infinity e NaN não viram custo de insumo")
# Os dois passam num `preco > 0` e chegariam em CMV e margem (QA 25/09).
cot2 = montar_cotacao("Cotação dos números estranhos", [QUEIJO, BACON])
_, t2 = convidar(cot2)
for rotulo, valor in (("Infinity", float("inf")), ("-Infinity", float("-inf")), ("NaN", float("nan"))):
    conferir("recusa " + rotulo, responder(t2, precos={str(QUEIJO): valor}).status_code, 400)
conferir("e o convite continua aberto pra ele tentar de novo",
         responder(t2, precos={str(QUEIJO): 30}).status_code, 200)


secao("4) preço zero, negativo e absurdo")
cot3 = montar_cotacao("Cotação dos limites", [QUEIJO, BACON])
_, t3 = convidar(cot3)
conferir("recusa zero", responder(t3, precos={str(QUEIJO): 0}).status_code, 400)
conferir("recusa negativo", responder(t3, precos={str(QUEIJO): -5}).status_code, 400)
# O caso real: digitou o preço do quilo num item vendido por grama.
conferir("recusa acima de um milhão por unidade",
         responder(t3, precos={str(QUEIJO): 1_000_001}).status_code, 400)
conferir("mas aceita um preço alto plausível",
         responder(t3, precos={str(QUEIJO): 999_999}).status_code, 200)


secao("5) prazo vencido")
cot4 = montar_cotacao("Cotação do prazo", [QUEIJO])
r4, _ = convidar(cot4, prazo=PASSADO)
conferir("nem deixa criar convite com prazo no passado", r4.status_code, 400)

# Vencer depois de criado: é o caso de quem demora pra responder.
cot5 = montar_cotacao("Cotação que venceu", [QUEIJO])
_, t5 = convidar(cot5)
with mundo.conexao() as conn:
    conn.execute("UPDATE cotacao_convite SET prazo_validade = ? WHERE token = ?", (PASSADO, t5))
conferir("prazo vencido recusa o preço", responder(t5, precos={str(QUEIJO): 20}).status_code, 400)


secao("6) cotação encerrada não aceita mais preço pelo link")
# Era a pior das três: o preço entrava, virava custo do insumo, e não
# aparecia em tela nenhuma porque a cotação já estava fechada (QA 22/09).
cot6 = montar_cotacao("Cotação encerrada", [QUEIJO])
_, t6 = convidar(cot6)
with mundo.conexao() as conn:
    conn.execute("UPDATE cotacao SET status = 'fechada' WHERE id = ?", (cot6,))
r6 = responder(t6, precos={str(QUEIJO): 77})
conferir("recusa com 409", r6.status_code, 409)
conferir("e explica por quê", "encerrada" in (r6.get_json().get("erro") or ""), True)


secao("7) fornecedor desativado perde o link")
cot7 = montar_cotacao("Cotação do desativado", [QUEIJO])
_, t7 = convidar(cot7)
with mundo.conexao() as conn:
    conn.execute("UPDATE fornecedor SET ativo = 0 WHERE id = ?", (FORNECEDOR,))
conferir("o link responde 410", responder(t7, precos={str(QUEIJO): 15}).status_code, 410)
with mundo.conexao() as conn:
    conn.execute("UPDATE fornecedor SET ativo = 1 WHERE id = ?", (FORNECEDOR,))


secao("8) token inventado não abre nada")
conferir("GET com token falso", publico.get("/api/cotacoes/convite/naoexiste").status_code, 404)
conferir("POST com token falso", responder("naoexiste", precos={str(QUEIJO): 1}).status_code, 404)


secao("9) item fora do convite é descartado, não gravado")
# A tela dele pode estar aberta desde antes de a compradora tirar um item.
cot9 = montar_cotacao("Cotação de dois itens", [QUEIJO, BACON])
_, t9 = convidar(cot9)
FORA = mundo.insumo("Insumo que nao esta na cotacao", lojas=[LOJA], unidade="kg")
conferir("responde ok", responder(t9, precos={str(QUEIJO): 11, str(FORA): 99}).status_code, 200)
with mundo.conexao() as conn:
    gravados = [l["insumo_id"] for l in conn.execute(
        "SELECT insumo_id FROM cotacao_preco WHERE cotacao_id = ?", (cot9,))]
conferir("gravou o item do convite", QUEIJO in gravados, True)
conferir("e NÃO gravou o de fora", FORA in gravados, False)


secao("10) 'não vendo' tranca pras próximas; 'em falta' não")
F10 = mundo.fornecedor("Distribuidora das recusas")
cot10 = montar_cotacao("Cotação das recusas", [QUEIJO, BACON, ALHO])
_, t10 = convidar(cot10, fornecedor=F10)
conferir("responde ok", responder(t10, naoVende=[BACON], emFalta=[ALHO]).status_code, 200)
with mundo.conexao() as conn:
    trancados = [l["insumo_id"] for l in conn.execute(
        "SELECT insumo_id FROM fornecedor_nao_vende WHERE fornecedor_id = ?", (F10,))]
conferir("'não vendo' trancou o bacon", BACON in trancados, True)
conferir("'em falta' NÃO trancou o alho", ALHO in trancados, False)


secao("11) marcou os dois no mesmo item: 'em falta' ganha")
# É o que não tranca o insumo — o erro custa menos.
F11 = mundo.fornecedor("Distribuidora dos dois marcados")
cot11 = montar_cotacao("Cotação dos dois marcados", [QUEIJO])
_, t11 = convidar(cot11, fornecedor=F11)
conferir("responde ok", responder(t11, naoVende=[QUEIJO], emFalta=[QUEIJO]).status_code, 200)
with mundo.conexao() as conn:
    tipo = conn.execute("SELECT tipo FROM cotacao_recusa WHERE cotacao_id = ? AND insumo_id = ?",
                        (cot11, QUEIJO)).fetchone()
conferir("gravou como em falta", tipo["tipo"] if tipo else None, "em_falta")
with mundo.conexao() as conn:
    trancado = conn.execute("SELECT 1 FROM fornecedor_nao_vende WHERE fornecedor_id = ? "
                            "AND insumo_id = ?", (F11, QUEIJO)).fetchone()
conferir("e não trancou o insumo", trancado is None, True)


secao("12) preço junto com 'não vendo' no mesmo item: o preço manda")
F12 = mundo.fornecedor("Distribuidora do preço com recusa")
cot12 = montar_cotacao("Cotação do preço com recusa", [BACON])
_, t12 = convidar(cot12, fornecedor=F12)
conferir("responde ok", responder(t12, precos={str(BACON): 33}, naoVende=[BACON]).status_code, 200)
with mundo.conexao() as conn:
    tem_preco = conn.execute("SELECT 1 FROM cotacao_preco WHERE cotacao_id = ? AND insumo_id = ?",
                             (cot12, BACON)).fetchone()
    tem_recusa = conn.execute("SELECT 1 FROM cotacao_recusa WHERE cotacao_id = ? AND insumo_id = ?",
                              (cot12, BACON)).fetchone()
conferir("gravou o preço", tem_preco is not None, True)
conferir("e ignorou a recusa", tem_recusa is None, True)


secao("13) o link é público, mas só ele")
# Quem tem o token responde preço; não ganha nada além disso.
for rota in ("/api/cotacoes", "/api/insumos", "/api/fornecedores"):
    conferir("sem login, %s continua fechada" % rota, publico.get(rota).status_code in (401, 403), True)

secao("14) 'não vendo' vale pra próxima cotação, não só pra esta")
# Descobri isto escrevendo o teste: o fornecedor que marcou "não vendo"
# para de receber aquele insumo nos links seguintes — e se era o único
# item, ele nem recebe convite. É o comportamento certo (link vazio não
# serve pra nada), mas não estava travado em lugar nenhum.
F14 = mundo.fornecedor("Distribuidora que nao vende bacon")
cot14a = montar_cotacao("Primeira cotação", [QUEIJO, BACON])
_, t14a = convidar(cot14a, fornecedor=F14)
conferir("responde marcando o bacon", responder(t14a, precos={str(QUEIJO): 25},
                                                naoVende=[BACON]).status_code, 200)

cot14b = montar_cotacao("Segunda cotação, mesmos itens", [QUEIJO, BACON])
_, t14b = convidar(cot14b, fornecedor=F14)
pagina = publico.get("/api/cotacoes/convite/%s" % t14b)
nomes = [i["nome"] for i in (pagina.get_json().get("itens") or [])]
conferir("o queijo continua no link dele", "Queijo do teste" in nomes, True)
conferir("o bacon NÃO volta", "Bacon do teste" in nomes, False)

cot14c = montar_cotacao("Cotação só do bacon", [BACON])
r14c, t14c = convidar(cot14c, fornecedor=F14)
conferir("cotação só do que ele não vende: sem convite pra ele", t14c, None)
# E não devolve um "ok" vazio: devolve um erro que diz o que fazer.
erro14 = (r14c.get_json() or {}).get("erro") or ""
conferir("responde com erro, não com sucesso vazio", r14c.status_code >= 400, True)
conferir("cita o fornecedor", "Distribuidora que nao vende bacon" in erro14, True)
conferir("e diz onde resolver", "coluna Fornecedores" in erro14, True)

terminar()
