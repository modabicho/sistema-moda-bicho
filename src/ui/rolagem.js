/* ---------- rolagem infinita, busca e caixas que crescem ----------
   ---------------------------------------------------------------------------
   POR QUE ISTO FOI REESCRITO (v8.60)

   O ouvinte de rolagem somava +120 linhas e chamava `render()` INTEIRO. Para
   acrescentar 120 linhas no fim, o app refazia o cálculo, remontava 410 KB de
   HTML, jogava fora 7.810 nós e criava 8.000 outros — e, logo depois, era
   obrigado a medir tudo de novo para repor a rolagem.

   Medido antes de mexer, com 1.600 pedidos e 2.200 SKUs: cinco descidas até o
   fim produziram OITO renders completos e 5.494 ms de main thread travada, com
   um render individual de 1.729 ms. É isso que o Chrome chama de "Página sem
   resposta".

   Eram DOIS defeitos, e a correção é diferente para cada um:

   1. RENDER COMPLETO PARA ACRESCENTAR O FIM. Agora a rolagem acrescenta só o
      lote novo no `<tbody>`, com o MESMO molde de linha que o render usa
      (`demLinhaSku`). Cabeçalho, filtros, cards e as linhas antigas não são
      tocados. O cálculo não é refeito: a lista já filtrada e ordenada é a que o
      próprio render deixou em `S._demLista`.

   2. OITO RENDERS PARA CINCO GESTOS. A trava era solta no mesmo bloco síncrono
      do render — os eventos de rolagem que chegavam DURANTE ele entravam logo
      depois com a trava já aberta. Agora ela só solta no quadro seguinte, e a
      fila que se acumulou encontra a porta fechada.

   O caminho antigo (render completo) continua existindo como rede: telas que
   não sabem crescer sozinhas caem nele, e é o mesmo comportamento de antes.
   ------------------------------------------------------------------------- */
const _LIMITES = { demanda: ["demanda", "limite", 120], pedidos: ["pedView", "limite", 120],
  historico: ["historico", "limite", 120], produtos: ["produtosView", "limite", 120],
  conferencia: ["prestView", "limiteConf", 120] };
let _crescendo = false;

/* Teto de linhas no DOM. 39.100 nós foi o que fez um render custar 1,7 s; o
   custo do navegador é proporcional aos nós, então deixar a tela crescer sem
   fim é adiar o mesmo travamento. Com o crescimento incremental o teto deixa de
   ser urgente — mas fica aqui, medido e ajustável, em vez de "cresce até
   quando der". */
/* 900 linhas ≈ 33 mil nós, medido: ~35,7 nós por linha mais a moldura da tela.
   Fica abaixo dos 39 mil que faziam um render custar 1,7 s, com folga. */
const DEM_TETO_LINHAS = 900;
/* Pedidos tem a linha mais pesada das duas telas — 12 colunas com marcadores,
   contra 16 mais simples da Demanda. Medido: 650 linhas já davam 38 mil nós.
   600 mantém o DOM na mesma faixa dos 32 mil da Demanda corrigida. */
const PED_TETO_LINHAS = 600;

/* ---------------------------------------------------------------------------
   CRESCIMENTO INCREMENTAL DA DEMANDA
   Devolve `true` se conseguiu crescer sozinha; `false` quando não é o caso dela
   e quem chamou deve cair no render completo de sempre.
   --------------------------------------------------------------------------- */
function demCrescerIncremental(passo) {
  if (S.aba !== "demanda") return false;
  const d = S.demanda;
  if (!d || d.modo !== "sku") return false;              /* modo pedido: caminho antigo */
  const lista = S._demLista;
  if (!Array.isArray(lista)) return false;               /* ainda não rendeu uma vez */
  if (typeof demLinhaSku !== "function") return false;

  const corpo = document.querySelector(".page table.t tbody");
  if (!corpo) return false;
  /* A tabela precisa estar exibindo exatamente o que a lista diz. Se não
     estiver, alguma outra coisa mexeu no DOM e acrescentar cegamente
     duplicaria ou puralaria linhas — aí o render completo é o certo. */
  const jaTem = corpo.querySelectorAll("tr[data-sku]").length;
  const esperado = Math.min(d.limite, lista.length);
  if (jaTem !== esperado) return false;
  if (jaTem >= lista.length) return false;               /* acabou: nada a acrescentar */
  /* NO TETO, PARA — e NÃO cai no render completo.
     Devolver `false` aqui foi um defeito meu, pego na medição: quem chegasse ao
     teto rolando levava um render inteiro de mais de dois segundos, de
     surpresa, no meio de um gesto que até então custava 12 ms. Agora o
     crescimento automático simplesmente para; o botão "Mostrar mais" continua
     na tela, e aí é uma decisão de quem está olhando, não um susto. */
  if (jaTem >= DEM_TETO_LINHAS) return true;

  const ate = Math.min(lista.length, jaTem + (passo || 120), DEM_TETO_LINHAS);
  const novas = lista.slice(jaTem, ate);
  if (!novas.length) return false;

  /* UM insertAdjacentHTML para o lote inteiro, não um por linha: cada inserção
     avulsa é um convite a recalcular layout. */
  corpo.insertAdjacentHTML("beforeend", novas.map(demLinhaSku).join(""));
  d.limite = ate;

  /* o rodapé "Mostrar mais" some quando acabou — a mesma regra do render */
  const rodape = corpo.closest(".tw")?.parentElement?.querySelector('[data-act="mais-dem"]');
  if (rodape && ate >= lista.length) rodape.closest("div")?.remove();
  return true;
}

/* ---------------------------------------------------------------------------
   CRESCIMENTO INCREMENTAL DE PEDIDOS (v8.61)
   Mesmo princípio da Demanda, com a diferença que a linha de Pedido depende do
   fecho: ela precisa da visão (`v`), do cálculo (`c`) e do conjunto dos que
   entraram depois da âncora. Esses três vêm de `S._pedCtx`, guardado pelo
   próprio render — não são recalculados aqui.
   --------------------------------------------------------------------------- */
function pedCrescerIncremental(passo) {
  if (S.aba !== "pedidos") return false;
  const v = S.pedView;
  if (!v || v.etapa === "remessas") return false;        /* outra tabela: caminho antigo */
  const lista = S._pedLista, ctx = S._pedCtx;
  if (!Array.isArray(lista) || !ctx) return false;       /* ainda não rendeu uma vez */
  if (typeof pedLinha !== "function") return false;

  const corpo = document.querySelector(".page table.t-ped tbody");
  if (!corpo) return false;
  const jaTem = corpo.querySelectorAll("tr[data-linha]").length;
  const esperado = Math.min(v.limite, lista.length);
  if (jaTem !== esperado) return false;                  /* a tela não é a lista: não mexe */
  if (jaTem >= lista.length) return false;
  if (jaTem >= PED_TETO_LINHAS) return true;             /* teto: para, sem render de surpresa */

  const ate = Math.min(lista.length, jaTem + (passo || 120), PED_TETO_LINHAS);
  const novas = lista.slice(jaTem, ate);
  if (!novas.length) return false;

  corpo.insertAdjacentHTML("beforeend",
    novas.map((x) => pedLinha(x, ctx.v, ctx.c, ctx.novosDaAncora)).join(""));
  v.limite = ate;

  const rodape = corpo.closest(".tw")?.parentElement?.querySelector('[data-act="mais-ped"]');
  if (rodape && ate >= lista.length) rodape.closest("div")?.remove();
  return true;
}

function ligarRolagemInfinita() {
  const alvo = _LIMITES[S.aba];
  if (!alvo) return;
  const caixa = $(".page .tw");
  if (!caixa || caixa._infinito) return;
  caixa._infinito = true;
  caixa.addEventListener("scroll", () => {
    if (_crescendo) return;
    if (caixa.scrollTop + caixa.clientHeight < caixa.scrollHeight - 500) return;
    /* só cresce se ainda houver o que mostrar: o rodapé "Mostrar mais" some quando acaba */
    if (!caixa.closest(".card")?.querySelector('[data-act^="mais-"]')) return;
    _crescendo = true;
    const [obj, campo, passo] = alvo;

    /* 1 · o caminho barato: acrescentar o lote novo e não tocar em mais nada */
    if (S.aba === "demanda" && demCrescerIncremental(passo)) { soltarNoQuadroSeguinte(); return; }
    if (S.aba === "pedidos" && pedCrescerIncremental(passo)) { soltarNoQuadroSeguinte(); return; }

    /* 2 · a rede: render completo, como sempre foi */
    S[obj][campo] += passo;
    const pos = caixa.scrollTop;
    render();
    const nova = $(".page .tw");
    if (nova) nova.scrollTop = pos;
    soltarNoQuadroSeguinte();
  }, { passive: true });
}

/* A TRAVA SÓ SOLTA NO QUADRO SEGUINTE.
   Soltá-la aqui mesmo, síncrono, era o segundo defeito: enquanto o crescimento
   rodava, o navegador enfileirava os eventos de rolagem que continuavam
   chegando; ao terminar, todos entravam de uma vez com a porta já aberta, e
   cinco gestos viravam oito crescimentos. Com o `requestAnimationFrame` o
   navegador ganha a chance de pintar e de descartar a fila antes de a porta
   reabrir. */
function soltarNoQuadroSeguinte() {
  requestAnimationFrame(() => requestAnimationFrame(() => { _crescendo = false; }));
}

/* buscas e campos com atualização ao digitar, preservando o foco */
function ligarBusca(id, obj, campo) {
  const antes = document.activeElement?.id;
  const elx = $("#" + id);
  if (!elx) return;
  /* Um render custa dezenas de milissegundos; a cada tecla isso vira travamento.
     O texto aparece na hora no campo (é o próprio navegador), e a lista só é
     refeita quando a pessoa para de digitar. */
  let _t = null;
  elx.addEventListener("input", () => {
    obj[campo] = elx.value;
    clearTimeout(_t);
    _t = setTimeout(() => {
      const pos = elx.selectionStart;
      render();
      const de = $("#" + id);
      if (de) { de.focus(); de.setSelectionRange(pos, pos); }
    }, 220);
  });
  if (antes === id) elx.focus();
}
let _buscaTimer = null;
const _renderOrig = render;
render = function () {
  const foco = document.activeElement?.id;
  const pos = document.activeElement?.selectionStart;
  const rolagem = {
    page: document.querySelector(".page")?.scrollTop,
    modal: document.querySelector(".modal-b")?.scrollTop,
    drawer: document.querySelector(".drawer-b")?.scrollTop,
  };
  _renderOrig();
  if (rolagem.page != null) { const el3 = document.querySelector(".page"); if (el3) el3.scrollTop = rolagem.page; }
  if (rolagem.modal != null) { const el3 = document.querySelector(".modal-b"); if (el3) el3.scrollTop = rolagem.modal; }
  if (rolagem.drawer != null) { const el3 = document.querySelector(".drawer-b"); if (el3) el3.scrollTop = rolagem.drawer; }
  ["q-dem", "q-rel", "q-ped", "q-hist", "q-prod-cad", "q-prest", "q-compras", "q-estr", "q-conf", "q-insumo",
   "q-fest", "q-festbase", "q-festplano"].forEach((id) => {
    const elx = $("#" + id);
    if (!elx) return;
    elx.oninput = () => {
      const mapa = { "q-dem": [S.demanda, "busca"], "q-rel": [S.rel, "busca"], "q-ped": [S.pedView, "busca"],
        "q-hist": [S.historico, "busca"], "q-prod-cad": [S.produtosView, "busca"], "q-prest": [S.prestView, "busca"],
        "q-compras": [S.comprasView, "busca"], "q-estr": [S.modal || {}, "busca"], "q-conf": [S.prestView, "buscaConf"],
        "q-insumo": [S.insumosView, "busca"],
        "q-fest": [S.festivasView, "busca"], "q-festbase": [S.festivasView, "buscaBase"],
        "q-festplano": [S.festivasView, "buscaPlano"] };
      const [obj, campo] = mapa[id];
      /* se o leitor digitou aqui, o campo recebe "PCP1502"; o pedido é só "1502" */
      const cru = elx.value;
      const limpo = semPrefixoBipe(cru);
      if (limpo !== cru) elx.value = limpo;
      obj[campo] = elx.value;
      /* Redesenhar a tela a cada tecla é o que fazia a busca travar: cada render
         custa dezenas de milissegundos com a lista cheia. A letra aparece na hora
         (quem escreve é o navegador); a lista espera a digitação parar. */
      clearTimeout(_buscaTimer);
      _buscaTimer = setTimeout(() => {
        const p = $("#" + id)?.selectionStart;
        render();
        const de = $("#" + id);
        if (de) { de.focus(); try { if (p != null) de.setSelectionRange(p, p); } catch {} }
      }, 200);
    };
  });
  ligarRolagemInfinita();
  /* a busca rápida repinta só a própria lista — a tela inteira atrás dela fica parada */
  const cq = $("#cmd-q");
  if (cq && !cq._ligado) {
    cq._ligado = true;
    cq.addEventListener("input", () => {
      if (!S.cmd) return;
      S.cmd.q = cq.value; S.cmd.itens = buscarTudo(cq.value); S.cmd.i = 0;
      repintarCmd();
    });
    cq.focus(); cq.select();
  }
  if (foco && $("#" + foco) && !["q-dem", "q-rel", "q-ped", "q-hist", "q-prod-cad", "q-prest", "q-compras", "q-estr", "q-conf", "q-insumo", "q-fest", "q-festbase", "q-festplano"].includes(foco)) {
    const de = $("#" + foco);
    de.focus();
    if (pos != null) { try { de.setSelectionRange(pos, pos); } catch {} }
  }
};

