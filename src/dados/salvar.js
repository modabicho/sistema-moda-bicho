/* ---------- persistência de alto nível: uma gravação, tudo junto ---------- */
/* v8.24 · `salvarPedidos()` volta a ser o que sempre foi. O gancho da camada
   nova SAIU daqui: ele estava num ponto por onde só 16 dos 42 caminhos de
   gravação passavam — a janela de editar, entre outros, chama `salvarTudo`
   direto, e por isso a alteração do pedido 2304 nunca virou intenção nenhuma.
   Agora o gancho mora em `salvarTudo`, que é por onde TODO mundo passa. */
const salvarPedidos = async () => { render(); await salvarTudo("nucleo"); };

/* o resultado da última gravação pela camada nova, à mão para a tela e para as
   baterias — sem precisar de um canal novo */
let PCP_ENSAIO_ULTIMO = null;
const salvarFaltas = async () => { render(); await salvarTudo("nucleo"); };
const salvarProdutos = async (l) => { S.produtos = l; render(); await salvarTudo("produtos"); };
/* Excluir produto é destrutivo e silencioso: some da Demanda, dos pedidos futuros e do
   histórico de cadastro. Por isso nada é apagado antes de conferir o que depende dele —
   produto com pedido em aberto fica de fora, porque o papel já está na mão de alguém. */
function abrirExclusaoProdutos(ids) {
  const alvo = S.produtos.filter((p) => ids.includes(p.id));
  if (!alvo.length) return toast("Nenhum produto selecionado.", "erro");
  const podem = [], barrados = [];
  for (const p of alvo) {
    const vivos = S.pedidos.filter((r) => PED_VIVO.includes(r.status)
      && ((opPorId(r.opId) || {}).sku === p.sku || r.sku === p.sku));
    const feitos = S.pedidos.filter((r) => r.status === "retornada"
      && ((opPorId(r.opId) || {}).sku === p.sku || r.sku === p.sku)).length;
    if (vivos.length) barrados.push({ p, vivos });
    else podem.push({ id: p.id, sku: p.sku, descricao: p.descricao, feitos });
  }
  S.modal = { tipo: "excluirProdutos", podem, barrados };
  render();
}

/* Trocar o nome de alguém tem de alcançar tudo que guarda NOME em vez de id:
   setores, pedidos vivos e tarefas. Sem isso o setor fica apontando para uma
   pessoa que não existe mais, e o pedido novo nasce órfão. */
function renomearPessoa(de, para) {
  if (!de || !para || de === para) return 0;
  let n = 0;
  for (const st of setores()) {
    const lista = respDoSetor(st);
    if (lista.includes(de)) {
      st.responsaveis = lista.map((x) => (x === de ? para : x));
      st.responsavel = st.responsaveis[0] || null;
      n++;
    }
  }
  for (const r of S.pedidos) if (r.responsavel === de) { r.responsavel = para; n++; }
  /* S.tarefas é o filtro da tela, não uma lista; as tarefas nascem do cálculo,
     então seguem o responsável do pedido automaticamente. */
  if (S.tarefas && S.tarefas.quem === de) S.tarefas.quem = para;
  /* as funções viajam com a pessoa: quem entra herda o que quem saiu cuidava,
     sem duplicar o que ela já fazia */
  const saiu = S.equipe.find((x) => x.nome === de), entrou = S.equipe.find((x) => x.nome === para);
  if (saiu && entrou && saiu !== entrou) {
    const novas = (saiu.funcoes || []).filter((f2) => !(entrou.funcoes || []).includes(f2));
    if (novas.length) { entrou.funcoes = [...(entrou.funcoes || []), ...novas]; n += novas.length; }
  }
  return n;
}

const salvarCad = async () => { render(); await salvarTudo("cad", "nucleo"); };
/* lê o que está digitado na tela da estrutura antes de qualquer re-render, para não perder o que a pessoa escreveu */
function colherEstrutura() {
  const e = S.modal?.e;
  if (!e) return;
  $$("[data-ep]").forEach((el2) => { e[el2.dataset.ep] = el2.value.trim() || null; });
  const linhas = [];
  $$("[data-ex]").forEach((el2) => {
    const [i, campo] = el2.dataset.ex.split("|");
    linhas[+i] = linhas[+i] || { ordem: +i + 1, nome: "", valor: null };
    linhas[+i][campo] = campo === "valor" ? (el2.value === "" ? null : Number(el2.value)) : el2.value;
  });
  if (linhas.length) e.etapas = linhas.map((x, i) => ({ ordem: i + 1, nome: x.nome || "", valor: x.valor }));
  /* a receita vive na mesma janela e é redesenhada junto: colher as duas na
     mesma passada evita o clássico "adicionei uma linha e perdi o que digitei" */
  const rec = [];
  $$("[data-rc]").forEach((el2) => {
    const [i, campo] = el2.dataset.rc.split("|");
    rec[+i] = rec[+i] || { insumoId: "", qtd: null };
    rec[+i][campo] = campo === "qtd" ? (el2.value === "" ? null : Number(el2.value)) : el2.value;
  });
  if (rec.length || S.modal?.receita) S.modal.receita = rec;
}
/* o modal do produto se redesenha ao mexer na receita: recolher tudo na mesma
   passada evita o clássico "adicionei uma linha e perdi o que eu tinha digitado" */
function colherProduto() {
  const m = S.modal;
  if (m?.tipo !== "produto" || !m.produto) return;
  const p = m.produto;
  $$("[data-p]").forEach((el2) => { const k = el2.dataset.p;
    p[k] = el2.type === "number" ? (el2.value === "" ? null : Number(el2.value)) : (el2.value.trim() || null); });
  p.producao = p.producao || {};
  $$("[data-pp]").forEach((el2) => { const k = el2.dataset.pp;
    p.producao[k] = el2.type === "number" ? (el2.value === "" ? null : Number(el2.value)) : (el2.value.trim() || null); });
  const chips = $$("[data-prod-et]");
  if (chips.length) {
    const marcadas = chips.filter((x) => x.checked).map((x) => String(x.value).toUpperCase());
    p.etapasUsadas = marcadas.length && marcadas.length < chips.length ? marcadas : null;
  }
  if (Array.isArray(m.receitaProd)) {
    const rec = [];
    $$("[data-prc]").forEach((el2) => {
      const [i, campo] = el2.dataset.prc.split("|");
      rec[+i] = rec[+i] || { insumoId: "", qtd: null };
      rec[+i][campo] = campo === "qtd" ? (el2.value === "" ? null : Number(el2.value)) : el2.value;
    });
    m.receitaProd = rec;
  }
}
const salvarEquipe = async () => { render(); await salvarTudo("equipe"); };
const salvarCfg = async () => { await salvarTudo("cfg"); };

/* ==========================================================================
   RELATÓRIO DE PRODUÇÃO
   A pergunta que a fábrica faz todo dia é uma só: "quanto eu tenho de produzir?".
   A Demanda responde isso com o mínimo que está em uso hoje. Só que o mínimo em
   uso e o mínimo sugerido pelas vendas quase nunca são iguais — e trocar um pelo
   outro muda o plano inteiro. Este relatório deixa essa escolha na mão de quem
   decide, para a lista inteira ou produto a produto, e mostra a conta na frente:
   alvo − estoque − o que já está em produção = o que falta produzir.
   ========================================================================== */
const REL_BASES = [["uso", "Mínimo em uso"], ["sugerido", "Sugerido pelas vendas"], ["maior", "O maior dos dois"]];
const REL_BASE_CURTA = { uso: "em uso", sugerido: "sugerido", maior: "o maior" };
const REL_BASE_FRASE = { uso: "o mínimo em uso", sugerido: "o mínimo sugerido pelas vendas", maior: "o maior dos dois mínimos" };
const relBaseDoSku = (sku) => S.rel.porSku[sku] || S.rel.base;

/* os filtros de "quais produtos" — os mesmos da Demanda, para o relatório não
   ganhar uma segunda barra de filtros que discorde da primeira. O filtro de
   situação fica de fora de propósito: quem decide o que produzir é o relatório. */
function filtrosDeProduto(linhas, d) {
  let r = linhas;
  if (d.abc !== "todos") r = r.filter((x) => x.abc === d.abc);
  if (d.processo !== "todos") r = r.filter((x) => x.processo === d.processo);
  if (d.setor && d.setor !== "todos") r = r.filter((x) => (setorDe(x.processo)?.nome || "—") === d.setor);
  if (d.fornecedor && d.fornecedor !== "todos") r = r.filter((x) => {
    const f2 = produtoDe(x.sku)?.producao?.fornecedorId || null;
    return d.fornecedor === "__sem" ? !f2 : f2 === d.fornecedor; });
  const b = String(d.busca || "").trim().toLowerCase();
  if (b) r = r.filter((x) => x.sku.toLowerCase().includes(b)
    || (x.descricao || "").toLowerCase().includes(b) || (x.processo || "").toLowerCase().includes(b));
  return r;
}

/* a conta, uma linha por vez. Mínimo e estoque estão na unidade do mínimo
   (pacotes); a quantidade a produzir sai em peças — é assim que a fórmula da
   planilha sempre foi, e é assim que o pedido nasce. */
function relConta(l, forcar) {
  const base = forcar || relBaseDoSku(l.sku);
  const alvo = base === "sugerido" ? Number(l.estMinCalc) || 0
    : base === "maior" ? Math.max(Number(l.estMin) || 0, Number(l.estMinCalc) || 0)
    : Number(l.estMin) || 0;
  const pac = Math.max(1, Number(l.qtdPacote) || 1);
  const emProd = Number(l.qtdProgramada) || 0;
  const falta = Math.max(0, alvo - l.estoqueReal);
  const necessidade = falta * pac;
  /* arredonda para cima no pacote: ninguém corta meia embalagem */
  const produzir = arredPacote(Math.max(0, necessidade - emProd), pac);
  const cobertura = alvo > 0 ? (l.estoqueReal + emProd / pac) / alvo : (l.estoqueReal + emProd / pac > 0 ? null : 1);
  return { base, alvo, pac, emProd, necessidade, produzir, cobertura,
    diferente: (Number(l.estMin) || 0) !== alvo };
}
/* os filtros do relatório. "Tipo de produto" na fábrica quer dizer duas coisas
   diferentes conforme quem fala: a categoria da loja ou o processo que ele usa.
   A busca cobre as duas — e o SKU, a descrição e a derivação junto. */
function relFiltros(linhas) {
  const R = S.rel;
  let r = linhas;
  if (R.abc !== "todos") r = r.filter((x) => x.abc === R.abc);
  if (R.categoria !== "todas") r = r.filter((x) => (x.categoria || "—") === R.categoria);
  if (R.processo !== "todos") r = r.filter((x) => x.processo === R.processo);
  if (R.setor !== "todos") r = r.filter((x) => (setorDe(x.processo)?.nome || "—") === R.setor);
  if (R.fornecedor !== "todos") r = r.filter((x) => {
    const f2 = produtoDe(x.sku)?.producao?.fornecedorId || null;
    return R.fornecedor === "__sem" ? !f2 : f2 === R.fornecedor; });
  const b = String(R.busca || "").trim().toLowerCase();
  if (b) { const termos = b.split(/\s+/).filter(Boolean);
    r = r.filter((x) => { const alvo = `${x.sku} ${x.descricao || ""} ${x.processo || ""} ${x.categoria || ""} ${x.derivacao || ""}`.toLowerCase();
      return termos.every((tm) => alvo.includes(tm)); }); }
  return r;
}
const REL_FILTROS_ATIVOS = () => {
  const R = S.rel, fs2 = [];
  if (String(R.busca || "").trim()) fs2.push({ k: "busca", rot: `busca "${String(R.busca).trim()}"` });
  if (R.abc !== "todos") fs2.push({ k: "abc", rot: `curva ${R.abc}` });
  if (R.categoria !== "todas") fs2.push({ k: "categoria", rot: `categoria ${R.categoria}` });
  if (R.setor !== "todos") fs2.push({ k: "setor", rot: `setor ${R.setor}` });
  if (R.processo !== "todos") fs2.push({ k: "processo", rot: `processo ${R.processo}` });
  if (R.fornecedor !== "todos") fs2.push({ k: "fornecedor", rot: R.fornecedor === "__sem" ? "sem fornecedor definido"
    : `fornecedor ${((S.cad.fornecedores || []).find((f2) => f2.id === R.fornecedor) || {}).nome || "escolhido"}` });
  return fs2;
};
const relLimparFiltros = () => { const R = S.rel;
  R.busca = ""; R.abc = "todos"; R.categoria = "todas"; R.processo = "todos"; R.setor = "todos"; R.fornecedor = "todos"; };

function relLinhas() {
  const c = S.calc;
  if (!c) return [];
  let r = relFiltros(c.linhasDemanda).map((l) => ({ l, ...relConta(l) }));
  /* Uma linha em que a pessoa acabou de mexer não pode sumir debaixo do dedo
     dela. Trocar a régua de um SKU para "sugerido" pode zerar o que ele pede —
     e aí o filtro "o que produzir" o engoliria no mesmo clique, como se o app
     tivesse comido a linha. Decisão tomada à mão (régua trocada ou linha
     marcada) fica visível, mesmo quando o filtro diria o contrário. */
  /* Quem decide se a linha aparece é a régua GERAL, não a exceção — senão trocar a
     régua de um SKU o tirava da lista onde a pessoa estava e o empurrava para
     outro filtro, como se o app tivesse comido o item. A exceção muda o número
     mostrado; a presença na lista continua sendo do plano geral. E linha marcada
     para exportar nunca some. */
  const fixa = (x) => (S.rel.sel && S.rel.sel.has(x.l.sku));
  if (S.rel.so === "produzir") r = r.filter((x) => relConta(x.l, S.rel.base).produzir > 0 || fixa(x));
  else if (S.rel.so === "mudou") r = r.filter((x) => relConta(x.l, S.rel.base).produzir !== (Number(x.l.saldoSemPedido) || 0) || fixa(x));
  /* A ordem sai SEMPRE da régua geral, nunca da exceção de uma linha. Antes, trocar
     a régua de um SKU mudava o "produzir" dele e a lista se reordenava embaixo do
     dedo: a linha ia parar no fim de setecentas, e de onde a pessoa estava olhando
     ela tinha simplesmente sumido. Agora a exceção muda os números daquela linha e
     mais nada — quem manda no lugar dela é o plano geral. */
  const ordenar = (x) => {
    const g = relConta(x.l, S.rel.base);
    return S.rel.ord === "produzir" ? g.produzir : S.rel.ord === "alvo" ? g.alvo
      : S.rel.ord === "estoque" ? x.l.estoqueReal : S.rel.ord === "emProd" ? x.emProd
      : S.rel.ord === "sugerido" ? (x.l.estMinCalc || 0) : S.rel.ord === "minimo" ? (x.l.estMin || 0)
      : S.rel.ord === "sku" ? x.l.sku : x.l.score;
  };
  return r.sort((x, y) => { const vx = ordenar(x), vy = ordenar(y);
    if (vx === vy) return String(x.l.sku).localeCompare(String(y.l.sku), undefined, { numeric: true });
    return (typeof vx === "string" ? String(vx).localeCompare(String(vy), undefined, { numeric: true })
      : (vx || 0) - (vy || 0)) * S.rel.dir; });
}
/* o que vai para o papel, para a planilha e para os pedidos: as linhas marcadas
   à mão quando existem, senão tudo que sobrou do filtro. É a diferença entre
   "quero essas" e "quero o que está na tela". */
function relEscolhidas() {
  const linhas = relLinhas();
  if (!S.rel.sel || !S.rel.sel.size) return linhas;
  const dentro = linhas.filter((x) => S.rel.sel.has(x.l.sku));
  return dentro.length ? dentro : linhas;
}
function relTotais(linhas) {
  const t = { skus: 0, pecas: 0, emProd: 0, semMinimo: 0, semFisico: 0 };
  linhas.forEach((x) => {
    if (x.produzir > 0) { t.skus++; t.pecas += x.produzir; }
    t.emProd += x.emProd;
    if (!x.alvo) t.semMinimo++;
    if (x.l.estFisico == null) t.semFisico++;
  });
  return t;
}
/* o que esse plano consome de insumo — só faz sentido depois que existe receita,
   e é a única forma de responder "dá para produzir isso?" antes de mandar cortar */
function relConsumo(linhas) {
  if (!temReceitaEmAlgumLugar()) return null;
  const mapa = new Map();
  linhas.forEach((x) => {
    if (x.produzir <= 0) return;
    const rec = receitaDe(produtoDe(x.l.sku));
    rec.itens.forEach((it) => {
      if (!it.insumoId || !(Number(it.qtd) > 0)) return;
      const at = mapa.get(it.insumoId) || { insumoId: it.insumoId, precisa: 0, skus: 0 };
      at.precisa += Number(it.qtd) * x.produzir; at.skus++;
      mapa.set(it.insumoId, at);
    });
  });
  if (!mapa.size) return null;
  return [...mapa.values()].map((o) => {
    const ins = insumoPorId(o.insumoId);
    /* "livre" desconta o que já está reservado para os pedidos que existem hoje:
       o plano novo disputa o que sobrou, não o estoque inteiro */
    const livre = disponivelInsumo(o.insumoId);
    return { ...o, ins, livre, falta: Math.max(0, o.precisa - livre) };
  }).sort((p1, p2) => p2.falta - p1.falta || String(p1.ins?.nome || "").localeCompare(String(p2.ins?.nome || "")));
}

function relTotalComBase(b) {
  const c = S.calc;
  if (!c) return { skus: 0, pecas: 0 };
  return relTotais(relFiltros(c.linhasDemanda).map((l) => ({ l, ...relConta(l, b) })));
}

function viewRelatorio() {
  const c = S.calc;
  if (!c) return `<div class="card">${vazio("nada", "Sem análise ainda", "Importe os relatórios da Magazord na aba Dados — sem eles não há estoque nem venda para calcular.")}</div>`;
  const R = S.rel;
  /* a marcação é um Set; um estado antigo restaurado pode não ter o dele */
  const marcados = (R.sel ||= new Set()).size;
  const linhas = relLinhas();
  const t = relTotais(linhas);
  const total = linhas.length, vis = linhas.slice(0, R.limite);
  const nExcecoes = Object.keys(R.porSku).length;
  const todas = filtrosDeProduto(c.linhasDemanda, S.demanda).map((l) => ({ l, ...relConta(l) }));
  /* contadores pela régua geral, para bater com o que os filtros mostram */
  const nProduzir = todas.filter((x) => relConta(x.l, R.base).produzir > 0).length;
  const nMudou = todas.filter((x) => relConta(x.l, R.base).produzir !== (Number(x.l.saldoSemPedido) || 0)).length;
  const ativos = REL_FILTROS_ATIVOS();
  const secund = ativos.filter((x) => x.k !== "busca");
  const nBase = c.linhasDemanda.length;
  const escolhidas = relEscolhidas();
  const nSel = escolhidas.length;
  const cats = [...new Set(c.linhas.map((x) => x.categoria).filter(Boolean))].sort();
  const procs = [...new Set(c.linhas.map((x) => x.processo).filter(Boolean))].sort();
  const forns = fornecedoresEmUso ? fornecedoresEmUso() : (S.cad.fornecedores || []);
  const idsVis = vis.map((x) => x.l.sku);
  const todosMarcados = idsVis.length && idsVis.every((k) => R.sel.has(k));

  const th = (campo, label, cls = "", est = "") => `<th class="s ${cls}" data-relord="${campo}"${est ? ` style="${est}"` : ""}>${label}${R.ord === campo ? `<span class="ar">${R.dir === -1 ? "↓" : "↑"}</span>` : ""}</th>`;
  const chip = (id, nome, n) => `<button class="chip ${R.so === id ? "on" : ""}" data-relso="${id}">${nome} <b>${n0(n)}</b></button>`;

  const consumo = relConsumo(linhas);

  return `
  <div class="faixa-topo">
    <div style="flex:1;min-width:260px">
      <h3>Quanto produzir</h3>
      <p class="hint" style="margin:0">Alvo − estoque disponível − o que já está em produção. O alvo é o mínimo: escolha qual deles manda, para a lista toda ou produto a produto.</p>
    </div>
    <div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap">
      <button class="btn sm" data-act="rel-imprimir" title="${marcados ? `Só os ${n0(marcados)} marcados` : "O que está na tela, com os filtros de agora"}">${svg(IC.impressora)}Imprimir${marcados ? ` (${n0(marcados)})` : ""}</button>
      <button class="btn sm" data-act="rel-planilha" title="${marcados ? `Só os ${n0(marcados)} marcados` : "O que está na tela, com os filtros de agora"}">${svg(IC.dados)}Planilha${marcados ? ` (${n0(marcados)})` : ""}</button>
      <button class="btn" data-act="rel-fechar">${svg(IC.setaEsq)}Voltar à Demanda</button>
    </div>
  </div>

  <div class="card">
    <div style="padding:14px 16px 4px">
      <div class="rel-bases">
        ${REL_BASES.map(([id, nome]) => { const tb = relTotalComBase(id);
          return `<button class="rel-base ${R.base === id ? "on" : ""}" data-relbase-geral="${id}"
            title="Usar ${esc(nome.toLowerCase())} como alvo de todos os produtos da lista">
            <div class="rb-t">${esc(nome)}</div>
            <div class="rb-v">${n0(tb.pecas)}</div>
            <div class="rb-f">peças em ${n0(tb.skus)} ${tb.skus === 1 ? "produto" : "produtos"}</div></button>`; }).join("")}
      </div>
      <p class="hint" style="margin:2px 0 0">Os três números são o plano do que está filtrado agora${nExcecoes ? `, sem contar as <b>${n0(nExcecoes)}</b> ${nExcecoes === 1 ? "exceção decidida" : "exceções decididas"} linha a linha` : ""}. O total real está no rodapé da tabela.</p>
    </div>

    <div class="filters">
      <div class="fb-linha fb-topo">
        <div class="search">${svg(IC.busca)}<input class="inp" id="q-rel" style="width:280px" placeholder="Buscar SKU, produto, categoria ou processo" value="${esc(S.rel.busca)}"></div>
        <span style="font-size:12.5px;color:var(--ink-3)" class="mono">${n0(total)} SKUs${ativos.length && nBase > total ? ` <span style="color:var(--amber)">de ${n0(nBase)}</span>` : ""}</span>
        <button class="chip fb-btn-filtro ${S.rel.filtrosAbertos || secund.length ? "on" : ""}" data-act="rel-filtros"
          title="Categoria, curva, setor, processo e fornecedor">${svg(IC.filtro)}Mais filtros${secund.length ? ` <b>${n0(secund.length)}</b>` : ""}</button>
        ${marcados ? `<span class="tag" style="margin-left:4px">${n0(marcados)} ${marcados === 1 ? "marcado" : "marcados"}</span>
          <button class="btn sm ghost" data-act="rel-sel-limpar" title="Desmarcar todos">Desmarcar</button>` : ""}
      </div>
      <div class="fb-linha">
        <span class="flabel">Mostrar</span>
        ${chip("produzir", "O que produzir", nProduzir)}
        ${chip("mudou", "Mudou com esta régua", nMudou)}
        ${chip("todos", "Tudo", todas.length)}
        ${nExcecoes ? `<button class="btn sm ghost" style="margin-left:auto" data-act="rel-limpar-excecoes" title="Todos voltam a seguir a régua geral">Desfazer as ${n0(nExcecoes)} ${nExcecoes === 1 ? "exceção" : "exceções"}</button>` : ""}
      </div>
      ${S.rel.filtrosAbertos || secund.length ? `<div class="fb-painel">
        <div class="fb-linha">
          <span class="flabel">Curva</span>
          ${["todos", "A", "B", "C"].map((x) => `<button class="chip ${S.rel.abc === x ? "on" : ""}" data-relabc="${x}" title="Curva ABC — A vende mais, C vende menos">${x === "todos" ? "Todas" : x}</button>`).join("")}
          ${setores().length ? `<span class="divider"></span><span class="flabel">Setor</span>
            <button class="chip ${S.rel.setor === "todos" ? "on" : ""}" data-relsetor="todos">Todos</button>
            ${setores().map((st) => `<button class="chip ${S.rel.setor === st.nome ? "on" : ""}" data-relsetor="${esc(st.nome)}">${esc(st.nome)}</button>`).join("")}` : ""}
        </div>
        <div class="fb-linha">
          ${cats.length ? `<span class="flabel">Categoria</span>
            <select class="sel" id="f-rel-cat" style="max-width:230px" title="A categoria que vem da Magazord">
              <option value="todas">Todas as categorias</option>
              ${cats.map((x) => `<option ${S.rel.categoria === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>` : ""}
          <span class="flabel" style="margin-left:10px">Processo</span>
          <select class="sel" id="f-rel-proc" style="max-width:210px"><option value="todos">Todos os processos</option>
            ${procs.map((x) => `<option ${S.rel.processo === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>
          ${forns.length ? `<span class="flabel" style="margin-left:10px">Fornecedor</span>
            <select class="sel" id="f-rel-forn" style="max-width:230px">
              <option value="todos">Todos os fornecedores</option>
              ${forns.map((f2) => `<option value="${esc(f2.id)}" ${S.rel.fornecedor === f2.id ? "selected" : ""}>${esc(f2.nome)}</option>`).join("")}
              <option value="__sem" ${S.rel.fornecedor === "__sem" ? "selected" : ""}>— sem fornecedor definido —</option>
            </select>` : ""}
          ${ativos.length ? `<button class="btn sm ghost" data-act="rel-limpar-filtros">Limpar filtros (${n0(ativos.length)})</button>` : ""}
        </div>
      </div>` : ""}
      ${!S.rel.filtrosAbertos && secund.length ? `<div class="fb-linha fb-ativos">
        <span class="flabel">Filtrando por</span>
        ${secund.map((x) => `<button class="fb-tira" data-reltirar="${x.k}" title="Tirar este filtro">${esc(x.rot)}<span>×</span></button>`).join("")}
        <button class="btn sm ghost" data-act="rel-limpar-filtros">Limpar tudo</button>
      </div>` : ""}
    </div>

    <div class="tw"><table class="t">
      <thead>
        <tr class="grupos"><th colspan="3">Produto</th><th colspan="3">Mínimo</th><th colspan="3">Estoque</th><th colspan="2">Decisão</th></tr>
        <tr>
          <th style="width:26px">${idsVis.length ? `<input type="checkbox" class="chk" data-relsel-all="${esc(idsVis.join(","))}" ${todosMarcados ? "checked" : ""} title="Marcar todos os desta tela">` : ""}</th>
          ${th("sku", "SKU")}
          <th>Produto</th>
          ${th("minimo", "Em uso", "num")}
          ${th("sugerido", "Sugerido", "num")}
          ${th("alvo", "Alvo", "num")}
          <th class="num" title="O que está de fato na prateleira, pelo relatório da Magazord">Físico</th>
          ${th("estoque", "Disponível", "num", "")}
          ${th("emProd", "Em produção", "num")}
          ${th("produzir", "Produzir", "num")}
          <th>Ação</th></tr></thead>
      <tbody>${vis.map((x) => { const l = x.l;
        return `<tr class="clickable ${x.produzir > 0 ? "" : "apagada"} ${R.sel.has(l.sku) ? "on" : ""}" data-sku="${esc(l.sku)}">
        <td><input type="checkbox" class="chk" data-relsel="${esc(l.sku)}" ${R.sel.has(l.sku) ? "checked" : ""} aria-label="Marcar ${esc(l.sku)}"></td>
        <td class="tcell"><div class="p sku sku-trunc" style="font-size:13px;letter-spacing:0" title="${esc(l.sku)}">${esc(l.sku)}</div>
          <div class="s"><span class="abc ${l.abc}">${l.abc}</span>${l.processo ? `<span>${esc(l.processo)}</span>` : ""}</div></td>
        <td class="desc" title="${esc(l.descricao || "")}">${esc((l.descricao || "—"))}</td>
        <td class="num ${x.base === "uso" ? "" : "sumido"}">${n0(l.estMin)}</td>
        <td class="num ${x.base === "sugerido" ? "" : "sumido"}">${l.semVenda ? '<span class="tag" title="Sem venda no período — a sugestão não tem de onde sair">s/ venda</span>' : n0(l.estMinCalc)}</td>
        <td class="num tcell"><span class="rel-alvo">${n0(x.alvo)}</span>${x.base !== R.base ? ` <span class="tag" style="font-size:9px;padding:0 4px" title="Régua trocada só para este SKU — a linha fica visível mesmo que o filtro a esconderia">sua</span>` : ""}
          <div class="rel-esc">${REL_BASES.map(([id, nome]) => `<button data-relbase="${esc(l.sku)}|${id}" class="${x.base === id ? "on" : ""}" title="${esc(nome)} para este SKU">${id === "uso" ? "uso" : id === "sugerido" ? "sug" : "maior"}</button>`).join("")}</div></td>
        <td class="num" style="color:var(--ink-3)">${l.estFisico == null ? "—" : n0(l.estFisico)}</td>
        <td class="num"><b>${n0(l.estoqueReal)}</b></td>
        <td class="num" style="color:var(--ink-3)">${x.emProd ? n0(x.emProd) : "—"}</td>
        <td class="num">${x.produzir > 0 ? `<b style="font-size:14px">${n0(x.produzir)}</b>` : `<span style="color:var(--ink-4)" title="${x.alvo ? `Com o alvo de ${n0(x.alvo)}, o estoque e o que está em produção já cobrem` : "Sem mínimo em uso e sem venda para sugerir um"}">—</span>`}
          ${x.produzir > 0 && x.produzir !== (Number(l.saldoSemPedido) || 0) ? `<div class="s" style="justify-content:flex-end"><span title="Com o mínimo em uso, este produto pediria ${n0(l.saldoSemPedido)} peças">em uso: ${n0(l.saldoSemPedido)}</span></div>` : ""}</td>
        <td>${x.produzir > 0 ? `<button class="btn sm primary" data-rel-criar="${esc(l.sku)}" title="Criar pedidos de ${n0(x.produzir)} peças">Criar pedidos</button>` : ""}</td></tr>`; }).join("")
        || (R.so === "produzir"
          ? vazioLinha("pronto", "Nada a produzir", (() => {
              /* o vazio aqui é uma informação, não um beco: se outra régua pediria
                 produção, é exatamente isso que a pessoa veio saber */
              const outra = REL_BASES.filter(([id]) => id !== R.base)
                .map(([id, nome]) => ({ id, nome, t: relTotalComBase(id) })).find((o) => o.t.pecas > 0);
              return `Com ${esc(REL_BASE_FRASE[R.base])} como alvo, todo produto desta lista já está coberto pelo estoque e pelo que está em produção.`
                + (outra ? `<br>Por <b>${esc(String(outra.nome).toLowerCase())}</b> seriam <b>${n0(outra.t.pecas)}</b> peças em ${n0(outra.t.skus)} ${outra.t.skus === 1 ? "produto" : "produtos"}.` : "");
            })(),
            (() => { const outra = REL_BASES.filter(([id]) => id !== R.base)
                .map(([id, nome]) => ({ id, nome, t: relTotalComBase(id) })).find((o) => o.t.pecas > 0);
              return outra ? `<button class="btn primary sm" data-relbase-geral="${outra.id}">Ver o plano por ${esc(String(outra.nome).toLowerCase())}</button>` : ""; })())
          : vazioLinha("filtro", "Nenhum resultado", "Os filtros da Demanda estão escondendo tudo.", `<button class="btn primary sm" data-act="rel-fechar">Voltar à Demanda</button>`))}
      </tbody></table></div>
    ${total > R.limite ? `<div style="padding:14px;text-align:center;border-top:1px solid var(--line-2)"><button class="btn" data-act="rel-mais">Mostrar mais</button></div>` : ""}

    <div class="rel-tot">
      <span><b>${n0(t.pecas)}</b> peças a produzir</span>
      <span style="color:var(--ink-3)">em ${n0(t.skus)} ${t.skus === 1 ? "produto" : "produtos"}</span>
      ${t.emProd ? `<span style="color:var(--ink-3)">· ${n0(t.emProd)} já em produção</span>` : ""}
      ${t.semMinimo ? `<span class="tag amber" title="Alvo zerado: sem mínimo em uso e sem venda para sugerir um">${n0(t.semMinimo)} sem mínimo</span>` : ""}
      ${(() => { const tp = relTotais(escolhidas);
        return tp.skus ? `<button class="btn primary" style="margin-left:auto" data-act="rel-criar-todos">Criar pedidos ${marcados ? `dos ${n0(tp.skus)} marcados` : `dos ${n0(tp.skus)}`}</button>` : ""; })()}
    </div>

    ${consumo ? `<div class="rel-cons">
      <h4>O que esse plano consome de insumo</h4>
      <p class="hint" style="margin:0 0 9px">Pela receita de cada produto. O disponível já desconta o que está reservado para os pedidos que existem hoje — o plano novo disputa o que sobrou.</p>
      <table class="t" style="font-size:12.5px"><thead><tr><th>Insumo</th><th class="num">Precisa</th><th class="num">Disponível</th><th class="num">Falta comprar</th><th style="width:70px">Unidade</th></tr></thead>
      <tbody>${consumo.map((o) => `<tr class="${o.falta > 0 ? "linha-alerta" : ""}">
        <td>${esc(o.ins?.nome || "insumo apagado")}${o.ins?.codigo ? ` <span class="sku" style="font-size:10px">${esc(o.ins.codigo)}</span>` : ""}</td>
        <td class="num mono"><b>${nDec(o.precisa)}</b></td>
        <td class="num mono" style="color:var(--ink-3)">${nDec(o.livre)}</td>
        <td class="num mono">${o.falta > 0 ? `<b style="color:var(--red)">${nDec(o.falta)}</b>` : '<span style="color:var(--ink-4)">—</span>'}</td>
        <td style="font-size:11.5px;color:var(--ink-3)">${esc(o.ins?.unidade || "—")}</td></tr>`).join("")}
      </tbody></table>
      ${consumo.some((o) => o.falta > 0) ? `<p class="hint" style="margin:9px 0 0">Os produtos com insumo faltando continuam na lista: quem decide se corta assim mesmo ou espera a compra é você. A aba <b>Compras</b> tem o que pedir.</p>` : ""}
    </div>` : ""}
  </div>`;
}

/* a folha: a mesma conta, sem os controles — é o papel que vai para a mesa */
