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
  cardapio_web.py            → cliente da API da Cardápio Web (pedido, complementos, tamanho)
  nomes_insumo.py            → casamento determinístico de nome de insumo (planilha ↔ cadastro)
  precos_cardapio.py         → leitor da planilha "Comparativos de Preços"
  vendas_semanais_planilha.py → leitor da planilha de vendas semanais
importar_historico_sheets.py → script avulso de importação inicial (Google Sheets → SQLite)
completar_pedidos_historico.py → script avulso de backfill de histórico
sincronizar_periodo.py       → carga de histórico de venda (N dias), com paciência no limite da API
importar_ficha_tecnica_faltante.py, importar_custos_insumo.py, migrar_insumo_para_grama.py,
limpar_fichas_copiadas.py, importar_ficha_acai.py, configurar_complementos_acai.py,
montar_cardapio_tradica.py, importar_sub_receitas.py
                             → imports avulsos das planilhas, usados no banco local em 09–10/09
                               (sem --apply só simulam). Não rodam em produção: lá a Julia
                               cadastrou tudo na tela, e o botão que os levava foi removido (6.17)

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
| `index.html` | Resumo (Home) — faturamento da rede, estoque crítico, gráficos, ranking e gestão (Curva A, custos em alta, atalhos) |
| `estoque.html` | Estoque — controle nativo de insumos por loja, sem depender de terceiro (ver seção 6.4) |
| `fornecedores.html` | Fornecedores — diretório da rede, semente do módulo de Compras (ver seção 6.7) |
| `cotacoes.html` | Cotações — comparação manual de preço por insumo entre fornecedores (ver seção 6.8) |
| `cardapio.html` | Cardápio — preço por canal (iFood/99Food/BeeFood/Cardápio Web) e ficha técnica de cada produto e complemento, por loja (ver seções 6.1 e 6.5) |
| `preparo.html` | Preparo — indicadores operacionais da cozinha (tempo médio do pedido, volume por horário, gargalos; ver seção 6.2) |
| `clickup.html` | Quadro de tarefas (Kanban) |
| `insight.html` | Insights → Vendas Diárias — faturamento por período, por loja, por canal, por dia da semana; inclui o painel de Preparo |
| `vendas-semanais.html` | Insights → Vendas Semanais — CMV, %CMV e veredito por semana (ver seção 6.13) |
| `curva-abc.html` | Insights → Curva ABC — de cardápio e de insumos (ver seção 6.12) |
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
| `BACKUP_AUTOMATICO` | `"false"` desliga a cópia diária do banco às 3h30 (ver 8.3); qualquer outro valor, ou ausente, mantém ligada |
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
- Diário às 3h — reconfere os **últimos 7 dias** (não só ontem), com calma
  (eram 3 até 2026-08-31: pedido reaberto pode levar mais que isso pra
  voltar a "concluído")
- A cada 15 min — resincroniza o dia de hoje, pra tela ir se atualizando quase em tempo real

A reconferência dos últimos dias existe porque um pedido que ainda
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

**Limite de requisição (429).** Estourar o limite da Cardápio Web devolve
429, e sem espera a tentativa seguinte cai no mesmo minuto cheio — foi
assim que uma carga de 90 dias em 2026-09-09 gravou 1 dia e falhou 76 em
cascata (parecia que o processo "morria"). `_buscar` repete a chamada com
espera crescente (ou o `Retry-After` da API); o histórico, que tem limite
próprio de 5/min, é espaçado em `_respeitar_janela_historico`. A
sincronização automática usa poucas tentativas (não pode ficar
pendurada); carga longa aumenta.

**Carga de histórico**: `python sincronizar_periodo.py "Loja" DIAS [ATE]`
(ex: `90 60`, depois `60 30`...), mais devagar e com mais paciência no 429.
Reprocessar dia já sincronizado é seguro (o dia é regravado inteiro).

**Liga/desliga e data de corte da baixa** (`baixa_automatica_loja`,
`inicio_baixa_automatica`). Desde 2026-09-10 é a Julia quem liga e desliga
a baixa de cada loja, na tela: Estoque → aba da loja → card Integrações do
Estoque, "Ligar a partir de [data]" (hoje ou depois; o padrão é amanhã, pra
dar tempo de contar o estoque antes do primeiro pedido) e "Desligar", que
não devolve o que já foi descontado. Rota `GET/PUT
/api/estoque/baixa-automatica` (PUT só admin, recusa data passada). O
Artesanos entrou ligado desde 2026-09-08 (Etapa 0); o Açaí ia ligar em
11/09 e ela pediu pra esperar a ficha técnica ficar 100% — está desligado,
e o card aparece em toda loja pra mostrar o que ainda não casou antes de
ligar. Venda anterior ao dia de início nunca desconta estoque, venha a
sincronização de onde vier —
antes dessa trava, carregar histórico ou ressincronizar um dia antigo pela
tela descontava meses de consumo do estoque de hoje. Atenção: na primeira
madrugada depois da baixa entrar, a reconferência de 7 dias pode ter
descontado a semana anterior de uma vez; uma contagem depois disso zera o
efeito.

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
| `usuario` | Login da equipe — `senha_hash` (nunca texto puro), `papel` (`admin`/`gerente`/`operacao`), `loja` (NULL = a rede toda), `ativo` |
| `registro_acao` | Quem fez o quê (ver 8.4) — `criado_em`, `usuario_id`/`usuario_nome`, `papel`, `loja`, `metodo`, `rota`, `caminho`, `status`, `descricao`, `detalhes` |
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

**Campo de faturamento aceita formato brasileiro** (corrigido em
2026-09-03, pedido da Julia: o campo era um `<input type="number">`
puro, que só aceita ponto decimal e nem deixa digitar vírgula — ela
tentou digitar "2.588,36" e não conseguiu). Virou `<input type="text"
inputmode="decimal">` com a mesma máscara fluida de moeda já usada no
campo "presencial" do fechamento de caixa: cada dígito digitado entra
como centavo e o campo se formata sozinho (ponto de milhar, vírgula
decimal) enquanto digita. Ao abrir o modal, o valor atual também aparece
já formatado (`_formatarMoedaBR`); ao salvar, desfaz a formatação
(remove ponto de milhar, troca vírgula por ponto) antes de mandar pro
backend — que continua recebendo exatamente o mesmo formato de sempre
(`float` simples), sem mudança nenhuma na rota `PUT /api/ajuste-canal`.

**`/api/faturamento-mesmo-dia-semana` não aplicava o ajuste manual**
(corrigido em 2026-09-03, achado pela Julia direto no relatório do
WhatsApp: o dia 05/08 da Hamburgueria Artesanos aparecia como
R$ 262.555,62 na lista de comparação, contra R$ 6.307,98 de verdade —
o mesmo valor que a tela de Insights sempre mostrou certo pra esse dia).
Causa: essa rota (única consumidora de `faturamento_diario` que nunca
tinha sido revisada desde que o ajuste manual de canal existe, seção
acima) montava `linhas` só com `_aplicar_presencial`, sem passar por
`_aplicar_ajustes_canal` como toda a Home e Insights já fazem — então um
dia com ajuste ativo aparecia com o valor bruto errado só nessa lista de
comparação/status do WhatsApp, nunca no resto do sistema. Corrigido
buscando `_linhas_canais_com_presencial` + `buscar_ajustes_canal_periodo`
da mesma janela e aplicando `_aplicar_ajustes_canal` antes de filtrar por
dia da semana — mesmo padrão de sempre, só faltava chamar. Confirmado com
teste sintético (ajuste de canal propagando o delta certo pro total do
dia) que o mecanismo funciona igual ao do resto do sistema.

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
- **Juntar insumo repetido** (`POST /api/insumos/<id>/mesclar`, admin,
  `{destinoId, fator, loja}`; `mesclar_insumo` em
  `backend/armazenamento.py`, 2026-09-15): pro mesmo produto cadastrado
  duas vezes (a ficha do Artesanos usava o cadastro da planilha, em g, e a
  loja contava o de compra, em kg — a baixa nunca mexia no estoque
  contado). `fator` = quantas unidades da origem cabem em 1 do destino.
  Na loja (e nas que dividem a ficha com ela), a ficha passa pro destino
  com a quantidade convertida, o histórico da baixa (`baixa_estoque_venda`)
  vai junto convertido — senão a ressincronização dos últimos 7 dias
  descontaria a semana de novo do destino — e o estoque "fantasma" da
  origem sai; a receita das misturas troca na rede toda; o custo do
  cadastro vai pro destino se ele não tiver. A origem só é apagada quando
  não sobra em nenhuma ficha, receita, compra ou contagem. Mistura feita
  na casa não pode ser origem.
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

**Valor em estoque** (2026-09-15, pedido do chefe da Julia, com base num
print do sistema "Gerenciar"): 5º card do resumo, **só admin** (é quem
recebe custo em `GET /api/insumos`). Soma quantidade atual × `custoEmUso`
de cada insumo, o mesmo custo do CMV (`custo_em_uso_por_insumo`: última
compra recebida > cotação > custo do cadastro; mistura usa a receita).
Estoque negativo conta como zero, e a Visão Geral soma loja por loja, pra
um negativo numa loja não descontar o estoque de outra. Insumo com estoque
e sem custo nenhum fica de fora e aparece contado embaixo do valor ("3
itens sem custo ficaram de fora"). Acompanha a busca, igual aos outros
cards. Conta no navegador (`_renderValorEmEstoque` no `script.js`), sem
rota nova. Layout: lado a lado com as 4 contagens (pedido da Julia), numa
5ª coluna um pouco mais larga; o número diminui junto com o card
(container query) em vez de vazar, e os números dos 5 cards ficam
alinhados no pé mesmo quando "ITENS CADASTRADOS" quebra em duas linhas.
No celular (2x2), o valor ocupa a linha de baixo inteira.

**Cards de nível viram filtro** (2026-09-17, pedido da Julia): clicar em
"Em nível ideal", "Estoque baixo" ou "Nível crítico" deixa na tabela só os
insumos daquele status, marca o card com a borda na cor do nível, põe "só
em nível ideal · mostrar todos" no subtítulo da tabela e rola até ela.
Clicar de novo no card, em "Itens cadastrados" ou em "mostrar todos" limpa
o filtro. Os números dos cards e o valor em estoque continuam contando
tudo (acompanham a busca e a loja, não o filtro). Estado em
`estoqueFiltroStatus` no `script.js`; os cards são `role="button"` com
teclado (Enter/Espaço). O hover dos cards (sobe 2px, borda e sombra) vale
pra todo `.store-card`/`.metric-card` do sistema, em `theme.css`, só em
aparelho com mouse.

**Filtro por categoria** (2026-09-17, card #31 do ClickUp): um seletor do lado
da busca, em "Itens em estoque", com as categorias da aba aberta e quantos
insumos cada uma tem ("Hortfruti (7)"). Como a busca, vale pros cards e pra
tabela; o filtro de nível dos cards continua valendo só pra tabela, dentro
da categoria escolhida. Trocar de loja mantém a categoria se ela existir na
outra aba. Opções montadas a cada render (`_atualizarOpcoesCategoriaEstoque`).

**Coluna Fornecedores** (2026-09-17, pedido dela com print da VMarket): em
"Itens em estoque", uma bolinha colorida por fornecedor ligado ao insumo, com
as iniciais dentro e o nome inteiro no hover — as MESMAS de
`_iniciaisFornecedor` / `_corAvatarFornecedor` usadas na grid de Cotações
(`.avatar.avatar-sm`, que por isso saiu de `cotacoes.css` pro `theme.css`). O
fornecedor homologado vem primeiro e ganha um anel na cor da marca; o "+" do
fim abre o cadastro do insumo, que é onde os fornecedores são marcados. A
busca da tela passou a achar pelo nome do fornecedor também ("sorocaba" lista
os insumos dele). Entram os fornecedores do cadastro do insumo E os que só
aparecem no histórico — quem cotou (`cotacao_preco`) ou quem vendeu
(`pedido_compra_item`), que é o caso dos 2.635 pedidos importados da VMarket:
o cadastro (`insumo_fornecedor`) só ganha linha automática quando vem preço de
cotação, então quem só vendeu ficava de fora (`mapa_fornecedores_do_historico`
→ campo `fornecedoresDoHistorico`, separado de `fornecedorIds` pra não sujar o
que a tela de editar insumo grava). Insumo muito cotado chega a 22
fornecedores (Ketchup Cepera Galão), o que esticava a linha da tabela pra 273
px: a célula mostra as 12 primeiras bolinhas e junta o resto num "+N", que ao
ser clicado abre a lista inteira (nome, telefone e a marcação de homologado ou
"já cotou ou vendeu"), com um atalho pro cadastro do insumo. **A tabela não tem
mais rolagem lateral** na tela dela (1366 px com o menu aberto): o espaçamento
das células caiu de 24 px pra 12 px de cada lado, o cabeçalho e a categoria
podem quebrar em duas linhas, e abaixo de 1400 px a tabela usa fonte e bolinha
um ponto menores (tudo em `#estoque-tabela-scroll`, estoque.css) — nenhuma
coluna foi escondida. Os nomes vêm de uma chamada só a `/api/fornecedores` na
primeira montagem da tabela; quem não é admin nem gerente não recebe a lista
(403) e a coluna simplesmente não aparece. As iniciais ignoram o CNPJ que veio
grudado no nome na carga da VMarket ("43.118.957 GUILHERME NUNES" vira GN) e
ligamentos de razão social.

**Filtro "Sem fornecedor"** (card #41, 2026-09-18): ao lado do filtro de
categoria, "Todos os fornecedores / Sem fornecedor (N)" deixa na tabela só o
insumo que ninguém cota — nem pelo cadastro, nem pelo histórico, ou seja, a
coluna Fornecedores vazia. É o insumo que o link de cotação manda pra todos os
fornecedores (6.8); com o filtro dá pra ir um a um pelo "+" da coluna ligando
quem fornece, e a linha some da lista quando ganha fornecedor. O N conta a
loja e a categoria escolhidas, e o filtro vale pros cartões também, como a
categoria. Aparece só junto com a coluna (admin e gerente).

**Tela redesenhada** (2026-09-18, pedido dela): a mesma informação em menos
altura, nada saiu. O seletor de loja subiu pro lado do título; a saúde do
estoque virou um fio fino (rótulo, barra e % em nível ideal numa linha) logo
acima dos 5 indicadores, que ficam numa linha só e mais baixos (o de nível
crítico ganha tom de alerta quando tem insumo); Lotes vencendo e Datas
especiais viraram abas de um bloco só, com contador (laranja com lote
vencendo, vermelho com lote vencido) e, vazias, uma linha de aviso sem
cabeçalho de tabela; a aba de datas e o botão "Nova data especial" seguem
só pra admin. Na tabela, linha mais baixa (8 px em cima e embaixo), categoria
com cor pastel própria (a cor sai do nome, `_corDaCategoria`, igual em toda
loja), quantidade negativa em vermelho e a coluna "Mínimo e compra": barra,
mínimo e ideal numa linha e "Comprar X" em vermelho discreto. Estilos no fim
de `estoque.css`, com `body.pagina-estoque`.

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

**Exceção: as duas Tradiças dividem a ficha** (2026-09-14, pedido da
Julia — vendem as mesmas coisas). `GRUPOS_FICHA_COMPARTILHADA` em
`armazenamento.py`: a ficha continua gravada linha a linha por loja (a
baixa, o custo e o consumo médio leem a da própria loja), mas
`definir_ficha_tecnica` grava a mesma lista nas duas, e o título do
editor diz "Tradiça ZN e Tradiça Simus". Na subida, `inicializar_banco`
copia pra outra loja a ficha de item que só uma delas tinha (em produção,
só a ZN tinha; o Simus estava vazio) — item com ficha nas duas não é
tocado. Estoque, preço e custo digitado à mão continuam por loja.

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

**Renomear e Tirar do cardápio** (2026-09-14, pedido da Julia; os dois
pedem confirmação antes de mudar qualquer coisa, só admin):
- **Renomear**: no modal do produto, o próprio título é um campo pra
  admin (o lápis ao lado só põe o cursor nele), salvo junto com preço e
  custo no Salvar do modal — sem janela do navegador, a pedido da Julia;
  a ajuda embaixo do título diz o que muda assim que o nome é alterado, e
  um nome recusado aparece ali mesmo, sem salvar o resto. No complemento,
  o lápis abre o mesmo campo na linha (Enter salva, Esc desiste). Com item
  do cardápio, `PUT /api/itens-cardapio/<id>/nome` (`renomear_item_cardapio`)
  troca o nome do item e das linhas de `preco_cardapio` que casavam com
  ele em todas as lojas, e grava o nome antigo como vínculo manual pro
  mesmo item. É isso que mantém a venda reconhecida: ela chega da Cardápio
  Web com o nome cadastrado lá, e enquanto lá estiver o antigo, o vínculo
  casa. Vínculo já existente pra esse nome não é trocado. Loja que já tem
  outro produto com o nome novo mantém o antigo (índice único loja+produto)
  e o aviso diz qual. Produto sem item (sem ficha) muda só naquela loja:
  `PUT /api/precos-cardapio/<id>/nome`. Nome já usado por outro item é
  recusado. Cuidado: reimportar a planilha de preços com o nome antigo
  traz a linha antiga de volta.
- **Tirar do cardápio desta loja** (modal do produto):
  `DELETE /api/precos-cardapio/<id>` (`remover_produto_do_cardapio`) apaga só
  a linha de preço daquela loja (preços e foto). O item e a ficha técnica
  ficam: se o produto voltar com o mesmo nome, a ficha volta junto, e se
  ainda for vendido, a baixa continua certa. As outras lojas não mudam.
  O "Excluir item" antigo (painel do complemento) continua apagando o item
  e a ficha em todas as lojas.

**Bebida fora dessa tela** (concluído em 2026-09-02, pedido da Julia —
bebida é produto pronto comprado assim, não tem receita/ficha técnica de
verdade). `listar_produtos_por_loja` filtra fora qualquer produto cuja
categoria seja exatamente "Bebidas" (normalizado, então bate com
qualquer combinação de acento/caixa) — **match exato, não substring**,
de propósito: um combo como "Lanche + Batata + Bebida + Maionese" cita
"bebida" no nome da categoria mas é comida, não pode ser pego junto.
Só essa lista muda — "Preços" continua mostrando bebida normalmente,
já que lá o que importa é preço de venda, não receita.
**Voltou em 2026-09-17** (card #34 do ClickUp): a ficha da bebida é o que
desconta a lata ou a garrafa do estoque, e a Julia quer ver e editar. O
filtro saiu. Pra bebida com nome diferente na lista de preços ("Coca-Cola
350ml" na Tradiça, item "Coca-Cola Original 350ml"), `listar_produtos_por_loja`
usa o vínculo manual da fila de pendências (só os de 1 pra 1) quando o nome
não casa com item nenhum.

**ClickUp: card particular e checklist na criação** (2026-09-11). A Julia
cadastra as pendências dela no ClickUp pelo "+ Nova Tarefa", que ganhou:
checklist já na criação (um item por linha, vira subtarefa), categoria
"Ficha técnica", data limite opcional e "Só eu vejo este card" — a tabela
`tarefa` ganhou `visivel_para` (id do usuário; NULL = equipe toda). Card
particular não aparece pra mais ninguém, e editar/apagar/comentar nele por
outra pessoa responde 404; no quadro ele mostra "só você" e o progresso da
checklist. Antes disso, no mesmo dia, as pendências chegaram a ser geradas
sozinhas (uma lista "O que falta" no Cardápio e depois cards automáticos
no ClickUp); ela preferiu cadastrar à mão, e esse código saiu. Ficou
`_recasar_vendas_sem_item`: venda gravada antes de o item existir casa de
novo com o catálogo de hoje antes de listar a fila de pendências do
Estoque (antes só casava quando o dia era sincronizado outra vez, e a
reconferência só volta 7 dias).

**Nome curto da venda casa com o item de nome longo** (2026-09-11). Em
produção os itens de cardápio têm o nome da lista de preços ("Clássico -
Cheese Salada", "Veg (vegetariano)", "Creme de Avelã - Dorella") e a
Cardápio Web vende o curto ("CLASSICO", "Veg", "Creme de Avelã"): desde
08/09 as vendas dos lanches do Artesanos não casavam com a ficha e não
descontavam estoque. `_com_apelidos` põe no catálogo o nome antes do " - "
e o nome sem o parêntese do fim, só quando aponta pra um item só — e
separado por tipo, pra um adicional "Bacon" nunca virar o lanche BACON.
`_casar_item_cardapio` passou a tentar também o que vem depois do " - "
("Hot Dog com Bacon - Beicão" → Beicão) e a parte antes do " + " (combo
gravado antes do corte na leitura do pedido; o "monte o seu" do Açaí não
entra). As vendas antigas casam de novo por `_recasar_vendas_sem_item` e
pela reconferência de 7 dias, que recalcula a baixa desses dias.

**Combo do Açaí fora dessa tela** (2026-09-10, pedido da Julia). A
categoria de combo ("COMBOS NALATA": Família 4 × 330 ml e Filhinho/
Filminho 2 × 500 ml) sai da lista do Açaí (`LOJAS_SEM_COMBO_NO_CARDAPIO`
em `armazenamento.py`). Combo não tem ficha própria: a venda desconta os
copos de dentro pela composição (`composicao_produto_venda`, seção 6.11) e
os complementos escolhidos no pedido (6.15). Na lista, era produto "sem
ficha" sem nada pra preencher. O preço continua gravado e a venda continua
contando. Os combos do Artesanos continuam na lista.

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

**Tela redesenhada** (2026-09-18, pedido dela): busca e "Cadastrar
fornecedor" no topo, ao lado do título; quatro indicadores que dizem coisas
diferentes (total, ativos e inativos, categorias mapeadas com as duas que mais
têm fornecedor, e entregas a receber — pedidos enviados que não chegaram, com
as atrasadas, a mesma conta dos números do menu; o cartão leva a
Recebimentos); e a tabela com uma linha por fornecedor: CNPJ embaixo do nome,
lojas atendidas em etiquetas curtas (no máximo duas e "+N", ou "Todas as
lojas"), categoria com a cor pastel do nome (a mesma de Insumos, agora em
`theme.css`), contato com o telefone embaixo (o e-mail vai no título e nos
detalhes), condições comerciais numa célula (pagamento, mínimo, entrega) e
ações Ver detalhes / Editar / Ativar-desativar. "Ver detalhes" abre o cadastro
inteiro só pra leitura, com o telefone abrindo no WhatsApp. A busca acha por
nome, CNPJ, categoria, contato e loja.

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

**Quem recebe o quê (regra atual, 2026-09-17 — "pode fazer igual a
VMarket"):** cada fornecedor marcado recebe **os insumos que ele fornece**
— **o cadastro manda**: se o insumo tem fornecedor marcado em
`insumo_fornecedor` (o que ela edita pelo "+" da coluna Fornecedores), vai só
pra eles; o histórico de quem já cotou ou já vendeu só vale nos insumos que
ninguém marcou. Sem isso, tirar um fornecedor da lista não adiantaria nada,
porque o histórico o convidaria do mesmo jeito. Somam-se a isso **os insumos
que não têm fornecedor nenhum**,
que vão pra todo mundo pra não ficarem sem preço. **Fornecedor que ainda
não é ligado a insumo nenhum** (novo, ou o de teste dela) **recebe a cotação
inteira** (2026-09-18, pedido dela: antes ficava sem convite); depois que ele
responde, o histórico liga ele aos insumos que cotou e as próximas vêm só
com esses. Fornecedor ligado a outros insumos, mas a nenhum dessa cotação, e
sem órfão pra cotar, não recebe convite, e a tela diz o nome dele (a prévia
marca `recebeTudo` e mostra "a cotação inteira" no fornecedor novo). A resposta traz `totalInsumos` por convite, que o
aviso da tela mostra ("Forn A (7), Forn B (3)").
`_insumos_da_cotacao_por_fornecedor` monta esse mapa e `_quem_cota_o_que` é
a base compartilhada com a prévia.

**Prévia do convite** (2026-09-17): antes de gerar, o modal "Convidar
fornecedores" mostra quem recebe link e o que vai dentro — cada fornecedor com
a contagem de itens e a lista aberta num `<details>`, quem já tem convite e
quem fica de fora por não fornecer nada, mais quantos insumos órfãos vão pra
todos. Atualiza quando as caixas mudam (vem numa chamada só e é filtrada no
navegador). `GET /api/cotacoes/<id>/convites/previa` (`previa_convites_cotacao`,
admin e gerente) é **só leitura**, não cria convite nem token, e sai da mesma
função que o convite de verdade pra não divergir. Motivo: link de cotação
errado só se descobre depois que o fornecedor responde.

Teste em `teste_convite_por_fornecedor.py` (scratchpad), 24 checagens,
incluindo "o que a prévia prometeu é o que o convite mandou".

*Regra anterior, substituída:* de 2026-08-27 até 2026-09-17, decisão de
escopo do Guilherme depois de ver o link real da VMarket
(`cotacao.vmarket.com.br/preencher/...`), o sistema **não** tentava
adivinhar quem cota o quê: mandava pra todo fornecedor ativo a mesma lista,
só com os insumos sem nenhum fornecedor vinculado, e o resto era cotado na
mão. Com o histórico da VMarket importado, 182 dos 287 insumos passaram a
ter fornecedor vinculado e sobrava quase nada pro link — daí a volta pro
formato da VMarket. Dentro do
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

**Redesenho da lista (2026-09-21, pedido dela).** Topo enxuto: só o título
"Cotações", a frase de apoio e o "+ Nova cotação" à direita, com as abas
Cotações/Compras logo abaixo (a aba Compras perdeu o título próprio); o
topo some enquanto uma cotação está aberta. Embaixo, lado a lado (60/40), o
gráfico de **economia acumulada** (12 semanas de terça a segunda, 6 ou 12
meses) e quatro indicadores: cotações abertas (o clique filtra a tabela),
economia do mês, fornecedores participantes e taxa de resposta média — os
dois últimos olhando os últimos 30 dias. A economia é a mesma coluna
"Economia" da tabela (maior preço comparável menos o vencedor, vezes a
quantidade) e só conta cotação fechada ou que já gerou pedido, quando a
compra está decidida. A taxa de resposta é ponderada pelos convites
(respondidos ÷ enviados), não a média das porcentagens. `GET /api/cotacoes`
passou a devolver `origem` (`vmarket` com `id_vmarket`, `requisicao` com
`requisicao_titulo`, senão `manual`), `fornecedorIds` (quem mandou preço) e
`convitesTotal`/`convitesRespondidos`; o filtro Tipo ganhou "VMarket" e
"Requisição" deixou de incluir as importadas. Na tabela: etiqueta de origem
embaixo do título (que também abre a cotação), barra de respostas verde a
partir de 60%, "Produtos / Comprados" na ordem do cabeçalho (antes saía
invertido), economia maior que zero em verde e valores alinhados à direita.

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

**"Atualizar estoque em lote"** (concluído em 2026-09-04, pedido da Julia
pra trazer a quantidade atual em estoque (QE) de um relatório externo —
no caso, um export da VMarket — de uma vez, em vez de editar insumo por
insumo pelo "Editar estoque"). Espelha exatamente o "Ajustar em lote" da
quantidade ideal (mesmo botão "Colar lista", mesmo `_normalizarNomeInsumo`,
mesma regra de match exato-após-normalizar ou "não encontrado" pra
conferir na mão — nunca aproximação), só que grava em
`estoque_insumo.quantidade_atual` em vez de `ajuste_quantidade_ideal`.
Botão novo "Atualizar estoque em lote" ao lado do "Ajustar em lote" na
tela de Estoque (mesma visibilidade: só admin, só numa aba de loja
específica). `salvar_quantidades_atuais_em_lote(loja, valores)`
(armazenamento.py) e rota `POST /api/insumos/quantidades-atuais/lote`
(admin) espelham `salvar_ajustes_quantidade_ideal_em_lote`/`/lote`
ponto a ponto. Sobrescreve o valor (não soma, ao contrário de "Registrar
entrada") — pensado pra importar uma contagem/relatório de fora que já é
o valor final, não um recebimento.

Ganhou também a coluna **"Novo mínimo"** (2026-09-04, mesma leva) quando
a Julia mandou a planilha do Açaí Na Lata, que traz estoque atual e
quantidade mínima lado a lado. O "Colar lista" aceita as duas formas:
`nome;atual` (só o estoque, como antes) ou `nome;atual;mínimo` (os dois
de uma vez) — decide pelo número de campos numéricos no fim da linha. No
backend, `minimos` é opcional em `salvar_quantidades_atuais_em_lote`/
`POST /api/insumos/quantidades-atuais/lote`: insumo sem mínimo na lista
tem só a quantidade atual tocada, e a coluna `estoque_minimo` fica como
estava.

**"Colar lista" no "Insumos da loja"** (concluído em 2026-09-04, mesma
leva do import da VMarket). Terceira "colar lista" da tela de Estoque, e
a única que **substitui** em vez de preencher: cola um nome por linha, e
o modal marca só esses insumos e **desmarca todo o resto** — é assim que
dá pra montar a lista de uma loja a partir de uma fonte externa sem
clicar em ~200 checkboxes um por um. Mesmo `_normalizarNomeInsumo` e
mesmo match exato-após-normalizar das outras duas (nome que não bate vai
pra "não encontrado", nunca aproximação). Se nenhum nome da lista bater,
não mexe em nada (evita desmarcar a loja inteira por causa de uma lista
colada errada).

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
roda a partir do botão "Gerar pedidos" na tela de Cotações — é uma etapa
manual, separada de marcar o vencedor por insumo (pergunta 23: ela não
quer isso automático). Considera só insumo com preço `selecionado`; quem
ainda não tem vencedor fica de fora (avisa quantos, não é erro — dá pra
clicar "Gerar pedidos" de novo depois que marcar mais vencedores, sem
duplicar pedido de quem já foi pra evitar comprar em dobro).

**Nota (2026-09-03, respondendo "como eu faço pra gerar o pedido"):** o
botão "Gerar pedidos" aparece sempre que a cotação tem `itens` — e desde
que a cotação manual passou a nascer com o catálogo completo (seção
6.8), **toda** cotação manual tem `itens`, não só as vindas de
Requisição. Mas `gerar_pedidos_de_cotacao` só cria pedido de verdade pra
quem tem quebra por loja em `cotacao_item_loja`, que **só existe numa
cotação gerada a partir de uma Requisição** — clicar "Gerar pedidos"
numa cotação manual não dá erro, só não cria pedido nenhum (0 pedidos,
silenciosamente), porque não tem como saber pra qual loja mandar. Ainda
não decidido como resolver (cotação manual não tem loja nenhuma
associada hoje) — opções levantadas: pedir a loja já no "Nova cotação",
ou por linha na grid.

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
(admin), `DELETE /api/pedidos/<id>` (admin, cancela). Compra feita por
fora (6.22) não avança nem volta etapa, e excluir ela desfaz o que somou no
estoque.

**Recebimentos** (concluída em 2026-09-01, pedido da Julia/Guilherme —
fecha de vez o ciclo Requisição → Contagem → Cotação → Pedido →
**Entrada em estoque**, que antes dependia de "Registrar entrada" manual,
solto, sem ligação nenhuma com o pedido de verdade). Tela nova
(`recebimentos.html`), primeira do fluxo de Compras **liberada pra
qualquer pessoa logada, não só admin** — pensada pra ser a primeira função
de verdade que a equipe (hoje papel "operacao", ver 8.0) vai ter acesso, sem precisar de
conta admin só pra confirmar que uma entrega chegou.

A tabela mostra a data em que o pedido foi feito (coluna "Pedido em",
também entra na busca). Depois de recebido, o registro aparece em Pedidos:
"em DD/MM/AAAA" embaixo do status e "Recebido em ... por ..." no detalhe
(`recebidoEm`/`recebidoPor` em `GET /api/pedidos` e `/api/pedidos/<id>`).

Busca (por fornecedor, valor ou produto — via `itens_nomes`, concatenado
com `GROUP_CONCAT` em `listar_pedidos_pendentes_recebimento`, pra não
precisar de endpoint de busca à parte) entre pedidos ainda não
`recebido`. Ao confirmar: o colaborador digita o **nome de quem recebeu**
e a **data do recebimento** (2026-09-16: a loja confirma dias depois da
entrega; vem hoje preenchido, não aceita antes do dia do pedido nem depois
de hoje; grava `recebido_em` com o dia escolhido e a hora da confirmação)
e pode **corrigir quantidade e preço por item**
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

**"Fazer Cotação/Pedido" travado depois de aprovar** (corrigido em
2026-09-02, bug encontrado pela Julia testando o fluxo de Compras ao
vivo com a Kethllyn). O botão no detalhe de uma loja (`btn-contagem-aprovar`)
ficava **desabilitado** assim que a contagem já estava `aprovada` — não
sobrava nenhum caminho, a partir dessa tela, pra chegar na cotação já
gerada (só voltando pra lista de Requisições e abrindo a "Ver conferência
somada" → "Gerar cotação", que já funcionava por ser idempotente).
Agora o botão só fica desabilitado com status `aberta` (não `respondida`
nem `aprovada`), troca o texto pra **"Ver Cotação/Pedido"** quando já
aprovada, e o clique pula a chamada de aprovar (que dava erro "Essa
contagem já foi aprovada") indo direto checar se a requisição tá
totalmente aprovada e abrir a cotação — mesma rota
`gerar_cotacao_do_deficit` de sempre, que devolve a cotação existente em
vez de duplicar.

**Insumos a comprar escondidos até o primeiro preço lançado** (corrigido
em 2026-09-02, mesma sessão de teste com a Kethllyn — a Julia pediu que,
ao gerar a cotação, já aparecesse "todos os insumos que precisamos
comprar" na tela). `GET /api/cotacoes/<id>` sempre devolveu os dois:
`grupos` (agrupado por `cotacao_preco` — só insumo que já tem preço
lançado, de fornecedor ou manual) e `itens` (o déficit calculado da
Requisição, com quantidade, sempre presente). O problema era só no
front: `_renderTabelaComparacaoCotacao` (script.js) ignorava `itens`
por completo e mostrava só "Nenhum preço lançado ainda — use o
formulário acima" sempre que `grupos` vinha vazio — escondendo a lista
de compra numa cotação **recém-gerada**, que é exatamente quando não
tem preço nenhum ainda. Agora, nesse caso (`grupos` vazio mas `itens`
não), mostra uma tabela simples Insumo/Comprar com o déficit calculado;
assim que o primeiro preço for lançado (manual ou por um fornecedor
convidado), a tela volta a mostrar a grid de comparação normal. Não
mexeu em nada do backend nem do cálculo — só parou de esconder um dado
que a rota já devolvia.

**"Comparativo de Preços" — aba, depois página própria, depois removida**
(3 formatos em 3 dias, todos a pedido da Julia, até ela decidir em
2026-09-04 que não precisava mais — a lista de Cotações passou a cobrir
o mesmo caso, ver subseção abaixo). Passou por: aba dentro de
`cotacoes.html` (2026-09-02) → página própria `comparativo-precos.html`
no menu, abrindo direto na grid do comparativo manual mais recente sem
passar por lista (2026-09-03) → removida de vez (2026-09-04, arquivo e
link de menu apagados das 13 sidebars). O campo `cotacao.manual` (`GET
/api/cotacoes`, calculado de `requisicao_titulo IS NULL`) que essa
página usava pra achar o comparativo certo continua na API — passou a
alimentar o filtro "Tipo" da lista de Cotações em vez disso.

**Cotação manual nasce com o catálogo inteiro, estilo VMarket**
(concluída em 2026-09-03, pedido da Julia depois de mostrar um print da
tela de comparativo da VMarket — planilha com todo insumo já na linha,
sem depender de Requisição nenhuma, e um botão "Selecionar os melhores
preços" que marca vencedor sozinho). Cotação manual (`POST
/api/cotacoes`, botão "Nova cotação") já não dependia de Requisição, mas
nascia **vazia** — só ganhava linha quando alguém lançava o primeiro
preço. Agora, `GET /api/cotacoes/<id>` detecta cotação manual pela
mesma coluna que já existia pra evitar cotação duplicada
(`requisicao_titulo IS NULL` — só vem preenchida quando a cotação nasce
de `gerar_cotacao_do_deficit`, ver acima) e, nesse caso, `itens` passa a
listar **todo insumo do catálogo** (`listar_itens_cotacao_catalogo_completo`,
armazenamento.py) em vez de só quem já tem `cotacao_item`; a resposta
ganha `catalogoCompleto: true` avisando o front. Cotação vinda de
Requisição continua exatamente igual (`itens` = só o déficit), zero
mudança nesse caminho.

Na grid (`_renderTabelaComparacaoCotacao`, script.js), catálogo completo
usa `itens` como fonte das linhas (não só `grupos`, que só tem quem já
foi precificado) — assim insumo sem preço nenhum ainda aparece igual,
com "—" nas colunas de fornecedor. A coluna "Quantidade" vira um campo
numérico editável nesse modo (salva no `change`, mesmo padrão do custo
editável da Ficha Técnica) — `PUT /api/cotacoes/<id>/itens/<insumo_id>`
grava em `cotacao_item` via upsert
(`salvar_quantidade_item_cotacao`), então a cotação manual também
acumula `cotacao_item` aos poucos, só que preenchido na mão em vez de
calculado do déficit.

Botão novo **"Selecionar os melhores preços"** (ao lado de "Destacar
melhores preços", que já existia mas só pinta a célula sem marcar
vencedor de verdade) — `POST
/api/cotacoes/<id>/selecionar-melhores-precos` chama
`selecionar_melhores_precos_cotacao` (armazenamento.py), que pra cada
insumo com pelo menos um preço lançado nessa cotação reaproveita a mesma
`selecionar_preco_cotacao` de sempre no de menor valor — não duplica a
regra de "só um vencedor por insumo, por cotação". Só aparece quando já
existe pelo menos um preço lançado (senão não tem o que selecionar).

Ficou de fora dessa entrega, por decisão consciente de prazo (sistema de
Compras 100% até 2026-09-04, combinado com a Julia) — registrar como
pendência:
- "Não possui" persistido por fornecedor×insumo (like a VMarket) — hoje
  não existe **nenhum** registro de "fornecedor não vende esse insumo"
  em lugar nenhum (nem o "não vendo" do formulário público do
  fornecedor, que é só descartado, nunca gravado) — precisaria de
  schema novo, decidido não fazer às pressas.

**Paridade visual com a VMarket na grid** (concluída em 2026-09-04, print
trazido pela Julia). Cabeçalho de cada fornecedor ganhou avatar com cor
própria (`_corAvatarFornecedor`, paleta fixa de 8 cores por `fornecedorId
% 8` — determinística, não muda a cada render) e um ícone de WhatsApp
(`_linkWhatsAppContato`, `wa.me/<telefone>` sem mensagem pronta — é
contato direto pra tirar dúvida sobre o preço já lançado, diferente do
link de convite) — só aparece se o fornecedor tiver `contato_telefone`
cadastrado. Nova coluna **"Última Compra"**: preço, data e fornecedor do
pedido **recebido** mais recente desse insumo
(`buscar_ultima_compra_por_insumo`, armazenamento.py — lê
`pedido_compra_item`/`pedido_compra` com `status='recebido'`, valor já
corrigido no recebimento se tiver divergido do pedido original, não o
valor pedido). Novo filtro **"Seção"** (categoria, só aparece no catálogo
completo — numa cotação de Requisição a lista já é pequena, não
compensa) e **"Respondido"/"Não respondido"** (insumo com pelo menos um
preço lançado × sem nenhum) — ambos client-side, sem rota nova, filtram
`linhasFiltradas` junto da busca por nome já existente.

Removido nessa mesma leva, a pedido da Julia: botão **"Destacar melhores
preços"** — ela notou que fazia a mesma coisa que "Selecionar os
melhores preços" (uma só destacava visualmente sem gravar nada, a outra
marca o vencedor de verdade) e preferiu ficar só com a que tem efeito
real. O destaque do vencedor continua existindo (fundo verde + ícone de
check já ligados a `preco.selecionado`, não precisavam do toggle
removido pra nada).

**Lista de Cotações estilo VMarket** (concluída em 2026-09-04, depois de
ela mandar o link real de `.../cotacao/listar_cotacoes/` da VMarket
pedindo pra deixar a lista de Cotações igual). Adaptação, não cópia 1:1
— algumas colunas da VMarket não têm equivalente no nosso modelo (ex:
"Tempo Restante" pressupõe prazo por cotação, que não existe aqui; ela
não pediu explicitamente, então ficou de fora em vez de inventar um
prazo sem sentido) e outras viraram uma leitura nossa do mesmo conceito.

Colunas novas, todas calculadas em `listar_cotacoes()`
(armazenamento.py — reescrita pra fazer as contas em Python em vez de
SQL puro, porque "maior preço por insumo" e "quantidade por insumo"
vêm de tabelas diferentes e a junção certa em SQL exigiria subquery
correlacionada por linha; o volume de dados é pequeno o bastante pra
não importar):
- **Respostas** — % de convites respondidos sobre o total enviados
  pra essa cotação (barra de progresso, reaproveitando
  `.progress-container`/`.progress-bar` que já existia pro Estoque);
  "—" quando nunca teve convite nenhum.
- **Produtos / Comprados** — total de insumos com preço lançado / quantos
  já têm vencedor marcado (`selecionado=1` em pelo menos um preço).
- **Economia** — soma, por insumo com vencedor marcado, de (maior preço
  lançado − preço vencedor) × quantidade — quanto compensou comparar em
  vez de fechar com o primeiro preço.
- **Valor Pedido** — soma do preço vencedor × quantidade, por insumo com
  vencedor marcado.

Filtros novos, todos client-side (mesma lista já carregada, sem rota
nova): **Mostrar** (Todas/Abertas/Fechadas — versão simplificada do
"Ativos/Desativados" da VMarket, que tem mais estados que a gente
modela), **Tipo** (Todas/Manual/Requisição, usando o mesmo campo
`cotacao.manual` que a extinta página Comparativo de Preços usava),
**Busca** (por nome ou pelo número/id da cotação) e **Dias** (criada nos
últimos 7/15/30, ou Todos).

**Fornecedor sugerido por loja no convite** (2026-09-11, pedido da Julia:
o Açaí compra de 3 dos 70 fornecedores — Guilherme Nunes, PXT e
Riberfoods). Tabela `fornecedor_loja` (de quais lojas a gente compra
dele), marcada no cadastro do fornecedor ("Lojas que compram dele"). O
"Convidar fornecedores" lista os ativos com quem fornece pras lojas da
cotação (`lojas_da_cotacao`, de `cotacao_item_loja`; na cotação manual,
qualquer fornecedor com loja marcada) já marcado, e `POST
/api/cotacoes/<id>/convites` aceita `fornecedorIds` — só esses recebem
convite. Sem ninguém marcado pra loja, a tela marca todos os ativos, e sem
`fornecedorIds` o backend convida todos, como antes.

**Convite de fornecedor direto pro WhatsApp** (concluído em 2026-09-03,
pedido da Julia: "clico um botão e já envia os links pros fornecedores").
Sem a API oficial do WhatsApp Business (pendência 2 da seção 9, travada
esperando credencial), não existe jeito de mandar mensagem **sem
nenhum toque humano** — é assim que o próprio WhatsApp evita automação
de spam. O mais próximo disso hoje: `wa.me/<telefone>?text=<mensagem>`
já abre o WhatsApp (Web ou app) com a mensagem e o link do convite
prontos, faltando só apertar "Enviar". `listar_convites_cotacao`
(armazenamento.py) passou a trazer `fornecedor.contato_telefone` junto
(já existia no cadastro de fornecedor, só não tinha plumbing até aqui);
`_linkWhatsAppConvite` (script.js) normaliza o telefone (tira tudo que
não é dígito, garante o "55" na frente) e monta o link.

Botão **"Convidar fornecedores por WhatsApp"** (era só "Convidar
fornecedores") continua gerando os convites normalmente, mas agora
também abre uma aba do WhatsApp pra **cada fornecedor ainda aguardando
resposta** — não só os recém-criados agora, os que já estavam pendentes
de um convite anterior também recebem a aba (reenvio de lembrete de
graça). Fornecedor sem telefone cadastrado fica de fora do disparo em
lote (avisado por alerta com o nome) e continua com "Copiar link" na
tabela, único caso em que essa opção ainda aparece — pra quem tem
telefone, "Copiar link" virou "Enviar por WhatsApp" direto na linha.
Testado com harness estático (3 fornecedores: com telefone, sem
telefone, já respondido) — confirmado que o disparo em lote abre só a
aba de quem tem telefone e está pendente, e que o link de cada aba bate
exatamente com token+telefone certos.

**Card "Lançar preço recebido" virou botão + modal, grid reorganizada**
(concluída em 2026-09-03, pedido da Julia depois de mostrar 2 prints:
o card fixo ocupando espaço permanente na tela, e a grid com layout
quebrado numa cotação manual recém-criada sem nenhum preço lançado
ainda). Duas mudanças:

- O card `Lançar preço recebido` (sempre visível, com Insumo/Fornecedor/
  Preço) virou o botão **"Lançar preço"** no cabeçalho do card
  "Comparativo de preços", que abre o modal `modal-lancar-preco-cotacao`
  com o mesmo formulário (`#form-cotacao-preco`, mesmos ids de campo —
  zero mudança no submit/backend). Fecha sozinho ao adicionar com
  sucesso. Só aparece pra admin com a cotação aberta (mesma regra que já
  controlava a visibilidade do card).
- Os filtros da grid (Respondido/Não respondido, Seção, Busca) saíram de
  dentro do `.action-controls` (que dividia espaço com o título "Comparativo
  de preços" e por isso empilhava cada filtro numa linha própria, feio e
  gastando altura à toa) e ganharam linha própria (`.cotacoes-filtros-row`,
  reaproveitando a mesma classe da lista de Cotações). `.action-controls`
  agora só tem os 2 botões (Lançar preço, Selecionar os melhores preços).
- A coluna **"Última Compra"** esticava até preencher o card inteiro
  (ficava um cabeçalho enorme e vazio) sempre que a cotação ainda não
  tinha nenhuma coluna de fornecedor pra "sobrar" — o `table { width:
  100% }` global (`theme.css`) força a coluna sem largura fixa a crescer
  pra preencher o espaço. Corrigido dando `width: 180px` fixo pra
  `.th-ultima-compra`/`.td-ultima-compra` e `width: auto` pra
  `.tabela-comparacao-cotacao` — a tabela agora só ocupa a largura real
  do conteúdo (poucas colunas = tabela estreita, sobra espaço em branco
  no card em vez de esticar; muitas colunas de fornecedor = mesma
  rolagem horizontal de sempre via `.table-responsive`).

Testado com harness estático (3 insumos, 2 fornecedores, 1 com telefone
e 1 sem) nos dois cenários — cotação sem preço nenhum e com preço já
lançado — confirmando visualmente que a grid não quebra mais em nenhum
dos dois, e via DOM (`getBoundingClientRect`) que a coluna Última Compra
fica travada em 180px mesmo com fornecedor lançando preço do lado, e que
os filtros (Respondido, Seção, Busca) continuam filtrando certo depois
da mudança de layout.

**"Gerar pedidos" já manda o pedido pro fornecedor confirmar, via WhatsApp**
(concluída em 2026-09-03, pedido da Julia depois de mandar o texto exato
de um pedido real que ela fez pela VMarket, pra replicar formato e dado).
Antes, "Gerar pedidos" só criava os registros internos (`pedido_compra`);
avisar o fornecedor era manual, fora do sistema. Agora, depois de criar
os pedidos, o backend também monta o texto pronto pra WhatsApp e devolve
pro front, que abre uma aba `wa.me` por fornecedor (mesmo padrão
semi-automático do convite de cotação — falta só apertar "Enviar", sem a
API oficial não tem como pular esse toque).

Pedidos da mesma leva de "Gerar pedidos" pro **mesmo fornecedor** (pode
acontecer de ganhar insumo em mais de uma loja de uma vez) viram **uma
mensagem só**, com um bloco por loja — "Esse pedido foi feito em
conjunto", igual o texto real que ela mandou. Cada `pedido_compra` ganhou
uma coluna `token` (mesmo padrão de link-sem-login já usado em
`contagem`/`cotacao_convite`); pedidos do mesmo fornecedor na mesma leva
compartilham o mesmo token, criado em `gerar_pedidos_de_cotacao`
(armazenamento.py). `_montar_mensagens_whatsapp_pedidos` (app.py) agrupa
por token e monta o texto; `_texto_bloco_loja_pedido` monta o bloco de
uma loja (Nome Fantasia/Razão Social/CNPJ — de `config.LOJAS`, "Não
informado" quando a loja ainda não tem esse dado cadastrado — mais "OC"
= o próprio id do `pedido_compra`, sem correspondência com a numeração da
VMarket, e a lista de produtos). Valor em R$ usa o `_formatar_moeda` que
já existia; quantidade usa `_fmt_quantidade_pedido` **sem** formatação
brasileira (número cru, tipo "998.2") — reflete exatamente o print real
que ela mandou, onde quantidade e valor têm formatos diferentes.

`config.LOJAS` ganhou `nome_fantasia`/`razao_social`/`cnpj` por loja —
Artesanos, Tradiça ZN ("Tradiça Dog" — nome fantasia diferente do nome
interno) e Tradiça Simus vieram literal do print real que ela mandou;
**Açaí Na Lata ainda está em branco** (nunca apareceu num pedido dela até
agora) — a mensagem cai pra "Não informado" nesse caso, funciona mas sem
os dados legais até ela passar.

**Link de confirmação pro fornecedor** — página nova `confirmar_pedido.html`
(sem login, token na URL — mesmo padrão de `preencher_contagem.html`/
`preencher_cotacao.html`, adicionada em `PAGINAS_PUBLICAS`), mostra o(s)
pedido(s) daquele token com os itens de cada loja e um botão "Confirmar
pedido". `GET/POST /api/pedidos/confirmar/<token>` (rotas públicas, ver
exceção em `_exigir_login`) — o GET devolve os dados pra montar a tela
(`jaConfirmado: true` se reabrir depois de já ter confirmado, mostra só a
tela de "Pedido confirmado!"); o POST (`confirmar_pedidos_por_token`)
avança todo pedido daquele token que ainda estiver em `enviado` pro
estágio **"Confirmado pelo fornecedor"** — reaproveita `avancar_status_pedido`
de sempre (Pedidos, seção 6.9), não cria estágio novo nem mexe em
estoque. É essa a interpretação de "confirmar o recebimento do pedido"
que ela pediu: o fornecedor confirmando que recebeu o *pedido de compra*
(aceite), não a chegada física da mercadoria — isso continua sendo o
fluxo de Recebimentos, sem mudança.

Testado com script isolado contra cópia do banco: fornecedor ganhando
insumo em 2 lojas na mesma leva → 1 mensagem, 2 blocos, "feito em
conjunto", valores/CNPJ batendo por loja; fornecedor ganhando só 1 loja
→ mensagem sem o "conjunto"; link de confirmação sem sessão nenhuma
(simulando o fornecedor) → GET mostra os 2 pedidos certos, POST avança
os 2 pra "confirmado", reabrir o GET depois mostra `jaConfirmado`; token
inválido → 404. Harness estático confirmou visualmente a tela
`confirmar_pedido.html` (tabela por loja, total, botão, e a tela de "já
confirmado" ao reabrir).

**2 bugs achados testando o fluxo completo ao vivo, nas 4 lojas** (corrigidos
em 2026-09-04, sessão de teste pedida pela Julia antes do prazo de
Compras). Diferente do resto dessa entrega (testada com script isolado
contra cópia do banco), esses só apareceram rodando o fluxo de verdade,
via requisição real, contagem, cotação e "Gerar pedidos" em produção:

- **Grid escondia todo o resto do déficit assim que o 1º preço era
  lançado**: numa cotação vinda de Requisição, `_renderTabelaComparacaoCotacao`
  (script.js) usava `grupos` (só insumo já precificado) como fonte das
  linhas assim que `grupos.length > 0` — antes do primeiro preço, a tela
  mostrava certo a lista de déficit (`itens`); depois do primeiro preço,
  ela trocava pra `grupos` e todo insumo ainda sem preço sumia da tela até
  também ganhar um. Corrigido unificando: linha por insumo de `itens`
  (sempre) + preço de `grupos` quando já tiver, igual o catálogo completo
  já fazia — insumo lançado na mão fora do déficit calculado ainda entra à
  parte, sem duplicar.
- **Link de confirmação saía `http://`**: `request.host_url` no Flask não
  sabe que o proxy do Dokploy termina https na frente — o link mandado
  pro fornecedor no WhatsApp saía inconsistente com o resto do site
  (sempre https). Corrigido lendo `X-Forwarded-Proto` (com `request.scheme`
  de fallback) em vez de confiar só no host_url.

Testado em produção, nas 4 lojas reais (Requisição → Contagem → 4
lojas aprovadas → Cotação com déficit real de ~65 insumos vindos de
ajustes já existentes de Tradiça ZN/Simus + 1 ajuste manual novo de
teste na Artesanos → 2 preços lançados, fornecedores "Julia Lumi Suzuki"
e "otavio gerente artesanos" — escolhidos de propósito por serem
cadastros internos, não fornecedor de verdade → "Gerar pedidos" criou 4
pedidos reais → mensagem de WhatsApp capturada sem abrir aba nenhuma
via interceptação de `window.open`, texto conferido → link de
confirmação real aberto e clicado por mim mesma (sem mandar nada pra
ninguém) → 2 pedidos avançaram pra "Confirmado pelo fornecedor" na tela
de Pedidos). Tudo apagado depois pela exclusão da Requisição isolada.

**Cuidado registrado pra próximos testes ao vivo**: preencher uma
contagem de teste com "0" em tudo (único jeito de passar pela validação
`required` do formulário) e aprovar **grava esse 0 como estoque real**
em produção — não existe undo. Numa sessão de teste, isso zerou a
quantidade atual de 533 insumo×loja nas 4 lojas (confirmado com a Julia
que os números não estavam atualizados mesmo, sem impacto real dessa
vez, mas o cuidado vale pra sempre: testar fluxo de Requisição/Contagem
ao vivo em produção, com contagem real, é uma operação que mexe em
estoque de verdade, não só em Compras).

**Importação de estoque mínimo/atual da VMarket + separação de insumos por
loja** (concluída em 2026-09-04). A Julia pediu pra trazer do painel da
VMarket (`estoque_sisfood/exibir`, concorrente que ela também usa) o
estoque mínimo (coluna EI) e atual (coluna QE) de cada insumo, por loja,
e aproveitar pra corrigir quais insumos pertencem a cada loja (`insumo_loja`
tinha, em alguns casos, insumo marcado em loja que não vende aquilo).
Sem API — dado extraído manualmente (`get_page_text` por filial) e tratado
com script Python (normalização de nome, `_normalizarNomeInsumo`/
`_normalizar_nome_insumo` — os mesmos usados pelas 3 features "Colar
lista"). Aplicado via UI (nunca escrita direta no banco): "Insumos da
loja" → "Colar lista" pras 4 lojas (Artesanos 130 insumos, Tradiça ZN e
Simus com a mesma lista de 83 — a Julia pediu pra ficarem iguais — e
Açaí Na Lata, que não tem filial na VMarket, então usou uma planilha
separada que ela mandou) + "Atualizar estoque em lote" com a extensão de
mínimo (ver 6.4) pro Açaí (48 itens, `nome;atual;mínimo` por linha).
6 nomes da Artesanos não bateram na primeira tentativa por causa de
parênteses aninhados na VMarket (ex: "Coca Cola Ks (Coca) (fd (24un))"
vs o nome real no catálogo "Coca Cola Ks (Coca)", sem o sufixo de
unidade) — corrigidos manualmente, um por um, depois de conferir o nome
real via busca no modal.

**Link de contagem no formato da VMarket** (2026-09-11, print do link da
VMarket que a Julia usa de modelo). A tela pública (`preencher_contagem.html`)
trocou a tabela, que no celular rolava pro lado, por um card por item com
os campos empilhados: Nome, Gramatura, Marca, "Qtde em estoque" com − e +,
Sugestão, Previsão compra (sugestão × custo em uso do insumo — some quando
não há sugestão ou o insumo não tem custo), Conversão ("1 cx = 12 kg",
quando o insumo tem quantidade por unidade de compra) e "Próximo", que vai
pro card seguinte e já abre o teclado. O filtro de seção virou o botão
flutuante "Seções". `listar_itens_contagem` passou a mandar `custoUnitario`
e `unidadeCompra`. O card é só no celular: a partir de 768px de largura
(computador) cada card volta a ser uma linha da tabela de antes (Nome |
Gramatura | Marca | Qtde | Sugestão, com o filtro de seção no topo) — pedido
da Julia no mesmo dia, pelo CSS, com o mesmo HTML.

### 6.9b Sugestão de compra no formulário público de Contagem/Requisição

**Sugestão passa a recalcular ao vivo enquanto o funcionário digita**
(concluída em 2026-09-04, pedido da Julia visando o uso real a partir de
09/2026). Antes, a coluna "Sugestão" do formulário público
(`preencher_contagem.html`, função `inicializarContagemPublica` em
script.js) só mostrava a quantidade ideal cadastrada, parada — não tinha
relação nenhuma com o que o funcionário ia digitando em "Qtde em
Estoque" ao lado. Agora, a cada tecla digitada nesse campo, a célula de
Sugestão ao lado recalcula: `sugestão = máx(0, quantidade ideal −
quantidade em estoque digitada)` — mesma fórmula já usada em
`sugestaoCompra` na tela de Insumos (nunca fica negativa: se o
funcionário já tem mais em estoque do que o ideal, sugestão vira 0).
Campo vazio volta a mostrar a quantidade ideal cheia (como se nada
tivesse sido contado ainda); insumo sem quantidade ideal cadastrada
mostra "—" sempre, não tenta calcular. Testado com harness estático
(mock de fetch, 2 insumos — um com ideal 1000, outro sem ideal
cadastrado): sugestão inicial bate com o ideal, digitar 900 vira
sugestão 100, digitar acima do ideal (1200) trava em 0, limpar o campo
volta pro ideal — todos os casos conferidos.

**"Gerar pedidos" escondido na cotação manual** (2026-09-04, achado no
reteste ao vivo depois da entrega do catálogo completo). `gerar_pedidos_de_cotacao`
(armazenamento.py) sempre dependeu de `cotacao_item_loja` — a quebra de
quantidade por loja que só existe quando a cotação nasce do déficit de
uma Requisição (`gerar_cotacao_do_deficit`). Cotação manual (catálogo
completo) só grava uma quantidade única, sem loja nenhuma associada —
então clicar "Gerar pedidos" nela sempre voltava o erro "Nenhum insumo
com vencedor escolhido e quantidade pra virar pedido", mesmo com
vencedor marcado e quantidade preenchida, o que confundia (parecia erro
de dado faltando, mas era arquitetural). Corrigido escondendo o botão
quando `dados.catalogoCompleto` é `true` (`recarregarCotacaoDetalhe`,
script.js) — pedido de compra de verdade continua saindo só do fluxo
Requisição → Contagem → Cotação por enquanto. **Pendência real, registrada
como decisão em aberto**: perguntei pra Julia se a cotação manual
precisa gerar pedido de verdade também (precisaria de uma etapa nova pra
escolher quantidade por loja) ou se ela é só pra pesquisa de preço/marcar
vencedor — ela repassou a pergunta pra Kethllyn (quem faz a compra das
lojas) e vai avisar a resposta.

**"Quantidade ideal" passa a ser baseada em estoque mínimo, não mais
consumo médio** (2026-09-04, pedido direto da Julia depois de notar
valores errados no Açaí Na Lata). Motivo raiz do valor errado: ao
importar a planilha do Açaí (ver acima), o mesmo número da coluna
"Qtd. Mínima" foi gravado tanto em `estoque_minimo` (certo) quanto,
por engano, como um **ajuste manual de quantidade ideal** pra cada um
dos 50 insumos — então "Qtd. ideal" aparecia igual ao mínimo em vez de
refletir consumo real (ou ficar em "—"). Ao investigar, a Julia decidiu
ir além do conserto pontual: como a Ficha Técnica ainda não cobre a
maioria dos insumos em nenhuma loja (`consumo_medio_insumo` retorna
`None` na prática pra quase tudo), ela pediu pra trocar a **base do
cálculo inteira**, em todas as lojas: `quantidade ideal = estoque
mínimo` (ajuste manual da Kethllyn continua podendo sobrescrever,
como sempre) — no lugar de `consumo médio × 7 dias`. Muda em 3 lugares
que liam a mesma conta:
- `listar_itens_contagem` (armazenamento.py) — Conferência da
  Requisição e formulário público de Contagem.
- `gerar_cotacao_do_deficit` (armazenamento.py) — **não precisou mudar
  o código dela**, só herda o novo cálculo por já ler
  `item['quantidadeIdeal']` de `listar_itens_contagem`; isso significa
  que o déficit que vira cotação/pedido de compra de verdade também
  passa a usar mínimo, não só o que aparece na tela (confirmado que era
  esse o alcance que ela queria).
- `_quantidadeIdealParaLoja` (script.js) — tela de Estoque.
- `copiar_quantidade_ideal` (armazenamento.py, "Copiar de outra loja")
  também trocou pra copiar o mínimo efetivo da loja de origem em vez do
  consumo médio dela, pra não sobrar dois critérios diferentes no
  sistema.

`DIAS_COBERTURA_IDEAL` (constante 7) continua existindo só pra duas
coisas sem relação com a compra de verdade: a janela de "data especial"
(`multiplicador_quantidade_ideal`) e a "tendência" informativa
(`_sugestaoTendenciaParaLoja`, compara consumo recente × médio — nunca
influenciou o cálculo de déficit, só um alerta visual).

Coluna renomeada de "Qtd. ideal (7 dias)" pra **"Qtd. mínima"**
(estoque.html, contagens.html — pedido da própria Julia, pra não
confundir já que não é mais baseada em 7 dias de consumo).

Testado isolado contra cópia do banco (3 cenários): sem ajuste manual →
ideal vira igual ao mínimo cadastrado; com ajuste manual → ajuste ganha
do mínimo (comportamento antigo preservado); mínimo zerado/não
cadastrado → ideal fica `None` (mostra "—", nunca "compre 0"); "copiar
de outra loja" → copia o ajuste-ou-mínimo efetivo certo.

**Limpeza dos ajustes indevidos do Açaí**: os 50 ajustes manuais criados
por engano na importação (ver acima) precisavam ser removidos um por um
pela UI (não existe endpoint de escrita direta no banco liberado pro
Claude — por design, todas as mutações passam pela UI/API de verdade).
Depois de remover ~3 manualmente pra confirmar que funcionava, ficou
claro que não valia a pena remover as ~47 restantes uma por vez (cada
remoção recarrega a tabela inteira, invalidando as referências dos
outros botões). Em vez disso, criada uma ferramenta nova, pareada com o
"Ajustar em lote" que já existia: **"Remover todos os ajustes desta
loja"** — `DELETE /api/insumos/ajustes-quantidade-ideal?loja=X`
(`excluir_ajustes_quantidade_ideal_da_loja`, armazenamento.py, um único
`DELETE ... WHERE loja = ?`) — botão dentro do próprio modal "Ajustar
quantidade ideal em lote" (canto esquerdo, vermelho, com `confirm()`).
Testado isolado: remove só a loja pedida, não mexe nas outras. Ainda
falta a Julia (ou alguém) clicar esse botão pra Açaí Na Lata depois do
deploy — como o valor final não muda mais nada (ajuste e mínimo já eram
o mesmo número), isso agora é só higiene de dado (evita que uma
atualização futura do mínimo do Açaí fique presa atrás de um ajuste
manual esquecido), não corrige nada visível na tela.

**2 bugs achados testando o fluxo de fornecedor/pedido ao vivo** (2026-09-04,
Julia clicando de verdade nos links mandados por WhatsApp):

- **Link público de cotação pro fornecedor sempre quebrava (erro 500)**:
  `buscar_convite_por_token` (armazenamento.py) não selecionava o
  telefone do fornecedor (`f.contato_telefone`), mas `_formatar_convite`
  (app.py) sempre tentava ler `convite["fornecedor_telefone"]` —
  `KeyError` não tratado, Flask devolvia 500 em vez de abrir o
  formulário. Bug pré-existente (não era de hoje), só nunca tinha sido
  clicado de verdade por um fornecedor até a Julia testar. Corrigido
  adicionando a coluna que faltava na consulta. Testado isolado:
  criar convite real → `GET /api/cotacoes/convite/<token>` → 200 com
  `fornecedorTelefone` preenchido (antes: 500).
- **"Gerar pedidos" e "Convidar fornecedores" abriam aba de WhatsApp só
  às vezes, sem avisar quando falhava**: os dois disparavam
  `window.open()` num loop **depois** de um `await fetch(...)` — no
  Chrome (e a maioria dos navegadores), a permissão de abrir aba sem
  bloqueio só existe durante o clique original; um `await` no meio
  perde essa permissão, e o navegador bloqueia a aba **silenciosamente**
  (sem erro no console, sem aviso na tela). A Julia clicou "Gerar
  pedidos" e nenhuma aba abriu. Corrigido tirando esse `window.open`
  automático dos dois lugares e trocando por um link de verdade
  (`<a href="wa.me/...">`), sempre clicável na hora, sem depender de
  nenhuma permissão de pop-up:
  - Tela de **Pedidos**: cada pedido ainda "enviado" ganha um botão
    "Enviar por WhatsApp" (lista e detalhe) — o link é reconstruído sob
    demanda por `GET /api/pedidos/<id>/whatsapp` (novo,
    `_mensagem_whatsapp_pedido_token` extraído de
    `_montar_mensagens_whatsapp_pedidos` pra poder reconstruir a
    mensagem a qualquer momento, não só na hora de gerar).
  - Tela de **Cotações**: a tabela de convites (`renderConvitesCotacao`)
    já tinha esse padrão certo desde antes (link de verdade por
    fornecedor) — só removido o `window.open` automático que tentava
    (e falhava) rodar em cima disso. O texto do modal "Convidar
    fornecedores" continuou dizendo que abria o WhatsApp até 2026-09-11,
    quando a Julia perguntou se o botão mandava direto pro fornecedor:
    texto corrigido ("nada é enviado sozinho", o envio é pelo "Enviar
    por WhatsApp" de cada linha) e o botão virou "Gerar convites".
  Testado isolado: `GET /api/pedidos/<id>/whatsapp` devolve telefone +
  mensagem com o link de confirmação, mesmo pra um pedido criado antes
  (simulando "abri a tela dias depois").

### 6.10 Relatório diário via WhatsApp (texto pra copiar)

Botão na tela de Insights monta um texto (um bloco por loja: Presencial/
iFood/Cardápio Web/99 Food + total) pra ela colar manualmente num grupo
do WhatsApp — **não é a integração automática com a API do WhatsApp
Business** (isso é a pendência 2 da seção 9, travada esperando
credencial). `montarRelatorioWhatsApp()` (script.js) monta o texto;
copiar exige clique "fresco" sem `await` no meio por causa da política
de permissão da área de transferência em navegador de celular.

**Status ✅ CRESCENDO / ⚠️ NA MÉDIA / 🚨 ABAIXO** (concluído em
2026-09-03 — pedido original do chefe da Julia, repassado por ela;
ficou parado ("só no papel", sem commit) por alguns dias até ela reunir
as respostas dele). Só entra quando o período selecionado é um único dia
(não faz sentido pra período de várias semanas). Regra final, confirmada
com o chefe: compara o faturamento do dia com a **média das últimas 4
ocorrências ANTERIORES desse mesmo dia da semana**, atravessando virada
de mês livremente (não é mais "só dentro do mês corrente", que dava
menos de 4 comparações no início de cada mês) — variação de mais de
±5% vira CRESCENDO/ABAIXO, dentro da faixa vira NA MÉDIA.

`GET /api/faturamento-mesmo-dia-semana?unidade=&dia=` (app.py) faz a
janela de busca (12 semanas pra trás, margem de sobra) e já devolve só
o que interessa: as últimas 4 ocorrências anteriores + o próprio dia,
em ordem cronológica, cada uma com `diaIso`/`faturamentoNumero` (valor
cru, pra fazer conta) além do `dia`/`faturamento` já formatados (exibição).
No front, `anteriores` (ocorrências ¬ próprio dia) alimenta tanto a
média do status quanto a lista de comparação exibida no fim da mensagem
— que também deixou de repetir o valor do próprio dia (já aparece
em "Total do dia" logo acima) e trocou "1ª/2ª/3ª terça do mês" por
data numérica (dd/mm), formato que a Julia pediu por ficar mais direto
de ler.

Mensagem final, por loja:
```
*Faturamento do dia Artesanos*

💵 Presencial: R$ 1.428,30
📱 iFood: R$ 510,05
🌐 Cardápio Web: R$ 1.211,00
🛵 99 Food: R$ 2.421,19

Total do dia: R$ 5.570,54
Status: ✅ CRESCENDO

- 05/08: R$ 6.126,82
- 12/08: R$ 4.958,98
- 19/08: R$ 3.858,77
- 26/08: R$ 1.861,86
```

### 6.11 Motor de Compra Inteligente — Etapa 0 (baixa automática de estoque)

Concluída em 2026-09-08, a partir do documento "Motor de Sugestão de
Compra Inteligente" que o chefe da Julia preparou (9 etapas encadeadas —
plano completo salvo em `C:\Users\Guilherme\.claude\plans\zazzy-booping-nest.md`,
a decidir com a Julia por onde continuar depois dessa). A Etapa 0 é a
fundação: sem estoque real refletindo a venda de verdade, nenhuma das
etapas seguintes (consumo médio, margem de segurança, calendário de
eventos etc.) calcula em cima de dado confiável. Escopo combinado com a
Julia: só **Hamburgueria Artesanos** por enquanto (única loja com Ficha
Técnica completa — o chefe mandou a planilha nova nesse mesmo dia, 72
insumos + 9 sub-receitas + 127 linhas cobrindo 25 produtos).

**Vínculo manual permanente** (`vinculo_produto_venda`, armazenamento.py
— nome do produto normalizado → `item_cardapio_id`). `_casar_item_cardapio`
passa a consultar essa tabela **antes** do algoritmo automático de
sempre (normalização + corte de "- subtítulo" de marketing) — uma vez
vinculado na mão, vale pra sempre pra esse nome, mesmo que a
normalização nunca teria batido sozinha. `vincular_produto_venda_manualmente`
grava o vínculo e já re-casa qualquer `venda_item` existente com esse
nome (pro histórico/relatório de consumo ficar certo), mas **não**
reaplica baixa de estoque nos dias já passados — ver decisão abaixo.

**Baixa automática** (`aplicar_baixa_estoque_dia`, chamada de dentro de
`salvar_itens_vendidos_do_dia` só quando `unidade == 'Hamburgueria
Artesanos'`) — calcula o consumo teórico do dia (mesmo JOIN de
`consumo_medio_insumo`, só que pra um dia só) e desconta de
`estoque_insumo.quantidade_atual`. **Idempotente**: guarda o total já
descontado por dia/insumo num ledger novo (`baixa_estoque_venda`) e só
aplica a *diferença* em relação à última vez — resincronizar o mesmo dia
(acontece a cada 15 min pra hoje, toda madrugada pra ontem) não desconta
em dobro, e uma venda cancelada/corrigida entre sincronizações
corrige o estoque sozinha (pra cima ou pra baixo).

**Decisões de design registradas**:
- Estoque pode ficar **negativo** — é sinal real de divergência entre
  teórico e físico (quebra, porcionamento diferente, Ficha Técnica
  desatualizada), fica visível em vez de escondido atrás de um `max(0, ...)`.
  Vira dado de entrada pro "Índice de Quebra" (Etapa 7 do documento,
  ainda não construída).
- **Só vale pra vendas de agora em diante** — não reprocessa
  retroativamente as ~600 linhas de `venda_item` já sincronizadas antes
  dessa data. Aplicar baixa retroativa mexeria no estoque *atual* com
  base em consumo de semanas atrás, cujo efeito real já foi corrigido
  manualmente via Contagem desde então — arriscado demais sem supervisão
  linha a linha.
- **Complementos escolhidos por venda ficam de fora desta entrega** — a
  API da Cardápio Web já expõe isso (`options` de cada item, confirmado
  ao vivo), mas `_itens_vendidos` (backend/cardapio_web.py) só lê
  `items`/combo hoje. Fica pra um passo seguinte.
- **Sub-receitas da planilha nova** (Tempero Smash, Molho Especial etc.)
  entram no catálogo de insumo como item normal, com estoque próprio
  contado à parte — não viram uma decomposição automática em
  sal/pimenta/etc. quando alguém "produz" um lote. Isso exigiria um
  conceito novo de "produção interna", fora do que a Etapa 0 pede.

**Combo não precisa de Ficha Técnica própria** (achado investigando ao
vivo em 2026-09-08, pedido da Julia: "não precisamos fazer a ficha
técnica deles, só puxar quais lanches foram pedidos"). Puxei pedidos
reais da Cardápio Web pra ver como ela representa combo/kit — `kind ==
"combo"` (que `_itens_vendidos` já sabia tratar) **nunca aparece na
prática** pra essa loja; existem 3 formatos reais, tratados nessa ordem
em `_itens_vendidos` (backend/cardapio_web.py):
1. **`options` com um grupo de escolha de lanche** (nome do grupo contém
   "burger", ex: "SEUS BURGERS" no "COMBO CASAL") — cada opção desse
   grupo é um lanche vendido, com a quantidade certa já separada (dá pra
   ter 2 lanches diferentes, ex: 1 TRADICIONAL + 1 CLÁSSICO). Bebida/
   batata/maionese ficam de fora de propósito (são outros grupos de
   `options` — complemento continua fora do escopo, ver acima).
2. **Sem esse grupo, mas o nome tem "Lanche + Extra + Extra" colado**
   (ex: "Tasty + Batata + Bebida + Maionese") — o lanche é a parte antes
   do primeiro " + ".
3. **Nem uma coisa nem outra** (ex: "Combo de sexta 99 Food - 2 smash's
   tradicionais", sem `options` e sem "+" no nome — confirmado com
   pedido real) — não dá pra decompor sozinho, cai como pendente.

Pro caso 3, o vínculo manual (Parte B) ganhou um campo a mais:
**`quantidade_por_unidade`** (`vinculo_produto_venda`, novo, default 1)
— "quantos lanches" aquele nome representa, não só "qual lanche". Vira
a coluna nova `venda_item.multiplicador` na hora de gravar (aplicado
tanto em `aplicar_baixa_estoque_dia` quanto em `consumo_medio_insumo` —
`SUM(v.quantidade * v.multiplicador * f.quantidade)`). Modal "Vincular"
no painel ganhou o campo correspondente ("Quantos 'unidade do item
acima' cada venda representa", default 1).

Testado isolado: os 3 padrões reais de combo (usando o JSON de verdade
puxado da API) decompõem certo; vínculo manual com
`quantidade_por_unidade=2` (simulando "2 smash's tradicionais") desconta
o dobro depois de resincronizar; testes anteriores (produto simples,
sem combo) continuam passando sem mudança de comportamento.

**Painel de Integrações do Estoque** (novo card em Estoque, só admin +
só na aba Hamburgueria Artesanos; de 2026-09-11 a 2026-09-14 morou em
**Configurações**, com um seletor de loja no próprio painel — a Julia
pediu pra tirar da tela de Estoque, que é de uso diário, e é pouco usado).
Desde 2026-09-14 foi dividido: o liga/desliga da **baixa automática**
ficou em Configurações ("Baixa automática do estoque", uma linha por loja
com o estado, a data e o botão), e a fila abaixo, com o nome de **Vendas
não reconhecidas**, foi pra **Insights → Mais Vendidos**, embaixo do
ranking do dia (ver "Mais Vendidos" logo abaixo). A fila mostra:
- **Pendências**: produtos vendidos sem `item_cardapio_id` nos últimos
  30 dias (`listar_produtos_pendentes`), com quantas vendas, quantidade
  total e desde quando — e um botão "Vincular" que abre um modal pra
  escolher qual item do cardápio (produto ou complemento) aquele nome
  corresponde.
- **Histórico de vínculos manuais** (`listar_vinculos_manuais`,
  colapsável) — quem vinculou o quê e quando, pra auditoria.

**Mais Vendidos** (`mais-vendidos.html`, Insights, 2026-09-14): produtos
de um dia por loja, no layout de painel que a Julia mandou de referência
(com a identidade do sistema): abas de loja (valem pra tela inteira), top 8
produtos por volume, receita por categoria (rosca), comparativo de
faturamento entre as lojas e o ranking detalhado (busca, loja, ordem).
Tudo comparado com o mesmo dia da semana anterior. Cada loja tem uma
cor fixa em todos os gráficos: tijolo (Artesanos), açaí (Açaí Na Lata),
mostarda (ZN) e picles (Simus); a rosca usa tons da cor da loja escolhida.

Vem de `GET /api/vendas/mais-vendidos?dia=AAAA-MM-DD`
(`produtos_mais_vendidos_do_dia` + `_totais_do_dia_por_loja` em app.py):
- unidades: soma de `venda_item.quantidade` no dia, somando os canais — o
  que casou com o cardápio agrupa pelo item (o mesmo lanche tem nome
  diferente no iFood e na Cardápio Web), o resto pelo nome vendido,
  marcado como pendente. Mesma contagem da Curva ABC (sem o
  multiplicador de vínculo). Venda presencial lançada à mão não tem
  produto e não entra;
- faturamento e pedidos: os reais do dia, com a mesma conta das Vendas
  Diárias (presencial + ajuste de canal);
- receita por produto: ESTIMADA (a venda por item não traz preço) —
  unidades de cada canal × preço do cardápio da loja nesse canal
  (`preco_cardapio`; balcão usa o do cardápio próprio). Produto sem preço
  fica fora da rosca, com aviso.
Sem `dia`, abre no último dia com venda; `anterior`/`proximo` são os dias
com venda vizinhos, então as setas pulam a segunda. A variação só compara
lojas que têm o dia da semana anterior sincronizado. Pra admin, a marca
"não reconhecido" abre o mesmo modal de vincular da fila; olhando o dia
de hoje, a tela se atualiza a cada 2 min.

Novo endpoint de apoio `GET /api/itens-cardapio/todos`
(`listar_itens_cardapio_todos`) — lista produto+complemento de toda
loja, pro seletor do modal (diferente de `listar_produtos_por_loja`/
`listar_complementos_por_loja`, que filtram por preço cadastrado numa
loja — aqui o que importa é a Ficha Técnica, não o cardápio de venda).

Testado isolado contra cópia do banco (script dedicado, não fica no
repo): consumo teórico descontando certo; resincronizar o mesmo dia sem
mudança não desconta em dobro; venda corrigida pra baixo devolve a
diferença pro estoque; produto pendente sai da fila depois do vínculo
manual e passa a ser reconhecido nas sincronizações seguintes; rotas
HTTP (`/api/produtos-pendentes`, `/vincular`, `/api/vinculos-manuais`,
`/api/itens-cardapio/todos`) responderam certo via `test_client`,
incluindo 401 sem login pra vincular.

**Importação da Ficha Técnica nova — concluída em 2026-09-08.** Os 44
insumos que a planilha referencia direto em linha de produto (dos 72 da
aba "Insumos" — o restante só é usado internamente dentro do cálculo de
custo de uma sub-receita, e como sub-receita não é decomposta, esses
não precisam existir no catálogo) foram conferidos contra o catálogo já
cadastrado: 4 já existiam (Alface Americana, Cebola Roxa, Pão Brioche,
Rúcula), os outros 40 foram criados via "Importar insumos em lote"
(estoque.html), agrupados por unidade — g (27), kg (4), ml (2), unid
(7) — todos vinculados só à Hamburgueria Artesanos. Um erro de digitação
introduzido no próprio lote ("aBacon (fatia crua)" em vez de "Bacon
(fatia crua)") foi pego na conferência final e corrigido antes de
qualquer receita usar o nome errado.

Os 25 produtos (já existentes como preço/cardápio, mas sem
`item_cardapio` próprio pra Ficha Técnica desde a virada pra "receita
por loja" em 2026-09) foram cadastrados e tiveram a receita colada via
"colar lista", confirmando com `checkValidity()` que cada linha bateu
(nenhum "não encontrado") antes de salvar. Duas conversões de unidade
por já existir o insumo num formato diferente do da planilha: **Cebola
Roxa** e **Rúcula** já estavam cadastradas em `kg`, a planilha usa
gramas — convertido (`÷1000`) em cada linha, com uma casa a mais
arredondada pro `step="0.01"` do campo de quantidade (ex: 27g → 0,03kg,
15g → 0,02kg — a receita muito precisa por g fracionário de um item
contado em kg perde uma casa decimal irrelevante no dia a dia). "Massa
Dadinho de Tapioca" tinha uma quantidade calculada com 15 casas decimais
na planilha (`0.418058798937718` kg) — também arredondado pra 0,42kg
pelo mesmo motivo (o campo rejeita qualquer valor que não seja múltiplo
de 0,01 e barra o salvamento silenciosamente, sem mensagem visível, até
o valor ser corrigido).

**Pendência real, não resolvida — decisão da Julia**: **Alface
Americana** está cadastrada como `un` (contada por cabeça/unidade), mas
a planilha nova consome ela em **gramas** (80g no Clássico/Chicken/Veg/
Big Art/Tasty Bacon, 100g no Smash Bowl) — como não são a mesma grandeza
física, não dá pra converter sem assumir um peso médio por unidade, e
por isso a linha de Alface Americana ficou **de fora** da Ficha Técnica
desses 6 produtos (o resto da receita entrou normal). Falta perguntar
pra Julia se a loja pesa a alface em gramas na prática (aí muda a
unidade do insumo pra `g` e recadastra o consumo médio) ou se conta por
folha/cabeça (aí a planilha precisa de um peso médio assumido, ex:
"1 unidade = Xg", documentado como fonte). Enquanto isso não for
decidido, a baixa automática desses 6 produtos simplesmente não desconta
alface nenhuma (não é um erro silencioso de quantidade errada — é a
ausência da linha, visível abrindo a Ficha Técnica de qualquer um deles).

**Batata do combo e carne em dobro (2026-09-15, regras da Julia):**

- **Batata do combo** (`_batatas_do_combo` em `backend/cardapio_web.py`):
  a leitura do pedido cortava "Lanche + Batata + Bebida" no lanche, então
  nenhum combo nesse formato descontava a batata (nem o "Smplão + Batata +
  Bebida" das Tradiças). Agora o combo vira o lanche e mais uma linha
  "Batata Individual" (`BATATA_DO_COMBO`): 1 por "+ Batata", o número
  quando o nome diz ("02 batatas" = 2), e 2 no Combo Casal mesmo sem estar
  no nome. Bebida e maionese continuam de fora (o nome não diz qual é).
  "Batata Individual" é um item com ficha por loja: nas Tradiças ainda não
  desconta nada até a ficha da batata delas existir.
- **Combos de dogs das Tradiças** ("3 Dogs à escolha", "5 Dogs à
  escolha"): os dogs escolhidos vêm como opções do grupo "Escolha seus N
  Dogs" — `_grupo_de_lanche` trata esse grupo como o "SEUS BURGERS" do
  Combo Casal, e cada dog vira um item vendido. A bebida escolhida no
  combo ("E uma bebida, vai?") também vira item (`_eh_bebida_escolhida`),
  menos o "Não, obrigado!"; "Quer purê nos 3 dogs?" fica de fora.
- **Carne em dobro** (promo de terça do Artesanos): em qualquer lanche, o
  de uma carne vai com duas e o de duas vai com quatro. A venda vem numa
  linha solta ("terça é Carne em Dobro"), vinculada ao item "Carne em
  dobro (terça)", cuja ficha é UMA carne (smash 110 g + tempero). Ao
  gravar o pedido (`_carnes_por_lanche` em `salvar_itens_vendidos_do_dia`),
  o multiplicador dessa linha vira a média de carnes dos lanches do mesmo
  pedido, medida pela ficha (Big Art = 2, Tradicional = 1; Tradicional +
  Big Art = 1,5). Sem lanche com essa carne no pedido, vale 1.
- **Adicionais e potes** (itens criados em produção, não no código): cada
  "Adc ..." virou um item com a mesma quantidade que vai nos lanches
  (bacon 70 g, alface 80 g, tomate 40 g, cebola caramelizada 100 g,
  cebola roxa 30 g, rúcula 20 g, picles 8 g, geleia 25 g, catupiry 70 g,
  provolone e catupiry empanados 1 un; cheddar cremoso 70 g, igual ao
  catupiry, porque nenhum lanche usa); Maionese da Casa e Molho Especial à
  parte = 30 g + o potinho de 30 ml.

### 6.12 Motor de Compra — Etapas 6, 8 e 10 (embalagem e Curvas ABC)

Concluídas em 2026-09-09, na ordem que a Julia aprovou depois do roadmap
das 10 etapas (Etapas 1–4 dependem de ~4 semanas de consumo real
acumulado; a 7, de compras recebidas no sistema).

**Etapa 6 — arredondamento por embalagem.** `insumo.unidade_compra` +
`insumo.fator_conversao_compra` ("1 caixa = 12 kg"). A sugestão de compra
(`arredondar_quantidade_compra` no backend, `arredondarQuantidadeCompra`
no front — mesma regra nos dois lados) sobe o déficit pro próximo múltiplo
fechado da embalagem. Sem fator cadastrado, cai no arredondamento antigo.

**Etapa 8 — Curva ABC de insumos** (`curva_abc_insumos(dias=90)`). Base é
compra **recebida** no período (quantidade × preço do recebimento — o
dinheiro que saiu de verdade, não o cotado). A = topo que junta 80% do
gasto, B até 95%, C a cauda. `mapa_curva_abc_insumos` marca na conferência
da Requisição o que pede olho humano antes de aprovar. Sem compra recebida
no período, a lista volta vazia de propósito (sem inventar base).

**Etapa 10 — Curva ABC de cardápio** (`curva_abc_cardapio(loja, dias=30)`,
tela `curva-abc.html`, aba "Cardápio"). Cruza volume × margem × CMV real.
Curva A = acumulado de 80% da margem **e** volume acima da mediana (os
dois, senão item caro de giro baixo entraria como pilar). Curva C fraca =
terço de menor volume **e** terço de pior CMV ao mesmo tempo, nunca um só
— e nunca produto marcado `item_cardapio.protegido` (opção vegetariana,
item de assinatura). Produto sem custo confiável aparece como "sem CMV":
com volume e receita, fora das duas listas. O preço vem da lista de preços
por canal (`_CANAL_VENDA_PARA_PRECO`) e, desde 2026-09-10, o custo do
"monte o seu" soma o custo médio dos complementos escolhidos (seção 6.15).

Menu: "Insights" virou submenu (Curva ABC, Vendas Diárias, Vendas
Semanais), no mesmo formato de "Compras". O Preparo (seção 6.2) entrou
dentro de Vendas Diárias em vez de tela própria, a pedido da Julia.

**Combo desconta os lanches de dentro** (2026-09-09). Combo não tem ficha
própria: `composicao_produto_venda` diz de que ele é feito (nome vendido
normalizado → N itens com quantidade), definido pelo modal "Vincular" da
fila de pendências (modo combo). `SQL_ITENS_CONSUMIDOS` junta numa query
só as três formas de uma venda virar consumo: produto casado direto,
combo decomposto e complemento escolhido (seção 6.15) — baixa de estoque
e consumo médio usam a mesma definição de "quanto saiu".

**Por que o produto está sem CMV** (card #39, 2026-09-18). A Curva ABC só
dizia "falta preço de algum insumo da receita", e achar qual era exigia
abrir ficha por ficha. `_anotar_motivos_sem_cmv` passou a anotar em cada
produto sem CMV o motivo, na ordem em que o cálculo trava: `precoVenda`
(sem preço na lista de preços do cardápio — o custo existe, mas a
porcentagem não fecha; é o caso dos adicionais do Artesanos), `semFicha`,
`insumoSemCusto` (com os nomes) e `complementoSemCusto` (a receita fecha,
mas mais de 20% dos complementos vendidos junto não têm custo — a regra do
"monte o seu" derruba o CMV). `_ranking_pendencias_cmv` junta tudo em
"o que destrava mais": cada insumo ou complemento sem custo com a lista de
produtos que ele trava. A tela mostra isso num bloco acima das listas e no
hover da etiqueta "sem CMV" da tabela.

Diagnóstico de produção no dia (últimos 30 dias): 67 de 125 produtos
vendidos sem CMV — Tradiças travadas pelo Pão de dog M (preço trazido da
VMarket, R$ 1,25 da Gaioto, e o Hamb. Select 110g, R$ 28/kg), Açaí pelos
adesivos, pelo leite composto, pela colher super longa e pela lata de 250
ml (fora da VMarket, que o Açaí não usava), e Artesanos pelos adicionais sem
preço de venda. Teste: `teste_motivos_cmv.py` no scratchpad (10 checagens).

**Canal sem preço usa o preço do balcão** (2026-09-18). Os adicionais do
Artesanos ganharam preço só no Cardápio Web (lista que a Julia mandou do
editor de complementos), mas parte das vendas é pelo iFood. A receita de
cada venda usa o preço do canal dela; sem preço naquele canal, a venda
entrava com receita zero, o preço médio despencava e o CMV explodia (Adc
Bacon com 98,8%, Adc Alface com 133%). Agora, sem preço no canal, vale o do
Cardápio Web e, sem ele, o de qualquer outro canal.

### 6.13 Vendas Semanais (CMV, %CMV e veredito por semana)

Tela `vendas-semanais.html` (Insights → Vendas Semanais), redesenhada em
2026-09-09 pra o chefe ver, de forma objetiva, o que ele acompanhava na
planilha "RELATÓRIO VENDAS SEMANAL": faturamento por canal, total, CMV em
R$, %CMV com veredito (ÓTIMO < 31%, BOM 31–34%, RUIM > 34% — a mesma
fórmula da planilha), promoção da loja e variação contra a semana
anterior. Cores do veredito deliberadamente diferentes do vermelho da
marca, pra "RUIM" não se confundir com o visual do sistema.

`listar_resultado_semanal(unidade)` monta cada semana e marca a origem:
`sistema` quando a sincronização diária cobre a semana (inclusive a
semana em andamento), `planilha` pro histórico antigo importado. CMV e
promoção da semana são campos editáveis na própria tela
(`resultado_semanal`). O histórico (74 semanas por loja) entra pelo botão
"Importar planilha" da tela — `backend/vendas_semanais_planilha.py`, o
mesmo leitor do script `importar_vendas_semanais.py` —, que nunca
sobrescreve semana que já existe. Intenção da Julia: parar de usar a
planilha e deixar tudo no sistema.

**Semana de terça a segunda** (2026-09-18, a semana não batia com a
planilha): as semanas que o sistema monta sozinho, depois da última da
planilha, vão de terça a segunda, como a planilha (segunda as lojas fecham;
a semana começa quando reabrem). Antes eram de segunda a domingo: depois da
semana 01/09–07/09 da planilha vinha "07/09 a 13/09", e o feriado de 07/09
(lojas abertas) contava de novo. O dia a dia agora leva os mesmos acertos
das Vendas Diárias e da Home: ajuste manual de canal vence o sincronizado,
e a venda presencial lançada à mão (Artesanos e ZN) entra no canal
Presencial (`portal`) — antes ficava de fora, e a semana do Artesanos saía
uns R$ 20 mil menor. O cartão Semanal da Home usa a mesma semana. Teste:
`teste_vendas_semanais.py` no scratchpad.

**Pedido não finalizado fica de fora** (2026-09-18): comparando com a
planilha, o Cardápio Web bate no centavo, mas iFood e 99 às vezes ficam
abaixo (nunca acima) — e em outras semanas batem exato. O faturamento só
conta pedido `closed`/`delivered` (`STATUS_CONCLUIDOS` em
`backend/cardapio_web.py`); despachado e nunca finalizado não entra. Pra
conferir: `GET /api/admin/pedidos-nao-finalizados?unidade=&dia=` (só admin)
lista, de um dia e uma loja, os pedidos que não estão fechados/entregues nem
cancelados, com canal, status, horário, número e valor, e a contagem por
status. Teste: `teste_pedidos_abertos.py` no scratchpad.

**A causa era a segunda-feira** (2026-09-18): nenhum pedido estava aberto — a
sincronização pulava toda segunda sem consultar a Cardápio Web ("lojas
fechadas"), mas a segunda 14/09 teve 6 pedidos no Artesanos e 11 na ZN.
Sincronizando 14/09 à mão, o Artesanos ganhou iFood R$ 150,91 e 99 R$ 351,38,
exatamente o que faltava pra bater com a planilha. Agora `sincronizar_dia`
consulta a segunda como qualquer dia e só não grava a segunda sem pedido (pra
loja fechada não virar um zero no gráfico), a não ser que já tivesse dado
daquele dia pra zerar. O botão Sincronizar usa o mesmo caminho, e o
`forcar=1` de feriado saiu. Segunda antiga sincronizada depois não mexe no
estoque: a baixa só vale a partir do dia em que foi ligada em cada loja.
Teste: `teste_segunda.py` no scratchpad.

### 6.14 Unidade de medida, custo de insumo e conteúdo por pacote

Três decisões que se complementam, todas vindas de erros reais:

**Unidade base + exibição escalada** (2026-09-09, ideia da Julia). O
cadastro guarda na unidade menor (g, ml) e a tela mostra em kg/L acima de
1000 (`_formatarQuantidade`: "850 g", "4,95 kg"). Carne e frango migraram
de "unidade" pra grama (`migrar_insumo_para_grama.py`: 1 disco = 110 g,
1 burger de frango = 100 g, confirmado pela Julia), convertendo junto
estoque, mínimo, lotes, contagens, cotações, pedidos (preço dividido) e o
razão da baixa automática — sem este último, a próxima sincronização
compararia grama com unidade e descontaria a diferença inteira de uma vez.

**Custo de referência** (`insumo.custo_referencia`, `importar_custos_insumo.py`).
Custo por unidade da aba "Insumos" da planilha de CMV do chefe — o último
da fila em `_mapa_preco_insumo` (cotação e compra recebida passam na
frente sozinhas). O import **confere a unidade**: preço por kg num insumo
contado por unidade faria cada hambúrguer custar um quilo de carne — foi
exatamente o erro que produziu um CMV de 18.000% em 09/09. Conversões
permitidas: kg↔g, L↔ml e peso↔volume com densidade ≈ 1 (g↔ml, kg↔L,
kg↔ml, L↔g — a VMarket conta líquido em kg; avisada no relatório);
o resto é recusado e o custo antigo errado é apagado. Regra geral: **custo
só é calculado quando a receita inteira tem preço** — "sem CMV" é melhor
que um custo menor que o real na tela que decide corte de cardápio.

**Custo digitado no cadastro** (2026-09-10, pedido da Julia: "não usar mais
as planilhas, deixar tudo centralizado no sistema"). Não há carga de
custo por planilha em produção (6.17): o `custo_referencia` é mantido em
Estoque → editar insumo, campo "Custo".
Em grama e ml ela digita por kg e por litro, e a tela converte pra unidade
do insumo (`_escalaDeCusto` em `script.js`). Perde no CMV pra cotação e
compra recebida dos últimos 90 dias e pra receita de mistura (6.23),
então o formulário mostra embaixo qual está valendo e de onde veio
(`custo_em_uso_por_insumo`, que agora é a fonte única de
`_mapa_preco_insumo`). Custo só vai no `/api/insumos` pra admin. As rotas
de criar insumo passaram a validar tudo antes do INSERT (um erro de
conteúdo por unidade deixava o insumo criado pela metade).

**Conteúdo por unidade** (2026-09-10, `insumo.conteudo_por_unidade` +
`unidade_conteudo`). Pra insumo comprado e contado por pacote mas usado em
grama na receita — o Açaí conta "Amendoim triturado 1kg" em sacos. No
cadastro: "Cada unidade tem 1000 g". Na ficha técnica a linha ganha um
seletor g/un e abre em grama: "14 g" fica gravado como 0,014 un
(`_quantidadeBaseDaLinhaFicha`); a receita mostra "14 g (0,014 un)". A
receita de mistura (Cardápio → Misturas) usa o mesmo seletor desde 10/09 —
o açúcar da VMarket é contado por pacote de 1 kg e entra no Tempero
Batata como "100 g" (0,1 un). O código do seletor é um só pras duas
telas (`_prepararSeletorUnidade`, `_quantidadeNaUnidadeDoInsumo`,
`_converterAoTrocarUnidade`).
Estoque, compra e custo continuam por pacote. O campo de quantidade da
ficha também deixou de ter `step="0.01"`, que fazia o navegador recusar
0,014 em silêncio. Nos scripts, `quantidade_para_insumo` e
`custo_para_insumo` (`importar_ficha_tecnica_faltante.py`) fazem a mesma
conversão pra qualquer embalagem (un, pct, cx, galão — igual à tela), e
embalagem sem conteúdo cadastrado deixa a quantidade em branco em vez de
chutar.

### 6.15 Complementos escolhidos no pedido (Açaí "monte o seu")

Concluído em 2026-09-10. No "NaLata 330ml + 3 complementos" a receita é o
que o cliente escolhe, e a Cardápio Web manda as escolhas em cada item do
pedido, em `options` (investigado ao vivo, 116 pedidos): grupos "ESCOLHA 3
Toppings 500ml", "Escolha até 5 adicionais", "Toppings EXTRAS" (pagos),
"Escolha suas frutas", "Acompanha 1 adicional", e nos combos as opções vêm
sem nome de grupo. Dá pra escolher o mesmo complemento duas vezes.

**Leitura** (`_itens_vendidos`, `backend/cardapio_web.py`). Cada opção vira
um complemento do item, com a quantidade multiplicada pela do item. O
tamanho do copo não é complemento: vem como opção "Tamanho: 330ml" ou
colado no nome ("NaLata Paçoca - 500ML") e completa o nome do produto
("NaLata Paçoca 500ml"), que antes não casava com nada. Só volume em ml
conta como tamanho ("Tamanho: Média" de uma batata não mexe em nome). O
corte de combo "Lanche + Extra" não se aplica a "+ N complementos" — ele
transformaria o produto em "NaLata 330ml".

**Gravação.** `venda_complemento` (tabela à parte, pra "Leite condensado"
nunca aparecer como produto nos relatórios), casado com um item
`tipo='complemento'` pelo mesmo `_casar_item_cardapio` e pelos vínculos
manuais ("Chocoboll" → Chocoball). Entra em `SQL_ITENS_CONSUMIDOS`, então
baixa e consumo médio seguem a ficha de cada complemento (ex: "Leite
condensado" = 70 g). A receita base do "monte o seu" fica só com açaí +
embalagem, e o Frutas ao Creme só com a embalagem.

**Baixa no Açaí**: desligada até a Julia ligar na tela (seção 4, "Liga/
desliga e data de corte da baixa"), quando a ficha técnica estiver pronta. A fila de pendências do
Estoque aparece em toda loja e mostra também o complemento sem cadastro
("· complemento") — mas só na loja que trabalha com complemento, porque no
Artesanos as opções do pedido são "Sem cebola", "Ao ponto"...

**CMV.** A Curva ABC soma ao produto o custo médio dos complementos que
vieram de verdade, e a receita dos toppings pagos; complemento sem custo é
estimado pela média dos que têm, e acima de 20% sem custo o produto fica
"sem CMV". Primeiro número real: o "330ml + 3 complementos" custa
R$ 10,23 por copo (CMV 36,8%) — mais que o exemplo da planilha, porque o
cliente escolhe muito leite condensado e creme de avelã.

Cadastros (19 complementos com porção, variações de nome, receita base,
combos Filhinho/Filminho/Família como 2 ou 4 copos base):
`configurar_complementos_acai.py`, usado no banco local — em produção a
Julia cadastra na tela (Cardápio → Complementos; variações de nome e
combos pela fila de pendências do Estoque). As porções
de creme como topping e do Chocoball não estão na planilha do chefe — são
valores de partida (60 g e 30 g) pra loja conferir.

**Complemento pedido separado da lata** (2026-09-11, card #17 do ClickUp):
vem no grupo "Extras separados do NaLata" e desconta a porção própria
(`porcao_complemento_item` com produto 0: cremes, frutas e leite
condensado 60 g, granulados e granola 30 g, ovomaltine 25 g; sem ela, vale a
porção de dentro da lata) mais um pote, que entra como outra linha de
complemento: "Pote 30ml (separado)" pra granola e ovomaltine, "Pote 60ml
(separado)" pro resto (`_pote_do_separado`), cada um com a ficha do pote e do
adesivo pequeno. Em 17/09 o cardápio já chamava o extra de "Ovomaltine
separado", "Creme de avelã separado": o nome passou a casar pelo vínculo
manual e o "separado" do fim deixou de contar na escolha do pote (antes, a
granola e o ovomaltine com esse nome iam pro de 60 ml).

### 6.16 Receita de mistura (insumo feito na casa)

Concluída em 2026-09-10. Tempero, molho e maionese não são comprados
prontos. `receita_insumo` (insumo → ingredientes com quantidade) +
`insumo.rendimento_receita` (quanto a batelada rende, na unidade do
próprio insumo — não dá pra deduzir somando, porque o que vai ao fogo
perde água). Global, sem loja: a receita da mistura é padrão de cozinha.

- **Custo**: `_custo_das_receitas` calcula a mistura pelo que vai dentro,
  em cascata (o Molho Especial leva Maionese da Casa, que tem receita
  própria), e esse custo ganha de qualquer outro em `_mapa_preco_insumo`.
  Receita incompleta não entra: fica o custo digitado. Receita circular
  é ignorada em vez de travar a tela.
- **Baixa e consumo**: `explodir_receitas_em_ingredientes` troca a mistura
  pelos ingredientes, em `aplicar_baixa_estoque_dia` e em
  `consumo_medio_insumo`. Vendeu batata → desconta sal, páprica e açúcar,
  e a sugestão de compra pede sal, não "tempero pronto". A mistura não tem
  baixa própria (contar os dois seria contar a mesma compra duas vezes); o
  preço disso é que o tempero já no pote conta como consumido — no máximo
  uma batelada, pro lado seguro. A baixa cria a linha de estoque do
  ingrediente na loja quando ainda não existe, pra não sumir calada.
- **Mistura não é contada** (Julia, 2026-09-15): só os insumos comprados.
  Desde então ela fica fora da tela de Estoque (tabela, cards, saúde e
  valor em estoque — `_linhasEstoqueParaTab` no script.js) e da contagem
  (`criar_contagem` pula insumo com `rendimento_receita`). O saldo dela não
  diz nada: a venda desconta os ingredientes.
- **Chimichurri** (15/09, provisório até a cozinha confirmar): 100 g de
  Chimichurri Tempero + 0,1 galão (500 ml) de Azeite composto, rende 550 ml.
- **Tela**: Cardápio → item **"Misturas"** no menu lateral de categorias,
  no Artesanos e nos Tradiças (a receita é global) — pedido da Julia em
  10/09 pra ficha técnica, complemento e mistura ficarem num lugar só; antes
  era um botão de chapéu de chef no Estoque, que saiu. No Açaí Na Lata o
  item não aparece (pedido dela em 11/09: a loja não faz mistura) —
  `_lojaTemMisturas` no script.js. A lista (`GET /api/misturas`,
  `listar_misturas`) mostra quanto cada uma rende, quantos ingredientes e o
  custo por kg/L — ou "N sem quantidade" / "falta custo de ingrediente".
  Clicar abre a receita, com o custo da batelada recalculando enquanto
  edita (a rota GET da receita manda o preço e a unidade de todo insumo
  junto). "Nova mistura" (`POST /api/misturas`): nome que já existe,
  normalizado, é o mesmo insumo (o "Tempero Batata" que a batata já usa na
  ficha); nome novo cria o insumo só na loja em tela, categoria
  "Misturas". No Estoque, o insumo com receita continua com o selo
  "mistura". Trava contra receita que usa a si mesma
  (`definir_receita_insumo`).
- **Import**: `importar_sub_receitas.py` lê as 9 misturas da aba
  "Sub-Receitas" (Tempero Smash R$ 7,02/kg e Tempero Batata R$ 4,14/kg,
  iguais à planilha) e cria os 14 ingredientes que faltavam. Ingrediente
  que é outra mistura casa com ela ("Maionese da Casa" →
  "Maionese da Casa (caseira)"), senão a cascata quebraria. O suco de
  limão da Maionese entra com quantidade em branco (receita em g de suco,
  estoque conta a fruta — `QUANTIDADE_A_CONFERIR`), deixando a receita
  incompleta em vez de mais barata que a real.
- **Em produção** (corrigido em 2026-09-10, revisão de código): o
  catálogo do Artesanos lá veio da VMarket ("Açúcar Refinado 1Kg",
  "Mostarda Cepera Galão", líquido em kg), e o import procurava só o nome
  exato — criaria um "Açúcar" ao lado do da VMarket e partiria o estoque.
  Agora ingrediente e mistura passam por `localizar_insumo` (nome exato,
  `EQUIVALENCIAS` com os nomes da VMarket, nome sem tamanho de pacote), a
  quantidade vai pela unidade do cadastro (`quantidade_para_insumo`: kg,
  densidade ≈ 1, ou fração da embalagem pelo conteúdo) e o relatório diz
  de onde veio cada linha ("Açúcar → Açúcar Refinado 1Kg 0.1 kg"). O que
  ainda for ser criado aparece no "⚠ vão ser CRIADOS", com os parecidos do
  cadastro ao lado. Onde a VMarket tem dois, a Julia confirmou (10/09):
  cebola = "Cebola Branca", limão = "Limão Taiti".

### 6.17 Levar dado pra produção: botão "Atualizar dados pelas planilhas" (removido)

**Removido em 2026-09-10, antes de ser usado.** A Julia já tinha passado pro
sistema, à mão, o que estava nas planilhas, e o objetivo dela é não usar
mais planilha nenhuma: dado de negócio é cadastrado e mantido nas telas
(custo do insumo no cadastro, ficha técnica no Cardápio, receita de mistura
no Estoque). Rodar o botão depois disso passaria por cima do que ela
cadastrou — o passo de custo regrava o custo de todo insumo que a planilha
conhece. Saíram o painel de Configurações, a rota
`POST /api/admin/atualizar-dados` e o `atualizar_dados.py`; os imports
avulsos continuam no repositório pra uso local. O texto abaixo fica como
registro do que o botão fazia.

**O banco de produção não vai no push.** Ele fica num volume do Dokploy
(`DATABASE_PATH`); o push leva só código. Tudo que é importado por script
no banco local fica só no local — foi assim por dois dias (09–10/09) até
alguém perceber. E o repositório `julialumi2/AdmFood` é **público** no
GitHub (confirmado pela API em 2026-09-10), então planilha com custo,
receita ou preço de fornecedor não pode ir pro git.

Solução: Configurações → "Atualizar dados pelas planilhas" (só admin,
`api_atualizar_dados` em `app.py`). Recebe as planilhas por upload (Ficha
Técnica do Artesanos, CMV do Açaí, Comparativos de Preços e, opcional, o
painel de Compras da Tradiça) e roda `atualizar_dados.py`, que executa os
passos na ordem certa. Cada passo confere o estado antes de mexer, então
rodar de novo não refaz nada:

1. Unidade do Provolone e do Brie empanado
2. Carne e frango de unidade pra grama
3. Receitas e gramaturas que faltam no Artesanos
4. Custo à mão errado da Batata Individual (o preço do quilo, R$ 12,50)
5. Receitas do Artesanos copiadas nas outras lojas (a migração pra
   ficha-por-loja copiou 19 hambúrgueres pra Tradiça e Açaí)
6. Ficha técnica do Açaí
7. Complementos do Açaí
8. Cardápio da Tradiça (só as abas da Tradiça, só se a loja ainda não
   tiver cardápio vindo da planilha — ver "Tradiça" abaixo)
9. Insumos e esqueleto de receita da Tradiça
10. Receita das misturas
11. Custo dos insumos (por último, pra pegar os insumos criados antes)

**Simular** roda o mesmo processo numa cópia do banco (feita pela API de
backup do SQLite, segura mesmo com o sistema gravando) e mostra o
relatório; **Aplicar** só libera depois de uma simulação bem-sucedida com
os mesmos arquivos e faz backup antes (`backups/` no mesmo volume).

**Reaproveitar o que foi cadastrado à mão.** Em produção os insumos do
Açaí foram cadastrados por pacote, com os nomes da planilha ("Amendoim
triturado 1kg"). `localizar_insumo` (`backend/nomes_insumo.py`) casa pelo
nome que o import daria, pelo nome da planilha ou pelo nome sem o tamanho
do pacote — nunca dois tamanhos diferentes ("Lata embalagem 500ml" não é
a de 300ml) e nunca quando dois insumos têm a mesma base (decisão
humana). O relatório lista os insumos que a loja já tinha e os que vão ser
criados, pra conferir duplicata antes de aplicar. A limpeza da receita
base do "monte o seu" tira só insumo de complemento — o que foi montado à
mão fica —, e a limpeza das cópias só desvincula insumo que também é do
Artesanos.

**Tradiça.** Não existe planilha de receita dos hot dogs. O passo 9 cria
os insumos (custo pela planilha de compras quando o tamanho do pacote está
no nome; salsicha "pct 5Kg" a R$ 35,17 fica sem custo porque pode ser o
pacote ou o quilo) e o esqueleto da receita — pão, salsicha e o que o nome
do produto garante —, com as gramas em branco pra Julia preencher na tela.
A lista de preços casa "Calabreso (com Calabresa)" com o item "Calabreso"
ignorando o parêntese (`ignorar_parenteses`, só na lista de preços: nas
vendas, "BACON (duplo)" não é o BACON simples).

O passo 8 só conta como "já tem cardápio" produto que veio da planilha
(`manual = 0`). Até a revisão de 2026-09-10 contava qualquer um: com a
Tradiça vazia, um único produto criado pelo "Novo item" fazia o passo pular
a lista de preços inteira. O produto criado na tela fica; se for um da
planilha escrito do jeito curto ("Calabreso"), vira a linha da planilha
("Calabreso (com Calabresa)") em vez de aparecer duas vezes — a tela não
tem como tirar produto do cardápio. O preço digitado nele fica, o vazio vem
da planilha, e foto e ficha técnica continuam. Sem par único (dois
parecidos, ou nenhum), ele fica como está e o relatório lista.

**Import de preços** (seção 6.1, corrigido em 2026-09-10): a planilha de
02/09 trocou a aba única das Tradiças por "Comparativo de preços ZN" e
"Comparativo de preços Simus", e o import pulava as duas sem avisar — por
isso as Tradiças estavam sem cardápio. Agora lê os dois formatos, compara
aba sem diferenciar maiúscula e **para com erro** se aparecer aba de preço
desconhecida. Produto criado pelo "Novo item" do Cardápio passou a entrar
no cardápio da loja (antes era criado mas nunca aparecia, porque a tela
lista o cardápio de preços) e é marcado `preco_cardapio.manual`, pra
reimportação da planilha não apagá-lo.

### 6.18 Embalagem pra viagem (só sai em delivery e retirada)

Pedido da Julia (2026-09-16): o milkshake do Artesanos vai no copo de
vidro no salão e no copo descartável com tampa, canudo e saco no delivery.
Com uma ficha só, ou a embalagem saía em todo pedido, ou não saía nunca.

- **Tabela `embalagem_viagem`** — mesmo formato da `ficha_tecnica`
  (`item_id`, `insumo_id`, `loja`, `quantidade` na unidade do insumo), à
  parte: a ficha continua sendo o que vai em todo pedido. Vale o grupo de
  ficha compartilhada (as duas Tradiças gravam juntas), `mesclar_insumo`
  leva as linhas junto e `excluir_item_cardapio` apaga. É por unidade do
  produto: a Julia confirmou que saco e guardanapo vão um por lanche.
- **Como o sistema sabe que o pedido saiu da loja:** o detalhe do pedido
  da Cardápio Web traz `order_type` (`delivery`, `takeout`, `onsite`,
  `closed_table`). `buscar_resumo_do_dia` passa como `tipo` e
  `salvar_itens_vendidos_do_dia` grava em `venda_item.tipo_pedido`.
  Delivery e retirada levam a embalagem; consumo no local e mesa não.
  Venda gravada antes da coluna (tipo nulo) cai no canal: iFood, 99Food e
  cardápio digital (`catalog`) levam; balcão (`portal`) e totem não
  (`_SQL_PRA_VIAGEM`). A ressincronização da madrugada preenche o tipo dos
  últimos 7 dias.
- **Conta:** `SQL_ITENS_CONSUMIDOS` ganhou a coluna `pra_viagem` nos três
  caminhos (produto, combo com composição e complemento, que herda o
  pedido do produto). `SQL_INSUMOS_CONSUMIDOS` junta a ficha (todo pedido)
  com a embalagem (só `pra_viagem = 1`) e é o que a baixa automática
  (seção 6.11) e o consumo médio (seção 6.6) leem — uma definição só de
  "quanto saiu". Com a lista vazia, os números são os mesmos de antes
  (conferido contra uma cópia do banco).
- **Tela:** no modal da ficha técnica, embaixo dos insumos, a seção
  "Embalagem pra viagem" com as mesmas linhas (insumo, quantidade, g/un).
  Escondida nos complementos. O modal de detalhe do produto mostra as
  embalagens e o botão "Editar embalagem". O `PUT` da ficha só troca a
  lista que vier no corpo (`insumos` e/ou `embalagemViagem`) e recusa o
  mesmo insumo duas vezes na lista.
- **Fora, por enquanto:** o custo do produto (CMV, Curva ABC) continua só
  com a ficha; a embalagem ainda não entra no custo dos canais de delivery.

### 6.19 Histórico da VMarket (carga de 2026-09-16)

A rede está saindo da VMarket: daqui pra frente cota, pede e conta só no
AdmFood. O último mês de lá entrou nas tabelas do fluxo de Compras, como se
tivesse sido feito aqui — sem tela nova.

- **O que entra:** fornecedores (casados com os já cadastrados pelo CNPJ ou
  pelo nome; só o que está vazio no cadastro é preenchido), cotações
  semanais fechadas com o preço de cada fornecedor e o escolhido, pedidos
  de compra por loja e contagens por loja. Cada registro guarda o id de lá
  (`id_vmarket` em fornecedor, cotacao, pedido_compra e contagem, com índice
  único), então a carga pode rodar de novo sem duplicar.
- **Estoque não muda na carga.** Contagem entra já aprovada, como histórico.
  Pedido de antes da contagem que virou o estoque (14/09) entra como
  recebido ("Importado da VMarket") sem somar nada; os de 14/09 em diante
  entram como enviados e aparecem em **Recebimentos**: é a loja confirmando
  o que chegou que soma no estoque, como num pedido feito aqui.
- **Ligações:** a cotação da semana aponta pras contagens da mesma semana
  (`requisicao_titulo`/`requisicao_prazo`), como uma cotação gerada pela
  Requisição. Pedido de produto homologado (sem cotação na VMarket) fica na
  cotação "Pedidos da VMarket sem cotação". Cada preço cotado também cria o
  vínculo insumo × fornecedor.
- **Unidades:** quem monta a carga lendo a VMarket já manda na unidade do
  insumo daqui. Lá o preço é por unidade de venda e mistura unidades entre
  fornecedores: bebida pedida em fardo com preço por lata (fardo de 6, 12 ou
  24), salsicha cotada por kg ou pelo pacote de 5 kg, guardanapo em sachê ou
  em caixa de 1.000, chá preto em galão (aqui é litro), hambúrguer
  vegetariano por unidade (aqui é kg, 10 por kg). A regra por insumo olha o
  tamanho do preço pra saber qual é.
- **Custo:** `custo_em_uso_por_insumo` passou a pegar, da cotação mais
  recente de cada insumo, o preço **escolhido** (o que foi comprado) — antes
  valia o último fornecedor lançado, e na VMarket o escolhido nem sempre é
  o mais barato. A última compra recebida continua ganhando da cotação, mas
  item de pedido com preço zero não conta mais como compra.
- **Economia da cotação** (lista de Cotações): o "maior preço" comparado ao
  vencedor ignora preço mais de 3x o do vencedor (`LIMITE_PRECO_COMPARAVEL`)
  — é de outra unidade de venda (óleo pela caixa contra o kg) e inventava
  uma economia dezenas de vezes maior que a real.
- **Rotas (admin):** `POST /api/admin/importar-vmarket` recebe um lote
  (`fornecedores`, `insumosNovos`, `cotacoes`, `pedidos`, `contagens`, cada
  parte opcional; `insumosNovos` na 6.23) numa transação só — item com
  insumo ou loja inválidos desfaz o lote.
  `DELETE /api/admin/importar-vmarket` desfaz a carga (cotações, pedidos e
  contagens importados), menos pedido que a loja já confirmou aqui e a
  cotação dele; os fornecedores e os insumos fora de linha ficam. A carga também aceita
  `precosHomologados` (`fornecedorVmarket`, `insumoId`, `preco`, `validade`)
  — vira o fornecedor homologado do insumo (ver 6.20); desfazer não apaga.

### 6.20 Fornecedor homologado e pedido direto (2026-09-16)

Na VMarket, 68 dos 159 pedidos do último mês antes da migração saíram direto,
pelo preço já combinado com o fornecedor, sem cotação. Aqui:

- **Onde se define:** no cadastro do insumo (Insumos → editar), campos
  "Fornecedor homologado", "Preço combinado" e "Vale até". Colunas
  `insumo.fornecedor_homologado_id`, `preco_homologado` (na unidade do
  insumo; a tela digita por kg/litro quando o insumo é em grama/ml, igual ao
  custo) e `validade_preco_homologado` (`AAAA-MM-DD`, vale até o fim do dia;
  em branco vale até alguém mudar). Um fornecedor homologado por insumo.
  Fornecedor sem preço dá 400; tirar o fornecedor limpa preço e validade. O
  homologado entra na lista de fornecedores do insumo (`insumo_fornecedor`)
  mesmo se não estiver marcado. Os três campos só vão pra admin em
  `GET /api/insumos` (como o custo).
- **Vale** quando o fornecedor está ativo, o preço é maior que zero e a
  validade está em branco ou é de hoje em diante (`_homologados_validos`).
- **Requisição → "Fazer Cotação/Pedido"** (`gerar_cotacao_do_deficit`): do
  déficit, o insumo com homologado valendo vira pedido direto pro
  fornecedor, com a mesma quantidade por loja; o resto vai pra cotação como
  antes. Se todo o déficit for homologado, não abre cotação (`cotacaoId`
  null) e a tela vai pra Pedidos. O pedido guarda a requisição
  (`pedido_compra.requisicao_titulo`/`requisicao_prazo`): clicar de novo
  devolve o que já foi gerado, e excluir a requisição apaga esses pedidos.
  Preço vencido ou fornecedor inativo: o insumo vai pra cotação.
- **Pedido extra:** Pedidos → "Novo pedido". Aparecem os fornecedores que
  são homologados de algum insumo com preço valendo; escolhido o
  fornecedor, uma coluna de quantidade por loja (as lojas marcadas no
  cadastro dele, ou as quatro; "Pedir pra outras lojas também" abre todas),
  com estoque e mínimo da loja, total por loja e aviso de pedido mínimo
  (que vale por loja). Gerar abre o pedido, de onde sai o WhatsApp.
- **Regras do pedido direto** (`_gravar_pedidos_diretos`): um pedido por
  fornecedor × loja; os do mesmo fornecedor dividem o token — uma mensagem
  só de WhatsApp, "feito em conjunto", como no "Gerar pedidos" da cotação. O
  preço é sempre o do cadastro, nunca o da tela. Nasce `enviado` sem
  WhatsApp (pendente de envio) e segue por Pedidos e Recebimentos. O insumo
  passa a valer pra loja (`insumo_loja` + linha zerada em `estoque_insumo`),
  senão o recebimento não teria onde somar.
- **Cotação dos pedidos diretos:** todo pedido pertence a uma cotação
  (Pedidos e Recebimentos buscam os dois juntos), então os pedidos diretos
  ficam na cotação "Pedidos diretos (preço homologado)", marcada
  `cotacao.pedido_direto = 1`. Cotação marcada não aparece na lista de
  Cotações nem no histórico de compras — a da carga da VMarket ("Pedidos da
  VMarket sem cotação") também foi marcada.
- **Rotas (admin):** `PUT/POST /api/insumos` com `fornecedorHomologadoId`,
  `precoHomologado`, `validadePrecoHomologado`; `POST /api/pedidos/direto`
  (`{fornecedorId, itens: [{insumoId, loja, quantidade}]}`);
  `POST /api/requisicoes/conferencia/gerar-cotacao` devolve também
  `pedidosDiretos`.

### 6.21 Pendências de Compras no menu (2026-09-16)

No lugar de uma tela de painel (a Julia preferiu assim), o menu de Compras
mostra quanto está parado em cada etapa, só pra admin:

- **Requisições:** contagem que a loja não respondeu + contagem respondida
  esperando aprovação. Vermelho se alguma sem resposta passou do prazo.
- **Cotações:** fornecedor convidado que não mandou preço + cotação aberta
  com insumo sem vencedor, ou com vencedor que ainda não virou pedido (só o
  que tem quebra por loja, que é o que "Gerar pedidos" usa). Vermelho se
  algum convite passou do prazo.
- **Pedidos:** pedido gerado que não foi enviado pelo WhatsApp.
- **Recebimentos:** pedido enviado que não foi recebido. Vermelho quando
  algum passou de `DIAS_ENTREGA_ATRASADA` (3) dias desde o envio pelo
  WhatsApp (ou da criação, se não passou por ele).
- **Compras** (o grupo): a soma, que some quando o grupo está aberto.

Contagem e cotação criadas há mais de `DIAS_PENDENCIA_COMPRAS` (30) dias não
contam — é abandono, não pendência; pedido não tem esse corte. Passar o
mouse no número mostra o que ele soma. Os números carregam com a tela e
recarregam depois de mexer em Pedidos e Recebimentos. Rota:
`GET /api/compras/pendencias` (admin, `pendencias_compras`).

### 6.22 Compra feita por fora (2026-09-17)

Card #36 do ClickUp da Julia: o que se compra sem passar por cotação nem
pedido daqui (mercado, padaria, entrega combinada no WhatsApp) também entra
no sistema, com quem comprou, a data e a nota fiscal.

- **Tela:** Pedidos → "Lançar compra por fora". Campos: onde comprou
  (fornecedor cadastrado ou nome novo, que vira fornecedor só com o nome),
  loja, quem comprou (abre com o nome de quem está logado), data da compra
  (até hoje), itens, número e valor da nota, foto ou PDF da nota (até 15 MB)
  e "Somar as quantidades no estoque da loja" (marcado). Cada item é um
  insumo do cadastro (mistura feita na casa fica de fora), com quantidade e
  preço na unidade do insumo — kg/L no lugar de g/ml, como o custo — ou na
  unidade de compra do cadastro (ex.: "Pacote (7 un)"), convertida antes de
  gravar. A tela avisa quando o valor da nota não bate com o total.
- **Como grava** (`lancar_compra_fora`): um `pedido_compra` já `recebido`,
  com `compra_fora = 1`; quem comprou em `recebido_por`, o dia da compra em
  `recebido_em` e `criado_em`, `numero_nf`, `valor_nf`, `divergencia_nf`
  (só marca, sem tarefa no ClickUp: quem lança digitou os dois),
  `nota_fiscal_arquivo` e `somou_estoque`. Fica na cotação oculta "Compras
  feitas por fora" (`pedido_direto = 1`, igual à dos pedidos diretos; a
  busca da cotação oculta agora é pelo título). O insumo passa a valer pra
  loja e o fornecedor ganha a loja. Por estar recebido, o preço vira a
  "última compra" e o custo em uso do insumo quando é a compra mais recente
  (`buscar_ultima_compra_por_insumo` usa `recebido_em`).
- **Nota fiscal:** o arquivo fica em `notas_fiscais/`, ao lado do banco (no
  volume persistente, como as fotos do cardápio; fora do git). Abre por
  `GET /api/pedidos/<id>/nota-fiscal`, só admin.
- **Detalhe do pedido:** sem etapas de entrega; o subtítulo mostra data,
  quem comprou, número e valor da nota e se não somou no estoque, e o botão
  "Ver nota fiscal" aparece quando tem arquivo. Avançar/voltar etapa dá 400
  (voltar faria a compra cair em Recebimentos e somar de novo). "Excluir
  compra" tira as quantidades do estoque quando elas tinham somado e apaga a
  nota. O preço unitário dos itens, em todo pedido, passou a aparecer por
  kg/L nos insumos em grama/ml.
- **Não muda:** Recebimentos e os números do menu (a compra já nasce
  recebida) e a lista de Cotações.

### 6.23 Histórico inteiro da VMarket e filtro de período (2026-09-17)

O card #36 pediu também o histórico desde que a rede começou na VMarket
(dez/2024): 2.634 pedidos, 114 cotações e 125 contagens, dos quais o último
mês já tinha vindo na carga de 16/09 (6.19). A carga do resto usa a mesma
rota (`POST /api/admin/importar-vmarket`, em lotes), com duas partes novas:

- **Produto que saiu de linha:** a VMarket tem 152 produtos inativos. Versão
  antiga de um produto de hoje (mesmo item e mesma unidade: "Coca lata fd
  12 tradiça", "Bacon Fatiado Sadia", "Nutella 3Kg"...) entra no insumo de
  hoje. O resto vai em `insumosNovos` (`{idVmarket, nome, unidadeMedida}`):
  vira insumo da categoria "Fora de linha", com a unidade de lá, estoque
  zerado nas lojas e sem valer pra nenhuma (não entra em contagem nem nas
  tabelas do Estoque, mas aparece em "Insumos da loja" pra ligar ou mesclar
  depois). Nome igual a um insumo de hoje ganha " (antigo)". O item da carga
  aponta pra ele como `"vm:<id do produto na VMarket>"` (coluna
  `insumo.id_vmarket`), então lote seguinte e carga repetida acham o mesmo
  insumo.
- **Preço velho não passa na frente:** `custo_em_uso_por_insumo` passou a
  olhar a data. Compra e cotação com mais de `DIAS_PRECO_RECENTE` (90) dias
  só valem quando o insumo não tem nada mais novo, nem custo no cadastro.
  Ordem de quem ganha: compra recente, cotação recente, cadastro, compra
  antiga, cotação antiga (receita de mistura continua ganhando de tudo).
  Sem isso, a carga trocaria o custo do cadastro do Oreo por uma compra de
  dez/2024 e a cotação de 14/09 do creme de cebola por uma compra de março.
  Na simulação em produção antes da carga, sobraram só trocas por compra
  recente (entre elas um custo de cadastro que estava errado) e custo novo
  pra insumo que não tinha nenhum.
- **Desempenho:** com ~26 mil itens de pedido, a "última compra" de cada
  insumo (`buscar_ultima_compra_por_insumo`, base do custo em uso) levava
  40 s com a subconsulta por linha; agora é uma janela por insumo (0,1 s).
  Índices novos: `pedido_compra_item(insumo_id)` e
  `pedido_compra(cotacao_id)`.
- **Filtro de período** (abre em 30 dias, com 90 dias, 12 meses e tudo):
  Pedidos (pelo dia do pedido; pedido ainda não recebido aparece sempre, é
  ele que conta no menu), Cotações (o filtro "Dias" já existia e passou a
  abrir em 30, com 90 e 365) e a aba Compras dela, e Requisições (as duas
  tabelas, pelo dia em que foi aberta). Tudo no navegador, sobre a lista que
  já vem inteira.

### 6.24 Nota fiscal no pedido normal (2026-09-17, foto de volta em 2026-09-18)

A compra por fora (6.22) já guardava número, valor e foto/PDF da nota, mas o
pedido que vem de cotação só tinha o valor — a nota em si ficava na VMarket ou
no papel. Saindo da VMarket, isso vira buraco: a NF é o documento que prova o
que foi comprado e por quanto.

- **No recebimento** (`recebimentos.html`): dois campos novos, opcionais —
  "Número da nota fiscal" e "Foto ou PDF da nota". O número vai junto na
  confirmação (`numeroNf` em `POST /api/recebimentos/<id>/confirmar`), e o
  arquivo sobe logo depois, numa chamada separada. Se o anexo falhar, o
  recebimento continua valendo (o estoque já entrou) e o aviso diz pra anexar
  depois — em vez de perder a confirmação inteira por causa do arquivo.
- **Depois** (tela do pedido): botão "Anexar nota fiscal" em qualquer pedido já
  recebido, que vira "Trocar nota fiscal" quando já existe uma. A nota quase
  nunca chega junto com a mercadoria: vem por e-mail no dia seguinte.
- `POST /api/pedidos/<id>/nota-fiscal` (multipart: `notaFiscal` e/ou
  `numeroNf`) aceita os dois juntos ou só um. O arquivo vira `nf_<uuid>.<ext>`
  em `notas_fiscais/` (mesmas extensões e limite de 15 MB da compra por fora), e
  o antigo só é apagado depois que o banco já aponta pro novo
  (`definir_nota_fiscal_pedido` devolve o nome anterior pra isso).
- **Quem recebe anexa**: operação incluída, só na loja dela — é o funcionário
  que recebe a mercadoria e tira a foto. **Trocar** uma nota que já está lá
  (o que apaga a anterior) fica com admin e gerente, assim como o botão de
  anexar depois na tela do pedido (operação não abre Pedidos) e ver a foto.
- O subtítulo do pedido passou a mostrar o número da nota também no pedido
  normal, não só na compra por fora.

**Idas e vindas da decisão:** em 2026-09-17 a foto saiu do pedido normal (ficou
só o número), pensando que o XML da NF-e com a contabilidade já cobria. Em
2026-09-18 o chefe respondeu: "Não precisa puxar NF por enquanto, apenas as
fotos que os funcionários colocarem no recebimento já tá ok" — então as 57
notas antigas da VMarket (dez/2024–jan/2025) ficam de fora, não há integração
com XML/SEFAZ, e a foto voltou, agora liberada pra operação.

Teste: `teste_nota_fiscal_pedido.py` no scratchpad — 22 checagens (número no
recebimento, operação anexando a foto, operação barrada ao trocar, troca pela
gestão apagando o arquivo antigo, só o número sem arquivo, extensão recusada,
outra loja, 404 de pedido inexistente e o registro de quem anexou).

### 6.26 Envio das cotações pela extensão do WhatsApp (card #26, 2026-09-18)

O chefe escolheu a extensão do Chrome ("se a VMarket já faz e nunca deu
problema, bora"), publicada na Chrome Web Store. Na tela da cotação, o cartão
de convites ganhou "Enviar os N convites pelo WhatsApp": o AdmFood monta a
lista em `<script type="application/json" id="fila-whatsapp">` (convite em
aberto, dentro do prazo e com telefone: id, fornecedor, telefone, mensagem
com o link) e a extensão, ao clique, manda um por vez pelo WhatsApp Web da
pessoa (pausas sorteadas, confere a mensagem antes de enviar, botão Parar,
painel de andamento). O botão só aparece com a extensão instalada — ela marca
o `<html>` com `data-admfood-extensao` e dispara `admfood:extensao-pronta`;
sem ela aparece o aviso de instalar. A cada envio a extensão dispara
`admfood:envio-whatsapp` e a linha do convite ganha "enviado" (só na tela,
não fica gravado). Da versão 1.0.1 em diante, cada linha também tem
"Enviar o convite pelo WhatsApp" (`data-admfood-envio=<id do convite>`), que
manda só aquele fornecedor, sozinho (pedido dela, 18/09); convite respondido
ou vencido fica com "Abrir no WhatsApp" (wa.me, manual). Sem a extensão, a
linha segue com "Enviar por WhatsApp" (wa.me). Risco aceito pelo chefe: automação no WhatsApp comum pode
levar o número a ser bloqueado. A política de privacidade exigida pela loja
é `privacidade-extensao.html` (pública, sem login). O código da extensão fica
em `extensao-whatsapp/` (manifest V3, só `storage`, `alarms` e acesso ao
domínio do AdmFood e ao web.whatsapp.com).

**Instalação à mão** (2026-09-18, decisão dela: sem a Chrome Web Store por
enquanto, pra não pagar a taxa de US$ 5). A página `instalar-extensao.html`
(admin e gerente; linkada do aviso da cotação) tem o passo a passo — baixar,
extrair numa pasta que não vai ser apagada, Modo do desenvolvedor, Carregar
sem compactação — e diz se a extensão está instalada neste Chrome e se está
em dia. O botão de baixar é `GET /api/extensao-whatsapp/pacote.zip`, que monta
o zip na hora a partir da pasta `extensao-whatsapp` do repositório (manifest,
os três scripts e os ícones, dentro de `admfood-whatsapp/`); a versão mais
nova sai de `GET /api/extensao-whatsapp/versao` (o `version` do manifest).
Instalada à mão, ela não se atualiza sozinha: com versão nova no ar, a
cotação mostra "Tem versão nova da extensão" e a página explica como
atualizar (extrair por cima da mesma pasta e clicar no ↻). Pra lançar versão
nova, basta subir o `version` do manifest e dar push.

### 6.25 Evolução do preço de um insumo (card #40, 2026-09-18)

Tela nova em **Insights → Evolução do preço** (`precos.html`, admin e
gerente; operação não vê preço). O histórico de compra inteiro da VMarket
(6.23) só servia pro custo do CMV; aqui ele vira série no tempo.

- **Mais subiram / Mais caíram**: pra cada insumo com compra recebida antes
  *e* dentro do período (30 dias, 90, 6 meses, 1 ano), compara o último preço
  pago antes do período com o último pago dentro dele. Clicar no insumo abre o
  histórico dele.
- **Preço 4x maior ou 4x menor vem marcado "confira a unidade"** e vai pro fim
  da lista: quase sempre é compra lançada em outra unidade (caixa em vez de
  unidade), não aumento de verdade (`FATOR_PRECO_SUSPEITO`).
- **Um insumo no tempo**: último preço, menor e maior pago, variação desde a
  primeira compra, gráfico de cada compra recebida (com as cotações recebidas
  como pontos soltos — cotação é oferta, não pagamento) e a tabela de compras
  com fornecedor, loja e quantidade.

Só entra compra **recebida** com preço maior que zero; a data é a do
recebimento (ou a do pedido, pra quem veio sem data de recebimento). O preço é
o de `pedido_compra_item.preco_unitario`, já na unidade do insumo — o mesmo
número que o custo em uso do CMV usa.

Funções: `historico_precos_insumo` e `variacoes_de_preco` em
`backend/armazenamento.py`. Rotas: `GET /api/precos/variacoes?dias=` (7 a 730,
padrão 90) e `GET /api/precos/insumo/<id>`.

Teste: `teste_evolucao_preco.py` no scratchpad (24 verificações).

## 7. API — principais endpoints

Todos em `app.py`, prefixo `/api`.

**Faturamento / Insights**
- `GET /api/faturamento-ontem` — total do dia anterior por loja + rede
- `GET /api/faturamento-rede-diario?dias=N` — série diária da rede pro gráfico da Home (padrão 7, máx 90)
- `GET /api/canal-analise?unidade=&dia=` — quebra por canal de venda de um dia
- `GET /api/faturamento-mesmo-dia-semana?unidade=&dia=` — todas as ocorrências do mesmo dia da semana no mês (usado no relatório comparativo)
- `GET /api/insights?inicio=&fim=&diaSemana=` — visão completa por período, com filtro opcional por dia da semana; retorna um bloco por loja + "geral"
- `GET /api/insights-automaticos` — compara ontem contra a média dos 7 dias anteriores, destaca variações >8% (usado nos cards da Home)
- `GET /api/home/gestao` — tudo que a Home tem além do faturamento: estoque crítico por loja, saúde financeira do mês, atividades do dia, insights, top 3 da Curva A da rede e custos em alta (admin e gerente)

**Configuração / Sincronização**
- `GET /api/config/lojas` — status de cada loja (token mascarado, última sincronização)
- `POST /api/sincronizar-agora?dia=AAAA-MM-DD` — dispara sincronização em background (sem `?dia`, sincroniza ontem)

**Receita de mistura / conteúdo por pacote** (seções 6.14 e 6.16)
- `GET /api/insumos/<id>/receita` — receita da mistura + custo da batelada + preço de todo insumo
- `PUT /api/insumos/<id>/receita` — substitui a receita (`rendimento` + `ingredientes`); lista vazia apaga — só admin
- `POST|PUT /api/insumos` — aceitam `conteudoPorUnidade` + `unidadeConteudo` ("1 un = 1000 g")

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
- `PUT /api/itens-cardapio/<id>/ficha-tecnica` — substitui a lista inteira de insumos (`insumos`) e/ou da embalagem pra viagem (`embalagemViagem`) do item na loja; só troca a lista que vier no corpo (seção 6.18) — só admin

**Evolução do preço** (seção 6.25, admin e gerente)
- `GET /api/precos/variacoes?dias=N` — o que mais subiu e caiu no período (último preço antes × último dentro)
- `GET /api/precos/insumo/<id>` — compras recebidas e cotações de um insumo, da mais antiga pra mais nova

**Fornecedores**
- `GET /api/fornecedores` — diretório completo (ativos e inativos)
- `POST /api/fornecedores` — cadastrar fornecedor novo — só admin
- `PUT /api/fornecedores/<id>` — editar campos (parcial, inclusive `ativo`) — só admin

**Cotações**
- `GET /api/cotacoes` — lista com contagem de insumos/fornecedores distintos já com preço
- `POST /api/cotacoes` — criar cotação (só `titulo`) — só admin
- `GET /api/cotacoes/<id>` — detalhe: preços agrupados por insumo, ordenados por preço
- `PUT /api/cotacoes/<id>` — editar título e/ou status (`aberta`/`fechada`) — só admin
- `DELETE /api/cotacoes/<id>` — excluir cotação com preços, itens e convites — só admin. Cotação que já tem pedido dá 400 (cancelar os pedidos antes): o pedido sumiria da tela de Pedidos e o Recebimentos não abriria mais. Na lista, a lixeira dessas cotações fica apagada e o clique explica o motivo (`totalPedidos` no `GET`)
- `POST /api/cotacoes/<id>/precos` — lançar/corrigir preço (upsert por insumo+fornecedor) — só admin
- `DELETE /api/cotacoes/<id>/precos/<preco_id>` — remover um preço lançado — só admin
- `PUT /api/cotacoes/<id>/precos/<preco_id>/selecionar` — marcar vencedor do insumo (desmarca os demais) — só admin

**Pedido direto, compra por fora e pendências** (seções 6.20 a 6.22; o fornecedor homologado vai no `PUT /api/insumos/<id>`)
- `POST /api/pedidos/direto` — pedido pelo preço homologado, sem cotação, um por loja — só admin
- `POST /api/pedidos/compra-fora` — lança compra feita por fora já recebida (multipart: `fornecedorId` ou `fornecedorNome`, `loja`, `compradoPor`, `dataCompra`, `numeroNf`, `valorNf`, `somarEstoque`, `itens` em JSON e o arquivo `notaFiscal`) — só admin
- `GET /api/pedidos/<id>/nota-fiscal` — foto/PDF da nota do pedido — admin e gerente
- `POST /api/pedidos/<id>/nota-fiscal` — anexa ou troca a nota de um pedido já recebido (multipart: `notaFiscal` e/ou `numeroNf`, ver 6.24) — qualquer perfil na própria loja; trocar uma nota já anexada, só admin e gerente
- `GET /api/compras/pendencias` — quanto está parado em cada etapa, pros números do menu — só admin

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

**Gestão de funcionários (só `papel=admin`)**
- `GET|POST /api/usuarios` — listar / criar membro
- `PUT /api/usuarios/<id>` — editar nome/papel/ativo, opcionalmente resetar senha
- `DELETE /api/usuarios/<id>` — excluir
- Admin não consegue se autodesativar, se rebaixar pra "equipe" nem se autoexcluir pela própria conta

## 8. Login e controle de acesso

Adicionado em 2026-08-19. Cada pessoa da equipe tem seu próprio usuário
(e-mail + senha com hash PBKDF2, via `werkzeug.security`), com papel
`admin`, `gerente` ou `operacao` (ver 8.0). Sessão via cookie assinado
(`HttpOnly` + `SameSite=Lax`, `Secure` em produção).

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

### 8.0 Perfis de acesso (card #35, 2026-09-17)

Até aqui só existiam `admin` e `equipe`, todo mundo enxergava as 4 lojas e a
diferença era só quais botões apareciam. Com a rede crescendo, a Julia pediu
pra "arquitetar e estruturar os acessos dos funcionários". Ela escolheu três
perfis e uma loja por funcionário:

| Perfil | Alcance | O que faz |
| --- | --- | --- |
| `admin` | a rede inteira | tudo, inclusive funcionários, integrações, ClickUp e Zona de perigo |
| `gerente` | uma loja | compras (cotação, pedido, recebimento), estoque e cadastro de insumo, ficha técnica e as vendas da loja |
| `operacao` | uma loja | o dia a dia: contagem/requisição, recebimento e consulta de insumo, custo, ficha técnica e preparo — sem criar pedido nem editar cadastro |

A coluna `usuario.loja` guarda a loja (NULL = a rede inteira, o caso do
admin). A migração converte o papel antigo `equipe` em `operacao`. Um
funcionário que ficasse sem loja não enxerga loja nenhuma (`SEM_LOJA` em
`app.py`) — nunca todas.

**Como isso é garantido (tudo em `app.py`):**

- `_loja_no_escopo(loja)` troca a loja que veio na requisição pela loja da
  pessoa. Todas as rotas que recebem `loja`/`unidade` passam por ela, então
  não adianta trocar o parâmetro na mão: a resposta é sempre da loja dela.
- `_loja_visivel(loja)` vale pro caso contrário, quando a loja vem do próprio
  registro — abrir um pedido ou uma contagem de outra loja dá 403.
- `_so_da_minha_loja(lista)` filtra as listagens (Pedidos, Recebimentos,
  Contagens). O que não tem loja (uma cotação da rede) continua aparecendo.
- `_exigir_gestao()` (admin + gerente) substituiu `_exigir_admin()` nas ~60
  rotas de compra e cadastro; `_exigir_equipe()` libera as 3 rotas de contagem
  pra operação. Continuam só do admin: funcionários, preço do cardápio,
  conferência de requisição, datas especiais, importação da VMarket, Zona de
  perigo, faturamento semanal, exclusão/mesclagem de insumo e ajuste de
  produto pendente.
- `PAGINAS_POR_PAPEL` bloqueia a tela inteira: quem não pode abrir cai na
  página inicial do perfil dela (gerente no Resumo, operação em Insumos).

**No frontend (`script.js`)**: `_possoGerir()` (admin ou gerente) no lugar de
`papel === 'admin'` nas telas de gestão, `_ajustarMenuAoPerfil()` tira do menu
o que o perfil não abre, e `_travarNaLojaDoFuncionario()` deixa só a loja da
pessoa nos seletores (e some com a aba "Visão Geral (Todas)", que não quer
dizer nada pra quem tem uma loja só).

A tela fica em Configurações → **Funcionários**, com perfil, loja, ativar/
desativar e redefinir senha. O campo Loja some quando o perfil é Admin.

Teste: `teste_acessos.py` no scratchpad — 30 checagens cobrindo as três
contas (o que cada uma vê, o que recebe 403 e pra onde é redirecionada).

### 8.4 Registro de ações — quem fez o quê (2026-09-17)

Só o recebimento e umas poucas telas guardavam o nome de quem fez; "quem mudou
esse estoque?" não tinha resposta, com quatro admins mexendo em pedido,
cadastro e contagem. Pedido dela ao planejar a entrada de funcionários.

**Um gancho só, não 80 chamadas espalhadas:** `@app.after_request`
(`_registrar_acao_da_requisicao` em `app.py`) grava uma linha da tabela
`registro_acao` pra toda requisição `/api/*` que NÃO é GET — com quem fez
(nome copiado na linha, pra excluir a pessoa não apagar o rastro), papel,
loja, método, rota, caminho, status e um resumo do corpo. Rota nova já nasce
registrada, e leitura (GET) não polui.

- `DESCRICAO_DA_ACAO` traduz (método, rota) pra frase ("Aprovou a contagem
  (mexe no estoque)"); sem tradução, fica o método e a rota mesmo.
- `CHAVES_SENSIVEIS_NO_REGISTRO` tira senha e token do resumo — o login entra
  no registro com o e-mail, nunca com a senha. Login que não passou vira
  "Tentativa de login que não entrou".
- **Tentativa barrada também é registrada** (status 403), que é justamente o
  que interessa quando alguém tenta o que não pode.
- O gancho nunca derruba a resposta: falha no registro só aparece no log.
- `GET /api/admin/registro?dias=&usuarioId=&limite=` (só admin) alimenta o
  painel **Registro de atividade** em Configurações, com filtro de período.
- Guarda um ano (`limpar_registro_acoes_antigos`, agendada às 3h45 junto do
  backup).

**Sessão mais curta junto:** `PERMANENT_SESSION_LIFETIME` passou a 7 dias — o
padrão do Flask é 31, tempo demais pra celular perdido ou emprestado no salão.

Teste: `teste_registro_acao.py` no scratchpad, 20 checagens (login sem senha,
ação real, tentativa barrada, GET que não registra, permissão da rota, faxina
do que passou de um ano e a sessão de 7 dias).

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

### 8.3 Cópia de segurança do banco (2026-09-17)

Todo o sistema vive num arquivo SQLite só, num volume do Dokploy — hoje com
2.635 pedidos, o histórico inteiro desde dezembro de 2024. Enquanto a VMarket
existia ela era a rede de segurança; saindo de lá, sem cópia um erro de
operação ou um arquivo corrompido leva tudo. Daí esta rotina.

**Automático:** às 3h30 (depois da sincronização das 3h), `rodar_backup_diario`
em `backend/armazenamento.py` grava `backups/admfood-AAAA-MM-DD.db` do lado do
banco. Usa `VACUUM INTO`, que escreve uma cópia consistente e já compactada com
o sistema em uso (sem travar quem está lendo); em SQLite anterior ao 3.27 cai
na API `Connection.backup`. Escreve em `.parcial` e só renomeia no fim, então
cópia interrompida no meio nunca passa por cópia boa. Desliga com
`BACKUP_AUTOMATICO=false`.

**Faxina:** guarda as cópias dos últimos 14 dias e a do dia 1º de cada mês por
um ano (`limpar_backups_antigos`). O que não tem nome de backup não é tocado.

**Na tela** (Configurações → Cópia de segurança, só admin): última cópia,
quantas estão guardadas, tamanho do banco, botão "Gerar cópia agora" e a lista
das 7 últimas pra baixar. O botão **"Baixar cópia completa (.zip)"** monta na
memória um pacote com o banco + `notas_fiscais/` + `cardapio_fotos/` — é esse
arquivo que reconstrói o sistema do zero.

**O limite, que está escrito na própria tela:** a cópia diária fica no MESMO
volume. Ela salva de erro de operação e de banco corrompido, não de perder o
servidor. Pra isso a cópia precisa sair de lá — baixando o .zip de vez em
quando, ou ligando o backup de volume do próprio Dokploy.

Rotas (todas só admin): `GET/POST /api/admin/backups`,
`GET /api/admin/backups/<arquivo>` (só aceita o nome no formato
`admfood-AAAA-MM-DD.db`) e `GET /api/admin/backup-completo`.

Teste: `teste_backup.py` no scratchpad — 25 checagens (cópia abre e tem os
mesmos dados, faxina por idade, nome fora do padrão não baixa nada, gerente
recebe 403, zip traz banco e anexos).

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
9. **Aviso de estoque baixo/vencendo + quantidade ideal inteligente** — 🟡 em andamento (iniciado 2026-08-25). Pronto: schema de lotes de validade (`lote_insumo`) e card "Lotes vencendo" com botão de resolver (seção 6.4); cálculo de consumo médio a partir de Ficha Técnica × vendas reais (`venda_item` + `consumo_medio_insumo`) e coluna "Consumo médio/dia" na tela de Estoque (seção 6.6); coluna "Qtd. ideal (7 dias)" = consumo médio × 7, com "comprar X" destacado quando o atual fica abaixo do ideal (concluído em 2026-08-25). **"Quantidade ideal inteligente"** (as 3 peças que a Kethllyn pediu no roteiro de compras, ver seção 6.9) ✅ concluída em 2026-08-27: ajuste manual por insumo/loja, copiar de loja parecida (loja nova sem histórico) e datas especiais (feriado/evento aumentando a conta calculada com antecedência) — deliberadamente **sem** IA/caixa-preta, ela pediu conta simples e visível. Falta: (a) a Ficha Técnica ficar completa pras 4 lojas — em 2026-09-10: Artesanos com 26 produtos (7 gramaturas pendentes), Açaí com 30 de 32 produtos + 19 complementos (seções 6.15 e 6.17), Tradiça com o cardápio oficial e o esqueleto das receitas, gramas a preencher na tela (seção 6.17); (b) o "aviso" em si sendo empurrado (WhatsApp) — hoje é passivo, só aparece pra quem abrir a tela; depende do item 2.

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

10. **Baixa automática de estoque por venda real (produto + complemento) e "quebra"** — 🟡 fase 2 concluída em 2026-09-08 (documento "Motor de Sugestão de Compra Inteligente" do chefe da Julia — ver seção 6.11). **Fase 1** ✅ (ver "Ficha técnica de complemento" na seção 6.5) — só a receita do complemento em si dentro do AdmFood. **Fase 2 (Etapa 0 do motor)** ✅ — baixa automática de estoque a partir da venda do **produto principal**, casado com a Ficha Técnica, com fila de pendência + vínculo manual permanente (seção 6.11); por enquanto só Hamburgueria Artesanos. **Atualização de 2026-09-10**: ✅ complemento escolhido no pedido virou baixa e CMV (seção 6.15); ✅ baixa ligada também no Açaí, a partir de 11/09; ✅ receita de mistura em cascata (seção 6.16); ✅ Etapas 6, 8 e 10 do documento do chefe (seção 6.12). **Ainda não iniciadas**: (b) comparação com a Contagem física mostrando a quebra — é a Etapa 7 (Índice de Quebra), que depende de compras recebidas pelo sistema; (c) pedido de compra automático a partir da quebra; (d) baixa na Tradiça, quando as gramas dos hot dogs estiverem preenchidas; Etapas 1–4 (médias ponderadas, margem de segurança variável, calendário de eventos) precisam de ~4 semanas de consumo real acumulado; Etapa 9 (Sugestão Tripla) depois delas.

11. **Cotação manual gerar pedido de compra de verdade** — 🟡 decisão em
aberto (2026-09-04). Hoje "Gerar pedidos" só funciona pra cotação que
nasceu de uma Requisição (tem quebra de quantidade por loja em
`cotacao_item_loja`); cotação manual/catálogo completo (estilo VMarket,
ver 6.9) não tem essa quebra, então o botão fica escondido nela. Julia
perguntou pra Kethllyn se isso precisa mudar (cotação manual virando
pedido real também, o que exigiria uma etapa nova de "quantidade por
loja" antes de gerar) ou se cotação manual fica só pra pesquisa de
preço/marcar vencedor, com o pedido real sempre saindo da Requisição —
aguardando resposta.

12. **Pendências de informação da loja** (levantadas em 2026-09-10 — o
sistema está pronto, falta o número):
   - **Tradiça**: gramas de cada hot dog (esqueleto já na tela), ficha do
     Franguitos, preço do pão de hot dog (não aparece nas compras), da
     salsicha (os R$ 35,17 do "pct 5Kg" são do pacote ou do quilo?) e do
     requeijão; receita do Purê (batata + leite + margarina) pela tela de
     receita de mistura.
   - **Artesanos**: 7 gramaturas (Queijo ×3, Queijo cheddar, Catupiry ×2,
     Maionese branca); peso de 1 disco de Catupiry (o Big Jump está com
     "1 g"); quantos limões vão numa batelada de Maionese da Casa;
     rendimento real de cebola caramelizada, cebola crispy e bacon
     empanado (a planilha diz que rendem a soma dos ingredientes).
   - **Açaí**: conteúdo de cada pacote nos insumos contados por unidade
     ("Cada unidade tem 1000 g"); porção de creme como topping e do
     Chocoball (valores de partida 60 g e 30 g); preço do Chocoball;
     contagem de estoque antes do primeiro pedido do dia em que ela ligar
     a baixa automática (adiada em 10/09 — ficha ainda não está 100%).
   - **Segurança**: o repositório no GitHub é público — tornar privado
     (antes, confirmar que o Dokploy tem acesso ao GitHub, senão o deploy
     para).

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
- Visual do menu lateral (redesenhado em 2026-09-14, pedido da Julia; só
  CSS em `theme.css`, o HTML das páginas não mudou): encostado na borda da
  tela e sem cantos arredondados (deixou de ser o cartão flutuante, então
  `--sidebar-width-collapsed` voltou a 80px); a tela aberta é uma
  "comanda" creme com a borda da direita picotada (`::after` com meias-luas
  da cor do menu); o picote tracejado separa a logo e o rodapé e prende os
  subitens ao grupo; o grupo da tela aberta acende (e, com o menu
  recolhido, vira a própria comanda, via `:has(.menu-subitem.active)`). O
  rótulo "Painel" ficou escondido, a logo usa Plus Jakarta Sans (a
  Montserrat não era carregada nas telas internas) e o nome do usuário
  voltou a aparecer na gaveta do celular.
- **Paleta grafite + visual de SaaS financeiro (2026-09-15, pedido da
  Julia; tokens no `theme.css`, vale no sistema todo):** neutros grafite
  (fundo creme `#F3EBDB` — a Julia achou os brancos quebrados brancos
  demais —, cartão branco, borda bege `#E6DDCC`, texto `#18181B`;
  escuro `#09090B`/`#18181B`), menu `#18181B` com a tela aberta em
  `rgba(255,255,255,0.08)` e barra de 3px na cor da marca. O vermelho
  `#D93829` fica só no botão principal, na logo e no item aberto (menu,
  aba, categoria); foco de campo e de teclado é azul (`--info`). Alta e
  queda: `--success`/`--danger` pra preenchimento com texto branco e
  `--success-texto`/`--danger-texto`/`--warning-texto` pra escrever na
  cor (clareiam no modo escuro). Cartões planos: raio de 8px, sombra
  `0 1px 3px rgba(0,0,0,0.05)`, sem a borda tracejada e o furo de comanda
  (e sem a borda serrilhada do Vendas Semanais). Número em Plus Jakarta
  Sans com `tabular-nums` (a IBM Plex Mono saiu). Gráficos: cinco cores
  bem diferentes, sem vermelho nem verde (`CORES_GRAFICO` no script.js =
  `--grafico-*`), e canal de venda com cor fixa em toda tela
  (`corDoCanal`: iFood rosa, 99Food âmbar, Cardápio Web azul, Presencial
  turquesa, Totem violeta); lojas em Mais Vendidos: Artesanos azul, Açaí
  violeta, Tradiça ZN âmbar, Simus turquesa.
- **Home**: no topo, "Olá {primeiro nome}, seja bem-vindo(a)!" e as ações
  rápidas como botões secundários; logo abaixo, o quadro "Visão geral da
  rede" com o faturamento de ontem (chapa grafite com um brilho do vermelho
  da marca) e a hora da atualização num selo dentro dele. O `style.css`
  guarda o quadro e as cores próprias da Home (`body.pagina-home`); o que
  entrou na reforma de 2026-09-18 está em `home.css` (ver abaixo).
- **Home reformada (2026-09-18, dois pedidos dela no mesmo dia):** o quadro
  preto da rede ficou intacto; o que mudou foi tirar repetição e trazer
  finança, compra e estoque pra primeira tela.
  - **Insight no rodapé do quadro** (ícone de brilho, seta pro próximo quando
    há mais de um): frases montadas a partir dos números, da mais urgente pra
    menos — alta de insumo que tirou 2+ pontos de margem de um produto;
    produto que entrou na Curva A (30 dias contra os 30 anteriores, só quando
    a janela anterior tem venda registrada); loja que ontem faturou 15%+
    acima/abaixo da média das últimas 4 do mesmo dia da semana; alta de 1 a
    2 pontos; produto que saiu da Curva A. Não é modelo de IA: é regra sobre
    os dados, por isso o rótulo é "Insight". Sem nada fora do normal, diz
    isso.
  - **Linha 60/40**: três cartões — **Saúde financeira** (CMV do mês até
    hoje = ficha técnica × custo das compras, sobre os produtos com custo; a
    porcentagem das vendas cobertas aparece junto; margem bruta = 100% − CMV,
    sem taxa de app nem despesa fixa, que o sistema não tem; régua do Vendas
    Semanais: <31% ótimo, 31-34% bom, acima ruim), **Semanal** e **Estoque
    crítico** (zerado ou abaixo do mínimo, loja por loja, cada loja com link
    pra `estoque.html?loja=<loja>&nivel=critico`) — e ao lado as
    **Atividades pendentes do dia**: sincronizar vendas de ontem, lançar a
    venda presencial de ontem (Artesanos e ZN; segunda não conta, as lojas
    fecham), pendências de Compras (aprovar requisição, fechar cotação
    parada, enviar pedido, cobrar entrega atrasada), produto novo vendido
    sem ficha técnica, lote vencendo em 3 dias e tarefa do ClickUp com
    prazo até hoje. Pendente vem primeiro com o link de onde resolver;
    feito vem riscado. O cartão Mensal saiu.
  - A lista "Status de sincronização" virou um **ponto no ícone do
    Sincronizar**: verde com todas as lojas em dia, vermelho com alguma
    atrasada (nome no hover). Na terça, venda de domingo conta como em dia
    (segunda as lojas fecham) — vale pra Configurações também.
  - Gráfico da rede mais baixo (200 px), canais ao lado (60/40).
  - **Gestão operacional** ao lado do ranking (últimos 30 dias): top 3 da
    Curva A da rede por margem (o mesmo produto nas duas Tradiças soma numa
    linha), **custos em alta** (insumo que subiu 5%+ e o produto em que a
    alta mais come margem, em pontos do preço de venda; laranja, e vermelho
    a partir de 2 pontos; fora preço suspeito de unidade trocada e alta que
    mexe menos de 0,1 ponto) e os atalhos "Lançar nota de compra"
    (`pedidos.html?acao=compra-fora`) e "Nova ficha técnica"
    (`cardapio.html?acao=novo-item`).
  - Tudo numa chamada, `GET /api/home/gestao` (admin e gerente, só as lojas
    que a pessoa enxerga). A parte pesada (Curva ABC de 3 janelas × 4 lojas,
    custos e insights) fica guardada 5 minutos em cada processo; estoque e
    atividades são sempre na hora. `curva_abc_cardapio` ganhou `ate` pra
    fechar a janela no passado. Estilos em `home.css`. Teste:
    `teste_home_gestao.py` no scratchpad (26 verificações).
- **Cabeçalho de vidro** (`.top-header`, todas as telas): barra flutuante
  a 12px das bordas, meio transparente (`--header-vidro`), com
  `backdrop-filter` desfocando o que passa por baixo, fio de borda e
  sombra leve (`--header-vidro-borda`/`--header-vidro-sombra`). A Julia
  achou que a barra cheia de ponta a ponta não parecia vidro com a página
  parada no topo; flutuando, o efeito aparece sempre.
- **Dado de negócio é cadastrado na tela, em produção.** O banco de
  produção não vai no push, então script de dado rodado no banco local não
  chega lá — e a Julia quer tudo mantido no sistema, sem planilha (desde
  2026-09-10; o botão de carga por planilha foi removido, seção 6.17). Onde
  falta tela pra manter um dado, a solução é criar a tela (foi o caso do
  custo do insumo), não um import.
- **Repositório público**: nada de planilha, custo, receita ou preço de
  fornecedor no git. Preço entra por upload; o código guarda só estrutura
  (que linha da planilha vira qual insumo).
- **Unidade**: número de planilha nunca entra sem conferir a unidade do
  insumo cadastrado — `quantidade_para_insumo`/`custo_para_insumo` fazem
  a conversão (inclusive pacote com conteúdo). Quando não dá pra
  converter, a linha entra com a quantidade **em branco**, não some: sem a
  linha, a receita pareceria completa e o custo sairia menor que o real.
- **Nome**: casamento só por regra determinística (`resolver`,
  `localizar_insumo` em `backend/nomes_insumo.py`) — nada de similaridade.
  Dois candidatos pra mesma regra é decisão humana.
- **Teste no banco local não pode deixar dado pra trás**: item, vínculo ou
  venda de teste criados no banco de verdade contaminaram a análise por
  dias (em 2026-09-10 um vínculo de teste fazia 266 vendas do Tasty Bacon
  contarem como BIG ART). Testar em cópia (`DATABASE_PATH` apontando pra
  um arquivo temporário).

### 6.27 Quanto comprar, decidido na Conferência (2026-09-21)

Pedido dela: "item com estoque suficiente, ou sem estoque mínimo, não entra"
era perigoso — dava pra um produto que devia ir pra Compack sumir da compra
sem ninguém ver. Agora a tabela da Conferência da requisição virou **"O que
comprar"**: uma coluna por loja com um campo por item, já preenchido com a
sugestão do sistema (ideal − contado, pra cima na embalagem; 0 quando tem
estoque). A compradora muda o que quiser: 0 tira o item, qualquer número
coloca. Item sem estoque mínimo aparece em amarelo com o campo vazio; se ela
digitar uma quantidade, o sistema pergunta (uma vez por item) se quer guardar
um mínimo pra loja, sugerindo contado + comprado. A coluna **"Vai pra"** diz
antes de gerar se o item sai em pedido direto pro fornecedor homologado
("Pedido · Compack") ou vai pra cotação.

O número digitado fica em `contagem_item.quantidade_compra` (NULL = sugestão;
`PUT /api/requisicoes/conferencia/comprar` com `{contagemId, insumoId,
quantidade}`, null volta pra sugestão; 409 depois que a requisição virou
cotação/pedido, porque gerar de novo só reabre o que existe).
`gerar_cotacao_do_deficit` usa `quantidade_a_comprar` (digitado ganha da
sugestão; sem mínimo e sem nada digitado continua no aviso de "sem ideal").
`GET /api/requisicoes/conferencia` passou a mandar, por item, `lojas`
(contado, ideal, sugestão, comprar, editado), `comprarTotal` e
`fornecedorHomologado`, e `jaGerada` na requisição.

Mudou também o botão da contagem de cada loja: era "Fazer Cotação/Pedido" e
gerava tudo sozinho quando a última loja era aprovada; agora é "Aprovar e
conferir a compra" (ou "Conferir a compra", já aprovada) e leva pra
Conferência, de onde sai a cotação/pedido. Depois de gerada, o botão da
Conferência vira "Ver cotação/pedidos".

**"Atualizar com os homologados" (2026-09-21).** Na Conferência de uma
requisição que já virou cotação/pedido aparece esse botão: refaz a compra
com os homologados de agora, sem apagar a cotação (caso da Contagem 20/09 do
Açaí, em que os homologados foram acertados depois e a RIBERFOODS já tinha
mandado preço). Item já em pedido da requisição não duplica; item com
homologado vira pedido direto e sai da cotação (com o preço e o convite
dele); o resto fica ou entra na cotação. `POST
/api/requisicoes/conferencia/reaplicar-homologados` com `{titulo,
prazoValidade}` → `reaplicar_homologados_requisicao`, que devolve os pedidos
criados (fornecedor e itens), o que saiu e o que entrou na cotação.

Ajustes da revisão (mesmo dia): o botão só aparece em compra em andamento
(nem semana da VMarket nem cotação fechada — `motivo_para_nao_reaplicar`); o
item que sai da cotação vai pro pedido com a quantidade travada nela; o preço
que o fornecedor já mandou fica guardado (só deixa de ser vencedor); item que
entra na cotação vai pros convites ainda abertos de quem vende; pedido ainda
não enviado do mesmo fornecedor e loja ganha os itens novos em vez de nascer
outro; o link do fornecedor só grava preço dos itens do convite dele; e o
"Gerar pedidos" da cotação passou a olhar "já pedido" por insumo e loja.

### 6.28 Insumo novo só nas lojas marcadas; Açaí mostra só o homologado (2026-09-21)

O "Novo insumo" cadastrava o produto em todas as lojas (`criar_insumo` com
`LOJAS` inteiro), e por isso alface e pote de salada apareciam no Açaí:
apagar e cadastrar de novo devolvia o item pras quatro. Agora o formulário
tem "Lojas que usam esse insumo" (vem marcada a loja da aba aberta) e `POST
/api/insumos` recebe `lojas` (sem o campo, continua todas, pra quem chamar
sem ele; gerente só cria pra loja dele). Na edição as lojas continuam em
"Insumos da loja". Na aba do Açaí (`LOJAS_SO_HOMOLOGADO` em script.js), a
coluna Fornecedores mostra só o fornecedor homologado, e o filtro vira "Sem
homologado".

**Mudança no mesmo dia (pedido dela):** "Atualizar com os homologados" não
cria mais pedido — só recarrega "O que comprar", e na requisição já gerada a
coluna "Vai pra" mostra onde cada item está ("Pedido nº X · fornecedor", "Na
cotação") e o que mudou ("Vai virar pedido · fornecedor", "Vai pra cotação";
`situacao_compra_requisicao`, montada por `_plano_reaplicacao` sem gravar).
Os pedidos saem no "Ver cotação/pedidos": com mudança pendente, ele lista o
que vai sair, pede confirmação, grava (`reaplicar_homologados_requisicao`) e
abre Pedidos.

### 6.29 Fornecedores que cotam e homologado por loja (2026-09-21)

Pedido dela: mudar uma loja não pode mexer nas outras. Os dois cadastros
passaram a ser por loja: `insumo_loja_fornecedor` (quem cota o insumo naquela
loja) e `insumo_loja_homologado` (fornecedor, preço combinado e validade
naquela loja). Na primeira subida, `migracao_feita('fornecedores_por_loja')`
copia o que estava em `insumo_fornecedor` e nas colunas de homologado do
insumo pra cada loja que usa o insumo — nada muda no dia da troca. As
colunas antigas ficam como legado (`insumo_fornecedor` vira a união das
lojas, pra quem ainda lê).

Em Insumos, com uma loja escolhida, o cadastro do insumo mostra e grava os
fornecedores e o homologado DAQUELA loja (`PUT /api/insumos/<id>` com
`loja`); na Visão geral esses campos somem, com aviso pra escolher a loja.
Insumo novo leva fornecedores e homologado pras lojas marcadas.
`_homologados_validos` devolve por (insumo, loja), e tudo que decide pedido
direto usa a loja do item: gerar a cotação (a loja com homologado vai em
pedido, as outras do mesmo insumo vão pra cotação), "Novo pedido" (preço e
coluna por loja; "não homologado nessa loja"), a coluna "Vai pra" e o
"Atualizar com os homologados". No convite da cotação, cada item vai pra
quem cota o insumo nas lojas daquele item (histórico continua geral, só
quando ninguém está marcado).

### 6.30 Item sem fornecedor não vai em link nenhum (2026-09-21)

Antes, item que ninguém cota (sem fornecedor marcado na loja nem histórico)
ia pro link de todo fornecedor convidado — o do Guilherme Nunes levou
adesivo, luva e sacolinha, e a lata ia pra PXT. Agora `_itens_do_fornecedor`
manda pra cada um só o que ele cota; o item órfão fica na cotação com o aviso
"Sem fornecedor marcado (não vão em nenhum link)" no cartão de convites e na
prévia, pra compradora decidir: marcar quem cota em Insumos, lançar o preço à
mão ou convidar um fornecedor novo (fornecedor que ainda não cota nada
continua recebendo a cotação inteira). O "Atualizar com os homologados"
também só põe item novo no convite aberto de quem cota ele.

### 6.31 Escolher o que vai no link de cada fornecedor (2026-09-21)

No "Convidar fornecedores por WhatsApp", cada fornecedor marcado abre uma
lista com caixinhas: vêm marcados os itens que ele cota (a regra de sempre)
e, embaixo, "Outros itens da cotação", desmarcados. A compradora tira ou põe
o que quiser; o link leva exatamente o que ficou marcado (`POST
/api/cotacoes/<id>/convites` com `itensPorFornecedor` {fornecedorId:
[insumoIds]}; só vale item da cotação, lista vazia = sem convite). Vale só
pra esse convite — o cadastro de "Fornecedores que cotam" não muda. A
prévia passou a mandar `itens` (ids) por fornecedor e `itensDaCotacao`.

### 6.32 Guia de Compras reescrito (2026-09-21)

`guia-compras.html` descrevia o fluxo antigo (convite pra todo fornecedor,
entrada pelo Estoque → "Registrar entrada", que hoje somaria o estoque duas
vezes). Agora segue o fluxo atual: Requisição → Contagem → O que comprar
(coluna "Vai pra") → Cotação só do que não tem homologado → Pedido (envio por
WhatsApp e confirmação pelo link) → Recebimentos. Ganhou a seção "Mudou um
homologado depois de gerar?" (Atualizar com os homologados + Ver
cotação/pedidos), "Onde se configura" com o cadastro por loja, e o item
Recebimentos no menu lateral, que faltava só nessa página. O texto do modal
"Convidar fornecedores" também dizia que item sem fornecedor ia pra todos.

### 6.33 Tela de Pedidos redesenhada (2026-09-21)

Topo enxuto ("Pedidos de Compra" + uma linha de apoio, sem o sobretítulo e o
parágrafo longo), 4 indicadores de entrega, filtros numa linha (período, loja,
fornecedor, busca) e tabela densa. Indicadores: **Pedidos em aberto** (não
recebidos), **Valor comprado** (segue o período), **Falta enviar** (gerado e
ainda não mandado pelo WhatsApp; entrou no lugar de "Entregas para hoje", que
dependia de alguém marcar "A caminho", e os fornecedores só avisam a
compradora) e **Pedidos atrasados** (vermelho quando tem;
mesma regra do menu e da Home: enviado há mais de `DIAS_ENTREGA_ATRASADA` dias,
agora em `dias_esperando_entrega`, e o `/api/pedidos` manda `diasEsperando` e
`atrasado` por pedido). Os três de contagem filtram a tabela. Status em selos:
pendente de envio (tracejado), pedido enviado/confirmado (laranja), a caminho
(azul), recebido (verde) e atrasado (vermelho), com o trilho das 4 etapas e há
quanto tempo foi pro fornecedor. A linha toda abre o pedido; a lixeira cancela
(ou exclui a compra por fora) e não aparece em pedido já recebido, porque
excluir não desfaz o estoque que entrou no recebimento.

### 6.34 Tela de Recebimentos redesenhada (2026-09-21)

Mesmo padrão de Pedidos (6.33): topo enxuto com o seletor **Aguardando /
Histórico de recebidos**, 4 indicadores (Aguardando recebimento, Valor a
receber, Recebidos hoje, Entregas atrasadas, esse em vermelho quando tem; os
três de contagem viram atalho: fila, histórico de hoje, só atrasadas),
filtros numa linha (loja, período, busca) e tabela densa. A coluna Itens
mostra quantos são e os 2 primeiros ("Coca-Cola, Fanta Laranja e +5"); clique
na linha abre a lista inteira com as quantidades embaixo do pedido, pra
conferir na descarga. Como os fornecedores não agendam entrega no sistema, o
período é pela data do pedido (no histórico, pela data do recebimento).
`/api/recebimentos` passou a mandar `itens`, `atrasado`, `diasEsperando` e
`pendenteDeEnvio`; `/api/recebimentos/recebidos?dias=N` (novo,
`listar_pedidos_recebidos`) traz o que chegou nos últimos N dias.

### 6.35 Fornecedor obrigatório e pendências de cadastro (2026-09-22)

Pra compra funcionar como na VMarket (conferido lá: todo produto de cotação
tem pelo menos um fornecedor ligado, e item sem mínimo não entra na
cotação): insumo novo só é cadastrado com pelo menos um fornecedor que cota
ou o homologado (`POST /api/insumos` recusa sem; o modal avisa), e a edição
numa aba de loja também pede, menos pra mistura feita na casa. Em Insumos, o
botão **Pendências** (só gestão, aparece quando tem) abre a lista por loja
de insumo **sem estoque mínimo** (fora mistura e quem tem ajuste de
quantidade ideal) e **sem fornecedor que cota** (nem homologado), com a
correção na própria linha: salvar o mínimo, ligar um fornecedor (primeiro
quem já cotou ou vendeu) ou "Não usa nesta loja" (`DELETE
/api/insumos/<id>/lojas/<loja>`, `tirar_insumo_da_loja`: tira só da lista
dessa loja; estoque e histórico ficam).

### 6.36 "O que comprar" em dois blocos (2026-09-22)

O homologado virou atalho: a Conferência da requisição mostra **Pedido direto ·
homologados** (item × loja com homologado ativo e preço valendo, agrupado por
fornecedor, com quantidade, preço combinado na escala do cadastro — por kg,
litro ou unidade — e total) e **Cotação · vários fornecedores** (o resto, na
tabela por loja). Cada bloco tem seu botão: "Gerar pedidos homologados"
(`POST /api/requisicoes/conferencia/gerar-pedidos`) cria um pedido por
fornecedor e loja e o bloco passa a mostrar o "Enviar por WhatsApp" de cada
fornecedor (um por token, com o link de confirmação); "Gerar cotação" / "Pôr na
cotação" (`/gerar-cotacao`, agora só esse bloco). "Mover pra cotação" / "voltar
pro homologado" (`PUT /conferencia/destino`, coluna `contagem_item.forcar_cotacao`)
troca o item de bloco sem refazer a contagem. Por trás é o mesmo motor de
antes (`_plano_reaplicacao` + `reaplicar_homologados_requisicao(..., parte)`):
homologado configurado depois de gerar aparece sozinho no bloco de cima, por
isso o "Atualizar com os homologados" saiu. A trava agora é por item
(`item_travado_na_requisicao`): só não muda o que já está num pedido ou na
cotação. Cotação fechada trava só o bloco da cotação.

### 6.37 "Comprar direto" no bloco da cotação (2026-09-22)

O caminho inverso do "Mover pra cotação": cada linha da tabela da cotação tem
"Comprar direto", que abre uma janela pra escolher as lojas, o fornecedor
(primeiro quem já cota o insumo na loja) e o preço combinado (na escala do
cadastro, sugerido pelo último custo). Como fornecedor e preço moram no
cadastro (regra dela), isso grava o homologado do insumo nessas lojas pelo
`PUT /api/insumos/<id>`; "Só nesta compra" grava com validade até amanhã, e na
próxima requisição o item volta pra cotação. O item sobe na hora pro bloco dos
homologados (e perde o "Mover pra cotação", se tinha). A conferência passou a
mandar `custoUnitario` por item e `cotam` (quem cota) por loja.

### 6.38 Cardápio redesenhado (2026-09-22)

Topo enxuto ("Cardápio" + uma linha de apoio, "Importar planilha" e "Novo
item" à direita), loja + categorias em carrossel com setas quando não cabem, e
a grade de 4 por linha (tag "sem custo" no cartão). Sem os cards de
indicadores (pedido dela). O modal do
produto ficou em duas colunas com rodapé fixo: à esquerda a foto e o preço
por canal, com a **margem de cada canal** embaixo do preço dele (1 -
custo/preço, cor pela régua do CMV), que muda enquanto se digita o preço; à
direita o **custo do produto**, calculado pela ficha técnica (`custoFicha`, o
mesmo do CMV e da Curva ABC: `custos_da_ficha_por_item`) ou o digitado à mão,
que ganha, e depois os insumos (em laranja o que está sem preço ou sem quantidade) e a
embalagem pra viagem com o custo dela. A margem não desconta a comissão dos
apps nem a embalagem. `/api/itens-cardapio/<id>/ficha-tecnica` passou a mandar
`custoUnitario` e `custo` de cada insumo; salvar a ficha recarrega a lista
pra atualizar o custo.

### 6.39 Quem conta o estoque e o link pelo WhatsApp (2026-09-22)

Requisições ganhou o botão **Quem conta o estoque**: por loja, nome e WhatsApp
de quem recebe o link da contagem (tabela `contato_contagem`, rotas
`/api/contatos-contagem`; não precisa de login, não é usuário do sistema). Na
requisição, a lista "Lojas dessa requisição" tem a coluna **Enviar o link**, com
um botão por pessoa da loja que abre o WhatsApp com a mensagem e o link da
contagem (só enquanto a loja não respondeu); o mesmo aparece nos links logo
depois de criar a requisição. Os contatos da VMarket (estoquistas) foram
cadastrados pela tela em produção, não no código (o repositório é público).

### 6.40 Correções dos 5 críticos do QA (2026-09-22)

Auditoria de QA de todas as telas (23 telas, três personas: conferente no
celular, compradora no computador e dono). Os cinco problemas mais graves
foram corrigidos:

1. **Preço da cotação com unidade.** O link do fornecedor mostrava a
   quantidade em kg e pedia "Preço Unitário (R$)" sem unidade, e o número era
   gravado como preço por **grama** — pedido e custo mil vezes maiores (no
   teste, um pedido de R$ 554.796,59). Agora a linha diz `R$ ___ / kg` (ou
   `/ L`, `/ un`), o campo aceita qualquer casa decimal e a conversão pra
   unidade do insumo é feita no envio. Vale igual pro "Lançar preço" de
   Cotações ("Preço em R$ por kg"), e o comparativo, a "Última compra", a
   mensagem do pedido no WhatsApp e a tela de confirmação do fornecedor
   passaram a mostrar em kg/L/un (`_formatarCustoPorUnidade` e
   `_escala_comercial` no app.py). No celular o link do fornecedor virou um
   card por item, como o link de contagem — a tabela de 5 colunas empurrava
   justamente a coluna do preço pra fora da tela; no computador continua a
   tabela (`.cotacao-tabela` em preencher_contagem.css, a partir de 720px).
2. **Etapa do pedido.** `/api/pedidos/<id>/avancar` e `/voltar` conferiam a
   loja com uma variável inexistente **depois** de gravar: a etapa mudava e a
   chamada estourava 500, e clicar de novo avançava de novo. Agora o pedido é
   buscado antes, avançar até "recebido" é recusado (quem soma no estoque é o
   Recebimentos) e voltar etapa de pedido já recebido também.
3. **Recebimento em kg/L.** A caixa de "Qtd. recebida" vinha em grama ao lado
   de uma coluna escrita em kg; agora quantidade e preço são na unidade de
   compra, com a unidade escrita do lado, e a conversão acontece no envio. O
   botão trava durante o envio e a gravação marca o pedido como recebido
   condicionada a ele ainda não estar recebido (`WHERE status != 'recebido'`),
   então clique duplo ou duas pessoas juntas não somam o estoque duas vezes.
4. **Aprovar contagem sem apagar movimento.** `responder_contagem` guarda em
   `contagem_item.estoque_no_envio` quanto havia no estoque quando a loja
   enviou; `aprovar_contagem` aplica `contado + (estoque de agora − estoque do
   envio)`, então recebimento, compra por fora e baixa por venda que
   aconteceram no meio não somem mais. Contagem antiga (sem essa foto)
   continua com o comportamento de antes, e a tela avisa quantos itens tiveram
   movimento.
5. **Acesso.** `_usuario_logado` passou a recusar conta desativada (antes
   `ativo` só era conferido no login, e a sessão dura 7 dias), e o app não sobe
   mais com uma chave de sessão escrita no código (o repositório é público,
   então a chave antiga deve ser considerada queimada). Sem `SECRET_KEY` no
   ambiente, `_chave_de_sessao` guarda uma chave sorteada em `.chave_sessao`,
   ao lado do banco: a primeira versão sorteava uma chave por processo e,
   como a produção roda com dois, o login caía no clique seguinte.

### 6.41 Destaque dos pedidos recém-gerados (2026-09-22)

"Gerar pedidos" da cotação agora avisa os números ("2 pedidos gerados: nº 12 e
nº 13") e abre Pedidos com `?novos=12,13`: a tela já entra com o chip "Gerados
agora (N)" ligado, mostrando só eles, e cada linha ganha o selo **novo** ao
lado do número. O `?novos=` sai da barra de endereço assim que é lido, pra um
F5 não continuar escondendo o resto. Tirando o chip, a lista volta ao normal.
O "Gerar pedidos homologados" da Conferência não muda de tela (ela ainda vai
mandar cada um pelo WhatsApp ali mesmo), mas passou a dizer no aviso quais
pedidos nasceram e quais já existiam e ganharam itens — a resposta do servidor
já trazia isso e era descartada.

### 6.42 Números que não enganam (QA, leva 1 — 2026-09-22)

Dois críticos do relatório de QA que faziam o sistema mostrar número errado
como se fosse certo:

- **Vendas Diárias** tinha "R$ 142.850,00", "3.420" e "R$ 41,76" escritos no
  próprio HTML, e o tratamento de erro só trocava a tabela de canais: servidor
  fora do ar, sessão vencida ou rede ruim mostravam esses valores de exemplo
  como se fossem o faturamento do período. Os cards nascem em "—" e o erro
  zera os três, escreve a falha no Histórico Diário e na tabela de canais.
- **Custo em uso** (`custo_em_uso_por_insumo`) aceitava qualquer preço recente
  de compra ou cotação, sem olhar ordem de grandeza — o erro de kg lançado
  como g multiplicava por mil o CMV, a margem do Cardápio e a Curva ABC, calado.
  Agora, quando o preço de fora está 4× acima ou abaixo do custo do cadastro
  (`_preco_fora_da_curva`, a mesma régua da Evolução do preço), ele é deixado
  de lado e vale o custo digitado, com a marca `ignorouSuspeito` — que o modal
  do insumo mostra: "a última compra ou cotação veio muito fora dessa faixa e
  foi ignorada — confira a unidade do preço lançado". Sem custo de cadastro pra
  cair de volta, o preço continua valendo (é o único que existe).

### 6.43 Estoque e unidade sem pegadinha (QA, leva 2 — 2026-09-22)

Os três críticos de Insumos do relatório de QA:

- **"Editar estoque" mandava sempre os dois campos.** Como a tela não se
  atualiza sozinha, corrigir só o mínimo à tarde regravava a quantidade que
  estava na tela de manhã, apagando recebimento e baixa por venda do dia. Agora
  a tela manda só o campo que mudou e junto o `atualizadoEm` que ela viu; o
  servidor responde 409 quando o estoque mudou no meio, e a tela pergunta
  ("o estoque mudou às 11:00 e agora está em 1500; gravar mesmo assim?") antes
  de repetir com `forcar`. O modal também mostra a unidade do insumo em cada
  campo e a hora da última mudança.
- **Quantidade negativa era recusada pelo servidor e pelo campo.** Estoque
  negativo existe (a venda dá baixa do que a contagem não viu) e, pior, o
  `min="0"` impedia até corrigir só o mínimo de um item negativo. Agora a
  quantidade aceita negativo; o mínimo continua não podendo ser.
- **Unidade de medida era texto livre** (o campo sugeria "kg, L, un..."), e
  trocar a unidade de um insumo não convertia nada. Agora o cadastro tem uma
  lista fechada — g, ml ou un, que é como o sistema guarda preço, estoque,
  ficha e baixa (`UNIDADES_INSUMO` no app.py) — e o servidor recusa trocar a
  unidade de insumo que já tem estoque, ficha técnica ou receita, dizendo onde
  ele é usado. Insumo antigo com outra unidade abre com a opção dele na lista,
  pra salvar o cadastro não trocar a unidade sem querer.
- **Gerente apagava custo e preço homologado sem saber:** a API não manda
  esses campos pro perfil gerente, o formulário abria vazio e salvava "vazio =
  apagar". A tela só envia custo e homologado quando quem edita é admin.

### 6.44 Requisição destravada e contagem com bom senso (QA, leva 3 — 2026-09-22)

- **Reabrir não esbarra mais no prazo.** O prazo faz parte da identidade da
  requisição (título + prazo agrupam as lojas), então ele não muda; o que
  mudou é que a contagem guarda `reaberta_em` e ganha uma janela própria de
  `HORAS_APOS_REABERTURA` (24 h) pra loja reenviar, mesmo com o prazo vencido
  (`_contagem_fora_do_prazo` no app.py). "Reabrir" também passou a valer pra
  contagem que ficou **aberta e venceu** — antes a tela respondia "essa
  contagem já está aberta" e a requisição inteira travava esperando uma loja
  que não tinha mais como responder.
- **Excluir requisição não passa mais por cima de pedido recebido.** A rota
  recusa quando existe pedido já recebido (`pedidos_recebidos_da_requisicao`),
  dizendo quais são: o estoque deles já entrou, e apagar deixava a mercadoria
  sem origem e o histórico de compra (que alimenta o custo) com buraco. Pra
  descartar mesmo, cancela-se cada pedido pela tela de Pedidos antes.
- **O link da contagem avisa quando o número está fora de proporção.** O item
  agora vem com `estoqueAtual`, e digitar 10× mais (ou 10× menos) do que a
  loja tinha da última vez acende um aviso amarelo no card — "confira a
  unidade: você digitou 5 g e da última vez tinha 5 kg". No envio, esses itens
  aparecem numa confirmação antes de ir. Era o buraco por onde o erro de
  unidade virava estoque e compra errados sem ninguém perceber.

### 6.45 Ficha técnica com trava (QA, leva 4 — 2026-09-22)

Os três críticos do Cardápio:

- **Insumo apagado continuava dentro da ficha.** Excluir não limpava ficha,
  embalagem nem receita (o banco roda sem chave estrangeira) e o modal escondia
  a linha órfã — o produto ficava "sem custo" pra sempre por causa de algo
  invisível. Agora a exclusão é recusada quando o insumo está em ficha,
  embalagem ou receita, dizendo onde ele está e lembrando do "Mesclar", que
  leva a ficha junto. Uma migração única (`limpar_fichas_orfas`) apagou as
  linhas órfãs que já existiam.
- **Quantidade fora de proporção pede confirmação.** A régua é a mediana do
  mesmo insumo nas outras fichas (`quantidades_tipicas_por_insumo`); 10× acima
  ou abaixo devolve 409 com a lista e a tela pergunta "Bacon: 60.000 (nas
  outras fichas, perto de 70). Salvar assim mesmo?". Importa porque a baixa de
  estoque recalcula os dias já sincronizados com a ficha atual, então o erro
  volta retroativo.
- **Porção de complemento que seria ignorada não entra.** A porção escala a
  ficha do complemento pelos gramas dela; com insumo em "un" sem "1 un = X g",
  não dá pra saber quantos gramas a ficha soma e a porção era ignorada em
  silêncio, descontando a ficha inteira por complemento vendido. Agora a
  gravação é recusada nomeando os insumos que precisam do conteúdo por unidade
  (`insumos_sem_conversao_da_ficha`).

### 6.46 Fechando os críticos do QA (leva 5 — 2026-09-22)

- **Tarefas com trava de perfil.** A tela é de admin, mas nenhuma rota de
  `/api/tarefas` conferia nada: qualquer pessoa logada podia listar, criar,
  editar e apagar card da equipe pela API. Ler, criar, comentar e mexer em
  subtarefa agora é `_exigir_gestao()`; excluir é `_exigir_admin()`. As rotas
  também entraram no `DESCRICAO_DA_ACAO`, então o Registro de atividade mostra
  "Criou tarefa" em vez do endereço da rota.
- **Divergência de NF com prazo e loja.** A tarefa automática nascia sem
  `data_limite`, e as "atividades do dia" da Home só contam tarefa com prazo
  até hoje — ela podia ficar meses sem ninguém ver. Agora nasce com prazo pra
  amanhã e a loja no título.
- **Agendador com batimento.** A trava que escolhe quem agenda (`
  admfood_scheduler.lock`) era criada uma vez e nunca solta: se aquele worker
  reiniciasse, o substituto encontrava a trava e desistia, e paravam juntas a
  sincronização de 15 em 15 minutos, a das 3h e a cópia das 3h30. A trava
  agora guarda um batimento (o worker reescreve a hora a cada
  `SEGUNDOS_BATIMENTO_AGENDADOR`), e outro worker assume quando ela passa de
  `SEGUNDOS_TRAVA_PARADA` sem sinal. Cada rotina grava em `execucao_rotina`
  quando rodou de verdade, e Configurações mostra "rodou em 22/09 às 03:30" ou
  um aviso vermelho de "parada há N dias" — antes o painel lia a configuração
  e dizia "todo dia às 03:30" mesmo com tudo parado.
- **Vendas Semanais.** O corte que monta as semanas passou a olhar só o que a
  planilha cobre: incluir as semanas que existiam por terem CMV digitado fazia
  a semana anterior sumir da tabela e da fita quando alguém digitava um CMV, e
  a variação passava a comparar semanas que não são vizinhas. E a semana que
  ainda não fechou ganhou a etiqueta "em andamento · X de 7 dias", sem seta de
  variação e sem veredito (`emAndamento` no retorno).
- **Guia de Compras.** A etapa da cotação ganhou o quadro "Atenção à unidade do
  preço": onde a unidade aparece no link e no "Lançar preço", e que o preço
  lançado vira o custo do insumo e mexe no CMV por 90 dias. Também deixou de
  prometer que "os preços aparecem sozinhos" (a tela não se atualiza) e que
  dá pra trocar o vencedor depois de gerar o pedido.
- **Curva ABC.** O subtítulo passou a dizer "receita estimada (preço de tabela
  × unidades)", e o texto da tela explica que cupom e promoção não entram — o
  faturamento de verdade está em Vendas Diárias.

### 6.47 Acessos e sessão (QA "altos", leva A — 2026-09-22)

- **Faturamento e relatórios pediam só estar logado.** `/api/faturamento-ontem`,
  `/api/faturamento-rede-diario`, `/api/insights`, `/api/insights-automaticos`,
  `/api/vendas/mais-vendidos` e `/api/preparo` devolviam a rede inteira pra
  qualquer perfil, inclusive a operação — quem limitava era só a tela
  escondendo as abas. **Faturamento e relatórios de venda passaram a ser só do
  admin** (decisão dela, 22/09): as telas Vendas Diárias, Mais Vendidos, Vendas
  Semanais e Curva ABC saíram da lista do gerente junto com as rotas, senão ele
  abriria tela que só mostra erro. A Home continua com ele, mas sem os blocos
  de faturamento (os elementos marcados com `data-so-admin`). Preparo (tempo de
  pedido) e Evolução do preço (custo de insumo) seguem em gestão, porque são de
  operação e de compra.
- **Venda presencial** (lançar e apagar) também exigia só login: mexia em
  faturamento, ticket médio e resultado semanal de qualquer loja. Agora é só do
  admin.
- **"Sincronizar agora"** virou admin e entrou no registro de ações (estava na
  lista de rotas sem registro).
- **Nota fiscal:** o download conferia o perfil mas não a loja — gerente de uma
  loja abria a nota de qualquer outra.
- **Tentativa de senha** passou a contar pelo e-mail em minúsculas: a busca no
  banco já era minúscula, então trocar uma letra pra maiúscula zerava o
  bloqueio de 5 tentativas.
- **Sessão vencida leva pro login.** Um envelope no `fetch` (ignorado nas
  páginas públicas) detecta 401, avisa "sua sessão expirou" e leva pro login
  guardando a página de origem — antes aparecia "Erro no servidor Flask: 401"
  e o que a pessoa tinha digitado se perdia.
- **Configurações:** "Sincronização com a Cardápio Web" (com o botão) e "Lojas
  cadastradas" (que mostra pedaço do token de cada loja) agora só aparecem pro
  admin, como os outros painéis; o texto do painel passou a dizer o que o
  sistema faz de verdade (de 15 em 15 minutos e às 3h, reconferindo 7 dias).

### 6.48 Estados de tela e mensagens (QA "altos", leva B — 2026-09-22)

- **Fim do "Confira se o Flask está rodando".** As 20 mensagens com esse texto
  e as 42 do tipo "Erro no servidor Flask: 500" viraram frases de gente ("o
  sistema não respondeu agora (código 500). Tente de novo em instantes."), com
  o código técnico só no console.
- **"Carregando..." nas tabelas** (`_linhaCarregando`): Fornecedores, Cotações,
  Pedidos, Requisições, Contagens, Recebimentos, Curva ABC de insumos e Vendas
  Semanais. A tela vazia dos primeiros segundos parecia "não tem nada
  cadastrado" — no celular, parecia que o clique não funcionou.
- **Carimbo de hora honesto.** `marcarAtualizadoAgora` só marca quando a carga
  deu certo; no erro, `marcarSemConexao` escreve "Sem conexão — números de
  14:02" em vermelho e o valor grande da Home vira "—". Antes o carimbo era
  escrito sem esperar as respostas, então número velho aparecia com hora nova.
- **Ícones não derrubam mais a página.** As duas chamadas soltas de
  `lucide.createIcons()` (uma no topo do arquivo) ganharam a mesma proteção do
  resto: quando a biblioteca de fora não carrega, o script continua rodando em
  vez de morrer ali e deixar todas as telas mudas.
- **Curva ABC e Vendas Semanais limpam antes de carregar.** Trocar loja ou
  período mostrava os números anteriores até a resposta chegar — e pra sempre,
  se desse erro. Agora as listas, a fita, o cartão e o subtítulo são zerados, e
  o erro aparece nos três lugares, não só na tabela grande.
- **Preparo** ganhou "Carregando...", aviso de erro na tabela de dias lentos e
  o carimbo de "sem conexão".
- **Cópia de segurança que falha fica registrada** (`backup_falhou` em
  `execucao_rotina`) e o painel mostra "última falha em 22/09: ...". Antes o
  erro morria no log e a tela seguia exibindo a data da última cópia que deu
  certo.

### 6.49 Travas de digitação (QA "altos", leva C — 2026-09-22)

- **Preço do Cardápio.** O servidor recusa negativo; **zero continua valendo e
  quer dizer "não vendo nesse canal"** (ela usa nos produtos que só saem no
  balcão, 22/09): a tela mostra "não vende" no lugar de "R$ 0,00" e a Curva ABC
  deixou de contar aquela venda como receita zero, o que derrubava o preço
  médio e estourava o CMV do produto. Ao salvar, o modal confere o que mudou:
  preço 3× acima ou abaixo do anterior e campo apagado pedem confirmação
  ("iFood: vai ficar SEM preço (estava R$ 39,90). Se é 'não vendo nesse canal',
  digite 0").
- **Número brasileiro nos "Colar lista".** `_lerNumeroBR` passou a entender
  ponto de milhar sem vírgula ("1.500" = mil e quinhentos), e os dois colares
  de Insumos (estoque em lote e quantidade ideal) usam ele — antes faziam
  `replace(',', '.')` na mão e "Bacon;1.500" entrava como 1,5, com o resumo
  dizendo "12 casados, todos encontrados".
- **Ficha técnica abre sem insumo escolhido** ("Escolha o insumo..."), e linha
  sem insumo não vai pro banco. Vinha o primeiro insumo da ordem alfabética
  já selecionado, e um Salvar distraído cadastrava ele no produto.
- **Venda presencial sem quantidade** pede confirmação, dizendo que o ticket
  médio do dia fica distorcido (o valor entra, os pedidos não).
- **"Desativar" pergunta antes**, com o nome: "Desativar o acesso de Fulano?
  Ele perde o acesso agora, em qualquer aparelho onde estiver logado" — e o
  mesmo pro fornecedor ("ele sai das próximas cotações e do Lançar preço").
  Eram três ícones iguais e colados, e o do meio executava no primeiro clique.
- **Fornecedor duplicado e telefone.** O Salvar trava enquanto grava (dois
  cliques criavam o mesmo fornecedor duas vezes, e os insumos ficavam metade
  em cada) e o servidor recusa nome repetido, dizendo qual já existe. Telefone
  fora do padrão (menos de 10 ou mais de 13 dígitos) avisa que o convite de
  cotação pode não abrir no WhatsApp.

### 6.50 Fluxo de compras (QA "altos", leva D — 2026-09-22)

A leva D pega o caminho requisição → cotação → pedido, onde os erros custam
dinheiro de verdade (pedido duplicado, fornecedor apagado, item pedido em
grama).

- **"Comprar direto · só nesta compra" não apaga mais o homologado.** Antes
  ele gravava fornecedor e preço em `insumo_loja_homologado` com validade de
  um dia: o combinado de sempre daquela loja era sobrescrito e, passado o dia,
  o item ficava sem homologado nenhum. Agora o avulso mora na contagem
  (`contagem_item.fornecedor_avulso_id` e `preco_avulso`, rota
  `PUT /api/requisicoes/conferencia/fornecedor-avulso`), vale só naquela
  requisição e ganha do cadastro no plano de geração (`_plano_reaplicacao`
  soma os avulsos por cima de `_homologados_validos`). A linha do bloco dos
  homologados mostra o selo "só nesta compra". O modal abre com essa opção
  marcada; escolher "Sempre" avisa em vermelho qual fornecedor será
  substituído em cada loja.
- **Recarregar antes de gerar.** "Gerar pedidos homologados" e "Gerar cotação"
  buscam a conferência de novo antes de perguntar; se a contagem de itens ou o
  total em R$ mudou (mínimo alterado em Insumos, quantidade que a outra pessoa
  editou, item que já virou pedido), a tela se atualiza e diz "os números
  mudaram desde que você abriu a tela — confira e clique de novo" em vez de
  gerar o que ela não viu.
- **Pedido duplicado.** `gerar_pedidos_de_cotacao` passou a conferir o que já
  virou pedido e gravar os novos **na mesma transação** (`travar_para_escrita`
  = `BEGIN IMMEDIATE`); com dois gunicorn no ar, os dois liam "ainda não" e os
  dois gravavam. Mesma trava em `reaplicar_homologados_requisicao`. O botão da
  Cotação trava durante a chamada ("Gerando…") e, quando a primeira geração já
  tinha terminado, a segunda responde 409 com "os pedidos dessa cotação já
  tinham sido gerados" no lugar do erro seco.
- **Convite com prazo vencido tem conserto.** O campo de prazo não aceita mais
  data passada (`min` no campo, checagem na tela e no servidor) e já vem
  sugerido pra amanhã 11h; a linha do convite vencido ganhou "Estender prazo"
  (+24 h, `PUT /api/cotacoes/convites/<id>/prazo`); e "Reabrir" empurra o prazo
  junto (`HORAS_FOLGA_CONVITE`) — reabrir com prazo vencido não destravava
  nada.
- **"Não vendo esse item" fica gravado.** O link do fornecedor manda as
  recusas junto com os preços (tabela `cotacao_recusa`), dá pra enviar com tudo
  recusado e o comparativo mostra "não vende" em vez do mesmo traço de quem não
  respondeu. O envio também avisa quando ficou item sem preço e sem recusa.
- **"Novo pedido" em kg/L.** A quantidade é digitada na unidade de quem compra,
  com a unidade escrita ao lado do campo e o preço na mesma escala (R$ 18,90
  por kg, não R$ 0,0189); a conversão é no envio. Quantidade 10× o mínimo da
  loja pede confirmação — quase sempre é unidade trocada.
- **Link de pedido cancelado explica.** Cancelar guarda o registro
  (`pedido_cancelado`, por token): o link antigo devolve 410 com "esse pedido
  foi cancelado em DD/MM — fale com a compradora" em vez de "Link inválido", e
  quando só uma loja caiu o link avisa qual, mantendo o resto do pedido.

### 6.51 Recebimento no celular e entrega parcial (QA "altos", leva E — 2026-09-23)

A tela de Recebimentos é a que a operação usa de pé, na porta da loja, com o
celular na mão — e era a menos preparada pra isso.

- **Fila em cards no celular.** Abaixo de 720px cada pedido vira um card
  (fornecedor como título, loja, data, itens e valor com rótulo) e o
  "Confirmar recebimento" ocupa a largura toda. Era uma tabela de 6 colunas
  rolando pro lado, com o botão escondido na última.
- **Modal empilhado.** Os campos deixam de ficar dois a dois e a tabela de
  itens vira um card por item, com os campos grandes.
- **Entrega parcial.** `pedido_compra_item` ganhou `quantidade_pedida` (o que
  foi pedido, não muda mais) e `quantidade_recebida` (acumula o que chegou).
  Quando vem menos, a tela lista o que faltou e pergunta:
  - **"Deixar o resto pendente"** — o que chegou entra no estoque, o pedido
    continua na fila marcado como "entrega parcial", o romaneio mostra
    "falta 109 un de 209 un", o valor da fila (e o KPI "Valor a receber")
    passa a contar só o que ainda tem que chegar, e a próxima conferência já
    abre com o que falta.
  - **"Encerrar e cobrar o que faltou"** — fecha o pedido e cria tarefa de
    prioridade alta com a lista item a item ("Picles: faltaram 1.032 de
    1.377"). Antes, zerar a quantidade fechava o pedido e apagava o que tinha
    sido pedido: não sobrava pendência pra cobrar nem como receber o resto.
  Mexer na quantidade depois de ver a pergunta refaz a escolha.
- **"+ item que veio a mais"** acrescenta uma linha com busca de insumo: o que
  chegou fora do pedido entra no estoque e na nota, sem depender do "Lançar
  compra por fora" (que é de gestão e fica em outra tela).
- **`quantidade` só vira "o que chegou" quando o pedido fecha** — enquanto ele
  está na fila continua sendo o que foi pedido, que é o que o detalhe e a
  mensagem de WhatsApp mostram.

### 6.52 Rascunho da contagem, busca no Cardápio e link à mão (leva E, parte 2)

- **Rascunho automático no link de contagem.** Cada campo é guardado no
  próprio aparelho (`localStorage`, por token) enquanto a pessoa digita; ao
  reabrir o link, o que estava lá volta com o aviso "Recuperei os 16 itens que
  você já tinha digitado neste aparelho". O rascunho só é apagado depois do
  envio confirmado, e sair da página com coisa digitada pede confirmação.
  Antes, nada era salvo antes do "Enviar requisição": recarregar, trocar de
  app ou apertar voltar perdia a contagem inteira — numa lista de 100 itens,
  no celular, isso é a manhã de trabalho.
- **Reabrir pra corrigir já vem preenchido** com o que a loja tinha mandado
  (o servidor sempre devolveu esses valores; a tela é que os ignorava).
- **Busca no Cardápio.** Campo "Buscar produto pelo nome" que varre todas as
  categorias da loja, sem acento e sem maiúscula ("cha de limao" acha "Chá de
  Limão"), com contador de resultados e "Limpar busca" pra voltar pra
  categoria que estava aberta. Eram 125 produtos e o único caminho era lembrar
  a categoria e ir clicando pill por pill.
- **"Copiar link" na conferência da requisição,** ao lado do botão de WhatsApp
  de cada loja aberta. O link só existia no modal de "Requisição criada":
  quem fechou o modal, ou precisava mandar pra outro número, não tinha como
  recuperar. Sem permissão de área de transferência, cai num prompt com o
  link em vez de não fazer nada.

### 6.53 Custo na linha da ficha técnica (leva E, parte 3)

Montar a ficha era às cegas: o custo do produto só aparecia depois de salvar,
no card fechado, e não dava pra saber qual insumo pesava. Agora cada linha
mostra quanto aquele insumo custa no produto (atualizando enquanto se digita,
respeitando o seletor g/un) e o rodapé soma: "Custo do produto: R$ 18,49".
Insumo sem preço aparece como "sem preço" em laranja e o rodapé avisa que a
conta está incompleta — é o mesmo motivo que deixa o produto "sem custo" na
Curva ABC. A rota da ficha passou a mandar `custoUnitario` de cada insumo
disponível (o `precos_insumo_em_uso` já era carregado ali).

### 6.54 Esc, responsável na tarefa e envio do convite (leva E, parte 4)

- **Modal fecha com Esc e clicando fora.** Nenhum modal do sistema fechava
  assim: no celular, sair de um que ocupa a tela toda dependia de mirar o "×"
  do canto. Usa o botão de fechar de cada tela (mantendo a limpeza de estado
  que cada uma faz) e, se a pessoa digitou algo ali dentro, pergunta antes —
  o modal é marcado como "mexido" no primeiro `input`.
- **Linha da ficha técnica no celular** deixou de cortar o nome do insumo: o
  nome ocupa a linha inteira e quantidade, unidade, custo e remover ficam
  embaixo.
- **Responsável e loja na tarefa** (`tarefa.responsavel_id` e `tarefa.loja`).
  O card mostra quem cuida (ou "sem responsável" em cinza) e a loja; dá pra
  trocar os dois no detalhe, sem botão de salvar. "Num time de 4 lojas,
  ninguém era dono de nada" — e tarefa automática (divergência de NF,
  cobrança do que faltou) nascia sem ninguém pra olhar. Gerente não enxerga a
  rota de usuários (é de admin), então o seletor fica com ele mesmo.
- **Envio do convite de cotação fica registrado** (`cotacao_convite.enviado_em`,
  `POST /api/cotacoes/convites/<id>/enviado`): tanto o clique manual no
  WhatsApp quanto o envio pela extensão marcam, e a linha passa a mostrar
  "enviado em 23/09 14:30". O selo vivia só na memória da página e sumia ao
  atualizar; reenviar não reescreve a data do primeiro envio.

### 6.55 Números que decidem (QA "altos", leva F — 2026-09-23)

A leva F é sobre número que aparece certo na tela e foi calculado errado — o
tipo de erro que só se descobre depois de decidir alguma coisa em cima dele.

- **Total da rede honesto.** Loja que não sincronizou entrava como zero e
  sumia do ranking: o total aparecia menor, sem marca nenhuma. Agora o quadro
  preto escreve "3 de 4 lojas — Açaí sem sincronizar" e a loja faltante fica
  no fim do ranking, em cinza, com "sem sincronizar".
- **CMV com cobertura.** Abaixo de 80% das vendas com custo, o veredito
  colorido ("Ótimo/Bom/Ruim") vira "parcial (45% das vendas)" em cinza, e a
  linha de baixo diz "falta custo em boa parte do que foi vendido". "CMV 28% —
  Ótimo" calculado sobre metade das vendas não é veredito, é palpite com cara
  de número fechado.
- **Presencial contado duas vezes na semana.** Quando o dia tinha ajuste
  manual do canal Presencial E lançamento avulso de venda presencial, o
  semanal somava os dois (e o Vendas Diárias mostrava só um). Agora o ajuste é
  o número final do dia: o lançamento avulso não entra por cima.
- **Canal novo não some mais.** A tabela de Vendas Semanais ganhou a coluna
  "Outros" (com o nome do canal quando é um só), que aparece só quando existe
  — antes o total somava todos os canais e a linha tinha 4 colunas, então o
  totem da Simus entrava no total sem coluna. O relatório de WhatsApp também
  lista o canal desconhecido em vez de deixá-lo só no total.
- **Hoje é um dia pela metade.** Em Mais Vendidos, comparar "hoje até agora"
  com um dia inteiro fazia todas as lojas aparecerem despencando às 11h. Agora
  o subtítulo diz "Hoje até agora · comparando com o dia inteiro de ter.
  15/09" e a variação de cada loja vira "parcial" em vez de um −70% falso.
- **Cotação aberta não vira mais custo.** Um preço qualquer lançado numa
  cotação em andamento (por fornecedor ou pelo "Lançar preço") virava o custo
  do insumo no CMV, sem ninguém ter decidido comprar. Agora, em cotação
  aberta, só o preço marcado como **vencedor** conta; cotação fechada (e o
  histórico da VMarket) segue como antes. Junto disso, o filtro e os
  indicadores da tela de Cotações passaram de 30 pra 90 dias, a mesma janela
  em que o preço ainda vale como custo (`DIAS_PRECO_RECENTE`) — havia dois
  meses de preço invisível na tela e ativo no CMV.
- **Backup não apaga a cópia boa antes de gerar a nova.** `gerar_backup`
  removia o arquivo do dia e só então gerava; falhando no meio (disco cheio,
  permissão, servidor reiniciado), o dia ficava sem backup nenhum. Agora só o
  ".parcial" de uma tentativa anterior é removido, e o `os.replace` troca uma
  cópia pela outra de uma vez.
- **Evolução do preço conta quem ficou de fora:** "3 insumos foram comprados
  nos últimos 90 dias pela primeira vez, sem preço anterior pra comparar
  (Bacon, Queijo…)". Item novo e troca de fornecedor sumiam das duas listas e
  a tela parecia dizer que o preço deles não mudou.

### 6.56 Cotação fechada vira leitura (QA "médios", leva A — 2026-09-23)

Os médios são acabamento de tela, então vão por tela. Esta leva é a de
Cotações, onde o acabamento ainda mexia em dinheiro.

- **Cotação fechada não aceita mais mudança.** O servidor não conferia o
  status em ação nenhuma: dava pra lançar preço, escolher vencedor, apagar
  preço, "Selecionar os melhores", convidar fornecedor e — pelo link — o
  fornecedor ainda mandava preço, que virava custo. Todas essas ações passam
  por `_cotacao_fechada` e respondem 409 com "Essa cotação já foi fechada.
  Reabra ela antes de mexer nos preços ou nos convites". Cotação de pedido
  direto e a carga da VMarket nascem fechadas e não passam por aqui.
- **Item que já virou pedido não troca de vencedor** (`_item_ja_pedido`):
  "Esse item já virou o pedido nº 10017. Pra trocar o fornecedor, cancele o
  pedido primeiro." Antes, trocar o vencedor depois de gerar fazia a tela
  mentir — o pedido continuava com o fornecedor antigo, mas "Valor Pedido",
  "Economia" e a aba Compras passavam a mostrar o novo.
- **Fornecedor desativado perde o link** (410, "esse fornecedor não está mais
  ativo na rede"): antes o link continuava vivo, ele seguia no comparativo,
  podia ser escolhido vencedor e virar pedido.
- **Acabamento do comparativo:** apagar preço pergunta antes, com o nome do
  fornecedor e do item ("Apagar o preço de GN para Bacon? Ele sai do
  comparativo"), e escolher vencedor deixou de ser ação muda — falhando, a
  tela diz por quê em vez de se redesenhar como estava.

### 6.57 Requisição duplicada e conferência de nota (médios, leva B)

- **Dois cliques em "Criar" não abrem mais duas contagens da mesma loja.** O
  botão trava ("Criando…") e o servidor trata mesma loja + mesmo título +
  mesmo prazo como a mesma requisição, devolvendo a que já existe (com o
  mesmo link) em vez de criar uma cópia. A cópia sem resposta prendia a
  requisição em "Aguardando lojas" e não havia como apagar uma contagem
  sozinha.
- **As duas tabelas recarregam depois de criar** (a de requisições e a de
  contagens por loja) — a requisição nova só aparecia recarregando a página.
- **"Carregando…" ao abrir a conferência**, que antes ficava igual até a
  resposta chegar.
- **Valor da Nota Fiscal entra em branco,** com o total do pedido como
  referência no campo ("o pedido deu R$ 60,00"). Vinha preenchido com o
  total, então aceitar o que estava na tela nunca gerava divergência e a
  conferência de nota existia só no nome.
- **Preço cobrado acima do combinado pede confirmação:** "O fornecedor cobrou
  mais caro do que o combinado: Saco delivery: combinado R$ 0,60, cobrado
  R$ 0,90 por un (+50%). Esse preço vira o custo do insumo." Acima de 10% de
  diferença. A conferência nunca comparava, então fornecedor que subiu o preço
  passava batido — e o preço novo virava o custo do insumo.

### 6.58 Compra duplicada e pedido sem telefone (médios, leva C)

- **Compra por fora duplicada pede confirmação.** Mesma loja e fornecedor com
  a mesma nota — ou, sem número de nota, mesmo dia e mesmo valor — devolve 409
  com "Já existe uma compra da Compack com a nota 12345 em 17/09 (pedido nº
  12). É a mesma?". Se ela disser que é outra, a tela reenvia com
  `confirmarDuplicada`. Relançar "por via das dúvidas" somava o estoque de
  novo e gravava o preço de novo, calado.
- **Fornecedor sem telefone não trava mais o pedido.** O botão de WhatsApp
  sumia da linha e o pedido ficava pra sempre em "Falta enviar", com o link de
  confirmação preso dentro de uma mensagem que não dava pra copiar. Agora
  aparece "Copiar mensagem" no lugar do botão de enviar — ela manda por onde
  falar com o fornecedor — e, depois de copiar, o sistema pergunta se marca
  como enviado.

### 6.59 Insumos: entrada que não some, validade à vista e nível por loja

Três achados de severidade **alta** da tela de Insumos que tinham escapado
das levas anteriores (vistos ao começar os médios, 23/09):

- **"Registrar entrada" numa loja sem linha de estoque não perde mais o que
  foi digitado.** `distribuir_entrada_insumo` era só um UPDATE: se o insumo
  ainda não tinha linha naquela loja, nada era gravado e o modal fechava como
  se tivesse dado certo. Agora a linha (e o vínculo do insumo com a loja) é
  criada antes de somar — mesma correção que `atualizar_estoque_loja` já
  tinha.
- **Preço combinado vencido deixou de ter cara de válido.** O anel de
  "homologado" na coluna Fornecedores não olhava a validade, enquanto a compra
  só aceita com validade em dia: a tela dizia válido e o pedido não saía.
  Agora o anel fica vermelho e diz "homologado com PREÇO VENCIDO: não sai em
  pedido até renovar", e amarelo com "o preço vence em 3 dias" nos últimos
  7 dias.
- **"Visão Geral (Todas)" classifica loja a loja.** O nível vinha da SOMA das
  4 lojas, então a loja zerada ficava escondida atrás da que tem sobra — e por
  isso o "Nível crítico" daqui não batia com o "Estoque crítico" da Home. O
  selo agora mostra a pior situação e em quantas lojas ela está ("Crítico (1)",
  com "Crítico em Açaí Na Lata" no hover).
- Junto: os ícones do login também ganharam a proteção que o resto do sistema
  já tem, pra biblioteca de fora que não carrega não derrubar a página.

### 6.60 Cancelar pedido recebido: bloqueado no servidor (alto que faltava)

A lixeira sumia da lista pra pedido recebido, mas o botão "Cancelar pedido" do
detalhe continuava aparecendo e o servidor não barrava: o estoque ficava
inflado com mercadoria sem origem, o histórico de compra sumia (o custo do
insumo voltava pro anterior) e a foto da nota era apagada do disco. Agora o
servidor responde 409 — "Esse pedido já foi recebido e somou no estoque. Pra
desfazer, ajuste a quantidade em Insumos" —, o botão some do detalhe e a nota
fiscal deixou de ser apagada junto com qualquer cancelamento. Compra por fora
segue excluível: ela devolve as quantidades ao estoque.

### 6.61 Dinheiro e dado: colar ficha, aceite do fornecedor e venda fora da lista

Primeira leva dos altos que a varredura de 23/09 mostrou em aberto — os que
mexem em número que decide compra.

- **"Colar lista" da ficha técnica lia número errado.** Fazia
  `replace(',', '.')` na mão, ignorando o `_lerNumeroBR` que o resto do
  sistema usa: "1.500" entrava como 1,5. E o número era gravado na unidade do
  banco enquanto a linha mostra a unidade de conteúdo, então "Leite;200"
  virava 200 litros. Agora lê número brasileiro, converte da unidade que a
  linha mostra e a prévia diz o que entrou ("Bacon: 50 g · Leite: 200 ml"),
  em vez de só contar quantos casaram.
- **"Pedido confirmado!" sem o fornecedor ter clicado.** O link olhava só o
  status: alguém de dentro avançar a etapa já fazia a tela dele dizer
  confirmado. Agora o aceite é gravado (`pedido_compra.confirmado_em`, só pelo
  link) e a tela interna distingue: "o fornecedor aceitou em 23/09" × "enviado
  há 2 dias · aceite ainda não veio do fornecedor".
- **Venda de produto fora da lista de preços da loja era descartada calada.**
  A Curva ABC pulava a venda (`if not produto: continue`) e o subtítulo seguia
  dizendo "X itens vendidos" como se fosse tudo — no Açaí a categoria "Combo"
  é tirada de propósito, então todo combo saía da conta. Agora conta, nomeia e
  avisa: "20 unidade(s) vendidas não entram nesta conta porque o produto não
  está na lista de preços desta loja: BATATA MÉDIA (8)…", e o subtítulo mostra
  "+20 fora da lista de preços".

### 6.62 Ficha com trava de conflito e ticket honesto no presencial

- **Duas pessoas editando a mesma ficha técnica.** O salvar apagava tudo e
  inseria a lista da tela, sem versão: quem salvasse por último apagava a
  receita do outro, sem ninguém saber. Agora o GET devolve uma assinatura do
  que está gravado (ficha + embalagem), o Salvar manda ela de volta e, se não
  bater, o servidor recusa com 409 — "Essa ficha mudou enquanto você editava
  — alguém salvou antes" — e a tela reabre o modal já com o que está valendo.
- **Venda presencial lançada sem quantidade** continua entrando (ela usa isso
  quando não tem a contagem de pedidos), mas o dia passa a carregar
  `presencialSemQuantidade`: a tabela de Vendas Diárias mostra um asterisco no
  ticket com "tem R$ 900,00 de venda presencial lançada sem quantidade: esse
  valor entra no faturamento mas não tem pedido, então o ticket do dia fica
  maior do que foi". Antes o ticket saía inflado sem nenhuma marca.

### 6.63 Combo na Curva ABC: contado, sem inventar receita

A venda de um combo não tem `item_cardapio_id` (o combo não é um item do
cardápio), então ela sumia inteira da Curva ABC — volume e tudo — mesmo com a
composição cadastrada em `composicao_produto_venda`. No Açaí isso escondia 92
unidades de "NaLata 500ml + 3 complementos" saídas por dentro dos combos
Filhinho e Filminho, contra 50 vendidas direto: dois terços do giro do produto
não apareciam.

Agora a conta soma essas unidades numa coluna própria (`volumeCombo`,
mostrada como "+92 em combo" ao lado do volume) e o aviso no topo diz de quais
combos vieram. Elas **não** entram no preço médio nem na margem: o combo tem
preço próprio, com desconto, que não está na lista de preços — contar as
unidades pelo preço cheio de tabela inflaria a receita e a margem, que é
justamente o erro que o QA apontou. Como nem a receita nem o custo dessas
unidades entram, os dois lados seguem coerentes; quando o combo ganhar preço
próprio na lista, dá pra rateá-lo entre os componentes.

### 6.64 Dia comparado pela metade em Mais Vendidos

A comparação é sempre com o mesmo dia da semana anterior, mas esse dia pode
ter sincronizado só em parte (a sincronização caiu no meio da tarde). Comparar
com ele mostrava uma queda enorme com cara de queda real. Agora o servidor
olha quantos pedidos aquela loja costuma fazer nesse dia da semana (mediana
das 4 ocorrências anteriores) e, se o dia comparado tem menos da metade disso,
manda `comparadoParcial`: a coluna da loja mostra "sem base" em vez de um
−70% falso, com o motivo no hover ("2 pedidos, contra os 85 que essa loja
costuma fazer nesse dia"). Sem histórico pra comparar, não arrisca marcar.

### 6.65 Reimportar a planilha do Cardápio mostra o que vai apagar

`sincronizar_precos_cardapio` apaga todo produto da loja que não está na
planilha (o criado na tela, `manual`, fica) — e isso acontecia calado, com o
resumo dizendo só "Importado com sucesso: N produtos". Uma aba errada ou um
nome digitado diferente levava produto junto. Agora a importação passa por uma
prévia: o servidor responde 409 com `{novos, atualizados, removidos}` e a tela
lista quem vai sair ("Combo Família NaLata (Açaí, R$ 39,90)…"), avisando que
nome digitado diferente também faz o produto sumir da planilha. Só com o
"Apagar mesmo assim?" confirmado é que grava, e o resumo final passa a dizer
quantos entraram, quantos foram atualizados e quantos saíram.

### 6.66 A tela parando de mentir: hora da sincronização, dia faltando e canal

- **"Sincronizado até" no lugar de "Atualizado às".** O carimbo era a hora do
  relógio do navegador, escrita sem esperar as respostas: com a sincronização
  parada às 11h e o relógio em 19h, a tela dizia "atualizado às 19:07" sobre
  dado de oito horas atrás. Agora `/api/config/lojas` devolve `sincronizadoEm`
  (quando a rotina automática rodou de fato, de `execucao_rotina`) e
  `lojasAtrasadas`; Home, Vendas Diárias e Preparo mostram "Sincronizado até
  14:00", em laranja quando não é de hoje ou quando alguma loja está atrasada,
  com o nome delas no hover. Sem registro nenhum, diz "Sem sincronização
  registrada" — nunca uma hora inventada.
- **Dia faltando aparece como falta.** O período do relatório é montado dia a
  dia: quem não tem faturamento de alguma loja entra em `diasFaltando`, e o
  subtítulo do Histórico Diário passa a dizer "Faltam 26 dias neste período
  (19/09, 20/09…) — sincronize ou ajuste", mais "o dia de hoje está pela
  metade" quando o período inclui hoje. Antes o dia simplesmente não tinha
  linha e o período parecia inteiro.
- **Canal com nome único.** "portal" e "totem" agora viram "Presencial" em
  qualquer aba — antes só na Visão Geral e na Tradiça Simus, então a tela
  mostrava "portal" cru enquanto o relatório de WhatsApp dizia "Presencial"
  pro mesmo número.

### 6.67 Preparo honesto, receita estimada rotulada e lojas por perfil

- **Preparo mostra a mediana**, com a média ao lado. Um pedido esquecido
  aberto o dia inteiro puxava a média sozinho: nos dados de teste a média dá
  52 min e a mediana 36,4 — 43% de diferença. O rótulo também parou de
  prometer o que não mede: "Tempo do pedido (mediana)", com o hover
  explicando que vai do pedido recebido até ele ser fechado ou entregue,
  porque a Cardápio Web não marca quando a cozinha terminou.
- **Cobertura do período no Preparo:** "5 de 23 dias do período têm dado", em
  laranja. Com a sincronização parada, a média dos dias que existem aparecia
  como se fosse o período inteiro.
- **A rota do Preparo respeita a loja do funcionário.** Ela devolvia as 4
  lojas pra qualquer perfil de gestão e quem limitava era só o navegador
  apagando as abas; agora gerente de uma loja recebe só a dele.
- **Mais Vendidos diz que a receita é estimada:** o valor no ranking vira
  "R$ 1.234 est.", o "preço médio" vira "preço de tabela" e o subtítulo
  fecha com "valores estimados pelo preço de tabela". O único número real da
  tela é o faturamento do comparativo entre lojas.
- **Configurações não mostra mais a rede inteira pra quem não é admin:**
  `/api/config/lojas` passou a filtrar por `_loja_visivel`, então as pílulas
  do topo ("4 lojas conectadas", nomes das atrasadas) param de vazar as
  outras lojas pra gerente e operação.

### 6.68 Preparo separado por canal

O canal já estava gravado em `pedido_preparo`, mas a tela juntava tudo numa
média só — e entrega não leva o mesmo tempo que balcão. A resposta ganhou
`porCanal` (mediana, média e total por canal, com "portal" e "totem" contados
como o mesmo balcão) e a tela um painel "Tempo por canal". Nos dados de teste
ele mostra de cara o que a média escondia: Cardápio Web 59 min de mediana
contra 29 do 99Food e 19 do balcão.

### 6.69 Risco de operação: prazo, insumo repetido, telefone e tentativas

- **"Reabrir" aparece quando o prazo vence.** O botão só existia pra contagem
  já respondida — justamente o caso em que ele não é preciso. Na situação real
  (loja começou 17h50, prazo 18h, ninguém enviou) ele ficava escondido e a
  requisição inteira travava. Agora, com a contagem aberta e o prazo vencido,
  o botão aparece como "Dar mais prazo" (o servidor já dava +24 h).
- **Insumo repetido barrado no cadastro.** Só a importação em lote conferia
  nome repetido; o "Cadastrar" da tela deixava criar outro "Bacon", e a
  história do insumo se dividia em dois (preço num, ficha no outro, contagem
  no terceiro). Agora responde 409 dizendo qual já existe — comparando sem
  acento, sem maiúscula e sem espaço sobrando.
- **Telefone que gera link quebrado.** `_telefoneWhatsApp` passou a limpar o
  "0" da operadora, exigir DDD + 8 ou 9 dígitos e só considerar "55" como
  país quando o número tem 12+ dígitos — o DDD 55 (Rio Grande do Sul) recebia
  o país que faltava. Número que não dá pra usar não vira link. E o **"Copiar
  link" ficou sempre visível**: ele sumia quando o fornecedor tinha telefone,
  que é exatamente quando o número errado deixa a pessoa sem saída.
- **Entrada de estoque com botão travado** enquanto grava: a entrada soma no
  estoque e dois toques somavam duas vezes.
- **Tentativas de senha contadas no banco** (`tentativa_login`), não na
  memória de cada processo: a produção roda com dois gunicorn, então o limite
  dobrava na prática e reiniciar zerava tudo. O login certo limpa pelo e-mail
  normalizado — antes limpava pela chave crua e as falhas ficavam lá.

### 6.70 Dividir a contagem entre as pessoas da loja

Na Artesanos três pessoas contam o estoque ao mesmo tempo, mas a requisição
abria **um link por loja, com a lista inteira**. Como o link é sem login, as
três abriam o mesmo, e quem enviasse primeiro gravava: as outras duas perdiam
tudo — e só descobriam depois de digitar a lista toda.

Agora "Nova requisição" tem **"Dividir em vários links, um por seção"**. Marcou
as seções (Hortifruti, Embalagens, Bebidas…), sai um link por seção por loja,
cada um só com os insumos daquela seção. Uma pessoa por link, sem se
atropelar. Sem marcar nada, continua como era: um link com tudo.

- `contagem.secoes` guarda quais seções aquele bloco cobre (vazio = todas), e
  é o que faz a trava de duplicada saber que "Artesanos · Hortifruti" e
  "Artesanos · Bebidas" são blocos diferentes da mesma requisição, não dois
  cliques no mesmo botão.
- A requisição continua sendo **uma só** (mesmo título e prazo): a conferência
  soma os blocos, e o contador vira "0 de 3 responderam" em vez de "0 de 1".
- Nas duas tabelas de contagem a seção aparece embaixo do nome da loja, pra
  dar pra ver de relance quem já mandou o quê.

### 6.71 Uma unidade só: o campo fala a mesma língua do resto da linha

O sistema guarda tudo em g/ml/un, mas mostra em kg/L/un — e os campos de
digitar ficaram no meio do caminho. Na conferência da requisição, a mesma
linha dizia "contou 4,95 kg · ideal 10 kg" e "R$ 40,00 / kg" com o campo
marcado "g": quem digitava 5 pensando em quilo comprava 5 gramas. Na tela de
contar, o campo era em grama e a tela nunca dizia isso — a unidade morava
numa coluna chamada "Gramatura", longe de quem digita.

Agora **todo campo de quantidade fala a unidade comercial** (kg, L, un), com
ela escrita dentro do próprio campo.

- **Tela de contar**: a coluna "Gramatura" virou "Unidade" e mostra o que o
  campo espera; quando o insumo vem em caixa, aparece "1 caixa = 5 kg" ali
  mesmo (antes esse texto sumia no computador). No campo dá pra **escolher
  kg ou caixa** — quem conta caixa digita caixa, e a tela mostra quanto dá em
  estoque embaixo. Trocar a unidade converte o que já estava digitado.
- **Sugestão** saía como número cru: "4.48" se lia como quatro mil e quarenta
  e oito. Agora sai "4,48 kg", e com cara de resultado em vez de campo — ela
  ficava colada no campo de digitar, parecendo dizer "digite isto aqui".
- **Conferência**: campo, referência, preço e total todos em kg. A referência
  também parou de trocar de unidade sozinha conforme o tamanho do número (a
  mesma coluna mostrava "500 g" numa linha e "4,95 kg" na outra).
- **Trava pros dois lados**: só existia aviso pra quantidade alta demais (10×
  a referência). Digitar 5 onde eram 5.000 — o erro de unidade — passava
  direto e a compra vinha quase vazia. Agora avisa também quando é 10× menos.
- O rascunho no aparelho e a resposta anterior continuam guardados em g/ml/un
  e voltam convertidos, então nada do que já foi digitado se perde.

### 6.72 O que apagava dado sem ninguém ver

Quatro caminhos diferentes em que um dado sumia calado.

- **Preço do cardápio apagado por digitação.** O campo era do tipo número, e
  "1.234,56" — do jeito que qualquer pessoa escreve preço aqui — o navegador
  não consegue ler: ele entrega vazio. Vazio quer dizer "tirar o preço desse
  canal", então o erro de digitação **apagava o preço** em vez de dar erro.
  Agora o campo é de texto e lê em pt-BR; o que não dá pra ler fica vermelho
  e o Salvar recusa, explicando que vazio tira o preço e 0 é "não vendo aqui".
- **Histórico do preço.** Toda mudança manual grava de quanto pra quanto,
  quando e quem (`preco_cardapio_historico`), e o produto mostra a lista em
  "O que já mudou de preço aqui". Antes não havia como conferir um preço que
  sumiu ou entrou errado.
- **Ficha técnica com quantidade em branco.** Insumo escolhido e quantidade
  vazia era gravado como nulo: a linha entrava na ficha, mas não descontava
  estoque e o custo do produto nunca fechava — e o aviso só aparecia depois,
  ao reabrir. Agora a tela diz qual linha está faltando, e o servidor recusa
  (inclusive quantidade 0, que é "tire a linha").
- **Foto da nota trocada.** Anexar outra nota apagava o arquivo anterior do
  disco na hora: quem fotografasse a nota errada por cima da certa perdia a
  certa. Agora a antiga continua guardada (`nota_fiscal_substituida`) e
  aparece no pedido como "Notas trocadas", com data e quem trocou.
- **Excluir card do ClickUp.** Levava comentários e subtarefas junto com só
  um "tem certeza?" que não dizia isso. Agora o aviso nomeia o card e conta o
  que vai junto, e o registro de ações grava `Excluiu o card "X" (levou 2
  comentário(s) e 3 subtarefa(s))` em vez de só "Excluiu tarefa" — pra isso a
  rota agora pode anotar a própria descrição no registro (`_anotar_no_registro`).

### 6.73 A tela disparando no servidor sem dizer

- **Escolher vencedor na cotação** custava **quatro idas ao servidor por
  clique**: a escolha, mais o recarregamento do detalhe, dos convites e da
  prévia de órfãos — e a tabela inteira redesenhada. Numa cotação de 40 itens
  são 160 chamadas, sem nenhum retorno visual entre o clique e o redesenho.
  Agora é **uma chamada**: a célula mostra que está gravando, a marca de
  vencedor anda na hora e só aquela linha é atualizada. Clique repetido na
  mesma célula é ignorado enquanto a primeira não volta, e se o servidor
  recusar (cotação fechada, item que já virou pedido) a tela recarrega antes
  do aviso — assim um alerta bloqueado pelo navegador não deixa a tela
  mentindo.
- **Curva ABC**: dois cliques rápidos em loja ou período podiam deixar na tela
  o resultado do primeiro, porque a resposta que chega por último nem sempre é
  a do último clique. Agora cada busca leva um número e só a mais recente tem
  direito de desenhar. A tabela grande também passou a mostrar "Carregando..."
  (antes só as duas listas laterais eram limpas).
- **"Sincronizar agora"**: cada clique abria uma execução nova. Duas ao mesmo
  tempo disputam o limite da Cardápio Web (5 chamadas por minuto) e as duas
  voltam pela metade. Agora o servidor recusa a segunda dizendo de que dia é a
  que está rodando e a que horas começou. A tela acompanha até o fim e mostra
  o resultado — **o dia que falhava só aparecia no log do servidor**. E a rota
  saiu da lista de exceções do registro de ações: agora fica gravado quem
  mandou sincronizar e quando.
