/* ---------- ações: criar pedidos de produção ---------- */
/* qtdDe: função opcional que diz quanto produzir de cada linha. Sem ela vale o
   saldo da Demanda (mínimo em uso); o relatório passa a sua própria conta, que
   pode estar apoiada no mínimo sugerido. */
/* ---------- linha mínima para SKU que ainda não está no estoque importado ----------
   Produto lançado agora costuma não estar na última foto da Magazord. Ele era
   descartado aqui em silêncio — `porSku.get` devolvia undefined, o `filter`
   comia, e a pessoa recebia "nenhum saldo sem pedido nesses produtos" depois de
   clicar em criar. Agora ele entra com o que o cadastro sabe e zeros no resto,
   que é a verdade: o app não conhece o estoque dele ainda. */
function linhaMinimaDoSku(sku) {
  const p = produtoDe(sku);
  return { sku, descricao: p?.descricao || sku, processo: p?.processo || null,
    qtdPacote: Math.max(1, Number(p?.qtdPacote) || 1), abc: "C",
    vendas: 0, semVenda: true, estoqueReal: 0, estMin: 0, estMinCalc: 0,
    pctEstoque: null, saldoSemPedido: 0, pedidosAbertos: [], foraDoEstoque: true };
}
function abrirCriarPedidos(skus, qtdDe, campanhaId) {
  const grupos = skus.map((sku) => S.calc.porSku.get(sku) || linhaMinimaDoSku(sku)).filter(Boolean)
    .map((l) => ({ l, q: qtdDe ? Number(qtdDe(l)) || 0 : l.saldoSemPedido }))
    .filter(({ q }) => q > 0).map(({ l, q }) => ({
    sku: l.sku, descricao: l.descricao || l.sku, processo: l.processo, qtdPacote: l.qtdPacote,
    saldo: q, abertos: l.pedidosAbertos,
    adesivo: ehAdesivo(l.processo), setor: setorDe(l.processo),
    recomendadas: recomendar(l.sku, l.processo, q),
    /* o pedido novo entra no fim da fila: sua prioridade sai do estoque já
       projetado depois de tudo que está em produção, não do estoque de hoje */
    linhas: [{ qtd: q, prioridade: (prioridadesEmCascata(l).get("__novo") || {}).prioridade ?? prioridadeDe(l), prestadora: "", mix: 0 }],
  }));
  if (!grupos.length) return toast("Nenhum saldo sem pedido nesses produtos.", "erro");
  S.modal = { tipo: "criarPedidos", grupos, reprios: {}, campanhaId: campanhaId || null };
  render();
  /* o contador oficial pode ter andado desde o boot — releia agora, com a
     janela na frente da pessoa (v8.75) */
  if (typeof pedCicloRefrescar === "function") pedCicloRefrescar(["criarPedidos"]);
  /* os projetos de corte, para cada bloco de SKU nascer preenchido (v8.110) */
  if (typeof pcAquecer === "function") pcAquecer();
}

async function confirmarPedidos() {
  const m = S.modal;
  const agora = new Date().toISOString();
  let num = proximoNumeroPedido();
  const novos = [];
  const vinculosCorte = [];   /* v8.110 · um por pedido criado, com o SKU dele */
  for (const [gi, g] of m.grupos.entries()) {
    /* o que esta tela decidiu para o SKU — lido pelas MESMAS funções do avulso */
    const etapas = pedLerEtapasDoForm(gi);
    const embalagem = pedLerEmbalagemDoForm(gi);
    /* v8.87 · `g._etapasUsadas` saiu: era escrito aqui e lido em lugar nenhum
       (varredura no binário inteiro). */
    const prodG = produtoDe(g.sku);
    /* a EMBALAGEM é gravada no produto mesmo que nenhuma linha vire pedido: a
       pessoa abriu a janela e escolheu — isso é cadastro do SKU. As ETAPAS não
       sobem mais (v8.87): elas são a decisão deste pedido, não do SKU. */
    pedAplicarPadraoDoProduto(prodG, { etapas, embalagem });
    let op = opAtivaDe(g.sku);
    if (!op && g.linhas.some((l) => (+l.qtd || 0) > 0)) {
      /* necessidade sem OP viva (encerrada ou base migrada): cria a OP na hora, como no pedido avulso */
      op = { id: uid(), sku: g.sku, status: "em_producao", prioridade: 4, criadoEm: agora, origem: "demanda" };
      S.ops.push(op);
      registrar(op.id, `OP criada ao gerar pedidos (não havia OP viva para ${g.sku})`, null, null);
    }
    if (!op) continue;
    for (const l of g.linhas) {
      const q = +l.qtd || 0;
      if (q <= 0) continue;
      const mix = g.adesivo ? Math.max(0, Math.min(q, +l.mix || 0)) : 0;
      /* -------------------------------------------------------------------
         v8.86 · O ZERO É UMA PRIORIDADE, NÃO A FALTA DE UMA
         -------------------------------------------------------------------
         Era `+l.prioridade || 4`. Em JavaScript o 0 é falso, então a linha
         engolia justamente a prioridade MAIS urgente da escala — "Crítico ·
         Zerado" (`CORTE[0]`), que `prioridadeDe` devolve quando o estoque real
         chegou a zero — e gravava P3, a MENOS urgente. O produto que acabou na
         prateleira ia para o fim da fila, e o alerta "críticos na fila" da
         aba Pedidos (que conta `prioridade === 0`) nunca acendia para pedido
         criado pela Demanda. O caminho do avulso nunca teve esse `||` e gravava 0: as
         duas portas discordavam com o mesmo cálculo na mão.
         O fallback 4 continua — só que agora ele acontece quando NÃO HÁ
         prioridade (nulo, vazio, ou algo que não é número), não quando ela é 0.
         ------------------------------------------------------------------- */
      const prioNum = Number(l.prioridade);
      const prioridadeDaLinha = (l.prioridade === null || l.prioridade === undefined
        || l.prioridade === "" || !Number.isFinite(prioNum)) ? 4 : prioNum;
      const r = pedEsqueleto({ numero: String((num = numeroLivreDesde(num), num++)).padStart(4, "0"), opId: op.id, sku: g.sku,
        qtd: q, prioridade: prioridadeDaLinha, criadoEm: agora });
      /* daqui para baixo é a MESMA montagem do avulso */
      pedAplicarComuns(r, {
        processo: g.processo || op.processo || null,
        prestadora: l.prestadora || null,
        qtdEmbalar: g.adesivo ? q - mix : null,
        qtdMix: g.adesivo ? mix : null,
        etapas,
        /* nasceu na tela da campanha: é assim que Datas festivas sabe o que já
           mandou produzir sem inventar uma operação paralela de pedidos */
        campanhaId: m.campanhaId || null,
      });
      const erro = pedDestinoConfere(r);
      if (erro) { S._solta?.(); return toast(erro, "erro"); }
      novos.push(r);
      /* v8.110 · a decisão do Projeto de Corte é a DESTE grupo, lida DENTRO do
         laço. Nunca uma variável de fora: é assim que o projeto (ou o "seguir
         sem") de um SKU não escorrega para o próximo da lista. */
      vinculosCorte.push({ pedidoId: r.id, sku: g.sku, decisao: g.corte || null });
    }
  }
  /* reprioridades dos pedidos já abertos, ajustadas no aviso amarelo */
  let repriorizados = 0;
  for (const [id, pr] of Object.entries(m.reprios)) {
    const r = pedidoPorId(id);
    if (r && r.prioridade !== +pr) {
      registrar(r.opId, `pedido ${r.numero} repriorizado`, { prioridade: r.prioridade }, { prioridade: +pr });
      r.prioridade = +pr; r.atualizadoEm = agora; repriorizados++;
    }
  }
  if (!novos.length && !repriorizados) return toast("Nada a criar — informe as quantidades.", "erro");
  S.pedidos.push(...novos);
  new Set(novos.map((r) => r.opId)).forEach((id) => recalcularOP(opPorId(id)));
  novos.forEach((r) => registrar(r.opId, `pedido ${r.numero} criado`, null, { qtd: r.qtd, prioridade: r.prioridade }));
  S.sel.clear();
  /* o pedido só entra na fila quando o papel de produção sai da impressora */
  S.modal = { tipo: "papeis", qtd: novos.length, nPapel: novos.length, ids: novos.map((r) => r.id), origem: "demanda" };
  render(); await salvarTudo("nucleo", "produtos");
  /* v8.110 · os vínculos, um a um, com o SKU e a decisão que são DAQUELE grupo */
  if (typeof pcVincularDecidido === "function") {
    for (const vc of vinculosCorte) {
      try { await pcVincularDecidido(vc.pedidoId, vc.sku, vc.decisao); } catch (e) {}
    }
  }
  toast(`${novos.length} ${novos.length === 1 ? "pedido criado" : "pedidos criados"}${repriorizados ? ` · ${repriorizados} repriorizados` : ""} — imprima o papel para colocar na fila.`);
}

function separarPedido(id) {
  const r = pedidoPorId(id);
  if (!r) return;
  r.status = "separando";
  r.separadaEm = r.separadaEm || iso(hoje());
  if (padraoResp("enviar")) r.responsavel = padraoResp("enviar");
  recalcularOP(opPorId(r.opId));
  salvarPedidos();
  toastPasso(`Pedido ${r.numero} separado`, P_LABEL.separando, "próxima: definir a prestadora e enviar");
}
/* pedidos do mesmo SKU, mais antigos, que ainda não saíram — a fita velha que ficaria
   para trás se este for enviado antes. Só avisa; a decisão continua sendo de quem opera. */
function furaFilaAoEnviar(r) {
  const sku = opPorId(r.opId)?.sku || r.sku;
  if (!sku) return [];
  const meu = numeroDoPedido(r.numero);
  return S.pedidos.filter((x) => x.id !== r.id
    && ["papel", "aberto", "separando"].includes(x.status)
    && ((opPorId(x.opId)?.sku || x.sku) === sku)
    && numeroDoPedido(x.numero) < meu)
    .sort(ordemDaFila);
}

function enviarPedido(id, confirmado) {
  const r = pedidoPorId(id);
  if (!r) return;
  if (!r.prestadora) { S.modal = { tipo: "pedido", pedido: r, foto: fotoPedido(r) }; render(); return toast("Defina a prestadora antes de enviar.", "erro"); }
  const atras = confirmado ? [] : furaFilaAoEnviar(r);
  if (atras.length) { S.modal = { tipo: "furaFila", pedido: r, atras }; render(); return; }
  r.status = "enviada";
  r.enviadaEm = r.enviadaEm || iso(hoje());
  if (padraoResp("receber", "conferir")) r.responsavel = padraoResp("receber", "conferir");
  salvarPedidos();
  const prazo = S.calc?.leadProc?.get(r.processo) ?? S.calc?.leadGeral ?? null;
  toastPasso(`Pedido ${r.numero} enviado para ${r.prestadora}`, P_LABEL.enviada,
    prazo ? `prazo típico ${n0(prazo)} dias` : "próxima: cobrar quando passar do prazo");
}
async function salvarConferencia() {
  const r = S.modal.pedido;
  const fotoAoAbrir = S.modal.foto;
  /* alguém alterou este mesmo pedido enquanto a tela estava aberta? */
  const briga = await outroMexeu(r, fotoAoAbrir);
  if (briga) { S.modal = { tipo: "conflito", pedido: r, briga, volta: { tipo: "conferir", pedido: r, foto: fotoPedido(briga.servidor) } }; return render(); }
  /* sem prestadora o pedido não casa com nenhum fechamento: some do pagamento
     e ainda assim aparece na folha de conferência, num grupo "Sem prestadora".
     Duas folhas discordando é como o trabalho de alguém deixa de ser pago. */
  if (!String(r.prestadora || "").trim())
    return toast("Defina a prestadora antes de registrar o retorno — sem ela o pedido fica fora do fechamento e ninguém recebe por ele.", "erro");
  const vals = {};
  $$("[data-c]").forEach((el) => { vals[el.dataset.c] = el.type === "number" ? (el.value === "" ? null : Number(el.value)) : el.value; });
  /* trava do fechamento: nem lança num mês já fechado, nem mexe num pedido que já foi pago */
  const compAntes = competenciaDe(r);
  if (r.status === "retornada" && mesFechado(compAntes))
    return toast(`Pedido ${r.numero} já entrou no fechamento de ${compAntes}, que está fechado. Reabra o mês em Prestadoras para alterar.`, "erro");
  const compNova = normalizarComp(vals.mesPagamento, vals.retornadaEm || r.retornadaEm)
    || compFmt(pdate(vals.retornadaEm || r.retornadaEm) || hoje());
  if (mesFechado(compNova))
    return toast(`${compNova} está fechado — escolha outro mês de pagamento ou reabra o mês em Prestadoras.`, "erro");
  r.mesPagamento = compNova;
  delete r.mesPagamentoAuto; /* escolhido por gente: reabrir o mês não desfaz */
  /* etapas da estrutura: Qtd Px como no ControleProcessos — Produzido = última preenchida, Total = Σ Qtd×VU */
  /* ---------- só manda no que está na tela ----------
     A janela mostra apenas as etapas que ESTA prestadora cobre (`cobreEtapa`), mas
     a tabela de conferência deixa lançar todas as da estrutura. Salvar fazia
     `r.etapas = etapas` — substituição total —, então uma etapa lançada pela
     tabela e ausente da janela era apagada, com o `custoReal` caindo junto: abrir
     o pedido e salvar sem tocar em nada reduzia o pagamento. Agora o que está na
     tela manda no que está na tela, e o resto fica onde estava. */
  const camposEtapa = $$("[data-cq]");
  if (camposEtapa.length) {
    const naTela = new Set(camposEtapa.map((el) => String(el.dataset.cqNome).toUpperCase()));
    const daTela = camposEtapa.map((el) => ({ nome: el.dataset.cqNome, vu: Number(el.dataset.cqVu) || 0,
      qtd: el.value === "" ? null : Number(el.value) })).filter((e) => e.qtd != null);
    const foraDaTela = (r.etapas || []).filter((e) => !naTela.has(String(e.nome).toUpperCase()));
    /* na ordem da estrutura: a última preenchida é o "Produzido" */
    const estrOrd = estruturaDe(r.processo || produtoDe(opPorId(r.opId)?.sku || r.sku)?.processo);
    const ordem = (estrOrd?.etapas || []).map((e) => String(e.nome).toUpperCase());
    const juntas = [...foraDaTela, ...daTela]
      .sort((x, y) => ordem.indexOf(String(x.nome).toUpperCase()) - ordem.indexOf(String(y.nome).toUpperCase()));
    r.etapas = juntas;
    const preench = juntas.filter((e) => e.qtd != null);
    /* a última etapa preenchida É o que voltou pronto — sem campo à parte, sem
       divergência possível. Zerar as etapas zera também o que voltou. */
    vals.qtdConferida = preench.length ? preench[preench.length - 1].qtd : null;
    r.custoReal = juntas.reduce((s2, e) => s2 + (e.qtd || 0) * (Number(e.vu) || 0), 0) || null;
    r.qtdConferida = vals.qtdConferida;
  } else {
    r.qtdConferida = vals.qtdConferida ?? r.qtdConferida ?? r.qtd;
  }
  r.qtdDefeito = Math.max(0, Math.min(Number(vals.qtdDefeito) || 0, Number(r.qtdConferida) || 0));
  delete r.qtdSegunda;   /* nome antigo: "segunda qualidade" */
  r.retornadaEm = vals.retornadaEm || iso(hoje());
  r.status = "retornada";
  const o = opPorId(r.opId);
  recalcularOP(o);
  registrar(r.opId, `pedido ${r.numero} conferido`, null, { conferida: r.qtdConferida });
  /* a produção que estava com ela volta junto: quem encerra a posse é a
     conferência, não a memória de alguém */
  possesDoPedido(r.id).forEach((p) => encerrarPosse(p.id, `pedido ${r.numero} conferido`));
  /* o material sai do estoque agora, pela quantidade que voltou pronta — não
     pela que saiu no papel. Até aqui ele estava apenas RESERVADO. */
  /* A marca "já baixei" mora no pedido (documento núcleo) e os movimentos moram
     no documento de insumos. Gravar a marca primeiro e o movimento 900 ms depois
     significava que uma aba fechada no meio deixava o app achando que baixou sem
     ter baixado — e como a baixa é idempotente de propósito, ela nunca mais
     aconteceria. Agora o movimento grava primeiro; só se ele passar é que o
     pedido recebe a marca. */
  /* a posse dela baixa junto: é a mesma peça conferida, contada do outro lado */
  const bxPosse = baixarPosseDaConferencia(r);
  const baixa = baixarConsumo(r);
  if (bxPosse) toast(`${[...new Set(bxPosse.nomes)].join(", ")} baixado do que estava com ${r.prestadora}.`);
  if (baixa) {
    const marca = { baixado: r.consumoBaixado, movs: r.consumoMovs };
    delete r.consumoBaixado; delete r.consumoMovs;
    try {
      await salvarTudo("insumos");
      r.consumoBaixado = marca.baixado; r.consumoMovs = marca.movs;
      toast(`${baixa.n} ${baixa.n === 1 ? "insumo baixado" : "insumos baixados"} do estoque pela receita de ${n0(r.qtdConferida ?? r.qtd)} ${(r.qtdConferida ?? r.qtd) === 1 ? "peça" : "peças"}.`);
    } catch {
      /* o movimento não gravou: desfaz na memória e deixa o pedido sem a marca,
         para a próxima conferência tentar de novo em vez de nunca mais */
      desfazerConsumo({ consumoBaixado: true, consumoMovs: marca.movs });
      toast("O retorno foi registrado, mas a baixa dos insumos não gravou. Confira o estoque e registre de novo.", "erro");
    }
  }
  /* mesmo pedido, próximo processo: a continuação -A vai para a segunda prestadora */
  const prestFazTudo = !!(S.cad.prestadoras || []).find((pp) => pp.nome === r.prestadora)?.fazTudo;
  let espera = null;                 /* P1-A · a intenção da continuação, enviada depois do save */
  const querEspelho = $("#cf-espelho")?.checked && !ehEspelho(r) && !prestFazTudo && !S.pedidos.some((x) => x.numero === r.numero + "-A");
  if (querEspelho) {
    /* ---------- a continuação é do MESMO processo, nas etapas que faltam ----------
       O -A nascia com `processo: "COLA"` fixo. Só que "COLA" quase nunca é um
       processo cadastrado: é uma ETAPA dentro de MÁQUINA, GARGANTILHA, ADESIVO…
       Com um processo que não existe, o pedido ficava sem setor (ninguém recebia
       a tarefa) e a janela não conseguia listar as etapas certas — era por isso
       que a COLA não aparecia para marcar. Agora a continuação herda o processo
       do produto e já vem com as etapas que a primeira prestadora não fez. */
    const prodEsp = produtoDe(opPorId(r.opId)?.sku || r.sku);
    const procEsp = r.processo || prodEsp?.processo || null;
    const todasEt = (tplDoProcesso(procEsp).etapas || []).map((e2) => String(e2).toUpperCase());
    const feitasEt = new Set(etapasDoPedido(r).map((e2) => String(e2).toUpperCase()));
    const restantes = todasEt.filter((e2) => !feitasEt.has(e2));
    /* se a primeira remessa não restringiu etapas, a continuação é tudo depois da primeira */
    const etapasEsp = restantes.length ? restantes : (todasEt.length > 1 ? todasEt.slice(1) : null);
    /* P1-A · A CONTINUAÇÃO NÃO ENTRA NA LISTA ANTES DE EXISTIR.
       Antes, ela era empurrada em `S.pedidos` com um número inventado
       (`proximaContinuacao`) e `salvarPedidos()` a tratava como pedido novo
       comum — e o caminho do pedido novo joga o `numero` fora de propósito
       ("quem numera é o servidor"). Resultado medido: `2358-A` virava `2700`,
       um número da sequência era queimado, e o `-A` sobrava só como evidência.

       Agora ela vai pelo caminho da continuação, que numera com
       `pcp_proxima_continuacao` e preserva o `-A`. Só que esse caminho precisa
       do original JÁ GRAVADO (ele confere a revisão), então o que é montado
       aqui é apenas a INTENÇÃO — o envio acontece depois do save, no fim
       desta função. */
    espera = { id: uid(), etapas: etapasEsp && etapasEsp.length ? etapasEsp : null,
      processo: procEsp,
      qtd: Number(r.qtdConferida) || Number(r.qtd) || 0,
      responsavel: r.responsavel || null,
      prioridadeTravada: r.prioridadeTravada,
      obs: r.obs || null,
      obsInterna: `continuação de ${r.numero}${etapasEsp && etapasEsp.length ? ` (${etapasEsp.join(" + ").toLowerCase()})` : ""}` };
  } else {
    S.modal = null;
  }
  recalcularOP(o);
  await salvarPedidos();
  /* P1-A · agora sim: o original está gravado, a foto dele está na revisão
     certa, e a continuação pode ser pedida pelo caminho dela. O status do
     original é gravado ACIMA, pela tela — por isso `status_origem` NÃO vai:
     mandar os dois faria a revisão subir duas vezes pela mesma conferência. */
  let espCriada = null;
  if (espera) {
    const rc = await telaContinuarPedido(r.id, {
      id: espera.id, processo: espera.processo, qtd: espera.qtd,
      responsavel: espera.responsavel, prioridade_travada: !!espera.prioridadeTravada,
      etapas_usadas: espera.etapas, obs: espera.obs,
      extra: { obsInterna: espera.obsInterna },
    });
    if (rc.status === "ok" && rc.continuacao) {
      espCriada = paraApp(rc.continuacao);
      registrar(r.opId, `pedido ${espCriada.numero} criado — continuação de ${r.numero} para o próximo processo`, null, { qtd: espCriada.qtd });
      S.modal = { tipo: "papeis", qtd: 1, nPapel: 1, ids: [espCriada.id], origem: "demanda" };
      await salvarPedidos();
    } else {
      /* não inventa número nem cria pedido solto: diz o que aconteceu e deixa
         o original conferido, que é o que de fato foi gravado. */
      S.modal = null;
      toast(rc.status === "numero-em-uso"
        ? `O número ${r.numero}-A já existe. A conferência foi gravada; a continuação não foi criada.`
        : `A conferência foi gravada, mas a continuação não: ${rc.texto || rc.status}.`, "erro");
      render();
    }
  }
  toastPasso(espCriada ? `Pedido ${r.numero} conferido · ${espCriada.numero} criado` : `Pedido ${r.numero} conferido`,
    espCriada ? P_LABEL.papel + " (a continuação)" : P_LABEL.retornada,
    espCriada ? "próxima: imprimir o papel da cola/embalagem"
      : (o && o.saldoSemPedido > 0 ? `${n0(o.saldoSemPedido)} peças voltam como saldo na Demanda`
        : "conta como produzido e abate a Demanda"));
}

