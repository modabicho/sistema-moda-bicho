/* ---------- mínimo ajustado: a decisão humana sobre o estoque mínimo ----------
   O mínimo nasce no ERP (Magazord). Quando as vendas mostram que aquele número
   está errado, alguém decide produto a produto: aceita o sugerido, mantém o do
   ERP ou digita outro. A decisão vale na hora dentro do app e entra numa lista
   para ser aplicada na Magazord depois. Quando o CSV volta com o valor já
   corrigido, o ajuste se apaga sozinho — o ERP volta a ser a fonte da verdade. */
const TOL_MIN = 0.35; /* divergência a partir da qual o produto entra na revisão */

/* ---------- meses de estoque de segurança, por processo ----------
   Quase tudo na fábrica trabalha com 4 meses de venda parados no estoque.
   Bandana não: o valor agregado é alto e segurar 4 meses prende dinheiro demais.
   Então o processo pode ter a sua própria régua — e ela muda por curva, porque
   o que gira mais merece mais cobertura do que o que gira pouco. */
const nMeses = (v) => String(Number(v) || 0).replace(".", ",");
const regrasMeses = () => (Array.isArray(S.cfg?.regrasMeses) ? S.cfg.regrasMeses : []);
function regraMesesDe(processo) {
  const p = normProc(processo);
  if (!p) return null;
  /* a regra mais específica ganha: "BANDANA DUPLA" antes de "BANDANA" */
  return regrasMeses().filter((r) => normProc(r.processo) && p.includes(normProc(r.processo)))
    .sort((a, b) => normProc(b.processo).length - normProc(a.processo).length)[0] || null;
}
function mesesSegurancaDe(processo, abc, externo) {
  const padrao = Number(S.cfg?.mesesEstoqueSeguranca) || 4;
  const r = regraMesesDe(processo);
  /* sem regra: o padrão da casa, mais um mês quando o fornecimento é externo */
  if (!r) return padrao + (externo ? 1 : 0);
  /* com regra: o número dela vale ao pé da letra — nem o +1 do externo entra */
  const v = Number(r[abc] != null && r[abc] !== "" ? r[abc] : r.A);
  return v > 0 ? v : padrao;
}
function produtoParaMinimo(sku) {
  let p = produtoDe(sku);
  if (!p) {
    const l = S.calc?.porSku.get(sku);
    p = { id: proximoIdProduto(), sku, descricao: l?.descricao || "", criadoEm: iso(hoje()), origem: "minimo" };
    S.produtos.push(p);
  }
  return p;
}
function definirMinimo(sku, valor, origem) {
  const l = S.calc?.porSku.get(sku);
  if (!l) return null;
  const p = produtoParaMinimo(sku);
  const v = Math.max(0, Math.round(Number(valor) || 0));
  const antes = l.estMin;
  delete p.minMantido;
  /* igualar ao ERP não é ajuste: é voltar para a fonte */
  if (v === (l.estMinErp || 0)) delete p.minAjuste;
  else p.minAjuste = { valor: v, erpQuando: l.estMinErp || 0, sugQuando: l.estMinCalc || 0,
    em: new Date().toISOString(), por: usuarioAtual()?.nome || null, origem: origem || "manual" };
  registrar(null, `mínimo de ${sku}: ${n0(antes)} → ${n0(v)}${v === (l.estMinErp || 0) ? " (voltou ao ERP)" : ""}`, null, null);
  return p;
}
function manterMinimo(sku) {
  const l = S.calc?.porSku.get(sku);
  if (!l) return null;
  const p = produtoParaMinimo(sku);
  delete p.minAjuste;
  p.minMantido = { erpQuando: l.estMinErp || 0, sugQuando: l.estMinCalc || 0,
    em: new Date().toISOString(), por: usuarioAtual()?.nome || null };
  return p;
}
