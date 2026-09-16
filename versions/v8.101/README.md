# v8.101 — Reorganização, etapa 1: dono da identidade do produto

**Data:** 16/09/2026
**Arquivo:** `PCP-v8.101.html` (montado por `node build.js`)
**MD5 (LF, como fica no repositório):** `5920df146156d2566b868ec5c2c25a3a`
**Tamanho:** 2.104.026 bytes · 31.846 linhas
**Marcador:** `<!--PCP:8.101-->` · `VERSAO = "8.101"`
**Base:** v8.100 (`3296f5a1de067bdee9481d5c5058d4af`) e árvore `src/` reconstruída (`a22871a`)

## Escopo

Mover **somente** `produtoDe` e `produtoPorIdProd` para `src/produtos/identidade.js`, sem reescrever. O novo arquivo entra no manifesto **logo depois de `componentes/tabela.js`**.

Não mexido:
- `idx()` e `skusDoProduto`;
- normalização, `skuNormal`, `migrarProdutosV2`;
- Demanda, Festivas, Pedidos, OPs, Supabase e Realtime.

## Mudança

| Arquivo | O que mudou |
|---|---|
| `src/componentes/tabela.js` | saem as duas últimas linhas (60 → 58) |
| `src/produtos/identidade.js` | **novo**: 3 linhas de comentário de cabeçalho + as duas linhas, byte a byte iguais |
| `manifesto.json` | entrada `produtos/identidade.js` depois de `componentes/tabela.js`; `tabela.js` com 58 linhas |
| `src/casca-topo.html` | `<!--PCP:8.100-->` → `<!--PCP:8.101-->` |
| `src/nucleo/config.js` | `VERSAO = "8.100"` → `"8.101"` |

**Diff do HTML montado (v8.100 → v8.101)**, completo:

```
1c1          <!--PCP:8.100-->  →  <!--PCP:8.101-->
11134c11134  const VERSAO = "8.100";  →  const VERSAO = "8.101";
12524a12525,12527  + 3 linhas de comentário (cabeçalho de produtos/identidade.js)
```

As duas declarações eram as últimas linhas de `tabela.js`, e o arquivo novo vem logo em seguida. Por isso elas ficam **na mesma posição relativa** no HTML (linhas 12525–12526 → 12528–12529, só deslocadas pelo comentário). A ordem de inicialização é idêntica.

## Checagens estáticas

- As duas linhas são byte a byte iguais nos dois HTML.
- Nenhuma chamada a `produtoDe`/`produtoPorIdProd` roda durante a carga (0 chamadas no nível zero); os dois `const` continuam antes de qualquer uso.
- `node --check` ok; o build é determinístico (dois builds, mesmo MD5).

## Testes (mesma sessão, mesmos dados: v8.100 e v8.101 em sequência)

| | v8.100 | v8.101 |
|---|---|---|
| `conflito-pedido` | 8 ok · 0 (D:1, D2:1 toast; demais 0) | **8 ok · 0, idêntico** |
| `datas-festivas-uniao` | 78 ok · 0 | **78 ok · 0** |
| Fotografia de identidade (todos os campos) | referência | **idêntica, 0 campos diferentes** |
| `typeof` e texto das duas funções | `function` / mesmo texto | **iguais** |
| Boot | 242 requisições Supabase, todas 200, sem "Erro ao calcular" | **igual** |

Hashes da fotografia, **iguais nas duas versões**:

| Campo | Hash |
|---|---|
| `produtoDe` (3.260 produtos + SKUs anteriores) | `7a85faf7:129692` |
| `produtoPorIdProd` | `8b58a8fd:16301` |
| `skusDoProduto` | `ef7b72d3:73839` |
| `opAtivaDe` | `674aa399:25629` |
| `produtoPorSkuFrouxo` | `b3e30d0e:46091` |
| `migrarProdutosV2` (em cópia) | `10a5a081:18637955` |
| Demanda (1.683 linhas, 1.617 visíveis, 90 fora) | `09810fd0:106217` |
| Festivas (1 campanha, 90 só na data) | `b8e509eb:5031` |

A fila real do navegador de teste ficou intacta (36 → 36).

## Confirmação

A única mudança funcional é **o arquivo-fonte onde as duas funções são declaradas**. O código, as assinaturas, a ordem no HTML e o comportamento não mudaram.

## Riscos conhecidos

- `produtoDe` e `produtoPorIdProd` são `const`. Mover `produtos/identidade.js` para **depois** de algum arquivo que as use durante a carga criaria erro de TDZ. Hoje ninguém as usa na carga, mas o manifesto precisa manter essa posição.
- `produtoDe` depende de `idx()`, que continua em `componentes/tabela.js` (índice compartilhado com OPs e pedidos).
