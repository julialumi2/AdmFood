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