/* ===========================================================================
   147_ensaio_app.js · os 13 passos do ensaio pelo CAMINHO REAL DO APP
   ---------------------------------------------------------------------------
   DIAGNÓSTICO PARA BRANCH/AMBIENTE DE TESTE.
   Não executar em produção sem aceitar resíduos permanentes.
   ---------------------------------------------------------------------------
   O 147_ensaio.sql não roda no SQL Editor porque a sessão de lá é service
   role: `auth.uid()` é nulo e `pcp_sou_da_casa()` responde falso. A guarda
   está certa e fica como está. Este arquivo é o outro caminho: as mesmas
   provas, chamadas por um usuário autenticado do PCP, com o token da sessão
   dele, passando por RLS e por `pcp_sou_da_casa()` de verdade.

   Nada aqui desliga RLS, forja `auth.uid()`, remove guarda ou usa service
   role. Ele usa `persRpc` (src/persistencia/servidor.js), que é exatamente a
   porta que o app usa para tudo.

   ---------------------------------------------------------------------------
   O QUE MUDA, E É IMPORTANTE

   No SQL, os 13 passos rodavam dentro de UMA transação que terminava em
   ROLLBACK: nada ficava. Pelo PostgREST, CADA chamada é uma transação própria
   e commitada na hora. Não existe rollback neste caminho.

   Então este ensaio DEIXA DADO NO BANCO, e parte dele não sai mais:

     · as fitas de ensaio  → `pcp_fita_apagar` responde `em-uso` enquanto a
       receita as referenciar; e mesmo quando apaga, é soft delete: a linha
       fica com deleted_at;
     · o projeto e a versão publicada → `pcp_projeto_corte_arquivar` só marca
       ativo=false; versão publicada é imutável por desenho;
     · o vínculo congelado → NÃO existe RPC que apague. É imutável de
       propósito: é a prova de que pedido antigo não muda retroativamente;
     · os registros em `pcp_operacao` → ficam, como os de qualquer operação.

   Consequência prática: depois de rodar isto, a guarda do rollback da 147
   passa a recusar o rollback para sempre — corretamente, porque passou a
   existir dado operacional.

   POR ISSO: rode preferencialmente num branch do Supabase ou num projeto de
   teste. Em produção, só com aceitação explícita, e o script exige que ela
   seja escrita.

   ---------------------------------------------------------------------------
   COMO RODAR

   1. abra o PCP publicado, logado com um usuário da casa
      (na cópia de teste não adianta: `persFetch` bloqueia escrita e devolve
       `copia-teste` — o script detecta e avisa);
   2. console do navegador, cole este arquivo inteiro;
   3. `await ensaio147App()`            → só mostra o plano e o que vai ficar;
   4. `await ensaio147App({ euAceitoOResiduo: true })`  → roda de verdade.

   A saída é uma tabela (console.table) com um passo por linha e a coluna `ok`,
   mais o inventário do que ficou no banco.
   =========================================================================== */

async function ensaio147App(opcoes) {
  const cfg = Object.assign({ euAceitoOResiduo: false, limpar: true }, opcoes || {});

  /* ids novos a cada execução: aqui não há rollback, então reaproveitar id
     faria a segunda rodada bater em dado da primeira e mentir o resultado. */
  const id8 = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())).slice(0, 8);
  const selo   = id8();
  const FITA   = `ft_ens_${selo}`;
  const FITA_B = `ft_ens_${selo}b`;
  const PROJ   = `prj_ens_${selo}`;
  const PED    = `ped_ens_${selo}`;
  const op = () => crypto.randomUUID();
  const opA = op(), opB = op(), opC = op(), opD = op(), opE = op(), opF = op(), opG = op();

  const passos = [];
  const reg = (n, passo, esperado, obtido, ok) =>
    passos.push({ n, passo, esperado, obtido: String(obtido).slice(0, 160), ok });

  /* ---- pré-requisitos, antes de escrever qualquer coisa ------------------ */
  if (typeof persRpc !== "function" || typeof persLer !== "function") {
    console.error("ensaio 147: rode dentro do PCP (persRpc/persLer não existem aqui).");
    return null;
  }
  if (typeof persToken === "function" && !persToken()) {
    console.error("ensaio 147: sem sessão. Entre no PCP antes.");
    return null;
  }
  if (typeof MODO_TESTE !== "undefined" && MODO_TESTE) {
    console.error("ensaio 147: esta é a cópia de teste — persFetch não envia escrita. "
                + "Rode no site publicado.");
    return null;
  }

  /* a 147 precisa estar aplicada: sem as RPCs, não há o que provar */
  const sonda = await persRpc("pcp_fita_salvar", { p_dados: {} });
  if (sonda.erro && sonda.erro.tipo === "ausente") {
    console.error("ensaio 147: as RPCs não existem neste banco. Aplique a migration 147 primeiro.");
    return null;
  }
  if (sonda.erro && sonda.erro.tipo === "proibido") {
    console.error("ensaio 147: este usuário não passa em pcp_sou_da_casa(). "
                + "Entre com um usuário da casa.", sonda.erro);
    return null;
  }
  /* a sonda é um `invalido` de propósito (sem id e sem operation_id): não
     grava nada e não registra operação. Serve só para saber se a porta abre. */

  if (!cfg.euAceitoOResiduo) {
    console.warn(
      "ensaio 147 · PLANO (nada foi executado)\n" +
      "Pelo caminho do app não existe rollback. Rodando de verdade, FICAM no banco:\n" +
      `  · pcp_fita: ${FITA} e ${FITA_B}\n` +
      `  · pcp_projeto_corte: ${PROJ} (+ regra, versão v1 publicada, corte, fitilho)\n` +
      `  · pcp_pedido_projeto_corte: ${PED}, CONGELADO — não há RPC que apague\n` +
      "  · pcp_operacao: 7 registros com tipo corte_*\n" +
      "E a guarda do rollback da 147 passa a recusar o rollback, corretamente.\n" +
      "Prefira um branch do Supabase ou projeto de teste.\n" +
      "Para rodar assim mesmo: await ensaio147App({ euAceitoOResiduo: true })");
    return { plano: true, criaria: { FITA, FITA_B, PROJ, PED } };
  }

  const rpc = async (nome, args) => {
    const r = await persRpc(nome, args);
    return r.ok ? r.corpo : { status: "erro-transporte", erro: r.erro, http: r.status };
  };
  const lerFita = async (id) => {
    const r = await persLer(`pcp_fita?id=eq.${encodeURIComponent(id)}&select=nome,revision,ultima_operacao`);
    return (r.ok && Array.isArray(r.corpo) && r.corpo[0]) || null;
  };

  let r, f;

  /* 1 · a operação A cria a fita ------------------------------------------ */
  r = await rpc("pcp_fita_salvar", {
    p_dados: { id: FITA, nome: "ENSAIO A", numero: "9" }, p_operation_id: opA });
  reg(1, "A cria a fita", "ok/revision 1", JSON.stringify(r),
      r.status === "ok" && r.revision === 1);

  /* 2 · a operação foi parar no ledger compartilhado ----------------------- */
  const led = await persLer(
    `pcp_operacao?operation_id=eq.${opA}&select=tipo,entidade,resultado`);
  const lin = (led.ok && Array.isArray(led.corpo) && led.corpo[0]) || null;
  if (!led.ok) {
    reg(2, "registro em pcp_operacao", "corte_fita_salvar/fita",
        `não foi possível ler (RLS/${led.status}) — passo não conclusivo`, null);
  } else {
    reg(2, "registro em pcp_operacao", "corte_fita_salvar/fita com resultado",
        JSON.stringify(lin),
        !!lin && lin.tipo === "corte_fita_salvar" && lin.entidade === "fita" && lin.resultado != null);
  }

  /* 3 · a operação B altera a mesma fita, e carimba a linha ---------------- */
  r = await rpc("pcp_fita_salvar", {
    p_dados: { id: FITA, nome: "ENSAIO B", numero: "9" },
    p_expected_revision: 1, p_operation_id: opB });
  f = await lerFita(FITA);
  reg(3, "B altera a fita", "ok/revision 2 e ultima_operacao = B",
      JSON.stringify(r) + " | " + JSON.stringify(f),
      r.status === "ok" && r.revision === 2 && !!f && f.ultima_operacao === opB);

  /* 4 · A CHEGA DE NOVO DEPOIS DE B — o cenário do retry perdido ----------- */
  r = await rpc("pcp_fita_salvar", {
    p_dados: { id: FITA, nome: "ENSAIO A", numero: "9" }, p_operation_id: opA });
  f = await lerFita(FITA);
  reg(4, "A reenviada depois de B",
      "resultado guardado (revision 1) + duplicada:true, fita intacta em ENSAIO B/2",
      JSON.stringify(r) + " | " + JSON.stringify(f),
      r.status === "ok" && r.revision === 1 && r.duplicada === true
        && !!f && f.nome === "ENSAIO B" && f.revision === 2);

  /* 5 · mesmo id, intenção DIFERENTE: recusa de propósito ------------------ */
  r = await rpc("pcp_fita_salvar", {
    p_dados: { id: FITA, nome: "ENSAIO A", numero: "9", cor: "outra coisa" },
    p_operation_id: opA });
  reg(5, "mesmo id com outra intencao", "operacao-reutilizada",
      JSON.stringify(r), r.status === "operacao-reutilizada");

  /* 6 · projeto com receita, publicado ------------------------------------ */
  const receita = {
    cortes_modo: "substitui",
    cortes: [{ chave: "ct_ens1", ordem: 1, operacao: "define", fita_id: FITA,
               comprimento_mm: 100, tipo_corte: "reto", qtd: 1,
               identificacao: "Laco do ensaio" }],
    fitilho: { partes: 1, comprimento_mm: 80 },
  };
  const projeto = { id: PROJ, nome: "Ensaio", escopo: "sku" };
  const regras  = [{ operador: "igual", valor: `ENS_${selo}` }];
  r = await rpc("pcp_projeto_corte_salvar", {
    p_projeto: projeto, p_regras: regras, p_receita: receita,
    p_publicar: true, p_operation_id: opC });
  const VERSAO = r && r.versao_id;
  reg(6, "projeto salvo e publicado", "ok/versao 1", JSON.stringify(r),
      r.status === "ok" && r.versao === 1);

  /* 7 · o mesmo salvamento reenviado NÃO cria uma segunda versão ----------- */
  r = await rpc("pcp_projeto_corte_salvar", {
    p_projeto: projeto, p_regras: regras, p_receita: receita,
    p_publicar: true, p_operation_id: opC });
  const vs = await persLer(
    `pcp_projeto_corte_versao?projeto_id=eq.${PROJ}&select=id`);
  const nVers = (vs.ok && Array.isArray(vs.corpo)) ? vs.corpo.length : -1;
  reg(7, "salvar reenviado", "duplicada:true e continua com 1 versao",
      JSON.stringify(r) + " | versoes=" + nVers,
      r.status === "ok" && r.duplicada === true && nVers === 1);

  /* 8 · vínculo do pedido -------------------------------------------------- */
  r = await rpc("pcp_pedido_corte_vincular", {
    p_pedido_id: PED, p_projeto_id: PROJ, p_versao_id: VERSAO,
    p_origem: "sku", p_operation_id: opD });
  reg(8, "vinculo criado", "ok", JSON.stringify(r), r.status === "ok");

  /* 9 · primeiro papel congela -------------------------------------------- */
  r = await rpc("pcp_pedido_corte_congelar", {
    p_pedido_id: PED, p_snapshot: { cortes: [{ fita: "9", mm: 100 }] },
    p_operation_id: opE });
  const cong1 = r && r.congelado_em;
  reg(9, "primeiro congelamento", "ok/ja_congelado false", JSON.stringify(r),
      r.status === "ok" && r.ja_congelado === false);

  /* 10 · reimprimir NÃO recongela, mesmo com operação nova ----------------- */
  r = await rpc("pcp_pedido_corte_congelar", {
    p_pedido_id: PED, p_snapshot: { cortes: [{ fita: "OUTRA", mm: 999 }] },
    p_operation_id: opF });
  reg(10, "segundo congelamento, operacao nova",
      "ja_congelado true e o mesmo congelado_em", JSON.stringify(r),
      r.ja_congelado === true && r.congelado_em === cong1);

  /* 11 · recusa por validação não queima o id ------------------------------ */
  r = await rpc("pcp_fita_salvar", { p_dados: { nome: "sem id" }, p_operation_id: opG });
  const semReg = await persLer(`pcp_operacao?operation_id=eq.${opG}&select=operation_id`);
  const nReg = (semReg.ok && Array.isArray(semReg.corpo)) ? semReg.corpo.length : -1;
  reg(11, "salvar invalido", "invalido e NENHUM registro em pcp_operacao",
      JSON.stringify(r) + " | registros=" + nReg,
      r.status === "invalido" && (nReg === 0 || (!semReg.ok && null)));

  /* 12 · o mesmo id volta a servir depois da correção ---------------------- */
  r = await rpc("pcp_fita_salvar", {
    p_dados: { id: FITA_B, nome: "Corrigida" }, p_operation_id: opG });
  reg(12, "corrigir e reenviar com o MESMO id", "ok (o id nao ficou queimado)",
      JSON.stringify(r), r.status === "ok");

  /* 13 · a guarda do rollback trava diante de dado ------------------------- */
  const g = await persRpc("pcp_corte_rollback_guarda", {});
  reg(13, "guarda do rollback", "recusa o rollback",
      JSON.stringify(g.ok ? g.corpo : g.erro),
      !g.ok && !!g.erro && /recusado/i.test(JSON.stringify(g.erro)));

  /* ---- limpeza possível, e o que não sai --------------------------------- */
  const sobrou = [];
  if (cfg.limpar) {
    const aFita  = await rpc("pcp_fita_apagar", { p_id: FITA,   p_operation_id: op() });
    const aFitaB = await rpc("pcp_fita_apagar", { p_id: FITA_B, p_operation_id: op() });
    const aProj  = await rpc("pcp_projeto_corte_arquivar", { p_id: PROJ, p_operation_id: op() });
    sobrou.push(`pcp_fita ${FITA}: ${aFita.status}` +
                (aFita.status === "em-uso" ? " (a receita ainda a referencia)" : " (soft delete: a linha fica)"));
    sobrou.push(`pcp_fita ${FITA_B}: ${aFitaB.status} (soft delete: a linha fica)`);
    sobrou.push(`pcp_projeto_corte ${PROJ}: ${aProj.status}` +
                (aProj.usado_por_pedidos ? ` (preso por ${aProj.usado_por_pedidos} pedido congelado)` : ""));
  }
  sobrou.push(`pcp_projeto_corte_versao ${VERSAO}: publicada, imutável por desenho`);
  sobrou.push(`pcp_pedido_projeto_corte ${PED}: CONGELADO — não há RPC que apague`);
  sobrou.push("pcp_operacao: os registros corte_* desta execução");

  const falhas = passos.filter((p) => p.ok === false);
  const duvida = passos.filter((p) => p.ok === null);
  console.table(passos);
  console.log(`ensaio 147 (app) · ${passos.length - falhas.length - duvida.length} ok · `
            + `${falhas.length} falhas · ${duvida.length} não conclusivos`);
  console.warn("ficou no banco:\n  " + sobrou.join("\n  "));

  return { selo, passos, falhas, duvida, sobrou, ids: { FITA, FITA_B, PROJ, PED, VERSAO } };
}
