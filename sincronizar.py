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
from backend.armazenamento import (
    inicializar_banco,
    tem_faturamento_no_dia,
    salvar_resumo_do_dia,
    salvar_pedidos_do_dia,
    salvar_itens_vendidos_do_dia,
)

# Segunda as lojas fecham — mas nem sempre: feriado aberto (07/09) e pedido
# que cai na segunda (14/09 teve 6 no Artesanos e 11 na ZN) ficavam de fora,
# e a semana não batia com a planilha (2026-09-18). Agora a segunda é
# consultada como qualquer dia; só não grava a segunda sem pedido, pra loja
# fechada não virar um zero no gráfico.
DIA_FECHADO = 0  # date.weekday(): 0 = segunda-feira


def sincronizar_dia(dia: date):
    dia_iso = dia.isoformat()
    segunda = dia.weekday() == DIA_FECHADO
    for nome_unidade, config_loja in LOJAS.items():
        token = config_loja.get("cardapio_web_token")
        if not token:
            print(f"⚠️  {nome_unidade}: token não configurado, pulando.")
            continue

        try:
            resumo = buscar_resumo_do_dia(token, dia)
            # Segunda sem pedido não grava — a não ser que já tenha dado desse
            # dia (pedido cancelado depois), que precisa ser zerado.
            if segunda and not resumo["quantidade_pedidos"] and not tem_faturamento_no_dia(nome_unidade, dia_iso):
                print(f"{nome_unidade} ({dia_iso}): segunda sem pedido, nada a gravar.")
                continue
            salvar_resumo_do_dia(nome_unidade, dia_iso, resumo)
            salvar_pedidos_do_dia(nome_unidade, dia_iso, resumo["pedidos_detalhados"])
            salvar_itens_vendidos_do_dia(nome_unidade, dia_iso, resumo["pedidos_detalhados"])
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
