/* ===========================================================================
   src/pedidos/cancelamento.js · o ciclo de vida de um pedido que sai do fluxo
   ---------------------------------------------------------------------------
   Três estados, três portas, e uma regra que vale acima de todas:

     ativo      → pode CANCELAR
     cancelado  → pode REATIVAR  ·  pode EXCLUIR
     excluído   → nada. Some da operação e fica no acervo.

   A REGRA ACIMA DE TODAS: o número não volta. Nem cancelando, nem excluindo,
   nem arquivando. Quem entrega número é `pcp_ciclo.proximo_numero`, que é um
   contador guardado — não uma dedução sobre o que está na tela. O papel que
   saiu com "1549" impresso continua na sacola da prestadora depois de o pedido
   ser excluído aqui dentro; se o 1549 renascesse, "o 1549" deixaria de ser uma
   resposta.

   POR QUE EXCLUIR É `pcp_pedido_apagar` E NÃO UM `delete`:
   o pedido é apontado pela auditoria, pela memória de operações, pelas faltas
   de Compras, pelos movimentos de insumo (que é a JUSTIFICATIVA da baixa de
   estoque) e pela OP. Apagar a linha deixaria todos esses apontando para o
   vazio. `pcp_pedido_apagar` carimba `deleted_at` e a visão
   `pcp_pedido_operacional` para de mostrá-lo — que é exatamente "sai da
   operação, continua no histórico". E `pcp_pedido_patch` recusa pedido
   apagado, o que faz "não poderá ser reativado" ser regra do servidor, não
   promessa da tela.
   =========================================================================== */

/* Excluído = o servidor carimbou. Os dois carimbos têm o mesmo efeito na tela;
   guardamos os dois porque `pcp_pedido_arquivar` é o irmão que arquiva ciclo
   inteiro, e um pedido pode chegar aqui por qualquer um dos dois caminhos. */
const pedExcluido = (r) => !!(r && (r.deleted_at || r.arquivado_em || r.arquivadoEm));

const pedPodeCancelar = (r) => !!r && !pedExcluido(r) && r.status !== "cancelado";
const pedPodeReativar = (r) => !!r && !pedExcluido(r) && r.status === "cancelado";
/* Excluir só depois de cancelar. Duas decisões, nunca uma só: quem cancela
   ainda pode mudar de ideia; quem exclui já mudou de ideia uma vez. */
const pedPodeExcluir  = (r) => pedPodeReativar(r);

/* ---------------------------------------------------------------------------
   DE ONDE ELE VEIO · o estágio anterior ao cancelamento
   ---------------------------------------------------------------------------
   A partir desta versão o cancelamento GRAVA de onde o pedido saiu. Para os
   que já estavam cancelados antes disso, o campo não existe — e aí a regra é
   não inventar: o app deriva uma SUGESTÃO dos carimbos do próprio pedido,
   escreve por que sugeriu aquilo, e a pessoa decide.

   Os carimbos não são palpite: `separadaEm`, `enviadaEm` e `retornadaEm` são
   datas que só existem porque a etapa aconteceu. A única ambiguidade é entre
   "Papel de Produção" e "Separar/Cortar", que é onde nada aconteceu ainda —
   ou seja, onde errar não custa nada.
   --------------------------------------------------------------------------- */
function pedEstagioDerivado(r) {
  const d = (v) => { try { return fdate(v); } catch { return String(v || ""); } };
  if (!r) return { status: "papel", porque: "", incerto: true };
  if (r.retornadaEm)
    return { status: "retornada", porque: `voltou da prestadora em ${d(r.retornadaEm)}` };
  if (Number(r.qtdConferida) > 0)
    return { status: "chegou", porque: `já tinha ${Number(r.qtdConferida)} peças conferidas` };
  if (r.enviadaEm)
    return { status: "enviada", porque: `foi enviado à prestadora em ${d(r.enviadaEm)}` };
  if (r.separadaEm)
    return { status: "separando", porque: `foi separado em ${d(r.separadaEm)}` };
  return { status: "papel", incerto: true,
    porque: "não tem data de separação, de envio nem de retorno — nada tinha começado" };
}

/* A resposta que a tela usa: ou o registro, ou a sugestão com o motivo. */
function pedEstagioAnterior(r) {
  const guardado = r && r.statusAntesCancelamento;
  if (guardado && P_STATUS.includes(guardado))
    return { status: guardado, guardado: true };
  return Object.assign({ guardado: false }, pedEstagioDerivado(r));
}

/* ---------------------------------------------------------------------------
   AS TRÊS AÇÕES
   ---------------------------------------------------------------------------
   Cancelar e reativar são MUDANÇA DE CAMPO: a tela mexe no objeto e
   `salvarPedidos()` manda o patch do que mudou, como faz para qualquer outra
   edição. Não há RPC nova, não há SQL novo — `extra` já aceita campo que o app
   inventa e devolve na leitura.

   Excluir é diferente: é RPC própria (`pcp_pedido_apagar`), porque não é um
   campo que muda, é a linha saindo da operação.
   --------------------------------------------------------------------------- */

/* O histórico do cancelamento NÃO é apagado pela reativação. Ele fica numa
   lista dentro do próprio pedido, além da auditoria do servidor: a auditoria
   responde "quem fez o quê"; esta lista responde "este pedido já foi
   cancelado antes?" sem precisar de consulta. */
function pedRegistrarCancelamento(r, de) {
  const lista = Array.isArray(r.cancelamentos) ? r.cancelamentos.slice() : [];
  lista.push({ em: new Date().toISOString(),
    por: (typeof usuarioAtual === "function" && usuarioAtual()?.nome) || null, de });
  r.cancelamentos = lista;
}
function pedRegistrarReativacao(r, para) {
  const lista = Array.isArray(r.cancelamentos) ? r.cancelamentos.slice() : [];
  const ultimo = lista.length ? Object.assign({}, lista[lista.length - 1]) : { de: null };
  ultimo.reativadoEm = new Date().toISOString();
  ultimo.reativadoPor = (typeof usuarioAtual === "function" && usuarioAtual()?.nome) || null;
  ultimo.para = para;
  if (lista.length) lista[lista.length - 1] = ultimo; else lista.push(ultimo);
  r.cancelamentos = lista;
}

async function pedCancelar(r) {
  if (!pedPodeCancelar(r)) return { status: "nao-cabe" };
  const de = r.status;
  r.statusAntesCancelamento = de;      /* vai para `extra` no servidor */
  r.status = "cancelado";
  r.canceladoEm = new Date().toISOString();
  r.canceladoPor = (typeof usuarioAtual === "function" && usuarioAtual()?.nome) || null;
  pedRegistrarCancelamento(r, de);
  r.atualizadoEm = r.canceladoEm;
  /* o número NÃO é tocado, e a marca d'água continua contando com ele */
  registrar(r.opId, `pedido ${r.numero} cancelado`, P_LABEL[de] || de, "Cancelado");
  recalcularOP(opPorId(r.opId));
  await salvarPedidos();
  return { status: "ok", de };
}

/* Reativar NÃO recria nada e NÃO repete nada.
   · o `id` é o mesmo objeto — nunca se cria pedido aqui;
   · o `numero` não é tocado em lugar nenhum desta função;
   · `consumoBaixado`/`consumoMovs` não são mexidos: cancelar já não desfazia a
     baixa de insumo, então reativar não tem baixa nenhuma para refazer. Mexer
     neles aqui é que criaria movimento duplicado. É por isso que esta função
     não os menciona em nenhuma atribuição — a ausência é a proteção.
   · o histórico do cancelamento fica. */
async function pedReativar(r, statusEscolhido) {
  if (!pedPodeReativar(r)) return { status: "nao-cabe" };
  const alvo = P_STATUS.includes(statusEscolhido)
    ? statusEscolhido : pedEstagioAnterior(r).status;
  r.status = alvo;
  delete r.statusAntesCancelamento;
  delete r.canceladoEm;
  delete r.canceladoPor;
  pedRegistrarReativacao(r, alvo);
  r.atualizadoEm = new Date().toISOString();
  registrar(r.opId, `pedido ${r.numero} reativado`, "Cancelado", P_LABEL[alvo] || alvo);
  recalcularOP(opPorId(r.opId));
  await salvarPedidos();
  return { status: "ok", para: alvo };
}

/* Excluir · sai da operação, fica no acervo, o número continua consumido. */
async function pedExcluir(r, motivo) {
  if (!pedPodeExcluir(r)) return { status: "nao-cabe" };
  /* A marca d'água é atualizada ANTES de o pedido sair da lista — depois dele
     sair, ninguém mais consegue perguntar qual era o número dele. Esta linha é
     a que impede o número de voltar no caminho legado. */
  numeroMarcarUsado(r.numero);

  if (typeof telaEscreveNaTabela === "function" && telaEscreveNaTabela()) {
    const rr = await telaApagarPedido(r.id, motivo || "excluído pela tela de Pedidos");
    if (!rr || rr.status !== "ok") return rr || { status: "erro" };
  }
  /* Some da operação nos dois caminhos. No caminho da linha ele já não voltaria
     na próxima leitura (a visão o exclui); tirar aqui é o que faz a tela
     responder no mesmo instante, sem esperar a releitura. */
  const antes = S.pedidos.length;
  S.pedidos = S.pedidos.filter((x) => x.id !== r.id);
  registrar(r.opId, `pedido ${r.numero} excluído`, "Cancelado", "Excluído");
  recalcularOP(opPorId(r.opId));
  await salvarPedidos();
  return { status: "ok", saiu: antes !== S.pedidos.length };
}
