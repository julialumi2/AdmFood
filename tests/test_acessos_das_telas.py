# -*- coding: utf-8 -*-
"""Tela que um perfil abre tem que CARREGAR pra esse perfil.

O erro que isto pega: a tela entra na lista de um perfil
(PAGINAS_POR_PAPEL), mas a rota que ela chama pra montar o conteúdo
exige um nível acima. A pessoa abre e vê tela vazia — sem mensagem, sem
erro visível, sem ninguém pra reclamar.

Aconteceu na QA de 22/09, voltou, e na varredura de 30/09 estava
acontecendo de novo em Preparo: a tela estava na lista da operação
desde sempre e as duas rotas dela exigiam gestão. Ninguém tinha
percebido porque não há funcionário cadastrado em produção ainda.

O mapa abaixo é escrito à mão de propósito. Descobrir automaticamente
qual rota cada tela chama exige ler o script.js, e foi justamente um
falso positivo desse tipo de leitura que me fez achar, na varredura,
que a carga de Requisições estava guardada quando não estava — o script
encontrou a palavra "admin" num comentário.

Regra pra manter: tela nova na lista de um perfil entra aqui junto.
"""
from _base import Mundo, conferir, secao, terminar

mundo = Mundo()
import app as appmod  # noqa: E402

LOJA = mundo.LOJA_DA_EQUIPE

# Tela -> rotas que ela precisa conseguir chamar pra montar o conteúdo.
# Só GET de carga; botão que a pessoa não pode usar é outra conversa (a
# tela esconde, e isso o navegador testa, não o servidor).
ROTAS_DA_TELA = {
    'index.html': ['/api/alertas'],
    'estoque.html': ['/api/insumos'],
    'contagens.html': ['/api/contagens'],
    'recebimentos.html': ['/api/recebimentos'],
    'preparo.html': ['/api/preparo?inicio=2026-09-01&fim=2026-09-30',
                     '/api/preparo/dia?loja=%s&dia=2026-09-15' % LOJA],
    'cardapio.html': ['/api/itens-cardapio'],
    'reservas.html': ['/api/reservas'],
    'configuracoes.html': ['/api/config/lojas'],
    'guia-compras.html': ['/api/config/lojas'],
    'fornecedores.html': ['/api/fornecedores'],
    'cotacoes.html': ['/api/cotacoes'],
    'pedidos.html': ['/api/pedidos'],
}

PERFIS = (('operacao', mundo.OPERACAO), ('gerente', mundo.GERENTE), ('admin', mundo.ADMIN))
listas = dict(appmod.PAGINAS_POR_PAPEL)


def telas_do_perfil(perfil):
    if perfil == 'admin':
        return set(ROTAS_DA_TELA)          # admin abre tudo
    return set(listas.get(perfil, ()))


for perfil, uid in PERFIS:
    secao("as telas que o perfil %s abre carregam de verdade" % perfil.upper())
    cliente = mundo.cliente(uid)
    telas = sorted(telas_do_perfil(perfil) & set(ROTAS_DA_TELA))
    conferir("tem tela pra conferir", len(telas) > 0, True)
    for tela in telas:
        for rota in ROTAS_DA_TELA[tela]:
            codigo = cliente.get(rota).status_code
            conferir("%-22s %s" % (tela, rota.split('?')[0]), codigo != 403, True)


secao("e o contrário: o perfil NÃO abre a tela que não é dele")
# Sem isto, alguém "conserta" um 403 afrouxando a rota e abre a porta.
PROIBIDO = {
    'operacao': [('/api/pedidos', 'pedidos é de gestão'),
                 ('/api/insights', 'insight é dinheiro'),
                 ('/api/requisicoes', 'requisição é de admin'),
                 ('/api/usuarios', 'quem cadastra gente é admin')],
    'gerente': [('/api/insights', 'insight é dinheiro'),
                ('/api/usuarios', 'quem cadastra gente é admin'),
                ('/api/admin/backups', 'backup é de admin')],
}
for perfil, uid in PERFIS:
    if perfil not in PROIBIDO:
        continue
    cliente = mundo.cliente(uid)
    for rota, porque in PROIBIDO[perfil]:
        conferir("%s barrado em %-22s (%s)" % (perfil, rota, porque),
                 cliente.get(rota).status_code, 403)


secao("toda tela da lista de um perfil está mapeada aqui")
# Se alguém puser uma tela nova na lista e esquecer deste arquivo, o
# teste passa sem testar nada — que é pior do que falhar.
SEM_CARGA = {'instalar-extensao.html', 'precos.html', 'clickup.html'}
for perfil in ('operacao', 'gerente'):
    faltando = sorted(set(listas.get(perfil, ())) - set(ROTAS_DA_TELA) - SEM_CARGA)
    conferir("%s: nenhuma tela fora do mapa" % perfil, faltando, [])

terminar()
