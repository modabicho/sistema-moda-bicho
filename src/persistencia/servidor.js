/* ===========================================================================
   src/persistencia/servidor.js · A ÚNICA PORTA PARA O SUPABASE
   ---------------------------------------------------------------------------
   Item 2 da fase E. Hoje existem chamadas a `fetch` espalhadas por dez
   arquivos; cada uma trata (ou não trata) erro do seu jeito. Daqui em diante
   TODA conversa com o servidor passa por aqui.

   Três coisas moram neste arquivo e em nenhum outro:
     1. a resposta é sempre {ok, status, corpo, erro} — nunca uma exceção solta
        que engole a mensagem do PostgREST (foi assim que o smoke perdeu um
        `permission denied` atrás de um erro de JavaScript);
     2. o portão da CÓPIA DE TESTE: fora do site publicado, ler pode, escrever
        não sai daqui — a mesma regra que já vale em dados/persistencia.js;
     3. a renovação do token, uma vez só, sem laço.
   =========================================================================== */

const PERS_URL = (typeof SUPA_URL !== "undefined" && SUPA_URL) || "https://tofhsyyhbdwidodvizgm.supabase.co";
const PERS_KEY = (typeof SUPA_KEY !== "undefined" && SUPA_KEY) || "";

/* A cópia de teste é decidida pelo endereço, nunca por uma opção — opção
   alguém esquece de ligar. Reaproveita a decisão que já existe no app. */
function persSoLeitura() { return (typeof MODO_TESTE !== "undefined" ? !!MODO_TESTE : false); }

function persToken() {
  try { return (typeof supaSessao === "function" ? supaSessao() : null)?.access || null; }
  catch { return null; }
}

/* Classifica a resposta ANTES de tocar no corpo. É a mesma lição do smoke:
   quando o PostgREST recusa, o corpo é um OBJETO {code,message,details,hint},
   não um array — e chamar `.slice`/`.find` nele troca o erro do servidor por
   um erro de JavaScript. */
function persClassificar(status, corpo) {
  const arr = Array.isArray(corpo);
  const cod = (!arr && corpo && typeof corpo === "object" && corpo.code != null) ? String(corpo.code) : null;
  const msg = (!arr && corpo && typeof corpo === "object" && (corpo.message || corpo.msg || corpo.hint)) || null;
  if (status >= 200 && status < 300) return { tipo: "ok" };
  if (cod === "42P01" || cod === "PGRST205" || status === 404) return { tipo: "ausente", cod, msg };
  if (cod === "42501" || status === 401 || status === 403) return { tipo: "proibido", cod, msg };
  if (status === 0) return { tipo: "offline", cod, msg: "sem rede" };
  if (status >= 500) return { tipo: "servidor-fora", cod, msg };
  return { tipo: "recusado", cod, msg };
}

async function persFetch(metodo, caminho, corpo, prefer, jaTentou) {
  const tok = persToken();
  if (!tok) return { ok: false, status: 401, corpo: null, erro: { tipo: "sem-login", msg: "sem sessão no servidor" } };

  if (persSoLeitura() && metodo !== "GET") {
    /* Não mente dizendo que gravou: quem está na cópia de teste precisa saber
       que o servidor não recebeu nada. */
    return { ok: false, status: 200, corpo: null,
      erro: { tipo: "copia-teste", msg: "cópia de teste: nada é enviado ao servidor" } };
  }

  let r;
  try {
    r = await fetch(`${PERS_URL}/rest/v1/${caminho}`, {
      method: metodo,
      headers: {
        apikey: PERS_KEY, Authorization: "Bearer " + tok,
        "Content-Type": "application/json",
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: corpo != null ? JSON.stringify(corpo) : undefined,
    });
  } catch (e) {
    /* rede caiu, aba offline, DNS. Não é recusa do servidor — é ausência dele,
       e a outbox trata os dois de formas diferentes. */
    return { ok: false, status: 0, corpo: null,
      erro: { tipo: "offline", msg: String((e && e.message) || e) } };
  }

  let j = null;
  try { j = await r.json(); } catch { j = null; }

  if ((r.status === 401 || r.status === 403) && !jaTentou
      && typeof supaRenovar === "function" && await supaRenovar()) {
    return persFetch(metodo, caminho, corpo, prefer, true);
  }
  const cls = persClassificar(r.status, j);
  return { ok: cls.tipo === "ok", status: r.status, corpo: j,
           erro: cls.tipo === "ok" ? null : cls };
}

/* Estas três são DECLARAÇÕES de função, não `const` com arrow, e isso é de
   propósito: o app é montado como um arquivo só, e num script `const` no topo
   fica no escopo léxico — não vira propriedade de `window`. A bateria que roda
   dentro do navegador precisa alcançá-las, e quem escrever a próxima aba
   também. Foi a bateria que apontou. */

/* Uma RPC. O corpo de resposta é o que a função devolveu — jsonb, escalar ou
   lista. Nunca desembrulha sozinho: cada chamador sabe o que espera. */
function persRpc(nome, args) { return persFetch("POST", "rpc/" + nome, args || {}); }

/* Uma leitura. `caminho` já vem no dialeto do PostgREST. */
function persLer(caminho) { return persFetch("GET", caminho); }

/* Tratar um corpo como lista sem nunca explodir. `x || []` não serve — o
   objeto de erro do PostgREST passa por ele e quebra no `.find`. */
function persLista(x) { return Array.isArray(x) ? x : []; }
