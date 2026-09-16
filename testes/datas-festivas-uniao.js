/* ===========================================================================
   BATERIA · datas-festivas-uniao (v8.98)
   ---------------------------------------------------------------------------
   Como rodar: abrir o PCP em cópia de teste (localhost ou ?teste=1), abrir o
   console e colar este arquivo inteiro, ou:
     (0, eval)(await (await fetch("testes/datas-festivas-uniao.js")).text());
     bateriaUniaoFestivas();

   A bateria é SÍNCRONA de propósito: troca o estado por um cenário sintético,
   mede e devolve o estado original no `finally`, sem nenhum `await` no meio —
   então nenhum render, Realtime ou gravação consegue rodar sobre o cenário.

   Cenário (SKUs T.*, que não existem na base real):
     T.A   cadastro, skusAnteriores [T.A0], pacote 10, estoque 5
     T.B   cadastro, pacote 10, estoque 7
     T.E   só no estoque (sem cadastro)
     T.F   sem cadastro e sem estoque
   Campanha "Teste" com os quatro.
   =========================================================================== */
function bateriaUniaoFestivas() {
  const res = [];
  const ok = (nome, cond, detalhe) => res.push({ nome, ok: !!cond, detalhe: cond ? undefined : detalhe });
  const tem = (nome) => typeof globalThis[nome] === "function" || (() => { try { return typeof eval(nome) === "function"; } catch { return false; } })();

  /* `_minConferido` e `_curouDescricoes` são escritos por `calcular()` (seção 8) */
  const CHAVES = ["produtos", "ops", "pedidos", "estoque", "festivas", "calc", "festivasView", "modal", "eventos",
    "_minConferido", "_curouDescricoes"];
  const antes = {};
  for (const k of CHAVES) antes[k] = S[k];
  const eventosPendente = _pendentes.has("eventos");

  const calcSintetico = () => ({ porSku: new Map([
    ["T.A", { sku: "T.A", estoqueReal: 5, qtdPacote: 10, abc: "A", processo: "CHUCA", descricao: "Produto A" }],
    ["T.B", { sku: "T.B", estoqueReal: 7, qtdPacote: 10, abc: "B", processo: "CHUCA", descricao: "Produto B" }],
    ["T.E", { sku: "T.E", estoqueReal: 3, qtdPacote: 1, abc: "C", processo: null, descricao: "Só estoque E" }],
  ]) });

  const montar = (extra = {}) => {
    S.produtos = [
      { id: "pA", sku: "T.A", descricao: "Produto A", qtdPacote: 10, skusAnteriores: [{ sku: "T.A0", ate: "2025-01-01" }] },
      { id: "pB", sku: "T.B", descricao: "Produto B", qtdPacote: 10, skusAnteriores: [] },
    ];
    S.ops = [
      { id: "oA", sku: "T.A", status: "em_producao", qtd: 200 },
      { id: "oAfim", sku: "T.A", status: "encerrada", qtd: 100 },
    ];
    S.pedidos = [
      /* concluído na campanha, com OP encerrada: 100 peças prontas depois da foto do estoque */
      { id: "rA1", numero: "T1", sku: "T.A", opId: "oAfim", campanhaId: "cT", status: "retornada", qtd: 100,
        etapas: [{ qtd: 100 }], retornadaEm: "2026-09-10" },
      /* vivo, com OP ativa */
      { id: "rA2", numero: "T2", sku: "T.A", opId: "oA", campanhaId: "cT", status: "enviada", qtd: 200 },
      /* vivo sem OP */
      { id: "rA3", numero: "T3", sku: "T.A", opId: null, campanhaId: "cT", status: "aberto", qtd: 30 },
      { id: "rB1", numero: "T4", sku: "T.B", opId: null, campanhaId: "cT", status: "aberto", qtd: 50 },
    ];
    S.estoque = { importadoEm: "2026-09-01", itens: [
      { sku: "T.A", estoqueReal: 5 }, { sku: "T.B", estoqueReal: 7 }, { sku: "T.E", estoqueReal: 3 }] };
    S.festivas = { campanhas: [{
      id: "cT", nome: "Teste", ini: "2026-09-01", fim: "2026-10-30", prepIni: "2026-08-15", crescimento: 0,
      itens: [
        { sku: "T.A", comportamento: "exclusivo", baseSkus: [] },
        { sku: "T.B", comportamento: "exclusivo", baseSkus: [], meta: 60 },
        { sku: "T.E", comportamento: "exclusivo", baseSkus: [] },
        { sku: "T.F", comportamento: "exclusivo", baseSkus: [] },
      ],
      vendasBase: { porSku: { "T.A": 100, "T.B": 50, "T.A0": 20, "T.E": 4 } },
      vendasAtual: { porSku: { "T.A": 30, "T.B": 10, "T.A0": 5 } },
      ...extra }] };
    S.festivasView = { ...(antes.festivasView || {}), campanha: "cT", modo: "produtos", selProd: [] };
    S.modal = null;
    S.eventos = [];
    S.calc = calcSintetico();
    mudouDados();
  };
  const camp = () => campanhaPorId("cT");
  const linha = (sku) => { const c = camp(); const it = itensDaCampanha(c).find((i) => i.sku === sku); return it ? festLinha(c, it) : null; };
  const clone = (x) => JSON.parse(JSON.stringify(x));

  try {
    /* ---------- 1. o Planejamento reconhece SKU atual + skusAnteriores ---------- */
    montar();
    const a0 = linha("T.A");
    ok("1.1 vendido de T.A soma T.A0 (skusAnteriores)", a0 && a0.vendido === 35, `vendido=${a0 && a0.vendido}`);
    ok("1.2 venda anterior de T.A soma T.A0", a0 && a0.baseAuto === 120, `baseAuto=${a0 && a0.baseAuto}`);
    ok("1.3 todos os itens da campanha viram linha", festLinhas(camp()).length === 4, `linhas=${festLinhas(camp()).length}`);

    /* ---------- 2. B absorve A (principal = B) ---------- */
    montar();
    const vbAntes = clone(camp().vendasBase), vaAntes = clone(camp().vendasAtual), estAntes = clone(S.estoque);
    const u = unirProdutos("pB", "T.A");
    S.calc = calcSintetico(); /* o render recalcularia; o estoque continua por SKU */
    mudouDados();
    ok("2.1 união B←A executa", u && u.ok, u && u.erro);
    const pB = S.produtos.find((p) => p.id === "pB");
    const ant = (pB?.skusAnteriores || []).map((h) => h.sku);
    ok("2.2 T.A entra em skusAnteriores de T.B", ant.includes("T.A"), ant.join(","));
    ok("2.3 histórico do absorvido (T.A0) vem junto", ant.includes("T.A0"), ant.join(","));
    ok("2.4 cadastro de T.A deixa de existir", !S.produtos.some((p) => p.id === "pA"));
    const skusCamp = itensDaCampanha(camp()).map((i) => i.sku);
    ok("2.5 campanha fica só com a linha do principal", !skusCamp.includes("T.A") && skusCamp.includes("T.B"), skusCamp.join(","));
    ok("2.6 T.E e T.F continuam na campanha", skusCamp.includes("T.E") && skusCamp.includes("T.F"), skusCamp.join(","));
    ok("2.7 vendasBase.porSku intacto", JSON.stringify(camp().vendasBase) === JSON.stringify(vbAntes));
    ok("2.8 vendasAtual.porSku intacto", JSON.stringify(camp().vendasAtual) === JSON.stringify(vaAntes));
    ok("2.9 estoque importado intacto", JSON.stringify(S.estoque) === JSON.stringify(estAntes));
    ok("2.10 pedido concluído mantém T.A", S.pedidos.find((r) => r.id === "rA1").sku === "T.A");
    ok("2.11 OP encerrada mantém T.A", S.ops.find((o) => o.id === "oAfim").sku === "T.A");
    ok("2.12 OP ativa recebe T.B", S.ops.find((o) => o.id === "oA").sku === "T.B");
    ok("2.13 pedido vivo sem OP recebe T.B", S.pedidos.find((r) => r.id === "rA3").sku === "T.B");

    const b = linha("T.B");
    ok("2.14 vendido de T.B inclui A e A0 (10+30+5)", b && b.vendido === 45, `vendido=${b && b.vendido}`);
    ok("2.15 pronto de T.B inclui o concluído de A (100)", b && b.pronto === 100, `pronto=${b && b.pronto}`);
    ok("2.16 pronto novo de T.B inclui A (100)", b && b.prontoNovo === 100, `prontoNovo=${b && b.prontoNovo}`);
    ok("2.17 em produção de T.B = 200 + 30 + 50", b && b.programado === 280, `programado=${b && b.programado}`);
    ok("2.18 venda anterior de T.B = 50 + 100 + 20", b && b.baseAuto === 170, `baseAuto=${b && b.baseAuto}`);
    ok("2.19 estoque de T.B NÃO soma o de A", b && b.estoque === 7, `estoque=${b && b.estoque}`);
    ok("2.20 meta aplicada não é trocada pela união", b && b.meta === 60, `meta=${b && b.meta}`);
    /* A produzir com a identidade unida: meta 60 − vendido 45 − (7 + (100+280)/10 = 45) < 0 → 0 */
    ok("2.21 A produzir não infla depois da união", b && b.produzir === 0, `produzir=${b && b.produzir}`);
    ok("2.22 análise sinaliza a meta de T.B para reaplicar", festPrevia(camp()).mudam.some((x) => x.sku === "T.B"));

    /* ---------- 3. o sentido inverso: A absorve B ---------- */
    montar();
    const u2 = unirProdutos("pA", "T.B");
    S.calc = calcSintetico(); mudouDados();
    ok("3.1 união A←B executa", u2 && u2.ok, u2 && u2.erro);
    const a = linha("T.A");
    ok("3.2 vendido de T.A inclui B", a && a.vendido === 45, `vendido=${a && a.vendido}`);
    ok("3.3 em produção de T.A inclui o pedido de B", a && a.programado === 280, `programado=${a && a.programado}`);
    ok("3.4 pedido vivo sem OP de B recebe T.A", S.pedidos.find((r) => r.id === "rB1").sku === "T.A");
    ok("3.5 estoque de T.A NÃO soma o de B", a && a.estoque === 5, `estoque=${a && a.estoque}`);

    /* ---------- 4. sem dupla contagem com linhas próprias ---------- */
    montar();
    /* legado: T.A0 é anterior de T.A E tem linha própria na campanha */
    camp().itens.push({ sku: "T.A0", comportamento: "exclusivo", baseSkus: [] });
    mudouDados();
    const ls4 = festLinhas(camp());
    const vend4 = ls4.reduce((t, x) => t + x.vendido, 0);
    ok("4.1 venda de T.A0 conta uma vez só no total (30+10+5)", vend4 === 45, `total vendido=${vend4}`);
    ok("4.2 T.A0 fica na linha dele", ls4.find((x) => x.sku === "T.A0")?.vendido === 5);

    /* ---------- 5. escolha explícita do principal ---------- */
    const temOpc = tem("festUnirOpcoes") && tem("festUnirAplicar");
    ok("5.0 festUnirOpcoes / festUnirAplicar existem", temOpc);
    if (temOpc) {
      montar();
      const o1 = festUnirOpcoes(camp(), "T.A", "T.B");
      ok("5.1 A e B com cadastro: os dois podem ficar", !o1.bloqueio && o1.lados.every((l) => l.podeFicar), JSON.stringify(o1.lados?.map((l) => [l.sku, l.podeFicar])));
      const o2 = festUnirOpcoes(camp(), "T.A", "T.E");
      const la = o2.lados?.find((l) => l.sku === "T.A"), le = o2.lados?.find((l) => l.sku === "T.E");
      ok("5.2 A com cadastro, E sem: só A pode ficar", !o2.bloqueio && la?.podeFicar && !le?.podeFicar);
      ok("5.3 a opção desabilitada tem explicação", !!le?.motivo, le?.motivo);
      const o3 = festUnirOpcoes(camp(), "T.E", "T.F");
      ok("5.4 nenhum com cadastro: união bloqueada", !!o3.bloqueio, JSON.stringify(o3));

      const semEscolha = festUnirAplicar("cT", ["T.A", "T.B"], null);
      ok("5.5 sem escolha, não une", !semEscolha.ok && S.produtos.length === 2);
      const errada = festUnirAplicar("cT", ["T.A", "T.E"], "T.E");
      ok("5.6 escolher o sem cadastro é recusado", !errada.ok && S.produtos.length === 2 && itensDaCampanha(camp()).length === 4);
      const fora = festUnirAplicar("cT", ["T.A", "T.B"], "T.Z");
      ok("5.7 SKU fora do par é recusado", !fora.ok);

      S.festivasView.selProd = ["T.A", "T.B"];
      const r5 = festUnirAplicar("cT", ["T.A", "T.B"], "T.A");
      ok("5.8 escolha A: A permanece", r5.ok && r5.principal === "T.A" && S.produtos.some((p) => p.id === "pA") && !S.produtos.some((p) => p.id === "pB"), r5.erro);
      ok("5.9 seleção limpa depois da união", (S.festivasView.selProd || []).length === 0);

      montar();
      S.festivasView.selProd = ["T.A", "T.B"];
      const r6 = festUnirAplicar("cT", ["T.A", "T.B"], "T.B");
      ok("5.10 escolha B: B permanece (não decide pelo SKU nem pela ordem)", r6.ok && r6.principal === "T.B" && S.produtos.some((p) => p.id === "pB") && !S.produtos.some((p) => p.id === "pA"), r6.erro);
      ok("5.11 sinaliza reaplicar análise quando a meta sugerida mudou", r6.ok && r6.reaplicar === true, JSON.stringify(r6.reaplicar));
      ok("5.12 união não aplica análise sozinha (meta segue 60)", itensDaCampanha(camp()).find((i) => i.sku === "T.B")?.meta === 60);
    }

    /* ---------- 6. interface ---------- */
    montar();
    const tela = (sel) => { S.festivasView.selProd = sel; return telaCampanhaProdutos(camp()); };
    const h2 = tela(["T.A", "T.B"]);
    ok("6.1 com 2 selecionados aparece Unir produtos (2)", /data-act="fest-unir-sel"[^>]*>[^<]*Unir produtos \(2\)/.test(h2));
    ok("6.2 Tirar da campanha continua", h2.includes('data-act="fest-tirar-lote"'));
    ok("6.3 com 1 selecionado não aparece", !tela(["T.A"]).includes("fest-unir-sel"));
    ok("6.4 com 3 selecionados não aparece", !tela(["T.A", "T.B", "T.E"]).includes("fest-unir-sel"));

    if (temOpc) {
      const modal = (skus, fica) => renderModalDe({ tipo: "festUnir", campanhaId: "cT", skus, fica: fica || null });
      const m1 = modal(["T.A", "T.B"]);
      ok("6.5 janela pergunta qual permanece", m1.includes("Qual produto deve permanecer?"));
      ok("6.6 opções Manter T.A e Manter T.B", /Manter\s*<b[^>]*>T\.A<\/b>/.test(m1) && /Manter\s*<b[^>]*>T\.B<\/b>/.test(m1));
      ok("6.7 nenhuma opção vem marcada", !/name="uniao-fica"[^>]*checked/.test(m1));
      ok("6.8 botão de unir desabilitado sem escolha", /data-act="fest-unir"[^>]*disabled/.test(m1));
      const campos = ["SKU", "Descrição", "Comportamento", "Venda anterior", "Meta", "Estoque", "Em produção", "Pronto", "Vendido", "A produzir", "SKUs anteriores", "OP ativa", "Pedido vivo"];
      const faltam = campos.filter((c) => !m1.includes(`<th scope="row">${c}`));
      ok("6.9 comparação mostra todos os campos", !faltam.length, faltam.join(", "));
      const m2 = modal(["T.A", "T.E"]);
      ok("6.10 opção sem cadastro vem desabilitada", /value="T\.E"[^>]*disabled/.test(m2));
      ok("6.11 e com explicação", m2.includes("sem cadastro de produto"));
      const m3 = modal(["T.E", "T.F"]);
      ok("6.12 nenhum com cadastro: sem botão de unir", !m3.includes('data-act="fest-unir"') && /nenhum dos dois/i.test(m3));
      ok("6.13 janela avisa que estoque não soma", m1.includes("NÃO serão somados"));
    }

    /* ---------- 7. base histórica continua separada ---------- */
    montar();
    S.festivasView.buscaBase = "T.";
    const mi = renderModalDe({ tipo: "festItem", campanhaId: "cT", sku: "T.B" });
    ok("7.1 janela do produto oferece Usar como base histórica", mi.includes("data-festbaseadd"));
    ok("7.2 e não oferece unir por lá (unir é por seleção)", !mi.includes("data-festunir"));
    const vb = festBaseConferir(camp(), itensDaCampanha(camp()).find((i) => i.sku === "T.B"), "T.OLD");
    ok("7.3 base histórica aceita SKU antigo fora da campanha", vb.ok);
    const vb2 = festBaseConferir(camp(), itensDaCampanha(camp()).find((i) => i.sku === "T.B"), "T.A");
    ok("7.4 SKU que é produto da campanha sugere união", !vb2.ok && vb2.sugereUniao);

    /* ---------- 8. Demanda depois da união (v8.98) ----------
       Roda o `calcular()` de verdade sobre o cenário: A e B "só na data" na
       campanha, cada um com linha própria no estoque importado. */
    const estoqueDemanda = () => ({ importadoEm: "2026-09-01", periodoIni: "2026-06-01", periodoFim: "2026-08-31", itens: [
      { sku: "T.A", produto: "Produto A", vendas: 12, estDisponivel: 9, estVirtual: 0, estMinimo: 20, valorVendido: 100 },
      { sku: "T.B", produto: "Produto B", vendas: 8, estDisponivel: 4, estVirtual: 0, estMinimo: 20, valorVendido: 80 },
      { sku: "T.R", produto: "Reforço R", vendas: 5, estDisponivel: 1, estVirtual: 0, estMinimo: 10, valorVendido: 50 },
    ] });
    const demanda = () => { const cc = calcular(); return {
      todas: cc.linhas.map((l) => l.sku), naDemanda: cc.linhasDemanda.map((l) => l.sku),
      estoque: new Map(cc.linhas.map((l) => [l.sku, l.estoqueReal])), fora: cc.foraDaDemanda }; };

    montar();
    S.estoque = estoqueDemanda();
    camp().itens.push({ sku: "T.R", comportamento: "reforco", baseSkus: [] });
    mudouDados();
    const d0 = demanda();
    ok("8.1 antes: A e B (só na data) fora da Demanda", !d0.naDemanda.includes("T.A") && !d0.naDemanda.includes("T.B"), d0.naDemanda.join(","));
    ok("8.2 antes: R (ano todo + reforço) na Demanda", d0.naDemanda.includes("T.R"), d0.naDemanda.join(","));

    const u8 = temOpc ? festUnirAplicar("cT", ["T.A", "T.B"], "T.B") : unirProdutos("pB", "T.A");
    mudouDados();
    ok("8.3 A é absorvido por B", u8 && u8.ok, u8 && u8.erro);
    ok("8.4 A continua com linha própria de estoque (não some do estoque)", S.estoque.itens.some((i) => i.sku === "T.A"));
    const d1 = demanda();
    ok("8.5 A NÃO reaparece na Demanda como produto independente", !d1.naDemanda.includes("T.A"), d1.naDemanda.join(","));
    ok("8.6 B continua fora da Demanda (só na data)", !d1.naDemanda.includes("T.B"), d1.naDemanda.join(","));
    ok("8.7 R continua na Demanda", d1.naDemanda.includes("T.R"), d1.naDemanda.join(","));
    ok("8.8 B reconhece A: produtoDe(T.A) é B", produtoDe("T.A")?.id === "pB", produtoDe("T.A")?.sku);
    ok("8.9 B reconhece A: skusDoProduto(T.B) inclui T.A", skusDoProduto("T.B").includes("T.A"), skusDoProduto("T.B").join(","));
    ok("8.10 estoque de A intacto e separado (9)", d1.estoque.get("T.A") === 9, `A=${d1.estoque.get("T.A")}`);
    ok("8.11 estoque de B intacto e separado (4)", d1.estoque.get("T.B") === 4, `B=${d1.estoque.get("T.B")}`);
    ok("8.12 as duas linhas de estoque continuam (nada somado)", d1.todas.includes("T.A") && d1.todas.includes("T.B"), d1.todas.join(","));
    /* o cenário tem 4 itens "só na data" (A, B, E, F); depois da união ficam 3.
       O aviso conta PRODUTOS da campanha — o SKU anterior não pode inflar isto. */
    ok("8.13 aviso “em Datas festivas” conta produtos da campanha, não SKUs anteriores (3)", d1.fora === 3, `fora=${d1.fora}`);
    S.calc = calcSintetico(); mudouDados();
    ok("8.14 linha de B na campanha: estoque é só o de B", linha("T.B")?.estoque === 7, `estoque=${linha("T.B")?.estoque}`);

    /* um SKU que é item EXPLÍCITO "ano todo + reforço" não é escondido só por
       ser anterior de um produto "só na data" — o vínculo explícito manda */
    montar();
    S.estoque = estoqueDemanda();
    S.produtos.find((p) => p.id === "pB").skusAnteriores = [{ sku: "T.R", ate: "2026-01-01" }];
    camp().itens.push({ sku: "T.R", comportamento: "reforco", baseSkus: [] });
    mudouDados();
    const d2 = demanda();
    ok("8.15 item explícito de reforço segue na Demanda mesmo sendo anterior de outro", d2.naDemanda.includes("T.R"), d2.naDemanda.join(","));

    /* campanha arquivada devolve à Demanda — a identidade inclusive */
    montar();
    S.estoque = estoqueDemanda();
    unirProdutos("pB", "T.A");
    camp().arquivada = true;
    mudouDados();
    const d3 = demanda();
    ok("8.16 campanha arquivada: B e A voltam à Demanda (regra antiga)", d3.naDemanda.includes("T.A") && d3.naDemanda.includes("T.B"), d3.naDemanda.join(","));
  } catch (e) {
    res.push({ nome: "EXCEÇÃO", ok: false, detalhe: String(e && e.stack || e) });
  } finally {
    for (const k of CHAVES) S[k] = antes[k];
    if (!eventosPendente) _pendentes.delete("eventos");
    mudouDados();
  }
  const falhas = res.filter((r) => !r.ok);
  return { versao: VERSAO, resumo: `datas-festivas-uniao: ${res.length - falhas.length} ok · ${falhas.length} falhas`, falhas };
}

/* a janela é desenhada por `renderModal()`, que lê `S.modal`: aqui ela é
   desenhada com um modal emprestado e o original volta logo em seguida */
function renderModalDe(m) {
  const antes = S.modal;
  try { S.modal = m; return renderModal() || ""; } finally { S.modal = antes; }
}
