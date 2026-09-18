/*
 * Service worker da extensão: é quem controla a fila de envio.
 *
 * Por que existe (além dos dois scripts de página): no Manifest V3, script
 * que roda dentro de uma página (content script) não pode abrir, trocar
 * nem fechar abas — só o service worker usa chrome.tabs. Então:
 *   - script-sistema.js (no AdmFood) entrega a lista pra cá;
 *   - aqui a fila é guardada e a aba do WhatsApp é aberta no 1º fornecedor;
 *   - script-whatsapp.js envia e avisa o resultado; aqui a fila anda e a
 *     MESMA aba vai pro próximo fornecedor.
 *
 * Por que a mesma aba (e não "abre uma nova e fecha a atual"): duas abas do
 * WhatsApp Web ao mesmo tempo brigam — a nova para na tela "O WhatsApp está
 * aberto em outra janela · Usar aqui" e a fila travaria ali.
 *
 * Tudo fica em chrome.storage.local, nunca só em variável: o Chrome desliga
 * o service worker quando ele fica ~30 s parado e religa na próxima
 * mensagem, zerando as variáveis.
 */

const ALARME_VIGIA = 'vigia-fila';
// Sem notícia do WhatsApp por esse tempo, o fornecedor atual é dado como
// falha e a fila segue (o script do WhatsApp manda sinal de vida durante
// as esperas longas, então isso só acontece se a página travar mesmo).
const TRAVOU_DEPOIS_DE_MS = 3 * 60 * 1000;
const ORIGENS_DO_SISTEMA = ['https://admfood.artesanosburger.com.br'];

async function lerFila() {
  const { fila } = await chrome.storage.local.get('fila');
  return fila || null;
}

async function salvarFila(fila) {
  await chrome.storage.local.set({ fila });
}

function urlDoEnvio(item) {
  return `https://web.whatsapp.com/send?phone=${item.telefone}&text=${encodeURIComponent(item.mensagem)}`;
}

function ehDoSistema(url) {
  try {
    return ORIGENS_DO_SISTEMA.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

// O que a tela do AdmFood precisa pra mostrar o andamento.
function resumo(fila) {
  if (!fila) return null;
  return {
    ativa: fila.ativa,
    total: fila.itens.length,
    feitos: fila.itens.filter((i) => i.status !== 'pendente').length,
    enviados: fila.itens.filter((i) => i.status === 'enviado').length,
    falhas: fila.itens
      .filter((i) => i.status === 'falhou')
      .map((i) => ({ fornecedor: i.fornecedor, motivo: i.motivo })),
    atual: fila.ativa ? fila.itens[fila.indice]?.fornecedor || null : null,
    itens: fila.itens.map(({ id, fornecedor, telefone, status, motivo }) => ({ id, fornecedor, telefone, status, motivo })),
    mensagemFinal: fila.mensagemFinal,
  };
}

function avisarSistema(fila) {
  // A aba do AdmFood pode ter sido fechada ou recarregada: sem problema, a
  // fila continua e a tela pergunta o estado quando abrir de novo.
  chrome.tabs.sendMessage(fila.abaSistema, { tipo: 'progresso', resumo: resumo(fila) }).catch(() => {});
}

async function iniciarFila(itens, remetente) {
  if (!remetente.tab || !ehDoSistema(remetente.url)) {
    throw new Error('Esse pedido não veio do AdmFood.');
  }
  const atual = await lerFila();
  if (atual?.ativa) {
    throw new Error('Já tem um envio em andamento. Espere terminar ou clique em Parar.');
  }
  if (!Array.isArray(itens) || !itens.length) {
    throw new Error('Nenhum fornecedor pra enviar.');
  }

  const fila = {
    itens: itens.map((item) => ({ ...item, status: 'pendente', motivo: null })),
    indice: 0,
    ativa: true,
    abaSistema: remetente.tab.id,
    abaWhatsapp: null,
    ultimaAtividade: Date.now(),
    iniciadaEm: new Date().toISOString(),
    mensagemFinal: null,
  };

  // Reaproveita a aba do WhatsApp Web que já estiver aberta (ver o
  // comentário do topo); só cria uma se não houver nenhuma.
  const [abaExistente] = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  const url = urlDoEnvio(fila.itens[0]);
  if (abaExistente) {
    fila.abaWhatsapp = abaExistente.id;
    await salvarFila(fila);
    await chrome.tabs.update(abaExistente.id, { url, active: true });
    await chrome.windows.update(abaExistente.windowId, { focused: true });
  } else {
    const aba = await chrome.tabs.create({ url, active: true });
    fila.abaWhatsapp = aba.id;
    await salvarFila(fila);
  }

  chrome.alarms.create(ALARME_VIGIA, { periodInMinutes: 0.5 });
  avisarSistema(fila);
  return { ok: true, resumo: resumo(fila) };
}

async function pararFila(motivo) {
  const fila = await lerFila();
  if (!fila) return { ok: true };
  fila.ativa = false;
  fila.mensagemFinal = motivo;
  await salvarFila(fila);
  chrome.alarms.clear(ALARME_VIGIA);
  avisarSistema(fila);
  return { ok: true, resumo: resumo(fila) };
}

// O script do WhatsApp pergunta "o que eu mando nessa aba?". Só responde
// pra aba da fila: no uso normal do WhatsApp, a resposta é null e o script
// não faz nada.
async function envioDaAba(remetente) {
  const fila = await lerFila();
  if (!fila?.ativa || remetente.tab?.id !== fila.abaWhatsapp) return null;
  const item = fila.itens[fila.indice];
  if (!item) return null;
  fila.ultimaAtividade = Date.now();
  await salvarFila(fila);
  return { item, indice: fila.indice, posicao: fila.indice + 1, total: fila.itens.length };
}

async function sinalDeVida(remetente) {
  const fila = await lerFila();
  if (fila?.ativa && remetente.tab?.id === fila.abaWhatsapp) {
    fila.ultimaAtividade = Date.now();
    await salvarFila(fila);
  }
  return { ok: true };
}

// Marca o resultado do fornecedor atual e leva a aba pro próximo.
async function avancar(fila, status, motivo) {
  const item = fila.itens[fila.indice];
  Object.assign(item, { status, motivo: motivo || null, em: new Date().toISOString() });
  fila.indice += 1;
  fila.ultimaAtividade = Date.now();

  if (fila.indice >= fila.itens.length) {
    fila.ativa = false;
    const falhas = fila.itens.filter((i) => i.status === 'falhou').length;
    fila.mensagemFinal = falhas
      ? `Terminou, com ${falhas} ${falhas === 1 ? 'falha' : 'falhas'}.`
      : 'Terminou: todos os fornecedores receberam.';
    await salvarFila(fila);
    chrome.alarms.clear(ALARME_VIGIA);
    avisarSistema(fila);
    return;
  }

  await salvarFila(fila);
  avisarSistema(fila);
  try {
    await chrome.tabs.update(fila.abaWhatsapp, { url: urlDoEnvio(fila.itens[fila.indice]) });
  } catch {
    await pararFila('A aba do WhatsApp sumiu; o envio parou.');
  }
}

async function registrarResultado({ indice, status, motivo }, remetente) {
  const fila = await lerFila();
  if (!fila || remetente.tab?.id !== fila.abaWhatsapp || indice !== fila.indice) return { ok: false };

  if (status === 'sem-login') {
    return pararFila('O WhatsApp Web não está conectado nesse Chrome. Leia o QR code com o celular e clique em enviar de novo.');
  }
  if (!fila.ativa) {
    // Alguém clicou em Parar enquanto esse já estava sendo enviado: só
    // registra o que aconteceu, sem ir pro próximo.
    Object.assign(fila.itens[indice], { status, motivo: motivo || null });
    await salvarFila(fila);
    avisarSistema(fila);
    return { ok: true };
  }
  await avancar(fila, status, motivo);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  const acoes = {
    'iniciar-fila': () => iniciarFila(mensagem.itens, remetente),
    'parar-fila': () => pararFila('Parado pelo botão Parar.'),
    'estado-fila': async () => resumo(await lerFila()),
    'qual-envio': () => envioDaAba(remetente),
    'sinal-de-vida': () => sinalDeVida(remetente),
    'resultado-envio': () => registrarResultado(mensagem, remetente),
  };
  const acao = acoes[mensagem?.tipo];
  if (!acao) return false;
  acao()
    .then((resposta) => responder(resposta))
    .catch((erro) => responder({ erro: erro.message }));
  return true; // a resposta chega depois (assíncrona)
});

// Vigia: se o WhatsApp travar num fornecedor, pula ele em vez de a fila
// ficar parada pra sempre.
chrome.alarms.onAlarm.addListener(async (alarme) => {
  if (alarme.name !== ALARME_VIGIA) return;
  const fila = await lerFila();
  if (!fila?.ativa) {
    chrome.alarms.clear(ALARME_VIGIA);
    return;
  }
  if (Date.now() - fila.ultimaAtividade > TRAVOU_DEPOIS_DE_MS) {
    await avancar(fila, 'falhou', 'O WhatsApp não respondeu a tempo.');
  }
});

// Fechar a aba do WhatsApp no meio do envio para a fila.
chrome.tabs.onRemoved.addListener(async (abaId) => {
  const fila = await lerFila();
  if (fila?.ativa && abaId === fila.abaWhatsapp) {
    await pararFila('A aba do WhatsApp foi fechada; o envio parou.');
  }
});
