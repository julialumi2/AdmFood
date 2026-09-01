import os
import threading
import time
import uuid
from datetime import date, datetime, timedelta
from flask import Flask, abort, jsonify, redirect, request, send_from_directory, session

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
    salvar_pedidos_do_dia,
    salvar_itens_vendidos_do_dia,
    buscar_pedidos_preparo_periodo,
    salvar_ajuste_canal,
    excluir_ajuste_canal,
    buscar_ajustes_canal_periodo,
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
    listar_precos_cardapio,
    sincronizar_precos_cardapio,
    buscar_preco_cardapio_por_id,
    atualizar_preco_cardapio,
    PASTA_FOTOS_CARDAPIO,
    criar_insumo,
    criar_insumos_em_lote,
    listar_insumos,
    listar_insumos_por_loja,
    salvar_insumos_da_loja,
    atualizar_insumo,
    excluir_insumo,
    atualizar_estoque_loja,
    distribuir_entrada_insumo,
    criar_item_cardapio,
    listar_itens_cardapio,
    excluir_item_cardapio,
    definir_ficha_tecnica,
    buscar_ficha_tecnica_completa,
    consumo_medio_insumo,
    listar_lotes_vencendo,
    marcar_lote_resolvido,
    criar_fornecedor,
    listar_fornecedores,
    atualizar_fornecedor,
    definir_fornecedores_insumo,
    mapa_insumo_fornecedores,
    criar_cotacao,
    listar_cotacoes,
    buscar_cotacao,
    atualizar_cotacao,
    excluir_cotacao,
    adicionar_preco_cotacao,
    listar_precos_cotacao,
    excluir_preco_cotacao,
    selecionar_preco_cotacao,
    criar_contagem,
    listar_contagens,
    listar_requisicoes,
    buscar_contagem,
    buscar_contagem_por_token,
    listar_itens_contagem,
    responder_contagem,
    aprovar_contagem,
    reabrir_contagem,
    salvar_ajuste_quantidade_ideal,
    salvar_ajustes_quantidade_ideal_em_lote,
    excluir_ajuste_quantidade_ideal,
    mapa_ajustes_quantidade_ideal,
    copiar_quantidade_ideal,
    multiplicador_quantidade_ideal,
    criar_data_especial,
    excluir_data_especial,
    listar_datas_especiais,
    gerar_cotacao_do_deficit,
    listar_itens_cotacao,
    gerar_pedidos_de_cotacao,
    listar_pedidos,
    buscar_pedido,
    avancar_status_pedido,
    voltar_status_pedido,
    excluir_pedido,
    listar_pedidos_pendentes_recebimento,
    confirmar_recebimento_pedido,
    ESTAGIOS_PEDIDO,
    limpar_requisicoes_e_cotacoes,
    excluir_requisicao,
    listar_historico_compras,
    criar_convites_cotacao,
    listar_convites_cotacao,
    buscar_convite_por_token,
    responder_convite_cotacao,
)
from backend.precos_cardapio import ler_precos_da_planilha
from backend.auth import gerar_hash_senha, senha_confere
from backend.cardapio_web import buscar_resumo_do_dia
from sincronizar import sincronizar_dia, DIA_FECHADO

app = Flask(__name__)
# Sem CORS: frontend e backend são servidos pelo mesmo Flask (mesma origem),
# então cross-origin nunca foi necessário de verdade em produção — e com
# login/sessão em jogo, quanto menos origens confiadas, melhor.
if not SECRET_KEY:
    print("⚠️  SECRET_KEY não definida — sessões de login não vão sobreviver a um restart/redeploy. Defina no .env (local) ou nas variáveis de ambiente do Dokploy (produção).")
app.secret_key = SECRET_KEY or "chave-insegura-so-para-dev-local"
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('SESSION_COOKIE_SECURE', 'false').lower() == 'true'

inicializar_banco()


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


def _membros_equipe_inicial():
    if not EQUIPE_INICIAL_JSON:
        return []
    import json
    try:
        return json.loads(EQUIPE_INICIAL_JSON)
    except Exception:
        print(f"❌ EQUIPE_INICIAL não é um JSON válido: {EQUIPE_INICIAL_JSON[:80]}")
        return []


def _criar_equipe_inicial_se_necessario():
    # Mesma ideia do admin inicial, mas pra vários membros de uma vez, via
    # uma lista JSON em EQUIPE_INICIAL — evita depender de conseguir logar
    # primeiro pra cadastrar todo mundo pela tela de Equipe. Depois que
    # todo mundo estiver com acesso, pode remover essa variável do
    # ambiente (mesmo aviso do admin: enquanto estiver definida, um
    # redeploy volta a senha de cada um pro valor daqui).
    for membro in _membros_equipe_inicial():
        papel = membro.get('papel') if membro.get('papel') in ('admin', 'equipe') else 'equipe'
        _sincronizar_usuario_inicial(
            membro.get('nome'), membro.get('email'), membro.get('senha'), papel, 'Usuário da equipe inicial'
        )


def _tentar_bootstrap_sob_demanda(email):
    # Rede de segurança: se por qualquer motivo o boot não deixou o
    # usuário persistido (o que não deveria acontecer, mas está
    # acontecendo em produção por uma razão ainda não identificada — ver
    # conversa sobre o volume /app/data), tenta sincronizar de novo bem
    # na hora do login, só pra esse e-mail específico, antes de desistir.
    email_norm = (email or '').strip().lower()
    if not email_norm:
        return
    if ADMIN_INICIAL_EMAIL and email_norm == ADMIN_INICIAL_EMAIL.strip().lower():
        _sincronizar_usuario_inicial(ADMIN_INICIAL_NOME, ADMIN_INICIAL_EMAIL, ADMIN_INICIAL_SENHA, 'admin', 'Usuário admin inicial (sob demanda)')
        return
    for membro in _membros_equipe_inicial():
        if (membro.get('email') or '').strip().lower() == email_norm:
            papel = membro.get('papel') if membro.get('papel') in ('admin', 'equipe') else 'equipe'
            _sincronizar_usuario_inicial(
                membro.get('nome'), membro.get('email'), membro.get('senha'), papel, 'Usuário da equipe inicial (sob demanda)'
            )
            return


_criar_admin_inicial_se_necessario()
_criar_equipe_inicial_se_necessario()


# --- LOGIN ------------------------------------------------------------------

PAGINAS_PUBLICAS = {"login.html", "esquecisenha.html", "preencher_contagem.html", "preencher_cotacao.html"}
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
        # Rota de contagem por token: autenticação é o próprio token (opaco,
        # aleatório), não sessão de login — é o link mandado pro funcionário
        # da loja preencher sem precisar de conta no sistema (ver seção 9).
        if (
            caminho in ROTAS_API_PUBLICAS
            or caminho.startswith('/api/contagens/token/')
            or caminho.startswith('/api/cotacoes/convite/')
        ):
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
# - Diário às 3h: reconfere os últimos 3 dias (não só ontem) com calma —
#   pedido que fechou tarde demais pra entrar numa sincronização anterior
#   é pego na próxima. Ver DIAS_RECONFERIDOS_NA_SINCRONIZACAO_DIARIA abaixo.
# - A cada 15 min: sincroniza HOJE (o dia em andamento), pra quem estiver
#   olhando o sistema durante o dia ver os números indo perto do tempo real,
#   em vez de só descobrir o resultado do dia no dia seguinte.
if os.environ.get("SINCRONIZACAO_AUTOMATICA", "false").lower() == "true":
    # Evita agendar duas vezes por causa do reloader do modo debug, e evita
    # agendar em mais de um worker do Gunicorn ao mesmo tempo.
    if (not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true") and _sou_o_unico_worker_a_agendar():
        from apscheduler.schedulers.background import BackgroundScheduler

        # Reconfere os últimos 7 dias (não só ontem) — pedido que ainda estava
        # "em andamento" na hora de uma sincronização anterior (comum em dias
        # de mais movimento, ou reaberto depois de já ter fechado) fica de
        # fora daquela vez, mas é pego numa reconferência seguinte assim que
        # voltar a ficar "concluído". Também cobre uma sincronização que
        # falhou por completo (rede, deploy no meio da madrugada, etc.), que
        # senão deixaria aquele dia incompleto pra sempre. Era 3 dias
        # (2026-08-24); subiu pra 7 (2026-08-31) porque um pedido reaberto
        # pode levar mais que 3 dias pra ser fechado de novo do lado da
        # Cardápio Web — mesmo assim, se nunca voltar a "concluído", só o
        # ajuste manual de canal resolve (ver seção 6.3 da documentação).
        DIAS_RECONFERIDOS_NA_SINCRONIZACAO_DIARIA = 7

        def _rodar_sincronizacao_diaria():
            for dias_atras in range(1, DIAS_RECONFERIDOS_NA_SINCRONIZACAO_DIARIA + 1):
                sincronizar_dia(date.today() - timedelta(days=dias_atras))

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


def _aplicar_ajustes_canal(linhas_canais, linhas_periodo, ajustes):
    """Sobrescreve o valor de um canal, num dia/loja específico, com o ajuste
    manual (ver salvar_ajuste_canal) — usado quando o painel da própria
    Cardápio Web diverge do que a API retorna. A diferença entre o valor
    ajustado e o original também é propagada pro total do dia
    (linhas_periodo), pra tudo continuar consistente: cards, gráfico,
    tabela por canal e Histórico Diário."""
    if not ajustes:
        return linhas_canais, linhas_periodo

    linhas_canais_por_chave = {(l["unidade"], l["dia"], l["canal"]): l for l in linhas_canais}
    deltas_por_dia = {}

    for ajuste in ajustes:
        chave = (ajuste["unidade"], ajuste["dia"], ajuste["canal"])
        original = linhas_canais_por_chave.get(chave)
        faturamento_original = original["faturamento"] if original else 0.0
        pedidos_original = original["quantidade_pedidos"] if original else 0

        chave_dia = (ajuste["unidade"], ajuste["dia"])
        delta_fat, delta_ped = deltas_por_dia.setdefault(chave_dia, [0.0, 0])
        deltas_por_dia[chave_dia][0] = delta_fat + (ajuste["faturamento"] - faturamento_original)
        deltas_por_dia[chave_dia][1] = delta_ped + (ajuste["quantidade_pedidos"] - pedidos_original)

        if original:
            original["faturamento"] = ajuste["faturamento"]
            original["quantidade_pedidos"] = ajuste["quantidade_pedidos"]
        else:
            nova_linha = {
                "unidade": ajuste["unidade"],
                "dia": ajuste["dia"],
                "canal": ajuste["canal"],
                "faturamento": ajuste["faturamento"],
                "quantidade_pedidos": ajuste["quantidade_pedidos"],
            }
            linhas_canais.append(nova_linha)
            linhas_canais_por_chave[chave] = nova_linha

    for linha in linhas_periodo:
        chave_dia = (linha["unidade"], linha["dia"])
        if chave_dia in deltas_por_dia:
            delta_fat, delta_ped = deltas_por_dia[chave_dia]
            linha["faturamento_dia"] += delta_fat
            linha["quantidade_pedidos"] += delta_ped
            linha["ticket_medio"] = (
                linha["faturamento_dia"] / linha["quantidade_pedidos"]
                if linha["quantidade_pedidos"] else 0.0
            )

    return linhas_canais, linhas_periodo


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


def _formatar_canais(canais, canais_ajustados=None):
    canais_ajustados = canais_ajustados or set()
    return [
        {
            "canal": c["canal"],
            "faturamento": _formatar_moeda(c["faturamento"]),
            "faturamentoNumero": round(c["faturamento"], 2),
            "pedidos": _formatar_numero(c["pedidos"]),
            "pedidosNumero": c["pedidos"],
            "ticket": _formatar_moeda(c["ticket_medio"]),
            "percentual": round(c["percentual"], 1),
            "ajustado": c["canal"] in canais_ajustados,
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


@app.route('/favicon.ico')
def favicon():
    # Navegadores pedem esse caminho direto na raiz, além do <link rel="icon">
    # de cada página — sem essa rota, esse pedido implícito cairia no 404.
    return send_from_directory(os.path.join(DIRETORIO_BASE, 'imgs'), 'favicon.ico')


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


# Limite de tentativas de login por e-mail — em memória (por worker do
# Gunicorn, não compartilhado entre eles), suficiente pra travar um script
# tentando milhares de senhas contra uma conta específica, sem precisar de
# Redis ou outra dependência nova pra um sistema desse tamanho.
_TENTATIVAS_LOGIN_FALHAS = {}
JANELA_RATE_LIMIT_LOGIN_SEGUNDOS = 5 * 60
MAX_TENTATIVAS_LOGIN_NA_JANELA = 5


def _login_bloqueado(email):
    agora = time.time()
    tentativas = [t for t in _TENTATIVAS_LOGIN_FALHAS.get(email, []) if agora - t < JANELA_RATE_LIMIT_LOGIN_SEGUNDOS]
    _TENTATIVAS_LOGIN_FALHAS[email] = tentativas
    return len(tentativas) >= MAX_TENTATIVAS_LOGIN_NA_JANELA


def _registrar_falha_login(email):
    _TENTATIVAS_LOGIN_FALHAS.setdefault(email, []).append(time.time())


@app.route('/api/login', methods=['POST'])
def api_login():
    dados = request.get_json(silent=True) or {}
    email = (dados.get('email') or '').strip()
    senha = dados.get('senha') or ''

    if not email or not senha:
        return jsonify({"erro": "Informe e-mail e senha."}), 400

    if _login_bloqueado(email):
        return jsonify({"erro": "Muitas tentativas. Aguarde alguns minutos antes de tentar de novo."}), 429

    usuario = buscar_usuario_por_email(email)
    if not usuario:
        # Rede de segurança: se o e-mail bate com o admin/equipe inicial
        # (ADMIN_INICIAL_* / EQUIPE_INICIAL) mas a conta não foi encontrada
        # por algum motivo, tenta sincronizar de novo na hora antes de
        # desistir — ver _tentar_bootstrap_sob_demanda.
        _tentar_bootstrap_sob_demanda(email)
        usuario = buscar_usuario_por_email(email)

    if not usuario:
        print(f"🔑 Login falhou — nenhum usuário com o e-mail '{email}'")
        _registrar_falha_login(email)
        return jsonify({"erro": "E-mail ou senha incorretos."}), 401
    if not usuario["ativo"]:
        print(f"🔑 Login falhou — usuário '{email}' está inativo")
        _registrar_falha_login(email)
        return jsonify({"erro": "E-mail ou senha incorretos."}), 401
    if not senha_confere(senha, usuario["senha_hash"]):
        print(f"🔑 Login falhou — senha não confere pro usuário '{email}'")
        _registrar_falha_login(email)
        return jsonify({"erro": "E-mail ou senha incorretos."}), 401

    _TENTATIVAS_LOGIN_FALHAS.pop(email, None)
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


# --- COMPARATIVO DE PREÇOS DO CARDÁPIO ---

EXTENSOES_FOTO_CARDAPIO = {".jpg", ".jpeg", ".png", ".webp"}


def _formatar_item_cardapio(linha):
    return {
        "id": linha['id'],
        "produto": linha['produto'],
        "ifood": linha['ifood'],
        "food99": linha['food99'],
        "beefood": linha['beefood'],
        "cardapioWeb": linha['cardapio_web'],
        "fotoUrl": f"/cardapio-fotos/{linha['foto_arquivo']}" if linha['foto_arquivo'] else None,
    }


@app.route('/api/precos-cardapio', methods=['GET'])
def api_precos_cardapio():
    lojas = {}
    for linha in listar_precos_cardapio():
        loja = lojas.setdefault(linha['loja'], {})
        categoria = loja.setdefault(linha['categoria'], [])
        categoria.append(_formatar_item_cardapio(linha))

    resposta = []
    for nome_loja, categorias in lojas.items():
        resposta.append({
            "loja": nome_loja,
            "categorias": [{"nome": nome, "produtos": produtos} for nome, produtos in categorias.items()],
        })
    return jsonify({"lojas": resposta})


@app.route('/api/precos-cardapio/importar', methods=['POST'])
def api_importar_precos_cardapio():
    # Admin-only — reimporta a partir de uma planilha nova, direto pelo
    # navegador (sem precisar de acesso ao servidor). Mesma lógica do script
    # importar_precos_cardapio.py. Não apaga foto nem preserva id — produto
    # que já existia (mesma loja+nome) só atualiza preço/categoria/ordem.
    erro = _exigir_admin()
    if erro:
        return erro

    arquivo = request.files.get('planilha')
    if not arquivo or not arquivo.filename:
        return jsonify({"erro": "Selecione um arquivo .xlsx."}), 400
    if not arquivo.filename.lower().endswith('.xlsx'):
        return jsonify({"erro": "O arquivo precisa ser .xlsx."}), 400

    try:
        linhas = ler_precos_da_planilha(arquivo.stream)
    except Exception as erro_leitura:
        return jsonify({"erro": f"Não foi possível ler a planilha: {erro_leitura}"}), 400

    sincronizar_precos_cardapio(linhas)
    return jsonify({"sucesso": True, "totalProdutos": len(linhas)})


CAMPOS_PRECO_CARDAPIO_PERMITIDOS = {'ifood', 'food99', 'beefood', 'cardapioWeb'}
CAMPO_PRECO_CARDAPIO_PARA_COLUNA = {'ifood': 'ifood', 'food99': 'food99', 'beefood': 'beefood', 'cardapioWeb': 'cardapio_web'}


@app.route('/api/precos-cardapio/<int:item_id>', methods=['PUT'])
def api_atualizar_preco_cardapio(item_id):
    # Admin-only — edição manual de um item específico (preço em algum
    # canal). Fica só até a próxima planilha reimportada trazer um valor
    # novo pra esse mesmo produto.
    erro = _exigir_admin()
    if erro:
        return erro

    item = buscar_preco_cardapio_por_id(item_id)
    if not item:
        return jsonify({"erro": "Item não encontrado."}), 404

    dados = request.get_json(silent=True) or {}
    campos = {}
    for chave in CAMPOS_PRECO_CARDAPIO_PERMITIDOS:
        if chave not in dados:
            continue
        valor = dados[chave]
        if valor is not None:
            try:
                valor = float(valor)
            except (TypeError, ValueError):
                return jsonify({"erro": f"Valor inválido pra {chave}."}), 400
        campos[CAMPO_PRECO_CARDAPIO_PARA_COLUNA[chave]] = valor

    if not campos:
        return jsonify({"erro": "Nada para atualizar."}), 400

    atualizar_preco_cardapio(item_id, campos)
    return jsonify(_formatar_item_cardapio(buscar_preco_cardapio_por_id(item_id)))


@app.route('/api/precos-cardapio/<int:item_id>/foto', methods=['POST'])
def api_upload_foto_cardapio(item_id):
    # Admin-only — sobe uma foto pro produto, guardada no mesmo volume
    # persistente do banco (ver PASTA_FOTOS_CARDAPIO em armazenamento.py).
    erro = _exigir_admin()
    if erro:
        return erro

    item = buscar_preco_cardapio_por_id(item_id)
    if not item:
        return jsonify({"erro": "Item não encontrado."}), 404

    arquivo = request.files.get('foto')
    if not arquivo or not arquivo.filename:
        return jsonify({"erro": "Selecione uma imagem."}), 400
    _, extensao = os.path.splitext(arquivo.filename)
    if extensao.lower() not in EXTENSOES_FOTO_CARDAPIO:
        return jsonify({"erro": "Formato inválido. Use JPG, PNG ou WEBP."}), 400

    nome_arquivo = f"{item_id}_{uuid.uuid4().hex}{extensao.lower()}"
    arquivo.save(os.path.join(PASTA_FOTOS_CARDAPIO, nome_arquivo))

    foto_antiga = item.get('foto_arquivo')
    atualizar_preco_cardapio(item_id, {'foto_arquivo': nome_arquivo})
    if foto_antiga:
        try:
            os.remove(os.path.join(PASTA_FOTOS_CARDAPIO, foto_antiga))
        except OSError:
            pass

    return jsonify(_formatar_item_cardapio(buscar_preco_cardapio_por_id(item_id)))


@app.route('/cardapio-fotos/<path:nome_arquivo>')
def arquivo_foto_cardapio(nome_arquivo):
    if '..' in nome_arquivo or nome_arquivo.startswith('/'):
        abort(404)
    _, extensao = os.path.splitext(nome_arquivo)
    if extensao.lower() not in EXTENSOES_FOTO_CARDAPIO:
        abort(404)
    return send_from_directory(PASTA_FOTOS_CARDAPIO, nome_arquivo)


# --- ESTOQUE (insumos nativos, por loja) ------------------------------------
# Catálogo único de insumo pra rede toda (nome/categoria/unidade), com
# quantidade atual e mínimo separados por loja — cada unidade consome num
# ritmo diferente. Ver seção 6.4 da documentação.

def _status_estoque(quantidade_atual, estoque_minimo):
    if quantidade_atual <= 0:
        return 'critico'
    if estoque_minimo <= 0:
        return 'ok'
    if quantidade_atual < estoque_minimo:
        return 'critico'
    if quantidade_atual < estoque_minimo * 1.3:
        return 'baixo'
    return 'ok'


def _formatar_insumos(linhas):
    mapa_fornecedores = mapa_insumo_fornecedores()
    por_insumo = {}
    for linha in linhas:
        insumo = por_insumo.setdefault(linha['insumo_id'], {
            "id": linha['insumo_id'],
            "nome": linha['nome'],
            "categoria": linha['categoria'],
            "unidadeMedida": linha['unidade_medida'],
            "favorito": bool(linha['favorito']),
            "marcaHomologada": linha['marca_homologada'],
            "fornecedorIds": mapa_fornecedores.get(linha['insumo_id'], []),
            "porLoja": {},
        })
        insumo["porLoja"][linha['loja']] = {
            "quantidadeAtual": linha['quantidade_atual'],
            "estoqueMinimo": linha['estoque_minimo'],
            "status": _status_estoque(linha['quantidade_atual'], linha['estoque_minimo']),
            "atualizadoEm": linha['atualizado_em'],
        }
    return list(por_insumo.values())


@app.route('/api/insumos', methods=['GET'])
def api_listar_insumos():
    return jsonify({"insumos": _formatar_insumos(listar_insumos())})


@app.route('/api/insumos', methods=['POST'])
def api_criar_insumo():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    nome = (dados.get('nome') or '').strip()
    categoria = (dados.get('categoria') or 'Geral').strip() or 'Geral'
    unidade_medida = (dados.get('unidadeMedida') or 'un').strip() or 'un'
    if not nome:
        return jsonify({"erro": "Informe o nome do insumo."}), 400

    insumo_id = criar_insumo(nome, categoria, unidade_medida, list(LOJAS.keys()))

    marca_homologada = dados.get('marcaHomologada')
    if marca_homologada is not None:
        atualizar_insumo(insumo_id, {"marca_homologada": marca_homologada.strip()})
    fornecedor_ids = dados.get('fornecedorIds')
    if fornecedor_ids is not None:
        definir_fornecedores_insumo(insumo_id, [int(f) for f in fornecedor_ids])

    return jsonify({"id": insumo_id})


@app.route('/api/insumos/lote', methods=['POST'])
def api_criar_insumos_em_lote():
    """Cadastra vários insumos novos de uma vez, já restritos às lojas
    marcadas (ex: catálogo da VMarket de uma loja que ainda não tinha
    nenhum insumo cadastrado no AdmFood)."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    nomes = [str(n).strip() for n in (dados.get('nomes') or []) if str(n).strip()]
    if not nomes:
        return jsonify({"erro": "Informe ao menos um nome de insumo."}), 400

    lojas = dados.get('lojas') or []
    if not lojas or any(l not in LOJAS for l in lojas):
        return jsonify({"erro": "Selecione ao menos uma loja válida."}), 400

    categoria = (dados.get('categoria') or 'Geral').strip() or 'Geral'
    unidade_medida = (dados.get('unidadeMedida') or 'un').strip() or 'un'

    resultado = criar_insumos_em_lote(nomes, categoria, unidade_medida, lojas)
    return jsonify(resultado)


@app.route('/api/insumos/por-loja', methods=['GET'])
def api_listar_insumos_por_loja():
    """Todo insumo com uma marcação se a loja pedida usa ele ou não —
    alimenta a tela "Insumos da loja" (Estoque) e decide quem entra no
    link de Requisição de cada loja."""
    loja = request.args.get('loja')
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    return jsonify({"insumos": listar_insumos_por_loja(loja)})


@app.route('/api/insumos/por-loja', methods=['POST'])
def api_salvar_insumos_da_loja():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    loja = dados.get('loja')
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400

    try:
        insumo_ids = [int(i) for i in (dados.get('insumoIds') or [])]
    except (TypeError, ValueError):
        return jsonify({"erro": "Lista de insumos inválida."}), 400

    salvar_insumos_da_loja(loja, insumo_ids)
    return jsonify({"ok": True, "total": len(insumo_ids)})


@app.route('/api/insumos/<int:insumo_id>', methods=['PUT'])
def api_atualizar_insumo(insumo_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    campos = {}
    if 'nome' in dados:
        nome = (dados['nome'] or '').strip()
        if not nome:
            return jsonify({"erro": "Nome não pode ficar vazio."}), 400
        campos['nome'] = nome
    if 'categoria' in dados:
        campos['categoria'] = (dados['categoria'] or 'Geral').strip() or 'Geral'
    if 'unidadeMedida' in dados:
        campos['unidade_medida'] = (dados['unidadeMedida'] or 'un').strip() or 'un'
    if 'favorito' in dados:
        campos['favorito'] = 1 if dados['favorito'] else 0
    if 'marcaHomologada' in dados:
        campos['marca_homologada'] = (dados['marcaHomologada'] or '').strip()

    atualizar_insumo(insumo_id, campos)

    if 'fornecedorIds' in dados:
        try:
            fornecedor_ids = [int(f) for f in (dados['fornecedorIds'] or [])]
        except (TypeError, ValueError):
            return jsonify({"erro": "Lista de fornecedores inválida."}), 400
        definir_fornecedores_insumo(insumo_id, fornecedor_ids)

    return jsonify({"ok": True})


@app.route('/api/insumos/<int:insumo_id>', methods=['DELETE'])
def api_excluir_insumo(insumo_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    excluir_insumo(insumo_id)
    return jsonify({"ok": True})


@app.route('/api/insumos/<int:insumo_id>/estoque/<loja>', methods=['PUT'])
def api_atualizar_estoque_loja(insumo_id, loja):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400

    dados = request.get_json(silent=True) or {}
    campos = {}
    try:
        if 'quantidadeAtual' in dados:
            campos['quantidade_atual'] = float(dados['quantidadeAtual'])
        if 'estoqueMinimo' in dados:
            campos['estoque_minimo'] = float(dados['estoqueMinimo'])
    except (TypeError, ValueError):
        return jsonify({"erro": "Valores inválidos."}), 400
    if any(v < 0 for v in campos.values()):
        return jsonify({"erro": "Valores não podem ser negativos."}), 400

    atualizar_estoque_loja(insumo_id, loja, campos)
    return jsonify({"ok": True})


@app.route('/api/insumos/<int:insumo_id>/entrada', methods=['POST'])
def api_entrada_insumo(insumo_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    distribuicao_bruta = dados.get('distribuicao') or {}
    distribuicao = {}
    for loja, quantidade in distribuicao_bruta.items():
        if loja not in LOJAS:
            return jsonify({"erro": f"Loja inválida: {loja}"}), 400
        try:
            valor = float(quantidade)
        except (TypeError, ValueError):
            return jsonify({"erro": "Quantidade inválida."}), 400
        if valor < 0:
            return jsonify({"erro": "Quantidade não pode ser negativa."}), 400
        if valor > 0:
            distribuicao[loja] = valor

    if not distribuicao:
        return jsonify({"erro": "Informe ao menos uma loja com quantidade recebida."}), 400

    validade = (dados.get('validade') or '').strip() or None
    if validade:
        try:
            date.fromisoformat(validade)
        except ValueError:
            return jsonify({"erro": "Validade inválida."}), 400

    distribuir_entrada_insumo(insumo_id, distribuicao, validade)
    return jsonify({"ok": True})


@app.route('/api/insumos/consumo-medio', methods=['GET'])
def api_consumo_medio_insumo():
    """Consumo médio diário de cada insumo no período, estimado a partir da
    Ficha Técnica × vendas reais (ver consumo_medio_insumo em
    backend/armazenamento.py) — só cobre insumo com quantidade cadastrada na
    receita e prato já casado com item_cardapio; o resto ainda não entra na
    conta (fica mais completo conforme a Ficha Técnica for preenchida)."""
    inicio_str = request.args.get('inicio')
    fim_str = request.args.get('fim')
    unidade = request.args.get('unidade') or None
    if unidade and unidade not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400

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

    consumo = consumo_medio_insumo(inicio.isoformat(), fim.isoformat(), unidade)
    return jsonify({"consumo": consumo})


@app.route('/api/insumos/lotes-vencendo', methods=['GET'])
def api_lotes_vencendo():
    """Lotes de validade vencendo (ou já vencidos) nos próximos `dias` dias,
    ainda não resolvidos — ver listar_lotes_vencendo em
    backend/armazenamento.py e seção 6.4 da documentação."""
    try:
        dias = int(request.args.get('dias', 7))
    except (TypeError, ValueError):
        return jsonify({"erro": "Parâmetro 'dias' inválido."}), 400

    lotes = listar_lotes_vencendo(dias)
    return jsonify({"lotes": [
        {
            "id": lote["id"],
            "insumoId": lote["insumo_id"],
            "insumoNome": lote["nome"],
            "categoria": lote["categoria"],
            "unidadeMedida": lote["unidade_medida"],
            "loja": lote["loja"],
            "quantidade": lote["quantidade"],
            "validade": lote["validade"],
        }
        for lote in lotes
    ]})


@app.route('/api/lotes/<int:lote_id>/resolver', methods=['PUT'])
def api_resolver_lote(lote_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    marcar_lote_resolvido(lote_id)
    return jsonify({"ok": True})


# --- FICHA TÉCNICA (insumos que cada item do cardápio consome) -------------
# Item aqui é o PRATO (ex: "BIG ART"), independente de loja/canal — é uma
# receita, não muda por onde é vendido. Ver seção 6.5 da documentação.

@app.route('/api/ficha-tecnica', methods=['GET'])
def api_listar_ficha_tecnica():
    itens = listar_itens_cardapio()
    links = buscar_ficha_tecnica_completa()

    links_por_item = {}
    for link in links:
        links_por_item.setdefault(link['item_id'], []).append({
            "insumoId": link['insumo_id'],
            "nome": link['insumo_nome'],
            "unidadeMedida": link['unidade_medida'],
            "quantidade": link['quantidade'],
        })

    itens_formatados = [
        {
            "id": item['id'],
            "nome": item['nome'],
            "categoria": item['categoria'],
            "insumos": links_por_item.get(item['id'], []),
        }
        for item in itens
    ]

    insumos_disponiveis = [
        {"id": i['id'], "nome": i['nome'], "unidadeMedida": i['unidade_medida']}
        for i in _insumos_unicos(listar_insumos())
    ]

    return jsonify({"itens": itens_formatados, "insumosDisponiveis": insumos_disponiveis})


def _insumos_unicos(linhas_estoque):
    vistos = {}
    for linha in linhas_estoque:
        vistos.setdefault(linha['insumo_id'], {
            "id": linha['insumo_id'],
            "nome": linha['nome'],
            "unidade_medida": linha['unidade_medida'],
        })
    return sorted(vistos.values(), key=lambda i: i['nome'])


@app.route('/api/itens-cardapio', methods=['POST'])
def api_criar_item_cardapio():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    nome = (dados.get('nome') or '').strip()
    categoria = (dados.get('categoria') or 'Geral').strip() or 'Geral'
    if not nome:
        return jsonify({"erro": "Informe o nome do item."}), 400

    item_id = criar_item_cardapio(nome, categoria)
    return jsonify({"id": item_id})


@app.route('/api/itens-cardapio/<int:item_id>', methods=['DELETE'])
def api_excluir_item_cardapio(item_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    excluir_item_cardapio(item_id)
    return jsonify({"ok": True})


@app.route('/api/itens-cardapio/<int:item_id>/ficha-tecnica', methods=['PUT'])
def api_definir_ficha_tecnica(item_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    links_brutos = dados.get('insumos') or []
    links = []
    for link in links_brutos:
        try:
            insumo_id = int(link['insumoId'])
        except (KeyError, TypeError, ValueError):
            return jsonify({"erro": "Insumo inválido na lista."}), 400
        quantidade = link.get('quantidade')
        if quantidade not in (None, ''):
            try:
                quantidade = float(quantidade)
            except (TypeError, ValueError):
                return jsonify({"erro": "Quantidade inválida."}), 400
        else:
            quantidade = None
        links.append({"insumoId": insumo_id, "quantidade": quantidade})

    definir_ficha_tecnica(item_id, links)
    return jsonify({"ok": True})


# --- FORNECEDORES (diretório da rede, semente do módulo de Compras) --------
# Cadastro simples pra começar — sem fluxo de cotação ainda (ver seção 9 da
# documentação). De rede toda, não por loja: um fornecedor atende a rede
# inteira. "ativo" em vez de excluir de verdade, pra não quebrar cotação/
# pedido de compra que vierem a referenciar fornecedor_id nas próximas fases.

def _formatar_fornecedor(linha):
    return {
        "id": linha["id"],
        "nome": linha["nome"],
        "cnpj": linha["cnpj"],
        "categoria": linha["categoria"],
        "contatoNome": linha["contato_nome"],
        "contatoTelefone": linha["contato_telefone"],
        "contatoEmail": linha["contato_email"],
        "prazoPagamento": linha["prazo_pagamento"],
        "diasEntrega": linha["dias_entrega"],
        "pedidoMinimo": linha["pedido_minimo"],
        "observacoes": linha["observacoes"],
        "ativo": bool(linha["ativo"]),
    }


def _campos_fornecedor_do_corpo(dados, exigir_nome=True):
    campos = {}
    if 'nome' in dados or exigir_nome:
        nome = (dados.get('nome') or '').strip()
        if not nome:
            return None, jsonify({"erro": "Informe o nome do fornecedor."}), 400
        campos['nome'] = nome
    if 'cnpj' in dados:
        campos['cnpj'] = (dados['cnpj'] or '').strip()
    if 'categoria' in dados:
        campos['categoria'] = (dados['categoria'] or 'Geral').strip() or 'Geral'
    if 'contatoNome' in dados:
        campos['contato_nome'] = (dados['contatoNome'] or '').strip()
    if 'contatoTelefone' in dados:
        campos['contato_telefone'] = (dados['contatoTelefone'] or '').strip()
    if 'contatoEmail' in dados:
        campos['contato_email'] = (dados['contatoEmail'] or '').strip()
    if 'prazoPagamento' in dados:
        campos['prazo_pagamento'] = (dados['prazoPagamento'] or '').strip()
    if 'diasEntrega' in dados:
        campos['dias_entrega'] = (dados['diasEntrega'] or '').strip()
    if 'observacoes' in dados:
        campos['observacoes'] = (dados['observacoes'] or '').strip()
    if 'pedidoMinimo' in dados:
        try:
            campos['pedido_minimo'] = float(dados['pedidoMinimo'] or 0)
        except (TypeError, ValueError):
            return None, jsonify({"erro": "Pedido mínimo inválido."}), 400
        if campos['pedido_minimo'] < 0:
            return None, jsonify({"erro": "Pedido mínimo não pode ser negativo."}), 400
    if 'ativo' in dados:
        campos['ativo'] = 1 if dados['ativo'] else 0
    return campos, None, None


@app.route('/api/fornecedores', methods=['GET'])
def api_listar_fornecedores():
    return jsonify({"fornecedores": [_formatar_fornecedor(f) for f in listar_fornecedores()]})


@app.route('/api/fornecedores', methods=['POST'])
def api_criar_fornecedor():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    campos, erro_resposta, status = _campos_fornecedor_do_corpo(dados)
    if erro_resposta:
        return erro_resposta, status

    fornecedor_id = criar_fornecedor(campos)
    return jsonify({"id": fornecedor_id})


@app.route('/api/fornecedores/<int:fornecedor_id>', methods=['PUT'])
def api_atualizar_fornecedor(fornecedor_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    campos, erro_resposta, status = _campos_fornecedor_do_corpo(dados, exigir_nome=False)
    if erro_resposta:
        return erro_resposta, status

    atualizar_fornecedor(fornecedor_id, campos)
    return jsonify({"ok": True})


# --- COTAÇÃO (RFQ manual, fase 2 do módulo de Compras) ----------------------
# Sem coleta automática de preço (WhatsApp) ainda — aqui só se registra o
# preço que cada fornecedor já passou por fora, pra comparar lado a lado e
# marcar o vencedor por insumo. Ver seção 6.7/9 da documentação.

def _formatar_cotacao(linha):
    return {
        "id": linha["id"],
        "titulo": linha["titulo"],
        "status": linha["status"],
        "criadoEm": linha["criado_em"],
        "totalInsumos": linha["total_insumos"],
        "totalFornecedores": linha["total_fornecedores"],
    }


def _agrupar_precos_por_insumo(precos):
    grupos = {}
    for preco in precos:
        grupo = grupos.setdefault(preco["insumo_id"], {
            "insumoId": preco["insumo_id"],
            "insumoNome": preco["insumo_nome"],
            "categoria": preco["insumo_categoria"],
            "unidadeMedida": preco["unidade_medida"],
            "precos": [],
        })
        grupo["precos"].append({
            "id": preco["id"],
            "fornecedorId": preco["fornecedor_id"],
            "fornecedorNome": preco["fornecedor_nome"],
            "preco": preco["preco"],
            "selecionado": bool(preco["selecionado"]),
        })
    return sorted(grupos.values(), key=lambda g: g["insumoNome"])


@app.route('/api/cotacoes', methods=['GET'])
def api_listar_cotacoes():
    return jsonify({"cotacoes": [_formatar_cotacao(c) for c in listar_cotacoes()]})


@app.route('/api/cotacoes/historico', methods=['GET'])
def api_historico_compras():
    """Aba "Compras" — cotações já fechadas com o preço vencedor de cada
    insumo, separado do rastreio de entrega dos Pedidos."""
    return jsonify({"historico": listar_historico_compras()})


@app.route('/api/cotacoes', methods=['POST'])
def api_criar_cotacao():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    titulo = (dados.get('titulo') or '').strip()
    if not titulo:
        return jsonify({"erro": "Informe um título pra cotação."}), 400

    cotacao_id = criar_cotacao(titulo)
    return jsonify({"id": cotacao_id})


@app.route('/api/cotacoes/<int:cotacao_id>', methods=['GET'])
def api_detalhe_cotacao(cotacao_id):
    cotacao = buscar_cotacao(cotacao_id)
    if not cotacao:
        return jsonify({"erro": "Cotação não encontrada."}), 404

    grupos = _agrupar_precos_por_insumo(listar_precos_cotacao(cotacao_id))
    return jsonify({
        "cotacao": {
            "id": cotacao["id"],
            "titulo": cotacao["titulo"],
            "status": cotacao["status"],
            "criadoEm": cotacao["criado_em"],
        },
        "grupos": grupos,
        "itens": listar_itens_cotacao(cotacao_id),
    })


@app.route('/api/cotacoes/<int:cotacao_id>', methods=['PUT'])
def api_atualizar_cotacao(cotacao_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    campos = {}
    if 'titulo' in dados:
        titulo = (dados['titulo'] or '').strip()
        if not titulo:
            return jsonify({"erro": "Título não pode ficar vazio."}), 400
        campos['titulo'] = titulo
    if 'status' in dados:
        if dados['status'] not in ('aberta', 'fechada'):
            return jsonify({"erro": "Status inválido."}), 400
        campos['status'] = dados['status']

    atualizar_cotacao(cotacao_id, campos)
    return jsonify({"ok": True})


@app.route('/api/cotacoes/<int:cotacao_id>', methods=['DELETE'])
def api_excluir_cotacao(cotacao_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    excluir_cotacao(cotacao_id)
    return jsonify({"ok": True})


@app.route('/api/cotacoes/<int:cotacao_id>/precos', methods=['POST'])
def api_adicionar_preco_cotacao(cotacao_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    try:
        insumo_id = int(dados['insumoId'])
        fornecedor_id = int(dados['fornecedorId'])
        preco = float(dados['preco'])
    except (KeyError, TypeError, ValueError):
        return jsonify({"erro": "Insumo, fornecedor e preço são obrigatórios."}), 400
    if preco <= 0:
        return jsonify({"erro": "Preço precisa ser maior que zero."}), 400

    adicionar_preco_cotacao(cotacao_id, insumo_id, fornecedor_id, preco)
    return jsonify({"ok": True})


@app.route('/api/cotacoes/<int:cotacao_id>/precos/<int:preco_id>', methods=['DELETE'])
def api_excluir_preco_cotacao(cotacao_id, preco_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    excluir_preco_cotacao(preco_id)
    return jsonify({"ok": True})


@app.route('/api/cotacoes/<int:cotacao_id>/precos/<int:preco_id>/selecionar', methods=['PUT'])
def api_selecionar_preco_cotacao(cotacao_id, preco_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    selecionar_preco_cotacao(preco_id)
    return jsonify({"ok": True})


def _formatar_convite(convite):
    return {
        "id": convite["id"],
        "fornecedorId": convite["fornecedor_id"],
        "fornecedorNome": convite["fornecedor_nome"],
        "prazoValidade": convite["prazo_validade"],
        "status": convite["status"],
        "criadoEm": convite["criado_em"],
        "respondidaEm": convite["respondida_em"],
        "token": convite["token"],
    }


@app.route('/api/cotacoes/<int:cotacao_id>/convites', methods=['GET'])
def api_listar_convites_cotacao(cotacao_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    return jsonify({"convites": [_formatar_convite(c) for c in listar_convites_cotacao(cotacao_id)]})


@app.route('/api/cotacoes/<int:cotacao_id>/convites', methods=['POST'])
def api_criar_convites_cotacao(cotacao_id):
    """Manda o link de preenchimento pra todo fornecedor ativo, pros
    insumos dessa cotação que ainda não têm fornecedor vinculado (ver
    `criar_convites_cotacao` em armazenamento.py pra regra completa)."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    cotacao = buscar_cotacao(cotacao_id)
    if not cotacao:
        return jsonify({"erro": "Cotação não encontrada."}), 404

    dados = request.get_json(silent=True) or {}
    prazo_validade = (dados.get('prazoValidade') or '').strip()
    if not prazo_validade:
        return jsonify({"erro": "Informe o prazo de validade do convite."}), 400

    resultado = criar_convites_cotacao(cotacao_id, prazo_validade)
    if resultado["insumosSemFornecedor"] == 0:
        return jsonify({"erro": "Todos os insumos dessa cotação já têm fornecedor vinculado — não há nada pra cotar em aberto."}), 400
    return jsonify({"ok": True, **resultado})


@app.route('/api/cotacoes/convite/<token>', methods=['GET'])
def api_buscar_convite_por_token(token):
    # Pública (sem login) — ver exceção em _exigir_login.
    convite = buscar_convite_por_token(token)
    if not convite:
        return jsonify({"erro": "Link inválido."}), 404

    resposta = _formatar_convite(convite)
    resposta.pop('token', None)
    resposta['cotacaoTitulo'] = convite['cotacao_titulo']
    resposta['itens'] = [
        {
            "insumoId": item["insumo_id"],
            "nome": item["nome"],
            "categoria": item["categoria"],
            "unidadeMedida": item["unidade_medida"],
            "marcaHomologada": item["marca_homologada"],
            "quantidade": item["quantidade_total"],
            "precoPreenchido": item["preco_preenchido"],
        }
        for item in convite["itens"]
    ]
    resposta['expirado'] = convite['status'] == 'aberta' and _prazo_vencido(convite['prazo_validade'])
    return jsonify(resposta)


@app.route('/api/cotacoes/convite/<token>/responder', methods=['POST'])
def api_responder_convite_cotacao(token):
    # Pública (sem login) — mesma exceção acima.
    convite = buscar_convite_por_token(token)
    if not convite:
        return jsonify({"erro": "Link inválido."}), 404
    if convite['status'] != 'aberta':
        return jsonify({"erro": "Essa cotação já foi respondida."}), 400
    if _prazo_vencido(convite['prazo_validade']):
        return jsonify({"erro": "O prazo pra responder essa cotação já venceu."}), 400

    dados = request.get_json(silent=True) or {}
    precos_brutos = dados.get('precos') or {}
    precos = {}
    try:
        for insumo_id, preco in precos_brutos.items():
            if preco is None or preco == '':
                continue
            preco_float = float(preco)
            if preco_float <= 0:
                return jsonify({"erro": "Preço precisa ser maior que zero."}), 400
            precos[int(insumo_id)] = preco_float
    except (TypeError, ValueError):
        return jsonify({"erro": "Preço inválido."}), 400

    responder_convite_cotacao(token, precos)
    return jsonify({"ok": True})


@app.route('/api/cotacoes/<int:cotacao_id>/gerar-pedidos', methods=['POST'])
def api_gerar_pedidos_cotacao(cotacao_id):
    """Fecha a cotação em pedido(s) de compra — etapa manual e separada de
    marcar o vencedor de cada insumo (pergunta 23 do roteiro de compras:
    ela não quer isso automático)."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    cotacao = buscar_cotacao(cotacao_id)
    if not cotacao:
        return jsonify({"erro": "Cotação não encontrada."}), 404

    resultado = gerar_pedidos_de_cotacao(cotacao_id)
    if not resultado["pedidosCriados"]:
        return jsonify({"erro": "Nenhum insumo com vencedor escolhido e quantidade pra virar pedido."}), 400
    return jsonify({"ok": True, **resultado})


def _formatar_pedido_resumo(pedido):
    return {
        "id": pedido["id"],
        "cotacaoId": pedido["cotacao_id"],
        "cotacaoTitulo": pedido["cotacao_titulo"],
        "fornecedorId": pedido["fornecedor_id"],
        "fornecedorNome": pedido["fornecedor_nome"],
        "loja": pedido["loja"],
        "status": pedido["status"],
        "criadoEm": pedido["criado_em"],
        "atualizadoEm": pedido["atualizado_em"],
        "totalItens": pedido["total_itens"],
        "valorTotal": round(pedido["valor_total"], 2),
        "pedidoMinimo": pedido["pedido_minimo"],
        "abaixoDoMinimo": pedido["pedido_minimo"] > 0 and pedido["valor_total"] < pedido["pedido_minimo"],
    }


@app.route('/api/pedidos', methods=['GET'])
def api_listar_pedidos():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    return jsonify({"pedidos": [_formatar_pedido_resumo(p) for p in listar_pedidos()], "estagios": ESTAGIOS_PEDIDO})


@app.route('/api/pedidos/<int:pedido_id>', methods=['GET'])
def api_buscar_pedido(pedido_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    pedido = buscar_pedido(pedido_id)
    if not pedido:
        return jsonify({"erro": "Pedido não encontrado."}), 404

    resposta = _formatar_pedido_resumo(pedido)
    resposta["itens"] = [
        {
            "insumoId": item["insumo_id"],
            "nome": item["nome"],
            "unidadeMedida": item["unidade_medida"],
            "quantidade": item["quantidade"],
            "precoUnitario": item["preco_unitario"],
            "subtotal": round(item["quantidade"] * item["preco_unitario"], 2),
        }
        for item in pedido["itens"]
    ]
    resposta["estagios"] = ESTAGIOS_PEDIDO
    return jsonify(resposta)


@app.route('/api/pedidos/<int:pedido_id>/avancar', methods=['POST'])
def api_avancar_pedido(pedido_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    novo_status = avancar_status_pedido(pedido_id)
    if novo_status is None:
        return jsonify({"erro": "Pedido não encontrado."}), 404
    return jsonify({"ok": True, "status": novo_status})


@app.route('/api/pedidos/<int:pedido_id>/voltar', methods=['POST'])
def api_voltar_pedido(pedido_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    novo_status = voltar_status_pedido(pedido_id)
    if novo_status is None:
        return jsonify({"erro": "Pedido não encontrado."}), 404
    return jsonify({"ok": True, "status": novo_status})


@app.route('/api/pedidos/<int:pedido_id>', methods=['DELETE'])
def api_excluir_pedido(pedido_id):
    """Cancela um pedido gerado por engano — libera o insumo pra entrar
    de novo na próxima "Gerar pedidos" dessa cotação."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    pedido = buscar_pedido(pedido_id)
    if not pedido:
        return jsonify({"erro": "Pedido não encontrado."}), 404
    excluir_pedido(pedido_id)
    return jsonify({"ok": True})


# --- RECEBIMENTOS (confirmar que um pedido chegou — qualquer pessoa logada,
# não só admin: pedido do Guilherme pra ser a primeira função de verdade que
# a equipe usa, além do admin) ---------------------------------------------

def _formatar_recebimento_resumo(pedido):
    return {
        "id": pedido["id"],
        "fornecedorId": pedido["fornecedor_id"],
        "fornecedorNome": pedido["fornecedor_nome"],
        "loja": pedido["loja"],
        "status": pedido["status"],
        "criadoEm": pedido["criado_em"],
        "totalItens": pedido["total_itens"],
        "valorTotal": round(pedido["valor_total"], 2),
        "itensNomes": pedido["itens_nomes"] or "",
    }


@app.route('/api/recebimentos', methods=['GET'])
def api_listar_recebimentos():
    return jsonify({"pedidos": [_formatar_recebimento_resumo(p) for p in listar_pedidos_pendentes_recebimento()]})


@app.route('/api/recebimentos/<int:pedido_id>', methods=['GET'])
def api_buscar_recebimento(pedido_id):
    pedido = buscar_pedido(pedido_id)
    if not pedido:
        return jsonify({"erro": "Pedido não encontrado."}), 404

    resposta = _formatar_pedido_resumo(pedido)
    resposta["itens"] = [
        {
            "insumoId": item["insumo_id"],
            "nome": item["nome"],
            "unidadeMedida": item["unidade_medida"],
            "quantidade": item["quantidade"],
            "precoUnitario": item["preco_unitario"],
        }
        for item in pedido["itens"]
    ]
    return jsonify(resposta)


@app.route('/api/recebimentos/<int:pedido_id>/confirmar', methods=['POST'])
def api_confirmar_recebimento(pedido_id):
    usuario = _usuario_logado()
    dados = request.get_json(silent=True) or {}
    recebido_por = (dados.get('recebidoPor') or (usuario['nome'] if usuario else '')).strip()
    if not recebido_por:
        return jsonify({"erro": "Informe o nome de quem recebeu."}), 400

    try:
        valor_nf = float(dados.get('valorNf'))
    except (TypeError, ValueError):
        return jsonify({"erro": "Informe o valor da Nota Fiscal."}), 400

    itens_brutos = dados.get('itens') or []
    if not itens_brutos:
        return jsonify({"erro": "Informe ao menos um item recebido."}), 400
    try:
        itens = [
            {
                "insumoId": int(item['insumoId']),
                "quantidade": float(item['quantidade']),
                "precoUnitario": float(item['precoUnitario']),
            }
            for item in itens_brutos
        ]
    except (KeyError, TypeError, ValueError):
        return jsonify({"erro": "Item inválido na lista."}), 400

    pedido = buscar_pedido(pedido_id)
    if not pedido:
        return jsonify({"erro": "Pedido não encontrado."}), 404
    if pedido['status'] == 'recebido':
        return jsonify({"erro": "Esse pedido já foi confirmado como recebido."}), 400

    resultado = confirmar_recebimento_pedido(pedido_id, recebido_por, valor_nf, itens)
    return jsonify({"ok": True, **resultado})


@app.route('/api/admin/limpar-requisicoes-cotacoes', methods=['POST'])
def api_limpar_requisicoes_cotacoes():
    """Apaga todo o histórico de requisições/contagens, cotações e pedidos
    de compra — ação de manutenção sem volta (ver
    `limpar_requisicoes_e_cotacoes` em armazenamento.py)."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    limpar_requisicoes_e_cotacoes()
    return jsonify({"ok": True})


def _prazo_vencido(prazo_iso):
    # .replace(tzinfo=None) porque o front pode mandar um ISO com "Z"
    # (timezone-aware) — datetime.now() é naive, comparar os dois direto
    # derruba com TypeError.
    prazo = datetime.fromisoformat(prazo_iso).replace(tzinfo=None)
    return prazo < datetime.now()


def _formatar_contagem(contagem):
    total = contagem.get('total_itens') or 0
    preenchidos = contagem.get('itens_preenchidos') or 0
    return {
        "id": contagem['id'],
        "loja": contagem['loja'],
        "descricao": contagem['descricao'],
        "prazoValidade": contagem['prazo_validade'],
        "status": contagem['status'],
        "criadoEm": contagem['criado_em'],
        "respondidaEm": contagem['respondida_em'],
        "aprovadaEm": contagem['aprovada_em'],
        "totalItens": total,
        "itensPreenchidos": preenchidos,
        "token": contagem.get('token'),
    }


@app.route('/api/contagens', methods=['GET'])
def api_listar_contagens():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    return jsonify({"contagens": [_formatar_contagem(c) for c in listar_contagens()]})


def _formatar_requisicao_resumo(requisicao):
    contagens = [_formatar_contagem(c) for c in requisicao['contagens']]
    total = len(contagens)
    aprovadas = sum(1 for c in contagens if c['status'] == 'aprovada')
    respondidas = sum(1 for c in contagens if c['status'] in ('respondida', 'aprovada'))
    return {
        "titulo": requisicao['titulo'],
        "prazoValidade": requisicao['prazo_validade'],
        "criadoEm": requisicao['criado_em'],
        "contagens": contagens,
        "totalLojas": total,
        "lojasRespondidas": respondidas,
        "lojasAprovadas": aprovadas,
        "prontaParaConferencia": respondidas == total,
        "totalmenteAprovada": aprovadas == total,
    }


def _buscar_grupo_requisicao(titulo, prazo_validade):
    return next(
        (r for r in listar_requisicoes() if r['titulo'] == titulo and r['prazo_validade'] == prazo_validade),
        None,
    )


@app.route('/api/requisicoes', methods=['GET'])
def api_listar_requisicoes():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    return jsonify({"requisicoes": [_formatar_requisicao_resumo(r) for r in listar_requisicoes()]})


@app.route('/api/requisicoes', methods=['DELETE'])
def api_excluir_requisicao():
    """Exclui uma única requisição (versão pontual da Zona de Perigo, que
    só apaga tudo de uma vez) — ver excluir_requisicao em
    backend/armazenamento.py."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    titulo = request.args.get('titulo', '')
    prazo_validade = request.args.get('prazoValidade', '')
    grupo = _buscar_grupo_requisicao(titulo, prazo_validade)
    if not grupo:
        return jsonify({"erro": "Requisição não encontrada."}), 404
    excluir_requisicao(titulo, prazo_validade)
    return jsonify({"ok": True})


@app.route('/api/requisicoes/conferencia', methods=['GET'])
def api_conferencia_requisicao():
    """Soma o preenchido e a quantidade ideal de cada insumo através de
    todas as lojas de uma requisição — a "área de conferência" antes de
    virar cotação de verdade (ver DOCUMENTACAO.md seção 9, item 1)."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    titulo = request.args.get('titulo', '')
    prazo_validade = request.args.get('prazoValidade', '')
    grupo = _buscar_grupo_requisicao(titulo, prazo_validade)
    if not grupo:
        return jsonify({"erro": "Requisição não encontrada."}), 404

    agregados = {}
    for contagem in grupo['contagens']:
        for item in listar_itens_contagem(contagem['id'], contagem['loja']):
            agregado = agregados.setdefault(item['insumoId'], {
                "insumoId": item['insumoId'],
                "nome": item['nome'],
                "categoria": item['categoria'],
                "unidadeMedida": item['unidadeMedida'],
                "preenchidoTotal": 0.0,
                "idealTotal": 0.0,
                "temIdeal": False,
                "algumAjustado": False,
            })
            if item['quantidadePreenchida'] is not None:
                agregado['preenchidoTotal'] += item['quantidadePreenchida']
            if item['quantidadeIdeal'] is not None:
                agregado['idealTotal'] += item['quantidadeIdeal']
                agregado['temIdeal'] = True
            if item.get('quantidadeIdealAjustada'):
                agregado['algumAjustado'] = True

    itens = []
    for agregado in agregados.values():
        deficit = round(agregado['idealTotal'] - agregado['preenchidoTotal'], 2) if agregado['temIdeal'] else None
        itens.append({
            "insumoId": agregado['insumoId'],
            "nome": agregado['nome'],
            "categoria": agregado['categoria'],
            "unidadeMedida": agregado['unidadeMedida'],
            "preenchidoTotal": round(agregado['preenchidoTotal'], 2),
            "idealTotal": round(agregado['idealTotal'], 2) if agregado['temIdeal'] else None,
            "idealAjustado": agregado['algumAjustado'],
            "deficit": max(deficit, 0) if deficit is not None else None,
        })
    itens.sort(key=lambda i: (i['deficit'] is None, -(i['deficit'] or 0), i['nome']))

    resposta = _formatar_requisicao_resumo(grupo)
    resposta['itens'] = itens
    return jsonify(resposta)


@app.route('/api/requisicoes/conferencia/aprovar', methods=['POST'])
def api_aprovar_requisicao():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    titulo = (dados.get('titulo') or '').strip()
    prazo_validade = (dados.get('prazoValidade') or '').strip()
    grupo = _buscar_grupo_requisicao(titulo, prazo_validade)
    if not grupo:
        return jsonify({"erro": "Requisição não encontrada."}), 404

    aprovadas = 0
    for contagem in grupo['contagens']:
        if contagem['status'] == 'respondida':
            aprovar_contagem(contagem['id'])
            aprovadas += 1
    return jsonify({"ok": True, "aprovadas": aprovadas})


@app.route('/api/requisicoes/conferencia/gerar-cotacao', methods=['POST'])
def api_gerar_cotacao_requisicao():
    """Transforma o déficit de uma requisição totalmente aprovada numa
    cotação de verdade (com quantidade por insumo), pronta pra comparar
    preço de fornecedor — ver DOCUMENTACAO.md seção 9, 'Geração automática
    da cotação a partir do déficit'."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    titulo = (dados.get('titulo') or '').strip()
    prazo_validade = (dados.get('prazoValidade') or '').strip()
    grupo = _buscar_grupo_requisicao(titulo, prazo_validade)
    if not grupo:
        return jsonify({"erro": "Requisição não encontrada."}), 404
    if any(c['status'] != 'aprovada' for c in grupo['contagens']):
        return jsonify({"erro": "Só é possível gerar a cotação depois que todas as lojas forem aprovadas."}), 400

    resultado = gerar_cotacao_do_deficit(titulo, prazo_validade)
    if resultado["cotacaoId"] is None:
        return jsonify({"erro": "Nenhum insumo com déficit — não há nada para cotar."}), 400
    return jsonify({
        "ok": True,
        "cotacaoId": resultado["cotacaoId"],
        "insumosSemIdeal": resultado["insumosSemIdeal"],
    })


@app.route('/api/contagens', methods=['POST'])
def api_criar_contagem():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    loja = (dados.get('loja') or '').strip()
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    descricao = (dados.get('descricao') or '').strip()
    prazo_validade = (dados.get('prazoValidade') or '').strip()
    if not prazo_validade:
        return jsonify({"erro": "Informe o prazo de validade."}), 400
    categorias = dados.get('categorias') or None

    resultado = criar_contagem(loja, descricao, prazo_validade, categorias)
    return jsonify(resultado)


@app.route('/api/contagens/<int:contagem_id>', methods=['GET'])
def api_buscar_contagem(contagem_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    contagem = buscar_contagem(contagem_id)
    if not contagem:
        return jsonify({"erro": "Contagem não encontrada."}), 404

    resposta = _formatar_contagem(contagem)
    resposta['itens'] = listar_itens_contagem(contagem_id, contagem['loja'])
    return jsonify(resposta)


@app.route('/api/contagens/<int:contagem_id>/aprovar', methods=['POST'])
def api_aprovar_contagem(contagem_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    contagem = buscar_contagem(contagem_id)
    if not contagem:
        return jsonify({"erro": "Contagem não encontrada."}), 404
    if contagem['status'] == 'aprovada':
        return jsonify({"erro": "Essa contagem já foi aprovada."}), 400

    aprovar_contagem(contagem_id)
    return jsonify({"ok": True})


@app.route('/api/contagens/<int:contagem_id>/reabrir', methods=['POST'])
def api_reabrir_contagem(contagem_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    contagem = buscar_contagem(contagem_id)
    if not contagem:
        return jsonify({"erro": "Contagem não encontrada."}), 404
    if contagem['status'] == 'aberta':
        return jsonify({"erro": "Essa contagem já está aberta."}), 400

    reabrir_contagem(contagem_id)
    return jsonify({"ok": True})


@app.route('/api/insumos/<int:insumo_id>/quantidade-ideal', methods=['PUT'])
def api_ajustar_quantidade_ideal(insumo_id):
    """Sobrescreve manualmente a quantidade ideal calculada, quando o
    número não bate com o que a Kethllyn sabe da realidade da loja (ver
    seção 9 da documentação, 'Quantidade ideal inteligente')."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    loja = request.args.get('loja')
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400

    dados = request.get_json(silent=True) or {}
    try:
        valor = float(dados.get('valor'))
    except (TypeError, ValueError):
        return jsonify({"erro": "Informe um valor numérico."}), 400
    if valor < 0:
        return jsonify({"erro": "O valor não pode ser negativo."}), 400

    salvar_ajuste_quantidade_ideal(loja, insumo_id, valor)
    return jsonify({"ok": True})


@app.route('/api/insumos/<int:insumo_id>/quantidade-ideal', methods=['DELETE'])
def api_remover_ajuste_quantidade_ideal(insumo_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    loja = request.args.get('loja')
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400

    excluir_ajuste_quantidade_ideal(loja, insumo_id)
    return jsonify({"ok": True})


@app.route('/api/insumos/ajustes-quantidade-ideal/lote', methods=['POST'])
def api_ajustar_quantidade_ideal_lote():
    """Ajusta a quantidade ideal de vários insumos de uma vez, pra não
    precisar passar um por um quando a Ficha Técnica ainda não calcula
    sozinha pra muitos insumos."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    loja = dados.get('loja')
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400

    valores_brutos = dados.get('valores') or {}
    valores = {}
    try:
        for insumo_id, valor in valores_brutos.items():
            if valor is None or valor == '':
                continue
            valor_float = float(valor)
            if valor_float < 0:
                return jsonify({"erro": "Nenhum valor pode ser negativo."}), 400
            valores[int(insumo_id)] = valor_float
    except (TypeError, ValueError):
        return jsonify({"erro": "Valor inválido."}), 400

    if not valores:
        return jsonify({"erro": "Preencha pelo menos um insumo."}), 400

    salvos = salvar_ajustes_quantidade_ideal_em_lote(loja, valores)
    return jsonify({"ok": True, "salvos": salvos})


@app.route('/api/insumos/ajustes-quantidade-ideal', methods=['GET'])
def api_ajustes_quantidade_ideal():
    """Ajustes manuais de quantidade ideal de uma loja — usado pela tela de
    Estoque pra mostrar o mesmo valor ajustado que já vale na Contagem
    (leitura liberada pra todo mundo logado, igual o resto do Estoque)."""
    loja = request.args.get('loja')
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    mapa = mapa_ajustes_quantidade_ideal(loja)
    return jsonify({
        "ajustes": [{"insumoId": k, "valorAjustado": v} for k, v in mapa.items()],
        "multiplicadorEspecial": multiplicador_quantidade_ideal(loja),
    })


@app.route('/api/insumos/copiar-quantidade-ideal', methods=['POST'])
def api_copiar_quantidade_ideal():
    """'Loja nova sem histórico' (seção 9) — copia a quantidade ideal de
    uma loja parecida pra outra, virando ajuste manual na loja destino."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    loja_origem = dados.get('lojaOrigem')
    loja_destino = dados.get('lojaDestino')
    if loja_origem not in LOJAS or loja_destino not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    if loja_origem == loja_destino:
        return jsonify({"erro": "Escolha duas lojas diferentes."}), 400

    copiados = copiar_quantidade_ideal(loja_origem, loja_destino)
    return jsonify({"ok": True, "copiados": copiados})


def _formatar_data_especial(d):
    return {
        "id": d["id"],
        "dataInicio": d["data_inicio"],
        "dataFim": d["data_fim"],
        "descricao": d["descricao"],
        "multiplicador": d["multiplicador"],
        "loja": d["loja"],
    }


@app.route('/api/datas-especiais', methods=['GET'])
def api_listar_datas_especiais():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    return jsonify({"datasEspeciais": [_formatar_data_especial(d) for d in listar_datas_especiais()]})


@app.route('/api/datas-especiais', methods=['POST'])
def api_criar_data_especial():
    """Feriado/evento marcado com antecedência — aumenta a quantidade
    ideal calculada enquanto a data cai dentro da janela de cobertura
    (ver seção 9, 'Quantidade ideal inteligente')."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    data_inicio = (dados.get('dataInicio') or '').strip()
    data_fim = (dados.get('dataFim') or '').strip() or data_inicio
    descricao = (dados.get('descricao') or '').strip()
    loja = dados.get('loja') or None

    if not data_inicio:
        return jsonify({"erro": "Informe a data de início."}), 400
    if not descricao:
        return jsonify({"erro": "Informe uma descrição (ex: Copa do Mundo, Dia das Mães)."}), 400
    if loja is not None and loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    try:
        data_inicio_obj = date.fromisoformat(data_inicio)
        data_fim_obj = date.fromisoformat(data_fim)
    except ValueError:
        return jsonify({"erro": "Datas inválidas."}), 400
    if data_fim_obj < data_inicio_obj:
        return jsonify({"erro": "A data final não pode ser antes da inicial."}), 400
    try:
        multiplicador = float(dados.get('multiplicador'))
    except (TypeError, ValueError):
        return jsonify({"erro": "Informe um multiplicador numérico (ex: 1.5)."}), 400
    if multiplicador <= 0:
        return jsonify({"erro": "O multiplicador precisa ser maior que zero."}), 400

    criar_data_especial(data_inicio_obj.isoformat(), data_fim_obj.isoformat(), descricao, multiplicador, loja)
    return jsonify({"ok": True})


@app.route('/api/datas-especiais/<int:data_especial_id>', methods=['DELETE'])
def api_excluir_data_especial(data_especial_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    excluir_data_especial(data_especial_id)
    return jsonify({"ok": True})


@app.route('/api/contagens/token/<token>', methods=['GET'])
def api_buscar_contagem_por_token(token):
    # Pública (sem login) — ver exceção em ROTAS_API_PUBLICAS/_exigir_login.
    contagem = buscar_contagem_por_token(token)
    if not contagem:
        return jsonify({"erro": "Link inválido."}), 404

    resposta = _formatar_contagem(contagem)
    resposta.pop('token', None)
    resposta['itens'] = listar_itens_contagem(contagem['id'], contagem['loja'])
    resposta['expirada'] = contagem['status'] == 'aberta' and _prazo_vencido(contagem['prazo_validade'])
    return jsonify(resposta)


@app.route('/api/contagens/token/<token>/responder', methods=['POST'])
def api_responder_contagem(token):
    # Pública (sem login) — mesma exceção acima.
    contagem = buscar_contagem_por_token(token)
    if not contagem:
        return jsonify({"erro": "Link inválido."}), 404
    if contagem['status'] != 'aberta':
        return jsonify({"erro": "Essa contagem já foi respondida."}), 400
    if _prazo_vencido(contagem['prazo_validade']):
        return jsonify({"erro": "O prazo para preencher essa contagem já venceu."}), 400

    dados = request.get_json(silent=True) or {}
    valores_brutos = dados.get('valores') or {}
    valores = {}
    try:
        for insumo_id, quantidade in valores_brutos.items():
            if quantidade is None or quantidade == '':
                continue
            valores[int(insumo_id)] = float(quantidade)
    except (TypeError, ValueError):
        return jsonify({"erro": "Quantidade inválida."}), 400
    if any(v < 0 for v in valores.values()):
        return jsonify({"erro": "Quantidade não pode ser negativa."}), 400

    responder_contagem(token, valores)
    return jsonify({"ok": True})


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
            salvar_pedidos_do_dia(nome_unidade, dia_iso, resumo["pedidos_detalhados"])
            salvar_itens_vendidos_do_dia(nome_unidade, dia_iso, resumo["pedidos_detalhados"])
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
    ajustes = buscar_ajustes_canal_periodo(dia, dia)
    canais_ajustados = {a["canal"] for a in ajustes if unidade != 'geral' and a["unidade"] == unidade}
    linhas_canais, _ = _aplicar_ajustes_canal(linhas_canais, [], ajustes)

    unidade_filtro = None if unidade == 'geral' else unidade
    canais = _agregar_canais(linhas_canais, unidade_filtro)

    return jsonify({
        "dataLabel": _formatar_data_br(dia),
        "canais": _formatar_canais(canais, canais_ajustados),
        "editavel": unidade != 'geral',
    })


@app.route('/api/ajuste-canal', methods=['PUT'])
def api_salvar_ajuste_canal():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    unidade = dados.get('unidade')
    dia = dados.get('dia')
    canal = dados.get('canal')

    if unidade not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    try:
        date.fromisoformat(dia)
    except (TypeError, ValueError):
        return jsonify({"erro": "Data inválida."}), 400
    if not canal:
        return jsonify({"erro": "Informe o canal."}), 400
    try:
        faturamento = float(dados.get('faturamento'))
        quantidade_pedidos = int(dados.get('quantidadePedidos'))
    except (TypeError, ValueError):
        return jsonify({"erro": "Faturamento/quantidade de pedidos inválidos."}), 400
    if faturamento < 0 or quantidade_pedidos < 0:
        return jsonify({"erro": "Valores não podem ser negativos."}), 400

    salvar_ajuste_canal(unidade, dia, canal, faturamento, quantidade_pedidos)
    return jsonify({"ok": True})


@app.route('/api/ajuste-canal', methods=['DELETE'])
def api_excluir_ajuste_canal():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    unidade = request.args.get('unidade')
    dia = request.args.get('dia')
    canal = request.args.get('canal')
    if not unidade or not dia or not canal:
        return jsonify({"erro": "Informe loja, dia e canal."}), 400

    excluir_ajuste_canal(unidade, dia, canal)
    return jsonify({"ok": True})


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

    # Ajuste manual de canal (ver seção 6.3 da documentação) — "vence" o
    # valor sincronizado quando o painel da própria Cardápio Web diverge do
    # que a API retorna.
    ajustes = buscar_ajustes_canal_periodo(inicio.isoformat(), fim.isoformat())
    linhas_canais, linhas_periodo = _aplicar_ajustes_canal(linhas_canais, linhas_periodo, ajustes)

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


# --- PREPARO (indicadores operacionais da cozinha) --------------------------
# "Tempo de preparo" aqui é o tempo do PEDIDO INTEIRO — do recebido ao
# fechado/entregue na Cardápio Web —, não só o tempo de cozinha, porque a
# API não marca separadamente quando a comida ficou pronta (ver
# backend/cardapio_web.py:_duracao_minutos e seção 6.2 da documentação).

def _agregar_duracoes(pedidos):
    if not pedidos:
        return {"tempoMedioMinutos": None, "totalPedidos": 0}
    total = len(pedidos)
    media = sum(p["duracao_minutos"] for p in pedidos) / total
    return {"tempoMedioMinutos": round(media, 1), "totalPedidos": total}


def _montar_bloco_preparo(pedidos):
    bloco = _agregar_duracoes(pedidos)

    por_hora = {h: [] for h in range(24)}
    for p in pedidos:
        por_hora[int(p["criado_em"][11:13])].append(p["duracao_minutos"])
    por_horario = [
        {
            "hora": hora,
            "totalPedidos": len(duracoes),
            "tempoMedioMinutos": round(sum(duracoes) / len(duracoes), 1) if duracoes else None,
        }
        for hora, duracoes in sorted(por_hora.items())
    ]
    pico = max(por_horario, key=lambda h: h["totalPedidos"])
    bloco["horarioPico"] = pico if pico["totalPedidos"] > 0 else None
    bloco["porHorario"] = por_horario

    # Agrupado por loja+dia (não só dia) — na visão Geral, os pedidos vêm de
    # lojas diferentes, e misturar "Artesanos lento" com "Simus rápido" no
    # mesmo dia calendário não diz nada de útil.
    por_loja_dia = {}
    for p in pedidos:
        por_loja_dia.setdefault((p["unidade"], p["dia"]), []).append(p["duracao_minutos"])
    bloco["gargalos"] = sorted(
        [
            {
                "loja": chave[0],
                "dia": chave[1],
                "totalPedidos": len(duracoes),
                "tempoMedioMinutos": round(sum(duracoes) / len(duracoes), 1),
            }
            for chave, duracoes in por_loja_dia.items()
            if len(duracoes) >= 3  # dia com 1-2 pedidos não é "lento", é ruído
        ],
        key=lambda g: g["tempoMedioMinutos"],
        reverse=True,
    )[:10]

    return bloco


@app.route('/api/preparo', methods=['GET'])
def api_preparo():
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

    pedidos = buscar_pedidos_preparo_periodo(inicio.isoformat(), fim.isoformat())

    resposta = {"geral": _montar_bloco_preparo(pedidos)}
    resposta["geral"]["porLoja"] = sorted(
        [
            {"loja": unidade, **_agregar_duracoes([p for p in pedidos if p["unidade"] == unidade])}
            for unidade in LOJAS.keys()
            if any(p["unidade"] == unidade for p in pedidos)
        ],
        key=lambda l: l["tempoMedioMinutos"],
        reverse=True,
    )

    for nome_unidade in LOJAS.keys():
        resposta[nome_unidade] = _montar_bloco_preparo([p for p in pedidos if p["unidade"] == nome_unidade])

    return jsonify(resposta)


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


PRIORIDADES_TAREFA_VALIDAS = {'alta', 'media', 'baixa'}
STATUS_TAREFA_VALIDOS = {'todo', 'doing', 'done'}


@app.route('/api/tarefas', methods=['POST'])
def api_criar_tarefa():
    dados = request.get_json(silent=True) or {}
    titulo = (dados.get('titulo') or '').strip()
    if not titulo:
        return jsonify({"erro": "Título é obrigatório."}), 400
    prioridade = dados.get('prioridade') or 'media'
    if prioridade not in PRIORIDADES_TAREFA_VALIDAS:
        return jsonify({"erro": "Prioridade inválida."}), 400
    tarefa_id = criar_tarefa(
        titulo,
        dados.get('descricao') or '',
        dados.get('categoria') or 'Geral',
        prioridade,
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
    if 'prioridade' in campos and campos['prioridade'] not in PRIORIDADES_TAREFA_VALIDAS:
        return jsonify({"erro": "Prioridade inválida."}), 400
    if 'status' in campos and campos['status'] not in STATUS_TAREFA_VALIDOS:
        return jsonify({"erro": "Status inválido."}), 400
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
