/* ---------- busca rápida (Ctrl+K) ----------
   Um campo só para achar qualquer coisa: número de pedido, SKU, nome do produto,
   prestadora ou uma tela. Quem está no chão de fábrica quase sempre chega com um
   número na mão — o caminho até ele não deveria passar por escolher a aba certa
   primeiro e depois filtrar. */
const CMD_POR_GRUPO = 5;
function buscarTudo(q) {
  const t = String(q || "").trim();
  if (t.length < 1) return [];
  const alvo = t.toLowerCase();
  const num = semPrefixoBipe(t).trim().toUpperCase();
  const semZero = num.replace(/^0+/, "");
  const pedidos = [], produtos = [], prests = [], abas = [];

  /* pedidos: número exato primeiro, depois começa-com — é como a pessoa lembra */
  if (semZero) for (const r of S.pedidos) {
    const nu = String(r.numero || "").toUpperCase(), sz = nu.replace(/^0+/, "");
    if (nu === num || sz === semZero) pedidos.unshift({ t: "pedido", r, exato: 1 });
    else if (sz.startsWith(semZero) && pedidos.length < 40) pedidos.push({ t: "pedido", r, exato: 0 });
  }
  /* produtos: SKU exato, SKU contém, e por fim o nome do produto */
  for (const p of S.produtos) {
    const sku = String(p.sku || "").toUpperCase();
    if (sku === num) produtos.unshift({ t: "produto", p, exato: 1 });
    else if (produtos.length < 40 && num.length >= 2 && sku.includes(num)) produtos.push({ t: "produto", p, exato: 0 });
    else if (produtos.length < 40 && alvo.length >= 3 && String(p.descricao || "").toLowerCase().includes(alvo))
      produtos.push({ t: "produto", p, exato: 0 });
  }
  for (const pr of (S.cad.prestadoras || [])) {
    const n2 = String(pr.nome || "").toLowerCase();
    if (n2.includes(alvo)) prests.push({ t: "prestadora", pr, exato: n2 === alvo ? 1 : 0 });
  }
  if (alvo.length >= 2) for (const [id, nome] of ABAS_TODAS) {
    if (podeAba(id) && nome.toLowerCase().includes(alvo)) abas.push({ t: "aba", id, nome });
  }
  const corta = (l) => l.sort((a, b) => (b.exato || 0) - (a.exato || 0)).slice(0, CMD_POR_GRUPO);
  return [...corta(pedidos), ...corta(produtos), ...corta(prests), ...abas.slice(0, 3)];
}

function abrirBuscaRapida() {
  S.cmd = { q: "", i: 0, itens: [] };
  render();
}
function abrirResultado(it) {
  S.cmd = null;
  if (!it) { render(); return; }
  if (it.t === "pedido") {
    S.aba = "pedidos";
    S.modal = { tipo: "pedido", pedido: it.r, foto: fotoPedido(it.r) };
  } else if (it.t === "produto") {
    /* o painel do SKU precisa da linha de estoque; sem ela, abre o cadastro */
    if (S.calc?.porSku?.has(it.p.sku)) S.drawer = it.p.sku;
    else S.modal = { tipo: "produto", produto: it.p, novo: false };
  } else if (it.t === "prestadora") {
    S.aba = "pedidos";
    S.pedView.busca = it.pr.nome; S.pedView.etapa = "andamento"; S.pedView.limite = 50;
    lembrarAba();
  } else if (it.t === "aba") { S.aba = it.id; lembrarAba(); }
  render();
}
const ROT_CMD = { pedido: "Pedidos", produto: "Produtos", prestadora: "Prestadoras", aba: "Ir para" };
function listaCmd() {
  const c = S.cmd;
  if (!c) return "";
  if (!String(c.q || "").trim()) return `<div class="cmd-vazio">Digite um número de pedido, um SKU, o nome de um produto ou de uma prestadora.</div>`;
  if (!c.itens.length) return `<div class="cmd-vazio">Nada encontrado para <b>${esc(c.q)}</b>.</div>`;
  let html = "", grupo = null;
  c.itens.forEach((it, i) => {
    if (it.t !== grupo) { grupo = it.t; html += `<div class="cmd-grupo">${ROT_CMD[it.t]}</div>`; }
    const sel = i === c.i ? " on" : "";
    if (it.t === "pedido") {
      const sku = opPorId(it.r.opId)?.sku || it.r.sku;
      html += `<button class="cmd-it${sel}" data-cmd-i="${i}"><span class="sku">${esc(it.r.numero)}</span>
        <span class="cmd-d">${esc(sku || "")}</span>
        <span class="cmd-m">${esc(P_LABEL[it.r.status] || it.r.status)}${it.r.prestadora ? " · " + esc(it.r.prestadora) : ""}</span></button>`;
    } else if (it.t === "produto") {
      html += `<button class="cmd-it${sel}" data-cmd-i="${i}"><span class="sku">${esc(it.p.sku)}</span>
        <span class="cmd-d">${esc(it.p.descricao || "")}</span>
        <span class="cmd-m">${esc(it.p.processo || "")}</span></button>`;
    } else if (it.t === "prestadora") {
      const n2 = S.pedidos.filter((r) => r.prestadora === it.pr.nome && PED_VIVO.includes(r.status)).length;
      html += `<button class="cmd-it${sel}" data-cmd-i="${i}"><span class="cmd-d" style="font-weight:600">${esc(it.pr.nome)}</span>
        <span class="cmd-m">${n0(n2)} ${n2 === 1 ? "pedido em aberto" : "pedidos em aberto"}</span></button>`;
    } else {
      html += `<button class="cmd-it${sel}" data-cmd-i="${i}"><span class="cmd-d" style="font-weight:600">${esc(it.nome)}</span>
        <span class="cmd-m">abrir a aba</span></button>`;
    }
  });
  return html;
}
function renderBuscaRapida() {
  if (!S.cmd) return "";
  return `<div class="ov cmd-ov" data-cmd-fora="1">
    <div class="cmd" role="dialog" aria-label="Busca rápida">
      <div class="cmd-h">${svg(IC.busca)}
        <input class="cmd-inp" id="cmd-q" value="${esc(S.cmd.q || "")}" autocomplete="off" spellcheck="false"
          placeholder="Buscar SKU, pedido, produto ou prestadora…">
        <kbd>esc</kbd></div>
      <div class="cmd-b" id="cmd-lista">${listaCmd()}</div>
      <div class="cmd-f"><kbd>↑</kbd><kbd>↓</kbd> navegar &nbsp; <kbd>enter</kbd> abrir</div>
    </div></div>`;
}
function repintarCmd() {
  const cx = document.getElementById("cmd-lista");
  if (cx) cx.innerHTML = listaCmd();
}
