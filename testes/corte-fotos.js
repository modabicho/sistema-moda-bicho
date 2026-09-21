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
                   && B.salvouComo.length === 1 && B.salvouComo[0].fotoPath === null
                   && apagou(B).length === 1
                   && B.fitas[0].fotoPath === null,
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
