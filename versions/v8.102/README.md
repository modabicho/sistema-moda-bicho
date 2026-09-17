# v8.102 — Reorganização, etapa 2: `skusDoProduto` em `produtos/identidade.js`

**Data:** 16/09/2026
**Arquivo:** `PCP-v8.102.html` (montado por `node build.js`)
**MD5 (LF):** `70fccff211db98df5787eeb4e6297fbb`
**Tamanho:** 2.104.109 bytes · 31.847 linhas
**Marcador:** `<!--PCP:8.102-->` · `VERSAO = "8.102"`
**Base:** v8.101 (`5920df146156d2566b868ec5c2c25a3a`)

## Escopo

Mover **somente** `skusDoProduto` (com o comentário dele) de `src/pedidos/modelo.js` para o fim de `src/produtos/identidade.js`. O texto da função não muda.

Não mexido:
- `opAtivaDe`, `OP_ATIVA`, `idx()`;
- `skuNormal`, `produtoPorSkuFrouxo`;
- Demanda, Festivas, Supabase, Realtime e conflito;
- a posição de `produtos/identidade.js` no manifesto (continua logo depois de `componentes/tabela.js`).

## Verificação antes de editar

- **Chamadores:** 2 no código. `opAtivaDe` (`pedidos/modelo.js`) e `skusSoFestivos` (`festivas/modelo.js`); as outras ocorrências são comentários.
- **Chamadas durante a carga:** nenhuma (0 no nível zero do script).
- **`produtoDe` disponível:** `skusDoProduto` só roda depois da carga. `produtoDe` é declarada antes, no mesmo `produtos/identidade.js`, que vem antes de `pedidos/modelo.js` e `festivas/modelo.js`. O guarda `typeof produtoDe === "function"` continua igual.
- **Declaração de função:** é içada para o topo do script, então a nova posição não muda quando ela passa a existir.

## Mudança

| Arquivo | O que mudou |
|---|---|
| `src/pedidos/modelo.js` | saem as 13 linhas de `skusDoProduto` (427 → 414); `OP_ATIVA` e `opAtivaDe` ficam |
| `src/produtos/identidade.js` | as mesmas 13 linhas no fim; cabeçalho passa a citar `skusDoProduto` (+1 linha de comentário) |
| `manifesto.json` | contagem de linhas dos dois arquivos e o `porque` de `identidade.js`; **mesma posição** |
| `src/casca-topo.html`, `src/nucleo/config.js` | versão 8.101 → 8.102 |

**Diff do HTML montado (v8.101 → v8.102):**
- marcador de versão e `VERSAO`;
- cabeçalho de `identidade.js`: 1 linha de comentário trocada por 2;
- **13 linhas reposicionadas** (de 13034–13046 para 12531–12543), idênticas byte a byte: as removidas e as adicionadas são o mesmo conjunto.

## Testes (mesma sessão, mesmos dados: v8.101 e v8.102 em sequência)

| | v8.101 | v8.102 |
|---|---|---|
| `conflito-pedido` | 8 ok · 0 (D:1, D2:1 toast) | **8 ok · 0, idêntico** |
| `datas-festivas-uniao` | 78 ok · 0 | **78 ok · 0** |
| Fotografia de identidade | referência | **idêntica, 0 campos diferentes** |
| `skusDoProduto`: tipo, nome, aridade, hash do texto | `function`, `skusDoProduto`, 1, `91ef7617` | **iguais** |
| Boot | 242 requisições, todas 200, sem "Erro ao calcular" | **igual** |

Hashes da fotografia, **iguais nas duas versões**:

| Campo | Hash |
|---|---|
| `skusDoProduto` (3.260 SKUs atuais) | `ef7b72d3:73839` |
| `skusDoProduto` (SKUs anteriores) | `5550d868:160` |
| `skusDoProduto` (solto, vazio, null) | `915bd0d7:27` |
| `produtoDe` | `7a85faf7:129692` |
| `produtoPorIdProd` | `8b58a8fd:16301` |
| `opAtivaDe` | `674aa399:25629` |
| Demanda | `09810fd0:106217` |
| Festivas (linhas) | `b8e509eb:5031` |
| Festivas (identidade só na data) | `ab255682:2064` |

A fila real do navegador de teste ficou intacta (36 → 36). O build é determinístico e `node --check` passou.

## Confirmação

A única mudança funcional é **o arquivo onde `skusDoProduto` é declarada**. O texto, a assinatura, o comportamento e todos os resultados medidos não mudaram.

## Riscos conhecidos

Nenhum novo. `skusDoProduto` é declaração de função (içada). A regra da v8.101 continua valendo: `produtos/identidade.js` logo depois de `componentes/tabela.js`, porque `produtoDe` e `produtoPorIdProd` são `const`.
