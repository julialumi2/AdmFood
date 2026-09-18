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
from datetime import date, datetime, timedelta

# Em produção (Dokploy), aponta pra um volume persistente (ex: /app/data/admfood.db)
# via a variável DATABASE_PATH, senão perde os dados a cada novo deploy.
CAMINHO_BANCO = os.environ.get("DATABASE_PATH", "admfood.db")

# Fotos dos produtos do Cardápio ficam no mesmo volume persistente do banco
# (uma pasta "cardapio_fotos" do lado do admfood.db), pelo mesmo motivo:
# sem isso, sumiriam a cada redeploy.
PASTA_FOTOS_CARDAPIO = os.path.join(os.path.dirname(os.path.abspath(CAMINHO_BANCO)), "cardapio_fotos")
os.makedirs(PASTA_FOTOS_CARDAPIO, exist_ok=True)

# Foto/PDF da nota fiscal de compra feita por fora (ver lancar_compra_fora),
# no mesmo volume pelo mesmo motivo.
PASTA_NOTAS_FISCAIS = os.path.join(os.path.dirname(os.path.abspath(CAMINHO_BANCO)), "notas_fiscais")
os.makedirs(PASTA_NOTAS_FISCAIS, exist_ok=True)

# Cópias de segurança do banco, no mesmo volume (ver seção 8.3 da
# documentação). Protegem contra erro de operação e contra o banco corromper;
# contra perder o servidor inteiro, só a cópia que sai daqui (o botão "Baixar
# cópia" na tela de Configurações, ou o backup de volume do Dokploy).
PASTA_BACKUPS = os.path.join(os.path.dirname(os.path.abspath(CAMINHO_BANCO)), "backups")
os.makedirs(PASTA_BACKUPS, exist_ok=True)
DIAS_DE_BACKUP_DIARIO = 14
DIAS_DE_BACKUP_MENSAL = 365


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

        # Histórico semanal por canal (2026-09-08) — separado de propósito
        # de faturamento_canal/faturamento_diario, que são por DIA. A
        # planilha que a Julia recebeu do chefe só tem o total da SEMANA por
        # canal, sem quebra diária — jogar isso num dia só (ou dividir por 7)
        # inventaria uma precisão que a fonte não tem. Fica numa tela própria
        # ("Vendas Semanais"), sem entrar nos gráficos/relatórios diários.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS faturamento_canal_semanal (
                unidade TEXT NOT NULL,
                periodo_inicio TEXT NOT NULL,
                periodo_fim TEXT NOT NULL,
                canal TEXT NOT NULL,
                faturamento REAL NOT NULL,
                criado_em TEXT NOT NULL,
                PRIMARY KEY (unidade, periodo_inicio, canal)
            )
            """
        )

        # CMV e promoção da semana vêm da mesma planilha, mas são por SEMANA
        # (não por canal), então ficam à parte. Só o que é dado de entrada
        # mora aqui: %CMV, classificação (ÓTIMO/BOM/RUIM) e variação semana
        # a semana são calculados na hora — copiar número derivado da
        # planilha seria manter duas contas que podem divergir.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS resultado_semanal (
                unidade TEXT NOT NULL,
                periodo_inicio TEXT NOT NULL,
                periodo_fim TEXT NOT NULL,
                cmv REAL,
                promo_loja REAL,
                criado_em TEXT NOT NULL,
                PRIMARY KEY (unidade, periodo_inicio)
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
        colunas_tarefa = {c["name"] for c in conn.execute("PRAGMA table_info(tarefa)").fetchall()}
        if "visivel_para" not in colunas_tarefa:
            # id do usuário que vê o card; NULL = a equipe toda (o normal).
            # "Só eu vejo este card" no ClickUp (pedido da Julia, 11/09).
            conn.execute("ALTER TABLE tarefa ADD COLUMN visivel_para INTEGER")
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
            CREATE TABLE IF NOT EXISTS registro_acao (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                criado_em TEXT NOT NULL,
                usuario_id INTEGER,
                usuario_nome TEXT NOT NULL,
                papel TEXT,
                loja TEXT,
                metodo TEXT NOT NULL,
                rota TEXT NOT NULL,
                caminho TEXT NOT NULL,
                status INTEGER NOT NULL,
                descricao TEXT NOT NULL,
                detalhes TEXT
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_registro_acao_data ON registro_acao(criado_em DESC)")
        colunas_usuario = {c["name"] for c in conn.execute("PRAGMA table_info(usuario)").fetchall()}
        if "loja" not in colunas_usuario:
            # Loja do funcionário: gerente e operação só enxergam a dela.
            # NULL = a rede inteira, que é o caso do admin (card #35, 17/09).
            conn.execute("ALTER TABLE usuario ADD COLUMN loja TEXT")
        # 'equipe' era o único papel de funcionário antes do card #35. Virou
        # 'operacao', o mesmo acesso do dia a dia com nome que diz o que é.
        conn.execute("UPDATE usuario SET papel = 'operacao' WHERE papel = 'equipe'")
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
        if "manual" not in colunas_preco:
            # 1 = produto criado na tela ("Novo item" do Cardápio), que não
            # veio da planilha de preços. A reimportação da planilha apaga
            # quem sumiu dela, mas não esse — senão o produto sumiria na
            # próxima importação junto com a ficha que ela montou pra ele.
            conn.execute("ALTER TABLE preco_cardapio ADD COLUMN manual INTEGER NOT NULL DEFAULT 0")
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
        if "unidade_compra" not in colunas_insumo:
            conn.execute("ALTER TABLE insumo ADD COLUMN unidade_compra TEXT NOT NULL DEFAULT ''")
        if "custo_referencia" not in colunas_insumo:
            # Custo por unidade vindo da planilha de CMV do chefe. É a base
            # do CMV enquanto não existe compra recebida no sistema — sem
            # isso, produto nenhum tem custo e a Curva ABC de Cardápio não
            # consegue classificar ninguém. Assim que uma compra real entra,
            # ela ganha deste (ver _mapa_preco_insumo).
            conn.execute("ALTER TABLE insumo ADD COLUMN custo_referencia REAL")
        if "fator_conversao_compra" not in colunas_insumo:
            # Quantas unidade_medida (kg/L/un...) tem em 1 unidade_compra (caixa/fardo/pacote...).
            # NULL = insumo ainda não configurado pra arredondamento de embalagem — cai no
            # arredondamento antigo (só precisão de centavo), ver arredondar_quantidade_compra.
            conn.execute("ALTER TABLE insumo ADD COLUMN fator_conversao_compra REAL")
        if "marca_homologada" not in colunas_insumo:
            conn.execute("ALTER TABLE insumo ADD COLUMN marca_homologada TEXT NOT NULL DEFAULT ''")
        if "rendimento_receita" not in colunas_insumo:
            # Quanto uma batelada da receita produz, na unidade_medida do
            # próprio insumo (ex: Tempero Batata rende 1600 g). Não dá pra
            # deduzir somando os ingredientes: receita que vai ao fogo perde
            # água (1 kg de cebola não vira 1 kg de cebola caramelizada), e é
            # o rendimento que transforma o custo da batelada em custo por
            # grama. NULL = insumo comprado pronto, sem receita.
            conn.execute("ALTER TABLE insumo ADD COLUMN rendimento_receita REAL")
        if "conteudo_por_unidade" not in colunas_insumo:
            # Insumo contado por unidade (saco de 1 kg, bisnaga, pote) que a
            # receita usa em grama/ml: quanto tem em 1 unidade (1000 g). Com
            # isso a ficha aceita "14 g" e guarda 0,014 un — estoque, compra
            # e custo continuam por pacote, do jeito que a loja conta.
            conn.execute("ALTER TABLE insumo ADD COLUMN conteudo_por_unidade REAL")
            conn.execute("ALTER TABLE insumo ADD COLUMN unidade_conteudo TEXT")

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
        colunas_item_cardapio = {c["name"] for c in conn.execute("PRAGMA table_info(item_cardapio)").fetchall()}
        if "tipo" not in colunas_item_cardapio:
            # Complemento (Granola, Leite em pó...) vira o mesmo tipo de
            # entidade que produto — só uma tag a mais — pra herdar de
            # graça a Ficha Técnica por loja já pronta (seção 6.5). Todo
            # item já cadastrado até aqui é produto (default).
            conn.execute("ALTER TABLE item_cardapio ADD COLUMN tipo TEXT NOT NULL DEFAULT 'produto'")
        if "protegido" not in colunas_item_cardapio:
            # Curva ABC de Cardápio (Etapa 10): produto marcado como
            # protegido nunca entra na lista de corte por baixo volume —
            # é o caso da opção vegetariana, item de assinatura, presença
            # histórica no cardápio. A análise continua mostrando os
            # números dele, só não sugere cortar.
            conn.execute("ALTER TABLE item_cardapio ADD COLUMN protegido INTEGER NOT NULL DEFAULT 0")
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

        # As duas Tradiças dividem a ficha desde 2026-09-14 (ver
        # GRUPOS_FICHA_COMPARTILHADA): a receita que só uma delas tinha
        # passa pra outra.
        for grupo in GRUPOS_FICHA_COMPARTILHADA:
            _igualar_fichas_do_grupo(conn, grupo)

        # Embalagem pra viagem (2026-09-16): o que só sai quando o pedido
        # deixa a loja — no Artesanos o milkshake do salão vai no copo de
        # vidro, o do delivery vai no copo descartável com tampa, canudo e
        # saco. Mesmo formato da ficha_tecnica (por loja, na unidade do
        # insumo), mas à parte: a ficha continua sendo o que vai em todo
        # pedido. Ver SQL_INSUMOS_CONSUMIDOS.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS embalagem_viagem (
                item_id INTEGER NOT NULL,
                insumo_id INTEGER NOT NULL,
                loja TEXT NOT NULL,
                quantidade REAL,
                PRIMARY KEY (item_id, insumo_id, loja)
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS receita_insumo (
                insumo_id INTEGER NOT NULL,
                ingrediente_id INTEGER NOT NULL,
                quantidade REAL,
                PRIMARY KEY (insumo_id, ingrediente_id)
            )
            """
        )
        # Receita do insumo preparado na própria casa — o Tempero Batata não é
        # comprado pronto, é 1000 g de sal + 500 g de páprica + 100 g de
        # açúcar. Duas coisas saem daqui: o custo por grama, calculado em vez
        # de digitado (e que se corrige sozinho quando o sal muda de preço), e
        # a baixa de estoque em cascata — vender uma batata desconta sal,
        # páprica e açúcar, que é o que a casa realmente compra.
        #
        # Sem `loja` de propósito, ao contrário da ficha_tecnica: a receita da
        # mistura é padrão de cozinha, não decisão de cardápio de cada loja.
        # Receita pode chamar receita (o Molho Especial leva Maionese da
        # Casa), então quem lê isso resolve em cascata — ver _custo_de_insumo.

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
        colunas_venda_item = {c["name"] for c in conn.execute("PRAGMA table_info(venda_item)").fetchall()}
        if "multiplicador" not in colunas_venda_item:
            # "Quantos lanches" um nome_produto pendente representa quando
            # vinculado na mão (Etapa 0, seção 6.11 — ex: "Combo de sexta 99
            # Food - 2 smash's tradicionais" = 2). 1 pra tudo que já casa
            # sozinho (o normal). Aplicado na hora de gravar (vem do vínculo
            # manual vigente então), não recalculado depois — resincronizar
            # o dia de novo já usa o vínculo atualizado.
            conn.execute("ALTER TABLE venda_item ADD COLUMN multiplicador REAL NOT NULL DEFAULT 1")
        if "nome_normalizado" not in colunas_venda_item:
            # O mesmo nome_produto normalizado (_normalizar_nome_insumo),
            # gravado junto: é por ele que a composição de combo consegue
            # ser resolvida dentro do SQL da baixa de estoque, sem trazer
            # todas as vendas pro Python só pra normalizar string.
            conn.execute("ALTER TABLE venda_item ADD COLUMN nome_normalizado TEXT")
        if "tipo_pedido" not in colunas_venda_item:
            # Como o pedido saiu (order_type da Cardápio Web: delivery,
            # takeout, onsite, closed_table) — decide se a embalagem pra
            # viagem desconta. Venda gravada antes da coluna fica nula e cai
            # no canal (ver _SQL_PRA_VIAGEM).
            conn.execute("ALTER TABLE venda_item ADD COLUMN tipo_pedido TEXT")

        # Combo/kit vendido como um nome só ("Clássico + Batata + Bebida")
        # não é um produto de Ficha Técnica: é a soma de vários. Aqui cada
        # nome vendido vira N itens com quantidade, e a baixa de estoque
        # segue a receita de cada componente — sem duplicar receita, que
        # ficaria desatualizada assim que o lanche mudasse.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS composicao_produto_venda (
                nome_produto_normalizado TEXT NOT NULL,
                item_cardapio_id INTEGER NOT NULL,
                quantidade REAL NOT NULL DEFAULT 1,
                criado_em TEXT NOT NULL,
                criado_por TEXT,
                PRIMARY KEY (nome_produto_normalizado, item_cardapio_id)
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_venda_item_nome_norm ON venda_item(nome_normalizado)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_venda_item_dia ON venda_item(dia)"
        )
        # Complemento escolhido em cada produto vendido (Açaí "monte o seu":
        # "ESCOLHA 3 Toppings", "Toppings EXTRAS"...). Tabela à parte, e não
        # linha a mais em venda_item, pra nunca aparecer como produto nos
        # relatórios de venda: "Leite condensado" não é um item do
        # cardápio. (pedido_id, linha) aponta pro produto em venda_item;
        # a quantidade já vem multiplicada pela do produto.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS venda_complemento (
                unidade TEXT NOT NULL,
                pedido_id INTEGER NOT NULL,
                linha INTEGER NOT NULL,
                ordem INTEGER NOT NULL,
                dia TEXT NOT NULL,
                nome_complemento TEXT NOT NULL,
                nome_normalizado TEXT NOT NULL,
                grupo TEXT,
                quantidade REAL NOT NULL,
                preco_unitario REAL NOT NULL DEFAULT 0,
                item_cardapio_id INTEGER,
                PRIMARY KEY (unidade, pedido_id, linha, ordem)
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_venda_complemento_dia ON venda_complemento(unidade, dia)"
        )
        # Porção do complemento que vale só dentro de um produto (Julia,
        # 2026-09-11: no Frutas ao Creme cada fruta é 70 g no 500 e 50 g no
        # 330, o adicional 60/50 g — o morango do "monte o seu" é outra
        # porção). Por grupo de opção da Cardápio Web ("ESCOLHA 3 Toppings
        # 500ml", "Acompanha 1 adicional"); '' = complemento sem grupo.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS porcao_complemento_produto (
                loja TEXT NOT NULL,
                produto_item_id INTEGER NOT NULL,
                grupo TEXT NOT NULL DEFAULT '',
                gramas REAL NOT NULL,
                PRIMARY KEY (loja, produto_item_id, grupo)
            )
            """
        )
        # A porção por grupo não bastou: no "monte o seu" todo topping vem
        # no mesmo grupo e cada um tem a sua porção (leite condensado 70 g
        # no +3 de 500, granulado 30 g, fruta 70 g). Agora é por
        # complemento dentro do produto; a tabela de grupo acima ficou sem uso.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS porcao_complemento_item (
                loja TEXT NOT NULL,
                produto_item_id INTEGER NOT NULL,
                complemento_item_id INTEGER NOT NULL,
                gramas REAL NOT NULL,
                PRIMARY KEY (loja, produto_item_id, complemento_item_id)
            )
            """
        )

        # Venda gravada antes da coluna nome_normalizado existir ficou com ela
        # vazia — e aí o combo daquele dia nunca casa com a composição dele.
        # Só olha as vazias, então depois da primeira vez não custa nada; e
        # roda aqui pra produção se corrigir sozinha no deploy.
        for linha in conn.execute(
            "SELECT DISTINCT nome_produto FROM venda_item WHERE nome_normalizado IS NULL"
        ).fetchall():
            conn.execute(
                "UPDATE venda_item SET nome_normalizado = ? WHERE nome_produto = ? AND nome_normalizado IS NULL",
                (_normalizar_nome_insumo(linha["nome_produto"]), linha["nome_produto"]),
            )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_venda_item_item_cardapio ON venda_item(item_cardapio_id)"
        )

        # Vínculo manual permanente entre um nome de produto vendido (como
        # vem cru da Cardápio Web) e um item_cardapio — Etapa 0 do motor de
        # compra (2026-09-08). _casar_item_cardapio consulta essa tabela
        # ANTES do algoritmo de normalização automática: uma vez vinculado
        # na mão, fica valendo pra sempre pra esse nome, mesmo que a
        # normalização automática nunca teria batido sozinha.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS vinculo_produto_venda (
                nome_produto_normalizado TEXT PRIMARY KEY,
                item_cardapio_id INTEGER NOT NULL,
                criado_em TEXT NOT NULL,
                criado_por TEXT
            )
            """
        )
        colunas_vinculo = {c["name"] for c in conn.execute("PRAGMA table_info(vinculo_produto_venda)").fetchall()}
        if "quantidade_por_unidade" not in colunas_vinculo:
            # Pra combo/kit sem estrutura nenhuma na API (ex: "Combo de
            # sexta 99 Food - 2 smash's tradicionais") — a pessoa que
            # vincula manualmente também diz quantos lanches aquilo
            # representa, não só qual lanche.
            conn.execute("ALTER TABLE vinculo_produto_venda ADD COLUMN quantidade_por_unidade REAL NOT NULL DEFAULT 1")

        # Ledger de quanto já foi descontado de cada insumo, em cada loja,
        # em cada dia, pela baixa automática de estoque por venda (Etapa 0).
        # Existe só pra sincronização repetida do mesmo dia (acontece a cada
        # 15 min pra hoje, e toda madrugada pra ontem) não descontar em
        # dobro — aplicar_baixa_estoque_dia sempre aplica a DIFERENÇA entre
        # o consumo teórico recém-calculado e o que já estava aqui.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS baixa_estoque_venda (
                unidade TEXT NOT NULL,
                dia TEXT NOT NULL,
                insumo_id INTEGER NOT NULL,
                quantidade_baixada REAL NOT NULL,
                PRIMARY KEY (unidade, dia, insumo_id)
            )
            """
        )
        # Liga/desliga da baixa automática por loja (Estoque → Integrações do
        # Estoque, só admin). `inicio` nulo = desligada; a linha fica pra
        # lembrar a decisão. Ver inicio_baixa_automatica.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS baixa_automatica_loja (
                loja TEXT PRIMARY KEY,
                inicio TEXT,
                alterado_em TEXT NOT NULL,
                alterado_por TEXT
            )
            """
        )
        # O Artesanos já estava com a baixa ligada desde a Etapa 0, antes de
        # existir a tela. OR IGNORE: nunca desfaz o que foi decidido nela.
        conn.execute(
            "INSERT OR IGNORE INTO baixa_automatica_loja (loja, inicio, alterado_em, alterado_por) "
            "VALUES ('Hamburgueria Artesanos', '2026-09-08', ?, 'Etapa 0 do motor de compra')",
            (datetime.now().isoformat(),),
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
        # De quais lojas a gente já compra desse fornecedor (pedido da Julia,
        # 2026-09-11: no Açaí são 3 dos 70). O "Convidar fornecedores" já
        # vem com esses marcados, em vez de mandar pra todo fornecedor ativo.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS fornecedor_loja (
                fornecedor_id INTEGER NOT NULL,
                loja TEXT NOT NULL,
                PRIMARY KEY (fornecedor_id, loja)
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
        # Quando ela clicou em "Enviar por WhatsApp" (Julia, 2026-09-11):
        # antes disso o pedido aparece como "Pendente de envio", não como
        # "Pedido enviado" — gerar o pedido não manda nada pro fornecedor.
        if "whatsapp_enviado_em" not in colunas_pedido:
            conn.execute("ALTER TABLE pedido_compra ADD COLUMN whatsapp_enviado_em TEXT")
            # Pedido de antes disso não tem como saber: conta como enviado,
            # pra não aparecer "Pendente de envio" em pedido que já foi.
            conn.execute("UPDATE pedido_compra SET whatsapp_enviado_em = criado_em")

        # Link sem login pra fornecedor confirmar o pedido recebido — mesmo
        # token pra todo pedido nascido da mesma leva de "Gerar pedidos" pro
        # mesmo fornecedor (pedido pode ter loja(s) diferente(s), "feito em
        # conjunto" na mensagem de WhatsApp), pra confirmar todos com um só
        # clique. Pedido antigo, gerado antes dessa coluna existir, fica com
        # token nulo — nunca teve link mandado, não precisa de um agora.
        if "token" not in colunas_pedido:
            conn.execute("ALTER TABLE pedido_compra ADD COLUMN token TEXT")

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
        # Histórico trazido da VMarket (2026-09-16, a rede está saindo de lá):
        # o id de origem fica em cada registro importado, pra carga poder
        # rodar de novo sem duplicar. Ver importar_da_vmarket.
        for tabela in ("fornecedor", "cotacao", "pedido_compra", "contagem", "insumo"):
            colunas = {c["name"] for c in conn.execute(f"PRAGMA table_info({tabela})").fetchall()}
            if "id_vmarket" not in colunas:
                conn.execute(f"ALTER TABLE {tabela} ADD COLUMN id_vmarket TEXT")
            conn.execute(
                f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{tabela}_id_vmarket ON {tabela}(id_vmarket) "
                "WHERE id_vmarket IS NOT NULL"
            )
        # Fornecedor homologado do insumo (2026-09-16): o fornecedor com preço
        # já combinado (na unidade do insumo) e até quando vale. Insumo assim
        # não passa por cotação — a Requisição manda direto em pedido pra ele,
        # como os "produtos homologados" da VMarket. Ver criar_pedidos_diretos.
        colunas_insumo = {c["name"] for c in conn.execute("PRAGMA table_info(insumo)").fetchall()}
        for coluna, tipo in (
            ("fornecedor_homologado_id", "INTEGER"),
            ("preco_homologado", "REAL"),
            ("validade_preco_homologado", "TEXT"),
        ):
            if coluna not in colunas_insumo:
                conn.execute(f"ALTER TABLE insumo ADD COLUMN {coluna} {tipo}")
        # Pedido direto que nasceu de uma Requisição guarda de qual (título +
        # prazo), pra "Fazer Cotação/Pedido" não gerar de novo nem ficar órfão
        # quando a requisição é excluída.
        colunas_pedido_compra = {c["name"] for c in conn.execute("PRAGMA table_info(pedido_compra)").fetchall()}
        for coluna in ("requisicao_titulo", "requisicao_prazo"):
            if coluna not in colunas_pedido_compra:
                conn.execute(f"ALTER TABLE pedido_compra ADD COLUMN {coluna} TEXT")
        # Compra feita por fora do sistema (card #36 do ClickUp, 2026-09-17):
        # entra já recebida, com o número e o arquivo da nota. `somou_estoque`
        # guarda se as quantidades entraram no estoque, pra excluir desfazer.
        for coluna, tipo in (
            ("compra_fora", "INTEGER NOT NULL DEFAULT 0"),
            ("numero_nf", "TEXT"),
            ("nota_fiscal_arquivo", "TEXT"),
            ("somou_estoque", "INTEGER NOT NULL DEFAULT 0"),
        ):
            if coluna not in colunas_pedido_compra:
                conn.execute(f"ALTER TABLE pedido_compra ADD COLUMN {coluna} {tipo}")
        # Com o histórico inteiro da VMarket (2026-09-17) são milhares de
        # pedidos: busca de item por insumo e de pedido por cotação.
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pedido_compra_item_insumo ON pedido_compra_item(insumo_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pedido_compra_cotacao ON pedido_compra(cotacao_id)")
        # Cotação que só guarda pedido direto (sem preço cotado): não aparece
        # na lista de Cotações nem no histórico de compras.
        colunas_cotacao = {c["name"] for c in conn.execute("PRAGMA table_info(cotacao)").fetchall()}
        if "pedido_direto" not in colunas_cotacao:
            conn.execute("ALTER TABLE cotacao ADD COLUMN pedido_direto INTEGER NOT NULL DEFAULT 0")
        conn.execute("UPDATE cotacao SET pedido_direto = 1 WHERE id_vmarket = 'pedidos-sem-cotacao'")
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


def salvar_faturamento_canal_semanal_se_ausente(unidade, periodo_inicio_iso, periodo_fim_iso, canal, faturamento):
    """Grava uma linha do histórico semanal importado de planilha — só se
    essa (loja, semana, canal) ainda não existir. Mesmo espírito de
    `salvar_historico_se_ausente`: nunca sobrescreve o que já está
    gravado (rodar a importação de novo não duplica nem troca valor).
    Retorna True se gravou, False se já existia."""
    with conexao() as conn:
        existente = conn.execute(
            "SELECT 1 FROM faturamento_canal_semanal WHERE unidade = ? AND periodo_inicio = ? AND canal = ?",
            (unidade, periodo_inicio_iso, canal),
        ).fetchone()
        if existente:
            return False
        conn.execute(
            """
            INSERT INTO faturamento_canal_semanal
                (unidade, periodo_inicio, periodo_fim, canal, faturamento, criado_em)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (unidade, periodo_inicio_iso, periodo_fim_iso, canal, faturamento, datetime.now().isoformat()),
        )
        return True


def salvar_resultado_semanal(unidade, periodo_inicio_iso, periodo_fim_iso, cmv, promo_loja):
    """Grava CMV/promoção de uma semana **sobrescrevendo** o que estiver lá.
    Diferente de `salvar_resultado_semanal_se_ausente` (usada na importação,
    que nunca mexe no que já existe) porque aqui é edição feita à mão na
    tela: se a pessoa está digitando, ela quer trocar o valor."""
    with conexao() as conn:
        conn.execute(
            """
            INSERT INTO resultado_semanal
                (unidade, periodo_inicio, periodo_fim, cmv, promo_loja, criado_em)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (unidade, periodo_inicio) DO UPDATE SET
                periodo_fim = excluded.periodo_fim,
                cmv = excluded.cmv,
                promo_loja = excluded.promo_loja
            """,
            (unidade, periodo_inicio_iso, periodo_fim_iso, cmv, promo_loja, datetime.now().isoformat()),
        )


def salvar_resultado_semanal_se_ausente(unidade, periodo_inicio_iso, periodo_fim_iso, cmv, promo_loja):
    """CMV/promoção de uma semana, mesmo espírito de
    `salvar_faturamento_canal_semanal_se_ausente`: nunca sobrescreve o que
    já está gravado."""
    with conexao() as conn:
        existente = conn.execute(
            "SELECT 1 FROM resultado_semanal WHERE unidade = ? AND periodo_inicio = ?",
            (unidade, periodo_inicio_iso),
        ).fetchone()
        if existente:
            return False
        conn.execute(
            """
            INSERT INTO resultado_semanal
                (unidade, periodo_inicio, periodo_fim, cmv, promo_loja, criado_em)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (unidade, periodo_inicio_iso, periodo_fim_iso, cmv, promo_loja, datetime.now().isoformat()),
        )
        return True


# Faixas de %CMV que o chefe da Julia usa na planilha (a fórmula da coluna
# FATOR é IF(<0.31,"ÓTIMO", IF(<0.34,"BOM","RUIM"))).
CMV_OTIMO_ATE = 0.31
CMV_BOM_ATE = 0.34


def _classificar_cmv(pct):
    if pct is None:
        return None
    if pct < CMV_OTIMO_ATE:
        return "otimo"
    if pct < CMV_BOM_ATE:
        return "bom"
    return "ruim"


def _semanas_do_faturamento_diario(unidade):
    """Faturamento por canal de cada dia já sincronizado, agrupado por dia —
    matéria-prima pra montar a semana sem depender da planilha. Com os mesmos
    acertos das Vendas Diárias e da Home (2026-09-18, a semana não batia com
    a planilha): o ajuste manual de canal vence o valor sincronizado, e a
    venda presencial lançada à mão entra como Presencial ("portal")."""
    with conexao() as conn:
        linhas = conn.execute(
            "SELECT dia, canal, faturamento FROM faturamento_canal WHERE unidade = ?",
            (unidade,),
        ).fetchall()
        ajustes = conn.execute(
            "SELECT dia, canal, faturamento FROM ajuste_faturamento_canal WHERE unidade = ?",
            (unidade,),
        ).fetchall()
        presencial = conn.execute(
            "SELECT dia, valor FROM venda_presencial WHERE unidade = ?",
            (unidade,),
        ).fetchall()
    por_dia = {}
    for linha in linhas:
        por_dia.setdefault(linha["dia"], {})[linha["canal"]] = linha["faturamento"]
    for ajuste in ajustes:
        por_dia.setdefault(ajuste["dia"], {})[ajuste["canal"]] = ajuste["faturamento"]
    for venda in presencial:
        canais = por_dia.setdefault(venda["dia"], {})
        canais["portal"] = round(canais.get("portal", 0.0) + venda["valor"], 2)
    return por_dia


def _dias_do_periodo(inicio_iso, fim_iso):
    inicio = datetime.fromisoformat(inicio_iso).date()
    fim = datetime.fromisoformat(fim_iso).date()
    return [(inicio + timedelta(days=i)).isoformat() for i in range((fim - inicio).days + 1)]


def listar_resultado_semanal(unidade):
    """Semana a semana dessa loja, com faturamento por canal, CMV, %CMV,
    classificação e variação em relação à semana anterior.

    O faturamento de cada semana vem do dado diário que o próprio AdmFood
    sincroniza da Cardápio Web sempre que ele cobre a semana inteira; só cai
    na planilha importada quando o sistema ainda não tinha esse período (o
    histórico antigo, anterior à sincronização). Cada semana volta com
    `origem` dizendo de onde veio, pra diferença ficar visível em vez de
    virar um número sem procedência.

    %CMV, classificação e variação são calculados aqui, nunca copiados da
    planilha — a planilha calcula os dela com um total que, nas semanas mais
    antigas, não somava o 99 Food."""
    with conexao() as conn:
        canais_planilha = conn.execute(
            """
            SELECT periodo_inicio, periodo_fim, canal, faturamento
            FROM faturamento_canal_semanal WHERE unidade = ?
            """,
            (unidade,),
        ).fetchall()
        resultados = conn.execute(
            "SELECT periodo_inicio, periodo_fim, cmv, promo_loja FROM resultado_semanal WHERE unidade = ?",
            (unidade,),
        ).fetchall()

    periodos = {}
    for linha in canais_planilha:
        info = periodos.setdefault(linha["periodo_inicio"], {
            "periodoFim": linha["periodo_fim"], "canais": {},
        })
        info["canais"][linha["canal"]] = linha["faturamento"]
    for linha in resultados:
        periodos.setdefault(linha["periodo_inicio"], {"periodoFim": linha["periodo_fim"], "canais": {}})

    extras = {l["periodo_inicio"]: l for l in resultados}
    faturamento_diario = _semanas_do_faturamento_diario(unidade)

    # Semanas que o sistema já tem por conta própria e a planilha não
    # cobre: agrupa em semana cheia de TERÇA A SEGUNDA, como a planilha delas
    # (segunda as lojas fecham, a semana começa quando reabrem), a partir do
    # dia seguinte ao fim do que veio da planilha. Era de segunda a domingo e
    # a semana depois da planilha saía "07/09 a 13/09", repetindo o feriado
    # de 07/09 que já estava na semana anterior (2026-09-18).
    ultimo_fim = max((info["periodoFim"] for info in periodos.values()), default=None)
    for dia in sorted(faturamento_diario):
        if ultimo_fim and dia <= ultimo_fim:
            continue
        data = datetime.fromisoformat(dia).date()
        inicio = data - timedelta(days=(data.weekday() - 1) % 7)
        fim = inicio + timedelta(days=6)
        periodos.setdefault(inicio.isoformat(), {"periodoFim": fim.isoformat(), "canais": {}})

    semanas = []
    for periodo_inicio in sorted(periodos):
        info = periodos[periodo_inicio]
        periodo_fim = info["periodoFim"]
        dias = _dias_do_periodo(periodo_inicio, periodo_fim)
        cobertos = [d for d in dias if d in faturamento_diario]

        # Usa o dado diário quando ele cobre a semana inteira, ou quando a
        # planilha não tem essa semana (é o caso da semana em andamento, que
        # a planilha só vai ter na semana que vem — mostrar o que já entrou
        # é melhor que mostrar R$ 0,00).
        if cobertos and (len(cobertos) == len(dias) or not info["canais"]):
            canais = {}
            for dia in cobertos:
                for canal, valor in faturamento_diario[dia].items():
                    canais[canal] = round(canais.get(canal, 0.0) + valor, 2)
            origem = "sistema"
        else:
            canais = dict(info["canais"])
            origem = "planilha"

        total = round(sum(canais.values()), 2)
        extra = extras.get(periodo_inicio)
        cmv = extra["cmv"] if extra else None
        promo = extra["promo_loja"] if extra else None
        pct = round(cmv / total, 4) if (cmv is not None and total) else None
        # Semana gerada a partir do calendário mas ainda sem venda nenhuma
        # (nem no diário, nem na planilha) não é informação — é linha vazia.
        if not canais and cmv is None:
            continue

        semanas.append({
            "periodoInicio": periodo_inicio,
            "periodoFim": periodo_fim,
            "canais": canais,
            "total": total,
            "cmv": cmv,
            "promoLoja": promo,
            "pctCmv": pct,
            "classificacao": _classificar_cmv(pct),
            "origem": origem,
            "diasComDadoDiario": len(cobertos),
            "diasNoPeriodo": len(dias),
        })

    # Variação em relação à semana anterior — calculada na ordem cronológica
    # e só entre semanas vizinhas de verdade.
    for anterior, atual in zip(semanas, semanas[1:]):
        for campo, chave in (("total", "variacaoTotal"), ("cmv", "variacaoCmv")):
            base, novo = anterior[campo], atual[campo]
            atual[chave] = round((novo - base) / base, 4) if (base and novo is not None) else None

    semanas.reverse()  # mais recente primeiro, que é como a tela lê
    return semanas


def listar_faturamento_canal_semanal(unidade):
    """Uma linha por semana já importada dessa loja, mais recente primeiro,
    com o faturamento de cada canal agrupado (None pro canal que a planilha
    não trazia naquela semana, ex: 99Food antes da loja operar nesse canal)."""
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT periodo_inicio, periodo_fim, canal, faturamento
            FROM faturamento_canal_semanal
            WHERE unidade = ?
            ORDER BY periodo_inicio DESC, canal
            """,
            (unidade,),
        ).fetchall()

    semanas = {}
    for linha in linhas:
        chave = (linha["periodo_inicio"], linha["periodo_fim"])
        semana = semanas.setdefault(chave, {
            "periodoInicio": linha["periodo_inicio"],
            "periodoFim": linha["periodo_fim"],
            "canais": {},
        })
        semana["canais"][linha["canal"]] = linha["faturamento"]

    resultado = []
    for (inicio, fim), semana in semanas.items():
        total = round(sum(semana["canais"].values()), 2)
        resultado.append({**semana, "total": total})
    resultado.sort(key=lambda s: s["periodoInicio"], reverse=True)
    return resultado


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

def tarefa_visivel_para(tarefa_id, usuario_id):
    """Card particular de outra pessoa não existe pra quem não é dono."""
    with conexao() as conn:
        linha = conn.execute("SELECT visivel_para FROM tarefa WHERE id = ?", (tarefa_id,)).fetchone()
    return bool(linha) and linha["visivel_para"] in (None, usuario_id)


def listar_tarefas(usuario_id=None):
    """Cards da equipe toda + os particulares de `usuario_id`."""
    with conexao() as conn:
        tarefas = [dict(t) for t in conn.execute(
            "SELECT * FROM tarefa WHERE visivel_para IS NULL OR visivel_para = ? ORDER BY criado_em DESC",
            (usuario_id,),
        ).fetchall()]
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


def criar_tarefa(titulo, descricao, categoria, prioridade, data_limite, visivel_para=None):
    """`visivel_para`: id do usuário, pra card particular ("Só eu vejo este
    card"); None = a equipe toda."""
    agora = datetime.now().isoformat()
    with conexao() as conn:
        cursor = conn.execute(
            """
            INSERT INTO tarefa (titulo, descricao, categoria, prioridade, status, data_limite, criado_em, atualizado_em, visivel_para)
            VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?)
            """,
            (titulo, descricao, categoria, prioridade, data_limite, agora, agora, visivel_para),
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

def criar_usuario(nome, email, senha_hash, papel="operacao", loja=None):
    agora = datetime.now().isoformat()
    with conexao() as conn:
        cursor = conn.execute(
            "INSERT INTO usuario (nome, email, senha_hash, papel, loja, ativo, criado_em) VALUES (?, ?, ?, ?, ?, 1, ?)",
            (nome, email.strip().lower(), senha_hash, papel, loja or None, agora),
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
                    ordem = excluded.ordem,
                    manual = 0
                """,
                linha,
            )

        produtos_por_loja = {}
        for linha in linhas:
            produtos_por_loja.setdefault(linha['loja'], []).append(linha['produto'])
        for loja, produtos in produtos_por_loja.items():
            marcadores = ", ".join("?" * len(produtos))
            # Produto criado na tela fica: ele nunca esteve na planilha.
            conn.execute(
                f"DELETE FROM preco_cardapio WHERE loja = ? AND manual = 0 AND produto NOT IN ({marcadores})",
                [loja] + produtos,
            )


def adicionar_produto_ao_cardapio(loja, produto, categoria):
    """Coloca um produto criado pelo "Novo item" no cardápio da loja, sem
    preço (ela preenche na tela). Sem isso ele era criado mas nunca
    aparecia: a tela de Cardápio lista o que está em preco_cardapio. Se o
    produto já está no cardápio dessa loja, não mexe."""
    with conexao() as conn:
        ordem = conn.execute(
            "SELECT COALESCE(MAX(ordem), 0) + 1 FROM preco_cardapio WHERE loja = ?", (loja,)
        ).fetchone()[0]
        conn.execute(
            """
            INSERT INTO preco_cardapio (loja, categoria, produto, ordem, manual)
            VALUES (?, ?, ?, ?, 1)
            ON CONFLICT(loja, produto) DO NOTHING
            """,
            (loja, categoria, produto, ordem),
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


_SUFIXO_PARENTESES = re.compile(r"\s*\([^)]*\)\s*$")


def _casar_item_cardapio(nome_vendido, catalogo_normalizado, vinculos_manuais=None, ignorar_parenteses=False):
    """catalogo_normalizado: {nome_normalizado: id}. vinculos_manuais (Etapa
    0 do motor de compra, 2026-09-08): {nome_normalizado: {"itemCardapioId",
    "quantidadePorUnidade"}} vindo de `vinculo_produto_venda` — checado ANTES
    de qualquer coisa, porque é uma decisão humana e ganha do algoritmo
    automático mesmo que ele também acertasse. Sem vínculo manual, tenta o
    nome vendido inteiro (tira acento/maiúscula/pontuação, mesmo critério de
    _normalizar_nome_insumo — nomes vêm da Cardápio Web, cadastro na Ficha
    Técnica é manual, não bate exatamente). Se não bater e o nome vendido
    tiver um "- subtítulo" de marketing colado (comum na Cardápio Web, ex:
    "Tasty Bacon - releitura do Big Tasty"), tenta de novo só com a parte
    antes do traço.

    Retorna (item_cardapio_id ou None, multiplicador) — multiplicador só é
    diferente de 1 quando vem de um vínculo manual (ex: "2 smash's
    tradicionais" = multiplicador 2)."""
    nome_normalizado = _normalizar_nome_insumo(nome_vendido)
    if vinculos_manuais and nome_normalizado in vinculos_manuais:
        vinculo = vinculos_manuais[nome_normalizado]
        return vinculo["itemCardapioId"], vinculo["quantidadePorUnidade"]
    candidato = catalogo_normalizado.get(nome_normalizado)
    if candidato:
        return candidato, 1
    if " - " in nome_vendido:
        prefixo, sufixo = nome_vendido.split(" - ", 1)[0], nome_vendido.rsplit(" - ", 1)[1]
        candidato = catalogo_normalizado.get(_normalizar_nome_insumo(prefixo))
        if candidato:
            return candidato, 1
        # A Tradiça vende "Hot Dog com Bacon - Beicão": o nome do item vem
        # depois do traço.
        candidato = catalogo_normalizado.get(_normalizar_nome_insumo(sufixo))
        if candidato:
            return candidato, 1
    # Combo "Lanche + Batata + Bebida" gravado antes de a leitura do pedido
    # cortar o nome no " + " (o "monte o seu" do Açaí é um produto só).
    if " + " in nome_vendido and not re.search(r"\+\s*\d+\s*complementos?\b", nome_vendido, re.IGNORECASE):
        candidato = catalogo_normalizado.get(_normalizar_nome_insumo(nome_vendido.split(" + ", 1)[0]))
        if candidato:
            return candidato, 1
    # Só pra lista de preços: lá "Calabreso (com Calabresa)" é o "Calabreso"
    # que a Cardápio Web vende — o parêntese é descrição. Nas VENDAS fica
    # desligado, porque no Artesanos o parêntese muda o produto ("BACON
    # (duplo)" não é o BACON simples): na dúvida, a venda vai pra fila de
    # pendências em vez de descontar a receita errada calada.
    if ignorar_parenteses:
        sem_parenteses = _SUFIXO_PARENTESES.sub("", nome_vendido).strip()
        candidato = catalogo_normalizado.get(_normalizar_nome_insumo(sem_parenteses))
        if candidato:
            return candidato, 1
    return None, 1


def _com_apelidos(catalogo, itens):
    """Catálogo + o nome curto de cada item: o que vem antes do " - " e o
    nome sem o parêntese do fim. Em produção os itens têm o nome da lista de
    preços ("Clássico - Cheese Salada", "Veg (vegetariano)", "Creme de Avelã
    - Dorella") e a Cardápio Web vende o curto ("CLASSICO", "Veg", "Creme de
    Avelã") — sem isso, desde 08/09 as vendas dos lanches do Artesanos não
    casavam e não descontavam estoque (achado em 11/09/2026). Só entra
    apelido que aponta pra um item só e não é o nome inteiro de outro."""
    candidatos = {}
    for item in itens:
        nome = item["nome"]
        for apelido in (nome.split(" - ", 1)[0] if " - " in nome else None,
                        _SUFIXO_PARENTESES.sub("", nome).strip()):
            chave = _normalizar_nome_insumo(apelido) if apelido and apelido != nome else None
            if chave and chave not in catalogo:
                candidatos.setdefault(chave, set()).add(item["id"])
    return {**catalogo, **{chave: next(iter(ids)) for chave, ids in candidatos.items() if len(ids) == 1}}


def _catalogo_e_vinculos(conn):
    """O que _casar_item_cardapio precisa: {nome normalizado: item_id} pra
    venda de produto e pra complemento — cada um com os apelidos só do seu
    tipo, pra um adicional "Bacon" nunca virar o lanche BACON — e os
    vínculos manuais da fila de pendências."""
    itens = conn.execute("SELECT id, nome, tipo FROM item_cardapio").fetchall()
    catalogo = {_normalizar_nome_insumo(linha["nome"]): linha["id"] for linha in itens}
    vinculos_manuais = {
        linha["nome_produto_normalizado"]: {
            "itemCardapioId": linha["item_cardapio_id"],
            "quantidadePorUnidade": linha["quantidade_por_unidade"],
        }
        for linha in conn.execute(
            "SELECT nome_produto_normalizado, item_cardapio_id, quantidade_por_unidade FROM vinculo_produto_venda"
        ).fetchall()
    }
    produtos = _com_apelidos(catalogo, [i for i in itens if i["tipo"] != "complemento"])
    complementos = _com_apelidos(catalogo, [i for i in itens if i["tipo"] == "complemento"])
    return produtos, complementos, vinculos_manuais


def _recasar_vendas_sem_item(conn, unidade):
    """Venda gravada antes de o item existir (ou antes do vínculo manual)
    ficou sem item_cardapio_id, e só casaria de novo quando o dia fosse
    sincronizado outra vez — a reconferência automática só volta 7 dias.
    Aqui casa com o catálogo e os vínculos de hoje, pelo mesmo critério da
    sincronização. Sem isso a fila de pendências mostrava como pendente o
    "Tradiça Duplo" que já tinha ficha, só porque foi vendido antes dela."""
    catalogo, catalogo_complementos, vinculos = _catalogo_e_vinculos(conn)
    for linha in conn.execute(
        "SELECT DISTINCT nome_produto FROM venda_item WHERE unidade = ? AND item_cardapio_id IS NULL", (unidade,)
    ).fetchall():
        item_id, multiplicador = _casar_item_cardapio(linha["nome_produto"], catalogo, vinculos)
        if item_id:
            conn.execute(
                "UPDATE venda_item SET item_cardapio_id = ?, multiplicador = ? "
                "WHERE unidade = ? AND nome_produto = ? AND item_cardapio_id IS NULL",
                (item_id, multiplicador, unidade, linha["nome_produto"]),
            )
    for linha in conn.execute(
        "SELECT DISTINCT nome_complemento FROM venda_complemento WHERE unidade = ? AND item_cardapio_id IS NULL", (unidade,)
    ).fetchall():
        item_id, _ = _casar_item_cardapio(linha["nome_complemento"], catalogo_complementos, vinculos)
        if item_id:
            conn.execute(
                "UPDATE venda_complemento SET item_cardapio_id = ? "
                "WHERE unidade = ? AND nome_complemento = ? AND item_cardapio_id IS NULL",
                (item_id, unidade, linha["nome_complemento"]),
            )


# Complemento pedido separado da lata (grupo "Extras separados do NaLata")
# vai num pote: 30 ml pra granola e ovomaltine, 60 ml pro resto (Julia,
# 2026-09-10/11). O pote vira mais uma linha de complemento, que casa com o
# item "Pote 30ml (separado)" / "Pote 60ml (separado)" — a ficha dele é o
# pote. A porção do separado fica em porcao_complemento_item com
# produto_item_id = PRODUTO_SEPARADO (Banana 60 g, Granola 30 g); sem ela,
# vale a porção de dentro da lata daquele produto.
PRODUTO_SEPARADO = 0
COMPLEMENTOS_POTE_30ML = {"granola", "ovomaltine"}


def _eh_separado(grupo):
    return "separad" in (grupo or "").lower()


def _pote_do_separado(nome_complemento):
    # O cardápio passou a chamar o extra de "Ovomaltine separado" (visto em
    # 17/09): o "separado" do nome não conta pra escolher o pote, senão
    # granola e ovomaltine iam pro de 60 ml.
    nome = re.sub(r"\s+separad[oa]s?$", "", _normalizar_nome_insumo(nome_complemento))
    pote = "30ml" if nome in COMPLEMENTOS_POTE_30ML else "60ml"
    return f"Pote {pote} (separado)"


# Carne em dobro (promo de terça do Artesanos; regra da Julia em 2026-09-15):
# vale pra qualquer lanche — o de uma carne vai com duas, o de duas vai com
# quatro. A venda vem numa linha solta ("terça é Carne em Dobro"), vinculada
# a um item cuja ficha é UMA carne; na hora de gravar o pedido, o
# multiplicador dessa linha vira a média de carnes dos lanches do mesmo
# pedido, pra a baixa descontar a carne certa.
_CARNE_EM_DOBRO = "carne em dobro"


def _carnes_por_lanche(conn, unidade, carne_item_id, itens_casados):
    """Média de carnes por lanche do pedido, medida pela ficha técnica: o
    quanto cada lanche leva da carne da ficha do "carne em dobro", dividido
    pelo quanto essa ficha leva (o tempero não conta: a carne é o insumo de
    maior peso da ficha). `itens_casados` = [(item_cardapio_id, quantidade)].
    None quando não dá pra medir — sem ficha, ou nenhum lanche com essa carne
    no pedido; aí vale o multiplicador do vínculo."""
    def ficha(item_id):
        return {
            linha["insumo_id"]: linha["quantidade"] or 0
            for linha in conn.execute(
                "SELECT insumo_id, quantidade FROM ficha_tecnica WHERE item_id = ? AND loja = ?",
                (item_id, unidade),
            )
        }

    ficha_carne = ficha(carne_item_id)
    if not ficha_carne:
        return None
    marcadores = ",".join("?" * len(ficha_carne))
    unidades = {
        linha["id"]: (linha["unidade_medida"] or "").lower()
        for linha in conn.execute(f"SELECT id, unidade_medida FROM insumo WHERE id IN ({marcadores})", list(ficha_carne))
    }
    carne_id = max(ficha_carne, key=lambda i: ficha_carne[i] * (1000 if unidades.get(i) in ("kg", "l") else 1))
    por_carne = ficha_carne[carne_id]
    if not por_carne:
        return None

    carnes = lanches = 0.0
    for item_id, quantidade in itens_casados:
        if not item_id or item_id == carne_item_id:
            continue
        carnes_do_lanche = ficha(item_id).get(carne_id, 0) / por_carne
        if carnes_do_lanche > 0:
            carnes += carnes_do_lanche * quantidade
            lanches += quantidade
    return round(carnes / lanches, 4) if lanches else None


def salvar_itens_vendidos_do_dia(unidade, dia_iso, pedidos_detalhados):
    """Grava quais itens de cardápio foram vendidos em cada pedido do dia,
    casando pelo nome com item_cardapio (ver _casar_item_cardapio — nomes vêm
    da Cardápio Web, cadastro na Ficha Técnica é manual, então não é garantido
    bater exatamente). Mesmo padrão de salvar_pedidos_do_dia: resincroniza o
    dia inteiro. Sem match, item_cardapio_id fica NULL mas a linha é salva
    do mesmo jeito, com o nome bruto — vira histórico utilizável assim que
    o item for cadastrado na Ficha Técnica.

    Etapa 0 do motor de compra (2026-09-08): depois de gravar, dispara a
    baixa automática de estoque pra Hamburgueria Artesanos (única loja com
    Ficha Técnica completa o suficiente por enquanto — ver
    aplicar_baixa_estoque_dia)."""
    with conexao() as conn:
        catalogo, catalogo_complementos, vinculos_manuais = _catalogo_e_vinculos(conn)
        conn.execute(
            "DELETE FROM venda_item WHERE unidade = ? AND dia = ?",
            (unidade, dia_iso),
        )
        conn.execute(
            "DELETE FROM venda_complemento WHERE unidade = ? AND dia = ?",
            (unidade, dia_iso),
        )
        for pedido in pedidos_detalhados:
            itens_pedido = pedido.get("itens", [])
            casados = [_casar_item_cardapio(item["nome"], catalogo, vinculos_manuais) for item in itens_pedido]
            for indice, item in enumerate(itens_pedido):
                # Complemento casa pelo mesmo critério do produto (nome
                # normalizado + vínculo manual pros erros de digitação da
                # Cardápio Web, tipo "Chocoboll"). Sem casar, fica guardado
                # com item_cardapio_id nulo e não desconta nada.
                linhas_complemento = []
                for complemento in item.get("complementos") or []:
                    linhas_complemento.append(complemento)
                    if _eh_separado(complemento.get("grupo")):
                        linhas_complemento.append({
                            "nome": _pote_do_separado(complemento["nome"]),
                            "quantidade": complemento["quantidade"],
                            "grupo": complemento.get("grupo"),
                        })
                for ordem, complemento in enumerate(linhas_complemento):
                    complemento_id, _ = _casar_item_cardapio(complemento["nome"], catalogo_complementos, vinculos_manuais)
                    conn.execute(
                        """
                        INSERT INTO venda_complemento
                            (unidade, pedido_id, linha, ordem, dia, nome_complemento, nome_normalizado,
                             grupo, quantidade, preco_unitario, item_cardapio_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            unidade, pedido["id"], indice, ordem, dia_iso, complemento["nome"],
                            _normalizar_nome_insumo(complemento["nome"]), complemento.get("grupo"),
                            complemento["quantidade"], complemento.get("preco") or 0.0, complemento_id,
                        ),
                    )
                item_cardapio_id, multiplicador = casados[indice]
                if item_cardapio_id and _CARNE_EM_DOBRO in _normalizar_nome_insumo(item["nome"]):
                    carnes = _carnes_por_lanche(
                        conn, unidade, item_cardapio_id,
                        [(casado[0], outro["quantidade"]) for casado, outro in zip(casados, itens_pedido)],
                    )
                    if carnes:
                        multiplicador = carnes
                conn.execute(
                    """
                    INSERT INTO venda_item
                        (unidade, pedido_id, linha, dia, canal, nome_produto, quantidade, item_cardapio_id,
                         multiplicador, nome_normalizado, tipo_pedido)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        multiplicador,
                        _normalizar_nome_insumo(item["nome"]),
                        pedido.get("tipo"),
                    ),
                )

    # Só nas lojas com a baixa ligada (inicio_baixa_automatica) — nas outras
    # a própria função não faz nada.
    aplicar_baixa_estoque_dia(unidade, dia_iso)


# Venda -> item de Ficha Técnica, contando as três formas de chegar lá: o
# produto vendido direto (item_cardapio_id preenchido), o combo, que não é
# um produto de receita e sim a soma de vários (composicao_produto_venda), e
# o complemento escolhido no pedido (venda_complemento — cada complemento
# tem a própria ficha, ex: "Leite condensado" = 70 g).
# Usada pela baixa de estoque e pelo consumo médio, pra não existirem duas
# definições de "quanto saiu".
#
# Complemento com porção própria no produto (porcao_complemento_item)
# escala a ficha dele: ficha do Morango = 50 g, no Frutas ao Creme 500 a
# porção é 70 g -> desconta 1,4 ficha. Precisa saber quantos gramas a ficha
# do complemento soma — SQL_GRAMAS_DA_FICHA; sem dar pra converter (insumo
# em "un" sem conteúdo cadastrado), vale a ficha normal.
SQL_GRAMAS_DA_FICHA = """
    SELECT f.item_id, f.loja,
           CASE WHEN SUM(CASE WHEN LOWER(i.unidade_medida) IN ('g', 'ml', 'kg', 'l')
                                OR i.conteudo_por_unidade IS NOT NULL THEN 0 ELSE 1 END) > 0
                THEN NULL
                ELSE SUM(f.quantidade * CASE
                    WHEN LOWER(i.unidade_medida) IN ('g', 'ml') THEN 1
                    WHEN LOWER(i.unidade_medida) IN ('kg', 'l') THEN 1000
                    ELSE i.conteudo_por_unidade END)
           END AS gramas
    FROM ficha_tecnica f
    JOIN insumo i ON i.id = f.insumo_id
    WHERE f.quantidade IS NOT NULL
    GROUP BY f.item_id, f.loja
"""

# Pedido que sai da loja leva a embalagem pra viagem: delivery e retirada
# (order_type da Cardápio Web). Venda gravada antes de o tipo ser guardado
# (2026-09-16) cai no canal: iFood, 99Food e o cardápio digital são sempre
# delivery ou retirada; balcão (portal) e totem ficam sem. {v} = alias da
# venda_item com ponto, ou vazio.
_SQL_PRA_VIAGEM = (
    "COALESCE({v}tipo_pedido IN ('delivery', 'takeout'), "
    "{v}canal IN ('ifood', 'food99', 'catalog'))"
)
_PRA_VIAGEM_VENDA = _SQL_PRA_VIAGEM.format(v="")
_PRA_VIAGEM_V = _SQL_PRA_VIAGEM.format(v="v.")

SQL_ITENS_CONSUMIDOS = f"""
    SELECT unidade, dia, item_cardapio_id AS item_id,
           quantidade * multiplicador AS quantidade,
           {_PRA_VIAGEM_VENDA} AS pra_viagem
    FROM venda_item
    WHERE item_cardapio_id IS NOT NULL
    UNION ALL
    SELECT v.unidade, v.dia, c.item_cardapio_id AS item_id,
           v.quantidade * v.multiplicador * c.quantidade AS quantidade,
           {_PRA_VIAGEM_V} AS pra_viagem
    FROM venda_item v
    JOIN composicao_produto_venda c
      ON c.nome_produto_normalizado = v.nome_normalizado
    WHERE v.item_cardapio_id IS NULL
    UNION ALL
    SELECT c.unidade, c.dia, c.item_cardapio_id AS item_id,
           c.quantidade * COALESCE(COALESCE(s.gramas, p.gramas) / NULLIF(g.gramas, 0), 1) AS quantidade,
           COALESCE({_PRA_VIAGEM_V}, 0) AS pra_viagem
    FROM venda_complemento c
    -- Pedido separado da lata (Banana separada = 60 g): porção própria,
    -- guardada com produto 0; sem ela, vale a porção do produto.
    LEFT JOIN porcao_complemento_item s
      ON s.loja = c.unidade AND s.produto_item_id = 0 AND s.complemento_item_id = c.item_cardapio_id
     AND LOWER(COALESCE(c.grupo, '')) LIKE '%separad%'
    LEFT JOIN venda_item v
      ON v.unidade = c.unidade AND v.pedido_id = c.pedido_id AND v.linha = c.linha
    -- Combo com composição (Combo Filhinho = 2 "NaLata 500ml + 3
    -- complementos"): os toppings dele usam a porção do produto de dentro.
    LEFT JOIN (SELECT nome_produto_normalizado, MIN(item_cardapio_id) AS item_id
               FROM composicao_produto_venda GROUP BY nome_produto_normalizado) cp
      ON v.item_cardapio_id IS NULL AND cp.nome_produto_normalizado = v.nome_normalizado
    LEFT JOIN porcao_complemento_item p
      ON p.loja = c.unidade AND p.produto_item_id = COALESCE(v.item_cardapio_id, cp.item_id)
     AND p.complemento_item_id = c.item_cardapio_id
    LEFT JOIN ({SQL_GRAMAS_DA_FICHA}) g
      ON g.item_id = c.item_cardapio_id AND g.loja = c.unidade
    WHERE c.item_cardapio_id IS NOT NULL
"""

# Insumo gasto nas vendas, por loja e dia: a Ficha Técnica em todo pedido e a
# embalagem pra viagem só no que sai da loja. Base da baixa de estoque e do
# consumo médio.
SQL_INSUMOS_CONSUMIDOS = f"""
    SELECT v.unidade, v.dia, r.insumo_id, v.quantidade * r.quantidade AS quantidade
    FROM ({SQL_ITENS_CONSUMIDOS}) v
    JOIN (
        SELECT item_id, loja, insumo_id, quantidade, 0 AS so_pra_viagem FROM ficha_tecnica
        UNION ALL
        SELECT item_id, loja, insumo_id, quantidade, 1 AS so_pra_viagem FROM embalagem_viagem
    ) r ON r.item_id = v.item_id AND r.loja = v.unidade
    WHERE r.quantidade IS NOT NULL AND (r.so_pra_viagem = 0 OR v.pra_viagem = 1)
"""


def inicio_baixa_automatica():
    """{loja: primeiro dia da baixa automática} das lojas com ela ligada.
    Quem liga e desliga é a Julia, na tela (Estoque → Integrações do
    Estoque), quando a ficha técnica da loja estiver pronta — o Açaí ia
    começar em 11/09/2026 e ela pediu pra esperar a ficha ficar 100%.

    Venda anterior ao dia de início nunca desconta estoque, venha a
    sincronização de onde vier: o estoque atual já reflete aquele consumo
    (foi contado depois), então descontar de novo tiraria o mesmo produto
    duas vezes. Antes dessa trava, carregar 90 dias de histórico
    (sincronizar_periodo.py) ou ressincronizar um dia antigo pela tela
    descontava meses de consumo do estoque de hoje."""
    with conexao() as conn:
        return {
            linha["loja"]: linha["inicio"]
            for linha in conn.execute(
                "SELECT loja, inicio FROM baixa_automatica_loja WHERE inicio IS NOT NULL"
            ).fetchall()
        }


def definir_inicio_baixa_automatica(loja, inicio, alterado_por):
    """Liga a baixa automática da loja a partir de `inicio` ('AAAA-MM-DD')
    ou desliga (None). Desligar não devolve o que já foi descontado: só as
    vendas seguintes deixam de descontar."""
    with conexao() as conn:
        conn.execute(
            """
            INSERT INTO baixa_automatica_loja (loja, inicio, alterado_em, alterado_por)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (loja) DO UPDATE SET
                inicio = excluded.inicio,
                alterado_em = excluded.alterado_em,
                alterado_por = excluded.alterado_por
            """,
            (loja, inicio, datetime.now().isoformat(), alterado_por),
        )


def aplicar_baixa_estoque_dia(unidade, dia_iso):
    """Etapa 0 do motor de compra (2026-09-08): desconta de
    estoque_insumo.quantidade_atual o consumo teórico do dia (venda ×
    Ficha Técnica, mais a embalagem pra viagem — SQL_INSUMOS_CONSUMIDOS, o
    mesmo de consumo_medio_insumo, só que pra um dia só). Idempotente:
    guarda o total já descontado em baixa_estoque_venda
    e só aplica a DIFERENÇA em relação à última vez — resincronizar o
    mesmo dia (acontece a cada 15 min pra hoje, toda madrugada pra ontem)
    não desconta em dobro, e uma venda cancelada/corrigida entre
    sincronizações corrige o estoque pra cima ou pra baixo sozinha.

    Deixa o estoque ir negativo de propósito — é sinal real de
    divergência entre teórico e físico (quebra, porcionamento diferente,
    Ficha Técnica desatualizada), não é erro pra esconder."""
    inicio = inicio_baixa_automatica().get(unidade)
    if inicio is None or dia_iso < inicio:
        return
    agora = datetime.now().isoformat()
    with conexao() as conn:
        consumo_novo = {
            linha["insumo_id"]: linha["total"]
            for linha in conn.execute(
                f"""
                SELECT insumo_id, SUM(quantidade) AS total
                FROM ({SQL_INSUMOS_CONSUMIDOS})
                WHERE unidade = ? AND dia = ?
                GROUP BY insumo_id
                """,
                (unidade, dia_iso),
            ).fetchall()
        }
        # Mistura feita na casa não tem baixa própria: vira os ingredientes
        # dela (vendeu batata -> sal, páprica, açúcar). No primeiro dia com a
        # receita cadastrada, a diferença abaixo devolve ao estoque o tempero
        # que tinha sido descontado e desconta os ingredientes no lugar.
        consumo_novo = explodir_receitas_em_ingredientes(consumo_novo, mapa_receita_insumo())
        consumo_anterior = {
            linha["insumo_id"]: linha["quantidade_baixada"]
            for linha in conn.execute(
                "SELECT insumo_id, quantidade_baixada FROM baixa_estoque_venda WHERE unidade = ? AND dia = ?",
                (unidade, dia_iso),
            ).fetchall()
        }
        for insumo_id in set(consumo_novo) | set(consumo_anterior):
            novo = consumo_novo.get(insumo_id, 0.0)
            anterior = consumo_anterior.get(insumo_id, 0.0)
            diferenca = novo - anterior
            if diferenca:
                # Ingrediente que a loja nunca tinha usado direto (o sal que
                # agora sai do Tempero Batata) pode não ter linha de estoque
                # lá — sem ela o UPDATE não pegaria nada e a baixa sumiria
                # calada. Cria zerada e vincula à loja: fica negativo, que é
                # o sinal certo de "precisa contar".
                conn.execute(
                    "INSERT OR IGNORE INTO estoque_insumo (insumo_id, loja, quantidade_atual, estoque_minimo, atualizado_em) "
                    "VALUES (?, ?, 0, 0, ?)",
                    (insumo_id, unidade, agora),
                )
                conn.execute("INSERT OR IGNORE INTO insumo_loja (insumo_id, loja) VALUES (?, ?)", (insumo_id, unidade))
                conn.execute(
                    "UPDATE estoque_insumo SET quantidade_atual = quantidade_atual - ?, atualizado_em = ? "
                    "WHERE insumo_id = ? AND loja = ?",
                    (diferenca, agora, insumo_id, unidade),
                )
            conn.execute(
                """
                INSERT INTO baixa_estoque_venda (unidade, dia, insumo_id, quantidade_baixada)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (unidade, dia, insumo_id) DO UPDATE SET quantidade_baixada = excluded.quantidade_baixada
                """,
                (unidade, dia_iso, insumo_id, novo),
            )


def listar_produtos_pendentes(unidade, dias=30):
    """Produtos vendidos nos últimos N dias que ainda não têm como virar
    baixa de estoque — fila de pendência da Etapa 0 (painel de integrações
    do estoque). Sai da fila tanto quem casou com um item de Ficha Técnica
    quanto o combo que já teve a composição definida. Agrupado por nome (o
    mesmo prato costuma aparecer várias vezes). Antes de listar, casa de
    novo o que foi vendido antes de o item existir (_recasar_vendas_sem_item)."""
    inicio = (datetime.now().date() - timedelta(days=dias)).isoformat()
    with conexao() as conn:
        _recasar_vendas_sem_item(conn, unidade)
        linhas = conn.execute(
            """
            SELECT nome_produto, COUNT(*) AS vendas, SUM(quantidade) AS quantidade_total, MIN(dia) AS primeira_vez
            FROM venda_item v
            WHERE unidade = ? AND dia >= ? AND item_cardapio_id IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM composicao_produto_venda c
                  WHERE c.nome_produto_normalizado = v.nome_normalizado
              )
            GROUP BY nome_produto
            ORDER BY vendas DESC
            """,
            (unidade, inicio),
        ).fetchall()
        pendentes = [dict(linha) for linha in linhas]

        # Complemento que não casou não desconta nada — tem que aparecer na
        # fila. Só na loja que já trabalha com complemento (tem algum com
        # receita): no Artesanos as opções do pedido são "Sem cebola", "Ao
        # ponto"... e encheriam a fila de coisa que não é insumo.
        usa_complementos = conn.execute(
            "SELECT 1 FROM ficha_tecnica f JOIN item_cardapio i ON i.id = f.item_id "
            "WHERE f.loja = ? AND i.tipo = 'complemento' LIMIT 1",
            (unidade,),
        ).fetchone()
        if usa_complementos:
            pendentes += [
                {**dict(linha), "complemento": True}
                for linha in conn.execute(
                    """
                    SELECT nome_complemento AS nome_produto, COUNT(*) AS vendas,
                           SUM(quantidade) AS quantidade_total, MIN(dia) AS primeira_vez
                    FROM venda_complemento
                    WHERE unidade = ? AND dia >= ? AND item_cardapio_id IS NULL
                    GROUP BY nome_complemento
                    ORDER BY vendas DESC
                    """,
                    (unidade, inicio),
                ).fetchall()
            ]
        return pendentes


# Qual preço de preco_cardapio vale pra cada canal de venda (venda_item.canal)
# na receita estimada da tela de Mais Vendidos. Balcão (portal) cobra o
# preço do cardápio próprio.
_COLUNA_PRECO_POR_CANAL = {"ifood": "ifood", "food99": "food99", "catalog": "cardapio_web", "portal": "cardapio_web"}


def produtos_mais_vendidos_do_dia(lojas, dia_iso=None):
    """Ranking de um dia por loja (Insights → Mais Vendidos): quanto saiu de
    cada produto, somando os canais, e a mesma conta no mesmo dia da semana
    anterior (a comparação que faz sentido em restaurante: domingo com
    domingo). O que casou com o cardápio é agrupado pelo item — o mesmo
    lanche vem com nome diferente no iFood e na Cardápio Web; o que não
    casou fica pelo nome vendido e volta como pendente (é o que a fila de
    vendas não reconhecidas, na mesma tela, resolve). Mesma contagem da
    Curva ABC: quantidade vendida, sem o multiplicador de vínculo.

    A venda por item não traz preço, então a receita de cada produto é
    ESTIMADA: unidades de cada canal × preço do cardápio da loja nesse canal
    (preco_cardapio). Sem preço cadastrado, fica None. O faturamento real do
    dia vem de faturamento_diario (montado em app.py, com presencial e
    ajuste de canal, igual às Vendas Diárias).

    Sem dia, abre no último que teve venda (segunda as lojas não abrem)."""
    hoje = datetime.now().date().isoformat()
    with conexao() as conn:
        if not dia_iso:
            dia_iso = conn.execute(
                "SELECT MAX(dia) AS dia FROM venda_item WHERE dia <= ?", (hoje,)
            ).fetchone()["dia"] or hoje
        comparado = (datetime.fromisoformat(dia_iso) - timedelta(days=7)).date().isoformat()
        anterior = conn.execute(
            "SELECT MAX(dia) AS dia FROM venda_item WHERE dia < ?", (dia_iso,)
        ).fetchone()["dia"]
        proximo = conn.execute(
            "SELECT MIN(dia) AS dia FROM venda_item WHERE dia > ? AND dia <= ?", (dia_iso, hoje)
        ).fetchone()["dia"]
        for loja in lojas:
            _recasar_vendas_sem_item(conn, loja)
        linhas = conn.execute(
            """
            SELECT v.dia, v.unidade, v.canal, v.item_cardapio_id,
                   i.nome AS nome_item, i.categoria AS categoria_item,
                   COALESCE(v.nome_normalizado, v.nome_produto) AS nome_chave,
                   MIN(v.nome_produto) AS nome_vendido, SUM(v.quantidade) AS quantidade,
                   MAX(CASE WHEN v.item_cardapio_id IS NULL AND NOT EXISTS (
                           SELECT 1 FROM composicao_produto_venda c
                           WHERE c.nome_produto_normalizado = v.nome_normalizado
                       ) THEN 1 ELSE 0 END) AS pendente
            FROM venda_item v
            LEFT JOIN item_cardapio i ON i.id = v.item_cardapio_id
            WHERE v.dia IN (?, ?)
            GROUP BY v.dia, v.unidade, v.canal,
                     COALESCE('i' || v.item_cardapio_id, 'n' || COALESCE(v.nome_normalizado, v.nome_produto))
            """,
            (dia_iso, comparado),
        ).fetchall()
        precos = conn.execute(
            "SELECT loja, categoria, produto, ifood, food99, cardapio_web, foto_arquivo "
            "FROM preco_cardapio ORDER BY ordem"
        ).fetchall()
        catalogo = {
            _normalizar_nome_insumo(i["nome"]): i["id"]
            for i in conn.execute("SELECT id, nome FROM item_cardapio").fetchall()
        }

    # Linha de preço de cada produto da loja: pelo item do cardápio (mesmo
    # casamento da tela de Cardápio) e, pro que não casou, pelo nome.
    preco_por_item, preco_por_nome = {}, {}
    for p in precos:
        if p["loja"] not in lojas:
            continue
        preco_por_nome.setdefault((p["loja"], _normalizar_nome_insumo(p["produto"])), p)
        item_id, _ = _casar_item_cardapio(p["produto"], catalogo, ignorar_parenteses=True)
        if item_id:
            preco_por_item.setdefault((p["loja"], item_id), p)

    def _preco(linha_preco, canal):
        if not linha_preco:
            return None
        for coluna in (_COLUNA_PRECO_POR_CANAL.get(canal), "cardapio_web", "ifood", "food99"):
            if coluna and linha_preco[coluna]:
                return linha_preco[coluna]
        return None

    produtos, itens_comparado = {}, {}
    for linha in linhas:
        loja = linha["unidade"]
        if loja not in lojas:
            continue
        if linha["dia"] == comparado:
            itens_comparado[loja] = itens_comparado.get(loja, 0) + linha["quantidade"]
        chave = (loja, linha["item_cardapio_id"] or linha["nome_chave"])
        linha_preco = (
            preco_por_item.get((loja, linha["item_cardapio_id"])) if linha["item_cardapio_id"]
            else preco_por_nome.get((loja, _normalizar_nome_insumo(linha["nome_vendido"])))
        )
        produto = produtos.setdefault(chave, {
            "loja": loja,
            "nome": linha["nome_item"] or linha["nome_vendido"],
            "nomeVendido": linha["nome_vendido"],
            "categoria": linha["categoria_item"] or (linha_preco["categoria"] if linha_preco else None),
            "fotoUrl": f"/cardapio-fotos/{linha_preco['foto_arquivo']}" if linha_preco and linha_preco["foto_arquivo"] else None,
            "quantidade": 0,
            "quantidadeComparada": 0,
            "receita": None,
            "pendente": False,
        })
        if linha["dia"] == comparado:
            produto["quantidadeComparada"] += linha["quantidade"]
            continue
        produto["quantidade"] += linha["quantidade"]
        produto["pendente"] = produto["pendente"] or bool(linha["pendente"])
        preco = _preco(linha_preco, linha["canal"])
        if preco is not None:
            produto["receita"] = (produto["receita"] or 0.0) + linha["quantidade"] * preco

    por_loja = {loja: [] for loja in lojas}
    for produto in produtos.values():
        if produto["quantidade"]:
            por_loja[produto.pop("loja")].append(produto)
    return {
        "dia": dia_iso,
        "diaComparado": comparado,
        "hoje": hoje,
        "anterior": anterior,
        "proximo": proximo,
        "lojas": [
            {
                "loja": loja,
                "itens": sum(p["quantidade"] for p in lista),
                "itensComparado": itens_comparado.get(loja, 0),
                "produtos": sorted(lista, key=lambda p: (-p["quantidade"], p["nome"])),
            }
            for loja, lista in por_loja.items()
        ],
    }


def listar_porcoes_complemento(produto_item_id, loja):
    """Todo complemento do catálogo com a porção (g) dele nesse produto
    (None = vale a ficha do complemento)."""
    with conexao() as conn:
        salvos = {
            linha["complemento_item_id"]: linha["gramas"] for linha in conn.execute(
                "SELECT complemento_item_id, gramas FROM porcao_complemento_item WHERE produto_item_id = ? AND loja = ?",
                (produto_item_id, loja),
            ).fetchall()
        }
    return [
        {"complementoId": c["id"], "nome": c["nome"], "gramas": salvos.get(c["id"])}
        for c in listar_complementos_por_loja(loja)
    ]


def definir_porcoes_complemento(produto_item_id, loja, porcoes):
    """Substitui as porções do produto: [{"complementoId", "gramas"}];
    gramas vazio tira a porção própria (volta a valer a ficha do
    complemento)."""
    with conexao() as conn:
        conn.execute(
            "DELETE FROM porcao_complemento_item WHERE produto_item_id = ? AND loja = ?",
            (produto_item_id, loja),
        )
        for porcao in porcoes:
            if porcao.get("gramas"):
                conn.execute(
                    "INSERT INTO porcao_complemento_item (loja, produto_item_id, complemento_item_id, gramas) VALUES (?, ?, ?, ?)",
                    (loja, produto_item_id, int(porcao["complementoId"]), float(porcao["gramas"])),
                )


def definir_composicao_produto_venda(nome_produto, componentes, criado_por):
    """Diz de que um combo é feito: [{"itemCardapioId", "quantidade"}, ...].
    A baixa de estoque passa a seguir a receita de cada componente (ver
    SQL_ITENS_CONSUMIDOS), em vez de precisar de uma Ficha Técnica própria
    pro combo — que ficaria desatualizada assim que o lanche de dentro
    mudasse de receita.

    Substitui a composição inteira: é mais previsível editar a lista toda
    do que adivinhar o que sai e o que fica."""
    nome_normalizado = _normalizar_nome_insumo(nome_produto)
    agora = datetime.now().isoformat()
    with conexao() as conn:
        conn.execute(
            "DELETE FROM composicao_produto_venda WHERE nome_produto_normalizado = ?",
            (nome_normalizado,),
        )
        for componente in componentes:
            conn.execute(
                """
                INSERT INTO composicao_produto_venda
                    (nome_produto_normalizado, item_cardapio_id, quantidade, criado_em, criado_por)
                VALUES (?, ?, ?, ?, ?)
                """,
                (nome_normalizado, int(componente["itemCardapioId"]),
                 float(componente.get("quantidade", 1) or 1), agora, criado_por),
            )
        # Venda antiga com esse nome ainda está com nome_normalizado vazio
        # (a coluna é nova): preenche pra composição alcançar o histórico
        # também, não só as vendas daqui pra frente.
        conn.execute(
            "UPDATE venda_item SET nome_normalizado = ? WHERE nome_produto = ? AND nome_normalizado IS NULL",
            (nome_normalizado, nome_produto),
        )


def listar_composicoes_produto_venda():
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT c.nome_produto_normalizado, c.item_cardapio_id, c.quantidade,
                   c.criado_em, c.criado_por, ic.nome AS item_cardapio_nome
            FROM composicao_produto_venda c
            JOIN item_cardapio ic ON ic.id = c.item_cardapio_id
            ORDER BY c.nome_produto_normalizado, ic.nome
            """
        ).fetchall()
    por_nome = {}
    for linha in linhas:
        info = por_nome.setdefault(linha["nome_produto_normalizado"], {
            "nomeProdutoNormalizado": linha["nome_produto_normalizado"],
            "criadoEm": linha["criado_em"],
            "criadoPor": linha["criado_por"],
            "componentes": [],
        })
        info["componentes"].append({
            "itemCardapioId": linha["item_cardapio_id"],
            "nome": linha["item_cardapio_nome"],
            "quantidade": linha["quantidade"],
        })
    return list(por_nome.values())


def vincular_produto_venda_manualmente(nome_produto, item_cardapio_id, criado_por, quantidade_por_unidade=1):
    """Grava o vínculo manual permanente (Etapa 0) e já re-casa qualquer
    venda_item existente com esse mesmo nome (histórico de consumo/relatório
    passa a contar certo) — não reaplica baixa de estoque retroativa nos
    dias já passados, só o casamento pra leitura (ver decisão no plano:
    baixa automática só vale daqui pra frente).

    `quantidade_por_unidade` é "quantos lanches" esse nome representa quando
    ele mesmo não tem estrutura nenhuma pra decompor sozinho (ex: "Combo de
    sexta 99 Food - 2 smash's tradicionais" = 2, vinculado a TRADICIONAL) —
    1 é o normal (produto único)."""
    nome_normalizado = _normalizar_nome_insumo(nome_produto)
    agora = datetime.now().isoformat()
    with conexao() as conn:
        conn.execute(
            """
            INSERT INTO vinculo_produto_venda (nome_produto_normalizado, item_cardapio_id, criado_em, criado_por, quantidade_por_unidade)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (nome_produto_normalizado) DO UPDATE SET
                item_cardapio_id = excluded.item_cardapio_id,
                criado_em = excluded.criado_em,
                criado_por = excluded.criado_por,
                quantidade_por_unidade = excluded.quantidade_por_unidade
            """,
            (nome_normalizado, item_cardapio_id, agora, criado_por, quantidade_por_unidade),
        )
        conn.execute(
            "UPDATE venda_item SET item_cardapio_id = ?, multiplicador = ? WHERE nome_produto = ?",
            (item_cardapio_id, quantidade_por_unidade, nome_produto),
        )
        # O mesmo vínculo serve pro complemento com nome diferente do
        # cadastro ("Chocoboll" -> Chocoball), vindo da mesma fila.
        conn.execute(
            "UPDATE venda_complemento SET item_cardapio_id = ? WHERE nome_complemento = ?",
            (item_cardapio_id, nome_produto),
        )


def listar_vinculos_manuais():
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT vp.nome_produto_normalizado, vp.item_cardapio_id, vp.criado_em, vp.criado_por,
                   vp.quantidade_por_unidade, ic.nome AS item_cardapio_nome
            FROM vinculo_produto_venda vp
            JOIN item_cardapio ic ON ic.id = vp.item_cardapio_id
            ORDER BY vp.criado_em DESC
            """
        ).fetchall()
        return [dict(linha) for linha in linhas]


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
                   i.marca_homologada, i.unidade_compra, i.fator_conversao_compra,
                   (i.rendimento_receita IS NOT NULL) AS eh_mistura,
                   i.conteudo_por_unidade, i.unidade_conteudo, i.custo_referencia,
                   i.fornecedor_homologado_id, i.preco_homologado, i.validade_preco_homologado,
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


# Tabelas de compra e contagem: se o insumo de origem aparece nelas, ele
# tem história própria e não é apagado depois de juntar.
_TABELAS_COM_HISTORICO = ("cotacao_item", "cotacao_item_loja", "cotacao_convite_item", "cotacao_preco",
                          "pedido_compra_item", "contagem_item", "lote_insumo")


def mesclar_insumo(origem_id, destino_id, fator, loja):
    """Junta um insumo cadastrado duas vezes (2026-09-15): a ficha técnica
    do Artesanos usava o cadastro da planilha de CMV ("Bacon (fatia crua)",
    em g) e a loja contava o de compra ("Bacon Fatiado Smoke", em kg), então
    a baixa automática nunca mexia no estoque contado.

    `fator` = quantas unidades da origem cabem em 1 unidade do destino (g ->
    kg = 1000; lata de 395 g = 395). Na loja pedida (e nas que dividem a
    ficha com ela): a ficha passa a usar o destino, com a quantidade
    convertida; o histórico da baixa (baixa_estoque_venda) vai junto e
    convertido — sem isso, a ressincronização dos últimos dias veria o
    consumo do destino como novo e descontaria a semana de novo; e o
    estoque da origem nessa loja (o negativo "fantasma") sai. A receita das
    misturas é da rede toda, então troca em qualquer loja. O custo do
    cadastro vai pro destino se ele não tiver um.

    Se a origem não sobrar em nenhuma ficha, receita, compra ou contagem,
    ela é apagada; senão fica (outra loja ainda usa). Retorna o resumo."""
    if origem_id == destino_id or not fator or fator <= 0:
        raise ValueError("Escolha dois insumos diferentes e um fator maior que zero.")
    lojas = lojas_da_mesma_ficha(loja)
    marcadores = ",".join("?" * len(lojas))
    with conexao() as conn:
        origem = conn.execute("SELECT id, nome, custo_referencia FROM insumo WHERE id = ?", (origem_id,)).fetchone()
        destino = conn.execute("SELECT id, nome, custo_referencia FROM insumo WHERE id = ?", (destino_id,)).fetchone()
        if not origem or not destino:
            raise ValueError("Insumo não encontrado.")
        if conn.execute("SELECT 1 FROM receita_insumo WHERE insumo_id = ?", (origem_id,)).fetchone():
            raise ValueError(f"{origem['nome']} é uma mistura feita na casa: não dá pra juntar com um insumo comprado.")

        def mover(tabela, coluna, chave_extra, filtro_sql="", filtro_args=()):
            """Troca origem por destino em `tabela`, somando quando o destino
            já está na mesma chave (ex.: mesma ficha já tinha os dois)."""
            linhas = conn.execute(
                f"SELECT {', '.join(chave_extra)}, {TABELA_QUANTIDADE[tabela]} AS quantidade_valor "
                f"FROM {tabela} WHERE {coluna} = ? {filtro_sql}",
                (origem_id, *filtro_args),
            ).fetchall()
            for linha in linhas:
                chave = {c: linha[c] for c in chave_extra}
                valor = None if linha["quantidade_valor"] is None else linha["quantidade_valor"] / fator
                onde = " AND ".join(f"{c} = ?" for c in chave)
                existente = conn.execute(
                    f"SELECT {TABELA_QUANTIDADE[tabela]} AS q FROM {tabela} WHERE {coluna} = ? AND {onde}",
                    (destino_id, *chave.values()),
                ).fetchone()
                if existente:
                    soma = None if existente["q"] is None and valor is None else (existente["q"] or 0) + (valor or 0)
                    conn.execute(
                        f"UPDATE {tabela} SET {TABELA_QUANTIDADE[tabela]} = ? WHERE {coluna} = ? AND {onde}",
                        (soma, destino_id, *chave.values()),
                    )
                    conn.execute(f"DELETE FROM {tabela} WHERE {coluna} = ? AND {onde}", (origem_id, *chave.values()))
                else:
                    conn.execute(
                        f"UPDATE {tabela} SET {coluna} = ?, {TABELA_QUANTIDADE[tabela]} = ? WHERE {coluna} = ? AND {onde}",
                        (destino_id, valor, origem_id, *chave.values()),
                    )
            return len(linhas)

        fichas = mover("ficha_tecnica", "insumo_id", ("item_id", "loja"), f"AND loja IN ({marcadores})", lojas)
        embalagens = mover("embalagem_viagem", "insumo_id", ("item_id", "loja"), f"AND loja IN ({marcadores})", lojas)
        receitas = mover("receita_insumo", "ingrediente_id", ("insumo_id",))
        baixas = mover("baixa_estoque_venda", "insumo_id", ("unidade", "dia"), f"AND unidade IN ({marcadores})", lojas)

        agora = datetime.now().isoformat()
        for loja_ficha in lojas:
            conn.execute(
                "INSERT OR IGNORE INTO estoque_insumo (insumo_id, loja, quantidade_atual, estoque_minimo, atualizado_em) "
                "VALUES (?, ?, 0, 0, ?)", (destino_id, loja_ficha, agora))
            conn.execute("INSERT OR IGNORE INTO insumo_loja (insumo_id, loja) VALUES (?, ?)", (destino_id, loja_ficha))
        conn.execute(f"DELETE FROM estoque_insumo WHERE insumo_id = ? AND loja IN ({marcadores})", (origem_id, *lojas))
        conn.execute(f"DELETE FROM insumo_loja WHERE insumo_id = ? AND loja IN ({marcadores})", (origem_id, *lojas))
        conn.execute(f"DELETE FROM ajuste_quantidade_ideal WHERE insumo_id = ? AND loja IN ({marcadores})", (origem_id, *lojas))

        custo_levado = None
        if destino["custo_referencia"] is None and origem["custo_referencia"] is not None:
            custo_levado = round(origem["custo_referencia"] * fator, 8)
            conn.execute("UPDATE insumo SET custo_referencia = ? WHERE id = ?", (custo_levado, destino_id))

        ainda_usada = (
            conn.execute("SELECT 1 FROM ficha_tecnica WHERE insumo_id = ?", (origem_id,)).fetchone()
            or conn.execute("SELECT 1 FROM embalagem_viagem WHERE insumo_id = ?", (origem_id,)).fetchone()
            or conn.execute("SELECT 1 FROM receita_insumo WHERE ingrediente_id = ?", (origem_id,)).fetchone()
            or any(conn.execute(f"SELECT 1 FROM {t} WHERE insumo_id = ? LIMIT 1", (origem_id,)).fetchone()
                   for t in _TABELAS_COM_HISTORICO)
        )
        if not ainda_usada:
            conn.execute("DELETE FROM estoque_insumo WHERE insumo_id = ?", (origem_id,))
            conn.execute("DELETE FROM insumo_loja WHERE insumo_id = ?", (origem_id,))
            conn.execute("DELETE FROM insumo_fornecedor WHERE insumo_id = ?", (origem_id,))
            conn.execute("DELETE FROM ajuste_quantidade_ideal WHERE insumo_id = ?", (origem_id,))
            conn.execute("DELETE FROM baixa_estoque_venda WHERE insumo_id = ?", (origem_id,))
            conn.execute("DELETE FROM insumo WHERE id = ?", (origem_id,))

    return {
        "origem": origem["nome"], "destino": destino["nome"], "fichas": fichas, "embalagens": embalagens, "receitas": receitas,
        "baixas": baixas, "custoLevado": custo_levado, "origemApagada": not ainda_usada,
    }


# Coluna de quantidade de cada tabela que mesclar_insumo converte.
TABELA_QUANTIDADE = {
    "ficha_tecnica": "quantidade",
    "embalagem_viagem": "quantidade",
    "receita_insumo": "quantidade",
    "baixa_estoque_venda": "quantidade_baixada",
}


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


def listar_itens_cardapio_todos():
    """Todo item_cardapio (produto + complemento), de toda loja — pro
    seletor de "vincular manualmente" da Etapa 0 (painel de pendências).
    Diferente de listar_produtos_por_loja/listar_complementos_por_loja,
    não filtra por preço cadastrado numa loja: a Ficha Técnica é o que
    importa aqui, não o cardápio de venda."""
    with conexao() as conn:
        linhas = conn.execute(
            "SELECT id, nome, categoria, tipo FROM item_cardapio ORDER BY tipo, categoria, nome"
        ).fetchall()
        return [dict(linha) for linha in linhas]


def criar_item_cardapio(nome, categoria, tipo='produto'):
    with conexao() as conn:
        conn.execute(
            "INSERT INTO item_cardapio (nome, categoria, tipo) VALUES (?, ?, ?) ON CONFLICT(nome) DO UPDATE SET categoria = excluded.categoria",
            (nome, categoria, tipo),
        )
        return conn.execute("SELECT id FROM item_cardapio WHERE nome = ?", (nome,)).fetchone()["id"]


def criar_complementos_em_lote(nomes):
    """Cadastra vários complementos novos de uma vez (mesmo espírito de
    `criar_insumos_em_lote`, Estoque) — pula nome que já existe no
    catálogo, normalizado, seja produto ou complemento (não faz sentido
    ter "Granola" duas vezes com tipos diferentes). Complemento não tem
    loja/estoque/preço nessa fase, só nome — a ficha técnica (por loja)
    é cadastrada depois, item por item."""
    with conexao() as conn:
        existentes = {
            _normalizar_nome_insumo(l["nome"]) for l in conn.execute("SELECT nome FROM item_cardapio").fetchall()
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
        item_id = criar_item_cardapio(nome, 'Geral', tipo='complemento')
        criados.append({"id": item_id, "nome": nome})
    return {"criados": criados, "duplicados": duplicados}


def listar_complementos_por_loja(loja):
    """Lista de complementos (Granola, Leite em pó...) pra tela de Ficha
    Técnica — ao contrário de produto, não vem de `preco_cardapio` (não é
    vendido/precificado sozinho na Cardápio Web), é só o catálogo de
    complementos cadastrado direto no AdmFood. Sem custo/valor de
    venda/foto nessa fase."""
    with conexao() as conn:
        itens = conn.execute(
            "SELECT id, nome, categoria FROM item_cardapio WHERE tipo = 'complemento' ORDER BY categoria, nome"
        ).fetchall()
        tem_ficha = {
            r["item_id"]
            for r in conn.execute("SELECT DISTINCT item_id FROM ficha_tecnica WHERE loja = ?", (loja,)).fetchall()
        }
    return [
        {
            "id": item["id"],
            "nome": item["nome"],
            "categoria": item["categoria"],
            "temFichaTecnica": item["id"] in tem_ficha,
        }
        for item in itens
    ]


def excluir_item_cardapio(item_id):
    with conexao() as conn:
        conn.execute("DELETE FROM ficha_tecnica WHERE item_id = ?", (item_id,))
        conn.execute("DELETE FROM embalagem_viagem WHERE item_id = ?", (item_id,))
        conn.execute("DELETE FROM item_cardapio_custo WHERE item_id = ?", (item_id,))
        conn.execute("DELETE FROM item_cardapio WHERE id = ?", (item_id,))


def renomear_item_cardapio(item_id, novo_nome, criado_por=None):
    """Troca o nome de um item do cardápio (produto ou complemento) em todas
    as lojas (botão "Renomear" da tela de Cardápio, 2026-09-14): o item do
    catálogo e a linha do cardápio de preços de cada loja que casava com ele
    — é dela que a tela tira o nome do cartão.

    O nome antigo vira vínculo manual pro mesmo item: a venda chega da
    Cardápio Web com o nome que estiver cadastrado LÁ, e enquanto lá ainda
    estiver o antigo, ela continua reconhecida (e descontando a ficha) em vez
    de cair em "Vendas não reconhecidas". Vínculo que alguém já fez pra esse
    nome não é trocado. Ficha técnica, custo e porções são pelo id do item,
    então não mudam.

    Loja que já tem outro produto com o nome novo fica com o nome antigo
    (o cardápio de uma loja não repete nome) e volta em `lojasIgnoradas`."""
    novo_nome = (novo_nome or "").strip()
    novo_normalizado = _normalizar_nome_insumo(novo_nome)
    if not novo_normalizado:
        raise ValueError("Informe o nome novo.")
    with conexao() as conn:
        item = conn.execute("SELECT id, nome FROM item_cardapio WHERE id = ?", (item_id,)).fetchone()
        if not item:
            raise ValueError("Item não encontrado.")
        catalogo = {
            _normalizar_nome_insumo(i["nome"]): i["id"]
            for i in conn.execute("SELECT id, nome FROM item_cardapio").fetchall()
        }
        dono_do_nome = catalogo.get(novo_normalizado)
        if dono_do_nome and dono_do_nome != item_id:
            raise ValueError(f'Já existe outro item chamado "{novo_nome}" no cardápio.')

        # As linhas de preço são casadas ANTES de trocar o nome, pelo mesmo
        # critério da tela (listar_produtos_por_loja).
        casadas = [
            linha for linha in conn.execute("SELECT id, loja, produto FROM preco_cardapio ORDER BY ordem").fetchall()
            if _casar_item_cardapio(linha["produto"], catalogo, ignorar_parenteses=True)[0] == item_id
        ]
        nomes_antigos = {item["nome"]} | {linha["produto"] for linha in casadas}

        conn.execute("UPDATE item_cardapio SET nome = ? WHERE id = ?", (novo_nome, item_id))
        lojas_renomeadas, lojas_ignoradas = [], []
        for linha in casadas:
            ocupado = conn.execute(
                "SELECT 1 FROM preco_cardapio WHERE loja = ? AND produto = ? AND id != ?",
                (linha["loja"], novo_nome, linha["id"]),
            ).fetchone()
            if ocupado:
                lojas_ignoradas.append(linha["loja"])
                continue
            conn.execute("UPDATE preco_cardapio SET produto = ? WHERE id = ?", (novo_nome, linha["id"]))
            lojas_renomeadas.append(linha["loja"])

        agora = datetime.now().isoformat()
        for nome in nomes_antigos:
            normalizado = _normalizar_nome_insumo(nome)
            if not normalizado or normalizado == novo_normalizado:
                continue
            conn.execute(
                """
                INSERT OR IGNORE INTO vinculo_produto_venda
                    (nome_produto_normalizado, item_cardapio_id, criado_em, criado_por, quantidade_por_unidade)
                VALUES (?, ?, ?, ?, 1)
                """,
                (normalizado, item_id, agora, criado_por),
            )
    return {
        "nome": novo_nome,
        "nomeAntigo": item["nome"],
        "lojasRenomeadas": sorted(set(lojas_renomeadas)),
        "lojasIgnoradas": sorted(set(lojas_ignoradas)),
    }


def renomear_linha_cardapio(preco_cardapio_id, novo_nome):
    """Troca o nome de um produto do cardápio de UMA loja que ainda não tem
    item do cardápio (sem ficha técnica) — sem item, não há venda
    reconhecida pra proteger com vínculo."""
    novo_nome = (novo_nome or "").strip()
    if not _normalizar_nome_insumo(novo_nome):
        raise ValueError("Informe o nome novo.")
    with conexao() as conn:
        linha = conn.execute("SELECT id, loja FROM preco_cardapio WHERE id = ?", (preco_cardapio_id,)).fetchone()
        if not linha:
            raise ValueError("Produto não encontrado.")
        if conn.execute(
            "SELECT 1 FROM preco_cardapio WHERE loja = ? AND produto = ? AND id != ?",
            (linha["loja"], novo_nome, preco_cardapio_id),
        ).fetchone():
            raise ValueError(f'O cardápio dessa loja já tem um produto chamado "{novo_nome}".')
        conn.execute("UPDATE preco_cardapio SET produto = ? WHERE id = ?", (novo_nome, preco_cardapio_id))
    return {"nome": novo_nome}


def remover_produto_do_cardapio(preco_cardapio_id):
    """Tira um produto do cardápio de UMA loja (botão "Tirar do cardápio
    desta loja", 2026-09-14): apaga só a linha de preço dessa loja (preço
    por canal e foto). O item do cardápio e a ficha técnica ficam
    guardados — se o produto voltar pro cardápio com o mesmo nome, a ficha
    volta junto, e se ele ainda for vendido, a baixa continua certa. As
    outras lojas não mudam."""
    with conexao() as conn:
        linha = conn.execute("SELECT id, loja, produto FROM preco_cardapio WHERE id = ?", (preco_cardapio_id,)).fetchone()
        if not linha:
            raise ValueError("Produto não encontrado.")
        conn.execute("DELETE FROM preco_cardapio WHERE id = ?", (preco_cardapio_id,))
    return {"loja": linha["loja"], "produto": linha["produto"]}


# Lojas que vendem os mesmos produtos com a mesma receita: a ficha técnica é
# uma só pro grupo (pedido da Julia, 2026-09-14 — "as duas lojas vendem as
# mesmas coisas"). Continua gravada linha a linha por loja, porque a baixa,
# o custo e o consumo médio leem a ficha da própria loja; o que muda é que
# salvar numa grava em todas do grupo. Estoque e preço seguem por loja.
GRUPOS_FICHA_COMPARTILHADA = [("Tradiça ZN", "Tradiça Simus")]


def lojas_da_mesma_ficha(loja):
    for grupo in GRUPOS_FICHA_COMPARTILHADA:
        if loja in grupo:
            return list(grupo)
    return [loja]


def _igualar_fichas_do_grupo(conn, grupo):
    """Item com ficha numa loja do grupo e nenhuma linha nas outras ganha a
    mesma ficha nelas (quando as Tradiças passaram a dividir a ficha, só a
    ZN tinha receita). Roda a cada início e não faz nada de novo depois da
    primeira vez; item com ficha nas duas lojas não é tocado."""
    marcadores = ",".join("?" * len(grupo))
    por_item = {}
    for linha in conn.execute(
        f"SELECT item_id, insumo_id, loja, quantidade FROM ficha_tecnica WHERE loja IN ({marcadores})",
        grupo,
    ).fetchall():
        por_item.setdefault(linha["item_id"], {}).setdefault(linha["loja"], []).append(linha)
    for item_id, por_loja in por_item.items():
        origens = [loja for loja in grupo if por_loja.get(loja)]
        if len(origens) != 1:
            continue
        for destino in grupo:
            if destino == origens[0]:
                continue
            for linha in por_loja[origens[0]]:
                conn.execute(
                    "INSERT OR IGNORE INTO ficha_tecnica (item_id, insumo_id, loja, quantidade) VALUES (?, ?, ?, ?)",
                    (item_id, linha["insumo_id"], destino, linha["quantidade"]),
                )


def definir_ficha_tecnica(item_id, loja, links):
    """Substitui a lista inteira de insumos do item **naquela loja** por
    `links` (`[{"insumoId": int, "quantidade": float|None}, ...]`) — mais
    simples que fazer diff, e a tela sempre manda a lista completa mesmo.
    Não mexe na receita das outras lojas (ficha técnica é por loja desde
    2026-09-01, ver seção 6.5), a não ser as do mesmo grupo de ficha
    compartilhada (as duas Tradiças), que recebem a mesma lista."""
    _substituir_insumos_do_item("ficha_tecnica", item_id, loja, links)


def definir_embalagem_viagem(item_id, loja, links):
    """Mesma coisa que definir_ficha_tecnica, pra embalagem pra viagem do
    item — o que só sai nos pedidos de delivery e retirada."""
    _substituir_insumos_do_item("embalagem_viagem", item_id, loja, links)


def _substituir_insumos_do_item(tabela, item_id, loja, links):
    with conexao() as conn:
        for loja_do_grupo in lojas_da_mesma_ficha(loja):
            conn.execute(f"DELETE FROM {tabela} WHERE item_id = ? AND loja = ?", (item_id, loja_do_grupo))
            for link in links:
                conn.execute(
                    f"INSERT INTO {tabela} (item_id, insumo_id, loja, quantidade) VALUES (?, ?, ?, ?)",
                    (item_id, link["insumoId"], loja_do_grupo, link.get("quantidade")),
                )


def buscar_ficha_tecnica_item(item_id, loja):
    return _buscar_insumos_do_item("ficha_tecnica", item_id, loja)


def buscar_embalagem_viagem_item(item_id, loja):
    return _buscar_insumos_do_item("embalagem_viagem", item_id, loja)


def _buscar_insumos_do_item(tabela, item_id, loja):
    with conexao() as conn:
        linhas = conn.execute(
            f"""
            SELECT f.insumo_id, f.quantidade, i.nome AS insumo_nome, i.unidade_medida,
                   i.conteudo_por_unidade, i.unidade_conteudo
            FROM {tabela} f
            JOIN insumo i ON i.id = f.insumo_id
            WHERE f.item_id = ? AND f.loja = ?
            ORDER BY i.nome
            """,
            (item_id, loja),
        ).fetchall()
        return [dict(linha) for linha in linhas]


def remover_custo_item_cardapio(item_id, loja):
    """Tira o custo digitado à mão e devolve o produto pro custo calculado
    pela Ficha Técnica. Existe porque custo à mão é permanente até alguém
    apagar: um valor errado ali (a Batata Individual estava com o preço do
    quilo no lugar do da porção, 10x pra cima) fica escondendo o cálculo
    pra sempre, e a tela não tinha como desfazer."""
    with conexao() as conn:
        conn.execute(
            "DELETE FROM item_cardapio_custo WHERE item_id = ? AND loja = ?",
            (item_id, loja),
        )


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


def curva_abc_insumos(dias=90):
    """Etapa 8 do motor de compra — classifica insumo por quanto dinheiro ele
    movimenta, pra decidir o que exige olho humano antes de aprovar uma
    Requisição e o que pode passar direto.

    Base é compra efetivamente recebida no período (quantidade × preço do
    recebimento), que é o dinheiro que saiu de verdade — não o cotado nem o
    pedido, que ainda podem mudar. Curva A é o topo que soma 80% do gasto,
    B vai até 95%, C é a cauda longa de item barato.

    Sem nenhuma compra recebida no período a lista volta vazia: dá pra
    construir a curva sem inventar base, e quem chama avisa o porquê."""
    corte = (datetime.now() - timedelta(days=dias)).date().isoformat()
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT pci.insumo_id,
                   i.nome, i.categoria, i.unidade_medida,
                   SUM(pci.quantidade * pci.preco_unitario) AS valor,
                   SUM(pci.quantidade) AS quantidade,
                   COUNT(DISTINCT pc.id) AS compras
            FROM pedido_compra_item pci
            JOIN pedido_compra pc ON pc.id = pci.pedido_id
            JOIN insumo i ON i.id = pci.insumo_id
            WHERE pc.status = 'recebido' AND pc.recebido_em >= ?
            GROUP BY pci.insumo_id
            ORDER BY valor DESC
            """,
            (corte,),
        ).fetchall()

    total = sum(l["valor"] for l in linhas) or 0.0
    itens = []
    acumulado = 0.0
    for linha in linhas:
        valor = round(linha["valor"], 2)
        acumulado += linha["valor"]
        participacao = linha["valor"] / total if total else 0
        acumulado_pct = acumulado / total if total else 0
        # Regra clássica da curva: A é o topo que junta 80% do gasto. O
        # corte olha o acumulado ATÉ este item, então o item que cruza a
        # linha ainda entra em A — é ele que fecha os 80%.
        if acumulado_pct <= 0.8 or not itens:
            classe = "A"
        elif acumulado_pct <= 0.95:
            classe = "B"
        else:
            classe = "C"
        itens.append({
            "insumoId": linha["insumo_id"],
            "nome": linha["nome"],
            "categoria": linha["categoria"],
            "unidadeMedida": linha["unidade_medida"],
            "valor": valor,
            "quantidade": round(linha["quantidade"], 2),
            "compras": linha["compras"],
            "participacao": round(participacao, 4),
            "acumulado": round(acumulado_pct, 4),
            "classe": classe,
        })

    return {
        "dias": dias,
        "desde": corte,
        "total": round(total, 2),
        "itens": itens,
        "porClasse": {
            classe: sum(1 for i in itens if i["classe"] == classe) for classe in ("A", "B", "C")
        },
    }


def mapa_curva_abc_insumos(dias=90):
    """{insumo_id: classe} — pra marcar na Conferência da Requisição quais
    itens pedem revisão manual antes de aprovar."""
    return {i["insumoId"]: i["classe"] for i in curva_abc_insumos(dias)["itens"]}


def mapa_receita_insumo():
    """{insumo_id: {"rendimento": float, "ingredientes": {ingrediente_id: qtd}}}
    pros insumos preparados dentro de casa. Insumo comprado pronto não tem
    receita e simplesmente não aparece aqui."""
    receitas = {}
    with conexao() as conn:
        rendimentos = {
            linha["id"]: linha["rendimento_receita"]
            for linha in conn.execute(
                "SELECT id, rendimento_receita FROM insumo "
                "WHERE rendimento_receita IS NOT NULL AND rendimento_receita > 0"
            ).fetchall()
        }
        linhas = conn.execute(
            "SELECT insumo_id, ingrediente_id, quantidade FROM receita_insumo"
        ).fetchall()

    for linha in linhas:
        rendimento = rendimentos.get(linha["insumo_id"])
        if rendimento is None:
            # Receita sem rendimento não dá pra dividir — fica inerte até
            # alguém preencher quanto a batelada produz.
            continue
        receita = receitas.setdefault(
            linha["insumo_id"], {"rendimento": rendimento, "ingredientes": {}}
        )
        receita["ingredientes"][linha["ingrediente_id"]] = linha["quantidade"]
    return receitas


def listar_misturas():
    """Todo insumo feito na casa (com receita), com o resumo que a tela de
    Cardápio → Misturas mostra: quanto rende, quantos ingredientes, quantos
    ainda sem quantidade e o custo — só quando a receita inteira tem preço.
    A receita é global (vale pra todas as lojas), então a lista também é."""
    precos = _mapa_preco_insumo()
    with conexao() as conn:
        ids = [l["id"] for l in conn.execute(
            "SELECT id FROM insumo WHERE rendimento_receita IS NOT NULL").fetchall()]
    misturas = []
    for insumo_id in ids:
        receita = buscar_receita_insumo(insumo_id, precos)
        misturas.append({
            "insumoId": receita["insumoId"],
            "nome": receita["nome"],
            "unidadeMedida": receita["unidadeMedida"],
            "rendimento": receita["rendimento"],
            "ingredientes": len(receita["ingredientes"]),
            "semQuantidade": sum(1 for i in receita["ingredientes"] if i["quantidade"] is None),
            "custoBatelada": receita["custoBatelada"],
            "custoPorUnidade": receita["custoPorUnidade"],
        })
    return sorted(misturas, key=lambda m: _normalizar_nome_insumo(m["nome"]))


def localizar_ou_criar_insumo_de_mistura(nome, unidade_medida, loja):
    """Insumo que vai ganhar receita pela tela de Cardápio → Misturas. Nome
    que já existe (mesmo critério de _normalizar_nome_insumo) é o mesmo
    insumo — o "Tempero Batata" que a batata já usa na ficha técnica; criar
    outro partiria a receita e o estoque em dois. Nome novo vira insumo novo,
    só da loja em que ela está. Devolve (insumo_id, criado)."""
    alvo = _normalizar_nome_insumo(nome)
    with conexao() as conn:
        for linha in conn.execute("SELECT id, nome FROM insumo").fetchall():
            if _normalizar_nome_insumo(linha["nome"]) == alvo:
                return linha["id"], False
    return criar_insumo(nome, "Misturas", unidade_medida, [loja]), True


def buscar_receita_insumo(insumo_id, precos=None):
    """Receita de uma mistura feita na casa, com o custo de cada ingrediente
    e o da batelada — o que a tela mostra pra ela conferir a conta.
    `precos` (de _mapa_preco_insumo) evita recalcular pra cada mistura
    quando são várias de uma vez (listar_misturas)."""
    if precos is None:
        precos = _mapa_preco_insumo()
    with conexao() as conn:
        insumo = conn.execute(
            "SELECT id, nome, unidade_medida, rendimento_receita FROM insumo WHERE id = ?", (insumo_id,)
        ).fetchone()
        if not insumo:
            return None
        linhas = conn.execute(
            """
            SELECT r.ingrediente_id, r.quantidade, i.nome, i.unidade_medida
            FROM receita_insumo r JOIN insumo i ON i.id = r.ingrediente_id
            WHERE r.insumo_id = ?
            ORDER BY i.nome
            """,
            (insumo_id,),
        ).fetchall()

    ingredientes, custo_batelada, completo = [], 0.0, bool(linhas)
    for linha in linhas:
        preco = precos.get(linha["ingrediente_id"])
        custo = linha["quantidade"] * preco if preco is not None and linha["quantidade"] is not None else None
        if custo is None:
            completo = False
        else:
            custo_batelada += custo
        ingredientes.append({
            "insumoId": linha["ingrediente_id"],
            "nome": linha["nome"],
            "unidadeMedida": linha["unidade_medida"],
            "quantidade": linha["quantidade"],
            "custoUnitario": preco,
            "custo": round(custo, 4) if custo is not None else None,
        })
    rendimento = insumo["rendimento_receita"]
    return {
        "insumoId": insumo["id"],
        "nome": insumo["nome"],
        "unidadeMedida": insumo["unidade_medida"],
        "rendimento": rendimento,
        "ingredientes": ingredientes,
        # Só com a receita inteira precificada — metade da conta daria um
        # custo menor que o real (mesma regra da ficha técnica).
        "custoBatelada": round(custo_batelada, 2) if completo else None,
        "custoPorUnidade": round(custo_batelada / rendimento, 6) if completo and rendimento else None,
    }


def definir_receita_insumo(insumo_id, rendimento, ingredientes):
    """Substitui a receita inteira da mistura. `ingredientes` =
    [{"insumoId", "quantidade"}]; lista vazia apaga a receita e o insumo volta
    a ser tratado como comprado pronto. Levanta ValueError pra receita que
    usa a si mesma, direta ou indiretamente — isso travaria o custo e a
    baixa de tudo que leva a mistura."""
    ingredientes = [i for i in ingredientes if i.get("insumoId")]
    if ingredientes and not (rendimento and rendimento > 0):
        raise ValueError("Informe quanto a receita rende.")
    ids = [int(i["insumoId"]) for i in ingredientes]
    if len(ids) != len(set(ids)):
        raise ValueError("O mesmo ingrediente aparece duas vezes na receita.")

    receitas = mapa_receita_insumo()
    receitas[insumo_id] = {"rendimento": rendimento, "ingredientes": {i: 1 for i in ids}}
    pendentes, vistos = list(ids), set()
    while pendentes:
        atual = pendentes.pop()
        if atual == insumo_id:
            raise ValueError("A receita usa ela mesma (direto ou dentro de outra mistura).")
        if atual in vistos:
            continue
        vistos.add(atual)
        pendentes.extend(receitas.get(atual, {}).get("ingredientes", {}))

    with conexao() as conn:
        conn.execute("DELETE FROM receita_insumo WHERE insumo_id = ?", (insumo_id,))
        for ingrediente in ingredientes:
            quantidade = ingrediente.get("quantidade")
            conn.execute(
                "INSERT INTO receita_insumo (insumo_id, ingrediente_id, quantidade) VALUES (?, ?, ?)",
                (insumo_id, int(ingrediente["insumoId"]), float(quantidade) if quantidade not in (None, "") else None),
            )
        conn.execute(
            "UPDATE insumo SET rendimento_receita = ? WHERE id = ?",
            (float(rendimento) if ingredientes else None, insumo_id),
        )


def _custo_das_receitas(precos, receitas):
    """Custo por unidade de cada insumo preparado na casa: o que custa a
    batelada inteira, dividido pelo que ela rende. Resolve em cascata, porque
    receita chama receita — o Molho Especial leva 2,8 kg de Maionese da Casa,
    que tem receita própria.

    Receita incompleta (ingrediente sem preço ou sem quantidade) NÃO derruba
    o insumo pra "sem custo": ele fica com o custo digitado à mão, que era o
    que valia antes da receita existir. Ligar a receita nunca pode piorar o
    que a tela já mostrava — e sem isso um ingrediente esquecido apagaria o
    CMV de todo produto que usa a mistura.

    Receita circular (A leva B que leva A) é ignorada em vez de estourar em
    recursão infinita: erro de cadastro não pode derrubar a tela de CMV."""
    calculados = {}

    def custo(insumo_id, visitando):
        if insumo_id in calculados:
            return calculados[insumo_id]
        receita = receitas.get(insumo_id)
        if not receita or insumo_id in visitando:
            return precos.get(insumo_id)

        total = 0.0
        for ingrediente_id, quantidade in receita["ingredientes"].items():
            preco = custo(ingrediente_id, visitando | {insumo_id})
            if preco is None or quantidade is None:
                return precos.get(insumo_id)
            total += quantidade * preco

        calculados[insumo_id] = round(total / receita["rendimento"], 6)
        return calculados[insumo_id]

    for insumo_id in receitas:
        custo(insumo_id, frozenset())
    return calculados


def explodir_receitas_em_ingredientes(consumo, receitas):
    """Troca o consumo de um insumo preparado na casa pelo consumo dos
    ingredientes dele: vender batata gasta sal, páprica e açúcar, que é o que
    a casa compra, conta e precisa repor. Em cascata e com trava de ciclo,
    igual ao custo.

    O insumo preparado deixa de ter baixa própria de propósito — descontar o
    tempero pronto E os ingredientes dele seria descontar a mesma compra duas
    vezes. O preço disso é que o tempero já misturado no pote conta como
    consumido antes de ser usado; o erro é de no máximo uma batelada e cai
    pro lado seguro (repõe um pouco antes)."""
    final = {}

    def somar(insumo_id, quantidade, visitando):
        receita = receitas.get(insumo_id)
        if not receita or insumo_id in visitando:
            final[insumo_id] = final.get(insumo_id, 0.0) + quantidade
            return
        fator = quantidade / receita["rendimento"]
        for ingrediente_id, quantidade_ingrediente in receita["ingredientes"].items():
            if quantidade_ingrediente is None:
                continue
            somar(ingrediente_id, quantidade_ingrediente * fator, visitando | {insumo_id})

    for insumo_id, quantidade in consumo.items():
        somar(insumo_id, quantidade, frozenset())
    return final


DIAS_PRECO_RECENTE = 90  # compra/cotação mais velha que isso não passa na frente de custo mais novo


def custo_em_uso_por_insumo():
    """O custo que o CMV usa pra cada insumo e de onde ele veio:
    {insumo_id: {"valor", "origem", "data", "fornecedor"}}, com origem
    "cadastro" (custo_referencia: digitado no cadastro do insumo, ou vindo
    da planilha na carga inicial), "cotacao", "compra" ou "receita". Do mais
    pro menos confiável: o preço da última compra efetivamente recebida (o
    que saiu do caixa), o preço cotado por algum fornecedor e o custo do
    cadastro. Insumo sem nenhum dos três fica de fora: quem consome trata
    como custo desconhecido em vez de assumir zero.

    Compra e cotação com mais de DIAS_PRECO_RECENTE dias só valem quando o
    insumo não tem nada mais novo, nem o custo do cadastro (2026-09-17: com o
    histórico inteiro da VMarket, uma compra de dez/2024 passava na frente do
    custo digitado agora). Ordem de quem ganha: compra recente, cotação
    recente, cadastro, compra antiga, cotação antiga.

    A origem vai junto porque o custo do cadastro perde pro preço recente: a
    tela mostra do lado dele qual custo está valendo, senão ela digitaria
    um valor e acharia que não funcionou."""
    cadastro = {}
    cotacao = {}
    with conexao() as conn:
        for linha in conn.execute(
            "SELECT id, custo_referencia FROM insumo WHERE custo_referencia IS NOT NULL"
        ).fetchall():
            cadastro[linha["id"]] = {"valor": linha["custo_referencia"], "origem": "cadastro"}
        # Vale a cotação mais recente de cada insumo e, dentro dela, o preço
        # escolhido (o que foi comprado), não o último fornecedor lançado:
        # na VMarket o escolhido nem sempre é o mais barato, e fornecedores
        # diferentes cotam em unidades diferentes (2026-09-16).
        linhas = conn.execute(
            """
            SELECT p.insumo_id, p.preco, p.criado_em
            FROM cotacao_preco p
            JOIN cotacao c ON c.id = p.cotacao_id
            ORDER BY c.criado_em, p.selecionado, p.criado_em
            """
        ).fetchall()
    for linha in linhas:
        cotacao[linha["insumo_id"]] = {"valor": linha["preco"], "origem": "cotacao", "data": linha["criado_em"]}
    compra = {
        insumo_id: {"valor": info["preco"], "origem": "compra", "data": info["dataIso"], "fornecedor": info["fornecedorNome"]}
        for insumo_id, info in buscar_ultima_compra_por_insumo().items()
    }
    corte = (datetime.now() - timedelta(days=DIAS_PRECO_RECENTE)).isoformat()

    def recente(info):
        return info if info and (info.get("data") or "") >= corte else None

    em_uso = {}
    for insumo_id in set(cadastro) | set(cotacao) | set(compra):
        opcoes = (
            recente(compra.get(insumo_id)),
            recente(cotacao.get(insumo_id)),
            cadastro.get(insumo_id),
            compra.get(insumo_id),
            cotacao.get(insumo_id),
        )
        em_uso[insumo_id] = next(info for info in opcoes if info)
    # Mistura feita na casa custa o que foi dentro dela, então o custo da
    # receita ganha de tudo acima — uma "compra" de Tempero Batata seria erro
    # de cadastro. Receita incompleta não entra aqui: fica o que já valia.
    precos = {insumo_id: info["valor"] for insumo_id, info in em_uso.items()}
    for insumo_id, valor in _custo_das_receitas(precos, mapa_receita_insumo()).items():
        em_uso[insumo_id] = {"valor": valor, "origem": "receita"}
    return em_uso


def _mapa_preco_insumo():
    """{insumo_id: custo} que o CMV usa — ver custo_em_uso_por_insumo, que
    diz também de onde cada custo veio."""
    return {insumo_id: info["valor"] for insumo_id, info in custo_em_uso_por_insumo().items()}


def _custo_por_item_da_ficha(loja, precos_insumo):
    """CMV real de cada produto: soma de quantidade × preço de cada insumo
    da Ficha Técnica dessa loja. Só devolve o custo quando TODOS os insumos
    da receita têm preço — receita meio precificada daria um custo menor
    que o real, e um produto pareceria mais lucrativo do que é justamente
    na tela que serve pra decidir corte de cardápio."""
    with conexao() as conn:
        linhas = conn.execute(
            "SELECT item_id, insumo_id, quantidade FROM ficha_tecnica WHERE loja = ?",
            (loja,),
        ).fetchall()

    parciais = {}
    for linha in linhas:
        info = parciais.setdefault(linha["item_id"], {"custo": 0.0, "completo": True, "insumos": 0})
        info["insumos"] += 1
        preco = precos_insumo.get(linha["insumo_id"])
        if preco is None or linha["quantidade"] is None:
            info["completo"] = False
            continue
        info["custo"] += linha["quantidade"] * preco

    return {
        item_id: round(info["custo"], 4)
        for item_id, info in parciais.items()
        if info["completo"] and info["insumos"] > 0
    }


# Canal gravado em venda_item → coluna de preço em preco_cardapio. "portal"
# é a venda presencial/balcão, que usa o mesmo preço do Cardápio Web.
_CANAL_VENDA_PARA_PRECO = {
    "ifood": "ifood",
    "food99": "food99",
    "99food": "food99",
    "catalog": "cardapioWeb",
    "portal": "cardapioWeb",
}


def _anotar_motivos_sem_cmv(loja, itens, custos_ficha, custos_manuais, complementos_vendidos):
    """Diz em cada produto sem CMV o que falta (card #39 dela, 2026-09-18).

    Antes a tela só dizia "falta preço de algum insumo", e achar qual era
    abrir ficha por ficha. Os motivos, na ordem em que o cálculo trava:
    - precoVenda: o produto não tem preço na lista de preços do cardápio,
      então não dá pra fazer a porcentagem (os adicionais do Artesanos);
    - semFicha: não tem receita cadastrada nessa loja;
    - insumoSemCusto: algum insumo da receita não tem custo (ou quantidade);
    - complementoSemCusto: a receita fecha, mas mais de 20% dos complementos
      vendidos junto (adicional escolhido no pedido) não têm custo — a regra
      de `curva_abc_cardapio` derruba o CMV nesse caso."""
    precos = _mapa_preco_insumo()
    with conexao() as conn:
        ficha = {}
        for linha in conn.execute(
            "SELECT item_id, insumo_id, quantidade FROM ficha_tecnica WHERE loja = ?", (loja,)
        ).fetchall():
            ficha.setdefault(linha["item_id"], []).append(linha)
        nomes_insumo = {l["id"]: l["nome"] for l in conn.execute("SELECT id, nome FROM insumo").fetchall()}
        nomes_item = {l["id"]: l["nome"] for l in conn.execute("SELECT id, nome FROM item_cardapio").fetchall()}

    complementos_por_produto = {}
    for linha in complementos_vendidos:
        complementos_por_produto.setdefault(linha["produto_id"], []).append(linha)

    for item in itens.values():
        if item.get("cmvPercent") is not None:
            continue
        item_id = item["itemCardapioId"]
        motivos = []
        if not item.get("precoMedio"):
            motivos.append({"tipo": "precoVenda", "nomes": []})
        if item.get("custoUnitario") is None and (item_id, loja) not in custos_manuais:
            linhas = ficha.get(item_id) or []
            if not linhas:
                motivos.append({"tipo": "semFicha", "nomes": []})
            else:
                faltando = sorted({
                    nomes_insumo.get(l["insumo_id"], f"#{l['insumo_id']}")
                    for l in linhas
                    if precos.get(l["insumo_id"]) is None or l["quantidade"] is None
                })
                if faltando:
                    motivos.append({"tipo": "insumoSemCusto", "nomes": faltando})
                else:
                    complementos = sorted({
                        nomes_item.get(l["complemento_id"], f"#{l['complemento_id']}")
                        for l in complementos_por_produto.get(item_id, [])
                        if custos_ficha.get(l["complemento_id"]) is None
                    })
                    if complementos:
                        motivos.append({"tipo": "complementoSemCusto", "nomes": complementos})
        item["motivosSemCmv"] = motivos


def _ranking_pendencias_cmv(itens):
    """O que destrava mais produtos: cada insumo ou complemento sem custo,
    com a lista de produtos que ele trava, do que trava mais pro que trava
    menos."""
    travados = {}
    for item in itens:
        for motivo in item.get("motivosSemCmv") or []:
            for nome in motivo["nomes"]:
                travados.setdefault((motivo["tipo"], nome), set()).add(item["nome"])
    ranking = [
        {"tipo": tipo, "nome": nome, "produtos": sorted(produtos)}
        for (tipo, nome), produtos in travados.items()
    ]
    ranking.sort(key=lambda r: (-len(r["produtos"]), r["nome"]))
    return ranking


def curva_abc_cardapio(loja, dias=30, ate=None):
    """Etapa 10 do motor de compra — cruza volume vendido × margem gerada ×
    CMV real de cada produto do cardápio, pra orientar decisão de cardápio
    com dado em vez de intuição.

    Curva A = os produtos que sustentam o faturamento (entram no acumulado
    de 80% da margem E vendem acima da mediana). Curva C fraca = vendem
    pouco E têm o pior CMV ao mesmo tempo — nunca só por um dos dois, e
    nunca produto marcado como protegido (opção vegetariana, item de
    assinatura). Produto sem custo confiável fica como "sem CMV": aparece
    com volume e receita, mas fora das duas listas, porque não dá pra
    julgar margem sem saber o custo.

    `ate` (data ISO, fora da janela) fecha o período no passado: a Home
    compara os 30 dias de agora com os 30 anteriores pra saber quem entrou
    ou saiu da Curva A."""
    if ate:
        corte = (date.fromisoformat(ate) - timedelta(days=dias)).isoformat()
        filtro_fim, parametros_fim = " AND dia < ?", (ate,)
    else:
        corte = (datetime.now() - timedelta(days=dias)).date().isoformat()
        filtro_fim, parametros_fim = "", ()

    with conexao() as conn:
        vendas = conn.execute(
            f"""
            SELECT item_cardapio_id, canal, SUM(quantidade) AS quantidade
            FROM venda_item
            WHERE unidade = ? AND dia >= ? AND item_cardapio_id IS NOT NULL{filtro_fim}
            GROUP BY item_cardapio_id, canal
            """,
            (loja, corte, *parametros_fim),
        ).fetchall()
        protegidos = {
            l["id"] for l in conn.execute("SELECT id FROM item_cardapio WHERE protegido = 1").fetchall()
        }
        nao_casadas = conn.execute(
            f"""
            SELECT COUNT(*) AS vendas, COUNT(DISTINCT nome_produto) AS produtos
            FROM venda_item
            WHERE unidade = ? AND dia >= ? AND item_cardapio_id IS NULL{filtro_fim}
            """,
            (loja, corte, *parametros_fim),
        ).fetchone()
        # Complementos escolhidos junto de cada produto no período. Só os que
        # casaram com um item de complemento: o resto é modificador ("Sem
        # cebola", "Ao ponto") ou nome ainda sem cadastro.
        complementos_vendidos = conn.execute(
            f"""
            SELECT v.item_cardapio_id AS produto_id, c.item_cardapio_id AS complemento_id,
                   SUM(c.quantidade) AS quantidade, SUM(c.quantidade * c.preco_unitario) AS receita
            FROM venda_complemento c
            JOIN venda_item v ON v.unidade = c.unidade AND v.pedido_id = c.pedido_id AND v.linha = c.linha
            WHERE c.unidade = ? AND c.dia >= ?{filtro_fim.replace('dia', 'c.dia')}
              AND v.item_cardapio_id IS NOT NULL AND c.item_cardapio_id IS NOT NULL
            GROUP BY v.item_cardapio_id, c.item_cardapio_id
            """,
            (loja, corte, *parametros_fim),
        ).fetchall()

    produtos_loja = {p["itemCardapioId"]: p for p in listar_produtos_por_loja(loja) if p["itemCardapioId"]}
    custos_ficha = _custo_por_item_da_ficha(loja, _mapa_preco_insumo())
    custos_manuais = mapa_custos_item_cardapio()

    # No "monte o seu" a receita fixa é só açaí + embalagem; o resto é o que
    # o cliente escolheu. O custo desses complementos entra no produto, senão
    # o CMV dele pareceria bem menor do que é. Complemento sem custo conhecido
    # é estimado pela média dos que têm custo — mas se passar de 20% sem
    # custo, o produto fica "sem CMV" (mesma regra da receita incompleta).
    extras_por_produto = {}
    for linha in complementos_vendidos:
        extra = extras_por_produto.setdefault(
            linha["produto_id"], {"custo": 0.0, "unidades": 0.0, "com_custo": 0.0, "receita": 0.0}
        )
        extra["unidades"] += linha["quantidade"]
        extra["receita"] += linha["receita"] or 0.0
        custo_complemento = custos_ficha.get(linha["complemento_id"])
        if custo_complemento is not None:
            extra["custo"] += linha["quantidade"] * custo_complemento
            extra["com_custo"] += linha["quantidade"]

    itens = {}
    for venda in vendas:
        item_id = venda["item_cardapio_id"]
        produto = produtos_loja.get(item_id)
        if not produto:
            continue
        item = itens.setdefault(item_id, {
            "itemCardapioId": item_id,
            "nome": produto["nome"],
            "categoria": produto["categoria"],
            "volume": 0.0,
            "receita": 0.0,
            "protegido": item_id in protegidos,
        })
        item["volume"] += venda["quantidade"]
        preco = produto.get(_CANAL_VENDA_PARA_PRECO.get(venda["canal"], "cardapioWeb"))
        if preco is None:
            # Canal sem preço na lista (o iFood dos adicionais do Artesanos, 18/09):
            # usa o do balcão e, sem ele, qualquer outro. Contar a venda com
            # receita zero derrubava o preço médio e fazia o CMV explodir
            # (Adc Bacon aparecia com 98,8%).
            preco = next(
                (produto.get(c) for c in ("cardapioWeb", "ifood", "food99", "beefood") if produto.get(c) is not None),
                None,
            )
        if preco is not None:
            item["receita"] += venda["quantidade"] * preco

    for item in itens.values():
        item_id = item["itemCardapioId"]
        # Custo digitado à mão ganha do calculado: é a palavra final dela
        # sobre aquele produto naquela loja.
        custo = custos_manuais.get((item_id, loja))
        custo_manual = custo is not None
        if custo is None:
            custo = custos_ficha.get(item_id)
        extra = extras_por_produto.get(item_id)
        if extra and item["volume"]:
            item["receita"] += extra["receita"]  # topping pago
            # Custo à mão já é o custo inteiro do produto, na palavra dela.
            if custo is not None and not custo_manual:
                if extra["com_custo"] >= 0.8 * extra["unidades"]:
                    estimado = extra["custo"] * extra["unidades"] / extra["com_custo"] if extra["com_custo"] else 0.0
                    custo += estimado / item["volume"]
                else:
                    custo = None
        item["custoUnitario"] = round(custo, 2) if custo is not None else None
        item["volume"] = round(item["volume"], 2)
        item["receita"] = round(item["receita"], 2)
        precoMedio = item["receita"] / item["volume"] if item["volume"] else 0
        item["precoMedio"] = round(precoMedio, 2)
        if custo is None or not precoMedio:
            item["cmvPercent"] = None
            item["margem"] = None
        else:
            item["cmvPercent"] = round((custo / precoMedio) * 100, 1)
            item["margem"] = round(item["receita"] - custo * item["volume"], 2)

    _anotar_motivos_sem_cmv(loja, itens, custos_ficha, custos_manuais, complementos_vendidos)
    lista = sorted(itens.values(), key=lambda i: -i["volume"])
    com_margem = [i for i in lista if i["margem"] is not None]

    # Curva A: acumulado de 80% da margem, cruzado com volume acima da
    # mediana — precisa dos dois, senão um item caro de giro baixo entraria
    # como pilar do negócio só pela margem unitária.
    curva_a = set()
    if com_margem:
        volumes = sorted(i["volume"] for i in com_margem)
        mediana = volumes[len(volumes) // 2]
        total_margem = sum(i["margem"] for i in com_margem if i["margem"] > 0)
        acumulado = 0.0
        for item in sorted(com_margem, key=lambda i: -i["margem"]):
            if item["margem"] <= 0:
                continue
            if acumulado < total_margem * 0.8 and item["volume"] >= mediana:
                curva_a.add(item["itemCardapioId"])
            acumulado += item["margem"]

    # Curva C fraca: terço de menor volume E terço de pior CMV ao mesmo
    # tempo (a regra do documento — nunca um isolado), fora os protegidos.
    curva_c = set()
    if len(com_margem) >= 3:
        por_volume = sorted(com_margem, key=lambda i: i["volume"])
        por_cmv = sorted(com_margem, key=lambda i: -i["cmvPercent"])
        corte_terco = max(1, len(com_margem) // 3)
        pior_volume = {i["itemCardapioId"] for i in por_volume[:corte_terco]}
        pior_cmv = {i["itemCardapioId"] for i in por_cmv[:corte_terco]}
        curva_c = {
            item_id for item_id in (pior_volume & pior_cmv)
            if item_id not in protegidos
        }

    for item in lista:
        if item["itemCardapioId"] in curva_a:
            item["curva"] = "A"
        elif item["itemCardapioId"] in curva_c:
            item["curva"] = "C"
        elif item["margem"] is None:
            item["curva"] = "sem-cmv"
        else:
            item["curva"] = "normal"

    return {
        "loja": loja,
        "dias": dias,
        "desde": corte,
        "itens": lista,
        "totalVolume": round(sum(i["volume"] for i in lista), 2),
        "totalReceita": round(sum(i["receita"] for i in lista), 2),
        "totalMargem": round(sum(i["margem"] for i in com_margem), 2) if com_margem else 0,
        "vendasNaoCasadas": nao_casadas["vendas"],
        "produtosNaoCasados": nao_casadas["produtos"],
        "pendenciasCmv": _ranking_pendencias_cmv(lista),
    }


def definir_produto_protegido(item_id, protegido):
    with conexao() as conn:
        conn.execute(
            "UPDATE item_cardapio SET protegido = ? WHERE id = ?",
            (1 if protegido else 0, item_id),
        )


def mapa_custos_item_cardapio():
    with conexao() as conn:
        linhas = conn.execute("SELECT item_id, loja, custo FROM item_cardapio_custo").fetchall()
        return {(l["item_id"], l["loja"]): l["custo"] for l in linhas}


# Lojas em que a categoria de combo não aparece na tela de Cardápio (ver
# listar_produtos_por_loja). Só o Açaí, que foi o pedido de 10/09/2026; os
# combos do Artesanos continuam na lista.
LOJAS_SEM_COMBO_NO_CARDAPIO = {"Açaí Na Lata"}


def listar_produtos_por_loja(loja):
    """Lista de produtos da loja pra tela unificada de Cardápio (Preços +
    Ficha Técnica numa tela só, 2026-09-09): parte de `preco_cardapio` (que
    já sabe quem vende o quê e o valor de venda em cada canal), casa cada
    nome com um `item_cardapio` já cadastrado via `_casar_item_cardapio`
    (mesmo critério usado pra bater venda com receita, seção 6.6) e junta o
    custo digitado à mão quando existir. Produto sem match nenhum volta com
    itemCardapioId None — a tela oferece cadastrar um item novo com esse
    nome. `precoCardapioId` (o id da própria linha de preco_cardapio) vai
    junto pra permitir editar o preço por canal na mesma tela, sem precisar
    de uma segunda chamada."""
    with conexao() as conn:
        produtos = conn.execute(
            "SELECT id, categoria, produto, ifood, food99, beefood, cardapio_web, foto_arquivo FROM preco_cardapio WHERE loja = ? ORDER BY ordem",
            (loja,),
        ).fetchall()
        # Bebida voltou pra essa tela em 17/09/2026 (card #34 do ClickUp):
        # tinha saído em 02/09 por não ser receita, mas a ficha dela é o que
        # desconta a lata/garrafa do estoque, e ela quer ver e editar.
        # Combo do Açaí sai (pedido da Julia em 10/09/2026): não tem
        # receita própria — a venda desconta os copos de dentro pela
        # composição (composicao_produto_venda) e os complementos escolhidos
        # no pedido. Na lista, era produto sem ficha sem nada pra preencher.
        # O preço continua gravado e a venda continua contando.
        if loja in LOJAS_SEM_COMBO_NO_CARDAPIO:
            produtos = [p for p in produtos if not _normalizar_nome_insumo(p["categoria"]).startswith("combo")]
        catalogo = {
            _normalizar_nome_insumo(i["nome"]): i["id"]
            for i in conn.execute("SELECT id, nome FROM item_cardapio").fetchall()
        }
        tem_ficha = {
            r["item_id"]
            for r in conn.execute("SELECT DISTINCT item_id FROM ficha_tecnica WHERE loja = ?", (loja,)).fetchall()
        }
        # Nome da lista de preços que não bate com item nenhum (a Tradiça vende
        # "Coca-Cola 350ml", o item é "Coca-Cola Original 350ml") ainda acha o
        # item pelo vínculo manual da fila de pendências — só vínculo de 1 pra
        # 1: "2 smash's" não é o mesmo produto na lista de preços.
        vinculos = {
            r["nome_produto_normalizado"]: r["item_cardapio_id"]
            for r in conn.execute(
                "SELECT nome_produto_normalizado, item_cardapio_id FROM vinculo_produto_venda WHERE quantidade_por_unidade = 1"
            ).fetchall()
        }
    custos = mapa_custos_item_cardapio()

    resultado = []
    for p in produtos:
        item_id, _ = _casar_item_cardapio(p["produto"], catalogo, ignorar_parenteses=True)
        if item_id is None:
            item_id = vinculos.get(_normalizar_nome_insumo(p["produto"]))
        resultado.append({
            "itemCardapioId": item_id,
            "precoCardapioId": p["id"],
            "nome": p["produto"],
            "categoria": p["categoria"],
            "ifood": p["ifood"],
            "food99": p["food99"],
            "beefood": p["beefood"],
            "cardapioWeb": p["cardapio_web"],
            "valorVenda": p["cardapio_web"],
            "custo": custos.get((item_id, loja)) if item_id else None,
            "temFichaTecnica": item_id in tem_ficha if item_id else False,
            "fotoArquivo": p["foto_arquivo"],
        })
    return resultado


def consumo_medio_insumo(inicio_iso, fim_iso, unidade=None):
    """Consumo médio DIÁRIO de cada insumo no período, por loja: soma
    (quantidade vendida do prato × quantidade da receita) de venda_item
    cruzado com ficha_tecnica — mais a embalagem pra viagem nos pedidos que
    saíram da loja —, dividido pelos dias do período. Só entra
    insumo com quantidade definida na ficha técnica (receita sem gramatura
    ainda, NULL, não dá pra estimar) e prato já casado com item_cardapio
    (item_cardapio_id IS NOT NULL em venda_item — ver salvar_itens_vendidos_do_dia).
    Base pra sugerir quantidade ideal/estoque mínimo (seção 6.6)."""
    dias = (datetime.fromisoformat(fim_iso) - datetime.fromisoformat(inicio_iso)).days + 1
    condicoes = ["dia >= ?", "dia <= ?"]
    parametros = [inicio_iso, fim_iso]
    if unidade:
        condicoes.append("unidade = ?")
        parametros.append(unidade)

    with conexao() as conn:
        linhas = conn.execute(
            f"""
            SELECT unidade, insumo_id, SUM(quantidade) AS total_consumido
            FROM ({SQL_INSUMOS_CONSUMIDOS})
            WHERE {' AND '.join(condicoes)}
            GROUP BY unidade, insumo_id
            """,
            parametros,
        ).fetchall()
        insumos = {
            linha["id"]: linha
            for linha in conn.execute("SELECT id, nome, unidade_medida, categoria FROM insumo").fetchall()
        }

    # Consumo é o que se compra: mistura feita na casa vira os ingredientes
    # dela, senão a sugestão de compra pediria "Tempero Batata" em vez de sal.
    receitas = mapa_receita_insumo()
    por_loja = {}
    for linha in linhas:
        por_loja.setdefault(linha["unidade"], {})[linha["insumo_id"]] = linha["total_consumido"]

    resultado = [
        {
            "unidade": loja,
            "insumoId": insumo_id,
            "insumoNome": insumos[insumo_id]["nome"],
            "unidadeMedida": insumos[insumo_id]["unidade_medida"],
            "consumoMedioDiario": total / dias,
        }
        for loja, consumo in por_loja.items()
        for insumo_id, total in explodir_receitas_em_ingredientes(consumo, receitas).items()
        if insumo_id in insumos
    ]
    return sorted(resultado, key=lambda r: (insumos[r["insumoId"]]["categoria"] or "", r["insumoNome"]))


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
        lojas = {}
        for linha in conn.execute("SELECT fornecedor_id, loja FROM fornecedor_loja ORDER BY loja").fetchall():
            lojas.setdefault(linha["fornecedor_id"], []).append(linha["loja"])
        return [{**dict(linha), "lojas": lojas.get(linha["id"], [])} for linha in linhas]


def definir_lojas_fornecedor(fornecedor_id, lojas):
    """Substitui de quais lojas a gente compra desse fornecedor."""
    with conexao() as conn:
        conn.execute("DELETE FROM fornecedor_loja WHERE fornecedor_id = ?", (fornecedor_id,))
        for loja in lojas:
            conn.execute("INSERT INTO fornecedor_loja (fornecedor_id, loja) VALUES (?, ?)", (fornecedor_id, loja))


def lojas_da_cotacao(cotacao_id):
    """Lojas que pediram algum insumo dessa cotação (vazio na cotação manual,
    que não nasce de Requisição)."""
    with conexao() as conn:
        linhas = conn.execute(
            "SELECT DISTINCT loja FROM cotacao_item_loja WHERE cotacao_id = ? ORDER BY loja", (cotacao_id,)
        ).fetchall()
    return [linha["loja"] for linha in linhas]


def buscar_fornecedor_por_id(fornecedor_id):
    with conexao() as conn:
        linha = conn.execute("SELECT * FROM fornecedor WHERE id = ?", (fornecedor_id,)).fetchone()
        return dict(linha) if linha else None


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


def mapa_fornecedores_do_historico():
    """{insumo_id: [fornecedor_id, ...]} de quem já cotou OU já vendeu o
    insumo, tirado do histórico (cotação e pedido).

    A lista do cadastro (`insumo_fornecedor`) é marcada na mão e só ganha
    linha automática quando vem preço de cotação; quem só vendeu — pedido
    direto, compra por fora, os 2.635 pedidos importados da VMarket — ficava
    de fora. Na coluna de Fornecedores da tela de Insumos a Julia quer os
    dois, que é o que a VMarket mostrava."""
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT DISTINCT insumo_id, fornecedor_id FROM cotacao_preco
            WHERE fornecedor_id IS NOT NULL
            UNION
            SELECT DISTINCT pci.insumo_id, pc.fornecedor_id
            FROM pedido_compra_item pci
            JOIN pedido_compra pc ON pc.id = pci.pedido_id
            WHERE pc.fornecedor_id IS NOT NULL
            """
        ).fetchall()
    mapa = {}
    for linha in linhas:
        mapa.setdefault(linha["insumo_id"], []).append(linha["fornecedor_id"])
    return mapa


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
            "SELECT id, titulo, criado_em FROM cotacao WHERE status = 'fechada' AND pedido_direto = 0 ORDER BY criado_em DESC"
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


LIMITE_PRECO_COMPARAVEL = 3


def listar_cotacoes():
    """Cada cotação com as métricas mostradas na lista (estilo VMarket,
    print da Julia 2026-09-04): insumos/fornecedores distintos, quantos
    insumos já têm vencedor marcado ("Comprados"), % de convites
    respondidos, e Valor Pedido/Economia — soma do preço vencedor × a
    quantidade de cada insumo, e quanto isso economizou frente ao maior
    preço lançado pra esse insumo. Calculado em Python (não em SQL) porque
    "maior preço por insumo" e "quantidade por insumo" vêm de tabelas
    diferentes e a junção em SQL puro exigiria subquery correlacionada por
    linha — mais simples e fácil de testar assim, e o volume de dados é
    pequeno (poucas centenas de linhas no máximo)."""
    with conexao() as conn:
        cotacoes = conn.execute(
            "SELECT id, titulo, status, criado_em, requisicao_titulo FROM cotacao WHERE pedido_direto = 0 "
            "ORDER BY criado_em DESC"
        ).fetchall()
        precos = conn.execute(
            "SELECT cotacao_id, insumo_id, fornecedor_id, preco, selecionado FROM cotacao_preco"
        ).fetchall()
        quantidades = conn.execute(
            "SELECT cotacao_id, insumo_id, quantidade_total FROM cotacao_item"
        ).fetchall()
        convites = conn.execute(
            "SELECT cotacao_id, status FROM cotacao_convite"
        ).fetchall()
        pedidos_por_cotacao = {
            linha["cotacao_id"]: linha["total"]
            for linha in conn.execute("SELECT cotacao_id, COUNT(*) AS total FROM pedido_compra GROUP BY cotacao_id")
        }

    quantidade_por_chave = {(q["cotacao_id"], q["insumo_id"]): q["quantidade_total"] for q in quantidades}

    precos_por_cotacao = {}
    for p in precos:
        precos_por_cotacao.setdefault(p["cotacao_id"], []).append(p)

    convites_por_cotacao = {}
    for c in convites:
        totais = convites_por_cotacao.setdefault(c["cotacao_id"], {"total": 0, "respondidos": 0})
        totais["total"] += 1
        if c["status"] == "respondida":
            totais["respondidos"] += 1

    resultado = []
    for cotacao in cotacoes:
        linhas_preco = precos_por_cotacao.get(cotacao["id"], [])
        por_insumo = {}
        for p in linhas_preco:
            por_insumo.setdefault(p["insumo_id"], []).append(p)

        total_insumos = len(por_insumo)
        total_fornecedores = len({p["fornecedor_id"] for p in linhas_preco})
        insumos_comprados = 0
        valor_pedido = 0.0
        economia = 0.0
        for insumo_id, lista_precos in por_insumo.items():
            vencedor = next((p for p in lista_precos if p["selecionado"]), None)
            if not vencedor:
                continue
            insumos_comprados += 1
            quantidade = quantidade_por_chave.get((cotacao["id"], insumo_id)) or 0
            valor_pedido += vencedor["preco"] * quantidade
            # Preço mais de 3x o vencedor é de outra unidade de venda (óleo
            # cotado pela caixa contra o kg, cerveja pelo fardo contra a
            # garrafa — comum no histórico da VMarket) e inventaria economia.
            maior_preco = max(
                p["preco"] for p in lista_precos if p["preco"] <= vencedor["preco"] * LIMITE_PRECO_COMPARAVEL
            )
            economia += (maior_preco - vencedor["preco"]) * quantidade

        convite_info = convites_por_cotacao.get(cotacao["id"])
        percentual_respostas = (
            round(100 * convite_info["respondidos"] / convite_info["total"])
            if convite_info and convite_info["total"] else None
        )

        resultado.append({
            "id": cotacao["id"],
            "titulo": cotacao["titulo"],
            "status": cotacao["status"],
            "criado_em": cotacao["criado_em"],
            "requisicao_titulo": cotacao["requisicao_titulo"],
            "total_insumos": total_insumos,
            "total_fornecedores": total_fornecedores,
            "insumos_comprados": insumos_comprados,
            "percentual_respostas": percentual_respostas,
            "valor_pedido": round(valor_pedido, 2),
            "economia": round(economia, 2),
            "total_pedidos": pedidos_por_cotacao.get(cotacao["id"], 0),
        })
    return resultado


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
    """Apaga a cotação com os preços, itens e convites dela. Cotação que já
    tem pedido não sai (2026-09-16): o pedido ficava apontando pra uma
    cotação apagada e sumia da tela de Pedidos, e o Recebimentos não abria
    mais — as duas telas buscam o pedido junto com a cotação. Levanta
    ValueError com a mensagem pra tela."""
    with conexao() as conn:
        pedidos = conn.execute("SELECT COUNT(*) FROM pedido_compra WHERE cotacao_id = ?", (cotacao_id,)).fetchone()[0]
        if pedidos:
            raise ValueError(
                f"Essa cotação tem {pedidos} pedido{'s' if pedidos > 1 else ''}. "
                "Pra excluir, cancele os pedidos antes na tela de Pedidos."
            )
        conn.execute(
            "DELETE FROM cotacao_convite_item WHERE convite_id IN (SELECT id FROM cotacao_convite WHERE cotacao_id = ?)",
            (cotacao_id,),
        )
        conn.execute("DELETE FROM cotacao_convite WHERE cotacao_id = ?", (cotacao_id,))
        conn.execute("DELETE FROM cotacao_item_loja WHERE cotacao_id = ?", (cotacao_id,))
        conn.execute("DELETE FROM cotacao_item WHERE cotacao_id = ?", (cotacao_id,))
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
                   f.nome AS fornecedor_nome, f.contato_telefone AS fornecedor_telefone
            FROM cotacao_preco p
            JOIN insumo i ON i.id = p.insumo_id
            JOIN fornecedor f ON f.id = p.fornecedor_id
            WHERE p.cotacao_id = ?
            ORDER BY i.nome, p.preco ASC
            """,
            (cotacao_id,),
        ).fetchall()
        return [dict(linha) for linha in linhas]


def buscar_ultima_compra_por_insumo():
    """Preço, data e fornecedor do pedido de compra **recebido** mais
    recente de cada insumo (ver Recebimentos, seção 6.9) — "Última Compra"
    na grid do Comparativo de Preços (pedido da Julia, print da VMarket,
    2026-09-04). Usa o preço/quantidade já corrigidos na hora do
    recebimento (`pedido_compra_item`), não o valor pedido originalmente.
    Item sem preço (a VMarket tem pedido de homologado com preço zero) não
    conta: custo zero seria pior que custo desconhecido.

    Janela por insumo em vez de subconsulta por linha: com o histórico inteiro
    da VMarket (~26 mil itens) a subconsulta levava 40 s (2026-09-17)."""
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT insumo_id, preco_unitario, recebido_em, fornecedor_id, fornecedor_nome
            FROM (
                SELECT pci.insumo_id, pci.preco_unitario, pc.recebido_em, pc.fornecedor_id, f.nome AS fornecedor_nome,
                       ROW_NUMBER() OVER (PARTITION BY pci.insumo_id ORDER BY pc.recebido_em DESC, pc.id DESC) AS ordem
                FROM pedido_compra_item pci
                JOIN pedido_compra pc ON pc.id = pci.pedido_id
                JOIN fornecedor f ON f.id = pc.fornecedor_id
                WHERE pc.status = 'recebido' AND pci.preco_unitario > 0 AND pc.recebido_em IS NOT NULL
            )
            WHERE ordem = 1
            """
        ).fetchall()
        return {
            linha["insumo_id"]: {
                "preco": linha["preco_unitario"],
                "dataIso": linha["recebido_em"],
                "fornecedorId": linha["fornecedor_id"],
                "fornecedorNome": linha["fornecedor_nome"],
            }
            for linha in linhas
        }


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


def selecionar_melhores_precos_cotacao(cotacao_id):
    """"Selecionar os melhores preços" em lote (pedido da Julia, estilo
    VMarket) — pra cada insumo dessa cotação com pelo menos um preço
    lançado, marca o de menor valor como vencedor. Reaproveita
    `selecionar_preco_cotacao` insumo por insumo em vez de duplicar a
    regra de "só um vencedor por insumo"; retorna quantos insumos foram
    processados."""
    with conexao() as conn:
        linhas = conn.execute(
            "SELECT insumo_id, id FROM cotacao_preco WHERE cotacao_id = ? ORDER BY insumo_id, preco ASC",
            (cotacao_id,),
        ).fetchall()
    melhores = {}
    for linha in linhas:
        melhores.setdefault(linha["insumo_id"], linha["id"])
    for preco_id in melhores.values():
        selecionar_preco_cotacao(preco_id)
    return len(melhores)


def _insumos_da_cotacao_por_fornecedor(cotacao_id):
    """Pra cada insumo da cotação, quem é convidado a cotar ele.

    **O cadastro manda** (escolha dela em 2026-09-17): se o insumo tem
    fornecedor marcado no cadastro (`insumo_fornecedor`, o que ela edita pelo
    "+" da coluna Fornecedores), o convite vai só pra eles — senão tirar
    alguém da lista não adiantaria nada, porque ele continuaria sendo
    convidado pelo histórico. O histórico (quem já cotou ou já vendeu) só
    entra nos insumos que ninguém marcou ainda. Sem os dois, o insumo é órfão
    e vai pra todo mundo."""
    cadastro = mapa_insumo_fornecedores()
    historico = mapa_fornecedores_do_historico()
    with conexao() as conn:
        # JOIN com insumo de propósito: insumo excluído depois da cotação deixa
        # a linha em cotacao_item pra trás (achado em produção, 17/09 — a
        # cotação 20 tinha o insumo 201, que não existe mais). Sem isso o item
        # fantasma ia parar no link do fornecedor.
        insumo_ids = [
            linha["insumo_id"]
            for linha in conn.execute(
                """
                SELECT ci.insumo_id FROM cotacao_item ci
                JOIN insumo i ON i.id = ci.insumo_id
                WHERE ci.cotacao_id = ?
                """,
                (cotacao_id,),
            ).fetchall()
        ]
    return {
        insumo_id: set(cadastro.get(insumo_id) or historico.get(insumo_id) or [])
        for insumo_id in insumo_ids
    }


def _quem_cota_o_que(cotacao_id, fornecedor_ids=None):
    """Base do convite e da prévia: (mapa insumo→fornecedores, insumos órfãos,
    fornecedores ativos escolhidos). Ficar num lugar só evita a prévia mostrar
    uma coisa e o convite mandar outra."""
    por_insumo = _insumos_da_cotacao_por_fornecedor(cotacao_id)
    orfaos = [insumo_id for insumo_id, forns in por_insumo.items() if not forns]
    fornecedores = [f for f in listar_fornecedores() if f["ativo"]]
    if fornecedor_ids is not None:
        escolhidos = set(fornecedor_ids)
        fornecedores = [f for f in fornecedores if f["id"] in escolhidos]
    return por_insumo, orfaos, fornecedores


def _itens_do_fornecedor(fornecedor_id, por_insumo, orfaos):
    dele = [i for i, forns in por_insumo.items() if fornecedor_id in forns]
    return dele + [i for i in orfaos if i not in dele]


def previa_convites_cotacao(cotacao_id, fornecedor_ids=None):
    """O que cada fornecedor receberia se o convite fosse gerado agora — sem
    gerar nada. A tela mostra isso antes de mandar (pedido dela, 2026-09-17),
    porque link de cotação errado só se descobre depois que o fornecedor
    responde."""
    por_insumo, orfaos, fornecedores = _quem_cota_o_que(cotacao_id, fornecedor_ids)
    if not por_insumo:
        return {"fornecedores": [], "orfaos": [], "insumosDaCotacao": 0}

    with conexao() as conn:
        nomes = {
            linha["id"]: linha["nome"]
            for linha in conn.execute(
                f"SELECT id, nome FROM insumo WHERE id IN ({', '.join('?' for _ in por_insumo)})",
                list(por_insumo),
            ).fetchall()
        }
        com_convite = {
            linha["fornecedor_id"]
            for linha in conn.execute(
                "SELECT fornecedor_id FROM cotacao_convite WHERE cotacao_id = ?", (cotacao_id,)
            ).fetchall()
        }

    saida = []
    for fornecedor in fornecedores:
        itens = _itens_do_fornecedor(fornecedor["id"], por_insumo, orfaos)
        saida.append({
            "fornecedorId": fornecedor["id"],
            "fornecedorNome": fornecedor["nome"],
            "jaTemConvite": fornecedor["id"] in com_convite,
            "insumos": sorted(nomes.get(i, f"#{i}") for i in itens),
        })
    saida.sort(key=lambda f: (-len(f["insumos"]), f["fornecedorNome"]))
    return {
        "fornecedores": saida,
        "orfaos": sorted(nomes.get(i, f"#{i}") for i in orfaos),
        "insumosDaCotacao": len(por_insumo),
    }


def criar_convites_cotacao(cotacao_id, prazo_validade, fornecedor_ids=None):
    """Manda o link de preenchimento pros fornecedores ativos escolhidos na
    tela (`fornecedor_ids`; None = todo fornecedor ativo).

    Cada um recebe **os insumos que ele fornece** — os ligados a ele no
    cadastro do insumo ou no histórico (já cotou ou já vendeu) — mais os
    insumos que não têm fornecedor nenhum, que vão pra todo mundo pra não
    ficarem sem preço. É como era na VMarket (pedido dela em 2026-09-17, no
    lugar da regra de 2026-08-27, que mandava a mesma lista de órfãos pra
    todos). Fornecedor sem nenhum item não recebe convite — link vazio não
    serve pra nada. Quem já tem convite nessa cotação não recebe outro (evita
    resetar o token de quem está respondendo).
    """
    por_insumo, orfaos, fornecedores = _quem_cota_o_que(cotacao_id, fornecedor_ids)
    if not por_insumo:
        return {"convites": [], "insumosSemFornecedor": 0, "fornecedoresSemItens": []}
    agora = datetime.now().isoformat()
    convites = []
    sem_itens = []
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
            insumo_ids = _itens_do_fornecedor(fornecedor["id"], por_insumo, orfaos)
            if not insumo_ids:
                sem_itens.append(fornecedor["nome"])
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
            convites.append({
                "id": convite_id,
                "fornecedorId": fornecedor["id"],
                "fornecedorNome": fornecedor["nome"],
                "token": token,
                "totalInsumos": len(insumo_ids),
            })

    return {
        "convites": convites,
        "insumosSemFornecedor": len(orfaos),
        "fornecedoresSemItens": sem_itens,
    }


def listar_convites_cotacao(cotacao_id):
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT cc.id, cc.fornecedor_id, cc.token, cc.prazo_validade, cc.status, cc.criado_em, cc.respondida_em,
                   f.nome AS fornecedor_nome, f.contato_telefone AS fornecedor_telefone
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
                   f.nome AS fornecedor_nome, f.contato_telefone AS fornecedor_telefone, c.titulo AS cotacao_titulo
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
    # Mesmo token pra todo pedido do mesmo fornecedor nessa leva (pode ter
    # loja(s) diferente(s) — "feito em conjunto" na mensagem de WhatsApp),
    # pra um só link/clique confirmar todos de uma vez.
    token_por_fornecedor = {}
    with conexao() as conn:
        for (fornecedor_id, loja), itens in grupos.items():
            if fornecedor_id not in token_por_fornecedor:
                token_por_fornecedor[fornecedor_id] = secrets.token_urlsafe(24)
            token = token_por_fornecedor[fornecedor_id]
            cursor = conn.execute(
                "INSERT INTO pedido_compra (cotacao_id, fornecedor_id, loja, status, criado_em, token) VALUES (?, ?, ?, 'enviado', ?, ?)",
                (cotacao_id, fornecedor_id, loja, agora, token),
            )
            pedido_id = cursor.lastrowid
            for item in itens:
                conn.execute(
                    "INSERT INTO pedido_compra_item (pedido_id, insumo_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)",
                    (pedido_id, item['insumoId'], item['quantidade'], item['precoUnitario']),
                )
            pedidos_criados.append({"id": pedido_id, "fornecedorId": fornecedor_id, "loja": loja, "token": token})

    return {"pedidosCriados": pedidos_criados, "insumosSemVencedor": insumos_sem_vencedor}


def listar_pedidos():
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT pc.id, pc.cotacao_id, pc.fornecedor_id, pc.loja, pc.status, pc.criado_em, pc.atualizado_em,
                   pc.whatsapp_enviado_em, pc.recebido_por, pc.recebido_em,
                   pc.valor_nf, pc.compra_fora, pc.numero_nf, pc.nota_fiscal_arquivo, pc.somou_estoque,
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
            SELECT pc.id, pc.cotacao_id, pc.fornecedor_id, pc.loja, pc.status, pc.criado_em, pc.atualizado_em, pc.token,
                   pc.whatsapp_enviado_em, pc.recebido_por, pc.recebido_em,
                   pc.valor_nf, pc.compra_fora, pc.numero_nf, pc.nota_fiscal_arquivo, pc.somou_estoque,
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
    foi pedido".

    Compra feita por fora que somou no estoque é a exceção: excluir tira as
    quantidades de volta da loja (é o jeito de corrigir um lançamento
    errado). O arquivo da nota fica com quem chama (app.py)."""
    with conexao() as conn:
        pedido = conn.execute(
            "SELECT loja, compra_fora, somou_estoque FROM pedido_compra WHERE id = ?", (pedido_id,)
        ).fetchone()
        if pedido and pedido["compra_fora"] and pedido["somou_estoque"]:
            agora = datetime.now().isoformat()
            for item in conn.execute(
                "SELECT insumo_id, quantidade FROM pedido_compra_item WHERE pedido_id = ?", (pedido_id,)
            ).fetchall():
                conn.execute(
                    "UPDATE estoque_insumo SET quantidade_atual = quantidade_atual - ?, atualizado_em = ? "
                    "WHERE insumo_id = ? AND loja = ?",
                    (item["quantidade"], agora, item["insumo_id"], pedido["loja"]),
                )
        conn.execute("DELETE FROM pedido_compra_item WHERE pedido_id = ?", (pedido_id,))
        conn.execute("DELETE FROM pedido_compra WHERE id = ?", (pedido_id,))


def marcar_pedidos_enviados_whatsapp(token):
    """A mensagem de WhatsApp vale pra todos os pedidos da mesma leva (mesmo
    fornecedor, um bloco por loja), então marca todos eles juntos."""
    agora = datetime.now().isoformat(timespec="seconds")
    with conexao() as conn:
        conn.execute(
            "UPDATE pedido_compra SET whatsapp_enviado_em = COALESCE(whatsapp_enviado_em, ?) WHERE token = ?",
            (agora, token),
        )


def buscar_pedidos_por_token(token):
    """Link sem login mandado pro fornecedor confirmar o pedido — mesmo
    token agrupa todo pedido nascido da mesma leva de "Gerar pedidos" pro
    mesmo fornecedor (pode ter mais de uma loja, "feito em conjunto").
    Devolve None só quando o token não existe (link inválido); token de
    pedido antigo (nulo) nunca bate aqui, já que o WHERE exige não-nulo."""
    with conexao() as conn:
        linhas = conn.execute(
            "SELECT id FROM pedido_compra WHERE token = ? AND token IS NOT NULL", (token,)
        ).fetchall()
    if not linhas:
        return None
    return [buscar_pedido(linha["id"]) for linha in linhas]


def confirmar_pedidos_por_token(token):
    """Fornecedor confirma o recebimento do(s) pedido(s) dessa leva de uma
    vez só. Avança cada pedido ainda em 'enviado' pro estágio 'confirmado'
    — reaproveita avancar_status_pedido, não duplica a máquina de
    estágios. Pedido que já passou desse estágio (alguém já avançou pela
    tela interna) fica como está, não anda pra trás nem dá erro."""
    pedidos = buscar_pedidos_por_token(token)
    if pedidos is None:
        return None
    confirmados = 0
    for pedido in pedidos:
        if pedido["status"] == "enviado":
            avancar_status_pedido(pedido["id"])
            confirmados += 1
    return {"confirmados": confirmados, "total": len(pedidos)}


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


def confirmar_recebimento_pedido(pedido_id, recebido_por, valor_nf, itens, data_recebimento=None, numero_nf=None):
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
    de NF passaria batido sem ninguém saber.

    `data_recebimento` ('AAAA-MM-DD'): o dia em que a mercadoria chegou,
    escolhido na tela (2026-09-16 — a loja confirma dias depois e o
    registro tem de ficar com o dia da entrega). A hora gravada é a da
    confirmação; sem data, vale agora."""
    pedido = buscar_pedido(pedido_id)
    if not pedido:
        return None

    agora = datetime.now().isoformat()
    recebido_em = f"{data_recebimento}{agora[10:]}" if data_recebimento else agora
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
            SET status = ?, recebido_por = ?, recebido_em = ?, valor_nf = ?, numero_nf = ?,
                divergencia_nf = ?, atualizado_em = ?
            WHERE id = ?
            """,
            (ESTAGIOS_PEDIDO[-1], recebido_por, recebido_em, valor_nf,
             (numero_nf or '').strip() or pedido["numero_nf"], 1 if divergencia else 0, agora, pedido_id),
        )

    if divergencia:
        criar_tarefa(
            titulo=f"Divergência de NF — Pedido #{pedido_id} ({pedido['fornecedor_nome']})",
            descricao=(
                f"Valor da Nota Fiscal informado (R$ {valor_nf:.2f}) não bate com o valor "
                f"calculado dos itens recebidos (R$ {valor_calculado:.2f}). Recebido por "
                f"{recebido_por} em {recebido_em[:16].replace('T', ' ')}. Ligar pro fornecedor "
                f"({pedido['fornecedor_nome']}) pra entender a diferença."
            ),
            categoria="Estoque",
            prioridade="alta",
            data_limite=None,
        )

    return {"divergencia": divergencia, "valorCalculado": valor_calculado}


# --- FORNECEDOR HOMOLOGADO E PEDIDO DIRETO (2026-09-16) ----------------------
# Insumo com fornecedor homologado (preço já combinado, no cadastro do insumo)
# não passa por cotação: a Requisição manda ele direto em pedido pro
# fornecedor. Na VMarket, 68 dos 159 pedidos do último mês antes da migração
# saíram assim. "Novo pedido" em Pedidos usa o mesmo preço pra pedido extra.

TITULO_COTACAO_PEDIDOS_DIRETOS = "Pedidos diretos (preço homologado)"


def _homologados_validos(conn, fornecedor_id=None):
    """{insumo_id: {fornecedor_id, preco, nome}} dos insumos com fornecedor
    homologado ativo e preço combinado valendo hoje (validade em branco ou
    de hoje em diante). Com `fornecedor_id`, só os desse fornecedor."""
    parametros = [datetime.now().date().isoformat()]
    filtro = ""
    if fornecedor_id is not None:
        filtro = "AND i.fornecedor_homologado_id = ?"
        parametros.append(fornecedor_id)
    linhas = conn.execute(
        f"""
        SELECT i.id, i.nome, i.fornecedor_homologado_id, i.preco_homologado
        FROM insumo i
        JOIN fornecedor f ON f.id = i.fornecedor_homologado_id AND f.ativo = 1
        WHERE i.preco_homologado > 0
          AND (i.validade_preco_homologado IS NULL OR i.validade_preco_homologado >= ?)
          {filtro}
        """,
        parametros,
    ).fetchall()
    return {
        linha["id"]: {"fornecedor_id": linha["fornecedor_homologado_id"], "preco": linha["preco_homologado"], "nome": linha["nome"]}
        for linha in linhas
    }


def vincular_insumo_fornecedor(insumo_id, fornecedor_id):
    """Garante o insumo na lista de fornecedores que cotam ele — o
    homologado entra mesmo se não estiver marcado na tela."""
    with conexao() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO insumo_fornecedor (insumo_id, fornecedor_id) VALUES (?, ?)",
            (insumo_id, fornecedor_id),
        )


def _cotacao_oculta(conn, titulo):
    """Todo pedido pertence a uma cotação (Pedidos e Recebimentos buscam os
    dois juntos), então pedido que não saiu de cotação fica numa cotação
    marcada `pedido_direto`, que não aparece na lista de Cotações — uma por
    `titulo`: os pedidos diretos e as compras feitas por fora."""
    linha = conn.execute(
        "SELECT id FROM cotacao WHERE pedido_direto = 1 AND id_vmarket IS NULL AND titulo = ? ORDER BY id LIMIT 1",
        (titulo,),
    ).fetchone()
    if linha:
        return linha["id"]
    return conn.execute(
        "INSERT INTO cotacao (titulo, status, criado_em, pedido_direto) VALUES (?, 'fechada', ?, 1)",
        (titulo, datetime.now().isoformat()),
    ).lastrowid


def _cotacao_dos_pedidos_diretos(conn):
    return _cotacao_oculta(conn, TITULO_COTACAO_PEDIDOS_DIRETOS)


def _gravar_pedidos_diretos(conn, quantidades, precos, requisicao=None):
    """`quantidades`: {(fornecedor_id, loja, insumo_id): quantidade};
    `precos`: {insumo_id: preço homologado}. Um pedido por fornecedor × loja,
    e os do mesmo fornecedor dividem o token — um WhatsApp só, "feito em
    conjunto", como no "Gerar pedidos" da cotação. Nasce 'enviado' sem
    WhatsApp: em Pedidos aparece pendente de envio. O insumo passa a valer
    pra loja (insumo_loja + linha de estoque zerada), senão o recebimento não
    teria onde somar. `requisicao` = (título, prazo) de onde o pedido veio.
    Devolve [{id, fornecedorId, loja, token}]."""
    agora = datetime.now().isoformat()
    cotacao_id = _cotacao_dos_pedidos_diretos(conn)
    requisicao_titulo, requisicao_prazo = requisicao or (None, None)
    tokens, pedidos = {}, {}
    for (fornecedor_id, loja, insumo_id), quantidade in quantidades.items():
        if fornecedor_id not in tokens:
            tokens[fornecedor_id] = secrets.token_urlsafe(24)
        chave = (fornecedor_id, loja)
        if chave not in pedidos:
            pedidos[chave] = conn.execute(
                """
                INSERT INTO pedido_compra
                    (cotacao_id, fornecedor_id, loja, status, criado_em, token, requisicao_titulo, requisicao_prazo)
                VALUES (?, ?, ?, 'enviado', ?, ?, ?, ?)
                """,
                (cotacao_id, fornecedor_id, loja, agora, tokens[fornecedor_id], requisicao_titulo, requisicao_prazo),
            ).lastrowid
        conn.execute(
            "INSERT INTO pedido_compra_item (pedido_id, insumo_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)",
            (pedidos[chave], insumo_id, quantidade, precos[insumo_id]),
        )
        conn.execute("INSERT OR IGNORE INTO insumo_loja (insumo_id, loja) VALUES (?, ?)", (insumo_id, loja))
        conn.execute(
            "INSERT OR IGNORE INTO estoque_insumo (insumo_id, loja, quantidade_atual, estoque_minimo, atualizado_em) "
            "VALUES (?, ?, 0, 0, ?)",
            (insumo_id, loja, agora),
        )
    return [
        {"id": pedido_id, "fornecedorId": fornecedor_id, "loja": loja, "token": tokens[fornecedor_id]}
        for (fornecedor_id, loja), pedido_id in pedidos.items()
    ]


def criar_pedidos_diretos(fornecedor_id, itens):
    """"Novo pedido" em Pedidos: pedido extra pelo preço homologado, fora da
    Requisição. `itens`: [{insumoId, loja, quantidade}] (loja já validada).
    Só entra insumo que tem esse fornecedor como homologado e preço valendo;
    o preço é sempre o do cadastro, nunca o da tela. Levanta ValueError com a
    mensagem pra tela. Devolve [{id, fornecedorId, loja, token}]."""
    quantidades = {}
    for item in itens:
        if item["quantidade"] <= 0:
            continue
        chave = (fornecedor_id, item["loja"], item["insumoId"])
        quantidades[chave] = quantidades.get(chave, 0) + item["quantidade"]
    if not quantidades:
        raise ValueError("Informe a quantidade de pelo menos um insumo.")

    with conexao() as conn:
        if not conn.execute("SELECT 1 FROM fornecedor WHERE id = ?", (fornecedor_id,)).fetchone():
            raise ValueError("Fornecedor não encontrado.")
        validos = _homologados_validos(conn, fornecedor_id)
        for _, _, insumo_id in quantidades:
            if insumo_id not in validos:
                linha = conn.execute("SELECT nome FROM insumo WHERE id = ?", (insumo_id,)).fetchone()
                nome = linha["nome"] if linha else "Um dos insumos"
                raise ValueError(f"{nome} não tem preço homologado valendo com esse fornecedor.")
        return _gravar_pedidos_diretos(conn, quantidades, {insumo_id: v["preco"] for insumo_id, v in validos.items()})


# --- COMPRA FEITA POR FORA (2026-09-17) ---------------------------------------
# Card #36 do ClickUp: o que se compra sem passar por cotação nem pedido daqui
# (mercado, padaria, entrega combinada no WhatsApp) também é lançado, com quem
# comprou, a data e a nota fiscal.

TITULO_COTACAO_COMPRAS_FORA = "Compras feitas por fora"


def _fornecedor_da_compra_fora(conn, fornecedor):
    """{"id"} de um fornecedor cadastrado, ou {"nome"}: casa pelo nome
    normalizado e, se não achar, cadastra um fornecedor novo só com o nome."""
    if fornecedor.get("id"):
        linha = conn.execute("SELECT id FROM fornecedor WHERE id = ?", (fornecedor["id"],)).fetchone()
        if not linha:
            raise ValueError("Fornecedor não encontrado.")
        return linha["id"]
    nome = (fornecedor.get("nome") or "").strip()
    if not nome:
        raise ValueError("Informe onde foi comprado.")
    alvo = _normalizar_nome_insumo(nome)
    for linha in conn.execute("SELECT id, nome FROM fornecedor ORDER BY ativo DESC, id").fetchall():
        if _normalizar_nome_insumo(linha["nome"]) == alvo:
            return linha["id"]
    return conn.execute(
        "INSERT INTO fornecedor (nome, criado_em) VALUES (?, ?)", (nome, datetime.now().isoformat())
    ).lastrowid


def lancar_compra_fora(fornecedor, loja, comprado_por, data_compra, itens, numero_nf=None, valor_nf=None,
                       somar_estoque=True, nota_fiscal_arquivo=None):
    """Grava a compra como pedido já recebido, numa cotação oculta própria:
    quem comprou fica em recebido_por e o dia da compra ('AAAA-MM-DD') em
    recebido_em, então o preço vira a última compra e o custo do insumo,
    igual a um recebimento. `itens`: [{insumoId, quantidade, precoUnitario}]
    na unidade do insumo. Com `somar_estoque`, as quantidades entram no
    estoque da loja (compra antiga que a contagem já pegou vai sem somar).
    O insumo passa a valer pra loja e o fornecedor ganha a loja. Levanta
    ValueError com a mensagem pra tela. Devolve o id do pedido."""
    if not itens:
        raise ValueError("Adicione pelo menos um item da compra.")
    agora = datetime.now().isoformat()
    quando = f"{data_compra}{agora[10:]}"
    with conexao() as conn:
        vistos = set()
        for item in itens:
            linha = conn.execute("SELECT nome FROM insumo WHERE id = ?", (item["insumoId"],)).fetchone()
            if not linha:
                raise ValueError("Um dos insumos não existe mais. Abra a compra de novo.")
            if item["insumoId"] in vistos:
                raise ValueError(f"{linha['nome']} aparece duas vezes. Junte numa linha só.")
            vistos.add(item["insumoId"])
            if not item["quantidade"] > 0:
                raise ValueError(f"Informe a quantidade de {linha['nome']}.")
            if not item["precoUnitario"] >= 0:
                raise ValueError(f"O preço de {linha['nome']} não pode ser negativo.")
        fornecedor_id = _fornecedor_da_compra_fora(conn, fornecedor)
        total = round(sum(item["quantidade"] * item["precoUnitario"] for item in itens), 2)
        pedido_id = conn.execute(
            """
            INSERT INTO pedido_compra
                (cotacao_id, fornecedor_id, loja, status, criado_em, atualizado_em, whatsapp_enviado_em,
                 recebido_por, recebido_em, valor_nf, divergencia_nf, compra_fora, numero_nf,
                 nota_fiscal_arquivo, somou_estoque)
            VALUES (?, ?, ?, 'recebido', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
            """,
            (
                _cotacao_oculta(conn, TITULO_COTACAO_COMPRAS_FORA), fornecedor_id, loja, quando, agora, quando,
                comprado_por, quando, valor_nf,
                1 if valor_nf is not None and abs(valor_nf - total) > 0.05 else 0,
                numero_nf or None, nota_fiscal_arquivo, 1 if somar_estoque else 0,
            ),
        ).lastrowid
        for item in itens:
            conn.execute(
                "INSERT INTO pedido_compra_item (pedido_id, insumo_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)",
                (pedido_id, item["insumoId"], item["quantidade"], item["precoUnitario"]),
            )
            conn.execute("INSERT OR IGNORE INTO insumo_loja (insumo_id, loja) VALUES (?, ?)", (item["insumoId"], loja))
            conn.execute(
                "INSERT OR IGNORE INTO estoque_insumo (insumo_id, loja, quantidade_atual, estoque_minimo, atualizado_em) "
                "VALUES (?, ?, 0, 0, ?)",
                (item["insumoId"], loja, agora),
            )
            if somar_estoque:
                conn.execute(
                    "UPDATE estoque_insumo SET quantidade_atual = quantidade_atual + ?, atualizado_em = ? "
                    "WHERE insumo_id = ? AND loja = ?",
                    (item["quantidade"], agora, item["insumoId"], loja),
                )
        conn.execute(
            "INSERT OR IGNORE INTO fornecedor_loja (fornecedor_id, loja) VALUES (?, ?)", (fornecedor_id, loja)
        )
    return pedido_id


# --- PENDÊNCIAS DE COMPRAS NO MENU (2026-09-16) ------------------------------
# Quanto está parado em cada etapa, pro menu de Compras mostrar um número ao
# lado de Requisições, Cotações, Pedidos e Recebimentos (a Julia preferiu isso
# a uma tela de painel).

DIAS_ENTREGA_ATRASADA = 3   # pedido enviado há mais que isso e não recebido
DIAS_PENDENCIA_COMPRAS = 30  # contagem e cotação mais velhas que isso são abandono, não pendência


def pendencias_compras():
    """Contagens por etapa: contagem que a loja não respondeu ou que espera
    aprovação (e quantas venceram o prazo), fornecedor convidado que não
    mandou preço, cotação aberta com insumo sem vencedor ou pronto pra virar
    pedido, pedido gerado que não foi pro WhatsApp e pedido esperando
    entrega — atrasado depois de DIAS_ENTREGA_ATRASADA dias do envio (ou da
    criação, se não passou pelo WhatsApp). Pedido não tem corte de data:
    entrega que não chegou é pendência até alguém confirmar."""
    agora = datetime.now()
    agora_minuto = agora.isoformat()[:16]
    corte = (agora - timedelta(days=DIAS_PENDENCIA_COMPRAS)).isoformat()
    with conexao() as conn:
        contagens = conn.execute(
            "SELECT status, prazo_validade FROM contagem WHERE status IN ('aberta', 'respondida') AND criado_em >= ?",
            (corte,),
        ).fetchall()
        convites = conn.execute(
            """
            SELECT cv.prazo_validade
            FROM cotacao_convite cv
            JOIN cotacao c ON c.id = cv.cotacao_id
            WHERE cv.status = 'aberta' AND c.status = 'aberta' AND c.pedido_direto = 0 AND c.criado_em >= ?
            """,
            (corte,),
        ).fetchall()
        cotacoes_abertas = [
            linha["id"]
            for linha in conn.execute(
                "SELECT id FROM cotacao WHERE status = 'aberta' AND pedido_direto = 0 AND criado_em >= ?", (corte,)
            ).fetchall()
        ]
        marcadores = ",".join("?" * len(cotacoes_abertas)) or "NULL"

        def pares(sql, parametros):
            return {(linha[0], linha[1]) for linha in conn.execute(sql, parametros).fetchall()}

        cotados = pares(
            f"SELECT cotacao_id, insumo_id FROM cotacao_item WHERE cotacao_id IN ({marcadores}) "
            f"UNION SELECT cotacao_id, insumo_id FROM cotacao_preco WHERE cotacao_id IN ({marcadores})",
            cotacoes_abertas * 2,
        )
        com_vencedor = pares(
            f"SELECT cotacao_id, insumo_id FROM cotacao_preco WHERE selecionado = 1 AND cotacao_id IN ({marcadores})",
            cotacoes_abertas,
        )
        com_quebra_por_loja = pares(
            f"SELECT cotacao_id, insumo_id FROM cotacao_item_loja WHERE cotacao_id IN ({marcadores})",
            cotacoes_abertas,
        )
        ja_pedidos = pares(
            f"""
            SELECT pc.cotacao_id, pi.insumo_id
            FROM pedido_compra_item pi JOIN pedido_compra pc ON pc.id = pi.pedido_id
            WHERE pc.cotacao_id IN ({marcadores})
            """,
            cotacoes_abertas,
        )
        pedidos = conn.execute(
            "SELECT status, criado_em, whatsapp_enviado_em FROM pedido_compra WHERE status != 'recebido'"
        ).fetchall()

    # Cotação parada: tem insumo sem vencedor, ou vencedor que ainda não virou
    # pedido (só conta o que tem quebra por loja, que é o que "Gerar pedidos" usa).
    parados = {par[0] for par in cotados - com_vencedor}
    parados |= {par[0] for par in (com_vencedor & com_quebra_por_loja) - ja_pedidos}

    nao_enviados = atrasadas = no_prazo = 0
    for pedido in pedidos:
        if pedido["status"] == "enviado" and not pedido["whatsapp_enviado_em"]:
            nao_enviados += 1
            continue
        try:
            dias = (agora - datetime.fromisoformat(pedido["whatsapp_enviado_em"] or pedido["criado_em"])).days
        except (TypeError, ValueError):
            dias = 0
        if dias > DIAS_ENTREGA_ATRASADA:
            atrasadas += 1
        else:
            no_prazo += 1

    return {
        "contagensSemResposta": sum(1 for c in contagens if c["status"] == "aberta"),
        "contagensVencidas": sum(1 for c in contagens if c["status"] == "aberta" and (c["prazo_validade"] or "") < agora_minuto),
        "contagensPraAprovar": sum(1 for c in contagens if c["status"] == "respondida"),
        "fornecedoresSemPreco": len(convites),
        "convitesVencidos": sum(1 for cv in convites if (cv["prazo_validade"] or "") < agora_minuto),
        "cotacoesParadas": len(parados),
        "pedidosNaoEnviados": nao_enviados,
        "entregasAtrasadas": atrasadas,
        "entregasNoPrazo": no_prazo,
        "diasEntregaAtrasada": DIAS_ENTREGA_ATRASADA,
    }


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
        # Pedido direto (fornecedor homologado) que nasceu dessa requisição.
        conn.execute(
            "DELETE FROM pedido_compra_item WHERE pedido_id IN "
            "(SELECT id FROM pedido_compra WHERE requisicao_titulo = ? AND requisicao_prazo = ?)",
            (titulo, prazo_validade),
        )
        conn.execute(
            "DELETE FROM pedido_compra WHERE requisicao_titulo = ? AND requisicao_prazo = ?",
            (titulo, prazo_validade),
        )
        conn.execute(
            "DELETE FROM contagem_item WHERE contagem_id IN (SELECT id FROM contagem WHERE descricao = ? AND prazo_validade = ?)",
            (titulo, prazo_validade),
        )
        conn.execute(
            "DELETE FROM contagem WHERE descricao = ? AND prazo_validade = ?",
            (titulo, prazo_validade),
        )


# --- HISTÓRICO DA VMARKET (carga de 2026-09-16) ------------------------------
#
# A rede está saindo da VMarket e passando a cotar, pedir e contar só aqui.
# O último mês de lá entra nas mesmas tabelas do fluxo de Compras, como se
# tivesse sido feito no AdmFood: fornecedores, cotações (preço de cada
# fornecedor e o escolhido), pedidos e contagens por loja. Quem monta a carga
# (lendo a VMarket) já manda tudo com o insumo e a unidade do AdmFood; aqui só
# se grava. Cada registro guarda o id de lá (`id_vmarket`), então rodar de
# novo não duplica.
#
# Nada disso mexe em estoque_insumo: a contagem entra como histórico já
# aprovado e o pedido antigo entra como recebido sem somar nada. Pedido ainda
# não recebido entra como enviado e aparece em Recebimentos — é lá que a loja
# confirma o que chegou, e só então soma no estoque.

RECEBIDO_POR_VMARKET = "Importado da VMarket"


class _ValidaCargaVmarket:
    """Confere insumo e loja de cada linha da carga antes de gravar. O insumo
    vem pelo id daqui ou, se saiu de linha e foi criado pela carga, como
    "vm:<id do produto na VMarket>"."""

    def __init__(self, conn, lojas):
        self.conn = conn
        self.insumos = {linha["id"] for linha in conn.execute("SELECT id FROM insumo").fetchall()}
        self.lojas = set(lojas)

    def insumo(self, insumo_id):
        if isinstance(insumo_id, str) and insumo_id.startswith("vm:"):
            linha = self.conn.execute("SELECT id FROM insumo WHERE id_vmarket = ?", (insumo_id[3:],)).fetchone()
            if not linha:
                raise ValueError(f"Produto {insumo_id[3:]} da VMarket ainda não virou insumo.")
            return linha["id"]
        insumo_id = int(insumo_id)
        if insumo_id not in self.insumos:
            raise ValueError(f"Insumo {insumo_id} não existe.")
        return insumo_id

    def loja(self, loja):
        if loja not in self.lojas:
            raise ValueError(f"Loja inválida: {loja}.")
        return loja


def importar_da_vmarket(dados, lojas):
    """Grava a carga (ou um lote dela): {"fornecedores", "insumosNovos",
    "precosHomologados", "cotacoes", "pedidos", "contagens"}, cada parte
    opcional, nessa ordem. Tudo numa transação: um item inválido desfaz o
    lote inteiro. `lojas` = nomes das lojas válidas."""
    resumo = {
        "fornecedoresCriados": 0, "fornecedoresVinculados": 0,
        "insumosCriados": 0, "insumosJaImportados": 0,
        "cotacoes": 0, "precos": 0,
        "pedidosCriados": 0, "pedidosJaImportados": 0,
        "contagensCriadas": 0, "contagensJaImportadas": 0,
        "precosHomologados": 0,
    }
    with conexao() as conn:
        valida = _ValidaCargaVmarket(conn, lojas)
        for fornecedor in dados.get("fornecedores") or []:
            _importar_fornecedor_vmarket(conn, fornecedor, valida, resumo)
        for insumo in dados.get("insumosNovos") or []:
            _importar_insumo_vmarket(conn, insumo, valida, resumo)
        for preco in dados.get("precosHomologados") or []:
            _importar_preco_homologado_vmarket(conn, preco, valida, resumo)
        for cotacao in dados.get("cotacoes") or []:
            _importar_cotacao_vmarket(conn, cotacao, valida, resumo)
        for pedido in dados.get("pedidos") or []:
            _importar_pedido_vmarket(conn, pedido, valida, resumo)
        for contagem in dados.get("contagens") or []:
            _importar_contagem_vmarket(conn, contagem, valida, resumo)
    return resumo


def _importar_preco_homologado_vmarket(conn, preco, valida, resumo):
    """Produto homologado na VMarket: vira o fornecedor homologado do insumo,
    com o preço (já na unidade do insumo daqui) e a validade. Importar de
    novo troca. Desfazer a carga não apaga (igual aos fornecedores)."""
    valor = float(preco["preco"])
    if valor <= 0:
        raise ValueError(f"Preço homologado inválido pro insumo {preco['insumoId']}.")
    insumo_id = valida.insumo(preco["insumoId"])
    fornecedor_id = _fornecedor_da_vmarket(conn, preco["fornecedorVmarket"])
    conn.execute(
        "UPDATE insumo SET fornecedor_homologado_id = ?, preco_homologado = ?, validade_preco_homologado = ? WHERE id = ?",
        (fornecedor_id, valor, preco.get("validade") or None, insumo_id),
    )
    conn.execute(
        "INSERT OR IGNORE INTO insumo_fornecedor (insumo_id, fornecedor_id) VALUES (?, ?)",
        (insumo_id, fornecedor_id),
    )
    resumo["precosHomologados"] += 1


CATEGORIA_FORA_DE_LINHA = "Fora de linha"


def _importar_insumo_vmarket(conn, insumo, valida, resumo):
    """Produto que a rede comprou na VMarket e que não existe aqui (saiu de
    linha, 2026-09-17): vira insumo "Fora de linha", com a unidade de lá e o
    estoque zerado nas lojas, mas sem valer pra nenhuma — não entra em
    contagem nem nas tabelas do Estoque. Guarda o id de lá, então importar de
    novo não duplica. Desfazer a carga não apaga (igual aos fornecedores)."""
    id_vmarket = str(insumo["idVmarket"])
    if conn.execute("SELECT 1 FROM insumo WHERE id_vmarket = ?", (id_vmarket,)).fetchone():
        resumo["insumosJaImportados"] += 1
        return
    nome = (insumo.get("nome") or "").strip()
    if not nome:
        raise ValueError(f"Produto {id_vmarket} da VMarket sem nome.")
    insumo_id = conn.execute(
        "INSERT INTO insumo (nome, categoria, unidade_medida, id_vmarket) VALUES (?, ?, ?, ?)",
        (nome, CATEGORIA_FORA_DE_LINHA, (insumo.get("unidadeMedida") or "").strip() or "un", id_vmarket),
    ).lastrowid
    agora = datetime.now().isoformat()
    for loja in sorted(valida.lojas):
        conn.execute(
            "INSERT INTO estoque_insumo (insumo_id, loja, quantidade_atual, estoque_minimo, atualizado_em) "
            "VALUES (?, ?, 0, 0, ?)",
            (insumo_id, loja, agora),
        )
    valida.insumos.add(insumo_id)
    resumo["insumosCriados"] += 1


def _fornecedor_da_vmarket(conn, id_vmarket):
    linha = conn.execute("SELECT id FROM fornecedor WHERE id_vmarket = ?", (str(id_vmarket),)).fetchone()
    if not linha:
        raise ValueError(f"Fornecedor {id_vmarket} da VMarket ainda não foi importado.")
    return linha["id"]


def _importar_fornecedor_vmarket(conn, fornecedor, valida, resumo):
    """Casa com o fornecedor já cadastrado aqui (pelo id de lá, pelo CNPJ ou
    pelo nome) antes de criar um novo. Do cadastro existente só preenche o
    que estiver vazio: o que foi digitado no AdmFood manda."""
    id_vmarket = str(fornecedor["idVmarket"])
    nome = (fornecedor.get("nome") or "").strip()
    cnpj = re.sub(r"\D", "", fornecedor.get("cnpj") or "")
    linha = conn.execute("SELECT id FROM fornecedor WHERE id_vmarket = ?", (id_vmarket,)).fetchone()
    if linha:
        fornecedor_id = linha["id"]
    else:
        candidatos = conn.execute("SELECT id, nome, cnpj FROM fornecedor WHERE id_vmarket IS NULL").fetchall()
        igual = next((c for c in candidatos if cnpj and re.sub(r"\D", "", c["cnpj"] or "") == cnpj), None) or next(
            (c for c in candidatos if _normalizar_nome_insumo(c["nome"]) == _normalizar_nome_insumo(nome)), None
        )
        if igual:
            fornecedor_id = igual["id"]
            conn.execute("UPDATE fornecedor SET id_vmarket = ? WHERE id = ?", (id_vmarket, fornecedor_id))
            resumo["fornecedoresVinculados"] += 1
        else:
            if not nome:
                raise ValueError(f"Fornecedor {id_vmarket} sem nome.")
            fornecedor_id = conn.execute(
                "INSERT INTO fornecedor (nome, criado_em, id_vmarket) VALUES (?, ?, ?)",
                (nome, datetime.now().isoformat(), id_vmarket),
            ).lastrowid
            resumo["fornecedoresCriados"] += 1
    conn.execute(
        """
        UPDATE fornecedor SET
            cnpj = CASE WHEN cnpj = '' THEN ? ELSE cnpj END,
            contato_nome = CASE WHEN contato_nome = '' THEN ? ELSE contato_nome END,
            contato_telefone = CASE WHEN contato_telefone = '' THEN ? ELSE contato_telefone END,
            contato_email = CASE WHEN contato_email = '' THEN ? ELSE contato_email END
        WHERE id = ?
        """,
        (cnpj, fornecedor.get("contatoNome") or "", re.sub(r"\D", "", fornecedor.get("telefone") or ""),
         fornecedor.get("email") or "", fornecedor_id),
    )
    for loja in fornecedor.get("lojas") or []:
        conn.execute(
            "INSERT OR IGNORE INTO fornecedor_loja (fornecedor_id, loja) VALUES (?, ?)",
            (fornecedor_id, valida.loja(loja)),
        )


def _importar_cotacao_vmarket(conn, cotacao, valida, resumo):
    """Cotação fechada com o preço de cada fornecedor por insumo (já na
    unidade do insumo) e o escolhido marcado. Importar de novo substitui os
    preços. `requisicaoTitulo`/`requisicaoPrazo` ligam a cotação às
    contagens da mesma semana, como uma cotação gerada pela Requisição."""
    id_vmarket = str(cotacao["idVmarket"])
    campos = (cotacao["titulo"], cotacao["criadoEm"], cotacao.get("requisicaoTitulo"), cotacao.get("requisicaoPrazo"))
    linha = conn.execute("SELECT id FROM cotacao WHERE id_vmarket = ?", (id_vmarket,)).fetchone()
    if linha:
        cotacao_id = linha["id"]
        conn.execute(
            "UPDATE cotacao SET titulo = ?, criado_em = ?, requisicao_titulo = ?, requisicao_prazo = ? WHERE id = ?",
            (*campos, cotacao_id),
        )
        conn.execute("DELETE FROM cotacao_preco WHERE cotacao_id = ?", (cotacao_id,))
        conn.execute("DELETE FROM cotacao_item WHERE cotacao_id = ?", (cotacao_id,))
    else:
        cotacao_id = conn.execute(
            "INSERT INTO cotacao (titulo, status, criado_em, requisicao_titulo, requisicao_prazo, id_vmarket) "
            "VALUES (?, 'fechada', ?, ?, ?, ?)",
            (*campos, id_vmarket),
        ).lastrowid
    for item in cotacao.get("itens") or []:
        conn.execute(
            """
            INSERT INTO cotacao_item (cotacao_id, insumo_id, quantidade_total) VALUES (?, ?, ?)
            ON CONFLICT (cotacao_id, insumo_id) DO UPDATE SET quantidade_total = quantidade_total + excluded.quantidade_total
            """,
            (cotacao_id, valida.insumo(item["insumoId"]), float(item["quantidade"])),
        )
    for preco in cotacao.get("precos") or []:
        insumo_id = valida.insumo(preco["insumoId"])
        fornecedor_id = _fornecedor_da_vmarket(conn, preco["fornecedorVmarket"])
        conn.execute(
            """
            INSERT INTO cotacao_preco (cotacao_id, insumo_id, fornecedor_id, preco, selecionado, criado_em)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (cotacao_id, insumo_id, fornecedor_id) DO UPDATE SET
                preco = excluded.preco, selecionado = excluded.selecionado, criado_em = excluded.criado_em
            """,
            (cotacao_id, insumo_id, fornecedor_id, float(preco["preco"]), 1 if preco.get("selecionado") else 0,
             preco.get("criadoEm") or cotacao["criadoEm"]),
        )
        conn.execute(
            "INSERT OR IGNORE INTO insumo_fornecedor (insumo_id, fornecedor_id) VALUES (?, ?)",
            (insumo_id, fornecedor_id),
        )
        resumo["precos"] += 1
    resumo["cotacoes"] += 1


def _cotacao_dos_pedidos_avulsos(conn):
    """Pedido de produto homologado na VMarket não passa por cotação, mas
    todo pedido daqui pertence a uma: ficam todos numa cotação só."""
    linha = conn.execute("SELECT id FROM cotacao WHERE id_vmarket = 'pedidos-sem-cotacao'").fetchone()
    if linha:
        return linha["id"]
    return conn.execute(
        "INSERT INTO cotacao (titulo, status, criado_em, id_vmarket, pedido_direto) VALUES (?, 'fechada', ?, 'pedidos-sem-cotacao', 1)",
        ("Pedidos da VMarket sem cotação (produtos homologados)", datetime.now().isoformat()),
    ).lastrowid


def _importar_pedido_vmarket(conn, pedido, valida, resumo):
    """Pedido já importado não é tocado de novo: a loja pode ter confirmado o
    recebimento aqui depois da primeira carga."""
    id_vmarket = str(pedido["idVmarket"])
    if conn.execute("SELECT 1 FROM pedido_compra WHERE id_vmarket = ?", (id_vmarket,)).fetchone():
        resumo["pedidosJaImportados"] += 1
        return
    cotacao = None
    if pedido.get("cotacaoVmarket"):
        cotacao = conn.execute(
            "SELECT id FROM cotacao WHERE id_vmarket = ?", (str(pedido["cotacaoVmarket"]),)
        ).fetchone()
    cotacao_id = cotacao["id"] if cotacao else _cotacao_dos_pedidos_avulsos(conn)
    recebido = pedido.get("status") == "recebido"
    criado_em = pedido["criadoEm"]
    pedido_id = conn.execute(
        """
        INSERT INTO pedido_compra
            (cotacao_id, fornecedor_id, loja, status, criado_em, atualizado_em, whatsapp_enviado_em,
             recebido_por, recebido_em, id_vmarket)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            cotacao_id, _fornecedor_da_vmarket(conn, pedido["fornecedorVmarket"]), valida.loja(pedido["loja"]),
            "recebido" if recebido else "enviado", criado_em, criado_em, criado_em,
            RECEBIDO_POR_VMARKET if recebido else None, (pedido.get("recebidoEm") or criado_em) if recebido else None,
            id_vmarket,
        ),
    ).lastrowid
    for item in pedido.get("itens") or []:
        conn.execute(
            """
            INSERT INTO pedido_compra_item (pedido_id, insumo_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)
            ON CONFLICT (pedido_id, insumo_id) DO UPDATE SET quantidade = quantidade + excluded.quantidade
            """,
            (pedido_id, valida.insumo(item["insumoId"]), float(item["quantidade"]), float(item["precoUnitario"])),
        )
    resumo["pedidosCriados"] += 1


def _importar_contagem_vmarket(conn, contagem, valida, resumo):
    """Uma contagem por loja, já aprovada — o estoque não muda. Mesmo título
    e prazo nas três lojas da semana, que é como a tela agrupa a
    Requisição."""
    id_vmarket = str(contagem["idVmarket"])
    if conn.execute("SELECT 1 FROM contagem WHERE id_vmarket = ?", (id_vmarket,)).fetchone():
        resumo["contagensJaImportadas"] += 1
        return
    criado_em = contagem["criadoEm"]
    respondida_em = contagem.get("respondidaEm") or criado_em
    contagem_id = conn.execute(
        """
        INSERT INTO contagem
            (token, loja, descricao, prazo_validade, status, criado_em, respondida_em, aprovada_em, id_vmarket)
        VALUES (?, ?, ?, ?, 'aprovada', ?, ?, ?, ?)
        """,
        (secrets.token_urlsafe(24), valida.loja(contagem["loja"]), contagem["descricao"],
         contagem["prazoValidade"], criado_em, respondida_em, respondida_em, id_vmarket),
    ).lastrowid
    for item in contagem.get("itens") or []:
        conn.execute(
            "INSERT OR REPLACE INTO contagem_item (contagem_id, insumo_id, quantidade_preenchida) VALUES (?, ?, ?)",
            (contagem_id, valida.insumo(item["insumoId"]), float(item["quantidade"])),
        )
    resumo["contagensCriadas"] += 1


def desfazer_importacao_vmarket():
    """Tira o que a carga da VMarket criou em cotações, pedidos e contagens,
    pra corrigir e importar de novo. Pedido que a loja já confirmou como
    recebido aqui fica — esse já mexeu no estoque. Os fornecedores ficam
    (muitos já existiam antes e só ganharam o id de lá)."""
    with conexao() as conn:
        pedidos = [
            linha["id"] for linha in conn.execute(
                "SELECT id FROM pedido_compra WHERE id_vmarket IS NOT NULL "
                "AND (recebido_por IS NULL OR recebido_por = ?)",
                (RECEBIDO_POR_VMARKET,),
            ).fetchall()
        ]
        for pedido_id in pedidos:
            conn.execute("DELETE FROM pedido_compra_item WHERE pedido_id = ?", (pedido_id,))
            conn.execute("DELETE FROM pedido_compra WHERE id = ?", (pedido_id,))
        contagens = [linha["id"] for linha in conn.execute("SELECT id FROM contagem WHERE id_vmarket IS NOT NULL")]
        for contagem_id in contagens:
            conn.execute("DELETE FROM contagem_item WHERE contagem_id = ?", (contagem_id,))
            conn.execute("DELETE FROM contagem WHERE id = ?", (contagem_id,))
        # Cotação com pedido que ficou (recebido pela loja) não pode sumir.
        cotacoes = [
            linha["id"] for linha in conn.execute(
                "SELECT id FROM cotacao WHERE id_vmarket IS NOT NULL "
                "AND id NOT IN (SELECT cotacao_id FROM pedido_compra)"
            ).fetchall()
        ]
        for cotacao_id in cotacoes:
            conn.execute("DELETE FROM cotacao_preco WHERE cotacao_id = ?", (cotacao_id,))
            conn.execute("DELETE FROM cotacao_item WHERE cotacao_id = ?", (cotacao_id,))
            conn.execute("DELETE FROM cotacao WHERE id = ?", (cotacao_id,))
    return {"pedidos": len(pedidos), "contagens": len(contagens), "cotacoes": len(cotacoes)}


DIAS_COBERTURA_IDEAL = 7  # mesma constante do front (script.js) — cotação é semanal


def _mapa_consumo_medio_loja(loja, dias_historico=30):
    fim = datetime.now().date()
    inicio = fim - timedelta(days=dias_historico - 1)
    linhas = consumo_medio_insumo(inicio.isoformat(), fim.isoformat(), loja)
    return {linha["insumoId"]: linha["consumoMedioDiario"] for linha in linhas}


def _mapa_minimo_loja(loja):
    with conexao() as conn:
        linhas = conn.execute(
            "SELECT insumo_id, estoque_minimo FROM estoque_insumo WHERE loja = ?",
            (loja,),
        ).fetchall()
    return {linha["insumo_id"]: linha["estoque_minimo"] for linha in linhas}


def criar_contagem(loja, descricao, prazo_validade, categorias=None):
    """Abre uma contagem pra uma loja — gera um token opaco (o link que vai
    pro funcionário, sem precisar de login) e já grava uma linha só pros
    insumos que essa loja usa (`insumo_loja`), dentro das categorias
    escolhidas se filtrado, esperando preenchimento. `categorias` vazio/None
    inclui todos os insumos dessa loja. Assim o funcionário do Artesanos não
    vê insumo que só existe nos Tradiças, e vice-versa (ajustável na tela
    "Insumos da loja" do Estoque).

    Mistura feita na casa (com receita) fica de fora: ela não é contada,
    só os insumos comprados (Julia, 2026-09-15)."""
    token = secrets.token_urlsafe(24)
    agora = datetime.now().isoformat()
    with conexao() as conn:
        if categorias:
            marcadores = ", ".join("?" for _ in categorias)
            linhas = conn.execute(
                f"""
                SELECT i.id FROM insumo i
                JOIN insumo_loja il ON il.insumo_id = i.id AND il.loja = ?
                WHERE i.categoria IN ({marcadores}) AND i.rendimento_receita IS NULL
                """,
                [loja, *categorias],
            ).fetchall()
        else:
            linhas = conn.execute(
                """
                SELECT i.id FROM insumo i
                JOIN insumo_loja il ON il.insumo_id = i.id AND il.loja = ?
                WHERE i.rendimento_receita IS NULL
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


def salvar_quantidade_atual_insumo(loja, insumo_id, quantidade, estoque_minimo=None):
    """Sobrescreve a quantidade atual em estoque de um insumo numa loja —
    mesmo UPDATE do modal individual "Editar estoque", só que chamado em
    lote (ver salvar_quantidades_atuais_em_lote). `estoque_minimo` é
    opcional: quando vem None, só a quantidade atual é tocada (a coluna do
    mínimo fica como está)."""
    agora = datetime.now().isoformat()
    with conexao() as conn:
        if estoque_minimo is None:
            conn.execute(
                "UPDATE estoque_insumo SET quantidade_atual = ?, atualizado_em = ? WHERE insumo_id = ? AND loja = ?",
                (quantidade, agora, insumo_id, loja),
            )
        else:
            conn.execute(
                "UPDATE estoque_insumo SET quantidade_atual = ?, estoque_minimo = ?, atualizado_em = ? WHERE insumo_id = ? AND loja = ?",
                (quantidade, estoque_minimo, agora, insumo_id, loja),
            )


def salvar_quantidades_atuais_em_lote(loja, valores, minimos=None):
    """`valores` = {insumo_id: quantidade} e `minimos` = {insumo_id:
    estoque_minimo} (opcional) — atualiza a quantidade em estoque (e o
    mínimo, quando vier) de vários insumos de uma vez (mesmo espírito de
    salvar_ajustes_quantidade_ideal_em_lote, mas pra quantidade atual, não
    ideal) — pensado pra importar uma contagem física ou um relatório
    externo (ex: exportação de outro sistema) de uma vez, em vez de editar
    um por um pelo lápis. Construído em 2026-09-04 a pedido da Julia, pra
    trazer QE (quantidade em estoque) da VMarket pro AdmFood; a coluna do
    mínimo entrou junto quando ela mandou a planilha do Açaí Na Lata, que
    tem estoque atual e quantidade mínima lado a lado."""
    minimos = minimos or {}
    for insumo_id, valor in valores.items():
        salvar_quantidade_atual_insumo(loja, insumo_id, valor, minimos.get(insumo_id))
    return len(valores)


def excluir_ajuste_quantidade_ideal(loja, insumo_id):
    """Remove o ajuste manual — volta a mostrar o valor calculado."""
    with conexao() as conn:
        conn.execute(
            "DELETE FROM ajuste_quantidade_ideal WHERE loja = ? AND insumo_id = ?",
            (loja, insumo_id),
        )


def excluir_ajustes_quantidade_ideal_da_loja(loja):
    """Remove TODOS os ajustes manuais de uma loja de uma vez — pra desfazer
    em lote um import que acabou virando ajuste sem querer (caso real: a
    planilha do Açaí foi importada tanto como estoque mínimo quanto,
    por engano, como ajuste manual de quantidade ideal, 2026-09-04).
    Retorna quantos ajustes foram removidos."""
    with conexao() as conn:
        cursor = conn.execute("DELETE FROM ajuste_quantidade_ideal WHERE loja = ?", (loja,))
        return cursor.rowcount


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
    loja de origem quando existir, senão o estoque mínimo dela) pra loja
    de destino, virando um ajuste manual lá. Não é mágica: é só um jeito
    rápido de começar com um número razoável antes da loja nova ter
    venda suficiente pra calcular sozinha."""
    mapa_minimo_origem = _mapa_minimo_loja(loja_origem)
    mapa_ajustes_origem = mapa_ajustes_quantidade_ideal(loja_origem)
    with conexao() as conn:
        insumo_ids = [linha["id"] for linha in conn.execute("SELECT id FROM insumo").fetchall()]

    copiados = 0
    for insumo_id in insumo_ids:
        if insumo_id in mapa_ajustes_origem:
            valor = mapa_ajustes_origem[insumo_id]
        else:
            valor = mapa_minimo_origem.get(insumo_id) or None
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
    """Itens da contagem + quantidade ideal (estoque mínimo cadastrado × o
    multiplicador de alguma data especial ativa, ou o ajuste manual da
    Kethllyn quando existir um pra esse insumo/loja — o ajuste sempre
    ganha da data especial, é a palavra final dela) pra servir de
    referência tanto na tela pública de preenchimento quanto na
    conferência. Usava consumo médio × 7 dias antes (2026-08-27), mas a
    Julia pediu pra trocar pra estoque mínimo (2026-09-04) — a Ficha
    Técnica ainda não cobre a maioria dos insumos, então o consumo médio
    ficava "—" quase sempre; mínimo é um número que já existe e em que
    ela confia."""
    mapa_minimo = _mapa_minimo_loja(loja)
    mapa_ajustes = mapa_ajustes_quantidade_ideal(loja)
    multiplicador = multiplicador_quantidade_ideal(loja)
    # Custo pra "Previsão compra" do link (sugestão × custo), no formato do
    # link da VMarket que a Julia usa de modelo (11/09/2026).
    custos = custo_em_uso_por_insumo()
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT ci.insumo_id, ci.quantidade_preenchida,
                   i.nome, i.categoria, i.unidade_medida, i.marca_homologada,
                   i.fator_conversao_compra, i.unidade_compra
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
            minimo = mapa_minimo.get(linha["insumo_id"])
            quantidade_ideal = round(minimo * multiplicador, 2) if minimo else None
        itens.append({
            "insumoId": linha["insumo_id"],
            "nome": linha["nome"],
            "categoria": linha["categoria"],
            "unidadeMedida": linha["unidade_medida"],
            "marcaHomologada": linha["marca_homologada"],
            "quantidadePreenchida": linha["quantidade_preenchida"],
            "quantidadeIdeal": quantidade_ideal,
            "quantidadeIdealAjustada": ajustada,
            "fatorConversaoCompra": linha["fator_conversao_compra"],
            "unidadeCompra": linha["unidade_compra"],
            "custoUnitario": (custos.get(linha["insumo_id"]) or {}).get("valor"),
        })
    return itens


def arredondar_quantidade_compra(deficit, fator_conversao_compra=None):
    """Arredonda uma quantidade a comprar pra cima — pro múltiplo inteiro da
    embalagem do fornecedor quando o insumo tem `fator_conversao_compra`
    cadastrado (ex: queijo em peça de 2,24kg → fator 2.24, precisando de
    3kg vira 4,48kg = 2 peças), ou só pra precisão de centavo quando não
    tem (comportamento de sempre, pra insumo ainda não configurado não
    quebrar). Espelhada em `arredondarQuantidadeCompra` no script.js —
    mesma regra, backend calcula pra Contagem/Cotação, front calcula pro
    que é só exibido na hora (Estoque, Contagem antes de salvar)."""
    if deficit is None or deficit <= 0:
        return 0
    if not fator_conversao_compra or fator_conversao_compra <= 0:
        return math.ceil(deficit * 100) / 100
    pacotes = math.ceil(round(deficit / fator_conversao_compra, 6))
    return round(pacotes * fator_conversao_compra, 2)


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
    compras, revisão 2026-08-28).

    Insumo com fornecedor homologado e preço valendo não entra na cotação
    (2026-09-16): vira pedido direto pro fornecedor, com o mesmo déficit por
    loja (`pedidosDiretos` = ids). Se todo o déficit for homologado, nem abre
    cotação (`cotacaoId` None). A idempotência vale pros dois."""
    with conexao() as conn:
        existente = conn.execute(
            "SELECT id FROM cotacao WHERE requisicao_titulo = ? AND requisicao_prazo = ?",
            (titulo, prazo_validade),
        ).fetchone()
        pedidos_existentes = [
            linha["id"]
            for linha in conn.execute(
                "SELECT id FROM pedido_compra WHERE requisicao_titulo = ? AND requisicao_prazo = ? ORDER BY id",
                (titulo, prazo_validade),
            ).fetchall()
        ]
    if existente or pedidos_existentes:
        return {"cotacaoId": existente["id"] if existente else None, "pedidosDiretos": pedidos_existentes, "insumosSemIdeal": []}

    grupo = None
    for r in listar_requisicoes():
        if r['titulo'] == titulo and r['prazo_validade'] == prazo_validade:
            grupo = r
            break
    if not grupo:
        return {"cotacaoId": None, "pedidosDiretos": [], "insumosSemIdeal": []}
    if any(c['status'] != 'aprovada' for c in grupo['contagens']):
        return {"cotacaoId": None, "pedidosDiretos": [], "insumosSemIdeal": []}

    deficits = {}
    sem_ideal = {}
    for contagem in grupo['contagens']:
        for item in listar_itens_contagem(contagem['id'], contagem['loja']):
            if item['quantidadeIdeal'] is None:
                sem_ideal[item['insumoId']] = item['nome']
                continue
            atual = item['quantidadePreenchida'] if item['quantidadePreenchida'] is not None else 0
            deficit = arredondar_quantidade_compra(item['quantidadeIdeal'] - atual, item.get('fatorConversaoCompra'))
            if deficit <= 0:
                continue
            info = deficits.setdefault(item['insumoId'], {
                "nome": item['nome'],
                "categoria": item['categoria'],
                "unidadeMedida": item['unidadeMedida'],
                "porLoja": {},
            })
            info['porLoja'][contagem['loja']] = deficit

    insumos_sem_ideal = [{"insumoId": insumo_id, "nome": nome} for insumo_id, nome in sem_ideal.items()]

    if not deficits:
        return {"cotacaoId": None, "pedidosDiretos": [], "insumosSemIdeal": insumos_sem_ideal}

    with conexao() as conn:
        homologados = _homologados_validos(conn)
        quantidades_diretas = {
            (homologados[insumo_id]["fornecedor_id"], loja, insumo_id): quantidade
            for insumo_id, info in deficits.items() if insumo_id in homologados
            for loja, quantidade in info['porLoja'].items()
        }
        pedidos_diretos = []
        if quantidades_diretas:
            precos = {insumo_id: h["preco"] for insumo_id, h in homologados.items()}
            pedidos_diretos = [
                p["id"] for p in _gravar_pedidos_diretos(conn, quantidades_diretas, precos, (titulo, prazo_validade))
            ]
    para_cotar = {insumo_id: info for insumo_id, info in deficits.items() if insumo_id not in homologados}
    if not para_cotar:
        return {"cotacaoId": None, "pedidosDiretos": pedidos_diretos, "insumosSemIdeal": insumos_sem_ideal}

    cotacao_id = criar_cotacao(titulo, requisicao_titulo=titulo, requisicao_prazo=prazo_validade)
    with conexao() as conn:
        for insumo_id, info in para_cotar.items():
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
    return {"cotacaoId": cotacao_id, "pedidosDiretos": pedidos_diretos, "insumosSemIdeal": insumos_sem_ideal}


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


def listar_itens_cotacao_catalogo_completo(cotacao_id):
    """Mesmo formato de `listar_itens_cotacao`, mas pra cotação manual
    (sem Requisição por trás) — pedido da Julia (2026-09-03, print da
    VMarket): quer ver TODO insumo do catálogo já como linha, mesmo sem
    quantidade nenhuma definida ainda, em vez de só ganhar linha quando
    alguém digita a primeira quantidade ou lança o primeiro preço.
    `quantidadeTotal` vem de `cotacao_item` quando já foi preenchida na
    grid (`salvar_quantidade_item_cotacao`); senão fica `None`."""
    with conexao() as conn:
        insumos = conn.execute(
            "SELECT id, nome, categoria, unidade_medida FROM insumo ORDER BY categoria, nome"
        ).fetchall()
        quantidades = conn.execute(
            "SELECT insumo_id, quantidade_total FROM cotacao_item WHERE cotacao_id = ?",
            (cotacao_id,),
        ).fetchall()
    mapa_quantidade = {q["insumo_id"]: q["quantidade_total"] for q in quantidades}
    return [
        {
            "insumoId": i["id"],
            "nome": i["nome"],
            "categoria": i["categoria"],
            "unidadeMedida": i["unidade_medida"],
            "quantidadeTotal": mapa_quantidade.get(i["id"]),
            "porLoja": [],
        }
        for i in insumos
    ]


def salvar_quantidade_item_cotacao(cotacao_id, insumo_id, quantidade):
    """Grava/atualiza a quantidade a comprar de um insumo direto na grid
    da cotação manual — mesmo `cotacao_item` de sempre (upsert pela PK
    cotacao_id+insumo_id), só que preenchida na mão em vez de calculada
    do déficit de uma Requisição."""
    with conexao() as conn:
        conn.execute(
            """
            INSERT INTO cotacao_item (cotacao_id, insumo_id, quantidade_total)
            VALUES (?, ?, ?)
            ON CONFLICT (cotacao_id, insumo_id) DO UPDATE SET quantidade_total = excluded.quantidade_total
            """,
            (cotacao_id, insumo_id, quantidade),
        )


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


# --- EVOLUÇÃO DO PREÇO DE UM INSUMO (card #40, 2026-09-18) --------------------
#
# O histórico de compra da VMarket (2.635 pedidos desde dez/2024) já estava no
# banco, mas só servia pro custo do CMV. Aqui ele vira série no tempo: quanto
# se pagou em cada compra, de quem, e o que mais subiu ou caiu no período.
# Preço é o de `pedido_compra_item.preco_unitario`, que já está na unidade do
# insumo (é o mesmo número que o custo em uso usa).

FATOR_PRECO_SUSPEITO = 4


def historico_precos_insumo(insumo_id):
    """Compras recebidas e preços de cotação de um insumo, do mais antigo pro
    mais novo. None se o insumo não existe."""
    with conexao() as conn:
        insumo = conn.execute(
            "SELECT id, nome, unidade_medida, categoria FROM insumo WHERE id = ?", (insumo_id,)
        ).fetchone()
        if not insumo:
            return None
        compras = conn.execute(
            """
            SELECT COALESCE(pc.recebido_em, pc.criado_em) AS data, pci.preco_unitario AS preco,
                   pci.quantidade, f.nome AS fornecedor, pc.loja, pc.id AS pedido_id
            FROM pedido_compra_item pci
            JOIN pedido_compra pc ON pc.id = pci.pedido_id
            LEFT JOIN fornecedor f ON f.id = pc.fornecedor_id
            WHERE pci.insumo_id = ? AND pc.status = 'recebido' AND pci.preco_unitario > 0
            ORDER BY data, pc.id
            """,
            (insumo_id,),
        ).fetchall()
        cotacoes = conn.execute(
            """
            SELECT cp.criado_em AS data, cp.preco, cp.selecionado, f.nome AS fornecedor
            FROM cotacao_preco cp
            LEFT JOIN fornecedor f ON f.id = cp.fornecedor_id
            WHERE cp.insumo_id = ? AND cp.preco > 0
            ORDER BY cp.criado_em
            """,
            (insumo_id,),
        ).fetchall()
    return {
        "insumo": dict(insumo),
        "compras": [dict(c) for c in compras],
        "cotacoes": [dict(c) for c in cotacoes],
    }


def variacoes_de_preco(dias=90):
    """O que subiu e o que caiu: pra cada insumo com compra recebida antes E
    dentro do período, o último preço pago antes do período contra o último
    pago dentro dele. Preço que ficou 4x maior ou 4x menor vem marcado como
    suspeito — quase sempre é compra lançada em outra unidade (caixa em vez de
    unidade), não aumento de verdade."""
    corte = (datetime.now() - timedelta(days=int(dias))).isoformat()
    with conexao() as conn:
        linhas = conn.execute(
            """
            SELECT pci.insumo_id, i.nome, i.unidade_medida, i.categoria,
                   COALESCE(pc.recebido_em, pc.criado_em) AS data, pci.preco_unitario AS preco,
                   f.nome AS fornecedor
            FROM pedido_compra_item pci
            JOIN pedido_compra pc ON pc.id = pci.pedido_id
            JOIN insumo i ON i.id = pci.insumo_id
            LEFT JOIN fornecedor f ON f.id = pc.fornecedor_id
            WHERE pc.status = 'recebido' AND pci.preco_unitario > 0
            ORDER BY pci.insumo_id, data, pc.id
            """
        ).fetchall()

    por_insumo = {}
    for linha in linhas:
        por_insumo.setdefault(linha["insumo_id"], []).append(linha)

    saida = []
    for insumo_id, compras in por_insumo.items():
        antes = [c for c in compras if c["data"] < corte]
        depois = [c for c in compras if c["data"] >= corte]
        if not antes or not depois:
            continue
        preco_antes = antes[-1]["preco"]
        preco_agora = depois[-1]["preco"]
        variacao = (preco_agora - preco_antes) / preco_antes * 100
        saida.append({
            "insumoId": insumo_id,
            "nome": compras[0]["nome"],
            "unidade": compras[0]["unidade_medida"],
            "categoria": compras[0]["categoria"],
            "precoAntes": round(preco_antes, 4),
            "dataAntes": antes[-1]["data"][:10],
            "precoAgora": round(preco_agora, 4),
            "dataAgora": depois[-1]["data"][:10],
            "fornecedorAgora": depois[-1]["fornecedor"],
            "variacaoPct": round(variacao, 1),
            "suspeito": not (1 / FATOR_PRECO_SUSPEITO < preco_agora / preco_antes < FATOR_PRECO_SUSPEITO),
        })
    saida.sort(key=lambda v: -v["variacaoPct"])
    return saida


# Alta de custo que pesa na margem (Home, 2026-09-18): o insumo que ficou
# mais caro no período, cruzado com as fichas técnicas. "Subiu 12%" sozinho
# não diz se importa; "a margem do hambúrguer caiu 1,7 ponto" diz.
ALTA_MINIMA_PARA_ALERTA_PCT = 5
PONTOS_MINIMOS_PARA_ALERTA = 0.1


def alertas_de_custo_na_margem(lojas, dias=30, limite=3):
    """Os insumos que subiram no período e, pra cada um, o produto em que a
    alta mais come margem (em pontos percentuais do preço de venda), do que
    mais come pro que menos. Preço marcado como suspeito (unidade trocada),
    produto sem preço de venda e alta que mexe menos de 0,1 ponto ficam de
    fora. `margemAntes`/`margemAgora` só vêm quando o produto tem custo."""
    altas = {
        v["insumoId"]: v for v in variacoes_de_preco(dias)
        if v["variacaoPct"] >= ALTA_MINIMA_PARA_ALERTA_PCT and not v["suspeito"]
    }
    if not altas:
        return []
    with conexao() as conn:
        fichas = conn.execute(
            f"""
            SELECT item_id, insumo_id, loja, quantidade FROM ficha_tecnica
            WHERE quantidade > 0 AND insumo_id IN ({','.join('?' * len(altas))})
            """,
            list(altas),
        ).fetchall()

    precos_insumo = _mapa_preco_insumo()
    custos_manuais = mapa_custos_item_cardapio()
    por_insumo = {}
    for loja in lojas:
        linhas = [f for f in fichas if f["loja"] == loja]
        if not linhas:
            continue
        produtos = {p["itemCardapioId"]: p for p in listar_produtos_por_loja(loja) if p["itemCardapioId"]}
        custos = _custo_por_item_da_ficha(loja, precos_insumo)
        for linha in linhas:
            produto = produtos.get(linha["item_id"])
            if not produto:
                continue
            preco_venda = next(
                (produto[c] for c in ("cardapioWeb", "ifood", "food99", "beefood") if produto.get(c)), None
            )
            if not preco_venda:
                continue
            alta = altas[linha["insumo_id"]]
            custo_a_mais = linha["quantidade"] * (alta["precoAgora"] - alta["precoAntes"])
            custo = custos_manuais.get((linha["item_id"], loja))
            if custo is None:
                custo = custos.get(linha["item_id"])
            candidato = {
                "produto": produto["nome"],
                "loja": loja,
                "pontosDeMargem": round(custo_a_mais / preco_venda * 100, 1),
                "custoAMais": round(custo_a_mais, 2),
                "margemAntes": round((preco_venda - custo + custo_a_mais) / preco_venda * 100, 1) if custo is not None else None,
                "margemAgora": round((preco_venda - custo) / preco_venda * 100, 1) if custo is not None else None,
            }
            registro = por_insumo.setdefault(linha["insumo_id"], {"maior": None, "produtos": set()})
            registro["produtos"].add(produto["nome"])
            if registro["maior"] is None or candidato["pontosDeMargem"] > registro["maior"]["pontosDeMargem"]:
                registro["maior"] = candidato

    saida = []
    for insumo_id, registro in por_insumo.items():
        if registro["maior"]["pontosDeMargem"] < PONTOS_MINIMOS_PARA_ALERTA:
            continue
        alta = altas[insumo_id]
        saida.append({
            "insumoId": insumo_id,
            "insumo": alta["nome"],
            "unidade": alta["unidade"],
            "variacaoPct": alta["variacaoPct"],
            "precoAntes": alta["precoAntes"],
            "precoAgora": alta["precoAgora"],
            **registro["maior"],
            "outrosProdutos": len(registro["produtos"]) - 1,
        })
    saida.sort(key=lambda a: -a["pontosDeMargem"])
    return saida[:limite]


def faturamento_por_loja_nos_dias(dias):
    """{(loja, dia): faturamento} com a venda presencial somada, como toda
    tela de faturamento faz. Dia sem venda nenhuma fica de fora."""
    if not dias:
        return {}
    marcadores = ",".join("?" * len(dias))
    with conexao() as conn:
        linhas = conn.execute(
            f"""
            SELECT unidade, dia, faturamento_dia AS valor FROM faturamento_diario WHERE dia IN ({marcadores})
            UNION ALL
            SELECT unidade, dia, valor FROM venda_presencial WHERE dia IN ({marcadores})
            """,
            [*dias, *dias],
        ).fetchall()
    total = {}
    for linha in linhas:
        chave = (linha["unidade"], linha["dia"])
        total[chave] = total.get(chave, 0.0) + (linha["valor"] or 0.0)
    return total


DIAS_DE_LOTE_NA_ROTINA = 3


def numeros_da_rotina(lojas, usuario_id, dia_ontem, dia_hoje):
    """Contagens das atividades do dia da Home, só leitura: lojas que já
    lançaram a venda presencial de ontem, produto vendido pela primeira vez
    de ontem pra cá sem vínculo com a ficha técnica (o acúmulo antigo fica
    no painel de Vendas não reconhecidas), lote vencendo em até 3 dias e
    tarefa do ClickUp com prazo até hoje."""
    marcadores = ",".join("?" * len(lojas)) or "NULL"
    limite_lote = (date.fromisoformat(dia_hoje) + timedelta(days=DIAS_DE_LOTE_NA_ROTINA)).isoformat()
    with conexao() as conn:
        presencial = {
            linha["unidade"] for linha in conn.execute(
                f"SELECT unidade FROM venda_presencial WHERE dia = ? AND unidade IN ({marcadores})",
                [dia_ontem, *lojas],
            ).fetchall()
        }
        sem_vinculo = conn.execute(
            f"""
            SELECT COUNT(*) FROM (
                SELECT v.unidade, v.nome_normalizado, MIN(v.dia) AS primeira_vez
                FROM venda_item v
                WHERE v.unidade IN ({marcadores}) AND v.item_cardapio_id IS NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM composicao_produto_venda c
                      WHERE c.nome_produto_normalizado = v.nome_normalizado
                  )
                GROUP BY v.unidade, v.nome_normalizado
                HAVING primeira_vez >= ?
            )
            """,
            [*lojas, dia_ontem],
        ).fetchone()[0]
        lotes = conn.execute(
            f"""
            SELECT COUNT(*) FROM lote_insumo
            WHERE resolvido_em IS NULL AND validade IS NOT NULL AND validade <= ? AND loja IN ({marcadores})
            """,
            [limite_lote, *lojas],
        ).fetchone()[0]
        tarefas = conn.execute(
            """
            SELECT COUNT(*) FROM tarefa
            WHERE status != 'done' AND data_limite IS NOT NULL AND data_limite != '' AND data_limite <= ?
              AND (visivel_para IS NULL OR visivel_para = ?)
            """,
            (dia_hoje, usuario_id),
        ).fetchone()[0]
    return {
        "presencialLancado": presencial,
        "vendasNovasSemVinculo": sem_vinculo,
        "lotesVencendo": lotes,
        "tarefasNoPrazo": tarefas,
    }


# --- REGISTRO DE AÇÕES (quem fez o quê) -------------------------------------
#
# Só recebimento e algumas telas guardavam o nome de quem fez. Com mais gente
# usando — e com quatro admins mexendo em estoque, pedido e cadastro — "quem
# mudou isso?" não tinha resposta (pedido dela, 2026-09-17). O registro é
# automático: todo pedido de mudança que passa pela API entra aqui, então rota
# nova já nasce registrada.

DIAS_DE_REGISTRO_ACAO = 365


def registrar_acao(usuario, metodo, rota, caminho, status, descricao, detalhes=None):
    """Grava uma linha do registro. `usuario` é o dict do usuário logado (ou
    None, no caso dos links públicos de contagem e cotação). O nome fica
    copiado aqui de propósito: excluir a pessoa não apaga o rastro do que ela
    fez."""
    with conexao() as conn:
        conn.execute(
            """
            INSERT INTO registro_acao
                (criado_em, usuario_id, usuario_nome, papel, loja, metodo, rota, caminho, status, descricao, detalhes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                datetime.now().isoformat(),
                usuario["id"] if usuario else None,
                (usuario["nome"] if usuario else "Link público"),
                (usuario["papel"] if usuario else None),
                (usuario["loja"] if usuario else None),
                metodo, rota, caminho, int(status), descricao, detalhes,
            ),
        )


def listar_registro_acoes(dias=7, usuario_id=None, limite=300):
    """Do mais novo pro mais velho, dos últimos N dias."""
    desde = (datetime.now() - timedelta(days=int(dias))).isoformat()
    filtros = ["criado_em >= ?"]
    valores = [desde]
    if usuario_id:
        filtros.append("usuario_id = ?")
        valores.append(int(usuario_id))
    with conexao() as conn:
        linhas = conn.execute(
            f"""
            SELECT * FROM registro_acao
            WHERE {' AND '.join(filtros)}
            ORDER BY criado_em DESC
            LIMIT ?
            """,
            [*valores, int(limite)],
        ).fetchall()
        return [dict(linha) for linha in linhas]


def limpar_registro_acoes_antigos(dias=DIAS_DE_REGISTRO_ACAO):
    """Um ano de registro basta; o resto sai junto com o backup da madrugada."""
    corte = (datetime.now() - timedelta(days=int(dias))).isoformat()
    with conexao() as conn:
        cursor = conn.execute("DELETE FROM registro_acao WHERE criado_em < ?", (corte,))
        return cursor.rowcount


def definir_nota_fiscal_pedido(pedido_id, nome_arquivo=None, numero_nf=None):
    """Anexa (ou troca) a nota fiscal de um pedido que já existe — ela costuma
    chegar depois da entrega. Devolve o nome do arquivo antigo, pra quem chamou
    apagar do disco só depois que o banco já aponta pro novo."""
    with conexao() as conn:
        linha = conn.execute(
            "SELECT nota_fiscal_arquivo FROM pedido_compra WHERE id = ?", (pedido_id,)
        ).fetchone()
        if not linha:
            return None
        campos, valores = [], []
        if nome_arquivo is not None:
            campos.append("nota_fiscal_arquivo = ?")
            valores.append(nome_arquivo)
        if numero_nf is not None:
            campos.append("numero_nf = ?")
            valores.append(numero_nf)
        if not campos:
            return None
        campos.append("atualizado_em = ?")
        valores.append(datetime.now().isoformat())
        conn.execute(
            f"UPDATE pedido_compra SET {', '.join(campos)} WHERE id = ?", [*valores, pedido_id]
        )
        anterior = linha["nota_fiscal_arquivo"]
        return anterior if nome_arquivo is not None and anterior != nome_arquivo else None


# --- CÓPIAS DE SEGURANÇA DO BANCO -------------------------------------------
#
# O banco inteiro é um arquivo só no volume do Dokploy: sem cópia, um erro de
# operação (ou o arquivo corromper) leva todo o histórico junto. A cópia roda
# sozinha de madrugada e fica no mesmo volume; pra sobreviver a perder o
# servidor, a cópia precisa SAIR daqui (botão "Baixar cópia" em Configurações).

_NOME_BACKUP = re.compile(r"^admfood-(\d{4})-(\d{2})-(\d{2})\.db$")


def _data_do_backup(nome_arquivo):
    achado = _NOME_BACKUP.match(nome_arquivo)
    if not achado:
        return None
    try:
        return datetime(*(int(p) for p in achado.groups())).date()
    except ValueError:
        return None


def gerar_backup(caminho_destino=None):
    """Cópia consistente do banco, mesmo com gente usando o sistema.

    `VACUUM INTO` (SQLite 3.27+) escreve um arquivo novo já compactado, sem
    travar quem está lendo; em SQLite antigo cai na API de backup do próprio
    sqlite3, que faz o mesmo sem compactar. Escreve num arquivo ".parcial" e
    só renomeia no fim, pra uma cópia interrompida no meio nunca passar por
    cópia boa."""
    os.makedirs(PASTA_BACKUPS, exist_ok=True)
    destino = caminho_destino or os.path.join(
        PASTA_BACKUPS, f"admfood-{datetime.now():%Y-%m-%d}.db"
    )
    parcial = destino + ".parcial"
    for caminho in (parcial, destino):
        if os.path.exists(caminho):
            os.remove(caminho)

    conn = sqlite3.connect(CAMINHO_BANCO, isolation_level=None)
    try:
        try:
            conn.execute("VACUUM INTO ?", (parcial,))
        except sqlite3.OperationalError:
            copia = sqlite3.connect(parcial)
            try:
                conn.backup(copia)
            finally:
                copia.close()
    finally:
        conn.close()

    os.replace(parcial, destino)
    return destino


def limpar_backups_antigos(hoje=None):
    """Guarda as cópias dos últimos 14 dias e a do dia 1º de cada mês por um
    ano — o resto sai, senão a pasta cresce pra sempre."""
    hoje = hoje or datetime.now().date()
    apagados = []
    for nome in os.listdir(PASTA_BACKUPS):
        data = _data_do_backup(nome)
        if not data:
            continue
        idade = (hoje - data).days
        if idade <= DIAS_DE_BACKUP_DIARIO:
            continue
        if data.day == 1 and idade <= DIAS_DE_BACKUP_MENSAL:
            continue
        os.remove(os.path.join(PASTA_BACKUPS, nome))
        apagados.append(nome)
    return apagados


def listar_backups():
    """Cópias guardadas, da mais nova pra mais velha."""
    copias = []
    for nome in os.listdir(PASTA_BACKUPS):
        if not _data_do_backup(nome):
            continue
        caminho = os.path.join(PASTA_BACKUPS, nome)
        copias.append({
            "arquivo": nome,
            "tamanho": os.path.getsize(caminho),
            "criadoEm": datetime.fromtimestamp(os.path.getmtime(caminho)).isoformat(),
        })
    return sorted(copias, key=lambda c: c["arquivo"], reverse=True)


def rodar_backup_diario():
    """O que o agendador chama de madrugada."""
    destino = gerar_backup()
    apagados = limpar_backups_antigos()
    print(f"💾 Backup do banco: {os.path.basename(destino)}"
          f" ({os.path.getsize(destino) // 1024} KB)"
          + (f" — {len(apagados)} cópia(s) antiga(s) apagada(s)" if apagados else ""))
    return destino
