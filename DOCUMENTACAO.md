# AdmFood — Documentação do Sistema

Sistema de gestão para a rede de lojas (Hamburgueria Artesanos, Açaí Na Lata,
Tradiça ZN, Tradiça Simus): acompanha faturamento sincronizado da Cardápio
Web, vendas presenciais, insights automáticos e um quadro de tarefas interno.

- **Produção:** https://admfood.artesanosburger.com.br/
- **Deploy:** Dokploy (a partir do push em `main` no GitHub)
- **Repositório:** https://github.com/julialumi2/AdmFood

## 1. Stack

- **Backend:** Flask (Python), servido em produção via Gunicorn
- **Banco:** SQLite (`admfood.db`), sem ORM — SQL direto em `backend/armazenamento.py`
- **Frontend:** HTML/CSS/JS puro (sem framework, sem build step) — cada página
  é um `.html` solto na raiz, com um `script.js` único compartilhado por todas
- **Agendamento:** APScheduler (roda dentro do próprio processo Flask em produção)
- **Integração externa:** API da Cardápio Web (faturamento/pedidos por loja)

## 2. Estrutura do projeto

```
app.py                      → rotas Flask (páginas estáticas + API)
config.py                   → LOJAS (config por unidade, lida de env vars)
sincronizar.py               → lógica de sincronização diária (usada pelo app.py e rodável isolada)
backend/
  armazenamento.py           → toda a camada SQLite (schema + queries)
  cardapio_web.py            → cliente da API da Cardápio Web
importar_historico_sheets.py → script avulso de importação inicial (Google Sheets → SQLite)
completar_pedidos_historico.py → script avulso de backfill de histórico

*.html / *.css               → uma página por arquivo, na raiz do projeto
script.js                    → JS de todas as páginas, num arquivo só
theme.css                    → design system compartilhado (sidebar, header, modais, botões, badges)
```

Cada página HTML carrega `theme.css` + seu próprio CSS específico (ex:
`clickup.css`) + o `script.js` único. O `script.js` detecta em qual página
está (via seletores tipo `document.querySelector('.kanban-board')`) e só
inicializa o que é relevante pra ela.

### Páginas

| Arquivo | Tela |
|---|---|
| `index.html` | Resumo (Home) — faturamento da rede, gráfico diário, insights automáticos |
| `estoque.html` | Estoque (integração VMarket — ver seção 8, pendente) |
| `preparo.html` | Preparo / KDS (em desenvolvimento pela Julia) |
| `clickup.html` | Quadro de tarefas (Kanban) |
| `insight.html` | Insights — faturamento por período, por loja, por canal, por dia da semana |
| `configuracoes.html` | Configurações — status dos tokens da Cardápio Web, sincronização manual, lançamento de venda presencial |
| `login.html`, `registro.html`, `esquecisenha.html` | Telas de autenticação (visual pronto, **sem lógica real ainda** — ver seção 8) |
| `landing.html` | Landing page pública (ainda não publicada em produção) |

## 3. Rodando localmente

```bash
pip install -r requirements.txt
python app.py
```

Sobe em `http://127.0.0.1:5000`. Variáveis de ambiente lidas de um arquivo
`.env` na raiz (via `python-dotenv`), nunca commitado.

Variáveis usadas (ver `config.py` e `app.py`):

| Variável | Para quê |
|---|---|
| `TOKEN_ARTESANOS`, `TOKEN_ACAI`, `TOKEN_ZN`, `TOKEN_SIMUS` | Token de API da Cardápio Web de cada loja |
| `GRUPO_WHATSAPP_ARTESANOS`, `GRUPO_WHATSAPP_ACAI`, `GRUPO_WHATSAPP_ZN`, `GRUPO_WHATSAPP_SIMUS` | ID do grupo de WhatsApp de cada loja (reservado — ver item pendente de relatório via WhatsApp) |
| `MAKE_WEBHOOK_URL` | Webhook do Make.com (integração legada/reservada) |
| `DATABASE_PATH` | Caminho do arquivo SQLite. Em produção aponta pra um volume persistente do Dokploy — sem isso, o banco se perde a cada deploy |
| `SINCRONIZACAO_AUTOMATICA` | `"true"` liga o agendador automático dentro do próprio Flask (usado em produção; localmente a sincronização roda via Agendador de Tarefas do Windows chamando `sincronizar.py`, fora do processo do Flask) |

Sincronizar manualmente um dia específico, sem subir o servidor:

```bash
python sincronizar.py               # sincroniza ontem
python sincronizar.py 2026-08-02    # sincroniza uma data específica
```

## 4. Sincronização com a Cardápio Web

`backend/cardapio_web.py` fala com `https://integracao.cardapioweb.com/api/partner/v1`:

1. `GET /orders/history` — lista pedidos do dia (id, canal, status). Limite: 5 req/min.
2. `GET /orders/{id}` — detalhe de cada pedido (pra pegar o valor total, que o
   endpoint de histórico não retorna). Limite: ~100 req/min — por isso há um
   `time.sleep(0.65)` entre cada chamada.

Só pedidos com status `closed` ou `delivered` contam como venda concluída
(`STATUS_CONCLUIDOS`). Pedidos do canal iFood somam também o valor de
"Descontos iFood" patrocinados pelo iFood (não pela loja), que a API separa
do total do pedido.

O resultado (`buscar_resumo_do_dia`) é salvo no SQLite local
(`salvar_resumo_do_dia`, em `backend/armazenamento.py`) nas tabelas
`faturamento_diario` e `faturamento_canal` — todo o resto do sistema lê
desse cache, nunca chama a Cardápio Web ao vivo numa requisição de página.

**Em produção**, dois jobs do APScheduler rodam dentro do processo do Flask
(`app.py`, gatilhados só se `SINCRONIZACAO_AUTOMATICA=true`):
- Diário às 3h — fecha o dia anterior com calma
- A cada 15 min — resincroniza o dia de hoje, pra tela ir se atualizando quase em tempo real

Como o Gunicorn roda múltiplos workers (processos separados) e cada um
executaria esse código de novo, há uma trava em `/tmp/admfood_scheduler.lock`
(criação atômica de arquivo) garantindo que só um worker agende os jobs.

Botão "Sincronizar agora" (tela de Configurações) dispara
`POST /api/sincronizar-agora` — roda em thread separada e responde na hora,
pra não estourar o timeout do proxy de produção enquanto sincroniza as 4 lojas.

**Segundas-feiras são dia de loja fechada** (`DIA_FECHADO = 0` em
`sincronizar.py`) — a sincronização pula sem chamar a API.

## 5. Vendas presenciais

Duas lojas (Hamburgueria Artesanos e Tradiça ZN — `UNIDADES_COM_PRESENCIAL`
em `app.py`) têm vendas no balcão que não passam pela Cardápio Web. Esses
valores são lançados manualmente na tela de Configurações e ficam na tabela
`venda_presencial`. Todo relatório de faturamento (Home, Insights) soma
automaticamente o presencial ao valor sincronizado da Cardápio Web
(`_aplicar_presencial` em `app.py`).

## 6. Banco de dados (SQLite)

Schema completo vive em `inicializar_banco()`
([backend/armazenamento.py](backend/armazenamento.py)), chamada uma vez na
subida do `app.py`. Todas as tabelas usam `CREATE TABLE IF NOT EXISTS`, então
é seguro rodar em todo restart — evoluções de schema em tabelas já existentes
usam `ALTER TABLE ... ADD COLUMN` com checagem prévia (ver exemplo em
`venda_presencial.quantidade`).

| Tabela | Guarda |
|---|---|
| `faturamento_diario` | Faturamento/ticket médio/qtd. de pedidos por loja e dia (cache da Cardápio Web) |
| `faturamento_canal` | Mesmo, quebrado por canal de venda (iFood, 99Food, Cardápio Web, Presencial) |
| `venda_presencial` | Lançamentos manuais de venda de balcão |
| `tarefa` | Tarefas do quadro Kanban (ClickUp) |
| `tarefa_subtarefa` | Itens de checklist de cada tarefa |
| `tarefa_comentario` | Comentários de cada tarefa |

Não há chaves estrangeiras com `ON DELETE CASCADE` — ao excluir uma tarefa
(`excluir_tarefa`), o código apaga manualmente as linhas relacionadas em
`tarefa_subtarefa` e `tarefa_comentario` antes de apagar a tarefa.

## 7. API — principais endpoints

Todos em `app.py`, prefixo `/api`.

**Faturamento / Insights**
- `GET /api/faturamento-ontem` — total do dia anterior por loja + rede
- `GET /api/faturamento-rede-diario?dias=N` — série diária da rede pro gráfico da Home (padrão 7, máx 90)
- `GET /api/canal-analise?unidade=&dia=` — quebra por canal de venda de um dia
- `GET /api/faturamento-mesmo-dia-semana?unidade=&dia=` — todas as ocorrências do mesmo dia da semana no mês (usado no relatório comparativo)
- `GET /api/insights?inicio=&fim=&diaSemana=` — visão completa por período, com filtro opcional por dia da semana; retorna um bloco por loja + "geral"
- `GET /api/insights-automaticos` — compara ontem contra a média dos 7 dias anteriores, destaca variações >8% (usado nos cards da Home)

**Configuração / Sincronização**
- `GET /api/config/lojas` — status de cada loja (token mascarado, última sincronização)
- `POST /api/sincronizar-agora?dia=AAAA-MM-DD` — dispara sincronização em background (sem `?dia`, sincroniza ontem)

**Venda presencial**
- `GET|POST|DELETE /api/venda-presencial` — listar/lançar/excluir (só unidades em `UNIDADES_COM_PRESENCIAL`)

**Tarefas (Kanban / ClickUp)**
- `GET|POST /api/tarefas` — listar todas / criar
- `PUT|DELETE /api/tarefas/<id>` — atualizar campos (parcial) / excluir
- `POST /api/tarefas/<id>/subtarefas` — adicionar item de checklist
- `PUT /api/tarefas/<id>/subtarefas/<id>` — marcar concluída/pendente
- `POST /api/tarefas/<id>/comentarios` — comentar (autor sempre `"Julia Suzuki"` — sistema ainda é de usuário único, ver seção 8)

Campos de `PUT /api/tarefas/<id>` aceitos (camelCase na API → coluna no banco):
`titulo`, `descricao`, `categoria`, `prioridade`, `status`, `dataLimite` → `data_limite`.

## 8. Pendências conhecidas (roadmap em aberto)

Lista viva do que falta pro sistema ficar 100% funcional (conversa de
2026-08-17 com a Julia):

1. **Estoque / VMarket** — varredura no código pra tela de Estoque funcionar. Aguardando a Julia esclarecer o que é/onde está o VMarket.
2. **Relatório via WhatsApp** — integração com a API do WhatsApp Business pra enviar relatórios. Aguardando confirmação de acesso/credenciais da API.
3. **ClickUp** — ✅ concluído em 2026-08-17 (backend real + Kanban persistente, ver seção 7).
4. **Acessos da equipe + landing page em produção** — sistema hoje é de usuário único (autor de comentário fixo em `"Julia Suzuki"`, sem tabela de usuários/login real). Decisão já tomada com a Julia: **login individual por pessoa, com senha** (não vai ser senha compartilhada). Ainda não iniciado — precisa de: tabela de usuários, hash de senha, sessão/login, proteção das rotas existentes. Falta também definir se a landing page sobe em produção como está ou só depois desse login existir.
5. **Documentação do sistema** — este arquivo.
6. **Agente no WhatsApp pra relatórios sob demanda** — perguntar todo dia de manhã, num grupo, quanto vendeu no presencial (Art e Tradiça ZN) do dia anterior, e a própria Julia responder pra atualizar o sistema. Depende do item 2 (acesso à API do WhatsApp).

## 9. Padrões do projeto (pra manter consistência em mudanças futuras)

- Nomes de função, variável e comentário em **português**; nomes de campo na
  API voltada ao frontend em **camelCase** (`dataLimite`), colunas do banco
  em **snake_case** (`data_limite`).
- CSS: regras compartilhadas entre páginas ficam em `theme.css`; cada página
  só tem no seu `.css` próprio o que é específico dela.
- Segredos reais (tokens, etc.) só existem em `.env` local (gitignored) e nas
  variáveis de ambiente do Dokploy — nunca commitados. Tokens só aparecem
  mascarados nas respostas da API (`_mascarar_token`).
- Rotas de arquivo estático (`/<path:nome_arquivo>`) bloqueiam qualquer nome
  com `/` ou `\` e qualquer extensão fora de `EXTENSOES_PUBLICAS` — protege
  contra acesso a `.py`, `.env`, `.db`, `backend/`, `.git/` etc pela URL.
