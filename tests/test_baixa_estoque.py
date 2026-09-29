# -*- coding: utf-8 -*-
"""A baixa automática de estoque — o motor da Etapa 0.

É a peça mais perigosa do sistema: roda sozinha a cada 15 minutos e
mexe no saldo de estoque de quatro lojas. Errar aqui não dá erro na
tela, dá número errado no estoque, que vira compra errada semanas
depois.

Cobre:
  1. desconta venda × ficha técnica;
  2. é IDEMPOTENTE — resincronizar o mesmo dia não desconta em dobro
     (roda a cada 15 min pra hoje e toda madrugada pra ontem);
  3. corrige pra cima quando a venda diminui entre sincronizações;
  4. só vale a partir da data em que a loja ligou a baixa;
  5. venda que não casou com produto não desconta nada;
  6. combo com composição desconta cada componente na proporção;
  7. vínculo manual faz a venda passar a casar, inclusive no histórico.
"""
from datetime import date, timedelta

from _base import Mundo, conferir, secao, terminar

mundo = Mundo()
LOJA = mundo.LOJAS[0]
ONTEM = (date.today() - timedelta(days=1)).isoformat()

from backend.armazenamento import (  # noqa: E402  (precisa do banco do Mundo pronto)
    aplicar_baixa_estoque_dia,
    definir_composicao_produto_venda,
    definir_inicio_baixa_automatica,
    vincular_produto_venda_manualmente,
)

# Mundo: um hambúrguer que leva 1 pão e 100 g de carne.
pao = mundo.insumo("Pão", unidade="un", lojas=[LOJA], quantidade=100)
carne = mundo.insumo("Carne", unidade="g", lojas=[LOJA], quantidade=10000)
burger = mundo.produto("Burger")
mundo.ficha(burger, LOJA, {pao: 1, carne: 100})

secao("1) loja com a baixa desligada não desconta nada")
# Sem essa trava, carregar histórico ou ressincronizar um dia antigo
# descontaria meses de consumo do estoque de hoje.
mundo.desligar_baixa(LOJA)
mundo.venda(LOJA, ONTEM, "Burger", quantidade=3, item_cardapio_id=burger)
aplicar_baixa_estoque_dia(LOJA, ONTEM)
conferir("desligada, não desconta", mundo.estoque(pao, LOJA), 100)

secao("1b) e nem venda anterior ao dia em que ela ligou")
definir_inicio_baixa_automatica(LOJA, date.today().isoformat(), "teste")
aplicar_baixa_estoque_dia(LOJA, ONTEM)
conferir("venda de ontem, início hoje: não desconta", mundo.estoque(pao, LOJA), 100)

definir_inicio_baixa_automatica(LOJA, ONTEM, "teste")

secao("2) desconta venda × ficha técnica")
aplicar_baixa_estoque_dia(LOJA, ONTEM)
conferir("3 burgers = 3 pães", mundo.estoque(pao, LOJA), 97)
conferir("3 burgers = 300 g de carne", mundo.estoque(carne, LOJA), 9700)

secao("3) idempotente: rodar de novo não desconta em dobro")
for _ in range(3):
    aplicar_baixa_estoque_dia(LOJA, ONTEM)
conferir("pão continua em 97", mundo.estoque(pao, LOJA), 97)
conferir("carne continua em 9700", mundo.estoque(carne, LOJA), 9700)

secao("4) mais venda no mesmo dia desconta só a diferença")
mundo.venda(LOJA, ONTEM, "Burger", quantidade=2, item_cardapio_id=burger)
aplicar_baixa_estoque_dia(LOJA, ONTEM)
conferir("agora são 5 no total, não 3+5", mundo.estoque(pao, LOJA), 95)

secao("5) venda cancelada entre sincronizações devolve ao estoque")
with mundo.conexao() as conn:
    conn.execute("DELETE FROM venda_item WHERE unidade = ? AND quantidade = 2", (LOJA,))
aplicar_baixa_estoque_dia(LOJA, ONTEM)
conferir("voltou pra 97", mundo.estoque(pao, LOJA), 97)

secao("6) venda que não casou com produto não desconta nada")
antes = mundo.estoque(pao, LOJA)
mundo.venda(LOJA, ONTEM, "Nome que ninguém reconhece", quantidade=10, item_cardapio_id=None)
aplicar_baixa_estoque_dia(LOJA, ONTEM)
conferir("estoque intacto", mundo.estoque(pao, LOJA), antes)

secao("7) vínculo manual faz a venda passar a casar, inclusive a antiga")
vincular_produto_venda_manualmente("Nome que ninguém reconhece", burger, "teste")
aplicar_baixa_estoque_dia(LOJA, ONTEM)
conferir("as 10 antigas agora descontam", mundo.estoque(pao, LOJA), antes - 10)

secao("8) combo com composição desconta cada componente na proporção")
queijo = mundo.insumo("Queijo", unidade="un", lojas=[LOJA], quantidade=50)
duplo = mundo.produto("Burger Duplo")
mundo.ficha(duplo, LOJA, {pao: 1, queijo: 2})
# "Combo" = meio Burger + meio Burger Duplo, na média
definir_composicao_produto_venda("Combo à escolha", [
    {"itemCardapioId": burger, "quantidade": 0.5},
    {"itemCardapioId": duplo, "quantidade": 0.5},
], "teste")
pao_antes, queijo_antes = mundo.estoque(pao, LOJA), mundo.estoque(queijo, LOJA)
mundo.venda(LOJA, ONTEM, "Combo à escolha", quantidade=4, item_cardapio_id=None)
aplicar_baixa_estoque_dia(LOJA, ONTEM)
# 4 combos: 2 Burger (2 pães + 200 g) + 2 Duplo (2 pães + 4 queijos)
conferir("pão: 4 a menos", mundo.estoque(pao, LOJA), pao_antes - 4)
conferir("queijo: 4 a menos", mundo.estoque(queijo, LOJA), queijo_antes - 4)

secao("9) o combo também é idempotente")
aplicar_baixa_estoque_dia(LOJA, ONTEM)
aplicar_baixa_estoque_dia(LOJA, ONTEM)
conferir("pão não mexeu", mundo.estoque(pao, LOJA), pao_antes - 4)
conferir("queijo não mexeu", mundo.estoque(queijo, LOJA), queijo_antes - 4)

secao("10) o estoque pode ficar negativo, de propósito")
# Sinal real de divergência entre teórico e físico. Travar em zero
# esconderia justamente o que precisa aparecer.
vazio = mundo.insumo("Insumo quase acabando", unidade="un", lojas=[LOJA], quantidade=1)
so_dele = mundo.produto("Só usa o que acabou")
mundo.ficha(so_dele, LOJA, {vazio: 1})
mundo.venda(LOJA, ONTEM, "Só usa o que acabou", quantidade=5, item_cardapio_id=so_dele)
aplicar_baixa_estoque_dia(LOJA, ONTEM)
conferir("ficou negativo em vez de parar em zero", mundo.estoque(vazio, LOJA), -4)

terminar()
