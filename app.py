import os
import threading
from datetime import date, datetime, timedelta
from flask import Flask, abort, jsonify, redirect, request, send_from_directory, session
from flask_cors import CORS

from config import LOJAS, SECRET_KEY, ADMIN_INICIAL_NOME, ADMIN_INICIAL_EMAIL, ADMIN_INICIAL_SENHA, EQUIPE_INICIAL_JSON
from backend.armazenamento import (
    inicializar_banco,
    buscar_faturamento_periodo,
    buscar_canais_periodo,
    salvar_venda_presencial,
    excluir_venda_presencial,
    buscar_presencial_periodo,
    buscar_presencial_por_unidade,
    buscar_ultima_sincronizacao,
    salvar_resumo_do_dia,
    listar_tarefas,
    criar_tarefa,
    atualizar_tarefa,
    excluir_tarefa,
    adicionar_subtarefa,
    alternar_subtarefa,
    adicionar_comentario,
    criar_usuario,
    buscar_usuario_por_email,
    buscar_usuario_por_id,
    listar_usuarios,
    atualizar_usuario,
    excluir_usuario,
)
from backend.auth import gerar_hash_senha, senha_confere
from backend.cardapio_web import buscar_resumo_do_dia
from sincronizar import sincronizar_dia, DIA_FECHADO

app = Flask(__name__)
CORS(app, supports_credentials=True)  # supports_credentials: o cookie de sessão precisa viajar nas requisições do JS
if not SECRET_KEY:
    print("⚠️  SECRET_KEY não definida — sessões de login não vão sobreviver a um restart/redeploy. Defina no .env (local) ou nas variáveis de ambiente do Dokploy (produção).")
app.secret_key = SECRET_KEY or "chave-insegura-so-para-dev-local"
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('SESSION_COOKIE_SECURE', 'false').lower() == 'true'

_caminho_banco_atual = os.environ.get("DATABASE_PATH", "admfood.db")
print(f"🗄️  Banco de dados: {_caminho_banco_atual} (existe: {os.path.exists(_caminho_banco_atual)}, worker pid {os.getpid()})")
inicializar_banco()
print(f"👤 Usuários cadastrados no banco: {len(listar_usuarios())}")
if ADMIN_INICIAL_EMAIL:
    _email_bruto = os.environ.get("ADMIN_INICIAL_EMAIL", "")
    _senha_bruta = os.environ.get("ADMIN_INICIAL_SENHA", "")
    print(
        f"🔎 ADMIN_INICIAL_EMAIL: {len(_email_bruto)} caracteres brutos, {len(ADMIN_INICIAL_EMAIL)} após limpar espaços"
        f" | ADMIN_INICIAL_SENHA: {len(_senha_bruta)} caracteres brutos, {len(ADMIN_INICIAL_SENHA)} após limpar espaços"
    )


def _sincronizar_usuario_inicial(nome, email, senha, papel, rotulo):
    # Cria OU atualiza (senha/papel) o usuário desse e-mail específico toda
    # vez que o app sobe — não só "se a tabela estiver vazia". Isso evita
    # ficar trancado de fora se uma tentativa anterior (senha digitada
    # errado, redeploy no meio da configuração) já tiver criado essa conta:
    # o próximo redeploy corrige sozinho, em vez de pular silenciosamente
    # porque já existe *algum* usuário.
    email = (email or '').strip()
    senha = (senha or '').strip()
    if not email or not senha:
        return
    try:
        hash_senha = gerar_hash_senha(senha)
        usuario_existente = buscar_usuario_por_email(email)
        if usuario_existente:
            atualizar_usuario(usuario_existente['id'], {'senha_hash': hash_senha, 'papel': papel, 'ativo': 1})
            print(f"✅ {rotulo} sincronizado (senha/papel atualizados): {email}")
        else:
            criar_usuario(nome or email, email, hash_senha, papel=papel)
            print(f"✅ {rotulo} criado: {email}")
    except Exception:
        import traceback
        print(f"❌ Falha ao sincronizar {rotulo.lower()} ({email}):")
        traceback.print_exc()


def _criar_admin_inicial_se_necessario():
    # Assim que o login funcionar, remova ADMIN_INICIAL_EMAIL/SENHA do
    # ambiente — enquanto estiverem definidas, qualquer redeploy volta a
    # senha dessa conta pro valor daqui, sobrescrevendo uma troca de senha
    # feita pela tela de Equipe.
    _sincronizar_usuario_inicial(ADMIN_INICIAL_NOME, ADMIN_INICIAL_EMAIL, ADMIN_INICIAL_SENHA, 'admin', 'Usuário admin inicial')


def _criar_equipe_inicial_se_necessario():
    # Mesma ideia do admin inicial, mas pra vários membros de uma vez, via
    # uma lista JSON em EQUIPE_INICIAL — evita depender de conseguir logar
    # primeiro pra cadastrar todo mundo pela tela de Equipe. Depois que
    # todo mundo estiver com acesso, pode remover essa variável do
    # ambiente (mesmo aviso do admin: enquanto estiver definida, um
    # redeploy volta a senha de cada um pro valor daqui).
    if not EQUIPE_INICIAL_JSON:
        return
    import json
    try:
        membros = json.loads(EQUIPE_INICIAL_JSON)
    except Exception:
        print(f"❌ EQUIPE_INICIAL não é um JSON válido: {EQUIPE_INICIAL_JSON[:80]}")
        return
    for membro in membros:
        papel = membro.get('papel') if membro.get('papel') in ('admin', 'equipe') else 'equipe'
        _sincronizar_usuario_inicial(
            membro.get('nome'), membro.get('email'), membro.get('senha'), papel, 'Usuário da equipe inicial'
        )


_criar_admin_inicial_se_necessario()
_criar_equipe_inicial_se_necessario()


# --- LOGIN ------------------------------------------------------------------

PAGINAS_PUBLICAS = {"login.html", "esquecisenha.html", "landing.html", "registro.html"}
ROTAS_API_PUBLICAS = {"/api/login"}


def _usuario_logado():
    usuario_id = session.get("usuario_id")
    if not usuario_id:
        return None
    return buscar_usuario_por_id(usuario_id)


@app.before_request
def _exigir_login():
    caminho = request.path

    if caminho.startswith('/api/'):
        if caminho in ROTAS_API_PUBLICAS:
            return
        if not _usuario_logado():
            return jsonify({"erro": "Não autenticado."}), 401
        return

    if caminho == '/' or caminho.endswith('.html'):
        nome_pagina = 'index.html' if caminho == '/' else caminho.lstrip('/')
        if nome_pagina in PAGINAS_PUBLICAS:
            return
        if not _usuario_logado():
            return redirect('/login.html')

def _sou_o_unico_worker_a_agendar():
    """Em produção o Gunicorn roda vários workers (processos separados), e
    cada um carrega esse arquivo do zero — sem essa trava, cada worker criaria
    seu próprio agendador, multiplicando as sincronizações (e estourando o
    limite de requisição da Cardápio Web, causando sincronizações incompletas
    no meio do dia). O arquivo de trava é criado uma vez só por processo do
    container (some no próximo deploy/restart, já que /tmp é recriado)."""
    caminho_trava = "/tmp/admfood_scheduler.lock"
    try:
        descritor = os.open(caminho_trava, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(descritor, str(os.getpid()).encode())
        os.close(descritor)
        return True
    except FileExistsError:
        return False


# Sincronização automática com a Cardápio Web. Localmente isso já é feito
# pelo Agendador de Tarefas do Windows (fora do processo do Flask), mas em
# produção (Dokploy) não existe esse agendador — o próprio processo da
# aplicação precisa disparar a sincronização.
#
# Dois jobs, propósitos diferentes:
# - Diário às 3h: fecha o dia anterior com calma, depois que ele já acabou.
# - A cada 15 min: sincroniza HOJE (o dia em andamento), pra quem estiver
#   olhando o sistema durante o dia ver os números indo perto do tempo real,
#   em vez de só descobrir o resultado do dia no dia seguinte.
if os.environ.get("SINCRONIZACAO_AUTOMATICA", "false").lower() == "true":
    # Evita agendar duas vezes por causa do reloader do modo debug, e evita
    # agendar em mais de um worker do Gunicorn ao mesmo tempo.
    if (not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true") and _sou_o_unico_worker_a_agendar():
        from apscheduler.schedulers.background import BackgroundScheduler

        def _rodar_sincronizacao_diaria():
            sincronizar_dia(date.today() - timedelta(days=1))

        def _rodar_sincronizacao_hoje():
            sincronizar_dia(date.today())

        _scheduler = BackgroundScheduler(timezone="America/Sao_Paulo")
        _scheduler.add_job(_rodar_sincronizacao_diaria, "cron", hour=3, minute=0)
        _scheduler.add_job(
            _rodar_sincronizacao_hoje, "interval", minutes=15, next_run_time=datetime.now()
        )
        _scheduler.start()

# Lojas que registram vendas presenciais (não passam pela Cardápio Web e
# precisam ser lançadas manualmente).
UNIDADES_COM_PRESENCIAL = {"Hamburgueria Artesanos", "Tradiça ZN"}


def _aplicar_presencial(linhas, linhas_presencial):
    por_chave = {(l["unidade"], l["dia"]): l for l in linhas}
    for p in linhas_presencial:
        chave = (p["unidade"], p["dia"])
        qtd_presencial = p.get("quantidade") or 0
        if chave in por_chave:
            linha = por_chave[chave]
            linha["faturamento_dia"] += p["valor"]
            linha["quantidade_pedidos"] += qtd_presencial
            linha["ticket_medio"] = (
                linha["faturamento_dia"] / linha["quantidade_pedidos"]
                if linha["quantidade_pedidos"] else 0.0
            )
        else:
            por_chave[chave] = {
                "unidade": p["unidade"],
                "dia": p["dia"],
                "faturamento_dia": p["valor"],
                "ticket_medio": p["valor"] / qtd_presencial if qtd_presencial else 0.0,
                "quantidade_pedidos": qtd_presencial,
            }
    return list(por_chave.values())


def _formatar_moeda(valor):
    texto = f"{valor:,.2f}"
    return texto.replace(",", "@").replace(".", ",").replace("@", ".")


def _formatar_numero(valor):
    return f"{valor:,}".replace(",", ".")


def _formatar_data_br(dia_iso):
    ano, mes, dia = dia_iso.split("-")
    return f"{dia}/{mes}/{ano}"


DIAS_SEMANA_ABREV = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
DIAS_SEMANA_COMPLETO = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


def _dia_semana_abrev(dia_iso):
    return DIAS_SEMANA_ABREV[date.fromisoformat(dia_iso).weekday()]


def _nome_plural_dia_semana(indice):
    # "segunda" -> "segundas-feiras", mas sábado/domingo não levam "-feira".
    if indice == 5:
        return "sábados"
    if indice == 6:
        return "domingos"
    return f"{DIAS_SEMANA_COMPLETO[indice]}s-feiras"


def _agregar_canais(linhas_canais, unidade_filtro):
    if unidade_filtro is not None:
        linhas_canais = [l for l in linhas_canais if l["unidade"] == unidade_filtro]

    agregados = {}
    for linha in linhas_canais:
        atual = agregados.setdefault(
            linha["canal"],
            {"canal": linha["canal"], "faturamento": 0.0, "pedidos": 0},
        )
        atual["faturamento"] += linha["faturamento"]
        atual["pedidos"] += linha["quantidade_pedidos"]

    total = sum(item["faturamento"] for item in agregados.values()) or 1
    resultado = []
    for item in agregados.values():
        resultado.append({
            "canal": item["canal"],
            "faturamento": item["faturamento"],
            "pedidos": item["pedidos"],
            "ticket_medio": item["faturamento"] / item["pedidos"] if item["pedidos"] else 0.0,
            "percentual": item["faturamento"] / total * 100,
        })
    resultado.sort(key=lambda i: i["faturamento"], reverse=True)
    return resultado


def _linhas_canais_com_presencial(inicio_iso, fim_iso=None):
    """Canais da Cardápio Web de um dia (ou período) + venda presencial como
    um canal "Presencial" a mais (também não passa pela Cardápio Web)."""
    if fim_iso is None:
        fim_iso = inicio_iso
    linhas_canais = buscar_canais_periodo(inicio_iso, fim_iso)
    linhas_canais = linhas_canais + [
        {
            "unidade": p["unidade"],
            "dia": p["dia"],
            "canal": "Presencial",
            "quantidade_pedidos": p.get("quantidade") or 0,
            "faturamento": p["valor"],
        }
        for p in buscar_presencial_periodo(inicio_iso, fim_iso)
    ]
    return linhas_canais


def _formatar_canais(canais):
    return [
        {
            "canal": c["canal"],
            "faturamento": _formatar_moeda(c["faturamento"]),
            "faturamentoNumero": round(c["faturamento"], 2),
            "pedidos": _formatar_numero(c["pedidos"]),
            "ticket": _formatar_moeda(c["ticket_medio"]),
            "percentual": round(c["percentual"], 1),
        }
        for c in canais
    ]


def _formatar_diario(linhas):
    return [
        {
            "dia": _formatar_data_br(l["dia"]),
            "diaIso": l["dia"],
            "diaSemana": _dia_semana_abrev(l["dia"]),
            "unidade": l["unidade"],
            "pedidos": _formatar_numero(l["quantidade_pedidos"]),
            "ticket": _formatar_moeda(l["ticket_medio"]),
            "faturamento": _formatar_moeda(l["faturamento_dia"]),
        }
        for l in linhas
    ]


def _cards_periodo(unidade_filtro, linhas_periodo):
    """Faturamento Total / Total de Pedidos / Ticket Médio somados no
    período selecionado no filtro (início-fim) — vale pra Visão Geral e
    pra cada loja."""
    base = linhas_periodo if unidade_filtro is None else [l for l in linhas_periodo if l["unidade"] == unidade_filtro]

    fat = sum(l["faturamento_dia"] for l in base)
    ped = sum(l["quantidade_pedidos"] for l in base)
    tik = fat / ped if ped else 0.0

    return {
        "faturamento": _formatar_moeda(fat),
        "faturamentoTrend": "período novo",
        "faturamentoUp": True,
        "pedidos": _formatar_numero(ped),
        "pedidosTrend": "período novo",
        "pedidosUp": True,
        "ticket": _formatar_moeda(tik),
        "ticketTrend": "período novo",
        "ticketUp": True,
    }


def _montar_bloco(unidade_filtro, linhas_periodo, titulo, linhas_canais, canal_data_label):
    base = linhas_periodo if unidade_filtro is None else [l for l in linhas_periodo if l["unidade"] == unidade_filtro]

    diario = sorted(base, key=lambda l: (l["dia"], l["unidade"]), reverse=True)
    canais = _agregar_canais(linhas_canais, unidade_filtro)

    return {
        "title": titulo,
        "canalDataLabel": canal_data_label,
        "diario": _formatar_diario(diario),
        "canais": _formatar_canais(canais),
    }


DIRETORIO_BASE = os.path.dirname(os.path.abspath(__file__))
EXTENSOES_PUBLICAS = {".html", ".css", ".js"}
EXTENSOES_IMAGEM_PUBLICAS = {".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif", ".ico"}


@app.route('/')
def home():
    return send_from_directory(DIRETORIO_BASE, 'index.html')


@app.route('/<path:nome_arquivo>')
def arquivo_estatico(nome_arquivo):
    # As páginas (insight.html, estoque.html, etc) e seus CSS/JS ficam soltos
    # na raiz do projeto, junto com o código do backend — por isso essa rota
    # só serve HTML/CSS/JS de nomes diretos, nunca .py/.env/.db/.log nem
    # nada dentro de subpastas (o que bloqueia acesso a backend/, .git/ etc).
    if '/' in nome_arquivo or '\\' in nome_arquivo:
        abort(404)
    _, extensao = os.path.splitext(nome_arquivo)
    if extensao.lower() not in EXTENSOES_PUBLICAS:
        abort(404)
    return send_from_directory(DIRETORIO_BASE, nome_arquivo)


@app.route('/imgs/<path:nome_arquivo>')
def arquivo_imagem(nome_arquivo):
    # Único subdiretório liberado, e só pra extensões de imagem — mesma
    # lógica de allowlist da rota acima, restrita à pasta imgs/.
    if '..' in nome_arquivo or nome_arquivo.startswith('/'):
        abort(404)
    _, extensao = os.path.splitext(nome_arquivo)
    if extensao.lower() not in EXTENSOES_IMAGEM_PUBLICAS:
        abort(404)
    return send_from_directory(os.path.join(DIRETORIO_BASE, 'imgs'), nome_arquivo)


def _formatar_usuario(usuario):
    return {
        "id": usuario["id"],
        "nome": usuario["nome"],
        "email": usuario["email"],
        "papel": usuario["papel"],
    }


@app.route('/api/login', methods=['POST'])
def api_login():
    dados = request.get_json(silent=True) or {}
    email = (dados.get('email') or '').strip()
    senha = dados.get('senha') or ''

    if not email or not senha:
        return jsonify({"erro": "Informe e-mail e senha."}), 400

    # DEBUG TEMPORÁRIO — mostra o motivo exato na própria tela de login,
    # já que os logs do Dokploy não estavam revelando nada. Remover assim
    # que o problema for resolvido (ver app.py, api_login).
    _diag = f" [debug: banco={_caminho_banco_atual} existe={os.path.exists(_caminho_banco_atual)} usuarios={len(listar_usuarios())} pid={os.getpid()}]"

    usuario = buscar_usuario_por_email(email)
    if not usuario:
        print(f"🔑 Login falhou — nenhum usuário com o e-mail '{email}' (worker pid {os.getpid()}, {len(listar_usuarios())} usuários no banco)")
        return jsonify({"erro": "E-mail ou senha incorretos." + _diag + " motivo=email_nao_encontrado"}), 401
    if not usuario["ativo"]:
        print(f"🔑 Login falhou — usuário '{email}' está inativo")
        return jsonify({"erro": "E-mail ou senha incorretos." + _diag + " motivo=inativo"}), 401
    if not senha_confere(senha, usuario["senha_hash"]):
        print(f"🔑 Login falhou — senha não confere pro usuário '{email}'")
        return jsonify({"erro": "E-mail ou senha incorretos." + _diag + " motivo=senha_nao_confere"}), 401

    session.clear()
    session['usuario_id'] = usuario['id']
    session.permanent = True
    return jsonify({"usuario": _formatar_usuario(usuario)})


@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({"sucesso": True})


@app.route('/api/me', methods=['GET'])
def api_me():
    usuario = _usuario_logado()
    if not usuario:
        return jsonify({"erro": "Não autenticado."}), 401
    return jsonify({"usuario": _formatar_usuario(usuario)})


@app.route('/api/me/senha', methods=['PUT'])
def api_trocar_minha_senha():
    # Autoatendimento — qualquer usuário logado troca a própria senha,
    # sem precisar ser admin (diferente do reset de senha de terceiros,
    # que só o admin faz pela tela de Equipe).
    usuario = _usuario_logado()
    if not usuario:
        return jsonify({"erro": "Não autenticado."}), 401

    dados = request.get_json(silent=True) or {}
    senha_atual = dados.get('senhaAtual') or ''
    senha_nova = dados.get('senhaNova') or ''

    if not senha_confere(senha_atual, usuario['senha_hash']):
        return jsonify({"erro": "Senha atual incorreta."}), 400
    if len(senha_nova) < 6:
        return jsonify({"erro": "A nova senha precisa ter pelo menos 6 caracteres."}), 400

    atualizar_usuario(usuario['id'], {'senha_hash': gerar_hash_senha(senha_nova)})
    return jsonify({"sucesso": True})


# --- GESTÃO DE EQUIPE (só admin) --------------------------------------------

def _exigir_admin():
    usuario = _usuario_logado()
    if not usuario or usuario['papel'] != 'admin':
        return jsonify({"erro": "Só administradores podem fazer isso."}), 403
    return None


def _formatar_membro_equipe(usuario):
    return {
        "id": usuario["id"],
        "nome": usuario["nome"],
        "email": usuario["email"],
        "papel": usuario["papel"],
        "ativo": bool(usuario["ativo"]),
        "criadoEm": usuario["criado_em"],
    }


@app.route('/api/usuarios', methods=['GET'])
def api_listar_usuarios():
    erro = _exigir_admin()
    if erro:
        return erro
    return jsonify({"usuarios": [_formatar_membro_equipe(u) for u in listar_usuarios()]})


@app.route('/api/usuarios', methods=['POST'])
def api_criar_usuario():
    erro = _exigir_admin()
    if erro:
        return erro

    dados = request.get_json(silent=True) or {}
    nome = (dados.get('nome') or '').strip()
    email = (dados.get('email') or '').strip()
    senha = dados.get('senha') or ''
    papel = dados.get('papel') if dados.get('papel') in ('admin', 'equipe') else 'equipe'

    if not nome or not email:
        return jsonify({"erro": "Informe nome e e-mail."}), 400
    if len(senha) < 6:
        return jsonify({"erro": "A senha precisa ter pelo menos 6 caracteres."}), 400
    if buscar_usuario_por_email(email):
        return jsonify({"erro": "Já existe um usuário com esse e-mail."}), 400

    usuario_id = criar_usuario(nome, email, gerar_hash_senha(senha), papel)
    return jsonify({"usuario": _formatar_membro_equipe(buscar_usuario_por_id(usuario_id))})


@app.route('/api/usuarios/<int:usuario_id>', methods=['PUT'])
def api_atualizar_usuario(usuario_id):
    erro = _exigir_admin()
    if erro:
        return erro

    if not buscar_usuario_por_id(usuario_id):
        return jsonify({"erro": "Usuário não encontrado."}), 404

    dados = request.get_json(silent=True) or {}
    campos = {}
    if 'nome' in dados:
        if not (dados.get('nome') or '').strip():
            return jsonify({"erro": "Nome não pode ficar vazio."}), 400
        campos['nome'] = dados['nome'].strip()
    if 'papel' in dados:
        if dados['papel'] not in ('admin', 'equipe'):
            return jsonify({"erro": "Papel inválido."}), 400
        campos['papel'] = dados['papel']
    if 'ativo' in dados:
        campos['ativo'] = 1 if dados['ativo'] else 0
    if 'senha' in dados and dados['senha']:
        if len(dados['senha']) < 6:
            return jsonify({"erro": "A senha precisa ter pelo menos 6 caracteres."}), 400
        campos['senha_hash'] = gerar_hash_senha(dados['senha'])

    if not campos:
        return jsonify({"erro": "Nada pra atualizar."}), 400

    # Impede o admin de se autodesativar/rebaixar por engano e ficar trancado
    # pra fora da própria gestão de equipe.
    usuario_logado = _usuario_logado()
    if usuario_logado['id'] == usuario_id:
        if campos.get('ativo') == 0:
            return jsonify({"erro": "Você não pode desativar a si mesmo."}), 400
        if campos.get('papel') == 'equipe':
            return jsonify({"erro": "Você não pode remover seu próprio acesso de admin."}), 400

    atualizar_usuario(usuario_id, campos)
    return jsonify({"usuario": _formatar_membro_equipe(buscar_usuario_por_id(usuario_id))})


@app.route('/api/usuarios/<int:usuario_id>', methods=['DELETE'])
def api_excluir_usuario(usuario_id):
    erro = _exigir_admin()
    if erro:
        return erro

    if not buscar_usuario_por_id(usuario_id):
        return jsonify({"erro": "Usuário não encontrado."}), 404

    usuario_logado = _usuario_logado()
    if usuario_logado['id'] == usuario_id:
        return jsonify({"erro": "Você não pode excluir a si mesmo."}), 400

    excluir_usuario(usuario_id)
    return jsonify({"sucesso": True})


@app.route('/api/faturamento-ontem', methods=['GET'])
def api_faturamento_ontem():
    # Lê do mesmo cache local sincronizado, em vez de chamar a Cardápio Web
    # ao vivo (o endpoint antigo usava uma URL da API que nunca funcionou).
    ontem = (date.today() - timedelta(days=1)).isoformat()
    linhas = _aplicar_presencial(
        buscar_faturamento_periodo(ontem, ontem),
        buscar_presencial_periodo(ontem, ontem),
    )
    total_rede = sum(l["faturamento_dia"] for l in linhas)

    lojas = [
        {"nome": l["unidade"], "total": l["faturamento_dia"], "sucesso": True}
        for l in linhas
    ]
    unidades_com_dado = {l["unidade"] for l in linhas}
    for nome_unidade in LOJAS.keys():
        if nome_unidade not in unidades_com_dado:
            lojas.append({"nome": nome_unidade, "total": 0.0, "sucesso": False})

    return jsonify({"data": ontem, "total_rede": total_rede, "lojas": lojas})


@app.route('/api/faturamento-rede-diario', methods=['GET'])
def api_faturamento_rede_diario():
    # Faturamento da rede (4 lojas somadas) dia a dia, pro gráfico da Home.
    try:
        dias = int(request.args.get('dias', 7))
    except ValueError:
        dias = 7
    dias = max(1, min(dias, 90))

    hoje = date.today()
    fim = hoje - timedelta(days=1)
    inicio = fim - timedelta(days=dias - 1)

    linhas = _aplicar_presencial(
        buscar_faturamento_periodo(inicio.isoformat(), fim.isoformat()),
        buscar_presencial_periodo(inicio.isoformat(), fim.isoformat()),
    )

    por_dia = {}
    for l in linhas:
        por_dia[l["dia"]] = por_dia.get(l["dia"], 0.0) + l["faturamento_dia"]

    dias_ordenados = sorted(por_dia.keys())
    return jsonify({
        "dias": [
            {
                "dia": _formatar_data_br(d),
                "diaSemana": _dia_semana_abrev(d),
                "faturamento": round(por_dia[d], 2),
            }
            for d in dias_ordenados
        ]
    })


def _mascarar_token(token):
    if not token:
        return "— não configurado —"
    if len(token) <= 8:
        return "•" * len(token)
    return f"{token[:4]}{'•' * 8}{token[-4:]}"


@app.route('/api/config/lojas', methods=['GET'])
def api_config_lojas():
    ultimo_dia = buscar_ultima_sincronizacao()
    lojas = []
    for nome, cfg in LOJAS.items():
        ultimo_dia_loja = buscar_ultima_sincronizacao(nome)
        lojas.append({
            "nome": nome,
            "tokenMascarado": _mascarar_token(cfg.get("cardapio_web_token")),
            "temPresencial": nome in UNIDADES_COM_PRESENCIAL,
            "ultimaSincronizacao": _formatar_data_br(ultimo_dia_loja) if ultimo_dia_loja else None,
        })
    return jsonify({
        "ultimaSincronizacao": _formatar_data_br(ultimo_dia) if ultimo_dia else None,
        "lojas": lojas,
    })


def _sincronizar_lojas_em_segundo_plano(dia_alvo):
    dia_iso = dia_alvo.isoformat()
    for nome_unidade, config_loja in LOJAS.items():
        token = config_loja.get("cardapio_web_token")
        if not token:
            continue
        try:
            resumo = buscar_resumo_do_dia(token, dia_alvo)
            salvar_resumo_do_dia(nome_unidade, dia_iso, resumo)
        except Exception as erro:
            print(f"❌ Sincronização manual falhou para {nome_unidade} ({dia_iso}): {erro}")


@app.route('/api/sincronizar-agora', methods=['POST'])
def api_sincronizar_agora():
    # Sem ?dia=, sincroniza ontem (uso normal do botão). Com ?dia=AAAA-MM-DD,
    # sincroniza um dia específico — útil pra corrigir um dia com dado
    # incompleto/desatualizado sem esperar o próximo agendamento automático.
    dia_str = request.args.get('dia')
    if dia_str:
        try:
            dia_alvo = date.fromisoformat(dia_str)
        except ValueError:
            return jsonify({"erro": "Data inválida."}), 400
    else:
        dia_alvo = date.today() - timedelta(days=1)

    if dia_alvo.weekday() == DIA_FECHADO:
        return jsonify({
            "diaLabel": _formatar_data_br(dia_alvo.isoformat()),
            "fechado": True,
            "resultados": [],
        })

    # Roda em segundo plano e responde na hora — sincronizar as 4 lojas pedido
    # por pedido pode passar do tempo que o proxy/gateway de produção espera
    # por uma resposta, derrubando a conexão no meio do processo (e deixando
    # dado só parcialmente atualizado). O resultado final aparece na tela de
    # Configurações/Home assim que a atualização automática buscar de novo.
    threading.Thread(target=_sincronizar_lojas_em_segundo_plano, args=(dia_alvo,), daemon=True).start()

    return jsonify({
        "diaLabel": _formatar_data_br(dia_alvo.isoformat()),
        "fechado": False,
        "iniciado": True,
    })


@app.route('/api/venda-presencial', methods=['POST'])
def api_salvar_venda_presencial():
    dados = request.get_json(silent=True) or {}
    unidade = dados.get('unidade')
    dia = dados.get('dia')
    valor = dados.get('valor')
    quantidade = dados.get('quantidade', 0)

    if unidade not in UNIDADES_COM_PRESENCIAL:
        return jsonify({"erro": "Unidade inválida para lançamento presencial."}), 400
    if not dia:
        return jsonify({"erro": "Informe o dia."}), 400
    try:
        valor = float(valor)
    except (TypeError, ValueError):
        return jsonify({"erro": "Valor inválido."}), 400
    if valor < 0:
        return jsonify({"erro": "Valor não pode ser negativo."}), 400
    try:
        quantidade = int(quantidade) if quantidade not in (None, '') else 0
    except (TypeError, ValueError):
        return jsonify({"erro": "Quantidade inválida."}), 400
    if quantidade < 0:
        return jsonify({"erro": "Quantidade não pode ser negativa."}), 400

    salvar_venda_presencial(unidade, dia, valor, quantidade)
    return jsonify({"sucesso": True})


@app.route('/api/venda-presencial', methods=['DELETE'])
def api_excluir_venda_presencial():
    unidade = request.args.get('unidade')
    dia = request.args.get('dia')

    if unidade not in UNIDADES_COM_PRESENCIAL:
        return jsonify({"erro": "Unidade inválida para lançamento presencial."}), 400
    if not dia:
        return jsonify({"erro": "Informe o dia."}), 400

    excluir_venda_presencial(unidade, dia)
    return jsonify({"sucesso": True})


@app.route('/api/venda-presencial', methods=['GET'])
def api_listar_venda_presencial():
    unidade = request.args.get('unidade')
    if unidade not in UNIDADES_COM_PRESENCIAL:
        return jsonify({"erro": "Unidade inválida para lançamento presencial."}), 400

    lancamentos = buscar_presencial_por_unidade(unidade)
    return jsonify({
        "lancamentos": [
            {
                "dia": _formatar_data_br(l["dia"]),
                "diaIso": l["dia"],
                "valor": _formatar_moeda(l["valor"]),
                "valorNumero": l["valor"],
                "quantidade": l["quantidade"],
            }
            for l in lancamentos
        ]
    })


@app.route('/api/canal-analise', methods=['GET'])
def api_canal_analise():
    unidade = request.args.get('unidade', 'geral')
    dia = request.args.get('dia')

    if not dia:
        return jsonify({"erro": "Informe o dia."}), 400
    try:
        date.fromisoformat(dia)
    except ValueError:
        return jsonify({"erro": "Data inválida."}), 400

    linhas_canais = _linhas_canais_com_presencial(dia)
    unidade_filtro = None if unidade == 'geral' else unidade
    canais = _agregar_canais(linhas_canais, unidade_filtro)

    return jsonify({
        "dataLabel": _formatar_data_br(dia),
        "canais": _formatar_canais(canais),
    })


@app.route('/api/faturamento-mesmo-dia-semana', methods=['GET'])
def api_faturamento_mesmo_dia_semana():
    # Pra montar a comparação "1ª terça do mês", "2ª terça do mês" etc no
    # relatório do WhatsApp: todas as ocorrências do mesmo dia da semana de
    # `dia`, dentro do mesmo mês, em ordem cronológica.
    unidade = request.args.get('unidade')
    dia = request.args.get('dia')

    if unidade not in LOJAS:
        return jsonify({"erro": "Unidade inválida."}), 400
    if not dia:
        return jsonify({"erro": "Informe o dia."}), 400
    try:
        data_ref = date.fromisoformat(dia)
    except ValueError:
        return jsonify({"erro": "Data inválida."}), 400

    primeiro_dia_mes = data_ref.replace(day=1)
    if primeiro_dia_mes.month == 12:
        primeiro_dia_prox_mes = primeiro_dia_mes.replace(year=primeiro_dia_mes.year + 1, month=1)
    else:
        primeiro_dia_prox_mes = primeiro_dia_mes.replace(month=primeiro_dia_mes.month + 1)
    ultimo_dia_mes = primeiro_dia_prox_mes - timedelta(days=1)

    linhas = _aplicar_presencial(
        buscar_faturamento_periodo(primeiro_dia_mes.isoformat(), ultimo_dia_mes.isoformat()),
        buscar_presencial_periodo(primeiro_dia_mes.isoformat(), ultimo_dia_mes.isoformat()),
    )
    linhas = [
        l for l in linhas
        if l["unidade"] == unidade and date.fromisoformat(l["dia"]).weekday() == data_ref.weekday()
    ]
    linhas.sort(key=lambda l: l["dia"])

    return jsonify({
        "diaSemana": DIAS_SEMANA_COMPLETO[data_ref.weekday()],
        "ocorrencias": [
            {"dia": _formatar_data_br(l["dia"]), "faturamento": _formatar_moeda(l["faturamento_dia"])}
            for l in linhas
        ],
    })


@app.route('/api/insights', methods=['GET'])
def api_insights():
    inicio_str = request.args.get('inicio')
    fim_str = request.args.get('fim')

    if inicio_str and fim_str:
        try:
            inicio = date.fromisoformat(inicio_str)
            fim = date.fromisoformat(fim_str)
        except ValueError:
            return jsonify({"erro": "Datas inválidas."}), 400
        if inicio > fim:
            inicio, fim = fim, inicio
    else:
        fim = date.today()
        inicio = fim - timedelta(days=29)

    linhas_periodo = _aplicar_presencial(
        buscar_faturamento_periodo(inicio.isoformat(), fim.isoformat()),
        buscar_presencial_periodo(inicio.isoformat(), fim.isoformat()),
    )

    # Cards de topo, gráfico e tabela de canais agora refletem todos o mesmo
    # período selecionado no filtro (início-fim) — antes ficavam travados no
    # dia anterior, independente do filtro.
    linhas_canais = _linhas_canais_com_presencial(inicio.isoformat(), fim.isoformat())

    # Filtro opcional por dia da semana (ex: "só sextas-feiras") — restringe
    # o período já buscado, em vez de mudar o que foi buscado; assim o
    # usuário pode combinar "últimos 90 dias" + "sexta" pra ver as últimas
    # ~13 sextas, por exemplo.
    dia_semana_str = request.args.get('diaSemana')
    dia_semana_idx = None
    if dia_semana_str not in (None, ''):
        try:
            candidato = int(dia_semana_str)
            if 0 <= candidato <= 6:
                dia_semana_idx = candidato
        except ValueError:
            pass

    if dia_semana_idx is not None:
        linhas_periodo = [l for l in linhas_periodo if date.fromisoformat(l["dia"]).weekday() == dia_semana_idx]
        linhas_canais = [l for l in linhas_canais if date.fromisoformat(l["dia"]).weekday() == dia_semana_idx]

    if inicio == fim:
        canal_data_label = _formatar_data_br(inicio.isoformat())
    else:
        canal_data_label = f"{_formatar_data_br(inicio.isoformat())} até {_formatar_data_br(fim.isoformat())}"
    if dia_semana_idx is not None:
        canal_data_label += f" — só {_nome_plural_dia_semana(dia_semana_idx)}"

    resposta = {
        "geral": _montar_bloco(
            None, linhas_periodo, "Visão Geral (Todas)", linhas_canais, canal_data_label
        )
    }
    for nome_unidade in LOJAS.keys():
        resposta[nome_unidade] = _montar_bloco(
            nome_unidade, linhas_periodo, nome_unidade, linhas_canais, canal_data_label
        )

    resposta["geral"].update(_cards_periodo(None, linhas_periodo))
    for nome_unidade in LOJAS.keys():
        resposta[nome_unidade].update(_cards_periodo(nome_unidade, linhas_periodo))

    return jsonify(resposta)


# Nomes de exibição dos canais pra rede toda — mesma regra da Visão Geral
# no frontend (nomeExibicaoCanal em script.js): "portal" sempre vira
# "Presencial" aqui, já que esse relatório nunca é por loja individual.
NOMES_CANAL_REDE = {"ifood": "IFood", "food99": "99Food", "catalog": "Cardápio Web", "portal": "Presencial"}


@app.route('/api/insights-automaticos', methods=['GET'])
def api_insights_automaticos():
    # Sempre compara ontem contra a média dos 7 dias anteriores a ontem —
    # independente do período selecionado no filtro da tela, porque essa
    # é uma checagem de "o que mudou recentemente", não do histórico.
    ontem = date.today() - timedelta(days=1)
    base_fim = ontem - timedelta(days=1)
    base_inicio = base_fim - timedelta(days=6)
    dias_base = (base_fim - base_inicio).days + 1

    canais_ontem = _agregar_canais(_linhas_canais_com_presencial(ontem.isoformat()), None)
    canais_base = _agregar_canais(
        _linhas_canais_com_presencial(base_inicio.isoformat(), base_fim.isoformat()), None
    )

    valor_ontem = {c["canal"]: c["faturamento"] for c in canais_ontem}
    valor_medio_base = {c["canal"]: c["faturamento"] / dias_base for c in canais_base}

    insights = []

    def _avaliar(rotulo, atual, medio):
        if medio <= 0:
            return
        variacao = (atual - medio) / medio * 100
        if abs(variacao) < 8:  # abaixo disso é ruído normal do dia a dia, não vale destacar
            return
        insights.append({
            "rotulo": rotulo,
            "percentual": round(abs(variacao), 1),
            "direcao": "alta" if variacao > 0 else "baixa",
        })

    _avaliar("Faturamento total", sum(valor_ontem.values()), sum(valor_medio_base.values()))

    for canal_bruto in set(valor_ontem) | set(valor_medio_base):
        nome = NOMES_CANAL_REDE.get(canal_bruto, canal_bruto)
        _avaliar(nome, valor_ontem.get(canal_bruto, 0.0), valor_medio_base.get(canal_bruto, 0.0))

    insights.sort(key=lambda i: i["percentual"], reverse=True)

    return jsonify({
        "dataLabel": _formatar_data_br(ontem.isoformat()),
        "periodoBaseLabel": f"{_formatar_data_br(base_inicio.isoformat())} a {_formatar_data_br(base_fim.isoformat())}",
        "insights": insights[:5],
    })


# --- TAREFAS (quadro do ClickUp) --------------------------------------------

def _formatar_tarefa(tarefa):
    return {
        "id": tarefa["id"],
        "titulo": tarefa["titulo"],
        "descricao": tarefa["descricao"],
        "categoria": tarefa["categoria"],
        "prioridade": tarefa["prioridade"],
        "status": tarefa["status"],
        "dataLimite": tarefa["data_limite"],
        "dataLimiteFormatada": _formatar_data_br(tarefa["data_limite"]) if tarefa["data_limite"] else None,
        "subtarefas": [
            {"id": s["id"], "titulo": s["titulo"], "concluida": bool(s["concluida"])}
            for s in tarefa["subtarefas"]
        ],
        "comentarios": [
            {"id": c["id"], "autor": c["autor"], "texto": c["texto"], "criadoEm": c["criado_em"]}
            for c in tarefa["comentarios"]
        ],
    }


@app.route('/api/tarefas', methods=['GET'])
def api_listar_tarefas():
    return jsonify({"tarefas": [_formatar_tarefa(t) for t in listar_tarefas()]})


@app.route('/api/tarefas', methods=['POST'])
def api_criar_tarefa():
    dados = request.get_json(silent=True) or {}
    titulo = (dados.get('titulo') or '').strip()
    if not titulo:
        return jsonify({"erro": "Título é obrigatório."}), 400
    tarefa_id = criar_tarefa(
        titulo,
        dados.get('descricao') or '',
        dados.get('categoria') or 'Geral',
        dados.get('prioridade') or 'media',
        dados.get('dataLimite') or None,
    )
    return jsonify({"id": tarefa_id})


# Nomes que o frontend usa (camelCase) -> coluna real na tabela tarefa.
CAMPOS_TAREFA_PERMITIDOS = {
    'titulo': 'titulo',
    'descricao': 'descricao',
    'categoria': 'categoria',
    'prioridade': 'prioridade',
    'status': 'status',
    'dataLimite': 'data_limite',
}


@app.route('/api/tarefas/<int:tarefa_id>', methods=['PUT'])
def api_atualizar_tarefa(tarefa_id):
    dados = request.get_json(silent=True) or {}
    campos = {
        coluna: dados[chave]
        for chave, coluna in CAMPOS_TAREFA_PERMITIDOS.items()
        if chave in dados
    }
    if not campos:
        return jsonify({"erro": "Nada para atualizar."}), 400
    atualizar_tarefa(tarefa_id, campos)
    return jsonify({"ok": True})


@app.route('/api/tarefas/<int:tarefa_id>', methods=['DELETE'])
def api_excluir_tarefa(tarefa_id):
    excluir_tarefa(tarefa_id)
    return jsonify({"ok": True})


@app.route('/api/tarefas/<int:tarefa_id>/subtarefas', methods=['POST'])
def api_adicionar_subtarefa(tarefa_id):
    dados = request.get_json(silent=True) or {}
    titulo = (dados.get('titulo') or '').strip()
    if not titulo:
        return jsonify({"erro": "Título é obrigatório."}), 400
    subtarefa_id = adicionar_subtarefa(tarefa_id, titulo)
    return jsonify({"id": subtarefa_id})


@app.route('/api/tarefas/<int:tarefa_id>/subtarefas/<int:subtarefa_id>', methods=['PUT'])
def api_alternar_subtarefa(tarefa_id, subtarefa_id):
    dados = request.get_json(silent=True) or {}
    alternar_subtarefa(subtarefa_id, bool(dados.get('concluida')))
    return jsonify({"ok": True})


@app.route('/api/tarefas/<int:tarefa_id>/comentarios', methods=['POST'])
def api_adicionar_comentario(tarefa_id):
    dados = request.get_json(silent=True) or {}
    texto = (dados.get('texto') or '').strip()
    if not texto:
        return jsonify({"erro": "Comentário vazio."}), 400
    # O sistema ainda não tem login individual por pessoa — todo comentário
    # é registrado com o único usuário atual, igual ao resto do sistema hoje.
    comentario_id = adicionar_comentario(tarefa_id, _usuario_logado()['nome'], texto)
    return jsonify({"id": comentario_id})


if __name__ == '__main__':
    # threaded=True: sem isso, o servidor de desenvolvimento atende um
    # pedido de cada vez — uma sincronização manual demorada (chama a
    # Cardápio Web pedido por pedido) travaria a página inteira pra
    # qualquer outra aba/pessoa até terminar. Em produção isso já não
    # acontece, porque o Gunicorn roda vários workers em paralelo.
    app.run(debug=True, port=5000, threaded=True)
