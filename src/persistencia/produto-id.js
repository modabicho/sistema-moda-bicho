/* ===========================================================================
   O ID DO PRODUTO · subsistema fechado                              v8.45
   ---------------------------------------------------------------------------
   ERA ASSIM (produtos/provisorios.js, até a v8.41):

       S.cfg.prodSeq = (S.cfg.prodSeq || 0) + 1;
       return "PROD-" + String(S.cfg.prodSeq).padStart(6, "0");

   E `cfg` só era gravado em UM dos oito caminhos de criação. Entre sessões o
   contador voltava atrás e repetia id; entre pessoas, `cfg` funde por opção e
   dois navegadores geravam o MESMO id para produtos diferentes — e a fusão
   por `id` fazia um deles sumir em silêncio.

   Agora quem entrega o número é uma SEQUÊNCIA DO POSTGRES (arquivo 121), que
   é atômica por construção. O formato não muda: `PROD-000123`.

   ---------------------------------------------------------------------------
   AS SEIS DECISÕES DESTE ARQUIVO, e o defeito que cada uma fecha
   ---------------------------------------------------------------------------

   1 · A RESERVA MORA EM `sessionStorage`, NÃO EM `localStorage`.
       `localStorage` é compartilhado entre as ABAS do mesmo navegador, e
       sacar um id é ler-modificar-escrever sem trava: duas abas leem
       `[a,b,c]`, as duas tiram `a`, as duas gravam `[b,c]` — id repetido E id
       perdido. `sessionStorage` é por aba, sobrevive ao F5 e é isolado entre
       abas, que é exatamente a semântica que a reserva precisa.
       O preço, dito: fechar a aba perde os ids não usados. Buraco na
       sequência é barato; id repetido não é.

   2 · GANCHO PRÓPRIO NO BOOT, fora de `telaAbrir()`.
       `telaAbrir` começa com `if (!sessao) return`, e quando a validação do
       login chega um segundo atrasada ela sai cedo — e nada depois dela roda.
       É o mesmo acoplamento que a v8.37 consertou nos cadastros.

   3 · RESPOSTA VAZIA OU TORTA FALHA ALTO.
       `Array.isArray(c.ids)` aceitava `[]` e registrava `resultado: "ok"` com
       zero id — verde por vazio, com o diagnóstico dizendo "abastecida".
       Agora a resposta é VALIDADA: tem de vir lista não vazia, de textos, no
       formato `PROD-000000`, e sem repetido.

   4 · O SAQUE É CONFERIDO.
       Depois de gravar, relê e confirma que o id saiu da fila. Se não saiu
       (outra coisa reescreveu no meio), o saque é refeito.

   5 · FALHA PASSAGEIRA REPETE, FALHA DEFINITIVA NÃO.
       `sem-sessao` e rede repetem (o app abre antes de o login valer).
       `sem-rpc` não repete: repetir o que se sabe que falha é barulho.

   6 · TUDO DEIXA RASTRO.
       `prodReservaEstado()` responde com a última tentativa e a trilha do
       boot. `ultimaTentativa: null` já custou uma tarde de investigação.
   =========================================================================== */

const PROD_RESERVA_CHAVE = "pcp5:prod-ids";
const PROD_ULTIMA_CHAVE  = "pcp5:prod-ids-ultima";
const PROD_RESERVA_LOTE = 25;      /* quantos sacar por vez */
const PROD_RESERVA_MINIMA = 8;     /* abaixo disto, completa em segundo plano */
const PROD_FORMATO = /^PROD-\d{6}$/;
const PROD_MAX_TENTATIVAS = 5;
let PROD_BUSCANDO = false;

/* ---------------------------------------------------------------------------
   O GUARDA-VOLUMES · `sessionStorage`, com `localStorage` como último recurso
   --------------------------------------------------------------------------- */
const PROD_CAIXA = (() => {
  try { const s = window.sessionStorage; s.setItem("pcp5:t", "1"); s.removeItem("pcp5:t"); return s; }
  catch { try { return window.localStorage; } catch { return null; } }
})();
function prodGet(k) { try { return PROD_CAIXA && PROD_CAIXA.getItem(k); } catch { return null; } }
function prodSet(k, v) { try { if (PROD_CAIXA) PROD_CAIXA.setItem(k, v); } catch {} }

/* A TRILHA. Diz por onde o boot passou, para `ultimaTentativa: null` nunca
   mais ser uma pergunta sem resposta. */
const PROD_TRILHA = [];
function prodMarcar(o) {
  PROD_TRILHA.push(Object.assign({ t: new Date().toISOString().slice(11, 23) }, o));
  if (PROD_TRILHA.length > 40) PROD_TRILHA.shift();
}
function prodUltimaLer() { try { return JSON.parse(prodGet(PROD_ULTIMA_CHAVE) || "null"); } catch { return null; } }
function prodUltimaGravar(x) {
  prodSet(PROD_ULTIMA_CHAVE, JSON.stringify(Object.assign({ quando: new Date().toISOString() }, x)));
}

/* ---------------------------------------------------------------------------
   A FILA · sempre limpa na leitura
   ---------------------------------------------------------------------------
   Uma reserva guardada por uma versão antiga, ou corrompida por qualquer
   motivo, não pode virar id de produto. A leitura peneira: só texto, só no
   formato, sem repetido. O que não passa é descartado — e a peneira é
   silenciosa de propósito, porque ela roda em todo saque.
   --------------------------------------------------------------------------- */
function prodReservaLer() {
  let v;
  try { v = JSON.parse(prodGet(PROD_RESERVA_CHAVE) || "[]"); } catch { return []; }
  if (!Array.isArray(v)) return [];
  const vistos = new Set(); const bons = [];
  for (const x of v) {
    if (typeof x !== "string" || !PROD_FORMATO.test(x) || vistos.has(x)) continue;
    vistos.add(x); bons.push(x);
  }
  return bons;
}
function prodReservaGravar(l) {
  prodSet(PROD_RESERVA_CHAVE, JSON.stringify((l || []).slice(0, 200)));
}

/* ---------------------------------------------------------------------------
   O SAQUE NO SERVIDOR · com a resposta validada
   --------------------------------------------------------------------------- */
function prodIdsDaResposta(c) {
  /* O PostgREST devolve o `jsonb` da função direto. Algumas versões embrulham
     em lista de um item — aceitar as duas formas custa uma linha e evita uma
     madrugada. */
  const obj = Array.isArray(c) ? c[0] : c;
  if (!obj || typeof obj !== "object") return { erro: "resposta não é objeto" };
  if (obj.status && obj.status !== "ok") return { erro: "servidor respondeu " + obj.status };
  const ids = obj.ids;
  if (!Array.isArray(ids)) return { erro: "resposta sem lista `ids`" };
  if (!ids.length) return { erro: "lista de ids VAZIA" };
  const vistos = new Set();
  for (const x of ids) {
    if (typeof x !== "string" || !PROD_FORMATO.test(x)) return { erro: "id fora do formato: " + JSON.stringify(x) };
    if (vistos.has(x)) return { erro: "o servidor repetiu um id: " + x };
    vistos.add(x);
  }
  return { ids };
}

async function prodReservaCompletar(quantos) {
  if (PROD_BUSCANDO) { prodMarcar({ passo: "completar", resultado: "ja-buscando" });
    return { status: "ja-buscando" }; }
  if (typeof persRpc !== "function" || typeof persToken !== "function" || !persToken()) {
    prodMarcar({ passo: "completar", resultado: "sem-sessao" });
    prodUltimaGravar({ status: "sem-sessao" });
    return { status: "sem-sessao" };
  }
  PROD_BUSCANDO = true;
  const n = quantos || PROD_RESERVA_LOTE;
  prodMarcar({ passo: "rpc", quantos: n });
  try {
    const r = await persRpc("pcp_produto_proximo_id", { p_quantos: n });
    const c = r && r.corpo;
    if (!r.ok) {
      const semRpc = r.status === 404
        || (c && (c.code === "PGRST202" || /não conhecida|does not exist|not find/i.test(String(c.message || ""))));
      const est = { status: semRpc ? "sem-rpc" : "falhou", http: r.status,
                    msg: String((c && (c.message || c.motivo)) || "").slice(0, 160) };
      prodMarcar({ passo: "completar", resultado: est.status });
      prodUltimaGravar(est); return Object.assign({ corpo: c }, est);
    }
    if (c && c.status === "sem-permissao") {
      const est = { status: "sem-permissao", http: r.status, msg: "pcp_sou_da_casa() deu falso" };
      prodMarcar({ passo: "completar", resultado: est.status });
      prodUltimaGravar(est); return est;
    }
    /* RESPOSTA VAZIA OU TORTA É FALHA, e falha ALTA. Aceitar `[]` como sucesso
       era registrar `ok` com zero id e dizer "abastecida" a uma reserva vazia. */
    const lida = prodIdsDaResposta(c);
    if (lida.erro) {
      const est = { status: "resposta-invalida", http: r.status, msg: lida.erro };
      prodMarcar({ passo: "completar", resultado: est.status });
      prodUltimaGravar(est); return est;
    }
    const fila = prodReservaLer();
    const juntos = fila.concat(lida.ids.filter((x) => !fila.includes(x)));
    prodReservaGravar(juntos);
    const conferido = prodReservaLer().length;
    const est = { status: "ok", recebidos: lida.ids.length, naReserva: conferido };
    prodMarcar({ passo: "completar", resultado: "ok", recebidos: lida.ids.length });
    prodUltimaGravar(est);
    return est;
  } catch (e) {
    const est = { status: "falhou", msg: String((e && e.message) || e).slice(0, 160) };
    prodMarcar({ passo: "completar", resultado: "falhou" });
    prodUltimaGravar(est); return est;
  } finally { PROD_BUSCANDO = false; }
}

/* Não repete o que se sabe que vai falhar. Repete o que muda com o tempo. */
const PROD_REPETIVEL = ["falhou", "sem-sessao", "resposta-invalida", "ja-buscando"];

/* ---------------------------------------------------------------------------
   A QUARENTENA DO ERRO PERMANENTE
   ---------------------------------------------------------------------------
   `sem-rpc` e `sem-permissao` não se resolvem tentando de novo — dependem de
   alguém aplicar um arquivo ou dar um grant. Sem quarentena, cada gatilho
   (boot, abertura de tela, e um saque com a reserva vazia) disparava uma
   chamada nova: criar 50 produtos com o 121 faltando eram 50 chamadas 404.
   Não era laço de código, era laço de uso — e dá no mesmo no console dela.
   A espera é de um minuto, e não "nunca mais", para que aplicar o 121 com a
   página aberta volte a funcionar sozinho, sem F5.
   --------------------------------------------------------------------------- */
const PROD_TERMINAIS = ["sem-rpc", "sem-permissao"];
const PROD_ESPERA_TERMINAL = 60000;
function prodTerminalRecente() {
  const u = prodUltimaLer();
  if (!u || PROD_TERMINAIS.indexOf(u.status) < 0) return null;
  const quando = Date.parse(u.quando || "");
  if (!quando || Date.now() - quando > PROD_ESPERA_TERMINAL) return null;
  return u.status;
}

function prodReservaGarantir(tentativa, de) {
  const n = tentativa || 1;
  const tem = prodReservaLer().length;
  const parado = prodTerminalRecente();
  prodMarcar({ passo: "garantir", de: de || "?", tentativa: n, naReserva: tem,
               espera: parado || undefined });
  if (parado) return;   /* em quarentena: tentar de novo agora só faz barulho */
  /* O MÍNIMO É CHÃO, NÃO POUSO. Com `>=`, uma reserva parada em exatamente 8
     se recusava a completar, e só reagia depois de furar o próprio piso, com
     7 — quer dizer, a garantia de folga nunca valia o número prometido.
     Com `>`, tocar o mínimo já manda buscar. */
  if (tem > PROD_RESERVA_MINIMA) return;
  /* Completa ATÉ o lote, não SOMA um lote. Pedir 25 sobre 8 devolvia 33 e
     queimava número de sequência à toa; a reserva tem tamanho, não apetite. */
  const faltam = Math.max(1, PROD_RESERVA_LOTE - tem);
  Promise.resolve()
    .then(() => prodReservaCompletar(faltam))
    .then((r) => {
      const st = (r && r.status) || "falhou";
      if (st === "ok" || !PROD_REPETIVEL.includes(st) || n >= PROD_MAX_TENTATIVAS) return;
      setTimeout(() => prodReservaGarantir(n + 1, "retry"), 1500 * n);
    })
    .catch(() => {});
}

/* O gancho do boot. Chamado de `boot.js`, fora de `telaAbrir()`. */
function prodBootAbastecer() {
  prodMarcar({ passo: "boot" });
  prodReservaGarantir(1, "boot");
}

/* ---------------------------------------------------------------------------
   O ID TEMPORÁRIO · o modo degradado, marcado e nunca disfarçado
   ---------------------------------------------------------------------------
   `T` de temporário, e a sequência do servidor nunca produz letra. Ele carrega
   uma marca da ABA, sorteada uma vez: sem ela, duas abas que abrissem juntas
   geravam o mesmo id (medido: 6 repetidos em 80).
   --------------------------------------------------------------------------- */
const PROD_SESSAO = (() => {
  try {
    const k = "pcp5:prod-aba";
    let v = prodGet(k);
    if (!v) { v = Math.random().toString(36).toUpperCase().slice(2, 6)
      + Date.now().toString(36).toUpperCase().slice(-3); prodSet(k, v); }
    return v;
  } catch { return Math.random().toString(36).toUpperCase().slice(2, 9); }
})();
let PROD_TEMP = 0;
function prodIdTemporario() {
  PROD_TEMP++;
  return "PROD-T" + PROD_SESSAO + String(PROD_TEMP).padStart(3, "0");
}
const prodIdEhTemporario = (id) => /^PROD-T/.test(String(id || ""));

/* ---------------------------------------------------------------------------
   A PORTA ÚNICA · os oito caminhos de criação chamam isto
   ---------------------------------------------------------------------------
   Síncrona de propósito: os chamadores estão no meio de handlers de clique que
   já montam o objeto inteiro.
   O saque é CONFERIDO: grava e relê. Se o id ainda estiver na fila, alguma
   outra coisa reescreveu no meio — e aí ele é sacado de novo, em vez de sair
   duas vezes.
   --------------------------------------------------------------------------- */
function proximoIdProduto() {
  for (let volta = 0; volta < 3; volta++) {
    const fila = prodReservaLer();
    if (!fila.length) break;
    const id = fila[0];
    prodReservaGravar(fila.slice(1));
    if (prodReservaLer().includes(id)) continue;   /* não saiu: tenta de novo */
    prodReservaGarantir(1, "saque");
    return id;
  }
  prodReservaGarantir(1, "vazia");
  return prodIdTemporario();
}

/* ---------------------------------------------------------------------------
   O DIAGNÓSTICO · não abastece nada, só conta o que aconteceu
   --------------------------------------------------------------------------- */
function prodReservaEstado() {
  const fila = prodReservaLer();
  const u = prodUltimaLer();
  let explica;
  if (!u && !PROD_TRILHA.length) explica = "o abastecimento ainda não foi tentado nesta aba — recarregue a página";
  else if (!u) explica = "a rotina foi chamada (" + PROD_TRILHA.map((x) => x.passo).join(" → ")
    + ") e ainda não obteve resposta — veja `trilha`";
  else if (u.status === "ok") explica = "abastecida no servidor";
  else if (u.status === "sem-rpc") explica = "A FUNÇÃO `pcp_produto_proximo_id` NÃO EXISTE NO BANCO — "
    + "falta aplicar o arquivo 121. Enquanto isso os ids saem marcados como `PROD-T...`, e o 122 os lista.";
  else if (u.status === "sem-permissao") explica = "o servidor recusou por permissão (`pcp_sou_da_casa()` deu falso)";
  else if (u.status === "sem-sessao") explica = "não havia sessão aberta quando tentou — ele insiste sozinho";
  else if (u.status === "resposta-invalida") explica = "o servidor respondeu, mas a resposta não serve: " + (u.msg || "");
  else explica = "a chamada falhou: HTTP " + (u.http || "?") + " " + (u.msg || "");
  return { naReserva: fila.length, proximo: fila[0] || null,
           minima: PROD_RESERVA_MINIMA, lote: PROD_RESERVA_LOTE,
           caixa: PROD_CAIXA === (typeof window !== "undefined" && window.sessionStorage) ? "sessionStorage" : "localStorage",
           aba: PROD_SESSAO, ultimaTentativa: u, diagnostico: explica, trilha: PROD_TRILHA.slice() };
}
