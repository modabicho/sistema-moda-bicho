document.addEventListener("keydown", (e) => {
  /* Tecla já consumida por outro tratador — o leitor de código faz isso no Enter
     que fecha a leitura. Sem esta linha, o mesmo Enter abria o pedido pelo bipe
     e em seguida clicava no "Salvar" da janela que acabara de abrir. */
  if (e.defaultPrevented) return;
  const k = String(e.key || "").toLowerCase();
  /* Ctrl+K (ou Cmd+K no Mac) abre a busca rápida de qualquer lugar do app */
  if (k === "k" && (e.ctrlKey || e.metaKey) && !e.altKey) {
    e.preventDefault();
    if (S.cmd) { S.cmd = null; render(); } else abrirBuscaRapida();
    return;
  }
  if (S.cmd) {
    if (k === "escape") { e.preventDefault(); S.cmd = null; render(); return; }
    if (k === "arrowdown") { e.preventDefault(); moverCmd(1); return; }
    if (k === "arrowup") { e.preventDefault(); moverCmd(-1); return; }
    if (k === "enter") { e.preventDefault(); abrirResultado(S.cmd.itens[S.cmd.i]); return; }
    return;
  }
  if (k === "escape" && (S.modal || S.drawer)) { e.preventDefault(); S.modal = null; S.drawer = null; render(); return; }

  /* ---------- atalhos operacionais ----------
     Nada de letra solta enquanto alguém digita, e nada durante uma leitura do
     bipe: o leitor manda o código como se fosse teclado, e uma letra do meio do
     código não pode virar comando. */
  clearTimeout(_atalhoTimer); /* qualquer tecla nova cancela o atalho ainda pendente */
  const alvo = e.target;
  const digitando = alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA"
    || alvo.tagName === "SELECT" || alvo.isContentEditable);
  /* O leitor de código digita como se fosse teclado. Duas defesas:
     1. se o que já chegou parece um código, nada de atalho;
     2. a letra só vira comando 60ms depois — se outra tecla chegar antes, cancela.
        Gente digita uma letra e para; leitor manda a seguinte em ~20ms. */
  const lendoBipe = comecoDeBipe(bipe.buf) && Date.now() - bipe.t < 600;

  /* Enter confirma a janela aberta (o botão principal do rodapé) */
  if (k === "enter" && S.modal && !e.shiftKey
      && (!alvo || (alvo.tagName !== "TEXTAREA" && alvo.tagName !== "BUTTON" && alvo.tagName !== "A"))) {
    const btn = document.querySelector(".modal-f .btn.primary:not([disabled])");
    if (btn) { e.preventDefault(); btn.click(); return; }
  }
  if (digitando || S.modal || lendoBipe) return;

  /* setas percorrem a lista da tela */
  if (k === "arrowdown") { e.preventDefault(); moverLinha(1); return; }
  if (k === "arrowup") { e.preventDefault(); moverLinha(-1); return; }
  if (k === "enter") { if (abrirLinhaAtiva()) e.preventDefault(); return; }

  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const ir = (aba) => () => { S.aba = aba; lembrarAba(); render(); };
  const acao =
      k === "?" || (k === "/" && e.shiftKey) ? () => { S.modal = { tipo: "atalhos" }; render(); }
    : k === "a" ? () => { const c = $("#" + (S.rel.aberto && S.aba === "demanda" ? "q-rel" : BUSCA_DA_ABA[S.aba] || "")); if (c) { c.focus(); c.select(); } }
    : k === "n" ? () => { S.modal = { tipo: "novoPedido" }; render(); if (typeof pedCicloRefrescar === "function") pedCicloRefrescar(["novoPedido"]); }
    : k === "d" && podeAba("demanda") ? ir("demanda")
    : k === "p" && podeAba("pedidos") ? ir("pedidos")
    : k === "t" && podeAba("tarefas") ? ir("tarefas")
    : k === "f" && podeAba("pedidos") ? () => { S.pedView.etapa = "fila"; S.pedView.limite = 50; S.aba = "pedidos"; lembrarAba(); render(); }
    : null;
  if (acao) { e.preventDefault(); agendarAtalho(acao); }
});

/* erros de execução viram toast, para nunca falharem em silêncio */
/* Um erro só deve gerar UM aviso — havia dois listeners mostrando a mesma coisa duas vezes.
   E o aviso passa a dizer a LINHA, senão não há como localizar a origem por um print. */
function avisarErro(msg, onde) {
  const txt = String(msg || "desconhecido").slice(0, 140) + (onde ? `\n(${onde})` : "");
  if (avisarErro._ultimo === txt) return; /* o mesmo erro repetido não vira fila de avisos */
  avisarErro._ultimo = txt;
  setTimeout(() => { avisarErro._ultimo = null; }, 4000);
  try { toast(txt, "erro"); } catch {}
  try { console.error("[PCP]", msg, onde); } catch {}
}
window.addEventListener("error", (e) => {
  const arq = String(e.filename || "").split("/").pop();
  avisarErro(e.message || e.error, e.lineno ? `${arq}:${e.lineno}:${e.colno} · v${VERSAO}` : `v${VERSAO}`);
});
window.addEventListener("unhandledrejection", (e) => {
  const st = String(e.reason?.stack || "").split("\n")[1] || "";
  avisarErro(e.reason?.message || e.reason, (st.trim().slice(0, 70) || "") + ` · v${VERSAO}`);
});


/* ============================================================================
   FOCO PRESO DENTRO DA JANELA
   ----------------------------------------------------------------------------
   Com uma janela aberta, o Tab saía dela e ia passear pela tela de trás: quem
   navega por teclado perdia a janela de vista sem ter fechado nada, e o leitor
   de tela começava a ler a tabela que estava atrás do véu. Uma janela que pede
   uma decisão tem de segurar o foco até a decisão sair.

   Três partes:
     1. o Tab e o Shift+Tab circulam só pelos controles da janela;
     2. quando a janela abre, o foco entra nela;
     3. quando fecha, o foco VOLTA para o botão que a abriu — senão a pessoa é
        devolvida ao começo da página e tem de refazer todo o caminho.

   A parte 3 é a que dá trabalho: o `render()` reconstrói o DOM inteiro, então
   guardar o elemento não adianta — ele deixa de existir. O que se guarda é
   como ACHÁ-LO de novo: o primeiro atributo `data-*` dele, que é justamente o
   que este app usa para identificar ação e registro.
   ============================================================================ */
const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]),'
  + ' select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focaveisDe(raiz) {
  return [...raiz.querySelectorAll(FOCAVEIS)].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  });
}
const janelaAberta = () => document.querySelector(".modal") || document.querySelector(".gaveta");

/* como reencontrar um elemento depois que o render trocou o DOM debaixo dele */
function seletorDe(el) {
  if (!el || !el.attributes) return null;
  for (const a of el.attributes) {
    if (a.name.startsWith("data-") && a.value && a.name !== "data-linha") {
      try { return `[${a.name}="${CSS.escape(a.value)}"]`; } catch { return null; }
    }
  }
  if (el.id) { try { return "#" + CSS.escape(el.id); } catch { return null; } }
  return null;
}

let _quemAbriu = null;

/* quem clicou por último, antes de a janela existir: é para ele que o foco volta */
document.addEventListener("click", (e) => {
  if (janelaAberta()) return;                 /* clique DENTRO da janela não conta */
  const alvo = e.target && e.target.closest ? e.target.closest("button, [role=button], a[href]") : null;
  if (alvo) _quemAbriu = seletorDe(alvo);
}, true);

document.addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  const j = janelaAberta(); if (!j) return;
  const f = focaveisDe(j);
  if (!f.length) { e.preventDefault(); return; }   /* janela sem controle: o Tab não sai dela */
  const primeiro = f[0], ultimo = f[f.length - 1];
  if (!j.contains(document.activeElement)) {
    e.preventDefault(); (e.shiftKey ? ultimo : primeiro).focus(); return;
  }
  if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
  else if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
}, true);

/* abrir e fechar: o `render()` troca o DOM, então quem avisa é o próprio DOM */
(() => {
  if (typeof MutationObserver !== "function") return;
  let tinha = false;
  const olho = new MutationObserver(() => {
    const j = janelaAberta();
    const tem = !!j;
    if (tem && !tinha) {
      /* o foco entra na janela — no primeiro campo se houver, senão no primeiro
         controle. Campo antes de botão: quem abre um formulário quer digitar. */
      const f = focaveisDe(j);
      const campo = f.find((x) => /^(INPUT|TEXTAREA|SELECT)$/.test(x.tagName));
      (campo || f[0])?.focus();
    } else if (!tem && tinha) {
      if (_quemAbriu) {
        try { document.querySelector(_quemAbriu)?.focus(); } catch {}
        _quemAbriu = null;
      }
    }
    tinha = tem;
  });
  olho.observe(document.body, { childList: true, subtree: true });
})();
