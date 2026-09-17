/* ---------- identidade do produto · a quem o SKU pertence ----------
   Dono de `produtoDe` e `produtoPorIdProd` desde a v8.101 (movidas de
   componentes/tabela.js, sem mudança) e de `skusDoProduto` desde a v8.102
   (movida de pedidos/modelo.js, sem mudança). O índice `idx()` continua lá.
   `skuNormal` e `produtoPorSkuFrouxo` chegaram na v8.105, de produtos/provisorios.js. */
const produtoDe = (sku) => idx().prodSku.get(sku) || null; /* SKU antigo também encontra o produto */
const produtoPorIdProd = (id) => S.produtos.find((p) => p.id === id) || null;
/* TODOS os SKUs pelos quais este produto já passou — o atual primeiro.
   `opSku` é montado só com `o.sku` exato: sem isto, renomear o SKU fazia o
   pedido seguinte NÃO achar a OP viva e nascer uma OP PARALELA, partindo o
   histórico de programado × produzido. E em silêncio, porque `produtoDe`
   continuava achando o produto pelo `skusAnteriores`. */
function skusDoProduto(sku) {
  const p = typeof produtoDe === "function" ? produtoDe(sku) : null;
  if (!p) return [sku];
  const l = [p.sku];
  for (const h of (p.skusAnteriores || [])) { const sk = (h && h.sku) || h; if (sk) l.push(sk); }
  if (!l.includes(sku)) l.push(sku);
  return Array.from(new Set(l.filter(Boolean)));
}

/* a única normalização de SKU deste domínio. O resto do app tem ~10 cópias de
   `.trim().toUpperCase()` soltas; unificar todas é outra conversa (etapa 1 da
   reorganização). Aqui a comparação é sempre por esta função. */
function skuNormal(x) { return String(x == null ? "" : x).trim().toUpperCase(); }

/* acha o produto mesmo quando o SKU vem com caixa ou espaço diferentes.
   `produtoDe` usa `Map.get` exato, então a busca crua falha em "bbb.002". */
function produtoPorSkuFrouxo(sku) {
  const alvo = skuNormal(sku);
  if (!alvo) return null;
  const direto = typeof produtoDe === "function" ? (produtoDe(sku) || produtoDe(alvo)) : null;
  if (direto) return direto;
  return (S.produtos || []).find((p) =>
    skuNormal(p.sku) === alvo
    || skuNormal(p.skuAtual) === alvo
    || (p.skusAnteriores || []).some((h) => skuNormal(h?.sku || h) === alvo)) || null;
}
