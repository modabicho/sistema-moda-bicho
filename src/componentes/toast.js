/* ---------- feedback e componentes ---------- */
/* ---------- política dos `catch {}` silenciosos ----------
   Engolir erro é legítimo em três lugares, e só neles:
     1. CONFORTO — presença, área de transferência, foco, rolagem, impressão,
        `localStorage` de preferência de tela. Falhar ali não muda dado nenhum.
     2. LIMPEZA — apagar a geração antiga de um documento ou uma chave legada.
        O que sobra é lixo, não perda: a geração nova já está válida.
     3. LEITURA COM PLANO B — `getBruto` tentando camada por camada, `JSON.parse`
        de um detalhe de erro. Falhar ali significa "tenta o próximo".
   Fora disso, engolir erro apaga a prova de que algo não gravou. Onde havia
   `try { await salvarTudo(...) } catch {}` no meio de uma operação, as seções
   passaram a ser gravadas NUMA CHAMADA SÓ: ou entram juntas na fila, ou ficam
   juntas pendentes com o indicador aceso. Meio gravado é o pior dos três
   estados possíveis. */

/* REGRA: nunca passe `esc()` para dentro de toast/toastPasso — eles já escapam
   a mensagem inteira. Escapar duas vezes faz "Laço A & B" virar "Laço A &amp; B"
   na tela. Aqui entra texto puro; o escape é responsabilidade de quem imprime. */
/* ---------- o aviso que dá para fechar ----------
   Três decisões, cada uma resolvendo uma reclamação concreta:

   1. ele mora no canto inferior DIREITO. No meio da tela ele cobria o rodapé
      da tabela — justo os totais que a pessoa acabou de mudar e quer conferir;
   2. tem um X. Aviso que só some sozinho obriga a esperar sem motivo;
   3. o relógio PARA enquanto o mouse está em cima. Quem está lendo não deveria
      ver a frase sumir no meio da leitura.

   O que NÃO mudou, de propósito: a cor continua significando o que significava.
   Escuro é "deu certo", vermelho é ERRO. Deixar tudo vermelho apagaria a única
   diferença que importa de verdade — a de salvou para não salvou. A visibilidade
   veio da barra colorida na lateral, da sombra e do tempo maior, não da cor. */
function _avisar(classe, dentro, vida) {
  const el = document.createElement("div");
  el.className = classe;
  el.innerHTML = dentro + `<button class="toast-x" type="button" title="Fechar" aria-label="Fechar aviso">${svg(IC.fechar)}</button>`;
  let t = null;
  const sumir = () => {
    if (!el.isConnected) return;
    el.style.transition = "opacity .3s"; el.style.opacity = "0";
    setTimeout(() => el.remove(), 320);
  };
  const contar = () => { clearTimeout(t); t = setTimeout(sumir, vida); };
  /* o X fecha na hora, sem esperar o desbotamento: quem clicou quer sumir */
  el.querySelector(".toast-x").addEventListener("click", (e) => { e.stopPropagation(); clearTimeout(t); el.remove(); });
  el.addEventListener("mouseenter", () => clearTimeout(t));
  el.addEventListener("mouseleave", contar);
  /* ---------- um aviso igual não vira três ----------
     Antes, cada clique empilhava mais uma cópia da mesma frase. Quando a
     gravação parecia falhar e a pessoa clicava de novo, ela via três "Não
     consegui salvar" idênticos e concluía que perdeu o trabalho três vezes.
     Aviso repetido não informa mais: informa pior. Aqui o de antes some e o
     novo entra no lugar — o relógio recomeça, então quem chegou agora ainda
     tem tempo de ler. */
  try {
    const alvo = (el.textContent || "").replace(/\s+/g, " ").trim();
    for (const velho of $$("#toasts .toast")) {
      if ((velho.textContent || "").replace(/\s+/g, " ").trim() === alvo) velho.remove();
    }
  } catch {}
  $("#toasts").appendChild(el);
  contar();
  return el;
}
/* Um "deu certo" no mesmo instante em que a gravação falhou não é um deu
   certo. Ver `marcarFalhaAgora` — a frase é completada aqui, onde ela é
   impressa, e não em cada um dos 55 lugares que anunciam o fim de alguma
   operação logo depois de salvar. */
const NAO_GRAVOU = "mas isto ainda NÃO foi gravado no servidor — veja o aviso no topo da tela.";
function toast(msg, tipo = "ok") {
  if (tipo !== "erro" && gravacaoAcabouDeFalhar()) {
    return _avisar("toast erro", svg(IC.alerta) + `<span>${esc(msg)} — <b>${NAO_GRAVOU}</b></span>`, 11000);
  }
  return _avisar("toast" + (tipo === "erro" ? " erro" : ""),
    (tipo === "erro" ? "" : svg(IC.ok)) + `<span>${esc(msg)}</span>`, 6500);
}
/* "Será que funcionou?" é a pergunta que sobra quando a tela só se atualiza.
   Todo passo do fluxo responde três coisas na mesma frase: o que aconteceu,
   onde a peça está agora, e o que vem depois. Sem isso, quem clicou fica
   procurando o pedido na tabela para ter certeza. */
function toastPasso(feito, agora, proximo) {
  if (gravacaoAcabouDeFalhar()) {
    return _avisar("toast passo erro", svg(IC.alerta)
      + `<span><b>${esc(feito)}</b><i>${NAO_GRAVOU}</i></span>`, 11000);
  }
  return _avisar("toast passo",
    svg(IC.ok) + `<span><b>${esc(feito)}</b><i>Agora: ${esc(agora)}${proximo ? ` · ${esc(proximo)}` : ""}</i></span>`, 9000);
}
const CORCLASSE = { "Urgente - Produzir": "red", "Urgente - Cobrar Produção": "red",
  "Produzir": "amber", "Cobrar Produção": "amber", "No Estoque Mínimo": "",
  "Estoque Excedente (Com Vendas)": "", "Estoque Excedente (Sem Vendas)": "", "-": "" };
/* mesma ideia da prioridade: código na célula, frase no title */
const CLASSE_CURTA = { "Urgente - Produzir": "URG. PRODUZIR", "Urgente - Cobrar Produção": "URG. COBRAR",
  "Produzir": "PRODUZIR", "Cobrar Produção": "COBRAR", "No Estoque Mínimo": "NO MÍNIMO",
  "Estoque Excedente (Com Vendas)": "EXCEDENTE", "Estoque Excedente (Sem Vendas)": "EXCED. S/ VENDA", "-": "—" };
function regua(cob, lead, classe) {
  const max = Math.max(lead * 2.5, 30);
  const w = Math.max(2.5, (Math.min(cob, max) / max) * 100);
  const lp = Math.min(97, (lead / max) * 100);
  const cor = classe === "Ruptura" || classe === "Crítico" ? "red" : classe === "Produzir" || classe === "Cobrar" ? "amber" : cob >= 999 ? "gray" : "";
  return `<div class="regua" title="Cobertura de ${Math.round(cob)} dias · produzir leva cerca de ${Math.round(lead)} dias">
    <div class="track"><div class="fill ${cor}" style="width:${w}%"></div></div>
    <div class="lead" style="left:${lp}%"></div><span class="cap">${cob >= 999 ? "s/venda" : Math.round(cob) + "d"}</span></div>`;
}
const pct = (v) => v == null ? "—" : `<span style="font-weight:700;color:${v < 0.5 ? "var(--red)" : v < 1 ? "var(--amber)" : "var(--ink-2)"}">${Math.round(v * 100)}%</span>`;
const prio = (v) => `<span class="prio ${v >= 70 ? "hi" : v >= 45 ? "mid" : ""}">${v}</span>`;
/* A faixa de números do topo E a fileira de chips logo abaixo diziam a mesma
   coisa duas vezes — "Para olhar 46" em cima, "Para olhar 46" embaixo. Uma das
   duas sobrava, e a que sobrava era a menor. Agora o próprio número filtra:
   `clique` recebe {attr, valor, ativo} e o bloco vira o controle.
   Sem `clique`, o bloco continua sendo só informação (não tem cursor nem hover). */
const kpi = (lbl, val, foot, tone, clique) => {
  const etapa = clique && clique.etapa != null;   /* forma antiga, dos Pedidos */
  const attr = etapa ? `data-kpi-etapa="${clique.etapa}"`
    : clique ? `${clique.attr}="${esc(clique.valor)}"` : "";
  return `<div class="kpi ${tone || ""} ${clique ? "clicavel" : ""} ${clique && clique.ativo ? "ativo" : ""}"
    ${clique ? `${attr} role="button" tabindex="0" title="${esc(clique.dica || "Mostrar só estes na lista abaixo")}"` : ""}>
    <div class="lbl">${lbl}</div><div class="val mono">${val}</div>${foot ? `<div class="foot">${foot}</div>` : ""}</div>`;
};
const tagMaterial = (r) => r.aguardandoMaterial ? ` <span class="tag red" title="Pedido travado aguardando compra de material">falta material</span>` : "";

