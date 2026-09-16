/* ---------- Conferência de processos (o ControleProcessos da planilha) ----------
   Uma linha por pedido conferido, com as etapas da estrutura, a quantidade que a
   responsável lançou em cada uma e o valor que sai daí. O objetivo é achar o erro de
   digitação antes de pagar: 100 peças viram 1000 com um zero a mais, e a diferença
   só aparece quando se compara com a quantidade que saiu no papel. */
/* ---------- comparação com a planilha ----------
   Guardamos o retrato do que a última importação continha (número + SKU de cada
   linha). Com ele dá para responder as duas perguntas que interessam na faxina:
   o que existe no app e não existe lá, e onde o mesmo número aponta para outro SKU. */
const chavePed = (n, sku) => String(n).trim().toUpperCase() + "§" + String(sku || "").trim();
function retrato() {
  const r = S.cad.retratoPlanilha;
  if (!r?.chaves) return null;
  if (!r._set || r._n !== r.chaves.length) { r._set = new Set(r.chaves); r._n = r.chaves.length;
    r._nums = new Map();
    for (const k of r.chaves) { const [n, sk] = k.split("§"); const l = r._nums.get(n); l ? l.push(sk) : r._nums.set(n, [sk]); } }
  return r;
}
const skuDoPedido = (x) => (opPorId(x.opId) || {}).sku || x.sku;
/* o pedido inteiro não existe na planilha — nem o número */
function foraDaPlanilha(x) {
  const r = retrato(); if (!r) return false;
  return !r._nums.has(String(x.numero).trim().toUpperCase());
}
/* o número existe na planilha, mas apontando para outro SKU — troca ou digitação errada */
function numeroComOutroSku(x) {
  const r = retrato(); if (!r) return false;
  const skus = r._nums.get(String(x.numero).trim().toUpperCase());
  if (!skus) return false;
  return !skus.includes(String(skuDoPedido(x) || "").trim());
}

function conferenciaDe(r) {
  const op = opPorId(r.opId) || {};
  const sku = op.sku || r.sku;
  const prod = produtoDe(sku);
  const estr = estruturaDe(r.processo || prod?.processo);
  const usadas = new Set(etapasDoPedido(r).map((e) => String(e).toUpperCase()));
  const lancadas = new Map((r.etapas || []).map((e) => [String(e.nome).toUpperCase(), e]));
  /* Continuações do mesmo pedido dividem o processo: a Tati faz a máquina no 1186 e a
     Andreia faz cola e embalagem no 1186-A. Uma etapa lançada na irmã não está faltando
     aqui — está com outra prestadora, e cobrar isso seria alarme falso. */
  const irmaos = (indiceIrmaos().get(RAIZ_PEDIDO(r.numero)) || []).filter((x) => x.id !== r.id);
  const porIrmao = new Map();
  for (const ir of irmaos) for (const e of (ir.etapas || []))
    if (Number(e.qtd) > 0) porIrmao.set(String(e.nome).toUpperCase(), { numero: ir.numero, prestadora: ir.prestadora, qtd: Number(e.qtd) });
  /* no pedido é o que saiu no papel; na remessa é o que voltou, porque na saída
     não existe quantidade. A mesma conta serve às duas. */
  const enviada = qtdTrabalhada(r);
  const etapas = (estr?.etapas || []).map((et) => {
    const nome = String(et.nome).toUpperCase();
    const l = lancadas.get(nome);
    const qtd = l && l.qtd != null ? Number(l.qtd) : null;
    const vu = l && l.vu != null ? Number(l.vu) : (Number(et.valor) || 0);
    const outro = qtd == null ? porIrmao.get(nome) : null;
    const usa = !outro && cobreEtapa(r, nome, usadas);
    /* zero lançado quer dizer "esta prestadora não fez esta etapa" — é informação, não erro.
       Só entra na comparação com o papel quem tem quantidade de verdade. */
    const conta = qtd != null && qtd > 0;
    const razao = conta && enviada > 0 ? qtd / enviada : null;
    return { nome, vu, qtd, usa, razao, valor: qtd != null ? qtd * vu : null, naoFez: qtd === 0, outro,
      /* um dígito a mais ou a menos: a razão fica perto de 10 ou de 0,1 */
      zeroAMais: razao != null && razao >= 5,
      zeroAMenos: razao != null && razao > 0 && razao <= 0.2 };
  });
  const preenchidas = etapas.filter((e) => e.qtd != null);
  const feitas = etapas.filter((e) => e.qtd > 0);
  /* ---------- feito × terminado ----------
     Ela passou 194 pela trava e embalou 190: fez 194 peças de trabalho e
     entregou 190 prontas. As 4 existem — pagas na etapa em que passaram — mas
     não chegaram ao fim, e não podem virar estoque. O app guardava só a última
     etapa e a diferença sumia. */
  const trabalhadas = feitas.length ? Math.max(...feitas.map((e) => e.qtd)) : null;
  /* a planilha é a última fonte consultada, nunca a primeira */
  const legado = (S.cad.valorPed || {})[r.numero];
  const produzido = feitas.length ? feitas[feitas.length - 1].qtd
    : (prontasDe(r) ?? legado?.produzido ?? null);
  const brutoEtapas = preenchidas.length ? preenchidas.reduce((s, e) => s + e.valor, 0) : null;
  /* `custoReal` e a planilha são planos B para pedido ANTIGO, que veio com o
     total e sem as quantidades por etapa. A remessa não tem passado: ela vale o
     que as etapas lançadas valem, e nada mais. Sem isso, tirar o processo de uma
     remessa deixaria um valor congelado pagando sozinho, sem coluna que o
     explicasse na tela. */
  const totalBruto = ehRemessa(r) ? brutoEtapas : (brutoEtapas ?? r.custoReal ?? legado?.total ?? null);
  /* o que ela recebe já é líquido das peças com defeito */
  const defeito = defeitoDe(r);
  /* o divisor é o que VOLTOU, derivado das etapas — não o campo gravado.
     `mesclarPedidos` sobrescreve `qtdConferida` com a Qtd Realizada da planilha
     sem tocar nas etapas, então os dois divergem e o desconto sai menor do que
     devia. É o mesmo erro do `qtdConferida` corrigido na 7.67, sobrevivendo aqui
     dentro do dinheiro. */
  const voltouReal = prontasDe(r) ?? Number(r.qtdConferida) ?? 0;
  const descD = totalBruto != null && defeito && voltouReal
    ? Math.min(totalBruto, totalBruto * (defeito / Number(voltouReal))) : 0;
  const total = totalBruto == null ? null : Math.max(0, totalBruto - descD);

  const alertas = [];
  for (const e of etapas) {
    if (e.zeroAMais) alertas.push({ nivel: "erro", txt: `${e.nome}: ${n0(e.qtd)} para ${n0(enviada)} enviadas — parece um zero a mais` });
    else if (e.zeroAMenos) alertas.push({ nivel: "erro", txt: `${e.nome}: ${n0(e.qtd)} para ${n0(enviada)} enviadas — parece faltar um dígito` });
    else if (e.razao != null && e.razao > 1.15) alertas.push({ nivel: "aviso", txt: `${e.nome}: ${n0(e.qtd)} acima das ${n0(enviada)} enviadas` });
    else if (e.razao != null && e.razao < 0.85) alertas.push({ nivel: "aviso", txt: `${e.nome}: ${n0(e.qtd)} bem abaixo das ${n0(enviada)} enviadas` });
  }
  const qtdsDistintas = [...new Set(feitas.map((e) => e.qtd))];
  if (qtdsDistintas.length > 1) {
    const dif = Math.max(...qtdsDistintas) - Math.min(...qtdsDistintas);
    if (dif / Math.max(1, Math.max(...qtdsDistintas)) > 0.15)
      alertas.push({ nivel: "aviso", txt: `Etapas com quantidades bem diferentes entre si (${qtdsDistintas.map(n0).join(" · ")})` });
  }
  const apx = estruturaAproximada(r.processo);
  if (!estr || !(estr.etapas || []).length) alertas.push({ nivel: "erro", txt: apx === "__ambiguo"
    ? `Processo ${r.processo || "—"} parece com mais de uma estrutura — nenhuma foi usada, para não pagar pela errada. Acerte o nome do processo.`
    : `Processo ${r.processo || "—"} sem estrutura cadastrada — o valor não tem como ser calculado` });
  else if (!preenchidas.length && !legado && r.custoReal == null) alertas.push({ nivel: "erro", txt: "Nenhuma quantidade lançada por etapa — o pedido não gera pagamento" });
  else if (etapas.some((e) => e.usa && e.qtd == null) && preenchidas.length)
    alertas.push({ nivel: "aviso", txt: `Etapas do processo sem lançamento: ${etapas.filter((e) => e.usa && e.qtd == null).map((e) => e.nome).join(", ")}` });
  if (estr && apx && apx !== "__ambiguo")
    alertas.push({ nivel: "aviso", txt: `O processo é "${r.processo}" mas o valor saiu da estrutura "${apx}" — confira se é a mesma coisa` });
  if (feitas.some((e) => !(e.vu > 0))) alertas.push({ nivel: "erro", txt: "Etapa lançada com valor por peça zerado — confira a estrutura" });
  if (trabalhadas != null && produzido != null && trabalhadas > produzido)
    alertas.push({ nivel: "aviso", txt: `${n0(trabalhadas)} passaram pela maior etapa e ${n0(produzido)} chegaram ao fim — ${n0(trabalhadas - produzido)} ${trabalhadas - produzido === 1 ? "peça ficou" : "peças ficaram"} pelo caminho` });
  if (defeito > 0) alertas.push({ nivel: "aviso",
    txt: `${n0(defeito)} ${defeito === 1 ? "peça com defeito" : "peças com defeito"} — não ${defeito === 1 ? "conta" : "contam"} como produzida nem ${defeito === 1 ? "é paga" : "são pagas"}${descD ? ` (${freal(descD)} a menos)` : ""}` });
  if (defeito > 0 && r.qtdConferida != null && defeito > Number(r.qtdConferida))
    alertas.push({ nivel: "erro", txt: `Mais peças com defeito (${n0(defeito)}) do que peças que voltaram (${n0(r.qtdConferida)})` });

  return { pedido: r, sku, enviada, etapas, preenchidas, produzido, total,
    trabalhadas, naoTerminadas: trabalhadas != null && produzido != null ? Math.max(0, trabalhadas - produzido) : 0,
    defeito, totalBruto, brutoEtapas, descontoDefeito: descD, boas: boasDe(r),
    alertas, erro: alertas.some((a) => a.nivel === "erro"), aviso: alertas.some((a) => a.nivel === "aviso"),
    competencia: competenciaDe(r), legado: !preenchidas.length && !!legado };
}
/* tela: uma linha por pedido conferido, com as etapas lado a lado — para bater com o papel */
/* Edição direto na célula: o que a planilha permitia e o app só permitia abrindo o pedido.
   Grava a etapa, recalcula o custo e mantém a ordem da estrutura. */
/* ---------- repintar a linha, não a tela ----------
   Lançar uma quantidade redesenhava o app inteiro. As células não têm id, e a
   restauração de foco do render() é indexada por id — então o Tab que acabara de
   levar a pessoa para a célula seguinte a encontrava destruída, e o foco voltava
   para o começo da página. Um mês inteiro lançado assim é inviável, que é
   justamente o que a planilha fazia bem. Aqui só as células DERIVADAS (produzido,
   defeito, total, alertas) e a cor da célula editada são refeitas — nenhum campo
   onde alguém possa estar digitando é tocado. */
function repintarConfLinha(r) {
  const tr = document.querySelector(`tr[data-conf-linha="${(window.CSS && CSS.escape) ? CSS.escape(r.id) : r.id}"]`);
  if (!tr) return false;
  const x = conferenciaDe(r);
  tr.querySelectorAll("[data-etq]").forEach((inp) => {
    const nome = String(inp.dataset.etq.split("|")[1] || "");
    const e = x.etapas.find((y) => y.nome === nome);
    if (!e) return;
    inp.style.color = e.zeroAMais || e.zeroAMenos ? "var(--red)"
      : e.razao != null && (e.razao > 1.15 || e.razao < 0.85) ? "var(--amber)" : "";
    inp.style.fontWeight = e.zeroAMais || e.zeroAMenos ? "800"
      : e.razao != null && (e.razao > 1.15 || e.razao < 0.85) ? "700" : "";
    if (document.activeElement !== inp) inp.value = e.qtd ?? "";
  });
  const cel = (k) => tr.querySelector(`[data-cel="${k}"]`);
  if (cel("produzido")) cel("produzido").innerHTML = `<b>${x.produzido != null ? n0(x.produzido) : "—"}</b>`
    + (x.naoTerminadas ? `<div class="s" style="justify-content:flex-end" title="${n0(x.trabalhadas)} passaram pela maior etapa"><span>de ${n0(x.trabalhadas)}</span></div>` : "");
  if (cel("defeito")) cel("defeito").innerHTML = x.defeito ? `<b style="color:var(--amber)">${n0(x.defeito)}</b>` : '<span style="color:var(--ink-4)">—</span>';
  if (cel("total")) cel("total").innerHTML = (x.total != null ? freal(x.total) : "—")
    + (x.descontoDefeito ? `<div style="font-size:9.5px;color:var(--amber)">−${freal(x.descontoDefeito)} defeito</div>` : "")
    + (x.legado ? '<div style="font-size:9.5px;color:var(--ink-4)">da planilha</div>' : "");
  if (cel("alertas")) {
    const antes = cel("alertas").innerHTML;
    const botoes = antes.slice(antes.indexOf('<button class="btn sm ghost" data-conf-ped'));
    cel("alertas").innerHTML = (x.alertas.length
      ? `<button class="btn sm ghost" data-conf-ped="${esc(r.id)}" style="color:var(--${x.erro ? "perigo" : "atencao"});font-weight:700;padding:3px 9px" title="${esc(x.alertas.map((y) => y.txt).join(" · "))}">● ${n0(x.alertas.length)}</button>`
      : '<span class="tag ok">ok</span>') + botoes;
  }
  /* os KPIs do topo somam a tela toda: refeitos à parte, sem tocar na tabela */
  const kp = document.getElementById("conf-kpis");
  if (kp) {
    const todos = S.pedidos.filter((y) => y.status === "retornada").map(conferenciaDe);
    const v = S.prestView;
    const filtrados = todos.filter((y) => (v.mesProc === "todos" || y.competencia === (v.mes || (S.calc?.mesesCompetencia || [])[0]))
      && (!v.prest || v.prest === "todas" || y.pedido.prestadora === v.prest));
    const nE = filtrados.filter((y) => y.erro).length, nA = filtrados.filter((y) => !y.erro && y.aviso).length;
    kp.querySelectorAll(".kpi .val").forEach((elv, i) => {
      if (i === 0) elv.textContent = n0(filtrados.length);
      else if (i === 1) elv.textContent = n0(nE);
      else if (i === 2) elv.textContent = n0(nA);
      else if (i === 3) elv.textContent = freal(filtrados.reduce((s2, y) => s2 + (y.total || 0), 0));
    });
    kp.querySelectorAll(".kpi").forEach((k2, i) => {
      if (i === 1) { k2.classList.toggle("red", nE > 0); }
      if (i === 2) { k2.classList.toggle("amber", nA > 0); }
    });
  }
  return true;
}

async function aplicarEtapaQtd(r, nome, valorBruto) {
  const comp = competenciaDe(r);
  /* a remessa encerrada é o equivalente ao pedido retornado: trabalho terminado,
     dentro de um mês que pode estar fechado */
  const terminado = ehRemessa(r) ? r.status === "encerrada" : r.status === "retornada";
  if (terminado && mesFechado(comp))
    return toast(`${ehRemessa(r) ? "A remessa" : "Pedido"} ${r.numero} está no fechamento de ${comp}, que está fechado. Reabra o mês em Prestadoras para corrigir.`, "erro");
  const estr = estruturaDe(r.processo || produtoDe(opPorId(r.opId)?.sku || r.sku)?.processo);
  const def = (estr?.etapas || []).find((e) => String(e.nome).toUpperCase() === nome);
  const antes = (r.etapas || []).slice();

  const txt = String(valorBruto ?? "").trim();
  let lista = antes.filter((e) => String(e.nome).toUpperCase() !== nome);
  if (txt !== "") {
    const qtd = Math.max(0, Math.round(Number(txt.replace(",", ".")) || 0));
    const vuAntigo = antes.find((e) => String(e.nome).toUpperCase() === nome)?.vu;
    lista.push({ nome, qtd, vu: vuAntigo != null ? Number(vuAntigo) : (Number(def?.valor) || 0) });
  }
  /* devolve na ordem da estrutura: a última preenchida é o "Produzido" */
  const ordem = (estr?.etapas || []).map((e) => String(e.nome).toUpperCase());
  lista.sort((a, b) => ordem.indexOf(String(a.nome).toUpperCase()) - ordem.indexOf(String(b.nome).toUpperCase()));
  r.etapas = lista;
  r.custoReal = lista.reduce((s, e) => s + (Number(e.qtd) || 0) * (Number(e.vu) || 0), 0) || null;
  const feitas = lista.filter((e) => Number(e.qtd) > 0);
  const produzidoAgora = feitas.length ? Number(feitas[feitas.length - 1].qtd) : null;
  /* o que voltou pronto acompanha a última etapa, sempre: não existe mais um
     número digitado à mão para respeitar */
  r.qtdConferida = produzidoAgora;
  const o = opPorId(r.opId);
  if (o) recalcularOP(o);
  /* repinta a linha; só cai no render() inteiro se a linha não estiver na tela */
  if (!repintarConfLinha(r)) render();
  /* a remessa mora na seção `semi`. Gravar "nucleo" aqui deixaria o lançamento
     só na memória — e a próxima leitura o apagaria sem avisar. */
  await salvarTudo(ehRemessa(r) ? "semi" : "nucleo");
}

function viewProcessos() {
  const v = S.prestView, c = S.calc;
  const mesesComp = c?.mesesCompetencia || [];
  const mesSel = v.mes && mesesComp.includes(v.mes) ? v.mes : mesesComp[0] || "";
  /* remessa encerrada é trabalho terminado da prestadora: entra na mesma lista,
     pela mesma função de conta. Nada é copiado — `conferenciaDe` lê a remessa
     direto, porque ela já tem número, prestadora, processo e etapas. */
  let confs = [...S.pedidos.filter((r) => r.status === "retornada"), ...remessasConferiveis()]
    .map(conferenciaDe);
  if (v.mesProc !== "todos") confs = confs.filter((x) => x.competencia === mesSel);
  if (v.prest && v.prest !== "todas") confs = confs.filter((x) => x.pedido.prestadora === v.prest);
  const nErro = confs.filter((x) => x.erro).length, nAviso = confs.filter((x) => !x.erro && x.aviso).length;
  const nTodos = confs.length;
  if (v.confFiltro === "erro") confs = confs.filter((x) => x.erro);
  else if (v.confFiltro === "aviso") confs = confs.filter((x) => x.aviso);
  const b = String(v.buscaConf || "").trim().toLowerCase();
  if (b) confs = confs.filter((x) => [x.pedido.numero, x.sku, x.pedido.prestadora, x.pedido.processo].some((y) => String(y || "").toLowerCase().includes(b)));
  confs.sort((a, y) => (y.erro - a.erro) || (y.aviso - a.aviso) || String(a.pedido.numero).localeCompare(String(y.pedido.numero), undefined, { numeric: true }));
  const edit = v.editarCel !== false;
  /* antes parava em 150 sem dizer nada: o KPI mostrava 400 e a lista, 150.
     Agora o limite cresce sozinho na rolagem, como nas outras telas. */
  const totalConf = confs.length;
  const vis = confs.slice(0, v.limiteConf || 120);
  const maxEt = Math.max(1, ...confs.map((x) => x.etapas.length));

  return `
  <div class="kpis" id="conf-kpis">
    ${kpi("Pedidos conferidos", n0(nTodos), v.mesProc === "todos" ? "todo o histórico" : mesSel || "sem mês", "teal",
      { attr: "data-fconf", valor: "todos", ativo: v.confFiltro === "todos", dica: "Mostrar todos os conferidos" })}
    ${kpi("Com erro provável", nErro, "zero a mais, sem estrutura ou sem lançamento", nErro ? "red" : "",
      { attr: "data-fconf", valor: "erro", ativo: v.confFiltro === "erro", dica: "Mostrar só os que têm erro provável" })}
    ${kpi("Para olhar", nAviso, "quantidade fora do esperado", nAviso ? "amber" : "",
      { attr: "data-fconf", valor: "aviso", ativo: v.confFiltro === "aviso", dica: "Mostrar só os que fogem do esperado" })}
    ${(() => { const sb = confs.reduce((s2, x) => s2 + (x.naoTerminadas || 0), 0);
      return sb ? `<div class="kpi-info">${kpi("Sem terminar", n0(sb), "passaram por uma etapa e não chegaram ao fim")}</div>` : ""; })()}
    ${podeVerValores() ? `<div class="kpi-info">${kpi("Valor no filtro", freal(confs.reduce((s, x) => s + (x.total || 0), 0)), "soma das etapas lançadas")}</div>` : ""}
  </div>
  <div class="card">
    <div class="filters">
      <div class="search">${svg(IC.busca)}<input class="inp" id="q-conf" style="width:230px" placeholder="Buscar pedido, SKU ou prestadora" value="${esc(v.buscaConf || "")}"></div>
      <select class="sel" id="mes-conf" aria-label="Mês da conferência">${mesesComp.map((m) => `<option ${m === mesSel ? "selected" : ""}>${esc(m)}</option>`).join("") || "<option>sem histórico</option>"}</select>
      <button class="chip ${v.mesProc === "todos" ? "on" : ""}" data-mesproc="${v.mesProc === "todos" ? "mes" : "todos"}">${v.mesProc === "todos" ? "Todo o histórico" : "Só o mês"}</button>
      <select class="sel" id="f-prest-conf" aria-label="Filtrar por prestadora"><option value="todas">Todas as prestadoras</option>
        ${nomesPrest().map((n) => `<option ${v.prest === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
      <span class="divider"></span>
      <button class="chip ${edit ? "on" : ""}" data-editcel="${edit ? "0" : "1"}" title="Digitar a quantidade de cada etapa direto na tabela, sem abrir o pedido">${svg(IC.editar)}Editar na tabela</button>
      ${podeVerValores() ? `<button class="btn sm" style="margin-left:auto" data-act="print-conferencia" title="${v.prest && v.prest !== "todas" ? `Só a folha de ${esc(v.prest)}` : "Sai uma folha por prestadora — use o seletor ao lado para gerar a de uma só"}">${svg(IC.impressora)}Imprimir conferência</button>` : `<span style="margin-left:auto"></span>`}
      <button class="btn sm ghost" data-act="exp-processos">Exportar .xlsx</button>
    </div>
    <div class="tw"><table class="t"><thead><tr>
      ${thOrd("conf", "numero", "Pedido")}${thOrd("conf", "sku", "SKU")}${thOrd("conf", "prest", "Prestadora")}${thOrd("conf", "processo", "Processo")}
      ${thOrd("conf", "enviada", `Enviada<br><span style="font-weight:400;font-size:10px;color:var(--ink-3)">no papel</span>`, "num")}
      ${Array.from({ length: maxEt }, (_, i) => `<th class="num">P${i + 1}</th>`).join("")}
      ${thOrd("conf", "produzido", "Produzido", "num")}<th class="num" title="Voltaram com defeito — não contam como produzidas nem são pagas">Defeito</th>${podeVerValores() ? thOrd("conf", "total", "Total", "num") : ""}${thOrd("conf", "alertas", "Conferência")}</tr></thead>
    <tbody>${ordenarPor("conf", vis, (x, campo) =>
        campo === "numero" ? x.pedido.numero : campo === "sku" ? x.sku
        : campo === "prest" ? x.pedido.prestadora : campo === "processo" ? x.pedido.processo
        : campo === "enviada" ? x.enviada : campo === "produzido" ? x.produzido
        : campo === "total" ? x.total : campo === "alertas" ? (x.erro ? 2 : x.aviso ? 1 : 0) : null)
      .map((x) => `<tr data-conf-linha="${esc(x.pedido.id)}">
      <td class="sku">${esc(x.pedido.numero)}${ehEspelho(x.pedido) ? ' <span class="tag" title="continuação: outro processo, outra prestadora">cont.</span>' : ""}${ehRemessa(x.pedido) ? ' <span class="sit" title="Remessa de semiacabado — bandana costurada que ainda não é SKU">REMESSA</span>' : ""}</td>
      <td class="sku clickable" style="font-size:12px" data-sku="${esc(x.sku || "")}">${ehRemessa(x.pedido)
        ? `<span style="color:var(--ink-3);font-family:inherit">${esc(remessaResumo(x.pedido) || "semiacabado")}</span>` : esc(x.sku || "—")}</td>
      <td style="font-size:12px">${esc(x.pedido.prestadora || "—")}</td>
      <td style="font-size:11px">${esc(x.pedido.processo || "—")}</td>
      <td class="num" title="${ehRemessa(x.pedido)
        ? "Na remessa não existe quantidade na saída — este é o total que a prestadora contou e devolveu"
        : "Quantidade que saiu no papel da ordem de produção"}"><b>${n0(x.enviada)}</b>${ehRemessa(x.pedido)
        ? '<div class="s" style="justify-content:flex-end"><span>o que voltou</span></div>' : ""}</td>
      ${Array.from({ length: maxEt }, (_, i) => { const e = x.etapas[i];
        if (!e) return '<td class="num" style="color:var(--ink-4)">—</td>';
        const cor = e.zeroAMais || e.zeroAMenos ? "color:var(--red);font-weight:800"
          : e.razao != null && (e.razao > 1.15 || e.razao < 0.85) ? "color:var(--amber);font-weight:700" : "";
        const dica = `${esc(e.nome)}${e.vu ? ` · ${fmoeda(e.vu)}/peça` : ""}${e.qtd ? ` · ${freal(e.valor)}` : ""}${e.outro ? ` · feita no pedido ${esc(e.outro.numero)} por ${esc(e.outro.prestadora || "outra prestadora")}` : ""}`;
        if (e.outro) return `<td class="num" title="${dica}"><div style="color:var(--ink-3);font-size:10px">→ ${esc(e.outro.numero)}</div>
          <div class="et-nome">${esc(e.nome.slice(0, 11))}</div></td>`;
        return `<td class="num" title="${dica}">
          ${edit ? `<input class="cel-qtd" type="number" min="0" step="1" style="${cor}" value="${e.qtd ?? ""}"
              placeholder="${e.usa ? "falta" : "—"}" data-etq="${esc(x.pedido.id)}|${esc(e.nome)}" title="${dica}">`
            : `<div style="${cor}">${e.naoFez ? '<span style="color:var(--ink-4)">não fez</span>'
              : e.qtd != null ? n0(e.qtd) : (e.usa ? '<span style="color:var(--amber)">falta</span>' : "—")}</div>`}
          <div class="et-nome">${esc(e.nome.slice(0, 11))}</div></td>`; }).join("")}
      <td class="num" data-cel="produzido"><b>${x.produzido != null ? n0(x.produzido) : "—"}</b>${x.naoTerminadas ? `<div class="s" style="justify-content:flex-end" title="${n0(x.trabalhadas)} passaram pela maior etapa — ${n0(x.naoTerminadas)} não chegaram ao fim"><span>de ${n0(x.trabalhadas)}</span></div>` : ""}</td>
      <td class="num" data-cel="defeito">${x.defeito ? `<b style="color:var(--amber)">${n0(x.defeito)}</b>` : '<span style="color:var(--ink-4)">—</span>'}</td>
      ${podeVerValores() ? `<td class="num" data-cel="total">${x.total != null ? freal(x.total) : "—"}${x.descontoDefeito ? `<div style="font-size:9.5px;color:var(--amber)">−${freal(x.descontoDefeito)} defeito</div>` : ""}${x.legado ? '<div style="font-size:9.5px;color:var(--ink-4)">da planilha</div>' : ""}</td>` : ""}
      <td style="white-space:nowrap" data-cel="alertas">${x.alertas.length
        ? `<button class="btn sm ghost" data-conf-ped="${esc(x.pedido.id)}" style="color:var(--${x.erro ? "perigo" : "atencao"});font-weight:700;padding:3px 9px"
            title="${esc(x.alertas.map((a) => a.txt).join(" · "))}">● ${n0(x.alertas.length)}</button>`
        : '<span class="tag ok">ok</span>'}
        ${ehRemessa(x.pedido)
          ? `<button class="btn sm ghost" data-abrirrem="${esc(x.pedido.id)}" style="padding:3px 8px">Abrir remessa</button>`
          /* Três botões fantasma do mesmo peso ("Abrir · Reabrir · Etapas") não
             dão hierarquia nenhuma: a pessoa lê os três antes de saber qual é
             o caminho normal. O caminho normal é ABRIR a conferência; reabrir
             e definir etapas são exceções. Um contornado e dois discretos. */
          : `<button class="btn sm primary" data-conf-ped="${esc(x.pedido.id)}" style="padding:3px 8px">Abrir</button>
        ${mesFechado(x.competencia) ? "" : `<button class="btn sm ghost" data-reabrir-conf="${esc(x.pedido.id)}" style="padding:3px 8px" title="Devolve para 'Conferir' e desfaz a baixa de insumo">Reabrir</button>`}
        ${podeEditar("pedEtapas") ? `<button class="btn sm ghost" data-etapas-ped="${esc(x.pedido.id)}" style="padding:3px 8px" title="Definir quais etapas são responsabilidade desta prestadora neste pedido">Etapas</button>` : ""}`}</td></tr>`).join("")
      || vazioLinha("filtro", "Nenhum resultado", "Nenhum pedido conferido encontrado com estes filtros.",
        v.confFiltro !== "todos" ? `<button class="btn primary sm" data-fconf="todos">Ver todos os ${n0(nTodos)}</button>` : "")}
    </tbody></table></div>
    ${totalConf > vis.length ? `<div style="padding:14px;text-align:center;border-top:1px solid var(--line-2)">
      <button class="btn" data-act="mais-conf">Mostrar mais <span style="color:var(--ink-3);font-weight:400">· ${n0(vis.length)} de ${n0(totalConf)}</span></button></div>` : ""}
    <details class="legenda"><summary>Como ler esta tabela</summary><div class="legenda-in">
      <span><b>Enviada</b> é a quantidade que saiu no papel da ordem de produção. Cada Pn é o que a responsável lançou naquela etapa.</span>
      <span>Linha marcada <b>REMESSA</b> é bandana de semiacabado: não tem SKU, e a coluna Enviada mostra <b>o que voltou</b> — na saída da remessa não existe quantidade. Ela entra aqui quando é encerrada em <b>Semiacabados</b>.</span>
      <span>Vermelho = quantidade 5× maior ou menor que a enviada, o padrão de um dígito digitado errado. Âmbar = fora de 15% para mais ou para menos.</span>
      <span><b>Produzido</b> é a última etapa preenchida e <b>Total</b> é a soma de cada etapa × valor por peça da estrutura — a mesma conta da planilha.</span>
    </div></details>
  </div>`;
}

/* ---------- quanto esta prestadora recebe no mês ----------
   Quem manda é o app. A planilha carregou o histórico uma vez e acabou: o número
   dela só entra onde o app não tem nada — pedido antigo que veio com o total mas
   sem as quantidades por etapa. Assim, corrigir uma conferência aqui muda o
   pagamento, que é o mínimo que se espera de um sistema de produção. */
/* ---------- peça com defeito ----------
   Ela está DENTRO do que voltou: voltaram 100, 20 com defeito, 80 prestam. A peça
   com defeito não é paga e não conta como produção — não dá para vender, então o
   saldo dela volta a aparecer na Demanda para ser refeito. O material, esse já
   foi: a baixa de insumo continua saindo pelo total que voltou.
   `qtdSegunda` é o nome antigo do campo e continua sendo lido, para o histórico
   não perder o número. */
const defeitoDe = (r) => Math.max(0, Number(r?.qtdDefeito ?? r?.qtdSegunda) || 0);
/* ---------- quantas voltaram prontas ----------
   Com etapas lançadas, é a última preenchida — e é a ÚNICA resposta. A 7.65 tirou
   o campo de digitar e passou a derivar isto ao salvar, mas a leitura continuava
   olhando o `qtdConferida` guardado: pedido antigo com um número velho lá dentro
   ainda respondia o número velho até alguém salvá-lo de novo. Agora quem lê e
   quem grava usam a mesma conta, e o valor guardado é só o cache dela. */
const prontasDe = (r) => {
  const feitas = (r?.etapas || []).filter((e) => Number(e.qtd) > 0);
  if (feitas.length) return Number(feitas[feitas.length - 1].qtd) || 0;
  /* null tem de sair como null, não como zero: `Number(null)` é 0, e um pedido
     sem conferência lançada não é um pedido que produziu zero — é um pedido do
     qual o app não sabe, e aí quem responde é a planilha antiga. */
  if (r?.qtdConferida == null || r.qtdConferida === "") {
    /* a remessa já sabe: a prestadora contou e informou no retorno. O número
       aparece como Produzido antes de qualquer lançamento — o que falta é dizer
       em QUAL etapa ele foi feito, e é isso que a Conferência pergunta. */
    return ehRemessa(r) ? voltouNaRemessa(r).total : null;
  }
  const voltou = Number(r.qtdConferida);
  return Number.isFinite(voltou) ? voltou : null;
};
const boasDe = (r) => {
  const prontas = prontasDe(r);
  if (prontas == null) return null;
  return Math.max(0, prontas - defeitoDe(r));
};
/* ---------- uma conta só ----------
   A tela da Conferência e a folha do fechamento precisam sair do MESMO cálculo,
   senão o papel que a prestadora assina não bate com o que o app mostrou. Havia
   duas divergências reais aqui:

   • pedido vindo da planilha (sem `custoReal`) com peças com defeito: a tela
     abatia o defeito, a folha pagava cheio;
   • etapa renomeada na estrutura: a tela recalculava pelas etapas atuais e a
     folha pagava o `custoReal` congelado, com a etapa sumida da coluna.

   Agora `valorDoPedido` é uma leitura de `conferenciaDe`, que já era a única
   função que sabia somar etapa, legado e desconto. */
function valorDoPedido(r2) {
  const c = conferenciaDe(r2);
  if (c.totalBruto == null) return { valor: 0, fonte: null, desconto: 0 };
  const fonte = c.brutoEtapas != null || r2.custoReal != null ? "app" : "planilha";
  return { valor: Math.max(0, Number(c.total) || 0), fonte, desconto: Number(c.descontoDefeito) || 0 };
}
function pecasDoPedido(r2) {
  const v2 = (S.cad.valorPed || {})[r2.numero];
  const boas = boasDe(r2);
  if (boas != null) return boas;
  return Number(v2?.produzido) || 0;
}
/* quanto abater do pagamento pelas peças com defeito: o mesmo valor por peça que
   a etapa final pagaria. Sem etapa lançada não há o que abater. */
function descontoDefeito(r2) {
  const d = defeitoDe(r2);
  if (!d || r2.custoReal == null) return 0;
  /* derivado das etapas, como em `conferenciaDe` — a `boas` calculada aqui e
     nunca usada era o resto da intenção original, e ficava de enfeite enquanto
     a conta dividia pelo campo gravado. */
  const voltou = prontasDe(r2) ?? Number(r2.qtdConferida) ?? 0;
  if (!voltou) return 0;
  /* proporcional: o custo lançado vale pelas peças que voltaram; as com defeito
     saem na mesma proporção */
  return Math.min(Number(r2.custoReal) || 0, (Number(r2.custoReal) || 0) * (d / voltou));
}
function fechamentoDe(p, mesSel, base) {
  let pecas = 0, valor = 0, temNumero = false, doLegado = 0;
  const pedidosMes = [];
  /* pedidos retornados e remessas encerradas, na mesma conta: as duas coisas são
     trabalho que esta prestadora fez neste mês, e a folha que ela assina precisa
     mostrar as duas. Uma lista, dois tipos de linha — nunca dois cálculos. */
  for (const r2 of [...S.pedidos, ...remessasConferiveis()]) {
    /* ERA `r2.prestadora !== p.nome`: igualdade estrita, sem `trim`, sem
       normalizar. Um espaço a mais e o pedido saía da folha desta pessoa —
       sem erro, sem aviso, sem linha em lugar nenhum. Este é o join do
       PAGAMENTO; era o pior lugar do app para comparar string.
       `prestMesma` resolve pelo id (nome atual · nome anterior · slug) e só
       cai na comparação de texto quando nenhum dos dois tem id. */
    if (!prestMesma(r2.prestadoraId || r2.prestadora, p.id || p.nome)) continue;
    if (!(ehRemessa(r2) ? r2.status === "encerrada" : r2.status === "retornada")) continue;
    if (competenciaDe(r2) !== mesSel) continue;
    pedidosMes.push(r2);
    const v = valorDoPedido(r2);
    pecas += pecasDoPedido(r2);
    if (v.fonte) { temNumero = true; valor += v.valor; if (v.fonte === "planilha") doLegado++; }
  }
  /* nenhum pedido com número próprio: cai na estimativa pelas estruturas */
  if (!temNumero && base) { pecas = base.pecas; valor = base.custo; }
  const regra = bonusDe(p.procsTodos, pecas, valor);
  const pct = regra ? Number(regra.pct) || 0 : 0;
  /* o bônus em reais, não só em porcento: é o que ela confere no papel */
  const bonus = valor * pct;
  return { pecas, valor, pct, regra, bonus, total: valor + bonus, planilha: temNumero, doLegado, pedidosMes,
    fechado: mesFechado(mesSel), trava: infoFechamento(mesSel) };
}

