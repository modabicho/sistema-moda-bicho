/* ---------- Estoque ----------
   A aba existe por causa de quem trabalha nela: registrar o que a prestadora
   levou é trabalho de balcão, e quem faz isso nem sempre pode ver Prestadoras
   (pagamento, fechamento, perfil). Por isso o controle mora aqui, com permissão
   própria — e não escondido dentro de uma aba de administração. */


/* ---------- o cadastro do terceiro estoque ----------
   Deliberadamente curto. O cadastro de insumo pede código, categoria, mínimo,
   fornecedor — coisas que fazem sentido para quem compra e nenhum para quem
   está anotando que a Sandra levou uma tesoura. Aqui é nome, unidade, tipo. */
function viewBens() {
  const lista = bens().filter((b) => b.ativo !== false)
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  const un = (val, attr) => `<select class="sel" ${attr} style="width:104px">${INS_UNIDADES.map((u) =>
    `<option ${String(val || "un") === u ? "selected" : ""}>${u}</option>`).join("")}</select>`;
  return `
  <div class="card">
    <div class="card-h"><h2>Itens que saem com as prestadoras</h2>
      <span class="sub">caixa, máquina, tesoura, linha, fio — o que é da empresa e vai para fora</span></div>
    <div style="padding:12px 14px">
      <div class="item-novo">
        <input class="inp" id="bem-nome" placeholder="Nome — ex.: Caixa organizadora grande" style="flex:2;min-width:190px">
        ${un("un", 'id="bem-un"')}
        <select class="sel" id="bem-tipo" style="width:150px">${BEM_TIPOS.map(([id, rot]) =>
          `<option value="${id}">${rot}</option>`).join("")}</select>
        <button class="btn primary" data-act="bem-add">${svg(IC.mais)}Adicionar</button>
      </div>
      <div class="hint" style="margin-top:7px">Estes itens <b>não são insumos</b>: não entram em receita, em reserva de produção nem no cálculo de compra.
        Uma máquina que vai e volta e um cone de linha que fica lá são a mesma coisa aqui — o que importa é saber com quem estão.</div>
    </div>
    <div class="tw" style="max-height:none"><table class="t">
      <thead><tr><th>Item</th><th>Unidade</th><th>Tipo</th><th>Embalagem fechada</th><th>Anda junto com</th>
        <th class="num">Fora da empresa</th><th>Ação</th></tr></thead>
      <tbody>${lista.map((b) => { const fora = emPosseDoBem(b.id);
        return `<tr>
        <td><input class="inp" data-bem="${esc(b.id)}|nome" value="${esc(b.nome || "")}" style="min-width:180px">
          ${b.insumoId && insumoPorId(b.insumoId) ? `<div style="font-size:11px;color:var(--ink-3)">também é o insumo <b>${esc(insumoPorId(b.insumoId).nome)}</b></div>` : ""}</td>
        <td>${un(b.unidade, `data-bem="${esc(b.id)}|unidade"`)}</td>
        <td><select class="sel" data-bem="${esc(b.id)}|tipo" style="width:150px">${BEM_TIPOS.map(([id, rot]) =>
          `<option value="${id}" ${b.tipo === id ? "selected" : ""}>${rot}</option>`).join("")}</select></td>
        <td style="white-space:nowrap">
          <input class="inp" data-bem="${esc(b.id)}|embNome" value="${esc(b.embalagem?.nome || "")}" placeholder="—" style="width:108px">
          <input type="number" min="0" step="any" class="inp num" data-bem="${esc(b.id)}|embFator" value="${b.embalagem?.fator ?? ""}" placeholder="qtd" style="width:80px"></td>
        <td style="min-width:200px"><div style="display:flex;gap:6px;align-items:center">
          <div style="flex:1;min-width:0">${pickBem(b.junto?.bemId || "", `data-bem="${esc(b.id)}|juntoId"`, { placeholder: "—" })}</div>
          ${b.junto?.bemId ? `<span style="font-size:11px;color:var(--ink-3);white-space:nowrap">a cada
            <input type="number" min="1" step="1" class="inp num" data-bem="${esc(b.id)}|juntoACada" value="${b.junto.aCada ?? 2}" style="width:50px"> vai
            <input type="number" min="0" step="any" class="inp num" data-bem="${esc(b.id)}|juntoSugerir" value="${b.junto.sugerir ?? 1}" style="width:50px"></span>` : ""}
        </div></td>
        <td class="num">${fora ? `<b>${nDec(fora)}</b> ${esc(b.unidade || "un")}` : '<span style="color:var(--ink-4)">—</span>'}</td>
        <td>${fora ? '<span class="hint" title="Enquanto houver item na mão de alguém, ele não sai da lista">em uso</span>'
          : `<button class="btn sm ghost" data-bem-tirar="${esc(b.id)}">Arquivar</button>`}</td>
      </tr>`; }).join("")
        || vazioLinha("nada", "Nenhum item cadastrado ainda",
          "Escreva o nome ali em cima e clique em Adicionar — ou crie na hora, direto na tela de saída.")}
      </tbody></table></div>
    <div style="padding:12px 14px;display:flex;gap:9px;align-items:center;flex-wrap:wrap">
      <span style="font-size:12px;color:var(--ink-3)">Este item também é um insumo que vocês compram (a etiqueta é o caso):</span>
      <div style="width:230px">${pickInsumo("", 'data-bem-insumo="1"', { placeholder: "procurar insumo…" })}</div>
    </div>
    <details class="legenda"><summary>Como ler esta tabela</summary><div class="legenda-in">
      <span><b>Anda junto com</b> é a sugestão do balcão: dois fios balão pedem uma linha, e o app oferece a segunda linha já preenchida.</span>
      <span>Ligar um item a um <b>insumo</b> serve para a Conferência abater sozinha o que virou peça — hoje só a etiqueta precisa disso.</span>
    </div></details>
  </div>`;
}

/* ---------- o que está fora da fábrica, de relance ----------
   A tela individual responde "e a Sandra?". Esta responde "e todas?" — que é a
   pergunta de quem vai comprar e de quem vai separar. */
function viewMateriaisPrest() {
  const v = S.posseView;
  const SIT = [["abertas", "Em posse"], ["todas", "Tudo"], ["devolvidas", "Devolvidas"]];
  let linhas = posseItens().slice();
  if (v.prest !== "todas") linhas = linhas.filter((x) => x.prestadora === v.prest);
  if (v.sit === "abertas") linhas = linhas.filter((x) => emPosseDe(x) > 0);
  else if (v.sit === "devolvidas") linhas = linhas.filter((x) => emPosseDe(x) <= 0);
  const b = String(v.busca || "").trim().toLowerCase();
  if (b) linhas = linhas.filter((x) => [bemPorId(x.bemId)?.nome, x.prestadora, x.obs]
    .some((t) => String(t || "").toLowerCase().includes(b)));
  linhas.sort((a, y) => String(y.saiuEm).localeCompare(String(a.saiuEm)));
  const total = linhas.length;
  const vis = linhas.slice(0, v.limite);

  const quem = prestadorasComPosse();
  const abertas = posseItens().filter((x) => emPosseDe(x) > 0);
  const parciais = abertas.filter((x) => somaBaixas(x) > 0).length;
  const nRepor = aReporNasPrestadoras().length;

  return `
  <div class="kpis">
    ${kpi("Prestadoras com material", quem.length, "algo da empresa na mão delas", quem.length ? "teal" : "")}
    ${kpi("Saídas em aberto", abertas.length, parciais ? `${n0(parciais)} ${parciais === 1 ? "devolvida em parte" : "devolvidas em parte"}` : "nada devolvido ainda", abertas.length ? "amber" : "")}
    ${kpi("A repor", nRepor, "abaixo do mínimo combinado", nRepor ? "red" : "")}
  </div>
  <div class="card">
    <div class="filters">
      <div class="search">${svg(IC.busca)}<input class="inp" id="q-posse" style="width:220px" placeholder="Buscar item ou prestadora" value="${esc(v.busca)}"></div>
      ${SIT.map(([id, rot]) => `<button class="chip ${v.sit === id ? "on" : ""}" data-fposse="${id}">${rot}</button>`).join("")}
      <span class="divider"></span>
      <select class="sel" id="f-posse-prest"><option value="todas">Todas as prestadoras</option>
        ${quem.map((n) => `<option value="${esc(n)}" ${v.prest === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
      <button class="btn primary sm" style="margin-left:auto" data-act="nova-retirada">${svg(IC.caminhao)}Prestadora veio buscar</button>
      <button class="btn sm" data-act="nova-devolucao">${svg(IC.setaEsq)}Devolveu</button>
    </div>
    <div class="tw" style="max-height:none"><table class="t">
      <thead><tr><th>Item</th><th class="num">Quantidade</th><th>Data da saída</th><th>Prestadora</th><th>Situação</th><th>Data do retorno</th><th>Ação</th></tr></thead>
      <tbody>${vis.map((x) => { const bm = bemPorId(x.bemId); const sit = situacaoPosse(x);
        const resta = emPosseDe(x), dev = devolvidoDe(x), cons = consumidoDe(x);
        return `<tr>
          <td><b>${esc(bm?.nome || "item removido")}</b>${bm?.tipo === "equipamento" ? ' <span class="tag">equipamento</span>' : ""}</td>
          <td class="num">${nDec(x.qtd)} ${esc(bm?.unidade || "un")}${dev || cons ? `<div style="font-size:11px;color:var(--ink-3)">${resta ? `${nDec(resta)} ainda com ela` : "nada mais com ela"}</div>` : ""}</td>
          <td class="mono" style="font-size:12px">${fdate(x.saiuEm)}</td>
          <td><span class="pessoa">${avatar(x.prestadora)}${esc(x.prestadora)}</span></td>
          <td><span class="tag ${sit.tom === "ok" ? "teal" : sit.tom === "aviso" ? "amber" : ""}">${esc(sit.nome)}</span>
            ${cons ? `<div style="font-size:11px;color:var(--ink-3)">${nDec(cons)} viraram peça</div>` : ""}</td>
          <td class="mono" style="font-size:12px">${fdate(retornoDe(x)) || '<span style="color:var(--ink-4)">—</span>'}</td>
          <td style="white-space:nowrap">${resta > 0
            ? `<button class="btn sm" data-posse-dev="${esc(x.id)}" title="Registrar que ela devolveu">Devolver</button>` : ""}
            <button class="btn sm ghost" data-hist-prest="${esc(x.prestadora)}">Histórico</button></td>
        </tr>`; }).join("")
        || vazioLinha(posseItens().length ? "filtro" : "nada",
          posseItens().length ? "Nenhuma saída com estes filtros" : "Nada saiu da empresa ainda",
          posseItens().length ? "Troque a situação ou a prestadora ali em cima."
            : "Quando a prestadora vier buscar caixa, máquina ou linha, use o botão acima.",
          `<button class="btn primary sm" data-act="nova-retirada">Prestadora veio buscar</button>`)}
      </tbody></table></div>
    ${total > vis.length ? `<div style="padding:12px;text-align:center;border-top:1px solid var(--line-2)">
      <button class="btn sm" data-act="mais-posse">Mostrar mais (${n0(total - vis.length)})</button></div>` : ""}
    <details class="legenda"><summary>Como ler esta tabela</summary><div class="legenda-in">
      <span>Cada linha é <b>uma saída</b>. Duas caixas que saíram juntas são uma linha só — devolver uma deixa a linha em <b>Parcial</b>, com a outra ainda em posse.</span>
      <span>Estes materiais <b>não são insumos</b>: não entram em receita, em reserva de produção nem no cálculo de compra. São bens da empresa que estão fora dela.</span>
    </div></details>
  </div>
  ${(() => { const prods = posses().filter((p) => p.status !== "encerrada"
      && (v.prest === "todas" || p.prestadora === v.prest));
    return prods.length ? `<div class="card" style="margin-top:14px">
      <div class="card-h"><h2>Produção em posse</h2><span class="sub">lotes de corte que estão com elas</span></div>
      <div class="tw" style="max-height:none"><table class="t">
        <thead><tr><th>Produção</th><th>Prestadora</th><th>Desde</th><th>Ação</th></tr></thead>
        <tbody>${prods.sort((a, b2) => String(b2.data || b2.em).localeCompare(String(a.data || a.em))).map((p) => `<tr>
          <td><b>${esc(posseRotulo(p))}</b></td>
          <td><span class="pessoa">${avatar(p.prestadora)}${esc(p.prestadora)}</span></td>
          <td class="mono" style="font-size:12px">${fdate(p.data || p.em)}</td>
          <td><button class="btn sm ghost" data-posse-fim="${esc(p.id)}" title="Use quando voltou sem passar por um pedido">Encerrar</button></td>
        </tr>`).join("")}</tbody></table></div>
      <details class="legenda"><summary>Como ler esta tabela</summary><div class="legenda-in">
        <span>Bandana sai por lote de corte, sem SKU e sem contagem — de propósito. Quando há pedido, quem encerra é a <b>Conferência</b>.</span>
      </div></details>
    </div>` : ""; })()}`;
}

/* ---------- a lista de separação ----------
   Deliberadamente fora de Compras: comprar e separar para mandar são ações
   diferentes, de pessoas diferentes, em horas diferentes do dia. O que as liga é
   o botão de falta, que escreve na mesma lista que Compras lê. */
function viewEnviarPrest() {
  const grupos = aReporNasPrestadoras();
  return `
  <div class="card">
    <div class="filters"><b style="font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3)">O que separar para a próxima retirada</b>
      <button class="btn primary sm" style="margin-left:auto" data-act="nova-retirada">${svg(IC.caminhao)}Prestadora veio buscar</button></div>
    ${grupos.length ? grupos.map((g) => `
      <div class="card-h" style="background:var(--paper-2)"><h3>${esc(g.prestadora)}</h3>
        <span class="sub">${g.itens.length} ${g.itens.length === 1 ? "item abaixo do mínimo" : "itens abaixo do mínimo"}</span>
        <button class="btn sm" style="margin-left:auto" data-act="nova-retirada" data-prest="${esc(g.prestadora)}">Registrar saída</button></div>
      <div class="tw" style="max-height:none"><table class="t" style="font-size:12.5px">
        <thead><tr><th>Item</th><th class="num">Com ela</th><th class="num">Mínimo</th><th class="num">Separar</th><th>Ação</th></tr></thead>
        <tbody>${g.itens.map((x) => `<tr>
          <td><b>${esc(x.bem.nome)}</b>${temEmbalagem(x.bem) ? `<div style="font-size:11px;color:var(--ink-3)">1 ${esc(x.bem.embalagem.nome)} = ${nDec(x.bem.embalagem.fator)} ${esc(x.bem.unidade || "un")}</div>` : ""}</td>
          <td class="num">${nDec(x.com)}</td>
          <td class="num">${nDec(x.minimo)}</td>
          <td class="num"><b>${nDec(x.faltam)} ${esc(x.bem.unidade || "un")}</b>${temEmbalagem(x.bem) ? `<div style="font-size:11px;color:var(--ink-3)">${nDec(Math.ceil(x.faltam / x.bem.embalagem.fator))} ${esc(x.bem.embalagem.nome)}${Math.ceil(x.faltam / x.bem.embalagem.fator) === 1 ? "" : "s"}</div>` : ""}</td>
          <td>${x.bem.insumoId && insumoPorId(x.bem.insumoId)
            ? `<button class="btn sm ghost" data-prest-falta="${esc(x.bem.insumoId)}|${esc(g.prestadora)}" title="Este item também é um insumo — anota na mesma lista que a aba Compras acompanha">${svg(IC.mais)}Informar falta</button>`
            : `<span class="hint">separar e registrar a saída</span>`}</td>
        </tr>`).join("")}
        </tbody></table></div>`).join("")
    : vazio("pronto", "Ninguém abaixo do mínimo", "Defina o mínimo de cada item na ficha da prestadora — é ele que faz esta lista aparecer sozinha.")}
    <details class="legenda"><summary>Como ler esta tabela</summary><div class="legenda-in">
      <span><b>Separar</b> é quanto falta para ela voltar ao mínimo combinado — quem sabe se a fábrica tem para mandar é você, porque estes itens não são estoque de compra.</span>
      <span>Quando o item também for um insumo (a etiqueta é o caso), <b>Informar falta</b> escreve na mesma lista que a aba Compras acompanha.</span>
    </div></details>
  </div>`;
}

