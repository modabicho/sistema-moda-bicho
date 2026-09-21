/* ===========================================================================
   src/corte/fotos.js · A FOTO DA FITA, NO STORAGE
   ---------------------------------------------------------------------------
   Cliente próprio, e de propósito. O `persFetch` do app fala `/rest/v1/` com
   JSON; o Storage é `/storage/v1/` com corpo binário. Ensinar o `persFetch` a
   fazer as duas coisas o tornaria pior nas duas — então este arquivo fica
   isolado e reusa só o que já existe: o endereço, a chave e o token da sessão.

   O QUE ELE FAZ
     foSubir(arquivo, caminho)   envia o binário
     foAssinar(caminho)          URL assinada de curta duração (bucket privado)
     foApagar(caminho)           remove o objeto
     foTrocarDaFita(id, arq)     a ORDEM da troca, que é o que importa
     foRemoverDaFita(id)         idem, no sentido inverso

   A ORDEM DA TROCA — e por que ela é assim
     1. sobe a nova
     2. grava `foto_path` e ESPERA a confirmação
     3. só então apaga a antiga
   Uma falha no passo 1 não muda nada. Uma falha no passo 2 deixa um objeto
   órfão no bucket, que é barato e o smoke conta em `soltos`. O que nunca pode
   acontecer é a fita ficar sem foto porque a antiga foi apagada cedo demais.
   Apagar primeiro seria uma linha mais curta e um jeito garantido de perder
   foto em queda de rede.

   O QUE ELE NÃO FAZ
     · não escreve em `pcp_fita` por conta própria: quem grava é `ftSalvar`,
       pela fila de sempre, com `foto_path` como qualquer outro campo;
     · não entra no snapshot do pedido. A foto pertence à FITA, não à receita
       congelada — o papel histórico guarda o que é material e textual.
   =========================================================================== */

const FO_BUCKET = "fitas";
const FO_LIMITE = 10 * 1024 * 1024;                     /* o mesmo da 150 */
const FO_TIPOS  = Object.freeze({
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
});

function foBase() {
  return (typeof PERS_URL !== "undefined" && PERS_URL) || "";
}
/* mesmas regras do `persFetch`: sem token não tenta, e cópia de teste não
   envia nada para lugar nenhum */
function foBarreira() {
  const tok = typeof persToken === "function" ? persToken() : null;
  if (!tok) return { status: "sem-login", motivo: "Entre de novo: a sessão expirou." };
  if (typeof persSoLeitura === "function" && persSoLeitura()) {
    return { status: "copia-teste", motivo: "Cópia de teste: nada é enviado ao servidor." };
  }
  return null;
}

/* ---------------------------------------------------------------------------
   O QUE PODE SUBIR · conferido AQUI, antes da rede.
   O bucket também recusa (a 150 lista os tipos e o limite), mas deixar o
   servidor dizer "não" depois de 9 MB de upload é gastar o tempo de alguém
   para descobrir o que dava para saber na hora de escolher o arquivo.
   --------------------------------------------------------------------------- */
function foConferirArquivo(a) {
  if (!a) return { status: "invalido", motivo: "Nenhum arquivo escolhido." };
  const tipo = String(a.type || "").toLowerCase();
  if (!FO_TIPOS[tipo]) {
    return { status: "tipo-nao-aceito",
      motivo: `Este formato não serve (${tipo || "desconhecido"}). Use JPG, PNG, WEBP ou PDF.` };
  }
  const n = Number(a.size) || 0;
  if (n > FO_LIMITE) {
    return { status: "grande-demais",
      motivo: `A imagem tem ${(n / 1048576).toFixed(1)} MB e o limite é 10 MB. Reduza antes de enviar.` };
  }
  if (!n) return { status: "invalido", motivo: "O arquivo está vazio." };
  return null;
}

const foExt = (tipo) => FO_TIPOS[String(tipo || "").toLowerCase()] || "bin";
function foId() {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, ""); }
  catch (e) {}
  return String(Date.now()) + Math.random().toString(16).slice(2, 10);
}
/* fita/<fita_id>/<uuid>.<ext> · catalogo/<aaaa-mm>/<uuid>.pdf */
function foCaminhoDaFita(fitaId, tipo) {
  return `fita/${String(fitaId || "sem-id")}/${foId()}.${foExt(tipo)}`;
}
function foCaminhoDeCatalogo(tipo) {
  const d = new Date();
  const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `catalogo/${mes}/${foId()}.${foExt(tipo)}`;
}

/* ---------------------------------------------------------------------------
   SUBIR · POST do binário cru. Sem `x-upsert`: cada foto tem caminho novo, e
   sobrescrever por acidente seria apagar a foto de outra fita.
   --------------------------------------------------------------------------- */
async function foSubir(arquivo, caminho) {
  const ruim = foConferirArquivo(arquivo);
  if (ruim) return ruim;
  const barrado = foBarreira();
  if (barrado) return barrado;

  const alvo = caminho || foCaminhoDaFita("solta", arquivo.type);
  let r;
  try {
    r = await fetch(`${foBase()}/storage/v1/object/${FO_BUCKET}/${alvo}`, {
      method: "POST",
      headers: {
        apikey: typeof PERS_KEY !== "undefined" ? PERS_KEY : "",
        Authorization: "Bearer " + persToken(),
        "Content-Type": arquivo.type,
        "Cache-Control": "3600",
      },
      body: arquivo,
    });
  } catch (e) {
    /* rede caiu no meio: NÃO é recusa do servidor, e a diferença importa —
       aqui a ação pode ser repetida tal como está */
    return { status: "offline", motivo: "Sem conexão agora. O envio não começou ou não terminou; tente de novo.",
             erro: String((e && e.message) || e) };
  }

  if (r.status === 401 || r.status === 403) {
    /* uma tentativa de renovar, como o `persFetch` faz */
    if (typeof supaRenovar === "function" && await supaRenovar()) return foSubir(arquivo, alvo);
    return { status: "sem-permissao", motivo: "O servidor recusou o envio. Confira se você ainda está conectada." };
  }
  if (r.status === 413) return { status: "grande-demais", motivo: "O servidor recusou: arquivo maior que o limite do bucket." };
  if (!r.ok) {
    let msg = "";
    try { msg = (await r.json())?.message || ""; } catch (e) {}
    return { status: "erro", motivo: msg || `O envio falhou (${r.status}).`, cod: r.status };
  }

  /* upload incompleto: o servidor respondeu ok, mas o objeto não está lá.
     Conferir custa uma chamada e evita gravar um `foto_path` que aponta para
     o nada — que é justamente o `orfaos` do smoke. */
  const existe = await foExiste(alvo);
  if (!existe) {
    return { status: "incompleto", caminho: alvo,
             motivo: "O envio terminou mas a imagem não chegou inteira. Tente de novo." };
  }
  return { status: "ok", caminho: alvo, tipo: arquivo.type, bytes: Number(arquivo.size) || 0 };
}

/* existe mesmo? uma chamada barata e de leitura */
async function foExiste(caminho) {
  try {
    const r = await fetch(`${foBase()}/storage/v1/object/info/${FO_BUCKET}/${caminho}`, {
      headers: { apikey: typeof PERS_KEY !== "undefined" ? PERS_KEY : "",
                 Authorization: "Bearer " + persToken() },
    });
    return r.ok;
  } catch (e) { return false; }
}

/* ---------------------------------------------------------------------------
   ASSINAR · o bucket é privado, então a tela nunca tem uma URL permanente.
   A URL vale pouco tempo de propósito: uma que vazasse não serviria amanhã.
   --------------------------------------------------------------------------- */
const FO_ASSINADAS = new Map();                 /* caminho → { url, ate } */
async function foAssinar(caminho, segundos) {
  if (!caminho) return { status: "invalido", motivo: "sem caminho" };
  const agora = Date.now();
  const guardada = FO_ASSINADAS.get(caminho);
  /* 20s de folga: URL que expira enquanto a imagem carrega é imagem quebrada */
  if (guardada && guardada.ate - 20000 > agora) return { status: "ok", url: guardada.url, doCache: true };

  const barrado = foBarreira();
  if (barrado && barrado.status === "sem-login") return barrado;

  const dura = Number(segundos) || 600;
  let r;
  try {
    r = await fetch(`${foBase()}/storage/v1/object/sign/${FO_BUCKET}/${caminho}`, {
      method: "POST",
      headers: { apikey: typeof PERS_KEY !== "undefined" ? PERS_KEY : "",
                 Authorization: "Bearer " + persToken(), "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: dura }),
    });
  } catch (e) {
    return { status: "offline", motivo: "Não consegui carregar a imagem agora." };
  }
  if (!r.ok) {
    return { status: r.status === 404 ? "sumiu" : "erro",
             motivo: r.status === 404 ? "A imagem não está mais no servidor." : "Não consegui abrir a imagem." };
  }
  let corpo = null;
  try { corpo = await r.json(); } catch (e) {}
  const rel = corpo && (corpo.signedURL || corpo.signedUrl);
  if (!rel) return { status: "erro", motivo: "O servidor não devolveu o endereço da imagem." };

  const url = `${foBase()}/storage/v1${rel.startsWith("/") ? "" : "/"}${rel}`;
  FO_ASSINADAS.set(caminho, { url, ate: agora + dura * 1000 });
  return { status: "ok", url };
}
function foEsquecerUrl(caminho) {
  if (caminho) FO_ASSINADAS.delete(caminho); else FO_ASSINADAS.clear();
}

/* ---------------------------------------------------------------------------
   APAGAR · só é chamado DEPOIS que `foto_path` já mudou. Falhar aqui é
   inofensivo: sobra um objeto solto, e o smoke sabe contá-lo.
   --------------------------------------------------------------------------- */
async function foApagar(caminho) {
  if (!caminho) return { status: "ok", nada: true };
  const barrado = foBarreira();
  if (barrado) return barrado;
  foEsquecerUrl(caminho);
  try {
    const r = await fetch(`${foBase()}/storage/v1/object/${FO_BUCKET}/${caminho}`, {
      method: "DELETE",
      headers: { apikey: typeof PERS_KEY !== "undefined" ? PERS_KEY : "",
                 Authorization: "Bearer " + persToken() },
    });
    if (r.ok || r.status === 404) return { status: "ok" };
    return { status: "erro", motivo: `Não consegui apagar a imagem antiga (${r.status}).`, cod: r.status };
  } catch (e) {
    return { status: "offline", motivo: "Não consegui apagar a imagem antiga agora." };
  }
}

/* ===========================================================================
   A TROCA DE FOTO DE UMA FITA · a ordem inteira, num lugar só
   =========================================================================== */
async function foTrocarDaFita(fitaId, arquivo) {
  const fita = typeof ftAchar === "function" ? ftAchar(fitaId) : null;
  if (!fita) return { status: "invalido", motivo: "Fita não encontrada." };

  const ruim = foConferirArquivo(arquivo);
  if (ruim) return ruim;

  const antiga = fita.fotoPath || null;

  /* 1 · sobe a nova */
  const subiu = await foSubir(arquivo, foCaminhoDaFita(fita.id, arquivo.type));
  if (subiu.status !== "ok") return subiu;

  /* 2 · grava o caminho e ESPERA. `fotoPath` entra como campo mexido à mão:
     a importação futura não pode trocar a foto que alguém escolheu. */
  const gravou = await ftSalvar(Object.assign({}, fita, { fotoPath: subiu.caminho }), ["fotoPath"]);
  if (gravou.status !== "ok" && gravou.status !== "na-fila") {
    /* não gravou: a fita continua com a foto ANTIGA, que ainda está lá. A nova
       fica solta no bucket — sobra barata, e o smoke a conta em `soltos`. */
    return { status: gravou.status, motivo: gravou.motivo
      || "A imagem subiu, mas o cadastro não confirmou. A foto anterior continua valendo.",
      caminhoSolto: subiu.caminho };
  }

  /* 3 · só agora a antiga sai. Se falhar, ninguém fica sem foto. */
  let sobrou = null;
  if (antiga && antiga !== subiu.caminho) {
    const fora = await foApagar(antiga);
    if (fora.status !== "ok") sobrou = antiga;
  }
  return { status: gravou.status, caminho: subiu.caminho, antigaSobrou: sobrou };
}

async function foRemoverDaFita(fitaId) {
  const fita = typeof ftAchar === "function" ? ftAchar(fitaId) : null;
  if (!fita) return { status: "invalido", motivo: "Fita não encontrada." };
  const antiga = fita.fotoPath || null;
  if (!antiga) return { status: "ok", nada: true };

  /* mesma ordem, no sentido inverso: primeiro o cadastro deixa de apontar,
     depois o objeto sai. Apagar antes deixaria a ficha apontando para o nada
     se a gravação falhasse. */
  const gravou = await ftSalvar(Object.assign({}, fita, { fotoPath: null }), ["fotoPath"]);
  if (gravou.status !== "ok" && gravou.status !== "na-fila") {
    return { status: gravou.status, motivo: gravou.motivo || "Não consegui tirar a foto do cadastro." };
  }
  const fora = await foApagar(antiga);
  return { status: gravou.status, objetoSobrou: fora.status === "ok" ? null : antiga };
}

/* o catálogo de origem, guardado como veio (PDF inclusive). Ele não é a foto
   de nenhuma fita: fica no bucket como prova do que foi importado. */
async function foGuardarCatalogo(arquivo) {
  const ruim = foConferirArquivo(arquivo);
  if (ruim) return ruim;
  return foSubir(arquivo, foCaminhoDeCatalogo(arquivo.type));
}
