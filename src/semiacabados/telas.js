/* ---------- telas ---------- */

/* ==========================================================================
   SEMIACABADOS — as telas
   ==========================================================================
   Três visões da mesma coisa, na ordem em que a fábrica pensa:
     Remessas  o que está fora e o que já voltou   (é aqui que se trabalha)
     Estoque   quanto existe de cada semiacabado   (é aqui que se confere)
     Códigos   o catálogo dos códigos internos     (é aqui que se cadastra)
   ========================================================================== */
const SEMI_MODOS = [["remessas", "Remessas"], ["estoque", "Estoque"], ["codigos", "Códigos"]];
const SEMI_FILTROS = [["abertas", "Com a prestadora"], ["parciais", "Retorno parcial"],
  ["encerradas", "Encerradas"], ["todas", "Todas"]];

function viewSemi() {
  const v = S.semiView;
  if (!SEMI_MODOS.some(([id]) => id === v.modo)) v.modo = "remessas";
  const r = v.aberta ? remessaPorId(v.aberta) : null;
  if (v.aberta && !r) v.aberta = null;
  if (r) return telaRemessa(r);
  const cab = `<div class="card-h">
    <div><h3>Semiacabados</h3>
      <div class="hint">A bandana que já está pronta e ainda não é SKU. Não se mistura com insumo, com produto pronto nem com material em posse.</div></div>
    <div class="seg" role="group" aria-label="Visão" style="margin-left:14px">
      ${SEMI_MODOS.map(([id, nome]) => `<button class="${v.modo === id ? "on" : ""}" data-semimodo="${id}">${nome}</button>`).join("")}</div>
    <div style="margin-left:auto;display:flex;gap:8px">
      ${v.modo === "codigos" ? `<button class="btn primary sm" data-act="novo-semi">${svg(IC.mais)}Novo código</button>`
        : `<button class="btn primary sm" data-act="nova-remessa">${svg(IC.mais)}Nova remessa</button>`}
    </div></div>`;
  const corpo = v.modo === "estoque" ? telaSemiEstoque() : v.modo === "codigos" ? telaSemiCodigos() : telaSemiRemessas();
  return `<div class="card">${cab}${corpo}</div>`;
}

/* ---------- a régua da tela: o que está fora ---------- */
function telaSemiRemessas() {
  const v = S.semiView;
  const todas = remessas().slice();
  const daSit = (id) => id === "todas" ? todas
    : id === "encerradas" ? todas.filter((r) => r.status === "encerrada")
    : id === "parciais" ? todas.filter((r) => situacaoRemessa(r).id === "parcial")
    : todas.filter((r) => situacaoRemessa(r).id === "aberta");
  if (!SEMI_FILTROS.some(([id]) => id === v.filtro)) v.filtro = "abertas";
  let lista = daSit(v.filtro);
  const q = String(v.busca || "").trim().toLowerCase();
  if (q) lista = lista.filter((r) => (String(r.numero) + " " + r.prestadora + " " + (r.obs || "")).toLowerCase().includes(q)
    || (r.itens || []).some((id) => (semiPorId(id)?.codigo || "").toLowerCase().includes(q)));
  if (v.prest !== "todas") lista = lista.filter((r) => r.prestadora === v.prest);
  lista = lista.slice().sort((a, b) => String(b.data || b.em).localeCompare(String(a.data || a.em))
    || String(b.numero || "").localeCompare(String(a.numero || ""), undefined, { numeric: true }));
  const total = lista.length;
  lista = lista.slice(0, v.limite || 40);
  const prestComRemessa = [...new Set(todas.map((r) => r.prestadora))].sort((a, b) => String(a).localeCompare(String(b)));

  return `<div style="padding:14px 16px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    ${SEMI_FILTROS.map(([id, nome]) => { const n = daSit(id).length;
      return `<button class="chip ${v.filtro === id ? "on" : ""}" data-semif="${id}">${nome} <b>${n0(n)}</b></button>`; }).join("")}
    <input class="inp" id="q-semi" placeholder="Procurar por número, prestadora ou código…" value="${esc(v.busca || "")}" style="margin-left:auto;max-width:280px">
    ${prestComRemessa.length > 1 ? `<select class="inp" data-semiprest style="max-width:190px">
      <option value="todas">Todas as prestadoras</option>
      ${prestComRemessa.map((p) => `<option value="${esc(p)}"${v.prest === p ? " selected" : ""}>${esc(p)}</option>`).join("")}</select>` : ""}
  </div>
  ${lista.length ? `<div class="tw" style="margin-top:12px"><table class="t">
    <thead><tr><th>Remessa</th><th>Prestadora</th><th>Saiu</th><th>Volume</th><th>O que foi</th>
      <th class="num">Voltou</th><th>Situação</th><th></th></tr></thead>
    <tbody>${lista.map((r) => { const st = situacaoRemessa(r); const vt = voltouNaRemessa(r);
      const d = diasDaRemessa(r);
      const velha = st.id !== "encerrada" && d != null && d >= 30;
      return `<tr data-abrirrem="${esc(r.id)}" style="cursor:pointer">
        <td class="tcell"><div class="p"><span class="sku" style="font-size:12px">${esc(r.numero)}</span>
          <span class="sit" title="Remessa de semiacabado — mesmo número, outra natureza: não tem SKU nem quantidade na saída">REMESSA</span></div>
          <div class="s mono">${esc(remessaResumo(r) || "sem detalhe")}</div></td>
        <td><span class="pessoa">${avatar(r.prestadora)}<b>${esc(primeiroNome(r.prestadora))}</b></span></td>
        <td>${fdate(r.data || r.em)}${d != null && st.id !== "encerrada" ? `<div class="hint" style="margin:0">${d === 0 ? "hoje" : `há ${n0(d)} ${d === 1 ? "dia" : "dias"}`}</div>` : ""}</td>
        <td>${r.volumeQtd ? `${n0(r.volumeQtd)} ${esc(r.volumeUn)}${r.volumeQtd > 1 ? "s" : ""}` : '<span style="color:var(--ink-4)">—</span>'}</td>
        <td>${(r.itens || []).length ? (r.itens || []).map((id) => `<span class="tag">${esc(semiPorId(id)?.codigo || "?")}</span>`).join(" ")
          : '<span style="color:var(--ink-4)">não detalhado</span>'}</td>
        <td class="num">${vt.total ? `<b>${n0(vt.total)}</b> pç` : '<span style="color:var(--ink-4)">—</span>'}</td>
        <td><span class="tag dot ${st.tom}">${esc(st.nome)}</span>${velha ? ' <span class="tag amber">parada</span>' : ""}</td>
        <td class="num">${st.id === "encerrada" ? "" : `<button class="btn sm primary" data-retornorem="${esc(r.id)}">Registrar retorno</button>`}</td>
      </tr>`; }).join("")}
    </tbody></table></div>
    ${total > lista.length ? `<div style="padding:12px;text-align:center"><button class="btn sm" data-act="semi-mais">Ver mais ${n0(total - lista.length)}</button></div>` : ""}`
  : vazio(q || v.filtro !== "abertas" ? "filtro" : "nada",
      v.filtro === "abertas" ? "Nenhuma remessa com prestadora." : "Nada aqui.",
      v.filtro === "abertas" ? "Uma remessa é uma ida de bandana para a prestadora. Ela nasce sem quantidade de peças — o que se conta na saída é volume, e a quantidade só existe na volta."
        : "Mude o filtro acima para ver as outras.",
      v.filtro === "abertas" ? `<button class="btn primary" data-act="nova-remessa">${svg(IC.mais)}Registrar a primeira remessa</button>` : "")}
  ${porque("Por que a remessa sai sem quantidade", `
    <div><b>Na ida controla-se volume.</b> Saíram duas caixas — e duas caixas é tudo o que a empresa sabe naquele momento.</div>
    <div><b>Na volta controla-se peça.</b> A prestadora conta e informa: voltaram 380 bandanas P. É esse número que vira estoque de semiacabado.</div>
    <div><b>Uma caixa nunca vira um número de peças.</b> Nem aqui, nem no relatório, nem em lugar nenhum. Chutar a quantidade na saída seria inventar uma falta na volta.</div>
    <div><b>Quem encerra a remessa é você.</b> O primeiro retorno não fecha nada — ela fica em <i>Retorno parcial</i> até alguém dizer que acabou.</div>`)}`;
}

/* ---------- uma remessa por dentro ---------- */
function telaRemessa(r) {
  const st = situacaoRemessa(r);
  const vt = voltouNaRemessa(r);
  const rets = retornosDe(r).slice().sort((a, b) => String(b.em).localeCompare(String(a.em)));
  const d = diasDaRemessa(r);
  return `<div class="card">
    <div class="card-h">
      <button class="btn sm ghost" data-act="semi-voltar">${svg(IC.setaEsq)}Remessas</button>
      <div style="margin-left:6px"><h3>Remessa ${esc(r.numero)} · ${esc(r.prestadora)}
          <span class="sit" style="vertical-align:middle" title="Remessa de semiacabado — o mesmo registro aparece na aba Pedidos">REMESSA</span></h3>
        <div class="hint">Saiu em ${fdate(r.data || r.em)}${d != null ? ` · há ${d === 0 ? "menos de um dia" : n0(d) + (d === 1 ? " dia" : " dias")}` : ""}${r.por ? ` · anotada por ${esc(r.por)}` : ""}</div></div>
      <span class="tag dot ${st.tom}" style="margin-left:8px">${esc(st.nome)}</span>
      <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
        ${st.id === "encerrada"
          ? `<button class="btn sm" data-reabrirrem="${esc(r.id)}">Reabrir remessa</button>`
          : `<button class="btn sm" data-editarrem="${esc(r.id)}">${svg(IC.editar)}Editar</button>
             <button class="btn sm primary" data-retornorem="${esc(r.id)}">${svg(IC.mais)}Registrar retorno</button>
             <button class="btn sm ghost" data-encerrarrem="${esc(r.id)}">Encerrar remessa</button>`}
      </div>
    </div>
    <div style="padding:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px">
      <div>
        <div class="secao">O que saiu</div>
        <dl class="kv"><dt>Volume enviado</dt><dd>${r.volumeQtd ? `${n0(r.volumeQtd)} ${esc(r.volumeUn)}${r.volumeQtd > 1 ? "s" : ""}` : "—"}</dd>
          <dt>Quantidade de peças</dt><dd style="color:var(--ink-4);font-weight:500">não é contada na saída</dd></dl>
        <div class="secao" style="margin-top:10px">O que foi na remessa</div>
        ${(r.itens || []).length ? `<div style="display:flex;flex-direction:column;gap:5px">
          ${(r.itens || []).map((id) => { const t = semiPorId(id); const q = vt.porTipo.get(id) || 0;
            return `<div style="display:flex;gap:8px;align-items:center;font-size:12.5px">
              <span class="sku">${esc(t?.codigo || "?")}</span>
              <span style="color:var(--ink-2)">${esc(semiRotulo(t))}</span>
              <b style="margin-left:auto">${q ? n0(q) + " pç de volta" : '<span style="color:var(--ink-4);font-weight:500">nada voltou ainda</span>'}</b>
            </div>`; }).join("")}
        </div>` : `<p class="hint" style="margin:0">Não foi detalhado o que saiu — só o volume. Está certo: dá para registrar o retorno de qualquer código mesmo assim.</p>`}
        ${r.obs ? `<div class="secao" style="margin-top:10px">Observação</div><p class="hint" style="margin:0">${esc(r.obs)}</p>` : ""}
        ${r.encerradaEm ? `<div class="aviso" style="margin-top:12px">
          <b>Encerrada</b> em ${fdate(r.encerradaEm)}${r.encerradaPor ? ` por ${esc(r.encerradaPor)}` : ""}.
          ${r.encerradaMotivo ? esc(r.encerradaMotivo) : ""}</div>` : ""}
      </div>
      <div>
        <div class="secao">O que voltou · <b>${n0(vt.total)}</b> ${vt.total === 1 ? "peça" : "peças"}</div>
        ${rets.length ? `<div class="tl">${rets.map((ret) => `<div class="tl-i ok">
          <div class="tl-d">${fdate(ret.data || ret.em)}</div>
          <div class="tl-c">
            ${(ret.itens || []).map((it) => `<b>${n0(it.qtd)}</b> ${esc(semiPorId(it.semiId)?.codigo || "?")}`).join(" · ")}
            ${ret.obs ? `<div style="color:var(--ink-3)">${esc(ret.obs)}</div>` : ""}
            <i>${ret.por ? esc(ret.por) : "—"} · ${fdataHora(ret.em)}
              ${st.id === "encerrada" ? "" : ` · <button class="btn sm ghost" data-desfazerret="${esc(r.id)}|${esc(ret.id)}" title="Some com este retorno e devolve as peças ao que era antes">desfazer</button>`}</i>
          </div></div>`).join("")}</div>`
        : `<p class="hint" style="margin:0">Nada voltou ainda. Quando a prestadora devolver, é aqui que se anota <b>quantas peças</b> vieram — de cada tamanho, separado.</p>`}
      </div>
    </div>
    ${st.id !== "encerrada" && rets.length ? `<div class="aviso" style="margin:0 16px 16px;border-color:var(--teal);background:var(--teal-soft)">
      <b>Esta remessa continua em aberto.</b> O app não fecha sozinha no primeiro retorno porque o normal é vir em partes.
      Quando não houver mais nada para voltar, clique em <b>Encerrar remessa</b> — é aí que ela entra na <b>Conferência</b> e no pagamento de ${esc(primeiroNome(r.prestadora))}.</div>` : ""}
    ${(() => { /* o caminho até o dinheiro, dito enquanto ainda dá para consertar */
      if (st.id !== "encerrada") {
        return r.processo ? "" : `<div class="aviso" style="margin:0 16px 16px;border-color:var(--amber);background:var(--amber-soft)">
          <b>Sem processo definido.</b> Do jeito que está, esta remessa controla o material e <b>não entra no fechamento</b> de ${esc(primeiroNome(r.prestadora))} — não há de onde tirar o valor por peça.
          <button class="btn sm" style="margin-left:8px" data-editarrem="${esc(r.id)}">Definir agora</button></div>`;
      }
      const comp = competenciaDe(r);
      const meses = mesesDosRetornos(r);
      const lancadas = (r.etapas || []).filter((e2) => Number(e2.qtd) > 0).length;
      const partes = [];
      if (!r.processo) partes.push(`<div><b>Sem processo</b> — ela não aparece na Conferência nem no fechamento. <button class="btn sm" data-editarrem="${esc(r.id)}">Definir</button></div>`);
      else if (!lancadas) partes.push(`<div><b>Falta lançar a conferência.</b> ${n0(vt.total)} ${vt.total === 1 ? "peça voltou" : "peças voltaram"} — diga em quais etapas na aba <b>Conferência</b> para o valor de ${esc(primeiroNome(r.prestadora))} sair. <button class="btn sm" data-ir="conferencia">Ir para Conferência</button></div>`);
      else partes.push(`<div><b>Conferida.</b> ${n0(lancadas)} ${lancadas === 1 ? "etapa lançada" : "etapas lançadas"}${comp ? ` · entra no fechamento de <b>${esc(comp)}</b>` : ""}.</div>`);
      if (meses.length > 1) partes.push(`<div><b>Atenção:</b> os retornos caíram em ${meses.map((m2) => esc(m2)).join(" e ")}. O fechamento é mensal e esta remessa vai inteira para <b>${esc(comp || "—")}</b>, o mês do último retorno. Se o trabalho precisa ser dividido, use uma remessa por mês.</div>`);
      return `<div class="aviso" style="margin:0 16px 16px;${lancadas && r.processo ? "border-color:var(--teal);background:var(--teal-soft)" : "border-color:var(--amber);background:var(--amber-soft)"}">${partes.join("")}</div>`; })()}
  </div>`;
}

/* ---------- o estoque de semiacabados ---------- */
function telaSemiEstoque() {
  const tipos = semiAtivos();
  const total = totalSemiEmEstoque();
  const abaixo = semiAbaixoDoMinimo();
  return `<div style="padding:14px 16px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span class="tag">Total em semiacabado <b>${n0(total)}</b> pç</span>
      ${abaixo.length ? `<span class="tag amber">${n0(abaixo.length)} abaixo do mínimo</span>` : ""}
      <button class="btn sm" style="margin-left:auto" data-act="ajustar-semi">Ajustar saldo à mão</button>
    </div>
    <div class="hint" style="padding:8px 16px 0;line-height:1.6">
      <b>Este estoque não é o da loja.</b> Semiacabado não vende, não entra na Demanda e não conta como produto pronto —
      ele só vira SKU quando alguém disser que virou.</div>
    ${tipos.length ? `<div class="tw" style="margin-top:12px"><table class="t">
      <thead><tr><th>Código</th><th>Semiacabado</th><th class="num">Em estoque</th><th class="num">Mínimo</th><th></th></tr></thead>
      <tbody>${tipos.map((t) => { const sal = saldoSemi(t.id); const mn = Number(t.minimo) || 0;
        const falta = mn > 0 && sal < mn;
        return `<tr>
          <td><span class="sku">${esc(t.codigo)}</span></td>
          <td>${esc(semiRotulo(t))}</td>
          <td class="num"><button class="btn sm ghost" data-extratosemi="${esc(t.id)}" title="Ver de onde veio cada peça">
            <b style="${falta ? "color:var(--red)" : ""}">${n0(sal)}</b></button></td>
          <td class="num">${mn ? n0(mn) : '<span style="color:var(--ink-4)">—</span>'}</td>
          <td class="num">${falta ? `<span class="tag red">faltam ${n0(mn - sal)}</span>` : ""}</td>
        </tr>`; }).join("")}
      </tbody></table></div>`
    : vazio("nada", "Nenhum código cadastrado ainda.",
        "O estoque de semiacabado nasce dos retornos das remessas. Primeiro cadastre os códigos internos em <b>Códigos</b>.",
        `<button class="btn primary" data-semimodo="codigos">Ir para Códigos</button>`)}
    ${porque("De onde sai este número", `
      <div>Este saldo não é um campo guardado: ele é somado toda vez, a partir do que aconteceu.</div>
      <div><b>+</b> tudo que voltou nas remessas &nbsp;<b>+</b> ajustes feitos à mão &nbsp;<b>−</b> o que já virou produto acabado.</div>
      <div>Por isso não existe saldo "descolado" da realidade: se um número está errado, o movimento que o formou está errado — e ele aparece no extrato, clicando no número.</div>
      <div>São <b>quatro estoques</b> e eles não se somam: insumo, produto pronto, material em posse da prestadora — e este.
        Um movimento de um nunca vira movimento do outro.</div>`)}`;
}

/* ---------- o catálogo dos códigos internos ---------- */
function telaSemiCodigos() {
  const tipos = semiTipos().slice().sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
  return `<div class="aviso" style="margin:14px 16px 0;border-color:var(--amber);background:var(--amber-soft)">
      <b>Estes códigos não são SKU.</b> Eles existem só para a fábrica saber o que tem pronto e ainda não embalado.
      Não vendem, não aparecem na loja, não entram na Demanda e não somam com o estoque de produto pronto.</div>
    ${tipos.length ? `<div class="tw" style="margin-top:12px"><table class="t">
      <thead><tr><th>Código</th><th>Tipo</th><th>Tamanho</th><th>Grupo</th><th class="num">Mínimo</th><th class="num">Em estoque</th><th></th></tr></thead>
      <tbody>${tipos.map((t) => `<tr data-editarsemi="${esc(t.id)}" style="cursor:pointer">
        <td><span class="sku">${esc(t.codigo)}</span>${t.ativo === false ? ' <span class="tag">inativo</span>' : ""}</td>
        <td>${esc(t.tipo || "Bandana")}</td>
        <td>${esc(t.tamanho || "—")}</td>
        <td>${t.categoria === "festiva" ? `<span class="tag campanha">${esc(t.campanha || "Data festiva")}</span>`
          : `Dia a dia${t.variante ? " · " + esc((SEMI_VARS.find((x) => x[0] === t.variante) || [])[1] || "") : ""}`}</td>
        <td class="num">${Number(t.minimo) > 0 ? n0(t.minimo) : '<span style="color:var(--ink-4)">—</span>'}</td>
        <td class="num"><b>${n0(saldoSemi(t.id))}</b></td>
        <td class="num"><button class="btn sm ghost" data-editarsemi="${esc(t.id)}">${svg(IC.editar)}Editar</button></td>
      </tr>`).join("")}
      </tbody></table></div>`
    : vazio("nada", "Nenhum código interno ainda.",
        "Um código interno é a bandana pronta antes de virar SKU: <b>BAND-P-DD</b> é a bandana P do dia a dia, <b>BAND-G-DF</b> é a G de data festiva.",
        `<button class="btn primary" data-act="novo-semi">${svg(IC.mais)}Criar o primeiro código</button>`)}`;
}

function viewFestivas() {
  const v = S.festivasView;
  const c = campanhaPorId(v.campanha);
  return c ? telaCampanha(c) : telaCampanhas();
}

function telaCampanhas() {
  const v = S.festivasView;
  const todas = festCampanhas();
  const lista = todas.filter((c) => (v.filtro === "arquivadas" ? c.arquivada : !c.arquivada))
    .sort((a, b) => String(b.ano || "").localeCompare(String(a.ano || "")) || String(a.ini || "").localeCompare(String(b.ini || "")));
  const nArq = todas.filter((c) => c.arquivada).length;
  return `<div class="card">
    <div class="card-h">
      <div><h3>Campanhas</h3><div class="hint">Halloween, Natal, Ano Novo, Outubro Rosa — cada uma com seu período, sua janela de produção e seu crescimento.</div></div>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
        <button class="chip ${v.filtro === "ativas" ? "on" : ""}" data-festfiltro="ativas">Ativas <b>${n0(todas.length - nArq)}</b></button>
        ${nArq ? `<button class="chip ${v.filtro === "arquivadas" ? "on" : ""}" data-festfiltro="arquivadas">Arquivadas <b>${n0(nArq)}</b></button>` : ""}
        <button class="btn primary sm" data-act="nova-campanha">${svg(IC.mais)}Nova campanha</button>
      </div>
    </div>
    ${lista.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;padding:14px">
      ${lista.map((c) => { const s = situacaoCampanha(c); const its = itensDaCampanha(c);
        const nRef = its.filter((i) => i.comportamento === "reforco").length;
        return `<div class="card" style="margin:0;cursor:pointer" data-abrircamp="${esc(c.id)}">
        <div style="padding:14px">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <b style="font-size:15px">${esc(c.nome)}</b>
            ${c.ano ? `<span class="tag">${esc(String(c.ano))}</span>` : ""}
            <span class="tag dot ${s.tom}">${esc(s.nome)}</span>
          </div>
          <div class="hint" style="margin-top:8px">
            <div>Campanha: <b>${c.ini ? fdate(c.ini) : "—"}</b> a <b>${c.fim ? fdate(c.fim) : "—"}</b></div>
            <div>Preparação: <b>${c.prepIni ? fdate(c.prepIni) : "—"}</b> a <b>${c.prepFim ? fdate(c.prepFim) : "—"}</b></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
            <span class="tag">${n0(its.length)} ${its.length === 1 ? "produto" : "produtos"}</span>
            ${nRef ? `<span class="tag">${n0(nRef)} com reforço</span>` : ""}
            <span class="tag ${Number(c.crescimento) ? "teal" : "amber"}">crescimento ${Number(c.crescimento) > 0 ? "+" : ""}${Number(c.crescimento) || 0}%</span>
          </div>
        </div></div>`; }).join("")}
    </div>` : `<div style="padding:34px;text-align:center;color:var(--ink-3)">
      <div style="font-weight:700;color:var(--ink-2);margin-bottom:6px">${v.filtro === "arquivadas" ? "Nenhuma campanha arquivada." : "Nenhuma campanha ainda."}</div>
      <div style="max-width:520px;margin:0 auto 14px">Uma campanha é uma data com nome, período de venda, janela de produção e um crescimento esperado sobre o ano anterior. Comece pela próxima do calendário.</div>
      ${v.filtro === "arquivadas" ? "" : `<button class="btn" data-act="nova-campanha">${svg(IC.mais)}Criar a primeira campanha</button>`}</div>`}
    ${porque("O que esta aba faz — e o que ela não faz", `
      <div><b>Faz:</b> planejamento, projeção e acompanhamento das datas festivas, separados da Demanda do dia a dia.</div>
      <div><b>Não faz:</b> um segundo estoque nem uma operação de pedidos paralela. O estoque é o mesmo, e os pedidos continuam todos na aba <b>Pedidos</b>.</div>
      <div><b>Produto que vende o ano inteiro</b> continua na Demanda normalmente e aparece <i>também</i> aqui — é o mesmo SKU visto de dois jeitos, não dois produtos.</div>`)}
  </div>`;
}

function telaCampanha(c) {
  const v = S.festivasView;
  if (v.modo !== "produtos") v.modo = "planejar";
  const s = situacaoCampanha(c);
  const its = itensDaCampanha(c);
  const cab = `<div class="card-h">
      <button class="btn sm ghost" data-act="fest-voltar">${svg(IC.arquivar)}Campanhas</button>
      <div style="margin-left:6px"><h3>${esc(c.nome)}${c.ano ? " " + esc(String(c.ano)) : ""}</h3>
        <div class="hint">${c.ini ? fdate(c.ini) : "—"} a ${c.fim ? fdate(c.fim) : "—"} · preparação de ${c.prepIni ? fdate(c.prepIni) : "—"} a ${c.prepFim ? fdate(c.prepFim) : "—"}</div></div>
      <span class="tag dot ${s.tom}" style="margin-left:8px">${esc(s.nome)}</span>
      <div class="seg" role="group" aria-label="Visão" style="margin-left:14px">
        <button class="${v.modo === "planejar" ? "on" : ""}" data-festmodo="planejar">Planejamento</button>
        <button class="${v.modo === "produtos" ? "on" : ""}" data-festmodo="produtos">Produtos da campanha</button></div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn sm" data-editarcamp="${esc(c.id)}">${svg(IC.editar)}Editar campanha</button>
        <button class="btn sm ghost" data-arquivarcamp="${esc(c.id)}">${c.arquivada ? "Desarquivar" : "Arquivar"}</button>
      </div>
    </div>`;
  return v.modo === "produtos" ? `<div class="card">${cab}${telaCampanhaProdutos(c)}</div>`
                               : `<div class="card">${cab}${telaCampanhaPlano(c, its)}</div>`;
}

