"""
Sincroniza o faturamento das lojas com a Cardápio Web e salva no cache local
(admfood.db). Rode manualmente (python sincronizar.py) ou agende pra rodar
todo dia de madrugada (Agendador de Tarefas do Windows, por exemplo).

Uso:
    python sincronizar.py            # sincroniza o dia de ontem
    python sincronizar.py 2026-08-02 # sincroniza uma data específica
"""

import sys
from datetime import date, timedelta

# Evita UnicodeEncodeError ao imprimir emojis no console do Windows (cp1252).
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from config import LOJAS
from backend.cardapio_web import buscar_resumo_do_dia
from backend.armazenamento import inicializar_banco, salvar_resumo_do_dia

# As lojas não abrem às segundas-feiras — pula sem chamar a API.
DIA_FECHADO = 0  # date.weekday(): 0 = segunda-feira


def sincronizar_dia(dia: date):
    if dia.weekday() == DIA_FECHADO:
        print(f"{dia.isoformat()} é segunda-feira — lojas fechadas, nada a sincronizar.")
        return

    dia_iso = dia.isoformat()
    for nome_unidade, config_loja in LOJAS.items():
        token = config_loja.get("cardapio_web_token")
        if not token:
            print(f"⚠️  {nome_unidade}: token não configurado, pulando.")
            continue

        try:
            resumo = buscar_resumo_do_dia(token, dia)
            salvar_resumo_do_dia(nome_unidade, dia_iso, resumo)
            print(
                f"✅ {nome_unidade} ({dia_iso}): "
                f"R$ {resumo['faturamento_dia']:.2f}, {resumo['quantidade_pedidos']} pedidos"
            )
        except Exception as erro:
            print(f"❌ {nome_unidade} ({dia_iso}): {erro}")


if __name__ == "__main__":
    inicializar_banco()

    if len(sys.argv) > 1:
        dia_alvo = date.fromisoformat(sys.argv[1])
    else:
        dia_alvo = date.today() - timedelta(days=1)

    sincronizar_dia(dia_alvo)
