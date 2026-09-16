/* ---------- CSV no formato exato do importador da Magazord ----------
   Tela: Estoque › Movimentação de Campos Adicionais Estoque.
   Ela pede duas colunas separadas por ponto e vírgula — SKU e o valor do campo —
   e lê CSV. O BOM na frente evita que o acento do cabeçalho chegue quebrado. */
const linhasCsvMinimos = (lista) => (lista || S.calc?.minAEnviar || []).map((l) => `${l.sku};${Math.round(l.estMin)}`);
function csvMinimos(comCabecalho, lista) {
  const corpo = linhasCsvMinimos(lista);
  const cab = comCabecalho ? ["SKU;Quantidade de Estoque Mínimo"] : [];
  return "\uFEFF" + [...cab, ...corpo].join("\r\n") + "\r\n";
}
/* `denovo` refaz o arquivo dos que JÁ foram, sem mexer em carimbo nenhum — é o
   caso de a importação na Magazord ter falhado e ela precisar do mesmo arquivo. */
function baixarCsvMinimos(denovo) {
  const pend = (denovo ? S.calc?.minEnviados : S.calc?.minAEnviar) || [];
  if (!pend.length) return toast("Nenhum mínimo alterado para exportar.", "erro");
  const blob = new Blob([csvMinimos(S.cfg.csvMinCabecalho !== false, pend)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `estoque-minimo-magazord-${iso(hoje())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  if (denovo) return toast(`${n0(pend.length)} ${pend.length === 1 ? "linha" : "linhas"} de novo, no mesmo arquivo. Nada mudou aqui.`);
  /* carimba a saída: a lista "a enviar" esvazia e eles passam para "já enviados",
     que é o estado real depois que o arquivo saiu daqui */
  const agora = new Date().toISOString();
  for (const l of pend) { const prod = produtoDe(l.sku); if (prod?.minAjuste) prod.minAjuste.exportadoEm = agora; }
  registrar(null, `${pend.length} mínimos exportados para a Magazord`, null, null);
  salvarTudo("produtos"); render();
  toastPasso(`${n0(pend.length)} ${pend.length === 1 ? "linha exportada" : "linhas exportadas"}.`,
    "elas saíram da lista de a enviar",
    "importe em Movimentação de Campos Adicionais Estoque e traga o estoque no passo 1");
}

function baixarBackup() {
  /* o backup levava produtos, pedidos e faltas — e deixava para trás os insumos,
     os movimentos, as notas e o histórico de eventos. Restaurar dele apagava o
     estoque de insumo inteiro. Agora leva tudo o que o app guarda. */
  const blob = new Blob([JSON.stringify({ versao: 5, geradoEm: iso(hoje()), config: S.cfg,
    produtos: S.produtos, prestadoras: S.cad.prestadoras, estruturas: S.cad.estruturas, setores: S.cad.setores, cad: S.cad, equipe: S.equipe,
    ops: S.ops, pedidos: S.pedidos, analises: S.analises, faltas: S.faltas, estoque: S.estoque,
    insumos: S.insumos, movInsumo: S.movInsumo, entradas: S.entradas, posse: S.posse,
    bens: S.bens, posseItens: S.posseItens, eventos: S.eventos.slice(-3000), hist: S.hist,
    festivas: S.festivas,
    /* o quarto estoque também vai no backup: restaurar sem ele apagaria as
       remessas e o saldo de semiacabado inteiro, calado */
    semiTipos: S.semiTipos, remessas: S.remessas, semiAjustes: S.semiAjustes })], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `pcp-backup-${iso(hoje())}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}


/* Reanalisa a prioridade de TODOS os pedidos vivos pela situação atual do estoque
   (mesma régua da Demanda: prioridadeDe da linha), respeitando as travadas. */
async function reanalisarPrioridades() {
  const c = S.calc || calcular();
  let subiram = 0, desceram = 0;
  for (const r of S.pedidos) {
    if (!PED_VIVO.includes(r.status) || r.prioridadeTravada) continue;
    const op = opPorId(r.opId);
    const sku = op?.sku || r.sku;
    const linha = c.porSku.get(sku);
    if (!linha) continue;
    const sug = prioridadeDe(linha);
    if (sug === r.prioridade) continue;
    registrar(r.opId, `pedido ${r.numero} reanalisado: prioridade ${CORTE_CURTO[r.prioridade] || r.prioridade} → ${CORTE_CURTO[sug]}`,
      { prioridade: r.prioridade }, { prioridade: sug });
    if (sug < r.prioridade) subiram++; else desceram++;
    r.prioridade = sug;
    r.atualizadoEm = iso(hoje());
  }
  for (const op of S.ops) recalcularOP(op);
  S.calc = calcular();
  await salvarPedidos();
  return { subiram, desceram, total: subiram + desceram };
}

