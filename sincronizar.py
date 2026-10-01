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
    detalhes_cw_guardados,
    guardar_detalhes_cw,
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


def sincronizar_dia(dia: date, unidades=None):
    """`unidades`: só essas lojas, em vez das quatro — pra consertar o
    histórico de uma sem recalcular o das outras (28/09)."""
    dia_iso = dia.isoformat()
    # Cada loja tem a sua hora de virada: no Artesanos e nas Tradiças o dia
    # vai até de madrugada, e essas vendas caíam no dia seguinte (25/09).
    viradas = horas_virada_das_lojas()
    for nome_unidade, config_loja in LOJAS.items():
        if unidades and nome_unidade not in unidades:
            continue
        token = config_loja.get("cardapio_web_token")
        if not token:
            print(f"⚠️  {nome_unidade}: token não configurado, pulando.")
            continue

        try:
            resumo = buscar_resumo_do_dia(
                token, dia, viradas.get(nome_unidade, VIRADA_PADRAO),
                # O detalhe de pedido já fechado não muda, e o dia de hoje é
                # resincronizado de 15 em 15 minutos: sem isto, o mesmo
                # pedido era rebuscado dezenas de vezes por dia, uma
                # requisição e 0,65s de espera cada.
                buscar_guardados=lambda ids: detalhes_cw_guardados(nome_unidade, ids),
            )
            salvar_resumo_do_dia(nome_unidade, dia_iso, resumo)
            salvar_pedidos_do_dia(nome_unidade, dia_iso, resumo["pedidos_detalhados"])
            salvar_itens_vendidos_do_dia(nome_unidade, dia_iso, resumo["pedidos_detalhados"])
            # Guardar só depois de o dia inteiro ter sido gravado: se algo
            # acima falhar, o detalhe não fica guardado como se tivesse
            # entrado no faturamento.
            guardar_detalhes_cw(nome_unidade, resumo["pedidos_detalhados"])
            if not resumo["quantidade_pedidos"] and not resumo["faturamento_dia"]:
                print(f"🔒 {nome_unidade} ({dia_iso}): sem venda nenhuma, gravado como dia fechado.")
            else:
                economia = ""
                if resumo.get("detalhes_reaproveitados"):
                    economia = (f", {resumo['detalhes_reaproveitados']} detalhe(s) reaproveitado(s)"
                                f" e {resumo['detalhes_buscados']} buscado(s)")
                print(
                    f"✅ {nome_unidade} ({dia_iso}): "
                    f"R$ {resumo['faturamento_dia']:.2f}, {resumo['quantidade_pedidos']} pedidos{economia}"
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
