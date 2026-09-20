/* ===========================================================================
   BANCADA · persistência do corte (fila, dreno, flag, conflito)
   ---------------------------------------------------------------------------
   Não fala com o Supabase: troca a porta do servidor (`persRpc`, `persLer`) e
   a leitura de flag (`telaFlag`) por versões de bancada, e roda o código de
   verdade do app — `cxEnfileirar`, `cxDrenar`, `cxEnviar`, `pxDrenar`,
   `ftSalvar`, `ftApagar`.

   A fila real do navegador é salva antes e devolvida no fim: uma bateria não
   pode comer a intenção de ninguém.

   O que ela prova, ponto a ponto, está na lista de CASOS no fim do arquivo.

   Uso no console:
     (0, eval)(await (await fetch("testes/corte-persistencia.js")).text());
     await bateriaCortePersistencia();
   =========================================================================== */
(function () {
  const CHAVE = (typeof OUTBOX_CHAVE !== "undefined" ? OUTBOX_CHAVE : "pcp5:outbox");

  /* As flags são ligadas pelo CAMINHO REAL: `telaFlag` é um `const` no
     bundle, não uma declaração, e trocá-lo em `window` não teria efeito
     nenhum (foi o que a primeira rodada desta bateria mostrou). Então a
     bancada devolve as linhas de `pcp_flag` pelo `persLer` falso e manda o
     app carregar as flags como ele carrega de verdade. */
  async function montar(flags) {
    const salvo = { outbox: localStorage.getItem(CHAVE), janela: {}, pedidos: S && S.pedidos };
    const trocar = (nome, fn) => { salvo.janela[nome] = window[nome]; window[nome] = fn; };
    localStorage.removeItem(CHAVE);

    const B = { chamadas: [], leituras: [], linhas: [], resposta: null, salvo };

    trocar("persRpc", async (nome, args) => {
      B.chamadas.push({ nome, args });
      return B.resposta ? B.resposta(nome, args) : { ok: true, corpo: { status: "ok" } };
    });
    trocar("persLer", async (caminho) => {
      B.leituras.push(caminho);
      if (String(caminho).indexOf("pcp_flag") === 0) {
        return { ok: true, corpo: Object.entries(flags || {}).map(([nome, ligada]) => ({ nome, ligada })) };
      }
      return { ok: true, corpo: B.linhas };
    });
    await telaFlagsCarregar();
    return B;
  }
  async function desmontar(B) {
    for (const [nome, fn] of Object.entries(B.salvo.janela)) {
      if (fn === undefined) delete window[nome]; else window[nome] = fn;
    }
    if (B.salvo.outbox == null) localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, B.salvo.outbox);
    /* devolve as flags de verdade; sem sessão isso as deixa nulas, que é o
       mesmo lado seguro de antes da bateria */
    try { await telaFlagsCarregar(); } catch (e) {}
  }

  /* respostas de bancada, no formato que `persFetch` devolve */
  const ok       = (corpo) => ({ ok: true, corpo: corpo || { status: "ok" } });
  const offline  = () => ({ ok: false, status: 0, corpo: null, erro: { tipo: "offline", msg: "sem rede" } });
  const daRpc    = (status, extra) => ok(Object.assign({ status }, extra || {}));

  const CASOS = {};

  /* ---------- 1 · a partição das duas filas ---------- */
  CASOS["parte as filas por prefixo"] = async () => {
    const certos = ["corte_fita_salvar", "corte_congelar"].every(cxEhCorte);
    const errados = ["pedido_patch", "pedido_criar", "", null, "corte"].some(cxEhCorte);
    return { ok: certos && !errados, obtido: { certos, errados } };
  };

  /* ---------- 2 · pxDrenar não leva ação de corte ---------- */
  CASOS["pxDrenar ignora corte_*"] = async () => {
    const B = await montar({ corte_escrita: true, pedidos_linha_escrita: true });
    try {
      B.resposta = () => ok({ status: "ok" });
      cxEnfileirar("corte_fita_salvar", "ft_1", { p_dados: { id: "ft_1", nome: "A" } });
      obEnfileirar("pedido_patch", "r1", { p_id: "r1", p_expected_revision: 1, p_patch: { qtd: 2 } });

      await pxDrenar();
      const nomes = B.chamadas.map((c) => c.nome);
      const fitaAindaNaFila = cxPendentes().length === 1;
      return { ok: nomes.length === 1 && nomes[0] === "pcp_pedido_patch" && fitaAindaNaFila,
               obtido: { nomes, pendentesDeCorte: cxPendentes().length } };
    } finally { await desmontar(B); }
  };

  /* ---------- 3 · cxDrenar não leva ação de pedido ---------- */
  CASOS["cxDrenar ignora o que não é corte"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      B.resposta = () => ok({ status: "ok" });
      obEnfileirar("pedido_patch", "r1", { p_id: "r1" });
      cxEnfileirar("corte_fita_salvar", "ft_1", { p_dados: { id: "ft_1", nome: "A" } });

      const r = await cxDrenar();
      const nomes = B.chamadas.map((c) => c.nome);
      const pedidoIntacto = obPendentes().some((a) => a.tipo === "pedido_patch");
      return { ok: nomes.length === 1 && nomes[0] === "pcp_fita_salvar"
                   && r.feitas.length === 1 && pedidoIntacto,
               obtido: { nomes, feitas: r.feitas.length, pedidoIntacto } };
    } finally { await desmontar(B); }
  };

  /* ---------- 4 · flag desligada: nada sai para a rede ---------- */
  CASOS["corte_escrita desligada não toca na rede"] = async () => {
    const B = await montar({ corte_escrita: false });
    try {
      cxEnfileirar("corte_fita_salvar", "ft_1", { p_dados: { id: "ft_1", nome: "A" } });
      const r = await cxDrenar();
      return { ok: r.status === "desligado" && B.chamadas.length === 0 && r.restam === 1
                   && cxPendentes().length === 1,
               obtido: { status: r.status, chamadas: B.chamadas.length, restam: r.restam } };
    } finally { await desmontar(B); }
  };

  /* ---------- 5 · só o confirmado sai da fila ---------- */
  CASOS["ok tira da fila, conflito não"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      cxEnfileirar("corte_fita_salvar", "ft_ok", { p_dados: { id: "ft_ok", nome: "A" } });
      cxEnfileirar("corte_fita_salvar", "ft_cf", { p_dados: { id: "ft_cf", nome: "B" } });
      B.resposta = (nome, args) => (args.p_dados.id === "ft_ok"
        ? daRpc("ok", { id: "ft_ok", revision: 1 })
        : daRpc("conflito", { id: "ft_cf", revision: 7 }));

      const r = await cxDrenar();
      const paradas = cxParadas();
      return { ok: r.feitas.length === 1 && paradas.length === 1
                   && paradas[0].entidadeId === "ft_cf" && paradas[0].ultimoErro === "conflito"
                   && cxPendentes().length === 0,
               obtido: { feitas: r.feitas.length, paradas: paradas.map((p) => p.entidadeId) } };
    } finally { await desmontar(B); }
  };

  /* ---------- 6 · offline devolve a ação inteira para a fila ---------- */
  CASOS["offline não perde e não insiste"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      cxEnfileirar("corte_fita_salvar", "ft_1", { p_dados: { id: "ft_1", nome: "A" } });
      cxEnfileirar("corte_fita_salvar", "ft_2", { p_dados: { id: "ft_2", nome: "B" } });
      B.resposta = () => offline();

      const r = await cxDrenar();
      const pend = cxPendentes();
      return { ok: B.chamadas.length === 1 && pend.length === 2
                   && pend.every((a) => a.estado === "pendente") && r.restam === 2,
               obtido: { chamadas: B.chamadas.length, pendentes: pend.length } };
    } finally { await desmontar(B); }
  };

  /* ---------- 7 · invalido mantém o mesmo operation_id ---------- */
  CASOS["invalido para a ação e guarda o id"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      const acao = cxEnfileirar("corte_fita_salvar", "ft_1", { p_dados: { id: "ft_1" } });
      B.resposta = () => daRpc("invalido", { motivo: "nome obrigatorio" });
      await cxDrenar();

      const parada = cxParadas()[0];
      const mesmoId = parada && parada.opId === acao.opId;

      /* corrigir e reenviar com o MESMO id: o servidor aceita, porque
         validação recusada não registra operação (147, §14) */
      obAtualizar(acao.opId, { estado: "pendente",
        dados: { p_dados: { id: "ft_1", nome: "Corrigida" } } });
      B.resposta = () => daRpc("ok", { id: "ft_1", revision: 1 });
      const r2 = await cxDrenar();
      const enviouMesmoId = B.chamadas[1] && B.chamadas[1].args.p_operation_id === acao.opId;

      return { ok: mesmoId && enviouMesmoId && r2.feitas.length === 1 && cxPendentes().length === 0,
               obtido: { mesmoId, enviouMesmoId, feitas: r2.feitas.length } };
    } finally { await desmontar(B); }
  };

  /* ---------- 8 · reuso exige intenção nova, com id novo ---------- */
  CASOS["operacao-reutilizada nasce de novo com id novo"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      const acao = cxEnfileirar("corte_fita_salvar", "ft_1", { p_dados: { id: "ft_1", nome: "A" } });
      B.resposta = () => daRpc("operacao-reutilizada");
      await cxDrenar();
      const parou = cxParadas()[0] && cxParadas()[0].ultimoErro === "operacao-reutilizada";

      const nova = cxNovaIntencao(acao.opId, { p_dados: { id: "ft_1", nome: "B" } });
      const idNovo = nova && nova.opId !== acao.opId && nova.substituiu === acao.opId;
      const velhaSumiu = !obLer().some((a) => a.opId === acao.opId);

      B.resposta = () => daRpc("ok", { id: "ft_1", revision: 2 });
      const r = await cxDrenar();
      return { ok: parou && idNovo && velhaSumiu && r.feitas.length === 1,
               obtido: { parou, idNovo, velhaSumiu, feitas: r.feitas.length } };
    } finally { await desmontar(B); }
  };

  /* ---------- 9 · tipo desconhecido não gira para sempre ---------- */
  CASOS["tipo desconhecido não volta à fila pendente"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      obEnfileirar("corte_coisa_nenhuma", "x", {});
      const r = await cxDrenar();
      return { ok: B.chamadas.length === 0 && cxPendentes().length === 0 && cxParadas().length === 1,
               obtido: { chamadas: B.chamadas.length, paradas: cxParadas().length, r: r.status } };
    } finally { await desmontar(B); }
  };

  /* ---------- 10 · a fita: leitura, mapa e busca ---------- */
  CASOS["fita vai e volta pelo mapa de campos"] = async () => {
    const B = await montar({ corte_escrita: false });
    try {
      B.linhas = [
        { id: "ft_a", nome: "Gorgurão 9", codigo: "G09", numero: "9", largura_mm: 22,
          cor: "vermelho", estampa: "lisa", local: "Prateleira 3", fornecedor: "Gitex",
          foto_path: null, ativo: true, editado: {}, revision: 3 },
        { id: "ft_b", nome: "Cetim branco", codigo: "C01", numero: "5", largura_mm: 12,
          cor: "branco", estampa: "lisa", local: "Caixa 13", fornecedor: "Gitex",
          foto_path: null, ativo: true, editado: {}, revision: 1 },
      ];
      const r = await ftCarregar();
      const a = ftAchar("ft_a");
      const srv = ftParaServidor(a);
      const achouPorCor = ftBuscar("vermelho").length === 1;
      const achouPorLugar = ftBuscar("caixa 13").length === 1;
      const doisTermos = ftBuscar("gitex branco").length === 1;
      const naoAcha = ftBuscar("fita que não existe").length === 0;

      return { ok: r.status === "ok" && ftQuantas() === 2
                   && a.larguraMm === 22 && a.revision === 3
                   && srv.largura_mm === 22 && srv.foto_path === null
                   && achouPorCor && achouPorLugar && doisTermos && naoAcha,
               obtido: { quantas: ftQuantas(), larguraMm: a.larguraMm,
                         achouPorCor, achouPorLugar, doisTermos, naoAcha } };
    } finally { await desmontar(B); }
  };

  /* ---------- 11 · validação antes da fila ---------- */
  CASOS["fita inválida não vira ação"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      const r1 = await ftSalvar({ nome: "" });
      const r2 = await ftSalvar({ nome: "X", larguraMm: 0 });
      const r3 = await ftSalvar({ nome: "X", estampa: "xadrez" });
      return { ok: r1.status === "invalido" && r2.status === "invalido" && r3.status === "invalido"
                   && obLer().length === 0 && B.chamadas.length === 0,
               obtido: { r1: r1.motivo, r2: r2.motivo, r3: r3.motivo, fila: obLer().length } };
    } finally { await desmontar(B); }
  };

  /* ---------- 12 · salvar manda a revisão esperada e marca o que foi à mão ---------- */
  CASOS["salvar leva expected_revision e marca editado"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      B.linhas = [{ id: "ft_a", nome: "Antiga", cor: "azul", classe: null, local: null,
                    editado: { cor: true }, revision: 4 }];
      await ftCarregar();
      B.resposta = () => daRpc("ok", { id: "ft_a", revision: 5 });

      const r = await ftSalvar({ id: "ft_a", nome: "Nova", cor: "azul" }, ["nome"]);
      const env = B.chamadas[0].args;
      return { ok: r.status === "ok" && env.p_expected_revision === 4
                   && env.p_dados.nome === "Nova"
                   && env.p_dados.editado.cor === true && env.p_dados.editado.nome === true
                   && ftAchar("ft_a").nome === "Nova",
               obtido: { rev: env.p_expected_revision, editado: env.p_dados.editado } };
    } finally { await desmontar(B); }
  };

  /* ---------- 13 · com a flag desligada, salvar guarda e avisa ---------- */
  CASOS["salvar com flag desligada fica na fila"] = async () => {
    const B = await montar({ corte_escrita: false });
    try {
      const r = await ftSalvar({ nome: "Fita nova" });
      return { ok: r.status === "na-fila" && B.chamadas.length === 0 && cxPendentes().length === 1
                   && ftQuantas() >= 1,
               obtido: { status: r.status, chamadas: B.chamadas.length, fila: cxPendentes().length } };
    } finally { await desmontar(B); }
  };

  /* ---------- 14 · apagar respeita "em uso" e não some da tela ---------- */
  CASOS["apagar em uso não tira a fita da lista"] = async () => {
    const B = await montar({ corte_escrita: true });
    try {
      B.linhas = [{ id: "ft_a", nome: "Usada", editado: {}, revision: 2 }];
      await ftCarregar();
      B.resposta = () => daRpc("em-uso", { id: "ft_a", quantos: 3 });
      const r = await ftApagar("ft_a");
      return { ok: r.status === "em-uso" && ftQuantas() === 1 && cxParadas().length === 1,
               obtido: { status: r.status, quantas: ftQuantas() } };
    } finally { await desmontar(B); }
  };

  /* ---------- 15 · pureza: nada de fora foi mexido ---------- */
  CASOS["não mexe em S.pedidos nem na fila real"] = async () => {
    const antesFila = localStorage.getItem(CHAVE);
    const antesPed = S && S.pedidos;
    const B = await montar({ corte_escrita: true });
    cxEnfileirar("corte_fita_salvar", "ft_x", { p_dados: { id: "ft_x", nome: "A" } });
    await desmontar(B);
    return { ok: localStorage.getItem(CHAVE) === antesFila && (S && S.pedidos) === antesPed,
             obtido: { filaIgual: localStorage.getItem(CHAVE) === antesFila } };
  };

  window.bateriaCortePersistencia = async function (opcoes) {
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
      resumo: `corte-persistencia: ${res.length - falhas.length} ok · ${falhas.length} falhas`,
      falhas: falhas.map((x) => ({ caso: x.caso, obtido: x.obtido })),
      detalhes: o.detalhes ? res : undefined,
    };
  };
})();
