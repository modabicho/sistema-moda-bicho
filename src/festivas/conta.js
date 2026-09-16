/* ---------- a conta da campanha ----------
   O paralelo com a Demanda é de propósito — é a mesma cabeça, com outra régua:

     Demanda                     Campanha
     estMinCalc (sugerido)  ->   metaCalc   = base × (1 + crescimento)
     estMin (em uso)        ->   meta       = o que a análise aplicou
     minAjuste (à mão)      ->   metaManual = número cravado por ela
     saldoSemPedido         ->   falta      = meta − vendido − coberto

   E a diferença que importa: a Demanda projeta pela média do período; aqui a
   régua é o que ESTA campanha vendeu no ano passado. Nada nesta tela lê ou
   escreve na Demanda. */
/* ---------- v8.98 · O PRODUTO É O CONJUNTO DOS SKUs DELE ----------
   Depois de "Unir produtos", o absorvido vira `skusAnteriores` do principal —
   mas a conta da campanha lia só `it.sku`. A venda desta campanha, o pedido
   concluído e o pronto que estavam no código antigo sumiam da linha, e o
   "A produzir" inflava: mandava fazer de novo o que já tinha saído.

   Nada é reescrito para isso: pedido concluído e OP encerrada continuam com o
   código da época, e `vendasBase`/`vendasAtual` continuam como vieram. Só a
   CONTA reconhece que SKU atual + skusAnteriores são o mesmo produto.

   Duas guardas:
     · ESTOQUE fica de fora, de propósito: é do SKU, não do cadastro (CLAUDE.md
       8.5). A linha continua lendo o saldo do próprio SKU;
     · um SKU que tem LINHA PRÓPRIA nesta campanha não entra na linha de outro —
       senão a mesma venda contaria duas vezes nos totais. */
function festSkusDoItem(c, it) {
  const meu = skuNormal(it && it.sku);
  const todos = new Set([meu]);
  const p = typeof produtoPorSkuFrouxo === "function" ? produtoPorSkuFrouxo(it && it.sku) : null;
  if (p) {
    todos.add(skuNormal(p.sku));
    for (const h of (p.skusAnteriores || [])) todos.add(skuNormal(h?.sku || h));
  }
  for (const o of itensDaCampanha(c)) { const n = skuNormal(o.sku); if (n !== meu) todos.delete(n); }
  todos.delete("");
  return todos;
}
/* o relatório importado guarda a chave como veio; a soma é por SKU normalizado.
   Cache por objeto: importar de novo cria outro `porSku`. */
const _festPorSkuNormal = new WeakMap();
function festSomaSkus(porSku, skus) {
  if (!porSku) return 0;
  let m = _festPorSkuNormal.get(porSku);
  const n = Object.keys(porSku).length;
  if (!m || m.n !== n) {
    m = { n, mapa: new Map() };
    for (const [k, v] of Object.entries(porSku)) { const s = skuNormal(k); m.mapa.set(s, (m.mapa.get(s) || 0) + (Number(v) || 0)); }
    _festPorSkuNormal.set(porSku, m);
  }
  let t = 0;
  for (const s of skus) t += m.mapa.get(s) || 0;
  return t;
}
const festVendaAnterior = (c, it) => {
  const vb = (c.vendasBase && c.vendasBase.porSku) || null;
  const skus = festSkusDoItem(c, it);
  for (const s of (it.baseSkus || [])) { const n = skuNormal(s); if (n) skus.add(n); }
  return festSomaSkus(vb, skus);
};
function festLinha(c, it) {
  const l = S.calc?.porSku?.get(it.sku) || null;
  /* ---------- DUAS UNIDADES, e elas não são a mesma ----------
     A loja vende PACOTE. A fábrica produz PEÇA. O relatório de vendas, o estoque
     do ERP e a meta da campanha falam em pacote; o pedido de produção, o que
     está em produção e o que ficou pronto falam em peça.

     Isto estava trocado aqui de duas maneiras, e as duas davam número errado:

     1. `coberto` somava estoque (pacote) com programado e pronto (peça). Um
        pedido de 370 peças contava como 370 pacotes de cobertura — dez vezes
        mais do que existia — e a campanha parecia coberta sem estar.
     2. `falta` saía em pacote e ia direto para o pedido de produção. O SKU
        DF.H.025.10.elástico pedia 37 quando o correto era 37 × 10 = 370.

     A regra agora é a mesma da Demanda: pensa-se em PACOTE do começo ao fim, e
     só no último passo — o número que vai para a produção — multiplica-se pelas
     peças do pacote. O fator vem do cadastro do produto (`qtdPacote`), nunca de
     um número fixo: há pacote de 5, de 10, de 30, e há produto unitário. */
  const pac = Math.max(1, Number(l?.qtdPacote ?? produtoDe(it.sku)?.qtdPacote) || 1);
  /* ---------- o relógio da campanha vem antes da meta ----------
     Ele era calculado lá embaixo, só para o "ritmo". Agora é régua: para o
     produto que nasceu este ano, é o tempo corrido que transforma o que ele já
     vendeu numa projeção do total da campanha. */
  const ini = pdate(c.ini), fim = pdate(c.fim), h = hoje();
  let pctTempo = null;
  if (ini && fim && h >= ini) pctTempo = Math.min(1, (dias(ini, h) + 1) / Math.max(1, dias(ini, fim) + 1));

  /* v8.98 · o SKU atual e os anteriores são o mesmo produto (ver festSkusDoItem) */
  const skusDoItem = festSkusDoItem(c, it);
  const vendido = festSomaSkus(c.vendasAtual && c.vendasAtual.porSku, skusDoItem);
  const baseAuto = festVendaAnterior(c, it);
  const temMao = it.baseManual != null && it.baseManual !== "";
  const base = temMao ? Number(it.baseManual) || 0 : baseAuto;
  const cres = Number(c.crescimento) || 0;

  /* ---------- TRÊS RÉGUAS, na ordem em que a fábrica confia nelas ----------
     A campanha nasceu supondo que todo produto tem histórico do ano passado.
     Produto lançado ESTE ano não tem — e ficava com meta zero, classe "Sem
     meta", fora do filtro de ação e sem botão de produzir. Ou seja: existia no
     cadastro da campanha e era invisível justamente na tela em que se decide o
     que mandar fazer. (DF.H.COLAR.ABOBORA.2026 é um deles.)

       1. anterior  vendeu no ano passado -> ano passado × (1 + crescimento)
       2. atual     não vendeu no ano passado, mas está vendendo agora ->
                    projeta o total da campanha pelo tempo já corrido
       3. sem       não vendeu em nenhum dos dois -> não há o que projetar,
                    e o app diz isso em vez de inventar um número

     A projeção tem piso no que já vendeu (nunca propor menos do que já saiu) e
     só existe depois de 5% do tempo: com dois dias de campanha corridos,
     dividir por 0,02 transforma ruído em meta. */
  let metaCalc = 0, origemBase = "sem";
  if (base > 0) { metaCalc = Math.round(base * (1 + cres / 100)); origemBase = temMao ? "mao" : "anterior"; }
  else if (vendido > 0) {
    const proj = pctTempo != null && pctTempo > 0.05 ? Math.ceil(vendido / pctTempo) : vendido;
    metaCalc = Math.max(vendido, proj);
    origemBase = "atual";
  }
  const semBase = baseAuto <= 0 && !temMao;
  const metaMao = it.metaManual != null && it.metaManual !== "" ? Number(it.metaManual) || 0 : null;
  const metaAplicada = it.meta != null ? Number(it.meta) || 0 : null;
  const meta = metaMao != null ? metaMao : metaAplicada != null ? metaAplicada : metaCalc;
  const estoque = l ? Number(l.estoqueReal) || 0 : 0;

  /* só os pedidos DESTA campanha entram na conta dela — pedido normal do mesmo
     SKU é produção do dia a dia e já está sendo contado na Demanda */
  const rs = S.pedidos.filter((r) => r.campanhaId === c.id && skusDoItem.has(skuNormal((opPorId(r.opId) || {}).sku || r.sku)));
  /* E2 · a MESMA regra da Demanda e da OP. Aqui também a continuação viva de um
     original encerrado somia da conta, e a campanha pedia produção repetida. */
  const programado = rs.filter((r) => contaNaDemanda(r, S.pedidos))
    .reduce((t, r) => t + (Number(r.qtd) || 0), 0);
  const prontos = rs.filter((r) => r.status === "retornada");
  const pronto = prontos.reduce((t, r) => t + (boasDe(r) ?? 0), 0);
  /* DUPLA CONTAGEM, a regra do passo 9: a peça conferida vira estoque na
     próxima importação. Somar "pronto" ao estoque contaria a mesma peça duas
     vezes. Então só entra o que ficou pronto DEPOIS da foto do estoque — esse
     ainda não está lá dentro. */
  const marco = pdate(S.estoque?.importadoEm);
  const prontoNovo = marco ? prontos.filter((r) => { const d = pdate(r.retornadaEm); return d && d > marco; })
    .reduce((t, r) => t + (boasDe(r) ?? 0), 0) : 0;
  /* peça -> pacote para poder somar com o estoque e comparar com a meta */
  const cobertoPac = estoque + (prontoNovo + programado) / pac;
  const faltaPac = Math.max(0, meta - vendido - cobertoPac);
  /* ninguém corta meia embalagem: o que falta arredonda para o pacote inteiro,
     e é esse mesmo número que, multiplicado, vira a ordem de produção. Assim os
     dois batem sempre: 37 pacotes × 10 = 370 peças. */
  const necPac = Math.ceil(faltaPac - 1e-9);
  const produzir = necPac * pac;

  /* ritmo: quanto do tempo da campanha passou contra quanto da meta já vendeu.
     Supõe venda espalhada por igual — não temos a curva do ano passado, e a
     tela diz isso em vez de fingir que tem. Quando a meta veio da projeção pelo
     ritmo, comparar os dois seria conferir o número consigo mesmo: aí não há
     ritmo a mostrar. */
  const pctVenda = meta > 0 && origemBase !== "atual" ? vendido / meta : null;
  const ritmo = pctTempo == null || pctVenda == null ? null : pctVenda - pctTempo;

  /* "Sem base" é diferente de "Sem meta": um é falta de histórico (e precisa de
     uma decisão à mão), o outro é meta zerada de propósito. Separar os dois é o
     que faz o produto novo aparecer em vez de sumir num balaio. */
  const classe = meta <= 0 ? (semBase && vendido <= 0 ? "Sem base" : "Sem meta")
    : necPac > 0 && programado <= 0 ? "Produzir"
    : necPac > 0 ? "Cobrar produção"
    : "Coberto";
  return { it, sku: it.sku, l, descricao: l?.descricao || produtoDe(it.sku)?.descricao || "",
    abc: l?.abc || "C", processo: l?.processo || null, semLinha: !l,
    baseAuto, base, baseMao: temMao, metaCalc, meta, metaMao, metaAplicada, origemBase, semBase,
    divergeMeta: metaMao == null && metaAplicada != null && metaAplicada !== metaCalc,
    semAnalise: metaMao == null && metaAplicada == null,
    /* em PACOTE: base, meta, vendido, estoque, cobertoPac, necPac
       em PEÇA:   programado, pronto, prontoNovo, produzir
       `coberto` guarda o mesmo que `cobertoPac` para as somas da tela. */
    vendido, estoque, programado, pronto, prontoNovo,
    pac, cobertoPac, coberto: cobertoPac, faltaPac, necPac, produzir,
    pctTempo, pctVenda, ritmo, classe, comportamento: it.comportamento,
    pedidosAbertos: rs.filter((r) => PED_VIVO.includes(r.status)) };
}
function festLinhas(c) { return itensDaCampanha(c).map((it) => festLinha(c, it)); }

const FEST_CLASSES = [["acao", "Precisa de ação"], ["Produzir", "Produzir"], ["Cobrar produção", "Cobrar"],
  ["Coberto", "Coberto"], ["Sem base", "Sem base"], ["Sem meta", "Sem meta"], ["todos", "Todos"]];
const FEST_COR = { "Produzir": "red", "Cobrar produção": "amber", "Coberto": "teal", "Sem base": "amber", "Sem meta": "" };
/* de onde veio a meta daquela linha — é o que separa um número calculado de um
   número chutado, e a tela precisa dizer qual é qual */
const FEST_REGUA = {
  anterior: ["base 2025", "Meta = o que este produto vendeu na campanha do ano passado × (1 + crescimento)"],
  mao:      ["base à mão", "Meta calculada sobre a base que você digitou"],
  atual:    ["ritmo 2026", "Produto sem histórico do ano passado: a meta é a projeção do total da campanha pelo que ele já vendeu e pelo tempo já corrido"],
  sem:      ["sem base", "Não vendeu no ano passado nem nesta campanha — não há de onde projetar. Crave uma meta à mão ou mande produzir uma quantidade sua."],
};
const feReguaTag = (x) => { const r = FEST_REGUA[x.origemBase]; if (!r) return "";
  /* de onde veio a meta é informação, não elogio: projetar pelo ritmo deste
     ano não é "deu certo". Só a falta de base merece atenção. */
  const tom = x.origemBase === "sem" ? "atencao" : "";
  return `<span class="tag ${tom}" style="font-size:9.5px;padding:0 5px" title="${esc(r[1])}">${esc(r[0])}</span>`; };

/* ---------- vendas da campanha ----------
   Duas gavetas: o que ESTA campanha vendeu no ano passado (a régua) e o que ela
   está vendendo agora (o acompanhamento). Entram por CSV da Magazord com as
   datas da campanha, ou pelo que o app já tem — e depois disso vivem aqui,
   sem depender da importação do dia a dia. */
async function festImportarVendas(file, qual) {
  const c = campanhaPorId(S.festivasView.campanha);
  if (!c) return;
  await precisaPapa().catch(() => {});
  try {
    const buf = await file.arrayBuffer();
    let txt = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    if (txt.includes("�")) txt = new TextDecoder("iso-8859-1").decode(buf);
    const r = Papa.parse(txt.trim(), { header: true, delimiter: ";", skipEmptyLines: true });
    const col = (row, ...nomes) => { for (const n of nomes) { const k = Object.keys(row).find((x) => x.trim().toLowerCase() === n.toLowerCase()); if (k) return row[k]; } return ""; };
    const porSku = {};
    let n = 0;
    r.data.forEach((row) => {
      const sku = String(col(row, "Código", "Codigo", "SKU") || "").trim();
      if (!sku) return;
      const v = numBR(col(row, "Vendas no Período", "Vendas no Periodo"));
      if (!(Number(v) > 0)) return;
      porSku[sku] = (porSku[sku] || 0) + Number(v); n++;
    });
    if (!n) return toast("Nenhuma venda reconhecida — é o CSV da Consulta Dinâmica, com a coluna “Vendas no Período”?", "erro");
    const alvo = qual === "base" ? "vendasBase" : "vendasAtual";
    c[alvo] = { porSku, n, em: new Date().toISOString(), origem: "csv",
      periodoIni: S.festivasView.impIni || null, periodoFim: S.festivasView.impFim || null,
      arquivo: file.name || null };
    await gravarFestivas(`Vendas ${qual === "base" ? "do ano anterior" : "da campanha"} importadas em ${c.nome}: ${n0(n)} SKUs`);
    toast(`${n0(n)} SKUs com venda ${qual === "base" ? "do ano anterior" : "da campanha"}. ${n0(itensDaCampanha(c).filter((it) => festVendaAnterior(c, it) > 0).length)} produtos da campanha foram encontrados.`);
  } catch (e) { console.error(e); toast("Não consegui ler o arquivo. Use o CSV da Consulta Dinâmica.", "erro"); }
}
/* "nascer com o que já temos": o número que o app tem é o do período do último
   relatório importado — serve de ponto de partida, e a tela deixa claro que o
   período é aquele, não o da campanha. */
async function festPuxarDoApp(qual) {
  const c = campanhaPorId(S.festivasView.campanha);
  if (!c) return;
  if (!S.estoque?.itens?.length) return toast("Não há relatório de vendas importado no app ainda.", "erro");
  const porSku = {};
  let n = 0;
  S.estoque.itens.forEach((i) => { const v = Number(i.vendas) || 0; if (v > 0 && i.sku) { porSku[i.sku] = v; n++; } });
  c[qual === "base" ? "vendasBase" : "vendasAtual"] = { porSku, n, em: new Date().toISOString(),
    origem: "app", periodoIni: S.estoque.periodoIni || null, periodoFim: S.estoque.periodoFim || null };
  await gravarFestivas(`Vendas ${qual === "base" ? "anteriores" : "atuais"} de ${c.nome} vieram do relatório do app`);
  toast(`Veio do relatório de ${fdate(S.estoque.periodoIni)} a ${fdate(S.estoque.periodoFim)} — confira se é o período que você quer.`);
}

/* ---------- aplicar a análise ----------
   Mesma cerimônia da Demanda: mostra o que vai mudar, ela confirma, e só então
   a meta passa a valer. Sem isso a meta dançaria sozinha a cada importação —
   e ninguém consegue planejar em cima de um número que se mexe. */
function festPrevia(c) {
  const ls = festLinhas(c).filter((x) => x.metaMao == null);
  const novas = ls.filter((x) => x.metaAplicada == null && x.metaCalc > 0);
  const mudam = ls.filter((x) => x.metaAplicada != null && x.metaAplicada !== x.metaCalc);
  const zeradas = ls.filter((x) => x.metaCalc <= 0);
  return { ls, novas, mudam, zeradas,
    total: ls.reduce((t, x) => t + x.metaCalc, 0),
    antes: ls.reduce((t, x) => t + (x.metaAplicada || 0), 0) };
}
async function festAplicarAnalise(c) {
  const p = festPrevia(c);
  p.ls.forEach((x) => { x.it.meta = x.metaCalc; });
  c.analises = [...(c.analises || []), {
    id: uid(), em: new Date().toISOString(), por: usuarioAtual()?.nome || null,
    crescimento: Number(c.crescimento) || 0,
    novas: p.novas.length, mudaram: p.mudam.length, total: p.total,
    itens: p.ls.map((x) => ({ sku: x.sku, base: x.base, meta: x.metaCalc })) }];
  S.modal = null;
  await gravarFestivas(`Análise aplicada em ${c.nome}: ${n0(p.ls.length)} metas, ${n0(p.total)} pacotes`);
  /* a meta é comercial: ela conta o que a loja vende, que é pacote. A conversão
     para peça acontece só na hora de mandar produzir. */
  toastPasso(`${n0(p.ls.length)} ${p.ls.length === 1 ? "meta atualizada" : "metas atualizadas"}.`,
    `${n0(p.total)} pacotes de meta na campanha`,
    "veja em “A produzir” quantas peças isso dá e crie os pedidos");
}

