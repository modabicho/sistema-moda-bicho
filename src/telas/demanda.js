/* ---------- Demanda ---------- */
/* ---------------------------------------------------------------------------
   UMA LINHA DA DEMANDA · o molde, extraído para ser usado por DOIS caminhos:
   o render completo e o crescimento incremental da rolagem.
   É a MESMA função nos dois — é isso que garante que a linha acrescentada
   seja idêntica à que o render teria desenhado. Duas cópias do molde
   divergiriam no primeiro ajuste de coluna, e ninguém veria.
   --------------------------------------------------------------------------- */
function demLinhaSku(x) {
  return `<tr class="clickable ${S.sel.has(x.sku) ? "on" : ""}" data-sku="${esc(x.sku)}">
      <td>${x.saldoSemPedido > 0 || (x.pedidosAbertos || []).length
        ? `<input type="checkbox" class="chk" data-seldem="${esc(x.sku)}" ${S.sel.has(x.sku) ? "checked" : ""} aria-label="Selecionar ${esc(x.sku)}">` : ""}</td>
      <td class="tcell">${x.pedidosAbertos.length ? `<div class="s" style="flex-direction:column;align-items:flex-start;gap:2px;margin:0">${x.pedidosAbertos.slice(0, 3).map((pd) => `<span class="sku" style="font-size:10.5px">${esc(pd.numero)}</span>`).join("")}${x.pedidosAbertos.length > 3 ? `<span>+${x.pedidosAbertos.length - 3}</span>` : ""}</div>` : '<span style="color:var(--ink-4)">—</span>'}</td>
      <td class="tcell"><div class="p sku sku-trunc" style="font-size:13px;letter-spacing:0" title="${esc(x.sku)} — ${esc(x.descricao)}">${esc(x.sku)}</div>
        <div class="s"><span class="abc ${x.abc}">${x.abc}</span>${x.processo ? `<span>${esc(x.processo)}</span>` : ""}${x.semCadastro ? '<span class="tag amber">s/ cadastro</span>' : ""}${x.semVenda ? '<span class="tag" title="Ativo, mas sem venda no período do relatório — data festiva, lançamento ou item sazonal">sem venda</span>' : ""}${etiquetaCampanhas(x.sku)}<button class="lupa" data-loja="${esc(x.sku)}" title="Copiar o SKU e abrir na loja">${svg(IC.busca)}</button></div></td>
      <td><span class="tag dot ${CORCLASSE[x.classe]}" title="${esc(x.classe)}${x.motivo ? " — " + esc(x.motivo) : ""}">${CLASSE_CURTA[x.classe] || esc(x.classe)}</span></td>
      <td class="num">${x.vendas ? n0(x.vendas) : "—"}</td>
      <td class="num"><b>${n0(x.estoqueReal)}</b></td>
      <td class="num tcell">${n0(x.estMin)}${x.minAjuste ? ` <span class="tag" style="font-size:9.5px;padding:0 4px" title="Ajustado aqui — a Magazord ainda tem ${n0(x.estMinErp)}">aj.</span>` : ""}
        <div class="s" style="justify-content:flex-end"><span data-minsku="${esc(x.sku)}" role="button" tabindex="0" style="cursor:pointer;text-decoration:underline dotted;${x.divergeMin ? "color:var(--amber);font-weight:700" : ""}" title="Mínimo calculado pelas vendas do período · ${nMeses(x.mesesSeg)} ${x.mesesSeg === 1 ? "mês" : "meses"} de segurança${x.regraMeses ? ` (regra do processo ${x.regraMeses}, curva ${x.abc})` : x.externo ? " (padrão + 1 mês de fornecimento externo)" : ""}${x.divergeMin ? " — bem diferente do que está em uso" : ""} · clique para revisar">sug. ${n0(x.estMinCalc)}</span></div></td>
      <td class="num">${pct(x.pctEstoque)}</td>
      <td class="num" title="Contando o que já está em produção">${pct(x.pctComProducao)}</td>
      <td class="num">${x.necessidadeBruta ? n0(x.necessidadeBruta) : "—"}</td>
      <td class="num">${x.qtdProgramada ? n0(x.qtdProgramada) : "—"}</td>
      <td class="num" style="color:var(--ink-3)">${x.etapas.Inicial ? n0(x.etapas.Inicial) : "—"}</td>
      <td class="num" style="color:var(--ink-3)">${x.etapas.Cortado ? n0(x.etapas.Cortado) : "—"}</td>
      <td class="num" style="color:var(--ink-3)">${x.etapas["Com a prestadora"] ? n0(x.etapas["Com a prestadora"]) : "—"}</td>
      <td class="num"><b>${x.saldoSemPedido ? n0(x.saldoSemPedido) : "—"}</b></td>
      <td>${x.saldoSemPedido > 0 ? `<button class="btn sm primary" data-criar-pedidos="${esc(x.sku)}">Criar pedidos</button>` : ""}</td></tr>`;
}

function viewDemanda() {
  /* o relatório é uma tela da própria Demanda: mesma aba, mesmos filtros */
  if (S.rel.aberto) return viewRelatorio();
  /* proteção contra estado salvo de versões antigas */
  const dd = S.demanda;
  dd.modo = dd.modo || "sku"; dd.processo = dd.processo || "todos";
  dd.setor = dd.setor || "todos"; dd.abc = dd.abc || "todos"; dd.fornecedor = dd.fornecedor || "todos";
  dd.etapaPed = dd.etapaPed || "todas"; dd.statusPed = dd.statusPed || "todos";
  dd.ordPed = dd.ordPed || "numero"; dd.dirPed = dd.dirPed || 1;
  const d = S.demanda, c = S.calc;
  const FILTROS_OK = ["acao", "todos", "urgprod", "produzir", "urgcobrar", "cobrar", "nomin", "exced", "semvenda", "mindiv"];
  if (!FILTROS_OK.includes(d.filtro)) d.filtro = "acao"; /* valor de versão antiga não pode apagar a tela */
  /* os chips da Demanda passam a mostrar contagem, como os da aba Pedidos */
  const F_CLASSE = { urgprod: "Urgente - Produzir", produzir: "Produzir", urgcobrar: "Urgente - Cobrar Produção",
    cobrar: "Cobrar Produção", nomin: "No Estoque Mínimo" };
  const nSit = (id) => id === "todos" ? c.linhasDemanda.length
    : id === "acao" ? c.linhasDemanda.filter((x) => /Produzir|Cobrar/.test(x.classe)).length
    : id === "semvenda" ? c.linhasDemanda.filter((x) => x.semVenda).length
    : id === "mindiv" ? c.linhasDemanda.filter((x) => x.divergeMin).length
    : id === "exced" ? c.linhasDemanda.filter((x) => x.classe.startsWith("Estoque Excedente")).length
    : c.linhasDemanda.filter((x) => x.classe === F_CLASSE[id]).length;
  let r = c.linhasDemanda;
  if (d.filtro === "acao") r = r.filter((x) => /Produzir|Cobrar/.test(x.classe));
  else if (d.filtro === "semvenda") r = r.filter((x) => x.semVenda);
  else if (d.filtro === "mindiv") r = r.filter((x) => x.divergeMin);
  else if (d.filtro !== "todos") {
    const F = { urgprod: "Urgente - Produzir", produzir: "Produzir", urgcobrar: "Urgente - Cobrar Produção",
      cobrar: "Cobrar Produção", nomin: "No Estoque Mínimo" };
    if (d.filtro === "exced") r = r.filter((x) => x.classe.startsWith("Estoque Excedente"));
    else r = r.filter((x) => x.classe === F[d.filtro]);
  }
  /* quantos SKUs a situação escolhida tem ANTES dos filtros secundários */
  const nBase = r.length;
  r = filtrosDeProduto(r, d);
  const b = d.busca.trim().toLowerCase();
  /* mesma lógica da aba Pedidos: a tela diz o que está escondendo linha */
  const dFiltros = [];
  if (b) dFiltros.push({ k: "busca", rot: `busca "${d.busca.trim()}"` });
  if (d.abc !== "todos") dFiltros.push({ k: "abc", rot: `curva ${d.abc}` });
  if (d.setor !== "todos") dFiltros.push({ k: "setor", rot: `setor ${d.setor}` });
  if (d.processo !== "todos") dFiltros.push({ k: "processo", rot: `processo ${d.processo}` });
  if (d.fornecedor && d.fornecedor !== "todos") dFiltros.push({ k: "fornecedor", rot: d.fornecedor === "__sem" ? "sem fornecedor definido"
    : `fornecedor ${(fornecedoresEmUso().find((f2) => f2.id === d.fornecedor) || {}).nome || "selecionado"}` });
  const textoDFiltros = dFiltros.map((x) => x.rot).join(" · ");
  const btnLimparDem = (cls) => `<button class="btn ${cls}" data-limpardem="1" title="Volta busca, curva, setor, processo e fornecedor para Todos">Limpar filtros${dFiltros.length ? ` (${dFiltros.length})` : ""}</button>`;
  r = r.slice().sort((a, y) => {
    /* "Pedidos" mostra os pedidos abertos do SKU: ordena pela quantidade deles,
       e no empate pelo número do primeiro, que é o que a pessoa está lendo na tela */
    const val = (x) => d.ord === "nPedidos" ? (x.pedidosAbertos || []).length : x[d.ord];
    const va = val(a), vy = val(y);
    if (d.ord === "nPedidos" && va === vy) {
      const p1 = (a.pedidosAbertos || [])[0]?.numero || "", p2 = (y.pedidosAbertos || [])[0]?.numero || "";
      return String(p1).localeCompare(String(p2), undefined, { numeric: true }) * d.dir;
    }
    return typeof va === "string" ? va.localeCompare(vy, undefined, { numeric: true }) * d.dir : ((va ?? 0) - (vy ?? 0)) * d.dir;
  });
  const total = r.length, vis = r.slice(0, d.limite);
  /* A LISTA JÁ FILTRADA E ORDENADA fica à mão para o crescimento incremental da
     rolagem. Não é cache de cálculo: é o MESMO array que esta função acabou de
     montar, guardado para que acrescentar linhas não precise refazer nada.
     Toda vez que o render roda, ele é substituído — então filtro, ordenação e
     busca continuam mandando, e a rolagem nunca serve dado velho. */
  S._demLista = r;
  /* "sumiu da Demanda" é o pior relato possível: a tela tem de dizer para onde foi */
  const avisoFestivo = c.foraDaDemanda
    ? `<button class="chip" data-aba="festivas" style="border-color:var(--bege)" title="Produtos marcados como \u201cs\u00f3 na data\u201d s\u00e3o planejados na aba Datas festivas, n\u00e3o aqui">${n0(c.foraDaDemanda)} em Datas festivas</button>`
    : "";
  const th = (campo, label, cls = "", est = "") => `<th class="s ${cls}" data-ord="${campo}"${est ? ` style="${est}"` : ""}>${label}${d.ord === campo ? `<span class="ar">${d.dir === -1 ? "↓" : "↑"}</span>` : ""}</th>`;
  const chip = (id, nome, key, n) => `<button class="chip ${d[key] === id ? "on" : ""}" data-f="${key}:${id}">${nome}${n != null ? ` <b>${n0(n)}</b>` : ""}</button>`;
  const p = previaAnalise();
  const selecionados = [...S.sel].map((sku) => c.porSku.get(sku)).filter(Boolean);
  const selComSaldo = selecionados.filter((l) => l.saldoSemPedido > 0);

  return `
  <div class="faixa-topo">
      <div style="flex:1;min-width:240px">
        <h2>1 · Aplicar a análise &nbsp;→&nbsp; 2 · Criar os pedidos do saldo</h2>
        <p class="hint" style="margin:0">A análise atualiza a necessidade e a prioridade de cada produto — e avisa quais pedidos abertos ficaram mais urgentes. Depois, você divide o saldo sem pedido em quantos pedidos de produção quiser.</p>
      </div>
      <div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap">
        <span class="tag">${p ? p.novas.length : 0} novas</span>
        <span class="tag amber">${p ? p.pedidosPromoviveis.length : 0} pedidos a promover</span>
        <button class="btn primary" data-act="previa-analise">${svg(IC.raio)}Aplicar análise</button>
      </div>
  </div>
  <div class="card">
    <div class="filters">
      <div class="fb-linha fb-topo">
        <div class="search">${svg(IC.busca)}<input class="inp" id="q-dem" style="width:250px" placeholder="Buscar SKU, produto ou processo" value="${esc(d.busca)}"></div>
        <span style="font-size:12.5px;color:var(--ink-3)" class="mono">${n0(total)} SKUs${dFiltros.length && nBase > total ? ` <span style="color:var(--amber)">de ${n0(nBase)}</span>` : ""}</span>
        ${(() => { const sec = dFiltros.filter((x) => x.k !== "busca").length;
          return `<button class="chip fb-btn-filtro ${d.filtrosAbertos || sec ? "on" : ""}" data-act="dem-filtros"
            title="Curva, setor, processo e fornecedor">${svg(IC.filtro)}Mais filtros${sec ? ` <b>${sec}</b>` : ""}</button>`; })()}
        <div class="seg" role="group" aria-label="Visão">
          <button class="${d.modo === "sku" ? "on" : ""}" data-dmodo="sku">Por produto</button>
          <button class="${d.modo === "pedido" ? "on" : ""}" data-dmodo="pedido">Por pedido</button></div>
        ${(() => { const nR = c.minRevisar.length, nP = (c.minAEnviar || []).length;
          if (!nR && !nP) return "";
          return `<button class="btn sm" style="margin-left:6px" data-act="revisar-min" title="Compara o mínimo em uso com o sugerido pelas vendas, um produto por vez${nP ? ` · ${n0(nP)} decidido${nP === 1 ? "" : "s"} aqui e ainda não levado${nP === 1 ? "" : "s"} para a Magazord (aba Dados, Passo 4)` : ""}">${svg(IC.regua2)}Revisar mínimos${nR ? ` <b>${n0(nR)}</b>` : ""}${nP ? ` <span class="pt-pendente" title="${n0(nP)} para levar à Magazord"></span>` : ""}</button>`; })()}
        <button class="btn sm" data-act="rel-abrir" title="Quanto produzir de cada produto, escolhendo entre o mínimo em uso e o sugerido pelas vendas">${svg(IC.regua2)}Quanto produzir</button>
        <button class="btn sm" style="margin-left:auto" data-act="novo-pedido" title="Cria um pedido direto, sem análise — encomendas e reposições avulsas">${svg(IC.mais)}Criar pedido avulso</button>
      </div>
      <div class="fb-linha">
        <span class="flabel">Situação</span>
        ${(() => { /* rótulo curto no chip, nome inteiro no title: a fileira cabe numa
             linha só e ninguém perde a informação ao passar o mouse */
          const cur = (id, curto, inteiro) => `<button class="chip ${d.filtro === id ? "on" : ""}" data-f="filtro:${id}" title="${esc(inteiro)}">${curto} <b>${n0(nSit(id))}</b></button>`;
          const n2 = c.linhasDemanda.filter((x) => x.semVenda).length, n3 = nSit("mindiv");
          return cur("acao", "Precisa de ação", "Tudo que precisa de ação agora — produzir ou cobrar")
            + cur("urgprod", "Urg. Produzir", "Urgente - Produzir")
            + cur("produzir", "Produzir", "Produzir")
            + cur("urgcobrar", "Urg. Cobrar", "Urgente - Cobrar Produção")
            + cur("cobrar", "Cobrar", "Cobrar Produção")
            + cur("nomin", "No mínimo", "No Estoque Mínimo")
            + cur("exced", "Excedente", "Estoque excedente")
            + (n2 ? `<button class="chip ${d.filtro === "semvenda" ? "on" : ""}" data-f="filtro:semvenda" title="Ativos que não venderam no período — datas festivas, lançamentos. Aparecem na Demanda, mas não entram como Crítico.">Sem venda <b>${n0(n2)}</b></button>` : "")
            + (n3 ? `<button class="chip ${d.filtro === "mindiv" ? "on" : ""}" data-f="filtro:mindiv" title="O mínimo em uso está mais de ${Math.round(TOL_MIN * 100)}% distante do que as vendas sugerem">Mín. divergente <b style="color:var(--amber)">${n0(n3)}</b></button>` : "")
            + cur("todos", "Todos", "Todos os produtos do estoque"); })()}
        ${avisoFestivo}
      </div>
      ${(() => { /* mesma lógica da aba Pedidos: à mostra fica só a fileira por onde
           se navega; curva, setor, processo e fornecedor entram por um botão. */
        const abertos = !!d.filtrosAbertos;
        /* a busca fica à vista na barra — não vira etiqueta nem conta como "mais filtros" */
        const secundarios = dFiltros.filter((x) => x.k !== "busca");
        const fs = fornecedoresEmUso();
        return `${abertos ? `<div class="fb-painel">
        <div class="fb-linha">
          <span class="flabel">Curva</span>
          ${["todos", "A", "B", "C"].map((x) => chip(x, x === "todos" ? "Todas" : x, "abc")).join("")}
          <span class="divider"></span>
          <span class="flabel">Setor</span>
          <button class="chip ${d.setor === "todos" ? "on" : ""}" data-dsetor="todos">Todos</button>
          ${setores().map((st) => `<button class="chip ${d.setor === st.nome ? "on" : ""}" data-dsetor="${esc(st.nome)}">${esc(st.nome)}</button>`).join("")}
        </div>
        <div class="fb-linha">
          <span class="flabel">Processo</span>
          <select class="sel" id="f-proc" style="max-width:210px"><option value="todos">Todos os processos</option>
          ${[...new Set(c.linhas.map((x) => x.processo).filter(Boolean))].sort().map((p2) => `<option ${d.processo === p2 ? "selected" : ""}>${esc(p2)}</option>`).join("")}</select>
          ${fs.length ? `<span class="flabel" style="margin-left:10px">Fornecedor</span>
            <select class="sel" id="f-forn" style="max-width:230px" title="Ver só os produtos de um fornecedor — útil para montar a compra">
              <option value="todos">Todos os fornecedores</option>
              ${fs.map((f2) => `<option value="${esc(f2.id)}" ${d.fornecedor === f2.id ? "selected" : ""}>${esc(f2.nome)}</option>`).join("")}
              <option value="__sem" ${d.fornecedor === "__sem" ? "selected" : ""}>— sem fornecedor definido —</option>
            </select>` : ""}
          ${d.modo === "pedido" ? `<span class="divider"></span><span class="flabel">Pedidos</span>
          <select class="sel" id="f-etped"><option value="todas">Todas as etapas</option>
          ${["Inicial", "Cortado", "Com a prestadora"].map((e2) => `<option value="${e2}" ${d.etapaPed === e2 ? "selected" : ""}>${e2}</option>`).join("")}
          </select><select class="sel" id="f-stped"><option value="todos">Todos os status</option>
          ${PED_VIVO.map((e2) => `<option value="${e2}" ${d.statusPed === e2 ? "selected" : ""}>${P_LABEL[e2]}</option>`).join("")}</select>` : ""}
          ${dFiltros.length ? btnLimparDem("sm ghost") : ""}
        </div>
      </div>` : secundarios.length ? `<div class="fb-linha fb-ativos">
        <span class="flabel">Filtrando por</span>
        ${secundarios.map((x) => `<button class="fb-tira" data-tirardem="${x.k}" title="Tirar este filtro">${esc(x.rot)}<span>×</span></button>`).join("")}
        <button class="btn sm ghost" data-limpardem="1">Limpar tudo</button>
      </div>` : ""}`; })()}
    </div>
    ${d.modo === "pedido" ? (() => {
      let peds = S.pedidos.filter((r) => PED_VIVO.includes(r.status))
        .map((r) => { const op = opPorId(r.opId) || {}; const sku = op.sku || r.sku; return { ...r, sku, linha: c.porSku.get(sku) }; });
      if (d.etapaPed !== "todas") peds = peds.filter((r) => etapaFisica(r) === d.etapaPed);
      if (d.statusPed && d.statusPed !== "todos") peds = peds.filter((r) => r.status === d.statusPed);
      if (d.processo !== "todos") peds = peds.filter((r) => (r.linha?.processo || r.processo) === d.processo);
      if (b) peds = peds.filter((r) => [r.sku, r.numero, r.prestadora].some((x) => String(x || "").toLowerCase().includes(b)));
      const dir = d.dirPed;
      peds.sort((a, y) => d.ordPed === "sku"
        ? String(a.sku).localeCompare(String(y.sku)) * dir
        : String(a.numero).localeCompare(String(y.numero), undefined, { numeric: true }) * dir);
      const thp = (campo, label) => `<th class="s" data-ordped="${campo}">${label}${d.ordPed === campo ? `<span class="ar">${dir === 1 ? "↑" : "↓"}</span>` : ""}</th>`;
      return `<div class="tw"><table class="t"><thead><tr>
        ${thp("numero", "Pedido")}${thp("sku", "SKU")}<th>Prio</th><th class="num">Qtd</th><th>Status</th><th>Etapa</th><th>Prestadora</th>
        <th class="num">Est. real</th><th class="num">Mínimo</th><th class="num">%Est.</th><th class="num">Falta programar</th><th></th></tr></thead>
      <tbody>${peds.slice(0, d.limite).map((r) => `<tr>
        <td class="sku">${esc(r.numero)}</td>
        <td class="sku clickable" style="font-size:12.5px" data-sku="${esc(r.sku)}" title="${esc(r.linha?.descricao || "")}">${esc(r.sku)}</td>
        <td>${corteCurto(r.prioridade)}</td>
        <td class="num">${n0(r.qtd)}</td>
        <td><span class="tag ${r.status === "enviada" ? "teal" : r.status === "separando" || r.status === "chegou" ? "amber" : ""}">${P_LABEL[r.status]}</span></td>
        <td style="font-size:11.5px">${esc(etapaFisica(r) || "—")}</td>
        <td>${esc(r.prestadora || "—")}</td>
        <td class="num">${r.linha ? n0(r.linha.estoqueReal) : "—"}</td>
        <td class="num">${r.linha ? n0(r.linha.estMin) : "—"}</td>
        <td class="num">${r.linha ? pct(r.linha.pctEstoque) : "—"}</td>
        <td class="num">${r.linha && r.linha.saldoSemPedido ? "<b>" + n0(r.linha.saldoSemPedido) + "</b>" : "—"}</td>
        <td><button class="btn sm ghost" data-editar-pedido="${esc(r.id)}">Editar</button></td></tr>`).join("")
        || vazioLinha("filtro", "Nenhum resultado", "Nenhum pedido vivo encontrado com estes filtros.", btnLimparDem("sm"))}
      </tbody></table></div>
      <details class="legenda"><summary>Como ler esta tabela</summary><div class="legenda-in"><span>${peds.length} pedidos vivos. Clique em <b>Pedido</b> ou <b>SKU</b> no cabeçalho para ordenar (crescente/decrescente).</span></div></details>`;
    })() : `    ${selecionados.length ? `<div class="selbar"><b>${selecionados.length}</b> ${selecionados.length === 1 ? "produto selecionado" : "produtos selecionados"}
      <button class="btn sm" data-act="limpar-sel">Limpar</button>
      ${(() => { const imp = selecionados.flatMap((l) => l.pedidosAbertos || []);
        return imp.length ? `<button class="btn sm" data-act="print-papeis-sel" title="Canhotos de TODOS os pedidos vivos dos produtos selecionados — inclusive reimpressão dos que já estão em produção (só quem está em '1. Papel' avança de etapa)">${svg(IC.impressora)}Imprimir papéis (${imp.length})</button>` : ""; })()}
      ${selComSaldo.length ? `<button class="btn sm primary" style="margin-left:auto" data-act="criar-pedidos-sel">Criar pedidos de produção (${selComSaldo.length})</button>` : ""}</div>` : ""}
    ${(() => { /* ---------- o que comprar deste fornecedor ----------
         Só conta como garantido o que já foi CORTADO ou está COM A PRESTADORA.
         O que está no papel ou na fila de corte não entra: se o material ainda
         não existe, aquele pedido não vai sair — contar isso levaria a comprar
         de menos, que é o erro caro aqui. */
      if (!d.fornecedor || d.fornecedor === "todos") return "";
      const nomeF = d.fornecedor === "__sem" ? "sem fornecedor definido"
        : (fornecedoresEmUso().find((f2) => f2.id === d.fornecedor)?.nome || "");
      const itens = r.map((x) => {
        const garantido = (x.etapas?.Cortado || 0) + (x.etapas?.["Com a prestadora"] || 0);
        const aComprar = Math.max(0, (x.necessidadeBruta || 0) - garantido);
        return { sku: x.sku, desc: x.descricao || "", precisa: x.necessidadeBruta || 0,
          garantido, naFila: x.etapas?.Inicial || 0, aComprar, prioridade: x.prioridade };
      }).filter((x) => x.aComprar > 0).sort((a2, b2) => b2.aComprar - a2.aComprar);
      const total = itens.reduce((t2, x) => t2 + x.aComprar, 0);
      const naFila = itens.reduce((t2, x) => t2 + x.naFila, 0);
      const prazo = (S.cad.fornecedores || []).find((f2) => f2.id === d.fornecedor)?.prazoDias;
      if (!itens.length) return `<div class="card" style="margin-bottom:12px;border-left:3px solid var(--ok)">
        <div style="padding:12px 16px;font-size:13.5px">Nada a comprar de <b>${esc(nomeF)}</b> agora — o que falta já está cortado ou com as prestadoras.</div></div>`;
      return `<div class="card" style="margin-bottom:12px;border-left:3px solid var(--atencao)">
        <div style="padding:12px 16px 4px;display:flex;align-items:baseline;gap:14px;flex-wrap:wrap">
          <div><span style="font-size:26px;font-weight:800;letter-spacing:-.02em">${n0(total)}</span>
            <span style="font-size:13.5px;color:var(--ink-2)"> peças a comprar de <b>${esc(nomeF)}</b></span></div>
          <span class="tag">${n0(itens.length)} ${itens.length === 1 ? "produto" : "produtos"}</span>
          ${prazo ? `<span class="tag amber" title="prazo de entrega cadastrado">entrega em ${n0(prazo)} dias</span>` : ""}
          ${naFila ? `<span class="tag" title="pedidos no papel ou na fila de corte — não contam como garantidos porque podem estar parados justamente por falta de material">${n0(naFila)} pçs na fila, não contadas</span>` : ""}
          <button class="btn sm" style="margin-left:auto" data-act="copiar-compra">Copiar lista</button>
        </div>
        <div class="tw" style="max-height:min(38vh,320px)"><table class="t" style="font-size:12px"><thead><tr>
          <th>SKU</th><th>Produto</th><th class="num">Precisa</th>
          <th class="num" title="cortado + com a prestadora">Já garantido</th>
          <th class="num">A comprar</th></tr></thead>
        <tbody>${itens.map((x) => `<tr>
          <td class="sku">${esc(x.sku)}</td>
          <td style="font-size:11.5px;color:var(--ink-2)">${esc(String(x.desc).slice(0, 40))}</td>
          <td class="num">${n0(x.precisa)}</td>
          <td class="num" style="color:var(--ink-3)">${x.garantido ? n0(x.garantido) : "—"}</td>
          <td class="num"><b>${n0(x.aComprar)}</b></td></tr>`).join("")}</tbody></table></div>
      </div>`; })()}
    <div class="tw"><table class="t t-dem"><colgroup><col style="width:46px"><col style="width:72px"><col style="width:17%"><col style="width:10%"><col style="width:66px"><col style="width:60px"><col style="width:74px"><col style="width:54px"><col style="width:62px"><col style="width:88px"><col style="width:72px"><col style="width:56px"><col style="width:56px"><col style="width:58px"><col style="width:82px"><col style="width:86px"></colgroup><thead>
    <tr class="grupos">
      <th colspan="3">Produto</th>
      <th colspan="6">Estoque</th>
      <th colspan="5">Em produção</th>
      <th colspan="2">Decisão</th>
    </tr>
    <tr>
      <th></th>
      ${th("nPedidos", "Pedidos")}
      ${th("sku", "SKU")}
      ${th("score", "Situação")}
      ${th("vendas", "Vendas", "num")}
      ${th("estoqueReal", "Est. real", "num")}
      ${th("estMin", "Mínimo", "num")}
      ${th("pctEstoque", "%Est.", "num")}
      ${th("pctComProducao", "% c/ prod.", "num")}
      ${th("necessidadeBruta", "Necessidade", "num")}
      ${th("qtdProgramada", "Em produção", "num")}
      <th class="num" title="Peças ainda não separadas — pedido no papel ou na fila de corte">Inic.</th>
      <th class="num" title="Cortadas, aguardando envio à prestadora">Cort.</th>
      <th class="num" title="Com a prestadora, em produção">Prest.</th>
      ${th("saldoSemPedido", "Demanda de produção", "num")}
      <th>Ação</th></tr></thead>
    <tbody>${vis.map(demLinhaSku).join("")
      || (dFiltros.length && nBase > 0
        ? vazioLinha("filtro", "Nenhum resultado",
            `<b>${n0(nBase)}</b> ${nBase === 1 ? "produto está" : "produtos estão"} nesta situação, ${nBase === 1 ? "escondido" : "todos escondidos"} pelos filtros.<br>Ativos agora: <b>${esc(textoDFiltros)}</b>`,
            btnLimparDem("primary sm"))
        : vazioLinha("pronto", "Nada pendente aqui", "Nenhum produto nesta situação."))}
    </tbody></table></div>
    ${d.modo === "sku" && total > d.limite ? `<div style="padding:14px;text-align:center;border-top:1px solid var(--line-2)"><button class="btn" data-act="mais-dem">Mostrar mais</button></div>` : ""}
    <details class="legenda"><summary>Como ler esta tabela</summary><div class="legenda-in">
      <span><b>%Est.</b> = estoque real ÷ mínimo. <b>% c/ prod.</b> soma o que já está em produção.</span>
      <span>Colunas e regras idênticas à aba Demanda da planilha: <b>Em produção</b> exclui pedidos espelho (-A); <b>Demanda de Produção</b> zera quando estoque + produção cobre o mínimo.</span>
      <span><b>Urgente</b> = curva A abaixo do mínimo, como na planilha.</span>
      <span>Toque em qualquer linha para ver a descrição e o detalhe completo do produto.</span>
    </div></details>`}
  </div>`;
}

