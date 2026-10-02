/* Página pública de reservas do Artesanos.
 *
 * Duas coisas acontecem aqui: a consulta de vaga, que roda sozinha assim
 * que a pessoa escolhe a data, e o envio. A consulta existe pra pessoa
 * poder TROCAR de data sabendo o que está fazendo — descobrir que lotou
 * só depois de preencher tudo é o jeito de perder a reserva e o cliente.
 *
 * Nada aqui é a regra de verdade: mínimo, máximo e teto do dia vêm do
 * servidor, que é quem decide. O que está no HTML é só o primeiro palpite,
 * pra tela não nascer vazia.
 */
(function () {
  'use strict';

  var form = document.getElementById('form-reserva');
  if (!form) return;

  var campoData = document.getElementById('r-data');
  var campoHora = document.getElementById('r-hora');
  var campoPessoas = document.getElementById('r-pessoas');
  var campoNome = document.getElementById('r-nome');
  var campoTelefone = document.getElementById('r-telefone');
  var campoObs = document.getElementById('r-obs');
  var botao = document.getElementById('btn-reservar');
  var erro = document.getElementById('form-erro');
  var dicaPessoas = document.getElementById('dica-pessoas');

  var caixaVagas = document.getElementById('vagas');
  var rotuloVagas = document.getElementById('vagas-rotulo');
  var contaVagas = document.getElementById('vagas-conta');
  var barraVagas = document.getElementById('vagas-ocupado');
  var recadoVagas = document.getElementById('vagas-recado');

  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
               'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
              'quinta-feira', 'sexta-feira', 'sábado'];

  // O servidor manda os limites na primeira consulta. Até lá, vale o que
  // está no HTML — e eles são só o estado inicial, nunca a decisão.
  var minimo = parseInt(campoPessoas.min, 10) || 5;
  var maximo = parseInt(campoPessoas.max, 10) || 40;
  var ultimaConsulta = 0;
  var temporizador = null;

  // ---------------------------------------------------------------- //

  function doisDigitos(n) { return (n < 10 ? '0' : '') + n; }

  function comoISO(data) {
    return data.getFullYear() + '-' + doisDigitos(data.getMonth() + 1) + '-' +
           doisDigitos(data.getDate());
  }

  /* Lê AAAA-MM-DD como data LOCAL. `new Date('2026-10-05')` seria lido
     como UTC e, de madrugada no Brasil, voltaria o dia anterior — a
     pessoa escolheria segunda e a página diria domingo. */
  function dataLocal(iso) {
    var p = (iso || '').split('-');
    if (p.length !== 3) return null;
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function porExtenso(iso) {
    var d = dataLocal(iso);
    if (!d || isNaN(d)) return iso;
    return DIAS[d.getDay()] + ', ' + d.getDate() + ' de ' + MESES[d.getMonth()];
  }

  function plural(n, um, muitos) { return n + ' ' + (n === 1 ? um : muitos); }

  function mostrarErro(texto) {
    erro.textContent = texto;
    erro.hidden = false;
    erro.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function limparErro() {
    erro.hidden = true;
    erro.textContent = '';
  }

  // ---------------------------------------------------------------- //
  // A janela de datas: de hoje até o limite que o servidor aceita.

  var hoje = new Date();
  campoData.min = comoISO(hoje);
  var limite = new Date(hoje.getTime());
  limite.setDate(limite.getDate() + 90);
  campoData.max = comoISO(limite);

  // ---------------------------------------------------------------- //
  // A consulta de vaga.

  function pintarVagas(estado) {
    caixaVagas.hidden = false;
    caixaVagas.classList.toggle('vagas-lotado', estado.lotado === true);
    caixaVagas.classList.toggle('vagas-carregando', estado.carregando === true);
    rotuloVagas.textContent = estado.rotulo;
    contaVagas.textContent = estado.conta || '';
    recadoVagas.textContent = estado.recado || '';
    barraVagas.style.width = (estado.ocupacao || 0) + '%';
  }

  function aplicarLimites(corpo) {
    minimo = corpo.minimo;
    maximo = corpo.maximo;
    campoPessoas.min = minimo;
    // O máximo do campo encolhe junto com o que sobrou no dia: não
    // adianta deixar a pessoa digitar 30 num dia que só tem 8.
    campoPessoas.max = Math.max(minimo, maximo);
    dicaPessoas.textContent = maximo >= minimo
      ? 'De ' + minimo + ' a ' + maximo
      : 'Esse dia não tem mais lugar';
    if (parseInt(campoPessoas.value, 10) > maximo) {
      campoPessoas.value = Math.max(minimo, maximo);
    }
  }

  function consultarVagas() {
    var data = campoData.value;
    if (!data) {
      caixaVagas.hidden = true;
      return;
    }

    var meu = ++ultimaConsulta;
    pintarVagas({ rotulo: 'Conferindo o dia…', carregando: true });

    var url = '/api/reservas/disponibilidade?data=' + encodeURIComponent(data) +
              (campoHora.value ? '&hora=' + encodeURIComponent(campoHora.value) : '');

    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json().then(function (c) { return { ok: r.ok, corpo: c }; }); })
      .then(function (res) {
        // Resposta de uma consulta velha: a pessoa já trocou de data.
        if (meu !== ultimaConsulta) return;

        if (!res.ok) {
          pintarVagas({
            rotulo: 'Essa data não dá',
            recado: res.corpo && res.corpo.erro ? res.corpo.erro : 'Escolha outra data.',
            lotado: true,
            ocupacao: 100
          });
          return;
        }

        var c = res.corpo;
        aplicarLimites(c);
        var ocupados = c.teto - c.livres;
        var ocupacao = c.teto > 0 ? Math.round((ocupados / c.teto) * 100) : 0;

        if (!c.aceita) {
          pintarVagas({
            rotulo: c.livres > 0 ? 'Quase lotado' : 'Dia lotado',
            conta: c.livres > 0 ? plural(c.livres, 'lugar', 'lugares') + ' de ' + c.teto : 'sem lugar',
            recado: c.livres > 0
              ? 'Sobram só ' + plural(c.livres, 'lugar', 'lugares') + ', e a reserva é a partir de ' +
                minimo + ' pessoas. Experimente outra data.'
              : 'Esse dia já encheu. Experimente outra data.',
            lotado: true,
            ocupacao: Math.max(ocupacao, 4)
          });
          return;
        }

        var apertado = c.livres <= Math.max(minimo * 2, Math.round(c.teto * 0.2));
        pintarVagas({
          rotulo: apertado ? 'Ainda cabe, mas está acabando' : 'Tem lugar',
          conta: plural(c.livres, 'lugar livre', 'lugares livres') + ' de ' + c.teto,
          recado: porExtenso(data) + (apertado ? ' — vale garantir agora.' : ''),
          ocupacao: ocupacao
        });
      })
      .catch(function () {
        if (meu !== ultimaConsulta) return;
        // Sem resposta, a página não inventa que cabe. O envio continua
        // liberado: quem decide de verdade é o servidor, na hora.
        pintarVagas({
          rotulo: 'Não deu pra conferir agora',
          recado: 'Pode enviar mesmo assim — a gente confirma por WhatsApp.'
        });
      });
  }

  function consultarDaquiAPouco() {
    clearTimeout(temporizador);
    temporizador = setTimeout(consultarVagas, 250);
  }

  campoData.addEventListener('change', consultarDaquiAPouco);
  campoData.addEventListener('input', consultarDaquiAPouco);
  campoHora.addEventListener('change', consultarDaquiAPouco);

  // ---------------------------------------------------------------- //
  // O envio.

  form.addEventListener('submit', function (evento) {
    evento.preventDefault();
    limparErro();

    var nome = campoNome.value.trim();
    var telefone = campoTelefone.value.trim();
    var pessoas = parseInt(campoPessoas.value, 10);

    if (!nome) return mostrarErro('Diga seu nome pra gente anotar a reserva.');
    if (telefone.replace(/\D/g, '').length < 10) {
      return mostrarErro('Deixa um telefone com DDD pra gente confirmar.');
    }
    if (!campoData.value || !campoHora.value) {
      return mostrarErro('Escolha a data e o horário da reserva.');
    }
    if (!pessoas || pessoas < minimo) {
      return mostrarErro('A reserva é pra grupo de ' + minimo + ' pessoas ou mais. ' +
                         'Pra menos que isso, pode chegar direto que a gente dá um jeito.');
    }

    botao.disabled = true;
    botao.textContent = 'Enviando…';

    fetch('/api/reservas/publica', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: nome,
        telefone: telefone,
        pessoas: pessoas,
        quando: campoData.value + 'T' + campoHora.value,
        observacao: campoObs.value.trim()
      })
    })
      .then(function (r) { return r.json().then(function (c) { return { ok: r.ok, corpo: c }; }); })
      .then(function (res) {
        botao.disabled = false;
        botao.textContent = 'Pedir reserva';

        if (!res.ok) {
          mostrarErro((res.corpo && res.corpo.erro) || 'Não deu pra registrar agora. Tenta de novo?');
          // Encheu entre a consulta e o envio: o medidor tem que contar a
          // verdade nova, senão a tela fica dizendo que cabe.
          if (res.corpo && res.corpo.lotado) consultarVagas();
          return;
        }
        celebrar(res.corpo);
      })
      .catch(function () {
        botao.disabled = false;
        botao.textContent = 'Pedir reserva';
        mostrarErro('A conexão falhou. Tenta de novo em instantes?');
      });
  });

  function celebrar(reserva) {
    var painel = document.getElementById('reserva-ok');
    var quando = (reserva.quando || '').split('T');
    document.getElementById('ok-nome').textContent = (reserva.nome || '').split(' ')[0] + '.';
    document.getElementById('ok-detalhe').textContent =
      'Mesa pra ' + plural(reserva.pessoas, 'pessoa', 'pessoas') + ', ' +
      porExtenso(quando[0]) + ', às ' + (quando[1] || '').slice(0, 5) + '.';
    form.hidden = true;
    painel.hidden = false;
    painel.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
})();
