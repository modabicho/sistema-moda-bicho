/* ===========================================================================
   src/corte/modelo.js · O MODELO DO PROJETO DE CORTE — só regra, sem tela
   ---------------------------------------------------------------------------
   v8.106 · Etapa A da integração. Este arquivo NÃO é chamado por ninguém
   ainda: ele existe para que a regra de herança tenha dono, versão e bateria
   ANTES de existir tela, tabela ou gravação. Nada aqui toca `S`, desenha,
   grava, ou fala com o servidor — são funções puras, e é assim que devem
   continuar.

   O QUE É UM PROJETO DE CORTE
     A ficha técnica de como cortar as fitas de um produto. Ele não pertence à
     OP nem ao pedido: o pedido REFERENCIA a versão que estava valendo.

   QUEM VENCE
     família  <  subfamília/combinação  <  exceção do SKU
     A mais específica vence, BLOCO A BLOCO — e é isso que permite o SKU 380
     ter cortes próprios e continuar herdando o fitilho da família 3xx.

   OS TRÊS BLOCOS
     cortes · fitilho · sortimento
     As CONDIÇÕES (começa com / contém / igual) não são um bloco: elas dizem
     QUAL projeto se aplica, não o que ele define.

   POR QUE CADA CORTE TEM `chave`
     A identificação ("Laço", depois "Laço liso", depois "Laço principal") é
     texto para a pessoa e muda; a ordem muda quando se insere um corte no
     meio. Se a herança dependesse de uma das duas, renomear ou reordenar
     quebraria o ajuste do SKU em silêncio. Por isso a identidade é uma chave
     técnica, criada UMA VEZ quando o corte nasce e nunca recalculada —
     `chave` manda na herança, `ordem` manda na apresentação, `identificacao`
     é para ler.

   O AJUSTE PARCIAL
     Com `cortesModo === "ajusta"`, a versão guarda SÓ a diferença: uma linha
     por operação, achada pela chave. Campo que ela não preenche continua
     vindo de quem veio antes — inclusive a fita da camada. Trocar a fita na
     família muda o SKU ajustado junto, que é o objetivo; com cópia integral,
     não mudaria.
   =========================================================================== */

/* SKU normalizado pela MESMA função do resto do app (produtos/identidade.js).
   O `typeof` existe para esta regra poder ser medida isolada, fora do bundle,
   sem duplicar a normalização — o CLAUDE.md pede uma função central, não duas. */
const crtSku = (x) => (typeof skuNormal === "function"
  ? skuNormal(x)
  : String(x == null ? "" : x).trim().toUpperCase());

const CRT_BLOCOS = Object.freeze(["cortes", "fitilho", "sortimento"]);
const CRT_NIVEL = Object.freeze({ familia: 1, combinacao: 2, sku: 3 });

/* ---------------------------------------------------------------------------
   MEDIDA · o banco guarda milímetro inteiro; centímetro é apresentação.
   Aceita "22", "22,5", "22.5" e número. Não arredonda escondido: o que não dá
   para ler vira `null`, e quem chama decide o que fazer com isso.
   --------------------------------------------------------------------------- */
function crtMm(valor, unidade) {
  if (valor == null || valor === "") return null;
  const n = typeof valor === "number" ? valor
    : Number(String(valor).trim().replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const mm = String(unidade || "cm").toLowerCase() === "mm" ? n : n * 10;
  return Math.round(mm);
}
const crtCm = (mm) => (Number.isFinite(Number(mm)) ? Number(mm) / 10 : null);
/* texto curto para tela e papel: "22 cm", "22,5 cm" */
function crtMedida(mm) {
  const cm = crtCm(mm);
  if (cm == null) return "";
  return `${String(cm).replace(".", ",")} cm`;
}

/* ---------------------------------------------------------------------------
   CHAVE · nasce com o corte (ou a camada) e não muda mais. Curta porque é
   lida em diff e em log, e única o bastante para uma ficha de corte.
   --------------------------------------------------------------------------- */
function crtChave(prefixo) {
  const p = prefixo || "ct";
  const a = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 8)
    : Math.random().toString(16).slice(2, 10);
  return `${p}_${a}`;
}

/* ---------------------------------------------------------------------------
   CONDIÇÕES · uma regra é um E (AND) das condições dela. Nenhuma família está
   escrita aqui: o que existe é o operador.
   --------------------------------------------------------------------------- */
function crtCasaCondicao(cond, sku) {
  if (!cond) return false;
  const alvo = crtSku(sku);
  const valor = crtSku(cond.valor);
  if (!valor) return false;
  const op = String(cond.operador || "comeca");
  if (op === "igual") return alvo === valor;
  if (op === "contem") return alvo.includes(valor);
  if (op === "comeca") return alvo.startsWith(valor);
  return false;                                  /* operador desconhecido não casa */
}
function crtCasa(projeto, sku) {
  const regras = (projeto && projeto.regras) || [];
  if (!regras.length) return false;              /* projeto sem condição não pega ninguém */
  return regras.every((c) => crtCasaCondicao(c, sku));
}

/* Especificidade CALCULADA, não cadastrada: o nível manda, e dentro do nível
   ganha quem escreveu mais condição (mais texto = recorte mais estreito). */
function crtPeso(projeto) {
  const nivel = CRT_NIVEL[String(projeto && projeto.escopo)] || 1;
  const soma = ((projeto && projeto.regras) || [])
    .reduce((t, c) => t + String((c && c.valor) || "").trim().length, 0);
  return nivel * 1000 + soma;
}

/* Do mais GERAL para o mais ESPECÍFICO — é nessa ordem que a herança se
   empilha. Empate resolve pelo que aparece depois na lista (o mais recente). */
function crtAplicaveis(projetos, sku) {
  return (projetos || [])
    .filter((p) => p && p.ativo !== false && crtCasa(p, sku))
    .map((p, i) => ({ p, i }))
    .sort((a, b) => crtPeso(a.p) - crtPeso(b.p) || a.i - b.i)
    .map((x) => x.p);
}

/* ---------------------------------------------------------------------------
   AJUSTE · aplicar as operações de uma versão sobre o que já estava resolvido.
   `substitui` só sobrescreve campo PREENCHIDO: é isso que faz o SKU guardar
   260 mm e continuar herdando a fita, o tipo de corte e as camadas.
   --------------------------------------------------------------------------- */
const CRT_CAMPOS_CORTE = Object.freeze(["fitaId", "comprimentoMm", "tipoCorte", "qtd", "identificacao", "ordem"]);
const CRT_CAMPOS_CAMADA = Object.freeze(["fitaId", "comprimentoMm", "tipoCorte", "cortarJuntas", "condicao", "ordem"]);

const crtCopia = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const crtPreenchido = (v) => v !== undefined && v !== null && v !== "";

function crtMesclar(base, mudanca, campos) {
  const saida = Object.assign({}, base);
  for (const k of campos) if (crtPreenchido(mudanca[k])) saida[k] = mudanca[k];
  return saida;
}

function crtAplicarCamadas(camadasBase, ops) {
  if (!ops || !ops.length) return camadasBase;   /* sem operação, herda inteiro */
  let lista = (camadasBase || []).map(crtCopia);
  for (const op of ops) {
    const chave = op && op.chave;
    const i = lista.findIndex((c) => c.chave === chave);
    const acao = String((op && op.operacao) || "define");
    if (acao === "remove") { if (i >= 0) lista.splice(i, 1); continue; }
    if (acao === "acrescenta" || i < 0) { lista.push(crtCopia(op)); continue; }
    lista[i] = crtMesclar(lista[i], op, CRT_CAMPOS_CAMADA);
  }
  return lista;
}

function crtAplicarCortes(cortesBase, ops) {
  let lista = (cortesBase || []).map(crtCopia);
  for (const op of ops || []) {
    const chave = op && op.chave;
    const i = lista.findIndex((c) => c.chave === chave);
    const acao = String((op && op.operacao) || "define");
    if (acao === "remove") { if (i >= 0) lista.splice(i, 1); continue; }
    if (acao === "acrescenta" || i < 0) { lista.push(crtCopia(op)); continue; }
    const mesclado = crtMesclar(lista[i], op, CRT_CAMPOS_CORTE);
    mesclado.camadas = crtAplicarCamadas(lista[i].camadas, op.camadas);
    lista[i] = mesclado;
  }
  return lista;
}

/* a ordem de apresentação é a `ordem`; a identidade continua sendo a chave */
const crtOrdenados = (lista) => (lista || []).slice()
  .map((x, i) => ({ x, i }))
  .sort((a, b) => (Number(a.x.ordem) || 0) - (Number(b.x.ordem) || 0) || a.i - b.i)
  .map((o) => o.x);

/* ---------------------------------------------------------------------------
   RESOLVER · empilha os projetos aplicáveis, bloco a bloco, e devolve também
   DE ONDE veio cada bloco — a ficha e o papel precisam poder dizer isso.
   Sem projeto que case: devolve vazio, sem erro. Ausência é resposta.
   --------------------------------------------------------------------------- */
/* UM elo da cadeia, aplicado sobre o que já foi resolvido. Estava embutido no
   laço do `crtResolver`; saiu para cá porque a escolha manual de um pedido
   (v8.110 · "Trocar") é exatamente isto — mais um elo, o último. Duas cópias da
   mesma regra acabariam discordando. */
function crtAplicarProjeto(saida, p) {
  const v = p.versao || {};
  const modos = {
    cortes: String(v.cortesModo || "herda"),
    fitilho: String(v.fitilhoModo || "herda"),
    sortimento: String(v.sortimentoModo || "herda"),
  };
  saida.cadeia.push({ projetoId: p.id, nome: p.nome, escopo: p.escopo,
    versaoId: v.id || null, versao: v.versao == null ? null : v.versao,
    peso: crtPeso(p), modos });

  if (modos.cortes === "substitui") {
    saida.cortes = (v.cortes || []).map(crtCopia);
    saida.origem.cortes = { projetoId: p.id, nome: p.nome, escopo: p.escopo, versaoId: v.id || null, modo: "substitui" };
  } else if (modos.cortes === "ajusta") {
    saida.cortes = crtAplicarCortes(saida.cortes, v.cortes);
    saida.origem.cortes = { projetoId: p.id, nome: p.nome, escopo: p.escopo, versaoId: v.id || null, modo: "ajusta",
      herdadoDe: (saida.origem.cortes && saida.origem.cortes.projetoId) || null };
  } else if (modos.cortes === "remove") {
    saida.cortes = [];
    saida.origem.cortes = { projetoId: p.id, nome: p.nome, escopo: p.escopo, versaoId: v.id || null, modo: "remove" };
  }

  for (const bloco of ["fitilho", "sortimento"]) {
    if (modos[bloco] === "substitui") {
      saida[bloco] = crtCopia(v[bloco]) || null;
      saida.origem[bloco] = { projetoId: p.id, nome: p.nome, escopo: p.escopo, versaoId: v.id || null, modo: "substitui" };
    } else if (modos[bloco] === "remove") {
      saida[bloco] = null;
      saida.origem[bloco] = { projetoId: p.id, nome: p.nome, escopo: p.escopo, versaoId: v.id || null, modo: "remove" };
    }
  }
  return saida;
}

/* a ordenação final dos cortes — também compartilhada com a escolha manual */
function crtFechar(saida) {
  saida.cortes = crtOrdenados(saida.cortes).map((c) => {
    const copia = crtCopia(c);
    copia.camadas = crtOrdenados(copia.camadas || []);
    return copia;
  });
  return saida;
}

function crtResolver(projetos, sku) {
  const cadeia = crtAplicaveis(projetos, sku);
  const saida = { sku: crtSku(sku), cortes: [], fitilho: null, sortimento: null, origem: {}, cadeia: [] };
  for (const p of cadeia) crtAplicarProjeto(saida, p);
  return crtFechar(saida);
}

/* ---------------------------------------------------------------------------
   ESCOLHA MANUAL (v8.110) · o projeto que alguém escolheu à mão para UM pedido.
   Ele entra como o ELO MAIS ESPECÍFICO — depois de tudo que casa com o SKU —, e
   não apaga a cadeia: o que ele não define continua vindo de quem definia. É o
   mesmo desenho da herança; muda só quem assina por último.
   Nada aqui escreve em projeto nenhum: família, combinação e exceção do SKU
   ficam exatamente como estavam.
   --------------------------------------------------------------------------- */
function crtResolverManual(projetos, sku, projetoId) {
  const base = crtResolver(projetos, sku);
  const p = (projetos || []).find((x) => x && x.id === projetoId);
  if (!p) return base;
  /* escolheu à mão justamente quem já assinava: não há o que empilhar */
  const ultimo = base.cadeia[base.cadeia.length - 1];
  if (ultimo && ultimo.projetoId === p.id) return base;
  return crtFechar(crtAplicarProjeto(base, p));
}

/* Tem alguma coisa para a bancada fazer? Bloco vazio não conta — é a mesma
   regra da tela e do papel: campo que não se aplica não aparece. */
const crtTemProjeto = (r) => !!(r && ((r.cortes && r.cortes.length) || r.fitilho
  || (r.sortimento && r.sortimento.modo === "sortido")));
