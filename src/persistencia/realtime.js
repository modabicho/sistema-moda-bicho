/* ===========================================================================
   src/persistencia/realtime.js · O EVENTO CHEGA SEM APAGAR O QUE ESTÁ SENDO
   DIGITADO
   ---------------------------------------------------------------------------
   Item 13 da fase E, e a razão dele: hoje uma mudança que chega do servidor
   dispara um render geral. Quem estava com o modal aberto perde o rascunho, o
   foco e a posição do cursor no meio de uma frase. Isso é pior do que não ter
   Realtime.

   Três regras, e nenhuma delas é "renderizar menos":
     1. o evento NUNCA chama render global — ele entrega a linha e quem quiser
        que atualize o pedaço dela;
     2. campo que a pessoa está editando AGORA não é sobrescrito: a novidade
        fica guardada e é oferecida quando ela terminar;
     3. o próprio eco volta (o servidor não sabe quem gravou o quê) e é
        descartado pelo `revision` que a gente mesmo acabou de receber.
   =========================================================================== */

let RT_WS = null, RT_TIMER = null, RT_TENTATIVA = 0;
const RT_OUVINTES = [];                 /* (pedidoApp, evento) => void */
const RT_MINHAS_REVISOES = new Map();   /* id → revision que eu mesma gravei */
const RT_ADIADOS = new Map();           /* id → linha que chegou enquanto editava */

/* Quem está sendo editado agora. A tela avisa ao abrir e ao fechar o modal. */
const RT_EDITANDO = new Map();          /* id → Set(colunas) */
function rtEditando(id, colunas) {
  if (!id) return;
  if (!colunas || !colunas.length) RT_EDITANDO.delete(id);
  else RT_EDITANDO.set(id, new Set(colunas));
}
function rtSoltar(id) {
  RT_EDITANDO.delete(id);
  const guardada = RT_ADIADOS.get(id);
  /* v8.74 · P5 · a linha adiada também passa pela regra: enquanto a pessoa
     editava, a foto pode ter avançado por outro caminho (a gravação dela
     mesma), e entregar a guardada rebaixaria tudo. */
  if (guardada) { RT_ADIADOS.delete(id);
    if (!rtEhVelho(guardada)) rtEntregar(guardada, "adiado"); }
}

/* Marca uma revisão como minha, para o eco não voltar como novidade. */
function rtMinha(id, revision) {
  if (id && revision != null) RT_MINHAS_REVISOES.set(id, revision);
}

function rtOuvir(fn) { if (typeof fn === "function") RT_OUVINTES.push(fn); }

function rtEntregar(linha, origem) {
  const pedido = paraApp(linha);
  for (const fn of RT_OUVINTES) {
    try { fn(pedido, { origem, id: pedido.id, revision: linha.revision }); }
    catch (e) { /* um ouvinte quebrado não pode derrubar os outros */ }
  }
}

/* ---------------------------------------------------------------------------
   v8.74 · P5 · A REGRA MONOTÔNICA
   ---------------------------------------------------------------------------
   A rede não garante ordem. Medido na bancada (`conflito-revisao`, bloco 3):
   dois saves seguidos levam a linha a 5, o eco ATRASADO do primeiro chega com
   revisão 4, e `telaGuardar` REBAIXAVA a foto de 5 para 4. O save seguinte
   saía com `p_expected_revision: 4` e levava conflito — falso, e da pessoa com
   ela mesma.

   A regra, aplicada na ÚNICA porta por onde um evento entra:

     recebida  <  conhecida  → evento velho, ignorado
     recebida  == conhecida  → já é o que eu tenho: eco meu ou reentrega
     recebida  >  conhecida  → novidade de verdade, segue o caminho normal

   "Conhecida" é a revisão que `TELA_FOTO` tem — a mesma que vai em
   `p_expected_revision`. Sem foto daquele pedido, nada é comparado e o
   comportamento é o de antes: a novidade entra.

   Isto NÃO mexe em `p_expected_revision` e NÃO toca em rascunho: um evento
   ignorado não escreve em lugar nenhum.
   --------------------------------------------------------------------------- */
const RT_IGNORADOS = [];                /* rastro: id, recebida, conhecida, em */

function rtRevisaoConhecida(id) {
  try {
    if (typeof TELA_FOTO !== "undefined" && TELA_FOTO) {
      const f = TELA_FOTO.get(id);
      if (f && f.revision != null) return f.revision;
    }
  } catch (e) { /* sem camada de tela: não há o que comparar */ }
  const g = RT_ADIADOS.get(id);
  return g && g.revision != null ? g.revision : null;
}

/* `true` = não aplicar. Devolve também o porquê, para o rastro. */
function rtEhVelho(linha) {
  if (!linha || !linha.id || linha.revision == null) return false;
  const conhecida = rtRevisaoConhecida(linha.id);
  if (conhecida == null) return false;
  if (linha.revision < conhecida) {
    RT_IGNORADOS.push({ id: linha.id, recebida: linha.revision, conhecida,
      motivo: "atrasado", em: Date.now() });
    if (RT_IGNORADOS.length > 200) RT_IGNORADOS.splice(0, RT_IGNORADOS.length - 200);
    return true;
  }
  if (linha.revision === conhecida) {
    /* já está aplicado. Se era o meu eco, a marca se consome aqui — é o mesmo
       efeito da regra 3, agora cobrindo também a REENTREGA da mesma linha. */
    if (RT_MINHAS_REVISOES.get(linha.id) === linha.revision) RT_MINHAS_REVISOES.delete(linha.id);
    RT_IGNORADOS.push({ id: linha.id, recebida: linha.revision, conhecida,
      motivo: "ja-aplicado", em: Date.now() });
    if (RT_IGNORADOS.length > 200) RT_IGNORADOS.splice(0, RT_IGNORADOS.length - 200);
    return true;
  }
  return false;
}

function rtChegou(linha) {
  if (!linha || !linha.id) return;
  const id = linha.id;

  /* 4 · v8.74 · a regra monotônica, antes de tudo */
  if (rtEhVelho(linha)) return;

  /* 3 · é o meu próprio eco? */
  if (RT_MINHAS_REVISOES.get(id) === linha.revision) { RT_MINHAS_REVISOES.delete(id); return; }

  /* 2 · esta pessoa está com o pedido aberto? Então nada é sobrescrito agora.
     A linha fica guardada e volta quando ela fechar — e a tela pode, se quiser,
     mostrar um aviso discreto de que há novidade, sem tocar nos campos. */
  if (RT_EDITANDO.has(id)) {
    RT_ADIADOS.set(id, linha);
    for (const fn of RT_OUVINTES) {
      try { fn(paraApp(linha), { origem: "aviso", id, revision: linha.revision, editando: true }); }
      catch (e) {}
    }
    return;
  }
  rtEntregar(linha, "servidor");
}

/* ---------------------------------------------------------------------------
   A conexão. WebSocket cru, no protocolo do Supabase — o app não carrega a
   biblioteca deles e não vai passar a carregar por causa disto.
   --------------------------------------------------------------------------- */
function rtConectar() {
  if (typeof WebSocket === "undefined") return false;
  const tok = persToken();
  if (!tok) return false;
  if (RT_WS && RT_WS.readyState <= 1) return true;

  try {
    RT_WS = new WebSocket(`${PERS_URL.replace("https", "wss")}/realtime/v1/websocket?apikey=${PERS_KEY}&vsn=1.0.0`);
  } catch { return false; }

  RT_WS.onopen = () => {
    RT_TENTATIVA = 0;
    RT_WS.send(JSON.stringify({
      topic: "realtime:public:pcp_pedido", event: "phx_join", ref: "1",
      payload: { config: { broadcast: { self: false }, presence: { key: "" },
        postgres_changes: [{ event: "*", schema: "public", table: "pcp_pedido" }] },
        access_token: tok } }));
    RT_TIMER = setInterval(() => {
      try { RT_WS.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: "h" })); }
      catch {}
    }, 25000);
  };
  RT_WS.onmessage = (m) => {
    let d = null; try { d = JSON.parse(m.data); } catch { return; }
    if (d.event === "postgres_changes") rtChegou(d.payload?.data?.record);
  };
  RT_WS.onclose = () => {
    clearInterval(RT_TIMER);
    /* volta sozinho, com espera crescente — mas nunca some sem tentar */
    RT_TENTATIVA = Math.min(RT_TENTATIVA + 1, 6);
    setTimeout(rtConectar, 1000 * Math.pow(2, RT_TENTATIVA));
  };
  RT_WS.onerror = () => { try { RT_WS.close(); } catch {} };
  return true;
}
function rtDesligar() {
  try { clearInterval(RT_TIMER); RT_WS && RT_WS.close(); } catch {}
  RT_WS = null;
}
