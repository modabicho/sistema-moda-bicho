/* ---------- motor de cálculo ---------- */
function calcular() {
  if (S.produtos.some((p) => !p.id)) migrarProdutosV2();
  /* autocura: descrição vazia se preenche com o nome que já veio no CSV do estoque (passo 2) */
  if (!S._curouDescricoes && S.estoque?.itens?.length && S.produtos.some((p) => !String(p.descricao || "").trim())) {
    S._curouDescricoes = true;
    const nomes = new Map(S.estoque.itens.map((x) => [x.sku, [x.produto, x.derivacao].filter(Boolean).join(" - ").trim()]));
    let n = 0;
    for (const p of S.produtos) {
      if (String(p.descricao || "").trim()) continue;
      const d = nomes.get(p.sku) || (p.skusAnteriores || []).map((h) => nomes.get(h.sku)).find(Boolean);
      if (d) { p.descricao = d; p.magazord = { ...(p.magazord || {}), descricao: d }; n++; }
    }
    if (n) setTimeout(() => { salvarTudo("produtos"); toast(`${n0(n)} descrições preenchidas a partir do estoque já importado.`); }, 800);
  }
  if (!S.estoque) return null;
  /* o ERP alcançou o ajuste: a decisão cumpriu seu papel e sai de cena */
  if (S._minConferido !== S.estoque.importadoEm) {
    S._minConferido = S.estoque.importadoEm;
    const minErp = new Map((S.estoque.itens || []).map((x) => [x.sku, Number(x.estMinimo) || 0]));
    let n = 0;
    for (const p of S.produtos) {
      if (!p.minAjuste) continue;
      const erp = minErp.get(p.sku);
      if (erp != null && erp === Number(p.minAjuste.valor)) { delete p.minAjuste; n++; }
    }
    if (n) setTimeout(() => { salvarTudo("produtos");
      toast(`${n0(n)} ${n === 1 ? "mínimo ajustado já está" : "mínimos ajustados já estão"} na Magazord — ajuste encerrado.`); }, 900);
  }
  const prodMap = new Map(S.produtos.map((p) => [p.sku, p]));
  const ini = pdate(S.estoque.periodoIni) || new Date(new Date().getFullYear(), 0, 1);
  const fim = pdate(S.estoque.periodoFim) || hoje();
  const diasPeriodo = Math.max(1, dias(ini, fim) + 1);
  const mesesPeriodo = diasPeriodo / 30.44;

  /* prazo real por processo, da mediana dos pedidos conferidos */
  const porProc = new Map(), todos = [];
  for (const r of S.pedidos) {
    if (r.status !== "retornada") continue;
    const a = pdate(r.separadaEm || r.enviadaEm), b = pdate(r.retornadaEm);
    if (!a || !b) continue;
    const d = dias(a, b);
    if (d < 0 || d > 180) continue;
    todos.push(d);
    const k = r.processo || "—";
    if (!porProc.has(k)) porProc.set(k, []);
    porProc.get(k).push(d);
  }
  const leadGeral = mediana(todos) ?? 12;
  const leadProc = new Map();
  porProc.forEach((v, k) => { if (v.length >= 4) leadProc.set(k, mediana(v)); });
  const leadDe = (p) => leadProc.get(p) ?? leadGeral;

  /* Em produção. A fórmula da planilha era "Status <> 6. Produzido e Pedido
     <> *-A", e o app a copiou ao pé da letra: descartava TODA continuação,
     sempre. Só que, quando o original é conferido e some da conta, quem está
     com as peças é a continuação — e o SKU passava a mostrar ZERO em produção
     com 480 peças na mão de uma prestadora. A Demanda mandava produzir de novo.

     A regra agora é de LINHAGEM, não de texto (`nucleo/utilidades.js`): conta o
     original enquanto ele estiver vivo; quando ele sai, a continuação assume.
     A conta por SKU continua sendo UMA por linhagem.

     `Com a prestadora` segue a MESMA regra, e não uma paralela: era esse o
     segundo filtro, e dois filtros diferentes para a mesma pergunta é como as
     telas passavam a discordar. */
  const programado = new Map(), porEtapa = new Map();
  for (const r of S.pedidos) {
    if (!PED_VIVO.includes(r.status)) continue;
    const op = opPorId(r.opId);
    const sku = op ? op.sku : r.sku;
    if (!sku) continue;
    const q = Number(r.qtd) || 0;
    const conta = contaNaDemanda(r, S.pedidos);
    if (conta) programado.set(sku, (programado.get(sku) || 0) + q);
    const m = porEtapa.get(sku) || { Inicial: 0, Cortado: 0, "Com a prestadora": 0 };
    const et = etapaFisica(r);
    if (et && !(et === "Com a prestadora" && !conta)) m[et] += q;
    porEtapa.set(sku, m);
  }

  /* curva ABC */
  const itens = S.estoque.itens || [];
  const total = itens.reduce((s, i) => s + (Number(i.valorVendido) || 0), 0) || 1;
  const abc = new Map(); let acum = 0;
  itens.slice().sort((a, b) => (b.valorVendido || 0) - (a.valorVendido || 0))
    .forEach((i) => { acum += (Number(i.valorVendido) || 0) / total; abc.set(i.sku, acum <= 0.8 ? "A" : acum <= 0.95 ? "B" : "C"); });

  const linhas = itens.map((it) => {
    const prod = prodMap.get(it.sku);
    const qtdPacote = Number(prod?.qtdPacote) || 1;
    const externo = (prod?.fornecimento || "").toUpperCase() === "EXTERNO";
    /* processo e curva sobem para cá: são eles que decidem quantos meses de segurança valem */
    const processo = prod?.processo || null;
    const abcSku = abc.get(it.sku) || "C";
    const regraMes = regraMesesDe(processo);
    const mesesSeg = mesesSegurancaDe(processo, abcSku, externo);
    const vendas = Number(it.vendas) || 0;
    const semVenda = it.semVenda === true || vendas <= 0;
    const estMinErp = Number(it.estMinimo) || 0;
    const ajusteMin = prod?.minAjuste && Number(prod.minAjuste.valor) > 0 ? prod.minAjuste : null;
    const estMin = ajusteMin ? Number(ajusteMin.valor) : estMinErp;
    /* ---- estoque real ----
       O Disponível do Faderim JÁ vem líquido da reserva: Disp = Física + Virtual − Reservada.
       Conferido nas 2.450 linhas do relatório. Descontar a reserva outra vez, como a
       fórmula herdada da planilha fazia, tirava as mesmas peças duas vezes.
       Para os SKUs que só existem no passo 2 (sem venda no período, logo fora do Faderim),
       a conta equivalente é Física − Reservada — dá exatamente o mesmo número. */
    const estoqueReal = it.origemEstoque === "consultarEstoque" && it.estFisico != null
      ? (Number(it.estFisico) || 0) - (Number(it.estReservado) || 0)
      : (Number(it.estDisponivel) || 0) - (Number(it.estVirtual) || 0);
    const estMinCalc = Math.round((vendas / mesesPeriodo) * mesesSeg);

    /* fórmulas literais da aba Demanda */
    const necessidadeBruta = estoqueReal >= estMin ? 0 : (estMin - estoqueReal) * qtdPacote;
    const qtdProgramada = programado.get(it.sku) || 0;
    const saldoSemPedido = estMin <= estoqueReal + qtdProgramada / qtdPacote
      ? 0 : Math.abs(necessidadeBruta - qtdProgramada); /* "Demanda de Produção" */
    const pctEstoque = estMin > 0 ? estoqueReal / estMin : (estoqueReal > 0 ? null : 1);
    const pctComProducao = estMin > 0 ? (estoqueReal + qtdProgramada / qtdPacote) / estMin
      : (estoqueReal + qtdProgramada / qtdPacote > 0 ? null : 1);

    const vendaDia = vendas / diasPeriodo;
    const cobertura = vendaDia > 0 ? estoqueReal / vendaDia : estoqueReal > 0 ? 999 : 0;
    const lead = leadDe(processo);
    const folga = Math.min(cobertura, 999) - lead;
    const op = opAtivaDe(it.sku);
    const pedidosAbertos = op ? pedidosDe(op.id).filter((r) => PED_VIVO.includes(r.status)) : [];

    /* Status: cópia fiel da fórmula da planilha */
    let classe, motivo;
    if (pctEstoque == null || pctEstoque > 1) {
      classe = vendas > 0 ? "Estoque Excedente (Com Vendas)" : "Estoque Excedente (Sem Vendas)";
      motivo = "Estoque acima do mínimo";
    } else if (pctEstoque === 1) { classe = "No Estoque Mínimo"; motivo = "Exatamente no limite do mínimo"; }
    else if (saldoSemPedido > 0 && qtdProgramada === 0) {
      classe = abcSku === "A" ? "Urgente - Produzir" : "Produzir";
      motivo = "Abaixo do mínimo e nada em produção";
    } else if (estoqueReal < estMin && qtdProgramada > 0) {
      classe = abcSku === "A" ? "Urgente - Cobrar Produção" : "Cobrar Produção";
      motivo = saldoSemPedido > 0 ? "Em produção, mas ainda falta programar " + n0(saldoSemPedido) + " pçs" : "Em produção — acompanhar o retorno";
    } else { classe = "-"; motivo = ""; }

    const RANK = { "Urgente - Produzir": 100, "Urgente - Cobrar Produção": 88, "Produzir": 72,
      "Cobrar Produção": 58, "No Estoque Mínimo": 30, "Estoque Excedente (Com Vendas)": 10,
      "Estoque Excedente (Sem Vendas)": 5, "-": 0 };
    const score = RANK[classe] ?? 0;

    return { sku: it.sku, descricao: prod?.descricao || it.produto, derivacao: it.derivacao,
      categoria: prod?.categoria || it.categoria, processo, qtdPacote, semCadastro: !prod,
      abc: abc.get(it.sku) || "C", vendas, vendaDia, valorVendido: Number(it.valorVendido) || 0,
      estMin, estMinErp, estMinCalc, minAjuste: ajusteMin, mesesSeg, externo,
      regraMeses: regraMes?.processo || null, estoqueReal, pctEstoque, pctComProducao, necessidadeBruta, qtdProgramada, saldoSemPedido,
      etapas: porEtapa.get(it.sku) || { Inicial: 0, Cortado: 0, "Com a prestadora": 0 }, pedidosAbertos,
      cobertura, lead, folga, classe, motivo, score, op, semVenda,
      estFisico: it.estFisico ?? null, previstaEntrada: it.previstaEntrada || 0, ativo: it.ativo !== false,
      divergeMin: !semVenda && estMin > 0 && Math.abs(estMinCalc - estMin) / estMin > TOL_MIN,
      /* volta para a fila de revisão se o ERP mudou ou se a sugestão andou muito
         desde o dia em que alguém decidiu manter o número antigo */
      minRevisar: (() => {
        if (semVenda || !(estMin > 0) || Math.abs(estMinCalc - estMin) / estMin <= TOL_MIN) return false;
        if (ajusteMin) return false;
        const mant = prod?.minMantido;
        if (!mant) return true;
        if ((mant.erpQuando || 0) !== estMinErp) return true;
        const sq = Number(mant.sugQuando) || 0;
        return sq > 0 && Math.abs(estMinCalc - sq) / sq > TOL_MIN;
      })() };
  });

  const porSku = new Map(linhas.map((l) => [l.sku, l]));

  /* ------ A FILA: pedidos abertos ------
     bloco cronológico da OP, prioridade DO PEDIDO, criação do pedido. */
  /* ordem oficial de execução: 1º prioridade (Crítico, Urg, P1..P3) · 2º curva ABC · 3º mais antigo */
  const ordemFila = (a, b) => (a.prioridade - b.prioridade)
    || ((ABC_RANK[a.abc] ?? 2) - (ABC_RANK[b.abc] ?? 2))
    || String(a.criadoEm).localeCompare(String(b.criadoEm))
    || String(a.numero).localeCompare(String(b.numero));
  /* ---- pedido com cadastro furado ----
     Não é atraso nem urgência de estoque: é dado que falta na origem e faz o
     pedido andar cego. Sem estoque não dá para calcular prioridade; sem
     quantidade o papel sai em branco; sem setor ninguém recebe a tarefa. */
  const problemasDe = (r, l) => {
    const p2 = [];
    if (!l) p2.push(produtoDe(opPorId(r.opId)?.sku || r.sku)?.provisorio
      ? "produto novo — ainda sem SKU na Magazord"
      : "SKU fora do estoque importado — renomeado ou saiu de linha");
    if (!(Number(r.qtd) > 0)) p2.push("sem quantidade");
    if (!r.processo && !produtoDe(opPorId(r.opId)?.sku || r.sku)?.processo) p2.push("sem processo definido");
    else if (!setorDoPedido(r)) p2.push("processo fora dos setores — ninguém recebe a tarefa");
    return p2;
  };
  const papel = S.pedidos
    .filter((r) => r.status === "papel")
    .map((r) => { const op = opPorId(r.opId) || {}; const l = porSku.get(op.sku || r.sku);
      return { ...r, op, sku: op.sku || r.sku, linha: l, abc: l?.abc || "C", problemas: problemasDe(r, l) }; })
    .sort(ordemFila)
    .map((r, i) => ({ ...r, posicao: i + 1 }));
  const fila = S.pedidos
    .filter((r) => r.status === "aberto")
    .map((r) => { const op = opPorId(r.opId) || {}; const l = porSku.get(op.sku || r.sku);
      return { ...r, op, sku: op.sku || r.sku, linha: l, abc: l?.abc || "C", bloco: op.analiseOrigemId ?? 0, problemas: problemasDe(r, l) }; })
    .sort(ordemFila)
    .map((r, i) => ({ ...r, posicao: i + 1 }));

  /* pedidos em percurso físico */
  const emCampo = S.pedidos.filter((r) => ["separando", "enviada", "chegou"].includes(r.status)).map((r) => {
    const op = opPorId(r.opId) || {};
    const sku = op.sku || r.sku;
    const l = porSku.get(sku);
    const base = pdate(r.enviadaEm || r.separadaEm);
    const idade = base ? dias(base, hoje()) : null;
    const lead = l?.lead ?? leadDe(r.processo);
    const atraso = idade != null ? idade - lead : 0;
    /* dias de folga além do prazo antes de considerar a prestadora atrasada:
       o prazo é uma mediana, não uma promessa — um ou dois dias não é atraso */
    const tolAtraso = Math.max(0, Number(S.cfg.toleranciaAtraso) ?? 3);
    const score = Math.round((l?.score ?? 40) * 0.55 + Math.max(0, Math.min(1, atraso / 30)) * 30 + (4 - (r.prioridade || 3)) * 5);
    /* atraso de conferência: a peça voltou e está parada esperando alguém conferir.
       Custa dinheiro de dois jeitos — a prestadora não recebe e o estoque não entra. */
    const baseConf = pdate(r.chegouEm) || pdate(r.retornadaEm);
    const diasParado = r.status === "chegou" && baseConf ? dias(baseConf, hoje()) : null;
    const prazoConf = Math.max(1, Number(S.cfg.prazoConferencia) || 3);
    /* regra da planilha: conferência que passa do dia 5 já não entra no fechamento
       do mês em que a peça voltou — daí a prestadora só recebe no mês seguinte */
    const h = hoje();
    const perdeuMes = r.status === "chegou" && baseConf
      && (baseConf.getFullYear() * 12 + baseConf.getMonth()) < (h.getFullYear() * 12 + h.getMonth())
      && h.getDate() > 5;
    return { ...r, op, sku, linha: l, idade, lead, atraso, score, diasParado, perdeuMes,
      atrasoConferencia: diasParado != null && diasParado > prazoConf,
      /* ---- pedido com cadastro furado ----
         Não é atraso nem urgência: é dado que falta na origem e faz o pedido
         andar cego pela fábrica. Sem estoque não há como calcular prioridade;
         sem quantidade o papel sai em branco; sem processo ninguém recebe a tarefa. */
      problemas: problemasDe(r, l),
      /* ---- dois motivos diferentes de ligar para a prestadora ----
         ATRASADA: passou do prazo combinado (mediana do processo) mais a tolerância.
           O problema é dela, e a conversa é "cadê o pedido".
         ADIANTAR: está dentro do prazo, mas o estoque caiu e precisamos antes.
           O problema é nosso, e a conversa é "dá para adiantar?".
         Misturar os dois num "cobrar" só faz a pessoa ligar cobrando quem não
         está devendo nada — e some com o atraso de verdade no meio da lista. */
      atrasoProducao: r.status === "enviada" && atraso > tolAtraso,
      diasAtraso: atraso > tolAtraso ? atraso : 0,
      adiantar: r.status === "enviada" && atraso <= tolAtraso && (r.prioridade ?? 4) <= 1,
      cobrar: r.status === "enviada" && (atraso > tolAtraso || (r.prioridade ?? 4) <= 1) };
  }).sort((a, b) => b.score - a.score);

  /* ------ tarefas ------ */
  const teto = Math.max(10, Number(S.cfg.capacidadeFila) || 40);
  const tarefas = [
    ...fila.slice(0, teto).map((r) => ({
      tipo: "pedido", id: r.id, ...FLUXO.aberto, sku: r.sku, qtd: r.qtd,
      prioridade: r.prioridade, posicao: r.posicao, responsavel: r.responsavel || null,
      prestadora: r.prestadora, linha: r.linha,
      setorNome: setorDoPedido(r)?.nome || null, split: splitAdesivo(r),
      urgente: r.prioridade === 1 && !r.aguardandoMaterial,
      aguardandoMaterial: r.aguardandoMaterial,
      score: r.aguardandoMaterial ? 20 - r.posicao * 0.01 : 1000 - r.posicao,
      ref: r.numero, status: r.status,
    })),
    ...emCampo.map((r) => ({
      tipo: "pedido", id: r.id, ...(FLUXO[r.status] || FLUXO.enviada),
      funcaoAlt: r.status === "enviada" && r.atraso > 0 ? "acompanhar" : null,
      sku: r.sku, qtd: r.qtd, prioridade: r.prioridade, prestadora: r.prestadora,
      setorNome: setorDoPedido(r)?.nome || null, split: splitAdesivo(r),
      responsavel: r.responsavel || null, linha: r.linha, urgente: r.cobrar && !r.aguardandoMaterial,
      aguardandoMaterial: r.aguardandoMaterial,
      score: r.aguardandoMaterial ? Math.min(r.score, 18) : r.score,
      atraso: r.atraso, lead: r.lead, idade: r.idade, ref: r.numero, status: r.status,
    })),
  ].sort((a, b) => b.score - a.score);

  /* ------ perfil produtivo das prestadoras ------ */
  const valorProc = new Map();
  (S.cad.estruturas || []).forEach((e) => {
    const v = (e.etapas || []).reduce((s2, et) => s2 + (Number(et.valor) || 0), 0);
    if (v > 0) valorProc.set(e.processo, v);
  });
  const competencia = (r) => competenciaDe(r);
  const meses = new Set(), prest = new Map();
  const bucket = (n) => {
    if (!prest.has(n)) prest.set(n, { abertas: 0, pecasAbertas: 0, pecasP1: 0, atrasadas: 0,
      enviado: 0, retornado: 0, leads: [], concluidas: 0, porMes: {},
      refs: new Map(), procs: new Map(), primeiraData: null, ultimaData: null });
    return prest.get(n);
  };
  for (const r of S.pedidos) {
    if (!r.prestadora) continue;
    const b = bucket(r.prestadora);
    const op = opPorId(r.opId) || {};
    const sku = op.sku || r.sku;
    if (r.status === "retornada") {
      const q = r.qtdConferida != null ? Number(r.qtdConferida) : (Number(r.qtd) || 0);
      b.concluidas++; b.enviado += Number(r.qtd) || 0; b.retornado += q;
      const a = pdate(r.separadaEm || r.enviadaEm), c2 = pdate(r.retornadaEm);
      if (a && c2) { const d = dias(a, c2); if (d >= 0 && d <= 180) b.leads.push(d); }
      if (a) { if (!b.primeiraData || a < b.primeiraData) b.primeiraData = a; if (!b.ultimaData || a > b.ultimaData) b.ultimaData = a; }
      if (sku) {
        const ref = b.refs.get(sku) || { vezes: 0, total: 0, leads: [], ultima: null };
        ref.vezes++; ref.total += q;
        if (a && c2) { const d = dias(a, c2); if (d >= 0 && d <= 180) ref.leads.push(d); }
        if (c2 && (!ref.ultima || c2 > ref.ultima)) ref.ultima = c2;
        b.refs.set(sku, ref);
      }
      if (r.processo) { const pc = b.procs.get(r.processo) || { vezes: 0, total: 0 }; pc.vezes++; pc.total += q; b.procs.set(r.processo, pc); }
      const comp = competencia(r);
      if (comp) {
        meses.add(comp);
        const m2 = (b.porMes[comp] = b.porMes[comp] || { pecas: 0, custo: 0, pedidos: 0 });
        m2.pedidos++; m2.pecas += q; m2.custo += q * (valorProc.get(r.processo) || 0);
      }
    } else if (PED_VIVO.includes(r.status)) {
      b.abertas++; b.pecasAbertas += Number(r.qtd) || 0;
      if (r.prioridade <= 2) b.pecasP1 += Number(r.qtd) || 0;
      const dt = pdate(r.enviadaEm || r.separadaEm);
      if (dt && dias(dt, hoje()) - leadDe(r.processo) > 0) b.atrasadas++;
    }
  }
  const prestadoras = S.cad.prestadoras.map((pr) => {
    const b = prest.get(pr.nome) || { abertas: 0, pecasAbertas: 0, pecasP1: 0, atrasadas: 0, enviado: 0,
      retornado: 0, leads: [], concluidas: 0, porMes: {}, refs: new Map(), procs: new Map(), primeiraData: null, ultimaData: null };
    const mesesAtivos = b.primeiraData && b.ultimaData ? Math.max(1, (b.ultimaData - b.primeiraData) / (DIA * 30.44)) : 1;
    const mediaMensal = b.retornado ? Math.round(b.retornado / mesesAtivos) : 0;
    const procsAuto = [...new Set([...b.procs.keys(), ...((S.cad.procsPrestadora || {})[pr.nome] || [])])];
    const procsTodos = [...new Set([...(pr.processos || []), ...procsAuto])]
      .filter((p2) => !(pr.procsExcluidos || []).includes(p2));
    return { ...pr, ...b, prazoMedio: mediana(b.leads),
      aproveitamento: b.enviado ? b.retornado / b.enviado : null,
      mediaMensal, mesesAtivos, procsAuto, procsTodos,
      refsExcluidas: pr.refsExcluidas || [],
      capacidade: Number(pr.capacidadeManual) || mediaMensal };
  });
  const prestMap = new Map(prestadoras.map((p) => [p.nome, p]));
  const ordemMes = (m2) => { const [n, a] = String(m2).split(" "); return (Number(a) || 0) * 100 + MESES.indexOf(n); };
  const mesesCompetencia = [...meses].sort((a, b) => ordemMes(b) - ordemMes(a));

  const faltasAbertas = S.faltas.filter((f) => f.status === "aberta").length;

  /* fila de revisão de mínimo: quem vende mais e diverge mais aparece primeiro */
  const minRevisar = linhas.filter((l) => l.minRevisar)
    .sort((a, b) => (ABC_RANK[a.abc] ?? 2) - (ABC_RANK[b.abc] ?? 2) || (b.valorVendido || 0) - (a.valorVendido || 0));
  /* ---------- duas esperas diferentes, que pareciam uma só ----------
     Antes tudo que tinha `minAjuste` ficava numa lista só, e ela continuava com
     os mesmos 60 depois de a pessoa gerar o CSV e importar na Magazord. Ela não
     tinha como saber o que ainda precisava levar e o que já tinha levado.

     São duas coisas diferentes:
       A ENVIAR   decidido aqui e ainda não saiu num arquivo  -> é trabalho dela
       ENVIADOS   já foram no arquivo, esperando a Magazord   -> é espera

     `minPendentes` continua sendo a união, porque "aguardando a Magazord" é
     verdade para os dois — quem some sozinho é o ajuste, quando o CSV do passo 1
     voltar com o valor já aplicado. Nada é apagado na exportação: apagar seria
     jogar fora a prova justamente no caso em que a importação lá falha. */
  const minPendentes = linhas.filter((l) => l.minAjuste);
  const minAEnviar = minPendentes.filter((l) => !l.minAjuste.exportadoEm);
  const minEnviados = minPendentes.filter((l) => l.minAjuste.exportadoEm)
    .sort((a, b) => String(b.minAjuste.exportadoEm).localeCompare(String(a.minAjuste.exportadoEm)));

  /* `linhas` continua com TUDO — pedidos, conferência e estoque dependem disso.
     `linhasDemanda` é o que a aba Demanda enxerga: sem os exclusivamente
     sazonais, que vivem em Datas festivas. Uma lista, dois recortes; nunca dois
     cálculos, senão os números divergem entre as telas. */
  const fora = skusSoFestivos();
  /* v8.98 · SKU exato OU identidade do produto só na data (ver skusSoFestivos) */
  linhas.forEach((l) => { l.soFestivo = fora.has(l.sku) || !!fora.identidade?.has(skuNormal(l.sku)); });
  const linhasDemanda = fora.size ? linhas.filter((l) => !l.soFestivo) : linhas;
  return { linhas, linhasDemanda, foraDaDemanda: fora.size, porSku, fila, papel, emCampo, tarefas, prestadoras, prestMap, mesesCompetencia,
    leadGeral, leadProc, diasPeriodo, mesesPeriodo, valorProc, faltasAbertas, minRevisar,
    minPendentes, minAEnviar, minEnviados };
}

/* ---------- recomendação de prestadora ---------- */
function recomendar(sku, processo, qtd) {
  const c = S.calc;
  if (!c) return [];
  return c.prestadoras.filter((p) => p.ativo !== false).map((p) => {
    const ref = (p.refsExcluidas || []).includes(sku) ? null : p.refs.get(sku);
    const proc = processo ? p.procs.get(processo) : null;
    const fazProc = processo && (p.procsTodos || []).includes(processo);
    const mediaRef = ref ? Math.round(ref.total / ref.vezes) : 0;
    const prazoRef = ref ? mediana(ref.leads) : null;
    const capacidadeLivre = Math.max(0, (p.capacidade || 0) - p.pecasAbertas);

    let score = 0;
    const motivos = [];
    if (ref) {
      score += 40 + Math.min(20, ref.vezes * 4);
      motivos.push(`já produziu ${ref.vezes}× esta referência (média ${n0(mediaRef)}/lote${prazoRef != null ? `, ${Math.round(prazoRef)}d` : ""})`);
      if (qtd && mediaRef >= qtd) { score += 8; motivos.push("lote pedido cabe na média dela"); }
    } else if (proc) {
      score += 24;
      motivos.push(`faz o processo ${processo} (${proc.vezes}× no histórico)`);
    } else if (fazProc) {
      score += 14;
      motivos.push(`cadastrada no processo ${processo}, sem histórico ainda`);
    }
    if (p.capacidade > 0) {
      score += Math.round((capacidadeLivre / p.capacidade) * 22);
      motivos.push(capacidadeLivre > 0 ? `capacidade livre ~${n0(capacidadeLivre)} pçs/mês` : "carga cheia no momento");
      if (qtd && capacidadeLivre < qtd) score -= 10;
    }
    if (p.pecasP1 > 0) { score -= Math.min(15, Math.round(p.pecasP1 / 200)); motivos.push(`${n0(p.pecasP1)} pçs urgentes/P1 em aberto`); }
    if (p.atrasadas > 0) { score -= 6 * Math.min(3, p.atrasadas); motivos.push(`${p.atrasadas} pedidos em atraso`); }
    if (p.prazoMedio != null && p.prazoMedio <= (c.leadGeral || 12)) score += 5;

    return { nome: p.nome, score, motivos, mediaRef, prazoRef, capacidadeLivre, temRef: !!ref, vezesRef: ref ? ref.vezes : 0, temProc: !!proc || fazProc };
  }).filter((a) => a.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
}

function optPrestRecomendado(sku, processo, qtd, sel) {
  const rec = recomendar(sku, processo, qtd);
  const fizeram = rec.filter((r) => r.temRef);
  const doProcesso = rec.filter((r) => !r.temRef && r.temProc);
  const usados = new Set([...fizeram, ...doProcesso].map((r) => r.nome));
  const outras = nomesPrest().filter((n) => !usados.has(n));
  const op = (r, extra) => `<option value="${esc(r.nome)}" ${sel === r.nome ? "selected" : ""} title="${esc(r.motivos.join(" · "))}">${esc(r.nome)}${extra}</option>`;
  let html = `<option value="">A definir</option>`;
  if (fizeram.length) html += `<optgroup label="Já fizeram esta referência">` + fizeram.map((r) =>
    op(r, ` · ${r.vezesRef}× · ${n0(r.mediaRef)}/lote`)).join("") + `</optgroup>`;
  if (doProcesso.length) html += `<optgroup label="Fazem o processo (sem histórico nesta ref.)">` + doProcesso.map((r) => op(r, "")).join("") + `</optgroup>`;
  if (outras.length) html += `<optgroup label="Outras">` + outras.map((n) =>
    `<option value="${esc(n)}" ${sel === n ? "selected" : ""}>${esc(n)}</option>`).join("") + `</optgroup>`;
  return html;
}

/* ---------- aplicar análise ---------- */
/* ---------- prioridade em cascata ----------
   Vários pedidos do mesmo SKU não podem receber a mesma prioridade só porque o estoque
   de hoje está baixo: o primeiro pedido já recompõe parte do estoque quando ficar pronto,
   e é desse estoque projetado que o segundo deve ser julgado. A fila anda assim:
   estoque atual → julga o 1º → soma o que ele repõe → julga o 2º → soma → julga o 3º…

   O estoque é contado em unidades de venda e o pedido em peças, por isso a conversão
   pelo tamanho do pacote: 1.000 peças de um pacote de 10 repõem 100 no estoque. */
/* Ordem da fila para a projeção — e, por consequência, para o corte.

   Primeiro os que já estão com a prestadora: eles voltam antes, é fato, e não
   disputam a fila de corte porque já saíram.

   Depois os que ainda estão na casa, do NÚMERO MENOR para o maior. O número é
   sequencial, então menor = mais antigo, e o mais antigo tem de sair primeiro.
   Se o pedido velho ficar sempre atrás, a fita antiga encalha e a prestadora
   devolve material novo antes do velho — o que quebra a produção lá na frente. */
const numeroDoPedido = (n) => { const m = String(n || "").match(/^(\d+)/); return m ? +m[1] : Number.MAX_SAFE_INTEGER; };
const sufixoDoPedido = (n) => String(n || "").toUpperCase().match(/-([A-Z])$/)?.[1] || "";
function ordemDaFila(a, b) {
  const jaSaiu = (r) => (r.status === "enviada" || r.status === "chegou") ? 0 : 1;
  if (jaSaiu(a) !== jaSaiu(b)) return jaSaiu(a) - jaSaiu(b);
  /* Já fora: quem saiu primeiro volta primeiro, e é a data de envio que decide.
     O número não serve aqui — acontece de um pedido mais novo ser enviado antes,
     e nesse caso é ele que repõe o estoque na frente. */
  if (jaSaiu(a) === 0) {
    const da = pdate(a.enviadaEm) || pdate(a.separadaEm), db = pdate(b.enviadaEm) || pdate(b.separadaEm);
    if (da && db && +da !== +db) return da - db;
  }
  /* Ainda na casa: número menor primeiro — o mais antigo tem de sair antes,
     senão a fita velha encalha e volta depois da nova. */
  return numeroDoPedido(a.numero) - numeroDoPedido(b.numero)
    || sufixoDoPedido(a.numero).localeCompare(sufixoDoPedido(b.numero))
    || String(a.criadoEm || "").localeCompare(String(b.criadoEm || ""));
}

function prioridadesEmCascata(l) {
  const fora = new Map();
  const op = opAtivaDe(l.sku);
  if (!op) return fora;
  const vivos = pedidosDe(op.id).filter((r) => PED_VIVO.includes(r.status)).sort(ordemDaFila);
  const pac = Math.max(1, Number(l.qtdPacote) || 1);
  const estMin = Number(l.estMin) || 0;
  let projetado = Number(l.estoqueReal) || 0;
  for (const r of vivos) {
    const pct = estMin > 0 ? projetado / estMin : (projetado > 0 ? null : 1);
    fora.set(r.id, { prioridade: prioridadeDe({ ...l, estoqueReal: projetado, pctEstoque: pct }), projetado, pct });
    projetado += (Number(r.qtd) || 0) / pac; /* o que este pedido devolve ao estoque */
  }
  /* estoque depois que toda a fila voltar: é daí que sai a prioridade de um pedido novo */
  const pctFinal = estMin > 0 ? projetado / estMin : (projetado > 0 ? null : 1);
  fora.set("__novo", { prioridade: prioridadeDe({ ...l, estoqueReal: projetado, pctEstoque: pctFinal }), projetado, pct: pctFinal });
  return fora;
}

function previaAnalise() {
  const c = S.calc;
  if (!c) return null;
  /* a análise da Demanda não abre OP para produto de data festiva: a
     necessidade dele sai da meta da campanha, não do mínimo do dia a dia */
  const itens = c.linhasDemanda.filter((l) => l.necessidadeBruta > 0)
    .map((l) => ({ sku: l.sku, prioridade: prioridadeDe(l), necessidadeBruta: l.necessidadeBruta,
      saldoSemPedido: l.saldoSemPedido, qtdPacote: l.qtdPacote, linha: l }));
  const skus = new Set(itens.map((i) => i.sku));
  const novas = itens.filter((i) => !opAtivaDe(i.sku));
  const atualiza = itens.filter((i) => opAtivaDe(i.sku));
  const pedidosPromoviveis = [];
  for (const i of itens) {
    const op = opAtivaDe(i.sku);
    if (!op) continue;
    const cascata = prioridadesEmCascata(i.linha);
    for (const r of pedidosDe(op.id)) {
      if (!PED_VIVO.includes(r.status) || r.prioridadeTravada) continue;
      /* cada pedido é julgado pelo estoque projetado depois dos que vêm antes dele */
      const c2 = cascata.get(r.id);
      const nova = c2 ? c2.prioridade : i.prioridade;
      if (nova === r.prioridade) continue;
      pedidosPromoviveis.push({ pedidoId: r.id, numero: r.numero, de: r.prioridade, para: nova,
        sku: i.sku, qtd: r.qtd, abc: i.linha?.abc || "C", etapa: etapaFisica(r) || "—",
        projetado: c2?.projetado, pctProj: c2?.pct,
        prestadora: etapaFisica(r) === "Com a prestadora" ? r.prestadora || "a definir" : "",
        data: r.status === "enviada" || r.status === "chegou" ? r.enviadaEm
            : r.status === "separando" ? r.separadaEm
            : r.criadoEm });
    }
  }
  const encerra = S.ops.filter((o) => OP_ATIVA.includes(o.status) && !skus.has(o.sku)
    && !pedidosDe(o.id).some((r) => PED_VIVO.includes(r.status)));
  return { itens, novas, atualiza, pedidosPromoviveis, encerra,
    porCorte: CORTES.map((p) => itens.filter((i) => i.prioridade === p).length) };
}

/* v8.76 · `promoverPedidos` era a caixa "Recalcular a prioridade desses
   pedidos". Ela saiu: prioridade de pedido vivo e NÃO TRAVADO é automática e
   não pode depender de alguém lembrar de marcar uma caixa — foi por essa porta
   que a OP em Crítico ficou com um filho em P2. O parâmetro continua na
   assinatura só para não quebrar quem chama com dois argumentos; ele é
   IGNORADO. Quem quiser segurar uma prioridade à mão usa `prioridadeTravada`. */
/* ---------------------------------------------------------------------------
   A TRAVA DE REENTRÂNCIA (v8.79)
   ---------------------------------------------------------------------------
   Medido: um clique em Aplicar tranca o botão (`data-ocupado`, `disabled`,
   "Aguarde…"), MAS a trava mora no NÓ do DOM. Qualquer `render()` durante a
   análise — a sincronia de 15s, o Realtime, uma gravação — troca o botão por
   um nó novo, destrancado, com a janela da prévia ainda aberta. O segundo
   clique entrava e rodava a análise DE NOVO; a segunda rodada não achava mais
   nada para fazer e soltava o segundo aviso, zerado:

     clique 1 → "Análise aplicada · 648 necessidades novas, 19 promovidos…"
     render   → o botão volta a "Aplicar"
     clique 2 → "Análise aplicada · 0 necessidades novas, 0 promovidos…"

   A trava agora é da AÇÃO e mora no estado — não no botão. Um clique a mais
   não faz nada: nem análise, nem aviso. */
let ANALISE_RODANDO = false;
async function aplicarAnalise(dividirBlocos, _promoverIgnorado) {
  if (ANALISE_RODANDO) return { status: "ja-rodando" };
  ANALISE_RODANDO = true;
  try { return await aplicarAnaliseMiolo(dividirBlocos, _promoverIgnorado); }
  finally { ANALISE_RODANDO = false; }
}

async function aplicarAnaliseMiolo(dividirBlocos, _promoverIgnorado) {
  const p = previaAnalise();
  if (!p) return;
  const agora = new Date().toISOString();
  const baseId = (S.analises.reduce((m, a) => Math.max(m, a.id), 0) || 0);
  const blocos = {};
  const criarAnalise = (rotulo) => {
    const a = { id: baseId + Object.keys(blocos).length + 1, rotulo, executadaEm: agora,
      novas: 0, atualizadas: 0, encerradas: 0, promovidos: 0 };
    S.analises.push(a); return a;
  };
  if (dividirBlocos) { for (const p2 of CORTES) blocos[p2] = criarAnalise("Corte " + CORTE[p2]); }
  else { const a = criarAnalise("Análise"); for (const p2 of CORTES) blocos[p2] = a; }
  const analiseRef = blocos[1];
  const sincronizados = [];   /* v8.76 · os pedidos que acompanharam a cascata */

  /* passo 1 — cria ou atualiza a necessidade (OP) */
  for (const i of p.itens) {
    let op = opAtivaDe(i.sku);
    if (!op) {
      const bloco = blocos[i.prioridade];
      op = { id: uid(), sku: i.sku, status: "pendente", prioridade: i.prioridade,
        analiseOrigemId: bloco.id, criadoEm: agora, analiseAtualId: bloco.id, atualizadoEm: agora,
        qtdPacote: i.qtdPacote, qtdNecessaria: i.necessidadeBruta,
        processo: i.linha.processo, prioridadeTravada: false };
      S.ops.push(op);
      bloco.novas++;
      registrar(op.id, "necessidade criada", null, { prioridade: op.prioridade, qtd: i.necessidadeBruta }, bloco.id);
    } else {
      const antes = { prioridade: op.prioridade, qtdNecessaria: op.qtdNecessaria };
      if (!op.prioridadeTravada) op.prioridade = i.prioridade;
      op.qtdNecessaria = i.necessidadeBruta;
      op.qtdPacote = i.qtdPacote;
      op.analiseAtualId = analiseRef.id;
      op.atualizadoEm = agora;
      analiseRef.atualizadas++;
      if (antes.prioridade !== op.prioridade || antes.qtdNecessaria !== op.qtdNecessaria)
        registrar(op.id, "necessidade atualizada", antes, { prioridade: op.prioridade, qtdNecessaria: op.qtdNecessaria }, analiseRef.id);
    }
    recalcularOP(op);
    /* passo 2 (v8.76) — os pedidos vivos e não travados desta OP acompanham,
       cada um no seu degrau da CASCATA. Aqui, e não em `recalcularOP`: é neste
       ponto que a prioridade da OP acabou de ser decidida. */
    const sinc = sincronizarPrioridadeDosPedidos(op, i.linha, analiseRef.id);
    analiseRef.promovidos += sinc.mexidos.length;
    sincronizados.push(...sinc.mexidos);
  }

  /* passo 3 — necessidades que sumiram, sem pedido vivo */
  for (const op of p.encerra) {
    op.qtdNecessaria = 0;
    op.analiseAtualId = analiseRef.id;
    op.atualizadoEm = agora;
    recalcularOP(op);
    if (op.status === "suprida") op.motivoEncerramento = `Estoque recomposto`;
    analiseRef.encerradas++;
    registrar(op.id, "sem necessidade", null, { status: op.status }, analiseRef.id);
  }

  await salvarTudo();
  S.modal = null; render();
  toast(`Análise aplicada · ${p.novas.length} necessidades novas, ${sincronizados.length} ${sincronizados.length === 1 ? "pedido recalculado" : "pedidos recalculados"}, ${p.encerra.length} encerradas.`);
}

/* ---------- migrações ---------- */
function migrarPlanilha(pedidosAntigos) {
  const ops = [], pedidos = [];
  const analise = { id: 0, rotulo: "Migração da planilha", executadaEm: new Date().toISOString(), novas: 0, atualizadas: 0, encerradas: 0 };
  const porSku = new Map();
  for (const p of pedidosAntigos) {
    if (!p.sku) continue;
    if (!porSku.has(p.sku)) porSku.set(p.sku, []);
    porSku.get(p.sku).push(p);
  }
  for (const [sku, itens] of porSku) {
    const ordenados = itens.slice().sort((a, b) => String(a.dtSeparacao || "").localeCompare(String(b.dtSeparacao || "")));
    const temAberto = ordenados.some((p) => p.status !== "6. Produzido");
    const opId = uid();
    ops.push({ id: opId, sku, status: temAberto ? "em_producao" : "concluida", prioridade: 4,
      analiseOrigemId: 0, criadoEm: ordenados[0].dtSeparacao || iso(hoje()),
      analiseAtualId: 0, atualizadoEm: ordenados[0].dtSeparacao || iso(hoje()),
      qtdPacote: Number(produtoDe(sku)?.qtdPacote) || 1, qtdNecessaria: 0,
      processo: ordenados[0].processo, prioridadeTravada: false, migrada: true });
    for (const p of ordenados) {
      const stMig = p.status === "6. Produzido" ? "retornada"
        : p.status === "1. Separar" ? "aberto"
        : p.status === "2. Enviar" ? "separando"
        : p.status === "4. Conferir" ? "chegou"
        : "enviada"; /* 3. Em Produção e Atraso Produção */
      pedidos.push({ id: uid(), numero: String(p.pedido || ""), opId, sku,
        qtd: Number(p.qtd) || 0, prioridade: 4, prioridadeTravada: false,
        status: stMig,
        criadoEm: p.dtSeparacao || iso(hoje()), atualizadoEm: p.dtSeparacao || iso(hoje()),
        prestadora: p.prestadora || null, processo: p.processo || null, responsavel: p.responsavel || null,
        qtdConferida: p.qtdRealizada != null ? Number(p.qtdRealizada) : null, qtdSegunda: 0,
        separadaEm: p.dtSeparacao || null, enviadaEm: p.dtSaida || null, retornadaEm: stMig === "retornada" ? p.dtEntrada || null : null,
        aguardandoMaterial: false, obs: p.obs || null,
        codigoAntigo: p.codigo || null, mesPagamento: p.mesPagamento || null });
    }
  }
  return { ops, pedidos, analise };
}

/* modelo v3 (ops + remessas) desta ferramenta -> v4 (pedidos) */
function migrarV3(opsAntigas, remessas) {
  const ops = opsAntigas.map((o) => ({
    id: o.id, sku: o.sku, status: o.status === "cancelada" ? "cancelada" : o.status,
    prioridade: o.prioridade || 3,
    analiseOrigemId: o.analiseOrigemId ?? 0, criadoEm: o.criadoEm, analiseAtualId: o.analiseAtualId,
    atualizadoEm: o.atualizadoEm, qtdPacote: o.qtdPacote || 1, qtdNecessaria: Number(o.qtdNecessaria) || 0,
    processo: o.processo || null, prioridadeTravada: !!o.prioridadeTravada, migrada: !!o.migrada,
    encerradaEm: o.encerradaEm || null, motivoEncerramento: o.motivoEncerramento || null }));
  const mapa = new Map(opsAntigas.map((o) => [o.id, o]));
  let num = 0;
  for (const o of opsAntigas) { const m = String(o.numero || "").match(/^(\d+)/); if (m) num = Math.max(num, +m[1]); }
  for (const r of remessas) { const m = String(r.pedidoAntigo || "").match(/^(\d+)/); if (m) num = Math.max(num, +m[1]); }
  const pedidos = remessas.filter((r) => r.status !== "cancelada").map((r) => {
    const o = mapa.get(r.opId) || {};
    return { id: r.id, numero: r.pedidoAntigo || o.numero || String(++num).padStart(4, "0"),
      opId: r.opId, sku: o.sku || null,
      qtd: Number(r.qtdEnviada) || 0, prioridade: o.prioridade || 3, prioridadeTravada: false,
      status: r.status === "retornada" ? "retornada" : r.status === "separando" ? "separando" : "enviada",
      criadoEm: r.separadaEm || o.criadoEm || iso(hoje()), atualizadoEm: r.separadaEm || iso(hoje()),
      prestadora: r.prestadora || null, processo: r.processo || null, responsavel: r.responsavel || null,
      qtdConferida: r.qtdConferida != null ? Number(r.qtdConferida) : null, qtdSegunda: r.qtdSegunda || 0,
      separadaEm: r.separadaEm || null, enviadaEm: r.enviadaEm || null, retornadaEm: r.retornadaEm || null,
      aguardandoMaterial: false, obs: null, codigoAntigo: r.codigoAntigo || null, mesPagamento: r.mesPagamento || null };
  });
  /* saldo pendente das OPs antigas vira um pedido aberto, preservando a antiguidade */
  for (const o of opsAntigas) {
    if (o.status === "pendente" && (Number(o.qtdPendente) || 0) > 0) {
      pedidos.push({ id: uid(), numero: o.numero || String(++num).padStart(4, "0"), opId: o.id, sku: o.sku,
        qtd: Number(o.qtdPendente) || 0, prioridade: o.prioridade || 3, prioridadeTravada: !!o.prioridadeTravada,
        status: "aberto", criadoEm: o.criadoEm, atualizadoEm: o.atualizadoEm || o.criadoEm,
        prestadora: null, processo: o.processo || null, responsavel: o.responsavel || null,
        qtdConferida: null, qtdSegunda: 0, separadaEm: null, enviadaEm: null, retornadaEm: null,
        aguardandoMaterial: false, obs: o.obs || null, codigoAntigo: null, mesPagamento: null });
    }
  }
  return { ops, pedidos };
}


/* ---------- Magazord atualiza, mas não é dona: sincronização de produtos ---------- */
function tokensSku(sku) { return String(sku || "").toUpperCase().split(/[.\-_/]+/).filter(Boolean); }
/* candidato a troca: mesmo esqueleto de SKU com exatamente 1 pedaço diferente */
function candidatoTrocaSku(skuNovo) {
  const tn = tokensSku(skuNovo);
  if (tn.length < 2) return null;
  for (const p of S.produtos) {
    if (p.provisorio) continue; /* código inventado não é esqueleto de SKU */
    const ta = tokensSku(p.sku);
    if (ta.length !== tn.length) continue;
    const difs = [];
    for (let i = 0; i < ta.length; i++) if (ta[i] !== tn[i]) difs.push({ pos: i + 1, de: ta[i], para: tn[i] });
    if (difs.length === 1) return { produto: p, dif: difs[0] };
  }
  return null;
}
function fornecedorPorNome(nome) {
  const n = String(nome || "").trim();
  if (!n) return null;
  S.cad.fornecedores = S.cad.fornecedores || [];
  let f = S.cad.fornecedores.find((x) => x.nome.trim().toLowerCase() === n.toLowerCase());
  if (!f) { f = { id: uid(), nome: n, prazoDias: null }; S.cad.fornecedores.push(f); }
  return f;
}
function sincronizarProdutosComCsv(itens) {
  migrarProdutosV2();
  S.cad.pendentesSku = S.cad.pendentesSku || [];
  let atualizados = 0, fornVinculados = 0; const novos = []; const suspeitas = [];
  const porSku = new Map();
  for (const p of S.produtos) { porSku.set(p.sku, p); for (const h of p.skusAnteriores || []) if (!porSku.has(h.sku)) porSku.set(h.sku, p); }
  for (const it of itens) {
    const p = porSku.get(it.sku);
    const descr = [it.produto, it.derivacao].filter(Boolean).join(" - ").trim();
    if (p) {
      p.magazord = { ...(p.magazord || {}), descricao: descr || p.magazord?.descricao || null, categoria: it.categoria || p.magazord?.categoria || null, atualizadoEm: iso(hoje()) };
      if (descr) p.descricao = descr;               /* dados da Magazord: atualizam */
      if (it.categoria) p.categoria = it.categoria; /* p.producao/processo/etapas: NUNCA tocados aqui */
      if (it.fornecedor) {                          /* exceção combinada: o NOME do fornecedor é dado da Magazord */
        const f = fornecedorPorNome(it.fornecedor); /* (o PRAZO continua interno e nunca é sobrescrito) */
        p.magazord.fornecedor = f.nome;
        p.producao = p.producao || {};
        if (p.producao.fornecedorId !== f.id) { p.producao.fornecedorId = f.id; fornVinculados++; }
      }
      atualizados++;
      continue;
    }
    if (S.cad.pendentesSku.some((x) => x.skuNovo === it.sku)) continue; /* já aguardando decisão */
    const cand = candidatoTrocaSku(it.sku);
    if (cand) suspeitas.push({ skuNovo: it.sku, descricaoNova: descr, produtoId: cand.produto.id,
      skuAntigo: cand.produto.sku, dif: cand.dif, em: iso(hoje()) });
    else novos.push({ it, descr });
  }
  S.cad.pendentesSku.push(...suspeitas);
  for (const { it, descr } of novos) {
    const f = it.fornecedor ? fornecedorPorNome(it.fornecedor) : null;
    S.produtos.push({ id: proximoIdProduto(), sku: it.sku, skuAtual: it.sku, skusAnteriores: [],
      descricao: descr || null, categoria: it.categoria || null, qtdPacote: 1, processo: null,
      producao: f ? { fornecedorId: f.id } : {}, magazord: { descricao: descr || null, categoria: it.categoria || null, fornecedor: f?.nome || null, atualizadoEm: iso(hoje()) },
      criadoEm: iso(hoje()), origem: "magazord" });
    if (f) fornVinculados++;
  }
  return { atualizados, novosN: novos.length, suspeitasN: suspeitas.length, fornVinculados,
    fornSemPrazo: (S.cad.fornecedores || []).filter((x) => !x.prazoDias).length };
}
/* confirmação humana: é o mesmo produto — atualizar SKU */
function trocarSkuDoProduto(produtoId, skuNovo, descricaoNova) {
  const p = produtoPorIdProd(produtoId);
  if (!p) return null;
  p.skusAnteriores = p.skusAnteriores || [];
  p.skusAnteriores.push({ sku: p.sku, ate: iso(hoje()) });
  p.sku = skuNovo; p.skuAtual = skuNovo;
  if (descricaoNova) { p.descricao = descricaoNova; p.magazord = { ...(p.magazord || {}), descricao: descricaoNova, atualizadoEm: iso(hoje()) }; }
  p.revisarProducao = true; /* troca relevante: conferir embalagem etc. — nada é apagado */
  registrar(null, `SKU do produto ${p.id} atualizado: ${p.skusAnteriores[p.skusAnteriores.length - 1].sku} → ${skuNovo}`, null, null);
  return p;
}
