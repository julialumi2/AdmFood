# Testes

```bash
python tests/rodar.py
```

Roda tudo em poucos segundos. Um teste só:

```bash
python tests/test_alertas.py
```

Ou filtrando pelo nome:

```bash
python tests/rodar.py alertas baixa
```

Não precisa instalar nada — usa só o que já está no `requirements.txt`.

## O que tem hoje

| Arquivo | Cobre |
|---|---|
| `test_baixa_estoque.py` | O motor da Etapa 0: desconta venda × ficha técnica, é idempotente (roda a cada 15 min), corrige pra cima quando a venda some, respeita o dia em que a loja ligou a baixa, e resolve composição de combo. |
| `test_alertas.py` | O sininho: o badge conta o que não coube na lista, "marcar como lido" cala tudo e é por pessoa, alerta resolvido perde a marca, e o de backup vem em primeiro com "lido" valendo só a semana. |
| `test_reservas.py` | O módulo de reservas: o dia operacional (reserva de 01:00 pertence ao turno da noite anterior), remarcar recalculando o turno, cancelar como status, escopo por loja e a fila de avisos. |
| `test_agente_whatsapp.py` | O robô do WhatsApp: quem entra e quem não entra, não responder duas vezes, o relatório de faturamento saindo no formato exato que ela manda hoje, e a recusa a pedidos de ação (ele só consulta). |
| `test_acessos.py` | Os três perfis, conta desativada perdendo acesso na hora, "sair de todos os aparelhos", e a trava por loja — inclusive que adulterar o parâmetro da URL não entrega dado de outra loja. |

## Como funciona

Cada teste roda **num processo separado**, com um **banco novo e vazio**.
O schema é criado pelo próprio `inicializar_banco()`, então a suíte também
prova que dá pra subir um banco do zero — foi assim que ela achou, na
primeira execução, que isso estava quebrado (a migração de
`item_cardapio_custo` rodava antes da tabela existir).

O banco começa sem nada além de três pessoas, uma por perfil. **Tudo o que
um teste usa, ele cria** — insumo, produto, ficha, venda. Assim o teste
diz no próprio corpo de que dado ele depende, e não quebra amanhã porque
alguém mexeu numa cópia de produção.

Isso é de propósito: antes, cada teste copiava o `admfood.db` local, que é
uma cópia velha de produção. Teste que depende de dado que muda passa hoje
e falha amanhã sem ninguém ter tocado no código.

## Escrever um teste novo

```python
from _base import Mundo, conferir, secao, terminar

mundo = Mundo()
admin = mundo.cliente(mundo.ADMIN)

secao("o que estou testando")
conferir("responde 200", admin.get("/api/alertas").status_code, 200)

terminar()
```

O `Mundo` traz:

- `cliente(usuario_id)` — cliente HTTP já logado (`ADMIN`, `GERENTE`, `OPERACAO`)
- `como(usuario_id)` — contexto logado pra chamar função interna do app direto
- `sem_loja(papel)` — funcionário cadastrado pela metade, pra testar que não enxerga nada
- `insumo(...)`, `produto(...)`, `ficha(...)`, `venda(...)` — semear o caso
- `estoque(insumo_id, loja)` — conferir o saldo depois
- `desligar_baixa(loja)` — o Artesanos já nasce com a baixa ligada

Chame `terminar()` no fim: ele imprime o resultado e mata o processo. É
`os._exit` de propósito — o agendador do app deixa thread viva e o teste
ficaria pendurado.

## O que ainda não tem

Bastante. Falta compras (cotação → pedido → recebimento), cardápio e CMV,
sincronização com a Cardápio Web, e as pendências de cadastro. Há cerca de
90 scripts descartáveis de onde portar, escritos ao longo das últimas
semanas — o caminho é trazer um de cada vez, refazendo em cima do `Mundo`
em vez de copiar o banco de produção.
