# -*- coding: utf-8 -*-
"""Base dos testes: um mundo pequeno e conhecido, novo a cada execução.

Antes, cada teste copiava o `admfood.db` local e mexia nele. Isso tinha
dois problemas: o banco local é cópia velha de produção (muda sozinho
quando alguém atualiza a cópia), e teste que depende de dado que muda
passa hoje e falha amanhã sem ninguém ter mexido em código.

Aqui o banco nasce vazio, o schema é criado pelo próprio
`inicializar_banco()` (então o teste também prova que a criação de
tabela funciona) e o mundo é semeado explicitamente: quem não está
escrito aqui não existe no teste.

Como escrever um teste novo:

    from _base import Mundo, conferir, terminar

    mundo = Mundo()                      # banco novo + app + dados base
    admin = mundo.cliente(mundo.ADMIN)   # cliente HTTP logado

    resposta = admin.get("/api/alertas")
    conferir("responde 200", resposta.status_code, 200)

    terminar()                           # imprime o resultado e sai

Rodar tudo: `python tests/rodar.py`
Rodar um só: `python tests/test_alertas.py`
"""
import os
import sys
import tempfile
import uuid
from datetime import date, datetime

# A raiz do projeto precisa estar no path ANTES de importar o app, e o
# DATABASE_PATH precisa estar no ambiente antes ainda: armazenamento.py
# lê o caminho do banco no import, não na primeira consulta.
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

PASTA_DO_TESTE = os.path.join(tempfile.gettempdir(), "admfood-teste-" + uuid.uuid4().hex[:12])
os.makedirs(PASTA_DO_TESTE, exist_ok=True)

os.environ["DATABASE_PATH"] = os.path.join(PASTA_DO_TESTE, "admfood.db")
os.environ["BACKUP_AUTOMATICO"] = "false"          # senão o agendador roda durante o teste
os.environ["SECRET_KEY"] = "teste-descartavel"
os.environ.setdefault("ADMIN_INICIAL_EMAIL", "")   # sem criar admin sozinho no boot
os.environ.setdefault("EQUIPE_INICIAL", "")

_falhas = []
_verificacoes = 0


def conferir(descricao, obtido, esperado):
    """Uma verificação. Imprime na hora — quando um teste quebra no meio,
    o que já passou continua visível e ajuda a localizar onde parou."""
    global _verificacoes
    _verificacoes += 1
    ok = obtido == esperado
    print(("  ok    " if ok else "  FALHA ") + descricao + " -> " + repr(obtido)
          + ("" if ok else "  (esperava " + repr(esperado) + ")"))
    if not ok:
        _falhas.append(descricao)


def secao(titulo):
    print("\n=== " + titulo + " ===")


def terminar():
    """Fecha o teste. `os._exit` em vez de `sys.exit` porque o APScheduler
    do app deixa thread viva e o processo não morreria sozinho — o teste
    ficaria pendurado pra sempre no runner."""
    print("\n%d verificações, %d falha(s)" % (_verificacoes, len(_falhas)))
    if _falhas:
        for f in _falhas:
            print("  - " + f)
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(1 if _falhas else 0)


class Mundo:
    """O mundo pequeno: 4 lojas (as do config), 3 pessoas (uma de cada
    papel) e o que o teste pedir a mais.

    Semeia só o essencial. Insumo, cardápio e venda entram sob demanda,
    pelos métodos abaixo — assim cada teste diz, no próprio corpo, de que
    dado ele depende.
    """

    ADMIN = 1
    GERENTE = 2
    OPERACAO = 3

    def __init__(self):
        import backend.armazenamento as az
        from backend.armazenamento import conexao, inicializar_banco

        inicializar_banco()
        self.az = az
        self.conexao = conexao

        import app as aplicacao
        aplicacao.app.config["TESTING"] = True
        self.app = aplicacao.app
        self.aplicacao = aplicacao
        from config import LOJAS
        self.LOJAS = list(LOJAS)

        # Gerente e operação nascem COM loja. Quem não é admin e está sem
        # loja não enxerga loja nenhuma (regra de _loja_do_usuario: falha
        # fechando, em vez de cair no None e ver a rede toda) — então um
        # fixture sem loja faria todo teste de perfil dar lista vazia por
        # um motivo que não é o que se quer testar. Pra testar esse caso
        # de propósito existe o `sem_loja()` abaixo.
        self.LOJA_DA_EQUIPE = self.LOJAS[0]
        hoje = date.today().isoformat()
        with conexao() as conn:
            for uid, nome, papel, loja in (
                (self.ADMIN, "Admin do Teste", "admin", None),
                (self.GERENTE, "Gerente do Teste", "gerente", self.LOJA_DA_EQUIPE),
                (self.OPERACAO, "Operação do Teste", "operacao", self.LOJA_DA_EQUIPE),
            ):
                conn.execute(
                    "INSERT OR REPLACE INTO usuario (id, nome, email, senha_hash, papel, ativo, loja, criado_em) "
                    "VALUES (?, ?, ?, 'sem-senha', ?, 1, ?, ?)",
                    (uid, nome, "%s@teste.local" % papel, papel, loja, hoje))

    def sem_loja(self, papel="operacao"):
        """Funcionário cadastrado pela metade: papel definido, loja em
        branco. Devolve o id, pra testar que ele não enxerga nada."""
        with self.conexao() as conn:
            cur = conn.execute(
                "INSERT INTO usuario (nome, email, senha_hash, papel, ativo, loja, criado_em) "
                "VALUES (?, ?, 'sem-senha', ?, 1, NULL, ?)",
                ("Sem loja", "semloja-%s@teste.local" % uuid.uuid4().hex[:6], papel,
                 date.today().isoformat()))
            return cur.lastrowid

    # ---------------------------------------------------------------- #
    def _versao_da_sessao(self, usuario_id):
        """A versão que o cookie precisa carregar pra valer. Lê do banco
        em vez de fixar 0: depois de um "sair de todos os aparelhos" a
        versão sobe, e um cookie com 0 passaria a ser recusado — o teste
        seguinte cairia em 401 por um motivo que não é o dele."""
        with self.conexao() as conn:
            linha = conn.execute("SELECT * FROM usuario WHERE id = ?", (usuario_id,)).fetchone()
        if linha is None:
            return 0
        return (linha["sessao_versao"] if "sessao_versao" in linha.keys() else 0) or 0

    def cliente(self, usuario_id=ADMIN):
        """Cliente HTTP já logado como esse usuário. Escreve a sessão
        direto no cookie em vez de passar pelo /api/login: o teste é do
        que vem depois do login, e senha aqui só criaria ruído."""
        c = self.app.test_client()
        with c.session_transaction() as s:
            s["usuario_id"] = usuario_id
            s["sessao_versao"] = self._versao_da_sessao(usuario_id)
        return c

    def como(self, usuario_id, caminho="/api/x"):
        """Contexto de requisição logado, pra chamar função interna do
        app direto (sem passar por rota). Use com `with`."""
        contexto = self.app.test_request_context(caminho)
        versao = self._versao_da_sessao(usuario_id)

        class _Ctx:
            def __enter__(self_):
                contexto.__enter__()
                from flask import session
                session["usuario_id"] = usuario_id
                session["sessao_versao"] = versao
                return self.aplicacao

            def __exit__(self_, *erro):
                return contexto.__exit__(*erro)

        return _Ctx()

    def insumo(self, nome, categoria="Teste", unidade="kg", lojas=None,
               quantidade=0, minimo=0, custo=None):
        """Cria um insumo e o coloca nas lojas pedidas. Devolve o id."""
        lojas = lojas if lojas is not None else self.LOJAS
        hoje = date.today().isoformat()
        with self.conexao() as conn:
            cur = conn.execute(
                "INSERT INTO insumo (nome, categoria, unidade_medida, custo_referencia) VALUES (?, ?, ?, ?)",
                (nome, categoria, unidade, custo))
            insumo_id = cur.lastrowid
            for loja in lojas:
                conn.execute("INSERT OR IGNORE INTO insumo_loja (insumo_id, loja) VALUES (?, ?)",
                             (insumo_id, loja))
                conn.execute(
                    "INSERT OR REPLACE INTO estoque_insumo "
                    "(insumo_id, loja, quantidade_atual, estoque_minimo, atualizado_em) VALUES (?, ?, ?, ?, ?)",
                    (insumo_id, loja, quantidade, minimo, hoje))
        return insumo_id

    def produto(self, nome, tipo="produto"):
        """Cria um item de cardápio. Devolve o id."""
        with self.conexao() as conn:
            cur = conn.execute("INSERT INTO item_cardapio (nome, tipo) VALUES (?, ?)", (nome, tipo))
            return cur.lastrowid

    def ficha(self, item_id, loja, itens):
        """Ficha técnica: {insumo_id: quantidade} desse produto nessa loja."""
        with self.conexao() as conn:
            for insumo_id, quantidade in itens.items():
                conn.execute(
                    "INSERT OR REPLACE INTO ficha_tecnica (item_id, insumo_id, loja, quantidade) "
                    "VALUES (?, ?, ?, ?)",
                    (item_id, insumo_id, loja, quantidade))

    def venda(self, loja, dia, nome_produto, quantidade=1, item_cardapio_id=None,
              pedido_id=None, canal="teste"):
        """Uma linha de venda, como a sincronização com a Cardápio Web
        gravaria. `item_cardapio_id=None` é a venda que não casou.

        Grava `nome_normalizado` igual a sincronização de verdade: é por
        essa coluna que a composição de combo casa, e sem ela o combo
        silenciosamente não desconta nada."""
        from backend.armazenamento import _normalizar_nome_insumo
        with self.conexao() as conn:
            proximo = conn.execute(
                "SELECT COALESCE(MAX(pedido_id), 0) + 1 FROM venda_item WHERE unidade = ?", (loja,)
            ).fetchone()[0]
            conn.execute(
                "INSERT INTO venda_item (unidade, pedido_id, linha, dia, canal, nome_produto, "
                "quantidade, item_cardapio_id, multiplicador, nome_normalizado) "
                "VALUES (?, ?, 1, ?, ?, ?, ?, ?, 1, ?)",
                (loja, pedido_id or proximo, dia, canal, nome_produto, quantidade, item_cardapio_id,
                 _normalizar_nome_insumo(nome_produto)))

    def desligar_baixa(self, loja):
        """`inicializar_banco()` já liga a baixa do Artesanos (seed de
        08/09). Pra testar o estado 'desligado' é preciso desligar."""
        with self.conexao() as conn:
            conn.execute("DELETE FROM baixa_automatica_loja WHERE loja = ?", (loja,))

    def fornecedor(self, nome="Fornecedor do Teste", categoria="Geral"):
        with self.conexao() as conn:
            cur = conn.execute(
                "INSERT INTO fornecedor (nome, categoria, criado_em) VALUES (?, ?, ?)",
                (nome, categoria, date.today().isoformat()))
            return cur.lastrowid

    def pedido(self, loja, fornecedor_id, itens, status="enviado"):
        """Um pedido de compra já lançado, com itens.

        `itens`: [{insumo_id, quantidade, preco}]. Inserido direto em vez
        de passar por criar_pedidos_diretos porque aquela função exige
        fornecedor homologado com preço válido — setup que não é o que
        estes testes querem exercitar.

        Todo pedido pertence a uma cotação (`cotacao_id` é NOT NULL: até
        o pedido direto usa uma cotação oculta), então o fixture cria uma
        de verdade em vez de inventar um id."""
        from backend.armazenamento import criar_cotacao
        agora = datetime.now().isoformat()
        if not getattr(self, "_cotacao_dos_testes", None):
            self._cotacao_dos_testes = criar_cotacao("Cotação do teste")
        with self.conexao() as conn:
            cur = conn.execute(
                "INSERT INTO pedido_compra (cotacao_id, fornecedor_id, loja, status, criado_em, token) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (self._cotacao_dos_testes, fornecedor_id, loja, status, agora, uuid.uuid4().hex))
            pedido_id = cur.lastrowid
            for item in itens:
                conn.execute(
                    "INSERT INTO pedido_compra_item (pedido_id, insumo_id, quantidade, "
                    "preco_unitario, quantidade_pedida, quantidade_recebida) VALUES (?, ?, ?, ?, ?, 0)",
                    (pedido_id, item["insumo_id"], item["quantidade"],
                     item.get("preco", 1.0), item["quantidade"]))
        return pedido_id

    def estoque(self, insumo_id, loja):
        """Quanto tem hoje — pra conferir depois de uma baixa."""
        with self.conexao() as conn:
            linha = conn.execute(
                "SELECT quantidade_atual FROM estoque_insumo WHERE insumo_id = ? AND loja = ?",
                (insumo_id, loja)).fetchone()
        return linha["quantidade_atual"] if linha else None
