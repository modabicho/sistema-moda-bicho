/* ---------- Prestadoras ---------- */
function viewPrestadoras() {
  const v0 = S.prestView;
  v0.mesProc = v0.mesProc || "mes"; v0.confFiltro = v0.confFiltro || "todos"; v0.prest = v0.prest || "todas";
  const troca = "";
  const c = S.calc, v = S.prestView;
  v.kpi = v.kpi || "todos";
  let r = (c?.prestadoras || []).slice();
  if (v.so === "ativas") r = r.filter((p) => p.ativo !== false);
  const b = v.busca.trim().toLowerCase();
  if (b) r = r.filter((p) => String(p.nome || "").toLowerCase().includes(b));
  r.sort((a, y) => (y.pecasAbertas - a.pecasAbertas) || String(a.nome).localeCompare(String(y.nome)));
  const mesesComp = c?.mesesCompetencia || [];
  const mesSel = v.mes && mesesComp.includes(v.mes) ? v.mes : mesesComp[0] || "";
  const doMes = (p) => p.porMes?.[mesSel] || { pecas: 0, custo: 0, pedidos: 0 };
  const fech = (p) => fechamentoDe(p, mesSel, doMes(p));

  /* ---------- a faixa de números vira filtro ----------
     Ler "8 com atraso" e ter de caçar quais são as oito na lista inteira é
     trabalho que o app pode fazer. Os totais continuam sendo os do conjunto todo
     (`base`), para o número não mudar quando ele mesmo é usado como filtro. */
  const base = r;
  const FKPI = {
    carga: (p) => p.pecasAbertas > 0,
    atraso: (p) => p.atrasadas > 0,
    apagar: (p) => fech(p).total > 0,
  };
  if (FKPI[v.kpi]) r = r.filter(FKPI[v.kpi]);

  const trava = infoFechamento(mesSel);
  const reab = (S.cad.historicoFechamentos || []).filter((x) => x.mes === mesSel && x.acao === "reabriu").length;
  /* ---------- os quatro modos ----------
     Material em posse é assunto de Prestadoras, mas de outra pessoa: por isso a
     permissão é separada e quem só a tem cai direto em "Materiais em posse",
     sem enxergar perfil, fechamento nem pagamento. */
  const nRepor = aReporNasPrestadoras().length;
  const so = soPosse();
  if (so && !["materiais", "enviar", "itens"].includes(v.modo)) v.modo = "materiais";
  const MODOS = [...(so ? [] : [["prestadoras", "Prestadoras"]]),
    ["materiais", "Materiais em posse"], ["enviar", `O que enviar${nRepor ? ` <b>${n0(nRepor)}</b>` : ""}`],
    ["itens", "Itens"]];
  const barra = podePosse() ? `<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px">
    ${MODOS.map(([id, rot]) => `<button class="chip ${(v.modo === id || (id === "prestadoras" && !MODOS.some((m2) => m2[0] === v.modo))) ? "on" : ""}" data-pmodo="${id}">${rot}</button>`).join("")}
  </div>` : "";
  if (podePosse()) {
    if (v.modo === "materiais") return barra + viewMateriaisPrest();
    if (v.modo === "enviar") return barra + viewEnviarPrest();
    if (v.modo === "itens") return barra + viewBens();
  }
  return troca + barra + `
  ${trava ? `<div class="aviso" style="margin-bottom:14px"><b>${esc(mesSel)} está fechado.</b>
    Trancado em ${fdataHora(trava.em)}${trava.por ? ` por ${esc(trava.por)}` : ""} · ${n0(trava.pedidos || 0)} pedidos · ${freal(trava.total || 0)}${reab ? ` · já foi reaberto ${n0(reab)}×` : ""}.
    Nenhum pedido deste fechamento aceita alteração — para corrigir, use <b>Reabrir ${esc(mesSel)}</b>, que desfaz o fechamento por inteiro.</div>` : ""}
  <div class="kpis">
    ${kpi(v.so === "ativas" ? "Prestadoras ativas" : "Prestadoras", base.length, "perfil montado do histórico", "teal",
      { attr: "data-fkpi", valor: "todos", ativo: v.kpi === "todos", dica: "Mostrar todas" })}
    ${kpi("Peças com elas", n0(base.reduce((s, p) => s + p.pecasAbertas, 0)), `programadas e em campo · ${n0(base.filter(FKPI.carga).length)} ${base.filter(FKPI.carga).length === 1 ? "prestadora" : "prestadoras"}`, "amber",
      { attr: "data-fkpi", valor: "carga", ativo: v.kpi === "carga", dica: "Mostrar só quem está com peça na mão" })}
    ${kpi("Com atraso", base.filter(FKPI.atraso).length, "além do prazo típico", base.some(FKPI.atraso) ? "red" : "",
      { attr: "data-fkpi", valor: "atraso", ativo: v.kpi === "atraso", dica: "Mostrar só quem está atrasada" })}
    ${podeVerValores() ? kpi("A pagar em " + (mesSel || "—"), freal(base.reduce((s2, p) => s2 + fech(p).total, 0)), `com bônus, quando atingido · ${n0(base.filter(FKPI.apagar).length)} a receber`, "",
      { attr: "data-fkpi", valor: "apagar", ativo: v.kpi === "apagar", dica: "Mostrar só quem tem valor a receber neste mês" }) : ""}
  </div>
  <div class="card">
    <div class="filters">
      <div class="search">${svg(IC.busca)}<input class="inp" id="q-prest" style="width:230px" placeholder="Buscar prestadora" value="${esc(v.busca)}"></div>
      <button class="chip ${v.so === "ativas" ? "on" : ""}" data-fpr="ativas">Só ativas</button>
      <button class="chip ${v.so === "todas" ? "on" : ""}" data-fpr="todas">Todas</button>
      <span class="divider"></span>
      <select class="sel" id="mes-prest" aria-label="Mês do fechamento">${mesesComp.map((m) => `<option ${m === mesSel ? "selected" : ""}>${esc(m)}</option>`).join("") || "<option>sem histórico</option>"}</select>
      ${podeVerValores() ? `<span style="margin-left:auto"></span>
      <select class="sel" id="f-prest-fech" title="Escolha uma para gerar só a folha dela — é o que se manda por mensagem">
        <option value="todas">Todas as prestadoras</option>
        ${nomesPrest().map((n2) => `<option ${v.prestFech === n2 ? "selected" : ""}>${esc(n2)}</option>`).join("")}</select>
      <button class="btn sm" data-act="print-fechamento" title="${v.prestFech && v.prestFech !== "todas" ? `Só a folha de ${esc(v.prestFech)}` : "Uma folha por prestadora — imprima e recorte, não mande o arquivo inteiro"}">${svg(IC.impressora)}Fechamento${v.prestFech && v.prestFech !== "todas" ? ` de ${esc(primeiroNome(v.prestFech))}` : ""}</button>
      <button class="btn sm" data-act="print-recibo" title="Recibo de pagamento em duas vias — uma para ela assinar e o canhoto para você">${svg(IC.impressora)}Recibo${v.prestFech && v.prestFech !== "todas" ? ` de ${esc(primeiroNome(v.prestFech))}` : ""}</button>
      ${mesSel ? (mesFechado(mesSel)
        ? `<button class="btn sm" data-act="reabrir-mes" title="Destrava ${esc(mesSel)} para correções">${svg(IC.cadeadoAberto)}Reabrir ${esc(mesSel)}</button>`
        : `<button class="btn sm" data-act="fechar-mes" title="Trava ${esc(mesSel)}: ninguém mais altera pedido pago">${svg(IC.cadeado)}Fechar ${esc(mesSel)}</button>`) : ""}
      <button class="btn sm" data-act="estruturas">${svg(IC.engrenagem)}Estruturas de processo</button>
      <button class="btn sm" data-act="regras-bonus">Regras de bônus</button>` : `<span style="margin-left:auto"></span>`}
      <button class="btn primary sm" data-act="nova-prestadora">${svg(IC.mais)}Nova prestadora</button>
    </div>
    <div class="tw"><table class="t"><thead><tr>
      ${thOrd("prest", "nome", "Prestadora")}<th>Processos (histórico)</th>
      ${thOrd("prest", "refs", "Referências", "num")}${thOrd("prest", "carga", "Carga aberta", "num")}
      ${thOrd("prest", "p1", "P1 aberto", "num")}${thOrd("prest", "prazo", "Prazo", "num")}
      ${thOrd("prest", "media", "Média/mês", "num")}${thOrd("prest", "aprov", "Aproveitamento")}
      ${thOrd("prest", "pecasMes", "Peças no mês", "num")}${podeVerValores()
        ? `${thOrd("prest", "valorMes", "Valor no mês", "num")}<th>Bônus</th>${thOrd("prest", "aPagar", "A pagar", "num")}` : ""}<th>Ação</th></tr></thead>
    <tbody>${ordenarPor("prest", r, (p, campo) => { const f2 = fech(p);
        return campo === "nome" ? p.nome : campo === "refs" ? (p.refs?.size || 0)
          : campo === "carga" ? (p.pecasAbertas || 0) : campo === "p1" ? (p.pecasP1 || 0)
          : campo === "prazo" ? (p.prazoMedio ?? null) : campo === "media" ? (p.capacidade || 0)
          : campo === "aprov" ? (p.aproveitamento ?? null) : campo === "pecasMes" ? (f2.pecas || 0)
          : campo === "valorMes" ? (f2.valor || 0) : campo === "aPagar" ? (f2.total || 0) : null; })
      .map((p) => `<tr>
      <td><span class="pessoa">${avatar(p.nome)}<b>${esc(p.nome)}</b></span>${p.ativo === false ? ' <span class="tag">inativa</span>' : ""}
        ${p.telefone ? `<div style="font-size:11px;color:var(--ink-3);margin-left:35px">${esc(p.telefone)}</div>` : ""}</td>
      <td style="font-size:11.5px;color:var(--ink-3)">${esc((p.procsTodos || []).join(", ") || "—")}</td>
      <td class="num">${p.refs.size || "—"}</td>
      <td class="num">${p.pecasAbertas ? n0(p.pecasAbertas) : "—"}${p.atrasadas ? ` <span class="tag red">${p.atrasadas} atr.</span>` : ""}</td>
      <td class="num">${p.pecasP1 ? n0(p.pecasP1) : "—"}</td>
      <td class="num">${p.prazoMedio != null ? Math.round(p.prazoMedio) + "d" : "—"}</td>
      <td class="num">${p.mediaMensal ? n0(p.capacidade) : "—"}${p.capacidadeManual ? ' <span class="ic-inline" title="capacidade definida manualmente">${svg(IC.editar)}</span>' : ""}</td>
      <td>${p.aproveitamento != null ? `<div class="bar" style="width:64px"><i style="width:${Math.min(100, p.aproveitamento * 100)}%;background:${p.aproveitamento >= 0.98 ? "var(--teal)" : "var(--amber)"}"></i></div>
        <span style="font-size:11px;color:var(--ink-3)">${Math.round(p.aproveitamento * 100)}%</span>` : "—"}</td>
      <td class="num">${(() => { const f2 = fech(p); return f2.pecas ? n0(f2.pecas) : "—"; })()}</td>
      ${podeVerValores() ? `<td class="num" title="${fech(p).planilha ? "valores do ControleProcessos" : "estimado pelas estruturas"}">${fech(p).valor ? freal(fech(p).valor) : "—"}</td>
      <td class="num">${fech(p).pct ? `<span class="tag ok">+${Math.round(fech(p).pct * 100)}%</span>
        <div class="s" style="justify-content:flex-end" title="${esc(bonusPorque(fech(p).regra))}">${freal(fech(p).bonus)}</div>` : "—"}</td>
      <td class="num">${fech(p).total ? `<b>${freal(fech(p).total)}</b>` : "—"}</td>` : ""}
      <td style="white-space:nowrap"><button class="btn sm" data-ver-prest="${esc(p.nome)}">Perfil</button>
        <button class="btn sm ghost" data-editar-prest="${esc(p.nome)}">Editar</button></td></tr>`).join("")
      || (v.kpi !== "todos"
        ? vazioLinha("pronto", "Ninguém nesta situação",
            `${n0(base.length)} ${base.length === 1 ? "prestadora está" : "prestadoras estão"} na lista, ${base.length === 1 ? "e ela não se encaixa" : "e nenhuma se encaixa"} no número que você clicou.`,
            `<button class="btn primary sm" data-fkpi="todos">Ver todas</button>`)
        : vazioLinha("nada", "Ainda não há prestadoras", "Cadastre quem produz para a Moda Bicho — é por aqui que os pedidos ganham dono.", `<button class="btn primary sm" data-act="nova-prestadora">Nova prestadora</button>`))}
    </tbody></table></div>
    <details class="legenda"><summary>Como ler esta tabela</summary><div class="legenda-in"><span>O perfil é montado sozinho a partir do histórico de pedidos conferidos — processos, referências, médias e prazos.</span>
      <span>Média/mês = peças conferidas ÷ meses de atividade. Edite a capacidade manualmente quando souber melhor.</span></div></details>
  </div>`;
}

