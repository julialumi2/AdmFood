import io
import json
import math
import os
import re
import secrets
import tempfile
import threading
import time
import uuid
import zipfile
from datetime import date, datetime, timedelta
from flask import (
    Flask, abort, g, jsonify, redirect, request,
    send_file, send_from_directory, session,
)

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
    ultimo_dia_sincronizado,
    salvar_resumo_do_dia,
    salvar_pedidos_do_dia,
    salvar_itens_vendidos_do_dia,
    buscar_pedidos_preparo_periodo,
    salvar_ajuste_canal,
    excluir_ajuste_canal,
    buscar_ajustes_canal_periodo,
    listar_faturamento_canal_semanal,
    listar_resultado_semanal,
    salvar_resultado_semanal_se_ausente,
    substituir_semana_importada,
    salvar_resultado_semanal,
    salvar_faturamento_canal_semanal_se_ausente,
    listar_tarefas,
    criar_tarefa,
    atualizar_tarefa,
    excluir_tarefa,
    o_que_vai_junto_com_a_tarefa,
    o_que_vai_junto_com_o_item,
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
    previa_da_planilha_de_precos,
    buscar_preco_cardapio_por_id,
    atualizar_preco_cardapio,
    historico_de_preco_cardapio,
    guardar_nota_fiscal_substituida,
    notas_fiscais_substituidas,
    nota_fiscal_substituida,
    PASTA_FOTOS_CARDAPIO,
    criar_insumo,
    criar_insumos_em_lote,
    buscar_estoque_loja,
    uso_do_insumo,
    insumos_sem_conversao_da_ficha,
    quantidades_tipicas_por_insumo,
    listar_execucoes_rotina,
    marcar_execucao_rotina,
    listar_insumos,
    listar_insumos_por_loja,
    salvar_insumos_da_loja,
    listar_contatos_contagem,
    criar_contato_contagem,
    excluir_contato_contagem,
    tirar_insumo_da_loja,
    atualizar_insumo,
    excluir_insumo,
    mesclar_insumo,
    atualizar_estoque_loja,
    distribuir_entrada_insumo,
    criar_item_cardapio,
    excluir_item_cardapio,
    renomear_item_cardapio,
    renomear_linha_cardapio,
    remover_produto_do_cardapio,
    criar_complementos_em_lote,
    listar_complementos_por_loja,
    definir_ficha_tecnica,
    buscar_ficha_tecnica_item,
    assinatura_da_ficha,
    definir_embalagem_viagem,
    buscar_embalagem_viagem_item,
    salvar_custo_item_cardapio,
    quem_digitou_o_custo,
    remover_custo_item_cardapio,
    listar_produtos_por_loja,
    custos_da_ficha_por_item,
    precos_insumo_em_uso,
    CMV_OTIMO_ATE,
    CMV_BOM_ATE,
    curva_abc_cardapio,
    curva_abc_insumos,
    mapa_curva_abc_insumos,
    definir_produto_protegido,
    consumo_medio_insumo,
    listar_produtos_pendentes,
    produtos_mais_vendidos_do_dia,
    vincular_produto_venda_manualmente,
    definir_composicao_produto_venda,
    listar_composicoes_produto_venda,
    listar_porcoes_complemento,
    definir_porcoes_complemento,
    listar_vinculos_manuais,
    listar_itens_cardapio_todos,
    listar_lotes_vencendo,
    marcar_lote_resolvido,
    criar_fornecedor,
    listar_fornecedores,
    atualizar_fornecedor,
    definir_lojas_fornecedor,
    lojas_da_cotacao,
    definir_fornecedores_insumo,
    mapa_insumo_fornecedores,
    mapa_fornecedores_do_historico,
    criar_cotacao,
    listar_cotacoes,
    buscar_cotacao,
    atualizar_cotacao,
    excluir_cotacao,
    adicionar_preco_cotacao,
    listar_precos_cotacao,
    excluir_preco_cotacao,
    selecionar_preco_cotacao,
    selecionar_melhores_precos_cotacao,
    listar_itens_cotacao_catalogo_completo,
    buscar_ultima_compra_por_insumo,
    salvar_quantidade_item_cotacao,
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
    salvar_quantidades_atuais_em_lote,
    excluir_ajuste_quantidade_ideal,
    excluir_ajustes_quantidade_ideal_da_loja,
    mapa_ajustes_quantidade_ideal,
    copiar_quantidade_ideal,
    multiplicador_quantidade_ideal,
    criar_data_especial,
    excluir_data_especial,
    listar_datas_especiais,
    gerar_cotacao_do_deficit,
    sugestao_de_compra,
    quantidade_a_comprar,
    definir_quantidade_compra,
    requisicao_ja_gerada,
    fornecedor_homologado_por_insumo,
    definir_homologado_insumo,
    lojas_do_insumo,
    mapa_insumo_loja_fornecedores,
    mapa_homologado_por_loja,
    reaplicar_homologados_requisicao,
    motivo_para_nao_reaplicar,
    situacao_compra_requisicao,
    definir_forcar_cotacao,
    soltar_loja_do_item_na_cotacao,
    definir_fornecedor_avulso,
    item_travado_na_requisicao,
    homologados_por_insumo_loja,
    pedidos_diretos_da_requisicao,
    pedidos_recebidos_da_requisicao,
    tirar_item_da_cotacao,
    arredondar_quantidade_compra,
    listar_itens_cotacao,
    gerar_pedidos_de_cotacao,
    cotacao_tem_quebra_por_loja,
    atribuir_cotacao_a_loja,
    listar_pedidos,
    buscar_pedido,
    avancar_status_pedido,
    voltar_status_pedido,
    excluir_pedido,
    substituir_itens_do_pedido,
    listar_pedidos_pendentes_recebimento,
    confirmar_recebimento_pedido,
    vincular_insumo_fornecedor,
    criar_pedidos_diretos,
    lancar_compra_fora,
    PASTA_NOTAS_FISCAIS,
    PASTA_BACKUPS,
    definir_nota_fiscal_pedido,
    CAMINHO_BANCO,
    gerar_backup,
    listar_backups,
    rodar_backup_diario,
    registrar_acao,
    historico_precos_insumo,
    alertas_de_custo_na_margem,
    faturamento_por_loja_nos_dias,
    numeros_da_rotina,
    _classificar_cmv,
    variacoes_de_preco,
    listar_registro_acoes,
    limpar_registro_acoes_antigos,
    pendencias_compras,
    listar_pedidos_recebidos,
    dias_esperando_entrega,
    DIAS_ENTREGA_ATRASADA,
    buscar_fornecedor_por_id,
    buscar_pedidos_por_token,
    cancelamentos_por_token,
    marcar_pedidos_enviados_whatsapp,
    confirmar_pedidos_por_token,
    ESTAGIOS_PEDIDO,
    limpar_requisicoes_e_cotacoes,
    importar_da_vmarket,
    desfazer_importacao_vmarket,
    buscar_receita_insumo,
    adicionar_produto_ao_cardapio,
    definir_receita_insumo,
    _mapa_preco_insumo,
    custo_em_uso_por_insumo,
    inicio_baixa_automatica,
    definir_inicio_baixa_automatica,
    listar_misturas,
    localizar_ou_criar_insumo_de_mistura,
    tarefa_visivel_para,
    excluir_requisicao,
    listar_historico_compras,
    criar_convites_cotacao,
    previa_convites_cotacao,
    listar_convites_cotacao,
    contagem_ja_aberta,
    insumo_com_mesmo_nome,
    contar_falhas_de_login,
    registrar_falha_de_login,
    limpar_falhas_de_login,
    compra_fora_parecida,
    item_da_cotacao_virou_pedido,
    insumo_do_preco_cotacao,
    buscar_convite_por_token,
    contar_admins_ativos,
    excluir_contagem,
    pedidos_preparo_do_dia,
    insumos_que_o_fornecedor_cota,
    encerrar_sessoes_do_usuario,
    bootstrap_ja_aplicado,
    marcar_bootstrap_aplicado,
    responder_convite_cotacao,
    listar_recusas_cotacao,
    horas_virada_das_lojas,
    definir_hora_virada,
    VIRADA_PADRAO,
    insumos_que_o_fornecedor_nao_vende,
    voltar_a_pedir_preco,
    reabrir_convite_cotacao,
    marcar_convite_enviado,
    estender_prazo_convite,
)
from backend.precos_cardapio import ler_precos_da_planilha
from backend.vendas_semanais_planilha import ler_vendas_semanais_da_planilha
from backend.auth import gerar_hash_senha, senha_confere
from backend.cardapio_web import (
    buscar_resumo_do_dia,
    buscar_pedidos_do_dia,
    buscar_detalhes_pedido,
    STATUS_CONCLUIDOS,
    _total_com_desconto_ifood,
)
from sincronizar import sincronizar_dia

# Sem CORS: frontend e backend são servidos pelo mesmo Flask (mesma origem),
# então cross-origin nunca foi necessário de verdade em produção — e com
# login/sessão em jogo, quanto menos origens confiadas, melhor.
# Preço, estoque, ficha técnica e baixa são todos guardados nessas unidades:
# cadastrar insumo em "kg" quebrava a régua do sistema inteiro (QA 22/09).
UNIDADES_INSUMO = ('g', 'ml', 'un')

# Quantidade de ficha técnica 10× acima ou abaixo da mediana do mesmo insumo
# nas outras fichas pede confirmação antes de gravar (QA 22/09).
FATOR_QUANTIDADE_SUSPEITA = 10

app = Flask(__name__)


def _chave_de_sessao():
    """A chave que assina o cookie de login.

    Vem de SECRET_KEY quando ela existe. Sem ela, o sistema guarda uma chave
    sorteada num arquivo ao lado do banco (mesmo volume que sobrevive a
    deploy) em vez de sortear uma por processo: a produção roda com dois
    processos, e chave diferente em cada um derruba o login no clique
    seguinte. Nunca volta a ser uma chave fixa no código — o repositório é
    público, e com ela dá pra forjar o cookie de um admin (QA 22/09)."""
    if SECRET_KEY:
        return SECRET_KEY

    caminho = os.path.join(os.path.dirname(os.path.abspath(CAMINHO_BANCO)), ".chave_sessao")
    for _ in range(10):
        try:
            with io.open(caminho, encoding="utf-8") as arquivo:
                guardada = arquivo.read().strip()
            if guardada:
                return guardada
            time.sleep(0.1)  # outro processo criou e ainda está escrevendo
            continue
        except FileNotFoundError:
            pass
        try:
            # O_EXCL: se dois processos subirem juntos, só um cria o arquivo;
            # o outro cai no FileExistsError e lê o que foi gravado.
            descritor = os.open(caminho, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            continue
        except OSError as erro:
            print(f"⚠️  Não deu pra guardar a chave de sessão em {caminho} ({erro}) — todo mundo vai cair do login a cada restart. Defina SECRET_KEY no ambiente.")
            return secrets.token_hex(32)
        with os.fdopen(descritor, "w") as arquivo:
            arquivo.write(secrets.token_hex(32))

    print("⚠️  Não deu pra ler a chave de sessão guardada — defina SECRET_KEY no ambiente.")
    return secrets.token_hex(32)


if not SECRET_KEY:
    print("⚠️  SECRET_KEY não definida — usando a chave guardada ao lado do banco. Pra deixar explícito, defina no .env (local) ou nas variáveis de ambiente do Dokploy (produção).")
app.secret_key = _chave_de_sessao()
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('SESSION_COOKIE_SECURE', 'false').lower() == 'true'
# O padrão do Flask é 31 dias, que é muito pra celular perdido ou emprestado
# no salão. Uma semana evita login todo dia sem deixar sessão viva um mês.
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)
# Quanto tempo a sessão dura, pra tela poder dizer isso em português em vez
# de deixar a pessoa adivinhar (QA 22/09).
DIAS_DE_SESSAO = 7

# Sem limite global, o upload só era conferido nas duas rotas de nota fiscal
# — a foto do cardápio não tinha limite nenhum e dava pra encher o disco do
# servidor com um arquivo só (QA 22/09). 25 MB cobre foto de celular e nota
# escaneada com folga.
TAMANHO_MAXIMO_UPLOAD = 25 * 1024 * 1024
app.config['MAX_CONTENT_LENGTH'] = TAMANHO_MAXIMO_UPLOAD


@app.errorhandler(413)
def _arquivo_grande_demais(_erro):
    limite_mb = TAMANHO_MAXIMO_UPLOAD // (1024 * 1024)
    return jsonify({"erro": f"O arquivo passou de {limite_mb} MB. Tire uma foto menor ou comprima o arquivo."}), 413

inicializar_banco()


# Reaplicar a conta inicial a cada boot resolvia "ficar trancado de fora",
# mas desativar ou excluir essas pessoas não grudava: o redeploy seguinte
# devolvia acesso, papel e a senha da variável de ambiente (QA 22/09). Agora
# cada e-mail é aplicado UMA vez (fica registrado em bootstrap_usuario).
# BOOTSTRAP_FORCAR=true aplica de novo no próximo boot, pra quando ela
# precisar mesmo — é o destrave de emergência.
BOOTSTRAP_FORCAR = os.environ.get("BOOTSTRAP_FORCAR", "").strip().lower() in ("1", "true", "sim")


def _sincronizar_usuario_inicial(nome, email, senha, papel, rotulo):
    # Cria a conta desse e-mail específico se ela ainda não tiver sido criada
    # nenhuma vez. Depois disso quem manda é a tela de Equipe: desativar,
    # trocar papel ou excluir passa a valer de verdade.
    email = (email or '').strip()
    senha = (senha or '').strip()
    if not email or not senha:
        return
    if bootstrap_ja_aplicado(email) and not BOOTSTRAP_FORCAR:
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
        marcar_bootstrap_aplicado(email)
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
        papel = membro.get('papel') if membro.get('papel') in ('admin', 'gerente', 'operacao') else 'operacao'
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
            papel = membro.get('papel') if membro.get('papel') in ('admin', 'gerente', 'operacao') else 'operacao'
            _sincronizar_usuario_inicial(
                membro.get('nome'), membro.get('email'), membro.get('senha'), papel, 'Usuário da equipe inicial (sob demanda)'
            )
            return


_criar_admin_inicial_se_necessario()
_criar_equipe_inicial_se_necessario()


# --- LOGIN ------------------------------------------------------------------

PAGINAS_PUBLICAS = {"login.html", "esquecisenha.html", "preencher_contagem.html", "preencher_cotacao.html", "confirmar_pedido.html",
                    # política de privacidade da extensão do WhatsApp: a Chrome Web Store precisa abrir sem login
                    "privacidade-extensao.html"}
ROTAS_API_PUBLICAS = {"/api/login"}


def _usuario_logado():
    usuario_id = session.get("usuario_id")
    if not usuario_id:
        return None
    # Guarda na requisição: cada guarda de rota chama isso, e sem o cache
    # seria uma ida ao banco por chamada.
    if getattr(g, 'usuario_cache_id', None) != usuario_id:
        g.usuario_cache_id = usuario_id
        usuario = buscar_usuario_por_id(usuario_id)
        # Desativar alguém tem que valer agora, não daqui a 7 dias: a sessão
        # continuava valendo porque `ativo` só era conferido no login
        # (QA 22/09). Vale também pra conta excluída.
        valido = bool(usuario and usuario.get('ativo'))
        # "Sair de todos os aparelhos": o cookie guarda a versão da sessão de
        # quando a pessoa entrou; subir a versão derruba o celular emprestado
        # que ficou logado no salão (QA 22/09).
        if valido and session.get('sessao_versao', 0) != (usuario.get('sessao_versao') or 0):
            valido = False
        g.usuario_cache = usuario if valido else None
    return g.usuario_cache


# --- PERFIS DE ACESSO (card #35) --------------------------------------------
#
# admin    — a rede inteira, tudo que existe no sistema.
# gerente  — uma loja só: compras, estoque, ficha técnica e vendas dela.
# operacao — uma loja só, o dia a dia: contagem, recebimento e consulta de
#            insumo, ficha técnica e preparo. Não cria pedido nem edita
#            cadastro.
PAPEIS = ('admin', 'gerente', 'operacao')

# Telas de cada perfil. O admin não aparece aqui porque vê todas.
PAGINAS_POR_PAPEL = {
    # Faturamento e relatórios de venda ficaram só com o admin (22/09): as
    # telas saíram da lista do gerente junto com as rotas, senão ele abriria
    # uma tela que só mostra erro. Preparo (tempo de pedido) e Evolução do
    # preço (custo de insumo) continuam, porque são de operação e de compra.
    'gerente': {
        'index.html', 'estoque.html', 'fornecedores.html', 'cotacoes.html',
        'contagens.html', 'pedidos.html', 'recebimentos.html', 'guia-compras.html',
        'cardapio.html', 'preparo.html', 'precos.html', 'configuracoes.html',
        'instalar-extensao.html',
    },
    'operacao': {
        # A Home entrou em 23/09 (pedido dela): os alertas de entrega,
        # contagem e estoque crítico são justamente pra quem está na loja, e
        # os blocos de dinheiro já ficam escondidos de quem não é admin.
        'index.html',
        'estoque.html', 'contagens.html', 'recebimentos.html', 'preparo.html',
        'cardapio.html', 'guia-compras.html', 'configuracoes.html',
    },
}
# Pra onde cai quem tenta abrir uma tela que o perfil não alcança. A operação
# não vê faturamento, então nem o Resumo (index) serve de casa pra ela.
# Operação abre na Home desde 23/09 (antes caía direto em Insumos e nunca
# via alerta de entrega, contagem nem estoque crítico).
PAGINA_INICIAL_POR_PAPEL = {'gerente': '/index.html', 'operacao': '/index.html'}


def _papel_do_usuario():
    usuario = _usuario_logado()
    return usuario['papel'] if usuario else None


SEM_LOJA = '(sem loja)'


def _loja_do_usuario():
    """Loja a que a pessoa está presa. None = a rede inteira (admin)."""
    usuario = _usuario_logado()
    if not usuario or usuario['papel'] == 'admin':
        return None
    # Funcionário que ficou sem loja (conta antiga, cadastro pela metade) não
    # enxerga loja nenhuma, em vez de cair no None e enxergar todas.
    return usuario['loja'] or SEM_LOJA


def _loja_no_escopo(loja):
    """Amarra a requisição à loja da pessoa. Pro admin devolve o que veio; pra
    gerente e operação devolve sempre a loja dela, então nenhuma rota entrega
    (nem grava) dado de outra loja, mesmo com o parâmetro adulterado."""
    minha = _loja_do_usuario()
    return minha if minha else loja


def _loja_visivel(loja):
    """Pra quando a loja vem do próprio registro (uma contagem, um pedido) em
    vez de vir na requisição."""
    minha = _loja_do_usuario()
    return minha is None or loja == minha


def _so_da_minha_loja(itens, campo='loja'):
    """Tira da lista o que é de outra loja. O que não tem loja (uma cotação da
    rede, por exemplo) continua aparecendo pra todo mundo."""
    minha = _loja_do_usuario()
    if not minha:
        return itens
    return [item for item in itens if not item.get(campo) or item.get(campo) == minha]


def _exigir_papeis(*papeis):
    usuario = _usuario_logado()
    if not usuario or usuario['papel'] not in papeis:
        return jsonify({"erro": "Seu acesso não permite fazer isso."}), 403
    return None


def _exigir_gestao():
    """Admin e gerente: o que cadastra, compra e aprova."""
    return _exigir_papeis('admin', 'gerente')


def _exigir_equipe():
    """Qualquer pessoa com conta ativa, operação incluída."""
    return _exigir_papeis(*PAPEIS)


# Tempo que a requisição passa DENTRO do sistema, e qual processo atendeu.
# Em produção a primeira chamada depois de uma pausa estava levando ~40 s e
# as seguintes 0,0 s (18/09); com isso dá pra saber se o tempo é gasto no
# código ou na fila antes dele — e se é sempre no processo que roda o
# agendador. Registrado antes do _exigir_login pra medir desde o começo.
@app.before_request
def _marcar_inicio_da_requisicao():
    g.inicio_requisicao = time.perf_counter()


# Cabeçalhos de segurança. O equivalente Flask do `helmet` do Node é o
# Flask-Talisman; aqui são quatro linhas e nenhuma dependência nova, que é o
# que um sistema deste tamanho pede.
#
# A CSP é a parte que mais protege: mesmo que um XSS escape em algum canto,
# o navegador só executa script do próprio domínio e dos dois CDNs que as
# telas usam (já presos na versão e com integrity). 'unsafe-inline' fica no
# script-src porque as páginas têm <script> inline e onclick=; tirar isso é
# uma refatoração grande, e está anotada como dívida.
POLITICA_CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https://images.unsplash.com",
    "connect-src 'self'",
    # Nada de <object>/<embed>, e ninguém abre o sistema dentro de um iframe
    # (clickjacking): o link de contagem e o de cotação vão por WhatsApp e
    # seriam alvo fácil de uma página que os enquadra.
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
])


@app.after_request
def _cabecalhos_de_seguranca(resposta):
    resposta.headers.setdefault('Content-Security-Policy', POLITICA_CSP)
    # Navegador para de "adivinhar" o tipo do arquivo: upload de imagem que na
    # verdade é HTML deixa de ser executável.
    resposta.headers.setdefault('X-Content-Type-Options', 'nosniff')
    resposta.headers.setdefault('X-Frame-Options', 'DENY')
    # O token do link não vaza no Referer quando o fornecedor clica num link
    # de fora da página.
    resposta.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
    resposta.headers.setdefault('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
    # HSTS só faz sentido (e só é honesto) quando a resposta já veio por
    # HTTPS — em desenvolvimento, no http://localhost, ele trancaria a porta.
    if request.is_secure:
        resposta.headers.setdefault('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    return resposta


@app.after_request
def _informar_tempo_da_requisicao(resposta):
    inicio = getattr(g, 'inicio_requisicao', None)
    if inicio is not None:
        resposta.headers['X-Tempo-Servidor-Ms'] = f"{(time.perf_counter() - inicio) * 1000:.0f}"
    resposta.headers['X-Processo'] = f"{os.getpid()}{'-agenda' if globals().get('_ESTE_WORKER_AGENDA') else ''}"
    return resposta


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
            or caminho.startswith('/api/pedidos/confirmar/')
        ):
            # Link público: o token é a senha, então o teto de tentativa por
            # IP é o que existe no lugar do login (ver _token_bloqueado_*).
            if caminho not in ROTAS_API_PUBLICAS and _token_bloqueado_por_tentativa():
                return jsonify({"erro": "Muitas tentativas. Espere um minuto e abra o link de novo."}), 429
            return
        pessoa = _usuario_logado()
        if not pessoa:
            return jsonify({"erro": "Não autenticado."}), 401
        # Senha provisória: dá pra olhar o sistema, mas não pra mexer em nada
        # antes de escolher uma senha própria (QA 22/09).
        if (
            pessoa.get('trocar_senha')
            and request.method not in ('GET', 'HEAD', 'OPTIONS')
            and caminho not in ('/api/logout', '/api/me/senha')
        ):
            return jsonify({
                "erro": "Escolha uma senha sua antes de mexer no sistema — a que você recebeu é provisória.",
                "precisaTrocarSenha": True,
            }), 403
        return

    if caminho == '/' or caminho.endswith('.html'):
        nome_pagina = 'index.html' if caminho == '/' else caminho.lstrip('/')
        if nome_pagina in PAGINAS_PUBLICAS:
            return
        usuario = _usuario_logado()
        if not usuario:
            return redirect('/login.html')
        paginas = PAGINAS_POR_PAPEL.get(usuario['papel'])
        if paginas is not None and nome_pagina not in paginas:
            return redirect(PAGINA_INICIAL_POR_PAPEL.get(usuario['papel'], '/index.html'))

# --- REGISTRO DE AÇÕES (quem fez o quê) -------------------------------------
#
# Um gancho só, em vez de espalhar chamada por 80 rotas: toda requisição que
# muda alguma coisa (POST, PUT, DELETE) vira uma linha do registro, com quem
# fez, quando, o quê e se deu certo. Rota nova já nasce registrada.

CHAVES_SENSIVEIS_NO_REGISTRO = {'senha', 'senhaNova', 'senhaAtual', 'senha_hash', 'token'}
# "Sincronizar agora" ficava de fora do registro: ninguém sabia quem
# disparou, nem quando (QA 22/09).
ROTAS_SEM_REGISTRO = {'/api/logout'}

# Consulta não entra no registro (senão cada abertura de tela viraria linha),
# mas a consulta que TIRA DADO do sistema tem que deixar rastro: baixar o
# banco inteiro não deixava nenhum (QA 22/09).
GETS_QUE_ENTRAM_NO_REGISTRO = {
    '/api/admin/backup-completo': 'Baixou a cópia completa do sistema (.zip)',
    '/api/admin/backups/<nome>': 'Baixou uma cópia de segurança do banco',
}

DESCRICAO_DA_ACAO = {
    ('POST', '/api/login'): 'Entrou no sistema',
    ('PUT', '/api/me/senha'): 'Trocou a própria senha',
    ('POST', '/api/usuarios'): 'Cadastrou funcionário',
    ('PUT', '/api/usuarios/<int:usuario_id>'): 'Alterou funcionário',
    ('DELETE', '/api/usuarios/<int:usuario_id>'): 'Excluiu funcionário',
    ('POST', '/api/insumos'): 'Criou insumo',
    ('POST', '/api/insumos/lote'): 'Importou insumos em lote',
    ('PUT', '/api/insumos/<int:insumo_id>'): 'Editou o cadastro do insumo',
    ('DELETE', '/api/insumos/<int:insumo_id>'): 'Excluiu insumo',
    ('DELETE', '/api/insumos/<int:insumo_id>/lojas/<loja>'): 'Tirou um insumo de uma loja',
    ('POST', '/api/insumos/<int:insumo_id>/mesclar'): 'Juntou dois insumos',
    ('PUT', '/api/insumos/<int:insumo_id>/estoque/<loja>'): 'Alterou o estoque na mão',
    ('POST', '/api/insumos/<int:insumo_id>/entrada'): 'Registrou entrada de estoque',
    ('POST', '/api/insumos/quantidades-atuais/lote'): 'Atualizou o estoque em lote',
    ('POST', '/api/insumos/ajustes-quantidade-ideal/lote'): 'Ajustou a quantidade ideal em lote',
    ('PUT', '/api/insumos/<int:insumo_id>/quantidade-ideal'): 'Ajustou a quantidade ideal',
    ('DELETE', '/api/insumos/<int:insumo_id>/quantidade-ideal'): 'Removeu o ajuste de quantidade ideal',
    ('POST', '/api/insumos/por-loja'): 'Mudou os insumos que a loja usa',
    ('PUT', '/api/insumos/<int:insumo_id>/receita'): 'Alterou a receita da mistura',
    ('POST', '/api/contagens'): 'Abriu requisição de contagem',
    ('POST', '/api/contatos-contagem'): 'Cadastrou quem conta o estoque de uma loja',
    ('DELETE', '/api/contatos-contagem/<int:contato_id>'): 'Tirou alguém de quem conta o estoque',
    ('POST', '/api/contagens/<int:contagem_id>/aprovar'): 'Aprovou a contagem (mexe no estoque)',
    ('POST', '/api/contagens/<int:contagem_id>/reabrir'): 'Reabriu a contagem',
    ('POST', '/api/contagens/token/<token>/responder'): 'A loja preencheu a contagem pelo link',
    ('DELETE', '/api/requisicoes'): 'Excluiu uma requisição',
    ('POST', '/api/requisicoes/conferencia/aprovar'): 'Aprovou a conferência da requisição',
    ('POST', '/api/requisicoes/conferencia/gerar-cotacao'): 'Gerou a cotação a partir da requisição',
    ('PUT', '/api/requisicoes/conferencia/comprar'): 'Mudou quanto comprar na conferência',
    ('PUT', '/api/requisicoes/conferencia/destino'): 'Mudou um item entre pedido direto e cotação',
    ('PUT', '/api/requisicoes/conferencia/fornecedor-avulso'): 'Combinou um fornecedor só pra esta compra',
    ('POST', '/api/requisicoes/conferencia/gerar-pedidos'): 'Gerou os pedidos homologados da requisição',
    ('POST', '/api/requisicoes/conferencia/reaplicar-homologados'): 'Atualizou a compra com os homologados',
    ('POST', '/api/sincronizar-agora'): 'Mandou sincronizar as vendas agora',
    ('POST', '/api/cotacoes'): 'Criou cotação',
    ('PUT', '/api/cotacoes/<int:cotacao_id>'): 'Editou a cotação',
    ('DELETE', '/api/cotacoes/<int:cotacao_id>/itens/<int:insumo_id>'): 'Tirou um item da cotação',
    ('DELETE', '/api/cotacoes/<int:cotacao_id>'): 'Excluiu cotação',
    ('POST', '/api/cotacoes/<int:cotacao_id>/precos'): 'Lançou preço na cotação',
    ('PUT', '/api/cotacoes/<int:cotacao_id>/precos/<int:preco_id>/selecionar'): 'Escolheu o preço vencedor',
    ('POST', '/api/cotacoes/<int:cotacao_id>/selecionar-melhores-precos'): 'Selecionou os melhores preços',
    ('POST', '/api/cotacoes/<int:cotacao_id>/convites'): 'Gerou os convites da cotação',
    ('POST', '/api/cotacoes/convites/<int:convite_id>/reabrir'): 'Reabriu o convite de um fornecedor',
    ('PUT', '/api/cotacoes/convites/<int:convite_id>/prazo'): 'Estendeu o prazo do convite de um fornecedor',
    ('POST', '/api/cotacoes/convites/<int:convite_id>/enviado'): 'Mandou o convite de cotação pro fornecedor',
    ('POST', '/api/cotacoes/convite/<token>/responder'): 'O fornecedor respondeu a cotação pelo link',
    ('POST', '/api/cotacoes/<int:cotacao_id>/gerar-pedidos'): 'Gerou os pedidos da cotação',
    ('POST', '/api/pedidos/direto'): 'Criou pedido direto',
    ('POST', '/api/pedidos/compra-fora'): 'Lançou compra feita por fora',
    ('POST', '/api/pedidos/<int:pedido_id>/avancar'): 'Avançou a etapa do pedido',
    ('POST', '/api/pedidos/<int:pedido_id>/voltar'): 'Voltou a etapa do pedido',
    ('DELETE', '/api/pedidos/<int:pedido_id>'): 'Excluiu pedido',
    ('PUT', '/api/pedidos/<int:pedido_id>/itens'): 'Corrigiu os itens de um pedido',
    ('POST', '/api/pedidos/<int:pedido_id>/whatsapp-enviado'): 'Marcou o pedido como enviado no WhatsApp',
    ('POST', '/api/recebimentos/<int:pedido_id>/confirmar'): 'Confirmou recebimento (soma no estoque)',
    ('POST', '/api/pedidos/<int:pedido_id>/nota-fiscal'): 'Anexou a nota fiscal do pedido',
    ('PUT', '/api/itens-cardapio/<int:item_id>/ficha-tecnica'): 'Alterou a ficha técnica',
    ('POST', '/api/itens-cardapio'): 'Criou item de cardápio',
    ('DELETE', '/api/itens-cardapio/<int:item_id>'): 'Excluiu item de cardápio',
    ('PUT', '/api/itens-cardapio/<int:item_id>/custo'): 'Alterou o custo do item',
    ('POST', '/api/fornecedores'): 'Cadastrou fornecedor',
    ('PUT', '/api/fornecedores/<int:fornecedor_id>'): 'Editou fornecedor',
    ('POST', '/api/produtos-pendentes/vincular'): 'Vinculou produto vendido a um item',
    ('PUT', '/api/estoque/baixa-automatica'): 'Ligou ou desligou a baixa automática',
    ('POST', '/api/admin/limpar-requisicoes-cotacoes'): 'Limpou requisições e cotações (zona de perigo)',
    ('POST', '/api/admin/importar-vmarket'): 'Importou carga da VMarket',
    ('DELETE', '/api/admin/importar-vmarket'): 'Desfez a carga da VMarket',
    ('POST', '/api/admin/backups'): 'Gerou cópia de segurança',
    ('POST', '/api/tarefas'): 'Criou tarefa',
    ('PUT', '/api/tarefas/<int:tarefa_id>'): 'Alterou uma tarefa',
    ('DELETE', '/api/tarefas/<int:tarefa_id>'): 'Excluiu tarefa',
    ('POST', '/api/tarefas/<int:tarefa_id>/subtarefas'): 'Criou subtarefa',
    ('PUT', '/api/tarefas/<int:tarefa_id>/subtarefas/<int:subtarefa_id>'): 'Marcou ou desmarcou subtarefa',
    ('POST', '/api/tarefas/<int:tarefa_id>/comentarios'): 'Comentou numa tarefa',
    ('POST', '/api/venda-presencial'): 'Lançou venda presencial',
    ('DELETE', '/api/venda-presencial'): 'Excluiu venda presencial',
    ('PUT', '/api/ajuste-canal'): 'Ajustou o faturamento de um canal',
    ('DELETE', '/api/ajuste-canal'): 'Removeu o ajuste de um canal',
}


def _detalhes_da_requisicao():
    """Resumo do que foi mandado, sem senha nem token e sem crescer demais."""
    try:
        if request.mimetype == 'application/json':
            dados = request.get_json(silent=True) or {}
        else:
            dados = dict(request.form)
        if not isinstance(dados, dict):
            return None
        limpo = {c: v for c, v in dados.items() if c not in CHAVES_SENSIVEIS_NO_REGISTRO}
        if request.files:
            limpo['arquivos'] = list(request.files.keys())
        if not limpo:
            return None
        return json.dumps(limpo, ensure_ascii=False, default=str)[:800]
    except Exception:
        return None


def _anotar_no_registro(descricao):
    """Descrição melhor pro registro dessa requisição — pra ação em que o
    nome da rota não diz o que se perdeu."""
    g.descricao_da_acao = descricao


@app.after_request
def _registrar_acao_da_requisicao(resposta):
    """Nunca derruba a resposta: se o registro falhar, o que a pessoa pediu
    seguiu do mesmo jeito e o erro fica só no log do servidor."""
    try:
        regra_bruta = request.url_rule.rule if request.url_rule else request.path
        if request.method in ('GET', 'HEAD', 'OPTIONS') and regra_bruta not in GETS_QUE_ENTRAM_NO_REGISTRO:
            return resposta
        if not request.path.startswith('/api/') or request.path in ROTAS_SEM_REGISTRO:
            return resposta
        regra = regra_bruta
        descricao = getattr(g, 'descricao_da_acao', None) \
            or DESCRICAO_DA_ACAO.get((request.method, regra)) \
            or GETS_QUE_ENTRAM_NO_REGISTRO.get(regra) or f"{request.method} {regra}"
        if request.path == '/api/login' and resposta.status_code != 200:
            descricao = 'Tentativa de login que não entrou'
        registrar_acao(
            _usuario_logado(), request.method, regra, request.path,
            resposta.status_code, descricao, _detalhes_da_requisicao(),
        )
    except Exception:
        import traceback
        print("❌ Falha ao registrar a ação:")
        traceback.print_exc()
    return resposta


# Quanto tempo sem batimento até outro worker assumir o agendamento.
SEGUNDOS_BATIMENTO_AGENDADOR = 120
SEGUNDOS_TRAVA_PARADA = 600


def _sou_o_unico_worker_a_agendar():
    """Em produção o Gunicorn roda vários workers (processos separados), e
    cada um carrega esse arquivo do zero — sem essa trava, cada worker criaria
    seu próprio agendador, multiplicando as sincronizações (e estourando o
    limite de requisição da Cardápio Web, causando sincronizações incompletas
    no meio do dia). O arquivo de trava é criado uma vez só por processo do
    container (some no próximo deploy/restart, já que a pasta temporária é
    recriada). No Windows (desenvolvimento) a pasta temporária é outra, daí o
    gettempdir em vez de "/tmp" na unha."""
    # A trava tem batimento: o worker que agenda reescreve a hora de tempos em
    # tempos, e um worker novo assume quando a trava está parada. Antes o
    # arquivo era criado uma vez e nunca solto — se aquele processo fosse
    # reiniciado, o substituto achava a trava e desistia, e paravam JUNTAS a
    # sincronização de 15 em 15 minutos, a das 3h e a cópia das 3h30, sem
    # ninguém perceber (QA 22/09).
    caminho_trava = os.path.join(tempfile.gettempdir(), "admfood_scheduler.lock")
    agora = time.time()
    try:
        with io.open(caminho_trava, encoding="utf-8") as arquivo:
            batimento = float(arquivo.read().split()[-1])
        if agora - batimento < SEGUNDOS_TRAVA_PARADA:
            return False
    except (OSError, ValueError, IndexError):
        pass
    try:
        with io.open(caminho_trava, "w", encoding="utf-8") as arquivo:
            arquivo.write(f"{os.getpid()} {agora}")
        return True
    except OSError:
        # Sem pasta temporária gravável não dá pra coordenar os workers; melhor
        # não agendar nada do que agendar em todos ao mesmo tempo.
        return False


def _bater_ponto_do_agendador():
    """Diz que o worker que agenda continua vivo (ver _sou_o_unico_worker_a_agendar)."""
    try:
        with io.open(os.path.join(tempfile.gettempdir(), "admfood_scheduler.lock"), "w", encoding="utf-8") as arquivo:
            arquivo.write(f"{os.getpid()} {time.time()}")
    except OSError:
        pass


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
# Evita agendar duas vezes por causa do reloader do modo debug, e evita
# agendar em mais de um worker do Gunicorn ao mesmo tempo. Fica numa variável
# porque a trava só pode ser tirada uma vez por processo — a sincronização e o
# backup dividem a mesma resposta.
_ESTE_WORKER_AGENDA = (
    (not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true")
    and _sou_o_unico_worker_a_agendar()
)

if os.environ.get("SINCRONIZACAO_AUTOMATICA", "false").lower() == "true":
    if _ESTE_WORKER_AGENDA:
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
            marcar_execucao_rotina("sincronizacao_diaria", f"{DIAS_RECONFERIDOS_NA_SINCRONIZACAO_DIARIA} dias reconferidos")

        def _rodar_sincronizacao_hoje():
            sincronizar_dia(date.today())
            # De madrugada, o dia operacional das lojas que viram às 5h ainda
            # é o de ontem: sem isso, a venda das 2h só apareceria na
            # reconferência da noite seguinte (25/09).
            viradas = horas_virada_das_lojas().values()
            maior_virada = max((int(h.split(":")[0]) for h in viradas), default=0)
            if datetime.now().hour < maior_virada:
                sincronizar_dia(date.today() - timedelta(days=1))
            marcar_execucao_rotina("sincronizacao_hoje", date.today().isoformat())

        _scheduler = BackgroundScheduler(timezone="America/Sao_Paulo")
        # 6h, não 3h: às 3h as lojas que viram às 5h ainda estão vendendo, e
        # a reconferência fecharia o dia pela metade (25/09).
        _scheduler.add_job(_rodar_sincronizacao_diaria, "cron", hour=6, minute=0)
        _scheduler.add_job(
            _rodar_sincronizacao_hoje, "interval", minutes=15, next_run_time=datetime.now()
        )
        _scheduler.add_job(_bater_ponto_do_agendador, "interval", seconds=SEGUNDOS_BATIMENTO_AGENDADOR)
        _scheduler.start()

# Cópia de segurança do banco, todo dia às 3h30 (depois da sincronização das
# 3h, pra guardar o dia já fechado). Desligável com BACKUP_AUTOMATICO=false.
HORA_DO_BACKUP = (3, 30)

if os.environ.get("BACKUP_AUTOMATICO", "true").lower() == "true" and _ESTE_WORKER_AGENDA:
    from apscheduler.schedulers.background import BackgroundScheduler as _AgendadorBackup

    _scheduler_backup = _AgendadorBackup(timezone="America/Sao_Paulo")
    _scheduler_backup.add_job(
        rodar_backup_diario, "cron", hour=HORA_DO_BACKUP[0], minute=HORA_DO_BACKUP[1]
    )
    # O registro de ações guarda um ano; a faxina vai junto da madrugada.
    _scheduler_backup.add_job(limpar_registro_acoes_antigos, "cron", hour=3, minute=45)
    _scheduler_backup.add_job(_bater_ponto_do_agendador, "interval", seconds=SEGUNDOS_BATIMENTO_AGENDADOR)
    _scheduler_backup.start()

# Lojas que registram vendas presenciais (não passam pela Cardápio Web e
# precisam ser lançadas manualmente).
UNIDADES_COM_PRESENCIAL = {"Hamburgueria Artesanos", "Tradiça ZN"}


def _aplicar_presencial(linhas, linhas_presencial):
    """Soma a venda presencial lançada à mão no dia da loja. Lançamento sem
    quantidade entra no faturamento mas não tem pedido pra somar, e o ticket
    médio do dia (faturamento ÷ pedidos) sai inflado — a linha passa a
    carregar `presencialSemQuantidade` pra tela poder marcar isso em vez de
    mostrar um ticket que ninguém consegue explicar (QA 22/09)."""
    por_chave = {(l["unidade"], l["dia"]): l for l in linhas}
    for p in linhas_presencial:
        chave = (p["unidade"], p["dia"])
        qtd_presencial = p.get("quantidade") or 0
        if chave in por_chave:
            linha = por_chave[chave]
            if p["valor"]:
                linha["fechado"] = 0  # teve venda, então não estava fechada
            linha["faturamento_dia"] += p["valor"]
            linha["quantidade_pedidos"] += qtd_presencial
            linha["ticket_medio"] = (
                linha["faturamento_dia"] / linha["quantidade_pedidos"]
                if linha["quantidade_pedidos"] else 0.0
            )
            if not qtd_presencial and p["valor"]:
                linha["presencial_sem_quantidade"] = round(p["valor"], 2)
        else:
            por_chave[chave] = {
                "unidade": p["unidade"],
                "dia": p["dia"],
                "faturamento_dia": p["valor"],
                "ticket_medio": p["valor"] / qtd_presencial if qtd_presencial else 0.0,
                "quantidade_pedidos": qtd_presencial,
                "presencial_sem_quantidade": round(p["valor"], 2) if not qtd_presencial and p["valor"] else None,
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
            # Venda presencial lançada sem quantidade: o valor entra no
            # faturamento e nenhum pedido entra, então o ticket do dia fica
            # inflado — a tela marca em vez de mentir (QA 22/09).
            "presencialSemQuantidade": l.get("presencial_sem_quantidade"),
            # R$ 0,00 de loja fechada é diferente de R$ 0,00 de dia que não
            # sincronizou — a tela escreve "fechada" em vez do zero seco.
            "fechada": bool(l.get("fechado")),
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


def _montar_bloco(unidade_filtro, linhas_periodo, titulo, linhas_canais, canal_data_label,
                  periodo=None):
    base = linhas_periodo if unidade_filtro is None else [l for l in linhas_periodo if l["unidade"] == unidade_filtro]

    diario = sorted(base, key=lambda l: (l["dia"], l["unidade"]), reverse=True)
    canais = _agregar_canais(linhas_canais, unidade_filtro)

    return {
        "title": titulo,
        "canalDataLabel": canal_data_label,
        "diario": _formatar_diario(diario),
        "canais": _formatar_canais(canais),
        # Dia sem linha nenhuma simplesmente não aparecia, e o período parecia
        # completo: o card ficava menor sem nada dizer (QA 22/09).
        **_faltas_do_periodo(base, periodo, unidade_filtro),
    }


def _faltas_do_periodo(linhas, periodo, unidade_filtro):
    """Dias do período que não têm faturamento nenhum (não sincronizaram) e
    o dia de hoje, que está pela metade por definição."""
    if not periodo:
        return {}
    inicio, fim = periodo
    hoje = date.today()
    lojas = [unidade_filtro] if unidade_filtro else list(LOJAS.keys())
    com_dado = {(l["dia"], l["unidade"]) for l in linhas}
    faltando = []
    dia = inicio
    while dia <= fim:
        if dia < hoje and any((dia.isoformat(), loja) not in com_dado for loja in lojas):
            faltando.append(dia.isoformat())
        dia += timedelta(days=1)
    return {
        "diasFaltando": faltando,
        "temDiaParcial": inicio <= hoje <= fim,
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


# Senha de 6 caracteres passava, e "123456" é 6 caracteres. A regra agora é
# uma só, usada no cadastro, no reset do admin e na troca pela própria pessoa
# (QA 22/09). Quem já tem senha curta continua entrando; a exigência vale na
# próxima vez que alguém digitar uma senha nova.
TAMANHO_MINIMO_SENHA = 8
SENHAS_OBVIAS = {
    "12345678", "123456789", "1234567890", "senha123", "password", "admfood123",
    "artesanos", "qwertyui", "11111111", "abcd1234",
}


def forca_da_senha(senha):
    """0 a 4 — a mesma conta que a tela mostra na barrinha."""
    senha = senha or ""
    pontos = 0
    if len(senha) >= TAMANHO_MINIMO_SENHA:
        pontos += 1
    if len(senha) >= 12:
        pontos += 1
    if any(c.isalpha() for c in senha) and any(c.isdigit() for c in senha):
        pontos += 1
    if any(not c.isalnum() for c in senha) or (
        any(c.islower() for c in senha) and any(c.isupper() for c in senha)
    ):
        pontos += 1
    return pontos


def _erro_da_senha(senha):
    """Mensagem de recusa, ou None se a senha serve."""
    senha = senha or ""
    if len(senha) < TAMANHO_MINIMO_SENHA:
        return f"A senha precisa ter pelo menos {TAMANHO_MINIMO_SENHA} caracteres."
    if senha.lower() in SENHAS_OBVIAS:
        return "Essa senha é das primeiras que qualquer um tenta. Escolha outra."
    if senha.isdigit() or senha.isalpha():
        return "Misture letras e números na senha."
    return None


def _texto_curto_sem_marcacao(valor, limite=20, padrao=""):
    """Campo curto que a tela imprime: tira marcação e corta o tamanho. A
    unidade de medida é digitada à mão e sai em várias telas — sem isso, dava
    pra guardar `<img onerror=...>` como unidade de um insumo e ele executar
    na tela de quem abrisse (XSS armazenado)."""
    limpo = re.sub(r"[<>\"\'`\\]", "", str(valor or "")).strip()
    return limpo[:limite] or padrao


def _formatar_usuario(usuario):
    return {
        "id": usuario["id"],
        "nome": usuario["nome"],
        "email": usuario["email"],
        "papel": usuario["papel"],
        "loja": usuario["loja"] or None,
        # Senha que o admin escolheu é provisória: a tela pede uma nova antes
        # de deixar usar o sistema (QA 22/09).
        "precisaTrocarSenha": bool(usuario.get("trocar_senha")),
        "diasDeSessao": DIAS_DE_SESSAO,
    }


# Limite de tentativas de login por e-mail — em memória (por worker do
# Gunicorn, não compartilhado entre eles), suficiente pra travar um script
# tentando milhares de senhas contra uma conta específica, sem precisar de
# Redis ou outra dependência nova pra um sistema desse tamanho.
# Os links públicos (contagem, cotação, confirmar pedido) não pedem login: o
# token é a senha. Ele tem 192 bits de entropia (secrets.token_urlsafe(24)),
# então adivinhar é inviável — mas nada impedia um script de tentar milhares
# por minuto, o que além de inútil derruba o servidor. Um teto por IP resolve
# os dois. Em memória, por processo, igual ao limite de login: suficiente pro
# tamanho deste sistema, sem Redis.
# Teto de sanidade pro preço que vem de fora: acima disso é unidade trocada
# (preço da caixa no campo do grama), não preço.
LIMITE_PRECO_UNITARIO = 1_000_000
# Teto da quantidade contada no link da loja. Não existe insumo em gramas
# que chegue nisso; o que chega é dedo no teclado ou requisição forjada.
LIMITE_QUANTIDADE_CONTAGEM = 10_000_000

TENTATIVAS_MAXIMAS_TOKEN = 30
JANELA_RATE_LIMIT_TOKEN_SEGUNDOS = 60
_tentativas_de_token = {}
_TRAVA_TENTATIVAS_TOKEN = threading.Lock()


def _ip_de_quem_chamou():
    """O IP real quando há proxy na frente (Fly/Render põem X-Forwarded-For)."""
    encaminhado = request.headers.get('X-Forwarded-For', '')
    return (encaminhado.split(',')[0].strip() if encaminhado else request.remote_addr) or 'desconhecido'


def _token_bloqueado_por_tentativa():
    """True quando esse IP já pediu link demais na última janela."""
    agora = time.time()
    ip = _ip_de_quem_chamou()
    with _TRAVA_TENTATIVAS_TOKEN:
        tentativas = [t for t in _tentativas_de_token.get(ip, []) if agora - t < JANELA_RATE_LIMIT_TOKEN_SEGUNDOS]
        tentativas.append(agora)
        _tentativas_de_token[ip] = tentativas
        # Limpeza preguiçosa: sem isso o dicionário cresce pra sempre.
        if len(_tentativas_de_token) > 2000:
            for chave in [c for c, v in _tentativas_de_token.items() if not v or agora - v[-1] > JANELA_RATE_LIMIT_TOKEN_SEGUNDOS]:
                _tentativas_de_token.pop(chave, None)
        return len(tentativas) > TENTATIVAS_MAXIMAS_TOKEN


JANELA_RATE_LIMIT_LOGIN_SEGUNDOS = 5 * 60
MAX_TENTATIVAS_LOGIN_NA_JANELA = 5


def _login_bloqueado(email):
    # Sempre em minúsculas: a contagem usava o e-mail como foi digitado e a
    # busca no banco é minúscula, então trocar uma letra pra maiúscula zerava
    # o bloqueio (QA 22/09).
    # As tentativas moram no banco: em memória, o contador valia por
    # processo, e a produção roda com dois gunicorn — o limite dobrava
    # (QA 22/09).
    desde = (datetime.now() - timedelta(seconds=JANELA_RATE_LIMIT_LOGIN_SEGUNDOS)).isoformat()
    return contar_falhas_de_login(email, desde) >= MAX_TENTATIVAS_LOGIN_NA_JANELA


def _registrar_falha_login(email):
    agora = datetime.now()
    registrar_falha_de_login(
        email,
        agora.isoformat(),
        limpar_antes_de=(agora - timedelta(seconds=JANELA_RATE_LIMIT_LOGIN_SEGUNDOS * 10)).isoformat(),
    )


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

    limpar_falhas_de_login(email)
    session.clear()
    session['usuario_id'] = usuario['id']
    session['sessao_versao'] = usuario.get('sessao_versao') or 0
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
    erro_senha = _erro_da_senha(senha_nova)
    if erro_senha:
        return jsonify({"erro": erro_senha}), 400
    if senha_nova == senha_atual:
        return jsonify({"erro": "A senha nova precisa ser diferente da atual."}), 400

    atualizar_usuario(usuario['id'], {'senha_hash': gerar_hash_senha(senha_nova), 'trocar_senha': 0})
    return jsonify({"sucesso": True})


@app.route('/api/me/sair-de-todos', methods=['POST'])
def api_sair_de_todos_os_aparelhos():
    """Derruba a sessão desta pessoa em todo aparelho, inclusive neste.
    Celular emprestado no salão continuava logado por 7 dias e não havia como
    tirar de longe (QA 22/09)."""
    usuario = _usuario_logado()
    if not usuario:
        return jsonify({"erro": "Não autenticado."}), 401
    encerrar_sessoes_do_usuario(usuario['id'])
    session.clear()
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
        "loja": usuario["loja"] or None,
        "ativo": bool(usuario["ativo"]),
        "criadoEm": usuario["criado_em"],
        "senhaProvisoria": bool(usuario.get("trocar_senha")),
    }


def _papel_e_loja_do_formulario(dados, papel_atual=None, loja_atual=None):
    """Lê perfil e loja da tela de Funcionários. Admin enxerga a rede inteira,
    então não tem loja; gerente e operação precisam de uma."""
    papel = dados.get('papel') if 'papel' in dados else papel_atual
    if papel not in PAPEIS:
        return None, None, jsonify({"erro": "Perfil inválido."}), 400
    if papel == 'admin':
        return papel, None, None, None
    loja = dados.get('loja') if 'loja' in dados else loja_atual
    loja = (loja or '').strip()
    if loja not in LOJAS:
        return None, None, jsonify({"erro": "Escolha a loja do funcionário."}), 400
    return papel, loja, None, None


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
    papel, loja, erro_papel, status = _papel_e_loja_do_formulario(dados, papel_atual='operacao')
    if erro_papel:
        return erro_papel, status

    if not nome or not email:
        return jsonify({"erro": "Informe nome e e-mail."}), 400
    erro_senha = _erro_da_senha(senha)
    if erro_senha:
        return jsonify({"erro": erro_senha}), 400
    if buscar_usuario_por_email(email):
        return jsonify({"erro": "Já existe um usuário com esse e-mail."}), 400

    # A senha que o admin digita aqui passa pelo WhatsApp e fica anotada em
    # algum lugar: ela serve pra primeira entrada, não pra sempre (QA 22/09).
    usuario_id = criar_usuario(nome, email, gerar_hash_senha(senha), papel, loja, trocar_senha=True)
    return jsonify({"usuario": _formatar_membro_equipe(buscar_usuario_por_id(usuario_id))})


@app.route('/api/usuarios/<int:usuario_id>', methods=['PUT'])
def api_atualizar_usuario(usuario_id):
    erro = _exigir_admin()
    if erro:
        return erro

    usuario_alvo = buscar_usuario_por_id(usuario_id)
    if not usuario_alvo:
        return jsonify({"erro": "Usuário não encontrado."}), 404

    dados = request.get_json(silent=True) or {}
    campos = {}
    if 'nome' in dados:
        if not (dados.get('nome') or '').strip():
            return jsonify({"erro": "Nome não pode ficar vazio."}), 400
        campos['nome'] = dados['nome'].strip()
    if 'papel' in dados or 'loja' in dados:
        papel, loja, erro_papel, status = _papel_e_loja_do_formulario(
            dados, papel_atual=usuario_alvo['papel'], loja_atual=usuario_alvo['loja']
        )
        if erro_papel:
            return erro_papel, status
        campos['papel'] = papel
        campos['loja'] = loja
    if 'ativo' in dados:
        campos['ativo'] = 1 if dados['ativo'] else 0
    if 'senha' in dados and dados['senha']:
        erro_senha = _erro_da_senha(dados['senha'])
        if erro_senha:
            return jsonify({"erro": erro_senha}), 400
        campos['senha_hash'] = gerar_hash_senha(dados['senha'])
        # Senha redefinida pelo admin é provisória: a pessoa troca na entrada.
        campos['trocar_senha'] = 1

    if not campos:
        return jsonify({"erro": "Nada pra atualizar."}), 400

    # Impede o admin de se autodesativar/rebaixar por engano e ficar trancado
    # pra fora da própria gestão de equipe.
    usuario_logado = _usuario_logado()
    if usuario_logado['id'] == usuario_id:
        if campos.get('ativo') == 0:
            return jsonify({"erro": "Você não pode desativar a si mesmo."}), 400
        if 'papel' in campos and campos['papel'] != 'admin':
            return jsonify({"erro": "Você não pode remover seu próprio acesso de admin."}), 400

    # Sem isto, dois admins com a tela aberta podiam se rebaixar ao mesmo
    # tempo e ninguém mais entrava na gestão de equipe (QA 22/09).
    try:
        atualizar_usuario(usuario_id, campos)
    except ValueError as recusa:
        return jsonify({"erro": str(recusa)}), 400
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

    try:
        excluir_usuario(usuario_id)
    except ValueError as recusa:
        return jsonify({"erro": str(recusa)}), 400
    return jsonify({"sucesso": True})


# --- CÓPIA DE SEGURANÇA DO BANCO (só admin) ---------------------------------
#
# O banco é um arquivo só no volume do Dokploy. A cópia diária (3h30) protege
# contra erro de operação e contra o arquivo corromper; contra perder o
# servidor, só a cópia que a pessoa baixa e guarda fora daqui.

NOME_DE_BACKUP = re.compile(r"^admfood-\d{4}-\d{2}-\d{2}\.db$")


# Home (2026-09-18, dois pedidos dela no mesmo dia). O cartão de faturamento
# de ontem repetia o quadro preto e a lista de sincronização ocupava meia tela
# pra dizer "em dia". No lugar: saúde financeira do mês, estoque crítico,
# atividades do dia, a Curva A da rede, as altas de custo que comem margem e
# uma linha de insight dentro do quadro. Só das lojas que a pessoa enxerga.
DIAS_DA_HOME = 30
PONTOS_DE_MARGEM_PERIGOSOS = 2
VARIACAO_FATURAMENTO_INSIGHT_PCT = 15
# Curva ABC de 3 janelas × 4 lojas pesa (~1 s): a análise fica guardada 5
# minutos em cada processo; estoque e atividades do dia são sempre na hora.
TEMPO_CACHE_ANALISE_HOME_S = 300
# Quantos escopos de loja cabem ao mesmo tempo (admin vê 4, cada gerente vê a
# dele): 8 cobre a rede inteira sem virar memória à toa.
MAXIMO_CACHE_ANALISE_HOME = 8
_cache_analise_home = {}

NOME_CURTO_LOJA = {"Hamburgueria Artesanos": "Artesanos"}
DIAS_DA_SEMANA_PLURAL = ["segundas", "terças", "quartas", "quintas", "sextas", "sábados", "domingos"]
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
         "setembro", "outubro", "novembro", "dezembro"]


def _curto(loja):
    return NOME_CURTO_LOJA.get(loja, loja)


def _num_br(valor, casas=1):
    """25.0 → "25", 9.14 → "9,1"."""
    texto = f"{valor:.{casas}f}"
    if "." in texto:
        texto = texto.rstrip("0").rstrip(".")
    return texto.replace(".", ",")


def _plural(n, singular, plural):
    return singular if n == 1 else plural


def _sincronizacao_em_dia(ultimo_dia_iso, hoje):
    """Em dia = tem venda de ontem (ou de hoje). Segunda as lojas fecham, então
    na terça o último dia com venda é domingo."""
    if not ultimo_dia_iso:
        return False
    ontem = hoje - timedelta(days=1)
    minimo = ontem - timedelta(days=1) if ontem.weekday() == 0 else ontem
    return ultimo_dia_iso >= minimo.isoformat()


def _analise_da_home(lojas):
    hoje = date.today()
    chave = (tuple(lojas), hoje.isoformat())
    guardado = _cache_analise_home.get(chave)
    if guardado and time.time() - guardado[0] < TEMPO_CACHE_ANALISE_HOME_S:
        return guardado[1]

    corte_atual = (datetime.now() - timedelta(days=DIAS_DA_HOME)).date().isoformat()
    dias_do_mes = (hoje - hoje.replace(day=1)).days
    atual, anterior, mes = {}, {}, {}
    for loja in lojas:
        atual[loja] = curva_abc_cardapio(loja, DIAS_DA_HOME)["itens"]
        anterior[loja] = curva_abc_cardapio(loja, DIAS_DA_HOME, ate=corte_atual)["itens"]
        mes[loja] = curva_abc_cardapio(loja, dias_do_mes)["itens"] if dias_do_mes else atual[loja]

    # Saúde financeira: CMV de ficha técnica × custo das compras, sobre o que
    # tem custo; a cobertura diz quanto do faturamento isso representa.
    receita_total = receita_com_custo = custo_total = 0.0
    for loja in lojas:
        for item in mes[loja]:
            receita_total += item["receita"]
            if item["margem"] is not None:
                receita_com_custo += item["receita"]
                custo_total += item["receita"] - item["margem"]
    cmv = round(custo_total / receita_com_custo * 100, 1) if receita_com_custo else None
    saude = {
        "periodo": f"{MESES[hoje.month - 1].capitalize()} até hoje" if dias_do_mes else "Últimos 30 dias",
        "cmvPercent": cmv,
        "margemBrutaPercent": round(100 - cmv, 1) if cmv is not None else None,
        "coberturaPercent": round(receita_com_custo / receita_total * 100) if receita_total else 0,
        # A régua do Vendas Semanais trabalha em fração (0,31), não em %.
        "classificacao": _classificar_cmv(cmv / 100) if cmv is not None else None,
    }

    # Curva A da rede: o mesmo produto nas duas Tradiças soma numa linha só.
    produtos = {}
    for loja in lojas:
        for item in atual[loja]:
            if item["curva"] != "A":
                continue
            produto = produtos.setdefault(item["nome"], {
                "nome": item["nome"], "lojas": [], "margem": 0.0, "receita": 0.0, "volume": 0.0,
            })
            produto["lojas"].append(loja)
            produto["margem"] += item["margem"]
            produto["receita"] += item["receita"]
            produto["volume"] += item["volume"]
    curva_a = sorted(produtos.values(), key=lambda p: -p["margem"])[:3]
    for produto in curva_a:
        produto["cmvPercent"] = (
            round((produto["receita"] - produto["margem"]) / produto["receita"] * 100, 1)
            if produto["receita"] else None
        )
        for campo in ("margem", "receita", "volume"):
            produto[campo] = round(produto[campo], 2)

    alertas = alertas_de_custo_na_margem(lojas, DIAS_DA_HOME, limite=10)
    for alerta in alertas:
        alerta["perigoso"] = alerta["pontosDeMargem"] >= PONTOS_DE_MARGEM_PERIGOSOS

    # Insights: frases feitas a partir dos números, da mais urgente pra menos.
    insights = []
    for alerta in alertas:
        if alerta["pontosDeMargem"] < 1:
            continue
        insights.append((0 if alerta["perigoso"] else 3, {
            "tipo": "custo",
            "texto": (
                f"{alerta['insumo']} subiu {_num_br(alerta['variacaoPct'])}% e tirou "
                f"{_num_br(alerta['pontosDeMargem'])} {_plural(alerta['pontosDeMargem'], 'ponto', 'pontos')} "
                f"da margem do item “{alerta['produto']}” ({_curto(alerta['loja'])}). Avalie reajustar o preço."
            ),
            "link": "precos.html",
        }))
    for loja in lojas:
        volume_agora = sum(i["volume"] for i in atual[loja])
        volume_antes = sum(i["volume"] for i in anterior[loja])
        # Sem venda registrada na janela anterior, tudo pareceria "novo na A".
        if not volume_agora or volume_antes < volume_agora * 0.5:
            continue
        a_antes = {i["nome"] for i in anterior[loja] if i["curva"] == "A"}
        a_agora = {i["nome"] for i in atual[loja] if i["curva"] == "A"}
        entraram = sorted((i for i in atual[loja] if i["nome"] in a_agora - a_antes), key=lambda i: -i["margem"])
        for item in entraram[:2]:
            insights.append((1, {
                "tipo": "curva",
                "texto": (
                    f"O item “{item['nome']}” subiu para a Curva A na {_curto(loja)}. "
                    "Avalie reajuste de preço para proteger sua margem."
                ),
                "link": "curva-abc.html",
            }))
        volumes_antes = {i["nome"]: i["volume"] for i in anterior[loja]}
        volumes_agora = {i["nome"]: i["volume"] for i in atual[loja]}
        for nome in sorted(a_antes - a_agora):
            antes = volumes_antes.get(nome) or 0
            queda = round((1 - volumes_agora.get(nome, 0) / antes) * 100) if antes else 0
            if queda <= 0:
                continue
            insights.append((4, {
                "tipo": "curva",
                "texto": (
                    f"O item “{nome}” saiu da Curva A na {_curto(loja)}: vendeu {queda}% menos "
                    "que nos 30 dias anteriores."
                ),
                "link": "curva-abc.html",
            }))

    ontem = hoje - timedelta(days=1)
    if ontem.weekday() != 0:  # segunda as lojas fecham
        base = [ontem - timedelta(weeks=semanas) for semanas in range(1, 5)]
        valores = faturamento_por_loja_nos_dias([d.isoformat() for d in (ontem, *base)])
        maiores = []
        for loja in lojas:
            valor_ontem = valores.get((loja, ontem.isoformat()))
            anteriores = [valores[(loja, d.isoformat())] for d in base if (loja, d.isoformat()) in valores]
            if valor_ontem is None or len(anteriores) < 2:
                continue
            media = sum(anteriores) / len(anteriores)
            variacao = (valor_ontem - media) / media * 100 if media > 0 else 0
            if abs(variacao) >= VARIACAO_FATURAMENTO_INSIGHT_PCT:
                maiores.append((abs(variacao), loja, variacao, len(anteriores)))
        if maiores:
            _, loja, variacao, semanas = max(maiores)
            insights.append((2, {
                "tipo": "vendas",
                "texto": (
                    f"Ontem a loja {_curto(loja)} faturou {abs(round(variacao))}% "
                    f"{'abaixo' if variacao < 0 else 'acima'} da média das últimas {semanas} "
                    f"{DIAS_DA_SEMANA_PLURAL[ontem.weekday()]}."
                ),
                "link": "insight.html",
            }))
    insights.sort(key=lambda par: par[0])

    resultado = {
        "saudeFinanceira": saude,
        "curvaA": curva_a,
        "custosEmAlta": alertas[:3],
        "insights": [par[1] for par in insights[:4]],
    }
    # Guardava UMA entrada só: com admin (4 lojas) e gerente (1 loja) na Home
    # ao mesmo tempo, um expulsava o outro e a Curva ABC de 3 janelas × 4
    # lojas era refeita a cada chamada (QA 22/09). Agora cabem alguns
    # escopos, e o que é de outro dia (ou mais velho) sai primeiro.
    hoje_iso = hoje.isoformat()
    for chave_velha in [c for c in _cache_analise_home if c[1] != hoje_iso]:
        _cache_analise_home.pop(chave_velha, None)
    while len(_cache_analise_home) >= MAXIMO_CACHE_ANALISE_HOME:
        mais_velha = min(_cache_analise_home, key=lambda c: _cache_analise_home[c][0])
        _cache_analise_home.pop(mais_velha, None)
    _cache_analise_home[chave] = (time.time(), resultado)
    return resultado


def _atividades_do_dia(lojas, usuario):
    """Checklist da rotina de quem gere: o que está pendente vem primeiro, com
    o link de onde resolver; o que já está feito aparece riscado."""
    hoje = date.today()
    ontem = hoje - timedelta(days=1)
    numeros = numeros_da_rotina(lojas, usuario["id"], ontem.isoformat(), hoje.isoformat())
    pendentes, feitas = [], []
    papel = usuario.get("papel")
    paginas = PAGINAS_POR_PAPEL.get(papel)

    # Operação passou a ver a Home (23/09): tarefa que ela não tem como fazer
    # — porque a tela é de outro perfil — não entra na lista dela.
    def pode_fazer(link, acao):
        if acao == "sincronizar":
            return papel == "admin"
        if not link or paginas is None:
            return True
        return link.split("#")[0].split("?")[0] in paginas

    def atividade(pendente, texto, link=None, acao=None):
        if not pode_fazer(link, acao):
            return
        (pendentes if pendente else feitas).append({"pendente": pendente, "texto": texto, "link": link, "acao": acao})

    atrasadas = [l for l in lojas if not _sincronizacao_em_dia(ultimo_dia_sincronizado(l), hoje)]
    atividade(
        bool(atrasadas),
        f"Sincronizar as vendas de ontem: {', '.join(_curto(l) for l in atrasadas)}" if atrasadas
        else "Vendas de ontem sincronizadas",
        acao="sincronizar" if atrasadas else None,
    )

    com_presencial = [l for l in lojas if l in UNIDADES_COM_PRESENCIAL]
    if com_presencial and ontem.weekday() != 0:
        faltando = [l for l in com_presencial if l not in numeros["presencialLancado"]]
        atividade(
            bool(faltando),
            f"Lançar a venda presencial de ontem: {', '.join(_curto(l) for l in faltando)}" if faltando
            else "Venda presencial de ontem lançada",
            link="insight.html#panel-vendas-presenciais" if faltando else None,
        )

    compras = pendencias_compras()
    tarefas_compras = [
        (compras["contagensPraAprovar"], "Aprovar {n} requisição", "Aprovar {n} requisições", "contagens.html"),
        (compras["cotacoesParadas"], "Fechar {n} cotação parada", "Fechar {n} cotações paradas", "cotacoes.html"),
        (compras["pedidosNaoEnviados"], "Enviar {n} pedido ao fornecedor", "Enviar {n} pedidos aos fornecedores", "pedidos.html"),
        (compras["entregasAtrasadas"], "Cobrar {n} entrega atrasada", "Cobrar {n} entregas atrasadas", "recebimentos.html"),
        # Pedido nunca recebido ficava contando como "entrega atrasada" pra
        # sempre. Depois de um mês não é mais cobrar o fornecedor: é
        # confirmar que chegou ou cancelar (QA 22/09).
        (compras["entregasAbandonadas"],
         "Confirmar ou cancelar {n} pedido parado há mais de " + str(compras["diasEntregaAbandonada"]) + " dias",
         "Confirmar ou cancelar {n} pedidos parados há mais de " + str(compras["diasEntregaAbandonada"]) + " dias",
         "pedidos.html"),
    ]
    for quantidade, singular, plural, link in tarefas_compras:
        if quantidade:
            atividade(True, _plural(quantidade, singular, plural).format(n=quantidade), link=link)
    if not any(tarefa[0] for tarefa in tarefas_compras):
        atividade(False, "Compras sem pendência")

    if numeros["vendasNovasSemVinculo"]:
        n = numeros["vendasNovasSemVinculo"]
        atividade(True, f"Conciliar {n} {_plural(n, 'produto novo vendido', 'produtos novos vendidos')} sem ficha técnica",
                  link="mais-vendidos.html#painel-integracoes-estoque")
    if numeros["lotesVencendo"]:
        n = numeros["lotesVencendo"]
        atividade(True, f"Resolver {n} {_plural(n, 'lote vencendo', 'lotes vencendo')}", link="estoque.html")
    if numeros["tarefasNoPrazo"]:
        n = numeros["tarefasNoPrazo"]
        atividade(True, f"Concluir {n} {_plural(n, 'tarefa', 'tarefas')} do ClickUp com prazo até hoje", link="clickup.html")

    return pendentes + feitas


@app.route('/api/home/gestao', methods=['GET'])
def api_home_gestao():
    erro_acesso = _exigir_equipe()
    if erro_acesso:
        return erro_acesso
    lojas = [loja for loja in LOJAS if _loja_visivel(loja)]

    # Mesma regra dos cartões de Insumos (zerado ou abaixo do mínimo), loja
    # por loja: somar a rede esconderia a loja zerada atrás da que tem sobra.
    criticos = {loja: {"loja": loja, "criticos": 0, "zerados": 0} for loja in lojas}
    for linha in listar_insumos():
        contagem = criticos.get(linha["loja"])
        if not contagem or linha["eh_mistura"] or not linha["aplica"]:
            continue
        if _status_estoque(linha["quantidade_atual"], linha["estoque_minimo"]) == "critico":
            contagem["criticos"] += 1
            if linha["quantidade_atual"] <= 0:
                contagem["zerados"] += 1

    resposta = {
        "dias": DIAS_DA_HOME,
        "estoqueCritico": {
            "total": sum(c["criticos"] for c in criticos.values()),
            "zerados": sum(c["zerados"] for c in criticos.values()),
            "porLoja": list(criticos.values()),
        },
        "atividades": _atividades_do_dia(lojas, _usuario_logado()),
    }
    # Operação vê a Home pelos alertas e pelo estoque; CMV, margem, Curva A e
    # custo de insumo continuam sendo de gestão — e assim a análise das 4
    # lojas (que é a parte cara) nem é calculada pra esse perfil.
    if (_usuario_logado() or {}).get('papel') in ('admin', 'gerente'):
        resposta.update(_analise_da_home(lojas))
    return jsonify(resposta)


@app.route('/api/precos/variacoes', methods=['GET'])
def api_variacoes_de_preco():
    """O que mais subiu e o que mais caiu no período (card #40)."""
    erro = _exigir_gestao()
    if erro:
        return erro
    dias = max(7, min(request.args.get('dias', 90, type=int), 730))
    return jsonify({"dias": dias, **variacoes_de_preco(dias)})


@app.route('/api/precos/insumo/<int:insumo_id>', methods=['GET'])
def api_historico_precos_insumo(insumo_id):
    """Cada compra recebida e cada preço de cotação de um insumo, no tempo."""
    erro = _exigir_gestao()
    if erro:
        return erro
    historico = historico_precos_insumo(insumo_id)
    if not historico:
        return jsonify({"erro": "Insumo não encontrado."}), 404
    return jsonify(historico)


@app.route('/api/admin/registro', methods=['GET'])
def api_listar_registro():
    """Quem fez o quê, do mais novo pro mais velho (ver registrar_acao)."""
    erro = _exigir_admin()
    if erro:
        return erro
    dias = request.args.get('dias', 7, type=int)
    usuario_id = request.args.get('usuarioId', type=int)
    limite = min(request.args.get('limite', 300, type=int), 1000)
    busca = (request.args.get('busca') or '').strip()
    # A tela cortava em 300 linhas sem dizer que tinha cortado (QA 22/09).
    acoes, total = listar_registro_acoes(
        dias=max(1, dias), usuario_id=usuario_id, limite=limite, busca=busca
    )
    return jsonify({"total": total, "limite": limite, "cortou": total > len(acoes), "acoes": [
        {
            "id": a["id"],
            "quando": a["criado_em"],
            "usuarioId": a["usuario_id"],
            "quem": a["usuario_nome"],
            "papel": a["papel"],
            "loja": a["loja"],
            "acao": a["descricao"],
            "caminho": a["caminho"],
            "metodo": a["metodo"],
            "status": a["status"],
            "detalhes": a["detalhes"],
        }
        for a in acoes
    ]})


@app.route('/api/admin/backups', methods=['GET'])
def api_listar_backups():
    erro = _exigir_admin()
    if erro:
        return erro
    # `execucoes` é o que rodou de verdade (o painel mostrava só a
    # configuração, então backup e sincronização podiam estar parados há dias
    # com a tela dizendo "todo dia às 03:30" — QA 22/09).
    return jsonify({
        "backups": listar_backups(),
        "horaAutomatica": f"{HORA_DO_BACKUP[0]:02d}:{HORA_DO_BACKUP[1]:02d}",
        "automatico": os.environ.get("BACKUP_AUTOMATICO", "true").lower() == "true",
        "tamanhoBanco": os.path.getsize(CAMINHO_BANCO) if os.path.exists(CAMINHO_BANCO) else 0,
        "execucoes": listar_execucoes_rotina(),
        "esteProcessoAgenda": _ESTE_WORKER_AGENDA,
    })


@app.route('/api/admin/backups', methods=['POST'])
def api_gerar_backup_agora():
    erro = _exigir_admin()
    if erro:
        return erro
    try:
        destino = gerar_backup()
    except Exception:
        import traceback
        print("❌ Falha ao gerar a cópia do banco:")
        traceback.print_exc()
        return jsonify({"erro": "Não foi possível gerar a cópia agora."}), 500
    return jsonify({"arquivo": os.path.basename(destino), "tamanho": os.path.getsize(destino)})


@app.route('/api/admin/backups/<nome>', methods=['GET'])
def api_baixar_backup(nome):
    erro = _exigir_admin()
    if erro:
        return erro
    # Só nome no formato admfood-AAAA-MM-DD.db — nada de caminho vindo de fora.
    if not NOME_DE_BACKUP.match(nome):
        abort(404)
    return send_from_directory(PASTA_BACKUPS, nome, as_attachment=True)


@app.route('/api/admin/backup-completo', methods=['GET'])
def api_baixar_backup_completo():
    """Banco + notas fiscais + fotos do cardápio num .zip. É esse arquivo que
    reconstrói o sistema do zero se o servidor sumir."""
    erro = _exigir_admin()
    if erro:
        return erro

    # O zip é montado na memória: só o banco precisa passar pelo disco (o
    # VACUUM INTO escreve arquivo), e esse sai no finally.
    copia_banco = os.path.join(tempfile.gettempdir(), f"admfood-{uuid.uuid4().hex}.db")
    pacote = io.BytesIO()
    try:
        gerar_backup(copia_banco)
        with zipfile.ZipFile(pacote, 'w', zipfile.ZIP_DEFLATED) as zipado:
            zipado.write(copia_banco, 'admfood.db')
            for pasta, nome_dentro in (
                (PASTA_NOTAS_FISCAIS, 'notas_fiscais'),
                (PASTA_FOTOS_CARDAPIO, 'cardapio_fotos'),
            ):
                for arquivo in sorted(os.listdir(pasta)):
                    caminho = os.path.join(pasta, arquivo)
                    if os.path.isfile(caminho):
                        zipado.write(caminho, f"{nome_dentro}/{arquivo}")
    except Exception:
        import traceback
        print("❌ Falha ao montar a cópia completa:")
        traceback.print_exc()
        return jsonify({"erro": "Não foi possível montar a cópia completa."}), 500
    finally:
        if os.path.exists(copia_banco):
            os.remove(copia_banco)

    pacote.seek(0)
    return send_file(
        pacote,
        mimetype='application/zip',
        as_attachment=True,
        download_name=f"admfood-{date.today().isoformat()}.zip",
    )


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
    # Estoque e Cardápio estão no menu da operação: aqui a guarda só
    # garante perfil válido. O aperto pra gestão fica no que é de compra
    # (auditoria de segurança, 24/09).
    erro_perfil = _exigir_equipe()
    if erro_perfil:
        return erro_perfil
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

    # Reimportar apaga todo produto que não está na planilha. Antes isso
    # acontecia calado e o resumo só dizia "Importado com sucesso: N
    # produtos": a tela agora mostra a prévia e só grava com `confirmar`
    # (QA 22/09).
    previa = previa_da_planilha_de_precos(linhas)
    if previa["removidos"] and not request.form.get('confirmar'):
        return jsonify({"previa": True, "totalProdutos": len(linhas), **previa}), 409

    sincronizar_precos_cardapio(linhas)
    return jsonify({"sucesso": True, "totalProdutos": len(linhas), **previa})


CAMPOS_PRECO_CARDAPIO_PERMITIDOS = {'ifood', 'food99', 'beefood', 'cardapioWeb'}
CAMPO_PRECO_CARDAPIO_PARA_COLUNA = {'ifood': 'ifood', 'food99': 'food99', 'beefood': 'beefood', 'cardapioWeb': 'cardapio_web'}
COLUNA_PARA_CAMPO_PRECO_CARDAPIO = {coluna: campo for campo, coluna in CAMPO_PRECO_CARDAPIO_PARA_COLUNA.items()}


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
            # Zero é "não vendo nesse canal" e vale (ela usa nos produtos que
            # só saem no balcão); negativo é sempre erro de digitação
            # (QA 22/09).
            if valor < 0:
                return jsonify({"erro": "Preço não pode ser negativo."}), 400
        campos[CAMPO_PRECO_CARDAPIO_PARA_COLUNA[chave]] = valor

    if not campos:
        return jsonify({"erro": "Nada para atualizar."}), 400

    usuario = _usuario_logado()
    atualizar_preco_cardapio(item_id, campos, quem=(usuario or {}).get('nome'))
    resposta = _formatar_item_cardapio(buscar_preco_cardapio_por_id(item_id))
    resposta["historico"] = _historico_preco_formatado(item_id)
    return jsonify(resposta)


def _historico_preco_formatado(item_id):
    return [
        {
            "canal": COLUNA_PARA_CAMPO_PRECO_CARDAPIO.get(l["canal"], l["canal"]),
            "de": l["preco_anterior"],
            "para": l["preco_novo"],
            "quando": l["quando"],
            "quem": l["quem"],
        }
        for l in historico_de_preco_cardapio(item_id)
    ]


@app.route('/api/precos-cardapio/<int:item_id>/historico', methods=['GET'])
def api_historico_preco_cardapio(item_id):
    """O que já mudou de preço nesse produto — a régua pra conferir um
    preço que sumiu ou entrou errado (QA 22/09)."""
    erro = _exigir_gestao()
    if erro:
        return erro
    if not buscar_preco_cardapio_por_id(item_id):
        return jsonify({"erro": "Item não encontrado."}), 404
    return jsonify({"historico": _historico_preco_formatado(item_id)})


@app.route('/api/precos-cardapio/<int:item_id>/nome', methods=['PUT'])
def api_renomear_linha_cardapio(item_id):
    """Renomeia um produto do cardápio de uma loja que ainda não tem ficha
    técnica. Com ficha, o nome muda pelo item (api_renomear_item_cardapio)."""
    erro = _exigir_admin()
    if erro:
        return erro
    dados = request.get_json(silent=True) or {}
    try:
        return jsonify(renomear_linha_cardapio(item_id, dados.get('nome')))
    except ValueError as falha:
        return jsonify({"erro": str(falha)}), 400


@app.route('/api/precos-cardapio/<int:item_id>', methods=['DELETE'])
def api_remover_produto_do_cardapio(item_id):
    """Tira o produto do cardápio de uma loja — ver remover_produto_do_cardapio."""
    erro = _exigir_admin()
    if erro:
        return erro
    try:
        return jsonify(remover_produto_do_cardapio(item_id))
    except ValueError as falha:
        return jsonify({"erro": str(falha)}), 404


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


def _formatar_insumos(linhas, com_custo=False):
    mapa_fornecedores = mapa_insumo_fornecedores()
    # Quem já cotou ou já vendeu, do histórico — separado do cadastro, que é
    # o que a tela de editar insumo grava (ver mapa_fornecedores_do_historico).
    mapa_historico = mapa_fornecedores_do_historico()
    custos_em_uso = custo_em_uso_por_insumo() if com_custo else {}
    # Por loja desde 2026-09-21: quem cota e o homologado de cada loja.
    fornecedores_por_loja = mapa_insumo_loja_fornecedores()
    homologado_por_loja = mapa_homologado_por_loja() if com_custo else {}
    por_insumo = {}
    for linha in linhas:
        insumo = por_insumo.setdefault(linha['insumo_id'], {
            "id": linha['insumo_id'],
            "nome": linha['nome'],
            "categoria": linha['categoria'],
            "unidadeMedida": linha['unidade_medida'],
            "favorito": bool(linha['favorito']),
            "marcaHomologada": linha['marca_homologada'],
            "unidadeCompra": linha['unidade_compra'],
            "fatorConversaoCompra": linha['fator_conversao_compra'],
            "ehMistura": bool(linha['eh_mistura']),
            "conteudoPorUnidade": linha['conteudo_por_unidade'],
            "unidadeConteudo": linha['unidade_conteudo'],
            "fornecedorIds": mapa_fornecedores.get(linha['insumo_id'], []),
            "fornecedoresDoHistorico": sorted(
                set(mapa_historico.get(linha['insumo_id'], []))
                - set(mapa_fornecedores.get(linha['insumo_id'], []))
            ),
            "porLoja": {},
        })
        if com_custo:
            # Custo digitado no cadastro + o que o CMV está usando de fato
            # (pode ser uma cotação, a última compra ou a receita da mistura).
            insumo["custoReferencia"] = linha['custo_referencia']
            insumo["custoEmUso"] = custos_em_uso.get(linha['insumo_id'])
            # Homologado geral: só quando é o mesmo em todas as lojas que têm
            # (preenchido depois do loop, a partir de porLoja).
            insumo["fornecedorHomologadoId"] = None
            insumo["precoHomologado"] = None
            insumo["validadePrecoHomologado"] = None
        insumo["porLoja"][linha['loja']] = {
            "quantidadeAtual": linha['quantidade_atual'],
            "estoqueMinimo": linha['estoque_minimo'],
            "status": _status_estoque(linha['quantidade_atual'], linha['estoque_minimo']),
            "atualizadoEm": linha['atualizado_em'],
            "aplica": bool(linha['aplica']),
            "fornecedorIds": fornecedores_por_loja.get((linha['insumo_id'], linha['loja']), []),
        }
        if com_custo:
            homologado = homologado_por_loja.get((linha['insumo_id'], linha['loja'])) or {}
            insumo["porLoja"][linha['loja']].update({
                "fornecedorHomologadoId": homologado.get("fornecedor_id"),
                "precoHomologado": homologado.get("preco"),
                "validadePrecoHomologado": homologado.get("validade"),
            })
    if com_custo:
        for insumo in por_insumo.values():
            distintos = {
                (p["fornecedorHomologadoId"], p["precoHomologado"], p["validadePrecoHomologado"])
                for p in insumo["porLoja"].values() if p.get("fornecedorHomologadoId")
            }
            if len(distintos) == 1:
                (insumo["fornecedorHomologadoId"], insumo["precoHomologado"],
                 insumo["validadePrecoHomologado"]) = next(iter(distintos))
    return list(por_insumo.values())


@app.route('/api/insumos', methods=['GET'])
def api_listar_insumos():
    # Estoque e Cardápio estão no menu da operação: aqui a guarda só
    # garante perfil válido. O aperto pra gestão fica no que é de compra
    # (auditoria de segurança, 24/09).
    erro_perfil = _exigir_equipe()
    if erro_perfil:
        return erro_perfil
    # Custo só pra admin, que é quem edita o cadastro do insumo.
    usuario = _usuario_logado()
    com_custo = bool(usuario and usuario['papel'] == 'admin')
    return jsonify({"insumos": _formatar_insumos(listar_insumos(), com_custo=com_custo)})


@app.route('/api/insumos/<int:insumo_id>/receita', methods=['GET'])
def api_buscar_receita_insumo(insumo_id):
    """Receita da mistura feita na casa + o preço e a unidade de todo
    insumo, pra tela montar a lista de ingredientes e recalcular o custo da
    batelada enquanto ela edita (a janela abre no Cardápio, que não tem a
    lista de insumos carregada)."""
    # Estoque e Cardápio estão no menu da operação: aqui a guarda só
    # garante perfil válido. O aperto pra gestão fica no que é de compra
    # (auditoria de segurança, 24/09).
    erro_perfil = _exigir_equipe()
    if erro_perfil:
        return erro_perfil
    precos = _mapa_preco_insumo()
    receita = buscar_receita_insumo(insumo_id, precos)
    if receita is None:
        return jsonify({"erro": "Insumo não encontrado."}), 404
    # Conteúdo por unidade vai junto pro seletor g/un da receita: açúcar
    # contado por pacote de 1 kg entra como "100 g", igual na ficha técnica.
    insumos = [
        {"id": i['id'], "nome": i['nome'], "unidadeMedida": i['unidade_medida'],
         "conteudoPorUnidade": i['conteudo_por_unidade'], "unidadeConteudo": i['unidade_conteudo']}
        for i in _insumos_unicos(listar_insumos())
    ]
    return jsonify({**receita, "precos": {str(k): v for k, v in precos.items()}, "insumos": insumos})


@app.route('/api/misturas', methods=['GET'])
def api_listar_misturas():
    """Cardápio → Misturas: todo insumo feito na casa, com rendimento e custo."""
    return jsonify({"misturas": listar_misturas()})


@app.route('/api/misturas', methods=['POST'])
def api_nova_mistura():
    """"Nova mistura" do Cardápio: devolve o insumo que vai ganhar a receita
    — o que já existe com esse nome, ou um novo, só da loja em tela."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    dados = request.get_json(silent=True) or {}
    nome = (dados.get('nome') or '').strip()
    unidade = (dados.get('unidadeMedida') or 'g').strip() or 'g'
    loja = _loja_no_escopo(dados.get('loja'))
    if not nome:
        return jsonify({"erro": "Informe o nome da mistura."}), 400
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    insumo_id, criado = localizar_ou_criar_insumo_de_mistura(nome, unidade, loja)
    return jsonify({"insumoId": insumo_id, "criado": criado})


@app.route('/api/insumos/<int:insumo_id>/receita', methods=['PUT'])
def api_definir_receita_insumo(insumo_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    dados = request.get_json(silent=True) or {}
    try:
        rendimento = float(dados["rendimento"]) if dados.get("rendimento") not in (None, "") else None
    except (TypeError, ValueError):
        return jsonify({"erro": "Rendimento inválido."}), 400
    try:
        definir_receita_insumo(insumo_id, rendimento, dados.get("ingredientes") or [])
    except (TypeError, ValueError) as erro:
        return jsonify({"erro": str(erro)}), 400
    return jsonify(buscar_receita_insumo(insumo_id))


def _campos_conteudo_por_unidade(dados):
    """("1 unidade = 1000 g") do formulário de insumo -> colunas. Em branco
    apaga: o insumo volta a ser usado na receita na própria unidade."""
    if 'conteudoPorUnidade' not in dados:
        return {}, None
    bruto = dados.get('conteudoPorUnidade')
    if bruto in (None, ''):
        return {"conteudo_por_unidade": None, "unidade_conteudo": None}, None
    try:
        conteudo = float(bruto)
    except (TypeError, ValueError):
        return {}, "Conteúdo por unidade inválido."
    unidade = (dados.get('unidadeConteudo') or 'g').strip().lower()
    if conteudo <= 0 or unidade not in ('g', 'ml'):
        return {}, "Informe quantos gramas (ou ml) tem em 1 unidade."
    return {"conteudo_por_unidade": conteudo, "unidade_conteudo": unidade}, None


def _campo_custo_referencia(dados):
    """Custo do insumo digitado no cadastro -> custo_referencia, sempre na
    unidade do insumo (a tela converte: em grama ela digita R$ por kg). Em
    branco apaga. É o custo de menor prioridade no CMV — cotação, compra
    recebida e receita de mistura passam na frente (custo_em_uso_por_insumo)."""
    if 'custoReferencia' not in dados:
        return {}, None
    bruto = dados.get('custoReferencia')
    if bruto in (None, ''):
        return {"custo_referencia": None}, None
    try:
        custo = float(bruto)
    except (TypeError, ValueError):
        return {}, "Custo inválido."
    if custo < 0:
        return {}, "O custo não pode ser negativo."
    return {"custo_referencia": round(custo, 8)}, None


def _campos_fornecedor_homologado(dados):
    """Fornecedor homologado do insumo (2026-09-16): quem já combinou preço
    (na unidade do insumo) e até quando vale. Com fornecedor e preço, a
    Requisição manda o insumo direto em pedido pra ele, sem cotação. Sem
    fornecedor, limpa preço e validade."""
    if 'fornecedorHomologadoId' not in dados:
        return {}, None
    if dados.get('fornecedorHomologadoId') in (None, ''):
        return {"fornecedor_homologado_id": None, "preco_homologado": None, "validade_preco_homologado": None}, None
    try:
        fornecedor_id = int(dados.get('fornecedorHomologadoId'))
    except (TypeError, ValueError):
        return {}, "Fornecedor homologado inválido."
    if not buscar_fornecedor_por_id(fornecedor_id):
        return {}, "Fornecedor homologado não encontrado."
    try:
        preco = float(dados.get('precoHomologado'))
    except (TypeError, ValueError):
        return {}, "Informe o preço combinado com o fornecedor homologado."
    if preco <= 0:
        return {}, "O preço combinado precisa ser maior que zero."
    validade = (dados.get('validadePrecoHomologado') or '').strip() or None
    if validade:
        try:
            date.fromisoformat(validade)
        except ValueError:
            return {}, "Validade do preço combinado inválida."
    return {
        "fornecedor_homologado_id": fornecedor_id,
        "preco_homologado": preco,
        "validade_preco_homologado": validade,
    }, None


@app.route('/api/insumos', methods=['POST'])
def api_criar_insumo():
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    nome = (dados.get('nome') or '').strip()
    categoria = (dados.get('categoria') or 'Geral').strip() or 'Geral'
    unidade_medida = _texto_curto_sem_marcacao(dados.get('unidadeMedida'), padrao='un')
    if not nome:
        return jsonify({"erro": "Informe o nome do insumo."}), 400
    if unidade_medida not in UNIDADES_INSUMO:
        return jsonify({"erro": "A unidade de medida precisa ser g, ml ou un."}), 400
    # Insumo repetido divide a história em dois cadastros (preço num, ficha
    # no outro, contagem no terceiro). A importação em lote já barrava; o
    # "Cadastrar" da tela, não (QA 22/09).
    ja_existe = insumo_com_mesmo_nome(nome)
    if ja_existe:
        return jsonify({
            "erro": f"Já existe um insumo chamado \"{ja_existe['nome']}\". Use o que existe (ou renomeie ele) em vez de criar outro.",
            "insumoId": ja_existe["id"],
        }), 409

    # Tudo validado ANTES de criar: um erro depois do INSERT deixava o insumo
    # criado pela metade, e tentar de novo cadastrava ele duas vezes.
    campos = {}
    marca_homologada = dados.get('marcaHomologada')
    if marca_homologada is not None:
        campos["marca_homologada"] = marca_homologada.strip()
    unidade_compra = dados.get('unidadeCompra')
    if unidade_compra is not None:
        campos["unidade_compra"] = unidade_compra.strip()
    if 'fatorConversaoCompra' in dados:
        try:
            fator = float(dados['fatorConversaoCompra']) if dados['fatorConversaoCompra'] not in (None, '') else None
        except (TypeError, ValueError):
            return jsonify({"erro": "Fator de conversão inválido."}), 400
        campos["fator_conversao_compra"] = fator if fator and fator > 0 else None
    for validar in (_campos_conteudo_por_unidade, _campo_custo_referencia, _campos_fornecedor_homologado):
        campos_extra, erro = validar(dados)
        if erro:
            return jsonify({"erro": erro}), 400
        campos.update(campos_extra)
    # Homologado é por loja (2026-09-21): sai das colunas do insumo.
    homologado = {k: campos.pop(k) for k in ('fornecedor_homologado_id', 'preco_homologado', 'validade_preco_homologado') if k in campos}

    # Só nas lojas marcadas no cadastro (2026-09-21): antes entrava em todas e
    # aparecia na aba e na contagem de loja que nem usa o insumo.
    lojas = dados.get('lojas')
    if lojas is None:
        lojas = list(LOJAS.keys())
    elif not isinstance(lojas, list) or not lojas or any(loja not in LOJAS for loja in lojas):
        return jsonify({"erro": "Marque pelo menos uma loja que usa esse insumo."}), 400
    lojas = [loja for loja in lojas if _loja_visivel(loja)]
    if not lojas:
        return jsonify({"erro": "Essa loja não é a sua."}), 403

    # Como na VMarket (2026-09-22): insumo novo nasce com pelo menos um
    # fornecedor que cota (ou o homologado). Sem ninguém, ele não iria em
    # nenhum link de cotação.
    try:
        fornecedor_ids = [int(f) for f in (dados.get('fornecedorIds') or [])]
    except (TypeError, ValueError):
        return jsonify({"erro": "Fornecedor inválido."}), 400
    if not fornecedor_ids and not homologado.get('fornecedor_homologado_id'):
        return jsonify({"erro": "Marque pelo menos um fornecedor que cota esse insumo. Sem fornecedor, ele não vai em nenhum link de cotação."}), 400

    insumo_id = criar_insumo(nome, categoria, unidade_medida, lojas)
    atualizar_insumo(insumo_id, campos)
    if fornecedor_ids:
        definir_fornecedores_insumo(insumo_id, fornecedor_ids, lojas)
    if homologado.get('fornecedor_homologado_id'):
        definir_homologado_insumo(insumo_id, lojas, homologado['fornecedor_homologado_id'],
                                  homologado.get('preco_homologado'), homologado.get('validade_preco_homologado'))

    return jsonify({"id": insumo_id})


@app.route('/api/insumos/lote', methods=['POST'])
def api_criar_insumos_em_lote():
    """Cadastra vários insumos novos de uma vez, já restritos às lojas
    marcadas (ex: catálogo da VMarket de uma loja que ainda não tinha
    nenhum insumo cadastrado no AdmFood)."""
    erro_admin = _exigir_gestao()
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
    unidade_medida = _texto_curto_sem_marcacao(dados.get('unidadeMedida'), padrao='un')

    resultado = criar_insumos_em_lote(nomes, categoria, unidade_medida, lojas)
    return jsonify(resultado)


@app.route('/api/insumos/por-loja', methods=['GET'])
def api_listar_insumos_por_loja():
    """Todo insumo com uma marcação se a loja pedida usa ele ou não —
    alimenta a tela "Insumos da loja" (Estoque) e decide quem entra no
    link de Requisição de cada loja."""
    loja = _loja_no_escopo(request.args.get('loja'))
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    return jsonify({"insumos": listar_insumos_por_loja(loja)})


@app.route('/api/insumos/por-loja', methods=['POST'])
def api_salvar_insumos_da_loja():
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    loja = _loja_no_escopo(dados.get('loja'))
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
    erro_admin = _exigir_gestao()
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
        unidade = (dados['unidadeMedida'] or 'un').strip() or 'un'
        uso = uso_do_insumo(insumo_id)
        unidade_antiga = uso.get('unidade')
        if unidade != unidade_antiga:
            # Só g/ml/un pra frente: o sistema guarda preço, estoque, ficha e
            # baixa nessas unidades (QA 22/09). Insumo antigo com outra
            # unidade continua como está enquanto ninguém mexer.
            if unidade not in UNIDADES_INSUMO:
                return jsonify({"erro": "A unidade de medida precisa ser g, ml ou un."}), 400
            if uso['estoque'] or uso['fichas'] or uso['receitas']:
                partes = []
                if uso['estoque']:
                    partes.append(f"{uso['estoque']} loja(s) com estoque ou mínimo")
                if uso['fichas']:
                    partes.append(f"{uso['fichas']} ficha(s) técnica(s)")
                if uso['receitas']:
                    partes.append(f"{uso['receitas']} receita(s) de mistura")
                return jsonify({"erro":
                    f"Esse insumo já tem {', '.join(partes)} na unidade '{unidade_antiga}'. "
                    "Trocar a unidade mudaria todos esses números de uma vez — zere o que existe "
                    "ou cadastre um insumo novo."}), 400
        campos['unidade_medida'] = unidade
    if 'favorito' in dados:
        campos['favorito'] = 1 if dados['favorito'] else 0
    if 'marcaHomologada' in dados:
        campos['marca_homologada'] = (dados['marcaHomologada'] or '').strip()
    if 'unidadeCompra' in dados:
        campos['unidade_compra'] = (dados['unidadeCompra'] or '').strip()
    if 'fatorConversaoCompra' in dados:
        try:
            fator = float(dados['fatorConversaoCompra']) if dados['fatorConversaoCompra'] not in (None, '') else None
        except (TypeError, ValueError):
            return jsonify({"erro": "Fator de conversão inválido."}), 400
        campos['fator_conversao_compra'] = fator if fator and fator > 0 else None
    for validar in (_campos_conteudo_por_unidade, _campo_custo_referencia, _campos_fornecedor_homologado):
        campos_extra, erro = validar(dados)
        if erro:
            return jsonify({"erro": erro}), 400
        campos.update(campos_extra)
    # Fornecedores que cotam e homologado são por loja (2026-09-21): com
    # `loja`, muda só nela; sem, em todas as lojas que usam o insumo.
    homologado = {k: campos.pop(k) for k in ('fornecedor_homologado_id', 'preco_homologado', 'validade_preco_homologado') if k in campos}
    loja_alvo = dados.get('loja')
    if loja_alvo is not None and loja_alvo not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    if loja_alvo and not _loja_visivel(loja_alvo):
        return jsonify({"erro": "Essa loja não é a sua."}), 403
    fornecedor_ids = None
    if 'fornecedorIds' in dados:
        try:
            fornecedor_ids = [int(f) for f in (dados['fornecedorIds'] or [])]
        except (TypeError, ValueError):
            return jsonify({"erro": "Lista de fornecedores inválida."}), 400
    lojas_alvo = [loja_alvo] if loja_alvo else lojas_do_insumo(insumo_id)

    atualizar_insumo(insumo_id, campos)
    if fornecedor_ids is not None:
        definir_fornecedores_insumo(insumo_id, fornecedor_ids, lojas_alvo)
    if homologado:
        definir_homologado_insumo(insumo_id, lojas_alvo, homologado['fornecedor_homologado_id'],
                                  homologado.get('preco_homologado'), homologado.get('validade_preco_homologado'))

    return jsonify({"ok": True})


@app.route('/api/insumos/<int:insumo_id>', methods=['DELETE'])
def api_excluir_insumo(insumo_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    # Excluir não limpava ficha, embalagem nem receita (o banco roda sem chave
    # estrangeira): sobrava uma linha invisível na tela que travava o custo do
    # produto pra sempre (QA 22/09).
    uso = uso_do_insumo(insumo_id)
    onde = []
    if uso['fichas']:
        onde.append(f"{uso['fichas']} ficha(s) técnica(s)")
    if uso['embalagens']:
        onde.append(f"{uso['embalagens']} embalagem(ns) pra viagem")
    if uso['receitas']:
        onde.append(f"{uso['receitas']} receita(s) de mistura")
    if onde:
        return jsonify({"erro":
            f"Esse insumo está em {', '.join(onde)}. Tire ele de lá antes de excluir — "
            "ou junte com outro insumo em 'Mesclar', que leva a ficha junto."}), 400

    excluir_insumo(insumo_id)
    return jsonify({"ok": True})


@app.route('/api/insumos/<int:insumo_id>/mesclar', methods=['POST'])
def api_mesclar_insumo(insumo_id):
    """Junta um insumo cadastrado duas vezes no outro (ver mesclar_insumo):
    {destinoId, fator (quantas unidades deste cabem em 1 do destino), loja}."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    loja = _loja_no_escopo(dados.get('loja'))
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    try:
        destino_id = int(dados.get('destinoId'))
        fator = float(dados.get('fator'))
    except (TypeError, ValueError):
        return jsonify({"erro": "Informe o insumo de destino e o fator."}), 400
    try:
        resumo = mesclar_insumo(insumo_id, destino_id, fator, loja)
    except ValueError as erro:
        return jsonify({"erro": str(erro)}), 400
    return jsonify(resumo)


@app.route('/api/insumos/<int:insumo_id>/lojas/<loja>', methods=['DELETE'])
def api_tirar_insumo_da_loja(insumo_id, loja):
    """Tira o insumo só dessa loja (ver tirar_insumo_da_loja)."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    if not _loja_visivel(loja):
        return jsonify({"erro": "Essa loja não é a sua."}), 403
    tirar_insumo_da_loja(insumo_id, loja)
    return jsonify({"ok": True})


@app.route('/api/insumos/<int:insumo_id>/estoque/<loja>', methods=['PUT'])
def api_atualizar_estoque_loja(insumo_id, loja):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    # Aqui a loja vem na URL, então não passa pelo _loja_no_escopo das outras.
    if not _loja_visivel(loja):
        return jsonify({"erro": "Essa loja não é a sua."}), 403

    dados = request.get_json(silent=True) or {}
    campos = {}
    try:
        if 'quantidadeAtual' in dados:
            # Estoque negativo existe de verdade (a venda dá baixa do que a
            # contagem não viu) e antes era recusado aqui, o que impedia até
            # corrigir só o mínimo de um item negativo (QA 22/09).
            campos['quantidade_atual'] = float(dados['quantidadeAtual'])
        if 'estoqueMinimo' in dados:
            campos['estoque_minimo'] = float(dados['estoqueMinimo'])
    except (TypeError, ValueError):
        return jsonify({"erro": "Valores inválidos."}), 400
    if campos.get('estoque_minimo', 0) < 0:
        return jsonify({"erro": "O estoque mínimo não pode ser negativo."}), 400
    if not campos:
        return jsonify({"ok": True, "semMudanca": True})

    # A tela de Insumos não se atualiza sozinha: entre abrir e salvar pode ter
    # entrado um recebimento ou saído uma venda. Quem manda `atualizadoEm`
    # (a tela) recebe 409 quando o estoque mudou no meio, e só grava por cima
    # depois de confirmar (QA 22/09).
    atual = buscar_estoque_loja(insumo_id, loja)
    visto_em = dados.get('atualizadoEm')
    if (visto_em and atual and atual['atualizado_em'] != visto_em
            and 'quantidade_atual' in campos and not dados.get('forcar')):
        return jsonify({
            "erro": "conflito",
            "atualizadoEm": atual['atualizado_em'],
            "quantidadeAtual": atual['quantidade_atual'],
        }), 409

    atualizar_estoque_loja(insumo_id, loja, campos)
    return jsonify({"ok": True})


@app.route('/api/insumos/<int:insumo_id>/entrada', methods=['POST'])
def api_entrada_insumo(insumo_id):
    erro_admin = _exigir_gestao()
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
    unidade = _loja_no_escopo(request.args.get('unidade') or None)
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


@app.route('/api/estoque/baixa-automatica', methods=['GET'])
def api_baixa_automatica():
    """Desde quando cada loja tem baixa automática de estoque (None =
    desligada) — o liga/desliga do painel de Integrações do Estoque."""
    inicios = inicio_baixa_automatica()
    return jsonify({"lojas": {loja: inicios.get(loja) for loja in LOJAS}})


@app.route('/api/estoque/baixa-automatica', methods=['PUT'])
def api_definir_baixa_automatica():
    """Liga (`inicio` = 'AAAA-MM-DD') ou desliga (`inicio` vazio) a baixa
    automática de uma loja. Só de hoje em diante: venda de um dia que já
    passou já está no estoque contado, e ligar pra trás descontaria de novo
    na próxima sincronização daquele dia."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    dados = request.get_json(silent=True) or {}
    loja = _loja_no_escopo(dados.get('loja'))
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    inicio = dados.get('inicio') or None
    if inicio:
        try:
            dia = date.fromisoformat(inicio)
        except (TypeError, ValueError):
            return jsonify({"erro": "Data inválida."}), 400
        if dia < date.today():
            return jsonify({"erro": "Escolha hoje ou um dia depois: a venda de um dia que já passou já está no estoque contado."}), 400
        inicio = dia.isoformat()
    usuario = _usuario_logado()
    definir_inicio_baixa_automatica(loja, inicio, usuario['nome'] if usuario else None)
    return jsonify({"loja": loja, "inicio": inicio})


@app.route('/api/produtos-pendentes', methods=['GET'])
def api_listar_produtos_pendentes():
    """Painel de integrações do estoque (Etapa 0 do motor de compra) —
    produtos vendidos que ainda não casaram com nenhum item da Ficha
    Técnica. Aparece em toda loja, com a baixa ligada ou não: com ela
    desligada, é a lista do que ainda falta casar antes de ligar."""
    unidade = _loja_no_escopo(request.args.get('unidade', 'Hamburgueria Artesanos'))
    if unidade not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    dias = request.args.get('dias', 30, type=int)
    pendentes = listar_produtos_pendentes(unidade, dias)
    return jsonify({"pendentes": pendentes})


@app.route('/api/produtos-pendentes/composicao', methods=['POST'])
def api_definir_composicao_produto():
    """Diz de que um combo é feito. Diferente de vincular (que aponta pra um
    item só): aqui o nome vendido vira vários itens, e a baixa segue a Ficha
    Técnica de cada um."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    nome_produto = (dados.get('nomeProduto') or '').strip()
    componentes = dados.get('componentes') or []
    if not nome_produto or not componentes:
        return jsonify({"erro": "Informe o produto vendido e ao menos um item do combo."}), 400

    limpos = []
    for componente in componentes:
        try:
            item_id = int(componente['itemCardapioId'])
            quantidade = float(componente.get('quantidade') or 1)
        except (KeyError, TypeError, ValueError):
            return jsonify({"erro": "Item do combo inválido."}), 400
        if quantidade <= 0:
            return jsonify({"erro": "Quantidade precisa ser maior que zero."}), 400
        limpos.append({"itemCardapioId": item_id, "quantidade": quantidade})

    usuario = _usuario_logado()
    definir_composicao_produto_venda(nome_produto, limpos, usuario['nome'] if usuario else None)
    return jsonify({"ok": True, "componentes": len(limpos)})


@app.route('/api/produtos-pendentes/vincular', methods=['POST'])
def api_vincular_produto_pendente():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    nome_produto = (dados.get('nomeProduto') or '').strip()
    item_cardapio_id = dados.get('itemCardapioId')
    if not nome_produto or not item_cardapio_id:
        return jsonify({"erro": "Informe o produto vendido e o item do cardápio."}), 400
    try:
        quantidade_por_unidade = float(dados.get('quantidadePorUnidade') or 1)
    except (TypeError, ValueError):
        return jsonify({"erro": "Quantidade por unidade inválida."}), 400
    if quantidade_por_unidade <= 0:
        return jsonify({"erro": "Quantidade por unidade precisa ser maior que zero."}), 400

    usuario = _usuario_logado()
    vincular_produto_venda_manualmente(
        nome_produto, item_cardapio_id, usuario['nome'] if usuario else None, quantidade_por_unidade
    )
    return jsonify({"ok": True})


def _totais_do_dia_por_loja(dia_iso):
    """Faturamento e pedidos de cada loja num dia, com a mesma conta das
    Vendas Diárias (venda presencial lançada à mão + ajuste manual de canal),
    pros números das duas telas baterem."""
    linhas_periodo = _aplicar_presencial(
        buscar_faturamento_periodo(dia_iso, dia_iso), buscar_presencial_periodo(dia_iso, dia_iso)
    )
    _, linhas_periodo = _aplicar_ajustes_canal(
        _linhas_canais_com_presencial(dia_iso, dia_iso), linhas_periodo, buscar_ajustes_canal_periodo(dia_iso, dia_iso)
    )
    return {l["unidade"]: l for l in linhas_periodo}


@app.route('/api/vendas/mais-vendidos', methods=['GET'])
def api_mais_vendidos_do_dia():
    """Ranking de produtos de um dia, por loja (Insights → Mais Vendidos),
    com o faturamento real da loja no dia e no mesmo dia da semana anterior.
    Sem `dia`, o último dia que teve venda."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    dia = request.args.get('dia') or None
    if dia:
        try:
            dia = date.fromisoformat(dia).isoformat()
        except ValueError:
            return jsonify({"erro": "Data inválida."}), 400
    resultado = produtos_mais_vendidos_do_dia(list(LOJAS), dia)
    totais = _totais_do_dia_por_loja(resultado["dia"])
    totais_comparado = _totais_do_dia_por_loja(resultado["diaComparado"])
    for loja in resultado["lojas"]:
        dia_loja = totais.get(loja["loja"])
        comparado = totais_comparado.get(loja["loja"])
        loja["faturamento"] = dia_loja["faturamento_dia"] if dia_loja else 0.0
        loja["pedidos"] = dia_loja["quantidade_pedidos"] if dia_loja else 0
        loja["faturamentoComparado"] = comparado["faturamento_dia"] if comparado else None
        loja["pedidosComparado"] = comparado["quantidade_pedidos"] if comparado else None
    return jsonify(resultado)


@app.route('/api/vinculos-manuais', methods=['GET'])
def api_listar_vinculos_manuais():
    # Leitura da rede inteira (custo, compra, cadastro): sem isso, o perfil
    # operação — que nem tem essa tela no menu — lia tudo chamando a API
    # direto (auditoria de segurança, 24/09).
    erro_perfil = _exigir_gestao()
    if erro_perfil:
        return erro_perfil
    return jsonify({"vinculos": listar_vinculos_manuais()})


@app.route('/api/itens-cardapio/todos', methods=['GET'])
def api_listar_itens_cardapio_todos():
    # Estoque e Cardápio estão no menu da operação: aqui a guarda só
    # garante perfil válido. O aperto pra gestão fica no que é de compra
    # (auditoria de segurança, 24/09).
    erro_perfil = _exigir_equipe()
    if erro_perfil:
        return erro_perfil
    return jsonify({"itens": listar_itens_cardapio_todos()})


@app.route('/api/insumos/lotes-vencendo', methods=['GET'])
def api_lotes_vencendo():
    """Lotes de validade vencendo (ou já vencidos) nos próximos `dias` dias,
    ainda não resolvidos — ver listar_lotes_vencendo em
    backend/armazenamento.py e seção 6.4 da documentação."""
    # Estoque e Cardápio estão no menu da operação: aqui a guarda só
    # garante perfil válido. O aperto pra gestão fica no que é de compra
    # (auditoria de segurança, 24/09).
    erro_perfil = _exigir_equipe()
    if erro_perfil:
        return erro_perfil
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
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    # "perdeu": o lote foi pro lixo e a quantidade dele sai do estoque. Sem
    # isso o botão fazia a mesma coisa pra usado e pra perdido, e o estoque
    # seguia contando mercadoria que não existe (QA 22/09).
    dados = request.get_json(silent=True) or {}
    baixa = marcar_lote_resolvido(lote_id, perdeu=bool(dados.get('perdeu')))
    return jsonify({"ok": True, "baixa": baixa})


# --- FICHA TÉCNICA (insumos que cada item do cardápio consome) -------------
# Item aqui é o PRATO (ex: "BIG ART") — o catálogo em si é único pra rede
# toda, mas desde 2026-09-01 a receita (quais insumos + quantidade) é POR
# LOJA: a mesma "BIG ART" pode usar insumos diferentes na Hamburgueria e na
# Tradiça. Ver seção 6.5 da documentação.

@app.route('/api/cardapio/produtos', methods=['GET'])
def api_listar_produtos_cardapio():
    """Produtos vendidos por uma loja (vem de preco_cardapio), já casados
    com o item da Ficha Técnica quando existir, com custo (digitado à mão)
    e valor de venda do balcão (Cardápio Web) — base da tela de Ficha
    Técnica por loja."""
    loja = _loja_no_escopo(request.args.get('loja'))
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    produtos = listar_produtos_por_loja(loja)
    # Custo pela ficha técnica (2026-09-21): a tela mostra a margem de cada
    # canal com ele; o custo digitado à mão (`custo`) continua ganhando.
    custos_ficha = custos_da_ficha_por_item(loja)
    for p in produtos:
        foto_arquivo = p.pop('fotoArquivo', None)
        p['fotoUrl'] = f"/cardapio-fotos/{foto_arquivo}" if foto_arquivo else None
        custo_ficha = custos_ficha.get(p['itemCardapioId']) if p['itemCardapioId'] else None
        p['custoFicha'] = round(custo_ficha, 2) if custo_ficha is not None else None
    return jsonify({"produtos": produtos, "cmvLimites": {"otimo": CMV_OTIMO_ATE, "bom": CMV_BOM_ATE}})


@app.route('/api/curva-abc', methods=['GET'])
def api_curva_abc():
    """Curva ABC de Cardápio (Etapa 10 do motor de compra) — volume ×
    margem × CMV real por produto, no período pedido."""
    loja = _loja_no_escopo(request.args.get('loja'))
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    try:
        dias = int(request.args.get('dias', 30))
    except (TypeError, ValueError):
        return jsonify({"erro": "Período inválido."}), 400
    dias = max(1, min(dias, 365))
    return jsonify(curva_abc_cardapio(loja, dias))


@app.route('/api/curva-abc-insumos', methods=['GET'])
def api_curva_abc_insumos():
    """Curva ABC de insumos (Etapa 8) — quanto cada insumo movimenta em
    compra recebida, pra separar o que exige revisão manual na Requisição."""
    erro = _exigir_gestao()
    if erro:
        return erro
    try:
        dias = int(request.args.get('dias', 90))
    except (TypeError, ValueError):
        return jsonify({"erro": "Período inválido."}), 400
    return jsonify(curva_abc_insumos(max(1, min(dias, 365))))


@app.route('/api/itens-cardapio/<int:item_id>/protegido', methods=['PUT'])
def api_definir_produto_protegido(item_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    dados = request.get_json(silent=True) or {}
    definir_produto_protegido(item_id, bool(dados.get('protegido')))
    return jsonify({"ok": True})


@app.route('/api/itens-cardapio/<int:item_id>/ficha-tecnica', methods=['GET'])
def api_buscar_ficha_tecnica_item(item_id):
    loja = _loja_no_escopo(request.args.get('loja'))
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400

    precos = precos_insumo_em_uso()

    # Custo de cada insumo no produto (2026-09-21): o modal do Cardápio mostra
    # qual insumo está sem preço quando o custo do produto não fecha.
    def formatar(linhas):
        return [
            {
                "insumoId": i['insumo_id'],
                "nome": i['insumo_nome'],
                "unidadeMedida": i['unidade_medida'],
                "quantidade": i['quantidade'],
                "conteudoPorUnidade": i['conteudo_por_unidade'],
                "unidadeConteudo": i['unidade_conteudo'],
                "custoUnitario": precos.get(i['insumo_id']),
                "custo": round(i['quantidade'] * precos[i['insumo_id']], 4)
                if i['quantidade'] is not None and precos.get(i['insumo_id']) is not None else None,
            }
            for i in linhas
        ]

    # O custo vai junto (QA 22/09): a linha da ficha mostra quanto aquele
    # insumo pesa no produto, e dá pra ver na hora o que mudou o custo.
    insumos_disponiveis = [
        {"id": i['id'], "nome": i['nome'], "unidadeMedida": i['unidade_medida'],
         "conteudoPorUnidade": i['conteudo_por_unidade'], "unidadeConteudo": i['unidade_conteudo'],
         "custoUnitario": precos.get(i['id'])}
        for i in _insumos_unicos(listar_insumos())
    ]
    return jsonify({
        "insumos": formatar(buscar_ficha_tecnica_item(item_id, loja)),
        "embalagemViagem": formatar(buscar_embalagem_viagem_item(item_id, loja)),
        "insumosDisponiveis": insumos_disponiveis,
        # Quem digitou o custo à mão e quando: é ele que manda na margem, e a
        # tela não dizia de onde tinha vindo (QA 22/09).
        "custoManual": quem_digitou_o_custo(item_id, loja),
        # Volta no Salvar pra detectar que alguém mexeu no meio (QA 22/09).
        "assinatura": assinatura_da_ficha(item_id, loja),
    })


def _insumos_unicos(linhas_estoque):
    vistos = {}
    for linha in linhas_estoque:
        vistos.setdefault(linha['insumo_id'], {
            "id": linha['insumo_id'],
            "nome": linha['nome'],
            "unidade_medida": linha['unidade_medida'],
            "conteudo_por_unidade": linha['conteudo_por_unidade'],
            "unidade_conteudo": linha['unidade_conteudo'],
        })
    return sorted(vistos.values(), key=lambda i: i['nome'])


@app.route('/api/itens-cardapio', methods=['POST'])
def api_criar_item_cardapio():
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    nome = (dados.get('nome') or '').strip()
    categoria = (dados.get('categoria') or 'Geral').strip() or 'Geral'
    tipo = dados.get('tipo') or 'produto'
    if not nome:
        return jsonify({"erro": "Informe o nome do item."}), 400
    if tipo not in ('produto', 'complemento'):
        return jsonify({"erro": "Tipo inválido."}), 400

    item_id = criar_item_cardapio(nome, categoria, tipo=tipo)
    # Produto criado na aba de uma loja entra no cardápio dela, senão não
    # aparece na tela (que lista o cardápio de preços). Complemento não
    # tem cardápio: a aba de complementos lista os itens direto.
    loja = _loja_no_escopo((dados.get('loja') or '').strip())
    if tipo == 'produto' and loja in LOJAS:
        adicionar_produto_ao_cardapio(loja, nome, categoria)
    return jsonify({"id": item_id})


@app.route('/api/itens-cardapio/<int:item_id>', methods=['DELETE'])
def api_excluir_item_cardapio(item_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    excluir_item_cardapio(item_id)
    return jsonify({"ok": True})


@app.route('/api/itens-cardapio/<int:item_id>/nome', methods=['PUT'])
def api_renomear_item_cardapio(item_id):
    """Renomeia o item em todas as lojas, guardando o nome antigo como
    vínculo — ver renomear_item_cardapio."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    dados = request.get_json(silent=True) or {}
    usuario = _usuario_logado()
    try:
        return jsonify(renomear_item_cardapio(item_id, dados.get('nome'), usuario['nome'] if usuario else None))
    except ValueError as falha:
        return jsonify({"erro": str(falha)}), 400


@app.route('/api/complementos', methods=['GET'])
def api_listar_complementos():
    loja = _loja_no_escopo(request.args.get('loja'))
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    return jsonify({"complementos": listar_complementos_por_loja(loja)})


@app.route('/api/complementos/lote', methods=['POST'])
def api_criar_complementos_em_lote():
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    texto = dados.get('texto') or ''
    nomes = [linha.strip() for linha in texto.split('\n') if linha.strip()]
    if not nomes:
        return jsonify({"erro": "Cole ao menos um nome."}), 400

    resultado = criar_complementos_em_lote(nomes)
    return jsonify(resultado)


@app.route('/api/itens-cardapio/<int:item_id>/o-que-vai-junto', methods=['GET'])
def api_o_que_vai_junto_com_o_item(item_id):
    """Ficha, embalagem, porções, custo e vendas que somem junto com o item —
    pro aviso de exclusão dizer o que está em jogo (QA 22/09)."""
    erro = _exigir_gestao()
    if erro:
        return erro
    junto = o_que_vai_junto_com_o_item(item_id)
    if not junto:
        return jsonify({"erro": "Item não encontrado."}), 404
    return jsonify(junto)


@app.route('/api/itens-cardapio/<int:item_id>/ficha-tecnica', methods=['PUT'])
def api_definir_ficha_tecnica(item_id):
    """Grava a ficha (`insumos`) e/ou a embalagem pra viagem
    (`embalagemViagem`) do item na loja. Só troca a lista que vier no corpo:
    quem manda só a ficha não apaga a embalagem."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    loja = _loja_no_escopo(dados.get('loja'))
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400

    # Alguém salvou essa mesma ficha enquanto o modal estava aberto: gravar
    # por cima apagaria a receita da outra pessoa sem aviso (QA 22/09).
    assinatura_recebida = dados.get('assinatura')
    if assinatura_recebida and assinatura_recebida != assinatura_da_ficha(item_id, loja):
        return jsonify({
            "erro": "Essa ficha mudou enquanto você editava — alguém salvou antes. Feche e abra de novo pra ver "
                    "o que está valendo agora, senão o trabalho da outra pessoa é apagado.",
            "conflito": True,
        }), 409

    gravacoes = []
    for chave, gravar in (('insumos', definir_ficha_tecnica), ('embalagemViagem', definir_embalagem_viagem)):
        if chave not in dados:
            continue
        links, erro = _links_de_insumo(dados.get(chave))
        if erro:
            return jsonify({"erro": erro}), 400
        gravacoes.append((gravar, links))

    # Quantidade fora de qualquer proporção (grama digitado como quilo) entrava
    # sem trava e ainda voltava retroativa no estoque, porque a baixa recalcula
    # os dias com a ficha atual. A régua é a mediana do mesmo insumo nas outras
    # fichas; quem confirma manda `confirmar` (QA 22/09).
    if not dados.get('confirmar'):
        tipicas = quantidades_tipicas_por_insumo(fora_do_item=item_id)
        nomes = {i['id']: i['nome'] for i in _insumos_unicos(listar_insumos())}
        suspeitos = []
        for _gravar, links in gravacoes:
            for link in links:
                tipica = tipicas.get(link['insumoId'])
                quantidade = link.get('quantidade')
                if not tipica or not quantidade or quantidade <= 0:
                    continue
                if quantidade >= tipica * FATOR_QUANTIDADE_SUSPEITA or quantidade * FATOR_QUANTIDADE_SUSPEITA <= tipica:
                    suspeitos.append({
                        "insumoId": link['insumoId'],
                        "nome": nomes.get(link['insumoId'], f"insumo {link['insumoId']}"),
                        "quantidade": quantidade,
                        "tipica": tipica,
                    })
        if suspeitos:
            return jsonify({"erro": "confirmar", "suspeitos": suspeitos}), 409

    for gravar, links in gravacoes:
        gravar(item_id, loja, links)
    return jsonify({"ok": True})


def _links_de_insumo(brutos):
    """Lista de insumos da tela ([{"insumoId", "quantidade"}]) validada.
    Devolve (links, mensagem de erro)."""
    links = []
    vistos = set()
    for link in brutos or []:
        try:
            insumo_id = int(link['insumoId'])
        except (KeyError, TypeError, ValueError):
            return None, "Insumo inválido na lista."
        if insumo_id in vistos:
            return None, "O mesmo insumo está duas vezes na lista."
        vistos.add(insumo_id)
        quantidade = link.get('quantidade')
        # Insumo escolhido sem quantidade era aceito como nulo: a linha
        # entrava na ficha, mas não descontava estoque e o custo do produto
        # nunca fechava — e o aviso só aparecia ao reabrir (QA 22/09).
        if quantidade in (None, ''):
            return None, "Tem insumo na ficha sem quantidade. Preencha a quantidade ou tire a linha."
        try:
            quantidade = float(quantidade)
        except (TypeError, ValueError):
            return None, "Quantidade inválida."
        if quantidade <= 0:
            return None, "Quantidade precisa ser maior que 0 (pra não usar o insumo, tire a linha)."
        links.append({"insumoId": insumo_id, "quantidade": quantidade})
    return links, None


@app.route('/api/itens-cardapio/<int:item_id>/porcoes-complemento', methods=['GET'])
def api_listar_porcoes_complemento(item_id):
    """Porção (g) de cada complemento escolhido nesse produto — ex: no
    Frutas ao Creme 500ml, cada fruta 70 g e o adicional 60 g."""
    loja = _loja_no_escopo(request.args.get('loja'))
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    return jsonify({"complementos": listar_porcoes_complemento(item_id, loja)})


@app.route('/api/itens-cardapio/<int:item_id>/porcoes-complemento', methods=['PUT'])
def api_definir_porcoes_complemento(item_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    dados = request.get_json(silent=True) or {}
    loja = _loja_no_escopo(dados.get('loja'))
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    porcoes = []
    for porcao in dados.get('complementos') or []:
        gramas = porcao.get('gramas')
        if gramas in (None, ''):
            continue
        try:
            gramas = float(gramas)
            complemento_id = int(porcao['complementoId'])
        except (KeyError, TypeError, ValueError):
            return jsonify({"erro": "Porção inválida."}), 400
        if gramas <= 0:
            return jsonify({"erro": "Porção precisa ser maior que zero."}), 400
        # A porção escala a ficha do complemento pelos gramas dela; com insumo
        # em "un" sem "1 un = X g", não dá pra saber quantos gramas a ficha
        # soma e a porção era ignorada em silêncio, descontando a ficha inteira
        # por complemento vendido (QA 22/09).
        travando = insumos_sem_conversao_da_ficha(complemento_id, loja)
        if travando:
            return jsonify({"erro":
                f"A porção não vale enquanto a ficha desse complemento tiver insumo contado em unidade sem conversão: "
                f"{', '.join(travando[:4])}. Cadastre '1 un = X g' nesses insumos (no cadastro do insumo) e tente de novo."}), 400
        porcoes.append({"complementoId": complemento_id, "gramas": gramas})
    definir_porcoes_complemento(item_id, loja, porcoes)
    return jsonify({"ok": True})


@app.route('/api/itens-cardapio/<int:item_id>/custo', methods=['PUT'])
def api_salvar_custo_item_cardapio(item_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    loja = _loja_no_escopo(dados.get('loja'))
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    # Campo em branco apaga o custo à mão e devolve o produto pro cálculo
    # da Ficha Técnica — sem isso, um valor errado fica pra sempre.
    if dados.get('custo') in (None, ''):
        remover_custo_item_cardapio(item_id, loja)
        return jsonify({"ok": True, "removido": True})

    try:
        custo = float(dados.get('custo'))
    except (TypeError, ValueError):
        return jsonify({"erro": "Informe um custo válido."}), 400
    if custo < 0:
        return jsonify({"erro": "Custo não pode ser negativo."}), 400

    salvar_custo_item_cardapio(item_id, loja, custo, quem=(_usuario_logado() or {}).get('nome'))
    # Quem digitou e quando volta pra tela: é esse custo que manda na margem
    # e não dava pra saber de onde tinha vindo (QA 22/09).
    return jsonify({"ok": True, "custoManual": quem_digitou_o_custo(item_id, loja)})


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
        "lojas": linha.get("lojas") or [],
    }


def _lojas_fornecedor_do_corpo(dados):
    """`lojas` do corpo (de quais lojas a gente compra dele) — None quando
    não veio, pra não apagar as lojas de quem só mudou outro campo."""
    if 'lojas' not in dados:
        return None
    lojas = [loja for loja in (dados.get('lojas') or []) if loja in LOJAS]
    return list(dict.fromkeys(lojas))


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
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    campos, erro_resposta, status = _campos_fornecedor_do_corpo(dados)
    if erro_resposta:
        return erro_resposta, status

    # Nome repetido é quase sempre clique duplo ou cadastro esquecido: com dois
    # fornecedores iguais, metade dos insumos fica ligada a um e metade ao
    # outro, e o convite de cotação sai partido (QA 22/09).
    def _nome_simples(texto):
        return ' '.join((texto or '').strip().lower().split())

    nome_novo = _nome_simples(campos.get('nome', ''))
    existente = next(
        (f for f in listar_fornecedores() if _nome_simples(f['nome']) == nome_novo),
        None,
    )
    if existente:
        return jsonify({"erro":
            f"Já existe um fornecedor chamado \"{existente['nome']}\". Edite o que existe em vez de cadastrar outro."}), 400

    fornecedor_id = criar_fornecedor(campos)
    lojas = _lojas_fornecedor_do_corpo(dados)
    if lojas is not None:
        definir_lojas_fornecedor(fornecedor_id, lojas)
    return jsonify({"id": fornecedor_id})


@app.route('/api/fornecedores/<int:fornecedor_id>/insumos', methods=['GET'])
def api_insumos_do_fornecedor(fornecedor_id):
    """O que esse fornecedor cota. Morava só em Insumos: nem a tabela de
    Fornecedores nem o "Ver detalhes" diziam o que ele vende (QA 22/09)."""
    erro = _exigir_gestao()
    if erro:
        return erro
    itens = [
        {**i, "lojas": [l for l in i["lojas"] if _loja_visivel(l)],
         "homologadoEm": [l for l in i["homologadoEm"] if _loja_visivel(l)]}
        for i in insumos_que_o_fornecedor_cota(fornecedor_id)
    ]
    return jsonify({"insumos": [i for i in itens if i["lojas"]]})


@app.route('/api/fornecedores/<int:fornecedor_id>', methods=['PUT'])
def api_atualizar_fornecedor(fornecedor_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    campos, erro_resposta, status = _campos_fornecedor_do_corpo(dados, exigir_nome=False)
    if erro_resposta:
        return erro_resposta, status

    atualizar_fornecedor(fornecedor_id, campos)
    lojas = _lojas_fornecedor_do_corpo(dados)
    if lojas is not None:
        definir_lojas_fornecedor(fornecedor_id, lojas)
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
        "insumosComprados": linha["insumos_comprados"],
        "percentualRespostas": linha["percentual_respostas"],
        "valorPedido": linha["valor_pedido"],
        "economia": linha["economia"],
        # Com pedido, a lixeira fica travada (ver excluir_cotacao).
        "totalPedidos": linha["total_pedidos"],
        # Sem Requisição por trás — cotação manual, catálogo completo (ver
        # seção 6.8 da documentação).
        "manual": linha["requisicao_titulo"] is None,
        # De onde veio (etiqueta embaixo do título e filtro Tipo): importada
        # da VMarket, gerada por uma Requisição ou criada à mão.
        "origem": "vmarket" if linha["id_vmarket"] else ("requisicao" if linha["requisicao_titulo"] else "manual"),
        # Indicadores do topo da tela (fornecedores participantes e taxa de
        # resposta dos últimos 30 dias), calculados no navegador.
        "fornecedorIds": linha["fornecedor_ids"],
        "convitesTotal": linha["convites_total"],
        "convitesRespondidos": linha["convites_respondidos"],
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
            "fornecedorTelefone": preco["fornecedor_telefone"],
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
    erro_admin = _exigir_gestao()
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
    # Leitura da rede inteira (custo, compra, cadastro): sem isso, o perfil
    # operação — que nem tem essa tela no menu — lia tudo chamando a API
    # direto (auditoria de segurança, 24/09).
    erro_perfil = _exigir_gestao()
    if erro_perfil:
        return erro_perfil
    cotacao = buscar_cotacao(cotacao_id)
    if not cotacao:
        return jsonify({"erro": "Cotação não encontrada."}), 404

    grupos = _agrupar_precos_por_insumo(listar_precos_cotacao(cotacao_id))
    # Cotação sem Requisição por trás (requisicao_titulo é NULL) mostra o
    # catálogo inteiro de insumos como linha, estilo VMarket (pedido da
    # Julia, 2026-09-03) — a que veio de Requisição continua só com o
    # déficit calculado, sem mudança nenhuma.
    catalogo_completo = cotacao["requisicao_titulo"] is None
    itens = listar_itens_cotacao_catalogo_completo(cotacao_id) if catalogo_completo else listar_itens_cotacao(cotacao_id)

    # "Última Compra" (print da VMarket, pedido da Julia 2026-09-04) — preço
    # e data do pedido recebido mais recente de cada insumo, calculado uma
    # vez pra cotação inteira em vez de insumo por insumo.
    mapa_ultima_compra = buscar_ultima_compra_por_insumo()
    for item in itens:
        item["ultimaCompra"] = mapa_ultima_compra.get(item["insumoId"])

    return jsonify({
        "cotacao": {
            "id": cotacao["id"],
            "titulo": cotacao["titulo"],
            "status": cotacao["status"],
            "criadoEm": cotacao["criado_em"],
        },
        "grupos": grupos,
        "itens": itens,
        "catalogoCompleto": catalogo_completo,
        "recusas": listar_recusas_cotacao(cotacao_id),
    })


@app.route('/api/cotacoes/<int:cotacao_id>', methods=['PUT'])
def api_atualizar_cotacao(cotacao_id):
    erro_admin = _exigir_gestao()
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
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    try:
        excluir_cotacao(cotacao_id)
    except ValueError as erro:
        return jsonify({"erro": str(erro)}), 400
    return jsonify({"ok": True})


def _cotacao_fechada(cotacao_id):
    """Cotação que não está mais aberta vira leitura: o servidor não conferia
    o status em ação nenhuma, então dava pra lançar preço, escolher vencedor,
    convidar e gerar pedido numa cotação já fechada — e a aba Compras passava
    a contar outra coisa (QA 22/09). Pedido direto e carga da VMarket nascem
    fechados e não passam por aqui."""
    cotacao = buscar_cotacao(cotacao_id)
    if not cotacao:
        return jsonify({"erro": "Cotação não encontrada."}), 404
    if cotacao["status"] != "aberta":
        return jsonify({
            "erro": "Essa cotação já foi fechada. Reabra ela antes de mexer nos preços ou nos convites."
        }), 409
    return None


def _item_ja_pedido(cotacao_id, insumo_id):
    """Item que já virou pedido não muda mais de vencedor (QA 22/09)."""
    pedido_id = item_da_cotacao_virou_pedido(cotacao_id, insumo_id)
    if pedido_id:
        return jsonify({
            "erro": f"Esse item já virou o pedido nº {pedido_id}. Pra trocar o fornecedor, cancele o pedido primeiro."
        }), 409
    return None


@app.route('/api/cotacoes/<int:cotacao_id>/precos', methods=['POST'])
def api_adicionar_preco_cotacao(cotacao_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    erro_fechada = _cotacao_fechada(cotacao_id)
    if erro_fechada:
        return erro_fechada

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
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    erro_fechada = _cotacao_fechada(cotacao_id)
    if erro_fechada:
        return erro_fechada
    preco = insumo_do_preco_cotacao(preco_id)
    if preco:
        erro_pedido = _item_ja_pedido(cotacao_id, preco["insumoId"])
        if erro_pedido:
            return erro_pedido

    excluir_preco_cotacao(preco_id)
    return jsonify({"ok": True})


@app.route('/api/cotacoes/<int:cotacao_id>/precos/<int:preco_id>/selecionar', methods=['PUT'])
def api_selecionar_preco_cotacao(cotacao_id, preco_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    erro_fechada = _cotacao_fechada(cotacao_id)
    if erro_fechada:
        return erro_fechada
    preco = insumo_do_preco_cotacao(preco_id)
    if not preco:
        return jsonify({"erro": "Preço não encontrado."}), 404
    erro_pedido = _item_ja_pedido(cotacao_id, preco["insumoId"])
    if erro_pedido:
        return erro_pedido

    selecionar_preco_cotacao(preco_id)
    # Devolve qual insumo mudou pra tela redesenhar só aquela linha: cada
    # clique custava três idas ao servidor e o redesenho da tabela inteira
    # (QA 22/09).
    return jsonify({"ok": True, "insumoId": preco["insumoId"], "precoId": preco_id})


@app.route('/api/cotacoes/<int:cotacao_id>/selecionar-melhores-precos', methods=['POST'])
def api_selecionar_melhores_precos_cotacao(cotacao_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    erro_fechada = _cotacao_fechada(cotacao_id)
    if erro_fechada:
        return erro_fechada

    total = selecionar_melhores_precos_cotacao(cotacao_id)
    return jsonify({"ok": True, "total": total})


@app.route('/api/cotacoes/<int:cotacao_id>/itens/<int:insumo_id>', methods=['DELETE'])
def api_tirar_item_da_cotacao(cotacao_id, insumo_id):
    """Tira um item da cotação (ver tirar_item_da_cotacao)."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    try:
        tirar_item_da_cotacao(cotacao_id, insumo_id)
    except ValueError as falha:
        return jsonify({"erro": str(falha)}), 400
    return jsonify({"ok": True})


@app.route('/api/cotacoes/<int:cotacao_id>/itens/<int:insumo_id>', methods=['PUT'])
def api_salvar_quantidade_item_cotacao(cotacao_id, insumo_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    try:
        quantidade = float(dados.get('quantidade'))
    except (TypeError, ValueError):
        return jsonify({"erro": "Quantidade inválida."}), 400
    if quantidade < 0:
        return jsonify({"erro": "Quantidade não pode ser negativa."}), 400

    salvar_quantidade_item_cotacao(cotacao_id, insumo_id, quantidade)
    return jsonify({"ok": True})


def _formatar_convite(convite):
    return {
        "id": convite["id"],
        "fornecedorId": convite["fornecedor_id"],
        "fornecedorNome": convite["fornecedor_nome"],
        "fornecedorTelefone": convite["fornecedor_telefone"],
        "prazoValidade": convite["prazo_validade"],
        "status": convite["status"],
        "criadoEm": convite["criado_em"],
        "respondidaEm": convite["respondida_em"],
        # Quando o link foi mandado pro fornecedor (QA 22/09).
        "enviadoEm": convite["enviado_em"] if "enviado_em" in convite.keys() else None,
        "token": convite["token"],
    }


@app.route('/api/cotacoes/<int:cotacao_id>/convites', methods=['GET'])
def api_listar_convites_cotacao(cotacao_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    return jsonify({
        "convites": [_formatar_convite(c) for c in listar_convites_cotacao(cotacao_id)],
        # Pro "Convidar fornecedores" já marcar quem fornece pra essas lojas.
        "lojas": lojas_da_cotacao(cotacao_id),
    })


@app.route('/api/cotacoes/<int:cotacao_id>/convites/previa', methods=['GET'])
def api_previa_convites_cotacao(cotacao_id):
    """O que cada fornecedor receberia se o convite fosse gerado agora. Só
    leitura — não cria convite nem token."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    if not buscar_cotacao(cotacao_id):
        return jsonify({"erro": "Cotação não encontrada."}), 404
    return jsonify(previa_convites_cotacao(cotacao_id))


@app.route('/api/cotacoes/<int:cotacao_id>/convites', methods=['POST'])
def api_criar_convites_cotacao(cotacao_id):
    """Manda o link de preenchimento pros fornecedores marcados, cada um com
    os insumos que ele fornece + os que não têm fornecedor nenhum (ver
    `criar_convites_cotacao` em armazenamento.py pra regra completa)."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    cotacao = buscar_cotacao(cotacao_id)
    if not cotacao:
        return jsonify({"erro": "Cotação não encontrada."}), 404
    erro_fechada = _cotacao_fechada(cotacao_id)
    if erro_fechada:
        return erro_fechada

    dados = request.get_json(silent=True) or {}
    prazo_validade = (dados.get('prazoValidade') or '').strip()
    if not prazo_validade:
        return jsonify({"erro": "Informe o prazo de validade do convite."}), 400
    # Prazo no passado nascia vencido: o fornecedor abria o link e o envio já
    # era recusado (QA 22/09).
    if prazo_validade < datetime.now().isoformat(timespec='minutes'):
        return jsonify({"erro": "Esse prazo já passou. Escolha uma data e hora futuras."}), 400
    # Sem `fornecedorIds` = todo fornecedor ativo (comportamento antigo).
    fornecedor_ids = None
    if 'fornecedorIds' in dados:
        try:
            fornecedor_ids = [int(f) for f in (dados['fornecedorIds'] or [])]
        except (TypeError, ValueError):
            return jsonify({"erro": "Lista de fornecedores inválida."}), 400
        if not fornecedor_ids:
            return jsonify({"erro": "Marque pelo menos um fornecedor."}), 400
    # O que vai no link de cada um, marcado na tela (2026-09-21).
    itens_por_fornecedor = None
    if dados.get('itensPorFornecedor') is not None:
        try:
            itens_por_fornecedor = {
                int(fornecedor): [int(i) for i in (itens or [])]
                for fornecedor, itens in dict(dados['itensPorFornecedor']).items()
            }
        except (TypeError, ValueError):
            return jsonify({"erro": "Lista de itens por fornecedor inválida."}), 400

    resultado = criar_convites_cotacao(cotacao_id, prazo_validade, fornecedor_ids, itens_por_fornecedor)
    if not resultado["convites"]:
        if resultado["fornecedoresSemItens"]:
            nomes = ", ".join(resultado["fornecedoresSemItens"])
            return jsonify({"erro": f"Nenhum insumo dessa cotação é fornecido por: {nomes}. Marque o fornecedor no cadastro do insumo (coluna Fornecedores, em Insumos) ou escolha outro."}), 400
        return jsonify({"erro": "Todos os fornecedores marcados já têm convite nessa cotação."}), 400
    return jsonify({"ok": True, **resultado})


@app.route('/api/cotacoes/convites/<int:convite_id>/reabrir', methods=['POST'])
def api_reabrir_convite_cotacao(convite_id):
    """Destrava de novo o link de um fornecedor que já respondeu — pra
    corrigir preço enviado errado (ver reabrir_convite_cotacao em
    armazenamento.py)."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    prazo = reabrir_convite_cotacao(convite_id)
    return jsonify({"ok": True, "prazoValidade": prazo})


@app.route('/api/cotacoes/convites/<int:convite_id>/enviado', methods=['POST'])
def api_marcar_convite_enviado(convite_id):
    """Registra que o convite foi mandado pro fornecedor — pelo clique no
    WhatsApp ou pela extensão. O selo "enviado" vivia só na memória da
    página e sumia ao atualizar (QA 22/09)."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    enviado_em = marcar_convite_enviado(convite_id)
    if enviado_em is None:
        return jsonify({"erro": "Convite não encontrado."}), 404
    return jsonify({"ok": True, "enviadoEm": enviado_em})


@app.route('/api/cotacoes/convites/<int:convite_id>/prazo', methods=['PUT'])
def api_estender_prazo_convite(convite_id):
    """"Estender prazo" na linha do convite: sem `prazoValidade`, dá mais 24
    horas a partir de agora. Convite com prazo vencido não tinha conserto
    nenhum antes disso (QA 22/09)."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    dados = request.get_json(silent=True) or {}
    try:
        prazo = estender_prazo_convite(convite_id, (dados.get('prazoValidade') or '').strip() or None)
    except ValueError as falha:
        return jsonify({"erro": str(falha)}), 400
    if prazo is None:
        return jsonify({"erro": "Convite não encontrado."}), 404
    return jsonify({"ok": True, "prazoValidade": prazo})


@app.route('/api/cotacoes/convite/<token>', methods=['GET'])
def api_buscar_convite_por_token(token):
    # Pública (sem login) — ver exceção em _exigir_login.
    convite = buscar_convite_por_token(token)
    if not convite:
        return jsonify({"erro": "Link inválido."}), 404
    # Fornecedor desativado no meio da cotação continuava com o link vivo,
    # aparecia no comparativo e podia virar pedido (QA 22/09).
    if not convite["fornecedor_ativo"]:
        return jsonify({"erro": "Esse fornecedor não está mais ativo na rede. Fale com a compradora."}), 410

    resposta = _formatar_convite(convite)
    resposta.pop('token', None)
    resposta['cotacaoTitulo'] = convite['cotacao_titulo']
    # Reabrir pra corrigir começava do zero: o preço já mandado voltava na
    # resposta mas a tela não usava, e o "não vendo" nem vinha (QA 22/09).
    # Qual das duas respostas negativas ele deu em cada item, pra tela
    # reabrir com a marcação certa (25/09).
    recusados = {
        r["insumoId"]: r.get("tipo") or "nao_vende"
        for r in listar_recusas_cotacao(convite["cotacao_id"])
        if r["fornecedorId"] == convite["fornecedor_id"]
    }
    resposta['itens'] = [
        {
            "insumoId": item["insumo_id"],
            "nome": item["nome"],
            "categoria": item["categoria"],
            "unidadeMedida": item["unidade_medida"],
            "marcaHomologada": item["marca_homologada"],
            "quantidade": item["quantidade_total"],
            "precoPreenchido": item["preco_preenchido"],
            "naoVende": recusados.get(item["insumo_id"]) == "nao_vende",
            "emFalta": recusados.get(item["insumo_id"]) == "em_falta",
            # A embalagem que o link de contagem mostra ("1 caixa = 5 kg")
            # faltava aqui, e é o que evita preço de caixa no campo do kg.
            "fatorConversaoCompra": item["fator_conversao_compra"] if "fator_conversao_compra" in item.keys() else None,
            "unidadeCompra": item["unidade_compra"] if "unidade_compra" in item.keys() else None,
        }
        for item in convite["itens"]
    ]
    resposta['expirado'] = convite['status'] == 'aberta' and _prazo_vencido(convite['prazo_validade'])
    return jsonify(resposta)


@app.route('/api/cotacoes/convite/<token>/reabrir', methods=['POST'])
def api_fornecedor_reabre_convite(token):
    """O próprio fornecedor destrava o convite dele pra corrigir um preço que
    saiu errado. Antes, depois de enviar, só o admin destravava — e na tela
    dele não existia nem um "mandei errado" (QA 22/09). Vale enquanto a
    cotação está aberta e o prazo não venceu; o link é a credencial, e ele já
    podia mandar preço por ele."""
    convite = buscar_convite_por_token(token)
    if not convite:
        return jsonify({"erro": "Link inválido."}), 404
    if not convite["fornecedor_ativo"]:
        return jsonify({"erro": "Esse fornecedor não está mais ativo na rede. Fale com a compradora."}), 410
    if convite["status"] == "aberta":
        return jsonify({"ok": True, "jaEstavaAberto": True})
    cotacao = buscar_cotacao(convite["cotacao_id"])
    if cotacao and cotacao["status"] != "aberta":
        return jsonify({
            "erro": "A compradora já encerrou essa cotação. Fale com ela pra corrigir o preço."
        }), 409
    if _prazo_vencido(convite["prazo_validade"]):
        return jsonify({
            "erro": "O prazo dessa cotação já venceu. Fale com a compradora pra ela reabrir."
        }), 409
    reabrir_convite_cotacao(convite["id"])
    return jsonify({"ok": True})


@app.route('/api/cotacoes/convite/<token>/responder', methods=['POST'])
def api_responder_convite_cotacao(token):
    # Pública (sem login) — mesma exceção acima.
    convite = buscar_convite_por_token(token)
    if not convite:
        return jsonify({"erro": "Link inválido."}), 404
    if not convite["fornecedor_ativo"]:
        return jsonify({"erro": "Esse fornecedor não está mais ativo na rede. Fale com a compradora."}), 410
    if convite['status'] != 'aberta':
        return jsonify({"erro": "Essa cotação já foi respondida."}), 400
    if _prazo_vencido(convite['prazo_validade']):
        return jsonify({"erro": "O prazo pra responder essa cotação já venceu."}), 400
    # Cotação fechada continuava aceitando preço pelo link, e esse preço
    # virava custo do insumo sem ninguém ver (QA 22/09).
    cotacao_do_convite = buscar_cotacao(convite['cotacao_id'])
    if cotacao_do_convite and cotacao_do_convite["status"] != "aberta":
        return jsonify({"erro": "Essa cotação já foi encerrada. Fale com a compradora se ainda quiser mandar preço."}), 409

    dados = request.get_json(silent=True) or {}
    precos_brutos = dados.get('precos') or {}
    # "Não vendo esse item" agora chega junto e fica gravado (QA 22/09).
    try:
        nao_vende = {int(i) for i in (dados.get('naoVende') or [])}
        # "Em falta" (25/09): ele vende, só não tem agora — continua
        # recebendo o item nas próximas cotações.
        em_falta = {int(i) for i in (dados.get('emFalta') or [])}
    except (TypeError, ValueError):
        return jsonify({"erro": "Lista de itens inválida."}), 400
    precos = {}
    try:
        for insumo_id, preco in precos_brutos.items():
            if preco is None or preco == '':
                continue
            preco_float = float(preco)
            # float("Infinity") e float("NaN") passam no > 0 e viram custo de
            # insumo, CMV e margem — o preço do link vem de fora, sem login.
            if not math.isfinite(preco_float) or preco_float <= 0:
                return jsonify({"erro": "Preço precisa ser um número maior que zero."}), 400
            if preco_float > LIMITE_PRECO_UNITARIO:
                return jsonify({"erro": f"Preço acima de R$ {LIMITE_PRECO_UNITARIO:,.0f} por unidade — confira a unidade antes de enviar."}), 400
            precos[int(insumo_id)] = preco_float
    except (TypeError, ValueError):
        return jsonify({"erro": "Preço inválido."}), 400

    # Só o que está no convite dele: um item que saiu da cotação depois que a
    # página abriu ("Atualizar com os homologados") não volta por aqui.
    no_convite = {item["insumo_id"] for item in convite["itens"]}
    precos = {insumo_id: preco for insumo_id, preco in precos.items() if insumo_id in no_convite}
    nao_vende = (nao_vende & no_convite) - set(precos)
    # Marcou os dois sem querer: "em falta" ganha, porque é o que não
    # tranca o insumo pras próximas cotações.
    em_falta = (em_falta & no_convite) - set(precos)
    nao_vende -= em_falta
    responder_convite_cotacao(token, precos, nao_vende, em_falta)
    return jsonify({"ok": True})


@app.route('/api/fornecedores/<int:fornecedor_id>/volta-a-cotar/<int:insumo_id>', methods=['POST'])
def api_voltar_a_pedir_preco(fornecedor_id, insumo_id):
    """Desfaz o "não vendo" permanente que o fornecedor marcou no link: o
    insumo volta a aparecer nas próximas cotações dele. É o conserto de
    quando ele clica sem querer (25/09)."""
    erro_perfil = _exigir_gestao()
    if erro_perfil:
        return erro_perfil
    voltar_a_pedir_preco(fornecedor_id, insumo_id)
    return jsonify({"ok": True})


@app.route('/api/cotacoes/<int:cotacao_id>/gerar-pedidos', methods=['POST'])
def api_gerar_pedidos_cotacao(cotacao_id):
    """Fecha a cotação em pedido(s) de compra — etapa manual e separada de
    marcar o vencedor de cada insumo (pergunta 23 do roteiro de compras:
    ela não quer isso automático)."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    cotacao = buscar_cotacao(cotacao_id)
    if not cotacao:
        return jsonify({"erro": "Cotação não encontrada."}), 404

    # Cotação lançada à mão não tem quebra por loja, e "Gerar pedidos" só
    # enxerga ela: o fornecedor preenchia tudo à toa (QA 22/09). A tela
    # pergunta pra qual loja é, e as quantidades da tabela viram a quebra.
    dados = request.get_json(silent=True) or {}
    loja = (dados.get('loja') or '').strip()
    if not cotacao_tem_quebra_por_loja(cotacao_id):
        if not loja:
            return jsonify({
                "erro": "Essa cotação foi lançada à mão e não diz pra qual loja é a compra. Escolha a loja pra gerar o pedido.",
                "precisaEscolherLoja": True,
                "lojas": [nome for nome in LOJAS if _loja_visivel(nome)],
            }), 409
        if loja not in LOJAS or not _loja_visivel(loja):
            return jsonify({"erro": "Loja inválida."}), 400
        if not atribuir_cotacao_a_loja(cotacao_id, loja):
            return jsonify({"erro": "Nenhum insumo com quantidade nessa cotação. Preencha a coluna Quantidade antes de gerar."}), 400
    elif loja:
        # Quebra já existe e ela escolheu loja: só faz sentido pra manual.
        return jsonify({"erro": "Essa cotação já tem a loja de cada quantidade — não precisa escolher."}), 400

    resultado = gerar_pedidos_de_cotacao(cotacao_id)
    if not resultado["pedidosCriados"]:
        # Clicar duas vezes caía num "erro" que parecia defeito; agora a
        # resposta diz o que de fato aconteceu (QA 22/09).
        if resultado.get("jaTinhamPedido"):
            return jsonify({"erro": "Os pedidos dessa cotação já tinham sido gerados. Veja na tela de Pedidos."}), 409
        return jsonify({"erro": "Nenhum insumo com vencedor escolhido e quantidade pra virar pedido."}), 400
    mensagens = _montar_mensagens_whatsapp_pedidos(resultado["pedidosCriados"])
    return jsonify({"ok": True, **resultado, "mensagensWhatsApp": mensagens})


def _escala_comercial(unidade):
    """g -> ('kg', 1000), ml -> ('L', 1000), resto -> (a própria, 1).
    Espelha `_escalaDeCusto` do script.js: o banco guarda por g/ml/un, mas
    fornecedor e loja falam em kg/L/un (QA 22/09 — a mensagem do pedido saía
    com "Unidade: g" e "Preço Unitário: R$ 0,05")."""
    u = (unidade or '').strip().lower()
    if u in ('g', 'gr'):
        return 'kg', 1000
    if u == 'ml':
        return 'L', 1000
    return (unidade or 'un'), 1


def _fmt_quantidade_pedido(quantidade):
    """35.0 -> '35', 998.2 -> '998.2' — a VMarket mostra a quantidade como
    número cru, sem separador de milhar nem vírgula decimal (diferente do
    valor em R$, que usa _formatar_moeda) — replicado igual no print real
    que a Julia mandou."""
    if quantidade == int(quantidade):
        return str(int(quantidade))
    return str(round(quantidade, 2))


def _texto_bloco_loja_pedido(pedido):
    loja_info = LOJAS.get(pedido["loja"], {})
    nome_fantasia = loja_info.get("nome_fantasia") or pedido["loja"]
    razao_social = loja_info.get("razao_social") or "Não informado"
    cnpj = loja_info.get("cnpj") or "Não informado"

    def _linha_item(item):
        rotulo, fator = _escala_comercial(item['unidade_medida'])
        return (
            f"*{item['nome']}* - \n"
            f"Unidade: {rotulo}\n"
            f"Preço Unitário: R$ {_formatar_moeda(item['preco_unitario'] * fator)}\n"
            f"Quantidade: {_fmt_quantidade_pedido(round(item['quantidade'] / fator, 3))}\n"
            f"Preço Total:  R$ {_formatar_moeda(item['quantidade'] * item['preco_unitario'])}"
        )

    itens_texto = "\n\n".join(_linha_item(item) for item in pedido["itens"])

    return (
        f"Nome Fantasia: *{nome_fantasia}*\n"
        f"Razão Social: {razao_social}\n"
        f"CNPJ: {cnpj}\n"
        f"OC: {pedido['id']}\n\n"
        f"Produtos:\n\n"
        f"{itens_texto}\n\n"
        f"Quantidade de produtos: {pedido['total_itens']}\n"
        f"*Valor Total: R$ {_formatar_moeda(pedido['valor_total'])}*"
    )


def _mensagem_whatsapp_pedido_token(token, ids):
    """Monta o texto pronto pro WhatsApp de todos os pedidos que
    compartilham esse token (= mesmo fornecedor, mesma leva de "Gerar
    pedidos") — estilo VMarket, print de um pedido real que a Julia
    mandou em 2026-09-03. Um bloco por loja quando o mesmo fornecedor
    ganhou insumo em mais de uma loja de uma vez ("Esse pedido foi feito
    em conjunto")."""
    divisor = "------------------------"
    pedidos = [buscar_pedido(pid) for pid in ids]
    fornecedor = buscar_fornecedor_por_id(pedidos[0]["fornecedor_id"])
    # `request.host_url` sozinho devolve http:// em produção — o Flask
    # não sabe que o proxy do Dokploy termina https na frente dele.
    # Achado testando ao vivo (2026-09-04): o link mandado pro
    # fornecedor saía http://, inconsistente com o resto do site.
    esquema = request.headers.get('X-Forwarded-Proto', request.scheme)
    link = f"{esquema}://{request.host}/confirmar_pedido.html?token={token}"
    saudacao = fornecedor["contato_nome"] or fornecedor["nome"]
    prazo = fornecedor["prazo_pagamento"] or "Não Informado"
    # Prazo que veio da VMarket é só o número ("1,00"); lá a mensagem diz
    # "1,00 dias". Texto livre ("7 dias boleto") fica como está.
    if re.fullmatch(r"\d+(?:[.,]\d+)?", prazo.strip()):
        prazo = f"{prazo.strip()} dias"
    entrega = fornecedor["dias_entrega"] or "Não Informado"

    # Linhas em branco exatamente como na mensagem da VMarket que a Julia
    # mandou de modelo (2026-09-11): duas antes dos blocos, duas depois de
    # cada loja, e o total geral colado no link. Pedido de uma loja só
    # segue o mesmo formato, sem o "feito em conjunto".
    cabecalho = (
        f"Olá {saudacao},  gostaria de realizar o pedido que fiz com a *{fornecedor['nome']}*\n\n"
        f"*Prazo de Faturamento: {prazo}*\n*Entrega: {entrega}*\n\n"
        f"*✅ Confirme esse pedido aqui: {link}*"
    )
    conjunto = (
        "*Esse pedido foi feito em conjunto.*\n"
        "Abaixo seguem os pedidos separados de cada uma das empresas:\n\n"
    ) if len(pedidos) > 1 else ""
    blocos_loja = "".join(f"{divisor}\n{_texto_bloco_loja_pedido(p)}\n\n\n" for p in pedidos)
    valor_total_geral = sum(p["valor_total"] for p in pedidos)
    mensagem = (
        f"{cabecalho}\n\n\n"
        f"{conjunto}"
        f"{blocos_loja}{divisor}\n\n"
        f"*Valor total de todos os pedidos: R$ {_formatar_moeda(valor_total_geral)}*\n"
        f"*✅ Confirme esse pedido aqui: {link}*"
    )

    return {
        "fornecedorId": fornecedor["id"],
        "fornecedorNome": fornecedor["nome"],
        "telefone": fornecedor["contato_telefone"],
        "mensagem": mensagem,
    }


def _montar_mensagens_whatsapp_pedidos(pedidos_criados):
    """Agrupa os pedidos recém-criados por token e monta a mensagem de
    cada um (ver `_mensagem_whatsapp_pedido_token`)."""
    ids_por_token = {}
    for pedido_criado in pedidos_criados:
        ids_por_token.setdefault(pedido_criado["token"], []).append(pedido_criado["id"])
    return [_mensagem_whatsapp_pedido_token(token, ids) for token, ids in ids_por_token.items()]


def _formatar_pedido_resumo(pedido):
    dias = dias_esperando_entrega(pedido["status"], pedido["criado_em"], pedido.get("whatsapp_enviado_em"))
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
        "whatsappEnviadoEm": pedido.get("whatsapp_enviado_em"),
        # Aceite do fornecedor pelo link (QA 22/09).
        "confirmadoEm": pedido.get("confirmado_em"),
        # A ressalva que o fornecedor escreveu ao aceitar ("o bacon está em
        # falta", "entrego quinta"): o link prometia "já avisamos" e nada
        # chegava aqui (QA 22/09).
        "observacaoFornecedor": pedido.get("observacao_fornecedor"),
        "recebidoPor": pedido.get("recebido_por"),
        "recebidoEm": pedido.get("recebido_em"),
        "compraFora": bool(pedido.get("compra_fora")),
        "somouEstoque": bool(pedido.get("somou_estoque")),
        "numeroNf": pedido.get("numero_nf"),
        "valorNf": pedido.get("valor_nf"),
        "notaFiscalUrl": f"/api/pedidos/{pedido['id']}/nota-fiscal" if pedido.get("nota_fiscal_arquivo") else None,
        "diasEsperando": dias,
        "atrasado": dias is not None and dias > DIAS_ENTREGA_ATRASADA,
    }


@app.route('/api/pedidos', methods=['GET'])
def api_listar_pedidos():
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    pedidos = _so_da_minha_loja([_formatar_pedido_resumo(p) for p in listar_pedidos()])
    return jsonify({"pedidos": pedidos, "estagios": ESTAGIOS_PEDIDO, "diasEntregaAtrasada": DIAS_ENTREGA_ATRASADA})


@app.route('/api/pedidos/<int:pedido_id>', methods=['GET'])
def api_buscar_pedido(pedido_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    pedido = buscar_pedido(pedido_id)
    if not pedido:
        return jsonify({"erro": "Pedido não encontrado."}), 404
    if not _loja_visivel(pedido['loja']):
        return jsonify({"erro": "Esse pedido é de outra loja."}), 403

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


@app.route('/api/pedidos/whatsapp', methods=['GET'])
def api_mensagens_whatsapp_pedidos():
    """As mensagens de WhatsApp de todos os pedidos ainda não recebidos, de
    uma vez. A tela pedia uma por pedido antes de desenhar a tabela: com 20
    pedidos na fila eram 20 idas ao servidor pra tabela aparecer (QA 22/09)."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    mensagens = {}
    for pedido in listar_pedidos():
        if pedido["status"] != "enviado" or not pedido["token"] or not _loja_visivel(pedido["loja"]):
            continue
        if pedido["token"] in mensagens:
            # Um pedido por loja pode dividir o mesmo token (mesma mensagem).
            mensagens[pedido["id"]] = mensagens[pedido["token"]]
            continue
        pedidos_do_token = buscar_pedidos_por_token(pedido["token"]) or [pedido]
        montada = _mensagem_whatsapp_pedido_token(pedido["token"], [p["id"] for p in pedidos_do_token])
        mensagens[pedido["token"]] = montada
        mensagens[pedido["id"]] = montada
    return jsonify({"mensagens": {str(k): v for k, v in mensagens.items() if isinstance(k, int)}})


@app.route('/api/pedidos/<int:pedido_id>/whatsapp', methods=['GET'])
def api_mensagem_whatsapp_pedido(pedido_id):
    """Reconstrói a mensagem de WhatsApp (com o link de confirmação) de um
    pedido já existente — pro botão "Enviar por WhatsApp" da tela de
    Pedidos. Existe separado de `_montar_mensagens_whatsapp_pedidos`
    porque aquele só roda uma vez, na hora de "Gerar pedidos"; esse serve
    pra reabrir a mensagem depois (o `window.open` automático de lá pode
    ser bloqueado pelo navegador — achado testando ao vivo, 2026-09-04 —
    então esse link precisa poder ser reconstruído a qualquer momento,
    não só na hora da criação)."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    pedido = buscar_pedido(pedido_id)
    if not pedido or not pedido["token"]:
        return jsonify({"erro": "Pedido não encontrado."}), 404
    if not _loja_visivel(pedido['loja']):
        return jsonify({"erro": "Esse pedido é de outra loja."}), 403

    pedidos_do_token = buscar_pedidos_por_token(pedido["token"]) or [pedido]
    mensagem = _mensagem_whatsapp_pedido_token(pedido["token"], [p["id"] for p in pedidos_do_token])
    return jsonify(mensagem)


@app.route('/api/pedidos/<int:pedido_id>/whatsapp-enviado', methods=['POST'])
def api_marcar_pedido_enviado_whatsapp(pedido_id):
    """Clicou em "Enviar por WhatsApp": o pedido (e os da mesma leva, que vão
    na mesma mensagem) sai de "Pendente de envio" pra "Pedido enviado"."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    pedido = buscar_pedido(pedido_id)
    if not pedido or not pedido["token"]:
        return jsonify({"erro": "Pedido não encontrado."}), 404
    if not _loja_visivel(pedido['loja']):
        return jsonify({"erro": "Esse pedido é de outra loja."}), 403
    marcar_pedidos_enviados_whatsapp(pedido["token"])
    return jsonify({"ok": True})


def _etapa_de_compra_fora(pedido_id):
    """Compra feita por fora já nasce recebida: não tem etapa de entrega pra
    andar (voltar faria ela cair em Recebimentos e somar no estoque de novo)."""
    pedido = buscar_pedido(pedido_id)
    if pedido and pedido["compra_fora"]:
        return jsonify({"erro": "Compra feita por fora não tem etapa de entrega. Se lançou errado, exclua e lance de novo."}), 400
    return None


@app.route('/api/pedidos/<int:pedido_id>/avancar', methods=['POST'])
def api_avancar_pedido(pedido_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    erro_etapa = _etapa_de_compra_fora(pedido_id)
    if erro_etapa:
        return erro_etapa

    # Conferir ANTES de mexer: a checagem de loja usava uma variável que não
    # existia aqui e rodava depois de gravar, então a etapa mudava e a
    # chamada estourava erro 500 — e clicar de novo avançava de novo
    # (QA 22/09).
    pedido = buscar_pedido(pedido_id)
    if not pedido:
        return jsonify({"erro": "Pedido não encontrado."}), 404
    if not _loja_visivel(pedido['loja']):
        return jsonify({"erro": "Esse pedido é de outra loja."}), 403
    # Chegar em "recebido" por aqui pulava o Recebimentos inteiro: o estoque
    # não subia, não ficava quem recebeu, nem nota, nem tarefa de divergência.
    indice = ESTAGIOS_PEDIDO.index(pedido['status'])
    if indice + 1 < len(ESTAGIOS_PEDIDO) and ESTAGIOS_PEDIDO[indice + 1] == 'recebido':
        return jsonify({"erro": "Marque o recebimento pela tela de Recebimentos — é ela que soma no estoque e guarda a nota."}), 400

    novo_status = avancar_status_pedido(pedido_id)
    if novo_status is None:
        return jsonify({"erro": "Pedido não encontrado."}), 404
    return jsonify({"ok": True, "status": novo_status})


@app.route('/api/pedidos/<int:pedido_id>/voltar', methods=['POST'])
def api_voltar_pedido(pedido_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    erro_etapa = _etapa_de_compra_fora(pedido_id)
    if erro_etapa:
        return erro_etapa

    pedido = buscar_pedido(pedido_id)
    if not pedido:
        return jsonify({"erro": "Pedido não encontrado."}), 404
    if not _loja_visivel(pedido['loja']):
        return jsonify({"erro": "Esse pedido é de outra loja."}), 403
    # Voltar um pedido já recebido devolvia ele pra fila de Recebimentos sem
    # tirar nada do estoque: confirmar de novo somava tudo outra vez.
    if pedido['status'] == 'recebido':
        return jsonify({"erro": "Esse pedido já foi recebido. Pra desfazer, cancele o recebimento no pedido — voltar etapa faria o estoque ser somado de novo."}), 400

    novo_status = voltar_status_pedido(pedido_id)
    if novo_status is None:
        return jsonify({"erro": "Pedido não encontrado."}), 404
    return jsonify({"ok": True, "status": novo_status})


@app.route('/api/pedidos/<int:pedido_id>/itens', methods=['PUT'])
def api_editar_itens_do_pedido(pedido_id):
    """Corrige um pedido que ainda não chegou: quantidade, preço, tirar item
    e acrescentar item. Recebido não entra — depois da entrega quem manda é a
    conferência do recebimento (QA 22/09)."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    pedido = buscar_pedido(pedido_id)
    if not pedido:
        return jsonify({"erro": "Pedido não encontrado."}), 404
    if not _loja_visivel(pedido['loja']):
        return jsonify({"erro": "Esse pedido é de outra loja."}), 403

    dados = request.get_json(silent=True) or {}
    brutos = dados.get('itens')
    if not isinstance(brutos, list) or not brutos:
        return jsonify({"erro": "O pedido precisa ter pelo menos um item."}), 400
    vistos = set()
    itens = []
    try:
        for bruto in brutos:
            insumo_id = int(bruto['insumoId'])
            if insumo_id in vistos:
                return jsonify({"erro": "O mesmo insumo está duas vezes na lista."}), 400
            vistos.add(insumo_id)
            quantidade = float(bruto['quantidade'])
            preco = float(bruto['precoUnitario'])
            if not quantidade > 0:
                return jsonify({"erro": "Quantidade precisa ser maior que 0 (pra tirar o item, use a lixeira)."}), 400
            if preco < 0:
                return jsonify({"erro": "Preço não pode ser negativo."}), 400
            itens.append({"insumoId": insumo_id, "quantidade": quantidade, "precoUnitario": preco})
    except (KeyError, TypeError, ValueError):
        return jsonify({"erro": "Item inválido na lista."}), 400

    try:
        resultado = substituir_itens_do_pedido(pedido_id, itens)
    except ValueError as falha:
        return jsonify({"erro": str(falha)}), 409

    _anotar_no_registro(
        f'Editou o pedido nº {pedido_id} ({pedido["fornecedor_nome"]} · {pedido["loja"]}): '
        f'{resultado["itensAntes"]} → {resultado["itensDepois"]} itens, '
        f'R$ {resultado["totalAntes"]:.2f} → R$ {resultado["totalDepois"]:.2f}'
    )
    resposta = dict(resultado)
    # O fornecedor já recebeu a mensagem antiga: quem edita precisa reenviar.
    resposta["precisaReenviar"] = bool(pedido["whatsapp_enviado_em"])
    return jsonify(resposta)


@app.route('/api/pedidos/<int:pedido_id>', methods=['DELETE'])
def api_excluir_pedido(pedido_id):
    """Cancela um pedido gerado por engano — libera o insumo pra entrar
    de novo na próxima "Gerar pedidos" dessa cotação."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    pedido = buscar_pedido(pedido_id)
    if not pedido:
        return jsonify({"erro": "Pedido não encontrado."}), 404
    if not _loja_visivel(pedido['loja']):
        return jsonify({"erro": "Esse pedido é de outra loja."}), 403
    # Pedido já recebido somou no estoque: cancelar aqui deixava a mercadoria
    # inflada, sumia com o histórico de compra (o custo voltava pro anterior)
    # e ainda apagava a foto da nota. A lixeira da lista já escondia isso, mas
    # o botão do detalhe continuava aparecendo e o servidor não barrava
    # (QA 22/09). Compra por fora é a exceção: ela devolve as quantidades.
    if pedido["status"] == ESTAGIOS_PEDIDO[-1] and not pedido["compra_fora"]:
        return jsonify({
            "erro": "Esse pedido já foi recebido e somou no estoque. Pra desfazer, ajuste a quantidade em Insumos "
                    "(a nota fiscal e o histórico de compra ficam guardados)."
        }), 409
    excluir_pedido(pedido_id)
    # A nota fiscal fica: é documento da compra, e apagar o arquivo junto com
    # o pedido não tinha como ser desfeito (QA 22/09).
    return jsonify({"ok": True})


def _formatar_pedido_confirmacao(pedido):
    return {
        "id": pedido["id"],
        "loja": pedido["loja"],
        "status": pedido["status"],
        "valorTotal": round(pedido["valor_total"], 2),
        "itens": [
            {
                "nome": item["nome"],
                "unidadeMedida": item["unidade_medida"],
                "quantidade": item["quantidade"],
                "precoUnitario": item["preco_unitario"],
                "precoTotal": round(item["quantidade"] * item["preco_unitario"], 2),
            }
            for item in pedido["itens"]
        ],
    }


@app.route('/api/pedidos/confirmar/<token>', methods=['GET'])
def api_buscar_pedidos_por_token(token):
    # Pública (sem login) — link mandado pro fornecedor confirmar que
    # recebeu o pedido (ver exceção em _exigir_login).
    pedidos = buscar_pedidos_por_token(token)
    # Pedido cancelado sumia e o link virava "Link inválido": o fornecedor
    # podia entregar assim mesmo (QA 22/09).
    cancelados = cancelamentos_por_token(token)
    if not pedidos:
        if cancelados:
            quando = datetime.fromisoformat(cancelados[0]["canceladoEm"]).strftime("%d/%m/%Y")
            return jsonify({"erro": f"Esse pedido foi cancelado em {quando}. Não precisa entregar — fale com a compradora antes de mandar qualquer coisa."}), 410
        return jsonify({"erro": "Link inválido."}), 404
    return jsonify({
        "fornecedorNome": pedidos[0]["fornecedor_nome"],
        "pedidos": [_formatar_pedido_confirmacao(p) for p in pedidos],
        "valorTotal": round(sum(p["valor_total"] for p in pedidos), 2),
        # Só conta como confirmado o que veio DO LINK: antes, alguém de dentro
        # avançar a etapa já fazia a tela do fornecedor dizer "Pedido
        # confirmado!", e ele nem tinha aberto (QA 22/09).
        "jaConfirmado": all(p["confirmado_em"] for p in pedidos),
        "confirmadoEm": next((p["confirmado_em"] for p in pedidos if p["confirmado_em"]), None),
        # Quando só uma loja caiu, o resto do pedido continua valendo.
        "lojasCanceladas": [{"loja": c["loja"], "canceladoEm": c["canceladoEm"]} for c in cancelados],
        # Prazo de pagamento e dia de entrega existiam só no texto do
        # WhatsApp: quem abria o link direto não via nada disso (QA 22/09).
        "prazoPagamento": pedidos[0]["prazo_pagamento"] if "prazo_pagamento" in pedidos[0].keys() else None,
        "diasEntrega": pedidos[0]["dias_entrega"] if "dias_entrega" in pedidos[0].keys() else None,
        "observacaoFornecedor": next((p["observacao_fornecedor"] for p in pedidos
                                      if "observacao_fornecedor" in p.keys() and p["observacao_fornecedor"]), None),
    })


@app.route('/api/pedidos/confirmar/<token>', methods=['POST'])
def api_confirmar_pedidos_por_token(token):
    # Pública (sem login) — mesma exceção acima.
    dados = request.get_json(silent=True) or {}
    # "Esse item eu não tenho", "mando metade", "entrego quinta": era tudo ou
    # nada, e a ressalva não tinha onde caber (QA 22/09).
    observacao = (dados.get('observacao') or '').strip()[:500] or None
    resultado = confirmar_pedidos_por_token(token, observacao)
    if resultado is None:
        return jsonify({"erro": "Link inválido."}), 404
    return jsonify({"ok": True, **resultado})


# --- RECEBIMENTOS (confirmar que um pedido chegou — qualquer pessoa logada,
# não só admin: pedido do Guilherme pra ser a primeira função de verdade que
# a equipe usa, além do admin) ---------------------------------------------

def _formatar_recebimento_resumo(pedido):
    dias = dias_esperando_entrega(pedido["status"], pedido["criado_em"], pedido.get("whatsapp_enviado_em"))
    itens = pedido.get("itens") or []
    return {
        "id": pedido["id"],
        "fornecedorId": pedido["fornecedor_id"],
        "fornecedorNome": pedido["fornecedor_nome"],
        "loja": pedido["loja"],
        "status": pedido["status"],
        "criadoEm": pedido["criado_em"],
        "totalItens": pedido["total_itens"],
        "valorTotal": round(pedido["valor_total"], 2),
        "itensNomes": pedido.get("itens_nomes") or ", ".join(item["nome"] for item in itens),
        "itens": itens,
        "pendenteDeEnvio": pedido["status"] == "enviado" and not pedido.get("whatsapp_enviado_em"),
        "diasEsperando": dias,
        "atrasado": dias is not None and dias > DIAS_ENTREGA_ATRASADA,
        "recebidoEm": pedido.get("recebido_em"),
        "recebidoPor": pedido.get("recebido_por"),
        # Entrega parcial (QA 22/09): já chegou parte e o pedido segue na fila.
        "parcial": any((item.get("quantidadeRecebida") or 0) > 0 for item in itens) and pedido["status"] != "recebido",
        "compraFora": bool(pedido.get("compra_fora")),
        "numeroNf": pedido.get("numero_nf"),
        "divergenciaNf": bool(pedido.get("divergencia_nf")),
        "temNotaFiscal": bool(pedido.get("nota_fiscal_arquivo")),
    }


@app.route('/api/recebimentos', methods=['GET'])
def api_listar_recebimentos():
    recebimentos = _so_da_minha_loja([_formatar_recebimento_resumo(p) for p in listar_pedidos_pendentes_recebimento()])
    return jsonify({"pedidos": recebimentos, "diasEntregaAtrasada": DIAS_ENTREGA_ATRASADA})


@app.route('/api/recebimentos/recebidos', methods=['GET'])
def api_listar_recebidos():
    """Histórico da tela Recebimentos: o que chegou nos últimos `dias` dias
    (padrão 30), hoje incluso."""
    try:
        dias = min(max(int(request.args.get('dias', 30)), 1), 365)
    except (TypeError, ValueError):
        dias = 30
    desde = (date.today() - timedelta(days=dias - 1)).isoformat()
    recebidos = _so_da_minha_loja([_formatar_recebimento_resumo(p) for p in listar_pedidos_recebidos(desde)])
    return jsonify({"pedidos": recebidos, "desde": desde})


@app.route('/api/recebimentos/<int:pedido_id>', methods=['GET'])
def api_buscar_recebimento(pedido_id):
    pedido = buscar_pedido(pedido_id)
    if not pedido:
        return jsonify({"erro": "Pedido não encontrado."}), 404
    if not _loja_visivel(pedido['loja']):
        return jsonify({"erro": "Esse pedido é de outra loja."}), 403

    resposta = _formatar_pedido_resumo(pedido)
    resposta["itens"] = [
        {
            "insumoId": item["insumo_id"],
            "nome": item["nome"],
            "unidadeMedida": item["unidade_medida"],
            "quantidade": item["quantidade"],
            "precoUnitario": item["preco_unitario"],
            # Faltavam na conferência: sem elas a tela não sabia o que já
            # tinha chegado nem em quantas caixas vem (QA 22/09).
            "quantidadePedida": item["quantidade_pedida"],
            "quantidadeRecebida": item["quantidade_recebida"],
            "fatorConversaoCompra": item["fator_conversao_compra"],
            "unidadeCompra": item["unidade_compra"],
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

    # Dia em que a mercadoria chegou (a loja pode confirmar dias depois).
    texto_data = (dados.get('recebidoEm') or '').strip()
    try:
        data_recebimento = date.fromisoformat(texto_data) if texto_data else date.today()
    except ValueError:
        return jsonify({"erro": "Data do recebimento inválida."}), 400
    if data_recebimento > date.today():
        return jsonify({"erro": "A data do recebimento não pode ser depois de hoje."}), 400

    itens_brutos = dados.get('itens') or []
    if not itens_brutos:
        return jsonify({"erro": "Informe ao menos um item recebido."}), 400
    try:
        itens = [
            {
                "insumoId": int(item['insumoId']),
                "quantidade": float(item['quantidade']),
                "precoUnitario": float(item['precoUnitario']),
                # Opcional, por item: vira lote em "Lotes vencendo" (QA 22/09).
                "validade": (item.get('validade') or '').strip() or None,
            }
            for item in itens_brutos
        ]
    except (KeyError, TypeError, ValueError):
        return jsonify({"erro": "Item inválido na lista."}), 400

    pedido = buscar_pedido(pedido_id)
    if not pedido:
        return jsonify({"erro": "Pedido não encontrado."}), 404
    if not _loja_visivel(pedido['loja']):
        return jsonify({"erro": "Esse pedido é de outra loja."}), 403
    if pedido['status'] == 'recebido':
        return jsonify({"erro": "Esse pedido já foi confirmado como recebido."}), 400
    data_pedido = date.fromisoformat(pedido['criado_em'][:10])
    if data_recebimento < data_pedido:
        return jsonify({"erro": f"A data do recebimento não pode ser antes do pedido ({data_pedido.strftime('%d/%m/%Y')})."}), 400

    resultado = confirmar_recebimento_pedido(
        pedido_id, recebido_por, valor_nf, itens, data_recebimento.isoformat(),
        numero_nf=(dados.get('numeroNf') or '').strip() or None,
        # "Deixar o resto pendente": veio menos do que foi pedido e o pedido
        # continua na fila com o que falta (QA 22/09).
        manter_pendente=bool(dados.get('manterPendente')),
    )
    # Quem barra de verdade a segunda confirmação é a própria gravação (a
    # checagem acima pode passar duas vezes ao mesmo tempo, com dois
    # processos no ar) — sem isso o estoque era somado em dobro (QA 22/09).
    if resultado.get("jaRecebido"):
        return jsonify({"erro": "Esse pedido já foi confirmado como recebido."}), 400
    return jsonify({"ok": True, **resultado})


# --- FORNECEDOR HOMOLOGADO E PEDIDO DIRETO (2026-09-16) ----------------------
# O fornecedor homologado e o preço combinado ficam no cadastro do insumo
# (ver _campos_fornecedor_homologado); a Requisição manda esses insumos direto
# em pedido, e "Novo pedido" em Pedidos usa o mesmo preço. Ver seção 6.20.

@app.route('/api/pedidos/direto', methods=['POST'])
def api_criar_pedidos_diretos():
    """Pedido de preço homologado, sem cotação: {fornecedorId, itens:
    [{insumoId, loja, quantidade}]} — um pedido por loja, com um WhatsApp
    só pro fornecedor (ver criar_pedidos_diretos)."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    dados = request.get_json(silent=True) or {}
    try:
        fornecedor_id = int(dados.get('fornecedorId'))
        itens = [
            {"insumoId": int(item['insumoId']), "loja": item['loja'], "quantidade": float(item['quantidade'])}
            for item in dados.get('itens') or []
        ]
    except (KeyError, TypeError, ValueError):
        return jsonify({"erro": "Item inválido na lista."}), 400
    if any(item["loja"] not in LOJAS for item in itens):
        return jsonify({"erro": "Loja inválida."}), 400
    try:
        pedidos = criar_pedidos_diretos(fornecedor_id, itens)
    except ValueError as falha:
        return jsonify({"erro": str(falha)}), 400
    return jsonify({"ok": True, "pedidos": pedidos})


# --- COMPRA FEITA POR FORA (2026-09-17) ---------------------------------------
# Card #36 do ClickUp: mercado, padaria, entrega combinada no WhatsApp entram
# em Pedidos já recebidas, com quem comprou, a data e a nota fiscal (número,
# valor e foto/PDF). Ver lancar_compra_fora e a seção 6.22 da documentação.

EXTENSOES_NOTA_FISCAL = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
TAMANHO_MAXIMO_NOTA_FISCAL = 15 * 1024 * 1024


def _apagar_nota_fiscal(nome_arquivo):
    if not nome_arquivo:
        return
    try:
        os.remove(os.path.join(PASTA_NOTAS_FISCAIS, nome_arquivo))
    except OSError:
        pass


@app.route('/api/pedidos/compra-fora', methods=['POST'])
def api_lancar_compra_fora():
    """Formulário multipart: fornecedorId (cadastrado) ou fornecedorNome
    (novo), loja, compradoPor, dataCompra, numeroNf, valorNf, somarEstoque
    ('1'/'0'), itens (JSON [{insumoId, quantidade, precoUnitario}] na
    unidade do insumo) e o arquivo opcional notaFiscal."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    if (request.content_length or 0) > TAMANHO_MAXIMO_NOTA_FISCAL:
        return jsonify({"erro": "O arquivo da nota passa de 15 MB. Mande uma foto menor."}), 400

    dados = request.form
    loja = _loja_no_escopo(dados.get('loja') or '')
    if loja not in LOJAS:
        return jsonify({"erro": "Escolha a loja da compra."}), 400
    comprado_por = (dados.get('compradoPor') or '').strip()
    if not comprado_por:
        return jsonify({"erro": "Informe quem comprou."}), 400
    try:
        data_compra = date.fromisoformat((dados.get('dataCompra') or '').strip())
    except ValueError:
        return jsonify({"erro": "Informe a data da compra."}), 400
    if data_compra > date.today():
        return jsonify({"erro": "A data da compra não pode ser depois de hoje."}), 400
    texto_valor = (dados.get('valorNf') or '').strip()
    try:
        valor_nf = float(texto_valor) if texto_valor else None
    except ValueError:
        return jsonify({"erro": "Valor da nota inválido."}), 400
    if valor_nf is not None and not valor_nf >= 0:
        return jsonify({"erro": "Valor da nota inválido."}), 400
    try:
        itens = [
            {"insumoId": int(item['insumoId']), "quantidade": float(item['quantidade']),
             "precoUnitario": float(item['precoUnitario'])}
            for item in json.loads(dados.get('itens') or '[]')
        ]
    except (KeyError, TypeError, ValueError):
        return jsonify({"erro": "Item inválido na lista."}), 400
    texto_fornecedor = (dados.get('fornecedorId') or '').strip()
    fornecedor = {"id": int(texto_fornecedor)} if texto_fornecedor.isdigit() else {"nome": dados.get('fornecedorNome') or ''}

    # Mesma compra lançada duas vezes soma o estoque de novo e grava o preço
    # de novo (QA 22/09). Com `confirmarDuplicada`, ela decidiu que é outra.
    if not dados.get('confirmarDuplicada'):
        nome_fornecedor = dados.get('fornecedorNome') or ''
        if texto_fornecedor.isdigit():
            cadastrado = next((f for f in listar_fornecedores() if f['id'] == int(texto_fornecedor)), None)
            nome_fornecedor = cadastrado['nome'] if cadastrado else ''
        parecida = compra_fora_parecida(
            loja, nome_fornecedor, data_compra.isoformat(),
            (dados.get('numeroNf') or '').strip() or None, valor_nf,
        )
        if parecida:
            quando = datetime.fromisoformat(parecida["dia"]).strftime("%d/%m") if parecida["dia"] else "outro dia"
            nota = f"com a nota {parecida['numeroNf']}" if parecida["numeroNf"] else f"de R$ {parecida['total']:.2f}"
            return jsonify({
                "erro": f"Já existe uma compra da {parecida['fornecedor']} {nota} em {quando} (pedido nº {parecida['pedidoId']}). É a mesma?",
                "duplicada": True,
                "pedidoId": parecida["pedidoId"],
            }), 409

    nome_arquivo = None
    arquivo = request.files.get('notaFiscal')
    if arquivo and arquivo.filename:
        extensao = os.path.splitext(arquivo.filename)[1].lower()
        if extensao not in EXTENSOES_NOTA_FISCAL:
            return jsonify({"erro": "A nota tem de ser foto (JPG, PNG ou WEBP) ou PDF."}), 400
        nome_arquivo = f"nf_{uuid.uuid4().hex}{extensao}"
        arquivo.save(os.path.join(PASTA_NOTAS_FISCAIS, nome_arquivo))

    try:
        pedido_id = lancar_compra_fora(
            fornecedor, loja, comprado_por, data_compra.isoformat(), itens,
            numero_nf=(dados.get('numeroNf') or '').strip(), valor_nf=valor_nf,
            somar_estoque=dados.get('somarEstoque') != '0', nota_fiscal_arquivo=nome_arquivo,
        )
    except ValueError as falha:
        _apagar_nota_fiscal(nome_arquivo)
        return jsonify({"erro": str(falha)}), 400
    return jsonify({"ok": True, "pedidoId": pedido_id})


@app.route('/api/pedidos/<int:pedido_id>/nota-fiscal', methods=['POST'])
def api_anexar_nota_fiscal(pedido_id):
    """Anexa (ou troca) a nota de um pedido que já existe: multipart com o
    arquivo `notaFiscal` e/ou o campo `numeroNf`. Quem recebe a mercadoria
    (operação incluída) tira a foto na hora do recebimento — o chefe conta com
    essas fotos (2026-09-18); quando a nota chega depois, por e-mail, a gestão
    anexa pela tela do pedido."""
    erro_acesso = _exigir_equipe()
    if erro_acesso:
        return erro_acesso

    if (request.content_length or 0) > TAMANHO_MAXIMO_NOTA_FISCAL:
        return jsonify({"erro": "A nota fiscal passa de 15 MB."}), 400

    pedido = buscar_pedido(pedido_id)
    if not pedido:
        return jsonify({"erro": "Pedido não encontrado."}), 404
    if not _loja_visivel(pedido['loja']):
        return jsonify({"erro": "Esse pedido é de outra loja."}), 403

    arquivo = request.files.get('notaFiscal')
    # Trocar apaga a foto que estava lá, então fica com admin e gerente.
    if arquivo and arquivo.filename and pedido['nota_fiscal_arquivo'] and _exigir_gestao():
        return jsonify({"erro": "Essa nota já está anexada; só admin ou gerente troca."}), 403

    numero_nf = request.form.get('numeroNf')
    if numero_nf is not None:
        numero_nf = numero_nf.strip()

    nome_arquivo = None
    if arquivo and arquivo.filename:
        extensao = os.path.splitext(arquivo.filename)[1].lower()
        if extensao not in EXTENSOES_NOTA_FISCAL:
            return jsonify({"erro": "A nota tem de ser foto (JPG, PNG ou WEBP) ou PDF."}), 400
        nome_arquivo = f"nf_{uuid.uuid4().hex}{extensao}"
        arquivo.save(os.path.join(PASTA_NOTAS_FISCAIS, nome_arquivo))

    if nome_arquivo is None and numero_nf is None:
        return jsonify({"erro": "Mande a foto/PDF da nota ou o número dela."}), 400

    try:
        anterior = definir_nota_fiscal_pedido(pedido_id, nome_arquivo, numero_nf)
    except Exception:
        _apagar_nota_fiscal(nome_arquivo)
        raise
    # A foto que saiu não é apagada: fica guardada e listada, porque
    # fotografar a nota errada por cima da certa acabava com a certa
    # (QA 22/09).
    guardar_nota_fiscal_substituida(pedido_id, anterior, (_usuario_logado() or {}).get('nome'))

    return jsonify({
        "ok": True,
        "numeroNf": numero_nf if numero_nf is not None else pedido["numero_nf"],
        "notaFiscalUrl": f"/api/pedidos/{pedido_id}/nota-fiscal" if (nome_arquivo or pedido["nota_fiscal_arquivo"]) else None,
    })


@app.route('/api/pedidos/<int:pedido_id>/notas-substituidas', methods=['GET'])
def api_notas_substituidas(pedido_id):
    """Fotos de nota que já foram trocadas nesse pedido — elas continuam
    no disco em vez de sumirem (QA 22/09)."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    pedido = buscar_pedido(pedido_id)
    if not pedido:
        return jsonify({"erro": "Pedido não encontrado."}), 404
    if not _loja_visivel(pedido['loja']):
        return jsonify({"erro": "Esse pedido é de outra loja."}), 403
    return jsonify({"notas": [
        {
            "id": n["id"],
            "quando": n["trocado_em"],
            "quem": n["trocado_por"],
            "url": f"/api/pedidos/{pedido_id}/notas-substituidas/{n['id']}",
        }
        for n in notas_fiscais_substituidas(pedido_id)
    ]})


@app.route('/api/pedidos/<int:pedido_id>/notas-substituidas/<int:nota_id>', methods=['GET'])
def api_abrir_nota_substituida(pedido_id, nota_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    pedido = buscar_pedido(pedido_id)
    if not pedido:
        return jsonify({"erro": "Pedido não encontrado."}), 404
    if not _loja_visivel(pedido['loja']):
        return jsonify({"erro": "Esse pedido é de outra loja."}), 403
    nota = nota_fiscal_substituida(nota_id)
    if not nota or nota["pedido_id"] != pedido_id:
        return jsonify({"erro": "Nota não encontrada."}), 404
    return send_from_directory(PASTA_NOTAS_FISCAIS, nota["arquivo"])


@app.route('/api/pedidos/<int:pedido_id>/nota-fiscal', methods=['GET'])
def api_nota_fiscal_pedido(pedido_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    pedido = buscar_pedido(pedido_id)
    if not pedido or not pedido["nota_fiscal_arquivo"]:
        return jsonify({"erro": "Esse pedido não tem nota fiscal anexada."}), 404
    # A checagem de loja existia no envio e faltava aqui: gerente de uma loja
    # abria a nota de qualquer outra (QA 22/09).
    if not _loja_visivel(pedido["loja"]):
        return jsonify({"erro": "Esse pedido é de outra loja."}), 403
    return send_from_directory(PASTA_NOTAS_FISCAIS, pedido["nota_fiscal_arquivo"])


@app.route('/api/compras/pendencias', methods=['GET'])
def api_pendencias_compras():
    """Quanto está parado em cada etapa de Compras, pros números do menu (ver
    pendencias_compras)."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    return jsonify(pendencias_compras())


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


@app.route('/api/admin/importar-vmarket', methods=['POST'])
def api_importar_da_vmarket():
    """Carga do histórico da VMarket (2026-09-16): fornecedores, cotações,
    pedidos e contagens já no formato do AdmFood — ver `importar_da_vmarket`
    em armazenamento.py. Aceita um lote por vez; rodar de novo não duplica."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    dados = request.get_json(silent=True) or {}
    try:
        return jsonify(importar_da_vmarket(dados, LOJAS))
    except (KeyError, TypeError, ValueError) as falha:
        return jsonify({"erro": f"Carga recusada, nada foi gravado: {falha}"}), 400


@app.route('/api/admin/importar-vmarket', methods=['DELETE'])
def api_desfazer_importacao_vmarket():
    """Desfaz a carga da VMarket (menos pedido já recebido pela loja) — ver
    `desfazer_importacao_vmarket`."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    return jsonify(desfazer_importacao_vmarket())


HORAS_APOS_REABERTURA = 24


def _contagem_fora_do_prazo(contagem):
    """Contagem reaberta ganha uma janela própria (HORAS_APOS_REABERTURA):
    reabrir não mexe no prazo — ele é parte da identidade da requisição —,
    mas a loja precisa conseguir reenviar, senão a requisição inteira trava
    esperando uma loja que não tem mais como responder (QA 22/09)."""
    if not _prazo_vencido(contagem['prazo_validade']):
        return False
    reaberta = contagem['reaberta_em'] if 'reaberta_em' in contagem.keys() else None
    if not reaberta:
        return True
    limite = datetime.fromisoformat(reaberta) + timedelta(hours=HORAS_APOS_REABERTURA)
    return datetime.now() > limite


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
        # Seções que essa contagem cobre — vazio quer dizer a lista inteira
        # (QA 22/09: a requisição pode sair em vários links por loja).
        "secoes": contagem.get('secoes'),
    }


@app.route('/api/contagens', methods=['GET'])
def api_listar_contagens():
    erro_admin = _exigir_equipe()
    if erro_admin:
        return erro_admin
    return jsonify({"contagens": _so_da_minha_loja([_formatar_contagem(c) for c in listar_contagens()])})


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
    # Excluir apagava os pedidos junto, inclusive os recebidos — e sem tirar
    # do estoque o que tinha entrado, deixando mercadoria sem origem e o
    # histórico de compra (que alimenta o custo) com buraco (QA 22/09).
    recebidos = pedidos_recebidos_da_requisicao(titulo, prazo_validade)
    if recebidos:
        lista = ", ".join(f"nº {p['id']} ({p['fornecedor']}, {p['loja']})" for p in recebidos[:5])
        resto = f" e mais {len(recebidos) - 5}" if len(recebidos) > 5 else ""
        return jsonify({"erro":
            f"Essa requisição tem {len(recebidos)} pedido(s) já recebido(s): {lista}{resto}. "
            "O estoque deles já entrou, então apagar aqui deixaria a mercadoria sem origem. "
            "Cancele cada pedido pela tela de Pedidos antes, se for mesmo pra descartar."}), 400
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

    homologado_de = homologados_por_insumo_loja()
    nome_fornecedor = {f['id']: f['nome'] for f in listar_fornecedores()}
    # "Comprar direto" (2026-09-22): quem cota cada item em cada loja vem
    # primeiro na lista de fornecedores, e o último custo sugere o preço.
    cotam_de = mapa_insumo_loja_fornecedores()
    agregados = {}
    for contagem in grupo['contagens']:
        for item in listar_itens_contagem(contagem['id'], contagem['loja']):
            agregado = agregados.setdefault(item['insumoId'], {
                "insumoId": item['insumoId'],
                "nome": item['nome'],
                "categoria": item['categoria'],
                "unidadeMedida": item['unidadeMedida'],
                "fatorConversaoCompra": item.get('fatorConversaoCompra'),
                "custoUnitario": item.get('custoUnitario'),
                "preenchidoTotal": 0.0,
                "idealTotal": 0.0,
                "temIdeal": False,
                "algumAjustado": False,
                "lojas": [],
            })
            # Por loja, o que a compradora vê e decide em "O que comprar"
            # (2026-09-21): sugestão do sistema e a quantidade que vale.
            homologado = homologado_de.get((item['insumoId'], contagem['loja']))
            # "Só nesta compra" (QA 22/09): o combinado avulso vale só nesta
            # requisição e ganha do homologado, sem apagar o do cadastro.
            if item.get('fornecedorAvulsoId') and item.get('precoAvulso'):
                homologado = {
                    "fornecedorId": item['fornecedorAvulsoId'],
                    "fornecedor": nome_fornecedor.get(item['fornecedorAvulsoId'], ''),
                    "preco": item['precoAvulso'],
                    "avulso": True,
                }
            agregado['lojas'].append({
                "fornecedorHomologado": homologado["fornecedor"] if homologado else None,
                # Fornecedor e preço combinado (bloco dos homologados, 2026-09-22).
                "homologado": homologado,
                "forcarCotacao": bool(item.get('forcarCotacao')),
                "cotam": cotam_de.get((item['insumoId'], contagem['loja']), []),
                "loja": contagem['loja'],
                "contagemId": contagem['id'],
                "contado": item['quantidadePreenchida'],
                "ideal": item['quantidadeIdeal'],
                "sugestao": sugestao_de_compra(item),
                "comprar": quantidade_a_comprar(item),
                "editado": item.get('quantidadeCompra') is not None,
            })
            if item['quantidadePreenchida'] is not None:
                agregado['preenchidoTotal'] += item['quantidadePreenchida']
            if item['quantidadeIdeal'] is not None:
                agregado['idealTotal'] += item['quantidadeIdeal']
                agregado['temIdeal'] = True
            if item.get('quantidadeIdealAjustada'):
                agregado['algumAjustado'] = True

    classe_por_insumo = mapa_curva_abc_insumos()
    itens = []
    for agregado in agregados.values():
        deficit = arredondar_quantidade_compra(
            agregado['idealTotal'] - agregado['preenchidoTotal'], agregado['fatorConversaoCompra']
        ) if agregado['temIdeal'] else None
        itens.append({
            "insumoId": agregado['insumoId'],
            "nome": agregado['nome'],
            "categoria": agregado['categoria'],
            "unidadeMedida": agregado['unidadeMedida'],
            "custoUnitario": agregado['custoUnitario'],
            "preenchidoTotal": round(agregado['preenchidoTotal'], 2),
            "idealTotal": round(agregado['idealTotal'], 2) if agregado['temIdeal'] else None,
            "idealAjustado": agregado['algumAjustado'],
            "deficit": deficit,
            # Curva A concentra o custo — o documento pede revisão manual
            # nesses antes de aprovar; o resto pode passar direto.
            "curvaAbc": classe_por_insumo.get(agregado['insumoId']),
            "lojas": agregado['lojas'],
            "comprarTotal": round(sum(loja['comprar'] for loja in agregado['lojas']), 2),
            # Pra onde vai ao gerar (o de cada loja está em lojas[]): o primeiro
            # homologado entre as lojas, pra quem ainda lê no nível do item.
            "fornecedorHomologado": next((l['fornecedorHomologado'] for l in agregado['lojas'] if l['fornecedorHomologado']), None),
        })

    # O que vai pra compra primeiro; depois quem está sem mínimo esperando
    # decisão; por último o que tem estoque. Dentro, por categoria e nome.
    def _ordem(item):
        if item['comprarTotal'] > 0:
            grupo_item = 0
        elif any(loja['ideal'] is None and not loja['editado'] for loja in item['lojas']):
            grupo_item = 1
        else:
            grupo_item = 2
        return (grupo_item, item['categoria'] or '', item['nome'])

    itens.sort(key=_ordem)

    resposta = _formatar_requisicao_resumo(grupo)
    resposta['itens'] = itens
    resposta['jaGerada'] = requisicao_ja_gerada(titulo, prazo_validade)
    # Dois blocos desde 2026-09-22: pedido direto dos homologados e cotação,
    # cada um com seu botão. A situação diz, por item e loja, o que já está
    # em pedido ou na cotação (travado) e o que falta gerar.
    resposta['motivoPedidos'] = motivo_para_nao_reaplicar(titulo, prazo_validade, 'pedidos')
    resposta['motivoCotacao'] = motivo_para_nao_reaplicar(titulo, prazo_validade, 'cotacao')
    resposta['cotacaoId'] = None
    resposta['envios'] = []
    if resposta['totalmenteAprovada']:
        situacao = situacao_compra_requisicao(titulo, prazo_validade)
        for item in itens:
            for loja in item['lojas']:
                loja['situacao'] = situacao.get((item['insumoId'], loja['loja']))
        resposta['cotacaoId'] = next((s['cotacaoId'] for s in situacao.values() if s.get('cotacaoId')), None)
        # Um envio por WhatsApp por fornecedor (os pedidos da mesma leva
        # dividem o token e vão numa mensagem só, "feito em conjunto").
        envios = {}
        for p in pedidos_diretos_da_requisicao(titulo, prazo_validade):
            envio = envios.setdefault(p['token'] or f"pedido-{p['id']}", {
                "fornecedorId": p['fornecedor_id'], "fornecedor": p['fornecedor_nome'],
                "pedidoIds": [], "lojas": [], "enviado": True,
            })
            envio['pedidoIds'].append(p['id'])
            envio['lojas'].append(p['loja'])
            envio['enviado'] = envio['enviado'] and bool(p['whatsapp_enviado_em'] or p['status'] != 'enviado')
        resposta['envios'] = list(envios.values())
    return jsonify(resposta)


@app.route('/api/requisicoes/conferencia/reaplicar-homologados', methods=['POST'])
def api_reaplicar_homologados():
    """Botão "Atualizar com os homologados" da Conferência: refaz a compra de
    uma requisição já gerada com os homologados de agora, sem apagar a
    cotação (ver reaplicar_homologados_requisicao)."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    dados = request.get_json(silent=True) or {}
    titulo = (dados.get('titulo') or '').strip()
    prazo_validade = (dados.get('prazoValidade') or '').strip()
    try:
        resultado = reaplicar_homologados_requisicao(titulo, prazo_validade)
    except ValueError as falha:
        return jsonify({"erro": str(falha)}), 400
    return jsonify(resultado)


@app.route('/api/requisicoes/conferencia/comprar', methods=['PUT'])
def api_definir_quantidade_compra():
    """Quanto comprar de um item numa loja, decidido na Conferência:
    {contagemId, insumoId, quantidade} — quantidade null volta pra sugestão
    do sistema, 0 tira o item da compra."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    dados = request.get_json(silent=True) or {}
    try:
        contagem_id = int(dados.get('contagemId'))
        insumo_id = int(dados.get('insumoId'))
        quantidade = dados.get('quantidade')
        quantidade = None if quantidade is None else float(quantidade)
    except (TypeError, ValueError):
        return jsonify({"erro": "Quantidade inválida."}), 400
    if quantidade is not None and (not math.isfinite(quantidade) or quantidade < 0):
        return jsonify({"erro": "A quantidade tem que ser 0 ou mais."}), 400
    contagem = buscar_contagem(contagem_id)
    if not contagem:
        return jsonify({"erro": "Contagem não encontrada."}), 404
    travado = item_travado_na_requisicao(contagem['descricao'], contagem['prazo_validade'], insumo_id, contagem['loja'])
    if travado:
        return jsonify({"erro": travado}), 409
    if not definir_quantidade_compra(contagem_id, insumo_id, quantidade):
        return jsonify({"erro": "Esse item não está nessa contagem."}), 404
    return jsonify({"ok": True})


@app.route('/api/requisicoes/conferencia/destino', methods=['PUT'])
def api_destino_item_conferencia():
    """"Mover pra cotação" ({cotacao: true}) ou "Voltar pro homologado"
    ({cotacao: false}) de um item de uma loja: {contagemId, insumoId,
    cotacao}. Só enquanto o item não está em pedido nem na cotação."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    dados = request.get_json(silent=True) or {}
    try:
        contagem_id = int(dados.get('contagemId'))
        insumo_id = int(dados.get('insumoId'))
    except (TypeError, ValueError):
        return jsonify({"erro": "Item inválido."}), 400
    contagem = buscar_contagem(contagem_id)
    if not contagem:
        return jsonify({"erro": "Contagem não encontrada."}), 404
    vai_pra_cotacao = bool(dados.get('cotacao'))
    # Sair da cotação é reversível; virar pedido não. Quem está voltando pro
    # pedido direto pode estar numa cotação gerada — solta de lá primeiro,
    # mantendo a quantidade de compra (25/09).
    travado = item_travado_na_requisicao(
        contagem['descricao'], contagem['prazo_validade'], insumo_id, contagem['loja'],
        so_pedido=not vai_pra_cotacao,
    )
    if travado:
        return jsonify({"erro": travado}), 409
    if not vai_pra_cotacao:
        try:
            soltar_loja_do_item_na_cotacao(
                contagem['descricao'], contagem['prazo_validade'], insumo_id, contagem['loja'])
        except ValueError as falha:
            return jsonify({"erro": str(falha)}), 409
    if not definir_forcar_cotacao(contagem_id, insumo_id, vai_pra_cotacao):
        return jsonify({"erro": "Esse item não está nessa contagem."}), 404
    return jsonify({"ok": True})


@app.route('/api/requisicoes/conferencia/fornecedor-avulso', methods=['PUT'])
def api_fornecedor_avulso_conferencia():
    """"Comprar direto · só nesta compra": {contagemId, insumoId,
    fornecedorId, preco} grava o combinado na própria contagem, sem mexer no
    homologado do cadastro da loja. fornecedorId null desfaz."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    dados = request.get_json(silent=True) or {}
    try:
        contagem_id = int(dados.get('contagemId'))
        insumo_id = int(dados.get('insumoId'))
        fornecedor_id = int(dados['fornecedorId']) if dados.get('fornecedorId') else None
        preco = float(dados['preco']) if dados.get('preco') is not None else None
    except (TypeError, ValueError, KeyError):
        return jsonify({"erro": "Item inválido."}), 400
    contagem = buscar_contagem(contagem_id)
    if not contagem:
        return jsonify({"erro": "Contagem não encontrada."}), 404
    # Idem: dá pra tirar o item da cotação pra comprar direto (25/09).
    travado = item_travado_na_requisicao(
        contagem['descricao'], contagem['prazo_validade'], insumo_id, contagem['loja'],
        so_pedido=fornecedor_id is not None,
    )
    if travado:
        return jsonify({"erro": travado}), 409
    if fornecedor_id is not None:
        try:
            soltar_loja_do_item_na_cotacao(
                contagem['descricao'], contagem['prazo_validade'], insumo_id, contagem['loja'])
        except ValueError as falha:
            return jsonify({"erro": str(falha)}), 409
    try:
        gravou = definir_fornecedor_avulso(contagem_id, insumo_id, fornecedor_id, preco)
    except ValueError as falha:
        return jsonify({"erro": str(falha)}), 400
    if not gravou:
        return jsonify({"erro": "Esse item não está nessa contagem."}), 404
    return jsonify({"ok": True})


@app.route('/api/requisicoes/conferencia/gerar-pedidos', methods=['POST'])
def api_gerar_pedidos_homologados():
    """"Gerar pedidos homologados" da Conferência: um pedido por fornecedor e
    loja com o preço combinado, só pros itens do bloco dos homologados."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    dados = request.get_json(silent=True) or {}
    titulo = (dados.get('titulo') or '').strip()
    prazo_validade = (dados.get('prazoValidade') or '').strip()
    try:
        resultado = reaplicar_homologados_requisicao(titulo, prazo_validade, 'pedidos')
    except ValueError as falha:
        return jsonify({"erro": str(falha)}), 400
    if not resultado['pedidos']:
        return jsonify({"erro": "Nenhum item homologado pra pedir."}), 400
    return jsonify(resultado)


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
    # Contagem respondida sem nenhum item preenchido (possível nas que a loja
    # mandou antes da trava de 25/09) era aprovada em silêncio e o estoque
    # dela ficava com o número velho. Aprova mesmo assim — segurar travaria a
    # requisição inteira —, mas devolve quais foram pra tela avisar.
    vazias = []
    for contagem in grupo['contagens']:
        if contagem['status'] == 'respondida':
            if not contagem.get('itens_preenchidos'):
                vazias.append(contagem['loja'])
            aprovar_contagem(contagem['id'])
            aprovadas += 1
    return jsonify({"ok": True, "aprovadas": aprovadas, "vazias": vazias})


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

    # Só o bloco da cotação desde 2026-09-22: os homologados saem no
    # "Gerar pedidos homologados" (ver api_gerar_pedidos_homologados).
    try:
        resultado = reaplicar_homologados_requisicao(titulo, prazo_validade, 'cotacao')
    except ValueError as falha:
        return jsonify({"erro": str(falha)}), 400
    if not resultado['entrouNaCotacao']:
        return jsonify({"erro": "Nenhum item novo pra cotação."}), 400
    return jsonify({"ok": True, "cotacaoId": resultado["cotacaoId"], "entrouNaCotacao": resultado["entrouNaCotacao"]})


@app.route('/api/contatos-contagem', methods=['GET'])
def api_listar_contatos_contagem():
    """Quem conta o estoque de cada loja (recebe o link da contagem)."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    return jsonify({"contatos": [c for c in listar_contatos_contagem() if _loja_visivel(c['loja'])]})


@app.route('/api/contatos-contagem', methods=['POST'])
def api_criar_contato_contagem():
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    dados = request.get_json(silent=True) or {}
    loja = (dados.get('loja') or '').strip()
    nome = (dados.get('nome') or '').strip()
    telefone = re.sub(r'\D', '', dados.get('telefone') or '')
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    if not _loja_visivel(loja):
        return jsonify({"erro": "Essa loja não é a sua."}), 403
    if not nome:
        return jsonify({"erro": "Informe o nome."}), 400
    if len(telefone) < 10:
        return jsonify({"erro": "Informe o WhatsApp com DDD."}), 400
    contato_id = criar_contato_contagem(loja, nome, telefone)
    return jsonify({"id": contato_id, "loja": loja, "nome": nome, "telefone": telefone})


@app.route('/api/contatos-contagem/<int:contato_id>', methods=['DELETE'])
def api_excluir_contato_contagem(contato_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    if not excluir_contato_contagem(contato_id):
        return jsonify({"erro": "Contato não encontrado."}), 404
    return jsonify({"ok": True})


@app.route('/api/contagens', methods=['POST'])
def api_criar_contagem():
    erro_admin = _exigir_equipe()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    loja = _loja_no_escopo((dados.get('loja') or '').strip())
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    descricao = (dados.get('descricao') or '').strip()
    prazo_validade = (dados.get('prazoValidade') or '').strip()
    if not prazo_validade:
        return jsonify({"erro": "Informe o prazo de validade."}), 400
    # Seções que essa contagem cobre (QA 22/09): a requisição pode sair em
    # vários links por loja, um por bloco, pra três pessoas contarem juntas.
    categorias = [str(c).strip() for c in (dados.get('categorias') or []) if str(c).strip()] or None

    # Mesma loja, mesmo título e mesmo prazo é a mesma requisição: o segundo
    # clique devolve a que já existe em vez de abrir uma cópia (QA 22/09).
    ja_existe = contagem_ja_aberta(loja, descricao, prazo_validade, categorias)
    if ja_existe:
        contagem = buscar_contagem(ja_existe)
        return jsonify({"id": ja_existe, "token": contagem["token"], "jaExistia": True})

    resultado = criar_contagem(loja, descricao, prazo_validade, categorias)
    return jsonify(resultado)


@app.route('/api/contagens/<int:contagem_id>', methods=['GET'])
def api_buscar_contagem(contagem_id):
    erro_admin = _exigir_equipe()
    if erro_admin:
        return erro_admin

    contagem = buscar_contagem(contagem_id)
    if not contagem:
        return jsonify({"erro": "Contagem não encontrada."}), 404
    if not _loja_visivel(contagem['loja']):
        return jsonify({"erro": "Essa contagem é de outra loja."}), 403

    resposta = _formatar_contagem(contagem)
    resposta['itens'] = listar_itens_contagem(contagem_id, contagem['loja'])
    return jsonify(resposta)


@app.route('/api/contagens/<int:contagem_id>', methods=['DELETE'])
def api_excluir_contagem(contagem_id):
    """Tira UMA loja da requisição. Só dava pra apagar a requisição inteira,
    então a contagem presa de uma loja (link que ninguém respondeu, loja que
    entrou por engano) segurava tudo em "Aguardando lojas" (QA 22/09)."""
    erro = _exigir_gestao()
    if erro:
        return erro

    contagem = buscar_contagem(contagem_id)
    if not contagem:
        return jsonify({"erro": "Contagem não encontrada."}), 404
    if not _loja_visivel(contagem['loja']):
        return jsonify({"erro": "Essa contagem é de outra loja."}), 403

    try:
        excluir_contagem(contagem_id)
    except ValueError as recusa:
        return jsonify({"erro": str(recusa)}), 400
    _anotar_no_registro(f"Tirou {contagem['loja']} da requisição \"{contagem['descricao']}\"")
    return jsonify({"sucesso": True})


@app.route('/api/contagens/<int:contagem_id>/aprovar', methods=['POST'])
def api_aprovar_contagem(contagem_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    contagem = buscar_contagem(contagem_id)
    if not contagem:
        return jsonify({"erro": "Contagem não encontrada."}), 404
    if not _loja_visivel(contagem['loja']):
        return jsonify({"erro": "Essa contagem é de outra loja."}), 403
    if contagem['status'] == 'aprovada':
        return jsonify({"erro": "Essa contagem já foi aprovada."}), 400

    resultado = aprovar_contagem(contagem_id) or {}
    return jsonify({"ok": True, **resultado})


@app.route('/api/contagens/<int:contagem_id>/reabrir', methods=['POST'])
def api_reabrir_contagem(contagem_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    contagem = buscar_contagem(contagem_id)
    if not contagem:
        return jsonify({"erro": "Contagem não encontrada."}), 404
    if not _loja_visivel(contagem['loja']):
        return jsonify({"erro": "Essa contagem é de outra loja."}), 403
    # Aberta e ainda no prazo não tem o que reabrir; aberta com o prazo
    # vencido tem: é a loja que não respondeu a tempo e ficou sem como
    # responder, travando a requisição inteira (QA 22/09).
    if contagem['status'] == 'aberta' and not _contagem_fora_do_prazo(contagem):
        return jsonify({"erro": "Essa contagem já está aberta e dentro do prazo."}), 400

    reabrir_contagem(contagem_id)
    return jsonify({"ok": True, "horasParaResponder": HORAS_APOS_REABERTURA})


@app.route('/api/insumos/<int:insumo_id>/quantidade-ideal', methods=['PUT'])
def api_ajustar_quantidade_ideal(insumo_id):
    """Sobrescreve manualmente a quantidade ideal calculada, quando o
    número não bate com o que a Kethllyn sabe da realidade da loja (ver
    seção 9 da documentação, 'Quantidade ideal inteligente')."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    loja = _loja_no_escopo(request.args.get('loja'))
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
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    loja = _loja_no_escopo(request.args.get('loja'))
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400

    excluir_ajuste_quantidade_ideal(loja, insumo_id)
    return jsonify({"ok": True})


@app.route('/api/insumos/ajustes-quantidade-ideal', methods=['DELETE'])
def api_remover_ajustes_quantidade_ideal_da_loja():
    """Remove todos os ajustes manuais de quantidade ideal de uma loja de
    uma vez — pra desfazer em lote um import que virou ajuste sem
    querer, em vez de precisar remover um por um."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin

    loja = _loja_no_escopo(request.args.get('loja'))
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400

    removidos = excluir_ajustes_quantidade_ideal_da_loja(loja)
    return jsonify({"ok": True, "removidos": removidos})


@app.route('/api/insumos/ajustes-quantidade-ideal/lote', methods=['POST'])
def api_ajustar_quantidade_ideal_lote():
    """Ajusta a quantidade ideal de vários insumos de uma vez, pra não
    precisar passar um por um quando a Ficha Técnica ainda não calcula
    sozinha pra muitos insumos."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    loja = _loja_no_escopo(dados.get('loja'))
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


@app.route('/api/insumos/quantidades-atuais/lote', methods=['POST'])
def api_atualizar_quantidades_atuais_lote():
    """Atualiza a quantidade EM ESTOQUE (não a ideal) de vários insumos de
    uma vez — pra importar contagem física ou relatório externo sem
    editar um por um pelo lápis. `minimos` é opcional: quando vem, o
    estoque mínimo daquele insumo também é sobrescrito."""
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    loja = _loja_no_escopo(dados.get('loja'))
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400

    def _numeros(brutos):
        saida = {}
        for insumo_id, valor in (brutos or {}).items():
            if valor is None or valor == '':
                continue
            valor_float = float(valor)
            if valor_float < 0:
                raise ValueError('negativo')
            saida[int(insumo_id)] = valor_float
        return saida

    try:
        valores = _numeros(dados.get('valores'))
        minimos = _numeros(dados.get('minimos'))
    except ValueError as erro:
        if str(erro) == 'negativo':
            return jsonify({"erro": "Nenhum valor pode ser negativo."}), 400
        return jsonify({"erro": "Valor inválido."}), 400
    except TypeError:
        return jsonify({"erro": "Valor inválido."}), 400

    if not valores:
        return jsonify({"erro": "Preencha pelo menos um insumo."}), 400

    salvos = salvar_quantidades_atuais_em_lote(loja, valores, minimos)
    return jsonify({"ok": True, "salvos": salvos})


@app.route('/api/insumos/ajustes-quantidade-ideal', methods=['GET'])
def api_ajustes_quantidade_ideal():
    """Ajustes manuais de quantidade ideal de uma loja — usado pela tela de
    Estoque pra mostrar o mesmo valor ajustado que já vale na Contagem
    (leitura liberada pra todo mundo logado, igual o resto do Estoque)."""
    loja = _loja_no_escopo(request.args.get('loja'))
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
    loja = _loja_no_escopo(dados.get('loja') or None)

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
    # O custo de cada insumo e o "Previsão compra" em R$ viajavam no link sem
    # login: quem recebe o link (ou quem ele reenviar) via quanto a rede paga
    # em cada item (QA 22/09). A sugestão de QUANTO comprar fica — é o que
    # quem conta precisa ver; o dinheiro só aparece pra quem entra no sistema.
    resposta['itens'] = [
        {**item, 'custoUnitario': None}
        for item in listar_itens_contagem(contagem['id'], contagem['loja'])
    ]
    resposta['expirada'] = contagem['status'] == 'aberta' and _contagem_fora_do_prazo(contagem)
    return jsonify(resposta)


@app.route('/api/contagens/token/<token>/responder', methods=['POST'])
def api_responder_contagem(token):
    # Pública (sem login) — mesma exceção acima.
    contagem = buscar_contagem_por_token(token)
    if not contagem:
        return jsonify({"erro": "Link inválido."}), 404
    if contagem['status'] != 'aberta':
        return jsonify({"erro": "Essa contagem já foi respondida."}), 400
    if _contagem_fora_do_prazo(contagem):
        return jsonify({"erro": "O prazo para preencher essa contagem já venceu. Peça pra reabrirem o link."}), 400

    dados = request.get_json(silent=True) or {}
    valores_brutos = dados.get('valores') or {}
    valores = {}
    try:
        for insumo_id, quantidade in valores_brutos.items():
            if quantidade is None or quantidade == '':
                continue
            quantidade_float = float(quantidade)
            # Mesma trava do link do fornecedor (QA 22/09), que aqui faltava:
            # o JSON aceita Infinity e NaN escritos na mão, e os dois passam
            # no teste de negativo. Infinity vira quantidade_atual da loja e
            # contamina soma, déficit e CMV; NaN o SQLite grava como NULL, e
            # o item conta como não preenchido sem ninguém perceber. O link é
            # público, sem login.
            if not math.isfinite(quantidade_float) or quantidade_float < 0:
                return jsonify({"erro": "Quantidade precisa ser um número de 0 pra cima."}), 400
            if quantidade_float > LIMITE_QUANTIDADE_CONTAGEM:
                return jsonify({"erro": "Quantidade alta demais — confira a unidade antes de enviar."}), 400
            valores[int(insumo_id)] = quantidade_float
    except (TypeError, ValueError):
        return jsonify({"erro": "Quantidade inválida."}), 400
    # Envio sem nenhum item preenchido fechava a contagem do mesmo jeito: a
    # loja aparecia como "respondida", a aprovação não gravava nada e a
    # requisição seguia como se tivessem contado.
    if not valores:
        return jsonify({"erro": "Preencha a quantidade de pelo menos um item antes de enviar."}), 400

    responder_contagem(token, valores)
    return jsonify({"ok": True})


@app.route('/api/faturamento-ontem', methods=['GET'])
def api_faturamento_ontem():
    # Faturamento é só do admin (ela decidiu assim em 22/09; antes do QA a rota
    # nem perfil conferia e devolvia a rede inteira pra qualquer pessoa logada).
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
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
    lojas = _so_da_minha_loja(lojas, campo='nome')
    total_rede = sum(l["total"] for l in lojas)

    # A Home não dizia que faltava loja: quem não sincronizou entrava com zero
    # e sumia do ranking, então o total aparecia menor sem nenhuma marca
    # (QA 22/09).
    return jsonify({
        "data": ontem, "total_rede": total_rede, "lojas": lojas,
        "lojasComDado": sum(1 for l in lojas if l["sucesso"]),
        "lojasNoTotal": len(lojas),
        "semDado": [l["nome"] for l in lojas if not l["sucesso"]],
    })


@app.route('/api/faturamento-rede-diario', methods=['GET'])
def api_faturamento_rede_diario():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
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

    # Dia sem venda nenhuma entra como zero: sumindo do gráfico, a queda não
    # aparecia — a linha só ligava os dias que existiam (QA 22/09).
    por_dia = {
        (inicio + timedelta(days=i)).isoformat(): 0.0
        for i in range((fim - inicio).days + 1)
    }
    for l in linhas:
        if l["dia"] in por_dia:
            por_dia[l["dia"]] += l["faturamento_dia"]

    dias_ordenados = sorted(por_dia.keys())
    return jsonify({
        # A tela de canais montava a própria janela de 7 dias no navegador,
        # em UTC: depois das 21h ela andava um dia e os dois gráficos da Home
        # mostravam semanas diferentes (QA 22/09). Agora ela usa esta.
        "periodo": {"inicio": inicio.isoformat(), "fim": fim.isoformat()},
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
    """Mostrava os 4 primeiros E os 4 últimos caracteres do token da Cardápio
    Web, pra qualquer pessoa logada — nem perfil a rota conferia (QA 22/09).
    Agora só o admin vê, e só os 4 últimos, o suficiente pra ele conferir
    QUAL token está lá sem entregar pedaço utilizável do segredo."""
    if not token:
        return "— não configurado —"
    if len(token) <= 8:
        return "•" * 12
    return f"{'•' * 8}{token[-4:]}"


@app.route('/api/config/lojas/<loja>/virada', methods=['PUT'])
def api_definir_hora_virada(loja):
    """A que horas o dia vira pra uma loja: {hora: "05:00"}. Antes dessa
    hora, a venda pertence ao dia anterior — é o que põe a venda das 2h da
    manhã no dia em que a loja abriu (25/09). 00:00 volta ao padrão.

    Só muda dali pra frente: o que já está gravado tem só a data. A
    reconferência das 6h refaz os últimos 7 dias sozinha; mais antigo que
    isso precisa da carga de histórico."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    if loja not in LOJAS:
        return jsonify({"erro": "Loja não encontrada."}), 404
    dados = request.get_json(silent=True) or {}
    try:
        hora = definir_hora_virada(loja, dados.get('hora'), (_usuario_logado() or {}).get('nome'))
    except ValueError as falha:
        return jsonify({"erro": str(falha)}), 400
    return jsonify({"ok": True, "horaVirada": hora})


@app.route('/api/config/lojas', methods=['GET'])
def api_config_lojas():
    ultimo_dia = buscar_ultima_sincronizacao()
    ehAdmin = (_usuario_logado() or {}).get('papel') == 'admin'
    viradas = horas_virada_das_lojas()
    lojas = []
    # Gerente e operação viam "4 lojas conectadas" e o nome das outras nas
    # pílulas do topo de Configurações: a rota não olhava o perfil (QA 22/09).
    for nome, cfg in LOJAS.items():
        if not _loja_visivel(nome):
            continue
        ultimo_dia_loja = buscar_ultima_sincronizacao(nome)
        linha = {
            "nome": nome,
            "temPresencial": nome in UNIDADES_COM_PRESENCIAL,
            "ultimaSincronizacao": _formatar_data_br(ultimo_dia_loja) if ultimo_dia_loja else None,
            # A que horas o dia vira pra essa loja (25/09).
            "horaVirada": viradas.get(nome, VIRADA_PADRAO),
        }
        if ehAdmin:
            linha["tokenMascarado"] = _mascarar_token(cfg.get("cardapio_web_token"))
        else:
            linha["tokenMascarado"] = "conectada" if cfg.get("cardapio_web_token") else "— não configurado —"
        lojas.append(linha)
    # Quando a sincronização automática de fato rodou (o relógio do
    # navegador não sabe disso): a tela carimba essa hora, não a dela
    # (QA 22/09).
    execucoes = listar_execucoes_rotina()
    rodou_em = max(
        (execucoes[nome]["ultimaEm"] for nome in ("sincronizacao_hoje", "sincronizacao_diaria") if nome in execucoes),
        default=None,
    )
    return jsonify({
        "ultimaSincronizacao": _formatar_data_br(ultimo_dia) if ultimo_dia else None,
        "sincronizadoEm": rodou_em,
        # Pela data que a sincronização gravou, não pela última com venda:
        # loja fechada em feriado grava zero e aparecia como atrasada
        # (QA 22/09).
        "lojasAtrasadas": [
            l["nome"] for l in lojas
            if not _sincronizacao_em_dia(ultimo_dia_sincronizado(l["nome"]), date.today())
        ],
        "lojas": lojas,
    })


# Uma sincronização manual por vez. Cada clique abria uma execução nova, e
# duas ao mesmo tempo disputam o limite da Cardápio Web (5 chamadas por
# minuto): as duas voltam pela metade (QA 22/09). É por processo, que é onde
# a thread roda — o agendamento entre workers tem a trava dele
# (_sou_o_unico_worker_a_agendar).
_SINCRONIZACAO_MANUAL = {"rodando": False, "desde": None, "dia": None, "ultima": None}
_TRAVA_SINCRONIZACAO_MANUAL = threading.Lock()


def _sincronizar_lojas_em_segundo_plano(dia_alvo):
    erro = None
    try:
        # Mesmo caminho da sincronização automática.
        sincronizar_dia(dia_alvo)
    except Exception as falha:  # noqa: BLE001 — o resultado precisa chegar na tela
        erro = str(falha)
        import traceback
        traceback.print_exc()
    finally:
        with _TRAVA_SINCRONIZACAO_MANUAL:
            _SINCRONIZACAO_MANUAL["rodando"] = False
            _SINCRONIZACAO_MANUAL["ultima"] = {
                "dia": dia_alvo.isoformat(),
                "terminouEm": datetime.now().isoformat(),
                "erro": erro,
            }


# Pedidos que o faturamento não conta (2026-09-18): a semana do Artesanos não
# batia com a planilha no iFood e no 99, sempre com o sistema abaixo. O
# sistema só soma pedido "fechado" ou "entregue" na Cardápio Web; pedido
# despachado e nunca finalizado fica de fora, mas o painel deles conta. Uma
# loja e um dia por vez: o histórico da Cardápio Web aceita 5 chamadas por
# minuto e o detalhe de cada pedido é mais uma chamada.
MAXIMO_DETALHES_PEDIDOS_ABERTOS = 40


# Extensão do WhatsApp instalada à mão (2026-09-18: sem a Chrome Web Store por
# enquanto, decisão dela). O zip é montado na hora a partir da pasta do
# repositório, então baixar traz sempre a versão que está no ar — e a tela
# compara com a instalada pra avisar quando tem versão nova.
PASTA_EXTENSAO_WHATSAPP = os.path.join(DIRETORIO_BASE, 'extensao-whatsapp')
ARQUIVOS_DA_EXTENSAO = ('manifest.json', 'background.js', 'script-sistema.js', 'script-whatsapp.js')


def _versao_extensao_whatsapp():
    with open(os.path.join(PASTA_EXTENSAO_WHATSAPP, 'manifest.json'), encoding='utf-8') as arquivo:
        return json.load(arquivo)['version']


@app.route('/api/extensao-whatsapp/versao', methods=['GET'])
def api_versao_extensao_whatsapp():
    erro_acesso = _exigir_gestao()
    if erro_acesso:
        return erro_acesso
    return jsonify({"versao": _versao_extensao_whatsapp()})


@app.route('/api/extensao-whatsapp/pacote.zip', methods=['GET'])
def api_pacote_extensao_whatsapp():
    erro_acesso = _exigir_gestao()
    if erro_acesso:
        return erro_acesso
    versao = _versao_extensao_whatsapp()
    pacote = io.BytesIO()
    with zipfile.ZipFile(pacote, 'w', zipfile.ZIP_DEFLATED) as zip_saida:
        for nome in ARQUIVOS_DA_EXTENSAO:
            zip_saida.write(os.path.join(PASTA_EXTENSAO_WHATSAPP, nome), f'admfood-whatsapp/{nome}')
        pasta_icones = os.path.join(PASTA_EXTENSAO_WHATSAPP, 'icones')
        for icone in sorted(os.listdir(pasta_icones)):
            if icone.endswith('.png'):
                zip_saida.write(os.path.join(pasta_icones, icone), f'admfood-whatsapp/icones/{icone}')
    pacote.seek(0)
    return send_file(pacote, mimetype='application/zip', as_attachment=True,
                     download_name=f'admfood-whatsapp-{versao}.zip')


@app.route('/api/admin/pedidos-nao-finalizados', methods=['GET'])
def api_pedidos_nao_finalizados():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    unidade = request.args.get('unidade')
    if unidade not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    try:
        dia = date.fromisoformat(request.args.get('dia') or '')
    except ValueError:
        return jsonify({"erro": "Dia inválido (use AAAA-MM-DD)."}), 400
    token = LOJAS[unidade].get("cardapio_web_token")
    if not token:
        return jsonify({"erro": "Loja sem token da Cardápio Web."}), 400

    try:
        pedidos = buscar_pedidos_do_dia(token, dia, horas_virada_das_lojas().get(unidade, VIRADA_PADRAO))
    except Exception as falha:
        return jsonify({"erro": f"A Cardápio Web não respondeu: {falha}"}), 502

    por_status = {}
    for pedido in pedidos:
        por_status[pedido["status"]] = por_status.get(pedido["status"], 0) + 1
    # Cancelado não é venda: só entra na contagem por status.
    abertos = [
        p for p in pedidos
        if p["status"] not in STATUS_CONCLUIDOS and "cancel" not in (p["status"] or "").lower()
    ]
    lista = []
    for pedido in abertos[:MAXIMO_DETALHES_PEDIDOS_ABERTOS]:
        item = {
            "id": pedido["id"],
            "canal": pedido["sales_channel"],
            "status": pedido["status"],
            "criadoEm": pedido["created_at"],
            "atualizadoEm": pedido["updated_at"],
        }
        try:
            detalhes = buscar_detalhes_pedido(token, pedido["id"])
            item["numero"] = detalhes.get("display_id") or detalhes.get("code")
            item["total"] = round(_total_com_desconto_ifood(detalhes, pedido["sales_channel"]), 2)
        except Exception:
            item["total"] = None
        lista.append(item)
        time.sleep(0.65)

    return jsonify({
        "unidade": unidade,
        "dia": dia.isoformat(),
        "totalPedidos": len(pedidos),
        "porStatus": por_status,
        "naoFinalizados": lista,
        "naoFinalizadosSemDetalhe": max(0, len(abertos) - MAXIMO_DETALHES_PEDIDOS_ABERTOS),
    })


@app.route('/api/sincronizar-agora', methods=['POST'])
def api_sincronizar_agora():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
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

    # Segunda-feira sincroniza como qualquer dia desde 2026-09-18 (ver
    # sincronizar.py): o `forcar=1` de antes, pra feriado aberto, não é mais
    # preciso.

    # Roda em segundo plano e responde na hora — sincronizar as 4 lojas pedido
    # por pedido pode passar do tempo que o proxy/gateway de produção espera
    # por uma resposta, derrubando a conexão no meio do processo (e deixando
    # dado só parcialmente atualizado). O resultado final aparece na tela de
    # Configurações/Home assim que a atualização automática buscar de novo.
    with _TRAVA_SINCRONIZACAO_MANUAL:
        if _SINCRONIZACAO_MANUAL["rodando"]:
            return jsonify({
                "erro": f"Já tem uma sincronização rodando (de {_formatar_data_br(_SINCRONIZACAO_MANUAL['dia'])}, "
                        f"começou às {_SINCRONIZACAO_MANUAL['desde'][11:16]}). Espere ela terminar: duas ao mesmo "
                        "tempo disputam o limite da Cardápio Web e as duas voltam pela metade.",
                "jaRodando": True,
            }), 409
        _SINCRONIZACAO_MANUAL.update(rodando=True, desde=datetime.now().isoformat(), dia=dia_alvo.isoformat())

    threading.Thread(target=_sincronizar_lojas_em_segundo_plano, args=(dia_alvo,), daemon=True).start()

    return jsonify({
        "diaLabel": _formatar_data_br(dia_alvo.isoformat()),
        "fechado": False,
        "iniciado": True,
    })


@app.route('/api/sincronizar-agora', methods=['GET'])
def api_estado_sincronizacao():
    """Se ainda está rodando e como terminou a última — o dia que falhava só
    aparecia no log do servidor (QA 22/09)."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    with _TRAVA_SINCRONIZACAO_MANUAL:
        estado = dict(_SINCRONIZACAO_MANUAL)
    return jsonify({
        "rodando": estado["rodando"],
        "dia": estado["dia"],
        "desde": estado["desde"],
        "ultima": estado["ultima"],
    })


@app.route('/api/venda-presencial', methods=['POST'])
def api_salvar_venda_presencial():
    # Lançar (e apagar) venda presencial mexe em faturamento, ticket médio e
    # resultado semanal: só admin (pedido dela, 22/09).
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    dados = request.get_json(silent=True) or {}
    unidade = _loja_no_escopo(dados.get('unidade'))
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
    # A data não era validada: dava pra lançar em 2027 e o valor sumia do
    # período que ela olha (QA 22/09).
    try:
        dia_alvo = date.fromisoformat(dia)
    except ValueError:
        return jsonify({"erro": "Data inválida."}), 400
    if dia_alvo > date.today():
        return jsonify({"erro": "Não dá pra lançar venda de um dia que ainda não aconteceu."}), 400

    # Segundo lançamento do mesmo dia apagava o primeiro em silêncio, e com
    # ele mudavam faturamento, ticket e o resultado da semana (QA 22/09).
    anterior = salvar_venda_presencial(unidade, dia, valor, quantidade)
    if anterior:
        _anotar_no_registro(
            f'Trocou a venda presencial de {unidade} em {_formatar_data_br(dia)}: '
            f'R$ {anterior["valor"]:.2f} → R$ {valor:.2f}'
        )
    return jsonify({"sucesso": True, "substituiu": anterior})


@app.route('/api/venda-presencial', methods=['DELETE'])
def api_excluir_venda_presencial():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    unidade = _loja_no_escopo(request.args.get('unidade'))
    dia = request.args.get('dia')

    if unidade not in UNIDADES_COM_PRESENCIAL:
        return jsonify({"erro": "Unidade inválida para lançamento presencial."}), 400
    if not dia:
        return jsonify({"erro": "Informe o dia."}), 400

    excluir_venda_presencial(unidade, dia)
    return jsonify({"sucesso": True})


@app.route('/api/venda-presencial', methods=['GET'])
def api_listar_venda_presencial():
    unidade = _loja_no_escopo(request.args.get('unidade'))
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
    unidade = _loja_no_escopo(request.args.get('unidade', 'geral'))
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
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    dados = request.get_json(silent=True) or {}
    unidade = _loja_no_escopo(dados.get('unidade'))
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
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin

    unidade = _loja_no_escopo(request.args.get('unidade'))
    dia = request.args.get('dia')
    canal = request.args.get('canal')
    if not unidade or not dia or not canal:
        return jsonify({"erro": "Informe loja, dia e canal."}), 400

    excluir_ajuste_canal(unidade, dia, canal)
    return jsonify({"ok": True})


@app.route('/api/faturamento-mesmo-dia-semana', methods=['GET'])
def api_faturamento_mesmo_dia_semana():
    # Pra montar a comparação do relatório do WhatsApp: o próprio dia +
    # as últimas 4 ocorrências ANTERIORES desse mesmo dia da semana,
    # atravessando virada de mês livremente (pedido do chefe da Julia,
    # 2026-09-03 — antes era só "dentro do mês corrente", o que dava menos
    # de 4 comparações no início do mês).
    unidade = _loja_no_escopo(request.args.get('unidade'))
    dia = request.args.get('dia')

    if unidade not in LOJAS:
        return jsonify({"erro": "Unidade inválida."}), 400
    if not dia:
        return jsonify({"erro": "Informe o dia."}), 400
    try:
        data_ref = date.fromisoformat(dia)
    except ValueError:
        return jsonify({"erro": "Data inválida."}), 400

    # Janela de 12 semanas pra trás é folga de sobra pra sempre achar as
    # últimas 4 ocorrências mesmo com algum dia sem faturamento registrado
    # no meio (feriado, loja fechada); só as últimas 4 + o próprio dia
    # entram na resposta, o resto da janela é só margem de busca.
    inicio_janela = data_ref - timedelta(weeks=12)
    linhas = _aplicar_presencial(
        buscar_faturamento_periodo(inicio_janela.isoformat(), dia),
        buscar_presencial_periodo(inicio_janela.isoformat(), dia),
    )
    # Ajuste manual de canal (seção 6.3) — sem isso, um dia com painel da
    # Cardápio Web divergente da API mostra o valor bruto errado aqui, feito
    # essa rota nunca aplicava a correção que o resto do sistema já aplica
    # (achado em produção em 2026-09-03: 05/08 da Hamburgueria Artesanos
    # aparecia como R$ 262.555,62 no relatório, contra R$ 6.307,98 de
    # verdade em Insights, exatamente por essa rota pular esse passo).
    linhas_canais = _linhas_canais_com_presencial(inicio_janela.isoformat(), dia)
    ajustes = buscar_ajustes_canal_periodo(inicio_janela.isoformat(), dia)
    _, linhas = _aplicar_ajustes_canal(linhas_canais, linhas, ajustes)
    linhas = [
        l for l in linhas
        if l["unidade"] == unidade and date.fromisoformat(l["dia"]).weekday() == data_ref.weekday()
    ]
    linhas.sort(key=lambda l: l["dia"])
    anteriores = [l for l in linhas if l["dia"] < dia][-4:]
    hoje = [l for l in linhas if l["dia"] == dia]
    linhas = anteriores + hoje

    return jsonify({
        "diaSemana": DIAS_SEMANA_COMPLETO[data_ref.weekday()],
        "ocorrencias": [
            {
                "dia": _formatar_data_br(l["dia"]),
                "diaIso": l["dia"],
                "faturamento": _formatar_moeda(l["faturamento_dia"]),
                "faturamentoNumero": l["faturamento_dia"],
            }
            for l in linhas
        ],
    })


@app.route('/api/insights', methods=['GET'])
def api_insights():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
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
            None, linhas_periodo, "Visão Geral (Todas)", linhas_canais, canal_data_label,
            periodo=(inicio, fim),
        )
    }
    for nome_unidade in LOJAS.keys():
        resposta[nome_unidade] = _montar_bloco(
            nome_unidade, linhas_periodo, nome_unidade, linhas_canais, canal_data_label,
            periodo=(inicio, fim),
        )

    resposta["geral"].update(_cards_periodo(None, linhas_periodo))
    for nome_unidade in LOJAS.keys():
        resposta[nome_unidade].update(_cards_periodo(nome_unidade, linhas_periodo))

    return jsonify(resposta)


# Nomes de exibição dos canais pra rede toda — mesma regra da Visão Geral
# no frontend (nomeExibicaoCanal em script.js): "portal" sempre vira
# "Presencial" aqui, já que esse relatório nunca é por loja individual.
NOMES_CANAL_REDE = {"ifood": "IFood", "food99": "99Food", "catalog": "Cardápio Web", "portal": "Presencial"}


@app.route('/api/faturamento-semanal', methods=['GET'])
def api_faturamento_semanal():
    """Histórico semanal por canal, importado de planilha (ver 'Vendas
    Semanais' — tela separada das Vendas Diárias de propósito, porque essa
    fonte só tem o total da semana, não quebra por dia)."""
    unidade = _loja_no_escopo(request.args.get('loja'))
    if not unidade or unidade not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    return jsonify({"semanas": listar_resultado_semanal(unidade)})


@app.route('/api/faturamento-semanal/importar', methods=['POST'])
def api_importar_faturamento_semanal():
    # Admin-only — sobe a planilha semanal do chefe direto pelo navegador,
    # sem precisar de acesso ao servidor. Mesma leitura do script
    # importar_vendas_semanais.py. Nunca sobrescreve o que já está gravado,
    # então subir a mesma planilha de novo (ou uma versão com semanas novas
    # no fim) só acrescenta o que falta.
    erro = _exigir_admin()
    if erro:
        return erro

    arquivo = request.files.get('planilha')
    if not arquivo or not arquivo.filename:
        return jsonify({"erro": "Selecione um arquivo .xlsx."}), 400
    if not arquivo.filename.lower().endswith('.xlsx'):
        return jsonify({"erro": "O arquivo precisa ser .xlsx."}), 400

    try:
        por_loja, avisos = ler_vendas_semanais_da_planilha(arquivo.stream, datetime.now().date())
    except Exception as erro_leitura:
        return jsonify({"erro": f"Não foi possível ler a planilha: {erro_leitura}"}), 400

    # Corrigir a planilha e subir de novo não consertava nada: a importação
    # nunca sobrescreve. Com "substituir", a semana que vier na planilha é
    # regravada do zero (QA 22/09).
    substituir = str(request.form.get('substituir', '')).lower() in ('1', 'true', 'on')
    hoje = date.today()
    gravadas = existentes = substituidas = 0
    no_futuro = []
    semanas_por_loja = {}
    for loja, semanas in por_loja.items():
        if loja not in LOJAS:
            continue
        semanas_por_loja[loja] = len(semanas)
        for inicio, fim, canais, extras in semanas:
            # Semana virando o ano ia toda pro futuro e ninguém via (QA 22/09).
            if inicio > hoje:
                no_futuro.append(f"{loja}: {inicio.strftime('%d/%m/%Y')} a {fim.strftime('%d/%m/%Y')}")
            if substituir:
                substituir_semana_importada(loja, inicio.isoformat())
                substituidas += 1
            for canal, valor in canais.items():
                if salvar_faturamento_canal_semanal_se_ausente(
                    loja, inicio.isoformat(), fim.isoformat(), canal, valor
                ):
                    gravadas += 1
                else:
                    existentes += 1
            salvar_resultado_semanal_se_ausente(
                loja, inicio.isoformat(), fim.isoformat(), extras['cmv'], extras['promoLoja']
            )

    if no_futuro:
        avisos.append(
            "Semana(s) com data no futuro — quase sempre é o ano inferido errado numa semana que vira o ano: "
            + ", ".join(no_futuro[:6])
        )
    return jsonify({
        "substituidas": substituidas,
        "gravadas": gravadas,
        "jaExistiam": existentes,
        "semanasPorLoja": semanas_por_loja,
        "avisos": avisos,
    })


@app.route('/api/faturamento-semanal/resultado', methods=['PUT'])
def api_salvar_resultado_semanal():
    """CMV e promoção de uma semana, digitados na tela. O faturamento não
    entra aqui de propósito: ele vem do que o AdmFood sincroniza sozinho ou
    da planilha, e deixar editar à mão criaria uma terceira versão do mesmo
    número."""
    erro = _exigir_admin()
    if erro:
        return erro

    dados = request.get_json(silent=True) or {}
    loja = _loja_no_escopo(dados.get('loja'))
    if loja not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    inicio, fim = dados.get('periodoInicio'), dados.get('periodoFim')
    if not inicio or not fim:
        return jsonify({"erro": "Informe o período da semana."}), 400

    valores = {}
    for chave in ('cmv', 'promoLoja'):
        bruto = dados.get(chave)
        if bruto in (None, ''):
            valores[chave] = None
            continue
        try:
            valores[chave] = round(float(bruto), 2)
        except (TypeError, ValueError):
            return jsonify({"erro": f"Valor inválido pra {chave}."}), 400

    salvar_resultado_semanal(loja, inicio, fim, valores['cmv'], valores['promoLoja'])
    return jsonify({"ok": True})


@app.route('/api/insights-automaticos', methods=['GET'])
def api_insights_automaticos():
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
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
    """Mediana e média do tempo do pedido. A mediana é o número que a tela
    mostra: um pedido esquecido aberto o dia inteiro puxava a média sozinho e
    fazia o dia parecer lento (QA 22/09). A média fica do lado, pra dar pra
    ver quando as duas se afastam."""
    if not pedidos:
        return {"tempoMedioMinutos": None, "tempoMedianaMinutos": None, "totalPedidos": 0}
    duracoes = sorted(p["duracao_minutos"] for p in pedidos)
    total = len(duracoes)
    meio = total // 2
    mediana = duracoes[meio] if total % 2 else (duracoes[meio - 1] + duracoes[meio]) / 2
    return {
        "tempoMedioMinutos": round(sum(duracoes) / total, 1),
        "tempoMedianaMinutos": round(mediana, 1),
        "totalPedidos": total,
    }


def _montar_bloco_preparo(pedidos):
    bloco = _agregar_duracoes(pedidos)

    # O canal está gravado em pedido_preparo desde sempre, mas a tela juntava
    # iFood e balcão na mesma média — e entrega e retirada no balcão não têm
    # o mesmo tempo (QA 22/09).
    por_canal = {}
    for p in pedidos:
        # "portal" e "totem" são o mesmo balcão: sem juntar, apareciam duas
        # linhas "Presencial" na tabela.
        canal = (p["canal"] or "outros").lower()
        por_canal.setdefault("portal" if canal in ("portal", "totem") else canal, []).append(p)
    bloco["porCanal"] = sorted(
        [
            {"canal": canal, **_agregar_duracoes(lista)}
            for canal, lista in por_canal.items()
        ],
        key=lambda c: -c["totalPedidos"],
    )

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
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    inicio_str = request.args.get('inicio')
    fim_str = request.args.get('fim')

    # Sem teto, dava pra pedir 10 anos de uma vez e o servidor varria a
    # tabela inteira (QA 22/09). Um ano cobre qualquer comparação que ela faz.
    DIAS_MAXIMOS = 366
    periodo_encurtado = False
    if inicio_str and fim_str:
        try:
            inicio = date.fromisoformat(inicio_str)
            fim = date.fromisoformat(fim_str)
        except ValueError:
            return jsonify({"erro": "Datas inválidas."}), 400
        if inicio > fim:
            inicio, fim = fim, inicio
        if (fim - inicio).days + 1 > DIAS_MAXIMOS:
            inicio = fim - timedelta(days=DIAS_MAXIMOS - 1)
            periodo_encurtado = True
    else:
        fim = date.today()
        inicio = fim - timedelta(days=29)

    pedidos = buscar_pedidos_preparo_periodo(inicio.isoformat(), fim.isoformat())
    # A tela apagava as abas das outras lojas, mas a rota devolvia as 4 pra
    # qualquer perfil (QA 22/09).
    pedidos = [p for p in pedidos if _loja_visivel(p["unidade"])]
    lojas_visiveis = [nome for nome in LOJAS.keys() if _loja_visivel(nome)]

    resposta = {"geral": _montar_bloco_preparo(pedidos)}
    resposta["geral"]["porLoja"] = sorted(
        [
            {"loja": unidade, **_agregar_duracoes([p for p in pedidos if p["unidade"] == unidade])}
            for unidade in lojas_visiveis
            if any(p["unidade"] == unidade for p in pedidos)
        ],
        key=lambda l: l["tempoMedioMinutos"],
        reverse=True,
    )

    for nome_unidade in lojas_visiveis:
        da_loja = [p for p in pedidos if p["unidade"] == nome_unidade]
        resposta[nome_unidade] = _montar_bloco_preparo(da_loja)
        # Loja sem pedido no período mostrava 0 min e 0 pedidos como se fosse
        # resultado — "a cozinha foi rápida" em vez de "não tem dado"
        # (QA 22/09).
        resposta[nome_unidade]["semDado"] = not da_loja
    resposta["geral"]["semDado"] = not pedidos

    # Cobertura: com a sincronização parada, a média dos dias que existem
    # aparecia como se fosse o período inteiro (QA 22/09).
    dias_no_periodo = (fim - inicio).days + 1
    dias_com_dado = len({p["criado_em"][:10] for p in pedidos})
    resposta["cobertura"] = {
        "diasNoPeriodo": dias_no_periodo,
        "diasComDado": dias_com_dado,
        "lojas": lojas_visiveis,
    }
    resposta["periodo"] = {
        "inicio": inicio.isoformat(),
        "fim": fim.isoformat(),
        "encurtado": periodo_encurtado,
        "maximoDeDias": DIAS_MAXIMOS,
    }
    return jsonify(resposta)


@app.route('/api/preparo/dia', methods=['GET'])
def api_preparo_do_dia():
    """Os pedidos mais demorados de um dia numa loja — o que "Dias mais
    lentos" não abria (QA 22/09)."""
    erro = _exigir_gestao()
    if erro:
        return erro
    loja = request.args.get('loja') or ''
    dia = request.args.get('dia') or ''
    if loja not in LOJAS or not _loja_visivel(loja):
        return jsonify({"erro": "Loja inválida."}), 400
    try:
        date.fromisoformat(dia)
    except ValueError:
        return jsonify({"erro": "Data inválida."}), 400
    return jsonify({"loja": loja, "dia": dia, **pedidos_preparo_do_dia(loja, dia)})


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
        "particular": tarefa.get("visivel_para") is not None,
        # De quem é o card e de qual loja (QA 22/09).
        "responsavelId": tarefa.get("responsavel_id"),
        "responsavelNome": tarefa.get("responsavel_nome"),
        "loja": tarefa.get("loja"),
        # Carimbo da última alteração: a tela devolve ele ao salvar, e o
        # servidor recusa se outra pessoa mexeu no meio (QA 22/09).
        "atualizadoEm": tarefa.get("atualizado_em"),
    }


def _id_usuario_logado():
    usuario = _usuario_logado()
    return usuario['id'] if usuario else None


def _tarefa_inacessivel(tarefa_id):
    """Card particular de outra pessoa responde como se não existisse."""
    if not tarefa_visivel_para(tarefa_id, _id_usuario_logado()):
        return jsonify({"erro": "Tarefa não encontrada."}), 404
    return None


# O quadro é uma tela de admin, mas as rotas não conferiam perfil nenhum:
# qualquer pessoa logada podia listar, criar, editar e apagar card da equipe
# chamando a API direto (QA 22/09). Ler e comentar é de gestão, apagar é só
# do admin, que é quem enxerga a tela.
@app.route('/api/tarefas', methods=['GET'])
def api_listar_tarefas():
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    return jsonify({"tarefas": [_formatar_tarefa(t) for t in listar_tarefas(_id_usuario_logado())]})


PRIORIDADES_TAREFA_VALIDAS = {'alta', 'media', 'baixa'}
STATUS_TAREFA_VALIDOS = {'todo', 'doing', 'done'}


@app.route('/api/tarefas', methods=['POST'])
def api_criar_tarefa():
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    dados = request.get_json(silent=True) or {}
    titulo = (dados.get('titulo') or '').strip()
    if not titulo:
        return jsonify({"erro": "Título é obrigatório."}), 400
    prioridade = dados.get('prioridade') or 'media'
    if prioridade not in PRIORIDADES_TAREFA_VALIDAS:
        return jsonify({"erro": "Prioridade inválida."}), 400
    try:
        responsavel_id = int(dados['responsavelId']) if dados.get('responsavelId') else None
    except (TypeError, ValueError):
        return jsonify({"erro": "Responsável inválido."}), 400
    loja_tarefa = (dados.get('loja') or '').strip() or None
    if loja_tarefa and loja_tarefa not in LOJAS:
        return jsonify({"erro": "Loja inválida."}), 400
    tarefa_id = criar_tarefa(
        titulo,
        dados.get('descricao') or '',
        dados.get('categoria') or 'Geral',
        prioridade,
        dados.get('dataLimite') or None,
        # "Só eu vejo este card": fica visível só pra quem criou.
        visivel_para=_id_usuario_logado() if dados.get('particular') else None,
        responsavel_id=responsavel_id,
        loja=loja_tarefa,
    )
    # Checklist já na criação (um item por linha no formulário).
    for item in dados.get('subtarefas') or []:
        if str(item).strip():
            adicionar_subtarefa(tarefa_id, str(item).strip())
    return jsonify({"id": tarefa_id})


# Nomes que o frontend usa (camelCase) -> coluna real na tabela tarefa.
CAMPOS_TAREFA_PERMITIDOS = {
    'titulo': 'titulo',
    'descricao': 'descricao',
    'categoria': 'categoria',
    'prioridade': 'prioridade',
    'status': 'status',
    'dataLimite': 'data_limite',
    # Quem cuida do card e de qual loja ele é (QA 22/09).
    'responsavelId': 'responsavel_id',
    'loja': 'loja',
}


@app.route('/api/tarefas/<int:tarefa_id>', methods=['PUT'])
def api_atualizar_tarefa(tarefa_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    erro = _tarefa_inacessivel(tarefa_id)
    if erro:
        return erro
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
    # Dois admins com a tela aberta se atropelavam em silêncio: vencia quem
    # salvasse por último. A tela manda o `atualizadoEm` de quando abriu o
    # card, e o servidor recusa se outra pessoa mexeu nesse meio tempo
    # (QA 22/09). Arrastar o card no quadro não manda nada disso: mudança de
    # status é ação de um campo só, não pisa no texto de ninguém.
    try:
        atualizar_tarefa(tarefa_id, campos, visto_em=dados.get('atualizadoEm'))
    except ValueError as recusa:
        return jsonify({"erro": str(recusa), "conflito": True}), 409
    return jsonify({"ok": True})


@app.route('/api/tarefas/<int:tarefa_id>/o-que-vai-junto', methods=['GET'])
def api_o_que_vai_junto_com_a_tarefa(tarefa_id):
    """Quantos comentários e subtarefas somem junto com o card, pro aviso
    de exclusão dizer o que está em jogo (QA 22/09)."""
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    erro = _tarefa_inacessivel(tarefa_id)
    if erro:
        return erro
    junto = o_que_vai_junto_com_a_tarefa(tarefa_id)
    if not junto:
        return jsonify({"erro": "Card não encontrado."}), 404
    return jsonify(junto)


@app.route('/api/tarefas/<int:tarefa_id>', methods=['DELETE'])
def api_excluir_tarefa(tarefa_id):
    erro_admin = _exigir_admin()
    if erro_admin:
        return erro_admin
    erro = _tarefa_inacessivel(tarefa_id)
    if erro:
        return erro
    # O registro dizia só "Excluiu tarefa": sem o título e sem o que foi
    # junto, não dava pra saber o que se perdeu (QA 22/09).
    junto = o_que_vai_junto_com_a_tarefa(tarefa_id)
    if junto:
        _anotar_no_registro(
            f'Excluiu o card "{junto["titulo"]}"'
            f' (levou {junto["comentarios"]} comentário(s) e {junto["subtarefas"]} subtarefa(s))'
        )
    excluir_tarefa(tarefa_id)
    return jsonify({"ok": True})


@app.route('/api/tarefas/<int:tarefa_id>/subtarefas', methods=['POST'])
def api_adicionar_subtarefa(tarefa_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    erro = _tarefa_inacessivel(tarefa_id)
    if erro:
        return erro
    dados = request.get_json(silent=True) or {}
    titulo = (dados.get('titulo') or '').strip()
    if not titulo:
        return jsonify({"erro": "Título é obrigatório."}), 400
    subtarefa_id = adicionar_subtarefa(tarefa_id, titulo)
    return jsonify({"id": subtarefa_id})


@app.route('/api/tarefas/<int:tarefa_id>/subtarefas/<int:subtarefa_id>', methods=['PUT'])
def api_alternar_subtarefa(tarefa_id, subtarefa_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    erro = _tarefa_inacessivel(tarefa_id)
    if erro:
        return erro
    dados = request.get_json(silent=True) or {}
    # A subtarefa precisa ser DESSE card: só o id dela era conferido, e o de
    # card particular alheio passava (QA 22/09).
    if not alternar_subtarefa(tarefa_id, subtarefa_id, bool(dados.get('concluida'))):
        return jsonify({"erro": "Essa subtarefa não é desse card."}), 404
    return jsonify({"ok": True})


@app.route('/api/tarefas/<int:tarefa_id>/comentarios', methods=['POST'])
def api_adicionar_comentario(tarefa_id):
    erro_admin = _exigir_gestao()
    if erro_admin:
        return erro_admin
    erro = _tarefa_inacessivel(tarefa_id)
    if erro:
        return erro
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
