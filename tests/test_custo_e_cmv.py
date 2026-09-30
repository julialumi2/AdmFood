# -*- coding: utf-8 -*-
"""De onde sai o custo de um insumo, e quando um produto fica sem CMV.

É a conta em que o chefe da Julia decide preço de cardápio. Errar aqui
não dá erro em lugar nenhum — dá um número plausível e errado, e a
decisão acontece em cima dele semanas depois.

Duas regras carregam o peso todo:

1. QUEM GANHA quando o mesmo insumo tem três preços possíveis (o do
   cadastro, o da última compra, o da cotação). A ordem é: compra
   recente, cotação recente, cadastro, compra antiga, cotação antiga.
   Sem o corte de 90 dias, uma compra de dezembro de 2024 passava na
   frente do custo digitado agora (17/09).

2. FICHA MEIO PRECIFICADA NÃO VIRA CUSTO. Se um insumo da receita não
   tem preço, o produto fica SEM CMV em vez de sair com um custo menor
   que o real — senão ele pareceria mais lucrativo do que é, que é
   exatamente o erro que faz alguém baixar o preço de um produto que já
   dava prejuízo.
"""
from datetime import date, datetime, timedelta

from _base import Mundo, conferir, secao, terminar

mundo = Mundo()

LOJA = mundo.LOJA_DA_EQUIPE

from backend.armazenamento import (  # noqa: E402
    DIAS_PRECO_RECENTE,
    criar_cotacao,
    custo_em_uso_por_insumo,
    custos_da_ficha_por_item,
)

FORNECEDOR = mundo.fornecedor("Fornecedor do custo")
HOJE = datetime.now()
ANTIGO = (HOJE - timedelta(days=DIAS_PRECO_RECENTE + 30)).isoformat()
RECENTE = (HOJE - timedelta(days=2)).isoformat()


def compra(insumo_id, preco, quando):
    """Uma compra JÁ RECEBIDA — é ela que conta como preço pago."""
    pedido_id = mundo.pedido(LOJA, FORNECEDOR,
                             [{"insumo_id": insumo_id, "quantidade": 1, "preco": preco}],
                             status="recebido")
    with mundo.conexao() as conn:
        conn.execute("UPDATE pedido_compra SET criado_em = ?, recebido_em = ? WHERE id = ?",
                     (quando, quando, pedido_id))
        conn.execute("UPDATE pedido_compra_item SET quantidade_recebida = quantidade "
                     "WHERE pedido_id = ?", (pedido_id,))
    return pedido_id


def preco_de_cotacao(insumo_id, preco, quando, status="fechada", selecionado=1):
    cot = criar_cotacao("Cotação de %s" % quando[:10])
    with mundo.conexao() as conn:
        conn.execute("UPDATE cotacao SET status = ?, criado_em = ? WHERE id = ?",
                     (status, quando, cot))
        conn.execute("INSERT INTO cotacao_preco (cotacao_id, insumo_id, fornecedor_id, preco, "
                     "selecionado, criado_em) VALUES (?, ?, ?, ?, ?, ?)",
                     (cot, insumo_id, FORNECEDOR, preco, selecionado, quando))
    return cot


def custo(insumo_id):
    return custo_em_uso_por_insumo().get(insumo_id)


secao("1) insumo sem preço nenhum fica de fora — não vira zero")
# Custo zero faria o produto aparecer com 100% de margem.
SEM_PRECO = mundo.insumo("Insumo sem preço", lojas=[LOJA])
conferir("não aparece no mapa de custos", custo(SEM_PRECO), None)


secao("2) a ordem de quem ganha")
A = mundo.insumo("Insumo só com cadastro", lojas=[LOJA], custo=10.0)
conferir("só cadastro: vale o cadastro", custo(A)["valor"], 10.0)
conferir("e ele diz de onde veio", custo(A)["origem"], "cadastro")

compra(A, 12.0, RECENTE)
conferir("compra recente ganha do cadastro", custo(A)["valor"], 12.0)
conferir("origem vira compra", custo(A)["origem"], "compra")

B = mundo.insumo("Insumo com compra velha", lojas=[LOJA], custo=8.0)
compra(B, 30.0, ANTIGO)
conferir("compra de %d dias atrás NÃO passa na frente do cadastro" % (DIAS_PRECO_RECENTE + 30),
         custo(B)["valor"], 8.0)

C = mundo.insumo("Insumo só com compra velha", lojas=[LOJA])
compra(C, 30.0, ANTIGO)
conferir("mas se não há cadastro, a compra velha vale", custo(C)["valor"], 30.0)


secao("3) cotação ainda ABERTA só entra pelo preço escolhido")
# Enquanto ela está em andamento, um preço que um fornecedor mandou virava
# o custo do insumo sem ninguém ter decidido comprar dele (QA 22/09).
D = mundo.insumo("Insumo da cotação aberta", lojas=[LOJA], custo=5.0)
preco_de_cotacao(D, 99.0, RECENTE, status="aberta", selecionado=0)
conferir("preço solto de cotação aberta não entra", custo(D)["valor"], 5.0)

E = mundo.insumo("Insumo do preço escolhido", lojas=[LOJA], custo=5.0)
preco_de_cotacao(E, 7.0, RECENTE, status="aberta", selecionado=1)
conferir("mas o escolhido como vencedor entra", custo(E)["valor"], 7.0)
conferir("com origem cotação", custo(E)["origem"], "cotacao")


secao("4) preço fora de qualquer ordem de grandeza cai de volta pro cadastro")
# O erro clássico: o preço do quilo lançado num item vendido por grama.
# Ele multiplicava CMV, margem e Curva ABC por mil, sem aviso (QA 22/09).
F = mundo.insumo("Insumo do preço absurdo", lojas=[LOJA], custo=4.0)
compra(F, 4000.0, RECENTE)
conferir("ignora o absurdo", custo(F)["valor"], 4.0)
conferir("e avisa que ignorou", custo(F).get("ignorouSuspeito"), True)


secao("5) o custo do produto é a soma da ficha")
PAO = mundo.insumo("Pao do teste", lojas=[LOJA], custo=2.0)
CARNE = mundo.insumo("Carne do teste", lojas=[LOJA], custo=9.0)
QUEIJO = mundo.insumo("Queijo do custo", lojas=[LOJA], custo=6.0)

BURGER = mundo.produto("Burger do teste")
mundo.ficha(BURGER, LOJA, {PAO: 1, CARNE: 0.15, QUEIJO: 0.02})
esperado = 1 * 2.0 + 0.15 * 9.0 + 0.02 * 6.0        # 2 + 1.35 + 0.12
custos = custos_da_ficha_por_item(LOJA)
conferir("soma quantidade × preço de cada insumo", round(custos.get(BURGER, 0), 4), round(esperado, 4))


secao("6) FICHA MEIO PRECIFICADA NÃO VIRA CUSTO")
# A regra que mais importa comercialmente: um custo menor que o real faz
# o produto parecer mais lucrativo do que é.
MOLHO = mundo.insumo("Molho sem preço", lojas=[LOJA])      # sem custo nenhum
COMBO = mundo.produto("Combo do teste")
mundo.ficha(COMBO, LOJA, {PAO: 1, MOLHO: 0.05})
custos = custos_da_ficha_por_item(LOJA)
conferir("o produto fica SEM custo", COMBO in custos, False)
conferir("não sai com o custo parcial do pão", custos.get(COMBO), None)

# E volta assim que o insumo que faltava ganha preço.
with mundo.conexao() as conn:
    conn.execute("UPDATE insumo SET custo_referencia = 3.0 WHERE id = ?", (MOLHO,))
custos = custos_da_ficha_por_item(LOJA)
conferir("com o preço, o custo aparece", round(custos.get(COMBO, 0), 4), round(1 * 2.0 + 0.05 * 3.0, 4))


secao("7) produto sem ficha nenhuma também fica sem custo")
SEM_FICHA = mundo.produto("Produto sem ficha")
conferir("não aparece", SEM_FICHA in custos_da_ficha_por_item(LOJA), False)


secao("8) a ficha é POR LOJA")
# ZN e Simus dividem a mesma ficha desde 14/09, mas o Açaí tem a dele:
# o mesmo produto pode custar diferente em lojas diferentes.
OUTRA = next(l for l in mundo.LOJAS if l != LOJA)
PAO_CARO = mundo.insumo("Pao caro da outra loja", lojas=[OUTRA], custo=5.0)
SO_AQUI = mundo.produto("Produto de uma loja só")
mundo.ficha(SO_AQUI, LOJA, {PAO: 1})
mundo.ficha(SO_AQUI, OUTRA, {PAO_CARO: 1})
conferir("custa 2 nesta loja", round(custos_da_ficha_por_item(LOJA).get(SO_AQUI, 0), 2), 2.0)
conferir("e 5 na outra", round(custos_da_ficha_por_item(OUTRA).get(SO_AQUI, 0), 2), 5.0)


def receita(insumo_id, ingredientes, rendimento=None):
    """Liga uma receita num insumo. `rendimento` = quanto a batelada rende."""
    with mundo.conexao() as conn:
        if rendimento is not None:
            conn.execute("UPDATE insumo SET rendimento_receita = ? WHERE id = ?",
                         (rendimento, insumo_id))
        for ingrediente_id, quantidade in ingredientes.items():
            conn.execute("INSERT OR REPLACE INTO receita_insumo "
                         "(insumo_id, ingrediente_id, quantidade) VALUES (?, ?, ?)",
                         (insumo_id, ingrediente_id, quantidade))


secao("9) receita SEM rendimento fica inerte")
# Não dá pra dividir a batelada por um rendimento que ninguém preencheu.
# O insumo continua com o custo que já tinha, em vez de virar um número
# inventado.
SAL = mundo.insumo("Sal do tempero", lojas=[LOJA], custo=1.0)
PIMENTA = mundo.insumo("Pimenta do tempero", lojas=[LOJA], custo=20.0)
INERTE = mundo.insumo("Tempero sem rendimento", lojas=[LOJA], custo=7.0)
receita(INERTE, {SAL: 0.8, PIMENTA: 0.2})
conferir("continua com o custo do cadastro", custo(INERTE)["valor"], 7.0)
conferir("e a origem não vira receita", custo(INERTE)["origem"], "cadastro")


secao("10) mistura feita na casa custa o que foi dentro dela")
# Uma "compra" de Tempero Smash seria erro de cadastro: o custo da receita
# ganha de compra, cotação e cadastro.
TEMPERO = mundo.insumo("Tempero pronto", lojas=[LOJA], custo=999.0)   # cadastro errado de propósito
receita(TEMPERO, {SAL: 0.8, PIMENTA: 0.2}, rendimento=1)
esperado_tempero = (0.8 * 1.0 + 0.2 * 20.0) / 1      # 0,8 + 4 = 4,8
info = custo(TEMPERO)
conferir("vale a receita, não o cadastro", round(info["valor"], 4), round(esperado_tempero, 4))
conferir("e a origem é receita", info["origem"], "receita")

# O rendimento divide: a mesma batelada rendendo 4 custa um quarto por unidade.
LOTE = mundo.insumo("Tempero em lote", lojas=[LOJA], custo=999.0)
receita(LOTE, {SAL: 0.8, PIMENTA: 0.2}, rendimento=4)
conferir("batelada de 4 custa um quarto por unidade",
         round(custo(LOTE)["valor"], 4), round(4.8 / 4, 4))


secao("11) receita chama receita, em cascata")
# O Molho Especial leva Maionese da Casa, que tem receita própria.
MAIONESE = mundo.insumo("Maionese da casa", lojas=[LOJA])
receita(MAIONESE, {SAL: 0.5, PIMENTA: 0.1}, rendimento=1)   # 0,5 + 2 = 2,5
MOLHO_ESP = mundo.insumo("Molho especial", lojas=[LOJA])
receita(MOLHO_ESP, {MAIONESE: 2, SAL: 1}, rendimento=1)     # 2×2,5 + 1 = 6
conferir("a maionese custa o que foi nela", round(custo(MAIONESE)["valor"], 4), 2.5)
conferir("e o molho usa o custo dela", round(custo(MOLHO_ESP)["valor"], 4), 6.0)


secao("12) receita circular não derruba a tela")
# A leva B que leva A: erro de cadastro não pode virar recursão infinita.
CIRC_A = mundo.insumo("Circular A", lojas=[LOJA], custo=3.0)
CIRC_B = mundo.insumo("Circular B", lojas=[LOJA], custo=4.0)
receita(CIRC_A, {CIRC_B: 1}, rendimento=1)
receita(CIRC_B, {CIRC_A: 1}, rendimento=1)
mapa = custo_em_uso_por_insumo()      # não pode estourar
conferir("o mapa de custos ainda é montado", isinstance(mapa, dict), True)
conferir("e os outros insumos continuam lá", mapa.get(SAL, {}).get("valor"), 1.0)


secao("13) receita incompleta não derruba o custo que já valia")
SEM_PRECO_2 = mundo.insumo("Componente sem preço", lojas=[LOJA])
MISTURA = mundo.insumo("Mistura incompleta", lojas=[LOJA], custo=15.0)
receita(MISTURA, {SAL: 0.5, SEM_PRECO_2: 0.5}, rendimento=1)
conferir("fica o custo do cadastro", custo(MISTURA)["valor"], 15.0)
conferir("e não vira o custo parcial da receita", custo(MISTURA)["origem"], "cadastro")

terminar()
