/* ===========================================================================
   src/persistencia/cadastros.js · O MOTOR DE CADASTROS, do lado do app
   ---------------------------------------------------------------------------
   Este arquivo NÃO sabe o que é um fornecedor. Ele sabe ler o registro de
   tipos do servidor (`pcp_cad_tipo`) e, a partir dele, fazer para qualquer
   cadastro o que `demanda.js` faz para a Demanda:

     · fotografar a base lida (`cadMarcarBase`);
     · tirar a diferença por REGISTRO e por CAMPO contra a foto;
     · registrar intenções no gancho `salvarTudo` da v8.26 e enviá-las pela
       outbox, com `operation_id` e `expected_revision`;
     · devolver conflito por CAMPO, nunca por documento;
     · espelhar com as flags desligadas, classificando cada divergência;
     · e não fazer nada — literalmente nada — enquanto a flag de escrita
       daquele cadastro estiver desligada.

   Ligar um cadastro novo é inserir uma linha em `pcp_cad_tipo` e ligar duas
   flags. Nenhuma linha deste arquivo muda.

   As flags seguem `cad_<cadastro>_leitura` e `cad_<cadastro>_escrita`. O nome
   é GERADO, não escolhido: é o que permite o app não conhecer os cadastros.
   =========================================================================== */

/* ---------------------------------------------------------------------------
   O REGISTRO · vem do servidor na abertura, e é a única fonte de verdade
   sobre onde cada cadastro mora e quais campos são autorais.
   --------------------------------------------------------------------------- */
let CAD_TIPOS = null;                 /* { fornecedores: {...}, ... } */
const CAD_FOTO = {};                  /* cadastro → Map(id → {dados, revision}) */
let CAD_PENDENTES = [];
let CAD_ULTIMO_ENVIO = null;

const CAD_COLS_BASE = "cadastro,rotulo,doc_chave,doc_lista,chave,campos,obrigatorios,"
  + "gera_id,prefixo_id,ordem";
const CAD_COLS_CHAVES = ",chave_composta,doc_sublista,sub_chave,pai_campo";

/* Lê o registro. Tenta primeiro com as colunas de chave composta e sublista
   (114); se o banco ainda não as tem, cai para o conjunto base em vez de
   ficar sem registro nenhum.

   Isso não é gentileza: durante um rollout a ordem entre publicar o app e
   rodar a migração não é garantida, e um app que fica cego porque um script
   ainda não rodou é pior que um app que sabe menos por um instante. O que ele
   NÃO faz é fingir: `formaCompleta:false` diz que os cadastros com chave
   composta ou sublista não vão funcionar até o 114 entrar. */
async function cadCarregarTipos() {
  let r = await persLer("pcp_cad_tipo?select=" + CAD_COLS_BASE + CAD_COLS_CHAVES + "&order=ordem");
  let completa = true;
  if (!r.ok) {
    r = await persLer("pcp_cad_tipo?select=" + CAD_COLS_BASE + "&order=ordem");
    completa = false;
  }
  if (!r.ok) { CAD_TIPOS = null; return { status: "nao-consegui", erro: r.erro }; }
  const m = {};
  for (const t of persLista(r.corpo)) m[t.cadastro] = t;
  CAD_TIPOS = m;
  CAD_FORMA_COMPLETA = completa;
  return { status: "ok", quantos: Object.keys(m).length, cadastros: Object.keys(m),
    formaCompleta: completa };
}
let CAD_FORMA_COMPLETA = true;
function cadFormaCompleta() { return CAD_FORMA_COMPLETA; }
function cadTipos() { return CAD_TIPOS || {}; }
function cadTipo(nome) { return (CAD_TIPOS || {})[nome] || null; }
const cadNomes = () => Object.keys(CAD_TIPOS || {});

/* As duas flags de cada cadastro, pelo nome gerado. */
function cadLeDaTabela(nome) {
  return typeof telaFlag === "function" && telaFlag("cad_" + nome + "_leitura");
}
function cadEscreveNaTabela(nome) {
  return typeof telaFlag === "function" && telaFlag("cad_" + nome + "_escrita");
}
const cadAlgumEscreve = () => cadNomes().some(cadEscreveNaTabela);

/* ---------------------------------------------------------------------------
   ONDE O CADASTRO MORA NA TELA
   O registro diz `doc_chave` ("pcp5:cad") e `doc_lista` ("fornecedores"). A
   tela guarda a mesma coisa em `S.cad.fornecedores`. A tradução é uma só, e
   fica aqui — não espalhada por cadastro.

   ---------------------------------------------------------------------------
   AS TRÊS SEÇÕES ACHATADAS · o descasamento que barrou 13 remoções
   ---------------------------------------------------------------------------
   Para `pcp5:cad`, `pcp5:festivas` e `pcp5:produtos`, a tela guarda o documento
   com a MESMA forma que ele tem: `S.cad.prestadoras`, `S.festivas.campanhas`.
   Para outras três, NÃO: o app ACHATA o documento em chaves separadas, na
   abertura (`ui/render-de-fundo.js`):

       pcp5:semi     → S.semiTipos · S.remessas · S.semiAjustes
       pcp5:insumos  → S.insumos · S.bens · S.movInsumo · S.entradas · S.posse…

   Então `S.semi` e `S.insumos.insumos` simplesmente NÃO EXISTEM, esta função
   devolvia `null`, e `cadRegistrosDaTela` devolvia `[]`. A comparação lia isso
   como "a tela ficou vazia" e marcava TODO registro da tabela como sumido.
   Foi o que gerou o alarme "Remoções barradas por segurança" com 13 registros
   de `semi_tipos`. Medido em `testes/semi-tipos-remocao.js`, idêntico na v8.62.

   E não era só alarme: a guarda contra remoção em massa tem teto
   `max(3, 10%)`. Medido — com 1, 2 ou 3 registros, e FORA de uma importação, as
   remoções não são retidas: são EXECUTADAS. Em produção, `bens` tem 2.

   O mapa abaixo é NOMINAL, de propósito: três linhas, uma por lista achatada.
   Ele é CONSULTA DE RESERVA, não atalho — o caminho declarado no registro é
   tentado primeiro. Assim, no dia em que o app deixar de achatar, quem manda
   volta a ser o registro, sem ninguém precisar lembrar de apagar isto aqui.

   O que este conserto NÃO faz: não toca na guarda. Ela está certa, e foi ela
   que segurou os 13. Calar o alarme seria o contrário de consertar.
   --------------------------------------------------------------------------- */
const CAD_LISTA_ACHATADA = Object.freeze({
  "semi.tipos":      "semiTipos",
  "insumos.insumos": "insumos",
  "insumos.bens":    "bens",
});

function cadListaDaTela(nome) {
  const t = cadTipo(nome);
  if (!t || typeof S === "undefined") return null;
  const secao = String(t.doc_chave || "").replace(/^pcp5:/, "");
  const raiz = S[secao];
  if (!t.doc_lista) return Array.isArray(raiz) ? raiz : null;
  /* 1º · o caminho que o REGISTRO declara */
  if (raiz && typeof raiz === "object" && Array.isArray(raiz[t.doc_lista])) return raiz[t.doc_lista];
  /* 2º · e só então a chave achatada, pelo nome */
  const achatada = CAD_LISTA_ACHATADA[secao + "." + t.doc_lista];
  if (achatada && Array.isArray(S[achatada])) return S[achatada];
  return null;
}

/* ---------------------------------------------------------------------------
   OS REGISTROS DA TELA · nas TRÊS formas que o registro descreve, e nas mesmas
   que `pcp_cad_do_documento` implementa do lado do servidor.

   Isto existe porque a primeira versão só sabia a forma (a). Resultado medido:
   `festivas_itens` lia as CAMPANHAS como se fossem itens (ids c1, c2) e o
   espelho acusava duas divergências de identidade; e `bonus`, que não tem id
   no documento, era simplesmente pulado — nunca sairia da tela.
   As duas normalizações têm de ser a MESMA, senão o espelho acusa o que não
   existe e deixa passar o que existe.
     a) chave simples   → `chave`
     b) chave composta  → `chave_composta`, id derivado e sempre igual
     c) sublista        → pai + `sub_chave`, id `<pai>|<sub>`
   --------------------------------------------------------------------------- */
function cadChaveDerivada(campos, obj) {
  if (!Array.isArray(campos) || !campos.length) return null;
  return campos.map((k) => {
    const v = obj ? obj[k] : null;
    const s = v === null || v === undefined ? "" : String(v).trim();
    return s === "" ? "-" : s;
  }).join("|");
}

function cadRegistrosDaTela(nome) {
  const t = cadTipo(nome);
  const lista = cadListaDaTela(nome);
  if (!t || !Array.isArray(lista)) return [];
  const saida = [];

  if (t.doc_sublista) {
    for (const pai of lista) {
      const paiId = pai && pai[t.chave];
      if (paiId == null || paiId === "") continue;
      const filhos = pai[t.doc_sublista];
      if (!Array.isArray(filhos)) continue;
      for (const f of filhos) {
        const sub = f && f[t.sub_chave];
        if (sub == null || sub === "") continue;
        const obj = Object.assign({}, f, { [t.pai_campo || "paiId"]: paiId });
        saida.push({ id: String(paiId) + "|" + String(sub), obj });
      }
    }
    return saida;
  }

  if (Array.isArray(t.chave_composta) && t.chave_composta.length) {
    for (const o of lista) {
      const id = cadChaveDerivada(t.chave_composta, o);
      if (!id) continue;
      saida.push({ id, obj: o });
    }
    return saida;
  }

  for (const o of lista) {
    const id = o && o[t.chave];
    if (id == null || id === "") continue;
    saida.push({ id: String(id), obj: o });
  }
  return saida;
}

/* Só os campos autorais, normalizados IGUAL ao `pcp_cad_normalizar` do
   servidor: `null`, ausente e string vazia são a MESMA coisa. Se as duas
   normalizações discordassem, o espelho acusaria divergência que não existe —
   foi exatamente o que aconteceu com as 156 da Demanda. */
function cadNormalizar(nome, obj) {
  const t = cadTipo(nome);
  const saida = {};
  if (!t || !obj) return saida;
  for (const k of (t.campos || [])) {
    const v = obj[k];
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    saida[k] = v;
  }
  return saida;
}
/* campos que o objeto tem e o registro não conhece — recusa PELO NOME */
function cadDesconhecidos(nome, obj) {
  const t = cadTipo(nome);
  if (!t) return [];
  const conhecidos = new Set([...(t.campos || []), "id"]);
  return Object.keys(obj || {}).filter((k) => !conhecidos.has(k)
    && obj[k] !== null && obj[k] !== undefined);
}

/* ---------------------------------------------------------------------------
   AS CHAMADAS · uma por verbo, para TODOS os cadastros
   --------------------------------------------------------------------------- */
Object.assign(PX_RPC, {
  cad_criar:    "pcp_cad_criar",
  cad_patch:    "pcp_cad_patch",
  cad_cancelar: "pcp_cad_cancelar",
  cad_reativar: "pcp_cad_reativar",
  cad_apagar:   "pcp_cad_apagar",
  cad_remover:  "pcp_cad_remover",
});

/* ---------------------------------------------------------------------------
   A LISTAGEM · PAGINADA, porque 3.123 produtos não cabem em 1.000
   ---------------------------------------------------------------------------
   `&limit=1000` era o desenho de quando o maior cadastro tinha dezenas de
   linhas. Com Produtos, a foto viria com 1.000 e as outras 2.123 seriam lidas
   como REGISTRO NOVO na primeira gravação — o app tentaria criar 2.123
   produtos que já existem. E o corte é silencioso: uma página cheia é
   indistinguível de uma lista que acabou, então quem não pagina não descobre.
   Aqui a página cheia é o sinal para pedir a próxima, e um teto honesto avisa
   em vez de truncar calado. */
const CAD_PAGINA = 1000;
const CAD_MAX_PAGINAS = 60;              /* 60.000 linhas antes de reclamar */
const CAD_COLUNAS = "cadastro,id,dados,ativo,motivo,revision,criado_em,updated_at,extra";

async function cdPaginar(base, ordem) {
  const itens = [];
  for (let pagina = 0; pagina < CAD_MAX_PAGINAS; pagina++) {
    const r = await persLer(base + "&order=" + ordem
      + "&limit=" + CAD_PAGINA + "&offset=" + (pagina * CAD_PAGINA));
    if (!r.ok) return { erro: pxResposta(r, "listar-cadastro") };
    const l = persLista(r.corpo);
    for (const x of l) itens.push(x);
    if (l.length < CAD_PAGINA) return { itens, paginas: pagina + 1 };
  }
  /* teto batido: NÃO devolver o que veio como se fosse tudo */
  return { erro: { status: "lista-truncada", motivo: "mais de "
    + (CAD_PAGINA * CAD_MAX_PAGINAS) + " linhas em pcp_cad_item — a foto ficaria incompleta" } };
}

async function cdListar(nome) {
  const r = await cdPaginar("pcp_cad_item?select=" + CAD_COLUNAS
    + "&cadastro=eq." + encodeURIComponent(nome), "id");
  if (r.erro) return r.erro;
  return { status: "ok", itens: r.itens, paginas: r.paginas };
}
async function cdListarTudo() {
  const r = await cdPaginar("pcp_cad_item?select=" + CAD_COLUNAS, "cadastro,id");
  if (r.erro) return r.erro;
  return { status: "ok", itens: r.itens, paginas: r.paginas };
}

function cdCriar(nome, itens) {
  const maus = [];
  const limpos = [];
  for (const it of (itens || [])) {
    const d = cadDesconhecidos(nome, it);
    if (d.length) maus.push({ id: it && it.id, campos: d });
    limpos.push(Object.assign({}, cadNormalizar(nome, it), it && it.id ? { id: it.id } : {}));
  }
  if (maus.length) return Promise.resolve({ status: "invalido", campos_desconhecidos: maus });
  return pxEnviar(obEnfileirar("cad_criar", null, { p_cadastro: nome, p_itens: limpos }));
}

async function cdPatch(nome, id, revisao, mudancas, base) {
  const d = cadDesconhecidos(nome, mudancas);
  if (d.length) return { status: "invalido", campos_desconhecidos: d };
  const patch = cadNormalizarPatch(nome, mudancas);
  if (!Object.keys(patch).length) return { status: "invalido", motivo: "patch vazio" };

  const acao = obEnfileirar("cad_patch", id, {
    p_cadastro: nome, p_id: id, p_expected_revision: revisao, p_patch: patch });
  const r = await pxEnviar(acao);
  if (r.status !== "conflito" || !r.registro) return r;

  /* conflito: a MESMA regra dos pedidos — campo que só eu mexi segue sozinho;
     mesmo campo com valores diferentes vira conflito explícito, do REGISTRO. */
  const b = cadNormalizar(nome, base || {});
  const v = mgClassificar(b, patch, r.registro.dados || {});
  if (v.nadaAFazer) {
    return { status: "ok", nadaAFazer: true, registro: r.registro, revision: r.registro.revision };
  }
  if (!v.podeSozinho) {
    return { status: "conflito-de-campo", disputados: v.disputados,
             registro: r.registro, revision: r.registro.revision };
  }
  const nova = obNovaIntencao(acao, Object.assign({}, acao.dados, {
    p_expected_revision: r.registro.revision, p_patch: v.automatico }));
  const r2 = await pxEnviar(nova);
  return Object.assign({}, r2, { fundido: true, reenviada: nova.opId,
    juntou: Object.keys(v.automatico) });
}
/* o patch PRECISA poder mandar `null` para limpar um campo — por isso ele não
   passa por `cadNormalizar`, que descarta nulo. O que ele descarta é só o que
   o registro não conhece. */
function cadNormalizarPatch(nome, mudancas) {
  const t = cadTipo(nome);
  const saida = {};
  if (!t) return saida;
  for (const k of Object.keys(mudancas || {})) {
    if ((t.campos || []).includes(k)) saida[k] = mudancas[k] === undefined ? null : mudancas[k];
  }
  return saida;
}

function cdCancelar(nome, id, revisao, motivo) {
  return pxEnviar(obEnfileirar("cad_cancelar", id, {
    p_cadastro: nome, p_id: id, p_expected_revision: revisao, p_motivo: motivo || null }));
}
function cdReativar(nome, id, revisao) {
  return pxEnviar(obEnfileirar("cad_reativar", id, {
    p_cadastro: nome, p_id: id, p_expected_revision: revisao }));
}
/* REMOVER · a tela não escolhe entre apagar e cancelar. Ela pede o remover, e
   QUEM DECIDE É O SERVIDOR: se houver referência, histórico ou revisão acima
   de 1, ele cancela em vez de apagar, e diz por quê. É a regra da v8.34,
   agora dentro de uma RPC só — uma ida ao servidor, não duas. */
function cdRemover(nome, id, revisao, motivo) {
  return pxEnviar(obEnfileirar("cad_remover", id, {
    p_cadastro: nome, p_id: id, p_expected_revision: revisao, p_motivo: motivo || null }));
}
function cdVinculos(nome, id) {
  return persRpc("pcp_cad_vinculos", { p_cadastro: nome, p_id: id });
}
function cdPrevia(nome) { return persRpc("pcp_cad_previa", { p_cadastro: nome }); }
function cdPainel() { return persRpc("pcp_cad_painel", {}); }

/* ---------------------------------------------------------------------------
   A LEITURA · com a flag ligada, a TABELA passa a ser a fonte da tela
   ---------------------------------------------------------------------------
   Até aqui `cad_<x>_leitura` existia e ninguém a lia: o motor escrevia na
   tabela e a tela continuava desenhando o documento. Isso basta enquanto a
   tabela é espelho; não basta no dia do cutover, que é justamente quando o
   documento tem de virar conferência e parar de ser fonte.

   O que ela faz é pequeno de propósito: troca a lista da tela pelos itens
   ATIVOS da tabela, na forma que o registro descreve. O documento continua
   sendo gravado a partir da tela, então ele segue existindo — como espelho.

   O que ela NÃO faz: sublista e chave composta. Nessas formas o id da tela é
   derivado (`<pai>|<sub>`), e remontar o documento a partir dele seria
   adivinhar a estrutura. Recusa com motivo, em vez de montar errado.
   --------------------------------------------------------------------------- */
function cadPodeAplicar(nome) {
  const t = cadTipo(nome);
  if (!t) return "cadastro desconhecido";
  if (t.doc_sublista) return "cadastro em sublista: a tela não é remontável a partir do id derivado";
  if (Array.isArray(t.chave_composta) && t.chave_composta.length)
    return "chave composta: o id é derivado, não é campo do registro";
  return null;
}

function cadAplicarNaTela(nome, itens) {
  const t = cadTipo(nome);
  const porque = cadPodeAplicar(nome);
  if (porque) return { cadastro: nome, aplicado: false, porque };
  if (typeof S === "undefined") return { cadastro: nome, aplicado: false, porque: "sem estado" };
  const secao = String(t.doc_chave || "").replace(/^pcp5:/, "");
  const chave = t.chave || "id";

  /* FUNDE, não substitui.
     `dados` guarda SÓ os campos declarados no registro (`pcp_cad_normalizar`).
     Trocar o objeto da tela por ele apagaria tudo o que o registro não conhece
     — e isso não é hipótese: ligar a leitura de `festivas` hoje apagaria
     `itens`, `vendasBase` e `vendasAtual` de todas as campanhas.
     A regra: campo QUE O REGISTRO CONHECE, a tabela manda (inclusive para
     apagar); campo que ele não conhece, fica o da tela. */
  const conhecidos = new Set([...(t.campos || []), chave]);
  const antes = new Map();
  const atual = cadListaDaTela(nome) || [];
  for (const o of atual) if (o && o[chave] != null) antes.set(String(o[chave]), o);
  const guardados = [];
  const soDesconhecidos = (o) => {
    const r = {};
    for (const k of Object.keys(o || {})) if (!conhecidos.has(k)) r[k] = o[k];
    return r;
  };
  const lista = (itens || [])
    .filter((x) => x && x.ativo !== false)
    .map((x) => {
      const velho = antes.get(String(x.id));
      const extras = velho ? soDesconhecidos(velho) : {};
      const nomes = Object.keys(extras);
      if (nomes.length) guardados.push({ id: String(x.id), campos: nomes });
      return Object.assign({}, extras, x.dados || {}, { [chave]: x.id });
    });
  if (!t.doc_lista) {
    if (!Array.isArray(S[secao])) return { cadastro: nome, aplicado: false,
      porque: "a seção `" + secao + "` não é uma lista na tela" };
    const quantosAntes = S[secao].length;
    S[secao].length = 0;
    for (const o of lista) S[secao].push(o);
    return { cadastro: nome, aplicado: true, antes: quantosAntes, depois: lista.length,
             preservados: guardados.length ? guardados.slice(0, 5) : undefined,
             preservadosTotal: guardados.length || undefined };
  }
  if (!S[secao] || typeof S[secao] !== "object") return { cadastro: nome, aplicado: false,
    porque: "a seção `" + secao + "` não existe na tela" };
  const quantosAntes = Array.isArray(S[secao][t.doc_lista]) ? S[secao][t.doc_lista].length : 0;
  S[secao][t.doc_lista] = lista;
  return { cadastro: nome, aplicado: true, antes: quantosAntes, depois: lista.length,
           preservados: guardados.length ? guardados.slice(0, 5) : undefined,
           preservadosTotal: guardados.length || undefined };
}

/* Todos os cadastros com leitura ligada, numa ida só ao servidor. */
async function cadAplicarTodos() {
  if (!CAD_TIPOS) return [];
  const querem = cadNomes().filter(cadLeDaTabela);
  if (!querem.length) return [];
  const r = await cdListarTudo();
  if (r.status !== "ok") return [{ aplicado: false, porque: r.status || "não consegui listar" }];
  const por = {};
  for (const it of r.itens) (por[it.cadastro] = por[it.cadastro] || []).push(it);
  const feitos = [];
  for (const nome of querem) {
    /* tabela vazia com flag ligada seria APAGAR a tela inteira. Isso não é
       leitura, é perda: recusa e diz por quê. */
    const l = por[nome] || [];
    if (!l.length) { feitos.push({ cadastro: nome, aplicado: false,
      porque: "a tabela não devolveu nenhum item — a tela seria esvaziada" }); continue; }
    feitos.push(cadAplicarNaTela(nome, l));
  }
  return feitos;
}

/* ---------------------------------------------------------------------------
   A FOTO · a base contra a qual a diferença é tirada
   --------------------------------------------------------------------------- */
function cadGuardarFoto(nome, linha) {
  if (!linha || linha.id == null) return;
  CAD_FOTO[nome] = CAD_FOTO[nome] || new Map();
  CAD_FOTO[nome].set(String(linha.id),
    { dados: Object.assign({}, linha.dados || {}), revision: linha.revision, ativo: linha.ativo });
}
async function cadMarcarBase() {
  if (!CAD_TIPOS) await cadCarregarTipos();
  const r = await cdListarTudo();
  if (r.status !== "ok") return { status: r.status };
  for (const k of Object.keys(CAD_FOTO)) delete CAD_FOTO[k];
  for (const it of r.itens) cadGuardarFoto(it.cadastro, it);
  const conta = {};
  for (const n of cadNomes()) conta[n] = (CAD_FOTO[n] || new Map()).size;
  return { status: "ok", itens: r.itens.length, por_cadastro: conta };
}

/* A diferença de UM registro contra a foto. Devolve os CAMPOS que mudaram. */
function cadDiferenca(nome, obj) {
  const dados = cadNormalizar(nome, obj);
  const foto = (CAD_FOTO[nome] || new Map()).get(String(obj && obj.id));
  if (!foto) return { novo: true, dados };
  const campos = [];
  const iguais = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const chaves = new Set([...Object.keys(dados), ...Object.keys(foto.dados || {})]);
  for (const k of chaves) if (!iguais(dados[k], (foto.dados || {})[k])) campos.push(k);
  return { novo: false, campos, dados, revision: foto.revision, base: foto.dados, ativo: foto.ativo };
}

/* ===========================================================================
   A GUARDA CONTRA REMOÇÃO EM MASSA
   ---------------------------------------------------------------------------
   `cadRegistrarIntencoes` manda `remover` para todo registro que estava na foto
   e sumiu da tela. Isso é certo quando alguém apaga UM cadastro na tela. É
   catastrófico quando a lista inteira foi TROCADA — e é exatamente isso que
   restaurar um backup `.json` e reimportar a `.xlsm` fazem
   (`dados/importar.js:38-60` e `:330` substituem listas inteiras).

   Com `cad_produtos_escrita` ligada, restaurar um backup antigo mandaria o
   servidor remover todo produto que o backup não tem. O motor cancela em vez de
   apagar quando há referência — mas cancela.

   Duas peneiras, e as duas precisam existir:

   1 · MODO IMPORTAÇÃO. `aplicar-import` e a restauração de ponto avisam que
       estão trocando listas. Enquanto isso durar, nenhuma remoção sai.
   2 · TETO, valendo SEMPRE. Apagar cadastro na tela é um de cada vez, com
       confirmação. Mais de três de uma vez — ou mais de 10% da foto — não é
       gente clicando: é lista trocada por algum caminho que eu não previ. A
       peneira 2 é a que protege do que eu não sei que existe.

   O que é barrado não some: fica RETIDO, com nome e motivo, num aviso crítico
   e no armazenamento local. E o dado continua na tabela — que, depois do
   cutover, é a fonte: na próxima abertura a tela volta a mostrá-lo. A guarda
   erra para o lado de não perder nada.
   =========================================================================== */
let CAD_IMPORTANDO = 0;
function cadImportando() { return CAD_IMPORTANDO > 0; }
/* contador, não booleano: uma importação que chame outra não pode desarmar a
   guarda ao terminar a de dentro */
async function cadDuranteTrocaDeListas(f) {
  CAD_IMPORTANDO++;
  try { return await f(); } finally { CAD_IMPORTANDO = Math.max(0, CAD_IMPORTANDO - 1); }
}

const CAD_REMOCAO_MAX = 3;
const CAD_REMOCAO_FRACAO = 0.1;
const CAD_RETIDAS_CHAVE = "pcp5:cad-remocoes-retidas";

function cadRetidasLer() {
  try { const v = JSON.parse(localStorage.getItem(CAD_RETIDAS_CHAVE) || "[]");
    return Array.isArray(v) ? v : []; } catch { return []; }
}
function cadRetidasGravar(l) {
  try { localStorage.setItem(CAD_RETIDAS_CHAVE, JSON.stringify(l.slice(-500))); } catch {}
}
function cadRemocoesRetidas() { return cadRetidasLer(); }
function cadRetidasLimpar() {
  try { localStorage.removeItem(CAD_RETIDAS_CHAVE); } catch {}
  if (typeof S !== "undefined") S.remocoesRetidas = [];
  return { status: "ok" };
}
function cadReterRemocoes(nome, sumidos, motivo) {
  const l = cadRetidasLer();
  const quando = new Date().toISOString();
  for (const [id, foto] of sumidos) {
    l.push({ quando, cadastro: nome, id, motivo,
      rotulo: (foto && foto.dados && (foto.dados.sku || foto.dados.nome)) || id });
  }
  cadRetidasGravar(l);
  if (typeof S !== "undefined") S.remocoesRetidas = cadRetidasLer();
  console.warn("[cadastros] " + sumidos.length + " remoção(ões) de `" + nome
    + "` foram RETIDAS (" + motivo + "). Veja `cadRemocoesRetidas()`.");
  return sumidos.length;
}

/* ---------------------------------------------------------------------------
   AS INTENÇÕES · registradas antes do miolo, enviadas no `finally`, exatamente
   como Pedidos e Demanda. Com a flag do cadastro desligada, isto devolve lista
   vazia na primeira linha e o comportamento de hoje não muda em nada.
   --------------------------------------------------------------------------- */
function cadRegistrarIntencoes(secoes) {
  if (typeof S === "undefined") return [];
  if (!CAD_TIPOS) return [];
  const intencoes = [];

  for (const nome of cadNomes()) {
    if (!cadEscreveNaTabela(nome)) continue;
    const t = cadTipo(nome);
    const secao = String(t.doc_chave || "").replace(/^pcp5:/, "");
    /* a gravação diz quais seções mexeu; se não mexeu na deste cadastro,
       não há o que comparar */
    if (secoes && secoes.length && !secoes.includes(secao)) continue;
    const registros = cadRegistrosDaTela(nome);
    if (!registros.length && !(CAD_FOTO[nome] || new Map()).size) continue;

    const vistos = new Set();
    const novos = [];
    for (const { id, obj } of registros) {
      vistos.add(String(id));
      const d = cadDiferenca(nome, Object.assign({}, obj, { id }));
      if (d.novo) { novos.push(Object.assign({}, obj, { id })); continue; }
      if (d.campos.length) {
        const patch = {};
        for (const k of d.campos) patch[k] = d.dados[k] === undefined ? null : d.dados[k];
        intencoes.push({ cadastro: nome, acao: "patch", id: String(id),
          patch, campos: d.campos, revision: d.revision, base: d.base });
      }
    }
    if (novos.length) intencoes.push({ cadastro: nome, acao: "criar", itens: novos });
    /* sumiu da tela e estava na foto ATIVO → remover (o servidor decide o destino),
       MAS só depois da guarda contra remoção em massa */
    const foto = CAD_FOTO[nome] || new Map();
    const sumidos = [];
    for (const [id, f] of foto) if (!vistos.has(id) && f.ativo !== false) sumidos.push([id, f]);
    if (sumidos.length) {
      const teto = Math.max(CAD_REMOCAO_MAX, Math.ceil(foto.size * CAD_REMOCAO_FRACAO));
      const porImportacao = cadImportando();
      const demais = sumidos.length > teto;
      if (porImportacao || demais) {
        cadReterRemocoes(nome, sumidos, porImportacao
          ? "troca de listas (importação ou restauração)"
          : sumidos.length + " de uma vez, acima do teto de " + teto);
      } else {
        for (const [id, f] of sumidos) {
          intencoes.push({ cadastro: nome, acao: "remover", id, revision: f.revision,
            motivo: "removido na tela" });
        }
      }
    }
  }
  CAD_PENDENTES = intencoes;
  return intencoes;
}

async function cadEnviarIntencoes() {
  const fila = CAD_PENDENTES; CAD_PENDENTES = [];
  if (!fila.length) {
    /* registrar TAMBÉM o envio vazio. Sem isto `cadUltimoEnvio()` seguia
       mostrando o envio anterior, e um diagnóstico que mostra o passado como
       se fosse o presente é pior que não ter diagnóstico. */
    CAD_ULTIMO_ENVIO = { em: new Date().toISOString(), enviadas: [], problemas: [], nada: true };
    return { status: "nada", enviadas: [] };
  }
  const enviadas = []; const problemas = [];

  for (const i of fila) {
    let r = null;
    try {
      if (i.acao === "criar") {
        r = await cdCriar(i.cadastro, i.itens);
        enviadas.push({ cadastro: i.cadastro, acao: "criar", rpc: "pcp_cad_criar",
          ids: i.itens.map((x) => x.id), resposta: r });
        for (const linha of ((r && r.criados) || [])) cadGuardarFoto(i.cadastro, linha);
        if (!r || r.status !== "ok") problemas.push({ cadastro: i.cadastro, resposta: r });
        continue;
      }
      if (i.acao === "patch") {
        const cheio = {};
        for (const k of i.campos) cheio[k] = i.patch[k];
        r = await cdPatch(i.cadastro, i.id, i.revision, cheio, i.base);
        enviadas.push({ cadastro: i.cadastro, acao: "patch", rpc: "pcp_cad_patch",
          id: i.id, campos: i.campos, resposta: r });
        if (r && r.status === "ok" && r.registro) cadGuardarFoto(i.cadastro, r.registro);
        else problemas.push({ cadastro: i.cadastro, id: i.id, resposta: r });
        continue;
      }
      if (i.acao === "remover") {
        r = await cdRemover(i.cadastro, i.id, i.revision, i.motivo);
        enviadas.push({ cadastro: i.cadastro, acao: "remover",
          rpc: r && r.caminho === "apagado" ? "pcp_cad_apagar" : "pcp_cad_cancelar",
          tentou: "pcp_cad_remover", caminho: r && r.caminho,
          recusaDoApagar: r && r.recusa_do_apagar, id: i.id, resposta: r });
        if (r && r.status === "ok") {
          /* apagado some da foto; CANCELADO continua nela, porque continua
             existindo na tabela — sumiu só da tela, que ainda é o legado */
          if (r.caminho === "apagado") (CAD_FOTO[i.cadastro] || new Map()).delete(String(i.id));
          else if (r.registro) cadGuardarFoto(i.cadastro, r.registro);
        } else problemas.push({ cadastro: i.cadastro, id: i.id, resposta: r });
        continue;
      }
    } catch (e) {
      problemas.push({ cadastro: i.cadastro, id: i.id,
        resposta: { status: "erro", msg: String((e && e.message) || e) } });
    }
  }
  CAD_ULTIMO_ENVIO = { em: new Date().toISOString(), enviadas, problemas };
  const brigas = enviadas.filter((x) => x.resposta && x.resposta.status === "conflito-de-campo");
  if (brigas.length && typeof S !== "undefined") {
    S.avisoCadastro = brigas.map((b) => ({ cadastro: b.cadastro, id: b.id,
      disputados: (b.resposta.disputados || []).map((d) => d.campo) }));
  }
  return { status: problemas.length ? "com-problema" : "ok", enviadas, problemas };
}
function cadUltimoEnvio() { return CAD_ULTIMO_ENVIO; }

/* ---------------------------------------------------------------------------
   O ESPELHO · calcula o que mandaria, e não manda.
   Mesma classificação da Demanda, e a mesma disciplina: derivado não existe
   aqui (o registro só lista autoral), então toda divergência é autoral ou de
   identidade — e as duas bloqueiam a leitura.
   --------------------------------------------------------------------------- */
const CAD_ESPELHO_CHAVE = "pcp5:espelho-cadastros";
const CAD_ESPELHO_MAX = 2000;
function cadEspelhoLer() {
  try { const v = JSON.parse(localStorage.getItem(CAD_ESPELHO_CHAVE) || "[]");
    return Array.isArray(v) ? v : []; } catch { return []; }
}
function cadEspelhoGravar(l) {
  try { localStorage.setItem(CAD_ESPELHO_CHAVE, JSON.stringify(l.slice(-CAD_ESPELHO_MAX))); }
  catch {}
}
function cadEspelhoLimpar() { try { localStorage.removeItem(CAD_ESPELHO_CHAVE); } catch {} }
function cadAnotar(reg) {
  const l = cadEspelhoLer();
  l.push(Object.assign({ quando: new Date().toISOString() }, reg));
  cadEspelhoGravar(l);
  return reg;
}

/* Quais cadastros interessam a ESTA gravação. Duas peneiras, e as duas foram
   pagas caro:

   1 · a SEÇÃO. Antes, `cdListarTudo()` era chamada ANTES deste filtro: gravar
       um pedido (seção `nucleo`, onde não mora cadastro nenhum) baixava a
       tabela inteira de cadastros. Medido com 3.123 produtos: 2,13 MB e
       286 ms em TODA gravação de TODO módulo.
   2 · a FLAG DE LEITURA. O espelho existe para responder "posso ligar a
       leitura?". Depois que ela está ligada, a tela JÁ VEM da tabela — o
       espelho passa a comparar a tabela com ela mesma e a resposta é sempre
       zero. Continuar rodando é pagar 300 ms por uma pergunta já respondida. */
function cadEspelhoAlvos(secoes) {
  return cadNomes().filter((nome) => {
    const t = cadTipo(nome);
    if (!t) return false;
    const secao = String(t.doc_chave || "").replace(/^pcp5:/, "");
    if (secoes && secoes.length && !secoes.includes(secao)) return false;
    return !cadLeDaTabela(nome);
  });
}

let CAD_ESPELHANDO = false;
async function cadEspelhar(secoes) {
  if (CAD_ESPELHANDO) return null;
  if (typeof persToken !== "function" || !persToken()) return null;
  if (!CAD_TIPOS) { try { await cadCarregarTipos(); } catch (e) { return null; } }
  if (!cadNomes().length) return null;
  const alvos = cadEspelhoAlvos(secoes);
  if (!alvos.length) return { status: "nada", motivo: "nenhum cadastro desta gravação ainda espelha" };
  CAD_ESPELHANDO = true;
  try {
    /* só os cadastros alvo, e um por um: ler a tabela inteira para conferir
       dois fornecedores é o mesmo erro de sempre, em outra roupa */
    const porCad = {};
    for (const nome of alvos) {
      const r = await cdListar(nome);
      if (r.status !== "ok") return { status: r.status, cadastro: nome };
      const m = new Map();
      for (const it of r.itens) m.set(String(it.id), it);
      porCad[nome] = m;
    }
    const achados = [];
    for (const nome of alvos) {
      const t = cadTipo(nome);
      const registros = cadRegistrosDaTela(nome);
      const tab = porCad[nome] || new Map();
      for (const { id, obj: o } of registros) {
        const linha = tab.get(String(id));
        if (!linha) {
          achados.push(cadAnotar({ cadastro: nome, id: String(id), campo: "(o registro)",
            valorDocumento: o[(t.campos || [])[0]] ?? "(sem valor)", valorCamada: null,
            classificacao: "identidade", operationId: null }));
          continue;
        }
        const meu = cadNormalizar(nome, o);
        const dele = linha.dados || {};
        const chaves = new Set([...Object.keys(meu), ...Object.keys(dele)]);
        for (const k of chaves) {
          if (JSON.stringify(meu[k] ?? null) === JSON.stringify(dele[k] ?? null)) continue;
          achados.push(cadAnotar({ cadastro: nome, id: String(id), campo: k,
            valorDocumento: meu[k] ?? null, valorCamada: dele[k] ?? null,
            classificacao: "autoral", operationId: null }));
        }
      }
    }
    return { status: "ok", divergencias: achados.length };
  } catch (e) {
    console.error("espelho dos cadastros:", e);
    return { status: "erro", msg: String((e && e.message) || e) };
  } finally { CAD_ESPELHANDO = false; }
}

function cadEspelhoPlacar() {
  const l = cadEspelhoLer();
  const por = (k) => l.filter((x) => x.classificacao === k).length;
  const porCadastro = {};
  for (const x of l) porCadastro[x.cadastro] = (porCadastro[x.cadastro] || 0) + 1;
  return {
    total: l.length,
    desde: l.length ? l[0].quando : null, ate: l.length ? l[l.length - 1].quando : null,
    autoral: por("autoral"), identidade: por("identidade"),
    porCadastro,
    podeLigarLeitura: por("autoral") === 0 && por("identidade") === 0,
    porque: por("autoral") || por("identidade")
      ? "há divergência autoral ou de identidade — ver `cadEspelhoLista()`"
      : "sem divergência autoral nem de identidade",
  };
}
function cadEspelhoLista(quantas) { return cadEspelhoLer().slice(-(quantas || 50)); }
