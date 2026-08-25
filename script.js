// Escapa texto vindo do banco (título/descrição de tarefa, comentário, nome
// de usuário etc.) antes de inserir via innerHTML — sem isso, qualquer
// pessoa logada poderia criar uma tarefa com HTML/JS no título e rodar
// script no navegador de quem mais abrir o quadro (XSS armazenado).
function escaparHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

document.addEventListener('DOMContentLoaded', () => {

  // 1. INICIALIZA ÍCONES LUCIDE
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // 1.1 USUÁRIO LOGADO (nome/iniciais na sidebar de todas as telas do painel)
  carregarUsuarioLogado();

  // 2. TOGGLE MODO NOTURNO (a tela de Configurações tem 2 interruptores na
  // mesma página — cabeçalho + painel de Aparência — mantidos sincronizados)
  const togglesTema = document.querySelectorAll('#theme-toggle-checkbox, #theme-toggle-checkbox-config');
  if (togglesTema.length) {
    const temaEscuroSalvo = localStorage.getItem('theme') === 'dark';
    document.body.classList.toggle('dark-mode', temaEscuroSalvo);
    togglesTema.forEach(chk => { chk.checked = temaEscuroSalvo; });

    togglesTema.forEach(chk => {
      chk.addEventListener('change', () => {
        const ligado = chk.checked;
        document.body.classList.toggle('dark-mode', ligado);
        localStorage.setItem('theme', ligado ? 'dark' : 'light');
        togglesTema.forEach(outro => { outro.checked = ligado; });
      });
    });
  }

  // 2.05 GRUPOS DE MENU RECOLHÍVEIS NA SIDEBAR (ex: "Compras" — Fornecedores,
  // e o que vier depois: Cotações, Pedidos). Auto-expande se a página atual
  // for uma das que estão dentro do grupo.
  document.querySelectorAll('.menu-group').forEach((grupo) => {
    if (grupo.querySelector('.menu-subitem.active')) {
      grupo.classList.add('expandido');
    }
    grupo.querySelector('.menu-group-toggle')?.addEventListener('click', () => {
      grupo.classList.toggle('expandido');
    });
  });

  // 2.1 STEPPERS -/+ DOS CAMPOS DE QUANTIDADE (Estoque, Fornecedores) —
  // delegado no documento porque vários desses campos são recriados
  // dinamicamente (ex: modal de entrada). Anda sempre de 1 em 1 unidade
  // (não usa o "step" do input, que é 0.01 pra permitir digitar valor
  // fracionário — de 0.01 em 0.01 o clique seria inútil pra ajuste rápido).
  document.addEventListener('click', (evento) => {
    const botao = evento.target.closest('.stepper-btn');
    if (!botao) return;
    const input = document.getElementById(botao.dataset.target);
    if (!input) return;
    const delta = botao.dataset.delta === '-1' ? -1 : 1;
    const atual = parseFloat(input.value) || 0;
    const novoValor = Math.max(0, atual + delta);
    input.value = Math.round(novoValor * 100) / 100;
  });

  // 3. LÓGICA DE RECOLHER A SIDEBAR (TOGGLE MENU) — no desktop, recolhe pra
  // ícone só (preferência salva); no celular, o mesmo botão abre/fecha a
  // sidebar inteira como uma gaveta por cima do conteúdo (a sidebar não
  // existe mais escondida sem alternativa no celular — sem isso,
  // Configurações/Fornecedores/Cotações, que não estão na barra inferior
  // fixa, ficariam inalcançáveis por toque).
  // Suporta tanto 'btnToggleMenu' quanto 'toggleMenuBtn' para evitar conflito entre telas
  const toggleBtn = document.getElementById('btnToggleMenu') || document.getElementById('toggleMenuBtn');
  const container = document.getElementById('dashboardWrapper');
  const ehMobile = () => window.innerWidth <= 768;

  if (container) {
    if (!ehMobile() && localStorage.getItem('sidebar-collapsed') === 'true') {
      container.classList.add('collapsed');
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        if (ehMobile()) {
          container.classList.toggle('mobile-menu-aberto');
        } else {
          container.classList.toggle('collapsed');
          const isCollapsed = container.classList.contains('collapsed');
          localStorage.setItem('sidebar-collapsed', isCollapsed);
        }
      });
    }

    document.getElementById('mobile-menu-backdrop')?.addEventListener('click', () => {
      container.classList.remove('mobile-menu-aberto');
    });
    document.querySelectorAll('.sidebar a').forEach((link) => {
      link.addEventListener('click', () => container.classList.remove('mobile-menu-aberto'));
    });
  }

  // 4. GRÁFICO DE FATURAMENTO DA REDE (dados reais, ver carregarGraficoRede)
  if (document.getElementById('salesChart')) {
    carregarGraficoRede();
  }

  // 4.05 GRÁFICO DE CANAIS DE VENDA DA REDE (Home)
  if (document.getElementById('homeCanalChart')) {
    carregarCanalRedeHome();
  }

  // 4.06 STATUS DE SINCRONIZAÇÃO POR LOJA (Home)
  if (document.getElementById('home-sync-status')) {
    carregarStatusSincronizacaoHome();
  }

  // 4.08 ATUALIZAÇÃO AUTOMÁTICA DA HOME (quase em tempo real)
  if (document.getElementById('container-periodo')) {
    marcarAtualizadoAgora('home-atualizado-em');
    iniciarAtualizacaoAutomatica(() => {
      carregarDadosLojas();
      carregarGraficoRede();
      carregarCanalRedeHome();
      carregarStatusSincronizacaoHome();
      marcarAtualizadoAgora('home-atualizado-em');
    });
  }

  // 4.09 TELA DE CLICKUP
  if (document.querySelector('.kanban-board')) {
    carregarTarefas();
    wireColumnDropEvents();
  }

  // 4.095 TELA DE CARDÁPIO
  if (document.getElementById('cardapio-tabs')) {
    carregarPrecosCardapio();
    const inputArquivo = document.getElementById('cardapio-importar-arquivo');
    if (inputArquivo) inputArquivo.addEventListener('change', importarPlanilhaCardapio);
  }

  // 4.096 TELA DE PREPARO
  if (document.getElementById('preparo-tabs')) {
    const preparoInicioInput = document.getElementById('preparo-data-inicio');
    const preparoFimInput = document.getElementById('preparo-data-fim');
    if (preparoInicioInput && preparoFimInput && !preparoInicioInput.value && !preparoFimInput.value) {
      const padrao = periodoPreparoSelecionado();
      preparoInicioInput.value = padrao.inicio;
      preparoFimInput.value = padrao.fim;
    }
    [preparoInicioInput, preparoFimInput].forEach((input) => {
      input?.addEventListener('change', () => {
        if (preparoInicioInput.value && preparoFimInput.value) carregarPreparo();
      });
    });
    document.querySelectorAll('#preparo-tabs .tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#preparo-tabs .tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        renderPreparoTab(btn.dataset.tab);
      });
    });
    carregarPreparo();
  }

  // 4.097 TELA DE ESTOQUE
  if (document.getElementById('estoque-tabs')) {
    document.querySelectorAll('#estoque-tabs .tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#estoque-tabs .tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        estoqueTabAtual = btn.dataset.tab;
        renderEstoqueTab();
      });
    });
    document.getElementById('estoque-busca')?.addEventListener('input', () => renderEstoqueTab());
    carregarInsumos();
    carregarLotesVencendo();
    carregarFornecedores();
  }

  // 4.098 TELA DE FORNECEDORES
  if (document.getElementById('fornecedores-tabela-body')) {
    document.getElementById('fornecedores-busca')?.addEventListener('input', () => renderFornecedoresTabela());
    carregarFornecedores();
  }

  // 4.099 TELA DE COTAÇÕES
  if (document.getElementById('cotacoes-tabela-body')) {
    carregarCotacoes();
  }

  // 4.1 TELA DE CONFIGURAÇÕES
  if (document.getElementById('config-lojas-body')) {
    carregarConfigLojas();
  }
  const btnSincronizarAgora = document.getElementById('btn-sincronizar-agora');
  if (btnSincronizarAgora) {
    btnSincronizarAgora.addEventListener('click', sincronizarAgora);
  }

  // 5. INICIALIZAÇÃO DE DATAS DA INTERFACE
  const hoje = new Date();

  // Data do Form (Input Date)
  const inputData = document.getElementById('data');
  if (inputData) {
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    inputData.value = `${ano}-${mes}-${dia}`;
  }

  // Data do dia anterior para página de Home 
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);

  const dataOntemFormatada = ontem.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const elDataOntem = document.getElementById('data-ontem');
  if (elDataOntem) elDataOntem.textContent = dataOntemFormatada;

  // 6. BUSCA O FATURAMENTO REAL DA REDE VIA FLASK
  carregarDadosLojas();

  // 7. MÁSCARA FLUIDA DE MOEDA PARA O CAMPO PRESENCIAL
  const inputPresencial = document.getElementById('presencial');
  if (inputPresencial) {
    inputPresencial.addEventListener('input', function (e) {
      let apenasNumeros = e.target.value.replace(/\D/g, '');

      if (!apenasNumeros) {
        e.target.value = '';
        return;
      }

      let valorDecimal = (parseFloat(apenasNumeros) / 100).toFixed(2);
      let partes = valorDecimal.split('.');
      partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');

      e.target.value = partes.join(',');
    });
  }

  // 8. ENVIO DO FORMULÁRIO DE FECHAMENTO
  const formFechamento = document.getElementById('form-fechamento');
  if (formFechamento) {
    formFechamento.addEventListener('submit', async function (e) {
      e.preventDefault();

      const btn = document.getElementById('btn-enviar');
      const msg = document.getElementById('mensagem');

      if (btn) {
        btn.disabled = true;
        btn.innerText = "Enviando e processando...";
      }
      if (msg) {
        msg.innerText = "";
        msg.className = "status-msg";
      }

      const rawPresencial = document.getElementById('presencial')?.value || '';
      const presencialLimpo = rawPresencial ? parseFloat(rawPresencial.replace(/\./g, '').replace(',', '.')) : 0.0;

      const dados = {
        loja: document.getElementById('loja')?.value,
        data: document.getElementById('data')?.value,
        presencial: presencialLimpo
      };

      try {
        const resposta = await fetch('/api/enviar-fechamento', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados)
        });

        const resultado = await resposta.json();

        if (resposta.ok) {
          if (msg) {
            msg.innerText = "✅ Relatório processado e enviado com sucesso!";
            msg.classList.add("sucesso");
          }
          formFechamento.reset();
          if (inputData) {
            const anoAtual = new Date().getFullYear();
            const mesAtual = String(new Date().getMonth() + 1).padStart(2, '0');
            const diaAtual = String(new Date().getDate()).padStart(2, '0');
            inputData.value = `${anoAtual}-${mesAtual}-${diaAtual}`;
          }
        } else {
          if (msg) {
            msg.innerText = "❌ " + (resultado.mensagem || "Erro ao processar dados no servidor.");
            msg.classList.add("erro");
          }
        }
      } catch (erro) {
        console.error("Erro na requisição:", erro);
        if (msg) {
          msg.innerText = "❌ Falha ao conectar com o servidor.";
          msg.classList.add("erro");
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = "🚀 Processar e Enviar Relatório";
        }
      }
    });
  }

}); // Fim do DOMContentLoaded

// Inicializar Ícones Lucide
lucide.createIcons();

// --- DADOS DA APLICAÇÃO ---
// Preenchido de verdade via carregarInsights(), buscando do backend Flask
// (que por sua vez lê do cache local sincronizado com a Cardápio Web).
let dashboardData = {};
let currentTab = 'geral';
let canalChartInstance = null;

// Quando o usuário clica num dia do Histórico Diário, a Análise de Canal
// passa a mostrar os dados desse dia + loja específicos, em vez do padrão
// (período selecionado no filtro) — { unidade, diaIso } ou null.
let canalSelecionado = null;

// Paleta usada tanto no gráfico de rosca quanto na bolinha colorida da tabela,
// pra ficarem sempre com a mesma cor por posição.
const CORES_CANAL = ['#3b82f6', '#f59e0b', '#a855f7', '#10b981', '#e11d48', '#06b6d4'];

// Lojas que têm vendas presenciais (fora da Cardápio Web) e precisam do
// formulário de lançamento manual.
const UNIDADES_COM_PRESENCIAL = ['Hamburgueria Artesanos', 'Tradiça ZN'];

// Lojas que lançam a quantidade de vendas presenciais (não só o valor) —
// controla tanto o campo extra do formulário quanto a coluna de "Total de
// Vendas (dia)" na tabela de lançamentos, e permite calcular o ticket médio.
const UNIDADES_COM_QUANTIDADE_PRESENCIAL = ['Hamburgueria Artesanos', 'Tradiça ZN'];

// --- ELEMENTOS DO DOM ---
const tabButtons = document.querySelectorAll('.tab-btn');
const btnWhatsApp = document.getElementById('btn-whatsapp');
const dataInicioInput = document.getElementById('insight-data-inicio');
const dataFimInput = document.getElementById('insight-data-fim');
const diaSemanaInput = document.getElementById('insight-dia-semana');
const formPresencial = document.getElementById('form-presencial');
const presencialDiaInput = document.getElementById('presencial-dia');
const presencialValorInput = document.getElementById('presencial-valor');
const presencialQuantidadeInput = document.getElementById('presencial-quantidade');
const presencialQuantidadeField = document.getElementById('presencial-quantidade-field');
const presencialThTotal = document.getElementById('presencial-th-total');
// Renderiza a tabela de Histórico Diário. Cada bloco de dia (que pode ter
// várias linhas quando é a Visão Geral, uma por unidade) recebe uma faixa
// de fundo alternada — todas as linhas do mesmo dia compartilham a mesma
// cor, e o dia seguinte já vem com um tom diferente, facilitando identificar
// onde um dia termina e o outro começa sem depender de uma borda chamativa.
function renderHistoricoDiario(diario) {
  const dailyTableBody = document.getElementById('daily-table-body');
  if (!dailyTableBody) return;

  let grupoAlternado = false;
  dailyTableBody.innerHTML = diario.length
    ? diario.map((item, indice) => {
        const inicioDeGrupo = indice === 0 || diario[indice - 1].diaIso !== item.diaIso;
        if (inicioDeGrupo) grupoAlternado = !grupoAlternado;
        const classeGrupo = grupoAlternado ? 'grupo-dia-a' : 'grupo-dia-b';
        const chave = `${item.diaIso}|${item.unidade}`;
        const selecionada = canalSelecionado && canalSelecionado.diaIso === item.diaIso && canalSelecionado.unidade === item.unidade;
        return `
          <tr class="${classeGrupo}${inicioDeGrupo ? ' inicio-grupo-dia' : ''}${selecionada ? ' linha-selecionada' : ''}"
            data-chave="${chave}" data-dia-iso="${item.diaIso}" data-unidade="${item.unidade}"
            title="Ver análise de canal desse dia">
            <td class="font-bold dia-com-semana">
              <span class="dia-data">${item.dia.slice(0, 5)}</span>
              <span class="dia-semana-badge">${item.diaSemana}</span>
            </td>
            <td>${item.unidade}</td>
            <td>${item.pedidos}</td>
            <td>R$ ${item.ticket}</td>
            <td class="font-bold">R$ ${item.faturamento}</td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="5" class="panel-subtitle">Nenhum dia encontrado nesse período.</td></tr>`;
}

const dailyTableBodyEl = document.getElementById('daily-table-body');
if (dailyTableBodyEl) {
  dailyTableBodyEl.addEventListener('click', (evento) => {
    const linha = evento.target.closest('tr[data-dia-iso]');
    if (!linha) return;
    exibirCanalDoDia(linha.dataset.unidade, linha.dataset.diaIso);
  });
}

// --- RENDERIZAR TELA ---
function updateDashboard(tabKey) {
  currentTab = tabKey;
  const data = dashboardData[tabKey];

  // Trocar de aba também limpa a seleção de dia clicado no Histórico Diário
  // — a análise de canal volta a mostrar o período selecionado (padrão).
  canalSelecionado = null;
  exibirCanalPadrao(data, tabKey);

  // "Vendas Presenciais" só existe nas lojas que não têm 100% do faturamento
  // capturado pela Cardápio Web.
  const painelPresencial = document.getElementById('panel-vendas-presenciais');
  if (painelPresencial) {
    const temPresencial = UNIDADES_COM_PRESENCIAL.includes(tabKey);
    painelPresencial.style.display = temPresencial ? '' : 'none';

    const temQuantidade = UNIDADES_COM_QUANTIDADE_PRESENCIAL.includes(tabKey);
    if (presencialQuantidadeField) presencialQuantidadeField.style.display = temQuantidade ? '' : 'none';
    if (presencialThTotal) presencialThTotal.style.display = temQuantidade ? '' : 'none';

    if (temPresencial) {
      carregarPresencial(tabKey);
    }
  }

  // Renderiza Histórico Diário (já respeita o período selecionado no topo)
  renderHistoricoDiario(data.diario || []);

  // Re-inicializa ícones do Lucide após re-renderizar HTML
  lucide.createIcons();
}

// Nomes de exibição dos canais em todas as abas (Visão Geral + as 4 lojas).
// "portal" vira "Presencial" em todo lugar na Visão Geral; nas abas de loja
// individual, só na Tradiça Simus (nas outras lojas continua "portal").
function nomeExibicaoCanal(canalBruto, unidade) {
  const mapa = { ifood: 'IFood', food99: '99Food', catalog: 'Cardápio Web' };

  if (!unidade || unidade === 'geral') {
    if (canalBruto === 'portal') return 'Presencial';
    return mapa[canalBruto] || canalBruto;
  }

  if (unidade === 'Tradiça Simus' && canalBruto === 'portal') return 'Presencial';
  return mapa[canalBruto] || canalBruto;
}

// Atualiza os 3 cards de topo (Faturamento/Pedidos/Ticket) — usado tanto no
// estado padrão da aba (período selecionado) quanto ao clicar num dia
// específico do Histórico Diário.
function atualizarCardsTopo(opcoes) {
  document.getElementById('val-faturamento').textContent = `R$ ${opcoes.faturamento}`;
  document.getElementById('val-pedidos').textContent = opcoes.pedidos;
  document.getElementById('val-ticket').textContent = `R$ ${opcoes.ticket}`;

  renderTrend('trend-faturamento', opcoes.faturamentoTrend, opcoes.faturamentoUp, opcoes.textoComparacao);
  renderTrend('trend-pedidos', opcoes.pedidosTrend, opcoes.pedidosUp, opcoes.textoComparacao);
  renderTrend('trend-ticket', opcoes.ticketTrend, opcoes.ticketUp, opcoes.textoComparacao);
}

// Mostra a análise de canal padrão da aba atual (período selecionado, já
// vindo em dashboardData) — usado ao trocar de aba ou ao voltar de um dia
// selecionado no Histórico Diário. Também restaura os cards de topo.
function exibirCanalPadrao(data, tabKey) {
  const canalDataLabel = document.getElementById('canal-data-label');
  if (canalDataLabel) canalDataLabel.textContent = data.canalDataLabel || '--/--/----';

  const unidadeLabel = document.getElementById('canal-unidade-label');
  if (unidadeLabel) unidadeLabel.textContent = tabKey !== 'geral' ? `— ${tabKey}` : '';

  const btnVoltar = document.getElementById('btn-canal-voltar-ontem');
  if (btnVoltar) btnVoltar.style.display = 'none';

  destacarLinhaHistoricoSelecionada(null);
  renderCanalAnalysis(data.canais || [], tabKey);

  // Em todas as abas, os 3 primeiros cards somam o período selecionado no
  // filtro — o texto abaixo é o próprio período, sem seta de tendência.
  atualizarCardsTopo({
    faturamento: data.faturamento,
    pedidos: data.pedidos,
    ticket: data.ticket,
    faturamentoTrend: data.faturamentoTrend,
    faturamentoUp: data.faturamentoUp,
    pedidosTrend: data.pedidosTrend,
    pedidosUp: data.pedidosUp,
    ticketTrend: data.ticketTrend,
    ticketUp: data.ticketUp,
    textoComparacao: data.canalDataLabel || '',
  });
}

// Busca e mostra a análise de canal de um dia + loja específicos, clicado
// no Histórico Diário — e também atualiza os cards de topo com os valores
// desse mesmo dia (já disponíveis na lista do Histórico Diário carregada).
async function exibirCanalDoDia(unidade, diaIso) {
  try {
    const resposta = await fetch(
      `/api/canal-analise?unidade=${encodeURIComponent(unidade)}&dia=${diaIso}`
    );
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();

    canalSelecionado = { unidade, diaIso };

    const canalDataLabel = document.getElementById('canal-data-label');
    if (canalDataLabel) canalDataLabel.textContent = dados.dataLabel || '--/--/----';

    const unidadeLabel = document.getElementById('canal-unidade-label');
    if (unidadeLabel) unidadeLabel.textContent = `— ${unidade}`;

    const btnVoltar = document.getElementById('btn-canal-voltar-ontem');
    if (btnVoltar) btnVoltar.style.display = '';

    destacarLinhaHistoricoSelecionada(diaIso + '|' + unidade);
    renderCanalAnalysis(dados.canais || [], unidade, dados.editavel ? { unidade, diaIso } : null);

    const diarioAtual = (dashboardData[currentTab] || {}).diario || [];
    const linhaDoDia = diarioAtual.find(item => item.diaIso === diaIso && item.unidade === unidade);
    if (linhaDoDia) {
      atualizarCardsTopo({
        faturamento: linhaDoDia.faturamento,
        pedidos: linhaDoDia.pedidos,
        ticket: linhaDoDia.ticket,
        faturamentoTrend: 'período novo',
        faturamentoUp: true,
        pedidosTrend: 'período novo',
        pedidosUp: true,
        ticketTrend: 'período novo',
        ticketUp: true,
        textoComparacao: linhaDoDia.dia,
      });
    }

    // Sobe a página pra deixar claro que os cards e o gráfico acabaram de
    // mudar — clicar num dia lá embaixo, no Histórico Diário, não deixaria
    // isso visível sem rolar de volta pro topo.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (erro) {
    console.error('Falha ao carregar análise de canal do dia:', erro);
    alert('Não foi possível carregar a análise de canal desse dia. Confira se o Flask está rodando.');
  }
}

function destacarLinhaHistoricoSelecionada(chave) {
  const linhas = document.querySelectorAll('#daily-table-body tr[data-chave]');
  linhas.forEach(tr => {
    tr.classList.toggle('linha-selecionada', chave !== null && tr.dataset.chave === chave);
  });
}

const btnCanalVoltarOntem = document.getElementById('btn-canal-voltar-ontem');
if (btnCanalVoltarOntem) {
  btnCanalVoltarOntem.addEventListener('click', () => {
    canalSelecionado = null;
    const data = dashboardData[currentTab];
    if (data) exibirCanalPadrao(data, currentTab);
  });
}

function _formatarMoedaBR(valor) {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _formatarNumeroBR(valor) {
  return valor.toLocaleString('pt-BR');
}

// Regra do gráfico de canal: só pode existir uma legenda por canal — se dois
// canais brutos diferentes (ex: "portal" e "Presencial") viram o mesmo nome
// de exibição, eles são somados numa linha só antes de desenhar.
function mesclarCanaisPorNomeExibicao(canais, unidadeParaLabels, resolverNome) {
  const resolver = resolverNome || (canalBruto => nomeExibicaoCanal(canalBruto, unidadeParaLabels));
  const totalFaturamento = canais.reduce((soma, c) => soma + c.faturamentoNumero, 0) || 1;
  const grupos = new Map();

  canais.forEach(c => {
    const nome = resolver(c.canal);
    const pedidosNumero = c.pedidosNumero ?? (parseInt(String(c.pedidos).replace(/\./g, ''), 10) || 0);
    const atual = grupos.get(nome) || { canal: nome, canalBruto: c.canal, faturamentoNumero: 0, pedidosNumero: 0, ajustado: false };
    atual.faturamentoNumero += c.faturamentoNumero;
    atual.pedidosNumero += pedidosNumero;
    atual.ajustado = atual.ajustado || !!c.ajustado;
    grupos.set(nome, atual);
  });

  const mesclados = Array.from(grupos.values()).map(g => ({
    canal: g.canal,
    canalBruto: g.canalBruto,
    ajustado: g.ajustado,
    faturamentoNumero: g.faturamentoNumero,
    faturamento: _formatarMoedaBR(g.faturamentoNumero),
    pedidosNumero: g.pedidosNumero,
    pedidos: _formatarNumeroBR(g.pedidosNumero),
    ticket: _formatarMoedaBR(g.pedidosNumero ? g.faturamentoNumero / g.pedidosNumero : 0),
    percentual: Math.round((g.faturamentoNumero / totalFaturamento) * 1000) / 10,
  }));

  mesclados.sort((a, b) => b.faturamentoNumero - a.faturamentoNumero);
  return mesclados;
}

// Gráfico de rosca + tabela de canais, no mesmo formato do painel da Cardápio Web.
// contextoEdicao = { unidade, diaIso } quando é a visão de UM dia específico
// (só aí faz sentido editar um canal) — null na visão de período agregado.
function renderCanalAnalysis(canaisBrutos, unidadeParaLabels, contextoEdicao) {
  const canalTableBody = document.getElementById('canal-table-body');
  const canvas = document.getElementById('canalChart');
  const thAcoes = document.getElementById('canal-th-acoes');
  if (!canalTableBody || !canvas) return;

  const podeEditar = !!(contextoEdicao && window.usuarioLogado?.papel === 'admin');
  if (thAcoes) thAcoes.style.display = podeEditar ? '' : 'none';

  if (canalChartInstance) {
    canalChartInstance.destroy();
    canalChartInstance = null;
  }

  if (!canaisBrutos.length) {
    canalTableBody.innerHTML = `<tr><td colspan="${podeEditar ? 6 : 5}" class="panel-subtitle">Nenhum dado de canal nesse período.</td></tr>`;
    return;
  }

  const canais = mesclarCanaisPorNomeExibicao(canaisBrutos, unidadeParaLabels);

  canalTableBody.innerHTML = canais.map((c, i) => `
    <tr>
      <td>
        <span class="canal-nome">
          <span class="canal-dot" style="background-color: ${CORES_CANAL[i % CORES_CANAL.length]};"></span>
          ${c.canal}
          ${c.ajustado ? '<span class="badge-canal-ajustado" title="Valor ajustado manualmente">ajustado</span>' : ''}
        </span>
      </td>
      <td class="font-bold">R$ ${c.faturamento}</td>
      <td>R$ ${c.ticket}</td>
      <td>${c.pedidos}</td>
      <td>${c.percentual}%</td>
      ${podeEditar ? `
        <td class="acoes-linha">
          <button type="button" class="btn-acao-icone" data-acao="editar-ajuste-canal"
            data-canal-bruto="${c.canalBruto}" data-canal-label="${escaparHtml(c.canal)}"
            data-faturamento="${c.faturamentoNumero}" data-pedidos="${c.pedidosNumero}"
            title="Ajustar valores">
            <i data-lucide="pencil"></i>
          </button>
          ${c.ajustado ? `
            <button type="button" class="btn-acao-icone btn-excluir" data-acao="remover-ajuste-canal"
              data-canal-bruto="${c.canalBruto}" data-canal-label="${escaparHtml(c.canal)}"
              title="Remover ajuste (voltar ao valor sincronizado)">
              <i data-lucide="rotate-ccw"></i>
            </button>
          ` : ''}
        </td>
      ` : ''}
    </tr>
  `).join('');

  if (podeEditar) {
    canalTableBody.querySelectorAll('[data-acao="editar-ajuste-canal"]').forEach(btn => {
      btn.addEventListener('click', () => abrirModalAjusteCanal(
        contextoEdicao.unidade, contextoEdicao.diaIso,
        btn.dataset.canalBruto, btn.dataset.canalLabel,
        parseFloat(btn.dataset.faturamento), parseInt(btn.dataset.pedidos, 10)
      ));
    });
    canalTableBody.querySelectorAll('[data-acao="remover-ajuste-canal"]').forEach(btn => {
      btn.addEventListener('click', () => removerAjusteCanal(
        contextoEdicao.unidade, contextoEdicao.diaIso, btn.dataset.canalBruto, btn.dataset.canalLabel
      ));
    });
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();

  if (typeof Chart !== 'undefined') {
    canalChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: canais.map(c => c.canal),
        datasets: [{
          data: canais.map(c => c.faturamentoNumero),
          backgroundColor: canais.map((_, i) => CORES_CANAL[i % CORES_CANAL.length]),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: R$ ${canais[ctx.dataIndex].faturamento} (${canais[ctx.dataIndex].percentual}%)`,
            },
          },
        },
      },
    });
  }
}

// --- AJUSTE MANUAL DE CANAL (quando o painel da Cardápio Web diverge da API) ---
let ajusteCanalContexto = null;

function abrirModalAjusteCanal(unidade, diaIso, canalBruto, canalLabel, faturamentoAtual, pedidosAtual) {
  ajusteCanalContexto = { unidade, diaIso, canalBruto, canalLabel };
  document.getElementById('ajuste-canal-subtitulo').textContent =
    `${unidade} — ${canalLabel} — ${diaIso.split('-').reverse().join('/')}`;
  document.getElementById('ajuste-canal-faturamento').value = faturamentoAtual.toFixed(2);
  document.getElementById('ajuste-canal-pedidos').value = pedidosAtual;
  document.getElementById('modal-ajuste-canal').style.display = 'flex';
}

function fecharModalAjusteCanal() {
  document.getElementById('modal-ajuste-canal').style.display = 'none';
  ajusteCanalContexto = null;
}

document.getElementById('btn-ajuste-canal-fechar')?.addEventListener('click', fecharModalAjusteCanal);
document.getElementById('btn-ajuste-canal-cancelar')?.addEventListener('click', fecharModalAjusteCanal);

// Recarrega tudo depois de salvar/remover um ajuste: primeiro o período
// inteiro (carregarInsights), pra "Histórico Diário" e os totais agregados
// também refletirem o ajuste — senão só a tabela de canais do dia mudaria,
// e os cards de topo (que vêm do "diario" já carregado antes) ficariam
// mostrando o valor antigo. Depois, reabre a visão do dia específico.
async function _recarregarAposAjusteCanal() {
  if (!canalSelecionado) return;
  // Guarda antes de chamar carregarInsights: ele reseta canalSelecionado
  // pra null ao voltar pra visão padrão do período (exibirCanalPadrao).
  const { unidade, diaIso } = canalSelecionado;
  const { inicio, fim, diaSemana } = periodoInsightsSelecionado();
  await carregarInsights(inicio, fim, diaSemana);
  await exibirCanalDoDia(unidade, diaIso);
}

document.getElementById('form-ajuste-canal')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!ajusteCanalContexto) return;

  const botaoSalvar = document.getElementById('btn-ajuste-canal-salvar');
  const corpo = {
    unidade: ajusteCanalContexto.unidade,
    dia: ajusteCanalContexto.diaIso,
    canal: ajusteCanalContexto.canalBruto,
    faturamento: document.getElementById('ajuste-canal-faturamento').value,
    quantidadePedidos: document.getElementById('ajuste-canal-pedidos').value,
  };

  botaoSalvar.disabled = true;
  botaoSalvar.textContent = 'Salvando...';
  try {
    const resposta = await fetch('/api/ajuste-canal', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao salvar ajuste');

    fecharModalAjusteCanal();
    await _recarregarAposAjusteCanal();
  } catch (erro) {
    console.error('Falha ao salvar ajuste de canal:', erro);
    alert(erro.message || 'Não foi possível salvar o ajuste.');
  } finally {
    botaoSalvar.disabled = false;
    botaoSalvar.textContent = 'Salvar ajuste';
  }
});

async function removerAjusteCanal(unidade, diaIso, canalBruto, canalLabel) {
  if (!confirm(`Remover o ajuste manual de "${canalLabel}"? Volta a mostrar o valor sincronizado automaticamente.`)) return;
  try {
    const resposta = await fetch(
      `/api/ajuste-canal?unidade=${encodeURIComponent(unidade)}&dia=${diaIso}&canal=${encodeURIComponent(canalBruto)}`,
      { method: 'DELETE' }
    );
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao remover ajuste');
    await _recarregarAposAjusteCanal();
  } catch (erro) {
    console.error('Falha ao remover ajuste de canal:', erro);
    alert(erro.message || 'Não foi possível remover o ajuste.');
  }
}

// Auxiliar para Tendência (Up/Down)
function renderTrend(elementId, trendValue, isUp, textoComparacao = '') {
  const container = document.getElementById(elementId);

  // Sem dado do dia anterior pra comparar (ex: segunda-feira, loja fechada)
  // — não mostra "período novo" nem a seta de tendência, só a data.
  if (trendValue === 'período novo') {
    container.innerHTML = `<span class="trend-sub">${textoComparacao}</span>`;
    return;
  }

  const icon = isUp ? 'trending-up' : 'trending-down';
  const colorClass = isUp ? 'trend-up' : 'trend-down';

  container.innerHTML = `
    <span class="trend-value ${colorClass}">
      <i data-lucide="${icon}"></i> ${trendValue}
    </span>
    <span class="trend-sub">${textoComparacao}</span>
  `;
}

// --- TROCA DE ABAS ---
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (!dashboardData[btn.dataset.tab]) return;
    tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateDashboard(btn.dataset.tab);
  });
});

// --- ENVIAR PARA O WHATSAPP ---
// O relatório sempre traz as 4 lojas juntas (independente da aba atual),
// com o faturamento por canal do período selecionado no calendário do topo
// da página (mesmos dados já carregados em dashboardData). A comparação com
// as outras ocorrências do mesmo dia da semana dentro do mês só faz sentido
// pra um único dia, então só entra quando início e fim são o mesmo dia.
const NOMES_CURTOS_WHATSAPP = {
  'Hamburgueria Artesanos': 'Artesanos',
  'Tradiça ZN': 'Tradiça',
  'Tradiça Simus': 'Simus',
  'Açaí Na Lata': 'Açaí NaLata',
};

// Nesse relatório, "portal" vira "Presencial" em qualquer loja (não só na
// Simus) — o modelo só tem essas 4 categorias fixas, então todo canal
// precisa cair em uma delas pra o "Total do dia" fechar certinho.
function nomeExibicaoCanalRelatorio(canalBruto) {
  const mapa = { ifood: 'IFood', food99: '99Food', catalog: 'Cardápio Web', portal: 'Presencial' };
  return mapa[canalBruto] || canalBruto;
}

async function montarRelatorioWhatsApp() {
  const { inicio, fim } = periodoInsightsSelecionado();
  const mesmoDia = inicio === fim;

  const blocos = [];
  for (const unidade of Object.keys(NOMES_CURTOS_WHATSAPP)) {
    const data = dashboardData[unidade];
    if (!data) continue;

    const canaisMesclados = mesclarCanaisPorNomeExibicao(data.canais || [], null, nomeExibicaoCanalRelatorio);
    const valorPorNome = {};
    canaisMesclados.forEach(c => { valorPorNome[c.canal] = c.faturamento; });
    const totalPeriodo = canaisMesclados.reduce((soma, c) => soma + c.faturamentoNumero, 0);

    const rotulo = mesmoDia ? 'do dia' : 'do período';
    const cabecalho = mesmoDia
      ? `Faturamento do dia ${NOMES_CURTOS_WHATSAPP[unidade]}`
      : `Faturamento do período ${NOMES_CURTOS_WHATSAPP[unidade]} — ${data.canalDataLabel}`;

    let bloco = `*${cabecalho}*\n\n`;
    bloco += `💵 Presencial: R$ ${valorPorNome['Presencial'] || '0,00'}\n`;
    bloco += `📱 iFood: R$ ${valorPorNome['IFood'] || '0,00'}\n`;
    bloco += `🌐 Cardápio Web: R$ ${valorPorNome['Cardápio Web'] || '0,00'}\n`;
    bloco += `🛵 99 Food: R$ ${valorPorNome['99Food'] || '0,00'}\n\n`;
    bloco += `Total ${rotulo}: R$ ${_formatarMoedaBR(totalPeriodo)}`;

    // A comparação "1ª/2ª/3ª/4ª [dia da semana] do mês" só faz sentido pra
    // um único dia — não entra quando o período selecionado tem mais de um dia.
    if (mesmoDia) {
      const respSemana = await fetch(`/api/faturamento-mesmo-dia-semana?unidade=${encodeURIComponent(unidade)}&dia=${inicio}`);
      if (respSemana.ok) {
        const dadosSemana = await respSemana.json();
        const ocorrencias = dadosSemana.ocorrencias || [];
        const diaSemana = dadosSemana.diaSemana || '';
        const valoresSemana = [0, 1, 2, 3].map(i => (ocorrencias[i] ? ocorrencias[i].faturamento : '0,00'));

        bloco += `\n\n`;
        bloco += `- 1 ${diaSemana} do mês: R$ ${valoresSemana[0]}\n`;
        bloco += `- 2 ${diaSemana} do mês: R$ ${valoresSemana[1]}\n`;
        bloco += `- 3 ${diaSemana} do mês: R$ ${valoresSemana[2]}\n`;
        bloco += `- 4 ${diaSemana} do mês: R$ ${valoresSemana[3]}`;
      }
    }

    blocos.push(bloco);
  }

  return blocos.join('\n\n\n');
}

// Copiar pra área de transferência exige um clique "fresco" (sem await no
// meio) em alguns navegadores de celular, senão o pedido de permissão é
// negado (a mesma exigência que existia pro window.open, só que mais
// rígida). Por isso o relatório é montado primeiro, mostrado num modal, e
// só then o clique em "Copiar" — um gesto novo e direto — chama a área de
// transferência, sem nenhum await antes.
const modalWhatsApp = document.getElementById('modal-whatsapp');
const whatsappTextoRelatorio = document.getElementById('whatsapp-texto-relatorio');
const btnWhatsAppFechar = document.getElementById('btn-whatsapp-fechar');
const btnWhatsAppAbrir = document.getElementById('btn-whatsapp-abrir');
const btnWhatsAppCopiar = document.getElementById('btn-whatsapp-copiar');

function fecharModalWhatsApp() {
  if (modalWhatsApp) modalWhatsApp.style.display = 'none';
}

if (btnWhatsApp) {
  btnWhatsApp.addEventListener('click', async () => {
    const htmlOriginal = btnWhatsApp.innerHTML;
    btnWhatsApp.disabled = true;
    btnWhatsApp.innerHTML = '<span>Montando relatório...</span>';
    try {
      const mensagem = await montarRelatorioWhatsApp();
      if (whatsappTextoRelatorio) whatsappTextoRelatorio.value = mensagem;
      if (modalWhatsApp) modalWhatsApp.style.display = 'flex';
    } catch (erro) {
      console.error('Falha ao montar relatório do WhatsApp:', erro);
      alert('Não foi possível montar o relatório. Confira se o Flask está rodando.');
    } finally {
      btnWhatsApp.disabled = false;
      btnWhatsApp.innerHTML = htmlOriginal;
    }
  });
}

if (btnWhatsAppFechar) btnWhatsAppFechar.addEventListener('click', fecharModalWhatsApp);
if (modalWhatsApp) {
  modalWhatsApp.addEventListener('click', (evento) => {
    if (evento.target === modalWhatsApp) fecharModalWhatsApp();
  });
}

if (btnWhatsAppAbrir) {
  btnWhatsAppAbrir.addEventListener('click', () => {
    window.open('https://wa.me/', '_blank');
  });
}

if (btnWhatsAppCopiar) {
  btnWhatsAppCopiar.addEventListener('click', async () => {
    const texto = whatsappTextoRelatorio ? whatsappTextoRelatorio.value : '';
    const textoOriginalBotao = btnWhatsAppCopiar.textContent;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(texto);
      } else {
        whatsappTextoRelatorio.select();
        document.execCommand('copy');
      }
      btnWhatsAppCopiar.textContent = 'Copiado!';
    } catch (erro) {
      console.error('Falha ao copiar mensagem:', erro);
      // Fallback pra navegadores que negam a Clipboard API: seleciona o
      // texto no campo pra pelo menos deixar o Ctrl+C/copiar manual pronto.
      whatsappTextoRelatorio.select();
      btnWhatsAppCopiar.textContent = 'Selecionado — copie manualmente';
    } finally {
      setTimeout(() => { btnWhatsAppCopiar.textContent = textoOriginalBotao; }, 2000);
    }
  });
}

// Trava a data de fim pra nunca ficar antes da data de início (e vice-versa)
// — tanto no seletor nativo do navegador (via min/max, que já desabilita as
// datas inválidas visualmente) quanto corrigindo na marra se, mesmo assim,
// o campo ficar com um intervalo invertido (ex: digitando a data direto).
function validarIntervaloDatasInsights() {
  if (!dataInicioInput || !dataFimInput) return;

  // Corrige primeiro um intervalo invertido (usando os valores originais),
  // só depois trava o min/max um do outro — senão o max de início acaba
  // herdando o valor de fim de ANTES da correção.
  if (dataInicioInput.value && dataFimInput.value && dataFimInput.value < dataInicioInput.value) {
    dataFimInput.value = dataInicioInput.value;
  }

  if (dataInicioInput.value) dataFimInput.min = dataInicioInput.value;
  if (dataFimInput.value) dataInicioInput.max = dataFimInput.value;
}

// --- CARREGA OS DADOS REAIS DE INSIGHTS (BACKEND FLASK -> CACHE CARDÁPIO WEB) ---
// Período selecionado no calendário de data início-fim, no topo da página.
// Sem os dois campos preenchidos, usa o padrão dos últimos 30 dias.
function periodoInsightsSelecionado() {
  const hoje = new Date();
  const fimPadrao = hoje.toISOString().slice(0, 10);
  const inicioPadraoData = new Date();
  inicioPadraoData.setDate(hoje.getDate() - 29);
  const inicioPadrao = inicioPadraoData.toISOString().slice(0, 10);

  const inicio = (dataInicioInput && dataInicioInput.value) || inicioPadrao;
  const fim = (dataFimInput && dataFimInput.value) || fimPadrao;
  const diaSemana = diaSemanaInput ? diaSemanaInput.value : '';
  return { inicio, fim, diaSemana };
}

async function carregarInsights(inicio, fim, diaSemana) {
  const canalTableBody = document.getElementById('canal-table-body');
  if (canalTableBody) {
    canalTableBody.innerHTML = `<tr><td colspan="5" class="panel-subtitle">Carregando dados...</td></tr>`;
  }

  try {
    const filtroDiaSemana = diaSemana ? `&diaSemana=${diaSemana}` : '';
    const resposta = await fetch(`/api/insights?inicio=${inicio}&fim=${fim}${filtroDiaSemana}`);
    if (!resposta.ok) {
      throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    }
    dashboardData = await resposta.json();
    updateDashboard(dashboardData[currentTab] ? currentTab : 'geral');
    marcarAtualizadoAgora('insight-atualizado-em');
  } catch (erro) {
    console.error('Falha ao carregar insights:', erro);
    if (canalTableBody) {
      canalTableBody.innerHTML = `<tr><td colspan="5" style="color: #ef4444;">Não foi possível carregar os dados. Confira se o Flask está rodando e se a sincronização já rodou pelo menos uma vez (python sincronizar.py).</td></tr>`;
    }
  }
}

// --- PREPARO (indicadores operacionais da cozinha) ---
let preparoData = {};
let preparoTabAtual = 'geral';
let preparoHorarioChartInstance = null;

function periodoPreparoSelecionado() {
  const hoje = new Date();
  const fimPadrao = hoje.toISOString().slice(0, 10);
  const inicioPadraoData = new Date();
  inicioPadraoData.setDate(hoje.getDate() - 29);
  const inicioPadrao = inicioPadraoData.toISOString().slice(0, 10);

  const inicioInput = document.getElementById('preparo-data-inicio');
  const fimInput = document.getElementById('preparo-data-fim');
  const inicio = (inicioInput && inicioInput.value) || inicioPadrao;
  const fim = (fimInput && fimInput.value) || fimPadrao;
  return { inicio, fim };
}

function _formatarMinutos(valor) {
  if (valor === null || valor === undefined) return '—';
  const horas = Math.floor(valor / 60);
  const minutos = Math.round(valor % 60);
  return horas > 0 ? `${horas}h ${minutos}min` : `${minutos} min`;
}

async function carregarPreparo() {
  const { inicio, fim } = periodoPreparoSelecionado();
  try {
    const resposta = await fetch(`/api/preparo?inicio=${inicio}&fim=${fim}`);
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    preparoData = await resposta.json();
    renderPreparoTab(preparoTabAtual);
    marcarAtualizadoAgora('preparo-atualizado-em');
  } catch (erro) {
    console.error('Falha ao carregar Preparo:', erro);
  }
}

function renderPreparoTab(tab) {
  const dados = preparoData[tab];
  if (!dados) return;
  preparoTabAtual = tab;

  document.getElementById('preparo-val-tempo-medio').textContent = _formatarMinutos(dados.tempoMedioMinutos);
  document.getElementById('preparo-val-pedidos').textContent = (dados.totalPedidos || 0).toLocaleString('pt-BR');

  const picoEl = document.getElementById('preparo-val-pico');
  const picoSubEl = document.getElementById('preparo-pico-sub');
  if (dados.horarioPico) {
    picoEl.textContent = `${String(dados.horarioPico.hora).padStart(2, '0')}h`;
    picoSubEl.textContent = `${dados.horarioPico.totalPedidos} pedidos nesse horário`;
  } else {
    picoEl.textContent = '—';
    picoSubEl.textContent = '';
  }

  const canvas = document.getElementById('preparoHorarioChart');
  if (preparoHorarioChartInstance) {
    preparoHorarioChartInstance.destroy();
    preparoHorarioChartInstance = null;
  }
  if (canvas && typeof Chart !== 'undefined' && dados.porHorario) {
    preparoHorarioChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: dados.porHorario.map(h => `${String(h.hora).padStart(2, '0')}h`),
        datasets: [{
          label: 'Pedidos',
          data: dados.porHorario.map(h => h.totalPedidos),
          backgroundColor: 'rgba(220, 38, 38, 0.7)',
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  // "Tempo médio por loja" só faz sentido comparando lojas — na Visão Geral.
  const painelPorLoja = document.getElementById('preparo-panel-por-loja');
  const corpoPorLoja = document.getElementById('preparo-por-loja-body');
  if (tab === 'geral' && dados.porLoja && dados.porLoja.length) {
    painelPorLoja.classList.remove('oculto');
    corpoPorLoja.innerHTML = dados.porLoja.map(l => `
      <tr>
        <td>${escaparHtml(l.loja)}</td>
        <td>${l.totalPedidos}</td>
        <td>${_formatarMinutos(l.tempoMedioMinutos)}</td>
      </tr>
    `).join('');
  } else {
    painelPorLoja.classList.add('oculto');
  }

  const corpoGargalos = document.getElementById('preparo-gargalos-body');
  corpoGargalos.innerHTML = (dados.gargalos && dados.gargalos.length)
    ? dados.gargalos.map(g => `
        <tr>
          <td>${g.dia.split('-').reverse().join('/')}</td>
          <td>${escaparHtml(g.loja)}</td>
          <td>${g.totalPedidos}</td>
          <td>${_formatarMinutos(g.tempoMedioMinutos)}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="4" class="panel-subtitle">Sem dados suficientes nesse período.</td></tr>`;

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --- ESTOQUE (insumos nativos, catálogo único + quantidade por loja) ---
const LOJAS_ESTOQUE = ['Hamburgueria Artesanos', 'Açaí Na Lata', 'Tradiça ZN', 'Tradiça Simus'];
const STATUS_LABEL_ESTOQUE = { ok: 'OK', baixo: 'Baixo', critico: 'Crítico' };
const STATUS_CLASSE_BADGE_ESTOQUE = { ok: 'pos', baixo: 'neu-orange', critico: 'neg' };
const STATUS_CLASSE_BARRA_ESTOQUE = { ok: 'bar-green', baixo: 'bar-orange', critico: 'bar-red' };

let estoqueInsumos = [];
let estoqueTabAtual = 'geral';
let estoqueEditandoContexto = null; // { insumoId, loja }
let estoqueConsumoMedio = {}; // { [insumoId]: { [loja]: consumoMedioDiario } }

async function carregarInsumos() {
  try {
    const [respostaInsumos, respostaConsumo] = await Promise.all([
      fetch('/api/insumos'),
      fetch('/api/insumos/consumo-medio'),
    ]);
    if (!respostaInsumos.ok) throw new Error(`Erro no servidor Flask: ${respostaInsumos.status}`);
    const dados = await respostaInsumos.json();
    estoqueInsumos = dados.insumos || [];

    estoqueConsumoMedio = {};
    if (respostaConsumo.ok) {
      const dadosConsumo = await respostaConsumo.json();
      (dadosConsumo.consumo || []).forEach((linha) => {
        const porLoja = estoqueConsumoMedio[linha.insumoId] || (estoqueConsumoMedio[linha.insumoId] = {});
        porLoja[linha.unidade] = linha.consumoMedioDiario;
      });
    }

    renderEstoqueTab();
  } catch (erro) {
    console.error('Falha ao carregar insumos:', erro);
    const tbody = document.getElementById('estoque-tabela-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="color:#ef4444;">Não foi possível carregar o estoque. Confira se o Flask está rodando.</td></tr>`;
  }
}

// null = sem dado suficiente (insumo ainda sem Ficha Técnica casada com
// venda registrada) — diferente de 0, que seria "consumo real zero".
function _consumoMedioParaLinha(insumoId, loja) {
  const porLoja = estoqueConsumoMedio[insumoId];
  if (!porLoja) return null;
  if (loja) return loja in porLoja ? porLoja[loja] : null;
  const valores = LOJAS_ESTOQUE.filter((l) => l in porLoja).map((l) => porLoja[l]);
  return valores.length ? valores.reduce((a, b) => a + b, 0) : null;
}

function _statusEstoqueClient(quantidadeAtual, estoqueMinimo) {
  if (quantidadeAtual <= 0) return 'critico';
  if (estoqueMinimo <= 0) return 'ok';
  if (quantidadeAtual < estoqueMinimo) return 'critico';
  if (quantidadeAtual < estoqueMinimo * 1.3) return 'baixo';
  return 'ok';
}

// "geral" traz uma linha por insumo, SOMANDO quantidade e mínimo das 4
// lojas (visão consolidada da rede) — não separa por loja. Uma loja
// específica traz a linha real daquela loja.
function _linhasEstoqueParaTab(tab) {
  if (tab === 'geral') {
    return estoqueInsumos.map((insumo) => {
      let quantidadeAtual = 0;
      let estoqueMinimo = 0;
      LOJAS_ESTOQUE.forEach((loja) => {
        const dadosLoja = insumo.porLoja[loja];
        if (dadosLoja) {
          quantidadeAtual += dadosLoja.quantidadeAtual;
          estoqueMinimo += dadosLoja.estoqueMinimo;
        }
      });
      return {
        insumo,
        loja: null,
        dados: {
          quantidadeAtual,
          estoqueMinimo,
          status: _statusEstoqueClient(quantidadeAtual, estoqueMinimo),
          consumoMedio: _consumoMedioParaLinha(insumo.id, null),
        },
      };
    });
  }

  return estoqueInsumos
    .filter((insumo) => insumo.porLoja[tab])
    .map((insumo) => ({
      insumo,
      loja: tab,
      dados: { ...insumo.porLoja[tab], consumoMedio: _consumoMedioParaLinha(insumo.id, tab) },
    }));
}

function renderEstoqueTab() {
  const isAdmin = window.usuarioLogado?.papel === 'admin';
  const tbody = document.getElementById('estoque-tabela-body');
  if (!tbody) return;

  const thAcoes = document.getElementById('estoque-th-acoes');
  const subtitulo = document.getElementById('estoque-tabela-subtitulo');
  const acoesTopo = document.getElementById('estoque-acoes-admin');
  const ehGeral = estoqueTabAtual === 'geral';

  if (thAcoes) thAcoes.style.display = isAdmin ? '' : 'none';
  if (subtitulo) subtitulo.textContent = ehGeral ? 'Consolidado de todas as unidades' : estoqueTabAtual;
  if (acoesTopo) acoesTopo.style.display = isAdmin ? '' : 'none';

  let linhas = _linhasEstoqueParaTab(estoqueTabAtual);

  const termoBusca = (document.getElementById('estoque-busca')?.value || '').trim().toLowerCase();
  if (termoBusca) {
    linhas = linhas.filter(l => l.insumo.nome.toLowerCase().includes(termoBusca));
  }

  const contagem = { ok: 0, baixo: 0, critico: 0 };
  linhas.forEach(l => { contagem[l.dados.status] = (contagem[l.dados.status] || 0) + 1; });
  document.getElementById('estoque-val-cadastrados').textContent = linhas.length;
  document.getElementById('estoque-val-ok').textContent = contagem.ok;
  document.getElementById('estoque-val-baixo').textContent = contagem.baixo;
  document.getElementById('estoque-val-critico').textContent = contagem.critico;

  if (!linhas.length) {
    const colspan = 6 + (isAdmin ? 1 : 0);
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="panel-subtitle">Nenhum insumo encontrado.</td></tr>`;
    return;
  }

  linhas.sort((a, b) => (b.insumo.favorito - a.insumo.favorito) || a.insumo.nome.localeCompare(b.insumo.nome));

  tbody.innerHTML = linhas.map(({ insumo, loja, dados }) => {
    const percentual = dados.estoqueMinimo > 0
      ? Math.min(100, Math.round((dados.quantidadeAtual / (dados.estoqueMinimo * 1.5)) * 100))
      : 100;
    const estrela = isAdmin
      ? `<button type="button" class="btn-favorito ${insumo.favorito ? 'ativo' : ''}" data-acao="favoritar" data-insumo-id="${insumo.id}" data-favorito="${insumo.favorito ? '1' : '0'}" title="${insumo.favorito ? 'Remover dos favoritos' : 'Marcar como favorito'}">
          <i data-lucide="star" ${insumo.favorito ? 'fill="currentColor"' : ''}></i>
        </button>`
      : (insumo.favorito ? '<i data-lucide="star" fill="currentColor" class="icone-favorito"></i>' : '');
    return `
      <tr>
        <td>
          <div class="insumo-nome-cell">
            ${estrela}
            <div>
              <span class="font-bold">${escaparHtml(insumo.nome)}</span>
              <span class="insumo-unidade">${escaparHtml(insumo.unidadeMedida)}</span>
            </div>
          </div>
        </td>
        <td class="text-muted">${escaparHtml(insumo.categoria)}</td>
        <td class="font-bold col-atual-destaque">${dados.quantidadeAtual} ${escaparHtml(insumo.unidadeMedida)}</td>
        <td class="text-muted" ${dados.consumoMedio === null ? 'title="Sem dado suficiente — depende da Ficha Técnica do prato estar cadastrada e ter vendas registradas"' : ''}>
          ${dados.consumoMedio === null ? '—' : `${Math.round(dados.consumoMedio * 100) / 100} ${escaparHtml(insumo.unidadeMedida)}/dia`}
        </td>
        <td>
          <div class="progress-container">
            <div class="progress-bar ${STATUS_CLASSE_BARRA_ESTOQUE[dados.status]}" style="width: ${percentual}%;"></div>
          </div>
          <span class="min-label">mínimo ${dados.estoqueMinimo} ${escaparHtml(insumo.unidadeMedida)}</span>
        </td>
        <td><span class="badge-pill ${STATUS_CLASSE_BADGE_ESTOQUE[dados.status]}">${STATUS_LABEL_ESTOQUE[dados.status]}</span></td>
        ${isAdmin ? `
          <td class="acoes-linha">
            ${loja ? `
              <button type="button" class="btn-acao-icone" data-acao="editar-estoque" data-insumo-id="${insumo.id}" data-loja="${escaparHtml(loja)}" title="Editar estoque">
                <i data-lucide="pencil"></i>
              </button>
            ` : ''}
            <button type="button" class="btn-acao-icone" data-acao="editar-insumo" data-insumo-id="${insumo.id}" title="Editar cadastro do insumo (fornecedores, marca)">
              <i data-lucide="settings-2"></i>
            </button>
            <button type="button" class="btn-acao-icone btn-excluir" data-acao="excluir-insumo" data-insumo-id="${insumo.id}" data-nome="${escaparHtml(insumo.nome)}" title="Excluir insumo (todas as lojas)">
              <i data-lucide="trash-2"></i>
            </button>
          </td>
        ` : ''}
      </tr>
    `;
  }).join('');

  if (isAdmin) wireEstoqueTableEvents();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function wireEstoqueTableEvents() {
  document.querySelectorAll('[data-acao="editar-estoque"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const insumoId = parseInt(btn.dataset.insumoId, 10);
      const loja = btn.dataset.loja;
      const insumo = estoqueInsumos.find(i => i.id === insumoId);
      const dadosLoja = insumo?.porLoja[loja];
      if (!insumo || !dadosLoja) return;
      abrirModalEditarEstoque(insumoId, loja, insumo.nome, dadosLoja);
    });
  });

  document.querySelectorAll('[data-acao="editar-insumo"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const insumoId = parseInt(btn.dataset.insumoId, 10);
      const insumo = estoqueInsumos.find(i => i.id === insumoId);
      if (!insumo) return;
      abrirModalNovoInsumo(insumo);
    });
  });

  document.querySelectorAll('[data-acao="excluir-insumo"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const insumoId = parseInt(btn.dataset.insumoId, 10);
      const nome = btn.dataset.nome;
      if (!confirm(`Excluir "${nome}" de TODAS as lojas? Essa ação não pode ser desfeita.`)) return;
      try {
        const resposta = await fetch(`/api/insumos/${insumoId}`, { method: 'DELETE' });
        if (!resposta.ok) throw new Error('falha ao excluir');
        await carregarInsumos();
      } catch (erro) {
        console.error('Falha ao excluir insumo:', erro);
        alert('Não foi possível excluir o insumo.');
      }
    });
  });

  document.querySelectorAll('[data-acao="favoritar"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const insumoId = parseInt(btn.dataset.insumoId, 10);
      const novoValor = btn.dataset.favorito !== '1';
      try {
        const resposta = await fetch(`/api/insumos/${insumoId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ favorito: novoValor }),
        });
        if (!resposta.ok) throw new Error('falha ao favoritar');
        await carregarInsumos();
      } catch (erro) {
        console.error('Falha ao favoritar insumo:', erro);
        alert('Não foi possível atualizar o favorito.');
      }
    });
  });
}

// --- Lotes vencendo (aviso de validade) ---
let lotesVencendo = [];

async function carregarLotesVencendo() {
  const tbody = document.getElementById('lotes-vencendo-tabela-body');
  if (!tbody) return;
  try {
    const resposta = await fetch('/api/insumos/lotes-vencendo?dias=7');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    lotesVencendo = dados.lotes || [];
    renderLotesVencendo();
  } catch (erro) {
    console.error('Falha ao carregar lotes vencendo:', erro);
    tbody.innerHTML = `<tr><td colspan="5" style="color:#ef4444;">Não foi possível carregar os lotes vencendo.</td></tr>`;
  }
}

function _diasAteValidade(validade) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataValidade = new Date(`${validade}T00:00:00`);
  return Math.round((dataValidade - hoje) / (1000 * 60 * 60 * 24));
}

function renderLotesVencendo() {
  const isAdmin = window.usuarioLogado?.papel === 'admin';
  const tbody = document.getElementById('lotes-vencendo-tabela-body');
  if (!tbody) return;

  const thAcoes = document.getElementById('lotes-th-acoes');
  if (thAcoes) thAcoes.style.display = isAdmin ? '' : 'none';

  if (!lotesVencendo.length) {
    const colspan = 4 + (isAdmin ? 1 : 0);
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="panel-subtitle">Nenhum lote vencendo nos próximos 7 dias.</td></tr>`;
    return;
  }

  tbody.innerHTML = lotesVencendo.map((lote) => {
    const dias = _diasAteValidade(lote.validade);
    const rotuloDias = dias < 0 ? `Vencido há ${Math.abs(dias)}d` : dias === 0 ? 'Vence hoje' : `Vence em ${dias}d`;
    const classeBadge = dias < 0 ? 'neg' : 'neu-orange';
    return `
      <tr>
        <td class="font-bold">${escaparHtml(lote.insumoNome)}</td>
        <td class="text-muted">${escaparHtml(lote.loja)}</td>
        <td>${lote.quantidade} ${escaparHtml(lote.unidadeMedida)}</td>
        <td>
          ${new Date(`${lote.validade}T00:00:00`).toLocaleDateString('pt-BR')}
          <span class="badge-pill ${classeBadge}">${rotuloDias}</span>
        </td>
        ${isAdmin ? `
          <td class="acoes-linha">
            <button type="button" class="btn-acao-icone" data-acao="resolver-lote" data-lote-id="${lote.id}" title="Marcar como resolvido">
              <i data-lucide="check"></i>
            </button>
          </td>
        ` : ''}
      </tr>
    `;
  }).join('');

  if (isAdmin) {
    document.querySelectorAll('[data-acao="resolver-lote"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const resposta = await fetch(`/api/lotes/${btn.dataset.loteId}/resolver`, { method: 'PUT' });
          if (!resposta.ok) throw new Error('falha ao resolver lote');
          await carregarLotesVencendo();
        } catch (erro) {
          console.error('Falha ao resolver lote:', erro);
          alert('Não foi possível marcar o lote como resolvido.');
        }
      });
    });
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --- FORNECEDORES (diretório da rede, semente do módulo de Compras) ---
let fornecedoresLista = [];
let fornecedorEditandoId = null;

async function carregarFornecedores() {
  const tbody = document.getElementById('fornecedores-tabela-body');
  try {
    const resposta = await fetch('/api/fornecedores');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    fornecedoresLista = dados.fornecedores || [];
    if (tbody) renderFornecedoresTabela();
  } catch (erro) {
    console.error('Falha ao carregar fornecedores:', erro);
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="color:#ef4444;">Não foi possível carregar os fornecedores. Confira se o Flask está rodando.</td></tr>`;
  }
}

function renderFornecedoresTabela() {
  const isAdmin = window.usuarioLogado?.papel === 'admin';
  const tbody = document.getElementById('fornecedores-tabela-body');
  if (!tbody) return;

  const thAcoes = document.getElementById('fornecedores-th-acoes');
  if (thAcoes) thAcoes.style.display = isAdmin ? '' : 'none';
  const acoesTopo = document.getElementById('fornecedores-acoes-admin');
  if (acoesTopo) acoesTopo.style.display = isAdmin ? '' : 'none';

  document.getElementById('fornecedores-val-total').textContent = fornecedoresLista.length;
  document.getElementById('fornecedores-val-ativos').textContent = fornecedoresLista.filter(f => f.ativo).length;

  const termoBusca = (document.getElementById('fornecedores-busca')?.value || '').trim().toLowerCase();
  let linhas = fornecedoresLista;
  if (termoBusca) {
    linhas = linhas.filter(f => f.nome.toLowerCase().includes(termoBusca) || f.categoria.toLowerCase().includes(termoBusca));
  }

  if (!linhas.length) {
    const colspan = 7 + (isAdmin ? 1 : 0);
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="panel-subtitle">Nenhum fornecedor encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = linhas.map((f) => `
    <tr>
      <td>
        <span class="font-bold">${escaparHtml(f.nome)}</span>
        ${f.cnpj ? `<span class="insumo-unidade">${escaparHtml(f.cnpj)}</span>` : ''}
      </td>
      <td class="text-muted">${escaparHtml(f.categoria)}</td>
      <td class="fornecedor-contato-cell">
        ${f.contatoNome ? `<span>${escaparHtml(f.contatoNome)}</span>` : ''}
        ${f.contatoTelefone ? `<span class="text-muted">${escaparHtml(f.contatoTelefone)}</span>` : ''}
        ${f.contatoEmail ? `<span class="text-muted">${escaparHtml(f.contatoEmail)}</span>` : ''}
      </td>
      <td class="text-muted">${escaparHtml(f.prazoPagamento) || '—'}</td>
      <td class="text-muted">${escaparHtml(f.diasEntrega) || '—'}</td>
      <td>${f.pedidoMinimo ? `R$ ${f.pedidoMinimo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</td>
      <td><span class="badge-pill ${f.ativo ? 'pos' : 'neg'}">${f.ativo ? 'Ativo' : 'Inativo'}</span></td>
      ${isAdmin ? `
        <td class="acoes-linha">
          <button type="button" class="btn-acao-icone" data-acao="editar-fornecedor" data-id="${f.id}" title="Editar fornecedor">
            <i data-lucide="pencil"></i>
          </button>
          <button type="button" class="btn-acao-icone" data-acao="alternar-ativo-fornecedor" data-id="${f.id}" data-ativo="${f.ativo ? '1' : '0'}" title="${f.ativo ? 'Desativar' : 'Ativar'}">
            <i data-lucide="${f.ativo ? 'ban' : 'check-circle-2'}"></i>
          </button>
        </td>
      ` : ''}
    </tr>
  `).join('');

  if (isAdmin) wireFornecedoresTableEvents();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function wireFornecedoresTableEvents() {
  document.querySelectorAll('[data-acao="editar-fornecedor"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id, 10);
      const fornecedor = fornecedoresLista.find(f => f.id === id);
      if (fornecedor) abrirModalFornecedor(fornecedor);
    });
  });

  document.querySelectorAll('[data-acao="alternar-ativo-fornecedor"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id, 10);
      const novoValor = btn.dataset.ativo !== '1';
      try {
        const resposta = await fetch(`/api/fornecedores/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ativo: novoValor }),
        });
        if (!resposta.ok) throw new Error('falha ao atualizar status');
        await carregarFornecedores();
      } catch (erro) {
        console.error('Falha ao atualizar status do fornecedor:', erro);
        alert('Não foi possível atualizar o status do fornecedor.');
      }
    });
  });
}

// --- Modal: Novo/Editar fornecedor ---
function abrirModalFornecedor(fornecedor) {
  fornecedorEditandoId = fornecedor ? fornecedor.id : null;
  document.getElementById('modal-fornecedor-titulo').textContent = fornecedor ? 'Editar fornecedor' : 'Novo fornecedor';
  document.getElementById('fornecedor-nome').value = fornecedor?.nome || '';
  document.getElementById('fornecedor-cnpj').value = fornecedor?.cnpj || '';
  document.getElementById('fornecedor-categoria').value = fornecedor?.categoria || 'Geral';
  document.getElementById('fornecedor-contato-nome').value = fornecedor?.contatoNome || '';
  document.getElementById('fornecedor-contato-telefone').value = fornecedor?.contatoTelefone || '';
  document.getElementById('fornecedor-contato-email').value = fornecedor?.contatoEmail || '';
  document.getElementById('fornecedor-prazo-pagamento').value = fornecedor?.prazoPagamento || '';
  document.getElementById('fornecedor-dias-entrega').value = fornecedor?.diasEntrega || '';
  document.getElementById('fornecedor-pedido-minimo').value = fornecedor?.pedidoMinimo || 0;
  document.getElementById('fornecedor-observacoes').value = fornecedor?.observacoes || '';
  document.getElementById('modal-fornecedor').style.display = 'flex';
}

function fecharModalFornecedor() {
  document.getElementById('modal-fornecedor').style.display = 'none';
  fornecedorEditandoId = null;
}

document.getElementById('btn-novo-fornecedor')?.addEventListener('click', () => abrirModalFornecedor(null));
document.getElementById('btn-fornecedor-fechar')?.addEventListener('click', fecharModalFornecedor);
document.getElementById('btn-fornecedor-cancelar')?.addEventListener('click', fecharModalFornecedor);

document.getElementById('form-fornecedor')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const corpo = {
    nome: document.getElementById('fornecedor-nome').value,
    cnpj: document.getElementById('fornecedor-cnpj').value,
    categoria: document.getElementById('fornecedor-categoria').value,
    contatoNome: document.getElementById('fornecedor-contato-nome').value,
    contatoTelefone: document.getElementById('fornecedor-contato-telefone').value,
    contatoEmail: document.getElementById('fornecedor-contato-email').value,
    prazoPagamento: document.getElementById('fornecedor-prazo-pagamento').value,
    diasEntrega: document.getElementById('fornecedor-dias-entrega').value,
    pedidoMinimo: document.getElementById('fornecedor-pedido-minimo').value,
    observacoes: document.getElementById('fornecedor-observacoes').value,
  };
  try {
    const url = fornecedorEditandoId ? `/api/fornecedores/${fornecedorEditandoId}` : '/api/fornecedores';
    const metodo = fornecedorEditandoId ? 'PUT' : 'POST';
    const resposta = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao salvar fornecedor');
    fecharModalFornecedor();
    await carregarFornecedores();
  } catch (erro) {
    console.error('Falha ao salvar fornecedor:', erro);
    alert(erro.message || 'Não foi possível salvar o fornecedor.');
  }
});

// --- COTAÇÕES (RFQ manual, fase 2 do módulo de Compras) ---
const STATUS_LABEL_COTACAO = { aberta: 'Aberta', fechada: 'Fechada' };
const STATUS_CLASSE_BADGE_COTACAO = { aberta: 'pos', fechada: 'neu-orange' };

let cotacoesLista = [];
let cotacaoAtualId = null;

async function carregarCotacoes() {
  const tbody = document.getElementById('cotacoes-tabela-body');
  if (!tbody) return;
  try {
    const resposta = await fetch('/api/cotacoes');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    cotacoesLista = dados.cotacoes || [];
    renderCotacoesLista();
  } catch (erro) {
    console.error('Falha ao carregar cotações:', erro);
    tbody.innerHTML = `<tr><td colspan="6" style="color:#ef4444;">Não foi possível carregar as cotações. Confira se o Flask está rodando.</td></tr>`;
  }
}

function renderCotacoesLista() {
  const isAdmin = window.usuarioLogado?.papel === 'admin';
  const tbody = document.getElementById('cotacoes-tabela-body');
  if (!tbody) return;

  const thAcoes = document.getElementById('cotacoes-th-acoes');
  if (thAcoes) thAcoes.style.display = isAdmin ? '' : 'none';
  const acoesTopo = document.getElementById('cotacoes-acoes-admin');
  if (acoesTopo) acoesTopo.style.display = isAdmin ? '' : 'none';

  if (!cotacoesLista.length) {
    const colspan = 5 + (isAdmin ? 1 : 0);
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="panel-subtitle">Nenhuma cotação registrada ainda.</td></tr>`;
    return;
  }

  tbody.innerHTML = cotacoesLista.map((c) => `
    <tr>
      <td class="font-bold">${escaparHtml(c.titulo)}</td>
      <td><span class="badge-pill ${STATUS_CLASSE_BADGE_COTACAO[c.status]}">${STATUS_LABEL_COTACAO[c.status]}</span></td>
      <td>${c.totalInsumos}</td>
      <td>${c.totalFornecedores}</td>
      <td class="text-muted">${new Date(c.criadoEm).toLocaleDateString('pt-BR')}</td>
      ${isAdmin ? `
        <td class="acoes-linha">
          <button type="button" class="btn-acao-icone" data-acao="abrir-cotacao" data-id="${c.id}" title="Ver/editar preços">
            <i data-lucide="arrow-right"></i>
          </button>
          <button type="button" class="btn-acao-icone btn-excluir" data-acao="excluir-cotacao" data-id="${c.id}" data-titulo="${escaparHtml(c.titulo)}" title="Excluir cotação">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      ` : ''}
    </tr>
  `).join('');

  document.querySelectorAll('[data-acao="abrir-cotacao"]').forEach(btn => {
    btn.addEventListener('click', () => abrirCotacaoDetalhe(parseInt(btn.dataset.id, 10)));
  });
  document.querySelectorAll('[data-acao="excluir-cotacao"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Excluir a cotação "${btn.dataset.titulo}"? Essa ação não pode ser desfeita.`)) return;
      try {
        const resposta = await fetch(`/api/cotacoes/${btn.dataset.id}`, { method: 'DELETE' });
        if (!resposta.ok) throw new Error('falha ao excluir');
        await carregarCotacoes();
      } catch (erro) {
        console.error('Falha ao excluir cotação:', erro);
        alert('Não foi possível excluir a cotação.');
      }
    });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

document.getElementById('btn-nova-cotacao')?.addEventListener('click', () => {
  document.getElementById('form-nova-cotacao').reset();
  document.getElementById('modal-nova-cotacao').style.display = 'flex';
});
document.getElementById('btn-nova-cotacao-fechar')?.addEventListener('click', () => {
  document.getElementById('modal-nova-cotacao').style.display = 'none';
});
document.getElementById('btn-nova-cotacao-cancelar')?.addEventListener('click', () => {
  document.getElementById('modal-nova-cotacao').style.display = 'none';
});

document.getElementById('form-nova-cotacao')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const titulo = document.getElementById('nova-cotacao-titulo').value;
  try {
    const resposta = await fetch('/api/cotacoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao criar cotação');
    document.getElementById('modal-nova-cotacao').style.display = 'none';
    await carregarCotacoes();
    abrirCotacaoDetalhe(dados.id);
  } catch (erro) {
    console.error('Falha ao criar cotação:', erro);
    alert(erro.message || 'Não foi possível criar a cotação.');
  }
});

document.getElementById('btn-cotacao-voltar')?.addEventListener('click', async () => {
  document.getElementById('cotacoes-detalhe-view').style.display = 'none';
  document.getElementById('cotacoes-lista-view').style.display = '';
  cotacaoAtualId = null;
  await carregarCotacoes();
});

async function abrirCotacaoDetalhe(cotacaoId) {
  cotacaoAtualId = cotacaoId;
  document.getElementById('cotacoes-lista-view').style.display = 'none';
  document.getElementById('cotacoes-detalhe-view').style.display = '';

  const [insumosResp, fornecedoresResp] = await Promise.all([
    fetch('/api/insumos'),
    fetch('/api/fornecedores'),
  ]);
  const insumosDados = await insumosResp.json();
  const fornecedoresDados = await fornecedoresResp.json();

  const selectInsumo = document.getElementById('cotacao-preco-insumo');
  selectInsumo.innerHTML = (insumosDados.insumos || [])
    .map(i => `<option value="${i.id}">${escaparHtml(i.nome)}</option>`).join('');

  const selectFornecedor = document.getElementById('cotacao-preco-fornecedor');
  selectFornecedor.innerHTML = (fornecedoresDados.fornecedores || [])
    .filter(f => f.ativo)
    .map(f => `<option value="${f.id}">${escaparHtml(f.nome)}</option>`).join('');

  await recarregarCotacaoDetalhe();
}

async function recarregarCotacaoDetalhe() {
  const isAdmin = window.usuarioLogado?.papel === 'admin';
  try {
    const resposta = await fetch(`/api/cotacoes/${cotacaoAtualId}`);
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();

    document.getElementById('cotacao-detalhe-titulo').textContent = dados.cotacao.titulo;

    const acoesAdmin = document.getElementById('cotacao-detalhe-acoes-admin');
    if (acoesAdmin) acoesAdmin.style.display = isAdmin ? '' : 'none';
    const formCard = document.getElementById('cotacao-form-preco-card');
    if (formCard) formCard.style.display = isAdmin && dados.cotacao.status === 'aberta' ? '' : 'none';

    const btnStatus = document.getElementById('btn-cotacao-alternar-status');
    if (btnStatus) {
      btnStatus.textContent = dados.cotacao.status === 'aberta' ? 'Fechar cotação' : 'Reabrir cotação';
      btnStatus.onclick = async () => {
        await fetch(`/api/cotacoes/${cotacaoAtualId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: dados.cotacao.status === 'aberta' ? 'fechada' : 'aberta' }),
        });
        await recarregarCotacaoDetalhe();
      };
    }

    renderCotacaoComparacao(dados.grupos, isAdmin);
  } catch (erro) {
    console.error('Falha ao carregar cotação:', erro);
    alert('Não foi possível carregar a cotação.');
  }
}

function renderCotacaoComparacao(grupos, isAdmin) {
  const container = document.getElementById('cotacao-comparacao-lista');
  if (!grupos.length) {
    container.innerHTML = `<p class="panel-subtitle">Nenhum preço lançado ainda — use o formulário acima.</p>`;
    return;
  }

  container.innerHTML = grupos.map((grupo) => `
    <div class="chart-card cotacao-grupo">
      <div class="cotacao-grupo-header">
        <h4>${escaparHtml(grupo.insumoNome)}</h4>
        <span class="text-muted">${escaparHtml(grupo.categoria)}</span>
      </div>
      ${grupo.precos.map((preco, indice) => `
        <div class="cotacao-preco-linha ${indice === 0 ? 'melhor-preco' : ''} ${preco.selecionado ? 'selecionado' : ''}">
          <span class="cotacao-preco-fornecedor">${escaparHtml(preco.fornecedorNome)}</span>
          <span class="cotacao-preco-valor">R$ ${preco.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          ${indice === 0 ? '<span class="badge-pill pos">Melhor preço</span>' : ''}
          ${isAdmin ? `
            <button type="button" class="btn-acao-icone" data-acao="selecionar-preco" data-id="${preco.id}" title="Marcar como vencedor">
              <i data-lucide="check"></i>
            </button>
            <button type="button" class="btn-acao-icone btn-excluir" data-acao="excluir-preco" data-id="${preco.id}" title="Remover">
              <i data-lucide="trash-2"></i>
            </button>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `).join('');

  if (isAdmin) {
    document.querySelectorAll('[data-acao="selecionar-preco"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await fetch(`/api/cotacoes/${cotacaoAtualId}/precos/${btn.dataset.id}/selecionar`, { method: 'PUT' });
        await recarregarCotacaoDetalhe();
      });
    });
    document.querySelectorAll('[data-acao="excluir-preco"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await fetch(`/api/cotacoes/${cotacaoAtualId}/precos/${btn.dataset.id}`, { method: 'DELETE' });
        await recarregarCotacaoDetalhe();
      });
    });
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

document.getElementById('form-cotacao-preco')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const corpo = {
    insumoId: document.getElementById('cotacao-preco-insumo').value,
    fornecedorId: document.getElementById('cotacao-preco-fornecedor').value,
    preco: document.getElementById('cotacao-preco-valor').value,
  };
  try {
    const resposta = await fetch(`/api/cotacoes/${cotacaoAtualId}/precos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao lançar preço');
    document.getElementById('cotacao-preco-valor').value = '';
    await recarregarCotacaoDetalhe();
  } catch (erro) {
    console.error('Falha ao lançar preço:', erro);
    alert(erro.message || 'Não foi possível lançar o preço.');
  }
});

// --- Modal: Editar estoque (correção manual de quantidade/mínimo) ---
function abrirModalEditarEstoque(insumoId, loja, nomeInsumo, dadosLoja) {
  estoqueEditandoContexto = { insumoId, loja };
  document.getElementById('editar-estoque-subtitulo').textContent = `${nomeInsumo} — ${loja}`;
  document.getElementById('editar-estoque-quantidade').value = dadosLoja.quantidadeAtual;
  document.getElementById('editar-estoque-minimo').value = dadosLoja.estoqueMinimo;
  document.getElementById('modal-editar-estoque').style.display = 'flex';
}

function fecharModalEditarEstoque() {
  document.getElementById('modal-editar-estoque').style.display = 'none';
  estoqueEditandoContexto = null;
}

document.getElementById('btn-editar-estoque-fechar')?.addEventListener('click', fecharModalEditarEstoque);
document.getElementById('btn-editar-estoque-cancelar')?.addEventListener('click', fecharModalEditarEstoque);

document.getElementById('form-editar-estoque')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!estoqueEditandoContexto) return;
  const { insumoId, loja } = estoqueEditandoContexto;
  const corpo = {
    quantidadeAtual: document.getElementById('editar-estoque-quantidade').value,
    estoqueMinimo: document.getElementById('editar-estoque-minimo').value,
  };
  try {
    const resposta = await fetch(`/api/insumos/${insumoId}/estoque/${encodeURIComponent(loja)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao salvar');
    fecharModalEditarEstoque();
    await carregarInsumos();
  } catch (erro) {
    console.error('Falha ao salvar estoque:', erro);
    alert(erro.message || 'Não foi possível salvar.');
  }
});

// --- Modal: Novo insumo / Editar insumo ---
function _renderChecklistFornecedores(idsSelecionados) {
  const container = document.getElementById('novo-insumo-fornecedores');
  if (!container) return;
  const ativos = fornecedoresLista.filter(f => f.ativo);
  if (!ativos.length) {
    container.innerHTML = '<p class="panel-subtitle">Nenhum fornecedor cadastrado ainda.</p>';
    return;
  }
  const selecionados = new Set(idsSelecionados || []);
  container.innerHTML = ativos.map(f => `
    <label class="checklist-item">
      <input type="checkbox" value="${f.id}" ${selecionados.has(f.id) ? 'checked' : ''}>
      ${escaparHtml(f.nome)}
    </label>
  `).join('');
}

function abrirModalNovoInsumo(insumo) {
  document.getElementById('form-novo-insumo').reset();
  document.getElementById('novo-insumo-id').value = insumo ? insumo.id : '';
  document.getElementById('novo-insumo-titulo').textContent = insumo ? 'Editar insumo' : 'Novo insumo';
  document.getElementById('novo-insumo-btn-salvar').textContent = insumo ? 'Salvar' : 'Cadastrar';
  document.getElementById('novo-insumo-nome').value = insumo ? insumo.nome : '';
  document.getElementById('novo-insumo-categoria').value = insumo ? insumo.categoria : '';
  document.getElementById('novo-insumo-unidade').value = insumo ? insumo.unidadeMedida : 'un';
  document.getElementById('novo-insumo-marca').value = insumo ? (insumo.marcaHomologada || '') : '';
  _renderChecklistFornecedores(insumo ? insumo.fornecedorIds : []);
  document.getElementById('modal-novo-insumo').style.display = 'flex';
}

function fecharModalNovoInsumo() {
  document.getElementById('modal-novo-insumo').style.display = 'none';
}

document.getElementById('btn-novo-insumo')?.addEventListener('click', () => abrirModalNovoInsumo());
document.getElementById('btn-novo-insumo-fechar')?.addEventListener('click', fecharModalNovoInsumo);
document.getElementById('btn-novo-insumo-cancelar')?.addEventListener('click', fecharModalNovoInsumo);

document.getElementById('form-novo-insumo')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const insumoId = document.getElementById('novo-insumo-id').value;
  const fornecedorIds = Array.from(document.querySelectorAll('#novo-insumo-fornecedores input:checked')).map(el => parseInt(el.value, 10));
  const corpo = {
    nome: document.getElementById('novo-insumo-nome').value,
    categoria: document.getElementById('novo-insumo-categoria').value,
    unidadeMedida: document.getElementById('novo-insumo-unidade').value,
    marcaHomologada: document.getElementById('novo-insumo-marca').value,
    fornecedorIds,
  };
  try {
    const resposta = await fetch(insumoId ? `/api/insumos/${insumoId}` : '/api/insumos', {
      method: insumoId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao salvar');
    fecharModalNovoInsumo();
    await carregarInsumos();
  } catch (erro) {
    console.error('Falha ao salvar insumo:', erro);
    alert(erro.message || 'Não foi possível salvar o insumo.');
  }
});

// --- Modal: Registrar entrada (distribuição entre lojas) ---
function abrirModalEntradaInsumo() {
  const select = document.getElementById('entrada-insumo-select');
  select.innerHTML = estoqueInsumos.map(i => `<option value="${i.id}">${escaparHtml(i.nome)}</option>`).join('');
  document.getElementById('entrada-validade').value = '';

  const container = document.getElementById('entrada-distribuicao-lojas');
  container.innerHTML = LOJAS_ESTOQUE.map(loja => {
    const inputId = `entrada-loja-${escaparHtml(loja)}`;
    return `
    <div class="estoque-entrada-linha">
      <label for="${inputId}">${escaparHtml(loja)}</label>
      <div class="stepper">
        <button type="button" class="stepper-btn" data-target="${inputId}" data-delta="-1" aria-label="Diminuir">&minus;</button>
        <input type="number" step="0.01" min="0" id="${inputId}" data-loja="${escaparHtml(loja)}" value="0">
        <button type="button" class="stepper-btn" data-target="${inputId}" data-delta="1" aria-label="Aumentar">+</button>
      </div>
    </div>
  `;
  }).join('');

  document.getElementById('modal-entrada-insumo').style.display = 'flex';
}

function fecharModalEntradaInsumo() {
  document.getElementById('modal-entrada-insumo').style.display = 'none';
}

document.getElementById('btn-registrar-entrada')?.addEventListener('click', abrirModalEntradaInsumo);
document.getElementById('btn-entrada-fechar')?.addEventListener('click', fecharModalEntradaInsumo);
document.getElementById('btn-entrada-cancelar')?.addEventListener('click', fecharModalEntradaInsumo);

document.getElementById('form-entrada-insumo')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const insumoId = document.getElementById('entrada-insumo-select').value;
  const distribuicao = {};
  document.querySelectorAll('#entrada-distribuicao-lojas input').forEach(input => {
    const valor = parseFloat(input.value);
    if (valor > 0) distribuicao[input.dataset.loja] = valor;
  });
  if (!Object.keys(distribuicao).length) {
    alert('Informe a quantidade recebida em pelo menos uma loja.');
    return;
  }
  const validade = document.getElementById('entrada-validade').value || null;
  try {
    const resposta = await fetch(`/api/insumos/${insumoId}/entrada`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ distribuicao, validade }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao registrar entrada');
    fecharModalEntradaInsumo();
    await carregarInsumos();
    await carregarLotesVencendo();
  } catch (erro) {
    console.error('Falha ao registrar entrada:', erro);
    alert(erro.message || 'Não foi possível registrar a entrada.');
  }
});

// --- VENDAS PRESENCIAIS (CRUD manual, fora da Cardápio Web) ---
// Quando não-nulo, o formulário está editando esse dia (em vez de criar um
// lançamento novo) — usado pra saber se precisa apagar o registro antigo
// caso o usuário troque a data durante a edição.
let presencialEditandoDiaOriginal = null;
const btnPresencialCancelarEdicao = document.getElementById('btn-presencial-cancelar-edicao');
const btnPresencialSalvarTexto = document.getElementById('btn-presencial-salvar-texto');

async function carregarPresencial(unidade) {
  const tbody = document.getElementById('presencial-table-body');
  if (!tbody) return;

  if (presencialDiaInput && !presencialDiaInput.value) {
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    presencialDiaInput.value = ontem.toISOString().slice(0, 10);
  }

  const temQuantidade = UNIDADES_COM_QUANTIDADE_PRESENCIAL.includes(unidade);
  const colspan = temQuantidade ? 4 : 3;

  tbody.innerHTML = `<tr><td colspan="${colspan}" class="panel-subtitle">Carregando...</td></tr>`;
  try {
    const resposta = await fetch(`/api/venda-presencial?unidade=${encodeURIComponent(unidade)}`);
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    const lancamentos = dados.lancamentos || [];
    tbody.innerHTML = lancamentos.length
      ? lancamentos.map(l => `
          <tr>
            <td>${l.dia}</td>
            <td class="font-bold">R$ ${l.valor}</td>
            ${temQuantidade ? `<td class="font-bold">${l.quantidade}</td>` : ''}
            <td>
              <div class="acoes-linha">
                <button type="button" class="btn-acao-icone btn-editar"
                  data-dia-iso="${l.diaIso}" data-valor="${l.valorNumero}" data-quantidade="${l.quantidade}"
                  title="Editar">
                  <i data-lucide="pencil"></i>
                </button>
                <button type="button" class="btn-acao-icone btn-excluir" data-dia-iso="${l.diaIso}" title="Excluir">
                  <i data-lucide="trash-2"></i>
                </button>
              </div>
            </td>
          </tr>
        `).join('')
      : `<tr><td colspan="${colspan}" class="panel-subtitle">Nenhum lançamento presencial ainda.</td></tr>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (erro) {
    console.error('Falha ao carregar vendas presenciais:', erro);
    tbody.innerHTML = `<tr><td colspan="${colspan}" style="color:#ef4444;">Não foi possível carregar os lançamentos.</td></tr>`;
  }
}

function cancelarEdicaoPresencial() {
  presencialEditandoDiaOriginal = null;
  presencialValorInput.value = '';
  if (presencialQuantidadeInput) presencialQuantidadeInput.value = '';
  if (presencialDiaInput) {
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    presencialDiaInput.value = ontem.toISOString().slice(0, 10);
  }
  if (btnPresencialSalvarTexto) btnPresencialSalvarTexto.textContent = 'Salvar';
  if (btnPresencialCancelarEdicao) btnPresencialCancelarEdicao.style.display = 'none';
}

const presencialTableBody = document.getElementById('presencial-table-body');
if (presencialTableBody) {
  presencialTableBody.addEventListener('click', async (evento) => {
    const btnEditar = evento.target.closest('.btn-editar');
    const btnExcluir = evento.target.closest('.btn-excluir');

    if (btnEditar) {
      presencialEditandoDiaOriginal = btnEditar.dataset.diaIso;
      presencialDiaInput.value = btnEditar.dataset.diaIso;
      presencialValorInput.value = btnEditar.dataset.valor;
      if (presencialQuantidadeInput) presencialQuantidadeInput.value = btnEditar.dataset.quantidade;
      if (btnPresencialSalvarTexto) btnPresencialSalvarTexto.textContent = 'Salvar edição';
      if (btnPresencialCancelarEdicao) btnPresencialCancelarEdicao.style.display = '';
      presencialValorInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (btnExcluir) {
      const diaIso = btnExcluir.dataset.diaIso;
      if (!confirm(`Excluir o lançamento presencial de ${diaIso.split('-').reverse().join('/')}?`)) return;

      try {
        const resposta = await fetch(
          `/api/venda-presencial?unidade=${encodeURIComponent(currentTab)}&dia=${diaIso}`,
          { method: 'DELETE' }
        );
        if (!resposta.ok) {
          const erroDados = await resposta.json().catch(() => ({}));
          throw new Error(erroDados.erro || `Erro no servidor Flask: ${resposta.status}`);
        }
        if (presencialEditandoDiaOriginal === diaIso) cancelarEdicaoPresencial();
        await carregarPresencial(currentTab);
        {
          const { inicio, fim, diaSemana } = periodoInsightsSelecionado();
          await carregarInsights(inicio, fim, diaSemana);
        }
      } catch (erro) {
        console.error('Falha ao excluir venda presencial:', erro);
        alert('Não foi possível excluir o lançamento. Confira se o Flask está rodando.');
      }
    }
  });
}

if (btnPresencialCancelarEdicao) {
  btnPresencialCancelarEdicao.addEventListener('click', cancelarEdicaoPresencial);
}

if (formPresencial) {
  formPresencial.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!UNIDADES_COM_PRESENCIAL.includes(currentTab)) return;

    const dia = presencialDiaInput.value;
    const valor = presencialValorInput.value;
    if (!dia || valor === '') return;

    const temQuantidade = UNIDADES_COM_QUANTIDADE_PRESENCIAL.includes(currentTab);
    const quantidade = temQuantidade && presencialQuantidadeInput ? (presencialQuantidadeInput.value || 0) : 0;

    try {
      // Editando e trocou a data: precisa apagar o registro antigo primeiro,
      // senão fica um lançamento órfão no dia original (a chave é unidade+dia).
      if (presencialEditandoDiaOriginal && presencialEditandoDiaOriginal !== dia) {
        await fetch(
          `/api/venda-presencial?unidade=${encodeURIComponent(currentTab)}&dia=${presencialEditandoDiaOriginal}`,
          { method: 'DELETE' }
        );
      }

      const resposta = await fetch('/api/venda-presencial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unidade: currentTab, dia, valor, quantidade }),
      });
      if (!resposta.ok) {
        const erroDados = await resposta.json().catch(() => ({}));
        throw new Error(erroDados.erro || `Erro no servidor Flask: ${resposta.status}`);
      }
      cancelarEdicaoPresencial();
      await carregarPresencial(currentTab);
      {
        const { inicio, fim, diaSemana } = periodoInsightsSelecionado();
        await carregarInsights(inicio, fim, diaSemana);
      }
    } catch (erro) {
      console.error('Falha ao salvar venda presencial:', erro);
      alert('Não foi possível salvar o lançamento presencial. Confira se o Flask está rodando.');
    }
  });
}

// Só roda na página de Insights (identificada pela presença das abas)
if (tabButtons.length > 0 && document.getElementById('val-faturamento')) {
  // Preenche o calendário com o período padrão (últimos 30 dias) antes da
  // primeira busca, pra já aparecer selecionado em vez de vazio.
  if (dataInicioInput && dataFimInput && !dataInicioInput.value && !dataFimInput.value) {
    const padrao = periodoInsightsSelecionado();
    dataInicioInput.value = padrao.inicio;
    dataFimInput.value = padrao.fim;
  }
  validarIntervaloDatasInsights();

  // Se veio de um link direto pra "Vendas Presenciais" (ex: atalho da Home),
  // já troca pra uma loja que tem esse painel — ele fica escondido na Visão
  // Geral (só aparece nas abas de loja com presencial), então o link não
  // levaria a lugar nenhum se ficasse na aba padrão.
  if (window.location.hash === '#panel-vendas-presenciais' && UNIDADES_COM_PRESENCIAL.length) {
    const lojaAlvo = UNIDADES_COM_PRESENCIAL[0];
    const botaoAlvo = [...tabButtons].find(b => b.dataset.tab === lojaAlvo);
    if (botaoAlvo) {
      tabButtons.forEach(b => b.classList.remove('active'));
      botaoAlvo.classList.add('active');
      currentTab = lojaAlvo;
    }
  }

  const { inicio, fim, diaSemana } = periodoInsightsSelecionado();
  carregarInsights(inicio, fim, diaSemana).then(() => {
    if (window.location.hash === '#panel-vendas-presenciais') {
      const painel = document.getElementById('panel-vendas-presenciais');
      if (painel) painel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  iniciarAtualizacaoAutomatica(() => {
    // Se o usuário estiver com um dia específico aberto (clicou no Histórico
    // Diário), não atualiza sozinho — isso resetaria a visão de volta pro
    // período padrão no meio da leitura. Volta a atualizar quando ele sair.
    if (canalSelecionado) return;
    const periodo = periodoInsightsSelecionado();
    carregarInsights(periodo.inicio, periodo.fim, periodo.diaSemana);
  });

  [dataInicioInput, dataFimInput].forEach((input) => {
    if (!input) return;
    input.addEventListener('change', () => {
      validarIntervaloDatasInsights();
      if (!dataInicioInput.value || !dataFimInput.value) return;
      const periodo = periodoInsightsSelecionado();
      carregarInsights(periodo.inicio, periodo.fim, periodo.diaSemana);
    });
  });

  if (diaSemanaInput) {
    diaSemanaInput.addEventListener('change', () => {
      const periodo = periodoInsightsSelecionado();
      carregarInsights(periodo.inicio, periodo.fim, periodo.diaSemana);
    });
  }
}


// ==============================================================================
// FUNÇÕES AUXILIARES E INTEGRAÇÃO DE APIs (ESCOPO GLOBAL)
// ==============================================================================

// Cores por posição, reaproveitadas em outras telas do sistema
const CORES_GRAFICO_REDE = ['#d93829', '#f59e0b', '#10b981', '#3b82f6'];

/**
 * Busca o faturamento real da rede dos últimos dias e desenha o gráfico de
 * linha da Home — antes disso era um mock com números inventados.
 */
let graficoRedeInstance = null;
async function carregarGraficoRede() {
  const canvas = document.getElementById('salesChart');
  if (!canvas || typeof Chart === 'undefined') return;

  try {
    const resposta = await fetch('/api/faturamento-rede-diario?dias=7');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    const dias = dados.dias || [];

    if (graficoRedeInstance) {
      graficoRedeInstance.destroy();
      graficoRedeInstance = null;
    }

    graficoRedeInstance = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: dias.map(d => d.diaSemana),
        datasets: [{
          label: 'Faturamento da rede',
          data: dias.map(d => d.faturamento),
          borderColor: CORES_GRAFICO_REDE[0],
          backgroundColor: 'rgba(217, 56, 41, 0.08)',
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: CORES_GRAFICO_REDE[0],
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (itens) => dias[itens[0].dataIndex]?.dia || '',
              label: (ctx) => `R$ ${ctx.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: '#f1f5f9' },
            ticks: { callback: value => 'R$' + value.toLocaleString('pt-BR') },
          },
        },
      },
    });
  } catch (erro) {
    console.error('Falha ao carregar gráfico da rede:', erro);
  }
}

/**
 * Gráfico de rosca com o mix de canais de venda da rede inteira (Presencial
 * + IFood + 99Food + Cardápio Web), no mesmo período de 7 dias do gráfico
 * de faturamento acima — o detalhamento por dia e por loja fica em Insights.
 */
let homeCanalChartInstance = null;
async function carregarCanalRedeHome() {
  const canvas = document.getElementById('homeCanalChart');
  const legenda = document.getElementById('home-canal-legend');
  if (!canvas || typeof Chart === 'undefined') return;

  const hoje = new Date();
  const fim = new Date(hoje);
  fim.setDate(hoje.getDate() - 1);
  const inicio = new Date(fim);
  inicio.setDate(fim.getDate() - 6);
  const paraIso = d => d.toISOString().slice(0, 10);

  try {
    const resposta = await fetch(`/api/insights?inicio=${paraIso(inicio)}&fim=${paraIso(fim)}`);
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    const canaisBrutos = (dados.geral && dados.geral.canais) || [];

    if (homeCanalChartInstance) {
      homeCanalChartInstance.destroy();
      homeCanalChartInstance = null;
    }

    if (!canaisBrutos.length) {
      if (legenda) legenda.innerHTML = `<p class="panel-subtitle">Nenhum dado de canal nesse período.</p>`;
      return;
    }

    const canais = mesclarCanaisPorNomeExibicao(canaisBrutos, 'geral');

    if (legenda) {
      legenda.innerHTML = canais.map((c, i) => `
        <div class="home-canal-legend-item">
          <span class="home-canal-legend-nome">
            <span class="home-canal-legend-dot" style="background-color: ${CORES_CANAL[i % CORES_CANAL.length]};"></span>
            ${c.canal}
          </span>
          <span class="home-canal-legend-valor">
            R$ ${c.faturamento}
            <span class="home-canal-legend-percentual">${c.percentual}%</span>
          </span>
        </div>
      `).join('');
    }

    homeCanalChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: canais.map(c => c.canal),
        datasets: [{
          data: canais.map(c => c.faturamentoNumero),
          backgroundColor: canais.map((_, i) => CORES_CANAL[i % CORES_CANAL.length]),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: R$ ${canais[ctx.dataIndex].faturamento} (${canais[ctx.dataIndex].percentual}%)`,
            },
          },
        },
      },
    });
  } catch (erro) {
    console.error('Falha ao carregar gráfico de canais da rede:', erro);
    if (legenda) legenda.innerHTML = `<p class="panel-subtitle" style="color:#ef4444;">Não foi possível carregar os canais.</p>`;
  }
}

// Atualização "quase em tempo real": chama de novo em intervalos, pausando
// quando a aba não está visível (economiza chamadas à toa em segundo plano
// — o usuário não tá olhando mesmo). O backend sincroniza com a Cardápio
// Web a cada 15 min; aqui a tela busca de novo com mais frequência porque é
// só ler do banco local do Flask, sem custo de API externa.
function iniciarAtualizacaoAutomatica(callback, intervaloMs = 2 * 60 * 1000) {
  setInterval(() => {
    if (document.visibilityState === 'visible') callback();
  }, intervaloMs);
}

function marcarAtualizadoAgora(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const agora = new Date();
  const hh = String(agora.getHours()).padStart(2, '0');
  const mm = String(agora.getMinutes()).padStart(2, '0');
  el.textContent = `Atualizado às ${hh}:${mm}`;
}

// Considera "em dia" se a última sincronização foi hoje ou ontem — regra
// compartilhada entre a Home (status por loja) e Configurações (tabela de
// lojas + resumo geral), pra não duplicar a mesma lógica em dois lugares.
function _sincronizacaoEmDia(dataStr) {
  if (!dataStr) return false;
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  const formatarBr = d => d.toLocaleDateString('pt-BR');
  return dataStr === formatarBr(hoje) || dataStr === formatarBr(ontem);
}

function _badgeSincronizacao(dataStr) {
  const emDia = _sincronizacaoEmDia(dataStr);
  return `<span class="badge ${emDia ? 'badge-green' : 'badge-orange'}">${dataStr || 'nunca sincronizou'}</span>`;
}

/**
 * Home: lista compacta de quando cada loja sincronizou pela última vez,
 * com aviso visual se alguma estiver atrasada (não sincronizou ontem/hoje).
 */
async function carregarStatusSincronizacaoHome() {
  const lista = document.getElementById('home-sync-status');
  if (!lista) return;

  lista.innerHTML = `<p class="panel-subtitle">Carregando...</p>`;
  try {
    const resposta = await fetch('/api/config/lojas');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    const lojas = dados.lojas || [];

    lista.innerHTML = lojas.length
      ? lojas.map(loja => `
          <div class="sync-status-item">
            <span class="sync-status-nome">${loja.nome}</span>
            <span class="sync-status-data">${_badgeSincronizacao(loja.ultimaSincronizacao)}</span>
          </div>
        `).join('')
      : `<p class="panel-subtitle">Nenhuma loja cadastrada.</p>`;
  } catch (erro) {
    console.error('Falha ao carregar status de sincronização:', erro);
    lista.innerHTML = `<p class="panel-subtitle" style="color:#ef4444;">Não foi possível carregar o status.</p>`;
  }
}

/**
 * Tela de Configurações: carrega a lista de lojas cadastradas (com o token
 * mascarado, nunca o valor real) e a data da última sincronização.
 */
async function carregarConfigLojas() {
  const tbody = document.getElementById('config-lojas-body');
  const ultimaSyncElem = document.getElementById('config-ultima-sync');
  const pillLojas = document.getElementById('config-status-lojas');
  const pillSync = document.getElementById('config-status-sync');
  if (!tbody) return;

  try {
    const resposta = await fetch('/api/config/lojas');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();

    if (ultimaSyncElem) {
      ultimaSyncElem.textContent = dados.ultimaSincronizacao || 'nunca sincronizado';
    }

    const lojas = dados.lojas || [];

    if (pillLojas) pillLojas.textContent = `${lojas.length} ${lojas.length === 1 ? 'loja conectada' : 'lojas conectadas'}`;
    if (pillSync) {
      const atrasadas = lojas.filter(l => !_sincronizacaoEmDia(l.ultimaSincronizacao));
      if (atrasadas.length === 0) {
        pillSync.textContent = 'Sincronização em dia';
        pillSync.className = 'badge-pill pos';
      } else {
        pillSync.textContent = `${atrasadas.length} ${atrasadas.length === 1 ? 'loja atrasada' : 'lojas atrasadas'}`;
        pillSync.className = 'badge-pill neg';
      }
    }

    tbody.innerHTML = lojas.length
      ? lojas.map(loja => `
          <tr>
            <td class="font-bold">${loja.nome}</td>
            <td class="token-mascarado">${loja.tokenMascarado}</td>
            <td>
              <span class="badge ${loja.temPresencial ? 'badge-green' : 'badge-neutral'}">
                ${loja.temPresencial ? 'Sim' : 'Não'}
              </span>
            </td>
            <td>${_badgeSincronizacao(loja.ultimaSincronizacao)}</td>
          </tr>
        `).join('')
      : `<tr><td colspan="4" class="panel-subtitle">Nenhuma loja cadastrada.</td></tr>`;
  } catch (erro) {
    console.error('Falha ao carregar lojas cadastradas:', erro);
    tbody.innerHTML = `<tr><td colspan="4" style="color:#ef4444;">Não foi possível carregar as lojas. Confira se o Flask está rodando.</td></tr>`;
  }
}

/**
 * Dispara a sincronização com a Cardápio Web pro dia anterior, pelo botão
 * "Sincronizar agora" — mesma lógica do sincronizar.py, só que disparada
 * manualmente em vez de esperar o agendamento das 3h. O backend roda a
 * sincronização em segundo plano e responde na hora (sincronizar as 4 lojas
 * pedido por pedido pode passar do tempo que o servidor de produção espera
 * por uma resposta); os números atualizam sozinhos assim que terminar,
 * graças à atualização automática já existente na tela.
 */
async function sincronizarAgora() {
  const botao = document.getElementById('btn-sincronizar-agora');
  const resultadoElem = document.getElementById('sync-resultado');
  if (!botao) return;

  const htmlOriginal = botao.innerHTML;
  botao.disabled = true;
  botao.innerHTML = '<span>Iniciando sincronização...</span>';
  if (resultadoElem) resultadoElem.innerHTML = '';

  try {
    const resposta = await fetch('/api/sincronizar-agora', { method: 'POST' });
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();

    if (resultadoElem) {
      if (dados.fechado) {
        resultadoElem.innerHTML = `<div class="sync-resultado-item">${dados.diaLabel} é segunda-feira — lojas fechadas, nada a sincronizar.</div>`;
      } else {
        resultadoElem.innerHTML = `<div class="sync-resultado-item">Sincronização de ${dados.diaLabel} iniciada em segundo plano — pode levar alguns minutos. Os números atualizam sozinhos aqui.</div>`;
      }
    }

    carregarConfigLojas();
    if (document.getElementById('home-sync-status')) carregarStatusSincronizacaoHome();
  } catch (erro) {
    console.error('Falha ao sincronizar:', erro);
    if (resultadoElem) {
      resultadoElem.innerHTML = `<div class="sync-resultado-item erro">Não foi possível sincronizar. Confira se o Flask está rodando.</div>`;
    }
  } finally {
    botao.disabled = false;
    botao.innerHTML = htmlOriginal;
  }
}

function _formatarMoedaBRL(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Consulta o backend Flask e monta os cards de Diário/Semanal/Mensal da
 * Home. "Diário" é ontem (o último dia já fechado, igual ao resto do
 * sistema). "Semanal" e "Mensal" mostram sempre o último período FECHADO
 * por calendário — nunca a semana/mês em andamento: se hoje é terça e a
 * semana atual começou ontem/hoje, mostra a semana passada inteira
 * (segunda a domingo); se agosto ainda não fechou, mostra julho inteiro.
 */
async function carregarDadosLojas() {
  const container = document.getElementById('container-periodo');
  const totalRedeElem = document.getElementById('total-rede-valor');

  if (!container) return;

  container.innerHTML = `<p class="text-muted" style="padding: 12px;">Sincronizando com o Cardápio Web via Flask...</p>`;

  try {
    // dias=90 pra garantir que o mês passado inteiro sempre caiba na janela
    // buscada, mesmo no pior caso (hoje é o último dia de um mês longo).
    const [respOntem, respSerie] = await Promise.all([
      fetch('/api/faturamento-ontem'),
      fetch('/api/faturamento-rede-diario?dias=90'),
    ]);

    if (!respOntem.ok) throw new Error(`Erro no servidor Flask: ${respOntem.status}`);
    if (!respSerie.ok) throw new Error(`Erro no servidor Flask: ${respSerie.status}`);

    const dadosOntem = await respOntem.json();
    const dadosSerie = await respSerie.json();
    const dias = dadosSerie.dias || [];

    if (totalRedeElem) {
      totalRedeElem.textContent = _formatarMoedaBRL(dadosOntem.total_rede);
    }

    // A lista `dias` traz a data já formatada "dd/mm/aaaa" — converte de
    // volta pra Date pra poder comparar com os recortes de calendário.
    const paraData = (dataBr) => {
      const [d, m, y] = dataBr.split('/').map(Number);
      return new Date(y, m - 1, d);
    };

    const hoje = new Date();
    const ontemDate = new Date(hoje);
    ontemDate.setDate(hoje.getDate() - 1);

    // Semana passada (segunda a domingo) — a semana em andamento nunca
    // aparece aqui, só a última já fechada.
    const diaSemanaHoje = (hoje.getDay() + 6) % 7; // 0 = segunda ... 6 = domingo
    const segundaDestaSemana = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - diaSemanaHoje);
    const semanaPassadaInicio = new Date(segundaDestaSemana.getFullYear(), segundaDestaSemana.getMonth(), segundaDestaSemana.getDate() - 7);
    const semanaPassadaFim = new Date(segundaDestaSemana.getFullYear(), segundaDestaSemana.getMonth(), segundaDestaSemana.getDate() - 1);

    // Mês passado inteiro — o dia 0 de um mês em JS é o último dia do mês anterior.
    const mesPassadoInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const mesPassadoFim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);

    const somarNoIntervalo = (inicio, fim) => dias
      .filter(d => { const dt = paraData(d.dia); return dt >= inicio && dt <= fim; })
      .reduce((soma, d) => soma + d.faturamento, 0);

    const totalSemanal = somarNoIntervalo(semanaPassadaInicio, semanaPassadaFim);
    const totalMensal = somarNoIntervalo(mesPassadoInicio, mesPassadoFim);

    const fmtCurto = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

    container.innerHTML = `
      <div class="store-card">
        <span class="card-subtitle">DIÁRIO (ONTEM)</span>
        <span class="min-label">${fmtCurto(ontemDate)}</span>
        <div class="store-value">${_formatarMoedaBRL(dadosOntem.total_rede)}</div>
      </div>
      <div class="store-card">
        <span class="card-subtitle">SEMANAL (SEMANA PASSADA)</span>
        <span class="min-label">${fmtCurto(semanaPassadaInicio)} a ${fmtCurto(semanaPassadaFim)}</span>
        <div class="store-value">${_formatarMoedaBRL(totalSemanal)}</div>
      </div>
      <div class="store-card">
        <span class="card-subtitle">MENSAL (MÊS PASSADO)</span>
        <span class="min-label">${fmtCurto(mesPassadoInicio)} a ${fmtCurto(mesPassadoFim)}</span>
        <div class="store-value">${_formatarMoedaBRL(totalMensal)}</div>
      </div>
    `;

    renderRankingLojasHome(dadosOntem.lojas);

    // Reativa os ícones da biblioteca Lucide nos novos elementos criados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

  } catch (error) {
    console.error('Falha ao conectar com o backend Flask:', error);
    container.innerHTML = `<p style="color: #ef4444; padding: 12px;">Não foi possível carregar o faturamento. Certifique-se de que o Flask está rodando.</p>`;
  }
}

/**
 * Home: ranking das lojas por faturamento de ontem, reaproveitando os
 * mesmos dados já buscados pra montar os cards de "Desempenho por Unidade"
 * — sem precisar de uma segunda chamada ao backend.
 */
function renderRankingLojasHome(lojas) {
  const lista = document.getElementById('ranking-lojas');
  if (!lista) return;

  const ranking = (lojas || []).filter(l => l.sucesso).sort((a, b) => b.total - a.total);
  if (!ranking.length) {
    lista.innerHTML = `<p class="panel-subtitle">Nenhum dado disponível.</p>`;
    return;
  }

  const maiorValor = ranking[0].total || 1;
  lista.innerHTML = ranking.map((loja, i) => {
    const valorFormatado = loja.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const percentualBarra = Math.max(6, Math.round((loja.total / maiorValor) * 100));
    return `
      <div class="ranking-item">
        <span class="ranking-posicao">${i + 1}º</span>
        <div class="ranking-info">
          <div class="ranking-nome-valor">
            <span class="nome">${loja.nome}</span>
            <span class="valor">${valorFormatado}</span>
          </div>
          <div class="ranking-barra-bg">
            <div class="ranking-barra-fill" style="width: ${percentualBarra}%;"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// --- LOGIN / LOGOUT ---

async function fazerLogin(event) {
  event.preventDefault();
  const email = document.getElementById('email').value.trim();
  const senha = document.getElementById('senha').value;
  const btn = document.getElementById('btn-login');
  const elErro = document.getElementById('login-erro');

  elErro.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Entrando...';

  try {
    const resposta = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha }),
    });
    const dados = await resposta.json();

    if (!resposta.ok) {
      elErro.textContent = dados.erro || 'Não foi possível entrar.';
      elErro.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Entrar';
      return;
    }

    window.location.href = 'index.html';
  } catch (erro) {
    console.error('Falha ao fazer login:', erro);
    elErro.textContent = 'Não foi possível conectar ao servidor.';
    elErro.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

function alternarVisibilidadeSenha() {
  const input = document.getElementById('senha');
  const iconeMostrar = document.getElementById('icone-olho-mostrar');
  const iconeOcultar = document.getElementById('icone-olho-ocultar');
  const visivel = input.type === 'text';
  input.type = visivel ? 'password' : 'text';
  iconeMostrar.style.display = visivel ? '' : 'none';
  iconeOcultar.style.display = visivel ? 'none' : '';
}

async function fazerLogout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } finally {
    window.location.href = 'login.html';
  }
}

/**
 * Preenche o nome/iniciais do usuário logado na sidebar (todas as telas do
 * painel) e o formulário de comentário do ClickUp usa esse mesmo nome como
 * autor — busca uma vez só via /api/me.
 */
async function carregarUsuarioLogado() {
  const elNome = document.querySelectorAll('.sidebar-user-name');
  const elPapel = document.querySelectorAll('.sidebar-user-role');
  const elAvatar = document.querySelectorAll('.sidebar-user-avatar');
  if (!elNome.length) return;

  try {
    const resposta = await fetch('/api/me');
    if (!resposta.ok) return; // o before_request do Flask já redireciona pro login se não estiver logado
    const dados = await resposta.json();
    const usuario = dados.usuario;

    const iniciais = usuario.nome
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(p => p[0].toUpperCase())
      .join('');

    elNome.forEach(el => { el.textContent = usuario.nome; });
    elPapel.forEach(el => { el.textContent = usuario.papel === 'admin' ? 'Admin' : 'Equipe'; });
    elAvatar.forEach(el => { el.textContent = iniciais; });

    window.usuarioLogado = usuario;

    // Tela de Configurações: painel "Sua Conta" + seção "Equipe" (só admin)
    const contaNome = document.getElementById('conta-nome-label');
    if (contaNome) {
      contaNome.textContent = usuario.nome;
      document.getElementById('conta-email-label').textContent = usuario.email;
      document.getElementById('conta-papel-label').textContent = usuario.papel === 'admin' ? 'Administrador' : 'Equipe';
    }
    const painelEquipe = document.getElementById('painel-equipe');
    if (painelEquipe && usuario.papel === 'admin') {
      painelEquipe.style.display = '';
      carregarEquipe();
    }

    // Tela de Cardápio: botão "Importar planilha" e edição de preço/foto
    // (só admin). Os dois fetches (usuário logado + preços) rodam em
    // paralelo — se os cards já tiverem renderizado como "só leitura" antes
    // de saber que é admin, renderiza de novo agora com os controles de edição.
    const importarArea = document.getElementById('cardapio-importar-area');
    if (importarArea && usuario.papel === 'admin') {
      importarArea.style.display = '';
      if (typeof lucide !== 'undefined') lucide.createIcons();
      if (cardapioLojaSelecionada) renderCardapioLoja(cardapioLojaSelecionada);
    }

    // Tela de Insights: botão de ajustar canal (só admin) — se a tabela de
    // canal de um dia específico já tiver renderizado como só-leitura antes
    // de saber que é admin, re-renderiza agora com os controles de edição.
    if (usuario.papel === 'admin' && canalSelecionado) {
      exibirCanalDoDia(canalSelecionado.unidade, canalSelecionado.diaIso);
    }

    // Tela de Estoque: botões "Novo insumo"/"Registrar entrada" e coluna de
    // Ações (só admin) — mesma correção de corrida entre os dois fetches.
    if (usuario.papel === 'admin' && document.getElementById('estoque-tabs') && estoqueInsumos.length) {
      renderEstoqueTab();
    }

    // Tela de Cardápio → sub-aba Ficha Técnica: botão "Novo item" e ícones
    // de editar/excluir (só admin) — mesma correção de corrida.
    if (usuario.papel === 'admin' && fichaTecnicaData.itens.length) {
      renderFichaTecnica();
    }
  } catch (erro) {
    console.error('Falha ao carregar usuário logado:', erro);
  }
}

// --- GESTÃO DE EQUIPE (tela de Configurações, só admin) ---

const PAPEL_LABEL_USUARIO = { admin: 'Admin', equipe: 'Equipe' };
let equipeData = [];

async function carregarEquipe() {
  const tbody = document.getElementById('equipe-tbody');
  if (!tbody) return;

  try {
    const resposta = await fetch('/api/usuarios');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    equipeData = dados.usuarios;

    if (!equipeData.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="panel-subtitle">Nenhum membro cadastrado ainda.</td></tr>`;
      return;
    }

    // data-id + listeners depois (não onclick com dado embutido) — nome/e-mail
    // são texto livre digitado pelo admin, embutir direto num atributo HTML
    // abre brecha de injeção (e quebra com nomes que têm aspas, tipo "D'Angelo").
    tbody.innerHTML = equipeData.map(u => `
      <tr data-id="${u.id}">
        <td class="font-bold">${escaparHtml(u.nome)}</td>
        <td class="text-muted">${escaparHtml(u.email)}</td>
        <td>${PAPEL_LABEL_USUARIO[u.papel] || u.papel}</td>
        <td><span class="badge-pill ${u.ativo ? 'pos' : 'neg'}">${u.ativo ? 'Ativo' : 'Inativo'}</span></td>
        <td>
          <div class="acoes-linha" style="justify-content:flex-end;">
            <button type="button" class="btn-acao-icone" title="Editar" data-acao="editar">
              <i data-lucide="pencil"></i>
            </button>
            <button type="button" class="btn-acao-icone" title="${u.ativo ? 'Desativar' : 'Ativar'}" data-acao="alternar-ativo">
              <i data-lucide="${u.ativo ? 'user-x' : 'user-check'}"></i>
            </button>
            <button type="button" class="btn-acao-icone btn-excluir" title="Excluir" data-acao="excluir">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
    wireEquipeRowEvents();
  } catch (erro) {
    console.error('Falha ao carregar equipe:', erro);
    tbody.innerHTML = `<tr><td colspan="5" class="panel-subtitle" style="color:var(--danger);">Não foi possível carregar a equipe.</td></tr>`;
  }
}

function wireEquipeRowEvents() {
  document.querySelectorAll('#equipe-tbody tr[data-id]').forEach(linha => {
    const usuario = equipeData.find(u => String(u.id) === linha.dataset.id);
    if (!usuario) return;
    linha.querySelector('[data-acao="editar"]')?.addEventListener('click', () => abrirModalEditarUsuario(usuario));
    linha.querySelector('[data-acao="alternar-ativo"]')?.addEventListener('click', () => alternarAtivoUsuario(usuario.id, !usuario.ativo));
    linha.querySelector('[data-acao="excluir"]')?.addEventListener('click', () => excluirUsuarioEquipe(usuario.id, usuario.nome));
  });
}

function abrirModalNovoUsuario() {
  document.getElementById('modalUsuarioTitulo').textContent = 'Novo Membro';
  document.getElementById('formUsuario').reset();
  document.getElementById('usuarioId').value = '';
  document.getElementById('usuarioSenha').required = true;
  document.getElementById('usuarioSenhaOpcional').style.display = 'none';
  document.getElementById('usuarioErro').style.display = 'none';
  document.getElementById('modalUsuario').style.display = 'flex';
}

function abrirModalEditarUsuario(usuario) {
  document.getElementById('modalUsuarioTitulo').textContent = 'Editar Membro';
  document.getElementById('formUsuario').reset();
  document.getElementById('usuarioId').value = usuario.id;
  document.getElementById('usuarioNome').value = usuario.nome;
  document.getElementById('usuarioEmail').value = usuario.email;
  document.getElementById('usuarioEmail').disabled = true;
  document.getElementById('usuarioPapel').value = usuario.papel;
  document.getElementById('usuarioSenha').required = false;
  document.getElementById('usuarioSenhaOpcional').style.display = 'inline';
  document.getElementById('usuarioErro').style.display = 'none';
  document.getElementById('modalUsuario').style.display = 'flex';
}

function fecharModalUsuario() {
  document.getElementById('modalUsuario').style.display = 'none';
  document.getElementById('usuarioEmail').disabled = false;
}

// --- TROCAR A PRÓPRIA SENHA (Configurações) ---

function abrirModalTrocarSenha() {
  document.getElementById('formTrocarSenha').reset();
  document.getElementById('trocarSenhaErro').style.display = 'none';
  document.getElementById('trocarSenhaSucesso').style.display = 'none';
  document.getElementById('modalTrocarSenha').style.display = 'flex';
}

function fecharModalTrocarSenha() {
  document.getElementById('modalTrocarSenha').style.display = 'none';
}

async function salvarTrocaSenha(event) {
  event.preventDefault();
  const senhaAtual = document.getElementById('senhaAtualInput').value;
  const senhaNova = document.getElementById('senhaNovaInput').value;
  const senhaNovaConfirmar = document.getElementById('senhaNovaConfirmarInput').value;
  const elErro = document.getElementById('trocarSenhaErro');
  const elSucesso = document.getElementById('trocarSenhaSucesso');
  elErro.style.display = 'none';
  elSucesso.style.display = 'none';

  if (senhaNova !== senhaNovaConfirmar) {
    elErro.textContent = 'A confirmação não bate com a nova senha.';
    elErro.style.display = 'block';
    return;
  }

  try {
    const resposta = await fetch('/api/me/senha', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senhaAtual, senhaNova }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) {
      elErro.textContent = dados.erro || 'Não foi possível trocar a senha.';
      elErro.style.display = 'block';
      return;
    }
    elSucesso.textContent = 'Senha alterada com sucesso.';
    elSucesso.style.display = 'block';
    document.getElementById('formTrocarSenha').reset();
    setTimeout(fecharModalTrocarSenha, 1500);
  } catch (erro) {
    console.error('Falha ao trocar senha:', erro);
    elErro.textContent = 'Não foi possível conectar ao servidor.';
    elErro.style.display = 'block';
  }
}

async function salvarUsuario(event) {
  event.preventDefault();
  const id = document.getElementById('usuarioId').value;
  const elErro = document.getElementById('usuarioErro');
  elErro.style.display = 'none';

  const corpo = {
    nome: document.getElementById('usuarioNome').value.trim(),
    papel: document.getElementById('usuarioPapel').value,
  };
  const senha = document.getElementById('usuarioSenha').value;
  if (senha) corpo.senha = senha;
  if (!id) corpo.email = document.getElementById('usuarioEmail').value.trim();

  try {
    const resposta = await fetch(id ? `/api/usuarios/${id}` : '/api/usuarios', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) {
      elErro.textContent = dados.erro || 'Não foi possível salvar.';
      elErro.style.display = 'block';
      return;
    }
    fecharModalUsuario();
    carregarEquipe();
  } catch (erro) {
    console.error('Falha ao salvar usuário:', erro);
    elErro.textContent = 'Não foi possível conectar ao servidor.';
    elErro.style.display = 'block';
  }
}

async function alternarAtivoUsuario(id, novoAtivo) {
  try {
    const resposta = await fetch(`/api/usuarios/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: novoAtivo }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) {
      alert(dados.erro || 'Não foi possível atualizar o status.');
      return;
    }
    carregarEquipe();
  } catch (erro) {
    console.error('Falha ao alternar status do usuário:', erro);
  }
}

async function excluirUsuarioEquipe(id, nome) {
  if (!confirm(`Excluir o acesso de "${nome}"? Essa ação não pode ser desfeita.`)) return;
  try {
    const resposta = await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
    const dados = await resposta.json();
    if (!resposta.ok) {
      alert(dados.erro || 'Não foi possível excluir.');
      return;
    }
    carregarEquipe();
  } catch (erro) {
    console.error('Falha ao excluir usuário:', erro);
  }
}

// --- CLICKUP: QUADRO DE TAREFAS ---
// Antes esse quadro era só visual (nada salvava, e os botões de detalhe,
// excluir, mover, comentar chamavam funções que nem existiam). Agora tudo
// passa pelo banco de dados via /api/tarefas.
let tarefasData = [];
let tarefaSelecionadaId = null;

const PRIORIDADE_LABEL_TAREFA = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const STATUS_LABEL_TAREFA = { todo: 'A Fazer', doing: 'Em Andamento', done: 'Feito' };

async function carregarTarefas() {
  const board = document.querySelector('.kanban-board');
  if (!board) return;
  try {
    const resposta = await fetch('/api/tarefas');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    tarefasData = dados.tarefas || [];
    renderKanban();
  } catch (erro) {
    console.error('Falha ao carregar tarefas:', erro);
    board.innerHTML = `<p class="panel-subtitle" style="color:#ef4444;">Não foi possível carregar as tarefas. Confira se o Flask está rodando.</p>`;
  }
}

function renderKanban() {
  ['todo', 'doing', 'done'].forEach(status => {
    const coluna = document.querySelector(`.kanban-column[data-status="${status}"] .task-list`);
    const contagem = document.querySelector(`.kanban-column[data-status="${status}"] .task-count`);
    if (!coluna) return;

    const tarefas = tarefasData.filter(t => t.status === status);
    if (contagem) contagem.textContent = tarefas.length;

    coluna.innerHTML = tarefas.length
      ? tarefas.map(t => `
          <div class="task-card" draggable="true" data-id="${t.id}">
            <div class="card-top">
              <h4 class="task-title">${escaparHtml(t.titulo)}</h4>
              <span class="badge priority-${t.prioridade}">${PRIORIDADE_LABEL_TAREFA[t.prioridade] || t.prioridade}</span>
            </div>
            <p>${escaparHtml(t.descricao)}</p>
            <div class="card-bottom">
              <span class="task-meta">${escaparHtml(t.categoria)}</span>
              <span class="task-date">${t.dataLimiteFormatada || ''}</span>
            </div>
          </div>
        `).join('')
      : '';
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
  wireTaskCardEvents();
}

function wireTaskCardEvents() {
  document.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', () => abrirDetalhesTarefa(card.dataset.id));
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.dataset.id);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
}

function wireColumnDropEvents() {
  document.querySelectorAll('.kanban-column').forEach(column => {
    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      column.classList.add('drag-over');
    });
    column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
    column.addEventListener('drop', async (e) => {
      e.preventDefault();
      column.classList.remove('drag-over');
      const tarefaId = e.dataTransfer.getData('text/plain');
      if (!tarefaId) return;
      await moverTarefa(tarefaId, column.dataset.status);
    });
  });
}

async function moverTarefa(tarefaId, novoStatus) {
  try {
    const resposta = await fetch(`/api/tarefas/${tarefaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: novoStatus }),
    });
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    await carregarTarefas();
  } catch (erro) {
    console.error('Falha ao mover tarefa:', erro);
    alert('Não foi possível mover a tarefa. Confira se o Flask está rodando.');
  }
}

// --- MODAL: CRIAR TAREFA ---
function criarNovaTarefa() {
  const modal = document.getElementById('modalCriarTarefa');
  if (modal) modal.style.display = 'flex';
}

function fecharModalCriar() {
  const modal = document.getElementById('modalCriarTarefa');
  if (modal) modal.style.display = 'none';
  const form = document.getElementById('formNovaTarefa');
  if (form) form.reset();
}

async function salvarNovaTarefa(event) {
  event.preventDefault();
  const titulo = document.getElementById('tituloTarefa').value.trim();
  if (!titulo) return;

  const corpo = {
    titulo,
    prioridade: document.getElementById('prioridadeTarefa').value,
    categoria: document.getElementById('categoriaTarefa').value,
    dataLimite: document.getElementById('dataLimiteTarefa').value,
    descricao: document.getElementById('descricaoTarefa').value,
  };

  try {
    const resposta = await fetch('/api/tarefas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    fecharModalCriar();
    await carregarTarefas();
  } catch (erro) {
    console.error('Falha ao criar tarefa:', erro);
    alert('Não foi possível criar a tarefa. Confira se o Flask está rodando.');
  }
}

// --- MODAL: DETALHES / EDITAR / EXCLUIR TAREFA ---
function abrirDetalhesTarefa(id) {
  const tarefa = tarefasData.find(t => String(t.id) === String(id));
  if (!tarefa) return;
  tarefaSelecionadaId = tarefa.id;

  const badge = document.getElementById('detalheBadge');
  if (badge) {
    badge.textContent = PRIORIDADE_LABEL_TAREFA[tarefa.prioridade] || tarefa.prioridade;
    badge.className = `badge priority-${tarefa.prioridade}`;
  }
  const status = document.getElementById('detalheStatus');
  if (status) status.textContent = STATUS_LABEL_TAREFA[tarefa.status] || tarefa.status;

  document.getElementById('detalheTitulo').textContent = tarefa.titulo;
  document.getElementById('detalheCategoria').textContent = tarefa.categoria;
  document.getElementById('detalheData').textContent = tarefa.dataLimiteFormatada || '—';
  document.getElementById('detalheDescricao').textContent = tarefa.descricao || 'Sem descrição.';

  renderChecklist(tarefa);
  renderComentarios(tarefa);

  const modal = document.getElementById('modalDetalhesTarefa');
  if (modal) modal.style.display = 'flex';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function fecharModalDetalhes() {
  const modal = document.getElementById('modalDetalhesTarefa');
  if (modal) modal.style.display = 'none';
  tarefaSelecionadaId = null;
}

function renderChecklist(tarefa) {
  const container = document.getElementById('checklistContainer');
  const progressText = document.getElementById('checklistProgressText');
  const progressBar = document.getElementById('checklistProgressBar');
  if (!container) return;

  const total = tarefa.subtarefas.length;
  const concluidas = tarefa.subtarefas.filter(s => s.concluida).length;
  if (progressText) progressText.textContent = `${concluidas}/${total}`;
  if (progressBar) progressBar.style.width = total ? `${(concluidas / total) * 100}%` : '0%';

  container.innerHTML = total
    ? tarefa.subtarefas.map(s => `
        <div class="subtask-item ${s.concluida ? 'completed' : ''}">
          <input type="checkbox" ${s.concluida ? 'checked' : ''} onchange="alternarSubtarefa(${s.id}, this.checked)">
          <span>${escaparHtml(s.titulo)}</span>
        </div>
      `).join('')
    : '';
}

function renderComentarios(tarefa) {
  const container = document.getElementById('commentsContainer');
  if (!container) return;
  container.innerHTML = tarefa.comentarios.length
    ? tarefa.comentarios.map(c => `
        <div class="comment-card">
          <div class="comment-author">${escaparHtml(c.autor)}</div>
          <div class="comment-text">${escaparHtml(c.texto)}</div>
        </div>
      `).join('')
    : `<p class="panel-subtitle">Nenhum comentário ainda.</p>`;
}

async function recarregarTarefaSelecionada() {
  const idAtual = tarefaSelecionadaId;
  await carregarTarefas();
  if (idAtual) abrirDetalhesTarefa(idAtual);
}

async function adicionarSubtarefa() {
  const input = document.getElementById('novaSubtarefaInput');
  const titulo = input.value.trim();
  if (!titulo || !tarefaSelecionadaId) return;
  try {
    const resposta = await fetch(`/api/tarefas/${tarefaSelecionadaId}/subtarefas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo }),
    });
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    input.value = '';
    await recarregarTarefaSelecionada();
  } catch (erro) {
    console.error('Falha ao adicionar subtarefa:', erro);
    alert('Não foi possível adicionar a subtarefa. Confira se o Flask está rodando.');
  }
}

async function alternarSubtarefa(subtarefaId, concluida) {
  if (!tarefaSelecionadaId) return;
  try {
    const resposta = await fetch(`/api/tarefas/${tarefaSelecionadaId}/subtarefas/${subtarefaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concluida }),
    });
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    await recarregarTarefaSelecionada();
  } catch (erro) {
    console.error('Falha ao atualizar subtarefa:', erro);
  }
}

async function enviarComentario() {
  const input = document.getElementById('novoComentarioInput');
  const texto = input.value.trim();
  if (!texto || !tarefaSelecionadaId) return;
  try {
    const resposta = await fetch(`/api/tarefas/${tarefaSelecionadaId}/comentarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto }),
    });
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    input.value = '';
    await recarregarTarefaSelecionada();
  } catch (erro) {
    console.error('Falha ao enviar comentário:', erro);
    alert('Não foi possível enviar o comentário. Confira se o Flask está rodando.');
  }
}

async function excluirTarefa() {
  if (!tarefaSelecionadaId) return;
  if (!confirm('Excluir essa tarefa? Essa ação não pode ser desfeita.')) return;
  try {
    const resposta = await fetch(`/api/tarefas/${tarefaSelecionadaId}`, { method: 'DELETE' });
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    fecharModalDetalhes();
    await carregarTarefas();
  } catch (erro) {
    console.error('Falha ao excluir tarefa:', erro);
    alert('Não foi possível excluir a tarefa. Confira se o Flask está rodando.');
  }
}

// Botão "Mover de Status" no modal de detalhes: avança pra próxima coluna
// (A Fazer -> Em Andamento -> Feito -> volta pra A Fazer).
async function alterarStatusModal() {
  if (!tarefaSelecionadaId) return;
  const tarefa = tarefasData.find(t => t.id === tarefaSelecionadaId);
  if (!tarefa) return;
  const ordem = ['todo', 'doing', 'done'];
  const proximoStatus = ordem[(ordem.indexOf(tarefa.status) + 1) % ordem.length];
  await moverTarefa(tarefaSelecionadaId, proximoStatus);
  await recarregarTarefaSelecionada();
}

// --- TELA DE CARDÁPIO (comparativo de preços, só leitura) ---

let cardapioData = [];
let cardapioLojaSelecionada = null;

async function carregarPrecosCardapio() {
  const tabsEl = document.getElementById('cardapio-tabs');
  const conteudoEl = document.getElementById('cardapio-conteudo');
  if (!tabsEl || !conteudoEl) return;

  try {
    const resposta = await fetch('/api/precos-cardapio');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    cardapioData = dados.lojas;

    if (!cardapioData.length) {
      tabsEl.innerHTML = '';
      conteudoEl.innerHTML = `<p class="panel-subtitle" style="padding: var(--space-4);">Nenhum preço importado ainda.</p>`;
      return;
    }

    // Ordem fixa das abas, independente da ordem que veio da API.
    const ORDEM_LOJAS = ['Hamburgueria Artesanos', 'Tradiças', 'Açaí Na Lata'];
    cardapioData.sort((a, b) => ORDEM_LOJAS.indexOf(a.loja) - ORDEM_LOJAS.indexOf(b.loja));

    tabsEl.innerHTML = cardapioData.map((loja, i) => `
      <button class="tab-btn ${i === 0 ? 'active' : ''}" data-loja="${escaparHtml(loja.loja)}">
        ${escaparHtml(loja.loja)}
      </button>
    `).join('');

    tabsEl.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        tabsEl.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderCardapioLoja(btn.dataset.loja);
      });
    });

    cardapioLojaSelecionada = cardapioData[0].loja;
    renderCardapioLoja(cardapioLojaSelecionada);
  } catch (erro) {
    console.error('Falha ao carregar preços do cardápio:', erro);
    conteudoEl.innerHTML = `<p class="panel-subtitle" style="color:var(--danger); padding: var(--space-4);">Não foi possível carregar os preços. Confira se o Flask está rodando.</p>`;
  }
}

const CANAIS_CARDAPIO = [
  { chave: 'ifood', label: 'iFood' },
  { chave: 'food99', label: '99Food' },
  { chave: 'beefood', label: 'BeeFood' },
  { chave: 'cardapioWeb', label: 'Cardápio Web' },
];

function _formatarPrecoCardapio(valor) {
  return typeof valor === 'number'
    ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : null;
}

function _buscarItemCardapio(id) {
  for (const loja of cardapioData) {
    for (const cat of loja.categorias) {
      const item = cat.produtos.find(p => String(p.id) === String(id));
      if (item) return item;
    }
  }
  return null;
}

// Corpo do card (nome + preços) — dois estados: leitura (padrão, todo mundo
// vê) e edição (só depois de clicar no lápis, só admin). Refeito assim,
// re-renderizando só o corpo, pra não precisar recarregar a lista inteira
// nem religar eventos card por card a cada clique.
function _cardapioCorpoHTML(p, canais, isAdmin, editando) {
  const nome = `<div class="cardapio-card-nome">${escaparHtml(p.produto)}</div>`;

  if (!editando) {
    return `
      <div class="cardapio-card-topo">
        ${nome}
        ${isAdmin ? `<button type="button" class="cardapio-btn-editar" data-acao="editar-preco" title="Editar preços"><i data-lucide="pencil"></i></button>` : ''}
      </div>
      ${canais.map(c => `
        <div class="cardapio-linha-preco">
          <span class="cardapio-canal-label">${c.label}</span>
          <span class="cardapio-preco-valor">${_formatarPrecoCardapio(p[c.chave]) ?? '<span class="cardapio-preco-vazio">—</span>'}</span>
        </div>
      `).join('')}
    `;
  }

  return `
    <div class="cardapio-card-topo">${nome}</div>
    ${canais.map(c => `
      <div class="cardapio-linha-preco">
        <span class="cardapio-canal-label">${c.label}</span>
        <input type="number" step="0.01" min="0" class="cardapio-input-preco" data-canal="${c.chave}" value="${p[c.chave] ?? ''}" placeholder="—">
      </div>
    `).join('')}
    <div class="cardapio-editar-acoes">
      <button type="button" class="btn-secondary-sm" data-acao="cancelar-preco">Cancelar</button>
      <button type="button" class="btn-primary-sm cardapio-btn-salvar" data-acao="salvar">Salvar</button>
    </div>
  `;
}

function renderCardapioLoja(nomeLoja) {
  const conteudoEl = document.getElementById('cardapio-conteudo');
  if (!conteudoEl) return;

  const loja = cardapioData.find(l => l.loja === nomeLoja);
  if (!loja) return;

  const isAdmin = window.usuarioLogado?.papel === 'admin';
  const temBeefood = loja.categorias.some(cat => cat.produtos.some(p => p.beefood !== null));
  const canais = temBeefood ? CANAIS_CARDAPIO : CANAIS_CARDAPIO.filter(c => c.chave !== 'beefood');

  const cardsPorCategoria = loja.categorias.map(cat => `
    <div class="cardapio-categoria-titulo">${escaparHtml(cat.nome)}</div>
    <div class="cardapio-lista">
      ${cat.produtos.map(p => `
        <div class="cardapio-card" data-id="${p.id}">
          <div class="cardapio-card-foto">
            ${p.fotoUrl
              ? `<img src="${p.fotoUrl}" alt="${escaparHtml(p.produto)}">`
              : `<div class="cardapio-foto-vazia"><i data-lucide="image"></i></div>`}
            ${isAdmin ? `
              <button type="button" class="cardapio-btn-foto" data-acao="foto" title="Trocar foto">
                <i data-lucide="camera"></i>
              </button>
              <input type="file" accept="image/*" class="cardapio-input-foto" style="display:none;">
            ` : ''}
          </div>
          <div class="cardapio-card-corpo">${_cardapioCorpoHTML(p, canais, isAdmin, false)}</div>
        </div>
      `).join('')}
    </div>
  `).join('');

  conteudoEl.innerHTML = cardsPorCategoria;
  conteudoEl.dataset.canais = JSON.stringify(canais);

  _wireCardapioEventosDelegados();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _cardapioRerenderCorpo(card, editando) {
  const itemId = card.dataset.id;
  const item = _buscarItemCardapio(itemId);
  if (!item) return;
  const canais = JSON.parse(document.getElementById('cardapio-conteudo').dataset.canais || '[]');
  card.querySelector('.cardapio-card-corpo').innerHTML = _cardapioCorpoHTML(item, canais, true, editando);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Um listener só, no container — os cards são recriados/re-renderizados o
// tempo todo (entrar/sair do modo edição, trocar de loja), então delegar
// no pai evita ter que religar eventos toda vez.
function _wireCardapioEventosDelegados() {
  const conteudoEl = document.getElementById('cardapio-conteudo');
  if (!conteudoEl || conteudoEl.dataset.eventosLigados) return;
  conteudoEl.dataset.eventosLigados = '1';

  conteudoEl.addEventListener('click', async (e) => {
    const card = e.target.closest('.cardapio-card');
    if (!card) return;
    const itemId = card.dataset.id;

    if (e.target.closest('[data-acao="editar-preco"]')) {
      _cardapioRerenderCorpo(card, true);
      return;
    }

    if (e.target.closest('[data-acao="cancelar-preco"]')) {
      _cardapioRerenderCorpo(card, false);
      return;
    }

    if (e.target.closest('[data-acao="salvar"]')) {
      const btn = card.querySelector('[data-acao="salvar"]');
      const corpo = {};
      card.querySelectorAll('.cardapio-input-preco').forEach(input => {
        corpo[input.dataset.canal] = input.value === '' ? null : input.value;
      });
      btn.disabled = true;
      btn.textContent = 'Salvando...';
      try {
        const resposta = await fetch(`/api/precos-cardapio/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corpo),
        });
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.erro || 'falha ao salvar');

        const item = _buscarItemCardapio(itemId);
        if (item) Object.assign(item, { ifood: dados.ifood, food99: dados.food99, beefood: dados.beefood, cardapioWeb: dados.cardapioWeb });
        _cardapioRerenderCorpo(card, false);
      } catch (erro) {
        console.error('Falha ao salvar preço do cardápio:', erro);
        btn.textContent = 'Erro — tentar de novo';
        btn.disabled = false;
      }
      return;
    }

    if (e.target.closest('[data-acao="foto"]')) {
      card.querySelector('.cardapio-input-foto')?.click();
    }
  });

  conteudoEl.addEventListener('change', async (e) => {
    const inputFoto = e.target.closest('.cardapio-input-foto');
    if (!inputFoto) return;
    const card = inputFoto.closest('.cardapio-card');
    const itemId = card.dataset.id;
    const arquivo = inputFoto.files[0];
    inputFoto.value = '';
    if (!arquivo) return;

    try {
      const formData = new FormData();
      formData.append('foto', arquivo);
      const resposta = await fetch(`/api/precos-cardapio/${itemId}/foto`, { method: 'POST', body: formData });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'falha ao subir foto');

      const fotoContainer = card.querySelector('.cardapio-card-foto');
      fotoContainer.querySelector('img, .cardapio-foto-vazia')?.remove();
      fotoContainer.insertAdjacentHTML('afterbegin', `<img src="${dados.fotoUrl}" alt="">`);

      const item = _buscarItemCardapio(itemId);
      if (item) item.fotoUrl = dados.fotoUrl;
    } catch (erro) {
      console.error('Falha ao subir foto do cardápio:', erro);
      alert('Não foi possível subir a foto. Tenta de novo.');
    }
  });
}

async function importarPlanilhaCardapio(event) {
  const arquivo = event.target.files[0];
  event.target.value = ''; // permite escolher o mesmo arquivo de novo depois, se precisar
  if (!arquivo) return;

  const statusEl = document.getElementById('cardapio-importar-status');
  statusEl.style.display = 'block';
  statusEl.style.color = '';
  statusEl.textContent = `Importando "${arquivo.name}"...`;

  try {
    const formData = new FormData();
    formData.append('planilha', arquivo);
    const resposta = await fetch('/api/precos-cardapio/importar', { method: 'POST', body: formData });
    const dados = await resposta.json();

    if (!resposta.ok) {
      statusEl.style.color = 'var(--danger)';
      statusEl.textContent = dados.erro || 'Não foi possível importar a planilha.';
      return;
    }

    statusEl.style.color = 'var(--success)';
    statusEl.textContent = `Importado com sucesso: ${dados.totalProdutos} produtos.`;
    await carregarPrecosCardapio();
  } catch (erro) {
    console.error('Falha ao importar planilha do cardápio:', erro);
    statusEl.style.color = 'var(--danger)';
    statusEl.textContent = 'Não foi possível conectar ao servidor.';
  }
}

// --- FICHA TÉCNICA (insumos que cada item do cardápio consome) ---
let fichaTecnicaData = { itens: [], insumosDisponiveis: [] };
let fichaTecnicaEditandoItemId = null;

async function carregarFichaTecnica() {
  const conteudoEl = document.getElementById('ficha-tecnica-conteudo');
  if (!conteudoEl) return;
  try {
    const resposta = await fetch('/api/ficha-tecnica');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    fichaTecnicaData = await resposta.json();
    renderFichaTecnica();
  } catch (erro) {
    console.error('Falha ao carregar ficha técnica:', erro);
    conteudoEl.innerHTML = `<p class="panel-subtitle" style="color:var(--danger); padding: var(--space-4);">Não foi possível carregar a ficha técnica.</p>`;
  }
}

function renderFichaTecnica() {
  const conteudoEl = document.getElementById('ficha-tecnica-conteudo');
  const acoesAdmin = document.getElementById('ficha-tecnica-acoes-admin');
  if (!conteudoEl) return;
  const isAdmin = window.usuarioLogado?.papel === 'admin';
  if (acoesAdmin) acoesAdmin.style.display = isAdmin ? '' : 'none';

  const itens = fichaTecnicaData.itens || [];
  if (!itens.length) {
    conteudoEl.innerHTML = `<p class="panel-subtitle" style="padding: var(--space-4);">Nenhum item cadastrado ainda.</p>`;
    return;
  }

  // Agrupa por categoria, preservando a ordem que já veio da API (categoria, nome).
  const categorias = [];
  const porCategoria = new Map();
  itens.forEach(item => {
    if (!porCategoria.has(item.categoria)) {
      porCategoria.set(item.categoria, []);
      categorias.push(item.categoria);
    }
    porCategoria.get(item.categoria).push(item);
  });

  conteudoEl.innerHTML = categorias.map(categoria => `
    <div class="cardapio-categoria-titulo">${escaparHtml(categoria)}</div>
    <div class="ficha-tecnica-lista">
      ${porCategoria.get(categoria).map(item => `
        <div class="ficha-tecnica-card">
          <div class="ficha-tecnica-card-topo">
            <div class="ficha-tecnica-card-nome">${escaparHtml(item.nome)}</div>
            ${isAdmin ? `
              <div class="acoes-linha">
                <button type="button" class="btn-acao-icone" data-acao="editar-ficha-tecnica" data-item-id="${item.id}" title="Editar insumos">
                  <i data-lucide="pencil"></i>
                </button>
                <button type="button" class="btn-acao-icone btn-excluir" data-acao="excluir-item-cardapio" data-item-id="${item.id}" data-nome="${escaparHtml(item.nome)}" title="Excluir item">
                  <i data-lucide="trash-2"></i>
                </button>
              </div>
            ` : ''}
          </div>
          <div class="ficha-tecnica-ingredientes">
            ${item.insumos.length ? item.insumos.map(ins => `
              <span class="ficha-tecnica-chip">${escaparHtml(ins.nome)}${ins.quantidade != null ? ` <span class="qtd">(${ins.quantidade}${escaparHtml(ins.unidadeMedida)})</span>` : ''}</span>
            `).join('') : `<span class="ficha-tecnica-vazio">Nenhum insumo cadastrado ainda.</span>`}
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');

  if (isAdmin) {
    conteudoEl.querySelectorAll('[data-acao="editar-ficha-tecnica"]').forEach(btn => {
      btn.addEventListener('click', () => abrirModalFichaTecnicaItem(parseInt(btn.dataset.itemId, 10)));
    });
    conteudoEl.querySelectorAll('[data-acao="excluir-item-cardapio"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Excluir "${btn.dataset.nome}" e sua ficha técnica?`)) return;
        try {
          const resposta = await fetch(`/api/itens-cardapio/${btn.dataset.itemId}`, { method: 'DELETE' });
          if (!resposta.ok) throw new Error('falha ao excluir');
          await carregarFichaTecnica();
        } catch (erro) {
          console.error('Falha ao excluir item do cardápio:', erro);
          alert('Não foi possível excluir.');
        }
      });
    });
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --- Modal: Novo item do cardápio ---
function abrirModalNovoItemCardapio() {
  document.getElementById('form-novo-item-cardapio').reset();
  document.getElementById('modal-novo-item-cardapio').style.display = 'flex';
}
function fecharModalNovoItemCardapio() {
  document.getElementById('modal-novo-item-cardapio').style.display = 'none';
}
document.getElementById('btn-novo-item-cardapio')?.addEventListener('click', abrirModalNovoItemCardapio);
document.getElementById('btn-novo-item-cardapio-fechar')?.addEventListener('click', fecharModalNovoItemCardapio);
document.getElementById('btn-novo-item-cardapio-cancelar')?.addEventListener('click', fecharModalNovoItemCardapio);

document.getElementById('form-novo-item-cardapio')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const corpo = {
    nome: document.getElementById('novo-item-nome').value,
    categoria: document.getElementById('novo-item-categoria').value,
  };
  try {
    const resposta = await fetch('/api/itens-cardapio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao cadastrar');
    fecharModalNovoItemCardapio();
    await carregarFichaTecnica();
  } catch (erro) {
    console.error('Falha ao cadastrar item do cardápio:', erro);
    alert(erro.message || 'Não foi possível cadastrar.');
  }
});

// --- Modal: Editar ficha técnica de um item ---
function _linhaFichaTecnicaHTML(insumoId, quantidade) {
  const opcoes = fichaTecnicaData.insumosDisponiveis.map(i =>
    `<option value="${i.id}" ${i.id === insumoId ? 'selected' : ''}>${escaparHtml(i.nome)} (${escaparHtml(i.unidadeMedida)})</option>`
  ).join('');
  return `
    <div class="ficha-tecnica-linha">
      <select class="ficha-tecnica-select-insumo">${opcoes}</select>
      <input type="number" step="0.01" min="0" class="ficha-tecnica-input-quantidade" placeholder="Qtd." value="${quantidade ?? ''}">
      <button type="button" class="btn-acao-icone btn-excluir" data-acao="remover-linha-ficha-tecnica" title="Remover">
        <i data-lucide="x"></i>
      </button>
    </div>
  `;
}

function _wireLinhasFichaTecnica() {
  document.querySelectorAll('[data-acao="remover-linha-ficha-tecnica"]').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.ficha-tecnica-linha').remove());
  });
}

function abrirModalFichaTecnicaItem(itemId) {
  const item = fichaTecnicaData.itens.find(i => i.id === itemId);
  if (!item || !fichaTecnicaData.insumosDisponiveis.length) {
    if (!fichaTecnicaData.insumosDisponiveis.length) alert('Cadastre pelo menos um insumo no Estoque antes de montar a ficha técnica.');
    return;
  }
  fichaTecnicaEditandoItemId = itemId;
  document.getElementById('ficha-tecnica-item-titulo').textContent = `Ficha técnica — ${item.nome}`;

  const container = document.getElementById('ficha-tecnica-item-linhas');
  const linhasIniciais = item.insumos.length
    ? item.insumos
    : [{ insumoId: fichaTecnicaData.insumosDisponiveis[0].id, quantidade: null }];
  container.innerHTML = linhasIniciais.map(ins => _linhaFichaTecnicaHTML(ins.insumoId, ins.quantidade)).join('');
  _wireLinhasFichaTecnica();

  document.getElementById('modal-ficha-tecnica-item').style.display = 'flex';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function fecharModalFichaTecnicaItem() {
  document.getElementById('modal-ficha-tecnica-item').style.display = 'none';
  fichaTecnicaEditandoItemId = null;
}

document.getElementById('btn-ficha-tecnica-item-fechar')?.addEventListener('click', fecharModalFichaTecnicaItem);
document.getElementById('btn-ficha-tecnica-item-cancelar')?.addEventListener('click', fecharModalFichaTecnicaItem);

document.getElementById('btn-ficha-tecnica-add-linha')?.addEventListener('click', () => {
  if (!fichaTecnicaData.insumosDisponiveis.length) return;
  const container = document.getElementById('ficha-tecnica-item-linhas');
  container.insertAdjacentHTML('beforeend', _linhaFichaTecnicaHTML(fichaTecnicaData.insumosDisponiveis[0].id, null));
  _wireLinhasFichaTecnica();
  if (typeof lucide !== 'undefined') lucide.createIcons();
});

document.getElementById('form-ficha-tecnica-item')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!fichaTecnicaEditandoItemId) return;

  const insumos = [...document.querySelectorAll('#ficha-tecnica-item-linhas .ficha-tecnica-linha')].map(linha => ({
    insumoId: parseInt(linha.querySelector('.ficha-tecnica-select-insumo').value, 10),
    quantidade: linha.querySelector('.ficha-tecnica-input-quantidade').value || null,
  }));

  try {
    const resposta = await fetch(`/api/itens-cardapio/${fichaTecnicaEditandoItemId}/ficha-tecnica`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insumos }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao salvar');
    fecharModalFichaTecnicaItem();
    await carregarFichaTecnica();
  } catch (erro) {
    console.error('Falha ao salvar ficha técnica:', erro);
    alert(erro.message || 'Não foi possível salvar.');
  }
});

// --- Sub-abas Preços x Ficha Técnica ---
document.querySelectorAll('.cardapio-subaba').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cardapio-subaba').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const modoPrecos = document.getElementById('cardapio-modo-precos');
    const modoFicha = document.getElementById('cardapio-modo-ficha-tecnica');
    if (btn.dataset.subaba === 'precos') {
      modoPrecos.style.display = '';
      modoFicha.style.display = 'none';
    } else {
      modoPrecos.style.display = 'none';
      modoFicha.style.display = '';
      if (!fichaTecnicaData.itens.length) carregarFichaTecnica();
    }
  });
});