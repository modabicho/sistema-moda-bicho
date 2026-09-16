/* ---------- identidade do produto · a quem o SKU pertence ----------
   Dono de `produtoDe` e `produtoPorIdProd` desde a v8.101 (movidas de
   componentes/tabela.js, sem mudança). O índice `idx()` continua lá. */
const produtoDe = (sku) => idx().prodSku.get(sku) || null; /* SKU antigo também encontra o produto */
const produtoPorIdProd = (id) => S.produtos.find((p) => p.id === id) || null;
