/* ===========================================================================
   src/corte/projetos.js · O PROJETO DE CORTE, do lado do app
   ---------------------------------------------------------------------------
   v8.109. Lê as cinco tabelas da 147, monta a forma que `crtResolver`
   (src/corte/modelo.js) espera, e grava pela fila (src/corte/outbox.js).
   A tela não fala com o servidor: fala com este arquivo.

   O CONTRATO DE `pcp_projeto_corte_salvar`, lido do arquivo da migration:

     p_projeto  {id, nome, escopo, ativo}     id, nome e escopo obrigatórios
     p_regras   [{campo, operador, valor, ordem}] | null
                não-nulo APAGA e regrava as condições do projeto.
                Condição é do PROJETO, não da versão: mudar o recorte não
                cria versão nova.
     p_receita  {...} | null
                **não-nulo cria uma versão NOVA.** É por isso que este
                arquivo só manda receita quando ela mudou de verdade:
                `pjMudouMaterial`. Renomear o projeto ou ajustar a condição
                não gera v2, v3, v4.
     p_publicar  publica a versão criada e arquiva a anterior. Só faz sentido
                junto com receita — é dentro do `if p_receita` que ele age.
     p_expected_revision  revisão do PROJETO; diferente → conflito.

   OS INVARIANTES QUE ESTE ARQUIVO PRESERVA

     · família < combinação < SKU — quem decide é `crtPeso`, no modelo. Aqui
       só se monta a lista; a ordem não é reimplementada;
     · chave estável de corte e de camada — nasce em `pjNovoCorte` /
       `pjNovaCamada` com `crtChave`, e é gravada como veio. O id da linha no
       banco é derivado dela (`versao_id + '_' + chave`), nunca o contrário;
     · herança independente por bloco — `cortesModo`, `fitilhoModo` e
       `sortimentoModo` viajam separados e são o que a tela marca em "o que
       esta regra define";
     · ajuste parcial por chave — o modo `ajusta` grava só a diferença, e o
       modelo aplica por chave. A tela ainda não oferece esse modo; o caminho
       de gravação já o respeita;
     · ausência de fitilho = ausência de linha — receita sem `fitilho` não
       insere nada. Não existe "usa = false";
     · versão publicada é imutável — nunca se edita uma; salva-se outra.
   =========================================================================== */

/* ---------------------------------------------------------------------------
   LEITURA · cinco tabelas, montadas em uma lista que o modelo entende.
   Só as versões PUBLICADAS entram: rascunho e arquivada não resolvem nada.
   --------------------------------------------------------------------------- */
let PJ_LISTA = [];
function pjLista()   { return PJ_LISTA.slice(); }
function pjAchar(id) { return PJ_LISTA.find((p) => p.id === id) || null; }
function pjQuantos() { return PJ_LISTA.length; }

const pjEmLista = (ids) => `in.(${ids.map((x) => `"${String(x).replace(/"/g, '')}"`).join(",")})`;

async function pjCarregar() {
  const ler = async (caminho) => {
    const r = await persLer(caminho);
    if (!r.ok) throw r.erro || { tipo: "erro" };
    return persLista(r.corpo);
  };
  try {
    const projetos = await ler("pcp_projeto_corte?deleted_at=is.null"
      + "&select=id,nome,escopo,ativo,versao_publicada_id,revision&order=nome.asc&limit=500");
    if (!projetos.length) { PJ_LISTA = []; return { status: "ok", quantos: 0 }; }

    const ids = projetos.map((p) => p.id);
    const regras = await ler(`pcp_projeto_corte_regra?projeto_id=${pjEmLista(ids)}`
      + "&select=projeto_id,campo,operador,valor,ordem&order=ordem.asc&limit=2000");
    const versoes = await ler(`pcp_projeto_corte_versao?projeto_id=${pjEmLista(ids)}&status=eq.publicada`
      + "&select=id,projeto_id,versao,cortes_modo,fitilho_modo,sortimento_modo,publicada_em&limit=500");

    const vids = versoes.map((v) => v.id);
    const cortes = vids.length ? await ler(`pcp_projeto_corte_corte?versao_id=${pjEmLista(vids)}`
      + "&select=id,versao_id,chave,ordem,operacao,fita_id,comprimento_mm,tipo_corte,qtd,identificacao"
      + "&order=ordem.asc&limit=5000") : [];
    const cids = cortes.map((c) => c.id);
    const camadas = cids.length ? await ler(`pcp_projeto_corte_camada?corte_id=${pjEmLista(cids)}`
      + "&select=corte_id,chave,ordem,operacao,fita_id,comprimento_mm,tipo_corte,cortar_juntas,condicao"
      + "&order=ordem.asc&limit=5000") : [];
    const fitilhos = vids.length ? await ler(`pcp_projeto_corte_fitilho?versao_id=${pjEmLista(vids)}`
      + "&select=versao_id,partes,comprimento_mm&limit=500") : [];
    const sorts = vids.length ? await ler(`pcp_projeto_corte_sortimento?versao_id=${pjEmLista(vids)}`
      + "&select=versao_id,modo,variedade&limit=500") : [];
    const sitens = vids.length ? await ler(`pcp_projeto_corte_sortimento_item?versao_id=${pjEmLista(vids)}`
      + "&select=versao_id,genero,qtd&limit=2000") : [];

    try { PJ_TIPOS = await ler("pcp_corte_tipo?ativo=is.true&select=codigo,rotulo&order=ordem.asc"); }
    catch (e) { PJ_TIPOS = []; }

    PJ_LISTA = projetos.map((p) => pjMontar(p, regras, versoes, cortes, camadas, fitilhos, sorts, sitens));
    return { status: "ok", quantos: PJ_LISTA.length };
  } catch (erro) {
    return { status: "nao-consegui", erro, quantos: PJ_LISTA.length };
  }
}

/* servidor → app. Os nomes camelCase não são gosto: são os que
   `crtResolver` lê (CRT_CAMPOS_CORTE / CRT_CAMPOS_CAMADA). */
function pjMontar(p, regras, versoes, cortes, camadas, fitilhos, sorts, sitens) {
  const v = versoes.find((x) => x.projeto_id === p.id) || null;
  const meusCortes = v ? cortes.filter((c) => c.versao_id === v.id) : [];
  const fl = v ? fitilhos.find((x) => x.versao_id === v.id) : null;
  const st = v ? sorts.find((x) => x.versao_id === v.id) : null;

  return {
    id: p.id, nome: p.nome, escopo: p.escopo, ativo: p.ativo !== false,
    revision: p.revision,
    regras: regras.filter((r) => r.projeto_id === p.id)
      .map((r) => ({ campo: r.campo || "sku", operador: r.operador, valor: r.valor, ordem: r.ordem })),
    versao: !v ? null : {
      id: v.id, versao: v.versao, publicadaEm: v.publicada_em,
      cortesModo: v.cortes_modo, fitilhoModo: v.fitilho_modo, sortimentoModo: v.sortimento_modo,
      cortes: meusCortes.map((c) => ({
        chave: c.chave, ordem: c.ordem, operacao: c.operacao,
        fitaId: c.fita_id, comprimentoMm: c.comprimento_mm, tipoCorte: c.tipo_corte,
        qtd: c.qtd, identificacao: c.identificacao,
        camadas: camadas.filter((m) => m.corte_id === c.id).map((m) => ({
          chave: m.chave, ordem: m.ordem, operacao: m.operacao,
          fitaId: m.fita_id, comprimentoMm: m.comprimento_mm, tipoCorte: m.tipo_corte,
          cortarJuntas: m.cortar_juntas, condicao: m.condicao,
        })),
      })),
      /* sem linha = não usa. É a regra da 147 e não se traduz para um booleano */
      fitilho: fl ? { partes: fl.partes, comprimentoMm: fl.comprimento_mm } : null,
      sortimento: st ? { modo: st.modo, variedade: st.variedade,
        itens: sitens.filter((i) => i.versao_id === v.id).map((i) => ({ genero: i.genero, qtd: i.qtd })) } : null,
    },
  };
}

/* Os tipos de corte são DOMÍNIO no banco (pcp_corte_tipo), não constante no
   código — foi a decisão D4. A queda para os três semeados existe só para a
   tela não ficar sem opção quando a leitura falha; ela não inventa tipo novo. */
let PJ_TIPOS = [];
function pjTipos() {
  return PJ_TIPOS.length ? PJ_TIPOS.slice()
    : [{ codigo: "reto", rotulo: "Reto" }, { codigo: "45", rotulo: "45°" }, { codigo: "biqueira", rotulo: "Biqueira" }];
}

/* A resolução é a do modelo, sem segunda implementação aqui. */
function pjResolver(sku) { return crtResolver(PJ_LISTA, sku); }
/* a mesma resolução, com um projeto escolhido à mão para UM pedido (v8.110) */
function pjResolverManual(sku, projetoId) { return crtResolverManual(PJ_LISTA, sku, projetoId); }
/* os projetos que podem ser escolhidos à mão: vivos e com versão publicada.
   A lista NÃO é filtrada pelo SKU de propósito — "Trocar" existe justamente
   para usar um projeto que sozinho não casaria com ele. */
function pjEscolhiveis() {
  return (PJ_LISTA || []).filter((p) => p && p.ativo !== false && p.versao && p.versao.id);
}
function pjQuemCasa(projeto, skus) {
  return (skus || []).filter((s) => crtCasa(projeto, s));
}

/* ---------------------------------------------------------------------------
   RASCUNHO · o que a tela edita. Comprimento em CENTÍMETRO, como texto, porque
   é o que a pessoa digita; a conversão para milímetro inteiro é na saída, com
   `crtMm` — uma função só para isso no sistema inteiro.
   --------------------------------------------------------------------------- */
function pjNovoId() {
  const a = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
    : Math.random().toString(16).slice(2, 12);
  return `prj_${a}`;
}
const pjCm = (mm) => (mm == null ? "" : String(Number(mm) / 10).replace(".", ","));

function pjNovoCorte()  { return { chave: crtChave("ct"), fitaId: "", comprimentoCm: "", tipoCorte: "reto", qtd: 1, identificacao: "", camadas: [] }; }
function pjNovaCamada() { return { chave: crtChave("cm"), fitaId: "", comprimentoCm: "", tipoCorte: "reto", cortarJuntas: true, condicao: "" }; }

/* ---------------------------------------------------------------------------
   AJUSTE · as operações do modo "ajusta". A diferença para o bloco inteiro é
   que aqui campo em branco significa "mantém o que veio da regra mais geral",
   e não "vazio". Por isso nada nasce preenchido: nem tipo de corte, nem
   quantidade, nem "cortar juntas".

   DUAS ARMADILHAS DO MODELO, e é por elas que a ordem viaja sempre:
   crtMesclar só ignora undefined, null e string vazia — 0 e false contam como
   preenchidos. Uma operação que mandasse ordem 0 jogaria o corte herdado para
   a frente da lista; uma que mandasse cortar_juntas false sem querer trocaria
   corte junto por corte separado. Então a ordem vai com o valor HERDADO (a
   mesclagem vira um no-op nesse campo) e o "cortar juntas" do ajuste tem três
   estados: "" não toca, true e false trocam.
   --------------------------------------------------------------------------- */
function pjNovaOpCorte(chave, operacao, ordem) {
  return { chave: chave || crtChave("ct"), operacao: operacao || "substitui", ordem: ordem || 0,
    fitaId: "", comprimentoCm: "", tipoCorte: "", qtd: "", identificacao: "", camadas: [] };
}
function pjNovaOpCamada(chave, operacao, ordem) {
  return { chave: chave || crtChave("cm"), operacao: operacao || "substitui", ordem: ordem || 0,
    fitaId: "", comprimentoCm: "", tipoCorte: "", cortarJuntas: "", condicao: "" };
}
const pjOpDe = (lista, chave) => (lista || []).find((x) => x.chave === chave) || null;

/* A base que o ajuste enxerga: a resolução de TODOS os outros projetos para um
   SKU representativo. Sem ela a tela não teria o que ajustar — e materializar
   uma cópia da família é exatamente o que o ajuste existe para evitar. */
function pjSkuExemplo(rascunho, skus) {
  const alvo = { regras: pjParaRegras(rascunho), ativo: true, escopo: rascunho.escopo };
  return (skus || []).find((s) => crtCasa(alvo, s)) || null;
}
function pjBaseHerdada(rascunho, sku) {
  if (!sku) return { cortes: [], fitilho: null, sortimento: null, origem: {}, cadeia: [] };
  return crtResolver(PJ_LISTA.filter((p) => p.id !== rascunho.id), sku);
}

function pjNovo(escopo) {
  return { id: pjNovoId(), nome: "", escopo: escopo || "familia", ativo: true, revision: null,
    novo: true, regras: [{ campo: "sku", operador: "comeca", valor: "" }],
    /* o MODO de cada bloco, não um sim/não: "herda" não escreve nada e deixa a
       regra mais geral valer; "substitui" troca o bloco inteiro; "ajusta"
       guarda só a diferença, por chave; "remove" zera o bloco. A tela ainda
       não edita "ajusta", mas o rascunho precisa saber carregá-lo — um
       booleano aqui apagaria o modo de uma versão que já o usa. */
    modo: { cortes: "substitui", fitilho: "herda", sortimento: "herda" },
    cortes: [], fitilho: null, sortimento: null };
}

/* projeto carregado → rascunho editável */
function pjRascunhoDe(p) {
  const v = p.versao || {};
  return {
    id: p.id, nome: p.nome, escopo: p.escopo, ativo: p.ativo, revision: p.revision, novo: false,
    versaoAtual: v.versao || null,
    regras: (p.regras || []).map((r) => ({ campo: r.campo || "sku", operador: r.operador, valor: r.valor })),
    modo: {
      cortes: v.cortesModo || "herda",
      fitilho: v.fitilhoModo || "herda",
      sortimento: v.sortimentoModo || "herda",
    },
    /* EM AJUSTE, BRANCO É INFORMAÇÃO. Preencher o que veio vazio com padrões
       — "reto", quantidade 1, cortar juntas — transformaria "não toquei"
       em "troque para isto" assim que alguém reabrisse e salvasse a regra. E
       perder a `operacao` faria um `remove` virar `substitui`, ressuscitando
       o corte que a regra existia para tirar. Por isso o modo decide como o
       rascunho é montado. */
    cortes: (v.cortes || []).map((c) => (v.cortesModo === "ajusta" ? {
      chave: c.chave, operacao: c.operacao || "substitui", ordem: c.ordem,
      fitaId: c.fitaId || "", comprimentoCm: pjCm(c.comprimentoMm),
      tipoCorte: c.tipoCorte || "", qtd: c.qtd == null ? "" : c.qtd,
      identificacao: c.identificacao || "",
      camadas: (c.camadas || []).map((m) => ({
        chave: m.chave, operacao: m.operacao || "substitui", ordem: m.ordem,
        fitaId: m.fitaId || "", comprimentoCm: pjCm(m.comprimentoMm),
        tipoCorte: m.tipoCorte || "",
        cortarJuntas: m.cortarJuntas == null ? "" : !!m.cortarJuntas,
        condicao: m.condicao || "",
      })),
    } : {
      chave: c.chave, fitaId: c.fitaId || "", comprimentoCm: pjCm(c.comprimentoMm),
      tipoCorte: c.tipoCorte || "reto", qtd: c.qtd == null ? 1 : c.qtd,
      identificacao: c.identificacao || "",
      camadas: (c.camadas || []).map((m) => ({
        chave: m.chave, fitaId: m.fitaId || "", comprimentoCm: pjCm(m.comprimentoMm),
        tipoCorte: m.tipoCorte || "reto", cortarJuntas: m.cortarJuntas !== false,
        condicao: m.condicao || "",
      })),
    })),
    fitilho: v.fitilho ? { partes: v.fitilho.partes || 1, comprimentoCm: pjCm(v.fitilho.comprimentoMm) } : null,
    sortimento: v.sortimento ? { modo: v.sortimento.modo, variedade: v.sortimento.variedade || "",
      itens: (v.sortimento.itens || []).map((i) => ({ genero: i.genero, qtd: i.qtd })) } : null,
  };
}

/* ---------------------------------------------------------------------------
   VALIDAÇÃO · antes da fila. As três primeiras são as mesmas que a RPC checa
   antes de registrar a operação; repeti-las aqui evita nascer ação inválida.
   --------------------------------------------------------------------------- */
function pjValidar(r) {
  if (!r || !r.id) return "projeto sem id";
  if (!String(r.nome || "").trim()) return "o projeto precisa de um nome";
  if (!["familia", "combinacao", "sku"].includes(String(r.escopo))) return "escopo desconhecido";
  const conds = (r.regras || []).filter((c) => String(c.valor || "").trim());
  if (!conds.length) return "diga para quem esta regra vale";
  const dModo = r.modo || {};
  if (dModo.cortes === "substitui") {
    for (const c of (r.cortes || [])) {
      if (!c.fitaId) return "cada corte precisa de uma fita";
      if (crtMm(c.comprimentoCm, "cm") == null) return "cada corte precisa de um comprimento";
      for (const m of (c.camadas || [])) if (!m.fitaId) return "cada fita sobreposta precisa de uma fita";
    }
  }
  if (dModo.cortes === "ajusta") {
    /* no ajuste, campo em branco é "mantém o herdado" — só o que NASCE aqui
       precisa estar completo */
    for (const c of (r.cortes || [])) {
      if (c.operacao === "acrescenta") {
        if (!c.fitaId) return "o corte acrescentado precisa de uma fita";
        if (crtMm(c.comprimentoCm, "cm") == null) return "o corte acrescentado precisa de um comprimento";
      }
      for (const m of (c.camadas || [])) {
        if (m.operacao === "acrescenta" && !m.fitaId) return "a camada acrescentada precisa de uma fita";
      }
    }
    if (!(r.cortes || []).length) return "um ajuste precisa de ao menos uma operação";
  }
  if (dModo.fitilho === "substitui" && r.fitilho && crtMm(r.fitilho.comprimentoCm, "cm") == null) {
    return "o fitilho precisa de uma medida";
  }
  return null;
}

/* ---------------------------------------------------------------------------
   SAÍDA · rascunho → o jsonb que a RPC espera.
   --------------------------------------------------------------------------- */
const PJ_MODOS = Object.freeze(["herda", "substitui", "ajusta", "remove"]);
const pjModo = (m) => (PJ_MODOS.includes(String(m)) ? String(m) : "herda");
/* escreve linha? só quem substitui ou ajusta. Herdar e remover não mandam
   receita de bloco nenhuma — e é assim que "ausência = ausência de linha" vale */
const pjEscreve = (m) => m === "substitui" || m === "ajusta";

function pjParaRegras(r) {
  if (String(r.escopo) === "sku") {
    const v = String((r.regras && r.regras[0] && r.regras[0].valor) || "").trim();
    return [{ campo: "sku", operador: "igual", valor: v, ordem: 1 }];
  }
  return (r.regras || [])
    .filter((c) => String(c.valor || "").trim())
    .map((c, i) => ({ campo: c.campo || "sku", operador: c.operador || "comeca",
                      valor: String(c.valor).trim(), ordem: i + 1 }));
}

function pjParaReceita(r) {
  const d = r.modo || {};
  const receita = {
    cortes_modo: pjModo(d.cortes),
    fitilho_modo: pjModo(d.fitilho),
    sortimento_modo: pjModo(d.sortimento),
    cortes: !pjEscreve(pjModo(d.cortes)) ? []
      : pjModo(d.cortes) === "ajusta" ? pjOpsCortes(r.cortes) : pjCortesCheios(r.cortes),
  };
  /* ausência de fitilho = ausência de chave: a RPC só insere linha quando o
     valor é um objeto */
  if (pjEscreve(pjModo(d.fitilho)) && r.fitilho) {
    receita.fitilho = { partes: Number(r.fitilho.partes) === 2 ? 2 : 1,
                        comprimento_mm: crtMm(r.fitilho.comprimentoCm, "cm") };
  }
  if (pjEscreve(pjModo(d.sortimento)) && r.sortimento) {
    receita.sortimento = { modo: r.sortimento.modo === "sortido" ? "sortido" : "exato",
      variedade: r.sortimento.variedade || null,
      itens: (r.sortimento.itens || []).filter((i) => Number(i.qtd) > 0)
        .map((i) => ({ genero: i.genero, qtd: Number(i.qtd) })) };
  }
  return receita;
}

/* o bloco inteiro: "substitui" manda a receita completa */
function pjCortesCheios(cortes) {
  return (cortes || []).map((c, i) => ({
    chave: c.chave, ordem: i + 1, operacao: "define",
    fita_id: c.fitaId || null,
    comprimento_mm: crtMm(c.comprimentoCm, "cm"),
    tipo_corte: c.tipoCorte || null,
    qtd: Number(c.qtd) > 1 ? Number(c.qtd) : 1,
    identificacao: String(c.identificacao || "").trim() || null,
    camadas: (c.camadas || []).map((m, j) => ({
      chave: m.chave, ordem: j + 1, operacao: "define",
      fita_id: m.fitaId || null,
      /* vazio = igual ao corte. Null aqui é informação, não falta dela */
      comprimento_mm: crtMm(m.comprimentoCm, "cm"),
      tipo_corte: m.tipoCorte || null,
      cortar_juntas: m.cortarJuntas !== false,
      condicao: String(m.condicao || "").trim() || null,
    })),
  }));
}

/* só a diferença: uma linha por operação, achada pela chave. Uma operação
   "substitui" que não mexeu em nada é descartada — gravar linha que não muda
   nada só polui a versão. */
const pjTemAlgo = (o) => [o.fitaId, o.comprimentoCm, o.tipoCorte, o.qtd, o.identificacao]
  .some((v) => v !== "" && v != null) || ((o.camadas || []).length > 0);

function pjOpsCortes(ops) {
  return (ops || [])
    .filter((c) => c.operacao === "remove" || c.operacao === "acrescenta" || pjTemAlgo(c))
    .map((c, i) => ({
      chave: c.chave,
      /* a ordem herdada viaja de volta: mandar 0 empurraria o corte para a
         frente da lista, porque crtMesclar trata 0 como preenchido */
      ordem: Number(c.ordem) > 0 ? Number(c.ordem) : i + 1,
      operacao: c.operacao || "substitui",
      fita_id: c.fitaId || null,
      comprimento_mm: crtMm(c.comprimentoCm, "cm"),
      tipo_corte: c.tipoCorte || null,
      qtd: Number(c.qtd) > 0 ? Number(c.qtd) : null,
      identificacao: String(c.identificacao || "").trim() || null,
      camadas: (c.camadas || [])
        .filter((m) => m.operacao === "remove" || m.operacao === "acrescenta"
          || [m.fitaId, m.comprimentoCm, m.tipoCorte, m.condicao].some((v) => v !== "" && v != null)
          || m.cortarJuntas === true || m.cortarJuntas === false)
        .map((m, j) => ({
          chave: m.chave, ordem: Number(m.ordem) > 0 ? Number(m.ordem) : j + 1,
          operacao: m.operacao || "substitui",
          fita_id: m.fitaId || null,
          comprimento_mm: crtMm(m.comprimentoCm, "cm"),
          tipo_corte: m.tipoCorte || null,
          /* três estados: "" não toca, true/false trocam */
          cortar_juntas: (m.cortarJuntas === "" || m.cortarJuntas == null) ? null : !!m.cortarJuntas,
          condicao: String(m.condicao || "").trim() || null,
        })),
    }));
}

/* ---------------------------------------------------------------------------
   ALTERAÇÃO MATERIAL · o que decide se nasce uma versão nova.
   Compara a receita que sairia com a da versão publicada, em forma canônica:
   ordem de chave normalizada, campo a campo. Renomear o projeto, mexer nas
   condições ou ligar/desligar `ativo` NÃO são alteração material.
   --------------------------------------------------------------------------- */
function pjCanonica(receita) {
  if (!receita) return "";
  const corte = (c) => [c.chave, c.ordem, c.operacao, c.fita_id, c.comprimento_mm, c.tipo_corte,
    c.qtd, c.identificacao,
    (c.camadas || []).slice().sort((a, b) => String(a.chave).localeCompare(String(b.chave)))
      .map((m) => [m.chave, m.ordem, m.operacao, m.fita_id, m.comprimento_mm, m.tipo_corte,
                   m.cortar_juntas, m.condicao].join("|")).join(";")].join("|");
  return JSON.stringify({
    modos: [receita.cortes_modo, receita.fitilho_modo, receita.sortimento_modo],
    cortes: (receita.cortes || []).slice()
      .sort((a, b) => String(a.chave).localeCompare(String(b.chave))).map(corte),
    fitilho: receita.fitilho ? [receita.fitilho.partes, receita.fitilho.comprimento_mm] : null,
    sortimento: receita.sortimento ? [receita.sortimento.modo, receita.sortimento.variedade,
      (receita.sortimento.itens || []).slice()
        .sort((a, b) => String(a.genero).localeCompare(String(b.genero)))
        .map((i) => i.genero + ":" + i.qtd).join(",")] : null,
  });
}

/* a receita publicada, na MESMA forma de saída, para a comparação ser justa */
function pjReceitaPublicada(p) {
  if (!p || !p.versao) return null;
  return pjParaReceita(pjRascunhoDe(p));
}

function pjMudouMaterial(projetoCarregado, receitaNova) {
  const antes = pjReceitaPublicada(projetoCarregado);
  if (!antes) return true;                       /* nunca teve versão: a primeira é material */
  return pjCanonica(antes) !== pjCanonica(receitaNova);
}

/* ---------------------------------------------------------------------------
   GRAVAÇÃO · sempre pela fila. Com `corte_escrita` desligada, fica guardada.
   --------------------------------------------------------------------------- */
async function pjSalvar(rascunho) {
  const erro = pjValidar(rascunho);
  if (erro) return { status: "invalido", motivo: erro };

  const atual = pjAchar(rascunho.id);
  const receita = pjParaReceita(rascunho);
  const material = pjMudouMaterial(atual, receita);

  const acao = cxEnfileirar("corte_projeto_salvar", rascunho.id, {
    p_projeto: { id: rascunho.id, nome: String(rascunho.nome).trim(),
                 escopo: rascunho.escopo, ativo: rascunho.ativo !== false },
    p_regras: pjParaRegras(rascunho),
    /* o pulo do gato: sem receita, a RPC não cria versão */
    p_receita: material ? receita : null,
    p_publicar: material,
    p_expected_revision: atual ? atual.revision : null,
  });
  if (!acao) return { status: "invalido", motivo: "ação desconhecida" };

  const r = await cxDrenar();
  return pjDepoisDoDreno(r, rascunho.id, acao.opId, material);
}

async function pjArquivar(id) {
  const atual = pjAchar(id);
  if (!atual) return { status: "nao-encontrado", id };
  const acao = cxEnfileirar("corte_projeto_arquivar", id, {
    p_id: id, p_expected_revision: atual.revision });
  const r = await cxDrenar();
  const fim = pjDepoisDoDreno(r, id, acao && acao.opId, false);
  if (fim.status === "ok") PJ_LISTA = PJ_LISTA.filter((p) => p.id !== id);
  return fim;
}

function pjDepoisDoDreno(r, id, opId, material) {
  if (r.status === "desligado") return { status: "na-fila", motivo: "gravação do corte desligada", id, material };
  const parada = (r.paradas || []).find((p) => p.opId === opId);
  if (parada) return Object.assign({ id }, parada.resposta, { acao: opId });
  if ((r.feitas || []).includes(opId)) return { status: "ok", id, material };
  return { status: "na-fila", id, restam: r.restam, material };
}

/* as ações de projeto que pararam esperando gente */
function pjParadas() {
  return cxParadas()
    .filter((a) => a.tipo === "corte_projeto_salvar" || a.tipo === "corte_projeto_arquivar")
    .map((a) => ({ opId: a.opId, id: a.entidadeId, tipo: a.tipo,
                   status: a.ultimoErro, resposta: a.resposta || null }));
}
