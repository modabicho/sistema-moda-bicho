/* ---------- o aviso de que não se está sozinho ----------
   Fica no topo, ao lado de "Tudo salvo", porque é da mesma família: as duas
   respondem "posso confiar no que estou vendo?". Some quando só há uma pessoa —
   um aviso que aparece sempre deixa de ser aviso. */
function chipPresenca() {
  const outras = outrasPessoas(), abas = minhasOutrasAbas();
  if (!outras.length && !abas.length) return "";
  const nomes = [...new Set(outras.map((x) => primeiroNome(x.nome) || "alguém"))];
  const txt = outras.length === 0 ? "Você em outra aba"
    : nomes.length === 1 ? `${nomes[0]} também está no app`
    : nomes.length === 2 ? `${nomes[0]} e ${nomes[1]} estão no app`
    : `${nomes.length} pessoas no app`;
  /* quem mais está no app é CONTEXTO. Isto era âmbar, e âmbar quer dizer
     "preste atenção" — não há nada para prestar atenção em ter companhia. */
  const tom = abas.length ? "neutro" : "";
  return `<button class="presenca ${tom}" data-act="ver-presenca" title="Ver quem está no app agora">
    <i class="presenca-p"></i>${esc(txt)}</button>`;
}

function statusSalvo() {
  const e = estadoGravacao();
  const dica = e.tom === "erro" ? "Clique para ver o que fazer"
    : `Gravando em: ${CAMADA_NOME[CAMADA] || "…"}${SALVO.quando ? ` · última às ${horaCurta(SALVO.quando)}` : ""}`;
  return `<button id="st-salvo" class="sinc ${e.tom}" data-act="ver-gravacao" title="${esc(dica)}">
    <i class="sinc-p"></i>${esc(e.txt)}${e.n ? ` <b>${e.n}</b>` : ""}</button>`;
}
/* carimbo: quem salvou por último (detecção de conflito entre pessoas na base compartilhada) */
const SESSAO_APP = Math.random().toString(36).slice(2, 10);

/* ---------- quem mais está no app agora ----------
   O app já sabia dizer que "alguém gravou", e não sabia dizer QUEM está junto.
   A diferença importa: duas pessoas na mesma base é a situação em que alguém
   sobrescreve o trabalho do outro sem perceber, e ninguém se cuida do que não
   enxerga.

   O desenho é o mais simples que responde a pergunta: um documento próprio,
   `presenca`, onde cada aba escreve a SUA linha e lê as das outras. Nada de
   servidor de tempo real — o mesmo caminho de gravação de todo o resto.

   Três decisões que valem estar escritas:
   • cada aba tem a sua linha (a chave é `SESSAO_APP`), porque a mesma pessoa em
     duas abas É duas sessões gravando — e é justamente o caso que confunde;
   • quem não bate ponto há mais de `PRESENCA_SUMIU` é dado como saído: aba
     fechada no X não avisa ninguém, e um cemitério de nomes seria pior que nada;
   • a batida NÃO passa por `salvarTudo`. Se passasse, carimbaria a base a cada
     minuto e faria todas as outras telas recarregarem por nada. */
const DOC_PRESENCA = NS + ":presenca";
const PRESENCA_BATIDA = 60000;    /* de quanto em quanto tempo digo que estou aqui */
const PRESENCA_SUMIU = 210000;    /* 3min30: perdeu três batidas seguidas, saiu */
let _presencaEm = 0;

const presentes = () => (S.presenca?.lista || [])
  .filter((x) => x.sessao !== SESSAO_APP && Date.now() - new Date(x.em).getTime() < PRESENCA_SUMIU);
/* a mesma pessoa noutra aba: aparece separado, porque o efeito é outro */
const outrasPessoas = () => { const eu = usuarioAtual()?.nome || null;
  return presentes().filter((x) => !eu || x.nome !== eu); };
const minhasOutrasAbas = () => { const eu = usuarioAtual()?.nome || null;
  return eu ? presentes().filter((x) => x.nome === eu) : []; };

async function baterPonto(forcar) {
  if (!temJanelaReal) return;
  if (!forcar && Date.now() - _presencaEm < PRESENCA_BATIDA) return;
  _presencaEm = Date.now();
  try {
    const doc = (await lerDoc(DOC_PRESENCA)) || {};
    const agora = new Date().toISOString();
    /* limpa quem sumiu na mesma passada: o documento não cresce para sempre */
    const limpo = {};
    for (const [k, v] of Object.entries(doc))
      if (k === SESSAO_APP || (v?.em && Date.now() - new Date(v.em).getTime() < PRESENCA_SUMIU)) limpo[k] = v;
    limpo[SESSAO_APP] = { nome: usuarioAtual()?.nome || null, em: agora, aba: S.aba || null };
    await gravarDoc(DOC_PRESENCA, limpo);
    aplicarPresenca(limpo);
  } catch {}   /* presença é conforto, não pode atrapalhar o trabalho */
}
async function lerPresenca() {
  if (!temJanelaReal) return;
  try { aplicarPresenca((await lerDoc(DOC_PRESENCA)) || {}); } catch {}
}
/* avisa UMA vez por pessoa que chegou — não a cada leitura */
/* a digital de quem está presente na última vez que a tela foi redesenhada */
let _presencaDigital = null;
function aplicarPresenca(doc) {
  const lista = Object.entries(doc || {}).map(([sessao, v]) => ({ sessao, ...(v || {}) }))
    .filter((x) => x.em);
  const antes = new Set((S.presenca?.lista || []).map((x) => x.sessao));
  S.presenca = { lista, em: new Date().toISOString() };
  const chegaram = presentes().filter((x) => !antes.has(x.sessao));
  const eu = usuarioAtual()?.nome || null;
  for (const x of chegaram) {
    if (!S.presenca.avisados) S.presenca.avisados = [];
    if (S.presenca.avisados.includes(x.sessao)) continue;
    S.presenca.avisados.push(x.sessao);
    if (antes.size === 0 && !S.presenca.jaAbriu) continue;   /* a primeira leitura não anuncia a casa cheia */
    toast(x.nome === eu ? `Você abriu o app em outra aba — cuidado para não trabalhar nas duas.`
      : `${x.nome || "Outra pessoa"} entrou no app.`);
  }
  S.presenca.jaAbriu = true;
  /* -------------------------------------------------------------------------
     REDESENHA SÓ QUANDO A PRESENÇA MUDA DE VERDADE (v8.82)
     -------------------------------------------------------------------------
     Medido: com o app PARADO, 3 renders em 60 s — todos daqui, e 2 dos 3
     redesenhavam exatamente a mesma tela (a impressão do HTML era idêntica
     antes e depois). A presença é lida a cada 20 s e mandava redesenhar a tela
     INTEIRA toda vez, mesmo quando ninguém entrou nem saiu. Era esse o piscar.

     E a lista de presentes nem aparece na tela: ela é mostrada dentro de duas
     janelas (o aviso de "tem mais alguém no app" e o diagnóstico). Redesenhar
     a tela toda para atualizar algo que ela não mostra é trabalho puro.

     O dado continua sendo atualizado a cada leitura, como antes — `S.presenca`
     é sempre trocado acima. O que passa a depender de mudança real é só o
     REDESENHO: a digital é quem está presente (sessão + nome), na ordem. Muda
     alguém, redesenha; não muda, não redesenha.
     ------------------------------------------------------------------------- */
  const digital = presentes().map((x) => x.sessao + "|" + (x.nome || "")).sort().join(",");
  if (digital === _presencaDigital) return;
  _presencaDigital = digital;
  renderDeFundo();
}
/* fechar a aba libera o lugar na hora, em vez de esperar os 3min30 */
if (typeof window !== "undefined") window.addEventListener("pagehide", () => {
  try {
    const doc = JSON.parse(localStorage.getItem(DOC_PRESENCA) || "{}");
    if (doc && doc[SESSAO_APP]) { delete doc[SESSAO_APP]; localStorage.setItem(DOC_PRESENCA, JSON.stringify(doc)); }
  } catch {}
});
let _falhasSinc = 0;
/* v8.74 · P6 · o rastro da última decisão do carimbo, para conferir no console
   de produção: `{ em, por, cruz: { modo, cruzou: [{ id, numero, campos }] } }`. */
let CARIMBO_ULTIMO = null;
const haConflito = (car) => !!(car && car.sessao !== SESSAO_APP && S.carimboVisto && String(car.em) > String(S.carimboVisto));

/* ===========================================================================
   v8.74 · P6 · O CARIMBO SÓ FALA QUANDO CRUZA
   ---------------------------------------------------------------------------
   `haConflito` responde a uma pergunta grosseira: "alguma outra sessão gravou
   alguma coisa desde a última vez que eu olhei?". Qualquer coisa — outro
   pedido, outro campo, o mesmo valor. Numa fábrica com duas pessoas no app,
   isso é o dia inteiro, e o aviso vermelho vira ruído.

   O que ELE protegia de verdade: nada. Quem impede sobrescrita é
     · `p_expected_revision` (a trava por revisão, pedido a pedido);
     · `puxarAntesDeGravar` (relê e funde eventos e série antes de gravar);
     · `gravarSecaoSemAtropelar` (relê, funde por registro e, quando não dá
       para decidir com honestidade, PARA e devolve o dado em briga).
   Nenhum dos três foi tocado.

   O QUE ELE PASSA A PERGUNTAR:
   "o que a outra sessão mudou cruza com o que eu estou tentando gravar?"

   Os dados que ele tem para responder, no instante em que roda:
     1. o carimbo — `{ em, por, sessao }`. Diz QUANDO e QUEM. Nunca O QUÊ;
     2. a FILA DE INTENÇÕES (`obPendentes`), que foi registrada ANTES desta
        gravação começar: é exatamente o que eu estou tentando gravar, com o
        id do pedido e o patch campo a campo;
     3. `TELA_FOTO` — a minha base, a mesma que vai em `p_expected_revision`;
     4. a linha de AGORA no servidor — buscada só para os ids da fila
        (`pxPorIds`), uma ida curta.

   A DECISÃO é a mesma função que decide o conflito de verdade,
   `mgClassificar(base, meuPatch, servidor)`:
     · `jaIgual`     → o servidor já tem o valor que eu quero: não cruza
     · `automatico`  → só eu mexi naquele campo: não cruza
     · `disputados`  → o MESMO campo mudou dos dois lados, com valores
                       diferentes: CRUZA
   Nada de heurística nova; é a regra que o app já usa para fundir.

   QUANDO A CAMADA DE PEDIDOS ESTÁ DESLIGADA não há fila, não há foto e não há
   revisão — e aí o aviso genérico é a única proteção que existe. Nesse caso o
   comportamento fica exatamente como era. Não se tira a única rede de quem
   não tem outra.
   =========================================================================== */
async function carimboCruzamentos() {
  /* camada nova desligada: não há como saber, e o aviso antigo continua valendo */
  if (typeof telaEscreveNaTabela !== "function" || !telaEscreveNaTabela()) return { modo: "sem-camada" };
  if (typeof obPendentes !== "function" || typeof mgClassificar !== "function"
      || typeof pxPorIds !== "function" || typeof TELA_FOTO === "undefined") return { modo: "sem-camada" };

  const minhas = obPendentes().filter((a) => a && a.entidadeId && a.dados && a.dados.p_patch
    && Object.keys(a.dados.p_patch).length);
  if (!minhas.length) return { modo: "ok", cruzou: [], nada: "não estou gravando pedido nenhum" };

  const r = await pxPorIds(minhas.map((a) => a.entidadeId));
  /* não consegui conferir: falha para o lado seguro — avisa, como antes */
  if (!r || r.status !== "ok") return { modo: "sem-resposta" };

  const porId = new Map(r.pedidos.map((p) => [p.id, p]));
  const cruzou = [];
  for (const a of minhas) {
    const servidorApp = porId.get(a.entidadeId);
    if (!servidorApp) continue;                       /* sumiu: outro caminho trata */
    const servidor = paraServidor(servidorApp, { permitidos: PED_EDITAVEIS }).linha;
    const base = (TELA_FOTO.get(a.entidadeId) || {}).linha || {};
    const v = mgClassificar(base, a.dados.p_patch, servidor);
    if (v.disputados.length) {
      cruzou.push({ id: a.entidadeId, numero: servidorApp.numero || null,
        campos: v.disputados.map((d) => d.campo) });
    }
  }
  return { modo: "ok", cruzou };
}

async function conferirConflito() {
  try {
    const car = await lerDoc(NS + ":carimbo");
    let cruz = null;
    if (haConflito(car)) {
      try { cruz = await carimboCruzamentos(); }
      catch (e) { console.error("carimbo · cruzamento:", e); cruz = { modo: "sem-resposta" }; }
      CARIMBO_ULTIMO = { em: (car && car.em) || null, por: (car && car.por) || null, cruz };
    }
    /* v8.74 · P6 · fala quando NÃO deu para conferir (lado seguro) ou quando
       o cruzamento é real. Silêncio quando conferiu e não cruzou. */
    if (haConflito(car) && cruz && cruz.modo === "ok" && !(cruz.cruzou || []).length) {
      /* outra sessão gravou, sim — mas em outro pedido, outro campo, ou com o
         mesmo valor. Isso não é problema desta pessoa. */
    } else if (haConflito(car)) {
      const juntos = outrasPessoas().map((x) => primeiroNome(x.nome)).filter(Boolean);
      toast(`ATENÇÃO: ${car.por || "outra pessoa"} salvou ${fdataHora(car.em)} enquanto você trabalhava — as duas versões podem se misturar.`
        + (juntos.length ? ` ${juntos.join(" e ")} ${juntos.length === 1 ? "está" : "estão"} no app agora.` : "")
        + " Confira o Histórico › Movimentos e recarregue a página.", "erro");
    }
    S.carimboVisto = new Date().toISOString();
    await gravarDoc(NS + ":carimbo", { em: S.carimboVisto, por: (typeof usuarioAtual === "function" && usuarioAtual()?.nome) || null, sessao: SESSAO_APP });
  } catch (e) {
    /* o carimbo é o único sinal que faz as outras abas recarregarem. Se ele
       parar de gravar, ninguém fica sabendo que esta pessoa salvou — e todo
       mundo passa a escrever por cima de todo mundo, em silêncio. */
    console.error("carimbo", e);
    if (typeof toast === "function") toast("Gravei, mas não consegui avisar as outras telas. Se houver mais alguém no app agora, peça para ela recarregar a página antes de salvar.", "erro");
  }
}
/* ---------- conflito por registro ----------
   O carimbo diz se ALGUÉM salvou; isto diz se salvaram JUSTAMENTE o que você está
   editando. A releitura do servidor só acontece quando o carimbo mudou — sem isso
   seria uma leitura do núcleo inteiro a cada gravação, e o app ficaria pesado. */
async function carimboAtual() {
  try { return await lerDoc(NS + ":carimbo"); } catch { return null; }
}
/* fotografa os campos que a edição vai mexer, para comparar na hora de salvar */
const fotoPedido = (r) => JSON.stringify({
  status: r.status, qtd: r.qtd, prestadora: r.prestadora, prioridade: r.prioridade,
  retornadaEm: r.retornadaEm, enviadaEm: r.enviadaEm, qtdConferida: r.qtdConferida,
  qtdDefeito: r.qtdDefeito ?? r.qtdSegunda, mesPagamento: r.mesPagamento, custoReal: r.custoReal,
  etapas: r.etapas || [], etapasUsadas: r.etapasUsadas || null, obs: r.obs });

async function outroMexeu(r, fotoAoAbrir) {
  if (!fotoAoAbrir || !temJanelaReal || !SUPA_URL) return null;
  const car = await carimboAtual();
  /* ninguém mais gravou desde que você abriu: não precisa reler nada */
  if (!car || car.sessao === SESSAO_APP || !S.carimboVisto || String(car.em) <= String(S.carimboVisto)) return null;
  let doc;
  try { doc = await lerDoc(DOCS.nucleo); } catch { return null; }
  const noServidor = (doc?.pedidos || []).find((x) => x.id === r.id);
  if (!noServidor) return null;
  const agora = fotoPedido(noServidor);
  if (agora === fotoAoAbrir) return null;      /* mudou outra coisa, não este pedido */
  if (agora === fotoPedido(r)) return null;    /* mudou para o mesmo valor: sem conflito real */
  return { por: car.por, em: car.em, servidor: noServidor };
}

/* ---------- sincronização entre as pessoas ----------
   A cada 15s o app pergunta ao servidor se alguém gravou. Se ninguém mexeu, custa
   uma leitura minúscula (só o carimbo). Se mexeu, recarrega — mas NUNCA no meio de
   uma edição: com modal aberto ou cursor num campo, ele avisa e espera o seu OK,
   senão o trabalho de quem está digitando sumiria da tela. */
/* ---------- aviso de versão nova ----------
   O Netlify sempre serve a versão mais recente, mas o navegador só a recebe quando
   a página é recarregada — quem está com o app aberto continua na versão antiga o
   dia inteiro. Por isso o app pergunta ao servidor, de tempos em tempos, qual é a
   versão publicada. Lê só os primeiros bytes do arquivo (a marca <!--PCP:x.yz-->
   na linha 1), então custa poucos bytes por consulta, não os 550 KB do app. */
/* Recarregar a página joga a pessoa de volta à aba de partida. Guardar a aba faz
   o app voltar onde ela estava — vale para o botão de atualizar e para qualquer F5. */
function lembrarAba() { try { localStorage.setItem("pcp:aba", S.aba); } catch {} }
function restaurarAba() {
  try {
    const a = localStorage.getItem("pcp:aba");
    /* precisa existir de verdade: podeAba() libera tudo para a administração,
       então um valor estragado no navegador passaria e a tela ficaria em branco */
    const existe = ABAS_TODAS.some(([id]) => id === a);
    if (a && existe && typeof podeAba === "function" && podeAba(a)) S.aba = a;
  } catch {}
}

const versaoNum = (v) => { const [a, b] = String(v || "0").split("."); return (Number(a) || 0) * 1000 + (Number(b) || 0); };
async function versaoPublicada() {
  if (!temJanelaReal || !/^https?:$/.test(window.location.protocol)) return null;
  try {
    /* cache:no-store já garante ida ao servidor; parâmetro na URL não é preciso
       e alguns servidores recusam a consulta com ele na raiz do site. */
    const r = await fetch(window.location.pathname, { cache: "no-store", headers: { Range: "bytes=0-60" } });
    if (!r.ok && r.status !== 206) return null;
    const m = (await r.text()).match(/<!--PCP:([\d.]+)-->/);
    return m ? m[1] : null;
  } catch { return null; }
}
async function conferirVersao() {
  const pub = await versaoPublicada();
  if (pub && versaoNum(pub) > versaoNum(VERSAO)) { S.versaoNova = { versao: pub }; render(); }
  else if (pub) S.versaoPublicada = pub;
}

let _sincTimer = null;
function editando() {
  if (S.modal) return true;
  const a = document.activeElement;
  return !!(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable));
}

