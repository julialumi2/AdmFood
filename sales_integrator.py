from datetime import datetime, timedelta
import requests
from config import LOJAS

class SalesIntegrator:
    def __init__(self):
        # Endpoints mapeados para testes do Cardápio Web / Painéis de Integração
        self.endpoints_para_testar = [
            "https://api.cardapioweb.com/v1/pedidos",
            "https://api.cardapioweb.com/v1/orders",
            "https://cardapioweb.com/api/v1/pedidos",
            "https://app.cardapioweb.com/api/v1/pedidos",
            "https://integra.cardapioweb.com/v1/pedidos"
        ]

    def _safe_float(self, val) -> float:
        if val is None:
            return 0.0
        try:
            if isinstance(val, str):
                val = val.replace(".", "").replace(",", ".") if "," in val else val
            return float(val)
        except (ValueError, TypeError):
            return 0.0

    def fetch_yesterday_metrics(self):
        ontem = datetime.now() - timedelta(days=1)
        
        data_simples = ontem.strftime("%Y-%m-%d")        # 2026-07-28
        data_br = ontem.strftime("%d/%m/%Y")             # 28/07/2026
        
        inicio_iso = f"{data_simples}T00:00:00"
        fim_iso = f"{data_simples}T23:59:59"

        print(f"\n📡 [CARDÁPIO WEB] Filtrando período: {data_br}")
        
        network_summary = []
        total_rede = 0.0

        for nome_loja, config in LOJAS.items():
            token = config.get("cardapio_web_token")
            
            if not token:
                print(f"⚠️ [{nome_loja}] Token ausente no config.py.")
                network_summary.append(self._empty_store(nome_loja))
                continue

            # Inclusão de Headers suportados por gateways e sistemas de Cardápio
            headers_opcoes = [
                {"X-API-KEY": token, "Accept": "application/json"},
                {"Authorization": f"Bearer {token}", "Accept": "application/json"},
                {"token": token, "Accept": "application/json"},
                {"X-Token": token, "Accept": "application/json"}
            ]

            variacoes_params = [
                {"data_inicio": data_simples, "data_fim": data_simples},
                {"startDate": data_simples, "endDate": data_simples},
                {"created_at_gte": inicio_iso, "created_at_lte": fim_iso},
                {"data": data_br}
            ]

            sucesso_loja = False

            for url in self.endpoints_para_testar:
                if sucesso_loja:
                    break

                for headers in headers_opcoes:
                    if sucesso_loja:
                        break

                    for params in variacoes_params:
                        try:
                            response = requests.get(url, headers=headers, params=params, timeout=8)
                            
                            # Se retornar 200 e JSON
                            if response.status_code == 200 and "json" in response.headers.get("Content-Type", ""):
                                data = response.json()
                                
                                orders = []
                                if isinstance(data, dict):
                                    orders = (
                                        data.get("data") or 
                                        data.get("pedidos") or 
                                        data.get("orders") or 
                                        data.get("items") or 
                                        []
                                    )
                                elif isinstance(data, list):
                                    orders = data

                                valid_orders = [
                                    o for o in orders 
                                    if str(o.get("status", "")).upper() not in ["CANCELLED", "CANCELED", "CANCELADO", "REJECTED"]
                                ]

                                vendas = sum(
                                    self._safe_float(o.get("total") or o.get("total_amount") or o.get("valor_total")) 
                                    for o in valid_orders
                                )
                                pedidos = len(valid_orders)
                                ticket_medio = (vendas / pedidos) if pedidos > 0 else 0.0

                                total_rede += vendas

                                print(f"✅ [{nome_loja}] Conectado com sucesso em: {url}")
                                network_summary.append({
                                    "nome": nome_loja,
                                    "vendas": round(vendas, 2),
                                    "pedidos": pedidos,
                                    "ticket_medio": round(ticket_medio, 2),
                                    "status_crescimento": "pos" if vendas > 0 else "neu"
                                })
                                sucesso_loja = True
                                break

                            # Se o endpoint respondeu com erro de autenticação ou rota inexistente
                            elif response.status_code in [401, 403]:
                                # Token/Header recusado para este endpoint
                                break

                        except requests.RequestException:
                            continue

            if not sucesso_loja:
                print(f"❌ [{nome_loja}] Não retornou dados válidos. Verifique se a URL da API do Cardápio Web ou o Token estão corretos.")
                network_summary.append(self._empty_store(nome_loja))

        return {
            "total_rede": round(total_rede, 2),
            "lojas": network_summary
        }

    def _empty_store(self, store_name: str) -> dict:
        return {
            "nome": store_name,
            "vendas": 0.0,
            "pedidos": 0,
            "ticket_medio": 0.0,
            "status_crescimento": "neu"
        }