/* ---------- navegação por teclado nas listas ----------
   O sistema é operacional e tabular: quem usa o dia inteiro não deveria precisar
   do mouse para percorrer a fila. As setas movem a linha ativa, Enter abre. */
function linhasNavegaveis() {
  return [...document.querySelectorAll(".page .t tbody tr")]
    .filter((tr) => !tr.querySelector("td[colspan]"));
}
function moverLinha(d) {
  const ls = linhasNavegaveis();
  if (!ls.length) return;
  let i = ls.findIndex((tr) => tr.classList.contains("linha-ativa"));
  i = i < 0 ? (d > 0 ? 0 : ls.length - 1) : (i + d + ls.length) % ls.length;
  ls.forEach((tr) => tr.classList.remove("linha-ativa"));
  ls[i].classList.add("linha-ativa");
  ls[i].scrollIntoView({ block: "nearest" });
}
/* Enter na linha ativa faz o mesmo que o clique faria naquela linha */
function abrirLinhaAtiva() {
  const tr = document.querySelector(".page .t tbody tr.linha-ativa");
  if (!tr) return false;
  if (tr.dataset.sku) { S.drawer = tr.dataset.sku; render(); return true; }
  if (tr.dataset.produto) { const alvo = tr.querySelector("[data-editar-produto]"); if (alvo) { alvo.click(); return true; } }
  const ed = tr.querySelector("[data-editar-pedido]");
  if (ed) { ed.click(); return true; }
  const primeiro = tr.querySelector("td:last-child .btn, .col-acao .btn");
  if (primeiro) { primeiro.click(); return true; }
  return false;
}
/* qual campo de busca pertence à tela aberta */
const BUSCA_DA_ABA = { demanda: "q-dem", pedidos: "q-ped", historico: "q-hist",
  produtos: "q-prod-cad", prestadoras: "q-prest", compras: "q-compras", conferencia: "q-conf",
  insumos: "q-insumo" };
let _atalhoTimer = null;
const agendarAtalho = (fn) => { clearTimeout(_atalhoTimer); _atalhoTimer = setTimeout(fn, 60); };
const ATALHOS = [
  ["Ctrl + K", "Busca rápida — pedido, SKU, produto ou prestadora"],
  ["↑ ↓", "Percorrer as linhas da lista"],
  ["Enter", "Abrir a linha ativa · confirmar a janela aberta"],
  ["Esc", "Fechar a janela ou o painel lateral"],
  ["A", "Ir para o campo de busca desta tela"],
  ["N", "Novo pedido de produção"],
  ["D", "Demanda"], ["P", "Pedidos"], ["F", "Fila de corte"], ["T", "Tarefas"],
  ["?", "Esta lista"],
];
function moverCmd(d) {
  if (!S.cmd || !S.cmd.itens.length) return;
  S.cmd.i = (S.cmd.i + d + S.cmd.itens.length) % S.cmd.itens.length;
  repintarCmd();
  document.querySelector(".cmd-it.on")?.scrollIntoView({ block: "nearest" });
}

