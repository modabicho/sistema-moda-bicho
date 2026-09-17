/* ---------- produto provisório: existe na fábrica antes de existir no site ----------
   O produto novo nasce aqui: vai para a prestadora, volta, tira foto, é cadastrado
   na loja — e só então ganha SKU na Magazord. Até lá ele roda com um código
   provisório. Quando o SKU real aparece, o provisório é vinculado a ele: o histórico
   de pedidos segue junto e o que foi preenchido na fábrica (processo, pacote,
   fornecedor, etapas) permanece — a Magazord só acrescenta o que é dela. */
const PREFIXO_NOVO = "NOVO-";
const provisorios = () => S.produtos.filter((p) => p.provisorio);
function proximoCodigoProvisorio() {
  let n = Number(S.cfg?.novoSeq) || 0;
  let cod;
  do { n++; cod = PREFIXO_NOVO + String(n).padStart(4, "0"); } while (produtoDe(cod));
  return { codigo: cod, seq: n };
}
/* palavras que valem para comparar descrições — fora números soltos e ruído curto */
function palavrasDesc(t) {
  return normProc(t).replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w));
}
/* candidatos ao SKU real: produtos que vieram da Magazord e ainda não têm pedido nenhum,
   ordenados por quantas palavras da descrição batem com a do provisório */
function candidatosSkuReal(prov, limite = 8) {
  const alvo = new Set(palavrasDesc(prov?.descricao));
  const usados = new Set(S.pedidos.map((r) => opPorId(r.opId)?.sku || r.sku));
  return S.produtos
    .filter((p) => p.id !== prov?.id && !p.provisorio)
    .map((p) => {
      const w = palavrasDesc(p.descricao);
      const iguais = w.filter((x) => alvo.has(x)).length;
      const cobertura = alvo.size ? iguais / alvo.size : 0;
      /* SKU ainda sem pedido é o candidato natural: acabou de nascer na Magazord */
      const bonus = (!usados.has(p.sku) ? 0.25 : 0) + (String(p.origem) === "magazord" ? 0.1 : 0);
      return { produto: p, iguais, score: cobertura + bonus };
    })
    .filter((x) => x.iguais > 0)
    .sort((a, b) => b.score - a.score || b.iguais - a.iguais)
    .slice(0, limite);
}
/* a confirmação: o provisório passa a ser o SKU real, sem perder nada do que é da fábrica */
function vincularProvisorio(produtoId, skuReal) {
  const prov = produtoPorIdProd(produtoId);
  const alvoSku = String(skuReal || "").trim().toUpperCase();
  if (!prov || !alvoSku) return null;
  const antigo = prov.sku;
  /* se a importação já criou um produto com esse SKU, os dois viram um só:
     fica o provisório (que tem o histórico de pedidos) herdando o que é da Magazord */
  const dup = S.produtos.find((x) => x.id !== prov.id && (x.sku === alvoSku || (x.skusAnteriores || []).some((h) => h.sku === alvoSku)));
  if (dup) {
    if (dup.descricao) prov.descricao = dup.descricao;
    if (dup.categoria) prov.categoria = dup.categoria;
    if (dup.magazord) prov.magazord = dup.magazord;
    prov.foto = prov.foto || dup.foto;
    prov.urlSite = prov.urlSite || dup.urlSite;
    if (dup.producao?.fornecedorId && !prov.producao?.fornecedorId)
      prov.producao = { ...(prov.producao || {}), fornecedorId: dup.producao.fornecedorId };
    S.produtos = S.produtos.filter((x) => x.id !== dup.id);
  }
  prov.skusAnteriores = [...(prov.skusAnteriores || []), { sku: antigo, ate: iso(hoje()), provisorio: true }];
  prov.sku = alvoSku; prov.skuAtual = alvoSku;
  delete prov.provisorio;
  delete prov.cadastroIncompleto;
  prov.vinculadoEm = new Date().toISOString();
  /* os pedidos e as necessidades guardam o código antigo em texto: passam a apontar para o real */
  let refs = 0;
  for (const o of S.ops) if (o.sku === antigo) { o.sku = alvoSku; refs++; }
  for (const r of S.pedidos) if (r.sku === antigo) { r.sku = alvoSku; refs++; }
  registrar(null, `produto provisório ${antigo} vinculado ao SKU ${alvoSku}${dup ? " (cadastro duplicado da Magazord absorvido)" : ""}`, null, null);
  return { produto: prov, antigo, refs, absorveu: !!dup };
}

/* `proximoIdProduto()` MUDOU DE CASA: mora em `persistencia/produto-id.js`.
   Ela contava sozinha em `S.cfg.prodSeq`, e o `cfg` só era gravado em um dos
   oito caminhos de criação — o que produzia id repetido entre sessões e entre
   pessoas. Quem entrega o número agora é uma sequência do PostgreSQL.
   `S.cfg.prodSeq` não é mais escrito por ninguém. */
/* migração invisível: todo produto ganha identidade permanente; roda sozinha e é idempotente */
function migrarProdutosV2() {
  let mudou = false;
  for (const p of S.produtos) {
    if (!p.id) { p.id = proximoIdProduto(); mudou = true; }
    if (!p.skuAtual) { p.skuAtual = p.sku; mudou = true; }
    if (!Array.isArray(p.skusAnteriores)) { p.skusAnteriores = []; mudou = true; }
    if (!p.producao || typeof p.producao !== "object") { p.producao = {}; mudou = true; }
  }
  return mudou;
}
const linkSite = (p) => p?.urlSite || (p?.sku && S.cfg.buscaSite ? S.cfg.buscaSite.replace("{sku}", encodeURIComponent(p.sku)) : null);
const thumb = (p, cls = "") => p?.foto
  ? `<img class="foto ${cls}" src="${esc(p.foto)}" alt="" loading="lazy" data-semfoto="foto-ph">`
  : `<span class="foto-ph">sem foto</span>`;

/* ==========================================================================
   UNIR PRODUTOS · e as regras da base histórica
   --------------------------------------------------------------------------
   DUAS COISAS DIFERENTES, e a diferença é o ponto:

   BASE HISTÓRICA (`baseSkus`)  é só da CAMPANHA. Diz "ao projetar a meta deste
     produto, some também o que aquele outro SKU vendeu no ano passado". Não
     mexe em cadastro, estoque, pedido nem OP. Sai da campanha, some o efeito.

   UNIR PRODUTOS                diz que os dois SKUs SÃO o mesmo produto ao
     longo do tempo. Mexe no cadastro: o SKU antigo entra em `skusAnteriores`
     do atual e o cadastro antigo deixa de existir. Vale no app inteiro.

   O QUE A UNIÃO NÃO FAZ, de propósito:
     · não soma nem transfere estoque — `S.estoque` continua espelhando o que a
       Magazord mandou, SKU a SKU. Dois SKUs unidos continuam com dois saldos;
     · não reescreve o SKU de pedido nem de OP ENCERRADOS. O histórico guarda o
       código que valia na época, e `skusDoProduto()` já casa tudo com o mesmo
       produto (ver a exceção medida logo abaixo).

   ---------------------------------------------------------------------------
   O MAPA DE REFERÊNCIAS, levantado antes de escrever uma linha desta função.
   Quem aponta para um produto, e como:

   | onde                          | aponta por        | a união precisa mexer? |
   |-------------------------------|-------------------|------------------------|
   | `produtoDe(sku)`              | índice `prodSku`  | não — o índice já lê   |
   |                               | (sku + anteriores)|   `skusAnteriores`     |
   | `produtoPorIdProd(id)`        | `produto.id`      | não — o id do atual    |
   |                               |                   |   não muda             |
   | `skusDoProduto(sku)`          | sku + anteriores  | não                    |
   | `opAtivaDe(sku)`              | `skusDoProduto`   | não                    |
   | `pedidosDe(opId)`             | `opId`            | não                    |
   | `S.pedidos[].sku`             | texto             | **só os vivos sem OP** |
   | `S.ops[].sku`                 | texto             | **só as OPs ativas**   |
   | `S.estoque.itens[].sku`       | texto             | **NUNCA**              |
   | `S.calc.porSku`               | sku do estoque    | derivado, recalcula    |
   | campanha `itens[].sku`        | texto             | sim (ver abaixo)       |
   | campanha `itens[].baseSkus`   | texto             | sim                    |
   | campanha `vendasBase.porSku`  | texto             | **NUNCA apagar**       |
   | `S.cad.pendentesSku`          | `skuNovo`         | não — fila de decisão  |
   | `S.faltas[].sku`              | texto             | não — é histórico      |
   | semiacabados / posse          | não usam sku      | não                    |

   A EXCEÇÃO QUE O MAPA ACHOU — e é o único ponto que precisa de migração:
   `demanda/calculo.js:67-75` monta `programado` com a chave `op ? op.sku :
   r.sku`, e `:116` lê `programado.get(it.sku)`, onde `it.sku` é o SKU da linha
   do ESTOQUE. Ou seja: se a OP viva ficar com o código antigo e o estoque
   passar a ser o novo, o que está em produção deixa de contar, e a Demanda
   manda produzir de novo o que já está na rua.
   `skusDoProduto()` NÃO cobre esse caminho — ele casa OP por OP, não o mapa.
   Por isso a união carimba o SKU novo em DUAS coisas, e só nelas:
     1. as OPs em `OP_ATIVA` (pendente / em_producao);
     2. os pedidos VIVOS que não têm OP (os órfãos, que caem no `r.sku`).
   OP encerrada e pedido concluído ficam com o código da época.
   ========================================================================== */

/* ---------- 1. BASE HISTÓRICA · as validações ----------
   Elas moram AQUI, e não na tela, porque esconder a opção na busca não impede
   um clique repetido, um `data-` forjado nem um caminho futuro. A tela também
   esconde — as duas coisas, não uma. */
function festBaseConferir(campanha, item, skuBase) {
  const alvo = skuNormal(skuBase);
  const meu = skuNormal(item && item.sku);
  if (!campanha || !item) return { ok: false, erro: "Campanha ou produto não encontrado." };
  if (!alvo) return { ok: false, erro: "Diga qual SKU antigo entra na base." };

  /* A → A */
  if (alvo === meu)
    return { ok: false, erro: `${item.sku} não pode ser base histórica dele mesmo.` };

  /* duplicata */
  if ((item.baseSkus || []).some((s) => skuNormal(s) === alvo))
    return { ok: false, erro: `${alvo} já está na base histórica de ${item.sku}.` };

  const outros = (typeof itensDaCampanha === "function" ? itensDaCampanha(campanha) : [])
    .filter((i) => skuNormal(i.sku) !== meu);

  /* o mesmo SKU histórico servindo de base para dois produtos da campanha:
     a venda do ano passado entraria duas vezes na projeção */
  const jaEBaseDeOutro = outros.find((i) => (i.baseSkus || []).some((s) => skuNormal(s) === alvo));
  if (jaEBaseDeOutro)
    return { ok: false, erro: `${alvo} já é base histórica de ${jaEBaseDeOutro.sku} nesta campanha. Um SKU antigo só pode somar em um produto.` };

  /* circular: o outro já usa ESTE produto como base dele */
  const oOutro = outros.find((i) => skuNormal(i.sku) === alvo);
  if (oOutro && (oOutro.baseSkus || []).some((s) => skuNormal(s) === meu))
    return { ok: false, erro: `${item.sku} já é base histórica de ${alvo}. Um não pode ser base do outro nos dois sentidos.` };

  /* o SKU é, ele mesmo, um produto com meta na campanha: a venda dele contaria
     na linha dele E na base deste. É exatamente o caso de "Unir produtos". */
  if (oOutro)
    return { ok: false, erro: `${alvo} já é um produto desta campanha, com meta própria. Se os dois são o mesmo produto, selecione os dois em Produtos da campanha e use "Unir produtos".`, sugereUniao: true };

  return { ok: true, sku: alvo };
}

/* ---------- 2. UNIR PRODUTOS ----------
   `idAtual` é o produto PRINCIPAL, escolhido explicitamente por quem une (v8.98:
   a janela pergunta, não decide pelo produto aberto, pelo SKU nem pela ordem):
   ele é o canônico e é o que sobrevive. `skuAntigo` pode ser um produto cadastrado OU um SKU que só existe
   no estoque importado — os dois casos são válidos e o segundo é comum. */
function unirProdutosConferir(idAtual, skuAntigo) {
  const atual = typeof produtoPorIdProd === "function" ? produtoPorIdProd(idAtual) : null;
  const alvo = skuNormal(skuAntigo);
  if (!atual) return { ok: false, erro: "Produto atual não encontrado." };
  if (!alvo) return { ok: false, erro: "Diga qual é o SKU antigo." };
  if (skuNormal(atual.sku) === alvo)
    return { ok: false, erro: `${atual.sku} não pode ser unido a ele mesmo.` };
  if ((atual.skusAnteriores || []).some((h) => skuNormal(h?.sku || h) === alvo))
    return { ok: false, erro: `${alvo} já é um SKU anterior de ${atual.sku}.` };

  const antigo = produtoPorSkuFrouxo(alvo);
  if (antigo && antigo.id === atual.id)
    return { ok: false, erro: `${alvo} já aponta para ${atual.sku} — eles já são o mesmo produto.` };
  /* o antigo não pode carregar o atual na bagagem: viraria um laço */
  if (antigo && (antigo.skusAnteriores || []).some((h) => skuNormal(h?.sku || h) === skuNormal(atual.sku)))
    return { ok: false, erro: `${alvo} já tem ${atual.sku} como SKU anterior. Una no outro sentido.` };

  return { ok: true, sku: alvo, atual, antigo: antigo || null };
}

/* o que a união VAI mexer, calculado antes de mexer — é o que a janela de
   confirmação mostra, e é o mesmo cálculo que a execução usa */
function unirProdutosPrevia(idAtual, skuAntigo) {
  const c = unirProdutosConferir(idAtual, skuAntigo);
  if (!c.ok) return c;
  const { atual, antigo, sku } = c;
  const alvos = new Set([sku, ...((antigo?.skusAnteriores || []).map((h) => skuNormal(h?.sku || h)))]);
  alvos.delete(skuNormal(atual.sku));

  const opsAtivas = (S.ops || []).filter((o) =>
    alvos.has(skuNormal(o.sku)) && (typeof OP_ATIVA !== "undefined" ? OP_ATIVA : ["pendente", "em_producao"]).includes(o.status));
  const vivos = (typeof PED_VIVO !== "undefined" ? PED_VIVO : []);
  const pedidosOrfaos = (S.pedidos || []).filter((r) =>
    alvos.has(skuNormal(r.sku)) && vivos.includes(r.status) && !(typeof opPorId === "function" && opPorId(r.opId)));
  const pedidosHistoricos = (S.pedidos || []).filter((r) => alvos.has(skuNormal(r.sku))).length - pedidosOrfaos.length;

  /* campanhas: onde o antigo aparece como item próprio ou como base */
  const campanhas = [];
  for (const camp of (typeof festCampanhas === "function" ? festCampanhas() : [])) {
    const itens = (typeof itensDaCampanha === "function" ? itensDaCampanha(camp) : []);
    const oAntigo = itens.find((i) => alvos.has(skuNormal(i.sku)));
    const oAtual = itens.find((i) => skuNormal(i.sku) === skuNormal(atual.sku));
    if (!oAntigo) continue;
    campanhas.push({ id: camp.id, nome: camp.nome, arquivada: !!camp.arquivada,
      skuAntigo: oAntigo.sku, temAtual: !!oAtual,
      acao: oAtual ? "funde" : "renomeia" });
  }

  const estoqueAntigo = (S.estoque?.itens || []).filter((i) => alvos.has(skuNormal(i.sku))).length;
  const estoqueAtual = (S.estoque?.itens || []).some((i) => skuNormal(i.sku) === skuNormal(atual.sku));

  /* devolve `skuAntigo` com o mesmo nome que `unirProdutos()` usa: a janela de
     confirmação e a execução leem o mesmo campo, e não dá para uma mostrar um
     SKU e a outra unir outro. */
  return { ok: true, sku, skuAntigo: sku, atual, antigo,
    skusQueEntram: [...alvos],
    opsAtivas: opsAtivas.length, pedidosOrfaos: pedidosOrfaos.length, pedidosHistoricos,
    campanhas, estoqueAntigo, estoqueAtual,
    absorveCadastro: !!antigo };
}

function unirProdutos(idAtual, skuAntigo) {
  const p = unirProdutosPrevia(idAtual, skuAntigo);
  if (!p.ok) return p;
  const { atual, antigo, sku } = p;
  const skuAtualNorm = skuNormal(atual.sku);
  const quando = iso(hoje());

  /* --- 2.1 o cadastro antigo é absorvido, não apagado às cegas --- */
  /* mesma regra do `vincularProvisorio`: o que o atual não tem, ele herda */
  if (antigo) {
    if (!atual.descricao && antigo.descricao) atual.descricao = antigo.descricao;
    if (!atual.categoria && antigo.categoria) atual.categoria = antigo.categoria;
    if (!atual.magazord && antigo.magazord) atual.magazord = antigo.magazord;
    atual.foto = atual.foto || antigo.foto;
    atual.urlSite = atual.urlSite || antigo.urlSite;
    if (antigo.producao?.fornecedorId && !atual.producao?.fornecedorId)
      atual.producao = { ...(atual.producao || {}), fornecedorId: antigo.producao.fornecedorId };
  }

  /* --- 2.2 skusAnteriores: o antigo e tudo o que ele já carregava --- */
  const lista = [...(atual.skusAnteriores || [])];
  const poe = (sk, extra) => {
    const n = skuNormal(sk);
    if (!n || n === skuAtualNorm) return;
    if (lista.some((h) => skuNormal(h?.sku || h) === n)) return;
    lista.push({ sku: n, ate: quando, ...extra });
  };
  poe(sku, { uniao: true });
  for (const h of (antigo?.skusAnteriores || [])) {
    /* preserva o carimbo original do ancestral (o `ate` de quando ELE saiu de
       cena), mas nunca o campo `sku` do objeto de origem: espalhá-lo por cima
       sobrescrevia o SKU já normalizado com `undefined`, e a entrada sumia no
       filtro de duplicata logo abaixo. */
    const orig = (h && typeof h === "object") ? h : {};
    poe(orig.sku || h, { ate: orig.ate || quando, provisorio: orig.provisorio, uniao: orig.uniao, herdado: true });
  }
  /* normaliza e tira duplicata por SKU, guardando a primeira ocorrência */
  const visto = new Set();
  atual.skusAnteriores = lista
    .map((h) => (typeof h === "object" && h ? { ...h, sku: skuNormal(h.sku) } : { sku: skuNormal(h), ate: quando }))
    .filter((h) => h.sku && h.sku !== skuAtualNorm && !visto.has(h.sku) && visto.add(h.sku));

  if (antigo) S.produtos = S.produtos.filter((x) => x.id !== antigo.id);

  /* --- 2.3 a migração que o mapa provou ser necessária --- */
  const alvos = new Set(p.skusQueEntram);
  const ATIVAS = typeof OP_ATIVA !== "undefined" ? OP_ATIVA : ["pendente", "em_producao"];
  const VIVOS = typeof PED_VIVO !== "undefined" ? PED_VIVO : [];
  let opsMigradas = 0, pedidosMigrados = 0;
  for (const o of (S.ops || []))
    if (alvos.has(skuNormal(o.sku)) && ATIVAS.includes(o.status)) { o.sku = atual.sku; opsMigradas++; }
  for (const r of (S.pedidos || []))
    if (alvos.has(skuNormal(r.sku)) && VIVOS.includes(r.status)
        && !(typeof opPorId === "function" && opPorId(r.opId))) { r.sku = atual.sku; pedidosMigrados++; }

  /* --- 2.4 Datas Festivas, em TODAS as campanhas --- */
  const campanhasMexidas = [];
  for (const camp of (typeof festCampanhas === "function" ? festCampanhas() : [])) {
    const itens = (camp && camp.itens) || [];
    const iAntigo = itens.find((i) => alvos.has(skuNormal(i.sku)));
    if (!iAntigo) continue;
    const iAtual = itens.find((i) => skuNormal(i.sku) === skuAtualNorm);
    const trazer = [skuNormal(iAntigo.sku), ...((iAntigo.baseSkus || []).map(skuNormal))];

    if (iAtual) {
      /* os dois estavam na campanha: fica um, o antigo vira base histórica */
      const base = new Set((iAtual.baseSkus || []).map(skuNormal));
      for (const s of trazer) if (s && s !== skuAtualNorm) base.add(s);
      iAtual.baseSkus = [...base];
      camp.itens = itens.filter((i) => i !== iAntigo);
      campanhasMexidas.push({ nome: camp.nome, acao: "fundiu" });
    } else {
      /* só o antigo estava: a linha continua, com o código novo, e o antigo
         desce para a base — assim a meta não vira órfã */
      const base = new Set((iAntigo.baseSkus || []).map(skuNormal));
      base.add(skuNormal(iAntigo.sku));
      base.delete(skuAtualNorm);
      iAntigo.sku = atual.sku;
      iAntigo.baseSkus = [...base];
      campanhasMexidas.push({ nome: camp.nome, acao: "renomeou" });
    }
  }
  /* `vendasBase.porSku` e `vendasAtual.porSku` NÃO são tocados: são o
     relatório importado, e é justamente deles que a base histórica soma. */

  if (typeof registrar === "function")
    registrar(null, `produtos unidos: ${sku} passou a ser SKU anterior de ${atual.sku}`
      + (antigo ? " (cadastro antigo absorvido)" : " (SKU só existia no estoque)")
      + (opsMigradas ? ` · ${opsMigradas} OP ativa recebeu o código novo` : "")
      + (pedidosMigrados ? ` · ${pedidosMigrados} pedido vivo sem OP recebeu o código novo` : "")
      + (campanhasMexidas.length ? ` · ${campanhasMexidas.length} campanha(s) ajustada(s)` : ""), null, null);

  /* O ÍNDICE PRECISA VENCER NA MÃO. `idx()` vence por três coisas: `_rev`
     (gravação), `_ciclo` (render) e o TAMANHO das listas. Quando o SKU antigo
     só existia no estoque, nenhuma lista muda de tamanho e nenhum render
     aconteceu ainda — o índice continuaria devolvendo o mapa velho, sem o SKU
     novo em `prodSku`, e `produtoDe(antigo)` voltaria null. `mudouDados()` é
     quem incrementa `_rev`. */
  if (typeof mudouDados === "function") mudouDados();
  S.calc = null;

  return { ok: true, produto: atual, skuAntigo: sku, absorveu: !!antigo,
    opsMigradas, pedidosMigrados, campanhas: campanhasMexidas,
    skusAnteriores: atual.skusAnteriores.map((h) => h.sku) };
}

/* ---------- 3. UNIR A PARTIR DE DOIS PRODUTOS DA CAMPANHA (v8.98) ----------
   A tela de Produtos da campanha seleciona DOIS; esta é a regra de quem pode
   ficar. Mora aqui, e não na janela, pelo mesmo motivo da base histórica: um
   rádio desabilitado não impede um `data-` forjado nem um caminho futuro.

     · o principal PRECISA ter cadastro de produto — é nele que `skusAnteriores`
       mora. SKU só do estoque pode ser absorvido, nunca permanecer;
     · os dois com cadastro: qualquer um pode ficar, e quem decide é a pessoa;
     · nenhum com cadastro: não há onde a união morar, então não se une. Criar
       cadastro sozinho aqui seria decidir por ela. */
function festUnirOpcoes(c, skuA, skuB) {
  if (!c) return { bloqueio: "Campanha não encontrada.", lados: [] };
  const itens = itensDaCampanha(c);
  const acha = (sk) => itens.find((i) => skuNormal(i.sku) === skuNormal(sk)) || null;
  const ia = acha(skuA), ib = acha(skuB);
  if (!ia || !ib) return { bloqueio: "Os dois produtos precisam estar nesta campanha.", lados: [] };
  if (skuNormal(ia.sku) === skuNormal(ib.sku)) return { bloqueio: "Selecione dois produtos diferentes.", lados: [] };

  const lados = [ia, ib].map((it) => ({ sku: it.sku, item: it, produto: produtoPorSkuFrouxo(it.sku) }));
  const [a, b] = lados;
  if (a.produto && b.produto && a.produto.id === b.produto.id)
    return { bloqueio: `${a.sku} e ${b.sku} já são o mesmo produto (${a.produto.sku}).`, lados };
  if (!a.produto && !b.produto)
    return { bloqueio: `Nenhum dos dois tem cadastro de produto. O produto que permanece precisa de cadastro — cadastre um deles em Produtos e volte aqui.`, lados };

  for (const l of lados) {
    const outro = l === a ? b : a;
    if (!l.produto) { l.podeFicar = false; l.motivo = `${l.sku} está sem cadastro de produto — um SKU sem cadastro não pode ser o principal, só ser absorvido.`; continue; }
    const conf = unirProdutosConferir(l.produto.id, outro.sku);
    l.podeFicar = !!conf.ok;
    l.motivo = conf.ok ? "" : conf.erro;
  }
  if (!a.podeFicar && !b.podeFicar)
    return { bloqueio: [a.motivo, b.motivo].filter(Boolean).join(" "), lados };
  return { bloqueio: null, lados };
}

/* executa a escolha feita na janela. Sem escolha não une — não há padrão. */
function festUnirAplicar(campanhaId, skus, fica) {
  const c = campanhaPorId(campanhaId);
  const par = (skus || []).slice(0, 2);
  if (!c || par.length !== 2) return { ok: false, erro: "Selecione exatamente 2 produtos da campanha." };
  const o = festUnirOpcoes(c, par[0], par[1]);
  if (o.bloqueio) return { ok: false, erro: o.bloqueio };
  if (!fica) return { ok: false, erro: "Escolha qual produto deve permanecer." };
  const lado = o.lados.find((l) => skuNormal(l.sku) === skuNormal(fica));
  if (!lado) return { ok: false, erro: `${fica} não é um dos dois produtos selecionados.` };
  if (!lado.podeFicar) return { ok: false, erro: lado.motivo };
  const outro = o.lados.find((l) => l !== lado);

  const r = unirProdutos(lado.produto.id, outro.sku);
  if (!r.ok) return r;
  S.festivasView.selProd = [];

  /* a análise NÃO roda sozinha: meta aplicada e meta à mão são decisão. Só se
     avisa quando a meta sugerida do principal deixou de bater com a aplicada. */
  const itP = itensDaCampanha(c).find((i) => skuNormal(i.sku) === skuNormal(r.produto.sku));
  const xP = itP ? festLinha(c, itP) : null;
  const reaplicar = !!(xP && xP.metaMao == null && xP.metaAplicada != null && xP.metaAplicada !== xP.metaCalc);
  return { ...r, principal: r.produto.sku, absorvido: outro.sku, reaplicar };
}
