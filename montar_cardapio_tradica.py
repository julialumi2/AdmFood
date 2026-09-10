# -*- coding: utf-8 -*-
"""Monta os insumos e o esqueleto da Ficha Técnica das duas Tradiças.

Não existe planilha de receita dos hot dogs em lugar nenhum: a Julia
escolheu preencher os gramas direto na tela (10/09/2026). Então este
script deixa tudo pronto pra ela só digitar números:

1. Insumos que a Tradiça compra de verdade (planilha "Compras Tradiça -
   Painel de Controle"). O custo sai da própria planilha de compras, que é
   opcional: sem ela, os insumos entram sem custo. Só ganha custo o que tem
   o tamanho da embalagem no nome ("Batata Palha 500grs") ou é vendido por
   quilo — salsicha "pct 5Kg" a R$ 35,17 pode ser o pacote ou o quilo, e
   custo chutado é o erro que já custou um CMV de 18.000% neste sistema.
2. Esqueleto da receita: pão, salsicha e o que o NOME do produto garante
   ("Beicão (com Bacon)" leva bacon). Quantidade em branco. O resto da base
   (purê, milho, batata palha...) a Julia adiciona na tela.

O cardápio em si NÃO sai daqui: vem da planilha de preços, pelo botão
"Importar planilha" do Cardápio (backend/precos_cardapio.py). Receita só é
criada pra produto que já está no cardápio da loja — então importe os
preços antes. O item de Ficha Técnica ganha o nome curto que a Cardápio Web
vende ("Calabreso"); a lista de preços casa com ele ignorando o parêntese
("Calabreso (com Calabresa)"), ver _casar_item_cardapio.

Preço de compra não fica escrito aqui porque o repositório é público.

Idempotente: produto que já tem receita na loja não é tocado; insumo que já
existe é reaproveitado, e só ganha custo se ainda não tiver nenhum.

Uso:
  python montar_cardapio_tradica.py [planilha_de_compras.xlsx]            # simulação
  python montar_cardapio_tradica.py [planilha_de_compras.xlsx] --apply    # grava
"""
import sys
from datetime import date, datetime

import openpyxl

from backend.armazenamento import (
    conexao,
    criar_insumo,
    criar_item_cardapio,
    definir_ficha_tecnica,
    inicializar_banco,
    _normalizar_nome_insumo,
    _SUFIXO_PARENTESES,
)
from backend.nomes_insumo import localizar_insumo
from importar_ficha_tecnica_faltante import custo_para_insumo

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

LOJAS = ["Tradiça ZN", "Tradiça Simus"]

# nome no sistema -> (unidade, categoria). Os quatro últimos já existem no
# cadastro (Artesanos) e só ganham vínculo com a Tradiça — o cheddar
# cremoso é o mesmo "Molho sabor Cheddar CATUPIRY" em bisnaga.
INSUMOS = {
    "Pão de hot dog": ("un", "Pães"),
    "Salsicha": ("g", "Proteínas"),
    "Calabresa fatiada": ("g", "Proteínas"),
    "Peito de frango": ("g", "Proteínas"),
    "Requeijão cremoso (Scala)": ("g", "Laticínios"),
    "Batata palha": ("g", "Insumos"),
    "Milho verde": ("g", "Insumos"),
    "Batata para purê": ("g", "Hortifruti"),
    "Margarina": ("g", "Insumos"),
    "Leite": ("ml", "Laticínios"),
    "Sal": ("g", "Temperos"),
    "Ketchup": ("g", "Molhos"),
    "Mostarda": ("g", "Molhos"),
    "Sachê de ketchup": ("un", "Embalagens"),
    "Papel laminado Tradiça": ("un", "Embalagens"),
    "Guardanapo sachê": ("un", "Embalagens"),
    "Saco delivery Tradiça": ("un", "Embalagens"),
    "Pudim de copo": ("un", "Sobremesas"),
    "Bacon": ("g", "Proteínas"),
    "Queijo mussarela": ("g", "Laticínios"),
    "Queijo cheddar cremoso": ("g", "Laticínios"),
    "Tomate": ("g", "Hortifruti"),
}

# Produto na planilha de compras (normalizado) -> (insumo, quanto da unidade
# base do insumo vem em 1 unidade comprada). Ex: "Batata Palha 500grs" a
# R$ 10,49 = R$ 10,49 por 500 g.
COMPRA_PARA_INSUMO = {
    "calabresa fatiada 1kg frimesa ou mister beef": ("Calabresa fatiada", 1000),
    "peito de frango s osso e s pele": ("Peito de frango", 1000),
    "batata palha 500grs serra mineira": ("Batata palha", 500),
    "milho quero balde 1 7kg": ("Milho verde", 1700),
    "batata pure tradica": ("Batata para purê", 1000),
    "margarina 1kg": ("Margarina", 1000),
    "leite integral 1l": ("Leite", 1000),
    "sal": ("Sal", 1000),
    "ketchup hemmer sache cx com 190un": ("Sachê de ketchup", 190),
    "papel personalizado laminado tradica": ("Papel laminado Tradiça", 1),
    # "Caixa com 1.000" mas o preço lançado já é por sachê (R$ 0,14).
    "guardanapo sache branco liso caixa com 1 000": ("Guardanapo sachê", 1),
    "saco delivery personalizado": ("Saco delivery Tradiça", 1),
    "pudim de copo": ("Pudim de copo", 1),
}

# Nomes com que a loja pode ter cadastrado cada insumo à mão: os da planilha
# de compras (é o que aparece na nota).
APELIDOS = {}
for _compra, (_insumo, _fator) in COMPRA_PARA_INSUMO.items():
    APELIDOS.setdefault(_insumo, []).append(_compra)
for _insumo, _compra in (
    ("Salsicha", "Salsicha Perdigão pct 5Kg"),
    ("Requeijão cremoso (Scala)", "Requeijão cremoso (Scala)"),
    ("Ketchup", "Ketchup Cepera Galão"),
    ("Mostarda", "Mostarda Cepera Galão"),
    ("Bacon", "Bacon Fatiado Smoke-MR BEEF"),
    ("Queijo mussarela", "Queijo Mussarela FATIADA"),
    ("Queijo cheddar cremoso", "Molho sabor Cheddar CATUPIRY (bisnaga 1.5kg)"),
):
    APELIDOS.setdefault(_insumo, []).append(_compra)

# O que não dá pra precificar sozinho — vira lista de pendência no relatório.
SEM_CUSTO_POSSIVEL = {
    "Pão de hot dog": "não aparece nas compras",
    "Salsicha": "a compra é 'pct 5Kg': o preço é do pacote ou do quilo?",
    "Requeijão cremoso (Scala)": "bisnaga de quantos kg?",
    "Ketchup": "galão de quantos kg?",
    "Mostarda": "galão de quantos kg?",
}

PAO = "Pão de hot dog"
SALSICHA = "Salsicha"
# Só o que o nome do produto garante. Quantidade fica em branco — exceto o
# pudim, que é 1 copo por definição.
RECEITA = {
    "Simplão": [PAO, SALSICHA],
    "Tradiça": [PAO, SALSICHA],
    "Tradiça Duplo": [PAO, SALSICHA],
    "Especial Duplo": [PAO, SALSICHA, "Bacon", "Requeijão cremoso (Scala)", "Queijo mussarela", "Calabresa fatiada"],
    "Calabreso": [PAO, SALSICHA, "Calabresa fatiada"],
    "Beicão": [PAO, SALSICHA, "Bacon"],
    "Cheddão": [PAO, SALSICHA, "Queijo cheddar cremoso"],
    "Catupidog": [PAO, SALSICHA, "Requeijão cremoso (Scala)"],
    "Queijudo": [PAO, SALSICHA, "Queijo mussarela"],
    "Vegetariano": [PAO],
    "Frangão": [PAO, "Peito de frango"],
    "Pudim no Copo Americano": [("Pudim de copo", 1)],
}


def _numero(valor):
    """Preço vem como número no xlsx; a exportação em texto do Drive traz
    "R$ 3.15". Aceita os dois."""
    if isinstance(valor, (int, float)):
        return float(valor)
    texto = str(valor or "").replace("R$", "").strip()
    if "," in texto and "." in texto:
        texto = texto.replace(",", "")
    try:
        return float(texto.replace(",", "."))
    except ValueError:
        return None


def _data(valor):
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    try:
        return datetime.strptime(str(valor).strip(), "%d/%m/%Y").date()
    except ValueError:
        return date.min


def custos_da_planilha_de_compras(caminho):
    """{insumo: custo por unidade base}, usando o preço da compra mais recente
    de cada produto. Acha a aba pelo cabeçalho (Produto + Preço unit.), não
    pelo nome, pra continuar funcionando se a aba for renomeada."""
    wb = openpyxl.load_workbook(caminho, data_only=True, read_only=True)
    ultima = {}  # produto normalizado -> (data, hora, preço)
    for ws in wb.worksheets:
        colunas = None
        for linha in ws.iter_rows(values_only=True):
            if colunas is None:
                nomes = [_normalizar_nome_insumo(str(c)) if c is not None else "" for c in linha]
                if "produto" in nomes and any(n.startswith("preco unit") for n in nomes):
                    colunas = {
                        "produto": nomes.index("produto"),
                        "preco": next(i for i, n in enumerate(nomes) if n.startswith("preco unit")),
                        "data": nomes.index("data") if "data" in nomes else None,
                        "hora": nomes.index("hora") if "hora" in nomes else None,
                    }
                continue
            produto = linha[colunas["produto"]] if colunas["produto"] < len(linha) else None
            preco = _numero(linha[colunas["preco"]]) if colunas["preco"] < len(linha) else None
            if not produto or not preco:
                continue  # linha em branco ou com preço zerado
            quando = (
                _data(linha[colunas["data"]]) if colunas["data"] is not None else date.min,
                str(linha[colunas["hora"]] or "") if colunas["hora"] is not None else "",
            )
            chave = _normalizar_nome_insumo(str(produto))
            if chave not in ultima or quando > ultima[chave][:2]:
                ultima[chave] = (*quando, preco)
        if colunas:
            break
    if not ultima:
        raise SystemExit("Planilha de compras sem aba com as colunas 'Produto' e 'Preço unit.' — confira o arquivo.")

    custos = {}
    for produto, (insumo, por_unidade_comprada) in COMPRA_PARA_INSUMO.items():
        if produto in ultima:
            custos[insumo] = round(ultima[produto][2] / por_unidade_comprada, 6)
    return custos


def _nome_de_cardapio(nome):
    """"Calabreso (com Calabresa)" -> "calabreso": o parêntese da lista de
    preços é descrição, não nome."""
    return _normalizar_nome_insumo(_SUFIXO_PARENTESES.sub("", nome).strip())


def montar(aplicar=False, compras=None):
    inicializar_banco()
    custos = custos_da_planilha_de_compras(compras) if compras else {}
    with conexao() as conn:
        insumos = {
            _normalizar_nome_insumo(l["nome"]): dict(l)
            for l in conn.execute(
                "SELECT id, nome, unidade_medida, custo_referencia, conteudo_por_unidade, unidade_conteudo FROM insumo"
            ).fetchall()
        }
        ja_na_loja = [dict(l) for l in conn.execute(
            "SELECT i.nome, i.unidade_medida FROM insumo i JOIN insumo_loja il ON il.insumo_id = i.id "
            "WHERE il.loja = ? ORDER BY i.nome", (LOJAS[0],)).fetchall()]
        itens = {
            _normalizar_nome_insumo(l["nome"]): l["id"]
            for l in conn.execute("SELECT id, nome FROM item_cardapio").fetchall()
        }
        com_ficha = {
            (l["item_id"], l["loja"])
            for l in conn.execute("SELECT DISTINCT item_id, loja FROM ficha_tecnica").fetchall()
        }
        # loja -> {nome sem parêntese: categoria} do cardápio de preços
        cardapio = {loja: {} for loja in LOJAS}
        for l in conn.execute(
            f"SELECT loja, produto, categoria FROM preco_cardapio WHERE loja IN ({','.join('?' * len(LOJAS))})", LOJAS
        ).fetchall():
            cardapio[l["loja"]][_nome_de_cardapio(l["produto"])] = l["categoria"]

    print("=== Cardápio (vem da planilha de preços) ===")
    for loja in LOJAS:
        if cardapio[loja]:
            print(f"   {loja}: {len(cardapio[loja])} produtos")
        else:
            print(f"   {loja}: SEM CARDÁPIO — importe a planilha de preços no Cardápio e rode de novo")

    print(f"\n=== Insumos que a {LOJAS[0]} já tem ({len(ja_na_loja)}) ===")
    print("   " + ("; ".join(f"{i['nome']} ({i['unidade_medida']})" for i in ja_na_loja) or "nenhum"))

    print(f"\n=== Insumos ({len(INSUMOS)}) ===")
    if not compras:
        print("   (sem planilha de compras: insumo novo entra sem custo)")
    novo_custo, existentes, novos = {}, {}, []
    for nome, (unidade, _cat) in INSUMOS.items():
        # Insumo que a loja cadastrou à mão pode ter o nome da compra
        # ("Salsicha Perdigão pct 5Kg") ou outra unidade (pacote, em vez de
        # grama): reaproveita do mesmo jeito — a receita daqui vai em
        # branco, então não há quantidade pra converter.
        existente = localizar_insumo([nome, *APELIDOS.get(nome, [])], insumos)
        existentes[nome] = existente
        if not existente:
            novos.append(nome)
        atual = existente["custo_referencia"] if existente else None
        if atual is None and nome in custos:
            convertido = custos[nome] if not existente else custo_para_insumo(custos[nome], unidade, existente)
            if convertido is not None:
                novo_custo[nome] = convertido
        if atual is not None:
            preco = f"R$ {atual} (já tinha)"
        elif nome in novo_custo:
            preco = f"R$ {novo_custo[nome]} (da planilha de compras)"
        else:
            preco = f"SEM CUSTO — {SEM_CUSTO_POSSIVEL.get(nome, 'não achado na planilha de compras')}"
        quem = f"reusa {existente['nome']} ({existente['unidade_medida']})" if existente else f"novo  ({unidade})"
        print(f"   {nome[:28]:28} {quem[:44]:44} {preco}")
    if novos:
        print(f"\n   ⚠ {len(novos)} insumo(s) vão ser CRIADOS: {', '.join(novos)}.")
        print("     Se algum já existe com outro nome, NÃO aplique — mande este relatório pra conferir.")

    print("\n=== Esqueleto das receitas ===")
    plano = []
    for produto, ingredientes in RECEITA.items():
        for loja in LOJAS:
            categoria = cardapio[loja].get(_normalizar_nome_insumo(produto))
            if categoria is None:
                continue  # a loja não vende esse produto (o Pudim, hoje, é só da ZN)
            item_id = itens.get(_normalizar_nome_insumo(produto))
            if item_id and (item_id, loja) in com_ficha:
                print(f"   {produto:26} {loja:14} já tem receita — pulado")
                continue
            plano.append((produto, loja, categoria, ingredientes))
        nomes = [i if isinstance(i, str) else f"{i[0]} ({i[1]})" for i in ingredientes]
        print(f"   {produto:26} {', '.join(nomes)}")

    if not aplicar:
        print("\nSimulação. Rode de novo com --apply pra gravar.")
        return

    ids = {}
    agora = datetime.now().isoformat()
    for nome, (unidade, categoria) in INSUMOS.items():
        existente = existentes[nome]
        if existente:
            ids[nome] = existente["id"]
            with conexao() as conn:
                for loja in LOJAS:
                    conn.execute("INSERT OR IGNORE INTO insumo_loja (insumo_id, loja) VALUES (?, ?)", (existente["id"], loja))
                    conn.execute(
                        "INSERT OR IGNORE INTO estoque_insumo (insumo_id, loja, quantidade_atual, estoque_minimo, atualizado_em) "
                        "VALUES (?, ?, 0, 0, ?)",
                        (existente["id"], loja, agora),
                    )
        else:
            ids[nome] = criar_insumo(nome, categoria, unidade, LOJAS)
        if nome in novo_custo:
            with conexao() as conn:
                conn.execute("UPDATE insumo SET custo_referencia = ? WHERE id = ?", (novo_custo[nome], ids[nome]))

    for produto, loja, categoria, ingredientes in plano:
        item_id = itens.get(_normalizar_nome_insumo(produto)) or criar_item_cardapio(produto, categoria)
        itens[_normalizar_nome_insumo(produto)] = item_id
        links = [
            {"insumoId": ids[i], "quantidade": None} if isinstance(i, str) else {"insumoId": ids[i[0]], "quantidade": i[1]}
            for i in ingredientes
        ]
        definir_ficha_tecnica(item_id, loja, links)

    print(f"\nInsumos: {len(ids)} ({len(novo_custo)} com custo novo). Esqueletos de receita: {len(plano)}.")


if __name__ == "__main__":
    argumentos = [a for a in sys.argv[1:] if a != "--apply"]
    montar(aplicar="--apply" in sys.argv, compras=argumentos[0] if argumentos else None)
