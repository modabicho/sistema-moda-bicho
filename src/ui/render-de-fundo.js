/* ---------- redesenho de fundo ----------
   O app monta o HTML da tela INTEIRA a cada `render()`, e o que foi digitado mas
   ainda não foi recolhido morre junto. Então nenhum temporizador pode redesenhar
   a tela de quem está no meio de uma digitação — era exatamente isso que fazia a
   tela "piscar e desfazer tudo": caminhos de fundo (a presença a cada 20 s, a
   sincronia a cada 15 s) chamavam `render()` sem perguntar se havia alguém
   escrevendo.

   Agora quem chega de fundo pede o redesenho; ele acontece na hora se a tela
   estiver livre, e espera a pessoa terminar se não estiver. Nada se perde: o
   dado novo já está em `S`, e o primeiro render seguinte o mostra. */
let _renderPendente = false;
function renderDeFundo() {
  if (editando()) { _renderPendente = true; return false; }
  render();
  return true;
}
/* largou o campo (ou fechou a janela): o que ficou esperando entra agora.
   O respiro de 200 ms é para não redesenhar entre um campo e o seguinte. */
if (typeof document !== "undefined") document.addEventListener("focusout", () => {
  setTimeout(() => { if (_renderPendente && !editando()) render(); }, 200);
});
/* ---------------------------------------------------------------------------
   v8.50 · A RELEITURA DE FUNDO NÃO PASSA POR CIMA DE GRAVAÇÃO EM ANDAMENTO
   ---------------------------------------------------------------------------
   `recarregarDoServidor` TROCA `S.produtos`, `S.cad`, `S.equipe`, `S.insumos`,
   `S.cfg`, `S.estoque`, `S.semi` e `S.festivas` pelas cópias do servidor. O
   único freio era `editando()` — modal aberto ou cursor num campo.

   Só que a maior parte do que se faz neste app é CLIQUE, não digitação: mudar
   status, marcar conferido, reordenar, aplicar importação. Nesses casos
   `editando()` é falso, e a sincronia de 15 s podia entrar EXATAMENTE enquanto
   `salvarTudo` estava no ar: trocava o estado pela cópia velha do servidor e a
   gravação seguia gravando o que acabara de reler. A alteração sumia da tela e
   do documento, sem erro, sem conflito e sem rastro — e some de novo só de vez
   em quando, que é o que a torna impossível de reproduzir na frente de alguém.

   Medido: com duas telas gravando a mesma seção, 1 em cada 3 execuções da
   bateria `concorrencia-todas-secoes` perdia o dado de uma das duas, ora numa
   seção ora noutra. Está no app desde antes da v8.44.

   A regra: releitura silenciosa não acontece enquanto houver gravação no ar,
   fila pendente, espelho de documento por escoar ou seção presa só no
   navegador. Ela não é cancelada — é ADIADA para o próximo ciclo de 15 s, e a
   novidade fica anotada para o aviso da tela. Releitura pedida pela pessoa
   (`silencioso` falso) continua acontecendo: aí ela sabe o que está fazendo. */
function relerAtropelaria() {
  try {
    if (_gravando) return "gravação em andamento";
    if (typeof _pendentes !== "undefined" && _pendentes.size) return "fila de gravação com " + _pendentes.size;
    if (typeof espelhoDocPendente === "function" && espelhoDocPendente().length) return "espelho de documento por escoar";
    if (typeof secoesSoLocais === "function" && secoesSoLocais().length) return "seção presa só neste navegador";
  } catch (e) { return null; }
  return null;
}

async function recarregarDoServidor(silencioso) {
  /* a releitura TROCA S.pedidos e S.ops por listas novas. Se houver uma janela
     aberta, ela está segurando o objeto antigo — e o que a pessoa digitou lá
     iria para um registro que não existe mais. Entre a checagem lá de cima e
     esta linha existe uma ida ao servidor: é tempo de sobra para alguém começar
     a escrever, então a pergunta se refaz aqui, imediatamente antes de trocar. */
  if (silencioso && editando()) { S.novidade = S.novidade || { em: new Date().toISOString() }; _renderPendente = true; return false; }
  const atropela = silencioso && relerAtropelaria();
  if (atropela) {
    S.novidade = S.novidade || { em: new Date().toISOString() };
    _renderPendente = true;
    return false;
  }
  try {
    /* Faltavam `insumos` e `cfg`: o app dava a gravação da outra pessoa por vista
       sem ter relido essas duas, e a gravação seguinte desta aba escrevia o
       estoque de insumo de horas atrás por cima do trabalho dela — sem conflito,
       sem aviso. A regra é simples: relê-se tudo o que se grava. */
    const [nuc, prod, est, cad, eq, ins, cfgNovo, fest, smi] = await Promise.all([
      lerDoc(DOCS.nucleo), lerDoc(DOCS.produtos), lerDoc(DOCS.estoque), lerDoc(DOCS.cad), lerDoc(DOCS.equipe),
      lerDoc(DOCS.insumos), lerDoc(DOCS.cfg), lerDoc(DOCS.festivas), lerDoc(DOCS.semi)]);
    /* v8.22 · trocar S.pedidos deixa a janela aberta apontando para um objeto
       que saiu da lista. O que for gravado nele some sem erro e sem rastro.
       `reancorarJanelaNoPedido()` religa a janela ao objeto novo de mesmo id,
       logo depois da troca — antes de qualquer render. */
    if (nuc) { S.ops = nuc.ops || S.ops; S.pedidos = nuc.pedidos || S.pedidos;
      S.analises = nuc.analises || S.analises; S.faltas = nuc.faltas || S.faltas;
      if (Array.isArray(nuc.eventos) && nuc.eventos.length) S.eventos = nuc.eventos;
      if (typeof reancorarJanelaNoPedido === "function") reancorarJanelaNoPedido(); }
    if (ins) {
      S.insumos = ins.insumos || []; S.movInsumo = ins.movs || []; S.entradas = ins.entradas || [];
      S.posse = ins.posse || []; S.bens = ins.bens || []; S.posseItens = ins.posseItens || [];
      esquecerSaldos(); esquecerReservas();
    }
    if (cfgNovo) S.cfg = { ...CFG_PADRAO, ...cfgNovo, padroes: { ...CFG_PADRAO.padroes, ...(cfgNovo.padroes || {}) } };
    if (Array.isArray(prod)) S.produtos = prod;
    if (est) S.estoque = est;
    if (cad) S.cad = { ...S.cad, ...cad };
    if (Array.isArray(eq)) S.equipe = eq;
    /* relê-se tudo o que se grava: sem esta linha, a próxima gravação daqui
       passaria por cima do que outra pessoa acabou de fazer nas campanhas */
    if (fest) S.festivas = { campanhas: fest.campanhas || [] };
    if (smi) { S.semiTipos = smi.tipos || []; S.remessas = smi.remessas || []; S.semiAjustes = smi.ajustes || []; }
    /* v8.28 · o documento sozinho não é mais a lista de pedidos: um pedido
       criado agora está na TABELA e ainda não no documento. Sem esta linha ele
       sumia da tela ao recarregar, embora estivesse gravado. */
    if (typeof telaReconciliarPedidos === "function"
        && typeof telaLeDaTabela === "function"
        && (telaLeDaTabela() || telaEscreveNaTabela())) {
      try { await telaReconciliarPedidos(); } catch (e4) { console.error("reconciliação:", e4); }
    }
    /* v8.74 · P7 · o mesmo para as NECESSIDADES. Esta linha, logo acima, acaba
       de trocar `S.ops` pelo que o DOCUMENTO tem — e a foto da Demanda é a
       TABELA. Sem reconciliar aqui, cada sincronia recriava o desencontro que
       fazia nascer "Tirar N necessidades da operação" na gravação seguinte. */
    if (typeof demReconciliar === "function" && typeof demEscreveNaTabela === "function"
        && (demEscreveNaTabela() || (typeof demLeDaTabela === "function" && demLeDaTabela()))) {
      try { await demReconciliar(); } catch (e5) { console.error("reconciliação da demanda:", e5); }
    }
    S.carimboVisto = new Date().toISOString();
    S.novidade = null;
    S.calc = null;
    render();
    if (!silencioso) toast("Tela atualizada com o que as outras pessoas gravaram.");
    return true;
  } catch { toast("Não consegui atualizar agora — verifique a internet.", "erro"); return false; }
}
/* A presença não depende do servidor: na camada local ela responde pelas ABAS
   deste navegador, que é justamente o caso que mais confunde ("por que a tela
   ficou recarregando sozinha?"). Por isso tem relógio próprio, e não fica
   pendurada na sincronia entre pessoas. */
let _presencaTimer = null;
function ligarPresenca() {
  if (!temJanelaReal || _presencaTimer) return;
  baterPonto(true);
  _presencaTimer = setInterval(() => {
    if (document.hidden) return;   /* aba escondida não ocupa lugar nem gasta ida */
    if (Date.now() - _presencaEm >= PRESENCA_BATIDA) baterPonto(); else lerPresenca();
  }, 20000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) baterPonto(true); });
}

function ligarSincronia() {
  if (!temJanelaReal || !SUPA_URL || _sincTimer) return;
  let voltas = 0;
  _sincTimer = setInterval(async () => {
    if (document.hidden) return;               /* aba em segundo plano não gasta requisição */
    if (!supaSessao()?.access) return;
    if (++voltas % 4 === 0 && !S.versaoNova) await conferirVersao();  /* versão: 1× por minuto basta */
    /* ---------- reenviar sozinha o que ficou presa aqui ----------
       Antes este ciclo só LIA o servidor. Se ele caísse e voltasse, o que foi
       feito durante a queda ficava no navegador para sempre — até alguém, sem
       saber de nada, salvar outra coisa. Agora, achando o servidor de pé e
       havendo seção presa, ela sobe sozinha. */
    if (secoesSoLocais().length && !_gravando) {
      try {
        const antes = CAMADA;
        await sondarCamada();
        if (CAMADA === "supabase") {
          const presas = secoesSoLocais();
          const subiu = await salvarTudo(...presas);
          if (subiu && !secoesSoLocais().length) {
            toast(`Servidor de volta — ${presas.length === 1 ? "a alteração que estava" : "as alterações que estavam"} só neste computador ${presas.length === 1 ? "subiu" : "subiram"}.`);
          }
        } else { CAMADA = antes || CAMADA; }
      } catch (e) { console.error("reenvio", e); }
    }
    try {
      const car = await carimboAtual();
      if (!car || car.sessao === SESSAO_APP) return;
      if (!S.carimboVisto || String(car.em) <= String(S.carimboVisto)) return;
      /* este era o pior dos três: o `editando()` existe justamente para NÃO
         mexer na tela de quem está escrevendo, e logo em seguida vinha um
         `render()` que apagava tudo. Agora só anota a novidade. */
      if (editando() || relerAtropelaria()) { S.novidade = { por: car.por, em: car.em }; _renderPendente = true; return; }
      /* e a pergunta se refaz DENTRO de `recarregarDoServidor`, logo antes de
         trocar o estado: entre esta linha e aquela há uma ida ao servidor. */
      if (!(await recarregarDoServidor(true))) return;
      toast(`${car.por || "Outra pessoa"} gravou alterações — a tela foi atualizada.`);
      _falhasSinc = 0;
    } catch (e) {
      /* silêncio aqui é perigoso de um jeito específico: a pessoa acha que está
         vendo o que as outras gravaram, e não está. Uma falha isolada é
         internet oscilando; três seguidas é a tela ficando velha sem avisar. */
      console.error("sincronia", e); sentryAvisar(e, "sincronia periódica");
      if (++_falhasSinc === 3) toast("Não estou conseguindo conferir o servidor há alguns minutos — a tela pode estar desatualizada. Recarregue a página quando puder.", "erro");
    }
  }, 15000);
  /* voltar para a aba é o momento mais provável de estar desatualizado */
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !editando()) S.novidade && render(); });
}

/* ---------- caches de leitura ----------
   A tela é remontada inteira a cada clique, e o contador da Conferência
   recalculava os 1.295 pedidos junto — meio segundo de travamento por clique,
   em QUALQUER aba. Estes caches só vencem quando os dados mudam. */
let _rev = 0;
const mudouDados = () => { _rev++; };
let _cacheIrmaos = { rev: -1, mapa: null };
function indiceIrmaos() {
  if (_cacheIrmaos.rev === _rev && _cacheIrmaos.mapa) return _cacheIrmaos.mapa;
  const mapa = new Map();
  for (const r of S.pedidos) {
    const raiz = RAIZ_PEDIDO(r.numero);
    const l = mapa.get(raiz); if (l) l.push(r); else mapa.set(raiz, [r]);
  }
  _cacheIrmaos = { rev: _rev, mapa };
  return mapa;
}
let _cacheErrosConf = { rev: -1, n: 0 };
function errosConferencia() {
  if (_cacheErrosConf.rev === _rev) return _cacheErrosConf.n;
  let n = 0;
  for (const r of S.pedidos) if (r.status === "retornada" && conferenciaDe(r).erro) n++;
  _cacheErrosConf = { rev: _rev, n };
  return n;
}

/* ---------- as duas seções que o boot não carrega ----------
   `eventos` (a trilha de auditoria) e `hist` (as fotografias de estoque+vendas)
   somam mais de meio megabyte e só a aba Histórico as mostra — por isso o boot
   as deixa de fora, e isso está certo.

   O erro estava do outro lado: `dumpSecao` grava o array DA MEMÓRIA por cima do
   documento inteiro. Como a memória começava vazia, a primeira ação do dia
   apagava os 3.000 movimentos assinados, e a primeira importação de CSV apagava
   as 18 fotografias. Ninguém percebia, porque quem abre Histórico raramente é a
   mesma pessoa que acabou de mexer num pedido.

   A regra agora: ANTES de gravar uma dessas, busca o que está lá e junta. E se
   o documento existe mas não pôde ser lido, recusa a gravação — sobrescrever o
   que não se conseguiu ler é a forma mais cara de perder dado. */
let _eventosPuxados = false, _histPuxado = false;
async function puxarAntesDeGravar(sec) {
  /* v8.29 · ISTO VALE EM TODA GRAVAÇÃO, não uma vez por sessão.
     Antes, `_eventosPuxados` ficava verdadeiro depois da primeira gravação e o
     app nunca mais buscava. Tudo o que outra pessoa registrasse dali em diante
     virava colisão na gravação seguinte — e colisão de `eventos` virava a
     janela "Outra pessoa gravou primeiro". Numa fábrica com várias pessoas no
     app isso acontece o dia inteiro. A leitura é pequena, e é ela que faz o
     conflito não existir em vez de ser resolvido depois. */
  if (sec === "eventos") {
    const bruto = await getBruto(DOCS.eventos);
    const ev = bruto == null ? [] : await lerDoc(DOCS.eventos);
    if (bruto != null && ev == null) throw new Error("não consegui ler o histórico de movimentos — não vou gravar por cima dele");
    if (Array.isArray(ev) && ev.length) {
      const r = fundirEventos(S.eventos, ev);
      if (r.conflitos.length) {
        /* mesmo id com conteúdo diferente não é escolhido em silêncio */
        const err = new Error("há movimentos com o mesmo id e conteúdo diferente — não vou escolher por você");
        err.conflitoDeDados = r.conflitos.map((c) => ({ sec: "eventos", lista: "(movimento)",
          chave: c.id, meu: c.meu && c.meu.tipo, dele: c.dele && c.dele.tipo }));
        throw err;
      }
      S.eventos = r.lista;          /* união primeiro, corte depois */
    }
    _eventosPuxados = true;         /* só como sinal de que já houve uma união */
  }
  /* `hist` tem a mesma correção, com uma exceção que já existia: quem acabou de
     IMPORTAR um arquivo trouxe a série inteira de propósito, e juntar com a do
     servidor desfaria a importação. `dados/importar.js` marca `_histPuxado`
     nesse caso, e só nesse caso ele pula. */
  if (sec === "hist" && !_histPuxado) {
    const bruto = await getBruto(DOCS.hist);
    const hs = bruto == null ? null : await lerDoc(DOCS.hist);
    if (bruto != null && hs == null) throw new Error("não consegui ler a série histórica — não vou gravar por cima dela");
    const guardada = hs?.serie || [];
    if (guardada.length) {
      const r = fundirSerie(S.hist?.serie || [], guardada);
      if (r.conflitos.length) {
        const err = new Error("há pontos da série com o mesmo instante e conteúdo diferente");
        err.conflitoDeDados = r.conflitos.map((c) => ({ sec: "hist", lista: "série",
          chave: c.chave || c.dia }));
        throw err;
      }
      S.hist = { ...(hs || {}), serie: r.lista };
    }
  }
}

/* Grava a seção sem passar por cima de ninguém. Se o servidor recusar porque
   outra pessoa gravou primeiro:
     1. relê o que está lá;
     2. tenta FUNDIR por registro (listas com id e carimbo);
     3. se fundiu, grava de novo — agora a partir da versão nova;
     4. se não dá para fundir com honestidade, para e devolve o conflito para a
        pessoa decidir. Nunca escolhe sozinho quando pode perder trabalho. */
async function gravarSecaoSemAtropelar(sec) {
  const chave = DOCS[sec];
  /* D · A SENTINELA DA LISTA VAZIA. Ver o porquê em `persistencia/tela.js`.
     Antes de recusar, tenta trazer a lista de volta da TABELA — quem manda nos
     pedidos com a camada ligada é ela, e o documento é cópia. Se a lista
     voltar, a gravação segue com o conteúdo certo em vez de morrer; se não
     voltar, a gravação PARA e o aviso crítico do topo diz o que aconteceu. */
  if (sec === "nucleo" && typeof nucleoConferirPedidos === "function") {
    let v = nucleoConferirPedidos();
    if (!v.ok && typeof telaReconciliarPedidos === "function") {
      try { await telaReconciliarPedidos(); } catch (e) { console.error("sentinela · reconciliação:", e); }
      v = nucleoConferirPedidos();
      if (v.ok) { try { S.calc = null; render(); } catch {} }
    }
    if (!v.ok) {
      const err = new Error("não gravei: a tela está sem pedidos e o servidor tem "
        + v.noServidor + ". Atualize os dados antes de salvar — nada foi apagado no servidor.");
      err.listaDePedidosVazia = v.noServidor;
      throw err;
    }
  }
  for (let tent = 0; tent < 3; tent++) {
    try {
      await gravarDoc(chave, dumpSecao(sec), true);
      /* a dispensa de fundir `hist` valia para ESTA gravação, não para a sessão
         inteira: a próxima volta a reler e juntar */
      if (sec === "hist") _histPuxado = false;
      /* Gravou — mas ONDE? Se caiu para o navegador, esta seção passa a ser a
         única cópia boa, e é isso que precisa ficar anotado: para reenviar
         depois, para a leitura não trocá-la pela do servidor, e para o aviso
         saber quando pode sumir. */
      if (podeServidor() && CAMADA !== "supabase") marcarSoLocal(sec);
      else if (CAMADA === "supabase") {
        limparSoLocal(sec);
        /* o aviso só cai quando NÃO SOBRA nada preso aqui */
        if (!secoesSoLocais().length) { try { S.servidorCaiu = null; } catch {} }
      }
      return true;
    } catch (e) {
      if (!e || !e.conflito || tent === 2) throw e;
      /* releitura obrigatória: é ela que atualiza _versaoDoc para a marca nova */
      let doServidor = await lerDoc(chave);
      /* v8.28 · ILEGÍVEL AGORA NÃO É CONFLITO DE CONTEÚDO.
         O documento é gravado em pedaços. Quem lê no meio da gravação de outra
         pessoa pega a mestra nova com um pedaço ainda velho, e `lerDoc` devolve
         null de propósito — para não montar um documento Frankenstein. Isso
         dura milissegundos. Transformar essa corrida numa pergunta
         irreversível ("qual das duas versões apagar?") foi o que apareceu para
         a Jéssica ao criar um pedido. Espera e relê: nunca grava por cima do
         que não conseguiu ler. */
      /* três tentativas curtas: um documento pela metade se resolve em dezenas
         de milissegundos, e esperar mais só atrasaria o envio da intenção, que
         sai no `finally` de `salvarTudo`. */
      for (let r = 0; r < 3 && !doServidor; r++) {
        await new Promise((s2) => setTimeout(s2, 120 * (r + 1)));
        doServidor = await lerDoc(chave);
      }
      /* v8.30 · toda seção TEM estratégia declarada em `SECOES`. `fundirSecao`
         só devolve vazio se a seção não estiver no registro — e a bateria
         proíbe isso. Quando existe dado realmente em briga, ela LANÇA com o
         dado nomeado: é esse dado que a pessoa vê, nunca "a seção inteira". */
      const fundido = fundirSecao(sec, doServidor);
      if (!fundido) {
        const err = new Error("a seção `" + sec + "` não tem estratégia de concorrência declarada");
        err.semEstrategia = sec;
        throw err;
      }
      aplicarSecao(sec, fundido.junto);
      _conflitosFundidos.push({ sec, ...fundido.resumo, em: new Date().toISOString() });
    }
  }
  return false;
}
const _conflitosFundidos = [];

/* ---------- o contrato de salvarTudo ----------
   `await salvarTudo(...)` agora responde à única pergunta que interessa a quem
   chama: **gravou?** `true` quando a fila esvaziou e o servidor confirmou,
   `false` quando não.

   Antes devolvia `undefined` em todos os caminhos, e havia dois furos piores
   que o silêncio:

   1. `if (_gravando) return;` — com uma gravação já em andamento, esta função
      voltava NA HORA sem gravar. O `await` de quem chamou resolvia antes de o
      dado sair, e a linha seguinte anunciava "pronto". Agora ela ESPERA a
      gravação em curso e devolve o resultado real dela.
   2. seção adicionada depois de o `while` esvaziar, mas antes de a execução
      terminar, não era drenada por ninguém — ficava parada até alguém salvar
      outra coisa. O laço de fora recomeça enquanto sobrar pendência.

   Por que não `throw`, que seria o mais elegante: nesta base há 17 chamadas sem
   `await` (virariam unhandled rejection) e o despacho de clique tem um catch
   que mostra "Erro no clique — tire um print e me mande". A pessoa veria três
   mensagens para um problema só. Devolver booleano não quebra nenhuma das 93
   chamadas existentes e deixa cada operação decidir. */
let _gravandoPromessa = null;

/* ---------------------------------------------------------------------------
   v8.26 · a casca que garante a intenção
   ---------------------------------------------------------------------------
   O miolo é o `salvarTudo` de sempre, com as quatro saídas dele intactas —
   retorno antecipado por `_gravando`, conflito de seção, falha de gravação, e o
   fim normal. Nenhuma foi mexida.

   O que mudou é o que está em volta:
     ANTES  · a intenção da pessoa é registrada na outbox, que vive no
              localStorage. Depois disto, nenhum `return` a apaga.
     DEPOIS · num `finally`, que roda em TODAS as saídas, a fila é enviada.
              Se o envio falhar, a intenção FICA — e sai na próxima gravação,
              na abertura do app, ou quando a rede voltar.

   Registrar não é gravar: `PCP_ENSAIO_ULTIMO` só diz "ok" com a confirmação do
   servidor na mão.
   --------------------------------------------------------------------------- */
async function salvarTudo(...secoes) {
  let intencoes = [];
  try {
    if (typeof telaRegistrarIntencoes === "function") intencoes = telaRegistrarIntencoes(secoes) || [];
  } catch (e) { console.error("intenção não registrada:", e); sentryAvisar(e, "telaRegistrarIntencoes"); }
  /* v8.33 · a Demanda registra as dela no MESMO lugar e da MESMA forma. Com
     `demanda_linha_escrita` desligada isto devolve lista vazia na primeira
     linha — o comportamento de hoje não muda em nada. */
  try {
    if (typeof demRegistrarIntencoes === "function") demRegistrarIntencoes(secoes);
  } catch (e) { console.error("intenção da demanda não registrada:", e); sentryAvisar(e, "demRegistrarIntencoes"); }
  /* v8.37 · os CADASTROS entram no mesmo lugar e da mesma forma. Com a flag do
     cadastro desligada isto devolve lista vazia na primeira linha. */
  try {
    if (typeof cadRegistrarIntencoes === "function") cadRegistrarIntencoes(secoes);
  } catch (e) { console.error("intenção de cadastro não registrada:", e); sentryAvisar(e, "cadRegistrarIntencoes"); }
  try {
    return await salvarTudoMiolo(...secoes);
  } finally {
    try {
      if (typeof telaEnviarIntencoes === "function") await telaEnviarIntencoes();
    } catch (e) { console.error("envio da intenção falhou:", e); sentryAvisar(e, "telaEnviarIntencoes"); }
    /* v8.31 · ESPELHO DA DEMANDA. Não grava nada e não decide nada: compara o
       que a camada nova mandaria com o que o documento acabou de gravar, e
       anota a diferença. Com as flags desligadas é só isso que ele faz — e é
       o passo que faltou antes de eu ligar a escrita de Pedidos. */
    /* v8.33 · e envia as da Demanda, aqui, no mesmo `finally`. Quando a flag
       está desligada a fila está vazia e isto não faz nada. */
    try {
      if (typeof demEnviarIntencoes === "function") await demEnviarIntencoes();
    } catch (e) { console.error("envio da demanda falhou:", e); sentryAvisar(e, "demEnviarIntencoes"); }
    try {
      if (typeof cadEnviarIntencoes === "function") await cadEnviarIntencoes();
    } catch (e) { console.error("envio de cadastro falhou:", e); sentryAvisar(e, "cadEnviarIntencoes"); }
    /* v8.50 · cfg e a trilha entram no MESMO lugar e da mesma forma. Com as
       flags desligadas as duas devolvem `desligado` na primeira linha. */
    try {
      if (typeof cfgEnviarMudancas === "function") await cfgEnviarMudancas();
    } catch (e) { console.error("envio da configuração falhou:", e); sentryAvisar(e, "cfgEnviarMudancas"); }
    try {
      if (typeof evEnviar === "function") await evEnviar();
    } catch (e) { console.error("envio da trilha falhou:", e); sentryAvisar(e, "evEnviar"); }
    try {
      if (typeof insEnviarIntencoes === "function") await insEnviarIntencoes();
    } catch (e) { console.error("envio de insumos falhou:", e); sentryAvisar(e, "insEnviarIntencoes"); }
    try {
      if (typeof semEnviarIntencoes === "function") await semEnviarIntencoes();
    } catch (e) { console.error("envio de semiacabados falhou:", e); sentryAvisar(e, "semEnviarIntencoes"); }
    /* ---------------------------------------------------------------------
       OS ESPELHOS NÃO SEGURAM MAIS A UI
       ---------------------------------------------------------------------
       Espelho é OBSERVAÇÃO: ele compara o que a camada nova mandaria com o que
       o documento gravou, e anota. Nada do que ele faz é preciso para a
       gravação estar correta — nem revisão, nem auditoria, nem idempotência,
       nem conflito passam por aqui.

       Medido no binário de produção, com 3.123 produtos: com os espelhos
       dentro do `await`, salvar um pedido levava 483 ms, dos quais 287 eram o
       espelho dos cadastros; salvar um produto levava 909 ms. O trabalho
       continua acontecendo — só deixou de ficar entre a pessoa e o "salvo".

       `PCP_ESPELHOS` é a promessa deles, para quem PRECISA esperar (a bateria,
       o diagnóstico) poder esperar sem que a tela espere. */
    PCP_ESPELHOS = Promise.allSettled([
      (async () => { if (typeof escoarEspelhoDoc === "function") return escoarEspelhoDoc(); })()
        .catch((err) => { console.error("espelho do documento:", err); }),
      (async () => { if (typeof demEspelhar === "function") return demEspelhar(secoes); })()
        .catch((e) => { console.error("espelho da demanda:", e); }),
      (async () => { if (typeof cadEspelhar === "function") return cadEspelhar(secoes); })()
        .catch((e) => { console.error("espelho dos cadastros:", e); }),
    ]);
  }
}
/* a promessa dos espelhos da última gravação — quem precisa conferir, espera nela */
var PCP_ESPELHOS = Promise.resolve([]);

/* ---------------------------------------------------------------------------
   UMA SEÇÃO É "SÓ ESPELHO" QUANDO A TABELA JÁ É A FONTE DELA
   ---------------------------------------------------------------------------
   Três condições, todas medidas no registro do motor — nada de lista de nomes
   escrita à mão:
     · existe um cadastro cujo `doc_chave` é ESTA seção;
     · ele é a seção INTEIRA (`doc_lista` nulo) — se a seção tiver qualquer
       outra coisa dentro, o documento continua sendo fonte de alguma coisa;
     · leitura E escrita dele estão ligadas.
   Hoje isso vale só para `produtos`. `cad` não entra (tem `pendentesSku`,
   `mesesFechados` e outros que não são cadastro), e `nucleo` também não.
   --------------------------------------------------------------------------- */
const _espelhoDoc = new Set();
let _espelhoDocRodando = false;
function secaoSoEspelho(sec) {
  if (typeof cadNomes !== "function" || typeof cadTipo !== "function") return false;
  if (typeof cadLeDaTabela !== "function" || typeof cadEscreveNaTabela !== "function") return false;
  const chave = "pcp5:" + sec;
  const donos = cadNomes().filter((n) => { const t = cadTipo(n); return t && t.doc_chave === chave; });
  if (!donos.length) return false;
  return donos.every((n) => { const t = cadTipo(n);
    return !t.doc_lista && cadLeDaTabela(n) && cadEscreveNaTabela(n); });
}
/* Escreve os espelhos atrasados, FORA do caminho crítico. O que falhar fica na
   fila e é tentado de novo na gravação seguinte — e, se ninguém gravar mais,
   a próxima abertura relê da tabela e regrava o documento. */
async function escoarEspelhoDoc() {
  if (_espelhoDocRodando || !_espelhoDoc.size) return { escoou: [], presos: [..._espelhoDoc] };
  _espelhoDocRodando = true;
  const escoou = [];
  try {
    for (const sec of [..._espelhoDoc]) {
      try { await gravarSecaoSemAtropelar(sec); _espelhoDoc.delete(sec); escoou.push(sec); }
      catch (e) { console.error("espelho do documento (" + sec + "):", e); }
    }
  } finally { _espelhoDocRodando = false; }
  return { escoou, presos: [..._espelhoDoc] };
}
function espelhoDocPendente() { return [..._espelhoDoc]; }

async function salvarTudoMiolo(...secoes) {
  mudouDados();

  (secoes.length ? secoes : ["nucleo"]).forEach((x) => _pendentes.add(x));
  /* já tem alguém gravando: a fila é compartilhada, então o certo é ESPERAR o
     resultado dela em vez de mentir que acabou */
  if (_gravando) return _gravandoPromessa ? _gravandoPromessa.then(() => _pendentes.size === 0 && SALVO.ok !== false) : false;
  _gravando = true;
  let ok = false;
  _gravandoPromessa = (async () => {
  try {
    repintarSalvo();
    /* enquanto chegar pendência nova, continua: o `while` de dentro esvazia a
       fila, o de fora pega o que entrou durante a gravação */
    do {
      while (_pendentes.size) {
        const sec = _pendentes.values().next().value;
        await puxarAntesDeGravar(sec);
        /* SEÇÃO QUE JÁ É ESPELHO não segura a gravação. Depois do cutover de um
           cadastro de topo (Produtos), quem manda é a tabela — com revisão,
           auditoria e idempotência — e o documento passou a ser cópia de
           conferência. Reescrever 1,8 MB em 9 pedaços ANTES de dizer "salvo"
           é fazer a pessoa esperar o espelho, não o registro.
           Medido: 517 ms dos 584 de salvar um produto.
           Ele continua sendo escrito, logo em seguida, e o que não for escrito
           volta para a fila. */
        if (secaoSoEspelho(sec)) { _espelhoDoc.add(sec); _pendentes.delete(sec); continue; }
        /* só sai da fila DEPOIS de gravar: se falhar, continua pendente e o
           "Tentar de novo" sabe exatamente o que ainda falta */
        await gravarSecaoSemAtropelar(sec);
        _pendentes.delete(sec);
      }
      await conferirConflito();
    } while (_pendentes.size);
    marcarSalvo(true);
    ok = true;
    if (_conflitosFundidos.length) {
      const t2 = _conflitosFundidos.splice(0).reduce((a, x) => ({ ganhei: a.ganhei + x.ganhei, perdi: a.perdi + x.perdi, novos: a.novos + x.novos }), { ganhei: 0, perdi: 0, novos: 0 });
      render();
      toastPasso("Outra pessoa gravou junto com você — nada foi perdido",
        `as duas versões foram juntadas registro a registro`,
        t2.perdi ? `${n0(t2.perdi)} ${t2.perdi === 1 ? "registro ficou" : "registros ficaram"} com a versão dela, por ser mais recente — confira na tela`
          : "o que você mexeu continua seu");
    }
  } catch (e) {
    console.error(e);
    /* v8.88 · aviso PARALELO ao tratamento que já existe logo abaixo: conflito
       de dado e seção sem regra continuam abrindo a janela de sempre. O que
       muda é que a gente passa a saber que aconteceu, em qual versão e em qual
       tela, sem depender de print. */
    sentryAvisar(e, "salvarTudoMiolo", { conflitoDeDados: !!(e && e.conflitoDeDados),
      semEstrategia: (e && e.semEstrategia) || null });
    if (e && e.conflitoDeDados) {
      /* v8.30 · NÃO existe mais janela de "seção inteira", nem botão que grava
         por cima. O que chega aqui é o dado exato em briga — uma opção, um
         cadastro, um registro — e a pessoa resolve UM A UM, vendo os dois
         valores. Tudo o que dava para juntar já foi juntado antes. */
      marcarSalvo(false, "um dado ficou em conflito — escolha qual vale");
      S.modal = { tipo: "conflitoDados", itens: e.conflitoDeDados,
        sec: e.conflitoDeDados[0] && e.conflitoDeDados[0].sec };
      render();
      return;
    }
    if (e && e.semEstrategia) {
      /* rede de segurança: seção criada sem regra faz o app PARAR e dizer o
         nome dela — nunca gravar por cima no escuro. */
      marcarSalvo(false, "a seção " + e.semEstrategia + " não tem regra de concorrência");
      render();
      return;
    }
    marcarSalvo(false, String(e?.message || e).slice(0, 160));
    /* Não sai toast daqui. Falha de gravação é problema que CONTINUA
       existindo, e para isso existe o aviso crítico no topo (8.12) — que não
       some sozinho e traz "Tentar salvar de novo" e "Baixar backup". Um toast
       de 6 segundos ao lado dele seria a segunda mensagem para o mesmo
       problema, que é justamente o que a regra de avisos proíbe.
       Quem avisa o que exatamente não gravou é a operação, logo abaixo. */
    marcarFalhaAgora();
  } finally { _gravando = false; repintarSalvo(); }
  })();
  try { await _gravandoPromessa; } finally { _gravandoPromessa = null; }

  return ok;
}
const salvarCompleto = () => salvarTudo("nucleo", "produtos", "estoque", "cad", "cfg", "equipe", "insumos", "festivas", "semi");

