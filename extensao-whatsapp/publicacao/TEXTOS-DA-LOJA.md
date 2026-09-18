# Publicar "AdmFood · Cotações no WhatsApp" na Chrome Web Store

Tudo desta pasta vai no painel de desenvolvedor do Chrome:
https://chrome.google.com/webstore/devconsole

## 0. Antes (uma vez só)

1. Entrar no painel com uma conta Google da empresa (não pessoal): quem for dono
   da conta é o dono da extensão.
2. Pagar a taxa única de registro de US$ 5 e confirmar o e-mail de contato.

## 1. Pacote

"Novo item" → enviar `admfood-cotacoes-whatsapp-1.0.1.zip` (desta pasta).

## 2. Aba "Detalhes do app na loja" (Store listing)

- **Nome e resumo**: vêm do pacote, não precisa digitar.
- **Descrição**:

  > Ferramenta interna do AdmFood, o sistema de compras e estoque das lojas do Grupo Artesanos.
  >
  > Na tela de uma cotação, o botão "Enviar os convites pelo WhatsApp" (ou o de um fornecedor só) manda, pelo WhatsApp Web de quem compra, o link da cotação para cada fornecedor, um por vez. A extensão confere se a mensagem na caixa é a daquele fornecedor antes de enviar, faz pausas entre um envio e outro e mostra o andamento num painel com o botão Parar. Fornecedor sem WhatsApp ou com número errado é pulado e aparece na lista de falhas.
  >
  > Precisa do WhatsApp Web conectado no mesmo Chrome. Só funciona no AdmFood (admfood.artesanosburger.com.br) e no WhatsApp Web; não lê conversas nem contatos e não manda dados para fora do navegador.

- **Categoria**: Produtividade → Fluxo de trabalho e planejamento
- **Idioma**: Português (Brasil)
- **Ícone da loja (128×128)**: `icone-128.png` (desta pasta)
- **Capturas de tela**: `tela-loja-1280x800.png` (desta pasta)
- **Site / suporte**: https://admfood.artesanosburger.com.br

## 3. Aba "Práticas de privacidade" (Privacy)

- **Finalidade única**:

  > Enviar pelo WhatsApp Web, um fornecedor por vez, os links de cotação gerados no sistema AdmFood, quando a pessoa clica no botão da tela da cotação.

- **Justificativa de cada permissão**:
  - `storage`: Guardar no navegador a fila do envio (fornecedores, telefones, mensagens e resultado de cada envio) para o envio continuar se a página recarregar.
  - `alarms`: Verificar a cada 30 segundos se o WhatsApp Web travou num fornecedor e seguir para o próximo.
  - Acesso a `admfood.artesanosburger.com.br`: Ler, na tela da cotação do AdmFood, a lista de fornecedores e links a enviar e mostrar o andamento do envio.
  - Acesso a `web.whatsapp.com`: Abrir a conversa de cada fornecedor no WhatsApp Web e enviar a mensagem com o link da cotação.
- **Código remoto**: Não, não estou usando código remoto.
- **Uso de dados**: marcar **Informações de identificação pessoal** (nome e telefone dos fornecedores). Marcar as três declarações (não vende nem transfere dados; não usa para outra finalidade; não usa para crédito).
- **Política de privacidade**: https://admfood.artesanosburger.com.br/privacidade-extensao.html
  (só abre depois do push do commit `db6f9b2`)

## 4. Aba "Distribuição"

- **Visibilidade**: Não listado — não aparece na busca da loja; instala quem tiver o link.
- **Regiões**: Brasil
- **Preço**: gratuito

## 5. Enviar para revisão

A revisão do Google costuma levar de alguns dias a algumas semanas. Aprovada, o
painel mostra o link da extensão: é por ele que se instala no Chrome de quem
compra.

## Antes de publicar: teste real

Carregar a pasta `extensao-whatsapp` sem compactar (chrome://extensions →
Modo do desenvolvedor → Carregar sem compactação), abrir o WhatsApp Web no mesmo
Chrome e mandar uma cotação de teste para um fornecedor cadastrado com o
próprio telefone. O WhatsApp Web muda de tempos em tempos, e é esse teste que
mostra se o envio automático continua funcionando.
