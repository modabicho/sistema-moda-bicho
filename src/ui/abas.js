/* ===========================================================================
   src/ui/abas.js · BARRA DE ABAS INTERNAS (v8.62 · etapa 1)
   ---------------------------------------------------------------------------
   UMA ABA É UMA VISTA, NÃO UMA CÓPIA DO APP.

     dados      · um só   → S.pedidos, S.produtos, S.estoque, S.calc
     realtime   · um só   → RT_WS, protegido contra reabertura em realtime.js
     abas       · só estado visual
     DOM        · só a ativa

   SÓ A ABA ATIVA FICA MONTADA. As outras são objetos em memória. Isso não é
   preferência: a lista de Pedidos com 600 linhas são 35 mil nós, e as v8.60 e
   v8.61 foram gastas justamente para segurar isso. Cinco abas montadas em
   paralelo seriam 175 mil nós, e cada render pagaria layout sobre todos —
   desfazendo os dois blocos anteriores.

   COMO ISTO CONVIVE COM O APP QUE JÁ EXISTE
   `S.aba` continua sendo quem decide qual tela o `render()` desenha. Os 28
   lugares que fazem `S.aba = "x"; render()` continuam funcionando sem saber
   que abas existem: quem reconcilia é `abasSincronizar()`, chamada de dentro
   do render. Trocar de tela por qualquer caminho — menu, atalho, busca rápida,
   bipe — abre ou foca a aba correspondente.

   Filtros, busca e ordenação NÃO são copiados para cá: eles já viviam em
   `S.pedView`, `S.demanda`, `S.prestView`, `S.comprasView` e já sobreviviam à
   troca de tela. Duplicá-los aqui criaria duas verdades.
   =========================================================================== */

/* As telas que ganham aba na v1. Fora daqui, a tela continua sendo tela e não
   entra na barra — Dados e Equipe de propósito. */
const ABAS_COM_ABA = ["pedidos", "demanda", "conferencia", "compras"];

const abaRotulo = (tela) => (ABAS_TODAS.find(([id]) => id === tela) || [, tela])[1];

/* ---------------------------------------------------------------------------
   ABA DE REGISTRO (etapa 2)
   ---------------------------------------------------------------------------
   Um pedido aberto deixa de ser uma janela por cima e passa a ser uma aba
   própria — é o caso que motivou o pedido inteiro: comparar dois pedidos sem
   perder nenhum dos dois.

   Ela guarda de qual tela nasceu (`voltarPara`), para que fechar devolva a
   pessoa à lista com o filtro e a rolagem dela, e não a um lugar qualquer.

   O `id` é derivado do registro (`ped:r123`), então reabrir o MESMO pedido foca
   a aba que já existe em vez de criar outra — a mesma regra das telas.
   --------------------------------------------------------------------------- */
const abaIdDoPedido = (id) => "ped:" + String(id);

function abasAbrirPedido(pedidoId, deOndeVeio) {
  if (!Array.isArray(S.abas)) S.abas = [];
  if (typeof abasGuardarRascunho === "function") abasGuardarRascunho();
  const r = typeof pedidoPorId === "function" ? pedidoPorId(pedidoId) : null;
  if (!r) return null;
  const id = abaIdDoPedido(r.id);
  let a = S.abas.find((x) => x.id === id);
  if (!a) {
    a = { id, tipo: "registro", tela: "pedidos", alvo: r.id,
      rotulo: "Pedido " + (r.numero || r.id),
      voltarPara: deOndeVeio || S.abaAtiva || "pedidos",
      abertaEm: new Date().toISOString() };
    S.abas.push(a);
  }
  S.abaAtiva = a.id;
  S.aba = "pedidos";                 /* a tela de baixo continua sendo a de Pedidos */
  S.modal = { tipo: "pedido", pedido: r, foto: typeof fotoPedido === "function" ? fotoPedido(r) : null };
  return a;
}

/* A aba de registro em foco: é ela que decide se a janela do pedido fica de pé.
   Sem isto, trocar para outra aba deixaria a janela aberta por cima da tela
   errada. */
const abaAtivaObj = () => (S.abas || []).find((x) => x.id === S.abaAtiva) || null;
const abaDeRegistroAtiva = () => { const a = abaAtivaObj(); return a && a.tipo === "registro" ? a : null; };

/* Entrar numa aba: a de registro reabre a janela dela; a de tela fecha
   qualquer janela de registro que estivesse de pé. É esta função que faz
   "trocar de aba preserva o registro aberto" ser verdade. */
function abasFocar(id) {
  const a = (S.abas || []).find((x) => x.id === id);
  if (!a) return false;
  /* o que está digitado tem de ser colhido AQUI, com a janela antiga ainda de
     pé — um passo depois o DOM já é outro */
  if (typeof abasGuardarRascunho === "function") abasGuardarRascunho();
  S.abaAtiva = a.id;
  S.aba = a.tela;
  S.drawer = null;
  if (a.tipo === "registro") {
    const r = typeof pedidoPorId === "function" ? pedidoPorId(a.alvo) : null;
    /* o registro pode ter sumido (excluído por outra pessoa): a aba não pode
       ficar apontando para o vazio */
    if (!r) { abasFechar(a.id); return true; }
    S.modal = { tipo: "pedido", pedido: r, foto: typeof fotoPedido === "function" ? fotoPedido(r) : null };
  } else if (S.modal && S.modal.tipo === "pedido") {
    S.modal = null;                  /* a janela pertence à aba de registro, não a esta */
  }
  if (typeof lembrarAba === "function") lembrarAba();
  return true;
}

/* ---------------------------------------------------------------------------
   ABRIR OU FOCAR · reabrir a mesma tela nunca duplica: o `id` é estável.
   --------------------------------------------------------------------------- */
function abasAbrir(tela) {
  if (!Array.isArray(S.abas)) S.abas = [];
  if (!ABAS_COM_ABA.includes(tela)) return null;
  let a = S.abas.find((x) => x.id === tela);
  if (!a) {
    a = { id: tela, tipo: "tela", tela, rotulo: abaRotulo(tela), abertaEm: new Date().toISOString() };
    S.abas.push(a);
  }
  S.abaAtiva = a.id;
  return a;
}

function abasFechar(id) {
  if (!Array.isArray(S.abas)) return false;
  const i = S.abas.findIndex((x) => x.id === id);
  if (i < 0) return false;
  const eraAtiva = S.abaAtiva === id;
  const fechada = S.abas[i];
  S.abas.splice(i, 1);
  if (S.modal && S.modal.tipo === "pedido" && fechada.tipo === "registro"
      && S.modal.pedido && S.modal.pedido.id === fechada.alvo) S.modal = null;
  if (!eraAtiva) return true;
  /* Aba de registro volta para quem a abriu; aba de tela vai para a vizinha da
     direita, depois a da esquerda. Se a barra esvaziou, a aba de partida do app
     (`abaPadrao()`), que não é aba de ninguém. */
  const daOrigem = fechada.tipo === "registro"
    ? S.abas.find((x) => x.id === fechada.voltarPara) : null;
  const viz = daOrigem || S.abas[i] || S.abas[i - 1] || null;
  if (viz) { abasFocar(viz.id); }
  else { S.abaAtiva = null; S.aba = abaPadrao(); S.modal = null; }
  if (typeof lembrarAba === "function") lembrarAba();
  if (typeof abasGuardarNoNavegador === "function") abasGuardarNoNavegador();
  return true;
}

/* ---------------------------------------------------------------------------
   A RECONCILIAÇÃO · chamada de dentro do render, uma vez por render.
   Ela existe para que nenhum dos 28 pontos que trocam de tela precise saber
   que abas existem.
   --------------------------------------------------------------------------- */
function abasSincronizar() {
  if (!Array.isArray(S.abas)) S.abas = [];
  /* uma aba de registro em foco manda: a tela de baixo é Pedidos, mas quem está
     ativa é ela */
  const reg = abaDeRegistroAtiva();
  if (reg && S.aba === reg.tela) return;
  if (!ABAS_COM_ABA.includes(S.aba)) return;      /* tela sem aba: a barra não muda */
  const a = S.abas.find((x) => x.id === S.aba);
  if (a) { S.abaAtiva = a.id; return; }
  abasAbrir(S.aba);
  if (typeof abasGuardarNoNavegador === "function") abasGuardarNoNavegador();
}

/* ---------------------------------------------------------------------------
   A BARRA · só aparece quando há aba. Uma tela fora da lista (Dados, Equipe)
   não esconde a barra: as abas abertas continuam à vista, para a
   pessoa voltar de onde saiu.
   --------------------------------------------------------------------------- */
function barraDeAbas() {
  if (!Array.isArray(S.abas) || !S.abas.length) return "";
  return `<div class="abas" role="tablist" aria-label="Abas abertas">
    ${S.abas.map((a) => {
      const ativa = a.id === S.abaAtiva && S.aba === a.tela;
      const reg = a.tipo === "registro";
      return `<div class="aba${ativa ? " on" : ""}${reg ? " aba-reg" : ""}" role="tab" aria-selected="${ativa}">
        <button class="aba-ir" data-aba-ir="${esc(a.id)}" title="${esc(a.rotulo)}${a.sujo ? " — tem alteração não salva" : ""}">${esc(a.rotulo)}${a.sujo ? '<span class="aba-sujo" aria-label="não salvo"></span>' : ""}</button>
        <button class="aba-x" data-aba-fechar="${esc(a.id)}" title="Fechar ${esc(a.rotulo)}" aria-label="Fechar ${esc(a.rotulo)}">×</button>
      </div>`; }).join("")}
  </div>`;
}

/* ---------------------------------------------------------------------------
   TROCAR SÓ A BARRA, sem refazer a tela.
   Abrir um pedido muda a barra (nasce uma aba) mas NÃO muda a lista embaixo.
   Refazer a tela inteira para desenhar uma aba nova custaria os 486 ms que as
   v8.60/v8.61 acabaram de tirar. Devolve `false` se não deu conta — e aí quem
   chamou faz o render completo.
   --------------------------------------------------------------------------- */
function abasRepintarBarra() {
  try {
    const html = barraDeAbas();
    const atual = document.querySelector(".abas");
    if (atual) {
      if (!html) { atual.remove(); return true; }
      atual.outerHTML = html; return true;
    }
    if (!html) return true;
    const page = document.querySelector(".page");
    if (!page || !page.parentElement) return false;
    page.insertAdjacentHTML("beforebegin", html);
    return true;
  } catch { return false; }
}

/* ===========================================================================
   RASCUNHO POR ABA (etapa 3)
   ---------------------------------------------------------------------------
   O que a pessoa digita numa janela mora nos `<input>` da tela, não em `S`. Se
   a tela for desmontada para mostrar outra aba, o que foi digitado morre junto
   — e "rascunho não salvo não pode ser perdido" fica impossível de cumprir.

   `colherDigitadoDaJanela()` já existia e já faz exatamente o que é preciso:
   devolve SÓ os campos diferentes do que veio do registro, e `null` quando nada
   foi mexido. Ou seja: ela é o colhedor E o detector de "sujo", numa coisa só.
   Não inventei outro — dois detectores discordariam em algum canto, e o canto
   seria justamente o que ninguém testou.

   O rascunho é do NAVEGADOR, não do servidor. Ele nunca é enviado sozinho, e a
   aba diz isso à vista.
   =========================================================================== */

/* Colhe o que está digitado AGORA e guarda na aba de registro em foco.
   Roda antes de qualquer troca — enquanto a janela antiga ainda está de pé. */
function abasGuardarRascunho() {
  try {
    const a = abaDeRegistroAtiva();
    if (!a) return false;
    if (typeof colherDigitadoDaJanela !== "function") return false;
    if (!document.querySelector(".ov")) return false;   /* janela não está de pé */
    const g = colherDigitadoDaJanela();
    a.rascunho = g || null;
    a.sujo = !!g;
    return a.sujo;
  } catch { return false; }
}

/* Repõe o rascunho da aba em foco, depois de a janela ter sido pintada.
   Chamada de dentro do render, no mesmo ponto em que o app já repunha o que
   tinha colhido para sobreviver a UM render. */
function abasReporRascunho() {
  try {
    const a = abaDeRegistroAtiva();
    if (!a || !a.rascunho) return 0;
    if (typeof reporDigitadoNaJanela !== "function") return 0;
    if (!document.querySelector(".ov")) return 0;
    return reporDigitadoNaJanela(a.rascunho) || 0;
  } catch { return 0; }
}

/* Depois de salvar, o rascunho deixou de ser rascunho: ele virou o registro.
   Sem isto a aba continuaria marcada como suja para sempre. */
function abasLimparRascunho(pedidoId) {
  const a = (S.abas || []).find((x) => x.tipo === "registro"
    && (pedidoId == null || x.alvo === pedidoId));
  if (!a) return false;
  a.rascunho = null; a.sujo = false;
  return true;
}

const abaTemRascunho = (id) => {
  const a = (S.abas || []).find((x) => x.id === id);
  return !!(a && a.sujo);
};

/* ===========================================================================
   RESTAURAÇÃO NO F5 (etapa 4)
   ---------------------------------------------------------------------------
   O QUE VOLTA:  quais abas estavam abertas · qual era a ativa · o rascunho.
   O QUE NUNCA ACONTECE:  o rascunho ser tratado como salvo.

   A regra, escrita para não ser afrouxada por engano mais tarde:

     · o rascunho volta MARCADO, sempre;
     · a aba mostra o ponto de "não salvo" desde o primeiro instante;
     · a janela abre com um aviso à vista dizendo que aquilo não foi enviado ao
       servidor;
     · NADA é enviado automaticamente — o app não grava sozinho na volta;
     · e a tela diz que isto é recuperação DESTE navegador, não backup.

   Por que o rascunho volta em vez de ser descartado: jogar fora o que a pessoa
   digitou é pior que devolver com aviso. Mas devolver sem aviso seria pior que
   os dois — ela olharia um número na tela e acreditaria que ele está no banco.
   =========================================================================== */
const ABAS_CHAVE = "pcp5:abas";

function abasGuardarNoNavegador() {
  try {
    if (typeof abasGuardarRascunho === "function") abasGuardarRascunho();
    const dados = {
      v: 1,
      ativa: S.abaAtiva || null,
      abas: (S.abas || []).map((a) => ({
        id: a.id, tipo: a.tipo, tela: a.tela, alvo: a.alvo || null,
        rotulo: a.rotulo, voltarPara: a.voltarPara || null,
        /* o rascunho viaja junto, e viaja MARCADO */
        rascunho: a.rascunho || null, sujo: !!a.sujo })),
    };
    localStorage.setItem(ABAS_CHAVE, JSON.stringify(dados));
    return true;
  } catch { return false; }
}

function abasRestaurarDoNavegador() {
  try {
    const cru = localStorage.getItem(ABAS_CHAVE);
    if (!cru) return { status: "nada" };
    const d = JSON.parse(cru);
    if (!d || d.v !== 1 || !Array.isArray(d.abas)) return { status: "nada" };
    const boas = [];
    for (const a of d.abas) {
      if (a.tipo === "tela") {
        /* a tela precisa continuar existindo E continuar permitida para esta
           conta — uma aba guardada não pode abrir porta nenhuma */
        if (!ABAS_COM_ABA.includes(a.tela)) continue;
        if (typeof podeAba === "function" && !podeAba(a.tela)) continue;
        boas.push({ id: a.id, tipo: "tela", tela: a.tela, rotulo: a.rotulo || abaRotulo(a.tela) });
        continue;
      }
      if (a.tipo === "registro") {
        /* o registro precisa continuar existindo: um pedido excluído por outra
           pessoa não pode virar uma aba apontando para o vazio */
        const r = typeof pedidoPorId === "function" ? pedidoPorId(a.alvo) : null;
        if (!r) continue;
        if (typeof podeAba === "function" && !podeAba("pedidos")) continue;
        boas.push({ id: a.id, tipo: "registro", tela: "pedidos", alvo: a.alvo,
          rotulo: "Pedido " + (r.numero || r.id), voltarPara: a.voltarPara || "pedidos",
          rascunho: a.rascunho || null, sujo: !!a.sujo,
          /* a marca que faz a janela avisar. Some no primeiro salvamento. */
          recuperado: !!a.sujo });
      }
    }
    if (!boas.length) return { status: "nada" };
    S.abas = boas;
    const ativa = boas.find((x) => x.id === d.ativa) || null;
    if (ativa) { S.abaAtiva = ativa.id; S.aba = ativa.tela;
      if (ativa.tipo === "registro") {
        const r = pedidoPorId(ativa.alvo);
        if (r) S.modal = { tipo: "pedido", pedido: r, foto: typeof fotoPedido === "function" ? fotoPedido(r) : null };
      } }
    return { status: "ok", abas: boas.length,
      comRascunho: boas.filter((x) => x.sujo).length };
  } catch { return { status: "erro" }; }
}

/* O aviso que a janela mostra quando o que está nela veio de um rascunho
   recuperado. Ele não pede confirmação e não some sozinho: fica até salvar. */
function avisoRascunhoRecuperado() {
  const a = abaDeRegistroAtiva();
  if (!a || !a.recuperado || !a.sujo) return "";
  return `<div class="aviso" style="border-color:var(--amber);background:var(--amber-soft, var(--bg-2));margin:0 0 14px">
    <b>Isto ainda não foi enviado ao servidor.</b> O que está nos campos abaixo foi
    recuperado deste navegador depois de a página ser recarregada — o servidor
    continua com o valor anterior. Confira e clique em <b>Salvar</b> para enviar.
    <br><span style="color:var(--ink-3);font-size:11.5px">Esta recuperação vale só neste computador: em outro, ela não existe.</span>
  </div>`;
}

/* ---------------------------------------------------------------------------
   FECHAR SEM REFAZER A TELA
   ---------------------------------------------------------------------------
   Fechar uma aba de registro mudava a barra e a janela — mas não a lista de
   baixo, que continua exatamente como estava. A primeira versão chamava
   `render()` e devolvia os ~500 ms que as v8.60/v8.61 tinham tirado; a bateria
   de performance de Pedidos pegou na hora.

   Aqui: fecha, e pinta só as duas coisas que mudaram. Devolve `false` quando a
   TELA de baixo mudou (fechar a última aba, ou cair numa aba de outra tela) —
   aí o render completo é o certo, e é o que quem chamou faz.
   --------------------------------------------------------------------------- */
function abasFecharPintando(id) {
  const telaAntes = S.aba;
  if (!abasFechar(id)) return false;
  if (S.aba !== telaAntes) return false;                /* a tela mudou: render completo */
  if (typeof janelaPintar !== "function" || typeof abasRepintarBarra !== "function") return false;
  if (!janelaPintar()) return false;
  return abasRepintarBarra();
}
