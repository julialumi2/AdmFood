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

`item_cardapio` é o catálogo do prato em si (ex: "BIG ART") — **não** é
por loja nem por canal, é a receita, que não muda dependendo de onde é
vendida. `ficha_tecnica` liga um item a um ou mais insumos, com
quantidade **opcional** (`NULL` quando não sabemos a gramatura exata).

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
admin) sempre manda a lista inteira de insumos (substitui, não faz diff)
— mais simples de implementar tanto no back quanto na tela. Leitura
liberada pra todo mundo logado.

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

### 6.9 Contagem de estoque por link + Requisição (núcleo do fluxo Compras)

Tela `contagens.html` — VMarket-style: gera um **link sem login** (token
opaco em `secrets.token_urlsafe`) pra um funcionário da loja preencher a
quantidade em estoque de cada insumo, sem precisar de conta no AdmFood.
Adicionado em 2026-08-26.

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

Rotas: `GET/POST /api/contagens` (lista/cria, admin), `GET
/api/contagens/<id>` (detalhe de uma loja pra conferência, admin), `POST
/api/contagens/<id>/aprovar` (admin), `PUT/DELETE
/api/insumos/<id>/quantidade-ideal?loja=` (ajuste manual, admin), `GET
/api/insumos/ajustes-quantidade-ideal?loja=` (lista os ajustes de uma
loja, qualquer logado — mesma liberação de leitura do resto do Estoque),
`POST /api/insumos/copiar-quantidade-ideal` (admin), `GET /api/contagens/token/<token>` e
`POST /api/contagens/token/<token>/responder` (públicas — token é a própria
autenticação, ver exceção em `ROTAS_API_PUBLICAS`/`PAGINAS_PUBLICAS` em
`app.py`); `GET /api/requisicoes` (lista os grupos, admin), `GET
/api/requisicoes/conferencia?titulo=&prazoValidade=` (déficit somado de
todas as lojas do grupo, admin), `POST
/api/requisicoes/conferencia/aprovar` (aprova todas as contagens
`respondida` do grupo, admin). Ainda falta: a geração automática da
cotação a partir desse déficit somado (ver seção 9, item 1) — hoje a
conferência só mostra o número, não cria a cotação sozinha.

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
   - 🔲 **Núcleo que falta** (o motivo de toda essa investigação — fluxo real: Requisição → Contagem → Cotação → Pedido → Recebimento):
     - ✅ **Requisição + Contagem por loja** — concluído em 2026-08-26 (decisão de acesso: link por token, sem login, estilo VMarket — ver seção 6.9). Requisição abre o ciclo em várias lojas de uma vez (título + prazo compartilhados), gerando uma contagem/link por loja selecionada; funcionário preenche a quantidade atual de cada insumo do seu setor pelo link; admin confere e aprova antes de virar quantidade real em estoque.
     - ✅ **Área de conferência** — concluída em 2026-08-26 (ver seção 6.9). Visão somando o preenchido e a quantidade ideal das várias lojas de uma mesma requisição, com aviso de quem ainda falta responder, e um botão pra aprovar todas as lojas prontas de uma vez.
     - **Geração automática da cotação** a partir do déficit (ideal − atual) — a conferência acima já calcula esse número somado; falta só ligar na criação da cotação em vez de lançar item por item na mão.
     - **Pedido** (VMarket: Compras → Meus Pedidos / Cadastrar Pedido Manual / Agenda de Recebimento) — depois de fechar a cotação com um fornecedor vencedor, vira um pedido de compra com acompanhamento de entrega (a VMarket tem 4 estágios de recebimento). Não existe nada disso ainda no AdmFood.
     - **Fornecedor cotando os próprios produtos** — hoje é a Julia/Kethllyn que digita o preço de cada fornecedor manualmente; a VMarket manda um link individual pro fornecedor preencher. Mesmo padrão de link por token da Contagem (seção 6.9) deve resolver.
   - 🔻 **Existe na VMarket mas não configurado/usado por vocês hoje** (baixa prioridade — replicar seria trabalho sem necessidade comprovada): **Orçamento** (Config. Orçamento + Desvio Padrão — zero registros cadastrados); **Financeiro/Nota Fiscal** (concilia XML de nota fiscal contra pedido de compra — zero notas processadas; dependeria de integração fiscal, domínio novo).
   - ❌ **Não aplicável** (recursos da própria VMarket como marketplace, não replicáveis num sistema interno): **Guia de Fornecedores** (diretório de fornecedores parceiros da própria VMarket, pra descobrir fornecedor novo — não é o cadastro de vocês); **Shopping VMarket** (catálogo de compra direto de fornecedores parceiros da VMarket, com carrinho — depende da rede de distribuidores deles); **Lançar Faturamento** (input manual de faturamento mensal pra alimentar o CMV/Curva ABC do dashboard deles — o AdmFood já tem faturamento diário sincronizado automaticamente da Cardápio Web, mais granular que isso).
   - 📊 **Dashboard da VMarket** (não replicado ainda, mas pode inspirar métricas futuras): Curva ABC de produtos/fornecedores (participação % em compras), total em compras, economia potencial de cotações, CMV global, tempo de resposta do fornecedor / de cotação pra pedido / de pedido até entrega, solicitações emergenciais, orçado x realizado por filial.

   Fase 1 (cadastro de fornecedores, seção 6.7), Fase 2 (cotação manual + comparação por insumo, seção 6.8) e vínculo insumo↔fornecedor/marca homologada ✅ concluídas em 2026-08-25. Faltam as peças do "núcleo que falta" acima, na ordem: decidir o modelo de acesso (login "equipe" por loja + token por cotação pra fornecedor), depois requisição → contagem → conferência → geração automática → pedido/recebimento.
2. **Relatório via WhatsApp** — integração com a API do WhatsApp Business pra enviar relatórios. Aguardando confirmação de acesso/credenciais da API.
3. **ClickUp** — ✅ concluído em 2026-08-17 (backend real + Kanban persistente, ver seção 7).
4. **Acessos da equipe** — ✅ concluído em 2026-08-19 (login individual por pessoa, com senha — ver seção 8). Landing page e cadastro público ficam **de propósito** atrás do login por enquanto (decisão da Julia: sistema é só interno, sem necessidade de porta pública ainda).
5. **Documentação do sistema** — este arquivo.
6. **Agente no WhatsApp pra relatórios sob demanda** — perguntar todo dia de manhã, num grupo, quanto vendeu no presencial (Art e Tradiça ZN) do dia anterior, e a própria Julia responder pra atualizar o sistema. Depende do item 2 (acesso à API do WhatsApp).
7. **Cardápio (comparativo de preços)** — ✅ concluído em 2026-08-21 (tela nova com fotos, edição de preço protegida por botão "Editar" e importação de planilha — ver seção 6.1). Fica faltando só a Julia (ou quem for editar) subir as fotos dos produtos que ainda não têm, pela própria tela.
8. **Preparo** — ✅ concluído em 2026-08-24 (indicadores operacionais da cozinha — ver seção 6.2). Pivotou de KDS em tempo real (pedido do rascunho original da Julia) pra tela de relatório, depois de investigar e confirmar que a API da Cardápio Web não expõe o momento em que a cozinha termina de preparar.
9. **Aviso de estoque baixo/vencendo + quantidade ideal** — 🟡 em andamento (iniciado 2026-08-25). Pronto: schema de lotes de validade (`lote_insumo`) e card "Lotes vencendo" com botão de resolver (seção 6.4); cálculo de consumo médio a partir de Ficha Técnica × vendas reais (`venda_item` + `consumo_medio_insumo`) e coluna "Consumo médio/dia" na tela de Estoque (seção 6.6); coluna "Qtd. ideal (7 dias)" = consumo médio × 7, com "comprar X" destacado quando o atual fica abaixo do ideal (client-side, sem mudança de schema — concluído em 2026-08-25). Falta: (a) a Ficha Técnica ficar completa pras 4 lojas — hoje só 20 itens da Hamburgueria Artesanos, a maioria sem gramatura, aguardando o chefe da loja definir e passar as quantidades, sem prazo (sem isso, a quantidade ideal fica "—" pra maioria dos insumos); (b) o "aviso" em si sendo empurrado (WhatsApp) — hoje é passivo, só aparece pra quem abrir a tela; depende do item 2.

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
