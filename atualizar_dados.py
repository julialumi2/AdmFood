# -*- coding: utf-8 -*-
"""Leva pra outro banco (o de produção) as mudanças de dados que foram
feitas por script no banco local em 09 e 10/09/2026.

Por que existe: o banco de produção fica num volume do Dokploy e não vai no
push — o push só leva código. Tudo que foi importado por script aqui
(custo de insumo, receitas faltando, carne em grama, Açaí, Tradiça,
limpeza das receitas copiadas) só existia no banco local. E como o
repositório é público, as planilhas com custo não podem ir pro git: elas
chegam pelo botão "Atualizar dados pelas planilhas" em Configurações, que
chama este script (ver `api_atualizar_dados` em app.py).

Cada passo confere o estado antes de mexer, então rodar de novo não
duplica nada. A ordem importa: a carne vira grama ANTES de a receita
faltante ser preenchida e ANTES do custo — senão o custo por quilo cairia
num insumo ainda contado por unidade.

O script sempre grava no banco apontado por DATABASE_PATH. A simulação da
tela roda ele numa CÓPIA do banco, então mostra exatamente o que vai
acontecer, inclusive o efeito de um passo no seguinte.

Uso:
  python atualizar_dados.py [--ficha-artesanos A.xlsx] [--cmv-acai B.xlsx] [--compras-tradica C.xlsx] [--apply]
"""
import argparse
import sys

from backend.armazenamento import conexao, inicializar_banco

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

LOJA_ARTESANOS = "Hamburgueria Artesanos"


def unidade_dos_empanados(aplicar):
    """Provolone e Brie empanado entram na receita por unidade, mas estavam
    em grama no cadastro. Só troca se não houver estoque relevante: mudar a
    unidade muda o que o número guardado quer dizer (mesma regra aplicada
    no banco local em 09/09/2026)."""
    with conexao() as conn:
        for nome in ("Provolone empanado", "Brie empanado"):
            insumo = conn.execute(
                "SELECT i.id, i.unidade_medida, "
                "COALESCE((SELECT SUM(ABS(quantidade_atual)) FROM estoque_insumo e WHERE e.insumo_id = i.id), 0) estoque, "
                "COALESCE((SELECT SUM(estoque_minimo) FROM estoque_insumo e WHERE e.insumo_id = i.id), 0) minimo "
                "FROM insumo i WHERE i.nome = ?",
                (nome,),
            ).fetchone()
            if not insumo:
                print(f"   {nome}: não existe no cadastro — nada a fazer")
            elif insumo["unidade_medida"] == "un":
                print(f"   {nome}: já está em unidade — nada a fazer")
            elif insumo["estoque"] > 10 or insumo["minimo"]:
                print(f"   {nome}: tem estoque lançado ({insumo['estoque']:g}) — não troco a unidade, resolva na tela")
            else:
                print(f"   {nome}: {insumo['unidade_medida']} -> un")
                if aplicar:
                    conn.execute("UPDATE insumo SET unidade_medida = 'un' WHERE id = ?", (insumo["id"],))


def custo_manual_da_batata(aplicar):
    """A Batata Individual tinha o preço do QUILO digitado como custo à mão
    (R$ 12,50), 10x o da porção de 100 g — e custo à mão ganha da receita.
    Só apaga esse valor exato: qualquer outro foi decisão de alguém."""
    with conexao() as conn:
        linha = conn.execute(
            "SELECT c.item_id, c.custo FROM item_cardapio_custo c JOIN item_cardapio i ON i.id = c.item_id "
            "WHERE i.nome = 'BATATA INDIVIDUAL' AND c.loja = ?",
            (LOJA_ARTESANOS,),
        ).fetchone()
        if not linha:
            print("   sem custo à mão na Batata Individual — nada a fazer")
        elif abs(linha["custo"] - 12.5) > 1e-9:
            print(f"   custo à mão é R$ {linha['custo']} (não é o R$ 12,50 errado) — mantido")
        else:
            print("   custo à mão de R$ 12,50 (preço do quilo) apagado — volta a valer o da receita")
            if aplicar:
                conn.execute("DELETE FROM item_cardapio_custo WHERE item_id = ? AND loja = ?",
                             (linha["item_id"], LOJA_ARTESANOS))


def cardapio_da_tradica(aplicar, precos):
    """Cardápio das Tradiças a partir da planilha de preços — só as abas da
    Tradiça, e só pra loja que ainda não tem cardápio vindo da planilha. Até
    a correção de 10/09/2026 o import de preços pulava as abas novas
    ("Comparativo de preços ZN"/"Simus") sem avisar, então as Tradiças
    ficaram vazias. O botão de preços do Cardápio faria isso também, mas
    regrava Artesanos e Açaí junto e passaria por cima de preço editado à mão.

    Produto criado na tela ("Novo item", manual = 1) não conta como cardápio:
    com a loja vazia, é assim que ela monta as primeiras fichas, e um só
    desses bastava pra loja inteira ficar sem a lista de preços. Ele fica. Se
    for um produto da planilha escrito do jeito curto ("Calabreso" x
    "Calabreso (com Calabresa)"), vira a linha da planilha em vez de aparecer
    duas vezes — a tela não tem como tirar produto do cardápio. Preço que ela
    digitou nele fica; o que estava vazio vem da planilha. Foto e ficha
    técnica continuam as mesmas."""
    from backend.precos_cardapio import ler_precos_da_planilha
    from montar_cardapio_tradica import _nome_de_cardapio

    lojas = ("Tradiça ZN", "Tradiça Simus")
    with conexao() as conn:
        com_cardapio = {
            l["loja"] for l in conn.execute(
                "SELECT DISTINCT loja FROM preco_cardapio WHERE loja IN (?, ?) AND manual = 0", lojas
            ).fetchall()
        }
        da_tela = {}
        for l in conn.execute(
            "SELECT id, loja, produto, ifood, food99, beefood, cardapio_web FROM preco_cardapio "
            "WHERE loja IN (?, ?) AND manual = 1 ORDER BY ordem", lojas
        ).fetchall():
            da_tela.setdefault(l["loja"], []).append(dict(l))

    planilha = ler_precos_da_planilha(precos)
    novas, assumidas = [], []  # linhas a inserir; (linha da tela, linha da planilha)
    for loja in lojas:
        if loja in com_cardapio:
            print(f"   {loja}: já tem cardápio — não é mexido (pra atualizar preço, use o botão do Cardápio)")
            continue
        da_loja = [l for l in planilha if l["loja"] == loja]
        if not da_loja:
            print(f"   {loja}: planilha sem aba dessa loja")
            continue
        print(f"   {loja}: entra o cardápio da planilha ({len(da_loja)} produtos)")

        # Mesmo produto = mesmo nome sem o parêntese de descrição, o critério
        # com que a tela liga a lista de preços à ficha (_casar_item_cardapio).
        # Só quando é um pra um: dois candidatos é decisão dela, não regra.
        tela_por_nome, planilha_por_nome = {}, {}
        for linha in da_tela.get(loja, []):
            tela_por_nome.setdefault(_nome_de_cardapio(linha["produto"]), []).append(linha)
        for linha in da_loja:
            planilha_por_nome.setdefault(_nome_de_cardapio(linha["produto"]), []).append(linha)
        assumidas_aqui = []
        for linha in da_loja:
            nome = _nome_de_cardapio(linha["produto"])
            candidatas = tela_por_nome.get(nome, [])
            if len(candidatas) == 1 and len(planilha_por_nome[nome]) == 1:
                assumidas_aqui.append((candidatas[0], linha))
            else:
                novas.append(linha)
        assumidas += assumidas_aqui

        for da_tela_linha, da_planilha in assumidas_aqui:
            digitou = any(da_tela_linha[c] is not None for c in ("ifood", "food99", "beefood", "cardapio_web"))
            destino = ("passa a ser da planilha" if da_tela_linha["produto"] == da_planilha["produto"]
                       else f"vira {da_planilha['produto']!r} da planilha")
            print(f"      {da_tela_linha['produto']!r} (criado na tela) {destino}"
                  + (" — o preço que você digitou fica" if digitou else ""))
        ids_assumidos = {da_tela_linha["id"] for da_tela_linha, _ in assumidas_aqui}
        for linha in da_tela.get(loja, []):
            if linha["id"] not in ids_assumidos:
                print(f"      fica também {linha['produto']!r} (criado na tela, sem par único na planilha)")

    if aplicar:
        with conexao() as conn:
            for da_tela_linha, da_planilha in assumidas:
                conn.execute(
                    """
                    UPDATE preco_cardapio SET produto = ?, categoria = ?, ordem = ?,
                        ifood = COALESCE(ifood, ?), food99 = COALESCE(food99, ?),
                        beefood = COALESCE(beefood, ?), cardapio_web = COALESCE(cardapio_web, ?),
                        manual = 0
                    WHERE id = ?
                    """,
                    (da_planilha["produto"], da_planilha["categoria"], da_planilha["ordem"],
                     da_planilha["ifood"], da_planilha["food99"], da_planilha["beefood"],
                     da_planilha["cardapio_web"], da_tela_linha["id"]),
                )
            for linha in novas:
                conn.execute(
                    """
                    INSERT INTO preco_cardapio (loja, categoria, produto, ifood, food99, beefood, cardapio_web, ordem)
                    VALUES (:loja, :categoria, :produto, :ifood, :food99, :beefood, :cardapio_web, :ordem)
                    ON CONFLICT(loja, produto) DO NOTHING
                    """,
                    linha,
                )


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--ficha-artesanos", help="Ficha_Tecnica_CMV_Artesanos_Burger.xlsx")
    parser.add_argument("--cmv-acai", help="CMV v2 .xlsx")
    parser.add_argument("--compras-tradica", help="Compras Tradiça - Painel de Controle.xlsx (opcional)")
    parser.add_argument("--precos", help="Comparativos de Preços.xlsx — só as abas da Tradiça são usadas")
    parser.add_argument("--apply", action="store_true", help="grava (sem isso, cada passo só simula)")
    args = parser.parse_args()

    inicializar_banco()
    # Importados aqui, e não no topo, pra que DATABASE_PATH já esteja valendo
    # e cada script use o mesmo banco que este processo.
    import configurar_complementos_acai
    import importar_custos_insumo
    import importar_ficha_acai
    import importar_ficha_tecnica_faltante
    import importar_sub_receitas
    import limpar_fichas_copiadas
    import migrar_insumo_para_grama
    import montar_cardapio_tradica

    ficha, cmv, compras, precos = args.ficha_artesanos, args.cmv_acai, args.compras_tradica, args.precos
    # O custo roda por último de propósito: assim ele também pega os
    # insumos criados pelos passos anteriores (Sal, Ketchup, Mostarda da
    # Tradiça...), e a planilha do chefe — a referência de custo da casa —
    # fica valendo pra todo insumo que ela conhece.
    passos = [
        ("Unidade do Provolone e do Brie empanado", None, lambda: unidade_dos_empanados(args.apply)),
        ("Carne e frango de unidade pra grama", ficha, lambda: migrar_insumo_para_grama.migrar(args.apply, ficha)),
        ("Receitas e gramaturas que faltam no Artesanos", ficha, lambda: importar_ficha_tecnica_faltante.importar(ficha, args.apply)),
        ("Custo à mão errado da Batata Individual", None, lambda: custo_manual_da_batata(args.apply)),
        ("Receitas do Artesanos copiadas nas outras lojas", None, lambda: limpar_fichas_copiadas.limpar(args.apply)),
        ("Ficha técnica do Açaí Na Lata", cmv, lambda: importar_ficha_acai.importar(args.apply, cmv)),
        ("Complementos do Açaí (topping escolhido no pedido)", None, lambda: configurar_complementos_acai.configurar(args.apply)),
        ("Cardápio da Tradiça (planilha de preços)", precos, lambda: cardapio_da_tradica(args.apply, precos)),
        ("Insumos e receitas da Tradiça", "sempre", lambda: montar_cardapio_tradica.montar(args.apply, compras)),
        ("Receita das misturas feitas na casa (aba Sub-Receitas)", ficha, lambda: importar_sub_receitas.importar(ficha, args.apply)),
        ("Custo dos insumos (planilha do Artesanos)", ficha, lambda: importar_custos_insumo.importar(ficha, args.apply)),
    ]

    for numero, (titulo, precisa, rodar) in enumerate(passos, 1):
        print(f"\n{'=' * 72}\n{numero}. {titulo}\n{'=' * 72}")
        if precisa is None or precisa == "sempre" or precisa:
            try:
                rodar()
            except SystemExit as parada:
                # Os scripts param com SystemExit quando o dado não confere
                # (unidade incompatível, planilha diferente da esperada). Os
                # passos seguintes dependem deste, então a sequência para aqui.
                print(f"\n   PAROU AQUI: {parada}")
                print("   Nenhum passo seguinte foi executado.")
                sys.exit(1)
        else:
            print("   planilha não enviada — passo pulado")

    print(f"\n{'=' * 72}\nTodos os passos concluídos.")


if __name__ == "__main__":
    main()
