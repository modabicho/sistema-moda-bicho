
/* ---------- render principal ---------- */
/* ---------- Datas Festivas: campanhas sazonais (bloco 1) ----------
   Por que uma aba separada: produto de data festiva não vende como o resto do
   ano. A Demanda projeta pela média do período — para quem vende quase tudo em
   três semanas de outubro, essa média é uma mentira útil onze meses por ano e
   um erro grave no décimo segundo. Aqui a conta é outra: parte do que se vendeu
   na MESMA campanha do ano passado.

   Esta é a estrutura. A projeção, as levas e o acompanhamento vêm nos blocos
   seguintes — o que existe aqui já é verdadeiro e não inventa número nenhum:
   estoque, programado e em produção saem das mesmas contas da Demanda.

   Três comportamentos, porque tratar todo SKU de data festiva como sazonal
   estaria errado:
   - normal          → nem entra aqui, segue só na Demanda;
   - exclusivo       → só faz sentido perto da data; continua aparecendo na
                       Demanda como hoje, apenas marcado de que campanha é;
   - reforço         → vende o ano inteiro E vende muito mais na data. Aparece
                       nos dois lugares ao mesmo tempo. Não é produto duplicado
                       nem estoque duplicado: são duas análises do mesmo SKU. */
const FEST_COMP = [["exclusivo", "Só na data"], ["reforco", "Ano todo + reforço"]];
const FEST_COMP_NOME = Object.fromEntries(FEST_COMP);
const festCampanhas = () => (S.festivas?.campanhas || []);
const campanhaPorId = (id) => festCampanhas().find((c) => c.id === id) || null;
const itensDaCampanha = (c) => (c && c.itens) || [];

/* Situação pela data, não por um campo que alguém tem de lembrar de virar.
   "preparação" é a janela em que a produção acontece; "vendendo" é a campanha
   em si. Sem datas, fica em rascunho — e a tela diz isso. */
function situacaoCampanha(c) {
  if (!c) return { id: "rascunho", nome: "Rascunho", tom: "" };
  if (c.arquivada) return { id: "arquivada", nome: "Arquivada", tom: "" };
  const h = hoje();
  const pi = pdate(c.prepIni), ini = pdate(c.ini), fim = pdate(c.fim);
  if (!ini || !fim) return { id: "rascunho", nome: "Faltam as datas", tom: "amber" };
  if (h > fim) return { id: "encerrada", nome: "Encerrada", tom: "" };
  if (h >= ini) return { id: "vendendo", nome: "Vendendo", tom: "teal" };
  if (pi && h >= pi) return { id: "preparacao", nome: "Em preparação", tom: "amber" };
  return { id: "planejada", nome: "Planejada", tom: "" };
}
const campanhaAberta = (c) => ["preparacao", "vendendo"].includes(situacaoCampanha(c).id);
/* Produto exclusivamente sazonal SAI da Demanda. Não é etiqueta: é ausência.
   A Demanda projeta pela média do período, e para quem vende quase tudo em três
   semanas essa média não diz nada — ele estaria lá o ano inteiro pedindo
   produção fora de hora ou dizendo que sobra estoque. Quem cuida dele é a aba
   Datas festivas, que faz o papel de Demanda para esses produtos.
   Vale para campanha viva; campanha arquivada devolve o produto à Demanda. */
function skusSoFestivos() {
  const fora = new Set();
  const exclusivos = [], reforcoExplicito = new Set();
  festCampanhas().forEach((c) => { if (c.arquivada) return;
    itensDaCampanha(c).forEach((i) => {
      if (i.comportamento === "exclusivo") { fora.add(i.sku); exclusivos.push(i.sku); }
      else if (i.comportamento === "reforco") reforcoExplicito.add(skuNormal(i.sku));
    }); });
  /* v8.98 · A IDENTIDADE DO PRODUTO TAMBÉM SAI DA DEMANDA.
     Depois de "Unir produtos", o absorvido deixa de ser item da campanha e vira
     `skusAnteriores` do principal — mas a Magazord ainda manda a linha de
     estoque dele. Com o SKU exato, essa linha voltava à Demanda como se fosse
     outro produto, pedindo produção do que a campanha já planeja.
     `skusDoProduto` é a identidade que o app já usa (OP, pedido): o que é do
     mesmo produto "só na data" fica fora junto. Nada de estoque se soma — a
     linha continua existindo em `linhas`, com o saldo dela.
     Fica À PARTE do Set, e não dentro dele: `fora.size` é o aviso "N em Datas
     festivas", que conta produtos da campanha, e a regra do SKU exato continua
     a mesma. Item explícito "ano todo + reforço" não é escondido só por ser
     anterior de outro — o vínculo explícito manda. */
  const identidade = new Set();
  for (const sk of exclusivos)
    for (const s of skusDoProduto(sk)) { const n = skuNormal(s); if (n && !reforcoExplicito.has(n)) identidade.add(n); }
  fora.identidade = identidade;
  return fora;
}
/* de que campanhas vivas este SKU faz parte — é o que marca a linha na Demanda */
function campanhasDoSku(sku) {
  if (!sku) return [];
  return festCampanhas().filter((c) => !c.arquivada && itensDaCampanha(c).some((i) => i.sku === sku));
}
/* Na Demanda só ficam os de reforço — e é neles que a etiqueta importa: "este
   aqui vende o ano todo, mas está entrando na janela do Halloween". */
function etiquetaCampanhas(sku) {
  const cs = campanhasDoSku(sku).filter((c) => itensDaCampanha(c).find((i) => i.sku === sku)?.comportamento === "reforco");
  if (!cs.length) return "";
  return cs.slice(0, 2).map((c) => {
    const s = situacaoCampanha(c);
    const dentro = campanhaAberta(c);
    return `<span class="tag ${dentro ? "teal" : ""}" style="font-size:9.5px"
      title="${esc(c.nome)}${c.ano ? " " + c.ano : ""} — vende o ano todo e recebe refor\u00e7o na data \u00b7 ${esc(s.nome)}">${dentro ? "reforço " : ""}${esc(c.nome)}</span>`;
  }).join("");
}

/* O pedido não muda de natureza por ter nascido numa campanha — ele é um pedido
   como qualquer outro, na mesma fila, com a mesma conferência. A etiqueta existe
   só para quem está lendo a lista saber de onde ele veio, sem ter de lembrar. */
function etiquetaPedidoCampanha(r) {
  const c = r?.campanhaId && campanhaPorId(r.campanhaId);
  if (!c) return "";
  return `<span class="tag campanha" style="font-size:9.5px" title="Pedido criado no planejamento de ${esc(c.nome)}${c.ano ? " " + c.ano : ""} — na produção ele é um pedido normal">${esc(c.nome)}</span>`;
}

/* O que já dá para dizer com verdade sobre um SKU hoje: veio das MESMAS contas
   da Demanda (linha.qtdProgramada, linha.etapas). Não é "da campanha" — é o que
   existe agora. Amarrar produção a campanha é o bloco das levas. */
function situacaoHojeDoSku(sku) {
  const l = S.calc?.porSku?.get(sku) || null;
  const et = l?.etapas || {};
  return {
    achou: !!l,
    descricao: l?.descricao || produtoDe(sku)?.descricao || "",
    estoque: l ? Number(l.estoqueReal) || 0 : null,
    programado: l ? Number(l.qtdProgramada) || 0 : null,
    comPrestadora: Number(et["Com a prestadora"]) || 0,
    naCasa: (Number(et.Inicial) || 0) + (Number(et.Cortado) || 0),
    vendas: l ? Number(l.vendas) || 0 : null,
  };
}

/* busca de SKU para vincular: procura no que o app já conhece — estoque
   importado e produtos cadastrados — sem criar cadastro nenhum */
function festBuscaSku(txt, jaTem, limite = 12) {
  const q = String(txt || "").trim().toLowerCase();
  if (q.length < 2) return { itens: [], total: 0 };
  const termos = q.split(/\s+/).filter(Boolean);
  const vistos = new Set(), achados = [];
  const olhar = (sku, desc) => {
    if (!sku || vistos.has(sku)) return;
    vistos.add(sku);
    const alvo = (sku + " " + (desc || "")).toLowerCase();
    if (!termos.every((t) => alvo.includes(t))) return;
    achados.push({ sku, desc: desc || "", p: sku.toLowerCase() === q ? 0 : sku.toLowerCase().startsWith(q) ? 1 : 2 });
  };
  (S.estoque?.itens || []).forEach((i) => olhar(i.sku, i.produto));
  S.produtos.forEach((p) => olhar(p.sku, p.descricao));
  achados.sort((a, b) => a.p - b.p || a.sku.localeCompare(b.sku));
  const fora = new Set(jaTem || []);
  const livres = achados.filter((a) => !fora.has(a.sku));
  /* `todos` existe para o lote: marcar "DF.H." tem de pegar os 40, não os 12
     que couberam na tela */
  return { itens: livres.slice(0, limite), total: livres.length, todos: livres };
}


