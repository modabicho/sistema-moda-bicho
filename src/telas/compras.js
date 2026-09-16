/* ---------- Compras ---------- */
function viewCompras() {
  const v = S.comprasView;
  let r = S.faltas.slice();
  /* "minimo" filtra a lista de cima (insumos); a de baixo mostra as faltas abertas */
  if (v.filtro === "minimo") r = r.filter((f) => f.status === "aberta");
  else if (v.filtro !== "todas") r = r.filter((f) => f.status === v.filtro);
  const b = v.busca.trim().toLowerCase();
  if (b) r = r.filter((f) => [f.item, f.fornecedor, f.sku].some((x) => String(x || "").toLowerCase().includes(b)));
  r.sort((a, y) => String(y.anotadaEm || "").localeCompare(String(a.anotadaEm || "")));

  const grupos = new Map();
  for (const f of r) {
    const k = f.fornecedor || "Sem fornecedor definido";
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(f);
  }
  const nAberta = S.faltas.filter((f) => f.status === "aberta").length;
  const nComprada = S.faltas.filter((f) => f.status === "comprada").length;
  const F_LABEL = { aberta: "Em falta", comprada: "Comprado", recebida: "Recebido" };

  const pedidosDaFalta = (f) => (f.pedidoIds || []).map((id) => pedidoPorId(id)).filter(Boolean);

  return `
  ${(() => {
    const nRecebida = S.faltas.filter((f) => f.status === "recebida").length;
    const nForn = new Set(S.faltas.filter((f) => f.status !== "recebida").map((f) => f.fornecedor || "?")).size;
    const travados = S.pedidos.filter((p) => p.aguardandoMaterial && PED_VIVO.includes(p.status)).length;
    const f = (id) => ({ attr: "data-fcompra", valor: id, ativo: v.filtro === id });
    const abaixo = insumosAbaixo().length;
    return `<div class="kpis">
    ${kpi("Em falta", nAberta, nForn ? `de ${n0(nForn)} ${nForn === 1 ? "fornecedor" : "fornecedores"}` : "a produção anotou", nAberta ? "red" : "", f("aberta"))}
    ${kpi("Abaixo do mínimo", abaixo, "o estoque de insumos apontou", abaixo ? "red" : "", f("minimo"))}
    ${kpi("Comprados", nComprada, "aguardando chegada", nComprada ? "amber" : "", f("comprada"))}
    ${kpi("Recebidos", nRecebida, "material já chegou", "teal", f("recebida"))}
    ${kpi("Tudo", S.faltas.length + abaixo, "as duas listas juntas", "", f("todas"))}
    <div class="kpi-info">${kpi("Pedidos travados", travados, "esperando material para andar")}</div>
  </div>`; })()}
  ${(() => { /* ---------- o que o estoque de insumos aponta ----------
       Duas listas dizendo o que comprar dariam duas verdades. Aqui elas ficam
       na mesma tela: em cima o que o próprio estoque calculou pelo mínimo,
       embaixo o que a produção anotou como falta na hora de trabalhar. */
    if (v.filtro === "comprada" || v.filtro === "recebida") return "";
    const abaixo = insumosAbaixo();
    if (!abaixo.length) return "";
    const porForn = new Map();
    for (const x of abaixo) {
      const f2 = fornecedorPorId(x.i.fornecedorId);
      const k = f2?.nome || "Sem fornecedor definido";
      if (!porForn.has(k)) porForn.set(k, []);
      porForn.get(k).push(x);
    }
    return `<div class="card" style="margin-bottom:14px;border-color:var(--perigo-borda)">
      <div class="card-h"><h2>Abaixo do mínimo</h2><span class="sub">o estoque de insumos calculou — ninguém precisou anotar</span>
        <button class="btn sm" style="margin-left:auto" data-ir="insumos">Abrir Insumos</button></div>
      ${[...porForn.entries()].map(([forn, itens]) => `
        <div class="sub-h"><b>${esc(forn)}</b><span>${itens.length} ${itens.length === 1 ? "insumo" : "insumos"}</span></div>
        <div class="tw" style="max-height:none"><table class="t">
          <thead><tr><th>Insumo</th><th>Código</th><th class="num">Em estoque</th><th class="num">Mínimo</th><th class="num">Comprar</th><th class="num">Última compra</th><th>Ação</th></tr></thead>
          <tbody>${itens.map(({ i, sit }) => { const c = custoInsumo(i.id);
            return `<tr class="clickable" data-ins-extrato="${esc(i.id)}">
            <td><b>${esc(i.nome)}</b>${i.local ? `<div class="hint" style="margin:2px 0 0">${esc(i.local)}</div>` : ""}</td>
            <td class="sku">${esc(i.codigo || "—")}</td>
            <td class="num"><b style="color:${sit.tom === "erro" ? "var(--red)" : "inherit"}">${nDec(saldoInsumo(i.id))}</b> <span style="font-size:10.5px;color:var(--ink-4)">${esc(i.unidade || "un")}</span></td>
            <td class="num" style="color:var(--ink-3)">${nDec(i.minimo)}</td>
            <td class="num"><b style="color:var(--red)">${nDec(sit.faltam)}</b></td>
            <td class="num" style="font-size:11.5px">${c ? `${fmoeda(c.ultimo)}<div class="hint" style="margin:2px 0 0">${freal(sit.faltam * c.ultimo)} a comprar</div>` : '<span style="color:var(--ink-4)">—</span>'}</td>
            <td style="white-space:nowrap"><button class="btn sm ghost" data-ins-falta="${esc(i.id)}" title="Passa este insumo para a lista de faltas, com quantidade e fornecedor já preenchidos">Anotar falta</button></td>
          </tr>`; }).join("")}</tbody></table></div>`).join("")}
      <details class="legenda"><summary>Como ler esta tabela</summary><div class="legenda-in">
        <span>Estes não foram anotados por ninguém: o app comparou o saldo com o mínimo de cada insumo e calculou quanto falta. O saldo vem da soma dos movimentos — entradas de nota, consumo, ajustes.</span>
        <span><b>Anotar falta</b> passa o item para a lista de baixo, que é a que a produção acompanha. Ao registrar a entrada da nota, o estoque sobe e o insumo sai daqui sozinho.</span>
      </div></details>
    </div>`; })()}
  <div class="card">
    <div class="filters">
      <div class="search">${svg(IC.busca)}<input class="inp" id="q-compras" style="width:240px" placeholder="Buscar item, fornecedor ou SKU" value="${esc(v.busca)}"></div>
      <button class="btn primary sm" style="margin-left:auto" data-act="nova-falta">${svg(IC.mais)}Anotar falta</button>
      <button class="btn sm" data-act="exp-compras">Exportar .xlsx</button>
    </div>
    ${[...grupos.entries()].map(([forn, itens]) => `
      <div class="card-h" style="background:var(--paper-2)"><h3>${esc(forn)}</h3>
        <span class="sub">${itens.length} ${itens.length === 1 ? "item" : "itens"}</span></div>
      <div class="tw" style="max-height:none"><table class="t"><thead><tr>
        ${thOrd("compras", "item", "Item / material")}${thOrd("compras", "sku", "SKU vinculado")}${thOrd("compras", "qtd", "Qtd", "num")}
        ${thOrd("compras", "anotado", "Anotado")}${thOrd("compras", "travados", "Pedidos travados")}${thOrd("compras", "status", "Situação")}<th>Ação</th></tr></thead>
      <tbody>${ordenarPor("compras", itens, (f, campo) =>
        campo === "item" ? f.item : campo === "sku" ? f.sku : campo === "qtd" ? (Number(f.qtd) || 0)
        : campo === "anotado" ? f.anotadaEm : campo === "travados" ? (f.pedidoIds || []).length
        : campo === "status" ? f.status : null).map((f) => `<tr>
        <td><b>${esc(f.item)}</b>${f.obs ? `<div style="font-size:11px;color:var(--ink-3)">${esc(f.obs)}</div>` : ""}</td>
        <td>${f.sku ? `<span class="sku clickable" data-sku="${esc(f.sku)}">${esc(f.sku)}</span>` : "—"}</td>
        <td class="num">${f.qtd ? n0(f.qtd) + (f.unidade ? " " + esc(f.unidade) : "") : "—"}</td>
        <td class="mono" style="font-size:11.5px">${fdate(f.anotadaEm)}</td>
        <td>${pedidosDaFalta(f).map((p) => `<span class="sku" style="font-size:10.5px">${esc(p.numero)}</span>`).join(" ") || "—"}</td>
        <td><span class="tag ${f.status === "aberta" ? "red" : f.status === "comprada" ? "amber" : "teal"}">${F_LABEL[f.status]}</span></td>
        <td style="white-space:nowrap">
          ${f.status === "aberta" ? `<button class="btn sm" data-comprar="${esc(f.id)}">Marcar comprado</button>` : ""}
          ${f.status === "comprada" ? `<button class="btn sm primary" data-receber="${esc(f.id)}">Chegou</button>` : ""}
          <button class="btn sm ghost" data-editar-falta="${esc(f.id)}">Editar</button></td></tr>`).join("")}
      </tbody></table></div>`).join("")
      || `<div class="card">${vazio("pronto", "Nada pendente aqui",
        "Nenhum material em falta. Quando a produção anotar um, ele aparece aqui separado por fornecedor.")}</div>`}
    <details class="legenda"><summary>Como ler esta tabela</summary><div class="legenda-in"><span>Marcar <b>Chegou</b> libera automaticamente os pedidos travados por aquele item.</span></div></details>
  </div>`;
}


/* ==========================================================================
   AS LISTAS DE EMBALAGEM — UMA REGRA SÓ
   ==========================================================================
   Tamanho de embalagem era texto livre comparado com `includes`. Resultado:
   `9x9`, `9X9`, `9 x 9` e `09x09` eram QUATRO cadastros diferentes da mesma
   coisa, e a lista aparecia em ordem alfabética — `10x10` antes de `6x7`,
   porque texto se compara letra a letra.

   A regra passa a ser uma só, e vale para toda lista cadastrável:

     1. normaliza antes de gravar        `9 X 09` -> `9x9`
     2. não aceita duplicado normalizado maiúscula e espaço não criam registro novo
     3. ordena sozinha                   número, nunca alfabética
     4. recusa valor inválido            tamanho é AxB; quantidade é inteiro > 0
     5. exclusão diz o impacto           quantos produtos usam aquilo
     6. uma fonte da verdade             todo seletor lê da mesma função

   E não basta impedir daqui para frente: a migração no boot conserta o que já
   está gravado — na lista E dentro de cada produto. Corrigir só a exibição
   deixaria o dado torto embaixo do pano. */

/* "9X9", "09 x 09", "9,5 x 9" -> "9x9", "9.5x9". Devolve null se não for AxB. */
function normalizarTamanho(v) {
  const m = String(v == null ? "" : v)
    .trim().toLowerCase()
    .replace(/[×✕✖]/g, "x")     /* o × de verdade que o teclado do Mac produz */
    .replace(/\s+/g, "")
    .replace(/^(\d)/, "$1")
    .match(/^(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const a = Number(m[1].replace(",", "."));
  const b = Number(m[2].replace(",", "."));
  if (!isFinite(a) || !isFinite(b) || a <= 0 || b <= 0) return null;
  return `${a}x${b}`;
}
/* primeira medida crescente; empatou, a segunda. Nunca alfabética. */
function compararTamanhos(a, b) {
  const na = normalizarTamanho(a), nb = normalizarTamanho(b);
  if (!na && !nb) return String(a).localeCompare(String(b));
  if (!na) return 1;   /* o que não obedece à regra vai para o fim, à vista */
  if (!nb) return -1;
  const [a1, a2] = na.split("x").map(Number);
  const [b1, b2] = nb.split("x").map(Number);
  return a1 - b1 || a2 - b2;
}
/* A FONTE ÚNICA: todo seletor de tamanho do app lê daqui. Duas telas mostrando
   a mesma lista em ordens diferentes é o começo de todo cadastro torto. */
function tamanhosEmbalagemOrdenados() {
  return [...new Set((S.cad?.tamanhosEmbalagem || []).map(normalizarTamanho).filter(Boolean))]
    .sort(compararTamanhos);
}
const normalizarQtdEmb = (v) => { const n = Math.round(Number(String(v == null ? "" : v).replace(",", ".")));
  return Number.isFinite(n) && n > 0 ? n : null; };
function qtdsEmbalagemOrdenadas() {
  return [...new Set((S.cad?.qtdsEmbalagem || []).map(normalizarQtdEmb).filter(Boolean))]
    .sort((a, b) => a - b);
}

/* quantos produtos usam aquilo — é o que a exclusão precisa dizer antes de agir */
const usoDoTamanhoEmb = (t) => { const alvo = normalizarTamanho(t); if (!alvo) return 0;
  return S.produtos.filter((p) => normalizarTamanho(p.producao?.embalagemTamanho) === alvo).length; };
const usoDaQtdEmb = (q) => { const alvo = normalizarQtdEmb(q); if (!alvo) return 0;
  return S.produtos.filter((p) => normalizarQtdEmb(p.producao?.qtdPorEmbalagem) === alvo).length; };

