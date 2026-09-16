/* ===========================================================================
   src/persistencia/auxiliares.js · CFG, EVENTOS, ESTOQUE e a fila de SKU
   ---------------------------------------------------------------------------
   Quatro domínios pequenos, o mesmo desenho dos outros: cada um responde pelas
   SUAS duas flags, e com elas desligadas devolve `desligado` na primeira linha.

   CFG      · uma linha por opção (`pcp_cfg`). `railMini` NÃO entra: é
              preferência de máquina e viajava num documento compartilhado —
              recolher o menu numa máquina propunha a mudança para todas. Ele
              passa a morar no `localStorage`.
   EVENTOS  · a trilha vira `pcp_evento`, append-only e SEM PODA. O documento
              cortava em 3.000 e descartava o passado mais antigo em silêncio.
   ESTOQUE  · cada importação vira uma FOTO nova (`pcp_estoque_foto`), em vez
              de substituir o documento inteiro. Era `forma:"foto"` com chave
              `importadoEm`: quem importava por último ganhava tudo, e duas
              pessoas no mesmo dia produziam conflito irresolvível.
   FILA SKU · `pendentesSku` vira `pcp_pendencia_sku`.
   =========================================================================== */
Object.assign(PX_RPC, {
  cfg_definir:      "pcp_cfg_definir",
  evento_registrar: "pcp_evento_registrar",
  estoque_importar: "pcp_estoque_importar",
  opcao_definir:    "pcp_opcao_definir",
  sku_resolver:     "pcp_pendencia_sku_resolver",
});

const cfgLeDaTabela      = () => typeof telaFlag === "function" && telaFlag("cfg_leitura");
const cfgEscreveNaTabela = () => typeof telaFlag === "function" && telaFlag("cfg_escrita");
const evLeDaTabela       = () => typeof telaFlag === "function" && telaFlag("eventos_leitura");
const evEscreveNaTabela  = () => typeof telaFlag === "function" && telaFlag("eventos_escrita");
const estLeDaTabela      = () => typeof telaFlag === "function" && telaFlag("estoque_leitura");
const estEscreveNaTabela = () => typeof telaFlag === "function" && telaFlag("estoque_escrita");

/* o que NUNCA vai para a tabela da empresa */
const CFG_SO_DAQUI = ["railMini", "prodSeq", "novoSeq", "imports", "padroesMigrados", "escala4"];

/* ---------------------------------------------------------------------------
   CFG
   --------------------------------------------------------------------------- */
async function cfgCarregar() {
  if (!cfgLeDaTabela()) return { status: "desligado" };
  const r = await persLer("pcp_cfg?select=chave,valor,revision&order=chave");
  if (!r.ok) return pxResposta(r, "listar-cfg");
  if (typeof S === "undefined") return { status: "sem-estado" };
  S.cfg = S.cfg || {};
  CFG_REV = {};
  let n = 0;
  for (const x of persLista(r.corpo)) {
    if (CFG_SO_DAQUI.includes(x.chave)) continue;
    S.cfg[x.chave] = x.valor; CFG_REV[x.chave] = x.revision; n++;
  }
  return { status: "ok", opcoes: n };
}
let CFG_REV = {};

/* Chamado depois de a tela mexer numa opção. Manda SÓ a que mudou. */
async function cfgGravar(chave, valor) {
  if (!cfgEscreveNaTabela()) return { status: "desligado" };
  if (CFG_SO_DAQUI.includes(chave)) return { status: "so-daqui", chave };
  const r = await pxEnviar(obEnfileirar("cfg_definir", chave, {
    p_chave: chave, p_valor: valor === undefined ? null : valor }));
  if (r && r.status === "ok") CFG_REV[chave] = r.revision;
  return r;
}

/* As opções que mudaram desde a última foto — é assim que uma tela que mexe em
   `S.cfg` inteiro manda só o que de fato mudou. */
let CFG_FOTO = null;
function cfgMarcarBase() { CFG_FOTO = JSON.parse(JSON.stringify((typeof S !== "undefined" && S.cfg) || {})); }
async function cfgEnviarMudancas() {
  if (!cfgEscreveNaTabela() || typeof S === "undefined") return { status: "desligado", enviadas: [] };
  const base = CFG_FOTO || {};
  const enviadas = [];
  for (const k of Object.keys(S.cfg || {})) {
    if (CFG_SO_DAQUI.includes(k)) continue;
    /* OPÇÃO QUE A TABELA AINDA NÃO TEM sobe mesmo sem ter "mudado".
       Sem isto, as opções que já vinham do `CFG_PADRAO` ficavam para sempre só
       no documento: a pessoa nunca as "muda", então nada as levaria para lá — e
       o painel diria, para sempre, "N opções ainda só no documento". */
    const naTabela = Object.prototype.hasOwnProperty.call(CFG_REV, k);
    if (naTabela && JSON.stringify(S.cfg[k] ?? null) === JSON.stringify(base[k] ?? null)) continue;
    enviadas.push({ chave: k, novaNaTabela: !naTabela, resposta: await cfgGravar(k, S.cfg[k]) });
  }
  if (enviadas.length) cfgMarcarBase();
  return { status: "ok", enviadas };
}

/* ---------------------------------------------------------------------------
   EVENTOS · a trilha
   --------------------------------------------------------------------------- */
async function evCarregar(quantos) {
  if (!evLeDaTabela()) return { status: "desligado" };
  const r = await persLer("pcp_evento?select=id,op_id,tipo,de,para,analise_id,em,por"
    + "&order=em.desc&limit=" + (quantos || 3000));
  if (!r.ok) return pxResposta(r, "listar-eventos");
  if (typeof S === "undefined") return { status: "sem-estado" };
  S.eventos = persLista(r.corpo).map((x) => ({ id: x.id, opId: x.op_id, tipo: x.tipo,
    de: x.de, para: x.para, analiseId: x.analise_id, em: x.em, por: x.por }))
    .sort((a, b) => String(a.em).localeCompare(String(b.em)));
  return { status: "ok", eventos: S.eventos.length };
}

/* Os eventos que a tela criou e o servidor ainda não tem. `registrar()` empurra
   para `S.eventos` como sempre; quem envia é isto, no `finally` da gravação. */
let EV_ENVIADOS = new Set();
async function evEnviar() {
  if (!evEscreveNaTabela() || typeof S === "undefined") return { status: "desligado", novos: 0 };
  const fila = (S.eventos || []).filter((x) => x && x.id && !EV_ENVIADOS.has(x.id));
  if (!fila.length) return { status: "nada", novos: 0 };
  /* em lotes: a trilha de uma importação pode trazer centenas de uma vez */
  let novos = 0;
  for (let i = 0; i < fila.length; i += 200) {
    const lote = fila.slice(i, i + 200);
    const r = await pxEnviar(obEnfileirar("evento_registrar", null, { p_eventos: lote }));
    if (!r || r.status !== "ok") return Object.assign({ novos }, r || { status: "falhou" });
    for (const x of lote) EV_ENVIADOS.add(x.id);
    novos += r.novos || 0;
  }
  return { status: "ok", novos, marcados: EV_ENVIADOS.size };
}
function evMarcarBase() {
  EV_ENVIADOS = new Set(((typeof S !== "undefined" && S.eventos) || []).map((x) => x && x.id).filter(Boolean));
}

/* ---------------------------------------------------------------------------
   ESTOQUE · a foto
   --------------------------------------------------------------------------- */
async function estCarregar() {
  if (!estLeDaTabela()) return { status: "desligado" };
  const f = await persLer("pcp_estoque_foto?select=id,importado_em,origem,periodo_ini,periodo_fim,itens"
    + "&order=criada_em.desc&limit=1");
  if (!f.ok) return pxResposta(f, "listar-estoque");
  const foto = persLista(f.corpo)[0];
  if (!foto) return { status: "sem-foto" };
  /* a foto pode ter milhares de itens: pagina, como o motor de cadastros */
  const itens = [];
  for (let p = 0; p < 60; p++) {
    const r = await persLer("pcp_estoque_item?select=*&foto_id=eq." + foto.id
      + "&order=sku&limit=1000&offset=" + (p * 1000));
    if (!r.ok) return pxResposta(r, "listar-estoque-itens");
    const l = persLista(r.corpo);
    for (const x of l) itens.push({
      sku: x.sku, produto: x.produto, derivacao: x.derivacao, categoria: x.categoria,
      fornecedor: x.fornecedor, marca: x.marca, vendas: x.vendas,
      valorVendido: x.valor_vendido, valorUnit: x.valor_unit,
      estFisico: x.est_fisico, estDisponivel: x.est_disponivel, estVirtual: x.est_virtual,
      estReservado: x.est_reservado, estMinimo: x.est_minimo,
      previstaEntrada: x.prevista_entrada, custoMedio: x.custo_medio,
      ativo: x.ativo, semVenda: x.sem_venda, origemEstoque: x.origem_estoque });
    if (l.length < 1000) break;
  }
  if (typeof S === "undefined") return { status: "sem-estado" };
  S.estoque = { importadoEm: foto.importado_em, periodoIni: foto.periodo_ini,
                periodoFim: foto.periodo_fim, fotoId: foto.id, itens };
  if (typeof S.calc !== "undefined") S.calc = null;
  return { status: "ok", foto: foto.id, itens: itens.length };
}

async function estImportar(origem, itens, periodoIni, periodoFim, arquivo) {
  if (!estEscreveNaTabela()) return { status: "desligado" };
  if (!Array.isArray(itens) || !itens.length) return { status: "invalido", motivo: "lista vazia" };
  const r = await pxEnviar(obEnfileirar("estoque_importar", origem, {
    p_origem: origem, p_importado_em: new Date().toISOString(),
    p_periodo_ini: periodoIni || null, p_periodo_fim: periodoFim || null,
    p_itens: itens, p_arquivo: arquivo || null,
    p_nome: (typeof usuarioAtual === "function" && usuarioAtual()?.nome) || null }));
  return r;
}

/* ---------------------------------------------------------------------------
   A FILA DE TROCA DE SKU
   --------------------------------------------------------------------------- */
async function skuPendenciaResolver(skuNovo, decisao) {
  if (!cfgEscreveNaTabela() && !estEscreveNaTabela()) return { status: "desligado" };
  return await pxEnviar(obEnfileirar("sku_resolver", skuNovo, {
    p_sku_novo: skuNovo, p_decisao: decisao }));
}

function auxDiagnostico() {
  return {
    cfg: { leitura: cfgLeDaTabela(), escrita: cfgEscreveNaTabela(),
           opcoes: Object.keys(CFG_REV).length },
    eventos: { leitura: evLeDaTabela(), escrita: evEscreveNaTabela(),
               naTela: ((typeof S !== "undefined" && S.eventos) || []).length,
               jaEnviados: EV_ENVIADOS.size },
    estoque: { leitura: estLeDaTabela(), escrita: estEscreveNaTabela(),
               foto: (typeof S !== "undefined" && S.estoque && S.estoque.fotoId) || null,
               itens: ((typeof S !== "undefined" && S.estoque && S.estoque.itens) || []).length },
  };
}

/* ===========================================================================
   IMPORTAÇÃO · o lote registrado
   ---------------------------------------------------------------------------
   Não muda o que as portas fazem — muda o que fica sabido. O servidor passa a
   guardar qual porta, qual arquivo, o hash dele, o plano e o resultado. E os
   "sumidos" (o que a guarda da v8.48 reteve) vão no plano: importação nunca
   remove sozinha, mas a lista para decisão não pode ficar só na máquina de
   quem importou.
   =========================================================================== */
Object.assign(PX_RPC, { import_planejar: "pcp_import_planejar" });

const impLigado = () => typeof telaFlag === "function" && telaFlag("import_diff");

/* hash do conteúdo, quando o navegador oferece — é o que reconhece o mesmo
   arquivo. Sem `crypto.subtle` (http, navegador antigo), fica sem hash: melhor
   sem do que um hash fraco que faria dois arquivos diferentes parecerem um. */
async function impHash(texto) {
  try {
    if (!texto || !window.crypto || !window.crypto.subtle) return null;
    const b = new TextEncoder().encode(String(texto).slice(0, 5000000));
    const d = await window.crypto.subtle.digest("SHA-256", b);
    return Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, "0")).join("");
  } catch { return null; }
}

async function impPlanejar(loteId, plano) {
  if (!impLigado()) return { status: "desligado" };
  const retidas = typeof cadRemocoesRetidas === "function" ? cadRemocoesRetidas() : [];
  const r = await pxEnviar(obEnfileirar("import_planejar", loteId, {
    p_id: loteId, p_porta: (plano && plano.porta) || (plano && plano.titulo) || "importação",
    p_hash: (plano && plano.hash) || null,
    p_plano: { titulo: (plano && plano.titulo) || null,
               linhas: (plano && plano.linhas) || [],
               sumidos: retidas.map((x) => x.cadastro + ":" + x.id) },
    p_arquivo: (plano && plano.arquivo) || null,
    p_nome: (typeof usuarioAtual === "function" && usuarioAtual()?.nome) || null }));
  if (r && r.ja_importado) {
    try { toast("Atenção: " + r.recado, "erro"); } catch {}
  }
  return r;
}

async function impAplicado(loteId, resultado) {
  if (!impLigado()) return { status: "desligado" };
  const r = await persRpc("pcp_import_aplicado", { p_id: loteId,
    p_resultado: { titulo: (resultado && resultado.titulo) || null,
                   ok: !!(resultado && resultado.ok),
                   linhas: (resultado && resultado.linhas) || [] } });
  return (r && r.corpo) || { status: "falhou" };
}
