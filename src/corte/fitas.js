/* ===========================================================================
   src/corte/fitas.js · O CADASTRO DE FITAS, do lado do app
   ---------------------------------------------------------------------------
   v8.107. Lê `pcp_fita` e grava pelas RPCs da 147, sempre pela fila
   (src/corte/outbox.js). A tela não fala com o servidor: fala com este
   arquivo, e este arquivo enfileira.

   POR QUE NÃO O MOTOR GENÉRICO DE CADASTROS
     `src/persistencia/cadastros.js` liga um cadastro novo com uma linha em
     `pcp_cad_tipo`. A fita não cabe nele: tem código único por fornecedor,
     índice de busca, soft delete, foto e `editado` — coisas que o motor
     genérico não modela. Ela ganhou tabela e RPC próprias na 147. O que se
     reaproveita de lá é o PADRÃO (foto da base, diferença por campo, conflito
     por campo), não o código.

   O QUE É NOSSO E O QUE É DO FORNECEDOR
     `classe`, `local` e `obs` são nossos: a importação de catálogo (v8.108+)
     não os sobrescreve. Quando alguém corrige um campo à mão, o nome do campo
     fica anotado em `editado` — é essa anotação que a importação futura vai
     ler antes de encostar em qualquer valor. Por isso ela nasce aqui, na
     versão que ainda não tem importação: depois seria tarde.

   ESTADO
     A lista vive neste módulo, não em `S`. A tela de fitas é nova e lê por
     `ftLista()`; pendurar mais um ramo em `S` só para isso seria mexer no
     estado do app inteiro por causa de uma tela.
   =========================================================================== */

/* app → servidor. O que não está aqui, o servidor não recebe. */
const FT_CAMPOS = Object.freeze({
  id: "id", fornecedor: "fornecedor", codigo: "codigo", ref: "ref", numero: "numero",
  larguraMm: "largura_mm", nome: "nome", cor: "cor", estampa: "estampa",
  classe: "classe", local: "local", obs: "obs", fotoPath: "foto_path",
  ativo: "ativo", origem: "origem", importadoEm: "importado_em", editado: "editado",
});
const FT_COLUNAS = Object.freeze(Object.entries(FT_CAMPOS).map(([, c]) => c).concat(["revision"]));

function ftParaServidor(f) {
  const out = {};
  for (const [app, col] of Object.entries(FT_CAMPOS)) {
    const v = f[app];
    if (v !== undefined) out[col] = v === "" ? null : v;
  }
  return out;
}
function ftParaApp(linha) {
  const out = {};
  for (const [app, col] of Object.entries(FT_CAMPOS)) out[app] = linha[col];
  out.revision = linha.revision;
  return out;
}

let FT_LISTA = [];
/* declarações, não arrows: a bateria roda dentro do navegador e precisa
   alcançá-las, e a tela é montada depois deste arquivo no bundle. */
function ftLista()   { return FT_LISTA.slice(); }
function ftAchar(id) { return FT_LISTA.find((f) => f.id === id) || null; }
function ftQuantas() { return FT_LISTA.length; }

/* id nasce no app, com prefixo, como o do pedido: é o que deixa a fila
   reenviar a mesma criação sem duplicar linha. */
function ftNovoId() {
  const a = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
    : Math.random().toString(16).slice(2, 12);
  return `ft_${a}`;
}

/* ---------------------------------------------------------------------------
   LEITURA · a visão da tela. Apagada (soft delete) não aparece.
   --------------------------------------------------------------------------- */
async function ftCarregar() {
  const r = await persLer(
    `pcp_fita?deleted_at=is.null&select=${FT_COLUNAS.join(",")}&order=nome.asc&limit=5000`);
  if (!r.ok) return { status: "nao-consegui", erro: r.erro, quantas: FT_LISTA.length };
  FT_LISTA = persLista(r.corpo).map(ftParaApp);
  return { status: "ok", quantas: FT_LISTA.length };
}

/* Busca única: código, nome, cor, número, fornecedor e localização no mesmo
   campo — é assim que a pessoa procura na bancada, sem escolher coluna.
   Filtra a lista já carregada: o índice GIN do servidor é para quando a
   biblioteca crescer além do que cabe na memória da tela. */
function ftBuscar(texto) {
  const q = String(texto || "").trim().toLowerCase();
  if (!q) return ftLista();
  const partes = q.split(/\s+/);
  return FT_LISTA.filter((f) => {
    const alvo = [f.codigo, f.ref, f.nome, f.cor, f.numero, f.fornecedor, f.local, f.classe]
      .map((x) => String(x == null ? "" : x).toLowerCase()).join(" ");
    return partes.every((p) => alvo.includes(p));
  });
}

/* ---------------------------------------------------------------------------
   VALIDAÇÃO · antes da fila, porque uma ação inválida não deve nem nascer.
   `nome` é obrigatório porque a coluna é NOT NULL e a RPC recusa vazio — a
   tela preenche o nome com o código quando a pessoa digita só o código.
   --------------------------------------------------------------------------- */
function ftValidar(f) {
  if (!f || typeof f !== "object") return "fita vazia";
  if (!String(f.nome || "").trim()) return "a fita precisa de um nome";
  if (f.larguraMm != null && f.larguraMm !== "" && !(Number(f.larguraMm) > 0)) return "largura inválida";
  if (f.estampa && !["lisa", "estampada"].includes(String(f.estampa))) return "estampa desconhecida";
  return null;
}

/* ---------------------------------------------------------------------------
   GRAVAÇÃO · enfileira e tenta drenar. Com `corte_escrita` desligada o dreno
   devolve "desligado" sem tocar na rede, e a ação fica guardada.
   `campoMexido` são os campos que a PESSOA alterou nesta gravação: ficam
   anotados em `editado` para a importação futura não passar por cima.
   --------------------------------------------------------------------------- */
async function ftSalvar(fita, campoMexido) {
  const erro = ftValidar(fita);
  if (erro) return { status: "invalido", motivo: erro };

  const atual = fita.id ? ftAchar(fita.id) : null;
  const f = Object.assign({}, fita);
  if (!f.id) f.id = ftNovoId();
  /* `origem` só se decide no nascimento. Reafirmar "manual" a cada gravação
     apagaria o "catalogo" de uma fita importada na primeira correção à mão —
     e é justamente a fita corrigida à mão que a importação futura precisa
     reconhecer. Em fita existente o campo nem vai: a RPC preserva o que há. */
  if (!atual && !f.origem) f.origem = "manual";
  if (atual) delete f.origem;

  /* o que foi corrigido à mão fica marcado, sem apagar marca antiga */
  const marcas = Object.assign({}, (atual && atual.editado) || {}, (fita.editado || {}));
  for (const c of (campoMexido || [])) marcas[c] = true;
  f.editado = marcas;

  const acao = cxEnfileirar("corte_fita_salvar", f.id, {
    p_dados: ftParaServidor(f),
    p_expected_revision: atual ? atual.revision : null,
  });
  if (!acao) return { status: "invalido", motivo: "ação desconhecida" };

  /* a tela já mostra o valor novo; a fila é que decide quando ele chega lá */
  ftGuardarLocal(Object.assign({}, atual || {}, f));

  const r = await cxDrenar();
  return ftDepoisDoDreno(r, f.id, acao.opId);
}

async function ftApagar(id) {
  const atual = ftAchar(id);
  if (!atual) return { status: "nao-encontrado", id };
  const acao = cxEnfileirar("corte_fita_apagar", id, {
    p_id: id, p_expected_revision: atual.revision,
  });
  const r = await cxDrenar();
  const fim = ftDepoisDoDreno(r, id, acao && acao.opId);
  if (fim.status === "ok") FT_LISTA = FT_LISTA.filter((f) => f.id !== id);
  return fim;
}

function ftGuardarLocal(f) {
  const i = FT_LISTA.findIndex((x) => x.id === f.id);
  if (i < 0) FT_LISTA.push(f); else FT_LISTA[i] = Object.assign({}, FT_LISTA[i], f);
  FT_LISTA.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
}

/* Traduz o resultado do dreno para a linguagem da tela, e mantém a `revision`
   local em dia quando o servidor confirmou. */
function ftDepoisDoDreno(r, id, opId) {
  if (r.status === "desligado") return { status: "na-fila", motivo: "gravação do corte desligada", id };
  const parada = (r.paradas || []).find((p) => p.opId === opId);
  if (parada) return Object.assign({ id }, parada.resposta, { acao: opId });
  if ((r.feitas || []).includes(opId)) {
    const f = ftAchar(id);
    return { status: "ok", id, revision: f ? f.revision : null };
  }
  return { status: "na-fila", id, restam: r.restam };
}

/* As ações de fita que pararam esperando gente: conflito, reuso, inválido.
   A tela mostra isto como aviso — elas NÃO sumiram, continuam guardadas. */
function ftParadas() {
  return cxParadas()
    .filter((a) => a.tipo === "corte_fita_salvar" || a.tipo === "corte_fita_apagar")
    .map((a) => ({ opId: a.opId, id: a.entidadeId, tipo: a.tipo,
                   status: a.ultimoErro, resposta: a.resposta || null }));
}

/* Depois de um conflito, a pessoa decide o valor: a intenção é OUTRA e nasce
   com id novo — mandar a nova com o id velho é `operacao-reutilizada`. */
async function ftReenviarResolvido(opId, fitaNova) {
  const erro = ftValidar(fitaNova);
  if (erro) return { status: "invalido", motivo: erro };
  const atual = ftAchar(fitaNova.id);
  const nova = cxNovaIntencao(opId, {
    p_dados: ftParaServidor(fitaNova),
    p_expected_revision: atual ? atual.revision : null,
  });
  if (!nova) return { status: "nao-achei", motivo: "esta ação não está mais na fila" };
  ftGuardarLocal(Object.assign({}, atual || {}, fitaNova));
  const r = await cxDrenar();
  return ftDepoisDoDreno(r, fitaNova.id, nova.opId);
}
