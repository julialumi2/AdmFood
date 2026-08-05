document.addEventListener('DOMContentLoaded', () => {

  // 1. INICIALIZA ÍCONES LUCIDE
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // 2. TOGGLE MODO NOTURNO
  const toggleCheckbox = document.getElementById('theme-toggle-checkbox');
  if (toggleCheckbox) {
    // Aplica o tema salvo no localStorage ao carregar a página
    if (localStorage.getItem('theme') === 'dark') {
      document.body.classList.add('dark-mode');
      toggleCheckbox.checked = true;
    }

    // Evento de troca ao clicar no toggle
    toggleCheckbox.addEventListener('change', () => {
      if (toggleCheckbox.checked) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
      } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
      }
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

  // 4. GRÁFICO CHART.JS
  const salesChartElem = document.getElementById('salesChart');
  if (salesChartElem && typeof Chart !== 'undefined') {
    const ctx = salesChartElem.getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['11h', '12h', '13h', '18h', '19h', '20h', '21h', '22h'],
        datasets: [
          { label: "Artesano's", data: [200, 500, 750, 400, 950, 800, 600, 300], borderColor: '#d93829', borderWidth: 2, tension: 0.3, pointRadius: 0 },
          { label: 'Unidade 2', data: [150, 400, 600, 300, 750, 650, 450, 250], borderColor: '#f59e0b', borderWidth: 2, tension: 0.3, pointRadius: 0 },
          { label: 'Unidade 3', data: [100, 300, 500, 250, 600, 500, 350, 200], borderColor: '#10b981', borderWidth: 2, tension: 0.3, pointRadius: 0 },
          { label: 'Unidade 4', data: [80, 200, 400, 180, 450, 400, 250, 150], borderColor: '#3b82f6', borderWidth: 2, tension: 0.3, pointRadius: 0 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { 
            grid: { color: '#f1f5f9', strokeDash: [4, 4] },
            ticks: { callback: value => 'R$' + value }
          }
        }
      }
    });
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

  const elDataGrafico = document.getElementById('data-grafico-sub');
  if (elDataGrafico) elDataGrafico.textContent = dataOntemFormatada;

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

// Quando o usuário aplica um filtro de data no Histórico Diário, ele fica
// "travado" nesse resultado (em vez do período do filtro geral) até ser limpo.
let filtroHistoricoAtivo = false;
let ultimoDiarioFiltrado = [];

// Paleta usada tanto no gráfico de rosca quanto na bolinha colorida da tabela,
// pra ficarem sempre com a mesma cor por posição.
const CORES_CANAL = ['#3b82f6', '#f59e0b', '#a855f7', '#10b981', '#e11d48', '#06b6d4'];

// Lojas que têm vendas presenciais (fora da Cardápio Web) e precisam do
// formulário de lançamento manual.
const UNIDADES_COM_PRESENCIAL = ['Hamburgueria Artesanos', 'Tradiça ZN'];

// Só o Artesanos lança a quantidade de vendas presenciais (a ZN só lança o
// valor) — controla tanto o campo extra do formulário quanto a coluna de
// "Total de Vendas (dia)" na tabela de lançamentos.
const UNIDADES_COM_QUANTIDADE_PRESENCIAL = ['Hamburgueria Artesanos'];

// --- ELEMENTOS DO DOM ---
const tabButtons = document.querySelectorAll('.tab-btn');
const btnWhatsApp = document.getElementById('btn-whatsapp');
const periodSelect = document.getElementById('period-select');
const formPresencial = document.getElementById('form-presencial');
const presencialDiaInput = document.getElementById('presencial-dia');
const presencialValorInput = document.getElementById('presencial-valor');
const presencialQuantidadeInput = document.getElementById('presencial-quantidade');
const presencialQuantidadeField = document.getElementById('presencial-quantidade-field');
const presencialThTotal = document.getElementById('presencial-th-total');
const formHistoricoFiltro = document.getElementById('form-historico-filtro');
const historicoInicioInput = document.getElementById('historico-inicio');
const historicoFimInput = document.getElementById('historico-fim');
const btnLimparFiltroHistorico = document.getElementById('btn-limpar-filtro-historico');

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
        return `
          <tr class="${classeGrupo}${inicioDeGrupo ? ' inicio-grupo-dia' : ''}">
            <td class="font-bold dia-com-semana">
              <span class="dia-data">${item.dia}</span>
              <span class="dia-semana-badge">${item.diaSemana}</span>
            </td>
            <td>${item.unidade}</td>
            <td>${item.pedidos}</td>
            <td>R$ ${item.ticket}</td>
            <td class="font-bold">R$ ${item.faturamento}</td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="5" class="panel-subtitle">Nenhum dia encontrado nesse filtro.</td></tr>`;
}

if (formHistoricoFiltro) {
  formHistoricoFiltro.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const inicio = historicoInicioInput.value;
    const fim = historicoFimInput.value;
    if (!inicio || !fim) return;

    try {
      const resposta = await fetch(
        `http://127.0.0.1:5000/api/historico-diario?unidade=${encodeURIComponent(currentTab)}&inicio=${inicio}&fim=${fim}`
      );
      if (!resposta.ok) {
        const erroDados = await resposta.json().catch(() => ({}));
        throw new Error(erroDados.erro || `Erro no servidor Flask: ${resposta.status}`);
      }
      const dados = await resposta.json();
      filtroHistoricoAtivo = true;
      ultimoDiarioFiltrado = dados.diario || [];
      renderHistoricoDiario(ultimoDiarioFiltrado);
    } catch (erro) {
      console.error('Falha ao filtrar histórico diário:', erro);
      alert('Não foi possível aplicar o filtro. Confira se o Flask está rodando.');
    }
  });
}

if (btnLimparFiltroHistorico) {
  btnLimparFiltroHistorico.addEventListener('click', () => {
    filtroHistoricoAtivo = false;
    ultimoDiarioFiltrado = [];
    historicoInicioInput.value = '';
    historicoFimInput.value = '';
    const data = dashboardData[currentTab];
    renderHistoricoDiario(data ? (data.diario || []) : []);
  });
}

// --- RENDERIZAR TELA ---
function updateDashboard(tabKey) {
  currentTab = tabKey;
  const data = dashboardData[tabKey];

  // Trocar de aba limpa o filtro de data do Histórico Diário — ele foi
  // buscado pra uma unidade específica e não faz sentido continuar mostrado
  // se o usuário for pra outra aba.
  if (filtroHistoricoAtivo) {
    filtroHistoricoAtivo = false;
    ultimoDiarioFiltrado = [];
    if (historicoInicioInput) historicoInicioInput.value = '';
    if (historicoFimInput) historicoFimInput.value = '';
  }

  const canalDataLabel = document.getElementById('canal-data-label');
  if (canalDataLabel) {
    canalDataLabel.textContent = data.canalDataLabel || '--/--/----';
  }

  // "Destaque Operacional" só faz sentido comparando lojas — não aparece na
  // Visão Geral, só nas abas de cada loja.
  const cardDestaque = document.getElementById('card-destaque-operacional');
  if (cardDestaque) {
    cardDestaque.style.display = tabKey === 'geral' ? 'none' : '';
  }

  // "Vendas Presenciais" só existe nas lojas que não têm 100% do faturamento
  // capturado pela Cardápio Web.
  const painelPresencial = document.getElementById('panel-vendas-presenciais');
  if (painelPresencial) {
    const temPresencial = UNIDADES_COM_PRESENCIAL.includes(tabKey);
    painelPresencial.style.display = temPresencial ? '' : 'none';

    // Só o Artesanos lança quantidade de vendas presenciais — a ZN fica só
    // com o valor, sem o campo extra e sem a coluna de total do dia.
    const temQuantidade = UNIDADES_COM_QUANTIDADE_PRESENCIAL.includes(tabKey);
    if (presencialQuantidadeField) presencialQuantidadeField.style.display = temQuantidade ? '' : 'none';
    if (presencialThTotal) presencialThTotal.style.display = temQuantidade ? '' : 'none';

    if (temPresencial) {
      carregarPresencial(tabKey);
    }
  }

  // Atualiza Valores nos Cards
  document.getElementById('val-faturamento').textContent = `R$ ${data.faturamento}`;
  document.getElementById('val-pedidos').textContent = data.pedidos;
  document.getElementById('val-ticket').textContent = `R$ ${data.ticket}`;
  document.getElementById('val-destaque').textContent = data.destaque;

  // Em todas as abas, os 3 primeiros cards mostram só o dia anterior (não o
  // período do filtro) — o texto abaixo do trend deixa isso claro.
  const textoComparacao = `vs. dia anterior (${data.canalDataLabel || ''})`;

  // Atualiza Trends
  renderTrend('trend-faturamento', data.faturamentoTrend, data.faturamentoUp, textoComparacao);
  renderTrend('trend-pedidos', data.pedidosTrend, data.pedidosUp, textoComparacao);
  renderTrend('trend-ticket', data.ticketTrend, data.ticketUp, textoComparacao);

  // Renderiza Histórico Diário (respeitando o filtro de datas, se houver um ativo)
  renderHistoricoDiario(filtroHistoricoAtivo ? ultimoDiarioFiltrado : (data.diario || []));

  // Renderiza Análise de Pedidos por Canal de Vendas (gráfico de rosca + tabela)
  renderCanalAnalysis(data.canais || []);

  // Re-inicializa ícones do Lucide após re-renderizar HTML
  lucide.createIcons();
}

// Gráfico de rosca + tabela de canais, no mesmo formato do painel da Cardápio Web
function renderCanalAnalysis(canais) {
  const canalTableBody = document.getElementById('canal-table-body');
  const canvas = document.getElementById('canalChart');
  if (!canalTableBody || !canvas) return;

  if (canalChartInstance) {
    canalChartInstance.destroy();
    canalChartInstance = null;
  }

  if (!canais.length) {
    canalTableBody.innerHTML = `<tr><td colspan="4" class="panel-subtitle">Nenhum dado de canal nesse período.</td></tr>`;
    return;
  }

  canalTableBody.innerHTML = canais.map((c, i) => `
    <tr>
      <td>
        <span class="canal-nome">
          <span class="canal-dot" style="background-color: ${CORES_CANAL[i % CORES_CANAL.length]};"></span>
          ${c.canal}
        </span>
      </td>
      <td class="font-bold">R$ ${c.faturamento}</td>
      <td>${c.pedidos}</td>
      <td>R$ ${c.ticket}</td>
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
function renderTrend(elementId, trendValue, isUp, textoComparacao = 'vs. período anterior') {
  const container = document.getElementById(elementId);
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
if (btnWhatsApp) {
  btnWhatsApp.addEventListener('click', () => {
    const data = dashboardData[currentTab];
    if (!data) return;
    const period = periodSelect ? periodSelect.value : '';

    let message = `📊 *RELATÓRIO ADMFOOD - ${data.title.toUpperCase()}*\n`;
    message += `📅 *Período:* ${period}\n\n`;
    message += `💰 *Faturamento:* R$ ${data.faturamento}\n`;
    message += `📦 *Total de Pedidos:* ${data.pedidos}\n`;
    message += `🎯 *Ticket Médio:* R$ ${data.ticket}\n`;
    message += `🏆 *Destaque:* ${data.destaque}\n\n`;

    if (currentTab === 'geral') {
      message += `--- *Detalhamento por Loja* ---\n`;
      data.stores.forEach(store => {
        message += `• *${store.name}:* R$ ${store.faturamento} (${store.pedidos} pedidos)\n`;
      });
    }

    message += `\n_Enviado via AdmFood Analytics_`;

    const encodedUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(encodedUrl, '_blank');
  });
}

// --- CARREGA OS DADOS REAIS DE INSIGHTS (BACKEND FLASK -> CACHE CARDÁPIO WEB) ---
async function carregarInsights(periodo) {
  const canalTableBody = document.getElementById('canal-table-body');
  if (canalTableBody) {
    canalTableBody.innerHTML = `<tr><td colspan="4" class="panel-subtitle">Carregando dados...</td></tr>`;
  }

  try {
    const resposta = await fetch(`http://127.0.0.1:5000/api/insights?periodo=${encodeURIComponent(periodo)}`);
    if (!resposta.ok) {
      throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    }
    dashboardData = await resposta.json();
    updateDashboard(dashboardData[currentTab] ? currentTab : 'geral');
  } catch (erro) {
    console.error('Falha ao carregar insights:', erro);
    if (canalTableBody) {
      canalTableBody.innerHTML = `<tr><td colspan="4" style="color: #ef4444;">Não foi possível carregar os dados. Confira se o Flask está rodando e se a sincronização já rodou pelo menos uma vez (python sincronizar.py).</td></tr>`;
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
    const resposta = await fetch(`http://127.0.0.1:5000/api/venda-presencial?unidade=${encodeURIComponent(unidade)}`);
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    const lancamentos = dados.lancamentos || [];
    tbody.innerHTML = lancamentos.length
      ? lancamentos.map(l => `
          <tr>
            <td>${l.dia}</td>
            <td class="font-bold">R$ ${l.valor}</td>
            ${temQuantidade ? `<td class="font-bold">R$ ${l.totalDia}</td>` : ''}
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
          `http://127.0.0.1:5000/api/venda-presencial?unidade=${encodeURIComponent(currentTab)}&dia=${diaIso}`,
          { method: 'DELETE' }
        );
        if (!resposta.ok) {
          const erroDados = await resposta.json().catch(() => ({}));
          throw new Error(erroDados.erro || `Erro no servidor Flask: ${resposta.status}`);
        }
        if (presencialEditandoDiaOriginal === diaIso) cancelarEdicaoPresencial();
        await carregarPresencial(currentTab);
        await carregarInsights(periodSelect ? periodSelect.value : 'Últimos 30 dias');
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
          `http://127.0.0.1:5000/api/venda-presencial?unidade=${encodeURIComponent(currentTab)}&dia=${presencialEditandoDiaOriginal}`,
          { method: 'DELETE' }
        );
      }

      const resposta = await fetch('http://127.0.0.1:5000/api/venda-presencial', {
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
      await carregarInsights(periodSelect ? periodSelect.value : 'Últimos 30 dias');
    } catch (erro) {
      console.error('Falha ao salvar venda presencial:', erro);
      alert('Não foi possível salvar o lançamento presencial. Confira se o Flask está rodando.');
    }
  });
}

// Só roda na página de Insights (identificada pela presença das abas)
if (tabButtons.length > 0 && document.getElementById('val-faturamento')) {
  carregarInsights(periodSelect ? periodSelect.value : '30d');

  if (periodSelect) {
    periodSelect.addEventListener('change', () => {
      carregarInsights(periodSelect.value);
    });
  }
}


// ==============================================================================
// FUNÇÕES AUXILIARES E INTEGRAÇÃO DE APIs (ESCOPO GLOBAL)
// ==============================================================================

/**
 * Consulta o backend Flask para obter o faturamento de ontem da rede
 */
async function carregarDadosLojas() {
  const container = document.getElementById('container-lojas');
  const totalRedeElem = document.getElementById('total-rede-valor');

  if (!container) return;

  container.innerHTML = `<p class="text-muted" style="padding: 12px;">Sincronizando com o Cardápio Web via Flask...</p>`;

  try {
    const response = await fetch('http://127.0.0.1:5000/api/faturamento-ontem');

    if (!response.ok) {
      throw new Error(`Erro no servidor Flask: ${response.status}`);
    }

    const dados = await response.json();

    if (totalRedeElem) {
      totalRedeElem.textContent = dados.total_rede.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    }

    container.innerHTML = dados.lojas.map(loja => {
      if (!loja.sucesso) {
        return `
          <div class="store-card">
            <span class="card-subtitle">UNIDADE</span>
            <h4 class="store-name">${loja.nome}</h4>
            <p style="color: #ef4444; font-size: 0.8rem; margin-top: 8px;">Erro ao carregar dados</p>
          </div>
        `;
      }

      const valorFormatado = loja.total.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });

      return `
        <div class="store-card">
          <span class="card-subtitle">UNIDADE</span>
          <h4 class="store-name">${loja.nome}</h4>
          <div class="store-value">${valorFormatado}</div>
          <span class="badge-pill pos">
            <i data-lucide="trending-up"></i>
            Atualizado
          </span>
        </div>
      `;
    }).join('');

    // Reativa os ícones da biblioteca Lucide nos novos elementos criados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

  } catch (error) {
    console.error('Falha ao conectar com o backend Flask:', error);
    container.innerHTML = `<p style="color: #ef4444; padding: 12px;">Não foi possível carregar o status das lojas. Certifique-se de que o Flask está rodando.</p>`;
  }
}

// REDIRECIONAMENTOS E LOGIN
function redirecionarLogin() {
  window.location.href = "login.html";
}

function redirecionarRegistro() {
  window.location.href = "registro.html";
}

function realizarLogin(event) {
  event.preventDefault();
  const email = document.getElementById("email")?.value;
  console.log("Tentando logar com:", email);
  window.location.href = "index.html";
}

function loginGoogle() {
  alert("Redirecionando para autenticação do Google...");
}

// Elementos do Kanban
  const cards = document.querySelectorAll(".task-card");
  const columns = document.querySelectorAll(".kanban-column");

  // 1. CONFIGURA OS CARDS PARA SEREM ARRASTÁVEIS
  cards.forEach((card) => {
    // Quando começa a arrastar
    card.addEventListener("dragstart", (e) => {
      card.classList.add("dragging");
      e.dataTransfer.setData("text/plain", card.id);
    });

    // Quando termina de arrastar
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      atualizarContadores(); // Atualiza a contagem dos cards
    });
  });

  // 2. CONFIGURA AS COLUNAS PARA RECEBEREM OS CARDS
  columns.forEach((column) => {
    const taskList = column.querySelector(".task-list");

    // Permite que o elemento seja solto na coluna
    column.addEventListener("dragover", (e) => {
      e.preventDefault(); // Necessário para permitir o "drop"
      column.classList.add("drag-over");
    });

    // Quando o card sai da área da coluna
    column.addEventListener("dragleave", () => {
      column.classList.remove("drag-over");
    });

    // Quando o card é solto na coluna
    column.addEventListener("drop", (e) => {
      e.preventDefault();
      column.classList.remove("drag-over");

      const cardId = e.dataTransfer.getData("text/plain");
      const draggingCard = document.getElementById(cardId);

      if (draggingCard && taskList) {
        taskList.appendChild(draggingCard);
        atualizarContadores();
      }
    });
  });

  // 3. FUNÇÃO PARA ATUALIZAR O NÚMERO DE TAREFAS EM CADA COLUNA
  function atualizarContadores() {
    columns.forEach((column) => {
      const countSpan = column.querySelector(".task-count");
      const taskCount = column.querySelectorAll(".task-card").length;
      if (countSpan) {
        countSpan.textContent = taskCount;
      }
    });
  };

  // Contador global para gerar IDs únicos para as tarefas
let taskIdCounter = 5;

// Função chamada ao clicar no botão "+ Nova Tarefa"
function criarNovaTarefa() {
  const modal = document.getElementById("modalTarefa");
  if (modal) modal.style.display = "flex";
}

// Função para fechar o modal
function fecharModal() {
  const modal = document.getElementById("modalTarefa");
  if (modal) {
    modal.style.display = "none";
    document.getElementById("formNovaTarefa").reset();
  }
}

// Função enviada ao submeter o formulário
function salvarNovaTarefa(event) {
  event.preventDefault();

  const titulo = document.getElementById("tituloTarefa").value;
  const prioridade = document.getElementById("prioridadeTarefa").value;
  const categoria = document.getElementById("categoriaTarefa").value; // 👈 Pega a categoria selecionada
  const descricao = document.getElementById("descricaoTarefa").value;

  // Encontra a primeira coluna ("A Fazer")
  const colunaTodo = document.querySelector('.kanban-column[data-status="todo"] .task-list');

  if (colunaTodo) {
    const labelPrioridade = prioridade === 'alta' ? 'Alta' : prioridade === 'media' ? 'Média' : 'Baixa';

    const newCard = document.createElement("div");
    newCard.className = "task-card";
    newCard.setAttribute("draggable", "true");
    newCard.id = `task-${taskIdCounter++}`;

    newCard.innerHTML = `
      <div class="card-top">
        <h4 class="task-title">${titulo}</h4>
        <span class="badge priority-${prioridade}">${labelPrioridade}</span>
      </div>
      <p style="font-size: 0.8rem; color: #52525b;">${descricao}</p>
      <div class="card-bottom">
        <span class="task-meta">${categoria}</span> <!-- 👈 Usa a categoria inserida -->
        <span class="task-date">Hoje</span>
      </div>
    `;

    // Reativa o drag and drop no novo card
    newCard.addEventListener("dragstart", (e) => {
      newCard.classList.add("dragging");
      e.dataTransfer.setData("text/plain", newCard.id);
    });

    newCard.addEventListener("dragend", () => {
      newCard.classList.remove("dragging");
      if (typeof atualizarContadores === "function") atualizarContadores();
    });

    colunaTodo.appendChild(newCard);

    if (typeof atualizarContadores === "function") atualizarContadores();
  }

  fecharModal();
}

    // Ativa o Drag and Drop no novo card
    newCard.addEventListener("dragstart", (e) => {
      newCard.classList.add("dragging");
      e.dataTransfer.setData("text/plain", newCard.id);
    });

    newCard.addEventListener("dragend", () => {
      newCard.classList.remove("dragging");
      if (typeof atualizarContadores === "function") atualizarContadores();
    });

    // Adiciona na coluna "A Fazer"
    colunaTodo.appendChild(newCard);

    // Atualiza os contadores das colunas
    if (typeof atualizarContadores === "function") atualizarContadores();

  fecharModal();