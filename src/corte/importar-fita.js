/* ===========================================================================
   src/corte/importar-fita.js · IMPORTAR FITA A PARTIR DE UMA IMAGEM
   ---------------------------------------------------------------------------
   O percurso:
     escolher arquivo → prévia → recorte automático → ajuste manual →
     campos propostos → conferência editável → salvar

   TRÊS PROMESSAS QUE ESTE ARQUIVO FAZ
     1. NADA é gravado antes da conferência. As sugestões são propostas, e
        proposta não é decisão;
     2. campo marcado em `editado` — corrigido à mão por alguém — nunca é
        sobrescrito automaticamente. Ele aparece com o valor proposto ao lado,
        com o aviso, e DESMARCADO. Quem quiser aplicar, marca;
     3. o que não se sabe, não se inventa. Sem OCR: a sugestão sai do nome do
        arquivo e do que já existe no cadastro. Um palpite errado escondido
        numa ficha é pior que um campo vazio.

   O RECORTE AUTOMÁTICO
     Canvas, sem dependência nenhuma: lê a cor das bordas e acha a caixa do
     conteúdo. Vai bem em fita sobre fundo liso e vai mal em fundo bagunçado —
     por isso o recorte manual está SEMPRE à mão, e não escondido atrás de um
     "não consegui". Quando o automático não acha nada confiável, ele devolve a
     imagem inteira e diz que não achou, em vez de recortar torto.

   PDF NÃO ENTRA AQUI
     PDF sobe para o bucket e é pré-visualizado pelo navegador (ver README).
     Renderizar página de PDF exigiria embutir um motor inteiro no arquivo, e
     isso ficou para depois. Para importar visualmente uma página, use um
     JPG/PNG/WEBP dela.
   =========================================================================== */

const IMF_TIPOS_IMAGEM = Object.freeze(["image/jpeg", "image/png", "image/webp"]);
const imfEhImagem = (a) => !!a && IMF_TIPOS_IMAGEM.includes(String(a.type || "").toLowerCase());

/* ---------------------------------------------------------------------------
   LER O ARQUIVO · vira um bitmap na memória, nada mais
   --------------------------------------------------------------------------- */
function imfLer(arquivo) {
  return new Promise((ok, falhou) => {
    if (!imfEhImagem(arquivo)) return falhou(new Error("não é imagem"));
    const fr = new FileReader();
    fr.onerror = () => falhou(new Error("não consegui ler o arquivo"));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => falhou(new Error("o arquivo não é uma imagem válida"));
      img.onload = () => ok({ img, dataUrl: String(fr.result) });
      img.src = String(fr.result);
    };
    fr.readAsDataURL(arquivo);
  });
}

/* ---------------------------------------------------------------------------
   RECORTE AUTOMÁTICO
   A cor de fundo é a MEDIANA das quatro bordas, não a do pixel do canto: um
   canto com sujeira ou sombra decidiria sozinho o recorte da imagem inteira.
   --------------------------------------------------------------------------- */
function imfAutoRecorte(img, tolerancia) {
  const larg = img.naturalWidth || img.width, alt = img.naturalHeight || img.height;
  if (!larg || !alt) return { achou: false, caixa: { x: 0, y: 0, w: larg, h: alt }, motivo: "imagem vazia" };

  /* imagem grande é reduzida para a análise: a caixa é proporcional, e varrer
     12 milhões de pixels para achar uma borda seria desperdício */
  const escala = Math.min(1, 600 / Math.max(larg, alt));
  const w = Math.max(1, Math.round(larg * escala)), h = Math.max(1, Math.round(alt * escala));
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  let d;
  try { d = cx.getImageData(0, 0, w, h).data; }
  catch (e) { return { achou: false, caixa: { x: 0, y: 0, w: larg, h: alt }, motivo: "não consegui ler os pixels" }; }

  const px = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const bordas = [];
  for (let x = 0; x < w; x++) { bordas.push(px(x, 0)); bordas.push(px(x, h - 1)); }
  for (let y = 0; y < h; y++) { bordas.push(px(0, y)); bordas.push(px(w - 1, y)); }
  const mediana = (v) => { const s = v.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const fundo = [0, 1, 2].map((c) => mediana(bordas.map((p) => p[c])));

  const tol = Number(tolerancia) || 28;
  const difere = (x, y) => { const p = px(x, y);
    return Math.abs(p[0] - fundo[0]) + Math.abs(p[1] - fundo[1]) + Math.abs(p[2] - fundo[2]) > tol * 3; };

  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!difere(x, y)) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return { achou: false, caixa: { x: 0, y: 0, w: larg, h: alt }, motivo: "a imagem é toda de uma cor só" };

  /* uma folga de 2%: recorte colado no fio da fita corta a borda dela */
  const folga = Math.round(Math.max(w, h) * 0.02);
  x0 = Math.max(0, x0 - folga); y0 = Math.max(0, y0 - folga);
  x1 = Math.min(w - 1, x1 + folga); y1 = Math.min(h - 1, y1 + folga);

  const caixa = { x: Math.round(x0 / escala), y: Math.round(y0 / escala),
                  w: Math.round((x1 - x0 + 1) / escala), h: Math.round((y1 - y0 + 1) / escala) };
  /* ocupa quase tudo? então não havia o que recortar — dizer "achei" aqui
     daria a impressão de um recorte que não aconteceu */
  const proporcao = (caixa.w * caixa.h) / (larg * alt);
  if (proporcao > 0.96) return { achou: false, caixa: { x: 0, y: 0, w: larg, h: alt }, motivo: "não há margem para recortar" };
  if (proporcao < 0.02) return { achou: false, caixa: { x: 0, y: 0, w: larg, h: alt }, motivo: "o que sobrou é pequeno demais para ser a fita" };
  return { achou: true, caixa, fundo, proporcao };
}

/* recorta de verdade e devolve um arquivo pronto para subir */
function imfRecortar(img, caixa, tipo, nome) {
  return new Promise((ok, falhou) => {
    const c = caixa || { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(c.w)); cv.height = Math.max(1, Math.round(c.h));
    cv.getContext("2d").drawImage(img, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
    const saida = tipo === "image/png" ? "image/png" : "image/jpeg";
    cv.toBlob((b) => {
      if (!b) return falhou(new Error("não consegui gerar a imagem recortada"));
      const ext = saida === "image/png" ? "png" : "jpg";
      ok(new File([b], (nome || "fita").replace(/\.[^.]+$/, "") + "." + ext, { type: saida }));
    }, saida, 0.9);
  });
}

/* ---------------------------------------------------------------------------
   SUGESTÕES · do NOME DO ARQUIVO e do que já existe. Nada de adivinhação.
   Catálogo costuma chegar como "G-1203 gorgurão vermelho 38mm.jpg".
   --------------------------------------------------------------------------- */
const IMF_CORES = Object.freeze(["branco","preto","vermelho","azul","verde","amarelo","rosa","roxo","lilas","lilás",
  "laranja","marrom","bege","cinza","dourado","prata","pink","vinho","nude","turquesa","salmao","salmão","creme"]);
const IMF_ESTAMPAS = Object.freeze(["lisa","listrada","xadrez","poa","poá","floral","estampada","bolinha","bolinhas","coracao","coração"]);

function imfDoNome(nome) {
  const limpo = String(nome || "").replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
  const baixo = limpo.toLowerCase();
  const s = { _origemDaSugestao: "nome do arquivo" };

  /* código: letra(s)-números, o formato do catálogo (G-1203, C-0501) */
  const cod = limpo.match(/\b([A-Za-z]{1,3}[-.]?\d{3,6})\b/);
  if (cod) s.codigo = cod[1].toUpperCase();

  /* largura em mm — "38mm", "38 mm" */
  const mm = baixo.match(/\b(\d{1,3})\s*mm\b/);
  if (mm) s.larguraMm = Number(mm[1]);

  /* número da fita — "nº 9", "n 9", "num 9" */
  const num = baixo.match(/\bn[ºo°.]?\s*(\d{1,3})\b/);
  if (num) s.numero = num[1];

  const cor = IMF_CORES.find((c) => new RegExp("\\b" + c + "\\b", "i").test(baixo));
  if (cor) s.cor = cor;
  const est = IMF_ESTAMPAS.find((c) => new RegExp("\\b" + c + "\\b", "i").test(baixo));
  if (est) s.estampa = est;

  /* o nome é o que sobra depois de tirar o que já virou campo */
  let resto = limpo;
  for (const v of [s.codigo, mm && mm[0], num && num[0]]) if (v) resto = resto.replace(new RegExp(v, "i"), " ");
  resto = resto.replace(/\s+/g, " ").trim();
  if (resto.length >= 3) s.nome = resto;

  return s;
}

/* a fita que já existe para este arquivo, se existir. Casar é o que evita
   criar uma segunda "G-1203" ao lado da que já foi corrigida à mão. */
function imfCasar(sugestao) {
  const todas = typeof ftLista === "function" ? ftLista() : [];
  const norm = (x) => String(x || "").trim().toUpperCase();
  if (sugestao.codigo) {
    const porCod = todas.find((f) => norm(f.codigo) === norm(sugestao.codigo));
    if (porCod) return { fita: porCod, por: "código" };
    const porRef = todas.find((f) => norm(f.ref) === norm(sugestao.codigo));
    if (porRef) return { fita: porRef, por: "referência" };
  }
  if (sugestao.nome) {
    const porNome = todas.find((f) => norm(f.nome) === norm(sugestao.nome));
    if (porNome) return { fita: porNome, por: "nome" };
  }
  return null;
}

/* ---------------------------------------------------------------------------
   A LINHA DE CONFERÊNCIA · o que a tela desenha e o que o salvar lê.
   Uma entrada por campo, com o valor de agora, o proposto, e se aplica.
   `aplicar` nasce FALSO em tudo que foi corrigido à mão. É a promessa nº 2.
   --------------------------------------------------------------------------- */
/* mesmo texto, para efeito de comparação: caixa e espaço sobrando não são
   diferença. Número também entra aqui — "38" e 38 são o mesmo valor. */
function imfMesmoTexto(a, b) {
  const n = (x) => String(x == null ? "" : x).trim().replace(/\s+/g, " ").toLowerCase();
  return n(a) === n(b);
}

const IMF_CAMPOS = Object.freeze([
  ["codigo", "Código"], ["ref", "Referência"], ["numero", "Número"],
  ["larguraMm", "Largura (mm)"], ["nome", "Nome"], ["cor", "Cor"],
  ["estampa", "Estampa"], ["classe", "Classe"], ["local", "Local"],
]);

function imfMontarConferencia(sugestao, casada) {
  const fita = casada ? casada.fita : null;
  const marcas = (fita && fita.editado) || {};
  const campos = [];
  for (const [campo, rotulo] of IMF_CAMPOS) {
    const proposto = sugestao[campo];
    if (proposto === undefined || proposto === null || proposto === "") continue;
    const atual = fita ? fita[campo] : null;
    const vazio = atual === undefined || atual === null || atual === "";
    const manual = !!marcas[campo];
    /* "igual" ignora caixa e espaço sobrando. O nome de arquivo vem em minúsculas
       e o cadastro tem a capitalização certa — comparar cru faria a importação
       propor trocar "Gorgurão vermelho" por "gorgurão vermelho" como se fosse
       informação nova. Isso não é dado: é ruído que alguém acabaria aplicando
       sem olhar, e o cadastro iria piorando a cada catálogo importado. */
    const igual = !vazio && imfMesmoTexto(atual, proposto);
    campos.push({
      campo, rotulo, atual: vazio ? null : atual, proposto,
      manual, igual,
      /* já é igual: não há o que aplicar.
         corrigido à mão: aparece, avisa, e fica DESMARCADO.
         vazio ou diferente e sem marca: proposto, marcado. */
      aplicar: igual ? false : manual ? false : true,
      aviso: manual ? "corrigido manualmente" : null,
    });
  }
  return {
    fita, casadaPor: casada ? casada.por : null,
    nova: !fita,
    campos,
    origemDaSugestao: sugestao._origemDaSugestao || "nome do arquivo",
  };
}

/* ---------------------------------------------------------------------------
   SALVAR · só o que está MARCADO entra. O resto fica exatamente como estava.
   --------------------------------------------------------------------------- */
async function imfSalvar(conferencia, fotoCaminho) {
  if (!conferencia) return { status: "invalido", motivo: "nada para salvar" };
  const base = conferencia.fita ? Object.assign({}, conferencia.fita) : {};
  const mexidos = [];

  for (const c of conferencia.campos || []) {
    if (!c.aplicar) continue;
    base[c.campo] = c.proposto;
    /* veio da importação, não da mão de ninguém: NÃO entra em `campoMexido`.
       Marcar aqui faria a próxima importação achar que uma pessoa decidiu
       isto — e o valor ficaria congelado para sempre por engano. */
  }
  if (fotoCaminho) {
    base.fotoPath = fotoCaminho;
    /* a foto é escolha de gente: esta entra como mexida à mão */
    mexidos.push("fotoPath");
  }
  if (!conferencia.fita) base.origem = "catalogo";

  const nada = !mexidos.length && !(conferencia.campos || []).some((c) => c.aplicar);
  if (nada && conferencia.fita) return { status: "sem-mudanca", fitaId: conferencia.fita.id };

  const r = await ftSalvar(base, mexidos);
  return Object.assign({ fitaId: base.id || null }, r);
}

/* quantas mudanças de verdade a conferência propõe — o botão de salvar usa
   isto para não prometer trabalho que não existe */
function imfQuantasAplicam(conferencia) {
  return ((conferencia && conferencia.campos) || []).filter((c) => c.aplicar).length;
}
