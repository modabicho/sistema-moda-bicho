/* ===========================================================================
   BANCADA · importar fita por imagem
   ---------------------------------------------------------------------------
   A promessa que esta bateria existe para defender: campo corrigido à mão
   NUNCA é sobrescrito sem alguém mandar. Os casos 4, 5 e 6 são só isso, ditos
   de três maneiras diferentes — porque é a parte que, se quebrar um dia, vai
   quebrar em silêncio e só aparecer numa ficha errada semanas depois.

   Uso no console:
     (0, eval)(await (await fetch("testes/corte-importacao.js")).text());
     await bateriaCorteImportacao();
   =========================================================================== */
(function () {
  const CASOS = {};

  const FITAS = () => ([
    { id: "ft_1", codigo: "G-1203", ref: null, numero: "9", nome: "Gorgurão vermelho",
      cor: "vermelho", estampa: "lisa", larguraMm: 38, local: "Prateleira 3",
      revision: 1, editado: {} },
    { id: "ft_2", codigo: "C-0501", ref: "REF-77", numero: "5", nome: "Cetim branco",
      cor: "branco", estampa: "lisa", larguraMm: 12, local: "Caixa 13",
      revision: 2, editado: { local: true, cor: true } },
  ]);

  function montar(fitas) {
    const salvo = {};
    const trocar = (nome, fn) => { salvo[nome] = window[nome]; window[nome] = fn; };
    const B = { salvo, fitas: fitas || FITAS(), gravou: [] };
    trocar("ftLista", () => B.fitas.slice());
    trocar("ftAchar", (id) => B.fitas.find((f) => f.id === id) || null);
    trocar("ftSalvar", async (fita, mexidos) => {
      B.gravou.push({ fita: JSON.parse(JSON.stringify(fita)), mexidos: (mexidos || []).slice() });
      return { status: "ok" };
    });
    return B;
  }
  function desmontar(B) {
    for (const [nome, fn] of Object.entries(B.salvo)) {
      if (fn === undefined) delete window[nome]; else window[nome] = fn;
    }
  }
  const pega = (cf, campo) => (cf.campos || []).find((c) => c.campo === campo);

  /* ---------- 1 · a sugestão sai do nome do arquivo ---------- */
  CASOS["o nome do arquivo vira sugestão, sem gravar nada"] = async () => {
    const B = montar();
    try {
      const s = imfDoNome("G-1203 gorgurão vermelho 38mm.jpg");
      return { ok: s.codigo === "G-1203" && s.larguraMm === 38 && s.cor === "vermelho"
                   && /gorgur/i.test(s.nome || "") && B.gravou.length === 0,
               obtido: s };
    } finally { desmontar(B); }
  };

  CASOS["número e estampa também saem do nome quando estão lá"] = async () => {
    const B = montar();
    try {
      const s = imfDoNome("C-0501 nº 5 cetim branco listrada 12mm.png");
      return { ok: s.codigo === "C-0501" && s.numero === "5" && s.cor === "branco"
                   && s.estampa === "listrada" && s.larguraMm === 12,
               obtido: s };
    } finally { desmontar(B); }
  };

  CASOS["nome sem nada reconhecível não inventa campo"] = async () => {
    const B = montar();
    try {
      const s = imfDoNome("IMG_20260920_112233.jpg");
      return { ok: s.codigo === undefined && s.cor === undefined
                   && s.larguraMm === undefined && s.estampa === undefined,
               obtido: s };
    } finally { desmontar(B); }
  };

  /* ---------- 2 · casar com o que já existe ---------- */
  CASOS["casa por código com fita existente"] = async () => {
    const B = montar();
    try {
      const c = imfCasar(imfDoNome("G-1203 gorgurão vermelho 38mm.jpg"));
      return { ok: !!c && c.fita.id === "ft_1" && c.por === "código", obtido: c && { id: c.fita.id, por: c.por } };
    } finally { desmontar(B); }
  };

  CASOS["casa por referência quando o código não bate"] = async () => {
    const B = montar();
    try {
      const c = imfCasar({ codigo: "REF-77" });
      return { ok: !!c && c.fita.id === "ft_2" && c.por === "referência", obtido: c && { id: c.fita.id, por: c.por } };
    } finally { desmontar(B); }
  };

  CASOS["código desconhecido é fita nova, não casamento errado"] = async () => {
    const B = montar();
    try {
      const s = imfDoNome("Z-9999 fita nova azul 25mm.jpg");
      const cf = imfMontarConferencia(s, imfCasar(s));
      return { ok: cf.nova === true && cf.fita === null && cf.campos.length > 0,
               obtido: { nova: cf.nova, campos: cf.campos.map((c) => c.campo) } };
    } finally { desmontar(B); }
  };

  /* ---------- 3 · A PROMESSA: `editado` nunca é atropelado ---------- */
  CASOS["campo corrigido à mão vem DESMARCADO e com aviso"] = async () => {
    const B = montar();
    try {
      /* ft_2 tem `editado: { local: true, cor: true }` */
      const s = { codigo: "C-0501", cor: "creme", local: "Gaveta 2", nome: "Cetim cru" };
      const cf = imfMontarConferencia(s, imfCasar(s));
      const cor = pega(cf, "cor"), local = pega(cf, "local"), nome = pega(cf, "nome");
      return { ok: cor.manual === true && cor.aplicar === false && cor.aviso === "corrigido manualmente"
                   && local.manual === true && local.aplicar === false
                   /* `nome` NÃO foi corrigido à mão: entra marcado */
                   && nome.manual === false && nome.aplicar === true,
               obtido: { cor: { manual: cor.manual, aplicar: cor.aplicar },
                         local: { manual: local.manual, aplicar: local.aplicar },
                         nome: { manual: nome.manual, aplicar: nome.aplicar } } };
    } finally { desmontar(B); }
  };

  CASOS["salvar sem marcar não altera o campo manual"] = async () => {
    const B = montar();
    try {
      const s = { codigo: "C-0501", cor: "creme", nome: "Cetim cru" };
      const cf = imfMontarConferencia(s, imfCasar(s));
      /* a pessoa não marcou nada além do que já veio marcado (o nome) */
      await imfSalvar(cf, null);
      const g = B.gravou[0].fita;
      return { ok: g.cor === "branco"            /* intacto: era manual */
                   && g.nome === "Cetim cru"     /* aplicado: não era manual */
                   && B.gravou[0].mexidos.length === 0,
               obtido: { cor: g.cor, nome: g.nome, mexidos: B.gravou[0].mexidos } };
    } finally { desmontar(B); }
  };

  CASOS["marcar à mão aplica, e a marca de editado continua lá"] = async () => {
    const B = montar();
    try {
      const s = { codigo: "C-0501", cor: "creme" };
      const cf = imfMontarConferencia(s, imfCasar(s));
      pega(cf, "cor").aplicar = true;             /* alguém marcou de propósito */
      await imfSalvar(cf, null);
      const g = B.gravou[0].fita;
      return { ok: g.cor === "creme"
                   /* a marca de "corrigido à mão" NÃO some: a próxima
                      importação continua tendo de perguntar */
                   && g.editado && g.editado.cor === true
                   /* e a importação não se declara autora da correção */
                   && !B.gravou[0].mexidos.includes("cor"),
               obtido: { cor: g.cor, editado: g.editado, mexidos: B.gravou[0].mexidos } };
    } finally { desmontar(B); }
  };

  CASOS["diferença só de caixa/espaço não conta como mudança"] = async () => {
    const B = montar();
    try {
      /* o nome do arquivo vem em minúsculas; o cadastro tem a capitalização
         certa. Propor a troca seria piorar o cadastro a cada importação. */
      const s = imfDoNome("G-1203 gorgurão vermelho 38mm.jpg");
      const cf = imfMontarConferencia(s, imfCasar(s));
      const nome = pega(cf, "nome");
      return { ok: !!nome && nome.igual === true && nome.aplicar === false
                   && imfQuantasAplicam(cf) === 0,
               obtido: { atual: nome && nome.atual, proposto: nome && nome.proposto,
                         igual: nome && nome.igual, quantas: imfQuantasAplicam(cf) } };
    } finally { desmontar(B); }
  };

  CASOS["valor igual ao que já existe não conta como mudança"] = async () => {
    const B = montar();
    try {
      const s = { codigo: "G-1203", cor: "vermelho" };   /* já é vermelho */
      const cf = imfMontarConferencia(s, imfCasar(s));
      const cor = pega(cf, "cor");
      return { ok: cor.igual === true && cor.aplicar === false
                   && imfQuantasAplicam(cf) === 0,
               obtido: { igual: cor.igual, aplicar: cor.aplicar, quantas: imfQuantasAplicam(cf) } };
    } finally { desmontar(B); }
  };

  /* ---------- 4 · o que a gravação leva ---------- */
  CASOS["a foto entra como campo mexido à mão; os importados não"] = async () => {
    const B = montar();
    try {
      const s = imfDoNome("Z-9999 fita azul 25mm.jpg");
      const cf = imfMontarConferencia(s, imfCasar(s));
      await imfSalvar(cf, "fita/nova/abc.jpg");
      const g = B.gravou[0];
      return { ok: g.fita.fotoPath === "fita/nova/abc.jpg"
                   && g.mexidos.length === 1 && g.mexidos[0] === "fotoPath"
                   && g.fita.origem === "catalogo",
               obtido: { fotoPath: g.fita.fotoPath, mexidos: g.mexidos, origem: g.fita.origem } };
    } finally { desmontar(B); }
  };

  CASOS["nada marcado e sem foto: não grava"] = async () => {
    const B = montar();
    try {
      const s = { codigo: "G-1203", cor: "vermelho" };
      const cf = imfMontarConferencia(s, imfCasar(s));
      const r = await imfSalvar(cf, null);
      return { ok: r.status === "sem-mudanca" && B.gravou.length === 0,
               obtido: { status: r.status, gravou: B.gravou.length } };
    } finally { desmontar(B); }
  };

  CASOS["a conferência não grava nada sozinha"] = async () => {
    const B = montar();
    try {
      const s = imfDoNome("G-1203 gorgurão azul 38mm.jpg");
      imfMontarConferencia(s, imfCasar(s));
      return { ok: B.gravou.length === 0, obtido: B.gravou.length };
    } finally { desmontar(B); }
  };

  /* ---------- 5 · o recorte automático ---------- */
  const tela = (larg, alt, pintar) => {
    const cv = document.createElement("canvas");
    cv.width = larg; cv.height = alt;
    const cx = cv.getContext("2d");
    cx.fillStyle = "#ffffff"; cx.fillRect(0, 0, larg, alt);
    pintar(cx);
    const img = new Image();
    return new Promise((ok) => { img.onload = () => ok(img); img.src = cv.toDataURL("image/png"); });
  };

  CASOS["recorte automático acha a fita sobre fundo liso"] = async () => {
    const img = await tela(400, 300, (cx) => { cx.fillStyle = "#c02020"; cx.fillRect(100, 80, 200, 120); });
    const r = imfAutoRecorte(img);
    const c = r.caixa;
    /* com a folga de 2%, a caixa cerca o retângulo sem se afastar demais */
    const perto = (a, b, tol) => Math.abs(a - b) <= tol;
    return { ok: r.achou === true && perto(c.x, 100, 20) && perto(c.y, 80, 20)
                 && perto(c.w, 200, 40) && perto(c.h, 120, 40),
             obtido: { achou: r.achou, caixa: c } };
  };

  CASOS["imagem de uma cor só: não recorta e diz por quê"] = async () => {
    const img = await tela(200, 200, () => {});
    const r = imfAutoRecorte(img);
    return { ok: r.achou === false && !!r.motivo
                 && r.caixa.w === 200 && r.caixa.h === 200,
             obtido: r };
  };

  CASOS["conteúdo ocupando tudo: devolve inteira em vez de fingir recorte"] = async () => {
    const img = await tela(200, 200, (cx) => { cx.fillStyle = "#101010"; cx.fillRect(1, 1, 198, 198); });
    const r = imfAutoRecorte(img);
    return { ok: r.achou === false && r.caixa.w === 200 && r.caixa.h === 200,
             obtido: r };
  };

  window.bateriaCorteImportacao = async function (opcoes) {
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
      resumo: `corte-importacao: ${res.length - falhas.length} ok · ${falhas.length} falhas`,
      falhas: falhas.map((x) => ({ caso: x.caso, obtido: x.obtido })),
      detalhes: o.detalhes ? res : undefined,
    };
  };
})();
