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
    /* a marca de "projetos já lidos" é do app; a bancada carrega os dela */
    PC_CARREGOU = false;

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
    PC_CARREGOU = false;
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

  /* A REGRA MUDOU NA v8.110, e este caso mudou com ela.
     Antes dizia "a gravação desligada não atrapalha — a liberação segue". Só
     que a fila é durável NAQUELE navegador: ela mora no `localStorage`. Liberar
     no computador da mesa com o congelamento ainda na fila, e imprimir no
     tablet, é o papel saindo sem que o vínculo exista para mais ninguém.
     Agora `na-fila` continua valendo para EDITAR e não vale para LIBERAR. */
  CASOS["com a gravação desligada, o papel sai mas a liberação não passa"] = async () => {
    const B = await montar({ corte_escrita: false });
    try {
      await pcVincular("r_1", "380");
      const r = await pcPrepararPapeis([PEDIDO()]);
      return { ok: r.podeLiberar === false && r.naFila.length === 1 && r.prontos.length === 0
                   && r.erros.length === 0            /* não é erro: é falta de confirmação */
                   && B.chamadas.length === 0
                   /* e nada se perde: o papel sai certo e a fila guardou tudo */
                   && pcBlocoPapel("r_1").includes("25 CM")
                   && cxPendentes().length === 2,
               obtido: { podeLiberar: r.podeLiberar, naFila: r.naFila,
                         prontos: r.prontos, fila: cxPendentes().length } };
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

  /* =========================================================================
     10 · OS TRÊS FLUXOS
     -------------------------------------------------------------------------
     São três portas e DOIS caminhos de código: o avulso e a aba Pedidos caem
     no mesmo `novoPedido`; a Demanda em lote cai no `criarPedidos`. O que
     precisa ser provado é que a decisão de um SKU nunca escorrega para o
     seguinte — e para isso ela tem de morar no SKU, nunca num estado de fora.

     O "porta-decisão" é só um objeto: `S.modal` no caminho 1, `grupos[gi]` no
     caminho 2. Quem lê é `pcEstadoDoSku(sku, decisao)`.
     ========================================================================= */
  CASOS["avulso: o SKU digitado resolve o projeto dele"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      const e = pcEstadoDoSku("380");
      return { ok: e.tem === true && e.projetoId === "prj_cmb" && e.versaoId === "prj_cmb_v1"
                   && e.escopo === "combinacao" && e.nome === "Combinação 380",
               obtido: e };
    } finally { await desmontar(B); }
  };

  CASOS["avulso: trocar o SKU não herda a decisão do SKU anterior"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      /* a pessoa escolheu "seguir sem projeto" com 380 na tela… */
      const porta = {};
      porta.corte = pcDecidirSem("380");
      const com380 = pcEstadoDoSku("380", porta.corte);
      /* …e então apagou e digitou 310. A decisão velha é de OUTRO SKU. */
      const com310 = pcEstadoDoSku("310", porta.corte);
      return { ok: com380.escolha === "sem"
                   && com310.escolha === null          /* não herdou */
                   && com310.tem === true && com310.projetoId === "prj_fam",
               obtido: { com380, com310 } };
    } finally { await desmontar(B); }
  };

  CASOS["aba Pedidos usa o mesmo caminho e chega ao mesmo estado"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      /* duas portas, dois porta-decisões independentes, o mesmo SKU */
      const daAbaPedidos = { corte: null };
      const daDemanda = { corte: pcDecidirSem("380") };
      const a = pcEstadoDoSku("380", daAbaPedidos.corte);
      const d = pcEstadoDoSku("380", daDemanda.corte);
      /* a RESOLUÇÃO é a mesma nas duas portas — o projeto que vale para o SKU
         não depende de por onde se entrou. O que difere é a DECISÃO: com
         "sem", projeto e versão saem nulos de propósito (149), e é isso que
         vai para o vínculo. */
      return { ok: a.tem === d.tem && a.nome === d.nome && a.escopo === d.escopo
                   && JSON.stringify(a.cadeia) === JSON.stringify(d.cadeia)
                   && a.escolha === null && a.projetoId === "prj_cmb"
                   && d.escolha === "sem" && d.projetoId === null,
               obtido: { abaPedidos: { escolha: a.escolha, projeto: a.projetoId, nome: a.nome },
                         demanda: { escolha: d.escolha, projeto: d.projetoId, nome: d.nome } } };
    } finally { await desmontar(B); }
  };

  CASOS["Demanda resolve cada SKU do lote individualmente"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      const grupos = [{ sku: "380" }, { sku: "310" }, { sku: "M02" }];
      const est = grupos.map((g) => pcEstadoDoSku(g.sku, g.corte));
      return { ok: est[0].projetoId === "prj_cmb" && est[1].projetoId === "prj_fam"
                   && est[2].tem === false && est[2].projetoId === null,
               obtido: est.map((e) => ({ sku: e.sku, projeto: e.projetoId, tem: e.tem })) };
    } finally { await desmontar(B); }
  };

  CASOS["projetos diferentes não se misturam entre grupos"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      const grupos = [{ sku: "380" }, { sku: "310" }];
      /* o segundo grupo é decidido; o primeiro não pode sentir nada */
      grupos[1].corte = pcDecidirProjeto("310", pcEstadoDoSku("310"));
      const a = pcEstadoDoSku(grupos[0].sku, grupos[0].corte);
      const b = pcEstadoDoSku(grupos[1].sku, grupos[1].corte);
      const sa = pcMontarSnapshot("380"), sb = pcMontarSnapshot("310");
      return { ok: a.escolha === null && b.escolha === "projeto"
                   && a.projetoId === "prj_cmb" && b.projetoId === "prj_fam"
                   /* e as receitas seguem diferentes: 25 cm contra 20 cm */
                   && sa.cortes[0].comprimentoMm === 250
                   && sb.cortes[0].comprimentoMm === 200,
               obtido: { g0: a, g1: b,
                         mm: [sa.cortes[0].comprimentoMm, sb.cortes[0].comprimentoMm] } };
    } finally { await desmontar(B); }
  };

  CASOS["origem=sem de um SKU não contamina o seguinte"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      const grupos = [{ sku: "380" }, { sku: "310" }, { sku: "M02" }];
      grupos[1].corte = pcDecidirSem("310");       /* só o do meio segue sem */
      const est = grupos.map((g) => pcEstadoDoSku(g.sku, g.corte));
      return { ok: est[0].escolha === null && est[0].tem === true
                   && est[1].escolha === "sem"
                   && est[2].escolha === null && est[2].tem === false,
               obtido: est.map((e) => ({ sku: e.sku, escolha: e.escolha, tem: e.tem })) };
    } finally { await desmontar(B); }
  };

  CASOS["a decisão mora no grupo: mexer no 1 não toca no 0"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      const grupos = [{ sku: "380" }, { sku: "310" }];
      grupos[0].corte = pcDecidirProjeto("380", pcEstadoDoSku("380"));
      const antes0 = JSON.stringify(grupos[0].corte);
      grupos[1].corte = pcDecidirSem("310");
      grupos[1].corte.projetoId = "estragado";      /* mexe à força no do lado */
      return { ok: JSON.stringify(grupos[0].corte) === antes0
                   && grupos[0].corte.projetoId === "prj_cmb",
               obtido: { g0: grupos[0].corte, g1: grupos[1].corte } };
    } finally { await desmontar(B); }
  };

  CASOS["a decisão vira vínculo com a origem certa em cada SKU"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      B.resposta = () => daRpc("ok", { revision: 1 });
      S.pedidos = [{ id: "r_a", numero: "0001", opId: "op_1", status: "papel", qtd: 5 },
                   { id: "r_b", numero: "0002", opId: "op_2", status: "papel", qtd: 5 }];
      S.ops = [{ id: "op_1", sku: "380", status: "em_producao" },
               { id: "op_2", sku: "310", status: "em_producao" }];
      if (typeof mudouDados === "function") mudouDados();
      await pcVincularDecidido("r_a", "380", pcDecidirProjeto("380", pcEstadoDoSku("380")));
      await pcVincularDecidido("r_b", "310", pcDecidirSem("310"));
      const a = pcVinculoDe("r_a"), b = pcVinculoDe("r_b");
      return { ok: a.origem === "combinacao" && a.projetoId === "prj_cmb"
                   && b.origem === "sem" && b.projetoId === null && b.versaoId === null,
               obtido: { r_a: a, r_b: b } };
    } finally { await desmontar(B); }
  };

  /* =========================================================================
     10b · TROCAR · escolha manual, só para ESTE pedido
     -------------------------------------------------------------------------
     A troca é mais um elo da cadeia — o último. Ela não altera regra nenhuma,
     não cria OP, e não encosta no pedido antes de ele existir: mora no mesmo
     rascunho da decisão de "seguir sem".
     ========================================================================= */
  CASOS["automático → Trocar → o projeto passa a ser o escolhido"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      const auto = pcEstadoDoSku("380");
      const porta = { corte: pcDecidirManual("380", "prj_fam") };
      const dep = pcEstadoDoSku("380", porta.corte);
      return { ok: auto.projetoId === "prj_cmb" && auto.escolha === null
                   && dep.projetoId === "prj_fam" && dep.escolha === "manual"
                   && dep.versaoId === "prj_fam_v1"
                   /* e a tela sabe oferecer a volta */
                   && dep.automatico && dep.automatico.projetoId === "prj_cmb",
               obtido: { auto: { p: auto.projetoId, e: auto.escolha },
                         manual: { p: dep.projetoId, v: dep.versaoId, e: dep.escolha,
                                   volta: dep.automatico && dep.automatico.projetoId } } };
    } finally { await desmontar(B); }
  };

  CASOS["o vínculo final grava origem=manual"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      B.resposta = () => daRpc("ok", { pedido_id: "r_1", revision: 1 });
      await pcVincularDecidido("r_1", "380", pcDecidirManual("380", "prj_fam"));
      const enviada = B.chamadas.find((c) => c.nome === "pcp_pedido_corte_vincular");
      const v = pcVinculoDe("r_1");
      return { ok: v.origem === "manual" && v.projetoId === "prj_fam"
                   && enviada && enviada.args.p_origem === "manual"
                   && enviada.args.p_projeto_id === "prj_fam",
               obtido: { vinculo: v, enviado: enviada && enviada.args } };
    } finally { await desmontar(B); }
  };

  CASOS["a versão escolhida é a que vai para o vínculo"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      B.resposta = () => daRpc("ok", { pedido_id: "r_1", revision: 1 });
      const d = pcDecidirManual("380", "prj_fam");
      await pcVincularDecidido("r_1", "380", d);
      const enviada = B.chamadas.find((c) => c.nome === "pcp_pedido_corte_vincular");
      return { ok: d.versaoId === "prj_fam_v1"
                   && enviada.args.p_versao_id === "prj_fam_v1"
                   && pcVinculoDe("r_1").versaoId === "prj_fam_v1",
               obtido: { naDecisao: d.versaoId, enviada: enviada.args.p_versao_id } };
    } finally { await desmontar(B); }
  };

  CASOS["trocar em um grupo da Demanda não altera outro"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      const grupos = [{ sku: "380" }, { sku: "310" }];
      /* o 380 resolve a combinação sozinho; aqui ele é trocado para a família */
      grupos[0].corte = pcDecidirManual("380", "prj_fam");
      const a = pcEstadoDoSku(grupos[0].sku, grupos[0].corte);
      const b = pcEstadoDoSku(grupos[1].sku, grupos[1].corte);
      return { ok: a.escolha === "manual" && a.projetoId === "prj_fam"
                   && a.automatico.projetoId === "prj_cmb"   /* era a combinação */
                   /* o grupo do lado nem foi tocado: sem decisão, resolvendo sozinho */
                   && grupos[1].corte === undefined
                   && b.escolha === null && b.projetoId === "prj_fam",
               obtido: { g0: { e: a.escolha, p: a.projetoId, auto: a.automatico.projetoId },
                         g1: { e: b.escolha, p: b.projetoId, decisao: grupos[1].corte } } };
    } finally { await desmontar(B); }
  };

  CASOS["trocar o SKU depois da escolha manual descarta a escolha"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      const porta = { corte: pcDecidirManual("380", "prj_fam") };
      /* a pessoa apaga o código e digita outro: a decisão é de OUTRO SKU */
      const novo = pcEstadoDoSku("310", porta.corte);
      /* e o vínculo também tem de ignorá-la, não levá-la adiante */
      B.resposta = () => daRpc("ok", { revision: 1 });
      await pcVincularDecidido("r_1", "310", porta.corte);
      const v = pcVinculoDe("r_1");
      return { ok: novo.escolha === null && novo.projetoId === "prj_fam"  /* 310 resolve família sozinho */
                   && v.origem === "familia" && v.origem !== "manual",
               obtido: { estado: { e: novo.escolha, p: novo.projetoId }, vinculo: v } };
    } finally { await desmontar(B); }
  };

  CASOS["o congelado imprime o snapshot da escolha manual"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      B.resposta = () => daRpc("ok", { pedido_id: "r_1", revision: 1 });
      await pcVincularDecidido("r_1", "380", pcDecidirManual("380", "prj_fam"));
      await pcCongelar("r_1", "380");
      const s = pcSnapshotDe("r_1");
      const papel = pcBlocoPapel("r_1");
      return { ok: s.projeto.id === "prj_fam" && s.escolhaManual === true
                   /* a família corta 20 cm; a combinação, 25 — o papel mostra o escolhido */
                   && s.cortes[0].comprimentoMm === 200
                   && papel.includes("20 CM") && !papel.includes("25 CM")
                   && papel.includes("Família 3xx"),
               obtido: { projeto: s.projeto, mm: s.cortes[0].comprimentoMm } };
    } finally { await desmontar(B); }
  };

  CASOS["editar o projeto escolhido não altera pedido já congelado"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      B.resposta = () => daRpc("ok", { revision: 1 });
      await pcVincularDecidido("r_1", "380", pcDecidirManual("380", "prj_fam"));
      await pcCongelar("r_1", "380");
      const antes = JSON.stringify(pcSnapshotDe("r_1"));
      const papelAntes = pcBlocoPapel("r_1");

      /* alguém publica uma versão nova da família DEPOIS do congelamento */
      const banco2 = B.banco;
      banco2.pcp_projeto_corte_corte[0].comprimento_mm = 999;
      await pjCarregar();

      return { ok: JSON.stringify(pcSnapshotDe("r_1")) === antes
                   && pcBlocoPapel("r_1") === papelAntes
                   && pcBlocoPapel("r_1").includes("20 CM")
                   && !pcBlocoPapel("r_1").includes("99,9 CM"),
               obtido: { mudou: JSON.stringify(pcSnapshotDe("r_1")) !== antes } };
    } finally { await desmontar(B); }
  };

  /* =========================================================================
     11 · A REGRA DE LIBERAÇÃO
     -------------------------------------------------------------------------
       confirmado pelo servidor → libera
       já congelado no servidor → libera
       na-fila / sem confirmação → NÃO libera
       conflito / erro           → NÃO libera
     ========================================================================= */
  CASOS["na-fila não libera papel→aberto"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      /* a rede caiu: a RPC não responde e a ação fica na fila */
      await pcVincular("r_1", "380");
      /* a forma que `pxResposta` traduz para "offline": a ação FICA na fila */
      B.resposta = () => ({ ok: false, erro: { tipo: "offline", msg: "sem rede" } });
      const r = await pcPrepararPapeis([PEDIDO()]);
      return { ok: r.podeLiberar === false && r.naFila.length === 1
                   && r.prontos.length === 0,
               obtido: { podeLiberar: r.podeLiberar, naFila: r.naFila, erros: r.erros } };
    } finally { await desmontar(B); }
  };

  CASOS["confirmação do servidor libera"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      B.resposta = () => daRpc("ok", { pedido_id: "r_1", revision: 1 });
      await pcVincular("r_1", "380");
      const r = await pcPrepararPapeis([PEDIDO()]);
      return { ok: r.podeLiberar === true && r.prontos.length === 1
                   && r.naFila.length === 0 && r.erros.length === 0
                   && pcConfirmado("r_1") === true,
               obtido: { podeLiberar: r.podeLiberar, prontos: r.prontos,
                         confirmado: pcConfirmado("r_1") } };
    } finally { await desmontar(B); }
  };

  CASOS["já congelado no servidor libera sem reenviar"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      /* o vínculo já está gravado e congelado — foi outra máquina que fez */
      B.banco.pcp_pedido_projeto_corte = [{ pedido_id: "r_1", projeto_id: "prj_cmb",
        versao_id: "prj_cmb_v1", origem: "combinacao", congelado_em: "2026-09-01T10:00:00Z",
        snapshot: { sku: "380", cortes: [] }, revision: 3 }];
      await pcCarregar(["r_1"]);
      const antes = B.chamadas.length;
      const r = await pcPrepararPapeis([PEDIDO()]);
      return { ok: r.podeLiberar === true && r.prontos.length === 1
                   && B.chamadas.length === antes        /* nada foi reenviado */
                   && cxPendentes().length === 0,
               obtido: { podeLiberar: r.podeLiberar, rpcsDepois: B.chamadas.length - antes,
                         fila: cxPendentes().length } };
    } finally { await desmontar(B); }
  };

  CASOS["conflito não libera"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      B.resposta = (nome) => (nome === "pcp_pedido_corte_congelar"
        ? daRpc("conflito", { pedido_id: "r_1", revision: 9 })
        : daRpc("ok", { pedido_id: "r_1", revision: 1 }));
      await pcVincular("r_1", "380");
      const r = await pcPrepararPapeis([PEDIDO()]);
      return { ok: r.podeLiberar === false && r.erros.length === 1
                   && r.erros[0].status === "conflito" && r.prontos.length === 0,
               obtido: { podeLiberar: r.podeLiberar, erros: r.erros } };
    } finally { await desmontar(B); }
  };

  CASOS["um pedido travado trava a liberação, e os outros continuam prontos"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      S.pedidos = [{ id: "r_a", numero: "0001", opId: "op_1", status: "papel", qtd: 5 },
                   { id: "r_b", numero: "0002", opId: "op_2", status: "papel", qtd: 5 }];
      S.ops = [{ id: "op_1", sku: "380", status: "em_producao" },
               { id: "op_2", sku: "310", status: "em_producao" }];
      if (typeof mudouDados === "function") mudouDados();
      B.resposta = (nome, args) => ((nome === "pcp_pedido_corte_congelar"
        && args && args.p_pedido_id === "r_b")
        ? daRpc("conflito", { pedido_id: "r_b", revision: 9 })
        : daRpc("ok", { revision: 1 }));
      await pcVincular("r_a", "380");
      await pcVincular("r_b", "310");
      const r = await pcPrepararPapeis(S.pedidos);
      return { ok: r.podeLiberar === false && r.prontos.length === 1
                   && r.prontos[0] === "r_a" && r.erros.length === 1
                   && r.erros[0].id === "r_b",
               obtido: { prontos: r.prontos, erros: r.erros.map((x) => x.id) } };
    } finally { await desmontar(B); }
  };

  /* =========================================================================
     12 · A TELA · o que era PENDENTE até a v8.110
     -------------------------------------------------------------------------
     A janela é desenhada DE VERDADE (`renderModal()`) num canto do documento,
     e o percurso é o mesmo que o clique faz.
     ========================================================================= */
  function pintarJanela() {
    let c = document.getElementById("bancada-corte-ped");
    if (!c) {
      if (document.querySelector(".ov"))
        throw new Error("há uma janela aberta na tela — feche antes de rodar esta bancada");
      c = document.createElement("div");
      c.id = "bancada-corte-ped";
      c.style.cssText = "position:absolute;left:-99999px;top:0;width:900px";
      document.body.appendChild(c);
    }
    c.innerHTML = renderModal();
    return c;
  }
  const limparJanela = () => { const c = document.getElementById("bancada-corte-ped"); if (c) c.remove(); };
  const campo = (sel) => document.querySelector("#bancada-corte-ped " + sel);

  CASOS["Novo pedido preserva o rascunho ao abrir o projeto"] = async () => {
    const B = await montar({ corte_escrita: true });
    const modalAntes = S.modal;
    try {
      S.modal = { tipo: "novoPedido", v: { sku: "380", qtd: "10" } };
      const c = pintarJanela();
      const temSecao = c.innerHTML.includes("PROJETO DE CORTE") && c.innerHTML.includes("Combinação 380");
      /* a pessoa digita a observação e só então clica em Ver projeto */
      campo("#np-obs").value = "laço duplo, fita clara";

      /* é exatamente o que `abrirPorCimaDaJanela` faz antes de trocar a janela */
      const debaixo = S.modal;
      debaixo.v = capturarNovoPedido();
      debaixo.__rascunho = colherDigitadoDaJanela();
      S.modal = { tipo: "projetoCorte", sku: "380", voltarPara: debaixo };
      pintarJanela();
      const abriuFicha = (document.getElementById("bancada-corte-ped").innerHTML || "").includes("Projeto de corte");

      /* Fechar: o `voltarPara` devolve a janela de baixo, e o rascunho volta */
      S.modal = S.modal.voltarPara;
      pintarJanela();
      janelaReporRascunhoDaVolta();

      return { ok: temSecao && abriuFicha
                   && campo("#np-obs").value === "laço duplo, fita clara"
                   && String(campo("#np-sku").value).toUpperCase() === "380"
                   && String(campo("#np-qtd").value) === "10",
               obtido: { temSecao, abriuFicha, obs: campo("#np-obs").value,
                         sku: campo("#np-sku").value, qtd: campo("#np-qtd").value } };
    } finally { limparJanela(); S.modal = modalAntes; await desmontar(B); }
  };

  CASOS["voltar da janela reavalia o projeto do SKU"] = async () => {
    const B = await montar({ corte_escrita: true });
    const modalAntes = S.modal;
    try {
      S.modal = { tipo: "novoPedido", v: { sku: "380", qtd: "10" } };
      let c = pintarJanela();
      const antes = c.innerHTML.includes("Combinação 380");

      /* de volta da janela, a pessoa troca o SKU: a seção tem de reavaliar */
      campo("#np-sku").value = "310";
      S.modal.v = capturarNovoPedido();
      c = pintarJanela();
      const depois = c.innerHTML.includes("Família 3xx") && !c.innerHTML.includes("Combinação 380");
      return { ok: antes && depois, obtido: { antes, depois } };
    } finally { limparJanela(); S.modal = modalAntes; await desmontar(B); }
  };

  CASOS["a decisão de seguir sem projeto sobrevive ao redesenho"] = async () => {
    const B = await montar({ corte_escrita: true });
    const modalAntes = S.modal;
    try {
      S.modal = { tipo: "novoPedido", v: { sku: "380", qtd: "10" } };
      pintarJanela();
      /* o clique em "Seguir sem projeto" grava no dono da decisão */
      S.modal.corte = pcDecidirSem("380");
      const c = pintarJanela();
      return { ok: c.innerHTML.includes("você escolheu seguir sem")
                   && !c.innerHTML.includes("Seguir sem projeto"),
               obtido: { temAviso: c.innerHTML.includes("você escolheu seguir sem") } };
    } finally { limparJanela(); S.modal = modalAntes; await desmontar(B); }
  };

  /* o clique REAL em `data-papel-ok`: o handler é global no documento, então um
     botão injetado aqui passa pelo mesmo caminho que o da tela de Pedidos */
  async function clicarPapelOk(pedidoId) {
    const c = document.getElementById("bancada-corte-ped") || (() => {
      const d = document.createElement("div"); d.id = "bancada-corte-ped";
      d.style.cssText = "position:absolute;left:-99999px;top:0"; document.body.appendChild(d); return d; })();
    c.innerHTML = `<button data-papel-ok="${pedidoId}">ok</button>`;
    c.querySelector("button").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  }

  CASOS["papel→aberto congela antes de mudar o status"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      B.resposta = () => daRpc("ok", { pedido_id: "r_1", revision: 1 });
      await pcVincular("r_1", "380");
      await clicarPapelOk("r_1");
      return { ok: PEDIDO().status === "aberto" && pcConfirmado("r_1") === true
                   /* e o snapshot existe ANTES do papel: o congelamento veio primeiro */
                   && !!pcSnapshotDe("r_1"),
               obtido: { status: PEDIDO().status, confirmado: pcConfirmado("r_1") } };
    } finally { limparJanela(); await desmontar(B); }
  };

  CASOS["papel→aberto NÃO acontece quando o congelamento não confirma"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      await pcVincular("r_1", "380");
      B.resposta = () => ({ ok: false, erro: { tipo: "offline", msg: "sem rede" } });
      await clicarPapelOk("r_1");
      return { ok: PEDIDO().status === "papel" && pcConfirmado("r_1") === false,
               obtido: { status: PEDIDO().status, confirmado: pcConfirmado("r_1") } };
    } finally { limparJanela(); await desmontar(B); }
  };

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
            + `${falhas.length} falhas`
            + (pendentes.length ? ` · ${pendentes.length} pendentes de tela` : ""),
      falhas: falhas.map((x) => ({ caso: x.caso, obtido: x.obtido })),
      pendentes: pendentes.map((x) => x.caso),
      detalhes: o.detalhes ? res : undefined,
    };
  };
})();
