/*
 * O "robô" que roda dentro do WhatsApp Web.
 *
 * A cada fornecedor, o background.js leva esta aba pra
 *   https://web.whatsapp.com/send?phone=55DDDNUMERO&text=MENSAGEM
 * e o WhatsApp abre o chat já com a mensagem escrita na caixa. Este script
 * só precisa: esperar o chat abrir, conferir a mensagem, esperar um pouco,
 * clicar em Enviar, confirmar que saiu e avisar o background.js — que leva
 * a MESMA aba pro próximo fornecedor (a página recarrega e este script
 * começa de novo, do zero).
 *
 * No uso normal do WhatsApp (fora de um envio), o background.js responde
 * que não tem nada pra essa aba e o script não faz nada.
 *
 * Nada aqui trava o navegador: toda espera é um setTimeout dentro de uma
 * Promise (a página continua respondendo), e toda procura por um elemento
 * olha a página a cada meio segundo, com tempo máximo.
 */

(() => {
  // Uma execução por carregamento de página, mesmo se o script for injetado duas vezes.
  if (window.__admfoodEnvioWhatsapp) return;
  window.__admfoodEnvioWhatsapp = true;

  // O WhatsApp muda o HTML de tempos em tempos, então o botão de enviar é
  // procurado de vários jeitos, do mais estável ao mais antigo. O ícone
  // "send" é o antigo; hoje ele se chama "wds-ic-send-filled" e o botão tem
  // aria-label "Enviar". Se um dia nenhum funcionar, é aqui que se ajusta.
  const SELETORES_BOTAO_ENVIAR = [
    'button[aria-label="Enviar"]',
    'button[aria-label="Send"]',
    'span[data-icon="wds-ic-send-filled"]',
    'span[data-icon="send"]',
    '[data-testid="send"]',
    '[data-testid="compose-btn-send"]',
  ];
  // Caixa de digitar do chat aberto (no rodapé do chat; a busca de
  // conversas, no topo, também é um campo editável e não pode ser pega).
  const SELETORES_CAIXA_TEXTO = [
    '#main footer div[contenteditable="true"]',
    'footer div[contenteditable="true"]',
  ];

  // --- Pausas e esperas -------------------------------------------------

  const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

  // Um número sorteado entre min e max: o intervalo entre um envio e outro
  // nunca é igual, como seria com uma pessoa mandando.
  const sortear = (min, max) => Math.round(min + Math.random() * (max - min));

  // Avisa o background.js que a página está viva (senão, depois de 3 min
  // sem notícia, ele pula o fornecedor achando que travou).
  let ultimoSinal = 0;
  function sinalDeVida() {
    if (Date.now() - ultimoSinal < 15000) return;
    ultimoSinal = Date.now();
    chrome.runtime.sendMessage({ tipo: 'sinal-de-vida' }).catch(() => {});
  }

  // Espera um tempo longo em pedaços, mandando sinal de vida no caminho.
  async function esperarComSinal(ms) {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      await esperar(Math.min(5000, fim - Date.now()));
      sinalDeVida();
    }
  }

  // Olha a página a cada `intervalo` ms até `procurar()` devolver alguma
  // coisa (e devolve), ou até dar o tempo máximo (e devolve null).
  async function esperarPor(procurar, { tempoMaximo = 60000, intervalo = 500 } = {}) {
    const limite = Date.now() + tempoMaximo;
    while (Date.now() < limite) {
      const achado = procurar();
      if (achado) return achado;
      sinalDeVida();
      await esperar(intervalo);
    }
    return null;
  }

  // --- O que existe na tela ---------------------------------------------

  function acharPrimeiro(seletores) {
    for (const seletor of seletores) {
      const elemento = document.querySelector(seletor);
      if (elemento) return elemento;
    }
    return null;
  }

  function acharBotaoEnviar() {
    const elemento = acharPrimeiro(SELETORES_BOTAO_ENVIAR);
    // O ícone fica dentro do botão: o clique vai no botão em si.
    return elemento ? elemento.closest('button, [role="button"]') || elemento : null;
  }

  const acharCaixaTexto = () => acharPrimeiro(SELETORES_CAIXA_TEXTO);
  const textoDaCaixa = (caixa) => (caixa?.innerText || '').replace(/\s+/g, ' ').trim();

  // WhatsApp não conectado nesse Chrome: aparece o QR code.
  function precisaLerQrCode() {
    return Boolean(document.querySelector('[data-ref] canvas, canvas[aria-label*="QR" i], [data-testid="qrcode"]'));
  }

  // Número que não tem WhatsApp: "O número de telefone compartilhado
  // através de url é inválido."
  function acharAvisoNumeroInvalido() {
    for (const janela of document.querySelectorAll('[role="dialog"], [data-animate-modal-popup="true"]')) {
      const texto = (janela.innerText || '').toLowerCase();
      if (texto.includes('inválido') || texto.includes('invalid')) return janela;
    }
    return null;
  }

  function fecharAviso(janela) {
    janela?.querySelector('button')?.click();
  }

  // A última mensagem enviada ainda com o reloginho (o WhatsApp não
  // confirmou que recebeu). Se o HTML mudar e nada disso existir, a
  // resposta é "não está pendente" e a fila segue normalmente.
  function ultimaMensagemPendente() {
    const enviadas = document.querySelectorAll('#main .message-out');
    const ultima = enviadas[enviadas.length - 1];
    return Boolean(ultima?.querySelector('[data-icon="msg-time"], [data-icon*="clock" i]'));
  }

  // Um pedaço da mensagem que prova que ela é desse fornecedor: o link da
  // cotação (o token é único) ou, sem link, o começo do texto.
  function trechoDeConferencia(mensagem) {
    const link = mensagem.match(/https?:\/\/\S+/);
    return (link ? link[0] : mensagem.slice(0, 40)).replace(/\s+/g, ' ').trim();
  }

  // --- Conversa com o background.js ---------------------------------------

  async function perguntarEnvio(tentativas = 5) {
    for (let i = 0; i < tentativas; i += 1) {
      try {
        const tarefa = await chrome.runtime.sendMessage({ tipo: 'qual-envio' });
        if (tarefa) return tarefa;
      } catch {
        // Extensão recarregada no meio do caminho: tenta de novo.
      }
      if (i < tentativas - 1) await esperar(1000);
    }
    return null;
  }

  function avisarResultado(indice, status, motivo = null) {
    chrome.runtime.sendMessage({ tipo: 'resultado-envio', indice, status, motivo }).catch(() => {});
  }

  // --- O envio ----------------------------------------------------------

  async function enviar() {
    const tarefa = await perguntarEnvio();
    if (!tarefa) return; // não é a aba da fila: WhatsApp normal
    const { item, indice, posicao, total, ensaio } = tarefa;
    console.info(`[AdmFood]${ensaio ? ' (ensaio)' : ''} ${posicao}/${total}: ${item.fornecedor}`);

    // A cada 10 envios, uma pausa maior (45 a 90 s).
    if (posicao > 1 && (posicao - 1) % 10 === 0) {
      await esperarComSinal(sortear(45000, 90000));
    }

    // 1) Espera o chat abrir. Três jeitos de terminar: o QR code (WhatsApp
    //    desconectado), o aviso de número inválido, ou a caixa de texto.
    const situacao = await esperarPor(() => {
      if (precisaLerQrCode()) return 'sem-login';
      if (acharAvisoNumeroInvalido()) return 'numero-invalido';
      if (acharCaixaTexto()) return 'chat-aberto';
      return null;
    }, { tempoMaximo: 90000 });

    if (situacao === 'sem-login') return avisarResultado(indice, 'sem-login');
    if (situacao === 'numero-invalido') {
      fecharAviso(acharAvisoNumeroInvalido());
      return avisarResultado(indice, 'falhou', 'Esse número não tem WhatsApp (ou está errado).');
    }
    if (!situacao) return avisarResultado(indice, 'falhou', 'O chat não abriu em 90 s.');

    // 2) A mensagem vem escrita pela URL, mas às vezes demora um pouco a
    //    aparecer na caixa. Se não aparecer, escreve.
    let caixa = await esperarPor(() => {
      const atual = acharCaixaTexto();
      return textoDaCaixa(atual) ? atual : null;
    }, { tempoMaximo: 8000 });
    if (!caixa) {
      caixa = acharCaixaTexto();
      caixa.focus();
      document.execCommand('insertText', false, item.mensagem);
      await esperar(1000);
    }

    // 3) Segurança: só envia se a caixa tiver a mensagem DESSE fornecedor.
    if (!textoDaCaixa(acharCaixaTexto()).includes(trechoDeConferencia(item.mensagem))) {
      return avisarResultado(indice, 'falhou', 'A mensagem na caixa não era a esperada; não enviei.');
    }

    // Ensaio: chegou até aqui quer dizer que o número abriu o chat certo e a
    // mensagem certa está escrita. É tudo o que se quer conferir — o clique
    // em enviar não acontece (QA 22/09).
    if (ensaio) {
      await esperarComSinal(sortear(3000, 5000));
      return avisarResultado(indice, 'ensaio');
    }

    // 4) Pausa curta antes de clicar (2,5 a 6 s), como alguém que confere
    //    a mensagem antes de mandar.
    await esperarComSinal(sortear(2500, 6000));

    // 5) Confere de novo se ainda é pra enviar: alguém pode ter clicado em
    //    Parar no AdmFood durante as esperas.
    const aindaVale = await perguntarEnvio(1);
    if (!aindaVale || aindaVale.indice !== indice) return;

    // 6) Clica em Enviar. Se a mensagem continuar na caixa depois de 3 s,
    //    tenta com a tecla Enter.
    const botao = await esperarPor(acharBotaoEnviar, { tempoMaximo: 15000 });
    if (!botao) return avisarResultado(indice, 'falhou', 'Não achei o botão de enviar.');
    botao.click();

    const caixaVazia = () => !textoDaCaixa(acharCaixaTexto());
    let saiu = await esperarPor(caixaVazia, { tempoMaximo: 3000 });
    if (!saiu) {
      acharCaixaTexto()?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true,
      }));
      saiu = await esperarPor(caixaVazia, { tempoMaximo: 12000 });
    }
    if (!saiu) return avisarResultado(indice, 'falhou', 'Cliquei em enviar, mas a mensagem ficou na caixa.');

    // 7) Espera o WhatsApp confirmar (o reloginho some da mensagem). Mesmo
    //    se passar do tempo, ela já está na fila do próprio WhatsApp e sai
    //    quando a conexão deixar.
    await esperarPor(() => !ultimaMensagemPendente(), { tempoMaximo: 30000 });

    // 8) Intervalo antes do próximo fornecedor (6 a 14 s, fora o tempo de
    //    o WhatsApp carregar de novo): uns 20 a 35 s por fornecedor.
    await esperarComSinal(sortear(6000, 14000));
    avisarResultado(indice, 'enviado');
  }

  enviar().catch((erro) => {
    console.error('[AdmFood] Falha no envio:', erro);
    perguntarEnvio(1).then((tarefa) => {
      if (tarefa) avisarResultado(tarefa.indice, 'falhou', 'Erro inesperado na página do WhatsApp.');
    });
  });
})();
