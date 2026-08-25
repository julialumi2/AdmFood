"""
Importa o catálogo de insumos ("produtos") já cadastrado na VMarket ("Cotações"
→ "Meus Produtos") pra tabela insumo — carga inicial única, feita em
2026-08-25 antes de descontinuar a VMarket (ver seção 6.4/9 da documentação).

Os dados vêm de um JSON (não CSV — a VMarket não tem exportação de produtos
pela UI, então foi extraído direto do endpoint interno
`cotacao/listar_produtos_de_cotacao` via console do navegador, filtrando só
os "Apenas ativos"). Cada item já vem no formato esperado por criar_insumo:
nome, categoria, unidadeMedida, marcaHomologada (marca só quando o produto
não aceita marca similar na VMarket — ou seja, é homologado a uma marca só).

Idempotente por nome (buscar_insumo_por_nome), mesmo raciocínio de
buscar_fornecedor_por_cnpj em importar_fornecedores_vmarket.py — dá pra
rodar de novo com um JSON mais recente sem duplicar quem já existe.

Uso:
  python importar_insumos_vmarket.py "caminho/insumos_vmarket.json"
"""

import json
import sys

from config import LOJAS
from backend.armazenamento import (
    inicializar_banco,
    buscar_insumo_por_nome,
    criar_insumo,
    atualizar_insumo,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def importar(caminho_json):
    with open(caminho_json, encoding="utf-8") as arquivo:
        itens = json.load(arquivo)

    criados = 0
    ja_existiam = 0

    for item in itens:
        nome = (item.get("nome") or "").strip()
        if not nome:
            continue

        if buscar_insumo_por_nome(nome):
            ja_existiam += 1
            print(f"= já existe: {nome}")
            continue

        categoria = (item.get("categoria") or "Geral").strip() or "Geral"
        unidade_medida = (item.get("unidadeMedida") or "un").strip() or "un"
        marca_homologada = (item.get("marcaHomologada") or "").strip()

        insumo_id = criar_insumo(nome, categoria, unidade_medida, list(LOJAS.keys()))
        if marca_homologada:
            atualizar_insumo(insumo_id, {"marca_homologada": marca_homologada})

        criados += 1
        print(f"+ importado: {nome}" + (f" (marca: {marca_homologada})" if marca_homologada else ""))

    print(f"\n=== RESUMO ===")
    print(f"{criados} insumos importados, {ja_existiam} já existiam (nome repetido).")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python importar_insumos_vmarket.py \"caminho/insumos_vmarket.json\"")
        sys.exit(1)

    inicializar_banco()
    importar(sys.argv[1])
