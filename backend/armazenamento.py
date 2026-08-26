"""
Cache local em SQLite do faturamento sincronizado da Cardápio Web.
Evita ter que buscar pedido por pedido a cada carregamento da página —
a sincronização roda separada (via sincronizar.py) e a página só lê daqui.
"""

import os
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta

# Em produção (Dokploy), aponta pra um volume persistente (ex: /app/data/admfood.db)
# via a variável DATABASE_PATH, senão perde os dados a cada novo deploy.
CAMINHO_BANCO = os.environ.get("DATABASE_PATH", "admfood.db")

# Fotos dos produtos do Cardápio ficam no mesmo volume persistente do banco
# (uma pasta "cardapio_fotos" do lado do admfood.db), pelo mesmo motivo:
# sem isso, sumiriam a cada redeploy.
PASTA_FOTOS_CARDAPIO = os.path.join(os.path.dirname(os.path.abspath(CAMINHO_BANCO)), "cardapio_fotos")
os.makedirs(PASTA_FOTOS_CARDAPIO, exist_ok=True)


@contextmanager
def conexao():
    conn = sqlite3.connect(CAMINHO_BANCO)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def inicializar_banco():
    with conexao() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS faturamento_diario (
                unidade TEXT NOT NULL,
                dia TEXT NOT NULL,
                faturamento_dia REAL NOT NULL,
                ticket_medio REAL NOT NULL,
                quantidade_pedidos INTEGER NOT NULL,
                PRIMARY KEY (unidade, dia)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS faturamento_canal (
                unidade TEXT NOT NULL,
                dia TEXT NOT NULL,
                canal TEXT NOT NULL,
                quantidade_pedidos INTEGER NOT NULL,
                faturamento REAL NOT NULL,
                PRIMARY KEY (unidade, dia, canal)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS venda_presencial (
                unidade TEXT NOT NULL,
                dia TEXT NOT NULL,
                valor REAL NOT NULL,
                quantidade INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (unidade, dia)
            )
            """
        )
        colunas = {c["name"] for c in conn.execute("PRAGMA table_info(venda_presencial)").fetchall()}
        if "quantidade" not in colunas:
            conn.execute("ALTER TABLE venda_presencial ADD COLUMN quantidade INTEGER NOT NULL DEFAULT 0")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ajuste_faturamento_canal (
                unidade TEXT NOT NULL,
                dia TEXT NOT NULL,
                canal TEXT NOT NULL,
                faturamento REAL NOT NULL,
                quantidade_pedidos INTEGER NOT NULL,
                criado_em TEXT NOT NULL,
                PRIMARY KEY (unidade, dia, canal)
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tarefa (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo TEXT NOT NULL,
                descricao TEXT NOT NULL DEFAULT '',
                categoria TEXT NOT NULL DEFAULT 'Geral',
                prioridade TEXT NOT NULL DEFAULT 'media',
                status TEXT NOT NULL DEFAULT 'todo',
                data_limite TEXT,
                criado_em TEXT NOT NULL,
                atualizado_em TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tarefa_subtarefa (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tarefa_id INTEGER NOT NULL,
                titulo TEXT NOT NULL,
                concluida INTEGER NOT NULL DEFAULT 0,
                ordem INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tarefa_comentario (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tarefa_id INTEGER NOT NULL,
                autor TEXT NOT NULL,
                texto TEXT NOT NULL,
                criado_em TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS usuario (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                senha_hash TEXT NOT NULL,
                papel TEXT NOT NULL DEFAULT 'equipe',
                ativo INTEGER NOT NULL DEFAULT 1,
                criado_em TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS preco_cardapio (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                loja TEXT NOT NULL,
                categoria TEXT NOT NULL,
                produto TEXT NOT NULL,
                ifood REAL,
                food99 REAL,
                beefood REAL,
                cardapio_web REAL,
                ordem INTEGER NOT NULL,
                foto_arquivo TEXT
            )
            """
        )
        colunas_preco = {c["name"] for c in conn.execute("PRAGMA table_info(preco_cardapio)").fetchall()}
        if "foto_arquivo" not in colunas_preco:
            conn.execute("ALTER TABLE preco_cardapio ADD COLUMN foto_arquivo TEXT")
        # Índice único (não PK) pra sincronizar_precos_cardapio conseguir usar
        # "ON CONFLICT(loja, produto)" — atualiza produto existente em vez de
        # duplicar, preservando o id e a foto ao reimportar a planilha.
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_preco_cardapio_loja_produto ON preco_cardapio(loja, produto)"
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS pedido_preparo (
                unidade TEXT NOT NULL,
                pedido_id INTEGER NOT NULL,
                dia TEXT NOT NULL,
                canal TEXT NOT NULL,
                criado_em TEXT NOT NULL,
                atualizado_em TEXT NOT NULL,
                duracao_minutos REAL NOT NULL,
                PRIMARY KEY (unidade, pedido_id)
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_pedido_preparo_dia ON pedido_preparo(dia)"
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS insumo (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                categoria TEXT NOT NULL DEFAULT 'Geral',
                unidade_medida TEXT NOT NULL DEFAULT 'un'
            )
            """
        )
        colunas_insumo = {c["name"] for c in conn.execute("PRAGMA table_info(insumo)").fetchall()}
        if "favorito" not in colunas_insumo:
            conn.execute("ALTER TABLE insumo ADD COLUMN favorito INTEGER NOT NULL DEFAULT 0")
        if "marca_homologada" not in colunas_insumo:
            conn.execute("ALTER TABLE insumo ADD COLUMN marca_homologada TEXT NOT NULL DEFAULT ''")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS estoque_insumo (
                insumo_id INTEGER NOT NULL,
                loja TEXT NOT NULL,
                quantidade_atual REAL NOT NULL DEFAULT 0,
                estoque_minimo REAL NOT NULL DEFAULT 0,
                atualizado_em TEXT NOT NULL,
                PRIMARY KEY (insumo_id, loja)
            )
            """
        )

        # Lotes de validade por entrada — separado de estoque_insumo porque a
        # quantidade lá é um total agregado por loja, sem distinguir remessas;
        # uma mesma "entrada" pode ter validade diferente da anterior. validade
        # é opcional (insumo não perecível, tipo embalagem, não precisa ter).
        # resolvido_em marca que o lote já foi usado/descartado (soft, não
        # apaga a linha) — pra parar de contar no aviso de vencimento sem
        # perder o histórico.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS lote_insumo (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                insumo_id INTEGER NOT NULL,
                loja TEXT NOT NULL,
                quantidade REAL NOT NULL,
                validade TEXT,
                criado_em TEXT NOT NULL,
                resolvido_em TEXT
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_lote_insumo_validade ON lote_insumo(validade)"
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS item_cardapio (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL UNIQUE,
                categoria TEXT NOT NULL DEFAULT 'Geral'
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ficha_tecnica (
                item_id INTEGER NOT NULL,
                insumo_id INTEGER NOT NULL,
                quantidade REAL,
                PRIMARY KEY (item_id, insumo_id)
            )
            """
        )

        # Vendas por prato, extraídas do mesmo detalhe de pedido que já é
        # buscado pra somar faturamento (ver _itens_vendidos em
        # cardapio_web.py) — usado pra estimar consumo de insumo (ficha
        # técnica × vendas reais, seção 6.6). item_cardapio_id fica NULL
        # quando o nome do produto não bate com nenhum item da Ficha Técnica
        # ainda cadastrado — a linha é salva mesmo assim (pelo nome cru), pra
        # já existir histórico quando o item for cadastrado depois.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS venda_item (
                unidade TEXT NOT NULL,
                pedido_id INTEGER NOT NULL,
                linha INTEGER NOT NULL,
                dia TEXT NOT NULL,
                canal TEXT NOT NULL,
                nome_produto TEXT NOT NULL,
                quantidade REAL NOT NULL,
                item_cardapio_id INTEGER,
                PRIMARY KEY (unidade, pedido_id, linha)
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_venda_item_dia ON venda_item(dia)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_venda_item_item_cardapio ON venda_item(item_cardapio_id)"
        )

        # Cadastro de fornecedor — semente do futuro módulo de Compras/
        # Cotação (ver seção 9 da documentação), começando só pelo diretório,
        # sem fluxo de cotação ainda. De rede toda (não por loja, diferente
        # de insumo/estoque_insumo) — um fornecedor atende a rede inteira,
        # não uma unidade específica. "ativo" em vez de excluir de verdade,
        # porque cotação/pedido de compra (fases futuras) vão referenciar
        # fornecedor_id — apagar quebraria esse histórico (mesmo raciocínio
        # de usuario.ativo).
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS fornecedor (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                cnpj TEXT NOT NULL DEFAULT '',
                categoria TEXT NOT NULL DEFAULT 'Geral',
                contato_nome TEXT NOT NULL DEFAULT '',
                contato_telefone TEXT NOT NULL DEFAULT '',
                contato_email TEXT NOT NULL DEFAULT '',
                prazo_pagamento TEXT NOT NULL DEFAULT '',
                dias_entrega TEXT NOT NULL DEFAULT '',
                pedido_minimo REAL NOT NULL DEFAULT 0,
                observacoes TEXT NOT NULL DEFAULT '',
                ativo INTEGER NOT NULL DEFAULT 1,
                criado_em TEXT NOT NULL
            )
            """
        )

        # Quais fornecedores cotam cada insumo — declarado de antemão (não
        # inferido de cotação passada), pra quando for gerar uma cotação já
        # saber pra quem mandar pedir preço de cada item. Ver processo real
        # descrito na seção 9 da documentação (fluxo da VMarket via Kethllyn).
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS insumo_fornecedor (
                insumo_id INTEGER NOT NULL,
                fornecedor_id INTEGER NOT NULL,
                PRIMARY KEY (insumo_id, fornecedor_id)
            )
            """
        )

        # Cotação (RFQ manual) — fase 2 do módulo de Compras (ver seção 6.7/9
        # da documentação). "Manual" porque não tem coleta automática de
        # preço via WhatsApp ainda (depende do mesmo bloqueio de sempre) —
        # aqui só se registra o preço que cada fornecedor já passou por
        # fora, pra comparar. Sem tabela de "quais insumos/fornecedores
        # participam" declarada à parte: a grade da cotação (linhas e
        # colunas) é inferida dos próprios registros de preço já lançados
        # (cotacao_preco), o que simplifica o schema mas significa que um
        # insumo/fornecedor só "aparece" na cotação quando tem preço
        # lançado — não dá pra reservar uma célula vazia de antemão.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS cotacao (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'aberta',
                criado_em TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS cotacao_preco (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cotacao_id INTEGER NOT NULL,
                insumo_id INTEGER NOT NULL,
                fornecedor_id INTEGER NOT NULL,
                preco REAL NOT NULL,
                selecionado INTEGER NOT NULL DEFAULT 0,
                criado_em TEXT NOT NULL,
                UNIQUE (cotacao_id, insumo_id, fornecedor_id)
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cotacao_preco_cotacao ON cotacao_preco(cotacao_id)"
        )

        # Contagem de estoque por link (sem login) — replica o fluxo real da
        # VMarket: Kethllyn abre uma contagem pra uma loja, manda o link pro
        # funcionário preencher (identificado só pelo token, sem senha), e a
        # resposta fica de rascunho até ela conferir e aprovar — só então
        # vira quantidade_atual de verdade em estoque_insumo. Ver seção 9 da
        # documentação (link de exemplo da VMarket).
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS contagem (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token TEXT NOT NULL UNIQUE,
                loja TEXT NOT NULL,
                descricao TEXT NOT NULL DEFAULT '',
                prazo_validade TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'aberta',
                criado_em TEXT NOT NULL,
                respondida_em TEXT,
                aprovada_em TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS contagem_item (
                contagem_id INTEGER NOT NULL,
                insumo_id INTEGER NOT NULL,
                quantidade_preenchida REAL,
                PRIMARY KEY (contagem_id, insumo_id)
            )
            """
        )


def salvar_resumo_do_dia(unidade, dia_iso, resumo):
    ticket_medio = (
        resumo["faturamento_dia"] / resumo["quantidade_pedidos"]
        if resumo["quantidade_pedidos"] > 0
        else 0.0
    )
    with conexao() as conn:
        conn.execute(
            """
            INSERT INTO faturamento_diario
                (unidade, dia, faturamento_dia, ticket_medio, quantidade_pedidos)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (unidade, dia) DO UPDATE SET
                faturamento_dia = excluded.faturamento_dia,
                ticket_medio = excluded.ticket_medio,
                quantidade_pedidos = excluded.quantidade_pedidos
            """,
            (unidade, dia_iso, resumo["faturamento_dia"], ticket_medio, resumo["quantidade_pedidos"]),
        )
        conn.execute(
            "DELETE FROM faturamento_canal WHERE unidade = ? AND dia = ?",
            (unidade, dia_iso),
        )
        for canal in resumo["canais"]:
            conn.execute(
                """
                INSERT INTO faturamento_canal (unidade, dia, canal, quantidade_pedidos, faturamento)
                VALUES (?, ?, ?, ?, ?)
                """,
                (unidade, dia_iso, canal["canal"], canal["quantidade_pedidos"], canal["faturamento"]),
            )


def salvar_historico_se_ausente(unidade, dia_iso, faturamento):
    """Grava um dia histórico (ex: importado de planilha) só se ainda não existir.
    Dado sincronizado ao vivo pela Cardápio Web nunca é sobrescrito por isso."""
    with conexao() as conn:
        existe = conn.execute(
            "SELECT 1 FROM faturamento_diario WHERE unidade = ? AND dia = ?",
            (unidade, dia_iso),
        ).fetchone()
        if existe:
            return False
        conn.execute(
            """
            INSERT INTO faturamento_diario
                (unidade, dia, faturamento_dia, ticket_medio, quantidade_pedidos)
            VALUES (?, ?, ?, 0, 0)
            """,
            (unidade, dia_iso, faturamento),
        )
        return True


def dias_sem_pedidos_contados():
    """Dias com faturamento real mas sem contagem de pedidos (ex: importados
    de planilha, que não trazem esse dado)."""
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT unidade, dia, faturamento_dia
            FROM faturamento_diario
            WHERE quantidade_pedidos = 0 AND faturamento_dia > 0
            ORDER BY unidade, dia
            """
        ).fetchall()
        return [dict(linha) for linha in linhas]


def atualizar_pedidos_dia(unidade, dia_iso, quantidade_pedidos):
    with conexao() as conn:
        linha = conn.execute(
            "SELECT faturamento_dia FROM faturamento_diario WHERE unidade = ? AND dia = ?",
            (unidade, dia_iso),
        ).fetchone()
        if not linha:
            return
        ticket_medio = linha["faturamento_dia"] / quantidade_pedidos if quantidade_pedidos > 0 else 0.0
        conn.execute(
            """
            UPDATE faturamento_diario
            SET quantidade_pedidos = ?, ticket_medio = ?
            WHERE unidade = ? AND dia = ?
            """,
            (quantidade_pedidos, ticket_medio, unidade, dia_iso),
        )


def buscar_faturamento_periodo(inicio_iso, fim_iso):
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT unidade, dia, faturamento_dia, ticket_medio, quantidade_pedidos
            FROM faturamento_diario
            WHERE dia >= ? AND dia <= ?
            ORDER BY dia DESC
            """,
            (inicio_iso, fim_iso),
        ).fetchall()
        return [dict(linha) for linha in linhas]


def buscar_canais_periodo(inicio_iso, fim_iso):
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT unidade, dia, canal, quantidade_pedidos, faturamento
            FROM faturamento_canal
            WHERE dia >= ? AND dia <= ?
            """,
            (inicio_iso, fim_iso),
        ).fetchall()
        return [dict(linha) for linha in linhas]


def salvar_ajuste_canal(unidade, dia_iso, canal, faturamento, quantidade_pedidos):
    """Corrige manualmente o faturamento/pedidos de UM canal, em UM dia, de
    UMA loja — usado quando o painel da própria Cardápio Web diverge do que
    a API retorna (já investigado e confirmado que não dá pra confiar
    automaticamente num dos dois). Esse ajuste "vence" o valor sincronizado
    até ser removido (ver excluir_ajuste_canal) — uma sincronização futura
    não apaga nem sobrescreve essa linha, ela mora numa tabela separada."""
    with conexao() as conn:
        conn.execute(
            """
            INSERT INTO ajuste_faturamento_canal
                (unidade, dia, canal, faturamento, quantidade_pedidos, criado_em)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(unidade, dia, canal) DO UPDATE SET
                faturamento = excluded.faturamento,
                quantidade_pedidos = excluded.quantidade_pedidos,
                criado_em = excluded.criado_em
            """,
            (unidade, dia_iso, canal, faturamento, quantidade_pedidos, datetime.now().isoformat()),
        )


def excluir_ajuste_canal(unidade, dia_iso, canal):
    """Remove o ajuste manual — volta a mostrar o valor sincronizado normal."""
    with conexao() as conn:
        conn.execute(
            "DELETE FROM ajuste_faturamento_canal WHERE unidade = ? AND dia = ? AND canal = ?",
            (unidade, dia_iso, canal),
        )


def buscar_ajustes_canal_periodo(inicio_iso, fim_iso):
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT unidade, dia, canal, faturamento, quantidade_pedidos
            FROM ajuste_faturamento_canal
            WHERE dia >= ? AND dia <= ?
            """,
            (inicio_iso, fim_iso),
        ).fetchall()
        return [dict(linha) for linha in linhas]


def salvar_venda_presencial(unidade, dia_iso, valor, quantidade=0):
    with conexao() as conn:
        conn.execute(
            """
            INSERT INTO venda_presencial (unidade, dia, valor, quantidade)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (unidade, dia) DO UPDATE SET valor = excluded.valor, quantidade = excluded.quantidade
            """,
            (unidade, dia_iso, valor, quantidade),
        )


def excluir_venda_presencial(unidade, dia_iso):
    with conexao() as conn:
        conn.execute(
            "DELETE FROM venda_presencial WHERE unidade = ? AND dia = ?",
            (unidade, dia_iso),
        )


def buscar_presencial_periodo(inicio_iso, fim_iso):
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT unidade, dia, valor, quantidade
            FROM venda_presencial
            WHERE dia >= ? AND dia <= ?
            """,
            (inicio_iso, fim_iso),
        ).fetchall()
        return [dict(linha) for linha in linhas]



def buscar_ultima_sincronizacao(unidade=None):
    """Data mais recente com faturamento registrado — de uma unidade
    específica, ou de qualquer uma (usada como indicativo aproximado de
    "última sincronização")."""
    with conexao() as conn:
        if unidade:
            linha = conn.execute(
                "SELECT MAX(dia) AS ultimo_dia FROM faturamento_diario "
                "WHERE unidade = ? AND (quantidade_pedidos > 0 OR faturamento_dia > 0)",
                (unidade,),
            ).fetchone()
        else:
            linha = conn.execute(
                "SELECT MAX(dia) AS ultimo_dia FROM faturamento_diario WHERE quantidade_pedidos > 0 OR faturamento_dia > 0"
            ).fetchone()
        return linha["ultimo_dia"] if linha and linha["ultimo_dia"] else None


def buscar_presencial_por_unidade(unidade, limite=10):
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT unidade, dia, valor, quantidade
            FROM venda_presencial
            WHERE unidade = ?
            ORDER BY dia DESC
            LIMIT ?
            """,
            (unidade, limite),
        ).fetchall()
        return [dict(linha) for linha in linhas]


def listar_unidades():
    with conexao() as conn:
        linhas = conn.execute(
            "SELECT DISTINCT unidade FROM faturamento_diario ORDER BY unidade"
        ).fetchall()
        return [linha["unidade"] for linha in linhas]


# --- TAREFAS (quadro do ClickUp) -------------------------------------------

def listar_tarefas():
    with conexao() as conn:
        tarefas = [dict(t) for t in conn.execute("SELECT * FROM tarefa ORDER BY criado_em DESC").fetchall()]
        for tarefa in tarefas:
            tarefa["subtarefas"] = [
                dict(s) for s in conn.execute(
                    "SELECT * FROM tarefa_subtarefa WHERE tarefa_id = ? ORDER BY ordem, id",
                    (tarefa["id"],),
                ).fetchall()
            ]
            tarefa["comentarios"] = [
                dict(c) for c in conn.execute(
                    "SELECT * FROM tarefa_comentario WHERE tarefa_id = ? ORDER BY criado_em",
                    (tarefa["id"],),
                ).fetchall()
            ]
        return tarefas


def criar_tarefa(titulo, descricao, categoria, prioridade, data_limite):
    agora = datetime.now().isoformat()
    with conexao() as conn:
        cursor = conn.execute(
            """
            INSERT INTO tarefa (titulo, descricao, categoria, prioridade, status, data_limite, criado_em, atualizado_em)
            VALUES (?, ?, ?, ?, 'todo', ?, ?, ?)
            """,
            (titulo, descricao, categoria, prioridade, data_limite, agora, agora),
        )
        return cursor.lastrowid


def atualizar_tarefa(tarefa_id, campos):
    """campos: dict com as colunas a mudar (titulo, descricao, categoria,
    prioridade, status, data_limite) — só atualiza o que vier no dict."""
    if not campos:
        return
    campos = dict(campos)
    campos["atualizado_em"] = datetime.now().isoformat()
    colunas = ", ".join(f"{chave} = ?" for chave in campos)
    valores = list(campos.values()) + [tarefa_id]
    with conexao() as conn:
        conn.execute(f"UPDATE tarefa SET {colunas} WHERE id = ?", valores)


def excluir_tarefa(tarefa_id):
    with conexao() as conn:
        conn.execute("DELETE FROM tarefa_comentario WHERE tarefa_id = ?", (tarefa_id,))
        conn.execute("DELETE FROM tarefa_subtarefa WHERE tarefa_id = ?", (tarefa_id,))
        conn.execute("DELETE FROM tarefa WHERE id = ?", (tarefa_id,))


def adicionar_subtarefa(tarefa_id, titulo):
    agora = datetime.now().isoformat()
    with conexao() as conn:
        proxima_ordem = conn.execute(
            "SELECT COALESCE(MAX(ordem), -1) + 1 AS prox FROM tarefa_subtarefa WHERE tarefa_id = ?",
            (tarefa_id,),
        ).fetchone()["prox"]
        cursor = conn.execute(
            "INSERT INTO tarefa_subtarefa (tarefa_id, titulo, concluida, ordem) VALUES (?, ?, 0, ?)",
            (tarefa_id, titulo, proxima_ordem),
        )
        conn.execute("UPDATE tarefa SET atualizado_em = ? WHERE id = ?", (agora, tarefa_id))
        return cursor.lastrowid


def alternar_subtarefa(subtarefa_id, concluida):
    with conexao() as conn:
        conn.execute(
            "UPDATE tarefa_subtarefa SET concluida = ? WHERE id = ?",
            (1 if concluida else 0, subtarefa_id),
        )


def adicionar_comentario(tarefa_id, autor, texto):
    agora = datetime.now().isoformat()
    with conexao() as conn:
        cursor = conn.execute(
            "INSERT INTO tarefa_comentario (tarefa_id, autor, texto, criado_em) VALUES (?, ?, ?, ?)",
            (tarefa_id, autor, texto, agora),
        )
        conn.execute("UPDATE tarefa SET atualizado_em = ? WHERE id = ?", (agora, tarefa_id))
        return cursor.lastrowid


# --- USUÁRIOS (login da equipe) ---------------------------------------------

def criar_usuario(nome, email, senha_hash, papel="equipe"):
    agora = datetime.now().isoformat()
    with conexao() as conn:
        cursor = conn.execute(
            "INSERT INTO usuario (nome, email, senha_hash, papel, ativo, criado_em) VALUES (?, ?, ?, ?, 1, ?)",
            (nome, email.strip().lower(), senha_hash, papel, agora),
        )
        return cursor.lastrowid


def buscar_usuario_por_email(email):
    with conexao() as conn:
        linha = conn.execute("SELECT * FROM usuario WHERE email = ?", (email.strip().lower(),)).fetchone()
        return dict(linha) if linha else None


def buscar_usuario_por_id(usuario_id):
    with conexao() as conn:
        linha = conn.execute("SELECT * FROM usuario WHERE id = ?", (usuario_id,)).fetchone()
        return dict(linha) if linha else None


def listar_usuarios():
    with conexao() as conn:
        linhas = conn.execute("SELECT * FROM usuario ORDER BY criado_em").fetchall()
        return [dict(linha) for linha in linhas]


def atualizar_usuario(usuario_id, campos):
    if not campos:
        return
    colunas = ", ".join(f"{campo} = ?" for campo in campos)
    valores = list(campos.values()) + [usuario_id]
    with conexao() as conn:
        conn.execute(f"UPDATE usuario SET {colunas} WHERE id = ?", valores)


def excluir_usuario(usuario_id):
    with conexao() as conn:
        conn.execute("DELETE FROM usuario WHERE id = ?", (usuario_id,))


# --- COMPARATIVO DE PREÇOS DO CARDÁPIO (importado de planilha, editável) --

def sincronizar_precos_cardapio(linhas):
    """Atualiza a partir de uma planilha reimportada, SEM apagar tudo — um
    produto que já existe (mesma loja + nome) tem categoria/preços/ordem
    atualizados, mas mantém o id e a foto_arquivo (a planilha não tem foto).
    Produto novo é inserido; produto que sumiu da planilha é removido.
    Assim, uma foto ou preço editado à mão na tela não se perde só porque a
    Julia importou uma planilha nova depois."""
    with conexao() as conn:
        for linha in linhas:
            conn.execute(
                """
                INSERT INTO preco_cardapio (loja, categoria, produto, ifood, food99, beefood, cardapio_web, ordem)
                VALUES (:loja, :categoria, :produto, :ifood, :food99, :beefood, :cardapio_web, :ordem)
                ON CONFLICT(loja, produto) DO UPDATE SET
                    categoria = excluded.categoria,
                    ifood = excluded.ifood,
                    food99 = excluded.food99,
                    beefood = excluded.beefood,
                    cardapio_web = excluded.cardapio_web,
                    ordem = excluded.ordem
                """,
                linha,
            )

        produtos_por_loja = {}
        for linha in linhas:
            produtos_por_loja.setdefault(linha['loja'], []).append(linha['produto'])
        for loja, produtos in produtos_por_loja.items():
            marcadores = ", ".join("?" * len(produtos))
            conn.execute(
                f"DELETE FROM preco_cardapio WHERE loja = ? AND produto NOT IN ({marcadores})",
                [loja] + produtos,
            )


def listar_precos_cardapio():
    with conexao() as conn:
        linhas = conn.execute("SELECT * FROM preco_cardapio ORDER BY loja, ordem").fetchall()
        return [dict(linha) for linha in linhas]


def buscar_preco_cardapio_por_id(item_id):
    with conexao() as conn:
        linha = conn.execute("SELECT * FROM preco_cardapio WHERE id = ?", (item_id,)).fetchone()
        return dict(linha) if linha else None


def atualizar_preco_cardapio(item_id, campos):
    if not campos:
        return
    colunas = ", ".join(f"{campo} = ?" for campo in campos)
    valores = list(campos.values()) + [item_id]
    with conexao() as conn:
        conn.execute(f"UPDATE preco_cardapio SET {colunas} WHERE id = ?", valores)


def salvar_pedidos_do_dia(unidade, dia_iso, pedidos_detalhados):
    """Grava o tempo de cada pedido concluído do dia (usado pela tela de
    Preparo). Substitui os registros anteriores desse dia/unidade — o dia
    inteiro é resincronizado de uma vez, nunca parcialmente."""
    with conexao() as conn:
        conn.execute(
            "DELETE FROM pedido_preparo WHERE unidade = ? AND dia = ?",
            (unidade, dia_iso),
        )
        for pedido in pedidos_detalhados:
            conn.execute(
                """
                INSERT INTO pedido_preparo
                    (unidade, pedido_id, dia, canal, criado_em, atualizado_em, duracao_minutos)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    unidade,
                    pedido["id"],
                    dia_iso,
                    pedido["canal"],
                    pedido["criado_em"],
                    pedido["atualizado_em"],
                    pedido["duracao_minutos"],
                ),
            )


def salvar_itens_vendidos_do_dia(unidade, dia_iso, pedidos_detalhados):
    """Grava quais itens de cardápio foram vendidos em cada pedido do dia,
    casando pelo nome com item_cardapio (case/espaço insensível — nomes vêm
    da Cardápio Web, cadastro na Ficha Técnica é manual, então não é garantido
    bater exatamente). Mesmo padrão de salvar_pedidos_do_dia: resincroniza o
    dia inteiro. Sem match, item_cardapio_id fica NULL mas a linha é salva
    do mesmo jeito, com o nome bruto — vira histórico utilizável assim que
    o item for cadastrado na Ficha Técnica."""
    with conexao() as conn:
        conn.execute(
            "DELETE FROM venda_item WHERE unidade = ? AND dia = ?",
            (unidade, dia_iso),
        )
        for pedido in pedidos_detalhados:
            for indice, item in enumerate(pedido.get("itens", [])):
                encontrado = conn.execute(
                    "SELECT id FROM item_cardapio WHERE LOWER(TRIM(nome)) = LOWER(TRIM(?))",
                    (item["nome"],),
                ).fetchone()
                conn.execute(
                    """
                    INSERT INTO venda_item
                        (unidade, pedido_id, linha, dia, canal, nome_produto, quantidade, item_cardapio_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        unidade,
                        pedido["id"],
                        indice,
                        dia_iso,
                        pedido["canal"],
                        item["nome"],
                        item["quantidade"],
                        encontrado["id"] if encontrado else None,
                    ),
                )


def buscar_pedidos_preparo_periodo(inicio_iso, fim_iso, unidade=None):
    with conexao() as conn:
        if unidade:
            linhas = conn.execute(
                """
                SELECT unidade, dia, canal, criado_em, duracao_minutos
                FROM pedido_preparo
                WHERE dia >= ? AND dia <= ? AND unidade = ?
                """,
                (inicio_iso, fim_iso, unidade),
            ).fetchall()
        else:
            linhas = conn.execute(
                """
                SELECT unidade, dia, canal, criado_em, duracao_minutos
                FROM pedido_preparo
                WHERE dia >= ? AND dia <= ?
                """,
                (inicio_iso, fim_iso),
            ).fetchall()
        return [dict(linha) for linha in linhas]


def dias_sem_pedidos_preparo():
    """Dias com faturamento sincronizado (pedidos > 0) mas que ainda não têm
    o detalhe de tempo por pedido — usado pelo backfill histórico pra saber
    o que falta processar."""
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT f.unidade, f.dia
            FROM faturamento_diario f
            LEFT JOIN (SELECT DISTINCT unidade, dia FROM pedido_preparo) p
                ON p.unidade = f.unidade AND p.dia = f.dia
            WHERE p.dia IS NULL AND f.quantidade_pedidos > 0
            ORDER BY f.unidade, f.dia
            """
        ).fetchall()
        return [dict(linha) for linha in linhas]


def criar_insumo(nome, categoria, unidade_medida, lojas):
    """Cadastra o insumo uma vez só (catálogo único da rede) e já cria a
    linha de estoque (zerada) em cada loja informada — assim toda loja
    aparece pra distribuir/editar quantidade desde o cadastro, sem precisar
    de um passo extra."""
    with conexao() as conn:
        cursor = conn.execute(
            "INSERT INTO insumo (nome, categoria, unidade_medida) VALUES (?, ?, ?)",
            (nome, categoria, unidade_medida),
        )
        insumo_id = cursor.lastrowid
        agora = datetime.now().isoformat()
        for loja in lojas:
            conn.execute(
                """
                INSERT INTO estoque_insumo (insumo_id, loja, quantidade_atual, estoque_minimo, atualizado_em)
                VALUES (?, ?, 0, 0, ?)
                """,
                (insumo_id, loja, agora),
            )
        return insumo_id


def listar_insumos():
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT i.id AS insumo_id, i.nome, i.categoria, i.unidade_medida, i.favorito,
                   i.marca_homologada,
                   e.loja, e.quantidade_atual, e.estoque_minimo, e.atualizado_em
            FROM insumo i
            JOIN estoque_insumo e ON e.insumo_id = i.id
            ORDER BY i.favorito DESC, i.categoria, i.nome, e.loja
            """
        ).fetchall()
        return [dict(linha) for linha in linhas]


def atualizar_insumo(insumo_id, campos):
    if not campos:
        return
    colunas = ", ".join(f"{campo} = ?" for campo in campos)
    valores = list(campos.values()) + [insumo_id]
    with conexao() as conn:
        conn.execute(f"UPDATE insumo SET {colunas} WHERE id = ?", valores)


def excluir_insumo(insumo_id):
    with conexao() as conn:
        conn.execute("DELETE FROM estoque_insumo WHERE insumo_id = ?", (insumo_id,))
        conn.execute("DELETE FROM lote_insumo WHERE insumo_id = ?", (insumo_id,))
        conn.execute("DELETE FROM insumo WHERE id = ?", (insumo_id,))


def atualizar_estoque_loja(insumo_id, loja, campos):
    """Edição direta (correção manual/contagem) da quantidade e/ou do
    mínimo de UM insumo em UMA loja — diferente de distribuir_entrada_insumo,
    que soma uma entrada nova em vez de sobrescrever."""
    if not campos:
        return
    campos = dict(campos)
    campos["atualizado_em"] = datetime.now().isoformat()
    colunas = ", ".join(f"{campo} = ?" for campo in campos)
    valores = list(campos.values()) + [insumo_id, loja]
    with conexao() as conn:
        conn.execute(
            f"UPDATE estoque_insumo SET {colunas} WHERE insumo_id = ? AND loja = ?",
            valores,
        )


def distribuir_entrada_insumo(insumo_id, distribuicao, validade=None):
    """distribuicao: {loja: quantidade_recebida}. Soma ao estoque atual de
    cada loja informada — usado quando uma compra única (ex: 100
    refrigerantes) chega e é dividida entre lojas.

    Se `validade` for informada, também registra um lote (por loja que
    recebeu quantidade) com essa data — mesma remessa, mesma validade pra
    todo mundo que recebeu dela."""
    agora = datetime.now().isoformat()
    with conexao() as conn:
        for loja, quantidade in distribuicao.items():
            if not quantidade:
                continue
            conn.execute(
                """
                UPDATE estoque_insumo
                SET quantidade_atual = quantidade_atual + ?, atualizado_em = ?
                WHERE insumo_id = ? AND loja = ?
                """,
                (quantidade, agora, insumo_id, loja),
            )
            if validade:
                conn.execute(
                    """
                    INSERT INTO lote_insumo (insumo_id, loja, quantidade, validade, criado_em)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (insumo_id, loja, quantidade, validade, agora),
                )


def buscar_insumo_por_nome(nome):
    with conexao() as conn:
        linha = conn.execute("SELECT * FROM insumo WHERE nome = ?", (nome,)).fetchone()
        return dict(linha) if linha else None


def listar_lotes_vencendo(dias=7):
    """Lotes não resolvidos com validade nos próximos `dias` dias (inclui os
    já vencidos — validade no passado também entra). Ordenado do mais
    urgente pro menos, pra virar lista de aviso direto."""
    limite = (datetime.now().date() + timedelta(days=dias)).isoformat()
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT l.id, l.insumo_id, l.loja, l.quantidade, l.validade, l.criado_em,
                   i.nome, i.categoria, i.unidade_medida
            FROM lote_insumo l
            JOIN insumo i ON i.id = l.insumo_id
            WHERE l.resolvido_em IS NULL
              AND l.validade IS NOT NULL
              AND l.validade <= ?
            ORDER BY l.validade ASC
            """,
            (limite,),
        ).fetchall()
        return [dict(linha) for linha in linhas]


def marcar_lote_resolvido(lote_id):
    with conexao() as conn:
        conn.execute(
            "UPDATE lote_insumo SET resolvido_em = ? WHERE id = ?",
            (datetime.now().isoformat(), lote_id),
        )


def criar_item_cardapio(nome, categoria):
    with conexao() as conn:
        conn.execute(
            "INSERT INTO item_cardapio (nome, categoria) VALUES (?, ?) ON CONFLICT(nome) DO UPDATE SET categoria = excluded.categoria",
            (nome, categoria),
        )
        return conn.execute("SELECT id FROM item_cardapio WHERE nome = ?", (nome,)).fetchone()["id"]


def listar_itens_cardapio():
    with conexao() as conn:
        linhas = conn.execute("SELECT * FROM item_cardapio ORDER BY categoria, nome").fetchall()
        return [dict(linha) for linha in linhas]


def excluir_item_cardapio(item_id):
    with conexao() as conn:
        conn.execute("DELETE FROM ficha_tecnica WHERE item_id = ?", (item_id,))
        conn.execute("DELETE FROM item_cardapio WHERE id = ?", (item_id,))


def definir_ficha_tecnica(item_id, links):
    """Substitui a lista inteira de insumos do item por `links`
    (`[{"insumoId": int, "quantidade": float|None}, ...]`) — mais simples
    que fazer diff, e a tela sempre manda a lista completa mesmo."""
    with conexao() as conn:
        conn.execute("DELETE FROM ficha_tecnica WHERE item_id = ?", (item_id,))
        for link in links:
            conn.execute(
                "INSERT INTO ficha_tecnica (item_id, insumo_id, quantidade) VALUES (?, ?, ?)",
                (item_id, link["insumoId"], link.get("quantidade")),
            )


def buscar_ficha_tecnica_completa():
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT f.item_id, f.insumo_id, f.quantidade,
                   i.nome AS insumo_nome, i.unidade_medida
            FROM ficha_tecnica f
            JOIN insumo i ON i.id = f.insumo_id
            """
        ).fetchall()
        return [dict(linha) for linha in linhas]


def consumo_medio_insumo(inicio_iso, fim_iso, unidade=None):
    """Consumo médio DIÁRIO de cada insumo no período, por loja: soma
    (quantidade vendida do prato × quantidade da receita) de venda_item
    cruzado com ficha_tecnica, dividido pelos dias do período. Só entra
    insumo com quantidade definida na ficha técnica (receita sem gramatura
    ainda, NULL, não dá pra estimar) e prato já casado com item_cardapio
    (item_cardapio_id IS NOT NULL em venda_item — ver salvar_itens_vendidos_do_dia).
    Base pra sugerir quantidade ideal/estoque mínimo (seção 6.6)."""
    dias = (datetime.fromisoformat(fim_iso) - datetime.fromisoformat(inicio_iso)).days + 1
    condicoes = ["v.dia >= ?", "v.dia <= ?", "f.quantidade IS NOT NULL"]
    parametros = [inicio_iso, fim_iso]
    if unidade:
        condicoes.append("v.unidade = ?")
        parametros.append(unidade)

    with conexao() as conn:
        linhas = conn.execute(
            f"""
            SELECT v.unidade, f.insumo_id, i.nome AS insumo_nome, i.unidade_medida,
                   SUM(v.quantidade * f.quantidade) AS total_consumido
            FROM venda_item v
            JOIN ficha_tecnica f ON f.item_id = v.item_cardapio_id
            JOIN insumo i ON i.id = f.insumo_id
            WHERE {' AND '.join(condicoes)}
            GROUP BY v.unidade, f.insumo_id
            ORDER BY i.categoria, i.nome
            """,
            parametros,
        ).fetchall()

    return [
        {
            "unidade": linha["unidade"],
            "insumoId": linha["insumo_id"],
            "insumoNome": linha["insumo_nome"],
            "unidadeMedida": linha["unidade_medida"],
            "consumoMedioDiario": linha["total_consumido"] / dias,
        }
        for linha in linhas
    ]


# --- FORNECEDOR (diretório da rede, semente do módulo de Compras) ----------

def criar_fornecedor(campos):
    campos = dict(campos)
    campos["criado_em"] = datetime.now().isoformat()
    colunas = ", ".join(campos.keys())
    marcadores = ", ".join("?" for _ in campos)
    with conexao() as conn:
        cursor = conn.execute(
            f"INSERT INTO fornecedor ({colunas}) VALUES ({marcadores})",
            list(campos.values()),
        )
        return cursor.lastrowid


def listar_fornecedores():
    with conexao() as conn:
        linhas = conn.execute(
            "SELECT * FROM fornecedor ORDER BY ativo DESC, nome"
        ).fetchall()
        return [dict(linha) for linha in linhas]


def buscar_fornecedor_por_cnpj(cnpj):
    """Usado pra importação em lote (ex: importar_fornecedores_vmarket.py)
    ser idempotente por CNPJ, mesmo raciocínio de buscar_insumo_por_nome."""
    with conexao() as conn:
        linha = conn.execute(
            "SELECT * FROM fornecedor WHERE cnpj = ? AND cnpj != ''", (cnpj,)
        ).fetchone()
        return dict(linha) if linha else None


def atualizar_fornecedor(fornecedor_id, campos):
    if not campos:
        return
    colunas = ", ".join(f"{campo} = ?" for campo in campos)
    valores = list(campos.values()) + [fornecedor_id]
    with conexao() as conn:
        conn.execute(f"UPDATE fornecedor SET {colunas} WHERE id = ?", valores)


def definir_fornecedores_insumo(insumo_id, fornecedor_ids):
    """Substitui a lista inteira de fornecedores que cotam esse insumo
    (mesmo padrão de definir_ficha_tecnica — sempre manda a lista toda,
    substitui em vez de fazer diff)."""
    with conexao() as conn:
        conn.execute("DELETE FROM insumo_fornecedor WHERE insumo_id = ?", (insumo_id,))
        for fornecedor_id in fornecedor_ids:
            conn.execute(
                "INSERT INTO insumo_fornecedor (insumo_id, fornecedor_id) VALUES (?, ?)",
                (insumo_id, fornecedor_id),
            )


def mapa_insumo_fornecedores():
    """{insumo_id: [fornecedor_id, ...]} pra todo mundo de uma vez — evita
    N+1 ao formatar a lista inteira de insumos."""
    with conexao() as conn:
        linhas = conn.execute("SELECT insumo_id, fornecedor_id FROM insumo_fornecedor").fetchall()
    mapa = {}
    for linha in linhas:
        mapa.setdefault(linha["insumo_id"], []).append(linha["fornecedor_id"])
    return mapa


# --- COTAÇÃO (RFQ manual, fase 2 do módulo de Compras) ----------------------

def criar_cotacao(titulo):
    with conexao() as conn:
        cursor = conn.execute(
            "INSERT INTO cotacao (titulo, status, criado_em) VALUES (?, 'aberta', ?)",
            (titulo, datetime.now().isoformat()),
        )
        return cursor.lastrowid


def listar_cotacoes():
    """Cada cotação com contagem de insumos e fornecedores distintos já
    com preço lançado — dá pra ter uma cotação "vazia" (criada mas sem
    nenhum preço ainda), por isso os LEFT JOIN."""
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT c.id, c.titulo, c.status, c.criado_em,
                   COUNT(DISTINCT p.insumo_id) AS total_insumos,
                   COUNT(DISTINCT p.fornecedor_id) AS total_fornecedores
            FROM cotacao c
            LEFT JOIN cotacao_preco p ON p.cotacao_id = c.id
            GROUP BY c.id
            ORDER BY c.criado_em DESC
            """
        ).fetchall()
        return [dict(linha) for linha in linhas]


def buscar_cotacao(cotacao_id):
    with conexao() as conn:
        linha = conn.execute("SELECT * FROM cotacao WHERE id = ?", (cotacao_id,)).fetchone()
        return dict(linha) if linha else None


def atualizar_cotacao(cotacao_id, campos):
    if not campos:
        return
    colunas = ", ".join(f"{campo} = ?" for campo in campos)
    valores = list(campos.values()) + [cotacao_id]
    with conexao() as conn:
        conn.execute(f"UPDATE cotacao SET {colunas} WHERE id = ?", valores)


def excluir_cotacao(cotacao_id):
    with conexao() as conn:
        conn.execute("DELETE FROM cotacao_preco WHERE cotacao_id = ?", (cotacao_id,))
        conn.execute("DELETE FROM cotacao WHERE id = ?", (cotacao_id,))


def adicionar_preco_cotacao(cotacao_id, insumo_id, fornecedor_id, preco):
    """Upsert por (cotacao, insumo, fornecedor) — relançar o preço de quem
    já tinha cotado o mesmo insumo corrige o valor, não duplica a linha."""
    with conexao() as conn:
        conn.execute(
            """
            INSERT INTO cotacao_preco (cotacao_id, insumo_id, fornecedor_id, preco, criado_em)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (cotacao_id, insumo_id, fornecedor_id) DO UPDATE SET
                preco = excluded.preco,
                criado_em = excluded.criado_em
            """,
            (cotacao_id, insumo_id, fornecedor_id, preco, datetime.now().isoformat()),
        )


def listar_precos_cotacao(cotacao_id):
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT p.id, p.insumo_id, p.fornecedor_id, p.preco, p.selecionado,
                   i.nome AS insumo_nome, i.categoria AS insumo_categoria, i.unidade_medida,
                   f.nome AS fornecedor_nome
            FROM cotacao_preco p
            JOIN insumo i ON i.id = p.insumo_id
            JOIN fornecedor f ON f.id = p.fornecedor_id
            WHERE p.cotacao_id = ?
            ORDER BY i.nome, p.preco ASC
            """,
            (cotacao_id,),
        ).fetchall()
        return [dict(linha) for linha in linhas]


def excluir_preco_cotacao(preco_id):
    with conexao() as conn:
        conn.execute("DELETE FROM cotacao_preco WHERE id = ?", (preco_id,))


def selecionar_preco_cotacao(preco_id):
    """Marca esse preço como o vencedor do insumo — desmarca qualquer outro
    fornecedor que tenha cotado o mesmo insumo nessa cotação (só um
    vencedor por insumo, por cotação)."""
    with conexao() as conn:
        linha = conn.execute(
            "SELECT cotacao_id, insumo_id FROM cotacao_preco WHERE id = ?", (preco_id,)
        ).fetchone()
        if not linha:
            return
        conn.execute(
            "UPDATE cotacao_preco SET selecionado = 0 WHERE cotacao_id = ? AND insumo_id = ?",
            (linha["cotacao_id"], linha["insumo_id"]),
        )
        conn.execute("UPDATE cotacao_preco SET selecionado = 1 WHERE id = ?", (preco_id,))


DIAS_COBERTURA_IDEAL = 7  # mesma constante do front (script.js) — cotação é semanal


def _mapa_consumo_medio_loja(loja, dias_historico=30):
    fim = datetime.now().date()
    inicio = fim - timedelta(days=dias_historico - 1)
    linhas = consumo_medio_insumo(inicio.isoformat(), fim.isoformat(), loja)
    return {linha["insumoId"]: linha["consumoMedioDiario"] for linha in linhas}


def criar_contagem(loja, descricao, prazo_validade, categorias=None):
    """Abre uma contagem pra uma loja — gera um token opaco (o link que vai
    pro funcionário, sem precisar de login) e já grava uma linha por insumo
    (ativo, e dentro das categorias escolhidas, se filtrado) esperando
    preenchimento. `categorias` vazio/None inclui todos os insumos."""
    token = secrets.token_urlsafe(24)
    agora = datetime.now().isoformat()
    with conexao() as conn:
        if categorias:
            marcadores = ", ".join("?" for _ in categorias)
            linhas = conn.execute(
                f"SELECT id FROM insumo WHERE categoria IN ({marcadores})", categorias
            ).fetchall()
        else:
            linhas = conn.execute("SELECT id FROM insumo").fetchall()

        cursor = conn.execute(
            """
            INSERT INTO contagem (token, loja, descricao, prazo_validade, status, criado_em)
            VALUES (?, ?, ?, ?, 'aberta', ?)
            """,
            (token, loja, descricao, prazo_validade, agora),
        )
        contagem_id = cursor.lastrowid
        for linha in linhas:
            conn.execute(
                "INSERT INTO contagem_item (contagem_id, insumo_id) VALUES (?, ?)",
                (contagem_id, linha["id"]),
            )
        return {"id": contagem_id, "token": token}


def listar_contagens():
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT c.*,
                   COUNT(ci.insumo_id) AS total_itens,
                   SUM(CASE WHEN ci.quantidade_preenchida IS NOT NULL THEN 1 ELSE 0 END) AS itens_preenchidos
            FROM contagem c
            LEFT JOIN contagem_item ci ON ci.contagem_id = c.id
            GROUP BY c.id
            ORDER BY c.criado_em DESC
            """
        ).fetchall()
        return [dict(linha) for linha in linhas]


def buscar_contagem_por_token(token):
    with conexao() as conn:
        linha = conn.execute("SELECT * FROM contagem WHERE token = ?", (token,)).fetchone()
        return dict(linha) if linha else None


def buscar_contagem(contagem_id):
    with conexao() as conn:
        linha = conn.execute("SELECT * FROM contagem WHERE id = ?", (contagem_id,)).fetchone()
        return dict(linha) if linha else None


def listar_itens_contagem(contagem_id, loja):
    """Itens da contagem + quantidade ideal (consumo médio × 7 dias) pra
    servir de referência tanto na tela pública de preenchimento quanto na
    conferência — mesmo cálculo de DIAS_COBERTURA_IDEAL do front."""
    mapa_consumo = _mapa_consumo_medio_loja(loja)
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT ci.insumo_id, ci.quantidade_preenchida,
                   i.nome, i.categoria, i.unidade_medida, i.marca_homologada
            FROM contagem_item ci
            JOIN insumo i ON i.id = ci.insumo_id
            WHERE ci.contagem_id = ?
            ORDER BY i.categoria, i.nome
            """,
            (contagem_id,),
        ).fetchall()

    itens = []
    for linha in linhas:
        consumo_medio = mapa_consumo.get(linha["insumo_id"])
        quantidade_ideal = round(consumo_medio * DIAS_COBERTURA_IDEAL, 2) if consumo_medio is not None else None
        itens.append({
            "insumoId": linha["insumo_id"],
            "nome": linha["nome"],
            "categoria": linha["categoria"],
            "unidadeMedida": linha["unidade_medida"],
            "marcaHomologada": linha["marca_homologada"],
            "quantidadePreenchida": linha["quantidade_preenchida"],
            "quantidadeIdeal": quantidade_ideal,
        })
    return itens


def responder_contagem(token, valores):
    """Grava o preenchimento (uma vez só — ver validação de status/prazo na
    rota). `valores` = {insumo_id: quantidade}."""
    agora = datetime.now().isoformat()
    with conexao() as conn:
        for insumo_id, quantidade in valores.items():
            conn.execute(
                "UPDATE contagem_item SET quantidade_preenchida = ? WHERE contagem_id = (SELECT id FROM contagem WHERE token = ?) AND insumo_id = ?",
                (quantidade, token, insumo_id),
            )
        conn.execute(
            "UPDATE contagem SET status = 'respondida', respondida_em = ? WHERE token = ?",
            (agora, token),
        )


def aprovar_contagem(contagem_id):
    """Kethllyn confere e aprova — só agora o que foi preenchido vira
    quantidade_atual de verdade em estoque_insumo (itens não preenchidos
    ficam com o valor antigo, não zeram)."""
    contagem = buscar_contagem(contagem_id)
    if not contagem:
        return
    agora = datetime.now().isoformat()
    with conexao() as conn:
        itens = conn.execute(
            "SELECT insumo_id, quantidade_preenchida FROM contagem_item WHERE contagem_id = ? AND quantidade_preenchida IS NOT NULL",
            (contagem_id,),
        ).fetchall()
        for item in itens:
            conn.execute(
                "UPDATE estoque_insumo SET quantidade_atual = ?, atualizado_em = ? WHERE insumo_id = ? AND loja = ?",
                (item["quantidade_preenchida"], agora, item["insumo_id"], contagem["loja"]),
            )
        conn.execute(
            "UPDATE contagem SET status = 'aprovada', aprovada_em = ? WHERE id = ?",
            (agora, contagem_id),
        )
