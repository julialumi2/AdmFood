"""
Configuração da aplicação, lida de variáveis de ambiente.

Em desenvolvimento local, os valores vêm do arquivo .env (nunca commitado —
veja .env.example pro modelo). Em produção (Dokploy), as variáveis são
definidas direto no painel, sem precisar de nenhum arquivo.
"""

import base64
import json
import re
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

# Dados fiscais das lojas (nome fantasia, razão social, CNPJ). Alimentam o
# bloco por loja da mensagem de WhatsApp de "Gerar pedidos" (estilo VMarket,
# pedido da Julia em 2026-09-03).
#
# Saíram deste arquivo em 2026-09-29: o repositório é público, e razão
# social — que numa das lojas é o nome completo de uma pessoa física — não
# pode ficar em arquivo versionado.
#
# Vêm numa variável só, em JSON, no mesmo formato de EQUIPE_INICIAL. Um
# campo só pra colar no painel do Dokploy em vez de doze:
#
#   DADOS_FISCAIS_LOJAS={"Hamburgueria Artesanos": {"nomeFantasia": "...",
#     "razaoSocial": "...", "cnpj": "..."}, ...}
#
# Sem a variável, os três campos ficam em branco e a mensagem cai pra
# "Não informado" (app.py) — o pedido continua saindo normalmente.
#
# Aceita também em base64, pro caso de o painel mexer no valor: tem
# painel que lê uma linha começando com "{" como mapa de YAML, e tem
# painel que come as aspas. Uma linha de letras e números não dá margem
# pra isso. Pra gerar:
#
#   python -c "import base64,io;print(base64.b64encode(io.open('x.json','rb').read()).decode())"
#
# `DADOS_FISCAIS_ESTADO` existe porque falha de configuração em silêncio
# custa um deploy inteiro pra diagnosticar: sem ele, "variável não
# chegou", "JSON quebrou ao colar" e "nome de loja não bate" davam
# exatamente a mesma tela (30/09).


def _impressao_do_valor(bruto):
    """Como o valor chegou, sem mostrar o valor.

    Diagnosticar isso pelo painel custa um deploy por tentativa, e a
    gente gastou três em 30/09. Tamanho, começo, fim e se veio quebrado
    em linhas é o suficiente pra comparar com o que era pra ter chegado,
    e não é o suficiente pra vazar CNPJ nenhum."""
    limpo = re.sub(r"\s", "", bruto)
    return {
        "tamanho": len(bruto),
        "tamanhoSemEspacos": len(limpo),
        "comeca": limpo[:8],
        "termina": limpo[-8:],
        "temQuebraDeLinha": len(bruto.strip().splitlines()) > 1,
        "pareceJson": limpo.startswith("{"),
    }


def _ler_dados_fiscais():
    """Devolve (dados, estado). O estado vai pra tela de Configurações
    porque cada causa tem um conserto diferente."""
    bruto = os.environ.get("DADOS_FISCAIS_LOJAS", "") or ""
    if not bruto.strip():
        return {}, "ausente", None

    impressao = _impressao_do_valor(bruto)
    if not impressao["pareceJson"]:
        # Não parece JSON: tenta base64. Tira espaço e quebra de linha
        # antes — painel que embrulha uma linha de 640 caracteres em
        # várias entrega um base64 tecnicamente inválido com o conteúdo
        # intacto, e desistir aí seria desistir à toa (30/09).
        try:
            texto = base64.b64decode(re.sub(r"\s", "", bruto), validate=True)
            bruto = texto.decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            return {}, "invalido", impressao
    try:
        dados = json.loads(bruto)
    except ValueError:
        # Última tentativa: sem as quebras de linha. Painel que embrulha
        # o valor pode ter partido no meio de um texto entre aspas, e aí
        # o JSON fica inválido com o conteúdo inteiro — nenhuma razão
        # social nossa tem quebra de linha dentro, então juntar de volta
        # não perde nada (30/09).
        try:
            dados = json.loads("".join(bruto.splitlines()))
        except ValueError:
            # JSON malformado não pode derrubar a subida do app: isso
            # aqui é texto de uma mensagem, não regra de negócio.
            return {}, "invalido", impressao
    if not isinstance(dados, dict):
        return {}, "invalido", impressao
    return dados, "ok", impressao


_DADOS_FISCAIS, DADOS_FISCAIS_ESTADO, DADOS_FISCAIS_IMPRESSAO = _ler_dados_fiscais()


def _fiscal(loja):
    dados = _DADOS_FISCAIS.get(loja) or {}
    return {
        "nome_fantasia": dados.get("nomeFantasia", ""),
        "razao_social": dados.get("razaoSocial", ""),
        "cnpj": dados.get("cnpj", ""),
    }


# Dicionário com as configurações individuais de cada unidade/loja.
LOJAS = {
    "Hamburgueria Artesanos": {
        "nome_aba": "DIARIO ART",  # Nome exato da aba no Google Sheets
        "cardapio_web_token": os.environ.get("TOKEN_ARTESANOS", ""),
        "grupo_whatsapp_id": os.environ.get("GRUPO_WHATSAPP_ARTESANOS", ""),
        **_fiscal("Hamburgueria Artesanos"),
    },
    "Açaí Na Lata": {
        "nome_aba": "DIÁRIO AÇAÍ ",  # Nome exato da aba no Google Sheets
        "cardapio_web_token": os.environ.get("TOKEN_ACAI", ""),
        "grupo_whatsapp_id": os.environ.get("GRUPO_WHATSAPP_ACAI", ""),
        **_fiscal("Açaí Na Lata"),
    },
    "Tradiça ZN": {
        "nome_aba": "DIARIO ZN",  # Nome exato da aba no Google Sheets
        "cardapio_web_token": os.environ.get("TOKEN_ZN", ""),
        "grupo_whatsapp_id": os.environ.get("GRUPO_WHATSAPP_ZN", ""),
        **_fiscal("Tradiça ZN"),
    },
    "Tradiça Simus": {
        "nome_aba": "DIARIO SIMUS",  # Nome exato da aba no Google Sheets
        "cardapio_web_token": os.environ.get("TOKEN_SIMUS", ""),
        "grupo_whatsapp_id": os.environ.get("GRUPO_WHATSAPP_SIMUS", ""),
        **_fiscal("Tradiça Simus"),
    },
}
