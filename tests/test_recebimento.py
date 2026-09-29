# -*- coding: utf-8 -*-
"""Confirmar recebimento — a única ação que soma no estoque a partir de
um pedido de compra.

É a parte do sistema onde errar custa dinheiro de verdade: estoque
somado duas vezes vira compra que não precisava; estoque somado a menos
vira falta no meio do serviço. E nada disso dá erro na tela — só aparece
semanas depois, como número que não bate.

Cobre:
  1. confirmar soma no estoque;
  2. confirmar DUAS VEZES não soma duas vezes (dois cliques rápidos, ou
     a tela reenviando);
  3. o que vale é o que CHEGOU, não o que foi pedido;
  4. item que veio e não estava no pedido entra como linha nova, em vez
     de a loja ficar com mercadoria fora do sistema;
  5. item que não veio é registrado como faltando;
  6. nota fiscal que não bate com os itens é sinalizada.
"""
from _base import Mundo, conferir, secao, terminar

mundo = Mundo()
LOJA = mundo.LOJAS[0]

from backend.armazenamento import (  # noqa: E402
    buscar_pedido,
    confirmar_recebimento_pedido,
)

fornecedor = mundo.fornecedor("Distribuidora do Teste")
carne = mundo.insumo("Carne do recebimento", unidade="kg", lojas=[LOJA], quantidade=10)
pao = mundo.insumo("Pão do recebimento", unidade="un", lojas=[LOJA], quantidade=100)

secao("1) confirmar soma no estoque")
pedido = mundo.pedido(LOJA, fornecedor, [
    {"insumo_id": carne, "quantidade": 5, "preco": 40.0},
    {"insumo_id": pao, "quantidade": 50, "preco": 1.0},
])
r = confirmar_recebimento_pedido(pedido, "Quem recebeu", 250.0, [
    {"insumoId": carne, "quantidade": 5, "precoUnitario": 40.0},
    {"insumoId": pao, "quantidade": 50, "precoUnitario": 1.0},
])
conferir("não é recebimento repetido", r.get("jaRecebido"), None)
conferir("carne: 10 + 5", mundo.estoque(carne, LOJA), 15)
conferir("pão: 100 + 50", mundo.estoque(pao, LOJA), 150)
conferir("o pedido virou recebido", buscar_pedido(pedido)["status"], "recebido")

secao("2) confirmar DE NOVO não soma de novo")
# Dois cliques quase simultâneos somavam duas vezes (QA 22/09). Aqui é o
# clique repetido, que é o caso que sobra depois da trava de escrita.
r2 = confirmar_recebimento_pedido(pedido, "Quem recebeu", 250.0, [
    {"insumoId": carne, "quantidade": 5, "precoUnitario": 40.0},
])
conferir("diz que já foi recebido", r2.get("jaRecebido"), True)
conferir("carne continua em 15", mundo.estoque(carne, LOJA), 15)
conferir("pão continua em 150", mundo.estoque(pao, LOJA), 150)

secao("3) o que vale é o que CHEGOU, não o que foi pedido")
# Pediu 10 kg, chegaram 7. O estoque tem que subir 7.
pedido2 = mundo.pedido(LOJA, fornecedor, [{"insumo_id": carne, "quantidade": 10, "preco": 40.0}])
antes = mundo.estoque(carne, LOJA)
confirmar_recebimento_pedido(pedido2, "Quem recebeu", 280.0, [
    {"insumoId": carne, "quantidade": 7, "precoUnitario": 40.0},
])
conferir("somou 7, não 10", mundo.estoque(carne, LOJA), antes + 7)

secao("4) item que veio e não estava no pedido entra mesmo assim")
# Sem isso a loja ficava com mercadoria fora do sistema (QA 22/09).
queijo = mundo.insumo("Queijo surpresa", unidade="kg", lojas=[LOJA], quantidade=0)
pedido3 = mundo.pedido(LOJA, fornecedor, [{"insumo_id": pao, "quantidade": 10, "preco": 1.0}])
confirmar_recebimento_pedido(pedido3, "Quem recebeu", 40.0, [
    {"insumoId": pao, "quantidade": 10, "precoUnitario": 1.0},
    {"insumoId": queijo, "quantidade": 3, "precoUnitario": 10.0},
])
conferir("o queijo que ninguém pediu entrou no estoque", mundo.estoque(queijo, LOJA), 3)

secao("5) item que não veio fica registrado como faltando")
pedido4 = mundo.pedido(LOJA, fornecedor, [
    {"insumo_id": carne, "quantidade": 4, "preco": 40.0},
    {"insumo_id": pao, "quantidade": 20, "preco": 1.0},
])
r4 = confirmar_recebimento_pedido(pedido4, "Quem recebeu", 160.0, [
    {"insumoId": carne, "quantidade": 4, "precoUnitario": 40.0},
], manter_pendente=False)
faltando = r4.get("faltando") or []
conferir("o pão entrou na lista do que faltou",
         [f["nome"] for f in faltando], ["Pão do recebimento"])
conferir("e diz quanto faltou", faltando[0]["falta"] if faltando else None, 20)

def divergiu(pedido_id):
    """buscar_pedido() não traz essa coluna — lê direto."""
    with mundo.conexao() as conn:
        linha = conn.execute("SELECT divergencia_nf FROM pedido_compra WHERE id = ?",
                             (pedido_id,)).fetchone()
    return bool(linha["divergencia_nf"])


secao("6) nota fiscal que não bate é sinalizada")
# 4 kg a R$ 40 = R$ 160. A nota veio R$ 500.
pedido5 = mundo.pedido(LOJA, fornecedor, [{"insumo_id": carne, "quantidade": 4, "preco": 40.0}])
confirmar_recebimento_pedido(pedido5, "Quem recebeu", 500.0, [
    {"insumoId": carne, "quantidade": 4, "precoUnitario": 40.0},
])
conferir("marcou divergência de NF", divergiu(pedido5), True)

pedido6 = mundo.pedido(LOJA, fornecedor, [{"insumo_id": carne, "quantidade": 4, "preco": 40.0}])
confirmar_recebimento_pedido(pedido6, "Quem recebeu", 160.0, [
    {"insumoId": carne, "quantidade": 4, "precoUnitario": 40.0},
])
conferir("nota que bate não é divergência", divergiu(pedido6), False)

secao("7) centavo de arredondamento não vira divergência")
# 3 x 33,33 = 99,99. Nota de 100,00 é a mesma compra, não um problema.
pedido7 = mundo.pedido(LOJA, fornecedor, [{"insumo_id": carne, "quantidade": 3, "preco": 33.33}])
confirmar_recebimento_pedido(pedido7, "Quem recebeu", 100.0, [
    {"insumoId": carne, "quantidade": 3, "precoUnitario": 33.33},
])
conferir("1 centavo de diferença passa", divergiu(pedido7), False)

secao("8) pedido que não existe não quebra")
conferir("devolve None", confirmar_recebimento_pedido(999999, "X", 0, []), None)

terminar()
