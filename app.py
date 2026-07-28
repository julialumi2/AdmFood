from flask import Flask, render_template, request, jsonify
import requests
import datetime
from config import LOJAS, MAKE_WEBHOOK_URL
# Importe suas funções já criadas no main.py
from main import buscar_vendas_cardapio_web, obter_historico_dias_mes, montar_bloco_comparativo, obter_nome_dia_semana

app = Flask(__name__)

@app.route('/')
def home():
    # Renderiza a página da interface
    return render_template('index.html')

@app.route('/api/enviar-fechamento', methods=['POST'])
def processar_fechamento():
    data_req = request.get_json()
    
    nome_loja = data_req.get('loja')
    data_str = data_req.get('data') # YYYY-MM-DD
    vendas_presencial = float(data_req.get('presencial', 0))

    if nome_loja not in LOJAS:
        return jsonify({"mensagem": "Loja não encontrada!"}), 400

    config = LOJAS[nome_loja]
    data_obj = datetime.datetime.strptime(data_str, "%Y-%m-%d").date()

    # 1. Coleta dados do Cardápio WEB
    vendas_online = buscar_vendas_cardapio_web(config["cardapio_web_token"], data_str)
    total_online = sum(vendas_online.values())
    total_geral = total_online + vendas_presencial

    # 2. Gera comparativos históricos
    historico = obter_historico_dias_mes(config["cardapio_web_token"], data_obj)
    bloco_semanas = montar_bloco_comparativo(historico)

    # 3. Monta o Payload para o Make
    payload = {
        "loja": nome_loja,
        "aba_planilha": config["nome_aba"],
        "data_busca": data_obj.strftime("%d/%m"),
        "dia_semana": obter_nome_dia_semana(data_obj),
        "ifood": vendas_online.get("ifood", 0.0),
        "cardapio_web": vendas_online.get("cardapio_proprio", 0.0),
        "99food": vendas_online.get("99food", 0.0),
        "total_online": total_online,
        "presencial": vendas_presencial,
        "total_geral": total_geral,
        "bloco_semanas": bloco_semanas,
        "grupo_whatsapp_id": config["grupo_whatsapp_id"]
    }

    # 4. Envia ao Webhook do Make
    res = requests.post(MAKE_WEBHOOK_URL, json=payload)

    if res.status_code == 200:
        return jsonify({"mensagem": "Sucesso!"}), 200
    else:
        return jsonify({"mensagem": "Falha no envio para o Make"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)