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
  if (document.getElementById('estoque-loja-select')) {
    const seletorLoja = document.getElementById('estoque-loja-select');
    const trigger = document.getElementById('estoque-loja-trigger');
    const menu = document.getElementById('estoque-loja-menu');

    trigger.addEventListener('click', () => {
      seletorLoja.classList.toggle('aberto');
    });
    document.addEventListener('click', (evento) => {
      if (!seletorLoja.contains(evento.target)) seletorLoja.classList.remove('aberto');
    });

    menu.querySelectorAll('.loja-select-item').forEach((item) => {
      item.addEventListener('click', () => {
        menu.querySelectorAll('.loja-select-item').forEach((i) => i.classList.remove('active'));
        item.classList.add('active');
        trigger.querySelector('.loja-select-label').textContent = item.querySelector('span').textContent;
        const badgeItem = item.querySelector('.tab-badge');
        const badgeTrigger = document.getElementById('estoque-loja-trigger-badge');
        badgeTrigger.style.display = badgeItem ? '' : 'none';
        if (badgeItem) badgeTrigger.textContent = badgeItem.textContent;
        estoqueTabAtual = item.dataset.tab;
        seletorLoja.classList.remove('aberto');
        renderEstoqueTab();
      });
    });

    document.getElementById('estoque-busca')?.addEventListener('input', () => renderEstoqueTab());
    carregarInsumos();
    carregarLotesVencendo();
    carregarDatasEspeciais();
    carregarFornecedores();
  }

  // 4.098 TELA DE FORNECEDORES
  if (document.getElementById('fornecedores-tabela-body')) {
    document.getElementById('fornecedores-busca')?.addEventListener('input', () => renderFornecedoresTabela());
    carregarFornecedores();
  }

  // 4.099 TELA DE COTAÇÕES
  if (document.getElementById('cotacoes-tabela-body')) {
    const abrirId = new URLSearchParams(location.search).get('abrir');
    if (abrirId) {
      abrirCotacaoDetalhe(parseInt(abrirId, 10));
    } else {
      carregarCotacoes();
    }

    document.querySelectorAll('#cotacoes-tabs-bar .tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#cotacoes-tabs-bar .tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('cotacoes-painel-cotacoes').style.display = btn.dataset.tab === 'cotacoes' ? '' : 'none';
        document.getElementById('cotacoes-painel-compras').style.display = btn.dataset.tab === 'compras' ? '' : 'none';
        if (btn.dataset.tab === 'compras') carregarHistoricoCompras();
      });
    });
  }

  // 4.0995 TELA DE CONTAGENS (admin)
  if (document.getElementById('contagens-tabela-body')) {
    carregarContagens();
    carregarRequisicoes();
  }

  // 4.0997 TELA DE PEDIDOS (admin)
  if (document.getElementById('pedidos-tabela-body')) {
    carregarPedidos();
  }

  // 4.0997b TELA DE RECEBIMENTOS (qualquer pessoa logada, não só admin)
  if (document.getElementById('recebimentos-tabela-body')) {
    carregarRecebimentos();
  }

  // 4.0996 TELA PÚBLICA DE PREENCHIMENTO DE CONTAGEM (sem login, por token)
  if (document.getElementById('form-contagem-publica')) {
    inicializarContagemPublica();
  }

  // 4.0996b TELA PÚBLICA DE PREENCHIMENTO DE COTAÇÃO (sem login, por token)
  if (document.getElementById('form-cotacao-publica')) {
    inicializarPreencherCotacao();
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
  // A 6ª coluna (Ações) não cabe espremida do lado do gráfico — ver
  // .tabela-com-acoes em insight.css. Sem isso o botão de editar existe
  // no DOM mas fica atrás de uma rolagem horizontal invisível na prática.
  document.querySelector('.canal-table-wrapper')?.classList.toggle('tabela-com-acoes', podeEditar);

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

        // Lista quantas ocorrências desse dia da semana realmente já
        // passaram no mês (4 ou 5, dependendo do calendário) — nada de
        // travar em 4, senão o último sábado/domingo de um mês com 5 some
        // do relatório.
        bloco += `\n\n`;
        bloco += ocorrencias
          .map((ocorrencia, i) => `- ${i + 1} ${diaSemana} do mês: R$ ${ocorrencia.faturamento}`)
          .join('\n');
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
// Cotação é semanal (ver processo real da VMarket na documentação, seção 9)
// — quantidade ideal cobre 7 dias de consumo médio a partir daqui.
const DIAS_COBERTURA_IDEAL = 7;
const STATUS_LABEL_ESTOQUE = { ok: 'OK', baixo: 'Baixo', critico: 'Crítico' };
const STATUS_CLASSE_BADGE_ESTOQUE = { ok: 'pos', baixo: 'neu-orange', critico: 'neg' };
const STATUS_CLASSE_BARRA_ESTOQUE = { ok: 'bar-green', baixo: 'bar-orange', critico: 'bar-red' };

let estoqueInsumos = [];
let estoqueTabAtual = 'geral';
let estoqueEditandoContexto = null; // { insumoId, loja }
let estoqueConsumoMedio = {}; // { [insumoId]: { [loja]: consumoMedioDiario } } — média dos últimos 30 dias
let estoqueConsumoRecente = {}; // { [insumoId]: { [loja]: consumoMedioDiario } } — média dos últimos 14 dias, pra enxergar tendência
let estoqueAjustesIdeal = {}; // { [insumoId]: { [loja]: valorAjustado } }
let estoqueMultiplicadorEspecial = {}; // { [loja]: multiplicador } — 1 = nenhuma data especial ativa

// Janela "recente" pra comparar com a média de 30 dias e detectar
// tendência de alta/queda — ver _sugestaoTendenciaParaLoja.
function _janelaConsumoRecente() {
  const fim = new Date();
  const inicio = new Date(fim);
  inicio.setDate(fim.getDate() - 13);
  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

async function carregarInsumos() {
  try {
    const { inicio: inicioRecente, fim: fimRecente } = _janelaConsumoRecente();
    const [respostaInsumos, respostaConsumo, respostaConsumoRecente, ...respostasAjustes] = await Promise.all([
      fetch('/api/insumos'),
      fetch('/api/insumos/consumo-medio'),
      fetch(`/api/insumos/consumo-medio?inicio=${inicioRecente}&fim=${fimRecente}`),
      ...LOJAS_ESTOQUE.map((loja) => fetch(`/api/insumos/ajustes-quantidade-ideal?loja=${encodeURIComponent(loja)}`)),
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

    estoqueConsumoRecente = {};
    if (respostaConsumoRecente.ok) {
      const dadosConsumoRecente = await respostaConsumoRecente.json();
      (dadosConsumoRecente.consumo || []).forEach((linha) => {
        const porLoja = estoqueConsumoRecente[linha.insumoId] || (estoqueConsumoRecente[linha.insumoId] = {});
        porLoja[linha.unidade] = linha.consumoMedioDiario;
      });
    }

    estoqueAjustesIdeal = {};
    estoqueMultiplicadorEspecial = {};
    for (let i = 0; i < LOJAS_ESTOQUE.length; i++) {
      const resposta = respostasAjustes[i];
      if (!resposta.ok) continue;
      const loja = LOJAS_ESTOQUE[i];
      const dadosAjuste = await resposta.json();
      (dadosAjuste.ajustes || []).forEach((a) => {
        const porLoja = estoqueAjustesIdeal[a.insumoId] || (estoqueAjustesIdeal[a.insumoId] = {});
        porLoja[loja] = a.valorAjustado;
      });
      estoqueMultiplicadorEspecial[loja] = dadosAjuste.multiplicadorEspecial || 1;
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

// Quantidade ideal efetiva de uma loja: o ajuste manual quando existir,
// senão o calculado (consumo médio × DIAS_COBERTURA_IDEAL). null = nenhum
// dos dois disponível ainda.
function _quantidadeIdealParaLoja(insumoId, loja) {
  const ajuste = estoqueAjustesIdeal[insumoId]?.[loja];
  if (ajuste !== undefined) return { valor: ajuste, ajustado: true };
  const consumo = _consumoMedioParaLinha(insumoId, loja);
  if (consumo === null) return { valor: null, ajustado: false };
  const multiplicador = estoqueMultiplicadorEspecial[loja] || 1;
  return { valor: Math.round(consumo * DIAS_COBERTURA_IDEAL * multiplicador * 100) / 100, ajustado: false };
}

// "Geral" soma a quantidade ideal efetiva (ajuste ou calculada) de cada
// loja que tiver dado — não dá pra só somar consumo médio bruto e
// multiplicar uma vez, porque cada loja pode ter um ajuste diferente.
function _quantidadeIdealParaLinha(insumoId, loja) {
  if (loja) return _quantidadeIdealParaLoja(insumoId, loja);
  let soma = 0;
  let temAlgum = false;
  let algumAjustado = false;
  LOJAS_ESTOQUE.forEach((l) => {
    const { valor, ajustado } = _quantidadeIdealParaLoja(insumoId, l);
    if (valor !== null) {
      soma += valor;
      temAlgum = true;
      if (ajustado) algumAjustado = true;
    }
  });
  return { valor: temAlgum ? Math.round(soma * 100) / 100 : null, ajustado: algumAjustado };
}

// Sugestão por tendência (pedido do chefe da Julia: além da quantidade
// ideal fixa, algo que "estude o comportamento das últimas semanas" e
// avise quando estiver fugindo do padrão). Compara o consumo médio dos
// últimos 14 dias com a média de 30 dias já usada na quantidade ideal —
// sem chamada de IA nenhuma, só estatística simples. Só faz sentido por
// loja individual (tendência somada de 4 lojas diferentes confunde mais
// que ajuda), e só aparece quando o desvio é grande o suficiente pra
// valer a pena olhar. Puramente informativo: não entra no cálculo de
// déficit/pedido em nenhum lugar, só chama atenção pra ela decidir.
const LIMIAR_DESVIO_TENDENCIA = 0.15; // 15% de diferença pra começar a avisar

function _sugestaoTendenciaParaLoja(insumoId, loja) {
  const recente = estoqueConsumoRecente[insumoId]?.[loja];
  const base = estoqueConsumoMedio[insumoId]?.[loja];
  if (recente === undefined || !base) return null;
  const desvio = (recente - base) / base;
  if (Math.abs(desvio) < LIMIAR_DESVIO_TENDENCIA) return null;
  const multiplicador = estoqueMultiplicadorEspecial[loja] || 1;
  const valor = Math.round(recente * DIAS_COBERTURA_IDEAL * multiplicador * 100) / 100;
  return { valor, desvioPercentual: Math.round(desvio * 100), subindo: desvio > 0 };
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
    return estoqueInsumos
      .filter((insumo) => LOJAS_ESTOQUE.some((loja) => insumo.porLoja[loja]?.aplica))
      .map((insumo) => {
      let quantidadeAtual = 0;
      let estoqueMinimo = 0;
      LOJAS_ESTOQUE.forEach((loja) => {
        const dadosLoja = insumo.porLoja[loja];
        if (dadosLoja?.aplica) {
          quantidadeAtual += dadosLoja.quantidadeAtual;
          estoqueMinimo += dadosLoja.estoqueMinimo;
        }
      });
      const ideal = _quantidadeIdealParaLinha(insumo.id, null);
      return {
        insumo,
        loja: null,
        dados: {
          quantidadeAtual,
          estoqueMinimo,
          status: _statusEstoqueClient(quantidadeAtual, estoqueMinimo),
          consumoMedio: _consumoMedioParaLinha(insumo.id, null),
          quantidadeIdeal: ideal.valor,
          quantidadeIdealAjustada: ideal.ajustado,
        },
      };
    });
  }

  return estoqueInsumos
    .filter((insumo) => insumo.porLoja[tab]?.aplica)
    .map((insumo) => {
      const ideal = _quantidadeIdealParaLinha(insumo.id, tab);
      return {
        insumo,
        loja: tab,
        dados: {
          ...insumo.porLoja[tab],
          consumoMedio: _consumoMedioParaLinha(insumo.id, tab),
          quantidadeIdeal: ideal.valor,
          quantidadeIdealAjustada: ideal.ajustado,
        },
      };
    });
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

  const btnCopiarIdeal = document.getElementById('btn-copiar-ideal');
  if (btnCopiarIdeal) btnCopiarIdeal.style.display = (isAdmin && !ehGeral) ? '' : 'none';

  const btnAjusteLote = document.getElementById('btn-ajuste-lote');
  if (btnAjusteLote) btnAjusteLote.style.display = (isAdmin && !ehGeral) ? '' : 'none';

  const btnInsumosLoja = document.getElementById('btn-insumos-loja');
  if (btnInsumosLoja) btnInsumosLoja.style.display = (isAdmin && !ehGeral) ? '' : 'none';

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
    const colspan = 7 + (isAdmin ? 1 : 0);
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="panel-subtitle">Nenhum insumo encontrado.</td></tr>`;
    return;
  }

  linhas.sort((a, b) => (b.insumo.favorito - a.insumo.favorito) || a.insumo.nome.localeCompare(b.insumo.nome));

  tbody.innerHTML = linhas.map(({ insumo, loja, dados }) => {
    const percentual = dados.estoqueMinimo > 0
      ? Math.min(100, Math.round((dados.quantidadeAtual / (dados.estoqueMinimo * 1.5)) * 100))
      : 100;
    const quantidadeIdeal = dados.quantidadeIdeal;
    const sugestaoCompra = quantidadeIdeal === null ? null : Math.max(0, Math.round((quantidadeIdeal - dados.quantidadeAtual) * 100) / 100);
    const tendencia = loja ? _sugestaoTendenciaParaLoja(insumo.id, loja) : null;
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
        <td ${quantidadeIdeal === null ? 'title="Sem dado suficiente — depende da Ficha Técnica do prato estar cadastrada e ter vendas registradas"' : ''}>
          ${quantidadeIdeal === null ? '<span class="text-muted">—</span>' : `
            <div class="qtd-ideal-cell">
              <span class="font-bold">${quantidadeIdeal} ${escaparHtml(insumo.unidadeMedida)}</span>
              ${dados.quantidadeIdealAjustada ? '<span class="badge-pill neu-orange" title="Ajustado manualmente">ajustado</span>' : ''}
              ${sugestaoCompra > 0 ? `<span class="badge-pill neg" title="Diferença entre a quantidade ideal e o estoque atual">comprar ${sugestaoCompra} ${escaparHtml(insumo.unidadeMedida)}</span>` : ''}
              ${tendencia ? `<span class="tendencia-texto" title="Consumo médio dos últimos 14 dias comparado com a média de 30 dias — não muda o cálculo de déficit, é só um alerta">${tendencia.subindo ? '↑' : '↓'} tendência: ${tendencia.valor} ${escaparHtml(insumo.unidadeMedida)} (${tendencia.subindo ? '+' : ''}${tendencia.desvioPercentual}%)</span>` : ''}
            </div>
          `}
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

// --- DATAS ESPECIAIS (feriado/evento marcado com antecedência — aumenta
// a quantidade ideal calculada enquanto a data cai nos próximos 7 dias;
// só admin, ver seção 9 "Quantidade ideal inteligente") ---
let datasEspeciaisLista = [];

async function carregarDatasEspeciais() {
  const card = document.getElementById('datas-especiais-card');
  if (!card) return;
  if (window.usuarioLogado?.papel !== 'admin') return;
  try {
    const resposta = await fetch('/api/datas-especiais');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    datasEspeciaisLista = dados.datasEspeciais || [];
    card.style.display = '';
    renderDatasEspeciais();
  } catch (erro) {
    console.error('Falha ao carregar datas especiais:', erro);
  }
}

function renderDatasEspeciais() {
  const tbody = document.getElementById('datas-especiais-tabela-body');
  if (!tbody) return;

  if (!datasEspeciaisLista.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="panel-subtitle">Nenhuma data especial cadastrada.</td></tr>`;
    return;
  }

  tbody.innerHTML = datasEspeciaisLista.map((d) => {
    const inicio = new Date(`${d.dataInicio}T00:00:00`).toLocaleDateString('pt-BR');
    const fim = new Date(`${d.dataFim}T00:00:00`).toLocaleDateString('pt-BR');
    const periodo = d.dataInicio === d.dataFim ? inicio : `${inicio} – ${fim}`;
    return `
      <tr>
        <td class="font-bold">${escaparHtml(d.descricao)}</td>
        <td class="text-muted">${periodo}</td>
        <td>${d.multiplicador}×</td>
        <td class="text-muted">${d.loja ? escaparHtml(d.loja) : 'Todas'}</td>
        <td class="acoes-linha">
          <button type="button" class="btn-acao-icone btn-excluir" data-acao="excluir-data-especial" data-id="${d.id}" title="Excluir">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-acao="excluir-data-especial"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir essa data especial?')) return;
      try {
        const resposta = await fetch(`/api/datas-especiais/${btn.dataset.id}`, { method: 'DELETE' });
        if (!resposta.ok) throw new Error('falha ao excluir');
        await carregarDatasEspeciais();
        await carregarInsumos();
      } catch (erro) {
        console.error('Falha ao excluir data especial:', erro);
        alert('Não foi possível excluir essa data especial.');
      }
    });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function abrirModalNovaDataEspecial() {
  document.getElementById('form-nova-data-especial').reset();
  document.getElementById('nova-data-especial-multiplicador').value = '1.5';
  const select = document.getElementById('nova-data-especial-loja');
  select.innerHTML = '<option value="">Todas as lojas</option>' +
    LOJAS_ESTOQUE.map((l) => `<option value="${escaparHtml(l)}">${escaparHtml(l)}</option>`).join('');
  document.getElementById('modal-nova-data-especial').style.display = 'flex';
}

function fecharModalNovaDataEspecial() {
  document.getElementById('modal-nova-data-especial').style.display = 'none';
}

document.getElementById('btn-nova-data-especial')?.addEventListener('click', abrirModalNovaDataEspecial);
document.getElementById('btn-nova-data-especial-fechar')?.addEventListener('click', fecharModalNovaDataEspecial);
document.getElementById('btn-nova-data-especial-cancelar')?.addEventListener('click', fecharModalNovaDataEspecial);

document.getElementById('form-nova-data-especial')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const corpo = {
    descricao: document.getElementById('nova-data-especial-descricao').value,
    dataInicio: document.getElementById('nova-data-especial-inicio').value,
    dataFim: document.getElementById('nova-data-especial-fim').value,
    multiplicador: parseFloat(document.getElementById('nova-data-especial-multiplicador').value),
    loja: document.getElementById('nova-data-especial-loja').value || null,
  };
  try {
    const resposta = await fetch('/api/datas-especiais', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao salvar');
    fecharModalNovaDataEspecial();
    await carregarDatasEspeciais();
    await carregarInsumos();
  } catch (erro) {
    console.error('Falha ao salvar data especial:', erro);
    alert(erro.message || 'Não foi possível salvar essa data especial.');
  }
});

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

async function carregarHistoricoCompras() {
  const container = document.getElementById('cotacoes-compras-lista');
  if (!container) return;
  container.innerHTML = `<p class="panel-subtitle">Carregando...</p>`;
  try {
    const resposta = await fetch('/api/cotacoes/historico');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    renderHistoricoCompras(dados.historico || []);
  } catch (erro) {
    console.error('Falha ao carregar histórico de compras:', erro);
    container.innerHTML = `<p class="panel-subtitle" style="color:#ef4444;">Não foi possível carregar o histórico. Confira se o Flask está rodando.</p>`;
  }
}

function renderHistoricoCompras(historico) {
  const container = document.getElementById('cotacoes-compras-lista');
  if (!container) return;

  if (!historico.length) {
    container.innerHTML = `<p class="panel-subtitle">Nenhuma cotação fechada ainda — feche uma cotação na aba "Cotações" pra ela aparecer aqui.</p>`;
    return;
  }

  container.innerHTML = historico.map((cotacao) => `
    <div class="chart-card">
      <div class="table-header-row">
        <div>
          <h3 class="table-title">${escaparHtml(cotacao.titulo)}</h3>
          <p class="table-subtitle">Fechada em ${new Date(cotacao.criadoEm).toLocaleDateString('pt-BR')}</p>
        </div>
      </div>
      ${cotacao.itens.length ? `
        <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Insumo</th>
              <th>Categoria</th>
              <th>Fornecedor vencedor</th>
              <th>Preço</th>
            </tr>
          </thead>
          <tbody>
            ${cotacao.itens.map(item => `
              <tr>
                <td class="font-bold">${escaparHtml(item.nome)}</td>
                <td class="text-muted">${escaparHtml(item.categoria)}</td>
                <td>${escaparHtml(item.fornecedorNome)}</td>
                <td>R$ ${item.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        </div>
      ` : `<p class="panel-subtitle">Nenhum vencedor foi escolhido nessa cotação antes de fechar.</p>`}
    </div>
  `).join('');
}

async function abrirCotacaoDetalhe(cotacaoId) {
  cotacaoAtualId = cotacaoId;
  destacarMelhoresPrecosAtivo = false;
  document.getElementById('btn-cotacao-destacar-melhores')?.classList.remove('ativo');
  const buscaComparacao = document.getElementById('cotacao-comparacao-busca');
  if (buscaComparacao) buscaComparacao.value = '';
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

    const btnGerarPedidos = document.getElementById('btn-cotacao-gerar-pedidos');
    if (btnGerarPedidos) {
      btnGerarPedidos.style.display = isAdmin && (dados.itens || []).length > 0 ? '' : 'none';
    }

    const btnConvidar = document.getElementById('btn-cotacao-convidar-fornecedores');
    const convitesCard = document.getElementById('cotacao-convites-card');
    const temItens = (dados.itens || []).length > 0;
    if (btnConvidar) btnConvidar.style.display = isAdmin && temItens ? '' : 'none';
    if (temItens && isAdmin) {
      await carregarConvitesCotacao();
    } else if (convitesCard) {
      convitesCard.style.display = 'none';
    }

    renderCotacaoComparacao(dados.grupos, isAdmin, dados.itens || []);
  } catch (erro) {
    console.error('Falha ao carregar cotação:', erro);
    alert('Não foi possível carregar a cotação.');
  }
}

async function carregarConvitesCotacao() {
  const card = document.getElementById('cotacao-convites-card');
  if (!card) return;
  try {
    const resposta = await fetch(`/api/cotacoes/${cotacaoAtualId}/convites`);
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    renderConvitesCotacao(dados.convites || []);
  } catch (erro) {
    console.error('Falha ao carregar convites:', erro);
  }
}

const STATUS_LABEL_CONVITE = { aberta: 'Aguardando resposta', respondida: 'Respondido' };

function renderConvitesCotacao(convites) {
  const card = document.getElementById('cotacao-convites-card');
  const tbody = document.getElementById('cotacao-convites-tabela-body');
  if (!card || !tbody) return;

  card.style.display = convites.length ? '' : 'none';
  if (!convites.length) return;

  tbody.innerHTML = convites.map((c) => {
    const expirado = c.status === 'aberta' && new Date(c.prazoValidade) < new Date();
    const statusTexto = expirado ? 'Prazo vencido' : STATUS_LABEL_CONVITE[c.status];
    const statusClasse = c.status === 'respondida' ? 'pos' : (expirado ? 'neg' : 'neu-orange');
    const link = `${location.origin}/preencher_cotacao.html?token=${c.token}`;
    return `
      <tr>
        <td class="font-bold">${escaparHtml(c.fornecedorNome)}</td>
        <td><span class="badge-pill ${statusClasse}">${statusTexto}</span></td>
        <td class="text-muted">${new Date(c.prazoValidade).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
        <td class="acoes-linha">
          <button type="button" class="btn-secondary-sm" data-acao="copiar-link-convite" data-link="${escaparHtml(link)}">
            <i data-lucide="copy"></i>
            Copiar link
          </button>
          ${c.status === 'respondida' ? `
            <button type="button" class="btn-secondary-sm" data-acao="reabrir-convite" data-id="${c.id}" title="Deixar o fornecedor corrigir o preço enviado">
              <i data-lucide="rotate-ccw"></i>
              Reabrir
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-acao="copiar-link-convite"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.link);
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = 'Copiado!';
        setTimeout(() => { btn.innerHTML = textoOriginal; if (typeof lucide !== 'undefined') lucide.createIcons(); }, 1500);
      } catch (erro) {
        console.error('Falha ao copiar link:', erro);
        alert(btn.dataset.link);
      }
    });
  });

  tbody.querySelectorAll('[data-acao="reabrir-convite"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Reabrir esse convite? O fornecedor vai poder preencher os preços de novo pelo mesmo link.')) return;
      try {
        const resposta = await fetch(`/api/cotacoes/convites/${btn.dataset.id}/reabrir`, { method: 'POST' });
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.erro || 'falha ao reabrir');
        await carregarConvitesCotacao();
      } catch (erro) {
        console.error('Falha ao reabrir convite:', erro);
        alert(erro.message || 'Não foi possível reabrir esse convite.');
      }
    });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

document.getElementById('btn-cotacao-convidar-fornecedores')?.addEventListener('click', () => {
  document.getElementById('convidar-fornecedores-prazo').value = '';
  document.getElementById('modal-convidar-fornecedores').style.display = 'flex';
});
document.getElementById('btn-convidar-fornecedores-fechar')?.addEventListener('click', () => {
  document.getElementById('modal-convidar-fornecedores').style.display = 'none';
});
document.getElementById('btn-convidar-fornecedores-cancelar')?.addEventListener('click', () => {
  document.getElementById('modal-convidar-fornecedores').style.display = 'none';
});

document.getElementById('form-convidar-fornecedores')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const prazoValidade = document.getElementById('convidar-fornecedores-prazo').value;
  try {
    const resposta = await fetch(`/api/cotacoes/${cotacaoAtualId}/convites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prazoValidade }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao enviar convites');
    document.getElementById('modal-convidar-fornecedores').style.display = 'none';
    alert(`${dados.convites.length} convite(s) enviado(s) — copie o link de cada fornecedor na tabela abaixo.`);
    await carregarConvitesCotacao();
  } catch (erro) {
    console.error('Falha ao convidar fornecedores:', erro);
    alert(erro.message || 'Não foi possível enviar os convites.');
  }
});

let cotacaoComparacaoDados = { grupos: [], isAdmin: false, itens: [] };
let destacarMelhoresPrecosAtivo = false;

function renderCotacaoComparacao(grupos, isAdmin, itens) {
  cotacaoComparacaoDados = { grupos, isAdmin, itens: itens || [] };
  _renderTabelaComparacaoCotacao();
}

function _iniciaisFornecedor(nome) {
  return nome.trim().split(/\s+/).slice(0, 2).map(parte => parte[0]).join('').toUpperCase();
}

function _renderTabelaComparacaoCotacao() {
  const { grupos, isAdmin, itens } = cotacaoComparacaoDados;
  const container = document.getElementById('cotacao-comparacao-lista');
  const buscaWrapper = document.getElementById('cotacao-comparacao-busca-wrapper');
  const btnDestacar = document.getElementById('btn-cotacao-destacar-melhores');
  if (!container) return;

  if (!grupos.length) {
    if (buscaWrapper) buscaWrapper.style.display = 'none';
    if (btnDestacar) btnDestacar.style.display = 'none';
    container.innerHTML = `<p class="panel-subtitle">Nenhum preço lançado ainda — use o formulário acima.</p>`;
    return;
  }
  if (buscaWrapper) buscaWrapper.style.display = '';
  if (btnDestacar) btnDestacar.style.display = '';

  const termo = (document.getElementById('cotacao-comparacao-busca')?.value || '').trim().toLowerCase();
  const gruposFiltrados = grupos.filter(g =>
    !termo || g.insumoNome.toLowerCase().includes(termo) || g.categoria.toLowerCase().includes(termo)
  );

  if (!gruposFiltrados.length) {
    container.innerHTML = `<p class="panel-subtitle">Nenhum insumo encontrado pra essa busca.</p>`;
    return;
  }

  const fornecedoresMap = new Map();
  grupos.forEach(g => g.precos.forEach(p => {
    if (!fornecedoresMap.has(p.fornecedorId)) fornecedoresMap.set(p.fornecedorId, p.fornecedorNome);
  }));
  const fornecedores = [...fornecedoresMap.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const itensPorInsumo = {};
  itens.forEach(item => { itensPorInsumo[item.insumoId] = item; });

  const theadFornecedores = fornecedores.map(f => `
    <th class="th-comparacao-fornecedor">
      <div class="comparacao-fornecedor-cabecalho">
        <span class="avatar avatar-sm">${escaparHtml(_iniciaisFornecedor(f.nome))}</span>
        <span>${escaparHtml(f.nome)}</span>
      </div>
    </th>
  `).join('');

  const linhas = gruposFiltrados.map(grupo => {
    const item = itensPorInsumo[grupo.insumoId];
    const precoPorFornecedor = new Map(grupo.precos.map(p => [p.fornecedorId, p]));
    const menorPreco = Math.min(...grupo.precos.map(p => p.preco));

    const celulas = fornecedores.map(f => {
      const preco = precoPorFornecedor.get(f.id);
      if (!preco) {
        return `<td class="td-comparacao-preco td-sem-preco">—</td>`;
      }
      const ehMelhor = destacarMelhoresPrecosAtivo && preco.preco === menorPreco;
      const classes = ['td-comparacao-preco'];
      if (preco.selecionado) classes.push('selecionado');
      if (ehMelhor) classes.push('melhor-preco');
      return `
        <td class="${classes.join(' ')}" ${isAdmin ? `data-acao="selecionar-preco" data-id="${preco.id}" title="Marcar como vencedor"` : ''}>
          <div class="comparacao-preco-conteudo">
            ${preco.selecionado ? '<i data-lucide="check-circle" class="icone-preco-selecionado"></i>' : ''}
            <span class="comparacao-preco-valor">R$ ${preco.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
          ${ehMelhor ? '<span class="badge-pill pos badge-melhor-preco">★ Melhor preço</span>' : ''}
          ${isAdmin ? `<button type="button" class="btn-acao-icone btn-excluir btn-remover-preco-comparacao" data-acao="excluir-preco" data-id="${preco.id}" title="Remover preço"><i data-lucide="trash-2"></i></button>` : ''}
        </td>
      `;
    }).join('');

    return `
      <tr>
        <td class="td-insumo-fixo">
          <span class="font-bold">${escaparHtml(grupo.insumoNome)}</span>
          <span class="text-muted td-insumo-categoria">${escaparHtml(grupo.categoria)}</span>
        </td>
        <td class="text-muted td-quantidade-fixa">${item ? `${item.quantidadeTotal} ${escaparHtml(item.unidadeMedida)}` : '—'}</td>
        ${celulas}
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table class="tabela-comparacao-cotacao">
      <thead>
        <tr>
          <th class="th-insumo-fixo">Insumo</th>
          <th class="th-quantidade-fixa">Quantidade</th>
          ${theadFornecedores}
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
  `;

  if (isAdmin) {
    container.querySelectorAll('[data-acao="selecionar-preco"]').forEach(td => {
      td.addEventListener('click', async (evento) => {
        if (evento.target.closest('[data-acao="excluir-preco"]')) return;
        await fetch(`/api/cotacoes/${cotacaoAtualId}/precos/${td.dataset.id}/selecionar`, { method: 'PUT' });
        await recarregarCotacaoDetalhe();
      });
    });
    container.querySelectorAll('[data-acao="excluir-preco"]').forEach(btn => {
      btn.addEventListener('click', async (evento) => {
        evento.stopPropagation();
        await fetch(`/api/cotacoes/${cotacaoAtualId}/precos/${btn.dataset.id}`, { method: 'DELETE' });
        await recarregarCotacaoDetalhe();
      });
    });
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

document.getElementById('cotacao-comparacao-busca')?.addEventListener('input', _renderTabelaComparacaoCotacao);

document.getElementById('btn-cotacao-destacar-melhores')?.addEventListener('click', (evento) => {
  destacarMelhoresPrecosAtivo = !destacarMelhoresPrecosAtivo;
  evento.currentTarget.classList.toggle('ativo', destacarMelhoresPrecosAtivo);
  _renderTabelaComparacaoCotacao();
});

document.getElementById('btn-cotacao-gerar-pedidos')?.addEventListener('click', async () => {
  if (!confirm('Gerar pedido de compra pros insumos já com vencedor escolhido? Quem ainda não tem vencedor fica de fora, sem problema — dá pra gerar de novo depois.')) return;
  try {
    const resposta = await fetch(`/api/cotacoes/${cotacaoAtualId}/gerar-pedidos`, { method: 'POST' });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao gerar pedidos');
    let mensagem = `${dados.pedidosCriados.length} pedido(s) gerado(s).`;
    if (dados.insumosSemVencedor > 0) mensagem += ` ${dados.insumosSemVencedor} insumo(s) ainda sem vencedor escolhido ficaram de fora.`;
    alert(mensagem);
    window.location.href = 'pedidos.html';
  } catch (erro) {
    console.error('Falha ao gerar pedidos:', erro);
    alert(erro.message || 'Não foi possível gerar os pedidos.');
  }
});

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

// --- Pedidos (admin: nascem da cotação, acompanhamento de entrega) ---
const ESTAGIO_LABEL_PEDIDO = { enviado: 'Pedido enviado', confirmado: 'Confirmado pelo fornecedor', a_caminho: 'A caminho', recebido: 'Recebido' };
const STATUS_CLASSE_BADGE_PEDIDO = { enviado: 'neu-orange', confirmado: 'neu-orange', a_caminho: 'neu-orange', recebido: 'pos' };

let pedidosLista = [];
let pedidoDetalheAtual = null;
let pedidoEstagios = ['enviado', 'confirmado', 'a_caminho', 'recebido'];

async function carregarPedidos() {
  const tbody = document.getElementById('pedidos-tabela-body');
  if (!tbody) return;
  try {
    const resposta = await fetch('/api/pedidos');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    pedidosLista = dados.pedidos || [];
    if (dados.estagios) pedidoEstagios = dados.estagios;
    renderPedidosTabela();
  } catch (erro) {
    console.error('Falha ao carregar pedidos:', erro);
    tbody.innerHTML = `<tr><td colspan="7" style="color:#ef4444;">Não foi possível carregar os pedidos. Confira se o Flask está rodando.</td></tr>`;
  }
}

function renderPedidosTabela() {
  const tbody = document.getElementById('pedidos-tabela-body');
  if (!tbody) return;

  if (!pedidosLista.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="panel-subtitle">Nenhum pedido gerado ainda — feche uma cotação com vencedor escolhido e clique em "Gerar pedidos".</td></tr>`;
    return;
  }

  tbody.innerHTML = pedidosLista.map((p) => `
    <tr>
      <td class="font-bold">${escaparHtml(p.fornecedorNome)}</td>
      <td>${escaparHtml(p.loja)}</td>
      <td class="text-muted">${escaparHtml(p.cotacaoTitulo)}</td>
      <td>${p.totalItens}</td>
      <td>R$ ${p.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}${p.abaixoDoMinimo ? ' <span class="badge-pill neu-orange" title="Abaixo do pedido mínimo do fornecedor">abaixo do mínimo</span>' : ''}</td>
      <td><span class="badge-pill ${STATUS_CLASSE_BADGE_PEDIDO[p.status]}">${ESTAGIO_LABEL_PEDIDO[p.status]}</span></td>
      <td class="acoes-linha">
        <button type="button" class="btn-acao-icone" data-acao="abrir-pedido" data-id="${p.id}" title="Ver itens e acompanhar entrega">
          <i data-lucide="arrow-right"></i>
        </button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('[data-acao="abrir-pedido"]').forEach(btn => {
    btn.addEventListener('click', () => abrirPedidoDetalhe(parseInt(btn.dataset.id, 10)));
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function abrirPedidoDetalhe(pedidoId) {
  try {
    const resposta = await fetch(`/api/pedidos/${pedidoId}`);
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao carregar pedido');
    pedidoDetalheAtual = dados;
    if (dados.estagios) pedidoEstagios = dados.estagios;
    renderPedidoDetalhe();
    document.getElementById('pedidos-lista-view').style.display = 'none';
    document.getElementById('pedido-detalhe-view').style.display = '';
  } catch (erro) {
    console.error('Falha ao abrir pedido:', erro);
    alert('Não foi possível abrir esse pedido.');
  }
}

function renderPedidoDetalhe() {
  const p = pedidoDetalheAtual;
  if (!p) return;

  document.getElementById('pedido-detalhe-titulo').textContent = `${p.fornecedorNome} — ${p.loja}`;
  document.getElementById('pedido-detalhe-subtitulo').textContent = `Cotação: ${p.cotacaoTitulo}`;

  const aviso = document.getElementById('pedido-aviso-minimo');
  if (p.abaixoDoMinimo) {
    aviso.style.display = '';
    aviso.textContent = `Esse pedido está abaixo do pedido mínimo do fornecedor (R$ ${p.pedidoMinimo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) — decida se vale somar mais itens ou seguir assim mesmo.`;
  } else {
    aviso.style.display = 'none';
  }

  const indiceAtual = pedidoEstagios.indexOf(p.status);
  const estagiosDiv = document.getElementById('pedido-estagios');
  estagiosDiv.innerHTML = pedidoEstagios.map((estagio, indice) => {
    const estado = indice < indiceAtual ? 'concluido' : (indice === indiceAtual ? 'atual' : 'pendente');
    const marcador = indice < indiceAtual ? '✓' : (indice + 1);
    const linha = indice < pedidoEstagios.length - 1
      ? `<div class="pedido-estagio-linha ${indice < indiceAtual ? 'concluida' : ''}"></div>`
      : '';
    return `
      <div class="pedido-estagio" data-estado="${estado}">
        <div class="pedido-estagio-marcador">${marcador}</div>
        <div class="pedido-estagio-texto">${escaparHtml(ESTAGIO_LABEL_PEDIDO[estagio])}</div>
      </div>
      ${linha}
    `;
  }).join('');

  const isAdmin = window.usuarioLogado?.papel === 'admin';
  const btnCancelar = document.getElementById('btn-pedido-cancelar');
  btnCancelar.style.display = isAdmin ? '' : 'none';

  const btnAvancar = document.getElementById('btn-pedido-avancar');
  const ultimoEstagio = indiceAtual >= pedidoEstagios.length - 1;
  btnAvancar.style.display = isAdmin ? '' : 'none';
  btnAvancar.disabled = ultimoEstagio;
  btnAvancar.textContent = ultimoEstagio ? 'Entrega concluída' : `Avançar pra "${ESTAGIO_LABEL_PEDIDO[pedidoEstagios[indiceAtual + 1]]}"`;

  const btnVoltarEtapa = document.getElementById('btn-pedido-voltar-etapa');
  const primeiroEstagio = indiceAtual <= 0;
  btnVoltarEtapa.style.display = isAdmin ? '' : 'none';
  btnVoltarEtapa.disabled = primeiroEstagio;
  btnVoltarEtapa.textContent = primeiroEstagio ? 'Voltar etapa' : `Voltar pra "${ESTAGIO_LABEL_PEDIDO[pedidoEstagios[indiceAtual - 1]]}"`;

  const itensBody = document.getElementById('pedido-itens-body');
  itensBody.innerHTML = p.itens.map((item) => `
    <tr>
      <td class="font-bold">${escaparHtml(item.nome)}</td>
      <td>${item.quantidade} ${escaparHtml(item.unidadeMedida)}</td>
      <td>R$ ${item.precoUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      <td>R$ ${item.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
    </tr>
  `).join('');
  document.getElementById('pedido-detalhe-total').textContent = `R$ ${p.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

document.getElementById('btn-pedido-voltar')?.addEventListener('click', () => {
  document.getElementById('pedido-detalhe-view').style.display = 'none';
  document.getElementById('pedidos-lista-view').style.display = '';
  pedidoDetalheAtual = null;
  carregarPedidos();
});

document.getElementById('btn-pedido-avancar')?.addEventListener('click', async () => {
  if (!pedidoDetalheAtual) return;
  try {
    const resposta = await fetch(`/api/pedidos/${pedidoDetalheAtual.id}/avancar`, { method: 'POST' });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao avançar');
    await abrirPedidoDetalhe(pedidoDetalheAtual.id);
  } catch (erro) {
    console.error('Falha ao avançar pedido:', erro);
    alert(erro.message || 'Não foi possível avançar esse pedido.');
  }
});

document.getElementById('btn-pedido-cancelar')?.addEventListener('click', async () => {
  if (!pedidoDetalheAtual) return;
  const p = pedidoDetalheAtual;
  if (!confirm(`Cancelar o pedido de "${p.fornecedorNome}" pra "${p.loja}"? Essa ação não pode ser desfeita — os insumos dele voltam a ficar disponíveis pra gerar um pedido novo a partir da mesma cotação.`)) return;
  try {
    const resposta = await fetch(`/api/pedidos/${p.id}`, { method: 'DELETE' });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao cancelar');
    document.getElementById('pedido-detalhe-view').style.display = 'none';
    document.getElementById('pedidos-lista-view').style.display = '';
    pedidoDetalheAtual = null;
    await carregarPedidos();
  } catch (erro) {
    console.error('Falha ao cancelar pedido:', erro);
    alert(erro.message || 'Não foi possível cancelar esse pedido.');
  }
});

document.getElementById('btn-pedido-voltar-etapa')?.addEventListener('click', async () => {
  if (!pedidoDetalheAtual) return;
  try {
    const resposta = await fetch(`/api/pedidos/${pedidoDetalheAtual.id}/voltar`, { method: 'POST' });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao voltar');
    await abrirPedidoDetalhe(pedidoDetalheAtual.id);
  } catch (erro) {
    console.error('Falha ao voltar etapa do pedido:', erro);
    alert(erro.message || 'Não foi possível voltar essa etapa.');
  }
});

// --- Contagens (admin: abrir, listar, conferir/aprovar) ---
let contagensLista = [];
let contagemDetalheAtual = null;

async function carregarContagens() {
  const tbody = document.getElementById('contagens-tabela-body');
  if (!tbody) return;
  try {
    const resposta = await fetch('/api/contagens');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    contagensLista = dados.contagens || [];
    renderContagensTabela();
  } catch (erro) {
    console.error('Falha ao carregar contagens:', erro);
    tbody.innerHTML = `<tr><td colspan="6" style="color:#ef4444;">Não foi possível carregar as contagens. Confira se o Flask está rodando.</td></tr>`;
  }
}

const STATUS_LABEL_CONTAGEM = { aberta: 'Aberta', respondida: 'Aguardando conferência', aprovada: 'Aprovada' };
const STATUS_CLASSE_CONTAGEM = { aberta: 'neu-orange', respondida: 'pos', aprovada: 'pos' };

function renderContagensTabela() {
  const isAdmin = window.usuarioLogado?.papel === 'admin';
  const tbody = document.getElementById('contagens-tabela-body');
  if (!tbody) return;

  const thAcoes = document.getElementById('contagens-th-acoes');
  if (thAcoes) thAcoes.style.display = isAdmin ? '' : 'none';
  const acoesTopo = document.getElementById('contagens-acoes-admin');
  if (acoesTopo) acoesTopo.style.display = isAdmin ? '' : 'none';

  if (!contagensLista.length) {
    const colspan = 5 + (isAdmin ? 1 : 0);
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="panel-subtitle">Nenhuma requisição criada ainda.</td></tr>`;
    return;
  }

  tbody.innerHTML = contagensLista.map((c) => {
    const prazo = new Date(c.prazoValidade).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `
      <tr>
        <td class="font-bold">${escaparHtml(c.loja)}</td>
        <td class="text-muted">${escaparHtml(c.descricao) || '—'}</td>
        <td>${c.itensPreenchidos} de ${c.totalItens}</td>
        <td class="text-muted">${prazo}</td>
        <td><span class="badge-pill ${STATUS_CLASSE_CONTAGEM[c.status]}">${STATUS_LABEL_CONTAGEM[c.status]}</span></td>
        ${isAdmin ? `
          <td class="acoes-linha">
            <button type="button" class="btn-acao-icone" data-acao="abrir-contagem" data-id="${c.id}" title="Ver/conferir requisição">
              <i data-lucide="arrow-right"></i>
            </button>
          </td>
        ` : ''}
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-acao="abrir-contagem"]').forEach((btn) => {
    btn.addEventListener('click', () => abrirContagemDetalhe(parseInt(btn.dataset.id, 10)));
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function abrirContagemDetalhe(contagemId) {
  try {
    const resposta = await fetch(`/api/contagens/${contagemId}`);
    if (!resposta.ok) throw new Error('falha ao carregar contagem');
    contagemDetalheAtual = await resposta.json();
    renderContagemDetalhe();
    document.getElementById('contagens-lista-view').style.display = 'none';
    document.getElementById('requisicao-conferencia-view').style.display = 'none';
    document.getElementById('contagens-detalhe-view').style.display = '';
  } catch (erro) {
    console.error('Falha ao abrir contagem:', erro);
    alert('Não foi possível abrir essa contagem.');
  }
}

function renderContagemDetalhe() {
  const c = contagemDetalheAtual;
  if (!c) return;
  const isAdmin = window.usuarioLogado?.papel === 'admin';

  document.getElementById('contagem-detalhe-titulo').textContent = `${c.loja} — ${c.descricao || 'Requisição'}`;

  const acoes = document.getElementById('contagem-detalhe-acoes-admin');
  const btnAprovar = document.getElementById('btn-contagem-aprovar');
  const btnReabrir = document.getElementById('btn-contagem-reabrir');
  if (acoes) acoes.style.display = isAdmin ? '' : 'none';
  if (btnAprovar) btnAprovar.disabled = c.status !== 'respondida';
  if (btnReabrir) btnReabrir.style.display = (isAdmin && c.status !== 'aberta') ? '' : 'none';

  const thAcoes = document.getElementById('contagem-detalhe-th-acoes');
  if (thAcoes) thAcoes.style.display = isAdmin ? '' : 'none';

  const tbody = document.getElementById('contagem-detalhe-tabela-body');
  tbody.innerHTML = c.itens.map((item) => {
    const preenchido = item.quantidadePreenchida;
    const ideal = item.quantidadeIdeal;
    const deficit = (preenchido !== null && ideal !== null) ? Math.max(0, Math.round((ideal - preenchido) * 100) / 100) : null;
    return `
      <tr>
        <td class="font-bold">${escaparHtml(item.nome)}</td>
        <td class="text-muted">${escaparHtml(item.categoria)}</td>
        <td>${preenchido === null ? '<span class="text-muted">não preenchido</span>' : `${preenchido} ${escaparHtml(item.unidadeMedida)}`}</td>
        <td>${ideal === null ? '<span class="text-muted">—</span>' : `${ideal} ${escaparHtml(item.unidadeMedida)}`}${item.quantidadeIdealAjustada ? ' <span class="badge-pill neu-orange" title="Ajustado manualmente">ajustado</span>' : ''}</td>
        <td>${deficit === null ? '<span class="text-muted">—</span>' : (deficit > 0 ? `<span class="badge-pill neg">comprar ${deficit} ${escaparHtml(item.unidadeMedida)}</span>` : '—')}</td>
        ${isAdmin ? `
          <td class="acoes-linha">
            <button type="button" class="btn-acao-icone" data-acao="ajustar-ideal" data-insumo-id="${item.insumoId}" title="Ajustar quantidade ideal">
              <i data-lucide="pencil"></i>
            </button>
          </td>
        ` : ''}
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-acao="ajustar-ideal"]').forEach((botao) => {
    botao.addEventListener('click', () => {
      const item = c.itens.find((i) => i.insumoId === parseInt(botao.dataset.insumoId, 10));
      if (item) abrirModalAjusteIdeal(c.loja, item);
    });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --- Modal: ajustar quantidade ideal na mão ---
let ajusteIdealContexto = null; // { loja, insumoId }

function abrirModalAjusteIdeal(loja, item) {
  ajusteIdealContexto = { loja, insumoId: item.insumoId };
  document.getElementById('ajuste-ideal-insumo-nome').textContent = `${item.nome} — ${loja}`;
  document.getElementById('ajuste-ideal-unidade').textContent = item.unidadeMedida;
  document.getElementById('ajuste-ideal-valor').value = item.quantidadeIdeal !== null ? item.quantidadeIdeal : '';
  document.getElementById('ajuste-ideal-aviso').style.display = item.quantidadeIdealAjustada ? '' : 'none';
  document.getElementById('btn-ajuste-ideal-remover').style.display = item.quantidadeIdealAjustada ? '' : 'none';
  document.getElementById('modal-ajuste-ideal').style.display = 'flex';
}

function fecharModalAjusteIdeal() {
  document.getElementById('modal-ajuste-ideal').style.display = 'none';
  ajusteIdealContexto = null;
}

document.getElementById('btn-ajuste-ideal-fechar')?.addEventListener('click', fecharModalAjusteIdeal);
document.getElementById('btn-ajuste-ideal-cancelar')?.addEventListener('click', fecharModalAjusteIdeal);

document.getElementById('form-ajuste-ideal')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!ajusteIdealContexto) return;
  const { loja, insumoId } = ajusteIdealContexto;
  const valor = document.getElementById('ajuste-ideal-valor').value;
  try {
    const resposta = await fetch(`/api/insumos/${insumoId}/quantidade-ideal?loja=${encodeURIComponent(loja)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor: parseFloat(valor) }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao ajustar');
    fecharModalAjusteIdeal();
    if (contagemDetalheAtual) await abrirContagemDetalhe(contagemDetalheAtual.id);
  } catch (erro) {
    console.error('Falha ao ajustar quantidade ideal:', erro);
    alert(erro.message || 'Não foi possível salvar o ajuste.');
  }
});

document.getElementById('btn-ajuste-ideal-remover')?.addEventListener('click', async () => {
  if (!ajusteIdealContexto) return;
  const { loja, insumoId } = ajusteIdealContexto;
  try {
    const resposta = await fetch(`/api/insumos/${insumoId}/quantidade-ideal?loja=${encodeURIComponent(loja)}`, { method: 'DELETE' });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao remover ajuste');
    fecharModalAjusteIdeal();
    if (contagemDetalheAtual) await abrirContagemDetalhe(contagemDetalheAtual.id);
  } catch (erro) {
    console.error('Falha ao remover ajuste:', erro);
    alert(erro.message || 'Não foi possível remover o ajuste.');
  }
});

document.getElementById('btn-contagem-voltar')?.addEventListener('click', () => {
  document.getElementById('contagens-detalhe-view').style.display = 'none';
  document.getElementById('contagens-lista-view').style.display = '';
  carregarContagens();
});

document.getElementById('btn-contagem-aprovar')?.addEventListener('click', async () => {
  if (!contagemDetalheAtual) return;
  if (!confirm('Aprovar essa loja? As quantidades preenchidas vão substituir o estoque atual dela. Se for a última loja pendente da requisição, a cotação já é gerada em seguida.')) return;
  try {
    const resposta = await fetch(`/api/contagens/${contagemDetalheAtual.id}/aprovar`, { method: 'POST' });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao aprovar');

    const titulo = contagemDetalheAtual.descricao;
    const prazoValidade = contagemDetalheAtual.prazoValidade;
    const conferencia = await fetch(`/api/requisicoes/conferencia?titulo=${encodeURIComponent(titulo)}&prazoValidade=${encodeURIComponent(prazoValidade)}`).then(r => r.json());

    if (conferencia.totalmenteAprovada) {
      const gerarResposta = await fetch('/api/requisicoes/conferencia/gerar-cotacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo, prazoValidade }),
      });
      const gerarDados = await gerarResposta.json();
      if (gerarResposta.ok) {
        alert('Todas as lojas aprovadas — cotação gerada!' + _avisoInsumosSemIdeal(gerarDados.insumosSemIdeal));
        window.location.href = `cotacoes.html?abrir=${gerarDados.cotacaoId}`;
        return;
      }
      alert(gerarDados.erro || 'Loja aprovada, mas não foi possível gerar a cotação.');
    } else {
      const faltam = conferencia.totalLojas - conferencia.lojasAprovadas;
      alert(`Loja aprovada! Ainda falta${faltam > 1 ? 'm' : ''} ${faltam} loja${faltam > 1 ? 's' : ''} aprovar antes de gerar a cotação.`);
    }
    await abrirContagemDetalhe(contagemDetalheAtual.id);
  } catch (erro) {
    console.error('Falha ao aprovar requisição:', erro);
    alert(erro.message || 'Não foi possível aprovar essa requisição.');
  }
});

document.getElementById('btn-contagem-reabrir')?.addEventListener('click', async () => {
  if (!contagemDetalheAtual) return;
  if (!confirm('Reabrir essa contagem pra corrigir? O link volta a aceitar preenchimento — quem responder vai digitar tudo de novo do zero. Se essa Requisição já gerou uma cotação, os números lá não atualizam sozinhos.')) return;
  try {
    const resposta = await fetch(`/api/contagens/${contagemDetalheAtual.id}/reabrir`, { method: 'POST' });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao reabrir');
    await abrirContagemDetalhe(contagemDetalheAtual.id);
  } catch (erro) {
    console.error('Falha ao reabrir contagem:', erro);
    alert(erro.message || 'Não foi possível reabrir essa contagem.');
  }
});

// --- Requisições (admin: agrupa as contagens com mesmo título/prazo e
// soma o déficit de todas as lojas antes de virar cotação) ---
let requisicoesLista = [];
let requisicaoConferenciaAtual = null;

async function carregarRequisicoes() {
  const tbody = document.getElementById('requisicoes-tabela-body');
  if (!tbody) return;
  try {
    const resposta = await fetch('/api/requisicoes');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    requisicoesLista = dados.requisicoes || [];
    renderRequisicoesTabela();
  } catch (erro) {
    console.error('Falha ao carregar requisições:', erro);
    tbody.innerHTML = `<tr><td colspan="5" style="color:#ef4444;">Não foi possível carregar as requisições. Confira se o Flask está rodando.</td></tr>`;
  }
}

function _statusRequisicao(r) {
  if (r.totalmenteAprovada) return { texto: 'Aprovada', classe: 'pos' };
  if (r.prontaParaConferencia) return { texto: 'Pronta pra conferência', classe: 'pos' };
  return { texto: 'Aguardando lojas', classe: 'neu-orange' };
}

function renderRequisicoesTabela() {
  const isAdmin = window.usuarioLogado?.papel === 'admin';
  const tbody = document.getElementById('requisicoes-tabela-body');
  if (!tbody) return;

  const thAcoes = document.getElementById('requisicoes-th-acoes');
  if (thAcoes) thAcoes.style.display = isAdmin ? '' : 'none';

  if (!requisicoesLista.length) {
    const colspan = 4 + (isAdmin ? 1 : 0);
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="panel-subtitle">Nenhuma requisição criada ainda.</td></tr>`;
    return;
  }

  tbody.innerHTML = requisicoesLista.map((r, indice) => {
    const prazo = new Date(r.prazoValidade).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const status = _statusRequisicao(r);
    return `
      <tr>
        <td class="font-bold">${escaparHtml(r.titulo) || '—'}</td>
        <td>${r.lojasRespondidas} de ${r.totalLojas} responderam</td>
        <td class="text-muted">${prazo}</td>
        <td><span class="badge-pill ${status.classe}">${status.texto}</span></td>
        ${isAdmin ? `
          <td class="acoes-linha">
            <button type="button" class="btn-acao-icone" data-acao="abrir-requisicao" data-indice="${indice}" title="Ver conferência somada">
              <i data-lucide="arrow-right"></i>
            </button>
            <button type="button" class="btn-acao-icone btn-excluir" data-acao="excluir-requisicao" data-indice="${indice}" title="Excluir só essa requisição">
              <i data-lucide="trash-2"></i>
            </button>
          </td>
        ` : ''}
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-acao="abrir-requisicao"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = requisicoesLista[parseInt(btn.dataset.indice, 10)];
      abrirConferenciaRequisicao(r.titulo, r.prazoValidade);
    });
  });

  tbody.querySelectorAll('[data-acao="excluir-requisicao"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const r = requisicoesLista[parseInt(btn.dataset.indice, 10)];
      if (!confirm(`Excluir a requisição "${r.titulo || 'sem título'}"? Isso apaga as contagens de todas as lojas e a cotação/pedidos gerados a partir dela, se existirem — só dessa requisição, o resto do histórico continua intacto. Não dá pra desfazer.`)) return;
      try {
        const resposta = await fetch(`/api/requisicoes?titulo=${encodeURIComponent(r.titulo)}&prazoValidade=${encodeURIComponent(r.prazoValidade)}`, { method: 'DELETE' });
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.erro || 'falha ao excluir');
        await carregarRequisicoes();
      } catch (erro) {
        console.error('Falha ao excluir requisição:', erro);
        alert(erro.message || 'Não foi possível excluir essa requisição.');
      }
    });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function abrirConferenciaRequisicao(titulo, prazoValidade) {
  try {
    const resposta = await fetch(`/api/requisicoes/conferencia?titulo=${encodeURIComponent(titulo)}&prazoValidade=${encodeURIComponent(prazoValidade)}`);
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao carregar requisição');
    requisicaoConferenciaAtual = dados;
    renderConferenciaRequisicao();
    document.getElementById('contagens-lista-view').style.display = 'none';
    document.getElementById('contagens-detalhe-view').style.display = 'none';
    document.getElementById('requisicao-conferencia-view').style.display = '';
  } catch (erro) {
    console.error('Falha ao abrir requisição:', erro);
    alert('Não foi possível abrir essa requisição.');
  }
}

function renderConferenciaRequisicao() {
  const r = requisicaoConferenciaAtual;
  if (!r) return;
  const isAdmin = window.usuarioLogado?.papel === 'admin';

  document.getElementById('requisicao-conferencia-titulo').textContent = r.titulo || 'Requisição';

  const acoes = document.getElementById('requisicao-conferencia-acoes-admin');
  const btnAprovarTodas = document.getElementById('btn-requisicao-aprovar-todas');
  const btnGerarCotacao = document.getElementById('btn-requisicao-gerar-cotacao');
  if (acoes) acoes.style.display = isAdmin ? '' : 'none';
  if (btnAprovarTodas) btnAprovarTodas.disabled = !r.prontaParaConferencia || r.totalmenteAprovada;
  if (btnGerarCotacao) btnGerarCotacao.disabled = !r.totalmenteAprovada;

  const aviso = document.getElementById('requisicao-conferencia-aviso');
  if (!r.prontaParaConferencia) {
    aviso.style.display = '';
    aviso.textContent = `${r.lojasRespondidas} de ${r.totalLojas} lojas já preencheram — os números somados abaixo ainda não contam quem falta.`;
  } else if (!r.totalmenteAprovada) {
    aviso.style.display = '';
    aviso.textContent = 'Todas as lojas já preencheram. Confira os números e aprove pra virar quantidade real no estoque.';
  } else {
    aviso.style.display = 'none';
  }

  const lojasBody = document.getElementById('requisicao-conferencia-lojas-body');
  lojasBody.innerHTML = r.contagens.map((c) => {
    const status = STATUS_LABEL_CONTAGEM[c.status];
    const classe = STATUS_CLASSE_CONTAGEM[c.status];
    return `
      <tr>
        <td class="font-bold">${escaparHtml(c.loja)}</td>
        <td>${c.itensPreenchidos} de ${c.totalItens}</td>
        <td><span class="badge-pill ${classe}">${status}</span></td>
        <td class="acoes-linha">
          <button type="button" class="btn-acao-icone" data-acao="abrir-contagem-da-requisicao" data-id="${c.id}" title="Ver/conferir essa loja">
            <i data-lucide="arrow-right"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
  lojasBody.querySelectorAll('[data-acao="abrir-contagem-da-requisicao"]').forEach((btn) => {
    btn.addEventListener('click', () => abrirContagemDetalhe(parseInt(btn.dataset.id, 10)));
  });

  const itensBody = document.getElementById('requisicao-conferencia-itens-body');
  itensBody.innerHTML = r.itens.map((item) => `
    <tr>
      <td class="font-bold">${escaparHtml(item.nome)}</td>
      <td class="text-muted">${escaparHtml(item.categoria)}</td>
      <td>${item.preenchidoTotal} ${escaparHtml(item.unidadeMedida)}</td>
      <td>${item.idealTotal === null ? '<span class="text-muted">—</span>' : `${item.idealTotal} ${escaparHtml(item.unidadeMedida)}`}${item.idealAjustado ? ' <span class="badge-pill neu-orange" title="Alguma loja tem ajuste manual">ajustado</span>' : ''}</td>
      <td>${item.deficit === null ? '<span class="text-muted">—</span>' : (item.deficit > 0 ? `<span class="badge-pill neg">comprar ${item.deficit} ${escaparHtml(item.unidadeMedida)}</span>` : '—')}</td>
    </tr>
  `).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

document.getElementById('btn-requisicao-voltar')?.addEventListener('click', () => {
  document.getElementById('requisicao-conferencia-view').style.display = 'none';
  document.getElementById('contagens-lista-view').style.display = '';
  carregarRequisicoes();
  carregarContagens();
});

document.getElementById('btn-requisicao-aprovar-todas')?.addEventListener('click', async () => {
  const r = requisicaoConferenciaAtual;
  if (!r) return;
  if (!confirm('Aprovar todas as lojas dessa requisição? As quantidades preenchidas vão substituir o estoque atual de cada uma.')) return;
  try {
    const resposta = await fetch('/api/requisicoes/conferencia/aprovar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: r.titulo, prazoValidade: r.prazoValidade }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao aprovar');
    await abrirConferenciaRequisicao(r.titulo, r.prazoValidade);
  } catch (erro) {
    console.error('Falha ao aprovar requisição:', erro);
    alert(erro.message || 'Não foi possível aprovar essa requisição.');
  }
});

// Avisa quais insumos ficaram de fora da cotação por não terem quantidade
// ideal calculável ainda — antes sumiam da lista sem ninguém perceber, só
// descobrindo bem depois que aquele insumo nunca entrou num pedido.
function _avisoInsumosSemIdeal(insumosSemIdeal) {
  if (!insumosSemIdeal || !insumosSemIdeal.length) return '';
  const nomes = insumosSemIdeal.map((i) => i.nome).join(', ');
  return `\n\nAtenção: ${insumosSemIdeal.length} insumo(s) ficaram de fora da cotação por ainda não terem quantidade ideal calculável (Ficha Técnica incompleta ou sem venda registrada): ${nomes}. Ajusta a quantidade ideal na mão pra esses insumos entrarem numa próxima cotação.`;
}

document.getElementById('btn-requisicao-gerar-cotacao')?.addEventListener('click', async () => {
  const r = requisicaoConferenciaAtual;
  if (!r || !r.totalmenteAprovada) return;
  if (!confirm('Gerar cotação com o déficit dessa requisição? Você ainda vai poder editar antes de mandar pros fornecedores.')) return;
  try {
    const resposta = await fetch('/api/requisicoes/conferencia/gerar-cotacao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: r.titulo, prazoValidade: r.prazoValidade }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao gerar cotação');
    const aviso = _avisoInsumosSemIdeal(dados.insumosSemIdeal);
    if (aviso) alert(aviso.trim());
    window.location.href = `cotacoes.html?abrir=${dados.cotacaoId}`;
  } catch (erro) {
    console.error('Falha ao gerar cotação:', erro);
    alert(erro.message || 'Não foi possível gerar a cotação.');
  }
});

// --- Modal: Nova requisição (abre uma contagem por loja selecionada) ---
function abrirModalNovaContagem() {
  document.getElementById('form-nova-contagem').reset();
  const container = document.getElementById('nova-contagem-lojas');
  container.innerHTML = LOJAS_ESTOQUE.map((loja, indice) => `
    <label>
      <input type="checkbox" name="nova-contagem-loja" value="${escaparHtml(loja)}" ${indice === 0 ? 'checked' : ''}>
      ${escaparHtml(loja)}
    </label>
  `).join('');
  document.getElementById('modal-nova-contagem').style.display = 'flex';
}

function fecharModalNovaContagem() {
  document.getElementById('modal-nova-contagem').style.display = 'none';
}

document.getElementById('btn-nova-contagem')?.addEventListener('click', abrirModalNovaContagem);
document.getElementById('btn-nova-contagem-fechar')?.addEventListener('click', fecharModalNovaContagem);
document.getElementById('btn-nova-contagem-cancelar')?.addEventListener('click', fecharModalNovaContagem);

document.getElementById('form-nova-contagem')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const descricao = document.getElementById('nova-contagem-descricao').value;
  const prazoValidade = document.getElementById('nova-contagem-prazo').value;
  const lojas = Array.from(document.querySelectorAll('#nova-contagem-lojas input[name="nova-contagem-loja"]:checked')).map((i) => i.value);

  if (!lojas.length) {
    alert('Selecione pelo menos uma loja.');
    return;
  }

  try {
    const linksGerados = [];
    for (const loja of lojas) {
      const resposta = await fetch('/api/contagens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loja, descricao, prazoValidade }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || `falha ao criar contagem de ${loja}`);
      linksGerados.push({ loja, link: `${location.origin}/preencher_contagem.html?token=${dados.token}` });
    }

    fecharModalNovaContagem();
    document.getElementById('contagem-link-lista').innerHTML = linksGerados.map((item, indice) => `
      <div class="contagem-link-item">
        <span class="contagem-link-loja">${escaparHtml(item.loja)}</span>
        <input type="text" readonly value="${escaparHtml(item.link)}" id="contagem-link-valor-${indice}">
        <button type="button" class="btn-secondary-sm" data-copiar="contagem-link-valor-${indice}">Copiar</button>
      </div>
    `).join('');
    document.getElementById('contagem-link-lista').querySelectorAll('[data-copiar]').forEach((botao) => {
      botao.addEventListener('click', async () => {
        const input = document.getElementById(botao.dataset.copiar);
        input.select();
        try {
          await navigator.clipboard.writeText(input.value);
        } catch {
          document.execCommand('copy');
        }
      });
    });
    document.getElementById('modal-contagem-link').style.display = 'flex';
    await carregarContagens();
  } catch (erro) {
    console.error('Falha ao criar requisição:', erro);
    alert(erro.message || 'Não foi possível criar a requisição.');
  }
});

document.getElementById('btn-contagem-link-fechar')?.addEventListener('click', () => {
  document.getElementById('modal-contagem-link').style.display = 'none';
});
document.getElementById('btn-contagem-link-fechar-2')?.addEventListener('click', () => {
  document.getElementById('modal-contagem-link').style.display = 'none';
});

// --- Tela pública de preenchimento de contagem (sem login, por token) ---
async function inicializarContagemPublica() {
  const token = new URLSearchParams(location.search).get('token');
  const elCarregando = document.getElementById('contagem-publica-carregando');
  const elErro = document.getElementById('contagem-publica-erro');
  const elErroTexto = document.getElementById('contagem-publica-erro-texto');
  const elObrigado = document.getElementById('contagem-publica-obrigado');
  const form = document.getElementById('form-contagem-publica');

  function mostrarErro(mensagem) {
    elCarregando.style.display = 'none';
    elErroTexto.textContent = mensagem;
    elErro.style.display = '';
  }

  if (!token) {
    mostrarErro('Link inválido — falta o token de acesso.');
    return;
  }

  try {
    const resposta = await fetch(`/api/contagens/token/${encodeURIComponent(token)}`);
    const dados = await resposta.json();
    if (!resposta.ok) {
      mostrarErro(dados.erro || 'Link inválido.');
      return;
    }

    if (dados.status !== 'aberta' || dados.expirada) {
      elCarregando.style.display = 'none';
      if (dados.status === 'aberta' && dados.expirada) {
        mostrarErro('O prazo pra preencher essa requisição já venceu.');
      } else {
        elObrigado.style.display = '';
      }
      return;
    }

    document.getElementById('contagem-publica-titulo').textContent = 'Preencher requisição de estoque';
    document.getElementById('contagem-publica-subtitulo').textContent = `${dados.descricao ? dados.descricao + ' — ' : ''}${dados.loja} — válido até ${new Date(dados.prazoValidade).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;

    const porCategoria = {};
    dados.itens.forEach((item) => {
      (porCategoria[item.categoria] || (porCategoria[item.categoria] = [])).push(item);
    });

    const totalItens = dados.itens.length;
    function atualizarProgresso() {
      const preenchidos = Array.from(form.querySelectorAll('input[data-insumo-id]')).filter((input) => input.value !== '').length;
      document.getElementById('contagem-publica-progresso').textContent = `Você preencheu ${preenchidos} de ${totalItens} itens`;
    }

    const filtroSecao = document.getElementById('contagem-publica-filtro-secao');
    filtroSecao.innerHTML = '<option value="">Todas as seções</option>' +
      Object.keys(porCategoria).map((categoria) => `<option value="${escaparHtml(categoria)}">${escaparHtml(categoria)}</option>`).join('');

    const container = document.getElementById('contagem-publica-itens');
    container.innerHTML = Object.entries(porCategoria).map(([categoria, itens]) => `
      <div class="contagem-publica-secao" data-categoria="${escaparHtml(categoria)}">
        <h3 class="contagem-publica-secao-titulo">Seção: ${escaparHtml(categoria)}</h3>
        <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Nome do Produto</th>
              <th>Gramatura</th>
              <th>Marca</th>
              <th>Qtde em Estoque</th>
              <th>Sugestão</th>
            </tr>
          </thead>
          <tbody>
            ${itens.map((item) => `
              <tr data-nome-busca="${escaparHtml(item.nome.toLowerCase())}">
                <td class="font-bold">${escaparHtml(item.nome)}</td>
                <td><div class="contagem-item-somente-leitura">${escaparHtml(item.unidadeMedida)}</div></td>
                <td><div class="contagem-item-somente-leitura">${escaparHtml(item.marcaHomologada || '')}</div></td>
                <td><input type="number" step="0.01" min="0" placeholder="0" data-insumo-id="${item.insumoId}" required></td>
                <td><div class="contagem-item-somente-leitura">${item.quantidadeIdeal !== null ? item.quantidadeIdeal : '—'}</div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('input[data-insumo-id]').forEach((input) => {
      input.addEventListener('input', () => {
        input.closest('tr').classList.toggle('preenchido', input.value !== '');
        atualizarProgresso();
      });
    });

    function aplicarFiltros() {
      const termo = document.getElementById('contagem-publica-busca').value.trim().toLowerCase();
      const categoria = filtroSecao.value;
      container.querySelectorAll('.contagem-publica-secao').forEach((secao) => {
        let algumVisivelNaSecao = false;
        secao.querySelectorAll('tbody tr').forEach((linha) => {
          const bateNome = !termo || linha.dataset.nomeBusca.includes(termo);
          const bateCategoria = !categoria || secao.dataset.categoria === categoria;
          const visivel = bateNome && bateCategoria;
          linha.style.display = visivel ? '' : 'none';
          if (visivel) algumVisivelNaSecao = true;
        });
        secao.style.display = algumVisivelNaSecao ? '' : 'none';
      });
    }

    document.getElementById('contagem-publica-busca').addEventListener('input', aplicarFiltros);
    filtroSecao.addEventListener('change', aplicarFiltros);

    atualizarProgresso();
    elCarregando.style.display = 'none';
    form.style.display = '';

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const valores = {};
      form.querySelectorAll('input[data-insumo-id]').forEach((input) => {
        valores[input.dataset.insumoId] = input.value;
      });
      const btn = document.getElementById('btn-contagem-publica-enviar');
      btn.disabled = true;
      try {
        const resp = await fetch(`/api/contagens/token/${encodeURIComponent(token)}/responder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valores }),
        });
        const respDados = await resp.json();
        if (!resp.ok) throw new Error(respDados.erro || 'falha ao enviar');
        form.style.display = 'none';
        elObrigado.style.display = '';
      } catch (erro) {
        console.error('Falha ao enviar contagem:', erro);
        alert(erro.message || 'Não foi possível enviar a requisição.');
        btn.disabled = false;
      }
    });
  } catch (erro) {
    console.error('Falha ao carregar contagem pública:', erro);
    mostrarErro('Não foi possível carregar essa requisição agora.');
  }
}

async function inicializarPreencherCotacao() {
  const token = new URLSearchParams(location.search).get('token');
  const elCarregando = document.getElementById('cotacao-publica-carregando');
  const elErro = document.getElementById('cotacao-publica-erro');
  const elErroTexto = document.getElementById('cotacao-publica-erro-texto');
  const elObrigado = document.getElementById('cotacao-publica-obrigado');
  const form = document.getElementById('form-cotacao-publica');

  function mostrarErro(mensagem) {
    elCarregando.style.display = 'none';
    elErroTexto.textContent = mensagem;
    elErro.style.display = '';
  }

  if (!token) {
    mostrarErro('Link inválido — falta o token de acesso.');
    return;
  }

  try {
    const resposta = await fetch(`/api/cotacoes/convite/${encodeURIComponent(token)}`);
    const dados = await resposta.json();
    if (!resposta.ok) {
      mostrarErro(dados.erro || 'Link inválido.');
      return;
    }

    if (dados.status !== 'aberta' || dados.expirado) {
      elCarregando.style.display = 'none';
      if (dados.status === 'aberta' && dados.expirado) {
        mostrarErro('O prazo pra responder essa cotação já venceu.');
      } else {
        elObrigado.style.display = '';
      }
      return;
    }

    document.getElementById('cotacao-publica-titulo').textContent = dados.cotacaoTitulo || 'Preencher cotação de preços';
    document.getElementById('cotacao-publica-subtitulo').textContent = `Válido até ${new Date(dados.prazoValidade).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;

    const container = document.getElementById('cotacao-publica-itens');
    container.innerHTML = dados.itens.map((item) => `
      <tr data-nome-busca="${escaparHtml(item.nome.toLowerCase())}">
        <td class="font-bold">${escaparHtml(item.nome)}</td>
        <td><div class="contagem-item-somente-leitura">${escaparHtml(item.marcaHomologada || '—')}</div></td>
        <td><div class="contagem-item-somente-leitura">${item.quantidade} ${escaparHtml(item.unidadeMedida)}</div></td>
        <td><input type="number" step="0.01" min="0.01" placeholder="0,00" data-insumo-id="${item.insumoId}"></td>
        <td style="text-align:center;"><input type="checkbox" data-nao-vende-id="${item.insumoId}"></td>
      </tr>
    `).join('');

    container.querySelectorAll('[data-nao-vende-id]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const input = container.querySelector(`[data-insumo-id="${checkbox.dataset.naoVendeId}"]`);
        input.disabled = checkbox.checked;
        if (checkbox.checked) input.value = '';
      });
    });

    document.getElementById('cotacao-publica-busca').addEventListener('input', (evento) => {
      const termo = evento.target.value.trim().toLowerCase();
      container.querySelectorAll('tr').forEach((linha) => {
        linha.style.display = !termo || linha.dataset.nomeBusca.includes(termo) ? '' : 'none';
      });
    });

    elCarregando.style.display = 'none';
    form.style.display = '';

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const precos = {};
      container.querySelectorAll('[data-insumo-id]').forEach((input) => {
        if (!input.disabled && input.value !== '') precos[input.dataset.insumoId] = input.value;
      });
      if (!Object.keys(precos).length) {
        alert('Preencha o preço de pelo menos um item, ou marque todos como "não vendo esse item".');
        return;
      }
      if (!confirm('Após fechar, não vai dar pra alterar os preços. Tem certeza?')) return;
      const btn = document.getElementById('btn-cotacao-publica-enviar');
      btn.disabled = true;
      try {
        const resp = await fetch(`/api/cotacoes/convite/${encodeURIComponent(token)}/responder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ precos }),
        });
        const respDados = await resp.json();
        if (!resp.ok) throw new Error(respDados.erro || 'falha ao enviar');
        form.style.display = 'none';
        elObrigado.style.display = '';
      } catch (erro) {
        console.error('Falha ao enviar cotação:', erro);
        alert(erro.message || 'Não foi possível enviar a cotação.');
        btn.disabled = false;
      }
    });
  } catch (erro) {
    console.error('Falha ao carregar cotação pública:', erro);
    mostrarErro('Não foi possível carregar essa cotação agora.');
  }
}

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

// --- Modal: Importar insumos em lote (catálogo novo de uma loja, ex: VMarket) ---
function abrirModalImportarInsumos() {
  document.getElementById('importar-insumos-categoria').value = 'Geral';
  document.getElementById('importar-insumos-unidade').value = 'un';
  document.getElementById('importar-insumos-texto').value = '';
  document.getElementById('importar-insumos-erro').style.display = 'none';
  document.getElementById('importar-insumos-resultado').textContent = '';
  const container = document.getElementById('importar-insumos-lojas');
  container.innerHTML = LOJAS_ESTOQUE.map((loja) => `
    <label class="checklist-item">
      <input type="checkbox" name="importar-insumos-loja" value="${escaparHtml(loja)}">
      ${escaparHtml(loja)}
    </label>
  `).join('');
  document.getElementById('modal-importar-insumos').style.display = 'flex';
}

function fecharModalImportarInsumos() {
  document.getElementById('modal-importar-insumos').style.display = 'none';
}

// Extrai só o nome de cada linha colada — aceita "nome", "nome;valor",
// "nome,valor" ou "nome<tab>valor" (o valor, se vier, é ignorado aqui;
// essa lista é só pra cadastrar o insumo, não pra ajustar quantidade).
function _extrairNomesColados(texto) {
  return texto.split('\n').map((linhaTexto) => {
    const bruta = linhaTexto.trim();
    if (!bruta) return null;
    const separador = bruta.includes('\t') ? '\t' : (bruta.includes(';') ? ';' : (bruta.includes(',') ? ',' : null));
    if (!separador) return bruta;
    const partes = bruta.split(separador);
    return partes.slice(0, -1).join(separador).trim() || bruta;
  }).filter(Boolean);
}

document.getElementById('btn-importar-insumos')?.addEventListener('click', abrirModalImportarInsumos);
document.getElementById('btn-importar-insumos-fechar')?.addEventListener('click', fecharModalImportarInsumos);
document.getElementById('btn-importar-insumos-cancelar')?.addEventListener('click', fecharModalImportarInsumos);

document.getElementById('btn-importar-insumos-confirmar')?.addEventListener('click', async () => {
  const erro = document.getElementById('importar-insumos-erro');
  erro.style.display = 'none';

  const lojas = Array.from(document.querySelectorAll('input[name="importar-insumos-loja"]:checked')).map((el) => el.value);
  const nomes = _extrairNomesColados(document.getElementById('importar-insumos-texto').value);

  if (!lojas.length) {
    erro.textContent = 'Marque pelo menos uma loja.';
    erro.style.display = '';
    return;
  }
  if (!nomes.length) {
    erro.textContent = 'Cola pelo menos um nome de insumo.';
    erro.style.display = '';
    return;
  }

  try {
    const resposta = await fetch('/api/insumos/lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nomes,
        lojas,
        categoria: document.getElementById('importar-insumos-categoria').value,
        unidadeMedida: document.getElementById('importar-insumos-unidade').value,
      }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao importar');
    document.getElementById('importar-insumos-resultado').textContent = dados.duplicados.length
      ? `${dados.criados.length} insumo(s) cadastrado(s). Já existiam (ignorados): ${dados.duplicados.join(', ')}`
      : `${dados.criados.length} insumo(s) cadastrado(s), nenhum duplicado.`;
    await carregarInsumos();
  } catch (erroCatch) {
    console.error('Falha ao importar insumos em lote:', erroCatch);
    erro.textContent = erroCatch.message || 'Não foi possível importar.';
    erro.style.display = '';
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

// --- Modal: copiar quantidade ideal de outra loja (loja nova sem
// histórico próprio ainda — vira ajuste manual, insumo por insumo dá pra
// corrigir depois) ---
function abrirModalCopiarIdeal() {
  const destino = estoqueTabAtual;
  document.getElementById('copiar-ideal-destino').value = destino;
  const select = document.getElementById('copiar-ideal-origem');
  select.innerHTML = LOJAS_ESTOQUE.filter((l) => l !== destino)
    .map((l) => `<option value="${escaparHtml(l)}">${escaparHtml(l)}</option>`)
    .join('');
  document.getElementById('modal-copiar-ideal').style.display = 'flex';
}

function fecharModalCopiarIdeal() {
  document.getElementById('modal-copiar-ideal').style.display = 'none';
}

document.getElementById('btn-copiar-ideal')?.addEventListener('click', abrirModalCopiarIdeal);
document.getElementById('btn-copiar-ideal-fechar')?.addEventListener('click', fecharModalCopiarIdeal);
document.getElementById('btn-copiar-ideal-cancelar')?.addEventListener('click', fecharModalCopiarIdeal);

document.getElementById('form-copiar-ideal')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const lojaDestino = estoqueTabAtual;
  const lojaOrigem = document.getElementById('copiar-ideal-origem').value;
  if (!confirm(`Copiar a quantidade ideal de ${lojaOrigem} pra ${lojaDestino}? Isso sobrescreve qualquer ajuste manual que ${lojaDestino} já tenha.`)) return;
  try {
    const resposta = await fetch('/api/insumos/copiar-quantidade-ideal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lojaOrigem, lojaDestino }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao copiar');
    fecharModalCopiarIdeal();
    await carregarInsumos();
    alert(`Pronto — ${dados.copiados} insumos copiados de ${lojaOrigem}.`);
  } catch (erro) {
    console.error('Falha ao copiar quantidade ideal:', erro);
    alert(erro.message || 'Não foi possível copiar.');
  }
});

let ajusteLoteValores = {};

function abrirModalAjusteLote() {
  ajusteLoteValores = {};
  document.getElementById('ajuste-lote-loja-nome').textContent = estoqueTabAtual;
  document.getElementById('ajuste-lote-busca').value = '';
  document.getElementById('ajuste-lote-erro').style.display = 'none';
  document.getElementById('ajuste-lote-colar-texto').value = '';
  document.getElementById('ajuste-lote-colar-resultado').textContent = '';
  renderAjusteLoteTabela('');
  document.getElementById('modal-ajuste-lote').style.display = 'flex';
}

// Tira acento/maiúscula/pontuação pra comparar nome colado com nome
// cadastrado sem exigir que bata caractere por caractere.
function _normalizarNomeInsumo(nome) {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function processarColarListaAjusteLote() {
  const texto = document.getElementById('ajuste-lote-colar-texto').value;
  const porNomeNormalizado = new Map();
  _linhasEstoqueParaTab(estoqueTabAtual).forEach((linha) => {
    porNomeNormalizado.set(_normalizarNomeInsumo(linha.insumo.nome), linha.insumo.id);
  });

  let casados = 0;
  const naoEncontrados = [];

  texto.split('\n').forEach((linhaTexto) => {
    const bruta = linhaTexto.trim();
    if (!bruta) return;
    const separador = bruta.includes('\t') ? '\t' : (bruta.includes(';') ? ';' : ',');
    const partes = bruta.split(separador);
    if (partes.length < 2) { naoEncontrados.push(bruta); return; }

    const valor = partes[partes.length - 1].trim().replace(',', '.');
    const nome = partes.slice(0, -1).join(separador).trim();
    if (!nome || isNaN(parseFloat(valor))) { naoEncontrados.push(bruta); return; }

    const insumoId = porNomeNormalizado.get(_normalizarNomeInsumo(nome));
    if (insumoId) {
      ajusteLoteValores[insumoId] = valor;
      casados++;
    } else {
      naoEncontrados.push(nome);
    }
  });

  renderAjusteLoteTabela(document.getElementById('ajuste-lote-busca').value);
  document.getElementById('ajuste-lote-colar-resultado').textContent = naoEncontrados.length
    ? `${casados} casado(s). Não encontrado (confira o nome e ajuste na mão): ${naoEncontrados.join(', ')}`
    : `${casados} casado(s), todos encontrados.`;
}

document.getElementById('btn-ajuste-lote-processar-colar')?.addEventListener('click', processarColarListaAjusteLote);

function fecharModalAjusteLote() {
  document.getElementById('modal-ajuste-lote').style.display = 'none';
}

function renderAjusteLoteTabela(filtro) {
  const tbody = document.getElementById('ajuste-lote-tabela-body');
  const termo = filtro.trim().toLowerCase();
  const linhas = _linhasEstoqueParaTab(estoqueTabAtual)
    .filter((linha) => !termo || linha.insumo.nome.toLowerCase().includes(termo));

  tbody.innerHTML = linhas.map((linha) => `
    <tr>
      <td class="font-bold">${escaparHtml(linha.insumo.nome)}</td>
      <td class="text-muted">${escaparHtml(linha.insumo.categoria)}</td>
      <td>${linha.dados.quantidadeIdeal !== null ? `${linha.dados.quantidadeIdeal} ${escaparHtml(linha.insumo.unidadeMedida)}` : '<span class="text-muted">—</span>'}${linha.dados.quantidadeIdealAjustada ? ' <span class="badge-pill neu-orange">ajustado</span>' : ''}</td>
      <td><input type="number" step="0.01" min="0" placeholder="—" data-insumo-id="${linha.insumo.id}" value="${ajusteLoteValores[linha.insumo.id] ?? ''}" style="width:100px;"></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('input[data-insumo-id]').forEach((input) => {
    input.addEventListener('input', () => {
      if (input.value === '') delete ajusteLoteValores[input.dataset.insumoId];
      else ajusteLoteValores[input.dataset.insumoId] = input.value;
    });
  });
}

document.getElementById('btn-ajuste-lote')?.addEventListener('click', abrirModalAjusteLote);
document.getElementById('btn-ajuste-lote-fechar')?.addEventListener('click', fecharModalAjusteLote);
document.getElementById('btn-ajuste-lote-cancelar')?.addEventListener('click', fecharModalAjusteLote);

document.getElementById('ajuste-lote-busca')?.addEventListener('input', (evento) => {
  renderAjusteLoteTabela(evento.target.value);
});

document.getElementById('btn-ajuste-lote-salvar')?.addEventListener('click', async () => {
  const erro = document.getElementById('ajuste-lote-erro');
  erro.style.display = 'none';

  if (!Object.keys(ajusteLoteValores).length) {
    erro.textContent = 'Preencha pelo menos um insumo.';
    erro.style.display = '';
    return;
  }
  try {
    const resposta = await fetch('/api/insumos/ajustes-quantidade-ideal/lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loja: estoqueTabAtual, valores: ajusteLoteValores }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao salvar');
    fecharModalAjusteLote();
    await carregarInsumos();
    alert(`Pronto — ${dados.salvos} insumo(s) ajustado(s).`);
  } catch (erroCatch) {
    console.error('Falha ao ajustar quantidade ideal em lote:', erroCatch);
    erro.textContent = erroCatch.message || 'Não foi possível salvar.';
    erro.style.display = '';
  }
});

let insumosLojaTodos = [];
let insumosLojaSelecionados = new Set();

async function abrirModalInsumosLoja() {
  document.getElementById('insumos-loja-nome').textContent = estoqueTabAtual;
  document.getElementById('insumos-loja-busca').value = '';
  document.getElementById('insumos-loja-erro').style.display = 'none';
  document.getElementById('insumos-loja-tabela-body').innerHTML = '<tr><td colspan="3" class="panel-subtitle">Carregando...</td></tr>';
  document.getElementById('modal-insumos-loja').style.display = 'flex';
  try {
    const resposta = await fetch(`/api/insumos/por-loja?loja=${encodeURIComponent(estoqueTabAtual)}`);
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao carregar');
    insumosLojaTodos = dados.insumos;
    insumosLojaSelecionados = new Set(insumosLojaTodos.filter((i) => i.aplica).map((i) => i.id));
    renderInsumosLojaTabela('');
  } catch (erro) {
    console.error('Falha ao carregar insumos da loja:', erro);
    document.getElementById('insumos-loja-tabela-body').innerHTML = '<tr><td colspan="3" style="color:#ef4444;">Não foi possível carregar.</td></tr>';
  }
}

function fecharModalInsumosLoja() {
  document.getElementById('modal-insumos-loja').style.display = 'none';
}

function renderInsumosLojaTabela(filtro) {
  const termo = filtro.trim().toLowerCase();
  const tbody = document.getElementById('insumos-loja-tabela-body');
  const linhas = insumosLojaTodos.filter((i) => !termo || i.nome.toLowerCase().includes(termo));

  tbody.innerHTML = linhas.map((i) => `
    <tr>
      <td><input type="checkbox" data-insumo-id="${i.id}" ${insumosLojaSelecionados.has(i.id) ? 'checked' : ''}></td>
      <td class="font-bold">${escaparHtml(i.nome)}</td>
      <td class="text-muted">${escaparHtml(i.categoria)}</td>
    </tr>
  `).join('');

  tbody.querySelectorAll('input[data-insumo-id]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const id = parseInt(checkbox.dataset.insumoId, 10);
      if (checkbox.checked) insumosLojaSelecionados.add(id);
      else insumosLojaSelecionados.delete(id);
    });
  });
}

document.getElementById('btn-insumos-loja')?.addEventListener('click', abrirModalInsumosLoja);
document.getElementById('btn-insumos-loja-fechar')?.addEventListener('click', fecharModalInsumosLoja);
document.getElementById('btn-insumos-loja-cancelar')?.addEventListener('click', fecharModalInsumosLoja);

document.getElementById('insumos-loja-busca')?.addEventListener('input', (evento) => {
  renderInsumosLojaTabela(evento.target.value);
});

document.getElementById('btn-insumos-loja-marcar-todos')?.addEventListener('click', () => {
  const termo = document.getElementById('insumos-loja-busca').value.trim().toLowerCase();
  insumosLojaTodos.filter((i) => !termo || i.nome.toLowerCase().includes(termo)).forEach((i) => insumosLojaSelecionados.add(i.id));
  renderInsumosLojaTabela(document.getElementById('insumos-loja-busca').value);
});

document.getElementById('btn-insumos-loja-desmarcar-todos')?.addEventListener('click', () => {
  const termo = document.getElementById('insumos-loja-busca').value.trim().toLowerCase();
  insumosLojaTodos.filter((i) => !termo || i.nome.toLowerCase().includes(termo)).forEach((i) => insumosLojaSelecionados.delete(i.id));
  renderInsumosLojaTabela(document.getElementById('insumos-loja-busca').value);
});

document.getElementById('btn-insumos-loja-salvar')?.addEventListener('click', async () => {
  const erro = document.getElementById('insumos-loja-erro');
  erro.style.display = 'none';
  try {
    const resposta = await fetch('/api/insumos/por-loja', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loja: estoqueTabAtual, insumoIds: Array.from(insumosLojaSelecionados) }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao salvar');
    fecharModalInsumosLoja();
    alert(`Pronto — ${dados.total} insumo(s) marcados pra ${estoqueTabAtual}.`);
  } catch (erroCatch) {
    console.error('Falha ao salvar insumos da loja:', erroCatch);
    erro.textContent = erroCatch.message || 'Não foi possível salvar.';
    erro.style.display = '';
  }
});

// --- RECEBIMENTOS (confirmar que um pedido chegou — qualquer pessoa
// logada, não só admin; pedido do Guilherme/Julia: colaborador busca o
// pedido, confirma quem recebeu, corrige quantidade/preço se veio
// diferente, e isso já atualiza o estoque de verdade) ---
let recebimentosLista = [];
let recebimentoAtual = null; // detalhe completo (com itens) do pedido aberto no modal

async function carregarRecebimentos() {
  const tbody = document.getElementById('recebimentos-tabela-body');
  if (!tbody) return;
  try {
    const resposta = await fetch('/api/recebimentos');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    recebimentosLista = dados.pedidos || [];
    renderRecebimentosTabela();
  } catch (erro) {
    console.error('Falha ao carregar recebimentos:', erro);
    tbody.innerHTML = `<tr><td colspan="5" style="color:#ef4444;">Não foi possível carregar os pedidos. Confira se o Flask está rodando.</td></tr>`;
  }
}

function renderRecebimentosTabela() {
  const tbody = document.getElementById('recebimentos-tabela-body');
  if (!tbody) return;

  const termo = (document.getElementById('recebimentos-busca')?.value || '').trim().toLowerCase();
  const linhas = recebimentosLista.filter((p) => {
    if (!termo) return true;
    return (
      p.fornecedorNome.toLowerCase().includes(termo) ||
      p.loja.toLowerCase().includes(termo) ||
      (p.itensNomes || '').toLowerCase().includes(termo) ||
      String(p.valorTotal).includes(termo) ||
      _formatarMoedaBR(p.valorTotal).includes(termo)
    );
  });

  if (!linhas.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="panel-subtitle">${recebimentosLista.length ? 'Nenhum pedido bate com essa busca.' : 'Nenhum pedido aguardando recebimento.'}</td></tr>`;
    return;
  }

  tbody.innerHTML = linhas.map((p) => `
    <tr>
      <td class="font-bold">${escaparHtml(p.fornecedorNome)}</td>
      <td>${escaparHtml(p.loja)}</td>
      <td class="text-muted">${escaparHtml(p.itensNomes || '—')}</td>
      <td class="font-bold">R$ ${_formatarMoedaBR(p.valorTotal)}</td>
      <td>
        <button type="button" class="btn-primary-sm" data-acao="confirmar-recebimento" data-id="${p.id}">Confirmar recebimento</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-acao="confirmar-recebimento"]').forEach((btn) => {
    btn.addEventListener('click', () => abrirModalRecebimento(parseInt(btn.dataset.id, 10)));
  });
}

document.getElementById('recebimentos-busca')?.addEventListener('input', renderRecebimentosTabela);

function _linhaRecebimentoItemHTML(item) {
  return `
    <tr data-insumo-id="${item.insumoId}">
      <td class="font-bold">${escaparHtml(item.nome)}</td>
      <td class="text-muted">${item.quantidade} ${escaparHtml(item.unidadeMedida)}</td>
      <td><input type="number" step="0.01" min="0" class="recebimento-input-quantidade" value="${item.quantidade}"></td>
      <td><input type="number" step="0.01" min="0" class="recebimento-input-preco" value="${item.precoUnitario}"></td>
    </tr>
  `;
}

function _atualizarValorCalculadoRecebimento() {
  const linhas = document.querySelectorAll('#recebimento-itens-body tr');
  let total = 0;
  linhas.forEach((linha) => {
    const quantidade = parseFloat(linha.querySelector('.recebimento-input-quantidade').value) || 0;
    const preco = parseFloat(linha.querySelector('.recebimento-input-preco').value) || 0;
    total += quantidade * preco;
  });
  document.getElementById('recebimento-valor-calculado').textContent = `R$ ${_formatarMoedaBR(Math.round(total * 100) / 100)}`;
}

async function abrirModalRecebimento(pedidoId) {
  try {
    const resposta = await fetch(`/api/recebimentos/${pedidoId}`);
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao carregar pedido');
    recebimentoAtual = dados;

    document.getElementById('recebimento-titulo').textContent = `Confirmar recebimento — ${dados.fornecedorNome} (${dados.loja})`;
    document.getElementById('recebimento-nome').value = window.usuarioLogado?.nome || '';
    document.getElementById('recebimento-valor-nf').value = dados.valorTotal;
    document.getElementById('recebimento-erro').style.display = 'none';
    document.getElementById('recebimento-itens-body').innerHTML = dados.itens.map(_linhaRecebimentoItemHTML).join('');

    document.querySelectorAll('#recebimento-itens-body .recebimento-input-quantidade, #recebimento-itens-body .recebimento-input-preco').forEach((input) => {
      input.addEventListener('input', _atualizarValorCalculadoRecebimento);
    });
    _atualizarValorCalculadoRecebimento();

    document.getElementById('modal-confirmar-recebimento').style.display = 'flex';
  } catch (erro) {
    console.error('Falha ao abrir recebimento:', erro);
    alert(erro.message || 'Não foi possível abrir esse pedido.');
  }
}

function fecharModalRecebimento() {
  document.getElementById('modal-confirmar-recebimento').style.display = 'none';
  recebimentoAtual = null;
}

document.getElementById('btn-recebimento-fechar')?.addEventListener('click', fecharModalRecebimento);
document.getElementById('btn-recebimento-cancelar')?.addEventListener('click', fecharModalRecebimento);

document.getElementById('form-confirmar-recebimento')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!recebimentoAtual) return;
  const erro = document.getElementById('recebimento-erro');
  erro.style.display = 'none';

  const itens = Array.from(document.querySelectorAll('#recebimento-itens-body tr')).map((linha) => ({
    insumoId: parseInt(linha.dataset.insumoId, 10),
    quantidade: parseFloat(linha.querySelector('.recebimento-input-quantidade').value),
    precoUnitario: parseFloat(linha.querySelector('.recebimento-input-preco').value),
  }));

  try {
    const resposta = await fetch(`/api/recebimentos/${recebimentoAtual.id}/confirmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recebidoPor: document.getElementById('recebimento-nome').value,
        valorNf: parseFloat(document.getElementById('recebimento-valor-nf').value),
        itens,
      }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao confirmar recebimento');
    fecharModalRecebimento();
    await carregarRecebimentos();
    alert(dados.divergencia
      ? 'Recebimento confirmado, estoque atualizado. O valor da Nota Fiscal não bateu com o calculado — uma tarefa foi criada no ClickUp pra acompanhar.'
      : 'Recebimento confirmado — estoque atualizado.');
  } catch (erroCatch) {
    console.error('Falha ao confirmar recebimento:', erroCatch);
    erro.textContent = erroCatch.message || 'Não foi possível confirmar o recebimento.';
    erro.style.display = '';
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
    const painelZonaPerigo = document.getElementById('painel-zona-perigo');
    if (painelZonaPerigo && usuario.papel === 'admin') {
      painelZonaPerigo.style.display = '';
    }

    // Tela de Cardápio: botão "Importar planilha" e edição de preço/foto
    // (só admin). Os dois fetches (usuário logado + preços) rodam em
    // paralelo — se os cards já tiverem renderizado como "só leitura" antes
    // de saber que é admin, renderiza de novo agora com os controles de edição.
    const importarArea = document.getElementById('cardapio-importar-area');
    if (importarArea && usuario.papel === 'admin' && cardapioAbaAtual === 'precos') {
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
    if (usuario.papel === 'admin' && document.getElementById('estoque-loja-select') && estoqueInsumos.length) {
      renderEstoqueTab();
    }

    // Tela de Cardápio → sub-aba Ficha Técnica: botão "Novo item", custo
    // editável e ações de editar/excluir (só admin) — mesma correção de
    // corrida entre os dois fetches.
    if (usuario.papel === 'admin' && fichaTecnicaProdutos.length) {
      renderFichaTecnicaProdutos();
    }

    // Tela de Contagens: botão "Nova requisição" e coluna de Ações (só
    // admin) — mesma correção de corrida entre os dois fetches. Reage mesmo
    // com a lista vazia, senão o botão nunca apareceria se a Contagens
    // carregar antes de saber o papel do usuário.
    if (usuario.papel === 'admin' && document.getElementById('contagens-tabela-body')) {
      renderContagensTabela();
    }
    if (usuario.papel === 'admin' && document.getElementById('requisicoes-tabela-body')) {
      renderRequisicoesTabela();
    }

    // Tela de Estoque: card "Datas especiais" (só admin) — mesma correção
    // de corrida, já que carregarDatasEspeciais() só carrega se já souber
    // que é admin no momento em que roda.
    if (usuario.papel === 'admin' && document.getElementById('datas-especiais-card')) {
      carregarDatasEspeciais();
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

function abrirModalLimparRequisicoesCotacoes() {
  document.getElementById('limparConfirmarTexto').value = '';
  document.getElementById('limparRequisicoesCotacoesErro').style.display = 'none';
  document.getElementById('btn-confirmar-limpar-requisicoes-cotacoes').disabled = true;
  document.getElementById('modalLimparRequisicoesCotacoes').style.display = 'flex';
}

function fecharModalLimparRequisicoesCotacoes() {
  document.getElementById('modalLimparRequisicoesCotacoes').style.display = 'none';
}

document.getElementById('btn-limpar-requisicoes-cotacoes')?.addEventListener('click', abrirModalLimparRequisicoesCotacoes);

document.getElementById('limparConfirmarTexto')?.addEventListener('input', (evento) => {
  document.getElementById('btn-confirmar-limpar-requisicoes-cotacoes').disabled = evento.target.value.trim() !== 'APAGAR';
});

document.getElementById('btn-confirmar-limpar-requisicoes-cotacoes')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-confirmar-limpar-requisicoes-cotacoes');
  const erro = document.getElementById('limparRequisicoesCotacoesErro');
  btn.disabled = true;
  erro.style.display = 'none';
  try {
    const resposta = await fetch('/api/admin/limpar-requisicoes-cotacoes', { method: 'POST' });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao limpar');
    fecharModalLimparRequisicoesCotacoes();
    alert('Requisições, cotações e pedidos apagados.');
  } catch (erro2) {
    console.error('Falha ao limpar requisições e cotações:', erro2);
    erro.textContent = erro2.message || 'Não foi possível apagar. Tente de novo.';
    erro.style.display = '';
    btn.disabled = false;
  }
});

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

// categorias: [{ nome, contagem }] — contagem vira o número de itens
// daquela categoria, mostrado como badge (Preços e Ficha Técnica).
function _renderSidebarCategorias(containerId, categorias, categoriaSelecionada, onSelecionar) {
  const sidebar = document.getElementById(containerId);
  if (!sidebar) return;
  sidebar.innerHTML = categorias.map(({ nome, contagem }) => `
    <button type="button" class="cardapio-categoria-item ${nome === categoriaSelecionada ? 'active' : ''}" data-categoria="${escaparHtml(nome)}">
      <span>${escaparHtml(nome)}</span>
      <span class="cardapio-categoria-contagem">${contagem}</span>
    </button>
  `).join('');
  sidebar.querySelectorAll('.cardapio-categoria-item').forEach(btn => {
    btn.addEventListener('click', () => onSelecionar(btn.dataset.categoria));
  });
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
// Ficha Técnica virou uma tela por loja (custo + valor de venda de cada
// produto, receita própria por unidade) — ver seção 6.5 da documentação.
let fichaTecnicaLojaAtual = 'Hamburgueria Artesanos';
let fichaTecnicaProdutos = [];
let fichaTecnicaInsumosDisponiveis = [];
let fichaTecnicaEditandoItemId = null;
const fichaTecnicaExpandidos = new Set();
const fichaTecnicaInsumosCache = new Map();
let fichaTecnicaProdutoPendente = null;
let fichaTecnicaCategoriaSelecionada = null;

async function carregarProdutosFichaTecnica() {
  const conteudoEl = document.getElementById('ficha-tecnica-conteudo');
  if (!conteudoEl) return;
  try {
    const resposta = await fetch(`/api/cardapio/produtos?loja=${encodeURIComponent(fichaTecnicaLojaAtual)}`);
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    fichaTecnicaProdutos = dados.produtos || [];
    fichaTecnicaExpandidos.clear();
    fichaTecnicaInsumosCache.clear();
    renderFichaTecnicaProdutos();
  } catch (erro) {
    console.error('Falha ao carregar produtos da ficha técnica:', erro);
    conteudoEl.innerHTML = `<p class="panel-subtitle" style="color:var(--danger); padding: var(--space-4);">Não foi possível carregar os produtos dessa loja.</p>`;
  }
}

function renderFichaTecnicaProdutos() {
  const conteudoEl = document.getElementById('ficha-tecnica-conteudo');
  const acoesAdmin = document.getElementById('ficha-tecnica-acoes-admin');
  if (!conteudoEl) return;
  const isAdmin = window.usuarioLogado?.papel === 'admin';
  if (acoesAdmin) acoesAdmin.style.display = isAdmin ? '' : 'none';

  if (!fichaTecnicaProdutos.length) {
    document.getElementById('ficha-tecnica-categorias-sidebar').innerHTML = '';
    conteudoEl.innerHTML = `<p class="panel-subtitle" style="padding: var(--space-4);">Nenhum produto encontrado pra essa loja em Preços — importe a planilha de preços primeiro.</p>`;
    return;
  }

  const categorias = [];
  const porCategoria = new Map();
  fichaTecnicaProdutos.forEach(p => {
    if (!porCategoria.has(p.categoria)) {
      porCategoria.set(p.categoria, []);
      categorias.push(p.categoria);
    }
    porCategoria.get(p.categoria).push(p);
  });

  if (!fichaTecnicaCategoriaSelecionada || !categorias.includes(fichaTecnicaCategoriaSelecionada)) {
    fichaTecnicaCategoriaSelecionada = categorias[0] || null;
  }
  const categoriasComContagem = categorias.map(nome => ({ nome, contagem: porCategoria.get(nome).length }));
  _renderSidebarCategorias('ficha-tecnica-categorias-sidebar', categoriasComContagem, fichaTecnicaCategoriaSelecionada, (nome) => {
    fichaTecnicaCategoriaSelecionada = nome;
    renderFichaTecnicaProdutos();
  });

  const produtosDaCategoria = porCategoria.get(fichaTecnicaCategoriaSelecionada) || [];
  conteudoEl.innerHTML = !fichaTecnicaCategoriaSelecionada ? '' : `
    <div class="cardapio-categoria-titulo">${escaparHtml(fichaTecnicaCategoriaSelecionada)}</div>
    <div class="ficha-tecnica-produto-lista">
      ${produtosDaCategoria.map(p => {
        const expandido = p.itemCardapioId && fichaTecnicaExpandidos.has(p.itemCardapioId);
        return `
        <div class="ficha-tecnica-produto ${expandido ? 'expandido' : ''}">
          <div class="ficha-tecnica-produto-linha" ${p.itemCardapioId ? `data-acao="expandir-produto" data-item-id="${p.itemCardapioId}"` : ''}>
            <div class="ficha-tecnica-produto-foto">
              ${p.fotoUrl
                ? `<img src="${p.fotoUrl}" alt="${escaparHtml(p.nome)}">`
                : `<div class="ficha-tecnica-produto-foto-vazia"><i data-lucide="image"></i></div>`}
            </div>
            <div class="ficha-tecnica-produto-nome">${escaparHtml(p.nome)}</div>
            <div class="ficha-tecnica-produto-custo">
              ${isAdmin && p.itemCardapioId
                ? `<input type="number" step="0.01" min="0" class="input-custo-produto" data-acao="editar-custo" data-item-id="${p.itemCardapioId}" value="${p.custo ?? ''}" placeholder="Custo">`
                : `<span>${p.custo != null ? 'R$ ' + p.custo.toFixed(2) : '—'}</span>`}
            </div>
            <div class="ficha-tecnica-produto-venda">${p.valorVenda != null ? 'R$ ' + p.valorVenda.toFixed(2) : '—'}</div>
            ${p.itemCardapioId
              ? `<i data-lucide="chevron-down" class="ficha-tecnica-chevron"></i>`
              : (isAdmin
                  ? `<button type="button" class="btn-secondary-sm" data-acao="criar-ficha-produto" data-nome="${escaparHtml(p.nome)}" data-categoria="${escaparHtml(p.categoria)}">Cadastrar ficha técnica</button>`
                  : `<span class="ficha-tecnica-vazio">sem ficha técnica</span>`)}
          </div>
          <div class="ficha-tecnica-produto-expandido" style="display:${expandido ? '' : 'none'};" data-painel-item-id="${p.itemCardapioId ?? ''}"></div>
        </div>
      `;
      }).join('')}
    </div>
  `;

  conteudoEl.querySelectorAll('[data-acao="expandir-produto"]').forEach(linha => {
    linha.addEventListener('click', () => alternarProdutoFichaTecnica(parseInt(linha.dataset.itemId, 10)));
  });
  conteudoEl.querySelectorAll('[data-acao="editar-custo"]').forEach(input => {
    input.addEventListener('click', (evento) => evento.stopPropagation());
    input.addEventListener('change', () => salvarCustoProduto(parseInt(input.dataset.itemId, 10), input.value));
  });
  conteudoEl.querySelectorAll('[data-acao="criar-ficha-produto"]').forEach(btn => {
    btn.addEventListener('click', (evento) => {
      evento.stopPropagation();
      fichaTecnicaProdutoPendente = { nome: btn.dataset.nome, categoria: btn.dataset.categoria };
      document.getElementById('novo-item-nome').value = btn.dataset.nome;
      document.getElementById('novo-item-categoria').value = btn.dataset.categoria;
      document.getElementById('modal-novo-item-cardapio').style.display = 'flex';
    });
  });

  // Reabre o painel de quem já estava expandido antes de re-renderizar
  // (ex: depois de salvar o custo) — sem isso, cada render fecharia tudo.
  fichaTecnicaExpandidos.forEach(itemId => renderPainelFichaTecnicaExpandido(itemId));

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function salvarCustoProduto(itemId, valor) {
  const custo = valor === '' ? null : parseFloat(valor);
  if (custo === null || isNaN(custo)) return;
  try {
    const resposta = await fetch(`/api/itens-cardapio/${itemId}/custo`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loja: fichaTecnicaLojaAtual, custo }),
    });
    if (!resposta.ok) throw new Error('falha ao salvar custo');
    const produto = fichaTecnicaProdutos.find(p => p.itemCardapioId === itemId);
    if (produto) produto.custo = custo;
  } catch (erro) {
    console.error('Falha ao salvar custo:', erro);
    alert('Não foi possível salvar o custo.');
  }
}

async function alternarProdutoFichaTecnica(itemId) {
  if (fichaTecnicaExpandidos.has(itemId)) {
    fichaTecnicaExpandidos.delete(itemId);
  } else {
    fichaTecnicaExpandidos.add(itemId);
  }
  renderFichaTecnicaProdutos();
}

async function renderPainelFichaTecnicaExpandido(itemId) {
  const painel = document.querySelector(`[data-painel-item-id="${itemId}"]`);
  if (!painel) return;
  painel.style.display = '';
  painel.innerHTML = `<p class="panel-subtitle">Carregando...</p>`;

  try {
    const dados = await _buscarFichaTecnicaItem(itemId);
    const isAdmin = window.usuarioLogado?.papel === 'admin';
    const produto = fichaTecnicaProdutos.find(p => p.itemCardapioId === itemId);
    painel.innerHTML = `
      <div class="ficha-tecnica-ingredientes">
        ${dados.insumos.length ? dados.insumos.map(ins => `
          <span class="ficha-tecnica-chip">${escaparHtml(ins.nome)}${ins.quantidade != null ? ` <span class="qtd">(${ins.quantidade}${escaparHtml(ins.unidadeMedida)})</span>` : ''}</span>
        `).join('') : `<span class="ficha-tecnica-vazio">Nenhum insumo cadastrado ainda nessa loja.</span>`}
      </div>
      ${isAdmin ? `
        <div class="acoes-linha" style="margin-top: var(--space-2);">
          <button type="button" class="btn-secondary-sm" data-acao="editar-ficha-tecnica" data-item-id="${itemId}">
            <i data-lucide="pencil"></i>
            Editar insumos
          </button>
          <button type="button" class="btn-secondary-sm btn-excluir" data-acao="excluir-item-cardapio" data-item-id="${itemId}" data-nome="${escaparHtml(produto?.nome || '')}">
            <i data-lucide="trash-2"></i>
            Excluir item
          </button>
        </div>
      ` : ''}
    `;

    painel.querySelector('[data-acao="editar-ficha-tecnica"]')?.addEventListener('click', () => abrirModalFichaTecnicaItem(itemId));
    painel.querySelector('[data-acao="excluir-item-cardapio"]')?.addEventListener('click', async (evento) => {
      if (!confirm(`Excluir "${evento.currentTarget.dataset.nome}" e sua ficha técnica (em todas as lojas)?`)) return;
      try {
        const resposta = await fetch(`/api/itens-cardapio/${itemId}`, { method: 'DELETE' });
        if (!resposta.ok) throw new Error('falha ao excluir');
        fichaTecnicaExpandidos.delete(itemId);
        await carregarProdutosFichaTecnica();
      } catch (erro) {
        console.error('Falha ao excluir item do cardápio:', erro);
        alert('Não foi possível excluir.');
      }
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (erro) {
    console.error('Falha ao carregar ficha técnica do item:', erro);
    painel.innerHTML = `<p class="panel-subtitle" style="color:var(--danger);">Não foi possível carregar os insumos.</p>`;
  }
}

// Busca (com cache por loja atual) os insumos + catálogo disponível de um
// item — usado tanto pro painel expandido quanto pro modal de edição.
async function _buscarFichaTecnicaItem(itemId) {
  if (fichaTecnicaInsumosCache.has(itemId)) return fichaTecnicaInsumosCache.get(itemId);
  const resposta = await fetch(`/api/itens-cardapio/${itemId}/ficha-tecnica?loja=${encodeURIComponent(fichaTecnicaLojaAtual)}`);
  if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
  const dados = await resposta.json();
  fichaTecnicaInsumosCache.set(itemId, dados);
  return dados;
}

// --- Dropdown de loja (mesmo componente/JS do seletor de Estoque) ---
(function inicializarLojaSelectFichaTecnica() {
  const seletor = document.getElementById('ficha-tecnica-loja-select');
  if (!seletor) return;
  const trigger = document.getElementById('ficha-tecnica-loja-trigger');
  const menu = document.getElementById('ficha-tecnica-loja-menu');

  trigger.addEventListener('click', () => seletor.classList.toggle('aberto'));
  document.addEventListener('click', (evento) => {
    if (!seletor.contains(evento.target)) seletor.classList.remove('aberto');
  });

  menu.querySelectorAll('.loja-select-item').forEach((item) => {
    item.addEventListener('click', () => {
      menu.querySelectorAll('.loja-select-item').forEach((i) => i.classList.remove('active'));
      item.classList.add('active');
      trigger.querySelector('.loja-select-label').textContent = item.querySelector('span').textContent;
      fichaTecnicaLojaAtual = item.dataset.loja;
      seletor.classList.remove('aberto');
      carregarProdutosFichaTecnica();
    });
  });
})();

// --- Modal: Novo item do cardápio ---
function abrirModalNovoItemCardapio() {
  fichaTecnicaProdutoPendente = null;
  document.getElementById('form-novo-item-cardapio').reset();
  document.getElementById('modal-novo-item-cardapio').style.display = 'flex';
}
function fecharModalNovoItemCardapio() {
  document.getElementById('modal-novo-item-cardapio').style.display = 'none';
  fichaTecnicaProdutoPendente = null;
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
  const abriaFichaLogoEmSeguida = fichaTecnicaProdutoPendente;
  try {
    const resposta = await fetch('/api/itens-cardapio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao cadastrar');
    fecharModalNovoItemCardapio();
    await carregarProdutosFichaTecnica();
    if (abriaFichaLogoEmSeguida) abrirModalFichaTecnicaItem(dados.id);
  } catch (erro) {
    console.error('Falha ao cadastrar item do cardápio:', erro);
    alert(erro.message || 'Não foi possível cadastrar.');
  }
});

// --- Modal: Editar ficha técnica de um item ---
function _linhaFichaTecnicaHTML(insumoId, quantidade) {
  const opcoes = fichaTecnicaInsumosDisponiveis.map(i =>
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

async function abrirModalFichaTecnicaItem(itemId) {
  let dados;
  try {
    dados = await _buscarFichaTecnicaItem(itemId);
  } catch (erro) {
    console.error('Falha ao carregar ficha técnica do item:', erro);
    alert('Não foi possível carregar os insumos desse item.');
    return;
  }
  fichaTecnicaInsumosDisponiveis = dados.insumosDisponiveis;
  if (!fichaTecnicaInsumosDisponiveis.length) {
    alert('Cadastre pelo menos um insumo no Estoque antes de montar a ficha técnica.');
    return;
  }
  const produto = fichaTecnicaProdutos.find(p => p.itemCardapioId === itemId);
  fichaTecnicaEditandoItemId = itemId;
  document.getElementById('ficha-tecnica-item-titulo').textContent = `Ficha técnica — ${produto?.nome || ''} (${fichaTecnicaLojaAtual})`;
  document.getElementById('ficha-tecnica-colar-texto').value = '';
  document.getElementById('ficha-tecnica-colar-resultado').textContent = '';

  const container = document.getElementById('ficha-tecnica-item-linhas');
  const linhasIniciais = dados.insumos.length
    ? dados.insumos
    : [{ insumoId: fichaTecnicaInsumosDisponiveis[0].id, quantidade: null }];
  container.innerHTML = linhasIniciais.map(ins => _linhaFichaTecnicaHTML(ins.insumoId, ins.quantidade)).join('');
  _wireLinhasFichaTecnica();

  document.getElementById('modal-ficha-tecnica-item').style.display = 'flex';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Cola "insumo;quantidade" (um por linha) e SUBSTITUI as linhas do form
// pelas que bateram — mesmo critério de nome do "colar lista" do Estoque
// (_normalizarNomeInsumo), sempre exato depois de normalizado, nunca por
// aproximação, pra não gravar quantidade no insumo errado da receita.
function processarColarListaFichaTecnica() {
  const texto = document.getElementById('ficha-tecnica-colar-texto').value;
  const porNomeNormalizado = new Map();
  fichaTecnicaInsumosDisponiveis.forEach((insumo) => {
    porNomeNormalizado.set(_normalizarNomeInsumo(insumo.nome), insumo.id);
  });

  const casados = [];
  const naoEncontrados = [];

  texto.split('\n').forEach((linhaTexto) => {
    const bruta = linhaTexto.trim();
    if (!bruta) return;
    const separador = bruta.includes('\t') ? '\t' : (bruta.includes(';') ? ';' : ',');
    const partes = bruta.split(separador);
    if (partes.length < 2) { naoEncontrados.push(bruta); return; }

    const valor = partes[partes.length - 1].trim().replace(',', '.');
    const nome = partes.slice(0, -1).join(separador).trim();
    if (!nome || isNaN(parseFloat(valor))) { naoEncontrados.push(bruta); return; }

    const insumoId = porNomeNormalizado.get(_normalizarNomeInsumo(nome));
    if (insumoId) {
      casados.push({ insumoId, quantidade: valor });
    } else {
      naoEncontrados.push(nome);
    }
  });

  if (casados.length) {
    const container = document.getElementById('ficha-tecnica-item-linhas');
    container.innerHTML = casados.map((c) => _linhaFichaTecnicaHTML(c.insumoId, c.quantidade)).join('');
    _wireLinhasFichaTecnica();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  document.getElementById('ficha-tecnica-colar-resultado').textContent = naoEncontrados.length
    ? `${casados.length} casado(s), substituíram a lista abaixo. Não encontrado (confira o nome e adiciona na mão): ${naoEncontrados.join(', ')}`
    : `${casados.length} casado(s), substituíram a lista abaixo — confira e clica em "Salvar".`;
}

document.getElementById('btn-ficha-tecnica-processar-colar')?.addEventListener('click', processarColarListaFichaTecnica);

function fecharModalFichaTecnicaItem() {
  document.getElementById('modal-ficha-tecnica-item').style.display = 'none';
  fichaTecnicaEditandoItemId = null;
}

document.getElementById('btn-ficha-tecnica-item-fechar')?.addEventListener('click', fecharModalFichaTecnicaItem);
document.getElementById('btn-ficha-tecnica-item-cancelar')?.addEventListener('click', fecharModalFichaTecnicaItem);

document.getElementById('btn-ficha-tecnica-add-linha')?.addEventListener('click', () => {
  if (!fichaTecnicaInsumosDisponiveis.length) return;
  const container = document.getElementById('ficha-tecnica-item-linhas');
  container.insertAdjacentHTML('beforeend', _linhaFichaTecnicaHTML(fichaTecnicaInsumosDisponiveis[0].id, null));
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
      body: JSON.stringify({ loja: fichaTecnicaLojaAtual, insumos }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao salvar');
    const itemId = fichaTecnicaEditandoItemId;
    fecharModalFichaTecnicaItem();
    fichaTecnicaInsumosCache.delete(itemId);
    const produto = fichaTecnicaProdutos.find(p => p.itemCardapioId === itemId);
    if (produto) produto.temFichaTecnica = insumos.length > 0;
    if (fichaTecnicaExpandidos.has(itemId)) {
      await renderPainelFichaTecnicaExpandido(itemId);
    }
  } catch (erro) {
    console.error('Falha ao salvar ficha técnica:', erro);
    alert(erro.message || 'Não foi possível salvar.');
  }
});

// --- Cardápio: "Preços" e "Ficha Técnica" viraram itens separados no menu
// lateral (mesmo padrão do grupo "Compras"), em vez de sub-abas dentro da
// página — a rota é a mesma (cardapio.html), o modo vem do ?aba= da URL.
var cardapioAbaAtual = 'precos';
(function inicializarAbaCardapio() {
  const modoPrecos = document.getElementById('cardapio-modo-precos');
  const modoFicha = document.getElementById('cardapio-modo-ficha-tecnica');
  if (!modoPrecos || !modoFicha) return;

  const aba = new URLSearchParams(location.search).get('aba') === 'ficha-tecnica' ? 'ficha-tecnica' : 'precos';
  cardapioAbaAtual = aba;

  const eyebrow = document.getElementById('cardapio-titulo-eyebrow');
  const titulo = document.getElementById('cardapio-titulo-h1');
  const itemPrecos = document.getElementById('menu-cardapio-precos');
  const itemFicha = document.getElementById('menu-cardapio-ficha');

  if (aba === 'ficha-tecnica') {
    modoPrecos.style.display = 'none';
    modoFicha.style.display = '';
    if (eyebrow) eyebrow.textContent = 'INSUMOS DE CADA ITEM';
    if (titulo) titulo.textContent = 'Cardápio · Ficha Técnica';
    if (itemFicha) itemFicha.classList.add('active');
    if (!fichaTecnicaProdutos.length) carregarProdutosFichaTecnica();
  } else {
    modoPrecos.style.display = '';
    modoFicha.style.display = 'none';
    if (eyebrow) eyebrow.textContent = 'COMPARATIVO DE PREÇOS';
    if (titulo) titulo.textContent = 'Cardápio · Preços';
    if (itemPrecos) itemPrecos.classList.add('active');
  }
})();