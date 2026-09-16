/* ===========================================================================
   src/persistencia/meses.js · MESES FECHADOS pela camada nova
   ---------------------------------------------------------------------------
   O que muda quando as flags ligam:

   LEITURA  · `S.cad.mesesFechados` e `S.cad.historicoFechamentos` passam a vir
              de `pcp_mes_fechado` e `pcp_mes_evento`. O documento continua
              sendo gravado a partir da tela — vira espelho.
   ESCRITA  · fechar e reabrir passam a ser UMA chamada transacional
              (`pcp_mes_fechar` / `pcp_mes_reabrir`) em vez de carimbar N
              pedidos na memória e mandar N patches em série.

   Medido antes: fechar um mês com 200 pedidos disparava 200 RPCs sequenciais,
   e uma em conflito deixava o mês PARCIALMENTE carimbado enquanto o documento
   já dizia "fechado". E a trava de mês fechado só existia na memória de quem
   clicava — quem não recarregasse a aba passava por todas as guardas.

   Com as flags desligadas, tudo aqui devolve `desligado` na primeira linha e o
   comportamento de hoje não muda em nada.
   =========================================================================== */
Object.assign(PX_RPC, {
  mes_fechar:  "pcp_mes_fechar",
  mes_reabrir: "pcp_mes_reabrir",
});

const mesLeDaTabela      = () => typeof telaFlag === "function" && telaFlag("meses_leitura");
const mesEscreveNaTabela = () => typeof telaFlag === "function" && telaFlag("meses_escrita");

/* ---------------------------------------------------------------------------
   A LEITURA
   --------------------------------------------------------------------------- */
async function mesCarregar() {
  if (!mesLeDaTabela()) return { status: "desligado" };
  const [f, e] = await Promise.all([
    persLer("pcp_mes_fechado?select=mes,fechado_em,fechado_nome,pedidos,total,carimbados&order=mes"),
    persLer("pcp_mes_evento?select=mes,acao,em,quem_nome,pedidos,total&order=em&limit=1000"),
  ]);
  if (!f.ok) return pxResposta(f, "listar-meses");
  if (typeof S === "undefined") return { status: "sem-estado" };
  S.cad = S.cad || {};
  S.cad.mesesFechados = persLista(f.corpo).map((x) => ({
    mes: x.mes, em: x.fechado_em, por: x.fechado_nome,
    pedidos: x.pedidos, total: x.total, carimbados: x.carimbados }));
  if (e.ok) {
    S.cad.historicoFechamentos = persLista(e.corpo).map((x) => ({
      mes: x.mes, acao: x.acao, em: x.em, por: x.quem_nome,
      pedidos: x.pedidos, total: x.total }));
  }
  return { status: "ok", meses: S.cad.mesesFechados.length,
           eventos: (S.cad.historicoFechamentos || []).length };
}

/* ---------------------------------------------------------------------------
   A ESCRITA · uma chamada, uma transação
   ---------------------------------------------------------------------------
   Devolve `desligado` quando a flag está fora — e é o CHAMADOR que decide o
   caminho antigo, para o código velho continuar sendo o caminho velho, e não
   uma variante deste.
   --------------------------------------------------------------------------- */
async function mesFecharNoServidor(mes, pedidos, total) {
  if (!mesEscreveNaTabela()) return { status: "desligado" };
  const r = await pxEnviar(obEnfileirar("mes_fechar", mes, {
    p_mes: mes, p_pedidos: pedidos ?? null, p_total: total ?? null,
    p_nome: (typeof usuarioAtual === "function" && usuarioAtual()?.nome) || null }));
  if (r && r.status === "ok") await mesCarregar();
  return r;
}

async function mesReabrirNoServidor(mes) {
  if (!mesEscreveNaTabela()) return { status: "desligado" };
  const r = await pxEnviar(obEnfileirar("mes_reabrir", mes, {
    p_mes: mes,
    p_nome: (typeof usuarioAtual === "function" && usuarioAtual()?.nome) || null }));
  if (r && r.status === "ok") await mesCarregar();
  return r;
}

/* Depois de fechar/reabrir no servidor, os pedidos da TELA precisam refletir o
   carimbo — senão a pessoa continua vendo o estado velho até um F5. Isto NÃO é
   uma segunda gravação: é a tela alcançando o que o servidor já decidiu. */
function mesRefletirNaTela(mes, fechou) {
  if (typeof S === "undefined" || !Array.isArray(S.pedidos)) return 0;
  let n = 0;
  for (const r of S.pedidos) {
    if (fechou) {
      if (r.status !== "retornada" || competenciaDe(r) !== mes || r.mesPagamento) continue;
      r.mesPagamento = mes; r.mesPagamentoAuto = true; n++;
    } else {
      if (!r.mesPagamentoAuto || r.mesPagamento !== mes) continue;
      r.mesPagamento = null; delete r.mesPagamentoAuto; n++;
    }
  }
  return n;
}

function mesDiagnostico() {
  return { leitura: mesLeDaTabela(), escrita: mesEscreveNaTabela(),
           fechados: ((typeof S !== "undefined" && S.cad && S.cad.mesesFechados) || []).length,
           trilha: ((typeof S !== "undefined" && S.cad && S.cad.historicoFechamentos) || []).length };
}
