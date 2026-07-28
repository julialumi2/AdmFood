document.getElementById('data').valueAsDate = new Date();

document.getElementById('form-fechamento').addEventListener('submit', async function(e) {
    e.preventDefault();

    const btn = document.getElementById('btn-enviar');
    const msg = document.getElementById('mensagem');

    btn.disabled = true;
    btn.innerText = "Enviando e processando...";
    msg.innerText = "";
    msg.className = "status-msg";

    const dados = {
        loja: document.getElementById('loja').value,
        data: document.getElementById('data').value,
        presencial: parseFloat(document.getElementById('presencial').value)
    };

    try {
        const resposta = await fetch('/api/enviar-fechamento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        const resultado = await resposta.json();

        if (resposta.ok) {
            msg.innerText = "✅ Relatório processado e enviado com sucesso!";
            msg.classList.add("sucesso");
            document.getElementById('form-fechamento').reset();
            document.getElementById('data').valueAsDate = new Date();
        } else {
            msg.innerText = "❌ Erro: " + resultado.mensagem;
            msg.classList.add("erro");
        }
    } catch (erro) {
        msg.innerText = "❌ Falha ao conectar com o servidor.";
        msg.classList.add("erro");
    } finally {
        btn.disabled = false;
        btn.innerText = "🚀 Processar e Enviar Relatório";
    }
});