/* ===========================================================================
   src/persistencia/pedidos.js · AS AÇÕES DE PEDIDO, UMA A UMA
   ---------------------------------------------------------------------------
   Itens 4, 5, 7, 8, 9, 10 e 14 da fase E.

   Cada função aqui devolve SEMPRE o mesmo formato:
       { status, ... }
   onde `status` é um dos que o servidor define, mais dois locais:
       ok · conflito · numero-em-uso · apagado · arquivado · invalido ·
       operacao-reutilizada · sem-permissao
       + offline (não saiu daqui) · copia-teste (fora do site publicado)

   Nada de exceção para dizer "não deu": quem chama tem de poder tratar caso a
   caso sem try/catch, e um `throw` no meio de uma tela é como se perde o
   rascunho de quem estava digitando.
   =========================================================================== */

/* ---------------------------------------------------------------------------
   Desembrulha a resposta de uma RPC que devolve jsonb. `persRpc` já garante
   que erro do PostgREST não vira exceção; aqui a resposta vira o formato acima.
   --------------------------------------------------------------------------- */
function pxResposta(r, acao) {
  if (r.ok) {
    const c = r.corpo;
    if (c && typeof c === "object" && !Array.isArray(c) && c.status) return c;
    return { status: "ok", corpo: c };
  }
  const e = r.erro || {};
  if (e.tipo === "copia-teste") return { status: "copia-teste", msg: e.msg };
  if (e.tipo === "offline" || e.tipo === "servidor-fora") return { status: "offline", msg: e.msg };
  if (e.tipo === "sem-login") return { status: "sem-login", msg: e.msg };
  /* o servidor levanta `sem-permissao` como exceção, não como {status} */
  if (/sem-permissao/.test(String(e.msg || ""))) return { status: "sem-permissao", msg: e.msg };
  return { status: "erro", tipo: e.tipo, cod: e.cod, msg: e.msg, acao };
}

/* ---------------------------------------------------------------------------
   LEITURA · item 6. As telas do dia a dia leem a VISÃO, que já exclui apagados
   e arquivados. Ler `pcp_pedido` direto traz o acervo inteiro e é para quando
   essa for a intenção — busca histórica, conferência de mês fechado.

   A flag de cutover NÃO é ligada aqui: enquanto `pedidos_linha_leitura`
   estiver desligada, quem manda na tela continua sendo o documento. Esta
   função existe e é testada; ela só não é a fonte ainda.
   --------------------------------------------------------------------------- */
/* o mesmo teto que o PostgREST usa: pedir mais não adianta, pedir menos só
   aumenta o número de idas ao servidor */
const PX_PAGINA = 1000;
const PX_PAGINAS_MAX = 200;          /* 200 mil pedidos — muito além do real */

/* `null` = ainda não sei; `true`/`false` = já descobri nesta sessão. */
let PX_TEM_PREST_ID = null;
/* O PostgREST recusa coluna desconhecida com 400 e o nome dela na mensagem
   (`42703`). Reconhecer PELO NOME evita confundir com queda de rede, que a
   outbox trata de outro jeito. */
function pxColunaDesconhecida(r, coluna) {
  if (!r || r.status !== 400) return false;
  const txt = JSON.stringify(r.corpo || r.erro || "");
  return txt.includes(coluna) || /42703|does not exist|column .* not found/i.test(txt);
}

async function pxListar(opcoes) {
  const o = opcoes || {};
  /* -------------------------------------------------------------------------
     `prestadora_id` é COLUNA NOVA (arquivo 118). O app não pode EXIGIR que a
     migração já tenha rodado: publicar a versão nova antes do SQL, ou um SQL
     que falhou no meio, faria o `select` pedir uma coluna que não existe — e
     o PostgREST responde 400. Não seria um campo faltando: seria a LEITURA
     INTEIRA DE PEDIDOS parando, a tela principal em branco.

     Então a coluna é OPCIONAL: pede-se com ela e, se o servidor recusar por
     não conhecê-la, pede-se sem. É o mesmo desenho de `cadCarregarTipos` com
     as colunas do 114. A bancada pegou isto rodando as baterias antigas, cujos
     bancos não têm o 118 aplicado — que é exatamente o estado dela antes de
     colar o arquivo.
     ------------------------------------------------------------------------- */
  const COLS_BASE = "id,numero,ciclo,op_id,sku,processo,status,qtd,qtd_embalar,qtd_mix,"
    + "qtd_conferida,qtd_segunda,qtd_defeito,prioridade,prioridade_travada,prestadora,"
    + "setor,responsavel,separada_em,enviada_em,retornada_em,aguardando_material,obs,"
    + "campanha_id,criado_no_app,custo_real,mes_pagamento,mes_pagamento_auto,"
    + "consumo_baixado,etapas,etapas_usadas,chaves,consumo_movs,extra,criado_em,"
    + "revision,updated_at,duplicidade_historica";
  if (PX_TEM_PREST_ID === null) PX_TEM_PREST_ID = true;   /* otimista na 1ª vez */
  let cols = PX_TEM_PREST_ID ? COLS_BASE + ",prestadora_id" : COLS_BASE;
  const tabela = o.acervo ? "pcp_pedido" : "pcp_pedido_operacional";
  const filtro = o.desde ? `&updated_at=gt.${encodeURIComponent(o.desde)}` : "";

  /* -------------------------------------------------------------------------
     v8.27 · PAGINAR ATÉ O FIM.
     Esta função pedia a visão inteira de uma vez. O PostgREST do Supabase
     NÃO devolve tudo: ele corta em `db-max-rows` (1.000 por padrão) e não
     avisa — a resposta chega com status 200 e menos linhas. Com 1.593 pedidos,
     593 nunca chegavam à foto do servidor; o 2304 era um deles, e por não ter
     foto a alteração dela virava tentativa de CRIAÇÃO, recusada com 400.

     Então: páginas de 1.000, `offset` andando, até vir uma página menor que a
     página pedida. E o resultado diz quantas páginas foram — quem chama
     precisa poder provar que leu tudo, não confiar que leu.
     ------------------------------------------------------------------------- */
  const porPagina = Math.max(1, Number(o.pagina || PX_PAGINA));
  const teto = o.limite ? Number(o.limite) : 0;         /* limite explícito manda */
  const linhas = [];
  let paginas = 0, offset = 0;
  for (;;) {
    const quero = teto ? Math.min(porPagina, teto - linhas.length) : porPagina;
    if (quero <= 0) break;
    let r = await persLer(`${tabela}?select=${cols}${filtro}`
      + `&order=id&limit=${quero}&offset=${offset}`);
    if (!r.ok && PX_TEM_PREST_ID && pxColunaDesconhecida(r, "prestadora_id")) {
      /* o 118 ainda não rodou nesta base. Anota e segue sem a coluna — para o
         resto da sessão, sem tentar de novo a cada página. */
      PX_TEM_PREST_ID = false;
      cols = COLS_BASE;
      r = await persLer(`${tabela}?select=${cols}${filtro}`
        + `&order=id&limit=${quero}&offset=${offset}`);
    }
    if (!r.ok) return pxResposta(r, "listar");
    const lote = persLista(r.corpo);
    paginas++;
    for (const x of lote) linhas.push(x);
    if (lote.length < quero) break;                     /* acabou */
    offset += lote.length;
    if (paginas > PX_PAGINAS_MAX) {
      /* trava de segurança: melhor dizer que não deu do que girar para sempre */
      return { status: "erro", tipo: "paginacao", acao: "listar",
        msg: `a listagem passou de ${PX_PAGINAS_MAX} páginas — algo está errado`,
        pedidos: linhas.map(paraApp), paginas };
    }
  }
  return { status: "ok", pedidos: linhas.map(paraApp), paginas, porPagina };
}

/* Um pedido pelo ID — nunca pelo número. Item 7: o número não identifica
   sozinho desde que existem ciclos, e nunca identificou os cinco históricos. */
async function pxPorId(id) {
  const r = await persLer(`pcp_pedido?id=eq.${encodeURIComponent(id)}&select=*`);
  if (!r.ok) return pxResposta(r, "por-id");
  const l = persLista(r.corpo)[0];
  return l ? { status: "ok", pedido: paraApp(l) } : { status: "nao-achei" };
}

/* v8.74 · P6 · vários por id, numa ida só.
   Existe para o carimbo poder perguntar "como estão AGORA os pedidos que eu
   estou tentando gravar?" sem puxar a tabela inteira. A lista é curta por
   natureza: são os pedidos de UMA gravação. */
async function pxPorIds(ids) {
  const lista = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!lista.length) return { status: "ok", pedidos: [] };
  if (lista.length > 200) return { status: "invalido", motivo: "lista longa demais para uma ida só" };
  const filtro = lista.map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(",");
  const r = await persLer(`pcp_pedido?id=in.(${encodeURIComponent(filtro)})&select=*`);
  if (!r.ok) return pxResposta(r, "por-ids");
  return { status: "ok", pedidos: persLista(r.corpo).map(paraApp) };
}

/* Busca histórica por ciclo + número — item 15. Vai pela RPC porque ela olha o
   acervo inteiro, inclusive arquivado, e diz se está arquivado. */
async function pxHistorico(numero, ciclo, sku, limite) {
  const r = await persRpc("pcp_historico_pedidos", {
    p_numero: numero || null, p_ciclo: ciclo == null ? null : Number(ciclo),
    p_sku: sku || null, p_limite: limite || 50 });
  if (!r.ok) return pxResposta(r, "historico");
  return { status: "ok", achados: persLista(r.corpo) };
}

/* ---------------------------------------------------------------------------
   CRIAR · itens 4 e 5.
   `numero` e `duplicidade_historica` são barrados AQUI, antes de sair do
   navegador, além de o servidor barrar. Duas travas de propósito: a do
   servidor é a que vale, a daqui é a que dá uma mensagem que a pessoa entende
   em vez de um `invalido` genérico.
   --------------------------------------------------------------------------- */
async function pxCriar(itens, acaoExistente) {
  const lista = Array.isArray(itens) ? itens : [itens];
  if (!lista.length) return { status: "invalido", motivo: "lista vazia" };
  if (lista.length > 500) return { status: "invalido", motivo: "mais de 500 pedidos numa chamada" };

  const prontos = [];
  const barrados = [];
  for (const item of lista) {
    const { linha, recusados } = paraServidor(item, {
      permitidos: PED_CRIAVEIS, proibidos: PED_PROIBIDOS_NA_CRIACAO });
    for (const c of recusados) if (PED_PROIBIDOS_NA_CRIACAO.includes(c)) barrados.push(c);
    prontos.push(linha);
  }
  if (barrados.includes("numero")) {
    return { status: "invalido", motivo: "numero-nao-se-manda",
      texto: "O número quem dá é o servidor. Se este número veio de fora, ele vai em `extra`." };
  }
  if (barrados.includes("duplicidade_historica")) {
    return { status: "invalido", motivo: "duplicidade-nao-se-manda",
      texto: "Só a migração marca duplicidade histórica, e só para os pares autorizados." };
  }

  const acao = acaoExistente
    || obEnfileirar("pedido_criar", null, { p_pedidos: prontos });
  return pxEnviar(acao);
}

/* ---------------------------------------------------------------------------
   PATCH · itens 8, 9, 10.
   Só os campos que mudaram, com a revisão que a tela viu.
   --------------------------------------------------------------------------- */
async function pxSalvar(id, base, agora, revisao, acaoExistente) {
  const patch = diferenca(base, agora);
  if (!Object.keys(patch).length) return { status: "ok", sem_mudanca: true, campos: [] };

  const acao = acaoExistente || obEnfileirar("pedido_patch", id, {
    p_id: id, p_expected_revision: revisao, p_patch: patch });
  return pxEnviar(acao);
}

async function pxApagar(id, revisao, motivo) {
  return pxEnviar(obEnfileirar("pedido_apagar", id, {
    p_id: id, p_expected_revision: revisao, p_motivo: motivo || null }));
}

async function pxContinuar(id, revisao, item) {
  const { linha } = paraServidor(item || {}, {
    permitidos: PED_CRIAVEIS, proibidos: PED_PROIBIDOS_NA_CRIACAO });
  return pxEnviar(obEnfileirar("pedido_continuar", id, {
    p_id: id, p_expected_revision: revisao, p_dados: linha }));
}

/* Renumerar é um patch de um campo só — e é o caminho que devolve
   `numero-em-uso`, inclusive quando o dono é um pedido APAGADO (o número fica
   reservado para sempre) ou um dos cinco históricos (aí vem `quantos: 2`). */
async function pxRenumerar(id, revisao, numeroNovo) {
  return pxEnviar(obEnfileirar("pedido_patch", id, {
    p_id: id, p_expected_revision: revisao, p_patch: { numero: String(numeroNovo || "").trim() } }));
}

async function pxArquivar(id, revisao, arquivar) {
  return pxEnviar(obEnfileirar("pedido_arquivar", id, {
    p_id: id, p_expected_revision: revisao, p_arquivar: arquivar !== false }));
}

/* Liberar um número reservado é decisão de administradora, e só vale para
   pedido já apagado. */
async function pxLiberarNumero(id, revisao, numeroNovo) {
  return pxEnviar(obEnfileirar("pedido_liberar_numero", id, {
    p_id: id, p_expected_revision: revisao, p_novo_numero: String(numeroNovo || "").trim() }));
}

/* ---------------------------------------------------------------------------
   O ENVIO · o único lugar que fala com a RPC, e o único que mexe na fila.
   O `operation_id` vem da AÇÃO, não daqui: é o que faz o retry ser retry.
   --------------------------------------------------------------------------- */
const PX_RPC = {
  pedido_criar: "pcp_pedido_criar",
  pedido_patch: "pcp_pedido_patch",
  pedido_apagar: "pcp_pedido_apagar",
  pedido_continuar: "pcp_pedido_continuar",
  pedido_arquivar: "pcp_pedido_arquivar",
  pedido_liberar_numero: "pcp_pedido_liberar_numero",
};

async function pxEnviar(acao) {
  const nome = PX_RPC[acao.tipo];
  if (!nome) return { status: "invalido", motivo: "tipo de ação desconhecido: " + acao.tipo };

  obAtualizar(acao.opId, { estado: "enviando", tentativas: (acao.tentativas || 0) + 1 });
  const r = await persRpc(nome, Object.assign({}, acao.dados, { p_operation_id: acao.opId }));
  const res = pxResposta(r, acao.tipo);

  /* Não saiu daqui: a ação FICA na fila, pendente, com o mesmo id. É isso que
     faz "offline → alterar → fechar o navegador → abrir → reconectar" terminar
     com uma gravação só. */
  if (res.status === "offline" || res.status === "sem-login") {
    obAtualizar(acao.opId, { estado: "pendente", ultimoErro: res.status });
    return Object.assign({ acao: acao.opId, naFila: true }, res);
  }
  /* Recusa por VALIDAÇÃO não registra operação no servidor (é uma facilidade
     de propósito do contrato): corrigir e reenviar com o mesmo id funciona. */
  if (res.status === "invalido") {
    obAtualizar(acao.opId, { estado: "parada", ultimoErro: "invalido" });
    return Object.assign({ acao: acao.opId }, res);
  }
  /* Conflito e número-em-uso precisam de gente ou de merge: a ação sai da fila
     automática e volta como intenção nova, com id novo, quando resolvida. */
  if (res.status === "conflito" || res.status === "numero-em-uso"
      || res.status === "apagado" || res.status === "arquivado"
      || res.status === "operacao-reutilizada" || res.status === "sem-permissao") {
    obAtualizar(acao.opId, { estado: "parada", ultimoErro: res.status });
    return Object.assign({ acao: acao.opId }, res);
  }
  /* -------------------------------------------------------------------------
     v8.27 · UMA RECUSA NÃO SOME EM SILÊNCIO.
     Até aqui, qualquer coisa que não estivesse nomeada acima caía no
     `obRemover` de baixo — inclusive o `erro` cru de um HTTP 400. Foi
     exatamente o que aconteceu com o 2304: a criação indevida levou
     "duplicate key value violates unique constraint" com 400, a intenção foi
     APAGADA da fila, e a tela terminou com `pendentes: 0`. A alteração não
     ficou em lugar nenhum e não sobrou rastro para tentar de novo.

     Agora só sai da fila o que o servidor CONFIRMOU: `ok` e `sem_mudanca`.
     Tudo o mais fica `parada`, com o erro e o corpo guardados.
     ------------------------------------------------------------------------- */
  if (res.status !== "ok" && res.status !== "sem_mudanca" && res.status !== "sem-mudanca") {
    obAtualizar(acao.opId, { estado: "parada", ultimoErro: res.status || "erro",
      erroMsg: String(res.msg || res.motivo || "").slice(0, 500),
      erroHttp: r && r.status ? r.status : null });
    return Object.assign({ acao: acao.opId, naFila: true }, res);
  }
  obRemover(acao.opId);
  return Object.assign({ acao: acao.opId }, res);
}

/* Reenvia a fila. Chamada na abertura, ao voltar a rede, e depois de um envio
   que ficou pendente. Sequencial de propósito: duas ações do mesmo pedido em
   paralelo brigariam pela revisão uma da outra. */
/* ---------------------------------------------------------------------------
   v8.74 · P3 · O DRENO TEM DE DEIXAR AS TRÊS MEMÓRIAS EM DIA
   ---------------------------------------------------------------------------
   `pxEnviar` tira a ação da fila no `ok` e mais nada. O caminho normal
   (`telaEnviarIntencoes`) faz três coisas a mais com a resposta: escreve a
   revisão no pedido da tela, regrava a FOTO e anota a revisão como minha para
   o eco do Realtime não voltar como novidade. O dreno não fazia nenhuma.

   Medido: depois do dreno o servidor ficava em N+1 e a aba inteira em N — e a
   alteração seguinte da MESMA pessoa batia em conflito com a gravação que o
   próprio dreno acabara de fazer.

   Isto NÃO mexe na trava: `p_expected_revision` continua saindo de
   `TELA_FOTO`. O que muda é que `TELA_FOTO` passa a dizer a verdade.
   --------------------------------------------------------------------------- */
function pxSincronizarConfirmado(r) {
  const reg = r && (r.registro || (r.criados && r.criados[0]));
  if (!reg || !reg.id) return false;
  let app = null;
  try { app = typeof paraApp === "function" ? paraApp(reg) : null; } catch (e) { app = null; }
  if (!app) return false;
  /* v8.99 · a mesma porta do envio normal: anota como minha e não regride.
     A base do diff continua fora, como na v8.74 — a abertura reconcilia logo
     depois. */
  telaAplicarRegistro(app.id, reg, { minha: true, base: false });
  return true;
}

let PX_DRENANDO = false;
async function pxDrenar() {
  if (PX_DRENANDO) return { status: "ok", jaRodando: true };
  /* v8.99 · a mesma fila não é enviada por dois ao mesmo tempo: se houver uma
     rodada de `telaEnviarIntencoes` em curso, o dreno espera ela terminar —
     ANTES de levantar a própria marca, que é o que a rodada seguinte espera */
  try { if (TELA_ENVIO_EM_CURSO) await TELA_ENVIO_EM_CURSO; } catch (e) {}
  if (PX_DRENANDO) return { status: "ok", jaRodando: true };
  PX_DRENANDO = true;
  const feitas = [], paradas = [], sincronizadas = [];
  try {
    for (const acao of obPendentes()) {
      /* v8.107 · a fila é uma só; os drenos é que são dois. O corte tem RPC,
         flag e dreno próprios (src/corte/outbox.js) — passar por aqui faria
         `pxEnviar` devolver "tipo desconhecido" a cada rodada. */
      if (typeof cxEhCorte === "function" && cxEhCorte(acao.tipo)) continue;
      const r = await pxEnviar(acao);
      if (r.status === "ok") {
        feitas.push(acao.opId);
        if (pxSincronizarConfirmado(r)) sincronizadas.push(acao.entidadeId || null);
      }
      else if (r.status === "offline" || r.status === "sem-login") break;   /* sem rede: para */
      else paradas.push({ opId: acao.opId, status: r.status, resposta: r });
    }
  } finally { PX_DRENANDO = false; }
  return { status: "ok", feitas, paradas, sincronizadas, restam: obPendentes().length };
}

/* Depois de um conflito resolvido, a intenção é OUTRA — id novo, sempre.
   Mandar a intenção nova com o id velho é `operacao-reutilizada`, e é assim
   que o servidor impede que um retry mascare uma mudança de vontade. */
async function pxReenviarResolvido(opId, patchNovo, revisaoNova) {
  const acao = obLer().find((a) => a.opId === opId);
  if (!acao) return { status: "nao-achei", motivo: "esta ação não está mais na fila" };
  const nova = obNovaIntencao(acao, Object.assign({}, acao.dados, {
    p_patch: patchNovo, p_expected_revision: revisaoNova }));
  return pxEnviar(nova);
}
