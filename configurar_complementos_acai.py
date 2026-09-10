# -*- coding: utf-8 -*-
"""Complementos do Açaí Na Lata: cada topping vira um item com ficha própria,
e a receita do "monte o seu" deixa de ter os complementos de exemplo.

Por que (pedido da Julia em 10/09/2026): no "NaLata 330ml + 3 complementos"
a receita é o que o cliente escolhe. A Cardápio Web manda as escolhas em
cada pedido (grupos "ESCOLHA 3 Toppings", "Escolha até 5 adicionais",
"Toppings EXTRAS"...), e desde então o sistema guarda isso em
venda_complemento. Aqui ficam os cadastros pra essa leitura virar baixa de
estoque:

1. Um item de complemento por topping, com a ficha no Açaí (ex: "Leite
   condensado" = 70 g). As porções vêm da planilha de CMV do chefe, onde o
   topping aparece; creme como topping e Chocoball não aparecem lá — ficam
   com um valor de partida pra loja conferir na tela de Cardápio.
2. Vínculo pros nomes que a Cardápio Web escreve diferente: "Chocoboll",
   "Confetes", "Morango separado"...
3. Receita base: tira do "+ 3/5 complementos" os complementos de exemplo
   da planilha, e do Frutas ao Creme as frutas e o creme (escolha do
   cliente). Sem isso seriam descontados junto com os escolhidos —
   contagem dupla. Só sai o insumo de complemento: o resto da receita
   (açaí, lata, o que a loja montou à mão) fica como está.
4. Combos: 2 ou 4 copos de açaí base; os complementos vêm do pedido.

Em produção a Julia cadastrou os insumos do Açaí à mão, por pacote
("Amendoim triturado 1kg", em un). O complemento usa esse insumo (ver
localizar_insumo_acai) e a porção em grama vira fração do pacote pelo
conteúdo cadastrado. Complemento cujo insumo não existe fica sem ficha, e
insumo por pacote sem conteúdo cadastrado deixa a quantidade em branco —
os dois aparecem no relatório pra resolver na tela, sem travar o resto.

Idempotente: não recria item, não sobrescreve ficha de complemento que já
existe (pode ter sido ajustada na tela), e tirar da receita base o que já
saiu não faz nada.

Uso:
  python configurar_complementos_acai.py            # simulação
  python configurar_complementos_acai.py --apply    # grava
"""
import sys

from backend.armazenamento import (
    conexao,
    criar_insumo,
    criar_item_cardapio,
    definir_composicao_produto_venda,
    definir_ficha_tecnica,
    inicializar_banco,
    vincular_produto_venda_manualmente,
    _casar_item_cardapio,
    _normalizar_nome_insumo,
)
from importar_ficha_acai import cadastro_de_insumos, descrever_insumo, localizar_insumo_acai
from importar_ficha_tecnica_faltante import quantidade_para_insumo

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

LOJA = "Açaí Na Lata"

# complemento -> (insumo que ele gasta, gramas por porção)
COMPLEMENTOS = {
    "Leite condensado": ("Leite condensado", 70),
    "Leite em pó": ("Leite em pó", 30),
    "Banana": ("Banana", 60),
    "Morango": ("Morango", 70),
    "Manga": ("Manga", 70),
    "Kiwi": ("Kiwi", 70),
    "Paçoca": ("Farinha de paçoca", 30),
    "Granola": ("Granola", 25),
    "Gotas de chocolate": ("Gotas de chocolate", 30),
    "Ovomaltine": ("Ovomaltine", 25),
    "Confete": ("Confete", 30),
    "Amendoim triturado": ("Amendoim triturado", 16),
    # Sem porção de topping na planilha — valores de partida, conferir.
    "Chocoball": ("Chocoball", 30),
    "Creme de avelã": ("Creme de avelã", 60),
    "Creme de ninho": ("Creme de Ninho", 60),
    "Creme de cookie": ("Creme de cookies", 60),
    "Creme de Rafaello": ("Creme de coco bianco", 60),
    "Creme de Ovomaltine": ("Creme de Ovomaltine (Chocomalte)", 60),
    "Creme de Gran Ferreiro": ("Creme Grancher", 60),
}
SEM_PORCAO_NA_PLANILHA = {"Chocoball", "Creme de avelã", "Creme de ninho", "Creme de cookie",
                          "Creme de Rafaello", "Creme de Ovomaltine", "Creme de Gran Ferreiro"}

# Insumo que só existe por causa de um complemento (a planilha lista o
# Chocoball, mas nenhuma receita usava). Criado só se não houver nenhum com
# esse nome ou com o da planilha ("Chocoball 500gr"). Sem custo: R$ 19,90
# pode ser o pacote ou o quilo.
INSUMOS_NOVOS = {"Chocoball": ("g", "Complementos")}

# Nome que a Cardápio Web usa -> complemento cadastrado
VARIACOES = {
    "Chocoboll": "Chocoball",
    "Confetes": "Confete",
    "Morango separado": "Morango",
    "Ovomaltine separado": "Ovomaltine",
    "Creme de Cookie separado": "Creme de cookie",
}

# produto -> insumos que saem da receita base (os de complemento; o resto
# fica). Os três complementos de exemplo vieram da planilha do chefe.
COMPLEMENTOS_DE_EXEMPLO = ["Leite condensado", "Leite em pó", "Gotas de chocolate", "Ovomaltine"]
ESCOLHA_NO_FRUTAS_AO_CREME = ["Creme de Ninho", "Banana", "Morango", "Manga", "Kiwi"]
RETIRAR_DA_RECEITA_BASE = {}
for tam in ("330ml", "500ml"):
    for n in (3, 5):
        RETIRAR_DA_RECEITA_BASE[f"NaLata {tam} + {n} complementos"] = COMPLEMENTOS_DE_EXEMPLO
    RETIRAR_DA_RECEITA_BASE[f"Frutas ao Creme NaLata {tam}"] = ESCOLHA_NO_FRUTAS_AO_CREME

# combo (nome vendido) -> (copo base, quantos)
COMBOS = {
    "Combo Filhinho Nalata - 2 X 500ml": ("NaLata 500ml + 3 complementos", 2),
    "Combo Filminho NaLata - 2 x 500ml": ("NaLata 500ml + 3 complementos", 2),
    "Combo Família NaLata - 4 x 330ml": ("NaLata 330ml + 3 complementos", 4),
}


def configurar(aplicar=False):
    inicializar_banco()
    cadastro = cadastro_de_insumos()
    with conexao() as conn:
        itens = {_normalizar_nome_insumo(l["nome"]): dict(l)
                 for l in conn.execute("SELECT id, nome, tipo FROM item_cardapio").fetchall()}
        com_ficha = {l["item_id"] for l in conn.execute(
            "SELECT DISTINCT item_id FROM ficha_tecnica WHERE loja = ?", (LOJA,)).fetchall()}
        vinculos = {l["nome_produto_normalizado"] for l in conn.execute(
            "SELECT nome_produto_normalizado FROM vinculo_produto_venda").fetchall()}
        compostos = {l["nome_produto_normalizado"] for l in conn.execute(
            "SELECT DISTINCT nome_produto_normalizado FROM composicao_produto_venda").fetchall()}

    print("=== Complementos e porções ===")
    fichas, sem_insumo, em_branco = {}, [], []
    for nome, (nome_insumo, gramas) in COMPLEMENTOS.items():
        item = itens.get(_normalizar_nome_insumo(nome))
        if item and item["tipo"] != "complemento":
            raise SystemExit(f"{nome!r} já existe como {item['tipo']} — renomeie antes de continuar.")
        if item and item["id"] in com_ficha:
            print(f"   {nome:24} já tem ficha no Açaí — mantida")
            continue
        insumo = localizar_insumo_acai(nome_insumo, cadastro)
        aviso = "  ⚠ valor de partida, conferir" if nome in SEM_PORCAO_NA_PLANILHA else ""
        if insumo is None and nome_insumo in INSUMOS_NOVOS:
            fichas[nome] = (None, gramas)  # insumo criado na hora, em grama
            print(f"   {'novo ' if not item else 'ficha'} {nome:24} = {gramas:>3} g de {nome_insumo} (insumo novo){aviso}")
        elif insumo is None:
            sem_insumo.append(f"{nome} (procurei {nome_insumo!r})")
            print(f"   {'novo ' if not item else 'ficha'} {nome:24} SEM FICHA — não achei o insumo {nome_insumo!r}")
            fichas[nome] = None
        else:
            quantidade = quantidade_para_insumo(gramas, "g", insumo)
            if quantidade is None:
                em_branco.append(descrever_insumo(insumo))
            fichas[nome] = (insumo, quantidade)
            mostrado = f"{gramas} g" if quantidade is None or quantidade == gramas else f"{gramas} g = {quantidade:g} {insumo['unidade_medida']}"
            branco = "  (quantidade em branco: cadastre quanto tem em 1 unidade)" if quantidade is None else ""
            print(f"   {'novo ' if not item else 'ficha'} {nome:24} = {mostrado} de {descrever_insumo(insumo)}{aviso}{branco}")

    print("\n=== Nomes diferentes na Cardápio Web ===")
    for variacao, destino in VARIACOES.items():
        estado = "já vinculado" if _normalizar_nome_insumo(variacao) in vinculos else "vincula"
        print(f"   {variacao!r:28} -> {destino}  ({estado})")

    print("\n=== Receita base (sai o que é escolha do cliente; o resto fica) ===")
    retirar = []
    with conexao() as conn:
        for produto, nomes in RETIRAR_DA_RECEITA_BASE.items():
            item = itens.get(_normalizar_nome_insumo(produto))
            if not item:
                print(f"   {produto}: não cadastrado — nada a fazer")
                continue
            ids_retirar = {i["id"] for i in (localizar_insumo_acai(n, cadastro) for n in nomes) if i}
            linhas = conn.execute(
                "SELECT f.insumo_id, i.nome FROM ficha_tecnica f JOIN insumo i ON i.id = f.insumo_id "
                "WHERE f.item_id = ? AND f.loja = ?", (item["id"], LOJA)).fetchall()
            sai = [l for l in linhas if l["insumo_id"] in ids_retirar]
            fica = [l["nome"] for l in linhas if l["insumo_id"] not in ids_retirar]
            retirar += [(item["id"], l["insumo_id"]) for l in sai]
            print(f"   {produto:34} sai: {', '.join(l['nome'] for l in sai) or 'nada'}")
            print(f"   {'':34} fica: {', '.join(fica) or '(receita vazia)'}")

    print("\n=== Combos ===")
    for combo, (copo, quantos) in COMBOS.items():
        estado = "já definido" if _normalizar_nome_insumo(combo) in compostos else "define"
        print(f"   {combo:36} = {quantos} × {copo}  ({estado})")

    if sem_insumo:
        print(f"\n   Complemento sem ficha (monte na tela de Cardápio → complementos): {'; '.join(sem_insumo)}")
    if em_branco:
        print(f"\n   Quantidade em branco — cadastre quanto tem em 1 unidade: {'; '.join(sorted(set(em_branco)))}")

    if not aplicar:
        print("\nSimulação. Rode de novo com --apply pra gravar.")
        return

    novos_ids = {}
    for nome, (unidade, categoria) in INSUMOS_NOVOS.items():
        if not localizar_insumo_acai(nome, cadastro):
            novos_ids[nome] = criar_insumo(nome, categoria, unidade, [LOJA])
    for nome, (nome_insumo, _gramas) in COMPLEMENTOS.items():
        item = itens.get(_normalizar_nome_insumo(nome))
        item_id = item["id"] if item else criar_item_cardapio(nome, "Complementos", tipo="complemento")
        itens[_normalizar_nome_insumo(nome)] = {"id": item_id, "nome": nome, "tipo": "complemento"}
        ficha = fichas.get(nome)
        if item_id in com_ficha or not ficha:
            continue
        insumo, quantidade = ficha
        insumo_id = insumo["id"] if insumo else novos_ids[nome_insumo]
        definir_ficha_tecnica(item_id, LOJA, [{"insumoId": insumo_id, "quantidade": quantidade}])
    for variacao, destino in VARIACOES.items():
        if _normalizar_nome_insumo(variacao) not in vinculos:
            vincular_produto_venda_manualmente(
                variacao, itens[_normalizar_nome_insumo(destino)]["id"], "configurar_complementos_acai.py")
    with conexao() as conn:
        for item_id, insumo_id in retirar:
            conn.execute("DELETE FROM ficha_tecnica WHERE item_id = ? AND insumo_id = ? AND loja = ?",
                         (item_id, insumo_id, LOJA))
    for combo, (copo, quantos) in COMBOS.items():
        copo_item = itens.get(_normalizar_nome_insumo(copo))
        if _normalizar_nome_insumo(combo) not in compostos and copo_item:
            definir_composicao_produto_venda(
                combo, [{"itemCardapioId": copo_item["id"], "quantidade": quantos}],
                "configurar_complementos_acai.py")

    # Complemento vendido antes do cadastro existir ficou sem item: casa de
    # novo agora, pra baixa e CMV enxergarem (a baixa corrige sozinha na
    # próxima sincronização daquele dia).
    with conexao() as conn:
        catalogo = {_normalizar_nome_insumo(l["nome"]): l["id"]
                    for l in conn.execute("SELECT id, nome FROM item_cardapio").fetchall()}
        vinculos_manuais = {
            l["nome_produto_normalizado"]: {"itemCardapioId": l["item_cardapio_id"],
                                            "quantidadePorUnidade": l["quantidade_por_unidade"]}
            for l in conn.execute("SELECT * FROM vinculo_produto_venda").fetchall()
        }
        recasados = 0
        for linha in conn.execute(
                "SELECT DISTINCT nome_complemento FROM venda_complemento WHERE unidade = ? AND item_cardapio_id IS NULL",
                (LOJA,)).fetchall():
            item_id, _ = _casar_item_cardapio(linha["nome_complemento"], catalogo, vinculos_manuais)
            if item_id:
                recasados += conn.execute(
                    "UPDATE venda_complemento SET item_cardapio_id = ? WHERE unidade = ? AND nome_complemento = ? "
                    "AND item_cardapio_id IS NULL", (item_id, LOJA, linha["nome_complemento"])).rowcount
        sobra = [l["nome_complemento"] for l in conn.execute(
            "SELECT DISTINCT nome_complemento FROM venda_complemento WHERE unidade = ? AND item_cardapio_id IS NULL",
            (LOJA,)).fetchall()]

    print(f"\nComplementos configurados. Vendas já gravadas que passaram a casar: {recasados}.")
    if sobra:
        print(f"Ainda sem cadastro (aparecem na fila de pendências do Estoque): {', '.join(sobra)}")


if __name__ == "__main__":
    configurar(aplicar="--apply" in sys.argv)
