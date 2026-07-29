import requests
from datetime import datetime, timedelta
from config import LOJAS 

class SalesIntegrator:
    
    def __init__(self):
        self.api_base_url = "https://portal.cardapioweb.com"

    def fetch_yesterday_metrics(self):
        yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        network_summary = []

        # Percorre as lojas direto do seu config.py
        for nome_loja, config in LOJAS.items():
            token = config.get("cardapio_web_token")
            
            try:
                headers = {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                }
                
                response = requests.get(
                    f"{self.api_base_url}/pedidos",
                    headers=headers,
                    params={"data": yesterday_str},
                    timeout=10
                )

                if response.status_code == 200:
                    orders = response.json().get("pedidos", [])
                    valid_orders = [o for o in orders if o.get("status") != "CANCELADO"]

                    revenue = sum(o.get("total", 0) for o in valid_orders)
                    order_count = len(valid_orders)
                    ticket_average = (revenue / order_count) if order_count > 0 else 0

                    network_summary.append({
                        "nome": nome_loja,
                        "vendas": revenue,
                        "pedidos": order_count,
                        "ticket_medio": ticket_average,
                        "status_crescimento": "pos" if revenue >= 4500 else "neu"
                    })
                else:
                    network_summary.append(self._empty_store_data(nome_loja))

            except Exception as e:
                print(f"[SalesIntegrator] Erro na unidade {nome_loja}: {e}")
                network_summary.append(self._empty_store_data(nome_loja))

        return network_summary

    def _empty_store_data(self, store_name):
        return {
            "nome": store_name,
            "vendas": 0.0,
            "pedidos": 0,
            "ticket_medio": 0.0,
            "status_crescimento": "neu"
        }