/* ===========================================================================
   src/persistencia/equipe.js · EQUIPE, IDENTIDADE E AUTORIZAÇÃO
   ---------------------------------------------------------------------------
   A varredura mediu: `pcp_pessoa` existe no banco (com `auth_uid`, `adm`,
   `ativo`, `abas`) e **o app nunca a leu** — zero ocorrências no `src/`
   inteiro. Permissão era decidida 100% no cliente, a partir do documento
   `pcp5:equipe`, e `ehAdm()` devolvia **true para qualquer um** quando não
   havia nenhuma administradora ativa.

   Decisões da Ana, aplicadas aqui:
     · `pcp_pessoa` é a identidade OFICIAL; ninguém existe em equipe sem par lá;
     · a autorização de administradora é validada NO SERVIDOR;
     · o PIN sai do documento: o front não lê o hash, quem confere é a RPC.

   Com as flags desligadas, tudo devolve `desligado` e o app decide como hoje.
   =========================================================================== */
Object.assign(PX_RPC, {
  pessoa_salvar: "pcp_pessoa_salvar",
});

const eqLeDaTabela      = () => typeof telaFlag === "function" && telaFlag("equipe_leitura");
const eqEscreveNaTabela = () => typeof telaFlag === "function" && telaFlag("equipe_escrita");

/* A RESPOSTA DO SERVIDOR sobre quem eu sou. É ela que substitui o `ehAdm()`
   que abria tudo. Guardada porque é consultada em dezenas de lugares por
   render — mas vem do servidor uma vez por abertura, não por consulta. */
let EQ_EU = null;
let EQ_TEM_ADM = null;
const eqEu = () => EQ_EU;
function eqAdmDoServidor() {
  if (!eqLeDaTabela()) return null;          /* null = "não sei, decida como antes" */
  if (!EQ_EU) return null;
  if (EQ_EU.status !== "ok") return false;   /* sem vínculo NÃO é administradora */
  return !!EQ_EU.adm;
}

/* ---------------------------------------------------------------------------
   PESSOA É PESSOA, CONTA/SETOR É CONTA/SETOR (144)
   ---------------------------------------------------------------------------
   Na base dela o login é POR SETOR: `Contato`, `Atendimento`, `Separação` e
   `Produção` são contas de acesso que várias pessoas usam — e estavam em
   `pcp_pessoa` do lado da gente. Ler a tabela inteira poria os quatro setores
   na aba Equipe como se fossem gente.

   O 144 marca cada linha com `tipo`. Aqui a tela pede a coluna e descarta o
   que for conta. Antes do 144 a coluna não existe e o PostgREST recusa o
   pedido inteiro — por isso há a segunda tentativa, sem ela: uma base que
   ainda não recebeu o 144 continua funcionando como antes. */
const EQ_CAMPOS = "id,nome,email,adm,ativo,abas,edit,funcoes,ordem,ver_valores,revision,auth_uid";

async function eqLer() {
  const com = await persLer("pcp_pessoa?select=" + EQ_CAMPOS + ",tipo,conta_id&order=ordem,nome");
  if (com.ok) return { r: com, temTipo: true };
  const sem = await persLer("pcp_pessoa?select=" + EQ_CAMPOS + "&order=ordem,nome");
  return { r: sem, temTipo: false };
}

async function eqCarregar() {
  if (!eqLeDaTabela()) return { status: "desligado" };
  const [lida, eu, tem] = await Promise.all([
    eqLer(),
    persRpc("pcp_eu", {}),
    persRpc("pcp_tem_adm", {}),
  ]);
  const pes = lida.r;
  if (!pes.ok) return pxResposta(pes, "listar-equipe");
  if (typeof S === "undefined") return { status: "sem-estado" };
  EQ_EU = (eu && eu.corpo) || null;
  EQ_TEM_ADM = (tem && tem.corpo) === true;
  EQ_REV = {};
  /* linha sem `tipo` conta como pessoa: é o que ela era antes do 144 */
  const contas = persLista(pes.corpo).filter((x) => x.tipo === "conta");
  const lista = persLista(pes.corpo).filter((x) => x.tipo !== "conta").map((x) => {
    EQ_REV[x.id] = x.revision;
    return { id: x.id, nome: x.nome, email: x.email, adm: !!x.adm, ativo: x.ativo !== false,
             abas: x.abas || [], edit: x.edit || {}, funcoes: x.funcoes || [],
             verValores: !!x.ver_valores, temConta: !!x.auth_uid,
             contaId: x.conta_id || null,
             contaNome: (contas.find((c) => c.id === x.conta_id) || {}).nome || null };
  });
  /* A conta de setor é um ACESSO, e a tela de Equipe precisa mostrar e editar o
     que ele pode fazer. Antes só o nome e o e-mail vinham — o resto da linha era
     descartado, e a tela não tinha como oferecer "Editar". Os campos já vinham
     na leitura; agora deixam de ser jogados fora. */
  EQ_CONTAS = contas.map((c) => { EQ_REV[c.id] = c.revision;
    return { id: c.id, nome: c.nome, email: c.email, ehConta: true,
      adm: !!c.adm, ativo: c.ativo !== false, abas: c.abas || [], edit: c.edit || {},
      funcoes: c.funcoes || [], verValores: !!c.ver_valores }; });
  /* a tabela vazia com a flag ligada seria APAGAR a equipe da tela — isso não é
     leitura, é perda. Mesma regra do motor de cadastros. */
  if (!lista.length) return { status: "vazia", motivo: "a tabela não devolveu ninguém — a tela seria esvaziada" };
  S.equipe.length = 0;
  for (const p of lista) S.equipe.push(p);
  return { status: "ok", pessoas: lista.length, contas: EQ_CONTAS.length,
           separaPessoaDeConta: lida.temTipo,
           eu: EQ_EU && EQ_EU.id, adm: eqAdmDoServidor(), temAdm: EQ_TEM_ADM };
}
let EQ_REV = {};
/* as contas de acesso, guardadas para quem quiser mostrar por onde a pessoa
   entra. Elas NÃO entram em `S.equipe`: não são gente. */
let EQ_CONTAS = [];
const eqContas = () => EQ_CONTAS.slice();
/* `eqContas()` devolve CÓPIA — mexer no resultado dela não muda nada, e é de
   propósito: a lista é da camada, não de quem lê. Quem precisa gravar usa esta. */
function eqAtualizarConta(p) {
  const k = EQ_CONTAS.findIndex((x) => x.id === p.id);
  if (k >= 0) EQ_CONTAS[k] = Object.assign({}, EQ_CONTAS[k], p, { ehConta: true });
}
/* ---------- quem é a conta que entrou ----------
   As linhas `tipo='conta'` são tiradas de `S.equipe` de propósito, no
   `eqCarregar` acima: conta de setor NÃO é pessoa, e misturar as duas foi
   justamente o que o 144 separou.

   Só que o portão de entrada procurava a conta autenticada DENTRO de
   `S.equipe` — onde ela nunca esteve. Resultado: `atendimento@`, `contato@`,
   `producao@` e `separacao@` caíam em "Falta ligar esta conta a uma pessoa"
   com o e-mail preenchido e tudo certo no banco. Ana e João entravam porque
   são `tipo='pessoa'` e continuam na lista.

   Esta função é a ponte, e ela só LÊ: devolve a conta correspondente ao e-mail
   autenticado. Não converte nada, não toca em `conta_id`, não escreve linha. */
function eqContaPorEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  return EQ_CONTAS.find((c) => String(c.email || "").trim().toLowerCase() === e) || null;
}
/* As pessoas que trabalham sob esta conta — para a tela poder dizer quem são,
   sem que nenhuma delas vire a identidade da sessão. */
const eqPessoasDaConta = (contaId) => (S.equipe || []).filter((p) => p.contaId === contaId);

/* ---------------------------------------------------------------------------
   A ESCRITA
   --------------------------------------------------------------------------- */
async function eqSalvarPessoa(p, nova) {
  if (!eqEscreveNaTabela()) return { status: "desligado" };
  const patch = { nome: p.nome, email: p.email || null, ativo: p.ativo !== false,
    adm: !!p.adm, abas: p.abas || [], edit: p.edit || {},
    funcoes: p.funcoes || [], ver_valores: !!p.verValores };
  if (p.ordem != null) patch.ordem = p.ordem;
  const r = await pxEnviar(obEnfileirar("pessoa_salvar", p.id, {
    p_id: p.id, p_expected_revision: nova ? null : (EQ_REV[p.id] ?? null), p_patch: patch }));
  if (r && r.status === "ok" && r.registro) { EQ_REV[p.id] = r.registro.revision; return r; }
  if (!r || r.status === "ok" || r.status === "desligado") return r;
  /* ---------- CONFERIR ANTES DE ACUSAR ----------
     O que acontecia: a função do servidor grava e SÓ DEPOIS avalia alguma
     condição; quando ela devolve um status diferente de "ok" por `return`
     (e não por exceção), o Postgres NÃO desfaz a gravação. A tela lia só o
     status, dizia "Não consegui salvar" — e o dado estava lá.

     Então, antes de acusar, a gente vai ver. Uma leitura da própria linha
     responde a única pergunta que importa: o servidor tem o que eu mandei?
     Se tem, foi salvo, e a tela precisa dizer isso.

     Isto não reenvia nada. É `select`. */
  try {
    const c = await persLer("pcp_pessoa?id=eq." + encodeURIComponent(p.id)
      + "&select=" + EQ_CAMPOS + ",tipo,conta_id");
    const linha = persLista(c.corpo)[0];
    if (c.ok && linha) {
      const igual = ["nome", "email", "ativo", "adm", "ver_valores"].every((k) => {
        const a = patch[k], b = linha[k];
        if (typeof a === "boolean" || typeof b === "boolean") return !!a === !!b;
        return String(a ?? "") === String(b ?? "");
      });
      if (igual) {
        if (linha.revision != null) EQ_REV[p.id] = linha.revision;
        /* Gravou. O status feio veio de uma etapa DEPOIS da gravação — vale um
           aviso discreto, nunca um "não consegui salvar". */
        return { status: "ok", conferidoNoServidor: true, registro: linha,
                 aviso: String(r.msg || r.motivo || r.texto || r.status || "").slice(0, 160) };
      }
    }
  } catch {}
  return r;
}

/* A ORDEM É DADO: `nucleo/utilidades.js:75` decide por ela quem recebe a tarefa
   primeiro. Reordenar na tela tem de virar `ordem` no servidor. */
async function eqSalvarOrdem() {
  if (!eqEscreveNaTabela() || typeof S === "undefined") return { status: "desligado" };
  const problemas = [];
  for (let i = 0; i < S.equipe.length; i++) {
    const p = S.equipe[i];
    if (!p || !p.id) continue;
    const r = await pxEnviar(obEnfileirar("pessoa_salvar", p.id, {
      p_id: p.id, p_expected_revision: EQ_REV[p.id] ?? null, p_patch: { ordem: (i + 1) * 10 } }));
    if (r && r.status === "ok" && r.registro) EQ_REV[p.id] = r.registro.revision;
    else if (r && r.status !== "ok") problemas.push({ id: p.id, resposta: r });
  }
  return { status: problemas.length ? "com-problema" : "ok", problemas };
}

/* ---------------------------------------------------------------------------
   O PIN · o front nunca vê o hash
   --------------------------------------------------------------------------- */
async function eqPinDefinir(pessoaId, pin) {
  if (!eqEscreveNaTabela()) return { status: "desligado" };
  const r = await persRpc("pcp_pin_definir", { p_pessoa_id: pessoaId, p_pin: String(pin || "") });
  return (r && r.corpo) || { status: "falhou" };
}
async function eqPinConferir(pessoaId, pin) {
  if (!eqLeDaTabela()) return { status: "desligado" };
  const r = await persRpc("pcp_pin_conferir", { p_pessoa_id: pessoaId, p_pin: String(pin || "") });
  return (r && r.corpo) || { status: "falhou" };
}

function eqDiagnostico() {
  return { leitura: eqLeDaTabela(), escrita: eqEscreveNaTabela(),
           eu: EQ_EU, temAdmNoServidor: EQ_TEM_ADM,
           pessoas: ((typeof S !== "undefined" && S.equipe) || []).length,
           contasDeAcesso: EQ_CONTAS.map((c) => c.nome) };
}
