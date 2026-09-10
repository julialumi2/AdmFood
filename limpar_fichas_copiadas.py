# -*- coding: utf-8 -*-
"""Remove as receitas do Artesanos que foram parar nas outras lojas.

Quando a ficha técnica passou a ser por loja, a migração copiou a receita
única que existia pra todas as lojas — então a Tradiça (hot dog) e o Açaí
Na Lata ficaram com 19 hambúrgueres do Artesanos, com 57 quantidades vazias
em cada uma, e com os 49 insumos de hambúrguer aparecendo no estoque delas.
Nenhuma das duas vende esses produtos. Confirmado com a Julia em 10/09/2026.

As batatas ficam na Tradiça: ela vende batata e compra a mesma Batata
Crinkle. No Açaí, que não vende batata, sai tudo.

Também resolve a Páprica solta nas batatas do Artesanos: ela já está
dentro do Tempero Batata (mistura), então a linha separada era conta dupla
— e, sem quantidade, travava o CMV das três batatas. O insumo é renomeado
pra "Páprica doce", o nome que as planilhas de receita e de compra usam.

O vínculo de insumo com loja só sai quando a loja não usa o insumo em
nenhuma receita e não tem nenhum histórico dele (estoque, lote, contagem,
pedido, cotação ou ajuste). Dado de verdade nunca é apagado por aqui.

Uso:
  python limpar_fichas_copiadas.py            # simulação
  python limpar_fichas_copiadas.py --apply    # grava
"""
import sys

from backend.armazenamento import conexao, inicializar_banco

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

ORIGEM = "Hamburgueria Artesanos"
LOJAS_COM_COPIA = ["Tradiça ZN", "Tradiça Simus", "Açaí Na Lata"]
LOJAS_QUE_VENDEM_BATATA = {"Tradiça ZN", "Tradiça Simus"}
BATATAS = {"BATATA INDIVIDUAL", "BATATA MÉDIA", "BATATA C/ CHEDDAR E BACON"}

PAPRICA_ANTIGA, PAPRICA_NOVA = "Páprica", "Páprica doce"

# (tabela, como achar a linha do insumo naquela loja)
HISTORICO = [
    ("lote_insumo", "SELECT 1 FROM lote_insumo WHERE insumo_id = ? AND loja = ?"),
    ("contagem", "SELECT 1 FROM contagem_item ci JOIN contagem c ON c.id = ci.contagem_id "
                 "WHERE ci.insumo_id = ? AND c.loja = ?"),
    ("pedido", "SELECT 1 FROM pedido_compra_item pi JOIN pedido_compra p ON p.id = pi.pedido_id "
               "WHERE pi.insumo_id = ? AND p.loja = ?"),
    ("cotação", "SELECT 1 FROM cotacao_item_loja WHERE insumo_id = ? AND loja = ?"),
    ("ajuste", "SELECT 1 FROM ajuste_quantidade_ideal WHERE insumo_id = ? AND loja = ?"),
    ("baixa", "SELECT 1 FROM baixa_estoque_venda WHERE insumo_id = ? AND unidade = ?"),
]


def limpar(aplicar=False):
    inicializar_banco()
    with conexao() as conn:
        copiados = {
            linha["id"]: linha["nome"]
            for linha in conn.execute(
                "SELECT DISTINCT ic.id, ic.nome FROM ficha_tecnica f "
                "JOIN item_cardapio ic ON ic.id = f.item_id WHERE f.loja = ?",
                (ORIGEM,),
            ).fetchall()
        }

        print("=== Receitas do Artesanos copiadas nas outras lojas ===")
        # Loja onde não sobrou cópia nenhuma já foi limpa numa rodada
        # anterior: lá os insumos não são mexidos. Sem isso, rodar de novo
        # desvincularia os insumos que outros passos vincularam de propósito
        # e que ainda não estão em receita (a base dos hot dogs da Tradiça,
        # que a Julia vai adicionar na tela).
        lojas_com_copia = []
        for loja in LOJAS_COM_COPIA:
            fica = BATATAS if loja in LOJAS_QUE_VENDEM_BATATA else set()
            alvo = [i for i, nome in copiados.items() if nome not in fica]
            linhas = conn.execute(
                f"SELECT COUNT(*) n, COUNT(DISTINCT item_id) p FROM ficha_tecnica "
                f"WHERE loja = ? AND item_id IN ({','.join('?' * len(alvo))})",
                (loja, *alvo),
            ).fetchone()
            if not linhas["n"]:
                print(f"   {loja:15} nenhuma cópia — já foi limpa")
                continue
            lojas_com_copia.append(loja)
            print(f"   {loja:15} sai {linhas['p']} produtos ({linhas['n']} linhas)"
                  + (f" — ficam as {len(fica)} batatas" if fica else ""))
            if aplicar:
                conn.execute(
                    f"DELETE FROM ficha_tecnica WHERE loja = ? AND item_id IN ({','.join('?' * len(alvo))})",
                    (loja, *alvo),
                )

        print(f"\n=== {PAPRICA_ANTIGA} solta nas batatas do Artesanos ===")
        paprica = conn.execute("SELECT id FROM insumo WHERE nome = ?", (PAPRICA_ANTIGA,)).fetchone()
        ja_existe = conn.execute("SELECT id FROM insumo WHERE nome = ?", (PAPRICA_NOVA,)).fetchone()
        if not paprica:
            print(f"   insumo {PAPRICA_ANTIGA!r} não existe mais — já foi resolvido")
        elif ja_existe:
            print(f"   já existe um {PAPRICA_NOVA!r} separado — resolva à mão antes de renomear")
        else:
            batatas_ids = [i for i, nome in copiados.items() if nome in BATATAS]
            linhas = conn.execute(
                f"SELECT COUNT(*) n FROM ficha_tecnica WHERE loja = ? AND insumo_id = ? "
                f"AND item_id IN ({','.join('?' * len(batatas_ids))})",
                (ORIGEM, paprica["id"], *batatas_ids),
            ).fetchone()["n"]
            print(f"   sai de {linhas} receita(s) de batata (já está dentro do Tempero Batata)")
            print(f"   insumo renomeado: {PAPRICA_ANTIGA!r} -> {PAPRICA_NOVA!r}")
            if aplicar:
                conn.execute(
                    f"DELETE FROM ficha_tecnica WHERE loja = ? AND insumo_id = ? "
                    f"AND item_id IN ({','.join('?' * len(batatas_ids))})",
                    (ORIGEM, paprica["id"], *batatas_ids),
                )
                conn.execute("UPDATE insumo SET nome = ? WHERE id = ?", (PAPRICA_NOVA, paprica["id"]))

        print("\n=== Insumos que saem do estoque de cada loja ===")
        if not lojas_com_copia:
            print("   nenhuma loja com cópia — nada a fazer")
        for loja in lojas_com_copia:
            vinculados = conn.execute(
                "SELECT i.id, i.nome FROM insumo_loja il JOIN insumo i ON i.id = il.insumo_id "
                "WHERE il.loja = ? ORDER BY i.nome",
                (loja,),
            ).fetchall()
            # Depois da limpeza acima — em simulação, a receita ainda está
            # lá, então exclui dela o que acabou de ser marcado pra sair.
            fica = BATATAS if loja in LOJAS_QUE_VENDEM_BATATA else set()
            itens_que_ficam = [i for i, nome in copiados.items() if nome in fica]
            usados = {
                linha["insumo_id"]
                for linha in conn.execute(
                    "SELECT insumo_id FROM ficha_tecnica WHERE loja = ? AND item_id NOT IN ({})".format(
                        ",".join("?" * len(copiados))
                    ),
                    (loja, *copiados),
                ).fetchall()
            } | {
                linha["insumo_id"]
                for linha in conn.execute(
                    "SELECT insumo_id FROM ficha_tecnica WHERE loja = ? AND item_id IN ({})".format(
                        ",".join("?" * len(itens_que_ficam)) or "NULL"
                    ),
                    (loja, *itens_que_ficam),
                ).fetchall()
            }

            sai, fica_por_historico = [], []
            for insumo in vinculados:
                if insumo["id"] in usados:
                    continue
                motivos = [nome for nome, sql in HISTORICO if conn.execute(sql, (insumo["id"], loja)).fetchone()]
                estoque = conn.execute(
                    "SELECT quantidade_atual q, estoque_minimo m FROM estoque_insumo WHERE insumo_id = ? AND loja = ?",
                    (insumo["id"], loja),
                ).fetchone()
                if motivos:
                    fica_por_historico.append((insumo["nome"], motivos))
                else:
                    sai.append((insumo, estoque))

            print(f"   {loja:15} sai {len(sai)} de {len(vinculados)}; ficam {len(vinculados) - len(sai)}"
                  f" ({len(usados & {i['id'] for i in vinculados})} usados em receita)")
            for insumo, estoque in sai:
                if estoque and (estoque["q"] or estoque["m"]):
                    print(f"      ! {insumo['nome']}: tinha qtd={estoque['q']} min={estoque['m']} lançado — sai junto")
            for nome, motivos in fica_por_historico:
                print(f"      fica {nome}: tem histórico ({', '.join(motivos)})")
            if aplicar:
                for insumo, _estoque in sai:
                    conn.execute("DELETE FROM insumo_loja WHERE insumo_id = ? AND loja = ?", (insumo["id"], loja))
                    conn.execute("DELETE FROM estoque_insumo WHERE insumo_id = ? AND loja = ?", (insumo["id"], loja))

    print()
    print("Limpeza aplicada." if aplicar else "Simulação. Confira acima e rode de novo com --apply pra gravar.")


if __name__ == "__main__":
    limpar(aplicar="--apply" in sys.argv)
