/* ---------- persistência ----------
   O storage do artefato limita o TAMANHO de cada chamada e a taxa de
   requisições. Então: documentos por seção, cada um fatiado em pedaços
   de ~180 KB, gravados em sequência com retry — e só a seção que mudou. */
const NS = "pcp5";
const DOCS = {
  eventos: NS + ":eventos", nucleo: NS + ":nucleo", produtos: NS + ":produtos", estoque: NS + ":estoque",
  cad: NS + ":cad", cfg: NS + ":cfg", equipe: NS + ":equipe", hist: NS + ":hist",
  insumos: NS + ":insumos", festivas: NS + ":festivas", semi: NS + ":semi" };
const SECAO_NOME = { insumos: "insumos e notas", nucleo: "pedidos e necessidades", produtos: "produtos", estoque: "estoque",
  cad: "cadastros", cfg: "configuração", equipe: "equipe", eventos: "movimentos", hist: "histórico", festivas: "datas festivas",
  semi: "semiacabados" };
const KEYS_LEGADO = ["pcp4", "pcp:produtos", "pcp:ops", "pcp:remessas", "pcp:pedidos", "pcp:ops4", "pcp:pedidos4",
  "pcp:analises", "pcp:estoque", "pcp:cadastros", "pcp:config", "pcp:equipe", "pcp:eventos", "pcp:faltas"];
const LIMITE_PEDACO = 180000;
/* camadas de gravação, sondadas na abertura: servidor -> compartilhado -> pessoal -> localStorage */
/* ---------- cópia de teste x app de verdade ----------
   Um arquivo aberto do computador (file://) fala com o MESMO banco do app
   publicado. Quem abria a versão nova para conferir estava, sem saber,
   mexendo no que as meninas veem — pedido criado no teste virava pedido de
   verdade. Isto é o corte: fora do site publicado, o app LÊ o servidor
   (para haver dados de verdade na tela) e NÃO ESCREVE nada nele. Tudo o que
   se faz na cópia fica guardado só neste navegador.
   A regra é o endereço, não uma opção: opção alguém esquece de ligar. */
const MODO_TESTE = (() => {
  try {
    if (typeof window === "undefined" || !window.location) return false;
    const p = window.location.protocol, h = window.location.hostname || "";
    if (p === "file:" || p === "blob:") return true;
    /* e dá para pedir de propósito: abrir o endereço com ?teste=1 no fim vira
       cópia de teste mesmo estando no ar (serve para conferir um link de
       pré-visualização sem risco). Sai ao tirar o ?teste=1. */
    if (/[?&]teste=1(&|$)/.test(window.location.search || "")) return true;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "";
  } catch { return false; }
})();
const SUPA_URL = "https://tofhsyyhbdwidodvizgm.supabase.co";
const SUPA_KEY = "sb_publishable_KZAigzjh5FKrIPna0ItvWA_MPzQ5XV_";
const temJanelaReal = typeof window !== "undefined" && typeof window.fetch === "function"
  && typeof navigator !== "undefined" && !!navigator.userAgent;
function supaSessao() { try { return JSON.parse(localStorage.getItem(NS + ":supa") || "null"); } catch { return null; } }
function supaGravarSessao(v) { try { v ? localStorage.setItem(NS + ":supa", JSON.stringify(v)) : localStorage.removeItem(NS + ":supa"); } catch {} }
async function supaEntrar(email, senha) {
  const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: SUPA_KEY },
    body: JSON.stringify({ email, password: senha }) });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(j.error_description || j.msg || "e-mail ou senha errados");
  supaGravarSessao({ access: j.access_token, refresh: j.refresh_token, email: (j.user || {}).email || email, em: Date.now() });
  return j;
}
async function supaRenovar() {
  const ses = supaSessao();
  if (!ses?.refresh) return false;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: SUPA_KEY },
      body: JSON.stringify({ refresh_token: ses.refresh }) });
    const j = await r.json();
    if (!r.ok || !j.access_token) { supaGravarSessao(null); return false; }
    supaGravarSessao({ access: j.access_token, refresh: j.refresh_token || ses.refresh, email: ses.email, em: Date.now() });
    return true;
  } catch { return false; }
}
async function _supaReq(metodo, caminho, corpo, tentativa, prefer) {
  const ses = supaSessao();
  if (!ses?.access) throw new Error("servidor 401");
  /* Portão único: na cópia de teste, ler pode; escrever não sai daqui. Vale
     para tudo que fala com o banco — documentos, presença, pedidos —
     porque tudo passa por esta função. Devolve uma resposta vazia em vez de
     erro para não encher a tela de alarme falso: do lado de quem usa, é como
     se o servidor tivesse aceitado e não guardado. */
  if (MODO_TESTE && metodo !== "GET") {
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  const r = await fetch(`${SUPA_URL}/rest/v1/${caminho}`, {
    method: metodo,
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${ses.access}`, "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : metodo === "POST" ? { Prefer: "resolution=merge-duplicates" } : {}) },
    body: corpo != null ? JSON.stringify(corpo) : undefined });
  if ((r.status === 401 || r.status === 403) && !tentativa && await supaRenovar()) return _supaReq(metodo, caminho, corpo, 1, prefer);
  if (!r.ok) {
    /* o PostgREST devolve {code, message, hint} — é a explicação de verdade.
       Descartar isso e mostrar só o número deixava a pessoa adivinhando. */
    let detalhe = null;
    try { detalhe = JSON.parse(await r.clone().text()); } catch {}
    const err = new Error(`servidor ${r.status}${detalhe?.message ? ` — ${detalhe.message}` : ""}`);
    err.status = r.status; err.detalhe = detalhe;
    throw err;
  }
  return r;
}
async function supaTokenValido() {
  const ses = supaSessao();
  if (!ses?.access) return false;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${ses.access}` } });
    return r.ok;
  } catch { return false; }
}
/* diagnóstico legível do servidor — para a tela, não para o console */
async function supaDiagnostico() {
  if (!supaSessao()?.access) return { ok: false, msg: "Sem login no servidor — entre com e-mail e senha." };
  try {
    const k = NS + ":diag";
    await _setEm("supabase", k, "ok");
    const v = await _getEm("supabase", k);
    try { await _delEm("supabase", k); } catch {}
    if (v === "ok") return { ok: true, msg: "Servidor da empresa respondendo: leitura e gravação OK." };
    return { ok: false, msg: "O servidor respondeu, mas a leitura voltou vazia — confira as regras (policies) do script FASE2." };
  } catch (e) {
    const st = String(e.message || e).match(/servidor (\d+)/)?.[1];
    if (st === "404") return { ok: false, msg: "A tabela `docs` NÃO existe no banco — falta rodar o script FASE2-banco.sql no SQL Editor do Supabase." };
    if (st === "401" || st === "403") {
      const tokenOk = await supaTokenValido();
      if (!tokenOk) return { ok: false, msg: `Sessão vencida (${st}) — toque em "trocar conta" no rodapé do menu e entre de novo com e-mail e senha.` };
      return { ok: false, msg: `Login válido, mas o banco negou a gravação (${st}) — as regras (policies) do FASE2-banco.sql não estão ativas na tabela docs. Rode o script de novo no SQL Editor e confira com: select policyname from pg_policies where tablename='docs';` };
    }
    return { ok: false, msg: "Falha ao falar com o servidor: " + String(e.message || e).slice(0, 90) };
  }
}
const temStorage = typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
let CAMADA = null; /* "supabase" | "compartilhado" | "pessoal" | "local" | "memoria" */
const CAMADA_NOME = { supabase: "servidor da empresa", compartilhado: "espaço compartilhado", pessoal: "espaço pessoal", local: MODO_TESTE ? "só este navegador (cópia de teste)" : "este navegador", memoria: "APENAS NA MEMÓRIA" };
/* ---------- MFA · segundo fator (TOTP) ----------
   ETAPA 1: só as chamadas. Nada aqui é ligado em tela nenhuma ainda — o fluxo
   visual do login continua exatamente o que era. Estas funções existem para
   serem MEDIDAS agora (bateria `mfa-rest.js`) e usadas na etapa 2.

   O app não usa o SDK do Supabase, fala REST no braço. Então estes são os
   endereços de verdade do GoTrue, conferidos no `openapi.yaml` do repositório
   `supabase/auth` — não copiados de exemplo de blog:

     POST   /auth/v1/factors                    cadastrar (nasce `unverified`)
     POST   /auth/v1/factors/{id}/challenge     pedir desafio
     POST   /auth/v1/factors/{id}/verify        conferir o código  → tokens novos
     DELETE /auth/v1/factors/{id}               descadastrar
     GET    /auth/v1/user                       lista `factors[]`

   Os DOIS cabeçalhos são obrigatórios e cada um responde por uma coisa:
   `apikey` diz de qual projeto é a chamada; `Authorization: Bearer` diz QUEM
   está chamando. Faltando o segundo, o GoTrue não sabe de quem é o fator e a
   chamada morre em 401 — foi por isso que este arquivo tem uma função só para
   montar cabeçalho, em vez de repetir o objeto cinco vezes e esquecer numa. */
function mfaCabecalhos() {
  const ses = supaSessao();
  if (!ses?.access) throw new Error("sem sessão — entre com e-mail e senha antes");
  return { apikey: SUPA_KEY, Authorization: `Bearer ${ses.access}`, "Content-Type": "application/json" };
}
async function _mfaReq(metodo, caminho, corpo) {
  const r = await fetch(`${SUPA_URL}/auth/v1/${caminho}`, {
    method: metodo, headers: mfaCabecalhos(),
    body: corpo != null ? JSON.stringify(corpo) : undefined });
  let j = null;
  try { j = await r.json(); } catch {}
  if (!r.ok) {
    const err = new Error(j?.msg || j?.error_description || j?.message || `mfa ${r.status}`);
    err.status = r.status; err.detalhe = j;
    throw err;
  }
  return j;
}
/* O `aal` viaja DENTRO do token. Ler daqui é só para a tela saber o que pedir;
   quem valida é o banco, e é por isso que ler errado aqui não abre porta
   nenhuma. Sem a claim = sessão de um fator, igual ao que o 145 assume. */
function mfaNivelDaSessao() {
  const ses = supaSessao();
  if (!ses?.access) return null;
  try {
    const meio = ses.access.split(".")[1];
    const txt = atob(meio.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decodeURIComponent(escape(txt))).aal || "aal1";
  } catch { return "aal1"; }
}
const mfaTemAal2 = () => mfaNivelDaSessao() === "aal2";
/* Fatores já cadastrados. Só os `verified` valem para entrar: um fator que
   parou no meio do cadastro fica `unverified` e não promove sessão nenhuma. */
async function mfaFatores() {
  const u = await _mfaReq("GET", "user");
  const todos = (u && u.factors) || [];
  return todos.filter((f) => f.factor_type === "totp");
}
const mfaVerificados = (lista) => (lista || []).filter((f) => f.status === "verified");
/* Cadastrar. A resposta traz `qr_code` já pronto em SVG — não precisamos de
   biblioteca de QR — e `secret`, para quem prefere digitar à mão. */
async function mfaCadastrar(apelido) {
  const nome = apelido || "Autenticador";
  try {
    return await _mfaReq("POST", "factors", {
      factor_type: "totp", friendly_name: nome, issuer: "Moda Bicho PCP" });
  } catch (e) {
    /* O serviço de login recusa dois autenticadores com o mesmo apelido. Isso
       acontece de verdade: quem cadastrou "Celular principal" num navegador e
       tenta de novo em outro cai exatamente aqui — e a mensagem que voltava
       para a tela era o texto cru, em inglês. Em vez de reclamar, o app usa um
       apelido livre e segue. */
    if (!/already exists|duplicate|friendly[_ ]?name/i.test(String(e?.message || ""))) throw e;
    const usados = new Set((await mfaFatores().catch(() => [])).map((f) => String(f.friendly_name || "").toLowerCase()));
    let tentativa = nome, n = 2;
    while (usados.has(tentativa.toLowerCase()) && n < 12) tentativa = `${nome} ${n++}`;
    return _mfaReq("POST", "factors", {
      factor_type: "totp", friendly_name: tentativa, issuer: "Moda Bicho PCP" });
  }
}
async function mfaDesafiar(fatorId) { return _mfaReq("POST", `factors/${fatorId}/challenge`); }
/* Conferir o código. É esta chamada que faz as duas coisas ao mesmo tempo:
   promove o fator de `unverified` para `verified` (quando é o primeiro código)
   e devolve um par NOVO de tokens, já em aal2. Guardar esse par é o que faz a
   sessão inteira subir de nível — inclusive para o banco. */
async function mfaConferir(fatorId, desafioId, codigo) {
  const j = await _mfaReq("POST", `factors/${fatorId}/verify`, {
    challenge_id: desafioId, code: String(codigo || "").replace(/\D/g, "") });
  if (j && j.access_token) {
    const ses = supaSessao() || {};
    supaGravarSessao({ access: j.access_token, refresh: j.refresh_token || ses.refresh,
      email: (j.user || {}).email || ses.email, em: Date.now() });
  }
  return j;
}
/* Descadastrar rebaixa o nível só depois que o token for renovado. Renovar na
   hora evita a janela em que a tela acha que ainda está em aal2. */
async function mfaDescadastrar(fatorId) {
  const j = await _mfaReq("DELETE", `factors/${fatorId}`);
  try { await supaRenovar(); } catch {}
  return j;
}

/* ---------- O PORTÃO ----------
   v8.55 · uma confirmação POR ABERTURA DO APP.

   O problema que isto conserta: até a v8.54 o portão guardava a decisão em
   `localStorage`, que sobrevive a fechar o navegador. Resultado: quem confirmou
   o código uma vez entrava direto no dia seguinte — a sessão do servidor
   continuava válida e o app aceitava isso como autorização. Token válido e
   "pode entrar agora" são duas coisas diferentes, e o app tratava como uma só.

   Agora são duas de verdade:

     A SESSÃO DO SERVIDOR   `localStorage["pcp5:supa"]`
                            dura enquanto o servidor deixar. Não muda.

     A AUTORIZAÇÃO DESTA     `sessionStorage["pcp5:mfa-abertura"]`
     ABERTURA                nasce quando ela confirma o código e morre quando a
                            aba é fechada. É a única coisa que libera a ADM.

   Por que `sessionStorage`, e o que isso significa na prática:
     F5                     mantém          → continua dentro
     navegar pelo PCP       mantém          → continua dentro
     trocar de aba          mantém          → continua dentro
     fechar a aba/janela    APAGA           → pede o código de novo
     fechar o navegador     APAGA           → pede o código de novo
     abrir uma SEGUNDA aba  ela nasce vazia → pede o código nessa aba
   A última linha é mais rigorosa do que "fechar o navegador", e é de propósito:
   uma aba nova é uma abertura nova. Se atrapalhar o dia a dia, dá para afrouxar
   com um combinado entre abas — mas isso é decisão dela, não minha.

   E a decisão NÃO é mais tomada só depois da senha: ela é tomada em TODA
   abertura, com a resposta do servidor na mão. Estado velho no navegador não
   decide nada porque não é mais consultado para decidir. */
const MFA_ABERTURA = NS + ":mfa-abertura";
const MFA_PAPEL    = NS + ":mfa-papel";
const MFA_VERSAO   = 1;
/* Chaves que EXISTIRAM e não existem mais. Ficam nomeadas aqui para serem
   apagadas na abertura: estado de uma versão anterior não pode nem prender
   ninguém nem deixar alguém entrar. */
const MFA_OBSOLETAS = [NS + ":mfa"];

function mfaLerJson(chave, onde) {
  try {
    const cru = (onde || localStorage).getItem(chave);
    if (!cru) return null;
    const j = JSON.parse(cru);
    /* sem versão, ou de outra versão, é lixo de antes: não se tenta adivinhar */
    if (!j || typeof j !== "object" || j.v !== MFA_VERSAO) { onde.removeItem(chave); return null; }
    return j;
  } catch { try { (onde || localStorage).removeItem(chave); } catch {} return null; }
}
/* Faxina de abertura. Roda antes de qualquer decisão. */
function mfaLimparEstadoAntigo() {
  const apagadas = [];
  try {
    for (const k of MFA_OBSOLETAS) if (localStorage.getItem(k) != null) { localStorage.removeItem(k); apagadas.push(k); }
  } catch {}
  /* autorização de outra conta não vale para esta */
  const email = String(supaSessao()?.email || "").toLowerCase();
  const ab = mfaLerJson(MFA_ABERTURA, sessionStorage);
  if (ab && (!email || String(ab.email || "").toLowerCase() !== email)) {
    try { sessionStorage.removeItem(MFA_ABERTURA); } catch {}
    apagadas.push(MFA_ABERTURA + " (era de outra conta)");
  }
  const pa = mfaLerJson(MFA_PAPEL, localStorage);
  if (pa && (!email || String(pa.email || "").toLowerCase() !== email)) {
    try { localStorage.removeItem(MFA_PAPEL); } catch {}
    apagadas.push(MFA_PAPEL + " (era de outra conta)");
  }
  if (apagadas.length) { try { console.info("MFA · estado antigo descartado:", apagadas.join(", ")); } catch {} }
  return apagadas;
}
function mfaAberturaAutorizada() {
  const ab = mfaLerJson(MFA_ABERTURA, sessionStorage);
  const email = String(supaSessao()?.email || "").toLowerCase();
  return !!(ab && email && String(ab.email || "").toLowerCase() === email);
}
function mfaAutorizarAbertura() {
  try { sessionStorage.setItem(MFA_ABERTURA, JSON.stringify({
    v: MFA_VERSAO, email: String(supaSessao()?.email || "").toLowerCase(), em: Date.now() })); } catch {}
}
/* Lembrete durável de QUEM é a conta — nunca de que ela pode entrar.
   Serve a um caso só: o servidor não responder na abertura. Aí, se este
   lembrete disser que a conta NÃO administra, o trabalho de setor continua
   (inclusive sem internet). Se disser que administra, ou se não existir, a tela
   pede para tentar de novo — porque deixar entrar seria justamente o furo. */
function mfaLembrarPapel(adm) {
  try { localStorage.setItem(MFA_PAPEL, JSON.stringify({
    v: MFA_VERSAO, email: String(supaSessao()?.email || "").toLowerCase(), adm: !!adm, em: Date.now() })); } catch {}
}
const mfaPapelLembrado = () => { const p = mfaLerJson(MFA_PAPEL, localStorage); return p ? !!p.adm : null; };

/* "Sou adm?" e "a MFA já é obrigatória?" são PERGUNTAS — vão em GET. Não é
   estilo: o portão da cópia de teste barra tudo que não é GET, e um POST
   voltaria vazio, fazendo a cópia de teste achar que ninguém administra. */
async function mfaSouAdmNoServidor() {
  const r = await _supaReq("GET", "rpc/pcp_sou_adm");
  const j = await r.json();
  return j === true || j === "true";
}
async function mfaExigidaNoServidor() {
  try {
    const r = await _supaReq("GET", "rpc/pcp_mfa_exigida");
    const j = await r.json();
    return j === true || j === "true";
  } catch { return false; }
}
/* Fator que parou no meio do cadastro é lixo: não vale para entrar e vai se
   empilhando a cada tentativa abandonada. Some antes de criar outro. */
async function mfaLimparNaoVerificados() {
  let apagados = 0;
  try {
    const todos = await mfaFatores();
    for (const f of todos.filter((x) => x.status !== "verified")) {
      try { await _mfaReq("DELETE", `factors/${f.id}`); apagados++; } catch {}
    }
  } catch {}
  return apagados;
}

/* ---------- a decisão, tomada em TODA abertura ---------- */
const mfaEstado        = () => S.mfaGate || "livre";
const mfaPortaoPendente = () => mfaEstado() !== "livre";
const mfaModoDoPortao  = () => (mfaEstado() === "cadastro" ? "cadastro" : "desafio");
const mfaFatoresDoPortao = () => S.mfaFatores || [];
const mfaPodePular     = () => !S.mfaExigida;
function mfaRegistrarFator(f) {
  S.mfaFatores = (S.mfaFatores || []).filter((x) => x.id !== f.id).concat([{ id: f.id, nome: f.nome }]);
}
function mfaLiberar() { mfaAutorizarAbertura(); S.mfaGate = "livre"; S.mfaGateErro = null; }

/* Chamada no boot e depois de cada login. Devolve o estado a que chegou.
   A ordem das perguntas é a que ela escreveu:
     1 ler a sessão · 2 é adm? · 3 como está a confirmação · 4/5/6 decidir. */
async function mfaConferirAbertura() {
  mfaLimparEstadoAntigo();
  if (!(temJanelaReal && SUPA_URL && supaSessao()?.access)) { S.mfaGate = "livre"; return "livre"; }
  /* Caminho rápido: esta abertura JÁ confirmou. É o que faz o F5 não pedir de
     novo, e não custa nem uma ida ao servidor. */
  if (mfaAberturaAutorizada()) { S.mfaGate = "livre"; return "livre"; }

  let adm;
  try { adm = await mfaSouAdmNoServidor(); }
  catch (e) {
    /* Não deu para perguntar. Quem sabidamente não administra continua
       trabalhando; para o resto, a tela pede para tentar de novo em vez de
       abrir a porta no escuro. */
    if (mfaPapelLembrado() === false) { mfaAutorizarAbertura(); S.mfaGate = "livre"; return "livre"; }
    S.mfaGateErro = "Não foi possível confirmar sua identidade. Tente novamente.";
    S.mfaGate = "erro";
    try { console.warn("MFA · não deu para perguntar ao servidor:", String(e && e.message || e)); } catch {}
    return "erro";
  }
  mfaLembrarPapel(adm);
  if (!adm) { mfaAutorizarAbertura(); S.mfaGate = "livre"; return "livre"; }

  let verificados = [];
  try { verificados = mfaVerificados(await mfaFatores()); }
  catch (e) {
    S.mfaGateErro = "Não foi possível confirmar sua identidade. Tente novamente.";
    S.mfaGate = "erro";
    try { console.warn("MFA · não deu para listar os autenticadores:", String(e && e.message || e)); } catch {}
    return "erro";
  }
  S.mfaFatores = verificados.map((f) => ({ id: f.id, nome: f.friendly_name || "autenticador" }));
  S.mfaExigida = await mfaExigidaNoServidor();
  /* Aqui está a regra nova, em uma linha: ter o segundo fator no token NÃO
     libera. O que libera é ter confirmado NESTA abertura — e isso já foi
     perguntado lá em cima. Chegar até aqui significa que não foi. */
  S.mfaGate = verificados.length ? "codigo" : "cadastro";
  return S.mfaGate;
}
/* Apaga tudo que diz respeito a entrar — e nada do que diz respeito ao
   trabalho. Documentos, cache e configuração do PCP ficam onde estão. */
function mfaEsquecerTudo() {
  try { sessionStorage.removeItem(MFA_ABERTURA); } catch {}
  try { localStorage.removeItem(MFA_PAPEL); } catch {}
  for (const k of MFA_OBSOLETAS) { try { localStorage.removeItem(k); } catch {} }
  S.mfaGate = "livre"; S.mfaGateErro = null; S.mfaFatores = []; S.mfaExigida = false;
  S.mfa = null; S.mfaCad = null; S.mfaErro = null; S.mfaEnviando = false;
}

/* Recado legível. O GoTrue responde em inglês e com jargão; quem está na tela
   quer saber o que fazer. Traduz o que é comum e deixa passar o resto — inventar
   uma frase bonita para um erro desconhecido esconderia justamente o caso novo. */
function mfaRecado(e) {
  const m = String(e?.message || e || "");
  if (/invalid.*(totp|code)|incorrect/i.test(m)) return "Código errado. Confira o código no seu aplicativo autenticador e digite de novo.";
  if (/expire|expired/i.test(m)) return "O código expirou. Gere um novo e tente novamente.";
  if (/rate|too many/i.test(m)) return "Muitas tentativas seguidas. Espere alguns segundos e tente de novo.";
  if (/challenge/i.test(m)) return "Não foi possível confirmar o código. Gere um novo e tente novamente.";
  if (/failed to fetch|network/i.test(m)) return "Sem conexão agora. Tente de novo em instantes.";
  /* O que sobra é recado do serviço de login, em inglês e com jargão. Mostrar
     isso na tela obrigaria a pessoa a entender como o sistema foi feito para
     entender a mensagem — que é exatamente o que a regra proíbe. Fica no
     console, onde serve para quem for consertar. */
  try { console.warn("MFA · recado bruto do servidor:", m); } catch {}
  return "Não foi possível confirmar o código agora. Gere um novo e tente novamente.";
}
/* ---------- TELA DO DESAFIO · segundo fator ----------
   Mora no MESMO portão do login: mesmo fundo, mesmo cartão, mesmos tokens.
   Quem chega aqui já acertou a senha — então o tom não é de suspeita, é de
   continuação. O que a pessoa precisa saber é só: abra o aplicativo, leia os
   seis números, digite.

   O código NUNCA é guardado. Ele vive no campo, vai para a chamada e o campo é
   limpo. O protocolo do servidor (que não é o código) vive em `S.mfa`, na
   memória — recarregar a página o perde, e o certo é perder mesmo: o próximo
   pedido é feito na hora.

   REGRA DE LINGUAGEM (permanente, pedida por ela): a tela fala com quem usa o
   PCP, não com quem o escreve. `challenge`, `verify`, `aal2`, `verified`,
   `token`, `RPC` vivem no código; na tela, a pessoa lê o que precisa fazer. */
function mfaEscolhido() {
  const lista = mfaFatoresDoPortao();
  if (!lista.length) return null;
  return lista.find((f) => f.id === S.mfa?.fator) || lista[0];
}
function viewMfaDesafio() {
  const lista = mfaFatoresDoPortao();
  const atual = mfaEscolhido();
  const email = String(supaSessao()?.email || "");
  const expirado = !!(S.mfa?.expira && Date.now() > S.mfa.expira);
  /* v8.95 · o MESMO cartão da entrada (`.auth-card entrada`): marca pequena à
     esquerda, título grande, subtítulo, campos e botões com os mesmos recuos.
     Só desenho — a conferência do código, o `data-act` de cada botão e o
     "trocar de conta" estão palavra por palavra como estavam. */
  return `<div class="auth"><div class="auth-in">
    <div class="auth-card entrada">
      <div class="auth-b">
        <div class="auth-marca" role="img" aria-label="Moda Bicho Acessórios"></div>
        <h2>Confirme que é você</h2>
        <p class="auth-sub">Abra seu aplicativo autenticador e digite o código de 6 dígitos.</p>
        ${lista.length > 1 ? `<div class="mfa-fatores" role="group" aria-label="Qual autenticador usar">
          ${lista.map((f) => `<button class="chip ${f.id === atual.id ? "on" : ""}" data-act="mfa-fator" data-id="${esc(f.id)}">${esc(f.nome)}</button>`).join("")}
        </div>` : ""}
        <label class="fld"><span>Código de 6 dígitos${lista.length > 1 ? ` · ${esc(atual.nome)}` : ""}</span>
          <input class="inp mfa-cod" id="mfa-codigo" inputmode="numeric" autocomplete="one-time-code"
                 maxlength="7" placeholder="000000" aria-describedby="mfa-recado" ${S.mfaEnviando ? "disabled" : ""}></label>
        <p id="mfa-recado" class="auth-nota ${S.mfaErro ? "mfa-erro" : ""}">${
          S.mfaErro ? esc(S.mfaErro)
          : expirado ? "O código expirou. Gere um novo e tente novamente."
          : "O código muda a cada 30 segundos. Se virar enquanto você digita, use o novo."}</p>
        <button class="btn primary" data-act="mfa-conferir" ${S.mfaEnviando ? "disabled" : ""}>${S.mfaEnviando ? "Conferindo…" : "Entrar"}</button>
        <button class="btn" data-act="mfa-novo-desafio" ${S.mfaEnviando ? "disabled" : ""}>Gerar novo código</button>
        <p class="auth-nota">Entrando como <b>${esc(email)}</b> · <a href="#" data-act="sair-supa">trocar de conta</a></p>
      </div>
    </div></div>
    ${authRodape()}
  </div><div class="toasts" id="toasts"></div>`;
}
/* Pedir um desafio ao servidor. Guarda só o protocolo e a hora de vencimento. */
async function mfaPedirDesafio(fatorId) {
  const d = await mfaDesafiar(fatorId);
  S.mfa = { fator: fatorId, desafio: d.id,
    expira: d.expires_at ? Number(d.expires_at) * 1000 : Date.now() + 5 * 60 * 1000 };
  return S.mfa;
}
/* ---------- TELA DO CADASTRO DO AUTENTICADOR ----------
   Mesma casa do login: mesmo fundo, mesmo cartão, mesma paleta.

   REGRA DE LINGUAGEM (permanente): a tela fala com quem usa o PCP, não com
   quem o escreve. Se a pessoa precisa saber como o sistema foi feito para
   entender a frase, a frase está errada. `challenge`, `verify`, `enrollment`,
   `aal1`/`aal2`, `verified`, `unverified`, `token`, `RPC`, `fallback`,
   `payload` e "SQL Editor" ficam no código, nos testes e na documentação —
   nunca na tela. A bateria `linguagem-interface.js` reprova se escaparem.

   O que NUNCA sai da memória: o segredo e o QR Code. Eles vivem em `S.mfaCad`,
   que morre quando a página recarrega — e é para morrer mesmo. Guardar o
   segredo em `localStorage` seria deixar a chave debaixo do tapete: quem
   lesse o navegador teria o segundo fator inteiro, e aí o segundo fator
   deixaria de ser um segundo fator.

   Três estados, e cada um é uma tela:
     "nome"   escolher como chamar este autenticador
     "qr"     ler o QR (ou digitar a chave) e confirmar com o primeiro código
     "feito"  confirmação, com os autenticadores que existem, e o convite   */
const MFA_NOMES = ["Celular principal", "Celular de reserva", "Terceiro autenticador"];
function mfaNomeSugerido() {
  const jaTem = mfaFatoresDoPortao().length;
  return MFA_NOMES[Math.min(jaTem, MFA_NOMES.length - 1)];
}
/* A chave manual em blocos de quatro. É para ser digitada por uma pessoa
   olhando de um aparelho para o outro — bloco corrido erra. */
const mfaChaveLegivel = (s) => String(s || "").replace(/(.{4})/g, "$1 ").trim();
/* O GoTrue manda o QR pronto. Dependendo da versão vem como SVG cru ou como
   data URL; e se um dia não vier, o app desenha o mesmo `otpauth://` com o
   gerador de QR que já usa nas etiquetas. Nos três casos é o MESMO endereço
   que o servidor devolveu — o QR nunca é inventado aqui. */
function mfaQrHtml(cad) {
  const q = String(cad?.qr || "");
  if (/^data:image\//.test(q)) return `<img class="mfa-qr-img" src="${esc(q)}" alt="QR Code do autenticador">`;
  if (/^\s*<svg/i.test(q)) return `<div class="mfa-qr-img" role="img" aria-label="QR Code do autenticador">${q}</div>`;
  if (cad?.uri && typeof QR === "object" && typeof QR.svg === "function") {
    try { return `<div class="mfa-qr-img" role="img" aria-label="QR Code do autenticador">${QR.svg(cad.uri, { modulo: 4, quiet: 2 })}</div>`; } catch {}
  }
  return `<p class="auth-nota">Não foi possível mostrar o QR Code. Use a chave abaixo no seu aplicativo autenticador.</p>`;
}
function mfaCartao(inner) {
  return `<div class="auth"><div class="auth-in"><div class="auth-card">${inner}</div></div>
    ${authRodape()}
  </div><div class="toasts" id="toasts"></div>`;
}
function viewMfaCadastro() {
  const cad = S.mfaCad || {};
  const primeiro = mfaFatoresDoPortao().length === 0;
  const email = String(supaSessao()?.email || "");
  const rodape = `<p class="auth-nota">Entrando como <b>${esc(email)}</b> · <a href="#" data-act="sair-supa">trocar de conta</a></p>`;

  /* ---- confirmação: o fator entrou, e o reserva é oferecido com destaque ---- */
  if (cad.etapa === "feito") {
    const lista = mfaFatoresDoPortao();
    const varios = lista.length > 1;
    return mfaCartao(`
      <div class="auth-top">
        <div class="auth-logo" role="img" aria-label="Moda Bicho Acessórios"></div>
        <h2>${varios ? "Autenticadores cadastrados" : "Tenha um celular de reserva"}</h2>
        <p>${varios
          ? "Você tem dois autenticadores. Se perder um aparelho, entra pelo outro."
          : "Cadastre um segundo autenticador para continuar com acesso administrativo se seu celular principal for perdido, trocado ou ficar indisponível."}</p>
      </div>
      <div class="auth-b">
        <ul class="mfa-lista">${lista.map((f) => `<li><span class="mfa-ok" aria-hidden="true">✓</span> ${esc(f.nome)}</li>`).join("")}</ul>
        ${varios
          ? `<button class="btn primary" data-act="mfa-entrar-agora">Entrar no PCP</button>
             <button class="btn" data-act="mfa-cad-segundo">Cadastrar mais um</button>`
          : `<button class="btn primary" data-act="mfa-cad-segundo">Cadastrar celular de reserva</button>
             <button class="btn" data-act="mfa-entrar-agora">Fazer isso depois</button>`}
        ${rodape}
      </div>`);
  }

  /* ---- ler o QR e confirmar com o primeiro código ---- */
  if (cad.etapa === "qr") {
    return mfaCartao(`
      <div class="auth-top">
        <div class="auth-logo" role="img" aria-label="Moda Bicho Acessórios"></div>
        <h2>${esc(cad.nome || "Autenticador")}</h2>
        <p>Abra seu aplicativo autenticador, leia o QR Code e digite o código de 6 dígitos que aparecer.</p>
      </div>
      <div class="auth-b">
        <div class="mfa-qr">${mfaQrHtml(cad)}</div>
        <details class="mfa-chave"><summary>Não consigo ler o QR Code</summary>
          <p class="auth-nota">Digite esta chave no seu aplicativo autenticador.</p>
          <code class="mfa-segredo">${esc(mfaChaveLegivel(cad.segredo))}</code></details>
        <label class="fld"><span>Código de 6 dígitos</span>
          <input class="inp mfa-cod" id="mfa-codigo" inputmode="numeric" autocomplete="one-time-code"
                 maxlength="7" placeholder="000000" aria-describedby="mfa-recado" ${S.mfaEnviando ? "disabled" : ""}></label>
        <p id="mfa-recado" class="auth-nota ${S.mfaErro ? "mfa-erro" : ""}">${
          S.mfaErro ? esc(S.mfaErro)
          : "O código muda a cada 30 segundos. Se virar enquanto você digita, use o novo."}</p>
        <button class="btn primary" data-act="mfa-cad-confirmar" ${S.mfaEnviando ? "disabled" : ""}>${S.mfaEnviando ? "Conferindo…" : "Confirmar"}</button>
        <button class="btn" data-act="mfa-cad-cancelar" ${S.mfaEnviando ? "disabled" : ""}>Cancelar</button>
        ${rodape}
      </div>`);
  }

  /* ---- escolher o nome e começar ---- */
  return mfaCartao(`
    <div class="auth-top">
      <div class="auth-logo" role="img" aria-label="Moda Bicho Acessórios"></div>
      <h2>${primeiro ? "Proteja sua conta" : "Celular de reserva"}</h2>
      <p>${primeiro
        ? "Esta conta administra o sistema. Além da senha, ela precisa de um aplicativo autenticador no seu celular — Google Authenticator, Authy, o gerenciador de senhas, qualquer um."
        : "Um segundo aparelho, para o caso de perder o primeiro."}</p>
    </div>
    <div class="auth-b">
      <label class="fld"><span>Como chamar este autenticador</span>
        <input class="inp" id="mfa-nome" maxlength="40" value="${esc(cad.nome || mfaNomeSugerido())}"
               placeholder="Celular principal" ${S.mfaEnviando ? "disabled" : ""}></label>
      <p class="auth-nota ${S.mfaErro ? "mfa-erro" : ""}">${S.mfaErro ? esc(S.mfaErro)
        : "O nome é só para você distinguir os aparelhos na hora de entrar."}</p>
      <button class="btn primary" data-act="mfa-cad-comecar" ${S.mfaEnviando ? "disabled" : ""}>${S.mfaEnviando ? "Preparando…" : "Gerar QR Code"}</button>
      ${!primeiro || mfaPodePular()
        ? `<button class="btn" data-act="mfa-entrar-agora">${primeiro ? "Fazer isso depois" : "Voltar"}</button>`
        : ""}
      ${rodape}
    </div>`);
}

/* ---------- as duas telas curtas do portão ----------
   Enquanto o app pergunta ao servidor quem é a pessoa, ela vê ISTO — e não o
   PCP montado por baixo. É o que garante a regra "sessão em aal1 nunca abre o
   PCP direto": a decisão não chega atrasada, ela chega antes. */
function viewMfaConferindo() {
  return mfaCartao(`
    <div class="auth-top">
      <div class="auth-logo" role="img" aria-label="Moda Bicho Acessórios"></div>
      <h2>Um instante</h2>
      <p>Conferindo o acesso desta conta.</p>
    </div>
    <div class="auth-b"><div class="mfa-esperando" role="status" aria-live="polite"></div></div>`);
}
function viewMfaErro() {
  const email = String(supaSessao()?.email || "");
  return mfaCartao(`
    <div class="auth-top">
      <div class="auth-logo" role="img" aria-label="Moda Bicho Acessórios"></div>
      <h2>Não foi possível confirmar</h2>
      <p>${esc(S.mfaGateErro || "Não foi possível confirmar sua identidade. Tente novamente.")}</p>
    </div>
    <div class="auth-b">
      <button class="btn primary" data-act="mfa-tentar-de-novo" ${S.mfaEnviando ? "disabled" : ""}>${S.mfaEnviando ? "Conferindo…" : "Tentar novamente"}</button>
      <p class="auth-nota">Entrando como <b>${esc(email)}</b> · <a href="#" data-act="sair-supa">trocar de conta</a></p>
    </div>`);
}
