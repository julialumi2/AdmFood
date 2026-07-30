from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import requests

app = FastAPI()

# Libera o CORS para o seu Front-end conseguir consultar o Python sem bloqueios
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/faturamento")
def obter_faturamento(
    loja_id: str = Query(...),
    token: str = Query(...),
    data_inicio: str = Query(...),
    data_fim: str = Query(...)
):
    url = f"https://api.cardapioweb.com/v1/pedidos"
    params = {
        "loja_id": loja_id,
        "data_inicio": data_inicio,
        "data_fim": data_fim
    }
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }

    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Erro ao conectar com Cardápio Web: {str(e)}")

# Para rodar o servidor:
# uvicorn main:app --reload --port 8000