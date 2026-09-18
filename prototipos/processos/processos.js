/* ===========================================================================
   AMOSTRA · Processos / Como fazer — construtor genérico de instruções
   ---------------------------------------------------------------------------
   Prova de conceito. Dados fictícios, só na memória desta aba: recarregar
   volta aos exemplos. Não fala com o servidor e não lê nem escreve produto,
   estoque, insumo, pedido, OP, demanda ou remessa. O SKU de insumo é texto de
   referência: diz QUAL material usar, não movimenta nada.

   NADA AQUI SABE O QUE É "FITA", "CHUCA" OU "BANDANA". Os nomes de processo,
   campo, opção e classificação são DADOS que a administradora cria. O código
   só conhece os TIPOS DE CAMPO abaixo.

   O MODELO
     Classificação   { nome, valores[] }                  ex.: Setor, Fornecedor
     Tipo de processo{ nome, classes, campos[] }          o formulário, montado por ela
       Campo         { nome, tipo, unidade, obrigatorio, opcoes[] | listaId, rotulo, campos[] }
     Lista de opções { nome, opcoes[] }                   compartilhada entre campos: editar a
                                                          lista muda o que TODOS esses campos oferecem
     Padrão          { nome, tipoId, classes, valores }   uma configuração salva
     Configuração    { sku, tipoId, valores, padraoId, base }
       Aplicar um padrão COPIA os valores para o produto. Depois disso cada
       configuração só muda por ela mesma: editar A não toca B nem o padrão, e
       editar o padrão não toca nenhum produto (isso é decisão futura).
   =========================================================================== */

IC.processos = '<path d="M4 6h10M4 12h16M4 18h7"/><circle cx="17" cy="6" r="2.2"/><circle cx="14" cy="18" r="2.2"/>';

const skuN = (x) => String(x == null ? "" : x).trim().toUpperCase(); /* a mesma regra de produtos/identidade.js */
let _seq = 0;
const novoId = (p) => `${p}${Date.now().toString(36)}${(++_seq).toString(36)}`;
const copia = (x) => JSON.parse(JSON.stringify(x));
const fdata = (iso) => { const d = new Date(iso); return isNaN(d) ? "—" : d.toLocaleDateString("pt-BR"); };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/* ---------- os tipos de campo: a ÚNICA coisa que o código conhece ---------- */
/* `ic` e `ex` só servem à grade de escolha do construtor: dizem, de relance, para que o tipo serve */
const TIPOS_CAMPO = [
  { k: "texto", nome: "Texto", ic: "Aa", ex: "Número da fita, molde" },
  { k: "numero", nome: "Número", un: "", ic: "123", ex: "Voltas, pontos" },
  { k: "medida", nome: "Medida", un: "cm", ic: "↔", ex: "Comprimento, largura" },
  { k: "quantidade", nome: "Quantidade", un: "un", ic: "×", ex: "Peças por pacote" },
  { k: "selecao", nome: "Seleção única", op: true, ic: "◉", ex: "Ângulo de corte" },
  { k: "multipla", nome: "Seleção múltipla", op: true, ic: "☑", ex: "Etiquetas" },
  { k: "simnao", nome: "Sim / não", ic: "S/N", ex: "Usa cola quente?" },
  { k: "longo", nome: "Observação longa", ic: "¶", ex: "Observação geral" },
  { k: "sku", nome: "SKU de insumo", ic: "SKU", ex: "Qual elástico usar" },
  { k: "passos", nome: "Passo a passo", soRaiz: true, ic: "1·2·3", ex: "A ordem do trabalho" },
  { k: "grupo", nome: "Grupo repetível", soRaiz: true, ic: "⧉", ex: "Várias fitas, vários insumos" },
];
const TC = Object.fromEntries(TIPOS_CAMPO.map((t) => [t.k, t]));
const NUMERICOS = ["numero", "medida", "quantidade"];
const UNIDADES = ["cm", "mm", "m", "un", "g", "par", "folhas", "voltas"];

/* ---------- dados fictícios ---------- */
const V = (id, nome) => ({ id, nome });
const C = (id, nome, tipo, x = {}) => ({ id, nome, tipo, obrigatorio: false, ...(TC[tipo].un != null ? { unidade: TC[tipo].un } : {}), ...x });
const O = (p, ...nomes) => nomes.map((nome, i) => ({ id: `${p}-${i + 1}`, nome }));
const G = (id, v) => ({ id, v });
const S = (id, t) => ({ id, t });

const PRODUTOS = [
  { sku: "BAN-XAD-P", descricao: "Bandana Xadrez P", categoria: "Bandana" },
  { sku: "BAN-XAD-M", descricao: "Bandana Xadrez M", categoria: "Bandana" },
  { sku: "COL-NYL-M", descricao: "Coleira Nylon M", categoria: "Coleira" },
  { sku: "CHU-LAC-RS", descricao: "Chuca Laço P Rosa", categoria: "Chuca" },
  { sku: "CHU-LAC-AZ", descricao: "Chuca Laço P Azul", categoria: "Chuca" },
];
const INSUMOS = [
  { sku: "INS-FIT-09", nome: "Fita gorgurão nº 9" }, { sku: "INS-FIT-01", nome: "Fitilho cetim 7 mm" },
  { sku: "INS-FIT-25", nome: "Fita nylon 25 mm" }, { sku: "INS-ELA-02", nome: "Elástico roliço 2 mm" },
  { sku: "INS-ELA-03", nome: "Elástico roliço 3 mm" }, { sku: "INS-CRI-04", nome: "Cristal acrílico 4 mm" },
  { sku: "INS-PER-06", nome: "Pérola 6 mm" }, { sku: "INS-TRI-150", nome: "Tricoline 100% algodão 1,50 m" },
];
const produtoDe = (sku) => PRODUTOS.find((p) => p.sku === skuN(sku)) || null;
const insumoDe = (sku) => INSUMOS.find((i) => i.sku === skuN(sku)) || null;

const E = {
  aba: "processos", sub: "tipos", busca: "", fc: {}, buscaProd: "",
  pilha: [], foco: null,
  listas: [
    { id: "ls-est", nome: "Tipos de estampa", opcoes: O("est", "Premium", "Digital", "Rotativa", "Macho", "Fêmea", "Neutro") },
    { id: "ls-ang", nome: "Ângulos de corte", opcoes: O("ang", "Reto", "45 graus", "Biqueira") },
  ],
  classes: [
    { id: "cl-setor", nome: "Setor", valores: [V("s-corte", "Corte"), V("s-fitas", "Fitas"), V("s-acab", "Acabamento"), V("s-mont", "Montagem"), V("s-exp", "Expedição")] },
    { id: "cl-prod", nome: "Tipo de produto", valores: [V("tp-band", "Bandana"), V("tp-col", "Coleira"), V("tp-chu", "Chuca")] },
    { id: "cl-forn", nome: "Fornecedor", valores: [V("f-aur", "Tecelagem Aurora"), V("f-fb", "Fitas Brasil")] },
    { id: "cl-est", nome: "Tipo de estampa", valores: [V("e-dig", "Digital"), V("e-rot", "Rotativa")] },
  ],
  tipos: [
    { id: "tp-fitas", nome: "Fitas", descricao: "Corte e preparo das fitas do produto.", classes: { "cl-setor": ["s-fitas"] }, campos: [
      C("f-fitas", "Fitas", "grupo", { rotulo: "Fita", obrigatorio: true, campos: [
        C("f-num", "Número/tipo da fita", "texto", { obrigatorio: true }), C("f-sku", "Código/SKU da fita", "sku"),
        C("f-comp", "Comprimento", "medida", { unidade: "cm", obrigatorio: true }),
        C("f-est", "Tipo de estampa", "selecao", { listaId: "ls-est" }),
        C("f-ang", "Ângulo de corte", "selecao", { listaId: "ls-ang" }),
        C("f-obs", "Observação", "texto")] }),
      C("f-passos", "Passo a passo", "passos"), C("f-geral", "Observação geral", "longo")] },
    { id: "tp-acab", nome: "Acabamento", descricao: "Aplicações e acabamento final.", classes: { "cl-setor": ["s-acab"] }, campos: [
      C("a-tipo", "Tipo de acabamento", "selecao", { obrigatorio: true, opcoes: O("a-tipo", "Laço", "Aplique", "Bordado", "Sem acabamento") }),
      C("a-apl", "Aplicações", "grupo", { rotulo: "Aplicação", campos: [
        C("a-mat", "Material", "selecao", { opcoes: O("a-mat", "Fita", "Cristal", "Pérola", "Botão") }), C("a-sku", "SKU do insumo", "sku"),
        C("a-qtd", "Quantidade", "quantidade", { unidade: "un" }), C("a-tam", "Tamanho", "medida", { unidade: "mm" }), C("a-esp", "Especificação", "texto")] }),
      C("a-cola", "Usa cola quente", "simnao"), C("a-passos", "Passo a passo", "passos")] },
    { id: "tp-chuca", nome: "Montagem de chuca", descricao: "Insumos e travas da chuca.", classes: { "cl-setor": ["s-mont"], "cl-prod": ["tp-chu"] }, campos: [
      C("c-ins", "Insumos", "grupo", { rotulo: "Insumo", obrigatorio: true, campos: [
        C("c-sku", "SKU do insumo", "sku"), C("c-nome", "Nome", "texto", { obrigatorio: true }),
        C("c-qtd", "Quantidade de referência", "quantidade", { unidade: "un" }), C("c-tam", "Tamanho", "medida", { unidade: "cm" }), C("c-obs", "Observação", "texto")] }),
      C("c-trv", "Trava-elástico", "grupo", { rotulo: "Trava", campos: [
        C("t-tipo", "Tipo", "selecao", { opcoes: O("t-tipo", "Redondo", "Bolinha", "Mola") }), C("t-tam", "Tamanho", "medida", { unidade: "mm" }),
        C("t-qtd", "Quantidade", "quantidade", { unidade: "un" }), C("t-esp", "Especificações", "texto")] }),
      C("c-passos", "Passo a passo", "passos")] },
    { id: "tp-corte", nome: "Corte", descricao: "Enfesto e corte a partir do molde.", classes: { "cl-setor": ["s-corte"] }, campos: [
      C("k-molde", "Molde", "texto", { obrigatorio: true }), C("k-tecido", "Tecido (SKU)", "sku"),
      C("k-fio", "Fio do tecido", "selecao", { opcoes: O("k-fio", "Reto", "Viés") }),
      C("k-folhas", "Folhas por enfesto", "quantidade", { unidade: "folhas" }), C("k-final", "Medida final", "medida", { unidade: "cm" }),
      C("k-passos", "Passo a passo", "passos")] },
    { id: "tp-emb", nome: "Embalagem", descricao: "Como embalar para a loja.", classes: { "cl-setor": ["s-exp"] }, campos: [
      C("e-emb", "Embalagem", "selecao", { obrigatorio: true, opcoes: O("e-emb", "Saquinho", "Cartela", "Caixa") }),
      C("e-un", "Unidades por embalagem", "quantidade", { unidade: "un" }),
      C("e-etq", "Etiquetas", "multipla", { opcoes: O("e-etq", "Preço", "Composição", "Marca", "Lote") }),
      C("e-passos", "Passo a passo", "passos")] },
  ],
  padroes: [
    { id: "pd-chuca-p", nome: "Chuca P", tipoId: "tp-chuca", classes: { "cl-prod": ["tp-chu"] }, atualizadoEm: "2026-09-12T10:00:00", valores: {
      "c-ins": [G("i1", { "c-sku": "INS-ELA-02", "c-nome": "Elástico roliço 2 mm", "c-qtd": "1", "c-tam": "12" })],
      "c-trv": [G("t1", { "t-tipo": "t-tipo-1", "t-tam": "6", "t-qtd": "1" })],
      "c-passos": [S("s1", "Passar o elástico pela trava."), S("s2", "Dar dois nós e esconder a ponta."), S("s3", "Testar abrindo e fechando.")] } },
    { id: "pd-fitas-laco", nome: "Fitas · laço de bandana", tipoId: "tp-fitas", classes: { "cl-prod": ["tp-band"], "cl-forn": ["f-fb"] }, atualizadoEm: "2026-09-08T10:00:00", valores: {
      "f-fitas": [G("fa", { "f-num": "nº 9", "f-sku": "INS-FIT-09", "f-comp": "32", "f-est": "est-1", "f-ang": "ang-2" }),
        G("fb", { "f-num": "fitilho", "f-sku": "INS-FIT-01", "f-comp": "18", "f-est": "est-6", "f-ang": "ang-1" })],
      "f-passos": [S("s1", "Medir e marcar com giz."), S("s2", "Cortar no ângulo indicado."), S("s3", "Selar a ponta com isqueiro.")] } },
    { id: "pd-corte-bp", nome: "Corte bandana P", tipoId: "tp-corte", classes: { "cl-prod": ["tp-band"], "cl-forn": ["f-aur"] }, atualizadoEm: "2026-09-05T10:00:00", valores: {
      "k-molde": "Bandana P", "k-tecido": "INS-TRI-150", "k-fio": "k-fio-2", "k-folhas": "12", "k-final": "35",
      "k-passos": [S("s1", "Passar o tecido."), S("s2", "Enfestar no viés."), S("s3", "Cortar com a faca elétrica.")] } },
  ],
  configs: [],
};
/* configurações de exemplo: nascem pelo MESMO caminho que a tela usa */
function semear() {
  const ban = "BAN-XAD-P";
  aplicarPadrao("pd-corte-bp", ban); aplicarPadrao("pd-fitas-laco", ban);
  E.configs.push({ id: novoId("cf"), sku: ban, tipoId: "tp-acab", titulo: "", padraoId: null, criadoEm: "2026-09-14T10:00:00", valores: {
    "a-tipo": "a-tipo-1", "a-cola": true,
    "a-apl": [G("x1", { "a-mat": "a-mat-2", "a-sku": "INS-CRI-04", "a-qtd": "3", "a-tam": "4", "a-esp": "no centro do laço" }),
      G("x2", { "a-mat": "a-mat-3", "a-sku": "INS-PER-06", "a-qtd": "1", "a-tam": "6" })],
    "a-passos": [S("s1", "Montar o laço com as duas fitas."), S("s2", "Colar os cristais em linha."), S("s3", "Esperar 5 minutos antes de embalar.")] } });
  E.configs.push({ id: novoId("cf"), sku: ban, tipoId: "tp-emb", titulo: "", padraoId: null, criadoEm: "2026-09-14T10:00:00", valores: {
    "e-emb": "e-emb-1", "e-un": "1", "e-etq": ["e-etq-1", "e-etq-3"], "e-passos": [S("s1", "Dobrar em triângulo."), S("s2", "Colocar no saquinho e lacrar.")] } });
  E.configs.push({ id: novoId("cf"), sku: "COL-NYL-M", tipoId: "tp-fitas", titulo: "", padraoId: null, criadoEm: "2026-09-14T10:00:00", valores: {
    "f-fitas": [G("c1", { "f-num": "nylon 25 mm", "f-sku": "INS-FIT-25", "f-comp": "45", "f-ang": "ang-1", "f-obs": "selar as duas pontas" })] } });
  aplicarPadrao("pd-chuca-p", "CHU-LAC-RS");
}

const tipoPorId = (id) => E.tipos.find((t) => t.id === id) || null;
const padraoPorId = (id) => E.padroes.find((p) => p.id === id) || null;
const configPorId = (id) => E.configs.find((c) => c.id === id) || null;
const configsDe = (sku) => E.configs.filter((c) => c.sku === sku);
const valorClasse = (cid, vid) => E.classes.find((c) => c.id === cid)?.valores.find((v) => v.id === vid) || null;

/* ---------- valores ---------- */
function ehVazio(c, v) {
  if (c.tipo === "grupo") return !(v || []).some((it) => c.campos.some((s) => !ehVazio(s, it.v[s.id])));
  if (c.tipo === "passos") return !(v || []).some((s) => String(s.t || "").trim());
  if (c.tipo === "multipla") return !(v || []).length;
  if (c.tipo === "simnao") return v !== true && v !== false;
  return !String(v ?? "").trim();
}
const listaPorId = (id) => E.listas.find((l) => l.id === id) || null;
/* própria do campo OU da lista compartilhada: todo lugar que mostra opção passa por aqui */
const opcoesDe = (c) => (c.listaId ? listaPorId(c.listaId)?.opcoes : c.opcoes) || [];
const nomeOpcao = (c, oid) => opcoesDe(c).find((o) => o.id === oid)?.nome ?? "(opção excluída)";
function fmt(c, v) {
  if (c.tipo === "selecao") return esc(nomeOpcao(c, v));
  if (c.tipo === "multipla") return esc(v.map((o) => nomeOpcao(c, o)).join(", "));
  if (c.tipo === "simnao") return v ? "Sim" : "Não";
  if (NUMERICOS.includes(c.tipo)) return `<b>${esc(v)}</b>${c.unidade ? ` ${esc(c.unidade)}` : ""}`;
  if (c.tipo === "sku") { const i = insumoDe(v); return `<span class="mono">${esc(skuN(v))}</span>${i ? ` <span class="pf-ins">${esc(i.nome)}</span>` : ""}`; }
  return esc(v);
}
/* a comparação que decide "personalizado": sem vazios e com as chaves em ordem */
function limpo(x) {
  if (Array.isArray(x)) { const l = x.map(limpo).filter((y) => y !== undefined); return l.length ? l : undefined; }
  if (x && typeof x === "object") {
    const o = {}; for (const k of Object.keys(x).sort()) { const y = limpo(x[k]); if (y !== undefined) o[k] = y; }
    return Object.keys(o).length ? o : undefined;
  }
  return x === "" || x == null ? undefined : x;
}
const canon = (v) => JSON.stringify(limpo(v) ?? {});
function faltas(tipo, vals) {
  const f = [];
  const num = (c, v, onde) => { if (NUMERICOS.includes(c.tipo) && String(v ?? "").trim() && isNaN(Number(String(v).replace(",", "."))))
    f.push(`${onde}${c.nome}: não é um número`); };
  for (const c of tipo.campos) {
    const v = vals[c.id];
    if (c.obrigatorio && ehVazio(c, v)) f.push(c.nome);
    if (c.tipo === "grupo") (v || []).forEach((it, i) => {
      if (c.campos.every((s) => ehVazio(s, it.v[s.id]))) return;
      for (const s of c.campos) { if (s.obrigatorio && ehVazio(s, it.v[s.id])) f.push(`${c.rotulo || "Item"} ${i + 1} · ${s.nome}`); num(s, it.v[s.id], `${c.rotulo || "Item"} ${i + 1} · `); }
    });
    else num(c, v, "");
  }
  return f;
}
/* salvar tira item de grupo em branco e passo vazio */
function enxugar(tipo, vals) {
  for (const c of tipo.campos) {
    if (c.tipo === "grupo" && vals[c.id]) vals[c.id] = vals[c.id].filter((it) => c.campos.some((s) => !ehVazio(s, it.v[s.id])));
    if (c.tipo === "passos" && vals[c.id]) vals[c.id] = vals[c.id].filter((s) => String(s.t || "").trim());
  }
  return vals;
}
function refGet(vals, ref) {
  const [cid, item, sid] = ref.split("|");
  if (!item) return vals[cid];
  return (vals[cid] || []).find((x) => x.id === item)?.v[sid];
}
function refSet(vals, ref, v) {
  const [cid, item, sid] = ref.split("|");
  if (!item) { vals[cid] = v; return; }
  const it = (vals[cid] || []).find((x) => x.id === item); if (it) it.v[sid] = v;
}

/* ---------- aplicar padrão = copiar ---------- */
function aplicarPadrao(padraoId, sku) {
  const pd = padraoPorId(padraoId);
  const valores = copia(pd.valores);
  /* `baseValores` é o retrato do padrão NO DIA em que foi aplicado: serve para mostrar, campo a
     campo, o que este produto mudou — e para "voltar ao padrão" num campo só. Não é sincronização:
     o padrão editado depois não chega aqui. */
  const cfg = { id: novoId("cf"), sku, tipoId: pd.tipoId, titulo: "", padraoId: pd.id, padraoNome: pd.nome,
    aplicadoEm: new Date().toISOString(), base: canon(valores), baseValores: copia(valores), valores };
  E.configs.push(cfg);
  return cfg;
}
function origemCfg(cfg) {
  if (!cfg.padraoId) return `<span class="tag neutro">montado neste produto</span>`;
  const pd = padraoPorId(cfg.padraoId);
  const mexido = canon(cfg.valores) !== cfg.base;
  return `<span class="tag acao" title="Aplicado em ${fdata(cfg.aplicadoEm)}. É uma cópia: o padrão continua separado.">do padrão ${esc(cfg.padraoNome)}</span>`
    + (mexido ? ` <span class="tag amber">personalizado neste produto</span>` : ` <span class="tag">igual ao aplicado</span>`)
    + (pd && pd.atualizadoEm > cfg.aplicadoEm ? ` <span class="tag neutro" title="O padrão foi editado depois de aplicado. Este produto não mudou.">padrão editado depois</span>` : "")
    + (!pd ? ` <span class="tag neutro">padrão excluído</span>` : "");
}
/* onde um campo/opção está em uso: para avisar ANTES de apagar */
function portadores(tipoId) { return [...E.padroes, ...E.configs].filter((x) => x.tipoId === tipoId); }
function usoCampo(tipoId, g, campo) {
  return portadores(tipoId).filter((x) => g
    ? (x.valores[g] || []).some((it) => !ehVazio(campo, it.v[campo.id]))
    : !ehVazio(campo, x.valores[campo.id])).length;
}
function usoOpcao(tipoId, g, cid, oid) {
  const tem = (v) => v === oid || (Array.isArray(v) && v.includes(oid));
  return portadores(tipoId).filter((x) => g ? (x.valores[g] || []).some((it) => tem(it.v[cid])) : tem(x.valores[cid])).length;
}

/* todos os campos (raiz e dentro de grupo) que usam uma lista */
function camposDaLista(listaId) {
  const r = [];
  for (const t of E.tipos) for (const c of t.campos) {
    if (c.listaId === listaId) r.push({ t, g: "", c });
    for (const s of c.campos || []) if (s.listaId === listaId) r.push({ t, g: c.id, c: s });
  }
  return r;
}
const usoOpcaoLista = (listaId, oid) => camposDaLista(listaId).reduce((n, x) => n + usoOpcao(x.t.id, x.g, x.c.id, oid), 0);
/* opções próprias do campo que já foram escolhidas em algum padrão/produto */
const usoOpcoesProprias = (tipoId, g, c) => (c.opcoes || []).reduce((n, o) => n + usoOpcao(tipoId, g, c.id, o.id), 0);

/* ---------- toasts ---------- */
/* `prox` = o próximo passo natural, como botão: {rotulo, a, ...data} */
function toast(msg, prox) {
  const el = document.createElement("div");
  el.className = "toast pc-toast"; el.textContent = msg;
  if (prox) {
    const b = document.createElement("button");
    b.className = "btn sm"; b.textContent = prox.rotulo;
    for (const [k, v] of Object.entries(prox)) if (k !== "rotulo") b.dataset[k] = v;
    b.addEventListener("click", () => el.remove());
    el.appendChild(b);
  }
  document.getElementById("toasts").appendChild(el); setTimeout(() => el.remove(), prox ? 7000 : 4500);
}

/* ======================= CLASSIFICAÇÕES (tags e chips) ======================= */
function tagsClasses(classes) {
  return E.classes.flatMap((cl) => (classes?.[cl.id] || []).map((vid) => valorClasse(cl.id, vid))
    .filter(Boolean).map((v) => `<span class="tag" title="${esc(cl.nome)}">${esc(v.nome)}</span>`)).join(" ");
}
function chipsClasses(classes) {
  return `<div class="pc-cls">${E.classes.map((cl) => `<div class="pc-cl"><span class="pc-cl-n">${esc(cl.nome)}</span>
    ${cl.valores.map((v) => `<button class="chip ${(classes[cl.id] || []).includes(v.id) ? "on" : ""}" data-a="cl-tg" data-c="${cl.id}" data-v="${v.id}">${esc(v.nome)}</button>`).join("")}</div>`).join("")}
    <div class="hint">Classificações e valores são seus: crie e edite em Processos › Classificações.</div></div>`;
}
function casaFiltro(classes, extra) {
  for (const [cid, vid] of Object.entries(E.fc)) {
    if (!vid) continue;
    if (!(classes?.[cid] || []).includes(vid) && !(extra?.[cid] || []).includes(vid)) return false;
  }
  return true;
}

/* ======================= TELA · PROCESSOS ======================= */
function viewProcessos() {
  const q = E.busca.trim().toLowerCase();
  const subs = [["tipos", "Tipos de processo", E.tipos.length], ["padroes", "Padrões", E.padroes.length], ["listas", "Listas de opções", E.listas.length], ["classes", "Classificações", E.classes.length]];
  const barra = `<div class="pc-subs">${subs.map(([k, n, c]) => `<button class="chip ${E.sub === k ? "on" : ""}" data-a="sub" data-v="${k}">${n} <b>${c}</b></button>`).join("")}</div>`;
  const filtros = E.sub === "classes" || E.sub === "listas" ? "" : `<div class="filters">
    <div class="search">${svg(IC.busca)}<input class="inp" id="q-proc" style="width:240px" placeholder="Buscar" value="${esc(E.busca)}" aria-label="Buscar"></div>
    ${E.classes.map((cl) => `<select class="sel" data-fc="${cl.id}" aria-label="${esc(cl.nome)}"><option value="">${esc(cl.nome)}: todos</option>
      ${cl.valores.map((v) => `<option value="${v.id}" ${E.fc[cl.id] === v.id ? "selected" : ""}>${esc(v.nome)}</option>`).join("")}</select>`).join("")}
    <span style="margin-left:auto"></span>
    ${E.sub === "tipos" ? `<button class="btn primary sm" data-a="tipo-novo">${svg(IC.mais)}Novo tipo de processo</button>`
      : `<button class="btn primary sm" data-a="padrao-novo">${svg(IC.mais)}Novo padrão</button>`}</div>`;

  let corpo = "";
  if (E.sub === "tipos") {
    const l = E.tipos.filter((t) => casaFiltro(t.classes) && (!q || `${t.nome} ${t.descricao} ${t.campos.map((c) => c.nome + " " + (c.campos || []).map((s) => s.nome).join(" ")).join(" ")}`.toLowerCase().includes(q)));
    corpo = l.length ? `<div class="tw"><table class="t pc-tab"><thead><tr><th>Processo</th><th>Classificação</th><th>Campos</th><th>Padrões</th><th>Produtos</th></tr></thead><tbody>
      ${l.map((t) => { const nProd = new Set(E.configs.filter((c) => c.tipoId === t.id).map((c) => c.sku)).size;
        return `<tr class="pc-lin" data-a="tipo-editar" data-id="${t.id}" tabindex="0"><td><b>${esc(t.nome)}</b><div class="hint">${esc(t.descricao || "")}</div></td>
        <td>${tagsClasses(t.classes) || `<span class="hint">—</span>`}</td>
        <td class="pc-campos-res">${t.campos.map((c) => `<span class="pc-cp t-${c.tipo}">${esc(c.nome)}${c.tipo === "grupo" ? ` <i>× ${plural(c.campos.length, "campo", "campos")}</i>` : ""}</span>`).join("")}</td>
        <td>${E.padroes.filter((p) => p.tipoId === t.id).length}</td><td>${nProd}</td></tr>`; }).join("")}</tbody></table></div>` : vazio("Nenhum tipo de processo com esses filtros.");
  } else if (E.sub === "padroes") {
    const l = E.padroes.filter((p) => casaFiltro(p.classes, tipoPorId(p.tipoId)?.classes) && (!q || `${p.nome} ${tipoPorId(p.tipoId)?.nome}`.toLowerCase().includes(q)));
    corpo = l.length ? `<div class="tw"><table class="t pc-tab"><thead><tr><th>Padrão</th><th>Processo</th><th>Classificação</th><th>O que tem</th><th>Aplicado em</th><th></th></tr></thead><tbody>
      ${l.map((p) => { const t = tipoPorId(p.tipoId); const skus = [...new Set(E.configs.filter((c) => c.padraoId === p.id).map((c) => c.sku))];
        return `<tr class="pc-lin" data-a="padrao-editar" data-id="${p.id}" tabindex="0"><td><b>${esc(p.nome)}</b><div class="hint">atualizado em ${fdata(p.atualizadoEm)}</div></td>
        <td>${esc(t?.nome || "—")}</td><td>${tagsClasses(p.classes) || `<span class="hint">—</span>`}</td>
        <td class="hint">${resumo(t, p.valores)}</td>
        <td>${skus.length ? skus.map((s) => `<span class="tag mono">${esc(s)}</span>`).join(" ") : `<span class="hint">nenhum produto</span>`}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-a="aplicar" data-id="${p.id}">Aplicar a produtos</button></td></tr>`; }).join("")}</tbody></table></div>` : vazio("Nenhum padrão com esses filtros.");
  } else corpo = E.sub === "listas" ? viewListas() : viewClasses();

  /* o caminho inteiro em três passos, cada um com o botão que o começa */
  const nProd = new Set(E.configs.map((c) => c.sku)).size;
  const guia = `<div class="pc-guia">
    <button class="pc-passo-g" data-a="tipo-novo"><span class="pc-g-n">1</span><span><b>Monte o processo</b>
      <small>os campos que a equipe preenche · ${plural(E.tipos.length, "processo", "processos")}</small></span></button>
    <button class="pc-passo-g" data-a="padrao-novo"><span class="pc-g-n">2</span><span><b>Salve um padrão</b>
      <small>a configuração que se repete · ${plural(E.padroes.length, "padrão", "padrões")}</small></span></button>
    <button class="pc-passo-g" data-a="aba" data-v="produtos"><span class="pc-g-n">3</span><span><b>Aplique no produto</b>
      <small>cada produto fica com a própria cópia · ${plural(nProd, "produto", "produtos")}</small></span></button>
  </div>`;
  return `${guia}
  ${barra}
  <div class="card">${filtros}${corpo}</div>`;
}
function resumo(t, vals) {
  if (!t) return "";
  const p = t.campos.filter((c) => !ehVazio(c, vals[c.id])).map((c) => c.tipo === "grupo" ? `${esc(c.nome)}: ${enxugar(t, copia(vals))[c.id].length}`
    : c.tipo === "passos" ? plural(vals[c.id].filter((s) => s.t.trim()).length, "passo", "passos")
    : c.tipo === "longo" ? esc(c.nome) : `${esc(c.nome)}: ${fmt(c, vals[c.id]).replace(/<[^>]+>/g, "")}`);
  return p.slice(0, 4).join(" · ") + (p.length > 4 ? " …" : "");
}
const vazio = (msg) => `<div class="empty" style="padding:40px"><div class="ic">${svg(IC.processos)}</div><h3>${msg}</h3></div>`;

function viewListas() {
  return `<div class="pc-clgrade">${E.listas.map((l) => {
    const usam = camposDaLista(l.id);
    return `<div class="pc-clcard"><div class="pc-clcard-h"><input class="inp" data-lsn="${l.id}" value="${esc(l.nome)}" aria-label="Nome da lista">
      <button class="btn sm ghost so-icone" data-a="ls-del" data-l="${l.id}" title="Excluir lista" aria-label="Excluir lista">${svg(IC.lixeira)}</button></div>
      <div class="hint" style="margin:-4px 0 8px">${usam.length ? `Usada em ${usam.map((x) => `<b>${esc(x.t.nome)} › ${esc(x.c.nome)}</b>`).join(", ")}` : "Nenhum campo usa esta lista ainda."}</div>
      <div class="bc-ops" style="margin:0">${l.opcoes.map((o, j) => `<span class="bc-op"><input class="inp" data-lso="${l.id}|${o.id}" value="${esc(o.nome)}" aria-label="Opção">
        <button data-a="lso-mv" data-l="${l.id}" data-o="${o.id}" data-d="-1" ${j ? "" : "disabled"} aria-label="Mover para a esquerda">‹</button>
        <button data-a="lso-mv" data-l="${l.id}" data-o="${o.id}" data-d="1" ${j < l.opcoes.length - 1 ? "" : "disabled"} aria-label="Mover para a direita">›</button>
        <button data-a="lso-del" data-l="${l.id}" data-o="${o.id}" aria-label="Excluir ${esc(o.nome)}">×</button></span>`).join("")}
        <span class="bc-op nova"><input class="inp" id="lso-novo-${l.id}" placeholder="Nova opção" data-enter="lso-add" data-l="${l.id}"><button data-a="lso-add" data-l="${l.id}" aria-label="Adicionar">+</button></span></div></div>`; }).join("")}
    <div class="pc-clcard nova"><div class="hint" style="margin-bottom:8px">Uma lista serve a vários campos. Mudar a lista muda as opções de todos eles — só no formulário: nada mais é alterado.</div>
      <div class="pc-lin-add"><input class="inp" id="ls-novo" placeholder="Nova lista de opções" data-enter="ls-add"><button class="btn sm" data-a="ls-add">${svg(IC.mais)}Criar</button></div></div>
  </div>`;
}
function viewClasses() {
  return `<div class="pc-clgrade">${E.classes.map((cl) => {
    const uso = [...E.tipos, ...E.padroes].filter((x) => (x.classes?.[cl.id] || []).length).length;
    return `<div class="pc-clcard"><div class="pc-clcard-h"><input class="inp" data-cln="${cl.id}" value="${esc(cl.nome)}" aria-label="Nome da classificação">
      <span class="hint">${plural(uso, "uso", "usos")}</span>
      <button class="btn sm ghost so-icone" data-a="cl-del" data-c="${cl.id}" title="Excluir classificação" aria-label="Excluir classificação">${svg(IC.lixeira)}</button></div>
      <div class="bc-ops">${cl.valores.map((v) => `<span class="bc-op"><input class="inp" data-clv="${cl.id}|${v.id}" value="${esc(v.nome)}" aria-label="Valor">
        <button data-a="clv-del" data-c="${cl.id}" data-v="${v.id}" aria-label="Excluir ${esc(v.nome)}">×</button></span>`).join("")}
        <span class="bc-op nova"><input class="inp" id="clv-novo-${cl.id}" placeholder="Novo valor" data-enter="clv-add" data-c="${cl.id}"><button data-a="clv-add" data-c="${cl.id}" aria-label="Adicionar">+</button></span></div></div>`; }).join("")}
    <div class="pc-clcard nova"><div class="hint" style="margin-bottom:8px">Qualquer forma de organizar: setor, fornecedor, tipo de produto, tipo de estampa…</div>
      <div class="pc-lin-add"><input class="inp" id="cl-novo" placeholder="Nova classificação" data-enter="cl-add"><button class="btn sm" data-a="cl-add">${svg(IC.mais)}Criar</button></div></div>
  </div>`;
}

/* ======================= TELA · PRODUTOS (simulada) ======================= */
function viewProdutos() {
  const q = E.buscaProd.trim().toLowerCase();
  const lista = PRODUTOS.filter((p) => !q || `${p.sku} ${p.descricao} ${p.categoria}`.toLowerCase().includes(q));
  return `<div class="aviso" style="margin-bottom:12px">Tela de Produtos <b>simulada</b>, só para mostrar a seção nova <b>Processos / como fazer</b>. O cadastro do produto aparece só para leitura.</div>
  <div class="card"><div class="filters"><div class="search">${svg(IC.busca)}<input class="inp" id="q-prod" style="width:240px" placeholder="Buscar SKU ou descrição" value="${esc(E.buscaProd)}" aria-label="Buscar produto"></div></div>
    <div class="tw"><table class="t pc-tab"><thead><tr><th>SKU</th><th>Descrição</th><th>Categoria</th><th>Processos</th><th></th></tr></thead><tbody>
    ${lista.map((p) => { const cs = configsDe(p.sku);
      return `<tr class="pc-lin" data-a="produto" data-sku="${p.sku}" tabindex="0"><td class="mono"><b>${esc(p.sku)}</b></td><td>${esc(p.descricao)}</td><td>${esc(p.categoria)}</td>
      <td>${cs.length ? cs.map((c) => `<span class="tag ${c.padraoId && canon(c.valores) !== c.base ? "amber" : ""}">${esc(tipoPorId(c.tipoId)?.nome || "?")}${c.titulo ? ` · ${esc(c.titulo)}` : ""}</span>`).join(" ") : `<span class="hint">nenhum</span>`}</td>
      <td style="text-align:right">${cs.length ? `<button class="btn sm primary" data-a="bancada" data-sku="${p.sku}" title="Abrir as instruções em tela cheia">${svg(IC.olho)}Como fazer</button>` : ""}</td></tr>`; }).join("")}
    </tbody></table></div></div>`;
}

/* ======================= FORMULÁRIO DINÂMICO (padrão e produto) ======================= */
/* Na edição de UM produto que veio de padrão, BASE é o retrato do padrão aplicado.
   Cada campo diferente dele ganha a marca "alterado neste produto" e um "voltar ao padrão"
   só daquele campo. Fora disso (padrão, prévia, produto montado à mão) BASE é null. */
let BASE = null;
const tirarTags = (h) => String(h).replace(/<[^>]+>/g, "");
function marcaDif(c, vals, ref) {
  if (!BASE) return "";
  const [cid, item] = ref.split("|");
  if (item && !(BASE[cid] || []).some((x) => x.id === item)) return "";   /* item novo: a marca é do item */
  const antes = refGet(BASE, ref), agora = refGet(vals, ref);
  if (canon(antes) === canon(agora)) return "";
  const era = ehVazio(c, antes) ? "vazio" : c.tipo === "passos" ? plural(antes.length, "passo", "passos") : tirarTags(fmt(c, antes));
  return `<span class="pc-dif" title="No padrão aplicado: ${esc(era)}">alterado neste produto
    <button type="button" data-a="vp-reset" data-ref="${ref}" title="Voltar ao valor do padrão aplicado: ${esc(era)}">↺ padrão</button></span>`;
}
/* sugestões de insumo: por SKU OU por nome, sem acento e sem caixa */
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function sugestoes(q, ref) {
  const k = semAcento(q).trim();
  const l = INSUMOS.filter((i) => !k || semAcento(`${i.sku} ${i.nome}`).includes(k)).slice(0, 6);
  return l.length ? l.map((i) => `<button type="button" data-a="ins-pick" data-ref="${ref}" data-sku="${i.sku}"><b class="mono">${esc(i.sku)}</b> ${esc(i.nome)}</button>`).join("")
    : `<div class="hint" style="padding:6px 10px">Nenhum insumo com “${esc(q)}”. O SKU fica como digitado.</div>`;
}
function campoForm(c, vals, ref) {
  const v = refGet(vals, ref);
  const rot = `${esc(c.nome)}${c.obrigatorio ? ` <b class="pc-ob" title="obrigatório">*</b>` : ""}${c.tipo === "grupo" ? "" : marcaDif(c, vals, ref)}`;
  const un = c.unidade ? `<span class="pc-un">${esc(c.unidade)}</span>` : "";
  switch (c.tipo) {
    case "grupo": {
      const itens = vals[c.id] || [];
      const daBase = BASE ? (BASE[c.id] || []) : [];
      const removidos = daBase.filter((b) => !itens.some((it) => it.id === b.id)).length;
      return `<div class="pc-bloco pc-grupo"><div class="pc-bloco-h"><h4>${rot}</h4><span class="hint">${plural(itens.length, "item", "itens")}</span>
          ${removidos ? `<span class="pc-dif">${plural(removidos, "item do padrão removido", "itens do padrão removidos")}
            <button type="button" data-a="grp-restaurar" data-c="${c.id}">↺ trazer de volta</button></span>` : ""}</div>
        ${itens.map((it, i) => `<div class="pc-item"><div class="pc-item-h"><b>${esc(c.rotulo || "Item")} ${i + 1}</b>
          ${BASE && !daBase.some((b) => b.id === it.id) ? `<span class="pc-dif novo">só neste produto</span>` : ""}
          <span style="margin-left:auto"></span>
          <button class="btn sm ghost so-icone" data-a="grp-mv" data-c="${c.id}" data-i="${it.id}" data-d="-1" ${i ? "" : "disabled"} aria-label="Subir">${svg(IC.setaCima)}</button>
          <button class="btn sm ghost so-icone" data-a="grp-mv" data-c="${c.id}" data-i="${it.id}" data-d="1" ${i < itens.length - 1 ? "" : "disabled"} aria-label="Descer">${svg(IC.setaBaixo)}</button>
          <button class="btn sm ghost" data-a="grp-dup" data-c="${c.id}" data-i="${it.id}">Duplicar</button>
          <button class="btn sm ghost so-icone" data-a="grp-del" data-c="${c.id}" data-i="${it.id}" aria-label="Remover ${esc(c.rotulo || "item")} ${i + 1}">${svg(IC.lixeira)}</button></div>
          <div class="pc-form">${c.campos.map((s) => campoForm(s, vals, `${c.id}|${it.id}|${s.id}`)).join("")}</div></div>`).join("")}
        <button class="btn sm" data-a="grp-add" data-c="${c.id}">${svg(IC.mais)}Adicionar ${esc((c.rotulo || "item").toLowerCase())}</button></div>`;
    }
    case "passos": {
      const l = vals[c.id] || [];
      return `<div class="pc-bloco"><div class="pc-bloco-h"><h4>${rot}</h4></div>
        ${l.map((s, i) => `<div class="pc-passo"><span class="pr-n mono">${i + 1}</span><input class="inp" data-vp="${c.id}|${s.id}" value="${esc(s.t)}" aria-label="Passo ${i + 1}">
          <button class="btn sm ghost so-icone" data-a="ps-mv" data-c="${c.id}" data-i="${s.id}" data-d="-1" ${i ? "" : "disabled"} aria-label="Subir">${svg(IC.setaCima)}</button>
          <button class="btn sm ghost so-icone" data-a="ps-mv" data-c="${c.id}" data-i="${s.id}" data-d="1" ${i < l.length - 1 ? "" : "disabled"} aria-label="Descer">${svg(IC.setaBaixo)}</button>
          <button class="btn sm ghost so-icone" data-a="ps-del" data-c="${c.id}" data-i="${s.id}" aria-label="Remover passo">${svg(IC.lixeira)}</button></div>`).join("")}
        <button class="btn sm" data-a="ps-add" data-c="${c.id}">${svg(IC.mais)}Adicionar passo</button></div>`;
    }
    case "longo": return `<label class="fld pc-largo"><span>${rot}</span><textarea class="inp" rows="3" data-v="${ref}">${esc(v || "")}</textarea></label>`;
    case "selecao": return `<label class="fld"><span>${rot}</span><select class="sel" data-v="${ref}"><option value="">—</option>
      ${opcoesDe(c).map((o) => `<option value="${o.id}" ${v === o.id ? "selected" : ""}>${esc(o.nome)}</option>`).join("")}
      ${v && !opcoesDe(c).some((o) => o.id === v) ? `<option value="${esc(v)}" selected>(opção excluída)</option>` : ""}</select></label>`;
    case "multipla": return `<div class="fld"><span>${rot}</span><div class="pc-chips">${opcoesDe(c).map((o) =>
      `<button class="chip ${(v || []).includes(o.id) ? "on" : ""}" data-a="mult" data-ref="${ref}" data-o="${o.id}">${esc(o.nome)}</button>`).join("")}</div></div>`;
    case "simnao": return `<div class="fld"><span>${rot}</span><div class="seg">
      <button class="${v === true ? "on" : ""}" data-a="sn" data-ref="${ref}" data-val="1">Sim</button>
      <button class="${v === false ? "on" : ""}" data-a="sn" data-ref="${ref}" data-val="0">Não</button>
      <button class="${v !== true && v !== false ? "on" : ""}" data-a="sn" data-ref="${ref}" data-val="">—</button></div></div>`;
    case "sku": { const i = v ? insumoDe(v) : null;
      return `<div class="fld pc-ins"><span>${rot}</span>
        <input class="inp mono pc-sku-in" data-v="${ref}" data-ins="${ref}" value="${esc(v || "")}" placeholder="SKU ou nome do insumo" autocomplete="off" aria-label="${esc(c.nome)}">
        <div class="pc-ins-sug" data-sug="${ref}">${sugestoes(v, ref)}</div>
        <div class="pc-sku-h ${v && !i ? "fora" : ""}">${v ? (i ? `<b>${esc(i.nome)}</b> · só referência` : "SKU fora da lista de insumos · confira")
          : "referência · não movimenta estoque"}</div></div>`; }
    default: return `<label class="fld"><span>${rot}</span><div class="pc-un-w"><input class="inp" ${NUMERICOS.includes(c.tipo) ? `inputmode="decimal"` : ""} data-v="${ref}" value="${esc(v ?? "")}">${un}</div></label>`;
  }
}
function formValores(tipo, vals) {
  return `<div class="pc-form">${tipo.campos.map((c) => campoForm(c, vals, c.id)).join("")}</div>`;
}

/* ======================= FICHA (tela e papel usam o mesmo desenho) ======================= */
function blocoFicha(tipo, vals) {
  let out = "", kv = [];
  const flush = () => { if (kv.length) out += `<dl class="pf-kv">${kv.join("")}</dl>`; kv = []; };
  for (const c of tipo.campos) {
    const v = vals[c.id];
    if (ehVazio(c, v)) continue;
    if (c.tipo === "grupo") { flush(); out += tabelaGrupo(c, v); }
    else if (c.tipo === "passos") { flush(); out += `<div class="pf-bl"><h4>${esc(c.nome)}</h4><ol class="pf-passos">${v.filter((s) => s.t.trim()).map((s) => `<li><span class="cx"></span>${esc(s.t)}</li>`).join("")}</ol></div>`; }
    else if (c.tipo === "longo") { flush(); out += `<div class="pf-bl"><h4>${esc(c.nome)}</h4><p class="pf-longo">${esc(v)}</p></div>`; }
    else kv.push(`<div><dt>${esc(c.nome)}</dt><dd>${fmt(c, v)}</dd></div>`);
  }
  flush();
  return out || `<div class="hint">Nada preenchido ainda.</div>`;
}
function tabelaGrupo(c, itens) {
  const vivos = itens.filter((it) => c.campos.some((s) => !ehVazio(s, it.v[s.id])));
  const cols = c.campos.filter((s) => vivos.some((it) => !ehVazio(s, it.v[s.id])));   /* só as colunas preenchidas */
  return `<div class="pf-bl"><h4>${esc(c.nome)} <span class="pf-cont">${vivos.length}</span></h4>
    <table class="pf-grp"><thead><tr><th></th>${cols.map((s) => `<th>${esc(s.nome)}</th>`).join("")}</tr></thead>
    <tbody>${vivos.map((it, i) => `<tr><th>${esc(c.rotulo || "Item")} ${i + 1}</th>${cols.map((s) => `<td>${ehVazio(s, it.v[s.id]) ? "" : fmt(s, it.v[s.id])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function secaoProcesso(cfg, n) {
  const t = tipoPorId(cfg.tipoId);
  return `<section class="pf-proc"><h2><span class="pf-num">${n}</span>${esc(t?.nome || "?")}${cfg.titulo ? ` · ${esc(cfg.titulo)}` : ""}
    <span class="pf-meta">${tagsClasses(t?.classes)}</span></h2>${t ? blocoFicha(t, cfg.valores) : ""}</section>`;
}
function folhaProduto(sku, ids) {
  const prod = produtoDe(sku);
  const cs = configsDe(sku).filter((c) => !ids || ids.includes(c.id));
  const agora = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  return `<div class="cab-f"><div class="lg"></div>
      <div><h1>${esc(prod?.descricao || sku)}</h1><div class="sub-f">Moda Bicho Acessórios · Ficha operacional${prod?.categoria ? ` · ${esc(prod.categoria)}` : ""} · ${ids && ids.length === 1 ? "1 processo" : plural(cs.length, "processo", "processos")}</div></div>
      <div class="dt"><b class="sku-f">${esc(sku)}</b><br>Impresso em ${agora}</div></div>
    ${cs.map((c, i) => secaoProcesso(c, i + 1)).join("")}
    <div class="obs-f">Instrução de trabalho. Não é ordem de produção e não movimenta estoque nem insumos.</div>`;
}
function imprimir(html) {
  document.getElementById("folha").innerHTML = html;
  document.body.classList.add("imprimindo");
  window.onafterprint = () => document.body.classList.remove("imprimindo");
  window.print();
}

/* ======================= JANELAS ======================= */
function janela(titulo, corpo, rodape, largura) {
  const volta = E.pilha.length > 1 ? `<button class="btn sm ghost" data-a="fechar">${svg(IC.setaEsq)}Voltar</button>` : "";
  return `<div class="ov" data-a="fundo"><div class="modal" style="max-width:min(${largura}, 96vw)" role="dialog" aria-modal="true">
    <div class="modal-h">${volta}<h2>${titulo}</h2><button class="btn sm ghost" style="margin-left:auto" data-a="fechar-tudo" aria-label="Fechar">${svg(IC.fechar)}</button></div>
    <div class="modal-b">${corpo}</div><div class="modal-f">${rodape}</div></div></div>`;
}
const erros = (m) => m.erros?.length ? `<div class="pc-erros"><b>Falta resolver:</b><ul>${m.erros.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : "";

/* ---------- construtor do tipo de processo ---------- */
function campoBuilder(c, g, i, total) {
  const tc = TC[c.tipo];
  const d = `data-g="${g}" data-id="${c.id}"`;
  const origem = tc.op ? `<div class="bc-ops"><span class="bc-rot">Opções</span>
      <div class="seg" role="group" aria-label="De onde vêm as opções">
        <button class="${c.listaId ? "" : "on"}" data-a="op-origem" ${d} data-v="propria">Próprias do campo</button>
        <button class="${c.listaId ? "on" : ""}" data-a="op-origem" ${d} data-v="lista">Lista compartilhada</button></div>
      ${c.listaId ? `<select class="sel" data-bcl="${g}|${c.id}" aria-label="Lista">${E.listas.map((l) => `<option value="${l.id}" ${l.id === c.listaId ? "selected" : ""}>${esc(l.nome)} · ${l.opcoes.length}</option>`).join("")}</select>`
        : `<button class="btn sm ghost" data-a="op-virar-lista" ${d} ${c.opcoes?.length ? "" : "disabled"} title="Cria uma lista com estas opções, para outros campos usarem também">Transformar em lista compartilhada</button>`}</div>` : "";
  const opcoes = !tc.op ? "" : c.listaId
    ? `<div class="bc-ops"><span class="bc-rot">${esc(listaPorId(c.listaId)?.nome || "lista excluída")}</span>${opcoesDe(c).map((o) => `<span class="tag">${esc(o.nome)}</span>`).join(" ")}
        <span class="hint">· edite em Processos › Listas de opções; vale para todos os campos que usam a lista</span></div>`
    : `<div class="bc-ops">${c.opcoes.map((o, j) => `<span class="bc-op">
      <input class="inp" data-op="${g}|${c.id}|${o.id}" value="${esc(o.nome)}" aria-label="Opção">
      <button data-a="op-mv" ${d} data-o="${o.id}" data-d="-1" ${j ? "" : "disabled"} aria-label="Mover para a esquerda">‹</button>
      <button data-a="op-mv" ${d} data-o="${o.id}" data-d="1" ${j < c.opcoes.length - 1 ? "" : "disabled"} aria-label="Mover para a direita">›</button>
      <button data-a="op-del" ${d} data-o="${o.id}" aria-label="Excluir opção ${esc(o.nome)}">×</button></span>`).join("")}
      <span class="bc-op nova"><input class="inp" id="op-novo-${c.id}" placeholder="Nova opção" data-enter="op-add" ${d}><button data-a="op-add" ${d} aria-label="Adicionar opção">+</button></span></div>`;
  const grupo = c.tipo === "grupo" ? `<div class="bc-sub">
      <label class="fld bc-rotulo"><span>Nome de cada item</span><input class="inp" data-bc="${g}|${c.id}|rotulo" value="${esc(c.rotulo || "")}" placeholder="Ex.: Fita, Insumo"></label>
      <div class="bc-rot">Campos de cada ${esc((c.rotulo || "item").toLowerCase())}</div>
      ${c.campos.map((s, j) => campoBuilder(s, c.id, j, c.campos.length)).join("") || `<div class="hint">Nenhum campo ainda.</div>`}
      ${addCampo(c.id)}</div>` : "";
  return `<div class="bc-campo t-${c.tipo}">
    <div class="bc-lin">
      <span class="bc-n mono">${i + 1}</span><span class="bc-ic" title="${tc.nome}">${tc.ic}</span>
      <input class="inp bc-nome" data-bc="${g}|${c.id}|nome" value="${esc(c.nome)}" placeholder="Nome do campo" aria-label="Nome do campo">
      <select class="sel" data-bct="${g}|${c.id}" aria-label="Tipo do campo">${TIPOS_CAMPO.filter((t) => !g || !t.soRaiz).map((t) => `<option value="${t.k}" ${t.k === c.tipo ? "selected" : ""}>${t.nome}</option>`).join("")}</select>
      ${tc.un != null ? `<input class="inp bc-un" list="dl-un" data-bc="${g}|${c.id}|unidade" value="${esc(c.unidade || "")}" placeholder="unidade" aria-label="Unidade">` : ""}
      <label class="selbar-chk"><input type="checkbox" data-bco="${g}|${c.id}" ${c.obrigatorio ? "checked" : ""}> Obrigatório</label>
      <span class="bc-acoes">
        <button class="btn sm ghost so-icone" data-a="bc-mv" ${d} data-d="-1" ${i ? "" : "disabled"} aria-label="Subir">${svg(IC.setaCima)}</button>
        <button class="btn sm ghost so-icone" data-a="bc-mv" ${d} data-d="1" ${i < total - 1 ? "" : "disabled"} aria-label="Descer">${svg(IC.setaBaixo)}</button>
        <button class="btn sm ghost so-icone" data-a="bc-del" ${d} aria-label="Excluir campo">${svg(IC.lixeira)}</button></span>
    </div>${origem}${opcoes}${grupo}</div>`;
}
/* "+ Adicionar campo" abre uma grade com os tipos: um clique escolhe e cria */
const addCampo = (g) => topo()?.picker === (g || "raiz")
  ? `<div class="bc-picker"><div class="bc-picker-h"><b>Que tipo de campo${g ? " dentro do grupo" : ""}?</b>
      <button class="btn sm ghost" data-a="bc-picker" data-g="">Fechar</button></div>
      <div class="bc-picker-g">${TIPOS_CAMPO.filter((t) => !g || !t.soRaiz).map((t) => `<button class="bc-tp t-${t.k}" data-a="bc-add" data-g="${g}" data-k="${t.k}">
        <span class="bc-ic">${t.ic}</span><span><b>${t.nome}</b><small>${t.ex}</small></span></button>`).join("")}</div></div>`
  : `<div class="bc-add"><button class="btn sm ${g ? "" : "primary"}" data-a="bc-picker" data-g="${g || "raiz"}">${svg(IC.mais)}Adicionar campo${g ? " ao grupo" : ""}</button></div>`;

function modalTipo(m) {
  const r = m.rasc;
  const aba = m.aba || "campos";
  return janela(m.novo ? "Novo tipo de processo" : `Tipo de processo · ${esc(r.nome)}`, `
    <div class="grid2"><label class="fld"><span>Nome do processo *</span><input class="inp" data-t="nome" value="${esc(r.nome)}" placeholder="Ex.: Fitas, Acabamento, Chuca"></label>
      <label class="fld"><span>Descrição</span><input class="inp" data-t="descricao" value="${esc(r.descricao || "")}"></label></div>
    <div style="margin:12px 0 4px">${chipsClasses(r.classes)}</div>
    ${erros(m)}
    <div class="seg" style="margin:12px 0" role="group"><button class="${aba === "campos" ? "on" : ""}" data-a="tipo-aba" data-v="campos">Campos · ${r.campos.length}</button>
      <button class="${aba === "previa" ? "on" : ""}" data-a="tipo-aba" data-v="previa">Prévia do formulário</button></div>
    ${aba === "campos" ? `<div class="bc-lista">${r.campos.map((c, i) => campoBuilder(c, "", i, r.campos.length)).join("") || `<div class="hint">Comece adicionando o primeiro campo.</div>`}</div>${addCampo("")}
      <datalist id="dl-un">${UNIDADES.map((u) => `<option value="${u}">`).join("")}</datalist>`
    : `<div class="aviso" style="margin-bottom:10px">Assim o formulário aparece para quem preencher um padrão ou um produto. O que você digitar aqui não é salvo.</div>${formValores(r, m.previa)}`}`,
    `${!m.novo ? `<button class="btn danger" data-a="tipo-del">Excluir tipo</button>
       <button class="btn ghost" data-a="tipo-dup" title="Começar um processo novo a partir deste">Duplicar processo</button>` : ""}<button class="btn" data-a="fechar">Cancelar</button><span style="margin-left:auto"></span>
     <button class="btn primary" data-a="tipo-salvar">${svg(IC.ok)}Salvar tipo de processo</button>`, "1100px");
}

/* ---------- preencher: padrão ou configuração de um produto ---------- */
function modalValores(m) {
  const t = tipoPorId(m.tipoId), r = m.rasc;
  const ehPadrao = m.modo === "padrao";
  const cfg = !ehPadrao ? configPorId(m.id) : null;
  const outros = ehPadrao ? [...new Set(E.configs.filter((c) => c.padraoId === m.id).map((c) => c.sku))] : [];
  /* só a edição de um produto que veio de padrão compara campo a campo */
  BASE = cfg?.baseValores || null;
  const nDif = BASE ? t.campos.filter((c) => canon(BASE[c.id]) !== canon(r.valores[c.id])).length : 0;
  const form = formValores(t, r.valores);
  BASE = null;
  return janela(ehPadrao ? (m.novo ? `Novo padrão · ${esc(t.nome)}` : `Padrão · ${esc(r.nome)}`)
      : `${esc(t.nome)} · <span class="mono">${esc(cfg.sku)}</span>`, `
    ${ehPadrao
      ? `<div class="grid2"><label class="fld"><span>Nome do padrão *</span><input class="inp" data-r="nome" value="${esc(r.nome)}" placeholder="Ex.: Chuca P"></label><div></div></div>
         <div style="margin:10px 0">${chipsClasses(r.classes)}</div>
         ${outros.length ? `<div class="aviso" style="margin-bottom:12px">Já aplicado em <b>${outros.join(", ")}</b>. Editar o padrão <b>não muda</b> esses produtos: cada um tem a própria cópia.</div>` : ""}`
      : `<div class="aviso" style="margin-bottom:12px">Vale <b>só para ${esc(cfg.sku)}</b>${produtoDe(cfg.sku) ? ` · ${esc(produtoDe(cfg.sku).descricao)}` : ""}. ${cfg.padraoId ? `Veio do padrão <b>${esc(cfg.padraoNome)}</b>, mas é uma cópia: mudar aqui não muda o padrão nem outro produto.` : "Não altera outro produto."}
          É instrução: não mexe em cadastro, estoque ou insumos.</div>
         ${cfg.baseValores ? `<div class="pc-dif-res">${nDif ? `<span class="pc-dif">${plural(nDif, "campo diferente", "campos diferentes")} do padrão aplicado em ${fdata(cfg.aplicadoEm)}</span>
            Cada um tem o seu <b>↺ padrão</b> para voltar só aquele campo.` : `Igual ao padrão <b>${esc(cfg.padraoNome)}</b> aplicado em ${fdata(cfg.aplicadoEm)}. O que você mudar aparece marcado.`}</div>` : ""}
         <div class="grid2"><label class="fld"><span>Título (opcional)</span><input class="inp" data-r="titulo" value="${esc(r.titulo || "")}" placeholder="Ex.: fitas do laço — útil quando o mesmo processo aparece duas vezes"></label><div></div></div>`}
    ${erros(m)}
    <div style="margin-top:12px">${form}</div>`,
    `<button class="btn" data-a="fechar">Cancelar</button>
     ${!ehPadrao ? `<button class="btn ghost" data-a="virar-padrao">Salvar esta configuração como novo padrão</button>` : (!m.novo ? `<button class="btn ghost" data-a="aplicar" data-id="${m.id}">Aplicar a produtos</button>` : "")}
     <span style="margin-left:auto"></span>
     <button class="btn primary" data-a="valores-salvar">${svg(IC.ok)}${ehPadrao ? "Salvar padrão" : "Salvar neste produto"}</button>`, "1100px");
}

/* ---------- escolher: qual processo / qual padrão ---------- */
function modalAdicionar(m) {
  return janela(m.paraPadrao ? "Novo padrão · de qual processo?" : `${m.soPadroes ? "Aplicar padrão" : "Adicionar processo"} · <span class="mono">${esc(m.sku)}</span>`, `
    <div class="hint" style="margin-bottom:12px">${m.paraPadrao ? "Escolha o processo. Comece em branco ou a partir de um padrão que já existe." : m.soPadroes ? "Aplicar copia a configuração do padrão para este produto. Depois você personaliza à vontade — só este produto muda."
      : "Comece em branco ou a partir de um padrão. O mesmo processo pode entrar mais de uma vez."}</div>
    <div class="pc-escolha">${E.tipos.map((t) => { const pds = E.padroes.filter((p) => p.tipoId === t.id);
      if (m.soPadroes && !pds.length) return "";
      return `<div class="pc-esc"><div class="pc-esc-h"><b>${esc(t.nome)}</b> ${tagsClasses(t.classes)}</div>
        <div class="pc-esc-b">${m.soPadroes ? "" : `<button class="btn sm" data-a="add-cfg" data-t="${t.id}">${svg(IC.mais)}Em branco</button>`}
        ${pds.map((p) => `<button class="btn sm ${m.soPadroes ? "" : "ghost"}" data-a="add-cfg" data-t="${t.id}" data-p="${p.id}" title="${esc(resumo(t, p.valores).replace(/<[^>]+>/g, ""))}">Padrão: ${esc(p.nome)}</button>`).join("")}</div></div>`; }).join("")}</div>`,
    `<span style="margin-left:auto"></span><button class="btn" data-a="fechar">Cancelar</button>`, "760px");
}
const aplVisiveis = (m) => PRODUTOS.filter((x) => (!m.cat || x.categoria === m.cat)
  && (!m.busca || semAcento(`${x.sku} ${x.descricao}`).includes(semAcento(m.busca).trim())));
function modalAplicar(m) {
  const p = padraoPorId(m.id), t = tipoPorId(p.tipoId);
  return janela(`Aplicar “${esc(p.nome)}” a produtos`, `
    <div class="aviso" style="margin-bottom:12px">Cada produto marcado recebe uma <b>cópia</b> de ${esc(t.nome)} com os valores deste padrão.
      Depois, personalizar um produto não muda os outros nem o padrão.</div>
    <div class="filters" style="padding:0 0 10px;border:0">
      <div class="search">${svg(IC.busca)}<input class="inp" id="q-apl" style="width:220px" placeholder="Buscar SKU ou descrição" value="${esc(m.busca || "")}" aria-label="Buscar produto"></div>
      <button class="chip ${!m.cat ? "on" : ""}" data-a="apl-cat" data-v="">Todas</button>
      ${[...new Set(PRODUTOS.map((x) => x.categoria))].map((c) => `<button class="chip ${m.cat === c ? "on" : ""}" data-a="apl-cat" data-v="${esc(c)}">${esc(c)}</button>`).join("")}
      <span style="margin-left:auto"></span>
      <button class="btn sm ghost" data-a="apl-todos">Marcar os mostrados</button>
      <button class="btn sm ghost" data-a="apl-limpar" ${m.sel.length ? "" : "disabled"}>Limpar</button></div>
    <table class="t"><tbody>${aplVisiveis(m).map((pr) => { const ja = configsDe(pr.sku).filter((c) => c.padraoId === p.id).length;
      return `<tr><td style="width:30px"><input type="checkbox" data-sel="${pr.sku}" ${m.sel.includes(pr.sku) ? "checked" : ""} aria-label="${pr.sku}"></td>
        <td class="mono"><b>${esc(pr.sku)}</b></td><td>${esc(pr.descricao)}</td>
        <td>${ja ? `<span class="tag amber">já tem este padrão${ja > 1 ? ` ×${ja}` : ""} · aplicar cria outra cópia</span>` : ""}</td></tr>`; }).join("")}</tbody></table>`,
    `<button class="btn" data-a="fechar">Cancelar</button><span style="margin-left:auto"></span>
     <button class="btn primary" data-a="aplicar-ok" ${m.sel.length ? "" : "disabled"}>Aplicar a ${plural(m.sel.length, "produto", "produtos")}</button>`, "820px");
}

/* ---------- o produto: PROCESSOS / COMO FAZER ---------- */
function modalProduto(m) {
  const prod = produtoDe(m.sku);
  const cs = configsDe(m.sku);
  return janela(`<span class="mono">${esc(m.sku)}</span> · ${esc(prod?.descricao || "")}`, `
    <div class="pr-cadastro"><div><span>SKU</span><b class="mono">${esc(m.sku)}</b></div><div><span>Descrição</span><b>${esc(prod?.descricao || "")}</b></div>
      <div><span>Categoria</span><b>${esc(prod?.categoria || "")}</b></div><div class="hint">Cadastro do produto, só leitura nesta amostra.</div></div>
    <section class="pc-como">
      <div class="pc-como-h"><h3>Processos / como fazer</h3>
        <span style="margin-left:auto"></span>
        <button class="btn sm" data-a="adicionar" data-sku="${m.sku}">${svg(IC.mais)}Adicionar processo</button>
        <button class="btn sm" data-a="adicionar" data-sku="${m.sku}" data-so="1">Aplicar padrão</button>
        <button class="btn sm" data-a="imprimir-prod" data-sku="${m.sku}" ${cs.length ? "" : "disabled"}>${svg(IC.impressora)}Imprimir ficha completa</button>
        <button class="btn sm primary" data-a="bancada" data-sku="${m.sku}" ${cs.length ? "" : "disabled"}>${svg(IC.olho)}Como fazer · tela cheia</button></div>
      <div class="hint" style="margin-bottom:10px">Só instrução. Nada aqui altera cadastro, estoque, insumos, pedido ou OP.</div>
      ${cs.length ? cs.map((c, i) => { const t = tipoPorId(c.tipoId);
        return `<div class="pc-cfg"><div class="pc-cfg-h"><span class="pf-num">${i + 1}</span><b>${esc(t?.nome || "?")}${c.titulo ? ` · ${esc(c.titulo)}` : ""}</b>${origemCfg(c)}
          <span style="margin-left:auto"></span>
          <button class="btn sm ghost so-icone" data-a="cfg-mv" data-id="${c.id}" data-d="-1" ${i ? "" : "disabled"} aria-label="Subir">${svg(IC.setaCima)}</button>
          <button class="btn sm ghost so-icone" data-a="cfg-mv" data-id="${c.id}" data-d="1" ${i < cs.length - 1 ? "" : "disabled"} aria-label="Descer">${svg(IC.setaBaixo)}</button></div>
          <div class="pc-cfg-r">${resumo(t, c.valores) || `<span class="hint">nada preenchido</span>`}</div>
          <div class="pc-cfg-a">
            <button class="btn sm primary" data-a="cfg-ver" data-id="${c.id}">${svg(IC.olho)}Abrir instrução</button>
            <button class="btn sm" data-a="cfg-editar" data-id="${c.id}">${svg(IC.editar)}Editar só neste produto</button>
            <span class="pc-mais"><button class="btn sm ghost" data-a="menu" data-id="${c.id}" aria-expanded="${E.menu === c.id}">Mais ▾</button>
              ${E.menu === c.id ? `<span class="pc-menu" role="menu">
                <button role="menuitem" data-a="cfg-print" data-id="${c.id}">${svg(IC.impressora)}Imprimir este processo</button>
                <button role="menuitem" data-a="cfg-dup" data-id="${c.id}">Duplicar neste produto</button>
                <button role="menuitem" class="danger" data-a="cfg-del" data-id="${c.id}">${svg(IC.lixeira)}Remover deste produto</button></span>` : ""}</span></div></div>`; }).join("")
      : `<div class="empty" style="padding:30px"><div class="ic">${svg(IC.processos)}</div><h3>Nenhum processo neste produto</h3><p>Adicione um processo em branco ou aplique um padrão.</p></div>`}
    </section>`, `<span style="margin-left:auto"></span><button class="btn" data-a="fechar">Fechar</button>`, "980px");
}
/* ---------- MODO BANCADA · a instrução como a produção usa ----------
   Tela cheia, letra grande, um processo por vez com abas numeradas. Os passos
   são tocáveis para a pessoa marcar onde está — marcação SÓ na tela (vive
   nesta janela e some ao fechar); nada é gravado nem vira apontamento. */
function corpoBancada(t, cfg, m) {
  const vals = cfg.valores;
  let out = "", kv = [];
  const flush = () => { if (kv.length) out += `<dl class="bn-kv">${kv.join("")}</dl>`; kv = []; };
  for (const c of t.campos) {
    const v = vals[c.id];
    if (ehVazio(c, v)) continue;
    if (c.tipo === "grupo") {
      flush();
      const itens = v.filter((it) => c.campos.some((s) => !ehVazio(s, it.v[s.id])));
      out += `<section class="bn-bl"><h3>${esc(c.nome)} <span class="pf-cont">${itens.length}</span></h3><div class="bn-itens">
        ${itens.map((it, i) => `<div class="bn-item"><div class="bn-item-h">${esc(c.rotulo || "Item")} ${i + 1}</div>
          ${c.campos.filter((s) => !ehVazio(s, it.v[s.id])).map((s) => `<div class="bn-lin"><span>${esc(s.nome)}</span><b>${fmt(s, it.v[s.id])}</b></div>`).join("")}</div>`).join("")}
        </div></section>`;
    } else if (c.tipo === "passos") {
      flush();
      const ps = v.filter((s) => s.t.trim());
      const feitos = ps.filter((s) => m.feitos.includes(`${cfg.id}|${c.id}|${s.id}`)).length;
      out += `<section class="bn-bl"><h3>${esc(c.nome)} <span class="hint">${feitos} de ${ps.length} marcados</span></h3><ol class="bn-passos">
        ${ps.map((s, i) => { const k = `${cfg.id}|${c.id}|${s.id}`; const on = m.feitos.includes(k);
          return `<li><button class="${on ? "feito" : ""}" data-a="bn-passo" data-k="${k}" aria-pressed="${on}">
            <span class="bn-n">${on ? "✓" : i + 1}</span><span>${esc(s.t)}</span></button></li>`; }).join("")}</ol></section>`;
    } else if (c.tipo === "longo") { flush(); out += `<section class="bn-bl"><h3>${esc(c.nome)}</h3><p class="bn-longo">${esc(v)}</p></section>`; }
    else kv.push(`<div><dt>${esc(c.nome)}</dt><dd>${fmt(c, v)}</dd></div>`);
  }
  flush();
  return out || `<div class="empty"><h3>Nada preenchido neste processo</h3>
    <button class="btn primary" data-a="cfg-editar" data-id="${cfg.id}">${svg(IC.editar)}Preencher</button></div>`;
}
function modalBancada(m) {
  const cs = configsDe(m.sku), prod = produtoDe(m.sku);
  if (!cs.length) return "";
  const atual = cs.find((c) => c.id === m.cfg) || cs[0];
  const i = cs.indexOf(atual), t = tipoPorId(atual.tipoId);
  const nome = (c) => `${esc(tipoPorId(c.tipoId)?.nome || "?")}${c.titulo ? ` · ${esc(c.titulo)}` : ""}`;
  return `<div class="ov pc-bov"><div class="pc-banc" role="dialog" aria-modal="true" aria-label="Como fazer ${esc(m.sku)}">
    <header class="pc-banc-h">
      <button class="btn ghost" data-a="fechar">${svg(IC.setaEsq)}Voltar</button>
      <div class="pc-banc-id"><span class="mono">${esc(m.sku)}</span><b>${esc(prod?.descricao || "")}</b></div>
      <span class="pc-banc-imp">
        <button class="btn sm" data-a="cfg-print" data-id="${atual.id}">${svg(IC.impressora)}Imprimir este</button>
        <button class="btn sm" data-a="imprimir-prod" data-sku="${esc(m.sku)}">${svg(IC.impressora)}Ficha completa</button></span>
    </header>
    <nav class="pc-banc-tabs" aria-label="Processos">${cs.map((c, j) => `<button class="${c === atual ? "on" : ""}" data-a="bn-ir" data-id="${c.id}" aria-current="${c === atual}">
      <span class="pf-num">${j + 1}</span>${nome(c)}</button>`).join("")}</nav>
    <main class="pc-banc-b"><h2 class="bn-tit"><span class="pf-num">${i + 1}</span>${nome(atual)} <span class="pf-meta">${tagsClasses(t?.classes)}</span></h2>
      ${t ? corpoBancada(t, atual, m) : ""}</main>
    <footer class="pc-banc-f">
      <button class="btn grande" data-a="bn-ir" data-id="${cs[i - 1]?.id || ""}" ${i ? "" : "disabled"}>◀ ${i ? nome(cs[i - 1]) : "Anterior"}</button>
      <span class="hint">Marcar um passo é só na tela: some ao fechar.</span>
      <button class="btn grande primary" data-a="bn-ir" data-id="${cs[i + 1]?.id || ""}" ${i < cs.length - 1 ? "" : "disabled"}>${i < cs.length - 1 ? `Próximo: ${nome(cs[i + 1])}` : "Último processo"} ▶</button>
    </footer></div></div>`;
}

function renderModal() {
  const m = topo(); if (!m) return "";
  return ({ tipo: modalTipo, valores: modalValores, adicionar: modalAdicionar, aplicar: modalAplicar, produto: modalProduto, bancada: modalBancada })[m.t](m);
}
const topo = () => E.pilha[E.pilha.length - 1];
const abrir = (m) => { E.pilha.push(m); render(); };
/* "Adicionar processo › Em branco" cria a configuração antes de abrir o formulário:
   se a janela fechar sem salvar, ela não fica pendurada no produto */
function descartar(m) { if (m?.t === "valores" && m.modo === "config" && configPorId(m.id)?.novo) E.configs = E.configs.filter((c) => c.id !== m.id); }
const fechar = () => { descartar(E.pilha.pop()); render(); };

/* ======================= DESENHO ======================= */
function render() {
  const ativo = document.activeElement;
  const guarda = ativo && ativo.id ? { id: ativo.id, i: ativo.selectionStart, f: ativo.selectionEnd } : null;
  const rolagem = E._janela === topo() ? document.querySelector(".modal-b, .pc-banc-b")?.scrollTop : null;
  E._janela = topo();
  const nav = [["sec", "Operação"], ["demanda", "Demanda"], ["pedidos", "Pedidos"], ["conferencia", "Conferência"],
    ["sec", "Cadastros"], ["produtos", "Produtos", true], ["processos", "Processos", true], ["insumos", "Insumos"], ["prestadoras", "Prestadoras"]];
  const tit = E.aba === "produtos" ? ["Produtos", "Tela simulada · para ver a seção Processos / como fazer"]
    : ["Processos", "Construtor de instruções: tipos, campos, padrões e classificações — tudo cadastrável"];
  document.getElementById("app").innerHTML = `
  <div class="shell"><nav class="rail"><div class="brand"><div class="brand-logo" role="img" aria-label="Moda Bicho Acessórios"></div></div>
    <div class="nav">${nav.map(([id, nome, vivo]) => id === "sec" ? `<div class="sec">${nome}</div>`
      : `<button ${vivo ? `data-a="aba" data-v="${id}"` : `disabled title="Fora desta amostra"`} class="${E.aba === id ? "on" : ""} ${vivo ? "" : "pr-off"}">${svg(IC[id])}<span>${nome}</span>${id === "processos" ? `<span class="badge">novo</span>` : ""}</button>`).join("")}</div></nav>
  <div class="main"><div class="topbar"><div><h1>${tit[0]}</h1><p>${tit[1]}</p></div>
    <div class="right"><span class="tag amber" title="Nada aqui fala com o servidor. Recarregar volta aos exemplos.">Amostra · dados fictícios · nada é gravado</span></div></div>
    <div class="page">${E.aba === "produtos" ? viewProdutos() : viewProcessos()}</div></div></div>
  <nav class="barra-mob" aria-label="Navegação">
    <button data-a="aba" data-v="processos" class="${E.aba === "processos" ? "on" : ""}">${svg(IC.processos)}<span>Processos</span></button>
    <button data-a="aba" data-v="produtos" class="${E.aba === "produtos" ? "on" : ""}">${svg(IC.produtos)}<span>Produtos</span></button></nav>
  ${renderModal()}`;
  const caixa = document.querySelector(".modal-b, .pc-banc-b");
  if (rolagem != null && caixa) caixa.scrollTop = rolagem;
  const alvo = E.foco ? document.querySelector(E.foco) : guarda && document.getElementById(guarda.id);
  if (alvo) { alvo.focus(); if (!E.foco && guarda?.i != null && alvo.setSelectionRange) try { alvo.setSelectionRange(guarda.i, guarda.f); } catch {} }
  E.foco = null;
}

/* ======================= AÇÕES ======================= */
const listaCampos = (rasc, g) => g ? rasc.campos.find((c) => c.id === g).campos : rasc.campos;
const acharCampo = (rasc, g, id) => listaCampos(rasc, g).find((c) => c.id === id);
const mover = (l, i, d) => { const j = i + d; if (j >= 0 && j < l.length) [l[i], l[j]] = [l[j], l[i]]; };
const valoresDoTopo = () => { const m = topo(); return m.t === "tipo" ? m.previa : m.rasc.valores; };
const tipoDoTopo = () => { const m = topo(); return m.t === "tipo" ? m.rasc : tipoPorId(m.tipoId); };
/* o campo como está SALVO: é nele que os valores existentes se apoiam (campo novo = sem uso) */
function campoSalvo(g, id) { const s = tipoPorId(topo().rasc.id); if (!s) return null;
  const l = g ? s.campos.find((c) => c.id === g)?.campos : s.campos; return l?.find((c) => c.id === id) || null; }

const ACOES = {
  aba: (d) => { E.aba = d.v; E.pilha.forEach(descartar); E.pilha = []; render(); },
  sub: (d) => { E.sub = d.v; render(); },
  fundo: () => fechar(), fechar: () => fechar(), "fechar-tudo": () => { E.pilha.forEach(descartar); E.pilha = []; render(); },

  /* ---- classificações ---- */
  "cl-add": () => { const n = document.getElementById("cl-novo").value.trim(); if (!n) return;
    E.classes.push({ id: novoId("cl"), nome: n, valores: [] }); toast(`Classificação “${n}” criada.`); render(); },
  "cl-del": (d) => { const cl = E.classes.find((c) => c.id === d.c);
    const uso = [...E.tipos, ...E.padroes].filter((x) => (x.classes?.[cl.id] || []).length).length;
    if (!confirm(`Excluir a classificação “${cl.nome}”?${uso ? `\n\nEla está em ${plural(uso, "processo/padrão", "processos/padrões")}; a marcação sai deles.` : ""}`)) return;
    E.classes = E.classes.filter((c) => c !== cl); [...E.tipos, ...E.padroes].forEach((x) => delete x.classes?.[cl.id]); render(); },
  "clv-add": (d) => { const inp = document.getElementById(`clv-novo-${d.c}`); const n = inp.value.trim(); if (!n) return;
    E.classes.find((c) => c.id === d.c).valores.push(V(novoId("v"), n)); E.foco = `#clv-novo-${d.c}`; render(); },
  "clv-del": (d) => { const cl = E.classes.find((c) => c.id === d.c);
    const uso = [...E.tipos, ...E.padroes].filter((x) => (x.classes?.[cl.id] || []).includes(d.v)).length;
    if (uso && !confirm(`Este valor marca ${plural(uso, "processo/padrão", "processos/padrões")}. Excluir mesmo assim?`)) return;
    cl.valores = cl.valores.filter((v) => v.id !== d.v); [...E.tipos, ...E.padroes].forEach((x) => { if (x.classes?.[cl.id]) x.classes[cl.id] = x.classes[cl.id].filter((v) => v !== d.v); }); render(); },
  "cl-tg": (d) => { const r = topo().rasc; const l = (r.classes[d.c] ||= []); const i = l.indexOf(d.v); i < 0 ? l.push(d.v) : l.splice(i, 1); render(); },

  /* ---- listas de opções compartilhadas ---- */
  "ls-add": () => { const n = document.getElementById("ls-novo").value.trim(); if (!n) return;
    const l = { id: novoId("ls"), nome: n, opcoes: [] }; E.listas.push(l); E.foco = `#lso-novo-${l.id}`; toast(`Lista “${n}” criada.`); render(); },
  "ls-del": (d) => { const l = listaPorId(d.l); const usam = camposDaLista(l.id);
    if (usam.length) { alert(`“${l.nome}” é usada por ${usam.map((x) => `${x.t.nome} › ${x.c.nome}`).join(", ")}. Troque esses campos para outra lista ou para opções próprias antes de excluir.`); return; }
    if (!confirm(`Excluir a lista “${l.nome}”?`)) return; E.listas = E.listas.filter((x) => x !== l); render(); },
  "lso-add": (d) => { const inp = document.getElementById(`lso-novo-${d.l}`); const n = inp.value.trim(); if (!n) return;
    listaPorId(d.l).opcoes.push({ id: novoId("o"), nome: n }); E.foco = `#lso-novo-${d.l}`; render(); },
  "lso-del": (d) => { const l = listaPorId(d.l); const o = l.opcoes.find((x) => x.id === d.o); const uso = usoOpcaoLista(l.id, o.id);
    if (uso && !confirm(`“${o.nome}” está escolhida em ${plural(uso, "padrão/produto", "padrões/produtos")}. Lá ela vai aparecer como “(opção excluída)”. Excluir?`)) return;
    l.opcoes = l.opcoes.filter((x) => x !== o); render(); },
  "lso-mv": (d) => { const l = listaPorId(d.l); mover(l.opcoes, l.opcoes.findIndex((o) => o.id === d.o), Number(d.d)); render(); },
  "op-origem": (d) => {
    const r = topo().rasc; const c = acharCampo(r, d.g, d.id);
    if (d.v === "lista" && !c.listaId) {
      if (!E.listas.length) { alert("Ainda não existe lista compartilhada. Crie uma em Processos › Listas de opções, ou use “Transformar em lista compartilhada”."); return; }
      const uso = usoOpcoesProprias(r.id, d.g, c);
      if (uso && !confirm(`As opções deste campo já foram escolhidas em ${plural(uso, "padrão/produto", "padrões/produtos")}. Trocando por outra lista, esses valores aparecem como “(opção excluída)”.\n\nPara manter, use “Transformar em lista compartilhada”. Trocar mesmo assim?`)) return;
      c.listaId = E.listas[0].id; c.opcoes = [];
    } else if (d.v === "propria" && c.listaId) {
      /* vira cópia: os mesmos ids, então nada do que já foi escolhido se perde */
      c.opcoes = copia(opcoesDe(c)); delete c.listaId;
      toast("O campo agora tem uma cópia própria das opções. Mudanças na lista não chegam mais aqui.");
    }
    render();
  },
  "op-virar-lista": (d) => { const c = acharCampo(topo().rasc, d.g, d.id);
    const l = { id: novoId("ls"), nome: c.nome || "Nova lista", opcoes: copia(c.opcoes) };   /* mesmos ids: o que já foi escolhido continua valendo */
    E.listas.push(l); c.listaId = l.id; c.opcoes = [];
    toast(`Lista “${l.nome}” criada com ${plural(l.opcoes.length, "opção", "opções")}. Outros campos já podem usá-la.`); render(); },

  /* ---- tipo de processo (construtor) ---- */
  "tipo-novo": () => abrir({ t: "tipo", novo: true, previa: {}, rasc: { id: novoId("tp"), nome: "", descricao: "", classes: {}, campos: [] } }),
  "tipo-editar": (d) => abrir({ t: "tipo", previa: {}, rasc: copia(tipoPorId(d.id)) }),
  "tipo-aba": (d) => { topo().aba = d.v; render(); },
  "bc-picker": (d) => { topo().picker = d.g || null; render(); },
  "bc-add": (d) => { const g = d.g || ""; const k = d.k;
    const c = C(novoId("c"), "", k, TC[k].op ? { opcoes: [] } : k === "grupo" ? { rotulo: "", campos: [] } : {});
    listaCampos(topo().rasc, g).push(c);
    /* grupo novo já abre a grade DENTRO dele: o próximo passo óbvio é dar campos a cada item */
    topo().picker = k === "grupo" ? c.id : null;
    E.foco = `[data-bc="${g}|${c.id}|nome"]`; render(); },
  "tipo-dup": () => { const r = copia(topo().rasc); E.pilha.pop();
    abrir({ t: "tipo", novo: true, previa: {}, rasc: { ...r, id: novoId("tp"), nome: `${r.nome} (cópia)` } });
    toast("Cópia aberta. Ela só passa a existir quando você salvar."); },
  "padrao-de-tipo": (d) => { const t = tipoPorId(d.t); E.pilha = [];
    abrir({ t: "valores", modo: "padrao", novo: true, id: novoId("pd"), tipoId: t.id, rasc: { nome: "", classes: copia(t.classes || {}), valores: {} } });
    E.foco = `[data-r="nome"]`; render(); },
  "bc-del": (d) => { const r = topo().rasc; const c = acharCampo(r, d.g, d.id);
    const cs = campoSalvo(d.g, d.id); const uso = cs ? usoCampo(r.id, d.g, cs) : 0;
    if (uso && !confirm(`O campo “${c.nome}” está preenchido em ${plural(uso, "padrão/produto", "padrões/produtos")}. Ao salvar, esse valor deixa de aparecer. Excluir?`)) return;
    const l = listaCampos(r, d.g); l.splice(l.indexOf(c), 1); render(); },
  "bc-mv": (d) => { const l = listaCampos(topo().rasc, d.g); mover(l, l.findIndex((c) => c.id === d.id), Number(d.d)); render(); },
  "op-add": (d) => { const inp = document.getElementById(`op-novo-${d.id}`); const n = inp.value.trim(); if (!n) return;
    acharCampo(topo().rasc, d.g, d.id).opcoes.push({ id: novoId("o"), nome: n }); E.foco = `#op-novo-${d.id}`; render(); },
  "op-del": (d) => { const r = topo().rasc; const c = acharCampo(r, d.g, d.id); const o = c.opcoes.find((x) => x.id === d.o);
    const uso = usoOpcao(r.id, d.g, d.id, d.o);
    if (uso && !confirm(`A opção “${o.nome}” está escolhida em ${plural(uso, "padrão/produto", "padrões/produtos")}. Lá ela vai aparecer como “(opção excluída)”. Excluir?`)) return;
    c.opcoes = c.opcoes.filter((x) => x.id !== d.o); render(); },
  "op-mv": (d) => { const c = acharCampo(topo().rasc, d.g, d.id); mover(c.opcoes, c.opcoes.findIndex((o) => o.id === d.o), Number(d.d)); render(); },
  "tipo-salvar": () => {
    const m = topo(), r = m.rasc; const e = [];
    r.nome = r.nome.trim();
    if (!r.nome) e.push("Dê um nome ao processo.");
    if (!r.campos.length) e.push("Adicione pelo menos um campo.");
    const conferir = (l, onde) => l.forEach((c, i) => {
      const quem = `${onde}campo ${i + 1}${c.nome ? ` (${c.nome})` : ""}`;
      if (!c.nome.trim()) e.push(`${quem}: sem nome.`);
      if (TC[c.tipo].op && !opcoesDe(c).length) e.push(c.listaId ? `${quem}: a lista escolhida está vazia.` : `${quem}: crie pelo menos uma opção.`);
      if (c.tipo === "grupo") { if (!c.campos.length) e.push(`${quem}: o grupo precisa de campos.`); conferir(c.campos, `${c.nome || "grupo"} › `); }
    });
    conferir(r.campos, "");
    if (E.tipos.some((t) => t.id !== r.id && t.nome.toLowerCase() === r.nome.toLowerCase())) e.push(`Já existe um processo chamado “${r.nome}”.`);
    if (e.length) { m.erros = e; render(); document.querySelector(".modal-b").scrollTop = 0; return; }
    const antes = tipoPorId(r.id);
    if (antes) Object.assign(antes, r); else E.tipos.push(r);
    E.pilha.pop(); E.sub = "tipos";
    delete r.picker;
    toast(antes ? `Processo “${r.nome}” salvo. Campos novos aparecem vazios nos padrões e produtos que já usam este processo.` : `Processo “${r.nome}” criado com ${plural(r.campos.length, "campo", "campos")}.`,
      { rotulo: "Criar um padrão dele", a: "padrao-de-tipo", t: r.id });
    render();
  },
  "tipo-del": () => { const r = topo().rasc; const n = portadores(r.id).length;
    if (n) { alert(`“${r.nome}” está em uso em ${plural(n, "padrão/produto", "padrões/produtos")}. Remova de lá antes de excluir o tipo.`); return; }
    if (!confirm(`Excluir o tipo de processo “${r.nome}”?`)) return;
    E.tipos = E.tipos.filter((t) => t.id !== r.id); E.pilha.pop(); render(); },

  /* ---- preencher valores (padrão, produto e prévia) ---- */
  "grp-add": (d) => { const v = valoresDoTopo(); const it = G(novoId("g"), {}); (v[d.c] ||= []).push(it);
    const c = tipoDoTopo().campos.find((x) => x.id === d.c); const s0 = c.campos[0];
    if (s0) E.foco = `[data-v="${d.c}|${it.id}|${s0.id}"]`; render(); },
  "grp-del": (d) => { const v = valoresDoTopo(); v[d.c] = v[d.c].filter((x) => x.id !== d.i); render(); },
  "grp-dup": (d) => { const l = valoresDoTopo()[d.c]; const i = l.findIndex((x) => x.id === d.i); l.splice(i + 1, 0, { id: novoId("g"), v: copia(l[i].v) }); render(); },
  "grp-mv": (d) => { const l = valoresDoTopo()[d.c]; mover(l, l.findIndex((x) => x.id === d.i), Number(d.d)); render(); },
  "ps-add": (d) => { const v = valoresDoTopo(); const s = S(novoId("s"), ""); (v[d.c] ||= []).push(s); E.foco = `[data-vp="${d.c}|${s.id}"]`; render(); },
  "ps-del": (d) => { const v = valoresDoTopo(); v[d.c] = v[d.c].filter((x) => x.id !== d.i); render(); },
  "ps-mv": (d) => { const l = valoresDoTopo()[d.c]; mover(l, l.findIndex((x) => x.id === d.i), Number(d.d)); render(); },
  /* "↺ padrão": só aquele campo volta ao que o padrão dizia quando foi aplicado */
  "vp-reset": (d) => { const base = configPorId(topo().id)?.baseValores; if (!base) return;
    refSet(valoresDoTopo(), d.ref, copia(refGet(base, d.ref) ?? null) ?? undefined); render(); },
  "grp-restaurar": (d) => { const base = configPorId(topo().id)?.baseValores; const v = valoresDoTopo(); const l = (v[d.c] ||= []);
    for (const b of base?.[d.c] || []) if (!l.some((it) => it.id === b.id)) l.push(copia(b)); render(); },
  "ins-pick": (d) => { refSet(valoresDoTopo(), d.ref, d.sku); render(); },
  "apl-cat": (d) => { topo().cat = d.v || ""; render(); },
  "apl-todos": () => { const m = topo(); m.sel = [...new Set([...m.sel, ...aplVisiveis(m).map((x) => x.sku)])]; render(); },
  "apl-limpar": () => { topo().sel = []; render(); },
  mult: (d) => { const v = valoresDoTopo(); const l = (refGet(v, d.ref) || []).slice(); const i = l.indexOf(d.o); i < 0 ? l.push(d.o) : l.splice(i, 1); refSet(v, d.ref, l); render(); },
  sn: (d) => { refSet(valoresDoTopo(), d.ref, d.val === "" ? undefined : d.val === "1"); render(); },

  "padrao-novo": () => abrir({ t: "adicionar", paraPadrao: true, sku: "" }),
  "padrao-editar": (d) => { const p = padraoPorId(d.id); abrir({ t: "valores", modo: "padrao", id: p.id, tipoId: p.tipoId, rasc: { nome: p.nome, classes: copia(p.classes || {}), valores: copia(p.valores) } }); },
  "valores-salvar": () => {
    const m = topo(), t = tipoPorId(m.tipoId), r = m.rasc;
    const e = faltas(t, r.valores);
    if (m.modo === "padrao" && !String(r.nome || "").trim()) e.unshift("Dê um nome ao padrão.");
    if (e.length) { m.erros = e; render(); document.querySelector(".modal-b").scrollTop = 0; return; }
    enxugar(t, r.valores);
    if (m.modo === "padrao") {
      const agora = new Date().toISOString();
      if (m.novo) E.padroes.push({ id: m.id, nome: r.nome.trim(), tipoId: t.id, classes: r.classes, valores: r.valores, atualizadoEm: agora });
      else Object.assign(padraoPorId(m.id), { nome: r.nome.trim(), classes: r.classes, valores: r.valores, atualizadoEm: agora });
      E.pilha.pop(); E.aba === "processos" && (E.sub = "padroes");
      toast(m.novo ? `Padrão “${r.nome.trim()}” criado.` : `Padrão salvo. Os produtos que já receberam cópia não mudam.`,
        { rotulo: "Aplicar a produtos", a: "aplicar", id: m.id });
    } else {
      const cfg = configPorId(m.id); cfg.valores = r.valores; cfg.titulo = String(r.titulo || "").trim(); delete cfg.novo;
      E.pilha.pop(); toast(`Salvo só em ${cfg.sku}. Nenhum outro produto mudou.`, { rotulo: "Abrir instrução", a: "cfg-ver", id: cfg.id });
    }
    render();
  },
  "virar-padrao": () => { const m = topo(); const t = tipoPorId(m.tipoId); const vals = enxugar(t, copia(m.rasc.valores));
    E.pilha.pop();
    abrir({ t: "valores", modo: "padrao", novo: true, id: novoId("pd"), tipoId: t.id, rasc: { nome: "", classes: copia(t.classes || {}), valores: vals } });
    E.foco = `[data-r="nome"]`; render(); },
  aplicar: (d) => abrir({ t: "aplicar", id: d.id, sel: [] }),
  "aplicar-ok": () => { const m = topo(); const p = padraoPorId(m.id);
    m.sel.forEach((sku) => aplicarPadrao(p.id, sku)); E.pilha.pop();
    toast(`“${p.nome}” aplicado a ${m.sel.join(", ")}. Cada um recebeu a própria cópia.`,
      { rotulo: `Abrir ${m.sel[0]}`, a: "produto", sku: m.sel[0] }); render(); },

  /* ---- produto ---- */
  produto: (d) => abrir({ t: "produto", sku: d.sku }),
  adicionar: (d) => abrir({ t: "adicionar", sku: d.sku, soPadroes: !!d.so }),
  "add-cfg": (d) => {
    const m = topo();
    if (m.paraPadrao) {   /* "Novo padrão": escolheu o processo, agora preenche */
      const t = tipoPorId(d.t); E.pilha.pop();
      abrir({ t: "valores", modo: "padrao", novo: true, id: novoId("pd"), tipoId: t.id,
        rasc: { nome: "", classes: copia(t.classes || {}), valores: d.p ? copia(padraoPorId(d.p).valores) : {} } });
      return;
    }
    E.pilha.pop();
    if (d.p) { aplicarPadrao(d.p, m.sku); toast(`Padrão aplicado a ${m.sku} como cópia.`); render(); return; }
    const cfg = { id: novoId("cf"), sku: m.sku, tipoId: d.t, titulo: "", padraoId: null, criadoEm: new Date().toISOString(), valores: {}, novo: true };
    E.configs.push(cfg); ACOES["cfg-editar"]({ id: cfg.id });
  },
  "cfg-ver": (d) => { const c = configPorId(d.id); abrir({ t: "bancada", sku: c.sku, cfg: c.id, feitos: [] }); },
  bancada: (d) => abrir({ t: "bancada", sku: d.sku, feitos: [] }),
  "bn-ir": (d) => { if (!d.id) return; topo().cfg = d.id; E._janela = null; render(); },   /* processo novo começa do topo */
  "bn-passo": (d) => { const f = topo().feitos; const i = f.indexOf(d.k); i < 0 ? f.push(d.k) : f.splice(i, 1); render(); },
  menu: (d) => { E.menu = E.menu === d.id ? null : d.id; render(); },
  "cfg-editar": (d) => { const c = configPorId(d.id);
    abrir({ t: "valores", modo: "config", id: c.id, tipoId: c.tipoId, rasc: { titulo: c.titulo, valores: copia(c.valores) } }); },
  "cfg-dup": (d) => { const c = configPorId(d.id); const nova = { ...copia(c), id: novoId("cf"), titulo: c.titulo ? `${c.titulo} (cópia)` : "cópia" };
    E.configs.splice(E.configs.indexOf(c) + 1, 0, nova); toast("Configuração duplicada neste produto. As duas são independentes."); render(); },
  "cfg-del": (d) => { const c = configPorId(d.id);
    if (!confirm(`Remover “${tipoPorId(c.tipoId)?.nome}” de ${c.sku}?\n\nSó este produto perde esta instrução. O padrão e os outros produtos não mudam.`)) return;
    E.configs = E.configs.filter((x) => x !== c); if (topo()?.t === "bancada" && !configsDe(c.sku).length) E.pilha.pop(); render(); },
  "cfg-mv": (d) => { const c = configPorId(d.id); const irmas = configsDe(c.sku); const j = irmas.indexOf(c) + Number(d.d);
    if (j < 0 || j >= irmas.length) return; const a = E.configs.indexOf(c), b = E.configs.indexOf(irmas[j]); [E.configs[a], E.configs[b]] = [E.configs[b], E.configs[a]]; render(); },
  "cfg-print": (d) => { const c = configPorId(d.id); imprimir(folhaProduto(c.sku, [c.id])); },
  "imprimir-prod": (d) => imprimir(folhaProduto(d.sku)),
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-a]");
  /* o menu "Mais" fecha com qualquer outro clique */
  if (E.menu && el?.dataset.a !== "menu") { E.menu = null; render(); }
  if (!el) return;
  if (el.dataset.a === "fundo" && e.target !== el) return;
  const f = ACOES[el.dataset.a];
  if (f) { e.preventDefault(); f(el.dataset, el); }
});
/* escolher um insumo na lista não pode tirar o foco do campo: sem isso o `change`
   redesenharia a tela entre o apertar e o soltar, e o clique se perderia */
document.addEventListener("mousedown", (e) => {
  const b = e.target.closest('[data-a="ins-pick"]');
  if (b) { e.preventDefault(); ACOES["ins-pick"](b.dataset); }
});
/* digitar só guarda no rascunho: o foco não pula */
document.addEventListener("input", (e) => {
  const el = e.target, d = el.dataset, m = topo();
  if (d.ins) { refSet(valoresDoTopo(), d.ins, el.value);   /* só a lista de sugestões se refaz */
    const box = [...document.querySelectorAll("[data-sug]")].find((x) => x.dataset.sug === d.ins); if (box) box.innerHTML = sugestoes(el.value, d.ins); return; }
  if (el.id === "q-apl") { m.busca = el.value; render(); return; }
  if (el.id === "q-proc") { E.busca = el.value; render(); return; }
  if (el.id === "q-prod") { E.buscaProd = el.value; render(); return; }
  if (d.lsn) { listaPorId(d.lsn).nome = el.value; return; }
  if (d.lso) { const [l, o] = d.lso.split("|"); listaPorId(l).opcoes.find((x) => x.id === o).nome = el.value; return; }
  if (d.cln) { E.classes.find((c) => c.id === d.cln).nome = el.value; return; }
  if (d.clv) { const [c, v] = d.clv.split("|"); E.classes.find((x) => x.id === c).valores.find((x) => x.id === v).nome = el.value; return; }
  if (!m) return;
  if (d.t != null && m.t === "tipo") { m.rasc[d.t] = el.value; return; }
  if (d.bc) { const [g, id, prop] = d.bc.split("|"); acharCampo(m.rasc, g, id)[prop] = el.value; return; }
  if (d.op) { const [g, id, o] = d.op.split("|"); acharCampo(m.rasc, g, id).opcoes.find((x) => x.id === o).nome = el.value; return; }
  if (d.r != null) { m.rasc[d.r] = el.value; return; }
  if (d.v != null && el.tagName !== "SELECT") { refSet(valoresDoTopo(), d.v, el.value); return; }
  if (d.vp) { const [c, s] = d.vp.split("|"); const st = (valoresDoTopo()[c] || []).find((x) => x.id === s); if (st) st.t = el.value; }
});
document.addEventListener("change", (e) => {
  const el = e.target, d = el.dataset, m = topo();
  if (d.fc) { E.fc[d.fc] = el.value; render(); return; }
  if (!m) return;
  if (d.bcl) {
    const [g, id] = d.bcl.split("|"); const c = acharCampo(m.rasc, g, id); const cs = campoSalvo(g, id);
    const uso = cs && cs.listaId ? opcoesDe(cs).reduce((n, o) => n + usoOpcao(m.rasc.id, g, id, o.id), 0) : 0;
    if (uso && !confirm(`Já há ${plural(uso, "escolha", "escolhas")} feitas com a lista atual. Com outra lista, elas aparecem como “(opção excluída)”. Trocar?`)) { el.value = c.listaId; return; }
    c.listaId = el.value; render(); return;
  }
  if (d.bco) { const [g, id] = d.bco.split("|"); acharCampo(m.rasc, g, id).obrigatorio = el.checked; return; }
  if (d.bct) {
    const [g, id] = d.bct.split("|"); const c = acharCampo(m.rasc, g, id);
    const cs = campoSalvo(g, id); const uso = cs ? usoCampo(m.rasc.id, g, cs) : 0;
    if (uso && !confirm(`“${c.nome}” já está preenchido em ${plural(uso, "padrão/produto", "padrões/produtos")}. Mudar o tipo pode esconder esses valores. Mudar?`)) { el.value = c.tipo; return; }
    c.tipo = el.value;
    if (TC[c.tipo].op && !c.listaId) c.opcoes ||= [];
    if (c.tipo === "grupo") { c.campos ||= []; c.rotulo ||= ""; }
    if (TC[c.tipo].un != null && c.unidade == null) c.unidade = TC[c.tipo].un;
    render(); return;
  }
  if (d.sel) { m.sel = el.checked ? [...m.sel, d.sel] : m.sel.filter((s) => s !== d.sel); render(); return; }
  if (d.v != null) { refSet(valoresDoTopo(), d.v, el.value); if (el.tagName === "SELECT" || el.classList.contains("pc-sku-in")) render(); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && E.menu) { E.menu = null; render(); return; }
  if (e.key === "Escape" && E.pilha.length) { fechar(); return; }
  const en = e.target.dataset?.enter;
  if (e.key === "Enter" && en) { e.preventDefault(); ACOES[en](e.target.dataset); return; }
  if ((e.key === "Enter" || e.key === " ") && e.target.matches("tr[data-a]")) { e.preventDefault(); e.target.click(); }
});

semear();
render();
