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
