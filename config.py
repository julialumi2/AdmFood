"""
Configuração da aplicação, lida de variáveis de ambiente.

Em desenvolvimento local, os valores vêm do arquivo .env (nunca commitado —
veja .env.example pro modelo). Em produção (Dokploy), as variáveis são
definidas direto no painel, sem precisar de nenhum arquivo.
"""

import os

from dotenv import load_dotenv

load_dotenv()

MAKE_WEBHOOK_URL = os.environ.get("MAKE_WEBHOOK_URL", "")

# Assina o cookie de sessão (login). Precisa ser o MESMO valor em todos os
# workers do Gunicorn em produção — por isso vem de env var fixa, nunca
# gerada em runtime (um valor aleatório por worker invalidaria a sessão
# sempre que a requisição caísse num worker diferente do que fez o login).
SECRET_KEY = os.environ.get("SECRET_KEY", "")

# Cria esse usuário como admin automaticamente na primeira subida do app,
# se a tabela de usuários ainda estiver vazia (ver app.py). Só precisa
# estar setado uma vez — depois pode remover do .env/Dokploy.
# .strip() é importante aqui: um espaço ou quebra de linha colado por
# engano no valor (comum ao copiar/colar num campo de ambiente) faria a
# senha guardada nunca bater com a senha digitada de verdade no login.
ADMIN_INICIAL_NOME = os.environ.get("ADMIN_INICIAL_NOME", "Admin").strip()
ADMIN_INICIAL_EMAIL = os.environ.get("ADMIN_INICIAL_EMAIL", "").strip()
ADMIN_INICIAL_SENHA = os.environ.get("ADMIN_INICIAL_SENHA", "").strip()

# Mesma ideia do admin inicial, mas pra equipe toda de uma vez — evita
# depender de conseguir logar primeiro pra cadastrar todo mundo pela tela.
# Formato: uma lista JSON de objetos {nome, email, senha, papel}. Ver
# exemplo em .env.example.
EQUIPE_INICIAL_JSON = os.environ.get("EQUIPE_INICIAL", "").strip()

# Dicionário com as configurações individuais de cada unidade/loja.
# nome_fantasia/razao_social/cnpj alimentam o bloco por loja da mensagem de
# WhatsApp de "Gerar pedidos" (estilo VMarket, pedido da Julia 2026-09-03) —
# Artesanos/Tradiça ZN/Tradiça Simus vieram literal do print de um pedido
# real que ela mandou; Açaí Na Lata ainda não tinha aparecido num pedido
# dela até agora, fica vazio até ela passar o dado (o texto da mensagem cai
# pra "Não informado" quando um desses campos está em branco).
LOJAS = {
    "Hamburgueria Artesanos": {
        "nome_aba": "DIARIO ART",  # Nome exato da aba no Google Sheets
        "cardapio_web_token": os.environ.get("TOKEN_ARTESANOS", ""),
        "grupo_whatsapp_id": os.environ.get("GRUPO_WHATSAPP_ARTESANOS", ""),
        "nome_fantasia": "Artesanos Burger",
        "razao_social": "Artesanos Burger LTDA",
        "cnpj": "33.561.488/0001-85",
    },
    "Açaí Na Lata": {
        "nome_aba": "DIÁRIO AÇAÍ ",  # Nome exato da aba no Google Sheets
        "cardapio_web_token": os.environ.get("TOKEN_ACAI", ""),
        "grupo_whatsapp_id": os.environ.get("GRUPO_WHATSAPP_ACAI", ""),
        "nome_fantasia": "",
        "razao_social": "",
        "cnpj": "",
    },
    "Tradiça ZN": {
        "nome_aba": "DIARIO ZN",  # Nome exato da aba no Google Sheets
        "cardapio_web_token": os.environ.get("TOKEN_ZN", ""),
        "grupo_whatsapp_id": os.environ.get("GRUPO_WHATSAPP_ZN", ""),
        "nome_fantasia": "Tradiça Dog",
        "razao_social": "50.760.217 ANA BEATRIZ TOBARU",
        "cnpj": "50.760.217/0001-78",
    },
    "Tradiça Simus": {
        "nome_aba": "DIARIO SIMUS",  # Nome exato da aba no Google Sheets
        "cardapio_web_token": os.environ.get("TOKEN_SIMUS", ""),
        "grupo_whatsapp_id": os.environ.get("GRUPO_WHATSAPP_SIMUS", ""),
        "nome_fantasia": "Tradiça Simus",
        "razao_social": "TRADICA DOG SIMUS LTDA",
        "cnpj": "65.014.833/0001-57",
    },
}
