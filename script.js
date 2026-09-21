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

  // 1.1 USUÁRIO LOGADO (nome/iniciais na sidebar de todas as telas do painel).
  // A promessa fica guardada pra quem precisa do nome antes de agir (os
  // atalhos da Home que abrem um formulário já preenchido).
  window.usuarioPronto = carregarUsuarioLogado();

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

  // 4.06 STATUS DE SINCRONIZAÇÃO (Home): um ponto no botão Sincronizar
  if (document.getElementById('home-sync-indicador')) {
    carregarStatusSincronizacaoHome();
  }

  // 4.07 GESTÃO OPERACIONAL (Home): estoque crítico, Curva A e custos em alta
  if (document.getElementById('home-curva-a')) {
    carregarGestaoHome();
    document.getElementById('home-insight-proximo')?.addEventListener('click', _proximoInsightHome);
  }

  // 4.08 ATUALIZAÇÃO AUTOMÁTICA DA HOME (quase em tempo real)
  if (document.getElementById('container-periodo')) {
    marcarAtualizadoAgora('home-atualizado-em');
    iniciarAtualizacaoAutomatica(() => {
      carregarDadosLojas();
      carregarGraficoRede();
      carregarCanalRedeHome();
      carregarStatusSincronizacaoHome();
      carregarGestaoHome();
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
    // Atalho "Nova ficha técnica" da Home.
    if (new URLSearchParams(location.search).get('acao') === 'novo-item') abrirModalNovoItemCardapio();
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
    document.getElementById('estoque-filtro-categoria')?.addEventListener('change', () => renderEstoqueTab());
    document.getElementById('estoque-filtro-fornecedor')?.addEventListener('change', () => renderEstoqueTab());

    // Cartões de nível viram filtro da tabela: clicar de novo, ou em Itens
    // cadastrados, mostra todos. Filtrar rola até a tabela, que fica abaixo
    // dos lotes e das datas especiais.
    document.querySelectorAll('#estoque-cards [data-filtro-status]').forEach((card) => {
      const alternarFiltro = () => {
        const status = card.dataset.filtroStatus || null;
        estoqueFiltroStatus = status && estoqueFiltroStatus !== status ? status : null;
        renderEstoqueTab();
        if (estoqueFiltroStatus) {
          const semAnimacao = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          document.getElementById('estoque-tabela-card')?.scrollIntoView({ behavior: semAnimacao ? 'auto' : 'smooth', block: 'start' });
        }
      };
      card.addEventListener('click', alternarFiltro);
      card.addEventListener('keydown', (evento) => {
        if (evento.key === 'Enter' || evento.key === ' ') {
          evento.preventDefault();
          alternarFiltro();
        }
      });
    });
    document.getElementById('estoque-tabela-subtitulo')?.addEventListener('click', (evento) => {
      if (!evento.target.closest('[data-acao="limpar-filtro-status"]')) return;
      estoqueFiltroStatus = null;
      renderEstoqueTab();
    });

    // Lotes vencendo e Datas especiais dividem um bloco, em abas (18/09).
    const abasAlertas = [...document.querySelectorAll('.estoque-aba')];
    abasAlertas.forEach((aba) => {
      aba.addEventListener('click', () => _mostrarAbaAlertasEstoque(aba.id));
      aba.addEventListener('keydown', (evento) => {
        if (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft') return;
        const visiveis = abasAlertas.filter((a) => !a.hidden);
        const proxima = visiveis[(visiveis.indexOf(aba) + (evento.key === 'ArrowRight' ? 1 : -1) + visiveis.length) % visiveis.length];
        _mostrarAbaAlertasEstoque(proxima.id);
        proxima.focus();
      });
    });

    // Link do cartão de estoque crítico da Home: ?loja=...&nivel=critico
    // abre a loja com a tabela já filtrada e rola até ela.
    const parametros = new URLSearchParams(location.search);
    const lojaPedida = parametros.get('loja');
    const nivelPedido = parametros.get('nivel');
    if (lojaPedida) {
      menu.querySelector(`.loja-select-item[data-tab="${CSS.escape(lojaPedida)}"]`)?.click();
    }
    if (ROTULO_FILTRO_ESTOQUE[nivelPedido]) estoqueFiltroStatus = nivelPedido;

    carregarInsumos().then(() => {
      if (ROTULO_FILTRO_ESTOQUE[nivelPedido]) document.getElementById('estoque-tabela-card')?.scrollIntoView({ block: 'start' });
    });
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

  // 4.097b2 TELA DE MAIS VENDIDOS (Insights — ranking do dia, uma comanda
  // por loja, e a fila de vendas não reconhecidas logo abaixo)
  if (document.getElementById('mv-ranking-lista')) {
    iniciarMaisVendidos();
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
      btn.addEventListener('click', () => _mostrarAbaCotacoes(btn.dataset.tab));
    });

    document.querySelectorAll('#economia-periodo button').forEach((botao) => {
      botao.addEventListener('click', () => {
        periodoEconomiaCotacoes = botao.dataset.periodo;
        document.querySelectorAll('#economia-periodo button').forEach((b) => {
          b.classList.toggle('active', b === botao);
          b.setAttribute('aria-pressed', b === botao ? 'true' : 'false');
        });
        _renderEconomiaCotacoes();
      });
    });

    // Card "Cotações abertas": mostra na tabela todas as abertas, de qualquer data.
    document.getElementById('cotacoes-kpi-abertas-card')?.addEventListener('click', () => {
      document.getElementById('cotacoes-filtro-mostrar').value = 'aberta';
      document.getElementById('cotacoes-filtro-dias').value = '';
      renderCotacoesLista();
      const semAnimacao = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.querySelector('.cotacoes-tabela-card')?.scrollIntoView({ behavior: semAnimacao ? 'auto' : 'smooth', block: 'start' });
    });

    // O gráfico pega as cores do tema na hora de desenhar: redesenha ao trocar.
    document.getElementById('theme-toggle-checkbox')?.addEventListener('change', () => _renderEconomiaCotacoes());
  }

  // 4.0995 TELA DE CONTAGENS (admin)
  if (document.getElementById('contagens-tabela-body')) {
    carregarContagens();
    carregarRequisicoes();
  }

  // 4.0997 TELA DE PEDIDOS (admin)
  if (document.getElementById('pedidos-tabela-body')) {
    carregarPedidos();
    // Atalho "Lançar nota de compra" da Home: espera o nome de quem está
    // logado, que o formulário já traz preenchido como comprador.
    if (new URLSearchParams(location.search).get('acao') === 'compra-fora') {
      window.usuarioPronto.finally(() => abrirCompraFora());
    }
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
// Cores dos gráficos (paleta de 2026-09-15, igual às --grafico-* do theme.css):
// cinco cores bem diferentes entre si, sem vermelho nem verde (que são de
// queda e alta). Canal de venda tem cor fixa, a mesma em toda tela.
const CORES_GRAFICO = ['#2563EB', '#F59E0B', '#8B5CF6', '#14B8A6', '#EC4899'];
const COR_GRAFICO_OUTROS = '#A1A1AA';
const CORES_CANAL = CORES_GRAFICO;
function corDoCanal(canal, i) {
  const nome = String(canal || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (nome.includes('ifood')) return '#EC4899';
  if (nome.includes('99')) return '#F59E0B';
  if (nome.includes('cardapio') || nome.includes('catalog') || nome.includes('web')) return '#2563EB';
  if (nome.includes('presencial') || nome.includes('portal') || nome.includes('balcao')) return '#14B8A6';
  if (nome.includes('totem')) return '#8B5CF6';
  return i === undefined ? COR_GRAFICO_OUTROS : CORES_GRAFICO[i % CORES_GRAFICO.length];
}

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

  const podeEditar = !!(contextoEdicao && _possoGerir());
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
          <span class="canal-dot" style="background-color: ${corDoCanal(c.canal, i)};"></span>
          ${c.canal}
          ${c.ajustado ? '<span class="badge-canal-ajustado" title="Valor ajustado manualmente">ajustado</span>' : ''}
        </span>
      </td>
      <td class="font-bold">R$ ${c.faturamento}</td>
      <td>R$ ${c.ticket}</td>
      <td>${c.pedidos}</td>
      <td>${c.percentual}%</td>
      ${podeEditar ? `
        <td class="col-acoes"><div class="acoes-linha">
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
        </div></td>
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
          backgroundColor: canais.map((c, i) => corDoCanal(c.canal, i)),
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
      canalTableBody.innerHTML = `<tr><td colspan="5" style="color: var(--danger-texto);">Não foi possível carregar os dados. Confira se o Flask está rodando e se a sincronização já rodou pelo menos uma vez (python sincronizar.py).</td></tr>`;
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
          backgroundColor: CORES_GRAFICO[0],
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
// Filtro da tabela pelos cartões de nível (2026-09-17): null mostra todos.
let estoqueFiltroStatus = null;
const ROTULO_FILTRO_ESTOQUE = { ok: 'em nível ideal', baixo: 'com estoque baixo', critico: 'em nível crítico' };
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
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="color:var(--danger-texto);">Não foi possível carregar o estoque. Confira se o Flask está rodando.</td></tr>`;
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
// Mistura feita na casa (tem receita) não é contada — só os insumos
// comprados são (pedido da Julia, 2026-09-15). A venda já desconta os
// ingredientes dela, então o saldo da mistura não diz nada: fica fora da
// tabela, dos cards e do valor em estoque. A receita continua em
// Cardápio → Misturas.
// --- COLUNA DE FORNECEDORES NA TABELA DE INSUMOS ---
// Quem vende cada insumo estava só dentro do cadastro, um por um: pra decidir
// compra e cotação, a Julia precisa ver isso na lista (pedido dela, 17/09).
// null = ainda não buscou; false = não dá pra buscar (operação não vê
// fornecedor), e aí a coluna não aparece.
let fornecedoresPorId = null;
let carregandoFornecedores = false;

async function _carregarNomesDeFornecedor() {
  try {
    const resposta = await fetch('/api/fornecedores');
    if (!resposta.ok) {
      fornecedoresPorId = false;
      return false;
    }
    const lista = (await resposta.json()).fornecedores || [];
    fornecedoresPorId = new Map(lista.map((f) => [f.id, f]));
  } catch (erro) {
    console.error('Falha ao carregar fornecedores pra tabela de Insumos:', erro);
    fornecedoresPorId = false;
  }
  return fornecedoresPorId;
}

// Homologado primeiro, depois o resto em ordem alfabética. Entram os do
// cadastro do insumo e também quem só aparece no histórico (cotou ou vendeu),
// que é o que a VMarket mostrava.
// No Açaí a compra é com o homologado (pedido dela, 2026-09-21): na aba da
// loja a coluna mostra só ele, sem quem apenas cotou ou vendeu.
const LOJAS_SO_HOMOLOGADO = ['Açaí Na Lata'];

function _fornecedoresDoInsumo(insumo) {
  if (!fornecedoresPorId) return [];
  // Por loja desde 2026-09-21: na aba de uma loja, os que cotam e o
  // homologado DELA; na Visão geral, os de todas as lojas.
  const naLoja = LOJAS_ESTOQUE.includes(estoqueTabAtual) ? insumo.porLoja?.[estoqueTabAtual] : null;
  const homologadosIds = new Set(naLoja
    ? [naLoja.fornecedorHomologadoId].filter(Boolean)
    : Object.values(insumo.porLoja || {}).map((p) => p.fornecedorHomologadoId).filter(Boolean));
  const doCadastro = new Set([...(naLoja ? (naLoja.fornecedorIds || []) : (insumo.fornecedorIds || [])), ...homologadosIds]);
  const todos = [...doCadastro, ...(insumo.fornecedoresDoHistorico || []).filter((id) => !doCadastro.has(id))];
  const nomes = todos
    .map((id) => ({ id, nome: fornecedoresPorId.get(id)?.nome, soHistorico: !doCadastro.has(id) }))
    .filter((f) => f.nome);
  const homologado = nomes.filter((f) => homologadosIds.has(f.id));
  const resto = nomes.filter((f) => !homologadosIds.has(f.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const lista = [...homologado, ...resto].map((f) => ({ ...f, homologado: homologadosIds.has(f.id) }));
  return LOJAS_SO_HOMOLOGADO.includes(estoqueTabAtual) ? lista.filter((f) => f.homologado) : lista;
}

// Bolinha com as iniciais e cor do fornecedor, igual à da grid de Cotações
// (print da VMarket que a Julia mandou em 04/09) — mesmos _iniciaisFornecedor
// e _corAvatarFornecedor, pra não existirem duas bolinhas diferentes no
// sistema.
// Insumo muito cotado chega a 22 fornecedores (Ketchup Cepera), e a linha da
// tabela esticava pra 8 fileiras de bolinha. Mostra as 12 primeiras e junta o
// resto num "+N" que lista os nomes no hover.
const MAXIMO_BOLINHAS_FORNECEDOR = 12;

function _celulaFornecedoresHTML(insumo) {
  const lista = _fornecedoresDoInsumo(insumo);
  const visiveis = lista.slice(0, MAXIMO_BOLINHAS_FORNECEDOR);
  const escondidos = lista.slice(MAXIMO_BOLINHAS_FORNECEDOR);
  const bolinhas = visiveis.map((f) => {
    const detalhe = f.homologado
      ? ' — homologado, vai direto em pedido'
      : (f.soHistorico ? ' — já cotou ou vendeu esse insumo' : '');
    return `
    <span class="avatar avatar-sm fornecedor-avatar${f.homologado ? ' homologado' : ''}"
          style="background-color: ${_corAvatarFornecedor(f.id)};"
          title="${escaparHtml(f.nome)}${detalhe}">
      ${escaparHtml(_iniciaisFornecedor(f.nome))}
    </span>
  `;
  }).join('');
  const resto = escondidos.length
    ? `<button type="button" class="avatar avatar-sm fornecedor-avatar resto" data-acao="ver-fornecedores"
        data-insumo-id="${insumo.id}" title="Ver os ${lista.length} fornecedores">+${escondidos.length}</button>`
    : '';
  // O "+" abre o cadastro do insumo, que é onde os fornecedores são marcados.
  const adicionar = `<button type="button" class="avatar avatar-sm fornecedor-avatar adicionar"
    data-acao="editar-insumo" data-insumo-id="${insumo.id}"
    title="Ligar outro fornecedor a esse insumo">+</button>`;
  return `<td class="col-fornecedores">${bolinhas}${resto}${adicionar}</td>`;
}

// Lista inteira de quem fornece o insumo — o "+N" da coluna abre isso, que é
// o que não cabe em bolinha (pedido dela, 17/09).
let fornecedoresInsumoAtual = null;

function abrirModalFornecedoresInsumo(insumoId) {
  const insumo = estoqueInsumos.find((i) => i.id === insumoId);
  if (!insumo) return;
  fornecedoresInsumoAtual = insumo;
  const lista = _fornecedoresDoInsumo(insumo);

  document.getElementById('fornecedores-insumo-subtitulo').textContent =
    `${insumo.nome} — ${lista.length} ${lista.length === 1 ? 'fornecedor' : 'fornecedores'}`;
  document.getElementById('fornecedores-insumo-lista').innerHTML = lista.map((f) => {
    const marca = f.homologado
      ? '<span class="badge-pill pos">homologado</span>'
      : (f.soHistorico ? '<span class="badge-pill">já cotou ou vendeu</span>' : '');
    const telefone = fornecedoresPorId.get(f.id)?.contatoTelefone;
    return `
      <li>
        <span class="avatar avatar-sm fornecedor-avatar${f.homologado ? ' homologado' : ''}"
              style="background-color: ${_corAvatarFornecedor(f.id)};">${escaparHtml(_iniciaisFornecedor(f.nome))}</span>
        <span class="lista-fornecedores-nome">${escaparHtml(f.nome)}</span>
        ${telefone ? `<span class="text-muted">${escaparHtml(telefone)}</span>` : ''}
        ${marca}
      </li>
    `;
  }).join('');
  document.getElementById('modal-fornecedores-insumo').style.display = 'flex';
}

function fecharModalFornecedoresInsumo() {
  document.getElementById('modal-fornecedores-insumo').style.display = 'none';
  fornecedoresInsumoAtual = null;
}

document.getElementById('btn-fornecedores-insumo-fechar')?.addEventListener('click', fecharModalFornecedoresInsumo);
document.getElementById('btn-fornecedores-insumo-ok')?.addEventListener('click', fecharModalFornecedoresInsumo);
document.getElementById('btn-fornecedores-insumo-cadastro')?.addEventListener('click', () => {
  const insumo = fornecedoresInsumoAtual;
  fecharModalFornecedoresInsumo();
  if (insumo) abrirModalNovoInsumo(insumo);
});

function _linhasEstoqueParaTab(tab) {
  const insumosContados = estoqueInsumos.filter((insumo) => !insumo.ehMistura);
  if (tab === 'geral') {
    return insumosContados
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

  return insumosContados
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

// Card "Valor em estoque" (pedido do chefe da Julia, 2026-09-15): quantidade
// atual × custo de cada insumo, com o mesmo custo que o CMV usa (ver
// custo_em_uso_por_insumo). Só admin, que é quem recebe custo da API.
// Estoque negativo (a baixa automática passou do contado) conta como zero,
// e na Visão Geral a soma é loja por loja, pra um negativo numa loja não
// descontar o estoque de outra. Segue a busca, igual aos outros cards.
function _renderValorEmEstoque(linhas, isAdmin) {
  const card = document.getElementById('estoque-card-valor');
  if (!card) return;
  card.style.display = isAdmin ? '' : 'none';
  document.getElementById('estoque-cards').classList.toggle('estoque-cards--com-valor', isAdmin);
  if (!isAdmin) return;

  let valor = 0;
  let semCusto = 0;
  linhas.forEach(({ insumo, loja }) => {
    const lojas = loja ? [loja] : LOJAS_ESTOQUE.filter((l) => insumo.porLoja[l]?.aplica);
    const quantidade = lojas.reduce((soma, l) => soma + Math.max(0, Number(insumo.porLoja[l]?.quantidadeAtual) || 0), 0);
    if (quantidade <= 0) return;
    const custo = insumo.custoEmUso?.valor;
    if (custo === null || custo === undefined) {
      semCusto += 1;
      return;
    }
    valor += quantidade * custo;
  });

  document.getElementById('estoque-val-valor').textContent = _formatarMoedaBRL(valor);
  const nota = document.getElementById('estoque-valor-nota');
  nota.textContent = semCusto === 1 ? '1 item sem custo ficou de fora' : `${semCusto} itens sem custo ficaram de fora`;
  nota.style.display = semCusto ? '' : 'none';
}

// Categoria com cor própria (redesenho de Insumos, 18/09): a cor sai do nome,
// então "Embalagens" tem a mesma cor em qualquer loja e em qualquer filtro.
const TOTAL_CORES_CATEGORIA = 10;

function _corDaCategoria(nome) {
  let soma = 0;
  for (const letra of String(nome || 'Geral')) soma = (soma * 31 + letra.codePointAt(0)) % 9973;
  return soma % TOTAL_CORES_CATEGORIA;
}

// Filtro por categoria (card #31 do ClickUp, 2026-09-17): as opções são as
// categorias da aba aberta, com quantos insumos cada uma tem. Trocar de aba
// mantém a categoria se ela existir lá. Devolve a categoria escolhida.
function _atualizarOpcoesCategoriaEstoque(linhas) {
  const select = document.getElementById('estoque-filtro-categoria');
  if (!select) return '';
  const escolhida = select.value;
  const contagem = new Map();
  linhas.forEach((l) => {
    const categoria = l.insumo.categoria || 'Geral';
    contagem.set(categoria, (contagem.get(categoria) || 0) + 1);
  });
  const categorias = [...contagem.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  select.innerHTML = '<option value="">Todas as categorias</option>'
    + categorias.map((c) => `<option value="${escaparHtml(c)}">${escaparHtml(c)} (${contagem.get(c)})</option>`).join('');
  select.value = contagem.has(escolhida) ? escolhida : '';
  return select.value;
}

// Card #41: insumo que ninguém cota, nem pelo cadastro nem pelo histórico — a
// coluna Fornecedores vazia. É o que o link de cotação manda pra todos os
// fornecedores; com o filtro dá pra ir um a um ligando quem fornece. O número
// é da loja e categoria da tela. Só aparece junto com a coluna (admin e
// gerente, depois que a lista de fornecedores chegou).
function _atualizarOpcoesFornecedorEstoque(linhas, disponivel) {
  const select = document.getElementById('estoque-filtro-fornecedor');
  if (!select) return '';
  document.getElementById('estoque-filtro-fornecedor-wrapper').style.display = disponivel ? '' : 'none';
  if (!disponivel) return '';
  const escolhido = select.value;
  const semFornecedor = linhas.filter((l) => _fornecedoresDoInsumo(l.insumo).length === 0).length;
  select.innerHTML = '<option value="">Todos os fornecedores</option>'
    + `<option value="sem">${LOJAS_SO_HOMOLOGADO.includes(estoqueTabAtual) ? 'Sem homologado' : 'Sem fornecedor'} (${semFornecedor})</option>`;
  select.value = escolhido === 'sem' ? 'sem' : '';
  return select.value;
}

function renderEstoqueTab() {
  const isAdmin = _possoGerir();
  const tbody = document.getElementById('estoque-tabela-body');
  if (!tbody) return;

  const thAcoes = document.getElementById('estoque-th-acoes');
  const subtitulo = document.getElementById('estoque-tabela-subtitulo');
  const acoesTopo = document.getElementById('estoque-acoes-admin');
  const ehGeral = estoqueTabAtual === 'geral';

  if (thAcoes) thAcoes.style.display = isAdmin ? '' : 'none';
  // A lista de fornecedores vem numa chamada só, na primeira vez que a tabela
  // monta; quando chega, a tabela redesenha com a coluna.
  if (isAdmin && fornecedoresPorId === null && !carregandoFornecedores) {
    carregandoFornecedores = true;
    _carregarNomesDeFornecedor().then((mapa) => {
      carregandoFornecedores = false;
      if (mapa) renderEstoqueTab();
    });
  }
  const mostrarFornecedores = isAdmin && !!fornecedoresPorId;
  const thFornecedores = document.getElementById('estoque-th-fornecedores');
  if (thFornecedores) thFornecedores.style.display = mostrarFornecedores ? '' : 'none';
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

  // Categoria e busca valem pros cards e pra tabela; o filtro de nível, só pra tabela.
  const categoria = _atualizarOpcoesCategoriaEstoque(linhas);
  if (categoria) {
    linhas = linhas.filter((l) => (l.insumo.categoria || 'Geral') === categoria);
  }
  const soSemFornecedor = _atualizarOpcoesFornecedorEstoque(linhas, mostrarFornecedores) === 'sem';
  if (soSemFornecedor) {
    linhas = linhas.filter((l) => _fornecedoresDoInsumo(l.insumo).length === 0);
  }

  const termoBusca = (document.getElementById('estoque-busca')?.value || '').trim().toLowerCase();
  if (termoBusca) {
    linhas = linhas.filter((l) => l.insumo.nome.toLowerCase().includes(termoBusca)
      || _fornecedoresDoInsumo(l.insumo).some((f) => f.nome.toLowerCase().includes(termoBusca)));
  }

  const contagem = { ok: 0, baixo: 0, critico: 0 };
  linhas.forEach(l => { contagem[l.dados.status] = (contagem[l.dados.status] || 0) + 1; });
  document.getElementById('estoque-val-cadastrados').textContent = linhas.length;
  document.getElementById('estoque-val-ok').textContent = contagem.ok;
  document.getElementById('estoque-val-baixo').textContent = contagem.baixo;
  document.getElementById('estoque-val-critico').textContent = contagem.critico;
  document.querySelector('#estoque-cards .store-card--critico')?.classList.toggle('tem-alerta', contagem.critico > 0);
  _renderValorEmEstoque(linhas, isAdmin);

  const totalSaude = linhas.length || 1;
  const pctOk = Math.round((contagem.ok / totalSaude) * 100);
  document.getElementById('estoque-saude-seg-ok').style.width = `${(contagem.ok / totalSaude) * 100}%`;
  document.getElementById('estoque-saude-seg-baixo').style.width = `${(contagem.baixo / totalSaude) * 100}%`;
  document.getElementById('estoque-saude-seg-critico').style.width = `${(contagem.critico / totalSaude) * 100}%`;
  document.getElementById('estoque-saude-pct-ideal').textContent = `${pctOk}% em nível ideal`;

  // Os cartões contam tudo; o filtro de nível só vale pra tabela.
  const rotuloFiltro = ROTULO_FILTRO_ESTOQUE[estoqueFiltroStatus];
  document.querySelectorAll('#estoque-cards [data-filtro-status]').forEach((card) => {
    const ativo = !!rotuloFiltro && card.dataset.filtroStatus === estoqueFiltroStatus;
    card.classList.toggle('filtro-ativo', ativo);
    if (card.dataset.filtroStatus) card.setAttribute('aria-pressed', String(ativo));
  });
  if (rotuloFiltro) {
    linhas = linhas.filter((l) => l.dados.status === estoqueFiltroStatus);
    if (subtitulo) {
      subtitulo.insertAdjacentHTML('beforeend', ` · só ${rotuloFiltro} <button type="button" class="btn-limpar-filtro" data-acao="limpar-filtro-status">mostrar todos</button>`);
    }
  }

  if (!linhas.length) {
    const colspan = 6 + (isAdmin ? 1 : 0);
    const vazio = rotuloFiltro ? `Nenhum insumo ${rotuloFiltro} aqui.`
      : (soSemFornecedor ? 'Todo insumo aqui já tem fornecedor.' : 'Nenhum insumo encontrado.');
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="panel-subtitle">${vazio}</td></tr>`;
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
        <td><span class="badge tag-categoria" data-cor="${_corDaCategoria(insumo.categoria)}">${escaparHtml(insumo.categoria)}</span></td>
        <td class="font-bold col-atual-destaque${dados.quantidadeAtual < 0 ? ' estoque-negativo' : ''}"${dados.quantidadeAtual < 0 ? ' title="Saiu mais do que entrou: confira a contagem ou a ficha técnica"' : ''}>${_formatarQuantidade(dados.quantidadeAtual, insumo.unidadeMedida)}</td>
        <td class="text-muted" ${dados.consumoMedio === null ? 'title="Sem dado suficiente — depende da Ficha Técnica do prato estar cadastrada e ter vendas registradas"' : ''}>
          ${dados.consumoMedio === null ? '—' : `${_formatarQuantidade(Math.round(dados.consumoMedio * 100) / 100, insumo.unidadeMedida)}/dia`}
        </td>
        <td class="col-nivel" ${quantidadeIdeal === null ? 'title="Sem estoque mínimo cadastrado pra esse insumo/loja"' : ''}>
          ${quantidadeIdeal === null ? '<span class="text-muted">—</span>' : `
            <div class="nivel-cell">
              <div class="nivel-gauge" title="Estoque atual em relação ao mínimo — o traço marca o limite mínimo">
                <div class="progress-container">
                  <div class="progress-bar ${STATUS_CLASSE_BARRA_ESTOQUE[dados.status]}" style="width: ${percentual}%;"></div>
                </div>
                <span class="nivel-gauge-tick"></span>
              </div>
              <span class="nivel-legenda">
                mín. ${_formatarQuantidade(dados.estoqueMinimo, insumo.unidadeMedida)} · ideal <strong>${_formatarQuantidade(quantidadeIdeal, insumo.unidadeMedida)}</strong>
                ${dados.quantidadeIdealAjustada ? '<span class="badge-pill neu-orange" title="Ajustado manualmente">ajustado</span>' : ''}
              </span>
              ${sugestaoCompra > 0 ? `<span class="nivel-comprar" title="Diferença entre a quantidade ideal e o estoque atual">Comprar ${_formatarQuantidade(sugestaoCompra, insumo.unidadeMedida)}</span>` : ''}
              ${tendencia ? `<span class="tendencia-texto" title="Consumo médio dos últimos 14 dias comparado com a média de 30 dias — não muda o cálculo de déficit, é só um alerta">${tendencia.subindo ? '↑' : '↓'} tendência: ${_formatarQuantidade(tendencia.valor, insumo.unidadeMedida)} (${tendencia.subindo ? '+' : ''}${tendencia.desvioPercentual}%)</span>` : ''}
            </div>
          `}
        </td>
        ${mostrarFornecedores ? _celulaFornecedoresHTML(insumo) : ''}
        <td><span class="badge-pill ${STATUS_CLASSE_BADGE_ESTOQUE[dados.status]}"><i data-lucide="${STATUS_ICONE_ESTOQUE[dados.status]}"></i>${STATUS_LABEL_ESTOQUE[dados.status]}</span></td>
        ${isAdmin ? `
          <td class="col-acoes"><div class="acoes-linha">
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
          </div></td>
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

// --- Vendas não reconhecidas (Etapa 0 do motor de compra) ---
// Era o painel "Integrações do Estoque": saiu do Estoque pra Configurações
// em 2026-09-11 e de lá pra Insights → Mais Vendidos em 2026-09-14 (pedido
// da Julia), junto do ranking do dia. Em Configurações ficou só o liga/
// desliga da baixa automática. A loja da fila é escolhida no próprio painel.
async function carregarIntegracoesEstoque() {
  const loja = integracoesLojaAtual;
  try {
    const [respPendentes, respVinculos] = await Promise.all([
      fetch(`/api/produtos-pendentes?unidade=${encodeURIComponent(loja)}`),
      fetch('/api/vinculos-manuais'),
    ]);
    const dadosPendentes = await respPendentes.json();
    const dadosVinculos = await respVinculos.json();
    renderProdutosPendentesTabela(dadosPendentes.pendentes || []);
    renderVinculosManuaisTabela(dadosVinculos.vinculos || []);
  } catch (erro) {
    console.error('Falha ao carregar as vendas não reconhecidas:', erro);
  }
}

// Liga/desliga da baixa automática (api_definir_baixa_automatica), as quatro
// lojas numa lista em Configurações. Ligada, cada venda desconta a ficha
// técnica do estoque; desligada, nada desconta. Liga só de hoje em diante,
// e o padrão é amanhã: dá tempo de contar o estoque antes do primeiro pedido.
function _dataIsoLocal(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

async function carregarBaixaAutomatica() {
  try {
    const resposta = await fetch('/api/estoque/baixa-automatica');
    const dados = await resposta.json();
    renderBaixaAutomatica(dados.lojas || {});
  } catch (erro) {
    console.error('Falha ao carregar a baixa automática:', erro);
  }
}

function renderBaixaAutomatica(inicios) {
  const lista = document.getElementById('baixa-automatica-lojas');
  if (!lista) return;
  const hoje = new Date();
  const hojeIso = _dataIsoLocal(hoje);
  const amanhaIso = _dataIsoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1));
  const dataCurta = (iso) => iso.split('-').reverse().slice(0, 2).join('/');

  lista.innerHTML = LOJAS_ESTOQUE.map((loja) => {
    const inicio = inicios[loja] || null;
    const lojaAttr = escaparHtml(loja);
    let estado;
    let controles;
    if (inicio && inicio > hojeIso) {
      estado = `<span class="badge-pill neu-orange">Liga em ${dataCurta(inicio)}</span>`;
      controles = `<button type="button" class="btn-secondary-sm" data-baixa-desligar="${lojaAttr}">Cancelar</button>`;
    } else if (inicio) {
      estado = `<span class="badge-pill pos">Ligada desde ${dataCurta(inicio)}</span>`;
      controles = `<button type="button" class="btn-secondary-sm" data-baixa-desligar="${lojaAttr}">Desligar</button>`;
    } else {
      estado = `<span class="badge-pill badge-neutral">Desligada</span>`;
      controles = `
        <label class="baixa-automatica-ligar">
          Ligar a partir de
          <input type="date" min="${hojeIso}" value="${amanhaIso}" data-baixa-inicio="${lojaAttr}">
        </label>
        <button type="button" class="btn-primary-sm" data-baixa-ligar="${lojaAttr}">Ligar</button>`;
    }
    return `
      <div class="baixa-loja">
        <span class="baixa-loja-nome">${lojaAttr}</span>
        ${estado}
        <div class="baixa-loja-controles">${controles}</div>
      </div>`;
  }).join('');

  lista.querySelectorAll('[data-baixa-ligar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const loja = btn.dataset.baixaLigar;
      const data = [...lista.querySelectorAll('[data-baixa-inicio]')].find((i) => i.dataset.baixaInicio === loja)?.value;
      if (!data) return;
      if (!confirm(`Ligar a baixa automática de ${loja} a partir de ${dataCurta(data)}? As vendas desse dia em diante vão descontar a ficha técnica do estoque. Conte o estoque antes do primeiro pedido desse dia.`)) return;
      _salvarBaixaAutomatica(loja, data);
    });
  });
  lista.querySelectorAll('[data-baixa-desligar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const loja = btn.dataset.baixaDesligar;
      if (!confirm(`Desligar a baixa automática de ${loja}? O que já foi descontado continua descontado; as próximas vendas não descontam mais.`)) return;
      _salvarBaixaAutomatica(loja, null);
    });
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
    carregarBaixaAutomatica();
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
      <td class="col-acoes"><div class="acoes-linha">
        <button type="button" class="btn-secondary-sm" data-acao="vincular-produto" data-nome="${escaparHtml(p.nome_produto)}">Vincular</button>
      </div></td>
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
    if (maisVendidosDados) carregarMaisVendidos(maisVendidosDados.dia);
  } catch (erro) {
    console.error('Falha ao vincular produto:', erro);
    alert(erro.message || 'Não foi possível vincular esse produto.');
  }
});

// --- Mais Vendidos (Insights) ---
// Ranking de produtos de um dia por loja (api_mais_vendidos_do_dia), no
// layout que a Julia mandou de referência em 2026-09-14: abas de loja,
// cartões do dia, top produtos, receita por categoria, comparativo entre
// lojas e ranking detalhado. A aba de loja vale pra tela inteira. As setas
// andam entre dias que tiveram venda, então a segunda (lojas fechadas) é
// pulada sozinha. Tudo é comparado com o mesmo dia da semana anterior.
// Produto que o estoque não reconhece vem marcado; pra admin, a marca abre
// o vincular.
let maisVendidosDados = null;
let mvLojaFiltro = 'todas';
let mvBusca = '';
let mvOrdem = 'quantidade';
const MV_RANKING_PASSO = 15;
let mvRankingLimite = MV_RANKING_PASSO;
const MV_TOP_PRODUTOS = 8;
const DIAS_DA_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
// A cor de cada loja (em mais-vendidos.css) é a mesma em todos os gráficos.
const MV_LOJAS = {
  'Hamburgueria Artesanos': { classe: 'loja-artesanos', curto: 'Artesanos' },
  'Açaí Na Lata': { classe: 'loja-acai', curto: 'Açaí Na Lata' },
  'Tradiça ZN': { classe: 'loja-zn', curto: 'Tradiça ZN' },
  'Tradiça Simus': { classe: 'loja-simus', curto: 'Tradiça Simus' },
};
// Tons da cor da loja, em %, pras fatias da rosca de categorias.
function _formatarQuantidadeVendida(valor) {
  return Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function _mvMoeda(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// "R$ 6,9 mil" pros eixos e rótulos curtos dos gráficos.
function _mvMoedaCurta(valor) {
  if (Math.abs(valor) >= 1000) {
    return `R$ ${(valor / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  }
  return `R$ ${Math.round(valor).toLocaleString('pt-BR')}`;
}

function _mvData(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return {
    data: new Date(ano, mes - 1, dia),
    texto: `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`,
  };
}

// "dom. 06/09" — o dia com que tudo na tela é comparado.
function _mvRotuloComparado() {
  const { data, texto } = _mvData(maisVendidosDados.diaComparado);
  return `${DIAS_DA_SEMANA[data.getDay()].slice(0, 3).toLowerCase()}. ${texto}`;
}

function _mvTextoSemVenda() {
  return _mvData(maisVendidosDados.dia).data.getDay() === 1
    ? 'Segunda-feira: as lojas não abrem.'
    : 'Nenhuma venda nesse dia.';
}

function _mvNormalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Categoria como veio do cardápio ("QUERIDINHOS", "Smash - Clássicos"): o
// que vem todo em maiúscula fica só com a primeira letra grande.
function _mvCategoria(nome) {
  if (!nome) return 'Sem categoria';
  const limpo = nome.trim();
  if (limpo !== limpo.toUpperCase()) return limpo;
  const minusculo = limpo.toLocaleLowerCase('pt-BR');
  return minusculo.charAt(0).toLocaleUpperCase('pt-BR') + minusculo.slice(1);
}

// Escala redonda pros eixos (0, 10, 20, 30 em vez de 0, 9, 18, 27).
// `inteiro`: unidade vendida não tem marca de 0,5.
function _mvEscala(maximo, inteiro = false, divisoes = 4) {
  if (!maximo || maximo <= 0) return { topo: 1, passo: 1 };
  const bruto = maximo / divisoes;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  let passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto);
  if (inteiro) passo = Math.max(1, Math.ceil(passo));
  return { topo: passo * Math.ceil(maximo / passo), passo };
}

function _mvMarcas({ topo, passo }) {
  const marcas = [];
  for (let valor = 0; valor <= topo + passo / 1000; valor += passo) marcas.push(valor);
  return marcas;
}

// Variação contra o mesmo dia da semana anterior. null = não tem aquele dia
// pra comparar; Infinity = não tinha vendido nada e agora vendeu.
function _mvVariacao(atual, anterior) {
  if (anterior === null || anterior === undefined) return null;
  if (!anterior) return atual ? Infinity : 0;
  return (atual - anterior) / anterior;
}

function _mvLojasFiltradas() {
  return maisVendidosDados.lojas.filter((l) => mvLojaFiltro === 'todas' || l.loja === mvLojaFiltro);
}

function _mvProdutos(lojas) {
  return lojas.flatMap((l) => l.produtos.map((p) => ({ ...p, loja: l.loja })));
}

function iniciarMaisVendidos() {
  document.getElementById('mv-dia-anterior').addEventListener('click', () => {
    if (maisVendidosDados?.anterior) carregarMaisVendidos(maisVendidosDados.anterior);
  });
  document.getElementById('mv-dia-proximo').addEventListener('click', () => {
    if (maisVendidosDados?.proximo) carregarMaisVendidos(maisVendidosDados.proximo);
  });
  const input = document.getElementById('mv-dia-input');
  input.closest('.dia-rotulo').addEventListener('click', (evento) => {
    evento.preventDefault();
    try {
      input.showPicker();
    } catch (e) {
      input.focus();
    }
  });
  input.addEventListener('change', () => {
    if (input.value) carregarMaisVendidos(input.value);
  });

  document.querySelectorAll('#mv-lojas-tabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => _mvFiltrarLoja(btn.dataset.loja));
  });
  document.getElementById('mv-ranking-loja').addEventListener('change', (evento) => {
    _mvFiltrarLoja(evento.target.value);
  });
  document.getElementById('mv-busca').addEventListener('input', (evento) => {
    mvBusca = evento.target.value;
    mvRankingLimite = MV_RANKING_PASSO;
    _renderMvRanking();
  });
  document.getElementById('mv-ordem').addEventListener('change', (evento) => {
    mvOrdem = evento.target.value;
    _renderMvRanking();
  });
  document.getElementById('mv-ranking-mais').addEventListener('click', () => {
    mvRankingLimite += MV_RANKING_PASSO;
    _renderMvRanking();
  });

  carregarMaisVendidos(null);
  // Hoje a sincronização roda a cada 15 min: olhando o dia de hoje, a tela
  // acompanha sozinha.
  iniciarAtualizacaoAutomatica(() => {
    if (maisVendidosDados && maisVendidosDados.dia === maisVendidosDados.hoje) {
      carregarMaisVendidos(maisVendidosDados.dia);
    }
  });
}

function _mvFiltrarLoja(loja) {
  mvLojaFiltro = loja;
  mvRankingLimite = MV_RANKING_PASSO;
  document.querySelectorAll('#mv-lojas-tabs .tab-btn').forEach((btn) => {
    const ativa = btn.dataset.loja === loja;
    btn.classList.toggle('active', ativa);
    btn.setAttribute('aria-selected', ativa ? 'true' : 'false');
  });
  document.getElementById('mv-ranking-loja').value = loja;
  renderMaisVendidos(true);
}

async function carregarMaisVendidos(dia) {
  const mesmoDia = Boolean(dia && maisVendidosDados && dia === maisVendidosDados.dia);
  try {
    const resposta = await fetch(`/api/vendas/mais-vendidos${dia ? `?dia=${encodeURIComponent(dia)}` : ''}`);
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao carregar');
    if (!mesmoDia) mvRankingLimite = MV_RANKING_PASSO;
    maisVendidosDados = dados;
    renderMaisVendidos(!mesmoDia);
  } catch (erro) {
    console.error('Falha ao carregar os mais vendidos:', erro);
    if (!maisVendidosDados) {
      document.getElementById('mv-ranking-lista').innerHTML =
        '<li class="mv-ranking-vazio">Não deu pra carregar as vendas agora. Recarregue a página em instantes.</li>';
    }
  }
}

function renderMaisVendidos(animar = true) {
  const dados = maisVendidosDados;
  if (!dados || !document.getElementById('mv-ranking-lista')) return;

  const { data, texto } = _mvData(dados.dia);
  const ehHoje = dados.dia === dados.hoje;
  const semana = DIAS_DA_SEMANA[data.getDay()];
  document.getElementById('mv-dia-semana').textContent = ehHoje ? 'Hoje, até agora' : semana;
  document.getElementById('mv-dia-data').textContent = texto;
  document.getElementById('mv-eyebrow-dia').textContent = `${ehHoje ? 'HOJE' : semana.toUpperCase()}, ${texto}`;
  const input = document.getElementById('mv-dia-input');
  input.value = dados.dia;
  input.max = dados.hoje;
  document.getElementById('mv-dia-anterior').disabled = !dados.anterior;
  document.getElementById('mv-dia-proximo').disabled = !dados.proximo;

  document.querySelector('.page-content').classList.toggle('mv-animar', animar);
  const lojas = _mvLojasFiltradas();
  const rotuloComparado = _mvRotuloComparado();
  _renderMvTopProdutos(lojas);
  _renderMvCategorias(lojas);
  _renderMvComparativo(dados.lojas, rotuloComparado);
  _renderMvRanking();
}

// --- Top produtos por volume (barras deitadas) ---
function _renderMvTopProdutos(lojas) {
  const alvo = document.getElementById('mv-top-grafico');
  const todas = mvLojaFiltro === 'todas';
  document.getElementById('mv-top-subtitulo').textContent =
    `${todas ? 'Todas as lojas' : mvLojaFiltro} · unidades vendidas`;
  const top = _mvProdutos(lojas)
    .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, MV_TOP_PRODUTOS);
  if (!top.length) {
    alvo.innerHTML = `<p class="mv-nota">${_mvTextoSemVenda()}</p>`;
    return;
  }

  const escala = _mvEscala(top[0].quantidade, true);
  const marcas = _mvMarcas(escala);
  const pct = (valor) => (valor / escala.topo) * 100;
  alvo.innerHTML = `
    <div class="mv-barras-linhas">
      <div class="mv-barras-grade" aria-hidden="true">${marcas.map((v) => `<span style="left: ${pct(v)}%"></span>`).join('')}</div>
      ${top.map((p, indice) => `
        <div class="mv-barra-linha ${MV_LOJAS[p.loja]?.classe || ''}">
          <span class="mv-barra-rotulo">
            <span class="mv-barra-nome" title="${escaparHtml(p.nome)}">${escaparHtml(p.nome)}</span>
            ${todas ? `<span class="mv-barra-loja">${escaparHtml(MV_LOJAS[p.loja]?.curto || p.loja)}</span>` : ''}
          </span>
          <span class="mv-barra-trilho"><span class="mv-barra" style="width: ${pct(p.quantidade).toFixed(2)}%; animation-delay: ${indice * 40}ms;"></span></span>
          <span class="mv-barra-valor">${_formatarQuantidadeVendida(p.quantidade)}</span>
        </div>`).join('')}
    </div>
    <div class="mv-barras-eixo" aria-hidden="true">${marcas.map((v) => `<span style="left: ${pct(v)}%">${_formatarQuantidadeVendida(v)}</span>`).join('')}</div>
    ${todas ? `
      <div class="mv-legenda-lojas">
        ${Object.values(MV_LOJAS).map((l) => `<span><i class="mv-ponto ${l.classe}"></i>${escaparHtml(l.curto)}</span>`).join('')}
      </div>` : ''}`;
}

// --- Receita por categoria (rosca) ---
function _renderMvCategorias(lojas) {
  const alvo = document.getElementById('mv-categorias-grafico');
  alvo.className = `mv-rosca-area ${mvLojaFiltro === 'todas' ? 'loja-artesanos' : MV_LOJAS[mvLojaFiltro]?.classe || ''}`;
  const produtos = _mvProdutos(lojas);
  const porCategoria = new Map();
  let semPreco = 0;
  produtos.forEach((p) => {
    if (p.receita === null || p.receita === undefined) {
      semPreco += 1;
      return;
    }
    const nome = _mvCategoria(p.categoria);
    porCategoria.set(nome, (porCategoria.get(nome) || 0) + p.receita);
  });
  const ordenadas = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]);
  if (!ordenadas.length) {
    alvo.innerHTML = `<p class="mv-nota">${produtos.length
      ? 'Os produtos vendidos nesse dia não têm preço no Cardápio, então não dá pra estimar a receita.'
      : _mvTextoSemVenda()}</p>`;
    return;
  }

  // Cada categoria numa cor bem diferente (paleta dos gráficos), pra
  // diferença de porcentagem ficar visível; o resto vira "Outras" em cinza.
  const fatias = ordenadas.slice(0, CORES_GRAFICO.length).map(([nome, valor], i) => ({
    nome, valor, cor: CORES_GRAFICO[i],
  }));
  const resto = ordenadas.slice(CORES_GRAFICO.length).reduce((total, [, valor]) => total + valor, 0);
  if (resto > 0) fatias.push({ nome: 'Outras', valor: resto, cor: COR_GRAFICO_OUTROS });
  const total = fatias.reduce((soma, f) => soma + f.valor, 0);

  // Circunferência 100: cada fatia é a própria porcentagem, com um vão
  // entre elas.
  const raio = 15.9155;
  const vao = fatias.length > 1 ? 0.8 : 0;
  let inicio = 0;
  const arcos = fatias.map((f) => {
    const parte = (f.valor / total) * 100;
    const traco = Math.max(parte - vao, 0.2);
    const arco = `
      <circle cx="21" cy="21" r="${raio}" stroke-width="6" style="stroke: ${f.cor};"
              stroke-dasharray="${traco.toFixed(3)} ${(100 - traco).toFixed(3)}" stroke-dashoffset="${(-inicio).toFixed(3)}">
        <title>${escaparHtml(f.nome)}: ${_mvMoeda(f.valor)}</title>
      </circle>`;
    inicio += parte;
    return arco;
  }).join('');

  alvo.innerHTML = `
    <div class="mv-rosca">
      <svg viewBox="0 0 42 42" role="img" aria-label="Receita estimada por categoria">${arcos}</svg>
      <div class="mv-rosca-centro">
        <span class="mv-rosca-total">${_mvMoedaCurta(total)}</span>
        <span class="mv-rosca-rotulo">estimado</span>
      </div>
    </div>
    <ul class="mv-rosca-legenda">
      ${fatias.map((f) => `
        <li>
          <i style="background-color: ${f.cor};"></i>
          <span class="mv-cat-nome" title="${escaparHtml(f.nome)}">${escaparHtml(f.nome)}</span>
          <span class="mv-cat-pct">${Math.round((f.valor / total) * 100)}%</span>
          <span class="mv-cat-valor">${_mvMoeda(f.valor)}</span>
        </li>`).join('')}
    </ul>
    ${semPreco ? `<p class="mv-nota">${semPreco} ${semPreco === 1 ? 'produto sem preço' : 'produtos sem preço'} no Cardápio ${semPreco === 1 ? 'ficou' : 'ficaram'} fora da conta.</p>` : ''}`;
}

// --- Comparativo entre lojas (colunas) ---
function _renderMvComparativo(lojas, rotuloComparado) {
  const alvo = document.getElementById('mv-comparativo-grafico');
  document.getElementById('mv-comparativo-subtitulo').textContent =
    `Faturamento do dia · variação contra ${rotuloComparado}`;
  // Folga no topo pro valor em cima da coluna mais alta.
  const escala = _mvEscala(Math.max(...lojas.map((l) => l.faturamento || 0)) * 1.15);
  const marcas = _mvMarcas(escala);
  const pct = (valor) => (valor / escala.topo) * 100;
  alvo.classList.toggle('com-foco', mvLojaFiltro !== 'todas');

  const rotulos = lojas.map((l) => {
    const variacao = _mvVariacao(l.faturamento || 0, l.faturamentoComparado);
    let delta = '<span class="mv-coluna-delta trend-sub">—</span>';
    if (variacao !== null && isFinite(variacao)) {
      const valor = Math.round(variacao * 100);
      delta = `<span class="mv-coluna-delta ${valor > 0 ? 'trend-up' : valor < 0 ? 'trend-down' : 'trend-sub'}">${valor > 0 ? '+' : ''}${valor}%</span>`;
    }
    return `
      <span class="mv-coluna-rotulo${l.loja === mvLojaFiltro ? ' foco' : ''}">
        ${escaparHtml(MV_LOJAS[l.loja]?.curto || l.loja)}
        ${delta}
      </span>`;
  }).join('');

  alvo.innerHTML = `
    <div class="mv-colunas-eixo" aria-hidden="true">${marcas.map((v) => `<span style="bottom: ${pct(v)}%">${_mvMoedaCurta(v)}</span>`).join('')}</div>
    <div class="mv-colunas-plot">
      <div class="mv-colunas-grade" aria-hidden="true">${marcas.slice(1).map((v) => `<span style="bottom: ${pct(v)}%"></span>`).join('')}</div>
      ${lojas.map((l, indice) => `
        <div class="mv-coluna ${MV_LOJAS[l.loja]?.classe || ''}${l.loja === mvLojaFiltro ? ' foco' : ''}" title="${escaparHtml(l.loja)}: ${_mvMoeda(l.faturamento || 0)}">
          <span class="mv-coluna-valor">${_mvMoedaCurta(l.faturamento || 0)}</span>
          <span class="mv-coluna-barra" style="height: ${pct(l.faturamento || 0).toFixed(2)}%; animation-delay: ${indice * 60}ms;"></span>
        </div>`).join('')}
    </div>
    <div class="mv-colunas-rotulos">${rotulos}</div>`;
}

// --- Ranking detalhado ---
function _mvChaveAlta(produto) {
  if (produto.variacao === null) return -Infinity;
  return isFinite(produto.variacao) ? produto.variacao : Number.MAX_VALUE;
}

function _renderMvRanking() {
  const dados = maisVendidosDados;
  const lista = document.getElementById('mv-ranking-lista');
  const botaoMais = document.getElementById('mv-ranking-mais');
  if (!dados || !lista) return;

  const lojas = _mvLojasFiltradas();
  const rotuloComparado = _mvRotuloComparado();
  const lojasComparaveis = new Set(lojas.filter((l) => l.itensComparado > 0).map((l) => l.loja));
  // A posição é sempre a do ranking por unidades: buscar ou reordenar não
  // muda quem é o 1º.
  let produtos = _mvProdutos(lojas)
    .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR'));
  produtos.forEach((p, indice) => {
    p.posicao = indice + 1;
    p.variacao = lojasComparaveis.has(p.loja) ? _mvVariacao(p.quantidade, p.quantidadeComparada) : null;
  });
  const maximo = produtos.length ? produtos[0].quantidade : 1;
  const total = produtos.length;

  const busca = _mvNormalizar(mvBusca.trim());
  if (busca) {
    produtos = produtos.filter((p) => _mvNormalizar(p.nome).includes(busca) || _mvNormalizar(p.nomeVendido).includes(busca));
  }
  const ordens = {
    quantidade: (a, b) => a.posicao - b.posicao,
    receita: (a, b) => (b.receita ?? -1) - (a.receita ?? -1) || a.posicao - b.posicao,
    alta: (a, b) => _mvChaveAlta(b) - _mvChaveAlta(a) || a.posicao - b.posicao,
    nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
  };
  produtos.sort(ordens[mvOrdem] || ordens.quantidade);

  const onde = mvLojaFiltro === 'todas' ? 'todas as lojas' : mvLojaFiltro;
  document.getElementById('mv-ranking-subtitulo').textContent =
    `${total} ${total === 1 ? 'produto' : 'produtos'} · ${onde}${busca ? ` · ${produtos.length} com "${mvBusca.trim()}"` : ''}`;

  const admin = window.usuarioLogado?.papel === 'admin';
  const visiveis = produtos.slice(0, mvRankingLimite);
  lista.innerHTML = visiveis.length
    ? visiveis.map((p, indice) => _mvLinhaRanking(p, maximo, admin, rotuloComparado, indice)).join('')
    : `<li class="mv-ranking-vazio">${busca ? `Nenhum produto com "${escaparHtml(mvBusca.trim())}" nesse dia.` : _mvTextoSemVenda()}</li>`;

  const faltam = produtos.length - visiveis.length;
  botaoMais.hidden = faltam <= 0;
  botaoMais.textContent = faltam > MV_RANKING_PASSO
    ? `Mostrar mais ${MV_RANKING_PASSO} (faltam ${faltam})`
    : `Mostrar os outros ${faltam}`;

  lista.querySelectorAll('[data-mv-vincular]').forEach((btn) => {
    btn.addEventListener('click', () => abrirModalVincularProduto(btn.dataset.mvVincular));
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _mvLinhaRanking(p, maximo, admin, rotuloComparado, indice) {
  const loja = MV_LOJAS[p.loja] || { classe: '', curto: p.loja };
  const aviso = 'O estoque não sabe de qual item do cardápio é esse produto, então ele não desconta nada.';
  const tag = !p.pendente ? '' : admin
    ? `<button type="button" class="tag-pendente" data-mv-vincular="${escaparHtml(p.nomeVendido)}" title="${aviso} Clique pra vincular.">não reconhecido</button>`
    : `<span class="tag-pendente" title="${aviso}">não reconhecido</span>`;
  const iniciais = p.nome.split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase();
  const foto = p.fotoUrl
    ? `<img class="mv-foto" src="${escaparHtml(p.fotoUrl)}" alt="" loading="lazy">`
    : `<span class="mv-foto mv-foto-vazia" aria-hidden="true">${escaparHtml(iniciais)}</span>`;
  const temReceita = p.receita !== null && p.receita !== undefined;

  let tendencia;
  if (p.variacao === null) {
    tendencia = `<span class="mv-tendencia igual" title="Sem venda em ${escaparHtml(rotuloComparado)} pra comparar">—</span>`;
  } else if (!isFinite(p.variacao)) {
    tendencia = `<span class="mv-tendencia novo" title="Não vendeu em ${escaparHtml(rotuloComparado)}">novo</span>`;
  } else {
    const pct = Math.round(p.variacao * 100);
    const classe = pct > 0 ? 'alta' : pct < 0 ? 'queda' : 'igual';
    const icone = pct > 0 ? 'trending-up' : pct < 0 ? 'trending-down' : 'minus';
    tendencia = `
      <span class="mv-tendencia ${classe}" title="${_formatarQuantidadeVendida(p.quantidadeComparada)} un. em ${escaparHtml(rotuloComparado)}">
        <i data-lucide="${icone}"></i>${pct > 0 ? '+' : ''}${pct}%
      </span>`;
  }

  return `
    <li class="mv-ranking-linha ${loja.classe}">
      <span class="mv-posicao${p.posicao <= 3 ? ' podio' : ''}">${p.posicao}</span>
      ${foto}
      <div class="mv-produto">
        <div class="mv-produto-nome">${escaparHtml(p.nome)}${tag}</div>
        <div class="mv-produto-meta">
          <span class="mv-ponto"></span>
          <span>${escaparHtml(_mvCategoria(p.categoria))} · ${escaparHtml(loja.curto)}</span>
        </div>
      </div>
      <div class="mv-volume">
        <span class="mv-volume-texto"><strong>${_formatarQuantidadeVendida(p.quantidade)} un.</strong>${temReceita ? ` · ${_mvMoeda(p.receita)}` : ''}</span>
        <span class="mv-volume-trilho"><span class="mv-volume-barra" style="width: ${Math.max(2, (p.quantidade / maximo) * 100).toFixed(1)}%; animation-delay: ${Math.min(indice, 12) * 25}ms;"></span></span>
      </div>
      <span class="mv-preco">${temReceita && p.quantidade ? _mvMoeda(p.receita / p.quantidade) : '—'}<small>preço médio</small></span>
      ${tendencia}
    </li>`;
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

  document.querySelectorAll('[data-acao="ver-fornecedores"]').forEach(btn => {
    btn.addEventListener('click', () => abrirModalFornecedoresInsumo(parseInt(btn.dataset.insumoId, 10)));
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
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger-texto);">Não foi possível carregar os lotes vencendo.</td></tr>`;
  }
}

function _diasAteValidade(validade) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataValidade = new Date(`${validade}T00:00:00`);
  return Math.round((dataValidade - hoje) / (1000 * 60 * 60 * 24));
}

const AJUDA_ABA_ALERTAS_ESTOQUE = {
  'estoque-aba-lotes': 'Validade nos próximos 7 dias (inclui já vencidos)',
  'estoque-aba-datas': 'Feriado, evento, data que costuma vender mais: enquanto a data cair nos próximos 7 dias, a quantidade ideal calculada aumenta (ajuste manual não muda).',
};

function _mostrarAbaAlertasEstoque(idAba) {
  document.querySelectorAll('.estoque-aba').forEach((aba) => {
    const ativa = aba.id === idAba;
    aba.classList.toggle('ativa', ativa);
    aba.setAttribute('aria-selected', String(ativa));
    aba.tabIndex = ativa ? 0 : -1;
    const painel = document.getElementById(aba.getAttribute('aria-controls'));
    if (painel) painel.hidden = !ativa;
  });
  document.getElementById('estoque-alertas-ajuda').textContent = AJUDA_ABA_ALERTAS_ESTOQUE[idAba] || '';
  document.getElementById('btn-nova-data-especial').hidden = idAba !== 'estoque-aba-datas';
}

function renderLotesVencendo() {
  const isAdmin = _possoGerir();
  const contador = document.getElementById('estoque-aba-lotes-contador');
  if (contador) {
    contador.textContent = lotesVencendo.length;
    contador.classList.toggle('tem-alerta', lotesVencendo.length > 0);
    contador.classList.toggle('vencido', lotesVencendo.some((l) => _diasAteValidade(l.validade) < 0));
  }
  const tbody = document.getElementById('lotes-vencendo-tabela-body');
  if (!tbody) return;

  const thAcoes = document.getElementById('lotes-th-acoes');
  if (thAcoes) thAcoes.style.display = isAdmin ? '' : 'none';

  // Sem lote, a tabela vira uma linha de aviso: o cabeçalho some.
  tbody.closest('table')?.classList.toggle('tabela-vazia', !lotesVencendo.length);
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
          <td class="col-acoes"><div class="acoes-linha">
            <button type="button" class="btn-acao-icone" data-acao="resolver-lote" data-lote-id="${lote.id}" title="Marcar como resolvido">
              <i data-lucide="check"></i>
            </button>
          </div></td>
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
    document.getElementById('estoque-aba-datas').hidden = false;
    renderDatasEspeciais();
  } catch (erro) {
    console.error('Falha ao carregar datas especiais:', erro);
  }
}

function renderDatasEspeciais() {
  const tbody = document.getElementById('datas-especiais-tabela-body');
  if (!tbody) return;
  const contador = document.getElementById('estoque-aba-datas-contador');
  if (contador) contador.textContent = datasEspeciaisLista.length;
  tbody.closest('table')?.classList.toggle('tabela-vazia', !datasEspeciaisLista.length);

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
        <td class="col-acoes"><div class="acoes-linha">
          <button type="button" class="btn-acao-icone btn-excluir" data-acao="excluir-data-especial" data-id="${d.id}" title="Excluir">
            <i data-lucide="trash-2"></i>
          </button>
        </div></td>
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
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="color:var(--danger-texto);">Não foi possível carregar os fornecedores. Confira se o Flask está rodando.</td></tr>`;
  }
}

function renderFornecedoresTabela() {
  const isAdmin = _possoGerir();
  const tbody = document.getElementById('fornecedores-tabela-body');
  if (!tbody) return;

  const thAcoes = document.getElementById('fornecedores-th-acoes');
  if (thAcoes) thAcoes.style.display = isAdmin ? '' : 'none';
  const acoesTopo = document.getElementById('fornecedores-acoes-admin');
  if (acoesTopo) acoesTopo.style.display = isAdmin ? '' : 'none';

  _renderIndicadoresFornecedores(isAdmin);

  // A busca acha por nome, CNPJ, categoria, contato e loja.
  const termoBusca = (document.getElementById('fornecedores-busca')?.value || '').trim().toLowerCase();
  let linhas = fornecedoresLista;
  if (termoBusca) {
    linhas = linhas.filter((f) => [f.nome, f.cnpj, f.categoria, f.contatoNome, f.contatoTelefone, f.contatoEmail, ...(f.lojas || [])]
      .some((campo) => String(campo || '').toLowerCase().includes(termoBusca)));
  }
  document.getElementById('fornecedores-tabela-sub').textContent = termoBusca
    ? `${linhas.length} de ${fornecedoresLista.length} fornecedores`
    : 'Contato, lojas atendidas e condições comerciais de cada fornecedor';

  if (!linhas.length) {
    const colspan = 6 + (isAdmin ? 1 : 0);
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="panel-subtitle">Nenhum fornecedor encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = linhas.map((f) => `
    <tr class="${f.ativo ? '' : 'fornecedor-inativo'}">
      <td>
        <span class="font-bold fornecedor-nome">${escaparHtml(f.nome)}</span>
        <span class="fornecedor-sub">${escaparHtml(f.cnpj) || 'Sem CNPJ'}</span>
      </td>
      <td>${_lojasAtendidasHTML(f.lojas || [])}</td>
      <td><span class="badge tag-categoria" data-cor="${_corDaCategoria(f.categoria)}">${escaparHtml(f.categoria)}</span></td>
      <td>
        <span class="fornecedor-nome-contato">${escaparHtml(f.contatoNome) || '—'}</span>
        ${f.contatoTelefone || f.contatoEmail ? `<span class="fornecedor-sub" title="${escaparHtml([f.contatoTelefone, f.contatoEmail].filter(Boolean).join(' · '))}">${escaparHtml(f.contatoTelefone || f.contatoEmail)}</span>` : ''}
      </td>
      <td>${_condicoesComerciaisHTML(f)}</td>
      <td><span class="badge-pill ${f.ativo ? 'pos' : 'fornecedor-status-inativo'}">${f.ativo ? 'Ativo' : 'Inativo'}</span></td>
      ${isAdmin ? `
        <td class="col-acoes"><div class="acoes-linha">
          <button type="button" class="btn-acao-icone" data-acao="detalhes-fornecedor" data-id="${f.id}" title="Ver detalhes">
            <i data-lucide="eye"></i>
          </button>
          <button type="button" class="btn-acao-icone" data-acao="editar-fornecedor" data-id="${f.id}" title="Editar fornecedor">
            <i data-lucide="pencil"></i>
          </button>
          <button type="button" class="btn-acao-icone" data-acao="alternar-ativo-fornecedor" data-id="${f.id}" data-ativo="${f.ativo ? '1' : '0'}" title="${f.ativo ? 'Desativar' : 'Ativar'}">
            <i data-lucide="${f.ativo ? 'ban' : 'check-circle-2'}"></i>
          </button>
        </div></td>
      ` : ''}
    </tr>
  `).join('');

  if (isAdmin) wireFornecedoresTableEvents();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Redesenho de Fornecedores (18/09): uma linha por fornecedor. As lojas viram
// etiquetas curtas (no máximo duas e "+N"), as condições comerciais ficam
// numa linha só e o resto do cadastro vai pro "Ver detalhes".
function _lojasAtendidasHTML(lojas) {
  if (!lojas.length) return '<span class="text-muted">—</span>';
  if (lojas.length >= LOJAS_ESTOQUE.length) return '<span class="tag-loja" title="' + escaparHtml(lojas.join(', ')) + '">Todas as lojas</span>';
  const visiveis = lojas.slice(0, 2);
  const resto = lojas.slice(2);
  return `<span class="lojas-atendidas">${visiveis.map((l) => `<span class="tag-loja" title="${escaparHtml(l)}">${escaparHtml(_nomeCurtoLoja(l))}</span>`).join('')}${resto.length ? `<span class="tag-loja resto" title="${escaparHtml(resto.join(', '))}">+${resto.length}</span>` : ''}</span>`;
}

function _pedidoMinimoTexto(valor) {
  return valor ? `R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Sem mínimo';
}

function _condicoesComerciaisHTML(f) {
  const item = (icone, rotulo, texto, vazio) => `<span class="${texto ? '' : 'vazio'}" title="${rotulo}"><i data-lucide="${icone}"></i>${escaparHtml(texto || vazio)}</span>`;
  return `<span class="fornecedor-condicoes">
    ${item('credit-card', 'Prazo de pagamento', f.prazoPagamento, 'Não informado')}
    ${item('shopping-basket', 'Pedido mínimo', f.pedidoMinimo ? _pedidoMinimoTexto(f.pedidoMinimo) : '', 'Sem mínimo')}
    ${item('calendar-days', 'Dia de entrega', f.diasEntrega, 'Não informado')}
  </span>`;
}

let entregasAReceberFornecedores = null; // busca uma vez por carregamento da tela

function _renderIndicadoresFornecedores(isAdmin) {
  const ativos = fornecedoresLista.filter((f) => f.ativo).length;
  const inativos = fornecedoresLista.length - ativos;
  document.getElementById('fornecedores-val-total').textContent = fornecedoresLista.length;
  document.getElementById('fornecedores-val-ativos').textContent = ativos;
  document.getElementById('fornecedores-val-inativos').textContent = `${inativos} ${inativos === 1 ? 'inativo' : 'inativos'}`;
  const porCategoria = new Map();
  fornecedoresLista.filter((f) => f.ativo).forEach((f) => porCategoria.set(f.categoria, (porCategoria.get(f.categoria) || 0) + 1));
  document.getElementById('fornecedores-val-categorias').textContent = porCategoria.size;
  const principais = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  document.getElementById('fornecedores-val-categorias-top').textContent = principais.length
    ? `Mais: ${principais.map(([nome, n]) => `${nome} (${n})`).join(', ')}`
    : '—';

  // Entregas a receber = pedidos enviados que ainda não chegaram (mesma conta
  // dos números do menu de Compras). Só pra quem vê compras.
  const cartao = document.getElementById('fornecedores-card-entregas');
  if (!cartao || !isAdmin) return;
  if (!entregasAReceberFornecedores) {
    entregasAReceberFornecedores = fetch('/api/compras/pendencias')
      .then((resposta) => (resposta.ok ? resposta.json() : null))
      .catch(() => null);
  }
  entregasAReceberFornecedores.then((dados) => {
    if (!dados) return;
    const total = (dados.entregasNoPrazo || 0) + (dados.entregasAtrasadas || 0);
    cartao.hidden = false;
    document.getElementById('fornecedores-val-entregas').textContent = total;
    const sub = document.getElementById('fornecedores-val-entregas-sub');
    sub.textContent = dados.entregasAtrasadas
      ? `${dados.entregasAtrasadas} ${dados.entregasAtrasadas === 1 ? 'atrasada' : 'atrasadas'} (mais de ${dados.diasEntregaAtrasada} dias)`
      : (total ? 'todas no prazo' : 'nada a receber');
    cartao.classList.toggle('tem-atraso', !!dados.entregasAtrasadas);
  });
}

let fornecedorDetalhesId = null;

function abrirDetalhesFornecedor(fornecedor) {
  fornecedorDetalhesId = fornecedor.id;
  document.getElementById('fornecedor-detalhes-titulo').textContent = fornecedor.nome;
  const linkWhats = _linkWhatsAppContato(fornecedor.contatoTelefone);
  const campo = (rotulo, valor) => `<div><dt>${rotulo}</dt><dd>${valor}</dd></div>`;
  document.getElementById('fornecedor-detalhes-corpo').innerHTML = [
    campo('Status', `<span class="badge-pill ${fornecedor.ativo ? 'pos' : 'fornecedor-status-inativo'}">${fornecedor.ativo ? 'Ativo' : 'Inativo'}</span>`),
    campo('CNPJ', escaparHtml(fornecedor.cnpj) || '—'),
    campo('Categoria', `<span class="badge tag-categoria" data-cor="${_corDaCategoria(fornecedor.categoria)}">${escaparHtml(fornecedor.categoria)}</span>`),
    campo('Lojas atendidas', escaparHtml((fornecedor.lojas || []).join(', ')) || '—'),
    campo('Contato', escaparHtml(fornecedor.contatoNome) || '—'),
    campo('Telefone', fornecedor.contatoTelefone
      ? `${escaparHtml(fornecedor.contatoTelefone)}${linkWhats ? ` · <a href="${escaparHtml(linkWhats)}" target="_blank" rel="noopener">abrir no WhatsApp</a>` : ''}`
      : '—'),
    campo('E-mail', fornecedor.contatoEmail ? `<a href="mailto:${escaparHtml(fornecedor.contatoEmail)}">${escaparHtml(fornecedor.contatoEmail)}</a>` : '—'),
    campo('Prazo de pagamento', escaparHtml(fornecedor.prazoPagamento) || 'Não informado'),
    campo('Pedido mínimo', _pedidoMinimoTexto(fornecedor.pedidoMinimo)),
    campo('Dia de entrega', escaparHtml(fornecedor.diasEntrega) || 'Não informado'),
    campo('Observações', escaparHtml(fornecedor.observacoes) || '—'),
  ].join('');
  document.getElementById('btn-fornecedor-detalhes-editar').hidden = !_possoGerir();
  document.getElementById('modal-fornecedor-detalhes').style.display = 'flex';
}

function fecharDetalhesFornecedor() {
  document.getElementById('modal-fornecedor-detalhes').style.display = 'none';
}

document.getElementById('btn-fornecedor-detalhes-fechar')?.addEventListener('click', fecharDetalhesFornecedor);
document.getElementById('btn-fornecedor-detalhes-ok')?.addEventListener('click', fecharDetalhesFornecedor);
document.getElementById('btn-fornecedor-detalhes-editar')?.addEventListener('click', () => {
  const fornecedor = fornecedoresLista.find((f) => f.id === fornecedorDetalhesId);
  fecharDetalhesFornecedor();
  if (fornecedor) abrirModalFornecedor(fornecedor);
});

function wireFornecedoresTableEvents() {
  document.querySelectorAll('[data-acao="detalhes-fornecedor"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fornecedor = fornecedoresLista.find((f) => f.id === parseInt(btn.dataset.id, 10));
      if (fornecedor) abrirDetalhesFornecedor(fornecedor);
    });
  });
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
const ORIGEM_LABEL_COTACAO = { vmarket: 'VMarket', requisicao: 'Requisição', manual: 'Manual' };
// Barra de respostas verde a partir de 60% dos convites respondidos; abaixo, laranja.
const RESPOSTAS_AVANCADAS_PCT = 60;
// Fornecedores participantes e taxa de resposta olham a mesma janela.
const DIAS_INDICADORES_COTACOES = 30;

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
    _renderIndicadoresCotacoes();
    _renderEconomiaCotacoes();
  } catch (erro) {
    console.error('Falha ao carregar cotações:', erro);
    tbody.innerHTML = `<tr><td colspan="10" style="color:var(--danger-texto);">Não foi possível carregar as cotações. Confira se o Flask está rodando.</td></tr>`;
  }
}

function _formatarMoedaCompacta(valor) {
  return (valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderCotacoesLista() {
  const isAdmin = _possoGerir();
  const tbody = document.getElementById('cotacoes-tabela-body');
  if (!tbody) return;

  const thAcoes = document.getElementById('cotacoes-th-acoes');
  if (thAcoes) thAcoes.style.display = isAdmin ? '' : 'none';
  const acoesTopo = document.getElementById('cotacoes-acoes-admin');
  if (acoesTopo) acoesTopo.style.display = isAdmin ? '' : 'none';

  // Filtros estilo VMarket (print da Julia, 2026-09-04): Mostrar
  // (aberta/fechada), Tipo (de onde veio: à mão, Requisição ou VMarket),
  // Busca (nome ou nº) e Dias (criada nos últimos N) — tudo client-side,
  // mesma lista já carregada, sem rota nova.
  const filtroMostrar = document.getElementById('cotacoes-filtro-mostrar')?.value || '';
  const filtroTipo = document.getElementById('cotacoes-filtro-tipo')?.value || '';
  const filtroBusca = (document.getElementById('cotacoes-filtro-busca')?.value || '').trim().toLowerCase();
  const filtroDias = document.getElementById('cotacoes-filtro-dias')?.value || '';

  const agora = new Date();
  const lista = cotacoesLista.filter((c) => {
    if (filtroMostrar && c.status !== filtroMostrar) return false;
    if (filtroTipo && c.origem !== filtroTipo) return false;
    if (filtroBusca && !c.titulo.toLowerCase().includes(filtroBusca) && String(c.id) !== filtroBusca) return false;
    if (filtroDias) {
      const dias = (agora - new Date(c.criadoEm)) / (1000 * 60 * 60 * 24);
      if (dias > parseInt(filtroDias, 10)) return false;
    }
    return true;
  });

  const contagem = document.getElementById('cotacoes-contagem');
  if (contagem) contagem.textContent = `${lista.length} ${lista.length === 1 ? 'cotação' : 'cotações'}`;

  const colspan = 9 + (isAdmin ? 1 : 0);
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="panel-subtitle">Nenhuma cotação encontrada pra esse filtro.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map((c) => {
    const respostas = c.percentualRespostas;
    const celulaRespostas = respostas === null
      ? '<span class="text-muted">—</span>'
      : `<div class="respostas-cel" title="${c.convitesRespondidos} de ${c.convitesTotal} convites respondidos">
          <span class="respostas-barra"><span class="${respostas >= RESPOSTAS_AVANCADAS_PCT ? 'avancada' : 'baixa'}" style="width:${respostas}%"></span></span>
          <span class="respostas-pct">${respostas}%</span>
        </div>`;
    const titulo = escaparHtml(c.titulo);
    return `
    <tr>
      <td class="cotacao-numero">${c.id}</td>
      <td class="cotacao-titulo-cel">
        ${isAdmin
          ? `<button type="button" class="cotacao-titulo-link" data-acao="abrir-cotacao" data-id="${c.id}" title="Ver/editar preços">${titulo}</button>`
          : `<span class="cotacao-titulo">${titulo}</span>`}
        <span class="tag-origem">${ORIGEM_LABEL_COTACAO[c.origem] || 'Manual'}</span>
      </td>
      <td>${celulaRespostas}</td>
      <td class="cotacao-fracao">${c.totalInsumos}<span class="barra-fracao">/</span>${c.insumosComprados}</td>
      <td>${c.totalFornecedores}</td>
      <td><span class="badge-pill status-cotacao-${c.status}">${STATUS_LABEL_COTACAO[c.status]}</span></td>
      <td class="text-muted">${new Date(c.criadoEm).toLocaleDateString('pt-BR')}</td>
      <td class="col-dinheiro ${c.economia > 0 ? 'economia-positiva' : 'text-muted'}">R$ ${_formatarMoedaCompacta(c.economia)}</td>
      <td class="col-dinheiro font-bold">R$ ${_formatarMoedaCompacta(c.valorPedido)}</td>
      ${isAdmin ? `
        <td class="col-acoes"><div class="acoes-linha">
          <button type="button" class="btn-acao-icone" data-acao="abrir-cotacao" data-id="${c.id}" title="Ver/editar preços">
            <i data-lucide="arrow-right"></i>
          </button>
          ${c.totalPedidos
            ? `<button type="button" class="btn-acao-icone btn-acao-bloqueado" data-acao="cotacao-com-pedidos" aria-disabled="true" title="Essa cotação tem ${c.totalPedidos} pedido${c.totalPedidos > 1 ? 's' : ''}. Pra excluir, cancele os pedidos antes na tela de Pedidos.">
                <i data-lucide="trash-2"></i>
              </button>`
            : `<button type="button" class="btn-acao-icone btn-excluir" data-acao="excluir-cotacao" data-id="${c.id}" data-titulo="${titulo}" title="Excluir cotação">
                <i data-lucide="trash-2"></i>
              </button>`}
        </div></td>
      ` : ''}
    </tr>
  `;
  }).join('');

  document.querySelectorAll('[data-acao="abrir-cotacao"]').forEach(btn => {
    btn.addEventListener('click', () => abrirCotacaoDetalhe(parseInt(btn.dataset.id, 10)));
  });
  // Lixeira travada (a cotação tem pedido): o clique só explica o porquê.
  document.querySelectorAll('[data-acao="cotacao-com-pedidos"]').forEach(btn => {
    btn.addEventListener('click', () => alert(btn.title));
  });
  document.querySelectorAll('[data-acao="excluir-cotacao"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Excluir a cotação "${btn.dataset.titulo}"? Essa ação não pode ser desfeita.`)) return;
      try {
        const resposta = await fetch(`/api/cotacoes/${btn.dataset.id}`, { method: 'DELETE' });
        const dados = await resposta.json().catch(() => ({}));
        if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível excluir a cotação.');
        await carregarCotacoes();
      } catch (erro) {
        console.error('Falha ao excluir cotação:', erro);
        alert(erro.message);
      }
    });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _mostrarAbaCotacoes(aba) {
  document.querySelectorAll('#cotacoes-tabs-bar .tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === aba));
  document.getElementById('cotacoes-painel-cotacoes').style.display = aba === 'cotacoes' ? '' : 'none';
  document.getElementById('cotacoes-painel-compras').style.display = aba === 'compras' ? '' : 'none';
  if (aba === 'compras') carregarHistoricoCompras();
}

// A economia só vale quando a compra está decidida: cotação fechada ou que
// já gerou pedido. Aberta sem pedido ainda pode trocar de vencedor.
function _cotacaoDecidida(c) {
  return c.status === 'fechada' || c.totalPedidos > 0;
}

// Os 4 cards do topo. Não seguem os filtros da tabela: abertas é o estado de
// agora, economia é do mês corrente e os outros dois, dos últimos 30 dias.
function _renderIndicadoresCotacoes() {
  const escrever = (id, texto) => {
    const elemento = document.getElementById(id);
    if (elemento) elemento.textContent = texto;
  };
  const agora = new Date();

  const abertas = cotacoesLista.filter((c) => c.status === 'aberta');
  const semResposta = abertas.reduce((soma, c) => soma + (c.convitesTotal - c.convitesRespondidos), 0);
  escrever('cotacoes-kpi-abertas', String(abertas.length));
  let subAbertas = 'nenhuma em andamento';
  if (abertas.length && semResposta) {
    subAbertas = `${semResposta} ${semResposta === 1 ? 'convite sem resposta' : 'convites sem resposta'}`;
  } else if (abertas.length) {
    subAbertas = abertas.length === 1 ? 'ativa agora' : 'ativas agora';
  }
  escrever('cotacoes-kpi-abertas-sub', subAbertas);

  const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const doMes = cotacoesLista.filter((c) => _cotacaoDecidida(c) && new Date(c.criadoEm) >= inicioDoMes);
  const economiaDoMes = doMes.reduce((soma, c) => soma + (c.economia || 0), 0);
  escrever('cotacoes-kpi-economia-mes', `R$ ${_formatarMoedaCompacta(economiaDoMes)}`);
  const nomeDoMes = agora.toLocaleDateString('pt-BR', { month: 'long' });
  escrever('cotacoes-kpi-economia-mes-sub', `em ${nomeDoMes} · ${doMes.length} ${doMes.length === 1 ? 'cotação' : 'cotações'}`);

  const corte = new Date(agora.getTime() - DIAS_INDICADORES_COTACOES * 86400000);
  const recentes = cotacoesLista.filter((c) => new Date(c.criadoEm) >= corte);
  const participantes = new Set(recentes.flatMap((c) => c.fornecedorIds || [])).size;
  const valorParticipantes = document.getElementById('cotacoes-kpi-fornecedores');
  if (valorParticipantes) {
    valorParticipantes.innerHTML = `${participantes} <small>${participantes === 1 ? 'parceiro' : 'parceiros'}</small>`;
  }

  // Ponderada pelos convites (respondidos ÷ enviados), não a média das
  // porcentagens: cotação com 2 convites não pesa igual a uma com 10.
  const convites = recentes.reduce((total, c) => ({
    enviados: total.enviados + (c.convitesTotal || 0),
    respondidos: total.respondidos + (c.convitesRespondidos || 0),
  }), { enviados: 0, respondidos: 0 });
  escrever('cotacoes-kpi-resposta', convites.enviados ? `${Math.round((100 * convites.respondidos) / convites.enviados)}%` : '—');
  escrever('cotacoes-kpi-resposta-sub', convites.enviados
    ? `${convites.respondidos} de ${convites.enviados} convites · ${DIAS_INDICADORES_COTACOES} dias`
    : `sem convites nos últimos ${DIAS_INDICADORES_COTACOES} dias`);
}

// Gráfico "Economia acumulada": soma, período a período, a mesma Economia
// da tabela (maior preço comparável menos o vencedor, vezes a quantidade)
// das cotações decididas.
const PERIODOS_ECONOMIA_COTACOES = {
  semanas: { quantidade: 12, tipo: 'semana', legenda: 'nas últimas 12 semanas' },
  '6m': { quantidade: 6, tipo: 'mes', legenda: 'nos últimos 6 meses' },
  '12m': { quantidade: 12, tipo: 'mes', legenda: 'nos últimos 12 meses' },
};
let periodoEconomiaCotacoes = '6m';
let economiaGraficoInstance = null;

// Do mais antigo pro atual. Semana de terça a segunda, como nas Vendas Semanais.
function _periodosEconomiaCotacoes(chave) {
  const { quantidade, tipo } = PERIODOS_ECONOMIA_COTACOES[chave];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diaMes = (data) => data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const periodos = [];
  for (let i = quantidade - 1; i >= 0; i -= 1) {
    if (tipo === 'mes') {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      periodos.push({
        inicio,
        fim: new Date(hoje.getFullYear(), hoje.getMonth() - i + 1, 1),
        rotulo: inicio.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        titulo: inicio.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      });
    } else {
      const inicio = new Date(hoje);
      inicio.setDate(hoje.getDate() - ((hoje.getDay() + 5) % 7) - 7 * i);
      const fim = new Date(inicio);
      fim.setDate(inicio.getDate() + 7);
      const segunda = new Date(fim);
      segunda.setDate(fim.getDate() - 1);
      periodos.push({ inicio, fim, rotulo: diaMes(inicio), titulo: `Semana de ${diaMes(inicio)} a ${diaMes(segunda)}` });
    }
  }
  return periodos;
}

// "#047857" + 0.2 → "rgba(4, 120, 87, 0.2)", pro degradê embaixo da linha.
function _corComTransparencia(cor, alfa) {
  const hex = cor.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return cor;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

function _renderEconomiaCotacoes() {
  const canvas = document.getElementById('economia-grafico');
  if (!canvas) return;
  const periodos = _periodosEconomiaCotacoes(periodoEconomiaCotacoes);
  const porPeriodo = periodos.map(() => 0);
  let cotacoesComEconomia = 0;
  cotacoesLista.forEach((c) => {
    if (!_cotacaoDecidida(c) || !(c.economia > 0)) return;
    const criada = new Date(c.criadoEm);
    const indice = periodos.findIndex((p) => criada >= p.inicio && criada < p.fim);
    if (indice === -1) return;
    porPeriodo[indice] += c.economia;
    cotacoesComEconomia += 1;
  });
  let soma = 0;
  const acumulado = porPeriodo.map((valor) => (soma += valor));

  const { legenda } = PERIODOS_ECONOMIA_COTACOES[periodoEconomiaCotacoes];
  document.getElementById('economia-total').textContent = `R$ ${_formatarMoedaCompacta(soma)}`;
  document.getElementById('economia-legenda').textContent = cotacoesComEconomia
    ? `${legenda}, em ${cotacoesComEconomia} ${cotacoesComEconomia === 1 ? 'cotação' : 'cotações'}`
    : legenda;
  document.getElementById('economia-vazio').style.display = soma ? 'none' : '';

  if (economiaGraficoInstance) {
    economiaGraficoInstance.destroy();
    economiaGraficoInstance = null;
  }
  if (!soma || typeof Chart === 'undefined') return;

  const estilo = getComputedStyle(document.body);
  const corLinha = estilo.getPropertyValue('--success-texto').trim() || '#047857';
  const corTexto = estilo.getPropertyValue('--text-muted').trim() || '#52525B';
  const corGrade = estilo.getPropertyValue('--border-color').trim() || '#E6DDCC';
  const fundoCartao = estilo.getPropertyValue('--card-bg').trim() || '#FFFFFF';
  const contexto = canvas.getContext('2d');
  const degrade = contexto.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight || 190);
  degrade.addColorStop(0, _corComTransparencia(corLinha, 0.24));
  degrade.addColorStop(1, _corComTransparencia(corLinha, 0));
  const ultimo = acumulado.length - 1;

  economiaGraficoInstance = new Chart(contexto, {
    type: 'line',
    data: {
      labels: periodos.map((p) => p.rotulo),
      datasets: [{
        label: 'Economia acumulada',
        data: acumulado,
        borderColor: corLinha,
        backgroundColor: degrade,
        fill: 'origin',
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: acumulado.map((_, i) => (i === ultimo ? 4.5 : 0)),
        pointHoverRadius: 5,
        pointBackgroundColor: corLinha,
        pointBorderColor: fundoCartao,
        pointBorderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 600 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (itens) => periodos[itens[0].dataIndex].titulo,
            label: (item) => `Acumulado: R$ ${_formatarMoedaCompacta(item.raw)}`,
            afterLabel: (item) => `No período: R$ ${_formatarMoedaCompacta(porPeriodo[item.dataIndex])}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: corTexto, font: { size: 11 } } },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: corGrade },
          ticks: { color: corTexto, font: { size: 11 }, maxTicksLimit: 5, callback: (valor) => _mvMoedaCurta(valor) },
        },
      },
    },
  });
}

document.getElementById('cotacoes-filtro-mostrar')?.addEventListener('change', renderCotacoesLista);
document.getElementById('cotacoes-filtro-tipo')?.addEventListener('change', renderCotacoesLista);
document.getElementById('cotacoes-filtro-busca')?.addEventListener('input', renderCotacoesLista);
document.getElementById('cotacoes-filtro-dias')?.addEventListener('change', renderCotacoesLista);
document.getElementById('compras-filtro-dias')?.addEventListener('change', renderHistoricoCompras);

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
  document.getElementById('cotacoes-topo').style.display = '';
  cotacaoAtualId = null;
  await carregarCotacoes();
});

let historicoComprasLista = [];

async function carregarHistoricoCompras() {
  const container = document.getElementById('cotacoes-compras-lista');
  if (!container) return;
  container.innerHTML = `<p class="panel-subtitle">Carregando...</p>`;
  try {
    const resposta = await fetch('/api/cotacoes/historico');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    historicoComprasLista = dados.historico || [];
    renderHistoricoCompras();
  } catch (erro) {
    console.error('Falha ao carregar histórico de compras:', erro);
    container.innerHTML = `<p class="panel-subtitle" style="color:var(--danger-texto);">Não foi possível carregar o histórico. Confira se o Flask está rodando.</p>`;
  }
}

function renderHistoricoCompras() {
  const container = document.getElementById('cotacoes-compras-lista');
  if (!container) return;

  if (!historicoComprasLista.length) {
    container.innerHTML = `<p class="panel-subtitle">Nenhuma cotação fechada ainda — feche uma cotação na aba "Cotações" pra ela aparecer aqui.</p>`;
    return;
  }
  const inicio = _inicioDoPeriodo(document.getElementById('compras-filtro-dias')?.value);
  const historico = historicoComprasLista.filter((cotacao) => !inicio || cotacao.criadoEm.slice(0, 10) >= inicio);
  if (!historico.length) {
    container.innerHTML = `<p class="panel-subtitle">Nenhuma cotação fechada nesse período. Escolha mais dias pra ver as mais antigas.</p>`;
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
  // Pode vir da aba Compras ("Nova cotação"); o detalhe tem título e ações
  // próprios, então o topo da lista some.
  _mostrarAbaCotacoes('cotacoes');
  document.getElementById('cotacoes-topo').style.display = 'none';
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
  const isAdmin = _possoGerir();
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
    _avisarItensSemFornecedor();
  } catch (erro) {
    console.error('Falha ao carregar convites:', erro);
  }
}

// Itens que ninguém cota não vão em link nenhum (2026-09-21): a cotação avisa
// quais são, pra compradora decidir.
async function _avisarItensSemFornecedor() {
  const card = document.getElementById('cotacao-convites-card');
  if (!card || !cotacaoAtualId) return;
  let aviso = document.getElementById('cotacao-sem-fornecedor-aviso');
  if (!aviso) {
    aviso = document.createElement('p');
    aviso.id = 'cotacao-sem-fornecedor-aviso';
    aviso.className = 'panel-subtitle cotacao-sem-fornecedor-aviso';
    card.querySelector('.table-header-row')?.after(aviso);
  }
  aviso.hidden = true;
  try {
    const resposta = await fetch(`/api/cotacoes/${cotacaoAtualId}/convites/previa`);
    if (!resposta.ok) return;
    const orfaos = (await resposta.json()).orfaos || [];
    aviso.hidden = !orfaos.length;
    aviso.innerHTML = orfaos.length
      ? `<strong>Sem fornecedor marcado (não vão em nenhum link):</strong> ${escaparHtml(orfaos.join(', '))}. Marque quem cota em Insumos, lance o preço à mão ou convide um fornecedor novo.`
      : '';
  } catch (erro) {
    console.error('Falha ao ver itens sem fornecedor:', erro);
  }
}

const STATUS_LABEL_CONVITE = { aberta: 'Aguardando resposta', respondida: 'Respondido' };
let convitesCotacaoAtuais = [];
let lojasCotacaoAtual = [];

// Lista do "Convidar fornecedores": quem fornece pras lojas dessa cotação
// (Fornecedores → "Lojas que compram dele") já vem marcado, o resto fica
// desmarcado embaixo. Sem ninguém marcado pra essas lojas, marca todo
// fornecedor ativo — o jeito de antes (pedido da Julia, 2026-09-11).
// Itens marcados no link de cada fornecedor (2026-09-21): começa com os que
// ele cota e a compradora tira ou põe. Zera a cada vez que o modal abre.
let selecaoItensConvite = new Map();
let conviteFornecedoresAbertos = new Set();

async function renderListaConvidarFornecedores() {
  const lista = document.getElementById('convidar-fornecedores-lista');
  if (!lista) return;
  selecaoItensConvite = new Map();
  conviteFornecedoresAbertos = new Set();
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
    lista.querySelectorAll('input[type="checkbox"]').forEach((caixa) => {
      caixa.addEventListener('change', renderPreviaConvite);
    });
    await carregarPreviaConvite();
  } catch (erro) {
    console.error('Falha ao carregar fornecedores:', erro);
    lista.innerHTML = '<p class="form-erro">Não foi possível carregar os fornecedores.</p>';
  }
}

// --- PRÉVIA DO CONVITE ---
// Link de cotação errado só se descobre depois que o fornecedor responde, e
// aí já foi. A prévia mostra, antes de gerar, quem recebe o link e o que vai
// dentro dele (pedido dela, 17/09). Vem do servidor pela mesma regra que
// gera o convite de verdade, pra não divergir.
let previaConviteDados = null;

async function carregarPreviaConvite() {
  const alvo = document.getElementById('convite-previa');
  if (!alvo || !cotacaoAtualId) return;
  alvo.innerHTML = '<p class="panel-subtitle">Carregando...</p>';
  try {
    const resposta = await fetch(`/api/cotacoes/${cotacaoAtualId}/convites/previa`);
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    previaConviteDados = await resposta.json();
    renderPreviaConvite();
  } catch (erro) {
    console.error('Falha ao carregar a prévia do convite:', erro);
    alvo.innerHTML = '<p class="form-erro">Não foi possível montar a prévia.</p>';
  }
}

function renderPreviaConvite() {
  const alvo = document.getElementById('convite-previa');
  if (!alvo || !previaConviteDados) return;
  const marcados = new Set(Array.from(
    document.querySelectorAll('#convidar-fornecedores-lista input:checked')
  ).map((caixa) => parseInt(caixa.value, 10)));
  const escolhidos = previaConviteDados.fornecedores.filter((f) => marcados.has(f.fornecedorId));
  const jaTem = escolhidos.filter((f) => f.jaTemConvite);
  const editaveis = escolhidos.filter((f) => !f.jaTemConvite);
  editaveis.forEach((f) => {
    if (!selecaoItensConvite.has(f.fornecedorId)) selecaoItensConvite.set(f.fornecedorId, new Set(f.itens || []));
  });
  const receberao = editaveis.filter((f) => selecaoItensConvite.get(f.fornecedorId).size);
  const todosItens = previaConviteDados.itensDaCotacao || [];

  if (!escolhidos.length) {
    alvo.innerHTML = '<p class="panel-subtitle">Marque um fornecedor pra ver o que vai no link dele.</p>';
    return;
  }

  const orfaos = previaConviteDados.orfaos || [];
  alvo.innerHTML = `
    <p class="panel-subtitle">
      ${receberao.length} de ${escolhidos.length} marcados recebem link, de ${previaConviteDados.insumosDaCotacao} insumos na cotação.
      ${orfaos.length ? `<br><strong>Sem fornecedor marcado, não ${orfaos.length === 1 ? 'vai' : 'vão'} em nenhum link:</strong> ${escaparHtml(orfaos.join(', '))}. Marque quem cota em Insumos (na loja), lance o preço à mão ou convide um fornecedor novo.` : ''}
    </p>
    <p class="panel-subtitle convite-previa-dica">Abra cada fornecedor pra marcar ou desmarcar o que vai no link dele. Vale só pra esse convite.</p>
    <ul class="convite-previa-lista">
      ${editaveis.map((f) => {
        const padrao = new Set(f.itens || []);
        const marcadosDele = selecaoItensConvite.get(f.fornecedorId);
        const caixa = (item) => `
          <label class="convite-item">
            <input type="checkbox" data-convite-fornecedor="${f.fornecedorId}" value="${item.id}" ${marcadosDele.has(item.id) ? 'checked' : ''}>
            <span>${escaparHtml(item.nome)}</span>
          </label>`;
        const dele = todosItens.filter((item) => padrao.has(item.id));
        const outros = todosItens.filter((item) => !padrao.has(item.id));
        return `
        <li>
          <details data-convite-detalhe="${f.fornecedorId}" ${conviteFornecedoresAbertos.has(f.fornecedorId) ? 'open' : ''}>
            <summary><strong>${escaparHtml(f.fornecedorNome)}</strong> — <span data-convite-contagem="${f.fornecedorId}">${_textoContagemConvite(marcadosDele.size)}</span>${f.recebeTudo ? ' (ainda não cota nada: vai a cotação inteira)' : ''}</summary>
            <div class="convite-itens">
              ${dele.length ? dele.map(caixa).join('') : '<span class="text-muted">Não cota nenhum item dessa cotação.</span>'}
              ${outros.length ? `<span class="convite-itens-outros">Outros itens da cotação</span>${outros.map(caixa).join('')}` : ''}
            </div>
          </details>
        </li>`;
      }).join('')}
      ${jaTem.map((f) => `<li class="text-muted">${escaparHtml(f.fornecedorNome)} — já tem convite nessa cotação</li>`).join('')}
    </ul>
  `;
  alvo.querySelectorAll('[data-convite-detalhe]').forEach((detalhe) => {
    detalhe.addEventListener('toggle', () => {
      const id = parseInt(detalhe.dataset.conviteDetalhe, 10);
      if (detalhe.open) conviteFornecedoresAbertos.add(id);
      else conviteFornecedoresAbertos.delete(id);
    });
  });
  alvo.querySelectorAll('[data-convite-fornecedor]').forEach((caixa) => {
    caixa.addEventListener('change', () => {
      const id = parseInt(caixa.dataset.conviteFornecedor, 10);
      const conjunto = selecaoItensConvite.get(id);
      if (caixa.checked) conjunto.add(parseInt(caixa.value, 10));
      else conjunto.delete(parseInt(caixa.value, 10));
      // Redesenha pra atualizar os totais, mantendo aberto quem estava aberto.
      conviteFornecedoresAbertos.add(id);
      renderPreviaConvite();
    });
  });
}

function _textoContagemConvite(n) {
  if (!n) return 'nenhum item marcado (fica sem convite)';
  return `${n} ${n === 1 ? 'item' : 'itens'} no link`;
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

// Envio de todos os convites pela extensão do Chrome (card #26, decisão do
// chefe em 2026-09-18: "se a VMarket já faz e nunca deu problema, bora"). A
// extensão lê a lista em #fila-whatsapp quando alguém clica no botão e manda
// um fornecedor por vez pelo WhatsApp Web; aqui só se monta a lista e se
// mostra o botão quando a extensão está instalada (ela marca o <html> com
// data-admfood-extensao ao carregar).
let enviadosPeloWhatsapp = new Set();

// "1.0.10" > "1.0.9": compara número a número, não como texto.
function _compararVersoes(a, b) {
  const pa = String(a || '').split('.').map(Number);
  const pb = String(b || '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diferenca = (pa[i] || 0) - (pb[i] || 0);
    if (diferenca) return diferenca > 0 ? 1 : -1;
  }
  return 0;
}

function _versaoExtensaoInstalada() {
  return document.documentElement.dataset.admfoodExtensao || null;
}

// O botão de cada linha só existe a partir da versão 1.0.1 da extensão; com a
// 1.0.0 (carregada antes de atualizar) o clique não faria nada.
function _extensaoEnviaUmPorUm() {
  const instalada = _versaoExtensaoInstalada();
  return !!instalada && _compararVersoes(instalada, '1.0.1') >= 0;
}

// Instalada à mão, a extensão não se atualiza sozinha: a versão mais nova é a
// que está no servidor (manifest da pasta extensao-whatsapp). Busca uma vez.
let versaoMaisNovaExtensao = null;
function _buscarVersaoMaisNovaExtensao() {
  if (!versaoMaisNovaExtensao) {
    versaoMaisNovaExtensao = fetch('/api/extensao-whatsapp/versao')
      .then((resposta) => (resposta.ok ? resposta.json() : null))
      .then((dados) => dados?.versao || null)
      .catch(() => null);
  }
  return versaoMaisNovaExtensao;
}

// Página "Extensão do WhatsApp": diz se está instalada e se está em dia.
async function renderStatusExtensao() {
  const quadro = document.querySelector('.extensao-status');
  if (!quadro) return;
  const instalada = _versaoExtensaoInstalada();
  const maisNova = await _buscarVersaoMaisNovaExtensao();
  const texto = document.getElementById('extensao-status-texto');
  const detalhe = document.getElementById('extensao-status-detalhe');
  const botao = document.getElementById('btn-baixar-extensao-texto');
  quadro.classList.remove('ok', 'antiga');
  if (!instalada) {
    texto.textContent = 'Não instalada';
    detalhe.textContent = 'Siga os passos abaixo.';
    botao.textContent = maisNova ? `Baixar a extensão (versão ${maisNova})` : 'Baixar a extensão';
  } else if (maisNova && _compararVersoes(instalada, maisNova) < 0) {
    quadro.classList.add('antiga');
    texto.textContent = `Instalada, versão ${instalada} — tem a ${maisNova}`;
    detalhe.textContent = 'Veja como atualizar, lá embaixo.';
    botao.textContent = `Baixar a versão ${maisNova}`;
  } else {
    quadro.classList.add('ok');
    texto.textContent = `Instalada, versão ${instalada}`;
    detalhe.textContent = 'Está em dia.';
    botao.textContent = 'Baixar de novo';
  }
}

if (document.querySelector('.extensao-status')) {
  // A extensão marca a página quando carrega, às vezes depois deste script.
  document.addEventListener('admfood:extensao-pronta', () => renderStatusExtensao());
  renderStatusExtensao();
  setTimeout(renderStatusExtensao, 1500);
}

function _atualizarEnvioWhatsappConvites() {
  const botao = document.getElementById('btn-enviar-cotacoes');
  const fila = document.getElementById('fila-whatsapp');
  if (!botao || !fila) return;
  const agora = new Date();
  const itens = convitesCotacaoAtuais
    .filter((c) => c.status === 'aberta' && new Date(c.prazoValidade) >= agora && c.fornecedorTelefone)
    .map((c) => {
      const link = `${location.origin}/preencher_cotacao.html?token=${c.token}`;
      return {
        id: c.id,
        fornecedor: c.fornecedorNome,
        telefone: c.fornecedorTelefone,
        mensagem: `Olá! Segue o link pra você preencher os preços da nossa cotação:\n${link}`,
      };
    });
  fila.textContent = JSON.stringify(itens);
  const temExtensao = !!document.documentElement.dataset.admfoodExtensao;
  botao.hidden = !(temExtensao && itens.length && _possoGerir());
  document.getElementById('btn-enviar-cotacoes-texto').textContent =
    `Enviar ${itens.length === 1 ? 'o convite' : `os ${itens.length} convites`} pelo WhatsApp`;
  document.getElementById('convites-extensao-aviso').hidden = temExtensao || !itens.length || !_possoGerir();
  const avisoAtualizar = document.getElementById('convites-extensao-atualizar');
  if (avisoAtualizar) {
    avisoAtualizar.hidden = true;
    if (temExtensao && _possoGerir()) {
      _buscarVersaoMaisNovaExtensao().then((maisNova) => {
        avisoAtualizar.hidden = !(maisNova && _compararVersoes(_versaoExtensaoInstalada(), maisNova) < 0);
      });
    }
  }
}

// A extensão avisa quando carrega (pode ser depois da tela) e a cada
// fornecedor enviado: a linha dele ganha "enviado".
document.addEventListener('admfood:extensao-pronta', () => {
  if (convitesCotacaoAtuais.length) renderConvitesCotacao(convitesCotacaoAtuais);
  else _atualizarEnvioWhatsappConvites();
});
document.addEventListener('admfood:envio-whatsapp', (evento) => {
  try {
    const resumo = JSON.parse(evento.detail);
    (resumo.itens || []).filter((i) => i.status === 'enviado' && i.id).forEach((i) => enviadosPeloWhatsapp.add(i.id));
    if (convitesCotacaoAtuais.length) renderConvitesCotacao(convitesCotacaoAtuais);
  } catch (erro) {
    console.error('Resumo do envio pelo WhatsApp inválido:', erro);
  }
});

function renderConvitesCotacao(convites) {
  convitesCotacaoAtuais = convites;
  const card = document.getElementById('cotacao-convites-card');
  const tbody = document.getElementById('cotacao-convites-tabela-body');
  if (!card || !tbody) return;

  card.style.display = convites.length ? '' : 'none';
  _atualizarEnvioWhatsappConvites();
  if (!convites.length) return;

  // Com a extensão, o botão da linha manda aquele convite sozinho (pedido
  // dela, 18/09); convite respondido ou vencido fica com "Abrir no WhatsApp",
  // o manual, pra conversar com o fornecedor. Sem a extensão, tudo manual.
  const comExtensao = !!document.documentElement.dataset.admfoodExtensao;
  const envioPorLinha = _extensaoEnviaUmPorUm();
  tbody.innerHTML = convites.map((c) => {
    const expirado = c.status === 'aberta' && new Date(c.prazoValidade) < new Date();
    const statusTexto = expirado ? 'Prazo vencido' : STATUS_LABEL_CONVITE[c.status];
    const statusClasse = c.status === 'respondida' ? 'pos' : (expirado ? 'neg' : 'neu-orange');
    const link = `${location.origin}/preencher_cotacao.html?token=${c.token}`;
    const linkWhatsApp = _linkWhatsAppConvite(c.fornecedorTelefone, c.fornecedorNome, link);
    return `
      <tr>
        <td class="font-bold">${escaparHtml(c.fornecedorNome)}${enviadosPeloWhatsapp.has(c.id) ? ' <span class="badge-pill pos" title="Mandado agora pela extensão do WhatsApp">enviado</span>' : ''}</td>
        <td><span class="badge-pill ${statusClasse}">${statusTexto}</span></td>
        <td class="text-muted">${new Date(c.prazoValidade).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
        <td class="col-acoes"><div class="acoes-linha">
          ${linkWhatsApp && envioPorLinha && c.status === 'aberta' && !expirado ? `
            <button type="button" class="btn-secondary-sm" data-admfood-envio="${c.id}"
                    title="A extensão manda sozinha pelo WhatsApp Web, só pra esse fornecedor">
              <i data-lucide="send"></i>
              Enviar o convite pelo WhatsApp
            </button>
          ` : linkWhatsApp ? `
            <a class="btn-secondary-sm" href="${escaparHtml(linkWhatsApp)}" target="_blank" rel="noopener"
               title="Abre a conversa com a mensagem pronta; você aperta enviar no WhatsApp">
              <i data-lucide="${comExtensao ? 'external-link' : 'send'}"></i>
              ${comExtensao ? 'Abrir no WhatsApp' : 'Enviar por WhatsApp'}
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
        </div></td>
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
  // O que ficou marcado no link de cada um (2026-09-21).
  const itensPorFornecedor = {};
  fornecedorIds.forEach((id) => {
    if (selecaoItensConvite.has(id)) itensPorFornecedor[id] = [...selecaoItensConvite.get(id)];
  });
  try {
    const resposta = await fetch(`/api/cotacoes/${cotacaoAtualId}/convites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prazoValidade, fornecedorIds, itensPorFornecedor }),
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
    // Cada fornecedor recebe só o que ele fornece: vale dizer quantos itens.
    const criados = dados.convites || [];
    if (criados.length) {
      mensagem += '\n\nItens no link de cada um: '
        + criados.map((c) => `${c.fornecedorNome} (${c.totalInsumos})`).join(', ') + '.';
    }
    if ((dados.fornecedoresSemItens || []).length) {
      mensagem += '\n\nSem convite, porque nenhum insumo dessa cotação é fornecido por eles: '
        + dados.fornecedoresSemItens.join(', ') + '.';
    }
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

// Ignora o CNPJ que veio grudado no nome na carga da VMarket ("43.118.957
// GUILHERME NUNES" vira GN) e os ligamentos e sufixos de razão social.
const PALAVRAS_IGNORADAS_FORNECEDOR = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'em', 'ltda', 'me', 'epp', 'eireli', 'sa']);

function _iniciaisFornecedor(nome) {
  const palavras = String(nome).replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  const uteis = palavras.filter((p) => /^\p{L}/u.test(p) && !PALAVRAS_IGNORADAS_FORNECEDOR.has(p.toLowerCase()));
  const escolhidas = uteis.length ? uteis : palavras;
  if (!escolhidas.length) return '?';
  if (escolhidas.length === 1) return escolhidas[0].slice(0, 2).toUpperCase();
  return (escolhidas[0][0] + escolhidas[1][0]).toUpperCase();
}

// Paleta fixa pra dar uma cor de avatar diferente por fornecedor (estilo
// VMarket, print da Julia 2026-09-04) — determinística pelo id, não muda
// de cor a cada render.
const PALETA_AVATAR_FORNECEDOR = ['#2563EB', '#B45309', '#7C3AED', '#0F766E', '#BE185D', '#52525B', '#4338CA', '#0369A1'];
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
          ${isAdmin && !catalogoCompleto
            ? `<button type="button" class="btn-limpar-filtro btn-tirar-item-cotacao" data-acao="tirar-item-cotacao" data-insumo-id="${linha.insumoId}" data-nome="${escaparHtml(linha.insumoNome)}" title="Tirar esse item da cotação">tirar da cotação</button>`
            : ''}
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
    // "tirar da cotação" (2026-09-21): item que ninguém vai cotar (ex.: a lata).
    container.querySelectorAll('[data-acao="tirar-item-cotacao"]').forEach((btn) => {
      btn.addEventListener('click', async (evento) => {
        evento.stopPropagation();
        if (!confirm(`Tirar "${btn.dataset.nome}" dessa cotação? Ele some dos links dos fornecedores e não entra nos pedidos dela.`)) return;
        try {
          const resposta = await fetch(`/api/cotacoes/${cotacaoAtualId}/itens/${btn.dataset.insumoId}`, { method: 'DELETE' });
          const dados = await resposta.json().catch(() => ({}));
          if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível tirar o item.');
          await abrirCotacaoDetalhe(cotacaoAtualId);
        } catch (erro) {
          alert(erro.message);
        }
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

// Gerar o pedido não manda nada pro fornecedor: até clicar em "Enviar por
// WhatsApp", o primeiro estágio aparece como pendente (Julia, 2026-09-11).
function _pedidoPendenteDeEnvio(p) {
  return p.status === 'enviado' && !p.whatsappEnviadoEm;
}

function _rotuloEstagioPedido(p, estagio) {
  return estagio === 'enviado' && _pedidoPendenteDeEnvio(p) ? 'Pendente de envio (WhatsApp)' : ESTAGIO_LABEL_PEDIDO[estagio];
}

async function _marcarPedidoEnviadoWhatsApp(pedidoId) {
  try {
    await fetch(`/api/pedidos/${pedidoId}/whatsapp-enviado`, { method: 'POST' });
  } catch (erro) {
    console.error('Falha ao marcar pedido como enviado:', erro);
  }
}

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
    carregarContadoresMenuCompras();
  } catch (erro) {
    console.error('Falha ao carregar pedidos:', erro);
    tbody.innerHTML = `<tr><td colspan="7" style="color:var(--danger-texto);">Não foi possível carregar os pedidos. Confira se o Flask está rodando.</td></tr>`;
  }
}

function renderPedidosTabela() {
  const tbody = document.getElementById('pedidos-tabela-body');
  if (!tbody) return;

  if (!pedidosLista.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="panel-subtitle">Nenhum pedido gerado ainda — feche uma cotação com vencedor escolhido e clique em "Gerar pedidos".</td></tr>`;
    return;
  }

  // Filtro de período (2026-09-17, com o histórico inteiro da VMarket): pedido
  // ainda não recebido fica sempre, é ele que conta nos números do menu.
  const inicio = _inicioDoPeriodo(document.getElementById('pedidos-filtro-periodo')?.value);
  const lista = pedidosLista.filter((p) => p.status !== 'recebido' || !inicio || p.criadoEm.slice(0, 10) >= inicio);
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="panel-subtitle">Nenhum pedido nesse período. Escolha um período maior pra ver os mais antigos.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map((p) => `
    <tr>
      <td class="font-bold">${escaparHtml(p.fornecedorNome)}</td>
      <td>${escaparHtml(p.loja)}</td>
      <td class="text-muted">${escaparHtml(p.cotacaoTitulo)}</td>
      <td>${p.totalItens}</td>
      <td>R$ ${p.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}${p.abaixoDoMinimo ? ' <span class="badge-pill neu-orange" title="Abaixo do pedido mínimo do fornecedor">abaixo do mínimo</span>' : ''}</td>
      <td>
        <span class="badge-pill ${_pedidoPendenteDeEnvio(p) ? 'neg' : STATUS_CLASSE_BADGE_PEDIDO[p.status]}">${_rotuloEstagioPedido(p, p.status)}</span>
        ${p.status === 'recebido' && p.recebidoEm ? `<div class="text-muted" style="font-size:0.8em; margin-top:4px;">em ${_dataBR(p.recebidoEm)}</div>` : ''}
      </td>
      <td class="col-acoes"><div class="acoes-linha">
        ${pedidosWhatsAppLinks[p.id] ? `
          <a class="btn-acao-icone" href="${escaparHtml(pedidosWhatsAppLinks[p.id])}" target="_blank" rel="noopener" title="Enviar pedido por WhatsApp" data-acao="enviar-pedido-whatsapp" data-id="${p.id}">
            <i data-lucide="send"></i>
          </a>
        ` : ''}
        <button type="button" class="btn-acao-icone" data-acao="abrir-pedido" data-id="${p.id}" title="Ver itens e acompanhar entrega">
          <i data-lucide="arrow-right"></i>
        </button>
      </div></td>
    </tr>
  `).join('');

  document.querySelectorAll('[data-acao="abrir-pedido"]').forEach(btn => {
    btn.addEventListener('click', () => abrirPedidoDetalhe(parseInt(btn.dataset.id, 10)));
  });

  // O link abre o WhatsApp numa aba nova (sem bloquear o clique); aqui só
  // marca o pedido como enviado e atualiza a lista.
  document.querySelectorAll('[data-acao="enviar-pedido-whatsapp"]').forEach(link => {
    link.addEventListener('click', async () => {
      await _marcarPedidoEnviadoWhatsApp(link.dataset.id);
      await carregarPedidos();
    });
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
  if (p.compraFora) {
    const partes = [`Compra feita por fora em ${_dataBR(p.recebidoEm)}${p.recebidoPor ? ` por ${p.recebidoPor}` : ''}`];
    if (p.numeroNf) partes.push(`Nota fiscal ${p.numeroNf}`);
    if (p.valorNf != null) partes.push(`valor da nota R$ ${_formatarMoedaBR(p.valorNf)}`);
    if (!p.somouEstoque) partes.push('não somou no estoque');
    document.getElementById('pedido-detalhe-subtitulo').textContent = partes.join(' · ');
  } else {
    const recebimento = p.status === 'recebido' && p.recebidoEm
      ? ` · Recebido em ${_dataBR(p.recebidoEm)}${p.recebidoPor ? ` por ${p.recebidoPor}` : ''}`
      : '';
    const nota = p.numeroNf ? ` · Nota fiscal ${p.numeroNf}` : '';
    document.getElementById('pedido-detalhe-subtitulo').textContent = `Cotação: ${p.cotacaoTitulo}${recebimento}${nota}`;
  }

  const linkNota = document.getElementById('link-pedido-nota-fiscal');
  if (linkNota) {
    linkNota.href = p.notaFiscalUrl || '#';
    linkNota.style.display = p.notaFiscalUrl ? '' : 'none';
  }
  // A nota costuma chegar depois da entrega: pedido já recebido aceita anexo
  // (ou troca do que está lá) a qualquer momento.
  const btnAnexarNota = document.getElementById('btn-pedido-anexar-nota');
  if (btnAnexarNota) {
    const podeAnexar = _possoGerir() && p.status === 'recebido';
    btnAnexarNota.style.display = podeAnexar ? '' : 'none';
    document.getElementById('btn-pedido-anexar-nota-texto').textContent =
      p.notaFiscalUrl ? 'Trocar nota fiscal' : 'Anexar nota fiscal';
  }
  // Compra por fora já nasce recebida: sem etapas de entrega pra acompanhar.
  document.getElementById('pedido-estagios-card').style.display = p.compraFora ? 'none' : '';

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
  if (p.abaixoDoMinimo && !p.compraFora) {
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
        <div class="pedido-estagio-texto">${escaparHtml(_rotuloEstagioPedido(p, estagio))}</div>
      </div>
      ${linha}
    `;
  }).join('');

  const isAdmin = _possoGerir();
  const btnCancelar = document.getElementById('btn-pedido-cancelar');
  btnCancelar.style.display = isAdmin ? '' : 'none';
  btnCancelar.textContent = p.compraFora ? 'Excluir compra' : 'Cancelar pedido';

  const btnAvancar = document.getElementById('btn-pedido-avancar');
  const ultimoEstagio = indiceAtual >= pedidoEstagios.length - 1;
  btnAvancar.style.display = isAdmin && !p.compraFora ? '' : 'none';
  btnAvancar.disabled = ultimoEstagio;
  btnAvancar.textContent = ultimoEstagio ? 'Entrega concluída' : `Avançar pra "${ESTAGIO_LABEL_PEDIDO[pedidoEstagios[indiceAtual + 1]]}"`;

  const btnVoltarEtapa = document.getElementById('btn-pedido-voltar-etapa');
  const primeiroEstagio = indiceAtual <= 0;
  btnVoltarEtapa.style.display = isAdmin && !p.compraFora ? '' : 'none';
  btnVoltarEtapa.disabled = primeiroEstagio;
  btnVoltarEtapa.textContent = primeiroEstagio ? 'Voltar etapa' : `Voltar pra "${ESTAGIO_LABEL_PEDIDO[pedidoEstagios[indiceAtual - 1]]}"`;

  const itensBody = document.getElementById('pedido-itens-body');
  // Preço por kg/L nos insumos em grama/ml; até 4 casas (item barato por unidade).
  const precoPorUnidade = (item) => {
    const { rotulo, fator } = _escalaDeCusto(item.unidadeMedida);
    return `R$ ${_formatarPrecoUnitario(item.precoUnitario * fator)}/${escaparHtml(rotulo)}`;
  };
  itensBody.innerHTML = p.itens.map((item) => `
    <tr>
      <td class="font-bold">${escaparHtml(item.nome)}</td>
      <td>${_formatarQuantidade(item.quantidade, item.unidadeMedida)}</td>
      <td>${precoPorUnidade(item)}</td>
      <td>R$ ${item.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
    </tr>
  `).join('');
  document.getElementById('pedido-detalhe-total').textContent = `R$ ${p.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

document.getElementById('pedidos-filtro-periodo')?.addEventListener('change', renderPedidosTabela);

document.getElementById('btn-pedido-voltar')?.addEventListener('click', () => {
  document.getElementById('pedido-detalhe-view').style.display = 'none';
  document.getElementById('pedidos-lista-view').style.display = '';
  pedidoDetalheAtual = null;
  carregarPedidos();
});

// Mesmo esquema do ícone da lista: o link abre o WhatsApp, aqui só marca.
document.getElementById('link-pedido-whatsapp')?.addEventListener('click', async () => {
  if (!pedidoDetalheAtual) return;
  await _marcarPedidoEnviadoWhatsApp(pedidoDetalheAtual.id);
  pedidoDetalheAtual.whatsappEnviadoEm = new Date().toISOString();
  renderPedidoDetalhe();
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
  const pergunta = p.compraFora
    ? `Excluir a compra de "${p.fornecedorNome}" pra "${p.loja}"?${p.somouEstoque ? ' As quantidades saem do estoque da loja.' : ''}${p.notaFiscalUrl ? ' A nota anexada também é apagada.' : ''} Essa ação não pode ser desfeita.`
    : `Cancelar o pedido de "${p.fornecedorNome}" pra "${p.loja}"? Essa ação não pode ser desfeita — os insumos dele voltam a ficar disponíveis pra gerar um pedido novo a partir da mesma cotação.`;
  if (!confirm(pergunta)) return;
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
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger-texto);">Não foi possível carregar as contagens. Confira se o Flask está rodando.</td></tr>`;
  }
}

const STATUS_LABEL_CONTAGEM = { aberta: 'Aberta', respondida: 'Aguardando conferência', aprovada: 'Aprovada' };
const STATUS_CLASSE_CONTAGEM = { aberta: 'neu-orange', respondida: 'pos', aprovada: 'pos' };

function renderContagensTabela() {
  const isAdmin = _possoGerir();
  const tbody = document.getElementById('contagens-tabela-body');
  if (!tbody) return;

  const thAcoes = document.getElementById('contagens-th-acoes');
  if (thAcoes) thAcoes.style.display = isAdmin ? '' : 'none';
  const acoesTopo = document.getElementById('contagens-acoes-admin');
  if (acoesTopo) acoesTopo.style.display = isAdmin ? '' : 'none';

  const colspan = 5 + (isAdmin ? 1 : 0);
  if (!contagensLista.length) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="panel-subtitle">Nenhuma requisição criada ainda.</td></tr>`;
    return;
  }
  // Mesmo período da tabela de Requisições, logo acima.
  const inicio = _inicioDoPeriodo(document.getElementById('requisicoes-filtro-periodo')?.value);
  const lista = contagensLista.filter((c) => !inicio || c.criadoEm.slice(0, 10) >= inicio);
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="panel-subtitle">Nenhuma requisição nesse período.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map((c) => {
    const prazo = new Date(c.prazoValidade).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `
      <tr>
        <td class="font-bold">${escaparHtml(c.loja)}</td>
        <td class="text-muted">${escaparHtml(c.descricao) || '—'}</td>
        <td>${c.itensPreenchidos} de ${c.totalItens}</td>
        <td class="text-muted">${prazo}</td>
        <td><span class="badge-pill ${STATUS_CLASSE_CONTAGEM[c.status]}">${STATUS_LABEL_CONTAGEM[c.status]}</span></td>
        ${isAdmin ? `
          <td class="col-acoes"><div class="acoes-linha">
            <button type="button" class="btn-acao-icone" data-acao="abrir-contagem" data-id="${c.id}" title="Ver/conferir requisição">
              <i data-lucide="arrow-right"></i>
            </button>
          </div></td>
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
  const isAdmin = _possoGerir();

  document.getElementById('contagem-detalhe-titulo').textContent = `${c.loja} — ${c.descricao || 'Requisição'}`;

  const acoes = document.getElementById('contagem-detalhe-acoes-admin');
  const btnAprovar = document.getElementById('btn-contagem-aprovar');
  const btnReabrir = document.getElementById('btn-contagem-reabrir');
  if (acoes) acoes.style.display = isAdmin ? '' : 'none';
  if (btnAprovar) {
    btnAprovar.disabled = c.status === 'aberta';
    btnAprovar.textContent = c.status === 'aprovada' ? 'Conferir a compra' : 'Aprovar e conferir a compra';
  }
  if (btnReabrir) btnReabrir.style.display = (isAdmin && c.status !== 'aberta') ? '' : 'none';

  const thAcoes = document.getElementById('contagem-detalhe-th-acoes');
  if (thAcoes) thAcoes.style.display = isAdmin ? '' : 'none';

  const tbody = document.getElementById('contagem-detalhe-tabela-body');
  tbody.innerHTML = c.itens.map((item) => {
    const preenchido = item.quantidadePreenchida;
    const ideal = item.quantidadeIdeal;
    // Decidido na conferência ("O que comprar") ganha da conta do sistema.
    const decidido = item.quantidadeCompra !== null && item.quantidadeCompra !== undefined;
    const deficit = decidido
      ? item.quantidadeCompra
      : ((preenchido !== null && ideal !== null) ? arredondarQuantidadeCompra(ideal - preenchido, item.fatorConversaoCompra) : null);
    return `
      <tr>
        <td class="font-bold">${escaparHtml(item.nome)}</td>
        <td class="text-muted">${escaparHtml(item.categoria)}</td>
        <td>${preenchido === null ? '<span class="text-muted">não preenchido</span>' : `${_formatarQuantidade(preenchido, item.unidadeMedida)}`}</td>
        <td>${ideal === null ? '<span class="text-muted">—</span>' : `${_formatarQuantidade(ideal, item.unidadeMedida)}`}${item.quantidadeIdealAjustada ? ' <span class="badge-pill neu-orange" title="Ajustado manualmente">ajustado</span>' : ''}</td>
        <td>${deficit === null ? '<span class="text-muted">—</span>' : (deficit > 0 ? `<span class="badge-pill neg">comprar ${_formatarQuantidade(deficit, item.unidadeMedida)}</span>` : '—')}${decidido ? ' <span class="badge-pill neu-orange" title="Quantidade decidida em O que comprar, na conferência da requisição">conferência</span>' : ''}</td>
        ${isAdmin ? `
          <td class="col-acoes"><div class="acoes-linha">
            <button type="button" class="btn-acao-icone" data-acao="ajustar-ideal" data-insumo-id="${item.insumoId}" title="Ajustar quantidade ideal">
              <i data-lucide="pencil"></i>
            </button>
          </div></td>
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
  if (!jaAprovada && !confirm('Aprovar essa loja? As quantidades preenchidas vão substituir o estoque atual dela. Com todas as lojas aprovadas, você confere quanto comprar de cada item antes de gerar a cotação.')) return;
  try {
    if (!jaAprovada) {
      const resposta = await fetch(`/api/contagens/${contagemDetalheAtual.id}/aprovar`, { method: 'POST' });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'falha ao aprovar');
    }

    // A compra não sai mais direto daqui (2026-09-21): com todas as lojas
    // aprovadas, a compradora confere e muda o que quiser em "O que comprar",
    // na conferência da requisição, e é de lá que sai a cotação/pedido.
    const titulo = contagemDetalheAtual.descricao;
    const prazoValidade = contagemDetalheAtual.prazoValidade;
    if (jaAprovada) {
      await abrirConferenciaRequisicao(titulo, prazoValidade);
      return;
    }
    const conferencia = await fetch(`/api/requisicoes/conferencia?titulo=${encodeURIComponent(titulo)}&prazoValidade=${encodeURIComponent(prazoValidade)}`).then(r => r.json());
    if (conferencia.totalmenteAprovada) {
      alert('Todas as lojas aprovadas! Agora confira em "O que comprar" quanto comprar de cada item e clique em "Gerar cotação".');
      await abrirConferenciaRequisicao(titulo, prazoValidade);
      return;
    }
    const faltam = conferencia.totalLojas - conferencia.lojasAprovadas;
    alert(`Loja aprovada! Ainda falta${faltam > 1 ? 'm' : ''} ${faltam} loja${faltam > 1 ? 's' : ''} aprovar antes de conferir a compra.`);
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
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger-texto);">Não foi possível carregar as requisições. Confira se o Flask está rodando.</td></tr>`;
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

  const colspan = 4 + (isAdmin ? 1 : 0);
  if (!requisicoesLista.length) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="panel-subtitle">Nenhuma requisição criada ainda.</td></tr>`;
    return;
  }
  // Filtro de período (2026-09-17, com o histórico inteiro da VMarket).
  const inicio = _inicioDoPeriodo(document.getElementById('requisicoes-filtro-periodo')?.value);
  if (inicio && !requisicoesLista.some((r) => r.criadoEm.slice(0, 10) >= inicio)) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="panel-subtitle">Nenhuma requisição nesse período. Escolha um período maior pra ver as mais antigas.</td></tr>`;
    return;
  }

  // O índice continua sendo o da lista inteira: os botões buscam por ele.
  tbody.innerHTML = requisicoesLista.map((r, indice) => {
    if (inicio && r.criadoEm.slice(0, 10) < inicio) return '';
    const prazo = new Date(r.prazoValidade).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const status = _statusRequisicao(r);
    return `
      <tr>
        <td class="font-bold">${escaparHtml(r.titulo) || '—'}</td>
        <td>${r.lojasRespondidas} de ${r.totalLojas} responderam</td>
        <td class="text-muted">${prazo}</td>
        <td><span class="badge-pill ${status.classe}">${status.texto}</span></td>
        ${isAdmin ? `
          <td class="col-acoes"><div class="acoes-linha">
            <button type="button" class="btn-acao-icone" data-acao="abrir-requisicao" data-indice="${indice}" title="Ver conferência somada">
              <i data-lucide="arrow-right"></i>
            </button>
            <button type="button" class="btn-acao-icone btn-excluir" data-acao="excluir-requisicao" data-indice="${indice}" title="Excluir só essa requisição">
              <i data-lucide="trash-2"></i>
            </button>
          </div></td>
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

document.getElementById('requisicoes-filtro-periodo')?.addEventListener('change', () => {
  renderRequisicoesTabela();
  renderContagensTabela();
});

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
  const btnReaplicar = document.getElementById('btn-requisicao-reaplicar-homologados');
  if (btnReaplicar) btnReaplicar.style.display = r.podeAtualizarHomologados ? '' : 'none';
  if (btnGerarCotacao) {
    btnGerarCotacao.disabled = !r.totalmenteAprovada;
    btnGerarCotacao.innerHTML = `<i data-lucide="file-text"></i> ${r.jaGerada ? 'Ver cotação/pedidos' : 'Gerar cotação'}`;
  }

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
        <td class="col-acoes"><div class="acoes-linha">
          <button type="button" class="btn-acao-icone" data-acao="abrir-contagem-da-requisicao" data-id="${c.id}" title="Ver/conferir essa loja">
            <i data-lucide="arrow-right"></i>
          </button>
        </div></td>
      </tr>
    `;
  }).join('');
  lojasBody.querySelectorAll('[data-acao="abrir-contagem-da-requisicao"]').forEach((btn) => {
    btn.addEventListener('click', () => abrirContagemDetalhe(parseInt(btn.dataset.id, 10)));
  });

  _renderCompraConferencia(r);

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --- "O que comprar" na Conferência (2026-09-21, pedido dela) ---
// Cada loja traz a sugestão do sistema (o que falta pro ideal, pra cima na
// embalagem) e a compradora muda o que quiser: 0 tira o item, qualquer
// número coloca, até item sem estoque mínimo. "Gerar cotação" usa exatamente
// esses números. "Vai pra" mostra antes se sai em pedido direto pro
// homologado ou se vai pra cotação — nada some sem ela ver.
const minimosJaPerguntados = new Set();
const _numeroBR = (valor) => Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
// No campo, sem ponto de milhar ("1000", "7,5"), pra editar sem confusão.
const _numeroCampo = (valor) => Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false });

// "7,5" e "7.5" = 7,5 (o ponto do teclado numérico é decimal: "0.250" é
// 0,25, nunca 250). Com vírgula, os pontos são de milhar ("1.000,5").
// Vazio = 0; NaN se não for número.
function _lerNumeroBR(texto) {
  const limpo = String(texto).trim().replace(/\s/g, '');
  if (!limpo) return 0;
  if (limpo.includes(',')) return Number(limpo.replace(/\./g, '').replace(',', '.'));
  return Number(limpo);
}

function _valorCampoCompra(l) {
  if (l.ideal === null && !l.editado && !l.minimoGuardado) return '';
  return _numeroCampo(l.comprar);
}

function _referenciaCompra(item, l) {
  const unidade = item.unidadeMedida;
  const contado = l.contado === null ? 'não contou' : `contou ${_formatarQuantidade(l.contado, unidade)}`;
  if (l.minimoGuardado) return `${contado} · mínimo ${_formatarQuantidade(l.minimoGuardado, unidade)} guardado`;
  if (l.ideal === null) return `${contado} · sem estoque mínimo`;
  return `${contado} · ideal ${_formatarQuantidade(l.ideal, unidade)}`;
}

function _botaoSugestaoHTML(item, l, bloqueado) {
  if (bloqueado || !l.editado || l.sugestao === null || l.comprar === l.sugestao) return '';
  return `<button type="button" class="comprar-sugestao" tabindex="-1" data-contagem="${l.contagemId}" data-insumo="${item.insumoId}">usar sugestão (${_formatarQuantidade(l.sugestao, item.unidadeMedida)})</button>`;
}

function _celulaCompraHTML(item, l, bloqueado) {
  const semMinimo = l.ideal === null && !l.minimoGuardado;
  return `
    <div class="comprar-cel${semMinimo ? ' sem-minimo' : ''}${l.editado ? ' editado' : ''}" data-contagem="${l.contagemId}" data-insumo="${item.insumoId}">
      <label class="comprar-campo">
        <input type="text" inputmode="decimal" class="comprar-input" value="${_valorCampoCompra(l)}" placeholder="${semMinimo ? 'quanto?' : '0'}"
          data-contagem="${l.contagemId}" data-insumo="${item.insumoId}" ${bloqueado ? 'disabled' : ''}
          aria-label="Comprar ${escaparHtml(item.nome)} para ${escaparHtml(l.loja)}">
        <span>${escaparHtml(item.unidadeMedida || '')}</span>
      </label>
      <span class="comprar-ref">${escaparHtml(_referenciaCompra(item, l))}</span>
      <span class="comprar-acoes">${_botaoSugestaoHTML(item, l, bloqueado)}</span>
    </div>`;
}

function _totalCompraHTML(item) {
  const total = Math.round((item.lojas || []).reduce((soma, l) => soma + (l.comprar || 0), 0) * 100) / 100;
  return total > 0
    ? `<span class="badge-pill neg">${_formatarQuantidade(total, item.unidadeMedida)}</span>`
    : '<span class="text-muted">não compra</span>';
}

function _destinoCompraHTML(item) {
  // Requisição já gerada: onde o item está e o que muda no "Ver cotação/pedidos".
  if (requisicaoConferenciaAtual?.jaGerada && (item.lojas || []).some((l) => l.situacao)) {
    const rotulos = new Map();
    item.lojas.forEach((l) => {
      const s = l.situacao;
      if (!s) return;
      if (s.tipo === 'pedido') rotulos.set(`p${s.pedidoId}`, `<span class="destino-compra feito" title="Já está nesse pedido">Pedido nº ${s.pedidoId} · ${escaparHtml(s.fornecedor)}</span>`);
      else if (s.tipo === 'vaiPraPedido') rotulos.set(`v${s.fornecedor}`, `<span class="destino-compra pedido" title="Ganhou fornecedor homologado: vira pedido quando você clicar em Ver cotação/pedidos">Vai virar pedido · ${escaparHtml(s.fornecedor)}</span>`);
      else if (s.tipo === 'cotacao') rotulos.set('c', '<span class="destino-compra cotacao">Na cotação</span>');
      else rotulos.set('vc', '<span class="destino-compra cotacao" title="Entra na cotação quando você clicar em Ver cotação/pedidos">Vai pra cotação</span>');
    });
    return [...rotulos.values()].join('<br>');
  }
  // Por loja: cada loja pode ter homologado diferente (ou nenhum).
  const lojasCompra = (item.lojas || []).filter((l) => l.comprar > 0);
  if (!lojasCompra.length) return '<span class="text-muted">—</span>';
  const rotulos = new Map();
  lojasCompra.forEach((l) => {
    if (l.fornecedorHomologado) {
      rotulos.set(`p${l.fornecedorHomologado}`, `<span class="destino-compra pedido" title="Fornecedor homologado com preço combinado nessa loja: sai direto em pedido, sem cotação">Pedido · ${escaparHtml(l.fornecedorHomologado)}</span>`);
    } else {
      rotulos.set('c', '<span class="destino-compra cotacao">Cotação</span>');
    }
  });
  return [...rotulos.values()].join('<br>');
}

function _atualizarResumoCompraConferencia(r) {
  const resumo = document.getElementById('requisicao-conferencia-itens-resumo');
  if (!resumo) return;
  if (r.jaGerada) {
    resumo.textContent = r.pendentes
      ? `Essa requisição já virou cotação/pedido. ${r.pendentes} item(ns) mudaram de destino (veja "Vai pra"): isso é aplicado quando você clicar em "Ver cotação/pedidos".`
      : 'Essa requisição já virou cotação/pedido, então as quantidades ficaram travadas. Clique em "Ver cotação/pedidos" pra abrir.';
    return;
  }
  const vaoPraCompra = r.itens.filter((i) => i.lojas.some((l) => l.comprar > 0));
  const emPedido = vaoPraCompra.filter((i) => i.lojas.every((l) => !(l.comprar > 0) || l.fornecedorHomologado)).length;
  const semDecisao = r.itens.filter((i) => i.lojas.some((l) => l.ideal === null && !l.editado && !l.minimoGuardado)).length;
  const partes = [`${vaoPraCompra.length} ${vaoPraCompra.length === 1 ? 'item vai' : 'itens vão'} pra compra (${emPedido} em pedido direto, ${vaoPraCompra.length - emPedido} pra cotação)`];
  if (semDecisao) partes.push(`${semDecisao} sem estoque mínimo, em amarelo, esperando você decidir`);
  resumo.textContent = `${partes.join(' · ')}. Cada loja já vem com a sugestão do sistema; mude o que quiser, 0 tira o item.`;
}

function _renderCompraConferencia(r) {
  const head = document.getElementById('requisicao-conferencia-itens-head');
  const body = document.getElementById('requisicao-conferencia-itens-body');
  if (!head || !body) return;
  const lojas = r.contagens.map((c) => c.loja);
  const bloqueado = !!r.jaGerada;
  head.innerHTML = `<tr><th>Insumo</th>${lojas.map((loja) => `<th>${escaparHtml(loja)}</th>`).join('')}<th class="col-total-compra">Total</th><th class="col-destino-compra">Vai pra</th></tr>`;
  body.innerHTML = r.itens.map((item) => {
    const porLoja = Object.fromEntries((item.lojas || []).map((l) => [l.loja, l]));
    return `
      <tr data-insumo="${item.insumoId}">
        <td class="conferencia-insumo">
          <span class="font-bold">${escaparHtml(item.nome)}</span>${item.curvaAbc === 'A'
            ? ' <span class="badge-pill neu-orange" title="Curva A: esse insumo concentra boa parte do gasto de compra — confira antes de gerar">conferir</span>'
            : ''}
          <span class="conferencia-categoria">${escaparHtml(item.categoria || '')}</span>
        </td>
        ${lojas.map((loja) => `<td>${porLoja[loja] ? _celulaCompraHTML(item, porLoja[loja], bloqueado) : '<span class="text-muted">—</span>'}</td>`).join('')}
        <td class="col-total-compra" data-total-insumo="${item.insumoId}">${_totalCompraHTML(item)}</td>
        <td class="col-destino-compra" data-destino-insumo="${item.insumoId}">${_destinoCompraHTML(item)}</td>
      </tr>`;
  }).join('');
  _atualizarResumoCompraConferencia(r);
  body.querySelectorAll('.comprar-input').forEach((input) => {
    input.addEventListener('change', () => _salvarCompraConferencia(input));
  });
  body.querySelectorAll('.comprar-sugestao').forEach((botao) => {
    botao.addEventListener('click', () => _voltarSugestaoConferencia(botao));
  });
}

function _compraDaConferencia(contagemId, insumoId) {
  const item = requisicaoConferenciaAtual?.itens.find((i) => i.insumoId === insumoId);
  const l = item?.lojas.find((x) => x.contagemId === contagemId);
  return { item, l };
}

// Atualiza só a célula mexida (e o total da linha): recriar a tabela tiraria
// o foco do próximo campo, e a Ket vai de campo em campo no Tab.
function _atualizarCelulaCompra(item, l) {
  const celula = document.querySelector(`.comprar-cel[data-contagem="${l.contagemId}"][data-insumo="${item.insumoId}"]`);
  if (celula) {
    celula.classList.toggle('editado', l.editado);
    celula.classList.toggle('sem-minimo', l.ideal === null && !l.minimoGuardado);
    const input = celula.querySelector('.comprar-input');
    if (document.activeElement !== input) input.value = _valorCampoCompra(l);
    celula.querySelector('.comprar-ref').textContent = _referenciaCompra(item, l);
    const acoes = celula.querySelector('.comprar-acoes');
    acoes.innerHTML = _botaoSugestaoHTML(item, l, false);
    acoes.querySelector('.comprar-sugestao')?.addEventListener('click', (evento) => _voltarSugestaoConferencia(evento.currentTarget));
  }
  const total = document.querySelector(`[data-total-insumo="${item.insumoId}"]`);
  if (total) total.innerHTML = _totalCompraHTML(item);
  const destino = document.querySelector(`[data-destino-insumo="${item.insumoId}"]`);
  if (destino) destino.innerHTML = _destinoCompraHTML(item);
  _atualizarResumoCompraConferencia(requisicaoConferenciaAtual);
}

async function _gravarCompraConferencia(contagemId, insumoId, quantidade) {
  const resposta = await fetch('/api/requisicoes/conferencia/comprar', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contagemId, insumoId, quantidade }),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível salvar a quantidade.');
}

async function _salvarCompraConferencia(input) {
  const contagemId = parseInt(input.dataset.contagem, 10);
  const insumoId = parseInt(input.dataset.insumo, 10);
  const { item, l } = _compraDaConferencia(contagemId, insumoId);
  if (!item || !l) return;
  const quantidade = _lerNumeroBR(input.value);
  if (!Number.isFinite(quantidade) || quantidade < 0) {
    alert('Digite uma quantidade de 0 pra cima.');
    input.value = _valorCampoCompra(l);
    return;
  }
  const referencia = Math.max(l.ideal || 0, l.sugestao || 0, l.contado || 0);
  if (referencia > 0 && quantidade > referencia * 10
    && !confirm(`Comprar ${_numeroBR(quantidade)} ${item.unidadeMedida || ''} de "${item.nome}" em ${l.loja}? É bem mais que o normal pra esse item (${_numeroBR(referencia)}).`)) {
    input.value = _valorCampoCompra(l);
    return;
  }
  try {
    await _gravarCompraConferencia(contagemId, insumoId, quantidade);
  } catch (erro) {
    alert(erro.message);
    input.value = _valorCampoCompra(l);
    return;
  }
  l.comprar = quantidade;
  l.editado = true;
  input.value = _valorCampoCompra(l);
  _atualizarCelulaCompra(item, l);
  if (l.ideal === null && !l.minimoGuardado && quantidade > 0) {
    await _perguntarMinimoConferencia(item, l);
    _atualizarCelulaCompra(item, l);
  }
}

async function _voltarSugestaoConferencia(botao) {
  const contagemId = parseInt(botao.dataset.contagem, 10);
  const insumoId = parseInt(botao.dataset.insumo, 10);
  const { item, l } = _compraDaConferencia(contagemId, insumoId);
  if (!item || !l) return;
  try {
    await _gravarCompraConferencia(contagemId, insumoId, null);
  } catch (erro) {
    alert(erro.message);
    return;
  }
  l.editado = false;
  l.comprar = l.sugestao ?? 0;
  _atualizarCelulaCompra(item, l);
}

// Item sem estoque mínimo que ganhou quantidade: oferece guardar um mínimo
// pra loja (uma vez por item), sugerindo contado + comprado — o nível que
// ela quis ter. Assim os itens sem mínimo vão se acertando a cada compra.
async function _perguntarMinimoConferencia(item, l) {
  const chave = `${l.loja}|${item.insumoId}`;
  if (minimosJaPerguntados.has(chave)) return;
  minimosJaPerguntados.add(chave);
  const contado = l.contado || 0;
  const sugerido = Math.round((contado + l.comprar) * 100) / 100;
  const resposta = prompt(
    `"${item.nome}" não tem estoque mínimo em ${l.loja}.\n\n`
    + 'Quer guardar um mínimo? Assim ele já entra na sugestão das próximas contagens.\n'
    + `Sugestão: ${_numeroBR(sugerido)} (${_numeroBR(contado)} contados + ${_numeroBR(l.comprar)} que você vai comprar).\n\n`
    + 'Deixe o número que quiser e clique em OK, ou em Cancelar pra não guardar.',
    _numeroCampo(sugerido),
  );
  if (resposta === null) return;
  const minimo = _lerNumeroBR(resposta);
  if (!Number.isFinite(minimo) || minimo <= 0) {
    alert('O mínimo não foi guardado: digite um número maior que 0.');
    return;
  }
  try {
    const respostaMinimo = await fetch(`/api/insumos/${item.insumoId}/estoque/${encodeURIComponent(l.loja)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estoqueMinimo: minimo }),
    });
    const dados = await respostaMinimo.json().catch(() => ({}));
    if (!respostaMinimo.ok) throw new Error(dados.erro || 'Não foi possível guardar o mínimo.');
    l.minimoGuardado = minimo;
  } catch (erro) {
    alert(erro.message);
  }
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

// Resultado de "Fazer Cotação/Pedido" (2026-09-16): o que tem fornecedor
// homologado já sai em pedido direto; o resto vira cotação. Sem cotação (tudo
// homologado), quem abre é a tela de Pedidos.
function _textoResultadoRequisicao(dados) {
  const pedidos = (dados.pedidosDiretos || []).length;
  const partes = [];
  if (dados.cotacaoId) partes.push('a cotação foi aberta com o que precisa de preço');
  if (pedidos) partes.push(`${pedidos} ${pedidos > 1 ? 'pedidos diretos saíram' : 'pedido direto saiu'} pros fornecedores homologados, pra enviar pelo WhatsApp em Pedidos`);
  return partes.join(' e ');
}

function _destinoResultadoRequisicao(dados) {
  return dados.cotacaoId ? `cotacoes.html?abrir=${dados.cotacaoId}` : 'pedidos.html';
}

// Avisa quais insumos ficaram de fora da cotação por não terem quantidade
// ideal calculável ainda — antes sumiam da lista sem ninguém perceber, só
// descobrindo bem depois que aquele insumo nunca entrou num pedido.
function _avisoInsumosSemIdeal(insumosSemIdeal) {
  if (!insumosSemIdeal || !insumosSemIdeal.length) return '';
  const nomes = insumosSemIdeal.map((i) => (i.loja ? `${i.nome} (${i.loja})` : i.nome)).join(', ');
  return `\n\nAtenção: ${insumosSemIdeal.length} insumo(s) ficaram de fora por não terem estoque mínimo nem quantidade digitada em "O que comprar": ${nomes}.`;
}

// "Atualizar com os homologados" (2026-09-21): requisição já gerada, mas os
// homologados foram acertados depois. Quem tem homologado vira pedido direto
// e sai da cotação; o resto fica, com os preços que já chegaram.
document.getElementById('btn-requisicao-reaplicar-homologados')?.addEventListener('click', async () => {
  const r = requisicaoConferenciaAtual;
  if (!r) return;
  // Só atualiza a tabela (pedido dela, 2026-09-21): o pedido sai no "Ver
  // cotação/pedidos".
  await abrirConferenciaRequisicao(r.titulo, r.prazoValidade);
  const atual = requisicaoConferenciaAtual;
  alert(atual?.pendentes
    ? `Tabela atualizada. ${atual.pendentes} item(ns) mudaram de destino — veja a coluna "Vai pra". Os pedidos saem quando você clicar em "Ver cotação/pedidos".`
    : 'Tabela atualizada. Nada mudou de destino.');
});

// "Ver cotação/pedidos" numa requisição já gerada com item que mudou de
// destino (homologado configurado depois): confirma, grava e abre Pedidos.
async function _aplicarMudancasDaRequisicao(r) {
  const pedidos = new Map();
  const cotacao = new Set();
  r.itens.forEach((item) => item.lojas.forEach((l) => {
    if (l.situacao?.tipo === 'vaiPraPedido') {
      pedidos.set(l.situacao.fornecedor, [...(pedidos.get(l.situacao.fornecedor) || []), item.nome]);
    } else if (l.situacao?.tipo === 'vaiPraCotacao') {
      cotacao.add(item.nome);
    }
  }));
  const partes = [];
  if (pedidos.size) partes.push(`Vão sair em pedido:\n${[...pedidos].map(([f, nomes]) => `• ${f}: ${[...new Set(nomes)].join(', ')}`).join('\n')}`);
  if (cotacao.size) partes.push(`Vão pra cotação: ${[...cotacao].join(', ')}.`);
  if (!confirm(`${partes.join('\n\n')}\n\nConfirmar?`)) return false;
  {
    const resposta = await fetch('/api/requisicoes/conferencia/reaplicar-homologados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: r.titulo, prazoValidade: r.prazoValidade }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível atualizar a compra.');
    const partes = [];
    if (dados.pedidos.length) {
      const linhas = dados.pedidos.map((p) => `• ${p.novo ? `Pedido novo nº ${p.id}` : `Entrou no pedido nº ${p.id}`} — ${p.fornecedor} (${p.loja}): ${p.itens.join(', ')}`);
      partes.push(`Pedidos (envie pelo WhatsApp em Pedidos):\n${linhas.join('\n')}`);
    }
    if (dados.saiuDaCotacao.length) partes.push(`Saíram da cotação: ${dados.saiuDaCotacao.join(', ')}.`);
    if (dados.entrouNaCotacao.length) partes.push(`Entraram na cotação: ${dados.entrouNaCotacao.join(', ')}. Foram pros links ainda abertos de quem vende; se ninguém for cotar, lance o preço à mão em "Lançar preço".`);
    alert(partes.length ? `Pronto!\n\n${partes.join('\n\n')}` : 'Nada mudou: a compra já está de acordo com os homologados de agora.');
    window.location.href = dados.pedidos.length ? 'pedidos.html' : _destinoResultadoRequisicao({ cotacaoId: dados.cotacaoId });
    return true;
  }
}

document.getElementById('btn-requisicao-gerar-cotacao')?.addEventListener('click', async () => {
  const r = requisicaoConferenciaAtual;
  if (!r || !r.totalmenteAprovada) return;
  if (r.jaGerada && r.pendentes) {
    try {
      await _aplicarMudancasDaRequisicao(r);
    } catch (erro) {
      console.error('Falha ao aplicar as mudanças da requisição:', erro);
      alert(erro.message || 'Não foi possível gerar os pedidos.');
    }
    return;
  }
  if (!r.jaGerada) {
    const semDecisao = r.itens.reduce((n, i) => n + i.lojas.filter((l) => l.ideal === null && !l.editado && !l.minimoGuardado).length, 0);
    const aviso = semDecisao ? `\n\nAtenção: ${semDecisao} campo(s) em amarelo (sem estoque mínimo) estão sem quantidade; esses itens não entram por essas lojas.` : '';
    if (!confirm(`Gerar a compra com as quantidades de "O que comprar"? O que está como "Pedido" sai direto pro fornecedor homologado; o que está como "Cotação" vai pra cotação, que ainda dá pra editar antes de mandar pros fornecedores.${aviso}`)) return;
  }
  try {
    const resposta = await fetch('/api/requisicoes/conferencia/gerar-cotacao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: r.titulo, prazoValidade: r.prazoValidade }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao gerar cotação');
    const aviso = _avisoInsumosSemIdeal(dados.insumosSemIdeal);
    const pedidosDiretos = (dados.pedidosDiretos || []).length;
    if (pedidosDiretos || aviso) alert(`${pedidosDiretos ? `Pronto: ${_textoResultadoRequisicao(dados)}.` : ''}${aviso}`.trim());
    window.location.href = _destinoResultadoRequisicao(dados);
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
  // Cadastro novo: escolhe as lojas (já vem marcada a da aba aberta). Na
  // edição, as lojas mudam em "Insumos da loja".
  const grupoLojas = document.getElementById('novo-insumo-lojas-grupo');
  if (grupoLojas) {
    grupoLojas.style.display = insumo ? 'none' : '';
    document.getElementById('novo-insumo-lojas').innerHTML = LOJAS_ESTOQUE.map((loja) => `
      <label class="checklist-item">
        <input type="checkbox" name="novo-insumo-loja" value="${escaparHtml(loja)}" ${estoqueTabAtual === loja ? 'checked' : ''}>
        ${escaparHtml(loja)}
      </label>
    `).join('');
  }
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
  // Fornecedores que cotam e homologado são por loja (2026-09-21): na edição,
  // valem pra loja da aba aberta; na Visão geral não dá pra editar aqui.
  const lojaDaAba = LOJAS_ESTOQUE.includes(estoqueTabAtual) ? estoqueTabAtual : null;
  const avisoLoja = document.getElementById('novo-insumo-aviso-loja');
  const blocoFornecedores = document.getElementById('novo-insumo-bloco-fornecedores');
  const naLoja = insumo && lojaDaAba ? (insumo.porLoja?.[lojaDaAba] || {}) : null;
  if (insumo && !lojaDaAba) {
    blocoFornecedores.style.display = 'none';
    avisoLoja.style.display = '';
    avisoLoja.textContent = 'Fornecedores e homologado são de cada loja: escolha a loja no seletor de cima pra mudar.';
  } else {
    blocoFornecedores.style.display = '';
    avisoLoja.style.display = insumo ? '' : 'none';
    avisoLoja.textContent = insumo ? `Fornecedores e homologado abaixo valem só pra ${lojaDaAba}.` : '';
  }
  _renderChecklistFornecedores(naLoja ? naLoja.fornecedorIds : []);
  _renderFornecedorHomologado(naLoja ? { ...insumo, ...naLoja } : null);
  document.getElementById('modal-novo-insumo').style.display = 'flex';
}

function _atualizarRotuloCustoInsumo() {
  const { rotulo } = _escalaDeCusto(document.getElementById('novo-insumo-unidade').value);
  document.getElementById('novo-insumo-custo-rotulo').textContent = `Custo (R$ por ${rotulo})`;
}

// O custo digitado perde no CMV (custo_em_uso_por_insumo em armazenamento.py)
// pra cotação e compra recebida dos últimos 90 dias e pra receita de mistura.
// Por isso a tela diz qual está valendo — senão ela digitaria um custo e
// acharia que não funcionou.
function _textoCustoEmUso(insumo) {
  const emUso = insumo.custoEmUso;
  if (!emUso) return 'Sem custo no CMV ainda: os produtos que usam este insumo ficam sem CMV até ele ter um.';
  const valor = _formatarCustoPorUnidade(emUso.valor, insumo.unidadeMedida);
  // Com ano: o histórico da VMarket traz preço de 2025.
  const data = emUso.data ? _dataBR(emUso.data) : '';
  if (emUso.origem === 'cotacao') {
    return `Valendo no CMV: ${valor}, da cotação de ${data}. Cotação e compra recebida dos últimos 90 dias passam na frente do custo digitado.`;
  }
  if (emUso.origem === 'compra') {
    const quem = emUso.fornecedor ? `${emUso.fornecedor}, ${data}` : data;
    return `Valendo no CMV: ${valor}, da última compra recebida (${quem}). Compra recebida dos últimos 90 dias passa na frente do custo digitado.`;
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
  const precoHomologadoDigitado = document.getElementById('novo-insumo-preco-homologado').value;
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
    // Com fornecedor homologado, a Requisição manda o insumo direto em pedido pra ele.
    fornecedorHomologadoId: document.getElementById('novo-insumo-fornecedor-homologado').value,
    precoHomologado: precoHomologadoDigitado === '' ? '' : parseFloat(precoHomologadoDigitado) / _escalaDeCusto(unidadeMedida).fator,
    validadePrecoHomologado: document.getElementById('novo-insumo-validade-homologado').value,
  };
  if (insumoId) {
    // Edição: fornecedores e homologado só da loja da aba (na Visão geral nem vão).
    if (LOJAS_ESTOQUE.includes(estoqueTabAtual)) {
      corpo.loja = estoqueTabAtual;
    } else {
      delete corpo.fornecedorIds;
      delete corpo.fornecedorHomologadoId;
      delete corpo.precoHomologado;
      delete corpo.validadePrecoHomologado;
    }
  }
  if (!insumoId) {
    corpo.lojas = Array.from(document.querySelectorAll('input[name="novo-insumo-loja"]:checked')).map((el) => el.value);
    if (!corpo.lojas.length) {
      alert('Marque pelo menos uma loja que usa esse insumo.');
      return;
    }
  }
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
    document.getElementById('insumos-loja-tabela-body').innerHTML = '<tr><td colspan="3" style="color:var(--danger-texto);">Não foi possível carregar.</td></tr>';
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

// "2026-09-14T15:01:07" → "14/09/2026", direto do texto: new Date() num
// "AAAA-MM-DD" sem hora lê como UTC e mostraria o dia anterior.
function _dataBR(iso) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—';
}

// Hoje no fuso de quem usa — toISOString() dá o dia em UTC, que depois das
// 21h já é amanhã.
function _hojeLocalISO() {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Primeiro dia ('AAAA-MM-DD', no fuso de quem usa) dos últimos `dias` dias,
// hoje incluso; vazio = sem corte. Filtro de período de Pedidos e Requisições.
function _inicioDoPeriodo(dias) {
  const n = parseInt(dias, 10);
  if (!n) return '';
  const inicio = new Date(Date.now() - (n - 1) * 86400000);
  return new Date(inicio.getTime() - inicio.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

async function carregarRecebimentos() {
  const tbody = document.getElementById('recebimentos-tabela-body');
  if (!tbody) return;
  try {
    const resposta = await fetch('/api/recebimentos');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    recebimentosLista = dados.pedidos || [];
    renderRecebimentosTabela();
    carregarContadoresMenuCompras();
  } catch (erro) {
    console.error('Falha ao carregar recebimentos:', erro);
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger-texto);">Não foi possível carregar os pedidos. Confira se o Flask está rodando.</td></tr>`;
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
      _dataBR(p.criadoEm).includes(termo) ||
      (p.itensNomes || '').toLowerCase().includes(termo) ||
      String(p.valorTotal).includes(termo) ||
      _formatarMoedaBR(p.valorTotal).includes(termo)
    );
  });

  if (!linhas.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="panel-subtitle">${recebimentosLista.length ? 'Nenhum pedido bate com essa busca.' : 'Nenhum pedido aguardando recebimento.'}</td></tr>`;
    return;
  }

  tbody.innerHTML = linhas.map((p) => `
    <tr>
      <td class="font-bold">${escaparHtml(p.fornecedorNome)}</td>
      <td>${escaparHtml(p.loja)}</td>
      <td class="text-muted">${_dataBR(p.criadoEm)}</td>
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

document.getElementById('btn-pedido-anexar-nota')?.addEventListener('click', () => {
  document.getElementById('input-pedido-nota').click();
});

document.getElementById('input-pedido-nota')?.addEventListener('change', async (evento) => {
  const arquivo = evento.target.files[0];
  evento.target.value = '';  // deixa escolher o mesmo arquivo de novo depois de um erro
  if (!arquivo || !pedidoDetalheAtual) return;
  if (await _anexarNotaFiscal(pedidoDetalheAtual.id, arquivo)) {
    await abrirPedidoDetalhe(pedidoDetalheAtual.id);
  }
});

async function _anexarNotaFiscal(pedidoId, arquivo, numeroNf) {
  const TAMANHO_MAXIMO = 15 * 1024 * 1024;
  if (arquivo && arquivo.size > TAMANHO_MAXIMO) {
    alert('A nota fiscal passa de 15 MB.');
    return false;
  }
  const corpo = new FormData();
  if (arquivo) corpo.append('notaFiscal', arquivo);
  if (numeroNf != null) corpo.append('numeroNf', numeroNf);
  try {
    const resposta = await fetch(`/api/pedidos/${pedidoId}/nota-fiscal`, { method: 'POST', body: corpo });
    const dados = await resposta.json();
    if (!resposta.ok) {
      alert(dados.erro || 'Não foi possível anexar a nota fiscal.');
      return false;
    }
    return true;
  } catch (erro) {
    console.error('Falha ao anexar nota fiscal:', erro);
    return false;
  }
}

async function abrirModalRecebimento(pedidoId) {
  try {
    const resposta = await fetch(`/api/recebimentos/${pedidoId}`);
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao carregar pedido');
    recebimentoAtual = dados;

    document.getElementById('recebimento-titulo').textContent = `Confirmar recebimento — ${dados.fornecedorNome} (${dados.loja})`;
    document.getElementById('recebimento-nome').value = window.usuarioLogado?.nome || '';
    // Entre o dia do pedido e hoje — a mesma regra que o servidor confere.
    const campoData = document.getElementById('recebimento-data');
    campoData.min = dados.criadoEm.slice(0, 10);
    campoData.max = _hojeLocalISO();
    campoData.value = campoData.max;
    document.getElementById('recebimento-data-pedido').textContent = `Pedido feito em ${_dataBR(dados.criadoEm)}`;
    document.getElementById('recebimento-valor-nf').value = dados.valorTotal;
    document.getElementById('recebimento-numero-nf').value = '';
    document.getElementById('recebimento-nota-arquivo').value = '';
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
        recebidoEm: document.getElementById('recebimento-data').value,
        valorNf: parseFloat(document.getElementById('recebimento-valor-nf').value),
        numeroNf: document.getElementById('recebimento-numero-nf').value.trim(),
        itens,
      }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'falha ao confirmar recebimento');

    // O estoque já entrou; se o anexo falhar, o recebimento continua valendo e
    // a nota pode ser anexada depois pela tela do pedido.
    const arquivo = document.getElementById('recebimento-nota-arquivo').files[0];
    const anexoFalhou = arquivo ? !(await _anexarNotaFiscal(recebimentoAtual.id, arquivo)) : false;

    fecharModalRecebimento();
    await carregarRecebimentos();
    alert([
      dados.divergencia
        ? 'Recebimento confirmado, estoque atualizado. O valor da Nota Fiscal não bateu com o calculado — uma tarefa foi criada no ClickUp pra acompanhar.'
        : 'Recebimento confirmado — estoque atualizado.',
      anexoFalhou
        ? `A nota fiscal não subiu; ${_possoGerir() ? 'dá pra anexar depois abrindo o pedido' : 'avise o gerente pra anexar pela tela do pedido'}.`
        : '',
    ].filter(Boolean).join('\n\n'));
  } catch (erroCatch) {
    console.error('Falha ao confirmar recebimento:', erroCatch);
    erro.textContent = erroCatch.message || 'Não foi possível confirmar o recebimento.';
    erro.style.display = '';
  }
});

// --- FORNECEDOR HOMOLOGADO E PEDIDO DIRETO (2026-09-16) ---
// Na VMarket boa parte dos pedidos saía direto, pelo preço já combinado com o
// fornecedor. Aqui o fornecedor homologado e o preço ficam no cadastro do
// insumo; a Requisição manda esses insumos direto em pedido, e "Novo pedido"
// em Pedidos usa o mesmo preço pra um pedido extra.
const LOJA_CURTA = { 'Hamburgueria Artesanos': 'Artesanos', 'Açaí Na Lata': 'Açaí', 'Tradiça ZN': 'Tradiça ZN', 'Tradiça Simus': 'Tradiça Simus' };
let insumosParaPreco = null;    // /api/insumos, carregado na primeira vez que o "Novo pedido" abre
let pedidoDiretoFornecedorId = null;
let pedidoDiretoTodasLojas = false;
let fornecedoresPedidoDireto = [];

// Preço de unidade pode ter mais de 2 casas (guardanapo a R$ 0,0525).
function _formatarPrecoUnitario(valor) {
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

// Mesma regra do servidor (_homologados_validos): fornecedor, preço e validade
// em branco ou de hoje em diante — por loja desde 2026-09-21.
function _homologadoValidoNaLoja(insumo, loja, fornecedorId) {
  const p = insumo.porLoja?.[loja];
  return !!p && !!p.fornecedorHomologadoId && p.precoHomologado > 0
    && (!fornecedorId || p.fornecedorHomologadoId === fornecedorId)
    && (!p.validadePrecoHomologado || p.validadePrecoHomologado >= _hojeLocalISO());
}

function _lojasHomologadasDoFornecedor(insumo, fornecedorId) {
  return LOJAS_ESTOQUE.filter((loja) => _homologadoValidoNaLoja(insumo, loja, fornecedorId));
}

async function _carregarInsumosParaPreco(forcar = false) {
  if (insumosParaPreco && !forcar) return insumosParaPreco;
  const resposta = await fetch('/api/insumos');
  if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
  insumosParaPreco = (await resposta.json()).insumos || [];
  return insumosParaPreco;
}

// Insumos → modal do insumo: select do fornecedor homologado + preço e validade.
// O preço é digitado como o custo (por kg/litro quando o insumo é em grama/ml).
function _renderFornecedorHomologado(insumo) {
  const select = document.getElementById('novo-insumo-fornecedor-homologado');
  if (!select) return;
  const atual = insumo?.fornecedorHomologadoId || null;
  const opcoes = fornecedoresLista
    .filter((f) => f.ativo || f.id === atual)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  select.innerHTML = '<option value="">Nenhum, vai pra cotação</option>'
    + opcoes.map((f) => `<option value="${f.id}" ${f.id === atual ? 'selected' : ''}>${escaparHtml(f.nome)}</option>`).join('');
  const { fator } = _escalaDeCusto(insumo ? insumo.unidadeMedida : 'un');
  document.getElementById('novo-insumo-preco-homologado').value = insumo && insumo.precoHomologado != null
    ? _arredondarQuantidade(insumo.precoHomologado * fator)
    : '';
  document.getElementById('novo-insumo-validade-homologado').value = insumo?.validadePrecoHomologado || '';
  _atualizarCamposHomologado();
}

function _atualizarCamposHomologado() {
  const select = document.getElementById('novo-insumo-fornecedor-homologado');
  if (!select) return;
  const escolhido = !!select.value;
  document.getElementById('novo-insumo-homologado-campos').style.display = escolhido ? '' : 'none';
  document.getElementById('novo-insumo-homologado-ajuda').style.display = escolhido ? '' : 'none';
  document.getElementById('novo-insumo-preco-homologado').required = escolhido;
  const { rotulo } = _escalaDeCusto(document.getElementById('novo-insumo-unidade').value);
  document.getElementById('novo-insumo-preco-homologado-rotulo').textContent = `Preço combinado (R$ por ${rotulo})`;
}

document.getElementById('novo-insumo-fornecedor-homologado')?.addEventListener('change', _atualizarCamposHomologado);
document.getElementById('novo-insumo-unidade')?.addEventListener('input', _atualizarCamposHomologado);

// Pedidos → "Novo pedido" pelo preço homologado (pedido extra, fora da Requisição)
async function abrirNovoPedidoDireto() {
  const select = document.getElementById('pedido-direto-fornecedor');
  pedidoDiretoFornecedorId = null;
  pedidoDiretoTodasLojas = false;
  document.getElementById('pedido-direto-erro').style.display = 'none';
  document.getElementById('pedido-direto-subtitulo').textContent = '';
  document.getElementById('pedido-direto-itens').innerHTML = '';
  document.getElementById('pedido-direto-tabela-wrap').style.display = 'none';
  document.getElementById('btn-pedido-direto-todas-lojas').style.display = 'none';
  document.getElementById('btn-pedido-direto-gerar').disabled = true;
  select.innerHTML = '<option value="">Carregando fornecedores...</option>';
  document.getElementById('modal-pedido-direto').style.display = 'flex';
  try {
    const [respostaFornecedores] = await Promise.all([fetch('/api/fornecedores'), _carregarInsumosParaPreco(true)]);
    fornecedoresPedidoDireto = (await respostaFornecedores.json()).fornecedores || [];
    const itensPorFornecedor = new Map();
    insumosParaPreco.forEach((insumo) => {
      const deQuem = new Set(LOJAS_ESTOQUE.filter((loja) => _homologadoValidoNaLoja(insumo, loja)).map((loja) => insumo.porLoja[loja].fornecedorHomologadoId));
      deQuem.forEach((id) => itensPorFornecedor.set(id, (itensPorFornecedor.get(id) || 0) + 1));
    });
    const opcoes = fornecedoresPedidoDireto
      .filter((f) => f.ativo && itensPorFornecedor.has(f.id))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    if (!opcoes.length) {
      select.innerHTML = '<option value="">Nenhum fornecedor homologado</option>';
      document.getElementById('pedido-direto-subtitulo').textContent = 'Escolha o fornecedor homologado e o preço combinado no cadastro do insumo, em Insumos.';
      return;
    }
    select.innerHTML = '<option value="">Escolha o fornecedor</option>' + opcoes.map((f) => {
      const n = itensPorFornecedor.get(f.id);
      return `<option value="${f.id}">${escaparHtml(f.nome)} (${n} ${n > 1 ? 'itens' : 'item'})</option>`;
    }).join('');
  } catch (erro) {
    console.error('Falha ao abrir novo pedido:', erro);
    select.innerHTML = '<option value="">Não foi possível carregar</option>';
  }
}

// Colunas de loja: as lojas que já compram desse fornecedor (cadastro dele);
// sem nenhuma marcada, todas. "Pedir pra outras lojas também" abre as quatro.
function _lojasPedidoDireto() {
  const fornecedor = fornecedoresPedidoDireto.find((f) => f.id === pedidoDiretoFornecedorId);
  const lojasDele = (fornecedor?.lojas || []).filter((l) => LOJAS_ESTOQUE.includes(l));
  if (pedidoDiretoTodasLojas || !lojasDele.length) return LOJAS_ESTOQUE;
  return LOJAS_ESTOQUE.filter((l) => lojasDele.includes(l));
}

function renderPedidoDireto() {
  const wrap = document.getElementById('pedido-direto-tabela-wrap');
  if (!pedidoDiretoFornecedorId) {
    wrap.style.display = 'none';
    document.getElementById('btn-pedido-direto-todas-lojas').style.display = 'none';
    document.getElementById('pedido-direto-subtitulo').textContent = '';
    document.getElementById('btn-pedido-direto-gerar').disabled = true;
    return;
  }
  const doFornecedor = insumosParaPreco
    .filter((i) => Object.values(i.porLoja || {}).some((p) => p.fornecedorHomologadoId === pedidoDiretoFornecedorId))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const itens = doFornecedor.filter((i) => _lojasHomologadasDoFornecedor(i, pedidoDiretoFornecedorId).length);
  const vencidos = doFornecedor.length - itens.length;
  const lojas = _lojasPedidoDireto();
  // Re-render (abrir outras lojas) não pode apagar o que já foi digitado.
  const digitado = {};
  document.querySelectorAll('#pedido-direto-itens input').forEach((input) => {
    if (input.value) digitado[`${input.dataset.insumoId}|${input.dataset.loja}`] = input.value;
  });

  document.getElementById('pedido-direto-subtitulo').textContent =
    'Digite quanto cada loja precisa. Vale o preço combinado, sai um pedido por loja e uma mensagem só de WhatsApp pro fornecedor.'
    + (vencidos ? ` ${vencidos} ${vencidos > 1 ? 'insumos com preço vencido ficaram' : 'insumo com preço vencido ficou'} de fora.` : '');
  document.getElementById('pedido-direto-cabecalho').innerHTML =
    `<tr><th>Insumo</th><th>Preço</th>${lojas.map((l) => `<th>${escaparHtml(LOJA_CURTA[l] || l)}</th>`).join('')}</tr>`;

  document.getElementById('pedido-direto-itens').innerHTML = itens.map((insumo) => {
    const lojasDele = _lojasHomologadasDoFornecedor(insumo, pedidoDiretoFornecedorId);
    const precos = [...new Set(lojasDele.map((loja) => insumo.porLoja[loja].precoHomologado))];
    const colunas = lojas.map((loja) => {
      const estoque = insumo.porLoja?.[loja];
      if (!lojasDele.includes(loja)) {
        return '<td><span class="pedido-direto-estoque">não homologado nessa loja</span></td>';
      }
      const precoLoja = insumo.porLoja[loja].precoHomologado;
      const info = estoque && estoque.aplica
        ? `tem ${_formatarQuantidade(estoque.quantidadeAtual, insumo.unidadeMedida)} · mín ${_formatarQuantidade(estoque.estoqueMinimo, insumo.unidadeMedida)}`
        : 'não usa hoje';
      const valor = digitado[`${insumo.id}|${loja}`] || '';
      return `
        <td>
          <input type="number" min="0" step="any" value="${escaparHtml(valor)}" data-insumo-id="${insumo.id}" data-loja="${escaparHtml(loja)}" data-preco="${precoLoja}" aria-label="${escaparHtml(insumo.nome)}, ${escaparHtml(loja)}">
          <span class="pedido-direto-estoque">${info}</span>
        </td>`;
    }).join('');
    return `
      <tr>
        <td class="font-bold">${escaparHtml(insumo.nome)}</td>
        <td class="preco-combinado-valor">${precos.length === 1 ? `R$ ${_formatarPrecoUnitario(precos[0])}` : 'varia por loja'}<span class="pedido-direto-estoque">por ${escaparHtml(insumo.unidadeMedida)}</span></td>
        ${colunas}
      </tr>`;
  }).join('');

  wrap.style.display = '';
  document.getElementById('btn-pedido-direto-todas-lojas').style.display = lojas.length < LOJAS_ESTOQUE.length ? '' : 'none';
  document.querySelectorAll('#pedido-direto-itens input').forEach((input) => {
    input.addEventListener('input', _atualizarTotaisPedidoDireto);
  });
  _atualizarTotaisPedidoDireto();
}

function _atualizarTotaisPedidoDireto() {
  const lojas = _lojasPedidoDireto();
  const fornecedor = fornecedoresPedidoDireto.find((f) => f.id === pedidoDiretoFornecedorId);
  const minimo = fornecedor?.pedidoMinimo || 0;
  const totais = Object.fromEntries(lojas.map((l) => [l, 0]));
  document.querySelectorAll('#pedido-direto-itens input').forEach((input) => {
    const quantidade = parseFloat(input.value) || 0;
    if (quantidade > 0) totais[input.dataset.loja] += quantidade * parseFloat(input.dataset.preco);
  });
  const geral = Object.values(totais).reduce((soma, valor) => soma + valor, 0);
  const reais = (valor) => `R$ ${_formatarMoedaBR(Math.round(valor * 100) / 100)}`;
  // O pedido mínimo do fornecedor vale por loja, não somado (q29).
  document.getElementById('pedido-direto-totais').innerHTML = `
    <tr>
      <td class="font-bold">Total</td>
      <td class="font-bold">${reais(geral)}</td>
      ${lojas.map((loja) => `<td class="font-bold">${totais[loja] > 0
        ? `${reais(totais[loja])}${minimo > 0 && totais[loja] < minimo ? `<span class="pedido-direto-abaixo">abaixo do mínimo de ${reais(minimo)}</span>` : ''}`
        : '<span class="text-muted">—</span>'}</td>`).join('')}
    </tr>`;
  document.getElementById('btn-pedido-direto-gerar').disabled = geral <= 0;
}

function fecharNovoPedidoDireto() {
  document.getElementById('modal-pedido-direto').style.display = 'none';
  pedidoDiretoFornecedorId = null;
}

document.getElementById('btn-novo-pedido-direto')?.addEventListener('click', abrirNovoPedidoDireto);
document.getElementById('btn-pedido-direto-fechar')?.addEventListener('click', fecharNovoPedidoDireto);
document.getElementById('btn-pedido-direto-cancelar')?.addEventListener('click', fecharNovoPedidoDireto);
document.getElementById('pedido-direto-fornecedor')?.addEventListener('change', (evento) => {
  pedidoDiretoFornecedorId = parseInt(evento.target.value, 10) || null;
  pedidoDiretoTodasLojas = false;
  document.getElementById('pedido-direto-itens').innerHTML = '';
  renderPedidoDireto();
});
document.getElementById('btn-pedido-direto-todas-lojas')?.addEventListener('click', () => {
  pedidoDiretoTodasLojas = true;
  renderPedidoDireto();
});

document.getElementById('form-pedido-direto')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const erro = document.getElementById('pedido-direto-erro');
  erro.style.display = 'none';
  const itens = Array.from(document.querySelectorAll('#pedido-direto-itens input'))
    .map((input) => ({ insumoId: parseInt(input.dataset.insumoId, 10), loja: input.dataset.loja, quantidade: parseFloat(input.value) || 0 }))
    .filter((item) => item.quantidade > 0);
  const botao = document.getElementById('btn-pedido-direto-gerar');
  botao.disabled = true;
  try {
    const resposta = await fetch('/api/pedidos/direto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fornecedorId: pedidoDiretoFornecedorId, itens }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível gerar o pedido.');
    fecharNovoPedidoDireto();
    await carregarPedidos();
    // Abre o pedido: é de lá que sai o WhatsApp (um só pras lojas dessa leva).
    abrirPedidoDetalhe(dados.pedidos[0].id);
  } catch (erroCatch) {
    console.error('Falha ao gerar pedido direto:', erroCatch);
    erro.textContent = erroCatch.message;
    erro.style.display = '';
    botao.disabled = false;
  }
});

// --- COMPRA FEITA POR FORA (2026-09-17) ---
// Card #36 do ClickUp: o que se compra sem cotação nem pedido daqui (mercado,
// padaria, entrega combinada no WhatsApp) entra em Pedidos já recebido, com
// quem comprou, a data e a nota fiscal. O preço vira o custo do insumo e a
// quantidade soma no estoque da loja (menos em compra antiga).
const TAMANHO_MAXIMO_NOTA_FISCAL = 15 * 1024 * 1024;
let compraForaFornecedores = [];

function _insumoDaCompraFora(nome) {
  const alvo = _normalizarNomeInsumo(nome || '');
  if (!alvo) return null;
  return (insumosParaPreco || []).find((i) => !i.ehMistura && _normalizarNomeInsumo(i.nome) === alvo) || null;
}

function _fornecedorDaCompraFora(nome) {
  const alvo = _normalizarNomeInsumo(nome || '');
  if (!alvo) return null;
  return compraForaFornecedores.find((f) => _normalizarNomeInsumo(f.nome) === alvo) || null;
}

// Unidades da linha: a do insumo (kg e L no lugar de g e ml, como o custo) e a
// de compra do cadastro (pacote, caixa), quando ela tem quantas vêm dentro.
function _unidadesCompraFora(insumo) {
  const { rotulo, fator } = _escalaDeCusto(insumo.unidadeMedida);
  const unidades = [{ rotulo, fator, texto: escaparHtml(rotulo) }];
  const fatorCompra = Number(insumo.fatorConversaoCompra);
  if (insumo.unidadeCompra && fatorCompra > 0 && _normalizarNomeInsumo(insumo.unidadeCompra) !== _normalizarNomeInsumo(rotulo)) {
    unidades.push({
      rotulo: insumo.unidadeCompra,
      fator: fatorCompra,
      texto: `${escaparHtml(insumo.unidadeCompra)} (${_formatarQuantidade(fatorCompra, insumo.unidadeMedida)})`,
    });
  }
  return unidades;
}

function _adicionarLinhaCompraFora() {
  const tbody = document.getElementById('compra-fora-itens');
  tbody.insertAdjacentHTML('beforeend', `
    <tr>
      <td>
        <input type="text" class="compra-fora-insumo" list="compra-fora-lista-insumos" autocomplete="off" placeholder="Digite pra buscar" aria-label="Insumo">
        <span class="compra-fora-dica compra-fora-custo"></span>
      </td>
      <td>
        <div class="compra-fora-qtd">
          <input type="number" class="compra-fora-quantidade" min="0" step="any" aria-label="Quantidade">
          <select class="compra-fora-unidade" aria-label="Unidade" disabled><option>—</option></select>
        </div>
      </td>
      <td>
        <input type="number" class="compra-fora-preco" min="0" step="any" aria-label="Preço unitário">
        <span class="compra-fora-dica compra-fora-por"></span>
      </td>
      <td class="compra-fora-subtotal">—</td>
      <td>
        <button type="button" class="btn-acao-icone btn-excluir" data-acao="remover-item-compra-fora" title="Remover item" aria-label="Remover item">
          <i data-lucide="trash-2"></i>
        </button>
      </td>
    </tr>`);
  const linha = tbody.lastElementChild;
  const campoInsumo = linha.querySelector('.compra-fora-insumo');
  campoInsumo.addEventListener('input', () => _escolherInsumoCompraFora(linha));
  // Ao sair do campo, o nome fica escrito como no cadastro.
  campoInsumo.addEventListener('change', () => {
    const insumo = _insumoDaCompraFora(campoInsumo.value);
    if (insumo) campoInsumo.value = insumo.nome;
  });
  linha.querySelector('.compra-fora-unidade').addEventListener('change', () => _atualizarLinhaCompraFora(linha));
  linha.querySelectorAll('.compra-fora-quantidade, .compra-fora-preco').forEach((campo) => {
    campo.addEventListener('input', _atualizarTotalCompraFora);
  });
  linha.querySelector('[data-acao="remover-item-compra-fora"]').addEventListener('click', () => {
    linha.remove();
    if (!tbody.children.length) _adicionarLinhaCompraFora();
    _atualizarTotalCompraFora();
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
  return linha;
}

function _escolherInsumoCompraFora(linha) {
  const campo = linha.querySelector('.compra-fora-insumo');
  const insumo = _insumoDaCompraFora(campo.value);
  const seletor = linha.querySelector('.compra-fora-unidade');
  const dica = linha.querySelector('.compra-fora-custo');
  campo.classList.remove('invalido');
  if (!insumo) {
    linha.dataset.insumoId = '';
    seletor.innerHTML = '<option>—</option>';
    seletor.disabled = true;
    dica.textContent = '';
  } else if (linha.dataset.insumoId !== String(insumo.id)) {
    linha.dataset.insumoId = insumo.id;
    const unidades = _unidadesCompraFora(insumo);
    seletor.innerHTML = unidades.map((u) => (
      `<option data-fator="${u.fator}" data-rotulo="${escaparHtml(u.rotulo)}">${u.texto}</option>`
    )).join('');
    seletor.disabled = unidades.length < 2;
    const custo = insumo.custoEmUso?.valor;
    const escala = _escalaDeCusto(insumo.unidadeMedida);
    dica.textContent = custo != null ? `custo hoje R$ ${_formatarPrecoUnitario(custo * escala.fator)}/${escala.rotulo}` : 'sem custo cadastrado';
  }
  _atualizarLinhaCompraFora(linha);
}

function _atualizarLinhaCompraFora(linha) {
  const opcao = linha.querySelector('.compra-fora-unidade').selectedOptions[0];
  linha.querySelector('.compra-fora-por').textContent = linha.dataset.insumoId && opcao ? `por ${opcao.dataset.rotulo}` : '';
  _atualizarTotalCompraFora();
}

function _atualizarTotalCompraFora() {
  let total = 0;
  document.querySelectorAll('#compra-fora-itens tr').forEach((linha) => {
    const quantidade = parseFloat(linha.querySelector('.compra-fora-quantidade').value);
    const preco = parseFloat(linha.querySelector('.compra-fora-preco').value);
    const subtotal = quantidade > 0 && preco >= 0 ? quantidade * preco : null;
    linha.querySelector('.compra-fora-subtotal').textContent = subtotal === null ? '—' : `R$ ${_formatarMoedaBR(Math.round(subtotal * 100) / 100)}`;
    if (subtotal) total += subtotal;
  });
  total = Math.round(total * 100) / 100;
  document.getElementById('compra-fora-total').textContent = `R$ ${_formatarMoedaBR(total)}`;
  const valorNf = parseFloat(document.getElementById('compra-fora-valor-nf').value);
  document.getElementById('compra-fora-valor-aviso').textContent = valorNf >= 0 && Math.abs(valorNf - total) > 0.05
    ? `Não bate com o total dos itens (R$ ${_formatarMoedaBR(total)}).`
    : '';
}

function _atualizarFornecedorCompraFora() {
  const nome = document.getElementById('compra-fora-fornecedor').value.trim();
  document.getElementById('compra-fora-fornecedor-ajuda').textContent = nome && !_fornecedorDaCompraFora(nome)
    ? 'Não está cadastrado: vira um fornecedor novo com esse nome.'
    : '';
}

async function abrirCompraFora() {
  document.getElementById('form-compra-fora').reset();
  const erro = document.getElementById('compra-fora-erro');
  erro.style.display = 'none';
  document.getElementById('compra-fora-fornecedor-ajuda').textContent = '';
  document.getElementById('compra-fora-loja').innerHTML = '<option value="">Escolha a loja</option>'
    + LOJAS_ESTOQUE.map((loja) => `<option value="${escaparHtml(loja)}">${escaparHtml(loja)}</option>`).join('');
  document.getElementById('compra-fora-comprador').value = window.usuarioLogado?.nome || '';
  const campoData = document.getElementById('compra-fora-data');
  campoData.max = _hojeLocalISO();
  campoData.value = campoData.max;
  document.getElementById('compra-fora-itens').innerHTML = '';
  _atualizarTotalCompraFora();
  const botao = document.getElementById('btn-compra-fora-salvar');
  botao.disabled = true;
  document.getElementById('modal-compra-fora').style.display = 'flex';
  try {
    const [respostaFornecedores] = await Promise.all([fetch('/api/fornecedores'), _carregarInsumosParaPreco(true)]);
    if (!respostaFornecedores.ok) throw new Error(`Erro no servidor Flask: ${respostaFornecedores.status}`);
    compraForaFornecedores = (await respostaFornecedores.json()).fornecedores || [];
    document.getElementById('compra-fora-lista-fornecedores').innerHTML = compraForaFornecedores
      .filter((f) => f.ativo)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((f) => `<option value="${escaparHtml(f.nome)}"></option>`)
      .join('');
    document.getElementById('compra-fora-lista-insumos').innerHTML = insumosParaPreco
      .filter((i) => !i.ehMistura)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((i) => `<option value="${escaparHtml(i.nome)}"></option>`)
      .join('');
    _adicionarLinhaCompraFora();
    botao.disabled = false;
  } catch (erroCatch) {
    console.error('Falha ao abrir compra por fora:', erroCatch);
    erro.textContent = 'Não foi possível carregar fornecedores e insumos. Feche e abra de novo.';
    erro.style.display = '';
  }
}

function fecharCompraFora() {
  document.getElementById('modal-compra-fora').style.display = 'none';
}

document.getElementById('btn-compra-fora')?.addEventListener('click', abrirCompraFora);
document.getElementById('btn-compra-fora-fechar')?.addEventListener('click', fecharCompraFora);
document.getElementById('btn-compra-fora-cancelar')?.addEventListener('click', fecharCompraFora);
document.getElementById('btn-compra-fora-adicionar')?.addEventListener('click', () => {
  _adicionarLinhaCompraFora().querySelector('.compra-fora-insumo').focus();
});
document.getElementById('compra-fora-fornecedor')?.addEventListener('input', _atualizarFornecedorCompraFora);
document.getElementById('compra-fora-fornecedor')?.addEventListener('change', (evento) => {
  const fornecedor = _fornecedorDaCompraFora(evento.target.value);
  if (fornecedor) evento.target.value = fornecedor.nome;
});
document.getElementById('compra-fora-valor-nf')?.addEventListener('input', _atualizarTotalCompraFora);

document.getElementById('form-compra-fora')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const erro = document.getElementById('compra-fora-erro');
  erro.style.display = 'none';
  const falhar = (mensagem, campo) => {
    erro.textContent = mensagem;
    erro.style.display = '';
    campo?.focus();
  };

  const itens = [];
  const vistos = new Set();
  for (const linha of document.querySelectorAll('#compra-fora-itens tr')) {
    const campoInsumo = linha.querySelector('.compra-fora-insumo');
    const campoQuantidade = linha.querySelector('.compra-fora-quantidade');
    const campoPreco = linha.querySelector('.compra-fora-preco');
    const nome = campoInsumo.value.trim();
    // Linha deixada em branco não conta.
    if (!nome && !campoQuantidade.value && !campoPreco.value) continue;
    if (!linha.dataset.insumoId) {
      campoInsumo.classList.add('invalido');
      return falhar(nome
        ? `"${nome}" não está no cadastro. Escolha um insumo da lista ou cadastre em Insumos antes.`
        : 'Escolha o insumo de cada linha.', campoInsumo);
    }
    if (vistos.has(linha.dataset.insumoId)) return falhar(`${nome} aparece duas vezes. Junte numa linha só.`, campoInsumo);
    vistos.add(linha.dataset.insumoId);
    const quantidade = parseFloat(campoQuantidade.value);
    const preco = parseFloat(campoPreco.value);
    if (!(quantidade > 0)) return falhar(`Informe a quantidade de ${nome}.`, campoQuantidade);
    if (!(preco >= 0)) return falhar(`Informe o preço de ${nome}.`, campoPreco);
    const fator = parseFloat(linha.querySelector('.compra-fora-unidade').selectedOptions[0]?.dataset.fator) || 1;
    itens.push({ insumoId: parseInt(linha.dataset.insumoId, 10), quantidade: quantidade * fator, precoUnitario: preco / fator });
  }
  if (!itens.length) return falhar('Adicione pelo menos um item da compra.', document.querySelector('#compra-fora-itens .compra-fora-insumo'));
  const arquivo = document.getElementById('compra-fora-arquivo').files[0];
  if (arquivo && arquivo.size > TAMANHO_MAXIMO_NOTA_FISCAL) {
    return falhar('O arquivo da nota passa de 15 MB. Mande uma foto menor.', document.getElementById('compra-fora-arquivo'));
  }

  const nomeFornecedor = document.getElementById('compra-fora-fornecedor').value.trim();
  const fornecedor = _fornecedorDaCompraFora(nomeFornecedor);
  const dados = new FormData();
  if (fornecedor) dados.append('fornecedorId', fornecedor.id);
  else dados.append('fornecedorNome', nomeFornecedor);
  dados.append('loja', document.getElementById('compra-fora-loja').value);
  dados.append('compradoPor', document.getElementById('compra-fora-comprador').value);
  dados.append('dataCompra', document.getElementById('compra-fora-data').value);
  dados.append('numeroNf', document.getElementById('compra-fora-numero-nf').value);
  dados.append('valorNf', document.getElementById('compra-fora-valor-nf').value);
  dados.append('somarEstoque', document.getElementById('compra-fora-somar-estoque').checked ? '1' : '0');
  dados.append('itens', JSON.stringify(itens));
  if (arquivo) dados.append('notaFiscal', arquivo);

  const botao = document.getElementById('btn-compra-fora-salvar');
  botao.disabled = true;
  try {
    const resposta = await fetch('/api/pedidos/compra-fora', { method: 'POST', body: dados });
    const resultado = await resposta.json();
    if (!resposta.ok) throw new Error(resultado.erro || 'Não foi possível lançar a compra.');
    fecharCompraFora();
    await carregarPedidos();
    abrirPedidoDetalhe(resultado.pedidoId);
  } catch (erroCatch) {
    console.error('Falha ao lançar compra por fora:', erroCatch);
    falhar(erroCatch.message);
  } finally {
    botao.disabled = false;
  }
});

// --- PENDÊNCIAS DE COMPRAS NO MENU (2026-09-16) ---
// No lugar de uma tela de painel: o menu mostra quanto está parado ao lado de
// Requisições, Cotações, Pedidos e Recebimentos (e o total em Compras). Só pra
// admin; vermelho quando tem prazo vencido ou entrega atrasada.
async function carregarContadoresMenuCompras() {
  if (!_possoGerir()) return;
  const links = document.querySelectorAll('.menu-subgroup a[href]');
  if (!links.length) return;
  try {
    const resposta = await fetch('/api/compras/pendencias');
    if (!resposta.ok) return;
    const p = await resposta.json();
    const qtd = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
    const aReceber = p.entregasAtrasadas + p.entregasNoPrazo;
    const pendencias = {
      'contagens.html': {
        total: p.contagensSemResposta + p.contagensPraAprovar,
        alerta: p.contagensVencidas > 0,
        dica: [
          p.contagensSemResposta && qtd(p.contagensSemResposta, 'contagem sem resposta', 'contagens sem resposta'),
          p.contagensVencidas && `${p.contagensVencidas} com prazo vencido`,
          p.contagensPraAprovar && `${p.contagensPraAprovar} pra aprovar`,
        ],
      },
      'cotacoes.html': {
        total: p.fornecedoresSemPreco + p.cotacoesParadas,
        alerta: p.convitesVencidos > 0,
        dica: [
          p.fornecedoresSemPreco && qtd(p.fornecedoresSemPreco, 'fornecedor sem mandar preço', 'fornecedores sem mandar preço'),
          p.convitesVencidos && `${p.convitesVencidos} com prazo vencido`,
          p.cotacoesParadas && qtd(p.cotacoesParadas, 'cotação aberta com decisão pendente', 'cotações abertas com decisão pendente'),
        ],
      },
      'pedidos.html': {
        total: p.pedidosNaoEnviados,
        alerta: false,
        dica: [qtd(p.pedidosNaoEnviados, 'pedido pra enviar pelo WhatsApp', 'pedidos pra enviar pelo WhatsApp')],
      },
      'recebimentos.html': {
        total: aReceber,
        alerta: p.entregasAtrasadas > 0,
        dica: [
          qtd(aReceber, 'entrega a receber', 'entregas a receber'),
          p.entregasAtrasadas && `${p.entregasAtrasadas} há mais de ${p.diasEntregaAtrasada} dias`,
        ],
      },
    };
    const contador = (total, alerta, dica) => (
      `<span class="menu-contador${alerta ? ' alerta' : ''}" title="${escaparHtml(dica)}">${total}</span>`
    );
    let grupo = null;
    let totalGrupo = 0;
    let alertaGrupo = false;
    links.forEach((link) => {
      const item = pendencias[link.getAttribute('href')];
      if (!item) return;
      grupo = link.closest('.menu-group');
      link.querySelector('.menu-contador')?.remove();
      if (!item.total) return;
      totalGrupo += item.total;
      alertaGrupo = alertaGrupo || item.alerta;
      link.insertAdjacentHTML('beforeend', contador(item.total, item.alerta, item.dica.filter(Boolean).join(' · ')));
    });
    const toggle = grupo?.querySelector('.menu-group-toggle');
    toggle?.querySelector('.menu-contador')?.remove();
    if (toggle && totalGrupo) {
      toggle.querySelector('.menu-group-chevron')?.insertAdjacentHTML('beforebegin', contador(totalGrupo, alertaGrupo, 'Pendências de compras'));
    }
  } catch (erro) {
    console.error('Falha ao carregar pendências de compras:', erro);
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
    tbody.innerHTML = `<tr><td colspan="${colspan}" style="color:var(--danger-texto);">Não foi possível carregar os lançamentos.</td></tr>`;
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

// Home (visual de SaaS financeiro, 2026-09-15): azul, índigo e violeta, e
// cinza pros canais menores. Vermelho e verde ficam reservados pra alta e
// queda de dinheiro, então o faturamento da rede é uma linha índigo.
const COR_LINHA_HOME = CORES_GRAFICO[0];

const FONTE_GRAFICO_HOME = { family: "'Plus Jakarta Sans', sans-serif", size: 12 };
const TOOLTIP_HOME = {
  backgroundColor: '#18181B',
  padding: 10,
  cornerRadius: 8,
  displayColors: false,
  titleFont: { ...FONTE_GRAFICO_HOME, weight: '600' },
  bodyFont: FONTE_GRAFICO_HOME,
};

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
          borderColor: COR_LINHA_HOME,
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          borderWidth: 2,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointBackgroundColor: COR_LINHA_HOME,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TOOLTIP_HOME,
            callbacks: {
              title: (itens) => dias[itens[0].dataIndex]?.dia || '',
              label: (ctx) => `R$ ${ctx.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: '#A1A1AA', font: FONTE_GRAFICO_HOME },
          },
          y: {
            grid: { color: 'rgba(161, 161, 170, 0.18)' },
            border: { display: false },
            ticks: { color: '#A1A1AA', font: FONTE_GRAFICO_HOME, callback: value => 'R$ ' + value.toLocaleString('pt-BR') },
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
            <span class="home-canal-legend-dot" style="background-color: ${corDoCanal(c.canal, i)};"></span>
            ${c.canal}
          </span>
          <span class="home-canal-legend-valor">
            R$ ${c.faturamento}
            <span class="home-canal-legend-percentual">${c.percentual.toLocaleString('pt-BR')}%</span>
          </span>
        </div>
      `).join('');
    }

    // Um fio da cor do cartão separa as fatias (branco no claro, escuro no
    // modo escuro).
    const fundoCartao = getComputedStyle(document.body).getPropertyValue('--card-bg').trim() || '#ffffff';
    homeCanalChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: canais.map(c => c.canal),
        datasets: [{
          data: canais.map(c => c.faturamentoNumero),
          backgroundColor: canais.map((c, i) => corDoCanal(c.canal, i)),
          borderColor: fundoCartao,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TOOLTIP_HOME,
            callbacks: {
              label: (ctx) => `${ctx.label}: R$ ${canais[ctx.dataIndex].faturamento} (${canais[ctx.dataIndex].percentual.toLocaleString('pt-BR')}%)`,
            },
          },
        },
      },
    });
  } catch (erro) {
    console.error('Falha ao carregar gráfico de canais da rede:', erro);
    if (legenda) legenda.innerHTML = `<p class="panel-subtitle" style="color:var(--danger-texto);">Não foi possível carregar os canais.</p>`;
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
  const aceitas = [formatarBr(hoje), formatarBr(ontem)];
  // Segunda as lojas fecham: na terça, o último dia com venda é domingo.
  if (ontem.getDay() === 1) {
    const domingo = new Date(ontem);
    domingo.setDate(ontem.getDate() - 1);
    aceitas.push(formatarBr(domingo));
  }
  return aceitas.includes(dataStr);
}

function _badgeSincronizacao(dataStr) {
  const emDia = _sincronizacaoEmDia(dataStr);
  return `<span class="badge ${emDia ? 'badge-green' : 'badge-orange'}">${dataStr || 'nunca sincronizou'}</span>`;
}

/**
 * Home: ponto no botão Sincronizar — verde com todas as lojas em dia,
 * vermelho com alguma atrasada (não sincronizou ontem/hoje) ou sem resposta.
 * O nome de cada loja atrasada vai no texto do botão pra quem passa o mouse.
 * Substituiu a lista de sincronização por loja (2026-09-18), que ocupava
 * meio painel pra dizer "em dia" quase sempre.
 */
async function carregarStatusSincronizacaoHome() {
  const ponto = document.getElementById('home-sync-indicador');
  if (!ponto) return;
  const botao = document.getElementById('btn-sincronizar-agora');
  const marcar = (situacao, texto) => {
    ponto.className = `home-sync-ponto ${situacao}`;
    const oculto = document.getElementById('home-sync-texto');
    if (oculto) oculto.textContent = ` — ${texto}`;
    if (botao) botao.title = texto;
  };
  try {
    const resposta = await fetch('/api/config/lojas');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const lojas = (await resposta.json()).lojas || [];
    const atrasadas = lojas.filter((l) => !_sincronizacaoEmDia(l.ultimaSincronizacao));
    if (!atrasadas.length) {
      marcar('ok', 'Sincronizado: todas as lojas em dia');
    } else {
      marcar('erro', `${atrasadas.length === 1 ? 'Loja atrasada' : 'Lojas atrasadas'}: ${atrasadas.map((l) => l.nome).join(', ')}`);
    }
  } catch (erro) {
    console.error('Falha ao carregar status de sincronização:', erro);
    marcar('erro', 'Não foi possível conferir a sincronização');
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
    tbody.innerHTML = `<tr><td colspan="4" style="color:var(--danger-texto);">Não foi possível carregar as lojas. Confira se o Flask está rodando.</td></tr>`;
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
      resultadoElem.innerHTML = `<div class="sync-resultado-item">Sincronização de ${dados.diaLabel} iniciada em segundo plano — pode levar alguns minutos. Os números atualizam sozinhos aqui.</div>`;
    }

    carregarConfigLojas();
    if (document.getElementById('home-sync-indicador')) carregarStatusSincronizacaoHome();
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
 * Consulta o backend Flask e monta o quadro de ontem e o cartão Semanal da
 * Home. O Semanal mostra sempre a última semana FECHADA, de terça a segunda
 * como a planilha delas — nunca a semana em andamento.
 */
async function carregarDadosLojas() {
  const container = document.getElementById('container-periodo');
  const totalRedeElem = document.getElementById('total-rede-valor');

  if (!container) return;

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

    // Semana passada de TERÇA A SEGUNDA, como a planilha e o Vendas Semanais
    // (segunda as lojas fecham) — a semana em andamento nunca aparece aqui,
    // só a última já fechada.
    const diasDesdeTerca = (hoje.getDay() + 5) % 7; // 0 = terça ... 6 = segunda
    const tercaDestaSemana = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - diasDesdeTerca);
    const semanaPassadaInicio = new Date(tercaDestaSemana.getFullYear(), tercaDestaSemana.getMonth(), tercaDestaSemana.getDate() - 7);
    const semanaPassadaFim = new Date(tercaDestaSemana.getFullYear(), tercaDestaSemana.getMonth(), tercaDestaSemana.getDate() - 1);

    const somarNoIntervalo = (inicio, fim) => dias
      .filter(d => { const dt = paraData(d.dia); return dt >= inicio && dt <= fim; })
      .reduce((soma, d) => soma + d.faturamento, 0);

    const totalSemanal = somarNoIntervalo(semanaPassadaInicio, semanaPassadaFim);

    const fmtCurto = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

    // O faturamento de ontem está no quadro de cima; dos períodos fechados só
    // a semana passada fica nos cartões (saúde financeira e estoque crítico
    // vêm de carregarGestaoHome).
    document.getElementById('home-semanal-valor').textContent = _formatarMoedaBRL(totalSemanal);
    document.getElementById('home-semanal-periodo').textContent = `Semana passada, ${fmtCurto(semanaPassadaInicio)} a ${fmtCurto(semanaPassadaFim)}`;

    renderRankingLojasHome(dadosOntem.lojas);

    // Reativa os ícones da biblioteca Lucide nos novos elementos criados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

  } catch (error) {
    console.error('Falha ao conectar com o backend Flask:', error);
    document.getElementById('home-semanal-periodo').textContent = 'Não foi possível carregar o faturamento.';
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

// --- HOME: GESTÃO OPERACIONAL (2026-09-18) ---
// Estoque crítico no primeiro cartão, Curva A da rede e custos em alta no
// painel ao lado do ranking. Uma chamada só (/api/home/gestao), dos últimos
// 30 dias, respeitando a loja de quem é gerente de uma loja só.
const NOME_CURTO_LOJA = {
  'Hamburgueria Artesanos': 'Artesanos',
  'Açaí Na Lata': 'Açaí',
  'Tradiça ZN': 'ZN',
  'Tradiça Simus': 'Simus',
};

function _nomeCurtoLoja(loja) {
  return NOME_CURTO_LOJA[loja] || loja;
}

function _renderEstoqueCriticoHome(estoque) {
  const card = document.getElementById('home-card-estoque');
  if (!card) return;
  const total = estoque.total || 0;
  card.classList.toggle('tem-alerta', total > 0);
  document.getElementById('home-estoque-total').textContent = total.toLocaleString('pt-BR');
  document.getElementById('home-estoque-sub').textContent = total
    ? `${total === 1 ? 'item zerado ou abaixo' : 'itens zerados ou abaixo'} do mínimo${estoque.zerados ? ` · ${estoque.zerados} ${estoque.zerados === 1 ? 'zerado' : 'zerados'}` : ''}`
    : 'Nenhum insumo zerado ou abaixo do mínimo';
  // Cada loja leva pra tabela dela já filtrada em "crítico".
  document.getElementById('home-estoque-lojas').innerHTML = (estoque.porLoja || [])
    .filter((l) => l.criticos > 0)
    .map((l) => `
      <a href="estoque.html?loja=${encodeURIComponent(l.loja)}&nivel=critico" title="${escaparHtml(l.loja)}: ${l.criticos} em nível crítico">
        ${escaparHtml(_nomeCurtoLoja(l.loja))} <strong>${l.criticos}</strong>
      </a>`).join('');
}

function _renderCurvaAHome(produtos) {
  const lista = document.getElementById('home-curva-a');
  if (!lista) return;
  if (!produtos.length) {
    lista.innerHTML = '<li class="panel-subtitle">Nenhum produto com CMV calculado entrou na Curva A no período.</li>';
    return;
  }
  lista.innerHTML = produtos.map((p, i) => `
    <li class="home-curva-item">
      <span class="ranking-posicao">${i + 1}º</span>
      <div class="home-curva-info">
        <span class="home-curva-nome">${escaparHtml(p.nome)}</span>
        <span class="home-curva-detalhe">${p.lojas.map(_nomeCurtoLoja).map(escaparHtml).join(' + ')}${p.cmvPercent != null ? ` · CMV ${String(p.cmvPercent).replace('.', ',')}%` : ''}</span>
      </div>
      <div class="home-curva-margem">
        <strong>${_formatarMoedaBRL(p.margem)}</strong>
        <span>de margem</span>
      </div>
    </li>`).join('');
}

function _renderCustosEmAltaHome(alertas) {
  const lista = document.getElementById('home-custos-alta');
  if (!lista) return;
  if (!alertas.length) {
    lista.innerHTML = '<li class="panel-subtitle">Nenhuma alta de insumo pesou na margem nos últimos 30 dias.</li>';
    return;
  }
  const num = (v) => String(v).replace('.', ',');
  lista.innerHTML = alertas.map((a) => {
    const pontos = `${num(a.pontosDeMargem)} ${a.pontosDeMargem === 1 ? 'ponto' : 'pontos'}`;
    const margens = a.margemAntes != null ? ` (${num(a.margemAntes)}% → ${num(a.margemAgora)}%)` : '';
    const outros = a.outrosProdutos ? ` · e mais ${a.outrosProdutos} ${a.outrosProdutos === 1 ? 'produto' : 'produtos'}` : '';
    return `
      <li class="home-alerta-item${a.perigoso ? ' perigoso' : ''}">
        <span class="home-alerta-icone" aria-hidden="true"><i data-lucide="trending-up"></i></span>
        <div class="home-alerta-texto">
          <span><strong>${escaparHtml(a.insumo)}</strong> subiu <strong class="home-alerta-pct">${num(a.variacaoPct)}%</strong>
            · R$ ${_formatarPrecoUnitario(a.precoAntes)} → R$ ${_formatarPrecoUnitario(a.precoAgora)}/${escaparHtml(a.unidade)}</span>
          <span class="home-alerta-detalhe">A margem do item “${escaparHtml(a.produto)}” (${escaparHtml(_nomeCurtoLoja(a.loja))}) caiu ${pontos}${margens}${outros}</span>
        </div>
      </li>`;
  }).join('');
}

const VEREDITO_CMV_HOME = { otimo: 'Ótimo', bom: 'Bom', ruim: 'Ruim' };

// Saúde financeira: CMV do mês (ficha técnica × custo das compras) com a
// mesma régua do Vendas Semanais (<31% ótimo, 31-34% bom, acima ruim).
function _renderSaudeFinanceiraHome(saude) {
  const card = document.getElementById('home-card-saude');
  if (!card) return;
  const num = (v) => String(v).replace('.', ',');
  const veredito = document.getElementById('home-saude-veredito');
  card.classList.remove('otimo', 'bom', 'ruim');
  if (saude.cmvPercent == null) {
    document.getElementById('home-saude-cmv').textContent = 'CMV —';
    veredito.hidden = true;
    document.getElementById('home-saude-margem').textContent = 'Nenhum produto vendido tem custo ainda';
    document.getElementById('home-saude-periodo').textContent = saude.periodo || '';
    return;
  }
  card.classList.add(saude.classificacao);
  document.getElementById('home-saude-cmv').textContent = `CMV ${num(saude.cmvPercent)}%`;
  veredito.hidden = false;
  veredito.textContent = VEREDITO_CMV_HOME[saude.classificacao] || '';
  veredito.className = `home-veredito ${saude.classificacao}`;
  document.getElementById('home-saude-margem').textContent = `Margem bruta ${num(saude.margemBrutaPercent)}%`;
  const periodo = document.getElementById('home-saude-periodo');
  periodo.textContent = `${saude.periodo} · ${saude.coberturaPercent}% das vendas com custo`;
  periodo.title = 'O CMV é calculado só sobre os produtos que têm ficha técnica com todos os insumos custeados. '
    + 'Margem bruta = 100% − CMV; não desconta taxa dos apps nem despesas fixas.';
}

// Atividades do dia: o servidor manda o que está pendente primeiro, com o
// link de onde resolver; o que já foi feito vem riscado no fim.
function _renderAtividadesHome(atividades) {
  const lista = document.getElementById('home-rotina-lista');
  if (!lista) return;
  const pendentes = atividades.filter((a) => a.pendente).length;
  document.getElementById('home-rotina-resumo').textContent = pendentes
    ? `${pendentes} ${pendentes === 1 ? 'pendente' : 'pendentes'}`
    : 'Tudo em dia';
  lista.innerHTML = atividades.map((a) => {
    const marca = `<span class="home-rotina-check" aria-hidden="true">${a.pendente ? '' : '<i data-lucide="check"></i>'}</span>`;
    const estado = `<span class="visualmente-oculto">${a.pendente ? 'Pendente: ' : 'Feito: '}</span>`;
    let texto = `<span class="home-rotina-texto">${estado}${escaparHtml(a.texto)}</span>`;
    if (a.pendente && a.acao === 'sincronizar') {
      texto = `<button type="button" class="home-rotina-acao" data-acao="sincronizar">${estado}${escaparHtml(a.texto)}<i data-lucide="chevron-right"></i></button>`;
    } else if (a.pendente && a.link) {
      texto = `<a class="home-rotina-acao" href="${escaparHtml(a.link)}">${estado}${escaparHtml(a.texto)}<i data-lucide="chevron-right"></i></a>`;
    }
    return `<li class="home-rotina-item${a.pendente ? '' : ' feita'}">${marca}${texto}</li>`;
  }).join('');
  lista.querySelector('[data-acao="sincronizar"]')?.addEventListener('click', () => sincronizarAgora());
}

// Insight no rodapé do quadro preto: um por vez, com a seta passando pro
// próximo quando tem mais de um.
let homeInsights = [];
let homeInsightAtual = 0;

function _mostrarInsightHome() {
  const insight = homeInsights[homeInsightAtual];
  if (!insight) return;
  document.getElementById('home-insight-texto').textContent = insight.texto;
  const link = document.getElementById('home-insight-link');
  link.href = insight.link || '#';
  link.hidden = !insight.link;
  document.getElementById('home-insight-posicao').textContent = `${homeInsightAtual + 1}/${homeInsights.length}`;
}

function _renderInsightsHome(insights) {
  const bloco = document.getElementById('home-insight');
  if (!bloco) return;
  const textoAnterior = homeInsights[homeInsightAtual]?.texto;
  homeInsights = insights.length ? insights : [{
    texto: 'Vendas, margem e Curva ABC dentro do esperado: nada fora do normal pra olhar agora.',
    link: null,
  }];
  // Na atualização automática, fica no mesmo insight se ele ainda existe.
  const mesmo = homeInsights.findIndex((i) => i.texto === textoAnterior);
  homeInsightAtual = mesmo >= 0 ? mesmo : 0;
  bloco.hidden = false;
  document.getElementById('home-insight-proximo').hidden = homeInsights.length < 2;
  _mostrarInsightHome();
}

function _proximoInsightHome() {
  homeInsightAtual = (homeInsightAtual + 1) % homeInsights.length;
  _mostrarInsightHome();
}

async function carregarGestaoHome() {
  if (!document.getElementById('home-curva-a')) return;
  try {
    const resposta = await fetch('/api/home/gestao');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    _renderEstoqueCriticoHome(dados.estoqueCritico || {});
    _renderSaudeFinanceiraHome(dados.saudeFinanceira || {});
    _renderAtividadesHome(dados.atividades || []);
    _renderInsightsHome(dados.insights || []);
    _renderCurvaAHome(dados.curvaA || []);
    _renderCustosEmAltaHome(dados.custosEmAlta || []);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (erro) {
    console.error('Falha ao carregar a gestão da Home:', erro);
    document.getElementById('home-estoque-sub').textContent = 'Não foi possível carregar o estoque.';
    document.getElementById('home-saude-margem').textContent = 'Não foi possível carregar.';
    ['home-curva-a', 'home-custos-alta', 'home-rotina-lista'].forEach((id) => {
      document.getElementById(id).innerHTML = '<li class="panel-subtitle">Não foi possível carregar.</li>';
    });
  }
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
    elPapel.forEach(el => { el.textContent = PAPEL_LABEL_USUARIO[usuario.papel] || usuario.papel; });
    elAvatar.forEach(el => { el.textContent = iniciais; });

    window.usuarioLogado = usuario;
    const saudacao = document.getElementById('home-saudacao');
    if (saudacao) saudacao.textContent = `Olá ${usuario.nome.split(' ')[0]}, seja bem-vindo(a)!`;
    _ajustarMenuAoPerfil();
    _travarNaLojaDoFuncionario();
    carregarContadoresMenuCompras();

    // Tela de Configurações: painel "Sua Conta" + seção "Equipe" (só admin)
    const contaNome = document.getElementById('conta-nome-label');
    if (contaNome) {
      contaNome.textContent = usuario.nome;
      document.getElementById('conta-email-label').textContent = usuario.email;
      document.getElementById('conta-papel-label').textContent = (PAPEL_LABEL_USUARIO[usuario.papel] || usuario.papel) + (usuario.loja ? ` · ${usuario.loja}` : '');
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
    const painelBackup = document.getElementById('painel-backup');
    if (painelBackup && usuario.papel === 'admin') {
      painelBackup.style.display = '';
      carregarBackups();
    }    const painelRegistro = document.getElementById('painel-registro');
    if (painelRegistro && usuario.papel === 'admin') {
      painelRegistro.style.display = '';
      carregarRegistroAtividade();
    }
    const painelBaixa = document.getElementById('painel-baixa-automatica');
    if (painelBaixa && usuario.papel === 'admin') {
      painelBaixa.style.display = '';
      carregarBaixaAutomatica();
    }
    // Mais Vendidos: pra admin, a marca "não reconhecido" vira botão de vincular
    if (maisVendidosDados && usuario.papel === 'admin') renderMaisVendidos(false);
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
    if (_possoGerir() && canalSelecionado) {
      exibirCanalDoDia(canalSelecionado.unidade, canalSelecionado.diaIso);
    }

    // Tela de Estoque: botões "Novo insumo"/"Registrar entrada" e coluna de
    // Ações (só admin) — mesma correção de corrida entre os dois fetches.
    if (_possoGerir() && document.getElementById('estoque-loja-select') && estoqueInsumos.length) {
      renderEstoqueTab();
    }

    // Tela de Cardápio → sub-aba Ficha Técnica: botão "Novo item", custo
    // editável e ações de editar/excluir (só admin) — mesma correção de
    // corrida entre os dois fetches.
    if (_possoGerir() && (fichaTecnicaProdutos.length || fichaTecnicaComplementos.length)) {
      renderFichaTecnicaConteudo();
    }

    // Tela de Contagens: botão "Nova requisição" e coluna de Ações (só
    // admin) — mesma correção de corrida entre os dois fetches. Reage mesmo
    // com a lista vazia, senão o botão nunca apareceria se a Contagens
    // carregar antes de saber o papel do usuário.
    if (_possoGerir() && document.getElementById('contagens-tabela-body')) {
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

// --- REGISTRO DE ATIVIDADE (Configurações, só admin) ---
// Quem mexeu em quê. Vem do gancho do servidor, que anota toda requisição
// que muda alguma coisa (pedido dela, 17/09).

function _quandoLegivel(iso) {
  if (!iso) return '—';
  const data = new Date(iso);
  const hoje = new Date();
  const mesmoDia = data.toDateString() === hoje.toDateString();
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return mesmoDia ? `hoje ${hora}` : `${_dataBR(iso.slice(0, 10))} ${hora}`;
}

async function carregarRegistroAtividade() {
  const tbody = document.getElementById('registro-tbody');
  if (!tbody) return;
  const dias = document.getElementById('registro-filtro-dias')?.value || 7;
  try {
    const resposta = await fetch(`/api/admin/registro?dias=${encodeURIComponent(dias)}`);
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const acoes = (await resposta.json()).acoes || [];
    if (!acoes.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="panel-subtitle">Nada registrado nesse período.</td></tr>';
      return;
    }
    tbody.innerHTML = acoes.map((a) => {
      const deuErro = a.status >= 400;
      const detalhe = a.detalhes ? a.detalhes.slice(0, 120) : '';
      return `
        <tr>
          <td class="text-muted">${escaparHtml(_quandoLegivel(a.quando))}</td>
          <td class="font-bold">${escaparHtml(a.quem)}${a.loja ? `<span class="registro-loja">${escaparHtml(a.loja)}</span>` : ''}</td>
          <td>${escaparHtml(a.acao)}${deuErro ? ` <span class="badge-pill neg">barrado (${a.status})</span>` : ''}</td>
          <td class="text-muted registro-detalhe" title="${escaparHtml(a.detalhes || '')}">${escaparHtml(detalhe)}</td>
        </tr>
      `;
    }).join('');
  } catch (erro) {
    console.error('Falha ao carregar o registro de atividade:', erro);
    tbody.innerHTML = '<tr><td colspan="4" class="panel-subtitle" style="color:var(--danger);">Não foi possível carregar o registro.</td></tr>';
  }
}

document.getElementById('registro-filtro-dias')?.addEventListener('change', carregarRegistroAtividade);

// --- CÓPIA DE SEGURANÇA DO BANCO (Configurações, só admin) ---

function _tamanhoLegivel(bytes) {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function carregarBackups() {
  const resumo = document.getElementById('backup-resumo');
  const tbody = document.getElementById('backup-tbody');
  if (!resumo || !tbody) return;

  try {
    const resposta = await fetch('/api/admin/backups');
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const dados = await resposta.json();
    const copias = dados.backups || [];
    const ultima = copias[0];

    resumo.innerHTML = `
      <div>
        <span class="backup-rotulo">Última cópia</span>
        <span class="backup-valor">${ultima ? _dataBR(ultima.arquivo.slice(8, 18)) : 'nenhuma ainda'}</span>
      </div>
      <div>
        <span class="backup-rotulo">Cópias guardadas</span>
        <span class="backup-valor">${copias.length}</span>
      </div>
      <div>
        <span class="backup-rotulo">Tamanho do banco</span>
        <span class="backup-valor">${_tamanhoLegivel(dados.tamanhoBanco)}</span>
      </div>
      <div>
        <span class="backup-rotulo">Cópia automática</span>
        <span class="backup-valor">${dados.automatico ? `todo dia às ${dados.horaAutomatica}` : 'desligada'}</span>
      </div>
    `;

    tbody.innerHTML = copias.length
      ? copias.slice(0, 7).map((c) => `
        <tr>
          <td class="font-bold">${_dataBR(c.arquivo.slice(8, 18))}</td>
          <td class="text-muted">${_tamanhoLegivel(c.tamanho)}</td>
          <td class="col-acoes"><div class="acoes-linha" style="justify-content:flex-end;">
            <a class="btn-acao-icone" href="/api/admin/backups/${encodeURIComponent(c.arquivo)}" title="Baixar só o banco">
              <i data-lucide="download"></i>
            </a>
          </div></td>
        </tr>
      `).join('')
      : '<tr><td colspan="3" class="panel-subtitle">A primeira cópia sai na próxima madrugada — ou clique em "Gerar cópia agora".</td></tr>';

    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (erro) {
    console.error('Falha ao carregar as cópias de segurança:', erro);
    resumo.innerHTML = '<span class="panel-subtitle" style="color:var(--danger);">Não foi possível ler as cópias.</span>';
    tbody.innerHTML = '';
  }
}

document.getElementById('btn-gerar-backup')?.addEventListener('click', async (evento) => {
  const botao = evento.currentTarget;
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Gerando...';
  try {
    const resposta = await fetch('/api/admin/backups', { method: 'POST' });
    const dados = await resposta.json();
    if (!resposta.ok) {
      alert(dados.erro || 'Não foi possível gerar a cópia.');
      return;
    }
    await carregarBackups();
  } catch (erro) {
    console.error('Falha ao gerar cópia:', erro);
    alert('Não foi possível conectar ao servidor.');
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
});

// --- PERFIS DE ACESSO (card #35) ---
// admin: a rede inteira. gerente: uma loja, com compras e cadastro dela.
// operação: uma loja, só o dia a dia (contagem, recebimento, consulta).

function _souAdmin() {
  return window.usuarioLogado?.papel === 'admin';
}

function _possoGerir() {
  const papel = window.usuarioLogado?.papel;
  return papel === 'admin' || papel === 'gerente';
}

// Telas de cada perfil — o mesmo mapa do backend (PAGINAS_POR_PAPEL em app.py).
const PAGINAS_POR_PAPEL = {
  gerente: ['index.html', 'estoque.html', 'fornecedores.html', 'cotacoes.html', 'contagens.html',
    'pedidos.html', 'recebimentos.html', 'guia-compras.html', 'cardapio.html', 'preparo.html',
    'curva-abc.html', 'insight.html', 'mais-vendidos.html', 'vendas-semanais.html', 'precos.html',
    'configuracoes.html', 'instalar-extensao.html'],
  operacao: ['estoque.html', 'contagens.html', 'recebimentos.html', 'preparo.html', 'cardapio.html',
    'guia-compras.html', 'configuracoes.html'],
};

function _ajustarMenuAoPerfil() {
  const paginas = PAGINAS_POR_PAPEL[window.usuarioLogado?.papel];
  if (!paginas) return; // admin vê tudo
  document.querySelectorAll('.sidebar-menu a[href]').forEach((link) => {
    const pagina = link.getAttribute('href').split('/').pop().split('?')[0];
    if (!paginas.includes(pagina)) link.remove();
  });
  // Grupo que ficou sem nenhum item dentro some junto com o título.
  document.querySelectorAll('.sidebar-menu .menu-group').forEach((grupo) => {
    if (!grupo.querySelector('.menu-subitem')) grupo.remove();
  });
}

function _travarNaLojaDoFuncionario() {
  const minha = window.usuarioLogado?.loja;
  if (!minha) return; // admin escolhe a loja que quiser
  const outras = LOJAS_ESTOQUE.filter((loja) => loja !== minha);
  // Toda tela monta o seletor de loja a partir dessa lista.
  LOJAS_ESTOQUE.splice(0, LOJAS_ESTOQUE.length, minha);
  document.querySelectorAll('[data-loja], [data-tab]').forEach((el) => {
    const loja = el.dataset.loja || el.dataset.tab;
    if (outras.includes(loja)) el.remove();
  });
  document.querySelectorAll('option').forEach((opcao) => {
    if (outras.includes(opcao.value)) opcao.remove();
  });
  document.querySelectorAll('input[type="checkbox"]').forEach((caixa) => {
    if (outras.includes(caixa.value)) (caixa.closest('label') || caixa).remove();
  });
  // "Visão Geral (Todas)" não quer dizer nada pra quem enxerga uma loja só:
  // sai da lista e a loja da pessoa entra no lugar como escolhida.
  document.querySelectorAll('[data-tab="geral"], [data-tab="todas"], [data-loja="geral"], [data-loja="todas"]')
    .forEach((el) => el.remove());
  const escolha = document.querySelector(`[data-tab="${CSS.escape(minha)}"], [data-loja="${CSS.escape(minha)}"]`);
  if (escolha) escolha.click();
}

// --- GESTÃO DE FUNCIONÁRIOS (tela de Configurações, só admin) ---

const PAPEL_LABEL_USUARIO = { admin: 'Admin', gerente: 'Gerente', operacao: 'Operação', equipe: 'Operação' };
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
      tbody.innerHTML = `<tr><td colspan="6" class="panel-subtitle">Nenhum funcionário cadastrado ainda.</td></tr>`;
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
        <td class="text-muted">${u.loja ? escaparHtml(u.loja) : 'Todas as lojas'}</td>
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
    tbody.innerHTML = `<tr><td colspan="6" class="panel-subtitle" style="color:var(--danger);">Não foi possível carregar os funcionários.</td></tr>`;
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
  document.getElementById('modalUsuarioTitulo').textContent = 'Novo funcionário';
  document.getElementById('formUsuario').reset();
  document.getElementById('usuarioId').value = '';
  _preencherLojasUsuario();
  document.getElementById('usuarioPapel').value = 'operacao';
  atualizarCampoLojaUsuario();
  document.getElementById('usuarioSenha').required = true;
  document.getElementById('usuarioSenhaOpcional').style.display = 'none';
  document.getElementById('usuarioErro').style.display = 'none';
  document.getElementById('modalUsuario').style.display = 'flex';
}

function abrirModalEditarUsuario(usuario) {
  document.getElementById('modalUsuarioTitulo').textContent = 'Editar funcionário';
  document.getElementById('formUsuario').reset();
  document.getElementById('usuarioId').value = usuario.id;
  document.getElementById('usuarioNome').value = usuario.nome;
  document.getElementById('usuarioEmail').value = usuario.email;
  document.getElementById('usuarioEmail').disabled = true;
  _preencherLojasUsuario();
  document.getElementById('usuarioPapel').value = usuario.papel === 'equipe' ? 'operacao' : usuario.papel;
  if (usuario.loja) document.getElementById('usuarioLoja').value = usuario.loja;
  atualizarCampoLojaUsuario();
  document.getElementById('usuarioSenha').required = false;
  document.getElementById('usuarioSenhaOpcional').style.display = 'inline';
  document.getElementById('usuarioErro').style.display = 'none';
  document.getElementById('modalUsuario').style.display = 'flex';
}

function _preencherLojasUsuario() {
  const select = document.getElementById('usuarioLoja');
  if (!select || select.options.length) return;
  select.innerHTML = LOJAS_ESTOQUE.map((loja) => `<option value="${escaparHtml(loja)}">${escaparHtml(loja)}</option>`).join('');
}

function atualizarCampoLojaUsuario() {
  const grupo = document.getElementById('grupo-usuario-loja');
  if (!grupo) return;
  grupo.style.display = document.getElementById('usuarioPapel').value === 'admin' ? 'none' : '';
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

  const papel = document.getElementById('usuarioPapel').value;
  const corpo = {
    nome: document.getElementById('usuarioNome').value.trim(),
    papel,
    // Admin enxerga a rede inteira, então não fica preso a loja nenhuma.
    loja: papel === 'admin' ? null : document.getElementById('usuarioLoja').value,
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
    board.innerHTML = `<p class="panel-subtitle" style="color:var(--danger-texto);">Não foi possível carregar as tarefas. Confira se o Flask está rodando.</p>`;
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
// Complemento com o nome aberto pra edição (lápis ao lado do nome).
let complementoEditandoNomeId = null;
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
    complementoEditandoNomeId = null;
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
  const isAdmin = _possoGerir();
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
            <div class="ficha-tecnica-produto-nome">
              ${isAdmin && complementoEditandoNomeId === c.itemCardapioId ? `
                <form class="nome-inline-form" data-acao="form-nome-complemento" data-item-id="${c.itemCardapioId}">
                  <input type="text" class="nome-editavel" value="${escaparHtml(c.nome)}" aria-label="Nome do complemento" autocomplete="off">
                  <p class="nome-inline-ajuda">Enter salva, Esc desiste. ${AJUDA_RENOMEAR_ITEM}</p>
                  <p class="nome-inline-ajuda erro" hidden></p>
                </form>` : `
                ${escaparHtml(c.nome)}
                ${isAdmin ? `
                  <button type="button" class="btn-lapis-nome" data-acao="renomear-complemento" data-item-id="${c.itemCardapioId}" title="Renomear" aria-label="Renomear ${escaparHtml(c.nome)}">
                    <i data-lucide="pencil"></i>
                  </button>` : ''}`}
            </div>
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
  // O lápis e o campo de nome ficam dentro da linha que abre/fecha: clicar
  // neles não pode abrir/fechar junto.
  conteudoEl.querySelectorAll('[data-acao="renomear-complemento"]').forEach(btn => {
    btn.addEventListener('click', (evento) => {
      evento.stopPropagation();
      complementoEditandoNomeId = parseInt(btn.dataset.itemId, 10);
      renderFichaTecnicaConteudo();
    });
  });
  const formNome = conteudoEl.querySelector('[data-acao="form-nome-complemento"]');
  if (formNome) {
    const input = formNome.querySelector('input');
    const erro = formNome.querySelector('.nome-inline-ajuda.erro');
    const fechar = () => {
      complementoEditandoNomeId = null;
      renderFichaTecnicaConteudo();
    };
    formNome.addEventListener('click', (evento) => evento.stopPropagation());
    input.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        fechar();
      }
    });
    formNome.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const itemId = parseInt(formNome.dataset.itemId, 10);
      const complemento = fichaTecnicaComplementos.find(c => c.itemCardapioId === itemId);
      const novoNome = input.value.trim();
      if (!complemento || !novoNome || novoNome === complemento.nome) {
        fechar();
        return;
      }
      try {
        const dados = await _salvarNovoNomeCardapio({ itemId, novoNome });
        complemento.nome = dados.nome;
        fechar();
      } catch (falha) {
        erro.textContent = falha.message;
        erro.hidden = false;
      }
    });
    input.focus();
    input.select();
  }

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
    const isAdmin = _possoGerir();
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

// Renomear (lápis ao lado do nome, 2026-09-14 — no modal do produto e na
// linha do complemento). O nome vira um campo ali mesmo, com "Salvar nome"
// e "Cancelar" — sem janela do navegador, a pedido da Julia; o clique em
// Salvar é a confirmação, e a ajuda embaixo do campo diz o que muda. Com
// item do cardápio, muda em todas as lojas e o nome antigo fica como
// vínculo, pra venda que ainda chegar com ele continuar reconhecida
// (renomear_item_cardapio); produto sem item (sem ficha) muda só naquela
// loja. Erro volta como exceção, pra aparecer embaixo do campo.
const AJUDA_RENOMEAR_ITEM = 'Muda em todas as lojas. Troque na Cardápio Web também: enquanto lá estiver o nome antigo, os pedidos continuam sendo reconhecidos.';

async function _salvarNovoNomeCardapio({ itemId, precoCardapioId, novoNome }) {
  const rota = itemId ? `/api/itens-cardapio/${itemId}/nome` : `/api/precos-cardapio/${precoCardapioId}/nome`;
  const resposta = await fetch(rota, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: novoNome }),
  });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível renomear.');
  itensCardapioTodosCache = null;
  return dados;
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
    <div class="detalhe-produto-secao">
      <div class="receita-eyebrow">Embalagem pra viagem</div>
      <div class="ficha-tecnica-ingredientes">
        ${(dadosInsumos.embalagemViagem || []).length ? dadosInsumos.embalagemViagem.map(ins => `
          <span class="ficha-tecnica-chip">${escaparHtml(ins.nome)}${ins.quantidade != null ? ` <span class="qtd">(${_formatarQuantidadeFicha(ins)})</span>` : ''}</span>
        `).join('') : `<span class="ficha-tecnica-vazio">Nenhuma. Ela sai do estoque só nos pedidos de delivery e retirada.</span>`}
      </div>
      ${isAdmin ? `
        <button type="button" class="btn-secondary-sm" data-acao="detalhe-editar-embalagem" style="align-self: flex-start;">
          <i data-lucide="pencil"></i>
          Editar embalagem
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
      <div class="modal-actions detalhe-produto-acoes">
        <div class="detalhe-produto-acoes-extra">
          <button type="button" class="btn-secondary-sm btn-excluir" id="btn-detalhe-produto-tirar">
            <i data-lucide="circle-minus"></i>
            Tirar do cardápio desta loja
          </button>
        </div>
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
    // Nome primeiro: se ele for recusado (já existe outro com esse nome), o
    // aviso aparece embaixo do título e nada mais é salvo.
    const campoNome = document.getElementById('detalhe-produto-nome-input');
    const novoNome = campoNome && !campoNome.hidden ? campoNome.value.trim() : '';
    if (novoNome && novoNome !== produto.nome) {
      try {
        const dados = await _salvarNovoNomeCardapio({ itemId: produto.itemCardapioId, precoCardapioId, novoNome });
        produto.nome = dados.nome;
        if (dados.lojasIgnoradas?.length) {
          alert(`Em ${dados.lojasIgnoradas.join(', ')} já existia um produto chamado "${dados.nome}", então lá ficou o nome antigo.`);
        }
      } catch (falha) {
        const ajudaNome = document.getElementById('detalhe-produto-nome-ajuda');
        ajudaNome.textContent = falha.message;
        ajudaNome.classList.add('erro');
        ajudaNome.hidden = false;
        botao.disabled = false;
        botao.textContent = 'Salvar';
        return;
      }
    }
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

  // Insumos e embalagem são editados no mesmo modal da ficha técnica.
  corpo.querySelectorAll('#btn-detalhe-produto-editar-insumos, [data-acao="detalhe-editar-embalagem"]').forEach((botao) => {
    botao.addEventListener('click', () => {
      fecharModalDetalheProduto();
      abrirModalFichaTecnicaItem(produto.itemCardapioId);
    });
  });

  // Nome editável direto no título (pedido da Julia, 2026-09-14): pra
  // admin, o título é um campo; o lápis só leva o cursor pra ele. O nome
  // novo é salvo junto com preço e custo, no Salvar do modal — ver o
  // handler de Salvar acima e _salvarNovoNomeCardapio. Os elementos são
  // fixos no cabeçalho do modal, por isso on* (cada produto aberto troca os
  // do anterior).
  const inputNome = document.getElementById('detalhe-produto-nome-input');
  const lapis = document.getElementById('btn-detalhe-produto-renomear');
  if (inputNome && lapis) {
    const ajudaNome = document.getElementById('detalhe-produto-nome-ajuda');
    document.getElementById('detalhe-produto-titulo').hidden = isAdmin;
    inputNome.hidden = !isAdmin;
    lapis.hidden = !isAdmin;
    inputNome.value = produto.nome;
    ajudaNome.hidden = true;
    ajudaNome.classList.remove('erro');
    inputNome.oninput = () => {
      const mudou = inputNome.value.trim() !== produto.nome;
      ajudaNome.classList.remove('erro');
      ajudaNome.textContent = produto.itemCardapioId
        ? `Ao salvar, o nome muda em todas as lojas. ${AJUDA_RENOMEAR_ITEM.replace(/^Muda em todas as lojas\. /, '')}`
        : `Ao salvar, o nome muda só no cardápio da ${fichaTecnicaLojaAtual}.`;
      ajudaNome.hidden = !mudou;
    };
    inputNome.onkeydown = (evento) => {
      if (evento.key === 'Enter') {
        evento.preventDefault();
        document.getElementById('btn-detalhe-produto-salvar')?.click();
      }
    };
    lapis.onclick = () => {
      inputNome.focus();
      inputNome.select();
    };
  }

  document.getElementById('btn-detalhe-produto-tirar')?.addEventListener('click', async () => {
    const aviso = [
      `Tirar "${produto.nome}" do cardápio da ${fichaTecnicaLojaAtual}?`,
      '',
      'Ele some da lista desta loja, junto com os preços e a foto.',
      produto.itemCardapioId ? 'A ficha técnica fica guardada: se ele voltar pro cardápio com o mesmo nome, ela volta junto.' : '',
      'Nas outras lojas nada muda.',
    ].filter((linha, i) => linha || i === 1).join('\n');
    if (!confirm(aviso)) return;
    try {
      const resposta = await fetch(`/api/precos-cardapio/${precoCardapioId}`, { method: 'DELETE' });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível tirar do cardápio.');
      fecharModalDetalheProduto();
      await carregarFichaTecnicaAtual();
    } catch (erro) {
      alert(erro.message);
    }
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

// Liga as linhas novas das duas listas do modal: insumos e embalagem pra viagem.
function _wireLinhasFichaTecnica() {
  document.querySelectorAll('#form-ficha-tecnica-item .ficha-tecnica-linha:not([data-ligada])').forEach(linha => {
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
  // As duas Tradiças dividem a ficha (GRUPOS_FICHA_COMPARTILHADA no backend):
  // salvar numa grava nas duas.
  const lojasDaFicha = fichaTecnicaLojaAtual.startsWith('Tradiça ') ? 'Tradiça ZN e Tradiça Simus' : fichaTecnicaLojaAtual;
  document.getElementById('ficha-tecnica-item-titulo').textContent = `Ficha técnica — ${produto?.nome || ''} (${lojasDaFicha})`;
  document.getElementById('ficha-tecnica-colar-texto').value = '';
  document.getElementById('ficha-tecnica-colar-resultado').textContent = '';

  const container = document.getElementById('ficha-tecnica-item-linhas');
  const linhasIniciais = dados.insumos.length
    ? dados.insumos
    : [{ insumoId: fichaTecnicaInsumosDisponiveis[0].id, quantidade: null }];
  container.innerHTML = linhasIniciais.map(ins => _linhaFichaTecnicaHTML(ins.insumoId, ins.quantidade)).join('');

  // Embalagem pra viagem: só em produto — complemento vai dentro do produto,
  // que já leva a embalagem dele.
  const secaoEmbalagem = document.getElementById('ficha-tecnica-embalagem-secao');
  secaoEmbalagem.style.display = fichaTecnicaTipoAtual === 'complemento' ? 'none' : '';
  document.getElementById('ficha-tecnica-embalagem-linhas').innerHTML = (dados.embalagemViagem || [])
    .map(ins => _linhaFichaTecnicaHTML(ins.insumoId, ins.quantidade)).join('');
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

function _adicionarLinhaFichaTecnica(idContainer) {
  if (!fichaTecnicaInsumosDisponiveis.length) return;
  const container = document.getElementById(idContainer);
  container.insertAdjacentHTML('beforeend', _linhaFichaTecnicaHTML(fichaTecnicaInsumosDisponiveis[0].id, null));
  _wireLinhasFichaTecnica();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

document.getElementById('btn-ficha-tecnica-add-linha')?.addEventListener('click', () => _adicionarLinhaFichaTecnica('ficha-tecnica-item-linhas'));
document.getElementById('btn-ficha-tecnica-add-embalagem')?.addEventListener('click', () => _adicionarLinhaFichaTecnica('ficha-tecnica-embalagem-linhas'));

function _linhasDaListaFichaTecnica(idContainer) {
  return [...document.querySelectorAll(`#${idContainer} .ficha-tecnica-linha`)].map(linha => ({
    insumoId: parseInt(linha.querySelector('.ficha-tecnica-select-insumo').value, 10),
    quantidade: _quantidadeBaseDaLinhaFicha(linha),
  }));
}

document.getElementById('form-ficha-tecnica-item')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!fichaTecnicaEditandoItemId) return;

  const insumos = _linhasDaListaFichaTecnica('ficha-tecnica-item-linhas');
  const corpo = { loja: fichaTecnicaLojaAtual, insumos };
  // Seção escondida (complemento) não manda a lista: a embalagem gravada fica.
  if (document.getElementById('ficha-tecnica-embalagem-secao').style.display !== 'none') {
    corpo.embalagemViagem = _linhasDaListaFichaTecnica('ficha-tecnica-embalagem-linhas');
  }

  try {
    const resposta = await fetch(`/api/itens-cardapio/${fichaTecnicaEditandoItemId}/ficha-tecnica`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
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

// --- POR QUE O PRODUTO ESTÁ SEM CMV (card #39, 18/09) ---
// Antes a tela dizia só "falta preço de algum insumo"; achar qual era abrir
// ficha por ficha. Agora o servidor manda o motivo de cada produto e o que
// destrava mais produtos de uma vez.
const ROTULO_MOTIVO_CMV = {
  precoVenda: 'sem preço de venda no cardápio',
  semFicha: 'sem ficha técnica nessa loja',
  insumoSemCusto: 'insumo sem custo',
  complementoSemCusto: 'complemento vendido junto sem custo',
};

function _textoMotivosSemCmv(motivos) {
  return motivos.map((m) => (m.nomes.length
    ? `${ROTULO_MOTIVO_CMV[m.tipo] || m.tipo}: ${m.nomes.join(', ')}`
    : ROTULO_MOTIVO_CMV[m.tipo] || m.tipo)).join(' · ');
}

function _renderPendenciasCmv(d) {
  const alvo = document.getElementById('curva-pendencias');
  if (!alvo) return;
  const semCmv = d.itens.filter((i) => i.margem === null);
  if (!semCmv.length) {
    alvo.style.display = 'none';
    return;
  }
  const ranking = (d.pendenciasCmv || []).filter((r) => r.tipo === 'insumoSemCusto' || r.tipo === 'complementoSemCusto');
  const semPrecoVenda = semCmv.filter((i) => (i.motivosSemCmv || []).some((m) => m.tipo === 'precoVenda'));
  const semFicha = semCmv.filter((i) => (i.motivosSemCmv || []).some((m) => m.tipo === 'semFicha'));

  const blocoRanking = ranking.length ? `
    <div class="curva-pendencias-bloco">
      <h4>O que destrava mais</h4>
      <ul>
        ${ranking.map((r) => `
          <li>
            <details>
              <summary>
                <strong>${escaparHtml(r.nome)}</strong>
                <span class="text-muted">— ${escaparHtml(ROTULO_MOTIVO_CMV[r.tipo])}</span>
                <span class="curva-pendencias-conta">trava ${r.produtos.length} ${r.produtos.length === 1 ? 'produto' : 'produtos'}</span>
              </summary>
              <span class="text-muted">${escaparHtml(r.produtos.join(', '))}</span>
            </details>
          </li>
        `).join('')}
      </ul>
    </div>` : '';

  const blocoPreco = semPrecoVenda.length ? `
    <div class="curva-pendencias-bloco">
      <h4>Sem preço de venda (${semPrecoVenda.length})</h4>
      <p class="text-muted">O custo está calculado, mas o produto não tem preço na lista de preços do Cardápio, então a porcentagem não fecha: ${escaparHtml(semPrecoVenda.map((i) => i.nome).join(', '))}.</p>
    </div>` : '';

  const blocoFicha = semFicha.length ? `
    <div class="curva-pendencias-bloco">
      <h4>Sem ficha técnica (${semFicha.length})</h4>
      <p class="text-muted">${escaparHtml(semFicha.map((i) => i.nome).join(', '))}.</p>
    </div>` : '';

  alvo.innerHTML = `
    <div class="curva-pendencias-topo">
      <strong>Por que ${semCmv.length} ${semCmv.length === 1 ? 'produto está' : 'produtos estão'} sem CMV</strong>
      <span class="text-muted">Preencha o custo no cadastro do insumo (Insumos → editar) ou a ficha do complemento (Cardápio → Complementos).</span>
    </div>
    ${blocoRanking}${blocoPreco}${blocoFicha}
  `;
  alvo.style.display = '';
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
    partes.push(`${semCmv} produto(s) aparecem sem CMV — o motivo de cada um está logo abaixo.`);
  }
  aviso.innerHTML = partes.join(' ');
  aviso.style.display = partes.length ? '' : 'none';
  _renderPendenciasCmv(d);

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
        <td><span class="curva-tag ${classe}" ${i.motivosSemCmv && i.motivosSemCmv.length ? `title="${escaparHtml(_textoMotivosSemCmv(i.motivosSemCmv))}"` : ''}>${texto}</span></td>
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

// --- EVOLUÇÃO DO PREÇO DE UM INSUMO (card #40, 18/09) ---
// O histórico de compra (2.635 pedidos da VMarket + o que entra pelo sistema)
// vira série no tempo: o que mais subiu ou caiu no período, e o gráfico de
// cada compra de um insumo. Preço é sempre o pago de fato (compra recebida);
// cotação aparece como ponto solto, porque é oferta, não pagamento.
let precosDias = 90;
let precosVariacoes = [];
let precosInsumosPorNome = new Map();
let precosGraficoInstance = null;

function _variacaoHTML(v) {
  const sinal = v.variacaoPct > 0 ? '+' : '';
  const classe = v.variacaoPct > 0 ? 'precos-sobe' : 'precos-desce';
  return `<span class="${classe}">${sinal}${String(v.variacaoPct).replace('.', ',')}%</span>`;
}

function _linhaRankingPreco(v) {
  return `
    <li>
      <button type="button" class="precos-ranking-item" data-insumo-id="${v.insumoId}">
        <span class="precos-ranking-nome">
          ${escaparHtml(v.nome)}
          ${v.suspeito ? '<span class="badge-pill neu-orange" title="Preço 4x maior ou menor que o anterior: quase sempre é compra lançada em outra unidade (caixa em vez de unidade)">confira a unidade</span>' : ''}
        </span>
        <span class="precos-ranking-valores">
          R$ ${_formatarPrecoUnitario(v.precoAntes)} → R$ ${_formatarPrecoUnitario(v.precoAgora)}
          ${_variacaoHTML(v)}
        </span>
      </button>
    </li>`;
}

function renderVariacoesPreco() {
  // Preço 4x diferente quase sempre é unidade trocada, não aumento: vai pro
  // fim da lista pra não esconder a variação de verdade.
  const reaisPrimeiro = (lista) => [...lista.filter((v) => !v.suspeito), ...lista.filter((v) => v.suspeito)];
  const altas = reaisPrimeiro(precosVariacoes.filter((v) => v.variacaoPct > 0)).slice(0, 10);
  const quedas = reaisPrimeiro(precosVariacoes.filter((v) => v.variacaoPct < 0).sort((a, b) => a.variacaoPct - b.variacaoPct)).slice(0, 10);
  const vazio = (texto) => `<li class="precos-vazio">${texto}</li>`;
  document.getElementById('precos-altas').innerHTML = altas.length ? altas.map(_linhaRankingPreco).join('') : vazio('Nenhum insumo ficou mais caro no período.');
  document.getElementById('precos-quedas').innerHTML = quedas.length ? quedas.map(_linhaRankingPreco).join('') : vazio('Nenhum insumo ficou mais barato no período.');
  const total = precosVariacoes.length;
  const periodo = precosDias >= 365 ? 'no último ano' : `nos últimos ${precosDias} dias`;
  document.getElementById('precos-altas-sub').textContent = `${precosVariacoes.filter((v) => v.variacaoPct > 0).length} de ${total} insumos comprados ${periodo}`;
  document.getElementById('precos-quedas-sub').textContent = `${precosVariacoes.filter((v) => v.variacaoPct < 0).length} de ${total} insumos comprados ${periodo}`;
  document.querySelectorAll('.precos-ranking-item').forEach((botao) => {
    botao.addEventListener('click', () => abrirHistoricoPreco(parseInt(botao.dataset.insumoId, 10)));
  });
}

async function carregarVariacoesPreco() {
  try {
    const resposta = await fetch(`/api/precos/variacoes?dias=${precosDias}`);
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    precosVariacoes = (await resposta.json()).variacoes || [];
    renderVariacoesPreco();
  } catch (erro) {
    console.error('Falha ao carregar variações de preço:', erro);
    document.getElementById('precos-altas').innerHTML = '<li class="precos-vazio">Não foi possível carregar.</li>';
  }
}

async function carregarInsumosParaBuscaDePreco() {
  try {
    const resposta = await fetch('/api/insumos');
    if (!resposta.ok) return;
    const insumos = (await resposta.json()).insumos || [];
    precosInsumosPorNome = new Map(insumos.map((i) => [i.nome, i.id]));
    document.getElementById('precos-lista-insumos').innerHTML = insumos
      .map((i) => `<option value="${escaparHtml(i.nome)}"></option>`).join('');
  } catch (erro) {
    console.error('Falha ao carregar insumos pra busca de preço:', erro);
  }
}

// Meio-dia no fuso de quem usa: a data do banco vira ponto no eixo sem
// escorregar pro dia anterior por causa do UTC.
function _instanteDoDia(iso) {
  return new Date(`${String(iso).slice(0, 10)}T12:00:00`).getTime();
}

function _dataCurtaDoInstante(ms) {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
}

async function abrirHistoricoPreco(insumoId) {
  try {
    const resposta = await fetch(`/api/precos/insumo/${insumoId}`);
    if (!resposta.ok) throw new Error(`Erro no servidor Flask: ${resposta.status}`);
    const d = await resposta.json();
    const compras = d.compras || [];
    const unidade = d.insumo.unidade_medida;

    document.getElementById('precos-insumo-titulo').textContent = d.insumo.nome;
    document.getElementById('precos-busca-insumo').value = d.insumo.nome;

    if (!compras.length) {
      document.getElementById('precos-insumo-sub').textContent = 'Nenhuma compra recebida desse insumo ainda.';
      ['precos-resumo', 'precos-grafico-area', 'precos-tabela-area'].forEach((id) => { document.getElementById(id).style.display = 'none'; });
      return;
    }

    const precos = compras.map((c) => c.preco);
    const ultima = compras[compras.length - 1];
    const primeira = compras[0];
    const variacaoTotal = ((ultima.preco - primeira.preco) / primeira.preco) * 100;
    document.getElementById('precos-insumo-sub').textContent =
      `${compras.length} ${compras.length === 1 ? 'compra recebida' : 'compras recebidas'} desde ${_dataBR(primeira.data)} · preço por ${unidade}`;

    document.getElementById('precos-resumo').innerHTML = `
      <div><span class="precos-rotulo">Último preço</span><strong>R$ ${_formatarPrecoUnitario(ultima.preco)}</strong><small>${_dataBR(ultima.data)} · ${escaparHtml(ultima.fornecedor || '—')}</small></div>
      <div><span class="precos-rotulo">Menor pago</span><strong>R$ ${_formatarPrecoUnitario(Math.min(...precos))}</strong></div>
      <div><span class="precos-rotulo">Maior pago</span><strong>R$ ${_formatarPrecoUnitario(Math.max(...precos))}</strong></div>
      <div><span class="precos-rotulo">Desde a primeira compra</span><strong>${_variacaoHTML({variacaoPct: Math.round(variacaoTotal * 10) / 10})}</strong></div>
    `;
    document.getElementById('precos-resumo').style.display = '';

    const estilo = getComputedStyle(document.body);
    const corTexto = estilo.getPropertyValue('--text-muted').trim() || '#71717A';
    const corGrade = estilo.getPropertyValue('--border-color').trim() || '#E6DDCC';
    const pontos = compras.map((c) => ({ x: _instanteDoDia(c.data), y: c.preco, data: c.data, fornecedor: c.fornecedor, loja: c.loja }));
    const ofertas = (d.cotacoes || []).map((c) => ({ x: _instanteDoDia(c.data), y: c.preco, data: c.data, fornecedor: c.fornecedor }));

    if (precosGraficoInstance) precosGraficoInstance.destroy();
    document.getElementById('precos-grafico-area').style.display = '';
    precosGraficoInstance = new Chart(document.getElementById('precos-grafico').getContext('2d'), {
      type: 'line',
      data: {
        datasets: [
          { label: 'Preço pago', data: pontos, borderColor: CORES_GRAFICO[0], backgroundColor: CORES_GRAFICO[0], tension: 0.2, pointRadius: 3, borderWidth: 2 },
          { label: 'Cotação recebida', data: ofertas, showLine: false, borderColor: CORES_GRAFICO[1], backgroundColor: CORES_GRAFICO[1], pointRadius: 3, pointStyle: 'rectRot' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: { labels: { color: corTexto, boxWidth: 10 } },
          tooltip: {
            callbacks: {
              title: (itens) => _dataBR(itens[0].raw.data),
              label: (item) => `${item.dataset.label}: R$ ${_formatarPrecoUnitario(item.raw.y)} · ${item.raw.fornecedor || '—'}${item.raw.loja ? ` · ${item.raw.loja}` : ''}`,
            },
          },
        },
        scales: {
          x: { type: 'linear', ticks: { color: corTexto, maxTicksLimit: 8, callback: (v) => _dataCurtaDoInstante(v) }, grid: { color: corGrade } },
          y: { beginAtZero: false, ticks: { color: corTexto, callback: (v) => `R$ ${_formatarPrecoUnitario(v)}` }, grid: { color: corGrade } },
        },
      },
    });

    document.getElementById('precos-tabela-body').innerHTML = [...compras].reverse().map((c) => `
      <tr>
        <td>${_dataBR(c.data)}</td>
        <td>${escaparHtml(c.fornecedor || '—')}</td>
        <td class="text-muted">${escaparHtml(c.loja || '—')}</td>
        <td>${_formatarQuantidade(c.quantidade, unidade)}</td>
        <td class="font-bold">R$ ${_formatarPrecoUnitario(c.preco)}</td>
      </tr>
    `).join('');
    document.getElementById('precos-tabela-area').style.display = '';
  } catch (erro) {
    console.error('Falha ao carregar histórico de preço:', erro);
    document.getElementById('precos-insumo-sub').textContent = 'Não foi possível carregar o histórico desse insumo.';
  }
}

if (document.getElementById('precos-altas')) {
  document.querySelectorAll('#precos-periodo .curva-periodo-btn').forEach((botao) => {
    botao.addEventListener('click', () => {
      document.querySelectorAll('#precos-periodo .curva-periodo-btn').forEach((b) => b.classList.remove('active'));
      botao.classList.add('active');
      precosDias = parseInt(botao.dataset.dias, 10);
      carregarVariacoesPreco();
    });
  });
  document.getElementById('precos-busca-insumo')?.addEventListener('change', (evento) => {
    const id = precosInsumosPorNome.get(evento.target.value);
    if (id) abrirHistoricoPreco(id);
  });
  carregarVariacoesPreco();
  carregarInsumosParaBuscaDePreco();
}
