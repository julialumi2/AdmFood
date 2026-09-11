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

  // 4.095 TELA DE CARDÁPIO (Preços + Ficha Técnica numa tela só desde 2026-09-09)
  if (document.getElementById('ficha-tecnica-conteudo')) {
    carregarFichaTecnicaAtual();
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

    const seletorAcoes = document.getElementById('estoque-acoes-menu');
    const triggerAcoes = document.getElementById('estoque-acoes-trigger');
    if (seletorAcoes && triggerAcoes) {
      triggerAcoes.addEventListener('click', () => seletorAcoes.classList.toggle('aberto'));
      seletorAcoes.querySelectorAll('.acoes-menu-item').forEach((item) => {
        item.addEventListener('click', () => seletorAcoes.classList.remove('aberto'));
      });
      document.addEventListener('click', (evento) => {
        if (!seletorAcoes.contains(evento.target)) seletorAcoes.classList.remove('aberto');
      });
    }

    document.getElementById('estoque-busca')?.addEventListener('input', () => renderEstoqueTab());
    carregarInsumos();
    carregarLotesVencendo();
    carregarDatasEspeciais();
    carregarFornecedores();
  }

  // 4.097b TELA DE VENDAS SEMANAIS (histórico por canal importado de
  // planilha — separado das Vendas Diárias de propósito, ver comentário
  // da tabela faturamento_canal_semanal em armazenamento.py)
  if (document.getElementById('vendas-semanais-loja-select')) {
    const seletorLoja = document.getElementById('vendas-semanais-loja-select');
    const trigger = document.getElementById('vendas-semanais-loja-trigger');
    const menu = document.getElementById('vendas-semanais-loja-menu');

    trigger.addEventListener('click', () => seletorLoja.classList.toggle('aberto'));
    document.addEventListener('click', (evento) => {
      if (!seletorLoja.contains(evento.target)) seletorLoja.classList.remove('aberto');
    });

    menu.querySelectorAll('.loja-select-item').forEach((item) => {
      item.addEventListener('click', () => {
        menu.querySelectorAll('.loja-select-item').forEach((i) => i.classList.remove('active'));
        item.classList.add('active');
        trigger.querySelector('.loja-select-label').textContent = item.querySelector('span').textContent;
        vendasSemanaisLojaAtual = item.dataset.loja;
        seletorLoja.classList.remove('aberto');
        carregarVendasSemanais(vendasSemanaisLojaAtual);
      });
    });

    carregarVendasSemanais(vendasSemanaisLojaAtual);

    document.getElementById('vendas-semanais-importar-arquivo')
      ?.addEventListener('change', importarPlanilhaVendasSemanais);
  }

  // 4.097c TELA DE CURVA ABC DE CARDÁPIO (Etapa 10 do motor de compra —
  // volume × margem × CMV real por produto)
  if (document.getElementById('curva-loja-select')) {
    const seletorLoja = document.getElementById('curva-loja-select');
    const trigger = document.getElementById('curva-loja-trigger');
    const menu = document.getElementById('curva-loja-menu');

    trigger.addEventListener('click', () => seletorLoja.classList.toggle('aberto'));
    document.addEventListener('click', (evento) => {
      if (!seletorLoja.contains(evento.target)) seletorLoja.classList.remove('aberto');
    });

    menu.querySelectorAll('.loja-select-item').forEach((item) => {
      item.addEventListener('click', () => {
        menu.querySelectorAll('.loja-select-item').forEach((i) => i.classList.remove('active'));
        item.classList.add('active');
        trigger.querySelector('.loja-select-label').textContent = item.querySelector('span').textContent;
        curvaAbcLoja = item.dataset.loja;
        seletorLoja.classList.remove('aberto');
        carregarCurvaAbc();
      });
    });

    document.querySelectorAll('#curva-periodo .curva-periodo-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#curva-periodo .curva-periodo-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        curvaAbcDias = parseInt(btn.dataset.dias, 10);
        carregarCurvaAbc();
      });
    });

    carregarCurvaAbc();
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

  // 4.0996c TELA PÚBLICA DE CONFIRMAÇÃO DE PEDIDO (fornecedor, sem login, por token)
  if (document.getElementById('pedido-publico-conteudo')) {
    inicializarConfirmarPedido();
  }

  // 4.1 TELA DE CONFIGURAÇÕES
  if (document.getElementById('config-lojas-body')) {
    carregarConfigLojas();
  }
  const btnSincronizarAgora = document.getElementById('btn-sincronizar-agora');
  if (btnSincronizarAgora) {
    btnSincronizarAgora.addEventListener('click', () => sincronizarAgora());
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
  document.getElementById('ajuste-canal-faturamento').value = _formatarMoedaBR(faturamentoAtual);
  document.getElementById('ajuste-canal-pedidos').value = pedidosAtual;
  document.getElementById('modal-ajuste-canal').style.display = 'flex';
}

function fecharModalAjusteCanal() {
  document.getElementById('modal-ajuste-canal').style.display = 'none';
  ajusteCanalContexto = null;
}

document.getElementById('btn-ajuste-canal-fechar')?.addEventListener('click', fecharModalAjusteCanal);
document.getElementById('btn-ajuste-canal-cancelar')?.addEventListener('click', fecharModalAjusteCanal);

// Máscara fluida de moeda (pedido da Julia, 2026-09-03: digitar
// "2.588,36" direto, sem precisar converter pra "2588.36" na mão) — mesmo
// padrão já usado no campo "presencial" do fechamento de caixa: cada
// dígito digitado entra como centavo, formata sozinho com ponto de milhar
// e vírgula decimal.
document.getElementById('ajuste-canal-faturamento')?.addEventListener('input', (evento) => {
  const apenasNumeros = evento.target.value.replace(/\D/g, '');
  if (!apenasNumeros) {
    evento.target.value = '';
    return;
  }
  const valorDecimal = (parseFloat(apenasNumeros) / 100).toFixed(2);
  const partes = valorDecimal.split('.');
  partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  evento.target.value = partes.join(',');
});

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
  const faturamentoDigitado = document.getElementById('ajuste-canal-faturamento').value;
  const corpo = {
    unidade: ajusteCanalContexto.unidade,
    dia: ajusteCanalContexto.diaIso,
    canal: ajusteCanalContexto.canalBruto,
    // Campo aceita formato brasileiro (2.588,36) — desfaz o ponto de milhar
    // e troca a vírgula decimal por ponto antes de mandar pro backend,
    // mesmo critério já usado no fechamento de caixa (linha ~342).
    faturamento: faturamentoDigitado.replace(/\./g, '').replace(',', '.'),
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
  'Tradiça ZN': 'Tradiça ZN',
  'Tradiça Simus': 'Tradiça Simus',
  'Açaí Na Lata': 'Açaí NaLata',
};

// Nesse relatório, "portal" vira "Presencial" em qualquer loja (não só na
// Simus) — o modelo só tem essas 4 categorias fixas, então todo canal
// precisa cair em uma delas pra o "Total do dia" fechar certinho.
function nomeExibicaoCanalRelatorio(canalBruto) {
  const mapa = { ifood: 'IFood', food99: '99Food', catalog: 'Cardápio Web', portal: 'Presencial' };
  return mapa[canalBruto] || canalBruto;
}

// Dia da semana por extenso, pro cabeçalho do relatório de um dia só. Usa
// Date.UTC (não "new Date(dataIso)" puro) pra não sofrer com fuso horário —
// senão meia-noite UTC de um dia vira noite do dia anterior aqui (UTC-3) e
// o dia da semana sai errado.
function _diaSemanaCompletoBR(dataIso) {
  const NOMES_DIA_SEMANA_COMPLETO = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  return NOMES_DIA_SEMANA_COMPLETO[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()];
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

    let bloco = `*${cabecalho}*\n`;
    if (mesmoDia) {
      const [, mesDia, diaDia] = inicio.split('-');
      bloco += `${_diaSemanaCompletoBR(inicio)} - dia ${diaDia}/${mesDia}\n`;
    }
    bloco += `\n`;
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

        // Status vs a média das últimas 4 ocorrências ANTERIORES desse
        // mesmo dia da semana, atravessando mês livremente (regra do chefe
        // da Julia, 2026-09-03) — a API já devolve só essas 4 + o próprio
        // dia; filtra o próprio dia aqui pra nunca entrar na própria média.
        // Faixa de ±5% conta como "na média" (faturamento raramente bate
        // exatamente na média).
        const anteriores = ocorrencias.filter(o => o.diaIso !== inicio);
        if (anteriores.length) {
          const media = anteriores.reduce((soma, o) => soma + o.faturamentoNumero, 0) / anteriores.length;
          if (media > 0) {
            const variacao = (totalPeriodo - media) / media;
            const status = variacao > 0.05 ? '✅ CRESCENDO' : variacao < -0.05 ? '🚨 ABAIXO' : '⚠️ NA MÉDIA';
            bloco += `\nStatus: ${status}`;
          }
        }

        // Lista as últimas 4 ocorrências ANTERIORES desse dia da semana
        // (mesmas usadas na média do status acima) — não repete o próprio
        // dia, que já apareceu no "Total do dia" logo acima.
        if (anteriores.length) {
          bloco += `\n\n`;
          bloco += anteriores
            .map((ocorrencia) => `- ${ocorrencia.dia}: R$ ${ocorrencia.faturamento}`)
            .join('\n');
        }
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

  // O tempo de preparo entra no mesmo período do relatório. Roda em
  // paralelo e não derruba a tela se falhar — é informação de apoio, o
  // faturamento é o que não pode faltar.
  carregarPreparoDoInsight(inicio, fim);

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
// Ainda usada pela "tendência" (consumo recente × 14 dias vs médio de 30) —
// quantidade ideal em si passou a usar estoque mínimo, não mais isso
// (2026-09-04, ver _quantidadeIdealParaLoja).
const DIAS_COBERTURA_IDEAL = 7;
const STATUS_LABEL_ESTOQUE = { ok: 'OK', baixo: 'Baixo', critico: 'Crítico' };
const STATUS_CLASSE_BADGE_ESTOQUE = { ok: 'pos', baixo: 'neu-orange', critico: 'neg' };
const STATUS_CLASSE_BARRA_ESTOQUE = { ok: 'bar-green', baixo: 'bar-orange', critico: 'bar-red' };
const STATUS_ICONE_ESTOQUE = { ok: 'check', baixo: 'trending-down', critico: 'alert-triangle' };

let estoqueInsumos = [];
let estoqueTabAtual = 'geral';
// Loja escolhida no painel de Integrações do Estoque (Configurações).
let integracoesLojaAtual = 'Hamburgueria Artesanos';
let itensCardapioTodosCache = null;
let vincularProdutoContexto = null; // nome do produto vendido pendente, enquanto o modal está aberto
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
// senão o estoque mínimo cadastrado (pedido da Julia, 2026-09-04 — antes
// usava consumo médio × DIAS_COBERTURA_IDEAL, mas a Ficha Técnica ainda
// não cobre a maioria dos insumos). null = nenhum dos dois disponível.
function _quantidadeIdealParaLoja(insumoId, loja) {
  const ajuste = estoqueAjustesIdeal[insumoId]?.[loja];
  if (ajuste !== undefined) return { valor: ajuste, ajustado: true };
  const insumo = estoqueInsumos.find((i) => i.id === insumoId);
  const minimo = insumo?.porLoja[loja]?.estoqueMinimo;
  if (!minimo) return { valor: null, ajustado: false };
  const multiplicador = estoqueMultiplicadorEspecial[loja] || 1;
  return { valor: Math.round(minimo * multiplicador * 100) / 100, ajustado: false };
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

// Arredonda uma quantidade a comprar pra cima — pro múltiplo inteiro da
// embalagem do fornecedor quando o insumo tem fatorConversaoCompra
// cadastrado, ou só pra precisão de centavo quando não tem. Espelhada em
// arredondar_quantidade_compra no backend/armazenamento.py — mesma regra,
// esta versão é só pro que o front calcula na hora (Estoque, Contagem
// antes de salvar); Contagem/Cotação já vêm arredondadas do servidor.
function arredondarQuantidadeCompra(deficit, fatorConversaoCompra) {
  if (deficit === null || deficit === undefined || deficit <= 0) return 0;
  if (!fatorConversaoCompra || fatorConversaoCompra <= 0) {
    return Math.ceil(deficit * 100) / 100;
  }
  const pacotes = Math.ceil(Math.round((deficit / fatorConversaoCompra) * 1e6) / 1e6);
  return Math.round(pacotes * fatorConversaoCompra * 100) / 100;
}

// Quantidade sempre é guardada na unidade-base do insumo (g, ml, un) e
// exibida na que couber melhor: 850 g continua "850 g", 4950 g vira
// "4,95 kg". Só formatação — o número no banco não muda, então soma,
// déficit e receita continuam batendo entre telas.
const _ESCALAS = {
  g: { limite: 1000, fator: 1000, maior: 'kg' },
  ml: { limite: 1000, fator: 1000, maior: 'L' },
};

function _formatarQuantidade(valor, unidade) {
  if (valor === null || valor === undefined || valor === '') return '—';
  const numero = Number(valor);
  if (Number.isNaN(numero)) return `${valor} ${unidade || ''}`.trim();

  const escala = _ESCALAS[String(unidade || '').toLowerCase()];
  const usaMaior = escala && Math.abs(numero) >= escala.limite;
  const exibido = usaMaior ? numero / escala.fator : numero;
  const rotulo = usaMaior ? escala.maior : (unidade || '');

  // Sem casa decimal à toa: 12 kg em vez de 12,00 kg, mas 4,95 kg inteiro.
  const texto = exibido.toLocaleString('pt-BR', { maximumFractionDigits: usaMaior ? 2 : 2 });
  return `${texto} ${escaparHtml(rotulo)}`.trim();
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

  const btnAtualizarEstoqueLote = document.getElementById('btn-atualizar-estoque-lote');
  if (btnAtualizarEstoqueLote) btnAtualizarEstoqueLote.style.display = (isAdmin && !ehGeral) ? '' : 'none';

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

  const totalSaude = linhas.length || 1;
  const pctOk = Math.round((contagem.ok / totalSaude) * 100);
  document.getElementById('estoque-saude-seg-ok').style.width = `${(contagem.ok / totalSaude) * 100}%`;
  document.getElementById('estoque-saude-seg-baixo').style.width = `${(contagem.baixo / totalSaude) * 100}%`;
  document.getElementById('estoque-saude-seg-critico').style.width = `${(contagem.critico / totalSaude) * 100}%`;
  document.getElementById('estoque-saude-pct-ideal').textContent = `${pctOk}% em nível ideal`;

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
    const quantidadeIdeal = dados.quantidadeIdeal;
    const sugestaoCompra = quantidadeIdeal === null ? null : arredondarQuantidadeCompra(quantidadeIdeal - dados.quantidadeAtual, insumo.fatorConversaoCompra);
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
              ${insumo.ehMistura ? '<span class="tag-mistura" title="Feito na casa: quando sai, o estoque desconta os ingredientes da receita (Cardápio → Misturas)">mistura</span>' : ''}
            </div>
          </div>
        </td>
        <td><span class="badge badge-neutral tag-categoria">${escaparHtml(insumo.categoria)}</span></td>
        <td class="font-bold col-atual-destaque">${_formatarQuantidade(dados.quantidadeAtual, insumo.unidadeMedida)}</td>
        <td class="text-muted" ${dados.consumoMedio === null ? 'title="Sem dado suficiente — depende da Ficha Técnica do prato estar cadastrada e ter vendas registradas"' : ''}>
          ${dados.consumoMedio === null ? '—' : `${_formatarQuantidade(Math.round(dados.consumoMedio * 100) / 100, insumo.unidadeMedida)}/dia`}
        </td>
        <td class="col-nivel" ${quantidadeIdeal === null ? 'title="Sem estoque mínimo cadastrado pra esse insumo/loja"' : ''}>
          ${quantidadeIdeal === null ? '<span class="text-muted">—</span>' : `
            <div class="nivel-cell">
              <div class="nivel-valor-linha">
                <span class="font-bold">${_formatarQuantidade(quantidadeIdeal, insumo.unidadeMedida)}</span>
                ${dados.quantidadeIdealAjustada ? '<span class="badge-pill neu-orange" title="Ajustado manualmente">ajustado</span>' : ''}
                ${sugestaoCompra > 0 ? `<span class="badge-pill neg" title="Diferença entre a quantidade ideal e o estoque atual">comprar ${_formatarQuantidade(sugestaoCompra, insumo.unidadeMedida)}</span>` : ''}
              </div>
              <div class="nivel-gauge" title="Estoque atual em relação ao mínimo — o traço marca o limite mínimo">
                <div class="progress-container">
                  <div class="progress-bar ${STATUS_CLASSE_BARRA_ESTOQUE[dados.status]}" style="width: ${percentual}%;"></div>
                </div>
                <span class="nivel-gauge-tick"></span>
              </div>
              <span class="min-label">mínimo ${_formatarQuantidade(dados.estoqueMinimo, insumo.unidadeMedida)}</span>
              ${tendencia ? `<span class="tendencia-texto" title="Consumo médio dos últimos 14 dias comparado com a média de 30 dias — não muda o cálculo de déficit, é só um alerta">${tendencia.subindo ? '↑' : '↓'} tendência: ${_formatarQuantidade(tendencia.valor, insumo.unidadeMedida)} (${tendencia.subindo ? '+' : ''}${tendencia.desvioPercentual}%)</span>` : ''}
            </div>
          `}
        </td>
        <td><span class="badge-pill ${STATUS_CLASSE_BADGE_ESTOQUE[dados.status]}"><i data-lucide="${STATUS_ICONE_ESTOQUE[dados.status]}"></i>${STATUS_LABEL_ESTOQUE[dados.status]}</span></td>
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

// --- RECEITA DA MISTURA (insumo feito na casa: tempero, molho...) ---
// Vendeu um produto que leva a mistura, a baixa desconta os ingredientes
// daqui, e o custo dela sai desta conta (ver definir_receita_insumo e
// explodir_receitas_em_ingredientes em armazenamento.py). A janela fica no
// Cardápio → Misturas, junto com as fichas técnicas (pedido da Julia,
// 2026-09-10 — antes era um botão no Estoque). A API manda o preço e a
// unidade de todo insumo junto, pra montar a lista de ingredientes e o
// custo da batelada recalcular na hora.
let receitaInsumoAtual = null; // { insumoId, unidadeMedida, precos, insumos }

// Custo é gravado na unidade do insumo (é o que o CMV multiplica pela
// quantidade da receita), mas em grama e ml a tela mostra e recebe por kg e
// por litro — ninguém sabe de cabeça o preço de 1 g de sal.
function _escalaDeCusto(unidade) {
  const u = (unidade || '').trim().toLowerCase();
  if (u === 'g' || u === 'gr') return { rotulo: 'kg', fator: 1000 };
  if (u === 'ml') return { rotulo: 'L', fator: 1000 };
  return { rotulo: u || 'unidade', fator: 1 };
}

function _formatarCustoPorUnidade(valor, unidade) {
  const { rotulo, fator } = _escalaDeCusto(unidade);
  return `${_formatarMoedaBRL(valor * fator)}/${rotulo}`;
}

async function abrirModalReceitaInsumo(insumoId) {
  try {
    const resposta = await fetch(`/api/insumos/${insumoId}/receita`);
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível abrir a receita.');
    receitaInsumoAtual = {
      insumoId, unidadeMedida: dados.unidadeMedida, precos: dados.precos || {}, insumos: dados.insumos || [],
    };
    document.getElementById('receita-insumo-nome').textContent = dados.nome;
    document.getElementById('receita-rendimento').value = dados.rendimento ?? '';
    document.getElementById('receita-rendimento-unidade').textContent = dados.unidadeMedida;
    document.getElementById('receita-ingredientes-body').innerHTML = '';
    (dados.ingredientes.length ? dados.ingredientes : [null]).forEach(_adicionarLinhaReceita);
    document.getElementById('btn-receita-apagar').style.display = dados.ingredientes.length ? '' : 'none';
    document.getElementById('receita-erro').style.display = 'none';
    _atualizarResumoReceita();
    document.getElementById('modal-receita-insumo').style.display = 'flex';
  } catch (erro) {
    alert(erro.message);
  }
}

function fecharModalReceitaInsumo() {
  document.getElementById('modal-receita-insumo').style.display = 'none';
  receitaInsumoAtual = null;
}

function _adicionarLinhaReceita(ingrediente) {
  const opcoes = receitaInsumoAtual.insumos
    .filter(i => i.id !== receitaInsumoAtual.insumoId)
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map(i => `<option value="${i.id}" ${ingrediente?.insumoId === i.id ? 'selected' : ''}>${escaparHtml(i.nome)}</option>`)
    .join('');
  const linha = document.createElement('tr');
  linha.innerHTML = `
    <td><select class="receita-ingrediente" aria-label="Ingrediente"><option value="">Escolha o ingrediente...</option>${opcoes}</select></td>
    <td class="receita-qtd-cell">
      <input type="number" class="receita-quantidade" min="0" step="any" aria-label="Quantidade na batelada">
      <select class="receita-unidade-select" aria-label="Unidade da quantidade"></select>
    </td>
    <td class="num receita-custo">—</td>
    <td><button type="button" class="btn-acao-icone btn-excluir" title="Tirar da receita"><i data-lucide="x"></i></button></td>`;
  const seletorInsumo = linha.querySelector('.receita-ingrediente');
  const seletorUnidade = linha.querySelector('.receita-unidade-select');
  const campo = linha.querySelector('.receita-quantidade');
  // Quantidade gravada é na unidade do insumo; o seletor mostra em grama
  // quando ele tem conteúdo cadastrado (pacote de 1 kg: 0,1 un = 100 g).
  _prepararSeletorUnidade(seletorUnidade, campo, _insumoDaLinhaReceita(linha), ingrediente?.quantidade ?? null);
  // Trocou o ingrediente: o número digitado fica, a unidade volta pro padrão dele.
  seletorInsumo.addEventListener('change', () => {
    const valor = campo.value;
    _prepararSeletorUnidade(seletorUnidade, campo, _insumoDaLinhaReceita(linha), null);
    campo.value = valor;
    _atualizarResumoReceita();
  });
  seletorUnidade.addEventListener('change', () => {
    _converterAoTrocarUnidade(seletorUnidade, campo, _insumoDaLinhaReceita(linha));
    _atualizarResumoReceita();
  });
  campo.addEventListener('input', _atualizarResumoReceita);
  linha.querySelector('button').addEventListener('click', () => { linha.remove(); _atualizarResumoReceita(); });
  document.getElementById('receita-ingredientes-body').appendChild(linha);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _insumoDaLinhaReceita(linha) {
  const id = parseInt(linha.querySelector('.receita-ingrediente').value, 10);
  return receitaInsumoAtual.insumos.find(i => i.id === id);
}

function _linhasReceita() {
  return [...document.querySelectorAll('#receita-ingredientes-body tr')].map(linha => ({
    linha,
    insumoId: parseInt(linha.querySelector('.receita-ingrediente').value, 10) || null,
    quantidade: _quantidadeNaUnidadeDoInsumo(linha.querySelector('.receita-unidade-select'),
      linha.querySelector('.receita-quantidade'), _insumoDaLinhaReceita(linha)),
  }));
}

function _atualizarResumoReceita() {
  if (!receitaInsumoAtual) return;
  let total = 0;
  let completo = true;
  let algum = false;
  _linhasReceita().forEach(({ linha, insumoId, quantidade }) => {
    const celula = linha.querySelector('.receita-custo');
    if (!insumoId) {
      celula.textContent = '—';
      return;
    }
    algum = true;
    const preco = receitaInsumoAtual.precos[String(insumoId)];
    if (preco == null || quantidade === null || Number.isNaN(quantidade)) {
      completo = false;
      celula.innerHTML = preco == null ? '<span class="text-muted" title="Esse insumo ainda não tem custo: cadastre em Estoque → editar insumo (ícone de engrenagem)">sem custo</span>' : '—';
      return;
    }
    total += quantidade * preco;
    celula.textContent = _formatarMoedaBRL(quantidade * preco);
  });

  const resumo = document.getElementById('receita-resumo');
  const rendimento = parseFloat(document.getElementById('receita-rendimento').value);
  if (!algum) {
    resumo.textContent = '';
  } else if (!completo) {
    // Mesma regra do resto do sistema: metade da conta daria custo menor
    // que o real. Enquanto isso, vale o custo cadastrado no próprio insumo.
    resumo.innerHTML = 'Custo da batelada: <strong>incompleto</strong> — falta custo ou quantidade em algum ingrediente. Até completar, vale o custo que o insumo já tinha.';
  } else {
    resumo.innerHTML = `Custo da batelada: <strong>${_formatarMoedaBRL(total)}</strong>`
      + (rendimento > 0 ? ` · <strong>${_formatarCustoPorUnidade(total / rendimento, receitaInsumoAtual.unidadeMedida)}</strong>` : '');
  }
}

async function _salvarReceitaInsumo(apagar) {
  const erro = document.getElementById('receita-erro');
  erro.style.display = 'none';
  const corpo = apagar
    ? { rendimento: null, ingredientes: [] }
    : {
        rendimento: document.getElementById('receita-rendimento').value,
        ingredientes: _linhasReceita().filter(l => l.insumoId).map(l => ({ insumoId: l.insumoId, quantidade: l.quantidade })),
      };
  try {
    const resposta = await fetch(`/api/insumos/${receitaInsumoAtual.insumoId}/receita`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível salvar a receita.');
    fecharModalReceitaInsumo();
    await carregarFichaTecnicaAtual();
  } catch (e) {
    erro.textContent = e.message;
    erro.style.display = 'block';
  }
}

document.getElementById('btn-receita-insumo-fechar')?.addEventListener('click', fecharModalReceitaInsumo);
document.getElementById('btn-receita-cancelar')?.addEventListener('click', fecharModalReceitaInsumo);
document.getElementById('btn-receita-adicionar')?.addEventListener('click', () => {
  _adicionarLinhaReceita(null);
  _atualizarResumoReceita();
});
document.getElementById('receita-rendimento')?.addEventListener('input', _atualizarResumoReceita);
document.getElementById('btn-receita-salvar')?.addEventListener('click', () => _salvarReceitaInsumo(false));
document.getElementById('btn-receita-apagar')?.addEventListener('click', () => {
  if (!confirm('Apagar a receita? O insumo volta a ser tratado como comprado pronto: a venda desconta ele mesmo, e não os ingredientes.')) return;
  _salvarReceitaInsumo(true);
});

// --- Painel de Integrações do Estoque (Etapa 0 do motor de compra) ---
// Mora em Configurações desde 2026-09-11 (pedido da Julia: ocupava espaço
// na tela de Estoque e é pouco usado), com a loja escolhida no próprio painel.
async function carregarIntegracoesEstoque() {
  const loja = integracoesLojaAtual;
  try {
    const [respPendentes, respVinculos, respBaixa] = await Promise.all([
      fetch(`/api/produtos-pendentes?unidade=${encodeURIComponent(loja)}`),
      fetch('/api/vinculos-manuais'),
      fetch('/api/estoque/baixa-automatica'),
    ]);
    const dadosPendentes = await respPendentes.json();
    const dadosVinculos = await respVinculos.json();
    const dadosBaixa = await respBaixa.json();
    renderBaixaAutomatica(loja, (dadosBaixa.lojas || {})[loja] || null);
    renderProdutosPendentesTabela(dadosPendentes.pendentes || []);
    renderVinculosManuaisTabela(dadosVinculos.vinculos || []);
  } catch (erro) {
    console.error('Falha ao carregar integrações do estoque:', erro);
  }
}

// Liga/desliga da baixa automática da loja (api_definir_baixa_automatica).
// Ligada, cada venda desconta a ficha técnica do estoque; desligada, nada
// desconta e a fila abaixo serve de lista do que falta casar. Liga só de
// hoje em diante, e o padrão é amanhã: dá tempo de contar o estoque antes
// do primeiro pedido.
function _dataIsoLocal(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function renderBaixaAutomatica(loja, inicio) {
  const caixa = document.getElementById('baixa-automatica-estado');
  if (!caixa) return;
  const hoje = new Date();
  const hojeIso = _dataIsoLocal(hoje);
  const dataCurta = (iso) => iso.split('-').reverse().slice(0, 2).join('/');

  if (inicio && inicio > hojeIso) {
    caixa.innerHTML = `
      <span class="badge-pill neu-orange">Baixa automática liga em ${dataCurta(inicio)}</span>
      <button type="button" class="btn-secondary-sm" id="btn-baixa-desligar">Cancelar</button>
      <p class="baixa-automatica-ajuda">A partir de ${dataCurta(inicio)}, cada venda desconta a ficha técnica do estoque desta loja. Conte o estoque antes do primeiro pedido desse dia.</p>`;
  } else if (inicio) {
    caixa.innerHTML = `
      <span class="badge-pill pos">Baixa automática ligada desde ${dataCurta(inicio)}</span>
      <button type="button" class="btn-secondary-sm" id="btn-baixa-desligar">Desligar</button>
      <p class="baixa-automatica-ajuda">Cada venda desconta a ficha técnica do estoque desta loja.</p>`;
  } else {
    const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
    caixa.innerHTML = `
      <span class="badge-pill badge-neutral">Baixa automática desligada</span>
      <label class="baixa-automatica-ligar">
        Ligar a partir de
        <input type="date" id="baixa-automatica-inicio" min="${hojeIso}" value="${_dataIsoLocal(amanha)}">
      </label>
      <button type="button" class="btn-primary-sm" id="btn-baixa-ligar">Ligar</button>
      <p class="baixa-automatica-ajuda">Enquanto estiver desligada, as vendas não descontam nada do estoque. Ligue quando a ficha técnica da loja estiver pronta, e conte o estoque antes do primeiro pedido do dia escolhido.</p>`;
  }

  document.getElementById('btn-baixa-ligar')?.addEventListener('click', () => {
    const data = document.getElementById('baixa-automatica-inicio').value;
    if (!data) return;
    if (!confirm(`Ligar a baixa automática de ${loja} a partir de ${dataCurta(data)}? As vendas desse dia em diante vão descontar a ficha técnica do estoque.`)) return;
    _salvarBaixaAutomatica(loja, data);
  });
  document.getElementById('btn-baixa-desligar')?.addEventListener('click', () => {
    if (!confirm(`Desligar a baixa automática de ${loja}? O que já foi descontado continua descontado; as próximas vendas não descontam mais.`)) return;
    _salvarBaixaAutomatica(loja, null);
  });
}

async function _salvarBaixaAutomatica(loja, inicio) {
  try {
    const resposta = await fetch('/api/estoque/baixa-automatica', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loja, inicio }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível salvar.');
    renderBaixaAutomatica(loja, dados.inicio);
  } catch (erro) {
    alert(erro.message);
  }
}

function renderProdutosPendentesTabela(pendentes) {
  const tbody = document.getElementById('produtos-pendentes-tabela-body');
  if (!tbody) return;

  if (!pendentes.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="panel-subtitle">Nenhum produto pendente — tudo que foi vendido já casou com a Ficha Técnica.</td></tr>`;
    return;
  }

  tbody.innerHTML = pendentes.map((p) => `
    <tr>
      <td class="font-bold">${escaparHtml(p.nome_produto)}${p.complemento ? ' <span class="text-muted">· complemento</span>' : ''}</td>
      <td>${p.vendas}</td>
      <td>${p.quantidade_total}</td>
      <td class="text-muted">${p.primeira_vez.split('-').reverse().join('/')}</td>
      <td class="acoes-linha">
        <button type="button" class="btn-secondary-sm" data-acao="vincular-produto" data-nome="${escaparHtml(p.nome_produto)}">Vincular</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-acao="vincular-produto"]').forEach((btn) => {
    btn.addEventListener('click', () => abrirModalVincularProduto(btn.dataset.nome));
  });
}

function renderVinculosManuaisTabela(vinculos) {
  const tbody = document.getElementById('vinculos-manuais-tabela-body');
  if (!tbody) return;

  tbody.innerHTML = vinculos.length
    ? vinculos.map((v) => `
      <tr>
        <td class="font-bold">${escaparHtml(v.nome_produto_normalizado)}</td>
        <td>${v.quantidade_por_unidade && v.quantidade_por_unidade !== 1 ? `${v.quantidade_por_unidade}× ` : ''}${escaparHtml(v.item_cardapio_nome)}</td>
        <td class="text-muted">${escaparHtml(v.criado_por || '—')}</td>
        <td class="text-muted">${new Date(v.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="4" class="panel-subtitle">Nenhum vínculo manual ainda.</td></tr>`;
}

async function abrirModalVincularProduto(nomeProduto) {
  vincularProdutoContexto = nomeProduto;
  document.getElementById('vincular-produto-nome').textContent = nomeProduto;

  const select = document.getElementById('vincular-produto-item-select');
  if (!itensCardapioTodosCache) {
    const resposta = await fetch('/api/itens-cardapio/todos');
    const dados = await resposta.json();
    itensCardapioTodosCache = dados.itens || [];
  }
  select.innerHTML = itensCardapioTodosCache
    .map((item) => `<option value="${item.id}">${escaparHtml(item.nome)} ${item.tipo === 'complemento' ? '(complemento)' : ''}</option>`)
    .join('');

  comboComponentes = [];
  document.querySelectorAll('#vincular-modo-tabs .tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  document.getElementById('vincular-modo-simples').style.display = '';
  document.getElementById('vincular-modo-combo').style.display = 'none';
  document.getElementById('modal-vincular-produto').style.display = 'flex';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function fecharModalVincularProduto() {
  document.getElementById('modal-vincular-produto').style.display = 'none';
  document.getElementById('vincular-produto-quantidade').value = '1';
  vincularProdutoContexto = null;
  comboComponentes = [];
}

// Componentes do combo sendo montado no modal: [{itemCardapioId, quantidade}]
let comboComponentes = [];

function _vincularModo() {
  return document.querySelector('#vincular-modo-tabs .tab-btn.active')?.dataset.modo || 'simples';
}

function renderComboComponentes() {
  const container = document.getElementById('combo-componentes');
  if (!container) return;
  if (!comboComponentes.length) {
    container.innerHTML = `<p class="panel-subtitle">Nenhum item ainda — adicione o que vem dentro do combo.</p>`;
    return;
  }
  const opcoes = (selecionado) => (itensCardapioTodosCache || [])
    .map((item) => `<option value="${item.id}"${String(item.id) === String(selecionado) ? ' selected' : ''}>${escaparHtml(item.nome)}${item.tipo === 'complemento' ? ' (complemento)' : ''}</option>`)
    .join('');
  container.innerHTML = comboComponentes.map((componente, indice) => `
    <div class="combo-linha">
      <select data-combo-item="${indice}">${opcoes(componente.itemCardapioId)}</select>
      <input type="number" min="0.01" step="0.01" value="${componente.quantidade}" data-combo-qtd="${indice}" aria-label="Quantidade">
      <button type="button" class="btn-acao-icone btn-excluir" data-combo-remover="${indice}" title="Tirar do combo">
        <i data-lucide="x"></i>
      </button>
    </div>
  `).join('');

  container.querySelectorAll('[data-combo-item]').forEach((select) => {
    select.addEventListener('change', () => {
      comboComponentes[parseInt(select.dataset.comboItem, 10)].itemCardapioId = select.value;
    });
  });
  container.querySelectorAll('[data-combo-qtd]').forEach((input) => {
    input.addEventListener('change', () => {
      comboComponentes[parseInt(input.dataset.comboQtd, 10)].quantidade = parseFloat(input.value) || 1;
    });
  });
  container.querySelectorAll('[data-combo-remover]').forEach((btn) => {
    btn.addEventListener('click', () => {
      comboComponentes.splice(parseInt(btn.dataset.comboRemover, 10), 1);
      renderComboComponentes();
    });
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

document.querySelectorAll('#vincular-modo-tabs .tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#vincular-modo-tabs .tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const combo = btn.dataset.modo === 'combo';
    document.getElementById('vincular-modo-simples').style.display = combo ? 'none' : '';
    document.getElementById('vincular-modo-combo').style.display = combo ? '' : 'none';
    if (combo) renderComboComponentes();
  });
});

document.getElementById('btn-combo-adicionar')?.addEventListener('click', () => {
  const primeiro = (itensCardapioTodosCache || [])[0];
  comboComponentes.push({ itemCardapioId: primeiro ? primeiro.id : '', quantidade: 1 });
  renderComboComponentes();
});

document.getElementById('btn-vincular-produto-fechar')?.addEventListener('click', fecharModalVincularProduto);
document.getElementById('btn-vincular-produto-cancelar')?.addEventListener('click', fecharModalVincularProduto);

document.getElementById('form-vincular-produto')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!vincularProdutoContexto) return;
  const ehCombo = _vincularModo() === 'combo';
  if (ehCombo && !comboComponentes.length) {
    alert('Adicione ao menos um item ao combo.');
    return;
  }
  const rota = ehCombo ? '/api/produtos-pendentes/composicao' : '/api/produtos-pendentes/vincular';
  const corpo = ehCombo
    ? {
        nomeProduto: vincularProdutoContexto,
        componentes: comboComponentes.map((c) => ({
          itemCardapioId: parseInt(c.itemCardapioId, 10),
          quantidade: c.quantidade,
        })),
      }
    : {
        nomeProduto: vincularProdutoContexto,
        itemCardapioId: parseInt(document.getElementById('vincular-produto-item-select').value, 10),
        quantidadePorUnidade: parseFloat(document.getElementById('vincular-produto-quantidade').value),
      };
  try {
    const resposta = await fetch(rota, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao salvar');
    fecharModalVincularProduto();
    await carregarIntegracoesEstoque();
  } catch (erro) {
    console.error('Falha ao vincular produto:', erro);
    alert(erro.message || 'Não foi possível vincular esse produto.');
  }
});

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
        <td>${_formatarQuantidade(lote.quantidade, lote.unidadeMedida)}</td>
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
        ${(f.lojas || []).length ? `<span class="insumo-unidade">Compra: ${escaparHtml(f.lojas.join(', '))}</span>` : ''}
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
  const lojasFornecedor = fornecedor?.lojas || [];
  document.querySelectorAll('#fornecedor-lojas input').forEach((caixa) => { caixa.checked = lojasFornecedor.includes(caixa.value); });
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
    lojas: Array.from(document.querySelectorAll('#fornecedor-lojas input:checked')).map((caixa) => caixa.value),
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

function _formatarMoedaCompacta(valor) {
  return (valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderCotacoesLista() {
  const isAdmin = window.usuarioLogado?.papel === 'admin';
  const tbody = document.getElementById('cotacoes-tabela-body');
  if (!tbody) return;

  const thAcoes = document.getElementById('cotacoes-th-acoes');
  if (thAcoes) thAcoes.style.display = isAdmin ? '' : 'none';
  const acoesTopo = document.getElementById('cotacoes-acoes-admin');
  if (acoesTopo) acoesTopo.style.display = isAdmin ? '' : 'none';

  // Filtros estilo VMarket (print da Julia, 2026-09-04): Mostrar
  // (aberta/fechada), Tipo (manual × veio de Requisição), Busca (nome ou
  // nº) e Dias (criada nos últimos N) — tudo client-side, mesma lista já
  // carregada, sem rota nova.
  const filtroMostrar = document.getElementById('cotacoes-filtro-mostrar')?.value || '';
  const filtroTipo = document.getElementById('cotacoes-filtro-tipo')?.value || '';
  const filtroBusca = (document.getElementById('cotacoes-filtro-busca')?.value || '').trim().toLowerCase();
  const filtroDias = document.getElementById('cotacoes-filtro-dias')?.value || '';

  const agora = new Date();
  const lista = cotacoesLista.filter((c) => {
    if (filtroMostrar && c.status !== filtroMostrar) return false;
    if (filtroTipo === 'manual' && !c.manual) return false;
    if (filtroTipo === 'requisicao' && c.manual) return false;
    if (filtroBusca && !c.titulo.toLowerCase().includes(filtroBusca) && String(c.id) !== filtroBusca) return false;
    if (filtroDias) {
      const dias = (agora - new Date(c.criadoEm)) / (1000 * 60 * 60 * 24);
      if (dias > parseInt(filtroDias, 10)) return false;
    }
    return true;
  });

  const colspan = 9 + (isAdmin ? 1 : 0);
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="panel-subtitle">Nenhuma cotação encontrada pra esse filtro.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map((c) => {
    const respostas = c.percentualRespostas;
    const celulaRespostas = respostas === null
      ? '<span class="text-muted">—</span>'
      : `<div class="progress-container"><div class="progress-bar ${respostas >= 70 ? 'bar-green' : respostas >= 30 ? 'bar-orange' : 'bar-red'}" style="width:${respostas}%"></div></div><span class="text-muted" style="font-size:0.8em;">${respostas}%</span>`;
    return `
    <tr>
      <td class="text-muted">${c.id}</td>
      <td class="font-bold">${escaparHtml(c.titulo)}</td>
      <td>${celulaRespostas}</td>
      <td>${c.insumosComprados} / ${c.totalInsumos}</td>
      <td>${c.totalFornecedores}</td>
      <td><span class="badge-pill ${STATUS_CLASSE_BADGE_COTACAO[c.status]}">${STATUS_LABEL_COTACAO[c.status]}</span></td>
      <td class="text-muted">${new Date(c.criadoEm).toLocaleDateString('pt-BR')}</td>
      <td>R$ ${_formatarMoedaCompacta(c.economia)}</td>
      <td>R$ ${_formatarMoedaCompacta(c.valorPedido)}</td>
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
  `;
  }).join('');

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

document.getElementById('cotacoes-filtro-mostrar')?.addEventListener('change', renderCotacoesLista);
document.getElementById('cotacoes-filtro-tipo')?.addEventListener('change', renderCotacoesLista);
document.getElementById('cotacoes-filtro-busca')?.addEventListener('input', renderCotacoesLista);
document.getElementById('cotacoes-filtro-dias')?.addEventListener('change', renderCotacoesLista);

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
    const btnLancarPreco = document.getElementById('btn-cotacao-lancar-preco');
    if (btnLancarPreco) btnLancarPreco.style.display = isAdmin && dados.cotacao.status === 'aberta' ? '' : 'none';

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
      // Cotação manual (catalogoCompleto) não tem quantidade por loja — "Gerar
      // pedidos" nunca acha o que gerar nesse modo, então nem mostra o botão
      // (pedido de compra de verdade sai pela Requisição → Cotação por enquanto).
      btnGerarPedidos.style.display = isAdmin && !dados.catalogoCompleto && (dados.itens || []).length > 0 ? '' : 'none';
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

    renderCotacaoComparacao(dados.grupos, isAdmin, dados.itens || [], !!dados.catalogoCompleto);
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
    lojasCotacaoAtual = dados.lojas || [];
    renderConvitesCotacao(dados.convites || []);
  } catch (erro) {
    console.error('Falha ao carregar convites:', erro);
  }
}

const STATUS_LABEL_CONVITE = { aberta: 'Aguardando resposta', respondida: 'Respondido' };
let convitesCotacaoAtuais = [];
let lojasCotacaoAtual = [];

// Lista do "Convidar fornecedores": quem fornece pras lojas dessa cotação
// (Fornecedores → "Lojas que compram dele") já vem marcado, o resto fica
// desmarcado embaixo. Sem ninguém marcado pra essas lojas, marca todo
// fornecedor ativo — o jeito de antes (pedido da Julia, 2026-09-11).
async function renderListaConvidarFornecedores() {
  const lista = document.getElementById('convidar-fornecedores-lista');
  if (!lista) return;
  lista.innerHTML = '<p class="panel-subtitle">Carregando...</p>';
  try {
    const resposta = await fetch('/api/fornecedores');
    const dados = await resposta.json();
    const ativos = (dados.fornecedores || []).filter((f) => f.ativo);
    const ehSugerido = (f) => (lojasCotacaoAtual.length
      ? f.lojas.some((loja) => lojasCotacaoAtual.includes(loja))
      : f.lojas.length > 0);
    const sugeridos = ativos.filter(ehSugerido);
    const outros = ativos.filter((f) => !ehSugerido(f));
    const semSugestao = !sugeridos.length;
    const linha = (f, marcado, dica) => `
      <label class="convidar-fornecedor-item">
        <input type="checkbox" value="${f.id}" ${marcado ? 'checked' : ''}>
        <span>${escaparHtml(f.nome)}</span>
        ${dica ? `<span class="text-muted">${dica}</span>` : ''}
      </label>`;
    lista.innerHTML = semSugestao
      ? `<p class="panel-subtitle">Nenhum fornecedor marcado pra ${lojasCotacaoAtual.length ? escaparHtml(lojasCotacaoAtual.join(', ')) : 'essa cotação'} em Fornecedores — marquei todos.</p>` + ativos.map((f) => linha(f, true, '')).join('')
      : sugeridos.map((f) => linha(f, true, `compramos pra ${escaparHtml(f.lojas.filter((l) => !lojasCotacaoAtual.length || lojasCotacaoAtual.includes(l)).join(', '))}`)).join('') + outros.map((f) => linha(f, false, '')).join('');
  } catch (erro) {
    console.error('Falha ao carregar fornecedores:', erro);
    lista.innerHTML = '<p class="form-erro">Não foi possível carregar os fornecedores.</p>';
  }
}

// Sem API oficial do WhatsApp Business ainda (pendência separada, travada
// esperando credencial) — wa.me é o jeito de já deixar a mensagem e o link
// prontos, sem copiar/colar; quem manda de verdade continua sendo a
// pessoa, apertando "Enviar" dentro do WhatsApp (é assim que o próprio
// WhatsApp evita automação de spam, não dá pra pular esse clique).
function _linkWhatsAppConvite(telefone, fornecedorNome, link) {
  const digitos = (telefone || '').replace(/\D/g, '');
  if (!digitos) return null;
  const numeroCompleto = digitos.startsWith('55') ? digitos : `55${digitos}`;
  const mensagem = `Olá! Segue o link pra você preencher os preços da nossa cotação:\n${link}`;
  return `https://wa.me/${numeroCompleto}?text=${encodeURIComponent(mensagem)}`;
}

function renderConvitesCotacao(convites) {
  convitesCotacaoAtuais = convites;
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
    const linkWhatsApp = _linkWhatsAppConvite(c.fornecedorTelefone, c.fornecedorNome, link);
    return `
      <tr>
        <td class="font-bold">${escaparHtml(c.fornecedorNome)}</td>
        <td><span class="badge-pill ${statusClasse}">${statusTexto}</span></td>
        <td class="text-muted">${new Date(c.prazoValidade).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
        <td class="acoes-linha">
          ${linkWhatsApp ? `
            <a class="btn-secondary-sm" href="${escaparHtml(linkWhatsApp)}" target="_blank" rel="noopener">
              <i data-lucide="send"></i>
              Enviar por WhatsApp
            </a>
          ` : `
            <button type="button" class="btn-secondary-sm" data-acao="copiar-link-convite" data-link="${escaparHtml(link)}" title="Fornecedor sem telefone cadastrado">
              <i data-lucide="copy"></i>
              Copiar link
            </button>
          `}
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
  renderListaConvidarFornecedores();
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
  const fornecedorIds = Array.from(document.querySelectorAll('#convidar-fornecedores-lista input:checked')).map((caixa) => parseInt(caixa.value, 10));
  if (!fornecedorIds.length) {
    alert('Marque pelo menos um fornecedor.');
    return;
  }
  try {
    const resposta = await fetch(`/api/cotacoes/${cotacaoAtualId}/convites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prazoValidade, fornecedorIds }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao gerar convites');
    document.getElementById('modal-convidar-fornecedores').style.display = 'none';
    await carregarConvitesCotacao();

    // Não tenta mais abrir o WhatsApp automático aqui — window.open() depois
    // de um fetch/await perde a permissão do navegador e fica bloqueado sem
    // avisar nada (achado ao vivo, 2026-09-04). Cada convite pendente já tem
    // o botão "Enviar por WhatsApp" na tabela logo abaixo (link de verdade,
    // nunca bloqueado) — é só clicar um por um ali.
    const pendentes = convitesCotacaoAtuais.filter((c) => c.status === 'aberta');
    const semTelefone = pendentes.filter((c) => !c.fornecedorTelefone).map((c) => c.fornecedorNome);
    let mensagem = `${pendentes.length} convite(s) pendente(s) — clique em "Enviar por WhatsApp" na tabela abaixo, um por fornecedor.`;
    if (semTelefone.length) mensagem += ` Sem telefone cadastrado (copie o link na tabela): ${semTelefone.join(', ')}.`;
    alert(mensagem);
  } catch (erro) {
    console.error('Falha ao convidar fornecedores:', erro);
    alert(erro.message || 'Não foi possível gerar os convites.');
  }
});

let cotacaoComparacaoDados = { grupos: [], isAdmin: false, itens: [], catalogoCompleto: false };

function renderCotacaoComparacao(grupos, isAdmin, itens, catalogoCompleto) {
  cotacaoComparacaoDados = { grupos, isAdmin, itens: itens || [], catalogoCompleto: !!catalogoCompleto };
  _renderTabelaComparacaoCotacao();
}

function _iniciaisFornecedor(nome) {
  return nome.trim().split(/\s+/).slice(0, 2).map(parte => parte[0]).join('').toUpperCase();
}

// Paleta fixa pra dar uma cor de avatar diferente por fornecedor (estilo
// VMarket, print da Julia 2026-09-04) — determinística pelo id, não muda
// de cor a cada render.
const PALETA_AVATAR_FORNECEDOR = ['#e74c3c', '#27ae60', '#8e44ad', '#2980b9', '#f39c12', '#16a085', '#c0392b', '#7f8c8d'];
function _corAvatarFornecedor(id) {
  return PALETA_AVATAR_FORNECEDOR[id % PALETA_AVATAR_FORNECEDOR.length];
}

// Ícone de WhatsApp no cabeçalho do fornecedor na grid — contato direto
// (sem mensagem pronta, ao contrário do convite), pra ela poder perguntar
// algo sobre o preço já lançado. Mesmo critério de normalizar telefone
// de `_linkWhatsAppConvite`.
function _linkWhatsAppContato(telefone) {
  const digitos = (telefone || '').replace(/\D/g, '');
  if (!digitos) return null;
  const numeroCompleto = digitos.startsWith('55') ? digitos : `55${digitos}`;
  return `https://wa.me/${numeroCompleto}`;
}

function _linkWhatsAppTexto(telefone, mensagem) {
  const digitos = (telefone || '').replace(/\D/g, '');
  if (!digitos) return null;
  const numeroCompleto = digitos.startsWith('55') ? digitos : `55${digitos}`;
  return `https://wa.me/${numeroCompleto}?text=${encodeURIComponent(mensagem)}`;
}

function _renderTabelaComparacaoCotacao() {
  const { grupos, isAdmin, itens, catalogoCompleto } = cotacaoComparacaoDados;
  const container = document.getElementById('cotacao-comparacao-lista');
  const buscaWrapper = document.getElementById('cotacao-comparacao-busca-wrapper');
  const categoriaSelectEl = document.getElementById('cotacao-comparacao-categoria');
  const respondidoWrapper = document.getElementById('cotacao-filtro-respondido-wrapper');
  const btnSelecionarMelhores = document.getElementById('btn-cotacao-selecionar-melhores');
  if (!container) return;

  // Cotação vinda de Requisição (não catálogo completo) sem preço nenhum
  // ainda: mostra só a lista de insumo+quantidade do déficit (comportamento
  // de 2026-09-02, sem mudança).
  if (!catalogoCompleto && !grupos.length) {
    if (btnSelecionarMelhores) btnSelecionarMelhores.style.display = 'none';
    if (categoriaSelectEl) categoriaSelectEl.style.display = 'none';
    if (respondidoWrapper) respondidoWrapper.style.display = 'none';
    if (!itens.length) {
      if (buscaWrapper) buscaWrapper.style.display = 'none';
      container.innerHTML = `<p class="panel-subtitle">Nenhum preço lançado ainda — use o formulário acima.</p>`;
      return;
    }
    if (buscaWrapper) buscaWrapper.style.display = '';
    const termoSemPreco = (document.getElementById('cotacao-comparacao-busca')?.value || '').trim().toLowerCase();
    const itensFiltrados = itens.filter(item =>
      !termoSemPreco || item.nome.toLowerCase().includes(termoSemPreco) || item.categoria.toLowerCase().includes(termoSemPreco)
    );
    if (!itensFiltrados.length) {
      container.innerHTML = `<p class="panel-subtitle">Nenhum insumo encontrado pra essa busca.</p>`;
      return;
    }
    container.innerHTML = `
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Insumo</th>
              <th>Comprar</th>
            </tr>
          </thead>
          <tbody>
            ${itensFiltrados.map(item => `
              <tr>
                <td class="font-bold">${escaparHtml(item.nome)}<span class="text-muted td-insumo-categoria"> · ${escaparHtml(item.categoria)}</span></td>
                <td>${_formatarQuantidade(item.quantidadeTotal, item.unidadeMedida)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <p class="panel-subtitle">Ainda sem preço nenhum lançado — lance na mão acima ou clique em "Convidar fornecedores" pra eles preencherem direto.</p>
    `;
    return;
  }

  // Daqui pra baixo: grid completa insumo × fornecedor. Em cotação
  // catálogo-completo (manual, estilo VMarket, pedido da Julia
  // 2026-09-03) as linhas vêm de TODO o catálogo (`itens`), mesmo sem
  // preço nenhum lançado ainda; em cotação de Requisição já com pelo
  // menos 1 preço, as linhas continuam vindo só de `grupos` (comportamento
  // de sempre, sem mudança).
  if (buscaWrapper) buscaWrapper.style.display = '';
  if (categoriaSelectEl) categoriaSelectEl.style.display = catalogoCompleto ? '' : 'none';
  if (respondidoWrapper) respondidoWrapper.style.display = '';
  if (btnSelecionarMelhores) btnSelecionarMelhores.style.display = (isAdmin && grupos.length) ? '' : 'none';

  const termo = (document.getElementById('cotacao-comparacao-busca')?.value || '').trim().toLowerCase();
  const categoriaFiltro = document.getElementById('cotacao-comparacao-categoria')?.value || '';
  const mostrarRespondido = document.getElementById('cotacao-filtro-respondido')?.checked ?? true;
  const mostrarNaoRespondido = document.getElementById('cotacao-filtro-nao-respondido')?.checked ?? true;
  const gruposPorInsumo = new Map(grupos.map(g => [g.insumoId, g]));
  // Linha por insumo de `itens` (catálogo completo ou déficit calculado da
  // Requisição) + preço de `grupos` quando já tiver — sem isso, assim que o
  // PRIMEIRO preço de uma cotação de Requisição era lançado, a lista virava
  // só `grupos` (que só tem insumo já precificado) e todo o resto do
  // déficit sumia da tela até ganhar preço também. Achado testando o fluxo
  // ao vivo nas 4 lojas, 2026-09-04. `grupos` pode ainda ter um insumo fora
  // do déficit calculado (preço lançado na mão pra algo que não é
  // `itens`) — esses entram à parte, no fim, sem duplicar.
  const idsComItem = new Set(itens.map(item => item.insumoId));
  const linhasDeItens = itens.map(item => ({
    insumoId: item.insumoId,
    insumoNome: item.nome,
    categoria: item.categoria,
    precos: gruposPorInsumo.get(item.insumoId)?.precos || [],
  }));
  const linhasExtrasDeGrupos = grupos.filter(g => !idsComItem.has(g.insumoId));
  const linhasBase = [...linhasDeItens, ...linhasExtrasDeGrupos];

  // Filtro "Seção" (categoria) — só faz sentido no catálogo completo, onde
  // a lista é grande o bastante (todo insumo) pra valer a pena filtrar por
  // categoria; numa cotação de Requisição (déficit, poucos itens) fica
  // escondido (ver visibilidade abaixo).
  const categoriaSelect = document.getElementById('cotacao-comparacao-categoria');
  if (categoriaSelect && catalogoCompleto) {
    const categoriasUnicas = [...new Set(linhasBase.map(l => l.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const valorAtual = categoriaSelect.value;
    const opcoesEsperadas = ['', ...categoriasUnicas];
    const opcoesAtuais = [...categoriaSelect.options].map(o => o.value);
    if (opcoesAtuais.join('|') !== opcoesEsperadas.join('|')) {
      categoriaSelect.innerHTML = '<option value="">Todas as seções</option>' +
        categoriasUnicas.map(c => `<option value="${escaparHtml(c)}">${escaparHtml(c)}</option>`).join('');
      categoriaSelect.value = opcoesEsperadas.includes(valorAtual) ? valorAtual : '';
    }
  }

  const linhasFiltradas = linhasBase.filter(l => {
    if (termo && !l.insumoNome.toLowerCase().includes(termo) && !l.categoria.toLowerCase().includes(termo)) return false;
    if (categoriaFiltro && l.categoria !== categoriaFiltro) return false;
    const respondido = l.precos.length > 0;
    if (respondido && !mostrarRespondido) return false;
    if (!respondido && !mostrarNaoRespondido) return false;
    return true;
  });

  if (!linhasFiltradas.length) {
    container.innerHTML = `<p class="panel-subtitle">Nenhum insumo encontrado pra esse filtro.</p>`;
    return;
  }

  const fornecedoresMap = new Map();
  grupos.forEach(g => g.precos.forEach(p => {
    if (!fornecedoresMap.has(p.fornecedorId)) fornecedoresMap.set(p.fornecedorId, { nome: p.fornecedorNome, telefone: p.fornecedorTelefone });
  }));
  const fornecedores = [...fornecedoresMap.entries()]
    .map(([id, dados]) => ({ id, nome: dados.nome, telefone: dados.telefone }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const itensPorInsumo = {};
  itens.forEach(item => { itensPorInsumo[item.insumoId] = item; });

  const theadFornecedores = fornecedores.map(f => {
    const linkWhats = _linkWhatsAppContato(f.telefone);
    return `
    <th class="th-comparacao-fornecedor">
      <div class="comparacao-fornecedor-cabecalho">
        <span class="avatar avatar-sm" style="background-color: ${_corAvatarFornecedor(f.id)};">${escaparHtml(_iniciaisFornecedor(f.nome))}</span>
        <span>${escaparHtml(f.nome)}</span>
        ${linkWhats ? `<a href="${escaparHtml(linkWhats)}" target="_blank" rel="noopener" class="icone-whatsapp-fornecedor" title="Chamar ${escaparHtml(f.nome)} no WhatsApp"><i data-lucide="message-circle"></i></a>` : ''}
      </div>
    </th>
  `;
  }).join('');

  const linhas = linhasFiltradas.map(linha => {
    const item = itensPorInsumo[linha.insumoId];
    const precoPorFornecedor = new Map(linha.precos.map(p => [p.fornecedorId, p]));

    const celulas = fornecedores.map(f => {
      const preco = precoPorFornecedor.get(f.id);
      if (!preco) {
        return `<td class="td-comparacao-preco td-sem-preco">—</td>`;
      }
      const classes = ['td-comparacao-preco'];
      if (preco.selecionado) classes.push('selecionado');
      return `
        <td class="${classes.join(' ')}" ${isAdmin ? `data-acao="selecionar-preco" data-id="${preco.id}" title="Marcar como vencedor"` : ''}>
          <div class="comparacao-preco-conteudo">
            ${preco.selecionado ? '<i data-lucide="check-circle" class="icone-preco-selecionado"></i>' : ''}
            <span class="comparacao-preco-valor">R$ ${preco.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
          ${isAdmin ? `<button type="button" class="btn-acao-icone btn-excluir btn-remover-preco-comparacao" data-acao="excluir-preco" data-id="${preco.id}" title="Remover preço"><i data-lucide="trash-2"></i></button>` : ''}
        </td>
      `;
    }).join('');

    const quantidadeCelula = catalogoCompleto
      ? `<input type="number" step="0.01" min="0" class="input-quantidade-cotacao" data-insumo-id="${linha.insumoId}" value="${item && item.quantidadeTotal !== null ? item.quantidadeTotal : ''}" placeholder="0" ${isAdmin ? '' : 'disabled'}>`
      : (item ? `${_formatarQuantidade(item.quantidadeTotal, item.unidadeMedida)}` : '—');

    const ultimaCompra = item?.ultimaCompra;
    const celulaUltimaCompra = ultimaCompra
      ? `<div class="ultima-compra-conteudo">
           <span>R$ ${ultimaCompra.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
           <span class="text-muted" style="font-size:0.8em;">${new Date(ultimaCompra.dataIso).toLocaleDateString('pt-BR')} · ${escaparHtml(ultimaCompra.fornecedorNome)}</span>
         </div>`
      : '<span class="text-muted">—</span>';

    return `
      <tr>
        <td class="td-insumo-fixo">
          <span class="font-bold">${escaparHtml(linha.insumoNome)}</span>
          <span class="text-muted td-insumo-categoria">${escaparHtml(linha.categoria)}</span>
        </td>
        <td class="text-muted td-quantidade-fixa">${quantidadeCelula}</td>
        <td class="text-muted td-ultima-compra">${celulaUltimaCompra}</td>
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
          <th class="th-ultima-compra">Última Compra</th>
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
    if (catalogoCompleto) {
      container.querySelectorAll('.input-quantidade-cotacao').forEach(input => {
        input.addEventListener('change', async () => {
          if (input.value === '') return;
          await fetch(`/api/cotacoes/${cotacaoAtualId}/itens/${input.dataset.insumoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantidade: parseFloat(input.value) }),
          });
        });
      });
    }
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

document.getElementById('cotacao-comparacao-busca')?.addEventListener('input', _renderTabelaComparacaoCotacao);
document.getElementById('cotacao-comparacao-categoria')?.addEventListener('change', _renderTabelaComparacaoCotacao);
document.getElementById('cotacao-filtro-respondido')?.addEventListener('change', _renderTabelaComparacaoCotacao);
document.getElementById('cotacao-filtro-nao-respondido')?.addEventListener('change', _renderTabelaComparacaoCotacao);

document.getElementById('btn-cotacao-selecionar-melhores')?.addEventListener('click', async () => {
  if (!confirm('Marcar o menor preço de cada insumo como vencedor? Isso substitui qualquer vencedor já marcado na mão.')) return;
  try {
    const resposta = await fetch(`/api/cotacoes/${cotacaoAtualId}/selecionar-melhores-precos`, { method: 'POST' });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao selecionar melhores preços');
    await recarregarCotacaoDetalhe();
  } catch (erro) {
    console.error('Falha ao selecionar melhores preços:', erro);
    alert(erro.message || 'Não foi possível selecionar os melhores preços.');
  }
});

document.getElementById('btn-cotacao-gerar-pedidos')?.addEventListener('click', async () => {
  if (!confirm('Gerar pedido de compra pros insumos já com vencedor escolhido? Quem ainda não tem vencedor fica de fora, sem problema — dá pra gerar de novo depois.')) return;
  try {
    const resposta = await fetch(`/api/cotacoes/${cotacaoAtualId}/gerar-pedidos`, { method: 'POST' });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao gerar pedidos');
    let mensagem = `${dados.pedidosCriados.length} pedido(s) gerado(s).`;
    if (dados.insumosSemVencedor > 0) mensagem += ` ${dados.insumosSemVencedor} insumo(s) ainda sem vencedor escolhido ficaram de fora.`;
    // Não tenta mais abrir o WhatsApp automático aqui — window.open() depois
    // de um fetch/await perde a permissão do navegador e fica bloqueado sem
    // avisar nada (achado ao vivo, 2026-09-04). Cada pedido na tela de
    // Pedidos agora tem seu próprio botão "Enviar por WhatsApp" (link de
    // verdade, nunca bloqueado).
    mensagem += ' Envie pelo WhatsApp direto na tela de Pedidos.';

    alert(mensagem);
    window.location.href = 'pedidos.html';
  } catch (erro) {
    console.error('Falha ao gerar pedidos:', erro);
    alert(erro.message || 'Não foi possível gerar os pedidos.');
  }
});

document.getElementById('btn-cotacao-lancar-preco')?.addEventListener('click', () => {
  document.getElementById('cotacao-preco-valor').value = '';
  document.getElementById('modal-lancar-preco-cotacao').style.display = 'flex';
});
document.getElementById('btn-lancar-preco-fechar')?.addEventListener('click', () => {
  document.getElementById('modal-lancar-preco-cotacao').style.display = 'none';
});
document.getElementById('btn-lancar-preco-cancelar')?.addEventListener('click', () => {
  document.getElementById('modal-lancar-preco-cotacao').style.display = 'none';
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
    document.getElementById('modal-lancar-preco-cotacao').style.display = 'none';
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

let pedidosWhatsAppLinks = {}; // { [pedidoId]: linkWhatsApp } — só pedidos ainda "enviado"

// Reconstrói o link de WhatsApp de cada pedido pendente ANTES de renderizar
// a tabela, pra virar um <a href> de verdade — clique direto num link nunca
// é bloqueado pelo navegador, diferente de window.open() disparado depois
// de um fetch (é exatamente o que quebrava o auto-envio de "Gerar pedidos"
// silenciosamente: o navegador derruba a permissão de abrir aba assim que
// passa por um await, achado ao vivo em 2026-09-04).
async function carregarLinksWhatsAppPedidos(lista) {
  pedidosWhatsAppLinks = {};
  const pendentes = lista.filter((p) => p.status === 'enviado');
  await Promise.all(pendentes.map(async (p) => {
    try {
      const resposta = await fetch(`/api/pedidos/${p.id}/whatsapp`);
      if (!resposta.ok) return;
      const dados = await resposta.json();
      const link = _linkWhatsAppTexto(dados.telefone, dados.mensagem);
      if (link) pedidosWhatsAppLinks[p.id] = link;
    } catch (erro) {
      console.error('Falha ao montar link de WhatsApp do pedido', p.id, erro);
    }
  }));
}

async function carregarPedidos() {
  const tbody = document.getElementById('pedidos-tabela-body');
  if (!tbody) return;
  try {
    const resposta = await fetch('/api/pedidos');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    pedidosLista = dados.pedidos || [];
    if (dados.estagios) pedidoEstagios = dados.estagios;
    await carregarLinksWhatsAppPedidos(pedidosLista);
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
        ${pedidosWhatsAppLinks[p.id] ? `
          <a class="btn-acao-icone" href="${escaparHtml(pedidosWhatsAppLinks[p.id])}" target="_blank" rel="noopener" title="Enviar pedido por WhatsApp">
            <i data-lucide="send"></i>
          </a>
        ` : ''}
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
    pedidoDetalheAtual.linkWhatsApp = pedidosWhatsAppLinks[pedidoId] || null;
    if (!pedidoDetalheAtual.linkWhatsApp && dados.status === 'enviado') {
      try {
        const respWhats = await fetch(`/api/pedidos/${pedidoId}/whatsapp`);
        if (respWhats.ok) {
          const dadosWhats = await respWhats.json();
          pedidoDetalheAtual.linkWhatsApp = _linkWhatsAppTexto(dadosWhats.telefone, dadosWhats.mensagem);
        }
      } catch (erroWhats) {
        console.error('Falha ao montar link de WhatsApp do pedido:', erroWhats);
      }
    }
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

  const linkWhats = document.getElementById('link-pedido-whatsapp');
  if (linkWhats) {
    if (p.linkWhatsApp) {
      linkWhats.href = p.linkWhatsApp;
      linkWhats.style.display = '';
    } else {
      linkWhats.style.display = 'none';
    }
  }

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
      <td>${_formatarQuantidade(item.quantidade, item.unidadeMedida)}</td>
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
  if (btnAprovar) {
    btnAprovar.disabled = c.status === 'aberta';
    btnAprovar.textContent = c.status === 'aprovada' ? 'Ver Cotação/Pedido' : 'Fazer Cotação/Pedido';
  }
  if (btnReabrir) btnReabrir.style.display = (isAdmin && c.status !== 'aberta') ? '' : 'none';

  const thAcoes = document.getElementById('contagem-detalhe-th-acoes');
  if (thAcoes) thAcoes.style.display = isAdmin ? '' : 'none';

  const tbody = document.getElementById('contagem-detalhe-tabela-body');
  tbody.innerHTML = c.itens.map((item) => {
    const preenchido = item.quantidadePreenchida;
    const ideal = item.quantidadeIdeal;
    const deficit = (preenchido !== null && ideal !== null) ? arredondarQuantidadeCompra(ideal - preenchido, item.fatorConversaoCompra) : null;
    return `
      <tr>
        <td class="font-bold">${escaparHtml(item.nome)}</td>
        <td class="text-muted">${escaparHtml(item.categoria)}</td>
        <td>${preenchido === null ? '<span class="text-muted">não preenchido</span>' : `${_formatarQuantidade(preenchido, item.unidadeMedida)}`}</td>
        <td>${ideal === null ? '<span class="text-muted">—</span>' : `${_formatarQuantidade(ideal, item.unidadeMedida)}`}${item.quantidadeIdealAjustada ? ' <span class="badge-pill neu-orange" title="Ajustado manualmente">ajustado</span>' : ''}</td>
        <td>${deficit === null ? '<span class="text-muted">—</span>' : (deficit > 0 ? `<span class="badge-pill neg">comprar ${_formatarQuantidade(deficit, item.unidadeMedida)}</span>` : '—')}</td>
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
  const jaAprovada = contagemDetalheAtual.status === 'aprovada';
  if (!jaAprovada && !confirm('Aprovar essa loja? As quantidades preenchidas vão substituir o estoque atual dela. Se for a última loja pendente da requisição, a cotação já é gerada em seguida.')) return;
  try {
    if (!jaAprovada) {
      const resposta = await fetch(`/api/contagens/${contagemDetalheAtual.id}/aprovar`, { method: 'POST' });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'falha ao aprovar');
    }

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
        if (!jaAprovada) alert('Todas as lojas aprovadas — cotação gerada!' + _avisoInsumosSemIdeal(gerarDados.insumosSemIdeal));
        window.location.href = `cotacoes.html?abrir=${gerarDados.cotacaoId}`;
        return;
      }
      alert(gerarDados.erro || (jaAprovada ? 'Não foi possível abrir a cotação dessa requisição.' : 'Loja aprovada, mas não foi possível gerar a cotação.'));
    } else if (!jaAprovada) {
      const faltam = conferencia.totalLojas - conferencia.lojasAprovadas;
      alert(`Loja aprovada! Ainda falta${faltam > 1 ? 'm' : ''} ${faltam} loja${faltam > 1 ? 's' : ''} aprovar antes de gerar a cotação.`);
    }
    if (!jaAprovada) await abrirContagemDetalhe(contagemDetalheAtual.id);
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
      <td class="font-bold">${escaparHtml(item.nome)}${item.curvaAbc === 'A'
        ? ' <span class="badge-pill neu-orange" title="Curva A: esse insumo concentra boa parte do gasto de compra — confira antes de aprovar">conferir</span>'
        : ''}</td>
      <td class="text-muted">${escaparHtml(item.categoria)}</td>
      <td>${_formatarQuantidade(item.preenchidoTotal, item.unidadeMedida)}</td>
      <td>${item.idealTotal === null ? '<span class="text-muted">—</span>' : `${_formatarQuantidade(item.idealTotal, item.unidadeMedida)}`}${item.idealAjustado ? ' <span class="badge-pill neu-orange" title="Alguma loja tem ajuste manual">ajustado</span>' : ''}</td>
      <td>${item.deficit === null ? '<span class="text-muted">—</span>' : (item.deficit > 0 ? `<span class="badge-pill neg">comprar ${_formatarQuantidade(item.deficit, item.unidadeMedida)}</span>` : '—')}</td>
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

    // Um card por item, no formato do link da VMarket que a Julia usa de
    // modelo (11/09/2026): campos empilhados, quantidade com − e +,
    // sugestão, previsão de compra, conversão da embalagem e "Próximo".
    const itensPorId = new Map(dados.itens.map((item) => [String(item.insumoId), item]));
    const container = document.getElementById('contagem-publica-itens');
    container.innerHTML = Object.entries(porCategoria).map(([categoria, itens], indiceSecao) => `
      <section class="contagem-publica-secao" id="contagem-secao-${indiceSecao}" data-categoria="${escaparHtml(categoria)}">
        <h3 class="contagem-publica-secao-titulo">Seção: ${escaparHtml(categoria)}</h3>
        <!-- Cabeçalho da tabela: só no computador, onde cada card vira uma linha -->
        <div class="contagem-cabecalho" aria-hidden="true">
          <span>Nome do Produto</span><span>Gramatura</span><span>Marca</span><span>Qtde em Estoque</span><span>Sugestão</span>
        </div>
        ${itens.map((item) => `
          <div class="contagem-card" data-nome-busca="${escaparHtml(item.nome.toLowerCase())}">
            <span class="contagem-rotulo">Nome</span>
            <div class="contagem-campo-leitura contagem-nome">${escaparHtml(item.nome)}</div>
            <span class="contagem-rotulo">Gramatura</span>
            <div class="contagem-campo-leitura">${escaparHtml(item.unidadeMedida)}</div>
            <span class="contagem-rotulo">Marca</span>
            <div class="contagem-campo-leitura">${escaparHtml(item.marcaHomologada || '—')}</div>
            <label class="contagem-rotulo" for="contagem-qtd-${item.insumoId}">Qtde em estoque</label>
            <div class="contagem-stepper">
              <button type="button" data-passo="-1" aria-label="Diminuir">−</button>
              <input type="number" step="any" min="0" inputmode="decimal" placeholder="0" id="contagem-qtd-${item.insumoId}" data-insumo-id="${item.insumoId}" required>
              <button type="button" data-passo="1" aria-label="Aumentar">+</button>
            </div>
            <span class="contagem-rotulo">Sugestão</span>
            <div class="contagem-campo-leitura" data-sugestao-insumo-id="${item.insumoId}">${item.quantidadeIdeal !== null ? item.quantidadeIdeal : '—'}</div>
            ${item.custoUnitario != null ? `
              <div class="contagem-previsao-bloco" data-previsao-bloco="${item.insumoId}">
                <span class="contagem-rotulo">Previsão compra</span>
                <div class="contagem-previsao"><span class="contagem-previsao-pill" data-previsao-insumo-id="${item.insumoId}"></span></div>
              </div>` : ''}
            ${item.fatorConversaoCompra ? `
              <span class="contagem-rotulo">Conversão</span>
              <div class="contagem-conversao">1 ${escaparHtml(item.unidadeCompra || 'embalagem')} = ${escaparHtml(String(item.fatorConversaoCompra).replace('.', ','))} ${escaparHtml(item.unidadeMedida)}</div>` : ''}
            <button type="button" class="contagem-proximo"><i data-lucide="chevron-down"></i> Próximo</button>
          </div>
        `).join('')}
      </section>
    `).join('');

    // Sugestão = ideal − o que tem (arredondado pra embalagem); previsão =
    // sugestão × custo do insumo.
    function atualizarSugestao(input) {
      const item = itensPorId.get(input.dataset.insumoId);
      const elSugestao = container.querySelector(`[data-sugestao-insumo-id="${input.dataset.insumoId}"]`);
      let sugestao = null;
      if (item.quantidadeIdeal !== null) {
        sugestao = input.value === ''
          ? item.quantidadeIdeal
          : arredondarQuantidadeCompra(item.quantidadeIdeal - parseFloat(input.value), item.fatorConversaoCompra || null);
      }
      elSugestao.textContent = sugestao === null ? '—' : sugestao;
      // Sem sugestão (ou nada a comprar), a previsão some em vez de mostrar R$ 0,00.
      const blocoPrevisao = container.querySelector(`[data-previsao-bloco="${input.dataset.insumoId}"]`);
      if (blocoPrevisao) {
        blocoPrevisao.hidden = !sugestao;
        if (sugestao) {
          blocoPrevisao.querySelector('.contagem-previsao-pill').innerHTML = `${escaparHtml(_formatarCustoPorUnidade(item.custoUnitario, item.unidadeMedida))} × ${escaparHtml(_formatarQuantidade(sugestao, item.unidadeMedida))} = <strong>${escaparHtml(_formatarMoedaBRL(sugestao * item.custoUnitario))}</strong>`;
        }
      }
    }

    const cards = [...container.querySelectorAll('.contagem-card')];
    cards.forEach((card, indice) => {
      const input = card.querySelector('input[data-insumo-id]');
      atualizarSugestao(input);
      input.addEventListener('input', () => {
        card.classList.toggle('preenchido', input.value !== '');
        atualizarSugestao(input);
        atualizarProgresso();
      });
      card.querySelectorAll('[data-passo]').forEach((botao) => botao.addEventListener('click', () => {
        const atual = parseFloat(input.value) || 0;
        input.value = Math.max(0, Math.round((atual + parseFloat(botao.dataset.passo)) * 1000) / 1000);
        input.dispatchEvent(new Event('input'));
      }));
      // Próximo: vai pro card seguinte visível (a busca pode ter escondido
      // alguns) e já abre o teclado nele; no último, vai pro botão de enviar.
      card.querySelector('.contagem-proximo').addEventListener('click', () => {
        const seguinte = cards.slice(indice + 1).find((c) => c.style.display !== 'none' && c.closest('section').style.display !== 'none');
        const alvo = seguinte || document.getElementById('btn-contagem-publica-enviar');
        alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (seguinte) seguinte.querySelector('input[data-insumo-id]').focus({ preventScroll: true });
      });
    });

    // Filtro de seção do computador (no celular ele fica escondido e vale "todas").
    const filtroSecao = document.getElementById('contagem-publica-filtro-secao');
    filtroSecao.innerHTML = '<option value="">Todas as seções</option>' +
      Object.keys(porCategoria).map((categoria) => `<option value="${escaparHtml(categoria)}">${escaparHtml(categoria)}</option>`).join('');

    function aplicarFiltros() {
      const termo = document.getElementById('contagem-publica-busca').value.trim().toLowerCase();
      const categoria = filtroSecao.value;
      container.querySelectorAll('.contagem-publica-secao').forEach((secao) => {
        let algumVisivelNaSecao = false;
        secao.querySelectorAll('.contagem-card').forEach((card) => {
          const visivel = (!termo || card.dataset.nomeBusca.includes(termo)) && (!categoria || secao.dataset.categoria === categoria);
          card.style.display = visivel ? '' : 'none';
          if (visivel) algumVisivelNaSecao = true;
        });
        secao.style.display = algumVisivelNaSecao ? '' : 'none';
      });
    }
    document.getElementById('contagem-publica-busca').addEventListener('input', aplicarFiltros);
    filtroSecao.addEventListener('change', aplicarFiltros);

    // Botão flutuante "Seções": lista as seções e pula direto pra uma.
    const secoes = document.getElementById('contagem-secoes');
    const menuSecoes = document.getElementById('contagem-secoes-menu');
    const botaoSecoes = document.getElementById('contagem-secoes-botao');
    menuSecoes.innerHTML = Object.keys(porCategoria).map((categoria, indice) =>
      `<button type="button" data-secao="contagem-secao-${indice}">${escaparHtml(categoria)}</button>`).join('');
    botaoSecoes.addEventListener('click', () => {
      menuSecoes.hidden = !menuSecoes.hidden;
      botaoSecoes.setAttribute('aria-expanded', String(!menuSecoes.hidden));
    });
    menuSecoes.querySelectorAll('[data-secao]').forEach((botao) => botao.addEventListener('click', () => {
      document.getElementById(botao.dataset.secao).scrollIntoView({ behavior: 'smooth', block: 'start' });
      menuSecoes.hidden = true;
      botaoSecoes.setAttribute('aria-expanded', 'false');
    }));
    secoes.hidden = false;
    if (typeof lucide !== 'undefined') lucide.createIcons();

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
        <td><div class="contagem-item-somente-leitura">${_formatarQuantidade(item.quantidade, item.unidadeMedida)}</div></td>
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

async function inicializarConfirmarPedido() {
  const token = new URLSearchParams(location.search).get('token');
  const elCarregando = document.getElementById('pedido-publico-carregando');
  const elErro = document.getElementById('pedido-publico-erro');
  const elErroTexto = document.getElementById('pedido-publico-erro-texto');
  const elConteudo = document.getElementById('pedido-publico-conteudo');
  const elConfirmado = document.getElementById('pedido-publico-confirmado');

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
    const resposta = await fetch(`/api/pedidos/confirmar/${encodeURIComponent(token)}`);
    const dados = await resposta.json();
    if (!resposta.ok) {
      mostrarErro(dados.erro || 'Link inválido.');
      return;
    }

    elCarregando.style.display = 'none';

    if (dados.jaConfirmado) {
      elConfirmado.style.display = '';
      return;
    }

    document.getElementById('pedido-publico-fornecedor').textContent = dados.fornecedorNome;
    document.getElementById('pedido-publico-lojas').innerHTML = dados.pedidos.map((pedido) => `
      <div class="pedido-publico-loja-bloco">
        <h3>${escaparHtml(pedido.loja)}</h3>
        <div class="table-responsive">
        <table>
          <thead>
            <tr><th>Produto</th><th>Quantidade</th><th>Preço Unit.</th><th>Total</th></tr>
          </thead>
          <tbody>
            ${pedido.itens.map((item) => `
              <tr>
                <td class="font-bold">${escaparHtml(item.nome)}</td>
                <td>${_formatarQuantidade(item.quantidade, item.unidadeMedida)}</td>
                <td>R$ ${item.precoUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>R$ ${item.precoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        </div>
        <p class="panel-subtitle">Total dessa loja: R$ ${pedido.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
      </div>
    `).join('');
    document.getElementById('pedido-publico-valor-total').textContent =
      `R$ ${dados.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    elConteudo.style.display = '';

    document.getElementById('btn-pedido-publico-confirmar').addEventListener('click', async (evento) => {
      const btn = evento.target;
      btn.disabled = true;
      try {
        const resp = await fetch(`/api/pedidos/confirmar/${encodeURIComponent(token)}`, { method: 'POST' });
        const respDados = await resp.json();
        if (!resp.ok) throw new Error(respDados.erro || 'falha ao confirmar');
        elConteudo.style.display = 'none';
        elConfirmado.style.display = '';
      } catch (erro) {
        console.error('Falha ao confirmar pedido:', erro);
        alert(erro.message || 'Não foi possível confirmar o pedido.');
        btn.disabled = false;
      }
    });
  } catch (erro) {
    console.error('Falha ao carregar pedido público:', erro);
    mostrarErro('Não foi possível carregar esse pedido agora.');
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
  document.getElementById('novo-insumo-unidade-compra').value = insumo ? (insumo.unidadeCompra || '') : '';
  document.getElementById('novo-insumo-fator-compra').value = insumo && insumo.fatorConversaoCompra ? insumo.fatorConversaoCompra : '';
  document.getElementById('novo-insumo-conteudo').value = insumo && insumo.conteudoPorUnidade ? insumo.conteudoPorUnidade : '';
  document.getElementById('novo-insumo-unidade-conteudo').value = (insumo && insumo.unidadeConteudo) || 'g';
  const { fator } = _escalaDeCusto(insumo ? insumo.unidadeMedida : 'un');
  document.getElementById('novo-insumo-custo').value = insumo && insumo.custoReferencia != null
    ? _arredondarQuantidade(insumo.custoReferencia * fator)
    : '';
  _atualizarRotuloCustoInsumo();
  const emUso = document.getElementById('novo-insumo-custo-em-uso');
  emUso.textContent = insumo ? _textoCustoEmUso(insumo) : '';
  emUso.hidden = !insumo;
  _renderChecklistFornecedores(insumo ? insumo.fornecedorIds : []);
  document.getElementById('modal-novo-insumo').style.display = 'flex';
}

function _atualizarRotuloCustoInsumo() {
  const { rotulo } = _escalaDeCusto(document.getElementById('novo-insumo-unidade').value);
  document.getElementById('novo-insumo-custo-rotulo').textContent = `Custo (R$ por ${rotulo})`;
}

// O custo digitado é o de menor prioridade no CMV (custo_em_uso_por_insumo
// em armazenamento.py): cotação, compra recebida e receita de mistura passam
// na frente. Por isso a tela diz qual está valendo — senão ela digitaria um
// custo e acharia que não funcionou.
function _textoCustoEmUso(insumo) {
  const emUso = insumo.custoEmUso;
  if (!emUso) return 'Sem custo no CMV ainda: os produtos que usam este insumo ficam sem CMV até ele ter um.';
  const valor = _formatarCustoPorUnidade(emUso.valor, insumo.unidadeMedida);
  // "2026-09-03T10:15" -> "03/09", sem passar por Date (data sem hora viraria o dia anterior no fuso daqui).
  const data = emUso.data ? emUso.data.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '';
  if (emUso.origem === 'cotacao') {
    return `Valendo no CMV: ${valor}, da cotação de ${data}. Cotação e compra recebida passam na frente do custo digitado.`;
  }
  if (emUso.origem === 'compra') {
    const quem = emUso.fornecedor ? `${emUso.fornecedor}, ${data}` : data;
    return `Valendo no CMV: ${valor}, da última compra recebida (${quem}). Compra recebida passa na frente do custo digitado.`;
  }
  if (emUso.origem === 'receita') {
    return `Valendo no CMV: ${valor}, calculado pela receita da mistura. O custo digitado só vale se a receita ficar incompleta.`;
  }
  return `Valendo no CMV: ${valor}, este custo.`;
}

document.getElementById('novo-insumo-unidade')?.addEventListener('input', _atualizarRotuloCustoInsumo);

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
  const unidadeMedida = document.getElementById('novo-insumo-unidade').value;
  const custoDigitado = document.getElementById('novo-insumo-custo').value;
  const corpo = {
    nome: document.getElementById('novo-insumo-nome').value,
    categoria: document.getElementById('novo-insumo-categoria').value,
    unidadeMedida,
    // Digitado por kg/litro em grama/ml; gravado na unidade do insumo.
    custoReferencia: custoDigitado === '' ? '' : parseFloat(custoDigitado) / _escalaDeCusto(unidadeMedida).fator,
    marcaHomologada: document.getElementById('novo-insumo-marca').value,
    unidadeCompra: document.getElementById('novo-insumo-unidade-compra').value,
    fatorConversaoCompra: document.getElementById('novo-insumo-fator-compra').value,
    conteudoPorUnidade: document.getElementById('novo-insumo-conteudo').value,
    unidadeConteudo: document.getElementById('novo-insumo-unidade-conteudo').value,
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
      <td>${linha.dados.quantidadeIdeal !== null ? `${_formatarQuantidade(linha.dados.quantidadeIdeal, linha.insumo.unidadeMedida)}` : '<span class="text-muted">—</span>'}${linha.dados.quantidadeIdealAjustada ? ' <span class="badge-pill neu-orange">ajustado</span>' : ''}</td>
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

document.getElementById('btn-ajuste-lote-remover-todos')?.addEventListener('click', async () => {
  const erro = document.getElementById('ajuste-lote-erro');
  erro.style.display = 'none';
  if (!confirm(`Remover TODOS os ajustes manuais de quantidade ideal de ${estoqueTabAtual}? Volta tudo pro cálculo automático (mínimo, ou o ajuste de outra loja se copiar de novo). Não afeta as outras lojas.`)) return;
  try {
    const resposta = await fetch(`/api/insumos/ajustes-quantidade-ideal?loja=${encodeURIComponent(estoqueTabAtual)}`, { method: 'DELETE' });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao remover ajustes');
    fecharModalAjusteLote();
    await carregarInsumos();
    alert(`Pronto — ${dados.removidos} ajuste(s) removido(s).`);
  } catch (erroCatch) {
    console.error('Falha ao remover ajustes em lote:', erroCatch);
    erro.textContent = erroCatch.message || 'Não foi possível remover os ajustes.';
    erro.style.display = '';
  }
});

let atualizarEstoqueLoteValores = {};
let atualizarEstoqueLoteMinimos = {};

function abrirModalAtualizarEstoqueLote() {
  atualizarEstoqueLoteValores = {};
  atualizarEstoqueLoteMinimos = {};
  document.getElementById('atualizar-estoque-lote-loja-nome').textContent = estoqueTabAtual;
  document.getElementById('atualizar-estoque-lote-busca').value = '';
  document.getElementById('atualizar-estoque-lote-erro').style.display = 'none';
  document.getElementById('atualizar-estoque-lote-colar-texto').value = '';
  document.getElementById('atualizar-estoque-lote-colar-resultado').textContent = '';
  renderAtualizarEstoqueLoteTabela('');
  document.getElementById('modal-atualizar-estoque-lote').style.display = 'flex';
}

function processarColarListaAtualizarEstoqueLote() {
  const texto = document.getElementById('atualizar-estoque-lote-colar-texto').value;
  const porNomeNormalizado = new Map();
  _linhasEstoqueParaTab(estoqueTabAtual).forEach((linha) => {
    porNomeNormalizado.set(_normalizarNomeInsumo(linha.insumo.nome), linha.insumo.id);
  });

  let casados = 0;
  const naoEncontrados = [];

  // Aceita `nome;atual` (só estoque) ou `nome;atual;mínimo` (os dois de
  // uma vez, formato da planilha que a Julia mandou do Açaí Na Lata).
  texto.split('\n').forEach((linhaTexto) => {
    const bruta = linhaTexto.trim();
    if (!bruta) return;
    const separador = bruta.includes('\t') ? '\t' : (bruta.includes(';') ? ';' : ',');
    const partes = bruta.split(separador);
    if (partes.length < 2) { naoEncontrados.push(bruta); return; }

    const ultimo = partes[partes.length - 1].trim().replace(',', '.');
    const penultimo = partes.length > 2 ? partes[partes.length - 2].trim().replace(',', '.') : null;
    const temMinimo = penultimo !== null && !isNaN(parseFloat(penultimo));

    const valor = temMinimo ? penultimo : ultimo;
    const minimo = temMinimo ? ultimo : null;
    const nome = partes.slice(0, temMinimo ? -2 : -1).join(separador).trim();
    if (!nome || isNaN(parseFloat(valor))) { naoEncontrados.push(bruta); return; }

    const insumoId = porNomeNormalizado.get(_normalizarNomeInsumo(nome));
    if (insumoId) {
      atualizarEstoqueLoteValores[insumoId] = valor;
      if (minimo !== null) atualizarEstoqueLoteMinimos[insumoId] = minimo;
      casados++;
    } else {
      naoEncontrados.push(nome);
    }
  });

  renderAtualizarEstoqueLoteTabela(document.getElementById('atualizar-estoque-lote-busca').value);
  document.getElementById('atualizar-estoque-lote-colar-resultado').textContent = naoEncontrados.length
    ? `${casados} casado(s). Não encontrado (confira o nome e ajuste na mão): ${naoEncontrados.join(', ')}`
    : `${casados} casado(s), todos encontrados.`;
}

document.getElementById('btn-atualizar-estoque-lote-processar-colar')?.addEventListener('click', processarColarListaAtualizarEstoqueLote);

function fecharModalAtualizarEstoqueLote() {
  document.getElementById('modal-atualizar-estoque-lote').style.display = 'none';
}

function renderAtualizarEstoqueLoteTabela(filtro) {
  const tbody = document.getElementById('atualizar-estoque-lote-tabela-body');
  const termo = filtro.trim().toLowerCase();
  const linhas = _linhasEstoqueParaTab(estoqueTabAtual)
    .filter((linha) => !termo || linha.insumo.nome.toLowerCase().includes(termo));

  tbody.innerHTML = linhas.map((linha) => `
    <tr>
      <td class="font-bold">${escaparHtml(linha.insumo.nome)}</td>
      <td class="text-muted">${escaparHtml(linha.insumo.categoria)}</td>
      <td>${_formatarQuantidade(linha.dados.quantidadeAtual, linha.insumo.unidadeMedida)}</td>
      <td><input type="number" step="0.01" min="0" placeholder="—" data-insumo-id="${linha.insumo.id}" value="${atualizarEstoqueLoteValores[linha.insumo.id] ?? ''}" style="width:100px;"></td>
      <td><input type="number" step="0.01" min="0" placeholder="—" data-minimo-id="${linha.insumo.id}" value="${atualizarEstoqueLoteMinimos[linha.insumo.id] ?? ''}" style="width:100px;"></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('input[data-insumo-id]').forEach((input) => {
    input.addEventListener('input', () => {
      if (input.value === '') delete atualizarEstoqueLoteValores[input.dataset.insumoId];
      else atualizarEstoqueLoteValores[input.dataset.insumoId] = input.value;
    });
  });

  tbody.querySelectorAll('input[data-minimo-id]').forEach((input) => {
    input.addEventListener('input', () => {
      if (input.value === '') delete atualizarEstoqueLoteMinimos[input.dataset.minimoId];
      else atualizarEstoqueLoteMinimos[input.dataset.minimoId] = input.value;
    });
  });
}

document.getElementById('btn-atualizar-estoque-lote')?.addEventListener('click', abrirModalAtualizarEstoqueLote);
document.getElementById('btn-atualizar-estoque-lote-fechar')?.addEventListener('click', fecharModalAtualizarEstoqueLote);
document.getElementById('btn-atualizar-estoque-lote-cancelar')?.addEventListener('click', fecharModalAtualizarEstoqueLote);

document.getElementById('atualizar-estoque-lote-busca')?.addEventListener('input', (evento) => {
  renderAtualizarEstoqueLoteTabela(evento.target.value);
});

document.getElementById('btn-atualizar-estoque-lote-salvar')?.addEventListener('click', async () => {
  const erro = document.getElementById('atualizar-estoque-lote-erro');
  erro.style.display = 'none';

  if (!Object.keys(atualizarEstoqueLoteValores).length) {
    erro.textContent = 'Preencha pelo menos um insumo.';
    erro.style.display = '';
    return;
  }
  try {
    const resposta = await fetch('/api/insumos/quantidades-atuais/lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loja: estoqueTabAtual, valores: atualizarEstoqueLoteValores, minimos: atualizarEstoqueLoteMinimos }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao salvar');
    fecharModalAtualizarEstoqueLote();
    await carregarInsumos();
    alert(`Pronto — ${dados.salvos} insumo(s) atualizado(s).`);
  } catch (erroCatch) {
    console.error('Falha ao atualizar estoque em lote:', erroCatch);
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
  document.getElementById('insumos-loja-colar-texto').value = '';
  document.getElementById('insumos-loja-colar-resultado').textContent = '';
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

// Colar a lista de insumos que a loja usa (um nome por linha) — marca só
// esses e desmarca todo o resto, pra montar a lista da loja de uma vez a
// partir de uma fonte externa (ex: relatório de outro sistema) em vez de
// clicar em ~200 checkboxes. Mesmo `_normalizarNomeInsumo`/match exato das
// outras duas "colar lista" da tela.
function processarColarListaInsumosLoja() {
  const texto = document.getElementById('insumos-loja-colar-texto').value;
  const porNomeNormalizado = new Map();
  insumosLojaTodos.forEach((i) => {
    porNomeNormalizado.set(_normalizarNomeInsumo(i.nome), i.id);
  });

  const encontrados = new Set();
  const naoEncontrados = [];

  texto.split('\n').forEach((linhaTexto) => {
    const nome = linhaTexto.trim();
    if (!nome) return;
    const insumoId = porNomeNormalizado.get(_normalizarNomeInsumo(nome));
    if (insumoId) encontrados.add(insumoId);
    else naoEncontrados.push(nome);
  });

  if (!encontrados.size) {
    document.getElementById('insumos-loja-colar-resultado').textContent =
      'Nenhum nome da lista bateu com o catálogo — nada foi alterado.';
    return;
  }

  insumosLojaSelecionados = encontrados;
  renderInsumosLojaTabela(document.getElementById('insumos-loja-busca').value);
  document.getElementById('insumos-loja-colar-resultado').textContent = naoEncontrados.length
    ? `${encontrados.size} marcado(s), o resto desmarcado. Não encontrado (confira o nome): ${naoEncontrados.join(', ')}`
    : `${encontrados.size} marcado(s), o resto desmarcado — todos encontrados.`;
}

document.getElementById('btn-insumos-loja-processar-colar')?.addEventListener('click', processarColarListaInsumosLoja);

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
      <td class="text-muted">${_formatarQuantidade(item.quantidade, item.unidadeMedida)}</td>
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
async function sincronizarAgora(forcar) {
  const botao = document.getElementById('btn-sincronizar-agora');
  const resultadoElem = document.getElementById('sync-resultado');
  if (!botao) return;

  const htmlOriginal = botao.innerHTML;
  botao.disabled = true;
  botao.innerHTML = '<span>Iniciando sincronização...</span>';
  if (resultadoElem) resultadoElem.innerHTML = '';

  try {
    const resposta = await fetch(`/api/sincronizar-agora${forcar ? '?forcar=1' : ''}`, { method: 'POST' });
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();

    if (resultadoElem) {
      if (dados.fechado) {
        // Segunda-feira normal fica só o aviso; mas pode ter sido feriado
        // com a loja aberta mesmo assim — deixa forçar sem precisar mexer
        // em código de novo (achado ao vivo, 2026-09-08).
        resultadoElem.innerHTML = `
          <div class="sync-resultado-item">
            ${dados.diaLabel} é segunda-feira — lojas fechadas, nada a sincronizar.
            Se abriu mesmo assim (feriado, por exemplo),
            <button type="button" class="btn-secondary-sm" id="btn-sincronizar-forcar" style="display:inline;">sincronize aqui</button>.
          </div>
        `;
        document.getElementById('btn-sincronizar-forcar')?.addEventListener('click', () => sincronizarAgora(true));
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
    const painelIntegracoes = document.getElementById('painel-integracoes-estoque');
    if (painelIntegracoes && usuario.papel === 'admin') {
      painelIntegracoes.style.display = '';
      const seletorLoja = document.getElementById('integracoes-loja');
      seletorLoja.value = integracoesLojaAtual;
      seletorLoja.addEventListener('change', () => {
        integracoesLojaAtual = seletorLoja.value;
        carregarIntegracoesEstoque();
      });
      carregarIntegracoesEstoque();
    }
    // Tela de Cardápio: botão "Importar planilha" e edição de preço/foto/
    // ficha técnica (só admin). Os dois fetches (usuário logado + produtos)
    // rodam em paralelo — se os cards já tiverem renderizado como "só
    // leitura" antes de saber que é admin, renderiza de novo agora com os
    // controles de edição.
    const importarArea = document.getElementById('cardapio-importar-area');
    if (importarArea && usuario.papel === 'admin') {
      importarArea.style.display = '';
      if (typeof lucide !== 'undefined') lucide.createIcons();
      if (fichaTecnicaProdutos.length || fichaTecnicaComplementos.length) renderFichaTecnicaConteudo();
    }

    // Tela de Vendas Semanais: botão "Importar planilha" (só admin).
    const importarSemanaisArea = document.getElementById('vendas-semanais-importar-area');
    if (importarSemanaisArea && usuario.papel === 'admin') {
      importarSemanaisArea.style.display = '';
      if (typeof lucide !== 'undefined') lucide.createIcons();
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
    if (usuario.papel === 'admin' && (fichaTecnicaProdutos.length || fichaTecnicaComplementos.length)) {
      renderFichaTecnicaConteudo();
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
              <span class="task-meta">
                ${escaparHtml(t.categoria)}
                ${t.subtarefas.length ? ` · ${t.subtarefas.filter(s => s.concluida).length}/${t.subtarefas.length}` : ''}
                ${t.particular ? ' · <span class="task-particular" title="Card particular: só você vê"><i data-lucide="lock"></i> só você</span>' : ''}
              </span>
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
    particular: !!document.getElementById('particularTarefa')?.checked,
    subtarefas: (document.getElementById('checklistTarefa')?.value || '')
      .split('\n').map(linha => linha.trim()).filter(Boolean),
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

// --- TELA DE CARDÁPIO (Preços + Ficha Técnica numa tela só, 2026-09-09) ---
// A antiga aba "Preços" (abas por loja, cartão só de preço) foi absorvida
// pela grade de produtos da Ficha Técnica (_renderProdutosConteudo mais
// abaixo) — o cartão agora tem o visual de Preços E expande a ficha
// técnica/custo no clique. CANAIS_CARDAPIO/_formatarPrecoCardapio
// continuam, usados pelo cartão novo.

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
    await carregarFichaTecnicaAtual();
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
let fichaTecnicaTipoAtual = 'produto'; // 'produto' | 'complemento' | 'mistura'
let fichaTecnicaProdutos = [];
let fichaTecnicaComplementos = [];
let fichaTecnicaMisturas = [];
let fichaTecnicaInsumosDisponiveis = [];
let fichaTecnicaEditandoItemId = null;
const fichaTecnicaExpandidos = new Set();
const fichaTecnicaInsumosCache = new Map();
let fichaTecnicaProdutoPendente = null;
let fichaTecnicaCategoriaSelecionada = null;
// Preços + Ficha Técnica viraram uma tela só (2026-09-09) — cartão no
// visual de Preços (foto + preço por canal). Sem lápis/lixeira soltos:
// clicar no cartão expande TUDO editável junto (preço + custo + ficha
// técnica), reaproveitando o mesmo mecanismo já usado pelos Complementos
// (fichaTecnicaExpandidos/renderPainelFichaTecnicaExpandido).

// Lista do tipo (produto/complemento) atualmente em tela — os dois usam
// os mesmos componentes de expandir/editar/excluir ficha técnica, só a
// fonte dos dados muda.
function _fichaTecnicaItensAtuais() {
  return fichaTecnicaTipoAtual === 'complemento' ? fichaTecnicaComplementos : fichaTecnicaProdutos;
}

// Complemento só existe pro Açaí Na Lata (único que vende "monte o seu").
// "Complementos" entra como mais um item no MESMO menu de categorias dos
// produtos (em vez de uma aba separada lá em cima) — ver
// renderFichaTecnicaConteudo. Precisa buscar as duas listas de uma vez
// pra montar esse menu com o item extra desde o primeiro render.
const FICHA_TECNICA_COMPLEMENTOS_ITEM = 'Complementos';
// Mistura feita na casa (tempero, molho...) entra no mesmo menu: a receita
// dela é global, e ficha técnica, complemento e mistura ficam num lugar só
// (pedido da Julia, 2026-09-10). Só no Artesanos e nos Tradiças — o Açaí
// Na Lata não tem mistura (pedido dela, 2026-09-11).
const FICHA_TECNICA_MISTURAS_ITEM = 'Misturas';

function _lojaTemMisturas(loja) {
  return loja !== 'Açaí Na Lata';
}

function carregarFichaTecnicaAtual() {
  const conteudoEl = document.getElementById('ficha-tecnica-conteudo');
  if (!conteudoEl) return;
  const temComplementos = fichaTecnicaLojaAtual === 'Açaí Na Lata';
  const temMisturas = _lojaTemMisturas(fichaTecnicaLojaAtual);
  return Promise.all([
    fetch(`/api/cardapio/produtos?loja=${encodeURIComponent(fichaTecnicaLojaAtual)}`).then(r => r.json()),
    temComplementos
      ? fetch(`/api/complementos?loja=${encodeURIComponent(fichaTecnicaLojaAtual)}`).then(r => r.json())
      : Promise.resolve({ complementos: [] }),
    temMisturas ? fetch('/api/misturas').then(r => r.json()) : Promise.resolve({ misturas: [] }),
  ]).then(([dadosProdutos, dadosComplementos, dadosMisturas]) => {
    fichaTecnicaMisturas = dadosMisturas.misturas || [];
    fichaTecnicaProdutos = dadosProdutos.produtos || [];
    fichaTecnicaComplementos = (dadosComplementos.complementos || []).map(c => ({
      itemCardapioId: c.id,
      nome: c.nome,
      categoria: c.categoria,
      temFichaTecnica: c.temFichaTecnica,
    }));
    fichaTecnicaExpandidos.clear();
    fichaTecnicaInsumosCache.clear();
    if (!temComplementos && fichaTecnicaCategoriaSelecionada === FICHA_TECNICA_COMPLEMENTOS_ITEM) {
      fichaTecnicaCategoriaSelecionada = null;
    }
    if (!temMisturas && fichaTecnicaCategoriaSelecionada === FICHA_TECNICA_MISTURAS_ITEM) {
      fichaTecnicaCategoriaSelecionada = null;
    }
    renderFichaTecnicaConteudo();
  }).catch((erro) => {
    console.error('Falha ao carregar ficha técnica:', erro);
    conteudoEl.innerHTML = `<p class="panel-subtitle" style="color:var(--danger); padding: var(--space-4);">Não foi possível carregar os produtos dessa loja.</p>`;
  });
}

// Uma linha da lista de insumos dentro do cartão de receita — nome e
// quantidade ligados por uma linha pontilhada, como numa receita impressa.
function _receitaInsumoLinhaHTML(ins) {
  const qtd = _formatarQuantidadeFicha(ins);
  return `
    <div class="receita-insumo-linha">
      <span class="receita-insumo-nome">${escaparHtml(ins.nome)}</span>
      <span class="receita-insumo-pontilhado"></span>
      <span class="receita-insumo-qtd">${qtd}</span>
    </div>
  `;
}

// Cartão de produto no visual de Preços — foto + nome + preço por canal,
// só leitura, sem lápis/lixeira à vista. O cartão inteiro é clicável: abre
// o modal de detalhe (abrirModalDetalheProduto) com preço por canal, custo
// e ficha técnica juntos pra editar — em vez de expandir no lugar, a
// pedido da Julia (2026-09-09), inspirado no modal de produto da própria
// Cardápio Web.
function _receitaCardHTML(p, isAdmin, canais) {
  const nome = `<div class="cardapio-card-nome">${escaparHtml(p.nome)}</div>`;
  const foto = p.fotoUrl
    ? `<img src="${p.fotoUrl}" alt="${escaparHtml(p.nome)}">`
    : `<div class="cardapio-foto-vazia"><i data-lucide="image"></i></div>`;

  const corpo = `
    <div class="cardapio-card-topo">${nome}</div>
    ${canais.map(c => `
      <div class="cardapio-linha-preco">
        <span class="cardapio-canal-label">${c.label}</span>
        <span class="cardapio-preco-valor">${_formatarPrecoCardapio(p[c.chave]) ?? '<span class="cardapio-preco-vazio">—</span>'}</span>
      </div>
    `).join('')}
    ${!p.itemCardapioId ? '<span class="ficha-tecnica-vazio">Sem ficha técnica ainda</span>' : ''}
  `;

  return `
    <div class="cardapio-card-linha-principal" data-acao="detalhe-produto" data-preco-cardapio-id="${p.precoCardapioId}">
      <div class="cardapio-card-foto">
        ${foto}
        ${isAdmin ? `
          <button type="button" class="cardapio-btn-foto" data-acao="foto" title="Trocar foto">
            <i data-lucide="camera"></i>
          </button>
          <input type="file" accept="image/*" class="cardapio-input-foto" data-acao="foto" style="display:none;">
        ` : ''}
      </div>
      <div class="cardapio-card-corpo">${corpo}</div>
    </div>
  `;
}

// Um único listener delegado no container cuida de todos os cartões — evita
// reanexar N listeners a cada re-render (troca de categoria, etc.). Sem
// lápis/lixeira soltos no cartão (a pedido da Julia, 2026-09-09): o cartão
// inteiro é o clique pra abrir o modal de detalhe com tudo editável junto
// — ver abrirModalDetalheProduto. "foto" é a mesma ação que a antiga tela
// de Preços já tinha (mesmo endpoint, mesmo payload).
function _wireReceitaCardsEventos(conteudoEl) {
  if (conteudoEl.dataset.receitaWired) return;
  conteudoEl.dataset.receitaWired = '1';

  conteudoEl.addEventListener('click', (evento) => {
    const card = evento.target.closest('.cardapio-card');
    if (!card) return;

    if (evento.target.closest('[data-acao="foto"]')) {
      card.querySelector('.cardapio-input-foto')?.click();
      return;
    }

    const linhaPrincipal = evento.target.closest('[data-acao="detalhe-produto"]');
    if (linhaPrincipal) {
      abrirModalDetalheProduto(parseInt(linhaPrincipal.dataset.precoCardapioId, 10));
    }
  });

  conteudoEl.addEventListener('change', async (evento) => {
    const inputFoto = evento.target.closest('.cardapio-input-foto');
    if (inputFoto) {
      const card = inputFoto.closest('.cardapio-card');
      const precoCardapioId = card.dataset.id;
      const arquivo = inputFoto.files[0];
      inputFoto.value = '';
      if (!arquivo) return;

      try {
        const formData = new FormData();
        formData.append('foto', arquivo);
        const resposta = await fetch(`/api/precos-cardapio/${precoCardapioId}/foto`, { method: 'POST', body: formData });
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.erro || 'falha ao subir foto');

        const fotoContainer = card.querySelector('.cardapio-card-foto');
        fotoContainer.querySelector('img, .cardapio-foto-vazia')?.remove();
        fotoContainer.insertAdjacentHTML('afterbegin', `<img src="${dados.fotoUrl}" alt="">`);

        const produto = fichaTecnicaProdutos.find(p => String(p.precoCardapioId) === String(precoCardapioId));
        if (produto) produto.fotoUrl = dados.fotoUrl;
      } catch (erro) {
        console.error('Falha ao subir foto do cardápio:', erro);
        alert('Não foi possível subir a foto. Tenta de novo.');
      }
    }
  });
}

// Orquestrador único: monta o menu de categorias (categorias de produto +
// "Complementos" no fim, só quando a loja é Açaí Na Lata) e decide se o
// conteúdo é a grade de receitas ou a lista de complementos, conforme o
// que tá selecionado nesse menu.
function renderFichaTecnicaConteudo() {
  const conteudoEl = document.getElementById('ficha-tecnica-conteudo');
  const acoesAdmin = document.getElementById('ficha-tecnica-acoes-admin');
  const subtitulo = document.getElementById('ficha-tecnica-subtitulo');
  const btnNovoTexto = document.getElementById('btn-novo-item-cardapio-texto');
  const btnColarComplementos = document.getElementById('btn-colar-lista-complementos');
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

  const temComplementos = fichaTecnicaLojaAtual === 'Açaí Na Lata';
  const temMisturas = _lojaTemMisturas(fichaTecnicaLojaAtual);
  const categoriaValida = fichaTecnicaCategoriaSelecionada === FICHA_TECNICA_COMPLEMENTOS_ITEM
    ? temComplementos
    : fichaTecnicaCategoriaSelecionada === FICHA_TECNICA_MISTURAS_ITEM
      ? temMisturas
      : categorias.includes(fichaTecnicaCategoriaSelecionada);
  if (!fichaTecnicaCategoriaSelecionada || !categoriaValida) {
    fichaTecnicaCategoriaSelecionada = categorias[0] || (temComplementos ? FICHA_TECNICA_COMPLEMENTOS_ITEM : null);
  }
  fichaTecnicaTipoAtual = fichaTecnicaCategoriaSelecionada === FICHA_TECNICA_COMPLEMENTOS_ITEM
    ? 'complemento'
    : fichaTecnicaCategoriaSelecionada === FICHA_TECNICA_MISTURAS_ITEM ? 'mistura' : 'produto';

  const categoriasComContagem = categorias.map(nome => ({ nome, contagem: porCategoria.get(nome).length }));
  if (temComplementos) categoriasComContagem.push({ nome: FICHA_TECNICA_COMPLEMENTOS_ITEM, contagem: fichaTecnicaComplementos.length });
  if (temMisturas) categoriasComContagem.push({ nome: FICHA_TECNICA_MISTURAS_ITEM, contagem: fichaTecnicaMisturas.length });
  _renderSidebarCategorias('ficha-tecnica-categorias-sidebar', categoriasComContagem, fichaTecnicaCategoriaSelecionada, (nome) => {
    fichaTecnicaCategoriaSelecionada = nome;
    renderFichaTecnicaConteudo();
  });

  const ehComplemento = fichaTecnicaTipoAtual === 'complemento';
  const ehMistura = fichaTecnicaTipoAtual === 'mistura';
  if (subtitulo) subtitulo.textContent = ehMistura
    ? 'Receita do que é feito na casa (tempero, molho, maionese...): quanto rende e o que vai dentro. Quando sai um produto que leva a mistura, o estoque desconta os ingredientes, e o custo dela sai desta conta. A receita vale pra todas as lojas.'
    : ehComplemento
      ? 'Insumos de cada complemento (Granola, Leite condensado, Morango...), por loja — usado pra descontar o insumo certo do estoque quando o cliente monta o próprio produto com adicionais.'
      : 'Custo e valor de venda (balcão) de cada produto, por loja — a receita (insumos + quantidade) também é por loja desde 2026-09, então o mesmo prato pode divergir de uma unidade pra outra. Clique num produto pra ver/editar os insumos.';
  if (btnNovoTexto) btnNovoTexto.textContent = ehMistura ? 'Nova mistura' : ehComplemento ? 'Novo complemento' : 'Novo item';
  if (btnColarComplementos) btnColarComplementos.style.display = ehComplemento ? '' : 'none';

  if (ehMistura) {
    _renderMisturasConteudo(conteudoEl, isAdmin);
  } else if (ehComplemento) {
    _renderComplementosConteudo(conteudoEl, isAdmin);
  } else {
    const temBeefood = fichaTecnicaProdutos.some(p => p.beefood !== null);
    const canais = temBeefood ? CANAIS_CARDAPIO : CANAIS_CARDAPIO.filter(c => c.chave !== 'beefood');
    _renderProdutosConteudo(conteudoEl, isAdmin, porCategoria.get(fichaTecnicaCategoriaSelecionada) || [], canais);
  }
}

// A ficha técnica de cada produto só é buscada quando o modal de detalhe é
// aberto (clique no cartão), não antecipado pra todo mundo — ver
// abrirModalDetalheProduto.
function _renderProdutosConteudo(conteudoEl, isAdmin, produtosDaCategoria, canais) {
  conteudoEl.innerHTML = `
    <div class="cardapio-categoria-titulo">${escaparHtml(fichaTecnicaCategoriaSelecionada)}</div>
    <div class="cardapio-lista">
      ${produtosDaCategoria.map(p => `
        <div class="cardapio-card" data-id="${p.precoCardapioId}">
          ${_receitaCardHTML(p, isAdmin, canais)}
        </div>
      `).join('')}
    </div>
  `;
  _wireReceitaCardsEventos(conteudoEl);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Complemento não tem foto/custo/valor de venda (fora de escopo nessa
// fase) e, diferente de produto, não tem um seletor de categoria só dele
// no menu lateral (esse índice agora é compartilhado com Produtos) — por
// isso mostra TODAS as categorias de complemento de uma vez, uma embaixo
// da outra, em vez de uma escolhida por vez.
function _renderComplementosConteudo(conteudoEl, isAdmin) {
  if (!fichaTecnicaComplementos.length) {
    conteudoEl.innerHTML = `<p class="panel-subtitle" style="padding: var(--space-4);">Nenhum complemento cadastrado ainda${isAdmin ? ' — use "Novo complemento" ou "Colar lista".' : '.'}</p>`;
    return;
  }

  const categorias = [];
  const porCategoria = new Map();
  fichaTecnicaComplementos.forEach(c => {
    if (!porCategoria.has(c.categoria)) {
      porCategoria.set(c.categoria, []);
      categorias.push(c.categoria);
    }
    porCategoria.get(c.categoria).push(c);
  });

  conteudoEl.innerHTML = categorias.map(categoria => `
    <div class="cardapio-categoria-titulo">${escaparHtml(categoria)}</div>
    <div class="ficha-tecnica-produto-lista">
      ${porCategoria.get(categoria).map(c => {
        const expandido = fichaTecnicaExpandidos.has(c.itemCardapioId);
        return `
        <div class="ficha-tecnica-produto ${expandido ? 'expandido' : ''}">
          <div class="ficha-tecnica-produto-linha ficha-tecnica-complemento-linha" data-acao="expandir-produto" data-item-id="${c.itemCardapioId}">
            <div class="ficha-tecnica-produto-nome">${escaparHtml(c.nome)}</div>
            <i data-lucide="chevron-down" class="ficha-tecnica-chevron"></i>
          </div>
          <div class="ficha-tecnica-produto-expandido" style="display:${expandido ? '' : 'none'};" data-painel-item-id="${c.itemCardapioId}"></div>
        </div>
      `;
      }).join('')}
    </div>
  `).join('');

  conteudoEl.querySelectorAll('[data-acao="expandir-produto"]').forEach(linha => {
    linha.addEventListener('click', () => alternarProdutoFichaTecnica(parseInt(linha.dataset.itemId, 10)));
  });

  fichaTecnicaExpandidos.forEach(itemId => renderPainelFichaTecnicaExpandido(itemId));

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Misturas: uma linha por insumo feito na casa, com quanto rende e o custo
// (ou o que falta pra ter custo). Clicar abre a receita pra editar.
function _renderMisturasConteudo(conteudoEl, isAdmin) {
  if (!fichaTecnicaMisturas.length) {
    conteudoEl.innerHTML = `<p class="panel-subtitle" style="padding: var(--space-4);">Nenhuma mistura com receita ainda${isAdmin ? ' — use "Nova mistura" pra cadastrar a receita de um tempero, molho ou preparo feito na casa.' : '.'}</p>`;
    return;
  }
  conteudoEl.innerHTML = `
    <div class="cardapio-categoria-titulo">${FICHA_TECNICA_MISTURAS_ITEM}</div>
    <div class="ficha-tecnica-produto-lista">
      ${fichaTecnicaMisturas.map(m => {
        const rende = _formatarQuantidade(m.rendimento, m.unidadeMedida);
        const custo = m.custoPorUnidade != null
          ? _formatarCustoPorUnidade(m.custoPorUnidade, m.unidadeMedida)
          : `<span class="mistura-incompleta">${m.semQuantidade ? `${m.semQuantidade} sem quantidade` : 'falta custo de ingrediente'}</span>`;
        return `
        <div class="ficha-tecnica-produto">
          <div class="ficha-tecnica-produto-linha ficha-tecnica-complemento-linha" data-acao="abrir-mistura" data-insumo-id="${m.insumoId}" ${isAdmin ? '' : 'style="cursor:default;"'}>
            <div class="ficha-tecnica-produto-nome">${escaparHtml(m.nome)}</div>
            <div class="mistura-meta">rende ${rende} · ${m.ingredientes} ingrediente${m.ingredientes === 1 ? '' : 's'} · ${custo}</div>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
  if (!isAdmin) return;
  conteudoEl.querySelectorAll('[data-acao="abrir-mistura"]').forEach(linha => {
    linha.addEventListener('click', () => abrirModalReceitaInsumo(parseInt(linha.dataset.insumoId, 10)));
  });
}

// "Nova mistura": o nome digitado vira o insumo da receita — o que já
// existe com esse nome (a lista sugere os insumos cadastrados) ou um novo,
// só desta loja (api_nova_mistura). Depois abre a receita dele.
async function abrirModalNovaMistura() {
  document.getElementById('form-nova-mistura').reset();
  document.getElementById('nova-mistura-erro').style.display = 'none';
  try {
    const dados = await fetch('/api/insumos').then(r => r.json());
    const comReceita = new Set(fichaTecnicaMisturas.map(m => m.insumoId));
    document.getElementById('nova-mistura-insumos').innerHTML = (dados.insumos || [])
      .filter(i => !comReceita.has(i.id))
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map(i => `<option value="${escaparHtml(i.nome)}"></option>`)
      .join('');
  } catch (erro) {
    console.error('Falha ao carregar insumos pra nova mistura:', erro);
  }
  document.getElementById('modal-nova-mistura').style.display = 'flex';
  document.getElementById('nova-mistura-nome').focus();
}

function fecharModalNovaMistura() {
  document.getElementById('modal-nova-mistura').style.display = 'none';
}

document.getElementById('btn-nova-mistura-fechar')?.addEventListener('click', fecharModalNovaMistura);
document.getElementById('btn-nova-mistura-cancelar')?.addEventListener('click', fecharModalNovaMistura);
document.getElementById('form-nova-mistura')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const erro = document.getElementById('nova-mistura-erro');
  erro.style.display = 'none';
  try {
    const resposta = await fetch('/api/misturas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: document.getElementById('nova-mistura-nome').value,
        unidadeMedida: document.getElementById('nova-mistura-unidade').value,
        loja: fichaTecnicaLojaAtual,
      }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível criar a mistura.');
    fecharModalNovaMistura();
    await abrirModalReceitaInsumo(dados.insumoId);
  } catch (e) {
    erro.textContent = e.message;
    erro.style.display = 'block';
  }
});

async function salvarCustoProduto(itemId, valor) {
  // Campo em branco apaga o custo à mão (o produto volta a usar o custo
  // calculado pela receita); texto invalido é ignorado.
  const custo = valor === '' ? null : parseFloat(valor);
  if (custo !== null && isNaN(custo)) return;
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
  renderFichaTecnicaConteudo();
}

// Só usado por Complementos agora (produto abre modal, ver
// abrirModalDetalheProduto) — complemento não tem preço/custo próprio
// (fora de escopo nessa fase, ver _renderComplementosConteudo), só insumos
// + editar/excluir.
async function renderPainelFichaTecnicaExpandido(itemId) {
  const painel = document.querySelector(`[data-painel-item-id="${itemId}"]`);
  if (!painel) return;
  painel.style.display = '';
  painel.innerHTML = `<p class="panel-subtitle">Carregando...</p>`;

  try {
    const dados = await _buscarFichaTecnicaItem(itemId);
    const isAdmin = window.usuarioLogado?.papel === 'admin';
    const produto = _fichaTecnicaItensAtuais().find(p => p.itemCardapioId === itemId);

    painel.innerHTML = `
      <div class="ficha-tecnica-ingredientes">
        ${dados.insumos.length ? dados.insumos.map(ins => `
          <span class="ficha-tecnica-chip">${escaparHtml(ins.nome)}${ins.quantidade != null ? ` <span class="qtd">(${_formatarQuantidadeFicha(ins)})</span>` : ''}</span>
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
        await carregarFichaTecnicaAtual();
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

// Modal de detalhe do produto — abre ao clicar no cartão inteiro (sem
// lápis/lixeira soltos, a pedido da Julia, 2026-09-09), inspirado no modal
// de produto da própria Cardápio Web (foto + campos, um só lugar pra tudo).
// Junta preço por canal (preco_cardapio) + custo + ficha técnica
// (item_cardapio) num só modal, mesmo os dois vivendo em tabelas diferentes
// — ver listar_produtos_por_loja em armazenamento.py, que já casa os dois.
async function abrirModalDetalheProduto(precoCardapioId) {
  const produto = fichaTecnicaProdutos.find(p => String(p.precoCardapioId) === String(precoCardapioId));
  if (!produto) return;
  const isAdmin = window.usuarioLogado?.papel === 'admin';
  const modal = document.getElementById('modal-detalhe-produto');
  const corpo = document.getElementById('detalhe-produto-corpo');
  document.getElementById('detalhe-produto-titulo').textContent = produto.nome;
  corpo.innerHTML = `<p class="panel-subtitle" style="padding: var(--space-4);">Carregando...</p>`;
  modal.style.display = 'flex';

  const temBeefood = fichaTecnicaProdutos.some(p => p.beefood !== null);
  const canais = temBeefood ? CANAIS_CARDAPIO : CANAIS_CARDAPIO.filter(c => c.chave !== 'beefood');

  let dadosInsumos = { insumos: [] };
  if (produto.itemCardapioId) {
    try {
      dadosInsumos = await _buscarFichaTecnicaItem(produto.itemCardapioId);
    } catch (erro) {
      console.error('Falha ao carregar ficha técnica do item:', erro);
    }
  }

  // Complemento com porção própria nesse produto (Frutas ao Creme: cada
  // fruta 70 g no 500) — só no Açaí, única loja com complemento escolhido.
  let porcoesComplemento = [];
  const temPorcoes = produto.itemCardapioId && fichaTecnicaLojaAtual === 'Açaí Na Lata';
  if (temPorcoes) {
    try {
      const resposta = await fetch(`/api/itens-cardapio/${produto.itemCardapioId}/porcoes-complemento?loja=${encodeURIComponent(fichaTecnicaLojaAtual)}`);
      porcoesComplemento = (await resposta.json()).complementos || [];
    } catch (erro) {
      console.error('Falha ao carregar porções dos complementos:', erro);
    }
  }
  let porcoesAlteradas = false;
  // Fechado por padrão: são uns 20 complementos, e só "monte o seu" e
  // Frutas ao Creme usam (nos outros, vale a ficha do complemento).
  const porcoesPreenchidas = porcoesComplemento.filter((c) => c.gramas != null).length;
  const porcoesHTML = temPorcoes && porcoesComplemento.length ? `
    <details class="detalhe-produto-secao">
      <summary class="receita-eyebrow" style="cursor:pointer;">Complementos que o cliente escolhe (${porcoesPreenchidas} com porção)</summary>
      <p class="panel-subtitle">Quanto sai de cada complemento escolhido neste produto. Em branco, vale a ficha do complemento.</p>
      <div class="detalhe-produto-linha">
        ${porcoesComplemento.map((c, indice) => `
          <div class="detalhe-produto-campo">
            <label>${escaparHtml(c.nome)}</label>
            ${isAdmin
              ? `<input type="number" step="1" min="0" data-acao="detalhe-porcao-complemento" data-indice="${indice}" value="${c.gramas ?? ''}" placeholder="g">`
              : `<span>${c.gramas != null ? `${c.gramas} g` : '—'}</span>`}
          </div>
        `).join('')}
      </div>
    </details>
  ` : '';

  // Alterações de preço/custo só vão pro servidor quando clicar Salvar
  // (a pedido da Julia, 2026-09-09 — layout novo troca o antigo
  // autosave-por-campo por um formulário de verdade, igual a referência).
  const alteracoesPreco = {};
  let custoAlterado = null;

  const precoHTML = `
    <div class="detalhe-produto-secao">
      <div class="receita-eyebrow">Preço por canal</div>
      <div class="detalhe-produto-linha">
        ${canais.map(c => `
          <div class="detalhe-produto-campo">
            <label>${c.label}</label>
            ${isAdmin
              ? `<input type="number" step="0.01" min="0" data-acao="detalhe-editar-preco" data-canal="${c.chave}" value="${produto[c.chave] ?? ''}" placeholder="—">`
              : `<span class="cardapio-preco-valor">${_formatarPrecoCardapio(produto[c.chave]) ?? '<span class="cardapio-preco-vazio">—</span>'}</span>`}
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const fichaTecnicaHTML = produto.itemCardapioId ? `
    <div class="detalhe-produto-secao">
      <div class="receita-eyebrow">Custo</div>
      <div class="detalhe-produto-linha">
        <div class="detalhe-produto-campo">
          <label>Preço de custo</label>
          ${isAdmin
            ? `<input type="number" step="0.01" min="0" id="detalhe-produto-input-custo" value="${produto.custo ?? ''}" placeholder="R$ 0,00">`
            : (produto.custo != null ? `<span class="receita-preco-custo-rotulo">R$ ${produto.custo.toFixed(2)}</span>` : `<span class="ficha-tecnica-vazio">—</span>`)}
        </div>
      </div>
    </div>
    <div class="detalhe-produto-secao">
      <div class="receita-eyebrow">Insumos</div>
      <div class="ficha-tecnica-ingredientes">
        ${dadosInsumos.insumos.length ? dadosInsumos.insumos.map(ins => `
          <span class="ficha-tecnica-chip">${escaparHtml(ins.nome)}${ins.quantidade != null ? ` <span class="qtd">(${_formatarQuantidadeFicha(ins)})</span>` : ''}</span>
        `).join('') : `<span class="ficha-tecnica-vazio">Nenhum insumo cadastrado ainda nessa loja.</span>`}
      </div>
      ${isAdmin ? `
        <button type="button" class="btn-secondary-sm" id="btn-detalhe-produto-editar-insumos" style="align-self: flex-start;">
          <i data-lucide="pencil"></i>
          Editar insumos
        </button>
      ` : ''}
    </div>
  ` : (isAdmin ? `
    <div class="detalhe-produto-secao">
      <span class="ficha-tecnica-vazio">Sem ficha técnica ainda</span>
      <button type="button" class="btn-secondary-sm" id="btn-detalhe-produto-criar-ficha" style="align-self: flex-start;">Cadastrar ficha técnica</button>
    </div>
  ` : '');

  corpo.innerHTML = `
    <div class="detalhe-produto-grid">
      <div class="detalhe-produto-foto">
        ${produto.fotoUrl ? `<img src="${produto.fotoUrl}" alt="">` : `<div class="cardapio-foto-vazia"><i data-lucide="image"></i></div>`}
        ${isAdmin ? `
          <button type="button" class="detalhe-produto-btn-foto" id="btn-detalhe-produto-foto" title="Trocar foto">
            <i data-lucide="camera"></i>
          </button>
          <input type="file" accept="image/*" id="detalhe-produto-input-foto" style="display:none;">
        ` : ''}
      </div>
      <div class="detalhe-produto-campos">
        ${precoHTML}
        ${fichaTecnicaHTML}
        ${porcoesHTML}
      </div>
    </div>
    ${isAdmin ? `
      <div class="modal-actions">
        <button type="button" class="btn-secondary-sm" id="btn-detalhe-produto-cancelar">Cancelar</button>
        <button type="button" class="btn-primary-sm" id="btn-detalhe-produto-salvar">Salvar</button>
      </div>
    ` : ''}
  `;

  corpo.querySelectorAll('[data-acao="detalhe-editar-preco"]').forEach((input) => {
    input.addEventListener('input', (evento) => {
      alteracoesPreco[evento.target.dataset.canal] = evento.target.value === '' ? null : evento.target.value;
    });
  });

  document.getElementById('detalhe-produto-input-custo')?.addEventListener('input', (evento) => {
    custoAlterado = evento.target.value;
  });

  corpo.querySelectorAll('[data-acao="detalhe-porcao-complemento"]').forEach((input) => {
    input.addEventListener('input', () => {
      porcoesComplemento[Number(input.dataset.indice)].gramas = input.value === '' ? null : input.value;
      porcoesAlteradas = true;
    });
  });

  document.getElementById('btn-detalhe-produto-cancelar')?.addEventListener('click', fecharModalDetalheProduto);

  document.getElementById('btn-detalhe-produto-salvar')?.addEventListener('click', async (evento) => {
    const botao = evento.currentTarget;
    botao.disabled = true;
    botao.textContent = 'Salvando...';
    try {
      if (Object.keys(alteracoesPreco).length) {
        const resposta = await fetch(`/api/precos-cardapio/${precoCardapioId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(alteracoesPreco),
        });
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.erro || 'falha ao salvar preço');
        Object.assign(produto, { ifood: dados.ifood, food99: dados.food99, beefood: dados.beefood, cardapioWeb: dados.cardapioWeb, valorVenda: dados.cardapioWeb });
      }
      if (custoAlterado !== null && produto.itemCardapioId) {
        await salvarCustoProduto(produto.itemCardapioId, custoAlterado);
      }
      if (porcoesAlteradas) {
        const resposta = await fetch(`/api/itens-cardapio/${produto.itemCardapioId}/porcoes-complemento`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ loja: fichaTecnicaLojaAtual, complementos: porcoesComplemento }),
        });
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.erro || 'falha ao salvar porções');
      }
      fecharModalDetalheProduto();
      renderFichaTecnicaConteudo();
    } catch (erro) {
      console.error('Falha ao salvar produto do cardápio:', erro);
      alert('Não foi possível salvar. Tenta de novo.');
      botao.disabled = false;
      botao.textContent = 'Salvar';
    }
  });

  document.getElementById('btn-detalhe-produto-editar-insumos')?.addEventListener('click', () => {
    fecharModalDetalheProduto();
    abrirModalFichaTecnicaItem(produto.itemCardapioId);
  });

  document.getElementById('btn-detalhe-produto-criar-ficha')?.addEventListener('click', () => {
    fichaTecnicaProdutoPendente = { nome: produto.nome, categoria: produto.categoria };
    document.getElementById('novo-item-nome').value = produto.nome;
    document.getElementById('novo-item-categoria').value = produto.categoria;
    fecharModalDetalheProduto();
    document.getElementById('modal-novo-item-cardapio').style.display = 'flex';
  });

  document.getElementById('btn-detalhe-produto-foto')?.addEventListener('click', () => {
    document.getElementById('detalhe-produto-input-foto')?.click();
  });

  document.getElementById('detalhe-produto-input-foto')?.addEventListener('change', async (evento) => {
    const arquivo = evento.target.files[0];
    evento.target.value = '';
    if (!arquivo) return;
    try {
      const formData = new FormData();
      formData.append('foto', arquivo);
      const resposta = await fetch(`/api/precos-cardapio/${precoCardapioId}/foto`, { method: 'POST', body: formData });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'falha ao subir foto');
      produto.fotoUrl = dados.fotoUrl;
      const fotoContainer = corpo.querySelector('.detalhe-produto-foto');
      fotoContainer.querySelector('img, .cardapio-foto-vazia')?.remove();
      fotoContainer.insertAdjacentHTML('afterbegin', `<img src="${dados.fotoUrl}" alt="">`);
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (erro) {
      console.error('Falha ao subir foto do cardápio:', erro);
      alert('Não foi possível subir a foto. Tenta de novo.');
    }
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function fecharModalDetalheProduto() {
  document.getElementById('modal-detalhe-produto').style.display = 'none';
}

document.getElementById('btn-detalhe-produto-fechar')?.addEventListener('click', fecharModalDetalheProduto);

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
      fichaTecnicaCategoriaSelecionada = null;
      seletor.classList.remove('aberto');
      carregarFichaTecnicaAtual();
    });
  });
})();

// --- Modal: Novo item do cardápio (produto ou complemento, conforme a aba ativa) ---
function abrirModalNovoItemCardapio() {
  if (fichaTecnicaTipoAtual === 'mistura') {
    abrirModalNovaMistura();
    return;
  }
  fichaTecnicaProdutoPendente = null;
  document.getElementById('form-novo-item-cardapio').reset();
  const ehComplemento = fichaTecnicaTipoAtual === 'complemento';
  document.querySelector('#modal-novo-item-cardapio .panel-title').textContent = ehComplemento ? 'Novo complemento' : 'Novo item do cardápio';
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
    // Fora da aba Complementos (em Misturas, por exemplo), o item é um produto.
    tipo: fichaTecnicaTipoAtual === 'complemento' ? 'complemento' : 'produto',
    loja: fichaTecnicaLojaAtual,
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
    await carregarFichaTecnicaAtual();
    if (abriaFichaLogoEmSeguida) abrirModalFichaTecnicaItem(dados.id);
  } catch (erro) {
    console.error('Falha ao cadastrar item do cardápio:', erro);
    alert(erro.message || 'Não foi possível cadastrar.');
  }
});

// --- Modal: Colar lista de complementos ---
document.getElementById('btn-colar-lista-complementos')?.addEventListener('click', () => {
  document.getElementById('colar-complementos-texto').value = '';
  document.getElementById('colar-complementos-erro').style.display = 'none';
  document.getElementById('colar-complementos-resultado').textContent = '';
  document.getElementById('modal-colar-complementos').style.display = 'flex';
});
function fecharModalColarComplementos() {
  document.getElementById('modal-colar-complementos').style.display = 'none';
}
document.getElementById('btn-colar-complementos-fechar')?.addEventListener('click', fecharModalColarComplementos);
document.getElementById('btn-colar-complementos-cancelar')?.addEventListener('click', fecharModalColarComplementos);

document.getElementById('form-colar-complementos')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const texto = document.getElementById('colar-complementos-texto').value;
  const erroEl = document.getElementById('colar-complementos-erro');
  const resultadoEl = document.getElementById('colar-complementos-resultado');
  erroEl.style.display = 'none';
  try {
    const resposta = await fetch('/api/complementos/lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao cadastrar');
    resultadoEl.textContent = `${dados.criados.length} cadastrado(s)${dados.duplicados.length ? `, ${dados.duplicados.length} já existia(m): ${dados.duplicados.join(', ')}` : '.'}`;
    await carregarFichaTecnicaAtual();
    if (!dados.duplicados.length) fecharModalColarComplementos();
  } catch (erro) {
    console.error('Falha ao cadastrar complementos em lote:', erro);
    erroEl.textContent = erro.message || 'Não foi possível cadastrar.';
    erroEl.style.display = 'block';
  }
});

// Quantidade de um insumo na receita. Com conteúdo cadastrado ("1 un =
// 1000 g"), mostra primeiro em grama, que é como a receita é pensada:
// "14 g (0,014 un)".
function _formatarQuantidadeFicha(ins) {
  if (ins.quantidade == null) return '—';
  if (!ins.conteudoPorUnidade) return _formatarQuantidade(ins.quantidade, ins.unidadeMedida || '');
  // A fração de unidade vai com todas as casas: 0,014 un arredondado pra
  // 0,01 pareceria 10 g.
  const naUnidade = `${ins.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} ${ins.unidadeMedida}`;
  return `${_formatarQuantidade(_arredondarQuantidade(ins.quantidade * ins.conteudoPorUnidade), ins.unidadeConteudo)} (${naUnidade})`;
}

// --- Modal: Editar ficha técnica de um item ---
// `quantidade` chega sempre na unidade do insumo (é o que fica gravado).
// Insumo contado por unidade com conteúdo cadastrado ("1 un = 1000 g") ganha
// um seletor g/un: ela digita "14 g" e o que vai pro banco é 0,014 un. O
// campo aceita qualquer casa decimal — com step 0,01, 0,014 era recusado
// pelo navegador e só dava pra gravar 0,01 ou 0,02.
function _linhaFichaTecnicaHTML(insumoId, quantidade) {
  const opcoes = fichaTecnicaInsumosDisponiveis.map(i =>
    `<option value="${i.id}" ${i.id === insumoId ? 'selected' : ''}>${escaparHtml(i.nome)} (${escaparHtml(i.unidadeMedida)})</option>`
  ).join('');
  return `
    <div class="ficha-tecnica-linha" data-quantidade-base="${quantidade ?? ''}">
      <select class="ficha-tecnica-select-insumo">${opcoes}</select>
      <input type="number" step="any" min="0" class="ficha-tecnica-input-quantidade" placeholder="Qtd.">
      <select class="ficha-tecnica-select-unidade" aria-label="Unidade da quantidade"></select>
      <button type="button" class="btn-acao-icone btn-excluir" data-acao="remover-linha-ficha-tecnica" title="Remover">
        <i data-lucide="x"></i>
      </button>
    </div>
  `;
}

function _insumoDaLinhaFicha(linha) {
  const id = parseInt(linha.querySelector('.ficha-tecnica-select-insumo').value, 10);
  return fichaTecnicaInsumosDisponiveis.find(i => i.id === id);
}

function _arredondarQuantidade(valor) {
  return Math.round(valor * 10000) / 10000;
}

// Seletor g/un de uma linha de receita — o mesmo na ficha técnica e na
// receita de mistura. Monta as opções e mostra a quantidade gravada na
// unidade escolhida: com conteúdo cadastrado ("1 un = 1000 g"), abre em
// grama/ml, que é como a receita é pensada.
function _prepararSeletorUnidade(seletor, campo, insumo, quantidadeBase) {
  const conteudo = insumo?.conteudoPorUnidade;
  if (conteudo) {
    seletor.innerHTML = `<option value="conteudo">${escaparHtml(insumo.unidadeConteudo)}</option><option value="base">${escaparHtml(insumo.unidadeMedida)}</option>`;
    seletor.value = 'conteudo';
    seletor.style.visibility = '';
    campo.value = quantidadeBase === null || quantidadeBase === '' ? '' : _arredondarQuantidade(quantidadeBase * conteudo);
  } else {
    seletor.innerHTML = `<option value="base">${escaparHtml(insumo?.unidadeMedida || '')}</option>`;
    seletor.value = 'base';
    seletor.style.visibility = insumo ? '' : 'hidden';
    campo.value = quantidadeBase === null || quantidadeBase === '' ? '' : quantidadeBase;
  }
  seletor.dataset.anterior = seletor.value;
}

// Quantidade que vai pro banco, sempre na unidade do insumo.
function _quantidadeNaUnidadeDoInsumo(seletor, campo, insumo) {
  if (campo.value === '') return null;
  const numero = parseFloat(campo.value);
  return seletor.value === 'conteudo' && insumo?.conteudoPorUnidade ? numero / insumo.conteudoPorUnidade : numero;
}

// Trocou g <-> un: converte o número, pra quantidade continuar a mesma.
function _converterAoTrocarUnidade(seletor, campo, insumo) {
  const conteudo = insumo?.conteudoPorUnidade;
  if (conteudo && campo.value !== '') {
    const numero = parseFloat(campo.value);
    campo.value = _arredondarQuantidade(seletor.value === 'base' && seletor.dataset.anterior === 'conteudo'
      ? numero / conteudo
      : seletor.value === 'conteudo' && seletor.dataset.anterior === 'base' ? numero * conteudo : numero);
  }
  seletor.dataset.anterior = seletor.value;
}

function _prepararUnidadeLinhaFicha(linha, quantidadeBase) {
  _prepararSeletorUnidade(linha.querySelector('.ficha-tecnica-select-unidade'),
    linha.querySelector('.ficha-tecnica-input-quantidade'), _insumoDaLinhaFicha(linha), quantidadeBase);
}

function _quantidadeBaseDaLinhaFicha(linha) {
  return _quantidadeNaUnidadeDoInsumo(linha.querySelector('.ficha-tecnica-select-unidade'),
    linha.querySelector('.ficha-tecnica-input-quantidade'), _insumoDaLinhaFicha(linha));
}

function _wireLinhasFichaTecnica() {
  document.querySelectorAll('#ficha-tecnica-item-linhas .ficha-tecnica-linha:not([data-ligada])').forEach(linha => {
    linha.dataset.ligada = '1';
    const base = linha.dataset.quantidadeBase;
    _prepararUnidadeLinhaFicha(linha, base === '' ? null : parseFloat(base));
    linha.querySelector('[data-acao="remover-linha-ficha-tecnica"]').addEventListener('click', () => linha.remove());
    // Trocou o insumo: a quantidade digitada fica, a unidade volta pro padrão dele.
    linha.querySelector('.ficha-tecnica-select-insumo').addEventListener('change', () => {
      const valor = linha.querySelector('.ficha-tecnica-input-quantidade').value;
      _prepararUnidadeLinhaFicha(linha, null);
      linha.querySelector('.ficha-tecnica-input-quantidade').value = valor;
    });
    const seletor = linha.querySelector('.ficha-tecnica-select-unidade');
    seletor.addEventListener('change', () => {
      _converterAoTrocarUnidade(seletor, linha.querySelector('.ficha-tecnica-input-quantidade'), _insumoDaLinhaFicha(linha));
    });
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
  const produto = _fichaTecnicaItensAtuais().find(p => p.itemCardapioId === itemId);
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
    quantidade: _quantidadeBaseDaLinhaFicha(linha),
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
    const produto = _fichaTecnicaItensAtuais().find(p => p.itemCardapioId === itemId);
    if (produto) produto.temFichaTecnica = insumos.length > 0;
    if (fichaTecnicaTipoAtual === 'complemento') {
      if (fichaTecnicaExpandidos.has(itemId)) await renderPainelFichaTecnicaExpandido(itemId);
    } else {
      // Produto não usa mais o acordeão (fichaTecnicaExpandidos) — o
      // cartão de receita mostra os insumos sempre, então precisa
      // re-renderizar a grade pra puxar a lista já atualizada.
      renderFichaTecnicaConteudo();
    }
  } catch (erro) {
    console.error('Falha ao salvar ficha técnica:', erro);
    alert(erro.message || 'Não foi possível salvar.');
  }
});

// Preços e Ficha Técnica eram duas abas (?aba=) — viraram uma tela só em
// 2026-09-09 (ver _receitaCardHTML/_renderProdutosConteudo). O carregamento
// inicial agora acontece direto na seção "4.095 TELA DE CARDÁPIO", lá em cima.

/* ---------------------------------------------------------------------
   CURVA ABC DE CARDÁPIO (Etapa 10 do motor de compra)
   Cruza volume vendido × margem × CMV real por produto. O cálculo mora no
   backend (curva_abc_cardapio) — aqui é só apresentação.
   --------------------------------------------------------------------- */
let curvaAbcLoja = 'Hamburgueria Artesanos';
let curvaAbcDias = 30;
let curvaAbcDados = null;

async function carregarCurvaAbc() {
  try {
    const resposta = await fetch(`/api/curva-abc?loja=${encodeURIComponent(curvaAbcLoja)}&dias=${curvaAbcDias}`);
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao carregar');
    curvaAbcDados = dados;
    renderCurvaAbc();
  } catch (erro) {
    console.error('Falha ao carregar Curva ABC:', erro);
    document.getElementById('curva-tabela-body').innerHTML =
      `<tr><td colspan="8" class="panel-subtitle">Não foi possível carregar a análise.</td></tr>`;
  }
}

function _curvaCmvHTML(item) {
  if (item.cmvPercent === null) return '<span class="curva-sem-dado">—</span>';
  const classe = item.cmvPercent >= 30 ? 'curva-cmv-alto' : 'curva-cmv-ok';
  return `<span class="curva-num ${classe}">${item.cmvPercent.toString().replace('.', ',')}%</span>`;
}

function _curvaMargemHTML(item) {
  if (item.margem === null) return '<span class="curva-sem-dado">—</span>';
  return `<span class="curva-num">R$ ${_formatarMoedaBR(item.margem)}</span>`;
}

function _curvaCheckProtegidoHTML(item) {
  const isAdmin = window.usuarioLogado?.papel === 'admin';
  if (!isAdmin) {
    return item.protegido ? '<span class="curva-badge-protegido">protegido</span>' : '<span class="curva-sem-dado">—</span>';
  }
  return `<input type="checkbox" class="curva-check-protegido" data-item-id="${item.itemCardapioId}" ${item.protegido ? 'checked' : ''} title="Nunca sugerir corte desse produto">`;
}

function renderCurvaAbc() {
  const d = curvaAbcDados;
  if (!d) return;

  const aviso = document.getElementById('curva-aviso');
  const semCmv = d.itens.filter(i => i.margem === null).length;
  const partes = [];
  if (d.vendasNaoCasadas) {
    partes.push(`${d.vendasNaoCasadas} venda(s) de ${d.produtosNaoCasados} produto(s) ainda não casaram com a Ficha Técnica e ficaram de fora — resolva em Configurações → Integrações do Estoque.`);
  }
  if (semCmv) {
    partes.push(`${semCmv} produto(s) aparecem sem CMV: falta preço de algum insumo da receita (ou a receita não está cadastrada), então a margem não dá pra calcular.`);
  }
  aviso.innerHTML = partes.join(' ');
  aviso.style.display = partes.length ? '' : 'none';

  document.getElementById('curva-tabela-subtitulo').textContent =
    `${d.loja} — últimos ${d.dias} dias · ${_formatarNumeroBR(d.totalVolume)} itens vendidos · R$ ${_formatarMoedaBR(d.totalReceita)} de receita`;

  const curvaA = d.itens.filter(i => i.curva === 'A');
  const curvaC = d.itens.filter(i => i.curva === 'C');

  document.getElementById('curva-a-body').innerHTML = curvaA.length ? curvaA.map(i => `
    <tr>
      <td class="font-bold">${escaparHtml(i.nome)}</td>
      <td><span class="curva-num">${_formatarNumeroBR(i.volume)}</span></td>
      <td>${_curvaCmvHTML(i)}</td>
      <td>${_curvaMargemHTML(i)}</td>
    </tr>
  `).join('') : `<tr><td colspan="4" class="curva-vazio">Nenhum produto com margem calculável ainda no período.</td></tr>`;

  document.getElementById('curva-c-body').innerHTML = curvaC.length ? curvaC.map(i => `
    <tr>
      <td class="font-bold">${escaparHtml(i.nome)}</td>
      <td><span class="curva-num">${_formatarNumeroBR(i.volume)}</span></td>
      <td>${_curvaCmvHTML(i)}</td>
      <td>${_curvaMargemHTML(i)}</td>
      <td>${_curvaCheckProtegidoHTML(i)}</td>
    </tr>
  `).join('') : `<tr><td colspan="5" class="curva-vazio">Nada pra repensar no período — nenhum produto junta baixo volume com CMV ruim.</td></tr>`;

  const rotuloCurva = { 'A': ['curva-tag-a', 'Curva A'], 'C': ['curva-tag-c', 'C fraca'], 'sem-cmv': ['curva-tag-sem-cmv', 'sem CMV'], 'normal': ['curva-tag-normal', '—'] };
  document.getElementById('curva-tabela-body').innerHTML = d.itens.length ? d.itens.map(i => {
    const [classe, texto] = rotuloCurva[i.curva] || rotuloCurva['normal'];
    return `
      <tr>
        <td class="font-bold">${escaparHtml(i.nome)}</td>
        <td class="text-muted">${escaparHtml(i.categoria)}</td>
        <td><span class="curva-num">${_formatarNumeroBR(i.volume)}</span></td>
        <td><span class="curva-num">R$ ${_formatarMoedaBR(i.receita)}</span></td>
        <td>${_curvaCmvHTML(i)}</td>
        <td>${_curvaMargemHTML(i)}</td>
        <td><span class="curva-tag ${classe}">${texto}</span></td>
        <td>${_curvaCheckProtegidoHTML(i)}</td>
      </tr>
    `;
  }).join('') : `<tr><td colspan="8" class="curva-vazio">Nenhuma venda casada com a Ficha Técnica nesse período.</td></tr>`;

  document.querySelectorAll('.curva-check-protegido').forEach((check) => {
    check.addEventListener('change', async () => {
      const itemId = parseInt(check.dataset.itemId, 10);
      try {
        const resposta = await fetch(`/api/itens-cardapio/${itemId}/protegido`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ protegido: check.checked }),
        });
        if (!resposta.ok) throw new Error('falha ao salvar');
        await carregarCurvaAbc();
      } catch (erro) {
        console.error('Falha ao marcar produto como protegido:', erro);
        alert('Não foi possível salvar.');
        check.checked = !check.checked;
      }
    });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}


/* ---------------------------------------------------------------------
   VENDAS SEMANAIS — fechamento por semana de cada loja.

   O número que o chefe da Julia persegue é o %CMV (a planilha dele tem uma
   coluna só pra classificar a semana em ÓTIMO/BOM/RUIM), então a tela abre
   pelo veredito da semana, não pelo faturamento. A fita embaixo é o
   histórico inteiro: altura é faturamento, cor é CMV — dá pra ver sequência
   de semana ruim e sazonalidade sem ler número nenhum.
   --------------------------------------------------------------------- */
let vendasSemanaisLojaAtual = 'Hamburgueria Artesanos';
let vendasSemanaisDados = [];
let vendasSemanaisSelecionada = null;

const CANAIS_VENDAS_SEMANAIS = [
  { chave: 'ifood', label: 'iFood' },
  { chave: 'catalog', label: 'Cardápio Web' },
  { chave: 'food99', label: '99Food' },
  { chave: 'portal', label: 'Presencial' },
];

// Mesmas faixas da fórmula da planilha: <31% ótimo, 31-34% bom, acima ruim.
const VEREDITO = {
  otimo: { palavra: 'Ótimo', chip: 'chip-otimo', cor: 'cor-otimo' },
  bom: { palavra: 'Bom', chip: 'chip-bom', cor: 'cor-bom' },
  ruim: { palavra: 'Ruim', chip: 'chip-ruim', cor: 'cor-ruim' },
};

async function carregarVendasSemanais(loja) {
  const subtitulo = document.getElementById('vendas-semanais-subtitulo');
  if (subtitulo) subtitulo.textContent = loja;
  try {
    const resposta = await fetch(`/api/faturamento-semanal?loja=${encodeURIComponent(loja)}`);
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao carregar');
    vendasSemanaisDados = dados.semanas || [];
    vendasSemanaisSelecionada = vendasSemanaisDados.length ? vendasSemanaisDados[0].periodoInicio : null;
    renderVendasSemanais();
  } catch (erro) {
    console.error('Falha ao carregar vendas semanais:', erro);
    document.getElementById('vendas-semanais-tabela-body').innerHTML =
      `<tr><td colspan="9" class="panel-subtitle">Não foi possível carregar o histórico.</td></tr>`;
  }
}

function _periodoSemanaLabel(inicioIso, fimIso) {
  const curto = (iso) => iso.split('-').slice(1).reverse().join('/');
  return `${curto(inicioIso)} a ${curto(fimIso)}`;
}

function _pctBR(fracao, casas = 1) {
  return `${(fracao * 100).toFixed(casas).replace('.', ',')}%`;
}

// Faturamento subindo é bom; CMV subindo é ruim. A cor segue o significado
// do indicador, não o sinal do número.
function _deltaHTML(variacao, subirEhBom) {
  if (variacao === null || variacao === undefined) return '<span class="semana-delta neutro">—</span>';
  const subiu = variacao > 0;
  const classe = Math.abs(variacao) < 0.005 ? 'neutro' : (subiu === subirEhBom ? 'bom' : 'ruim');
  return `<span class="semana-delta ${classe}">${subiu ? '↑' : '↓'} ${_pctBR(Math.abs(variacao), 1)}</span>`;
}

function renderVendasSemanais() {
  const semanas = vendasSemanaisDados;
  const heroEl = document.getElementById('semana-hero-container');
  const fitaCard = document.getElementById('fita-card');
  if (!heroEl || !fitaCard) return;

  if (!semanas.length) {
    heroEl.innerHTML = '';
    fitaCard.style.display = 'none';
    document.getElementById('vendas-semanais-tabela-body').innerHTML =
      `<tr><td colspan="9" class="panel-subtitle">Nenhuma semana ainda pra essa loja — importe a planilha do histórico pra começar.</td></tr>`;
    return;
  }

  const semana = semanas.find(s => s.periodoInicio === vendasSemanaisSelecionada) || semanas[0];
  const isAdmin = window.usuarioLogado?.papel === 'admin';
  const veredito = VEREDITO[semana.classificacao];
  const ehMaisRecente = semana.periodoInicio === semanas[0].periodoInicio;

  const canaisComValor = CANAIS_VENDAS_SEMANAIS.filter(c => semana.canais[c.chave]);
  const barras = canaisComValor.map(c => {
    const parte = semana.total ? (semana.canais[c.chave] / semana.total) * 100 : 0;
    return `<span class="canal-${c.chave}" style="width:${parte}%" title="${c.label}"></span>`;
  }).join('');
  const legenda = canaisComValor.map(c => `
    <span class="canal-item">
      <span class="canal-ponto canal-${c.chave}"></span>
      ${c.label}
      <span class="canal-valor">R$ ${_formatarMoedaBR(semana.canais[c.chave])}</span>
    </span>
  `).join('');

  const origemTitulo = semana.origem === 'sistema'
    ? 'Somado do faturamento diário que o AdmFood sincroniza sozinho'
    : 'Veio da planilha importada — o sistema ainda não tinha esse período';

  heroEl.innerHTML = `
    <div class="semana-hero ${veredito ? 'veredito-' + semana.classificacao : ''}">
      <div class="semana-hero-topo">
        <div>
          <span class="semana-hero-rotulo">${ehMaisRecente ? 'Semana mais recente' : 'Semana selecionada'}</span>
          <span class="semana-hero-periodo">${_periodoSemanaLabel(semana.periodoInicio, semana.periodoFim)} · ${semana.periodoInicio.slice(0, 4)}</span>
        </div>
        <span class="tag-origem" title="${origemTitulo}">${semana.origem === 'sistema' ? 'do sistema' : 'da planilha'}</span>
      </div>

      <div class="semana-hero-corpo">
        <div class="veredito-bloco">
          <span class="semana-hero-rotulo">CMV sobre o faturamento</span>
          <span class="veredito-pct">${semana.pctCmv !== null ? _pctBR(semana.pctCmv) : '—'}</span>
          <span class="veredito-palavra">${veredito ? veredito.palavra : 'sem CMV'}</span>
          <span class="veredito-legenda">${semana.pctCmv !== null
            ? 'Meta: abaixo de 31% é ótimo, até 34% é bom.'
            : 'Sem CMV lançado nessa semana, então não dá pra classificar.'}</span>
        </div>

        <div class="semana-numeros">
          <div class="semana-linha">
            <span class="semana-linha-rotulo">Faturamento</span>
            <span class="semana-linha-valor destaque">R$ ${_formatarMoedaBR(semana.total)}</span>
            ${_deltaHTML(semana.variacaoTotal, true)}
          </div>
          <div class="semana-linha">
            <span class="semana-linha-rotulo">CMV</span>
            ${_valorEditavelHTML('cmv', semana.cmv, isAdmin)}
            ${_deltaHTML(semana.variacaoCmv, false)}
          </div>
          <div class="semana-linha">
            <span class="semana-linha-rotulo">Promoção da loja</span>
            ${_valorEditavelHTML('promoLoja', semana.promoLoja, isAdmin)}
            <span class="semana-delta neutro"></span>
          </div>
        </div>
      </div>

      <div class="canais-barra">${barras}</div>
      <div class="canais-legenda">${legenda}</div>
    </div>
  `;

  // A fita vai do mais antigo pro mais recente (a lista vem invertida).
  const cronologica = [...semanas].reverse();
  const maiorTotal = Math.max(...cronologica.map(s => s.total), 1);
  document.getElementById('fita').innerHTML = cronologica.map((s) => {
    const altura = Math.max(4, Math.round((s.total / maiorTotal) * 100));
    const cor = VEREDITO[s.classificacao] ? VEREDITO[s.classificacao].cor : 'cor-sem-cmv';
    const selecionada = s.periodoInicio === semana.periodoInicio ? ' selecionada' : '';
    const pct = s.pctCmv !== null ? _pctBR(s.pctCmv) : 'sem CMV';
    const rotulo = `${_periodoSemanaLabel(s.periodoInicio, s.periodoFim)} · R$ ${_formatarMoedaBR(s.total)} · CMV ${pct}`;
    return `
      <button type="button" class="fita-semana${selecionada}" data-inicio="${s.periodoInicio}" title="${rotulo}" aria-label="${rotulo}">
        <span class="fita-barra ${cor}" style="height:${altura}%"></span>
      </button>
    `;
  }).join('');
  fitaCard.style.display = '';

  const primeira = cronologica[0];
  const ultima = cronologica[cronologica.length - 1];
  document.getElementById('fita-eixo-inicio').textContent =
    `${_periodoSemanaLabel(primeira.periodoInicio, primeira.periodoFim)} · ${primeira.periodoInicio.slice(0, 4)}`;
  document.getElementById('fita-eixo-fim').textContent =
    `${_periodoSemanaLabel(ultima.periodoInicio, ultima.periodoFim)} · ${ultima.periodoInicio.slice(0, 4)}`;

  const fitaEl = document.getElementById('fita');
  document.querySelectorAll('#fita .fita-semana').forEach((btn) => {
    btn.addEventListener('click', () => {
      vendasSemanaisSelecionada = btn.dataset.inicio;
      const scroll = fitaEl.scrollLeft;
      renderVendasSemanais();
      document.getElementById('fita').scrollLeft = scroll;
    });
  });
  // Abre mostrando o fim da fita, que é a semana mais recente.
  fitaEl.scrollLeft = fitaEl.scrollWidth;

  document.querySelectorAll('[data-campo-semana]').forEach((input) => {
    input.addEventListener('change', async () => {
      try {
        await _salvarResultadoSemana(semana, input.dataset.campoSemana, input.value);
        await carregarVendasSemanais(vendasSemanaisLojaAtual);
      } catch (erro) {
        console.error('Falha ao salvar CMV/promoção da semana:', erro);
        alert(erro.message || 'Não foi possível salvar.');
      }
    });
  });

  renderVendasSemanaisTabela(semanas);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// CMV e promoção são digitados (não têm fonte automática hoje) — então na
// tela eles são campo, não texto. O faturamento continua só leitura: ele vem
// do sistema ou da planilha, e deixar editar criaria uma terceira versão.
function _valorEditavelHTML(campo, valor, isAdmin) {
  if (!isAdmin) {
    return `<span class="semana-linha-valor">${valor ? 'R$ ' + _formatarMoedaBR(valor) : '—'}</span>`;
  }
  return `<span class="semana-valor-editavel">
    <span class="prefixo-moeda">R$</span>
    <input type="number" step="0.01" min="0" data-campo-semana="${campo}"
      value="${valor !== null && valor !== undefined ? valor : ''}" placeholder="—"
      aria-label="${campo === 'cmv' ? 'CMV da semana' : 'Promoção da loja na semana'}">
  </span>`;
}

async function _salvarResultadoSemana(semana, campo, valor) {
  const corpo = {
    loja: vendasSemanaisLojaAtual,
    periodoInicio: semana.periodoInicio,
    periodoFim: semana.periodoFim,
    cmv: semana.cmv,
    promoLoja: semana.promoLoja,
  };
  corpo[campo] = valor === '' ? null : valor;
  const resposta = await fetch('/api/faturamento-semanal/resultado', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  if (!resposta.ok) {
    const dados = await resposta.json();
    throw new Error(dados.erro || 'falha ao salvar');
  }
}

function renderVendasSemanaisTabela(semanas) {
  const tbody = document.getElementById('vendas-semanais-tabela-body');
  if (!tbody) return;

  tbody.innerHTML = semanas.map((semana) => {
    const celulas = CANAIS_VENDAS_SEMANAIS.map((canal) => {
      const valor = semana.canais[canal.chave];
      // Canal sem linha naquela semana (ex: 99Food antes da loja operar
      // nele) fica "—", não R$ 0,00: zero diria que não vendeu, e o certo
      // é que não existia.
      return valor === undefined || valor === null
        ? '<td class="text-muted">—</td>'
        : `<td class="num-mono">R$ ${_formatarMoedaBR(valor)}</td>`;
    }).join('');
    const veredito = VEREDITO[semana.classificacao];
    const chipPct = semana.pctCmv !== null
      ? `<span class="chip-veredito ${veredito ? veredito.chip : 'chip-sem-cmv'}">${_pctBR(semana.pctCmv)}${veredito ? ' · ' + veredito.palavra.toLowerCase() : ''}</span>`
      : '<span class="chip-veredito chip-sem-cmv">sem CMV</span>';
    return `
      <tr>
        <td class="font-bold num-mono">${_periodoSemanaLabel(semana.periodoInicio, semana.periodoFim)}
          <span class="text-muted" style="font-weight:400;">${semana.periodoInicio.slice(0, 4)}</span></td>
        ${celulas}
        <td class="font-bold num-mono col-atual-destaque">R$ ${_formatarMoedaBR(semana.total)}</td>
        <td class="num-mono">${semana.cmv !== null ? 'R$ ' + _formatarMoedaBR(semana.cmv) : '<span class="text-muted">—</span>'}</td>
        <td>${chipPct}</td>
        <td class="num-mono">${semana.promoLoja ? 'R$ ' + _formatarMoedaBR(semana.promoLoja) : '<span class="text-muted">—</span>'}</td>
      </tr>
    `;
  }).join('');
}


async function importarPlanilhaVendasSemanais(event) {
  const arquivo = event.target.files[0];
  event.target.value = ''; // permite escolher o mesmo arquivo de novo depois
  if (!arquivo) return;

  const statusEl = document.getElementById('vendas-semanais-importar-status');
  statusEl.style.display = 'block';
  statusEl.style.color = '';
  statusEl.textContent = `Importando "${arquivo.name}"...`;

  try {
    const formData = new FormData();
    formData.append('planilha', arquivo);
    const resposta = await fetch('/api/faturamento-semanal/importar', { method: 'POST', body: formData });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao importar');

    const partes = [];
    if (dados.gravadas) partes.push(`${dados.gravadas} valor(es) novo(s) gravado(s)`);
    if (dados.jaExistiam) partes.push(`${dados.jaExistiam} já estavam no sistema e ficaram como estavam`);
    if (!partes.length) partes.push('nada novo pra gravar');
    // Linha que a planilha traz com data quebrada não entra — avisa qual,
    // senão a semana some sem ninguém perceber.
    if (dados.avisos?.length) {
      partes.push(`${dados.avisos.length} linha(s) ficaram de fora: ${dados.avisos.join('; ')}`);
    }
    statusEl.textContent = partes.join(' · ');
    await carregarVendasSemanais(vendasSemanaisLojaAtual);
  } catch (erro) {
    console.error('Falha ao importar planilha de vendas semanais:', erro);
    statusEl.style.color = 'var(--danger)';
    statusEl.textContent = erro.message || 'Não foi possível importar a planilha.';
  }
}

/* --- Curva ABC de insumos (Etapa 8) ----------------------------------
   Quanto cada insumo movimentou em compra recebida. Serve pra decidir o
   que exige conferência antes de aprovar uma Requisição — a Curva A é
   curta e concentra o gasto, a cauda pode passar direto. */
let curvaInsumosDias = 90;

async function carregarCurvaAbcInsumos() {
  const tbody = document.getElementById('curva-insumos-body');
  try {
    const resposta = await fetch(`/api/curva-abc-insumos?dias=${curvaInsumosDias}`);
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao carregar');
    renderCurvaAbcInsumos(dados);
  } catch (erro) {
    console.error('Falha ao carregar curva ABC de insumos:', erro);
    tbody.innerHTML = `<tr><td colspan="7" class="panel-subtitle">Não foi possível carregar a análise.</td></tr>`;
  }
}

function renderCurvaAbcInsumos(dados) {
  const aviso = document.getElementById('curva-insumos-aviso');
  const tbody = document.getElementById('curva-insumos-body');

  document.getElementById('curva-insumos-subtitulo').textContent =
    `Últimos ${dados.dias} dias · R$ ${_formatarMoedaBR(dados.total)} em compras recebidas`;

  if (!dados.itens.length) {
    aviso.style.display = '';
    aviso.textContent = 'Nenhuma compra recebida nesse período. A curva se monta sozinha conforme os pedidos forem sendo recebidos em Compras → Recebimentos — ela mede dinheiro que saiu de verdade, não cotação nem pedido em aberto.';
    tbody.innerHTML = `<tr><td colspan="7" class="curva-vazio">Sem dado de compra pra classificar ainda.</td></tr>`;
    return;
  }

  const { A = 0, B = 0, C = 0 } = dados.porClasse;
  aviso.style.display = '';
  aviso.textContent = `${A} insumo(s) na Curva A concentram até 80% do gasto — são esses que valem conferir antes de aprovar uma Requisição. Curva B: ${B}. Curva C: ${C}.`;

  const classeChip = { A: 'chip-curva-a', B: 'chip-curva-b', C: 'chip-curva-c' };
  tbody.innerHTML = dados.itens.map((item) => `
    <tr>
      <td class="font-bold">${escaparHtml(item.nome)}</td>
      <td class="text-muted">${escaparHtml(item.categoria)}</td>
      <td><span class="curva-num">${_formatarQuantidade(_formatarNumeroBR(item.quantidade), item.unidadeMedida)}</span></td>
      <td><span class="curva-num">R$ ${_formatarMoedaBR(item.valor)}</span></td>
      <td><span class="curva-num">${(item.participacao * 100).toFixed(1).replace('.', ',')}%</span></td>
      <td>
        <div class="acumulado-cell">
          <span class="curva-num">${(item.acumulado * 100).toFixed(1).replace('.', ',')}%</span>
          <span class="acumulado-barra"><span style="width:${item.acumulado * 100}%"></span></span>
        </div>
      </td>
      <td><span class="curva-tag ${classeChip[item.classe]}">Curva ${item.classe}</span></td>
    </tr>
  `).join('');
}

// --- Abas da tela (produtos do cardápio × insumos) ---
document.querySelectorAll('#curva-tabs-bar .tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#curva-tabs-bar .tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const insumos = btn.dataset.tab === 'insumos';
    document.getElementById('curva-aba-cardapio').style.display = insumos ? 'none' : '';
    document.getElementById('curva-aba-insumos').style.display = insumos ? '' : 'none';
    if (insumos) carregarCurvaAbcInsumos();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });
});

document.querySelectorAll('#curva-insumos-periodo .curva-periodo-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#curva-insumos-periodo .curva-periodo-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    curvaInsumosDias = parseInt(btn.dataset.dias, 10);
    carregarCurvaAbcInsumos();
  });
});


// --- Cozinha no período (dentro do relatório de Vendas Diárias) ---
async function carregarPreparoDoInsight(inicio, fim) {
  const painel = document.getElementById('panel-preparo');
  if (!painel) return;
  try {
    const resposta = await fetch(`/api/preparo?inicio=${inicio}&fim=${fim}`);
    if (!resposta.ok) throw new Error(`servidor respondeu ${resposta.status}`);
    renderPreparoDoInsight(await resposta.json());
  } catch (erro) {
    console.error('Falha ao carregar tempo de preparo:', erro);
    document.getElementById('insight-preparo-lojas-body').innerHTML =
      `<tr><td colspan="3" class="panel-subtitle">Não foi possível carregar o tempo de preparo.</td></tr>`;
  }
}

function renderPreparoDoInsight(dados) {
  const geral = dados.geral;
  if (!geral) return;

  document.getElementById('insight-preparo-tempo').textContent = _formatarMinutos(geral.tempoMedioMinutos);
  document.getElementById('insight-preparo-pedidos').textContent = (geral.totalPedidos || 0).toLocaleString('pt-BR');

  const pico = document.getElementById('insight-preparo-pico');
  const picoSub = document.getElementById('insight-preparo-pico-sub');
  if (geral.horarioPico) {
    pico.textContent = `${String(geral.horarioPico.hora).padStart(2, '0')}h`;
    picoSub.textContent = `${geral.horarioPico.totalPedidos} pedidos nesse horário`;
  } else {
    pico.textContent = '—';
    picoSub.textContent = '';
  }

  const corpo = document.getElementById('insight-preparo-lojas-body');
  const lojas = geral.porLoja || [];
  corpo.innerHTML = lojas.length
    ? lojas.map((l) => `
      <tr>
        <td class="font-bold">${escaparHtml(l.loja)}</td>
        <td>${l.totalPedidos}</td>
        <td>${_formatarMinutos(l.tempoMedioMinutos)}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" class="panel-subtitle">Nenhum pedido com tempo medido nesse período.</td></tr>`;
}
