/* ===========================================================================
   BANCADA · a foto da fita no Storage
   ---------------------------------------------------------------------------
   Troca `fetch`, `persToken` e `ftSalvar` por versões de bancada e roda o
   código de verdade. Não toca na rede: cada caso diz o que o "servidor"
   responde e confere o que o cliente fez com isso.

   O que mais importa aqui é a ORDEM da troca — sobe, grava, e só então apaga a
   antiga. É ela que impede uma fita de ficar sem foto quando a rede cai no
   meio, e os casos 5, 6 e 7 existem só para prová-la.

   Uso no console:
     (0, eval)(await (await fetch("testes/corte-fotos.js")).text());
     await bateriaCorteFotos();
   =========================================================================== */
(function () {
  const CASOS = {};
  const CHAVE = (typeof OUTBOX_CHAVE !== "undefined" ? OUTBOX_CHAVE : "pcp5:outbox");

  /* um "arquivo" de bancada: o cliente só lê type/size e entrega ao fetch */
  const arquivo = (tipo, bytes, nome) => ({
    type: tipo, size: bytes, name: nome || "fita.jpg", __bancada: true,
  });
  const JPG = () => arquivo("image/jpeg", 120000, "G-1203 gorgurão vermelho 38mm.jpg");

  function montar(opcoes) {
    const o = opcoes || {};
    const salvo = {};
    const trocar = (nome, fn) => { salvo[nome] = window[nome]; window[nome] = fn; };
    const B = { chamadas: [], respostas: o.respostas || {}, salvo,
                fitas: o.fitas || [{ id: "ft_1", nome: "Cetim branco", fotoPath: null, revision: 1, editado: {} }],
                salvouComo: [] };

    trocar("persToken", () => (o.semLogin ? null : "tok-de-bancada"));
    trocar("persSoLeitura", () => !!o.copiaTeste);
    trocar("ftAchar", (id) => B.fitas.find((f) => f.id === id) || null);
    trocar("ftSalvar", async (fita, mexidos) => {
      B.salvouComo.push({ fotoPath: fita.fotoPath, mexidos: (mexidos || []).slice() });
      if (o.salvarFalha) return { status: o.salvarFalha, motivo: "bancada: gravação recusada" };
      const i = B.fitas.findIndex((f) => f.id === fita.id);
      if (i >= 0) B.fitas[i] = Object.assign({}, B.fitas[i], fita);
      return { status: o.salvarStatus || "ok" };
    });

    /* o "servidor": cada caminho responde o que o caso mandou */
    trocar("fetch", async (url, init) => {
      const metodo = (init && init.method) || "GET";
      B.chamadas.push({ url: String(url), metodo });
      const u = String(url);
      const qual = u.includes("/object/sign/") ? "assinar"
        : u.includes("/object/info/") ? "info"
        : metodo === "DELETE" ? "apagar"
        : metodo === "POST" ? "subir" : "outro";
      const r = B.respostas[qual];
      if (typeof r === "function") return r(u, init);
      if (r === "offline") throw new Error("sem rede");
      const st = r && r.status ? r.status : 200;
      return { ok: st >= 200 && st < 300, status: st,
               json: async () => (r && r.corpo) || {} };
    });
    /* o padrão: tudo dá certo */
    B.respostas = Object.assign({
      subir: { status: 200 }, info: { status: 200 }, apagar: { status: 200 },
      assinar: { status: 200, corpo: { signedURL: "/object/sign/fitas/x?token=abc" } },
    }, B.respostas);
    return B;
  }
  function desmontar(B) {
    for (const [nome, fn] of Object.entries(B.salvo)) {
      if (fn === undefined) delete window[nome]; else window[nome] = fn;
    }
    if (typeof foEsquecerUrl === "function") foEsquecerUrl();
  }
  const subiu = (B) => B.chamadas.filter((c) => c.metodo === "POST" && !c.url.includes("/sign/"));
  const apagou = (B) => B.chamadas.filter((c) => c.metodo === "DELETE");

  /* ---------- 1 · o que nem chega a sair daqui ---------- */
  CASOS["sessão expirada não tenta subir"] = async () => {
    const B = montar({ semLogin: true });
    try {
      const r = await foSubir(JPG(), "fita/ft_1/x.jpg");
      return { ok: r.status === "sem-login" && B.chamadas.length === 0,
               obtido: { status: r.status, chamadas: B.chamadas.length } };
    } finally { desmontar(B); }
  };

  CASOS["arquivo maior que 10 MB é recusado antes da rede"] = async () => {
    const B = montar();
    try {
      const r = await foSubir(arquivo("image/jpeg", 11 * 1024 * 1024), "fita/ft_1/x.jpg");
      return { ok: r.status === "grande-demais" && B.chamadas.length === 0
                   && /10 MB/.test(r.motivo || ""),
               obtido: { status: r.status, motivo: r.motivo, chamadas: B.chamadas.length } };
    } finally { desmontar(B); }
  };

  CASOS["tipo fora da lista é recusado antes da rede"] = async () => {
    const B = montar();
    try {
      const r = await foSubir(arquivo("image/gif", 1000, "a.gif"), "fita/ft_1/x.gif");
      return { ok: r.status === "tipo-nao-aceito" && B.chamadas.length === 0,
               obtido: { status: r.status, chamadas: B.chamadas.length } };
    } finally { desmontar(B); }
  };

  CASOS["cópia de teste não envia nada"] = async () => {
    const B = montar({ copiaTeste: true });
    try {
      const r = await foSubir(JPG(), "fita/ft_1/x.jpg");
      return { ok: r.status === "copia-teste" && B.chamadas.length === 0, obtido: r.status };
    } finally { desmontar(B); }
  };

  /* ---------- 2 · a rede falhando ---------- */
  CASOS["rede caída no upload não grava foto_path"] = async () => {
    const B = montar({ respostas: { subir: "offline" } });
    try {
      const r = await foTrocarDaFita("ft_1", JPG());
      return { ok: r.status === "offline" && B.salvouComo.length === 0
                   && !B.fitas[0].fotoPath,
               obtido: { status: r.status, gravou: B.salvouComo.length } };
    } finally { desmontar(B); }
  };

  CASOS["upload incompleto (objeto não chegou) não grava foto_path"] = async () => {
    const B = montar({ respostas: { info: { status: 404 } } });
    try {
      const r = await foTrocarDaFita("ft_1", JPG());
      return { ok: r.status === "incompleto" && B.salvouComo.length === 0,
               obtido: { status: r.status, gravou: B.salvouComo.length } };
    } finally { desmontar(B); }
  };

  /* ---------- 3 · A ORDEM, que é o coração deste arquivo ---------- */
  CASOS["troca completa: sobe, grava, e SÓ ENTÃO apaga a antiga"] = async () => {
    const B = montar({ fitas: [{ id: "ft_1", nome: "Cetim", fotoPath: "fita/ft_1/velha.jpg", revision: 1, editado: {} }] });
    try {
      const r = await foTrocarDaFita("ft_1", JPG());
      const ordem = B.chamadas.map((c) => c.metodo + (c.url.includes("/info/") ? ":info" : ""));
      const iPost = ordem.indexOf("POST");
      const iDel = ordem.indexOf("DELETE");
      return { ok: r.status === "ok"
                   && iPost >= 0 && iDel > iPost                 /* apagou DEPOIS de subir */
                   && B.salvouComo.length === 1
                   && B.salvouComo[0].fotoPath === r.caminho
                   /* a foto é escolha de gente: entra como campo mexido à mão */
                   && B.salvouComo[0].mexidos.includes("fotoPath")
                   && apagou(B)[0].url.includes("velha.jpg"),
               obtido: { status: r.status, ordem, gravou: B.salvouComo[0] } };
    } finally { desmontar(B); }
  };

  CASOS["gravação falha: a foto ANTIGA continua valendo, não é apagada"] = async () => {
    const B = montar({ salvarFalha: "conflito",
      fitas: [{ id: "ft_1", nome: "Cetim", fotoPath: "fita/ft_1/velha.jpg", revision: 1, editado: {} }] });
    try {
      const r = await foTrocarDaFita("ft_1", JPG());
      return { ok: r.status === "conflito"
                   && apagou(B).length === 0                 /* NADA foi apagado */
                   && B.fitas[0].fotoPath === "fita/ft_1/velha.jpg"
                   && !!r.caminhoSolto,                      /* e diz o que sobrou */
               obtido: { status: r.status, apagou: apagou(B).length,
                         fotoDaFita: B.fitas[0].fotoPath, solto: r.caminhoSolto } };
    } finally { desmontar(B); }
  };

  CASOS["apagar a antiga falha: a fita já aponta para a nova, e avisa"] = async () => {
    const B = montar({ respostas: { apagar: { status: 500 } },
      fitas: [{ id: "ft_1", nome: "Cetim", fotoPath: "fita/ft_1/velha.jpg", revision: 1, editado: {} }] });
    try {
      const r = await foTrocarDaFita("ft_1", JPG());
      return { ok: r.status === "ok" && r.antigaSobrou === "fita/ft_1/velha.jpg"
                   && B.fitas[0].fotoPath === r.caminho,
               obtido: { status: r.status, sobrou: r.antigaSobrou, agora: B.fitas[0].fotoPath } };
    } finally { desmontar(B); }
  };

  /* ---------- 4 · remover ---------- */
  CASOS["remover: tira do cadastro ANTES de apagar o objeto"] = async () => {
    const B = montar({ fitas: [{ id: "ft_1", nome: "Cetim", fotoPath: "fita/ft_1/velha.jpg", revision: 1, editado: {} }] });
    try {
      const r = await foRemoverDaFita("ft_1");
      return { ok: r.status === "ok"
                   /* limpar é "", não null: com null o `coalesce` da RPC
                      preserva o caminho antigo (v8.111) */
                   && B.salvouComo.length === 1 && B.salvouComo[0].fotoPath === ""
                   && apagou(B).length === 1
                   && B.fitas[0].fotoPath === "",
               obtido: { status: r.status, gravou: B.salvouComo[0], apagou: apagou(B).length } };
    } finally { desmontar(B); }
  };

  CASOS["remover sem foto não chama o servidor"] = async () => {
    const B = montar();
    try {
      const r = await foRemoverDaFita("ft_1");
      return { ok: r.status === "ok" && r.nada === true && B.chamadas.length === 0,
               obtido: { status: r.status, chamadas: B.chamadas.length } };
    } finally { desmontar(B); }
  };

  /* ---------- 5 · a URL assinada ---------- */
  CASOS["assinar devolve URL absoluta e reusa dentro da validade"] = async () => {
    const B = montar();
    try {
      const a = await foAssinar("fita/ft_1/x.jpg");
      const b = await foAssinar("fita/ft_1/x.jpg");
      const pedidos = B.chamadas.filter((c) => c.url.includes("/sign/")).length;
      return { ok: a.status === "ok" && /^https?:\/\/|^\/storage/.test(a.url)
                   && a.url.includes("/storage/v1/")
                   && b.doCache === true && pedidos === 1,
               obtido: { url: a.url, pedidos, doCache: b.doCache } };
    } finally { desmontar(B); }
  };

  CASOS["falha ao assinar não quebra: devolve motivo"] = async () => {
    const B = montar({ respostas: { assinar: { status: 404 } } });
    try {
      const r = await foAssinar("fita/ft_1/sumida.jpg");
      return { ok: r.status === "sumiu" && !!r.motivo, obtido: r };
    } finally { desmontar(B); }
  };

  /* ---------- 6 · o caminho ---------- */
  CASOS["o caminho segue fita/<id>/<uuid>.<ext>"] = async () => {
    const B = montar();
    try {
      const c1 = foCaminhoDaFita("ft_1", "image/jpeg");
      const c2 = foCaminhoDaFita("ft_1", "image/webp");
      const cat = foCaminhoDeCatalogo("application/pdf");
      return { ok: /^fita\/ft_1\/[a-f0-9]+\.jpg$/.test(c1)
                   && /^fita\/ft_1\/[a-f0-9]+\.webp$/.test(c2)
                   && c1 !== c2                        /* nunca repete */
                   && /^catalogo\/\d{4}-\d{2}\/[a-f0-9]+\.pdf$/.test(cat),
               obtido: { c1, c2, cat } };
    } finally { desmontar(B); }
  };

  CASOS["subir não usa upsert: caminho novo a cada foto"] = async () => {
    const B = montar();
    try {
      await foSubir(JPG(), "fita/ft_1/a.jpg");
      const h = (subiu(B)[0] && subiu(B)[0].url) || "";
      const init = B.chamadas.length ? true : false;
      return { ok: init && h.includes("/storage/v1/object/fitas/fita/ft_1/a.jpg"),
               obtido: h };
    } finally { desmontar(B); }
  };

  /* =========================================================================
     7 · OS DOIS DEFEITOS QUE A BANCADA NÃO PEGOU E A PRODUÇÃO PEGOU
     -------------------------------------------------------------------------
     Estes quatro usam o `ftSalvar` DE VERDADE e a fila de verdade — os casos
     de cima trocam o `ftSalvar` por um de bancada, e foi exatamente por isso
     que os dois defeitos passaram batido: um morava no `ftSalvar` real
     (revisão lida do cache) e o outro no `coalesce` da RPC (null não limpa).
     Aqui o "servidor" é de bancada, mas responde como o de verdade: devolve
     `revision` e faz o `coalesce`.
     ========================================================================= */
  function montarReal(opcoes) {
    const o = opcoes || {};
    const salvo = {};
    const trocar = (nome, fn) => { salvo[nome] = window[nome]; window[nome] = fn; };
    /* o "banco": uma fita, com revisão que anda a cada gravação aceita */
    const B = { salvo, linha: [],
      banco: { id: "ft_1", nome: "Cetim", foto_path: null, revision: 1 },
      recusarNaProxima: o.recusarNaProxima || 0, gravacoes: 0 };

    trocar("persToken", () => "tok");
    trocar("persSoLeitura", () => false);
    trocar("corteEscreve", () => true);

    /* o servidor: mesma regra da 147 — coalesce e checagem de revisão */
    trocar("persRpc", async (nome, args) => {
      if (nome === "pcp_fita_salvar") {
        B.gravacoes++;
        B.linha.push({ passo: "gravar", rev: args.p_expected_revision, foto: args.p_dados.foto_path });
        if (B.recusarNaProxima === B.gravacoes) {
          return { ok: true, corpo: { status: "conflito", id: B.banco.id, revision: B.banco.revision } };
        }
        if (args.p_expected_revision != null && args.p_expected_revision !== B.banco.revision) {
          return { ok: true, corpo: { status: "conflito", id: B.banco.id, revision: B.banco.revision } };
        }
        /* COALESCE: null preserva; string vazia limpa */
        const f = args.p_dados.foto_path;
        if (f !== null && f !== undefined) B.banco.foto_path = f;
        B.banco.revision += 1;
        return { ok: true, corpo: { status: "ok", id: B.banco.id, revision: B.banco.revision } };
      }
      return { ok: true, corpo: { status: "ok" } };
    });

    /* o Storage */
    trocar("fetch", async (url, init) => {
      const u = String(url), m = (init && init.method) || "GET";
      if (u.includes("/object/info/")) return { ok: true, status: 200, json: async () => ({}) };
      if (u.includes("/object/sign/")) return { ok: true, status: 200, json: async () => ({ signedURL: "/x" }) };
      if (m === "POST")   { B.linha.push({ passo: "subir",  alvo: (u.split("/fitas/")[1]||"").split("?")[0] }); }
      if (m === "DELETE") { B.linha.push({ passo: "apagar", alvo: (u.split("/fitas/")[1]||"").split("?")[0] }); }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    localStorage.removeItem(CHAVE);
    FT_LISTA = [ftParaApp(Object.assign({}, B.banco))];
    return B;
  }
  function desmontarReal(B) {
    for (const [n, fn] of Object.entries(B.salvo)) { if (fn === undefined) delete window[n]; else window[n] = fn; }
    localStorage.removeItem(CHAVE);
    if (typeof foEsquecerUrl === "function") foEsquecerUrl();
  }
  const img = (tipo) => ({ type: tipo, size: 5000, name: "f." + tipo.split("/")[1], __bancada: true });

  CASOS["A · trocar JPG → PNG → WEBP sem recarregar, e a revisão anda"] = async () => {
    const B = montarReal();
    try {
      const revs = [];
      const sts = [];
      for (const t of ["image/jpeg", "image/png", "image/webp"]) {
        const r = await foTrocarDaFita("ft_1", img(t));
        sts.push(r.status);
        revs.push({ cache: ftAchar("ft_1").revision, servidor: B.banco.revision });
      }
      return { ok: sts.every((s) => s === "ok")
                   && revs.every((x) => x.cache === x.servidor)   /* nunca ficou para trás */
                   && B.banco.revision === 4                       /* 1 + três gravações */
                   && /\.webp$/.test(B.banco.foto_path),
               obtido: { status: sts, revisoes: revs, fotoFinal: B.banco.foto_path } };
    } finally { desmontarReal(B); }
  };

  CASOS["B · trocar e remover em seguida, sem recarregar"] = async () => {
    const B = montarReal();
    try {
      const troca = await foTrocarDaFita("ft_1", img("image/jpeg"));
      const rem = await foRemoverDaFita("ft_1");
      return { ok: troca.status === "ok" && rem.status === "ok"
                   /* o coalesce da RPC preserva null: limpar é "" */
                   && B.banco.foto_path === ""
                   && !ftAchar("ft_1").fotoPath,
               obtido: { troca: troca.status, remocao: rem.status,
                         fotoNoBanco: B.banco.foto_path, noCache: ftAchar("ft_1").fotoPath } };
    } finally { desmontarReal(B); }
  };

  CASOS["C · conflito depois do upload: cache mantém revisão e foto anteriores"] = async () => {
    const B = montarReal({ recusarNaProxima: 1 });
    try {
      B.banco.foto_path = "fita/ft_1/velha.jpg";
      FT_LISTA = [ftParaApp(Object.assign({}, B.banco))];
      const antesRev = ftAchar("ft_1").revision;
      const antesFoto = ftAchar("ft_1").fotoPath;

      const r = await foTrocarDaFita("ft_1", img("image/jpeg"));
      const depois = ftAchar("ft_1");
      const apagou = B.linha.filter((x) => x.passo === "apagar").length;
      return { ok: r.status === "conflito"
                   && depois.revision === antesRev        /* revisão NÃO avançou */
                   && depois.fotoPath === antesFoto       /* foto voltou à anterior */
                   && apagou === 0                        /* objeto antigo intacto */
                   && B.banco.foto_path === "fita/ft_1/velha.jpg",
               obtido: { status: r.status, rev: { antes: antesRev, depois: depois.revision },
                         foto: { antes: antesFoto, depois: depois.fotoPath }, apagou } };
    } finally { desmontarReal(B); }
  };

  CASOS["D · remoção: limpa o cadastro ANTES de apagar o objeto"] = async () => {
    const B = montarReal();
    try {
      await foTrocarDaFita("ft_1", img("image/jpeg"));
      B.linha.length = 0;
      const r = await foRemoverDaFita("ft_1");
      const iGravar = B.linha.findIndex((x) => x.passo === "gravar");
      const iApagar = B.linha.findIndex((x) => x.passo === "apagar");
      return { ok: r.status === "ok" && iGravar >= 0 && iApagar > iGravar
                   && B.linha[iGravar].foto === ""        /* limpa com "", não null */
                   && B.banco.foto_path === "",
               obtido: { ordem: B.linha.map((x) => x.passo), linha: B.linha } };
    } finally { desmontarReal(B); }
  };

  window.bateriaCorteFotos = async function (opcoes) {
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
      resumo: `corte-fotos: ${res.length - falhas.length} ok · ${falhas.length} falhas`,
      falhas: falhas.map((x) => ({ caso: x.caso, obtido: x.obtido })),
      detalhes: o.detalhes ? res : undefined,
    };
  };
})();
