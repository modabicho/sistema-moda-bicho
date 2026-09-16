#!/usr/bin/env node
/* Monta o PCP.html único a partir de src/ + manifesto.json.
   A montagem é concatenação pura, na ordem do manifesto:
       casca-topo.html + [css...] + casca-meio.html + [js...] + casca-fim.html
   Nenhuma linha é reescrita. Se nada foi editado em src/, o arquivo montado
   é byte a byte igual ao original que gerou o src/. */
const fs = require("fs");
const path = require("path");

const RAIZ = __dirname;
const SRC = path.join(RAIZ, "src");
const manifesto = JSON.parse(fs.readFileSync(path.join(RAIZ, "manifesto.json"), "utf8"));

const saida = process.argv[2] || path.join(RAIZ, "PCP.html");

const ler = (rel) => {
  const p = path.join(SRC, rel);
  if (!fs.existsSync(p)) { console.error("!! faltando:", rel); process.exit(1); }
  return fs.readFileSync(p, "utf8");
};

const partes = [];
partes.push(ler("casca-topo.html"));
for (const c of manifesto.css) partes.push(ler(c.arquivo));
partes.push(ler("casca-meio.html"));
for (const j of manifesto.js) partes.push(ler(j.arquivo));
partes.push(ler("casca-fim.html"));

let html = partes.join("");

/* A versão mora em dois lugares e os dois têm que combinar. */
const cab = html.match(/^<!--PCP:([0-9]+\.[0-9]+)-->/);
const con = html.match(/const VERSAO\s*=\s*"([0-9]+\.[0-9]+)"/);
if (!cab || !con) console.error("!! não achei a versão (cabeçalho ou const VERSAO)");
else if (cab[1] !== con[1]) console.error(`!! versões diferentes: cabeçalho ${cab[1]} × VERSAO ${con[1]}`);

fs.writeFileSync(saida, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
const linhas = html.split("\n").length;
console.log(`${saida} · ${kb} KB · ${linhas} linhas · versão ${con ? con[1] : "?"}`);
console.log(`${manifesto.css.length} CSS + ${manifesto.js.length} JS + 3 cascas`);
