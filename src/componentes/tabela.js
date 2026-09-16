/* ---------- ordenação de tabela, reaproveitável ----------
   Uma implementação só para todas as telas: o cabeçalho vira botão, o 1º clique
   ordena crescente, o 2º inverte e o 3º devolve a ordem natural da tela — que
   costuma ser a mais útil (fila de produção, prioridade, data). */
function thOrd(tab, campo, label, cls = "", est = "") {
  const o = (S.ord ||= {})[tab] || {};
  const ativo = o.campo === campo;
  return `<th class="s ${cls}" data-ordt="${tab}|${campo}"${est ? ` style="${est}"` : ""} title="Ordenar por ${String(label).replace(/<[^>]+>/g, "")} — o 3º clique volta ao normal">${label}${ativo ? `<span class="ar">${o.dir === -1 ? "↓" : "↑"}</span>` : ""}</th>`;
}
/* valores: string compara por texto (com números dentro), o resto por número.
   Vazio vai sempre para o fim, nos dois sentidos — linha sem dado não é "a menor". */
function ordenarPor(tab, lista, valorDe) {
  const o = (S.ord ||= {})[tab];
  if (!o || !o.campo) return lista;
  const vazio = (v) => v == null || v === "" || (typeof v === "number" && !isFinite(v));
  return lista.slice().sort((a, b) => {
    const va = valorDe(a, o.campo), vb = valorDe(b, o.campo);
    if (vazio(va) && vazio(vb)) return 0;
    if (vazio(va)) return 1;
    if (vazio(vb)) return -1;
    const r = typeof va === "string" || typeof vb === "string"
      ? String(va).localeCompare(String(vb), "pt-BR", { numeric: true, sensitivity: "base" })
      : va - vb;
    return r * o.dir;
  });
}

/* ---------- índices de busca ----------
   opPorId, produtoDe e afins eram varreduras lineares: achar a OP de um pedido
   percorria as 1.500 OPs, e isso acontece milhares de vezes por render. Com 5.000
   pedidos dava ~58ms só nesse passo; com índice cai para ~2ms. Os índices vencem
   junto com _rev, que já é incrementado a cada gravação. */
let _idx = { rev: -1, ciclo: -1, nP: -1, nO: -1, nD: -1 };
let _ciclo = 0;   /* incrementa a cada render: os índices valem por um ciclo de tela */
function idx() {
  /* Vence em três situações, e as três são necessárias:
     - _rev: houve gravação
     - _ciclo: começou um novo render
     - tamanho das listas: alguém criou ou removeu registro DENTRO do mesmo ciclo,
       o que acontece em criar pedidos, excluir produtos e nas importações.
     O índice guarda só o que NÃO muda (id, sku, opId). Campos que mudam — como
     status — são filtrados na hora da consulta, então cancelar um pedido ou
     encerrar uma OP tem efeito imediato, sem depender de recalcular o índice. */
  if (_idx.rev === _rev && _idx.ciclo === _ciclo
      && _idx.nP === S.pedidos.length && _idx.nO === S.ops.length && _idx.nD === S.produtos.length) return _idx;
  _idx = { rev: _rev, ciclo: _ciclo, nP: S.pedidos.length, nO: S.ops.length, nD: S.produtos.length,
    opId: new Map(S.ops.map((o) => [o.id, o])),
    opSku: new Map(),
    prodSku: new Map(),
    pedId: new Map(S.pedidos.map((r) => [r.id, r])),
    pedPorOp: new Map() };
  for (const o of S.ops) { const l = _idx.opSku.get(o.sku); l ? l.push(o) : _idx.opSku.set(o.sku, [o]); }
  for (const p of S.produtos) { if (!_idx.prodSku.has(p.sku)) _idx.prodSku.set(p.sku, p);
    for (const h of (p.skusAnteriores || [])) { const sk = h?.sku || h; if (sk && !_idx.prodSku.has(sk)) _idx.prodSku.set(sk, p); } }
  for (const r of S.pedidos) { const l = _idx.pedPorOp.get(r.opId); l ? l.push(r) : _idx.pedPorOp.set(r.opId, [r]); }
  return _idx;
}

const produtoDe = (sku) => idx().prodSku.get(sku) || null; /* SKU antigo também encontra o produto */
const produtoPorIdProd = (id) => S.produtos.find((p) => p.id === id) || null;
