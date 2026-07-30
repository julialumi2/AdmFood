import requests
from datetime import datetime, timedelta
from flask import Flask, jsonify, render_template
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Permite requisições do JS mesmo se rodar direto do arquivo local

LOJAS_CONFIG = [
    {
        "id": "5116", 
        "nome": "Artesano's", 
        "token": "3y4g7fNFnJ37TmXPSvwmp5pqKqBAyfN817oJDseTFW5B7zZFcoQxFEJbmtWc"
    },
    # Para adicionar mais unidades no futuro, basta descomentar e preencher:
    # {"id": "ID_LOJA_2", "nome": "Unidade 2", "token": "TOKEN_REAL_AQUI"},
]

def obter_faturamento_loja(loja, data_inicio, data_fim):
    if "TOKEN_API" in loja["token"]:
        return {"nome": loja["nome"], "total": 0.0, "sucesso": False, "erro": "Token não configurado"}

    # Tentativa usando o endpoint v1 / v2 comum da API
    url = f"https://api.cardapioweb.com/v1/pedidos"
    
    params = {
        "data_inicio": data_inicio,
        "data_fim": data_fim
    }
    
    headers = {
        "Authorization": f"Bearer {loja['token']}", # Testando formato Bearer
        "X-Token": loja["token"],                   # Testando formato X-Token
        "Accept": "application/json",
        "Content-Type": "application/json"
    }

    try:
        # allow_redirects=False impede que o Python navegue para a página HTML do portal se o token falhar
        response = requests.get(url, headers=headers, params=params, timeout=10, allow_redirects=False)
        
        print(f"\n================ [ DEBUG: {loja['nome']} ] ================")
        print(f"URL Chamada: {response.url}")
        print(f"Status Code: {response.status_code}")
        print(f"Resposta: {response.text[:300]}")
        print("=======================================================\n")

        if response.status_code == 302 or response.status_code == 301:
            print(f"⚠️ A API redirecionou para: {response.headers.get('Location')}. Token ou Endpoint inválido.")
            return {"nome": loja["nome"], "total": 0.0, "sucesso": False}

        if response.status_code != 200:
            return {"nome": loja["nome"], "total": 0.0, "sucesso": False}

        dados = response.json()
        
        # Mapeamento dinâmico do retorno do Cardápio Web
        pedidos = dados.get("pedidos", dados.get("data", [])) if isinstance(dados, dict) else dados
        
        total = 0.0
        if isinstance(pedidos, list):
            total = sum(float(p.get("total", p.get("valor_total", 0))) for p in pedidos)

        return {"nome": loja["nome"], "total": total, "sucesso": True}

    except Exception as e:
        print(f"❌ Exceção [{loja['nome']}]: {e}")
        return {"nome": loja["nome"], "total": 0.0, "sucesso": False}

@app.route('/')
def home():
    return render_template('index.html') # Certifique-se de que o index.html está na pasta 'templates'

@app.route('/api/faturamento-ontem', methods=['GET'])
def api_faturamento_ontem():
    ontem = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    
    resultados = []
    total_rede = 0.0

    for loja in LOJAS_CONFIG:
        res = obter_faturamento_loja(loja, ontem, ontem)
        resultados.append(res)
        if res["sucesso"]:
            total_rede += res["total"]

    return jsonify({
        "data": ontem,
        "total_rede": total_rede,
        "lojas": resultados
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)