/* ---------- QR Code (modelo 2, modo byte) ----------
   Escrito à mão para o app não depender de CDN: se um dia a internet cair na
   fábrica, o canhoto tem de sair com o código mesmo assim. Versões 1 a 4, que
   cobrem com folga um número de pedido. */
const QR = (() => {
  /* --- aritmética em GF(256), polinômio primitivo 0x11d --- */
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

  /* --- polinômio gerador de Reed-Solomon de grau n --- */
  function genPoly(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const ng = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        /* (x + α^i)·g : o termo x desloca o coeficiente, α^i multiplica no lugar.
           Inverter estes dois dá o polinômio ao contrário e a correção de erro sai errada. */
        ng[j] ^= g[j];
        ng[j + 1] ^= mul(g[j], EXP[i]);
      }
      g = ng;
    }
    return g;
  }
  function ecc(dados, n) {
    const g = genPoly(n), res = new Array(n).fill(0);
    for (const d of dados) {
      const f = d ^ res[0];
      res.shift(); res.push(0);
      if (f !== 0) for (let i = 0; i < n; i++) res[i] ^= mul(g[i + 1], f);
    }
    return res;
  }

  /* total de codewords por versão */
  const TOTAL = { 1: 26, 2: 44, 3: 70, 4: 100, 5: 134, 6: 172, 7: 196, 8: 242, 9: 292, 10: 346 };
  /* [codewords de correção por bloco, nº de blocos] */
  const ECT = {
    1: { L: [7, 1], M: [10, 1], Q: [13, 1], H: [17, 1] },
    2: { L: [10, 1], M: [16, 1], Q: [22, 1], H: [28, 1] },
    3: { L: [15, 1], M: [26, 1], Q: [18, 2], H: [22, 2] },
    4: { L: [20, 1], M: [18, 2], Q: [26, 2], H: [16, 4] },
    5: { L: [26, 1], M: [24, 2], Q: [18, 4], H: [22, 4] },
    6: { L: [18, 2], M: [16, 4], Q: [24, 4], H: [28, 4] },
    7: { L: [20, 2], M: [18, 4], Q: [18, 6], H: [26, 5] },
    8: { L: [24, 2], M: [22, 4], Q: [22, 6], H: [26, 6] },
    9: { L: [30, 2], M: [22, 5], Q: [20, 8], H: [24, 8] },
    10: { L: [18, 4], M: [26, 5], Q: [24, 8], H: [28, 8] },
  };
  const ALINHA = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
  /* versão 7 em diante carrega o número da versão em dois blocos de 18 bits */
  const VER_INFO = { 7: 0x07C94, 8: 0x085BC, 9: 0x09A99, 10: 0x0A4D3 };
  const NIVEL = { L: 1, M: 0, Q: 3, H: 2 }; /* bits do indicador de nível */

  const capacidade = (v, n) => TOTAL[v] - ECT[v][n][0] * ECT[v][n][1];

  function encode(texto, nivel = "Q") {
    const bytes = [];
    for (const ch of unescape(encodeURIComponent(texto))) bytes.push(ch.charCodeAt(0));
    let versao = 0;
    for (let v = 1; v <= 10; v++) if (bytes.length + 2 <= capacidade(v, nivel)) { versao = v; break; }
    if (!versao) throw new Error("texto longo demais para o QR");

    /* --- fluxo de bits: modo byte (0100) + contagem (8 bits) + dados --- */
    const bits = [];
    const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(4, 4); push(bytes.length, 8);
    for (const b of bytes) push(b, 8);
    const cap = capacidade(versao, nivel) * 8;
    for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const dados = [];
    for (let i = 0; i < bits.length; i += 8) dados.push(parseInt(bits.slice(i, i + 8).join(""), 2));
    const PAD = [0xec, 0x11];
    for (let i = 0; dados.length < capacidade(versao, nivel); i++) dados.push(PAD[i % 2]);

    /* --- blocos e intercalação ---
       Da versão 5 em diante os blocos NÃO têm todos o mesmo tamanho: os últimos
       levam um byte a mais. Dividir em partes iguais gera um código que o leitor
       recusa. Aqui os menores vêm primeiro e os maiores depois, como manda a norma. */
    const [nEcc, nBlocos] = ECT[versao][nivel];
    const base = Math.floor(dados.length / nBlocos);
    const sobra = dados.length % nBlocos;            /* quantos blocos levam +1 */
    const blocosD = [], blocosE = [];
    let pos = 0;
    for (let i = 0; i < nBlocos; i++) {
      const tam = base + (i >= nBlocos - sobra ? 1 : 0);
      const d = dados.slice(pos, pos + tam); pos += tam;
      blocosD.push(d); blocosE.push(ecc(d, nEcc));
    }
    const fluxo = [];
    const maiorD = Math.max(...blocosD.map((b) => b.length));
    for (let i = 0; i < maiorD; i++) for (const b of blocosD) if (i < b.length) fluxo.push(b[i]);
    for (let i = 0; i < nEcc; i++) for (const b of blocosE) fluxo.push(b[i]);

    /* --- matriz --- */
    const N = versao * 4 + 17;
    const m = Array.from({ length: N }, () => new Array(N).fill(null)); /* null = livre */
    const por = (r, c, v) => { if (r >= 0 && r < N && c >= 0 && c < N) m[r][c] = v; };

    const finder = (r, c) => {
      for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
        const dentro = i >= 0 && i <= 6 && j >= 0 && j <= 6;
        const anel = i === 0 || i === 6 || j === 0 || j === 6;
        const miolo = i >= 2 && i <= 4 && j >= 2 && j <= 4;
        por(r + i, c + j, dentro && (anel || miolo) ? 1 : 0);
      }
    };
    finder(0, 0); finder(0, N - 7); finder(N - 7, 0);

    for (let i = 8; i < N - 8; i++) { m[6][i] = i % 2 === 0 ? 1 : 0; m[i][6] = i % 2 === 0 ? 1 : 0; }

    for (const r of ALINHA[versao]) for (const c of ALINHA[versao]) {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= N - 9) || (r >= N - 9 && c <= 8)) continue;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++)
        m[r + i][c + j] = Math.max(Math.abs(i), Math.abs(j)) !== 1 ? 1 : 0;
    }

    m[N - 8][8] = 1; /* módulo escuro fixo */
    /* reserva das áreas de formato */
    for (let i = 0; i < 9; i++) { if (m[8][i] === null) m[8][i] = 2; if (m[i][8] === null) m[i][8] = 2; }
    for (let i = 0; i < 8; i++) { if (m[8][N - 1 - i] === null) m[8][N - 1 - i] = 2; if (m[N - 1 - i][8] === null) m[N - 1 - i][8] = 2; }
    /* Versão 7 em diante: dois blocos 6×3 com o número da versão, um no canto
       superior direito e outro no inferior esquerdo. Sem eles o leitor nem tenta
       decodificar um código grande. */
    if (versao >= 7) {
      const vi = VER_INFO[versao];
      for (let i = 0; i < 18; i++) {
        const bit = (vi >> i) & 1;
        const r = Math.floor(i / 3), c = i % 3;
        m[r][N - 11 + c] = bit;
        m[N - 11 + c][r] = bit;
      }
    }

    /* --- dados em ziguezague, de baixo para cima, dois em dois --- */
    let bi = 0, subindo = true;
    const bitDe = (i) => (i >> 3) < fluxo.length ? (fluxo[i >> 3] >> (7 - (i & 7))) & 1 : 0;
    for (let c = N - 1; c > 0; c -= 2) {
      if (c === 6) c--; /* coluna de temporização não recebe dados */
      for (let k = 0; k < N; k++) {
        const r = subindo ? N - 1 - k : k;
        for (const cc of [c, c - 1]) if (m[r][cc] === null) { m[r][cc] = bitDe(bi++); }
      }
      subindo = !subindo;
    }

    /* --- máscaras --- */
    const REGRA = [
      (r, c) => (r + c) % 2 === 0, (r, c) => r % 2 === 0, (r, c) => c % 3 === 0,
      (r, c) => (r + c) % 3 === 0, (r, c) => (((r / 2) | 0) + ((c / 3) | 0)) % 2 === 0,
      (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
      (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
      (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
    ];
    const eFuncao = (r, c) => {
      if (r === 6 || c === 6) return true;
      if (r < 9 && c < 9) return true;
      if (r < 9 && c >= N - 8) return true;
      if (r >= N - 8 && c < 9) return true;
      for (const ar of ALINHA[versao]) for (const ac of ALINHA[versao]) {
        if ((ar <= 8 && ac <= 8) || (ar <= 8 && ac >= N - 9) || (ar >= N - 9 && ac <= 8)) continue;
        if (Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2) return true;
      }
      return false;
    };

    function penalidade(g) {
      let p = 0;
      /* 1: sequências de 5 ou mais iguais */
      for (let i = 0; i < N; i++) {
        for (const linha of [g[i], g.map((x) => x[i])]) {
          let run = 1;
          for (let j = 1; j < N; j++) {
            if (linha[j] === linha[j - 1]) run++;
            else { if (run >= 5) p += 3 + (run - 5); run = 1; }
          }
          if (run >= 5) p += 3 + (run - 5);
        }
      }
      /* 2: blocos 2x2 */
      for (let r = 0; r < N - 1; r++) for (let c = 0; c < N - 1; c++)
        if (g[r][c] === g[r][c + 1] && g[r][c] === g[r + 1][c] && g[r][c] === g[r + 1][c + 1]) p += 3;
      /* 3: padrão que imita o localizador */
      const A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
      const bate = (arr, i, pat) => pat.every((v, k) => arr[i + k] === v);
      for (let i = 0; i < N; i++) {
        const lin = g[i], col = g.map((x) => x[i]);
        for (let j = 0; j + 11 <= N; j++) {
          if (bate(lin, j, A) || bate(lin, j, B)) p += 40;
          if (bate(col, j, A) || bate(col, j, B)) p += 40;
        }
      }
      /* 4: desequilíbrio entre claro e escuro */
      let escuros = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) escuros += g[r][c];
      p += Math.floor(Math.abs(escuros * 100 / (N * N) - 50) / 5) * 10;
      return p;
    }

    /* formato: 5 bits (nível + máscara) com BCH(15,5) e XOR 0x5412 */
    function formato(mask) {
      const dado = (NIVEL[nivel] << 3) | mask;
      let v = dado << 10;
      for (let i = 4; i >= 0; i--) if ((v >> (i + 10)) & 1) v ^= 0x537 << i;
      return ((dado << 10) | v) ^ 0x5412;
    }

    let melhor = null, melhorP = Infinity, melhorMask = 0;
    for (let mask = 0; mask < 8; mask++) {
      const g = m.map((linha, r) => linha.map((v, c) => {
        const base = v === 2 ? 0 : v;
        return eFuncao(r, c) ? base : base ^ (REGRA[mask](r, c) ? 1 : 0);
      }));
      const fmt = formato(mask);
      /* Os 15 bits do formato entram em duas cópias. A primeira desce a COLUNA 8
         (bits 0-8) e depois corre a LINHA 8 da direita para a esquerda (bits 9-14);
         trocar linha por coluna aqui gera um código que o leitor localiza mas não lê. */
      for (let i = 0; i < 15; i++) {
        const bit = (fmt >> i) & 1;
        if (i < 6) g[i][8] = bit;
        else if (i === 6) g[7][8] = bit;
        else if (i === 7) g[8][8] = bit;
        else if (i === 8) g[8][7] = bit;
        else g[8][14 - i] = bit;
        if (i < 8) g[8][N - 1 - i] = bit;
        else g[N - 15 + i][8] = bit;
      }
      g[N - 8][8] = 1;
      const p = penalidade(g);
      if (p < melhorP) { melhorP = p; melhor = g; melhorMask = mask; }
    }
    return { matriz: melhor, tamanho: N, versao, mask: melhorMask };
  }

  /* SVG com retângulos pretos: vetor imprime nítido na térmica, e o fill
     sobrevive ao "sem fundo colorido" que a impressão de cupom aplica. */
  function svg(texto, { modulo = 2, quiet = 4, nivel = "Q" } = {}) {
    const { matriz, tamanho } = encode(texto, nivel);
    const lado = (tamanho + quiet * 2) * modulo;
    let d = "";
    for (let r = 0; r < tamanho; r++) {
      let c = 0;
      while (c < tamanho) {
        if (!matriz[r][c]) { c++; continue; }
        let w = 1;
        while (c + w < tamanho && matriz[r][c + w]) w++; /* junta módulos vizinhos: menos rects */
        d += `M${(c + quiet) * modulo} ${(r + quiet) * modulo}h${w * modulo}v${modulo}h${-w * modulo}z`;
        c += w;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges" role="img" aria-label="QR do pedido">`
      + `<rect width="${lado}" height="${lado}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  return { encode, svg };
})();

