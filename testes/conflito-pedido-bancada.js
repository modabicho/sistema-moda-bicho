/* ===========================================================================
   BANCADA · conflito de pedido (falso × verdadeiro)
   ---------------------------------------------------------------------------
   Roda na CÓPIA DE TESTE (localhost ou ?teste=1). Não fala com o Supabase:
   troca só a porta do servidor (`persRpc`, `pxPorId`) por um servidor falso
   que segue o contrato que o próprio app documenta:
     · `pcp_pedido_patch` compara `p_expected_revision` com a revisão da linha;
       diferente → { status: "conflito", registro } com a linha atual;
     · igual → aplica, `revision + 1`, `updated_by` = quem gravou;
     · o MESMO `operation_id` devolve o resultado guardado (retry é retry);
     · só operação aceita é guardada — conflito não registra a operação;
     · cada gravação aceita gera um evento de Realtime com a linha nova.
   Todo o resto é o código do app: salvarTudo, telaRegistrarIntencoes, a fila,
   telaEnviarIntencoes, mgClassificar, rtChegou e o texto dos toasts.

   Uso no console:
     (0, eval)(await (await fetch("testes/conflito-pedido-bancada.js")).text());
     await bateriaConflitoPedido();
   =========================================================================== */
(function () {
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const copia = (x) => JSON.parse(JSON.stringify(x));
  const EU = "uid-bancada-eu", OUTRA = "uid-bancada-outra";

  function montar() {
    const salvo = {
      pedidos: S.pedidos, flags: TELA_FLAGS, uid: PED_MEU_UID,
      foto: new Map(TELA_FOTO), antes: new Map(PCP_ANTES),
      minhas: new Map([...PED_MINHAS_REVISOES].map(([k, v]) => [k, new Set(v)])),
      rtMinhas: new Map(RT_MINHAS_REVISOES), rtAdiados: new Map(RT_ADIADOS), rtEditando: new Map(RT_EDITANDO),
      nConflitos: PED_CONFLITOS.length, nOuvintes: RT_OUVINTES.length,
      outbox: localStorage.getItem(OUTBOX_CHAVE),
      janela: {},
    };
    const trocar = (nome, fn) => { salvo.janela[nome] = window[nome]; window[nome] = fn; };

    const B = { toasts: [], trilha: [], eventos: [], srv: null, salvo };
    /* ---------- o servidor falso ---------- */
    const linhas = new Map(), feitas = new Map();
    const srv = B.srv = {
      linhas, lat: { ida: 5, volta: 30 }, eco: "depois", ecoMs: 10,
      linhaDe(p, rev, quem) { return Object.assign(paraServidor(p, { permitidos: PED_EDITAVEIS }).linha,
        { id: p.id, numero: p.numero, revision: rev, updated_by: quem }); },
      emitir(reg) {
        const r = copia(reg);
        B.eventos.push({ id: r.id, revision: r.revision, por: r.updated_by === EU ? "eu" : "outra" });
        rtChegou(r);
      },
      /* outra pessoa grava direto no servidor */
      outraAltera(id, patch) {
        const l = linhas.get(id);
        Object.assign(l, copia(patch), { revision: l.revision + 1, updated_by: OUTRA });
        B.trilha.push({ t: "outra-pessoa", id, numero: l.numero, patch: copia(patch), revisaoNova: l.revision });
        srv.emitir(l);
      },
      /* latência: fixa, ou sorteada com semente (a mesma semente repete a ordem) */
      semente: null,
      sortear(max) { if (srv.semente == null) return null;
        srv.semente = (srv.semente * 1103515245 + 12345) % 2147483648; return Math.floor((srv.semente / 2147483648) * max); },
      async rpc(nome, args) {
        const ida = srv.sortear(40) ?? srv.lat.ida, volta = srv.sortear(120) ?? srv.lat.volta;
        await esperar(ida);
        let corpo;
        const op = args.p_operation_id;
        const replay = !!(op && feitas.has(op));
        if (replay) corpo = copia(feitas.get(op));
        else if (nome === "pcp_pedido_patch") {
          const l = linhas.get(args.p_id);
          if (!l) corpo = { status: "apagado" };
          else if (Number(args.p_expected_revision) !== Number(l.revision)) {
            corpo = { status: "conflito", registro: copia(l) };
            /* gancho de teste: algo acontece logo depois de um conflito */
            if (typeof srv.aoConflito === "function") { const f = srv.aoConflito; srv.aoConflito = null; f(l); }
          }
          else {
            Object.assign(l, copia(args.p_patch), { revision: l.revision + 1, updated_by: EU });
            corpo = { status: "ok", revision: l.revision, registro: copia(l) };
            feitas.set(op, corpo);
          }
        } else if (nome === "pcp_pedido_criar") {
          const criados = (args.p_pedidos || []).map((x) => {
            const numero = String(1 + Math.max(0, ...[...linhas.values()].map((y) => Number(y.numero) || 0)));
            const l = Object.assign(copia(x), { numero, revision: 1, updated_by: EU });
            linhas.set(l.id, l); return copia(l);
          });
          corpo = { status: "ok", criados };
          feitas.set(op, corpo);
        } else corpo = { status: "invalido", motivo: "bancada: rpc " + nome };
        const aceito = corpo.status === "ok" && !replay;
        const reg = corpo.registro || (corpo.criados && corpo.criados[0]);
        if (aceito && reg && srv.eco === "antes") srv.emitir(reg);
        if (aceito && reg && srv.eco === "depois") setTimeout(() => srv.emitir(reg), volta + srv.ecoMs);
        await esperar(volta);
        return { ok: true, corpo: copia(corpo) };
      },
    };

    /* ---------- a trilha: cada tentativa de gravação de pedido ---------- */
    const pxEnviarReal = window.pxEnviar;
    trocar("pxEnviar", async function (acao) {
      const d = acao.dados || {};
      const id = acao.entidadeId || d.p_id;
      const p = (S.pedidos || []).find((x) => x && x.id === id) || {};
      const l = linhas.get(id) || {};
      const campos = d.p_patch ? Object.keys(d.p_patch) : null;
      const pilha = String(new Error().stack || "").split("\n").map((s) => (s.match(/at (?:async )?([\w$.]+)/) || [])[1])
        .filter((n) => n && /^(tela|px|salvar|rt|bancada|cenario)/i.test(n) && n !== "pxEnviar");
      const reg = { t: "envio", op: acao.opId, tipo: acao.tipo, id, numero: p.numero || l.numero,
        revisaoLocal: p.revision, revisaoEsperada: d.p_expected_revision, revisaoNoServidor: l.revision,
        campos, desejado: d.p_patch ? copia(d.p_patch) : null,
        servidorAgora: campos ? Object.fromEntries(campos.map((c) => [c, l[c]])) : null,
        pcpAntes: campos && PCP_ANTES.get(id) ? Object.fromEntries(campos.map((c) => [c, PCP_ANTES.get(id)[c]])) : null,
        origem: pilha.join(" < ") || "?", substituiu: acao.substituiu || null };
      B.trilha.push(reg);
      const r = await pxEnviarReal(acao);
      B.trilha.push({ t: "resposta", op: acao.opId, id, numero: reg.numero, status: r.status,
        revisaoRecebida: (r.registro || (r.criados && r.criados[0]) || {}).revision ?? r.revision,
        updatedBy: ((r.registro || {}).updated_by === EU ? "eu" : (r.registro || {}).updated_by ? "outra" : null) });
      return r;
    });
    trocar("persRpc", (nome, args) => srv.rpc(nome, args));
    trocar("pxPorId", async (id) => linhas.has(id) ? { status: "ok", pedido: paraApp(copia(linhas.get(id))) } : { status: "nao-achei" });
    trocar("toast", (msg, tipo) => { B.toasts.push({ msg: String(msg), tipo: tipo || "ok" }); });
    /* de onde veio cada mensagem: a ação, a resposta e se era reenvio */
    const textoReal = window.telaTextoDoProblema;
    trocar("telaTextoDoProblema", (pr) => {
      const reg = (pr.resposta || {}).registro || {};
      B.trilha.push({ t: "toast", op: pr.opId, id: pr.id, status: (pr.resposta || {}).status,
        revisaoDoRegistro: reg.revision, registroPor: reg.updated_by === EU ? "eu" : reg.updated_by ? "outra" : null,
        revisaoEhDestaSessao: minhaRevisao(pr.id, reg.revision), reenvio: pr.reenviada || null, caminho: pr.eraMinha ? "r3 (gravação minha → reenvio)" : pr.reenviada ? "r2 (merge automático → reenvio)" : "envio direto",
        esperadaNaAcao: null });
      return textoReal(pr);
    });
    trocar("render", () => {});
    trocar("rtConectar", () => true);
    /* o miolo grava o DOCUMENTO — fora do escopo; a forma dele é mantida:
       quem chega com gravação em curso espera a mesma promessa */
    let emCurso = null;
    trocar("salvarTudoMiolo", async () => {
      if (emCurso) return emCurso;
      emCurso = esperar(40).then(() => { emCurso = null; return true; });
      return emCurso;
    });
    for (const n of ["escoarEspelhoDoc", "demEspelhar", "cadEspelhar"]) trocar(n, async () => null);
    /* as outras camadas (Demanda, cadastros, cfg, trilha, insumos, semi) ficam
       fora: esta bancada é só de PEDIDO, e elas mandariam as filas delas ao
       servidor falso */
    for (const n of ["demRegistrarIntencoes", "cadRegistrarIntencoes"]) trocar(n, () => []);
    for (const n of ["demEnviarIntencoes", "cadEnviarIntencoes", "cfgEnviarMudancas", "evEnviar",
      "insEnviarIntencoes", "semEnviarIntencoes"]) trocar(n, async () => null);

    TELA_FLAGS = Object.assign({}, TELA_FLAGS || {}, { pedidos_linha_escrita: true, pedidos_linha_leitura: true });
    PED_MEU_UID = EU;
    TELA_FOTO.clear(); PCP_ANTES.clear(); PED_MINHAS_REVISOES.clear();
    RT_MINHAS_REVISOES.clear(); RT_ADIADOS.clear(); RT_EDITANDO.clear();
    localStorage.setItem(OUTBOX_CHAVE, "[]");
    if (!RT_OUVINTES.length) telaLigarRealtime(null);

    /* pedido já existente, gravado antes por mim, revisão 5 */
    B.novoPedido = (numero, rev = 5, extra = {}) => {
      const p = Object.assign({ id: "bancada-" + numero, numero: String(numero), sku: "T.BANCADA", processo: "CHUCA",
        status: "aberto", qtd: 100, prioridade: 2, obs: "", revision: rev }, extra);
      S.pedidos.push(p);
      linhas.set(p.id, srv.linhaDe(p, rev, EU));
      telaGuardar(p); telaMarcarBaseDe(p); minhaRevisaoGuardar(p.id, rev);
      return p;
    };
    S.pedidos = [];
    return B;
  }

  function desmontar(B) {
    const s = B.salvo;
    for (const [n, fn] of Object.entries(s.janela)) window[n] = fn;
    S.pedidos = s.pedidos; TELA_FLAGS = s.flags; PED_MEU_UID = s.uid;
    TELA_FOTO.clear(); for (const [k, v] of s.foto) TELA_FOTO.set(k, v);
    PCP_ANTES.clear(); for (const [k, v] of s.antes) PCP_ANTES.set(k, v);
    PED_MINHAS_REVISOES.clear(); for (const [k, v] of s.minhas) PED_MINHAS_REVISOES.set(k, v);
    RT_MINHAS_REVISOES.clear(); for (const [k, v] of s.rtMinhas) RT_MINHAS_REVISOES.set(k, v);
    RT_ADIADOS.clear(); for (const [k, v] of s.rtAdiados) RT_ADIADOS.set(k, v);
    RT_EDITANDO.clear(); for (const [k, v] of s.rtEditando) RT_EDITANDO.set(k, v);
    RT_OUVINTES.splice(s.nOuvintes);
    PED_CONFLITOS.splice(s.nConflitos);
    if (s.outbox == null) localStorage.removeItem(OUTBOX_CHAVE); else localStorage.setItem(OUTBOX_CHAVE, s.outbox);
    mudouDados();
  }

  const conflitos = (B) => B.toasts.filter((t) => /alterado por outra pessoa|gravação sua mais nova|mudou no servidor enquanto/.test(t.msg));
  const resumo = (B) => ({ toasts: B.toasts.map((t) => t.msg.slice(0, 90)), fila: obLer().map((a) => ({ tipo: a.tipo, estado: a.estado, erro: a.ultimoErro })),
    trilha: B.trilha });

  /* espera a fila e os ecos assentarem */
  async function assentar(B, ms = 400) { await esperar(ms); }

  /* ---------- cenários ---------- */
  const CENARIOS = {
    /* A · a própria aba gravou; a operação seguinte já está satisfeita no servidor */
    async A(B) {
      const p = B.novoPedido(2768);
      p.prioridade = 1;
      const s1 = salvarTudo("nucleo");
      /* mesma alteração registrada de novo antes da resposta (duplo salvar) */
      await esperar(1);
      const s2 = salvarTudo("nucleo");
      await Promise.all([s1, s2]); await assentar(B);
      return { esperado: "sem conflito; servidor com prioridade 1", ok: !conflitos(B).length && B.srv.linhas.get(p.id).prioridade === 1 };
    },
    /* B · eco do Realtime da própria gravação chega antes da resposta, com operação antiga na fila */
    async B(B) {
      B.srv.eco = "antes";
      const p = B.novoPedido(2768);
      p.prioridade = 1;
      const s1 = salvarTudo("nucleo");
      await esperar(1);
      p.obs = "segunda ação";
      const s2 = salvarTudo("nucleo");
      await Promise.all([s1, s2]); await assentar(B);
      const l = B.srv.linhas.get(p.id);
      return { esperado: "sem conflito; servidor com as duas ações", ok: !conflitos(B).length && l.prioridade === 1 && l.obs === "segunda ação" };
    },
    /* C · outra pessoa altera campo diferente */
    async C(B) {
      const p = B.novoPedido(2768);
      B.srv.outraAltera(p.id, { obs: "da outra" });
      /* o eco da outra pessoa pode não ter chegado: simula a aba sem ele */
      p.prioridade = 1;
      await salvarTudo("nucleo"); await assentar(B);
      const l = B.srv.linhas.get(p.id);
      return { esperado: "merge sem conflito; prioridade 1 e obs da outra", ok: !conflitos(B).length && l.prioridade === 1 && l.obs === "da outra" };
    },
    /* C2 · idem, mas a alteração da outra chega DEPOIS do registro da minha intenção */
    async C2(B) {
      const p = B.novoPedido(2768);
      p.prioridade = 1;
      const s = salvarTudo("nucleo");
      B.srv.outraAltera(p.id, { obs: "da outra" });
      await s; await assentar(B);
      const l = B.srv.linhas.get(p.id);
      return { esperado: "merge sem conflito", ok: !conflitos(B).length && l.prioridade === 1 && l.obs === "da outra" };
    },
    /* D · outra pessoa altera o MESMO campo para valor diferente, sem eu ter visto */
    async D(B) {
      const p = B.novoPedido(2768);
      const antes = RT_OUVINTES.length;
      /* a outra grava sem o eco chegar a esta aba (rede atrasada) */
      const l = B.srv.linhas.get(p.id);
      Object.assign(l, { prioridade: 4, revision: l.revision + 1, updated_by: OUTRA });
      p.prioridade = 1;
      await salvarTudo("nucleo"); await assentar(B);
      const c = conflitos(B);
      return { esperado: "conflito vermelho de outra pessoa", ok: c.length === 1 && /outra pessoa/.test(c[0].msg) && c[0].tipo === "erro" && B.srv.linhas.get(p.id).prioridade === 4, ouvintes: antes };
    },
    /* D2 · conflito verdadeiro no reenvio: minha 1ª intenção bate numa gravação
       MINHA (merge automático), e antes do reenvio outra pessoa muda o MESMO
       campo para outro valor. Tem de continuar vermelho, e o valor dela fica. */
    async D2(B) {
      const p = B.novoPedido(2768);
      p.obs = "minha";
      const a = salvarTudo("nucleo");
      await esperar(1);
      p.prioridade = 1;                                  /* 2ª intenção, revisão esperada velha */
      const b = salvarTudo("nucleo");
      B.srv.aoConflito = (l) => {                        /* logo após o conflito da 2ª */
        Object.assign(l, { prioridade: 4, revision: l.revision + 1, updated_by: OUTRA });
      };
      await Promise.all([a, b]); await assentar(B);
      const c = conflitos(B);
      const l = B.srv.linhas.get(p.id);
      return { esperado: "1 conflito vermelho de outra pessoa; servidor fica com a prioridade dela (4)",
        ok: c.length === 1 && /outra pessoa/.test(c[0].msg) && c[0].tipo === "erro" && l.prioridade === 4 && l.obs === "minha" };
    },
    /* E · a captura: N gravado; criar N+1 e salvar produto disparam salvamentos que se cruzam */
    async E(B) {
      const p = B.novoPedido(2768);
      /* 1ª ação no N (ex.: prioridade ao criar/imprimir) */
      p.prioridade = 1;
      const a = salvarTudo("nucleo");
      /* criar N+1 enquanto a gravação do N está no ar */
      await esperar(2);
      const novo = { id: "bancada-novo-2769", sku: "T.BANCADA2", processo: "CHUCA", status: "papel", qtd: 50, prioridade: 3, obs: "" };
      S.pedidos.push(novo);
      p.prioridade = 2;                  /* a fila recalcula a prioridade do N */
      const b = salvarTudo("nucleo");
      /* editar produto: salvamento geral que só dispara o flush */
      await esperar(2);
      const c = salvarTudo("produtos");
      await Promise.all([a, b, c]); await assentar(B, 600);
      const l = B.srv.linhas.get(p.id);
      return { esperado: "N não gera conflito consigo mesmo; N com prioridade 2", ok: !conflitos(B).length && l.prioridade === 2 };
    },
  };

  /* E* · a captura com os intervalos entre as ações também sorteados (semente) */
  CENARIOS.Esorteio = async function (B) {
    const p = B.novoPedido(2768);
    const passo = () => esperar(B.srv.sortear(60) ?? 2);
    p.prioridade = 1;
    const a = salvarTudo("nucleo");
    await passo();
    S.pedidos.push({ id: "bancada-novo-2769", sku: "T.BANCADA2", processo: "CHUCA", status: "papel", qtd: 50, prioridade: 3, obs: "" });
    p.prioridade = 2; p.obs = "fila";
    const b = salvarTudo("nucleo");
    await passo();
    const c = salvarTudo("produtos");
    await passo();
    p.prioridade = 3;
    const d = salvarTudo("nucleo");
    await passo();
    const e = salvarTudo("produtos");
    await Promise.all([a, b, c, d, e]); await assentar(B, 900);
    const l = B.srv.linhas.get(p.id);
    return { esperado: "sem conflito; N termina com prioridade 3 e obs fila",
      ok: !conflitos(B).length && l.prioridade === 3 && l.obs === "fila", final: { prioridade: l.prioridade, obs: l.obs, revision: l.revision } };
  };

  async function rodar(nome, ajustes) {
    const B = montar();
    let r;
    try {
      if (ajustes) ajustes(B);
      r = await CENARIOS[nome](B);
    } catch (e) { r = { ok: false, erro: String(e && e.stack || e) }; }
    const saida = Object.assign({ cenario: nome }, r, resumo(B), { conflitosNovos: PED_CONFLITOS.slice(B.salvo.nConflitos) });
    desmontar(B);
    return saida;
  }

  window.bancadaConflito = { rodar, CENARIOS, montar, desmontar };
  window.bateriaConflitoPedido = async function (opcoes) {
    const o = opcoes || {};
    const nomes = o.cenarios || Object.keys(CENARIOS);
    const res = [];
    for (const n of nomes) res.push(await rodar(n, o.ajustes && o.ajustes[n]));
    const falhas = res.filter((x) => !x.ok);
    return { versao: VERSAO, resumo: `conflito-pedido: ${res.length - falhas.length} ok · ${falhas.length} falhas`,
      falhas: falhas.map((x) => ({ cenario: x.cenario, esperado: x.esperado, erro: x.erro, toasts: x.toasts })),
      detalhes: o.detalhes ? res : undefined };
  };
})();
