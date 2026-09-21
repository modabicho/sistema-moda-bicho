/* ===========================================================================
   src/corte/outbox.js · O DRENO DO CORTE
   ---------------------------------------------------------------------------
   v8.107. O Projeto de Corte grava pelas RPCs da migration 147, e grava pela
   MESMA fila durável de todo o resto (`pcp5:outbox`, src/persistencia/outbox.js).
   Fila nova seria fila nova para perder intenção.

   O QUE É PRÓPRIO DAQUI, E POR QUÊ
     `pxDrenar` só roda quando `telaEscreveNaTabela()` é verdade — ou seja,
     quando o cutover de PEDIDOS estiver ligado (src/persistencia/tela.js:566).
     O corte não pode ficar refém disso: ele tem tabela própria, RPC própria e
     flag própria. Por isso o dreno é separado, e cada um só leva o que é seu:

       pxDrenar  ignora tipo que começa com `corte_`
       cxDrenar  ignora tipo que NÃO começa com `corte_`

     A partição é por prefixo, em um lugar só (`cxEhCorte`), para as duas
     pontas nunca discordarem sobre de quem é a ação.

   O CONTRATO DAS RESPOSTAS é o mesmo do pedido, e usa o MESMO classificador
   (`pxResposta`): duas leituras do que é "offline" seria uma a mais.

     ok / sem_mudanca ....... sai da fila. Só isto tira ação da fila.
     offline / sem-login .... volta a pendente e PARA o laço: a fila fica
                              inteira, e vai sozinha quando a rede voltar.
     copia-teste ............ idem — o servidor não recebeu nada.
     invalido ............... para a ação e MANTÉM o operation_id: corrigir e
                              reenviar com o mesmo id funciona, porque o
                              servidor não registra operação em validação
                              recusada (147, §14).
     conflito ............... para a ação, NÃO descarta. Quem resolve é gente.
     operacao-reutilizada ... para a ação. A intenção nova nasce com id NOVO,
                              via `cxNovaIntencao` — mandar intenção diferente
                              com o id velho é exatamente o que o servidor
                              recusa.
     qualquer outra ......... para a ação. Nada sai da fila sem confirmação.
   =========================================================================== */

/* As seis RPCs da 147. Fita tem chamador na v8.107; as outras quatro entram
   quando a tela do Projeto de Corte existir — declaradas aqui porque o dreno é
   um só, e é ele que precisa saber o nome de cada uma. */
const CX_RPC = {
  corte_fita_salvar:      "pcp_fita_salvar",
  corte_fita_apagar:      "pcp_fita_apagar",
  corte_projeto_salvar:   "pcp_projeto_corte_salvar",
  corte_projeto_arquivar: "pcp_projeto_corte_arquivar",
  corte_vincular:         "pcp_pedido_corte_vincular",
  corte_congelar:         "pcp_pedido_corte_congelar",
};

/* A linha que divide as duas filas. Mora aqui e só aqui.
   É DECLARAÇÃO de função, não `const` com arrow, e isso é de propósito:
   `pxDrenar` a consulta com `typeof`, e `pedidos.js` vem ANTES deste arquivo
   no bundle. `typeof` sobre um `const` ainda não avaliado lança ReferenceError
   (TDZ) em vez de devolver "undefined" — a declaração é içada e não tem esse
   buraco. Mesma razão registrada em src/persistencia/servidor.js:85. */
function cxEhCorte(tipo) { return String(tipo || "").indexOf("corte_") === 0; }

/* A flag do servidor, lida pelo mesmo `telaFlag` das outras. Desligada é o
   padrão e é o lado seguro: se a leitura das flags não vier, ninguém grava. */
function corteEscreve() {
  return typeof telaFlag === "function" ? telaFlag("corte_escrita") : false;
}

function cxPendentes() { return (typeof obPendentes === "function" ? obPendentes() : []).filter((a) => cxEhCorte(a.tipo)); }
function cxParadas()   { return (typeof obParadas   === "function" ? obParadas()   : []).filter((a) => cxEhCorte(a.tipo)); }

/* Enfileira. O `operation_id` nasce aqui junto com a ação e não muda mais —
   é o que faz o retry ser retry, e não uma segunda gravação. */
function cxEnfileirar(tipo, entidadeId, dados) {
  if (!CX_RPC[tipo]) return null;
  return obEnfileirar(tipo, entidadeId, dados || {});
}

/* A intenção mudou depois de um conflito ou de uma recusa por reuso: id novo,
   de propósito. Reaproveitar o antigo é o caso que o servidor recusa. */
function cxNovaIntencao(opId, dadosNovos) {
  const acao = obLer().find((a) => a.opId === opId);
  if (!acao || !cxEhCorte(acao.tipo)) return null;
  return obNovaIntencao(acao, dadosNovos);
}

async function cxEnviar(acao) {
  const nome = CX_RPC[acao.tipo];
  if (!nome) {
    /* tipo desconhecido não fica girando na fila para sempre */
    obAtualizar(acao.opId, { estado: "parada", ultimoErro: "tipo-desconhecido" });
    return { status: "invalido", motivo: "tipo de ação desconhecido: " + acao.tipo };
  }

  obAtualizar(acao.opId, { estado: "enviando", tentativas: (acao.tentativas || 0) + 1 });
  const r = await persRpc(nome, Object.assign({}, acao.dados, { p_operation_id: acao.opId }));
  const res = pxResposta(r, acao.tipo);

  /* não saiu daqui: a ação FICA, com o mesmo id */
  if (res.status === "offline" || res.status === "sem-login" || res.status === "copia-teste") {
    obAtualizar(acao.opId, { estado: "pendente", ultimoErro: res.status });
    return Object.assign({ acao: acao.opId, naFila: true }, res);
  }

  /* só o que o servidor CONFIRMOU sai da fila */
  if (res.status === "ok" || res.status === "sem_mudanca" || res.status === "sem-mudanca") {
    obRemover(acao.opId);
    return Object.assign({ acao: acao.opId }, res);
  }

  obAtualizar(acao.opId, { estado: "parada", ultimoErro: res.status || "erro", resposta: res });
  return Object.assign({ acao: acao.opId }, res);
}

let CX_DRENANDO = false;
async function cxDrenar() {
  /* com a flag desligada, nada sai para a rede — nem uma requisição. A fila
     continua guardada e vai inteira no dia em que a flag ligar. */
  if (!corteEscreve()) {
    return { status: "desligado", feitas: [], paradas: [], restam: cxPendentes().length };
  }
  if (CX_DRENANDO) return { status: "ok", jaRodando: true };
  CX_DRENANDO = true;

  /* v8.111 · `respostas` guarda o que o servidor DEVOLVEU em cada ação que
     passou. Antes só o opId entrava em `feitas` e o corpo era jogado fora — e
     com ele a `revision` nova. Quem gravava ficava com a revisão velha no
     cache, a gravação seguinte mandava `expected_revision` desatualizada, e o
     servidor recusava com `conflito`. Trocar a foto duas vezes seguidas, ou
     remover logo depois de trocar, falhava por isso. Medido em produção. */
  const feitas = [], paradas = [], respostas = {};
  try {
    for (const acao of cxPendentes()) {
      const r = await cxEnviar(acao);
      if (r.status === "ok" || r.status === "sem_mudanca" || r.status === "sem-mudanca") {
        feitas.push(acao.opId);
        respostas[acao.opId] = r;
        continue;
      }
      /* sem rede é o único caso que interrompe: insistir nas outras só
         acumularia tentativa sem chance de sucesso */
      if (r.status === "offline" || r.status === "sem-login" || r.status === "copia-teste") break;
      paradas.push({ opId: acao.opId, status: r.status, resposta: r });
    }
  } finally { CX_DRENANDO = false; }

  return { status: "ok", feitas, paradas, respostas, restam: cxPendentes().length };
}
