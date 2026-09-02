"""
Cache local em SQLite do faturamento sincronizado da Cardápio Web.
Evita ter que buscar pedido por pedido a cada carregamento da página —
a sincronização roda separada (via sincronizar.py) e a página só lê daqui.
"""

import math
import os
import re
import secrets
import sqlite3
import unicodedata
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

        # Quais insumos entram no link de Requisição de cada loja — separado
        # de propósito de `estoque_insumo` (que continua tendo uma linha por
        # insumo × loja pra toda a rede, sem mudar nada do que já existe em
        # Estoque/quantidade ideal). Ex: "Pão de dog" não precisa aparecer no
        # link da Hamburgueria Artesanos pro funcionário contar. Presença de
        # linha = "essa loja usa esse insumo". Migração faz backfill de TODOS
        # os insumos pra TODAS as lojas na primeira vez (preserva o
        # comportamento atual — todo insumo aparecia em toda loja), e ela
        # ajusta manualmente a partir daí pela tela de "Insumos da loja".
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS insumo_loja (
                insumo_id INTEGER NOT NULL,
                loja TEXT NOT NULL,
                PRIMARY KEY (insumo_id, loja)
            )
            """
        )
        if conn.execute("SELECT COUNT(*) AS n FROM insumo_loja").fetchone()["n"] == 0:
            lojas_existentes = [l["loja"] for l in conn.execute("SELECT DISTINCT loja FROM estoque_insumo").fetchall()]
            insumo_ids = [i["id"] for i in conn.execute("SELECT id FROM insumo").fetchall()]
            for insumo_id in insumo_ids:
                for loja in lojas_existentes:
                    conn.execute(
                        "INSERT OR IGNORE INTO insumo_loja (insumo_id, loja) VALUES (?, ?)",
                        (insumo_id, loja),
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
                loja TEXT NOT NULL,
                quantidade REAL,
                PRIMARY KEY (item_id, insumo_id, loja)
            )
            """
        )
        colunas_ficha_tecnica = {c["name"] for c in conn.execute("PRAGMA table_info(ficha_tecnica)").fetchall()}
        if "loja" not in colunas_ficha_tecnica:
            # Ficha técnica virou uma receita por loja (antes era uma só pra
            # rede toda, ver seção 6.5) — SQLite não deixa mudar PRIMARY KEY
            # com ALTER TABLE, então recria a tabela e duplica cada receita
            # existente pras lojas que já existem em estoque_insumo (mesmo
            # critério do backfill de insumo_loja acima), pra todo mundo
            # começar idêntico até ela divergir alguma pela tela.
            conn.execute("ALTER TABLE ficha_tecnica RENAME TO ficha_tecnica_old")
            conn.execute(
                """
                CREATE TABLE ficha_tecnica (
                    item_id INTEGER NOT NULL,
                    insumo_id INTEGER NOT NULL,
                    loja TEXT NOT NULL,
                    quantidade REAL,
                    PRIMARY KEY (item_id, insumo_id, loja)
                )
                """
            )
            lojas_existentes = [l["loja"] for l in conn.execute("SELECT DISTINCT loja FROM estoque_insumo").fetchall()]
            linhas_antigas = conn.execute("SELECT item_id, insumo_id, quantidade FROM ficha_tecnica_old").fetchall()
            for linha in linhas_antigas:
                for loja in lojas_existentes:
                    conn.execute(
                        "INSERT INTO ficha_tecnica (item_id, insumo_id, loja, quantidade) VALUES (?, ?, ?, ?)",
                        (linha["item_id"], linha["insumo_id"], loja, linha["quantidade"]),
                    )
            conn.execute("DROP TABLE ficha_tecnica_old")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS item_cardapio_custo (
                item_id INTEGER NOT NULL,
                loja TEXT NOT NULL,
                custo REAL NOT NULL,
                atualizado_em TEXT NOT NULL,
                PRIMARY KEY (item_id, loja)
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
        colunas_cotacao = {c["name"] for c in conn.execute("PRAGMA table_info(cotacao)").fetchall()}
        if "requisicao_titulo" not in colunas_cotacao:
            conn.execute("ALTER TABLE cotacao ADD COLUMN requisicao_titulo TEXT")
        if "requisicao_prazo" not in colunas_cotacao:
            conn.execute("ALTER TABLE cotacao ADD COLUMN requisicao_prazo TEXT")

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
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS cotacao_item (
                cotacao_id INTEGER NOT NULL,
                insumo_id INTEGER NOT NULL,
                quantidade_total REAL NOT NULL,
                PRIMARY KEY (cotacao_id, insumo_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS cotacao_item_loja (
                cotacao_id INTEGER NOT NULL,
                insumo_id INTEGER NOT NULL,
                loja TEXT NOT NULL,
                quantidade REAL NOT NULL,
                PRIMARY KEY (cotacao_id, insumo_id, loja)
            )
            """
        )

        # Convite de cotação por link (sem login) — pro fornecedor preencher
        # o próprio preço, mesmo padrão de token da Contagem. Só é mandado
        # pra insumo sem nenhum fornecedor vinculado ainda (ver
        # `mapa_insumo_fornecedores`): quem já tem fornecedor homologado
        # continua sendo cotado na mão. O sistema não filtra quem cota o
        # quê — o link vai pra TODOS os fornecedores ativos, e cada um
        # decide por insumo se vende ou não (decisão do Guilherme,
        # 2026-08-27: mais simples que tentar adivinhar por vínculo).
        # `cotacao_convite_item` fixa a lista de insumos no momento do
        # convite, pra não mudar debaixo do fornecedor se alguém vincular
        # um fornecedor novo depois de já ter mandado o link.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS cotacao_convite (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cotacao_id INTEGER NOT NULL,
                fornecedor_id INTEGER NOT NULL,
                token TEXT NOT NULL UNIQUE,
                prazo_validade TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'aberta',
                criado_em TEXT NOT NULL,
                respondida_em TEXT,
                UNIQUE (cotacao_id, fornecedor_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS cotacao_convite_item (
                convite_id INTEGER NOT NULL,
                insumo_id INTEGER NOT NULL,
                PRIMARY KEY (convite_id, insumo_id)
            )
            """
        )

        # Pedido de compra — nasce da cotação depois que ela é fechada com um
        # vencedor por insumo (etapa manual, não automática — resposta da
        # Kethllyn no roteiro, q23). Um pedido é por (fornecedor, loja): o
        # mesmo insumo pode fechar com fornecedores diferentes na mesma
        # cotação (q22), e o pedido mínimo do fornecedor conta por loja, não
        # somado na rede (q29) — por isso não agrupa por cotação inteira.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS pedido_compra (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cotacao_id INTEGER NOT NULL,
                fornecedor_id INTEGER NOT NULL,
                loja TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'enviado',
                criado_em TEXT NOT NULL,
                atualizado_em TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS pedido_compra_item (
                pedido_id INTEGER NOT NULL,
                insumo_id INTEGER NOT NULL,
                quantidade REAL NOT NULL,
                preco_unitario REAL NOT NULL,
                PRIMARY KEY (pedido_id, insumo_id)
            )
            """
        )

        # Tela "Recebimentos" — quem realmente recebeu, quando, e se o valor
        # da Nota Fiscal bateu com o calculado. Colunas soltas em vez de
        # tabela própria, mesmo raciocínio de outras migrações neste arquivo:
        # é 1 recebimento por pedido, não um histórico de vários.
        colunas_pedido = {c["name"] for c in conn.execute("PRAGMA table_info(pedido_compra)").fetchall()}
        if "recebido_por" not in colunas_pedido:
            conn.execute("ALTER TABLE pedido_compra ADD COLUMN recebido_por TEXT")
        if "recebido_em" not in colunas_pedido:
            conn.execute("ALTER TABLE pedido_compra ADD COLUMN recebido_em TEXT")
        if "valor_nf" not in colunas_pedido:
            conn.execute("ALTER TABLE pedido_compra ADD COLUMN valor_nf REAL")
        if "divergencia_nf" not in colunas_pedido:
            conn.execute("ALTER TABLE pedido_compra ADD COLUMN divergencia_nf INTEGER NOT NULL DEFAULT 0")

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
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ajuste_quantidade_ideal (
                loja TEXT NOT NULL,
                insumo_id INTEGER NOT NULL,
                valor_ajustado REAL NOT NULL,
                atualizado_em TEXT NOT NULL,
                PRIMARY KEY (loja, insumo_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS data_especial (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data_inicio TEXT NOT NULL,
                data_fim TEXT NOT NULL,
                descricao TEXT NOT NULL,
                multiplicador REAL NOT NULL,
                loja TEXT,
                criado_em TEXT NOT NULL
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


def duplicar_precos_cardapio(loja_origem, lojas_destino):
    """Migração pontual: copia o catálogo inteiro de `loja_origem` (preço
    de cada canal, categoria, ordem) pra cada loja em `lojas_destino`, com
    id novo por cópia — não mexe na origem. Não duplica `foto_arquivo`
    aqui (é arquivo físico, fica por conta de quem chama copiar o arquivo
    e já gravar o nome novo); devolve, por loja de destino, a lista de
    `{idNovo, fotoOriginal}` pra isso. Usado pra separar "Tradiças" (uma
    loja só) em "Tradiça ZN"/"Tradiça Simus" (seção 6.1) — a partir daí,
    viram catálogos independentes, cada um editável na tela sem afetar o
    outro."""
    with conexao() as conn:
        origem = conn.execute(
            "SELECT categoria, produto, ifood, food99, beefood, cardapio_web, ordem, foto_arquivo FROM preco_cardapio WHERE loja = ?",
            (loja_origem,),
        ).fetchall()
        resultado = {}
        for loja in lojas_destino:
            copias = []
            for linha in origem:
                cursor = conn.execute(
                    """
                    INSERT INTO preco_cardapio (loja, categoria, produto, ifood, food99, beefood, cardapio_web, ordem)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (loja, linha["categoria"], linha["produto"], linha["ifood"], linha["food99"], linha["beefood"], linha["cardapio_web"], linha["ordem"]),
                )
                copias.append({"idNovo": cursor.lastrowid, "fotoOriginal": linha["foto_arquivo"]})
            resultado[loja] = copias
        return resultado


def remover_precos_cardapio_das_lojas(lojas, somente_sem_canais=False):
    """Limpeza pontual: a sincronização com a API da Cardápio Web (feature
    revertida em 2026-09-02) rodou uma vez em produção. Com
    `somente_sem_canais=True`, só apaga produto com ifood/food99/beefood
    todos em branco — critério seguro porque essa sincronização nunca
    preenchia esses 3 canais (só cardapio_web), então uma linha assim só
    pode ter vindo dela, seja um produto que nunca existia (duplicidade de
    nome dentro de uma loja, ex. "BIG ART" da API vs "Big Art" da
    planilha) ou uma loja inteira criada por engano ("Tradiça ZN"/
    "Tradiça Simus" — essa tela sempre tratou como uma loja só,
    "Tradiças", já que as duas compartilham a mesma tabela de preços,
    seção 6.1). Devolve os nomes de foto (se tiverem) pra quem chamar
    também apagar o arquivo."""
    condicao_canais = " AND ifood IS NULL AND food99 IS NULL AND beefood IS NULL" if somente_sem_canais else ""
    with conexao() as conn:
        marcadores = ", ".join("?" * len(lojas))
        fotos = [
            l["foto_arquivo"]
            for l in conn.execute(
                f"SELECT foto_arquivo FROM preco_cardapio WHERE loja IN ({marcadores}) AND foto_arquivo IS NOT NULL{condicao_canais}",
                lojas,
            ).fetchall()
        ]
        cursor = conn.execute(f"DELETE FROM preco_cardapio WHERE loja IN ({marcadores}){condicao_canais}", lojas)
        return {"removidos": cursor.rowcount, "fotos": fotos}


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


def _casar_item_cardapio(nome_vendido, catalogo_normalizado):
    """catalogo_normalizado: {nome_normalizado: id}. Tenta o nome vendido
    inteiro primeiro (tira acento/maiúscula/pontuação, mesmo critério de
    _normalizar_nome_insumo — nomes vêm da Cardápio Web, cadastro na Ficha
    Técnica é manual, não bate exatamente). Se não bater e o nome vendido
    tiver um "- subtítulo" de marketing colado (comum na Cardápio Web, ex:
    "Tasty Bacon - releitura do Big Tasty"), tenta de novo só com a parte
    antes do traço."""
    candidato = catalogo_normalizado.get(_normalizar_nome_insumo(nome_vendido))
    if candidato:
        return candidato
    if " - " in nome_vendido:
        prefixo = nome_vendido.split(" - ", 1)[0]
        return catalogo_normalizado.get(_normalizar_nome_insumo(prefixo))
    return None


def salvar_itens_vendidos_do_dia(unidade, dia_iso, pedidos_detalhados):
    """Grava quais itens de cardápio foram vendidos em cada pedido do dia,
    casando pelo nome com item_cardapio (ver _casar_item_cardapio — nomes vêm
    da Cardápio Web, cadastro na Ficha Técnica é manual, então não é garantido
    bater exatamente). Mesmo padrão de salvar_pedidos_do_dia: resincroniza o
    dia inteiro. Sem match, item_cardapio_id fica NULL mas a linha é salva
    do mesmo jeito, com o nome bruto — vira histórico utilizável assim que
    o item for cadastrado na Ficha Técnica."""
    with conexao() as conn:
        catalogo = {
            _normalizar_nome_insumo(linha["nome"]): linha["id"]
            for linha in conn.execute("SELECT id, nome FROM item_cardapio").fetchall()
        }
        conn.execute(
            "DELETE FROM venda_item WHERE unidade = ? AND dia = ?",
            (unidade, dia_iso),
        )
        for pedido in pedidos_detalhados:
            for indice, item in enumerate(pedido.get("itens", [])):
                item_cardapio_id = _casar_item_cardapio(item["nome"], catalogo)
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
                        item_cardapio_id,
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
            conn.execute(
                "INSERT OR IGNORE INTO insumo_loja (insumo_id, loja) VALUES (?, ?)",
                (insumo_id, loja),
            )
        return insumo_id


def _normalizar_nome_insumo(nome):
    """Mesmo critério do `_normalizarNomeInsumo` do front (script.js): tira
    acento/maiúscula/pontuação, pra comparar nome colado com nome já
    cadastrado sem exigir bater caractere por caractere."""
    nome = unicodedata.normalize("NFD", nome)
    nome = "".join(c for c in nome if unicodedata.category(c) != "Mn")
    nome = nome.lower()
    return re.sub(r"[^a-z0-9]+", " ", nome).strip()


def criar_insumos_em_lote(nomes, categoria, unidade_medida, lojas):
    """Cadastra vários insumos novos de uma vez (mesma regra de
    `criar_insumo` por trás, mesma categoria/unidade pro lote inteiro) —
    pra quando uma loja nova traz um catálogo que ainda não existe no
    AdmFood (ex: itens da VMarket). Pula nome que já bate, normalizado,
    com um insumo já cadastrado (no banco ou repetido dentro do próprio
    lote colado), pra não duplicar."""
    with conexao() as conn:
        existentes = {
            _normalizar_nome_insumo(l["nome"]) for l in conn.execute("SELECT nome FROM insumo").fetchall()
        }
    criados = []
    duplicados = []
    vistos_no_lote = set()
    for nome in nomes:
        nome = nome.strip()
        if not nome:
            continue
        chave = _normalizar_nome_insumo(nome)
        if chave in existentes or chave in vistos_no_lote:
            duplicados.append(nome)
            continue
        vistos_no_lote.add(chave)
        insumo_id = criar_insumo(nome, categoria, unidade_medida, lojas)
        criados.append({"id": insumo_id, "nome": nome})
    return {"criados": criados, "duplicados": duplicados}


def listar_insumos():
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT i.id AS insumo_id, i.nome, i.categoria, i.unidade_medida, i.favorito,
                   i.marca_homologada,
                   e.loja, e.quantidade_atual, e.estoque_minimo, e.atualizado_em,
                   EXISTS(SELECT 1 FROM insumo_loja il WHERE il.insumo_id = i.id AND il.loja = e.loja) AS aplica
            FROM insumo i
            JOIN estoque_insumo e ON e.insumo_id = i.id
            ORDER BY i.favorito DESC, i.categoria, i.nome, e.loja
            """
        ).fetchall()
        return [dict(linha) for linha in linhas]


def listar_insumos_por_loja(loja):
    """Todo insumo do catálogo com uma marcação se essa loja específica usa
    ele ou não — pra tela "Insumos da loja" (Estoque), que decide quais
    insumos entram no link de Requisição de cada loja."""
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT i.id, i.nome, i.categoria,
                   EXISTS(SELECT 1 FROM insumo_loja il WHERE il.insumo_id = i.id AND il.loja = ?) AS aplica
            FROM insumo i
            ORDER BY i.categoria, i.nome
            """,
            (loja,),
        ).fetchall()
        return [{"id": l["id"], "nome": l["nome"], "categoria": l["categoria"], "aplica": bool(l["aplica"])} for l in linhas]


def salvar_insumos_da_loja(loja, insumo_ids):
    """Substitui por completo quais insumos essa loja usa — remove quem não
    estiver na lista nova, adiciona quem estiver (mesmo espírito do
    "Ajustar em lote": ela decide tudo de uma vez em vez de item por
    item)."""
    with conexao() as conn:
        conn.execute("DELETE FROM insumo_loja WHERE loja = ?", (loja,))
        for insumo_id in insumo_ids:
            conn.execute("INSERT INTO insumo_loja (insumo_id, loja) VALUES (?, ?)", (insumo_id, loja))


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
        conn.execute("DELETE FROM insumo_loja WHERE insumo_id = ?", (insumo_id,))
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
        conn.execute("DELETE FROM item_cardapio_custo WHERE item_id = ?", (item_id,))
        conn.execute("DELETE FROM item_cardapio WHERE id = ?", (item_id,))


def definir_ficha_tecnica(item_id, loja, links):
    """Substitui a lista inteira de insumos do item **naquela loja** por
    `links` (`[{"insumoId": int, "quantidade": float|None}, ...]`) — mais
    simples que fazer diff, e a tela sempre manda a lista completa mesmo.
    Não mexe na receita das outras lojas (ficha técnica é por loja desde
    2026-09-01, ver seção 6.5)."""
    with conexao() as conn:
        conn.execute("DELETE FROM ficha_tecnica WHERE item_id = ? AND loja = ?", (item_id, loja))
        for link in links:
            conn.execute(
                "INSERT INTO ficha_tecnica (item_id, insumo_id, loja, quantidade) VALUES (?, ?, ?, ?)",
                (item_id, link["insumoId"], loja, link.get("quantidade")),
            )


def buscar_ficha_tecnica_item(item_id, loja):
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT f.insumo_id, f.quantidade, i.nome AS insumo_nome, i.unidade_medida
            FROM ficha_tecnica f
            JOIN insumo i ON i.id = f.insumo_id
            WHERE f.item_id = ? AND f.loja = ?
            ORDER BY i.nome
            """,
            (item_id, loja),
        ).fetchall()
        return [dict(linha) for linha in linhas]


def salvar_custo_item_cardapio(item_id, loja, custo):
    with conexao() as conn:
        conn.execute(
            """
            INSERT INTO item_cardapio_custo (item_id, loja, custo, atualizado_em)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(item_id, loja) DO UPDATE SET
                custo = excluded.custo,
                atualizado_em = excluded.atualizado_em
            """,
            (item_id, loja, custo, datetime.now().isoformat()),
        )


def mapa_custos_item_cardapio():
    with conexao() as conn:
        linhas = conn.execute("SELECT item_id, loja, custo FROM item_cardapio_custo").fetchall()
        return {(l["item_id"], l["loja"]): l["custo"] for l in linhas}


def listar_produtos_por_loja(loja):
    """Lista de produtos da loja pra tela de Ficha Técnica: parte de
    `preco_cardapio` (que já sabe quem vende o quê e o valor de venda do
    balcão), casa cada nome com um `item_cardapio` já cadastrado via
    `_casar_item_cardapio` (mesmo critério usado pra bater venda com
    receita, seção 6.6) e junta o custo digitado à mão quando existir.
    Produto sem match nenhum volta com itemCardapioId None — a tela
    oferece cadastrar um item novo com esse nome."""
    with conexao() as conn:
        produtos = conn.execute(
            "SELECT id, categoria, produto, cardapio_web, foto_arquivo FROM preco_cardapio WHERE loja = ? ORDER BY ordem",
            (loja,),
        ).fetchall()
        catalogo = {
            _normalizar_nome_insumo(i["nome"]): i["id"]
            for i in conn.execute("SELECT id, nome FROM item_cardapio").fetchall()
        }
        tem_ficha = {
            r["item_id"]
            for r in conn.execute("SELECT DISTINCT item_id FROM ficha_tecnica WHERE loja = ?", (loja,)).fetchall()
        }
    custos = mapa_custos_item_cardapio()

    resultado = []
    for p in produtos:
        item_id = _casar_item_cardapio(p["produto"], catalogo)
        resultado.append({
            "itemCardapioId": item_id,
            "nome": p["produto"],
            "categoria": p["categoria"],
            "valorVenda": p["cardapio_web"],
            "custo": custos.get((item_id, loja)) if item_id else None,
            "temFichaTecnica": item_id in tem_ficha if item_id else False,
            "fotoArquivo": p["foto_arquivo"],
        })
    return resultado


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
            JOIN ficha_tecnica f ON f.item_id = v.item_cardapio_id AND f.loja = v.unidade
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


def listar_historico_compras():
    """Cotações já fechadas com o preço vencedor de cada insumo — registro
    de qual fornecedor/preço venceu em cada rodada, separado do rastreio de
    entrega dos Pedidos (ela pediu os dois como coisas diferentes: um é
    "o que foi decidido", o outro é "o que já chegou")."""
    with conexao() as conn:
        cotacoes = conn.execute(
            "SELECT id, titulo, criado_em FROM cotacao WHERE status = 'fechada' ORDER BY criado_em DESC"
        ).fetchall()
        historico = []
        for cotacao in cotacoes:
            vencedores = conn.execute(
                """
                SELECT cp.preco, i.nome AS insumo_nome, i.categoria, i.unidade_medida,
                       f.nome AS fornecedor_nome
                FROM cotacao_preco cp
                JOIN insumo i ON i.id = cp.insumo_id
                JOIN fornecedor f ON f.id = cp.fornecedor_id
                WHERE cp.cotacao_id = ? AND cp.selecionado = 1
                ORDER BY i.nome
                """,
                (cotacao["id"],),
            ).fetchall()
            historico.append({
                "id": cotacao["id"],
                "titulo": cotacao["titulo"],
                "criadoEm": cotacao["criado_em"],
                "itens": [
                    {
                        "nome": vencedor["insumo_nome"],
                        "categoria": vencedor["categoria"],
                        "unidadeMedida": vencedor["unidade_medida"],
                        "fornecedorNome": vencedor["fornecedor_nome"],
                        "preco": vencedor["preco"],
                    }
                    for vencedor in vencedores
                ],
            })
        return historico


# --- COTAÇÃO (RFQ manual, fase 2 do módulo de Compras) ----------------------

def criar_cotacao(titulo, requisicao_titulo=None, requisicao_prazo=None):
    """`requisicao_titulo`/`requisicao_prazo` só vêm preenchidos quando a
    cotação nasce de `gerar_cotacao_do_deficit` — é o que permite detectar
    "essa requisição já gerou uma cotação" sem depender do `titulo`
    (que pode ser editado depois e não é um identificador estável)."""
    with conexao() as conn:
        cursor = conn.execute(
            "INSERT INTO cotacao (titulo, status, criado_em, requisicao_titulo, requisicao_prazo) VALUES (?, 'aberta', ?, ?, ?)",
            (titulo, datetime.now().isoformat(), requisicao_titulo, requisicao_prazo),
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


def _insumos_sem_fornecedor_vinculado(cotacao_id):
    """Insumos dessa cotação que ainda não têm nenhum fornecedor vinculado
    — só esses entram no convite aberto pra todo mundo cotar."""
    mapa = mapa_insumo_fornecedores()
    with conexao() as conn:
        linhas = conn.execute(
            "SELECT insumo_id FROM cotacao_item WHERE cotacao_id = ?", (cotacao_id,)
        ).fetchall()
    return [linha["insumo_id"] for linha in linhas if not mapa.get(linha["insumo_id"])]


def criar_convites_cotacao(cotacao_id, prazo_validade):
    """Manda o link de preenchimento pra TODO fornecedor ativo (não filtra
    por vínculo — decisão do Guilherme em 2026-08-27: o próprio fornecedor
    decide por insumo se vende ou não dentro do link, em vez do sistema
    tentar adivinhar). Só considera insumo sem fornecedor vinculado ainda;
    quem já tem, continua sendo cotado na mão. Fornecedor que já tem
    convite pra essa cotação não recebe outro (evita resetar o token de
    quem já está respondendo ou já respondeu)."""
    insumo_ids = _insumos_sem_fornecedor_vinculado(cotacao_id)
    if not insumo_ids:
        return {"convites": [], "insumosSemFornecedor": 0}

    fornecedores = [f for f in listar_fornecedores() if f["ativo"]]
    agora = datetime.now().isoformat()
    convites = []
    with conexao() as conn:
        existentes = {
            linha["fornecedor_id"]
            for linha in conn.execute(
                "SELECT fornecedor_id FROM cotacao_convite WHERE cotacao_id = ?", (cotacao_id,)
            ).fetchall()
        }
        for fornecedor in fornecedores:
            if fornecedor["id"] in existentes:
                continue
            token = secrets.token_urlsafe(24)
            cursor = conn.execute(
                """
                INSERT INTO cotacao_convite (cotacao_id, fornecedor_id, token, prazo_validade, status, criado_em)
                VALUES (?, ?, ?, ?, 'aberta', ?)
                """,
                (cotacao_id, fornecedor["id"], token, prazo_validade, agora),
            )
            convite_id = cursor.lastrowid
            for insumo_id in insumo_ids:
                conn.execute(
                    "INSERT INTO cotacao_convite_item (convite_id, insumo_id) VALUES (?, ?)",
                    (convite_id, insumo_id),
                )
            convites.append({"id": convite_id, "fornecedorId": fornecedor["id"], "fornecedorNome": fornecedor["nome"], "token": token})

    return {"convites": convites, "insumosSemFornecedor": len(insumo_ids)}


def listar_convites_cotacao(cotacao_id):
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT cc.id, cc.fornecedor_id, cc.token, cc.prazo_validade, cc.status, cc.criado_em, cc.respondida_em,
                   f.nome AS fornecedor_nome
            FROM cotacao_convite cc
            JOIN fornecedor f ON f.id = cc.fornecedor_id
            WHERE cc.cotacao_id = ?
            ORDER BY f.nome
            """,
            (cotacao_id,),
        ).fetchall()
        return [dict(linha) for linha in linhas]


def buscar_convite_por_token(token):
    with conexao() as conn:
        linha = conn.execute(
            """
            SELECT cc.id, cc.cotacao_id, cc.fornecedor_id, cc.token, cc.prazo_validade, cc.status, cc.criado_em, cc.respondida_em,
                   f.nome AS fornecedor_nome, c.titulo AS cotacao_titulo
            FROM cotacao_convite cc
            JOIN fornecedor f ON f.id = cc.fornecedor_id
            JOIN cotacao c ON c.id = cc.cotacao_id
            WHERE cc.token = ?
            """,
            (token,),
        ).fetchone()
        if not linha:
            return None
        convite = dict(linha)
        itens = conn.execute(
            """
            SELECT cci.insumo_id, i.nome, i.categoria, i.unidade_medida, i.marca_homologada,
                   ci.quantidade_total, cp.preco AS preco_preenchido
            FROM cotacao_convite_item cci
            JOIN insumo i ON i.id = cci.insumo_id
            LEFT JOIN cotacao_item ci ON ci.cotacao_id = ? AND ci.insumo_id = cci.insumo_id
            LEFT JOIN cotacao_preco cp ON cp.cotacao_id = ? AND cp.insumo_id = cci.insumo_id AND cp.fornecedor_id = ?
            WHERE cci.convite_id = ?
            ORDER BY i.nome
            """,
            (convite["cotacao_id"], convite["cotacao_id"], convite["fornecedor_id"], convite["id"]),
        ).fetchall()
        convite["itens"] = [dict(item) for item in itens]
        return convite


def responder_convite_cotacao(token, precos):
    """`precos` = {insumo_id: preco}, só com quem o fornecedor realmente
    preencheu — quem ele marcou como "não vendo" nem chega aqui. Uma vez
    respondido, o convite fica travado (pergunta 18 do roteiro): não dá
    pra chamar de novo pelo mesmo token."""
    convite = buscar_convite_por_token(token)
    if not convite or convite["status"] != "aberta":
        return False
    for insumo_id, preco in precos.items():
        adicionar_preco_cotacao(convite["cotacao_id"], int(insumo_id), convite["fornecedor_id"], preco)
    with conexao() as conn:
        conn.execute(
            "UPDATE cotacao_convite SET status = 'respondida', respondida_em = ? WHERE token = ?",
            (datetime.now().isoformat(), token),
        )
    return True


def reabrir_convite_cotacao(convite_id):
    """Volta o convite de um fornecedor pra 'aberta', destravando o link
    dele de novo — mesmo espírito do "Reabrir contagem": fornecedor
    preencheu preço errado sem querer e, antes disso, não tinha conserto
    (o link trava sozinho depois de respondido, pergunta 18 do roteiro).
    Não apaga os preços já lançados por ele — se enviar de novo, cada
    preço é sobrescrito individualmente (`adicionar_preco_cotacao` já faz
    upsert por insumo), não tudo de uma vez."""
    with conexao() as conn:
        conn.execute(
            "UPDATE cotacao_convite SET status = 'aberta', respondida_em = NULL WHERE id = ?",
            (convite_id,),
        )


ESTAGIOS_PEDIDO = ['enviado', 'confirmado', 'a_caminho', 'recebido']


def gerar_pedidos_de_cotacao(cotacao_id):
    """Fecha a cotação em pedido(s) de compra de verdade — um por
    (fornecedor, loja), porque o mesmo insumo pode ter vencedores diferentes
    (q22) e o pedido mínimo do fornecedor é por loja, não somado (q29). Só
    considera insumo com preço marcado como vencedor (`selecionado`); quem
    ainda não tem vencedor escolhido fica de fora (retornado à parte pra
    avisar, não é erro — ela pode fechar aos poucos). Insumo que já virou
    pedido numa chamada anterior (mesma cotação) não gera pedido de novo —
    dá pra clicar "Gerar pedidos" mais de uma vez conforme for marcando
    vencedor, sem duplicar pedido de quem já foi. Precisa da quebra por
    loja de `cotacao_item_loja`, então uma cotação lançada na mão (sem
    passar pela Requisição) não tem o que gerar aqui."""
    precos = listar_precos_cotacao(cotacao_id)
    vencedores = {p['insumo_id']: p for p in precos if p['selecionado']}

    with conexao() as conn:
        linhas_loja = conn.execute(
            "SELECT insumo_id, loja, quantidade FROM cotacao_item_loja WHERE cotacao_id = ?",
            (cotacao_id,),
        ).fetchall()
        insumos_ja_pedidos = {
            linha["insumo_id"]
            for linha in conn.execute(
                """
                SELECT DISTINCT pi.insumo_id
                FROM pedido_compra_item pi
                JOIN pedido_compra pc ON pc.id = pi.pedido_id
                WHERE pc.cotacao_id = ?
                """,
                (cotacao_id,),
            ).fetchall()
        }

    grupos = {}
    insumos_com_quantidade = set()
    for linha in linhas_loja:
        insumos_com_quantidade.add(linha['insumo_id'])
        if linha['insumo_id'] in insumos_ja_pedidos:
            continue
        vencedor = vencedores.get(linha['insumo_id'])
        if not vencedor:
            continue
        chave = (vencedor['fornecedor_id'], linha['loja'])
        grupos.setdefault(chave, []).append({
            "insumoId": linha['insumo_id'],
            "quantidade": linha['quantidade'],
            "precoUnitario": vencedor['preco'],
        })

    insumos_sem_vencedor = len(insumos_com_quantidade - set(vencedores.keys()))

    if not grupos:
        return {"pedidosCriados": [], "insumosSemVencedor": insumos_sem_vencedor}

    agora = datetime.now().isoformat()
    pedidos_criados = []
    with conexao() as conn:
        for (fornecedor_id, loja), itens in grupos.items():
            cursor = conn.execute(
                "INSERT INTO pedido_compra (cotacao_id, fornecedor_id, loja, status, criado_em) VALUES (?, ?, ?, 'enviado', ?)",
                (cotacao_id, fornecedor_id, loja, agora),
            )
            pedido_id = cursor.lastrowid
            for item in itens:
                conn.execute(
                    "INSERT INTO pedido_compra_item (pedido_id, insumo_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)",
                    (pedido_id, item['insumoId'], item['quantidade'], item['precoUnitario']),
                )
            pedidos_criados.append(pedido_id)

    return {"pedidosCriados": pedidos_criados, "insumosSemVencedor": insumos_sem_vencedor}


def listar_pedidos():
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT pc.id, pc.cotacao_id, pc.fornecedor_id, pc.loja, pc.status, pc.criado_em, pc.atualizado_em,
                   f.nome AS fornecedor_nome, f.pedido_minimo,
                   c.titulo AS cotacao_titulo,
                   COUNT(pi.insumo_id) AS total_itens,
                   COALESCE(SUM(pi.quantidade * pi.preco_unitario), 0) AS valor_total
            FROM pedido_compra pc
            JOIN fornecedor f ON f.id = pc.fornecedor_id
            JOIN cotacao c ON c.id = pc.cotacao_id
            LEFT JOIN pedido_compra_item pi ON pi.pedido_id = pc.id
            GROUP BY pc.id
            ORDER BY pc.criado_em DESC
            """
        ).fetchall()
        return [dict(linha) for linha in linhas]


def buscar_pedido(pedido_id):
    with conexao() as conn:
        linha = conn.execute(
            """
            SELECT pc.id, pc.cotacao_id, pc.fornecedor_id, pc.loja, pc.status, pc.criado_em, pc.atualizado_em,
                   f.nome AS fornecedor_nome, f.pedido_minimo,
                   c.titulo AS cotacao_titulo
            FROM pedido_compra pc
            JOIN fornecedor f ON f.id = pc.fornecedor_id
            JOIN cotacao c ON c.id = pc.cotacao_id
            WHERE pc.id = ?
            """,
            (pedido_id,),
        ).fetchone()
        if not linha:
            return None
        pedido = dict(linha)
        itens = conn.execute(
            """
            SELECT pi.insumo_id, pi.quantidade, pi.preco_unitario, i.nome, i.unidade_medida
            FROM pedido_compra_item pi
            JOIN insumo i ON i.id = pi.insumo_id
            WHERE pi.pedido_id = ?
            ORDER BY i.nome
            """,
            (pedido_id,),
        ).fetchall()
        pedido['itens'] = [dict(item) for item in itens]
        pedido['total_itens'] = len(pedido['itens'])
        pedido['valor_total'] = sum(item['quantidade'] * item['preco_unitario'] for item in pedido['itens'])
        return pedido


def avancar_status_pedido(pedido_id):
    """Avança pro próximo estágio de acompanhamento de entrega — não pula
    etapa nem volta, sempre um passo por vez. Não mexe em estoque (ela
    prefere continuar lançando entrada na mão, q25) — é só rastreio."""
    pedido = buscar_pedido(pedido_id)
    if not pedido:
        return None
    indice_atual = ESTAGIOS_PEDIDO.index(pedido['status'])
    if indice_atual >= len(ESTAGIOS_PEDIDO) - 1:
        return pedido['status']
    novo_status = ESTAGIOS_PEDIDO[indice_atual + 1]
    with conexao() as conn:
        conn.execute(
            "UPDATE pedido_compra SET status = ?, atualizado_em = ? WHERE id = ?",
            (novo_status, datetime.now().isoformat(), pedido_id),
        )
    return novo_status


def voltar_status_pedido(pedido_id):
    """Volta pro estágio anterior — corrige quando avança sem querer
    (risco real que ela apontou, revisão 2026-08-28). Mesma regra do
    avanço: um passo de cada vez, não mexe em estoque."""
    pedido = buscar_pedido(pedido_id)
    if not pedido:
        return None
    indice_atual = ESTAGIOS_PEDIDO.index(pedido['status'])
    if indice_atual <= 0:
        return pedido['status']
    novo_status = ESTAGIOS_PEDIDO[indice_atual - 1]
    with conexao() as conn:
        conn.execute(
            "UPDATE pedido_compra SET status = ?, atualizado_em = ? WHERE id = ?",
            (novo_status, datetime.now().isoformat(), pedido_id),
        )
    return novo_status


def excluir_pedido(pedido_id):
    """Cancela um pedido gerado por engano (fornecedor errado, duplicado
    etc. — risco real que ela apontou, revisão 2026-08-28). Não mexe em
    estoque (o pedido nunca mexeu). Excluir libera o(s) insumo(s) desse
    pedido pra aparecer de novo da próxima vez que "Gerar pedidos" rodar
    nessa cotação — `gerar_pedidos_de_cotacao` só pula insumo que já tem
    pedido_compra_item existente, então cancelar é o mesmo que "ainda não
    foi pedido"."""
    with conexao() as conn:
        conn.execute("DELETE FROM pedido_compra_item WHERE pedido_id = ?", (pedido_id,))
        conn.execute("DELETE FROM pedido_compra WHERE id = ?", (pedido_id,))


def listar_pedidos_pendentes_recebimento():
    """Pedidos que ainda não foram confirmados como recebidos — alimenta a
    tela "Recebimentos" (pedido do Guilherme: colaborador comum, não só
    admin, busca o pedido por fornecedor/valor/produto e confirma o
    recebimento, o que atualiza o estoque de verdade — hoje nada faz isso
    sozinho a partir de um pedido). `itens_nomes` concatena o nome de cada
    insumo pra dar busca por produto sem precisar de outro endpoint."""
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT pc.id, pc.fornecedor_id, pc.loja, pc.status, pc.criado_em,
                   f.nome AS fornecedor_nome,
                   COUNT(pi.insumo_id) AS total_itens,
                   COALESCE(SUM(pi.quantidade * pi.preco_unitario), 0) AS valor_total,
                   GROUP_CONCAT(i.nome, ', ') AS itens_nomes
            FROM pedido_compra pc
            JOIN fornecedor f ON f.id = pc.fornecedor_id
            LEFT JOIN pedido_compra_item pi ON pi.pedido_id = pc.id
            LEFT JOIN insumo i ON i.id = pi.insumo_id
            WHERE pc.status != 'recebido'
            GROUP BY pc.id
            ORDER BY pc.criado_em DESC
            """
        ).fetchall()
        return [dict(linha) for linha in linhas]


def confirmar_recebimento_pedido(pedido_id, recebido_por, valor_nf, itens):
    """Confirma que um pedido chegou — pedido real da Julia: é a única ação
    que efetivamente soma no estoque a partir de um pedido de compra (hoje
    "Avançar etapa" só rastreia estágio, e a entrada de verdade é manual,
    solta, via "Registrar entrada"). `itens`: lista de {insumoId, quantidade,
    precoUnitario} com o valor FINAL — igual ao pedido original se não teve
    divergência na entrega, ou corrigido pelo colaborador se veio diferente.
    A correção sobrescreve `pedido_compra_item` (mesmo espírito de
    sobrescrita usado em ajustes por todo o sistema) e é o que soma em
    `estoque_insumo` — não o valor pedido originalmente.

    Se o valor informado da Nota Fiscal não bater com o total calculado dos
    itens (final, já corrigido), cria uma tarefa no ClickUp pra alguém
    ligar pro fornecedor e entender a diferença — sem isso, uma divergência
    de NF passaria batido sem ninguém saber."""
    pedido = buscar_pedido(pedido_id)
    if not pedido:
        return None

    agora = datetime.now().isoformat()
    valor_calculado = 0.0
    with conexao() as conn:
        for item in itens:
            insumo_id = int(item["insumoId"])
            quantidade = float(item["quantidade"])
            preco_unitario = float(item["precoUnitario"])
            valor_calculado += quantidade * preco_unitario
            conn.execute(
                "UPDATE pedido_compra_item SET quantidade = ?, preco_unitario = ? WHERE pedido_id = ? AND insumo_id = ?",
                (quantidade, preco_unitario, pedido_id, insumo_id),
            )
            conn.execute(
                "UPDATE estoque_insumo SET quantidade_atual = quantidade_atual + ?, atualizado_em = ? WHERE insumo_id = ? AND loja = ?",
                (quantidade, agora, insumo_id, pedido["loja"]),
            )

        valor_calculado = round(valor_calculado, 2)
        divergencia = abs(valor_nf - valor_calculado) > 0.05

        conn.execute(
            """
            UPDATE pedido_compra
            SET status = ?, recebido_por = ?, recebido_em = ?, valor_nf = ?, divergencia_nf = ?, atualizado_em = ?
            WHERE id = ?
            """,
            (ESTAGIOS_PEDIDO[-1], recebido_por, agora, valor_nf, 1 if divergencia else 0, agora, pedido_id),
        )

    if divergencia:
        criar_tarefa(
            titulo=f"Divergência de NF — Pedido #{pedido_id} ({pedido['fornecedor_nome']})",
            descricao=(
                f"Valor da Nota Fiscal informado (R$ {valor_nf:.2f}) não bate com o valor "
                f"calculado dos itens recebidos (R$ {valor_calculado:.2f}). Recebido por "
                f"{recebido_por} em {agora[:16].replace('T', ' ')}. Ligar pro fornecedor "
                f"({pedido['fornecedor_nome']}) pra entender a diferença."
            ),
            categoria="Estoque",
            prioridade="alta",
            data_limite=None,
        )

    return {"divergencia": divergencia, "valorCalculado": valor_calculado}


def limpar_requisicoes_e_cotacoes():
    """Apaga TODO o histórico de requisições/contagens, cotações (com
    convites e preços) e pedidos de compra — ação de manutenção sem volta,
    usada pra limpar dados de teste antes do sistema entrar em uso de
    verdade. Não mexe em `estoque_insumo` (a quantidade atual real fica
    como está) nem em cadastro (insumo, fornecedor, vínculos, ajustes de
    quantidade ideal, datas especiais) — só o histórico do fluxo de
    Compras em si."""
    with conexao() as conn:
        conn.execute("DELETE FROM pedido_compra_item")
        conn.execute("DELETE FROM pedido_compra")
        conn.execute("DELETE FROM cotacao_convite_item")
        conn.execute("DELETE FROM cotacao_convite")
        conn.execute("DELETE FROM cotacao_preco")
        conn.execute("DELETE FROM cotacao_item")
        conn.execute("DELETE FROM cotacao_item_loja")
        conn.execute("DELETE FROM cotacao")
        conn.execute("DELETE FROM contagem_item")
        conn.execute("DELETE FROM contagem")


def excluir_requisicao(titulo, prazo_validade):
    """Apaga uma única requisição (o grupo de contagens com esse título +
    prazo) e a cotação/pedidos gerados a partir dela, se existir — versão
    pontual da Zona de Perigo acima, que só apagava tudo de uma vez (risco
    real que ela apontou: não dava pra descartar uma requisição de teste
    isolada sem zerar o histórico inteiro). Mesma regra de não mexer em
    `estoque_insumo` nem em cadastro."""
    with conexao() as conn:
        cotacoes = conn.execute(
            "SELECT id FROM cotacao WHERE requisicao_titulo = ? AND requisicao_prazo = ?",
            (titulo, prazo_validade),
        ).fetchall()
        for cotacao in cotacoes:
            cotacao_id = cotacao["id"]
            conn.execute(
                "DELETE FROM pedido_compra_item WHERE pedido_id IN (SELECT id FROM pedido_compra WHERE cotacao_id = ?)",
                (cotacao_id,),
            )
            conn.execute("DELETE FROM pedido_compra WHERE cotacao_id = ?", (cotacao_id,))
            conn.execute(
                "DELETE FROM cotacao_convite_item WHERE convite_id IN (SELECT id FROM cotacao_convite WHERE cotacao_id = ?)",
                (cotacao_id,),
            )
            conn.execute("DELETE FROM cotacao_convite WHERE cotacao_id = ?", (cotacao_id,))
            conn.execute("DELETE FROM cotacao_preco WHERE cotacao_id = ?", (cotacao_id,))
            conn.execute("DELETE FROM cotacao_item WHERE cotacao_id = ?", (cotacao_id,))
            conn.execute("DELETE FROM cotacao_item_loja WHERE cotacao_id = ?", (cotacao_id,))
            conn.execute("DELETE FROM cotacao WHERE id = ?", (cotacao_id,))
        conn.execute(
            "DELETE FROM contagem_item WHERE contagem_id IN (SELECT id FROM contagem WHERE descricao = ? AND prazo_validade = ?)",
            (titulo, prazo_validade),
        )
        conn.execute(
            "DELETE FROM contagem WHERE descricao = ? AND prazo_validade = ?",
            (titulo, prazo_validade),
        )


DIAS_COBERTURA_IDEAL = 7  # mesma constante do front (script.js) — cotação é semanal


def _mapa_consumo_medio_loja(loja, dias_historico=30):
    fim = datetime.now().date()
    inicio = fim - timedelta(days=dias_historico - 1)
    linhas = consumo_medio_insumo(inicio.isoformat(), fim.isoformat(), loja)
    return {linha["insumoId"]: linha["consumoMedioDiario"] for linha in linhas}


def criar_contagem(loja, descricao, prazo_validade, categorias=None):
    """Abre uma contagem pra uma loja — gera um token opaco (o link que vai
    pro funcionário, sem precisar de login) e já grava uma linha só pros
    insumos que essa loja usa (`insumo_loja`), dentro das categorias
    escolhidas se filtrado, esperando preenchimento. `categorias` vazio/None
    inclui todos os insumos dessa loja. Assim o funcionário do Artesanos não
    vê insumo que só existe nos Tradiças, e vice-versa (ajustável na tela
    "Insumos da loja" do Estoque)."""
    token = secrets.token_urlsafe(24)
    agora = datetime.now().isoformat()
    with conexao() as conn:
        if categorias:
            marcadores = ", ".join("?" for _ in categorias)
            linhas = conn.execute(
                f"""
                SELECT i.id FROM insumo i
                JOIN insumo_loja il ON il.insumo_id = i.id AND il.loja = ?
                WHERE i.categoria IN ({marcadores})
                """,
                [loja, *categorias],
            ).fetchall()
        else:
            linhas = conn.execute(
                """
                SELECT i.id FROM insumo i
                JOIN insumo_loja il ON il.insumo_id = i.id AND il.loja = ?
                """,
                (loja,),
            ).fetchall()

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


def listar_requisicoes():
    """Agrupa as contagens que compartilham título + prazo — não existe uma
    tabela `requisicao` separada (decisão de 2026-08-26, ver DOCUMENTACAO.md
    seção 6.9): como uma requisição é só "abrir uma contagem por loja de uma
    vez com o mesmo título/prazo", ela é reconstituída a partir das próprias
    contagens em vez de duplicar schema."""
    grupos = {}
    ordem = []
    for c in listar_contagens():
        chave = (c['descricao'], c['prazo_validade'])
        if chave not in grupos:
            grupos[chave] = []
            ordem.append(chave)
        grupos[chave].append(c)

    requisicoes = [
        {
            "titulo": chave[0],
            "prazo_validade": chave[1],
            "criado_em": min(c['criado_em'] for c in grupos[chave]),
            "contagens": grupos[chave],
        }
        for chave in ordem
    ]
    requisicoes.sort(key=lambda r: r['criado_em'], reverse=True)
    return requisicoes


def buscar_contagem_por_token(token):
    with conexao() as conn:
        linha = conn.execute("SELECT * FROM contagem WHERE token = ?", (token,)).fetchone()
        return dict(linha) if linha else None


def buscar_contagem(contagem_id):
    with conexao() as conn:
        linha = conn.execute("SELECT * FROM contagem WHERE id = ?", (contagem_id,)).fetchone()
        return dict(linha) if linha else None


def salvar_ajuste_quantidade_ideal(loja, insumo_id, valor_ajustado):
    """Sobrescreve a quantidade ideal calculada (consumo médio × 7 dias) por
    um valor que a Kethllyn decidiu na mão, quando ela acha que o cálculo
    não bate com a realidade — sobrevive a novos recálculos até ela remover
    o ajuste (mesmo padrão do ajuste manual de faturamento por canal)."""
    agora = datetime.now().isoformat()
    with conexao() as conn:
        conn.execute(
            """
            INSERT INTO ajuste_quantidade_ideal (loja, insumo_id, valor_ajustado, atualizado_em)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (loja, insumo_id) DO UPDATE SET
                valor_ajustado = excluded.valor_ajustado,
                atualizado_em = excluded.atualizado_em
            """,
            (loja, insumo_id, valor_ajustado, agora),
        )


def salvar_ajustes_quantidade_ideal_em_lote(loja, valores):
    """`valores` = {insumo_id: valor} — aplica vários ajustes manuais de
    uma vez (mesma tabela/mecanismo de `salvar_ajuste_quantidade_ideal`).
    Construído em 2026-08-28 depois que ela testou em produção e viu que,
    com a Ficha Técnica ainda incompleta, a maioria dos insumos fica sem
    quantidade ideal calculável — ajustar um por um pelo lápis é inviável
    pra destravar a cotação de uma vez."""
    for insumo_id, valor in valores.items():
        salvar_ajuste_quantidade_ideal(loja, insumo_id, valor)
    return len(valores)


def excluir_ajuste_quantidade_ideal(loja, insumo_id):
    """Remove o ajuste manual — volta a mostrar o valor calculado."""
    with conexao() as conn:
        conn.execute(
            "DELETE FROM ajuste_quantidade_ideal WHERE loja = ? AND insumo_id = ?",
            (loja, insumo_id),
        )


def mapa_ajustes_quantidade_ideal(loja):
    with conexao() as conn:
        linhas = conn.execute(
            "SELECT insumo_id, valor_ajustado FROM ajuste_quantidade_ideal WHERE loja = ?",
            (loja,),
        ).fetchall()
        return {linha["insumo_id"]: linha["valor_ajustado"] for linha in linhas}


def copiar_quantidade_ideal(loja_origem, loja_destino):
    """'Loja nova sem histórico' (seção 9, roteiro de compras respondido
    pela Kethllyn) — copia a quantidade ideal EFETIVA (o ajuste manual da
    loja de origem quando existir, senão a calculada a partir do consumo
    médio dela) pra loja de destino, virando um ajuste manual lá. Não é
    mágica: é só um jeito rápido de começar com um número razoável antes
    da loja nova ter venda suficiente pra calcular sozinha."""
    mapa_consumo_origem = _mapa_consumo_medio_loja(loja_origem)
    mapa_ajustes_origem = mapa_ajustes_quantidade_ideal(loja_origem)
    with conexao() as conn:
        insumo_ids = [linha["id"] for linha in conn.execute("SELECT id FROM insumo").fetchall()]

    copiados = 0
    for insumo_id in insumo_ids:
        if insumo_id in mapa_ajustes_origem:
            valor = mapa_ajustes_origem[insumo_id]
        else:
            consumo = mapa_consumo_origem.get(insumo_id)
            valor = round(consumo * DIAS_COBERTURA_IDEAL, 2) if consumo is not None else None
        if valor is not None:
            salvar_ajuste_quantidade_ideal(loja_destino, insumo_id, valor)
            copiados += 1
    return copiados


def criar_data_especial(data_inicio, data_fim, descricao, multiplicador, loja=None):
    """Feriado/evento marcado com antecedência (seção 9, roteiro de
    compras) — enquanto a data cair dentro da janela de cobertura (hoje até
    hoje + DIAS_COBERTURA_IDEAL), a quantidade ideal calculada (não a
    ajustada na mão) sai multiplicada por esse valor. `loja=None` vale pra
    todas as lojas."""
    agora = datetime.now().isoformat()
    with conexao() as conn:
        conn.execute(
            """
            INSERT INTO data_especial (data_inicio, data_fim, descricao, multiplicador, loja, criado_em)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (data_inicio, data_fim, descricao, multiplicador, loja, agora),
        )


def excluir_data_especial(data_especial_id):
    with conexao() as conn:
        conn.execute("DELETE FROM data_especial WHERE id = ?", (data_especial_id,))


def listar_datas_especiais():
    with conexao() as conn:
        linhas = conn.execute("SELECT * FROM data_especial ORDER BY data_inicio").fetchall()
        return [dict(linha) for linha in linhas]


def multiplicador_quantidade_ideal(loja):
    """Maior multiplicador entre as datas especiais (dessa loja ou
    cadastradas pra 'todas as lojas') que tocam a janela de cobertura —
    hoje até hoje + DIAS_COBERTURA_IDEAL. 1.0 se nenhuma tocar (caso
    comum, não muda nada na conta de sempre)."""
    hoje = datetime.now().date()
    fim_janela = hoje + timedelta(days=DIAS_COBERTURA_IDEAL)
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT multiplicador FROM data_especial
            WHERE (loja IS NULL OR loja = ?)
              AND data_inicio <= ? AND data_fim >= ?
            """,
            (loja, fim_janela.isoformat(), hoje.isoformat()),
        ).fetchall()
    if not linhas:
        return 1.0
    return max(linha["multiplicador"] for linha in linhas)


def listar_itens_contagem(contagem_id, loja):
    """Itens da contagem + quantidade ideal (consumo médio × 7 dias × o
    multiplicador de alguma data especial ativa, ou o ajuste manual da
    Kethllyn quando existir um pra esse insumo/loja — o ajuste sempre
    ganha da data especial, é a palavra final dela) pra servir de
    referência tanto na tela pública de preenchimento quanto na
    conferência — mesmo cálculo de DIAS_COBERTURA_IDEAL do front."""
    mapa_consumo = _mapa_consumo_medio_loja(loja)
    mapa_ajustes = mapa_ajustes_quantidade_ideal(loja)
    multiplicador = multiplicador_quantidade_ideal(loja)
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
        ajustada = linha["insumo_id"] in mapa_ajustes
        if ajustada:
            quantidade_ideal = mapa_ajustes[linha["insumo_id"]]
        else:
            consumo_medio = mapa_consumo.get(linha["insumo_id"])
            quantidade_ideal = round(consumo_medio * DIAS_COBERTURA_IDEAL * multiplicador, 2) if consumo_medio is not None else None
        itens.append({
            "insumoId": linha["insumo_id"],
            "nome": linha["nome"],
            "categoria": linha["categoria"],
            "unidadeMedida": linha["unidade_medida"],
            "marcaHomologada": linha["marca_homologada"],
            "quantidadePreenchida": linha["quantidade_preenchida"],
            "quantidadeIdeal": quantidade_ideal,
            "quantidadeIdealAjustada": ajustada,
        })
    return itens


def gerar_cotacao_do_deficit(titulo, prazo_validade):
    """Gera uma cotação de verdade a partir do déficit (ideal − atual) de
    uma requisição com todas as contagens já aprovadas (seção 9, 'Geração
    automática da cotação a partir do déficit'). Regras vêm direto do
    roteiro de compras que a Kethllyn respondeu: déficit sempre arredonda
    pra cima (q1); insumo com estoque já no nível ideal nem entra na lista
    (q2); insumo sem quantidade ideal calculada é pulado, não vira "compre
    0" (q6); cada loja conta separado, não soma antes de calcular o
    déficit (q7b) — por isso guarda a quebra por loja em
    `cotacao_item_loja`, mesmo a cotação em si mostrando os insumos juntos
    (q3, "mesmo link, insumos juntos, mas separados na hora de montar a
    compra pra cada loja").

    Retorna {"cotacaoId": id ou None, "insumosSemIdeal": [{"insumoId",
    "nome"}, ...]}. `cotacaoId` vem None se a requisição não existir,
    ainda tiver alguma contagem não aprovada, ou não sobrar nenhum insumo
    com déficit de verdade (nada a comprar). `insumosSemIdeal` avisa quais
    insumos ficaram de fora do cálculo por não terem quantidade ideal
    calculável em pelo menos uma loja — antes sumiam da cotação sem
    nenhum aviso, risco real que ela apontou revisando o fluxo (a pessoa
    só descobriria o insumo faltando muito depois, olhando o pedido final).
    **Idempotente**: se essa requisição já tinha gerado uma cotação antes
    (clicar duas vezes em "Gerar cotação", ou aprovar a última loja duas
    vezes), devolve a cotação que já existe em vez de criar uma duplicada
    com os mesmos insumos — risco real que ela apontou (roteiro de
    compras, revisão 2026-08-28)."""
    with conexao() as conn:
        existente = conn.execute(
            "SELECT id FROM cotacao WHERE requisicao_titulo = ? AND requisicao_prazo = ?",
            (titulo, prazo_validade),
        ).fetchone()
    if existente:
        return {"cotacaoId": existente["id"], "insumosSemIdeal": []}

    grupo = None
    for r in listar_requisicoes():
        if r['titulo'] == titulo and r['prazo_validade'] == prazo_validade:
            grupo = r
            break
    if not grupo:
        return {"cotacaoId": None, "insumosSemIdeal": []}
    if any(c['status'] != 'aprovada' for c in grupo['contagens']):
        return {"cotacaoId": None, "insumosSemIdeal": []}

    deficits = {}
    sem_ideal = {}
    for contagem in grupo['contagens']:
        for item in listar_itens_contagem(contagem['id'], contagem['loja']):
            if item['quantidadeIdeal'] is None:
                sem_ideal[item['insumoId']] = item['nome']
                continue
            atual = item['quantidadePreenchida'] if item['quantidadePreenchida'] is not None else 0
            deficit = item['quantidadeIdeal'] - atual
            if deficit <= 0:
                continue
            deficit = math.ceil(deficit * 100) / 100
            info = deficits.setdefault(item['insumoId'], {
                "nome": item['nome'],
                "categoria": item['categoria'],
                "unidadeMedida": item['unidadeMedida'],
                "porLoja": {},
            })
            info['porLoja'][contagem['loja']] = deficit

    insumos_sem_ideal = [{"insumoId": insumo_id, "nome": nome} for insumo_id, nome in sem_ideal.items()]

    if not deficits:
        return {"cotacaoId": None, "insumosSemIdeal": insumos_sem_ideal}

    cotacao_id = criar_cotacao(titulo, requisicao_titulo=titulo, requisicao_prazo=prazo_validade)
    with conexao() as conn:
        for insumo_id, info in deficits.items():
            total = round(sum(info['porLoja'].values()), 2)
            conn.execute(
                "INSERT INTO cotacao_item (cotacao_id, insumo_id, quantidade_total) VALUES (?, ?, ?)",
                (cotacao_id, insumo_id, total),
            )
            for loja, quantidade in info['porLoja'].items():
                conn.execute(
                    "INSERT INTO cotacao_item_loja (cotacao_id, insumo_id, loja, quantidade) VALUES (?, ?, ?, ?)",
                    (cotacao_id, insumo_id, loja, quantidade),
                )
    return {"cotacaoId": cotacao_id, "insumosSemIdeal": insumos_sem_ideal}


def listar_itens_cotacao(cotacao_id):
    """Quantidade total (soma das lojas) + quebra por loja de cada insumo
    de uma cotação gerada automaticamente — cotação lançada na mão (sem
    passar pela Requisição) simplesmente não tem nenhuma linha aqui."""
    with conexao() as conn:
        totais = conn.execute(
            """
            SELECT ci.insumo_id, ci.quantidade_total, i.nome, i.categoria, i.unidade_medida
            FROM cotacao_item ci
            JOIN insumo i ON i.id = ci.insumo_id
            WHERE ci.cotacao_id = ?
            ORDER BY i.categoria, i.nome
            """,
            (cotacao_id,),
        ).fetchall()
        por_loja_linhas = conn.execute(
            "SELECT insumo_id, loja, quantidade FROM cotacao_item_loja WHERE cotacao_id = ?",
            (cotacao_id,),
        ).fetchall()

    mapa_loja = {}
    for linha in por_loja_linhas:
        mapa_loja.setdefault(linha["insumo_id"], []).append({"loja": linha["loja"], "quantidade": linha["quantidade"]})

    return [
        {
            "insumoId": t["insumo_id"],
            "nome": t["nome"],
            "categoria": t["categoria"],
            "unidadeMedida": t["unidade_medida"],
            "quantidadeTotal": t["quantidade_total"],
            "porLoja": mapa_loja.get(t["insumo_id"], []),
        }
        for t in totais
    ]


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


def reabrir_contagem(contagem_id):
    """Volta uma contagem 'respondida' ou 'aprovada' pra 'aberta',
    destravando o link público de novo pra digitar os valores certos —
    risco real que ela apontou: erro de preenchimento aprovado sem querer
    não tinha conserto nenhum, só apagando tudo pela Zona de Perigo. Não
    desfaz o que já foi aprovado em `estoque_insumo` (não existe rastro de
    qual era o valor anterior pra reverter com segurança); quando a loja
    reenviar e alguém aprovar de novo, `aprovar_contagem` sobrescreve com
    o valor corrigido normalmente. Se a Requisição já tiver gerado uma
    cotação, os números lá **não** se atualizam sozinhos — a tela avisa
    disso antes de reabrir."""
    with conexao() as conn:
        conn.execute(
            "UPDATE contagem SET status = 'aberta', respondida_em = NULL, aprovada_em = NULL WHERE id = ?",
            (contagem_id,),
        )
