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

  // 3. LÓGICA DE RECOLHER A SIDEBAR (TOGGLE MENU)
  // Suporta tanto 'btnToggleMenu' quanto 'toggleMenuBtn' para evitar conflito entre telas
  const toggleBtn = document.getElementById('btnToggleMenu') || document.getElementById('toggleMenuBtn');
  const container = document.getElementById('dashboardWrapper');

  if (container) {
    if (localStorage.getItem('sidebar-collapsed') === 'true') {
      container.classList.add('collapsed');
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        container.classList.toggle('collapsed');
        const isCollapsed = container.classList.contains('collapsed');
        localStorage.setItem('sidebar-collapsed', isCollapsed);
      });
    }
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
    renderCanalAnalysis(dados.canais || [], unidade);

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
    const pedidosNumero = parseInt(String(c.pedidos).replace(/\./g, ''), 10) || 0;
    const atual = grupos.get(nome) || { canal: nome, faturamentoNumero: 0, pedidosNumero: 0 };
    atual.faturamentoNumero += c.faturamentoNumero;
    atual.pedidosNumero += pedidosNumero;
    grupos.set(nome, atual);
  });

  const mesclados = Array.from(grupos.values()).map(g => ({
    canal: g.canal,
    faturamentoNumero: g.faturamentoNumero,
    faturamento: _formatarMoedaBR(g.faturamentoNumero),
    pedidos: _formatarNumeroBR(g.pedidosNumero),
    ticket: _formatarMoedaBR(g.pedidosNumero ? g.faturamentoNumero / g.pedidosNumero : 0),
    percentual: Math.round((g.faturamentoNumero / totalFaturamento) * 1000) / 10,
  }));

  mesclados.sort((a, b) => b.faturamentoNumero - a.faturamentoNumero);
  return mesclados;
}

// Gráfico de rosca + tabela de canais, no mesmo formato do painel da Cardápio Web
function renderCanalAnalysis(canaisBrutos, unidadeParaLabels) {
  const canalTableBody = document.getElementById('canal-table-body');
  const canvas = document.getElementById('canalChart');
  if (!canalTableBody || !canvas) return;

  if (canalChartInstance) {
    canalChartInstance.destroy();
    canalChartInstance = null;
  }

  if (!canaisBrutos.length) {
    canalTableBody.innerHTML = `<tr><td colspan="5" class="panel-subtitle">Nenhum dado de canal nesse período.</td></tr>`;
    return;
  }

  const canais = mesclarCanaisPorNomeExibicao(canaisBrutos, unidadeParaLabels);

  canalTableBody.innerHTML = canais.map((c, i) => `
    <tr>
      <td>
        <span class="canal-nome">
          <span class="canal-dot" style="background-color: ${CORES_CANAL[i % CORES_CANAL.length]};"></span>
          ${c.canal}
        </span>
      </td>
      <td class="font-bold">R$ ${c.faturamento}</td>
      <td>R$ ${c.ticket}</td>
      <td>${c.pedidos}</td>
      <td>${c.percentual}%</td>
    </tr>
  `).join('');

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
  } catch (erro) {
    console.error('Falha ao carregar usuário logado:', erro);
  }
}

// --- GESTÃO DE EQUIPE (tela de Configurações, só admin) ---

const PAPEL_LABEL_USUARIO = { admin: 'Admin', equipe: 'Equipe' };

async function carregarEquipe() {
  const tbody = document.getElementById('equipe-tbody');
  if (!tbody) return;

  try {
    const resposta = await fetch('/api/usuarios');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();

    if (!dados.usuarios.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="panel-subtitle">Nenhum membro cadastrado ainda.</td></tr>`;
      return;
    }

    tbody.innerHTML = dados.usuarios.map(u => `
      <tr>
        <td class="font-bold">${u.nome}</td>
        <td class="text-muted">${u.email}</td>
        <td>${PAPEL_LABEL_USUARIO[u.papel] || u.papel}</td>
        <td><span class="badge-pill ${u.ativo ? 'pos' : 'neg'}">${u.ativo ? 'Ativo' : 'Inativo'}</span></td>
        <td>
          <div class="acoes-linha" style="justify-content:flex-end;">
            <button type="button" class="btn-acao-icone" title="Editar" onclick='abrirModalEditarUsuario(${JSON.stringify(u)})'>
              <i data-lucide="pencil"></i>
            </button>
            <button type="button" class="btn-acao-icone" title="${u.ativo ? 'Desativar' : 'Ativar'}" onclick="alternarAtivoUsuario(${u.id}, ${!u.ativo})">
              <i data-lucide="${u.ativo ? 'user-x' : 'user-check'}"></i>
            </button>
            <button type="button" class="btn-acao-icone btn-excluir" title="Excluir" onclick="excluirUsuarioEquipe(${u.id}, '${u.nome.replace(/'/g, "\\'")}')">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (erro) {
    console.error('Falha ao carregar equipe:', erro);
    tbody.innerHTML = `<tr><td colspan="5" class="panel-subtitle" style="color:var(--danger);">Não foi possível carregar a equipe.</td></tr>`;
  }
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
              <h4 class="task-title">${t.titulo}</h4>
              <span class="badge priority-${t.prioridade}">${PRIORIDADE_LABEL_TAREFA[t.prioridade] || t.prioridade}</span>
            </div>
            <p>${t.descricao || ''}</p>
            <div class="card-bottom">
              <span class="task-meta">${t.categoria}</span>
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
          <span>${s.titulo}</span>
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
          <div class="comment-author">${c.autor}</div>
          <div class="comment-text">${c.texto}</div>
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