import datetime
from flask import Flask, jsonify, render_template, request
import requests

from config import LOJAS, MAKE_WEBHOOK_URL
from main import (
    buscar_vendas_cardapio_web,
    montar_bloco_comparativo,
    obter_historico_dias_mes,
    obter_nome_dia_semana,
)

app = Flask(__name__)


# Rota para renderizar a página HTML
@app.route("/")
def home():
  return render_template("index.html")


# Rota da API chamada pelo JavaScript do Front-end
@app.route("/api/enviar-fechamento", methods=["POST"])
def processar_fechamento():
  try:
    dados = request.get_json()

    if not dados:
      return jsonify({"mensagem": "Nenhum dado enviado."}), 400

    nome_loja = dados.get("loja")
    data_str = dados.get("data")  # Formato esperado: YYYY-MM-DD
    vendas_presencial = float(dados.get("presencial", 0.0))

    # Validação da loja
    if nome_loja not in LOJAS:
      return jsonify({"mensagem": f"Loja '{nome_loja}' não configurada."}), 400

    config_loja = LOJAS[nome_loja]

    # Trata a data enviada
    data_obj = datetime.datetime.strptime(data_str, "%Y-%m-%d").date()
    data_formatada = data_obj.strftime("%d/%m/%Y")
    dia_semana = obter_nome_dia_semana(data_obj)

    # 1. Busca vendas online no Cardápio WEB
    vendas_online = buscar_vendas_cardapio_web(
        config_loja["cardapio_web_token"], data_str
    )

    if not isinstance(vendas_online, dict):
      vendas_online = {"ifood": 0.0, "cardapio_proprio": 0.0, "99food": 0.0}

    total_online = sum(vendas_online.values())
    total_geral = total_online + vendas_presencial

    # 2. Busca histórico comparativo de semanas anteriores (se aplicável)
    # bloco_semanas = montar_bloco_comparativo(...) # Ajuste conforme sua função em main.py

    # 3. Monta o pacote de dados (payload) para o Make
    payload_make = {
        "loja": nome_loja,
        "aba_planilha": config_loja["nome_aba"],
        "data_busca": data_formatada,
        "dia_semana": dia_semana,
        "ifood": vendas_online.get("ifood", 0.0),
        "cardapio_web": vendas_online.get("cardapio_proprio", 0.0),
        "99food": vendas_online.get("99food", 0.0),
        "total_online": total_online,
        "presencial": vendas_presencial,
        "total_geral": total_geral,
        "grupo_whatsapp_id": config_loja["grupo_whatsapp_id"],
    }

    # 4. Envia os dados consolidados para o Webhook do Make
    resposta_make = requests.post(
        MAKE_WEBHOOK_URL, json=payload_make, timeout=15
    )

    if resposta_make.status_code in [200, 201]:
      return (
          jsonify({
              "mensagem": (
                  "Relatório processado e enviado para a automação com"
                  " sucesso!"
              )
          }),
          200,
      )
    else:
      return (
          jsonify({
              "mensagem": (
                  f"Erro ao comunicar com o Make (Status {resposta_make.status_code})"
              )
          }),
          502,
      )

  except Exception as erro:
    print(f"Erro interno no servidor: {erro}")
    return jsonify({"mensagem": f"Erro interno: {str(erro)}"}), 500


if __name__ == "__main__":
  app.run(debug=True, port=5000)