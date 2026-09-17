# v8.104 — Remessa deixa de se chamar "pedido" na tela

**Data:** 17/09/2026
**Arquivo:** `PCP-v8.104.html` (montado por `node build.js`)
**MD5 (LF):** `4170d1bed5430fc24e82970200d40d64`
**Tamanho:** 2.105.511 bytes · 31.874 linhas
**Marcador:** `<!--PCP:8.104-->` · `VERSAO = "8.104"`
**Base:** v8.103 (`a80abae863687cdc90834d135c35b096`)

## Escopo

Só texto visível e comentário, seguindo a decisão de negócio registrada em `64f5eb6`: **pedido de produção e remessa de semiacabados são domínios diferentes e podem ter o mesmo número**.

**Nada de lógica mudou.** `proximoNumeroRemessa`, `migrarNumerosRemessa`, `numeroEmUso`, a sequência dos pedidos, o Supabase e os nomes internos (`valorDoPedido`, `qtdTrabalhada`, `ehRemessa`, `numero`, `seqGeral`) continuam exatamente como estavam.

## O que mudou

**Texto visível** (`src/semiacabados/`):

| Onde | Antes | Agora |
|---|---|---|
| `janelas.js` · título da janela | `Nova remessa · pedido 2785` / `Pedido 2790 · remessa` | `Nova remessa · nº 2785` / `Remessa 2790` |
| `janelas.js` · explicação do número | "…nasce com o número **2785**, da mesma sequência dos pedidos, e ele acompanha tudo até o encerramento" | "…nasce com o número **2785**, e ele acompanha a remessa até o encerramento" |
| `janelas.js` · janela de retorno | `Retorno do pedido 2790` | `Retorno da remessa 2790` |
| `janelas.js` · janela de encerrar | `Encerrar o pedido 2790` | `Encerrar a remessa 2790` |
| `janelas.js` · botão do extrato | "Abrir o pedido que originou esta entrada" | "Abrir a remessa que originou esta entrada" |
| `telas.js` · cabeçalho da remessa | `Pedido 2790 · TATI SANTOS` | `Remessa 2790 · TATI SANTOS` |

**Histórico e extrato — só registros novos:**

| Onde | Antes | Agora |
|---|---|---|
| `salvar.js` | `Remessa 2790 (pedido) alterada` | `Remessa 2790 alterada` |
| `salvar.js` | `Retorno de 40 peças no pedido 2790` | `Retorno de 40 peças na remessa 2790` |
| `modelo.js` · extrato do semiacabado | `pedido 2790 · retorno de Tati` | `remessa 2790 · retorno de Tati` |

**Registros antigos não foram reescritos**: quem tem "pedido" no histórico continua com "pedido", porque o histórico guarda o que foi escrito na época.

**Comentários técnicos** (`modelo.js`):
- o cabeçalho do número da remessa passa a registrar a decisão de negócio (domínios diferentes, sem unicidade cruzada, sem unificar sequências) e marca como **legado** o fato de o número ainda sair de `proximoNumeroPedido()`, a ser tratado em etapa separada;
- some a frase "a remessa já tem número da sequência dos pedidos".

## O que não mudou

As comparações legítimas ficaram como estavam: "entra no fechamento como qualquer pedido", "o mesmo formato do pedido" (etapas), "no pedido é o que saiu no papel; na remessa é o que voltou". Também continua correto e mantido o aviso de que a remessa aparece na aba Pedidos — ela é o mesmo registro, desenhado por `tabelaRemessasEmPedidos`.

## Testes (v8.103 × v8.104, mesma sessão)

| | v8.103 | v8.104 |
|---|---|---|
| Fotografia de identidade (17 campos) | referência | **idêntica, 0 diferenças** |
| Boot | 179 requisições Supabase, todas 200; 1.766 pedidos; sem "Erro ao calcular" | **igual** |
| `numeracao-pedido` | 18 ok · 0 | **18 ok · 0** |
| `conflito-pedido` | 8 ok · 0 | **8 ok · 0** (mesmos avisos) |
| `datas-festivas-uniao` | 78 ok · 0 | **78 ok · 0** |

Não existe bateria de semiacabados no repositório. Em lugar dela, as telas e janelas de remessa foram renderizadas com um registro sintético e comparadas texto a texto: `telaRemessa`, a janela nova, a de retorno, a de encerrar e a explicação do número. Todas trocaram "pedido" por "remessa", e nada mais mudou.

O diff do HTML montado contém apenas: o marcador de versão, `VERSAO`, 5 blocos de comentário e 8 textos. Nenhuma linha de lógica (`function`, `if`, `for`, `return`, `const`, `let`, `=>`) foi alterada.

## Próxima etapa, fora desta versão

A sequência própria de remessa — servidor entregando o número e unicidade só entre remessas — continua pendente e depende de mudança no Supabase.
