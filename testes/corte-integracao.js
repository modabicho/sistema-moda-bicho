/* ===========================================================================
   BANCADA · integração do Projeto de Corte com o pedido
   ---------------------------------------------------------------------------
   Não fala com o Supabase: troca `persLer`, `persRpc` e as flags por versões de
   bancada e roda o código de verdade — `pcVincular`, `pcCongelar`,
   `pcPrepararPapeis`, `pcBlocoPapel`, e por baixo `pjResolver` e o modelo.

   O que esta bateria NÃO cobre ainda está aqui como caso PENDENTE (ok = null),
   com o nome do que falta. São os três que dependem da tela: o rascunho do Novo
   pedido, o voltar da janela e a transição papel→aberto. Eles entram quando a
   ligação da interface entrar — e ficam visíveis até lá, em vez de sumirem de
   uma lista que ninguém releu.

   A fila real do navegador é salva antes e devolvida no fim.

   Uso no console:
     (0, eval)(await (await fetch("testes/corte-integracao.js")).text());
     await bateriaCorteIntegracao();
   =========================================================================== */
(function () {
  const CHAVE = (typeof OUTBOX_CHAVE !== "undefined" ? OUTBOX_CHAVE : "pcp5:outbox");

  /* ---------- o banco de bancada ----------
     Família 3xx: corte de 20 cm na fita A + fitilho 70.
     Combinação 380: corte de 25 cm na fita B, herda o fitilho.
     Exceção 380.AD: ajusta o corte para 26 cm. */
  const BANCO = () => ({
    pcp_projeto_corte: [
      { id: "prj_fam", nome: "Família 3xx", escopo: "familia", ativo: true, versao_publicada_id: "prj_fam_v1", revision: 1 },
      { id: "prj_cmb", nome: "Combinação 380", escopo: "combinacao", ativo: true, versao_publicada_id: "prj_cmb_v1", revision: 1 },
    ],
    pcp_projeto_corte_regra: [
      { projeto_id: "prj_fam", campo: "sku", operador: "comeca", valor: "3", ordem: 1 },
      { projeto_id: "prj_cmb", campo: "sku", operador: "comeca", valor: "380", ordem: 1 },
    ],
    pcp_projeto_corte_versao: [
      { id: "prj_fam_v1", projeto_id: "prj_fam", versao: 1, cortes_modo: "substitui", fitilho_modo: "substitui", sortimento_modo: "herda" },
      { id: "prj_cmb_v1", projeto_id: "prj_cmb", versao: 1, cortes_modo: "substitui", fitilho_modo: "herda", sortimento_modo: "herda" },
    ],
    pcp_projeto_corte_corte: [
      { id: "f1", versao_id: "prj_fam_v1", chave: "ct_a", ordem: 1, operacao: "define",
        fita_id: "ft_1", comprimento_mm: 200, tipo_corte: "reto", qtd: 1, identificacao: "Laço" },
      { id: "c1", versao_id: "prj_cmb_v1", chave: "ct_b", ordem: 1, operacao: "define",
        fita_id: "ft_2", comprimento_mm: 250, tipo_corte: "45", qtd: 1, identificacao: "Laço 380" },
    ],
    pcp_projeto_corte_camada: [
      { corte_id: "c1", chave: "cm_x", ordem: 1, operacao: "define", fita_id: "ft_3",
        comprimento_mm: null, tipo_corte: "45", cortar_juntas: true, condicao: null },
    ],
    pcp_projeto_corte_fitilho: [{ versao_id: "prj_fam_v1", partes: 1, comprimento_mm: 700 }],
    pcp_projeto_corte_sortimento: [], pcp_projeto_corte_sortimento_item: [],
    pcp_corte_tipo: [{ codigo: "reto", rotulo: "Reto" }, { codigo: "45", rotulo: "45°" }],
    pcp_fita: [
      { id: "ft_1", nome: "Gorgurão vermelho", codigo: "G-9012", numero: "9", largura_mm: 22,
        cor: "vermelho", estampa: "lisa", local: "Prateleira 3", editado: {}, revision: 1 },
      { id: "ft_2", nome: "Cetim branco", codigo: "C-0501", numero: "5", largura_mm: 12,
        cor: "branco", estampa: "lisa", local: "Caixa 13", editado: {}, revision: 1 },
      { id: "ft_3", nome: "Xadrez preto", codigo: "X-2201", numero: "12", largura_mm: 22,
        cor: "preto", estampa: "estampada", local: "Caixa 7", editado: {}, revision: 1 },
    ],
    pcp_pedido_projeto_corte: [],
  });

  async function montar(flags, banco) {
    const salvo = { outbox: localStorage.getItem(CHAVE), janela: {},
      pedidos: S.pedidos, ops: S.ops, produtos: S.produtos };
    const trocar = (nome, fn) => { salvo.janela[nome] = window[nome]; window[nome] = fn; };
    localStorage.removeItem(CHAVE);
    PC_VINCULOS = new Map();

    const B = { chamadas: [], banco: banco || BANCO(), resposta: null, salvo };
    trocar("persRpc", async (nome, args) => {
      B.chamadas.push({ nome, args });
      return B.resposta ? B.resposta(nome, args) : { ok: true, corpo: { status: "ok" } };
    });
    trocar("persLer", async (caminho) => {
      const tabela = String(caminho).split("?")[0];
      if (tabela === "pcp_flag") {
        return { ok: true, corpo: Object.entries(flags || {}).map(([nome, ligada]) => ({ nome, ligada })) };
      }
      return { ok: true, corpo: (B.banco[tabela] || []).slice() };
    });

    /* um pedido e uma OP de bancada: o SKU do pedido vem da OP, como no app */
    S.ops = [{ id: "op_1", sku: "380", status: "em_producao" }];
    S.pedidos = [{ id: "r_1", numero: "0001", opId: "op_1", status: "papel", qtd: 10 }];
    S.produtos = [{ sku: "380", descricao: "Laço duplo", categoria: "Laços" },
                  { sku: "M02", descricao: "Tiara", categoria: "Tiaras" }];

    /* `opPorId` lê um índice cacheado por rev/ciclo/tamanho das listas
       (componentes/tabela.js). Trocar S.ops por um array novo do mesmo tamanho
       não invalida nada, e a bancada lia a OP do caso anterior. `mudouDados()`
       é o mesmo aviso que o app dá quando grava. */
    if (typeof mudouDados === "function") mudouDados();
    await telaFlagsCarregar();
    await pjCarregar();
    await ftCarregar();
    return B;
  }
  async function desmontar(B) {
    for (const [nome, fn] of Object.entries(B.salvo.janela)) {
      if (fn === undefined) delete window[nome]; else window[nome] = fn;
    }
    S.pedidos = B.salvo.pedidos; S.ops = B.salvo.ops; S.produtos = B.salvo.produtos;
    if (B.salvo.outbox == null) localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, B.salvo.outbox);
    PC_VINCULOS = new Map();
    try { await telaFlagsCarregar(); } catch (e) {}
  }
  const daRpc = (status, extra) => ({ ok: true, corpo: Object.assign({ status }, extra || {}) });
  const PEDIDO = () => S.pedidos[0];

  const CASOS = {};

  /* ---------- 1 · resolução ---------- */
  CASOS["o SKU do pedido resolve o projeto certo"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      const sku = pcSkuDoPedido(PEDIDO());
      const r = pcResolver(sku);
      return { ok: sku === "380" && !!r && r.projetoId === "prj_cmb" && r.escopo === "combinacao"
                   && r.versaoId === "prj_cmb_v1",
               obtido: { sku, projeto: r && r.projetoId, escopo: r && r.escopo } };
    } finally { await desmontar(B); }
  };

  CASOS["família < combinação < SKU, bloco a bloco"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      const s = pcMontarSnapshot("380");
      const s310 = pcMontarSnapshot("310");
      return { ok: s.cortes.length === 1 && s.cortes[0].comprimentoMm === 250
                   && s.cortes[0].fita.numero === "5"
                   /* o fitilho continua vindo da família */
                   && s.fitilho && s.fitilho.comprimentoMm === 700
                   && s310.cortes[0].comprimentoMm === 200,
               obtido: { c380: s.cortes[0].comprimentoMm, fitilho: s.fitilho, c310: s310.cortes[0].comprimentoMm } };
    } finally { await desmontar(B); }
  };

  /* ---------- 2 · OP ---------- */
  CASOS["a OP continua vindo de opAtivaDe(sku)"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      const opsAntes = JSON.stringify(S.ops);
      await pcVincular("r_1", "380");
      await pcCongelar("r_1", "380");
      const op = opAtivaDe("380");
      return { ok: JSON.stringify(S.ops) === opsAntes && !!op && op.id === "op_1"
                   /* e nenhuma chamada do corte falou de OP */
                   && !B.chamadas.some((c) => /op/i.test(c.nome) && !/corte/.test(c.nome)),
               obtido: { ops: S.ops.length, op: op && op.id, rpcs: B.chamadas.map((c) => c.nome) } };
    } finally { await desmontar(B); }
  };

  /* ---------- 3 · vínculo ---------- */
  CASOS["o vínculo aponta para o projeto e a versão do momento"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      B.resposta = () => daRpc("ok", { pedido_id: "r_1", revision: 1 });
      const r = await pcVincular("r_1", "380");
      const env = B.chamadas[0].args;
      return { ok: r.status === "ok" && B.chamadas[0].nome === "pcp_pedido_corte_vincular"
                   && env.p_projeto_id === "prj_cmb" && env.p_versao_id === "prj_cmb_v1"
                   && env.p_origem === "combinacao",
               obtido: env };
    } finally { await desmontar(B); }
  };

  CASOS["vincular duas vezes não duplica"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      B.resposta = () => daRpc("ok", { pedido_id: "r_1", revision: 1 });
      await pcVincular("r_1", "380");
      await pcVincular("r_1", "380");
      const vinculos = B.chamadas.filter((c) => c.nome === "pcp_pedido_corte_vincular");
      const ids = new Set(vinculos.map((c) => c.args.p_operation_id));
      return { ok: PC_VINCULOS.size === 1 && ids.size === vinculos.length
                   && vinculos.every((c) => c.args.p_pedido_id === "r_1"),
               obtido: { cache: PC_VINCULOS.size, chamadas: vinculos.length } };
    } finally { await desmontar(B); }
  };

  /* ---------- 4 · congelamento ---------- */
  CASOS["congelar é idempotente: a segunda vez não reenvia"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      B.resposta = () => daRpc("ok", { pedido_id: "r_1", ja_congelado: false });
      await pcVincular("r_1", "380");
      const um = await pcCongelar("r_1", "380");
      const nDepoisDoPrimeiro = B.chamadas.filter((c) => c.nome === "pcp_pedido_corte_congelar").length;
      const dois = await pcCongelar("r_1", "380");
      const nFinal = B.chamadas.filter((c) => c.nome === "pcp_pedido_corte_congelar").length;
      return { ok: um.status === "ok" && dois.jaCongelado === true
                   && nDepoisDoPrimeiro === 1 && nFinal === 1,
               obtido: { primeira: um.status, segunda: dois, chamadas: nFinal } };
    } finally { await desmontar(B); }
  };

  CASOS["o snapshot guarda a fita inteira, não só o id"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      await pcVincular("r_1", "380");
      await pcCongelar("r_1", "380");
      const s = pcSnapshotDe("r_1");
      const f = s.cortes[0].fita;
      return { ok: f.numero === "5" && f.nome === "Cetim branco" && f.local === "Caixa 13"
                   && f.codigo === "C-0501" && s.cortes[0].camadas[0].fita.numero === "12",
               obtido: f };
    } finally { await desmontar(B); }
  };

  /* ---------- 5 · a regra do histórico ---------- */
  CASOS["mexer no projeto depois NÃO muda o pedido congelado"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      await pcVincular("r_1", "380");
      await pcCongelar("r_1", "380");
      const antes = pcSnapshotDe("r_1").cortes[0].comprimentoMm;
      const papelAntes = pcBlocoPapel("r_1");

      /* a regra muda: 25 cm viram 40 cm, e a fita vira outra */
      const banco2 = BANCO();
      banco2.pcp_projeto_corte_corte[1].comprimento_mm = 400;
      banco2.pcp_projeto_corte_corte[1].fita_id = "ft_1";
      banco2.pcp_projeto_corte_versao[1].id = "prj_cmb_v2";
      banco2.pcp_projeto_corte_corte[1].versao_id = "prj_cmb_v2";
      banco2.pcp_projeto_corte_camada[0].corte_id = "c1";
      banco2.pcp_projeto_corte_versao[1].versao = 2;
      B.banco = banco2;
      await pjCarregar();

      const agora = pcResolver("380");
      const depois = pcSnapshotDe("r_1").cortes[0].comprimentoMm;
      const papelDepois = pcBlocoPapel("r_1");

      return { ok: antes === 250 && depois === 250 && papelAntes === papelDepois
                   /* e o projeto vigente REALMENTE mudou: a prova não é trivial */
                   && agora.versaoId === "prj_cmb_v2"
                   && pcMontarSnapshot("380").cortes[0].comprimentoMm === 400,
               obtido: { snapshotAntes: antes, snapshotDepois: depois,
                         vigenteAgora: pcMontarSnapshot("380").cortes[0].comprimentoMm,
                         papelIgual: papelAntes === papelDepois } };
    } finally { await desmontar(B); }
  };

  CASOS["o papel lê o snapshot, não o projeto vigente"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      await pcVincular("r_1", "380");
      await pcCongelar("r_1", "380");
      const banco2 = BANCO();
      banco2.pcp_fita[1].local = "MUDOU DE LUGAR";
      banco2.pcp_fita[1].nome = "Outro nome";
      B.banco = banco2;
      await ftCarregar();

      const papel = pcBlocoPapel("r_1");
      /* o papel é todo em caixa alta: é assim que se lê a dois palmos da
         bancada, e é o que o protótipo aprovado faz */
      return { ok: papel.includes("CAIXA 13") && papel.includes("CETIM BRANCO")
                   && !papel.includes("MUDOU DE LUGAR"),
               obtido: { temLugarAntigo: papel.includes("CAIXA 13"),
                         temLugarNovo: papel.includes("MUDOU DE LUGAR") } };
    } finally { await desmontar(B); }
  };

  /* ---------- 6 · o papel não fala de herança ---------- */
  CASOS["o papel mostra receita final, sem herda/substitui/ajusta"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      await pcVincular("r_1", "380");
      await pcCongelar("r_1", "380");
      const papel = pcBlocoPapel("r_1");
      /* o NOME da regra pode aparecer (o protótipo imprime "nome · v3", e é o
         que deixa rastrear a receita). O que não pode é o vocabulário de
         herança e a origem por bloco — isso é assunto de quem administra. */
      const proibidas = ["herda", "substitui", "ajusta", "herdado", "origem", "escopo"];
      return { ok: papel.includes("PROJETO DE CORTE") && papel.includes("CORTE 1")
                   && papel.includes("Nº 5") && papel.includes("25 CM")
                   && papel.includes("SOBREPOSTA") && papel.includes("CORTAR JUNTAS")
                   && papel.includes("FITILHO") && papel.includes("70 CM")
                   && !proibidas.some((p) => papel.includes(p)),
               obtido: { achou: proibidas.filter((p) => papel.includes(p)) } };
    } finally { await desmontar(B); }
  };

  /* ---------- 7 · sem projeto, por escolha ---------- */
  CASOS["pedido explicitamente sem projeto grava origem=sem"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      B.resposta = () => daRpc("ok", { pedido_id: "r_1", revision: 1, origem: "sem" });
      const r = await pcSemProjeto("r_1");
      const env = B.chamadas[0].args;
      return { ok: r.status === "ok" && env.p_origem === "sem"
                   && env.p_projeto_id === null && env.p_versao_id === null,
               obtido: env };
    } finally { await desmontar(B); }
  };

  CASOS["sem projeto: congela com sem_projeto e o papel não tem bloco"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      await pcSemProjeto("r_1");
      await pcCongelar("r_1", "380");
      const env = B.chamadas.find((c) => c.nome === "pcp_pedido_corte_congelar").args;
      return { ok: env.p_snapshot.sem_projeto === true && pcBlocoPapel("r_1") === ""
                   && pcResumo("r_1") === "sem Projeto de Corte",
               obtido: { snapshot: env.p_snapshot, papel: pcBlocoPapel("r_1") } };
    } finally { await desmontar(B); }
  };

  CASOS["SKU sem projeto nenhum não trava a liberação"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      S.ops[0].sku = "M02";                    /* M02 não casa com nenhuma regra */
      if (typeof mudouDados === "function") mudouDados();
      const r = await pcPrepararPapeis([PEDIDO()]);
      return { ok: r.podeLiberar === true && r.semProjeto.length === 1
                   && r.pendentes.length === 0 && r.erros.length === 0
                   && B.chamadas.length === 0,
               obtido: r };
    } finally { await desmontar(B); }
  };

  /* ---------- 8 · liberar ---------- */
  CASOS["pedido que deveria ter projeto e não tem vínculo fica PENDENTE"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      const r = await pcPrepararPapeis([PEDIDO()]);
      return { ok: r.podeLiberar === false && r.pendentes.length === 1
                   && r.pendentes[0].sku === "380" && r.erros.length === 0
                   /* e NADA foi congelado às escondidas */
                   && B.chamadas.length === 0 && !pcCongelado("r_1"),
               obtido: r };
    } finally { await desmontar(B); }
  };

  CASOS["falha no congelamento impede a liberação"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      B.resposta = (nome) => (nome === "pcp_pedido_corte_congelar"
        ? daRpc("conflito", { pedido_id: "r_1", revision: 9 })
        : daRpc("ok", { pedido_id: "r_1", revision: 1 }));
      await pcVincular("r_1", "380");
      const r = await pcPrepararPapeis([PEDIDO()]);
      return { ok: r.podeLiberar === false && r.erros.length === 1
                   && r.erros[0].status === "conflito" && r.prontos.length === 0,
               obtido: r };
    } finally { await desmontar(B); }
  };

  CASOS["com a gravação desligada, a liberação segue e nada se perde"] = async () => {
    const B = await montar({ corte_escrita: false });
    try {
      await pcVincular("r_1", "380");
      const r = await pcPrepararPapeis([PEDIDO()]);
      return { ok: r.podeLiberar === true && r.prontos.length === 1
                   && B.chamadas.length === 0
                   /* o papel sai certo mesmo sem o servidor ter recebido */
                   && pcBlocoPapel("r_1").includes("25 CM")
                   && cxPendentes().length === 2,
               obtido: { podeLiberar: r.podeLiberar, fila: cxPendentes().length } };
    } finally { await desmontar(B); }
  };

  /* ---------- 9 · o pedido não é tocado ---------- */
  CASOS["nada disto escreve no pedido"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      const antes = JSON.stringify(S.pedidos);
      await pcVincular("r_1", "380");
      await pcCongelar("r_1", "380");
      await pcPrepararPapeis([PEDIDO()]);
      const rpcsDePedido = B.chamadas.filter((c) => /^pcp_pedido_(criar|patch|apagar|arquivar)/.test(c.nome));
      return { ok: JSON.stringify(S.pedidos) === antes && rpcsDePedido.length === 0,
               obtido: { pedidoIgual: JSON.stringify(S.pedidos) === antes,
                         rpcs: B.chamadas.map((c) => c.nome) } };
    } finally { await desmontar(B); }
  };

  CASOS["salvar o projeto não salva o pedido"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      B.resposta = () => daRpc("ok", { projeto_id: "prj_cmb", revision: 2 });
      const antes = JSON.stringify(S.pedidos);
      const r = pjRascunhoDe(pjAchar("prj_cmb"));
      r.cortes[0].comprimentoCm = "30";
      await pjSalvar(r);
      const rpcs = B.chamadas.map((c) => c.nome);
      return { ok: JSON.stringify(S.pedidos) === antes
                   && rpcs.includes("pcp_projeto_corte_salvar")
                   && !rpcs.some((n) => n.indexOf("pcp_pedido") === 0),
               obtido: { pedidoIgual: JSON.stringify(S.pedidos) === antes, rpcs } };
    } finally { await desmontar(B); }
  };

  /* ---------- 10 · o que ainda depende da tela ---------- */
  const PENDENTE = (o) => ({ ok: null, obtido: o });
  CASOS["PENDENTE · Novo pedido preserva o rascunho ao abrir o projeto"] = async () =>
    PENDENTE("entra quando a seção do Novo pedido for ligada (abrirPorCimaDaJanela + capturarNovoPedido)");
  CASOS["PENDENTE · voltar da janela reavalia o projeto do SKU"] = async () =>
    PENDENTE("entra com janelaReporRascunhoDaVolta + a repintura da seção");
  CASOS["PENDENTE · papel→aberto congela antes de mudar o status"] = async () =>
    PENDENTE("entra ao ligar cadastros.js (gerar-papeis) e clique.js (data-papel-ok)");

  window.bateriaCorteIntegracao = async function (opcoes) {
    const o = opcoes || {};
    const nomes = o.casos || Object.keys(CASOS);
    const res = [];
    for (const n of nomes) {
      let r;
      try { r = await CASOS[n](); }
      catch (e) { r = { ok: false, obtido: String((e && e.stack) || e) }; }
      res.push(Object.assign({ caso: n }, r));
    }
    const falhas = res.filter((x) => x.ok === false);
    const pendentes = res.filter((x) => x.ok === null);
    return {
      versao: typeof VERSAO !== "undefined" ? VERSAO : "?",
      resumo: `corte-integracao: ${res.length - falhas.length - pendentes.length} ok · `
            + `${falhas.length} falhas · ${pendentes.length} pendentes de tela`,
      falhas: falhas.map((x) => ({ caso: x.caso, obtido: x.obtido })),
      pendentes: pendentes.map((x) => x.caso),
      detalhes: o.detalhes ? res : undefined,
    };
  };
})();
