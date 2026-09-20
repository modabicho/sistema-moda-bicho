/* ===========================================================================
   src/telas/processos.js · A ABA PROCESSOS
   ---------------------------------------------------------------------------
   v8.108. A casca do módulo: a barra de sub-abas e o despacho.

     Processos
       ├─ Projeto de corte   ← o módulo principal; abre aqui
       └─ Fitas              ← cadastro auxiliar dele

   A estrutura vem do protótipo aprovado (`prototipos/corte/corte.js:2291`):
   aba principal em Cadastros, entre Produtos e Insumos, e uma barra de
   sub-abas logo abaixo do título. Não é desenho novo.

   A v8.107 pôs Fitas como aba principal do PCP. Estava errado: Fitas é
   infraestrutura do Projeto de Corte, não um módulo irmão de Pedidos. Esta
   versão corrige a navegação sem tocar em uma linha da persistência.

   v8.109 · a ficha do Projeto de Corte passou a existir: a casca continua
   sendo só a barra e o despacho.
   =========================================================================== */

let PROC_VIEW = { sub: "projeto" };

/* A sub-aba Projeto de corte é `viewProjetoCorte`, em telas/projeto-corte.js;
   Fitas é `viewFitasArea`, em telas/fitas.js. Esta casca só escolhe. */

function viewProcessos() {
  const subs = [["projeto", "Projeto de corte"], ["fitas", "Fitas"]];
  const sub = PROC_VIEW.sub === "fitas" ? "fitas" : "projeto";
  return `<section class="tela-processos">
    <div class="pc-subs cr-abas">${subs.map(([k, n]) =>
      `<button class="btn ${sub === k ? "primary" : ""}" data-proc="${k}">${esc(n)}</button>`).join("")}</div>
    ${sub === "fitas" ? viewFitasArea() : viewProjetoCorte()}
  </section>`;
}

/* a porta dos cliques desta aba, chamada por acoes/clique.js */
function procClique(alvo) {
  const v = alvo.dataset.proc;
  if (v !== "projeto" && v !== "fitas") return false;
  PROC_VIEW.sub = v;
  render();
  return true;
}
