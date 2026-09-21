/* ===========================================================================
   src/corte/pedido-corte.js · O PEDIDO E O PROJETO DE CORTE
   ---------------------------------------------------------------------------
   v8.110. Une as duas metades sem que nenhuma saiba da outra: o pedido continua
   sendo do `pedidos.js`, o projeto continua sendo do `projetos.js`, e o vínculo
   entre os dois mora aqui.

   AS TRÊS COISAS QUE ESTE ARQUIVO FAZ
     1. VINCULAR — grava, pela fila, qual projeto e qual versão valiam para o
        SKU quando o pedido nasceu (RPC `pcp_pedido_corte_vincular`);
     2. CONGELAR — no primeiro papel, guarda a receita RESOLVIDA como snapshot
        (RPC `pcp_pedido_corte_congelar`), e é isso que o papel imprime dali em
        diante;
     3. IMPRIMIR — monta o bloco de 80 mm a partir do snapshot, nunca
        resolvendo de novo.

   POR QUE O SNAPSHOT GUARDA A FITA INTEIRA, E NÃO SÓ O ID
     Porque a fita muda. Trocar a localização de uma fita em março não pode
     reescrever o papel de um pedido de janeiro. O snapshot é o que a bancada
     leu naquele dia — número, nome, cor, código e lugar — e não um ponteiro
     para o que o cadastro virou depois.

   O QUE ESTE ARQUIVO NÃO FAZ
     · não cria, não lê e não altera OP: quem sabe de OP é `opAtivaDe(sku)`;
     · não escreve em `pcp_pedido`, nem no documento, nem na tabela;
     · não desenha tela nenhuma — devolve dados e HTML, quem decide é a tela;
     · não decide sozinho liberar um pedido: `pcPrepararPapeis` devolve o que
       está pendente e quem libera é quem chamou.

   O QUE É "SEM PROJETO"
     Desde a migration 149, `origem = 'sem'` com projeto e versão nulos é uma
     decisão gravada — diferente de "não tem linha", que é ausência de decisão.
     É essa diferença que deixa a liberação distinguir escolha de falha.
   =========================================================================== */

/* pedidoId → { projetoId, versaoId, origem, congeladoEm, snapshot, revision }
   Mora aqui, e não em `S.pedidos`: pendurar no registro do pedido faria o
   snapshot viajar junto na gravação do pedido, e `pcp_pedido` não é nosso. */
let PC_VINCULOS = new Map();

function pcVinculoDe(pedidoId)  { return PC_VINCULOS.get(String(pedidoId)) || null; }
function pcSnapshotDe(pedidoId) { const v = pcVinculoDe(pedidoId); return (v && v.snapshot) || null; }
function pcCongelado(pedidoId)  { const v = pcVinculoDe(pedidoId); return !!(v && v.congeladoEm); }
/* ---------------------------------------------------------------------------
   CONGELADO AQUI NÃO É CONGELADO NO SERVIDOR (v8.110)
   ---------------------------------------------------------------------------
   `pcCongelar` grava o snapshot no cache ANTES da resposta, de propósito: o
   papel precisa dele agora. Mas esse cache mora no `localStorage` de UMA
   máquina. Liberar a produção com o congelamento ainda na fila é imprimir um
   papel cujo vínculo não existe para mais ninguém — trocar de navegador perde
   o vínculo e ninguém fica sabendo.
   `confirmado` só é escrito quando o servidor respondeu, ou quando a linha foi
   LIDA do servidor. É esta a diferença que a liberação consulta.
   --------------------------------------------------------------------------- */
function pcConfirmado(pedidoId)  { const v = pcVinculoDe(pedidoId); return !!(v && v.congeladoEm && v.confirmado); }
function pcQuantos()            { return PC_VINCULOS.size; }
function pcGuardar(v) {
  if (!v || !v.pedidoId) return null;
  const antes = PC_VINCULOS.get(v.pedidoId) || {};
  const novo = Object.assign({}, antes, v);
  PC_VINCULOS.set(v.pedidoId, novo);
  return novo;
}

/* ---------------------------------------------------------------------------
   LEITURA · os vínculos dos pedidos que estão em tela.
   --------------------------------------------------------------------------- */
async function pcCarregar(ids) {
  const lista = (ids || []).map(String).filter(Boolean);
  if (!lista.length) return { status: "ok", quantos: 0 };
  const emLista = `in.(${lista.map((x) => `"${x.replace(/"/g, "")}"`).join(",")})`;
  const r = await persLer(`pcp_pedido_projeto_corte?pedido_id=${emLista}`
    + "&select=pedido_id,projeto_id,versao_id,origem,congelado_em,snapshot,revision&limit=2000");
  if (!r.ok) return { status: "nao-consegui", erro: r.erro, quantos: PC_VINCULOS.size };
  for (const l of persLista(r.corpo)) {
    /* veio do servidor: por definição, confirmado */
    pcGuardar({ pedidoId: l.pedido_id, projetoId: l.projeto_id, versaoId: l.versao_id,
      origem: l.origem, congeladoEm: l.congelado_em, snapshot: l.snapshot, revision: l.revision,
      confirmado: !!l.congelado_em });
  }
  return { status: "ok", quantos: PC_VINCULOS.size };
}

/* ---------------------------------------------------------------------------
   RESOLUÇÃO · qual projeto vale para este SKU, agora.
   A conta é a do modelo (`crtResolver`, via `pjResolver`); aqui só se escolhe
   QUEM assina o vínculo: o último da cadeia, que é o mais específico.
   --------------------------------------------------------------------------- */
function pcResolver(sku) {
  if (typeof pjResolver !== "function") return null;
  const res = pjResolver(sku);
  if (!crtTemProjeto(res) || !res.cadeia || !res.cadeia.length) return null;
  const dono = res.cadeia[res.cadeia.length - 1];
  return { res, sku: res.sku, projetoId: dono.projetoId, versaoId: dono.versaoId,
           nome: dono.nome, escopo: dono.escopo, versao: dono.versao };
}
const pcTemProjeto = (sku) => !!pcResolver(sku);

/* a mesma leitura da cadeia, com um projeto escolhido à mão por último. Quem
   assina passa a ser ele — é isso que vai para `projeto_id`/`versao_id`. */
function pcResolverManual(sku, projetoId) {
  if (typeof pjResolverManual !== "function") return pcResolver(sku);
  const res = pjResolverManual(sku, projetoId);
  if (!crtTemProjeto(res) || !res.cadeia || !res.cadeia.length) return null;
  const dono = res.cadeia[res.cadeia.length - 1];
  return { res, sku: res.sku, projetoId: dono.projetoId, versaoId: dono.versaoId,
           nome: dono.nome, escopo: dono.escopo, versao: dono.versao };
}

/* ---------------------------------------------------------------------------
   A CAMADA QUE OS DOIS CAMINHOS COMPARTILHAM (v8.110)
   ---------------------------------------------------------------------------
   São três portas e dois caminhos de código: o pedido avulso e a aba Pedidos
   caem no mesmo `novoPedido`; a Demanda em lote cai no `criarPedidos`, com um
   bloco por SKU. Os dois precisam das MESMAS três coisas — saber o que vale
   para o SKU, guardar a escolha de quem está na tela, e transformar isso em
   vínculo quando o pedido existir.

   A DECISÃO MORA NO SKU, NUNCA NUM ESTADO DE FORA.
   Ela é um objeto simples, guardado onde o SKU está: `S.modal.corte` no
   caminho 1, `grupos[gi].corte` no caminho 2. E ela carrega o próprio SKU
   dentro — é isso que impede a decisão de um SKU de valer para o seguinte
   quando a pessoa apaga o código e digita outro, ou quando a Demanda percorre
   dez grupos em sequência. Decisão de outro SKU é descartada, não aproveitada.
   --------------------------------------------------------------------------- */
const pcMesmoSku = (a, b) => String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();
function pcDecidirProjeto(sku, estado) {
  const e = estado || pcEstadoDoSku(sku);
  return { sku: String(sku || "").trim().toUpperCase(), escolha: "projeto",
           projetoId: e.projetoId, versaoId: e.versaoId };
}
function pcDecidirSem(sku) {
  return { sku: String(sku || "").trim().toUpperCase(), escolha: "sem",
           projetoId: null, versaoId: null };
}
/* TROCAR (v8.110) · escolha manual, válida só para ESTE pedido.
   A versão gravada é a VIGENTE do projeto escolhido no momento da escolha —
   publicar uma versão nova depois não reescreve um pedido já congelado, que é
   a mesma promessa do resto do módulo. */
function pcDecidirManual(sku, projetoId) {
  const p = typeof pjAchar === "function" ? pjAchar(projetoId) : null;
  return { sku: String(sku || "").trim().toUpperCase(), escolha: "manual",
           projetoId: p ? p.id : null,
           versaoId: (p && p.versao && p.versao.id) || null };
}

/* o que a tela desenha para um SKU. `decisao` é opcional — e só é considerada
   quando for do MESMO SKU. */
function pcEstadoDoSku(sku, decisao) {
  const s = String(sku || "").trim().toUpperCase();
  const r = s ? pcResolver(s) : null;
  const minha = (decisao && pcMesmoSku(decisao.sku, s)) ? decisao : null;
  const manual = minha && minha.escolha === "manual" && minha.projetoId
    ? (typeof pjAchar === "function" ? pjAchar(minha.projetoId) : null) : null;
  const sem = !!(minha && minha.escolha === "sem");
  return {
    sku: s,
    tem: !!r || !!manual,
    /* a escolha manual manda no que vai para o vínculo; "sem" zera os dois */
    projetoId: sem ? null : manual ? manual.id : (r ? r.projetoId : null),
    versaoId:  sem ? null : manual ? minha.versaoId : (r ? r.versaoId : null),
    nome:   manual ? manual.nome   : (r ? r.nome : null),
    escopo: manual ? manual.escopo : (r ? r.escopo : null),
    versao: manual ? (manual.versao && manual.versao.versao) : (r ? r.versao : null),
    cadeia: r && r.res ? r.res.cadeia : [],
    escolha: minha ? minha.escolha : null,
    /* o automático que a troca substituiu — a tela precisa poder oferecer a volta */
    automatico: r ? { projetoId: r.projetoId, nome: r.nome, escopo: r.escopo } : null,
    /* decidido = ou a pessoa escolheu, ou não há o que escolher */
    decidido: !!minha || !r,
  };
}

/* depois que o pedido existe. Devolve o mesmo formato de `pcVincular`. */
async function pcVincularDecidido(pedidoId, sku, decisao) {
  const s = String(sku || "").trim().toUpperCase();
  const minha = (decisao && pcMesmoSku(decisao.sku, s)) ? decisao : null;
  if (minha && minha.escolha === "sem") return pcSemProjeto(pedidoId);
  /* escolha manual: origem='manual', e o projeto/versão são os que a pessoa
     escolheu — não os que a cadeia resolveria sozinha (149 aceita 'manual') */
  if (minha && minha.escolha === "manual" && minha.projetoId) {
    return pcVincular(pedidoId, s, { projetoId: minha.projetoId, versaoId: minha.versaoId, origem: "manual" });
  }
  if (!pcTemProjeto(s)) return { status: "sem-projeto", pedidoId: String(pedidoId || ""), sku: s };
  return pcVincular(pedidoId, s);
}

/* o SKU de um pedido é o da OP — `opAtivaDe` continua sendo o dono disso */
function pcSkuDoPedido(r) {
  if (!r) return "";
  const porOp = typeof opPorId === "function" ? (opPorId(r.opId) || {}).sku : null;
  return String(porOp || r.sku || "").trim().toUpperCase();
}

/* ---------------------------------------------------------------------------
   SNAPSHOT · a receita resolvida, com a fita inteira dentro.
   --------------------------------------------------------------------------- */
function pcFitaDoSnapshot(id) {
  const f = typeof ftAchar === "function" ? ftAchar(id) : null;
  if (!f) return { id: id || null, nome: id ? "fita não encontrada" : "sem fita" };
  return { id: f.id, numero: f.numero || null, nome: f.nome || null, cor: f.cor || null,
           estampa: f.estampa || null, codigo: f.codigo || null, local: f.local || null,
           larguraMm: f.larguraMm == null ? null : f.larguraMm };
}
const pcTipoRotulo = (cod) => {
  const t = (typeof pjTipos === "function" ? pjTipos() : []).find((x) => x.codigo === cod);
  return t ? t.rotulo : (cod || null);
};

/* `projetoManual` é o projeto escolhido à mão para ESTE pedido (v8.110). Ele
   entra como o elo mais específico da cadeia — quem congela lê daqui, então é
   a receita da escolha manual que vai para o papel. */
function pcMontarSnapshot(sku, projetoManual) {
  const r = projetoManual ? pcResolverManual(sku, projetoManual) : pcResolver(sku);
  if (!r) return { sem_projeto: true, sku: String(sku || "").toUpperCase() };
  const res = r.res;
  return {
    sku: r.sku,
    projeto: { id: r.projetoId, nome: r.nome, escopo: r.escopo },
    versao: { id: r.versaoId, versao: r.versao },
    escolhaManual: projetoManual ? true : undefined,
    cortes: (res.cortes || []).map((c, i) => ({
      ordem: i + 1,
      identificacao: c.identificacao || null,
      comprimentoMm: c.comprimentoMm == null ? null : c.comprimentoMm,
      tipoCorte: c.tipoCorte || null,
      tipoRotulo: pcTipoRotulo(c.tipoCorte),
      qtd: Number(c.qtd) > 1 ? Number(c.qtd) : 1,
      fita: pcFitaDoSnapshot(c.fitaId),
      camadas: (c.camadas || []).map((m) => ({
        comprimentoMm: m.comprimentoMm == null ? null : m.comprimentoMm,
        tipoCorte: m.tipoCorte || null,
        tipoRotulo: pcTipoRotulo(m.tipoCorte),
        cortarJuntas: m.cortarJuntas !== false,
        condicao: m.condicao || null,
        fita: pcFitaDoSnapshot(m.fitaId),
      })),
    })),
    fitilho: res.fitilho ? { partes: Number(res.fitilho.partes) === 2 ? 2 : 1,
                             comprimentoMm: res.fitilho.comprimentoMm } : null,
    sortimento: res.sortimento && res.sortimento.modo === "sortido"
      ? { modo: "sortido", variedade: res.sortimento.variedade || null,
          itens: (res.sortimento.itens || []).map((x) => ({ genero: x.genero, qtd: x.qtd })) }
      : null,
    /* de onde veio cada bloco fica registrado para auditoria — o PAPEL não
       imprime isto, mas quem investigar um pedido antigo vai querer saber */
    origem: res.origem || {},
    app: typeof VERSAO !== "undefined" ? VERSAO : null,
  };
}

/* ---------------------------------------------------------------------------
   VÍNCULO · grava qual projeto valia. Sempre pela fila.
   --------------------------------------------------------------------------- */
/* `escolhido` (v8.110) é a troca manual: projeto, versão e origem vêm dela, e
   não da cadeia. Sem ele, nada muda — quem assina é o elo mais específico. */
async function pcVincular(pedidoId, sku, escolhido) {
  const id = String(pedidoId || "");
  if (!id) return { status: "invalido", motivo: "pedido sem id" };
  const v = pcVinculoDe(id);
  if (v && v.congeladoEm) return { status: "congelado", pedidoId: id, congeladoEm: v.congeladoEm };

  const r = escolhido && escolhido.projetoId
    ? { projetoId: escolhido.projetoId, versaoId: escolhido.versaoId, escopo: "manual",
        nome: (typeof pjAchar === "function" && (pjAchar(escolhido.projetoId) || {}).nome) || null }
    : pcResolver(sku);
  if (!r) return pcSemProjeto(id);

  const acao = cxEnfileirar("corte_vincular", id, {
    p_pedido_id: id, p_projeto_id: r.projetoId, p_versao_id: r.versaoId,
    p_origem: r.escopo, p_expected_revision: v ? v.revision : null,
  });
  pcGuardar({ pedidoId: id, projetoId: r.projetoId, versaoId: r.versaoId, origem: r.escopo,
              /* guardado para o congelamento saber montar a receita da escolha */
              manualDe: r.escopo === "manual" ? r.projetoId : null });
  const d = await cxDrenar();
  return pcDepois(d, id, acao && acao.opId, { origem: r.escopo, projeto: r.nome });
}

/* a decisão explícita de seguir sem projeto (149: origem='sem', colunas nulas) */
async function pcSemProjeto(pedidoId) {
  const id = String(pedidoId || "");
  const v = pcVinculoDe(id);
  if (v && v.congeladoEm) return { status: "congelado", pedidoId: id, congeladoEm: v.congeladoEm };
  const acao = cxEnfileirar("corte_vincular", id, {
    p_pedido_id: id, p_projeto_id: null, p_versao_id: null,
    p_origem: "sem", p_expected_revision: v ? v.revision : null,
  });
  pcGuardar({ pedidoId: id, projetoId: null, versaoId: null, origem: "sem" });
  const d = await cxDrenar();
  return pcDepois(d, id, acao && acao.opId, { origem: "sem" });
}

/* ---------------------------------------------------------------------------
   CONGELAMENTO · idempotente por desenho, em três camadas.
     1. aqui: já congelado no cache devolve o snapshot guardado e não enfileira;
     2. na fila: o mesmo operation_id não é reenviado duas vezes;
     3. na RPC: `congelado_em` não nulo devolve `ja_congelado` (147, §14.3).
   --------------------------------------------------------------------------- */
async function pcCongelar(pedidoId, sku) {
  const id = String(pedidoId || "");
  if (!id) return { status: "invalido", motivo: "pedido sem id" };

  const v = pcVinculoDe(id);
  if (v && v.congeladoEm) {
    /* já congelado AQUI. Se o servidor confirmou, acabou. Se não confirmou, a
       ação continua na fila com o MESMO operation_id — então a tentativa certa
       é drenar aquela, nunca enfileirar outra: duas linhas para o mesmo
       congelamento é exatamente o que o ledger existe para impedir. */
    if (v.confirmado) {
      return { status: "ok", pedidoId: id, jaCongelado: true,
               congeladoEm: v.congeladoEm, confirmado: true };
    }
    const dv = await cxDrenar();
    const fv = pcDepois(dv, id, v.opId, { congeladoEm: v.congeladoEm, snapshot: v.snapshot });
    if (fv.status === "ok") pcGuardar({ pedidoId: id, confirmado: true });
    return fv;
  }

  /* a receita congelada é a do VÍNCULO: se ele foi manual, é o projeto
     escolhido que assina, não o que a cadeia resolveria hoje */
  const snap = (v && v.origem === "sem") ? { sem_projeto: true, sku }
    : pcMontarSnapshot(sku, (v && v.manualDe) || null);
  const acao = cxEnfileirar("corte_congelar", id, { p_pedido_id: id, p_snapshot: snap });

  /* o papel precisa do snapshot AGORA; a fila cuida de levá-lo ao servidor.
     `confirmado` fica de fora: ele só nasce com a resposta. */
  pcGuardar({ pedidoId: id, snapshot: snap, congeladoEm: new Date().toISOString(),
              opId: acao && acao.opId });

  const d = await cxDrenar();
  const fim = pcDepois(d, id, acao && acao.opId, { snapshot: snap });
  if (fim.status === "ok") pcGuardar({ pedidoId: id, confirmado: true });
  /* o servidor pode ter um snapshot mais antigo — se ele disse `ja_congelado`,
     quem manda é o dele, não o nosso */
  if (fim.status === "ok" && fim.resposta && fim.resposta.snapshot) {
    pcGuardar({ pedidoId: id, snapshot: fim.resposta.snapshot,
                congeladoEm: fim.resposta.congelado_em || fim.resposta.congeladoEm });
  }
  return fim;
}

function pcDepois(d, pedidoId, opId, extra) {
  const base = Object.assign({ pedidoId }, extra || {});
  if (d.status === "desligado") {
    return Object.assign(base, { status: "na-fila", motivo: "gravação do corte desligada" });
  }
  const parada = (d.paradas || []).find((p) => p.opId === opId);
  if (parada) return Object.assign(base, parada.resposta, { status: parada.status, acao: opId });
  if ((d.feitas || []).includes(opId)) return Object.assign(base, { status: "ok" });
  return Object.assign(base, { status: "na-fila", restam: d.restam });
}

/* ---------------------------------------------------------------------------
   ANTES DE LIBERAR · o que a tela precisa saber para não liberar em silêncio.

   Devolve as listas, e NÃO decide nada:
     prontos    · congelamento CONFIRMADO pelo servidor, agora ou antes
     pendentes  · o SKU resolve projeto, o pedido não tem vínculo e ninguém
                  disse que era para seguir sem. Quem pergunta é a tela
     naFila     · o congelamento não chegou ao servidor (sem rede, flag
                  desligada). Não é erro — e também não libera
     erros      · o servidor recusou: conflito, sem permissão, o que for
     semProjeto · o SKU não tem projeto nenhum: não há o que congelar

   A REGRA (v8.110):
     confirmado pelo servidor  → libera
     já congelado no servidor  → libera
     na-fila / sem confirmação → NÃO libera
     conflito / erro           → NÃO libera

   `na-fila` continua existindo e continua valendo para EDITAR: a ação fica
   guardada, o snapshot fica no cache e o papel sai certo. O que ele não faz é
   liberar produção — a fila é durável em UMA máquina, e o vínculo que só
   existe ali se perde ao trocar de navegador, sem ninguém ficar sabendo.
   --------------------------------------------------------------------------- */
async function pcPrepararPapeis(pedidos) {
  /* -------------------------------------------------------------------------
     ANTES DE TUDO: os projetos precisam estar em memória.
     `pjCarregar` só roda quando alguém abre Processos. Quem cria um pedido e
     manda imprimir sem nunca ter passado por lá teria TODO SKU parecendo "sem
     projeto" — e sem projeto libera. O módulo não carregado viraria liberação
     em silêncio, que é exatamente o que esta função existe para impedir.
     Se a leitura falhar, não se adivinha: trava e diz por quê.
     ------------------------------------------------------------------------- */
  const carga = await pcGarantirProjetos();
  if (!carga.ok) return pcFalhouConferir(carga.erro || "não consegui ler os projetos de corte agora");

  const prontos = [], pendentes = [], erros = [], semProjeto = [], naFila = [];
  for (const r of (pedidos || [])) {
    const id = String(r.id);
    const sku = pcSkuDoPedido(r);
    const v = pcVinculoDe(id);

    if (v && v.congeladoEm && v.confirmado) { prontos.push(id); continue; }

    if (!v && !pcTemProjeto(sku)) { semProjeto.push(id); continue; }

    if (!v) { pendentes.push({ id, sku, numero: r.numero }); continue; }

    const fim = await pcCongelar(id, sku);
    if (fim.status === "ok") prontos.push(id);
    else if (fim.status === "na-fila") naFila.push({ id, numero: r.numero, motivo: fim.motivo || "ainda não chegou ao servidor" });
    else erros.push({ id, numero: r.numero, status: fim.status, resposta: fim });
  }
  return { prontos, pendentes, erros, semProjeto, naFila,
           podeLiberar: erros.length === 0 && pendentes.length === 0 && naFila.length === 0 };
}

/* ---------------------------------------------------------------------------
   O BLOCO DO PAPEL · 80 mm, grande, e SEM herança.
   Quem está na bancada precisa da receita final: fita, medida, tipo, lugar.
   `herda/substitui/ajusta` é assunto de quem administra as regras, e fica na
   tela. O desenho é o do protótipo aprovado (corte.js:2195).
   Lê o SNAPSHOT — nunca resolve de novo.
   --------------------------------------------------------------------------- */
const pcCm = (mm) => (mm == null ? "" : `${String(Number(mm) / 10).replace(".", ",")} CM`);
const pcFitaTxt = (f) => `Nº ${(f && f.numero) || "?"}${f && f.nome ? " · " + String(f.nome).toUpperCase() : ""}`;

function pcBlocoPapel(pedidoId) {
  const s = pcSnapshotDe(pedidoId);
  if (!s || s.sem_projeto) return "";
  const linha = (rot, val) => (val ? `<div class="pj-l"><span>${rot}</span><b>${esc(String(val))}</b></div>` : "");

  const corte = (c, i) => `<div class="pj-bloco">
    <div class="pj-bt">CORTE ${i + 1}${c.identificacao ? " · " + esc(String(c.identificacao).toUpperCase()) : ""}</div>
    ${linha("FITA", pcFitaTxt(c.fita))}
    <div class="pj-med">${esc(pcCm(c.comprimentoMm))}${c.qtd > 1 ? ` · ${c.qtd} PARTES` : ""}</div>
    ${linha("CORTE", c.tipoRotulo && String(c.tipoRotulo).toUpperCase())}
    ${linha("LOCAL", c.fita && c.fita.local && String(c.fita.local).toUpperCase())}
    ${(c.camadas || []).map((m) => `<div class="pj-cam">
      <div class="pj-bt2">+ SOBREPOSTA · MESMO CORTE</div>
      ${linha("FITA", pcFitaTxt(m.fita))}
      <div class="pj-med2">${esc(m.comprimentoMm == null ? pcCm(c.comprimentoMm) : pcCm(m.comprimentoMm))}${m.cortarJuntas ? " · CORTAR JUNTAS" : " · CORTAR SEPARADO"}</div>
      ${linha("LOCAL", m.fita && m.fita.local && String(m.fita.local).toUpperCase())}
      ${m.condicao ? `<div class="pj-cond">${esc(String(m.condicao).toUpperCase())}</div>` : ""}
    </div>`).join("")}
  </div>`;

  return `<div class="pj-papel">
    <div class="pj-tit">PROJETO DE CORTE</div>
    <div class="pj-sub">${esc(s.projeto && s.projeto.nome || "")}${s.versao && s.versao.versao ? ` · v${esc(String(s.versao.versao))}` : ""}</div>
    ${(s.cortes || []).map(corte).join("")}
    ${s.fitilho ? `<div class="pj-bloco"><div class="pj-bt">FITILHO</div>
      <div class="pj-med">${s.fitilho.partes === 2 ? `2 × ${esc(pcCm(s.fitilho.comprimentoMm))}` : esc(pcCm(s.fitilho.comprimentoMm))}</div>
      ${linha("FITA", "Nº 1 · CORTE RETO")}</div>` : ""}
    ${s.sortimento && (s.sortimento.itens || []).length ? `<div class="pj-bloco">
      <div class="pj-bt">SORTIMENTO</div>
      <div class="pj-med">${esc(s.sortimento.itens.map((x) => `${x.qtd} ${String(x.genero).toUpperCase()}`).join(" · "))}</div>
      ${linha("VARIEDADE", s.sortimento.variedade && String(s.sortimento.variedade).toUpperCase())}</div>` : ""}
  </div>`;
}

/* o resumo de uma linha, para a tela do pedido. Campo que não se aplica não
   entra: fitilho que não existe não vira "sem fitilho". */
function pcResumo(pedidoId) {
  return pcResumoDoSnapshot(pcSnapshotDe(pedidoId));
}
/* o mesmo resumo, a partir de um snapshot solto — a seção do formulário precisa
   dele ANTES de o pedido existir, quando ainda não há o que ler no cache */
function pcResumoDoSnapshot(s) {
  if (!s) return "";
  if (s.sem_projeto) return "sem Projeto de Corte";
  const p = (s.cortes || []).map((c) => `nº ${(c.fita && c.fita.numero) || "?"} ${pcCm(c.comprimentoMm).toLowerCase()}`);
  if (s.fitilho) p.push(`fitilho ${pcCm(s.fitilho.comprimentoMm).toLowerCase()}`);
  if (s.sortimento) p.push("sortido");
  return p.join(" · ");
}

/* ===========================================================================
   A SEÇÃO NA TELA · a mesma nos dois caminhos
   ---------------------------------------------------------------------------
   O desenho é o do protótipo aprovado (`prototipos/corte/corte.js`,
   `secaoProjetoCorte`): título, o projeto que vale, o resumo da receita, e os
   botões do estado em que se está. Sem botão morto — o que não se aplica não
   aparece.

   `ctx` diz de onde ela foi desenhada, e vai nos `data-` para o clique achar o
   dono da decisão de volta:
     ctx = "np"    · a janela do pedido avulso (S.modal)
     ctx = "lote"  · um grupo da janela de criar pedidos (S.modal.grupos[gi])
   =========================================================================== */
function pcSecao(sku, decisao, ctx, gi) {
  const e = pcEstadoDoSku(sku, decisao);
  if (!e.sku) return "";
  const dados = ` data-pjc-ctx="${esc(ctx || "np")}"${gi == null ? "" : ` data-pjc-g="${esc(String(gi))}"`}`;
  const tit = `<div style="font-size:9.5px;letter-spacing:.1em;font-weight:800;color:var(--ink-4);margin-bottom:6px">PROJETO DE CORTE
    <span style="font-weight:400;letter-spacing:0;text-transform:none;color:var(--ink-3)"> · a ficha que a bancada usa para cortar</span></div>`;
  const caixa = (borda, fundo, corpo) => `<div style="margin:2px 0 10px;padding:10px 12px;border:1px solid ${borda};border-radius:9px;background:${fundo}">${tit}${corpo}</div>`;

  /* 1 · seguiu sem projeto, por escolha de alguém */
  if (e.escolha === "sem") {
    return caixa("var(--line)", "transparent", `
      <div style="margin-bottom:4px"><b>Sem Projeto de Corte</b>
        <span class="tag">você escolheu seguir sem</span></div>
      <div class="hint" style="margin-bottom:7px">O pedido segue normalmente; a bancada não recebe ficha de corte deste SKU, e o papel sai sem o bloco.</div>
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        ${e.tem ? `<button type="button" class="btn sm" data-pjc-ped="usar"${dados}>Usar o projeto de novo</button>` : ""}
        <button type="button" class="btn sm ghost" data-pjc-ped="criar"${dados}>${svg(IC.mais)}Criar Projeto de Corte</button></div>`);
  }

  /* 2 · o SKU tem projeto — automático ou escolhido à mão */
  if (e.tem) {
    const manual = e.escolha === "manual";
    const resumo = pcResumoDoSnapshot(pcMontarSnapshot(e.sku, manual ? e.projetoId : null));
    return caixa("var(--line)", "transparent", `
      <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
        <b>${esc(e.nome || "")}</b>
        <span class="tag">${esc(PJC_NOME && PJC_NOME[e.escopo] ? PJC_NOME[e.escopo] : e.escopo)}</span>
        ${e.versao ? `<span class="tag">v${esc(String(e.versao))}</span>` : ""}
        <span class="tag${manual ? " amber" : ""}">${manual ? "escolhido à mão" : "versão vigente"}</span></div>
      ${resumo ? `<div style="font-size:12px;color:var(--ink-2);margin-bottom:7px">${esc(resumo)}</div>` : ""}
      ${manual && e.automatico ? `<div class="hint" style="margin-bottom:7px">Só para este pedido. A regra de ${esc(e.automatico.nome || "")} continua valendo para o SKU.</div>` : ""}
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        <button type="button" class="btn sm" data-pjc-ped="ver"${dados}>${svg(IC.olho)}Ver projeto</button>
        <button type="button" class="btn sm" data-pjc-ped="trocar"${dados}>${svg(IC.atualizar)}Trocar</button>
        ${manual ? `<button type="button" class="btn sm ghost" data-pjc-ped="auto"${dados}>Voltar ao automático${e.automatico ? ` (${esc(e.automatico.nome || "")})` : ""}</button>` : ""}
        <button type="button" class="btn sm ghost" data-pjc-ped="sem"${dados}>Seguir sem projeto</button></div>`);
  }

  /* 3 · nenhum projeto casa com este SKU. Não é erro, mas também não é
     silêncio: quem está criando o pedido precisa saber que a bancada vai
     receber o papel sem ficha. */
  return caixa("var(--amber)", "var(--amber-soft)", `
    <div style="margin-bottom:4px"><b>Nenhum projeto casa com ${esc(e.sku)}.</b></div>
    <div class="hint" style="margin-bottom:7px">O pedido pode seguir assim — o papel sai sem o bloco de corte.</div>
    <div style="display:flex;gap:7px;flex-wrap:wrap">
      <button type="button" class="btn sm primary" data-pjc-ped="criar"${dados}>${svg(IC.mais)}Criar Projeto de Corte</button></div>`);
}

/* ---------------------------------------------------------------------------
   POR QUE NÃO LIBEROU · uma frase, com os números dos pedidos.
   A recusa tem de dizer o que fazer. "Não foi possível" manda a pessoa
   adivinhar, e ela vai acabar liberando de outro jeito.
   --------------------------------------------------------------------------- */
function pcPorQueNaoLibera(c) {
  if (!c || c.podeLiberar) return "";
  if (c.erroInterno) return `O Projeto de Corte não pôde ser conferido (${c.erroInterno}) — os pedidos ficam em Papel de Produção até isso se resolver.`;
  const nums = (lista) => lista.map((x) => x.numero || x.id).join(", ");
  if ((c.erros || []).length) {
    const cong = (c.erros || []).some((x) => x.status === "congelado" || x.status === "conflito");
    return `O corte de ${nums(c.erros)} não foi confirmado${cong ? " (outra pessoa mexeu neste pedido)" : ""} — o pedido continua em Papel de Produção.`;
  }
  if ((c.naFila || []).length) {
    return `O corte de ${nums(c.naFila)} ainda não chegou ao servidor. O papel pode ser impresso, mas a liberação espera a confirmação — senão o vínculo fica só neste navegador e se perde ao trocar de máquina.`;
  }
  if ((c.pendentes || []).length) {
    return `${nums(c.pendentes)} ${c.pendentes.length === 1 ? "não tem" : "não têm"} Projeto de Corte definido. Abra o pedido e escolha o projeto, ou registre que segue sem.`;
  }
  return "O corte deste pedido não pôde ser confirmado — ele continua em Papel de Produção.";
}

/* o que devolver quando a conferência do corte levanta exceção: NUNCA liberar
   em silêncio. Sem isso, um erro dentro do módulo viraria "seguiu normal". */
const pcFalhouConferir = (e) => ({ prontos: [], pendentes: [], erros: [], semProjeto: [],
  naFila: [], podeLiberar: false, erroInterno: String((e && e.message) || e) });

/* projetos e fitas em memória, uma vez. A marca é o SUCESSO, não a tentativa:
   uma leitura que falhou tem de ser refeita na próxima, não dada por feita. */
let PC_CARREGOU = false;
async function pcGarantirProjetos() {
  if (PC_CARREGOU) return { ok: true, jaEstava: true };
  if (typeof pjCarregar !== "function") return { ok: false, erro: "módulo de projetos ausente" };
  try {
    const r = await pjCarregar();
    if (!r || r.status !== "ok") return { ok: false, erro: "não consegui ler os projetos de corte agora" };
    if (typeof ftCarregar === "function" && typeof ftQuantas === "function" && !ftQuantas()) {
      const f = await ftCarregar();
      if (!f || f.status !== "ok") return { ok: false, erro: "não consegui ler o cadastro de fitas agora" };
    }
    PC_CARREGOU = true;
    return { ok: true };
  } catch (e) { return { ok: false, erro: String((e && e.message) || e) }; }
}
/* chamado quando uma janela de criar pedido abre: a seção é desenhada de
   imediato (sem esperar rede), e quando os projetos chegam a janela se
   redesenha sozinha. Não trava nada e não devolve nada. */
function pcAquecer() {
  if (PC_CARREGOU) return;
  pcGarantirProjetos().then((r) => { if (r.ok && typeof render === "function") render(); }).catch(() => {});
}

/* ===========================================================================
   A SEÇÃO NA JANELA DE UM PEDIDO QUE JÁ EXISTE (v8.110)
   ---------------------------------------------------------------------------
   Sem isto havia um beco sem saída: no dia em que a primeira regra de família
   nascesse, todo pedido criado ANTES do módulo ficaria pendente no papel→aberto
   — e o aviso mandava "abra o pedido e escolha", num lugar onde não havia o
   que escolher.

   Aqui o pedido JÁ EXISTE, então a decisão não espera: ela vira vínculo na
   hora. E pedido antigo não é promovido a "sem projeto" por conta própria —
   se existe regra que casa com o SKU, ele fica pendente até alguém decidir.

   Congelado é SÓ LEITURA. Trocar ou seguir sem depois de o papel ter saído
   seria contar outra história sobre trabalho que já foi para a bancada.
   =========================================================================== */
function pcSecaoDoPedido(pedido) {
  if (!pedido || !pedido.id) return "";
  const id = String(pedido.id);
  const sku = pcSkuDoPedido(pedido);
  if (!sku) return "";
  const v = pcVinculoDe(id);
  const tit = `<div style="font-size:9.5px;letter-spacing:.1em;font-weight:800;color:var(--ink-4);margin-bottom:6px">PROJETO DE CORTE
    <span style="font-weight:400;letter-spacing:0;text-transform:none;color:var(--ink-3)"> · a ficha que a bancada usa para cortar</span></div>`;
  const caixa = (borda, fundo, corpo) => `<div style="margin:0 0 14px;padding:10px 12px;border:1px solid ${borda};border-radius:9px;background:${fundo}">${tit}${corpo}</div>`;
  const dados = ` data-pjc-ped-id="${esc(id)}"`;

  /* 1 · congelado: só leitura, e o que se lê é o SNAPSHOT, não a regra de hoje */
  if (v && v.congeladoEm) {
    const s = v.snapshot || {};
    if (s.sem_projeto) {
      return caixa("var(--line)", "transparent", `
        <div><b>Sem Projeto de Corte</b> <span class="tag">congelado</span></div>
        <div class="hint" style="margin-top:4px">Este pedido foi liberado sem projeto em ${esc(fdate(v.congeladoEm))}. O papel saiu assim.</div>`);
    }
    return caixa("var(--line)", "transparent", `
      <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
        <b>${esc((s.projeto && s.projeto.nome) || "")}</b>
        ${s.versao && s.versao.versao ? `<span class="tag">v${esc(String(s.versao.versao))}</span>` : ""}
        <span class="tag ok">congelado</span></div>
      <div style="font-size:12px;color:var(--ink-2)">${esc(pcResumoDoSnapshot(s))}</div>
      <div class="hint" style="margin-top:5px">Congelado em ${esc(fdate(v.congeladoEm))}. Mexer no projeto depois disto não muda mais este pedido — nem para mudar de projeto, nem para seguir sem.</div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:7px">
        <button type="button" class="btn sm" data-pjc-ped="ver-cong"${dados}>${svg(IC.olho)}Ver a ficha congelada</button></div>`);
  }

  /* 2 · já tem vínculo, ainda não congelado: dá para rever */
  if (v) {
    const manual = v.origem === "manual";
    const nome = (typeof pjAchar === "function" && (pjAchar(v.projetoId) || {}).nome) || null;
    if (v.origem === "sem") {
      return caixa("var(--line)", "transparent", `
        <div><b>Sem Projeto de Corte</b> <span class="tag">você escolheu seguir sem</span></div>
        <div class="hint" style="margin-top:4px;margin-bottom:7px">Ainda dá para mudar: o pedido não foi congelado.</div>
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          <button type="button" class="btn sm" data-pjc-ped="usar-resolvido"${dados}>Usar o projeto resolvido</button>
          <button type="button" class="btn sm" data-pjc-ped="trocar-ped"${dados}>${svg(IC.atualizar)}Trocar</button></div>`);
    }
    return caixa("var(--line)", "transparent", `
      <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
        <b>${esc(nome || v.projetoId || "")}</b>
        <span class="tag${manual ? " amber" : ""}">${manual ? "escolhido à mão" : esc(PJC_NOME && PJC_NOME[v.origem] ? PJC_NOME[v.origem] : v.origem)}</span>
        <span class="tag">vinculado</span></div>
      <div class="hint" style="margin-bottom:7px">Ainda não congelado — ele congela quando o papel sair.</div>
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        <button type="button" class="btn sm" data-pjc-ped="ver"${dados}>${svg(IC.olho)}Ver projeto</button>
        <button type="button" class="btn sm" data-pjc-ped="trocar-ped"${dados}>${svg(IC.atualizar)}Trocar</button>
        <button type="button" class="btn sm ghost" data-pjc-ped="sem-ped"${dados}>Seguir sem projeto</button></div>`);
  }

  /* 3 · sem vínculo nenhum. Se existe regra que casa, ISTO É PENDÊNCIA — e é
     aqui que ela se resolve, não numa mensagem que manda procurar. */
  const e = pcEstadoDoSku(sku);
  if (!e.tem) {
    return caixa("var(--line)", "transparent", `
      <div><b>Nenhum projeto casa com ${esc(sku)}.</b></div>
      <div class="hint" style="margin-top:4px;margin-bottom:7px">O papel sai sem o bloco de corte. Se este SKU deveria ter projeto, crie um.</div>
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        <button type="button" class="btn sm" data-pjc-ped="criar-ped"${dados}>${svg(IC.mais)}Criar Projeto de Corte</button></div>`);
  }
  return caixa("var(--amber)", "var(--amber-soft)", `
    <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
      <b>${esc(e.nome || "")}</b>
      <span class="tag">${esc(PJC_NOME && PJC_NOME[e.escopo] ? PJC_NOME[e.escopo] : e.escopo)}</span>
      ${e.versao ? `<span class="tag">v${esc(String(e.versao))}</span>` : ""}
      <span class="tag amber">falta decidir</span></div>
    <div style="font-size:12px;color:var(--ink-2);margin-bottom:5px">${esc(pcResumoDoSnapshot(pcMontarSnapshot(sku)))}</div>
    <div class="hint" style="margin-bottom:7px">Este pedido ainda não tem Projeto de Corte gravado, e existe regra que vale para ${esc(sku)}. Enquanto não decidir, ele não entra na fila de corte.</div>
    <div style="display:flex;gap:7px;flex-wrap:wrap">
      <button type="button" class="btn sm primary" data-pjc-ped="usar-resolvido"${dados}>Usar projeto resolvido</button>
      <button type="button" class="btn sm" data-pjc-ped="trocar-ped"${dados}>${svg(IC.atualizar)}Trocar</button>
      <button type="button" class="btn sm" data-pjc-ped="criar-ped"${dados}>${svg(IC.mais)}Criar projeto</button>
      <button type="button" class="btn sm ghost" data-pjc-ped="sem-ped"${dados}>Seguir sem projeto</button></div>`);
}

/* a decisão tomada na janela do pedido. Aqui o pedido EXISTE, então ela vira
   vínculo imediatamente — não há rascunho onde esperar. */
async function pcDecidirNoPedido(pedidoId, escolha, projetoId) {
  const r = typeof pedidoPorId === "function" ? pedidoPorId(pedidoId) : null;
  if (!r) return { status: "invalido", motivo: "Pedido não encontrado." };
  if (pcCongelado(pedidoId)) {
    return { status: "congelado", motivo: "Este pedido já foi congelado — o projeto dele não muda mais." };
  }
  const sku = pcSkuDoPedido(r);
  if (escolha === "sem")      return pcSemProjeto(pedidoId);
  if (escolha === "manual")   return pcVincularDecidido(pedidoId, sku, pcDecidirManual(sku, projetoId));
  return pcVincularDecidido(pedidoId, sku, null);        /* o resolvido */
}

/* os pedidos de uma lista que ainda precisam de decisão — a janela dos papéis
   usa isto para oferecer o caminho em vez de só dizer que não deu */
function pcPendentesDe(pedidos) {
  const fora = [];
  for (const r of (pedidos || [])) {
    const id = String(r.id);
    if (pcVinculoDe(id)) continue;
    const sku = pcSkuDoPedido(r);
    if (!pcTemProjeto(sku)) continue;
    fora.push({ id, numero: r.numero, sku });
  }
  return fora;
}

/* o dono da decisão, de volta pelo que o botão carrega */
function pcAlvoDecisao(ctx, gi) {
  const m = (typeof S !== "undefined" && S.modal) || null;
  if (!m) return null;
  if (ctx === "lote") return (m.grupos || [])[Number(gi)] || null;
  return m;
}
