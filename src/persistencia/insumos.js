/* ===========================================================================
   src/persistencia/insumos.js · INSUMOS e SEMIACABADOS pela camada nova
   ---------------------------------------------------------------------------
   O que muda quando as flags ligam:

   LEITURA · movimentos, notas, saídas e baixas de posse, remessas, retornos e
             ajustes vêm das tabelas. O documento continua sendo escrito a
             partir da tela — vira espelho.
   ESCRITA · movimento vira `pcp_insumo_mover`; desfazer vira ESTORNO
             (`pcp_insumo_estornar`), não um buraco no passado; a nota vira
             `pcp_nf_registrar`, que é UMA transação e recusa a nota inteira se
             um item não estiver ligado a insumo; a baixa de posse vira linha.

   Medido antes: 11 operações compostas e nenhuma transação; a idempotência da
   NF-e existia só no navegador de quem importava (duas pessoas com o mesmo XML
   criavam duas notas e movimento dobrado); e a baixa de posse era item de array
   dentro do registro — acrescentar não mexia no carimbo, e duas devoluções na
   mesma saída viravam conflito duro.
   =========================================================================== */
Object.assign(PX_RPC, {
  insumo_mover:      "pcp_insumo_mover",
  insumo_estornar:   "pcp_insumo_estornar",
  nf_registrar:      "pcp_nf_registrar",
  posse_sair:        "pcp_posse_sair",
  posse_baixar:      "pcp_posse_baixar",
  conferencia_baixar:"pcp_conferencia_baixar",
  semi_retornar:     "pcp_semi_retornar",
  semi_encerrar:     "pcp_semi_encerrar",
});

const insLeDaTabela      = () => typeof telaFlag === "function" && telaFlag("insumos_leitura");
const insEscreveNaTabela = () => typeof telaFlag === "function" && telaFlag("insumos_escrita");
const semLeDaTabela      = () => typeof telaFlag === "function" && telaFlag("semi_leitura");
const semEscreveNaTabela = () => typeof telaFlag === "function" && telaFlag("semi_escrita");

/* ---------------------------------------------------------------------------
   A LEITURA
   --------------------------------------------------------------------------- */
async function insPaginar(base, ordem) {
  const itens = [];
  for (let p = 0; p < 60; p++) {
    const r = await persLer(base + "&order=" + ordem + "&limit=1000&offset=" + (p * 1000));
    if (!r.ok) return { erro: pxResposta(r, "listar-insumos") };
    const l = persLista(r.corpo);
    for (const x of l) itens.push(x);
    if (l.length < 1000) return { itens };
  }
  return { erro: { status: "lista-truncada", motivo: "mais de 60.000 linhas" } };
}

async function insCarregar() {
  if (!insLeDaTabela()) return { status: "desligado" };
  const movs = await insPaginar("pcp_insumo_mov?select=id,insumo_id,tipo,qtd,em,quem_nome,doc,custo_unit,obs,estorna_id", "em");
  if (movs.erro) return movs.erro;
  const ent = await insPaginar("pcp_insumo_entrada?select=*", "criada_em");
  if (ent.erro) return ent.erro;
  const sai = await insPaginar("pcp_posse_saida?select=*", "em");
  if (sai.erro) return sai.erro;
  const bai = await insPaginar("pcp_posse_baixa?select=*", "em");
  if (bai.erro) return bai.erro;
  if (typeof S === "undefined") return { status: "sem-estado" };

  S.movInsumo = movs.itens.map((x) => ({ id: x.id, insumoId: x.insumo_id, tipo: x.tipo,
    qtd: Number(x.qtd), em: x.em, por: x.quem_nome, doc: x.doc, custoUnit: x.custo_unit,
    obs: x.obs, estornaId: x.estorna_id }));
  S.entradas = ent.itens.map((x) => ({ id: x.id, numero: x.numero, serie: x.serie, chave: x.chave,
    fornecedorId: x.fornecedor_id, fornecedorNome: x.fornecedor_nome, cnpj: x.cnpj,
    emitidaEm: x.emitida_em, entradaEm: x.entrada_em, frete: x.frete, desconto: x.desconto,
    total: x.total, itens: x.itens || [], criadaEm: x.criada_em, por: x.quem_nome }));
  /* as baixas voltam para dentro da saída: é assim que a TELA lê, e trocar a
     tela inteira não é o assunto deste cutover */
  const porSaida = new Map();
  for (const b of bai.itens) {
    const l = porSaida.get(b.saida_id) || []; l.push({ id: b.id, qtd: Number(b.qtd), tipo: b.tipo,
      em: b.em, por: b.quem_nome, obs: b.obs, doc: b.doc, rid: b.rid });
    porSaida.set(b.saida_id, l);
  }
  S.posseItens = sai.itens.map((x) => ({ id: x.id, bemId: x.bem_id, prestadora: x.prestadora,
    prestadoraId: x.prestadora_id, qtd: Number(x.qtd), saiuEm: x.saiu_em, em: x.em,
    por: x.quem_nome, obs: x.obs, rid: x.rid, baixas: porSaida.get(x.id) || [] }));
  if (typeof esquecerSaldos === "function") esquecerSaldos();
  return { status: "ok", movimentos: S.movInsumo.length, notas: S.entradas.length,
           saidas: S.posseItens.length };
}

async function semCarregar() {
  if (!semLeDaTabela()) return { status: "desligado" };
  const rem = await insPaginar("pcp_semi_remessa?select=*", "em");
  if (rem.erro) return rem.erro;
  const ret = await insPaginar("pcp_semi_retorno?select=*", "em");
  if (ret.erro) return ret.erro;
  const aju = await insPaginar("pcp_semi_ajuste?select=*", "em");
  if (aju.erro) return aju.erro;
  if (typeof S === "undefined") return { status: "sem-estado" };

  SEM_REV = {};
  const porRem = new Map();
  for (const r of ret.itens) {
    const l = porRem.get(r.remessa_id) || [];
    l.push({ id: r.id, em: r.em, data: r.data, por: r.quem_nome, itens: r.itens || [], obs: r.obs });
    porRem.set(r.remessa_id, l);
  }
  S.remessas = rem.itens.map((x) => { SEM_REV[x.id] = x.revision;
    return { id: x.id, numero: x.numero, seqGeral: x.seq_geral, tipo: "remessa",
      prestadora: x.prestadora, prestadoraId: x.prestadora_id, data: x.data, processo: x.processo,
      etapas: x.etapas || [], itens: x.itens || [], volumeQtd: x.volume_qtd, volumeUn: x.volume_un,
      obs: x.obs, status: x.status, encerradaEm: x.encerrada_em, encerradaMotivo: x.encerrada_motivo,
      retornadaEm: x.retornada_em, em: x.em, por: x.quem_nome,
      retornos: porRem.get(x.id) || [] }; });
  S.semiAjustes = aju.itens.map((x) => ({ id: x.id, semiId: x.semi_id, qtd: Number(x.qtd),
    data: x.data, motivo: x.motivo, em: x.em, por: x.quem_nome }));
  return { status: "ok", remessas: S.remessas.length, retornos: ret.itens.length,
           ajustes: S.semiAjustes.length };
}
let SEM_REV = {};

/* ---------------------------------------------------------------------------
   A ESCRITA · uma função por operação, todas devolvendo `desligado` sem flag
   --------------------------------------------------------------------------- */
const insQuem = () => (typeof usuarioAtual === "function" && usuarioAtual()?.nome) || null;

async function insMover(mov) {
  if (!insEscreveNaTabela()) return { status: "desligado" };
  return await pxEnviar(obEnfileirar("insumo_mover", mov.id, {
    p_id: mov.id, p_insumo_id: mov.insumoId, p_tipo: mov.tipo, p_qtd: mov.qtd,
    p_doc: mov.doc || {}, p_custo_unit: mov.custoUnit ?? null, p_obs: mov.obs || null,
    p_nome: insQuem() }));
}
async function insEstornar(movId) {
  if (!insEscreveNaTabela()) return { status: "desligado" };
  return await pxEnviar(obEnfileirar("insumo_estornar", movId, {
    p_id: (typeof uid === "function" ? uid() : String(Date.now())),
    p_mov_id: movId, p_obs: null, p_nome: insQuem() }));
}
async function insNota(entrada, itens) {
  if (!insEscreveNaTabela()) return { status: "desligado" };
  return await pxEnviar(obEnfileirar("nf_registrar", entrada.id, {
    p_entrada: entrada, p_itens: itens, p_nome: insQuem() }));
}
async function insPosseSair(saida) {
  if (!insEscreveNaTabela()) return { status: "desligado" };
  return await pxEnviar(obEnfileirar("posse_sair", saida.id, {
    p_id: saida.id, p_bem_id: saida.bemId, p_prestadora: saida.prestadora,
    p_prestadora_id: saida.prestadoraId || null, p_qtd: saida.qtd,
    p_saiu_em: saida.saiuEm || null, p_obs: saida.obs || null, p_rid: saida.rid || null,
    p_nome: insQuem() }));
}
async function insPosseBaixar(saidaId, baixa) {
  if (!insEscreveNaTabela()) return { status: "desligado" };
  return await pxEnviar(obEnfileirar("posse_baixar", baixa.id, {
    p_id: baixa.id, p_saida_id: saidaId, p_qtd: baixa.qtd, p_tipo: baixa.tipo,
    p_doc: baixa.doc || {}, p_obs: baixa.obs || null, p_rid: baixa.rid || null,
    p_nome: insQuem() }));
}
/* a conferência baixa insumo E posse — ou nada */
async function insConferencia(pedidoId, movs, baixas) {
  if (!insEscreveNaTabela()) return { status: "desligado" };
  return await pxEnviar(obEnfileirar("conferencia_baixar", pedidoId, {
    p_pedido_id: pedidoId, p_movs: movs || [], p_baixas: baixas || [], p_nome: insQuem() }));
}
async function semRetornar(remessaId, retorno) {
  if (!semEscreveNaTabela()) return { status: "desligado" };
  return await pxEnviar(obEnfileirar("semi_retornar", retorno.id, {
    p_id: retorno.id, p_remessa_id: remessaId, p_itens: retorno.itens || [],
    p_data: retorno.data || null, p_obs: retorno.obs || null, p_nome: insQuem() }));
}
async function semEncerrar(remessaId, motivo) {
  if (!semEscreveNaTabela()) return { status: "desligado" };
  return await pxEnviar(obEnfileirar("semi_encerrar", remessaId, {
    p_remessa_id: remessaId, p_expected_revision: SEM_REV[remessaId] ?? null,
    p_motivo: motivo || null, p_nome: insQuem() }));
}

/* ===========================================================================
   AS INTENÇÕES · a fila que reconhece operação composta
   ---------------------------------------------------------------------------
   `moverInsumo` é síncrona e é chamada de vinte lugares no meio de handlers de
   clique. Tornar todos assíncronos seria mexer em vinte fluxos para mudar um
   assunto. Então a tela continua criando o movimento como sempre, e quem envia
   é isto, no `finally` da gravação — igual a Pedidos, Demanda e cadastros.

   E ela NÃO envia movimento solto quando o movimento faz parte de uma operação
   composta: `doc.entradaId` diz que aquilo é uma NOTA, `doc.pedidoId` diz que é
   uma CONFERÊNCIA. Nesses casos sai UMA chamada transacional, e os movimentos
   dela entram marcados. Reconhecer a operação pelo dado é o que permite ter
   transação sem reescrever a tela.
   =========================================================================== */
let INS_ENVIADOS = new Set();
function insMarcarBase() {
  INS_ENVIADOS = new Set();
  if (typeof S === "undefined") return;
  for (const m of (S.movInsumo || [])) if (m && m.id) INS_ENVIADOS.add("mov:" + m.id);
  for (const e of (S.entradas || [])) if (e && e.id) INS_ENVIADOS.add("nf:" + e.id);
  for (const p of (S.posseItens || [])) {
    if (!p || !p.id) continue;
    INS_ENVIADOS.add("saida:" + p.id);
    for (const b of (p.baixas || [])) if (b && b.id) INS_ENVIADOS.add("baixa:" + b.id);
  }
  for (const r of (S.remessas || [])) for (const t of ((r && r.retornos) || []))
    if (t && t.id) INS_ENVIADOS.add("retorno:" + t.id);
}

async function insEnviarIntencoes() {
  if (!insEscreveNaTabela() || typeof S === "undefined") return { status: "desligado", enviadas: [] };
  const enviadas = []; const problemas = [];
  const marcar = (k) => INS_ENVIADOS.add(k);
  const novo = (k) => !INS_ENVIADOS.has(k);

  /* 1 · NOTAS · a nota e os movimentos dela, numa transação */
  for (const e of (S.entradas || [])) {
    if (!e || !e.id || !novo("nf:" + e.id)) continue;
    const movs = (S.movInsumo || []).filter((m) => m && m.doc && m.doc.entradaId === e.id);
    const itens = movs.map((m) => ({ insumoId: m.insumoId, qtd: Math.abs(Number(m.qtd) || 0),
      vUnit: m.custoUnit ?? null, movId: m.id, descricao: m.obs || null }));
    const r = await insNota(e, itens.length ? itens : (e.itens || []).map((i) => ({
      insumoId: i.insumoId, qtd: i.qtd, vUnit: i.vUnit, descricao: i.descricao })));
    enviadas.push({ o_que: "nota", id: e.id, itens: itens.length, resposta: r });
    if (r && (r.status === "ok" || r.status === "ja-registrada")) {
      marcar("nf:" + e.id); for (const m of movs) marcar("mov:" + m.id);
    } else problemas.push({ o_que: "nota", id: e.id, resposta: r });
  }

  /* 2 · CONFERÊNCIAS · consumo de insumo e baixa de posse do mesmo pedido */
  const porPedido = new Map();
  for (const m of (S.movInsumo || [])) {
    if (!m || !m.id || !novo("mov:" + m.id)) continue;
    const ped = m.doc && m.doc.tipo === "op" && m.doc.pedidoId;
    if (!ped) continue;
    const g = porPedido.get(ped) || { movs: [], baixas: [] }; g.movs.push(m); porPedido.set(ped, g);
  }
  for (const p of (S.posseItens || [])) {
    for (const b of ((p && p.baixas) || [])) {
      if (!b || !b.id || !novo("baixa:" + b.id)) continue;
      const ped = b.doc && b.doc.pedidoId;
      if (!ped) continue;
      const g = porPedido.get(ped) || { movs: [], baixas: [] };
      g.baixas.push({ id: b.id, saidaId: p.id, qtd: b.qtd }); porPedido.set(ped, g);
    }
  }
  for (const [ped, g] of porPedido) {
    const r = await insConferencia(ped,
      g.movs.map((m) => ({ id: m.id, insumoId: m.insumoId, qtd: Math.abs(Number(m.qtd) || 0) })),
      g.baixas);
    enviadas.push({ o_que: "conferência", pedido: ped, consumos: g.movs.length,
      baixas: g.baixas.length, resposta: r });
    if (r && r.status === "ok") {
      for (const m of g.movs) marcar("mov:" + m.id);
      for (const b of g.baixas) marcar("baixa:" + b.id);
    } else problemas.push({ o_que: "conferência", pedido: ped, resposta: r });
  }

  /* 3 · MOVIMENTOS SOLTOS · inventário, ajuste, perda, saldo inicial */
  for (const m of (S.movInsumo || [])) {
    if (!m || !m.id || !novo("mov:" + m.id)) continue;
    const r = await insMover(m);
    enviadas.push({ o_que: "movimento", id: m.id, tipo: m.tipo, resposta: r });
    if (r && r.status === "ok") marcar("mov:" + m.id); else problemas.push({ o_que: "movimento", id: m.id, resposta: r });
  }

  /* 4 · POSSE · a saída primeiro, a baixa depois (a baixa referencia a saída) */
  for (const p of (S.posseItens || [])) {
    if (!p || !p.id || !novo("saida:" + p.id)) continue;
    const r = await insPosseSair(p);
    enviadas.push({ o_que: "saída de posse", id: p.id, resposta: r });
    if (r && r.status === "ok") marcar("saida:" + p.id); else problemas.push({ o_que: "saída de posse", id: p.id, resposta: r });
  }
  for (const p of (S.posseItens || [])) {
    if (!p || !p.id || novo("saida:" + p.id)) continue;   /* só se a saída já subiu */
    for (const b of (p.baixas || [])) {
      if (!b || !b.id || !novo("baixa:" + b.id)) continue;
      const r = await insPosseBaixar(p.id, b);
      enviadas.push({ o_que: "baixa de posse", id: b.id, resposta: r });
      if (r && r.status === "ok") marcar("baixa:" + b.id); else problemas.push({ o_que: "baixa de posse", id: b.id, resposta: r });
    }
  }

  INS_ULTIMO = { em: new Date().toISOString(), enviadas, problemas };
  return { status: problemas.length ? "com-problema" : "ok", enviadas, problemas };
}
let INS_ULTIMO = null;
const insUltimoEnvio = () => INS_ULTIMO;

/* SEMIACABADOS · retorno e encerramento */
async function semEnviarIntencoes() {
  if (!semEscreveNaTabela() || typeof S === "undefined") return { status: "desligado", enviadas: [] };
  const enviadas = []; const problemas = [];
  for (const r of (S.remessas || [])) {
    for (const t of ((r && r.retornos) || [])) {
      if (!t || !t.id || INS_ENVIADOS.has("retorno:" + t.id)) continue;
      const res = await semRetornar(r.id, t);
      enviadas.push({ o_que: "retorno", id: t.id, remessa: r.id, resposta: res });
      if (res && res.status === "ok") INS_ENVIADOS.add("retorno:" + t.id);
      else problemas.push({ o_que: "retorno", id: t.id, resposta: res });
    }
  }
  return { status: problemas.length ? "com-problema" : "ok", enviadas, problemas };
}

function insDiagnostico() {
  return { insumos: { leitura: insLeDaTabela(), escrita: insEscreveNaTabela(),
                      movimentos: ((typeof S !== "undefined" && S.movInsumo) || []).length },
           semi: { leitura: semLeDaTabela(), escrita: semEscreveNaTabela(),
                   remessas: ((typeof S !== "undefined" && S.remessas) || []).length },
           jaEnviados: INS_ENVIADOS.size, ultimoEnvio: INS_ULTIMO };
}
