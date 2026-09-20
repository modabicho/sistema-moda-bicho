/* as ações que estão rodando agora — ver a trava em `_clique` (v8.79) */
const ACOES_RODANDO = new Set();

/* ---------------------------------------------------------------------------
   O CADERNO DAS AÇÕES (v8.81) · diagnóstico, sem UI nova
   ---------------------------------------------------------------------------
   Existe um relato de janela que continua de pé DEPOIS de a gravação dar certo
   e o botão voltar ao normal. Medi quinze fluxos ao vivo e em nenhum deles a
   janela ficou — então falta a evidência do caso real, e ela some junto com o
   toast.

   Aqui fica o registro de cada ação da infraestrutura: qual foi, quanto
   demorou, qual janela estava aberta ANTES e qual ficou DEPOIS, e se alguma
   exceção foi engolida no caminho. No console:  ACOES_LOG
   --------------------------------------------------------------------------- */
const ACOES_LOG = [];

document.addEventListener("dblclick", (e) => {
  const alvo = e.target?.closest ? e.target.closest("[data-sku]") : null;
  if (!alvo || e.target.closest("button,select,input,a,textarea")) return;
  const sku = alvo.dataset.sku;
  if (!sku) return;
  e.preventDefault();
  S.drawer = sku; S.modal = null; render();
});

document.addEventListener("click", async (e) => {
if (typeof window !== "undefined") {
}
  try {
    await _clique(e);
  } catch (err) {
    console.error(err);
    /* v8.88 · o toast continua igual — inclusive o "tire um print e me mande",
       porque o print diz o que a pessoa estava fazendo. O aviso ao lado é para
       o caso de ela não mandar: o erro chega com versão, aba e janela. */
    try {
      const alvo = e && e.target && e.target.closest ? e.target.closest("[data-act]") : null;
      sentryAvisar(err, "clique", { acao: (alvo && alvo.dataset && alvo.dataset.act) || null });
    } catch (e2) {}
    try { toast("Erro no clique: " + (err.message || err) + " — tire um print e me mande.", "erro"); } catch {}
  }
});
async function _clique(e) {
  const el = (attr) => e.target && e.target.closest ? e.target.closest(`[${attr}]`) : null;
  /* menu da conta: qualquer clique fora dele fecha, como em qualquer menu suspenso */
  if (S.menuConta && !(e.target.closest && (e.target.closest(".rf-menu") || e.target.closest('[data-act="menu-conta"]')))) {
    S.menuConta = false; render();
  }
  /* a folha do "Mais" fecha igual: clique fora, fecha. O véu por cima da tela
     já tem `data-act="fechar-mais"`, mas quem toca na barra também sai. */
  if (S.menuMais && !(e.target.closest && (e.target.closest(".bm-folha") || e.target.closest('[data-act="menu-mais"]')))) {
    S.menuMais = false;
  }
  let t;

  /* v8.107 · a aba Processos trata os próprios cliques; aqui fica só a porta.
     Vem depois dos menus de cima, para clicar dentro dela também fechar o menu.
     v8.108 · `data-proc` troca de sub-aba; `data-fita` é o miolo do cadastro. */
  if ((t = el("data-proc")) && typeof procClique === "function") {
    e.stopPropagation(); if (procClique(t)) return; }
  if ((t = el("data-fita")) && typeof fitaClique === "function") {
    e.stopPropagation(); if (await fitaClique(t)) return; }

  if ((t = el("data-aba"))) {
    if (!podeAba(t.dataset.aba)) { toast("Sem acesso a essa parte — fale com a administradora.", "erro"); return; }
    /* a seleção de produtos também se desfaz ao trocar de aba, como a de pedidos:
       voltar dias depois e encontrar 842 produtos marcados ao lado de um botão
       de excluir é convite a acidente. */
    S.aba = t.dataset.aba; lembrarAba(); S.sel.clear(); S.selProd = new Set(); S.drawer = null; S.menuMais = false; render(); return; }

  /* ---- ABAS INTERNAS (v8.62) ----
     Ir para uma aba é a mesma coisa que ir para a tela dela: quem reconcilia a
     barra é o `abasSincronizar()` de dentro do render. A seleção NÃO é limpa
     aqui, ao contrário do menu lateral: selecionar 20 pedidos e ir olhar a
     Demanda não pode perder a seleção — é justamente o que abas existem para
     evitar. */
  if ((t = el("data-aba-ir"))) { e.stopPropagation();
    if (abasFocar(t.dataset.abaIr)) render(); return; }
  if ((t = el("data-aba-fechar"))) { e.stopPropagation();
    const alvoId = t.dataset.abaFechar;
    /* colhe antes de perguntar: o que está digitado agora é o que decide se há
       algo a perder */
    if (typeof abasGuardarRascunho === "function") abasGuardarRascunho();
    if (typeof abaTemRascunho === "function" && abaTemRascunho(alvoId)) {
      const aba = (S.abas || []).find((x) => x.id === alvoId);
      S.modal = { tipo: "confirmar", voltarPara: S.modal,
        titulo: "Fechar sem salvar?",
        texto: "O que você digitou neste pedido será perdido.",
        acao: "Fechar sem salvar", perigo: true,
        detalhe: `<b>${esc((aba && aba.rotulo) || "Este pedido")}</b> tem alteração que ainda não foi enviada ao servidor.`,
        aoConfirmar: async () => { const m = S.modal && S.modal.voltarPara;
          S.modal = m || null; abasFechar(alvoId); } };
      render(); return;
    }
    if (!abasFecharPintando(alvoId)) render();
    return; }
  if ((t = el("data-ir"))) {
    let destino = t.dataset.ir;
    if (destino === "fila") { destino = "pedidos"; S.pedView.etapa = "fila"; }
    if (destino === "producao") { destino = "pedidos"; S.pedView.etapa = "andamento"; }
    S.aba = destino; lembrarAba(); render(); return;
  }
  if ((t = el("data-ordq"))) {
    const c2 = t.dataset.ordq, v = S.pedView;
    const padrao = c2 === "qtd" ? -1 : 1; /* Qtd começa do maior pro menor */
    if (v.ord !== c2) { v.ord = c2; v.dir = padrao; }
    else if (v.dir === padrao) v.dir = -padrao;
    else { v.ord = null; v.dir = 1; } /* 3º clique: volta à ordem da fila */
    render(); return;
  }
  if ((t = el("data-kpi-etapa"))) { S.pedView.etapa = t.dataset.kpiEtapa; render(); return; }
  if ((t = el("data-quem"))) { S.tarefas.quem = t.dataset.quem; render(); return; }
  if ((t = el("data-ord"))) {
    const c2 = t.dataset.ord;
    if (S.demanda.ord === c2) S.demanda.dir *= -1; else { S.demanda.ord = c2; S.demanda.dir = -1; }
    render(); return;
  }
  if ((t = el("data-f"))) { const [k, v] = t.dataset.f.split(":"); S.demanda[k] = v; S.demanda.limite = 60; render(); return; }
  if ((t = el("data-dsetor"))) { S.demanda.setor = t.dataset.dsetor; S.demanda.limite = 60; render(); return; }
  if ((t = el("data-limpardem"))) { const dv = S.demanda; dv.busca = ""; dv.abc = "todos"; dv.processo = "todos";
    dv.setor = "todos"; dv.fornecedor = "todos"; render(); return; }
  /* ---- decisões de estoque mínimo ---- */
  if ((t = el("data-pmodo"))) { S.prestView.modo = t.dataset.pmodo; render(); return; }
  if ((t = el("data-fposse"))) { S.posseView.sit = t.dataset.fposse; render(); return; }
  if ((t = el("data-posse-dev"))) { S.modal = { tipo: "devolverPosse", itemId: t.dataset.posseDev }; render(); return; }
  if ((t = el("data-bem-tirar"))) {
    const b = bemPorId(t.dataset.bemTirar); if (!b) return;
    if (emPosseDoBem(b.id)) return toast(`${b.nome} ainda está na mão de alguém.`, "erro");
    b.ativo = false; await salvarTudo("insumos"); render();
    toast(`${b.nome} arquivado.`); return; }
  if ((t = el("data-desfazer-ret"))) {
    const g = retiradasRecentes(500).find((x) => x.rid === t.dataset.desfazerRet); if (!g) return;
    if (!daParaDesfazer(g)) return toast(`Passados ${PRAZO_DESFAZER} dias, registre a devolução em vez de apagar.`, "erro");
    if (!confirm(`Desfazer a anotação de ${g.prestadora} de ${fdate(g.quando)}?\n\nIsto apaga a anotação inteira — o material volta para o saldo da fábrica e as produções somem da posse dela.`)) return;
    const fim = desfazerRetirada(g.rid);
    registrar(null, `anotação de ${g.prestadora} desfeita (${fim.movs} ${fim.movs === 1 ? "movimento" : "movimentos"})`, null, null);
    await salvarTudo("insumos"); render();
    toast(`Anotação desfeita — ${fim.movs} ${fim.movs === 1 ? "movimento apagado" : "movimentos apagados"}${fim.prods ? ` e ${fim.prods} ${fim.prods === 1 ? "produção" : "produções"}` : ""}.`);
    return; }
  if ((t = el("data-hist-prest"))) { S.modal = { tipo: "histPrest", nome: t.dataset.histPrest }; render(); return; }
  if ((t = el("data-posse-fim"))) {
    const px = possePorId(t.dataset.posseFim); if (!px) return;
    if (!confirm(`Encerrar "${posseRotulo(px)}" de ${px.prestadora}?\n\nUse quando a produção voltou sem passar por um pedido. Com pedido, quem encerra é a conferência.`)) return;
    encerrarPosse(px.id, "encerrada à mão");
    registrar(null, `produção "${posseRotulo(px)}" de ${px.prestadora} encerrada à mão`, null, null);
    await salvarTudo("insumos"); render(); toast("Produção encerrada."); return; }
  if ((t = el("data-prest-falta"))) { e.stopPropagation();
    /* `data-prest-falta` é `<insumoId>|<nome da prestadora>`, e o NOME pode
       conter `|`. `split("|")` cortava no primeiro separador que achasse e
       entregava metade do nome — e a falta ia parar na prestadora errada, ou
       em nenhuma. O id vem primeiro e não tem `|`: corta-se UMA vez, e o
       resto inteiro é o nome. */
    const cru = String(t.dataset.prestFalta);
    const corte = cru.indexOf("|");
    const insumoId = corte < 0 ? cru : cru.slice(0, corte);
    const prest = corte < 0 ? "" : cru.slice(corte + 1);
    const i = insumoPorId(insumoId); if (!i) return;
    const item = reporNaPrestadora(prest).find((x) => x.bem.insumoId === insumoId);
    const f2 = fornecedorPorId(i.fornecedorId);
    /* a falta da prestadora é uma falta como qualquer outra: mesma lista, mesma
       aba Compras, mesmo aviso. Um segundo controle seria uma segunda verdade. */
    S.modal = { tipo: "falta", novo: true, falta: { id: uid(), status: "aberta", anotadaEm: iso(hoje()),
      item: `${i.nome}${i.unidade ? ` (${i.unidade})` : ""}`, qtd: item?.faltam || null,
      fornecedor: f2?.nome || "", insumoId: i.id,
      obs: `Para enviar a ${prest}: ela tem ${nDec(item?.com ?? 0)} e o mínimo com ela é ${nDec(item?.minimo ?? 0)}. Na fábrica: ${nDec(saldoInsumo(i.id))}.` } };
    render(); return; }
  if ((t = el("data-rt-fim"))) { const r = colherRetirada(); if (r) {
    const id = t.dataset.rtFim; r.encerrar = r.encerrar || [];
    r.encerrar = r.encerrar.includes(id) ? r.encerrar.filter((x) => x !== id) : [...r.encerrar, id];
    render(); } return; }
  if ((t = el("data-rt-cat"))) { const r = colherRetirada(); if (r) {
    const [i, v] = String(t.dataset.rtCat).split("|"); const p = r.prods[Number(i)];
    if (p) { p.categoria = v; if (v === "festiva") p.variante = null; else if (!p.variante) p.variante = "normal"; }
    r.sugerido = null; render(); } return; }
  if ((t = el("data-rt-var"))) { const r = colherRetirada(); if (r) {
    const [i, v] = String(t.dataset.rtVar).split("|"); const p = r.prods[Number(i)];
    if (p) p.variante = p.variante === v ? null : v; r.sugerido = null; render(); } return; }
  if ((t = el("data-rt-tam"))) { const r = colherRetirada(); if (r) {
    const [i, v] = String(t.dataset.rtTam).split("|"); const p = r.prods[Number(i)];
    if (p) { p.tamanhos = p.tamanhos || [];
      p.tamanhos = p.tamanhos.includes(v) ? p.tamanhos.filter((x) => x !== v)
        : POSSE_TAMS.filter((tm) => tm === v || p.tamanhos.includes(tm)); }
    r.sugerido = null; render(); } return; }
  if ((t = el("data-rt-delprod"))) { const r = colherRetirada(); if (r) {
    r.prods.splice(Number(t.dataset.rtDelprod), 1); r.sugerido = null; render(); } return; }
  if ((t = el("data-rt-delmat"))) { const r = colherRetirada(); if (r) {
    r.mats.splice(Number(t.dataset.rtDelmat), 1); r.sugerido = null; render(); } return; }
  if ((t = el("data-rt-emb"))) { const r = colherRetirada(); if (r) {
    const x = r.mats[Number(t.dataset.rtEmb)]; if (x) x.emb = !x.emb; r.sugerido = null; render(); } return; }
  if ((t = el("data-regmeses-del"))) {
    const lista = regrasMeses().slice();
    const fora = lista.splice(Number(t.dataset.regmesesDel), 1)[0];
    S.cfg.regrasMeses = lista;
    salvarCfg().then(() => { render(); toast(`Exceção ${fora?.processo || ""} removida — volta a valer o padrão da casa.`); });
    return; }
  if ((t = el("data-cmd-i"))) { abrirResultado(S.cmd?.itens[Number(t.dataset.cmdI)]); return; }
  if ((t = el("data-cmd-fora")) && e.target === t) { S.cmd = null; render(); return; }
  if ((t = el("data-vincular"))) {
    const [pid, skuReal] = String(t.dataset.vincular).split("|");
    const res = vincularProvisorio(pid, skuReal);
    if (!res) return toast("Não consegui vincular este produto.", "erro");
    salvarTudo("produtos", "nucleo"); render();
    toast(`${res.antigo} → ${res.produto.sku}${res.refs ? ` · ${n0(res.refs)} ${res.refs === 1 ? "referência atualizada" : "referências atualizadas"}` : ""}${res.absorveu ? " · cadastro duplicado absorvido" : ""}.`);
    return; }
  if ((t = el("data-vincular-input"))) {
    const pid = t.dataset.vincularInput;
    const skuReal = ($("#vinc-" + pid)?.value || "").trim().toUpperCase();
    if (!skuReal) return toast("Escreva o SKU real antes de vincular.", "erro");
    const prov = produtoPorIdProd(pid);
    if (skuReal === prov?.sku) return toast("Esse é o próprio código provisório.", "erro");
    const res = vincularProvisorio(pid, skuReal);
    if (!res) return toast("Não consegui vincular este produto.", "erro");
    salvarTudo("produtos", "nucleo"); render();
    toast(`${res.antigo} → ${res.produto.sku}${res.refs ? ` · ${n0(res.refs)} ${res.refs === 1 ? "referência atualizada" : "referências atualizadas"}` : ""}${res.absorveu ? " · cadastro duplicado absorvido" : ""}.`);
    return; }
  if ((t = el("data-npnum"))) { e.stopPropagation();
    if (S.modal?.tipo === "novoPedido") {
      /* v8.84 · o CAMPO primeiro. O repaint agora colhe o que está nos campos e
         repõe depois (é o que salva prestadora, prioridade e observações); se o
         campo continuasse com o número velho, ele voltaria por cima do sugerido
         e o botão não faria nada. */
      const campoNum = document.getElementById("np-num");
      if (campoNum) campoNum.value = t.dataset.npnum;
      S.modal.v = { ...capturarNovoPedido(), num: t.dataset.npnum };
      repintarModal();
    } return; }
  if ((t = el("data-npmodo"))) {
    if (S.modal?.tipo === "novoPedido") { S.modal.v = capturarNovoPedido(); S.modal.novo = t.dataset.npmodo === "novo"; }
    repintarModal(); return; }
  if ((t = el("data-minsku"))) { S.modal = { tipo: "revisarMin", sku: t.dataset.minsku, pulados: [] }; render(); return; }
  if ((t = el("data-min-aceitar"))) {
    const sku = t.dataset.minAceitar, l = S.calc?.porSku.get(sku);
    if (l) { definirMinimo(sku, l.estMinCalc, "sugerido"); if (S.modal) S.modal.sku = null;
      salvarTudo("produtos"); render(); toast(`${sku}: mínimo ${n0(l.estMin)} → ${n0(l.estMinCalc)}. Já vale aqui e entrou na lista da Magazord.`); }
    return; }
  if ((t = el("data-min-manter"))) {
    const sku = t.dataset.minManter;
    manterMinimo(sku); if (S.modal) S.modal.sku = null;
    salvarTudo("produtos"); render(); toast(`${sku}: mínimo mantido. Volta à fila se o ERP ou a sugestão mudarem.`);
    return; }
  if ((t = el("data-min-outro"))) {
    const sku = t.dataset.minOutro, campo = $("#min-outro");
    const v = Number(campo?.value);
    if (!(v >= 0) || campo?.value === "") { toast("Digite o número do mínimo antes de aplicar.", "erro"); return; }
    definirMinimo(sku, v, "manual"); if (S.modal) S.modal.sku = null;
    salvarTudo("produtos"); render(); toast(`${sku}: mínimo definido em ${n0(Math.round(v))}.`);
    return; }
  if ((t = el("data-min-pular"))) {
    const sku = t.dataset.minPular;
    if (S.modal) { S.modal.pulados = [...(S.modal.pulados || []), sku]; S.modal.sku = null; }
    render(); return; }
  if ((t = el("data-tirarped"))) {
    const pv = S.pedView, k = t.dataset.tirarped;
    if (k === "busca") pv.busca = ""; else pv[k] = "todos";
    pv.limite = 200; render(); return; }
  if ((t = el("data-tirardem"))) {
    const dv = S.demanda, k = t.dataset.tirardem;
    if (k === "busca") dv.busca = ""; else dv[k] = "todos";
    render(); return; }
  if ((t = el("data-limparped"))) { const pv = S.pedView; pv.busca = ""; pv.corte = "todos"; pv.setor = "todos";
    pv.abc = "todos"; pv.processo = "todos"; pv.fornecedor = "todos"; pv.prestadora = "todas";
    pv.limite = 200; render(); return; }
  if ((t = el("data-fabcped"))) { S.pedView.abc = t.dataset.fabcped; S.pedView.limite = 50; render(); return; }
  if ((t = el("data-fc"))) { S.pedView.corte = t.dataset.fc; S.pedView.limite = 50; render(); return; }
  if ((t = el("data-fsetor"))) { S.pedView.setor = t.dataset.fsetor; S.pedView.limite = 50; render(); return; }
  if ((t = el("data-fe"))) { S.pedView.etapa = t.dataset.fe; S.pedView.limite = 50; render(); return; }
  /* ---------- relatório de produção ---------- */
  if ((t = el("data-relbase-geral"))) { S.rel.base = t.dataset.relbaseGeral; S.rel.limite = 80; render(); return; }
  if ((t = el("data-relbase"))) {
    e.stopPropagation();
    const [sku, b] = t.dataset.relbase.split("|");
    /* escolher a mesma régua geral não é exceção nenhuma: some do mapa */
    if (b === S.rel.base) delete S.rel.porSku[sku]; else S.rel.porSku[sku] = b;
    render(); return;
  }
  if ((t = el("data-relso"))) { S.rel.so = t.dataset.relso; S.rel.limite = 80; render(); return; }
  if ((t = el("data-relabc"))) { S.rel.abc = t.dataset.relabc; S.rel.limite = 80; render(); return; }
  if ((t = el("data-relsetor"))) { S.rel.setor = t.dataset.relsetor; S.rel.limite = 80; render(); return; }
  if ((t = el("data-reltirar"))) {
    const k = t.dataset.reltirar;
    S.rel[k] = k === "categoria" ? "todas" : k === "busca" ? "" : "todos";
    S.rel.limite = 80; render(); return;
  }
  if ((t = el("data-relsel"))) {
    e.stopPropagation();
    const k = t.dataset.relsel;
    S.rel.sel ||= new Set();
    if (S.rel.sel.has(k)) S.rel.sel.delete(k); else S.rel.sel.add(k);
    render(); return;
  }
  if ((t = el("data-relsel-all"))) {
    e.stopPropagation();
    const ids = t.dataset.relselAll.split(",").filter(Boolean);
    S.rel.sel ||= new Set();
    if (ids.every((k) => S.rel.sel.has(k))) ids.forEach((k) => S.rel.sel.delete(k));
    else ids.forEach((k) => S.rel.sel.add(k));
    render(); return;
  }
  if ((t = el("data-relord"))) {
    const c2 = t.dataset.relord;
    if (S.rel.ord === c2) S.rel.dir *= -1; else { S.rel.ord = c2; S.rel.dir = c2 === "sku" ? 1 : -1; }
    render(); return;
  }
  if ((t = el("data-rel-criar"))) {
    e.stopPropagation();
    const sku = t.dataset.relCriar;
    const x = relLinhas().find((y) => y.l.sku === sku) || { produzir: 0 };
    abrirCriarPedidos([sku], () => x.produzir);
    return;
  }
  if ((t = el("data-dmodo"))) { S.demanda.modo = t.dataset.dmodo; render(); return; }
  if ((t = el("data-ordped"))) {
    const c2 = t.dataset.ordped;
    if (S.demanda.ordPed === c2) S.demanda.dirPed *= -1; else { S.demanda.ordPed = c2; S.demanda.dirPed = 1; }
    render(); return;
  }
  if ((t = el("data-fconf"))) { S.prestView.confFiltro = t.dataset.fconf; S.prestView.limiteConf = 120; render(); return; }
  if ((t = el("data-fkpi"))) { S.prestView.kpi = t.dataset.fkpi; render(); return; }
  if ((t = el("data-mesproc"))) { S.prestView.mesProc = t.dataset.mesproc; render(); return; }
  if ((t = el("data-lalvo"))) { S.modal.alvo = t.dataset.lalvo; S.modal.fl = {}; repintarModal(); return; }
  if ((t = el("data-lf"))) { const [k, v] = String(t.dataset.lf).split("|"); (S.modal.fl ||= {})[k] = v; repintarModal(); return; }
  if ((t = el("data-ordt"))) {
    e.stopPropagation();
    const [tab, campo] = String(t.dataset.ordt).split("|");
    S.ord ||= {};
    const o = S.ord[tab] || (S.ord[tab] = {});
    if (o.campo !== campo) { o.campo = campo; o.dir = 1; }
    else if (o.dir === 1) o.dir = -1;
    else { o.campo = null; o.dir = 1; }
    render(); return;
  }
  if ((t = el("data-orddw"))) {
    e.stopPropagation();
    const c2 = t.dataset.orddw;
    const o = S.drawerOrd || (S.drawerOrd = { ord: "", dir: 1 });
    /* 1º clique ordena, 2º inverte, 3º volta à ordem natural da fila */
    if (o.ord !== c2) { o.ord = c2; o.dir = 1; }
    else if (o.dir === 1) o.dir = -1;
    else { o.ord = ""; o.dir = 1; }
    render(); return;
  }
  if ((t = el("data-embadd"))) {
    const escopo = t.dataset.ppg;
    const campo = document.querySelector(`[data-embnovo="${t.dataset.embadd}"]${escopo != null ? `[data-ppg="${escopo}"]` : ""}`);
    if (campo) campo.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if ((t = el("data-aobipar"))) { S.cfg.aoBiparProduto = t.dataset.aobipar; salvarCfg(); render();
    toast(t.dataset.aobipar === "loja" ? "Ao bipar, o app abre a loja." : t.dataset.aobipar === "ambos" ? "Ao bipar, abre o produto e a loja." : "Ao bipar, abre o produto no app."); return; }
  if ((t = el("data-qrprod"))) { S.cfg.qrProduto = t.dataset.qrprod; salvarCfg(); render();
    toast(t.dataset.qrprod === "loja" ? "O 2º QR passa a levar o endereço da loja." : "O 2º QR passa a levar o SKU."); return; }
  if ((t = el("data-editcel"))) { S.prestView.editarCel = t.dataset.editcel === "1"; render(); return; }
  if ((t = el("data-etapas-ped"))) {
    if (!podeEditar("pedEtapas")) { recusaPerm("pedEtapas"); return; }
    const r = pedidoPorId(t.dataset.etapasPed);
    if (r) { S.modal = { tipo: "etapasPedido", pedido: r, sel: etapasDoPedido(r).map((x) => String(x).toUpperCase()) }; render(); }
    return;
  }
  if ((t = el("data-conf-ped"))) {
    const r = pedidoPorId(t.dataset.confPed);
    if (r) { S.modal = { tipo: "conferir", pedido: r, foto: fotoPedido(r) }; render(); }
    return;
  }
  if ((t = el("data-bxdel"))) { S.modal.regras.splice(+t.dataset.bxdel, 1); render(); return; }
  if ((t = el("data-prcdel"))) { e.stopPropagation(); colherProduto();
    (S.modal.receitaProd || []).splice(Number(t.dataset.prcdel), 1); render(); return; }
  if ((t = el("data-rcdel"))) { e.stopPropagation(); colherEstrutura();
    S.modal.receita.splice(Number(t.dataset.rcdel), 1); render(); return; }
  if ((t = el("data-exdel"))) { colherEstrutura(); S.modal.e.etapas.splice(+t.dataset.exdel, 1); render(); return; }
  if ((t = el("data-estr-edit"))) {
    const e = (S.cad.estruturas || []).find((x) => x.processo === t.dataset.estrEdit);
    if (e) { S.modal = { tipo: "estrutura", novo: false, original: e.processo, e: JSON.parse(JSON.stringify(e)) }; render(); }
    return;
  }
  if ((t = el("data-restaurar"))) {
    e.stopPropagation();
    const i = Number(t.dataset.restaurar);
    const p = (S.pontosCache || [])[i];
    if (!p) return;
    if (!confirm(`Voltar a base inteira para a foto de ${fdataHora(p.em)}? O que foi feito depois disso se perde.`)) return;
    const ok = await pontoRestaurar(i);
    toast(ok ? `Base restaurada para ${fdataHora(p.em)}.` : "Não consegui restaurar esse ponto.", ok ? undefined : "erro");
    render();
    return;
  }
  if ((t = el("data-papel-ok"))) {
    e.stopPropagation();
    const r = pedidoPorId(t.dataset.papelOk);
    if (r && r.status === "papel") {
      registrar(r.opId, `pedido ${r.numero}: papel de produção impresso`, { status: "papel" }, { status: "aberto" });
      r.status = "aberto";
      await salvarPedidos();
      toastPasso(`Pedido ${r.numero} · papel impresso`, P_LABEL.aberto, "próxima: separar e cortar as peças");
    }
    return;
  }
  /* clicar num SKU em qualquer tela copia — vem antes de tudo para que a linha
     não abra o painel junto; para abrir, basta clicar em qualquer outro ponto dela */
  const alvoSku = e.target?.closest ? e.target.closest(".sku, .sku-f, [data-copiar]") : null;
  if (alvoSku && !e.target.closest("button,select,input,a,textarea")) {
    const txt = (alvoSku.dataset.copiar || alvoSku.textContent || "").trim().split(/\s+/)[0];
    if (txt) { e.stopPropagation(); copiar(txt, `${txt} copiado.`); return; }
  }
  if ((t = el("data-loja"))) { e.stopPropagation(); abrirNaLoja(t.dataset.loja); return; }
  if ((t = el("data-nao-faz"))) {
    const nome = S.modal?.prest?.nome;
    const pr = S.cad.prestadoras.find((x) => x.nome === nome);
    if (pr) {
      pr.refsExcluidas = pr.refsExcluidas || [];
      const sku2 = t.dataset.naoFaz;
      const i2 = pr.refsExcluidas.indexOf(sku2);
      if (i2 >= 0) pr.refsExcluidas.splice(i2, 1); else pr.refsExcluidas.push(sku2);
      await salvarCad();
      const novo2 = S.calc.prestMap.get(nome);
      if (novo2) { S.modal = { tipo: "verPrest", prest: novo2 }; render(); }
    }
    return;
  }
  if ((t = el("data-fh"))) { S.historico.tipo = t.dataset.fh; S.historico.limite = 200; render(); return; }
  if ((t = el("data-excluir-prod"))) { e.stopPropagation(); abrirExclusaoProdutos([t.dataset.excluirProd]); return; }
  if ((t = el("data-fp"))) { S.produtosView.filtro = t.dataset.fp; render(); return; }
  if ((t = el("data-modo"))) { S.produtosView.modo = t.dataset.modo; render(); return; }
  if ((t = el("data-fpr"))) { S.prestView.so = t.dataset.fpr; render(); return; }
  if ((t = el("data-fcompra"))) { S.comprasView.filtro = t.dataset.fcompra; render(); return; }


  /* ---------- semiacabados ----------
     Ordem importa: `data-abrirrem` fica na LINHA, e os botões vivem dentro dela.
     Como `el()` usa closest, um teste de linha colocado antes engoliria o clique
     dos botões — foi exatamente o bug dos botões de notificação. */
  if ((t = el("data-semimodo"))) { S.semiView.modo = t.dataset.semimodo; S.semiView.aberta = null; render(); return; }
  if ((t = el("data-semif"))) { S.semiView.filtro = t.dataset.semif; S.semiView.limite = 40; render(); return; }
  if ((t = el("data-retornorem"))) { e.stopPropagation();
    S.modal = { tipo: "retornoSemi", remId: t.dataset.retornorem }; render(); return; }
  if ((t = el("data-editarrem"))) { e.stopPropagation();
    const r = remessaPorId(t.dataset.editarrem);
    if (r) { S.modal = { tipo: "remessa", r: JSON.parse(JSON.stringify(r)) }; render(); } return; }
  if ((t = el("data-encerrarrem"))) { e.stopPropagation();
    S.modal = { tipo: "encerrarRem", remId: t.dataset.encerrarrem }; render(); return; }
  if ((t = el("data-reabrirrem"))) { e.stopPropagation();
    const r = remessaPorId(t.dataset.reabrirrem); if (!r) return;
    const res = reabrirRemessa(r.id);
    if (res && res.erro) { toast(res.erro, "erro"); return; }
    await gravarSemi(`Remessa ${r.numero} reaberta`);
    toastPasso("Remessa reaberta.", "ela saiu da conferência e voltou para a lista de abertas",
      "encerre de novo quando não vier mais nada");
    return; }
  if ((t = el("data-excluirrem"))) { e.stopPropagation();
    const r = remessaPorId(t.dataset.excluirrem); if (!r) return;
    if (retornosDe(r).length) { toast("Esta remessa já teve retorno — apagar sumiria com peças que entraram no estoque. Desfaça os retornos primeiro.", "erro"); return; }
    if (!confirm(`Excluir a remessa nº ${r.numero}? Ela some da lista e do histórico.`)) return;
    S.remessas = remessas().filter((x) => x.id !== r.id);
    S.modal = null; S.semiView.aberta = null;
    await gravarSemi(`Remessa ${r.numero} excluída`);
    toast("Remessa excluída.");
    return; }
  if ((t = el("data-desfazerret"))) { e.stopPropagation();
    const [remId, retId] = String(t.dataset.desfazerret).split("|");
    const r = remessaPorId(remId); if (!r) return;
    const ret = retornosDe(r).find((x) => x.id === retId); if (!ret) return;
    const q = (ret.itens || []).reduce((a, b) => a + (Number(b.qtd) || 0), 0);
    if (!confirm(`Desfazer este retorno? Saem ${n0(q)} peças do estoque de semiacabado.`)) return;
    desfazerRetorno(remId, retId);
    await gravarSemi(`Retorno desfeito na remessa ${r.numero}`);
    toast("Retorno desfeito.");
    return; }
  if ((t = el("data-extratosemi"))) { e.stopPropagation();
    S.modal = { tipo: "extratoSemi", semiId: t.dataset.extratosemi }; render(); return; }
  if ((t = el("data-ajustesemi"))) { e.stopPropagation();
    S.modal = { tipo: "ajusteSemi", semiId: t.dataset.ajustesemi }; render(); return; }
  if ((t = el("data-editarsemi"))) { e.stopPropagation();
    const tp = semiPorId(t.dataset.editarsemi);
    if (tp) { S.modal = { tipo: "semiTipo", t: JSON.parse(JSON.stringify(tp)) }; render(); } return; }
  if ((t = el("data-excluirsemi"))) { e.stopPropagation();
    const tp = semiPorId(t.dataset.excluirsemi); if (!tp) return;
    if (entradasSemi(tp.id) || saldoSemi(tp.id)) { toast("Este código já tem movimento — deixe-o inativo em vez de apagar, senão o extrato fica sem sentido.", "erro"); return; }
    S.semiTipos = semiTipos().filter((x) => x.id !== tp.id);
    S.modal = null;
    await gravarSemi(`Código interno ${tp.codigo} excluído`);
    toast("Código excluído.");
    return; }
  /* nas janelas: marcações que só mexem no rascunho, sem gravar */
  if ((t = el("data-rmitem"))) {
    const id = t.dataset.rmitem; const r = S.modal?.r || (S.modal ? (S.modal.r = {}) : null);
    if (!r) return;
    colherRemessa();
    r.itens = (r.itens || []).includes(id) ? r.itens.filter((x) => x !== id) : [...(r.itens || []), id];
    render(); return; }
  if ((t = el("data-stcat"))) {
    if (!S.modal) return;
    colherSemiTipo();
    S.modal.t = S.modal.t || {};
    S.modal.t.categoria = t.dataset.stcat; S.modal.cat = t.dataset.stcat;
    render(); return; }
  if ((t = el("data-stativo"))) {
    if (!S.modal) return;
    colherSemiTipo();
    S.modal.t = S.modal.t || {};
    S.modal.t.ativo = t.dataset.stativo === "1";
    render(); return; }
  /* a LINHA por último: os botões acima vivem dentro dela.
     Vale para os três lugares que apontam para uma remessa — a lista de
     Semiacabados, a tabela dentro de Pedidos e o extrato do estoque. Um registro
     só, e um jeito só de abri-lo. */
  if ((t = el("data-abrirrem"))) {
    S.modal = null;
    S.semiView.aberta = t.dataset.abrirrem;
    S.semiView.modo = "remessas";
    if (S.aba !== "semiacabados" && podeAba("semiacabados")) { S.aba = "semiacabados"; lembrarAba(); }
    render(); return; }

  /* ---------- datas festivas ---------- */
  if ((t = el("data-festfiltro"))) { S.festivasView.filtro = t.dataset.festfiltro; render(); return; }
  if ((t = el("data-abrircamp"))) { S.festivasView.campanha = t.dataset.abrircamp; S.festivasView.busca = ""; render(); return; }
  if ((t = el("data-editarcamp"))) { e.stopPropagation();
    const c = campanhaPorId(t.dataset.editarcamp);
    if (c) { S.modal = { tipo: "campanha", campanha: JSON.parse(JSON.stringify(c)) }; render(); } return; }
  if ((t = el("data-arquivarcamp"))) { e.stopPropagation();
    const c = campanhaPorId(t.dataset.arquivarcamp);
    if (!c) return;
    c.arquivada = !c.arquivada;
    await gravarFestivas(`Campanha ${c.nome} ${c.arquivada ? "arquivada" : "desarquivada"}`);
    toast(c.arquivada ? "Campanha arquivada." : "Campanha de volta.");
    return; }
  if ((t = el("data-excluircamp"))) {
    const c = campanhaPorId(t.dataset.excluircamp);
    if (!c) return;
    if (!confirm(`Excluir a campanha "${c.nome}"? Os produtos e os pedidos não são tocados — some só o planejamento dela.`)) return;
    S.festivas.campanhas = festCampanhas().filter((x) => x.id !== c.id);
    S.modal = null; S.festivasView.campanha = null;
    await gravarFestivas(`Campanha ${c.nome} excluída`);
    toast("Campanha excluída.");
    return; }
  if ((t = el("data-festadd"))) {
    const c = campanhaPorId(S.festivasView.campanha);
    const sku = t.dataset.festadd;
    if (!c || !sku) return;
    if (itensDaCampanha(c).some((i) => i.sku === sku)) return;
    c.itens = [...itensDaCampanha(c), { sku, comportamento: "exclusivo", baseSkus: [], baseManual: null, em: new Date().toISOString() }];
    S.festivasView.busca = "";
    await gravarFestivas(`${sku} entrou na campanha ${c.nome}`);
    return; }
  if ((t = el("data-festtirar"))) {
    const c = campanhaPorId(S.festivasView.campanha);
    const sku = t.dataset.festtirar;
    if (!c) return;
    c.itens = itensDaCampanha(c).filter((i) => i.sku !== sku);
    await gravarFestivas(`${sku} saiu da campanha ${c.nome}`);
    return; }
  /* ---------- relatórios ---------- */
  if ((t = el("data-relper"))) { S.relView.periodo = t.dataset.relper; render(); return; }
  if ((t = el("data-relpainel"))) { S.relView.painel = t.dataset.relpainel; render(); return; }
  if ((t = el("data-relabc2"))) { S.relView.abc = t.dataset.relabc2; render(); return; }
  if ((t = el("data-relir"))) {
    /* o número leva para onde a coisa se resolve, já filtrada — é isto que
       separa um relatório de um enfeite */
    const [aba, alvo] = String(t.dataset.relir).split(":");
    if (aba === "pedidos") {
      S.pedView.etapa = alvo; S.pedView.limite = 50; S.pedView.busca = "";
      S.pedView.prestadora = S.relView.prestadora !== "todas" ? S.relView.prestadora : S.pedView.prestadora;
      S.aba = "pedidos";
    } else if (aba === "demanda") {
      S.demanda.filtro = alvo; S.demanda.limite = 60; S.aba = "demanda";
    } else S.aba = aba;
    lembrarAba(); render(); return; }
  if ((t = el("data-festmodo"))) { S.festivasView.modo = t.dataset.festmodo; S.festivasView.busca = ""; render(); return; }
  if ((t = el("data-festcriar"))) {
    e.stopPropagation();
    const c = campanhaPorId(S.festivasView.campanha);
    if (!c) return;
    /* Enquanto a meta da campanha não existe (bloco 3), o que se propõe é o
       saldo do dia a dia — e quando ele é zero, uma peça, para a janela abrir e
       ela digitar quanto quer mandar. Nunca zero calado. */
    const it = itensDaCampanha(c).find((i) => i.sku === t.dataset.festcriar);
    const x = it ? festLinha(c, it) : null;
    /* `produzir` já vem em PEÇAS. Mandar `falta` (pacotes) para cá era o que
       fazia um pedido de 37 no lugar de 370. Quando não há nada calculado, o
       piso é um PACOTE inteiro — nunca uma peça solta de um pacote de dez. */
    const piso = x ? Math.max(1, x.pac) : 1;
    abrirCriarPedidos([t.dataset.festcriar], () => Math.max(piso, x ? x.produzir : 0), c.id);
    return; }
  if ((t = el("data-festmarcar"))) {
    const sk = t.dataset.festmarcar, v2 = S.festivasView;
    v2.selAdd = (v2.selAdd || []).includes(sk) ? v2.selAdd.filter((x) => x !== sk) : [...(v2.selAdd || []), sk];
    render(); return; }
  if ((t = el("data-festselp"))) {
    const sk = t.dataset.festselp, v2 = S.festivasView;
    v2.selProd = (v2.selProd || []).includes(sk) ? v2.selProd.filter((x) => x !== sk) : [...(v2.selProd || []), sk];
    render(); return; }
  if ((t = el("data-festselall"))) {
    const c = campanhaPorId(S.festivasView.campanha);
    const todos = itensDaCampanha(c).map((i) => i.sku);
    S.festivasView.selProd = (S.festivasView.selProd || []).length === todos.length ? [] : todos;
    render(); return; }
  if ((t = el("data-festf"))) { S.festivasView.filtro2 = t.dataset.festf; S.festivasView.limite = 60; render(); return; }
  if ((t = el("data-festabc"))) { S.festivasView.abcF = t.dataset.festabc; render(); return; }
  if ((t = el("data-festproc"))) { S.festivasView.procF = t.dataset.festproc; render(); return; }
  if ((t = el("data-festord"))) { const k = t.dataset.festord;
    if (S.festivasView.ord === k) S.festivasView.dir = -S.festivasView.dir;
    else { S.festivasView.ord = k; S.festivasView.dir = -1; }
    render(); return; }
  if ((t = el("data-festitem"))) { e.stopPropagation(); S.festivasView.buscaBase = "";
    S.modal = { tipo: "festItem", campanhaId: S.festivasView.campanha, sku: t.dataset.festitem }; render(); return; }
  if ((t = el("data-festimp"))) { const qual = t.dataset.festimp;
    S.festivasView.impIni = $("#fv-ini-" + qual)?.value || null;
    S.festivasView.impFim = $("#fv-fim-" + qual)?.value || null;
    escolherArquivo(".csv,.txt", (fl) => festImportarVendas(fl, qual)); return; }
  if ((t = el("data-festapp"))) { await festPuxarDoApp(t.dataset.festapp); return; }
  if ((t = el("data-festlimpar"))) {
    const c = campanhaPorId(S.modal?.campanhaId);
    if (!c) return;
    c[t.dataset.festlimpar === "base" ? "vendasBase" : "vendasAtual"] = null;
    await gravarFestivas(`Vendas descartadas em ${c.nome}`); return; }
  if ((t = el("data-festbase"))) {   /* caminho antigo: abre a mesma janela nova */
    S.festivasView.buscaBase = "";
    S.modal = { tipo: "festItem", campanhaId: S.festivasView.campanha, sku: t.dataset.festbase };
    render(); return; }
  if ((t = el("data-festbaseadd"))) {
    const c = campanhaPorId(S.modal?.campanhaId);
    const it = itensDaCampanha(c).find((i) => i.sku === S.modal?.sku);
    if (!it) return;
    /* a validação mora no modelo (`festBaseConferir`), não só na tela: esconder
       a opção na busca não impede clique repetido nem `data-` forjado */
    const v = festBaseConferir(c, it, t.dataset.festbaseadd);
    if (!v.ok) { toast(v.erro, "erro"); return; }
    it.baseSkus = [...(it.baseSkus || []), v.sku];
    S.festivasView.buscaBase = "";
    await gravarFestivas(`${v.sku} virou base histórica de ${it.sku}`);
    return; }
  /* v8.98 · "Unir produtos" saiu da busca da base histórica: ali o principal
     era sempre o produto aberto. A união agora nasce de DOIS selecionados em
     Produtos da campanha (`fest-unir-sel`), com a escolha de quem permanece. */
  if ((t = el("data-festbasetirar"))) {
    const c = campanhaPorId(S.modal?.campanhaId);
    const it = itensDaCampanha(c).find((i) => i.sku === S.modal?.sku);
    if (!it) return;
    it.baseSkus = (it.baseSkus || []).filter((x) => x !== t.dataset.festbasetirar);
    await gravarFestivas(null);
    return; }

  if ((t = el("data-seldem"))) { const k = t.dataset.seldem; S.sel.has(k) ? S.sel.delete(k) : S.sel.add(k); render(); return; }
  if ((t = el("data-selop"))) { const k = t.dataset.selop; S.sel.has(k) ? S.sel.delete(k) : S.sel.add(k); render(); return; }

  if ((t = el("data-criar-pedidos"))) { e.stopPropagation(); S.drawer = null; abrirCriarPedidos([t.dataset.criarPedidos]); return; }
  if ((t = el("data-ir-falta"))) { e.stopPropagation();
    const r = pedidoPorId(t.dataset.irFalta);
    const f2 = r ? S.faltas.find((x) => x.pedidoId === r.id && x.status === "aberta")
      || S.faltas.find((x) => x.sku === ((opPorId(r.opId) || {}).sku || r.sku) && x.status === "aberta") : null;
    S.aba = "compras"; lembrarAba();
    if (f2) S.modal = { tipo: "falta", falta: f2, novo: false };
    render();
    if (!f2) toast("Este pedido está marcado como aguardando material, mas não há falta aberta ligada a ele — abra a falta aqui ou destrave o pedido na janela dele.", "erro");
    return; }
  if ((t = el("data-separar"))) { e.stopPropagation(); separarPedido(t.dataset.separar); return; }
  if ((t = el("data-enviar"))) { e.stopPropagation(); enviarPedido(t.dataset.enviar); return; }
  if ((t = el("data-perm-tudo"))) {
    e.stopPropagation();
    const liga = t.dataset.permTudo === "1";
    const p0 = S.modal?.pessoa;
    if (p0) { p0.edit = {}; PERM_IDS.forEach((id) => { p0.edit[id] = liga; }); delete p0.editarEstrutura; render(); }
    return;
  }
  if ((t = el("data-reabrir-conf"))) {
    e.stopPropagation();
    const r = pedidoPorId(t.dataset.reabrirConf);
    if (r) { S.modal = null; await reabrirConferencia(r, "chegou"); }
    return;
  }
  if ((t = el("data-chegou"))) {
    const r = pedidoPorId(t.dataset.chegou);
    if (r) {
      if (r.status === "retornada" || r.consumoBaixado) { await reabrirConferencia(r, "chegou"); }
      else {
        r.status = "chegou"; r.chegouEm = iso(hoje());
        if (padraoResp("conferir")) r.responsavel = padraoResp("conferir");
        await salvarPedidos();
        toastPasso(`Pedido ${r.numero} chegou de ${r.prestadora || "volta"}`, P_LABEL.chegou, "próxima: conferir as quantidades");
      } }
    return;
  }
  if ((t = el("data-conferir"))) { e.stopPropagation(); const r = pedidoPorId(t.dataset.conferir); if (r) { S.modal = { tipo: "conferir", pedido: r, foto: fotoPedido(r) }; render(); } return; }
  if ((t = el("data-editar-criado"))) {
    e.stopPropagation();
    const r2 = pedidoPorId(t.dataset.editarCriado);
    if (!r2) return;
    const voltar = S.modal;   /* guarda a janela dos papéis para voltar depois */
    S.modal = { tipo: "pedido", pedido: r2, foto: fotoPedido(r2), voltarPara: voltar };
    render(); return;
  }
  if ((t = el("data-reimprimir"))) {
    e.stopPropagation();
    S.modal = { tipo: "papeis", qtd: 1, nPapel: 0, ids: [t.dataset.reimprimir], origem: "reimpressao" };
    render(); return;
  }
  if ((t = el("data-ped-abrir"))) { e.stopPropagation();
    const r = pedidoPorId(t.dataset.pedAbrir);
    if (r) { S.drawer = null; S.modal = { tipo: "pedido", pedido: r, foto: fotoPedido(r) }; render(); }
    return; }
  if ((t = el("data-editar-pedido"))) { e.stopPropagation(); const r = pedidoPorId(t.dataset.editarPedido);
    if (r) {
      /* ABA DE REGISTRO (v8.62 · etapa 2): abrir um pedido cria ou foca a aba
         dele. A barra muda, então a barra precisa ser redesenhada — mas a
         LISTA embaixo não: `janelaPintar()` põe a janela por cima e
         `abasRepintarBarra()` troca só a barra. Nenhum dos dois refaz a
         tabela de 600 linhas. */
      const nova = abasAbrirPedido(r.id);
      if (!nova) { S.drawer = null; S.modal = { tipo: "pedido", pedido: r, foto: fotoPedido(r) }; }
      else S.drawer = null;
      if (!janelaPintar() || !abasRepintarBarra()) render();
    } return; }
  if ((t = el("data-falta"))) { e.stopPropagation(); abrirFalta(t.dataset.falta); return; }
  if ((t = el("data-comprar"))) {
    const fx = S.faltas.find((x) => x.id === t.dataset.comprar);
    if (fx) { fx.status = "comprada"; fx.compradaEm = iso(hoje()); await salvarFaltas(); toast(`"${fx.item}" marcado como comprado.`); }
    return;
  }
  if ((t = el("data-receber"))) {
    const fx = S.faltas.find((x) => x.id === t.dataset.receber);
    if (fx) {
      fx.status = "recebida"; fx.recebidaEm = iso(hoje());
      let liberados = 0;
      for (const pid of fx.pedidoIds || []) {
        const r = pedidoPorId(pid);
        if (!r || !r.aguardandoMaterial) continue;
        const outra = S.faltas.some((o) => o.id !== fx.id && o.status !== "recebida" && (o.pedidoIds || []).includes(pid));
        if (!outra) { r.aguardandoMaterial = false; liberados++; }
      }
      await salvarFaltas();
      toast(`"${fx.item}" recebido${liberados ? ` · ${liberados} ${liberados === 1 ? "pedido liberado" : "pedidos liberados"}` : ""}.`);
    }
    return;
  }
  if ((t = el("data-editar-falta"))) { const fx = S.faltas.find((x) => x.id === t.dataset.editarFalta); if (fx) { S.modal = { tipo: "falta", falta: fx, novo: false }; render(); } return; }
  if ((t = el("data-assumir"))) {
    const r = pedidoPorId(t.dataset.assumir);
    if (r && S.tarefas.quem) { r.responsavel = S.tarefas.quem; await salvarPedidos(); toast(`Tarefa assumida por ${S.tarefas.quem}.`); }
    return;
  }
  if ((t = el("data-addlinha"))) {
    const g = S.modal.grupos[+t.dataset.addlinha];
    g.linhas.push({ qtd: 0, prioridade: 3, prestadora: "" });
    render(); return;
  }
  if ((t = el("data-rmlinha"))) {
    const [gi, li] = t.dataset.rmlinha.split(":").map(Number);
    S.modal.grupos[gi].linhas.splice(li, 1);
    render(); return;
  }
  if ((t = el("data-ver-prest"))) { const p = S.calc.prestMap.get(t.dataset.verPrest); if (p) { S.modal = { tipo: "verPrest", prest: p }; render(); } return; }
  if ((t = el("data-editar-prest"))) {
    const p = S.cad.prestadoras.find((x) => x.nome === t.dataset.editarPrest);
    if (p) { S.modal = { tipo: "prestadora", prest: JSON.parse(JSON.stringify(p)), original: p.nome, novo: false }; render(); }
    return;
  }
  if ((t = el("data-editar-setor"))) {
    const st = setores().find((x) => x.id === t.dataset.editarSetor);
    if (st) { S.modal = { tipo: "setor", setor: JSON.parse(JSON.stringify(st)), novo: false }; render(); }
    return;
  }
  if ((t = el("data-editar-pessoa"))) {
    const p = S.equipe.find((x) => x.id === t.dataset.editarPessoa);
    if (p) { S.modal = { tipo: "pessoa", pessoa: JSON.parse(JSON.stringify(p)), novo: false }; render(); }
    return;
  }
  /* Editar um ACESSO. A conta de setor não mora em `S.equipe` — é outra coisa e
     continua sendo. Por isso a busca tem dois lugares, e a janela abre na forma
     de acesso: e-mail e permissões, sem função nem PIN. */
  if ((t = el("data-editar-acesso"))) {
    const id = t.dataset.editarAcesso;
    const a = (typeof acessosDoPcp === "function" ? acessosDoPcp() : []).find((x) => x.id === id);
    if (a) { S.modal = { tipo: "pessoa", pessoa: JSON.parse(JSON.stringify(a)), novo: false, acesso: true }; render(); }
    return;
  }
  /* a ordem desta lista é quem recebe a tarefa primeiro quando duas cuidam
     da mesma etapa — por isso ela precisa ser mexível aqui, na tela */
  if ((t = el("data-subir-pessoa")) || (t = el("data-descer-pessoa"))) {
    const sobe = !!t.dataset.subirPessoa;
    const id = t.dataset.subirPessoa || t.dataset.descerPessoa;
    const i = S.equipe.findIndex((x) => x.id === id);
    const j = sobe ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= S.equipe.length) return;
    [S.equipe[i], S.equipe[j]] = [S.equipe[j], S.equipe[i]];
    /* a POSIÇÃO é dado: ela decide quem recebe a tarefa primeiro. Com a escrita
       ligada, virar `ordem` no servidor — senão a troca sumiria no próximo F5,
       porque a leitura vem ordenada da tabela. */
    if (typeof eqEscreveNaTabela === "function" && eqEscreveNaTabela()) {
      const rOrd = await eqSalvarOrdem();
      if (rOrd && rOrd.status === "com-problema") {
        console.error("ordem da equipe:", rOrd.problemas);
        toast("A ordem mudou na tela, mas o servidor recusou parte dela — recarregue.", "erro");
      }
    }
    await salvarTudo("equipe");
    render();
    return;
  }
  if ((t = el("data-tam-rm"))) {
    /* nunca apaga no clique: abre a conversa que diz quantos produtos usam */
    S.modal = { tipo: "removerEmb", qual: "tamanho", valor: t.dataset.tamRm };
    render(); return;
  }
  if ((t = el("data-forn-rm"))) {
    const id = t.dataset.fornRm;
    const f2 = (S.cad.fornecedores || []).find((x) => x.id === id);
    S.cad.fornecedores = (S.cad.fornecedores || []).filter((x) => x.id !== id);
    await salvarTudo("cad");
    render();
    toast(`Fornecedor ${f2?.nome || ""} removido (produtos que o usam ficam sem fornecedor definido).`);
    return;
  }
  if ((t = el("data-qtd-rm"))) {
    S.modal = { tipo: "removerEmb", qual: "qtd", valor: Number(t.dataset.qtdRm) };
    render(); return;
  }
  /* abre e fecha a caixinha de cadastrar sem sair de onde se está
     -------------------------------------------------------------------------
     v8.84 · A caixinha "+ tamanho" / "+ qtd" é desenho de DENTRO da janela —
     `camposEmbalagem` só é usada por janelas (produto, pedido, criar pedidos).
     Refazer o `#app` inteiro por causa dela era o redesenho mais caro e mais
     desnecessário da janela do pedido: medido, 1 `render()` global por clique,
     e o nó do véu trocava junto. `janelaPintar()` troca só a janela e já repõe
     o que estava preenchido (`reporMexidosNovoPedido`); o `render()` fica como
     saída para o caso de não haver janela nenhuma de pé. */
  if ((t = el("data-embabrir"))) {
    const qual = t.dataset.embabrir, chave = t.dataset.embchave;
    S.embNovo = { [chave]: qual };
    if (!janelaPintar()) render();
    /* quem clica em "+ tamanho" quer escrever o tamanho: o cursor vai para lá */
    try { document.querySelector(`[data-embnovo="${qual}"]`)?.focus(); } catch {}
    return;
  }
  if ((t = el("data-embfechar"))) { S.embNovo = null; if (!janelaPintar()) render(); return; }
  if ((t = el("data-sku-mesmo"))) {
    const i = Number(t.dataset.skuMesmo);
    const x = (S.cad.pendentesSku || [])[i];
    if (x) {
      const p = trocarSkuDoProduto(x.produtoId, x.skuNovo, x.descricaoNova);
      S.cad.pendentesSku.splice(i, 1);
      await salvarTudo("produtos", "cad");
      render();
      toast(p ? `SKU atualizado: ${x.skuAntigo} → ${x.skuNovo}. Confira a configuração de produção (há um aviso no cadastro do produto).` : "Produto não encontrado.", p ? undefined : "erro");
    }
    return;
  }
  if ((t = el("data-sku-prod-novo"))) {
    const i = Number(t.dataset.skuProdNovo);
    const x = (S.cad.pendentesSku || [])[i];
    if (x) {
      S.produtos.push({ id: proximoIdProduto(), sku: x.skuNovo, skuAtual: x.skuNovo, skusAnteriores: [],
        descricao: x.descricaoNova || null, qtdPacote: 1, processo: null, producao: {},
        magazord: { descricao: x.descricaoNova || null, atualizadoEm: iso(hoje()) }, criadoEm: iso(hoje()), origem: "magazord" });
      S.cad.pendentesSku.splice(i, 1);
      await salvarTudo("produtos", "cad");
      render();
      toast(`Produto novo criado com o SKU ${x.skuNovo} — configuração de produção pendente.`);
    }
    return;
  }
  if ((t = el("data-editar-produto"))) {
    e.stopPropagation();
    const p = S.produtos.find((x) => x.sku === t.dataset.editarProduto);
    if (p) { S.modal = { tipo: "produto", produto: JSON.parse(JSON.stringify(p)), novo: false }; render(); }
    return;
  }
  /* ---------- o cartão abre o produto; os controles dentro dele, não ----------
     A caixinha de selecionar vive DENTRO do cartão, e o cartão inteiro é um
     `data-produto`. Como `el()` usa closest, clicar na caixinha caía aqui
     primeiro: abria a janela do produto e redesenhava a tela — o `change` da
     caixinha nem chegava a acontecer, porque o elemento já tinha sido destruído.
     Parecia caixinha quebrada; era o cartão engolindo o clique dela.
     A linha de baixo (`data-sku`) já se protegia assim desde sempre. */
  if ((t = el("data-produto")) && !e.target.closest("button,select,input,label,a")) {
    const p = S.produtos.find((x) => x.sku === t.dataset.produto);
    if (p) { S.modal = { tipo: "produto", produto: JSON.parse(JSON.stringify(p)), novo: false }; render(); }
    return;
  }
  if ((t = el("data-sku")) && !e.target.closest("button,select,input,a")) { S.drawer = t.dataset.sku; S.modal = null; render(); return; }
  /* ---------- insumos ---------- */
  if ((t = el("data-finsumo"))) { e.stopPropagation(); S.insumosView.filtro = t.dataset.finsumo; S.aba = "insumos"; render(); return; }
  if ((t = el("data-ins-extrato"))) { e.stopPropagation(); S.modal = { tipo: "extratoInsumo", id: t.dataset.insExtrato }; render(); return; }
  if ((t = el("data-ins-editar"))) { e.stopPropagation();
    const i = insumoPorId(t.dataset.insEditar);
    if (i) { S.modal = { tipo: "insumo", novo: false, i: JSON.parse(JSON.stringify(i)) }; render(); } return; }
  if ((t = el("data-insumo")) && !e.target.closest("button,select,input,a")) {
    const i = insumoPorId(t.dataset.insumo);
    if (i) { S.modal = { tipo: "extratoInsumo", id: i.id }; render(); } return; }
  if ((t = el("data-ins-falta"))) { e.stopPropagation();
    const i = insumoPorId(t.dataset.insFalta); if (!i) return;
    const sit = situacaoInsumo(i);
    const f2 = fornecedorPorId(i.fornecedorId);
    S.modal = { tipo: "falta", novo: true, falta: { id: uid(), status: "aberta", anotadaEm: iso(hoje()),
      item: `${i.nome}${i.unidade ? ` (${i.unidade})` : ""}`, qtd: sit.faltam || null,
      fornecedor: f2?.nome || "", insumoId: i.id,
      obs: `Abaixo do mínimo: ${nDec(saldoInsumo(i.id))} de ${nDec(i.minimo)} ${i.unidade || "un"}` } };
    render(); return; }
  if ((t = el("data-ins-fmov"))) { e.stopPropagation(); if (S.modal) S.modal.filtro = t.dataset.insFmov; render(); return; }
  if ((t = el("data-ins-ajustar"))) { e.stopPropagation(); S.modal = { tipo: "ajusteInsumo", id: t.dataset.insAjustar }; render(); return; }
  if ((t = el("data-ins-descod"))) { e.stopPropagation();
    const ix = Number(t.dataset.insDescod);
    if (S.modal?.i?.codigosFornecedor) { S.modal.i.codigosFornecedor.splice(ix, 1); render(); } return; }
  if ((t = el("data-ins-excluir"))) { e.stopPropagation();
    const id = t.dataset.insExcluir;
    const nm = movsDoInsumo(id).length;
    if (nm) return toast(`Este insumo tem ${n0(nm)} ${nm === 1 ? "movimento" : "movimentos"} no extrato — apagá-lo apagaria o histórico junto. Se ele saiu de linha, deixe-o inativo.`, "erro");
    S.insumos = insumos().filter((x) => x.id !== id);
    esquecerSaldos();
    S.modal = null; await salvarInsumos(); toast("Insumo excluído."); return; }
  if ((t = el("data-nfi-rm"))) { e.stopPropagation(); colherNF();
    S.modal.nf.itens.splice(Number(t.dataset.nfiRm), 1); render(); return; }


  if ((t = el("data-fechar"))) {
    /* fecha SÓ no botão Fechar/Cancelar ou no clique direto no fundo escuro.
       Clique dentro do modal (campos, selects, texto) NÃO fecha — era o bug
       que derrubava o popup na hora de digitar — e segue adiante, para os
       botões Salvar/Aplicar (data-act) continuarem funcionando. */
    if ((t.tagName === "BUTTON") || e.target === t) {
      /* se esta janela foi aberta de dentro de outra, volta para a de origem
         em vez de fechar tudo — é o caso do Editar na tela dos papéis */
      const volta = S.modal?.voltarPara || null;
      /* a caixinha de "+ novo" é estado da janela que está fechando */
      const eraPedido = S.modal?.tipo === "pedido" && !volta && !S.drawer;
      S.embNovo = null;
      /* Fechar a janela de um pedido é fechar a ABA dele — senão a aba ficaria
         na barra apontando para uma janela que já não está de pé. */
      const regAtiva = typeof abaDeRegistroAtiva === "function" ? abaDeRegistroAtiva() : null;
      if (eraPedido && regAtiva && S.modal?.pedido?.id === regAtiva.alvo) {
        if (!abasFecharPintando(regAtiva.id)) render();
        return;
      }
      S.modal = volta; S.drawer = null;
      /* FECHAR a janela de um pedido também não precisa refazer a lista: ela
         está exatamente como estava antes de a janela subir. */
      if (eraPedido && janelaPintar()) return;
      render(); return; }
  }

  if ((t = el("data-act"))) {
    const act = t.dataset.act;
    /* Ação que confirma algo demorado (apagar, importar, fechar mês) fica clicável
       enquanto grava. Um segundo clique rodava tudo de novo e encontrava a janela
       já fechada — era o "Cannot destructure property 'alvo'". */
    const CONFIRMA = /^(confirmar-|aplicar-|salvar-|recado-feito|conflito-|enviar-mesmo-assim)/.test(act);
    let meuSolta = null;
    if (CONFIRMA) {
      if (t.dataset.ocupado === "1") return;
      /* -----------------------------------------------------------------
         A TRAVA QUE SOBREVIVE AO RENDER (v8.79)
         -----------------------------------------------------------------
         `data-ocupado` mora no NÓ do botão. Um `render()` no meio da ação —
         a sincronia de 15s, o Realtime, uma gravação — troca o nó por um
         novo, destrancado, e o segundo clique roda a ação inteira de novo.
         Foi assim que "Aplicar análise" saiu duas vezes, a segunda zerada.
         Esta trava é por AÇÃO e mora no estado do app, não no DOM.
         ----------------------------------------------------------------- */
      if (ACOES_RODANDO.has(act)) return;
      ACOES_RODANDO.add(act);
      t.dataset.ocupado = "1";
      t.disabled = true;
      const rot = t.textContent;
      t.textContent = "Aguarde…";
      /* NÃO destrava no meio: apagar a base leva mais de 8s, e o botão voltando ao
         normal no meio fazia parecer que nada aconteceu. Quem destrava é o fim da
         ação — e o passo() abaixo mostra o andamento enquanto isso. */
      S._passo = (txt) => { try { t.textContent = txt; } catch {} };
      meuSolta = () => { try { t.disabled = false; t.dataset.ocupado = "0"; t.textContent = rot; S._passo = null; S._solta = null; } catch {} };
      S._solta = meuSolta;
    }
    /* as 103 ações estão em quatro funções por assunto; a tabela ROTA_ACAO diz
       qual grupo trata cada uma, então o despacho é direto e não depende do
       valor devolvido — várias ações fazem return no meio do próprio bloco. */
    const grupo = ROTA_ACAO.get(act);
    /* -------------------------------------------------------------------
       A REDE DE SEGURANÇA (v8.75) · o botão volta ao normal SEMPRE
       -------------------------------------------------------------------
       O desenho antigo dependia de cada handler lembrar de chamar `S._solta`
       em cada uma das suas saídas. `confirmarPedidos` não lembrava em
       nenhuma: a saída "Nada a criar — informe as quantidades" deixava o
       botão em "Aguarde…" para sempre, com a janela aberta. São 103 ações e
       centenas de `return` — lembrar não é uma estratégia.

       Agora quem solta é o próprio despacho, no `finally`: retorno normal,
       retorno precoce, erro ou exceção, tanto faz. Quando o despacho termina,
       a ação terminou — o `await` acima já esperou tudo que ela esperou.

       A COMPARAÇÃO DE IDENTIDADE é o que mantém isto seguro: só solta se
       `S._solta` ainda for ESTA função. Se o handler já soltou (virou null)
       ou trocou por outra coisa, a rede não encosta.
       ------------------------------------------------------------------- */
    const modalAntes = S.modal ? S.modal.tipo : null;
    const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
    let estouro = null;
    try {
      if (grupo) await grupo(act, t, e);
    } catch (err) {
      estouro = String((err && err.message) || err).slice(0, 200);
      throw err;                      /* quem avisa a pessoa é o catch de fora */
    } finally {
      if (CONFIRMA) {
        ACOES_RODANDO.delete(act);
        try {
          ACOES_LOG.push({ act, quando: new Date().toISOString(),
            ms: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0),
            modalAntes, modalDepois: S.modal ? S.modal.tipo : null,
            mesmaJanela: !!(modalAntes && S.modal && S.modal.tipo === modalAntes),
            estouro });
          if (ACOES_LOG.length > 200) ACOES_LOG.splice(0, ACOES_LOG.length - 200);
        } catch (e2) {}
      }
      if (meuSolta && S._solta === meuSolta) meuSolta();
    }
    return;
  }
}

