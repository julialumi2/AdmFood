import datetime
import requests
from config import CARDAPIO_WEB_TOKEN, LOJAS, MAKE_WEBHOOK_URL


def formatar_moeda(valor: float) -> str:
    """Formata um valor numérico para o padrão de moeda brasileiro (R$ 1.234,56)."""
    texto = f"R$ {valor:,.2f}"
    return texto.replace(",", "X").replace(".", ",").replace("X", ".")


def buscar_vendas_cardapio_web(store_id: str, data_str: str) -> dict:
    """Consulta a API do Cardápio WEB filtrando por store_id."""
    url = f"https://api.cardapioweb.com/v1/relatorios/vendas?store_id={store_id}&data={data_str}"
    headers = {"Authorization": f"Bearer {CARDAPIO_WEB_TOKEN}"}

    vendas_padrao = {"cardapio_proprio": 0.0, "ifood": 0.0, "99food": 0.0}

    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code == 200:
            dados = response.json()
            if isinstance(dados, list):
                for item in dados:
                    if str(item.get("store_id")) == str(store_id):
                        dados = item
                        break

            return {
                "cardapio_proprio": float(dados.get("total_cardapio", 0.0)),
                "ifood": float(dados.get("total_ifood", 0.0)),
                "99food": float(dados.get("total_99food", 0.0)),
            }
    except Exception as e:
        print(f"[Cardápio WEB Exception] Falha na API da loja {store_id}: {e}")

    return vendas_padrao


def obter_historico_domingos_mes(store_id: str, data_referencia: datetime.date) -> list[float]:
    """Busca o faturamento dos domingos passados do mês vigente para a loja."""
    ano_atual = data_referencia.year
    mes_atual = data_referencia.month

    datas_domingos = []
    dia_temp = datetime.date(ano_atual, mes_atual, 1)

    while dia_temp <= data_referencia:
        if dia_temp.weekday() == data_referencia.weekday():
            datas_domingos.append(dia_temp)
        dia_temp += datetime.timedelta(days=1)

    totais_domingos = []
    for dt in datas_domingos:
        dt_str = dt.strftime("%Y-%m-%d")
        online = buscar_vendas_cardapio_web(store_id, dt_str)
        totais_domingos.append(sum(online.values()))

    return totais_domingos


def montar_bloco_comparativo(totais_semanas: list[float]) -> str:
    """Gera o texto comparativo (- 1ª semana: ..., - 2ª semana: ...). Oculta na 1ª semana."""
    if len(totais_semanas) <= 1:
        return ""

    bloco = "\n"
    for idx, valor in enumerate(totais_semanas, start=1):
        bloco += f"- {idx}ª semana: {formatar_moeda(valor)}\n"

    return bloco


def processar_e_enviar():
    """Executa o ciclo de coleta do Cardápio WEB e envio para o Make."""
    hoje = datetime.date.today()
    data_api = hoje.strftime("%Y-%m-%d")
    data_planilha = hoje.strftime("%d/%m")  # Ex: 02/08
    data_exibicao = hoje.strftime("%d/%m/%Y")
    dia_semana_nome = "DOMINGO" if hoje.weekday() == 6 else hoje.strftime("%A").upper()

    print(f"🚀 Iniciando coleta do Cardápio WEB para o dia {data_exibicao}...")

    for nome_loja, config in LOJAS.items():
        print(f"\n[+] Coletando dados para: {nome_loja} (ID: {config['store_id']})...")

        # 1. Consulta vendas online de hoje
        vendas_online = buscar_vendas_cardapio_web(config["store_id"], data_api)
        total_online = sum(vendas_online.values())

        # 2. Histórico do mês para o comparativo
        historico_semanas = obter_historico_domingos_mes(config["store_id"], hoje)
        bloco_semanas = montar_bloco_comparativo(historico_semanas)

        # 3. Monta o Payload para o Make
        payload = {
            "loja": nome_loja,
            "aba_planilha": config["nome_aba"],
            "data_busca": data_planilha,  # ex: "02/08"
            "dia_semana": dia_semana_nome,
            "ifood": vendas_online["ifood"],
            "cardapio_web": vendas_online["cardapio_proprio"],
            "99food": vendas_online["99food"],
            "total_online": total_online,
            "bloco_semanas": bloco_semanas,
            "grupo_whatsapp_id": config["grupo_whatsapp_id"]
        }

        try:
            resposta = requests.post(MAKE_WEBHOOK_URL, json=payload, timeout=10)
            if resposta.status_code == 200:
                print(f"✅ Dados da loja '{nome_loja}' enviados ao Make com sucesso!")
            else:
                print(f"❌ Erro ao enviar para o Make ({nome_loja}): {resposta.status_code}")
        except Exception as e:
            print(f"❌ Exceção ao disparar Webhook para o Make ({nome_loja}): {e}")

    print("\n🎉 Coleta e disparo concluídos!")


if __name__ == "__main__":
    processar_e_enviar()