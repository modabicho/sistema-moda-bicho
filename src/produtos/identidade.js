/* ---------- identidade do produto · a quem o SKU pertence ----------
   Dono de `produtoDe` e `produtoPorIdProd` desde a v8.101 (movidas de
   componentes/tabela.js, sem mudança) e de `skusDoProduto` desde a v8.102
   (movida de pedidos/modelo.js, sem mudança). O índice `idx()` continua lá. */
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
