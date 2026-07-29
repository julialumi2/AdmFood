document.addEventListener('DOMContentLoaded', () => {

    const hoje = new Date();
    
    const inputData = document.getElementById('data');
    if (inputData) {
        inputData.valueAsDate = hoje;
    }

    // Data de Ontem para o Dashboard/Resumo
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);

    const dataOntemFormatada = ontem.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    // Atualiza o título principal do dashboard se existir
    const elDataOntem = document.getElementById('data-ontem');
    if (elDataOntem) {
        elDataOntem.textContent = dataOntemFormatada;
    }

    // Atualiza o subtítulo do gráfico se existir
    const elDataGrafico = document.getElementById('data-grafico-sub');
    if (elDataGrafico) {
        elDataGrafico.textContent = dataOntemFormatada;
    }

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

            btn.disabled = true;
            btn.innerText = "Enviando e processando...";
            msg.innerText = "";
            msg.className = "status-msg";

            const rawPresencial = document.getElementById('presencial').value;
            const presencialLimpo = rawPresencial ? parseFloat(rawPresencial.replace(/\./g, '').replace(',', '.')) : 0.0;

            const dados = {
                loja: document.getElementById('loja').value,
                data: document.getElementById('data').value,
                presencial: presencialLimpo
            };

            try {
                const resposta = await fetch('/api/enviar-fechamento', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(dados)
                });

                const resultado = await resposta.json();

                if (resposta.ok) {
                    msg.innerText = "✅ Relatório processado e enviado com sucesso!";
                    msg.classList.add("sucesso");
                    formFechamento.reset();
                    document.getElementById('data').valueAsDate = new Date();
                } else {
                    msg.innerText = "❌ " + (resultado.mensagem || "Erro ao processar dados no servidor.");
                    msg.classList.add("erro");
                }
            } catch (erro) {
                console.error("Erro na requisição:", erro);
                msg.innerText = "❌ Falha ao conectar com o servidor.";
                msg.classList.add("erro");
            } finally {
                btn.disabled = false;
                btn.innerText = "🚀 Processar e Enviar Relatório";
            }
        });
    }
});