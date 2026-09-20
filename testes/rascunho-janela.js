/* ===========================================================================
   BANCADA · a rede genérica de rascunho das janelas
   ---------------------------------------------------------------------------
   `colherDigitadoDaJanela()` / `reporDigitadoNaJanela()` guardam o que a pessoa
   digitou quando uma janela precisa ser redesenhada — e é essa rede que segura
   o rascunho quando OUTRA janela abre por cima (`abrirPorCimaDaJanela`).

   Ela chaveia cada campo por `data-m`, `data-emb`, `data-pp`, `data-m-et` ou
   `id`. Na janela de criar pedidos há um grupo por SKU, e os campos de grupo
   carregam o índice num atributo À PARTE — `data-ppg` na embalagem, `data-etuso`
   nas etapas. A chave não olhava nenhum dos dois:

     · as etapas não casavam com chave nenhuma e não eram guardadas;
     · a embalagem dos dois grupos virava a MESMA chave, e na volta os dois
       valores caíam no primeiro campo do documento.

   Esta bancada desenha a janela DE VERDADE (`renderModal()`), mexe nela como a
   pessoa mexeria, faz a janela ser redesenhada e confere o que voltou.

   Uso no console:
     (0, eval)(await (await fetch("testes/rascunho-janela.js")).text());
     await bateriaRascunhoJanela();
   =========================================================================== */
(function () {
  const CASOS = {};

  const ESTRUTURA = { processo: "MAQUINA",
    etapas: [{ nome: "CORTE" }, { nome: "COSTURA" }, { nome: "EMBALAGEM" }] };

  /* dois SKUs com embalagem DIFERENTE: é a diferença que denuncia a troca */
  const PRODUTOS = () => ([
    { id: 9001, sku: "380", skuAtual: "380", skusAnteriores: [], descricao: "Laço duplo",
      qtdPacote: 1, processo: "MAQUINA", producao: { embalagemTipo: "plástico", qtdPorEmbalagem: 10 } },
    { id: 9002, sku: "M02", skuAtual: "M02", skusAnteriores: [], descricao: "Tiara",
      qtdPacote: 1, processo: "MAQUINA", producao: { embalagemTipo: "filipeta", qtdPorEmbalagem: 20 } },
  ]);

  const GRUPO = (sku, desc, saldo) => ({ sku, descricao: desc, processo: "MAQUINA", qtdPacote: 1,
    saldo, abertos: [], adesivo: false, setor: null, recomendadas: [],
    linhas: [{ qtd: saldo, prioridade: 3, prestadora: "", mix: 0 }] });

  function montar(produtos) {
    const salvo = { modal: S.modal, produtos: S.produtos, estruturas: S.cad.estruturas,
      qtdsEmb: S.cad.qtdsEmbalagem, tamsEmb: S.cad.tamanhosEmbalagem, embNovo: S.embNovo };
    S.produtos = produtos || PRODUTOS();
    S.cad.estruturas = [ESTRUTURA];
    /* sem o cadastro, o seletor só oferece o valor que o próprio produto já tem
       — e aí os dois grupos nunca chegariam a oferecer a mesma opção */
    S.cad.qtdsEmbalagem = [10, 20];
    S.cad.tamanhosEmbalagem = ["P", "M"];
    S.embNovo = null;
    S.modal = { tipo: "criarPedidos", reprios: {},
      grupos: [GRUPO("380", "Laço duplo", 10), GRUPO("M02", "Tiara", 5)] };
    if (typeof mudouDados === "function") mudouDados();
    return salvo;
  }
  function desmontar(salvo) {
    const c = document.getElementById("bancada-rascunho");
    if (c) c.remove();
    S.modal = salvo.modal; S.produtos = salvo.produtos;
    S.cad.estruturas = salvo.estruturas; S.embNovo = salvo.embNovo;
    S.cad.qtdsEmbalagem = salvo.qtdsEmb; S.cad.tamanhosEmbalagem = salvo.tamsEmb;
    if (typeof mudouDados === "function") mudouDados();
  }

  /* Desenha a janela de verdade num canto do documento. `colherDigitadoDaJanela`
     procura `.ov` com `document.querySelector`, então a bancada RECUSA rodar se
     já houver uma janela de pé: ela mediria a janela errada, e um teste que
     mente é pior que um teste que falta. */
  function pintar() {
    let c = document.getElementById("bancada-rascunho");
    if (!c) {
      if (document.querySelector(".ov"))
        throw new Error("há uma janela aberta na tela — feche antes de rodar esta bancada");
      c = document.createElement("div");
      c.id = "bancada-rascunho";
      c.style.cssText = "position:absolute;left:-99999px;top:0;width:1080px";
      document.body.appendChild(c);
    }
    c.innerHTML = renderModal();
    return c;
  }
  const um = (sel) => document.querySelector("#bancada-rascunho " + sel);

  /* ---------- 1 · as etapas de cada grupo ---------- */
  CASOS["etapas do grupo 1 sobrevivem a uma janela aberta por cima"] = () => {
    const salvo = montar();
    try {
      pintar();
      const chip = (gi, nome) => um(`[data-etuso="${gi}"][value="${nome}"]`);
      if (!chip(0, "COSTURA") || !chip(1, "COSTURA"))
        return { ok: false, obtido: "a janela não desenhou os chips de etapa — bancada inválida" };
      const antes = { g0: chip(0, "COSTURA").checked, g1: chip(1, "COSTURA").checked };

      /* a pessoa tira COSTURA só do SEGUNDO SKU */
      chip(1, "COSTURA").checked = false;
      const lidoAntes = pedLerEtapasDoForm(1);

      const g = colherDigitadoDaJanela();     /* abre o Projeto de Corte por cima */
      pintar();                               /* volta: a janela é redesenhada */
      reporDigitadoNaJanela(g);

      const depois = { g0: chip(0, "COSTURA").checked, g1: chip(1, "COSTURA").checked };
      const lido0 = pedLerEtapasDoForm(0);
      const lido1 = pedLerEtapasDoForm(1);
      return {
        ok: antes.g0 === true && antes.g1 === true
          && depois.g0 === true && depois.g1 === false
          && JSON.stringify(lido1) === JSON.stringify(lidoAntes)
          && (lido0.etapas || []).includes("COSTURA"),
        obtido: { antes, depois, lidoAntes, grupo0: lido0, grupo1: lido1 },
      };
    } finally { desmontar(salvo); }
  };

  /* ---------- 2 · a embalagem não troca de grupo ---------- */
  CASOS["embalagem do grupo 0 continua no 0 e a do 1 no 1"] = () => {
    const salvo = montar();
    try {
      pintar();
      const tipo = (gi) => um(`[data-pp="embalagemTipo"][data-ppg="${gi}"]`);
      if (!tipo(0) || !tipo(1))
        return { ok: false, obtido: "a janela não desenhou a embalagem por grupo — bancada inválida" };

      /* cada SKU recebe uma embalagem diferente, e diferente do padrão dele */
      tipo(0).value = "outro";        /* padrão do 380 era plástico */
      tipo(1).value = "plástico";     /* padrão do M02 era filipeta */
      const antes = { g0: pedLerEmbalagemDoForm(0), g1: pedLerEmbalagemDoForm(1) };

      const g = colherDigitadoDaJanela();
      pintar();
      reporDigitadoNaJanela(g);
      const depois = { g0: pedLerEmbalagemDoForm(0), g1: pedLerEmbalagemDoForm(1) };

      return {
        ok: antes.g0.embalagemTipo === "outro" && antes.g1.embalagemTipo === "plástico"
          && depois.g0.embalagemTipo === "outro" && depois.g1.embalagemTipo === "plástico",
        obtido: { antes: { g0: antes.g0.embalagemTipo, g1: antes.g1.embalagemTipo },
                  depois: { g0: depois.g0.embalagemTipo, g1: depois.g1.embalagemTipo } },
      };
    } finally { desmontar(salvo); }
  };

  /* ---------- 3 · o mesmo, no campo numérico ----------
     `qtdPorEmbalagem` sai impresso no canhoto: trocar de grupo aqui é mandar
     embalar de 10 em 10 o que vai de 20 em 20. */
  CASOS["quantidade por embalagem não troca de grupo"] = () => {
    const salvo = montar();
    try {
      pintar();
      const qtd = (gi) => um(`[data-pp="qtdPorEmbalagem"][data-ppg="${gi}"]`);
      if (!qtd(0) || !qtd(1))
        return { ok: false, obtido: "sem campo de quantidade por embalagem — bancada inválida" };
      const opcao = (el, v) => Array.from(el.options || []).some((o) => o.value === String(v));
      /* só troca para valores que o seletor realmente oferece */
      const v0 = opcao(qtd(0), 20) ? "20" : null;
      const v1 = opcao(qtd(1), 10) ? "10" : null;
      if (!v0 || !v1) return { ok: false, obtido: "o seletor não oferece 10 e 20 — bancada inválida" };
      qtd(0).value = v0; qtd(1).value = v1;

      const g = colherDigitadoDaJanela();
      pintar();
      reporDigitadoNaJanela(g);
      const depois = { g0: pedLerEmbalagemDoForm(0).qtdPorEmbalagem,
                       g1: pedLerEmbalagemDoForm(1).qtdPorEmbalagem };
      return { ok: depois.g0 === 20 && depois.g1 === 10, obtido: depois };
    } finally { desmontar(salvo); }
  };

  /* ---------- 4 · campo intocado NÃO volta por cima do valor novo ----------
     É a regra que o conserto não pode atropelar: repor um campo que ninguém
     mexeu faria a novidade do servidor nunca aparecer. */
  CASOS["campo intocado não é reposto por cima do valor novo"] = () => {
    const salvo = montar();
    try {
      pintar();
      /* mexe SÓ no grupo 0 */
      um('[data-pp="embalagemTipo"][data-ppg="0"]').value = "outro";
      const g = colherDigitadoDaJanela();

      /* enquanto a outra janela estava aberta, o M02 mudou de embalagem */
      S.produtos = PRODUTOS();
      S.produtos[1].producao.embalagemTipo = "plástico";
      /* `produtoDe` lê um índice cacheado (componentes/tabela.js): trocar a
         lista sem avisar deixava o desenho com o produto velho */
      if (typeof mudouDados === "function") mudouDados();
      pintar();
      reporDigitadoNaJanela(g);

      const depois = { g0: pedLerEmbalagemDoForm(0).embalagemTipo,
                       g1: pedLerEmbalagemDoForm(1).embalagemTipo };
      return { ok: depois.g0 === "outro" && depois.g1 === "plástico", obtido: depois };
    } finally { desmontar(salvo); }
  };

  /* ---------- 5 · nada mexido, nada guardado ---------- */
  CASOS["janela intocada não gera rascunho"] = () => {
    const salvo = montar();
    try {
      pintar();
      const g = colherDigitadoDaJanela();
      return { ok: g === null, obtido: g && g.guardado };
    } finally { desmontar(salvo); }
  };

  /* ---------- 6 · a janela de um pedido só continua inteira ----------
     O mesmo conserto mexe na chave de TODA janela. Aqui um `data-pp` SEM grupo
     (a janela de um pedido, o cadastro do produto) tem de continuar voltando. */
  CASOS["data-pp sem grupo continua voltando"] = () => {
    const salvo = montar();
    try {
      let c = document.getElementById("bancada-rascunho");
      if (!c) { c = document.createElement("div"); c.id = "bancada-rascunho";
        c.style.cssText = "position:absolute;left:-99999px;top:0"; document.body.appendChild(c); }
      const desenhar = () => { c.innerHTML = `<div class="ov"><div class="modal">${
        camposEmbalagem(S.produtos[0], (rot, campo) => campo, null)}</div></div>`; };
      desenhar();
      const campo = () => um('[data-pp="embalagemTipo"]');
      campo().value = "outro";
      const g = colherDigitadoDaJanela();
      desenhar();
      reporDigitadoNaJanela(g);
      return { ok: campo().value === "outro" && pedLerEmbalagemDoForm().embalagemTipo === "outro",
               obtido: { valor: campo().value } };
    } finally { desmontar(salvo); }
  };

  window.bateriaRascunhoJanela = async function (opcoes) {
    const o = opcoes || {};
    const nomes = o.casos || Object.keys(CASOS);
    const res = [];
    for (const n of nomes) {
      let r;
      try { r = await CASOS[n](); }
      catch (e) { r = { ok: false, obtido: String((e && e.stack) || e) }; }
      res.push(Object.assign({ caso: n }, r));
    }
    const falhas = res.filter((x) => !x.ok);
    return {
      versao: typeof VERSAO !== "undefined" ? VERSAO : "?",
      resumo: `rascunho-janela: ${res.length - falhas.length} ok · ${falhas.length} falhas`,
      falhas: falhas.map((x) => ({ caso: x.caso, obtido: x.obtido })),
      detalhes: o.detalhes ? res : undefined,
    };
  };
})();
