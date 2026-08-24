"""
Carga inicial da ficha técnica — feita a partir da descrição de cada
produto no painel da Cardápio Web (portal.cardapioweb.com/cardapio/produtos),
lida manualmente e repassada em 2026-08-24. A maioria dos ingredientes não
tem gramatura na descrição (só o hambúrguer, "110g") — quando não sabemos
a quantidade, fica None, editável depois pela tela de Ficha Técnica.

Idempotente: usa nome como chave (item_cardapio.nome é UNIQUE, insumo é
buscado por nome antes de criar), então pode rodar de novo sem duplicar —
útil pra ir adicionando categorias novas (combos, sobremesas) depois.

Uso:
  python preencher_ficha_tecnica_inicial.py
"""

import sys

from config import LOJAS
from backend.armazenamento import (
    inicializar_banco,
    buscar_insumo_por_nome,
    criar_insumo,
    criar_item_cardapio,
    definir_ficha_tecnica,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# (nome, categoria, [(insumo, unidade_medida, quantidade_ou_None), ...])
ITENS = [
    ("BIG ART", "Smash - Exclusivos", [
        ("Pão brioche", "un", None),
        ("Smashburger 110g", "un", 2),
        ("Alface americana", "g", None),
        ("Queijo", "g", None),
        ("Molho especial", "ml", None),
        ("Cebola roxa", "g", None),
        ("Picles", "g", None),
    ]),
    ("CRISPY", "Smash - Exclusivos", [
        ("Pão brioche", "un", 1),
        ("Smashburger 110g", "un", 1),
        ("Queijo cheddar", "g", None),
        ("Catupiry Original", "g", None),
        ("Cebola crispy", "g", None),
    ]),
    ("Tasty Bacon", "Smash - Exclusivos", [
        ("Pão brioche", "un", 1),
        ("Smashburger 110g", "un", 1),
        ("Queijo", "g", None),
        ("Bacon", "g", None),
        ("Alface americana", "g", None),
        ("Cebola roxa", "g", None),
        ("Picles", "g", None),
        ("Tomate", "g", None),
        ("Molho tasty", "ml", None),
    ]),
    ("PROVOLONE", "Smash - Exclusivos", [
        ("Pão brioche", "un", 1),
        ("Smashburger 110g", "un", 1),
        ("Queijo cheddar", "g", None),
        ("Provolone empanado", "g", None),
        ("Rúcula", "g", None),
        ("Geleia de pimenta", "g", None),
    ]),
    ("Artesanos", "Smash - Exclusivos", [
        ("Pão australiano", "un", 1),
        ("Smashburger 110g", "un", 1),
        ("Queijo gorgonzola", "g", None),
        ("Tomate", "g", None),
        ("Bacon empanado", "g", None),
        ("Geleia de pimenta", "g", None),
    ]),
    ("Big Jump", "Smash - Exclusivos", [
        ("Pão brioche", "un", 1),
        ("Smashburger 110g", "un", 2),
        ("Queijo mussarela", "g", None),
        ("Catupiry empanado", "g", None),
        ("Chimichurri", "ml", None),
        ("Sweet barbecue", "ml", None),
    ]),
    ("Dr Brie", "Smash - Exclusivos", [
        ("Pão brioche", "un", 1),
        ("Smashburger 110g", "un", 1),
        ("Queijo cheddar", "g", None),
        ("Cebola caramelizada", "g", None),
        ("Bacon", "g", None),
        ("Brie empanado", "g", None),
    ]),
    ("Hermano", "Smash - Exclusivos", [
        ("Pão brioche", "un", 1),
        ("Smashburger 110g", "un", 1),
        ("Queijo", "g", None),
        ("Chimichurri", "ml", None),
        ("Bacon", "g", None),
    ]),
    ("TRADICIONAL", "Smash - Clássicos", [
        ("Pão brioche", "un", 1),
        ("Smashburger 110g", "un", 1),
        ("Queijo cheddar", "g", None),
    ]),
    ("CLASSICO", "Smash - Clássicos", [
        ("Pão brioche", "un", 1),
        ("Smashburger 110g", "un", 1),
        ("Alface americana", "g", None),
        ("Tomate", "g", None),
        ("Cebola roxa", "g", None),
        ("Queijo cheddar", "g", None),
        ("Molho especial", "ml", None),
    ]),
    ("BACON", "Smash - Clássicos", [
        ("Pão brioche", "un", 1),
        ("Smashburger 110g", "un", 1),
        ("Queijo cheddar", "g", None),
        ("Cebola caramelizada", "g", None),
        ("Bacon", "g", None),
    ]),
    ("CHICKEN", "Smash - Clássicos", [
        ("Pão brioche", "un", 1),
        ("Burger de frango", "un", 1),
        ("Alface americana", "g", None),
        ("Tomate", "g", None),
        ("Cebola roxa", "g", None),
        ("Maionese branca", "g", None),
    ]),
    ("BURGER VEG", "Smash - Clássicos", [
        ("Pão brioche", "un", 1),
        ("Burger veggie (feijão fradinho)", "un", 1),
        ("Cebola roxa", "g", None),
        ("Alface americana", "g", None),
        ("Tomate", "g", None),
        ("Molho especial", "ml", None),
    ]),
    ("Inglaterra", "Smash - Clássicos", [
        ("Pão australiano", "un", 1),
        ("Smashburger 110g", "un", 1),
        ("Queijo cheddar", "g", None),
        ("Cebola caramelizada", "g", None),
    ]),
    ("BATATA INDIVIDUAL", "Porções", [
        ("Batata frita Crinkle", "g", 100),
        ("Páprica", "g", None),
    ]),
    ("BATATA MÉDIA", "Porções", [
        ("Batata frita Crinkle", "g", 200),
        ("Páprica", "g", None),
    ]),
    ("BATATA C/ CHEDDAR E BACON", "Porções", [
        ("Batata frita Crinkle", "g", None),
        ("Páprica", "g", None),
        ("Queijo cheddar", "g", None),
        ("Bacon", "g", None),
    ]),
    ("DADINHOS DE TAPIOCA", "Porções", [
        ("Dadinho de tapioca c/ queijo coalho", "un", 8),
        ("Geleia de pimenta", "g", None),
    ]),
    ("Franguitos", "Porções", [
        ("Franguinho empanado", "g", 230),
    ]),
    ("Smash Bowl", "Salada", [
        ("Smashburger 110g", "un", 1),
        ("Queijo", "g", 14),
        ("Alface americana", "g", 100),
        ("Tomate", "g", 30),
        ("Cebola roxa", "g", 27),
        ("Cenoura ralada", "g", 15),
        ("Azeite", "ml", None),
        ("Limão", "un", None),
    ]),
]


def _buscar_ou_criar_insumo_id(nome, unidade_medida, cache):
    if nome in cache:
        return cache[nome]
    existente = buscar_insumo_por_nome(nome)
    if existente:
        insumo_id = existente["id"]
    else:
        insumo_id = criar_insumo(nome, "Ingrediente", unidade_medida, list(LOJAS.keys()))
        print(f"  + insumo novo: {nome} ({unidade_medida})")
    cache[nome] = insumo_id
    return insumo_id


def preencher():
    cache_insumos = {}
    for nome_item, categoria, ingredientes in ITENS:
        item_id = criar_item_cardapio(nome_item, categoria)
        links = []
        for nome_insumo, unidade, quantidade in ingredientes:
            insumo_id = _buscar_ou_criar_insumo_id(nome_insumo, unidade, cache_insumos)
            links.append({"insumoId": insumo_id, "quantidade": quantidade})
        definir_ficha_tecnica(item_id, links)
        print(f"{nome_item} ({categoria}): {len(links)} insumos")

    print(f"\n=== RESUMO ===")
    print(f"{len(ITENS)} itens de cardápio, {len(cache_insumos)} insumos distintos.")


if __name__ == "__main__":
    inicializar_banco()
    preencher()
