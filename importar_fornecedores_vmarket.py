"""
Importa o cadastro de fornecedores exportado da VMarket ("Cotações" →
"Meus Fornecedores" → "Exportar Lista de Fornecedores", CSV com `;` como
separador) pra tabela fornecedor — carga inicial única, feita em 2026-08-25
antes de descontinuar a VMarket (ver seção 6.7/9 da documentação).

Idempotente por CNPJ (buscar_fornecedor_por_cnpj) — fornecedor sem CNPJ no
CSV é sempre criado como novo (não dá pra saber se é duplicata). Dá pra
rodar de novo com um CSV mais recente sem duplicar quem já tem CNPJ.

A VMarket não tem campo de categoria — todo mundo importado entra como
"Geral", editável depois pela tela. "valor_frete" também não existe no
nosso schema; quando maior que zero, vira uma linha em observações pra não
perder o dado.

Uso:
  python importar_fornecedores_vmarket.py "caminho/lista_fornecedores.csv"
"""

import csv
import sys

from backend.armazenamento import (
    inicializar_banco,
    buscar_fornecedor_por_cnpj,
    criar_fornecedor,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def _para_float(valor):
    try:
        return float(valor)
    except (TypeError, ValueError):
        return 0.0


def importar(caminho_csv):
    criados = 0
    ja_existiam = 0

    with open(caminho_csv, encoding="utf-8-sig", newline="") as arquivo:
        leitor = csv.DictReader(arquivo, delimiter=";")
        for linha in leitor:
            cnpj = (linha.get("cnpj") or "").strip()
            if cnpj and buscar_fornecedor_por_cnpj(cnpj):
                ja_existiam += 1
                print(f"= já existe (CNPJ {cnpj}): {linha.get('nome')}")
                continue

            valor_frete = _para_float(linha.get("valor_frete"))
            observacoes = f"Frete (VMarket): R$ {valor_frete:.2f}".replace(".", ",") if valor_frete > 0 else ""

            campos = {
                "nome": (linha.get("nome") or "").strip() or "(sem nome)",
                "cnpj": cnpj,
                "categoria": "Geral",
                "contato_nome": (linha.get("nome_contato") or "").strip(),
                "contato_telefone": (linha.get("telefone_contato") or "").strip(),
                "contato_email": (linha.get("email_contato") or "").strip(),
                "prazo_pagamento": (linha.get("prazo_pagamento") or "").strip(),
                "dias_entrega": (linha.get("prazo_entrega") or "").strip(),
                "pedido_minimo": _para_float(linha.get("pedido_minimo")),
                "observacoes": observacoes,
                "ativo": 1,
            }
            criar_fornecedor(campos)
            criados += 1
            print(f"+ importado: {campos['nome']}")

    print(f"\n=== RESUMO ===")
    print(f"{criados} fornecedores importados, {ja_existiam} já existiam (CNPJ repetido).")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python importar_fornecedores_vmarket.py \"caminho/lista_fornecedores.csv\"")
        sys.exit(1)

    inicializar_banco()
    importar(sys.argv[1])
