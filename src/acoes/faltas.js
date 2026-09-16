/* ---------- eventos ---------- */
function abrirFalta(pedidoId) {
  const r = pedidoPorId(pedidoId);
  const sku = r ? (opPorId(r.opId)?.sku || r.sku) : null;
  S.modal = { tipo: "falta", novo: true, falta: { id: uid(), status: "aberta", anotadaEm: iso(hoje()),
    pedidoIds: r ? [r.id] : [], sku,
    fornecedor: (sku && produtoDe(sku)?.fornecedor) || "" } }; /* vem da Magazord, editável */
  render();
}

/* clique simples no SKU copia; clique duplo abre o painel do produto,
   que é o que o clique simples fazia antes desta versão */
