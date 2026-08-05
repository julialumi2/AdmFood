# Copie este arquivo para config.py e preencha com os valores reais.
# config.py nunca deve ser commitado (já está no .gitignore).

# URL do Webhook gerado no seu cenário do Make
MAKE_WEBHOOK_URL = "https://hook.us2.make.com/SEU_WEBHOOK_AQUI"

# Dicionário com as configurações individuais de cada unidade/loja
LOJAS = {
    "Hamburgueria Artesanos": {
        "nome_aba": "DIARIO ART",  # Nome exato da aba no Google Sheets
        "cardapio_web_token": "TOKEN_API_AQUI",
        "grupo_whatsapp_id": "SEU_GRUPO_AQUI@s.whatsapp.net"
    },
    "Açaí Na Lata": {
        "nome_aba": "DIÁRIO AÇAÍ ",
        "cardapio_web_token": "TOKEN_API_AQUI",
        "grupo_whatsapp_id": "SEU_GRUPO_AQUI@s.whatsapp.net"
    },
    "Tradiça ZN": {
        "nome_aba": "DIARIO ZN",
        "cardapio_web_token": "TOKEN_API_AQUI",
        "grupo_whatsapp_id": "SEU_GRUPO_AQUI@s.whatsapp.net"
    },
    "Tradiça Simus": {
        "nome_aba": "DIARIO SIMUS",
        "cardapio_web_token": "TOKEN_API_AQUI",
        "grupo_whatsapp_id": "SEU_GRUPO_AQUI@s.whatsapp.net"
    }
}
