/* ===========================================================================
   BANCADA · projetos de corte (montagem, herança, versão material)
   ---------------------------------------------------------------------------
   Não fala com o Supabase: troca `persLer`, `persRpc` e as flags por versões
   de bancada e roda o código de verdade — `pjCarregar`, `pjResolver`,
   `pjSalvar`, e o modelo da v8.106 por baixo.

   O servidor de bancada devolve linhas no formato EXATO das tabelas da 147
   (snake_case, comprimento em milímetro, fitilho como linha que existe ou não
   existe), porque é isso que a montagem tem que saber traduzir.

   A fila real do navegador é salva antes e devolvida no fim.

   Uso no console:
     (0, eval)(await (await fetch("testes/corte-projetos.js")).text());
     await bateriaCorteProjetos();
   =========================================================================== */
(function () {
  const CHAVE = (typeof OUTBOX_CHAVE !== "undefined" ? OUTBOX_CHAVE : "pcp5:outbox");

  /* ---------- o banco de bancada ----------
     Família 3xx: 1 corte (fita A, 20 cm) + fitilho 70 cm.
     Combinação 380: troca os cortes, herda o fitilho.
     Exceção 380.AD: só cortes, com outro comprimento. */
  const BANCO = () => ({
    pcp_projeto_corte: [
      { id: "prj_fam", nome: "Família 3xx", escopo: "familia", ativo: true, versao_publicada_id: "prj_fam_v1", revision: 3 },
      { id: "prj_cmb", nome: "Combinação 380", escopo: "combinacao", ativo: true, versao_publicada_id: "prj_cmb_v1", revision: 1 },
      { id: "prj_sku", nome: "Exceção 380.AD", escopo: "sku", ativo: true, versao_publicada_id: "prj_sku_v2", revision: 5 },
    ],
    pcp_projeto_corte_regra: [
      { projeto_id: "prj_fam", campo: "sku", operador: "comeca", valor: "3", ordem: 1 },
      { projeto_id: "prj_cmb", campo: "sku", operador: "comeca", valor: "380", ordem: 1 },
      { projeto_id: "prj_sku", campo: "sku", operador: "igual", valor: "380.AD", ordem: 1 },
    ],
    pcp_projeto_corte_versao: [
      { id: "prj_fam_v1", projeto_id: "prj_fam", versao: 1, cortes_modo: "substitui", fitilho_modo: "substitui", sortimento_modo: "herda" },
      { id: "prj_cmb_v1", projeto_id: "prj_cmb", versao: 1, cortes_modo: "substitui", fitilho_modo: "herda", sortimento_modo: "herda" },
      { id: "prj_sku_v2", projeto_id: "prj_sku", versao: 2, cortes_modo: "substitui", fitilho_modo: "herda", sortimento_modo: "herda" },
    ],
    pcp_projeto_corte_corte: [
      { id: "prj_fam_v1_ct_a", versao_id: "prj_fam_v1", chave: "ct_a", ordem: 1, operacao: "define",
        fita_id: "ft_a", comprimento_mm: 200, tipo_corte: "reto", qtd: 1, identificacao: "Laço" },
      { id: "prj_cmb_v1_ct_b", versao_id: "prj_cmb_v1", chave: "ct_b", ordem: 1, operacao: "define",
        fita_id: "ft_b", comprimento_mm: 250, tipo_corte: "45", qtd: 1, identificacao: "Laço 380" },
      { id: "prj_sku_v2_ct_c", versao_id: "prj_sku_v2", chave: "ct_c", ordem: 1, operacao: "define",
        fita_id: "ft_b", comprimento_mm: 260, tipo_corte: "45", qtd: 1, identificacao: "Laço 380 AD" },
    ],
    pcp_projeto_corte_camada: [
      { corte_id: "prj_cmb_v1_ct_b", chave: "cm_x", ordem: 1, operacao: "define",
        fita_id: "ft_c", comprimento_mm: null, tipo_corte: "45", cortar_juntas: true, condicao: null },
    ],
    /* SÓ a família tem fitilho: a ausência de linha é a informação */
    pcp_projeto_corte_fitilho: [
      { versao_id: "prj_fam_v1", partes: 1, comprimento_mm: 700 },
    ],
    pcp_projeto_corte_sortimento: [],
    pcp_projeto_corte_sortimento_item: [],
  });

  function montar(flags, banco) {
    const salvo = { outbox: localStorage.getItem(CHAVE), janela: {}, pedidos: S && S.pedidos };
    const trocar = (nome, fn) => { salvo.janela[nome] = window[nome]; window[nome] = fn; };
    localStorage.removeItem(CHAVE);

    const B = { chamadas: [], leituras: [], banco: banco || BANCO(), resposta: null, salvo };

    trocar("persRpc", async (nome, args) => {
      B.chamadas.push({ nome, args });
      return B.resposta ? B.resposta(nome, args) : { ok: true, corpo: { status: "ok" } };
    });
    trocar("persLer", async (caminho) => {
      B.leituras.push(caminho);
      const tabela = String(caminho).split("?")[0];
      if (tabela === "pcp_flag") {
        return { ok: true, corpo: Object.entries(flags || {}).map(([nome, ligada]) => ({ nome, ligada })) };
      }
      return { ok: true, corpo: (B.banco[tabela] || []).slice() };
    });
    return B;
  }
  async function montarF(flags, banco) { const B = montar(flags, banco); await telaFlagsCarregar(); return B; }
  async function desmontar(B) {
    for (const [nome, fn] of Object.entries(B.salvo.janela)) {
      if (fn === undefined) delete window[nome]; else window[nome] = fn;
    }
    if (B.salvo.outbox == null) localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, B.salvo.outbox);
    try { await telaFlagsCarregar(); } catch (e) {}
  }
  const daRpc = (status, extra) => ({ ok: true, corpo: Object.assign({ status }, extra || {}) });

  const CASOS = {};

  /* ---------- 1 · montagem ---------- */
  CASOS["monta as cinco tabelas na forma do modelo"] = async () => {
    const B = await montarF({ corte_escrita: true });
    try {
      const r = await pjCarregar();
      const fam = pjAchar("prj_fam"), cmb = pjAchar("prj_cmb");
      const c = fam.versao.cortes[0];
      return { ok: r.status === "ok" && pjQuantos() === 3
                   && c.fitaId === "ft_a" && c.comprimentoMm === 200 && c.tipoCorte === "reto"
                   && c.chave === "ct_a"
                   && fam.versao.cortesModo === "substitui" && fam.versao.fitilhoModo === "substitui"
                   && cmb.versao.cortes[0].camadas.length === 1
                   && cmb.versao.cortes[0].camadas[0].comprimentoMm === null,
               obtido: { quantos: pjQuantos(), corte: c, camadas: cmb.versao.cortes[0].camadas.length } };
    } finally { await desmontar(B); }
  };

  /* ---------- 2 · ausência de fitilho é ausência de linha ---------- */
  CASOS["fitilho: linha que não existe vira null"] = async () => {
    const B = await montarF({ corte_escrita: true });
    try {
      await pjCarregar();
      return { ok: pjAchar("prj_fam").versao.fitilho.comprimentoMm === 700
                   && pjAchar("prj_cmb").versao.fitilho === null
                   && pjAchar("prj_sku").versao.fitilho === null,
               obtido: { fam: pjAchar("prj_fam").versao.fitilho, cmb: pjAchar("prj_cmb").versao.fitilho } };
    } finally { await desmontar(B); }
  };

  /* ---------- 3 · família < combinação < SKU, bloco a bloco ---------- */
  CASOS["herança: o SKU ganha nos cortes e herda o fitilho da família"] = async () => {
    const B = await montarF({ corte_escrita: true });
    try {
      await pjCarregar();
      const r380 = pjResolver("380");
      const rAD  = pjResolver("380.AD");
      const r310 = pjResolver("310");
      return { ok:
        /* 310 só casa com a família */
        r310.cortes.length === 1 && r310.cortes[0].fitaId === "ft_a" && r310.fitilho.comprimentoMm === 700
        /* 380 casa família + combinação: cortes da combinação, fitilho da família */
        && r380.cortes.length === 1 && r380.cortes[0].comprimentoMm === 250
        && r380.origem.cortes.nome === "Combinação 380"
        && r380.fitilho.comprimentoMm === 700 && r380.origem.fitilho.nome === "Família 3xx"
        /* 380.AD casa os três: cortes da exceção, fitilho ainda da família */
        && rAD.cortes[0].comprimentoMm === 260 && rAD.origem.cortes.escopo === "sku"
        && rAD.fitilho.comprimentoMm === 700 && rAD.origem.fitilho.escopo === "familia"
        && rAD.cadeia.length === 3,
        obtido: { c310: r310.cortes.length, c380: r380.cortes[0].comprimentoMm,
                  cAD: rAD.cortes[0].comprimentoMm, fitilhoAD: rAD.origem.fitilho.escopo,
                  cadeia: rAD.cadeia.map((x) => x.escopo) } };
    } finally { await desmontar(B); }
  };

  /* ---------- 4 · SKU que não casa não puxa projeto ---------- */
  CASOS["SKU sem regra não tem projeto"] = async () => {
    const B = await montarF({ corte_escrita: true });
    try {
      await pjCarregar();
      const r = pjResolver("M02");
      return { ok: !crtTemProjeto(r) && r.cortes.length === 0 && r.cadeia.length === 0,
               obtido: { cortes: r.cortes.length, cadeia: r.cadeia.length } };
    } finally { await desmontar(B); }
  };

  /* ---------- 5 · chaves estáveis ---------- */
  CASOS["corte e camada nascem com chave própria e permanente"] = async () => {
    const a = pjNovoCorte(), b = pjNovoCorte(), m = pjNovaCamada();
    const ok = /^ct_[0-9a-f]{8}$/.test(a.chave) && /^ct_/.test(b.chave) && a.chave !== b.chave
            && /^cm_[0-9a-f]{8}$/.test(m.chave);
    return { ok, obtido: { a: a.chave, b: b.chave, m: m.chave } };
  };

  CASOS["renomear e reordenar não mexem na chave"] = async () => {
    const B = await montarF({ corte_escrita: true });
    try {
      await pjCarregar();
      const r = pjRascunhoDe(pjAchar("prj_cmb"));
      const chaveAntes = r.cortes[0].chave;
      r.nome = "Outro nome";
      r.cortes[0].identificacao = "Rebatizado";
      r.cortes.unshift(pjNovoCorte());
      r.cortes[0].fitaId = "ft_a"; r.cortes[0].comprimentoCm = "10";
      const receita = pjParaReceita(r);
      const oCorteVelho = receita.cortes.find((c) => c.chave === chaveAntes);
      return { ok: !!oCorteVelho && oCorteVelho.ordem === 2 && oCorteVelho.identificacao === "Rebatizado"
                   && receita.cortes[0].ordem === 1 && receita.cortes[0].chave !== chaveAntes,
               obtido: { chaveAntes, ordens: receita.cortes.map((c) => [c.chave, c.ordem]) } };
    } finally { await desmontar(B); }
  };

  /* ---------- 6 · centímetro entra, milímetro sai ---------- */
  CASOS["comprimento vira milímetro inteiro; camada vazia é null"] = async () => {
    const r = pjNovo("familia");
    r.regras[0].valor = "M02";
    r.cortes = [Object.assign(pjNovoCorte(), { fitaId: "ft_a", comprimentoCm: "22,5" })];
    r.cortes[0].camadas = [Object.assign(pjNovaCamada(), { fitaId: "ft_b", comprimentoCm: "" })];
    const rec = pjParaReceita(r);
    return { ok: rec.cortes[0].comprimento_mm === 225 && rec.cortes[0].camadas[0].comprimento_mm === null,
             obtido: { corte: rec.cortes[0].comprimento_mm, camada: rec.cortes[0].camadas[0].comprimento_mm } };
  };

  /* ---------- 7 · os modos por bloco ---------- */
  CASOS["o modo de cada bloco viaja separado"] = async () => {
    const r = pjNovo("familia");
    r.regras[0].valor = "M02";
    r.modo = { cortes: "substitui", fitilho: "herda", sortimento: "herda" };
    r.cortes = [Object.assign(pjNovoCorte(), { fitaId: "ft_a", comprimentoCm: "20" })];
    r.fitilho = { partes: 1, comprimentoCm: "70" };
    const rec = pjParaReceita(r);
    return { ok: rec.cortes_modo === "substitui" && rec.fitilho_modo === "herda"
                 && rec.sortimento_modo === "herda"
                 /* fitilho desmarcado não vira chave: a RPC não insere linha */
                 && !("fitilho" in rec) && !("sortimento" in rec),
             obtido: { modos: [rec.cortes_modo, rec.fitilho_modo, rec.sortimento_modo],
                       temFitilho: "fitilho" in rec } };
  };

  CASOS["ajusta carregado do banco não vira substitui ao salvar"] = async () => {
    const banco = BANCO();
    banco.pcp_projeto_corte_versao[1].cortes_modo = "ajusta";
    const B = await montarF({ corte_escrita: true }, banco);
    try {
      await pjCarregar();
      const r = pjRascunhoDe(pjAchar("prj_cmb"));
      const rec = pjParaReceita(r);
      return { ok: r.modo.cortes === "ajusta" && rec.cortes_modo === "ajusta"
                   && rec.cortes.length === 1,
               obtido: { rascunho: r.modo.cortes, receita: rec.cortes_modo } };
    } finally { await desmontar(B); }
  };

  CASOS["remove zera o bloco sem mandar linha"] = async () => {
    const r = pjNovo("sku");
    r.nome = "Sem fitilho"; r.regras = [{ campo: "sku", operador: "igual", valor: "470" }];
    r.modo = { cortes: "herda", fitilho: "remove", sortimento: "herda" };
    r.fitilho = { partes: 1, comprimentoCm: "70" };
    const rec = pjParaReceita(r);
    return { ok: rec.fitilho_modo === "remove" && !("fitilho" in rec) && rec.cortes.length === 0,
             obtido: { modo: rec.fitilho_modo, temChave: "fitilho" in rec } };
  };

  /* ---------- 8 · versão nova SÓ com alteração material ---------- */
  CASOS["renomear não cria versão"] = async () => {
    const B = await montarF({ corte_escrita: true });
    try {
      await pjCarregar();
      B.resposta = () => daRpc("ok", { projeto_id: "prj_cmb", revision: 2 });
      const r = pjRascunhoDe(pjAchar("prj_cmb"));
      r.nome = "Combinação 380 · nome novo";
      const res = await pjSalvar(r);
      const env = B.chamadas[0].args;
      return { ok: res.status === "ok" && res.material === false
                   && env.p_receita === null && env.p_publicar === false
                   && env.p_projeto.nome === "Combinação 380 · nome novo"
                   && env.p_expected_revision === 1,
               obtido: { material: res.material, receita: env.p_receita, publicar: env.p_publicar } };
    } finally { await desmontar(B); }
  };

  CASOS["mudar a condição não cria versão"] = async () => {
    const B = await montarF({ corte_escrita: true });
    try {
      await pjCarregar();
      B.resposta = () => daRpc("ok", { projeto_id: "prj_cmb", revision: 2 });
      const r = pjRascunhoDe(pjAchar("prj_cmb"));
      r.regras = [{ campo: "sku", operador: "comeca", valor: "381" }];
      const res = await pjSalvar(r);
      const env = B.chamadas[0].args;
      return { ok: res.status === "ok" && env.p_receita === null
                   && env.p_regras.length === 1 && env.p_regras[0].valor === "381",
               obtido: { receita: env.p_receita, regras: env.p_regras } };
    } finally { await desmontar(B); }
  };

  CASOS["mudar um comprimento cria versão"] = async () => {
    const B = await montarF({ corte_escrita: true });
    try {
      await pjCarregar();
      B.resposta = () => daRpc("ok", { projeto_id: "prj_cmb", revision: 2, versao: 2, versao_id: "prj_cmb_v2" });
      const r = pjRascunhoDe(pjAchar("prj_cmb"));
      r.cortes[0].comprimentoCm = "26";
      const res = await pjSalvar(r);
      const env = B.chamadas[0].args;
      return { ok: res.status === "ok" && res.material === true
                   && env.p_receita && env.p_publicar === true
                   && env.p_receita.cortes[0].comprimento_mm === 260
                   && env.p_receita.cortes[0].chave === "ct_b",
               obtido: { material: res.material, mm: env.p_receita && env.p_receita.cortes[0].comprimento_mm } };
    } finally { await desmontar(B); }
  };

  CASOS["acrescentar camada cria versão"] = async () => {
    const B = await montarF({ corte_escrita: true });
    try {
      await pjCarregar();
      B.resposta = () => daRpc("ok", { projeto_id: "prj_fam", revision: 4 });
      const r = pjRascunhoDe(pjAchar("prj_fam"));
      r.cortes[0].camadas.push(Object.assign(pjNovaCamada(), { fitaId: "ft_c" }));
      const res = await pjSalvar(r);
      return { ok: res.material === true && B.chamadas[0].args.p_receita.cortes[0].camadas.length === 1,
               obtido: { material: res.material } };
    } finally { await desmontar(B); }
  };

  /* ---------- 9 · escopo SKU vira condição de igualdade ---------- */
  CASOS["escopo SKU grava operador igual"] = async () => {
    const r = pjNovo("sku");
    r.nome = "Exceção"; r.regras = [{ campo: "sku", operador: "comeca", valor: "470" }];
    const g = pjParaRegras(r);
    return { ok: g.length === 1 && g[0].operador === "igual" && g[0].valor === "470",
             obtido: g };
  };

  /* ---------- 10 · validação antes da fila ---------- */
  CASOS["projeto inválido não vira ação"] = async () => {
    const B = await montarF({ corte_escrita: true });
    try {
      const semNome = await pjSalvar(Object.assign(pjNovo("familia"), { regras: [{ valor: "M02", operador: "comeca" }] }));
      const semCond = await pjSalvar(Object.assign(pjNovo("familia"), { nome: "X" }));
      const semFita = await pjSalvar(Object.assign(pjNovo("familia"), { nome: "X",
        regras: [{ valor: "M02", operador: "comeca" }], cortes: [pjNovoCorte()] }));
      return { ok: semNome.status === "invalido" && semCond.status === "invalido"
                   && semFita.status === "invalido" && obLer().length === 0 && B.chamadas.length === 0,
               obtido: [semNome.motivo, semCond.motivo, semFita.motivo] };
    } finally { await desmontar(B); }
  };

  /* ---------- 11 · flag desligada guarda na fila ---------- */
  CASOS["com corte_escrita desligada, o projeto fica na fila"] = async () => {
    const B = await montarF({ corte_escrita: false });
    try {
      await pjCarregar();
      const r = pjRascunhoDe(pjAchar("prj_cmb"));
      r.cortes[0].comprimentoCm = "27";
      const res = await pjSalvar(r);
      return { ok: res.status === "na-fila" && B.chamadas.length === 0 && cxPendentes().length === 1,
               obtido: { status: res.status, chamadas: B.chamadas.length } };
    } finally { await desmontar(B); }
  };

  /* ---------- 12 · conflito para a ação e não descarta ---------- */
  CASOS["conflito no projeto para a ação"] = async () => {
    const B = await montarF({ corte_escrita: true });
    try {
      await pjCarregar();
      B.resposta = () => daRpc("conflito", { projeto_id: "prj_cmb", revision: 9 });
      const r = pjRascunhoDe(pjAchar("prj_cmb"));
      r.cortes[0].comprimentoCm = "28";
      const res = await pjSalvar(r);
      return { ok: res.status === "conflito" && pjParadas().length === 1 && cxPendentes().length === 0,
               obtido: { status: res.status, paradas: pjParadas().length } };
    } finally { await desmontar(B); }
  };

  /* ---------- 13 · pureza ---------- */
  CASOS["não mexe em S.pedidos nem na fila real"] = async () => {
    const antesFila = localStorage.getItem(CHAVE);
    const antesPed = S && S.pedidos;
    const B = await montarF({ corte_escrita: true });
    await pjCarregar();
    await desmontar(B);
    return { ok: localStorage.getItem(CHAVE) === antesFila && (S && S.pedidos) === antesPed,
             obtido: { filaIgual: localStorage.getItem(CHAVE) === antesFila } };
  };

  /* ---------- 14 · AJUSTE PARCIAL POR CHAVE ESTÁVEL ----------
     Estes casos vão do rascunho da tela até o modelo, passando pela receita
     que a RPC receberia. `comoVersao` faz o que `pjMontar` faz quando a linha
     volta do banco — assim a prova cobre a ida e a volta, e não só a ida. */
  const comoVersao = (rec) => ({
    cortesModo: rec.cortes_modo, fitilhoModo: rec.fitilho_modo, sortimentoModo: rec.sortimento_modo,
    cortes: (rec.cortes || []).map((c) => ({
      chave: c.chave, ordem: c.ordem, operacao: c.operacao, fitaId: c.fita_id,
      comprimentoMm: c.comprimento_mm, tipoCorte: c.tipo_corte, qtd: c.qtd, identificacao: c.identificacao,
      camadas: (c.camadas || []).map((m) => ({
        chave: m.chave, ordem: m.ordem, operacao: m.operacao, fitaId: m.fita_id,
        comprimentoMm: m.comprimento_mm, tipoCorte: m.tipo_corte,
        cortarJuntas: m.cortar_juntas, condicao: m.condicao })) })),
    fitilho: rec.fitilho ? { partes: rec.fitilho.partes, comprimentoMm: rec.fitilho.comprimento_mm } : null,
    sortimento: rec.sortimento ? { modo: rec.sortimento.modo, variedade: rec.sortimento.variedade,
      itens: rec.sortimento.itens || [] } : null,
  });

  /* a família de bancada, com DOIS cortes e uma camada no primeiro */
  const FAMILIA = () => ({
    id: "prj_fam", nome: "Família 3xx", escopo: "familia", ativo: true, revision: 1,
    regras: [{ campo: "sku", operador: "comeca", valor: "3" }],
    versao: { id: "prj_fam_v1", versao: 1, cortesModo: "substitui", fitilhoModo: "substitui", sortimentoModo: "herda",
      cortes: [
        { chave: "ct_a", ordem: 1, operacao: "define", fitaId: "ft_a", comprimentoMm: 200, tipoCorte: "reto",
          qtd: 1, identificacao: "Laço", camadas: [
            { chave: "cm_x", ordem: 1, operacao: "define", fitaId: "ft_c", comprimentoMm: null,
              tipoCorte: "reto", cortarJuntas: true, condicao: null }] },
        { chave: "ct_b", ordem: 2, operacao: "define", fitaId: "ft_b", comprimentoMm: 150, tipoCorte: "45",
          qtd: 1, identificacao: "Perna", camadas: [] }],
      fitilho: { partes: 1, comprimentoMm: 700 }, sortimento: null },
  });
  /* o rascunho de um ajuste, pronto para receber operações */
  const rascunhoAjuste = () => {
    const r = pjNovo("sku");
    r.nome = "Exceção 310"; r.regras = [{ campo: "sku", operador: "igual", valor: "310" }];
    r.modo = { cortes: "ajusta", fitilho: "herda", sortimento: "herda" };
    r.cortes = [];
    return r;
  };
  /* resolve o SKU com a família + o ajuste, como o app resolveria */
  const resolverCom = (r) => crtResolver([FAMILIA(), {
    id: r.id, nome: r.nome, escopo: r.escopo, ativo: true,
    regras: pjParaRegras(r), versao: comoVersao(pjParaReceita(r)),
  }], "310");

  CASOS["ajuste de comprimento mantém a chave e herda o resto"] = async () => {
    const r = rascunhoAjuste();
    r.cortes = [Object.assign(pjNovaOpCorte("ct_a", "substitui", 1), { comprimentoCm: "26" })];
    const rec = pjParaReceita(r);
    const res = resolverCom(r);
    const c = res.cortes.find((x) => x.chave === "ct_a");
    return { ok: rec.cortes.length === 1 && rec.cortes[0].chave === "ct_a"
                 && rec.cortes[0].operacao === "substitui" && rec.cortes[0].fita_id === null
                 && c && c.comprimentoMm === 260 && c.fitaId === "ft_a" && c.tipoCorte === "reto"
                 && c.identificacao === "Laço",
             obtido: { receita: rec.cortes[0], resolvido: c } };
  };

  CASOS["ajuste parcial não perde o outro corte herdado"] = async () => {
    const r = rascunhoAjuste();
    r.cortes = [Object.assign(pjNovaOpCorte("ct_a", "substitui", 1), { comprimentoCm: "26" })];
    const res = resolverCom(r);
    const b = res.cortes.find((x) => x.chave === "ct_b");
    return { ok: res.cortes.length === 2 && b && b.comprimentoMm === 150 && b.fitaId === "ft_b"
                 && b.identificacao === "Perna" && res.cortes[0].chave === "ct_a",
             obtido: { quantos: res.cortes.length, ordem: res.cortes.map((x) => x.chave) } };
  };

  CASOS["acrescentar corte no ajuste mantém os herdados"] = async () => {
    const r = rascunhoAjuste();
    const novo = pjNovaOpCorte(null, "acrescenta", 3);
    novo.fitaId = "ft_b"; novo.comprimentoCm = "8"; novo.tipoCorte = "biqueira"; novo.identificacao = "Ponta";
    r.cortes = [novo];
    const res = resolverCom(r);
    const n = res.cortes.find((x) => x.chave === novo.chave);
    return { ok: res.cortes.length === 3 && n && n.comprimentoMm === 80 && n.tipoCorte === "biqueira"
                 && res.cortes.some((x) => x.chave === "ct_a" && x.comprimentoMm === 200)
                 && res.cortes.some((x) => x.chave === "ct_b" && x.comprimentoMm === 150),
             obtido: { chaves: res.cortes.map((x) => [x.chave, x.comprimentoMm]) } };
  };

  CASOS["remover por chave elimina só o alvo"] = async () => {
    const r = rascunhoAjuste();
    r.cortes = [pjNovaOpCorte("ct_a", "remove", 1)];
    const rec = pjParaReceita(r);
    const res = resolverCom(r);
    return { ok: rec.cortes.length === 1 && rec.cortes[0].operacao === "remove"
                 && res.cortes.length === 1 && res.cortes[0].chave === "ct_b",
             obtido: { restou: res.cortes.map((x) => x.chave) } };
  };

  CASOS["camada ajustada pela chave mantém o que não foi tocado"] = async () => {
    const r = rascunhoAjuste();
    const op = pjNovaOpCorte("ct_a", "substitui", 1);
    op.camadas = [Object.assign(pjNovaOpCamada("cm_x", "substitui", 1), { comprimentoCm: "12", cortarJuntas: false })];
    r.cortes = [op];
    const rec = pjParaReceita(r);
    const res = resolverCom(r);
    const c = res.cortes.find((x) => x.chave === "ct_a");
    const m = c && c.camadas[0];
    return { ok: rec.cortes[0].camadas.length === 1 && rec.cortes[0].camadas[0].cortar_juntas === false
                 && rec.cortes[0].camadas[0].fita_id === null
                 && m && m.chave === "cm_x" && m.fitaId === "ft_c" && m.comprimentoMm === 120
                 && m.cortarJuntas === false
                 /* o corte em volta não foi tocado */
                 && c.comprimentoMm === 200 && c.fitaId === "ft_a",
             obtido: { camada: m, corte: c && { mm: c.comprimentoMm, fita: c.fitaId } } };
  };

  CASOS["remove de bloco é diferente de herda"] = async () => {
    const herda = rascunhoAjuste();
    herda.modo.fitilho = "herda";
    const resH = resolverCom(herda);

    const remove = rascunhoAjuste();
    remove.modo.fitilho = "remove";
    const recR = pjParaReceita(remove);
    const resR = resolverCom(remove);

    return { ok: resH.fitilho && resH.fitilho.comprimentoMm === 700
                 && resH.origem.fitilho.escopo === "familia"
                 && recR.fitilho_modo === "remove" && !("fitilho" in recR)
                 && resR.fitilho === null && resR.origem.fitilho.escopo === "sku"
                 && resR.origem.fitilho.modo === "remove",
             obtido: { herdado: resH.fitilho, removido: resR.fitilho,
                       origemRemovido: resR.origem.fitilho } };
  };

  CASOS["ajuste não materializa cópia da família"] = async () => {
    const r = rascunhoAjuste();
    r.cortes = [Object.assign(pjNovaOpCorte("ct_a", "substitui", 1), { comprimentoCm: "26" })];
    const rec = pjParaReceita(r);
    /* a família tem 2 cortes e 1 camada; o ajuste grava UMA linha, sem camada
       nenhuma, e sem repetir fita, tipo, quantidade ou identificação */
    const c = rec.cortes[0];
    return { ok: rec.cortes.length === 1 && (c.camadas || []).length === 0
                 && c.fita_id === null && c.tipo_corte === null && c.qtd === null
                 && c.identificacao === null && c.comprimento_mm === 260,
             obtido: c };
  };

  CASOS["reabrir um ajuste e salvar não inventa mudança"] = async () => {
    const banco = BANCO();
    /* a exceção vira um AJUSTE: muda só o comprimento de ct_b e remove nada */
    banco.pcp_projeto_corte_versao[2].cortes_modo = "ajusta";
    banco.pcp_projeto_corte_corte[2] = { id: "prj_sku_v2_ct_b", versao_id: "prj_sku_v2", chave: "ct_b",
      ordem: 1, operacao: "substitui", fita_id: null, comprimento_mm: 260, tipo_corte: null,
      qtd: null, identificacao: null };
    const B2 = await montarF({ corte_escrita: true }, banco);
    try {
      await pjCarregar();
      const r = pjRascunhoDe(pjAchar("prj_sku"));
      const op = r.cortes[0];
      const rec = pjParaReceita(r);
      const c = rec.cortes[0];
      return { ok: op.operacao === "substitui" && op.tipoCorte === "" && op.qtd === ""
                   && op.fitaId === "" && op.comprimentoCm === "26"
                   /* e a receita de volta é a MESMA: nada foi inventado */
                   && rec.cortes.length === 1 && c.chave === "ct_b" && c.operacao === "substitui"
                   && c.fita_id === null && c.tipo_corte === null && c.qtd === null
                   && c.comprimento_mm === 260 && c.ordem === 1
                   /* e nada material mudou, então não nasce versão nova */
                   && pjMudouMaterial(pjAchar("prj_sku"), rec) === false,
               obtido: { rascunho: op, receita: c } };
    } finally { await desmontar(B2); }
  };

  CASOS["reabrir um remove e salvar continua removendo"] = async () => {
    const banco = BANCO();
    banco.pcp_projeto_corte_versao[2].cortes_modo = "ajusta";
    banco.pcp_projeto_corte_corte[2] = { id: "prj_sku_v2_ct_b", versao_id: "prj_sku_v2", chave: "ct_b",
      ordem: 1, operacao: "remove", fita_id: null, comprimento_mm: null, tipo_corte: null,
      qtd: null, identificacao: null };
    const B2 = await montarF({ corte_escrita: true }, banco);
    try {
      await pjCarregar();
      const r = pjRascunhoDe(pjAchar("prj_sku"));
      const rec = pjParaReceita(r);
      return { ok: r.cortes[0].operacao === "remove" && rec.cortes[0].operacao === "remove"
                   && rec.cortes.length === 1,
               obtido: { rascunho: r.cortes[0].operacao, receita: rec.cortes[0].operacao } };
    } finally { await desmontar(B2); }
  };

  window.bateriaCorteProjetos = async function (opcoes) {
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
      resumo: `corte-projetos: ${res.length - falhas.length} ok · ${falhas.length} falhas`,
      falhas: falhas.map((x) => ({ caso: x.caso, obtido: x.obtido })),
      detalhes: o.detalhes ? res : undefined,
    };
  };
})();
