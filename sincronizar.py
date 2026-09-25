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
    salvar_resumo_do_dia,
    salvar_pedidos_do_dia,
    salvar_itens_vendidos_do_dia,
    horas_virada_das_lojas,
    VIRADA_PADRAO,
)

# Segunda as lojas fecham — mas nem sempre: feriado aberto (07/09) e pedido
# que cai na segunda (14/09 teve 6 no Artesanos e 11 na ZN) ficavam de fora,
# e a semana não batia com a planilha (2026-09-18).
#
# A segunda sem pedido também não era gravada, pra loja fechada não virar um
# zero no gráfico — mas o gráfico já preenche dia faltando com zero sozinho,
# e o preço era alto: sem a linha do dia, a semana contava "6 de 7 dias" e
# ficava em andamento pra sempre, e "loja fechada" ficava idêntico a
# "sincronização falhou" (QA 22/09). Agora todo dia é gravado, e o dia sem
# venda nenhuma fica marcado como fechado.


def sincronizar_dia(dia: date):
    dia_iso = dia.isoformat()
    # Cada loja tem a sua hora de virada: no Artesanos e nas Tradiças o dia
    # vai até de madrugada, e essas vendas caíam no dia seguinte (25/09).
    viradas = horas_virada_das_lojas()
    for nome_unidade, config_loja in LOJAS.items():
        token = config_loja.get("cardapio_web_token")
        if not token:
            print(f"⚠️  {nome_unidade}: token não configurado, pulando.")
            continue

        try:
            resumo = buscar_resumo_do_dia(token, dia, viradas.get(nome_unidade, VIRADA_PADRAO))
            salvar_resumo_do_dia(nome_unidade, dia_iso, resumo)
            salvar_pedidos_do_dia(nome_unidade, dia_iso, resumo["pedidos_detalhados"])
            salvar_itens_vendidos_do_dia(nome_unidade, dia_iso, resumo["pedidos_detalhados"])
            if not resumo["quantidade_pedidos"] and not resumo["faturamento_dia"]:
                print(f"🔒 {nome_unidade} ({dia_iso}): sem venda nenhuma, gravado como dia fechado.")
            else:
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
