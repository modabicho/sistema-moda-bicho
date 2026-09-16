/* ===========================================================================
   src/persistencia/demanda.js · A CAMADA DA DEMANDA, EM MODO ESPELHO
   ---------------------------------------------------------------------------
   Mesmo desenho da camada de Pedidos, sem inventar mecanismo novo: `persRpc`,
   outbox, `operation_id`, revisão esperada e a fusão do registro `SECOES`.

   O QUE MUDA AQUI é o começo: antes de qualquer flag ser ligada, esta camada
   roda em ESPELHO. Ela calcula tudo o que MANDARIA e não manda nada — e anota
   cada diferença entre o que o documento gravou e o que ela teria mandado.

   Foi isto que faltou no cutover de Pedidos: liguei a escrita e descobri os
   defeitos com a fábrica rodando. Aqui a divergência aparece ANTES, com a
   fábrica intocada.

   As duas flags nascem desligadas e este arquivo não liga nenhuma.
   =========================================================================== */

/* ---------------------------------------------------------------------------
   O MAPA · campo do app ↔ coluna do servidor, e a CLASSE de cada campo.
   A classe é o que permite dizer "isto é diferença que importa" — um derivado
   diferente não é falha; um autoral diferente é.
     identidade · quem o registro é. Diferença aqui é grave.
     autoral    · decisão de gente. É o que a fusão disputa.
     derivado   · conta sobre os pedidos. Nunca é conflito, nunca é falha.
     vinculo    · aponta para outro registro.
     carimbo    · data/hora.
   --------------------------------------------------------------------------- */
const DEM_CAMPOS = {
  analise: {
    /* `id` e `numero` NÃO se comparam, e o motivo é a própria migração: no
       documento o id é o inteiro antigo, na tabela é o uuid do servidor, e o
       número só existe do lado novo. Comparar isso daria divergência garantida
       a cada gravação — ruído que afogaria o que importa. O id antigo é a
       CHAVE que casa os dois lados (`extra.id_antigo`), não um campo. */
    id:            { col: "id",            classe: "identidade", so_servidor: true },
    numero:        { col: "numero",        classe: "identidade", so_servidor: true },
    rotulo:        { col: "rotulo",        classe: "autoral" },
    executadaEm:   { col: "executada_em",  classe: "carimbo" },
    novas:         { col: "novas",         classe: "autoral" },
    atualizadas:   { col: "atualizadas",   classe: "autoral" },
    encerradas:    { col: "encerradas",    classe: "autoral" },
    promovidos:    { col: "promovidos",    classe: "autoral" },
  },
  op: {
    id:                  { col: "id",                  classe: "identidade" },
    sku:                 { col: "sku",                 classe: "autoral" },
    processo:            { col: "processo",            classe: "autoral" },
    qtdNecessaria:       { col: "qtd_necessaria",      classe: "autoral" },
    qtdPacote:           { col: "qtd_pacote",          classe: "autoral" },
    prioridade:          { col: "prioridade",          classe: "autoral" },
    prioridadeTravada:   { col: "prioridade_travada",  classe: "autoral" },
    motivoEncerramento:  { col: "motivo_encerramento", classe: "autoral" },
    origem:              { col: "origem",              classe: "autoral" },
    encerradaEm:         { col: "encerrada_em",        classe: "carimbo" },
    /* `criado_em` e `updated_at` são escritos pelo SERVIDOR, não pelo app: o
       objeto da tela nem os carrega. Comparar isso geraria ruído a cada
       gravação e afogaria a divergência que importa. Ficam marcados como
       `so_servidor` e não entram na comparação — mesmo tratamento do derivado. */
    criadoEm:            { col: "criado_em",           classe: "carimbo", so_servidor: true },
    atualizadoEm:        { col: "updated_at",          classe: "carimbo", so_servidor: true },
    /* o vínculo compara RESOLVIDO: o inteiro que o documento aponta contra o
       `id_antigo` da análise para onde a tabela aponta. É a mesma conferência
       que o 103 faz em SQL — comparar inteiro com uuid não diria nada. */
    analiseOrigemId:     { col: "analise_origem_id",   classe: "vinculo", resolve_analise: true },
    analiseAtualId:      { col: "analise_atual_id",    classe: "vinculo", resolve_analise: true },
    /* status é os DOIS: a decisão vai para a tabela, a conta não */
    status:              { col: "status_manual",       classe: "autoral", so_decisao: true },
    qtdProgramada:       { col: null,                  classe: "derivado" },
    qtdProduzida:        { col: null,                  classe: "derivado" },
    saldoSemPedido:      { col: null,                  classe: "derivado" },
  },
  falta: {
    id:          { col: "id",           classe: "identidade" },
    item:        { col: "item",         classe: "autoral" },
    sku:         { col: "sku",          classe: "autoral" },
    fornecedor:  { col: "fornecedor",   classe: "autoral" },
    qtd:         { col: "qtd",          classe: "autoral" },
    unidade:     { col: "unidade",      classe: "autoral" },
    obs:         { col: "obs",          classe: "autoral" },
    status:      { col: "status",       classe: "autoral" },
    anotadaEm:   { col: "anotada_em",   classe: "carimbo" },
    compradaEm:  { col: "comprada_em",  classe: "carimbo" },
    recebidaEm:  { col: "recebida_em",  classe: "carimbo" },
    pedidoIds:   { col: "pedido_ids",   classe: "vinculo" },
  },
};

/* só `cancelada` e `encerrada` são decisão; o resto é conta sobre os pedidos */
const DEM_STATUS_DECISAO = ["cancelada", "encerrada"];

/* ---------------------------------------------------------------------------
   AS TOLERÂNCIAS DO COMPARADOR · v8.36
   ---------------------------------------------------------------------------
   As 156 divergências medidas em produção não eram dado errado: eram o
   comparador comparando coisas que a migração NORMALIZOU. Duas formas, e as
   duas com regra estreita — alargar demais seria calar o espelho, que é
   exatamente o contrário do que ele existe para fazer.

     `prioridadeTravada` · a coluna é `not null default false`. Onde o legado
        não tem valor nenhum, `null`/ausente e `false` são a MESMA coisa. Mas
        `true` no documento contra `false` na tabela continua sendo divergência,
        e `null` no documento contra `true` na tabela também — alguém travou.

     `origem` · o 102 grava `coalesce(nullif(origem,''), 'migracao')`. Quando a
        linha VEIO DA MIGRAÇÃO e o documento não tem origem, `"migracao"` na
        tabela é proveniência, não autoria. Qualquer outro par de valores
        continua autoral: OP nova ou editada com origem diferente do esperado
        ainda aparece, e aparece como falha.

   Cada função devolve:
     "igual"        → não é divergência nenhuma, some;
     "<classe>"     → é divergência, mas desta classe (fica à vista, não bloqueia);
     null           → segue a regra normal do campo.
   --------------------------------------------------------------------------- */
const DEM_SEM_VALOR = (v) => v === null || v === undefined || v === "";

function demVeioDaMigracao(linha) {
  if (!linha) return false;
  if (linha.migrado_em) return true;
  return !!(linha.extra && linha.extra.migrada === true);
}

const DEM_TOLERANCIAS = {
  op: {
    prioridadeTravada(noDoc, naCamada) {
      /* só quando o legado NÃO tem valor explícito */
      if (DEM_SEM_VALOR(noDoc) && naCamada === false) return "igual";
      return null;
    },
    origem(noDoc, naCamada, linhaTabela) {
      if (DEM_SEM_VALOR(noDoc) && naCamada === "migracao" && demVeioDaMigracao(linhaTabela)) {
        return "proveniencia";
      }
      return null;
    },
  },
};

function demClasseDe(entidade, campo) {
  const c = (DEM_CAMPOS[entidade] || {})[campo];
  return c ? c.classe : "autoral";      /* campo que eu não conheço é tratado
                                           como autoral: errar para o lado de
                                           avisar demais, nunca de menos */
}

/* o objeto da tela virado em linha do servidor, só com o que vai para a tabela */
function demParaServidor(entidade, obj) {
  const mapa = DEM_CAMPOS[entidade] || {};
  const linha = {}; const recusados = [];
  for (const campo of Object.keys(obj || {})) {
    const c = mapa[campo];
    if (!c) { recusados.push(campo); continue; }
    if (!c.col || c.so_servidor) continue;      /* derivado e carimbo de
                                                   servidor não viajam */
    let v = obj[campo];
    if (c.so_decisao) v = DEM_STATUS_DECISAO.includes(v) ? v : null;
    linha[c.col] = v === undefined ? null : v;
  }
  return { linha, recusados };
}

function demParaApp(entidade, linha) {
  const mapa = DEM_CAMPOS[entidade] || {};
  const obj = {};
  for (const campo of Object.keys(mapa)) {
    const col = mapa[campo].col;
    if (col && linha && linha[col] !== undefined) obj[campo] = linha[col];
  }
  return obj;
}

/* ---------------------------------------------------------------------------
   AS CHAMADAS · o contrato é o mesmo dos pedidos, então a outbox e o
   `pxEnviar` da camada de Pedidos servem sem mudança.
   --------------------------------------------------------------------------- */
const DEM_COLS_OP = "id,sku,processo,qtd_necessaria,qtd_pacote,prioridade,"
  + "prioridade_travada,status_manual,motivo_encerramento,encerrada_em,"
  + "analise_origem_id,analise_atual_id,origem,extra,criado_em,updated_at,revision,migrado_em";
const DEM_COLS_FALTA = "id,item,sku,fornecedor,qtd,unidade,obs,status,anotada_em,"
  + "comprada_em,recebida_em,pedido_ids,atualizado_em,extra,revision";
const DEM_COLS_ANALISE = "id,ciclo,numero,rotulo,executada_em,novas,atualizadas,"
  + "encerradas,promovidos,extra,revision";

async function dmListar() {
  const [o, f, a] = await Promise.all([
    persLer(`pcp_op?select=${DEM_COLS_OP}&order=id`),
    persLer(`pcp_falta?select=${DEM_COLS_FALTA}&order=id`),
    persLer(`pcp_analise?select=${DEM_COLS_ANALISE}&order=numero`),
  ]);
  if (!o.ok) return pxResposta(o, "listar-op");
  if (!f.ok) return pxResposta(f, "listar-falta");
  if (!a.ok) return pxResposta(a, "listar-analise");
  return { status: "ok",
    ops: persLista(o.corpo), faltas: persLista(f.corpo), analises: persLista(a.corpo) };
}

/* ---------------------------------------------------------------------------
   v8.32 · AS ESCRITAS · dormentes.
   Nenhuma tela chama isto ainda: o caminho da Demanda só ganha escrita quando
   `demanda_linha_escrita` for ligada e a tela passar a chamá-las. Elas existem
   agora para que a bateria multiusuário meça O APP, e não um pedaço de código
   escrito dentro do teste — foi assim que a bancada já se enganou quatro vezes.

   Não há checagem de flag AQUI de propósito, pelo mesmo desenho dos pedidos:
   quem decide ligar é a tela, não a camada. A prova de que nada escreve hoje é
   que ninguém as chama — e a bateria confere isso lendo o app inteiro.
   --------------------------------------------------------------------------- */
Object.assign(PX_RPC, {
  analise_criar: "pcp_analise_criar",
  op_criar:      "pcp_op_criar",
  op_patch:      "pcp_op_patch",
  falta_criar:   "pcp_falta_criar",
  falta_patch:   "pcp_falta_patch",
  falta_apagar:  "pcp_falta_apagar",
  op_cancelar:   "pcp_op_cancelar",
  op_apagar:     "pcp_op_apagar",
  op_lote_remover: "pcp_op_lote_remover",
});

/* A análise não tem id do cliente: quem dá o id e o número é o servidor. Duas
   pessoas analisando ao mesmo tempo não têm como colidir porque nenhuma das
   duas escolhe o número. */
async function dmAnaliseCriar(rotulo, resumo) {
  return pxEnviar(obEnfileirar("analise_criar", null, {
    p_rotulo: String(rotulo || "").trim(), p_resumo: resumo || {} }));
}

/* ---------------------------------------------------------------------------
   O TETO DE 500 DO SERVIDOR (v8.80)
   ---------------------------------------------------------------------------
   `pcp_op_criar` recusa mais de 500 itens numa chamada só — está escrito na
   função, e a bancada mediu: com 800 necessidades novas a resposta é
   `{"status":"invalido","motivo":"mais de 500 numa chamada só"}` e a tabela
   fica com ZERO linhas. Não era lentidão: era perda de gravação, em silêncio,
   na primeira vez que 800 necessidades novas aparecessem juntas.

   Agora a lista é partida em blocos de 400 — folga de 100 sobre o teto — e
   cada bloco vai com o seu próprio `p_operation_id`, o que mantém a
   idempotência bloco a bloco. Um bloco que falha NÃO é dado por bom: a
   resposta final carrega o problema, e os blocos que passaram continuam com os
   seus `criados` para a foto ser guardada.
   --------------------------------------------------------------------------- */
const DEM_BLOCO_MAX = 400;
async function dmEnviarEmBlocos(linhas, enviaBloco) {
  const lista = linhas || [];
  if (lista.length <= DEM_BLOCO_MAX) return enviaBloco(lista);
  const criados = []; const parciais = []; let ruim = null;
  for (let i = 0; i < lista.length; i += DEM_BLOCO_MAX) {
    const r = await enviaBloco(lista.slice(i, i + DEM_BLOCO_MAX));
    parciais.push({ de: i, ate: Math.min(i + DEM_BLOCO_MAX, lista.length) - 1,
      status: (r && r.status) || "sem-resposta", motivo: r && r.motivo });
    for (const l of ((r && r.criados) || [])) criados.push(l);
    if (!r || r.status !== "ok") ruim = ruim || r || { status: "sem-resposta" };
  }
  if (ruim) return Object.assign({}, ruim, { criados, blocos: parciais.length, parciais });
  return { status: "ok", criados, blocos: parciais.length, parciais };
}

async function dmOpCriar(ops) {
  const linhas = []; const recusados = [];
  for (const o of (ops || [])) {
    const r = demParaServidor("op", o);
    if (r.recusados.length) recusados.push({ id: o && o.id, campos: r.recusados });
    linhas.push(r.linha);
  }
  if (recusados.length) return { status: "invalido", campos_desconhecidos: recusados };
  return dmEnviarEmBlocos(linhas, (bloco) => pxEnviar(obEnfileirar("op_criar", null, { p_ops: bloco })));
}

async function dmFaltaCriar(faltas) {
  const linhas = []; const recusados = [];
  for (const f of (faltas || [])) {
    const r = demParaServidor("falta", f);
    if (r.recusados.length) recusados.push({ id: f && f.id, campos: r.recusados });
    linhas.push(r.linha);
  }
  if (recusados.length) return { status: "invalido", campos_desconhecidos: recusados };
  return dmEnviarEmBlocos(linhas, (bloco) => pxEnviar(obEnfileirar("falta_criar", null, { p_faltas: bloco })));
}

/* O patch, com a MESMA regra de conflito dos pedidos: campo que só eu mexi
   segue sozinho; mesmo campo com valores diferentes vira conflito explícito,
   com os três valores. `base` é o registro como estava quando esta tela
   começou a editar — sem ele não dá para separar "eu mexi" de "ela mexeu". */
async function dmPatch(entidade, id, revisao, mudancas, base) {
  const tipo = entidade === "op" ? "op_patch" : "falta_patch";
  const { linha, recusados } = demParaServidor(entidade, mudancas || {});
  if (recusados.length) return { status: "invalido", campos_desconhecidos: recusados };
  if (!Object.keys(linha).length) return { status: "invalido", motivo: "patch vazio" };

  const acao = obEnfileirar(tipo, id, {
    p_id: id, p_expected_revision: revisao, p_patch: linha });
  const r = await pxEnviar(acao);
  if (r.status !== "conflito" || !r.registro) return r;

  /* conflito: dá para juntar? */
  const b = base ? demParaServidor(entidade, base).linha : {};
  const v = mgClassificar(b, linha, r.registro);
  if (v.nadaAFazer) return { status: "ok", nadaAFazer: true, registro: r.registro, revision: r.registro.revision };
  if (!v.podeSozinho) {
    return { status: "conflito-de-campo", disputados: v.disputados,
             registro: r.registro, revision: r.registro.revision };
  }
  /* campos que não se cruzam: reenvia com a revisão do servidor e id NOVO,
     porque a base mudou debaixo da intenção — é outra intenção. */
  const nova = obNovaIntencao(acao, Object.assign({}, acao.dados, {
    p_expected_revision: r.registro.revision, p_patch: v.automatico }));
  const r2 = await pxEnviar(nova);
  return Object.assign({}, r2, { fundido: true, reenviada: nova.opId, juntou: Object.keys(v.automatico) });
}

function dmOpPatch(id, revisao, mudancas, base) { return dmPatch("op", id, revisao, mudancas, base); }
function dmFaltaPatch(id, revisao, mudancas, base) { return dmPatch("falta", id, revisao, mudancas, base); }
function dmFaltaApagar(id, revisao) {
  return pxEnviar(obEnfileirar("falta_apagar", id, { p_id: id, p_expected_revision: revisao }));
}

/* ---------------------------------------------------------------------------
   v8.34 · TIRAR UMA OP DE OPERAÇÃO
   ---------------------------------------------------------------------------
   Medido na sonda: a tela de hoje deixa excluir um produto que só tem pedido
   CONCLUÍDO, a OP some, e o pedido concluído fica apontando para uma OP que
   não existe mais. Num documento isso passa; numa tabela com `op_id` isso é
   perder o rastro do que já foi produzido.

   Por isso a tela NÃO escolhe entre apagar e cancelar. Ela pede o apagar, e
   QUEM DECIDE É O SERVIDOR: se houver pedido, análise, histórico ou revisão
   acima de 1, ele recusa dizendo o motivo, e aí — e só aí — a camada cancela.
   Assim não existe caminho em que um dado com uso suma fisicamente, nem que
   dependa de a tela ter lembrado de conferir.
   --------------------------------------------------------------------------- */
function dmOpVinculos(id) { return persRpc("pcp_op_vinculos", { p_id: id }); }

/* ---------------------------------------------------------------------------
   v8.35 · O LOTE · uma pergunta só, com os números do SERVIDOR.
   Quando muitas OPs somem de uma vez — exclusão de produtos, limpeza em massa
   — a camada NÃO manda nada. Ela para, pede a prévia ao banco e devolve à tela
   para a pessoa ver os números e decidir. Contar no cliente seria contar pela
   cópia que a tela tem na mão, que pode estar velha, e é esse número que
   autoriza a ação.
   --------------------------------------------------------------------------- */
const DEM_LOTE_MINIMO = 2;         /* uma OP só é ação individual, não lote */
let DEM_LOTE = null;               /* { ids, motivo, previa } enquanto espera */

function dmLotePrevia(ids) { return persRpc("pcp_op_lote_previa", { p_ids: ids }); }
function dmLoteRemover(ids, motivo) {
  return pxEnviar(obEnfileirar("op_lote_remover", null, {
    p_ids: ids, p_motivo: motivo || "limpeza em massa" }));
}

function demLotePendente() { return DEM_LOTE; }

/* Cancelar é cancelar: larga tudo e não manda nada. */
function demLoteDescartar() {
  const n = DEM_LOTE ? DEM_LOTE.ids.length : 0;
  DEM_LOTE = null;
  return n;
}

async function demLoteExecutar() {
  const lote = DEM_LOTE; DEM_LOTE = null;
  if (!lote || !lote.ids.length) return { status: "nada" };
  const r = await dmLoteRemover(lote.ids, lote.motivo);
  if (r && r.status === "ok") {
    for (const id of ((r.ids && r.ids.apagadas) || [])) DEM_FOTO.op.delete(String(id));
    /* canceladas continuam existindo na tabela: a foto tem de continuar
       conhecendo-as, senão a próxima gravação as trataria como novas */
    const rl = await dmListar();
    if (rl.status === "ok") for (const o of rl.ops) demGuardarFoto("op", o);
  }
  DEM_ULTIMO_LOTE = r;
  return r;
}
let DEM_ULTIMO_LOTE = null;
function demUltimoLote() { return DEM_ULTIMO_LOTE; }

function dmOpCancelar(id, revisao, motivo) {
  return pxEnviar(obEnfileirar("op_cancelar", id, {
    p_id: id, p_expected_revision: revisao, p_motivo: motivo || null }));
}

async function dmOpRemover(id, revisao, motivo) {
  const r = await pxEnviar(obEnfileirar("op_apagar", id, {
    p_id: id, p_expected_revision: revisao }));
  if (r && r.status === "ok") {
    return Object.assign({}, r, { caminho: "apagada" });
  }
  if (r && r.status === "recusado") {
    const c = await dmOpCancelar(id, revisao, motivo || r.motivo);
    return Object.assign({}, c, { caminho: "cancelada", recusaDoApagar: r.motivo });
  }
  return Object.assign({}, r, { caminho: "nenhum" });
}

/* ---------------------------------------------------------------------------
   O ESPELHO · calcula o que mandaria, e não manda.
   Cada divergência sai com entidade, id, campo, os dois valores, a CLASSE, a
   hora e a intenção — para dar para separar "defeito da camada" de "coisa que
   nem devia ser comparada".
   --------------------------------------------------------------------------- */
const DEM_ESPELHO_CHAVE = "pcp5:espelho-demanda";
const DEM_ESPELHO_MAX = 2000;

/* ---------------------------------------------------------------------------
   O ESPELHO ACUMULA EM MEMÓRIA E GRAVA UMA VEZ SÓ (v8.61)
   ---------------------------------------------------------------------------
   `demAnotar` lia o espelho INTEIRO do localStorage, dava `JSON.parse`,
   acrescentava UM registro, fazia `JSON.stringify` do array todo e gravava de
   volta. E era chamada de dentro do laço de comparação, uma vez por
   divergência.

   O custo é quadrático, e medido, num único salvamento de pedido:

       demAnotar ................. 2.201 chamadas
       localStorage.setItem ...... 2.226 vezes · 3.323 ms
       localStorage.getItem ...... 2.295 vezes ·   990 ms
       bytes gravados ............ 433,2 MB
       bloco síncrono ............ ~11 s

   `localStorage` é SÍNCRONO: cada uma daquelas 2.226 escritas parava a página.
   Salvar um pedido gravava 433 megabytes.

   Agora a lista vive em memória durante a comparação e é persistida UMA vez, no
   `finally` de quem comparou. O conteúdo final é o mesmo — a mesma sequência de
   registros, o mesmo teto de 2.000 — e o espelho continua sendo o que sempre
   foi: diagnóstico da migração, nunca fonte operacional.
   --------------------------------------------------------------------------- */
let DEM_ESPELHO_MEM = null;      /* null = ainda não li do localStorage */
let DEM_ESPELHO_SUJO = false;    /* há anotação nova que ainda não foi gravada */

function demEspelhoLer() {
  if (DEM_ESPELHO_MEM) return DEM_ESPELHO_MEM;
  try { const v = JSON.parse(localStorage.getItem(DEM_ESPELHO_CHAVE) || "[]");
    DEM_ESPELHO_MEM = Array.isArray(v) ? v : []; } catch { DEM_ESPELHO_MEM = []; }
  return DEM_ESPELHO_MEM;
}
function demEspelhoGravar(l) {
  DEM_ESPELHO_MEM = Array.isArray(l) ? l : [];
  DEM_ESPELHO_SUJO = true;
  return demEspelhoDescarregar();
}
/* A ÚNICA ida ao localStorage. Só grava se houve anotação nova. */
function demEspelhoDescarregar() {
  if (!DEM_ESPELHO_SUJO) return false;
  DEM_ESPELHO_SUJO = false;
  try { localStorage.setItem(DEM_ESPELHO_CHAVE, JSON.stringify((DEM_ESPELHO_MEM || []).slice(-DEM_ESPELHO_MAX))); }
  catch { /* cota cheia: o espelho é diagnóstico, não pode derrubar gravação */ }
  return true;
}
function demEspelhoLimpar() {
  DEM_ESPELHO_MEM = []; DEM_ESPELHO_SUJO = false;
  try { localStorage.removeItem(DEM_ESPELHO_CHAVE); } catch {}
}

function demAnotar(reg) {
  const l = demEspelhoLer();
  l.push(Object.assign({ quando: new Date().toISOString() }, reg));
  /* o teto é aplicado aqui também, e não só na gravação: guardar em memória o
     que de qualquer forma seria descartado no fim é só ocupar espaço. O
     conteúdo final é idêntico ao do `slice(-MAX)` de antes. */
  while (l.length > DEM_ESPELHO_MAX) l.shift();
  DEM_ESPELHO_SUJO = true;
  return reg;
}

/* compara UM registro do documento com a linha da tabela, campo a campo */
function demCompararRegistro(entidade, doDocumento, daTabela, operationId, porUuid) {
  const mapa = DEM_CAMPOS[entidade] || {};
  const achados = [];
  const id = (doDocumento && doDocumento.id) || (daTabela && daTabela.id) || "(sem id)";
  for (const campo of Object.keys(mapa)) {
    const c = mapa[campo];
    if (!c.col || c.so_servidor) continue;    /* derivado e carimbo de servidor
                                                 nem chegam a ser comparados */
    let noDoc = doDocumento ? doDocumento[campo] : undefined;
    if (c.so_decisao) noDoc = DEM_STATUS_DECISAO.includes(noDoc) ? noDoc : null;
    let naCamada = daTabela ? daTabela[c.col] : undefined;
    if (c.resolve_analise && naCamada != null && porUuid) {
      /* o uuid da tabela vira o id antigo, que é o que o documento guarda */
      const a = porUuid.get(String(naCamada));
      naCamada = a && a.extra && a.extra.id_antigo != null
        ? (isNaN(Number(a.extra.id_antigo)) ? a.extra.id_antigo : Number(a.extra.id_antigo))
        : naCamada;
    }
    /* CARIMBO se compara como INSTANTE, não como texto. O app escreve
       `2026-08-01T10:00:00.000Z` e o Postgres devolve `2026-08-01T10:00:00+00:00`
       — o mesmo momento, escrito diferente. Comparar as strings encheria o
       espelho de divergência falsa e afogaria a de verdade. */
    let igual;
    if (c.classe === "carimbo") {
      const ta = noDoc == null ? null : Date.parse(noDoc);
      const tb = naCamada == null ? null : Date.parse(naCamada);
      igual = (ta === tb) || (Number.isNaN(ta) && Number.isNaN(tb));
    } else {
      igual = JSON.stringify(noDoc === undefined ? null : noDoc)
           === JSON.stringify(naCamada === undefined ? null : naCamada);
    }
    let classe = c.classe;
    if (!igual) {
      const tol = (DEM_TOLERANCIAS[entidade] || {})[campo];
      if (tol) {
        const veredito = tol(noDoc, naCamada, daTabela, doDocumento);
        if (veredito === "igual") continue;
        if (veredito) classe = veredito;
      }
    }
    if (igual) continue;
    achados.push(demAnotar({ entidade, id, campo, coluna: c.col,
      valorDocumento: noDoc === undefined ? null : noDoc,
      valorCamada: naCamada === undefined ? null : naCamada,
      classificacao: classe, operationId: operationId || null }));
  }
  return achados;
}

/* ---------------------------------------------------------------------------
   `demEspelhar` roda em TODA gravação, com as flags desligadas. Ela lê a
   tabela, compara com o que está na tela (que é o que o documento acabou de
   gravar) e anota. Nunca lança: quem chama está no caminho de gravação.
   --------------------------------------------------------------------------- */
let DEM_ESPELHANDO = false;
async function demEspelhar(secoes) {
  if (DEM_ESPELHANDO) return null;                      /* uma por vez */
  const mexeu = !secoes || !secoes.length || secoes.includes("nucleo");
  if (!mexeu) return null;
  if (typeof persToken !== "function" || !persToken()) return null;
  DEM_ESPELHANDO = true;
  try {
    const r = await dmListar();
    if (r.status !== "ok") return { status: r.status };
    const porId = (l) => { const m = new Map(); for (const x of l) m.set(String(x.id), x); return m; };
    const tabOps = porId(r.ops), tabFaltas = porId(r.faltas);
    /* Análises casam pelo `id_antigo` — na tela elas ainda são os inteiros do
       documento. Mas uma análise NASCIDA na camada nova não tem id_antigo: o id
       dela é o próprio uuid, e é esse uuid que a tela passa a carregar. Parear
       só pelo id_antigo fazia o espelho gritar `identidade` para toda análise
       nova, que é justamente o caso que a bateria de concorrência produz. */
    const tabAnalises = new Map(); const analisePorUuid = new Map();
    for (const a of r.analises) {
      analisePorUuid.set(String(a.id), a);
      const antigo = a.extra && a.extra.id_antigo;
      if (antigo != null) tabAnalises.set(String(antigo), a);
      if (!tabAnalises.has(String(a.id))) tabAnalises.set(String(a.id), a);
    }

    const achados = [];
    for (const o of (typeof S !== "undefined" ? S.ops : []) || []) {
      if (!o || !o.id) continue;
      const t = tabOps.get(String(o.id));
      if (!t) { achados.push(demAnotar({ entidade: "op", id: o.id, campo: "(o registro)",
        valorDocumento: o.sku || "(sem sku)", valorCamada: null,
        classificacao: "identidade", operationId: null })); continue; }
      for (const x of demCompararRegistro("op", o, t, null, analisePorUuid)) achados.push(x);
    }
    for (const f of (typeof S !== "undefined" ? S.faltas : []) || []) {
      if (!f || !f.id) continue;
      const t = tabFaltas.get(String(f.id));
      if (!t) { achados.push(demAnotar({ entidade: "falta", id: f.id, campo: "(o registro)",
        valorDocumento: f.item || "(sem item)", valorCamada: null,
        classificacao: "identidade", operationId: null })); continue; }
      for (const x of demCompararRegistro("falta", f, t)) achados.push(x);
    }
    for (const a of (typeof S !== "undefined" ? S.analises : []) || []) {
      if (!a || a.id == null) continue;
      const t = tabAnalises.get(String(a.id));
      if (!t) { achados.push(demAnotar({ entidade: "analise", id: a.id, campo: "(o registro)",
        valorDocumento: a.rotulo || "(sem rótulo)", valorCamada: null,
        classificacao: "identidade", operationId: null })); continue; }
      for (const x of demCompararRegistro("analise", a, t)) achados.push(x);
    }
    return { status: "ok", divergencias: achados.length,
      autorais: achados.filter((x) => x.classificacao === "autoral").length };
  } catch (e) {
    console.error("espelho da demanda:", e);
    return { status: "erro", msg: String(e && e.message || e) };
  } finally {
    /* A GRAVAÇÃO, UMA VEZ SÓ, no fim de toda a comparação — e no `finally`,
       para que uma exceção no meio não perca o que já foi anotado. */
    demEspelhoDescarregar();
    DEM_ESPELHANDO = false;
  }
}

/* ---------------------------------------------------------------------------
   O PLACAR DO ESPELHO · é isto que decide se dá para ligar a leitura.
   Derivado diferente NÃO conta como falha: ele nem chega a ser comparado, e se
   chegasse seria por engano meu. Fica separado no placar, à vista.
   --------------------------------------------------------------------------- */
function demEspelhoPlacar() {
  const l = demEspelhoLer();
  const por = (k) => l.filter((x) => x.classificacao === k).length;
  const desde = l.length ? l[0].quando : null;
  return {
    total: l.length, desde, ate: l.length ? l[l.length - 1].quando : null,
    autoral: por("autoral"), identidade: por("identidade"),
    vinculo: por("vinculo"), carimbo: por("carimbo"), derivado: por("derivado"),
    /* proveniência fica À VISTA e não bloqueia: é a marca de "esta linha veio
       da migração", que o documento por definição não tem como ter. */
    proveniencia: por("proveniencia"),
    /* a condição que você definiu, calculada e não opinada */
    podeLigarLeitura: por("autoral") === 0 && por("identidade") === 0,
    porque: por("autoral") || por("identidade")
      ? "há divergência autoral ou de identidade — ver `demEspelhoLista()`"
      : "sem divergência autoral nem de identidade",
  };
}
function demEspelhoLista(quantas) {
  return demEspelhoLer().slice(-(quantas || 50));
}

/* ===========================================================================
   v8.33 · A TELA LIGADA NA CAMADA NOVA
   ---------------------------------------------------------------------------
   Aqui não se espalha chamada de RPC por catorze lugares da tela. É o mesmo
   desenho já validado em Pedidos: a camada FOTOGRAFA o que leu, e a cada
   gravação compara a foto com o que está na tela. Cada diferença vira uma
   intenção, e cada intenção sabe qual RPC é a sua.

   A razão de ser assim, e não "chamar dmOpPatch dentro do botão": a Demanda
   tem 14 ações que mexem em `analises`, `ops` ou `faltas` (o mapa está em
   testes/MAPA-DEMANDA.txt). Sair colocando chamada em cada uma é garantir que
   alguma fique de fora e ninguém perceba — foi exatamente assim que a criação
   de pedido ficou dependendo do modal legado até a v8.28. A diferença por
   registro pega TODAS, inclusive as que eu esquecer de mapear.

   Com `demanda_linha_escrita` desligada nada disto roda: `demRegistrarIntencoes`
   devolve lista vazia na primeira linha, e o documento legado continua sendo
   escrito do mesmo jeito. É o estado padrão.
   =========================================================================== */
function demEscreveNaTabela() {
  return typeof telaFlag === "function" && telaFlag("demanda_linha_escrita");
}
function demLeDaTabela() {
  return typeof telaFlag === "function" && telaFlag("demanda_linha_leitura");
}

/* A foto: id → { linha, revision }. É contra ela que a diferença é tirada. */
const DEM_FOTO = { analise: new Map(), op: new Map(), falta: new Map() };

function demGuardarFoto(entidade, linha) {
  if (!linha || linha.id == null) return;
  const chave = entidade === "analise"
    ? String((linha.extra && linha.extra.id_antigo) != null ? linha.extra.id_antigo : linha.id)
    : String(linha.id);
  DEM_FOTO[entidade].set(chave, { linha: Object.assign({}, linha), revision: linha.revision });
}

/* ===========================================================================
   v8.74 · P7 · A RECONCILIAÇÃO DAS OPs
   ---------------------------------------------------------------------------
   `DEM_FOTO.op` vem da TABELA (`dmListar`). `S.ops` vem do DOCUMENTO
   (`boot.js`, e de novo a cada sincronia periódica). São duas fontes, e nada
   as juntava — só os PEDIDOS ganharam reconciliação.

   Medido: tabela com 6 OPs, documento com 2, e a primeira gravação nascia com
   quatro `{acao:"remover"}` e o popup "Tirar 4 necessidades da operação", sem
   ninguém ter pedido nada.

   Isto junta os dois lados com a MESMA regra de `telaReconciliarPedidos`:
   a tabela manda nos campos que ela tem, o que só existe na tela permanece, e
   nada é apagado por ausência.
   =========================================================================== */
function demReconciliarOps(linhas) {
  if (!Array.isArray(linhas)) return { status: "sem-linhas" };
  if (typeof S === "undefined") return { status: "sem-tela" };
  const naTela = (S.ops || []);
  const meus = new Map();
  for (const o of naTela) if (o && o.id != null) meus.set(String(o.id), o);

  const junto = [];
  for (const l of linhas) {
    if (!l || l.id == null) continue;
    const app = demParaApp("op", l);
    app.id = l.id;
    const meu = meus.get(String(l.id));
    meus.delete(String(l.id));
    if (!meu) { junto.push(app); continue; }
    /* a tabela manda nos campos que ela tem; o que só existe no documento
       (contas derivadas, marcas de tela) continua no objeto */
    const misto = Object.assign({}, meu);
    for (const k of Object.keys(app)) if (app[k] !== undefined) misto[k] = app[k];
    junto.push(misto);
  }
  /* o que só existe na tela FICA. Nunca some por ausência na fonte. */
  const soNaTela = [];
  for (const o of naTela) if (o && o.id != null && meus.has(String(o.id))) { junto.push(o); soNaTela.push(String(o.id)); }

  S.ops = junto;
  if (typeof recalcularOP === "function") { try { S.ops.forEach(recalcularOP); } catch (e) {} }
  return { status: "ok", quantos: junto.length, daTabela: linhas.length, soNaTela };
}

/* Lê as três tabelas UMA vez, refaz a foto E junta as OPs com a tela. É o que
   a abertura passa a chamar no lugar de `demMarcarBase`. */
async function demReconciliar() {
  const r = await dmListar();
  if (r.status !== "ok") return { status: r.status };
  for (const m of Object.values(DEM_FOTO)) m.clear();
  for (const a of r.analises) demGuardarFoto("analise", a);
  for (const o of r.ops) demGuardarFoto("op", o);
  for (const f of r.faltas) demGuardarFoto("falta", f);
  const juntou = demReconciliarOps(r.ops);
  return { status: "ok",
    analises: DEM_FOTO.analise.size, ops: DEM_FOTO.op.size, faltas: DEM_FOTO.falta.size,
    juntou };
}

/* ===========================================================================
   v8.74 · P7 · A DECLARAÇÃO, E A GUARDA
   ---------------------------------------------------------------------------
   O mesmo desenho que os CADASTROS já usam desde a v8.50, e que a Demanda
   nunca ganhou. O comentário de lá diz a regra em uma frase:

     "as portas trocam listas inteiras, e lista trocada não é gente apagando
      cadastro"

   Aqui vale igual para necessidade de operação. Duas camadas:

     1 · DECLARAÇÃO · remover deixa de ser DEDUZIDO da ausência. Só os caminhos
         em que a pessoa pediu — excluir produto, limpeza em lote, zerar a base
         — escrevem em `DEM_REMOVIDAS`. `demRegistrarIntencoes` só emite
         `{acao:"remover"}` para id declarado.
         É o mesmo idioma do `nucleoAutorizarListaVazia` dos pedidos: a ação
         diz em voz alta o que fez, em vez de deixar a camada adivinhar.

     2 · RETENÇÃO · o que sumiu SEM declaração não vira remoção e não some em
         silêncio: fica guardado em `pcp5:dem-remocoes-retidas`, visível por
         `demRemocoesRetidas()`, com um aviso no console.

   O popup `limpezaOps` NÃO muda: ele continua abrindo para duas ou mais
   remoções DECLARADAS, com a prévia vinda do banco.
   =========================================================================== */
let DEM_IMPORTANDO = 0;
function demImportando() { return DEM_IMPORTANDO > 0; }
/* Envolve qualquer troca de lista inteira: importação, restauração de ponto,
   migração. Dentro daqui, ausência NUNCA é remoção. */
async function demDuranteTrocaDeListas(f) {
  DEM_IMPORTANDO++;
  try { return await f(); } finally { DEM_IMPORTANDO = Math.max(0, DEM_IMPORTANDO - 1); }
}

const DEM_REMOCAO_MAX = 3;
const DEM_REMOCAO_FRACAO = 0.1;
const DEM_RETIDAS_CHAVE = "pcp5:dem-remocoes-retidas";

/* A DECLARAÇÃO: id → motivo. Consumida quando a intenção é emitida. */
const DEM_REMOVIDAS = new Map();

function demDeclararRemocao(ids, motivo) {
  const lista = Array.isArray(ids) ? ids : [ids];
  let n = 0;
  for (const id of lista) {
    if (id == null || id === "") continue;
    DEM_REMOVIDAS.set(String(id), String(motivo || "removida pela pessoa"));
    n++;
  }
  return n;
}
/* Quantas estão declaradas agora — para a bancada e para o console. */
function demRemocoesDeclaradas() { return [...DEM_REMOVIDAS.entries()].map(([id, motivo]) => ({ id, motivo })); }
function demLimparDeclaracoes() { const n = DEM_REMOVIDAS.size; DEM_REMOVIDAS.clear(); return n; }

function demRetidasLer() {
  try { const v = JSON.parse(localStorage.getItem(DEM_RETIDAS_CHAVE) || "[]");
    return Array.isArray(v) ? v : []; } catch { return []; }
}
function demRetidasGravar(l) {
  try { localStorage.setItem(DEM_RETIDAS_CHAVE, JSON.stringify(l.slice(-500))); } catch {}
}
function demRemocoesRetidas() { return demRetidasLer(); }
function demRetidasLimpar() {
  try { localStorage.removeItem(DEM_RETIDAS_CHAVE); } catch {}
  return { status: "ok" };
}
function demReterRemocoes(sumidas, motivo) {
  const l = demRetidasLer();
  const quando = new Date().toISOString();
  for (const [id, foto] of sumidas) {
    l.push({ quando, entidade: "op", id, motivo,
      rotulo: (foto && foto.linha && (foto.linha.sku || foto.linha.processo)) || String(id) });
  }
  demRetidasGravar(l);
  console.warn("[demanda] " + sumidas.length + " remoção(ões) de necessidade foram RETIDAS ("
    + motivo + "). Veja `demRemocoesRetidas()`.");
  return sumidas.length;
}

/* Chamada depois de LER as tabelas. Sem isto toda alteração viraria criação. */
async function demMarcarBase() {
  const r = await dmListar();
  if (r.status !== "ok") return { status: r.status };
  for (const m of Object.values(DEM_FOTO)) m.clear();
  for (const a of r.analises) demGuardarFoto("analise", a);
  for (const o of r.ops) demGuardarFoto("op", o);
  for (const f of r.faltas) demGuardarFoto("falta", f);
  return { status: "ok",
    analises: DEM_FOTO.analise.size, ops: DEM_FOTO.op.size, faltas: DEM_FOTO.falta.size };
}

/* O VÍNCULO DA ANÁLISE · na tela ela é o inteiro do documento; na tabela é
   uuid. Mandar o inteiro dava `invalid input syntax for type uuid: "1"` e a OP
   não nascia — a bateria de roteamento pegou isso na primeira rodada. A
   tradução acontece na HORA DO ENVIO, e não no registro, porque a análise pode
   ter acabado de nascer na mesma gravação: o uuid só existe depois dela. */
function demUuidDaAnalise(id) {
  if (id == null || id === "") return null;
  const f = DEM_FOTO.analise.get(String(id));
  if (f && f.linha && f.linha.id) return f.linha.id;
  /* já é uuid? então é uma análise nascida na camada nova */
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))
    ? String(id) : null;
}
function demTraduzirVinculos(obj) {
  if (!obj) return obj;
  const o = Object.assign({}, obj);
  if ("analiseOrigemId" in o) o.analiseOrigemId = demUuidDaAnalise(o.analiseOrigemId);
  if ("analiseAtualId" in o) o.analiseAtualId = demUuidDaAnalise(o.analiseAtualId);
  return o;
}

/* Do nome da coluna de volta para o nome do campo na tela. */
function demCampoDaColuna(entidade, col) {
  const mapa = DEM_CAMPOS[entidade] || {};
  for (const campo of Object.keys(mapa)) if (mapa[campo].col === col) return campo;
  return null;
}

/* A diferença de UM registro contra a foto, só em campos AUTORAIS. Derivado
   nunca entra: ele se refaz sozinho no cliente e viraria briga do nada.
   Devolve os CAMPOS DA TELA que mudaram — é isso que o envio remonta. */
function demDiferenca(entidade, obj) {
  const { linha } = demParaServidor(entidade, demTraduzirVinculos(obj) || {});
  const chave = String(obj && obj.id);
  const foto = DEM_FOTO[entidade].get(chave);
  if (!foto) return { novo: true, linha };
  const patch = {}; const campos = [];
  const iguais = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  for (const col of Object.keys(linha)) {
    if (iguais(linha[col], foto.linha[col])) continue;
    patch[col] = linha[col];
    const campo = demCampoDaColuna(entidade, col);
    if (campo) campos.push(campo);
  }
  return { novo: false, patch, campos, revision: foto.revision, base: foto.linha };
}

/* As intenções desta gravação. Roda ANTES do miolo, como o gancho da v8.26. */
function demRegistrarIntencoes(secoes) {
  const mexeu = !secoes || !secoes.length || secoes.includes("nucleo");
  if (!mexeu) return [];
  if (!demEscreveNaTabela()) return [];          /* estado padrão: nada daqui roda */
  if (typeof S === "undefined") return [];

  const intencoes = [];
  const vistos = { analise: new Set(), op: new Set(), falta: new Set() };

  /* 1 · ANÁLISES · só nascem. Nunca são editadas, então não há patch. */
  const novasAnalises = [];
  for (const a of (S.analises || [])) {
    if (!a || a.id == null) continue;
    vistos.analise.add(String(a.id));
    if (DEM_FOTO.analise.has(String(a.id))) continue;
    novasAnalises.push(a);
  }

  /* 2 · OPS */
  const novasOps = [];
  for (const o of (S.ops || [])) {
    if (!o || !o.id) continue;
    vistos.op.add(String(o.id));
    const d = demDiferenca("op", o);
    if (d.novo) { novasOps.push(o); continue; }
    if (Object.keys(d.patch).length) {
      intencoes.push({ entidade: "op", acao: "patch", id: o.id,
        patch: d.patch, campos: d.campos, revision: d.revision, base: d.base, obj: o });
    }
  }

  /* 3 · FALTAS */
  const novasFaltas = [];
  for (const f of (S.faltas || [])) {
    if (!f || !f.id) continue;
    vistos.falta.add(String(f.id));
    const d = demDiferenca("falta", f);
    if (d.novo) { novasFaltas.push(f); continue; }
    if (Object.keys(d.patch).length) {
      intencoes.push({ entidade: "falta", acao: "patch", id: f.id,
        patch: d.patch, campos: d.campos, revision: d.revision, base: d.base, obj: f });
    }
  }
  /* 4 · FALTA APAGADA · sumiu da tela e estava na foto */
  for (const [id, foto] of DEM_FOTO.falta) {
    if (!vistos.falta.has(id)) {
      intencoes.push({ entidade: "falta", acao: "apagar", id, revision: foto.revision });
    }
  }
  /* -------------------------------------------------------------------------
     5 · OP QUE SUMIU · v8.74 · agora com DECLARAÇÃO.
     Antes, todo id que estava na foto e não estava em `S.ops` virava remoção.
     Ausência tem DUAS causas, e elas eram tratadas como uma só:
       · a pessoa removeu (excluir produto, limpeza em lote, zerar base);
       · a fonte não trouxe (documento com menos OPs que a tabela, sincronia
         periódica, importação, restauração de ponto).
     Só a primeira remove. A segunda fica RETIDA, e fala no console.
     ------------------------------------------------------------------------- */
  const sumidas = [];
  for (const [id, foto] of DEM_FOTO.op) if (!vistos.op.has(id)) sumidas.push([id, foto]);
  if (sumidas.length) {
    const trocandoListas = demImportando();
    const declaradas = trocandoListas ? []
      : sumidas.filter(([id]) => DEM_REMOVIDAS.has(String(id)));
    const semDeclaracao = trocandoListas ? sumidas
      : sumidas.filter(([id]) => !DEM_REMOVIDAS.has(String(id)));

    for (const [id, foto] of declaradas) {
      intencoes.push({ entidade: "op", acao: "remover", id, revision: foto.revision,
        motivo: DEM_REMOVIDAS.get(String(id)) || "removida na tela", declarada: true });
      DEM_REMOVIDAS.delete(String(id));      /* a declaração vale uma vez */
    }
    if (semDeclaracao.length) {
      /* o teto existe só para nomear o caso no diagnóstico — sem declaração
         nada é enviado, seja uma OP ou trezentas */
      const teto = Math.max(DEM_REMOCAO_MAX, Math.ceil(DEM_FOTO.op.size * DEM_REMOCAO_FRACAO));
      demReterRemocoes(semDeclaracao, trocandoListas ? "troca de listas (importação/restauração)"
        : semDeclaracao.length > teto ? "queda grande sem declaração (acima de " + teto + ")"
        : "sumiu da fonte sem declaração");
    }
  }

  if (novasAnalises.length) intencoes.unshift({ entidade: "analise", acao: "criar", itens: novasAnalises });
  if (novasOps.length) intencoes.push({ entidade: "op", acao: "criar", itens: novasOps });
  if (novasFaltas.length) intencoes.push({ entidade: "falta", acao: "criar", itens: novasFaltas });

  DEM_PENDENTES = intencoes;
  return intencoes;
}

let DEM_PENDENTES = [];
let DEM_ULTIMO_ENVIO = null;

/* O envio. Cada intenção chama a MESMA função de persistência que a bateria de
   concorrência já provou — nenhuma RPC é montada aqui. */
async function demEnviarIntencoes() {
  const fila = DEM_PENDENTES; DEM_PENDENTES = [];
  if (!fila.length) return { status: "nada", enviadas: [] };
  const enviadas = []; const problemas = [];

  /* Várias OPs sumindo na mesma gravação é LOTE: não manda nada, monta a
     prévia e devolve para a tela perguntar. As outras intenções desta mesma
     gravação seguem normalmente — parar tudo por causa da limpeza seria pior. */
  const remocoes = fila.filter((x) => x.acao === "remover" && x.entidade === "op");
  let paraEnviar = fila;
  if (remocoes.length >= DEM_LOTE_MINIMO) {
    const ids = remocoes.map((x) => String(x.id));
    let previa = null;
    try { const p = await dmLotePrevia(ids); previa = p.ok ? p.corpo : null; } catch (e) { previa = null; }
    DEM_LOTE = { ids, motivo: "limpeza em massa", previa: previa || { total: ids.length } };
    paraEnviar = fila.filter((x) => !(x.acao === "remover" && x.entidade === "op"));
    if (typeof S !== "undefined") { S.modal = { tipo: "limpezaOps", previa: DEM_LOTE.previa }; }
    if (typeof render === "function") { try { render(); } catch (e) {} }
    enviadas.push({ entidade: "op", acao: "lote-parado", rpc: null,
      quantas: ids.length, resposta: { status: "aguardando-confirmacao" } });
  }

  /* o corpo de sempre, agora numa função: é ela que cada intenção percorre,
     seja em série (as demais ações) ou dentro da janela (os patches). */
  async function tratarUma(i) {
    let r = null;
    try {
      if (i.entidade === "analise" && i.acao === "criar") {
        for (const a of i.itens) {
          const rr = await dmAnaliseCriar(a.rotulo, {
            novas: a.novas, atualizadas: a.atualizadas,
            encerradas: a.encerradas, promovidos: a.promovidos });
          enviadas.push({ entidade: "analise", acao: "criar", rpc: "pcp_analise_criar",
            id: a.id, resposta: rr });
          /* o servidor deu o id; a foto passa a conhecer a análise pelo id da
             tela, para a próxima gravação não criar de novo */
          if (rr && rr.status === "ok" && rr.registro) {
            DEM_FOTO.analise.set(String(a.id), { linha: rr.registro, revision: rr.registro.revision });
          } else problemas.push({ entidade: "analise", id: a.id, resposta: rr });
        }
        return;
      }
      if (i.acao === "criar") {
        const itens = i.entidade === "op" ? i.itens.map(demTraduzirVinculos) : i.itens;
        r = i.entidade === "op" ? await dmOpCriar(itens) : await dmFaltaCriar(itens);
        enviadas.push({ entidade: i.entidade, acao: "criar",
          rpc: i.entidade === "op" ? "pcp_op_criar" : "pcp_falta_criar",
          ids: i.itens.map((x) => x.id), resposta: r });
        for (const linha of ((r && r.criados) || [])) demGuardarFoto(i.entidade, linha);
        if (!r || r.status !== "ok") problemas.push({ entidade: i.entidade, resposta: r });
        return;
      }
      if (i.acao === "patch") {
        /* só o que mudou viaja. Mandar o objeto inteiro faria a camada disputar
           campos que a pessoa nem tocou. */
        const cheio = demTraduzirVinculos(i.obj);
        const mudancas = {};
        for (const campo of (i.campos || [])) mudancas[campo] = cheio[campo];
        if (!Object.keys(mudancas).length) return;
        r = i.entidade === "op"
          ? await dmOpPatch(i.id, i.revision, mudancas, demParaApp(i.entidade, i.base))
          : await dmFaltaPatch(i.id, i.revision, mudancas, demParaApp(i.entidade, i.base));
        enviadas.push({ entidade: i.entidade, acao: "patch",
          rpc: i.entidade === "op" ? "pcp_op_patch" : "pcp_falta_patch",
          id: i.id, campos: Object.keys(i.patch), resposta: r });
        if (r && r.status === "ok" && r.registro) demGuardarFoto(i.entidade, r.registro);
        else problemas.push({ entidade: i.entidade, id: i.id, resposta: r });
        return;
      }
      if (i.acao === "apagar") {
        r = await dmFaltaApagar(i.id, i.revision);
        enviadas.push({ entidade: "falta", acao: "apagar", rpc: "pcp_falta_apagar",
          id: i.id, resposta: r });
        if (r && r.status === "ok") DEM_FOTO.falta.delete(String(i.id));
        else problemas.push({ entidade: "falta", id: i.id, resposta: r });
        return;
      }
      if (i.acao === "remover") {
        r = await dmOpRemover(i.id, i.revision, i.motivo);
        enviadas.push({ entidade: "op", acao: "remover",
          rpc: r && r.caminho === "apagada" ? "pcp_op_apagar" : "pcp_op_cancelar",
          tentou: "pcp_op_apagar", caminho: r && r.caminho,
          recusaDoApagar: r && r.recusaDoApagar, id: i.id, resposta: r });
        if (r && r.status === "ok") {
          /* apagada some da foto; cancelada CONTINUA na foto, porque continua
             existindo na tabela — e some da tela só porque a tela é o legado */
          if (r.caminho === "apagada") DEM_FOTO.op.delete(String(i.id));
          else if (r.registro) demGuardarFoto("op", r.registro);
        } else problemas.push({ entidade: "op", id: i.id, resposta: r });
        return;
      }
    } catch (e) {
      problemas.push({ entidade: i.entidade, id: i.id, resposta: { status: "erro", msg: String(e && e.message || e) } });
    }
  }

  /* -------------------------------------------------------------------------
     OS PATCHES EM JANELA DE 8 (v8.80)
     -------------------------------------------------------------------------
     Medido na bancada: 400 OPs atualizadas = 400 idas ao servidor EM SÉRIE =
     13.011 ms dentro desta função, de 14.638 ms do clique inteiro. Todo o
     resto (prévia, recalcularOP, cascata, histórico, render) somava 40 ms.

     O que muda é SÓ o paralelismo do envio:
       · cada patch continua com a sua `revision` e o seu `p_operation_id`;
       · o tratamento de conflito é o mesmo, item a item;
       · duas intenções do MESMO id ficam na mesma fila, em ordem — nunca
         disputam entre si;
       · uma falha não contamina as outras: cada item tem o seu try/catch
         dentro de `tratarUma`, e entra em `enviadas`/`problemas` sozinho;
       · e o que NÃO é patch continua em série, na posição em que está — assim
         um patch seguido de uma remoção do mesmo id continua nessa ordem.
     ------------------------------------------------------------------------- */
  const DEM_JANELA = 8;
  async function tratarPatchesJuntos(lote) {
    const porId = new Map();
    for (const i of lote) {
      const chave = i.entidade + "|" + i.id;
      if (!porId.has(chave)) porId.set(chave, []);
      porId.get(chave).push(i);
    }
    const filas = [...porId.values()];
    let proxima = 0;
    const trabalhador = async () => {
      for (;;) {
        const minha = proxima++;
        if (minha >= filas.length) return;
        for (const i of filas[minha]) await tratarUma(i);   /* mesmo id: em ordem */
      }
    };
    await Promise.all(Array.from({ length: Math.min(DEM_JANELA, filas.length) }, trabalhador));
  }

  let k = 0;
  while (k < paraEnviar.length) {
    if (paraEnviar[k].acao !== "patch") { await tratarUma(paraEnviar[k]); k++; continue; }
    let j = k;
    while (j < paraEnviar.length && paraEnviar[j].acao === "patch") j++;
    await tratarPatchesJuntos(paraEnviar.slice(k, j));
    k = j;
  }

  DEM_ULTIMO_ENVIO = { em: new Date().toISOString(), enviadas, problemas };
  /* conflito de campo é do REGISTRO, e chega na tela como aviso do registro —
     nunca como pergunta sobre o documento inteiro. */
  const brigas = enviadas.filter((x) => x.resposta && x.resposta.status === "conflito-de-campo");
  if (brigas.length && typeof S !== "undefined") {
    S.avisoDemanda = brigas.map((b) => ({ entidade: b.entidade, id: b.id,
      disputados: (b.resposta.disputados || []).map((d) => d.campo) }));
  }
  return { status: problemas.length ? "com-problema" : "ok", enviadas, problemas };
}
function demUltimoEnvio() { return DEM_ULTIMO_ENVIO; }
