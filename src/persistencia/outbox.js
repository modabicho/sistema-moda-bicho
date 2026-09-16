/* ===========================================================================
   src/persistencia/outbox.js · A FILA QUE SOBREVIVE AO NAVEGADOR
   ---------------------------------------------------------------------------
   Item 11 da fase E. A regra do servidor (CONTRATO-FRONTEND, item 5) é dura e
   é ela que desenha este arquivo:

     · um `operation_id` por AÇÃO — gerado quando a ação NASCE, guardado junto
       com ela. Nunca um id por sessão, por tela ou por tentativa;
     · o retry da MESMA ação leva o MESMO id: o servidor devolve o resultado
       guardado em vez de fazer duas vezes;
     · quando a intenção MUDA (conflito resolvido, o patch passa a ser outro),
       a reenviada leva um id NOVO — porque é outra intenção, e mandar a nova
       com o id velho é recusado com `operacao-reutilizada`.

   A fila vive no localStorage. "Fechar o navegador no meio" é um dos testes
   obrigatórios, e uma fila em memória não sobrevive a isso.
   =========================================================================== */

const OUTBOX_CHAVE = "pcp5:outbox";
const OUTBOX_MAX = 500;

function obUid() {
  return (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
}

function obLer() {
  try {
    const v = JSON.parse(localStorage.getItem(OUTBOX_CHAVE) || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function obGravar(fila) {
  try { localStorage.setItem(OUTBOX_CHAVE, JSON.stringify(fila.slice(-OUTBOX_MAX))); }
  catch { /* cota estourada: a fila em memória continua valendo nesta sessão */ }
}

/* Enfileira uma ação. O id nasce AQUI e não muda mais — é o que faz o retry
   ser retry. `dados` é o que vai para a RPC, já traduzido pelo mapa. */
function obEnfileirar(tipo, entidadeId, dados, extras) {
  const acao = Object.assign({
    opId: obUid(),                 /* o operation_id da AÇÃO */
    tipo,                          /* pedido_criar | pedido_patch | ... */
    entidadeId: entidadeId || null,
    dados: dados || {},
    tentativas: 0,
    nascida: Date.now(),
    estado: "pendente",            /* pendente | enviando | feita | parada */
    ultimoErro: null,
  }, extras || {});
  const fila = obLer();
  fila.push(acao);
  obGravar(fila);
  return acao;
}

/* A intenção mudou: mesma entidade, patch diferente. Id NOVO, de propósito —
   reaproveitar o antigo é o caso que o servidor recusa. */
function obNovaIntencao(acao, dadosNovos) {
  const fila = obLer().filter((a) => a.opId !== acao.opId);
  const nova = Object.assign({}, acao, {
    opId: obUid(),
    dados: dadosNovos,
    tentativas: 0,
    estado: "pendente",
    ultimoErro: null,
    substituiu: acao.opId,          /* rastro: de onde ela veio */
  });
  fila.push(nova);
  obGravar(fila);
  return nova;
}

function obAtualizar(opId, mudancas) {
  const fila = obLer();
  const i = fila.findIndex((a) => a.opId === opId);
  if (i < 0) return null;
  fila[i] = Object.assign({}, fila[i], mudancas);
  obGravar(fila);
  return fila[i];
}
function obRemover(opId) { obGravar(obLer().filter((a) => a.opId !== opId)); }
const obPendentes = () => obLer().filter((a) => a.estado === "pendente" || a.estado === "enviando");
const obParadas = () => obLer().filter((a) => a.estado === "parada");

/* Uma ação "enviando" que ficou para trás (a aba morreu no meio) volta a ser
   pendente na abertura. Ela pode ter chegado ao servidor ou não — e é
   exatamente por isso que ela guarda o mesmo `opId`: reenviar é seguro. */
function obDestravar() {
  const fila = obLer();
  let mexeu = false;
  for (const a of fila) if (a.estado === "enviando") { a.estado = "pendente"; mexeu = true; }
  if (mexeu) obGravar(fila);
  return fila.filter((a) => a.estado === "pendente").length;
}
