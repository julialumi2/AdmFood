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
| `fornecedores.html` | Fornecedores — diretório da rede, semente do módulo de Compras (ver seção 6.7) |
| `cotacoes.html` | Cotações — comparação manual de preço por insumo entre fornecedores (ver seção 6.8) |
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

**Fuso horário do servidor** (corrigido em 2026-08-31, achado testando o
fluxo de Compras: uma Requisição com prazo marcado pra "hoje às 17h35"
aparecia com o prazo vencido bem antes disso). A imagem `python:3.12-slim`
roda em UTC por padrão; o front manda `prazo_validade` como horário de
Brasília sem indicar fuso nenhum (`<input type="datetime-local">`, sempre
hora local do navegador), e o back compara direto com
`datetime.now()`/`date.today()` (`_prazo_vencido` em `app.py`, e o job de
sincronização "de hoje" que roda a cada 15 min). Sem os dois lados no
mesmo fuso, Brasília sendo UTC-3, qualquer prazo de hoje parecia vencer
3h mais cedo — e a sincronização "de hoje" corria risco de pegar o dia
errado durante a noite (21h-23h59 de Brasília cai already no dia seguinte
em UTC). Corrigido no `Dockerfile` com `ENV TZ=America/Sao_Paulo` +
`tzdata` instalado (a imagem slim não vem com o banco de fusos horários
completo) — alinha `datetime.now()`/`date.today()` do processo inteiro
com o horário de Brasília, sem precisar tocar em cada comparação de data
espalhada pelo código.

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
| `lote_insumo` | Lotes de validade por entrada de insumo, por loja (ver 6.4) |
| `item_cardapio` | Catálogo de pratos/itens do cardápio, pra ficha técnica (ver 6.5) |
| `ficha_tecnica` | Quais insumos (e quanto de cada) um item do cardápio usa (ver 6.5) |
| `venda_item` | Itens vendidos por pedido, casados com `item_cardapio` (ver 6.6) |
| `fornecedor` | Diretório de fornecedores da rede, semente do módulo de Compras (ver 6.7) |
| `cotacao` | Envelope de uma cotação de preço (título, status) (ver 6.8) |
| `cotacao_preco` | Preço lançado por insumo/fornecedor numa cotação, com vencedor marcado (ver 6.8) |

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

**Sidebar de categorias, igual o Catálogo da Cardápio Web — só na Ficha
Técnica** (concluído em 2026-09-01, ajustado em 2026-09-02). Nasceu pra
valer nas duas telas (Preços e Ficha Técnica), depois de um print da
Julia de `portal.cardapioweb.com/cardapio/produtos`: categorias numa
coluna à esquerda, clicáveis, mostrando só os produtos da categoria
escolhida à direita — em vez de empilhar todas as categorias na mesma
página. Ela aprovou um preview antes de aplicar (feito com a skill
`frontend-design`, "mais bonita, mais profissional, mantendo as cores da
marca" — aba ativa com silhueta de **aba de dossiê**, badge de contagem
por categoria, seletor de loja com ícone em roundel), mas depois de ver
em produção pediu pra **tirar de Preços** — ficou só na Ficha Técnica.
`renderCardapioLoja` (Preços) voltou a ser a versão simples, sem sidebar,
com todas as categorias empilhadas (mesma função de antes de
2026-09-01). `_renderSidebarCategorias` (`script.js`) continua existindo,
só que agora só é chamada por `renderFichaTecnicaProdutos` — é ela quem
mantém a aba de dossiê, o badge de contagem
(`.cardapio-categoria-contagem`) e o comportamento mobile (≤768px vira
fileira horizontal). O seletor de loja com ícone em roundel
(`.loja-select-realce`, escopado só em `#ficha-tecnica-loja-select`, não
mexe no `.loja-select` simples que o Estoque usa) também ficou só na
Ficha Técnica, sem mudança.

**Sincronizar direto da API da Cardápio Web — tentado e revertido**
(2026-09-01 a 2026-09-02). Chegou a ser implementado um botão
"Sincronizar com Cardápio Web" em Preços, puxando categoria/preço/foto
direto da API oficial de parceiro (mesmo token já usado pra buscar
pedidos). Só que **não era isso que a Julia queria** — ela queria a
*receita* (insumo + quantidade) de cada produto pra Ficha Técnica, não o
catálogo de preços; e a API da Cardápio Web não expõe isso (a seção de
insumos existe, mas exige OAuth — não aceita a chave simples já
configurada — e mesmo assim é só uma lista solta, sem ligação com os
produtos). Commit revertido (`git revert`, não reescrita de histórico).

**Efeito colateral do teste em produção, corrigido à parte**: enquanto a
feature esteve no ar, ela rodou pelo menos uma vez de verdade. Dois
estragos, mesma causa (sincronizava por `loja`, usando as 4 chaves de
`LOJAS` em `config.py`, e nunca preenchia `ifood`/`food99`/`beefood` — só
`cardapio_web`):
1. Separou o que sempre foi **uma loja só** nessa tela ("Tradiças" —
   Tradiça ZN e Tradiça Simus compartilham a mesma tabela de preços, ver
   `LOJA_POR_ABA` em `backend/precos_cardapio.py`) em duas entradas novas
   ("Tradiça ZN"/"Tradiça Simus"), fazendo aparecer abas duplicadas.
2. Dentro de Hamburgueria Artesanos e Açaí Na Lata, o nome que vem da API
   (ex. "BIG ART") não batia exatamente com o nome já cadastrado pela
   planilha (ex. "Big Art"), então virou produto **duplicado** em vez de
   atualizar o existente.

Reverter o código não desfaz dado já gravado. Rota temporária `POST
/api/precos-cardapio/corrigir-duplicidade-tradica` (admin) resolveu os
dois de uma vez: apagou, dentro das 4 lojas que a sincronização tocava,
todo produto com os 3 canais em branco — critério seguro porque só a
sincronização deixava esse padrão. Já rodou em produção (a Julia também
reimportou a planilha, que por conta própria já limpa produto órfão
igual sempre fez) e a rota foi removida do código.

**Tradiça ZN e Tradiça Simus separadas de vez** (concluído em
2026-09-02, pedido da Julia depois de mexer nessa tela — quis as duas
como lojas de verdade nessa tela também, igual o resto do sistema já
trata, em vez do "Tradiças" compartilhado). `LOJA_POR_ABA`
(`backend/precos_cardapio.py`) passou a aceitar uma lista de lojas por
aba — a mesma aba única da planilha ("Comparativo de Preços Tradiças")
agora gera linha pra `["Tradiça ZN", "Tradiça Simus"]` em vez de uma
`"Tradiças"` só; `ler_precos_da_planilha` extrai a aba uma vez e repete
a extração por loja de destino (mesmo preço nas duas, já que ainda é a
mesma aba/preço na origem — se um dia divergir, dá pra separar a aba
também). Migração pontual pros dados que já existiam: rota temporária
`POST /api/precos-cardapio/separar-tradica` (admin) copiou cada produto
(id novo, mesma categoria/preço/ordem, foto copiada de verdade — arquivo
físico novo, não a mesma referência) pras duas lojas, e por fim apagou a
loja `"Tradiças"` original. Rodou em produção (23 produtos por loja, 14
fotos copiadas) e a rota foi removida do código.

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

**Correção: botão de editar sumindo em produção** (encontrado e corrigido
em 2026-08-31, direto num caso real — pedido do 99Food que fechou, foi
reaberto às 22h do lado da Cardápio Web e nunca voltou a fechar, deixando
a Tradiça Simus 30/08 desincronizada). O botão existia no DOM (`editavel`
vindo certo do backend, usuário certo como admin), mas ficava **fora da
área visível**: a coluna extra "Ações" só aparece com um dia específico
aberto, e a tabela de 6 colunas não cabia mais espremida do lado do
gráfico de 220px (`.canal-analysis` é flex) — sobrava rolagem horizontal
escondida numa área pequena que ninguém pensaria em rolar. Classe nova
`.tabela-com-acoes` (insight.css) dá o `min-width` real da tabela de 6
colunas (~540px, contra os 260px de sempre) — com o mínimo certo, o
`flex-wrap` que o `.canal-analysis` já tinha resolve sozinho: gráfico e
tabela continuam lado a lado quando cabe na tela, e só empilha (tabela
embaixo do gráfico) se a janela for estreita demais pros dois juntos, sem
nunca mais sobrar rolagem escondida (`renderCanalAnalysis` alterna a
classe junto com `podeEditar`). Enquanto o bug não tinha correção, o
ajuste desse dia específico foi
aplicado direto via `PUT /api/ajuste-canal` pelo Console do navegador
(mesma rota que o botão chama) — sem mexer no banco diretamente.

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

**Favorito** (`insumo.favorito`, 2026-08-25) — marcação simples (estrela),
de rede toda (não é por usuário), pra insumo de acesso rápido subir pro
topo da lista (`ORDER BY favorito DESC` em `listar_insumos`). Toggle via
`PUT /api/insumos/<id>` (`{favorito: true|false}`), só admin; pra quem não
é admin, a estrela só aparece (fixa, sem botão) quando já favoritado.
Inspirado no favorito da VMarket, adaptado pro catálogo único da rede em
vez de por produto/loja.

Steppers -/+ nos campos de quantidade (`.stepper-btn` em `script.js`,
delegado no documento por causa dos campos recriados dinamicamente no
modal de entrada) — andam de 1 em 1 unidade sempre, **não** usam o `step`
do input (que é 0.01, pra permitir digitar peso fracionário tipo 12.5kg);
de 0.01 em 0.01 o clique seria inútil pra ajuste rápido. Mesmo padrão
visual da VMarket, com as cores do sistema.

**Lotes de validade** (`lote_insumo`, criado em 2026-08-25) — pensado pra
resolver o item pendente "aviso de itens vencendo" (seção 9). Separado de
`estoque_insumo` porque a quantidade lá é um total agregado por loja, sem
distinguir remessas, e uma mesma "entrada" pode ter validade diferente da
anterior. `validade` é opcional (insumo não perecível não precisa ter);
`resolvido_em` marca (soft, sem apagar a linha) que o lote já foi
usado/descartado, pra parar de contar no aviso sem perder o histórico.
Modal "Registrar entrada" da tela tem um campo "Validade (opcional)" —
quando preenchido, `distribuir_entrada_insumo` cria um lote por loja que
recebeu quantidade naquela entrada (mesma remessa, mesma validade pra
todo mundo que recebeu dela).

`GET /api/insumos/lotes-vencendo?dias=N` (padrão 7) lista lotes não
resolvidos com validade até `N` dias à frente, **incluindo os já
vencidos** — mostrado na tela de Estoque como o card "Lotes vencendo",
acima da tabela principal, com badge "Vencido há Xd" (vermelho) ou "Vence
em Xd"/"Vence hoje" (laranja), calculado no cliente a partir da validade
(`_diasAteValidade` em `script.js`). `PUT /api/lotes/<id>/resolver` (só
admin) marca resolvido — some da lista, não mexe na quantidade em
`estoque_insumo` (resolver o lote é só sobre o aviso de validade, não é
"dar saída" no estoque). Falta só a notificação em si (push pro WhatsApp,
depende do item 2 da seção 9) — hoje o aviso é passivo, só aparece pra
quem abrir a tela.

### 6.5 Ficha técnica (quais insumos cada item do cardápio usa)

Continua sendo a mesma página (`cardapio.html`), só um segundo modo de
visualização — mas desde 2026-08-27 a navegação entre "Preços" e "Ficha
Técnica" saiu de sub-abas dentro da página e virou um grupo recolhível no
menu lateral, no mesmo padrão do grupo "Compras" (ver seção 10). O modo
vem do `?aba=precos`/`?aba=ficha-tecnica` na URL — `inicializarAbaCardapio()`
em `script.js` lê isso no carregamento, mostra/esconde `#cardapio-modo-*`,
atualiza o título da página e marca o item certo do menu como ativo (sem
isso, o grupo "Cardápio" nunca saberia qual sub-item destacar, já que as
duas visões não são páginas/arquivos separados). Existe pra alimentar
o cálculo de "quantidade ideal" do Estoque a partir do histórico de
vendas: pra saber quanto de um insumo se gasta, precisa saber quais
pratos o usam e quanto de cada um entra na receita.

`item_cardapio` é o catálogo do prato em si (ex: "BIG ART") — de rede
toda, não muda por loja/canal. `ficha_tecnica` liga um item a um ou mais
insumos, com quantidade **opcional** (`NULL` quando não sabemos a
gramatura exata) — **por loja desde 2026-09-01** (ver subseção abaixo):
o mesmo prato pode ter receita diferente em cada unidade.

**Carga inicial** (2026-08-24): os primeiros 20 itens (lanches, porções e
uma salada) foram montados a partir da descrição de cada produto no
painel da Cardápio Web (`portal.cardapioweb.com/cardapio/produtos`), que
a Julia passou por print — não temos acesso automatizado a essa página
(fora do domínio permitido pra navegação automática). A maioria das
descrições só lista os ingredientes, sem gramatura (só o hambúrguer tem
peso, "110g") — por isso a maior parte das quantidades está em branco,
exceto o Smash Bowl (salada) e as porções de batata, que vieram com peso
certo. Sobremesas ficaram de fora: a descrição delas no cardápio nem
lista os ingredientes. Script `preencher_ficha_tecnica_inicial.py` — cria
o insumo automaticamente se ainda não existir no Estoque (mesmo catálogo
único da seção 6.4), idempotente por nome, então dá pra rodar de novo
depois pra adicionar categorias novas (combos, por exemplo) sem duplicar
o que já existe.

Editar a ficha técnica de um item (`PUT /api/itens-cardapio/<id>/ficha-tecnica`,
admin, corpo leva `loja` + a lista de insumos) sempre manda a lista
inteira de insumos daquela loja (substitui, não faz diff) — mais simples
de implementar tanto no back quanto na tela, e não mexe na receita das
outras 3 lojas. Leitura liberada pra todo mundo logado.

**Colar lista na ficha técnica de um item** (concluído em 2026-08-28,
mesmo padrão de "colar lista" já usado no ajuste de quantidade ideal e na
importação de insumos — preencher receita por receita, insumo por
insumo, pelo "Adicionar insumo" é lento pra um cardápio inteiro). Dentro
do modal de ficha técnica de um item, um `<details>` recolhido ("Colar
lista") com uma textarea pra colar `insumo;quantidade` (aceita tab, `;`
ou `,`) e um botão "Processar lista". Usa o mesmo `_normalizarNomeInsumo`
e o mesmo critério de match exato (sem aproximação) dos outros "colar
lista" — o que bater **substitui** as linhas do formulário abaixo (é a
mesma receita inteira, não um acréscimo); o que não bater fica listado
pra ela adicionar na mão pelo "Adicionar insumo". Ainda precisa clicar
"Salvar" depois — processar só popula o formulário, não grava sozinho.
100% client-side (reusa `fichaTecnicaInsumosDisponiveis` já carregado
pro item+loja aberto no modal), nenhuma rota nova.

**Ficha técnica por loja, com custo e valor de venda** (concluído em
2026-09-01, pedido da Julia: ela queria um botão pra cadastrar ficha
técnica na mão — já existia, "Novo item", ela só não sabia — e um
dropdown pra alternar por loja vendo custo e valor de venda de cada
produto, clicando pra ver a receita. Perguntei antes de mexer: custo é
**digitado à mão** por ela (não calculado — insumo não tem preço no
catálogo), valor de venda mostrado é só o canal **Cardápio Web**
(balcão), e ela confirmou que queria mesmo **receita diferente por
loja**, não só filtro de quais produtos aparecem).

Isso mudou a arquitetura: `ficha_tecnica` ganhou a coluna `loja` e a PK
virou `(item_id, insumo_id, loja)` — SQLite não deixa alterar PK com
`ALTER TABLE`, então a migração (roda uma vez, checando
`PRAGMA table_info`) renomeia a tabela antiga, recria com o schema novo
e **duplica cada receita existente pras 4 lojas** (todo mundo começa
idêntico, diverge só quando ela editar pela tela). `consumo_medio_insumo`
(seção 6.6, base da quantidade ideal do Estoque) ganhou `AND f.loja =
v.unidade` no JOIN — graças ao backfill, é comparação direta, sem
fallback. Tabela nova `item_cardapio_custo` (item_id, loja, custo,
atualizado_em) guarda o valor digitado à mão, também por loja.

A tela em si (`#cardapio-modo-ficha-tecnica`) trocou os cards sempre
abertos por uma lista de **produtos da loja selecionada**: a fonte não é
mais `item_cardapio` direto, é `preco_cardapio` (que já sabe quem vende o
quê e o valor de venda do balcão) — cada produto é casado com um
`item_cardapio` via `_casar_item_cardapio` (mesma função que já casava
venda real × receita, seção 6.6, reaproveitada aqui sem duplicar
critério). Produto sem match nenhum aparece com "sem ficha técnica" e
(admin) um botão "Cadastrar ficha técnica" que pré-preenche o modal
"Novo item" com o nome exato vendido e, assim que cadastrado, já abre o
modal de insumos direto pra essa loja. Clicar num produto já casado
expande (busca os insumos daquela loja sob demanda, com cache simples
por item enquanto a loja não muda) mostrando os chips de insumo e, pra
admin, "Editar insumos"/"Excluir item". Custo vira um campo numérico
editável inline pra admin (salva ao sair do campo, `PUT
/api/itens-cardapio/<id>/custo`); valor de venda é só leitura aqui
(editar preço continua em "Preços"). Dropdown de loja é o mesmo
componente visual do `.loja-select` de Estoque — movido de `estoque.css`
pra `theme.css` por ser a segunda tela a usar exatamente o mesmo
HTML/CSS/JS. Rota antiga `GET /api/ficha-tecnica` (sem noção de loja) foi
removida — só tinha um consumidor, e esse consumidor foi substituído por
completo. Rotas novas: `GET /api/cardapio/produtos?loja=` e `GET
/api/itens-cardapio/<id>/ficha-tecnica?loja=`.

Ganhou também a foto do produto (mesmo `foto_arquivo`/`fotoUrl` de
"Preços", seção 6.1 — `listar_produtos_por_loja` só passou a selecionar
essa coluna a mais) e a sidebar de categorias (ver seção 6.1) — as duas
mudanças vieram junto do pedido da Julia de deixar essa tela com a cara
do Catálogo da Cardápio Web.

**Bebida fora dessa tela** (concluído em 2026-09-02, pedido da Julia —
bebida é produto pronto comprado assim, não tem receita/ficha técnica de
verdade). `listar_produtos_por_loja` filtra fora qualquer produto cuja
categoria seja exatamente "Bebidas" (normalizado, então bate com
qualquer combinação de acento/caixa) — **match exato, não substring**,
de propósito: um combo como "Lanche + Batata + Bebida + Maionese" cita
"bebida" no nome da categoria mas é comida, não pode ser pego junto.
Só essa lista muda — "Preços" continua mostrando bebida normalmente,
já que lá o que importa é preço de venda, não receita.

**Ficha técnica de complemento** (concluído em 2026-09-02, pedido do
chefe da Julia repassado por ela: a Cardápio Web tem ficha técnica de
**produto**, mas não de **complemento** — e a Açaí Na Lata é "100%
complementos" (monta-o-seu, ex. "Morango = 30g de morango", "Leite em pó
= 30g de leite em pó"), então sem isso não dá pra saber o que baixar do
estoque quando vende um NaLata montado. Isso é só a fase 1 de um plano
maior do chefe (puxar venda real da Cardápio Web casando produto **e**
cada complemento escolhido, baixar estoque automático, comparar com a
contagem física pra achar "quebra" e gerar pedido de compra certo já
sozinho) — confirmado ao vivo, testando um pedido real da Açaí Na Lata,
que a API da Cardápio Web **já devolve** quais complementos o cliente
escolheu em cada venda (`options` dentro de cada item do pedido); as
fases seguintes (puxar venda, baixar estoque, comparar quebra) ficam pra
depois, esse commit é só cadastrar a receita do complemento dentro do
AdmFood.

Complemento virou só mais um `tipo` de `item_cardapio` (coluna nova,
`'produto'` por padrão pros itens que já existiam, `'complemento'` pros
novos) — de propósito, pra herdar de graça toda a infraestrutura de
Ficha Técnica por loja da subseção acima sem duplicar nada: `ficha_tecnica`
(insumo + quantidade opcional, por loja) já funciona igual pros dois,
sem mudar uma linha de schema; `definir_ficha_tecnica`,
`buscar_ficha_tecnica_item` e as rotas `GET`/`PUT
/api/itens-cardapio/<id>/ficha-tecnica` não sabem nem precisam saber se o
`item_id` é produto ou complemento. `criar_item_cardapio` ganhou o
parâmetro `tipo`; novo `criar_complementos_em_lote` (mesmo espírito do
"colar lista" de insumos, seção 6.4 — dedupe por nome normalizado contra
o catálogo inteiro, produto ou complemento, pra não deixar cadastrar
"Granola" duas vezes com tipos diferentes) e `listar_complementos_por_loja`
(mesmo formato de `listar_produtos_por_loja`, mas sem
custo/valor de venda/foto/casamento com `preco_cardapio` — complemento
não é vendido/precificado sozinho na Cardápio Web, só existe dentro de
um produto). Rotas novas: `GET /api/complementos?loja=` (leitura livre,
igual ao resto da Ficha Técnica) e `POST /api/complementos/lote` (admin).
`POST /api/itens-cardapio` passou a aceitar `tipo` no corpo (default
`'produto'`).

Na tela, um `.tabs-bar` novo "Produtos"/"Complementos" (mesmo componente
de Cotações, seção 6.8) logo acima do seletor de loja — trocar de aba só
troca a lista de baixo, a loja selecionada continua valendo pras duas.
"Produtos" é a tela de sempre, sem mudança. "Complementos" reusa a mesma
sidebar de categorias e o mesmo clique-pra-expandir (inclusive o mesmo
modal de editar insumos, sem mudança nenhuma), só que sem as colunas de
custo/valor de venda/foto, que não existem pra complemento nessa fase.
Botão "Novo item" vira "Novo complemento" na aba certa (mesmo modal, só
manda `tipo:'complemento'`); botão novo "Colar lista" (só nessa aba,
admin) abre um modal simples — uma textarea com um nome por linha,
manda pro `/api/complementos/lote`, mostra quantos foram cadastrados e
quantos já existiam.

**Bônus, mesmo modal reaproveitado acima**: corrigido nessa mesma
mudança um bug de raiz visual — o modal "Editar ficha técnica" cortava
título comprido e ganhava barra de scroll horizontal (reportado pela
Julia por print). Causa: `<select>`/`<input>` dentro de grid/flex
herdam `min-width: auto`, que pro conteúdo interno pode ser maior que a
coluna `1fr` disponível, empurrando o modal inteiro pra largura maior.
Fix: `minmax(0, 1fr)` na coluna do grid (`.ficha-tecnica-linha`) +
`min-width: 0; width: 100%` explícito nos campos, `overflow-x: hidden`
no `.modal-content` como cinto de segurança, e `overflow-wrap: break-word;
min-width: 0` no título do modal.

### 6.6 Consumo estimado de insumo (Ficha Técnica × vendas reais)

Objetivo: estimar quanto de cada insumo a rede realmente consome por dia,
cruzando a receita (Ficha Técnica) com o volume de vendas de cada prato —
base pra sugerir estoque mínimo/quantidade ideal em vez de precisar
adivinhar. Adicionado em 2026-08-25.

**Vendas por prato são novas** — até então o sistema só guardava
faturamento agregado (total por loja/dia/canal), nunca quais produtos
foram vendidos. Descoberto que o endpoint de detalhes do pedido da
Cardápio Web (`GET /orders/{id}`), que **já é chamado** pra cada pedido
fechado só pra pegar o `total`, também retorna um campo `items` com nome e
quantidade de cada produto — dá pra capturar isso sem nenhuma chamada
extra à API. `_itens_vendidos` (`backend/cardapio_web.py`) extrai essa
lista; combo não tem receita própria na Ficha Técnica (que é por prato
individual), então é desmontado nos itens internos, com a quantidade de
cada um multiplicada pela quantidade do combo (assunção não confirmada com
um exemplo real de combo com quantidade > 1 — revisar se aparecer
inconsistência).

`venda_item` (`backend/armazenamento.py`) guarda isso por pedido/linha,
casando o nome do produto com `item_cardapio` (comparação sem
maiúscula/minúscula nem espaço nas pontas, já que o nome vem digitado
manualmente na Ficha Técnica e não é garantido bater exatamente com o
nome na Cardápio Web). Sem match, a linha é salva do mesmo jeito, com o
nome cru e `item_cardapio_id` `NULL` — quando o prato for cadastrado na
Ficha Técnica depois, o histórico anterior a isso **não é re-processado**
retroativamente (ficaria valendo só a partir da próxima sincronização).
`salvar_itens_vendidos_do_dia` roda junto de `salvar_pedidos_do_dia` nos
dois pontos de sincronização (`app.py` e `sincronizar.py`), mesmo padrão
de resincronizar o dia inteiro.

`consumo_medio_insumo(inicio, fim, unidade=None)` soma, por insumo e loja,
`quantidade vendida do prato × quantidade da receita`, dividido pelos dias
do período — só entra insumo com quantidade definida na Ficha Técnica
(receita sem gramatura, `NULL`, não dá pra estimar) e prato já casado com
`item_cardapio`. Exposto em `GET /api/insumos/consumo-medio?inicio=&fim=&unidade=`
(sem período, últimos 30 dias). Mostrado na tela de Estoque como a coluna
"Consumo médio/dia" (`_consumoMedioParaLinha` em `script.js`) — `null`
(insumo sem Ficha Técnica casada com venda ainda) aparece como "—", não
como zero, pra não parecer "consumo real zero". Ainda **não sugere**
estoque mínimo automaticamente, só mostra o número — depende de a Ficha
Técnica estar bem mais completa (hoje só 20 itens da Hamburgueria
Artesanos, a maioria sem gramatura) pra virar sugestão confiável.

### 6.7 Fornecedores (semente do módulo de Compras)

Tela `fornecedores.html` — diretório de fornecedores da rede, **sem**
fluxo de cotação ainda (isso é uma fase futura, ver seção 9). Adicionado
em 2026-08-25, depois de mapear o fluxo completo da VMarket (Contagem →
Requisição/Pré-cotação → Cotação enviada a fornecedores → matriz de
comparação de preço → Pedido de compra) — a decisão foi construir só o
cadastro por enquanto, o resto fica pra quando o fluxo de cotação em si
for priorizado.

`fornecedor` é de rede toda (não por loja, diferente de insumo): nome,
CNPJ, categoria, contato (nome/telefone/e-mail), prazo de pagamento, dias
de entrega, pedido mínimo, observações, `ativo`. **Sem exclusão de
verdade** — só `ativo` (mesmo raciocínio de `usuario.ativo`): quando as
próximas fases (cotação, pedido de compra) passarem a referenciar
`fornecedor_id`, apagar quebraria esse histórico. Toggle ativo/inativo é
um botão dedicado na tabela (ícone `ban`/`check-circle-2`), mesmo padrão
já usado pra ativar/desativar membro da equipe — não um campo dentro do
modal de edição.

Nova página no menu lateral (não só uma sub-aba) porque é a semente de um
módulo novo (Compras), separado do Estoque. Os componentes de UI que
também aparecem aqui (steppers `.stepper-btn`, `.page-acoes-topo`) foram
promovidos de `estoque.css` pra `theme.css` nessa mudança, por já serem
usados em duas páginas.

**Menu recolhível "Compras"** (`.menu-group`/`.menu-subgroup`, ver
`theme.css`/`script.js`) — replicando o padrão de menu da VMarket (grupos
que expandem/recolhem), mantendo as cores do sistema. "Compras" é o grupo,
com "Fornecedores" dentro — pronto pra crescer com Cotações/Pedidos nas
próximas fases, sem precisar de outro nível de reestruturação. Auto-expande
se a página atual estiver dentro do grupo; clique no botão alterna
manualmente. "Estoque" continua fora do grupo, como item direto — é um
domínio maduro e já separado, diferente de Compras que ainda está nascendo.

**Sidebar no celular vira gaveta** (2026-08-25) — antes, a sidebar
simplesmente sumia (`display:none`) no celular, sem alternativa, e só a
barra inferior fixa (6 itens: Resumo, Estoque, Cardápio, Preparo, ClickUp,
Insights) dava acesso por toque. Configurações, Fornecedores e Cotações
(fora da barra) ficavam **inalcançáveis** por toque — só digitando a URL
direto. Corrigido reaproveitando o mesmo botão que no desktop recolhe a
sidebar pra ícone só (`#toggleMenuBtn`/`#btnToggleMenu`): no celular, o
clique alterna `.mobile-menu-aberto` no `#dashboardWrapper`, fazendo a
sidebar deslizar por cima do conteúdo (`position:fixed` + `translateX`),
com um backdrop escurecido (`#mobile-menu-backdrop`) que fecha a gaveta ao
tocar fora; tocar num link do menu também fecha. A preferência de sidebar
recolhida do desktop (`localStorage sidebar-collapsed`) **não** é aplicada
no celular (checagem `window.innerWidth <= 768` antes de ler o
`localStorage`), pra gaveta nunca abrir em modo ícone-só sem rótulo.

Com a gaveta cobrindo tudo, a **barra inferior fixa foi removida** (não
fazia mais sentido duplicar navegação) — `.mobile-bottom-nav` teve seu
CSS excluído de `theme.css`, o padding reservado pra ela no rodapé de
`.page-content` (88px) voltou ao normal, e o bloco `<nav class="mobile-
bottom-nav">` foi removido das 9 páginas.

**Bug encontrado logo após subir pro ar** (2026-08-25, relatado por um
usuário vendo o layout quebrado no desktop): o `<div id="mobile-menu-
backdrop">`, novo, só tinha `display:none` **dentro** do media query
mobile — no desktop ficava sem nenhum `display` definido, caindo no
padrão do navegador (`block`). Isso o transformava num 3º item dentro do
grid de 2 colunas do `.dashboard-wrapper` (sidebar + main): com só 2
colunas explícitas, o `.main-wrapper` (3º item) quebrava linha e caía de
volta na 1ª coluna (a largura da sidebar), ficando espremido/sobreposto
atrás dela. Só acontecia com a sidebar em modo "recolhido" (ícone só),
por isso passou despercebido no teste antes de subir — o teste cobriu a
gaveta mobile e o desktop "normal" (sidebar expandida), mas não a
combinação desktop + recolhido. Corrigido adicionando `.mobile-menu-
backdrop { display: none; }` como regra base (fora do media query), pra
nunca participar do grid fora do celular. **Lição**: ao adicionar um
elemento novo que só deve aparecer num media query, sempre garantir um
`display: none` base fora dele — não basta só estilizar o estado
"visível" lá dentro.

**Carga inicial de fornecedores** (2026-08-25): 69 fornecedores trazidos
da VMarket via export CSV ("Cotações" → "Meus Fornecedores" → "Exportar
Lista de Fornecedores"), com `importar_fornecedores_vmarket.py`.
Idempotente por CNPJ. Categoria sempre entra como "Geral" (a VMarket não
tem esse campo) — ajustável depois pela tela. `valor_frete` do CSV (que
não existe no nosso schema) vira uma linha em observações quando maior
que zero, pra não perder o dado.

### 6.8 Cotações (RFQ manual, fase 2 do módulo de Compras)

Tela `cotacoes.html` — comparação de preço entre fornecedores por insumo,
**manual**: sem coleta automática (WhatsApp) ainda, mesmo bloqueio do item
2 da seção 9. Aqui só se registra o preço que cada fornecedor já passou
por fora, pra comparar lado a lado e marcar o vencedor por insumo.
Adicionado em 2026-08-25, junto com o menu "Compras".

`cotacao` (id, título, status `aberta`/`fechada`, criado_em) é só o
envelope. `cotacao_preco` guarda cada preço lançado (cotação × insumo ×
fornecedor × preço × `selecionado`), com `UNIQUE(cotacao_id, insumo_id,
fornecedor_id)` — relançar o preço de quem já tinha cotado o mesmo insumo
corrige o valor (upsert), não duplica. **Não existe uma tabela separada
"quais insumos/fornecedores participam da cotação"**: a grade (linhas e
colunas da comparação) é inferida dos próprios preços já lançados —
simplifica o schema, mas significa que não dá pra reservar uma célula
vazia de antemão (o insumo/fornecedor só "aparece" quando alguém lança um
preço pra ele).

Tela com duas visões dentro do mesmo arquivo (padrão parecido com o
sub-aba de Preços/Ficha Técnica em `cardapio.html`, mas aqui trocando a
`view` inteira via JS em vez de aba): lista de cotações
(`#cotacoes-lista-view`) e detalhe/comparação
(`#cotacoes-detalhe-view`). No detalhe, cada insumo com preço lançado vira
um card, com os fornecedores que cotaram ordenados por preço — o mais
barato ganha o badge "Melhor preço" automaticamente, mas o **vencedor
marcado manualmente** (`selecionado`) pode ser outro fornecedor (ex: prazo
de entrega ou pagamento melhor compensa não ser o mais barato) —
`selecionar_preco_cotacao` desmarca qualquer outro preço do mesmo insumo
nessa cotação ao marcar um novo (só um vencedor por insumo).

"Fechar cotação" (toggle de status, sem exclusão) esconde o formulário de
lançar preço — pensado pra quando a decisão já foi tomada, evita editar
sem querer; "Reabrir" traz o formulário de volta. Leitura liberada pra
todo mundo logado; criar/lançar preço/selecionar vencedor/fechar/excluir é
só admin.

**Aba "Compras" — histórico de cotações fechadas** (concluída em
2026-08-27, pedido do Guilherme pra deixar a tela parecida com a VMarket).
A tela ganhou um `.tabs-bar` no topo (mesmo componente de Insights/Cardápio
por loja) com duas abas: "Cotações" (tudo que já existia, sem mudança) e
"Compras" — lista, por cotação já fechada, o preço vencedor de cada
insumo (`listar_historico_compras` em `armazenamento.py`, filtra
`cotacao.status = 'fechada'` e junta só as linhas de `cotacao_preco` com
`selecionado = 1`). É um registro só de leitura — não tem ligação com o
rastreio de entrega dos Pedidos (seção 6.9), são coisas diferentes de
propósito: aqui é "o que foi decidido em cada rodada", lá é "o que já
chegou". Rota: `GET /api/cotacoes/historico` (liberada pra todo mundo
logado, mesmo padrão do resto de Cotações). Uma aba "Meus produtos"
(catálogo de insumo × fornecedor × marca homologada) chegou a ser
construída no mesmo dia e foi removida a pedido dele logo em seguida —
sem uso no momento.

**Fornecedor cotando pelo próprio link** (concluído em 2026-08-27 —
última peça do "núcleo que falta" da seção 9, item 1). Mesmo padrão de
link sem login por token da Contagem/seção 6.9, mas pro **fornecedor**
preencher o próprio preço em vez do admin lançar na mão. Só existe pra
cotação que veio de uma Requisição (tem `cotacao_item`, ou seja, tem
quantidade calculada) — cotação lançada na mão continua só manual.

Decisão de escopo do Guilherme em 2026-08-27, depois de ver o link real
que a VMarket manda pro fornecedor (link de exemplo trazido por ele,
`cotacao.vmarket.com.br/preencher/...`): **o sistema não tenta adivinhar
quem cota o quê por vínculo** — o botão "Convidar fornecedores" manda o
link pra **todo fornecedor ativo**, só dos insumos da cotação que ainda
**não têm nenhum fornecedor vinculado** (`insumo_fornecedor` vazio pra
aquele insumo — "sem fornecedor homologado"); insumo que já tem
fornecedor vinculado continua sendo cotado na mão como sempre. Dentro do
link, é o **próprio fornecedor** quem decide, insumo por insumo, se vende
ou não — preenche o preço de quem vende e marca "não vendo esse item" pra
quem não faz parte do catálogo dele (não bloqueia o resto da cotação).
Ficaram de fora por decisão dele (extras que a VMarket tem e podem virar
pedido separado depois): fornecedor sugerir marca diferente da
homologada, marcar "produto em falta", escolher unidade/gramatura do
próprio preço, anexar arquivo, e observação geral/por item.

Tabelas: `cotacao_convite` (id, cotacao_id, fornecedor_id, token único,
prazo_validade, status `aberta`/`respondida`, criado_em, respondida_em —
`UNIQUE(cotacao_id, fornecedor_id)` pra não duplicar convite do mesmo
fornecedor se "Convidar fornecedores" for clicado de novo, só cobre quem
ainda não tinha) e `cotacao_convite_item` (convite_id, insumo_id) — fixa a
lista de insumos no momento do convite, pra não mudar debaixo do
fornecedor se alguém vincular um fornecedor novo depois de já ter mandado
o link. Resposta do fornecedor grava direto em `cotacao_preco` (mesma
tabela/mecanismo da cotação manual — reaproveita `adicionar_preco_cotacao`
sem duplicar lógica), então cai automaticamente na mesma tela de
comparação. Uma vez respondido, o convite fica travado (pergunta 18 do
roteiro de compras: fornecedor não edita depois de enviar) — reabrir o
mesmo link só mostra "obrigado". Se o prazo vencer sem resposta, mostra
"prazo venceu" e a cotação segue sem o preço dele, sem travar nada
(pergunta 19). Fornecedor só vê o próprio preço, nunca o dos concorrentes
(pergunta 20b) — o link não expõe `cotacao_preco` de ninguém.

**Confirmação antes de travar + reabrir pelo admin** (concluído em
2026-09-01, pedido da Julia: fornecedor não tinha aviso nenhum de que o
link travava pra sempre depois de enviar, e ela não tinha como destravar
se ele mandasse preço errado — só existia a Zona de Perigo, tudo ou
nada). Duas peças pequenas: (1) a tela pública agora pergunta "Após
fechar, não vai dar pra alterar os preços. Tem certeza?" antes de
enviar, dando uma última chance de conferir; (2) na tabela "Convites
enviados" (Cotações, admin), convite já respondido ganha um botão
**"Reabrir"** ao lado de "Copiar link" — `reabrir_convite_cotacao` volta
o status pra `aberta` e limpa `respondida_em`, destravando o mesmo link
de novo. Não apaga o preço já lançado; se o fornecedor reenviar,
`adicionar_preco_cotacao` sobrescreve por ser upsert (mesmo mecanismo de
sempre), não duplica linha. Rota: `POST
/api/cotacoes/convites/<id>/reabrir` (admin).

**Grid comparativa estilo planilha, substituindo os cards** (concluído em
2026-09-01, pedido da Julia depois de ver a tela de comparativo de preços
da VMarket — print trazido por ela: matriz insumo × fornecedor, badge
"Melhor Preço!", check de vencedor, filtro de seção/nome). Decisão de
escopo dela via pergunta: a grid **substitui** o card-por-insumo por
completo (não é uma visão a mais), e o "melhor preço" deixou de ser
automático — agora só aparece quando o botão **"Destacar melhores
preços"** é clicado (`destacarMelhoresPrecosAtivo`, estado só de tela, não
persiste). O vencedor marcado manualmente (`selecionado`) continua igual —
são dois conceitos visuais diferentes: o check verde de vencedor (persiste
no banco) e a estrela de melhor preço (cálculo na hora, no clique).

Sem mudança nenhuma de schema/endpoint — a grid é só uma forma diferente
de desenhar os mesmos dados que `GET /api/cotacoes/<id>` já devolvia
(`grupos`/`itens`). As colunas de fornecedor são inferidas dinamicamente
(união de todo `fornecedorId` que aparece em algum preço da cotação,
ordenado por nome) — como não existe uma tabela "quem participa da
cotação" (ver acima), não dá pra desenhar uma coluna de fornecedor que
ainda não lançou nenhum preço, nem diferenciar célula vazia de "não vendo"
(essa distinção nunca existiu, mesma limitação de antes). Primeira coluna
(nome do insumo) fica fixa (`position: sticky`) pra não se perder ao rolar
a tabela pros lados com muitos fornecedores. Campo de busca (nome ou
categoria do insumo) filtra as linhas na hora, cliente-side, mesmo padrão
das outras telas do sistema.

Tela pública nova `preencher_cotacao.html` (reaproveita o CSS de
`preencher_contagem.css` — layout genérico de "página pública por token",
não é específico de contagem apesar do nome do arquivo). Rotas: `POST
/api/cotacoes/<id>/convites` (admin, manda os convites), `GET
/api/cotacoes/<id>/convites` (admin, lista pra tabela "Convites enviados"
na tela de Cotações, com botão "Copiar link" por fornecedor), `GET
/api/cotacoes/convite/<token>` e `POST
/api/cotacoes/convite/<token>/responder` (públicas — token é a própria
autenticação, mesma exceção de `/api/contagens/token/` em
`_exigir_login`).

### 6.9 Contagem de estoque por link + Requisição (núcleo do fluxo Compras)

Tela `contagens.html` — VMarket-style: gera um **link sem login** (token
opaco em `secrets.token_urlsafe`) pra um funcionário da loja preencher a
quantidade em estoque de cada insumo, sem precisar de conta no AdmFood.
Adicionado em 2026-08-26.

**Nota de nomenclatura (2026-08-27):** pra a interface ficar igual a da
VMarket, todo texto visível que dizia "Contagem" (menu, títulos, botões,
mensagens de erro/confirmação, tela pública de preenchimento) passou a
dizer **"Requisição"** — inclusive a que fala da loja individual, aceitando
a sobreposição com o nome do agrupamento de várias lojas (decisão do
Guilherme). Só a interface mudou: tabelas (`contagem`, `contagem_item`),
rotas (`/api/contagens/...`), nomes de função/variável e o arquivo
`preencher_contagem.html` continuam se chamando "contagem" internamente —
mudar isso também não tem efeito nenhum pra quem usa o sistema e trocaria
uma porção enorme de código à toa, então ficou de fora de propósito.

`contagem` (id, token, loja, descrição, prazo_validade, status
`aberta`/`respondida`/`aprovada`, criado_em/respondida_em/aprovada_em) +
`contagem_item` (contagem_id, insumo_id, quantidade_preenchida) — uma linha
por insumo ativo (ou filtrado por categoria) já criada em branco no
momento da abertura, esperando preenchimento. `listar_itens_contagem`
calcula a quantidade ideal (consumo médio × `DIAS_COBERTURA_IDEAL`, mesma
conta da seção 6.6) lado a lado, tanto na tela pública de preenchimento
quanto na conferência do admin — dá pro funcionário já ver a sugestão
enquanto conta. `aprovar_contagem` só grava a quantidade preenchida como
`quantidade_atual` real em `estoque_insumo` depois que o admin confere e
aprova (itens não preenchidos mantêm o valor antigo, não zeram).

**Reabrir contagem respondida/aprovada** (concluído em 2026-08-31,
primeiro item da lista de risco que ela levantou revisando o fluxo —
pedido do Guilherme). Antes, uma contagem aprovada (ou só respondida) com
erro de digitação não tinha conserto: o link público só aceita
preenchimento com status `aberta` (`api_responder_contagem` recusa
qualquer outro status), e não existia nenhum jeito de voltar atrás — só
apagando tudo pela Zona de Perigo. Botão **"Reabrir pra corrigir"** no
detalhe da contagem (vermelho, ao lado de "Fazer Cotação/Pedido", só
admin, só aparece quando o status não é `aberta`) chama
`reabrir_contagem`, que volta o status pra `aberta` e limpa
`respondida_em`/`aprovada_em` — o mesmo link então aceita preenchimento
de novo. **Não** desfaz o que já tinha sido gravado em `estoque_insumo`
(não existe histórico de qual era o valor anterior pra reverter com
segurança); quando alguém reenviar e a contagem for aprovada de novo,
`aprovar_contagem` sobrescreve com o valor corrigido normalmente — resolve
o problema na prática, mesmo sem um "desfazer" de verdade. O formulário
público sempre abre em branco (não pré-preenche com o valor antigo), então
reabrir significa preencher tudo de novo, não só o item errado — aceitável
pra um caso de correção, que deve ser raro. Se a Requisição já tiver
gerado uma cotação, os números lá **não** atualizam sozinhos — o texto de
confirmação avisa isso antes de reabrir. Rota: `POST
/api/contagens/<id>/reabrir` (admin).

**Botão "Fazer Cotação/Pedido" no detalhe de uma loja** (concluído em
2026-08-27, a pedido do Guilherme pra economizar um clique). O botão que
antes só aprovava essa loja agora faz as duas coisas: aprova, e se essa
era a **última loja pendente** da requisição (checa `totalmenteAprovada`
em `GET /api/requisicoes/conferencia`), já chama
`/api/requisicoes/conferencia/gerar-cotacao` e leva direto pra cotação
gerada — sem passar pela tela de conferência somada no meio. Se ainda
faltar loja, só aprova essa e avisa quantas faltam; nada muda pra quem
está numa requisição de loja única (aprova e já cai na cotação, tudo num
clique).

**Requisição** (a peça que faltava do fluxo Requisição → Contagem →
Cotação → Pedido descrito na seção 9) — abre o ciclo em **várias lojas de
uma vez**, em vez de uma contagem por vez: o modal "Nova requisição" pede
um título e prazo compartilhados + uma lista de checkboxes (uma por loja
de `LOJAS_ESTOQUE`), e ao criar chama `POST /api/contagens` uma vez por
loja marcada, todas com a mesma descrição/prazo. **Não existe uma tabela
`requisicao` separada** — de propósito, pra não duplicar schema: como cada
contagem já carrega descrição + prazo, N contagens da mesma requisição
aparecem naturalmente agrupadas na lista (mesmo título, mesmo prazo,
criadas juntas), e cada uma segue o fluxo de conferência/aprovação de
loja em loja normalmente. O modal "Requisição criada" devolve um link +
botão "Copiar" por loja selecionada, pra mandar pro responsável de cada
uma.

**Área de conferência** (concluída em 2026-08-26, mesmo dia) — como uma
requisição não é uma tabela própria, `listar_requisicoes()`
(`backend/armazenamento.py`) reconstitui os grupos agrupando
`listar_contagens()` em memória pela chave (descrição, prazo_validade); é
essa mesma chave que identifica a requisição nas rotas abaixo (não um id
numérico). A tela de conferência (`#requisicao-conferencia-view` em
`contagens.html`) soma, insumo por insumo, o preenchido e a quantidade
ideal de **todas as lojas participantes** — cada linha vira `comprar X`
quando a soma do ideal passa a soma do preenchido — e avisa quando ainda
falta alguma loja responder (a soma fica subestimada até todo mundo
preencher). O botão "Aprovar todas as lojas" chama `aprovar_contagem` pra
cada contagem `respondida` do grupo de uma vez, em vez de aprovar loja por
loja na tela de detalhe.

**Insumos separados por loja** (concluído em 2026-08-28, pedido do
Guilherme: os links de Requisição/Contagem mostravam o cardápio inteiro de
insumos pra toda loja, mesmo insumo que só existe numa unidade — ex.
insumo exclusivo da Tradiça aparecendo no link do Artesanos). Tabela nova
`insumo_loja` (insumo_id, loja) — só a presença da linha diz que aquele
insumo entra no link daquela loja; **não mexe em `estoque_insumo`**
(continua com uma linha por insumo × loja, de propósito, pra não arriscar
regressão em nada que já lia de lá — Estoque, quantidade ideal, etc.). Na
primeira vez que o banco sobe com a tabela nova, roda um backfill que
associa **todo insumo a toda loja** (preserva o comportamento antigo de
"aparece em tudo"); a partir daí ela vai desmarcando loja por loja com a
ferramenta abaixo. `criar_insumo` já grava a associação pra loja(s)
escolhida(s) na hora de cadastrar um insumo novo; `excluir_insumo` limpa
`insumo_loja` junto. `criar_contagem` (usada tanto por uma Requisição de
loja única quanto por cada loja de uma Requisição em grupo) troca o
`SELECT` de "todo insumo" por um `JOIN` em `insumo_loja` filtrado pela loja
que está abrindo o link — é o único ponto do fluxo que precisa mudar,
porque tudo o resto (conferência, cotação, pedido) já parte da lista de
itens que a contagem gerou.

Ferramenta **"Insumos da loja"** (botão na tela de Estoque, mesma regra de
visibilidade do "Copiar de outra loja"/"Ajustar em lote": só numa aba de
loja específica, não na "Geral", só admin) — modal com checkbox por
insumo (marcado = entra no link dessa loja), busca pra filtrar a lista e
botões "Marcar todos"/"Desmarcar todos" (respeitam o filtro atual, não a
lista inteira). `listar_insumos_por_loja(loja)` devolve todo insumo
cadastrado com um booleano `aplica`; `salvar_insumos_da_loja(loja,
insumoIds)` é **substituição completa** (apaga todas as linhas daquela
loja em `insumo_loja` e recria só com os ids marcados), não um merge —
desmarcar um insumo e salvar realmente tira ele da loja. Rotas: `GET
/api/insumos/por-loja?loja=` (qualquer logado, mesma liberação de leitura
do resto do Estoque) e `POST /api/insumos/por-loja` (admin).

**Importar insumos em lote** (concluído em 2026-08-28, na sequência direta
do "Insumos separados por loja" acima — ao tentar aplicar a lista da
VMarket na Tradiça Simus, ficou claro que nenhum dos itens dela existia
ainda como insumo no AdmFood, só os 35 ingredientes de hambúrguer do
Artesanos). Botão "Importar insumos" (ao lado de "Novo insumo", visível
em qualquer aba, admin) abre um modal com checklist de loja(s), categoria
e unidade padrão pro lote inteiro, e uma textarea pra colar a lista —
aceita tanto um nome puro por linha quanto o mesmo formato `nome;valor`
do "colar lista" da seção anterior (o valor é ignorado aqui, é só pra não
precisar editar o arquivo que ela já tinha colado em outro lugar).
`criar_insumos_em_lote(nomes, categoria, unidade_medida, lojas)` chama
`criar_insumo` pra cada nome novo — mesmo caminho de sempre, sem
mecanismo paralelo — e pula (reportando na tela) qualquer nome que já
bata, normalizado (`_normalizar_nome_insumo`, mesmo critério do
`_normalizarNomeInsumo` do front), com um insumo já existente no catálogo
ou repetido dentro do próprio lote colado, pra nunca duplicar. Como
`criar_insumo` já associa o insumo só às lojas passadas (tanto em
`estoque_insumo` quanto em `insumo_loja`), insumo importado só pra
Tradiça já nasce de fora do link do Artesanos e do Açaí — não precisa
passar depois pela ferramenta "Insumos da loja" pra tirar. Rota: `POST
/api/insumos/lote` (admin).

**Estoque também passou a respeitar "Insumos da loja"** (concluído em
2026-09-01, pedido da Julia: ao clicar numa loja específica em Estoque —
ex. Açaí Na Lata — ela queria ver só os insumos daquela loja, e não via
efeito nenhum ao desmarcar algo em "Insumos da loja", porque essa
ferramenta só filtrava o link de Requisição (decisão original documentada
acima, de propósito pra não mexer em `estoque_insumo`). Revertida agora:
`listar_insumos()` ganhou mais uma coluna,
`EXISTS(...) AS aplica` (mesmo `insumo_loja` de sempre, comparado
insumo×loja), e o filtro por aba em Estoque
(`_linhasEstoqueParaTab` em `script.js`) passou a exigir `aplica` além de
só existir a linha de `estoque_insumo` — tanto pra abrir uma aba de loja
específica quanto pra somar na aba "Geral". Não mexe em nenhuma outra
tela: Ficha Técnica, Cotações e o resto continuam do jeito que estavam,
só o comportamento de listagem do Estoque mudou. Como o backfill de
`insumo_loja` original marcou **todo insumo em toda loja**, nada muda pra
quem nunca abriu "Insumos da loja" — o efeito só aparece depois que ela
for lá e desmarcar o que não é daquela unidade.

**Ajuste manual da quantidade ideal** (concluído em 2026-08-27, primeira
peça da "Quantidade ideal inteligente" — respostas da Kethllyn no roteiro
de compras confirmaram manter a conta simples/visível e só permitir
sobrescrever na mão quando ela achar o número errado). Tabela
`ajuste_quantidade_ideal` (loja, insumo_id, valor_ajustado) — mesmo padrão
de sobrescrita em tempo de leitura do `ajuste_faturamento_canal` (seção
6.3): sobrevive a novos recálculos até ela remover. Aplicado dentro de
`listar_itens_contagem`, então vale automaticamente na tela de detalhe da
contagem, na conferência somada da requisição e na tela pública de
preenchimento — sem precisar editar em três lugares. O ícone de editar só
aparece na tela de detalhe de uma contagem (não na visão somada, mesma
razão do Estoque: editar um valor por loja não faz sentido numa linha que
já é a soma de várias lojas). A tela de Estoque também passou a ler esses
ajustes (antes só calculava do zero no navegador) — `carregarInsumos()`
busca o ajuste das 4 lojas em paralelo junto com o consumo médio, e
`_quantidadeIdealParaLinha()` decide por insumo/loja se usa o ajuste ou o
calculado; na aba "Geral" soma o valor **efetivo** de cada loja (ajuste ou
calculado), não só o consumo médio bruto — senão o ajuste de uma loja
sumiria na soma.

**Copiar quantidade ideal de outra loja** (concluído em 2026-08-27,
segunda peça — resposta da Kethllyn: loja nova sem venda suficiente pra
calcular sozinha, copia de uma loja parecida como ponto de partida).
Botão "Copiar de outra loja" na tela de Estoque, só aparece numa aba de
loja específica (não faz sentido na "Geral"). `copiar_quantidade_ideal`
pega o valor **efetivo** de cada insumo na loja de origem (ajuste dela se
tiver, senão o calculado) e grava como ajuste manual na loja de destino —
reaproveita a mesma tabela/mecanismo acima, não duplica lógica. Sobrescreve
qualquer ajuste que a loja de destino já tivesse (a tela avisa antes).

**Ajustar quantidade ideal em lote** (concluído em 2026-08-28, depois que
ela testou o fluxo de Compras em produção e viu que, com a Ficha Técnica
ainda incompleta, a maioria dos insumos fica sem quantidade ideal
calculável — e ajustar um por um pelo lápis é inviável pra destravar a
cotação de uma vez). Botão "Ajustar em lote" na tela de Estoque (mesma
regra de visibilidade do "Copiar de outra loja": só numa aba de loja
específica, não na "Geral"). Abre um modal listando todos os insumos
daquela loja com o valor ideal efetivo atual + um campo pra digitar um
valor novo; só os campos preenchidos são salvos, o resto não é tocado.
`salvar_ajustes_quantidade_ideal_em_lote(loja, valores)` é só um laço
chamando `salvar_ajuste_quantidade_ideal` pra cada item — mesma
tabela/mecanismo de sempre, sem conceito novo. O modal guarda os valores
digitados num objeto à parte (`ajusteLoteValores`) em vez de ler só o que
está visível no DOM, pra não perder o que já foi preenchido quando ela
usa a busca pra filtrar e editar outro grupo de insumos. Rota: `POST
/api/insumos/ajustes-quantidade-ideal/lote` (admin).

**Colar lista no ajuste em lote** (concluído em 2026-08-28, mesmo dia —
ela queria trazer a "sugestão de compra" que a VMarket já calcula pra
cada insumo, em vez de preencher os 80+ valores um a um). Um `<details>`
recolhido dentro do modal ("Colar lista") com uma textarea onde dá pra
colar linhas `nome<separador>quantidade` (aceita tab, `;` ou `,` — tenta
nessa ordem por linha, pra funcionar tanto colando de planilha quanto
digitando na mão) e um botão "Processar lista". `_normalizarNomeInsumo`
tira acento/maiúscula/pontuação de cada nome antes de comparar, então
"BACON" e "Bacon" e "Baçon" (colado errado) ainda batem — mas o match é
sempre **exato** depois de normalizado, nunca por aproximação/substring:
insumo que não bater é listado em "não encontrado" pra ela conferir e
ajustar na mão, em vez de arriscar aplicar valor no insumo errado.
Processa 100% no navegador (só usa os insumos já carregados da própria
tela) — nenhuma rota nova, só popula os mesmos campos que já existem
no modal.

**Datas especiais** (concluído em 2026-08-27, terceira e última peça —
resposta da Kethllyn: feriado/evento marcado manualmente com antecedência,
sem o sistema tentar adivinhar sozinho). Tabela `data_especial`
(data_inicio, data_fim, descricao, multiplicador, loja — `loja=NULL` vale
pra rede toda). `multiplicador_quantidade_ideal(loja)` pega o maior
multiplicador entre as datas que tocam a janela de cobertura (hoje até
hoje + `DIAS_COBERTURA_IDEAL`) — 1.0 (não muda nada) se nenhuma tocar.
Só multiplica o lado **calculado** da conta (consumo médio × 7 dias); o
ajuste manual continua sendo a palavra final dela e nunca é multiplicado
por cima. Card "Datas especiais" na tela de Estoque (só admin) pra
cadastrar/excluir; o multiplicador ativo de cada loja viaja junto na
mesma resposta de `GET /api/insumos/ajustes-quantidade-ideal` (evita mais
uma chamada por loja) e o `carregarInsumos()` do Estoque já aplica em
`_quantidadeIdealParaLoja`.

**Sugestão de compra por tendência** (concluída em 2026-08-31, pedido do
chefe da Julia repassado pelo Guilherme: além da quantidade ideal fixa,
algo que "estude o comportamento das últimas semanas" e avise quando a
loja estiver fugindo do padrão — motivado pelo CMV variando muito mês a
mês no DRE dela). Decisão consciente: **não** é uma chamada de IA de
verdade (custo/latência por linha, e chave de API em produção) — é
estatística simples, mesma fonte de dados que já alimenta a quantidade
ideal. `carregarInsumos()` (Estoque) busca `/api/insumos/consumo-medio`
uma segunda vez, agora com uma janela de 14 dias (`_janelaConsumoRecente`)
em vez dos 30 dias padrão, e `_sugestaoTendenciaParaLoja` compara as duas
médias: se o consumo recente desviar 15% ou mais da média de 30 dias
(`LIMIAR_DESVIO_TENDENCIA`), mostra uma linha extra "↑/↓ tendência: X
(+Y%)" abaixo da quantidade ideal, na tela de Estoque — só numa loja
específica, nunca na "Geral" (tendência de 4 lojas somadas confunde mais
que ajuda). Puramente informativo: não sobrescreve nem participa do
cálculo de déficit, quantidade ideal ou pedido em lugar nenhum — só
chama atenção pra ela decidir se compra diferente do de sempre.

Ficou de fora dessa primeira versão, registrado como pendência: detectar
"a loja está comprando mais do que consome" (a causa mais provável do
CMV variar, segundo o próprio chefe) exigiria saber **quando** cada
compra aconteceu, mas hoje `distribuir_entrada_insumo` só grava isso em
`lote_insumo` quando a entrada tem validade preenchida — entrada sem
validade só soma direto em `estoque_insumo`, sem deixar rastro de data.
Sem esse histórico confiável, não dá pra fazer essa comparação sem
arriscar alertar coisa errada.

Testado em produção no mesmo dia contra dados reais: a lógica funciona
certo (validado com casos sintéticos de alta/queda/sem dado), mas na
prática aparece pouco ainda, pelo mesmo motivo que já limitava a
"Quantidade ideal" — ver a pendência da Ficha Técnica incompleta na
seção 9 (item 9), confirmada com números concretos no mesmo teste.

**Geração automática da cotação a partir do déficit** (concluída em
2026-08-27 — última peça do fluxo Requisição → Contagem → Cotação descrito
na seção 9; regras vieram do roteiro de compras que a Kethllyn respondeu).
Duas tabelas novas: `cotacao_item` (cotacao_id, insumo_id,
quantidade_total) guarda a soma de todas as lojas por insumo — é o que a
tela de Cotações mostra ("insumos juntos", resposta dela na pergunta 3);
`cotacao_item_loja` (cotacao_id, insumo_id, loja, quantidade) guarda a
quebra por loja por baixo, pra não perder a granularidade na hora de
montar a compra de verdade pra cada unidade (pergunta 7b: nunca soma as
lojas pra "ajudar" a bater mínimo de fornecedor). `gerar_cotacao_do_deficit`
só roda numa requisição com **todas** as lojas já aprovadas; por insumo,
calcula o déficit (ideal − preenchido) loja a loja, **sempre arredonda pra
cima** (pergunta 1), **pula o insumo** se o déficit não for positivo —
estoque já no nível ideal não vira "compre 0" (pergunta 2) — ou se não
tiver quantidade ideal calculável ainda (pergunta 6). Não aplica nenhuma
margem de segurança em cima do ideal (pergunta 7c). Se nenhum insumo
sobrar com déficit de verdade, não cria cotação nenhuma (retorna `None`).
O botão "Gerar cotação" na tela de conferência da requisição
(`contagens.html`) só fica habilitado quando `totalmenteAprovada` é
verdadeiro, e depois de gerar já leva direto pra
`cotacoes.html?abrir=<id>` — a cotação nasce igual a uma lançada na mão
(ela ainda pode editar preço, adicionar/remover fornecedor normalmente
antes de fechar, pergunta 5), só que já vem com a quantidade calculada por
insumo. `renderCotacaoComparacao` (script.js) mostra, acima da lista de
preços de cada insumo, o total a comprar e a quebra por loja
(`Comprar 12 g — Loja A: 8 g · Loja B: 4 g`).

**Idempotente contra clique duplo** (concluído em 2026-08-28, risco real
que ela levantou revisando o fluxo: clicar duas vezes em "Gerar cotação",
ou em "Fazer Cotação/Pedido" da última loja, criava **duas cotações
duplicadas** com os mesmos insumos). `cotacao` ganhou duas colunas,
`requisicao_titulo`/`requisicao_prazo` (migração via `ALTER TABLE`, só
preenchidas quando a cotação nasce de `gerar_cotacao_do_deficit` — uma
cotação lançada na mão fica com elas `NULL`). Não dá pra usar o `titulo`
puro pra detectar duplicata porque ele pode ser editado depois
(`atualizar_cotacao`) e deixaria de bater; essas duas colunas ficam
travadas no valor original da requisição pra sempre. Antes de gerar,
`gerar_cotacao_do_deficit` procura uma cotação já existente com esse
par exato — se achar, devolve o id dela sem criar nada de novo (nem
recalcula os itens); só cria de verdade na primeira chamada.

**Avisar insumo sem quantidade ideal calculável** (concluído em
2026-08-31, segundo item da lista de risco que ela levantou revisando o
fluxo — pedido do Guilherme). Antes, `gerar_cotacao_do_deficit` pulava
silenciosamente qualquer insumo sem quantidade ideal calculável (item
`sem_ideal` do loop) — ele nunca entrava na cotação, e não tinha como
saber disso sem ir conferir manualmente. Agora a função devolve
`{"cotacaoId", "insumosSemIdeal": [{"insumoId", "nome"}, ...]}` em vez de
só o id; a rota `POST /api/requisicoes/conferencia/gerar-cotacao` repassa
essa lista, e os dois pontos que chamam essa rota (o clique manual em
"Gerar cotação" na conferência, e o atalho de aprovar a última loja
direto pra cotação) mostram um alerta com os nomes antes de levar pra
tela da cotação — `_avisoInsumosSemIdeal` em `script.js`. Testado com
dado real: de 35 insumos de uma contagem, 28 sem ideal calculável (falta
de Ficha Técnica/venda casada) foram corretamente listados, e os 7 com
déficit de verdade entraram na cotação normalmente. Não muda nada no
cálculo em si — só torna visível o que já acontecia por baixo.

Rotas: `GET/POST /api/contagens` (lista/cria, admin), `GET
/api/contagens/<id>` (detalhe de uma loja pra conferência, admin), `POST
/api/contagens/<id>/aprovar` (admin), `PUT/DELETE
/api/insumos/<id>/quantidade-ideal?loja=` (ajuste manual, admin), `GET
/api/insumos/ajustes-quantidade-ideal?loja=` (lista os ajustes de uma
loja + o multiplicador especial ativo, qualquer logado — mesma liberação
de leitura do resto do Estoque), `POST /api/insumos/copiar-quantidade-ideal`
(admin), `GET/POST /api/datas-especiais` e `DELETE
/api/datas-especiais/<id>` (admin), `GET /api/contagens/token/<token>` e
`POST /api/contagens/token/<token>/responder` (públicas — token é a própria
autenticação, ver exceção em `ROTAS_API_PUBLICAS`/`PAGINAS_PUBLICAS` em
`app.py`); `GET /api/requisicoes` (lista os grupos, admin), `GET
/api/requisicoes/conferencia?titulo=&prazoValidade=` (déficit somado de
todas as lojas do grupo, admin), `POST
/api/requisicoes/conferencia/aprovar` (aprova todas as contagens
`respondida` do grupo, admin), `POST
/api/requisicoes/conferencia/gerar-cotacao` (transforma o déficit numa
cotação de verdade, admin — só funciona com todas as lojas aprovadas).
`GET /api/cotacoes/<id>` agora também devolve `itens` (quantidade total +
quebra por loja de cada insumo, vazio numa cotação lançada na mão sem
passar pela Requisição).

**Pedido de compra** (concluído em 2026-08-27 — fecha o fluxo Requisição →
Contagem → Cotação → Pedido descrito na seção 9; regras vieram do roteiro
de compras, tela nova `pedidos.html`, 4º item do menu Compras). Duas
tabelas: `pedido_compra` (id, cotacao_id, fornecedor_id, loja, status,
criado_em, atualizado_em) e `pedido_compra_item` (pedido_id, insumo_id,
quantidade, preco_unitario). Um pedido é sempre por **(fornecedor, loja)**,
nunca a cotação inteira: o mesmo insumo pode fechar com fornecedores
diferentes na mesma cotação (pergunta 22), e o pedido mínimo do fornecedor
conta por loja, não somado na rede (pergunta 29) — juntar tudo numa
cotação só faria sentido se o mínimo fosse por rede. `gerar_pedidos_de_cotacao`
roda a partir do botão "Gerar pedidos" na tela de Cotações (aparece só
quando a cotação tem `itens`, ou seja, veio de uma Requisição) — é uma
etapa manual, separada de marcar o vencedor por insumo (pergunta 23: ela
não quer isso automático). Considera só insumo com preço `selecionado`;
quem ainda não tem vencedor fica de fora (avisa quantos, não é erro — dá
pra clicar "Gerar pedidos" de novo depois que marcar mais vencedores, sem
duplicar pedido de quem já foi pra evitar comprar em dobro).

Acompanhamento de entrega é uma sequência simples de 4 estágios
(`ESTAGIOS_PEDIDO` em `armazenamento.py`): Pedido enviado → Confirmado
pelo fornecedor → A caminho → Recebido — só um passo de cada vez, sem
pular (a VMarket tem "4 ou mais" estágios segundo a Kethllyn,
mas ela não tinha os nomes exatos das telas de lá; o Guilherme optou por
esse conjunto genérico em vez de tentar adivinhar a nomenclatura). Chegar
em "Recebido" **não** lança entrada em estoque sozinho — ela prefere
continuar usando o "Registrar entrada" existente na mão (pergunta 25); o
pedido aqui é só rastreio, não mexe em `estoque_insumo`. Pedido cujo total
fica abaixo do `pedido_minimo` do fornecedor só recebe um aviso na tela
(badge "abaixo do mínimo" na lista + banner no detalhe) — nunca bloqueia
nada, ela decide (pergunta 28). Botão "Voltar etapa" (concluído em
2026-08-28, risco real que ela apontou: clicar "avançar" sem querer não
tinha como desfazer) — `voltar_status_pedido` é o espelho de
`avancar_status_pedido`, um passo pra trás por vez, trava em "Pedido
enviado" (não some do rastreio). Também não mexe em estoque.

**Cancelar pedido** (concluído em 2026-08-28, mesma revisão: pedido
gerado pro fornecedor errado, ou duplicado, não tinha como sair de
existir — só apagando tudo na Zona de Perigo). Botão "Cancelar pedido" no
detalhe (vermelho, mas sem destaque igual ao de avançar/voltar, pra não
ser o primeiro clique óbvio). `excluir_pedido` apaga o pedido e seus
itens; como `gerar_pedidos_de_cotacao` só pula insumo que já tem
`pedido_compra_item` registrado, cancelar automaticamente libera esse(s)
insumo(s) pra aparecer de novo na próxima vez que "Gerar pedidos" rodar
na mesma cotação — não precisa de nenhuma lógica extra de "desfazer".

Rotas: `POST /api/cotacoes/<id>/gerar-pedidos` (admin), `GET /api/pedidos`
(lista, admin), `GET /api/pedidos/<id>` (detalhe com itens, admin), `POST
/api/pedidos/<id>/avancar` (admin), `POST /api/pedidos/<id>/voltar`
(admin), `DELETE /api/pedidos/<id>` (admin, cancela).

**Recebimentos** (concluída em 2026-09-01, pedido da Julia/Guilherme —
fecha de vez o ciclo Requisição → Contagem → Cotação → Pedido →
**Entrada em estoque**, que antes dependia de "Registrar entrada" manual,
solto, sem ligação nenhuma com o pedido de verdade). Tela nova
(`recebimentos.html`), primeira do fluxo de Compras **liberada pra
qualquer pessoa logada, não só admin** — pensada pra ser a primeira função
de verdade que a equipe (papel "equipe") vai ter acesso, sem precisar de
conta admin só pra confirmar que uma entrega chegou.

Busca (por fornecedor, valor ou produto — via `itens_nomes`, concatenado
com `GROUP_CONCAT` em `listar_pedidos_pendentes_recebimento`, pra não
precisar de endpoint de busca à parte) entre pedidos ainda não
`recebido`. Ao confirmar: o colaborador digita o **nome de quem recebeu**
(data/hora grava sozinha) e pode **corrigir quantidade e preço por item**
se a entrega vier diferente do pedido — a correção sobrescreve
`pedido_compra_item` (mesmo espírito de sobrescrita usado em ajustes por
todo o sistema) e é o valor que soma em `estoque_insumo.quantidade_atual`
da loja do pedido, não o valor pedido originalmente. Essa é a **primeira
ação do sistema que atualiza estoque a partir de um pedido de compra** —
`avancar_status_pedido` (Pedidos, admin) explicitamente nunca mexeu em
estoque; confirmar recebimento aqui também avança o pedido direto pro
último estágio (`recebido`).

Tem um campo pro **valor total da Nota Fiscal**; se não bater com o
calculado dos itens (final, já com correção) além de R$ 0,05 de
tolerância, `confirmar_recebimento_pedido` cria sozinha uma tarefa no
ClickUp (categoria "Estoque", prioridade "alta") citando os dois valores
— o board não tem campo de responsável, então não dá pra atribuir direto
pra uma pessoa específica (a Julia mencionou a Kethllyn), só deixa bem
claro no título/descrição. O preço corrigido também fica visível na
tela pra alguém depois atualizar manualmente o custo do insumo no painel
da Cardápio Web — confirmado com ela que isso é manual, sem integração
nova (a API de parceiro que já usamos só lê pedido/venda, nunca
escreve).

Testado direto com dado real: pedido sem divergência (10 un. recebidas,
igual ao pedido) somou certo no estoque e não criou tarefa; pedido com
divergência proposital (recebeu 4 de 5, e valor de NF bem diferente do
calculado) somou só os 4 recebidos e criou a tarefa automaticamente.
Rotas, todas exigindo só login (`GET/POST` sem `_exigir_admin`, ao
contrário de `/api/pedidos/*`): `GET /api/recebimentos` (lista pendente),
`GET /api/recebimentos/<id>` (detalhe com itens), `POST
/api/recebimentos/<id>/confirmar` (confirma e atualiza estoque).

**"Zona de perigo" — limpar requisições e cotações** (concluída em
2026-08-27, pedido do Guilherme pra zerar o histórico de teste antes do
uso de verdade começar). Card vermelho no fim de `configuracoes.html`
(só admin), atrás de um modal que exige digitar "APAGAR" (comparação
exata, sem confirm() do navegador) pra habilitar o botão — mais forte que
o `confirm()` simples do resto do sistema, porque aqui é tudo de uma vez,
não um item só. `limpar_requisicoes_e_cotacoes()` apaga, na ordem certa
de FK, `pedido_compra`/`pedido_compra_item`,
`cotacao_convite`/`cotacao_convite_item`, `cotacao`/`cotacao_preco`/
`cotacao_item`/`cotacao_item_loja` e `contagem`/`contagem_item` — **não**
mexe em `estoque_insumo` (quantidade atual real fica como está) nem em
cadastro (`insumo`, `fornecedor`, `insumo_fornecedor`,
`ajuste_quantidade_ideal`, `data_especial`). Rota: `POST
/api/admin/limpar-requisicoes-cotacoes` (admin). Sem confirmação a mais
que essa — é irreversível, então só existe pra rodar direto em produção
quando ela decidir, nunca automático.

**Excluir uma requisição isolada** (concluído em 2026-08-31, terceiro e
último item da lista de risco que ela levantou revisando o fluxo — pedido
do Guilherme). A Zona de Perigo acima só apaga **tudo** de uma vez —
descartar uma única requisição de teste (ex: "TESTE - apagar depois")
exigia zerar o histórico inteiro. Ícone de lixeira na lista de
Requisições (`contagens.html`, só admin, ao lado do de abrir a
conferência) chama `excluir_requisicao(titulo, prazo_validade)` — mesma
ordem de FK da limpeza geral, mas filtrada só pelas contagens desse
grupo e a cotação/pedidos nascidos dela (se existir), via
`requisicao_titulo`/`requisicao_prazo`. Confirmação simples (`confirm()`
do navegador, não o "digitar APAGAR" da limpeza geral) — proporcional ao
risco menor de mexer só numa requisição, não no histórico todo. Testado
com uma requisição de 2 lojas já aprovada e com cotação gerada: exclusão
apagou as 2 contagens, a cotação e os itens dela, sem tocar em nenhum
outro dado. Rota: `DELETE /api/requisicoes?titulo=&prazoValidade=`
(admin).

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

**Estoque**
- `GET /api/insumos` — catálogo de insumos com quantidade/mínimo por loja
- `POST /api/insumos` — cadastrar insumo novo (cria estoque zerado nas 4 lojas) — só admin
- `PUT|DELETE /api/insumos/<id>` — editar catálogo (nome/categoria/unidade/favorito) / excluir de todas as lojas — só admin
- `PUT /api/insumos/<id>/estoque/<loja>` — corrigir quantidade/mínimo de uma loja (substitui, não soma) — só admin
- `POST /api/insumos/<id>/entrada` — distribuir entrada entre lojas (soma; aceita `validade` opcional, ver 6.4) — só admin
- `GET /api/insumos/consumo-medio?inicio=&fim=&unidade=` — consumo médio diário estimado por insumo (Ficha Técnica × vendas reais, ver 6.6)
- `GET /api/insumos/lotes-vencendo?dias=N` — lotes de validade vencendo/vencidos nos próximos N dias (padrão 7)
- `PUT /api/lotes/<id>/resolver` — marca um lote como resolvido (soft, não apaga) — só admin

**Ficha técnica**
- `GET /api/ficha-tecnica` — todos os itens do cardápio com seus insumos vinculados
- `POST /api/itens-cardapio` — cadastrar item (prato) novo — só admin
- `DELETE /api/itens-cardapio/<id>` — excluir item — só admin
- `PUT /api/itens-cardapio/<id>/ficha-tecnica` — substitui a lista inteira de insumos do item — só admin

**Fornecedores**
- `GET /api/fornecedores` — diretório completo (ativos e inativos)
- `POST /api/fornecedores` — cadastrar fornecedor novo — só admin
- `PUT /api/fornecedores/<id>` — editar campos (parcial, inclusive `ativo`) — só admin

**Cotações**
- `GET /api/cotacoes` — lista com contagem de insumos/fornecedores distintos já com preço
- `POST /api/cotacoes` — criar cotação (só `titulo`) — só admin
- `GET /api/cotacoes/<id>` — detalhe: preços agrupados por insumo, ordenados por preço
- `PUT /api/cotacoes/<id>` — editar título e/ou status (`aberta`/`fechada`) — só admin
- `DELETE /api/cotacoes/<id>` — excluir cotação e seus preços — só admin
- `POST /api/cotacoes/<id>/precos` — lançar/corrigir preço (upsert por insumo+fornecedor) — só admin
- `DELETE /api/cotacoes/<id>/precos/<preco_id>` — remover um preço lançado — só admin
- `PUT /api/cotacoes/<id>/precos/<preco_id>/selecionar` — marcar vencedor do insumo (desmarca os demais) — só admin

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

1. **Estoque / VMarket** — 🟡 parte "estoque" resolvida em 2026-08-24 (catálogo de insumos + quantidade por loja, ver seção 6.4), mas não do jeito planejado originalmente: investigado e confirmado que a VMarket não tem API de parceiro (só exportação manual de planilha), então em vez de integrar, foi construído um controle **nativo** no próprio sistema. **Ambição maior definida em 2026-08-25**: parar de usar a VMarket por completo, não só o estoque — também **Compras** (pedidos) e **Cotação de insumo com fornecedor** (RFQ: pedir preço a vários fornecedores, comparar propostas, fechar pedido), hoje só na VMarket.

   **Inventário completo da VMarket** (levantado navegando pelo próprio sistema em 2026-08-25, item por item, pra saber o que vale a pena replicar):
   - ✅ **Já replicado nativamente**: catálogo de insumos (160 importados), fornecedores (69 importados, com pedido mínimo), vínculo insumo↔fornecedor + homologação de marca, cotação manual (lança preço por insumo/fornecedor, compara, destaca mais barato), quantidade ideal (consumo médio × 7 dias) + sugestão de compra.
   - ✅ **Núcleo do fluxo Compras** — concluído em 2026-08-27 (o motivo de toda essa investigação — fluxo real: Requisição → Contagem → Cotação → Pedido → Recebimento):
     - ✅ **Requisição + Contagem por loja** — concluído em 2026-08-26 (decisão de acesso: link por token, sem login, estilo VMarket — ver seção 6.9). Requisição abre o ciclo em várias lojas de uma vez (título + prazo compartilhados), gerando uma contagem/link por loja selecionada; funcionário preenche a quantidade atual de cada insumo do seu setor pelo link; admin confere e aprova antes de virar quantidade real em estoque.
     - ✅ **Área de conferência** — concluída em 2026-08-26 (ver seção 6.9). Visão somando o preenchido e a quantidade ideal das várias lojas de uma mesma requisição, com aviso de quem ainda falta responder, e um botão pra aprovar todas as lojas prontas de uma vez.
     - ✅ **Geração automática da cotação** a partir do déficit (ideal − atual) — concluída em 2026-08-27 (ver seção 6.9). Botão "Gerar cotação" na conferência da requisição (só habilitado com todas as lojas aprovadas) cria a cotação já com a quantidade calculada por insumo (arredondada pra cima, pulando quem já está no ideal ou sem ideal calculável), preservando a quebra por loja por baixo mesmo mostrando os insumos juntos na tela.
     - ✅ **Pedido** (VMarket: Compras → Meus Pedidos / Cadastrar Pedido Manual / Agenda de Recebimento) — concluído em 2026-08-27 (ver seção 6.9). Botão "Gerar pedidos" na tela de Cotações fecha os insumos já com vencedor escolhido em pedido(s) de compra, um por fornecedor+loja; tela nova `pedidos.html` acompanha 4 estágios de entrega (Pedido enviado → Confirmado → A caminho → Recebido) e avisa quando o pedido fica abaixo do mínimo do fornecedor, sem bloquear nada.
     - ✅ **Fornecedor cotando os próprios produtos** — concluído em 2026-08-27 (ver seção 6.9). Botão "Convidar fornecedores" manda link sem login pra todo fornecedor ativo, só dos insumos ainda sem fornecedor vinculado; cada fornecedor decide na hora, item por item, se vende ou não.
   - 🔻 **Existe na VMarket mas não configurado/usado por vocês hoje** (baixa prioridade — replicar seria trabalho sem necessidade comprovada): **Orçamento** (Config. Orçamento + Desvio Padrão — zero registros cadastrados); **Financeiro/Nota Fiscal** (concilia XML de nota fiscal contra pedido de compra — zero notas processadas; dependeria de integração fiscal, domínio novo).
   - ❌ **Não aplicável** (recursos da própria VMarket como marketplace, não replicáveis num sistema interno): **Guia de Fornecedores** (diretório de fornecedores parceiros da própria VMarket, pra descobrir fornecedor novo — não é o cadastro de vocês); **Shopping VMarket** (catálogo de compra direto de fornecedores parceiros da VMarket, com carrinho — depende da rede de distribuidores deles); **Lançar Faturamento** (input manual de faturamento mensal pra alimentar o CMV/Curva ABC do dashboard deles — o AdmFood já tem faturamento diário sincronizado automaticamente da Cardápio Web, mais granular que isso).
   - 📊 **Dashboard da VMarket** (não replicado ainda, mas pode inspirar métricas futuras): Curva ABC de produtos/fornecedores (participação % em compras), total em compras, economia potencial de cotações, CMV global, tempo de resposta do fornecedor / de cotação pra pedido / de pedido até entrega, solicitações emergenciais, orçado x realizado por filial.

   Fase 1 (cadastro de fornecedores, seção 6.7), Fase 2 (cotação manual + comparação por insumo, seção 6.8) e vínculo insumo↔fornecedor/marca homologada ✅ concluídas em 2026-08-25. Núcleo do fluxo Compras (Requisição → Contagem → Conferência → Geração automática de cotação → Pedido → Fornecedor cotando pelo link) ✅ concluído em 2026-08-27. Fica faltando só o que estiver em 🔻/❌/📊 acima (baixa prioridade ou não aplicável).
2. **Relatório via WhatsApp** — integração com a API do WhatsApp Business pra enviar relatórios. Aguardando confirmação de acesso/credenciais da API.
3. **ClickUp** — ✅ concluído em 2026-08-17 (backend real + Kanban persistente, ver seção 7).
4. **Acessos da equipe** — ✅ concluído em 2026-08-19 (login individual por pessoa, com senha — ver seção 8). Landing page e cadastro público ficam **de propósito** atrás do login por enquanto (decisão da Julia: sistema é só interno, sem necessidade de porta pública ainda).
5. **Documentação do sistema** — este arquivo.
6. **Agente no WhatsApp pra relatórios sob demanda** — perguntar todo dia de manhã, num grupo, quanto vendeu no presencial (Art e Tradiça ZN) do dia anterior, e a própria Julia responder pra atualizar o sistema. Depende do item 2 (acesso à API do WhatsApp).
7. **Cardápio (comparativo de preços)** — ✅ concluído em 2026-08-21 (tela nova com fotos, edição de preço protegida por botão "Editar" e importação de planilha — ver seção 6.1). Fica faltando só a Julia (ou quem for editar) subir as fotos dos produtos que ainda não têm, pela própria tela.
8. **Preparo** — ✅ concluído em 2026-08-24 (indicadores operacionais da cozinha — ver seção 6.2). Pivotou de KDS em tempo real (pedido do rascunho original da Julia) pra tela de relatório, depois de investigar e confirmar que a API da Cardápio Web não expõe o momento em que a cozinha termina de preparar.
9. **Aviso de estoque baixo/vencendo + quantidade ideal inteligente** — 🟡 em andamento (iniciado 2026-08-25). Pronto: schema de lotes de validade (`lote_insumo`) e card "Lotes vencendo" com botão de resolver (seção 6.4); cálculo de consumo médio a partir de Ficha Técnica × vendas reais (`venda_item` + `consumo_medio_insumo`) e coluna "Consumo médio/dia" na tela de Estoque (seção 6.6); coluna "Qtd. ideal (7 dias)" = consumo médio × 7, com "comprar X" destacado quando o atual fica abaixo do ideal (concluído em 2026-08-25). **"Quantidade ideal inteligente"** (as 3 peças que a Kethllyn pediu no roteiro de compras, ver seção 6.9) ✅ concluída em 2026-08-27: ajuste manual por insumo/loja, copiar de loja parecida (loja nova sem histórico) e datas especiais (feriado/evento aumentando a conta calculada com antecedência) — deliberadamente **sem** IA/caixa-preta, ela pediu conta simples e visível. Falta: (a) a Ficha Técnica ficar completa pras 4 lojas — hoje só 20 itens da Hamburgueria Artesanos, a maioria sem gramatura, aguardando o chefe da loja definir e passar as quantidades, sem prazo (sem isso, a quantidade ideal calculada fica "—" pra maioria dos insumos, mesmo com ajuste manual/cópia/data especial prontos); (b) o "aviso" em si sendo empurrado (WhatsApp) — hoje é passivo, só aparece pra quem abrir a tela; depende do item 2.

**Confirmado com números reais em 2026-08-31** (ao testar a "sugestão por
tendência" abaixo — ela também depende dessa mesma Ficha Técnica): de 600
linhas de `venda_item` sincronizadas, só 44 (7%) casaram com um item da
Ficha Técnica. A maior fatia perdida é a **Tradiça** (hot dogs) — nunca
teve nenhum prato cadastrado, só o Artesanos teve a carga inicial — ex:
"Tradiça Duplo" (53 vendas), "Hot Dog com Calabresa" (43), "Hot Dog com
Bacon" (25) ficam de fora inteiros. Segundo fator, menor mas real: o
casamento em `salvar_itens_vendidos_do_dia` é só `LOWER(TRIM(nome))`,
sem tirar acento nem cortar sufixo de marketing — "Tasty Bacon -
releitura do Big Tasty" (28 vendas) não bate com o cadastro "Tasty
Bacon", e "Cléssico - Cheese Salada" (31) não bate com "CLASSICO" por
causa do acento. Prioridade decidida pela Julia: cadastrar a Ficha
Técnica da Tradiça primeiro (o chefe dela está fazendo isso loja por
loja), correção do casamento de nome logo em seguida.

**Correção do casamento de nome** (concluída em 2026-08-31).
`_casar_item_cardapio` (backend/armazenamento.py) tenta o nome vendido
inteiro primeiro, normalizado (mesmo critério de `_normalizar_nome_insumo`
— tira acento/maiúscula/pontuação), e se não bater e o nome tiver um
"- subtítulo" de marketing colado (ex: "Tasty Bacon - releitura do Big
Tasty"), tenta de novo só com a parte antes do traço. `salvar_itens_vendidos_do_dia`
agora busca o catálogo inteiro uma vez por sincronização (antes era uma
query por item vendido) e casa em memória — mais rápido e mais correto
ao mesmo tempo. Resultado real, ressincronizando 30/08: de 7% (44/600)
pra **21% (126/600)** de match, sem nenhum prato novo cadastrado — só
corrigindo o casamento dos 20 que já existiam. O resto que falta é
mesmo cobertura de catálogo (Tradiça/Açaí, combos), não formatação de
nome. A correção vale só pra sincronizações novas — dias já sincronizados
antes se corrigem sozinhos na reconferência automática dos últimos 7
dias (ver seção 6.3), ou com uma ressincronização manual pra ir mais
longe no histórico.

10. **Baixa automática de estoque por venda real (produto + complemento) e "quebra"** — 🟡 fase 1 concluída em 2026-09-02 (pedido do chefe da Julia, repassado por ela): plano completo é puxar cada venda da Cardápio Web, casar produto **e** cada complemento escolhido com a Ficha Técnica, descontar o insumo certo do estoque automaticamente, e comparar com a Contagem física (seção 6.9) pra mostrar a "quebra" (diferença entre teórico e real) e já gerar o pedido de compra certo sozinho. **Fase 1** ✅ (ver "Ficha técnica de complemento" na seção 6.5) — só a receita do complemento em si dentro do AdmFood, confirmado ao vivo que a API da Cardápio Web já expõe qual complemento foi escolhido em cada venda. **Fases seguintes, ainda não iniciadas**: (a) puxar a venda real casando produto+complementos com a Ficha Técnica; (b) baixa automática de estoque a partir disso; (c) comparação com a Contagem física mostrando a quebra; (d) gerar pedido de compra automático a partir da quebra. Previsão inteligente de falta de estoque (IA) foi citada pelo chefe como ideia futura, **fora de escopo por enquanto** — nenhuma das fases acima depende disso.

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
- Grupo recolhível no menu lateral (`.menu-group`/`.menu-subgroup`, ver
  `script.js` seção "GRUPOS DE MENU RECOLHÍVEIS"): quando várias telas são
  páginas de verdade (Fornecedores/Cotações/Contagens dentro de "Compras"),
  cada uma marca seu próprio sub-item com `active` direto no HTML. Quando
  são a MESMA página com mais de um modo de visualização (Preços/Ficha
  Técnica dentro de "Cardápio"), o modo vem de um `?aba=` na URL e o
  próprio JS da página marca o sub-item ativo e alterna os `#modo-*` — o
  grupo em si não sabe a diferença entre os dois casos.
