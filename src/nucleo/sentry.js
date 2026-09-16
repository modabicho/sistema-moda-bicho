/* ===========================================================================
   SENTRY · SÓ MONITORAMENTO (v8.88)
   ---------------------------------------------------------------------------
   Este arquivo NÃO muda o comportamento do app. Ele existe para responder uma
   pergunta que hoje depende de a Ana tirar um print: "o que estourou, em qual
   versão, em qual tela".

   REGRAS DESTE ARQUIVO, todas verificáveis lendo o código abaixo:

     · se o Sentry não carregar (bloqueado, offline, CDN fora), NADA aqui
       estoura e nada muda — toda função sai calada;
     · nenhuma chamada a `render()`, a `toast()` ou a qualquer coisa do fluxo;
     · o tratamento de erro que já existe continua igual: o que se adiciona é
       um aviso PARALELO, nunca uma substituição;
     · nada de senha, token, Authorization, cookie ou chave do Supabase sai
       daqui — ver `sentryLimpar` e `SENTRY_SEGREDO`.

   O carregador fica no `<head>` (casca-topo.html), antes do JS do app: é ele
   que instala os laços de erro global e de promessa rejeitada, e que guarda o
   que acontecer antes de o SDK terminar de carregar.
   =========================================================================== */

/* 10% das transações, como combinado. Replay DESLIGADO. */
const SENTRY_AMOSTRA_TRACE = 0.1;

/* Tudo que NÃO pode sair do navegador. A comparação é pelo NOME do campo, em
   qualquer profundidade, e pelo formato do valor (um JWT tem três partes
   separadas por ponto). */
const SENTRY_SEGREDO = /(authorization|cookie|api[-_]?key|apikey|access[-_]?token|refresh[-_]?token|\btoken\b|senha|password|passwd|secret|bearer|jwt|supabase|sb-[a-z0-9]+-auth|anon[-_]?key)/i;
/* um JWT em qualquer lugar do texto — não só quando o valor inteiro é o token.
   A bateria pegou um caso real: chave de nome inocente (`solto`) com o token
   dentro, e a versão antiga só olhava o começo da string e exigia pedaços
   longos demais. */
const SENTRY_PARECE_JWT = /\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{3,}/g;
const SENTRY_OCULTO = "[removido pelo PCP]";

/* percorre um objeto trocando por `[removido]` tudo que casa com a regra.
   Profundidade limitada: evento de erro não é lugar de varrer árvore grande. */
function sentryLimpar(valor, prof) {
  const nivel = prof || 0;
  if (nivel > 4 || valor == null) return valor;
  /* o token some, o resto da frase fica — um evento sem contexto não serve */
  if (typeof valor === "string") return valor.replace(SENTRY_PARECE_JWT, SENTRY_OCULTO);
  if (Array.isArray(valor)) return valor.slice(0, 50).map((x) => sentryLimpar(x, nivel + 1));
  if (typeof valor !== "object") return valor;
  const saida = {};
  for (const k of Object.keys(valor)) {
    saida[k] = SENTRY_SEGREDO.test(k) ? SENTRY_OCULTO : sentryLimpar(valor[k], nivel + 1);
  }
  return saida;
}

/* a URL sem a parte que pode carregar chave (`?apikey=…`) */
function sentryUrlLimpa(u) {
  try { return String(u || "").split("?")[0].split("#")[0]; } catch (e) { return ""; }
}

/* onde a pessoa estava. Lido na HORA do evento, não guardado — assim não custa
   nada enquanto não há erro nenhum. */
function sentryOnde() {
  const t = {};
  try { t.versao = typeof VERSAO !== "undefined" ? String(VERSAO) : "?"; } catch (e) { t.versao = "?"; }
  try { t.aba = (typeof S !== "undefined" && S && S.aba) ? String(S.aba) : "?"; } catch (e) {}
  try { t.janela = (typeof S !== "undefined" && S && S.modal && S.modal.tipo) ? String(S.modal.tipo) : "nenhuma"; } catch (e) {}
  try { t.abaInterna = (typeof S !== "undefined" && S && S.abaAtiva) ? String(S.abaAtiva) : "nenhuma"; } catch (e) {}
  try { t.pronto = (typeof S !== "undefined" && S) ? String(!!S.pronto) : "?"; } catch (e) {}
  return t;
}

/* ---------------------------------------------------------------------------
   A CONFIGURAÇÃO
   ---------------------------------------------------------------------------
   `Sentry.onLoad` é do carregador: ele enfileira isto e roda quando o SDK
   chegar. Se o carregador não veio, `window.Sentry` não existe e a função sai
   pelo `return` da primeira linha — sem erro, sem espera, sem nova tentativa.
   --------------------------------------------------------------------------- */
let _sentryJaConfigurou = false;
function sentryLigar() {
  const configurar = () => {
    try {
      if (_sentryJaConfigurou) return;          /* uma vez só, venha por onde vier */
      if (!window.Sentry || typeof window.Sentry.init !== "function") return;
      _sentryJaConfigurou = true;
      window.Sentry.init({
        /* a versão do PCP vira o `release` — é ela que diz em qual versão o
           erro aconteceu, que é o ponto de tudo isto */
        release: "pcp@" + (typeof VERSAO !== "undefined" ? VERSAO : "?"),
        environment: (function () {
          try {
            const h = String(location.hostname || "");
            if (!h || h === "localhost" || h === "127.0.0.1" || location.protocol === "file:") return "local";
            if (/^(pcp\.local|.*\.test)$/.test(h)) return "bancada";
            return "producao";
          } catch (e) { return "desconhecido"; }
        })(),
        /* 10% · desempenho */
        tracesSampleRate: SENTRY_AMOSTRA_TRACE,
        /* -------------------------------------------------------------------
           NENHUM CABEÇALHO NOVO EM REQUISIÇÃO NENHUMA
           -------------------------------------------------------------------
           Com tracing ligado, o SDK anexa `sentry-trace` e `baggage` às
           requisições que casam com `tracePropagationTargets` (por padrão, as
           de mesma origem). O PCP fala com o Supabase, que é outra origem:
           cabeçalho novo numa chamada com CORS é exatamente o tipo de coisa que
           "não altera o app" até o dia em que altera. Lista vazia = o SDK mede
           o tempo, mas não encosta em nenhuma requisição que sai daqui.
           ------------------------------------------------------------------- */
        tracePropagationTargets: [],
        /* Session Replay DESLIGADO — as duas taxas em zero, e a integração
           removida da lista caso o pacote do carregador a traga. */
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        integrations: function (padrao) {
          try { return (padrao || []).filter((i) => !/replay/i.test((i && i.name) || "")); }
          catch (e) { return padrao; }
        },
        /* nada de IP, cookie ou cabeçalho por padrão */
        sendDefaultPii: false,
        /* o que sai daqui passa por esta peneira, sempre */
        beforeSend: function (evento) {
          try {
            evento.tags = Object.assign({}, evento.tags, sentryOnde());
            if (evento.request) {
              delete evento.request.cookies;
              delete evento.request.headers;
              delete evento.request.query_string;
              if (evento.request.url) evento.request.url = sentryUrlLimpa(evento.request.url);
              if (evento.request.data) evento.request.data = sentryLimpar(evento.request.data);
            }
            if (evento.extra) evento.extra = sentryLimpar(evento.extra);
            if (evento.contexts) evento.contexts = sentryLimpar(evento.contexts);
            if (evento.user) evento.user = { id: evento.user.id ? String(evento.user.id).slice(0, 8) : undefined };
            return evento;
          } catch (e) { return evento; }
        },
        /* a migalha de rede guarda URL: tira a query e some com corpo/cabeçalho */
        beforeBreadcrumb: function (m) {
          try {
            if (!m) return m;
            if (m.data) {
              if (m.data.url) m.data.url = sentryUrlLimpa(m.data.url);
              m.data = sentryLimpar(m.data);
            }
            /* migalha de console pode carregar o objeto inteiro que foi logado */
            if (m.category === "console" && m.message) m.message = String(m.message).slice(0, 500);
            return m;
          } catch (e) { return m; }
        },
      });
      window.Sentry.setTags(sentryOnde());
    } catch (e) { /* configurar o monitoramento nunca pode derrubar o app */ }
  };

  /* -------------------------------------------------------------------------
     DUAS ORDENS POSSÍVEIS, E NENHUMA ESPERA
     -------------------------------------------------------------------------
     A tag do carregador é `async`, para que um domínio bloqueado ou lento não
     segure a abertura do PCP. Isso deixa duas ordens possíveis:

       · o carregador chegou primeiro → `window.Sentry` já existe, e
         `Sentry.onLoad` enfileira a configuração para quando o SDK terminar;
       · o app chegou primeiro → `window.Sentry` ainda não existe, e aí vale o
         gancho do próprio carregador: `window.sentryOnLoad`, que ele chama
         assim que carregar.

     Nos dois casos ninguém espera por ninguém, não há relógio, não há nova
     tentativa. Se o carregador nunca chegar, `configurar` nunca roda — e o app
     não sente falta.
     ------------------------------------------------------------------------- */
  try {
    let S2 = null;
    try { S2 = typeof window !== "undefined" ? window.Sentry : null; } catch (e) { S2 = null; }
    if (typeof window !== "undefined") window.sentryOnLoad = configurar;
    if (S2 && typeof S2.onLoad === "function") { S2.onLoad(configurar); return true; }
    if (S2 && typeof S2.init === "function") { configurar(); return true; }
    return false;   /* ainda não chegou: quem chama é o `sentryOnLoad` acima */
  } catch (e) { return false; }
}

/* ---------------------------------------------------------------------------
   O AVISO EXPLÍCITO
   ---------------------------------------------------------------------------
   Para os lugares em que o app JÁ trata o erro e só registra no console: a
   chamada abaixo entra AO LADO do tratamento existente, nunca no lugar dele.
   Devolve `true`/`false` só para quem quiser saber; ninguém é obrigado a olhar.
   --------------------------------------------------------------------------- */
function sentryAvisar(erro, onde, extra) {
  try {
    if (typeof window === "undefined" || !window.Sentry) return false;
    const cap = window.Sentry.captureException;
    if (typeof cap !== "function") return false;
    const marcas = sentryOnde();
    marcas.ponto = String(onde || "?").slice(0, 60);
    const dados = extra ? sentryLimpar(extra) : null;
    if (typeof window.Sentry.withScope === "function") {
      window.Sentry.withScope(function (escopo) {
        try {
          escopo.setTags(marcas);
          escopo.setLevel("error");
          if (dados) escopo.setContext("pcp", dados);
        } catch (e) {}
        window.Sentry.captureException(erro instanceof Error ? erro : new Error(String(erro)));
      });
    } else {
      window.Sentry.captureException(erro instanceof Error ? erro : new Error(String(erro)));
    }
    return true;
  } catch (e) { return false; }
}

/* Um recado sem exceção (para o que é aviso, não estouro). Mesmas regras. */
function sentryRecado(texto, nivel, extra) {
  try {
    if (typeof window === "undefined" || !window.Sentry) return false;
    if (typeof window.Sentry.captureMessage !== "function") return false;
    const marcas = sentryOnde();
    const dados = extra ? sentryLimpar(extra) : null;
    if (typeof window.Sentry.withScope === "function") {
      window.Sentry.withScope(function (escopo) {
        try { escopo.setTags(marcas); escopo.setLevel(nivel || "warning");
          if (dados) escopo.setContext("pcp", dados); } catch (e) {}
        window.Sentry.captureMessage(String(texto).slice(0, 300));
      });
    } else window.Sentry.captureMessage(String(texto).slice(0, 300));
    return true;
  } catch (e) { return false; }
}

/* diagnóstico para o console: dá para saber se o monitoramento está de pé sem
   abrir o painel do Sentry */
function sentryEstado() {
  try {
    const tem = typeof window !== "undefined" && !!window.Sentry;
    return { carregado: tem, iniciado: !!(tem && window.Sentry.getClient && window.Sentry.getClient()),
      release: "pcp@" + (typeof VERSAO !== "undefined" ? VERSAO : "?"),
      amostraTrace: SENTRY_AMOSTRA_TRACE, replay: "desligado", onde: sentryOnde() };
  } catch (e) { return { carregado: false, erro: String(e).slice(0, 120) }; }
}

/* liga na carga do arquivo. Se o carregador não veio, isto devolve `false` e a
   vida segue — é o caminho testado em `testes/sentry-bloqueado.js`. */
const SENTRY_LIGADO = sentryLigar();
