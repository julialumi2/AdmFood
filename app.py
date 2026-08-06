import os
from datetime import date, timedelta
from flask import Flask, abort, jsonify, request, send_from_directory
from flask_cors import CORS

from config import LOJAS
from backend.armazenamento import (
    inicializar_banco,
    buscar_faturamento_periodo,
    buscar_canais_periodo,
    salvar_venda_presencial,
    excluir_venda_presencial,
    buscar_presencial_periodo,
    buscar_presencial_por_unidade,
    buscar_faturamento_dia,
    buscar_ultima_sincronizacao,
    salvar_resumo_do_dia,
)
from backend.cardapio_web import buscar_resumo_do_dia
from sincronizar import sincronizar_dia, DIA_FECHADO

app = Flask(__name__)
CORS(app)  # Permite requisições do JS mesmo se rodar direto do arquivo local

inicializar_banco()

# Sincronização diária automática com a Cardápio Web. Localmente isso já é
# feito pelo Agendador de Tarefas do Windows (fora do processo do Flask),
# mas em produção (Dokploy) não existe esse agendador — o próprio processo
# da aplicação precisa disparar a sincronização todo dia.
if os.environ.get("SINCRONIZACAO_AUTOMATICA", "false").lower() == "true":
    # Evita agendar duas vezes por causa do reloader do modo debug.
    if not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        from apscheduler.schedulers.background import BackgroundScheduler

        def _rodar_sincronizacao_diaria():
            sincronizar_dia(date.today() - timedelta(days=1))

        _scheduler = BackgroundScheduler(timezone="America/Sao_Paulo")
        _scheduler.add_job(_rodar_sincronizacao_diaria, "cron", hour=3, minute=0)
        _scheduler.start()

PERIODOS_DIAS = {
    "Últimos 30 dias": 30,
    "Este Mês": None,  # tratado à parte: do dia 1 do mês até hoje
    "Último Trimestre": 90,
}

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


def _calcular_intervalo(periodo):
    hoje = date.today()

    if periodo == "Este Mês":
        inicio = hoje.replace(day=1)
    else:
        dias = PERIODOS_DIAS.get(periodo, 30)
        inicio = hoje - timedelta(days=dias - 1)

    return inicio, hoje


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


def _linhas_canais_com_presencial(dia_iso):
    """Canais da Cardápio Web de um dia + venda presencial como um canal
    "Presencial" a mais (também não passa pela Cardápio Web)."""
    linhas_canais = buscar_canais_periodo(dia_iso, dia_iso)
    linhas_canais = linhas_canais + [
        {
            "unidade": p["unidade"],
            "dia": p["dia"],
            "canal": "Presencial",
            "quantidade_pedidos": p.get("quantidade") or 0,
            "faturamento": p["valor"],
        }
        for p in buscar_presencial_periodo(dia_iso, dia_iso)
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


def _cards_dia_anterior(unidade_filtro, linhas_ontem, linhas_anteontem):
    """Faturamento Total / Total de Pedidos / Ticket Médio sempre do dia
    anterior, independente do período selecionado no filtro — vale pra
    Visão Geral e pra cada loja."""
    base_ontem = linhas_ontem if unidade_filtro is None else [l for l in linhas_ontem if l["unidade"] == unidade_filtro]
    base_anteontem = (
        linhas_anteontem if unidade_filtro is None else [l for l in linhas_anteontem if l["unidade"] == unidade_filtro]
    )

    fat = sum(l["faturamento_dia"] for l in base_ontem)
    ped = sum(l["quantidade_pedidos"] for l in base_ontem)
    tik = sum(l["ticket_medio"] for l in base_ontem) / len(base_ontem) if base_ontem else 0.0

    fat_ant = sum(l["faturamento_dia"] for l in base_anteontem)
    ped_ant = sum(l["quantidade_pedidos"] for l in base_anteontem)
    tik_ant = sum(l["ticket_medio"] for l in base_anteontem) / len(base_anteontem) if base_anteontem else 0.0

    perc_fat, up_fat = _tendencia(fat, fat_ant)
    perc_ped, up_ped = _tendencia(ped, ped_ant)
    perc_tik, up_tik = _tendencia(tik, tik_ant)

    return {
        "faturamento": _formatar_moeda(fat),
        "faturamentoTrend": _texto_tendencia(perc_fat),
        "faturamentoUp": up_fat,
        "pedidos": _formatar_numero(ped),
        "pedidosTrend": _texto_tendencia(perc_ped),
        "pedidosUp": up_ped,
        "ticket": _formatar_moeda(tik),
        "ticketTrend": _texto_tendencia(perc_tik),
        "ticketUp": up_tik,
    }


def _tendencia(atual, anterior):
    if anterior == 0:
        return None, atual > 0
    percentual = ((atual - anterior) / anterior) * 100
    return percentual, percentual >= 0


def _texto_tendencia(percentual):
    if percentual is None:
        return "período novo"
    sinal = "+" if percentual >= 0 else ""
    return f"{sinal}{percentual:.1f}%"


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
    return jsonify({
        "ultimaSincronizacao": _formatar_data_br(ultimo_dia) if ultimo_dia else None,
        "lojas": [
            {
                "nome": nome,
                "tokenMascarado": _mascarar_token(cfg.get("cardapio_web_token")),
                "temPresencial": nome in UNIDADES_COM_PRESENCIAL,
            }
            for nome, cfg in LOJAS.items()
        ],
    })


@app.route('/api/sincronizar-agora', methods=['POST'])
def api_sincronizar_agora():
    ontem = date.today() - timedelta(days=1)

    if ontem.weekday() == DIA_FECHADO:
        return jsonify({
            "diaLabel": _formatar_data_br(ontem.isoformat()),
            "fechado": True,
            "resultados": [],
        })

    resultados = []
    for nome_unidade, config_loja in LOJAS.items():
        token = config_loja.get("cardapio_web_token")
        if not token:
            resultados.append({"unidade": nome_unidade, "sucesso": False, "mensagem": "Token não configurado"})
            continue
        try:
            resumo = buscar_resumo_do_dia(token, ontem)
            salvar_resumo_do_dia(nome_unidade, ontem.isoformat(), resumo)
            resultados.append({
                "unidade": nome_unidade,
                "sucesso": True,
                "faturamento": _formatar_moeda(resumo["faturamento_dia"]),
                "pedidos": resumo["quantidade_pedidos"],
            })
        except Exception as erro:
            resultados.append({"unidade": nome_unidade, "sucesso": False, "mensagem": str(erro)})

    return jsonify({
        "diaLabel": _formatar_data_br(ontem.isoformat()),
        "fechado": False,
        "resultados": resultados,
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
                "totalDia": _formatar_moeda(buscar_faturamento_dia(unidade, l["dia"]) + l["valor"]),
            }
            for l in lancamentos
        ]
    })


@app.route('/api/historico-diario', methods=['GET'])
def api_historico_diario():
    unidade = request.args.get('unidade', 'geral')
    inicio = request.args.get('inicio')
    fim = request.args.get('fim')

    if not inicio or not fim:
        return jsonify({"erro": "Informe inicio e fim (YYYY-MM-DD)."}), 400
    try:
        date.fromisoformat(inicio)
        date.fromisoformat(fim)
    except ValueError:
        return jsonify({"erro": "Datas inválidas."}), 400
    if inicio > fim:
        inicio, fim = fim, inicio

    linhas = _aplicar_presencial(
        buscar_faturamento_periodo(inicio, fim),
        buscar_presencial_periodo(inicio, fim),
    )
    if unidade != 'geral':
        linhas = [l for l in linhas if l["unidade"] == unidade]

    diario = sorted(linhas, key=lambda l: (l["dia"], l["unidade"]), reverse=True)
    return jsonify({"diario": _formatar_diario(diario)})


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
    periodo = request.args.get('periodo', 'Últimos 30 dias')
    inicio, fim = _calcular_intervalo(periodo)

    linhas_periodo = _aplicar_presencial(
        buscar_faturamento_periodo(inicio.isoformat(), fim.isoformat()),
        buscar_presencial_periodo(inicio.isoformat(), fim.isoformat()),
    )

    # Análise por canal sempre reflete o dia anterior (mesmo recorte da Cardápio Web),
    # independente do período selecionado no filtro geral.
    data_ontem = date.today() - timedelta(days=1)
    data_anteontem = data_ontem - timedelta(days=1)
    ontem = data_ontem.isoformat()
    anteontem = data_anteontem.isoformat()
    linhas_canais = _linhas_canais_com_presencial(ontem)
    canal_data_label = _formatar_data_br(ontem)

    resposta = {
        "geral": _montar_bloco(
            None, linhas_periodo, "Visão Geral (Todas)", linhas_canais, canal_data_label
        )
    }
    for nome_unidade in LOJAS.keys():
        resposta[nome_unidade] = _montar_bloco(
            nome_unidade, linhas_periodo, nome_unidade, linhas_canais, canal_data_label
        )

    # Os cards de topo (Faturamento Total / Total de Pedidos / Ticket Médio)
    # sempre mostram só o dia anterior, não o período do filtro — em todas as
    # abas (Visão Geral e cada loja). O resto do bloco (histórico,
    # detalhamento, canais) continua respeitando o período selecionado.
    linhas_ontem = _aplicar_presencial(
        buscar_faturamento_periodo(ontem, ontem), buscar_presencial_periodo(ontem, ontem)
    )
    linhas_anteontem = _aplicar_presencial(
        buscar_faturamento_periodo(anteontem, anteontem), buscar_presencial_periodo(anteontem, anteontem)
    )

    resposta["geral"].update(_cards_dia_anterior(None, linhas_ontem, linhas_anteontem))
    for nome_unidade in LOJAS.keys():
        resposta[nome_unidade].update(_cards_dia_anterior(nome_unidade, linhas_ontem, linhas_anteontem))

    return jsonify(resposta)


if __name__ == '__main__':
    # threaded=True: sem isso, o servidor de desenvolvimento atende um
    # pedido de cada vez — uma sincronização manual demorada (chama a
    # Cardápio Web pedido por pedido) travaria a página inteira pra
    # qualquer outra aba/pessoa até terminar. Em produção isso já não
    # acontece, porque o Gunicorn roda vários workers em paralelo.
    app.run(debug=True, port=5000, threaded=True)
