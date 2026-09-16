/* ---------- a tela: o mesmo desenho da Demanda, com a régua da campanha ---------- */
function telaCampanhaPlano(c, its) {
  const v = S.festivasView;
  const FOK = FEST_CLASSES.map(([id]) => id);
  if (!FOK.includes(v.filtro2)) v.filtro2 = "acao";
  const todas = festLinhas(c);
  const nSit = (id) => id === "todos" ? todas.length
    : id === "acao" ? todas.filter((x) => /Produzir|Cobrar/.test(x.classe)).length
    : todas.filter((x) => x.classe === id).length;
  const daSituacao = (id) => id === "todos" ? todas
    : id === "acao" ? todas.filter((x) => /Produzir|Cobrar/.test(x.classe))
    : todas.filter((x) => x.classe === id);
  let r = daSituacao(v.filtro2);
  /* "Precisa de ação" é o filtro de entrada, e antes da análise NADA precisa de
     ação — a campanha inteira nasce sem meta. A tela ficava vazia com 120
     produtos vinculados logo ali, e parecia que eles tinham sumido. O filtro de
     entrada não esconde: quando ele não tem nada, mostra tudo e diz por quê. */
  let caiuPraTodos = false;
  if (!r.length && todas.length && v.filtro2 === "acao") { r = todas; caiuPraTodos = true; }
  const nBase = r.length;
  const b = (v.buscaPlano || "").trim().toLowerCase();
  if (b) r = r.filter((x) => (x.sku + " " + x.descricao).toLowerCase().includes(b));
  if (v.abcF !== "todos") r = r.filter((x) => x.abc === v.abcF);
  if (v.procF !== "todos") r = r.filter((x) => (x.processo || "") === v.procF);
  const filtros = [b && `busca "${(v.buscaPlano || "").trim()}"`, v.abcF !== "todos" && `curva ${v.abcF}`,
    v.procF !== "todos" && `processo ${v.procF}`].filter(Boolean);
  const ord = v.ord === "falta" ? "produzir" : (v.ord || "produzir"), dir = v.dir || -1;
  r = r.slice().sort((a, y) => { const va = a[ord], vy = y[ord];
    return typeof va === "string" ? String(va).localeCompare(String(vy)) * dir : ((va ?? 0) - (vy ?? 0)) * dir; });
  const vis = r.slice(0, v.limite || 60);

  /* as somas do topo respeitam a unidade de cada coluna: meta, vendido e
     coberto em PACOTE; a ordem de produção em PEÇA. Somar as duas num número só
     era o que fazia a campanha parecer coberta sem estar. */
  const meta = todas.reduce((t, x) => t + x.meta, 0);
  const vendido = todas.reduce((t, x) => t + x.vendido, 0);
  const coberto = Math.round(todas.reduce((t, x) => t + x.cobertoPac, 0));
  const necPacTotal = todas.reduce((t, x) => t + x.necPac, 0);
  const produzirTotal = todas.reduce((t, x) => t + x.produzir, 0);
  const misturaPacote = todas.some((x) => x.pac > 1);
  const semMeta = todas.filter((x) => x.meta <= 0).length;
  const aAplicar = festPrevia(c);
  const pendentes = aAplicar.novas.length + aAplicar.mudam.length;
  const vb = c.vendasBase, va = c.vendasAtual;
  const th = (id, rot, cls) => `<th class="s ${cls || ""}" data-festord="${id}">${rot}${ord === id ? (dir === 1 ? " ↑" : " ↓") : ""}</th>`;
  /* ---------- as mesmas ferramentas da Demanda ----------
     A lupa (copia o SKU e abre a loja) vale para TODA linha: ela não depende do
     estoque importado. Já o painel do produto lê de S.calc.porSku, e um SKU da
     campanha que não está no estoque não tem entrada lá — a linha ficaria
     clicável e não abriria nada. Por isso o clique só existe quando !semLinha.
     Clique morto é pior que clique que não existe: o primeiro faz a pessoa
     achar que o app travou e clicar de novo.
     Nota: o handler global já ignora cliques em button/select/input (regra da
     8.01), então a lupa e o checkbox dentro da linha não precisam de guarda. */
  const procs = [...new Set(todas.map((x) => x.processo).filter(Boolean))].sort();
  return `
    <div class="faixa-topo">
      <div style="flex:1;min-width:240px"><h3>1 · Trazer as vendas &nbsp;→&nbsp; 2 · Aplicar a análise &nbsp;→&nbsp; 3 · Criar os pedidos do saldo</h3>
        <p class="hint" style="margin:0">A régua desta campanha é o que ela vendeu no ano passado, não a média do ano. ${vb ? `Base de <b>${esc(fdate(vb.periodoIni) === "—" ? "período não informado" : fdate(vb.periodoIni) + " a " + fdate(vb.periodoFim))}</b>, ${n0(vb.n)} SKUs.` : "<b>Ainda sem a venda do ano anterior</b> — sem ela não há meta."}</p></div>
      <div style="display:flex;gap:8px;align-items:center;margin-left:auto">
        ${(() => { /* produto que nasceu este ano não tem ano passado — e isso não
             pode ser motivo para ele sumir da tela onde se decide o que produzir */
          const novos = todas.filter((x) => x.origemBase === "atual").length;
          const orfaos = todas.filter((x) => x.classe === "Sem base").length;
          if (!novos && !orfaos) return "";
          return `${novos ? `<button class="chip" data-festf="todos" title="Produtos sem venda no ano passado: a meta deles sai do ritmo desta campanha">${n0(novos)} ${novos === 1 ? "novo este ano" : "novos este ano"}</button>` : ""}
            ${orfaos ? `<button class="chip" data-festf="Sem base" title="Sem venda no ano passado e ainda sem venda nesta campanha — decida a quantidade à mão">${n0(orfaos)} sem base</button>` : ""}`; })()}
        ${!vb && its.length ? `<span class="tag amber">${n0(its.length)} ${its.length === 1 ? "produto esperando" : "produtos esperando"} a venda do ano anterior</span>` : ""}
        ${pendentes ? `<span class="tag amber">${n0(pendentes)} ${pendentes === 1 ? "meta a aplicar" : "metas a aplicar"}</span>` : ""}
        <button class="btn sm" data-act="fest-vendas">${svg(IC.upload)}Vendas da campanha</button>
        <button class="btn primary" data-act="fest-analise" ${vb ? "" : "disabled"} title="${vb ? "Recalcula a meta de cada produto e passa a valer" : "Traga primeiro a venda do ano anterior"}">${svg(IC.varinha)}Aplicar análise</button>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi clicavel ${v.filtro2 === "todos" ? "ativo" : ""}" data-festf="todos" role="button" tabindex="0" title="Ver os produtos que formam esta meta">
        <div class="lbl">Meta da campanha</div><div class="val">${n0(meta)} <span class="un">pacotes</span></div>
        <div class="foot">${n0(todas.length)} ${todas.length === 1 ? "produto" : "produtos"}${semMeta ? ` · ${n0(semMeta)} sem meta` : ""}</div></div>
      <div class="kpi"><div class="lbl">Já vendido</div><div class="val">${n0(vendido)} <span class="un">pacotes</span></div>
        <div class="foot">${va ? `relatório de ${fdate(va.periodoIni)} a ${fdate(va.periodoFim)}` : "sem venda da campanha importada"}</div></div>
      <div class="kpi"><div class="lbl">Já coberto</div><div class="val">${n0(coberto)} <span class="un">pacotes</span></div>
        <div class="foot">estoque + pronto novo + em produção</div></div>
      <div class="kpi clicavel ${produzirTotal ? "red" : ""} ${v.filtro2 === "acao" ? "ativo" : ""}" data-festf="acao" role="button" tabindex="0" title="Ver os produtos que ainda precisam de produção">
        <div class="lbl">Mandar produzir</div><div class="val">${n0(produzirTotal)} <span class="un">peças</span></div>
        <div class="foot">${misturaPacote ? `${n0(necPacTotal)} ${necPacTotal === 1 ? "pacote" : "pacotes"} × as peças de cada embalagem` : "o que falta mandar produzir"}</div></div>
    </div>
    <div class="card">
    <div class="filters">
      <div class="fb-linha fb-topo">
        <div class="search">${svg(IC.busca)}<input class="inp" id="q-festplano" style="width:250px" placeholder="Buscar SKU ou produto" value="${esc(v.buscaPlano || "")}"></div>
        <span class="flabel">${n0(r.length)} de ${n0(nBase)}</span>
        ${filtros.length ? `<button class="btn sm" data-act="fest-limpar">Limpar filtros (${filtros.length})</button>` : ""}
        ${S.sel.size ? `<button class="btn primary sm" data-act="fest-criar-sel">${svg(IC.mais)}Criar pedidos (${n0([...S.sel].filter((sk) => todas.some((x) => x.sku === sk)).length)})</button>` : ""}
        <button class="btn sm" style="margin-left:auto" data-festmodo="produtos">${svg(IC.mais)}Vincular produtos</button>
      </div>
      <div class="fb-linha">
        <span class="flabel">Situação</span>
        ${FEST_CLASSES.map(([id, nome]) => `<button class="chip ${(caiuPraTodos ? "todos" : v.filtro2) === id ? "on" : ""}" data-festf="${id}">${nome} <b>${n0(nSit(id))}</b></button>`).join("")}
        ${caiuPraTodos ? `<span class="hint" style="margin-left:6px">Nada precisa de ação ainda — mostrando os ${n0(todas.length)}.</span>` : ""}
      </div>
      <div class="fb-linha">
        <span class="flabel">Curva</span>
        ${["todos", "A", "B", "C"].map((x) => `<button class="chip ${v.abcF === x ? "on" : ""}" data-festabc="${x}">${x === "todos" ? "Todas" : x}</button>`).join("")}
        ${procs.length ? `<span class="divider"></span><span class="flabel">Processo</span>
          <button class="chip ${v.procF === "todos" ? "on" : ""}" data-festproc="todos">Todos</button>
          ${procs.map((p) => `<button class="chip ${v.procF === p ? "on" : ""}" data-festproc="${esc(p)}">${esc(p)}</button>`).join("")}` : ""}
      </div>
    </div>
    <div class="tw"><table class="t">
      <thead>
        <tr class="grupos"><th colspan="2">PRODUTO</th><th colspan="3">CAMPANHA · PACOTES</th><th colspan="3">ESTOQUE E PRODUÇÃO</th><th colspan="2">VENDA ATUAL</th><th colspan="2">DECISÃO</th></tr>
        <tr><th style="width:1%"></th>${th("sku", "SKU")}${th("base", "Venda anterior", "num")}<th class="num">Cresc.</th>${th("meta", "Meta", "num")}
        ${th("estoque", "Estoque <i>pac</i>", "num")}${th("programado", "Em produção <i>pç</i>", "num")}<th class="num">Pronto <i>pç</i></th>
        ${th("vendido", "Vendido", "num")}${th("ritmo", "Ritmo")}${th("produzir", "A produzir <i>pç</i>", "num")}<th>Ação</th></tr>
      </thead><tbody>
      ${vis.map((x) => `<tr class="${x.semLinha ? "" : "clickable"}"${x.semLinha ? "" : ` data-sku="${esc(x.sku)}" title="Clique no SKU para copiar · clique duas vezes para abrir o produto"`}>
        <td>${x.classe !== "Coberto" ? `<input type="checkbox" class="chk" data-seldem="${esc(x.sku)}" ${S.sel.has(x.sku) ? "checked" : ""} aria-label="Selecionar ${esc(x.sku)}">` : ""}</td>
        <td class="tcell"><div class="p sku sku-trunc" style="font-size:13px;letter-spacing:0" title="${esc(x.sku)} — ${esc(x.descricao)}">${esc(x.sku)}</div>
          <div class="s"><span class="abc ${x.abc}">${x.abc}</span>${x.processo ? `<span>${esc(x.processo)}</span>` : ""}
            <span class="tag" style="font-size:9.5px" title="${x.comportamento === "reforco" ? "Vende o ano todo — continua também na Demanda" : "Produto só desta data — não aparece na Demanda"}">${x.comportamento === "reforco" ? "ano todo" : "só na data"}</span>
            ${x.semLinha ? '<span class="tag amber" style="font-size:9.5px" title="SKU fora do estoque importado — o painel do produto não tem o que mostrar, mas a lupa continua abrindo a loja">fora do estoque</span>' : ""}
            <button class="lupa" data-loja="${esc(x.sku)}" title="Copiar o SKU e abrir na loja">${svg(IC.busca)}</button></div></td>
        <td class="num tcell">${x.base ? n0(x.base)
            : `<span style="color:var(--ink-4)" title="Este produto não vendeu na campanha do ano passado — provavelmente nasceu este ano">não existia</span>`}${x.baseMao ? ' <span class="tag" style="font-size:9.5px;padding:0 4px" title="Base digitada à mão">à mão</span>' : ""}
          ${(x.it.baseSkus || []).length ? `<div class="s" style="justify-content:flex-end" title="${esc((x.it.baseSkus || []).join(", "))}">${n0((x.it.baseSkus || []).length)} SKU antigo</div>` : ""}</td>
        <td class="num" style="color:var(--ink-3)">${Number(c.crescimento) > 0 ? "+" : ""}${Number(c.crescimento) || 0}%</td>
        <td class="num tcell"><b>${n0(x.meta)}</b>${x.metaMao != null ? ' <span class="tag" style="font-size:9.5px;padding:0 4px" title="Meta cravada à mão">aj.</span>' : ""}
          <div class="s" style="justify-content:flex-end">${feReguaTag(x)}</div>
          ${x.semAnalise && x.metaCalc > 0 ? `<div class="s" style="justify-content:flex-end"><span class="tag amber" style="font-size:9.5px" title="Ainda não foi aplicada — toque em Aplicar análise">sugerida</span></div>`
            : x.divergeMeta ? `<div class="s" style="justify-content:flex-end"><span style="color:var(--amber);font-weight:700" title="A base ou o crescimento mudaram desde a última análise">sug. ${n0(x.metaCalc)}</span></div>` : ""}</td>
        <td class="num"><b>${n0(x.estoque)}</b></td>
        <td class="num">${x.programado ? n0(x.programado) : "—"}</td>
        <td class="num tcell">${x.pronto ? n0(x.pronto) : "—"}${x.prontoNovo ? `<div class="s" style="justify-content:flex-end"><span class="tag" style="font-size:9.5px" title="Ficou pronto depois da última importação do estoque — por isso ainda não está no número do estoque">${n0(x.prontoNovo)} fora do estoque</span></div>` : ""}</td>
        <td class="num">${x.vendido ? n0(x.vendido) : "—"}</td>
        <td class="tcell">${x.ritmo == null ? '<span style="color:var(--ink-4)">—</span>'
          : `<span class="tag ${x.ritmo > 0.1 ? "teal" : x.ritmo < -0.1 ? "amber" : ""}" title="${Math.round(x.pctVenda * 100)}% da meta vendida com ${Math.round(x.pctTempo * 100)}% do tempo da campanha corrido">${x.ritmo > 0.1 ? "acima" : x.ritmo < -0.1 ? "abaixo" : "no ritmo"}</span>`}</td>
        <td class="num tcell">${x.produzir > 0
          ? `<b style="color:var(--${FEST_COR[x.classe] === "red" ? "red" : "amber"})">${n0(x.produzir)}</b>
             ${x.pac > 1 ? `<div class="s" style="justify-content:flex-end"><span title="Necessidade comercial de ${n0(x.necPac)} ${x.necPac === 1 ? "pacote" : "pacotes"}, com ${n0(x.pac)} peças em cada um">${n0(x.necPac)} pac × ${n0(x.pac)}</span></div>` : ""}`
          : '<span style="color:var(--ink-4)">—</span>'}</td>
        <td><div style="display:flex;gap:5px;align-items:center">
          <span class="tag dot ${FEST_COR[x.classe] || ""}" title="${esc(x.classe)}">${esc(x.classe)}</span>
          ${x.produzir > 0
            ? `<button class="btn sm" data-festcriar="${esc(x.sku)}" title="Criar pedido de ${n0(x.produzir)} peças — ele vai para a aba Pedidos">${svg(IC.mais)}</button>`
            : x.classe !== "Coberto"
              /* sem meta não quer dizer sem produção: é justamente aqui que ela
                 decide na mão. O botão abre com um pacote e ela ajusta. */
              ? `<button class="btn sm ghost" data-festcriar="${esc(x.sku)}" title="Sem meta calculada — abre o pedido para você digitar a quantidade">${svg(IC.mais)}</button>`
              : ""}
          <button class="ic-btn" data-festitem="${esc(x.sku)}" title="Base histórica e meta à mão" aria-label="Ajustar">${svg(IC.editar)}</button>
        </div></td>
      </tr>`).join("")
      || `<tr><td colspan="12" style="padding:30px;text-align:center;color:var(--ink-3)">
        ${!todas.length ? `<div style="font-weight:700;color:var(--ink-2);margin-bottom:6px">Nenhum produto na campanha ainda</div>
            <div style="max-width:460px;margin:0 auto 12px">Procure um pedaço do código — <b>DF.H.</b> para Halloween — e traga todos de uma vez.</div>
            <button class="btn primary sm" data-festmodo="produtos">Vincular produtos</button>`
          : filtros.length ? `<div style="margin-bottom:10px"><b>${n0(nBase)}</b> ${nBase === 1 ? "produto está" : "produtos estão"} nesta situação, ${nBase === 1 ? "escondido" : "todos escondidos"} pelos filtros: <b>${esc(filtros.join(" · "))}</b></div>
            <button class="btn primary sm" data-act="fest-limpar">Limpar filtros</button>`
          : `<div style="font-weight:700;color:var(--ink-2);margin-bottom:6px">Nada nesta situação</div>
            <div style="max-width:460px;margin:0 auto 12px">Os ${n0(todas.length)} produtos da campanha estão em <b>Todos</b>.</div>
            <button class="btn sm" data-festf="todos">Ver todos</button>`}</td></tr>`}
      </tbody></table></div>
      ${r.length > (v.limite || 60) ? `<div style="padding:14px;text-align:center;border-top:1px solid var(--line-2)"><button class="btn" data-act="fest-mais">Mostrar mais</button></div>` : ""}
      ${porque("Como esta tela calcula", `
        <div><b>Meta</b> = venda desta campanha no ano anterior × (1 + crescimento). A venda anterior soma o próprio SKU e os SKUs antigos que você marcou como base — juntar histórico não junta estoque.</div>
        <div><b>Produto que nasceu este ano</b> não tem ano passado, e por isso ficava sem meta e fora da lista. Agora a régua dele é o <b>ritmo desta campanha</b>: o que ele já vendeu, projetado pelo tempo que ainda falta. A etiqueta <b>ritmo 2026</b> na coluna Meta diz quando o número veio daí. A projeção nunca fica abaixo do que já foi vendido, e só começa depois de 5% do tempo da campanha — antes disso, dividir pelo tempo corrido transformaria dois dias de venda numa meta inventada.</div>
        <div><b>Sem base</b> é o produto que não vendeu nem no ano passado nem agora. Não há o que projetar, então o app não inventa meta — mas ele continua na lista, com botão de criar pedido, para você decidir a quantidade.</div>
        <div><b>A loja vende pacote; a fábrica produz peça.</b> Meta, venda e estoque desta tela estão em <b>pacotes</b> — é assim que o relatório e o ERP contam. O que está em produção e o que ficou pronto estão em <b>peças</b>, porque é assim que o pedido nasce. Para somar, o app divide as peças pelo tamanho do pacote; para mandar produzir, multiplica de volta.</div>
        <div><b>A produzir</b> = (meta − já vendido − estoque − pronto fora do estoque − em produção nesta campanha), arredondado para o pacote inteiro e <b>multiplicado pelas peças de cada pacote</b>. Um SKU de pacote com 10 que precisa de 37 pacotes vira uma ordem de <b>370 peças</b>. O número de peças por pacote vem do cadastro do produto — não é fixo: há pacote de 5, de 30 e há produto unitário.</div>
        <div>Pedido normal do mesmo produto não entra: aquilo é o dia a dia, e já conta na Demanda.</div>
        <div><b>Pronto fora do estoque</b> existe para não contar a mesma peça duas vezes: o que foi conferido depois da última importação ainda não apareceu no número do estoque.</div>
        <div><b>Ritmo</b> compara quanto da meta já vendeu com quanto do tempo da campanha já passou. Supõe venda espalhada por igual — não temos a curva de venda do ano passado, só o total.</div>`)}
    </div>`;
}

/* ---------- Produtos da campanha: o cadastro do vínculo ---------- */
function telaCampanhaProdutos(c) {
  const v = S.festivasView;
  const its = itensDaCampanha(c).slice().sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
  const jaTem = its.map((i) => i.sku);
  /* Vincular Halloween é procurar "DF.H." e trazer os quarenta de uma vez. Um
     por um não é trabalho de gente. */
  const r = festBuscaSku(v.busca, jaTem, 60);
  const marcados = (v.selAdd || []).filter((sk) => r.todos.some((a) => a.sku === sk));
  const selProd = (v.selProd || []).filter((sk) => jaTem.includes(sk));
  const compAdd = v.compAdd || "exclusivo";
  return `
    ${selProd.length ? `<div class="fb-linha fb-topo" style="padding:12px 14px;border-bottom:1px solid var(--line-2);background:var(--surface-2)">
      <span class="flabel">${n0(selProd.length)} ${selProd.length === 1 ? "selecionado" : "selecionados"}</span>
      <select class="sel" id="fest-comp-lote"><option value="">Mudar comportamento…</option>
        ${FEST_COMP.map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select>
      ${selProd.length === 2 ? `<button class="btn sm" data-act="fest-unir-sel" title="Os dois SKUs são o mesmo produto ao longo do tempo — você escolhe qual permanece">Unir produtos (2)</button>` : ""}
      <button class="btn danger sm" data-act="fest-tirar-lote">${svg(IC.lixeira)}Tirar da campanha</button>
      <button class="btn sm ghost" style="margin-left:auto" data-act="fest-limpar-sel">Limpar seleção</button>
    </div>` : ""}
    <div class="tw"><table class="t"><thead><tr>
      <th style="width:1%"><input type="checkbox" class="chk" data-festselall="1" ${its.length && selProd.length === its.length ? "checked" : ""} aria-label="Selecionar todos"></th>
      <th>SKU</th><th>Produto</th><th>Comportamento</th><th>Base histórica</th><th></th>
    </tr></thead><tbody>
    ${its.map((i) => { const h = situacaoHojeDoSku(i.sku);
      const base = (i.baseSkus || []).length;
      return `<tr data-linha="${esc(i.sku)}">
      <td><input type="checkbox" class="chk" data-festselp="${esc(i.sku)}" ${selProd.includes(i.sku) ? "checked" : ""} aria-label="Selecionar ${esc(i.sku)}"></td>
      <td class="tcell"><div class="p sku sku-trunc" style="font-size:13px;letter-spacing:0" title="${esc(i.sku)}">${esc(i.sku)}</div>
        ${h.achou ? "" : '<div class="s"><span class="tag amber" title="Este SKU não está no estoque importado nem no cadastro — confira o código">fora do estoque</span></div>'}</td>
      <td class="tcell"><div class="p">${esc(h.descricao || "—")}</div></td>
      <td class="tcell"><select class="sel" style="padding:3px 8px;font-size:12px" data-festcomp="${esc(i.sku)}" title="Só na data sai da Demanda; ano todo + reforço continua nela">
        ${FEST_COMP.map(([k, n]) => `<option value="${k}"${i.comportamento === k ? " selected" : ""}>${n}</option>`).join("")}</select>
        <div class="s">${i.comportamento === "reforco" ? "continua na Demanda" : "fora da Demanda"}</div></td>
      <td class="tcell">${base ? `<div class="p" title="${esc((i.baseSkus || []).join(", "))}">${n0(base)} ${base === 1 ? "SKU" : "SKUs"}</div>` : '<span style="color:var(--ink-4)">—</span>'}
        ${i.baseManual != null && i.baseManual !== "" ? `<div class="s"><span class="tag" title="Base digitada à mão, no lugar do que vier do relatório">à mão: ${n0(i.baseManual)}</span></div>` : ""}
        <div class="s"><button class="btn sm ghost" style="padding:1px 7px;font-size:11px" data-festitem="${esc(i.sku)}">base e meta</button></div></td>
      <td><button class="ic-btn" data-festtirar="${esc(i.sku)}" title="Tirar este produto da campanha" aria-label="Tirar">${svg(IC.lixeira)}</button></td>
    </tr>`; }).join("")
    || `<tr><td colspan="6" style="padding:26px;text-align:center;color:var(--ink-3)">Nenhum produto vinculado ainda — use a busca abaixo.</td></tr>`}
    </tbody></table></div>

    <div style="padding:14px;border-top:1px solid var(--line-2)">
      <div style="font-weight:700;font-size:12px;margin-bottom:6px">Vincular produtos à campanha</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input class="inp" id="q-fest" placeholder="Procure um pedaço do código: DF.H., BAN, NATAL…" value="${esc(v.busca)}" style="max-width:420px">
        ${v.busca.trim().length >= 2 ? `<span class="flabel">${n0(r.total)} ${r.total === 1 ? "encontrado" : "encontrados"}</span>` : ""}
      </div>
      ${v.busca.trim().length >= 2 ? (r.total ? `
        <div class="fb-linha" style="padding:10px 0 4px">
          <button class="btn sm" data-act="fest-marcar-todos">${marcados.length === r.total ? "Desmarcar todos" : `Marcar os ${n0(r.total)}`}</button>
          <select class="sel" id="fest-comp-add" title="Como estes produtos entram na campanha">
            ${FEST_COMP.map(([k, n]) => `<option value="${k}"${compAdd === k ? " selected" : ""}>Entra como: ${n}</option>`).join("")}</select>
          ${marcados.length ? `<button class="btn primary sm" data-act="fest-add-lote">${svg(IC.mais)}Adicionar ${n0(marcados.length)} ${marcados.length === 1 ? "produto" : "produtos"}</button>` : ""}
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;margin-top:6px;max-height:340px;overflow:auto;border:1px solid var(--line-2);border-radius:9px;padding:6px">
          ${r.itens.map((a) => `<label class="fest-op ${marcados.includes(a.sku) ? "on" : ""}">
            <input type="checkbox" class="chk" data-festmarcar="${esc(a.sku)}" ${marcados.includes(a.sku) ? "checked" : ""}>
            <span class="sku">${esc(a.sku)}</span><span style="color:var(--ink-3)">${esc(a.desc || "")}</span></label>`).join("")}
          ${r.total > r.itens.length ? `<div class="hint" style="padding:6px">+${n0(r.total - r.itens.length)} não couberam na tela — <b>Marcar os ${n0(r.total)}</b> pega todos, inclusive esses.</div>` : ""}
        </div>` : `<div class="hint" style="margin-top:8px">Nenhum SKU com “${esc(v.busca)}” fora dos que já estão na campanha.</div>`) : ""}
    </div>
    ${porque("Só na data · ano todo + reforço", `
      <div><b>Só na data:</b> o produto <b>sai da aba Demanda</b>. Ele vende quase tudo em poucas semanas, e a média do período diria bobagem sobre ele o ano inteiro. Quem planeja é esta aba.</div>
      <div><b>Ano todo + reforço:</b> continua na Demanda normalmente, com a etiqueta da campanha, <b>e</b> aparece aqui. Mesmo SKU, duas análises — não é produto duplicado nem estoque duplicado.</div>
      <div><b>Base histórica</b> é de onde a projeção parte: os SKUs antigos que somam, ou um número digitado. Juntar histórico <b>não</b> junta estoque físico.</div>`)}`;
}

/* ---------- janelas de Datas festivas (vendas, análise, item) ---------- */
function modalFestVendas(m) {
  const c = campanhaPorId(m.campanhaId);
  if (!c) return "";
  const v = S.festivasView;
  const bloco = (qual, titulo, dica) => {
    const d = qual === "base" ? c.vendasBase : c.vendasAtual;
    const nEncontrados = qual === "base"
      ? itensDaCampanha(c).filter((it) => festVendaAnterior(c, it) > 0).length
      : itensDaCampanha(c).filter((it) => Number(((d && d.porSku) || {})[it.sku]) > 0).length;
    return `<div style="border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <b style="font-size:13.5px">${titulo}</b>
        ${d ? `<span class="tag">${n0(d.n)} SKUs</span><span class="tag">${d.origem === "csv" ? "do arquivo" : "do relatório do app"}</span>`
            : '<span class="tag amber">ainda não trazida</span>'}
      </div>
      <div class="hint" style="margin:6px 0 10px">${dica}</div>
      ${d ? `<div class="kv" style="padding:6px 0"><span>Período declarado</span>
        <b>${d.periodoIni ? `${fdate(d.periodoIni)} a ${fdate(d.periodoFim)}` : "não informado"}</b></div>
        <div class="kv" style="padding:6px 0"><span>Trazida em</span><b>${fdataHora(d.em)}</b></div>
        <div class="kv" style="padding:6px 0"><span>Produtos da campanha encontrados</span>
        <b${nEncontrados ? "" : ' style="color:var(--amber)"'}>${n0(nEncontrados)} de ${n0(itensDaCampanha(c).length)}</b></div>` : ""}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0">
        <label class="fld"><span>Período de</span><input type="date" class="inp" id="fv-ini-${qual}" value="${esc((d && d.periodoIni) || "")}"></label>
        <label class="fld"><span>até</span><input type="date" class="inp" id="fv-fim-${qual}" value="${esc((d && d.periodoFim) || "")}"></label>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primary sm" data-festimp="${qual}">${svg(IC.upload)}Importar CSV da Magazord</button>
        <button class="btn sm" data-festapp="${qual}" title="Usa o número que já está no app — do período do último relatório importado">Puxar do que o app já tem</button>
        ${d ? `<button class="btn danger sm" data-festlimpar="${qual}" style="margin-left:auto">Descartar</button>` : ""}
      </div>
    </div>`;
  };
  return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(720px, 96vw)" role="dialog" aria-label="Vendas da campanha">
    <div class="modal-h"><h2>Vendas de ${esc(c.nome)}${c.ano ? " " + c.ano : ""}</h2>
      <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
    <div class="modal-b">
      <p class="hint" style="margin:0 0 14px">O app não guarda venda por data — ele tem um total por período. Então a venda desta campanha entra por aqui: exporte da Magazord a <b>Consulta Dinâmica</b> com as datas da campanha e solte o arquivo. Daqui para frente, a campanha se alimenta só por esta janela.</p>
      ${bloco("base", "Venda do ano anterior", "É a régua da meta. Ex.: Festa Junina — 01/05/2025 a 30/06/2025.")}
      ${bloco("atual", "Venda desta campanha, até agora", "É o acompanhamento. Reimporte de tempos em tempos para ver o ritmo.")}
    </div>
    <div class="modal-f"><div style="margin-left:auto"><button class="btn" data-fechar="1">Fechar</button></div></div>
  </div></div>`;
}

function modalFestAnalise(m) {
  const c = campanhaPorId(m.campanhaId);
  if (!c) return "";
  const p = festPrevia(c);
  const linha = (rot, n, cor) => `<div class="kv" style="padding:8px 0"><span>${rot}</span><b${cor ? ` style="color:var(--${cor})"` : ""}>${n0(n)}</b></div>`;
  return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(680px, 96vw)" role="dialog" aria-label="Aplicar análise da campanha">
    <div class="modal-h"><h2>Aplicar análise</h2><span class="tag">${esc(c.nome)}</span>
      <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
    <div class="modal-b">
      <p class="hint" style="margin:0 0 14px">A meta de cada produto passa a ser <b>venda do ano anterior × (1 + ${Number(c.crescimento) || 0}%)</b>. Para quem <b>não vendeu no ano passado</b> — produto lançado este ano — a meta vem da projeção pelo ritmo desta campanha. Depois de aplicada ela fica valendo, e não muda sozinha quando você importar vendas de novo. Produto com meta cravada à mão não é tocado.</p>
      ${linha("Produtos com meta nova", p.novas.length, p.novas.length ? "teal-2" : "")}
      ${linha("Metas que mudam de valor", p.mudam.length, p.mudam.length ? "amber" : "")}
      ${linha("Sem base para calcular", p.zeradas.length, p.zeradas.length ? "amber" : "")}
      <div class="kv" style="padding:8px 0;border-top:1px solid var(--line)"><span><b>Meta total da campanha</b></span>
        <b style="font-size:16px">${n0(p.total)} pacotes</b></div>
      ${p.antes ? `<div class="hint">Antes desta análise: ${n0(p.antes)} pacotes.</div>` : ""}
      ${(() => { /* o que a meta vira em produção: é o número que a fábrica precisa
           saber, e ele não é o mesmo da meta quando o produto sai em pacote */
        const pc = festLinhas(c).reduce((t, x) => t + Math.max(0, Math.ceil(x.metaCalc - 1e-9)) * x.pac, 0);
        return pc && pc !== p.total ? `<div class="hint" style="line-height:1.6">
          A meta está em <b>pacotes</b>, que é como a loja vende. Produzir tudo isso do zero seria
          <b>${n0(pc)} peças</b> — a fábrica trabalha em peça, e a coluna <b>A produzir</b> já faz essa conta
          para cada produto, descontando estoque e o que está em produção.</div>` : ""; })()}
      ${p.mudam.length ? `<div class="tw" style="max-height:240px;margin-top:12px"><table class="t" style="font-size:12px">
        <thead><tr><th>SKU</th><th class="num">Meta agora</th><th class="num">Meta nova</th></tr></thead>
        <tbody>${p.mudam.slice(0, 40).map((x) => `<tr><td class="sku">${esc(x.sku)}</td>
          <td class="num" style="color:var(--ink-3)">${n0(x.metaAplicada)}</td><td class="num"><b>${n0(x.metaCalc)}</b></td></tr>`).join("")}</tbody></table></div>` : ""}
      ${(() => { const novos = p.ls.filter((x) => x.origemBase === "atual").length;
        return novos ? `<div class="aviso" style="margin-top:12px;border-color:var(--teal);background:var(--teal-soft)">
          <b>${n0(novos)} ${novos === 1 ? "produto nasceu" : "produtos nasceram"} este ano</b> e ${novos === 1 ? "recebeu" : "receberam"} meta pelo ritmo desta campanha, não pelo ano anterior.</div>` : ""; })()}
      ${p.zeradas.length ? `<div class="aviso" style="margin-top:12px"><b>${n0(p.zeradas.length)} ${p.zeradas.length === 1 ? "produto ficou" : "produtos ficaram"} sem meta</b> — ${p.zeradas.length === 1 ? "ele não vendeu" : "eles não venderam"} no ano passado nem nesta campanha, então não há de onde projetar. Use a <b>base à mão</b>, marque os SKUs antigos que somam, ou mande produzir a quantidade que você decidir.</div>` : ""}
    </div>
    <div class="modal-f"><div style="margin-left:auto;display:flex;gap:8px">
      <button class="btn" data-fechar="1">Cancelar</button>
      <button class="btn primary" data-act="fest-aplicar">Aplicar em ${n0(p.ls.length)} ${p.ls.length === 1 ? "produto" : "produtos"}</button></div></div>
  </div></div>`;
}

function modalFestItem(m) {
  const c = campanhaPorId(m.campanhaId);
  const it = itensDaCampanha(c).find((i) => i.sku === m.sku);
  if (!c || !it) return "";
  const x = festLinha(c, it);
  const base = it.baseSkus || [];
  const r = festBuscaSku(S.festivasView.buscaBase, [it.sku, ...base], 10);
  return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(680px, 96vw)" role="dialog" aria-label="Produto da campanha">
    <div class="modal-h"><h2>${esc(it.sku)}</h2><span class="tag">${esc(x.descricao || "")}</span>
      <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
    <div class="modal-b">
      <div class="kv" style="padding:7px 0"><span>Venda do ano anterior (do relatório)</span><b>${n0(x.baseAuto)}</b></div>
      <div class="kv" style="padding:7px 0"><span>Crescimento da campanha</span><b>${Number(c.crescimento) > 0 ? "+" : ""}${Number(c.crescimento) || 0}%</b></div>
      <div class="kv" style="padding:7px 0"><span>Meta calculada</span><b>${n0(x.metaCalc)}</b></div>
      <div class="kv" style="padding:7px 0"><span>Meta valendo agora</span><b style="font-size:15px">${n0(x.meta)} <span style="font-weight:600;color:var(--ink-3);font-size:11.5px">pacotes</span></b></div>
      ${x.produzir > 0 ? `<div class="aviso" style="margin:10px 0 0;border-color:var(--teal);background:var(--teal-soft)">
        <div style="display:grid;grid-template-columns:1fr auto;gap:4px 14px;font-size:13px">
          <span>Necessidade comercial</span><b>${n0(x.necPac)} ${x.necPac === 1 ? "pacote" : "pacotes"}</b>
          <span>Peças por pacote (do cadastro)</span><b>${n0(x.pac)}</b>
          <span style="font-weight:700">Quantidade a produzir</span><b style="font-size:15px">${n0(x.produzir)} peças</b>
        </div>
        ${x.pac === 1 ? `<div class="hint" style="margin:6px 0 0">Este produto é unitário — pacote e peça são a mesma coisa aqui.</div>`
          : `<div class="hint" style="margin:6px 0 0">É este número que vai para o pedido de produção. A loja vende pacote; a fábrica produz peça.</div>`}</div>`
        : ""}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0">
        <label class="fld"><span>Base à mão (pacotes)</span>
          <input class="inp" id="fi-base" type="number" inputmode="numeric" value="${it.baseManual == null ? "" : esc(String(it.baseManual))}" placeholder="deixe vazio para usar o relatório">
          <div class="hint" style="margin-top:4px">Entra no lugar do número do relatório — na mesma unidade dele, que é o pacote.</div></label>
        <label class="fld"><span>Meta à mão (pacotes)</span>
          <input class="inp" id="fi-meta" type="number" inputmode="numeric" value="${it.metaManual == null ? "" : esc(String(it.metaManual))}" placeholder="deixe vazio para calcular">
          <div class="hint" style="margin-top:4px">Cravada, a análise não mexe mais nela.</div></label>
      </div>

      <div style="font-weight:700;font-size:12px;margin-bottom:6px">SKUs antigos que somam na base</div>
      <p class="hint" style="margin:0 0 8px">Para quando dois produtos viraram um só. Isto é <b>só para projetar</b>: o estoque que sobrou dos antigos continua sendo deles.</p>
      ${base.length ? `<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:12px">
        ${base.map((sk) => `<div class="kv" style="padding:6px 0"><span class="sku">${esc(sk)}${(c.vendasBase?.porSku || {})[sk] ? ` <span style="color:var(--ink-3);font-weight:400">· ${n0((c.vendasBase.porSku)[sk])} no ano anterior</span>` : ""}</span>
          <button class="btn sm ghost" data-festbasetirar="${esc(sk)}">tirar</button></div>`).join("")}
      </div>` : ""}
      <input class="inp" id="q-festbase" placeholder="Procurar o SKU antigo…" value="${esc(S.festivasView.buscaBase)}">
      ${S.festivasView.buscaBase.trim().length >= 2 ? (r.itens.length ? `<div style="display:flex;flex-direction:column;gap:7px;margin-top:8px">
        ${r.itens.map((a) => `<div class="fest-achado">
          <div class="fest-achado-sku"><span class="sku">${esc(a.sku)}</span>
            <span style="color:var(--ink-3)">${esc(a.desc || "")}</span></div>
          <div class="fest-achado-bts">
            <button class="btn sm ghost" data-festbaseadd="${esc(a.sku)}"
              title="Soma as vendas antigas deste SKU na base de ${esc(it.sku)}. Não mexe em cadastro.">Usar como base histórica</button>
          </div></div>`).join("")}
        <div class="hint" style="margin-top:2px">São o mesmo produto ao longo do tempo? Isso é <b>Unir produtos</b>: selecione os dois em Produtos da campanha.</div>
      </div>` : `<div class="hint" style="margin-top:8px">Nada com “${esc(S.festivasView.buscaBase)}”.</div>`) : ""}
    </div>
    <div class="modal-f">
      <button class="btn danger sm" data-festtirar="${esc(it.sku)}">${svg(IC.lixeira)}Tirar da campanha</button>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="salvar-festitem">Salvar</button></div></div>
  </div></div>`;
}

/* ---------- confirmar a união (v8.98: dois selecionados, escolha explícita) ----------
   A janela compara os dois selecionados em Produtos da campanha e PERGUNTA qual
   permanece. Não há opção marcada de saída: nem o produto aberto, nem o mais
   novo, nem o SKU decidem. Quem pode ficar sai de `festUnirOpcoes` — a mesma
   função que a execução confere.
   O que vai acontecer é calculado por `unirProdutosPrevia`, a mesma que
   `unirProdutos` usa, para os DOIS sentidos; a escolha só mostra um e esconde
   o outro, sem redesenhar a janela (ver o `change` de [data-festunirfica]). */
function modalFestUnir(m) {
  const c = campanhaPorId(m.campanhaId);
  const [skuA, skuB] = m.skus || [];
  const o = festUnirOpcoes(c, skuA, skuB);
  const fechar = `<button class="btn" data-fechar="1">Cancelar</button>`;
  if (!o.lados.length) return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:520px" role="dialog" aria-label="Unir produtos">
    <div class="modal-h"><h2>Não dá para unir</h2><button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
    <div class="modal-b"><div class="aviso" style="margin:0;border-color:var(--perigo-borda);background:var(--perigo-fundo);color:var(--perigo)">${esc(o.bloqueio || "")}</div></div>
    <div class="modal-f">${fechar}</div></div></div>`;

  /* a foto de ANTES da união, linha a linha, pela mesma conta do Planejamento */
  const lados = o.lados.map((l) => {
    const x = festLinha(c, l.item);
    const et = (S.estoque?.itens || []).find((i) => skuNormal(i.sku) === skuNormal(l.sku));
    const op = typeof opAtivaDe === "function" ? opAtivaDe(l.sku) : null;
    const vivos = (S.pedidos || []).filter((r) => PED_VIVO.includes(r.status)
      && skuNormal((opPorId(r.opId) || {}).sku || r.sku) === skuNormal(l.sku));
    return { ...l, x, descricao: l.produto?.descricao || x.descricao || et?.produto || "", op, vivos };
  });
  const [a, b] = lados;
  const cel = (f) => `<td>${f(a)}</td><td>${f(b)}</td>`;
  const traco = '<span style="color:var(--ink-4)">—</span>';
  const num = (v, un) => v ? `${n0(v)}${un ? ` <span style="color:var(--ink-4)">${un}</span>` : ""}` : traco;
  const linhas = [
    ["SKU", (l) => `<b class="sku">${esc(l.sku)}</b><div class="s">${l.produto ? '<span class="tag">tem cadastro</span>' : '<span class="tag amber">sem cadastro</span>'}</div>`],
    ["Descrição", (l) => esc(l.descricao || "—")],
    ["Comportamento", (l) => esc(FEST_COMP_NOME[l.item.comportamento] || "—")],
    ["Venda anterior", (l) => `${num(l.x.base, "pac")}${l.x.baseMao ? ' <span class="tag">à mão</span>' : ""}`],
    ["Meta", (l) => `${num(l.x.meta, "pac")}${l.x.metaMao != null ? ' <span class="tag">à mão</span>' : l.x.metaAplicada != null ? ' <span class="tag">aplicada</span>' : ""}`],
    ["Estoque", (l) => l.x.semLinha ? '<span class="tag amber">fora do estoque</span>' : num(l.x.estoque, "pac")],
    ["Em produção", (l) => num(l.x.programado, "pç")],
    ["Pronto", (l) => num(l.x.pronto, "pç")],
    ["Vendido", (l) => num(l.x.vendido, "pac")],
    ["A produzir", (l) => num(l.x.produzir, "pç")],
    ["SKUs anteriores", (l) => { const h = (l.produto?.skusAnteriores || []).map((s) => s?.sku || s).filter(Boolean);
      return h.length ? h.map((s) => `<span class="sku">${esc(s)}</span>`).join("<br>") : traco; }],
    ["OP ativa", (l) => l.op ? `<span class="sku">${esc(l.op.sku)}</span> · ${l.op.status === "em_producao" ? "em produção" : "pendente"}${l.op.qtdProgramada ? ` · ${n0(l.op.qtdProgramada)} pç` : ""}` : traco],
    ["Pedido vivo", (l) => l.vivos.length ? `${n0(l.vivos.length)}: ${l.vivos.slice(0, 4).map((r) => esc(r.numero || "s/ nº")).join(", ")}${l.vivos.length > 4 ? "…" : ""}` : traco],
  ];

  /* o que acontece em CADA sentido — só o escolhido aparece */
  const previa = (fica, sai) => {
    if (!fica.podeFicar) return "";
    const p = unirProdutosPrevia(fica.produto.id, sai.sku);
    if (!p.ok) return `<div data-uniao-previa="${esc(fica.sku)}" ${m.fica === fica.sku ? "" : "hidden"}><div class="aviso" style="margin:14px 0 0">${esc(p.erro)}</div></div>`;
    const decisoesDoSai = [sai.x.metaMao != null && `meta à mão (${n0(sai.x.metaMao)})`,
      sai.x.baseMao && `base à mão (${n0(sai.x.base)})`,
      sai.x.metaMao == null && sai.x.metaAplicada != null && `meta aplicada (${n0(sai.x.metaAplicada)})`].filter(Boolean);
    return `<div data-uniao-previa="${esc(fica.sku)}" ${m.fica === fica.sku ? "" : "hidden"}>
      <div class="secao">O que acontece se ${esc(fica.sku)} permanecer</div>
      <ul class="uniao-lista">
        <li><b>${esc(sai.sku)}</b> passa a ser registrado como <b>SKU anterior</b> de <b>${esc(p.atual.sku)}</b>. Procurar pelo código antigo continua achando este produto.</li>
        ${p.skusQueEntram.length > 1 ? `<li>Os SKUs que ${esc(sai.sku)} já carregava vêm junto: <b>${p.skusQueEntram.map(esc).join(" · ")}</b>.</li>` : ""}
        ${p.absorveCadastro ? `<li>O cadastro de ${esc(sai.sku)} deixa de existir; o que ele tinha e ${esc(p.atual.sku)} não tem (descrição, categoria, foto, fornecedor) é herdado.</li>` : ""}
        <li><b>O histórico é preservado.</b> ${p.pedidosHistoricos ? `${n0(p.pedidosHistoricos)} pedido${p.pedidosHistoricos === 1 ? "" : "s"} antigo${p.pedidosHistoricos === 1 ? "" : "s"} continua${p.pedidosHistoricos === 1 ? "" : "m"} com o código da época` : "Nenhum pedido antigo é reescrito"}, e a venda, o pronto e o que está em produção de ${esc(sai.sku)} passam a contar na linha de ${esc(p.atual.sku)}.</li>
        ${(p.opsAtivas || p.pedidosOrfaos) ? `<li>${[p.opsAtivas ? `${n0(p.opsAtivas)} OP ativa` : "", p.pedidosOrfaos ? `${n0(p.pedidosOrfaos)} pedido vivo sem OP` : ""].filter(Boolean).join(" e ")} recebe${(p.opsAtivas + p.pedidosOrfaos) === 1 ? "" : "m"} o código de ${esc(p.atual.sku)} — é o que faz a Demanda enxergar o que já está em produção e não mandar produzir de novo.</li>` : ""}
        ${p.campanhas.length ? `<li>Em ${p.campanhas.map((cc) => `<b>${esc(cc.nome)}</b>${cc.acao === "funde" ? " (fica só a linha de " + esc(p.atual.sku) + ")" : " (a linha passa a ser a de " + esc(p.atual.sku) + ")"}`).join(", ")}. As vendas importadas continuam onde estão.</li>` : ""}
        ${fica.item.comportamento !== sai.item.comportamento ? `<li>O comportamento que vale é o de ${esc(fica.sku)}: <b>${esc(FEST_COMP_NOME[fica.item.comportamento] || "—")}</b>.</li>` : ""}
      </ul>
      ${decisoesDoSai.length ? `<div class="aviso" style="margin:10px 0 0;border-color:var(--atencao-borda);background:var(--atencao-fundo)">
        A linha de ${esc(sai.sku)} tem ${esc(decisoesDoSai.join(" e "))}, que <b>não passa${decisoesDoSai.length === 1 ? "" : "m"}</b> para ${esc(fica.sku)}. A meta de ${esc(fica.sku)} fica como está; se precisar, ajuste depois em “base e meta”.</div>` : ""}
    </div>`;
  };
  const opcao = (l) => `<label class="uniao-opcao${l.podeFicar ? "" : " nao"}">
      <input type="radio" name="uniao-fica" value="${esc(l.sku)}" data-festunirfica="${esc(l.sku)}"${l.podeFicar ? "" : " disabled"}${l.podeFicar && m.fica === l.sku ? " checked" : ""}>
      <span>Manter <b class="sku">${esc(l.sku)}</b>
        ${l.podeFicar ? `<span class="hint">${esc(l.sku)} permanece e ${esc((l === a ? b : a).sku)} é absorvido.</span>`
          : `<span class="hint">${esc(l.motivo)}</span>`}</span></label>`;
  const escolhaValida = lados.some((l) => l.podeFicar && l.sku === m.fica);

  return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(760px,96vw)" role="dialog" aria-label="Unir produtos">
    <div class="modal-h"><h2>Unir produtos</h2>
      <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
    <div class="modal-b">
      <p class="hint" style="margin:0 0 10px">Unir diz que os dois são <b>o mesmo produto ao longo do tempo</b> e vale no app inteiro. Se você só quer somar a venda antiga na projeção desta campanha, isso é <b>base histórica</b>, em “base e meta”.</p>
      <div class="tw"><table class="t uniao-cmp">
        <thead><tr><th></th><th>${esc(a.sku)}</th><th>${esc(b.sku)}</th></tr></thead>
        <tbody>${linhas.map(([rot, f]) => `<tr><th scope="row">${rot}</th>${cel(f)}</tr>`).join("")}</tbody>
      </table></div>

      ${o.bloqueio ? `<div class="aviso" style="margin:14px 0 0;border-color:var(--perigo-borda);background:var(--perigo-fundo);color:var(--perigo)">${esc(o.bloqueio)}</div>` : `
      <fieldset class="uniao-pergunta">
        <legend>Qual produto deve permanecer?</legend>
        ${lados.map(opcao).join("")}
      </fieldset>
      <div data-uniao-previa="" ${escolhaValida ? "hidden" : ""}><p class="hint" style="margin:8px 0 0">Escolha acima para ver o que muda.</p></div>
      ${previa(a, b)}${previa(b, a)}`}

      <div class="aviso" style="margin:14px 0 0;border-color:var(--atencao-borda);background:var(--atencao-fundo)">
        <b>Os estoques NÃO serão somados.</b> Cada SKU continua com o saldo que a Magazord mandou.
        O estoque é do SKU, não do cadastro — e quem manda nele é o ERP.
      </div>
    </div>
    <div class="modal-f">${fechar}
      ${o.bloqueio ? "" : `<button class="btn primary" style="margin-left:auto" data-act="fest-unir"${escolhaValida ? "" : " disabled"}>Unir produtos</button>`}</div>
  </div></div>`;
}

function modaisFestivas(m) {
  if (m.tipo === "festVendas") return modalFestVendas(m);
  if (m.tipo === "festAnalise") return modalFestAnalise(m);
  if (m.tipo === "festItem") return modalFestItem(m);
  if (m.tipo === "festUnir") return modalFestUnir(m);

  return modaisSemi(m);
}
