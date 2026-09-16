/* ---------- a embalagem em que o material chega e sai ----------
   Etiqueta se compra e se manda em caixa fechada de 9.000, e ninguém no balcão
   vai digitar 9000. Mas a UNIDADE do insumo continua sendo a etiqueta, e o
   movimento é sempre gravado nela: a caixa é só o jeito de digitar. Duas
   unidades disputando o mesmo saldo é como um estoque começa a mentir. */
const temEmbalagem = (i) => !!(i?.embalagem?.nome && Number(i.embalagem.fator) > 0);
const fatorEmbalagem = (i) => temEmbalagem(i) ? Number(i.embalagem.fator) : 1;
const emBase = (i, qtdEmbalagem) => (Number(qtdEmbalagem) || 0) * fatorEmbalagem(i);
/* "2 caixas (18.000 etiquetas)" — a frase que confirma para a pessoa o que ela acabou de pedir */
function fraseEmbalagem(i, qtdEmbalagem) {
  if (!temEmbalagem(i)) return "";
  const q = Number(qtdEmbalagem) || 0; if (!q) return "";
  const base = emBase(i, q);
  return `${nDec(q)} ${esc(i.embalagem.nome)}${q === 1 ? "" : "s"} = ${nDec(base)} ${esc(i.unidade || "un")}`;
}

/* ---------- o que anda junto ----------
   Na overlock, fio balão vai de dois em dois e a linha vai uma. A regra é da
   fábrica, não do app: aqui ela é SUGESTÃO — a linha aparece preenchida e a
   funcionária confirma ou muda. Amarrar no cadastro (e não adivinhar pelo nome)
   é o que faz isso valer para qualquer par que exista amanhã. */
function sugestaoJunto(bem, qtdBase) {
  const j = bem?.junto; if (!j?.bemId) return null;
  const outro = bemPorId(j.bemId); if (!outro) return null;
  const aCada = Number(j.aCada) || 0, sug = Number(j.sugerir) || 0;
  const q = Number(qtdBase) || 0;
  if (!aCada || !sug || q <= 0) return null;
  return { bem: outro, qtd: Math.round((q / aCada) * sug * 100) / 100, aCada, sugerir: sug };
}

function proximoCodigoInsumo() {
  const n = insumos().reduce((m, i) => {
    const x = String(i.codigo || "").match(/^INS-(\d+)$/i);
    return x ? Math.max(m, Number(x[1])) : m;
  }, 0);
  return "INS-" + String(n + 1).padStart(3, "0");
}

/* ---------- o saldo, sempre pela soma ----------
   Cacheado por _rev porque a tela de insumos soma tudo a cada render, e a lista
   de movimentos só cresce. O cache morre sozinho quando qualquer dado muda. */
let _cacheSaldo = { rev: -1, mapa: null };
/* quem mexe na lista de movimentos derruba o cache na hora. Sem isto a tela
   redesenhava com o saldo anterior logo depois de registrar uma entrada, e só
   se corrigia no render seguinte — o tipo de erro que a pessoa lê como "não
   gravou" e lança tudo de novo. */
const esquecerSaldos = () => { _cacheSaldo = { rev: -1, mapa: null }; _cacheLocais = { rev: -1, mapa: null }; };
function saldosInsumo() {
  if (_cacheSaldo.rev === _rev && _cacheSaldo.mapa) return _cacheSaldo.mapa;
  const mapa = new Map();
  for (const m of movsInsumo()) {
    const a = mapa.get(m.insumoId) || { saldo: 0, entrou: 0, saiu: 0, ultimoEm: null, n: 0 };
    const q = Number(m.qtd) || 0;
    a.saldo += q;
    if (q > 0) a.entrou += q; else a.saiu += -q;
    a.n++;
    if (!a.ultimoEm || String(m.em) > String(a.ultimoEm)) a.ultimoEm = m.em;
    mapa.set(m.insumoId, a);
  }
  _cacheSaldo = { rev: _rev, mapa };
  return mapa;
}
const saldoInsumo = (id) => (saldosInsumo().get(id) || { saldo: 0 }).saldo;

/* ---------- custo ----------
   Só as ENTRADAS com custo entram na conta: consumo e ajuste não têm preço.
   A média é ponderada pela quantidade — média simples faria uma compra de 5
   unidades pesar igual a uma de 500. */
function custoInsumo(id) {
  const ent = movsInsumo().filter((m) => m.insumoId === id && m.tipo === "entrada" && m.custoUnit > 0)
    .sort((a, b) => String(b.em).localeCompare(String(a.em)));
  if (!ent.length) return null;
  const qtdTotal = ent.reduce((s, m) => s + (Number(m.qtd) || 0), 0);
  const valorTotal = ent.reduce((s, m) => s + (Number(m.qtd) || 0) * m.custoUnit, 0);
  const precos = ent.map((m) => m.custoUnit);
  return { ultimo: ent[0].custoUnit, ultimoEm: ent[0].em,
    medio: qtdTotal ? valorTotal / qtdTotal : ent[0].custoUnit,
    maior: Math.max(...precos), menor: Math.min(...precos), compras: ent.length };
}

/* existe receita em algum lugar? decide se o app fala em "disponível" ou só em
   "físico" — e se as colunas de reserva têm o que mostrar */
let _cacheTemRec = { rev: -1, v: false };
function temReceitaEmAlgumLugar() {
  if (_cacheTemRec.rev === _rev) return _cacheTemRec.v;
  const v = (S.cad?.receitas || []).some((r) => (r.itens || []).length)
    || (S.produtos || []).some((p) => (p.receita || []).length);
  _cacheTemRec = { rev: _rev, v };
  return v;
}
/* ---------- escolher um insumo sem a lista inteira na cara ----------
   Um <select> com todos os insumos não é uma escolha, é uma rolagem: a pessoa
   abre e leva duzentas linhas na cara para achar uma. Aqui é o contrário — ela
   escreve duas letras e vê no máximo oito candidatos. Depois de escolhido, a
   busca some e fica só o nome, que é a única coisa que ainda importa. */
function insumoBusca(txt, limite = 8) {
  const q = String(txt || "").trim().toLowerCase();
  if (q.length < 2) return { itens: [], total: 0 };
  const termos = q.split(/\s+/).filter(Boolean);
  const achados = [];
  insumos().forEach((x) => {
    if (x.ativo === false) return;
    const nome = String(x.nome || "").toLowerCase(), cod = String(x.codigo || "").toLowerCase();
    const alvo = cod + " " + nome + " " + String(x.categoria || "").toLowerCase();
    if (!termos.every((t) => alvo.includes(t))) return;
    achados.push({ x, p: cod === q ? 0 : nome.startsWith(q) ? 1 : cod.startsWith(q) ? 2 : nome.includes(q) ? 3 : 4 });
  });
  achados.sort((a, b) => a.p - b.p || String(a.x.nome).localeCompare(String(b.x.nome)));
  return { itens: achados.slice(0, limite).map((o) => o.x), total: achados.length };
}
/* o mesmo picker da 7.54, procurando na lista de bens em vez de insumos */
function bemBusca(txt, limite = 8) {
  const q = String(txt || "").trim().toLowerCase();
  if (q.length < 2) return { itens: [], total: 0 };
  const termos = q.split(/\s+/).filter(Boolean);
  const achados = [];
  bensAtivos().forEach((x) => {
    const nome = String(x.nome || "").toLowerCase(), cod = String(x.codigo || "").toLowerCase();
    if (!termos.every((t) => (cod + " " + nome).includes(t))) return;
    achados.push({ x, p: nome.startsWith(q) ? 0 : cod.startsWith(q) ? 1 : 2 });
  });
  achados.sort((a, b) => a.p - b.p || String(a.x.nome).localeCompare(String(b.x.nome)));
  return { itens: achados.slice(0, limite).map((o) => o.x), total: achados.length };
}
function pickBem(valorId, attrs, opts = {}) {
  const b = bemPorId(valorId);
  if (b) return `<div class="pick">
    <div class="pick-sel"><b title="${esc(b.nome)}">${esc(b.nome)}</b>${b.codigo ? `<em>${esc(b.codigo)}</em>` : ""}
      <button type="button" class="pick-x" data-pick-limpar="1" title="Escolher outro item">trocar</button></div>
    <input type="hidden" ${attrs} value="${esc(valorId)}"></div>`;
  return `<div class="pick">
    <input class="inp pick-in" data-pick="1" data-pick-bem="1" ${opts.criar ? 'data-pick-criar="1"' : ""} value="" autocomplete="off" spellcheck="false"
      placeholder="${esc(opts.placeholder || "digite para procurar…")}">
    <input type="hidden" ${attrs} value="">
    <div class="pick-lista" hidden></div></div>`;
}

/* attrs = os atributos do campo que guarda o valor (data-nfi, data-rc, data-prc…):
   assim o picker entra no lugar de um <select> sem mexer em quem colhe os dados */
function pickInsumo(valorId, attrs, opts = {}) {
  const ins = insumoPorId(valorId);
  if (ins) return `<div class="pick">
    <div class="pick-sel"><b title="${esc(ins.nome)}">${esc(ins.nome)}</b>${ins.codigo ? `<em>${esc(ins.codigo)}</em>` : ""}
      <button type="button" class="pick-x" data-pick-limpar="1" title="Escolher outro insumo">trocar</button></div>
    <input type="hidden" ${attrs} value="${esc(valorId)}"></div>`;
  return `<div class="pick">
    <input class="inp pick-in" data-pick="1" ${opts.criar ? 'data-pick-criar="1"' : ""} value="" autocomplete="off" spellcheck="false"
      placeholder="${esc(opts.placeholder || "digite para procurar…")}">
    <input type="hidden" ${attrs} value="">
    <div class="pick-lista" hidden></div></div>`;
}
function pickPosicionar(campo, lista) {
  const r = campo.getBoundingClientRect();
  lista.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 260)) + "px";
  lista.style.width = Math.max(r.width, 250) + "px";
  const alt = Math.min(250, lista.scrollHeight + 10);
  if (window.innerHeight - r.bottom < alt + 14 && r.top > alt + 14) {
    lista.style.top = ""; lista.style.bottom = (window.innerHeight - r.top + 4) + "px";
  } else { lista.style.bottom = ""; lista.style.top = (r.bottom + 4) + "px"; }
}
function pickPintar(campo) {
  const caixa = campo.closest(".pick"); if (!caixa) return;
  const lista = caixa.querySelector(".pick-lista"); if (!lista) return;
  const q = String(campo.value || "");
  if (q.trim().length < 2) { lista.hidden = true; lista.innerHTML = ""; return; }
  const ehBem = campo.hasAttribute("data-pick-bem");
  const r = ehBem ? bemBusca(q) : insumoBusca(q);
  const linhas = r.itens.map((x, i) => `<button type="button" class="pick-op${i === 0 ? " on" : ""}" data-pick-op="${esc(x.id)}">
    <b>${esc(x.nome)}</b>${x.codigo ? `<em>${esc(x.codigo)}</em>` : ""}${x.unidade ? `<i>${esc(x.unidade)}</i>` : ""}</button>`).join("");
  lista.innerHTML = (linhas || `<div class="pick-vazio">Nenhum ${ehBem ? "item" : "insumo"} com “${esc(q.trim())}”.</div>`)
    + (r.total > r.itens.length ? `<div class="pick-vazio">+${n0(r.total - r.itens.length)} parecidos — escreva mais para afinar.</div>` : "")
    + (campo.hasAttribute("data-pick-criar") ? `<button type="button" class="pick-op pick-novo" data-pick-op="__novo">＋ criar com este nome</button>` : "");
  lista.hidden = false;
  pickPosicionar(campo, lista);
}
const pickFechar = () => { $$(".pick-lista").forEach((l) => { l.hidden = true; }); };
function pickEscolher(campo, id) {
  const oculto = campo.closest(".pick")?.querySelector('input[type="hidden"]');
  if (!oculto) return;
  oculto.value = id;
  /* ao criar na hora, quem sabe o nome é o campo de busca — e ele some no
     próximo render. Guardar aqui é o que permite cadastrar o item com o nome
     que a pessoa acabou de escrever. */
  if (id === "__novo") oculto.dataset.novoNome = String(campo.value || "").trim();
  else delete oculto.dataset.novoNome;
  pickFechar();
  /* dispara o mesmo change que o <select> disparava: quem tratava continua tratando */
  oculto.dispatchEvent(new Event("change", { bubbles: true }));
}
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t && t.matches && t.matches("[data-pick]")) pickPintar(t);
});
document.addEventListener("mousedown", (e) => {
  const op = e.target.closest?.("[data-pick-op]");
  if (op) { e.preventDefault();   /* antes do blur, senão a lista some sob o dedo */
    const campo = op.closest(".pick")?.querySelector("[data-pick]");
    if (campo) pickEscolher(campo, op.dataset.pickOp);
    return; }
  if (!e.target.closest?.(".pick")) pickFechar();
});
document.addEventListener("click", (e) => {
  const b = e.target.closest?.("[data-pick-limpar]");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const oculto = b.closest(".pick")?.querySelector('input[type="hidden"]');
  if (!oculto) return;
  oculto.value = "";
  oculto.dispatchEvent(new Event("change", { bubbles: true }));
}, true);
document.addEventListener("keydown", (e) => {
  const campo = e.target?.closest?.("[data-pick]"); if (!campo) return;
  const lista = campo.closest(".pick")?.querySelector(".pick-lista");
  if (!lista || lista.hidden) return;
  const ops = [...lista.querySelectorAll("[data-pick-op]")];
  const k = String(e.key || "").toLowerCase();
  if (k === "escape") { e.preventDefault(); e.stopPropagation(); pickFechar(); return; }
  if (!ops.length) return;
  const i = Math.max(0, ops.findIndex((o) => o.classList.contains("on")));
  if (k === "arrowdown" || k === "arrowup") {
    e.preventDefault();
    ops.forEach((o) => o.classList.remove("on"));
    const j = (i + (k === "arrowdown" ? 1 : ops.length - 1)) % ops.length;
    ops[j].classList.add("on"); ops[j].scrollIntoView({ block: "nearest" });
  } else if (k === "enter") { e.preventDefault(); pickEscolher(campo, ops[i].dataset.pickOp); }
}, true);
/* ---------- andar pela tabela de conferência com o teclado ----------
   Lançar um mês é digitar centenas de números. Enter desce para a MESMA etapa do
   pedido seguinte, como numa planilha; as setas sobem e descem na coluna. Sem
   isso, o Tab escapa para os botões de ação entre uma linha e outra. */
document.addEventListener("keydown", (e) => {
  const cel = e.target;
  if (!cel?.dataset?.etq) return;
  const k = String(e.key || "").toLowerCase();
  if (k !== "enter" && k !== "arrowdown" && k !== "arrowup") return;
  const etapa = cel.dataset.etq.split("|")[1];
  const mesmaColuna = [...document.querySelectorAll("[data-etq]")]
    .filter((x) => x.dataset.etq.split("|")[1] === etapa);
  const i = mesmaColuna.indexOf(cel);
  if (i < 0) return;
  const j = k === "arrowup" ? i - 1 : i + 1;
  if (j < 0 || j >= mesmaColuna.length) return;
  e.preventDefault();
  /* o change da célula atual dispara sozinho ao sair; o foco vai depois dele */
  cel.blur();
  setTimeout(() => {
    const alvo = [...document.querySelectorAll("[data-etq]")]
      .filter((x) => x.dataset.etq.split("|")[1] === etapa)[j];
    if (alvo) { alvo.focus(); alvo.select?.(); alvo.scrollIntoView({ block: "nearest" }); }
  }, 0);
});
window.addEventListener("resize", pickFechar);
window.addEventListener("scroll", pickFechar, true);

/* ---------- situação ----------
   "reservado" não entra nesta versão de propósito: não existe de onde tirar.
   Ele só faz sentido quando cada produto tiver a receita cadastrada (quanto de
   cada insumo uma peça consome) — antes disso seria uma coluna de zeros. */
function situacaoInsumo(i) {
  /* com receita cadastrada, quem manda na compra é o DISPONÍVEL: comprar só
     quando o material já sumiu é comprar tarde. Sem receita, o físico é tudo
     que se sabe. */
  const saldo = temReceitaEmAlgumLugar() ? disponivelInsumo(i.id) : saldoInsumo(i.id);
  const min = Number(i.minimo) || 0;
  /* quanto falta para VOLTAR ao mínimo — e não o mínimo em si. Com o disponível
     negativo (os pedidos abertos pedem mais material do que existe), comprar só
     o mínimo não resolve: o buraco continua lá. */
  const faltam = Math.max(0, min - saldo);
  if (!min) return { id: "sem-min", nome: "Sem mínimo", tom: "off", faltam: 0 };
  if (saldo < 0) return { id: "negativo", nome: "Falta para os pedidos", tom: "erro", faltam };
  if (saldo === 0) return { id: "zerado", nome: "Zerado", tom: "erro", faltam };
  if (saldo < min) return { id: "abaixo", nome: "Abaixo do mínimo", tom: "erro", faltam };
  if (saldo < min * 1.25) return { id: "no-limite", nome: "No limite", tom: "aviso", faltam: 0 };
  return { id: "ok", nome: "OK", tom: "ok", faltam: 0 };
}
/* ---------- o mínimo que precisa estar COM a prestadora ----------
   Mesma conta do mínimo da fábrica, outro escopo. E de propósito numa lista
   separada da de Compras: "comprar" e "separar para mandar" são ações
   diferentes, de pessoas diferentes, em momentos diferentes do dia. */
const minsPrest = () => (S.cad.minPrest || (S.cad.minPrest = {}));
const minDaPrestadora = (nome, bemId) => Number((minsPrest()[String(nome || "").trim()] || {})[bemId]) || 0;
function definirMinPrestadora(nome, bemId, qtd) {
  const chave = String(nome || "").trim(); if (!chave || !bemId) return;
  const tabela = minsPrest();
  tabela[chave] = tabela[chave] || {};
  const q = Number(qtd) || 0;
  if (q > 0) tabela[chave][bemId] = q; else delete tabela[chave][bemId];
  if (!Object.keys(tabela[chave]).length) delete tabela[chave];
}
/* o que falta chegar até o mínimo, para UMA prestadora */
function reporNaPrestadora(nome) {
  const chave = String(nome || "").trim();
  const tabela = minsPrest()[chave] || {};
  return Object.keys(tabela).map((bemId) => {
    const b = bemPorId(bemId); if (!b || b.ativo === false) return null;
    const minimo = Number(tabela[bemId]) || 0;
    const com = emPosseDoBemCom(bemId, chave);
    return { bem: b, minimo, com, faltam: Math.max(0, minimo - com) };
  }).filter((x) => x && x.faltam > 0)
    .sort((a, b) => b.faltam - a.faltam);
}
/* a tela "O que enviar às prestadoras": só quem está abaixo */
function aReporNasPrestadoras() {
  return Object.keys(minsPrest())
    .map((nome) => ({ prestadora: nome, itens: reporNaPrestadora(nome) }))
    .filter((x) => x.itens.length)
    .sort((a, b) => String(a.prestadora).localeCompare(String(b.prestadora)));
}
/* saldo negativo com alguém quer dizer retirada não registrada — é informação,
   não erro, e por isso aparece em vez de travar alguma coisa */


const insumosAbaixo = () => insumos().filter((i) => i.ativo !== false)
  .map((i) => ({ i, sit: situacaoInsumo(i) }))
  .filter((x) => x.sit.faltam > 0);

/* ---------- registrar movimento ----------
   Porta única. Toda entrada, consumo, ajuste ou perda passa por aqui, e é aqui
   que o movimento ganha assinatura e hora. Nenhuma tela escreve saldo. */
function moverInsumo({ insumoId, tipo, qtd, doc, obs, custoUnit }) {
  const i = insumoPorId(insumoId);
  if (!i) return null;
  const q = Number(qtd) || 0;
  if (!q) return null;
  /* ajuste aceita os dois sinais (sobrou ou faltou no inventário); os outros
     têm sinal fixo, então o valor digitado é sempre positivo */
  const sinal = tipo === "ajuste" ? 1 : (INS_TIPOS[tipo]?.sinal || 1);
  const mov = { id: uid(), insumoId, tipo, qtd: sinal * Math.abs(q) * (tipo === "ajuste" && q < 0 ? -1 : 1),
    em: new Date().toISOString(), por: usuarioAtual()?.nome || null,
    doc: doc || null, obs: obs || null, custoUnit: Number(custoUnit) || null };
  if (tipo === "ajuste") mov.qtd = q;   /* o ajuste é o valor com o sinal que veio */
  movsInsumo().push(mov);
  esquecerSaldos();
  return mov;
}
const movsDoInsumo = (id) => movsInsumo().filter((m) => m.insumoId === id)
  .sort((a, b) => String(b.em).localeCompare(String(a.em)));

/* extrato com saldo corrente: é o que responde "de onde veio esse número" */
function extratoInsumo(id) {
  const lista = movsInsumo().filter((m) => m.insumoId === id)
    .sort((a, b) => String(a.em).localeCompare(String(b.em)));
  let saldo = 0;
  return lista.map((m) => { saldo += Number(m.qtd) || 0; return { ...m, saldo }; }).reverse();
}

/* ============================================================
   O TERCEIRO ESTOQUE — bens que saem da empresa e voltam
   ============================================================
   Três estoques, três regras, três tabelas:

   1. PRODUTO PRONTO  (S.estoque, S.produtos) — o que se vende. Manda na Demanda.
   2. INSUMO          (S.insumos, S.movInsumo) — o que se consome para produzir.
                      Entra por nota, é reservado, é consumido pela receita, tem custo.
   3. BEM EM POSSE    (S.bens, S.posseItens) — o que sai da fábrica e continua sendo
                      da empresa: caixa, máquina, tesoura, linha, fio.

   Por que não podia ser o mesmo lugar do insumo: um saldo é um NÚMERO, e a
   pergunta deste terceiro grupo tem data dentro — "saiu quando, voltou quando".
   Duas caixas saem e uma volta: num saldo isso vira "1" e a informação some.
   Aqui cada SAÍDA é uma linha, e as devoluções ficam penduradas nela.

   Nada aqui soma com nada de lá. As duas únicas pontes são:
   • a prestadora, pelo nome, como o PCP inteiro já faz;
   • `bem.insumoId`, quando o bem também é um insumo de verdade (a etiqueta) —
     e mesmo aí os saldos seguem separados: o insumo continua sendo comprado e
     consumido na fábrica, e a posse conta o que está na mão dela. */

const BEM_TIPOS = [["material", "Material de uso"], ["equipamento", "Equipamento"]];
const bens = () => S.bens || (S.bens = []);
const bemPorId = (id) => bens().find((b) => b.id === id) || null;
const bensAtivos = () => bens().filter((b) => b.ativo !== false)
  .sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
const bemDoInsumo = (insumoId) => bens().find((b) => b.ativo !== false && b.insumoId === insumoId) || null;

function proximoCodigoBem() {
  const n = bens().reduce((m, b) => { const x = String(b.codigo || "").match(/^BEM-(\d+)$/i);
    return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return "BEM-" + String(n + 1).padStart(3, "0");
}
/* cadastro mínimo, feito no meio do atendimento: nome e unidade bastam */
function criarBem(dados) {
  const nome = String(dados?.nome || "").trim();
  if (!nome) return null;
  const igual = bens().find((b) => normIns(b.nome) === normIns(nome));
  if (igual) { igual.ativo = true; return igual; }
  const b = { id: uid(), codigo: proximoCodigoBem(), nome,
    unidade: String(dados.unidade || "un").toLowerCase(),
    tipo: dados.tipo === "equipamento" ? "equipamento" : "material",
    insumoId: dados.insumoId || null,
    embalagem: dados.embalagem || null, junto: dados.junto || null,
    ativo: true, criadoEm: iso(hoje()) };
  bens().push(b);
  return b;
}

/* ---------- cada saída, com as devoluções penduradas ----------
   `baixas` guarda tudo o que reduziu a posse: devolução (voltou para a empresa)
   e consumo (virou peça, no caso da etiqueta). O tipo importa porque só a
   devolução responde "data do retorno". */
const posseItens = () => S.posseItens || (S.posseItens = []);
const posseItemPorId = (id) => posseItens().find((x) => x.id === id) || null;
const baixasDe = (x) => Array.isArray(x?.baixas) ? x.baixas : [];
const somaBaixas = (x, tipo) => baixasDe(x)
  .filter((b) => !tipo || (tipo === "devolucao" ? b.tipo !== "consumo" : b.tipo === "consumo"))
  .reduce((t, b) => t + (Number(b.qtd) || 0), 0);
const devolvidoDe = (x) => somaBaixas(x, "devolucao");
const consumidoDe = (x) => somaBaixas(x, "consumo");
const emPosseDe = (x) => Math.max(0, (Number(x?.qtd) || 0) - somaBaixas(x));
const retornoDe = (x) => baixasDe(x).filter((b) => b.tipo !== "consumo")
  .reduce((mx, b) => (!mx || String(b.em) > String(mx) ? b.em : mx), null);
function situacaoPosse(x) {
  const resta = emPosseDe(x), baixado = somaBaixas(x);
  if (resta <= 0) return consumidoDe(x) ? { id: "encerrado", nome: "Encerrado", tom: "ok" }
                                        : { id: "devolvido", nome: "Devolvido", tom: "ok" };
  if (baixado > 0) return { id: "parcial", nome: "Parcial", tom: "aviso" };
  return { id: "posse", nome: "Em posse", tom: "" };
}

function novaSaidaPosse({ bemId, prestadora, qtd, saiuEm, obs, rid }) {
  const b = bemPorId(bemId); const q = Number(qtd) || 0;
  const quem = String(prestadora || "").trim();
  if (!b || !quem || q <= 0) return null;
  const x = { id: uid(), bemId, prestadora: quem, qtd: q,
    saiuEm: saiuEm || iso(hoje()), em: new Date().toISOString(),
    por: usuarioAtual()?.nome || null, obs: (obs || "").trim() || null,
    rid: rid || null, baixas: [] };
  posseItens().push(x);
  return x;
}
/* devolver: entra uma baixa na saída mais ANTIGA que ainda tem coisa fora.
   Primeiro a sair, primeiro a voltar — é como a pessoa conta no balcão, e é o
   que faz a data de retorno bater com a caixa que de fato estava lá mais tempo. */
function baixarPosse({ bemId, prestadora, qtd, tipo, em, obs, doc }) {
  const quem = String(prestadora || "").trim();
  let resta = Number(qtd) || 0;
  if (!bemId || !quem || resta <= 0) return { ids: [], baixado: 0, sobrou: resta };
  const abertas = posseItens()
    .filter((x) => x.bemId === bemId && x.prestadora === quem && emPosseDe(x) > 0)
    .sort((a, b) => String(a.saiuEm).localeCompare(String(b.saiuEm)));
  const ids = []; let baixado = 0;
  for (const x of abertas) {
    if (resta <= 0) break;
    const cabe = Math.min(resta, emPosseDe(x));
    const bx = { id: uid(), qtd: cabe, tipo: tipo === "consumo" ? "consumo" : "devolucao",
      em: em || new Date().toISOString(), por: usuarioAtual()?.nome || null,
      obs: obs || null, doc: doc || null };
    x.baixas = [...baixasDe(x), bx];
    ids.push(bx.id); baixado += cabe; resta -= cabe;
  }
  return { ids, baixado, sobrou: resta };
}
/* desfazer baixas pelo id — é o que a reabertura da conferência precisa */
function desfazerBaixasPosse(ids) {
  const alvo = new Set(ids || []); if (!alvo.size) return 0;
  let n = 0;
  for (const x of posseItens()) {
    const antes = baixasDe(x).length;
    if (!antes) continue;
    x.baixas = baixasDe(x).filter((b) => !alvo.has(b.id));
    n += antes - x.baixas.length;
  }
  return n;
}
/* apagar saídas inteiras (desfazer uma anotação errada) */
function apagarSaidasPosse(filtro) {
  const antes = posseItens().length;
  S.posseItens = posseItens().filter((x) => !filtro(x));
  return antes - posseItens().length;
}

/* ---------- as consultas que as telas fazem ---------- */
const saidasDaPrestadora = (nome) => posseItens()
  .filter((x) => x.prestadora === String(nome || "").trim())
  .sort((a, b) => String(b.saiuEm).localeCompare(String(a.saiuEm)));
/* agrupado por bem — é o resumo "o que está com a Sandra" */
function emPosseDaPrestadora(nome) {
  const mapa = new Map();
  for (const x of saidasDaPrestadora(nome)) {
    const resta = emPosseDe(x); if (resta <= 0) continue;
    const b = bemPorId(x.bemId); if (!b) continue;
    const a = mapa.get(x.bemId) || { bem: b, qtd: 0, desde: x.saiuEm };
    a.qtd += resta;
    if (String(x.saiuEm) < String(a.desde)) a.desde = x.saiuEm;
    mapa.set(x.bemId, a);
  }
  return [...mapa.values()].sort((a, b) => String(a.bem.nome).localeCompare(String(b.bem.nome)));
}
const emPosseDoBem = (bemId) => posseItens()
  .filter((x) => x.bemId === bemId).reduce((t, x) => t + emPosseDe(x), 0);
const emPosseDoBemCom = (bemId, nome) => posseItens()
  .filter((x) => x.bemId === bemId && x.prestadora === String(nome || "").trim())
  .reduce((t, x) => t + emPosseDe(x), 0);
/* quem tem alguma coisa da empresa na mão agora */
function prestadorasComPosse() {
  const nomes = new Set();
  for (const x of posseItens()) if (emPosseDe(x) > 0) nomes.add(x.prestadora);
  for (const p of posses()) if (p.status !== "encerrada") nomes.add(p.prestadora);
  return [...nomes].filter(Boolean).sort((a, b) => a.localeCompare(b));
}
const ultimaMovPrestadora = (nome) => {
  const alvo = String(nome || "").trim();
  let mx = null;
  for (const x of posseItens()) { if (x.prestadora !== alvo) continue;
    for (const d of [x.saiuEm, ...baixasDe(x).map((b) => b.em)]) if (!mx || String(d) > String(mx)) mx = d; }
  return mx;
};

/* ---------- a produção que está com a prestadora ----------
   O único pedaço deste controle que NÃO é estoque. Bandana sai da fábrica em
   lote de corte, sem SKU e sem contagem: o fornecedor manda estampa nova toda
   semana e ninguém conta 40 mil peças no balcão. Forçar isso a virar pedido
   estragaria duas contas de uma vez — a Demanda passaria a enxergar peça que
   não foi pedida, e o fechamento passaria a pagar por quantidade inventada.

   Então este registro é honesto sobre o que sabe: o grupo, o tipo e os tamanhos.
   Quantidade, SKU e coleção existem, mas nenhum é obrigatório. Quando houver um
   pedido de verdade por trás, ele fica amarrado e a conferência encerra a posse
   sozinha — ninguém precisa lembrar de apagar a linha depois. */
const POSSE_CATS = [["dia", "Dia a dia"], ["festiva", "Data festiva"]];
const POSSE_VARS = [["digital", "Digital"], ["normal", "Normal"]];
const POSSE_TAMS = ["P", "M", "G", "GG"];
const posses = () => S.posse || (S.posse = []);
const possePorId = (id) => posses().find((p) => p.id === id) || null;
const posseNaMao = (nome) => posses().filter((p) => p.status !== "encerrada"
  && String(p.prestadora || "") === String(nome || "").trim())
  .sort((a, b) => String(b.em).localeCompare(String(a.em)));

/* o rótulo é o que vira a frase da tela: "Halloween · P/M/G" */
function posseRotulo(p) {
  if (!p) return "";
  const partes = [];
  if (p.categoria === "festiva") partes.push(String(p.campanha || "").trim() || "Data festiva");
  else { partes.push("Dia a dia");
    const v = POSSE_VARS.find((x) => x[0] === p.variante); if (v) partes.push(v[1]); }
  if (String(p.colecao || "").trim()) partes.push(String(p.colecao).trim());
  const tams = (p.tamanhos || []).filter((t) => POSSE_TAMS.includes(t));
  if (tams.length) partes.push(tams.join("/"));
  if (Number(p.qtd) > 0) partes.push(`${n0(p.qtd)} pç`);
  return partes.join(" · ");
}
function novaPosse(dados) {
  const p = { id: uid(), prestadora: String(dados.prestadora || "").trim(),
    em: dados.em || new Date().toISOString(), por: usuarioAtual()?.nome || null,
    tipo: dados.tipo || "Bandana",
    categoria: dados.categoria === "festiva" ? "festiva" : "dia",
    variante: dados.variante || null, campanha: (dados.campanha || "").trim() || null,
    tamanhos: (dados.tamanhos || []).filter((t) => POSSE_TAMS.includes(t)),
    colecao: (dados.colecao || "").trim() || null,
    sku: (dados.sku || "").trim() || null,
    qtd: Number(dados.qtd) > 0 ? Number(dados.qtd) : null,
    obs: (dados.obs || "").trim() || null,
    /* `data` é o dia que a pessoa informou (pode não ser hoje) e `rid` liga a
       produção à retirada em que ela saiu. Os dois vinham sendo passados por
       quem chama e descartados aqui em silêncio: a linha do tempo mostrava a
       data errada e desfazer a retirada deixava a produção órfã na posse dela. */
    data: dados.data || null, rid: dados.rid || null,
    pedidoId: dados.pedidoId || null, status: "com" };
  if (!p.prestadora) return null;
  if (p.categoria === "festiva") p.variante = null; else p.campanha = null;
  posses().push(p);
  return p;
}
function encerrarPosse(id, motivo) {
  const p = possePorId(id); if (!p || p.status === "encerrada") return false;
  p.status = "encerrada"; p.encerradaEm = new Date().toISOString();
  p.encerradaPor = usuarioAtual()?.nome || null; p.encerradaMotivo = motivo || null;
  return true;
}
function reabrirPosse(id) {
  const p = possePorId(id); if (!p || p.status !== "encerrada") return false;
  p.status = "com"; delete p.encerradaEm; delete p.encerradaPor; delete p.encerradaMotivo;
  return true;
}
/* as posses que um pedido fechou — é o que a reabertura da conferência precisa desfazer */
const possesDoPedido = (pedidoId) => posses().filter((p) => p.pedidoId && p.pedidoId === pedidoId);

/* ---------- as últimas retiradas ----------
   Quem digita erra, e o conserto precisa estar à mão logo depois — não numa
   tela de administração que ela nem enxerga. Por isso a lista fica na mesma
   aba em que ela acabou de registrar. */
function retiradasRecentes(limite = 25) {
  const mapa = new Map();
  const pega = (rid, base) => { let g = mapa.get(rid);
    if (!g) { g = { rid, itens: [], prods: [], ...base }; mapa.set(rid, g); }
    return g; };
  for (const x of posseItens()) {
    if (!x.rid) continue;
    const b = bemPorId(x.bemId);
    pega(x.rid, { prestadora: x.prestadora, em: x.em, quando: x.saiuEm, por: x.por, sentido: "saida" })
      .itens.push({ nome: b?.nome || "item removido", qtd: x.qtd, un: b?.unidade || "un", emPosse: emPosseDe(x) });
  }
  /* devoluções também são anotações, e também precisam poder ser conferidas */
  for (const x of posseItens()) for (const bx of baixasDe(x)) {
    if (!bx.rid || bx.tipo === "consumo") continue;
    const b = bemPorId(x.bemId);
    pega(bx.rid, { prestadora: x.prestadora, em: bx.em, quando: bx.em, por: bx.por, sentido: "volta" })
      .itens.push({ nome: b?.nome || "item removido", qtd: bx.qtd, un: b?.unidade || "un" });
  }
  for (const p of posses()) {
    if (!p.rid) continue;
    pega(p.rid, { prestadora: p.prestadora, em: p.em, quando: p.data || p.em, por: p.por, sentido: "saida" }).prods.push(p);
  }
  return [...mapa.values()].sort((a, b) => String(b.em).localeCompare(String(a.em))).slice(0, limite);
}
/* desfazer é inteiro ou não é: os dois lados de cada par e as produções juntas */
function desfazerRetirada(rid) {
  if (!rid) return { itens: 0, prods: 0 };
  /* uma saída só se apaga inteira, e só enquanto ninguém devolveu nem consumiu
     nada dela — senão apagar reescreveria uma devolução que aconteceu */
  const itens = apagarSaidasPosse((x) => x.rid === rid && !baixasDe(x).length);
  /* devolução anotada errado: some a baixa, e o item volta a constar com ela */
  let baixas = 0;
  for (const x of posseItens()) {
    const antes = baixasDe(x).length; if (!antes) continue;
    x.baixas = baixasDe(x).filter((b) => b.rid !== rid);
    baixas += antes - x.baixas.length;
  }
  const antesP = posses().length;
  S.posse = posses().filter((p) => p.rid !== rid);
  return { itens: itens + baixas, prods: antesP - posses().length };
}
/* dois dias para desfazer. Passado isso, o certo não é apagar a história: é
   registrar a devolução, que é o que de fato aconteceu no mundo. */
const PRAZO_DESFAZER = 2;
const daParaDesfazer = (g) => { const d = new Date(g.em);
  return isFinite(d) && (Date.now() - d.getTime()) < PRAZO_DESFAZER * 86400000; };


/* ==========================================================================
   O QUARTO ESTOQUE — SEMIACABADOS (bandana sem SKU)
   ==========================================================================
   A bandana sai cortada, volta costurada, e só DEPOIS vira produto acabado.
   Entre uma coisa e outra ela existe de verdade — está na fábrica, custou
   dinheiro, pode sumir — mas não é nenhum dos três estoques que já havia:

     insumos          o que se compra para consumir
     produtos prontos o SKU que a loja vende
     em posse         material da empresa que está com a prestadora
     SEMIACABADOS     a peça pronta que ainda não é SKU        <- este arquivo

   Eles nunca se somam e nunca trocam movimento. O código interno abaixo
   (BAND-P-DD) PARECE um SKU e não é: não vende, não entra na Demanda, não
   entra no estoque de produto pronto e não aparece na loja.

   A REGRA QUE MANDA EM TUDO AQUI:

     Na IDA controla-se POSSE e VOLUME.  ("saíram 2 caixas para a Cida")
     Na VOLTA controla-se QUANTIDADE DE PEÇAS. ("voltaram 380 bandanas P")

   Por isso a remessa NÃO TEM campo de quantidade de peças na saída — não é
   que ele seja opcional, é que ele não existe. Ninguém sabe quantas peças
   foram, e um número inventado na saída viraria falta inventada na volta.
   Pelo mesmo motivo "1 caixa" nunca é convertido em peças: caixa é caixa.
   ========================================================================== */
const SEMI_TAMS = ["P", "M", "G", "GG"];
const SEMI_CATS = [["dia", "Dia a dia"], ["festiva", "Data festiva"]];
const SEMI_VARS = [["digital", "Digital"], ["normal", "Normal"]];
/* unidade do VOLUME — o que se conta na saída. Nunca vira peça. */
const SEMI_UNS = ["caixa", "sacola", "fardo", "rolo", "pacote"];

const semiTipos = () => S.semiTipos || (S.semiTipos = []);
const semiPorId = (id) => semiTipos().find((t) => t.id === id) || null;
const semiPorCodigo = (c) => { const k = String(c || "").trim().toUpperCase();
  return k ? semiTipos().find((t) => String(t.codigo).toUpperCase() === k) || null : null; };
const semiAtivos = () => semiTipos().filter((t) => t.ativo !== false)
  .slice().sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));

/* o código nasce sugerido e editável: quem manda no nome é a fábrica, não o app */
function semiCodigoSugerido(d) {
  const base = String(d?.tipo || "Bandana").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) || "BAND";
  const tam = SEMI_TAMS.includes(d?.tamanho) ? d.tamanho : "";
  const fest = d?.categoria === "festiva";
  const partes = [base, tam, fest ? "DF" : "DD"];
  if (fest) { const c = String(d?.campanha || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4); if (c) partes.push(c); }
  else if (d?.variante === "normal") partes.push("N");
  return partes.filter(Boolean).join("-");
}
/* a frase da tela: "Bandana P · Halloween" ou "Bandana G · Dia a dia · Digital" */
function semiRotulo(t) {
  if (!t) return "semiacabado removido";
  const p = [String(t.tipo || "Bandana").trim() + (t.tamanho ? " " + t.tamanho : "")];
  if (t.categoria === "festiva") p.push(String(t.campanha || "").trim() || "Data festiva");
  else { p.push("Dia a dia");
    const v = SEMI_VARS.find((x) => x[0] === t.variante); if (v) p.push(v[1]); }
  return p.join(" · ");
}
function novoSemiTipo(d) {
  const codigo = String(d?.codigo || "").trim().toUpperCase() || semiCodigoSugerido(d);
  if (!codigo) return null;
  if (semiPorCodigo(codigo)) return null;   /* código é identidade: não se repete */
  const t = { id: uid(), codigo,
    tipo: String(d?.tipo || "Bandana").trim() || "Bandana",
    tamanho: SEMI_TAMS.includes(d?.tamanho) ? d.tamanho : null,
    categoria: d?.categoria === "festiva" ? "festiva" : "dia",
    variante: null, campanha: null,
    minimo: Number(d?.minimo) > 0 ? Number(d.minimo) : 0,
    obs: String(d?.obs || "").trim() || null,
    ativo: true, em: new Date().toISOString(), por: usuarioAtual()?.nome || null,
    atualizado: new Date().toISOString() };
  if (t.categoria === "festiva") t.campanha = String(d?.campanha || "").trim() || null;
  else t.variante = SEMI_VARS.some((x) => x[0] === d?.variante) ? d.variante : "digital";
  semiTipos().push(t);
  return t;
}

