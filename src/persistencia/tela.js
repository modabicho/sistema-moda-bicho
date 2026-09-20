/* ===========================================================================
   src/persistencia/tela.js · A PONTE ENTRE A TELA DE PEDIDOS E A CAMADA NOVA
   ---------------------------------------------------------------------------
   v8.19. A tela continua a mesma: ela mexe nos objetos de `S.pedidos` e chama
   `salvarPedidos()`, como sempre fez. O que muda é para onde isso vai.

   COMO O CAMINHO É ESCOLHIDO — e por que NÃO é uma das três flags:
   as flags `pedidos_linha_leitura`, `pedidos_linha_escrita` e
   `identidade_por_uid` são do SERVIDOR e valem para a equipe inteira. Ligar
   qualquer uma delas para ensaiar seria mudar o comportamento de todo mundo, e
   a Ana foi explícita: elas ficam desligadas. Então o ensaio é uma chave
   LOCAL, deste navegador, ligada pelo endereço (`?ensaio=1`). Ela não existe no
   servidor, ninguém mais a enxerga, e ela não sobrevive a trocar de máquina.

   A TRAVA QUE IMPEDE ESTRAGO: os 1.593 pedidos migrados estão em `pcp_pedido`
   agora. Um ensaio que os alterasse quebraria a validação da migração. Por
   isso, no modo ensaio:
     · todo pedido criado nasce com `extra.ensaio = true`;
     · alterar, apagar, continuar ou renumerar SÓ acontece em pedido marcado
       assim — qualquer outro é recusado aqui, antes de sair do navegador.
   =========================================================================== */

const TELA_CHAVE_ENSAIO = "pcp5:ensaio";

/* ---------------------------------------------------------------------------
   AS FLAGS DO SERVIDOR · o interruptor do cutover
   ---------------------------------------------------------------------------
   Até aqui o caminho novo só ligava por `?ensaio=1`, local. O cutover é
   diferente: ele vale para a equipe inteira, e por isso quem manda são as duas
   flags que já existem na tabela `pcp_flag`.

     pedidos_linha_leitura → a tela LÊ de pcp_pedido_operacional
     pedidos_linha_escrita → a tela GRAVA pelas RPCs

   São separadas de propósito, e a ordem importa: dá para ler da fonte nova sem
   escrever nela, olhar por um tempo, e desligar sem ter mudado nada. Desligar
   volta ao documento na hora — não existe migração de volta a fazer, porque o
   documento nunca deixou de ser gravado.

   O valor é lido do servidor e guardado em memória. Não é adivinhado, não tem
   padrão "ligado", e falha para o lado seguro: se a leitura não vier, as duas
   respondem desligadas e a tela continua no caminho antigo.
   --------------------------------------------------------------------------- */
let TELA_FLAGS = null;
async function telaFlagsCarregar() {
  const r = await persLer("pcp_flag?select=nome,ligada");
  if (!r.ok) { TELA_FLAGS = null; return { status: "nao-consegui", erro: r.erro }; }
  const m = {};
  for (const f of persLista(r.corpo)) m[f.nome] = !!f.ligada;
  TELA_FLAGS = m;
  return { status: "ok", flags: m };
}
const telaFlag = (nome) => !!(TELA_FLAGS && TELA_FLAGS[nome]);

/* O ensaio local continua valendo para a cópia de teste; as flags valem para
   todo mundo. Qualquer um dos dois liga o caminho novo. */
function telaLeDaTabela()     { return telaEnsaioLigado() || telaFlag("pedidos_linha_leitura"); }
function telaEscreveNaTabela(){ return telaEnsaioLigado() || telaFlag("pedidos_linha_escrita"); }

/* A trava do `extra.ensaio` existe para o ENSAIO não estragar os pedidos
   migrados. Depois do cutover ela não pode valer: aí a tela é a dona da tabela
   e precisa alterar qualquer pedido. Por isso ela é consultada só quando o
   caminho novo veio do ensaio, e não da flag. */
const telaTravaDoEnsaio = () => telaEnsaioLigado() && !telaFlag("pedidos_linha_escrita");

function telaEnsaioLigado() {
  try {
    if (typeof window === "undefined") return false;
    if (/[?&]ensaio=1(&|$)/.test(window.location.search || "")) return true;
    return localStorage.getItem(TELA_CHAVE_ENSAIO) === "1";
  } catch { return false; }
}
function telaEnsaioLigar(v) {
  try { v ? localStorage.setItem(TELA_CHAVE_ENSAIO, "1") : localStorage.removeItem(TELA_CHAVE_ENSAIO); } catch {}
}

/* A foto do que o servidor tem: id → { linha, revision }. É contra ela que o
   diff é feito, e é ela que diz se um pedido é do ensaio. */
const TELA_FOTO = new Map();
function telaGuardar(pedido) {
  if (!pedido || !pedido.id) return;
  const antes = TELA_FOTO.get(pedido.id);
  /* A marca de ensaio, uma vez conhecida, NÃO se perde ao regravar a foto a
     partir do objeto da tela — que não carrega `extra`. Sem isto, renumerar um
     pedido do ensaio o transformava em "pedido de verdade" na foto seguinte, e
     a ação seguinte era recusada pela própria trava. Foi a bateria que apontou. */
  TELA_FOTO.set(pedido.id, {
    linha: paraServidor(pedido, { permitidos: PED_EDITAVEIS }).linha,
    revision: pedido.revision != null ? pedido.revision : (antes ? antes.revision : undefined),
    ensaio: !!(pedido.extra && pedido.extra.ensaio) || !!pedido.ensaio || !!(antes && antes.ensaio),
  });
}
const telaEhDoEnsaio = (id) => !!(TELA_FOTO.get(id) || {}).ensaio;

/* ---------------------------------------------------------------------------
   LEITURA · troca a fonte de `S.pedidos` pela visão operacional.
   Só no ensaio. Fora dele, quem manda continua sendo o documento.
   --------------------------------------------------------------------------- */
async function telaCarregarPedidos() {
  if (!telaLeDaTabela()) return { status: "desligado" };
  const r = await pxListar();
  if (r.status !== "ok") return r;
  TELA_FOTO.clear();
  for (const p of r.pedidos) telaGuardar(p);
  /* `paginas` sai daqui de propósito: é a prova de que a leitura foi até o fim
     e não parou no teto de 1.000 linhas do PostgREST. Uma página só com
     exatamente 1.000 pedidos é o desenho da falha do 2304. */
  return { status: "ok", pedidos: r.pedidos, quantos: r.pedidos.length,
           paginas: r.paginas, porPagina: r.porPagina };
}

/* ===========================================================================
   v8.24 · O QUE ESTA AÇÃO MUDOU — e só isso
   ---------------------------------------------------------------------------
   Até a v8.23 o patch era a diferença entre o pedido na tela e a FOTO DO
   SERVIDOR. Parece certo e não é: documento e tabela podem estar diferentes por
   coisas antigas, que a pessoa não tocou — e na primeira gravação de cada
   pedido todas elas iam de carona. O `qtd` que ela mudou chegava acompanhado de
   `prioridade`, `atualizadoEm` e o que mais estivesse desencontrado.

   A base certa não é o servidor: é o pedido COMO ELE ESTAVA ANTES DESTA AÇÃO.
   `PCP_ANTES` guarda isso e é refeito depois de cada gravação. A diferença
   contra ele é exatamente o que a pessoa acabou de fazer — nem mais, nem menos,
   e sem depender de os 42 pontos de gravação avisarem coisa alguma.

   A REVISÃO continua vindo da foto do servidor: é ela que diz em cima de que
   versão a gravação está sendo feita.
   =========================================================================== */
const PCP_ANTES = new Map();

function telaMarcarBase(lista) {
  const pedidos = lista || (typeof S !== "undefined" ? S.pedidos : []) || [];
  PCP_ANTES.clear();
  for (const p of pedidos) {
    if (p && p.id) PCP_ANTES.set(p.id, paraServidor(p, { permitidos: PED_EDITAVEIS }).linha);
  }
  return PCP_ANTES.size;
}

/* ---------------------------------------------------------------------------
   v8.74 · P2 · A BASE DE **UM** PEDIDO
   ---------------------------------------------------------------------------
   `telaMarcarBase` refaz a base inteira; isto refaz a de um só. Existe por
   causa de um defeito medido: o Realtime escrevia a linha nova em `S.pedidos`
   e em `TELA_FOTO` e NÃO na base do diff. A alteração da outra pessoa passava
   a contar como alteração MINHA, e a minha gravação seguinte a devolvia ao
   servidor com o meu nome — gastando uma revisão e virando conflito do outro
   lado.

   Só é chamada onde o objeto da tela ACABOU de ser sobrescrito pelo servidor.
   Onde o objeto não foi tocado (o ramo "aviso", com a pessoa editando), a base
   NÃO se mexe — senão o que ela está digitando deixaria de ser diferença.
   --------------------------------------------------------------------------- */
function telaMarcarBaseDe(pedido) {
  if (!pedido || !pedido.id) return false;
  try { PCP_ANTES.set(pedido.id, paraServidor(pedido, { permitidos: PED_EDITAVEIS }).linha); }
  catch (e) { return false; }
  return true;
}

/* ---------------------------------------------------------------------------
   QUEM SOU EU, DO PONTO DE VISTA DO SERVIDOR (v8.78)
   ---------------------------------------------------------------------------
   A trava de revisão sabe que a linha mudou; ela não sabe QUEM mudou. Por isso
   a mensagem vermelha dizia "outra pessoa" em cima de uma gravação da própria
   pessoa — feita, por exemplo, pelo app ao avançar o pedido de papel→aberto na
   impressão do canhoto.

   Para dizer a verdade é preciso comparar `updated_by` com o meu uid. E o app
   não tinha o meu uid em lugar nenhum: o que ele guarda é o token.

   Duas fontes, nesta ordem:
     1. O SERVIDOR ME ENSINA. Toda gravação minha que dá certo volta com
        `updated_by` preenchido — com o MEU uid, porque fui eu que gravei.
        A primeira gravação da sessão já basta.
     2. O TOKEN. Access token do Supabase é JWT; o `sub` é o uid. Serve para
        quem ainda não gravou nada nesta sessão.

   Sem nenhuma das duas, `meuUid()` devolve null — e aí nada muda: a regra
   antiga continua valendo. Não sei quem é, não afirmo que é minha.
   --------------------------------------------------------------------------- */
let PED_MEU_UID = null;
function meuUidAprender(reg) {
  if (reg && reg.updated_by && !PED_MEU_UID) PED_MEU_UID = String(reg.updated_by);
  return PED_MEU_UID;
}
function meuUid() {
  if (PED_MEU_UID) return PED_MEU_UID;
  try {
    const tk = (typeof supaSessao === "function" && (supaSessao() || {}).access) || "";
    const corpo = String(tk).split(".")[1];
    if (!corpo) return null;
    const j = JSON.parse(atob(corpo.replace(/-/g, "+").replace(/_/g, "/")));
    if (j && j.sub) { PED_MEU_UID = String(j.sub); return PED_MEU_UID; }
  } catch (e) {}
  return null;
}
/* AS REVISÕES QUE EU PRODUZI NESTA SESSÃO.
   `updated_by` sozinho não basta, e a bancada mostrou por quê: uma alteração
   feita FORA do app — SQL Editor, carga, script — não mexe em `updated_by`,
   então a linha continua assinada por mim e eu passaria por cima de um
   trabalho que não é meu. A prova forte é esta: eu vi esta revisão EXATA
   voltar de uma gravação minha, nesta sessão.

   Consequência de propósito: outra ABA minha, ou o mesmo login noutra máquina,
   produz revisão que esta sessão não conhece — e continua dando conflito.
   Duas janelas do mesmo pedido abertas ao mesmo tempo perdem trabalho igual,
   seja quem for que esteja nas duas. */
const PED_MINHAS_REVISOES = new Map();
/* o caderno dos conflitos — diagnóstico, lido no console */
const PED_CONFLITOS = [];
function minhaRevisaoGuardar(id, rev) {
  if (!id || rev == null) return;
  let s2 = PED_MINHAS_REVISOES.get(id);
  if (!s2) { s2 = new Set(); PED_MINHAS_REVISOES.set(id, s2); }
  s2.add(Number(rev));
  /* não cresce sem fim: guarda as últimas do pedido */
  if (s2.size > 40) { const it = s2.values(); for (let i = 0; i < 10; i++) s2.delete(it.next().value); }
}
const minhaRevisao = (id, rev) => !!(PED_MINHAS_REVISOES.get(id) && PED_MINHAS_REVISOES.get(id).has(Number(rev)));

/* A gravação que está no servidor é MINHA? Só responde `true` com PROVA:
   · `updated_by` é o meu uid, E
   · esta revisão exata saiu de uma gravação minha nesta sessão.
   Faltando qualquer uma das duas, a resposta é não — e a trava age como antes. */
function gravacaoEhMinha(registro, id) {
  if (!registro || !registro.updated_by) return false;
  const meu = meuUid();
  if (!meu || String(registro.updated_by) !== meu) return false;
  return minhaRevisao(id || registro.id, registro.revision);
}

/* O que mudou desde a última gravação, pedido a pedido. Devolve
   [{ id, patch, novo }]; `novo` é o pedido que não existia na base. */
function telaMudancasDesdeABase(lista) {
  const pedidos = lista || (typeof S !== "undefined" ? S.pedidos : []) || [];
  const mudancas = [];
  for (const p of pedidos) {
    if (!p || !p.id) continue;
    const base = PCP_ANTES.get(p.id);
    if (!base) { mudancas.push({ id: p.id, pedido: p, novo: true }); continue; }
    const patch = diferenca(base, p);
    if (Object.keys(patch).length) mudancas.push({ id: p.id, pedido: p, patch, novo: false });
  }
  return mudancas;
}

/* ---------------------------------------------------------------------------
   ESCRITA · o que `salvarPedidos()` passa a fazer no ensaio.
   Compara CADA pedido com a foto e manda só o que mudou, um patch por pedido.
   Pedido que não está na foto é novo: vai por `pcp_pedido_criar`.
   --------------------------------------------------------------------------- */
/* `mudancasPre` é a lista tirada ANTES da gravação do documento. Ela existe por
   um motivo que custou caro entender: `salvarTudo` relê o documento antes de
   escrever e FUNDE `S.pedidos` com o do servidor, registro a registro. Se a
   outra pessoa gravou depois de mim, o registro dela ganha e o meu objeto
   desaparece da lista. Calcular o patch DEPOIS disso seria:
     · perder a minha alteração, que já não está mais em `S.pedidos`; e
     · pior, mandar as alterações DELA como se fossem minhas, porque a
       diferença contra a minha base velha inclui tudo que ela mexeu.
   Por isso o patch é tirado antes, e enviado depois. */
async function telaSalvarPedidos(lista, mudancasPre) {
  if (!telaEscreveNaTabela()) return { status: "desligado" };
  const pedidos = lista || (typeof S !== "undefined" ? S.pedidos : []) || [];
  const resultados = [];

  /* Só os pedidos que ESTA ação mexeu. Sem isto, cada gravação varreria os
     1.593 e mandaria para o servidor toda diferença herdada. */
  const mudancas = mudancasPre || telaMudancasDesdeABase(pedidos);
  if (!mudancas.length) return { status: "ok", resultados: [], problemas: [], nada: true };

  for (const m of mudancas) {
    /* o objeto pode ter sido TROCADO pela fusão do documento entre o cálculo e
       o envio. A identidade que vale é o id; o objeto é reencontrado. */
    const p = pedidos.find((x) => x && x.id === m.id) || m.pedido;
    const foto = TELA_FOTO.get(m.id);

    if (!foto) {
      /* NOVO. O número que a tela sugeriu não vai: quem numera é o servidor.
         Ele fica em `extra.numeroSugerido` para a conferência de quem quiser
         comparar depois. */
      const item = Object.assign({}, p, {
        extra: Object.assign({}, p.extra || {},
          telaEnsaioLigado() ? { ensaio: true } : {}, { numeroSugerido: p.numero || null }),
      });
      delete item.numero;
      delete item.revision;
      const r = await pxCriar([item]);
      if (r.status === "ok" && r.criados && r.criados[0]) {
        const criado = paraApp(r.criados[0]);
        /* o id é o mesmo que a tela gerou — a chave técnica não muda nunca.
           O que muda é o NÚMERO, que agora vem do servidor. */
        p.numero = criado.numero;
        p.revision = criado.revision;
        p.cicloPcp = criado.cicloPcp;
        telaGuardar(criado);
        rtMinha(p.id, criado.revision);
      }
      resultados.push({ id: p.id, acao: "criar", resposta: r });
      continue;
    }

    if (telaTravaDoEnsaio() && !foto.ensaio) {
      /* a trava: pedido de verdade, migrado, não se toca no ensaio */
      resultados.push({ id: p.id, acao: "recusada",
        resposta: { status: "fora-do-ensaio",
          texto: "Este pedido é da base de verdade. O ensaio não altera pedido migrado." } });
      continue;
    }

    /* o patch é o da AÇÃO (base = como o pedido estava antes dela), e a
       revisão é a do SERVIDOR (base = em cima de que versão estou gravando).
       São duas bases diferentes de propósito, e cada uma responde a sua
       pergunta. */
    /* Sem base para este pedido, e ele existe no servidor: é o caso de ele ter
       entrado em `S.pedidos` depois da abertura (uma releitura, um pedido que
       chegou pelo Realtime). Não dá para saber o que a AÇÃO mudou, então a
       comparação volta a ser contra o servidor — que é menos preciso, mas é
       honesto. O que não pode é ficar em silêncio: pedido sem base e sem patch
       simplesmente não gravava, e isso é a perda calada que estamos caçando. */
    const patch = m.patch || diferenca(foto.linha, p);
    if (m.novo && Object.keys(patch).length) {
      resultados.push({ id: p.id, acao: "sem-base",
        resposta: { status: "ok", aviso: "comparado com o servidor por falta de base local" } });
    }
    if (!patch || !Object.keys(patch).length) continue;

    const acao = obEnfileirar("pedido_patch", p.id, {
      p_id: p.id, p_expected_revision: foto.revision, p_patch: patch });
    const r = await pxEnviar(acao);
    if (r.status === "ok" && !r.sem_mudanca) {
      p.revision = r.revision;
      telaGuardar(p);
      rtMinha(p.id, r.revision);
    }
    resultados.push({ id: p.id, acao: "salvar", campos: Object.keys(patch), resposta: r });
  }
  /* a base passa a ser o estado de agora: a próxima gravação compara com ele */
  telaMarcarBase(pedidos);

  const problemas = resultados.filter((x) => x.resposta.status !== "ok");
  return { status: problemas.length ? "com-problema" : "ok", resultados, problemas };
}

/* Apagar e continuar passam pelas RPCs próprias — não são patch. */
/* Sem a foto do servidor não há revisão para mandar, e sem revisão não há como
   gravar com segurança. Isso acontece de verdade: a aba abriu antes daquele
   pedido existir, ou a lista foi recarregada em outra aba. A resposta é um
   status que a tela sabe tratar — `sem-foto`, recarregue —, nunca uma exceção:
   exceção no meio de uma ação é como o rascunho de quem está digitando se
   perde. Foi a bateria final que apontou. */
function telaFotoDe(id) { return TELA_FOTO.get(id) || null; }

async function telaApagarPedido(id, motivo) {
  if (!telaEscreveNaTabela()) return { status: "desligado" };
  if (telaTravaDoEnsaio() && !telaEhDoEnsaio(id)) return { status: "fora-do-ensaio" };
  const foto = telaFotoDe(id);
  if (!foto) return { status: "sem-foto", texto: "recarregue a lista antes de apagar este pedido" };
  const r = await pxApagar(id, foto.revision, motivo);
  if (r.status === "ok") TELA_FOTO.delete(id);
  return r;
}
/* P1-A · ESTE É O CAMINHO DA CONTINUAÇÃO, e agora ele é usado.
   Ela existia e nunca era chamada: a conferência criava o `-A` como pedido novo
   comum, e `pxCriar` descarta o `numero` de propósito — então o `2358-A` virava
   `2700` e sobrava só em `extra.numeroSugerido`. Medido em
   `testes/continuacao-A.js`.

   Duas coisas mudaram aqui, e as duas são da continuação:
   1 · a marca `ensaio` era FIXA. Escrita na fase de ensaio e nunca ligada ao
       fluxo real, ela carimbaria como teste toda continuação de verdade. Agora
       segue a mesma regra do caminho de criação: só no ensaio.
   2 · a linha que volta é ADOTADA aqui — com o número que o servidor deu, a
       revisão e a foto. Quem chama não precisa saber montar pedido. */
async function telaContinuarPedido(id, novo) {
  if (!telaEscreveNaTabela()) return { status: "desligado" };
  if (telaTravaDoEnsaio() && !telaEhDoEnsaio(id)) return { status: "fora-do-ensaio" };
  const foto = telaFotoDe(id);
  if (!foto) return { status: "sem-foto", texto: "recarregue a lista antes de continuar este pedido" };
  const r = await pxContinuar(id, foto.revision, Object.assign({}, novo, {
    extra: Object.assign({}, (novo && novo.extra) || {},
      telaEnsaioLigado() ? { ensaio: true } : {}) }));
  if (r.status === "ok" && r.continuacao) {
    const filho = paraApp(r.continuacao);
    const lista = (typeof S !== "undefined" && S.pedidos) || [];
    if (!lista.some((x) => x && x.id === filho.id)) lista.push(filho);
    telaGuardar(filho);
    rtMinha(filho.id, filho.revision);
    /* o original pode ter mudado de estado na MESMA operação (`status_origem`).
       Quando muda, a foto dele tem de acompanhar, senão o próximo save da tela
       manda a revisão velha e leva conflito falso. */
    if (r.origem) {
      const base = paraApp(r.origem);
      const vivo = lista.find((x) => x && x.id === base.id);
      if (vivo) { vivo.status = base.status; vivo.revision = base.revision; }
      telaGuardar(base);
      rtMinha(base.id, base.revision);
    }
  }
  return r;
}
async function telaRenumerarPedido(id, numeroNovo) {
  if (!telaEscreveNaTabela()) return { status: "desligado" };
  if (telaTravaDoEnsaio() && !telaEhDoEnsaio(id)) return { status: "fora-do-ensaio" };
  const foto = telaFotoDe(id);
  if (!foto) return { status: "sem-foto", texto: "recarregue a lista antes de renumerar este pedido" };
  const r = await pxRenumerar(id, foto.revision, numeroNovo);
  if (r.status === "ok") {
    const p = (typeof S !== "undefined" ? S.pedidos : []).find((x) => x.id === id);
    if (p) { p.numero = String(numeroNovo).trim(); p.revision = r.revision; telaGuardar(p); }
  }
  return r;
}

/* ---------------------------------------------------------------------------
   CONFLITO · o que a tela mostra quando duas pessoas mexeram no mesmo pedido.
   Campos diferentes: junta e reenvia com id NOVO (é outra intenção, porque a
   base mudou). Mesmo campo: devolve os três valores para a pessoa decidir.
   --------------------------------------------------------------------------- */
async function telaResolverConflito(id, resposta) {
  const foto = TELA_FOTO.get(id);
  const p = (typeof S !== "undefined" ? S.pedidos : []).find((x) => x.id === id);
  if (!foto || !p) return { status: "nao-achei" };
  const meu = diferenca(foto.linha, p);
  const doServidor = resposta && resposta.registro ? resposta.registro : null;
  const veredito = mgClassificar(foto.linha, meu, doServidor);

  if (veredito.nadaAFazer) {
    telaGuardar(paraApp(doServidor));
    return { status: "ok", nadaAFazer: true };
  }
  if (!veredito.podeSozinho) {
    return { status: "conflito-de-campo", disputados: veredito.disputados,
      automatico: veredito.automatico,
      texto: mgComoContar(veredito.disputados, (doServidor && doServidor.updated_by) || null) };
  }
  /* dá para juntar: a base passa a ser a do servidor, e só os meus campos vão */
  const base = Object.assign({}, doServidor);
  telaGuardar(Object.assign({}, paraApp(doServidor)));
  const alvo = Object.assign({}, paraApp(base), paraApp(veredito.automatico));
  const r = await pxSalvar(id, base, alvo, doServidor.revision);
  if (r.status === "ok") { p.revision = r.revision; telaGuardar(p); rtMinha(id, r.revision); }
  return r;
}

/* A pessoa escolheu, campo a campo, o que fica. `escolhas` é { campo: valor }. */
async function telaAplicarEscolha(id, escolhas, revisaoDoServidor) {
  const p = (typeof S !== "undefined" ? S.pedidos : []).find((x) => x.id === id);
  if (!p) return { status: "nao-achei" };
  const base = (TELA_FOTO.get(id) || {}).linha || {};
  const alvo = Object.assign({}, paraApp(base), paraApp(escolhas));
  const r = await pxSalvar(id, base, alvo, revisaoDoServidor);
  if (r.status === "ok") { p.revision = r.revision; telaGuardar(p); rtMinha(id, r.revision); }
  return r;
}

/* ---------------------------------------------------------------------------
   REALTIME · atualiza UM pedido, sem render global e sem tocar em quem está
   sendo editado. A tela diz o que está aberto por `telaAbriuModal/FechouModal`.
   --------------------------------------------------------------------------- */
function telaLigarRealtime(aoAtualizar) {
  rtOuvir((pedido, ev) => {
    if (ev.origem === "aviso") {
      /* não mexe em nada: só avisa que há novidade naquele pedido */
      if (typeof aoAtualizar === "function") aoAtualizar(pedido, ev);
      return;
    }
    const lista = (typeof S !== "undefined" ? S.pedidos : []) || [];
    const i = lista.findIndex((x) => x.id === pedido.id);
    if (i >= 0) Object.assign(lista[i], pedido); else lista.push(pedido);
    telaGuardar(pedido);
    /* v8.74 · P2 · a base do diff anda junto. Sem esta linha o que chegou do
       servidor vira "alteração minha" na próxima gravação. */
    telaMarcarBaseDe(pedido);
    if (typeof aoAtualizar === "function") aoAtualizar(pedido, ev);
  });
  return rtConectar();
}
function telaAbriuModal(id, campos) { rtEditando(id, campos || ["obs", "qtd", "prestadora", "responsavel"]); }
function telaFechouModal(id) { rtSoltar(id); }

/* ---------------------------------------------------------------------------
   ABERTURA · a ordem importa e ela é esta:
     1. a sessão é restaurada e CONFERIDA;
     2. só então a outbox é drenada.
   Drenar antes de ter sessão faz cada ação pendente levar um `sem-login`, gastar
   uma tentativa e continuar na fila — barulho sem efeito.
   --------------------------------------------------------------------------- */
async function telaAbrir() {
  const pendentes = obDestravar();
  let sessao = false;
  try { sessao = typeof supaTokenValido === "function" ? await supaTokenValido() : !!persToken(); }
  catch { sessao = false; }
  if (!sessao) return { status: "sem-sessao", pendentes };
  /* as flags são lidas do SERVIDOR antes de qualquer decisão de caminho */
  const f = await telaFlagsCarregar();

  /* v8.37 · CADASTROS · o registro e a foto vêm ANTES do portão de Pedidos.
     Estavam depois, e isso era um acoplamento errado: com as flags de Pedidos
     desligadas, `telaAbrir` devolve cedo, e os cadastros ficavam cegos — sem
     registro, sem foto, sem espelho, por causa de uma flag que não é deles.
     Cada assunto responde pelas SUAS flags e por mais nenhuma. */
  let cadBase = null;
  if (typeof cadCarregarTipos === "function") {
    try { await cadCarregarTipos(); } catch (e) {}
    if (typeof cadAlgumEscreve === "function" && cadAlgumEscreve()
        && typeof cadMarcarBase === "function") {
      try { cadBase = await cadMarcarBase(); } catch (e) { cadBase = { status: "erro" }; }
    }
  }
  /* v8.50 · insumos e semiacabados: leitura das tabelas e a foto do que já
     subiu, para a fila de intenções não reenviar o passado inteiro. */
  let insInfo = null;
  if (typeof insCarregar === "function") {
    try {
      insInfo = { insumos: await insCarregar(), semi: await semCarregar() };
      if (typeof insMarcarBase === "function") insMarcarBase();
    } catch (e) { insInfo = { erro: String((e && e.message) || e) }; }
  }
  /* v8.50 · A EQUIPE PRIMEIRO DE TUDO. `ehAdm()` e `podeAba()` decidem o que
     a tela sequer desenha; perguntar depois seria desenhar com a resposta
     antiga e corrigir na frente da pessoa. */
  let eqInfo = null;
  if (typeof eqCarregar === "function") {
    try { eqInfo = await eqCarregar(); } catch (e) { eqInfo = { status: "erro", msg: String((e && e.message) || e) }; }
  }
  /* v8.50 · cfg, estoque e a trilha vêm da tabela quando as flags mandam.
     `cfg` primeiro: as opções decidem contas que a Demanda faz no primeiro
     render. `eventos` NÃO entra no boot — é meio megabyte e a aba Histórico o
     busca sob demanda, como já fazia. */
  let auxInfo = null;
  if (typeof cfgCarregar === "function") {
    try {
      auxInfo = { cfg: await cfgCarregar(), estoque: await estCarregar() };
      if (typeof cfgMarcarBase === "function") cfgMarcarBase();
      if (typeof evMarcarBase === "function") evMarcarBase();
    } catch (e) { auxInfo = { erro: String((e && e.message) || e) }; }
  }
  /* v8.50 · os meses fechados vêm da tabela quando a flag manda. Antes de
     qualquer tela desenhar: `mesFechado()` decide trava em 15 lugares. */
  let mesInfo = null;
  if (typeof mesCarregar === "function") {
    try { mesInfo = await mesCarregar(); } catch (e) { mesInfo = { status: "erro" }; }
  }
  /* a resolução de prestadora precisa do registro ANTES de qualquer tela
     desenhar: o fechamento a usa no primeiro render. */
  if (typeof prestCarregar === "function") { try { await prestCarregar(); } catch (e) {} }
  /* a reserva de ids de produto se completa na abertura, para criar produto
     não depender de a internet estar boa naquele segundo */
  if (typeof prodReservaGarantir === "function") { try { prodReservaGarantir(1, "tela"); } catch (e) {} }
  /* v8.46 · com `cad_<x>_leitura` ligada, a TABELA vira a fonte da tela e o
     documento passa a ser espelho. Antes desta chamada a flag de leitura
     existia e ninguém a lia. */
  let cadAplicou = [];
  if (typeof cadAplicarTodos === "function") {
    try { cadAplicou = await cadAplicarTodos(); } catch (e) { cadAplicou = [{ aplicado: false, porque: String(e && e.message || e) }]; }
  }
  const cadInfo = { cadastrosBase: cadBase, cadAplicou, meses: mesInfo, aux: auxInfo, equipe: eqInfo, insumos: insInfo,
    cadastros: typeof cadNomes === "function" ? cadNomes() : null };

  /* v8.107 · o dreno do corte roda ANTES da saída logo abaixo, e é de
     propósito: ele tem flag própria (`corte_escrita`) e não pode ficar refém
     do cutover de Pedidos. Com a flag desligada, `cxDrenar` devolve
     "desligado" sem tocar na rede. */
  if (typeof cxDrenar === "function") {
    try { cadInfo.corte = await cxDrenar(); }
    catch (e) { cadInfo.corte = { status: "erro", msg: String((e && e.message) || e) }; }
  }

  if (!telaLeDaTabela() && !telaEscreveNaTabela()) {
    return Object.assign({ status: "desligado", pendentes, sessao: true,
      flags: f.flags || null }, cadInfo);
  }

  const drenou = telaEscreveNaTabela() ? await pxDrenar() : { status: "ok", feitas: [], restam: obPendentes().length };
  /* -------------------------------------------------------------------------
     v8.74 · P1 · A ABERTURA RECONCILIA, NÃO SÓ FOTOGRAFA.
     Aqui estava `telaCarregarPedidos()`, que preenche `TELA_FOTO` a partir da
     TABELA e não toca em `S.pedidos` — que veio do DOCUMENTO, no boot.js.
     Quando os dois estavam diferentes, o app abria com a tela mostrando um
     valor, a foto guardando outro, e a base do diff copiando o da tela.
     Medido na bancada: tabela 1234, documento 100, e as três memórias
     divergentes antes de a pessoa encostar em qualquer coisa.

     `telaReconciliarPedidos()` já fazia exatamente o que falta, e já era
     chamada — só que DEPOIS, na sincronia periódica e na sentinela. Ela faz a
     MESMA ida ao servidor (`pxListar`), refaz `TELA_FOTO`, junta a tabela com
     o documento, chama `telaMarcarBase()` e reancora a janela. Uma chamada no
     lugar da outra: nenhuma requisição a mais.

     O que ela preserva de propósito: o pedido com intenção ainda na fila
     continua como está na tela (senão a pessoa veria o valor voltar atrás), e
     o que só existe no documento não some.
     ------------------------------------------------------------------------- */
  const carga = await telaReconciliarPedidos();
  /* não deu para reconciliar (rede, teto, flag): pelo menos a base sai coerente
     com o que a tela tem — o comportamento anterior, sem regressão */
  if (!carga || carga.status !== "ok") telaMarcarBase();
  /* v8.33 · a Demanda tira a foto dela na abertura, pelo mesmo motivo: sem
     base, a primeira gravação leria toda OP como se fosse nova. Só quando a
     escrita da Demanda está ligada — desligada, nem lê. */
  let demBase = null;
  if (typeof demEscreveNaTabela === "function" && demEscreveNaTabela()) {
    /* v8.74 · P7 · não basta tirar a foto: `S.ops` vem do DOCUMENTO e a foto
       vem da TABELA. Enquanto os dois partiam de estados diferentes, a
       primeira gravação nascia com remoções que ninguém pediu.
       `demReconciliar` faz a mesma leitura de antes e ainda junta os dois. */
    try {
      demBase = typeof demReconciliar === "function" ? await demReconciliar()
        : (typeof demMarcarBase === "function" ? await demMarcarBase() : null);
    } catch (e) { demBase = { status: "erro" }; }
  }
  telaLigarRealtime(null);
  /* `cadInfo` INTEIRO, e não campo a campo: copiar duas das três chaves à mão
     foi o que fez `cadAplicou` não chegar à saída — a mesma informação escrita
     em dois lugares sempre acaba divergindo num deles. */
  /* `carregou` continua querendo dizer "quantos pedidos a TABELA devolveu" —
     era o que `telaCarregarPedidos` reportava, e é o que as baterias conferem.
     `naTela` é o número depois da junção com o documento. */
  return Object.assign({ status: "ok", pendentes, drenou, sessao: true,
           carregou: carga && carga.daTabela != null ? carga.daTabela : (carga && carga.quantos),
           naTela: ((typeof S !== "undefined" ? S.pedidos : []) || []).length,
           paginas: carga.paginas, porPagina: carga.porPagina, demandaBase: demBase,
           flags: TELA_FLAGS, le: telaLeDaTabela(), escreve: telaEscreveNaTabela() }, cadInfo);
}

/* ===========================================================================
   v8.23 · A TELA NÃO MOSTRA COMO SALVO O QUE O SERVIDOR NÃO CONFIRMOU
   ---------------------------------------------------------------------------
   `salvarPedidos()` começa com `render()` — e tem de começar mesmo: enquanto a
   pessoa digita, o que ela vê é o que ela escreveu. O problema é DEPOIS: se o
   servidor recusou (conflito, número em uso, pedido apagado), a tela ficava
   exibindo o valor novo como se estivesse gravado. Ela fecha a janela achando
   que acabou, e o número não está em lugar nenhum.

   A regra: gravação não confirmada volta ao valor que o SERVIDOR tem, e a
   pessoa é avisada com o motivo. Nada de "salvo" silencioso.

   `sem_mudanca` e `ok` não entram aqui — esses o servidor confirmou.
   `offline` também não: a ação ficou NA FILA, com id próprio, e vai sair quando
   a rede voltar. Desfazer aí seria apagar trabalho que está a caminho.
   =========================================================================== */
const TELA_NAO_CONFIRMA = ["conflito", "numero-em-uso", "apagado", "arquivado",
  "invalido", "operacao-reutilizada", "sem-permissao", "fora-do-ensaio", "sem-foto"];

function telaDesfazerNaoConfirmados(resultado) {
  if (!resultado || !resultado.problemas || !resultado.problemas.length) return { desfeitos: 0 };
  const lista = (typeof S !== "undefined" ? S.pedidos : []) || [];
  const desfeitos = [];
  for (const p of resultado.problemas) {
    const st = p.resposta && p.resposta.status;
    if (!TELA_NAO_CONFIRMA.includes(st)) continue;
    const alvo = lista.find((x) => x && x.id === p.id);
    const foto = TELA_FOTO.get(p.id);
    if (!alvo || !foto) continue;
    /* devolve, campo a campo, o que o servidor tem. O registro que veio junto
       com o conflito é mais novo que a foto — quando houver, ele manda. */
    /* v8.99 · o registro do conflito só manda se não for MAIS VELHO que a foto:
       uma resposta atrasada devolvia a tela (e a foto) a uma revisão vencida,
       e a gravação seguinte saía com a revisão esperada errada. */
    const reg = p.resposta && p.resposta.registro;
    const regVelho = !!(reg && foto.revision != null && reg.revision != null && Number(reg.revision) < Number(foto.revision));
    const doServidor = (reg && !regVelho) ? paraApp(reg) : paraApp(foto.linha);
    for (const [k, v] of Object.entries(doServidor)) if (k !== "id") alvo[k] = v;
    if (regVelho) alvo.revision = foto.revision;
    if (reg && !regVelho) telaGuardar(doServidor);
    desfeitos.push({ id: p.id, numero: alvo.numero, status: st });
  }
  return { desfeitos: desfeitos.length, quais: desfeitos };
}

/* O texto que a pessoa lê. Um por situação, em português, dizendo o que fazer. */
function telaTextoDoProblema(p) {
  const st = p.resposta && p.resposta.status;
  /* v8.78 · o NÚMERO do pedido, não o id interno. A pessoa lia
     "O pedido mu1shefl871f3 foi alterado…" e não sabia de qual pedido se
     tratava. O número vem da resposta, da lista da tela ou da foto — nessa
     ordem; o id fica como último recurso. */
  const num = (p.resposta && p.resposta.numero)
    || (((typeof S !== "undefined" ? S.pedidos : []) || []).find((x) => x && x.id === p.id) || {}).numero
    || ((TELA_FOTO.get(p.id) || {}).linha || {}).numero
    || p.id;
  if (st === "conflito") {
    /* "outra pessoa" só se aparece no `updated_by` que NÃO sou eu. Quando não
       dá para saber quem foi, a frase não acusa ninguém. */
    const reg = p.resposta && p.resposta.registro;
    const quem = reg && reg.updated_by ? (gravacaoEhMinha(reg, p.id) ? "eu" : "outra") : "nao-sei";
    if (quem === "eu") return `O pedido ${num} tinha uma gravação sua mais nova no servidor. A tela voltou ao que está lá — confira e refaça a sua alteração.`;
    if (quem === "outra") return `O pedido ${num} foi alterado por outra pessoa enquanto você editava. A tela voltou ao que está no servidor — confira e refaça a sua alteração.`;
    return `O pedido ${num} mudou no servidor enquanto você editava. A tela voltou ao que está lá — confira e refaça a sua alteração.`;
  }
  if (st === "numero-em-uso") {
    const d = p.resposta.dono || {};
    return `O número ${p.resposta.numero} já é do pedido ${d.id || ""}${d.apagado ? " (que foi apagado — o número fica reservado)" : ""}. A renumeração não foi feita.`;
  }
  if (st === "apagado") return `O pedido ${num} foi apagado por alguém. Nada foi gravado.`;
  if (st === "arquivado") return `O pedido ${num} está arquivado. Desarquive antes de editar — nada foi gravado.`;
  if (st === "invalido") return `O servidor recusou a gravação do pedido ${num}: ${p.resposta.motivo || p.resposta.texto || "campo inválido"}. Nada foi gravado.`;
  if (st === "operacao-reutilizada") return `Esta ação foi reenviada com uma intenção diferente e o servidor recusou, de propósito. Refaça a alteração.`;
  if (st === "sem-permissao") return `Você não tem permissão para esta alteração no pedido ${num}. Nada foi gravado.`;
  if (st === "sem-foto") return `Recarregue a lista antes de mexer no pedido ${num} — a tela não sabe em que versão ele está.`;
  if (st === "offline") return `Sem conexão agora. A alteração do pedido ${num} ficou guardada e vai sozinha quando a rede voltar.`;
  return `A gravação do pedido ${num} não foi confirmada (${st}). A tela voltou ao valor do servidor.`;
}

/* ===========================================================================
   v8.26 · A INTENÇÃO NASCE ANTES DE QUALQUER SAÍDA DE `salvarTudo`
   ---------------------------------------------------------------------------
   `salvarTudo` tem quatro saídas, e eu já tropecei em duas delas:

     1. `if (_gravando) return …`  — retorno ANTECIPADO quando já há uma
        gravação em curso. Pula o corpo inteiro. Foi ele que engoliu a
        alteração no cenário de releitura concorrente.
     2. conflito de seção — `return` dentro do catch, deixa `ok` falso.
     3. falha de gravação do documento — mesmo caminho, `ok` falso.
     4. `return ok` — a saída normal.

   Enquanto o envio dependia de chegar ao fim com `ok` verdadeiro, três dessas
   quatro saídas descartavam o trabalho da pessoa em silêncio.

   A correção não é cobrir as saídas uma a uma — é tirar a intenção do caminho
   delas. Ela é REGISTRADA no começo, na outbox, que vive no localStorage: uma
   vez enfileirada, nenhum `return` a apaga, nem fechar o navegador. O envio
   acontece depois, e pode falhar sem levar a intenção junto.

   E o inverso também vale: registrar não é gravar. `PCP_ENSAIO_ULTIMO` só
   recebe "ok" quando o SERVIDOR confirmou.
   =========================================================================== */

/* Registra o que esta ação mudou. Roda ANTES de tudo. Devolve os opIds. */
/* ===========================================================================
   E1 · A TRAVA DO ESTRANGULAMENTO
   ---------------------------------------------------------------------------
   A regra "a importação não cria pedido" mora em `dados/importar.js`, e tirar
   de lá o ramo que criava é NECESSÁRIO. Só que uma regra que vive num lugar é
   uma promessa por inspeção: basta uma linha futura empilhar um pedido em
   `S.pedidos` durante uma importação para o defeito voltar — calado, do jeito
   que voltou da primeira vez.

   Esta é a segunda barreira, e ela é ESTRUTURAL. Em toda a árvore existe UM
   único lugar que enfileira `pedido_criar`: o ramo `if (!foto)` logo abaixo.
   Um ponto de estrangulamento. Então a garantia vai nele, e não na intenção de
   quem escreve o importador.

   Durante o escopo de uma importação, esse ramo:
     · RECUSA — não monta a linha, não enfileira, não manda nada ao servidor;
     · REGISTRA quem tentou, com número e SKU, para a tela poder mostrar;
     · e TIRA de `S.pedidos` — mas SÓ o que apareceu DEPOIS de o escopo abrir,
       porque `telaRegistrarIntencoes` roda ANTES da escrita do documento
       (`ui/render-de-fundo.js`, dentro de `salvarTudo`). Só recusar o envio
       deixaria o fantasma no documento — meio defeito é defeito.

   Fora do escopo, nada muda: criar pedido pela tela continua chegando a
   `pcp_pedido_criar`, exatamente como antes. A bateria prova os dois lados.

   ---------------------------------------------------------------------------
   A · O CONSERTO DE 13/09 · A TRAVA APAGAVA PEDIDO DE VERDADE
   ---------------------------------------------------------------------------
   A primeira escrita apagava TODO pedido que caísse no ramo `if (!foto)`.
   "Sem foto" parece "inventado agora" e NÃO é: a foto vem de `pxListar()` na
   abertura, e ela pode não ter chegado — por falha de rede, ou simplesmente
   porque a listagem é a última coisa do boot e a pessoa importou antes.
   Com a foto vazia, "sem foto" vale para TODO pedido que a planilha tocar.

   Medido na bancada (`testes/documento-esvaziado.js`): a tela ficava com zero
   pedidos e o documento `pcp5:nucleo` era gravado com `pedidos: []`, sem um
   único erro na página. Na produção da Ana: documento com 6031 ops e ZERO
   pedidos, com 2069 vivos na tabela. A tabela nunca foi tocada — a trava
   impede justamente que algo saia pelo fio —, mas a cópia foi a zero e o app
   abre pela cópia.

   A regra agora é nominal e estreita: o escopo fotografa os ids que JÁ
   ESTAVAM em `S.pedidos` no instante em que abriu. Pedido dessa lista NUNCA é
   removido, com foto ou sem foto. Some só o que nasceu dentro do escopo — que
   é exatamente o que a barreira existe para impedir de virar fantasma.
   =========================================================================== */
let IMPORTACAO_ESCOPO = null;

function importacaoAbrirEscopo(origem) {
  /* A FOTO DOS IDS, tirada aqui e não depois: é ela que separa "já existia"
     de "apareceu durante a importação". Sem ela a trava não tem como saber a
     diferença, e foi por não ter que ela apagou pedido de verdade. */
  const naTela = (typeof S !== "undefined" ? S.pedidos : []) || [];
  const jaExistiam = new Set();
  for (const p of naTela) if (p && p.id) jaExistiam.add(p.id);
  IMPORTACAO_ESCOPO = { origem: origem || "importação", recusas: [], em: Date.now(),
    jaExistiam, preservados: [] };
  return IMPORTACAO_ESCOPO;
}
function importacaoFecharEscopo() {
  const e = IMPORTACAO_ESCOPO; IMPORTACAO_ESCOPO = null; return e || { recusas: [] };
}
const importacaoEmCurso = () => !!IMPORTACAO_ESCOPO;
const importacaoRecusas = () => (IMPORTACAO_ESCOPO ? IMPORTACAO_ESCOPO.recusas.slice() : []);

/* ===========================================================================
   B · A IMPORTAÇÃO NÃO RODA COM A FOTO FRIA
   ---------------------------------------------------------------------------
   `TELA_FOTO` é o que o app sabe sobre a tabela de pedidos. Ela é preenchida
   por `telaCarregarPedidos()`, que é a ÚLTIMA coisa da abertura: vem depois de
   cadastros, insumos, equipe, cfg, estoque, meses fechados, prestadoras,
   produtos, `cadAplicarTodos` e `pxDrenar`. Enquanto tudo isso corre, a tela já
   está na mão da pessoa e a foto está vazia.

   Importar sem essa foto é decidir "este pedido existe no servidor?" sem ter
   perguntado. Foi assim que a trava apagou pedido de verdade, e foi assim,
   antes dela, que a duplicação da v8.62 nasceu — o mesmo cego, dois defeitos.

   A ordem aqui é: tem foto → segue. Não tem → BUSCA, porque o caso comum não é
   rede caída, é pressa. Buscou e veio → segue. Não veio → RECUSA, dizendo o
   motivo. Nunca segue no escuro.

   Duas saídas de "ok" que parecem frouxas e não são:
     · camada de tabela desligada → não existe foto a esperar;
     · a tela não tem pedido nenhum → não há o que a trava possa apagar.
   =========================================================================== */
async function importacaoFotoPronta() {
  /* A ABERTURA PRIMEIRO. Importar no meio do boot não é só "sem foto": as
     migrações da abertura ainda estão gravando o documento, e a gravação da
     importação corria junto com elas — medido na bancada, o documento ficava
     com o valor antigo enquanto a tela mostrava o novo. Esperar a abertura
     terminar resolve os dois de uma vez, e é o que qualquer pessoa faria se
     soubesse que ela ainda está correndo. */
  try {
    if (typeof PCP_ABERTURA !== "undefined" && PCP_ABERTURA
        && typeof PCP_ABERTURA_RESULTADO !== "undefined" && !PCP_ABERTURA_RESULTADO) {
      await Promise.race([PCP_ABERTURA.catch(() => null),
        new Promise((r) => setTimeout(r, 30000))]);
    }
  } catch (e) { console.error("importação · espera da abertura:", e); }
  if (typeof telaLeDaTabela !== "function" || typeof telaEscreveNaTabela !== "function")
    return { status: "ok", motivo: "sem-camada" };
  if (!telaLeDaTabela() && !telaEscreveNaTabela())
    return { status: "ok", motivo: "camada-desligada" };
  const naTela = ((typeof S !== "undefined" ? S.pedidos : []) || []).length;
  if (TELA_FOTO.size) return { status: "ok", foto: TELA_FOTO.size, naTela };
  if (!naTela) return { status: "ok", motivo: "tela-sem-pedidos", foto: 0, naTela };
  let r = null;
  try { r = await telaCarregarPedidos(); }
  catch (e) { r = { status: "erro", msg: String((e && e.message) || e) }; }
  if (TELA_FOTO.size) return { status: "ok", foto: TELA_FOTO.size, naTela, buscada: true };
  /* servidor respondeu e a tabela está mesmo vazia: base nova, primeira carga.
     Não há foto a esperar, e a regra A já protege quem está na tela. */
  if (r && r.status === "ok") return { status: "ok", motivo: "tabela-vazia", foto: 0, naTela, buscada: true };
  return { status: "sem-foto", naTela, resposta: r };
}

/* ===========================================================================
   D · A SENTINELA DA LISTA VAZIA
   ---------------------------------------------------------------------------
   O documento `pcp5:nucleo` é a cópia de onde o app monta `S.pedidos` na
   abertura. Gravá-lo com `pedidos: []` enquanto a tabela tem milhares é o
   estrago exato de 13/09: o servidor fica intacto e a tela abre vazia para
   sempre, sem um erro na página.

   Esta é a última rede, depois de A e de B. Ela não conserta regra nenhuma —
   ela impede a gravação destrutiva e, antes de impedir, tenta trazer a lista
   de volta da tabela, que é quem manda nos pedidos.

   Lista vazia DE PROPÓSITO existe: zerar a base, e a limpeza em lote que apaga
   todos. Essas duas dizem isso em voz alta com `nucleoAutorizarListaVazia()`,
   uma autorização de uso único e com prazo. Qualquer outro caminho que esvazie
   a lista é, por definição, não intencional — e é barrado.
   =========================================================================== */
let NUCLEO_VAZIO_AUTORIZADO = null;
const NUCLEO_VAZIO_PRAZO = 120000;

function nucleoAutorizarListaVazia(motivo) {
  NUCLEO_VAZIO_AUTORIZADO = { motivo: String(motivo || "?"), em: Date.now() };
  return NUCLEO_VAZIO_AUTORIZADO;
}
function nucleoVazioAutorizado() {
  const a = NUCLEO_VAZIO_AUTORIZADO;
  if (!a) return null;
  if (Date.now() - a.em > NUCLEO_VAZIO_PRAZO) { NUCLEO_VAZIO_AUTORIZADO = null; return null; }
  return a;
}
function nucleoConferirPedidos() {
  const naTela = ((typeof S !== "undefined" ? S.pedidos : []) || []).length;
  if (naTela) return { ok: true, naTela };
  const noServidor = (typeof TELA_FOTO !== "undefined" && TELA_FOTO) ? TELA_FOTO.size : 0;
  if (!noServidor) return { ok: true, naTela: 0, noServidor: 0 };
  const aut = nucleoVazioAutorizado();
  if (aut) return { ok: true, naTela: 0, noServidor, autorizado: aut.motivo };
  return { ok: false, naTela: 0, noServidor };
}

function telaRegistrarIntencoes(secoes) {
  const mexeuEmPedidos = !secoes || !secoes.length || secoes.includes("nucleo");
  if (!mexeuEmPedidos) return [];
  if (typeof telaEscreveNaTabela !== "function" || !telaEscreveNaTabela()) return [];

  const pedidos = (typeof S !== "undefined" ? S.pedidos : []) || [];
  const mudancas = telaMudancasDesdeABase(pedidos);
  const criadas = [];
  for (const m of mudancas) {
    const p = m.pedido;
    const foto = TELA_FOTO.get(m.id);

    if (!foto) {
      /* E1 · A TRAVA. Este é o único ponto que enfileira `pedido_criar`, e
         durante uma importação ele recusa. Nada é montado, nada é enfileirado,
         nada sai pelo fio — e o pedido sai de `S.pedidos` para não sobrar no
         documento, que é escrito depois desta função. */
      if (importacaoEmCurso()) {
        IMPORTACAO_ESCOPO.recusas.push({ id: m.id, numero: p.numero || null,
          sku: p.sku || null, processo: p.processo || null, qtd: p.qtd ?? null });
        /* A · só some o que NASCEU dentro do escopo. Pedido que já estava na
           tela quando a importação começou fica onde está — sem foto do
           servidor ou com ela. A recusa de ENVIAR continua valendo para os
           dois: nada sai pelo fio durante uma importação. */
        if (IMPORTACAO_ESCOPO.jaExistiam && IMPORTACAO_ESCOPO.jaExistiam.has(m.id)) {
          IMPORTACAO_ESCOPO.preservados.push(m.id);
          continue;
        }
        const i = pedidos.indexOf(p);
        if (i >= 0) pedidos.splice(i, 1);
        continue;
      }
      const item = Object.assign({}, p, {
        extra: Object.assign({}, p.extra || {},
          telaEnsaioLigado() ? { ensaio: true } : {}, { numeroSugerido: p.numero || null }),
      });
      delete item.numero; delete item.revision;
      const { linha } = paraServidor(item, { permitidos: PED_CRIAVEIS, proibidos: PED_PROIBIDOS_NA_CRIACAO });
      /* v8.27 · "sem foto" NÃO quer dizer "não existe".
         Com 1.593 pedidos, a listagem parava no teto de 1.000 do PostgREST e
         593 pedidos ficavam sem foto — o 2304 entre eles. A intenção virava
         CRIAÇÃO de um pedido que já existia, o servidor recusava com 400, e a
         alteração da pessoa não ia para lugar nenhum.
         A intenção sai daqui já carregando o que ela seria SE o pedido
         existir: o patch desta ação e a base contra a qual ele foi tirado.
         Quem confirma por id é `telaEnviarIntencoes`, que é async — o gancho
         da v8.26 continua igual, síncrono e antes do miolo. */
      const patchSeExistir = m.patch || (PCP_ANTES.get(m.id) ? diferenca(PCP_ANTES.get(m.id), p) : null);
      criadas.push(obEnfileirar("pedido_criar", m.id, { p_pedidos: [linha] }, {
        confirmarPorId: true,
        eraConhecido: !m.novo,
        patchSeExistir: patchSeExistir && Object.keys(patchSeExistir).length ? patchSeExistir : null,
      }).opId);
      continue;
    }
    if (telaTravaDoEnsaio() && !foto.ensaio) continue;

    const patch = m.patch || diferenca(foto.linha, p);
    if (!patch || !Object.keys(patch).length) continue;
    criadas.push(obEnfileirar("pedido_patch", m.id, {
      p_id: m.id, p_expected_revision: foto.revision, p_patch: patch }).opId);
  }
  /* a base avança JÁ — duas ações seguidas viram duas intenções diferentes,
     e não a mesma mandada duas vezes */
  if (criadas.length) telaMarcarBase(pedidos);
  return criadas;
}

/* ---------------------------------------------------------------------------
   v8.28 · QUEM MANDA NOS PEDIDOS É A TABELA
   ---------------------------------------------------------------------------
   Com `pedidos_linha_escrita` ligada, o documento do núcleo deixou de ser dono
   da lista de pedidos: ele é cópia. Duas consequências que custaram um susto na
   Jéssica ao criar um pedido:

     · um conflito do DOCUMENTO não pode mais virar a pergunta "qual versão
       apagar" — a resposta está no servidor, e perguntar é oferecer à pessoa
       duas formas de perder trabalho;
     · e recarregar do servidor não pode trocar `S.pedidos` só pelo documento:
       o pedido recém-criado está na TABELA e ainda não no documento, então
       ele sumia da tela mesmo estando gravado.

   Esta função junta os dois lados: a tabela manda nos pedidos que ela conhece,
   o que ainda tem intenção na fila continua como está na tela (senão a pessoa
   veria o valor voltar atrás), e o que só existe na tela permanece.
   --------------------------------------------------------------------------- */
async function telaReconciliarPedidos() {
  if (typeof telaLeDaTabela !== "function") return { status: "sem-camada" };
  if (!telaLeDaTabela() && !telaEscreveNaTabela()) return { status: "desligado" };
  const r = await pxListar();
  if (r.status !== "ok") return r;

  TELA_FOTO.clear();
  for (const p of r.pedidos) telaGuardar(p);

  const naTela = (typeof S !== "undefined" ? S.pedidos : []) || [];
  const meus = new Map();
  for (const x of naTela) if (x && x.id) meus.set(x.id, x);
  const esperando = new Set((typeof obLer === "function" ? obLer() : [])
    .filter((a) => a.estado !== "feita").map((a) => a.entidadeId));

  const junto = [];
  for (const p of r.pedidos) {
    const meu = meus.get(p.id);
    meus.delete(p.id);
    if (!meu) { junto.push(p); continue; }
    if (esperando.has(p.id)) { junto.push(meu); continue; }   /* ainda a caminho */
    /* a tabela manda nos campos que ela tem; o que só existe no documento
       (observação interna, por exemplo) continua no objeto da tela */
    const misto = Object.assign({}, meu);
    for (const k of Object.keys(p)) if (p[k] !== undefined) misto[k] = p[k];
    junto.push(misto);
  }
  /* o que só existe na tela fica: ou é criação a caminho, ou é algo que o
     documento tem e a tabela ainda não */
  for (const x of naTela) if (x && x.id && meus.has(x.id)) junto.push(x);

  S.pedidos = junto;
  if (typeof telaMarcarBase === "function") telaMarcarBase();
  if (typeof reancorarJanelaNoPedido === "function") reancorarJanelaNoPedido();
  /* `paginas` e `porPagina` viajam junto desde a v8.74: a abertura passou a
     chamar esta função no lugar de `telaCarregarPedidos`, e são elas a prova
     de que a leitura foi até o fim e não parou no teto de 1.000 do PostgREST —
     que é o desenho da falha do 2304. */
  return { status: "ok", quantos: junto.length, daTabela: r.pedidos.length,
           paginas: r.paginas, porPagina: r.porPagina };
}

/* ===========================================================================
   v8.99 · O FALSO CONFLITO DO PEDIDO CONSIGO MESMO
   ---------------------------------------------------------------------------
   Reproduzido na bancada (`testes/conflito-pedido-bancada.js`), uma pessoa,
   uma aba: pedido N gravado; criar N+1 e salvar um produto disparam
   `salvarTudo` que se cruzam. Cada `salvarTudo` chama esta função no
   `finally`, e ela NÃO tinha trava — rodavam duas, três ao mesmo tempo, cada
   uma com a sua cópia da fila. A mesma intenção velha de N (revisão esperada 5,
   servidor já em 6 por gravação desta aba) era reprocessada por todas, e cada
   uma criava o SEU reenvio, com id próprio e a mesma revisão esperada. Só um
   vence; os outros levam conflito — contra a gravação da própria aba.

   E o perdedor ia direto para a mensagem vermelha, sem conferir se o servidor
   já tinha o valor que ele queria. Quem escolhia o texto era a origem da
   revisão vencedora: o reenvio de merge automático não anotava a revisão como
   "minha" (→ "alterado por outra pessoa"); o envio normal e o reenvio de
   gravação minha anotavam (→ "tinha uma gravação sua mais nova"). Perdedores
   diferentes, origens diferentes: as duas mensagens juntas, no mesmo pedido.

   Quatro correções, nenhuma afrouxa a trava:
     1. UMA RODADA POR VEZ. Quem chega com envio em curso não abre outro: pede
        uma rodada a mais, que roda em seguida sobre a fila atualizada.
     2. A REVISÃO NUNCA ANDA PARA TRÁS. Resposta confirmada de um replay antigo
        (o servidor devolve o resultado guardado) não rebaixa foto, base nem a
        revisão do pedido. E TODA gravação aceita desta aba é anotada como
        minha — inclusive o reenvio de merge automático.
     3. OPERAÇÃO SATISFEITA NÃO É CONFLITO. Antes de virar problema, o conflito
        de um reenvio é conferido campo a campo: se o servidor já tem tudo o que
        a operação queria, ela sai da fila e ninguém é avisado. É a mesma regra
        da v8.74 (P4), que só valia para o primeiro conflito.
     4. UMA MENSAGEM POR PEDIDO. Se a rodada tem mais de um problema no mesmo
        pedido, sai uma — e nunca "outra pessoa" quando a prova diz que a
        versão do servidor é desta sessão.
   Conflito de verdade (outra pessoa, mesmo campo, valor diferente) continua
   vermelho e continua dizendo "outra pessoa".
   =========================================================================== */
let TELA_ENVIO_EM_CURSO = null;
let TELA_ENVIO_DE_NOVO = false;

/* 2 · aplica na tela a linha que o servidor confirmou, sem regredir.
   `minha` = resposta aceita de uma gravação DESTA aba. `base` = a base do diff
   também anda (o dreno da abertura não mexe nela, como antes). */
function telaAplicarRegistro(id, reg, opcoes) {
  const o = opcoes || {};
  if (!id || !reg) return false;
  const nova = reg.revision != null ? Number(reg.revision) : null;
  if (o.minha) {
    meuUidAprender(reg);
    if (nova != null) minhaRevisaoGuardar(id, nova);
  }
  const foto = TELA_FOTO.get(id);
  const conhecida = foto && foto.revision != null ? Number(foto.revision) : null;
  if (nova != null && conhecida != null && nova < conhecida) return false;   /* velha: não rebaixa */
  const app = paraApp(reg);
  const p = ((typeof S !== "undefined" ? S.pedidos : []) || []).find((x) => x && x.id === id);
  if (p) { if (app.revision != null) p.revision = app.revision; if (app.numero) p.numero = app.numero; }
  telaGuardar(app);
  if (o.base !== false) telaMarcarBaseDe(app);
  if (nova != null && o.eco !== false) rtMinha(id, nova);
  return true;
}

/* 3 · o servidor já tem, campo a campo, tudo o que esta operação queria? */
function telaOperacaoSatisfeita(patch, reg) {
  if (!patch || !reg) return false;
  const cols = Object.keys(patch);
  return cols.length > 0 && mgClassificar(null, patch, reg).jaIgual.length === cols.length;
}

/* Envia o que estiver na fila. Chamada em TODA saída de `salvarTudo`, e também
   na abertura do app. Nunca lança: quem chama está num `finally`.
   v8.99 · 1 · uma rodada por vez (ver o bloco acima). */
async function telaEnviarIntencoes() {
  if (typeof telaEscreveNaTabela !== "function" || !telaEscreveNaTabela()) return null;
  if (TELA_ENVIO_EM_CURSO) { TELA_ENVIO_DE_NOVO = true; return TELA_ENVIO_EM_CURSO; }
  TELA_ENVIO_EM_CURSO = (async () => {
    let saida = null;
    do {
      TELA_ENVIO_DE_NOVO = false;
      /* o dreno da abertura usa a mesma fila: não corre junto com ele */
      for (let i = 0; PX_DRENANDO && i < 600; i++) await new Promise((r) => setTimeout(r, 50));
      const s = await telaEnviarIntencoesUmaRodada();
      if (s) saida = s;
    } while (TELA_ENVIO_DE_NOVO);
    return saida;
  })();
  try { return await TELA_ENVIO_EM_CURSO; }
  finally { TELA_ENVIO_EM_CURSO = null; }
}

async function telaEnviarIntencoesUmaRodada() {
  const pendentes = obPendentes();
  if (!pendentes.length) return null;
  const resultados = [], problemas = [];
  try {
    for (const acaoOriginal of pendentes) {
      let acao = acaoOriginal;

      /* --- v8.27 · CONFIRMAÇÃO POR ID ANTES DE CRIAR ---------------------
         Nenhuma criação sai daqui sem que o servidor tenha dito, naquele
         instante, que o id não existe. Se existir, isto era uma ALTERAÇÃO:
         a foto que faltava é preenchida com a linha de verdade e a intenção
         é reemitida como `pedido_patch`, com id de operação NOVO e a revisão
         que o servidor acabou de informar.
         Se a consulta não puder ser feita (rede, sessão), a intenção FICA na
         fila, parada e explícita. Nunca se cria no escuro. */
      if (acao.tipo === "pedido_criar" && acao.confirmarPorId && acao.entidadeId) {
        const conf = await pxPorId(acao.entidadeId);
        if (conf.status === "ok" && conf.pedido) {
          telaGuardar(conf.pedido);                       /* a foto que faltava */
          const base = paraServidor(conf.pedido, { permitidos: PED_EDITAVEIS }).linha;
          const patch = acao.patchSeExistir
            || (() => { const pp = ((typeof S !== "undefined" ? S.pedidos : []) || [])
                  .find((x) => x && x.id === acao.entidadeId);
                return pp ? diferenca(base, pp) : null; })();
          if (!patch || !Object.keys(patch).length) {
            /* já está como a pessoa quer: não há o que mandar */
            obAtualizar(acao.opId, { estado: "parada", ultimoErro: "ja-existe-sem-mudanca" });
            resultados.push({ id: acao.entidadeId, acao: "pedido_criar", opId: acao.opId,
              campos: null, resposta: { status: "ja-existe", texto: "o pedido já existe no servidor e está igual" } });
            continue;
          }
          acao = obNovaIntencao(Object.assign({}, acao, { tipo: "pedido_patch" }), {
            p_id: acao.entidadeId,
            p_expected_revision: conf.pedido.revision,
            p_patch: patch });
          obAtualizar(acao.opId, { confirmarPorId: false, virouPatch: true,
            criacaoRecusadaPorque: "o pedido já existia no servidor" });
        } else if (conf.status !== "nao-achei") {
          /* não deu para conferir: não cria, não descarta, não mente */
          obAtualizar(acao.opId, { estado: "parada", ultimoErro: "sem-confirmacao",
            erroMsg: String(conf.msg || conf.status || "").slice(0, 300) });
          problemas.push({ id: acao.entidadeId, acao: acao.tipo, opId: acao.opId,
            campos: null, resposta: { status: "sem-confirmacao", motivo: conf.status } });
          continue;
        }
      }

      const r = await pxEnviar(acao);
      const item = { id: acao.entidadeId, acao: acao.tipo, opId: acao.opId,
        campos: acao.dados && acao.dados.p_patch ? Object.keys(acao.dados.p_patch) : null, resposta: r };
      /* CONFLITO com campos que não se cruzam: junta e reenvia, com id NOVO.
         Isso acontece o tempo todo em duas ações seguidas no mesmo pedido — a
         segunda saiu com a revisão de antes de a primeira ter sido aceita. Sem
         este reenvio a pessoa levava um conflito consigo mesma. */
      if (r.status === "conflito" && r.registro && acao.dados && acao.dados.p_patch) {
        const base = (TELA_FOTO.get(acao.entidadeId) || {}).linha || {};
        const v = mgClassificar(base, acao.dados.p_patch, r.registro);
        /* -------------------------------------------------------------------
           v8.74 · P4 · O SERVIDOR JÁ ESTÁ COMO EU QUERO — ISSO NÃO É DISPUTA.
           A revisão andou, sim; mas `mgClassificar` pôs TODOS os campos do meu
           patch em `jaIgual`: o valor que eu quero gravar é, campo por campo,
           exatamente o que a linha já tem. Não há nada a decidir e não há nada
           a mandar.

           Antes, este caso caía no `problemas` e virava a mensagem vermelha —
           é o cenário "duas pessoas digitaram o mesmo número".

           A trava NÃO é afrouxada: quem decidiu que não há disputa foi a
           comparação VALOR A VALOR contra o registro que o servidor devolveu
           junto com o conflito, não a revisão. Valores diferentes continuam
           indo para a pessoa, em `disputados`.
           ------------------------------------------------------------------- */
        if (v.nadaAFazer) {
          /* a foto e a base passam a dizer a verdade — sem regredir (v8.99) */
          telaAplicarRegistro(acao.entidadeId, r.registro, { minha: false });
          obRemover(acao.opId);              /* a intenção está satisfeita */
          item.resposta = { status: "ok", jaEstava: true, campos: v.jaIgual,
            revision: r.registro.revision, registro: r.registro };
          resultados.push(item);
          continue;                          /* NÃO entra em `problemas` */
        }
        /* -------------------------------------------------------------------
           v8.78 · A VERSÃO DO SERVIDOR É MINHA — ENTÃO NÃO É "OUTRA PESSOA".
           O caso que a Ana trouxe: criar o pedido, imprimir o canhoto (o app
           avança papel→aberto e grava), abrir Editar e salvar. Os campos se
           cruzam, `disputados` enche, e a mensagem vermelha acusava outra
           pessoa em cima de uma gravação da própria pessoa.

           A prova é `updated_by`: a linha que o servidor devolveu junto com o
           conflito foi escrita pelo MEU uid. Não há trabalho de terceiro para
           perder — a minha intenção mais NOVA passa por cima da minha mais
           VELHA, que é o que a pessoa espera de si mesma.

           A trava não é afrouxada: `updated_by` de outra pessoa continua indo
           para `problemas`, com a mensagem, como antes. E o reenvio é UM só —
           se o servidor recusar de novo, vira problema normal.
           ------------------------------------------------------------------- */
        if (v.disputados.length && gravacaoEhMinha(r.registro, acao.entidadeId)) {
          /* a foto e a base passam a ser as do servidor (sem regredir, v8.99) */
          telaAplicarRegistro(acao.entidadeId, r.registro, { minha: false, eco: false });
          const nova = obNovaIntencao(acao, Object.assign({}, acao.dados, {
            p_expected_revision: r.registro.revision, p_patch: acao.dados.p_patch }));
          const r3 = await pxEnviar(nova);
          item.resposta = r3; item.reenviada = nova.opId; item.eraMinha = true;
          resultados.push(item);
          if (r3.status === "ok") {
            const reg3 = r3.registro || (r3.criados && r3.criados[0]);
            telaAplicarRegistro(acao.entidadeId, reg3, { minha: true });
          } else if (r3.status === "conflito" && telaOperacaoSatisfeita(acao.dados.p_patch, r3.registro)) {
            /* v8.99 · 3 · o servidor já tem o que eu queria: satisfeita */
            telaAplicarRegistro(acao.entidadeId, r3.registro, { minha: false });
            obRemover(nova.opId);
            item.resposta = { status: "ok", jaEstava: true, revision: r3.registro.revision, registro: r3.registro };
          } else problemas.push(item);
          continue;
        }
        if (v.podeSozinho && Object.keys(v.automatico).length) {
          /* só a foto, como antes — e sem regredir (v8.99). A base NÃO anda aqui:
             o objeto da tela ainda não tem os campos da outra gravação, e uma base
             "do servidor" faria a próxima intenção devolvê-los ao valor velho. */
          const fotoR = TELA_FOTO.get(acao.entidadeId);
          if (!(fotoR && Number(fotoR.revision) > Number(r.registro.revision))) telaGuardar(paraApp(r.registro));
          const nova = obNovaIntencao(acao, Object.assign({}, acao.dados, {
            p_expected_revision: r.registro.revision, p_patch: v.automatico }));
          const r2 = await pxEnviar(nova);
          item.resposta = r2; item.reenviada = nova.opId;
          resultados.push(item);
          if (r2.status === "ok") {
            /* v8.99 · 2 · a revisão que ESTA aba gravou é minha — antes não era
               anotada, e o conflito seguinte contra ela dizia "outra pessoa" */
            const reg2 = r2.registro || (r2.criados && r2.criados[0]);
            telaAplicarRegistro(acao.entidadeId, reg2, { minha: true, base: false });
          } else if (r2.status === "conflito" && telaOperacaoSatisfeita(v.automatico, r2.registro)) {
            /* v8.99 · 3 · o servidor já tem o que eu queria: satisfeita */
            const fotoS = TELA_FOTO.get(acao.entidadeId);
            if (!(fotoS && Number(fotoS.revision) > Number(r2.registro.revision))) telaGuardar(paraApp(r2.registro));
            obRemover(nova.opId);
            item.resposta = { status: "ok", jaEstava: true, revision: r2.registro.revision, registro: r2.registro };
          } else problemas.push(item);
          continue;
        }
      }
      resultados.push(item);
      if (r.status !== "ok") problemas.push(item);
      /* ---------------------------------------------------------------
         O CADERNO DOS CONFLITOS (v8.78) · diagnóstico, sem UI nova.
         A mensagem vermelha some da tela e leva junto a única chance de
         saber por que ela apareceu. Aqui fica o registro: quem assinou a
         versão do servidor, em que revisão eu estava, em que revisão ele
         estava, e se essa revisão saiu desta sessão.
         No console:  PED_CONFLITOS
         --------------------------------------------------------------- */
      if (r.status === "conflito") {
        try {
          const fotoC = TELA_FOTO.get(acao.entidadeId) || {};
          PED_CONFLITOS.push({
            quando: new Date().toISOString(),
            numero: (r.registro && r.registro.numero) || (fotoC.linha || {}).numero || acao.entidadeId,
            campos: (acao.dados && acao.dados.p_patch) ? Object.keys(acao.dados.p_patch) : null,
            minhaRevisao: acao.dados && acao.dados.p_expected_revision,
            revisaoDaFoto: fotoC.revision,
            revisaoDoServidor: r.registro && r.registro.revision,
            updatedBy: r.registro && r.registro.updated_by,
            updatedAt: r.registro && r.registro.updated_at,
            ultimaOperacao: r.registro && r.registro.ultima_operacao,
            meuUid: meuUid(),
            ehMinha: gravacaoEhMinha(r.registro, acao.entidadeId),
            reviSaiuDestaSessao: minhaRevisao(acao.entidadeId, r.registro && r.registro.revision),
          });
          if (PED_CONFLITOS.length > 200) PED_CONFLITOS.splice(0, PED_CONFLITOS.length - 200);
        } catch (e) {}
      }
      if (r.status === "offline" || r.status === "sem-login") break;   /* sem rede: para */
      if (r.status === "ok" && acao.entidadeId) {
        /* v8.78 · a base do diff também avança com a resposta confirmada: sem
           isto a próxima edição compara contra uma versão já vencida. E é aqui
           que o servidor me ensina o meu próprio uid.
           v8.99 · 2 · sem regredir: o `ok` de um replay devolve o resultado
           GUARDADO, que pode ser mais velho do que a foto já sabe. */
        const reg = r.registro || (r.criados && r.criados[0]);
        if (reg) telaAplicarRegistro(acao.entidadeId, reg, { minha: true });
      }
    }
  } catch (e) {
    problemas.push({ acao: "envio", resposta: { status: "erro", msg: String((e && e.message) || e) } });
  }
  const saida = { status: problemas.length ? "com-problema" : "ok", resultados, problemas };
  PCP_ENSAIO_ULTIMO = saida;
  if (problemas.length) {
    const desfez = telaDesfazerNaoConfirmados(saida);
    /* v8.99 · 4 · uma mensagem por pedido e situação. Entre conflitos do mesmo
       pedido, vale o que tem prova de ser desta sessão — nunca os dois textos. */
    const avisar = [], porChave = new Map();
    for (const pr of problemas) {
      const st = pr.resposta && pr.resposta.status;
      const chave = pr.id ? pr.id + "|" + st : null;
      if (!chave) { avisar.push(pr); continue; }
      const ja = porChave.get(chave);
      if (!ja) { porChave.set(chave, pr); avisar.push(pr); continue; }
      const eMinha = (x) => !!(x.resposta && x.resposta.registro && gravacaoEhMinha(x.resposta.registro, x.id));
      if (st === "conflito" && eMinha(pr) && !eMinha(ja)) { avisar[avisar.indexOf(ja)] = pr; porChave.set(chave, pr); }
    }
    for (const pr of avisar) {
      const st = pr.resposta && pr.resposta.status;
      try { toast(telaTextoDoProblema(pr), st === "offline" ? "" : "erro"); } catch (e) {}
    }
    if (desfez.desfeitos) { try { render(); } catch (e) {} }
  }
  return saida;
}
