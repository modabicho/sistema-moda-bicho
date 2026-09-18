/* ===========================================================================
   AMOSTRA · Procedimentos (padrão geral + personalização por produto)
   ---------------------------------------------------------------------------
   Prova de conceito para validar TELA e MODELO. Dados fictícios, só na memória
   desta aba: recarregar a página volta aos exemplos. Não fala com o servidor,
   não lê nem escreve produto, estoque, pedido, OP, demanda, remessa ou consumo.

   O MODELO
     Procedimento padrão ── itens com id estável, em 8 seções
          │  vinculado a vários SKUs (só referência, para achar a instrução)
          ▼
     Personalização de UM SKU = só as diferenças, item a item:
       alt  { idDoItem: { v: valor do produto, base: o que o padrão dizia } }
       omit [ idDoItem ]                  → "não se aplica a este produto"
       add  [ { id, …, depois } ]         → item só deste produto
     O que não está em alt/omit HERDA do padrão: mudar o padrão reflete ali.
     O que está em alt fica com o valor do produto; se o padrão mudar depois,
     a tela avisa ("o padrão agora diz …") em vez de sobrescrever.
   =========================================================================== */

IC.procedimentos = '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 11h7M9 15h7M9 19h4"/>';

const skuNormal = (x) => String(x == null ? "" : x).trim().toUpperCase(); /* a mesma regra de produtos/identidade.js */
let _seq = 0;
const novoId = (p) => `${p}${Date.now().toString(36)}${(++_seq).toString(36)}`;
const copia = (x) => JSON.parse(JSON.stringify(x));
const fdata = (iso) => { const d = new Date(iso); return isNaN(d) ? "—" : d.toLocaleDateString("pt-BR"); };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/* ---------- as oito seções que o padrão tem e o produto pode personalizar ---------- */
const SECOES = [
  { k: "passos",      nome: "Passo a passo",             forma: "lista", numerada: true, un: "passo" },
  { k: "medidas",     nome: "Medidas",                   forma: "par", rotulos: ["O quê", "Medida"], un: "medida" },
  { k: "tamanhos",    nome: "Tamanhos",                  forma: "par", rotulos: ["O quê", "Tamanho"], un: "tamanho" },
  { k: "quantidades", nome: "Quantidades de referência", forma: "par", rotulos: ["O quê", "Quantidade"], un: "quantidade",
    nota: "Instrução de trabalho. Não movimenta estoque." },
  { k: "materiais",   nome: "Materiais de referência",   forma: "par", rotulos: ["Material", "Referência"], un: "material",
    nota: "Referência. Não gera consumo nem baixa." },
  { k: "observacoes", nome: "Observações",               forma: "lista", un: "observação" },
  { k: "cuidados",    nome: "Cuidados",                  forma: "lista", tom: "amber", un: "cuidado" },
  { k: "erros",       nome: "Erros comuns",              forma: "lista", tom: "red", un: "erro" },
];
const SEC = Object.fromEntries(SECOES.map((s) => [s.k, s]));
const valorDe = (sec, it) => (sec.forma === "par" ? it.valor : it.texto) || "";
const rotuloDe = (sec, it) => (sec.forma === "par" ? it.item : "") || "";
const TIPOS = ["Embalagem", "Corte", "Costura", "Acabamento", "Conferência", "Estampa"];
const SETORES = ["Corte", "Costura", "Acabamento", "Expedição"];

/* ---------- dados fictícios ---------- */
const PRODUTOS = [
  { sku: "1234", descricao: "Coleira Nylon Estampada P · kit 2 unidades", categoria: "Coleiras" },
  { sku: "1235", descricao: "Coleira Couro Sintético M", categoria: "Coleiras" },
  { sku: "1236", descricao: "Coleira Nylon Lisa G", categoria: "Coleiras" },
  { sku: "2201", descricao: "Bandana Tricoline P", categoria: "Bandanas" },
  { sku: "2202", descricao: "Bandana Tricoline M", categoria: "Bandanas" },
  { sku: "3301", descricao: "Peitoral Ajustável M", categoria: "Peitorais" },
];
const produtoDe = (sku) => PRODUTOS.find((p) => p.sku === skuNormal(sku)) || null;

const L = (id, texto) => ({ id, texto });
const P = (id, item, valor) => ({ id, item, valor });
const E = {
  aba: "procedimentos", busca: "", tipo: "todos", setor: "todos", buscaProd: "",
  pilha: [],          /* janelas abertas, a de cima é a última */
  foco: null,         /* seletor a focar depois do próximo desenho */
  procs: [
    { id: "pr-emb", nome: "Embalagem de coleira", tipo: "Embalagem", setor: "Expedição",
      descricao: "Como embalar uma coleira pronta para a loja e para o envio.",
      passos: [L("p1", "Conferir o produto: costura, fivela e argola."), L("p2", "Colocar na cartela do tamanho indicado em Tamanhos."),
        L("p3", "Aplicar a etiqueta no verso da cartela."), L("p4", "Colocar no saquinho e lacrar.")],
      medidas: [P("m1", "Saquinho", "12 × 20 cm")],
      tamanhos: [P("t1", "Cartela", "P")],
      quantidades: [P("q1", "Unidades por embalagem", "1 unidade")],
      materiais: [P("mt1", "Cartela kraft", "do tamanho indicado"), P("mt2", "Saquinho adesivado", "12 × 20 cm"), P("mt3", "Etiqueta", "branca, 3 × 2 cm")],
      observacoes: [L("o1", "Embalar só depois da conferência de qualidade.")],
      cuidados: [L("c1", "Fechar a fivela antes de encaixar na cartela."), L("c2", "Não dobrar a cartela.")],
      erros: [L("e1", "Etiqueta cobrindo o logo da marca."), L("e2", "Lacrar o saquinho com ar dentro.")],
      skus: ["1234", "1235", "1236"], atualizadoEm: "2026-09-10T10:00:00", por: "Ana" },
    { id: "pr-corte", nome: "Corte de bandana em tricoline", tipo: "Corte", setor: "Corte",
      descricao: "Enfesto e corte de bandana a partir do molde acrílico.",
      passos: [L("p1", "Passar o tecido antes de enfestar."), L("p2", "Enfestar respeitando o limite de folhas."),
        L("p3", "Posicionar o molde no fio do tecido."), L("p4", "Cortar com a faca elétrica."), L("p5", "Separar em pacotes.")],
      medidas: [P("m1", "Bandana pronta", "35 × 35 cm")],
      tamanhos: [P("t1", "Molde", "P")],
      quantidades: [P("q1", "Folhas por enfesto", "até 12"), P("q2", "Peças por pacote", "10")],
      materiais: [P("mt1", "Tricoline 100% algodão", "largura 1,50 m"), P("mt2", "Molde acrílico", "tamanho P")],
      observacoes: [],
      cuidados: [L("c1", "Conferir o fio do tecido antes de cortar.")],
      erros: [L("e1", "Enfesto torto: a peça sai fora de esquadro.")],
      skus: ["2201", "2202"], atualizadoEm: "2026-09-02T15:30:00", por: "Rosa" },
    { id: "pr-conf", nome: "Conferência de coleira antes de embalar", tipo: "Conferência", setor: "Expedição",
      descricao: "O que olhar em cada coleira antes de ela ir para a embalagem.",
      passos: [L("p1", "Puxar a costura das duas pontas."), L("p2", "Abrir e fechar a fivela três vezes."),
        L("p3", "Conferir se a argola está firme."), L("p4", "Separar peça com defeito na caixa vermelha.")],
      medidas: [], tamanhos: [],
      quantidades: [P("q1", "Amostragem", "todas as peças")],
      materiais: [P("mt1", "Caixa vermelha", "para peças com defeito")],
      observacoes: [], cuidados: [L("c1", "Não conferir e embalar na mesma bancada.")],
      erros: [L("e1", "Deixar passar fivela que não trava.")],
      skus: ["1235", "1236"], atualizadoEm: "2026-08-28T09:10:00", por: "Ana" },
  ],
  /* personalizações: chave "idDoProcedimento|SKU". Só as diferenças. */
  pers: {
    "pr-emb|1235": { observacoes: { add: [{ id: "a1", texto: "Dobrar a alça antes de embalar.", depois: null }] } },
    "pr-emb|1234": {
      passos: { add: [{ id: "a2", texto: "Colocar as duas coleiras lado a lado, fivelas para o mesmo lado.", depois: "p1" }] },
      medidas: { alt: { m1: { v: "15 × 25 cm", base: "12 × 20 cm" } } },
      tamanhos: { alt: { t1: { v: "M", base: "P" } } },
      quantidades: { alt: { q1: { v: "2 unidades (kit)", base: "1 unidade" } } },
      materiais: { alt: { mt2: { v: "15 × 25 cm", base: "12 × 20 cm" }, mt3: { v: "vermelha, 3 × 2 cm", base: "branca, 3 × 2 cm" } } },
      observacoes: { add: [{ id: "a3", texto: "Usar etiqueta vermelha: é kit promocional.", depois: null }] },
    },
    "pr-corte|2202": {
      medidas: { alt: { m1: { v: "45 × 45 cm", base: "35 × 35 cm" } } },
      tamanhos: { alt: { t1: { v: "M", base: "P" } } },
      materiais: { alt: { mt2: { v: "tamanho M", base: "tamanho P" } } },
    },
  },
};
const procPorId = (id) => E.procs.find((p) => p.id === id) || null;
const chave = (procId, sku) => `${procId}|${skuNormal(sku)}`;
const procsDoSku = (sku) => E.procs.filter((p) => p.skus.includes(skuNormal(sku)));

/* ---------- o coração: a instrução de um SKU = padrão + diferenças ---------- */
function resolverSecao(sec, itensPadrao, pz) {
  const alt = pz.alt || {}, omit = new Set(pz.omit || []), add = pz.add || [];
  const ids = new Set(itensPadrao.map((i) => i.id));
  const linhas = [];
  const soltarDepois = (ancora) => add.filter((a) => (a.depois ?? null) === ancora)
    .forEach((a) => linhas.push({ origem: "adicionado", id: a.id, item: a.item, valor: a.valor, texto: a.texto }));
  soltarDepois("__inicio");
  for (const it of itensPadrao) {
    if (omit.has(it.id)) linhas.push({ ...it, origem: "omitido", padrao: it });
    else if (alt[it.id]) {
      const a = alt[it.id];
      const troca = sec.forma === "par" ? { valor: a.v } : { texto: a.v };
      linhas.push({ ...it, ...troca, origem: "alterado", padrao: it, base: a.base, padraoMudou: a.base !== valorDe(sec, it) });
    } else linhas.push({ ...it, origem: "padrao", padrao: it });
    soltarDepois(it.id);
  }
  /* âncora que saiu do padrão: o item do produto não some, vai para o fim */
  add.filter((a) => a.depois && a.depois !== "__inicio" && !ids.has(a.depois))
    .forEach((a) => linhas.push({ origem: "adicionado", id: a.id, item: a.item, valor: a.valor, texto: a.texto }));
  soltarDepois(null);
  return linhas;
}
function resolver(proc, sku, pz) {
  pz = pz || E.pers[chave(proc.id, sku)] || {};
  return Object.fromEntries(SECOES.map((s) => [s.k, resolverSecao(s, proc[s.k] || [], pz[s.k] || {})]));
}
function ajustes(procId, sku, pz) {
  pz = pz || E.pers[chave(procId, sku)] || {};
  const proc = procPorId(procId);
  let alt = 0, omit = 0, add = 0, mudou = 0;
  for (const s of SECOES) {
    const p = pz[s.k] || {};
    const vivos = new Set((proc?.[s.k] || []).map((i) => i.id));
    for (const [id, a] of Object.entries(p.alt || {})) if (vivos.has(id)) {
      alt++; const it = proc[s.k].find((i) => i.id === id); if (a.base !== valorDe(s, it)) mudou++; }
    omit += (p.omit || []).filter((id) => vivos.has(id)).length;
    add += (p.add || []).length;
  }
  return { alt, omit, add, total: alt + omit + add, mudou };
}
function statusTag(procId, sku) {
  const a = ajustes(procId, sku);
  const aviso = a.mudou ? ` <span class="tag amber" title="O padrão mudou em ${plural(a.mudou, "item", "itens")} que este produto personalizou">padrão mudou</span>` : "";
  if (!a.total) return `<span class="tag neutro">Usa o padrão</span>`;
  if (!a.alt && !a.omit) return `<span class="tag acao">Padrão + ${plural(a.add, "complemento", "complementos")}</span>${aviso}`;
  return `<span class="tag amber">Personalizado · ${plural(a.total, "ajuste", "ajustes")}</span>${aviso}`;
}

/* ---------- toasts ---------- */
function toast(msg) {
  const t = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = "toast"; el.innerHTML = esc(msg);
  t.appendChild(el); setTimeout(() => el.remove(), 4200);
}

/* ======================= TELA · PROCEDIMENTOS ======================= */
function casa(proc, q) {
  if (!q) return true;
  const alvo = [proc.nome, proc.descricao, proc.tipo, proc.setor, ...proc.skus,
    ...proc.skus.map((s) => produtoDe(s)?.descricao || ""),
    ...SECOES.flatMap((s) => (proc[s.k] || []).map((i) => `${rotuloDe(s, i)} ${valorDe(s, i)}`))].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => alvo.includes(w));
}
function chipsSku(proc, max = 4) {
  const l = proc.skus.slice(0, max).map((s) => {
    const n = ajustes(proc.id, s).total;
    return `<button class="pr-sku mono ${n ? "pers" : ""}" data-a="abrir-produto" data-sku="${esc(s)}" title="${esc(produtoDe(s)?.descricao || "SKU fora do cadastro de exemplo")}${n ? ` · ${plural(n, "ajuste", "ajustes")} deste produto` : " · usa o padrão"}">${esc(s)}${n ? "<i>●</i>" : ""}</button>`;
  }).join("");
  const resto = proc.skus.length - max;
  return l + (resto > 0 ? `<span class="hint"> +${resto}</span>` : "");
}
function viewProcedimentos() {
  const q = E.busca.trim();
  let lista = E.procs.filter((p) => casa(p, q));
  if (E.tipo !== "todos") lista = lista.filter((p) => p.tipo === E.tipo);
  if (E.setor !== "todos") lista = lista.filter((p) => p.setor === E.setor);
  const tipos = [...new Set([...TIPOS, ...E.procs.map((p) => p.tipo)])].filter((t) => E.procs.some((p) => p.tipo === t));
  const setores = [...new Set([...SETORES, ...E.procs.map((p) => p.setor).filter(Boolean)])];
  const vinculos = E.procs.flatMap((p) => p.skus.map((s) => ajustes(p.id, s).total));
  const skusCom = new Set(E.procs.flatMap((p) => p.skus));
  /* a busca é um SKU? então a pergunta é "o que se aplica a este produto" */
  const skuBuscado = q && skusCom.has(skuNormal(q)) ? skuNormal(q) : null;
  return `
  <div class="kpis">
    ${kpi("Procedimentos padrão", E.procs.length, "a instrução geral de cada tarefa")}
    ${kpi("Produtos com instrução", skusCom.size, "SKUs vinculados a algum padrão", "teal")}
    ${kpi("Usam o padrão puro", vinculos.filter((n) => !n).length, "vínculos sem nenhum ajuste")}
    ${kpi("Com personalização", vinculos.filter((n) => n).length, "vínculos com ajuste só daquele produto", "amber")}
  </div>
  ${skuBuscado ? `<div class="aviso" style="margin-bottom:12px"><b class="mono">${esc(skuBuscado)}</b> · ${esc(produtoDe(skuBuscado)?.descricao || "fora do cadastro de exemplo")} —
    ${plural(procsDoSku(skuBuscado).length, "procedimento se aplica", "procedimentos se aplicam")} a este produto.
    <button class="btn sm" style="margin-left:8px" data-a="abrir-produto" data-sku="${esc(skuBuscado)}">${svg(IC.produtos)}Ver no produto</button></div>` : ""}
  <div class="card">
    <div class="filters">
      <div class="search">${svg(IC.busca)}<input class="inp" id="q-proc" style="width:260px" placeholder="Buscar por nome, SKU, material…" value="${esc(E.busca)}" aria-label="Buscar procedimento"></div>
      <button class="chip ${E.tipo === "todos" ? "on" : ""}" data-a="f-tipo" data-v="todos">Todos</button>
      ${tipos.map((t) => `<button class="chip ${E.tipo === t ? "on" : ""}" data-a="f-tipo" data-v="${esc(t)}">${esc(t)} <b>${E.procs.filter((p) => p.tipo === t).length}</b></button>`).join("")}
      <span class="divider"></span>
      <select class="sel" id="f-setor" aria-label="Setor"><option value="todos">Todos os setores</option>
        ${setores.map((s) => `<option ${E.setor === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
      <span style="margin-left:auto"></span>
      <button class="btn primary sm" data-a="novo">${svg(IC.mais)}Novo procedimento padrão</button>
    </div>
    ${lista.length ? `<div class="tw"><table class="t pr-tab">
      <thead><tr><th>Procedimento</th><th>Tipo</th><th>Setor</th><th>Produtos vinculados</th><th>Atualizado</th></tr></thead>
      <tbody>${lista.map((p) => {
        const nPers = p.skus.filter((s) => ajustes(p.id, s).total).length;
        return `<tr class="pr-lin-tab" data-a="ficha" data-id="${p.id}" tabindex="0">
          <td><b>${esc(p.nome)}</b><div class="hint">${esc(p.descricao || "")}</div></td>
          <td><span class="tag">${esc(p.tipo)}</span></td>
          <td>${esc(p.setor || "—")}</td>
          <td><div class="pr-skus">${chipsSku(p)}</div>
            <div class="hint">${plural(p.skus.length, "produto", "produtos")}${nPers ? ` · ${nPers} com personalização` : ""}</div></td>
          <td class="hint">${fdata(p.atualizadoEm)}<br>${esc(p.por || "")}</td></tr>`; }).join("")}</tbody></table></div>`
    : `<div class="empty"><div class="ic">${svg(IC.procedimentos)}</div><h3>Nenhum procedimento encontrado</h3>
        <p>Nada casa com a busca e os filtros atuais.</p></div>`}
  </div>`;
}

/* ======================= TELA · PRODUTOS (simulada) ======================= */
function viewProdutos() {
  const q = E.buscaProd.trim().toLowerCase();
  const lista = PRODUTOS.filter((p) => !q || `${p.sku} ${p.descricao} ${p.categoria}`.toLowerCase().includes(q));
  return `
  <div class="aviso" style="margin-bottom:12px">Tela de Produtos <b>simulada</b>, só para mostrar a seção nova <b>Procedimentos deste produto</b>. O cadastro aparece só para leitura.</div>
  <div class="card">
    <div class="filters"><div class="search">${svg(IC.busca)}<input class="inp" id="q-prod" style="width:260px" placeholder="Buscar SKU ou descrição" value="${esc(E.buscaProd)}" aria-label="Buscar produto"></div></div>
    <div class="tw"><table class="t pr-tab">
      <thead><tr><th>SKU</th><th>Descrição</th><th>Categoria</th><th>Procedimentos</th></tr></thead>
      <tbody>${lista.map((p) => { const ps = procsDoSku(p.sku);
        return `<tr class="pr-lin-tab" data-a="abrir-produto" data-sku="${p.sku}" tabindex="0">
          <td class="mono"><b>${esc(p.sku)}</b></td><td>${esc(p.descricao)}</td><td>${esc(p.categoria)}</td>
          <td>${ps.length ? ps.map((pr) => `<div class="pr-mini">${esc(pr.nome)} ${statusTag(pr.id, p.sku)}</div>`).join("") : `<span class="hint">nenhum</span>`}</td></tr>`; }).join("")}</tbody></table></div>
  </div>`;
}

/* ======================= FICHA (padrão ou de um SKU) ======================= */
/* modo: "padrao" | "produto". No modo produto, marca o que é deste produto. */
function fichaSecoes(proc, res, modo) {
  return SECOES.map((s) => {
    const linhas = (res ? res[s.k] : (proc[s.k] || []).map((i) => ({ ...i, origem: "padrao" }))).filter((l) => l.origem !== "omitido");
    if (!linhas.length) return "";
    const marca = (l) => modo === "produto" && l.origem !== "padrao"
      ? ` <span class="tag ${l.origem === "adicionado" ? "acao" : "amber"} pr-marca">${l.origem === "adicionado" ? "só deste produto" : "ajustado"}</span>` : "";
    const corpo = s.forma === "par"
      ? `<table class="pr-kv">${linhas.map((l) => `<tr class="${l.origem}"><th>${esc(l.item)}</th><td>${esc(l.valor)}${marca(l)}</td></tr>`).join("")}</table>`
      : `<${s.numerada ? "ol" : "ul"} class="pr-lista ${s.tom || ""}">${linhas.map((l) => `<li class="${l.origem}">${esc(l.texto)}${marca(l)}</li>`).join("")}</${s.numerada ? "ol" : "ul"}>`;
    return `<section class="pr-sec-f ${s.tom || ""}"><h4>${s.nome}</h4>${s.nota ? `<div class="pr-nota">${s.nota}</div>` : ""}${corpo}</section>`;
  }).join("");
}
function modalFicha(m) {
  const p = procPorId(m.id);
  if (!p) return "";
  return janela(`${esc(p.nome)}`, `
    <div class="pr-cab"><span class="tag">${esc(p.tipo)}</span>${p.setor ? `<span class="tag neutro">${esc(p.setor)}</span>` : ""}<span class="tag acao">Procedimento padrão</span>
      <span class="hint" style="margin-left:auto">Atualizado em ${fdata(p.atualizadoEm)}${p.por ? ` por ${esc(p.por)}` : ""}</span></div>
    ${p.descricao ? `<p class="pr-desc">${esc(p.descricao)}</p>` : ""}
    <div class="pr-ficha">${fichaSecoes(p, null, "padrao")}</div>
    <section class="pr-vinc"><h4>Produtos vinculados · ${p.skus.length}</h4>
      <div class="hint" style="margin-bottom:8px">O vínculo só diz onde esta instrução vale. Cada produto pode usar o padrão como está ou ter ajustes próprios.</div>
      ${p.skus.length ? `<table class="t"><tbody>${p.skus.map((s) => `<tr>
        <td class="mono"><b>${esc(s)}</b></td><td>${esc(produtoDe(s)?.descricao || "fora do cadastro de exemplo")}</td>
        <td>${statusTag(p.id, s)}</td>
        <td style="text-align:right;white-space:nowrap"><button class="btn sm" data-a="instrucao" data-id="${p.id}" data-sku="${esc(s)}" data-vista="comparar">Comparar</button>
          <button class="btn sm ghost" data-a="abrir-produto" data-sku="${esc(s)}">Abrir produto</button></td></tr>`).join("")}</tbody></table>`
      : `<div class="hint">Nenhum SKU vinculado.</div>`}
    </section>`,
    `<button class="btn" data-a="imprimir" data-id="${p.id}">${svg(IC.impressora)}Imprimir padrão</button>
     <span style="margin-left:auto"></span>
     <button class="btn primary" data-a="editar" data-id="${p.id}">${svg(IC.editar)}Editar padrão</button>`, "1040px");
}

/* ======================= PRODUTO · "Procedimentos deste produto" ======================= */
function resumoAjustes(proc, sku) {
  const pz = E.pers[chave(proc.id, sku)] || {};
  const partes = [];
  for (const s of SECOES) {
    const p = pz[s.k] || {};
    for (const [id, a] of Object.entries(p.alt || {})) {
      const it = (proc[s.k] || []).find((i) => i.id === id);
      if (it) partes.push(`${s.forma === "par" ? esc(it.item) : s.nome}: <s>${esc(valorDe(s, it))}</s> → <b>${esc(a.v)}</b>`);
    }
    const nOmit = (p.omit || []).length, nAdd = (p.add || []).length;
    if (nOmit) partes.push(`${s.nome}: ${nOmit} não se aplica${nOmit > 1 ? "m" : ""}`);
    if (nAdd) partes.push(`${s.nome}: +${nAdd} só deste produto`);
  }
  return partes;
}
function modalProduto(m) {
  const prod = produtoDe(m.sku) || { sku: m.sku, descricao: "fora do cadastro de exemplo", categoria: "—" };
  const ps = procsDoSku(m.sku);
  return janela(`<span class="mono">${esc(prod.sku)}</span> · ${esc(prod.descricao)}`, `
    <div class="pr-cadastro"><div><span>SKU</span><b class="mono">${esc(prod.sku)}</b></div><div><span>Descrição</span><b>${esc(prod.descricao)}</b></div>
      <div><span>Categoria</span><b>${esc(prod.categoria)}</b></div><div class="hint">Cadastro do produto, só leitura nesta amostra.</div></div>
    <section class="pr-proc-prod">
      <div class="pr-proc-h"><h3>Procedimentos deste produto</h3><span class="hint">Instrução de trabalho. Personalizar aqui não altera cadastro, estoque, embalagem nem o padrão.</span></div>
      ${ps.length ? ps.map((pr) => { const a = ajustes(pr.id, m.sku); const r = resumoAjustes(pr, m.sku);
        return `<div class="pr-card">
          <div class="pr-card-h"><b>${esc(pr.nome)}</b><span class="tag">${esc(pr.tipo)}</span>${statusTag(pr.id, m.sku)}</div>
          <div class="pr-card-r">${r.length ? r.map((x) => `<span>${x}</span>`).join("") : `<span class="hint">Segue o padrão exatamente como está.</span>`}</div>
          <div class="pr-card-a">
            <button class="btn sm" data-a="instrucao" data-id="${pr.id}" data-sku="${esc(m.sku)}">${svg(IC.olho)}Abrir instrução</button>
            <button class="btn sm" data-a="instrucao" data-id="${pr.id}" data-sku="${esc(m.sku)}" data-vista="comparar">Comparar com o padrão</button>
            <button class="btn sm" data-a="personalizar" data-id="${pr.id}" data-sku="${esc(m.sku)}">${svg(IC.editar)}Personalizar para este produto</button>
            <button class="btn sm ghost" data-a="usar-padrao" data-id="${pr.id}" data-sku="${esc(m.sku)}" ${a.total ? "" : "disabled"} title="Descarta os ajustes deste produto e volta a seguir o padrão">Usar padrão</button>
            <button class="btn sm ghost" data-a="imprimir" data-id="${pr.id}" data-sku="${esc(m.sku)}">${svg(IC.impressora)}Imprimir versão deste produto</button>
          </div></div>`; }).join("")
      : `<div class="empty" style="padding:30px"><div class="ic">${svg(IC.procedimentos)}</div><h3>Nenhum procedimento vinculado</h3>
          <p>O vínculo é feito no procedimento padrão, na tela Procedimentos.</p></div>`}
    </section>`, `<span style="margin-left:auto"></span><button class="btn" data-a="fechar">Fechar</button>`, "940px");
}

/* ======================= INSTRUÇÃO DO PRODUTO · e a comparação ======================= */
function modalInstrucao(m) {
  const p = procPorId(m.id); if (!p) return "";
  const prod = produtoDe(m.sku);
  const res = resolver(p, m.sku);
  const a = ajustes(p.id, m.sku);
  const vista = m.vista || "instrucao";
  const corpo = vista === "instrucao"
    ? `<div class="pr-ficha">${fichaSecoes(p, res, "produto")}</div>`
    : comparacao(p, m.sku, res, m.soDif);
  return janela(`${esc(p.nome)} · <span class="mono">${esc(m.sku)}</span>`, `
    <div class="pr-cab"><span class="hint">${esc(prod?.descricao || "")}</span>${statusTag(p.id, m.sku)}
      <div class="seg" style="margin-left:auto" role="group" aria-label="Vista">
        <button class="${vista === "instrucao" ? "on" : ""}" data-a="vista" data-v="instrucao">Instrução deste produto</button>
        <button class="${vista === "comparar" ? "on" : ""}" data-a="vista" data-v="comparar">Comparar com o padrão</button></div>
      ${vista === "comparar" ? `<label class="selbar-chk"><input type="checkbox" data-a="so-dif" ${m.soDif ? "checked" : ""}> Só o que muda</label>` : ""}</div>
    ${!a.total ? `<div class="aviso" style="margin:10px 0">Este produto segue o padrão exatamente como está. Mudanças no padrão aparecem aqui na hora.</div>` : ""}
    ${corpo}`,
    `<button class="btn" data-a="imprimir" data-id="${p.id}" data-sku="${esc(m.sku)}">${svg(IC.impressora)}Imprimir versão deste produto</button>
     <button class="btn ghost" data-a="usar-padrao" data-id="${p.id}" data-sku="${esc(m.sku)}" ${a.total ? "" : "disabled"}>Usar padrão</button>
     <span style="margin-left:auto"></span>
     <button class="btn primary" data-a="personalizar" data-id="${p.id}" data-sku="${esc(m.sku)}">${svg(IC.editar)}Personalizar</button>`, "1100px");
}
function comparacao(p, sku, res, soDif) {
  const cel = (s, l, lado) => {
    if (lado === "padrao") return l.origem === "adicionado" ? `<span class="pr-vazio">—</span>`
      : `${s.forma === "par" ? `<b>${esc(l.padrao.item)}</b> ` : ""}${esc(valorDe(s, l.padrao))}`;
    if (l.origem === "omitido") return `<span class="tag neutro">não se aplica a este produto</span>`;
    if (l.origem === "padrao") return `<span class="pr-igual">igual ao padrão</span>`;
    return `${s.forma === "par" ? `<b>${esc(l.item)}</b> ` : ""}${esc(valorDe(s, l))}
      <span class="tag ${l.origem === "adicionado" ? "acao" : "amber"} pr-marca">${l.origem === "adicionado" ? "só deste produto" : "personalizado"}</span>
      ${l.padraoMudou ? `<div class="pr-mudou">Personalizado quando o padrão dizia “${esc(l.base)}”. O padrão agora diz “${esc(valorDe(s, l.padrao))}”.</div>` : ""}`;
  };
  const blocos = SECOES.map((s) => {
    const linhas = res[s.k];
    const dif = linhas.filter((l) => l.origem !== "padrao").length;
    if (!linhas.length || (soDif && !dif)) return "";
    const numProd = new Map(); let k = 0;
    linhas.forEach((l) => { if (l.origem !== "omitido") numProd.set(l.id, ++k); });
    return `<section class="pr-cmp-s"><h4>${s.nome}${dif ? ` <span class="tag amber">${plural(dif, "diferença", "diferenças")}</span>` : ` <span class="tag neutro">igual</span>`}</h4>
      <div class="pr-cmp">
        <div class="pr-cmp-h">Padrão</div><div class="pr-cmp-h">SKU ${esc(sku)}</div>
        ${linhas.filter((l) => !soDif || l.origem !== "padrao").map((l) => {
          /* cada lado com a SUA numeração: o passo 2 do padrão pode ser o 3 do produto */
          const nPad = s.numerada && l.origem !== "adicionado" ? `<span class="pr-n mono">${p[s.k].findIndex((i) => i.id === l.id) + 1}</span>` : "";
          const nProd = s.numerada && l.origem !== "omitido" ? `<span class="pr-n mono">${numProd.get(l.id)}</span>` : "";
          return `<div class="pr-cmp-c ${l.origem}">${nPad}<div>${cel(s, l, "padrao")}</div></div>
            <div class="pr-cmp-c ${l.origem} dir">${nProd}<div>${cel(s, l, "produto")}</div></div>`; }).join("")}
      </div></section>`;
  }).join("");
  return blocos || `<div class="empty" style="padding:30px"><h3>Nenhuma diferença</h3><p>Este produto segue o padrão em todas as seções.</p></div>`;
}

/* ======================= EDITAR / CRIAR O PADRÃO ======================= */
function modalEditar(m) {
  const r = m.rasc;
  const lin = (s) => (r[s.k] || []).map((it, i, arr) => `<div class="pr-ed-lin">
      ${s.numerada ? `<span class="pr-n mono">${i + 1}</span>` : ""}
      ${s.forma === "par"
        ? `<input class="inp" data-ed="${s.k}|${it.id}|item" value="${esc(it.item)}" placeholder="${s.rotulos[0]}" aria-label="${s.rotulos[0]}">
           <input class="inp" data-ed="${s.k}|${it.id}|valor" value="${esc(it.valor)}" placeholder="${s.rotulos[1]}" aria-label="${s.rotulos[1]}">`
        : `<input class="inp pr-longo" data-ed="${s.k}|${it.id}|texto" value="${esc(it.texto)}" aria-label="${s.nome} ${i + 1}">`}
      <button class="btn sm ghost so-icone" data-a="ed-mv" data-s="${s.k}" data-id="${it.id}" data-d="-1" ${i ? "" : "disabled"} title="Subir" aria-label="Subir">${svg(IC.setaCima)}</button>
      <button class="btn sm ghost so-icone" data-a="ed-mv" data-s="${s.k}" data-id="${it.id}" data-d="1" ${i < arr.length - 1 ? "" : "disabled"} title="Descer" aria-label="Descer">${svg(IC.setaBaixo)}</button>
      <button class="btn sm ghost so-icone" data-a="ed-del" data-s="${s.k}" data-id="${it.id}" title="Remover" aria-label="Remover">${svg(IC.lixeira)}</button>
    </div>`).join("");
  const nVinc = r.skus.length;
  return janela(m.novo ? "Novo procedimento padrão" : `Editar padrão · ${esc(procPorId(r.id)?.nome || "")}`, `
    ${!m.novo && nVinc ? `<div class="aviso" style="margin-bottom:14px">Mudanças aqui valem para os <b>${nVinc} produtos vinculados</b> em tudo o que eles não personalizaram. O que um produto personalizou fica como ele definiu, e a tela avisa que o padrão mudou.</div>` : ""}
    <div class="grid2">
      <label class="fld"><span>Nome *</span><input class="inp" data-ed="|nome" value="${esc(r.nome)}" placeholder="Ex.: Embalagem de coleira"></label>
      <div class="grid2" style="gap:10px">
        <label class="fld"><span>Tipo *</span><input class="inp" list="dl-tipos" data-ed="|tipo" value="${esc(r.tipo)}" placeholder="Embalagem, Corte…"></label>
        <label class="fld"><span>Setor</span><input class="inp" list="dl-setores" data-ed="|setor" value="${esc(r.setor)}" placeholder="Expedição…"></label>
      </div>
    </div>
    <datalist id="dl-tipos">${TIPOS.map((t) => `<option value="${esc(t)}">`).join("")}</datalist>
    <datalist id="dl-setores">${SETORES.map((t) => `<option value="${esc(t)}">`).join("")}</datalist>
    <label class="fld" style="margin-top:12px;display:block"><span>Descrição</span><textarea class="inp" rows="2" style="width:100%" data-ed="|descricao">${esc(r.descricao)}</textarea></label>
    ${m.erro ? `<div class="pr-erro">${esc(m.erro)}</div>` : ""}
    <div class="pr-ed-grade">
      ${SECOES.map((s) => `<fieldset class="pr-ed-sec ${s.tom || ""}"><legend>${s.nome}</legend>${s.nota ? `<div class="pr-nota">${s.nota}</div>` : ""}
        ${lin(s)}<button class="btn sm" data-a="ed-add" data-s="${s.k}">${svg(IC.mais)}Adicionar ${s.un}</button></fieldset>`).join("")}
    </div>
    <fieldset class="pr-ed-sec pr-ed-skus"><legend>Produtos vinculados · ${nVinc}</legend>
      <div class="pr-nota">Só referência: diz onde esta instrução vale. Não altera o produto.</div>
      <div class="pr-sku-in"><textarea class="inp" id="ed-sku" rows="1" placeholder="Cole ou digite SKUs — vírgula, espaço ou uma linha para cada" aria-label="SKUs a vincular"></textarea>
        <button class="btn sm" data-a="ed-sku-add">${svg(IC.mais)}Vincular</button></div>
      <div class="pr-skus" style="margin-top:8px">${r.skus.map((s) => { const n = ajustes(r.id, s).total;
        return `<span class="pr-sku mono ${n ? "pers" : ""}" title="${esc(produtoDe(s)?.descricao || "fora do cadastro de exemplo")}">${esc(s)}${n ? `<i title="tem personalização">●</i>` : ""}
          <button data-a="ed-sku-del" data-sku="${esc(s)}" aria-label="Desvincular ${esc(s)}">×</button></span>`; }).join("") || `<span class="hint">Nenhum ainda.</span>`}</div>
    </fieldset>`,
    `<button class="btn" data-a="fechar">Cancelar</button><span style="margin-left:auto"></span>
     <button class="btn primary" data-a="ed-salvar">${svg(IC.ok)}Salvar padrão</button>`, "1100px");
}

/* ======================= PERSONALIZAR PARA UM PRODUTO ======================= */
function modalPersonalizar(m) {
  const p = procPorId(m.id); if (!p) return "";
  const pz = m.rasc;
  const prod = produtoDe(m.sku);
  const sec = (s) => {
    const z = pz[s.k] || {};
    const alt = z.alt || {}, omit = new Set(z.omit || []), add = z.add || [];
    const itens = p[s.k] || [];
    const linhaAdd = (a) => `<div class="pr-pz-lin adicionado">
        <span class="tag acao">só deste produto</span>
        ${s.forma === "par"
          ? `<input class="inp" data-pza="${s.k}|${a.id}|item" value="${esc(a.item)}" placeholder="${s.rotulos[0]}" aria-label="${s.rotulos[0]}">
             <input class="inp" data-pza="${s.k}|${a.id}|valor" value="${esc(a.valor)}" placeholder="${s.rotulos[1]}" aria-label="${s.rotulos[1]}">`
          : `<input class="inp pr-longo" data-pza="${s.k}|${a.id}|texto" value="${esc(a.texto)}" aria-label="Item só deste produto">`}
        ${s.numerada ? `<select class="sel" data-pzpos="${s.k}|${a.id}" aria-label="Posição">
            <option value="__inicio" ${a.depois === "__inicio" ? "selected" : ""}>no início</option>
            ${itens.map((it, i) => `<option value="${it.id}" ${a.depois === it.id ? "selected" : ""}>depois do passo ${i + 1} do padrão</option>`).join("")}
            <option value="" ${a.depois == null ? "selected" : ""}>no fim</option></select>` : ""}
        <button class="btn sm ghost so-icone" data-a="pz-del" data-s="${s.k}" data-id="${a.id}" title="Remover" aria-label="Remover">${svg(IC.lixeira)}</button></div>`;
    const linhas = [];
    add.filter((a) => a.depois === "__inicio").forEach((a) => linhas.push(linhaAdd(a)));
    itens.forEach((it, i) => {
      const modo = omit.has(it.id) ? "omitido" : alt[it.id] ? "alterado" : "padrao";
      const vPad = valorDe(s, it);
      const mudou = modo === "alterado" && alt[it.id].base !== vPad;
      linhas.push(`<div class="pr-pz-lin ${modo}">
        <div class="pr-pz-pad">${s.numerada ? `<span class="pr-n mono">${i + 1}</span>` : ""}<span class="rot">Padrão</span>
          ${s.forma === "par" ? `<b>${esc(it.item)}:</b> ` : ""}<span class="${modo === "padrao" ? "" : "pr-riscado"}">${esc(vPad)}</span></div>
        <div class="seg" role="group" aria-label="Como este produto usa o item">
          <button class="${modo === "padrao" ? "on" : ""}" data-a="pz-modo" data-s="${s.k}" data-id="${it.id}" data-m="padrao">Padrão</button>
          <button class="${modo === "alterado" ? "on" : ""}" data-a="pz-modo" data-s="${s.k}" data-id="${it.id}" data-m="alterado">Personalizar</button>
          <button class="${modo === "omitido" ? "on" : ""}" data-a="pz-modo" data-s="${s.k}" data-id="${it.id}" data-m="omitido">Não se aplica</button></div>
        ${modo === "alterado" ? `<input class="inp pr-longo" data-pzv="${s.k}|${it.id}" value="${esc(alt[it.id].v)}" aria-label="Valor para este produto">` : ""}
        ${mudou ? `<div class="pr-mudou">Você personalizou quando o padrão dizia “${esc(alt[it.id].base)}”. O padrão agora diz “${esc(vPad)}”.
          <button class="btn sm" data-a="pz-modo" data-s="${s.k}" data-id="${it.id}" data-m="padrao">Voltar a seguir o padrão</button>
          <button class="btn sm ghost" data-a="pz-ciente" data-s="${s.k}" data-id="${it.id}">Manter o meu</button></div>` : ""}
      </div>`);
      add.filter((a) => a.depois === it.id).forEach((a) => linhas.push(linhaAdd(a)));
    });
    add.filter((a) => a.depois !== "__inicio" && (a.depois == null || !itens.some((i) => i.id === a.depois))).forEach((a) => linhas.push(linhaAdd(a)));
    return `<fieldset class="pr-ed-sec ${s.tom || ""}"><legend>${s.nome}</legend>${s.nota ? `<div class="pr-nota">${s.nota}</div>` : ""}
      ${linhas.join("") || `<div class="hint">O padrão não tem ${s.un} aqui.</div>`}
      <button class="btn sm" data-a="pz-add" data-s="${s.k}">${svg(IC.mais)}Adicionar só para este produto</button></fieldset>`;
  };
  const a = ajustes(p.id, m.sku, pz);
  return janela(`Personalizar · ${esc(p.nome)} · <span class="mono">${esc(m.sku)}</span>`, `
    <div class="aviso" style="margin-bottom:14px">Vale <b>só para ${esc(m.sku)}</b>${prod ? ` · ${esc(prod.descricao)}` : ""}. Não altera o padrão nem os outros ${plural(p.skus.length - 1, "produto", "produtos")}.
      Itens em <b>Padrão</b> continuam acompanhando o padrão. É instrução: não mexe em cadastro, estoque, embalagem ou pedido.</div>
    <div class="pr-cab"><span class="hint">${a.total ? `${plural(a.total, "ajuste", "ajustes")} neste produto` : "Nenhum ajuste: segue o padrão."}</span></div>
    <div class="pr-ed-grade">${SECOES.map(sec).join("")}</div>`,
    `<button class="btn" data-a="fechar">Cancelar</button>
     <button class="btn ghost" data-a="pz-limpar" ${a.total ? "" : "disabled"}>Voltar tudo ao padrão</button>
     <span style="margin-left:auto"></span>
     <button class="btn primary" data-a="pz-salvar">${svg(IC.ok)}Salvar personalização</button>`, "1100px");
}

/* ======================= IMPRESSÃO ======================= */
function folha(proc, sku) {
  const prod = sku ? produtoDe(sku) : null;
  const res = sku ? resolver(proc, sku) : null;
  const a = sku ? ajustes(proc.id, sku) : null;
  const agora = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const secoes = SECOES.map((s) => {
    const linhas = (res ? res[s.k] : (proc[s.k] || []).map((i) => ({ ...i, origem: "padrao" }))).filter((l) => l.origem !== "omitido");
    if (!linhas.length) return "";
    const mk = (l) => sku && l.origem !== "padrao" ? ` <span class="pf-mk">◆</span>` : "";
    const corpo = s.forma === "par"
      ? `<table class="pf-kv">${linhas.map((l) => `<tr><th>${esc(l.item)}</th><td>${esc(l.valor)}${mk(l)}</td></tr>`).join("")}</table>`
      : s.numerada
        ? `<ol class="pf-passos">${linhas.map((l) => `<li><span class="cx"></span>${esc(l.texto)}${mk(l)}</li>`).join("")}</ol>`
        : `<ul class="pf-lista">${linhas.map((l) => `<li>${esc(l.texto)}${mk(l)}</li>`).join("")}</ul>`;
    return `<section class="pf-sec ${s.tom || ""} ${s.numerada ? "passos" : ""}"><h3>${s.nome}</h3>${corpo}</section>`;
  }).join("");
  return `<div class="cab-f"><div class="lg"></div>
      <div><h1>${esc(proc.nome)}</h1><div class="sub-f">Moda Bicho Acessórios · Procedimento de ${esc(proc.tipo)}${proc.setor ? ` · ${esc(proc.setor)}` : ""}</div></div>
      <div class="dt">${sku ? `<b class="sku-f">SKU ${esc(sku)}</b><br>` : "<b>Padrão</b><br>"}Impresso em ${agora}</div></div>
    ${sku ? `<div class="pf-prod"><b>${esc(prod?.descricao || sku)}</b> · ${a.total ? `versão deste produto — os itens marcados com ◆ são específicos dele` : "segue o padrão"}</div>` : ""}
    ${proc.descricao ? `<p class="pf-desc">${esc(proc.descricao)}</p>` : ""}
    <div class="pf-grade">${secoes}</div>
    <div class="obs-f">Instrução de trabalho. Não é ordem de produção e não movimenta estoque. Padrão atualizado em ${fdata(proc.atualizadoEm)}.</div>`;
}
function imprimir(html) {
  document.getElementById("folha").innerHTML = html;
  document.body.classList.add("imprimindo");
  window.onafterprint = () => document.body.classList.remove("imprimindo");
  window.print();
}

/* ======================= JANELAS ======================= */
function janela(titulo, corpo, rodape, largura) {
  const volta = E.pilha.length > 1 ? `<button class="btn sm ghost" data-a="voltar">${svg(IC.setaEsq)}Voltar</button>` : "";
  return `<div class="ov" data-a="fundo"><div class="modal" style="max-width:min(${largura}, 96vw)" role="dialog" aria-modal="true">
    <div class="modal-h">${volta}<h2>${titulo}</h2><button class="btn sm ghost" style="margin-left:auto" data-a="fechar" aria-label="Fechar">${svg(IC.fechar)}</button></div>
    <div class="modal-b">${corpo}</div><div class="modal-f">${rodape}</div></div></div>`;
}
function renderModal() {
  const m = E.pilha[E.pilha.length - 1];
  if (!m) return "";
  return ({ ficha: modalFicha, produto: modalProduto, instrucao: modalInstrucao, editar: modalEditar, personalizar: modalPersonalizar })[m.t](m);
}
const abrir = (m) => { E.pilha.push(m); render(); };
const fechar = () => { E.pilha.pop(); render(); };
const topo = () => E.pilha[E.pilha.length - 1];

/* ======================= DESENHO ======================= */
function render() {
  const ativo = document.activeElement;
  const guarda = ativo && ativo.id ? { id: ativo.id, i: ativo.selectionStart, f: ativo.selectionEnd } : null;
  /* a rolagem só volta quando é a MESMA janela sendo redesenhada; janela nova abre no topo */
  const rolagem = E._janela === topo() ? document.querySelector(".modal-b")?.scrollTop : null;
  E._janela = topo();
  const nav = [["sec", "Operação"], ["demanda", "Demanda"], ["pedidos", "Pedidos"], ["conferencia", "Conferência"], ["tarefas", "Tarefas"],
    ["sec", "Cadastros"], ["produtos", "Produtos", true], ["procedimentos", "Procedimentos", true], ["insumos", "Insumos"], ["prestadoras", "Prestadoras"], ["equipe", "Equipe"]];
  const tit = E.aba === "produtos" ? ["Produtos", "Tela simulada · para ver a seção Procedimentos deste produto"]
    : ["Procedimentos", "Biblioteca de como fazer: padrão geral e ajustes por produto"];
  document.getElementById("app").innerHTML = `
  <div class="shell"><nav class="rail">
    <div class="brand"><div class="brand-logo" role="img" aria-label="Moda Bicho Acessórios"></div></div>
    <div class="nav">${nav.map(([id, nome, vivo]) => id === "sec" ? `<div class="sec">${nome}</div>`
      : `<button ${vivo ? `data-a="aba" data-v="${id}"` : `disabled title="Fora desta amostra"`} class="${E.aba === id ? "on" : ""} ${vivo ? "" : "pr-off"}">${svg(IC[id])}<span>${nome}</span>${id === "procedimentos" ? `<span class="badge">novo</span>` : ""}</button>`).join("")}</div>
  </nav>
  <div class="main"><div class="topbar"><div><h1>${tit[0]}</h1><p>${tit[1]}</p></div>
    <div class="right"><span class="tag amber" title="Nada aqui fala com o servidor. Recarregar volta aos exemplos.">Amostra · dados fictícios · nada é gravado</span></div></div>
    <div class="page">${E.aba === "produtos" ? viewProdutos() : viewProcedimentos()}</div></div></div>
  <nav class="barra-mob" aria-label="Navegação">
    <button data-a="aba" data-v="procedimentos" class="${E.aba === "procedimentos" ? "on" : ""}">${svg(IC.procedimentos)}<span>Procedimentos</span></button>
    <button data-a="aba" data-v="produtos" class="${E.aba === "produtos" ? "on" : ""}">${svg(IC.produtos)}<span>Produtos</span></button></nav>
  ${renderModal()}`;
  if (rolagem != null && document.querySelector(".modal-b")) document.querySelector(".modal-b").scrollTop = rolagem;
  const alvo = E.foco ? document.querySelector(E.foco) : guarda && document.getElementById(guarda.id);
  if (alvo) { alvo.focus(); if (!E.foco && guarda.i != null && alvo.setSelectionRange) try { alvo.setSelectionRange(guarda.i, guarda.f); } catch {} }
  E.foco = null;
}

/* ======================= AÇÕES ======================= */
function lerSkus(txt) { return String(txt || "").split(/[\s,;]+/).map(skuNormal).filter(Boolean); }
function zona(pz, k) { return (pz[k] ||= { alt: {}, omit: [], add: [] }), pz[k].alt ||= {}, pz[k].omit ||= [], pz[k].add ||= [], pz[k]; }
function limparVazios(pz) {
  for (const k of Object.keys(pz)) {
    const z = pz[k];
    z.add = (z.add || []).filter((a) => (a.texto || a.item || a.valor || "").trim());
    if (!Object.keys(z.alt || {}).length && !(z.omit || []).length && !z.add.length) delete pz[k];
  }
  return pz;
}

const ACOES = {
  aba: (d) => { E.aba = d.v; E.pilha = []; render(); },
  "f-tipo": (d) => { E.tipo = d.v; render(); },
  fundo: () => fechar(),
  fechar: () => fechar(),
  voltar: () => fechar(),
  ficha: (d) => abrir({ t: "ficha", id: d.id }),
  "abrir-produto": (d) => abrir({ t: "produto", sku: d.sku }),
  instrucao: (d) => abrir({ t: "instrucao", id: d.id, sku: d.sku, vista: d.vista || "instrucao" }),
  vista: (d) => { topo().vista = d.v; render(); },
  "so-dif": (d, el) => { topo().soDif = el.checked; render(); },
  imprimir: (d) => imprimir(folha(procPorId(d.id), d.sku || null)),
  "usar-padrao": (d) => {
    const a = ajustes(d.id, d.sku);
    if (!a.total) return;
    if (!confirm(`Voltar o SKU ${d.sku} ao padrão?\n\nOs ${a.total} ajustes deste produto em “${procPorId(d.id).nome}” serão descartados.\nO padrão e os outros produtos não mudam.`)) return;
    delete E.pers[chave(d.id, d.sku)]; toast(`${d.sku} voltou a seguir o padrão.`); render();
  },

  /* ---- padrão ---- */
  novo: () => abrir({ t: "editar", novo: true, rasc: { id: novoId("pr-"), nome: "", tipo: E.tipo !== "todos" ? E.tipo : "", setor: E.setor !== "todos" ? E.setor : "",
    descricao: "", ...Object.fromEntries(SECOES.map((s) => [s.k, []])), skus: [] } }),
  editar: (d) => abrir({ t: "editar", rasc: copia(procPorId(d.id)) }),
  "ed-add": (d) => { const s = SEC[d.s]; const id = novoId(d.s.slice(0, 2));
    topo().rasc[d.s].push(s.forma === "par" ? { id, item: "", valor: "" } : { id, texto: "" });
    E.foco = `[data-ed="${d.s}|${id}|${s.forma === "par" ? "item" : "texto"}"]`; render(); },
  "ed-del": (d) => { const r = topo().rasc; r[d.s] = r[d.s].filter((i) => i.id !== d.id); render(); },
  "ed-mv": (d) => { const l = topo().rasc[d.s]; const i = l.findIndex((x) => x.id === d.id); const j = i + Number(d.d);
    if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; render(); },
  "ed-sku-add": () => { const r = topo().rasc; const novos = [...new Set(lerSkus(document.getElementById("ed-sku").value))].filter((s) => !r.skus.includes(s));
    r.skus.push(...novos); E.foco = "#ed-sku"; render();
    if (novos.length) toast(`${plural(novos.length, "SKU vinculado", "SKUs vinculados")}: ${novos.join(", ")}`); },
  "ed-sku-del": (d) => { const r = topo().rasc; r.skus = r.skus.filter((s) => s !== d.sku); render(); },
  "ed-salvar": () => {
    const m = topo(), r = m.rasc;
    r.nome = r.nome.trim(); r.tipo = r.tipo.trim(); r.setor = (r.setor || "").trim();
    if (!r.nome || !r.tipo) { m.erro = "Preencha o nome e o tipo."; render(); return; }
    for (const s of SECOES) r[s.k] = r[s.k].filter((i) => valorDe(s, i).trim() || rotuloDe(s, i).trim());
    const antes = procPorId(r.id);
    /* o que o salvamento desfaz nos produtos: dizer ANTES, não depois */
    const saem = antes ? antes.skus.filter((s) => !r.skus.includes(s) && ajustes(r.id, s).total) : [];
    const perdidos = antes ? r.skus.filter((sku) => { const pz = E.pers[chave(r.id, sku)] || {};
      return SECOES.some((s) => Object.keys(pz[s.k]?.alt || {}).concat(pz[s.k]?.omit || []).some((id) => !r[s.k].some((i) => i.id === id))); }) : [];
    const avisos = [];
    if (saem.length) avisos.push(`Desvincular ${saem.join(", ")} descarta a personalização desses produtos.`);
    if (perdidos.length) avisos.push(`Você removeu itens do padrão que ${perdidos.join(", ")} tinha(m) personalizado. Esses ajustes deixam de valer.`);
    if (avisos.length && !confirm(avisos.join("\n\n") + "\n\nSalvar mesmo assim?")) return;
    saem.forEach((s) => delete E.pers[chave(r.id, s)]);
    r.atualizadoEm = new Date().toISOString(); r.por = "você (amostra)";
    if (antes) Object.assign(antes, r); else E.procs.unshift(r);
    const herdam = r.skus.filter((s) => !ajustes(r.id, s).total).length;
    E.pilha.pop();
    toast(antes ? `Padrão salvo. Vale na hora para ${plural(r.skus.length, "produto vinculado", "produtos vinculados")} (${herdam} sem nenhum ajuste).` : "Procedimento padrão criado.");
    render();
  },

  /* ---- personalização ---- */
  personalizar: (d) => abrir({ t: "personalizar", id: d.id, sku: d.sku, rasc: copia(E.pers[chave(d.id, d.sku)] || {}) }),
  "pz-modo": (d) => {
    const m = topo(), s = SEC[d.s], z = zona(m.rasc, d.s);
    const it = procPorId(m.id)[d.s].find((i) => i.id === d.id);
    delete z.alt[d.id]; z.omit = z.omit.filter((x) => x !== d.id);
    if (d.m === "alterado") { z.alt[d.id] = { v: valorDe(s, it), base: valorDe(s, it) }; E.foco = `[data-pzv="${d.s}|${d.id}"]`; }
    if (d.m === "omitido") z.omit.push(d.id);
    render();
  },
  "pz-ciente": (d) => { const m = topo(); const it = procPorId(m.id)[d.s].find((i) => i.id === d.id);
    zona(m.rasc, d.s).alt[d.id].base = valorDe(SEC[d.s], it); render(); },
  "pz-add": (d) => { const s = SEC[d.s]; const id = novoId("a"); const z = zona(topo().rasc, d.s);
    z.add.push(s.forma === "par" ? { id, item: "", valor: "", depois: null } : { id, texto: "", depois: null });
    E.foco = `[data-pza="${d.s}|${id}|${s.forma === "par" ? "item" : "texto"}"]`; render(); },
  "pz-del": (d) => { const z = zona(topo().rasc, d.s); z.add = z.add.filter((a) => a.id !== d.id); render(); },
  "pz-limpar": () => { topo().rasc = {}; render(); },
  "pz-salvar": () => {
    const m = topo(); const pz = limparVazios(m.rasc);
    if (Object.keys(pz).length) E.pers[chave(m.id, m.sku)] = pz; else delete E.pers[chave(m.id, m.sku)];
    const a = ajustes(m.id, m.sku);
    E.pilha.pop();
    toast(a.total ? `Personalização de ${m.sku} salva · ${plural(a.total, "ajuste", "ajustes")}. O padrão não mudou.` : `${m.sku} segue o padrão.`);
    render();
  },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-a]");
  if (!el) return;
  if (el.dataset.a === "fundo" && e.target !== el) return;   /* clique dentro da janela não fecha */
  if (el.type === "checkbox") return;                          /* tratado no change */
  const f = ACOES[el.dataset.a];
  if (f) { e.preventDefault(); f(el.dataset, el); }
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.id === "f-setor") { E.setor = el.value; render(); return; }
  if (el.dataset.a === "so-dif") { ACOES["so-dif"](el.dataset, el); return; }
  if (el.dataset.pzpos) { const [k, id] = el.dataset.pzpos.split("|"); const a = zona(topo().rasc, k).add.find((x) => x.id === id);
    if (a) a.depois = el.value || null; render(); }
});
/* digitar não redesenha a janela: só guarda no rascunho (o foco não pula) */
document.addEventListener("input", (e) => {
  const el = e.target, m = topo();
  if (el.id === "q-proc") { E.busca = el.value; render(); return; }
  if (el.id === "q-prod") { E.buscaProd = el.value; render(); return; }
  if (el.dataset.ed != null && m?.t === "editar") {
    const [k, id, campo] = el.dataset.ed.split("|");
    if (!k) m.rasc[id] = el.value;
    else { const it = m.rasc[k].find((i) => i.id === id); if (it) it[campo] = el.value; }
    return;
  }
  if (el.dataset.pzv && m?.t === "personalizar") { const [k, id] = el.dataset.pzv.split("|"); zona(m.rasc, k).alt[id].v = el.value; return; }
  if (el.dataset.pza && m?.t === "personalizar") { const [k, id, campo] = el.dataset.pza.split("|");
    const a = zona(m.rasc, k).add.find((x) => x.id === id); if (a) a[campo] = el.value; }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && E.pilha.length) { fechar(); return; }
  if (e.key === "Enter" && e.target.id === "ed-sku" && !e.shiftKey) { e.preventDefault(); ACOES["ed-sku-add"](); return; }
  if ((e.key === "Enter" || e.key === " ") && e.target.matches("tr[data-a]")) { e.preventDefault(); e.target.click(); }
});

render();
