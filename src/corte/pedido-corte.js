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
    pcGuardar({ pedidoId: l.pedido_id, projetoId: l.projeto_id, versaoId: l.versao_id,
      origem: l.origem, congeladoEm: l.congelado_em, snapshot: l.snapshot, revision: l.revision });
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

function pcMontarSnapshot(sku) {
  const r = pcResolver(sku);
  if (!r) return { sem_projeto: true, sku: String(sku || "").toUpperCase() };
  const res = r.res;
  return {
    sku: r.sku,
    projeto: { id: r.projetoId, nome: r.nome, escopo: r.escopo },
    versao: { id: r.versaoId, versao: r.versao },
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
async function pcVincular(pedidoId, sku) {
  const id = String(pedidoId || "");
  if (!id) return { status: "invalido", motivo: "pedido sem id" };
  const v = pcVinculoDe(id);
  if (v && v.congeladoEm) return { status: "congelado", pedidoId: id, congeladoEm: v.congeladoEm };

  const r = pcResolver(sku);
  if (!r) return pcSemProjeto(id);

  const acao = cxEnfileirar("corte_vincular", id, {
    p_pedido_id: id, p_projeto_id: r.projetoId, p_versao_id: r.versaoId,
    p_origem: r.escopo, p_expected_revision: v ? v.revision : null,
  });
  pcGuardar({ pedidoId: id, projetoId: r.projetoId, versaoId: r.versaoId, origem: r.escopo });
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
    return { status: "ok", pedidoId: id, jaCongelado: true, congeladoEm: v.congeladoEm };
  }

  const snap = (v && v.origem === "sem") ? { sem_projeto: true, sku } : pcMontarSnapshot(sku);
  const acao = cxEnfileirar("corte_congelar", id, { p_pedido_id: id, p_snapshot: snap });

  /* o papel precisa do snapshot AGORA; a fila cuida de levá-lo ao servidor */
  pcGuardar({ pedidoId: id, snapshot: snap, congeladoEm: new Date().toISOString() });

  const d = await cxDrenar();
  const fim = pcDepois(d, id, acao && acao.opId, { snapshot: snap });
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

   Devolve três listas, e NÃO decide nada:
     prontos   · já congelados, ou congelados agora
     pendentes · o SKU resolve projeto, o pedido não tem vínculo e ninguém
                 disse que era para seguir sem. Quem pergunta é a tela
     erros     · tinha vínculo e o congelamento não passou. Estes param

   `na-fila` NÃO é erro: a ação está guardada e o snapshot está no cache, então
   o papel sai certo e a gravação vai quando a rede (ou a flag) permitir.
   --------------------------------------------------------------------------- */
async function pcPrepararPapeis(pedidos) {
  const prontos = [], pendentes = [], erros = [], semProjeto = [];
  for (const r of (pedidos || [])) {
    const id = String(r.id);
    const sku = pcSkuDoPedido(r);
    const v = pcVinculoDe(id);

    if (v && v.congeladoEm) { prontos.push(id); continue; }

    if (!v && !pcTemProjeto(sku)) { semProjeto.push(id); continue; }

    if (!v) { pendentes.push({ id, sku, numero: r.numero }); continue; }

    const fim = await pcCongelar(id, sku);
    if (fim.status === "ok" || fim.status === "na-fila") prontos.push(id);
    else erros.push({ id, numero: r.numero, status: fim.status, resposta: fim });
  }
  return { prontos, pendentes, erros, semProjeto,
           podeLiberar: erros.length === 0 && pendentes.length === 0 };
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
  const s = pcSnapshotDe(pedidoId);
  if (!s) return "";
  if (s.sem_projeto) return "sem Projeto de Corte";
  const p = (s.cortes || []).map((c) => `nº ${(c.fita && c.fita.numero) || "?"} ${pcCm(c.comprimentoMm).toLowerCase()}`);
  if (s.fitilho) p.push(`fitilho ${pcCm(s.fitilho.comprimentoMm).toLowerCase()}`);
  if (s.sortimento) p.push("sortido");
  return p.join(" · ");
}
