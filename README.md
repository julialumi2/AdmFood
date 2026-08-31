# AdmFood

Sistema de gestão interna para uma rede de 4 lojas (hamburgueria e açaiteria), cobrindo estoque, compras, cardápio e indicadores de vendas — construído pra substituir planilhas soltas e um sistema de terceiros (VMarket) por um fluxo próprio, mais simples e sob medida pro negócio.

Em produção, usado no dia a dia pela equipe de compras e pela gestão da rede.

## Funcionalidades

- **Estoque** — catálogo único de insumos com quantidade por loja, quantidade ideal calculada a partir do consumo real (Ficha Técnica × vendas), ajuste manual, datas especiais (feriados/eventos) e sugestão de compra por tendência.
- **Compras** — fluxo completo: Requisição (link sem login por loja) → Contagem → Conferência → Cotação com fornecedores → Pedido de compra → Entrada em estoque. Cada etapa tem um jeito de desfazer (voltar etapa, cancelar pedido, evitar cotação duplicada).
- **Cardápio** — comparativo de preço por canal de venda e Ficha Técnica (quais insumos cada prato usa), com importação em lote por texto colado.
- **Insights** — faturamento por período/canal sincronizado da API da Cardápio Web, com ajuste manual quando o painel deles diverge da própria API.
- **Preparo** — indicadores operacionais da cozinha (tempo médio de preparo, horário de pico).
- **ClickUp** — quadro Kanban de tarefas com backend próprio.
- Login por usuário com papéis (admin/equipe), sincronização automática agendada e histórico documentado de cada decisão de produto em `DOCUMENTACAO.md`.

## Stack

Python (Flask) · SQLite · HTML/CSS/JavaScript puro (sem framework de front) · Gunicorn + APScheduler em produção · Integração com a API da Cardápio Web.

## Rodando localmente

```bash
pip install -r requirements.txt
python app.py
```

Sobe em `http://127.0.0.1:5000`. Variáveis de ambiente num `.env` na raiz (nunca commitado — ver `.env.example`). Detalhes de cada variável, arquitetura e histórico completo de decisões em [`DOCUMENTACAO.md`](DOCUMENTACAO.md).

## Sobre o desenvolvimento

Projeto conduzido com desenvolvimento assistido por IA (Claude Code): especificação de requisito, revisão e teste de cada entrega antes de ir pra produção, e decisão técnica registrada em documentação — não só geração de código.
