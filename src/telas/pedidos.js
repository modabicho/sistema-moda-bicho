/* ---------- Pedidos: o percurso inteiro numa tela só ---------- */
/* ---------------------------------------------------------------------------
   UMA LINHA DE PEDIDO · o molde, extraído para servir a DOIS caminhos: o
   render completo e o crescimento incremental da rolagem (v8.61).
   É a MESMA função nos dois — duas cópias do molde divergiriam no primeiro
   ajuste de coluna e ninguém veria.
   O que ela precisa do fecho vem por parâmetro, não por variável solta:
   `v` (a visão: etapa e último aberto), `c` (o cálculo) e o conjunto dos
   que entraram depois da âncora.
   --------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
   `situacao` e `acao` saíram de dentro do `viewPedidos` (v8.61).
   Elas montam duas colunas da linha de Pedido e não dependem de nada do
   fecho — só do próprio pedido. Estavam presas lá dentro por hábito, e isso
   impedia a linha de ser desenhada fora do render completo.
   O CORPO DELAS NÃO FOI TOCADO: só mudaram de lugar.
   --------------------------------------------------------------------------- */
const situacao = (x) => {
  const marca = (txt, tom, dica, extra) =>
    `<span class="sit ${tom || ""}" title="${esc(dica || txt)}">${txt}</span>${extra || ""}`;
  const mat = x.aguardandoMaterial ? ` <span class="sit perigo" title="Pedido travado aguardando compra de material">S/ MATERIAL</span>` : "";
  /* ---------- v8.20 · o que é essencial sai do hover ----------
     CADASTRO e AVISAR eram só uma etiqueta de quatro letras, com o motivo
     escondido no `title`. Quem usa toque não tem hover; quem imprime a tela
     não leva a dica junto; e quem passa o mouse lê um balão que some. O que
     decide a ação — QUAIS problemas, e a prioridade mudou DE QUÊ PARA QUÊ —
     agora está escrito, embaixo da etiqueta, numa lista. O `title` fica, mas
     como repetição, não como o único lugar. */
  const prob = x.problemas?.length
    ? ` <span class="sit atencao" title="${esc(x.problemas.join(" · "))}">CADASTRO</span>` : "";
  const avi = x.avisar
    ? ` <span class="sit ${x.avisar.sentido === "subiu" ? "perigo" : "atencao"}" title="A prioridade mudou depois que o pedido já estava fora — precisa avisar a prestadora (${CORTE[x.avisar.de]} → ${CORTE[x.avisar.para]})">AVISAR</span>` : "";
  const detalhe = (() => {
    const linhas = [];
    if (x.problemas?.length) {
      linhas.push(x.problemas.length === 1
        ? `<li>${esc(x.problemas[0])}</li>`
        : x.problemas.map((t2) => `<li>${esc(t2)}</li>`).join(""));
    }
    if (x.avisar) linhas.push(`<li>avisar a prestadora: prioridade ${esc(CORTE[x.avisar.de])} → <b>${esc(CORTE[x.avisar.para])}</b></li>`);
    if (x.aguardandoMaterial) linhas.push(`<li>travado aguardando compra de material</li>`);
    return linhas.length ? `<ul class="sit-lista">${linhas.join("")}</ul>` : "";
  })();
  const fim = mat + prob + avi + detalhe;
  if (x.status === "papel") return marca("NO PAPEL", "", "1. Papel de Produção — aguardando impressão para entrar na fila", fim);
  if (x.status === "aberto") return marca(`NA FILA ${x.posicao}`, "", `2. Separar/Cortar — posição ${x.posicao} da fila de corte`, fim);
  if (x.status === "separando") return marca(`CORTADO${x.idade != null ? " " + x.idade + "d" : ""}`, "", `3. Cortado — aguardando envio à prestadora${x.idade != null ? ` há ${x.idade} dias` : ""}`, fim);
  if (x.status === "enviada") {
    if (x.atrasoProducao) return marca(`ATRASADA ${x.diasAtraso}d`, "perigo", `4. Em Produção — ${x.diasAtraso} dias além do prazo típico${x.prioridade <= 1 ? " e o estoque está pedindo" : ""}`, fim);
    const resta = Math.max(0, Math.round((x.lead || 0) - (x.idade ?? 0)));
    if (x.adiantar) return marca("ADIANTAR", "atencao", `4. Em Produção — dentro do prazo (${resta}d restantes), mas o estoque caiu: vale pedir para adiantar`, fim);
    return marca(`PRODUÇÃO ${resta}d`, "", `4. Em Produção — ${x.idade ?? "?"} dias fora, ${resta} dias até o prazo típico`, fim);
  }
  if (x.status === "chegou") return marca("CONFERIR", x.atrasoConferencia ? "perigo" : "",
    `5. Conferir — voltou da prestadora${x.diasParado ? ` e está parado há ${n0(x.diasParado)} ${x.diasParado === 1 ? "dia" : "dias"}` : ""}${x.perdeuMes ? ", fora do fechamento do mês" : ""}`, fim);
  return marca(`FEITO ${fdate(x.retornadaEm)}`, "ok", `6. Produzido — conferido em ${fdate(x.retornadaEm)}`);
};

const acao = (x) => {
  const espera = (txt, dica, ir) => `<button class="btn sm espera" ${ir || ""} title="${esc(dica)}">${txt}</button>`;
  if (x.status === "papel") return `<button class="btn sm primary" data-papel-ok="${esc(x.id)}" title="Marca o papel como impresso e manda para a fila de corte">Impresso</button>`;
  if (x.status === "aberto") {
    /* o mesmo código curto que a coluna Situação usa: se lá está escrito
       S/ MATERIAL, o botão não pode chamar a mesma coisa de outro jeito */
    if (x.aguardandoMaterial) return espera("Sem material",
      "Este pedido está travado esperando material. Resolva a falta em Compras — o botão de separar volta sozinho.", `data-ir-falta="${esc(x.id)}"`);
    return `<button class="btn sm primary" data-separar="${esc(x.id)}">Separar</button>`;
  }
  if (x.status === "separando") {
    if (x.aguardandoMaterial) return espera("Sem material",
      "Travado esperando material — resolva a falta em Compras.", `data-ir-falta="${esc(x.id)}"`);
    if (!x.prestadora) return `<button class="btn sm" data-editar-pedido="${esc(x.id)}" title="Sem prestadora o pedido não pode sair — escolha quem vai produzir">Definir prestadora</button>`;
    return `<button class="btn sm primary" data-enviar="${esc(x.id)}">Enviar</button>`;
  }
  if (x.status === "enviada") return `<button class="btn sm primary" data-chegou="${esc(x.id)}">Chegou</button> <button class="btn sm" data-conferir="${esc(x.id)}">Conferir</button>`;
  if (x.status === "chegou") {
    const comp = competenciaDe(x);
    if (comp && mesFechado(comp)) return espera("Mês fechado",
      `A conferência deste pedido cai em ${comp}, que já foi fechado. Reabra o mês em Prestadoras para conferir.`, `data-ir="prestadoras"`);
    return `<button class="btn sm primary" data-conferir="${esc(x.id)}">Conferir</button>`;
  }
  return "";
};

function pedLinha(x, v, c, novosDaAncora) {
  return `<tr data-linha="${esc(x.id)}" class="${S.sel.has(x.id) ? "on" : ""}${x.id === v.ultimo ? " recem" : ""}${novosDaAncora.has(x.id) ? " novo-fila" : ""}"${x.id === v.ultimo ? ' title="Foi o último que você abriu"' : novosDaAncora.has(x.id) ? ' title="Entrou na lista depois — por isso está no fim"' : ""}>
      <td>${PED_VIVO.includes(x.status) ? `<input type="checkbox" class="chk" data-selop="${esc(x.id)}" ${S.sel.has(x.id) ? "checked" : ""} aria-label="Selecionar pedido ${esc(x.numero)}">` : ""}</td>
      <td class="tcell"><div class="p"><span class="sku" style="font-size:12px">${esc(x.numero)}</span> ${corteCurto(x.prioridade)}${x.prioridadeTravada ? ' <span class="ic-inline" title="prioridade travada — a análise não mexe">${svg(IC.cadeado)}</span>' : ""}${(() => {
        if (x.prioridadeTravada) return "";
        const l2 = c.porSku.get(x.sku);
        const sug = l2 ? prioridadeDe(l2) : null;
        /* sugestão de mudança: uma seta e o código, sem caixa — não pode roubar
           a linha da prioridade que está valendo agora */
        return sug != null && sug !== x.prioridade ? `<span class="sug-prio ${sug < x.prioridade ? "sobe" : ""}" title="A situação de hoje sugere ${esc(CORTE[sug])} — use Aplicar análise para promover">→${CORTE_CURTO[sug]}</span>` : "";
      })()}</div>
        <div class="s mono">${fdate(x.criadoEm)}</div></td>
      <td class="tcell clickable" data-sku="${esc(x.sku)}"><div class="p sku sku-trunc" style="font-size:13px;letter-spacing:0" title="${esc(x.sku)} — ${esc(x.linha?.descricao || "")}">${esc(x.sku || "—")}</div>
        <div class="s s-contexto" title="${esc([x.linha?.classe, "curva " + (x.linha?.abc || "C"), setorDoPedido(x)?.nome, x.linha?.processo].filter(Boolean).join(" · "))}">${x.linha?.classe ? `<span class="tag dot ${CORCLASSE[x.linha.classe]}" style="font-size:var(--fs-nano);padding:1px 0" title="${esc(x.linha.classe)}${x.linha.motivo ? " — " + esc(x.linha.motivo) : ""}">${CLASSE_CURTA[x.linha.classe] || esc(x.linha.classe)}</span>` : ""}${`<span class="abc ${x.linha?.abc || "C"}">${x.linha?.abc || "C"}</span>`}${setorDoPedido(x) ? `<span class="s-txt">${esc(setorDoPedido(x).nome)}</span>` : ""}${x.linha?.processo ? `<span class="s-fixo">${esc(x.linha.processo)}</span>` : ""}${etiquetaPedidoCampanha(x)}<button class="lupa" data-loja="${esc(x.sku)}" title="Copiar o SKU e abrir na loja">${svg(IC.busca)}</button></div></td>
      <td class="tcell">${(() => {
        /* O rótulo do tipo ocupava uma linha inteira só para dizer uma palavra
           que nunca muda dentro da mesma etapa. Ele continua ali — é ele que
           distingue "quem está com a peça" de "quem acompanha" — mas agora
           divide a linha com o valor, que é o que a pessoa foi ler. Uma linha a
           menos vezes vinte e seis pedidos é meia tela. */
        /* o marcador vai abreviado porque ele divide a linha com o nome, e o
           nome é o que a pessoa foi ler. A palavra inteira fica no `title`. */
        const rotulo = (t2, cheio) => `<span class="cq-rot" title="${esc(cheio || t2)}">${t2}</span>`;
        if (x.status === "aberto" || x.status === "separando") return `
          <div class="p cq">${rotulo("EQUIPE", "A peça está com a equipe interna")}<select class="sel" data-resp="${esc(x.id)}" title="Quem da equipe interna cuida desta etapa"><option value="">— escolher —</option>${optEquipe(x.responsavel)}</select></div>
          ${x.prestadora ? `<div class="s">depois vai p/ <b>${esc(x.prestadora)}</b></div>` : ""}`;
        return `
          <div class="p cq">${rotulo("PREST", "A peça está com uma prestadora")}<b${x.prestadora ? ` title="${esc(x.prestadora)}"` : ""}>${x.prestadora ? esc(x.prestadora) : (x.status === "enviada" ? '<span class="tag amber">a definir</span>' : '<span style="color:var(--ink-4)">—</span>')}</b></div>
          ${x.status !== "retornada" ? `<div class="s cq"><select class="sel sel-mini" data-resp="${esc(x.id)}" title="Quem da equipe interna acompanha"><option value="">equipe: —</option>${optEquipe(x.responsavel)}</select></div>` : (x.responsavel ? `<div class="s">equipe: ${esc(x.responsavel)}</div>` : "")}`; })()}</td>
      <td class="num tcell">${n0(x.qtd)}${splitAdesivo(x) ? `<div class="s" style="justify-content:flex-end">${splitAdesivo(x)}</div>` : ""}</td>
      ${(() => { const l2 = x.linha;
        if (!l2) return '<td class="num" colspan="5" style="color:var(--ink-4)">sem linha de estoque</td>';
        return `<td class="num" style="width:1%">${l2.vendas ? n0(l2.vendas) : "—"}</td>
      <td class="num" style="width:1%"><b>${n0(l2.estoqueReal)}</b></td>
      <td class="num tcell" style="width:1%">${n0(l2.estMin)}${l2.minAjuste ? ` <span class="tag" style="font-size:9.5px;padding:0 4px" title="Ajustado aqui — a Magazord ainda tem ${n0(l2.estMinErp)}">aj.</span>` : ""}
        <div class="s" style="justify-content:flex-end"><span data-minsku="${esc(l2.sku)}" role="button" tabindex="0" style="cursor:pointer;text-decoration:underline dotted;${l2.divergeMin ? "color:var(--amber);font-weight:700" : ""}" title="Mínimo calculado pelas vendas do período · ${nMeses(l2.mesesSeg)} ${l2.mesesSeg === 1 ? "mês" : "meses"} de segurança${l2.regraMeses ? ` (regra do processo ${l2.regraMeses}, curva ${l2.abc})` : l2.externo ? " (padrão + 1 mês de fornecimento externo)" : ""}${l2.divergeMin ? " — bem diferente do que está em uso" : ""} · clique para revisar">sug. ${n0(l2.estMinCalc)}</span></div></td>
      <td class="num" style="width:1%">${pct(l2.pctEstoque)}</td>
      <td class="num" style="width:1%" title="Contando o que já está em produção">${pct(l2.pctComProducao)}</td>`; })()}
      <td class="col-sit">${situacao(x)}</td>
      <td class="col-acao">${acao(x)}
        ${x.status !== "retornada" ? `<div class="acoes-sec">
          <button class="ic-btn" data-editar-pedido="${esc(x.id)}" title="Editar este pedido" aria-label="Editar">${svg(IC.editar)}</button>
          <button class="ic-btn" data-reimprimir="${esc(x.id)}" title="Imprimir o canhoto deste pedido de novo — papel perdido ou trocar para cupom" aria-label="Reimprimir canhoto">${svg(IC.impressora)}</button>
          <button class="ic-btn" data-falta="${esc(x.id)}" title="Anotar material em falta" aria-label="Anotar falta de material">${svg(IC.alerta)}</button>
        </div>` : ""}</td>
    </tr>`;
}

function viewPedidos() {
  const c = S.calc, v = S.pedView;
  const rotuloBloco = (id) => { const a = S.analises.find((x) => x.id === id); return a ? `${a.rotulo} · ${fdate(a.executadaEm)}` : "migração"; };

  const conferidos = S.pedidos.filter((r) => r.status === "retornada")
    .sort((a, b) => String(b.retornadaEm || "").localeCompare(String(a.retornadaEm || "")))
    .map((r) => ({ ...r, op: opPorId(r.opId) || {}, sku: (opPorId(r.opId) || {}).sku || r.sku,
      linha: c.porSku.get((opPorId(r.opId) || {}).sku || r.sku) }));
  let r;
  if (v.etapa === "fila") r = c.fila;
  else if (v.etapa === "papel") r = c.papel;
  else if (v.etapa === "cortando") r = c.emCampo.filter((x) => x.status === "separando");
  else if (v.etapa === "prestadora") r = c.emCampo.filter((x) => x.status === "enviada");
  else if (v.etapa === "chegou") r = c.emCampo.filter((x) => x.status === "chegou");
  else if (v.etapa === "atraso") r = c.emCampo.filter((x) => x.atrasoProducao);
  else if (v.etapa === "atrasoconf") r = c.emCampo.filter((x) => x.atrasoConferencia)
    .sort((a, b2) => (b2.perdeuMes - a.perdeuMes) || (b2.diasParado - a.diasParado));
  else if (v.etapa === "avisar") r = c.emCampo.filter((x) => x.avisar && (x.status === "enviada" || x.status === "chegou"))
    .sort((a, b2) => (a.prioridade - b2.prioridade) || String(a.prestadora || "").localeCompare(String(b2.prestadora || "")));
  else if (v.etapa === "cobrar") r = c.emCampo.filter((x) => x.cobrar);
  else if (v.etapa === "adiantar") r = c.emCampo.filter((x) => x.adiantar);
  else if (v.etapa === "problema") r = [...c.papel, ...c.fila, ...c.emCampo].filter((x) => x.problemas?.length);
  else if (v.etapa === "material") r = [...c.papel, ...c.fila, ...c.emCampo].filter((x) => x.aguardandoMaterial);
  /* a etapa das remessas desenha a própria tabela mais abaixo: aqui a lista de
     pedidos fica vazia de propósito, senão a foto da ordem, os contadores e os
     filtros passariam a falar de pedidos que a tela nem está mostrando. */
  else if (v.etapa === "remessas") r = [];
  else if (v.etapa === "conferidos") r = conferidos;
  /* Cancelado não aparecia em chip nenhum: sumia da tela e continuava segurando
     o número. Era possível o app dizer "o número 2181 já existe" e a busca não
     achar 2181 em lugar algum. Agora ele tem onde ser visto. */
  else if (v.etapa === "cancelados") r = S.pedidos.filter((x) => x.status === "cancelado")
    .sort((a, b2) => String(b2.atualizadoEm || b2.criadoEm || "").localeCompare(String(a.atualizadoEm || a.criadoEm || "")))
    .map((x) => ({ ...x, op: opPorId(x.opId) || {}, sku: (opPorId(x.opId) || {}).sku || x.sku,
      linha: c.porSku.get((opPorId(x.opId) || {}).sku || x.sku) }));
  else r = [...c.papel, ...c.fila, ...c.emCampo];

  /* ---------- a ordem para de fugir enquanto se trabalha ----------
     A fila é ordenada por prioridade, curva e idade — todas coisas que mudam
     quando alguém edita o produto. Resultado: mexer num pedido fazia ele subir
     ou descer, e quem estava descendo a lista perdia de vista qual era.

     Agora a ordem é fotografada ao ENTRAR na etapa e mantida até se pedir outra.
     Quem chegou depois vai para o fim, marcado como novo — não se esconde
     ninguém, só não se embaralha o que já está na mão de alguém. */
  const ancorar = () => { S.pedView.ancora = { etapa: v.etapa, em: new Date().toISOString(),
    ids: r.map((x) => x.id) }; };
  const anc = S.pedView.ancora;
  let ordemPresa = false, quantasMudaram = 0;
  if (v.ord) { /* clicou num cabeçalho: é um pedido explícito de outra ordem */ }
  else if (!anc || anc.etapa !== v.etapa) ancorar();
  else {
    const pos = new Map(anc.ids.map((id, i) => [id, i]));
    const natural = r.map((x) => x.id);
    r = r.slice().sort((a, b2) => {
      const pa = pos.has(a.id) ? pos.get(a.id) : Infinity;
      const pb = pos.has(b2.id) ? pos.get(b2.id) : Infinity;
      return pa - pb;   /* quem não estava na foto vai para o fim, na ordem natural */
    });
    ordemPresa = true;
    quantasMudaram = natural.reduce((t, id, i) => t + (r[i]?.id === id ? 0 : 1), 0);
  }
  const novosDaAncora = new Set(ordemPresa ? r.filter((x) => !anc.ids.includes(x.id)).map((x) => x.id) : []);

  /* quantos pedidos a etapa tem ANTES dos filtros secundários — é o mesmo número do chip */
  const nEtapa = r.length;
  /* Quando a busca é um número de pedido que existe mas está fora deste chip,
     dizer "nenhum resultado" é mentira por omissão. A tela passa a apontar
     onde ele está — foi assim que o "existe o 2181 mas não acho o 2181"
     ficou possível. */
  const alvoBusca = (() => {
    const q = semPrefixoBipe(String(v.busca || "")).trim().toUpperCase();
    if (!q) return null;
    if (r.some((x) => String(x.numero || "").toUpperCase() === q)) return null;
    const semZeroQ = q.replace(/^0+/, "");
    const casa = (x) => { const nu = String(x.numero || "").toUpperCase();
      return nu === q || nu.replace(/^0+/, "") === semZeroQ; };
    const achado = S.pedidos.find(casa);
    if (achado) return { r: achado, destino: achado.status === "cancelado" ? "cancelados"
      : achado.status === "retornada" ? "conferidos" : "todos" };
    /* o número pode ser de uma remessa: elas dividem a sequência com os pedidos,
       e dizer "não existe" seria mentira — foi assim que o 2181 se perdeu antes */
    const rm = remessas().find(casa);
    if (rm) return { r: { numero: rm.numero, status: "remessa", prestadora: rm.prestadora, id: rm.id },
      destino: "remessas", remessa: rm };
    return null;
  })();

  if (v.corte !== "todos") r = r.filter((o) => o.prioridade === Number(v.corte));
  if (v.setor !== "todos") r = r.filter((o) => (setorDoPedido(o)?.nome || "—") === v.setor);
  if (v.abc && v.abc !== "todos") r = r.filter((o) => (o.abc || o.linha?.abc || "C") === v.abc);
  if (v.processo && v.processo !== "todos") r = r.filter((o) => (procDoPedido(o) || "—") === v.processo);
  if (v.fornecedor && v.fornecedor !== "todos") r = r.filter((o) => {
    const f2 = produtoDe(opPorId(o.opId)?.sku || o.sku)?.producao?.fornecedorId || null;
    return v.fornecedor === "__sem" ? !f2 : f2 === v.fornecedor; });
  /* O drill-down de Relatórios ("ver os pedidos DESTA prestadora") escrevia
     `pedView.prestadora` desde sempre, e ninguém lia: o campo não existia no
     estado inicial e nenhum filtro o consultava. O botão levava para Pedidos
     com a lista inteira, como se o filtro tivesse sido aplicado. */
  if (v.prestadora && v.prestadora !== "todas") {
    r = v.prestadora === "__sem" ? r.filter((o) => !o.prestadora)
                                 : r.filter((o) => o.prestadora === v.prestadora);
  }
  const b = v.busca.trim().toLowerCase();
  if (b) r = r.filter((o) => [o.sku, o.numero, o.prestadora, o.linha?.descricao].some((x) => String(x || "").toLowerCase().includes(b)));
  /* Filtros que escondem pedidos sem aparecer no chip da etapa. A busca é a pior:
     o bipe e o atalho do SKU escrevem nela sozinhos, e ela continua lá depois. */
  const filtrosAtivos = [];
  if (b) filtrosAtivos.push({ k: "busca", rot: `busca "${v.busca.trim()}"` });
  if (v.corte !== "todos") filtrosAtivos.push({ k: "corte", rot: `prioridade ${CORTE[Number(v.corte)] || v.corte}` });
  if (v.abc && v.abc !== "todos") filtrosAtivos.push({ k: "abc", rot: `curva ${v.abc}` });
  if (v.setor !== "todos") filtrosAtivos.push({ k: "setor", rot: `setor ${v.setor}` });
  if (v.processo && v.processo !== "todos") filtrosAtivos.push({ k: "processo", rot: `processo ${v.processo}` });
  if (v.fornecedor && v.fornecedor !== "todos") filtrosAtivos.push({ k: "fornecedor", rot: v.fornecedor === "__sem" ? "sem fornecedor definido"
    : `fornecedor ${(fornecedoresEmUso().find((f2) => f2.id === v.fornecedor) || {}).nome || "selecionado"}` });
  if (v.prestadora && v.prestadora !== "todas") filtrosAtivos.push({ k: "prestadora",
    rot: v.prestadora === "__sem" ? "sem prestadora definida" : `prestadora ${v.prestadora}` });
  const textoFiltros = filtrosAtivos.map((x) => x.rot).join(" · ");
  const btnLimpar = (cls) => `<button class="btn ${cls}" data-limparped="1" title="Volta busca, prioridade, curva, setor, processo, fornecedor e prestadora para Todos">Limpar filtros${filtrosAtivos.length ? ` (${filtrosAtivos.length})` : ""}</button>`;
  /* só aparece quando a ordem de fato já mudaria — calada quando não muda nada */
  const avisoOrdem = ordemPresa && (quantasMudaram || novosDaAncora.size)
    ? `<span class="ordem-presa" title="A ordem foi fotografada às ${horaCurta(new Date(anc.em))} e está sendo mantida para você não se perder">
        ${svg(IC.regua2)}Ordem mantida${quantasMudaram ? ` · ${n0(quantasMudaram)} ${quantasMudaram === 1 ? "mudaria de lugar" : "mudariam de lugar"}` : ""}${novosDaAncora.size ? ` · ${n0(novosDaAncora.size)} ${novosDaAncora.size === 1 ? "novo no fim" : "novos no fim"}` : ""}
        <button class="btn sm" data-act="reordenar-fila">Reordenar agora</button></span>`
    : "";
  if (v.ord) {
    const ORD_ST = { papel: 0, aberto: 1, separando: 2, enviada: 3, chegou: 4, retornada: 6, cancelado: 9 };
    const chave = (x) => v.ord === "numero" ? String(x.numero || "")
      : v.ord === "sku" ? String(x.sku || "")
      : v.ord === "resp" ? String(x.responsavel || "\uffff") /* sem responsável vai pro fim */
      : v.ord === "qtd" ? Number(x.qtd) || 0
      : v.ord === "vendas" ? Number(x.linha?.vendas) || 0
      : v.ord === "estreal" ? Number(x.linha?.estoqueReal) || 0
      : v.ord === "estmin" ? Number(x.linha?.estMin) || 0
      : v.ord === "pctest" ? (x.linha?.pctEstoque ?? 999)
      : v.ord === "pctprod" ? (x.linha?.pctComProducao ?? 999)
      : ORD_ST[x.status] || 9;
    r = [...r].sort((a, b) => { const ka = chave(a), kb = chave(b);
      const cmp = typeof ka === "number" ? ka - kb : String(ka).localeCompare(String(kb), undefined, { numeric: true });
      return cmp * v.dir; });
  }
  const total = r.length, vis = r.slice(0, v.limite);
  /* A lista já filtrada e ordenada, à mão para o crescimento incremental da
     rolagem — junto com o que o molde da linha precisa. Não é cache de cálculo:
     é o MESMO array que esta função acabou de montar. Toda vez que o render
     roda, ele é substituído, então filtro, ordenação e âncora continuam
     mandando e a rolagem nunca serve dado velho. */
  S._pedLista = r;
  S._pedCtx = { v, c, novosDaAncora };

  const chipE = (id, nome, n, tom) => `<button class="chip ${v.etapa === id ? "on" : ""}" data-fe="${id}">${nome}${n != null ? ` <b${tom ? ` style="color:var(--${tom})"` : ""}>${n}</b>` : ""}</button>`;
  const nAtraso = c.emCampo.filter((x) => x.cobrar).length;
  const nMat = [...c.fila, ...c.emCampo].filter((x) => x.aguardandoMaterial).length;
  const selecionadas = [...S.sel].filter((id) => c.fila.some((o) => o.id === id));

  /* ---------- situação: código curto na célula, frase inteira no title ----------
     A coluna trazia "1. Papel de Produção · aguardando impressão" em três linhas.
     Numa lista de 200 pedidos isso é texto para ler, não dado para comparar. */
  /* A interface impede o caminho errado em vez de avisar depois: quando a ação
     depende de alguma coisa, o botão vira a dependência — "Aguardando material",
     "Defina a prestadora" — e leva para onde ela se resolve. Botão que só dá
     erro ao ser clicado é armadilha. */

  const nAvisar = S.pedidos.filter((r) => r.avisar && (r.status === "enviada" || r.status === "chegou")).length;
  const nConf = c.emCampo.filter((x) => x.atrasoConferencia).length;
  const nMes = c.emCampo.filter((x) => x.perdeuMes).length;
  const nAtrasoProd = c.emCampo.filter((x) => x.atrasoProducao).length;
  const nAdiantar = c.emCampo.filter((x) => x.adiantar).length;
  const comProblema = [...c.papel, ...c.fila, ...c.emCampo].filter((x) => x.problemas?.length);
  const nCriticos = c.fila.filter((x) => x.prioridade === 0).length;
  const emAndamento = c.papel.length + c.fila.length + c.emCampo.length;
  const pecas = [...c.papel, ...c.fila, ...c.emCampo].reduce((s2, o) => s2 + (o.qtd || 0), 0);

  return `
  ${(() => {
    /* Resumo em uma linha, no lugar das seis caixas: cinco delas repetiam número por
       número os chips de etapa logo abaixo. Aqui fica só o que os chips não dizem —
       o volume em peças — e o que exige decisão agora. */
    const alerta = (n, txt, etapa, tom) => n ? `<button class="res-al ${tom}" data-fe="${etapa}">${n0(n)} ${txt}</button>` : "";
    /* Trabalhar por exceção: se 97 pedidos estão andando e 3 travaram, os 97 não
       podem competir com os 3. O número grande continua sendo o volume — mas
       quem lidera a linha é o que saiu do esperado. */
    const excecoes = new Set([...c.fila.filter((x) => x.prioridade === 0),
      ...c.emCampo.filter((x) => x.atrasoProducao || x.adiantar || x.atrasoConferencia
        || (x.avisar && (x.status === "enviada" || x.status === "chegou"))),
      ...[...c.papel, ...c.fila, ...c.emCampo].filter((x) => x.aguardandoMaterial || x.problemas?.length)]
      .map((x) => x.id)).size;
    return `<div class="resumo${excecoes ? " tem-excecao" : ""}">
      <div class="res-num">${excecoes
        ? `<b style="color:var(--perigo)">${n0(excecoes)}</b> ${excecoes === 1 ? "pedido precisa" : "pedidos precisam"} de atenção <span>· ${n0(emAndamento)} em andamento, ${n0(pecas)} peças</span>`
        : `<b>${n0(emAndamento)}</b> pedidos em andamento <span>· ${n0(pecas)} peças</span>`}</div>
      <div class="res-alertas">
        ${alerta(nCriticos, "críticos na fila", "fila", "perigo")}
        ${alerta(nAtrasoProd, "atrasadas", "atraso", "perigo")}
        ${alerta(nAdiantar, "a adiantar", "adiantar", "atencao")}
        ${alerta(nConf, nMes ? `a conferir atrasadas (${n0(nMes)} fora do mês)` : "a conferir atrasadas", "atrasoconf", "perigo")}
        ${alerta(nAvisar, "para avisar", "avisar", "atencao")}
        ${alerta(nMat, "sem material", "material", "perigo")}
        ${alerta(comProblema.length, "com cadastro incompleto", "problema", "atencao")}
        ${!nCriticos && !nAtrasoProd && !nAdiantar && !nConf && !nAvisar && !nMat && !comProblema.length ? '<span class="res-ok">Nada pendente de decisão</span>' : ""}
      </div></div>`; })()}
  <div class="card">
    <div class="filters">
      <div class="fb-linha fb-topo">
        <div class="search">${svg(IC.busca)}<input class="inp" id="q-ped" style="width:250px" placeholder="Buscar pedido, SKU, produto ou prestadora" value="${esc(v.busca)}"></div>
        <span style="font-size:12.5px;color:var(--ink-3)" class="mono">${v.etapa === "remessas"
          ? `${n0(remessas().length)} ${remessas().length === 1 ? "remessa" : "remessas"}`
          : `${total} pedidos${filtrosAtivos.length && nEtapa > total ? ` <span style="color:var(--amber)">de ${n0(nEtapa)}</span>` : ""}`}</span>
        ${avisoOrdem}
        ${(() => { const sec = filtrosAtivos.filter((x) => !["busca", "corte"].includes(x.k)).length;
          return `<button class="chip fb-btn-filtro ${v.filtrosAbertos || sec ? "on" : ""}" data-act="ped-filtros"
            title="Curva, setor, processo e fornecedor">${svg(IC.filtro)}Mais filtros${sec ? ` <b>${sec}</b>` : ""}</button>`; })()}
        <div class="fb-grupo" style="margin-left:auto">
          ${(() => { const p2 = S.estoque ? previaAnalise() : null;
            return `${p2 && p2.pedidosPromoviveis.length ? `<span class="tag amber" title="Pedidos vivos cuja prioridade mudaria com a análise de agora">${p2.pedidosPromoviveis.length} a promover</span>` : ""}
          <button class="btn sm" data-act="previa-analise" title="A mesma análise da Demanda: atualiza necessidade e prioridade de cada produto e promove/rebaixa os pedidos vivos. As travadas não mudam.">${svg(IC.raio)}Aplicar análise</button>`; })()}
          ${v.etapa === "avisar" ? `<button class="btn sm primary" data-act="avisar-prestadoras" title="Monta o recado por prestadora, pronto para colar no WhatsApp">${svg(IC.telefone)}Montar recados</button>` : ""}
          ${v.etapa === "fila" ? `<button class="btn sm" data-act="print-corte" title="Imprimir ou salvar em PDF">${svg(IC.impressora)}Ordem de corte</button>` : ""}
          ${v.etapa === "cortando" ? `<button class="btn sm" data-act="print-romaneio" title="Um romaneio por prestadora, com assinatura">${svg(IC.impressora)}Romaneio</button>` : ""}
          ${v.etapa === "papel" || v.etapa === "fila" || S.sel.size ? `<button class="btn sm ${v.etapa === "papel" || S.sel.size ? "primary" : ""}" data-act="print-papeis" title="Canhotos por processo, já preenchidos. Pedidos em '1. Papel' avançam para '2. Separar/Cortar' ao gerar.">${svg(IC.impressora)}Imprimir papéis${S.sel.size ? ` (${S.sel.size})` : ""}</button>` : ""}
          <button class="btn primary sm" data-act="novo-pedido">${svg(IC.mais)}Novo pedido</button>
        </div>
      </div>
      ${(() => { /* ---------- uma linha de fluxo, o resto guardado ----------
           A barra tinha quatro fileiras de chips abertas o tempo todo. Três delas
           quase nunca mudam no dia a dia, e a de "Atenção" repetia número por
           número os alertas do resumo logo acima. Agora: o fluxo fica à mostra,
           porque é por ele que se navega; o resto entra por um botão e volta
           resumido em etiquetas que dá para tirar uma a uma. */
        const abertos = !!v.filtrosAbertos;
        /* busca e prioridade ficam à vista na barra — não entram na conta do
           "Mais filtros" nem viram etiqueta, senão o mesmo estado apareceria duas vezes */
        const visiveis = ["busca", "corte"];
        const secundarios = filtrosAtivos.filter((x) => !visiveis.includes(x.k));
        const procs = [...new Set([...c.papel, ...c.fila, ...c.emCampo].map(procDoPedido).filter(Boolean))].sort();
        const fs = fornecedoresEmUso();
        return `
      ${alvoBusca ? `<div class="fb-linha"><div class="aviso" style="margin:0;width:100%;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span>O pedido <b>${esc(alvoBusca.r.numero)}</b> existe e está <b>${esc(P_LABEL[alvoBusca.r.status] || alvoBusca.r.status)}</b>${alvoBusca.r.prestadora ? ` · ${esc(alvoBusca.r.prestadora)}` : ""} — por isso não aparece nesta lista.</span>
        <button class="btn sm primary" style="margin-left:auto" data-fe="${alvoBusca.destino}">Ver onde ele está</button>
        ${alvoBusca.remessa ? `<button class="btn sm" data-abrirrem="${esc(alvoBusca.remessa.id)}">Abrir a remessa</button>`
          : `<button class="btn sm" data-ped-abrir="${esc(alvoBusca.r.id)}">Abrir o pedido</button>`}
      </div></div>` : ""}
      <div class="fb-linha">
        <span class="flabel">Fluxo</span>
        ${chipE("andamento", "Todos", emAndamento)}
        ${chipE("papel", "1. Papel", c.papel.length, c.papel.length ? "amber" : null)}
        ${chipE("fila", "2. Separar", c.fila.length)}
        ${chipE("cortando", "3. Cortado", c.emCampo.filter((x) => x.status === "separando").length)}
        ${chipE("prestadora", "4. Produção", c.emCampo.filter((x) => x.status === "enviada").length)}
        ${chipE("chegou", "5. Conferir", c.emCampo.filter((x) => x.status === "chegou").length)}
        ${chipE("conferidos", "6. Feito", null)}
        ${(() => { const nc = S.pedidos.filter((x) => x.status === "cancelado").length;
          return nc ? chipE("cancelados", "Cancelados", nc) : ""; })()}
        ${(() => { /* a remessa tem número oficial e faz parte do fluxo produtivo —
             então tem lugar aqui. Fica no fim, separada por um fio, porque é
             outra natureza de pedido e não pode se misturar com a fila. */
          /* o contador mostrava só as ABERTAS: com uma remessa encerrada e
             nenhuma aberta, o chip aparecia sem número nenhum no meio de sete
             chips numerados — e ninguém o achava. O número agora é o total, e a
             cor é que diz se há alguma esperando retorno. */
          const nr = remessas().length;
          return nr ? `<span class="divider"></span>${chipE("remessas", "Remessas", nr,
            remessasAbertas().length ? "amber" : null)}` : ""; })()}
        <span class="divider" style="margin-left:auto"></span>
        <span class="flabel">Prioridade</span>
        <div class="seg" role="group" aria-label="Prioridade">
          <button class="${v.corte === "todos" ? "on" : ""}" data-fc="todos">Todas</button>
          ${CORTES.map((p) => `<button class="${v.corte === String(p) ? "on" : ""}" data-fc="${p}" title="${esc(CORTE[p])}">${CORTE_CURTO[p]}</button>`).join("")}
        </div>
      </div>
      ${abertos ? `<div class="fb-painel">
        <div class="fb-linha">
          <span class="flabel">Curva</span>
          ${["todos", "A", "B", "C"].map((x) => `<button class="chip ${(v.abc || "todos") === x ? "on" : ""}" data-fabcped="${x}" title="Curva ABC do produto — A vende mais, C vende menos">${x === "todos" ? "Todas" : x}</button>`).join("")}
          <span class="divider"></span>
          <span class="flabel">Setor</span>
          <button class="chip ${v.setor === "todos" ? "on" : ""}" data-fsetor="todos">Todos</button>
          ${setores().map((st) => `<button class="chip ${v.setor === st.nome ? "on" : ""}" data-fsetor="${esc(st.nome)}">${esc(st.nome)}</button>`).join("")}
        </div>
        ${procs.length || fs.length ? `<div class="fb-linha">
          ${procs.length ? `<span class="flabel">Processo</span>
          <select class="sel" id="p-proc" style="max-width:210px"><option value="todos">Todos os processos</option>
          ${procs.map((p2) => `<option ${v.processo === p2 ? "selected" : ""}>${esc(p2)}</option>`).join("")}</select>` : ""}
          ${fs.length ? `<span class="flabel" style="margin-left:${procs.length ? "10px" : "0"}">Fornecedor</span>
            <select class="sel" id="p-forn" style="max-width:230px">
              <option value="todos">Todos os fornecedores</option>
              ${fs.map((f2) => `<option value="${esc(f2.id)}" ${v.fornecedor === f2.id ? "selected" : ""}>${esc(f2.nome)}</option>`).join("")}
              <option value="__sem" ${v.fornecedor === "__sem" ? "selected" : ""}>— sem fornecedor definido —</option>
            </select>` : ""}
          ${filtrosAtivos.length ? btnLimpar("sm ghost") : ""}
        </div>` : ""}
      </div>` : secundarios.length ? `<div class="fb-linha fb-ativos">
        <span class="flabel">Filtrando por</span>
        ${secundarios.map((x) => `<button class="fb-tira" data-tirarped="${x.k}" title="Tirar este filtro">${esc(x.rot)}<span>×</span></button>`).join("")}
        <button class="btn sm ghost" data-limparped="1">Limpar tudo</button>
      </div>` : ""}`; })()}
    </div>
    ${selecionadas.length ? `<div class="selbar"><b>${selecionadas.length}</b> ${selecionadas.length === 1 ? "pedido da fila selecionado" : "pedidos da fila selecionados"}
      <button class="btn sm" data-act="limpar-sel">Limpar</button>
      <button class="btn sm primary" style="margin-left:auto" data-act="separar-sel">Iniciar separação</button></div>` : ""}
    ${(() => { /* ---------- resumo do fornecedor em Pedidos ----------
         Espelha o resumo da Demanda: lá é o que falta comprar, aqui é o que já
         está rodando. Separa o que está garantido (cortado / com a prestadora)
         do que ainda depende de material (papel e fila de corte). */
      if (!v.fornecedor || v.fornecedor === "todos") return "";
      const nomeF = v.fornecedor === "__sem" ? "sem fornecedor definido"
        : (fornecedoresEmUso().find((f2) => f2.id === v.fornecedor)?.nome || "");
      const meus = [...c.papel, ...c.fila, ...c.emCampo].filter((x) => {
        const fid = produtoDe(opPorId(x.opId)?.sku || x.sku)?.producao?.fornecedorId || null;
        return v.fornecedor === "__sem" ? !fid : fid === v.fornecedor; });
      if (!meus.length) return `<div class="card" style="margin-bottom:12px;border-left:3px solid var(--line)">
        <div style="padding:12px 16px;font-size:13.5px">Nenhum pedido em andamento de <b>${esc(nomeF)}</b>.</div></div>`;
      const soma = (f2) => meus.filter(f2).reduce((t2, x) => t2 + (Number(x.qtd) || 0), 0);
      const naFila = soma((x) => x.status === "papel" || x.status === "aberto");
      const cortado = soma((x) => x.status === "separando");
      const comPrest = soma((x) => x.status === "enviada");
      const conferir = soma((x) => x.status === "chegou");
      const garantido = cortado + comPrest + conferir;
      const atrasados = meus.filter((x) => x.atrasoProducao).length;
      const bloco = (n2, rot, dica, cor) => n2 ? `<div style="min-width:96px">
        <div style="font-size:19px;font-weight:800;letter-spacing:-.02em;${cor ? `color:${cor}` : ""}">${n0(n2)}</div>
        <div style="font-size:10.5px;color:var(--ink-3);line-height:1.3" title="${esc(dica)}">${rot}</div></div>` : "";
      return `<div class="card" style="margin-bottom:12px;border-left:3px solid var(--ok)">
        <div style="padding:12px 16px 4px;display:flex;align-items:baseline;gap:14px;flex-wrap:wrap">
          <div><span style="font-size:26px;font-weight:800;letter-spacing:-.02em">${n0(garantido + naFila)}</span>
            <span style="font-size:13.5px;color:var(--ink-2)"> peças em andamento de <b>${esc(nomeF)}</b></span></div>
          <span class="tag">${n0(meus.length)} ${meus.length === 1 ? "pedido" : "pedidos"}</span>
          ${atrasados ? `<span class="tag red">${n0(atrasados)} ${atrasados === 1 ? "atrasado" : "atrasados"}</span>` : ""}
          <button class="btn sm" style="margin-left:auto" data-act="copiar-producao">Copiar lista</button>
        </div>
        <div style="padding:6px 16px 12px;display:flex;gap:26px;flex-wrap:wrap">
          ${bloco(naFila, "no papel e na fila", "ainda não cortadas — dependem de material", "var(--amber)")}
          ${bloco(cortado, "cortadas", "prontas para enviar à prestadora")}
          ${bloco(comPrest, "com a prestadora", "em produção fora")}
          ${bloco(conferir, "aguardando conferência", "voltaram e falta conferir")}
          ${garantido ? `<div style="min-width:96px;border-left:1px solid var(--line);padding-left:20px">
            <div style="font-size:19px;font-weight:800;letter-spacing:-.02em;color:var(--teal)">${n0(garantido)}</div>
            <div style="font-size:10.5px;color:var(--ink-3);line-height:1.3" title="cortadas + com a prestadora + a conferir — é o que a Demanda desconta da compra">garantidas</div></div>` : ""}
        </div>
        <div class="tw" style="max-height:min(38vh,320px)"><table class="t" style="font-size:12px"><thead><tr>
          <th>Pedido</th><th>SKU</th><th>Produto</th><th class="num">Qtd</th><th>Etapa</th><th>Com quem</th></tr></thead>
        <tbody>${meus.slice().sort((a2, b2) => (P_STATUS.indexOf(b2.status) - P_STATUS.indexOf(a2.status))
            || numeroDoPedido(a2.numero) - numeroDoPedido(b2.numero))
          .map((x) => { const sk2 = opPorId(x.opId)?.sku || x.sku; const pr2 = produtoDe(sk2);
            const fora2 = x.status === "enviada" || x.status === "chegou";
            return `<tr>
            <td class="sku">${esc(x.numero)}</td>
            <td class="sku">${esc(sk2 || "—")}</td>
            <td style="font-size:11.5px;color:var(--ink-2)">${esc(String(pr2?.descricao || "").slice(0, 34))}</td>
            <td class="num">${n0(x.qtd)}</td>
            <td><span class="tag ${x.atrasoProducao ? "red" : fora2 ? "teal" : ""}">${esc(P_LABEL[x.status])}${x.atrasoProducao ? ` · +${x.diasAtraso}d` : ""}</span></td>
            <td style="font-size:11.5px">${esc(fora2 ? (x.prestadora || "a definir") : (x.responsavel || "—"))}</td></tr>`; }).join("")}
        </tbody></table></div>
      </div>`; })()}
    ${S.pedView.etapa === "remessas" ? tabelaRemessasEmPedidos() : `<div class="tw"><table class="t t-ped"><colgroup><col style="width:32px"><col style="width:100px"><col style="width:21%"><col style="width:164px"><col style="width:66px"><col style="width:66px"><col style="width:66px"><col style="width:80px"><col style="width:56px"><col style="width:66px"><col style="width:12%"><col style="width:96px"></colgroup><thead>
    <tr class="grupos">
      <th colspan="3">Pedido</th>
      <th colspan="2">Produção</th>
      <th colspan="5">Estoque</th>
      <th colspan="2">Decisão</th>
    </tr>
    <tr>
      <th style="width:32px">${(() => { const selecionaveis = vis.filter((x) => x.status === "aberto" || x.status === "papel").map((x) => x.id);
        if (!selecionaveis.length) return "";
        const todos = selecionaveis.every((id) => S.sel.has(id));
        return `<input type="checkbox" class="chk" data-selall="${selecionaveis.join(",")}" ${todos ? "checked" : ""} title="${todos ? "Desmarcar" : "Selecionar"} os ${selecionaveis.length} pedidos imprimíveis da lista">`; })()}</th>
      ${(() => { const seta = (c2) => v.ord === c2 ? (v.dir === 1 ? " ↑" : " ↓") : "";
        /* `width:1%` faz a coluna encolher até o conteúdo. Para "Com quem" isso é
           ruim: o nome da prestadora é o dado, e ele virava "Malha…". Ela ganha
           um piso — largura suficiente para o marcador e o nome na mesma linha. */
        /* `.t-ped` é `table-layout:fixed`. Nela `min-width` não vale nada: quem
           manda é `width`, e `width:1%` (o "justo") encolhe a coluna até o
           conteúdo. Era isso que fazia "Malharia Lu" virar "Malha…" mesmo
           depois de eu ter dado um piso à coluna — o piso era ignorado.
           Colunas com largura declarada não levam o "justo". */
        /* A largura das colunas mora no `<colgroup>` logo acima, e é ele que
           manda em `table-layout:fixed` — `width` no `th` é ignorado. Foi por
           isso que o piso que eu tinha dado a "Com quem" não fez efeito
           nenhum e "Malharia Lu" continuou virando "Malha…".
           Os números e as porcentagens saíram de % para PIXEL pelo mesmo motivo
           da Demanda: número monoespaçado precisa de largura fixa, não de uma
           fatia que encolhe junto com a janela. */
        const thq = (c2, lbl, cls) => `<th class="${cls || ""}" style="cursor:pointer;white-space:nowrap" data-ordq="${c2}" title="Ordenar (3º clique volta à ordem da fila)">${lbl}${seta(c2)}</th>`;
        return thq("numero", "Pedido", null, 1) + thq("sku", "SKU")
          + thq("resp", "Com quem", null, 1)
          + thq("qtd", "Qtd", "num", 1) + thq("vendas", "Vendas", "num", 1)
          + thq("estreal", "Est. real", "num", 1) + thq("estmin", "Mínimo", "num", 1)
          + thq("pctest", "%Est.", "num", 1) + thq("pctprod", "% prod.", "num", 1)
          + thq("situacao", "Situação"); })()}
      <th class="col-acao" style="width:1%">Ação</th>
    </tr></thead><tbody>${vis.map((x) => pedLinha(x, v, c, novosDaAncora)).join("")
      || (filtrosAtivos.length && nEtapa > 0
        ? vazioLinha("filtro", "Nenhum resultado",
            `<b>${n0(nEtapa)}</b> ${nEtapa === 1 ? "pedido está" : "pedidos estão"} nesta etapa, ${nEtapa === 1 ? "escondido" : "todos escondidos"} pelos filtros.<br>Ativos agora: <b>${esc(textoFiltros)}</b>`,
            btnLimpar("primary sm"))
        : v.etapa === "fila"
        ? vazioLinha("nada", "Nada aguardando corte",
            "Os pedidos nascem na <b>Demanda</b>: veja a coluna <b>Falta programar</b> e toque em <b>Criar pedidos</b>.",
            `<button class="btn primary sm" data-ir="demanda">Abrir Demanda</button>`)
        : vazioLinha("pronto", "Nada pendente aqui", "Nenhum pedido nesta etapa."))}
    </tbody></table></div>
    ${total > v.limite ? `<div style="padding:14px;text-align:center;border-top:1px solid var(--line-2)"><button class="btn" data-act="mais-ped">Mostrar mais</button></div>` : ""}`}
    <details class="legenda"><summary>Como ler esta tabela</summary><div class="legenda-in" style="display:block;line-height:2">
      <div><b>Prioridade</b> ${CORTES.map((p2) => `${corteCurto(p2)}${CORTE[p2] !== CORTE_CURTO[p2] ? ` <span style="color:var(--ink-3)">${CORTE[p2]}</span>` : ""}`).join(" &nbsp;·&nbsp; ")}</div>
      <div><b>Colunas</b> agrupadas por assunto, separadas por um fio: <b>pedido</b> · <b>produção</b> (com quem, quanto) · <b>estoque</b> (vendas, real, mínimo, %) · <b>situação e ação</b>.</div>
      <div><b>Situação</b> mostra o código; passe o cursor para ler a frase inteira.</div>
      ${v.etapa === "fila" || v.etapa === "andamento" ? `<div><b>Ordem da fila</b> prioridade → curva A antes de B e C → o mais antigo primeiro. É só seguir de cima para baixo.</div>` : ""}
    </div></details>
  </div>`;
}

/* ---------- as remessas vistas da aba Pedidos ----------
   NÃO é um segundo registro. É o mesmo objeto de `S.remessas`, desenhado com as
   colunas que interessam a quem está olhando o fluxo de pedidos. Duplicar o dado
   em `S.pedidos` daria um número em dois lugares que podem discordar — e o dia
   em que discordassem ninguém saberia qual dos dois é o certo.

   Por isso as ações aqui abrem exatamente as mesmas janelas da aba Semiacabados:
   registrar retorno e encerrar mexem no mesmo registro, de onde quer que se
   clique. */
function tabelaRemessasEmPedidos() {
  const v = S.pedView;
  let lista = remessas().slice();
  const b = String(v.busca || "").trim().toLowerCase();
  if (b) lista = lista.filter((r) => (String(r.numero) + " " + r.prestadora + " " + remessaResumo(r) + " " + (r.obs || "")).toLowerCase().includes(b));
  lista = lista.sort((a, y) => {
    const pa = situacaoRemessa(a).id === "encerrada" ? 1 : 0;
    const py = situacaoRemessa(y).id === "encerrada" ? 1 : 0;
    return pa - py || String(y.data || y.em).localeCompare(String(a.data || a.em));
  });
  const abertas = lista.filter(remessaAberta).length;
  return `<div class="aviso" style="margin:0 16px 12px;border-color:var(--teal);background:var(--teal-soft)">
      <b>Remessas de semiacabado.</b> Bandana que saiu para a prestadora ainda sem contagem de peças.
      Têm número da mesma sequência dos pedidos, mas não são pedido de produção: não têm SKU, não entram na Demanda e a quantidade só nasce no retorno.
      É o <b>mesmo registro</b> que aparece em <b>Semiacabados</b> — o que você fizer aqui vale lá.</div>
    ${lista.length ? `<div class="tw"><table class="t">
      <thead><tr><th>Pedido</th><th>Prestadora</th><th>Produto</th><th>Saiu</th><th>Volume</th>
        <th class="num">Qtd. enviada</th><th class="num">Retornado</th><th>Situação</th><th class="col-acao">Ação</th></tr></thead>
      <tbody>${lista.map((r) => { const st = situacaoRemessa(r); const vt = voltouNaRemessa(r);
        const d = diasDaRemessa(r);
        return `<tr>
          <td class="tcell"><div class="p"><span class="sku" style="font-size:12px">${esc(r.numero)}</span>
            <span class="sit" title="Remessa de semiacabado — não é pedido de produção">REMESSA</span></div>
            ${r.numeroAntigo ? `<div class="s mono" title="Número que ela tinha antes de entrar na sequência dos pedidos">era nº ${esc(String(r.numeroAntigo))}</div>` : ""}</td>
          <td><span class="pessoa">${avatar(r.prestadora)}<b>${esc(primeiroNome(r.prestadora))}</b></span></td>
          <td>${esc(remessaResumo(r) || "—")}</td>
          <td class="tcell">${fdate(r.data || r.em)}${d != null && st.id !== "encerrada" ? `<div class="s mono">há ${d === 0 ? "menos de um dia" : n0(d) + (d === 1 ? " dia" : " dias")}</div>` : ""}</td>
          <td>${r.volumeQtd ? `${n0(r.volumeQtd)} ${esc(r.volumeUn)}${r.volumeQtd > 1 ? "s" : ""}` : '<span style="color:var(--ink-4)">—</span>'}</td>
          <td class="num">${st.id === "encerrada"
            ? '<span style="color:var(--ink-4)" title="Nunca foi contada: na saída controla-se volume, e esta remessa já foi encerrada">não contada</span>'
            : '<span class="tag" title="Na saída não se conta peça — só volume. A quantidade nasce no retorno.">em aberto</span>'}</td>
          <td class="num">${vt.total ? `<b>${n0(vt.total)}</b>` : '<span style="color:var(--ink-4)">—</span>'}</td>
          <td><span class="tag dot ${st.tom}">${esc(st.nome)}</span></td>
          <td class="col-acao"><div style="display:flex;gap:5px;justify-content:flex-end">
            ${st.id === "encerrada" ? "" : `<button class="btn sm primary" data-retornorem="${esc(r.id)}">Registrar retorno</button>
              <button class="btn sm ghost" data-encerrarrem="${esc(r.id)}">Encerrar</button>`}
            <button class="btn sm" data-abrirrem="${esc(r.id)}" title="Abrir a remessa em Semiacabados">Abrir</button>
          </div></td>
        </tr>`; }).join("")}
      </tbody></table></div>`
    : vazio(b ? "filtro" : "nada", b ? "Nenhuma remessa com esse texto." : "Nenhuma remessa registrada.",
        b ? "Limpe a busca para ver todas." : "Uma remessa é uma ida de bandana para a prestadora, antes de virar SKU. Ela nasce em <b>Semiacabados</b>.",
        b ? "" : `<button class="btn primary" data-ir="semiacabados">Ir para Semiacabados</button>`)}
    ${abertas ? `<p class="hint" style="padding:0 16px 14px;margin:0">${n0(abertas)} ${abertas === 1 ? "remessa está" : "remessas estão"} com prestadora. Elas não são encerradas sozinhas pelo primeiro retorno — quem encerra é você.</p>` : ""}`;
}

/* ---------- Tarefas ---------- */
function viewTarefas() {
  const c = S.calc, quem = S.tarefas.quem;
  const ativos = S.equipe.filter((p) => p.ativo !== false);
  if (!ativos.length) return `<div class="card empty"><div class="ic">${svg(IC.equipe)}</div>
    <h3>Cadastre a equipe primeiro</h3>
    <p>Cada pedido de produção vira uma tarefa na etapa em que está. Com a equipe cadastrada, cada pessoa abre o app e vê só o que é dela.</p>
    <button class="btn primary" data-ir="equipe">Ir para Equipe</button></div>`;

  const eu = ativos.find((p) => p.nome === quem);
  let lista = c.tarefas;
  if (eu) {
    const f = eu.funcoes || [];
    lista = [...lista.filter((t) => t.responsavel === eu.nome),
             ...lista.filter((t) => !t.responsavel && (f.includes(t.funcao) || (t.funcaoAlt && f.includes(t.funcaoAlt))))];
  }
  lista = lista.sort((a, b) => b.score - a.score);

  const cards = lista.slice(0, 40).map((t) => `
    <div class="tarefa ${t.urgente ? "urg" : ""}">
      ${thumb(produtoDe(t.sku))}
      <div class="info">
        <h4>${esc(t.titulo)} · Pedido ${esc(t.ref || "")}</h4>
        <div class="meta"><b>${n0(t.qtd)} peças</b> de ${esc(t.linha?.descricao || t.sku)}${t.split ? ` <b style="color:var(--teal)">(${t.split})</b>` : ""}<br>
          <span class="sku">${esc(t.sku)}</span>${t.setorNome ? " · " + esc(t.setorNome) : ""}${t.prestadora ? " · " + esc(t.prestadora) : ""}
          · ${CORTE[t.prioridade]}${t.posicao ? ` · posição ${t.posicao} da fila` : ""}</div>
        <div style="margin-top:8px">${t.aguardandoMaterial ? '<span class="tag red">aguardando material</span> ' : ""}
          ${!t.responsavel ? '<span class="tag">sem responsável</span>'
            : (eu && t.responsavel !== eu.nome ? pessoa(t.responsavel) : "")}</div>
      </div>
      <div class="acao">
        ${t.urgente ? `<span class="tag red dot">${t.atraso > 0 ? t.atraso + " dias além do prazo" : (t.status === "aberto" ? "P1 · Urgente" : "estoque crítico")}</span>`
          : `<span class="tag">${t.status === "aberto" ? "posição " + t.posicao : Math.max(0, Math.round((t.lead || 0) - (t.idade ?? 0))) + " dias restantes"}</span>`}
        <button class="btn primary sm" style="justify-content:center" data-${t.status === "aberto" ? "separar" : (t.status === "separando" ? "enviar" : "conferir")}="${esc(t.id)}">${esc(t.acao)}</button>
        <button class="btn sm" style="justify-content:center" data-falta="${esc(t.id)}">Falta material</button>
        ${!t.responsavel && eu ? `<button class="btn sm ghost" style="justify-content:center" data-assumir="${esc(t.id)}">Assumir</button>` : ""}
      </div>
    </div>`).join("") || vazio("pronto", "Nada pendente aqui",
      `Nenhuma tarefa aberta para ${eu ? esc(eu.nome) : "os filtros atuais"}.`);

  /* Antes: um cartão para o filtro e mais um cartão por tarefa — quarenta molduras
     empilhadas para uma coisa só, que é uma lista. Agora é uma superfície com
     faixas: quem está usando, a nota, e as tarefas separadas por fio. */
  return `<div class="card lista-tarefas">
    <div class="quem">
      <span style="font-size:12px;font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:.07em">Quem está usando</span>
      <button class="${!quem ? "on" : ""}" data-quem="">Todas</button>
      ${ativos.map((p) => `<button class="${quem === p.nome ? "on" : ""}" data-quem="${esc(p.nome)}">${avatar(p.nome)}${esc(p.nome)}</button>`).join("")}
    </div>
    <div style="padding:10px 24px;font-size:12.5px;color:var(--ink-3);border-bottom:1px solid var(--line)">
      ${eu ? `Tarefas de ${esc(eu.nome)} e as livres nas funções dela` : "Todas as tarefas abertas"} — na ordem da fila. Pedidos aguardando material descem para o fim.
    </div>${cards}</div>`;
}

