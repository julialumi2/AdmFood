# -*- coding: utf-8 -*-
"""Converte um insumo que está cadastrado por unidade para gramas,
convertendo junto tudo que guarda quantidade dele.

Por que: a planilha de CMV cota a carne por quilo e as receitas pedem
0,11 kg, mas o cadastro conta "Smashburger 110g" em unidade. Enquanto as
duas medidas não falarem a mesma língua, nenhum lanche tem custo — e o
CMV, que é o número que o chefe persegue, fica vazio pra 13 dos 20
produtos.

Não basta trocar a unidade: "45" hoje quer dizer 45 hambúrgueres e
passaria a querer dizer 45 gramas. Então o script multiplica pelo peso
unitário em TODO lugar que guarda quantidade — estoque, mínimo, lote,
contagem, ajuste manual, cotação, pedido — e divide os preços, que estavam
por unidade e passam a ser por grama.

A ficha técnica é o único caso que não é multiplicação: as receitas hoje
estão inconsistentes entre si (umas com 0.11, pensando em kg; outras com
1.0, pensando em unidade), então elas são reescritas a partir da planilha,
que é a fonte sem ambiguidade. Receita que usa o insumo mas não está na
planilha é reportada, nunca adivinhada.

Idempotente: só age se o insumo ainda estiver em unidade. Rodar de novo
não converte duas vezes.

Uso:
  python migrar_insumo_para_grama.py            # simulação
  python migrar_insumo_para_grama.py --apply    # grava
"""
import sys

import openpyxl

from backend.armazenamento import conexao, inicializar_banco, _normalizar_nome_insumo
from backend.nomes_insumo import sem_sufixo

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

PLANILHA = r"C:\Users\Guilherme\Downloads\Ficha_Tecnica_CMV_Artesanos_Burger.xlsx"
LOJA_RECEITA = "Hamburgueria Artesanos"

# Peso de uma unidade, confirmado pela Julia em 09/09/2026. É o número que
# o sistema não tem como deduzir sozinho — "45 unidades" só vira peso se
# alguém disser quanto pesa uma.
MIGRACOES = [
    {"cadastro": "Smashburger 110g", "planilha": "Smash burger", "gramas": 110},
    {"cadastro": "Burger de frango", "planilha": "Burger de frango (chicken)", "gramas": 100},
]

# tabela -> (campos multiplicados pelo peso, campos divididos pelo peso)
# Quantidade vira grama multiplicando; preço por unidade vira preço por
# grama dividindo, senão a carne passaria a custar 110x mais o grama.
TABELAS = [
    ("estoque_insumo", ["quantidade_atual", "estoque_minimo"], []),
    ("lote_insumo", ["quantidade"], []),
    ("contagem_item", ["quantidade_preenchida"], []),
    ("ajuste_quantidade_ideal", ["valor_ajustado"], []),
    ("cotacao_item", ["quantidade_total"], []),
    ("cotacao_item_loja", ["quantidade"], []),
    ("pedido_compra_item", ["quantidade"], ["preco_unitario"]),
    ("cotacao_preco", [], ["preco"]),
    # O razão da baixa automática guarda quanto já foi descontado. Sem
    # converter, a próxima sincronização compararia grama com unidade e
    # descontaria a diferença inteira de uma vez.
    ("baixa_estoque_venda", ["quantidade_baixada"], []),
]


def _receitas_da_planilha(nome_planilha):
    """{nome_do_produto: quantidade_em_kg} pra esse insumo."""
    wb = openpyxl.load_workbook(PLANILHA, data_only=True)
    alvo = _normalizar_nome_insumo(nome_planilha)
    receitas = {}
    for linha in wb["Ficha Técnica"].iter_rows(min_row=5, values_only=True):
        if not linha[1] or not linha[3]:
            continue
        if _normalizar_nome_insumo(str(linha[3])) != alvo:
            continue
        unidade = str(linha[4] or "").strip().lower()
        if unidade != "kg" or not isinstance(linha[5], (int, float)):
            continue
        # "CLASSICO (simples)" na planilha é o "CLASSICO" cadastrado.
        receitas[_normalizar_nome_insumo(sem_sufixo(str(linha[1])))] = float(linha[5])
    return receitas


def migrar(aplicar=False):
    inicializar_banco()
    for migracao in MIGRACOES:
        peso = migracao["gramas"]
        print(f"\n=== {migracao['cadastro']} — 1 un = {peso} g ===")

        with conexao() as conn:
            insumo = conn.execute(
                "SELECT id, nome, unidade_medida FROM insumo WHERE nome = ?", (migracao["cadastro"],)
            ).fetchone()
            if not insumo:
                print("   insumo não encontrado no cadastro — pulando")
                continue
            if insumo["unidade_medida"] != "un":
                print(f"   já está em {insumo['unidade_medida']!r} — nada a fazer")
                continue

            insumo_id = insumo["id"]
            for tabela, multiplicar, dividir in TABELAS:
                total = conn.execute(
                    f"SELECT COUNT(*) n FROM {tabela} WHERE insumo_id = ?", (insumo_id,)
                ).fetchone()["n"]
                if not total:
                    continue
                campos = ", ".join(
                    [f"{c} = {c} * {peso}" for c in multiplicar]
                    + [f"{c} = {c} / {peso}.0" for c in dividir]
                )
                print(f"   {tabela}: {total} linha(s) — {campos}")
                if aplicar:
                    conn.execute(f"UPDATE {tabela} SET {campos} WHERE insumo_id = ?", (insumo_id,))

            # Ficha técnica: reescrita a partir da planilha, não multiplicada.
            receitas = _receitas_da_planilha(migracao["planilha"])
            linhas_ficha = conn.execute(
                """
                SELECT f.item_id, f.quantidade, ic.nome
                FROM ficha_tecnica f JOIN item_cardapio ic ON ic.id = f.item_id
                WHERE f.insumo_id = ? AND f.loja = ?
                """,
                (insumo_id, LOJA_RECEITA),
            ).fetchall()
            print(f"   ficha_tecnica: {len(linhas_ficha)} receita(s) usam esse insumo")
            for linha in linhas_ficha:
                em_kg = receitas.get(_normalizar_nome_insumo(sem_sufixo(linha["nome"])))
                if em_kg is None:
                    print(f"      ! {linha['nome'][:30]:30} qtd={linha['quantidade']} — não está na planilha, deixando como está")
                    continue
                gramas = round(em_kg * 1000, 2)
                print(f"        {linha['nome'][:30]:30} {linha['quantidade']} -> {gramas} g")
                if aplicar:
                    conn.execute(
                        "UPDATE ficha_tecnica SET quantidade = ? WHERE item_id = ? AND insumo_id = ? AND loja = ?",
                        (gramas, linha["item_id"], insumo_id, LOJA_RECEITA),
                    )

            if aplicar:
                # O custo vira inválido junto: estava por unidade e a
                # próxima rodada de importar_custos_insumo.py grava o
                # certo, já convertido de kg pra g.
                conn.execute(
                    "UPDATE insumo SET unidade_medida = 'g', custo_referencia = NULL WHERE id = ?",
                    (insumo_id,),
                )
                print("   unidade: un -> g (custo zerado; rode importar_custos_insumo.py --apply em seguida)")

    print()
    if aplicar:
        print("Migração aplicada. Rode agora:  python importar_custos_insumo.py --apply")
    else:
        print("Simulação. Confira acima e rode de novo com --apply pra gravar.")


if __name__ == "__main__":
    migrar(aplicar="--apply" in sys.argv)
