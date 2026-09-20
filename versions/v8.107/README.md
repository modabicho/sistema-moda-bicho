# v8.107 — Projeto de Corte, etapa B: persistência e o Cadastro de Fitas

**Data:** 20/09/2026
**Arquivo:** `PCP-v8.107.html` (montado por `node build.js PCP-v8.107.html`)
**MD5 (LF):** `3655510abf2a51a1a35d67a7ac4d8576`
**Tamanho:** 2.147.021 bytes · 32.714 linhas
**Marcador:** `<!--PCP:8.107-->` · `VERSAO = "8.107"`
**Base:** v8.106 (`09ce7eb67e296cac88f95021775e8f14`)
**Banco:** migration 147 aplicada · migration 148 (flag) **por aplicar**

## Escopo

Fecha a **persistência** do módulo de corte e entrega a **aba Fitas**. Não entra
Projeto de Corte, integração com Novo pedido nem impressão.

Não mexido: Pedidos, OPs, impressão, Demanda, `pcp_pedido`, conferência,
semiacabados, insumos.

## Mudança

| Arquivo | O que mudou |
|---|---|
| `src/corte/outbox.js` | **novo**, 137 linhas: `CX_RPC` (as 6 RPCs da 147), `cxEhCorte`, `corteEscreve`, `cxEnfileirar`, `cxNovaIntencao`, `cxEnviar`, `cxDrenar` |
| `src/corte/fitas.js` | **novo**, 200 linhas: mapa de campos, `ftCarregar`, `ftBuscar`, `ftValidar`, `ftSalvar`, `ftApagar`, `ftParadas`, `ftReenviarResolvido` |
| `src/telas/fitas.js` | **novo**, 223 linhas: `viewFitas` e `fitaClique` |
| `src/styles/fitas.css` | **novo**, 29 linhas |
| `testes/corte-persistencia.js` | **novo**, 321 linhas: 15 casos |
| `src/persistencia/pedidos.js` | `pxDrenar` pula `corte_*` — 4 linhas (1 de código, 3 de comentário) |
| `src/persistencia/tela.js` | `cxDrenar()` na abertura, **antes** da saída do caminho desligado — 8 linhas |
| `src/acoes/clique.js` | a porta `data-fita` → `fitaClique` — 5 linhas |
| `src/sessao/acesso.js` | `["fitas", "Fitas"]` em `ABAS_TODAS` |
| `src/relatorios/relatorios.js` | `TITULOS.fitas`, entrada no menu (Cadastros), `fitas: viewFitas` no despacho, e `fitas` na lista de telas que existem com a base vazia |
| `src/nucleo/utilidades.js` | `IC.fitas` (ícone da aba) |
| `manifesto.json` | 1 CSS + 3 JS |
| `src/casca-topo.html`, `src/nucleo/config.js` | 8.106 → 8.107 |

**Diff do HTML montado (v8.106 → v8.107):** 13 hunks — 5 acréscimos puros dos
arquivos novos e 8 pontos de costura, todos de uma a cinco linhas.

## As três decisões que explicam o resto

**1. Uma fila, dois drenos.** A ação de corte vai pela MESMA fila durável
(`pcp5:outbox`). O dreno é que é separado, porque `pxDrenar` só roda quando
`telaEscreveNaTabela()` é verdade — pendurar corte nele amarraria o módulo ao
cutover de Pedidos, que está desligado. A partição é por prefixo, escrita em um
lugar só (`cxEhCorte`), e cada dreno ignora o que não é seu.

**2. `cxEhCorte` é declaração de função, não `const`.** `pxDrenar` a consulta
com `typeof`, e `pedidos.js` vem antes de `corte/` no bundle. `typeof` sobre um
`const` ainda não avaliado **lança** ReferenceError (TDZ) em vez de devolver
`"undefined"`. Mesma razão já registrada em `src/persistencia/servidor.js:85`.

**3. O formulário da fita não é controlado.** Os campos são HTML comum, lidos
só no salvar. Controlado, redesenharia a tela a cada tecla — o piscar do
protótipo — e exigiria mexer nos despachantes de input do app inteiro.

## Feature flag

`corte_escrita` em `pcp_flag`, criada pela **migration 148**, nascendo
desligada. Lida pelo `telaFlag()` que já existia: nenhuma linha de
infraestrutura foi escrita para isso.

Com ela desligada — que é como a v8.107 vai a produção — a aba lê, cadastra e
**guarda**: `cxDrenar` devolve `desligado` antes de tocar na rede, e a tela diz
isso em vez de fingir que gravou. Ligar depois envia o acumulado com os mesmos
`operation_id`.

## Testes (v8.106 × v8.107, mesmo navegador, cópia de teste, sem sessão)

| Bateria | v8.106 | v8.107 |
|---|---|---|
| `corte-persistencia` | **não existe** | **15 ok · 0 falhas** |
| `corte-modelo` | 35 ok · 0 falhas | 35 ok · 0 falhas |
| `numeracao-pedido` | 18 ok · 0 falhas | 18 ok · 0 falhas |
| `conflito-pedido` | 8 ok · 0 falhas | 8 ok · 0 falhas |
| `datas-festivas-uniao` | 78 ok · 0 falhas | 78 ok · 0 falhas |

O que a `corte-persistencia` prova: a partição das duas filas nos dois sentidos;
flag desligada não faz uma requisição sequer; só `ok` tira ação da fila;
conflito **para** e não descarta; `invalido` mantém o mesmo `operation_id` e o
reenvio corrigido passa; `operacao-reutilizada` exige intenção nova com id novo;
tipo desconhecido não gira para sempre; offline devolve a fila inteira e não
insiste; o mapa de campos vai e volta; a busca acha por cor, por lugar e por
dois termos; salvar leva `expected_revision` e marca `editado`; apagar fita em
uso não some da tela; e nada de fora — `S.pedidos`, a fila real do navegador —
é tocado.

## Três defeitos achados durante a versão

1. **A bateria não conseguia ligar a flag.** `telaFlag` é `const`: trocá-lo em
   `window` não tem efeito. A bancada passou a ligar pelo caminho real
   (`persLer` falso devolvendo `pcp_flag` + `telaFlagsCarregar()`), o que também
   virou um teste do caminho real.
2. **A aba não desenhava com a base vazia.** O app mostra "comece importando"
   para toda tela fora de uma lista de exceções. Fitas é cadastro, como Insumos
   e Prestadoras: entrou na lista.
3. **O cartão do formulário ficava branco no tema escuro.** Eu usara um token
   inexistente (`--fundo-2`) com fallback claro. Passou a usar `--surface`,
   `--line` e `--shadow`, os mesmos do `.resumo` dos Pedidos.

## Riscos conhecidos

- A gravação nunca foi exercida contra o Supabase real: a flag está desligada e
  não há sessão nesta bancada. O primeiro teste de verdade é ligar a flag com
  uma fita de ensaio.
- `pxDrenar` ganhou uma linha. É uma linha, num laço, com teste próprio nos dois
  sentidos — mas é o único ponto de regressão possível em Pedidos.
- A busca filtra em memória. Passa a doer quando a biblioteca crescer muito; o
  índice GIN da 147 já está lá para quando isso acontecer.
- A aba só aparece para quem é administradora, porque `podeAba` libera tudo para
  `ehAdm()` e ninguém tem `fitas` na lista de abas. Dar acesso a outra pessoa é
  marcar a aba no cadastro dela.

## Próximas etapas

`v8.108` Projeto de Corte (ficha, versões, regras) · `v8.109` seção no Novo
pedido · `v8.110` vínculo e snapshot · `v8.111` bloco no papel · `v8.112+`
importação de catálogo e foto da fita (bucket).
