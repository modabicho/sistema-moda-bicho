# v8.105 — Reorganização, Fase 3: a normalização de SKU ganha dono

**Data:** 17/09/2026
**Arquivo:** `PCP-v8.105.html` (montado por `node build.js`)
**MD5 (LF):** `394fda2d56dfac786d6499135c7aef60`
**Tamanho:** 2.105.599 bytes · 31.875 linhas
**Marcador:** `<!--PCP:8.105-->` · `VERSAO = "8.105"`
**Base:** v8.104 (`4170d1bed5430fc24e82970200d40d64`)

## Escopo

Mover **somente** `skuNormal` e `produtoPorSkuFrouxo` de `src/produtos/provisorios.js` para `src/produtos/identidade.js`, sem reescrever. Continuação da v8.101 (`produtoDe`, `produtoPorIdProd`) e da v8.102 (`skusDoProduto`).

Não mexido: `idx()`, `migrarProdutosV2()`, `trocarSkuDoProduto()`, `opAtivaDe()`, `OP_ATIVA`, pedidos, remessas, Supabase, Realtime, Demanda e Datas Festivas.

## Mudança

| Arquivo | O que mudou |
|---|---|
| `src/produtos/provisorios.js` | saem as linhas 149–166: os dois comentários, as duas funções e a linha em branco seguinte (439 → 421) |
| `src/produtos/identidade.js` | entram as mesmas linhas no fim, byte a byte; o cabeçalho ganha uma linha registrando a posse (19 → 38) |
| `manifesto.json` | só as duas contagens de linha |
| `src/casca-topo.html` | `<!--PCP:8.104-->` → `<!--PCP:8.105-->` |
| `src/nucleo/config.js` | `VERSAO = "8.104"` → `"8.105"` |

**Diff do HTML montado (v8.104 → v8.105)**, completo:

```
1c1            <!--PCP:8.104-->  →  <!--PCP:8.105-->
11134c11134    const VERSAO = "8.104";  →  "8.105"
12528c12528-9  cabeçalho de produtos/identidade.js: +1 linha de registro de posse
12545-12562    + as 18 linhas do bloco (17 + a branca de separação)
12754-12771    − as mesmas 18 linhas, saindo de produtos/provisorios.js
```

**Único texto alterado dentro do bloco**, e é comentário:

```
- /* a única normalização de SKU deste módulo. O resto do app tem ~10 cópias de
+ /* a única normalização de SKU deste domínio. O resto do app tem ~10 cópias de
```

"deste módulo" deixaria de ser verdade em `identidade.js`. As demais 16 linhas do bloco — incluindo os dois corpos de função — saíram e entraram idênticas, conferido linha a linha entre os dois HTML montados e também por `String(skuNormal)` e `String(produtoPorSkuFrouxo)` dentro do navegador rodando a v8.105.

## Por que este movimento é seguro

1. **As duas são `function` declaradas**, e o build joga os 85 arquivos JS dentro de **um único `<script>`** (aberto em `casca-meio.html`, fechado em `casca-fim.html`). O içamento vale para esse script inteiro: a posição do arquivo não participa da resolução do nome. Não existe aqui o risco de TDZ que a v8.101 teve de administrar com `produtoDe` e `produtoPorIdProd`, que são `const`.
2. **`skuNormal` não tem dependência nenhuma**; `produtoPorSkuFrouxo` depende de `skuNormal`, `produtoDe` e `S.produtos` — e as duas primeiras passam a morar no mesmo arquivo.
3. Nenhuma das duas toca DOM, Supabase ou escreve estado.
4. O destino vem **antes** da origem no manifesto (índice 30, contra 32), e nenhum arquivo anterior ao 30 chama qualquer uma delas.

Chamadores, todos inalterados: `skuNormal` — 60 chamadas em `provisorios.js` (47), `festivas/conta.js` (7), `festivas/telas.js` (4), `festivas/modelo.js` (2) e `demanda/calculo.js` (1); `produtoPorSkuFrouxo` — 3 chamadas, em `provisorios.js` (2) e `festivas/conta.js` (1, com a guarda `typeof … === "function"` que já existia).

## Checagens estáticas

- `node --check` no JS montado: ok.
- Build determinístico: três builds seguidos, o mesmo MD5.
- Arquivo em LF, como fica no repositório.

## Testes (v8.104 × v8.105, mesma sessão autenticada, mesmos dados)

3.260 produtos · 1.766 pedidos · 6.327 OPs · 1.683 itens de estoque · 1 campanha.

| | v8.104 | v8.105 |
|---|---|---|
| `numeracao-pedido` | 18 ok · 0 | **18 ok · 0** |
| `conflito-pedido` | 8 ok · 0 | **8 ok · 0** |
| `datas-festivas-uniao` | 78 ok · 0 | **78 ok · 0** |
| Fotografia de identidade | referência | **0 diferenças** |
| Boot | 242 requisições Supabase, todas 200; sem "Erro ao calcular" | **igual** |

Hashes da fotografia, **iguais nas duas versões**:

| Campo | Hash |
|---|---|
| `produtoDe` | `7a85faf7:129692` |
| `produtoPorIdProd` | `8b58a8fd:16301` |
| `skusDoProduto` | `ef7b72d3:73839` |
| `skusDoProduto("__SOLTO__")` | `b09724ea:13` |
| `opAtivaDe` | `674aa399:25629` |
| `skuNormal` (null, undefined, "", " ab.c ", 12, "X") | `069ecf2a:26` |
| `produtoPorSkuFrouxo` (3.260 SKUs em minúscula e com espaços) | `b3e30d0e:46091` |
| `proximoCodigoProvisorio` | `0d90d890:30` |
| `candidatosSkuReal` | `741638a5:2` |
| `migrarProdutosV2` (em cópia) | `107531c4:18637955` |
| Demanda (1.683 linhas · 1.617 na demanda · 90 fora) | `1bd0373b:106245` |

**Datas Festivas, uma observação de método.** O hash do bloco da campanha muda entre uma carga e outra **nas duas versões** — a campanha de Halloween carrega `vendasAtual`, que é venda do ano corrente e se move ao longo do dia. Por isso a comparação foi feita **linha a linha entre cargas vizinhas**, nos dois sentidos: v8.104 recém-carregada contra as linhas guardadas da v8.105, e depois v8.105 recém-carregada contra as da v8.104. As duas vezes: **90 linhas, 0 diferenças**. A Demanda recebeu o mesmo tratamento: **1.683 linhas, 0 diferenças**.

## Confirmação

A única mudança é **em qual arquivo-fonte as duas funções são declaradas**, mais uma palavra em um comentário. O código, as assinaturas, a ordem no HTML montado e o comportamento não mudaram.

## Riscos conhecidos

- `produtos/identidade.js` continua tendo de vir **depois** de `componentes/tabela.js` no manifesto, por causa de `produtoDe` e `produtoPorIdProd`, que são `const` e dependem de `idx()`.
- As ~55 cópias soltas de `.trim().toUpperCase()` espalhadas por 19 arquivos **não** foram tocadas. Nem todas são de SKU — há nome de prestadora, processo e número de pedido no meio —, então trocá-las por `skuNormal` seria mudança de comportamento disfarçada de limpeza. Fica como dívida, agora que a função tem dono.

## Próximas subetapas da Fase 3

1. `trocarSkuDoProduto` → `identidade.js` (mutação de identidade, 1 chamador).
2. `migrarProdutosV2` → `produtos/migracao.js` (roda no boot e alcança o servidor por `proximoIdProduto` → `prodReservaGarantir` → `persRpc`; merece etapa só dela).
3. `idx()` → `nucleo/indices.js`, fora do domínio de produtos: só 1 dos 5 índices é de produto, os outros são de OP e pedido.
