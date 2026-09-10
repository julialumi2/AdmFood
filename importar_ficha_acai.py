# -*- coding: utf-8 -*-
"""Importa a Ficha Técnica do Açaí Na Lata a partir da planilha de CMV
(CMV v2 .xlsx) — 16 receitas, cada uma em dois tamanhos.

Como a planilha é montada: à esquerda, a lista de insumos com o preço por
kg (ou por unidade); à direita, um bloco por sabor com a quantidade em kg
pro copo de 500 ml e pro de "300ML". O cardápio vende 330 ml — é o mesmo
copo, confirmado pela Julia em 10/09/2026.

Daqui só saem as QUANTIDADES. O preço vem da lista de insumos, e o custo
quem calcula é o sistema. Isso de quebra corrige duas fórmulas da planilha
que apontam pra linha errada: o amendoim triturado custa como a farinha de
paçoca (R$ 18/kg em vez de R$ 19,90), e a mistura do "5 complementos 330ml"
sai a R$ 8/kg em vez de R$ 9,38.

Correções que a planilha não resolve sozinha, todas confirmadas:
- Gran Ferreiro 330 ml leva 14 g de amendoim, não 140 g (com 140 g o copo
  pequeno custava mais que o grande).
- "Fruta 1..4" do Frutas ao Creme são Banana, Morango, Manga e Kiwi — os
  custos da planilha só fecham com esses preços (70 g × R$ 6/kg = R$ 0,42...).

Embalagem: a planilha soma lata + saco + colher + guardanapo + suporte +
adesivo numa linha só (R$ 4,41). Aqui ela entra item por item, porque a
lata é o próprio produto e precisa sair do estoque a cada venda. O bloco de
embalagem do copo menor na planilha é cópia do de 500 ml — inclusive com a
lata de 500 dentro. O preço vem desse bloco mesmo assim, então a lata de
330 ml fica com o valor da de 500 até a planilha ser corrigida.

Idempotente: insumo que já existe não é recriado nem tem o custo trocado;
produto que já tem receita nessa loja não é tocado.

Uso:
  python importar_ficha_acai.py            # simulação
  python importar_ficha_acai.py --apply    # grava
"""
import sys
from datetime import datetime

import openpyxl

from backend.armazenamento import (
    conexao,
    criar_insumo,
    criar_item_cardapio,
    definir_ficha_tecnica,
    inicializar_banco,
    _normalizar_nome_insumo,
)
from backend.nomes_insumo import localizar_insumo
from importar_ficha_tecnica_faltante import custo_para_insumo, quantidade_para_insumo

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

PLANILHA = r"C:\Users\Guilherme\Downloads\CMV v2 .xlsx"
LOJA = "Açaí Na Lata"
TAMANHOS = {"500ml": 1, "330ml": 3}  # coluna da quantidade dentro do bloco

# Linha da lista de insumos (coluna A, normalizada) -> como o insumo se chama
# no sistema, unidade base e categoria. Preço da planilha é por kg (vira
# preço por grama) — exceto os potes, que são por unidade.
LISTA = {
    "mistura pronta": ("Mistura pronta de açaí", "g", "Insumos"),
    "l composto alibra 2323 25kg": ("Leite em pó", "g", "Insumos"),
    "farinha de pacoca 1kg": ("Farinha de paçoca", "g", "Complementos"),
    "amendoim triturado 1kg": ("Amendoim triturado", "g", "Complementos"),
    "confete1kg": ("Confete", "g", "Complementos"),
    "ovomaltine 750gr": ("Ovomaltine", "g", "Complementos"),
    "gotas de chocolate 2 5kg": ("Gotas de chocolate", "g", "Complementos"),
    "granola senhora granola 1kg": ("Granola", "g", "Complementos"),
    "creme de ovomaltine chocomalte 4kg": ("Creme de Ovomaltine (Chocomalte)", "g", "Cremes"),
    "creme de amendoim bisnaga": ("Creme de amendoim", "g", "Cremes"),
    "creme de gracher leal gel 4kg": ("Creme Grancher", "g", "Cremes"),
    "creme de avela dorella esencial": ("Creme de avelã", "g", "Cremes"),
    "creme de ninho dorella essencial": ("Creme de Ninho", "g", "Cremes"),
    "creme de cookies dorella 4kg": ("Creme de cookies", "g", "Cremes"),
    "creme de coco bianco dorella 4kg": ("Creme de coco bianco", "g", "Cremes"),
    "leite condensado": ("Leite condensado", "g", "Insumos"),
    "banana": ("Banana", "g", "Frutas"),
    "morango": ("Morango", "g", "Frutas"),
    "manga": ("Manga", "g", "Frutas"),
    "kiwi": ("Kiwi", "g", "Frutas"),
    "pote para molho 30ml galvoteck": ("Pote para molho 30ml", "un", "Embalagens"),
    "pote para molho 60ml galvoteck": ("Pote para molho 60ml", "un", "Embalagens"),
}

# Ingrediente como aparece nos blocos de receita (normalizado) -> linha da
# lista. A planilha escreve o mesmo insumo de jeitos diferentes em cada bloco.
INGREDIENTE = {
    "mistura pronta": "mistura pronta",
    "leite em po": "l composto alibra 2323 25kg",
    "creme de avea": "creme de avela dorella esencial",
    "creme de avela": "creme de avela dorella esencial",
    "creme de ninho": "creme de ninho dorella essencial",
    "creme exemplo ninho": "creme de ninho dorella essencial",
    "ovomaltine": "ovomaltine 750gr",
    "creme de amendoin": "creme de amendoim bisnaga",
    "leite condensado": "leite condensado",
    "pacoca": "farinha de pacoca 1kg",
    "confete": "confete1kg",
    "gotas": "gotas de chocolate 2 5kg",
    "creme grancher": "creme de gracher leal gel 4kg",
    "amendoin triturado": "amendoim triturado 1kg",
    "creme coco bianco": "creme de coco bianco dorella 4kg",
    "creme de chocomalte": "creme de ovomaltine chocomalte 4kg",
    "creme de cookies": "creme de cookies dorella 4kg",
    "banana": "banana",
    "granola": "granola senhora granola 1kg",
    "morango": "morango",
    "fruta 1": "banana",
    "fruta 2": "morango",
    "fruta 3": "manga",
    "fruta 4": "kiwi",
    "embalagem 60ml": "pote para molho 60ml galvoteck",
    "embalagem 30ml": "pote para molho 30ml galvoteck",
}

# A linha "Emabalagem 500ml" de cada receita vira o kit de embalagem daquele
# tamanho, item por item. Os itens e os preços vêm dos blocos "Embalagem
# 500ML" e "Embalagem 300ML" da coluna A da planilha — aqui fica só pra
# qual insumo cada linha vai. A lata muda com o tamanho; o resto é igual.
BLOCO_EMBALAGEM = {"500ml": "embalagem 500ml", "330ml": "embalagem 300ml"}
KIT_EMBALAGEM = {
    "lata": {"500ml": "Lata embalagem 500ml", "330ml": "Lata embalagem 330ml"},
    "saco papel": "Saco de papel",
    "colher": "Colher",
    "guardanapo": "Guardanapo",
    "suporte papelao": "Suporte de papelão",
    "adesivos lata frente e verso": "Adesivos da lata (frente e verso)",
}

# Título do bloco (normalizado) -> nome do produto no cardápio. {tam} vira
# "330ml"/"500ml" — nos "complementos" o tamanho vem no meio do nome.
PRODUTO = {
    "acai avela": "NaLata Creme de Avelã {tam}",
    "acai ninho": "NaLata Creme Ninho {tam}",
    "acai pasta amendoin": "NaLata Creme de Amendoim {tam}",
    "acai pacoca": "NaLata Paçoca {tam}",
    "acai confete": "NaLata Confete {tam}",
    "acai gotas chocolate": "NaLata Gotas {tam}",
    "acai gran ferreiro": "NaLata Granferreiro {tam}",
    "acai rafaelo": "NaLata CocoRafaelo {tam}",
    "acai chocomalte": "NaLata ChocoMaltine {tam}",
    "acai cookies": "NaLata Cookies&Cream {tam}",
    "tradicional": "NaLata Tradicional {tam}",
    "3 complementos": "NaLata {tam} + 3 complementos",
    "5 complementos": "NaLata {tam} + 5 complementos",
    "choco frutas": "ChocoFrutas NaLata {tam}",
    "fruttas ao creme": "Frutas ao Creme NaLata {tam}",
    "puro": "NaLata Puro {tam}",
}

# (bloco, tamanho, ingrediente) -> quantidade em kg corrigida
CORRECOES = {
    ("acai gran ferreiro", "330ml", "amendoin triturado"): 0.014,
}

LINHAS_DE_TOTAL = {"custo total", "valor de venda", "cmv"}


def _ler_lista(ws):
    precos = {}
    for linha in ws.iter_rows(min_row=3, max_row=34, max_col=3, values_only=True):
        if linha[0] and isinstance(linha[2], (int, float)):
            precos[_normalizar_nome_insumo(str(linha[0]))] = float(linha[2])
    return precos


def _ler_kits(ws):
    """{tamanho: [(insumo, preço)]} a partir dos blocos de embalagem."""
    kits = {}
    for tam, titulo in BLOCO_EMBALAGEM.items():
        inicio = next((r for r in range(1, ws.max_row + 1)
                       if _normalizar_nome_insumo(str(ws.cell(row=r, column=1).value or "")) == titulo), None)
        if inicio is None:
            raise SystemExit(f"Bloco {titulo!r} não encontrado na coluna A da planilha.")
        kits[tam] = []
        for r in range(inicio + 1, ws.max_row + 1):
            nome = _normalizar_nome_insumo(str(ws.cell(row=r, column=1).value or ""))
            if not nome or nome == "total":
                break
            destino = KIT_EMBALAGEM.get("lata" if nome.startswith("lata") else nome)
            if destino is None:
                raise SystemExit(f"Item de embalagem {nome!r} sem correspondência em KIT_EMBALAGEM.")
            if isinstance(destino, dict):
                destino = destino[tam]
            kits[tam].append((destino, float(ws.cell(row=r, column=3).value)))
    return kits


def _ler_receitas(ws):
    """[(titulo_normalizado, {tamanho: [(ingrediente, qtd_kg_ou_un)]}, tem_embalagem)]"""
    receitas = []
    for cel in (c for linha in ws.iter_rows() for c in linha):
        if not (isinstance(cel.value, str) and cel.value.strip().lower().startswith("descri") and cel.column > 3):
            continue
        chave = _normalizar_nome_insumo(str(ws.cell(row=cel.row - 1, column=cel.column).value or ""))
        por_tamanho = {tam: [] for tam in TAMANHOS}
        tem_embalagem, pendentes = False, []
        linha = cel.row
        while linha < ws.max_row:
            linha += 1
            nome = ws.cell(row=linha, column=cel.column).value
            # A planilha escreve "Emabalagem" na maioria dos blocos.
            normal = _normalizar_nome_insumo(str(nome)).replace("emabalagem", "embalagem") if nome else ""
            if normal == "cmv" or normal.startswith("descri"):
                break
            if not normal or normal in LINHAS_DE_TOTAL:
                continue
            # "Embalagem 500ml" é o kit da lata; "Embalagem 30ml/60ml" são os
            # potes de acompanhamento, que seguem como ingrediente normal.
            if normal in ("embalagem", "embalagem 500ml", "embalagem 300ml"):
                tem_embalagem = True
                continue
            for tam, deslocamento in TAMANHOS.items():
                qtd = ws.cell(row=linha, column=cel.column + deslocamento).value
                qtd = CORRECOES.get((chave, tam, normal), qtd)
                if isinstance(qtd, (int, float)) and qtd:
                    por_tamanho[tam].append((normal, float(qtd)))
                elif tam == "500ml":
                    pendentes.append(str(nome).strip())
        receitas.append((chave, por_tamanho, tem_embalagem, pendentes))
    return receitas


# Nomes do kit de embalagem como aparecem no estoque e na planilha — é como
# quem cadastrou à mão escreveu.
APELIDOS_EMBALAGEM = {
    "Lata embalagem 500ml": ["Lata Embalagem 500ml", "Lata embalagem 13-500ml"],
    "Lata embalagem 330ml": ["Lata embalagem 7-300ml", "Lata embalagem 300ml"],
    "Saco de papel": ["Saco Papel"],
    "Suporte de papelão": ["Suporte Papelao", "Suporte Copos Papelão"],
    "Adesivos da lata (frente e verso)": ["Adesivos Lata (Frente e verso)"],
}


def candidatos_do_insumo(nome):
    """Os nomes que um insumo do Açaí pode ter no cadastro: o que este
    import daria e como a planilha de CMV escreve — que é o nome usado por
    quem cadastrou à mão em produção ("Amendoim triturado 1kg")."""
    candidatos = [nome, *APELIDOS_EMBALAGEM.get(nome, [])]
    return candidatos + [linha for linha, (sistema, _u, _c) in LISTA.items() if sistema == nome]


def cadastro_de_insumos():
    with conexao() as conn:
        return {
            _normalizar_nome_insumo(l["nome"]): dict(l)
            for l in conn.execute(
                "SELECT id, nome, unidade_medida, custo_referencia, conteudo_por_unidade, unidade_conteudo FROM insumo"
            ).fetchall()
        }


def localizar_insumo_acai(nome, cadastro):
    return localizar_insumo(candidatos_do_insumo(nome), cadastro)


def descrever_insumo(insumo):
    conteudo = (f", 1 un = {insumo['conteudo_por_unidade']:g} {insumo['unidade_conteudo']}"
                if insumo.get("conteudo_por_unidade") else "")
    return f"{insumo['nome']} ({insumo['unidade_medida']}{conteudo})"


def importar(aplicar=False, caminho=PLANILHA):
    """Reaproveita insumo que já existe — inclusive o cadastrado à mão por
    pacote, convertendo grama pra pacote pelo conteúdo cadastrado (14 g de
    um saco de 1 kg = 0,014 un). Só cria o que não achar de jeito nenhum, e
    avisa: criar um insumo que já existe com outro nome partiria o estoque
    do mesmo produto em dois."""
    inicializar_banco()
    wb = openpyxl.load_workbook(caminho, data_only=True)
    ws = wb.active
    precos = _ler_lista(ws)
    receitas = _ler_receitas(ws)
    kits = _ler_kits(ws)
    cadastro = cadastro_de_insumos()

    with conexao() as conn:
        itens = {
            _normalizar_nome_insumo(l["nome"]): l["id"]
            for l in conn.execute("SELECT id, nome FROM item_cardapio").fetchall()
        }
        cardapio = {
            _normalizar_nome_insumo(l["produto"]): (l["produto"], l["categoria"])
            for l in conn.execute("SELECT produto, categoria FROM preco_cardapio WHERE loja = ?", (LOJA,)).fetchall()
        }
        com_ficha = {
            l["item_id"] for l in conn.execute("SELECT DISTINCT item_id FROM ficha_tecnica WHERE loja = ?", (LOJA,)).fetchall()
        }
        ja_na_loja = [dict(l) for l in conn.execute(
            "SELECT i.nome, i.unidade_medida, i.conteudo_por_unidade, i.unidade_conteudo FROM insumo i "
            "JOIN insumo_loja il ON il.insumo_id = i.id WHERE il.loja = ? ORDER BY i.nome", (LOJA,)).fetchall()]

    print(f"=== Insumos que o {LOJA} já tem ({len(ja_na_loja)}) ===")
    print("   " + ("; ".join(descrever_insumo(i) for i in ja_na_loja) if ja_na_loja else "nenhum"))

    # --- insumos -------------------------------------------------------------
    # nome no sistema -> unidade de quem é criado aqui, preço e em que
    # unidade ele vem na planilha (por kg, ou por unidade nos potes e no kit)
    necessarios = {}
    for linha, (nome, unidade, categoria) in LISTA.items():
        if linha not in precos:
            raise SystemExit(f"Linha {linha!r} não está mais na lista da planilha — confira o arquivo.")
        necessarios[nome] = {"unidade": unidade, "preco": precos[linha],
                             "origem": "kg" if unidade == "g" else "un", "categoria": categoria}
    for itens_kit in kits.values():
        for nome, preco in itens_kit:
            necessarios.setdefault(nome, {"unidade": "un", "preco": preco, "origem": "un", "categoria": "Embalagens"})

    print(f"\n=== Insumos da receita ({len(necessarios)}) ===")
    novos = []
    for nome, info in necessarios.items():
        existente = localizar_insumo_acai(nome, cadastro)
        info["existente"] = existente
        if not existente:
            novos.append(nome)
            info["custo"] = round(info["preco"] / 1000 if info["unidade"] == "g" else info["preco"], 6)
            print(f"   novo   {nome[:40]:40} {info['unidade']:<3} R$ {info['custo']}")
            continue
        info["custo"] = custo_para_insumo(info["preco"], info["origem"], existente)
        if existente["custo_referencia"] is not None:
            nota = "mantém o custo que já tinha"
        elif info["custo"] is None:
            nota = "SEM CUSTO — cadastre quanto tem em 1 unidade" if existente["unidade_medida"] == "un" else "sem custo"
        else:
            nota = f"ganha custo R$ {info['custo']}"
        print(f"   reusa  {descrever_insumo(existente)[:52]:52} <- {nome}  ({nota})")
    if novos:
        print(f"\n   ⚠ {len(novos)} insumo(s) vão ser CRIADOS: {', '.join(novos)}.")
        print("     Se algum já existe com outro nome, NÃO aplique — mande este relatório pra conferir.")

    # --- produtos e receitas -------------------------------------------------
    print(f"\n=== Receitas ({len(receitas)} blocos × {len(TAMANHOS)} tamanhos) ===")
    plano, em_branco = [], set()
    for chave, por_tamanho, tem_embalagem, pendentes in receitas:
        if chave not in PRODUTO:
            print(f"   ! bloco {chave!r} não tem produto correspondente — pulado")
            continue
        for tam in TAMANHOS:
            nome_produto = PRODUTO[chave].format(tam=tam)
            no_cardapio = cardapio.get(_normalizar_nome_insumo(nome_produto))
            nome_final, categoria = no_cardapio or (nome_produto, "MONTE O SEU")
            linhas = []
            for ingrediente, qtd in por_tamanho[tam]:
                linha_lista = INGREDIENTE.get(ingrediente)
                if not linha_lista:
                    raise SystemExit(f"Ingrediente {ingrediente!r} ({chave}) sem correspondência na lista — adicione em INGREDIENTE.")
                nome_insumo, unidade, _cat = LISTA[linha_lista]
                linhas.append((nome_insumo, qtd, "kg" if unidade == "g" else "un"))
            linhas += [(nome, 1, "un") for nome, _preco in kits[tam]]

            links = []
            for nome_insumo, qtd, origem in linhas:
                existente = necessarios[nome_insumo]["existente"]
                if existente:
                    quantidade = quantidade_para_insumo(qtd, origem, existente)
                    if quantidade is None:
                        em_branco.add(descrever_insumo(existente))
                else:
                    quantidade = round(qtd * 1000, 2) if origem == "kg" else qtd
                links.append((nome_insumo, quantidade))
            ja_tem = itens.get(_normalizar_nome_insumo(nome_final)) in com_ficha
            plano.append((nome_final, categoria, links, ja_tem))
            marca = "já tem receita — pulado" if ja_tem else f"{len(links)} insumos"
            fora = "" if no_cardapio else "  (não está na lista de preços da loja)"
            aviso = "" if tem_embalagem else "  (planilha sem linha de embalagem — kit adicionado)"
            print(f"   {nome_final[:38]:38} {marca}{fora}{aviso}")
        if pendentes:
            print(f"      ! linha sem quantidade na planilha, fica de fora: {', '.join(pendentes)}")
    if em_branco:
        print("\n   Quantidade em branco (insumo contado por unidade, sem conteúdo cadastrado):")
        for descricao in sorted(em_branco):
            print(f"      {descricao} — cadastre quanto tem em 1 unidade e ajuste na ficha")

    faltando_no_plano = [p for n, (p, _c) in cardapio.items()
                         if n not in {_normalizar_nome_insumo(x[0]) for x in plano}]
    if faltando_no_plano:
        print("\n   Na lista de preços mas sem receita na planilha:")
        for p in faltando_no_plano:
            print(f"      {p}")

    if not aplicar:
        print("\nSimulação. Rode de novo com --apply pra gravar.")
        return

    ids = {}
    agora = datetime.now().isoformat()
    for nome, info in necessarios.items():
        existente = info["existente"]
        if existente:
            ids[nome] = existente["id"]
            with conexao() as conn:
                conn.execute("INSERT OR IGNORE INTO insumo_loja (insumo_id, loja) VALUES (?, ?)", (existente["id"], LOJA))
                conn.execute(
                    "INSERT OR IGNORE INTO estoque_insumo (insumo_id, loja, quantidade_atual, estoque_minimo, atualizado_em) "
                    "VALUES (?, ?, 0, 0, ?)",
                    (existente["id"], LOJA, agora),
                )
                if existente["custo_referencia"] is None and info["custo"] is not None:
                    conn.execute("UPDATE insumo SET custo_referencia = ? WHERE id = ?", (info["custo"], existente["id"]))
        else:
            ids[nome] = criar_insumo(nome, info["categoria"], info["unidade"], [LOJA])
            with conexao() as conn:
                conn.execute("UPDATE insumo SET custo_referencia = ? WHERE id = ?", (info["custo"], ids[nome]))

    gravados = 0
    for nome_produto, categoria, links, ja_tem in plano:
        if ja_tem:
            continue
        item_id = criar_item_cardapio(nome_produto, categoria)
        definir_ficha_tecnica(item_id, LOJA, [{"insumoId": ids[n], "quantidade": q} for n, q in links])
        gravados += 1
    print(f"\nReceitas novas: {gravados}. Insumos conferidos e vinculados ao {LOJA}: {len(necessarios)}.")


if __name__ == "__main__":
    argumentos = [a for a in sys.argv[1:] if a != "--apply"]
    importar(aplicar="--apply" in sys.argv, caminho=argumentos[0] if argumentos else PLANILHA)
