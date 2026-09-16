/* ---------- semiacabados: colher e salvar ----------
   `colher*` copia o que está digitado para o rascunho ANTES de qualquer render.
   Sem isso, marcar um chip na janela redesenharia a tela e apagaria o que a
   pessoa já tinha escrito nos outros campos — o erro clássico de janela que
   se redesenha no meio do preenchimento. */
function colherRemessa() {
  const r = S.modal?.r; if (!r) return;
  const v = (id) => ($("#" + id)?.value ?? "");
  if ($("#rm-prest")) r.prestadora = v("rm-prest");
  if ($("#rm-data")) r.data = v("rm-data") || null;
  if ($("#rm-vol")) { const n = Number(v("rm-vol")); r.volumeQtd = n > 0 ? n : null; }
  if ($("#rm-volun")) r.volumeUn = v("rm-volun") || "caixa";
  if ($("#rm-proc")) r.processo = v("rm-proc").trim().toUpperCase() || null;
  if ($("#rm-obs")) r.obs = v("rm-obs").trim() || null;
}
function colherSemiTipo() {
  const t = S.modal?.t; if (!t) return;
  const v = (id) => ($("#" + id)?.value ?? "");
  if ($("#st-tipo")) t.tipo = v("st-tipo").trim() || "Bandana";
  if ($("#st-tam")) t.tamanho = SEMI_TAMS.includes(v("st-tam")) ? v("st-tam") : null;
  if ($("#st-camp")) t.campanha = v("st-camp").trim() || null;
  if ($("#st-var")) t.variante = v("st-var") || "digital";
  if ($("#st-cod")) t.codigo = v("st-cod").trim().toUpperCase() || null;
  if ($("#st-min")) { const n = Number(v("st-min")); t.minimo = n > 0 ? n : 0; }
}

async function salvarRemessa() {
  colherRemessa();
  const base = S.modal?.r || {};
  const prestadora = String(base.prestadora || "").trim();
  /* a validação solta o botão em toda saída: sem isto ele fica em "Aguarde…"
     para sempre e a pessoa acha que gravou */
  if (!prestadora) { S._solta?.(); return toast("Escolha para qual prestadora a remessa foi.", "erro"); }
  if (base.id) {
    const r = remessaPorId(base.id);
    if (!r) { S._solta?.(); S.modal = null; render(); return; }
    r.prestadora = prestadora; r.data = base.data || null;
    r.volumeQtd = Number(base.volumeQtd) > 0 ? Number(base.volumeQtd) : null;
    r.volumeUn = SEMI_UNS.includes(base.volumeUn) ? base.volumeUn : "caixa";
    r.itens = [...new Set(base.itens || [])].filter((id) => semiPorId(id));
    r.processo = String(base.processo || "").trim().toUpperCase() || null;
    r.obs = String(base.obs || "").trim() || null;
    r.atualizado = new Date().toISOString();
    S.modal = null;
    await gravarSemi(`Remessa ${r.numero} (pedido) alterada`);
    toast("Remessa salva.");
    return;
  }
  const r = novaRemessa(base);
  if (!r) { S._solta?.(); return toast("Não consegui registrar a remessa — confira a prestadora.", "erro"); }
  S.modal = null;
  S.semiView.aberta = r.id;
  S.semiView.filtro = "abertas";
  await gravarSemi(`Remessa ${r.numero} para ${prestadora}`);
  /* fecha o ciclo mental: o que aconteceu, onde ela está e o que vem depois */
  toastPasso(`Remessa nº ${r.numero} registrada.`,
    `${primeiroNome(prestadora)} está com ${r.volumeQtd ? n0(r.volumeQtd) + " " + r.volumeUn + (r.volumeQtd > 1 ? "s" : "") : "a remessa"}`,
    "quando voltar, registre o retorno e informe quantas peças vieram");
}

async function salvarRetornoSemi() {
  const remId = S.modal?.remId;
  const r = remessaPorId(remId);
  if (!r) { S._solta?.(); S.modal = null; render(); return; }
  const itens = [...document.querySelectorAll("[data-retq]")]
    .map((c) => ({ semiId: c.dataset.retq, qtd: Number(c.value) || 0 }))
    .filter((x) => x.qtd > 0);
  if (!itens.length) { S._solta?.(); return toast("Informe quantas peças voltaram, em pelo menos um código.", "erro"); }
  const ret = registrarRetorno(remId, { itens, data: $("#rt-data")?.value || null, obs: $("#rt-obs")?.value || "" });
  if (!ret) { S._solta?.(); return toast("Não consegui registrar o retorno.", "erro"); }
  const q = itens.reduce((a, b) => a + b.qtd, 0);
  S.modal = null;
  /* só reposiciona a tela de Semiacabados se for dela que veio o clique — o
     mesmo botão existe na aba Pedidos, e de lá ninguém pediu para navegar */
  if (S.aba === "semiacabados") S.semiView.aberta = r.id;
  await gravarSemi(`Retorno de ${q} peças no pedido ${r.numero}`);
  toastPasso(`${n0(q)} ${q === 1 ? "peça entrou" : "peças entraram"} no estoque de semiacabado.`,
    `a remessa nº ${r.numero} continua em aberto`,
    "encerre quando não vier mais nada dela");
}

async function confirmarEncerrarRemessa() {
  const r = remessaPorId(S.modal?.remId);
  if (!r) { S._solta?.(); S.modal = null; render(); return; }
  const motivo = ($("#er-motivo")?.value || "").trim();
  encerrarRemessa(r.id, motivo);
  S.modal = null;
  await gravarSemi(`Remessa ${r.numero} encerrada`);
  const vt = voltouNaRemessa(r);
  toastPasso(`Remessa nº ${r.numero} encerrada.`,
    `${n0(vt.total)} ${vt.total === 1 ? "peça voltou" : "peças voltaram"} de ${primeiroNome(r.prestadora)}`,
    "elas estão em Semiacabados → Estoque");
}

async function salvarSemiTipo() {
  colherSemiTipo();
  const base = S.modal?.t || {};
  const cat = base.categoria === "festiva" ? "festiva" : "dia";
  const codigo = String(base.codigo || "").trim().toUpperCase()
    || semiCodigoSugerido({ tipo: base.tipo, tamanho: base.tamanho, categoria: cat, variante: base.variante, campanha: base.campanha });
  if (!codigo) { S._solta?.(); return toast("O código interno não pode ficar em branco.", "erro"); }
  const jaTem = semiPorCodigo(codigo);
  if (jaTem && jaTem.id !== base.id) { S._solta?.(); return toast(`Já existe um código interno ${codigo}. Dois códigos iguais viram dois estoques da mesma coisa.`, "erro"); }
  if (cat === "festiva" && !String(base.campanha || "").trim()) { S._solta?.(); return toast("Diga de que campanha é este semiacabado.", "erro"); }
  if (base.id) {
    const t = semiPorId(base.id);
    if (!t) { S._solta?.(); S.modal = null; render(); return; }
    Object.assign(t, { codigo, tipo: String(base.tipo || "Bandana").trim() || "Bandana",
      tamanho: SEMI_TAMS.includes(base.tamanho) ? base.tamanho : null, categoria: cat,
      variante: cat === "dia" ? (base.variante || "digital") : null,
      campanha: cat === "festiva" ? String(base.campanha || "").trim() : null,
      minimo: Number(base.minimo) > 0 ? Number(base.minimo) : 0,
      ativo: base.ativo !== false, atualizado: new Date().toISOString() });
    S.modal = null;
    await gravarSemi(`Código interno ${codigo} alterado`);
    toast("Código salvo.");
    return;
  }
  const t = novoSemiTipo({ ...base, codigo, categoria: cat });
  if (!t) { S._solta?.(); return toast("Não consegui criar o código.", "erro"); }
  S.modal = null;
  S.semiView.modo = "codigos";
  await gravarSemi(`Código interno ${codigo} criado`);
  toastPasso(`${codigo} criado.`, "ele já pode ir numa remessa",
    "o estoque dele nasce do primeiro retorno");
}

async function salvarAjusteSemi() {
  const semiId = $("#aj-semi")?.value;
  const qtd = Number($("#aj-qtd")?.value);
  const motivo = ($("#aj-motivo")?.value || "").trim();
  if (!semiId || !semiPorId(semiId)) { S._solta?.(); return toast("Escolha o semiacabado.", "erro"); }
  if (!qtd) { S._solta?.(); return toast("Diga quanto entra ou sai — negativo tira, positivo põe.", "erro"); }
  if (!motivo) { S._solta?.(); return toast("Escreva o motivo. Ajuste sem motivo é número que ninguém consegue explicar depois.", "erro"); }
  const tp = semiPorId(semiId);
  novoAjusteSemi({ semiId, qtd, motivo, data: $("#aj-data")?.value || null });
  S.modal = null;
  S.semiView.modo = "estoque";
  await gravarSemi(`Ajuste de ${qtd} em ${tp.codigo}: ${motivo}`);
  toastPasso(`${tp.codigo} ajustado em ${qtd > 0 ? "+" : ""}${n0(qtd)}.`,
    `o saldo é ${n0(saldoSemi(semiId))}`, "o motivo ficou gravado no extrato");
}

async function gravarFestivas(msg) {
  if (msg) registrar(null, msg, null, null);
  render();
  await salvarTudo("festivas");
}

