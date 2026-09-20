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

   O QUE AINDA NÃO EXISTE
     A ficha do Projeto de Corte (criar, versionar, herdar) é a próxima versão.
     Aqui a sub-aba já existe e mostra o estado real da tabela — vazia, hoje —
     com a explicação da hierarquia. Sem botão que não faz nada: botão morto é
     promessa que a tela não cumpre.
   =========================================================================== */

let PROC_VIEW = { sub: "projeto", projetos: null, carregou: false, erro: null };

/* A contagem de projetos vem direto do servidor porque ainda não existe um
   `src/corte/projetos.js` — ele nasce com a ficha, na próxima versão, e esta
   leitura muda de endereço junto. É uma linha de leitura, sem gravação. */
function procGarantirCarga() {
  if (PROC_VIEW.carregou) return;
  PROC_VIEW.carregou = true;
  if (typeof persLer !== "function") return;
  persLer("pcp_projeto_corte?deleted_at=is.null&select=id,nome,escopo&order=nome.asc&limit=200")
    .then((r) => {
      if (r.ok) { PROC_VIEW.projetos = persLista(r.corpo); PROC_VIEW.erro = null; }
      else { PROC_VIEW.erro = "não-consegui"; PROC_VIEW.carregou = false; }
      render();
    })
    .catch(() => { PROC_VIEW.carregou = false; });
}

function viewProjetoCorte() {
  procGarantirCarga();
  const lista = PROC_VIEW.projetos;

  const ajuda = `<div class="cr-ajuda">O Projeto de Corte é a <b>ficha técnica</b> de como cortar as
    fitas de um produto. Ele não pertence ao pedido nem à OP: o pedido <b>referencia</b> a versão
    que estava valendo quando o papel foi impresso.
    Vale do mais geral para o mais específico — <b>família</b> (todos os 3xx) &lt;
    <b>combinação</b> (um recorte dentro dela) &lt; <b>exceção do SKU</b> — e a mais específica
    vence <b>bloco a bloco</b>: um SKU pode ter cortes próprios e continuar herdando o fitilho da
    família.</div>`;

  if (lista === null) {
    return `<section class="card">
      <div class="card-h"><h2>Projeto de corte</h2></div>
      ${ajuda}
      <div class="empty" style="padding:36px">
        <h3>${PROC_VIEW.erro ? "Não consegui ler os projetos agora" : "Carregando…"}</h3>
        <p>${PROC_VIEW.erro ? "Sem conexão ou sem sessão. A lista aparece assim que o servidor responder." : ""}</p>
      </div></section>`;
  }

  if (!lista.length) {
    return `<section class="card">
      <div class="card-h"><h2>Projeto de corte</h2></div>
      ${ajuda}
      <div class="empty" style="padding:36px">
        <h3>Nenhum Projeto de Corte cadastrado</h3>
        <p>A tela de cadastro da ficha chega na próxima versão. Enquanto isso, o
           <b>Cadastro de fitas</b> ao lado já funciona — é dele que a receita de corte vai se servir.</p>
      </div></section>`;
  }

  /* já existem projetos: lista simples de consulta, sem ação — quem edita é a
     ficha, que ainda não existe */
  return `<section class="card">
    <div class="card-h"><h2>Projeto de corte</h2><span class="hint">${lista.length} projeto(s)</span></div>
    ${ajuda}
    <table class="lista">
      <thead><tr><th>Projeto</th><th>Escopo</th></tr></thead>
      <tbody>${lista.map((p) => `<tr><td><b>${esc(p.nome || "")}</b></td><td>${esc(p.escopo || "")}</td></tr>`).join("")}</tbody>
    </table>
    <div class="hint" style="padding:0 14px 16px">Consulta apenas. A edição da ficha chega na próxima versão.</div>
  </section>`;
}

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
