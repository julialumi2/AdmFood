import requests
import time
from config import LOJAS

URL_BASE = "https://integracao.cardapioweb.com/api/partner/v1/orders"

# Conjunto para armazenar IDs já processados na memória
pedidos_processados = set()

def extrair_dados_pedido(pedido_json):
    """
    Função utilitária para tratar e padronizar os dados do pedido.
    """
    pedido_id = pedido_json.get("id")
    display_id = pedido_json.get("displayId", pedido_id)
    
    cliente = pedido_json.get("customer", {})
    nome_cliente = cliente.get("name", "Cliente não identificado")
    telefone_cliente = cliente.get("phone", "")

    total_info = pedido_json.get("total", {})
    valor_total = total_info.get("orderAmount", 0.0)

    itens = pedido_json.get("items", [])
    resumo_itens = []
    for item in itens:
        resumo_itens.append(f"{item.get('quantity')}x {item.get('name')}")

    return {
        "id": pedido_id,
        "display_id": display_id,
        "cliente": nome_cliente,
        "telefone": telefone_cliente,
        "valor_total": valor_total,
        "itens": ", ".join(resumo_itens)
    }

def processar_pedido(loja, dados_pedido):
    """
    Aqui você insere a sua regra de negócio (salvar no banco de dados, 
    imprimir comanda, enviar mensagem de confirmação, etc).
    """
    print(f"\n🔔 [NOVO PEDIDO RECEIVED] - Loja: {loja}")
    print(f"📌 Pedido Nº: #{dados_pedido['display_id']}")
    print(f"👤 Cliente: {dados_pedido['cliente']} ({dados_pedido['telefone']})")
    print(f"🛒 Itens: {dados_pedido['itens']}")
    print(f"💰 Valor Total: R$ {dados_pedido['valor_total']:.2f}")
    print("=" * 50)

def verificar_novos_pedidos():
    """
    Consulta o Cardápio Web para todas as lojas configuradas.
    """
    for loja, config in LOJAS.items():
        api_key = config.get("cardapio_web_token")
        if not api_key:
            continue

        headers = {
            "X-API-KEY": api_key,
            "Accept": "application/json"
        }

        try:
            res = requests.get(URL_BASE, headers=headers, timeout=10)
            if res.status_code == 200:
                pedidos = res.json()
                for p in pedidos:
                    p_id = p.get("id")
                    if p_id and p_id not in pedidos_processados:
                        pedidos_processados.add(p_id)
                        dados_tratados = extrair_dados_pedido(p)
                        processar_pedido(loja, dados_tratados)
        except Exception as err:
            print(f"⚠️ Erro ao consultar a loja {loja}: {err}")

if __name__ == "__main__":
    print("🚀 Serviço de Integração do Cardápio Web Iniciado.")
    print("Aguardando novos pedidos entrarem no sistema...")

    # Executa em loop contínuo verificando a cada 15 segundos
    while True:
        verificar_novos_pedidos()
        time.sleep(15)