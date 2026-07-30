document.addEventListener('DOMContentLoaded', () => {

    // Inicializa ícones do Lucide
    lucide.createIcons();
    // --------------------------------------------------------------------------
    // 1. INICIALIZAÇÃO DE DATAS
    // --------------------------------------------------------------------------
    const hoje = new Date();

     function redirecionarLogin() {
      window.location.href = "login.html"; 
    }

    function redirecionarRegistro() {
      window.location.href = "registro.html"; 
    }

    function realizarLogin(event) {
      event.preventDefault(); // Evita recarregar a página
      
      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;

      // Exemplo de direcionamento para o painel de redes após login
      console.log("Tentando logar com:", email);
      
      // Aqui você altera para a URL do seu painel principal (ex: dashboard.html ou /dashboard)
      window.location.href = "dashboard.html"; 
    }

    function loginGoogle() {
      alert("Redirecionando para autenticação do Google...");
    }

    // Função para criar o HTML do Card reutilizando as classes CSS
    function criarCardElemento(tarefa) {
        const card = document.createElement('div');
        card.classList.add('task-card');
        card.setAttribute('data-id', tarefa.id);

     // Mapeia a prioridade para a classe CSS correspondente
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

    // Exemplo de inclusão de tarefa dinamicamente
    function adicionarTarefaAoBoard(tarefa, status) {
    // status pode ser: 'open', 'progress' ou 'done'
    const container = document.getElementById(`list-${status}`);
        if (container) {
            const cardElement = criarCardElemento(tarefa);
        container.appendChild(cardElement);
    atualizarContadores();
  }
}

    // Exemplo: Simulação do retorno de uma Chamada de IA (Ex: Gemini/OpenAI API)
    async function gerarTarefaComIA(promptUsuario) {
        // Aqui você faria o fetch para seu backend / API da IA
        // Exemplo de resposta JSON formatada que a IA retornaria:
    const respostaIA = {
        id: Date.now(),
        titulo: "Auditoria preventiva de freezer",
        prioridade: "alta", // alta, media ou baixa
        responsavel: "Suporte IA",
        unidade: "Unidade 1",
        prazo: "Hoje"
  };

  // Insere a tarefa gerada automaticamente na coluna 'Aberto'
  adicionarTarefaAoBoard(respostaIA, 'open');
}

    // Função utilitária para atualizar a contagem do cabeçalho de cada coluna
    function atualizarContadores() {
    ['open', 'progress', 'done'].forEach(status => {
    const total = document.getElementById(`list-${status}`).children.length;
    document.getElementById(`count-${status}`).innerText = `${total} tarefa(s)`;
  });
}
    
    // Preenche o input date no formato YYYY-MM-DD para evitar problemas de fuso/UTC
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

    // Atualiza os títulos dinâmicos
    const elDataOntem = document.getElementById('data-ontem');
    if (elDataOntem) elDataOntem.textContent = dataOntemFormatada;

    const elDataGrafico = document.getElementById('data-grafico-sub');
    if (elDataGrafico) elDataGrafico.textContent = dataOntemFormatada;

    // --------------------------------------------------------------------------
    // 2. MÁSCARA FLUIDA DE MOEDA PARA O CAMPO PRESENCIAL
    // --------------------------------------------------------------------------
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

    // --------------------------------------------------------------------------
    // 3. ENVIO DO FORMULÁRIO DE FECHAMENTO
    // --------------------------------------------------------------------------
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

    // --------------------------------------------------------------------------
    // 4. CONSULTA DE STATUS DA LOJA (CARDÁPIO WEB / IFOOD)
    // --------------------------------------------------------------------------
    async function sincronizarPainelRede() {
        const merchantId = "5f8e6f9d-247e-4f67-80dc-973533735dfd";
        const token = "SEU_TOKEN_AQUI"; // ⚠️ Substitua pelo seu token real de API

        try {
            const resposta = await fetch(`https://ifood.cardapioweb.com/v1/merchants/${merchantId}/status`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!resposta.ok) throw new Error(`Status HTTP: ${resposta.status}`);

            const dados = await resposta.json();

            // Mapeia o container de exibições
            const cardsGrid = document.getElementById('container-lojas') || document.querySelector('.cards-grid');
            if (!cardsGrid) return;

            // Limpa o container antes de renderizar
            cardsGrid.innerHTML = '';

            // Trata o status retornado pela API do iFood/Cardápio Web
            const statusLoja = dados.status || 'DESCONHECIDO';
            const statusAberto = statusLoja === 'OK' || statusLoja === 'OPEN';
            
            const badgeClasse = statusAberto ? 'pos' : 'neg';
            const iconeStatus = statusAberto ? 'check-circle' : 'alert-circle';
            const textoStatus = statusAberto ? 'Loja Aberta' : 'Loja Fechada / Indisponível';

            const cardHTML = `
                <div class="store-card">
                    <span class="card-subtitle">STATUS IFOOD</span>
                    <h4 class="store-name">Unidade Cardápio Web</h4>
                    <div class="store-value">${statusLoja}</div>
                    <div class="badge-pill ${badgeClasse}">
                        <i data-lucide="${iconeStatus}"></i> 
                        ${textoStatus}
                    </div>
                </div>
            `;

            cardsGrid.innerHTML = cardHTML;

            // Recria os ícones Lucide
            if (window.lucide) {
                lucide.createIcons();
            }

        } catch (erro) {
            console.error('Falha ao consultar status no Cardápio Web:', erro);
            const cardsGrid = document.getElementById('container-lojas') || document.querySelector('.cards-grid');
            if (cardsGrid) {
                cardsGrid.innerHTML = `<p class="erro-msg">Não foi possível carregar o status da loja.</p>`;
            }
        }
    }

    // Executa a consulta
    sincronizarPainelRede();
});