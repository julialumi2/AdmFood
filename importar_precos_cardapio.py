"""
Importa o comparativo de preços do cardápio de uma planilha .xlsx pra tabela
preco_cardapio (ver backend/precos_cardapio.py pro formato esperado da
planilha) — usada pela tela Cardápio, só de referência/visualização (não
tem edição pelo sistema).

Sempre apaga e reimporta a tabela inteira — rode de novo sempre que a
planilha for atualizada. Alternativa sem precisar rodar isso na mão: a
tela Cardápio tem um botão "Importar planilha" (só admin) que faz a mesma
coisa direto pelo navegador.

Uso:
  python importar_precos_cardapio.py "caminho/da/planilha.xlsx"
"""

import sys

from backend.armazenamento import inicializar_banco, substituir_precos_cardapio
from backend.precos_cardapio import ler_precos_da_planilha

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python importar_precos_cardapio.py \"caminho/da/planilha.xlsx\"")
        sys.exit(1)

    inicializar_banco()
    linhas = ler_precos_da_planilha(sys.argv[1])
    substituir_precos_cardapio(linhas)

    por_loja = {}
    for linha in linhas:
        por_loja[linha['loja']] = por_loja.get(linha['loja'], 0) + 1
    for loja, quantidade in por_loja.items():
        print(f"✅ {loja}: {quantidade} produtos")
    print(f"\nTotal importado: {len(linhas)} produtos.")
