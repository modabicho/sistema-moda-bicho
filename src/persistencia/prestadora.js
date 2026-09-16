/* ===========================================================================
   PRESTADORA · a identidade em UM lugar só                          v8.39
   ---------------------------------------------------------------------------
   O PCP inteiro comparava prestadora por string, em 33 lugares, com
   `===` cru. `conferencia.js:423` é o pior deles: é o join do PAGAMENTO, e um
   espaço a mais tira o pedido da folha da pessoa sem erro nenhum.

   Aqui mora a resolução, e só aqui. Três degraus, os mesmos do servidor
   (`pcp_prest_id_de`, arquivo 118) — de propósito iguais, para os dois lados
   nunca discordarem sobre quem é quem:

     1 · nome exato, como está hoje no registro
     2 · um nome que ela JÁ TEVE (`extra.nomes_anteriores`)  ← é este degrau
         que faz renomear NÃO exigir reescrever histórico
     3 · o slug (minúsculas, sem acento, espaço colapsado) — junta as grafias

   O CARIMBO nos documentos também mora aqui. Ele NÃO é feito pelo SQL: o
   documento grande é gravado em pedaços com troca de geração atômica e
   gravação condicional (`dados/conflito.js:200-225`), e reproduzir esse
   protocolo no servidor seria manter duas implementações do mesmo contrato.
   Quem carimba é o app, pelo caminho de gravação que já existe.
   =========================================================================== */

const PREST_CAD = "prestadoras";
let PREST_MAPA = null;          /* nome/slug → id, montado uma vez por carga */
let PREST_IDS = null;           /* os ids que EXISTEM, e são donos de si mesmos */

/* o MESMO slug do servidor. Se estes dois divergirem, a tela e o banco passam
   a discordar sobre quem é quem — por isso há teste comparando os dois. */
function prestSlug(nome) {
  const s = String(nome == null ? "" : nome)
    .replace(/&/g, " e ")
    .trim().toLowerCase()
    .replace(/[áàâãä]/g, "a").replace(/[éèêë]/g, "e").replace(/[íìîï]/g, "i")
    .replace(/[óòôõö]/g, "o").replace(/[úùûü]/g, "u")
    .replace(/ç/g, "c").replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return s || null;
}
const prestIdDoNome = (nome) => { const s = prestSlug(nome); return s ? "prest-" + s : null; };

/* valor técnico: nenhuma letra. `"0"` e `"12"` entram; `"3M"` não.
   É a mesma peneira de `pcp_prest_e_tecnico` e a mesma do importador. */
const prestETecnico = (x) => !/[A-Za-zÀ-ÿ]/.test(String(x == null ? "" : x));

/* ---------------------------------------------------------------------------
   O MAPA · montado do registro `pcp_cad_item`, quando ele existe; do
   documento, enquanto a leitura não estiver ligada. Nos dois casos a chave é
   a mesma, então o resto do app não sabe de onde veio.
   --------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
   O ID É DONO DE SI MESMO, e isso vem ANTES do mapa de nomes.
   ---------------------------------------------------------------------------
   O smoke real pegou isto, e o defeito era pior do que parecia: `prestId` não
   reconhecia um id, então `prestMesma(id, id)` caía na comparação de TEXTO e
   dava certo por acaso — enquanto `prestMesma(nome, id)` dava errado, porque
   um lado resolvia e o outro não. Medido no binário quebrado:

     prestId("prest-aline")            → null      (o id não se reconhecia)
     pedido com prestadoraId=prest-aline → casou POR TEXTO, sem querer
     pedido com nome antigo "Aline"    → prestId deu prest-aline, mas o outro
                                         lado era null → caiu no texto → NÃO casou

   Passava despercebido porque hoje o id é `prest-<slug do nome>` e coincide —
   até alguém RENOMEAR. Aí o id continua o antigo, o slug do nome vira outro, e
   o fechamento perde pedidos justamente de quem mudou de nome.

   Conserto: um CONJUNTO dos ids que existem, consultado primeiro. Conjunto, e
   não mais uma entrada no mapa de nomes, porque o mapa é chaveado por nome —
   e uma prestadora chamada, digamos, "prest-aline" não pode roubar o id de
   ninguém.
   --------------------------------------------------------------------------- */
function prestMontarMapa(itens) {
  const m = new Map();
  const ids = new Set();
  const por = (chave, id) => { if (chave && !m.has(chave)) m.set(chave, id); };
  for (const it of (itens || [])) {
    const nome = (it.dados && it.dados.nome) || it.nome;
    if (!it.id || !nome) continue;
    ids.add(it.id);
    por(String(nome).trim(), it.id);
    for (const ant of ((it.extra && it.extra.nomes_anteriores) || [])) {
      por(String(ant).trim(), it.id);
      /* e o SLUG do nome anterior. Sem isto, uma grafia velha ("malharia sao
         jose", sem acento) resolvia enquanto o nome era o atual e parava de
         resolver assim que alguém renomeasse — porque o slug passa a ser o do
         nome novo. O rastro guarda o nome exato; as variações dele têm de
         valer igual. */
      por(prestIdDoNome(ant), it.id);
    }
    por(prestIdDoNome(nome), it.id);       /* o degrau do slug do nome atual */
  }
  PREST_IDS = ids;
  return m;
}

async function prestCarregar() {
  try {
    if (typeof cdListar === "function") {
      const r = await cdListar(PREST_CAD);
      if (r && r.status === "ok" && r.itens && r.itens.length) {
        PREST_MAPA = prestMontarMapa(r.itens);
        return { status: "ok", fonte: "tabela", quantas: r.itens.length };
      }
    }
  } catch (e) { /* servidor fora: cai no documento, que sempre está na tela */ }
  const doDoc = ((typeof S !== "undefined" && S.cad && S.cad.prestadoras) || [])
    .map((p) => ({ id: prestIdDoNome(p.nome), dados: p, extra: p.extra || {} }))
    .filter((x) => x.id);
  PREST_MAPA = prestMontarMapa(doDoc);
  return { status: "ok", fonte: "documento", quantas: doDoc.length };
}

/* A RESOLUÇÃO. Devolve null para vazio e para técnico — id inventado é pior
   que id nenhum. */
function prestId(nome) {
  const n = String(nome == null ? "" : nome).trim();
  if (!n || prestETecnico(n)) return null;
  if (!PREST_MAPA) PREST_MAPA = prestMontarMapa(
    ((typeof S !== "undefined" && S.cad && S.cad.prestadoras) || [])
      .map((p) => ({ id: prestIdDoNome(p.nome), dados: p, extra: p.extra || {} })).filter((x) => x.id));
  /* um id que existe É a resposta: nada a resolver */
  if (PREST_IDS && PREST_IDS.has(n)) return n;
  return PREST_MAPA.get(n) || PREST_MAPA.get(prestIdDoNome(n)) || null;
}

function prestNome(id) {
  if (!id) return null;
  const doDoc = ((typeof S !== "undefined" && S.cad && S.cad.prestadoras) || [])
    .find((p) => prestIdDoNome(p.nome) === id || p.id === id);
  return doDoc ? doDoc.nome : null;
}

/* `a === b` como prestadora, e não como string. É esta função que substitui
   os 33 `===` espalhados — inclusive o do fechamento.

   A REGRA DO DESEMPATE, escrita com cuidado porque foi aqui que o defeito se
   escondeu: o texto só decide quando NENHUM dos dois lados resolve. Se UM
   resolve e o outro não, eles NÃO são a mesma prestadora — comparar o texto
   nesse caso é o que fazia `nome` contra `id` responder `false` calado, e
   `id` contra `id` responder `true` por acaso. */
function prestMesma(a, b) {
  if (a == null || b == null) return false;
  const ia = prestId(a), ib = prestId(b);
  if (ia && ib) return ia === ib;
  if (ia || ib) return false;          /* um resolve e o outro não: não são */
  return String(a).trim() === String(b).trim();   /* registro ainda não carregado */
}

/* ---------------------------------------------------------------------------
   O CARIMBO · põe `prestadoraId` nos registros dos documentos
   ---------------------------------------------------------------------------
   Três camadas, cinco lugares:
     semi/remessas · insumos/posse · insumos/posseItens  → campo `prestadoraId`
     cad/minPrest  · cad/procsPrestadora                 → a CHAVE vira o id
   Nas duas últimas o nome é a chave do objeto, então carimbar é rechavear —
   e o nome antigo é guardado em `_nomes` para nada se perder.

   REENTRANTE: só mexe no que falta. Rodar de novo devolve zero.
   --------------------------------------------------------------------------- */
const PREST_LISTAS = [
  { secao: "semi",    raiz: () => (typeof S !== "undefined" ? S.remessas : null),  rot: "semi/remessas" },
  { secao: "insumos", raiz: () => (typeof S !== "undefined" ? S.posse : null),     rot: "insumos/posse" },
  { secao: "insumos", raiz: () => (typeof S !== "undefined" ? S.posseItens : null), rot: "insumos/posseItens" },
];
const PREST_TABELAS = [
  { secao: "cad", obj: () => (typeof S !== "undefined" && S.cad ? S.cad.minPrest : null),        rot: "cad/minPrest" },
  { secao: "cad", obj: () => (typeof S !== "undefined" && S.cad ? S.cad.procsPrestadora : null), rot: "cad/procsPrestadora" },
];

function prestPrevia() {
  const linhas = [];
  for (const L of PREST_LISTAS) {
    const lista = L.raiz() || [];
    let falta = 0, pronto = 0, orfa = 0, tecnico = 0;
    for (const x of lista) {
      const nome = x && x.prestadora;
      if (!nome) continue;
      if (prestETecnico(nome)) { tecnico++; continue; }
      if (x.prestadoraId) { pronto++; continue; }
      if (prestId(nome)) falta++; else orfa++;
    }
    linhas.push({ origem: L.rot, total: lista.length, comId: pronto, semId: falta, orfas: orfa, tecnicos: tecnico });
  }
  for (const T of PREST_TABELAS) {
    const o = T.obj() || {};
    const chaves = Object.keys(o).filter((k) => !k.startsWith("_"));
    let falta = 0, pronto = 0, orfa = 0, tecnico = 0;
    for (const k of chaves) {
      if (k.startsWith("_")) continue;          /* metadado, não é gente */
      if (/^prest-/.test(k)) { pronto++; continue; }
      if (prestETecnico(k)) { tecnico++; continue; }
      if (prestId(k)) falta++; else orfa++;
    }
    linhas.push({ origem: T.rot, total: chaves.length, comId: pronto, semId: falta, orfas: orfa, tecnicos: tecnico });
  }
  const soma = (c) => linhas.reduce((a, l) => a + l[c], 0);
  return { linhas, aCarimbar: soma("semId"), jaProntos: soma("comId"),
           orfas: soma("orfas"), tecnicos: soma("tecnicos") };
}

async function prestCarimbar() {
  const antes = prestPrevia();
  if (antes.orfas > 0) {
    return { status: "recusado", motivo: "há nome que não resolve para prestadora nenhuma — "
      + "resolva antes, senão o carimbo escolheria por você", previa: antes };
  }
  const secoes = new Set(); const mudou = [];
  for (const L of PREST_LISTAS) {
    for (const x of (L.raiz() || [])) {
      const nome = x && x.prestadora;
      if (!nome || x.prestadoraId || prestETecnico(nome)) continue;
      const id = prestId(nome); if (!id) continue;
      x.prestadoraId = id; secoes.add(L.secao);
      mudou.push({ origem: L.rot, id: x.id, nome, prestadoraId: id });
    }
  }
  for (const T of PREST_TABELAS) {
    const o = T.obj(); if (!o) continue;
    for (const k of Object.keys(o)) {
      if (k.startsWith("_") || /^prest-/.test(k) || prestETecnico(k)) continue;
      const id = prestId(k); if (!id) continue;
      /* rechavear FUNDINDO: duas grafias da mesma pessoa viram uma chave só,
         e nada do que estava lá é perdido. */
      const alvo = o[id];
      o[id] = Array.isArray(o[k]) && Array.isArray(alvo) ? [...new Set([...alvo, ...o[k]])]
            : (alvo && typeof alvo === "object" && !Array.isArray(alvo))
              ? Object.assign({}, alvo, o[k]) : o[k];
      delete o[k];
      /* O NOME ANTIGO DA CHAVE FICA FORA DA TABELA, de propósito. A primeira
         versão guardava em `o._nomes`, dentro do próprio objeto chaveado — e
         na rodada seguinte `_nomes` era lido como se fosse nome de
         prestadora, virava órfã, e o carimbo se RECUSAVA a rodar de novo.
         A bancada pegou: metadado dentro da tabela que ele descreve é chave
         que ninguém pediu. Agora mora ao lado. */
      S.cad.prestNomesAntigos = S.cad.prestNomesAntigos || {};
      const guarda = S.cad.prestNomesAntigos;
      guarda[id] = [...new Set([...(guarda[id] || []), k])];
      secoes.add(T.secao);
      mudou.push({ origem: T.rot, id, nome: k, prestadoraId: id });
    }
  }
  if (!mudou.length) return { status: "ok", carimbados: 0, reentrante: true, previa: prestPrevia() };
  if (typeof salvarTudo === "function") await salvarTudo(...secoes);
  return { status: "ok", carimbados: mudou.length, secoes: [...secoes],
           detalhe: mudou.slice(0, 200), previa: prestPrevia() };
}

/* ---------------------------------------------------------------------------
   RENOMEAR · o nome anterior é guardado, e é só isso que precisa acontecer
   ---------------------------------------------------------------------------
   Enquanto o histórico ainda apontava por nome, renomear obrigava a varrer
   pedidos, posse, remessas e mínimos (`acoes/fabrica.js:487-497`) — e ele
   esquecia remessas e `procsPrestadora`. Com o id carimbado, renomear é
   trocar um campo e anotar o nome velho: quem aponta continua apontando.
   --------------------------------------------------------------------------- */
function prestAnotarNomeAnterior(prest, nomeAntigo) {
  if (!prest || !nomeAntigo || nomeAntigo === prest.nome) return prest;
  prest.extra = prest.extra || {};
  const l = prest.extra.nomes_anteriores || [];
  if (!l.includes(nomeAntigo)) l.push(nomeAntigo);
  prest.extra.nomes_anteriores = l;
  if (PREST_MAPA) PREST_MAPA.set(String(nomeAntigo).trim(), prestId(prest.nome) || prestIdDoNome(nomeAntigo));
  return prest;
}
