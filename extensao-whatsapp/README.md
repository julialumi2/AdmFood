# AdmFood · Cotações no WhatsApp (extensão do Chrome)

Manda pelo WhatsApp Web de quem compra os links de cotação do AdmFood, um
fornecedor por vez (card #26; decisão do chefe em 2026-09-18). Na tela da
cotação, o botão vermelho "Enviar os N convites pelo WhatsApp" manda para
todos e o "Enviar o convite pelo WhatsApp" de cada linha manda só para
aquele fornecedor. Sem a extensão, os botões ficam manuais (wa.me).

## Como funciona

- `script-sistema.js` roda no AdmFood: marca o `<html>` com
  `data-admfood-extensao=<versão>`, lê a lista em `#fila-whatsapp` quando
  alguém clica (só clique de verdade) e mostra o painel de andamento.
- `background.js` guarda a fila em `chrome.storage.local` e leva a mesma aba
  do WhatsApp Web de fornecedor em fornecedor.
- `script-whatsapp.js` roda no WhatsApp Web: espera o chat abrir, confere se
  a mensagem na caixa é a daquele fornecedor, espera um pouco, envia e avisa.
  Se o WhatsApp mudar o HTML, os seletores ficam no topo desse arquivo.

## Testar sem publicar

`chrome://extensions` → Modo do desenvolvedor → Carregar sem compactação →
esta pasta. Depois de mudar um arquivo, clicar em ↻ no cartão da extensão.

## Publicar uma versão nova

1. Subir `version` no `manifest.json`.
2. Gerar o zip com `manifest.json`, os três `.js` e `icones/` (sem esta
   README e sem `publicacao/`).
3. Painel da Chrome Web Store → a extensão → Pacote → enviar o zip.

Textos da loja, imagem de tela e passo a passo da primeira publicação:
`publicacao/TEXTOS-DA-LOJA.md`. Política de privacidade:
https://admfood.artesanosburger.com.br/privacidade-extensao.html
