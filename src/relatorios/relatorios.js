/* ---------- Relatórios ----------
   A pergunta não é "quantos pedidos tivemos". É "o que está acontecendo, por que
   está acontecendo e o que fazer agora". Por isso todo número aqui é clicável:
   ele leva para a tela onde a coisa se resolve, já filtrada. Número que não leva
   a lugar nenhum vira enfeite.

   O que a base permite dizer com honestidade:
   - PEDIDOS têm data em cada etapa (criado, separado, enviado, chegou, retornado),
     então volume, atraso, ciclo e desempenho de prestadora saem por período e
     comparam com o período anterior.
   - ESTOQUE e VENDAS são uma fotografia só, a da última importação. Não existe
     série histórica de venda no app (ver bloco de Datas Festivas). Então nada de
     estoque compara com "o período anterior" — e a tela diz isso, em vez de
     inventar um número. */
const REL_PAINEIS = [["geral", "Visão geral"], ["producao", "Produção e gargalos"]];
const REL_PERIODOS = [["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["mes", "Este mês"], ["custom", "Escolher"]];
const maisDias = (d, n) => new Date(d.getTime() + n * DIA);

function relJanela() {
  const v = S.relView, h = hoje();
  let ini, fim = h;
  if (v.periodo === "hoje") ini = h;
  else if (v.periodo === "7d") ini = maisDias(h, -6);
  else if (v.periodo === "mes") ini = new Date(h.getFullYear(), h.getMonth(), 1);
  else if (v.periodo === "custom") { ini = pdate(v.ini) || maisDias(h, -29); fim = pdate(v.fim) || h; }
  else ini = maisDias(h, -29);
  if (ini > fim) { const t = ini; ini = fim; fim = t; }
  const n = Math.max(1, dias(ini, fim) + 1);
  const fimAnt = maisDias(ini, -1);
  return { ini, fim, n, iniAnt: maisDias(fimAnt, -(n - 1)), fimAnt,
    rotulo: n === 1 ? fdate(iso(ini)) : `${fdate(iso(ini))} a ${fdate(iso(fim))}` };
}
const dentroDe = (quando, a, b) => { const d = pdate(quando); return !!d && d >= a && d <= maisDias(b, 1); };

/* os filtros do topo valem para a aba inteira — é a mesma pergunta feita a
   todos os painéis, não um filtro por gráfico */
function relCabe(r) {
  const v = S.relView;
  const l = S.calc?.porSku?.get(r.sku || opPorId(r.opId)?.sku);
  if (v.processo !== "todos" && (r.processo || l?.processo || "") !== v.processo) return false;
  if (v.setor !== "todos" && (setorDoPedido(r)?.nome || "") !== v.setor) return false;
  if (v.prestadora !== "todas" && (r.prestadora || "") !== v.prestadora) return false;
  if (v.abc !== "todos" && (l?.abc || "C") !== v.abc) return false;
  return true;
}
function relLinhaCabe(l) {
  const v = S.relView;
  if (v.processo !== "todos" && (l.processo || "") !== v.processo) return false;
  if (v.setor !== "todos" && (setorDe(l.processo)?.nome || "") !== v.setor) return false;
  if (v.abc !== "todos" && (l.abc || "C") !== v.abc) return false;
  return true;
}
const relFiltrosAtivos = () => { const v = S.relView;
  return [v.processo !== "todos" && `processo ${v.processo}`, v.setor !== "todos" && `setor ${v.setor}`,
    v.prestadora !== "todas" && `prestadora ${v.prestadora}`, v.abc !== "todos" && `curva ${v.abc}`].filter(Boolean); };

/* produção = pedido que VOLTOU no período, contando só peça boa. A peça com
   defeito não conta como produzida — ela vira demanda de novo. */
function relProduzido(a, b) {
  const rs = S.pedidos.filter((r) => r.status === "retornada" && dentroDe(r.retornadaEm, a, b) && relCabe(r));
  return { pedidos: rs.length, pecas: rs.reduce((t, r) => t + (boasDe(r) ?? 0), 0), rs };
}
function relVariacao(agora, antes) {
  if (!antes) return null;
  return Math.round(((agora - antes) / antes) * 1000) / 10;
}
/* Acima de dez vezes, a porcentagem deixa de informar: "↑ 1153,5%" não se lê,
   "mais de 10×" se lê. */
function textoVar(v) {
  const a = Math.abs(v);
  return a >= 900 ? `mais de ${Math.floor(a / 100)}×` : `${String(a).replace(".", ",")}%`;
}
function chipVar(v, bomSeSobe = true) {
  if (v == null) return `<div class="foot">sem período anterior para comparar</div>`;
  if (Math.abs(v) < 0.05) return `<div class="foot">igual ao período anterior</div>`;
  const sobe = v > 0, bom = sobe === bomSeSobe;
  return `<div class="foot" style="color:var(--${bom ? "teal-2" : "amber"});font-weight:600">${sobe ? "↑" : "↓"} ${textoVar(v)} vs. período anterior</div>`;
}

/* ---------- os gargalos: onde a produção está parada agora ---------- */
function relGargalos() {
  const c = S.calc;
  if (!c) return [];
  /* Cada pedido cai em UM balde só, e os baldes são peneirados na ordem do que
     exige decisão primeiro. Contar o pedido atrasado também em "com a
     prestadora" incharia os dois números e a soma deixaria de bater com a fila
     de verdade — relatório que soma errado é pior que relatório nenhum. */
  const sobra = [...c.papel, ...c.fila, ...c.emCampo].filter(relCabe);
  const usados = new Set();
  const peneira = (id, nome, cond, destino, tom, porque) => {
    const rs = sobra.filter((r) => !usados.has(r.id) && cond(r));
    rs.forEach((r) => usados.add(r.id));
    return { id, nome, n: rs.length, pecas: rs.reduce((t, r) => t + (Number(r.qtd) || 0), 0), destino, tom, porque };
  };
  return [
    peneira("material", "Falta de material", (r) => r.aguardandoMaterial, "material", "amber", "o pedido não anda até o material chegar"),
    peneira("cadastro", "Cadastro incompleto", (r) => (r.problemas || []).length, "problema", "amber", "sem estoque, quantidade ou processo o pedido anda cego"),
    peneira("atraso", "Atrasadas na prestadora", (r) => r.atrasoProducao, "atraso", "red", "passou do prazo típico do processo"),
    peneira("conferencia", "Esperando conferência", (r) => r.status === "chegou", "atrasoconf", "coral", "voltou e ainda não foi conferido"),
    peneira("prestadora", "Com a prestadora, no prazo", (r) => r.status === "enviada", "prestadora", "", "produção externa em andamento"),
    peneira("cortado", "Cortado, a enviar", (r) => r.status === "separando", "cortando", "", "já cortado e ainda não saiu daqui"),
    peneira("fila", "Fila de corte", (r) => r.status === "aberto" || r.status === "papel", "fila", "", "esperando alguém separar aqui dentro"),
  ].filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
}

/* ---------- produção ao longo do tempo ---------- */
function relSerie(j) {
  /* o passo acompanha a janela: um mês vira dias, um trimestre vira semanas.
     Barra por dia em cima de 180 dias não é gráfico, é serrote. */
  const passo = j.n <= 31 ? "dia" : j.n <= 120 ? "semana" : "mes";
  const chave = (d) => passo === "dia" ? iso(d)
    : passo === "mes" ? iso(d).slice(0, 7)
    : iso(maisDias(d, -((d.getDay() + 6) % 7)));   /* segunda-feira da semana */
  const balde = new Map();
  for (let d = new Date(j.ini); d <= j.fim; d = maisDias(d, 1)) {
    const k = chave(d);
    if (!balde.has(k)) balde.set(k, { k, pecas: 0, pedidos: 0 });
  }
  relProduzido(j.ini, j.fim).rs.forEach((r) => {
    const d = pdate(r.retornadaEm); if (!d) return;
    const b = balde.get(chave(d)); if (!b) return;
    b.pecas += boasDe(r) ?? 0; b.pedidos++;
  });
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return [...balde.values()].map((b) => ({ ...b, passo,
    rot: passo === "mes" ? `${MESES[Number(b.k.slice(5, 7)) - 1]}/${b.k.slice(2, 4)}`
       : passo === "semana" ? fdate(b.k).slice(0, 5)
       : fdate(b.k).slice(0, 5) }));
}

/* Uma série só, uma cor só: azul da marca. Sem legenda (o título já diz o que é),
   sem número em cima de toda barra — só no maior, que é o que se procura. */
function relGrafico(serie) {
  if (!serie.length) return "";
  const max = Math.max(1, ...serie.map((b) => b.pecas));
  const L = 760, A = 190, esq = 46, base = A - 26, topo = 12;
  const larg = (L - esq - 8) / serie.length;
  const barra = Math.max(3, Math.min(38, larg - 6));
  const y = (v) => base - (v / max) * (base - topo);
  const passos = [0, max / 2, max];
  const iMax = serie.reduce((mi, b, i) => (b.pecas > serie[mi].pecas ? i : mi), 0);
  /* rótulo do eixo x rareia sozinho: 30 datas empilhadas não se leem */
  const cada = Math.ceil(serie.length / 12);
  return `<div class="rolar-x"><svg viewBox="0 0 ${L} ${A}" class="graf" role="img"
    aria-label="Peças produzidas por ${serie[0].passo}, de ${serie[0].rot} a ${serie[serie.length - 1].rot}">
    ${passos.map((v) => `<g><line x1="${esq}" x2="${L - 6}" y1="${y(v)}" y2="${y(v)}" class="gr-linha"/>
      <text x="${esq - 8}" y="${y(v) + 4}" class="gr-eixo" text-anchor="end">${n0(v)}</text></g>`).join("")}
    ${serie.map((b, i) => { const x = esq + i * larg + (larg - barra) / 2, h = base - y(b.pecas);
      return `<g><title>${esc(b.rot)} · ${n0(b.pecas)} ${b.pecas === 1 ? "peça" : "peças"} · ${n0(b.pedidos)} ${b.pedidos === 1 ? "pedido" : "pedidos"}</title>
        <rect x="${x}" y="${b.pecas ? y(b.pecas) : base - 1}" width="${barra}" height="${b.pecas ? Math.max(2, h) : 1}" rx="3" class="gr-barra${i === iMax && b.pecas ? " gr-max" : ""}"/>
        ${i % cada === 0 ? `<text x="${x + barra / 2}" y="${A - 8}" class="gr-eixo" text-anchor="middle">${esc(b.rot)}</text>` : ""}
        ${i === iMax && b.pecas ? `<text x="${x + barra / 2}" y="${y(b.pecas) - 5}" class="gr-valor" text-anchor="middle">${n0(b.pecas)}</text>` : ""}</g>`; }).join("")}
  </svg></div>`;
}

/* ---------- a tela ---------- */
function viewRelatorios() {
  const v = S.relView;
  if (!REL_PAINEIS.some(([id]) => id === v.painel)) v.painel = "geral";
  const j = relJanela();
  const ativos = relFiltrosAtivos();
  const proc = [...new Set(S.calc?.linhas.map((l) => l.processo).filter(Boolean))].sort();
  const prests = (S.cad.prestadoras || []).filter((p) => p.ativo !== false).map((p) => p.nome).sort();
  return `<div class="filters" style="margin-bottom:14px">
    <div class="fb-linha fb-topo">
      <span class="flabel">Período</span>
      ${REL_PERIODOS.map(([id, nome]) => `<button class="chip ${v.periodo === id ? "on" : ""}" data-relper="${id}">${nome}</button>`).join("")}
      ${v.periodo === "custom" ? `<input type="date" class="inp" id="rel-ini" value="${esc(v.ini || iso(j.ini))}" style="width:150px">
        <input type="date" class="inp" id="rel-fim" value="${esc(v.fim || iso(j.fim))}" style="width:150px">` : ""}
      <span class="hint" style="margin-left:8px">${esc(j.rotulo)}</span>
      <div class="seg" role="group" aria-label="Painel" style="margin-left:auto">
        ${REL_PAINEIS.map(([id, nome]) => `<button class="${v.painel === id ? "on" : ""}" data-relpainel="${id}">${nome}</button>`).join("")}</div>
    </div>
    <div class="fb-linha">
      <span class="flabel">Filtros</span>
      <select class="sel" id="rel-proc"><option value="todos">Todo processo</option>
        ${proc.map((p) => `<option value="${esc(p)}"${v.processo === p ? " selected" : ""}>${esc(p)}</option>`).join("")}</select>
      <select class="sel" id="rel-setor"><option value="todos">Todo setor</option>
        ${setores().map((s) => `<option value="${esc(s.nome)}"${v.setor === s.nome ? " selected" : ""}>${esc(s.nome)}</option>`).join("")}</select>
      <select class="sel" id="rel-prest"><option value="todas">Toda prestadora</option>
        ${prests.map((p) => `<option value="${esc(p)}"${v.prestadora === p ? " selected" : ""}>${esc(p)}</option>`).join("")}</select>
      ${["todos", "A", "B", "C"].map((x) => `<button class="chip ${v.abc === x ? "on" : ""}" data-relabc2="${x}">${x === "todos" ? "Toda curva" : "Curva " + x}</button>`).join("")}
      ${ativos.length ? `<button class="btn sm" data-act="rel-limpar" style="margin-left:auto">Limpar filtros (${ativos.length})</button>` : ""}
    </div>
    ${ativos.length ? `<div class="fb-linha"><span class="hint">Valendo para todos os painéis: <b>${esc(ativos.join(" · "))}</b></span></div>` : ""}
  </div>
  ${v.painel === "producao" ? relPainelProducao(j) : relPainelGeral(j)}`;
}

function relPainelGeral(j) {
  const c = S.calc;
  const agora = relProduzido(j.ini, j.fim), antes = relProduzido(j.iniAnt, j.fimAnt);
  const vivos = [...c.papel, ...c.fila, ...c.emCampo].filter(relCabe);
  const atrasados = vivos.filter((r) => r.atrasoProducao);
  const aguardando = vivos.filter((r) => !ehEspelho(r)).reduce((t, r) => t + (Number(r.qtd) || 0), 0);
  const linhas = c.linhasDemanda.filter(relLinhaCabe);
  const criticos = linhas.filter((l) => /^Urgente/.test(l.classe));
  const abaixo = linhas.filter((l) => l.estMin > 0 && l.estoqueReal < l.estMin);
  const aConferir = vivos.filter((r) => r.status === "chegou");
  const kpi = (rot, val, pe, sub, destino, tom) => `<button class="kpi kpi-btn ${tom || ""}" ${destino ? `data-relir="${destino}"` : ""} ${destino ? 'title="Abrir a lista já filtrada"' : ""}>
    <div class="lbl">${rot}</div><div class="val">${n0(val)}</div>${pe ? `<div class="foot">${pe}</div>` : ""}${sub || ""}</button>`;
  const gargalos = relGargalos();
  const atencao = [];
  if (gargalos.length) atencao.push(`O que mais trava a fábrica agora é <b>${esc(gargalos[0].nome.toLowerCase())}</b>: ${n0(gargalos[0].n)} ${gargalos[0].n === 1 ? "pedido" : "pedidos"}, ${n0(gargalos[0].pecas)} peças.`);
  if (atrasados.length) {
    const porPrest = new Map();
    atrasados.forEach((r) => { const k = r.prestadora || "sem prestadora"; porPrest.set(k, (porPrest.get(k) || 0) + 1); });
    const top = [...porPrest.entries()].sort((a, b) => b[1] - a[1]);
    const concentra = top.slice(0, 2).reduce((t, x) => t + x[1], 0);
    /* o número sozinho não diz nada; o que muda a conversa é se o atraso está
       concentrado em alguém ou espalhado pela fábrica inteira */
    atencao.push(top.length === 1
      ? `${n0(atrasados.length)} ${atrasados.length === 1 ? "pedido atrasado" : "pedidos atrasados"}, ${atrasados.length === 1 ? "e ele está" : "e todos estão"} em <b>${esc(top[0][0])}</b>.`
      : concentra >= atrasados.length * 0.6
      ? `Dos ${n0(atrasados.length)} pedidos atrasados, <b>${n0(concentra)} estão em ${esc(top.slice(0, 2).map((x) => x[0]).join(" e "))}</b> — o problema não é geral, é dessas duas.`
      : `${n0(atrasados.length)} pedidos atrasados, espalhados entre ${n0(top.length)} prestadoras — é a fábrica inteira, não uma delas.`);
  }
  if (criticos.length) atencao.push(`${n0(criticos.length)} ${criticos.length === 1 ? "produto está" : "produtos estão"} em situação urgente na Demanda.`);
  if (c.faltasAbertas) atencao.push(`${n0(c.faltasAbertas)} ${c.faltasAbertas === 1 ? "material anotado em falta" : "materiais anotados em falta"} esperando compra.`);
  return `<div class="card">
    <div class="card-h"><div><h3>Como está a operação</h3>
      <div class="hint">Produção e peças são do período escolhido. O resto é a foto de agora — fila, atraso e estoque não têm "período anterior" para comparar.</div></div>
      <button class="btn sm" style="margin-left:auto" data-act="rel-quanto" title="A mesma tela que abre pela Demanda — quanto produzir de cada produto, escolhendo a base">${svg(IC.regua2)}Quanto produzir</button></div>
    <div class="kpis" style="padding:14px">
      ${kpi("Pedidos produzidos", agora.pedidos, "", chipVar(relVariacao(agora.pedidos, antes.pedidos)), "pedidos:conferidos")}
      ${kpi("Peças produzidas", agora.pecas, "", chipVar(relVariacao(agora.pecas, antes.pecas)), "pedidos:conferidos")}
      ${kpi("Pedidos atrasados", atrasados.length, "agora, na prestadora", "", "pedidos:atraso", atrasados.length ? "red" : "")}
      ${kpi("Peças aguardando produção", aguardando, "em pedidos vivos", "", "pedidos:andamento")}
      ${kpi("A conferir", aConferir.length, "voltaram e não foram conferidos", "", "pedidos:atrasoconf", aConferir.length ? "amber" : "")}
      ${kpi("Produtos urgentes", criticos.length, "na Demanda", "", "demanda:acao", criticos.length ? "red" : "")}
      ${kpi("Abaixo do mínimo", abaixo.length, "estoque menor que o mínimo em uso", "", "demanda:acao", abaixo.length ? "amber" : "")}
    </div>
    ${atencao.length ? `<div style="padding:0 14px 16px">
      <div style="font-weight:700;font-size:12px;margin-bottom:7px">O que merece atenção</div>
      <ul class="rel-aten">${atencao.map((t) => `<li>${t}</li>`).join("")}</ul></div>` : ""}
    ${porque("Por que alguns números não comparam com o mês passado", `
      <div>O app guarda <b>data em cada etapa do pedido</b> — criado, separado, enviado, voltou. Por isso produção, atraso e desempenho de prestadora saem por período e comparam com o anterior.</div>
      <div>Já <b>estoque e vendas são uma fotografia só</b>, a da última importação. Não existe no app a série de como o estoque estava mês passado — então esses números aparecem como estão hoje, sem comparação inventada.</div>`)}
  </div>`;
}

function relPainelProducao(j) {
  const agora = relProduzido(j.ini, j.fim), antes = relProduzido(j.iniAnt, j.fimAnt);
  const serie = relSerie(j);
  const porProc = new Map();
  const conta = (rs, campo) => rs.forEach((r) => {
    const l = S.calc?.porSku?.get(r.sku || opPorId(r.opId)?.sku);
    const p = r.processo || l?.processo || "sem processo";
    const o = porProc.get(p) || { p, pecas: 0, antes: 0, pedidos: 0 };
    o[campo] += boasDe(r) ?? 0; if (campo === "pecas") o.pedidos++;
    porProc.set(p, o);
  });
  conta(agora.rs, "pecas"); conta(antes.rs, "antes");
  const procs = [...porProc.values()].filter((o) => o.pecas || o.antes).sort((a, b) => b.pecas - a.pecas);
  const total = agora.pecas || 1;
  const gargalos = relGargalos();
  const totGarg = gargalos.reduce((t, g) => t + g.n, 0) || 1;
  return `<div class="card">
    <div class="card-h"><div><h3>Produção no período</h3>
      <div class="hint">Peça boa de pedido que voltou entre ${esc(j.rotulo)}. Peça com defeito não conta — ela volta a ser demanda.</div></div>
      <div style="margin-left:auto;text-align:right"><div class="val" style="font-size:23px;font-weight:800">${n0(agora.pecas)}</div>
        ${chipVar(relVariacao(agora.pecas, antes.pecas))}</div></div>
    <div style="padding:6px 14px 14px">${relGrafico(serie)}</div>
    <div class="tw"><table class="t"><thead><tr>
      <th>Processo</th><th class="num">Peças</th><th class="num">% do total</th><th class="num">Pedidos</th><th class="num">Período anterior</th><th>Tendência</th>
    </tr></thead><tbody>
    ${procs.map((o) => { const dv = relVariacao(o.pecas, o.antes);
      return `<tr><td class="tcell"><div class="p">${esc(o.p)}</div></td>
      <td class="num"><b>${n0(o.pecas)}</b></td>
      <td class="num">${Math.round((o.pecas / total) * 100)}%</td>
      <td class="num">${n0(o.pedidos)}</td>
      <td class="num" style="color:var(--ink-3)">${n0(o.antes)}</td>
      <td>${dv == null ? '<span style="color:var(--ink-4)">—</span>'
        : Math.abs(dv) < 0.05 ? '<span class="tag">igual</span>'
        : `<span class="tag ${dv > 0 ? "teal" : "amber"}">${dv > 0 ? "↑" : "↓"} ${textoVar(dv)}</span>`}</td></tr>`; }).join("")
    || `<tr><td colspan="6" style="padding:26px;text-align:center;color:var(--ink-3)">Nenhum pedido voltou neste período.</td></tr>`}
    </tbody></table></div>
  </div>
  <div class="card">
    <div class="card-h"><div><h3>Onde a produção está parando</h3>
      <div class="hint">Agora, não no período: são os pedidos vivos. Cada linha abre a aba Pedidos já filtrada.</div></div></div>
    <div class="tw"><table class="t"><thead><tr>
      <th>Etapa</th><th class="num">Pedidos</th><th class="num">Peças</th><th style="width:34%">Peso</th><th></th>
    </tr></thead><tbody>
    ${gargalos.map((g) => `<tr>
      <td class="tcell"><div class="p">${esc(g.nome)}</div><div class="s">${esc(g.porque)}</div></td>
      <td class="num"><b${g.tom ? ` style="color:var(--${g.tom === "red" ? "red" : g.tom === "coral" ? "coral-2" : "amber"})"` : ""}>${n0(g.n)}</b></td>
      <td class="num">${n0(g.pecas)}</td>
      <td><div class="barra-mini"><i style="width:${Math.round((g.n / totGarg) * 100)}%${g.tom ? `;background:var(--${g.tom === "red" ? "red" : g.tom === "coral" ? "coral" : "amber"})` : ""}"></i></div></td>
      <td><button class="btn sm" data-relir="pedidos:${g.destino}">Ver</button></td></tr>`).join("")
    || `<tr><td colspan="5" style="padding:26px;text-align:center;color:var(--ink-3)">Nada parado — todos os pedidos vivos estão andando.</td></tr>`}
    </tbody></table></div>
  </div>`;
}

const TITULOS = {
  demanda: ["Demanda", "O que o estoque pede — e o que ainda falta programar"],
  pedidos: ["Pedidos de produção", "Todos os pedidos, da fila ao retorno, numa tela só"],
  conferencia: ["Conferência", "O que cada prestadora fez, etapa por etapa"],
  tarefas: ["Tarefas", "O que cada pessoa precisa fazer, na ordem certa"],
  compras: ["Compras", "Materiais em falta, separados por fornecedor"],
  produtos: ["Produtos", "Cadastro, fotos e vínculo com a loja"],
  insumos: ["Insumos", "O que a fábrica compra para produzir — estoque e entradas por nota"],
  festivas: ["Datas festivas", "Campanhas sazonais — planejamento e projeção, separados da Demanda"],
  semiacabados: ["Semiacabados", "A bandana pronta que ainda não é SKU — remessas, retorno e estoque"],
  relatorios: ["Relatórios", "O que está acontecendo, por que — e o que fazer agora"],
  prestadoras: ["Prestadoras", "Perfil produtivo montado do histórico"],
  equipe: ["Equipe", "Quem entra no PCP, quem trabalha e para onde os pedidos vão"],
  historico: ["Histórico", "Pedidos e necessidades já registrados"],
  dados: ["Dados e configuração", "Importação, parâmetros e exportação"],
};

/* Onde cada caixa estava, por aba. Existe para o caso de a caixa não estar na
   tela no momento em que a tela foi redesenhada — uma janela que cobre a
   tabela, um aviso que toma o lugar dela por um instante. Quando ela volta,
   volta para onde estava, em vez de nascer no começo. */
const _ondeEstava = new Map();

/* A linha que a pessoa acabou de abrir fica marcada (tr.recem). Guardar a
   posição em pixels não basta: se sumirem linhas ACIMA dela, o mesmo pixel
   passa a mostrar outra coisa e o produto que ela estava mexendo desaparece da
   vista. Então guardamos a distância entre a linha e o topo da tabela e
   devolvemos essa distância depois — "manter onde ele for pra eu não me perder
   em qual produto estava mexendo". */
function ondeEstaLinhaMarcada() {
  try {
    const linha = document.querySelector("tr.recem");
    const caixa = linha && linha.closest(".tw");
    if (!caixa) return null;
    /* com o id junto: abrir OUTRO pedido troca a linha marcada, e acompanhar a
       linha nova como se fosse a antiga arrastaria a tabela sem motivo */
    return { id: linha.getAttribute("data-linha") || "", desloc: linha.getBoundingClientRect().top - caixa.getBoundingClientRect().top };
  } catch { return null; }
}
function seguirLinhaMarcada(antes) {
  if (!antes) return;
  try {
    const linha = document.querySelector("tr.recem");
    const caixa = linha && linha.closest(".tw");
    if (!caixa) return;
    if ((linha.getAttribute("data-linha") || "") !== antes.id) return;   /* outra linha: não é a mesma história */
    const passo = linha.getBoundingClientRect().top - caixa.getBoundingClientRect().top - antes.desloc;
    if (Math.abs(passo) < 2) return;   /* não saiu do lugar: não mexer na tela de quem lê */
    const y0 = caixa.scrollTop;
    caixa.scrollTop += passo;
    if (Math.abs(caixa.scrollTop - (y0 + passo)) < 2) return;   /* coube: acabou */
    /* Não coube: a lista encolheu tanto que a distância antiga não existe mais.
       Então o que vale é a linha aparecer — é ela que a pessoa está procurando. */
    const rl = linha.getBoundingClientRect(), rc = caixa.getBoundingClientRect();
    if (rl.bottom > rc.top + 40 && rl.top < rc.bottom - 20) return;
    caixa.scrollTop += rl.top - rc.top - caixa.clientHeight / 3;
  } catch {}
}

function render() {
  _renderPendente = false;   /* qualquer render de verdade já cumpre o que estava esperando */
  _ciclo++;   /* invalida os índices de busca: o estado pode ter mudado desde o último render */
  /* preserva a rolagem entre re-renderizações (a tela inteira é redesenhada a cada clique) */
  /* ---------- guardar o lugar em duas listas, não em uma ----------
     Quem rola de verdade nestas telas é o `.tw` da tabela, não a página. As
     caixas eram casadas por POSIÇÃO numa lista única que misturava as da tela
     com as da janela aberta — então bastava abrir ou fechar uma janela para as
     posições andarem, e a restauração era desligada por segurança.

     Consequência para quem usa: rolar até achar um produto, abrir, salvar — e a
     lista voltava ao topo. De longe isso se lê como "o produto sumiu da fila".

     Agora são duas listas independentes: as da TELA (que não mudam quando uma
     janela abre) e as da JANELA. As da tela voltam sempre; as da janela só
     quando é a mesma janela. */
  /* Antes as caixas iam numa lista só e voltavam pelo NUMERO da posição. Bastava
     uma gaveta abrir, um aviso sumir ou a tela ficar mais estreita para a lista
     mudar de tamanho: a tabela recebia a rolagem de outra caixa — quase sempre
     zero — e voltava ao começo. Agora cada caixa tem nome próprio (o grupo dela
     mais a posição dentro do grupo), então o que aparece ou some ao lado não
     mexe mais na tabela. */
  const GRUPOS_TELA = [".tw", ".nav", ".drawer-b", ".drawer"];
  const ROLAVEIS_JANELA = ".ov, .modal-b";
  const caixasTela = () => {
    const m = new Map();
    GRUPOS_TELA.forEach((sel) => {
      [...document.querySelectorAll(sel)].filter((e2) => !e2.closest(".ov"))
        .forEach((e2, i) => m.set(sel + "#" + i, e2));
    });
    return m;
  };
  const caixasJanela = () => [...document.querySelectorAll(ROLAVEIS_JANELA)];
  const rolagem = (() => {
    try {
      const raiz = document.scrollingElement || document.documentElement;
      return { y: raiz.scrollTop, aba: S.aba, modalTipo: S.modal?.tipo || null, drawer: !!S.drawer,
        tela: [...caixasTela()].map(([k, t2]) => { _ondeEstava.set(S.aba + "|" + k, [t2.scrollLeft, t2.scrollTop]); return [k, t2.scrollLeft, t2.scrollTop]; }),
        janela: caixasJanela().map((t2) => ({ x: t2.scrollLeft, y: t2.scrollTop })),
        linha: ondeEstaLinhaMarcada() };
    } catch { return null; }
  })();
  /* o pedido que ela acabou de abrir: a linha dele fica marcada até ela clicar
     noutro, para reencontrá-lo de relance numa lista de duzentos */
  if (S.modal?.pedido?.id) S.pedView.ultimo = S.modal.pedido.id;
  /* ABAS · a reconciliação acontece UMA vez por render, antes de desenhar.
     É o que faz os 28 pontos que trocam de tela abrirem ou focarem uma aba sem
     nenhum deles saber que abas existem. */
  try { if (typeof abasSincronizar === "function") abasSincronizar(); } catch (e) { console.error("abas:", e); }
  try { S.calc = calcular(); }
  catch (err) {
    console.error(err);
    $("#app").innerHTML = `<div style="max-width:640px;margin:60px auto;padding:24px"><h2 style="color:var(--perigo)">Erro ao calcular</h2><pre style="white-space:pre-wrap;background:var(--perigo-fundo);padding:14px;border-radius:8px;font-size:12px">${esc(String(err && err.stack || err))}</pre></div>`;
    throw err;
  }
  const c = S.calc;
  const vazio = !S.estoque || !S.produtos.length;
  const minhas = c && S.tarefas.quem ? c.tarefas.filter((t) => t.responsavel === S.tarefas.quem).length : (c ? c.tarefas.filter((t) => t.urgente).length : 0);
  const nav = [
    ["sec", "Operação"],
    ["demanda", "Demanda", c ? c.linhasDemanda.filter((l) => l.saldoSemPedido > 0).length : null],
    ["pedidos", "Pedidos", c ? (c.papel.length + c.fila.length + c.emCampo.length) || null : null],
    ["conferencia", "Conferência", errosConferencia() || null],
    ["tarefas", "Tarefas", minhas || null],
    ["compras", "Compras", c ? c.faltasAbertas || null : (S.faltas.filter((x) => x.status === "aberta").length || null)],
    ["relatorios", "Relatórios", null],
    ["festivas", "Datas festivas", (() => { const n = festCampanhas().filter((c) => !c.arquivada && campanhaAberta(c)).length; return n || null; })()],
    /* o número aqui é cobrança, não estatística: remessa em aberto é bandana
       que está fora da fábrica e ainda não voltou. */
    ["semiacabados", "Semiacabados", remessasAbertas().length || null, remessasAbertas().length ? "alerta" : null],
    ["sec", "Cadastros"],
    ["produtos", "Produtos", null],
    ["insumos", "Insumos", insumosAbaixo().length || null, insumosAbaixo().length ? "alerta" : null],
    ["prestadoras", "Prestadoras", aReporNasPrestadoras().length || null, aReporNasPrestadoras().length ? "alerta" : null],
    ["equipe", "Equipe", null],
    /* "Histórico" e "Dados" saíram do menu principal: as duas são de consulta
       eventual e abrem pelo menu da conta, no rodapé. Uma linha do menu vale
       pelo que se usa o dia inteiro, não pelo que se abre uma vez por semana. */
  ];
  /* ==========================================================================
     NAVEGAÇÃO GLOBAL NO TELEFONE
     --------------------------------------------------------------------------
     O trilho de 216px é bom no monitor da fábrica e péssimo no celular: em uma
     tela de 390px ele come mais da metade da largura antes de qualquer dado
     aparecer. Abaixo de 720px o trilho sai e entra esta barra, presa embaixo,
     com QUATRO alvos — nem um a mais, porque o polegar não acerta cinco.
       Pedidos · Tarefas · Demanda · Mais
     Ela não é uma tela nova nem um menu paralelo: lê o MESMO array `nav`, com
     o MESMO `podeAba`, com os MESMOS contadores. Quem não tem acesso a uma
     parte não a vê aqui, igual ao trilho. "Mais" abre o resto — inclusive as
     seções — em uma folha que sobe.
     ========================================================================== */
  const barraMobile = (nav) => {
    const podem = nav.filter(([id]) => id !== "sec" && podeAba(id));
    const acha  = (id) => podem.find(([x]) => x === id);
    /* os três fixos, na ordem do dia: o que produzo, o que me cabe, o que falta
       programar. Se a pessoa não tem um deles, o lugar vai para a primeira parte
       que ela TEM — a barra nunca fica com buraco. */
    const fixos = [acha("pedidos") || acha("tarefas"),
                   acha("tarefas") || acha("demanda"),
                   acha("demanda") || acha("conferencia") || acha("compras")]
                  .filter(Boolean)
                  .filter((v, i, a) => a.findIndex((x) => x[0] === v[0]) === i);
    const ids   = new Set(fixos.map(([id]) => id));
    const resto = nav.filter(([id]) => id === "sec" || (podeAba(id) && !ids.has(id)));
    const item = ([id, nome, badge, tom]) => `<button data-aba="${id}"
      class="${S.aba === id ? "on" : ""}" aria-current="${S.aba === id ? "page" : "false"}">
      ${svg(IC[id])}<span>${esc(nome)}</span>${badge ? `<i class="bm-n${tom ? " " + tom : ""}">${badge}</i>` : ""}</button>`;
    /* o "Mais" acende quando a aba aberta está guardada lá dentro: a pessoa
       precisa saber onde ela está mesmo quando o alvo não é um dos três. */
    const dentro = resto.some(([id]) => id !== "sec" && id === S.aba);
    const somaResto = resto.reduce((n, [id, , b]) => n + (id !== "sec" && b ? 1 : 0), 0);
    return `<nav class="barra-mob" aria-label="Navegação">
      ${fixos.map(item).join("")}
      <button data-act="menu-mais" class="${S.menuMais || dentro ? "on" : ""}"
        aria-expanded="${S.menuMais ? "true" : "false"}">${svg(IC.reticencias)}<span>Mais</span>${somaResto ? `<i class="bm-n">${somaResto}</i>` : ""}</button>
    </nav>
    ${S.menuMais ? `<div class="bm-folha-ov" data-act="fechar-mais"></div>
      <div class="bm-folha" role="dialog" aria-label="Mais partes do sistema">
        <div class="bm-alca"></div>
        ${resto.map(([id, nome, badge, tom]) => id === "sec"
          ? `<div class="bm-sec">${esc(nome)}</div>`
          : `<button data-aba="${id}" class="${S.aba === id ? "on" : ""}">${svg(IC[id])}<span>${esc(nome)}</span>${badge ? `<i class="bm-n${tom ? " " + tom : ""}">${badge}</i>` : ""}</button>`).join("")}
      </div>` : ""}`;
  };

  const [t, sub] = TITULOS[S.aba];
  const idade = S.estoque?.importadoEm ? dias(pdate(S.estoque.importadoEm), hoje()) : null;

  /* Os quatro banners do topo viraram uma fila ordenada por risco — ver
     `ui/avisos.js`. A cópia de teste saiu daqui e virou crachá no cabeçalho. */
  let corpo;
  /* base sem produto e sem pedido, mas com remessa registrada: a tela de "comece
     importando" escondia as remessas, e elas eram o único trabalho que existia. */
  const soRemessas = S.aba === "pedidos" && remessas().length;
  if (vazio && !soRemessas && !["dados", "equipe", "prestadoras", "compras", "conferencia", "insumos", "festivas", "semiacabados"].includes(S.aba)) corpo = viewVazio();
  else corpo = ({ demanda: viewDemanda, pedidos: viewPedidos,
    conferencia: viewProcessos, tarefas: viewTarefas, compras: viewCompras, produtos: viewProdutos, prestadoras: viewPrestadoras,
    equipe: viewEquipe, historico: viewHistorico, dados: viewDados,
    insumos: viewInsumos, festivas: viewFestivas, relatorios: viewRelatorios,
    semiacabados: viewSemi })[S.aba]();

  /* servidor configurado e sem login: pede e-mail/senha do Supabase antes de qualquer coisa */
  if (temJanelaReal && SUPA_URL && !supaSessao()?.access) {
    const campo = (rot, inner) => `<label class="fld"><span>${rot}</span>${inner}</label>`;
    /* ---------- a entrada ----------
       Um card único, sem faixa de cabeçalho: marca pequena, saudação grande,
       subtítulo, campos com respiro e um botão só, da largura do card. A lógica
       de autenticação é exatamente a mesma — `#sp-email`, `#sp-senha` e
       `data-act="entrar-supa"` continuam com os mesmos nomes. */
    const ultimo = conhecidos()[0]?.email || "";
    $("#app").innerHTML = `<div class="auth"><div class="auth-in">
      <div class="auth-card entrada">
        <div class="auth-b">
          <div class="auth-marca" role="img" aria-label="Moda Bicho Acessórios"></div>
          <h2 id="sp-ola">${ola(ultimo)}</h2>
          <p class="auth-sub" id="sp-sub">${nomeDoEmail(ultimo) ? "Entre para continuar de onde parou." : "Entre com a conta da empresa para continuar."}</p>
          ${(() => { /* aberto como arquivo: o navegador bloqueia a conversa com o servidor */
            const online = typeof window !== "undefined" && /^https?:$/.test(window.location.protocol);
            if (online) return "";
            return `<div class="aviso" style="border-color:var(--perigo-borda);background:var(--perigo-fundo);color:var(--perigo)">
              <b>Este arquivo está sendo aberto direto do aparelho</b>, não pelo endereço do site. Assim o navegador
              bloqueia a conexão com o servidor e o login não funciona — é o erro "Load failed".
              <div style="margin-top:8px">Abra <b>modabicho.netlify.app</b> no navegador e entre por lá.</div>
              <div style="margin-top:6px;font-size:11.5px;opacity:.75">O arquivo baixado serve só para publicar a versão nova no Netlify.</div>
            </div>`; })()}
          ${campo("E-mail", `<input class="inp" id="sp-email" type="email" autocomplete="username" placeholder="voce@modabicho.com.br" value="${esc(ultimo)}">`)}
          ${campo("Senha", `<div class="campo-senha">
            <input class="inp" id="sp-senha" type="password" autocomplete="current-password" placeholder="••••••••">
            <button type="button" class="olho" data-act="ver-senha" data-alvo="sp-senha"
              aria-controls="sp-senha" aria-pressed="false" title="Mostrar a senha" aria-label="Mostrar a senha">${svg(IC.olho)}</button>
          </div>`)}
          <button class="btn primary" data-act="entrar-supa" ${S.supaEntrando ? "disabled" : ""}>${S.supaEntrando ? "Entrando…" : "Entrar"}</button>
          <p class="auth-nota">Sem acesso ainda? Entre em contato com a administradora.</p>
        </div>
      </div></div>
      ${authRodape()}
    </div><div class="toasts" id="toasts"></div>`;
    return;
  }
  /* Senha conferida, mas falta o segundo fator. Fica no MESMO portão do login e
     RETORNA — o app não chega a ser montado. Vale também depois de um F5 no meio
     do desafio: a pendência está gravada, não só na memória da página. */
  if (temJanelaReal && SUPA_URL && supaSessao()?.access && typeof mfaPortaoPendente === "function"
      && (mfaPortaoPendente() || S.mfaCad)) {
    /* `S.mfaCad` também segura a tela DEPOIS do cadastro dar certo: ela ainda
       não viu a confirmação nem o convite ao celular de reserva. */
    const est = mfaEstado();
    $("#app").innerHTML =
      est === "checando" ? viewMfaConferindo()
      : est === "erro"   ? viewMfaErro()
      : (mfaModoDoPortao() === "cadastro" || S.mfaCad) ? viewMfaCadastro()
      : viewMfaDesafio();
    return;
  }
  /* ---------- vínculo servidor -> pessoa: a sessão do app pertence ao e-mail logado ---------- */
  const emailSupa = String(supaSessao()?.email || "").trim().toLowerCase();
  if (emailSupa && S.sessao?.email && S.sessao.email !== emailSupa) { S.sessao = null; gravarSessao(null); }
  /* A identidade sai da CONTA AUTENTICADA, e ela pode ser das duas naturezas do
     modelo: uma pessoa com login próprio (Ana, João) ou uma conta de setor
     (Atendimento, Contato, Produção, Separação — `tipo='conta'`). As contas não
     estão em `S.equipe`, e procurar só lá era o bug: a conta existia, com o
     e-mail preenchido, e mesmo assim a tela dizia "falta ligar". */
  const pessoaCasada = emailSupa ? S.equipe.find((p) => p.ativo !== false && String(p.email || "").trim().toLowerCase() === emailSupa) : null;
  const contaCasada = !pessoaCasada && emailSupa && typeof eqContaPorEmail === "function" ? eqContaPorEmail(emailSupa) : null;
  const casada = pessoaCasada || contaCasada;
  if (casada) {
    lembrarPessoa(emailSupa, casada.nome); /* para a próxima entrada já vir pelo nome */
    /* v8.56 · A CONTA É A PESSOA. A regra passou a ser uma só: todo mundo entra
       com e-mail e senha, e a conta que entrou diz quem é. O PIN saiu do
       caminho de entrada.

       O que havia antes: a conta era a "conexão da empresa" e várias pessoas
       entravam por PIN sob ela, então o app só escolhia a pessoa quando ninguém
       tivesse escolhido — e respeitava um "saí à mão". Era esse `saiuAMao()`
       que trazia a tela de PIN de volta depois de "Sair do meu acesso".

       Identificar QUEM fisicamente usa uma conta de setor compartilhada é
       assunto de auditoria, e será tratado separado da entrada. */
    const semPessoa = !S.sessao?.pessoaId || !S.equipe.some((p) => p.id === S.sessao.pessoaId && p.ativo !== false);
    if (semPessoa) { S.sessao = { pessoaId: casada.id, email: emailSupa, em: new Date().toISOString() }; gravarSessao(S.sessao); }
  } else if (emailSupa && !S.equipe.some((p) => p.adm && p.ativo !== false)) {
    /* primeira conta do servidor sem ninguém no comando: vira a administradora */
    const nova = { id: uid(), nome: emailSupa.split("@")[0], email: emailSupa, ativo: true,
      adm: true, verValores: true, funcoes: [] };
    S.equipe.push(nova);
    S.sessao = { pessoaId: nova.id, email: emailSupa, em: new Date().toISOString() };
    gravarSessao(S.sessao);
    salvarEquipe();
  } else if (emailSupa && !S.equipe.some((p) => p.adm && p.ativo !== false && String(p.email || "").trim())) {
    /* o comando ainda não foi reivindicado por nenhuma conta do servidor:
       a primeira conta desconhecida vincula-se à administradora — e-mails de operadoras não interferem */
    const dona = S.equipe.find((p) => p.adm && p.ativo !== false);
    if (dona) {
      dona.email = emailSupa;
      S.sessao = { pessoaId: dona.id, email: emailSupa, em: new Date().toISOString() };
      gravarSessao(S.sessao);
      salvarEquipe();
      setTimeout(() => toast(`Conta ${emailSupa} vinculada à administradora ${dona.nome}. Agora preencha o e-mail de cada pessoa na Equipe.`), 600);
    }
  } else if (emailSupa) {
    /* conta logada mas sem vínculo: tela clara, sem herdar perfil de ninguém */
    S.sessao = null; gravarSessao(null);
    $("#app").innerHTML = `<div class="auth"><div class="auth-in">
      <div class="auth-card lg">
        <div class="auth-top">
          <div class="auth-logo" role="img" aria-label="Moda Bicho Acessórios"></div>
          <h2>Falta ligar esta conta a uma pessoa</h2>
          <p>A conta <b>${esc(emailSupa)}</b> entrou no servidor, mas ainda não está ligada a ninguém da Equipe.</p>
        </div>
        <div class="auth-b">
          <p class="auth-nota" style="text-align:left;margin:0 0 var(--sp4)"><b>Administradora:</b> abra a aba <b>Equipe</b> no seu acesso, edite a pessoa e preencha o campo <b>E-mail</b> com exatamente <b>${esc(emailSupa)}</b>. Depois é só ela recarregar esta página.</p>
          ${S.equipe.some((p) => p.adm && p.ativo !== false && !String(p.email || "").trim()) ? `
          <button class="btn primary" data-act="vincular-adm">Sou a administradora — vincular esta conta</button>` : ""}
          <button class="btn" data-act="sair-supa">Trocar de conta</button>
        </div>
      </div></div>
      ${authRodape()}
    </div><div class="toasts" id="toasts"></div>`;
    return;
  }
  /* A TELA DE "EU SOU + PIN" FOI REMOVIDA na v8.56.
     Ela aparecia quando havia administradora cadastrada e a sessão não apontava
     para ninguém — o que acontecia depois de "Sair do meu acesso", que marcava
     `saiuAMao()`. Com a conta valendo como identidade, esse estado não existe
     mais: quem tem conta entra por ela; quem não tem conta ligada a uma pessoa
     cai na tela de vínculo, logo acima, que é a resposta certa para esse caso.
     O PIN continua no banco e na aba Equipe — só não é mais porta de entrada. */
  /* ---------- v8.22 · o que está digitado numa janela aberta sobrevive ----------
     `render()` reescreve a tela INTEIRA, e a janela junto. O que a pessoa
     digitou vive só no DOM até ela clicar em Salvar — então qualquer redesenho
     no meio apaga o que ela escreveu, sem aviso, e o campo volta ao valor do
     objeto. Ela clica em Salvar achando que está gravando 182, e grava 150.
     Foi assim que o pedido 2304 perdeu a quantidade: a data de alteração
     avançou (o Salvar rodou) e o número não (o campo já não tinha mais o 182).

     A janela de criar pedido já resolvia isso desde a v8.20. Aqui a mesma ideia
     vale para QUALQUER janela: guarda o que está nos campos antes de reescrever
     e repõe depois. */
  const _digitado = (typeof colherDigitadoDaJanela === "function") ? colherDigitadoDaJanela() : null;
  $("#app").innerHTML = `
  <div class="shell ${railMini() ? "mini" : ""}">
    <nav class="rail">
      <div class="brand"><div class="brand-logo" role="img" aria-label="Moda Bicho Acessórios"></div>
        <button class="rail-toggle" data-act="toggle-rail" title="${railMini() ? "Expandir o menu" : "Recolher o menu (mais campo de visão)"}">${svg(railMini() ? IC.setaDir : IC.setaEsq)}</button></div>
      ${(() => { const DICA = { demanda: "produtos com saldo ainda sem pedido", pedidos: "pedidos em aberto — em qualquer etapa, do papel até a conferência",
        conferencia: "pedidos conferidos com erro provável no lançamento", tarefas: "tarefas suas em aberto", compras: "itens em falta ainda não comprados",
        insumos: "insumos abaixo do estoque mínimo",
        festivas: "campanhas em preparação ou vendendo", relatorios: "análise da operação",
        semiacabados: "remessas de bandana ainda fora da fábrica",
        prestadoras: "prestadoras abaixo do mínimo combinado de material" };
        return `<div class="nav">${nav.filter(([id]) => id === "sec" || podeAba(id)).map(([id, nome, badge, tom]) => id === "sec" ? `<div class="sec">${nome}</div>`
        : `<button data-aba="${id}" class="${S.aba === id ? "on" : ""}${badge && tom ? " chamando " + tom : ""}"${badge && DICA[id] ? ` title="${esc(badge + " " + DICA[id])}"` : ""}>${svg(IC[id])}<span>${nome}</span>${badge ? `<span class="badge${tom ? " " + tom : ""}">${badge}</span>` : ""}</button>`).join("")}</div>`; })()}
      ${(() => { /* ---------- rodapé: só a conta ----------
           Antes cabiam aqui sete informações — estoque, fila, em campo, status de
           gravação, usuário, dois botões e a versão. Área secundária não sustenta
           isso. O estado do sistema subiu para o topo; aqui fica quem está usando
           e um menu que guarda o resto. */
        const u = usuarioAtual();
        const aberto = !!S.menuConta;
        return `<div class="rail-foot">
        ${aberto ? `<div class="rf-menu">
          ${podeAba("historico") ? `<button data-aba="historico" class="${S.aba === "historico" ? "on" : ""}">${svg(IC.historico)}Histórico</button>` : ""}
          ${podeAba("dados") ? `<button data-aba="dados" class="${S.aba === "dados" ? "on" : ""}">${svg(IC.dados)}Dados e versão · v${VERSAO}</button>`
            : `<span style="display:block;padding:8px 10px;font-size:11.5px;color:var(--rail-txt-2)">PCP v${VERSAO}</span>`}
          <div class="rf-sep"></div>
          ${(() => { /* quem está no app e sob qual conta do servidor: quando as duas
               não são a mesma pessoa, isso precisa estar escrito, não adivinhado */
            const cs = String(supaSessao()?.email || "").trim().toLowerCase();
            if (!cs) return "";
            const meu = String(u?.email || "").trim().toLowerCase();
            return `<span style="display:block;padding:7px 10px;font-size:11px;line-height:1.5;color:var(--rail-txt-2)">
              No app: <b style="color:var(--rail-txt)">${esc(u?.nome || "—")}</b><br>Conexão da empresa: ${esc(cs)}${meu && meu !== cs ? " <b>(de outra pessoa)</b>" : ""}</span>`; })()}
          ${temJanelaReal && SUPA_URL && supaSessao()?.access ? `<button data-act="sair-supa">Trocar de conta</button>` : ""}
          <!-- "Sair do meu acesso" saiu junto com o PIN: sem a tela de escolher
               pessoa, sair do perfil não levava a lugar nenhum. Quem quer trocar
               de pessoa troca de conta, que é a mesma coisa agora. -->
        </div>` : ""}
        <span class="sinal">desenvolvido por: <span class="sinal-marca" role="img" aria-label="SINAL"></span></span>
        <button class="rf-conta ${aberto ? "on" : ""}" data-act="menu-conta" title="${esc(u?.nome || "")} — opções da conta">
          ${avatar(u?.nome || "?")}
          <span class="rf-nome"><b>${esc(u?.nome || "—")}</b><span>${u?.adm ? "administradora" : "operação"}</span></span>
          <span class="rf-mais">⋯</span>
        </button>
      </div>`; })()}
    </nav>
    <div class="main">
      <div class="topbar">
        <div><h1>${t}</h1><p>${sub}</p></div>
        <div class="right">
          ${S.estoque ? `<span class="tag ${idade > 7 ? "amber" : ""}">Estoque de ${fdate(S.estoque.importadoEm)}${idade > 7 ? ` · ${idade} dias atrás` : ""}</span>` : ""}
          ${(() => { if (!S.estoque?.estoqueEm || !S.estoque?.vendasEm) return "";
            const dEst = pdate(S.estoque.estoqueEm), dVen = pdate(S.estoque.vendasEm);
            const dif = Math.abs(dias(dEst, dVen));
            return dif > 3 ? `<span class="tag amber" title="O Consultar Estoque (que manda no estoque) é de ${fdate(S.estoque.estoqueEm)} e a Consulta Dinâmica é de ${fdate(S.estoque.vendasEm)}. Suba os dois no mesmo dia para a Demanda bater.">passos 2 e 3 com ${dif} dias de diferença</span>` : ""; })()}
          ${c ? `<span class="tag">Prazo típico ${Math.round(c.leadGeral)}d</span>` : ""}
          ${crachaTeste()}
          ${chipPresenca()}
          ${statusSalvo()}
          <button class="btn sm busca-topo" data-act="busca-rapida" title="Buscar pedido, SKU, produto ou prestadora (Ctrl + K)">${svg(IC.busca)}Buscar<kbd class="kbd-atalho">Ctrl K</kbd></button>
          <button class="btn sm ghost so-icone" data-act="girar-tema" title="${esc(TEMA_TITULO[temaEscolhido()])}" aria-label="${esc(TEMA_TITULO[temaEscolhido()])}">${svg(TEMA_ICONE[temaEscolhido()])}</button>
        </div>
      </div>
      ${typeof barraDeAbas === "function" ? barraDeAbas() : ""}
      <div class="page">${barraDeAvisos()}${corpo}</div>
    </div>
  </div>${barraMobile(nav)}${renderDrawer()}${renderModal()}${renderBuscaRapida()}`;
  if (_digitado && typeof reporDigitadoNaJanela === "function") reporDigitadoNaJanela(_digitado);
  /* v8.84 · VOLTAR DE UMA JANELA ABERTA POR CIMA. `_digitado` acima cobre a
     janela que CONTINUA de pé; isto cobre a que foi desmontada e voltou —
     "Gerenciar opções de embalagem" por cima do pedido, por exemplo. Tem de
     ser aqui, com o HTML novo já no lugar, e roda uma vez só. */
  if (typeof janelaReporRascunhoDaVolta === "function") { try { janelaReporRascunhoDaVolta(); } catch (e) { console.error("volta da janela:", e); } }
  /* RASCUNHO DA ABA (v8.62 · etapa 3). `_digitado` cobre a sobrevivência a UM
     render — a janela que continua de pé. Isto cobre a volta a uma aba cuja
     janela tinha sido desmontada: o que ela digitou está no estado da aba, e é
     reposto depois de a janela ser pintada. Um não substitui o outro. */
  else if (typeof abasReporRascunho === "function") abasReporRascunho();
  try {
    if (rolagem && rolagem.aba === S.aba) {
      /* a tela de trás volta sempre: abrir ou fechar uma janela não a move */
      /* devolve false quando alguma caixa não conseguiu voltar para o lugar —
         é o sinal de que a lista mudou de tamanho e a posição antiga sumiu */
      const repor = () => {
        let coube = true;
        const raiz = document.scrollingElement || document.documentElement;
        if (raiz.scrollTop !== rolagem.y) raiz.scrollTop = rolagem.y;
        const m = caixasTela();
        const guardado = new Map(rolagem.tela.map(([k, x, y]) => [k, [x, y]]));
        m.forEach((t2, k) => {
          /* o que acabou de ser medido vale mais; se a caixa não estava na tela
             na hora da medição, vale onde ela estava da última vez nesta aba */
          const onde = guardado.get(k) || _ondeEstava.get(S.aba + "|" + k);
          if (!onde) return;
          const [x, y] = onde;
          if (t2.scrollTop !== y || t2.scrollLeft !== x) { t2.scrollLeft = x; t2.scrollTop = y; }
          if (Math.abs(t2.scrollTop - y) > 2) coube = false;
          _ondeEstava.set(S.aba + "|" + k, [t2.scrollLeft, t2.scrollTop]);
        });
        return coube;
      };
      repor();
      seguirLinhaMarcada(rolagem.linha);
      /* a janela só volta se for a mesma janela */
      if (rolagem.modalTipo === (S.modal?.tipo || null) && rolagem.drawer === !!S.drawer) {
        caixasJanela().forEach((t2, i) => { const f2 = rolagem.janela[i];
          if (f2) { t2.scrollLeft = f2.x; t2.scrollTop = f2.y; } });
      }
      /* A altura de verdade da tabela só existe depois que o navegador desenha.
         Enquanto isso ele corta qualquer rolagem que não caiba — e é por isso
         que salvar um pedido jogava a tela para o começo mesmo com a posição
         guardada. Então repomos outra vez no quadro seguinte; e se nem assim
         couber, é porque a lista encolheu de verdade: aí trazemos de volta a
         linha que ela estava mexendo, que é o que ela não quer perder. */
      const meuCiclo = _ciclo;
      requestAnimationFrame(() => {
        if (meuCiclo !== _ciclo) return;   /* já veio outro render por cima */
        repor();
        seguirLinhaMarcada(rolagem.linha);
      });
    }
  } catch {}
}

