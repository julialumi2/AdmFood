// Preenche a data de hoje automaticamente ao carregar
document.getElementById('data').valueAsDate = new Date();

// Máscara fluida para o campo de presencial
const inputPresencial = document.getElementById('presencial');

if (inputPresencial) {
    inputPresencial.addEventListener('input', function(e) {
        // 1. Obtém apenas os números digitados
        let apenasNumeros = e.target.value.replace(/\D/g, '');

        // 2. Se apagar tudo, limpa o campo
        if (!apenasNumeros) {
            e.target.value = '';
            return;
        }

        // 3. Converte para o formato de moeda (R$) dividindo por 100
        let valorDecimal = (parseFloat(apenasNumeros) / 100).toFixed(2);

        // 4. Formata com ponto nos milhares e vírgula nos centavos
        let partes = valorDecimal.split('.');
        partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');

        e.target.value = partes.join(',');
    });
}

// Envio do formulário
document.getElementById('form-fechamento').addEventListener('submit', async function(e) {
    e.preventDefault();

    const btn = document.getElementById('btn-enviar');
    const msg = document.getElementById('mensagem');

    btn.disabled = true;
    btn.innerText = "Enviando e processando...";
    msg.innerText = "";
    msg.className = "status-msg";

    // Trata o valor presencial para enviar como número válido ao backend (ex: "1.250,50" -> 1250.50)
    const rawPresencial = document.getElementById('presencial').value;
    const presencialLimpo = rawPresencial ? parseFloat(rawPresencial.replace(/\./g, '').replace(',', '.')) : 0.0;

    const dados = {
        loja: document.getElementById('loja').value,
        data: document.getElementById('data').value,
        presencial: presencialLimpo
    };

    try {
        // CORRIGIDO: Atribuição do await na variável 'resposta'
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
            document.getElementById('form-fechamento').reset();
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