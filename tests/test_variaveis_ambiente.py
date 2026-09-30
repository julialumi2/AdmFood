# -*- coding: utf-8 -*-
"""Toda variável que o código lê precisa entrar no container.

O docker-compose.yml lista uma por uma as variáveis que passam pro
container. Variável que o código lê mas que não está nessa lista some em
silêncio: o painel do Dokploy mostra ela cadastrada, o deploy roda sem
erro, e o app se comporta como se ela nunca tivesse existido.

Foi o que custou a tarde de 30/09. A DADOS_FISCAIS_LOJAS estava certa no
painel, com o valor conferido caractere por caractere, e dois deploys
depois o pedido de compra continuava saindo com "Não informado" no CNPJ
— porque ela não estava na lista do compose. E as quatro variáveis do
robô do WhatsApp, que ainda nem tinham sido cadastradas, iam bater
exatamente na mesma parede no dia seguinte.

Este teste não deixa acontecer de novo.
"""
import io
import os
import re

from _base import conferir, secao, terminar

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Variáveis que o código lê mas que NÃO devem estar no compose, cada uma
# com o motivo. Lista curta de propósito: qualquer nome novo aqui precisa
# de justificativa, senão o teste deixa de valer alguma coisa.
FORA_DE_PROPOSITO = {
    # O Flask põe sozinho no processo filho do reloader — em
    # desenvolvimento, e só ele escreve nela.
    "WERKZEUG_RUN_MAIN": "posta pelo próprio Flask, ninguém configura",
}


def variaveis_lidas_pelo_codigo():
    """Todo os.environ["X"] / os.environ.get("X") dos .py do projeto."""
    achadas = {}
    for raiz, pastas, arquivos in os.walk(RAIZ):
        # `tests` fica de fora: teste que planta variável pra montar cenário
        # não é configuração do app, e é o app que a gente está auditando.
        pastas[:] = [p for p in pastas
                     if p not in (".git", "__pycache__", "node_modules",
                                  "venv", ".venv", "tests")]
        for nome in arquivos:
            if not nome.endswith(".py"):
                continue
            caminho = os.path.join(raiz, nome)
            texto = io.open(caminho, encoding="utf-8", errors="ignore").read()
            for m in re.finditer(r'os\.environ(?:\.get)?[\[\(]\s*["\']([A-Z0-9_]+)["\']', texto):
                achadas.setdefault(m.group(1), os.path.relpath(caminho, RAIZ))
    return achadas


def variaveis_do_compose():
    texto = io.open(os.path.join(RAIZ, "docker-compose.yml"), encoding="utf-8").read()
    return set(re.findall(r'^\s*-\s*([A-Z0-9_]+)=', texto, re.M))


secao("1) nenhuma variável fica de fora do container")
lidas = variaveis_lidas_pelo_codigo()
passadas = variaveis_do_compose()

faltando = {v: onde for v, onde in lidas.items()
            if v not in passadas and v not in FORA_DE_PROPOSITO}

for nome in sorted(faltando):
    conferir("%s (lida em %s) chega no container" % (nome, faltando[nome]), False, True)
if not faltando:
    conferir("as %d variáveis lidas pelo código estão no compose" % len(lidas), True, True)


secao("2) as exceções continuam sendo exceções de verdade")
# Se alguém puser uma variável na lista de exceções e ela deixar de ser
# lida pelo código, a exceção vira lixo que esconde o próximo erro.
for nome in sorted(FORA_DE_PROPOSITO):
    conferir("%s ainda é lida pelo código" % nome, nome in lidas, True)


secao("3) default no compose onde variável vazia muda o comportamento")
# `- X=${X}` com X não definida no painel entrega string VAZIA, que não é
# a mesma coisa que ausente. Onde o código tem default diferente de
# vazio, o compose precisa repetir esse default com ${X:-...} — senão
# passar a variável pro container LIGA um comportamento que estava certo.
#
# BACKUP_AUTOMATICO é o caso real: o código liga o backup quando ela não
# existe, e "" != "true" desligaria a cópia diária do banco.
compose = io.open(os.path.join(RAIZ, "docker-compose.yml"), encoding="utf-8").read()
for nome, porque in (("BACKUP_AUTOMATICO", "vazia desligaria a cópia diária do banco"),
                     ("ADMIN_INICIAL_NOME", "vazia deixaria o primeiro admin sem nome")):
    conferir("%s tem default no compose (%s)" % (nome, porque),
             bool(re.search(r'\$\{' + nome + r':-[^}]+\}', compose)), True)

secao("4) o valor dos dados fiscais aguenta o que o painel faz com ele")
# Em 30/09 esse valor foi cadastrado tres vezes e nao funcionou nenhuma.
# Painel de deploy mexe no que voce cola: embrulha linha de 640
# caracteres, apara espaco, as vezes corta. O codigo tem que aceitar o
# que ainda da pra recuperar e recusar o que nao da — recusar silencioso
# e o que custou o dia.
import base64  # noqa: E402
import sys     # noqa: E402

VALOR = ('{"Hamburgueria Artesanos":{"nomeFantasia":"A","razaoSocial":"B","cnpj":"1"},'
         '"Acai Na Lata":{"nomeFantasia":"C","razaoSocial":"D","cnpj":"2"}}')
B64 = base64.b64encode(VALOR.encode("utf-8")).decode()
QUEBRA = chr(10)


def estado_com(valor):
    os.environ["DADOS_FISCAIS_LOJAS"] = valor
    sys.modules.pop("config", None)
    import config
    return config.DADOS_FISCAIS_ESTADO


_guardado = os.environ.get("DADOS_FISCAIS_LOJAS")

for rotulo, valor, esperado in (
        ("variavel vazia", "", "ausente"),
        ("JSON numa linha", VALOR, "ok"),
        ("JSON embrulhado no meio de um texto entre aspas",
         VALOR[:60] + QUEBRA + VALOR[60:], "ok"),
        ("base64 numa linha", B64, "ok"),
        ("base64 embrulhado em varias linhas",
         QUEBRA.join(B64[i:i + 40] for i in range(0, len(B64), 40)), "ok"),
        ("base64 com espaco em volta", "  " + B64 + "  ", "ok"),
        ("base64 cortado pela metade", B64[:len(B64) // 2], "invalido"),
        ("base64 com lixo no meio", B64[:20] + "RTQ" + B64[20:], "invalido"),
        ("texto que nao e nem um nem outro", "qualquer coisa", "invalido"),
        ("JSON que nao e objeto", "[1, 2, 3]", "invalido")):
    conferir(rotulo, estado_com(valor), esperado)

if _guardado is None:
    os.environ.pop("DADOS_FISCAIS_LOJAS", None)
else:
    os.environ["DADOS_FISCAIS_LOJAS"] = _guardado
sys.modules.pop("config", None)

terminar()
