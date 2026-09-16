/* ---------- boot ---------- */
(async function boot() {
  /* ---------- O PORTÃO, ANTES DE TUDO ----------
     Isto é a primeira coisa do boot, e não a última, porque a regra é "sessão
     em aal1 nunca abre o PCP direto". Se a decisão chegasse depois do
     `render()`, a tela do app apareceria por um instante — e um instante é
     tempo suficiente para clicar.

     A conferência é assíncrona; o boot NÃO espera por ela. O que segura a tela
     é `S.mfaGate`, marcado aqui de forma síncrona: enquanto houver sessão
     guardada e esta abertura ainda não tiver confirmado, o `render()` mostra o
     portão, nunca o app. Quando a resposta chega, um `render()` troca a tela. */
  try {
    if (typeof mfaConferirAbertura === "function"
        && temJanelaReal && SUPA_URL && supaSessao()?.access) {
      S.mfaGate = mfaAberturaAutorizada() ? "livre" : "checando";
      if (S.mfaGate !== "livre") {
        mfaConferirAbertura().catch(() => { S.mfaGate = "erro";
          S.mfaGateErro = "Não foi possível confirmar sua identidade. Tente novamente."; })
          /* Só redesenha se o app JÁ terminou de abrir. Redesenhar no meio do
             boot custou caro: a bateria `contrato-gravacao` acusou a seção
             `equipe` presa "só neste navegador" porque um render prematuro
             disparava a gravação de fundo antes de `sondarCamada()` decidir
             onde gravar. O portão não pode atropelar a abertura — quando ele
             resolve antes, quem desenha é o `render()` do fim do boot, que já
             lê o estado certo. */
          .then(() => { try { if (S.pronto) render(); } catch {} });
      }
    }
  } catch (e) { try { console.error("MFA · portão da abertura:", e); } catch {} }
  try {
    /* a marca vem antes dos dados: se algo falhar no meio, ela já está lá */
    if (MODO_TESTE) {
      try {
        document.body.setAttribute("data-teste", "1");
        document.title = "[TESTE] " + document.title;
      } catch {}
    }
    await sondarCamada();
    /* Eventos e histórico NÃO entram aqui: juntos passam de meio megabyte e só
       aparecem na aba Histórico. Vêm sob demanda, quando ela é aberta. */
    const [nucleo, produtos, estoque, cad, cfg, equipe, ins, fest, smi] = await Promise.all(
      [DOCS.nucleo, DOCS.produtos, DOCS.estoque, DOCS.cad, DOCS.cfg, DOCS.equipe, DOCS.insumos, DOCS.festivas, DOCS.semi].map(lerDoc));
    S.insumos = ins?.insumos || []; S.movInsumo = ins?.movs || []; S.entradas = ins?.entradas || [];
    S.posse = ins?.posse || []; S.bens = ins?.bens || []; S.posseItens = ins?.posseItens || [];
    /* fora do `if (nucleo || produtos || estoque)` de propósito: a aba Datas
       Festivas precisa abrir mesmo em base vazia, para montar a primeira campanha */
    S.festivas = { campanhas: fest?.campanhas || [] };
    /* pelo mesmo motivo das campanhas: Semiacabados precisa abrir em base vazia,
       para a fábrica cadastrar o primeiro código antes de existir qualquer pedido */
    S.semiTipos = smi?.tipos || []; S.remessas = smi?.remessas || []; S.semiAjustes = smi?.ajustes || [];
    esquecerSaldos();
    const hist = null;
    S.hist = hist || { serie: [] };
    S.sessao = lerSessao();
    /* na cópia de teste gravar no navegador é a regra, não defeito — este aviso
       vermelho dizia que algo estava quebrado justamente quando estava certo */
    if (!MODO_TESTE && temJanelaReal && SUPA_URL && supaSessao()?.access && CAMADA !== "supabase") {
      supaDiagnostico().then((d) => toast(`Você está logada no servidor, mas o app está gravando no navegador. Motivo: ${d.msg}`, "erro"));
    }
    S.carimboVisto = new Date().toISOString();
    ligarPresenca();   /* a partir daqui o app sabe dizer quem mais está aqui dentro */
    /* Mestre existe mas o documento não remonta = gravação interrompida ou sem espaço.
       Esta conferência fazia OITO idas ao servidor em fila, uma esperando a outra,
       depois de os documentos já terem sido baixados — a 100ms de latência, quase
       um segundo de espera só para verificar. Agora vão todas juntas, e as seções
       que nem foram carregadas neste boot (eventos e histórico) ficam de fora:
       antes elas eram comparadas com o valor de `equipe`, o que podia acusar
       corrupção onde não havia. */
    const carregados = { nucleo, produtos, estoque, cad, cfg, equipe };
    const secs = Object.keys(carregados);
    const brutos = await Promise.all(secs.map((sec) => getBruto(DOCS[sec])));
    S.storageCorrompido = secs.filter((sec, i) =>
      brutos[i] != null && brutos[i] !== "null" && carregados[sec] == null);
    if (nucleo || produtos || estoque) {
      S.produtos = produtos || [];
      S.estoque = estoque || null;
      S.cad = cad || { prestadoras: [], estruturas: [] };
      S.cfg = { ...CFG_PADRAO, ...(cfg || {}), padroes: { ...CFG_PADRAO.padroes, ...((cfg || {}).padroes || {}) } };
      S.equipe = equipe || [];
      S.ops = nucleo?.ops || []; S.pedidos = nucleo?.pedidos || []; S.analises = nucleo?.analises || [];
      S.eventos = nucleo?.eventos || [];   /* bases antigas: os eventos vinham no núcleo */
      S.faltas = nucleo?.faltas || [];
      S.ops.forEach(recalcularOP);
      /* a foto do dia só pode ser tirada DEPOIS de os dados estarem na memória.
         Chamada lá em cima, antes destas atribuições, ela batia na própria
         guarda ("sem pedidos e sem produtos, não faz foto") e voltava sem fazer
         nada — a rede de segurança que o app promete nunca existiu. */
      pontoCriarSePrecisar().then(() => pontosListar()).then((ps) => { S.pontosCache = ps; if (S.aba === "dados") render(); });
      const nEsp = migrarEspelhosCola();
      if (nEsp) setTimeout(() => { salvarTudo("nucleo");
        toast(`${n0(nEsp)} ${nEsp === 1 ? "pedido de continuação corrigido" : "pedidos de continuação corrigidos"}: voltaram ao processo do produto, com as etapas que faltavam.`); }, 1200);
      /* remessas da numeração antiga entram na sequência dos pedidos. Só aqui,
         depois de S.pedidos estar na memória — antes disso o "próximo livre"
         seria calculado sobre uma lista vazia e colidiria com pedidos reais. */
      const nRem = migrarNumerosRemessa();
      if (nRem) setTimeout(() => { salvarTudo("semi");
        toast(`${n0(nRem)} ${nRem === 1 ? "remessa passou" : "remessas passaram"} a ter número da mesma sequência dos pedidos. O número antigo ficou guardado em cada uma.`); }, 1600);
      const nConf = migrarRemessasParaConferencia();
      if (nConf && !nRem) setTimeout(() => salvarTudo("semi"), 1800);
      /* corrige o CADASTRO, não só a exibição: a lista e o valor gravado dentro
         de cada produto. Sem a segunda parte, `9X9` continuaria nos produtos e o
         seletor deles abriria sem nada selecionado. */
      const mEmb = migrarEmbalagens();
      if (mEmb.listas || mEmb.prods) setTimeout(() => { salvarTudo("cad", "produtos");
        const partes = [];
        if (mEmb.tamanhosAntes !== mEmb.tamanhosDepois) partes.push(`${n0(mEmb.tamanhosAntes - mEmb.tamanhosDepois)} tamanho${mEmb.tamanhosAntes - mEmb.tamanhosDepois === 1 ? "" : "s"} repetido${mEmb.tamanhosAntes - mEmb.tamanhosDepois === 1 ? "" : "s"} juntado${mEmb.tamanhosAntes - mEmb.tamanhosDepois === 1 ? "" : "s"}`);
        if (mEmb.prods) partes.push(`${n0(mEmb.prods)} produto${mEmb.prods === 1 ? "" : "s"} com a embalagem padronizada`);
        toast(`Embalagens organizadas: ${partes.length ? partes.join(" · ") : "lista em ordem numérica"}. 9X9 e 9x9 passam a ser a mesma coisa.`); }, 2000);
      /* padrões antigos viram funções da pessoa: agora a informação mora num lugar só.
         Quem recebe a tarefa passa a ser a primeira da lista da Equipe que tem a
         função — e isso pode mudar em relação à ordem antiga, então avisa. */
      const nPad = migrarPadroesParaFuncoes();
      if (nPad) setTimeout(() => { salvarTudo("equipe", "cfg");
        toast(`Os responsáveis padrão viraram funções da pessoa (${n0(nPad)} ${nPad === 1 ? "marcada" : "marcadas"}). Quem recebe a tarefa é a primeira da lista da Equipe que tem a função — confira em Equipe.`); }, 1800);
      else if (S.cfg.padroesMigrados !== true) { S.cfg.padroesMigrados = true; }
    } else {
      /* formato pcp4 (chave única) de uma versão intermediária */
      const j4 = await get("pcp4");
      if (j4 && typeof j4 === "object" && (j4.produtos || j4.pedidos)) {
        S.produtos = j4.produtos || []; S.ops = j4.ops || []; S.pedidos = j4.pedidos || [];
        S.analises = j4.analises || []; S.estoque = j4.estoque || null;
        S.cad = j4.cad || { prestadoras: [], estruturas: [] };
        S.cfg = { ...CFG_PADRAO, ...(j4.cfg || {}), padroes: { ...CFG_PADRAO.padroes, ...((j4.cfg || {}).padroes || {}) } };
        S.equipe = j4.equipe || []; S.eventos = j4.eventos || []; S.faltas = j4.faltas || [];
        S.ops.forEach(recalcularOP);
        await salvarCompleto();
      } else {
        /* versões antigas em várias chaves */
        const [produtosL, ops4, pedidos4, opsV3, remessasV3, pedidosPlan, analises, estoqueL, cadL, cfgL, equipeL, faltasL] =
          await Promise.all([get("pcp:produtos"), get("pcp:ops4"), get("pcp:pedidos4"), get("pcp:ops"), get("pcp:remessas"),
            get("pcp:pedidos"), get("pcp:analises"), get("pcp:estoque"), get("pcp:cadastros"), get("pcp:config"),
            get("pcp:equipe"), get("pcp:faltas")]);
        const achouAlgo = produtosL || estoqueL || ops4 || opsV3 || pedidosPlan;
        if (achouAlgo) {
          S.produtos = produtosL || [];
          S.analises = analises || [];
          S.estoque = estoqueL || null;
          S.cad = cadL || { prestadoras: [], estruturas: [] };
          S.cfg = { ...CFG_PADRAO, ...(cfgL || {}), padroes: { ...CFG_PADRAO.padroes, ...((cfgL || {}).padroes || {}) } };
          S.equipe = equipeL || []; S.eventos = []; S.faltas = faltasL || [];
          if (Array.isArray(ops4) && Array.isArray(pedidos4) && ops4.length) {
            S.ops = ops4; S.pedidos = pedidos4;
          } else if (Array.isArray(opsV3) && Array.isArray(remessasV3) && opsV3.length) {
            const mig = migrarV3(opsV3, remessasV3);
            S.ops = mig.ops; S.pedidos = mig.pedidos;
          } else if (Array.isArray(pedidosPlan) && pedidosPlan.length && pedidosPlan[0] && pedidosPlan[0].opId === undefined) {
            const mig = migrarPlanilha(pedidosPlan);
            S.ops = mig.ops; S.pedidos = mig.pedidos;
            if (!S.analises.length) S.analises = [mig.analise];
          }
          S.ops.forEach(recalcularOP);
          await salvarCompleto();
        }
      }
    }
  } catch (err) { console.error(err); sentryAvisar(err, "abertura · migrações"); }
  if (!Array.isArray(S.cad.bonus) || !S.cad.bonus.length) S.cad.bonus = JSON.parse(JSON.stringify(BONUS_PADRAO));
  if (!Array.isArray(S.cad.mesesFechados)) S.cad.mesesFechados = [];
  /* a planilha gravava só "Julho"; aqui vira "JULHO 2026", com o ano tirado da data de retorno */
  for (const r of S.pedidos) {
    if (!r.mesPagamento) continue;
    const c2 = normalizarComp(r.mesPagamento, r.retornadaEm);
    if (c2 && c2 !== r.mesPagamento) r.mesPagamento = c2;
  }
  S.cfg.padroes = S.cfg.padroes || {};
  for (const [fid] of FUNCOES) {
    const v = S.cfg.padroes[fid];
    S.cfg.padroes[fid] = Array.isArray(v) ? v.filter(Boolean) : v ? [v] : [];
  }
  /* prioridades: dados de versões com 3 níveis sobem um degrau (P1→P1 novo, abre espaço p/ Urgente) */
  if (!S.cfg.escala4 && (S.ops.length || S.pedidos.length)) {
    remapEscala4();
    salvarTudo("nucleo", "cfg");
  } else if (!S.cfg.escala4) { S.cfg.escala4 = true; }
  /* setores: garante os quatro padrão na primeira vez e as pessoas responsáveis na equipe */
  if (!Array.isArray(S.cad.setores) || !S.cad.setores.length) {
    S.cad.setores = JSON.parse(JSON.stringify(SETORES_PADRAO));
    let mudouEquipe = false;
    for (const st of S.cad.setores) {
      if (st.responsavel && !S.equipe.some((p) => p.nome.toLowerCase() === st.responsavel.toLowerCase())) {
        S.equipe.push({ id: uid(), nome: st.responsavel, ativo: true, funcoes: ["separar", "enviar"] });
        mudouEquipe = true;
      }
    }
    if (S.produtos.length || S.pedidos.length) salvarTudo("cad", ...(mudouEquipe ? ["equipe"] : []));
  }
  /* ---------------------------------------------------------------------
     A MARCA D'ÁGUA DO NÚMERO · semeada na abertura, antes de qualquer coisa
     poder sair da lista.
     Se um pedido for excluído hoje, ele some de `S.pedidos` — e o número dele
     sairia da conta de `proximoNumeroPedido()` junto. Semear aqui garante que o
     maior número JÁ VISTO fique gravado enquanto ele ainda está visível.
     --------------------------------------------------------------------- */
  try {
    for (const r of S.pedidos) numeroMarcarUsado(r.numero);
    for (const r of (S.remessas || [])) numeroMarcarUsado(r.numero);
  } catch (e) { console.error("marca d'água do número:", e); }
  /* ABAS (v8.62 · etapa 4). Depois de `restaurarAba()`, porque a aba guardada
     pelo caminho antigo continua valendo para quem não tem aba nenhuma; e
     depois de os pedidos estarem carregados, senão uma aba de registro não
     acharia o pedido dela e seria descartada por engano. */
  S.pronto = true;
  try { restaurarAba(); } catch (e) { console.error(e); }
  try { if (typeof abasRestaurarDoNavegador === "function") {
    const r = abasRestaurarDoNavegador();
    if (r && r.status === "ok") console.info("abas restauradas:", r.abas, "· com rascunho:", r.comRascunho);
  } } catch (e) { console.error("abas:", e); }
  /* Sair da página guarda o que está digitado AGORA — sem isto, digitar e dar
     F5 na sequência perderia o rascunho, que é justamente o caso que a
     restauração existe para cobrir. */
  try { window.addEventListener("beforeunload", () => {
    try { if (typeof abasGuardarNoNavegador === "function") abasGuardarNoNavegador(); } catch {} }); } catch (e) {}
  try { ligarLeitor(); } catch (e) { console.error(e); }
  try { ligarSincronia(); } catch (e) { console.error(e); }
  try { conferirVersao(); } catch (e) { console.error(e); }
  /* A RESERVA DE IDS DE PRODUTO tem gancho PRÓPRIO, aqui, e não dentro de
     `telaAbrir()`. Lá ela ficava atrás de `if (!sessao) return` — e quando a
     validação do login demora um segundo a mais que a abertura, `telaAbrir`
     sai cedo e nada depois dela roda. Assunto de Produtos não pode depender do
     portão de sessão de Pedidos; é a mesma lição da v8.37 com os cadastros. */
  try { if (typeof prodBootAbastecer === "function") prodBootAbastecer(); }
  catch (e) { console.error("reserva de ids:", e); }
  /* recado deixado antes de recarregar: diz se a troca de versão deu certo */
  try {
    const zer = JSON.parse(localStorage.getItem("pcp:zerado") || "null");
    if (zer) { localStorage.removeItem("pcp:zerado");
      setTimeout(() => toast(`Base zerada — ${n0(zer.n)} registros apagados. Comece importando o .xlsm no passo 3.`), 700); }
    const rec = JSON.parse(localStorage.getItem("pcp:atualizando") || "null");
    if (rec && Date.now() - rec.em < 120000) {
      localStorage.removeItem("pcp:atualizando");
      setTimeout(() => {
        if (versaoNum(VERSAO) > versaoNum(rec.de)) toast(`Atualizado: da versão ${rec.de} para a ${VERSAO}.`);
        else if (rec.para && versaoNum(rec.para) > versaoNum(VERSAO))
          toast(`Ainda na versão ${VERSAO} — o navegador insistiu na cópia guardada. Tente de novo em instantes, ou feche e reabra a aba.`, "erro");
        else toast(`Você está na versão ${VERSAO}, a mais recente publicada.`);
      }, 700);
    } else if (rec) localStorage.removeItem("pcp:atualizando");
  } catch {}
  /* ---------- v8.23 · a abertura da camada de Pedidos ----------
     Ela lê as flags DO SERVIDOR (`pcp_flag`), destrava a fila que ficou de uma
     sessão anterior, confere a sessão ANTES de drenar, e só então carrega os
     pedidos da fonte nova — se e somente se as flags mandarem.

     Esta chamada faltava, e é por isso que o cutover falhou: `telaAbrir()`
     existia desde a v8.19 e ninguém a chamava. As baterias chamavam por conta
     própria e por isso davam verde — mediam um estado que só o teste produzia.

     Roda DEPOIS do `render()` e sem `await`: a tela não pode esperar o servidor
     para aparecer. Se falhar, o app continua no caminho antigo, que é o
     comportamento seguro. Ela mesma se protege por dentro; o try aqui é para o
     caso de ela nem existir (arquivo removido de uma montagem).

     Quando ela terminar, um `render()` mostra o que veio da fonte nova. */
  try { render(); }
  catch (err) {
    console.error(err);
    /* v8.88 · a tela de "o app tropeçou" continua igual, logo abaixo. */
    sentryAvisar(err, "abertura · primeiro render");
    const app = document.getElementById("app") || document.querySelector("#app");
    if (app) app.innerHTML = '<div style="max-width:640px;margin:60px auto;padding:24px;font-family:sans-serif">' +
      '<h2 style="color:var(--perigo)">O app tropeçou ao montar a tela</h2>' +
      '<p>Tire um print desta mensagem e me mande:</p>' +
      '<pre style="white-space:pre-wrap;background:var(--perigo-fundo);padding:14px;border-radius:8px;font-size:12px">' +
      String(err && err.stack || err).replace(/</g, "&lt;") + "</pre></div>";
  }

  try {
    if (typeof telaAbrir === "function") {
      PCP_ABERTURA = telaAbrir().then((r) => {
        PCP_ABERTURA_RESULTADO = r;
        /* só redesenha se a fonte nova realmente entrou em cena — um render a
           mais com a tela já pronta é piscada à toa */
        const trocouCadastro = !!(r && Array.isArray(r.cadAplicou)
          && r.cadAplicou.some((x) => x && x.aplicado));
        if ((r && r.status === "ok" && r.le) || trocouCadastro) { try { render(); } catch {} }
        /* O CONTADOR OFICIAL DO CICLO, e só AQUI.
           Ele estava sendo lido antes de `telaAbrir()`, que é quem carrega as
           flags do servidor — então `telaLeDaTabela()` ainda respondia "não" e
           a leitura desistia calada. A bateria pegou: `PED_CICLO` voltava nulo
           depois do F5. Perguntar antes de saber a quem perguntar é o mesmo
           que não perguntar. */
        try { if (typeof pedCarregarCiclo === "function") pedCarregarCiclo().catch(() => {}); }
        catch (e) { console.error("contador do ciclo:", e); }
        return r;
      }).catch((e) => {
        PCP_ABERTURA_RESULTADO = { status: "erro", msg: String((e && e.message) || e) };
        return PCP_ABERTURA_RESULTADO;
      });
    } else {
      PCP_ABERTURA_RESULTADO = { status: "sem-camada" };
      PCP_ABERTURA = Promise.resolve(PCP_ABERTURA_RESULTADO);
    }
  } catch (e) {
    PCP_ABERTURA_RESULTADO = { status: "erro", msg: String((e && e.message) || e) };
    PCP_ABERTURA = Promise.resolve(PCP_ABERTURA_RESULTADO);
  }
})();

/* O que a abertura respondeu, à mão para a tela (e para a bateria) — sem
   precisar de um canal novo. `PCP_ABERTURA` é a promessa; quem precisa esperar
   espera nela, em vez de dormir um tempo arbitrário. */
var PCP_ABERTURA = null, PCP_ABERTURA_RESULTADO = null;




/* Tabela de roteamento das ações. É montada a partir do PRÓPRIO código de cada
   grupo, em vez de escrita à mão — assim uma ação nova entra sozinha e nunca fica
   fora da tabela, que foi o que aconteceu com "pick-catalogo". */
