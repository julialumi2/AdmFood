document.addEventListener('DOMContentLoaded', () => {

  // 1. INICIALIZA ÍCONES LUCIDE
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // 2. INICIALIZAÇÃO DE DATAS DA INTERFACE
  const hoje = new Date();

  // Data do Form (Input Date)
  const inputData = document.getElementById('data');
  if (inputData) {
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    inputData.value = `${ano}-${mes}-${dia}`;
  }

  // Data de Ontem para o Dashboard/Resumo
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

  // 3. BUSCA O FATURAMENTO REAL DA REDE VIA FLASK
  carregarDadosLojas();

  // 4. MÁSCARA FLUIDA DE MOEDA PARA O CAMPO PRESENCIAL
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

  // 5. ENVIO DO FORMULÁRIO DE FECHAMENTO
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
});

// ==============================================================================
// FUNÇÕES AUXILIARES E INTEGRAÇÃO DE APIs
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
    // Chamada segura para o seu servidor Python (Flask)
    const response = await fetch('http://127.0.0.1:5000/api/faturamento-ontem');

    if (!response.ok) {
      throw new Error(`Erro no servidor Flask: ${response.status}`);
    }

    const dados = await response.json();

    // 1. Atualiza o Total da Rede no topo
    if (totalRedeElem) {
      totalRedeElem.textContent = dados.total_rede.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    }

    // 2. Renderiza os cards das unidades no HTML
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

    // Reativa os ícones da biblioteca Lucide
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
  const email = document.getElementById("email").value;
  console.log("Tentando logar com:", email);
  window.location.href = "dashboard.html";
}

function loginGoogle() {
  alert("Redirecionando para autenticação do Google...");
}

// QUADRO DE TAREFAS (KANBAN / IA)
function criarCardElemento(tarefa) {
  const card = document.createElement('div');
  card.classList.add('task-card');
  card.setAttribute('data-id', tarefa.id);

  const priorityClass = `priority-${tarefa.prioridade.toLowerCase()}`;

  card.innerHTML = `
    <div class="card-top">
      <h4 class="task-title">${tarefa.titulo}</h4>
      <span class="badge ${priorityClass}">${tarefa.prioridade}</span>
    </div>
    <div class="card-bottom">
      <span class="task-meta">${tarefa.responsavel} · ${tarefa.unidade}</span>
      <span class="task-date">${tarefa.prazo}</span>
    </div>`;

  return card;
}

function adicionarTarefaAoBoard(tarefa, status) {
  const container = document.getElementById(`list-${status}`);
  if (container) {
    const cardElement = criarCardElemento(tarefa);
    container.appendChild(cardElement);
    atualizarContadores();
  }
}

async function gerarTarefaComIA(promptUsuario) {
  const respostaIA = {
    id: Date.now(),
    titulo: "Auditoria preventiva de freezer",
    prioridade: "alta",
    responsavel: "Suporte IA",
    unidade: "Unidade 1",
    prazo: "Hoje"
  };

  adicionarTarefaAoBoard(respostaIA, 'open');
}

function atualizarContadores() {
  ['open', 'progress', 'done'].forEach(status => {
    const el = document.getElementById(`list-${status}`);
    const countEl = document.getElementById(`count-${status}`);
    if (el && countEl) {
      countEl.innerText = `${el.children.length} tarefa(s)`;
    }
  });
}