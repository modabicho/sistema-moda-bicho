/* Monta o HTML do protótipo: os estilos e os helpers de desenho saem do
   próprio repositório como estão (só leitura), o resto é do protótipo.
   NÃO faz parte do build do PCP: build.js e manifesto.json não sabem disto.
   Uso (na raiz do repositório):
     node prototipos/processos/montar.js                          → processos.html
     node prototipos/processos/montar.js anterior/procedimentos   → a amostra anterior */
const NOME = process.argv[2] || "processos";
const fs = require("fs"), path = require("path");
const REPO = path.resolve(__dirname, "..", "..");
const AQUI = __dirname;
const ler = (p) => fs.readFileSync(p, "utf8");
const man = JSON.parse(ler(path.join(REPO, "manifesto.json")));

/* tokens.css abre a própria <style> (quem fecha é a casca-meio): aqui a tag é nossa */
const css = man.css.map((c) => ler(path.join(REPO, "src", c.arquivo))).join("\n").replace(/^\s*<style>/, "");
const util = ler(path.join(REPO, "src/nucleo/utilidades.js"));
const toastJs = ler(path.join(REPO, "src/componentes/toast.js"));
const pega = (fonte, re, nome) => { const m = fonte.match(re); if (!m) throw new Error("não achei " + nome); return m[0]; };
const helpers = [
  pega(util, /^const esc = .*$/m, "esc"),
  pega(util, /^const IC = \{[\s\S]*?\n\};/m, "IC"),
  pega(util, /^const svg = .*$/m, "svg"),
  pega(toastJs, /^const kpi = \([\s\S]*?\n\};/m, "kpi"),
].join("\n");

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${NOME === "processos" ? "Processos" : "Procedimentos"} · protótipo</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Red+Hat+Display:wght@600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
${css}
${ler(path.join(AQUI, `${NOME}.css`))}
</style>
</head>
<body>
<div id="app"></div>
<div class="toasts" id="toasts"></div>
<div id="folha" class="folha"></div>
<script>
/* ---- do app, sem mudança: nucleo/utilidades.js (esc, IC, svg) e componentes/toast.js (kpi) ---- */
${helpers}
/* ---- da amostra ---- */
${ler(path.join(AQUI, `${NOME}.js`))}
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(AQUI, `${NOME}.html`), html);
console.log(`prototipos/processos/${NOME}.html ·`, Math.round(Buffer.byteLength(html) / 1024), "KB");
