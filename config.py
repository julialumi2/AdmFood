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
ADMIN_INICIAL_NOME = os.environ.get("ADMIN_INICIAL_NOME", "Admin")
ADMIN_INICIAL_EMAIL = os.environ.get("ADMIN_INICIAL_EMAIL", "")
ADMIN_INICIAL_SENHA = os.environ.get("ADMIN_INICIAL_SENHA", "")

# Dicionário com as configurações individuais de cada unidade/loja
LOJAS = {
    "Hamburgueria Artesanos": {
        "nome_aba": "DIARIO ART",  # Nome exato da aba no Google Sheets
        "cardapio_web_token": os.environ.get("TOKEN_ARTESANOS", ""),
        "grupo_whatsapp_id": os.environ.get("GRUPO_WHATSAPP_ARTESANOS", ""),
    },
    "Açaí Na Lata": {
        "nome_aba": "DIÁRIO AÇAÍ ",  # Nome exato da aba no Google Sheets
        "cardapio_web_token": os.environ.get("TOKEN_ACAI", ""),
        "grupo_whatsapp_id": os.environ.get("GRUPO_WHATSAPP_ACAI", ""),
    },
    "Tradiça ZN": {
        "nome_aba": "DIARIO ZN",  # Nome exato da aba no Google Sheets
        "cardapio_web_token": os.environ.get("TOKEN_ZN", ""),
        "grupo_whatsapp_id": os.environ.get("GRUPO_WHATSAPP_ZN", ""),
    },
    "Tradiça Simus": {
        "nome_aba": "DIARIO SIMUS",  # Nome exato da aba no Google Sheets
        "cardapio_web_token": os.environ.get("TOKEN_SIMUS", ""),
        "grupo_whatsapp_id": os.environ.get("GRUPO_WHATSAPP_SIMUS", ""),
    },
}
