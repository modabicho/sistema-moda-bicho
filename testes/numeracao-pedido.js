/* ===========================================================================
   BATERIA · numeracao-pedido (v8.103)
   ---------------------------------------------------------------------------
   Cópia de teste. Não fala com o servidor: a leitura do contador (`persLer` de
   `pcp_ciclo`) é trocada por um valor controlado; render, salvarTudo e toast
   são trocados por nada. Todo o resto é o código do app: proximoNumeroPedido,
   numeroEmUso, npNumVeredito, npNumRefrescar, pedCicloRefrescar,
   capturarNovoPedido e confirmarPedidos.

     (0, eval)(await (await fetch("testes/numeracao-pedido.js")).text());
     await bateriaNumeracaoPedido();
   =========================================================================== */
async function bateriaNumeracaoPedido() {
  const res = [];
  const ok = (nome, cond, detalhe) => res.push({ nome, ok: !!cond, detalhe: cond ? undefined : detalhe });
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const salvo = { pedidos: S.pedidos, remessas: S.remessas, ops: S.ops, modal: S.modal, sel: S.sel, eventos: S.eventos,
    marca: S.cfg && S.cfg.maiorNumeroUsado, ciclo: PED_CICLO, flags: TELA_FLAGS,
    cfgPend: _pendentes.has("cfg"), evPend: _pendentes.has("eventos"), janela: {} };
  const trocar = (n, fn) => { salvo.janela[n] = window[n]; window[n] = fn; };
  let servidor = 2778, leituraFalha = false;

  const montar = (numeros, remessas) => {
    S.pedidos = numeros.map((n) => ({ id: "t" + n, numero: String(n), status: "aberto", opId: null }));
    S.remessas = (remessas || []).map((n) => ({ id: "rm" + n, numero: String(n), prestadora: "X" }));
    S.cfg.maiorNumeroUsado = 0;
    mudouDados();
  };
  /* o mesmo markup que componentes/modal.js desenha para o campo do número */
  const desenhar = () => {
    document.getElementById("__np")?.remove();
    const vd = npNumVeredito(S.modal && S.modal.v ? S.modal.v.num : undefined);
    const d = document.createElement("div"); d.id = "__np";
    d.innerHTML = `<label class="fld"><span>Número</span><input id="np-num" data-sug="${vd.sug}" value="${vd.atual}"><div class="hint">${vd.dica}</div></label><button data-npnum="${vd.sug}">Usar o sugerido (${vd.sug})</button>`;
    document.body.appendChild(d);
  };
  const tela = () => { const i = document.getElementById("np-num");
    return { campo: i.value, sug: i.dataset.sug, botao: document.querySelector("[data-npnum]").textContent,
      jaExiste: /Já existe/.test(document.querySelector("#__np .hint").textContent) }; };
  const releitura = async () => { pedCicloRefrescar(["novoPedido"]); await espera(30); };

  try {
    TELA_FLAGS = Object.assign({}, TELA_FLAGS || {}, { pedidos_linha_leitura: true });
    trocar("persLer", async () => leituraFalha ? { ok: false, status: 401 } : { ok: true, corpo: [{ ciclo: 1, proximo_numero: servidor }] });
    trocar("render", () => {}); trocar("repintarModal", () => {}); trocar("toast", () => {});
    trocar("salvarTudo", async () => true);
    S.eventos = S.eventos || [];
    S.modal = { tipo: "novoPedido" };

    /* 1 · o caso da imagem: contador em 2778 e o 2778 já existe */
    servidor = 2778; montar([2777, 2778]); await pedCarregarCiclo();
    ok("1.1 contador atrasado: sugestão pula o 2778 ocupado", proximoNumeroPedido() === 2779, proximoNumeroPedido());
    desenhar(); const t1 = tela();
    ok("1.2 janela abre com 2779 e sem 'Já existe'", t1.campo === "2779" && t1.sug === "2779" && !t1.jaExiste, JSON.stringify(t1));
    ok("1.3 botão diz Usar o sugerido (2779)", t1.botao === "Usar o sugerido (2779)", t1.botao);

    /* 2 · o contador muda DEPOIS de a janela abrir */
    servidor = 2778; montar([2777]); await pedCarregarCiclo();
    desenhar(); ok("2.1 abre com 2778", tela().campo === "2778");
    servidor = 2785; await releitura(); const t2 = tela();
    ok("2.2 releitura: campo, data-sug e botão vão para 2785", t2.campo === "2785" && t2.sug === "2785" && t2.botao === "Usar o sugerido (2785)" && !t2.jaExiste, JSON.stringify(t2));
    ok("2.3 o rascunho não guarda o número velho", capturarNovoPedido().num === undefined, JSON.stringify(capturarNovoPedido().num));

    /* 3 · número digitado à mão nunca é sobrescrito */
    servidor = 2778; montar([2777]); await pedCarregarCiclo(); desenhar();
    document.getElementById("np-num").value = "2790";
    servidor = 2781; await releitura(); const t3 = tela();
    ok("3.1 digitado 2790 continua 2790", t3.campo === "2790", JSON.stringify(t3));
    ok("3.2 a sugestão e o botão andam para 2781", t3.sug === "2781" && t3.botao === "Usar o sugerido (2781)", JSON.stringify(t3));
    ok("3.3 o rascunho guarda o digitado", capturarNovoPedido().num === "2790", capturarNovoPedido().num);

    /* 3b · clicou "Usar o sugerido" (fica em S.modal.v.num) e o contador andou */
    servidor = 2778; montar([2777]); await pedCarregarCiclo(); S.modal = { tipo: "novoPedido", v: { num: "2778" } }; desenhar();
    servidor = 2779; await releitura();
    ok("3.4 sugestão clicada acompanha o contador", tela().campo === "2779" && S.modal.v.num === undefined, JSON.stringify([tela(), S.modal.v]));
    S.modal = { tipo: "novoPedido" };

    /* 4 · contador atrasado com vários números locais ocupados (pedido e remessa) */
    servidor = 2778; montar([2777, 2778, 2779, 2780], [2781]); await pedCarregarCiclo();
    ok("4.1 pula 2778-2780 (pedidos) e 2781 (remessa): 2782", proximoNumeroPedido() === 2782, proximoNumeroPedido());
    leituraFalha = true; servidor = 2790; desenhar(); await releitura();
    ok("4.2 leitura do contador falhando: continua 2782 e sem 'Já existe'", tela().campo === "2782" && !tela().jaExiste, JSON.stringify(tela()));
    leituraFalha = false;
    ok("4.3 número de 3 dígitos com zero à esquerda também conta", (() => { montar(["0999"]); PED_CICLO = { ciclo: 1, proximo: 999 }; return proximoNumeroPedido() === 1000; })(), proximoNumeroPedido());

    /* 5 · contador À FRENTE da lista continua prevalecendo (v8.75) */
    montar([2777]); S.cfg.maiorNumeroUsado = 2850; servidor = 2900; await pedCarregarCiclo();
    ok("5.1 contador 2900 com lista em 2777 e marca 2850: sugere 2900", proximoNumeroPedido() === 2900, proximoNumeroPedido());

    /* 6 · sem contador (legado): segue a lista, como antes */
    PED_CICLO = null; montar([2777], [2780]);
    ok("6.1 sem contador: maior da lista/remessas + 1 = 2781", proximoNumeroPedido() === 2781, proximoNumeroPedido());

    /* 7 · criação em lote da Demanda pula números ocupados (confirmarPedidos real) */
    montar([2778, 2780]); PED_CICLO = { ciclo: 1, proximo: 2777 };
    S.ops = [{ id: "opT", sku: "T.NUM", status: "em_producao", prioridade: 4 }];
    S.sel = new Set(); mudouDados();
    S.modal = { tipo: "criarPedidos", reprios: {}, campanhaId: null,
      grupos: [{ sku: "T.NUM", processo: "CHUCA", adesivo: false, linhas: [{ qtd: 10, prioridade: 2 }, { qtd: 10, prioridade: 2 }, { qtd: 10, prioridade: 2 }] }] };
    let erro7 = null;
    try { await confirmarPedidos(); } catch (e) { erro7 = String(e && e.stack || e); }
    const novos = S.pedidos.filter((r) => r.sku === "T.NUM").map((r) => r.numero);
    ok("7.1 confirmarPedidos rodou", !erro7, erro7);
    ok("7.2 três pedidos com 2777, 2779, 2781 (pula 2778 e 2780)", JSON.stringify(novos) === JSON.stringify(["2777", "2779", "2781"]), JSON.stringify(novos));
    ok("7.3 nenhum número repetido na lista", (() => { const n = S.pedidos.map((r) => r.numero); return new Set(n).size === n.length; })());
  } catch (e) {
    res.push({ nome: "EXCEÇÃO", ok: false, detalhe: String(e && e.stack || e) });
  } finally {
    for (const [n, fn] of Object.entries(salvo.janela)) window[n] = fn;
    Object.assign(S, { pedidos: salvo.pedidos, remessas: salvo.remessas, ops: salvo.ops, modal: salvo.modal, sel: salvo.sel, eventos: salvo.eventos });
    if (S.cfg) S.cfg.maiorNumeroUsado = salvo.marca;
    PED_CICLO = salvo.ciclo; TELA_FLAGS = salvo.flags;
    if (!salvo.cfgPend) _pendentes.delete("cfg");
    if (!salvo.evPend) _pendentes.delete("eventos");
    document.getElementById("__np")?.remove();
    mudouDados();
  }
  const falhas = res.filter((r) => !r.ok);
  return { versao: VERSAO, resumo: `numeracao-pedido: ${res.length - falhas.length} ok · ${falhas.length} falhas`, falhas };
}
