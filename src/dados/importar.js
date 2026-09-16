/* ---------- importação / exportação ---------- */
function escolherArquivo(accept, cb) {
  const i = document.createElement("input");
  i.type = "file"; i.accept = accept;
  i.onchange = () => i.files[0] && cb(i.files[0]);
  i.click();
}

async function importarSeed(file) {
  await precisaPapa().catch(() => {}); await precisaXlsx().catch(() => {});
  try {
    const j = JSON.parse(await file.text());
    const nP = (j.produtos || []).length, nPed = (j.pedidos || []).length, nPr = (j.prestadoras || j.cad?.prestadoras || []).length;
    S.modal = { tipo: "confirmImport", plano: {
      titulo: "Importar dados (.json)",
      linhas: [
        `Arquivo: ${file.name}`,
        `${n0(nP)} produtos · ${n0(nPed)} pedidos · ${n0(nPr)} prestadoras`,
        "Atenção: este arquivo SUBSTITUI toda a base atual (é a restauração de backup).",
        "Para atualizar sem apagar, use a planilha .xlsm.",
      ],
      aplicar: async () => {
        await aplicarCarga(j);
        S.cfg.imports = { ...(S.cfg.imports || {}), dados: new Date().toISOString() };
        await salvarTudo("cfg");
        return { titulo: "Dados importados", ok: true, linhas: [
          `${n0(S.produtos.length)} produtos · ${n0(S.pedidos.length)} pedidos · ${n0(S.cad.prestadoras.length)} prestadoras.`,
          S.estoque?.itens?.length ? `Estoque: ${n0(S.estoque.itens.length)} SKUs.` : "Sem estoque no arquivo — suba o CSV da Consulta Dinâmica.",
        ] };
      } } };
    render();
  } catch (e) { console.error(e); toast("Arquivo inválido. Use o dados-iniciais.json ou um backup do app.", "erro"); }
}

async function aplicarCarga(j) {
  S.festivas = { campanhas: (j.festivas && j.festivas.campanhas) || [] };
  S.semiTipos = j.semiTipos || []; S.remessas = j.remessas || []; S.semiAjustes = j.semiAjustes || [];
  S.produtos = j.produtos || [];
  S.estoque = j.estoque || null;
  const setoresAntes = S.cad?.setores;
  /* o backup novo traz o cad inteiro (bônus, valores por pedido, meses fechados); o antigo, só as listas soltas */
  S.cad = { ...(S.cad || {}), ...(j.cad || {}),
    prestadoras: normPrest(j.prestadoras || (j.cad || {}).prestadoras || []),
    estruturas: j.estruturas || (j.cad || {}).estruturas || [],
    mesesFechados: (j.cad && j.cad.mesesFechados) || S.cad?.mesesFechados || [],
    setores: (j.cad && j.cad.setores) || j.setores || setoresAntes || JSON.parse(JSON.stringify(SETORES_PADRAO)) };
  S.cfg = { ...CFG_PADRAO, ...(j.config || {}), padroes: { ...CFG_PADRAO.padroes, ...((j.config || {}).padroes || {}) } };
  /* backup antigo traz a lista de padrões: vira função da pessoa aqui também */
  S.cfg.padroesMigrados = false; migrarPadroesParaFuncoes();
  S.equipe = Array.isArray(j.equipe) ? j.equipe : [];
  S.eventos = Array.isArray(j.eventos) ? j.eventos : [];
  S.faltas = Array.isArray(j.faltas) ? j.faltas : [];
  /* backup versão 5 em diante traz o estoque de insumo junto; o antigo não tinha
     nada disso, e aí o que já está carregado continua valendo */
  if (Array.isArray(j.insumos)) S.insumos = j.insumos;
  if (Array.isArray(j.movInsumo)) S.movInsumo = j.movInsumo;
  if (Array.isArray(j.entradas)) S.entradas = j.entradas;
  if (Array.isArray(j.posse)) S.posse = j.posse;
  if (Array.isArray(j.bens)) S.bens = j.bens;
  if (Array.isArray(j.posseItens)) S.posseItens = j.posseItens;
  if (j.hist?.serie) { S.hist = j.hist; _histPuxado = true; }
  esquecerSaldos();

  if (Array.isArray(j.ops) && Array.isArray(j.pedidos) && j.pedidos.every((x) => x.opId !== undefined)) {
    S.ops = j.ops; S.pedidos = j.pedidos; S.analises = j.analises || [];
    if (!(j.config && j.config.escala4)) remapEscala4();
  } else if (Array.isArray(j.ops) && Array.isArray(j.remessas)) {
    const mig = migrarV3(j.ops, j.remessas);
    S.ops = mig.ops; S.pedidos = mig.pedidos; S.analises = j.analises || [];
    remapEscala4();
  } else if (Array.isArray(j.pedidos)) {
    const mig = migrarPlanilha(j.pedidos);
    S.ops = mig.ops; S.pedidos = mig.pedidos; S.analises = [mig.analise];
    S.cfg.escala4 = true; /* já nasce na escala de 4 */
  } else { S.ops = []; S.pedidos = []; S.analises = []; S.cfg.escala4 = true; }
  S.ops.forEach(recalcularOP);

  render();
  await salvarCompleto();
}

/* ---------- planilha CONTROLE_PEDIDOS (.xlsm): lê, compara e atualiza sem duplicar ---------- */
function mapPedPlan(p) {
  const st = p.status === "6. Produzido" ? "retornada"
    : p.status === "1. Separar" ? "aberto"
    : p.status === "2. Enviar" ? "separando"
    : p.status === "4. Conferir" ? "chegou" : "enviada";
  return { status: st, qtd: Number(p.qtd) || 0, prestadora: p.prestadora || null, processo: p.processo || null,
    obs: p.obs || null, separadaEm: p.dtSeparacao || null, enviadaEm: p.dtSaida || null,
    retornadaEm: st === "retornada" ? p.dtEntrada || null : null,
    qtdConferida: st === "retornada" ? (p.qtdRealizada ?? (Number(p.qtd) || 0)) : null };
}
function analiseBase() {
  let a = S.analises.find((x) => x.id === 0);
  if (!a) { a = { id: 0, rotulo: "Planilha", executadaEm: iso(hoje()) }; S.analises.unshift(a); }
  return a;
}
function opParaSku(sku, criadoEm) {
  let op = S.ops.find((o) => o.sku === sku && o.status !== "concluida") || S.ops.find((o) => o.sku === sku);
  if (!op) {
    op = { id: uid(), sku, status: "em_producao", prioridade: 4, analiseOrigemId: analiseBase().id,
      criadoEm: criadoEm || iso(hoje()), qtdNecessidade: 0, qtdProgramada: 0, saldoSemPedido: 0 };
    S.ops.push(op);
  }
  return op;
}
/* ===========================================================================
   E1 · A IMPORTAÇÃO NÃO CRIA PEDIDO
   ---------------------------------------------------------------------------
   O QUE ELA FAZIA, e por que isto não é ajuste de regra e sim barreira:

   A chave de casamento sempre foi `número § SKU`. Quando a planilha escrevia um
   SKU diferente do que o app tinha para aquele número — e ela escreve: a
   planilha diz que o pedido 1139 é `BAND.BT.MIX`, o app tem 1139 como
   `BANDANA` — a chave não casava, e a linha virava PEDIDO NOVO. Empilhado em
   `S.pedidos`, ele seguia para `pedido_criar`, que DESCARTA o número
   (`persistencia/tela.js`, o caminho de criação) e emite o próximo da
   sequência. O número da planilha sobrava só em `extra.numeroSugerido`.

   E o defeito se realimenta: o pedido criado recebe um número novo, então a
   chave dele passa a ser `2400§BAND.BT.MIX` — NUNCA `1139§BAND.BT.MIX`, que é a
   chave da linha que o criou. A linha fica órfã para sempre, e a importação
   seguinte cria outra cópia. E a seguinte, outra.

   Medido na bancada, contra o binário e a planilha de verdade
   (`testes/importacao-repete.js`): três importações da mesma planilha →
   SEIS pedidos para DUAS linhas. E a planilha inteira, contra um app sem os
   pedidos correspondentes, classificava 1.605 das 1.606 linhas como novas —
   1.605 números da sequência queimados por execução.

   A REGRA AGORA, nominal:

     · número + SKU + UM ÚNICO candidato ..... atualiza o pedido existente
     · número existe, SKU diverge ............ PENDÊNCIA. Nunca cria
     · número não existe no app .............. PENDÊNCIA. Nunca cria
     · mais de um candidato para a identidade  PENDÊNCIA. Nunca escolhe

   Zero criação de pedido. Zero número emitido. Zero `-A` fabricado — nunca
   houve, e agora está dito: o sufixo da planilha é LIDO, jamais inventado.

   O CANDIDATO VIROU LISTA, e isto é o segundo defeito consertado aqui: o mapa
   antigo era `Map<chave, pedido>`, e um `Map` GUARDA O ÚLTIMO em caso de
   colisão. Dois pedidos com o mesmo `número§SKU` faziam a importação escolher
   um sozinha, em silêncio, pela ordem da lista. Agora cada chave guarda TODOS,
   e mais de um é pendência — nunca escolha.
   =========================================================================== */
function mesclarPedidos(pedidosPlan, simular) {
  const chave = (n, s2) => String(n) + "§" + String(s2);
  /* comparar sem depender de caixa nem de espaço: "bd.20 " e "BD.20" são o
     mesmo SKU, e tratá-los como diferentes fabricaria pendência à toa */
  const nz = (x) => String(x == null ? "" : x).trim().toUpperCase();
  const chaveN = (n, s2) => nz(n) + "§" + nz(s2);

  const porChave = new Map();   /* numero§sku -> [pedido]  — TODOS, nunca o último */
  const porNumero = new Map();  /* numero     -> [pedido]  — para achar o SKU divergente */
  S.pedidos.forEach((r) => {
    const o = opPorId(r.opId) || {};
    const k = chaveN(r.numero, o.sku || r.sku);
    if (!porChave.has(k)) porChave.set(k, []);
    porChave.get(k).push(r);
    const kn = nz(r.numero);
    if (!porNumero.has(kn)) porNumero.set(kn, []);
    porNumero.get(kn).push(r);
  });

  const CAMPOS = ["status", "qtd", "prestadora", "processo", "obs", "separadaEm", "enviadaEm", "retornadaEm", "qtdConferida"];
  /* Registra o que a planilha contém — número + SKU de cada linha. É esse retrato
     que permite depois perguntar "o que existe no app e NÃO existe na planilha?",
     sem depender de marca de origem em cada pedido. */
  if (!simular) S.cad.retratoPlanilha = { em: new Date().toISOString(),
    chaves: pedidosPlan.filter((p) => p.pedido && p.sku).map((p) => chave(p.pedido, p.sku)) };

  let alterados = 0, iguais = 0;
  const pendencias = []; const alteracoes = []; const mexidos = new Set();

  for (const p of pedidosPlan) {
    if (!p.sku || !p.pedido) continue;
    const m = mapPedPlan(p);
    const candidatos = porChave.get(chaveN(p.pedido, p.sku)) || [];

    /* ---- MAIS DE UM CANDIDATO · não escolhe. Nunca. ---- */
    if (candidatos.length > 1) {
      pendencias.push({ motivo: "ambigua", numero: String(p.pedido), sku: p.sku,
        texto: `o app tem ${candidatos.length} pedidos com o número ${p.pedido} e o SKU ${p.sku}`,
        candidatos: candidatos.map((r) => ({ id: r.id, numero: r.numero, sku: r.sku, status: r.status })) });
      continue;
    }

    /* ---- NENHUM CANDIDATO · é pendência, nunca criação ---- */
    if (!candidatos.length) {
      const doNumero = porNumero.get(nz(p.pedido)) || [];
      if (doNumero.length) {
        pendencias.push({ motivo: "sku-divergente", numero: String(p.pedido), sku: p.sku,
          texto: `a planilha diz que o ${p.pedido} é ${p.sku}; no app ele é ${[...new Set(doNumero.map((r) => (opPorId(r.opId) || {}).sku || r.sku))].join(", ")}`,
          candidatos: doNumero.map((r) => ({ id: r.id, numero: r.numero, sku: (opPorId(r.opId) || {}).sku || r.sku, status: r.status })) });
      } else {
        pendencias.push({ motivo: "numero-inexistente", numero: String(p.pedido), sku: p.sku,
          texto: `o número ${p.pedido} não existe no app — quem cria pedido é o app, nunca a planilha`,
          candidatos: [] });
      }
      continue;
    }

    /* ---- UM ÚNICO CANDIDATO · correspondência inequívoca ---- */
    const alvo = candidatos[0];
    const dif = CAMPOS.filter((c2) => {
      if (c2 === "status" || c2 === "qtd") return m[c2] !== alvo[c2];
      return m[c2] != null && m[c2] !== alvo[c2];
    });
    if (!dif.length) { iguais++; continue; }
    alterados++;
    if (!simular) {
      dif.forEach((c2) => {
        alteracoes.push({ id: alvo.id, numero: alvo.numero, campo: c2, de: alvo[c2], para: m[c2] });
        alvo[c2] = m[c2];
      });
      if (m.status === "retornada" && !alvo.retornadaEm) alvo.retornadaEm = iso(hoje());
      mexidos.add(alvo.opId);
    }
  }

  if (!simular) {
    for (const id of mexidos) { const o = opPorId(id); if (o) recalcularOP(o); }
    for (const o of S.ops) {
      const vivos = S.pedidos.some((r) => r.opId === o.id && PED_VIVO.includes(r.status));
      o.status = vivos ? "em_producao" : "concluida";
    }
    S.cad.pendenciasImportacao = { em: new Date().toISOString(), itens: pendencias.slice(0, 3000) };
  }

  /* `novos` continua no relatório e vale ZERO, sempre. Quem lia o número
     continua lendo; o que mudou é que ele não pode mais ser diferente de 0. */
  return { novos: 0, alterados, iguais, pendencias, alteracoes,
    porMotivo: pendencias.reduce((a, x) => (a[x.motivo] = (a[x.motivo] || 0) + 1, a), {}) };
}

async function importarXlsm(file) {
  await precisaPapa().catch(() => {}); await precisaXlsx().catch(() => {});
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const norm = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    const lerAba = (nome, headerRow) => {
      const nomeReal = wb.SheetNames.find((n) => norm(n) === norm(nome));
      if (!nomeReal) return null;
      const grade = XLSX.utils.sheet_to_json(wb.Sheets[nomeReal], { header: 1, range: headerRow, defval: null });
      if (!grade.length) return [];
      const cab = grade[0].map(norm);
      return grade.slice(1).map((linha) => { const o = {}; cab.forEach((c2, i) => { if (c2) o[c2] = linha[i]; }); return o; });
    };
    const v = (row, ...nomes) => { for (const n of nomes) { const k = norm(n); if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") return row[k]; } return null; };
    const txt = (row, ...n) => { const x = v(row, ...n); return x == null ? null : String(x).trim() || null; };
    const nro = (row, ...n) => { const x = v(row, ...n); if (x == null) return null; if (typeof x === "number") return x;
      const t = String(x).trim().replace(/\./g, "").replace(",", "."); const f = parseFloat(t); return isNaN(f) ? null : f; };
    /* NOME DE PRESTADORA · o guarda que faltava.
       `txt` devolve `String(x).trim() || null`, e `|| null` só pega a string
       VAZIA. Uma célula numérica com zero vira `"0"`, que não é vazia e não é
       falsa — passava por `if (!nome)` e virava chave de prestadora.
       Foi assim que nasceu `procsPrestadora["0"]` na base de produção.
       A regra é estreita: nome de prestadora tem pelo menos UMA LETRA.
       "0", "12", "-", "***" não são gente. "3M" é, e passa. */
    const NAO_E_NOME = (x) => !/[A-Za-zÀ-ÿ]/.test(String(x == null ? "" : x));
    const tecnicosVistos = new Set();
    const nomePrest = (row, ...n) => { const x = txt(row, ...n);
      if (x == null || NAO_E_NOME(x)) { if (x != null) tecnicosVistos.add(String(x)); return null; }
      return x; };
    const dta = (row, ...n) => { const x = v(row, ...n);
      if (x instanceof Date && !isNaN(x)) return iso(x);
      if (typeof x === "number") { const d = new Date(Math.round((x - 25569) * 86400 * 1000)); return isNaN(d) ? null : iso(d); }
      if (typeof x === "string") { const m = x.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/); if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
        const d = new Date(x); return isNaN(d) ? null : iso(d); }
      return null; };

    /* abas que valem: ControlePedidos, ControleProcessos, Produtos (complemento), LinkEstrutura, Demanda (validação).
       Fora, de propósito: Listas, GerarPedido, Import.Estoque (estoque vem só do CSV da Consulta Dinâmica). */
    const abaPed = lerAba("ControlePedidos", 7);
    const pedidosPlan = (abaPed || []).filter((r) => txt(r, "Pedido")).map((r) => {
      let st = txt(r, "Status") || "1. Separar";
      if (st.startsWith("Atraso")) st = "3. Em Produção";
      return { codigo: txt(r, "Código"), pedido: txt(r, "Pedido"), sku: txt(r, "SKU"),
        processo: txt(r, "Processo"), qtd: nro(r, "Qtd") || 0, obs: txt(r, "Observação"),
        prestadora: nomePrest(r, "Nome Prestadora"), dtSeparacao: dta(r, "Data Separação"),
        dtSaida: dta(r, "Saída Produção"), dtEntrada: dta(r, "Entrada / Conferência"),
        mesPagamento: txt(r, "Mês Pagamento"), qtdRealizada: nro(r, "Qtde. Realiz"), status: st };
    });
    if (!pedidosPlan.length) return toast("Não achei a aba ControlePedidos — confira se é a CONTROLE_PEDIDOS.", "erro");

    const abaProc = lerAba("ControleProcessos", 5);
    const procsPrest = {}, valorPed = {}, etapasPorPedido = new Map();
    (abaProc || []).forEach((r) => {
      const nome = nomePrest(r, "Prestadora"); if (!nome) return;
      const set = procsPrest[nome] || (procsPrest[nome] = new Set());
      const p1 = txt(r, "Processo"); if (p1) set.add(p1.toUpperCase());
      for (let i = 1; i <= 6; i++) { const nm = txt(r, `Processo ${i}`); if (nm) set.add(nm.toUpperCase()); }
      const num = txt(r, "Pedido");
      const prod = nro(r, "Produzido"), tot = nro(r, "Total");
      if (num && (prod != null || tot != null)) valorPed[num] = { produzido: prod ?? null, total: tot ?? null };
    });

    const abaProd = lerAba("Produtos", 5);
    const produtosPlan = (abaProd || []).map((r) => ({ sku: txt(r, "SKU"), descricao: txt(r, "Descrição"),
      derivacao: txt(r, "Derivação"), categoria: txt(r, "Categoria"), processo: txt(r, "Processo"),
      qtdPacote: nro(r, "Qtd no Pacote") || 1, fornecimento: txt(r, "Fornecimento") })).filter((p) => p.sku);

    const abaEstr = lerAba("LinkEstrutura", 0);
    const estruturas = (abaEstr || []).filter((r) => txt(r, "Código Processo")).map((r) => {
      const etapas = [];
      for (let i = 1; i <= 6; i++) { const nm = txt(r, `Processo ${i}`); if (nm) etapas.push({ ordem: i, nome: nm, valor: nro(r, `Valor P${i}`) }); }
      return { processo: txt(r, "Código Processo"), obs: txt(r, "Observação"), etapas };
    });

    const abaDem = lerAba("Demanda", 7);
    const demandaPlan = (abaDem || []).map((r) => ({ sku: txt(r, "SKU"), status: txt(r, "Status") })).filter((x) => x.sku && x.status);

    /* prestadoras que aparecem nos pedidos e não existem no cadastro */
    const nomesPlan = [...new Set(pedidosPlan.map((p) => p.prestadora).filter(Boolean))];
    const nomesNovos = nomesPlan.filter((n) => !S.cad.prestadoras.some((x) => x.nome === n));

    /* produtos: diferença campo a campo */
    const mapaProd = new Map(S.produtos.map((p) => [p.sku, p]));
    let prodNovos = 0, prodAlt = 0, prodIguais = 0;
    const CP = ["descricao", "derivacao", "categoria", "processo", "qtdPacote", "fornecimento"];
    for (const p of produtosPlan) {
      const a = mapaProd.get(p.sku);
      if (!a) { prodNovos++; continue; }
      if (CP.some((c2) => p[c2] != null && p[c2] !== a[c2])) prodAlt++; else prodIguais++;
    }
    const simPed = mesclarPedidos(pedidosPlan, true);

    S.modal = { tipo: "confirmImport", plano: {
      titulo: "Importar planilha CONTROLE_PEDIDOS",
      linhas: [
        `Arquivo: ${file.name}`,
        /* E1 · a planilha não cria pedido. O que não casa vira pendência, com
           o motivo, e fica esperando decisão de gente. */
        `Pedidos: ${n0(simPed.alterados)} serão atualizados · ${n0(simPed.iguais)} já estão iguais · ${n0(simPed.pendencias.length)} ficam como PENDÊNCIA.`,
        simPed.pendencias.length
          ? `Pendências: ${n0(simPed.porMotivo["numero-inexistente"] || 0)} com número que não existe no app · ${n0(simPed.porMotivo["sku-divergente"] || 0)} com SKU divergente · ${n0(simPed.porMotivo["ambigua"] || 0)} com mais de um pedido possível. Nenhuma delas cria pedido.`
          : "Nenhuma pendência: toda linha da planilha casou com um pedido do app.",
        `Produtos: ${n0(prodNovos)} novos · ${n0(prodAlt)} alterados · ${n0(prodIguais)} iguais (fotos e links são preservados).`,
        nomesNovos.length ? `Prestadoras novas: ${nomesNovos.join(", ")}` : `Prestadoras: nenhuma nova.`,
        tecnicosVistos.size ? `Ignorados como prestadora (sem nenhuma letra, é valor técnico da planilha): ${[...tecnicosVistos].map((x) => `"${x}"`).join(", ")}.` : null,
        "A planilha NUNCA cria pedido e nunca emite número: quem numera é o app.",
        abaProc?.length ? `Controle de Processos: ${n0(abaProc.length)} linhas — traz a quantidade lançada em cada etapa de cada pedido, o valor por peça e o que cada prestadora faz. É o que preenche a Conferência de processos, para o histórico não começar do zero.` : "Aba ControleProcessos não encontrada.",
        "Nada é apagado nem duplicado: pedidos criados no app ficam como estão.",
        "Estoque NÃO vem da planilha — use o CSV da Consulta Dinâmica.",
      ],
      aplicar: async () => {
        /* E1 · a trava do estrangulamento vale por TODA a importação, inclusive
           pela gravação no fim: é lá que uma criação sairia pelo fio.

           E ELA FECHA NO `finally`, SEMPRE. A primeira escrita fechava a trava
           na linha seguinte ao `salvarCompleto()` — e bastava qualquer exceção
           no meio (uma aba da planilha faltando, a gravação estourando, um
           campo que veio diferente) para o escopo ficar LIGADO. A partir dali,
           enquanto ninguém recarregasse a página, a trava recusaria a criação
           NORMAL de pedido, feita pela tela: uma proteção contra importação
           virando um app que não deixa mais criar nada.

           A trava é uma barreira contra defeito; ela não pode ser a origem de
           outro. Por isso o `finally` — e por isso o relatório de recusas é
           lido do valor devolvido por ele, e não de uma segunda chamada. */
        let rel = null, trava = { recusas: [] };
        /* estes quatro são contados DENTRO do bloco e lidos DEPOIS dele, no
           relatório — por isso nascem aqui fora, e não dentro do `try` */
        let comEtapas = 0, batem = 0, divergem = 0, etapasDeduzidas = 0;
        /* B · A FOTO ANTES DE TUDO · nada acontece sem ela.
           Isto vem ANTES de abrir o escopo, e antes de qualquer alteração: uma
           recusa aqui não mexeu em nada, e o relatório pode dizer isso sem
           mentir. Ver o porquê em `persistencia/tela.js`. */
        const foto = typeof importacaoFotoPronta === "function"
          ? await importacaoFotoPronta() : { status: "ok", motivo: "sem-camada" };
        if (foto.status !== "ok") {
          return { titulo: "Importação recusada", ok: false, linhas: [
            "O app ainda não recebeu do servidor a lista de pedidos — e sem ela a importação não tem como saber o que já existe lá.",
            `A tela tem ${n0(foto.naTela)} pedido(s) e a lista do servidor não chegou${foto.resposta && foto.resposta.status ? ` (${foto.resposta.status})` : ""}.`,
            "NADA foi alterado: nenhum pedido, nenhum produto, nenhuma prestadora, e nada foi gravado.",
            "Espere a tela terminar de abrir, confira a internet e importe de novo. Se insistir, me avise.",
          ] };
        }
        importacaoAbrirEscopo("planilha .xlsm");
        try {
        rel = mesclarPedidos(pedidosPlan, false);
        /* ControleProcessos: qual etapa cada SKU realmente usou (Qtd Pn > 0) — vira o padrão do produto */
        const usoEtapas = (() => {
          const nomeCP = wb.SheetNames.find((n) => norm(n) === norm("ControleProcessos"));
          if (!nomeCP) return null;
          const grade = XLSX.utils.sheet_to_json(wb.Sheets[nomeCP], { header: 1, range: 5, defval: null });
          const uso = new Map();
          for (const l of grade.slice(1)) {
            if (!l || !l[1]) continue;
            const sku2 = String(l[1]).trim();
            for (let k = 0; k < 6; k++) {
              const nome2 = String(l[5 + 4 * k] || "").trim().toUpperCase();
              const qtd2 = Number(l[8 + 4 * k]) || 0;
              if (nome2 && qtd2 > 0) { if (!uso.has(sku2)) uso.set(sku2, new Set()); uso.get(sku2).add(nome2); }
            }
            /* as quantidades por etapa do próprio pedido: é isto que enche a Conferência de
               processos. Sem elas a tela nasce vazia e o histórico teria de ser redigitado.
               Zero digitado conta como lançamento (a etapa que a prestadora não fez), por isso
               a checagem é contra null/"" e não contra o valor ser falsy. */
            const num2 = String(l[0] ?? "").trim();
            if (!num2) continue;
            const ets = [];
            for (let k = 0; k < 6; k++) {
              const nome2 = String(l[5 + 4 * k] || "").trim().toUpperCase();
              const vu2 = Number(l[6 + 4 * k]);
              const q2 = l[8 + 4 * k];
              if (!nome2 || nome2 === "-" || q2 === null || q2 === undefined || q2 === "") continue;
              ets.push({ nome: nome2, vu: isFinite(vu2) ? vu2 : 0, qtd: Number(q2) || 0 });
            }
            if (ets.length) etapasPorPedido.set(num2.toUpperCase(), ets);
          }
          return uso;
        })();
        /* aplica no pedido: etapas, custo real e o produzido (última etapa preenchida) */
        /* declarados acima do `try`: lidos no relatório, que fica depois dele */
        for (const r2 of S.pedidos) {
          const ets = etapasPorPedido.get(String(r2.numero || "").trim().toUpperCase());
          if (!ets || !ets.length) continue;
          r2.etapas = ets.map((e) => ({ ...e }));
          const calc = ets.reduce((s2, e) => s2 + (e.qtd || 0) * (e.vu || 0), 0);
          r2.custoReal = calc || null;
          if (r2.qtdConferida == null) r2.qtdConferida = ets[ets.length - 1].qtd;
          const daPlanilha = (valorPed[r2.numero] || {}).total;
          if (daPlanilha != null) { if (Math.abs(calc - daPlanilha) < 0.005) batem++; else divergem++; }
          comEtapas++;
        }
        for (const p of produtosPlan) {
          const a = mapaProd.get(p.sku);
          if (!a) {
            /* o objeto vem CRU da planilha, sem `id` — e produto sem id é
               descartado em silêncio pela fusão multiusuário. `migrarProdutosV2()`
               logo abaixo só roda quando a aba ControleProcessos traz
               quantidades, então não dava para contar com ela. */
            S.produtos.push(Object.assign({ id: proximoIdProduto(), skuAtual: p.sku,
              skusAnteriores: [], producao: {}, criadoEm: iso(hoje()), origem: "planilha" }, p));
            continue;
          }
          CP.forEach((c2) => { if (p[c2] != null) a[c2] = p[c2]; });
        }
        for (const n of nomesNovos) S.cad.prestadoras.push({ nome: n, ativo: true, processos: [] });
        if (estruturas.length) S.cad.estruturas = estruturas;
        /* `etapasDeduzidas` também nasce acima do `try` */
        if (usoEtapas && usoEtapas.size) {
          migrarProdutosV2();
          for (const p of S.produtos) {
            if (Array.isArray(p.etapasUsadas) && p.etapasUsadas.length) continue; /* escolha manual manda */
            const uso = usoEtapas.get(p.sku) || (p.skusAnteriores || []).map((h) => usoEtapas.get(h.sku)).find(Boolean);
            if (!uso || !uso.size) continue;
            const tpl2 = tplDoProcesso(p.processo);
            const marcadas = tpl2.etapas.filter((e2) => uso.has(String(e2).toUpperCase()) || /EMBALA/.test(String(e2).toUpperCase()));
            if (marcadas.length && marcadas.length < tpl2.etapas.length) { p.etapasUsadas = marcadas; etapasDeduzidas++; }
          }
        }
        S.cad.procsPrestadora = S.cad.procsPrestadora || {};
        for (const [nome, set] of Object.entries(procsPrest))
          S.cad.procsPrestadora[nome] = [...new Set([...(S.cad.procsPrestadora[nome] || []), ...set])];
        S.cad.valorPed = Object.assign(S.cad.valorPed || {}, valorPed);
        S.cfg.escala4 = true;
        S.cfg.imports = { ...(S.cfg.imports || {}), planilha: new Date().toISOString() };
        render();
        await salvarCompleto();
        } finally {
          /* E1 · fecha a trava SEMPRE — deu certo ou estourou. Se recusou
             alguma coisa, é DEFEITO (alguém empilhou pedido durante a
             importação) e a tela precisa dizer, não engolir. O erro, se
             houve, segue subindo: `finally` sem `catch` não engole nada. */
          trava = importacaoFecharEscopo();
        }
        const preservadosIds = new Set(trava.preservados || []);
        const travaPreservados = (trava.recusas || []).filter((x) => preservadosIds.has(x.id));
        const travaRemovidos = (trava.recusas || []).filter((x) => !preservadosIds.has(x.id));
        const linhas = [
          `Pedidos: ${n0(rel.alterados)} atualizados · ${n0(rel.iguais)} já estavam iguais · ${n0(rel.pendencias.length)} pendências. Nenhum pedido criado — a planilha não cria.`,
          rel.pendencias.length
            ? `Pendências para decidir: ${n0(rel.porMotivo["numero-inexistente"] || 0)} número que não existe no app · ${n0(rel.porMotivo["sku-divergente"] || 0)} SKU divergente · ${n0(rel.porMotivo["ambigua"] || 0)} mais de um pedido possível.`
            : null,
          /* A · as duas recusas NÃO são a mesma coisa, e chamar as duas de
             defeito assustava à toa. Pedido que já estava na tela e ainda não
             está na lista do servidor é NORMAL (foi criado no app e a listagem
             é mais velha que ele). Pedido que apareceu DURANTE a importação é
             que é defeito — e é o único que some. */
          travaRemovidos.length
            ? `ATENÇÃO · a trava barrou ${n0(travaRemovidos.length)} pedido(s) que apareceram DURANTE a importação: ${travaRemovidos.slice(0, 10).map((x) => `${x.numero || "?"}/${x.sku || "?"}`).join(", ")}. Nada foi enviado ao servidor e eles não ficaram na tela. Avise quem cuida do sistema — isto é defeito.`
            : null,
          travaPreservados.length
            ? `${n0(travaPreservados.length)} pedido(s) da sua tela ainda não constam na lista do servidor: ${travaPreservados.slice(0, 10).map((x) => `${x.numero || "?"}/${x.sku || "?"}`).join(", ")}. Eles continuam na tela e nada deles foi enviado durante a importação — sobem na próxima gravação normal.`
            : null,
          comEtapas ? `Conferência de processos: ${n0(comEtapas)} pedidos vieram com as quantidades por etapa${batem + divergem ? ` — ${n0(batem)} com total idêntico ao da planilha${divergem ? ` e ${n0(divergem)} divergindo (aparecem marcados na tela)` : ""}` : ""}.` : "ControleProcessos sem quantidades por etapa — a Conferência de processos ficará vazia.",
          `Produtos: ${n0(prodNovos)} novos · ${n0(prodAlt)} atualizados.`,
          nomesNovos.length ? `Prestadoras adicionadas: ${nomesNovos.join(", ")}.` : null,
          tecnicosVistos.size ? `Ignorados como prestadora: ${[...tecnicosVistos].map((x) => `"${x}"`).join(", ")} — sem nenhuma letra, é valor técnico da planilha.` : null,
        ].filter(Boolean);
        if (S.estoque?.itens?.length && demandaPlan.length) {
          const calc = calcular();
          let ok = 0, tot = 0;
          for (const d of demandaPlan) { const l = calc.porSku.get(d.sku); if (!l) continue; tot++; if (l.classe === d.status) ok++; }
          linhas.push(`Validação contra a aba Demanda: ${n0(ok)} de ${n0(tot)} status idênticos.`);
        } else if (demandaPlan.length) {
          linhas.push("Sem estoque no app para validar a Demanda — suba o CSV da Consulta Dinâmica.");
        }
        if (etapasDeduzidas) linhas.push(`Etapas de produção deduzidas do histórico (ControleProcessos) para ${n0(etapasDeduzidas)} SKUs — confira nos produtos e complete os que nunca produziram.`);
        return { titulo: "Planilha importada", ok: true, linhas };
      } } };
    render();
  } catch (e) { console.error(e); toast("Não consegui ler a planilha .xlsm.", "erro"); }
}

async function importarCsv(file) {
  await precisaPapa().catch(() => {}); await precisaXlsx().catch(() => {});
  try {
    const buf = await file.arrayBuffer();
    let txt2 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    if (txt2.includes("\uFFFD")) txt2 = new TextDecoder("iso-8859-1").decode(buf);
    const r = Papa.parse(txt2.trim(), { header: true, delimiter: ";", skipEmptyLines: true });
    const col = (row, ...nomes) => { for (const n of nomes) { const k = Object.keys(row).find((x) => x.trim().toLowerCase() === n.toLowerCase()); if (k) return row[k]; } return ""; };
    /* os dois relatórios da Magazord entram pela mesma porta: quem manda é o cabeçalho.
       Consultar Estoque traz "Quantidade Disp. Venda"; Consulta Dinâmica traz "Vendas no Período". */
    const cabecalhos = Object.keys(r.data[0] || {}).map((k) => k.trim().toLowerCase());
    const ehConsultarEstoque = cabecalhos.some((k) => k.includes("quantidade disp")) || cabecalhos.some((k) => k.includes("codigo der") || k.includes("código der"));
    if (ehConsultarEstoque) return importarCsvEstoque(r.data, file, col);
    const itens = r.data.map((row) => ({
      sku: String(col(row, "Código", "Codigo", "SKU") || "").trim(),
      produto: col(row, "Produto"), derivacao: col(row, "Derivação", "Derivacao"),
      vendas: numBR(col(row, "Vendas no Período", "Vendas no Periodo")),
      valorVendido: numBR(col(row, "Valor Vendido")), valorUnit: numBR(col(row, "Valor Unitário", "Valor Unitario")),
      estDisponivel: numBR(col(row, "Estoque Disponível", "Estoque Disponivel")),
      estVirtual: numBR(col(row, "Estoque Virtual")),
      estReservado: numBR(col(row, "Estoque Reservada Saída", "Estoque Reservada Saida")),
      estMinimo: numBR(col(row, "Estoque Mínimo", "Estoque Minimo")),
      categoria: col(row, "Categoria Principal"),
      fornecedor: String(col(row, "Fornecedor", "Fornecedor Principal", "Nome do Fornecedor", "Nome Fornecedor", "Fantasia Fornecedor") || "").trim(),
    })).filter((x) => x.sku);
    if (!itens.length) return toast("Nenhuma linha reconhecida — o CSV é o da Consulta Dinâmica (separado por ponto e vírgula)?", "erro");
    const pIni = $("#per-ini")?.value || S.estoque?.periodoIni || new Date().getFullYear() + "-01-01";
    const pFim = $("#per-fim")?.value || iso(hoje());
    const meses = Math.max(0.5, Math.round(((pdate(pFim) - pdate(pIni)) / 2592000000) * 10) / 10);
    const anteriores = new Map((S.estoque?.itens || []).map((x) => [x.sku, x]));
    const mandaEstoque = (x) => !!x && x.origemEstoque === "consultarEstoque";
    const novosSkus = itens.filter((x) => !anteriores.has(x.sku)).length;
    const preservados = [...anteriores.values()].filter((a) => mandaEstoque(a) && !itens.some((n) => n.sku === a.sku));
    const sumiram = [...anteriores.keys()].filter((k) => !itens.some((x) => x.sku === k)).length - preservados.length;
    S.modal = { tipo: "confirmImport", plano: {
      titulo: "Atualizar vendas e estoque (Consulta Dinâmica)",
      linhas: [
        `Arquivo: ${file.name} · ${n0(itens.length)} SKUs com venda no período.`,
        `Período de vendas: ${fdate(pIni)} a ${fdate(pFim)} (${meses} meses) — confira antes de aplicar, é ele que define a média mensal.`,
        `Mínimo sugerido = vendas ÷ ${meses} meses × ${nMeses(S.cfg.mesesEstoqueSeguranca)} meses de cobertura (+1 mês p/ fornecimento externo)${regrasMeses().filter((r) => r.processo).length ? `, exceto ${regrasMeses().filter((r) => r.processo).map((r) => r.processo).join(", ")} — que têm régua própria por curva.` : "."}`,
        anteriores.size ? `Em relação à carga atual: ${n0(novosSkus)} SKUs novos · ${n0(sumiram)} saíram do relatório.` : "Primeira carga de estoque.",
        "O estoque de todos estes SKUs vem deste arquivo — o passo 2 não sobrescreve nenhum deles.",
        preservados.length ? `${n0(preservados.length)} SKUs do Consultar Estoque não vendem no período e são mantidos, com venda zero — não somem mais da Demanda.` : null,
        !S.estoque?.estoqueEm ? "Ainda não há Consultar Estoque carregado, então o estoque vem deste arquivo mesmo." : null,
      ].filter(Boolean),
      aplicar: async () => {
        /* Regra de origem: quem está no Faderim tem o estoque do Faderim, sempre.
           O passo 2 nunca sobrescreve — ele só cobre os SKUs que o Faderim não lista,
           por não terem vendido no período (data festiva, lançamento). Assim não há
           como um relatório mais velho estragar o estoque do outro. */
        const mesclados = itens.map((n) => {
          const a = anteriores.get(n.sku);
          /* mantém do cadastro anterior o que o Faderim não traz: marca, custo, foto */
          return { ...(a || {}), ...n, origemEstoque: "dinamica", semVenda: !(Number(n.vendas) > 0) };
        });
        const itensFinais = mesclados.concat(preservados.map((a) => ({ ...a, vendas: 0, valorVendido: 0, semVenda: true })));
        S.estoque = { ...(S.estoque || {}), importadoEm: new Date().toISOString(), vendasEm: new Date().toISOString(),
          periodoIni: pIni, periodoFim: pFim, itens: itensFinais };
        const itens2 = itensFinais;
        const sinc = sincronizarProdutosComCsv(itens2);
        histRegistrar();
        salvarTudo("hist");
        render();
        /* v8.50 · a foto vai para a tabela ANTES do documento. Cada importação
           vira uma linha nova em `pcp_estoque_foto` — nada substitui nada, e o
           conflito de duas pessoas importando no mesmo dia deixa de existir. */
        if (typeof estImportar === "function") {
          const rEst = await estImportar("dinamica", itensFinais, pIni, pFim,
            (file && file.name) || null);
          if (rEst && rEst.status !== "ok" && rEst.status !== "desligado") {
            console.error("foto de estoque não subiu:", rEst);
            toast("O estoque entrou na tela, mas a foto não subiu para o servidor: "
              + (rEst.motivo || rEst.status), "erro");
          }
        }
        await salvarTudo("estoque", "produtos", "cad");
        const calc = S.calc || calcular();
        return { titulo: "Vendas atualizadas", ok: true, linhas: [
          `${n0(itens.length)} SKUs com venda · período ${fdate(pIni)} a ${fdate(pFim)}.`,
          `${n0(novosSkus)} SKUs novos · ${n0(sumiram)} saíram do relatório${preservados.length ? ` · ${n0(preservados.length)} mantidos pelo Consultar Estoque, com venda zero` : ""}.`,
          `Estoque real = disponível − virtual (o disponível do Faderim já vem sem a reserva).`,
          `Cadastro sincronizado: ${n0(sinc.atualizados)} produtos atualizados pela Magazord · ${n0(sinc.novosN)} produtos novos criados (configuração de produção pendente)${sinc.suspeitasN ? ` · ${n0(sinc.suspeitasN)} possíveis alterações de SKU aguardando sua confirmação em Produtos` : ""}.`,
          sinc.fornVinculados ? `Fornecedores vinculados pela planilha: ${n0(sinc.fornVinculados)} produtos${sinc.fornSemPrazo ? ` — ${n0(sinc.fornSemPrazo)} fornecedores ainda sem prazo (defina em Produtos › Fornecedores)` : ""}.` : null,
          "Os dados internos de produção (embalagem, etapas, quantidade) nunca são alterados pela importação.",
          `Demanda recalculada: ${n0(calc.linhasDemanda.filter((l) => /Produzir/.test(l.classe)).length)} SKUs para produzir · ${n0(calc.linhasDemanda.filter((l) => /Cobrar/.test(l.classe)).length)} para cobrar.`,
          "Vá em Demanda e toque em Aplicar análise para atualizar as prioridades.",
        ].filter(Boolean) };
      } } };
    render();
  } catch { toast("Não foi possível ler o arquivo.", "erro"); }
}

/* ---------- passo 2 · Consultar Estoque ----------
   A Consulta Dinâmica só traz quem vendeu no período. Quem não vendeu — item de data
   festiva, lançamento, produto sazonal — simplesmente não existe lá, e por isso ficava
   invisível na Demanda. Este relatório é o catálogo inteiro: ele completa a fotografia
   sem apagar as vendas que já vieram da Dinâmica. */
async function importarCsvEstoque(linhas, file, col) {
  const sim = (v) => /^s/i.test(String(v || "").trim());
  const lidos = linhas.map((row) => ({
    sku: String(col(row, "Produto/Derivação Código Der.", "Código Der.", "Codigo Der.", "Código", "SKU") || "").trim(),
    derivacao: col(row, "Produto/Derivação Derivação", "Derivação", "Derivacao"),
    marca: col(row, "Produto/Derivação Marca", "Marca"),
    ativo: sim(col(row, "Produto/Derivação Ativo", "Ativo")),
    estFisico: numBR(col(row, "Quantidade Física", "Quantidade Fisica")),
    estDisponivel: numBR(col(row, "Quantidade Disp. Venda", "Quantidade Disponível")),
    estVirtual: numBR(col(row, "Quantidade Virtual")),
    estReservado: numBR(col(row, "Quantidade Reservada Saída", "Quantidade Reservada Saida")),
    estMinimo: numBR(col(row, "Quantidade Min. Estoque", "Quantidade Minima Estoque")),
    previstaEntrada: numBR(col(row, "Quantidade Prevista Entrada")),
    custoMedio: numBR(col(row, "Custo Médio de Estoque", "Custo Medio de Estoque")),
  })).filter((x) => x.sku);
  if (!lidos.length) return toast("Nenhuma linha reconhecida neste CSV.", "erro");

  const atuais = new Map((S.estoque?.itens || []).map((x) => [x.sku, x]));
  const novos = lidos.filter((x) => !atuais.has(x.sku));
  const novosAtivos = novos.filter((x) => x.ativo);
  const novosInativos = novos.length - novosAtivos.length;
  const comMinimo = novosAtivos.filter((x) => x.estMinimo > 0).length;
  const aProduzir = novosAtivos.filter((x) => x.estMinimo > 0 && x.estFisico - x.estReservado < x.estMinimo).length;
  const semRelatorio = [...atuais.keys()].filter((k) => !lidos.some((x) => x.sku === k)).length;
  /* a conta herdada da planilha (disponível − virtual − reservado) desconta a reserva duas vezes;
     aqui dá para medir a diferença exata, porque o relatório traz a Quantidade Física. */
  const divergencia = lidos.reduce((s2, x) => s2 + ((x.estDisponivel - x.estVirtual - x.estReservado) - (x.estFisico - x.estReservado)), 0);
  const skusDivergentes = lidos.filter((x) => x.estReservado > 0).length;

  S.modal = { tipo: "confirmImport", plano: {
    titulo: "Completar estoque com o Consultar Estoque",
    linhas: [
      `Arquivo: ${file.name} · ${n0(lidos.length)} linhas (catálogo inteiro).`,
      "Este relatório não mexe no estoque de quem já veio do Faderim — ele entra com produto, marca (fornecedor) e situação, e só entrega estoque para os SKUs que o Faderim não lista, por não terem vendido no período.",
      atuais.size ? `Já havia ${n0(atuais.size)} SKUs vindos da Consulta Dinâmica — as vendas deles não são tocadas, só as quantidades de estoque se atualizam.`
        : "Não há Consulta Dinâmica carregada: os SKUs entram sem venda até você subir o passo 3.",
      `Entram agora: ${n0(novosAtivos.length)} SKUs ativos que não vendiam no período — ${n0(comMinimo)} têm estoque mínimo definido e ${n0(aProduzir)} já estão abaixo dele.`,
      novosInativos ? `${n0(novosInativos)} SKUs inativos foram ignorados (produto fora de linha não vira demanda).` : null,
      semRelatorio ? `${n0(semRelatorio)} SKUs que estavam na carga não aparecem neste relatório — ficam como estão.` : null,
      skusDivergentes ? `Atenção: em ${n0(skusDivergentes)} SKUs com reserva, a conta antiga de estoque real difere ${n0(Math.abs(divergencia))} peças da Quantidade Física. Nada muda agora — veja "Como calcular o estoque real" em Dados.` : null,
      "Os produtos novos entram no cadastro com configuração de produção pendente, para você definir processo e embalagem.",
    ].filter(Boolean),
    aplicar: async () => {
      const itens = (S.estoque?.itens || []).slice();
      const idx = new Map(itens.map((x, i) => [x.sku, i]));
      let atualizados = 0, incluidos = 0;
      for (const x of lidos) {
        const i = idx.get(x.sku);
        if (i != null) {
          /* SKU que já veio do Faderim: o estoque dele é do passo 1 e ponto.
             Daqui entram só cadastro — marca (que vira fornecedor), custo e situação. */
          itens[i] = { ...itens[i], custoMedio: x.custoMedio, ativo: x.ativo, marca: x.marca };
          atualizados++;
        } else if (x.ativo) {
          /* SKU que o Faderim não lista, por não ter vendido no período: só neste caso
             o estoque vem do passo 2, porque não existe outra fonte para ele. */
          itens.push({ ...x, produto: "", vendas: 0, valorVendido: 0, valorUnit: 0,
            categoria: "", fornecedor: "", semVenda: true, origemEstoque: "consultarEstoque" });
          incluidos++;
        }
      }
      S.estoque = { ...(S.estoque || { periodoIni: new Date().getFullYear() + "-01-01", periodoFim: iso(hoje()) }),
        itens, estoqueEm: new Date().toISOString(), importadoEm: S.estoque?.importadoEm || new Date().toISOString() };
      const sinc = sincronizarProdutosComCsv(itens);
      histRegistrar();
      render();
      if (typeof estImportar === "function") {
        const rEst = await estImportar("consultarEstoque", itens,
          S.estoque?.periodoIni || null, S.estoque?.periodoFim || null, (file && file.name) || null);
        if (rEst && rEst.status !== "ok" && rEst.status !== "desligado") {
          console.error("foto de estoque não subiu:", rEst);
          toast("O estoque entrou na tela, mas a foto não subiu para o servidor: "
            + (rEst.motivo || rEst.status), "erro");
        }
      }
      await salvarTudo("estoque", "produtos", "cad", "hist");
      const calc = S.calc || calcular();
      const semVendaProduzir = calc.linhasDemanda.filter((l) => l.semVenda && /Produzir/.test(l.classe)).length;
      return { titulo: "Estoque completado", ok: true, linhas: [
        `${n0(atualizados)} SKUs tiveram o estoque atualizado · ${n0(incluidos)} SKUs novos entraram na Demanda.`,
        `Desses novos, ${n0(semVendaProduzir)} já aparecem como "Produzir" — são os que têm mínimo definido e estoque abaixo dele.`,
        `Cadastro: ${n0(sinc.novosN)} produtos criados (configuração de produção pendente) · ${n0(sinc.atualizados)} atualizados.`,
        "Eles entram marcados como sem venda no período: aparecem na Demanda com a etiqueta 'sem venda', mas não furam a fila como Crítico — o filtro 'Sem venda no período' junta todos.",
        "Se são produtos de data festiva, use esse filtro para planejar a produção com antecedência.",
      ] };
    } } };
  render();
}

/* ---------- bibliotecas sob demanda ----------
   PapaParse e SheetJS somam ~1 MB e só servem para ler planilha. Carregadas no
   topo da página, elas travavam a abertura do app mesmo para quem só ia olhar a
   fila de produção. Agora chegam no primeiro uso — e ficam guardadas depois. */
const _libs = {};
function carregarLib(nome, url, teste) {
  if (teste()) return Promise.resolve();
  if (_libs[nome]) return _libs[nome];
  _libs[nome] = new Promise((ok, erro) => {
    const t = document.createElement("script");
    t.src = url; t.async = true;
    t.onload = () => ok();
    t.onerror = () => { _libs[nome] = null; erro(new Error(`Não consegui carregar ${nome} — verifique a internet.`)); };
    document.head.appendChild(t);
  });
  return _libs[nome];
}
const precisaPapa = () => carregarLib("PapaParse", "https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js", () => typeof Papa !== "undefined");
const precisaXlsx = () => carregarLib("SheetJS", "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", () => typeof XLSX !== "undefined");

async function importarVinculo(file, tipo) {
  await precisaPapa().catch(() => {}); await precisaXlsx().catch(() => {});
  try {
    let linhas = [];
    if (/\.(xlsx|xls|xlsm)$/i.test(file.name)) {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    } else {
      const buf = await file.arrayBuffer();
      let txt2 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      if (txt2.includes("\uFFFD")) txt2 = new TextDecoder("iso-8859-1").decode(buf);
      const l0 = txt2.split("\n")[0];
      const delim = (l0.match(/;/g) || []).length > (l0.match(/,/g) || []).length ? ";" : ",";
      linhas = Papa.parse(txt2.trim(), { header: true, delimiter: delim, skipEmptyLines: true }).data;
    }
    if (!linhas.length) return toast("Planilha vazia.", "erro");

    /* ---------- varredura total das colunas: reconhece por pontuação, guarda TUDO ---------- */
    const chaves = Object.keys(linhas[0]);
    const norm = (k) => String(k).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    /* candidatos em ORDEM DE PRIORIDADE: o primeiro cabeçalho que contém o termo (e não é proibido) vence.
       Calibrado nos exports reais da Magazord: Consulta Dinâmica, Consultar Estoque e Consulta de Derivação. */
    const acha = (candidatos, proibidos = []) => {
      for (const termo of candidatos) {
        const k = chaves.find((k2) => { const kk = norm(k2);
          return kk.includes(termo) && !proibidos.some((px) => kk.includes(px)); });
        if (k) return k;
      }
      return null;
    };
    const K = {
      sku:      acha(["codigo der", "codigo do produto", "codigo sku", "sku", "codigo", "referencia"],
                     ["id", "pai", "agrupador", "alternativo", "barra", "ncm", "fornecedor"]),
      /* "titulo" vem antes de "descricao": na exportação de catálogo a coluna
         Descricao traz a página inteira em HTML, que não serve como nome. */
      nome:     acha(["nome do produto", "produto - derivacao", "produto/derivacao derivacao", "titulo", "nome da derivacao", "descricao resumida", "nome", "produto"],
                     ["id", "tags", "codigo", "ativo", "url", "imagem", "fornecedor", "categoria", "marca", "complement", "palavra", "data", "atualiz", "meta"]),
      deriv:    acha(["nome da derivacao", "derivacao", "variacao"],
                     ["id", "codigo", "ativo", "marca", "produto/derivacao derivacao", "produto - derivacao", "data", "atualiz"]),
      categoria: acha(["categoria principal", "categoria"], ["id"]),
      fornecedor: acha(["nome do fornecedor", "fornecedor", "fabricante"], ["id", "codigo"]),
      marca:    acha(["marca"], ["id"]),
      ean:      acha(["ean", "gtin", "codigo de barras"], []),
      ncm:      acha(["ncm"], []),
      peso:     acha(["peso"], []),
      preco:    acha(["preco de venda", "preco venda", "valor de venda", "preco"], ["custo", "antigo", "promo", "de "]),
      custo:    acha(["custo medio", "preco de custo", "custo"], ["virtual"]),
      url:      acha(["endereco na loja", "link", "url", "pagina"], ["imagem", "foto"]),
      img:      acha(["imagem principal", "url imagem", "imagem", "foto", "image", "thumb"], []),
      idProd:   acha(["id produto", "id do produto"], ["pai"]),
      idDeriv:  acha(["id derivacao", "id der"], ["pai"]),
      ativo:    acha(["ativo", "situacao"], ["id", "data", "altern"]),
    };
    if (!K.fornecedor && K.marca) { K.fornecedor = K.marca; K.marca = null; } /* sem coluna própria, a marca faz o papel */
    /* No catálogo da loja a coluna Marca é sempre a própria empresa ("Moda Bicho"),
       então ela NÃO é fornecedor. Deixar passar apagaria o fornecedor real de todos
       os produtos, que vem da planilha de produtos. */
    if (tipo === "catalogo") { K.fornecedor = null; K.marca = null; }
    if (!K.sku) return toast("Não achei a coluna de código/SKU.", "erro");
    const val = (l, k) => (k ? String(l[k] ?? "").trim() : "");
    const reconhecidas = new Set(Object.values(K).filter(Boolean));
    const IGNORAR_EXTRA = /estoque|quantidade|qtde|reservad|prevista|virtual|disp\.|disponivel|deposito|dep\.|custo|expedicao|saida|entrada/;
    const extrasDe = (l) => {
      const ex = {};
      for (const k of chaves) {
        if (reconhecidas.has(k) || IGNORAR_EXTRA.test(norm(k))) continue; /* vendas/estoque são da Consulta Dinâmica */
        const v2 = String(l[k] ?? "").trim(); if (v2) ex[k.trim()] = v2;
      }
      return ex;
    };
    const dadosDe = (l) => ({
      nome: val(l, K.nome), deriv: val(l, K.deriv), categoria: val(l, K.categoria),
      fornecedor: val(l, K.fornecedor), marca: val(l, K.marca), ean: val(l, K.ean), ncm: val(l, K.ncm),
      peso: val(l, K.peso), preco: val(l, K.preco), custo: val(l, K.custo),
      url: val(l, K.url), img: val(l, K.img).split(",")[0].trim(),
      idProd: val(l, K.idProd), idDeriv: val(l, K.idDeriv), ativo: val(l, K.ativo), extras: extrasDe(l),
    });
    const mapa = new Map();
    linhas.forEach((l) => { const k = String(l[K.sku] || "").trim(); if (k) mapa.set(k, l); });

    let simFoto = 0, simLink = 0, simCasa = 0, simNome = 0;
    for (const p of S.produtos) {
      const l = mapa.get(p.sku); if (!l) continue;
      simCasa++;
      const d = dadosDe(l);
      if (d.url) simLink++; if (d.img) simFoto++; if (d.nome) simNome++;
    }
    const temProduto = new Set(S.produtos.map((p) => p.sku));
    const skusEstoque = new Set((S.estoque?.itens || []).map((x) => x.sku));
    const faltantes = [...mapa.keys()].filter((k) => !temProduto.has(k));
    const faltamComEstoque = faltantes.filter((k) => skusEstoque.has(k));
    const faltamSemEstoque = faltantes.filter((k) => !skusEstoque.has(k));
    const colunasTxt = [["nome", K.nome], ["derivação", K.deriv], ["categoria", K.categoria], ["fornecedor", K.fornecedor],
      ["link", K.url], ["imagem", K.img], ["id Magazord", K.idProd || K.idDeriv]]
      .filter(([, k]) => k).map(([n2, k]) => `${n2} = "${k}"`).join(" · ");
    const nExtras = chaves.filter((k) => !reconhecidas.has(k)).length;
    S.modal = { tipo: "confirmImport", plano: {
      titulo: tipo === "fotos" ? "Importar fotos e links da loja" : tipo === "catalogo" ? "Importar catálogo da loja" : "Importar lista de produtos",
      linhas: [
        `Arquivo: ${file.name} · ${n0(linhas.length)} linhas · ${n0(chaves.length)} colunas.`,
        /* avisa quando o arquivo não tem o que se espera daquele campo de arraste —
           evita subir a planilha errada e achar que não funcionou */
        tipo === "catalogo" && !K.url
          ? "<b>Atenção: este arquivo não tem coluna de URL da página.</b> Sem ela a lupa continua abrindo a busca do site em vez do produto."
          : tipo === "fotos" && !K.img && !K.url
          ? "<b>Atenção: este arquivo não tem coluna de imagem nem de link.</b> Ele pode ser a lista de produtos — o que estiver reconhecido abaixo entra normalmente, mas nenhuma foto será gravada."
          : tipo === "produtos" && !K.nome && !K.fornecedor
          ? "<b>Atenção: não achei coluna de produto nem de marca.</b> Confira se este é o arquivo certo para este campo."
          : null,
        `Colunas reconhecidas: código = "${K.sku}"${colunasTxt ? " · " + colunasTxt : ""}.`,
        nExtras ? `Outras ${n0(nExtras)} colunas não reconhecidas serão guardadas inteiras no bloco Magazord de cada produto — nada da planilha se perde.` : null,
        `${n0(simCasa)} produtos do app casam por SKU (${n0(simNome)} com nome · ${n0(simLink)} com link · ${n0(simFoto)} com foto) — descrição, categoria, fornecedor, foto e link serão atualizados.`,
        `${n0(faltantes.length)} linhas do arquivo não existem no app: <b>${n0(faltamComEstoque.length)}</b> aparecem no estoque (operação real) e ${n0(faltamSemEstoque.length)} não (provavelmente kits ou fora de linha).`,
        "Os dados internos de produção (embalagem, etapas, processo, prazo do fornecedor) nunca são alterados.",
      ].filter(Boolean),
      opcoes: [
        faltamComEstoque.length ? { id: "criar-estoque", checked: true,
          label: `<b>Criar os ${n0(faltamComEstoque.length)} produtos que têm estoque</b> e faltam no cadastro — entram com todos os dados do arquivo e <b>pacote = 1</b>, para você completar pacote/processo na aba Produtos.` } : null,
        faltamSemEstoque.length ? { id: "criar-resto", checked: false,
          label: `Criar também os outros ${n0(faltamSemEstoque.length)} (sem movimento de estoque).` } : null,
      ].filter(Boolean),
      aplicar: async () => {
        migrarProdutosV2();
        let comFoto = 0, comLink = 0, casados = 0, nomes = 0;
        const aplicarDados = (p, l) => {
          const d = dadosDe(l);
          d.nome = d.nome.replace(/[\s·\-]+$/, "").trim();
          const descr = d.deriv && !d.nome.toLowerCase().includes(d.deriv.toLowerCase())
            ? `${d.nome} - ${d.deriv}` : d.nome;
          if (descr) { p.descricao = descr; nomes++; }
          if (d.deriv) p.derivacao = d.deriv;
          if (d.categoria) p.categoria = d.categoria;
          if (d.url) { p.urlSite = urlCompleta(d.url); comLink++; }
          if (d.img) { p.foto = d.img; comFoto++; }
          if (d.fornecedor) {
            const f2 = fornecedorPorNome(d.fornecedor);
            p.producao = p.producao || {};
            p.producao.fornecedorId = f2.id;
            p.fornecedor = d.fornecedor; /* texto que a aba Compras usa no aviso de falta */
          }
          p.magazord = { ...(p.magazord || {}),
            descricao: descr || p.magazord?.descricao || null,
            categoria: d.categoria || p.magazord?.categoria || null,
            fornecedor: d.fornecedor || p.magazord?.fornecedor || null,
            marca: d.marca || p.magazord?.marca || null,
            ean: d.ean || p.magazord?.ean || null, ncm: d.ncm || p.magazord?.ncm || null,
            peso: d.peso || p.magazord?.peso || null, preco: d.preco || p.magazord?.preco || null,
            custo: d.custo || p.magazord?.custo || null, ativo: d.ativo || p.magazord?.ativo || null,
            idProduto: d.idProd || p.magazord?.idProduto || null,
            idDerivacao: d.idDeriv || p.magazord?.idDerivacao || null,
            extras: { ...(p.magazord?.extras || {}), ...d.extras },
            atualizadoEm: iso(hoje()) };
          return p;
        };
        for (const p of S.produtos) {
          const l = mapa.get(p.sku); if (!l) continue;
          casados++;
          aplicarDados(p, l);
        }
        const criarEstoque = $("#op-criar-estoque")?.checked && faltamComEstoque.length;
        const criarResto = $("#op-criar-resto")?.checked && faltamSemEstoque.length;
        const paraCriar = [...(criarEstoque ? faltamComEstoque : []), ...(criarResto ? faltamSemEstoque : [])];
        for (const sku2 of paraCriar) {
          const p = { id: proximoIdProduto(), sku: sku2, skuAtual: sku2, skusAnteriores: [],
            qtdPacote: 1, processo: null, producao: {}, criadoEm: iso(hoje()), origem: "magazord", cadastroIncompleto: true };
          aplicarDados(p, mapa.get(sku2));
          if (!p.descricao) p.descricao = sku2;
          S.produtos.push(p);
        }
        S.cfg.imports = { ...(S.cfg.imports || {}), loja: new Date().toISOString() };
        await salvarTudo("cfg", "cad");
        await salvarProdutos(S.produtos);
        return { titulo: tipo === "fotos" ? "Fotos e links atualizados" : tipo === "catalogo" ? "Catálogo da loja atualizado" : "Lista de produtos atualizada", ok: true, linhas: [
          `${n0(casados)} produtos casados por SKU · ${n0(nomes)} descrições atualizadas.`,
          `${n0(comLink)} links e ${n0(comFoto)} fotos gravados — as fotos aparecem nos cards de Produtos e na gaveta de cada SKU.`,
          K.fornecedor ? "Fornecedores vinculados a partir do arquivo (prazos internos preservados)." : null,
          K.idProd || K.idDeriv ? "IDs da Magazord guardados — vão permitir reconhecer trocas de SKU automaticamente." : null,
          paraCriar.length ? `<b>${n0(paraCriar.length)} produtos criados</b> com todos os dados do arquivo — complete pacote/processo na aba Produtos.` : null,
          casados < S.produtos.length - paraCriar.length ? `${n0(S.produtos.length - paraCriar.length - casados)} produtos do app seguem sem correspondência no arquivo.` : null,
        ].filter(Boolean) };
      } } };
    render();
  } catch (e) { console.error(e); toast("Não consegui ler a planilha.", "erro"); }
}

async function exportarHistorico() {
  await precisaXlsx().catch(() => { toast("Não consegui carregar a biblioteca de planilha — verifique a internet.", "erro"); throw new Error("sem lib"); });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(S.pedidos.map((r) => {
    const o = opPorId(r.opId) || {};
    return { "Pedido": r.numero, "SKU": o.sku || r.sku, "Prioridade": CORTE[r.prioridade],
      "Status": P_LABEL[r.status], "Etapa": etapaFisica(r) || "", "Qtd": r.qtd, "Conferida": r.qtdConferida, "Com defeito": defeitoDe(r), "Boas": boasDe(r),
      "Prestadora": r.prestadora, "Processo": r.processo, "Responsável": r.responsavel,
      "Setor": r.setor || setorDe(r.processo)?.nome || "", "Embalar": r.qtdEmbalar ?? "", "Pacote mix": r.qtdMix ?? "",
      "Sem embalagem": destinoPecas(r).definido ? destinoPecas(r).resto : "",
      "Criado em": r.criadoEm ? String(r.criadoEm).slice(0, 10) : "", "Separado": r.separadaEm,
      "Enviado": r.enviadaEm, "Retornado": r.retornadaEm,
      "Mês Pagamento": competenciaDe(r) || "", "Fechamento": mesFechado(competenciaDe(r)) ? "FECHADO" : "",
      "Aguardando material": r.aguardandoMaterial ? "SIM" : "", "Obs": r.obs };
  })), "Pedidos");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(S.faltas.map((f) => ({
    "Fornecedor": f.fornecedor, "Item": f.item, "Qtd": f.qtd, "Unidade": f.unidade,
    "SKU": f.sku, "Situação": f.status, "Anotado em": f.anotadaEm, "Obs": f.obs,
  }))), "Compras");
  XLSX.writeFile(wb, `INTERNO-historico-${iso(hoje())}.xlsx`);
}

async function exportarCompras() {
  await precisaXlsx().catch(() => { toast("Não consegui carregar a biblioteca de planilha — verifique a internet.", "erro"); throw new Error("sem lib"); });
  const ws = XLSX.utils.json_to_sheet(S.faltas.filter((f) => f.status !== "recebida")
    .sort((a, b) => String(a.fornecedor || "").localeCompare(String(b.fornecedor || "")))
    .map((f) => ({ "Fornecedor": f.fornecedor || "", "Item": f.item, "Qtd": f.qtd || "", "Unidade": f.unidade || "",
      "SKU vinculado": f.sku || "", "Situação": f.status === "aberta" ? "EM FALTA" : "COMPRADO",
      "Anotado em": f.anotadaEm, "Pedidos travados": (f.pedidoIds || []).map((id) => pedidoPorId(id)?.numero).filter(Boolean).join(", "),
      "Obs": f.obs || "" })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Compras");
  XLSX.writeFile(wb, `compras-${iso(hoje())}.xlsx`);
}

async function exportarDemanda() {
  await precisaXlsx().catch(() => { toast("Não consegui carregar a biblioteca de planilha — verifique a internet.", "erro"); throw new Error("sem lib"); });
  if (!S.calc) return;
  const ws = XLSX.utils.json_to_sheet(S.calc.linhas.map((l) => ({
    "SKU": l.sku, "Produto": l.descricao, "ABC": l.abc, "Processo": l.processo, "Qtd Pacote": l.qtdPacote,
    "Vendas": l.vendas, "Estoque Real": l.estoqueReal, "Estoque Mín Atual": l.estMin,
    "Estoque Mín Calculado": l.estMinCalc,
    "%Estoque": l.pctEstoque != null ? Math.round(l.pctEstoque * 100) + "%" : "",
    "%Estoque + Produção": l.pctComProducao != null ? Math.round(l.pctComProducao * 100) + "%" : "",
    "Necessidade (Pcs)": l.necessidadeBruta, "Em produção (Pcs)": l.qtdProgramada,
    "Inicial": l.etapas.Inicial || 0, "Cortado": l.etapas.Cortado || 0, "Prestadora": l.etapas["Com a prestadora"] || 0,
    "Demanda de Produção": l.saldoSemPedido,
    "Cobertura (dias)": Math.round(l.cobertura), "Prazo produção (dias)": Math.round(l.lead),
    "Status": l.classe, "Prioridade sugerida": CORTE[prioridadeDe(l)],
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Demanda");
  XLSX.writeFile(wb, `INTERNO-demanda-${iso(hoje())}.xlsx`);
}

/* a lista que vai para a Magazord: só o que foi decidido aqui e o ERP ainda não sabe */
async function exportarMinimos() {
  await precisaXlsx().catch(() => { toast("Não consegui carregar a biblioteca de planilha — verifique a internet.", "erro"); throw new Error("sem lib"); });
  const linhas = ((S.calc?.minAEnviar || []).length ? S.calc.minAEnviar : (S.calc?.minPendentes || [])).map((l) => ({
    "SKU": l.sku, "Produto": l.descricao, "Curva": l.abc,
    "Mínimo na Magazord": l.estMinErp, "Mínimo novo": l.estMin, "Sugerido pelas vendas": l.estMinCalc,
    "Vendas no período": l.vendas, "Estoque real": l.estoqueReal,
    "Decidido em": fdate(l.minAjuste?.em), "Por": l.minAjuste?.por || "",
    "Origem": l.minAjuste?.origem === "sugerido" ? "aceitou a sugestão" : "valor digitado",
  }));
  if (!linhas.length) return toast("Nenhum mínimo ajustado para exportar.", "erro");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "Minimos");
  XLSX.writeFile(wb, `minimos-para-magazord-${iso(hoje())}.xlsx`);
  toast(`${n0(linhas.length)} ${linhas.length === 1 ? "mínimo exportado" : "mínimos exportados"}. Depois de aplicar na Magazord e importar o estoque, o ajuste se encerra sozinho.`);
}

