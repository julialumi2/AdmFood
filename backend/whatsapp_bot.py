"""Transporte do robô de WhatsApp, pela Evolution API (29/09).

A Evolution roda numa VPS e mantém a sessão do WhatsApp aberta — é um
aparelho conectado, como o WhatsApp Web. Quando chega mensagem, ela
chama o webhook do AdmFood; pra responder, a gente chama ela de volta.

Não é a API oficial da Meta: o número pode ser banido. Por isso o robô
mora num número separado, nunca no pessoal de ninguém. (A oficial não
serviria de qualquer jeito: ela não manda mensagem pra grupo, e o aviso
diário no grupo da liderança é metade do pedido.)

Este módulo é só o transporte e as travas — não sabe responder nada.
Quem monta resposta é o app, que tem acesso aos dados. Separado assim
porque transporte dá pra testar sem banco e sem Flask.

Config, tudo por variável de ambiente — o repositório é público e não
pode ter chave nem telefone:

    EVOLUTION_URL          https://zap.seudominio.com.br
    EVOLUTION_INSTANCIA    nome da instância criada na Evolution
    EVOLUTION_API_KEY      a chave da Evolution (ela autentica o envio)
    WHATSAPP_WEBHOOK_TOKEN segredo que vai na URL do webhook

Quem pode falar com o robô NÃO está aqui: é o campo `whatsapp` do
cadastro de usuário (30/09). Assim o robô responde com o mesmo perfil e
a mesma loja que a pessoa tem nas telas, e a permissão se mantém sozinha
— desativou a conta, o robô para de responder. Uma lista de números em
variável de ambiente seria uma segunda lista de permissão pra manter em
sincronia, que é como esse tipo de coisa apodrece.
"""
import os
import re

import requests

TEMPO_LIMITE_ENVIO_S = 20


def so_digitos(texto):
    return re.sub(r"\D", "", texto or "")


def configurado():
    return all(os.environ.get(chave) for chave in
               ("EVOLUTION_URL", "EVOLUTION_INSTANCIA", "EVOLUTION_API_KEY"))


def numero_da_mensagem(dados):
    """O telefone de quem mandou, só dígitos.

    A Evolution manda o remetente em `key.remoteJid`, no formato
    "5511999999999@s.whatsapp.net". Grupo termina em "@g.us" e devolve
    None: robô que responde em grupo se mete na conversa dos outros.
    Quando quiserem isso, o gatilho será marcar o robô — e aí a decisão
    passa a ser de quem chama `eh_pra_mim`."""
    jid = ((dados.get("key") or {}).get("remoteJid") or "")
    if jid.endswith("@g.us"):
        return None
    return so_digitos(jid.split("@")[0])


def texto_da_mensagem(dados):
    """O texto, venha de mensagem simples ou de resposta/citação.

    Áudio, foto e figurinha caem fora (devolve None): o robô só lê texto,
    e é melhor ficar calado do que responder bobagem."""
    msg = dados.get("message") or {}
    return (msg.get("conversation")
            or (msg.get("extendedTextMessage") or {}).get("text")
            or None)


def eh_do_proprio_robo(dados):
    """Mensagem que o próprio robô mandou. Sem essa trava, a resposta
    dele dispara o webhook de novo e vira conversa infinita consigo
    mesmo."""
    return bool((dados.get("key") or {}).get("fromMe"))


def id_da_mensagem(dados):
    """Pra não responder duas vezes: a Evolution reentrega o webhook
    quando não recebe 200 na primeira."""
    return (dados.get("key") or {}).get("id")


def nome_de_quem_mandou(dados):
    return (dados.get("pushName") or "").strip()


def responder(numero, texto):
    """Manda a resposta pelo /message/sendText da Evolution v2."""
    url = os.environ["EVOLUTION_URL"].rstrip("/")
    instancia = os.environ["EVOLUTION_INSTANCIA"]
    resposta = requests.post(
        f"{url}/message/sendText/{instancia}",
        headers={"apikey": os.environ["EVOLUTION_API_KEY"],
                 "Content-Type": "application/json"},
        json={"number": numero, "text": texto},
        timeout=TEMPO_LIMITE_ENVIO_S,
    )
    resposta.raise_for_status()
    return resposta.json()
