/* ---------- Histórico ---------- */
/* Eventos e histórico chegam quando a aba é aberta — não na abertura do app.
   São ~0,5 MB que só interessam a quem vai olhar o histórico. */
let _histCarregado = false;
async function carregarHistorico() {
  if (_histCarregado) return;
  _histCarregado = true;
  try {
    const [ev, hs] = await Promise.all([lerDoc(DOCS.eventos), lerDoc(DOCS.hist)]);
    if (Array.isArray(ev) && ev.length) {
      /* o que aconteceu nesta sessão antes de a aba abrir não pode sumir */
      const vistos = new Set(S.eventos.map((x) => x.id));
      S.eventos = [...ev.filter((x) => !vistos.has(x.id)), ...S.eventos];
    }
    if (hs) {
      const minha = S.hist?.serie || [];
      const dias = new Set(minha.map((p) => String(p.em).slice(0, 10)));
      S.hist = { ...hs, serie: [...(hs.serie || []).filter((p) => !dias.has(String(p.em).slice(0, 10))), ...minha]
        .sort((a, b) => String(a.em).localeCompare(String(b.em))).slice(-HIST_MAX) };
    }
    _eventosPuxados = true; _histPuxado = true;   /* já estão na memória: pode gravar */
    render();
  } catch { _histCarregado = false; }
}

function viewHistorico() {
  if (!_histCarregado) carregarHistorico();
  const h = S.historico;
  const b = h.busca.trim().toLowerCase();
  if (h.tipo === "movimentos") {
    let ev = S.eventos.slice().reverse();
    if (b) ev = ev.filter((e) => `${e.tipo} ${e.por || ""}`.toLowerCase().includes(b));
    const vis = ev.slice(0, h.limite);
    return `<div class="card">${filtrosHistorico(ev.length)}
      <div class="tw"><table class="t"><thead><tr><th>Quando</th><th>Quem</th><th>O que aconteceu</th><th>Mudança</th></tr></thead>
      <tbody>${vis.map((e) => `<tr>
        <td class="mono" style="font-size:11.5px;white-space:nowrap">${fdataHora(e.em)}</td>
        <td>${e.por ? `<span class="pessoa">${avatar(e.por)}${esc(e.por)}</span>` : '<span style="color:var(--ink-4)">—</span>'}</td>
        <td style="font-size:12.5px">${esc(e.tipo)}</td>
        <td style="font-size:11.5px;color:var(--ink-3)">${e.de || e.para ? esc([e.de ? JSON.stringify(e.de) : "", "→", e.para ? JSON.stringify(e.para) : ""].join(" ").slice(0, 70)) : "—"}</td></tr>`).join("")
        || vazioLinha("nada", "Ainda não há movimentos", "Cada ação no app aparece aqui, assinada por quem fez.")}
      </tbody></table></div>
      ${ev.length > vis.length ? `<div style="padding:10px 16px"><button class="btn sm" data-act="mais-hist">Mostrar mais</button></div>` : ""}</div>`;
  }
  if (h.tipo === "necessidades") {
    let r = S.ops.slice().sort((a, y) => String(y.criadoEm).localeCompare(String(a.criadoEm)));
    if (b) r = r.filter((o) => String(o.sku || "").toLowerCase().includes(b));
    const vis = r.slice(0, h.limite);
    return `<div class="card">${filtrosHistorico(r.length)}
      <div class="tw"><table class="t"><thead><tr><th>SKU</th><th>Prio</th><th>Situação</th>
        <th class="num">Necessária</th><th class="num">Programada</th><th class="num">Produzida</th><th class="num">Saldo</th>
        <th>Criada</th><th>Bloco</th><th class="num">Pedidos</th></tr></thead>
      <tbody>${vis.map((o) => `<tr>
        <td class="sku clickable" data-sku="${esc(o.sku)}">${esc(o.sku)}</td>
        <td>${corteCurto(o.prioridade)}</td>
        <td><span class="tag ${o.status === "pendente" ? "amber" : o.status === "em_producao" ? "teal" : ""}">${O_LABEL[o.status]}</span></td>
        <td class="num">${n0(o.qtdNecessaria)}</td><td class="num">${o.qtdProgramada ? n0(o.qtdProgramada) : "—"}</td>
        <td class="num">${o.qtdProduzida ? n0(o.qtdProduzida) : "—"}</td><td class="num">${o.saldoSemPedido ? n0(o.saldoSemPedido) : "—"}</td>
        <td class="mono" style="font-size:11.5px">${fdate(o.criadoEm)}</td>
        <td style="font-size:11.5px;color:var(--ink-3)">${esc((S.analises.find((a) => a.id === o.analiseOrigemId) || {}).rotulo || "migração")}</td>
        <td class="num">${pedidosDe(o.id).length || "—"}</td></tr>`).join("")}
      </tbody></table></div>
      ${r.length > h.limite ? `<div style="padding:14px;text-align:center;border-top:1px solid var(--line-2)"><button class="btn" data-act="mais-hist">Mostrar mais</button></div>` : ""}
    </div>`;
  }
  let r = S.pedidos.slice().sort((a, y) => String(y.criadoEm || "").localeCompare(String(a.criadoEm || "")));
  if (b) r = r.filter((x) => [x.numero, x.sku, x.prestadora].some((v) => String(v || "").toLowerCase().includes(b)));
  const vis = r.slice(0, h.limite);
  return `<div class="card">${filtrosHistorico(r.length)}
    <div class="tw"><table class="t"><thead><tr>${thOrd("hped", "numero", "Pedido")}${thOrd("hped", "sku", "SKU")}
      ${thOrd("hped", "prio", "Prio")}${thOrd("hped", "prest", "Prestadora")}${thOrd("hped", "qtd", "Qtd", "num")}
      ${thOrd("hped", "conf", "Conferida", "num")}${thOrd("hped", "criado", "Criado")}${thOrd("hped", "saida", "Saída")}
      ${thOrd("hped", "retorno", "Retorno")}${thOrd("hped", "etapa", "Etapa")}</tr></thead>
    <tbody>${ordenarPor("hped", vis, (x, campo) =>
        campo === "numero" ? x.numero : campo === "sku" ? (x.sku || x.op?.sku)
        : campo === "prio" ? (x.prioridade ?? 9) : campo === "prest" ? x.prestadora
        : campo === "qtd" ? (Number(x.qtd) || 0) : campo === "conf" ? (x.qtdConferida ?? null)
        : campo === "criado" ? x.criadoEm : campo === "saida" ? x.enviadaEm
        : campo === "retorno" ? x.retornadaEm : campo === "etapa" ? P_STATUS.indexOf(x.status) : null)
      .map((x) => `<tr>
      <td class="sku">${esc(x.numero || "")}</td>
      <td class="sku clickable" data-sku="${esc(x.sku || "")}">${esc(x.sku || "")}</td>
      <td>${corteCurto(x.prioridade)}</td>
      <td>${esc(x.prestadora || "—")}</td><td class="num">${n0(x.qtd)}</td>
      <td class="num">${x.qtdConferida != null ? n0(x.qtdConferida) : "—"}</td>
      <td class="mono" style="font-size:11.5px">${fdate(x.criadoEm)}</td>
      <td class="mono" style="font-size:11.5px">${fdate(x.enviadaEm)}</td>
      <td class="mono" style="font-size:11.5px">${fdate(x.retornadaEm)}</td>
      <td><span class="tag ${x.status === "retornada" ? "teal" : ""}">${P_LABEL[x.status]}</span></td></tr>`).join("")}
    </tbody></table></div>
    ${r.length > h.limite ? `<div style="padding:14px;text-align:center;border-top:1px solid var(--line-2)"><button class="btn" data-act="mais-hist">Mostrar mais</button></div>` : ""}
  </div>`;
}
function filtrosHistorico(total) {
  const h = S.historico;
  return `<div class="filters">
    <div class="search">${svg(IC.busca)}<input class="inp" id="q-hist" style="width:250px" placeholder="Buscar pedido, SKU ou prestadora" value="${esc(h.busca)}"></div>
    <button class="chip ${h.tipo === "pedidos" ? "on" : ""}" data-fh="pedidos">Pedidos de produção</button>
    <button class="chip ${h.tipo === "necessidades" ? "on" : ""}" data-fh="necessidades">Necessidades (análises)</button>
    <button class="chip ${h.tipo === "movimentos" ? "on" : ""}" data-fh="movimentos">Movimentos (quem fez o quê)</button>
    <span style="margin-left:auto;font-size:12.5px;color:var(--ink-3)" class="mono">${total.toLocaleString("pt-BR")} registros</span>
    <button class="btn" data-act="exp-hist">Exportar .xlsx</button></div>`;
}

function canhoto(r) {
  const sku = opPorId(r.opId)?.sku || r.sku || "";
  const prod = produtoDe(sku);
  const tpl = tplDoProcesso(r.processo || prod?.processo);
  const q = n0(r.qtd);
  const cx = '<span class="cx"></span>';
  const ckl = (nome) => `<span class="ckl">${cx} ${nome}</span>`; /* caixinha + nome sempre juntos, nunca quebra */
  const fill = (px) => `<span class="slip-preencher" style="min-width:${px}px"></span>`;
  const obsExt = String(r.obs || "").trim();
  /* ---------- o papel manda embalar SÓ o que foi mandado embalar ----------
     Produzir 250 e embalar 200 não é 250 embaladas com uma observação: as 50
     que sobram voltam SOLTAS, e depois entram num pedido novo de sobras para o
     pacote mix. Se o papel pedir 250 na etapa EMBALAGEM, é 250 que vão ser
     embaladas — e o mix já nasce impossível. */
  const dest = destinoPecas(r);
  const foraDaEmbalagem = dest.definido ? dest.mix + dest.resto : 0;
  const obsInt = [foraDaEmbalagem
    ? `EMBALAR SÓ ${n0(dest.embalar)} · AS OUTRAS ${n0(foraDaEmbalagem)} VOLTAM SOLTAS (MIX DEPOIS)` : "",
    r.obsInterna].filter(Boolean).join(" · ");
  /* etapas em LINHAS: o mesmo desenho cabe no cupom 80mm e no A4 */
  const usadas = etapasDoPedido(r);
  const ult = usadas[usadas.length - 1] || "";
  const etapas = /EMBALA/.test(ult) ? usadas.slice(0, -1) : usadas;
  return `<div class="slip">
    <div class="slip-band"><span class="slip-num" style="margin-left:0">PEDIDO Nº <b>${esc(r.numero)}</b></span>
      <span class="slip-proc" style="margin-left:auto">${esc(tpl.nome)}</span>
      <span class="pill ${r.prioridade === 0 ? "critico" : ""}">${CORTE_CURTO[r.prioridade] || ""}</span></div>
    <div class="slip-topo">
      <div class="slip-qr">${(() => { try { return QR.svg(`${PREFIXO_BIPE}${r.numero}`, { modulo: 3, quiet: 4 }); } catch { return ""; } })()}
        <small>PEDIDO ${esc(r.numero)}<br><b>BIPE P/ CONFERIR</b></small></div>
      ${(() => { /* 2º código do canhoto: o conteúdo é escolhido em Dados.
           SKU  -> só letras e números: o leitor entrega igual em qualquer teclado,
                   e bipar dentro do app abre o produto.
           LOJA -> o endereço da página: a câmera do celular abre a loja, e o leitor
                   também, DESDE QUE esteja no modo ALT (senão o teclado come a "/"). */
        const sk = sku || prod?.sku || "";
        const url = prod?.urlSite || "";
        const modo = S.cfg.qrProduto || "sku";
        if (modo === "loja") {
          if (!url) return `<div class="slip-qr"><small style="color:#5B6583">produto sem link<br>importe o catálogo</small></div>`;
          try { return `<div class="slip-qr">${QR.svg(url, { modulo: 3, quiet: 4, nivel: "L" })}
            <small>PRODUTO<br><b>ABRIR NA LOJA</b></small></div>`; } catch { return ""; }
        }
        if (!sk) return `<div class="slip-qr"><small style="color:#5B6583">sem SKU</small></div>`;
        try { return `<div class="slip-qr">${QR.svg(`${PREFIXO_PROD}${sk}`, { modulo: 3, quiet: 4 })}
          <small>PRODUTO<br><b>VER ESTOQUE</b></small></div>`; } catch { return ""; } })()}</div>
    <div class="slip-id">
      <div style="min-width:0"><div class="slip-sku">${esc(sku)}</div>
        <div class="slip-desc">${esc((prod?.descricao || "").slice(0, 58))} · criado ${fdate(r.criadoEm)}</div></div></div>
    <div class="slip-linha slip-flex"><b>CORTE:</b> <span class="cxbox"></span> <b>DATA:</b> <span class="cxbox"></span></div>
    ${(() => { /* v8.110 · O PROJETO DE CORTE, lido do SNAPSHOT congelado.
         Nunca resolvido de novo aqui: o papel conta o que valia quando o
         pedido foi liberado, e mexer no projeto depois não reescreve papel
         que já saiu. Pedido sem projeto (ou sem congelamento) não imprime
         bloco nenhum — e não imprime "sem projeto" tampouco, porque isso não
         é instrução de trabalho. */
      if (typeof pcBlocoPapel !== "function") return "";
      try { return pcBlocoPapel(r.id) || ""; } catch (e2) { return ""; }
    })()}
    ${tpl.check.length ? `<div class="slip-linha slip-ckl"><b class="ckl-tit">CHECK LIST:</b><div class="ckl-grade">${tpl.check.map((c2) => ckl(c2)).join("")}</div></div>` : ""}
    <div class="slip-linha slip-nome"><b>PRESTADORA:</b>${r.prestadora ? ` <b style="font-size:11px">${esc(r.prestadora)}</b>` : ""}</div>
    ${""/* a tabela vem logo depois do nome: é o trabalho que a prestadora executa e preenche.
          Os campos internos (corte, conferência, destino) ficam agrupados depois dela. */}
    <table class="slip-t"><colgroup><col style="width:40%"><col style="width:18%"><col style="width:18%"><col style="width:24%"></colgroup>
      <tr><th class="et">ETAPA</th><th class="qc" title="quantidade pedida (impressa)">PEDIDA</th><th class="qc" title="quantidade que foi produzida nesta etapa">FEITA</th><th class="qc" title="conferido pela equipe MB no retorno">CONF. MB</th></tr>
      ${(() => { /* toda etapa pede a quantidade do pedido — menos a de embalagem,
           que pede o que de fato vai ser embalado. */
        const qEmb = n0(dest.embalar);
        const linha = (nome, quanto, nota) => `<tr><td class="et">${nome}${nota ? `<div class="et-nota">${nota}</div>` : ""}</td>
          <td class="qc"><b class="qtd-g">${quanto}</b></td><td class="qc vazio"></td><td class="qc vazio"></td></tr>`;
        const nota = foraDaEmbalagem ? `${n0(foraDaEmbalagem)} voltam soltas` : "";
        return etapas.map((e2) => /EMBALA/.test(e2) ? linha(e2, qEmb, nota) : linha(e2, q)).join("")
          + linha("EMBALAGEM", qEmb, nota); })()}
      <tr class="emb"><td colspan="4">${(() => {
        const pr = prod?.producao || {};
        const mk = (on, nome) => `<span class="ckl"><span class="cx ${on ? "on" : ""}"></span> ${nome}</span>`;
        /* o que já está definido no cadastro sai afirmado, sem quadradinho:
           quem está na bancada não escolhe, só executa — e o papel encurta. */
        const tipo = pr.embalagemTipo;
        const tam = pr.embalagemTamanho ? ` &nbsp;·&nbsp; <b>TAM:</b> <b class="emb-def">${esc(pr.embalagemTamanho)}</b>` : "";
        const l1 = tipo
          ? `<b>EMBALAGEM:</b> <b class="emb-def">${esc(String(tipo).toUpperCase())}</b>${tam}`
          : `${mk(false, "FILIPETA")} ${mk(false, "PLÁSTICO")}${tam}`;
        const qn = Number(pr.qtdPorEmbalagem) || null;
        const l2 = qn
          ? `<b>QUANTIDADE POR EMBALAGEM:</b> <b class="qtd-g emb-def">${n0(qn)}</b>`
          : `<b>QUANTIDADE POR EMBALAGEM:</b> ${mk(false, "10")} ${mk(false, "30")} <span class="slip-preencher"></span>`;
        return `<div class="emb-l">${l1}</div><div class="emb-l">${l2}</div>`; })()}
      </td></tr></table>
    <div class="slip-linha slip-flex"><b>CONFER:</b> <span class="cxbox"></span> <b>DATA:</b> <span class="cxbox"></span></div>
    <div class="slip-linha slip-flex"><b>PACOTES P/ ESTOQUE:</b> <span class="linha-esc"></span></div>
    ${obsExt ? `<div class="slip-linha slip-obs"><b>OBS:</b> ${esc(obsExt.slice(0, 110))}</div>` : ""}
    ${obsInt ? `<div class="slip-linha slip-obs"><b>OBS MB:</b> ${esc(obsInt.slice(0, 110))}</div>` : ""}
    ${!obsExt && !obsInt ? `<div class="slip-linha"><b>OBS:</b></div>` : ""}
  </div>`;
}
function folhaPapeis(pedidos, modo) {
  const cab = modo === "cupom" ? "" : cabFolha("PAPÉIS DE PRODUÇÃO", `${n0(pedidos.length)} pedidos · ordem oficial da fila`);
  return `${cab}<div class="papeis">${pedidos.map(canhoto).join("")}</div>`;
}
function folhaPapeis(pedidos, modo) {
  const cab = modo === "cupom" ? "" : `${cabFolha("PAPÉIS DE PRODUÇÃO", `${n0(pedidos.length)} pedidos · ordem oficial da fila`)}
    <div class="slip-comofaz"><b>COMO PREENCHER:</b> siga as colunas na ordem <span class="slip-ord">1</span> → <span class="slip-ord">2</span> → <span class="slip-ord">3</span>. Em cada uma, escreva <b>seu nome</b> e a <b>quantidade feita</b>. Marque as caixinhas conforme concluir. Deu diferença ou faltou material? Anote no OBS e avise.</div>`;
  return `${cab}<div class="papeis">${pedidos.map(canhoto).join("")}</div>`;
}
function listaPapeis(ids) {
  const base = [...S.calc.papel, ...S.calc.fila];
  if (ids && ids.length) {
    /* por ids explícitos, vale qualquer pedido vivo — reimpressão de papel em produção incluída */
    return ids.map((id) => base.find((x) => x.id === id) || pedidoPorId(id))
      .filter((r) => r && PED_VIVO.includes(r.status))
      .map((r) => (r.linha ? r : { ...r, linha: S.calc.porSku.get(opPorId(r.opId)?.sku || r.sku) || null }));
  }
  /* seleção manual vale para qualquer etapa: reimprimir papel perdido de um pedido
     que já está cortado ou com a prestadora é rotina, não exceção */
  const vivos = [...S.calc.papel, ...S.calc.fila, ...S.calc.emCampo];
  if (S.sel.size) return vivos.filter((x) => S.sel.has(x.id));
  const v = S.pedView;
  let r = v.etapa === "fila" ? S.calc.fila
    : v.etapa === "papel" ? S.calc.papel
    : v.etapa === "cortando" ? S.calc.emCampo.filter((x) => x.status === "separando")
    : v.etapa === "prestadora" ? S.calc.emCampo.filter((x) => x.status === "enviada")
    : v.etapa === "chegou" ? S.calc.emCampo.filter((x) => x.status === "chegou")
    : v.etapa === "andamento" ? vivos
    : S.calc.papel;
  if (v.corte !== "todos") r = r.filter((o) => o.prioridade === Number(v.corte));
  if (v.setor !== "todos") r = r.filter((o) => setorDoPedido(o)?.id === v.setor);
  const b = (v.busca || "").trim().toLowerCase();
  if (b) r = r.filter((o) => `${o.numero} ${o.sku} ${o.linha?.descricao || ""}`.toLowerCase().includes(b));
  return r;
}

