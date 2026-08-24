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
| `estoque.html` | Estoque — controle nativo de insumos por loja, sem depender de terceiro (ver seção 6.4) |
| `cardapio.html` | Cardápio — comparativo de preços por canal de venda (iFood/99Food/BeeFood/Cardápio Web), só leitura, importado de planilha (ver seção 6.1) |
| `preparo.html` | Preparo — indicadores operacionais da cozinha (tempo médio do pedido, volume por horário, gargalos; ver seção 6.2) |
| `clickup.html` | Quadro de tarefas (Kanban) |
| `insight.html` | Insights — faturamento por período, por loja, por canal, por dia da semana |
| `configuracoes.html` | Configurações — status dos tokens da Cardápio Web, sincronização manual, lançamento de venda presencial |
| `login.html` | Login (e-mail + senha) — única página, além de `esquecisenha.html`, acessível sem estar logado |
| `esquecisenha.html` | Orienta a falar com o admin pra redefinir a senha (não tem recuperação por e-mail) |
| `registro.html`, `landing.html` | Cadastro público e landing page — hoje exigem login como qualquer outra tela (sistema é só interno por enquanto, ver seção 9) |

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
| `SECRET_KEY` | Assina o cookie de sessão do login. Precisa ser o **mesmo valor em todos os workers** do Gunicorn — por isso vem de env var fixa, nunca gerada em runtime |
| `SESSION_COOKIE_SECURE` | `"true"` em produção (HTTPS) — o cookie de sessão só é enviado em conexão segura |
| `ADMIN_INICIAL_EMAIL`, `ADMIN_INICIAL_SENHA`, `ADMIN_INICIAL_NOME` | Cria/sincroniza esse usuário como admin a cada subida do app (ver seção 8.1) — só precisa ficar setado até o primeiro login funcionar |
| `EQUIPE_INICIAL` | Mesma ideia, pra vários membros de uma vez — lista JSON `[{"nome","email","senha","papel"}]` (ver seção 8.1) |

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
- Diário às 3h — reconfere os **últimos 3 dias** (não só ontem), com calma
- A cada 15 min — resincroniza o dia de hoje, pra tela ir se atualizando quase em tempo real

A reconferência dos últimos 3 dias existe porque um pedido que ainda
estava "em andamento" (não `closed`/`delivered`) no momento de uma
sincronização anterior fica de fora daquela vez — comum em dias de mais
movimento, tipo sábado, onde vários pedidos só fecham depois da meia-noite.
Sem reconferir, esse pedido nunca mais seria contado. Isso também cobre uma
sincronização que falhou por completo (rede, deploy no meio da madrugada
etc.), que senão deixaria aquele dia incompleto pra sempre. Achado e
corrigido em 2026-08-24, depois de detectar (comparando com o painel da
própria Cardápio Web) que os 4 lojas tinham pedidos de sábado faltando —
em alguns casos, quase metade dos pedidos do dia.

Como o Gunicorn roda múltiplos workers (processos separados) e cada um
executaria esse código de novo, há uma trava em `/tmp/admfood_scheduler.lock`
(criação atômica de arquivo) garantindo que só um worker agende os jobs.

Botão "Sincronizar agora" (tela de Configurações) dispara
`POST /api/sincronizar-agora` — roda em thread separada e responde na hora,
pra não estourar o timeout do proxy de produção enquanto sincroniza as 4 lojas.
Sem `?dia=`, sincroniza só ontem (o botão da tela não expõe essa opção); com
`?dia=AAAA-MM-DD` sincroniza um dia específico — útil pra corrigir um dia
manualmente sem esperar a reconferência automática (dá pra chamar direto do
console do navegador: `fetch('/api/sincronizar-agora?dia=2026-08-22', {method:'POST'})`).

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
| `usuario` | Login da equipe — `senha_hash` (nunca texto puro), `papel` (`admin`/`equipe`), `ativo` |
| `preco_cardapio` | Comparativo de preços do cardápio, só leitura (ver 6.1) |
| `pedido_preparo` | Tempo de cada pedido concluído (ver 6.2) |
| `ajuste_faturamento_canal` | Correção manual de faturamento/pedidos por canal (ver 6.3) |
| `insumo` | Catálogo único de insumos da rede (ver 6.4) |
| `estoque_insumo` | Quantidade atual e mínimo de cada insumo, por loja (ver 6.4) |

Não há chaves estrangeiras com `ON DELETE CASCADE` — ao excluir uma tarefa
(`excluir_tarefa`), o código apaga manualmente as linhas relacionadas em
`tarefa_subtarefa` e `tarefa_comentario` antes de apagar a tarefa.

### 6.1 Comparativo de preços do cardápio

Tela `cardapio.html` — mostra o preço de cada item do cardápio em cada
canal de venda (iFood, 99Food, BeeFood, Cardápio Web), lado a lado, por
loja, num card por produto (com foto). Todo mundo logado vê; só admin edita
preço e sobe foto.

**Fonte dos preços é a planilha**, mas dá pra editar um valor específico
direto na tela também (ex: corrigir um preço que mudou antes da próxima
planilha chegar). A leitura da planilha (`.xlsx` com uma aba por grupo de
loja — Artesanos, Tradiças, Açaí Na Lata; a Tradiça ZN e a Tradiça Simus
compartilham a mesma tabela de preços) vive em `backend/precos_cardapio.py`,
usada por dois jeitos de reimportar:

- **Botão "Importar planilha"** na tela Cardápio (só admin) — sobe o
  arquivo direto pelo navegador, sem precisar de acesso ao servidor. É o
  jeito normal de atualizar em produção.
- **Linha de comando**, útil em desenvolvimento local:
  ```bash
  python importar_precos_cardapio.py "caminho/da/planilha.xlsx"
  ```

`sincronizar_precos_cardapio()` (`backend/armazenamento.py`) faz um upsert
por `(loja, produto)` — não apaga a tabela e recria: produto que já existe
tem categoria/preço/ordem atualizados a partir da planilha (**sobrescreve
uma edição manual de preço**, a planilha sempre vence), mas mantém o `id` e
a **foto** (a planilha não tem foto — se apagasse e recriasse, a foto se
perderia a cada reimportação). Produto novo é inserido; produto que sumiu
da planilha é removido. Uma linha da planilha com o nome do produto mas
nenhum preço em nenhum canal é tratada como cabeçalho de categoria
(BEBIDAS, PORÇÕES etc.), não como um produto.

Fotos ficam em `PASTA_FOTOS_CARDAPIO` (`backend/armazenamento.py`) — uma
pasta `cardapio_fotos/` do lado do `admfood.db`, **no mesmo volume
persistente** (mesmo motivo do banco: sem isso, some a cada redeploy).
Servidas via `/cardapio-fotos/<arquivo>`, só extensões de imagem.

### 6.2 Preparo (indicadores operacionais da cozinha)

Tela `preparo.html` — nasceu de um pedido de KDS (Kitchen Display System)
em tempo real, mas virou uma tela de indicadores/relatório depois de
investigar a API da Cardápio Web: não dá pra saber o momento exato em que
um pedido fica "pronto" (só o momento em que fecha/é entregue), então uma
tela ao vivo tipo Kanban não teria como mostrar "em preparo" de forma
confiável. **"Tempo de preparo" aqui é o tempo do PEDIDO INTEIRO** — do
recebido ao fechado/entregue —, o que já inclui o tempo de entrega quando
houver (ver `backend/cardapio_web.py:_duracao_minutos`).

Sem chamada extra à API: os mesmos dados que já buscamos pra calcular o
faturamento (`buscar_resumo_do_dia`) já trazem `created_at`/`updated_at`
de cada pedido — só passamos a guardar isso também, em
`pedido_preparo`, junto da sincronização normal (`salvar_pedidos_do_dia`).

`GET /api/preparo?inicio=&fim=` retorna, por loja e um bloco `"geral"`:
tempo médio, total de pedidos, horário de pico, volume por horário (24
posições) e os 10 "gargalos" (loja+dia com maior tempo médio, mínimo 3
pedidos pra não contar ruído — um dia com 1 pedido não é "lento", é pouco
dado). O bloco `"geral"` também traz `porLoja`, pra comparar as 4 unidades.

**Backfill histórico**: dias sincronizados antes dessa tabela existir não
têm o detalhe por pedido. `python preencher_pedidos_preparo_historico.py`
busca isso retroativamente (mesmo limite de 5 req/min do
`/orders/history` do `completar_pedidos_historico.py`, que faz a mesma
coisa pra contagem de pedidos).

### 6.3 Ajuste manual de faturamento por canal

Achado em produção (2026-08-24): o **painel da própria Cardápio Web** às
vezes mostra um valor de faturamento/pedidos diferente do que a API de
parceiro retorna pro mesmo canal/dia — conferido pedido por pedido, a
API está certa (bate exatamente com a soma dos pedidos reais), então a
divergência é do lado do painel deles, não nosso. Sem forma de descobrir
a causa raiz por fora, a solução foi permitir corrigir manualmente.

Na tela de Insights, ao abrir a análise de canal de **um dia específico
de uma loja específica** (nunca no período agregado nem na Visão Geral —
não faria sentido editar um número que já é soma de vários dias/lojas),
admin vê um botão de editar por canal. O ajuste salvo em
`ajuste_faturamento_canal` **substitui** o valor sincronizado sempre que
aparecer (`_aplicar_ajustes_canal` em `app.py`) — numa sincronização
futura (automática ou manual), o valor da API é recalculado normalmente,
mas o ajuste continua "vencendo" até alguém removê-lo pela tela. A
diferença entre o valor ajustado e o original também é somada ao total do
dia (cards de topo, Histórico Diário), não só na tabela de canal.

### 6.4 Estoque (insumos nativos, por loja)

Tela `estoque.html` — antes era só uma maquete estática (dado inventado),
com a ideia original de integrar com a VMarket. Investigado e descartado:
a VMarket não tem API de parceiro (só exportação manual de planilha), e
depois disso o próprio dono do negócio decidiu (2026-08-24) parar de usar
a VMarket no futuro e manter o controle de estoque só no nosso sistema —
essa tela é a implementação nativa disso, sem depender de terceiro.

**Catálogo único, quantidade por loja**: `insumo` guarda nome/categoria/
unidade de medida uma vez só pra rede toda; `estoque_insumo` guarda
quantidade atual e estoque mínimo **separados por loja** (chave
`insumo_id + loja`) — cada unidade consome num ritmo diferente, e uma
compra chega em quantidade única mas é fisicamente dividida entre lojas
na entrega.

- **Cadastrar insumo** (`POST /api/insumos`, admin) já cria a linha de
  estoque zerada nas 4 lojas de uma vez (`criar_insumo` em
  `backend/armazenamento.py`), pra toda loja já aparecer pronta pra
  receber quantidade sem passo extra.
- **"Registrar entrada"** (`POST /api/insumos/<id>/entrada`, admin) — soma
  (não substitui) a quantidade informada pra cada loja escolhida, de uma
  vez só. Pensado pro caso real: comprou-se um total X de um insumo, mas
  ele chega dividido entre lojas.
- **Editar estoque de uma loja** (`PUT /api/insumos/<id>/estoque/<loja>`,
  admin) — correção direta (contagem manual, ajuste de mínimo),
  diferente de "entrada": aqui *substitui* o valor, não soma.
- **Status** (`ok`/`baixo`/`critico`, calculado em `_status_estoque` no
  `app.py`, não fica salvo): quantidade zerada ou abaixo do mínimo é
  `critico`; até 30% acima do mínimo é `baixo`; daí pra cima é `ok`. Sem
  mínimo cadastrado (`0`), não dá pra avaliar — considera `ok` a não ser
  que a quantidade também esteja zerada.
- **Excluir insumo** (`DELETE /api/insumos/<id>`, admin) remove de
  **todas** as lojas de uma vez (apaga o catálogo, não só uma loja).

Tela com abas por loja (mesmo padrão do Insights/Preparo/Cardápio). A aba
"Visão Geral" **não** mostra uma linha por loja — soma quantidade e
mínimo das 4 lojas num único valor consolidado por insumo (cálculo em
`_linhasEstoqueParaTab` no `script.js`, o backend continua guardando por
loja normalmente). Por isso editar quantidade/mínimo só aparece numa aba
de loja específica (não faria sentido editar uma soma); excluir o insumo
aparece em qualquer aba, já que remove de todas as lojas de qualquer
jeito. Leitura liberada pra todo mundo logado; cadastrar/editar/excluir é
só admin.

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

**Cardápio**
- `GET /api/precos-cardapio` — comparativo de preços, agrupado por loja e categoria
- `POST /api/precos-cardapio/importar` — sincroniza a partir de um `.xlsx` enviado (multipart, campo `planilha`) — só admin (ver seção 6.1)
- `PUT /api/precos-cardapio/<id>` — edita o preço de um item num canal específico — só admin
- `POST /api/precos-cardapio/<id>/foto` — sobe a foto de um item (multipart, campo `foto`, jpg/png/webp) — só admin

**Tarefas (Kanban / ClickUp)**
- `GET|POST /api/tarefas` — listar todas / criar
- `PUT|DELETE /api/tarefas/<id>` — atualizar campos (parcial) / excluir
- `POST /api/tarefas/<id>/subtarefas` — adicionar item de checklist
- `PUT /api/tarefas/<id>/subtarefas/<id>` — marcar concluída/pendente
- `POST /api/tarefas/<id>/comentarios` — comentar (autor é o usuário logado)

Campos de `PUT /api/tarefas/<id>` aceitos (camelCase na API → coluna no banco):
`titulo`, `descricao`, `categoria`, `prioridade`, `status`, `dataLimite` → `data_limite`.

**Login**
- `POST /api/login` — `{email, senha}` → seta cookie de sessão. Único endpoint de API acessível sem estar logado
- `POST /api/logout` — limpa a sessão
- `GET /api/me` — dados do usuário logado (nome, e-mail, papel)
- `PUT /api/me/senha` — troca a própria senha (`{senhaAtual, senhaNova}`) — exige a senha atual, qualquer usuário logado pode usar

**Gestão de equipe (só `papel=admin`)**
- `GET|POST /api/usuarios` — listar / criar membro
- `PUT /api/usuarios/<id>` — editar nome/papel/ativo, opcionalmente resetar senha
- `DELETE /api/usuarios/<id>` — excluir
- Admin não consegue se autodesativar, se rebaixar pra "equipe" nem se autoexcluir pela própria conta

## 8. Login e controle de acesso

Adicionado em 2026-08-19. Cada pessoa da equipe tem seu próprio usuário
(e-mail + senha com hash PBKDF2, via `werkzeug.security`), com papel
`admin` ou `equipe`. Sessão via cookie assinado (`HttpOnly` + `SameSite=Lax`,
`Secure` em produção).

**Toda rota exige login** — `@app.before_request` em `app.py` bloqueia
qualquer página `.html` (redireciona pra `login.html`) e qualquer `/api/*`
(401 JSON) pra quem não está logado, exceto `login.html`, `esquecisenha.html`
e `POST /api/login`.

Só admin acessa a gestão de equipe (`/api/usuarios*`) — qualquer outro
usuário logado só troca a própria senha (`PUT /api/me/senha`).

`POST /api/login` tem limite de 5 tentativas falhas por e-mail a cada 5
minutos (em memória, em `app.py` — não é compartilhado entre workers do
Gunicorn, mas já corta bastante a velocidade de um ataque de força bruta).
Não há CORS configurado — frontend e backend são a mesma origem, nunca foi
necessário em produção.

### 8.1 Bootstrap do admin inicial

Não existe cadastro público (decisão tomada com a Julia: só admin cria
acesso). O primeiro admin é criado automaticamente via variáveis de
ambiente — `_criar_admin_inicial_se_necessario()` em `app.py`, chamada a
cada subida do app:

- Se `ADMIN_INICIAL_EMAIL`/`SENHA` estiverem definidas, **sincroniza** (cria
  OU atualiza senha/papel) o usuário desse e-mail específico — não só "se a
  tabela estiver vazia". Isso evita ficar trancado de fora se uma tentativa
  anterior já tiver criado a conta com uma senha diferente.
- `EQUIPE_INICIAL` faz o mesmo pra vários membros de uma vez (lista JSON),
  pra não depender de conseguir logar primeiro pra cadastrar todo mundo pela
  tela.
- Como rede de segurança extra, `POST /api/login` também tenta esse mesmo
  bootstrap **na hora**, sob demanda, se o e-mail não for encontrado —
  cobre o caso (visto em produção, causa raiz não identificada) de o boot
  não deixar o usuário persistido a tempo da primeira requisição real.
- Depois que o login funcionar, essas variáveis podem ser removidas do
  ambiente — enquanto estiverem definidas, todo redeploy volta a senha
  dessas contas pro valor de lá, sobrescrevendo uma troca de senha feita
  pela tela.

**Problema conhecido, não resolvido:** em 2026-08-19, a aba Environment do
Dokploy não estava repassando `ADMIN_INICIAL_EMAIL`/`SENHA` pro container
(confirmado com uma variável de controle direto no `Dockerfile`, que chegava
normalmente, enquanto a mesma variável configurada no painel do Dokploy não
chegava). Causa raiz não identificada — vale abrir chamado com o suporte do
Dokploy se voltar a acontecer. Como contorno temporário, essas variáveis
foram embutidas diretamente no `Dockerfile` pra destravar o primeiro login;
já foram removidas de lá assim que as contas ficaram criadas e funcionando
— a causa raiz do Environment do Dokploy em si não foi investigada a fundo,
só contornada. A senha usada nesse contorno ficou exposta no histórico do
Git e não deve ser reaproveitada em nenhuma conta.

### 8.2 Escapando texto do usuário no frontend

Qualquer texto que uma pessoa logada digita (título/descrição de tarefa,
comentário, nome de membro da equipe) passa por `escaparHtml()`
(`script.js`) antes de entrar num `innerHTML` — sem isso, dava pra criar
uma tarefa com HTML/JS no título que rodava no navegador de qualquer outro
usuário que abrisse o quadro (achado numa revisão de segurança em
2026-08-19, corrigido). **Qualquer novo `innerHTML` que insira dado vindo
do banco precisa passar por `escaparHtml()`.** Campos com valores fechados
(prioridade, status, papel) também são validados no backend contra uma
lista fixa, não só no frontend — o `<select>` da tela não impede alguém de
chamar a API direto com outro valor.

## 9. Pendências conhecidas (roadmap em aberto)

Lista viva do que falta pro sistema ficar 100% funcional (conversa de
2026-08-17 com a Julia):

1. **Estoque / VMarket** — ✅ resolvido em 2026-08-24, mas não do jeito planejado originalmente: investigado e confirmado que a VMarket não tem API de parceiro (só exportação manual de planilha). O dono do negócio decidiu parar de usar a VMarket no futuro, então em vez de integrar, foi construído um controle de estoque **nativo** no próprio sistema (catálogo de insumos + quantidade por loja — ver seção 6.4).
2. **Relatório via WhatsApp** — integração com a API do WhatsApp Business pra enviar relatórios. Aguardando confirmação de acesso/credenciais da API.
3. **ClickUp** — ✅ concluído em 2026-08-17 (backend real + Kanban persistente, ver seção 7).
4. **Acessos da equipe** — ✅ concluído em 2026-08-19 (login individual por pessoa, com senha — ver seção 8). Landing page e cadastro público ficam **de propósito** atrás do login por enquanto (decisão da Julia: sistema é só interno, sem necessidade de porta pública ainda).
5. **Documentação do sistema** — este arquivo.
6. **Agente no WhatsApp pra relatórios sob demanda** — perguntar todo dia de manhã, num grupo, quanto vendeu no presencial (Art e Tradiça ZN) do dia anterior, e a própria Julia responder pra atualizar o sistema. Depende do item 2 (acesso à API do WhatsApp).
7. **Cardápio (comparativo de preços)** — ✅ concluído em 2026-08-21 (tela nova com fotos, edição de preço protegida por botão "Editar" e importação de planilha — ver seção 6.1). Fica faltando só a Julia (ou quem for editar) subir as fotos dos produtos que ainda não têm, pela própria tela.
8. **Preparo** — ✅ concluído em 2026-08-24 (indicadores operacionais da cozinha — ver seção 6.2). Pivotou de KDS em tempo real (pedido do rascunho original da Julia) pra tela de relatório, depois de investigar e confirmar que a API da Cardápio Web não expõe o momento em que a cozinha termina de preparar.

## 10. Padrões do projeto (pra manter consistência em mudanças futuras)

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
