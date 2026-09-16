/* ---------- gravação condicional: o conflito passa a ser IMPEDIDO ----------
   Até aqui o app gravava por cima e só DEPOIS perguntava se alguém tinha
   gravado antes — dava para dizer "houve conflito", não para evitá-lo. O
   trabalho da outra pessoa já tinha ido embora.

   Agora cada documento carrega a marca de tempo que ele tinha no servidor
   quando esta tela o leu (`_versaoDoc`). Na hora de gravar, a troca da
   chave-mestra é condicional: só entra se a marca no servidor ainda for a
   mesma. Se outra pessoa gravou no meio, o servidor não altera nada, o app
   percebe pela resposta vazia e NADA é sobrescrito.

   Vale lembrar o que isto não é: não é trava por registro. Duas pessoas
   mexendo em pedidos diferentes do mesmo documento ainda colidem — a
   diferença é que agora a colisão é detida e resolvida por fusão, em vez de
   um apagar o outro em silêncio. */
const _versaoDoc = new Map();
const _mem = {};
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function _getEm(camada, k) {
  if (camada === "supabase") {
    const r = await _supaReq("GET", `docs?chave=eq.${encodeURIComponent(k)}&select=valor,atualizado`);
    const j = await r.json();
    if (Array.isArray(j) && j[0]) { _versaoDoc.set(k, j[0].atualizado ?? null); return j[0].valor; }
    _versaoDoc.delete(k);
    return null;
  }
  if (camada === "compartilhado" || camada === "pessoal") {
    const r = await window.storage.get(k, camada === "compartilhado");
    return r && r.value != null ? r.value : null;
  }
  if (camada === "local") return window.localStorage.getItem(k);
  return _mem[k] ?? null;
}
async function _setEm(camada, k, str, condicional) {
  if (camada === "supabase") {
    const agora = new Date().toISOString();
    /* `condicional` só é usado na chave-mestra dos documentos do app: os
       pedaços podem ser gravados à vontade (nascem numa geração nova e não
       tocam na antiga), e carimbo e presença são last-write-wins de propósito. */
    if (condicional) {
      /* `condicional.esperado` vem de quando esta tela leu o documento. Usar o
         valor de agora não protegeria nada: entre ler e gravar passam
         milissegundos, e o buraco de verdade são os minutos em que a tela ficou
         aberta enquanto outra pessoa trabalhava. */
      const esperado = condicional.esperado;
      if (esperado !== undefined) {
        const filtro = esperado == null ? "atualizado=is.null" : `atualizado=eq.${encodeURIComponent(esperado)}`;
        const r = await _supaReq("PATCH", `docs?chave=eq.${encodeURIComponent(k)}&${filtro}`,
          { valor: str, atualizado: agora }, 0, "return=representation");
        const j = await r.json().catch(() => null);
        if (!Array.isArray(j) || !j.length) {
          const err = new Error("conflito: o documento mudou no servidor desde que esta tela o leu");
          err.conflito = k;
          throw err;
        }
        _versaoDoc.set(k, j[0].atualizado ?? agora);
        return;
      }
    }
    await _supaReq("POST", "docs", [{ chave: k, valor: str, atualizado: agora }]);
    _versaoDoc.set(k, agora);
    return;
  }
  if (camada === "compartilhado" || camada === "pessoal") {
    const r = await window.storage.set(k, str, camada === "compartilhado");
    if (!r) throw new Error("set vazio");
    return;
  }
  if (camada === "local") { window.localStorage.setItem(k, str); return; }
  _mem[k] = str;
}
async function _delEm(camada, k) {
  if (camada === "supabase") { await _supaReq("DELETE", `docs?chave=eq.${encodeURIComponent(k)}`); return; }
  if (camada === "compartilhado" || camada === "pessoal") { await window.storage.delete(k, camada === "compartilhado"); return; }
  if (camada === "local") { window.localStorage.removeItem(k); return; }
  delete _mem[k];
}
/* ==========================================================================
   O QUE FICOU SÓ NESTE COMPUTADOR
   Quando o servidor recusa, `setSeguro` re-sonda a camada, acha o navegador,
   grava lá e devolve sucesso. Isso é bom — ninguém perde trabalho. O que
   faltava era o app SABER o que ficou para trás, e três coisas quebravam por
   causa disso:

     · nada reenviava sozinho quando o servidor voltava;
     · ninguém sabia QUAIS seções estavam só aqui;
     · e no recarregamento seguinte a leitura pegava o servidor primeiro,
       trocando o local mais novo pelo remoto mais VELHO — a alteração feita
       durante a queda simplesmente sumia.

   A lista mora no localStorage de propósito: ela precisa sobreviver ao
   recarregamento, que é justamente quando o dado se perdia.
   ========================================================================== */
const SO_LOCAL = NS + ":soLocal";
const podeServidor = () => temJanelaReal && !MODO_TESTE && !!SUPA_URL && !!supaSessao()?.access;
function lerSoLocal() { try { return new Set(JSON.parse(localStorage.getItem(SO_LOCAL) || "[]")); } catch { return new Set(); } }
function _gravarSoLocal(s) {
  try { s.size ? localStorage.setItem(SO_LOCAL, JSON.stringify([...s])) : localStorage.removeItem(SO_LOCAL); } catch {}
  try { S.soLocal = [...s]; } catch {}
}
const secoesSoLocais = () => [...lerSoLocal()];
function marcarSoLocal(sec) { const s = lerSoLocal(); if (!s.has(sec)) { s.add(sec); _gravarSoLocal(s); } }
function limparSoLocal(sec) { const s = lerSoLocal(); if (s.delete(sec)) _gravarSoLocal(s); }
/* a chave do documento leva de volta à seção, para a leitura saber onde olhar primeiro */
const _secaoDaChave = (k) => Object.keys(DOCS).find((s) => DOCS[s] === String(k).split(".")[0]) || null;

/* ---------- cair do servidor é notícia ----------
   Quando uma gravação falha, `setSeguro` re-sonda a camada. Se o servidor está
   fora, esta função encontra o localStorage, grava lá e devolve sucesso — e é
   por isso que o app dizia "Salvo" com o servidor recusando. O dado não se
   perde (essa parte está certa), mas ele passa a existir SÓ NAQUELE COMPUTADOR,
   e ninguém era avisado: a única pista ficava dentro da janela de status.
   Duas pessoas trabalhando assim divergem sem saber.
   Agora a queda vira estado, e o estado vira aviso crítico no topo. */
async function sondarCamada() {
  const antes = CAMADA;
  const candidatas = [];
  if (temJanelaReal && !MODO_TESTE && supaSessao()?.access) candidatas.push("supabase");
  if (temStorage) candidatas.push("compartilhado", "pessoal");
  candidatas.push("local");
  for (const c of candidatas) {
    try {
      const k = NS + ":ping";
      await _setEm(c, k, "1");
      const v = await _getEm(c, k);
      try { await _delEm(c, k); } catch {}
      if (v === "1") { CAMADA = c; anotarQueda(antes, c); return c; }
    } catch {}
  }
  CAMADA = "memoria";
  anotarQueda(antes, CAMADA);
  return CAMADA;
}
function anotarQueda(antes, agora) {
  try {
    if (antes === "supabase" && agora !== "supabase") {
      S.servidorCaiu = { em: new Date().toISOString(), onde: agora };
    }
    /* Voltar a ALCANÇAR o servidor não é o mesmo que ter GRAVADO nele. Antes o
       aviso sumia aqui, no ping — e a pessoa via a tela limpa com a alteração
       ainda parada no navegador. Quem apaga o aviso é a gravação confirmada,
       em `gravarSecaoSemAtropelar`, quando a última seção sobe. */
  } catch {}
}
/* leitura procura na camada ativa e, se não achar, nas outras (dados antigos podem estar lá) */
async function getBruto(k) {
  /* Na cópia de teste a ordem se inverte: o que ela mexeu aqui vale mais que o
     que está no servidor — senão a edição dela some no próximo carregamento.
     O servidor entra no fim, só para a primeira abertura ter dados de verdade. */
  /* Seção que ficou só aqui durante uma queda do servidor: o navegador vem
     PRIMEIRO. Sem isto, o recarregamento seguinte lia o servidor (mais velho) e
     jogava fora o que ela fez enquanto o servidor estava fora. */
  const soAqui = _secaoDaChave(k) && lerSoLocal().has(_secaoDaChave(k));
  const ordem = (soAqui
    ? ["local", "compartilhado", "pessoal", CAMADA, "supabase"]
    : [CAMADA, "compartilhado", "pessoal", "local",
      ...(MODO_TESTE && supaSessao()?.access ? ["supabase"] : [])])
    .filter((c, i, a) => c && a.indexOf(c) === i);
  for (const c of ordem) {
    if ((c === "compartilhado" || c === "pessoal") && !temStorage) continue;
    try { const v = await _getEm(c, k); if (v != null) return v; } catch {}
  }
  return null;
}
async function setBruto(k, str, condicional) { await _setEm(CAMADA || "memoria", k, str, condicional); }
async function setSeguro(k, str, condicional) {
  for (let tent = 0; ; tent++) {
    try { await setBruto(k, str, condicional); return; }
    catch (e) {
      /* conflito não é falha de rede: repetir só grava por cima mais rápido */
      if (e && e.conflito) throw e;
      if (tent === 1) { const nova = await sondarCamada(); if (nova === "memoria") throw e; }
      else if (tent >= 3) throw e;
      await espera(350 * (tent + 1));
    }
  }
}
async function del(k) {
  const ordem = [CAMADA, "compartilhado", "pessoal", "local"].filter((c, i, a) => c && a.indexOf(c) === i);
  let ok = false;
  for (const c of ordem) {
    if ((c === "compartilhado" || c === "pessoal") && !temStorage) continue;
    try { await _delEm(c, k); ok = true; } catch {}
  }
  return ok;
}

/* documento fatiado com DUAS GERAÇÕES: a nova é escrita sem tocar na antiga,
   a chave-mestre troca por último (atômica) e só então a velha é apagada.
   Se faltar espaço no meio, a geração antiga segue válida — nada corrompe.
   Mestre: JSON direto (couber) · "__P{n}" legado (k.0..) · "__P{n}g{g}:{len}" novo (k.{g}.{i}) */
function _lerMestre(s) {
  if (typeof s !== "string" || !s.startsWith("__P")) return null;
  const m = s.match(/^__P(\d+)(?:g(\d))?(?::(\d+))?$/);
  if (!m) return null;
  return { n: +m[1] || 0, g: m[2] != null ? +m[2] : null, len: m[3] != null ? +m[3] : null };
}
async function gravarDoc(k, obj, condicional) {
  const s = JSON.stringify(obj);
  /* ANTES de qualquer leitura própria: a marca que este documento tinha quando
     a tela o carregou. A leitura logo abaixo atualiza `_versaoDoc`, e se a
     condição saísse dali a gravação passaria sempre. */
  const trava = condicional ? { esperado: _versaoDoc.get(k) } : null;
  const mestreAntes = _lerMestre(await getBruto(k));
  const gVelha = mestreAntes?.g ?? null;
  const nVelho = mestreAntes?.n || 0;
  if (s.length <= LIMITE_PEDACO) {
    await setSeguro(k, s, trava); /* atômico: ou grava inteiro ou lança */
  } else {
    const g = gVelha === 0 ? 1 : 0;
    const n = Math.ceil(s.length / LIMITE_PEDACO);
    /* Pedaços gravados de uma vez — antes iam um a um, e salvar o núcleo levava
       16 idas em fila. O índice continua sendo escrito DEPOIS de todos, então a
       troca segue atômica: se algo falhar no meio, o índice antigo permanece e
       nada é corrompido. */
    await emParalelo(Array.from({ length: n }, (_, i) => i),
      (i) => setSeguro(`${k}.${g}.${i}`, s.slice(i * LIMITE_PEDACO, (i + 1) * LIMITE_PEDACO)));
    await setSeguro(k, `__P${n}g${g}:${s.length}`, trava); /* troca atômica — e condicional */
  }
  /* limpeza da geração anterior e do formato legado — falha aqui não corrompe nada */
  try {
    if (gVelha != null) await emParalelo(Array.from({ length: nVelho }, (_, i) => i), (i) => del(`${k}.${gVelha}.${i}`));
    else for (let i = 0; i < nVelho; i++) await del(`${k}.${i}`);
  } catch {}
}
/* Busca em paralelo, mas no máximo 8 ao mesmo tempo: sem limite, um documento
   grande dispara 40 conexões de uma vez e o navegador (ou o servidor) enfileira
   do mesmo jeito, às vezes com erro. Oito é o que os navegadores mantêm por
   domínio sem penalizar. */
async function emParalelo(itens, fn, limite = 8) {
  const res = new Array(itens.length);
  let i = 0;
  const trab = Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (i < itens.length) { const meu = i++; res[meu] = await fn(itens[meu], meu); }
  });
  await Promise.all(trab);
  return res;
}

async function lerDoc(k) {
  const s = await getBruto(k);
  if (s == null) return null;
  const m = _lerMestre(s);
  if (m) {
    /* Os pedaços eram buscados um de cada vez, cada um esperando o anterior.
       O núcleo sozinho tem 16 pedaços; com os outros documentos passavam de 40
       idas ao servidor em fila — a 80ms de latência, mais de 3 segundos só de
       espera. Buscados de uma vez, o custo passa a ser o da ida mais lenta. */
    const chaves = Array.from({ length: m.n }, (_, i) => (m.g != null ? `${k}.${m.g}.${i}` : `${k}.${i}`));
    const partes = await emParalelo(chaves, (c) => getBruto(c));
    if (partes.some((p) => p == null)) return null;
    const todo = partes.join("");
    if (m.len != null && todo.length !== m.len) return null; /* pedaço trocado/faltando */
    try { return JSON.parse(todo); } catch { return null; }
  }
  try { return JSON.parse(s); } catch { return null; }
}
async function apagarDoc(k) {
  const m = _lerMestre(await getBruto(k));
  const n = Math.max(m?.n || 0, 12);
  for (let i = 0; i < n; i++) { await del(`${k}.${i}`); await del(`${k}.0.${i}`); await del(`${k}.1.${i}`); }
  await del(k);
}

/* compat: get antigo (valores gravados como JSON simples nas chaves legadas) */
async function get(k, fb) {
  const s = await getBruto(k);
  if (s == null) return fb;
  try { return JSON.parse(s); } catch { return fb; }
}

/* ---------- fusão por registro ----------
   Quando o servidor recusa a gravação porque outra pessoa gravou antes, a
   pergunta é: dá para juntar os dois sem perder nada? Dá, para as listas cujos
   registros têm id e data de alteração: cada lado fica com o registro mais
   novo, e o que só existe de um lado entra inteiro.

   O que NÃO se funde: `cfg`, `cad`, `estoque` e `produtos` — são objetos ou
   listas sem carimbo por registro, e "adivinhar" ali seria inventar dado. Nesses
   casos o app para e pergunta, em vez de escolher sozinho. */
const CHAVE_TEMPO = ["atualizadoEm", "atualizadaEm", "em", "criadoEm"];
const _quando = (x) => { for (const k of CHAVE_TEMPO) if (x && x[k]) return String(x[k]); return ""; };
function fundirListas(minha, doServidor) {
  const meus = Array.isArray(minha) ? minha : [];
  const deles = Array.isArray(doServidor) ? doServidor : [];
  const saida = new Map();
  deles.forEach((x) => { if (x && x.id != null) saida.set(x.id, x); });
  let ganhei = 0, perdi = 0, novos = 0;
  meus.forEach((x) => {
    if (!x || x.id == null) return;
    const outro = saida.get(x.id);
    if (!outro) { saida.set(x.id, x); novos++; return; }
    if (JSON.stringify(outro) === JSON.stringify(x)) return;
    /* empate ou registro sem carimbo: fica o do servidor. Entre sobrescrever o
       trabalho de alguém e perder o meu, o certo é não sobrescrever — o meu
       ainda está na minha tela para eu refazer. */
    if (_quando(x) > _quando(outro)) { saida.set(x.id, x); ganhei++; } else perdi++;
  });
  /* quem só existe do meu lado e não tem id fica de fora — sem id não há como
     saber se é o mesmo registro; melhor manter o do servidor */
  return { lista: [...saida.values()], ganhei, perdi, novos };
}
/* `SECAO_FUNDIVEL` saiu: a estratégia agora é obrigatória e vive em `SECOES`. */
/* ===========================================================================
   v8.30 · O REGISTRO DE ESTRATÉGIA · toda seção tem regra, nenhuma fica de fora
   ---------------------------------------------------------------------------
   Até aqui a fusão era uma LISTA DE EXCEÇÕES: quem estivesse declarado fundia,
   quem não estivesse caía na janela "Outra pessoa gravou primeiro · Recarregar
   ou Gravar a minha por cima". Foi assim com `eventos`, depois com `produtos`,
   e seria assim com a próxima seção que nascesse. O conserto não é declarar
   mais uma: é inverter a regra.

   Aqui está a estratégia de TODAS as seções de `DOCS`. A bateria falha se
   alguma seção ficar de fora — não dá mais para esquecer.

   AS CHAVES FORAM MEDIDAS NO APP, não supostas. `cad` não tem uma chave só:
   cada sublista tem a sua, e `bonus` não tem chave única nenhuma — por isso
   ela é identificada pelo par (processo, alvo), que é o que a tela edita.
   =========================================================================== */
const EVENTOS_MAX = 3000;

const SECOES = {
  /* pedidos e necessidades — quatro listas de registros com id */
  /* `ops` é DERIVADA: `recalcularOP` a recalcula a partir dos pedidos. Fundir
     campo a campo uma coisa que é conta daria conflito onde não há decisão
     nenhuma para tomar — o certo é juntar o que é fonte (pedidos, análises,
     faltas) e REFAZER a conta depois. */
  nucleo:   { forma: "registros", listas: { pedidos: "id", analises: "id", faltas: "id" },
              derivadas: { ops: "id" } },
  /* trilha de auditoria: nasce e nunca é editada */
  eventos:  { forma: "log",       chave: "id" },
  /* fotografias de estoque+vendas: uma por dia, reimportar corrige */
  hist:     { forma: "serie",     chave: "dia" },
  insumos:  { forma: "registros", listas: { insumos: "id", movs: "id", entradas: "id",
                                            posse: "id", bens: "id", posseItens: "id" } },
  semi:     { forma: "registros", listas: { tipos: "id", remessas: "id", ajustes: "id" } },
  /* a seção É a lista */
  produtos: { forma: "registros", raiz: "id" },
  equipe:   { forma: "registros", raiz: "id" },
  festivas: { forma: "registros", listas: { campanhas: "id" } },
  /* cadastros: CADA sublista tem a sua chave, medida uma a uma */
  /* TODAS as chaves de `S.cad` precisam de estratégia. As dez que faltavam eram
     gravadas (o `dumpSecao` leva a seção inteira) e NUNCA fundidas: como o
     resultado da fusão nasce de `Object.assign({}, doServidor)`, a versão local
     delas era descartada em silêncio em toda gravação concorrente. Perdia-se o
     histórico de fechamento, a receita que a pessoa acabou de montar, a fila de
     troca de SKU, o mínimo por prestadora. */
  cad:      { forma: "registros",
              listas: {
                prestadoras:   "nome",                 /* não têm id; o nome é a identidade */
                estruturas:    "processo",             /* uma estrutura por processo */
                setores:       "id",
                fornecedores:  "id",
                mesesFechados: "mes",                  /* mesFechado() procura por `mes` */
                bonus:         ["processo", "alvo"],   /* sem chave única: par */
                receitas:      "processo",             /* a receita mora no processo */
                pendentesSku:  "skuNovo",              /* fila de decisão de troca de SKU */
                historicoFechamentos: ["mes", "acao", "em"] },  /* trilha: nasce e não muda */
              /* objetos chaveados: união por chave, sem perder chave de ninguém */
              mapas: {
                valorPed:          "valor",   /* numero → {produzido,total}; empate: o meu */
                minPrest:          "fundo",   /* nome → {bemId: n}; funde o nível de baixo */
                procsPrestadora:   "lista",   /* nome → [processos]; união dos dois */
                prestNomesAntigos: "lista" }, /* id → [nomes antigos]; união dos dois */
              /* listas de escalares, sem id e sem campo: união ordenada */
              conjuntos: ["qtdsEmbalagem", "tamanhosEmbalagem"],
              /* objeto único com carimbo: o mais recente vence inteiro */
              fotos: { retratoPlanilha: "em" } },
  /* uma importação inteira; a mais recente manda */
  estoque:  { forma: "foto",      chave: "importadoEm" },
  /* objeto de opções: funde POR OPÇÃO */
  cfg:      { forma: "opcoes" },
};

/* as seções de `DOCS` que ficaram sem estratégia — a bateria exige lista vazia */
function secoesSemEstrategia() {
  return Object.keys(DOCS).filter((s) => !SECOES[s]);
}

/* ---------- as ferramentas de fusão, uma por forma ---------- */
const CHAVE_TEMPO_REG = ["atualizadoEm", "atualizadaEm", "em", "criadoEm", "importadoEm"];
const _quandoReg = (x) => { for (const k of CHAVE_TEMPO_REG) if (x && x[k]) return String(x[k]); return ""; };
const _chaveDe = (x, chave) => Array.isArray(chave)
  ? chave.map((k) => String(x && x[k] != null ? x[k] : "")).join("\u0000")
  : String(x && x[chave] != null ? x[chave] : "");

/* registros: união pela chave. Mesma chave com conteúdo diferente resolve pelo
   carimbo quando existe; sem carimbo, NÃO se escolhe — vira conflito nomeado. */
function fundirRegistros(meus, deles, chave) {
  const a = Array.isArray(meus) ? meus : [];
  const b = Array.isArray(deles) ? deles : [];
  const porChave = new Map();
  const conflitos = []; let novos = 0, ganhei = 0, perdi = 0, semChave = 0;
  for (const x of b) { const k = _chaveDe(x, chave); if (!k) { semChave++; continue; } porChave.set(k, x); }
  for (const x of a) {
    const k = _chaveDe(x, chave);
    if (!k) { semChave++; continue; }
    const outro = porChave.get(k);
    if (!outro) { porChave.set(k, x); novos++; continue; }
    if (JSON.stringify(outro) === JSON.stringify(x)) continue;
    const meuQuando = _quandoReg(x), deleQuando = _quandoReg(outro);
    if (meuQuando && deleQuando && meuQuando !== deleQuando) {
      if (meuQuando > deleQuando) { porChave.set(k, x); ganhei++; } else perdi++;
      continue;
    }
    conflitos.push({ chave: k, meu: x, dele: outro });
  }
  return { lista: Array.from(porChave.values()), novos, ganhei, perdi, semChave, conflitos };
}

/* ---------- mapa: objeto chaveado. Nenhuma chave se perde ----------
   `valor` · união de chaves; empate fica com a MINHA (foi ela que acabou de ser
             editada nesta tela)
   `lista`  · o valor é um array: união dos dois, sem repetir
   `fundo`  · o valor é outro objeto: funde um nível abaixo, pela regra `valor` */
function fundirMapa(meu, dele, modo) {
  const a = meu && typeof meu === "object" && !Array.isArray(meu) ? meu : {};
  const b = dele && typeof dele === "object" && !Array.isArray(dele) ? dele : {};
  const saida = Object.assign({}, b);
  for (const k of Object.keys(a)) {
    if (!(k in saida)) { saida[k] = a[k]; continue; }
    if (modo === "lista") {
      const l = Array.isArray(saida[k]) ? saida[k] : [];
      const m = Array.isArray(a[k]) ? a[k] : [];
      saida[k] = Array.from(new Set([...l, ...m]));
    } else if (modo === "fundo") {
      saida[k] = fundirMapa(a[k], saida[k], "valor");
    } else {
      saida[k] = a[k];
    }
  }
  return saida;
}

/* ---------- conjunto: lista de escalares sem id. União, ordenada ---------- */
function fundirConjunto(meu, dele) {
  const a = Array.isArray(meu) ? meu : [];
  const b = Array.isArray(dele) ? dele : [];
  const vistos = new Set(); const saida = [];
  for (const x of [...b, ...a]) {
    const k = typeof x === "object" ? JSON.stringify(x) : String(x);
    if (vistos.has(k)) continue; vistos.add(k); saida.push(x);
  }
  return saida.sort((x, y) => (typeof x === "number" && typeof y === "number")
    ? x - y : String(x).localeCompare(String(y), "pt-BR"));
}

/* ---------- foto simples: um objeto só, o carimbo maior vence ---------- */
function fundirFotoSimples(meu, dele, campo) {
  if (!meu) return dele || null;
  if (!dele) return meu;
  const a = String((meu || {})[campo] || ""), b = String((dele || {})[campo] || "");
  if (a && b && a !== b) return a > b ? meu : dele;
  return dele;                      /* empate: fica o do servidor, como a `foto` */
}

/* ---------- a rede de segurança ----------
   Toda chave que existe dos dois lados e não foi coberta por nenhuma das cinco
   formas. Sem isto, uma chave nova em `S.cad` volta a ser perdida em silêncio —
   que é exatamente como as dez anteriores passaram despercebidas. */
const CAD_SEM_REGRA_OK = ["salvoEm"];
function chavesSemEstrategia(sec, meu, dele, e) {
  const cobertas = new Set([
    ...Object.keys(e.listas || {}), ...Object.keys(e.derivadas || {}),
    ...Object.keys(e.mapas || {}), ...(e.conjuntos || []),
    ...Object.keys(e.fotos || {}), ...CAD_SEM_REGRA_OK]);
  const todas = new Set([...Object.keys(meu || {}), ...Object.keys(dele || {})]);
  return [...todas].filter((k) => !cobertas.has(k));
}

function eventosEmOrdem(lista) {
  return (Array.isArray(lista) ? lista.slice() : []).sort((a, b) => {
    const ea = String((a && a.em) || ""), eb = String((b && b.em) || "");
    if (ea !== eb) return ea < eb ? -1 : 1;
    const ia = String((a && a.id) || ""), ib = String((b && b.id) || "");
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });
}
function eventosCortados(lista) {
  const o = eventosEmOrdem(lista);
  return o.length > EVENTOS_MAX ? o.slice(-EVENTOS_MAX) : o;
}
function fundirEventos(meus, deles) {
  const r = fundirRegistros(meus, deles, "id");
  return { lista: eventosCortados(r.lista), novos: r.novos, semId: r.semChave,
    conflitos: r.conflitos.map((c) => ({ id: c.chave, meu: c.meu, dele: c.dele })),
    ganhei: 0, perdi: 0 };
}

/* série temporal: chave é o DIA, vence a importação mais recente do dia */
function fundirSerie(minha, dela) {
  const a = Array.isArray(minha) ? minha : [], b = Array.isArray(dela) ? dela : [];
  const dia = (p) => String((p && p.em) || "").slice(0, 10);
  const porDia = new Map(); const conflitos = []; let novos = 0;
  for (const p of b) if (p && p.em) porDia.set(dia(p), p);
  for (const p of a) {
    if (!p || !p.em) continue;
    const d = dia(p), outro = porDia.get(d);
    if (!outro) { porDia.set(d, p); novos++; continue; }
    if (JSON.stringify(outro) === JSON.stringify(p)) continue;
    if (String(p.em) > String(outro.em)) { porDia.set(d, p); continue; }
    if (String(p.em) < String(outro.em)) continue;
    conflitos.push({ chave: d, meu: p, dele: outro });
  }
  const l = Array.from(porDia.values()).sort((x, y) => String(x.em).localeCompare(String(y.em)));
  return { lista: l.length > HIST_MAX ? l.slice(-HIST_MAX) : l, novos, conflitos };
}

/* fotografia: a importação inteira é indivisível — vence a mais recente */
function fundirFoto(minha, dela, chave) {
  const q = (x) => String((x && x[chave]) || "");
  if (!dela) return { junto: minha, novos: 0, conflitos: [] };
  if (!minha) return { junto: dela, novos: 0, conflitos: [] };
  if (JSON.stringify(minha) === JSON.stringify(dela)) return { junto: dela, novos: 0, conflitos: [] };
  if (q(minha) > q(dela)) return { junto: minha, novos: 0, conflitos: [] };
  if (q(minha) < q(dela)) return { junto: dela, novos: 0, conflitos: [] };
  /* mesma importação com conteúdo diferente: não há como decidir */
  return { junto: dela, novos: 0, conflitos: [{ chave: q(minha) || "(sem carimbo)" }] };
}

/* opções: funde POR OPÇÃO. Só é conflito a MESMA opção mexida dos dois lados
   com valores diferentes — e aí a pessoa vê o nome da opção e os dois valores. */
function fundirOpcoes(minhas, delas) {
  const a = minhas && typeof minhas === "object" ? minhas : {};
  const b = delas && typeof delas === "object" ? delas : {};
  const junto = Object.assign({}, b);
  const conflitos = []; let novos = 0;
  for (const k of Object.keys(a)) {
    if (!(k in b)) { junto[k] = a[k]; novos++; continue; }
    if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
    conflitos.push({ chave: k, meu: a[k], dele: b[k] });
  }
  return { junto, novos, conflitos };
}

/* ---------- a porta única: uma estratégia por seção, sempre ---------- */
function fundirSecao(sec, doServidor) {
  const e = SECOES[sec];
  if (!e) return null;                       /* seção sem estratégia: a bateria proíbe */
  if (doServidor == null) return null;       /* documento ilegível: quem chama relê */
  const conflitos = [];
  const resumo = { ganhei: 0, perdi: 0, novos: 0 };
  const meu = dumpSecao(sec);
  let junto;

  if (e.forma === "log") {
    if (!Array.isArray(doServidor)) return null;
    const r = fundirEventos(meu, doServidor);
    junto = r.lista; resumo.novos += r.novos;
    for (const c of r.conflitos) conflitos.push({ sec, lista: "(a seção)", chave: c.id });
  } else if (e.forma === "serie") {
    if (typeof doServidor !== "object") return null;
    const r = fundirSerie((meu && meu.serie) || [], doServidor.serie || []);
    junto = Object.assign({}, doServidor, { serie: r.lista }); resumo.novos += r.novos;
    for (const c of r.conflitos) conflitos.push({ sec, lista: "serie", chave: c.chave });
  } else if (e.forma === "foto") {
    const r = fundirFoto(meu, doServidor, e.chave);
    junto = r.junto;
    for (const c of r.conflitos) conflitos.push({ sec, lista: "(a importação)", chave: c.chave });
  } else if (e.forma === "opcoes") {
    const r = fundirOpcoes(meu, doServidor);
    junto = r.junto; resumo.novos += r.novos;
    for (const c of r.conflitos) conflitos.push({ sec, lista: "(opção)", chave: c.chave, meu: c.meu, dele: c.dele });
  } else if (e.forma === "registros" && e.raiz) {
    if (!Array.isArray(doServidor)) return null;
    const r = fundirRegistros(meu, doServidor, e.raiz);
    junto = r.lista; resumo.novos += r.novos; resumo.ganhei += r.ganhei; resumo.perdi += r.perdi;
    for (const c of r.conflitos) conflitos.push({ sec, lista: "(a seção)", chave: c.chave });
  } else if (e.forma === "registros") {
    if (typeof doServidor !== "object") return null;
    junto = Object.assign({}, doServidor);
    /* as derivadas entram pela união simples de ids, sem conflito: quem manda
       nelas é a conta que roda depois, em `aplicarSecao` */
    for (const nome of Object.keys(e.derivadas || {})) {
      const meus = ((meu || {})[nome] || []), deles = (doServidor[nome] || []);
      const por = new Map();
      for (const x of deles) if (x && x.id != null) por.set(x.id, x);
      for (const x of meus) if (x && x.id != null && !por.has(x.id)) por.set(x.id, x);
      junto[nome] = Array.from(por.values());
    }
    for (const nome of Object.keys(e.listas)) {
      const r = fundirRegistros((meu || {})[nome], doServidor[nome], e.listas[nome]);
      junto[nome] = r.lista;
      resumo.novos += r.novos; resumo.ganhei += r.ganhei; resumo.perdi += r.perdi;
      for (const c of r.conflitos) conflitos.push({ sec, lista: nome, chave: c.chave });
    }
    for (const nome of Object.keys(e.mapas || {})) {
      junto[nome] = fundirMapa((meu || {})[nome], doServidor[nome], e.mapas[nome]);
    }
    for (const nome of (e.conjuntos || [])) {
      junto[nome] = fundirConjunto((meu || {})[nome], doServidor[nome]);
    }
    for (const nome of Object.keys(e.fotos || {})) {
      junto[nome] = fundirFotoSimples((meu || {})[nome], doServidor[nome], e.fotos[nome]);
    }
    /* REDE DE SEGURANÇA: chave de `S.cad` que ninguém declarou seria gravada e
       nunca fundida — o defeito que esta correção fecha. Em vez de perder
       calado, o app PARA e diz o nome. */
    const semEstrategia = chavesSemEstrategia(sec, meu, doServidor, e);
    if (semEstrategia.length) {
      const err = new Error("chave sem regra de concorrência: " + semEstrategia.join(", "));
      err.semEstrategia = sec + " → " + semEstrategia.join(", ");
      throw err;
    }
  } else return null;

  if (conflitos.length) {
    /* NÃO se escolhe em silêncio, e NÃO se oferece apagar o lado do outro:
       o que sobe é o dado exato em briga, com nome e os dois valores. */
    const err = new Error("conflito de dado");
    err.conflitoDeDados = conflitos;
    throw err;
  }
  return { junto, resumo };
}

function aplicarSecao(sec, obj) {
  if (sec === "eventos") { S.eventos = Array.isArray(obj) ? obj : []; return; }
  if (sec === "hist") { S.hist = obj || { serie: [] }; return; }
  if (sec === "produtos") { S.produtos = Array.isArray(obj) ? obj : []; S.calc = null; return; }
  if (sec === "equipe") { S.equipe = Array.isArray(obj) ? obj : []; return; }
  if (sec === "cad") { S.cad = obj || S.cad; S.calc = null; return; }
  if (sec === "cfg") {
    /* A marca d'água do número é a única chave de `cfg` que NÃO pode ser
       sobrescrita pelo documento: duas máquinas com marcas diferentes fariam a
       menor ganhar, e o número voltaria para a fila pela porta dos fundos.
       Aqui a fusão é `max`, sempre — em qualquer direção. */
    const marcaAntes = Number(S.cfg && S.cfg.maiorNumeroUsado) || 0;
    S.cfg = Object.assign({}, CFG_PADRAO, obj || {},
      { padroes: Object.assign({}, CFG_PADRAO.padroes, (obj && obj.padroes) || {}) });
    S.cfg.maiorNumeroUsado = Math.max(marcaAntes, Number(S.cfg.maiorNumeroUsado) || 0);
    return; }
  if (sec === "estoque") { S.estoque = obj || S.estoque; S.calc = null; return; }
  if (sec === "festivas") { S.festivas = { campanhas: (obj && obj.campanhas) || [] }; return; }
  if (sec === "nucleo") {
    S.ops = obj.ops || []; S.pedidos = obj.pedidos || [];
    S.analises = obj.analises || []; S.faltas = obj.faltas || [];
    /* a conta é refeita DEPOIS da fusão: `ops` é derivada dos pedidos, e
       depois de juntar as duas listas ela precisa refletir o conjunto */
    S.ops.forEach(recalcularOP);
  } else if (sec === "insumos") {
    S.insumos = obj.insumos || []; S.movInsumo = obj.movs || []; S.entradas = obj.entradas || [];
    S.posse = obj.posse || []; S.bens = obj.bens || []; S.posseItens = obj.posseItens || [];
    esquecerSaldos(); esquecerReservas();
  } else if (sec === "semi") {
    S.semiTipos = obj.tipos || []; S.remessas = obj.remessas || []; S.semiAjustes = obj.ajustes || [];
  }
  S.calc = null;
}

function dumpSecao(sec) {
  if (sec === "nucleo") return { ops: S.ops, pedidos: S.pedidos, analises: S.analises,
    faltas: S.faltas, salvoEm: new Date().toISOString() };
  if (sec === "produtos") return S.produtos;
  if (sec === "estoque") return S.estoque;
  if (sec === "cad") return S.cad;
  if (sec === "cfg") return S.cfg;
  if (sec === "equipe") return S.equipe;
  /* o corte sai daqui em ordem determinística — e só depois de a lista da
     memória já estar unida com a do servidor (quem une é `puxarAntesDeGravar`
     antes de cada gravação, e `fundirSecao` quando há colisão) */
  if (sec === "eventos") return eventosCortados(S.eventos);
  if (sec === "hist") return S.hist;
  /* insumos, movimentos e notas viajam juntos: são a mesma história contada em
     três tabelas, e separar faria uma gravar sem a outra */
  if (sec === "festivas") return { campanhas: S.festivas?.campanhas || [], salvoEm: new Date().toISOString() };
  if (sec === "insumos") return { insumos: S.insumos, movs: S.movInsumo, entradas: S.entradas,
    posse: S.posse, bens: S.bens, posseItens: S.posseItens, salvoEm: new Date().toISOString() };
  if (sec === "semi") return { tipos: S.semiTipos || [], remessas: S.remessas || [],
    ajustes: S.semiAjustes || [], salvoEm: new Date().toISOString() };
}
