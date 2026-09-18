/*
 * Roda nas páginas do AdmFood. Quando uma pessoa clica no botão
 * #btn-enviar-cotacoes, lê a lista de fornecedores que a própria página
 * deixou pronta e entrega a fila pro service worker (background.js), que
 * abre o WhatsApp Web. Enquanto envia, mostra um painel com o andamento no
 * canto da tela, com o botão Parar.
 *
 * O que a página precisa ter (ver o README da conversa):
 *
 *   <button id="btn-enviar-cotacoes" type="button">Enviar cotações pelo WhatsApp</button>
 *   <script type="application/json" id="fila-whatsapp">
 *     [{"fornecedor": "PXT", "telefone": "11999998888",
 *       "mensagem": "Olá! Segue o link ...\nhttps://.../preencher_cotacao.html?token=..."}]
 *   </script>
 *
 * "mensagem" pode faltar se vier "link": a mensagem padrão é montada aqui.
 */

const ID_BOTAO = 'btn-enviar-cotacoes';
// Botão de um convite só (um por linha na tabela de convites): o valor do
// atributo é o id do convite, que também vem em cada item de #fila-whatsapp.
const ATRIBUTO_UM_CONVITE = 'data-admfood-envio';
const ID_DADOS = 'fila-whatsapp';
const MENSAGEM_PADRAO = (link) => `Olá! Segue o link pra você preencher os preços da nossa cotação:\n${link}`;

// Só dígitos, com o 55 do Brasil na frente. Cuidado com o DDD 55 (RS): um
// celular de lá tem 11 dígitos e também começa com 55 — por isso só não
// repete o 55 quando o número já tem 12 ou 13 dígitos.
function normalizarTelefone(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (!digitos) return null;
  const completo = digitos.startsWith('55') && digitos.length >= 12 ? digitos : `55${digitos}`;
  return completo.length === 12 || completo.length === 13 ? completo : null;
}

function lerFornecedoresDaPagina() {
  const bloco = document.getElementById(ID_DADOS);
  if (!bloco) {
    throw new Error(`Não achei a lista de fornecedores na página (<script id="${ID_DADOS}">).`);
  }
  let lista;
  try {
    lista = JSON.parse(bloco.textContent || '[]');
  } catch {
    throw new Error('A lista de fornecedores da página não está num formato válido (JSON).');
  }
  if (!Array.isArray(lista)) throw new Error('A lista de fornecedores precisa ser uma lista ([...]).');

  const itens = [];
  const ignorados = [];
  const jaNaFila = new Set();
  for (const fornecedor of lista) {
    const nome = String(fornecedor?.fornecedor || '').trim() || 'Fornecedor sem nome';
    const telefone = normalizarTelefone(fornecedor?.telefone);
    const mensagem = String(fornecedor?.mensagem || (fornecedor?.link ? MENSAGEM_PADRAO(fornecedor.link) : '')).trim();
    if (!telefone || !mensagem) {
      ignorados.push(nome);
      continue;
    }
    // O mesmo número com a mesma mensagem só vai uma vez.
    const chave = `${telefone}|${mensagem}`;
    if (jaNaFila.has(chave)) continue;
    jaNaFila.add(chave);
    itens.push({ id: fornecedor?.id ?? null, fornecedor: nome, telefone, mensagem });
  }
  return { itens, ignorados };
}

// Capture (true): pega o clique antes de qualquer outro código da página.
document.addEventListener('click', async (evento) => {
  const alvo = evento.target instanceof Element ? evento.target : null;
  const botaoTodos = alvo?.closest(`#${ID_BOTAO}`);
  const botaoUm = botaoTodos ? null : alvo?.closest(`[${ATRIBUTO_UM_CONVITE}]`);
  if (!botaoTodos && !botaoUm) return;
  evento.preventDefault();
  // Só clique de verdade de uma pessoa dispara envio (um script da página
  // não consegue simular isso).
  if (!evento.isTrusted) return;

  let lidos;
  try {
    lidos = lerFornecedoresDaPagina();
  } catch (erro) {
    alert(erro.message);
    return;
  }
  let { itens, ignorados } = lidos;
  if (botaoUm) {
    const idConvite = botaoUm.getAttribute(ATRIBUTO_UM_CONVITE);
    itens = itens.filter((item) => String(item.id) === idConvite);
    ignorados = [];
  }
  if (!itens.length) {
    alert('Nenhum fornecedor com telefone e link pra enviar.');
    return;
  }

  const minutos = Math.max(1, Math.round((itens.length * 30) / 60));
  const aviso = [
    itens.length === 1
      ? `Enviar a cotação pro ${itens[0].fornecedor} pelo WhatsApp?`
      : `Enviar a cotação pra ${itens.length} fornecedores pelo WhatsApp?`,
    '',
    `O WhatsApp Web vai abrir e mandar um por vez (uns ${minutos} min no total).`,
    'Deixe a aba do WhatsApp aberta e não use o WhatsApp Web enquanto isso.',
  ];
  if (ignorados.length) aviso.push('', `Sem telefone (ficam de fora): ${ignorados.join(', ')}.`);
  if (!confirm(aviso.join('\n'))) return;

  try {
    const resposta = await chrome.runtime.sendMessage({ tipo: 'iniciar-fila', itens });
    if (resposta?.erro) {
      alert(resposta.erro);
      return;
    }
    renderizarPainel(resposta.resumo);
  } catch (erro) {
    alert('A extensão não respondeu. Recarregue a página e tente de novo.');
  }
}, true);

// --- Painel de andamento ------------------------------------------------
// Fica num Shadow DOM: o CSS do AdmFood não mexe no painel e o do painel
// não mexe no AdmFood.

let raizPainel = null;

function criarPainel() {
  if (raizPainel) return raizPainel;
  const host = document.createElement('div');
  host.id = 'admfood-envio-whatsapp';
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;';
  document.documentElement.appendChild(host);
  raizPainel = host.attachShadow({ mode: 'open' });
  raizPainel.innerHTML = `
    <style>
      .painel { width: 320px; font: 14px/1.4 'Plus Jakarta Sans', system-ui, sans-serif; color: #241a16;
        background: #fff; border: 1px solid #ece3d6; border-radius: 14px; box-shadow: 0 10px 32px rgba(36,26,22,.16); overflow: hidden; }
      .topo { padding: 14px 16px 10px; }
      .titulo { font-weight: 800; font-size: 14px; }
      .linha { color: #7a6f66; font-size: 12px; margin-top: 2px; }
      .barra { height: 6px; background: #f7f2ea; margin: 0 16px; border-radius: 999px; overflow: hidden; }
      .barra span { display: block; height: 100%; background: #d93829; border-radius: 999px; transition: width .3s ease; }
      .falhas { max-height: 140px; overflow: auto; margin: 10px 16px 0; padding: 0; list-style: none; font-size: 12px; }
      .falhas li { padding: 4px 0; border-top: 1px dashed #ece3d6; color: #c62b2b; }
      .falhas li span { color: #7a6f66; }
      .acoes { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px 14px; }
      button { font: 600 13px system-ui, sans-serif; border-radius: 8px; padding: 7px 12px; cursor: pointer; border: 1px solid #d8cfc0; background: #fff; color: #241a16; }
      button.parar { border-color: #d93829; color: #d93829; }
      button:focus-visible { outline: 2px solid #d93829; outline-offset: 2px; }
    </style>
    <div class="painel" role="status" aria-live="polite">
      <div class="topo">
        <div class="titulo"></div>
        <div class="linha"></div>
      </div>
      <div class="barra"><span></span></div>
      <ul class="falhas"></ul>
      <div class="acoes">
        <button type="button" class="parar">Parar</button>
        <button type="button" class="fechar">Fechar</button>
      </div>
    </div>`;
  raizPainel.querySelector('.parar').addEventListener('click', async () => {
    if (!confirm('Parar o envio? Quem já recebeu, recebeu; os outros ficam pra depois.')) return;
    const resposta = await chrome.runtime.sendMessage({ tipo: 'parar-fila' });
    renderizarPainel(resposta?.resumo);
  });
  raizPainel.querySelector('.fechar').addEventListener('click', () => {
    host.remove();
    raizPainel = null;
  });
  return raizPainel;
}

function renderizarPainel(resumo) {
  if (!resumo) return;
  const raiz = criarPainel();
  raiz.querySelector('.titulo').textContent = resumo.ativa
    ? `Enviando cotações · ${resumo.feitos} de ${resumo.total}`
    : (resumo.mensagemFinal || 'Envio parado.');
  raiz.querySelector('.linha').textContent = resumo.ativa
    ? `Agora: ${resumo.atual || '—'}`
    : `${resumo.enviados} ${resumo.enviados === 1 ? 'enviado' : 'enviados'} de ${resumo.total}`;
  raiz.querySelector('.barra span').style.width = `${resumo.total ? (resumo.feitos / resumo.total) * 100 : 0}%`;
  raiz.querySelector('.falhas').innerHTML = resumo.falhas
    .map((f) => `<li>${escapar(f.fornecedor)} <span>· ${escapar(f.motivo || 'falhou')}</span></li>`)
    .join('');
  raiz.querySelector('.parar').hidden = !resumo.ativa;
  raiz.querySelector('.fechar').hidden = resumo.ativa;

  // Pro próprio AdmFood poder reagir (ex.: marcar o convite como enviado):
  // document.addEventListener('admfood:envio-whatsapp', (e) => JSON.parse(e.detail))
  document.dispatchEvent(new CustomEvent('admfood:envio-whatsapp', { detail: JSON.stringify(resumo) }));
}

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

chrome.runtime.onMessage.addListener((mensagem) => {
  if (mensagem?.tipo === 'progresso') renderizarPainel(mensagem.resumo);
});

// Avisa a página que a extensão está instalada: o AdmFood só mostra o botão
// "Enviar todos pelo WhatsApp" quando ela existe.
document.documentElement.dataset.admfoodExtensao = chrome.runtime.getManifest().version;
document.dispatchEvent(new CustomEvent('admfood:extensao-pronta'));

// Abriu (ou recarregou) o AdmFood no meio de um envio: mostra o painel.
chrome.runtime.sendMessage({ tipo: 'estado-fila' })
  .then((resumo) => {
    if (resumo?.ativa) renderizarPainel(resumo);
  })
  .catch(() => {});
