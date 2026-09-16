/* ---------- Produtos ---------- */
/* Os três campos de embalagem saem impressos no canhoto, então precisam estar à
   mão tanto no cadastro do produto quanto na hora de editar um pedido — quem está
   com o papel na frente é que percebe que falta. São do PRODUTO, não do pedido. */
function camposEmbalagem(prod, f2, escopo) {
  const esc2 = escopo != null ? ` data-ppg="${escopo}"` : "";
  const chave = escopo != null ? String(escopo) : "_";
  const pr = prod?.producao || {};
  /* a fonte única. O valor que o produto já tem entra na lista mesmo se não
     estiver cadastrado — senão o seletor abriria vazio e a pessoa perderia o
     que estava lá sem perceber. */
  const atualT = normalizarTamanho(pr.embalagemTamanho) || pr.embalagemTamanho || "";
  const opsT = [...new Set([...tamanhosEmbalagemOrdenados(), ...(atualT ? [atualT] : [])])].sort(compararTamanhos);
  const atualQ = normalizarQtdEmb(pr.qtdPorEmbalagem) ?? "";
  const opsQ = [...new Set([...qtdsEmbalagemOrdenadas(), ...(atualQ ? [atualQ] : [])])].sort((a2, b2) => a2 - b2);
  /* o bloco de cadastro só aparece quando alguém pede: ele ficava aberto o tempo
     todo, ocupando a tela em toda edição de produto — e cadastrar embalagem nova
     acontece uma vez por mês, não a cada produto. */
  const abertoT = S.embNovo?.[chave] === "tamanho";
  const abertoQ = S.embNovo?.[chave] === "qtd";
  const podeCad = podeEditar("prodEmbalagem");
  const btnNovo = (qual, rot) => podeCad
    ? `<button type="button" class="btn sm ghost" data-embabrir="${qual}" data-embchave="${esc(chave)}" style="padding:3px 9px;font-size:11.5px" title="Cadastrar ${rot} que ainda não está na lista">+ ${rot}</button>` : "";
  const caixaNovo = (qual, ph, tipo) => `<div style="display:flex;gap:6px;margin-top:6px">
      <input class="inp${tipo === "number" ? " num" : ""}" data-embnovo="${qual}"${esc2} ${tipo === "number" ? 'type="number" min="1" step="1"' : ""} placeholder="${ph}" style="width:${tipo === "number" ? 110 : 140}px;padding:5px 9px;font-size:12px">
      <button class="btn sm primary" data-embadd="${qual}"${esc2} style="padding:5px 10px">Cadastrar</button>
      <button type="button" class="btn sm ghost" data-embfechar="${esc(chave)}" style="padding:5px 8px">Cancelar</button>
    </div>`;
  return `<div class="rowform">
    ${f2("Tipo de embalagem", `<select class="sel" data-pp="embalagemTipo"${esc2}><option value="">— não definido —</option>${["plástico", "filipeta", "outro"].map((t2) => `<option ${pr.embalagemTipo === t2 ? "selected" : ""}>${t2}</option>`).join("")}</select>`)}
    ${(() => {
      /* ---------------------------------------------------------------
         TAMANHO DA EMBALAGEM · desenhado SEMPRE, escondido quando filipeta
         ---------------------------------------------------------------
         Filipeta é tamanho único: o campo não pode aparecer. Antes ele era
         OMITIDO do HTML — e omitir quebrava os dois lados:

         · saindo de filipeta para plástico sem fechar a janela, não havia o
           que mostrar: o `change` só sabe esconder/mostrar um campo que já
           exista. A pessoa tinha de fechar e reabrir para escolher o tamanho;
         · e qualquer caminho em que o desenho e o `change` discordassem
           deixava o campo na tela com filipeta escolhida.

         Agora o campo está sempre no DOM e quem manda na visibilidade é uma
         coisa só — `display` — escrita aqui no desenho e trocada pelo
         `change`. É o mesmo desenho da janela de embalagem em lote
         (`#fld-lote-tam`), que já funciona nos dois sentidos.
         --------------------------------------------------------------- */
      const escondido = pr.embalagemTipo === "filipeta";
      return `<label class="fld" data-fld="embalagemTamanho" style="margin-bottom:14px${escondido ? ";display:none" : ""}"><span>Tamanho da embalagem</span>`
        + `<span style="display:flex;gap:6px;align-items:center"><select class="sel" data-pp="embalagemTamanho"${esc2} style="flex:1"><option value="">— não definido —</option>${opsT.map((t2) => `<option ${!escondido && atualT === t2 ? "selected" : ""}>${esc(t2)}</option>`).join("")}</select>${btnNovo("tamanho", "novo")}</span>${abertoT && !escondido ? caixaNovo("tamanho", "ex.: 12x12", "text") : ""}</label>`;
    })()}
    ${f2("Quantidade por embalagem",
      `<span style="display:flex;gap:6px;align-items:center"><select class="sel" data-pp="qtdPorEmbalagem"${esc2} style="flex:1"><option value="">— não definido —</option>${opsQ.map((q2) => `<option value="${q2}" ${Number(atualQ) === q2 ? "selected" : ""}>${n0(q2)}</option>`).join("")}</select>${btnNovo("qtd", "nova")}</span>${abertoQ ? caixaNovo("qtd", "ex.: 50", "number") : ""}`)}
  </div>
  ${ehAdm() ? `<div style="margin:-6px 0 10px"><button type="button" class="btn sm ghost" data-act="tamanhos-emb" style="padding:3px 9px;font-size:11.5px">${svg(IC.etiqueta)}Gerenciar opções de embalagem</button></div>` : ""}`;
}

const producaoPendente = (p) => !p.producao?.embalagemTipo && !p.producao?.qtdPorEmbalagem;
/* ---------- o filtro dos produtos, fora do desenho da tela ----------
   Quem também precisa dele é o "selecionar todos do filtro", que roda no
   despacho de ações — outro escopo. Declarado dentro da view, ele existiria para
   desenhar e sumiria na hora de agir. É a regra do escopo dos ouvintes globais. */
function produtosFiltrados() {
  const v = S.produtosView;
  let r = S.produtos.slice();
  if (v.filtro === "semfoto") r = r.filter((p) => !p.foto);
  else if (v.filtro === "semlink") r = r.filter((p) => !p.urlSite);
  else if (v.filtro === "comop") r = r.filter((p) => !!opAtivaDe(p.sku));
  else if (v.filtro === "pendcfg") r = r.filter(producaoPendente);
  else if (v.filtro === "revisar") r = r.filter((p) => p.revisarProducao);
  else if (v.filtro === "provisorio") r = r.filter((p) => p.provisorio);
  const b = String(v.busca || "").trim().toLowerCase();
  if (b) r = r.filter((p) => [p.sku, p.descricao, p.processo, p.categoria].some((x) => String(x || "").toLowerCase().includes(b)));
  return r.sort((a, y) => String(a.descricao || a.sku).localeCompare(String(y.descricao || y.sku)));
}
/* o rótulo do filtro que está valendo, para a tela dizer o que ela vai selecionar */
const FILTRO_PROD_NOME = { comop: "com produção", pendcfg: "com configuração pendente",
  revisar: "para revisar após troca de SKU", provisorio: "provisórios", semfoto: "sem foto", semlink: "sem link da loja" };
function viewProdutos() {
  const v = S.produtosView;
  S.selProd = S.selProd || new Set();
  const r = produtosFiltrados();
  const total = r.length, vis = r.slice(0, v.limite);

  const grade = `<div class="cards">${vis.map((p) => `<div class="pcard ${S.selProd.has(p.id) ? "on" : ""}" data-produto="${esc(p.sku)}">
    <div class="pcard-ac">
      <label class="pcard-chk" title="Selecionar para excluir em lote"><input type="checkbox" class="chk" data-selprod="${esc(p.id)}" ${S.selProd.has(p.id) ? "checked" : ""}></label>
      <button class="pcard-x" data-excluir-prod="${esc(p.id)}" title="Excluir este produto">×</button>
    </div>
    ${p.foto ? `<img src="${esc(p.foto)}" alt="" loading="lazy" data-semfoto="ph">` : `<div class="ph">sem foto</div>`}
    <div class="body"><div class="n">${esc(p.descricao || "Sem descrição")}</div><div class="s">${esc(p.sku)}${p.provisorio ? ' · <span style="color:var(--amber);font-weight:700">provisório</span>' : ""}</div></div></div>`).join("")}</div>`;

  const tabela = `<div class="tw"><table class="t t-prod"><thead><tr>
    <th style="width:26px">${(() => { const ids = vis.map((p) => p.id).filter(Boolean);
      const todos = ids.length && ids.every((id) => S.selProd.has(id));
      return ids.length ? `<input type="checkbox" class="chk" data-selprod-all="${ids.join(",")}" ${todos ? "checked" : ""} title="Selecionar todos p/ edição em lote">` : ""; })()}</th>
    <th style="width:56px">Foto</th>${thOrd("prod", "sku", "SKU")}${thOrd("prod", "descricao", "Produto")}
    ${thOrd("prod", "embalagem", "Embalagem")}${thOrd("prod", "processo", "Processo")}
    ${thOrd("prod", "pacote", "Pacote", "num")}${thOrd("prod", "programado", "Programado")}<th>Loja</th><th>Ação</th></tr></thead>
  <tbody>${ordenarPor("prod", vis, (p, campo) => { const pr = p.producao || {}; const o2 = opAtivaDe(p.sku);
      return campo === "sku" ? p.sku : campo === "descricao" ? p.descricao
        : campo === "embalagem" ? [pr.embalagemTipo, pr.embalagemTamanho].filter(Boolean).join(" ")
        : campo === "processo" ? p.processo : campo === "pacote" ? (Number(p.qtdPacote) || 0)
        : campo === "programado" ? (o2?.qtdProgramada || 0) : null; })
    .map((p) => { const o = opAtivaDe(p.sku); const pr = p.producao || {}; return `<tr data-produto="${esc(p.sku)}" class="clickable ${S.selProd.has(p.id) ? "on" : ""}">
    <td><input type="checkbox" class="chk" data-selprod="${esc(p.id)}" ${S.selProd.has(p.id) ? "checked" : ""}></td>
    <td>${thumb(p)}</td><td class="sku">${esc(p.sku)}${p.provisorio ? ' <span class="tag amber" style="font-size:9.5px;padding:0 5px" title="Código provisório — ainda sem SKU na Magazord">prov.</span>' : ""}${p.revisarProducao ? ' <span class="ic-inline amber" title="SKU trocado — revise a configuração de produção">' + svg(IC.alerta) + '</span>' : ""}</td>
    <td class="desc" title="${esc(p.descricao)}">${esc(p.descricao || "—")}</td>
    <td style="white-space:nowrap;font-size:12px">${pr.embalagemTipo ? `${esc(pr.embalagemTipo)}${pr.embalagemTamanho ? " " + esc(pr.embalagemTamanho) : ""}${pr.qtdPorEmbalagem ? " · " + n0(pr.qtdPorEmbalagem) + "/emb" : ""}` : '<span class="tag amber" style="font-size:10px;padding:1px 7px" title="Sem configuração de produção — o papel sai com os campos em branco">pendente</span>'}</td>
    <td>${esc(p.processo || "—")}${(p.receita || []).length ? ` <span class="tag" style="font-size:9.5px;padding:0 5px" title="Este SKU tem receita própria de insumos — ignora a do processo">receita própria</span>` : ""}</td>
    <td class="num">${n0(p.qtdPacote)}</td>
    <td>${o ? `${n0(o.qtdProgramada || 0)} pçs ${corteCurto(o.prioridade)}` : "—"}</td>
    <td><button class="lupa" data-loja="${esc(p.sku)}" title="Copia o SKU e abre a loja">${svg(IC.link)} ${p.urlSite ? "abrir" : "buscar"}</button></td>
    <td style="white-space:nowrap"><button class="btn sm ghost" data-editar-produto="${esc(p.sku)}">Editar</button>
      <button class="btn sm ghost" data-excluir-prod="${esc(p.id)}" title="Excluir este produto" style="color:var(--red);padding:4px 8px">×</button></td></tr>`; }).join("")}
  </tbody></table></div>`;

  /* ---------- produtos provisórios: ligar ao SKU real quando ele nascer ----------
     A fábrica produz antes da loja cadastrar. Aqui é onde as duas pontas se encontram. */
  const provs = provisorios();
  const cardProv = provs.length ? `<div class="card" style="margin-bottom:14px;border-color:var(--atencao-borda)">
    <div style="padding:12px 16px 4px"><b style="font-size:13px">${n0(provs.length)} ${provs.length === 1 ? "produto provisório" : "produtos provisórios"} — aguardando o SKU da Magazord</b>
      <p class="hint" style="margin:4px 0 8px">Produzidos aqui antes de existirem na loja. Assim que o SKU sair, vincule: o histórico de pedidos vai junto e o que você preencheu (processo, pacote, fornecedor, embalagem) <b>não é apagado</b> — a Magazord só acrescenta descrição, categoria e link.</p></div>
    ${provs.map((prov) => { const cands = candidatosSkuReal(prov, 5);
      const nped = S.pedidos.filter((r2) => (opPorId(r2.opId)?.sku || r2.sku) === prov.sku).length;
      return `<div style="padding:12px 16px;border-top:1px solid var(--line-2)">
      <div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap">
        <span class="sku">${esc(prov.sku)}</span>
        ${prov.processo ? `<span class="tag">${esc(prov.processo)}</span>` : '<span class="tag amber">sem processo</span>'}
        <span class="tag">pacote ${n0(prov.qtdPacote || 1)}</span>
        <span style="font-size:11.5px;color:var(--ink-3);margin-left:auto">${n0(nped)} ${nped === 1 ? "pedido" : "pedidos"} · criado ${fdate(prov.criadoEm)}</span>
      </div>
      <div style="font-size:13px;margin:6px 0 ${prov.obsInterna ? "2px" : "10px"}">${esc(prov.descricao || "Sem descrição")}</div>
      ${prov.obsInterna ? `<div class="hint" style="margin:0 0 10px">Falta: ${esc(prov.obsInterna)}</div>` : ""}
      ${cands.length ? `<div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:700;margin-bottom:6px">Candidatos com descrição parecida</div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">
        ${cands.map((c2) => `<button class="btn sm" style="justify-content:flex-start;text-align:left;width:100%" data-vincular="${esc(prov.id)}|${esc(c2.produto.sku)}" title="Vincular ${esc(prov.sku)} a este SKU">
          <span class="sku" style="font-size:11.5px">${esc(c2.produto.sku)}</span>
          <span style="color:var(--ink-3);font-weight:400;margin-left:7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c2.produto.descricao || "")}</span></button>`).join("")}
        </div>`
      : `<p class="hint" style="margin:0 0 10px">Nenhum produto com descrição parecida ainda — importe a planilha de produtos da Magazord (Dados › Passo 2) ou escreva o SKU aqui embaixo.</p>`}
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input class="inp" id="vinc-${esc(prov.id)}" list="lista-vinc-sku" placeholder="ou digite o SKU real" style="flex:1;min-width:190px" autocomplete="off">
        <button class="btn primary sm" data-vincular-input="${esc(prov.id)}">Vincular ao SKU</button>
      </div></div>`; }).join("")}
    <datalist id="lista-vinc-sku">${S.produtos.filter((x) => !x.provisorio).slice(0, 4000).map((x) => `<option value="${esc(x.sku)}">${esc((x.descricao || "").slice(0, 40))}</option>`).join("")}</datalist>
  </div>` : "";

  const pend = S.cad.pendentesSku || [];
  const cardTrocas = pend.length ? `<div class="card" style="margin-bottom:14px;border-color:var(--atencao-borda)">
    <div style="padding:12px 16px 4px"><b style="font-size:13px;display:inline-flex;align-items:center;gap:6px">${svg(IC.alerta)}Possíveis alterações de SKU — confirme para não duplicar produtos</b>
      <p class="hint" style="margin:4px 0 8px">A importação achou SKUs novos quase idênticos a produtos existentes. Nada foi unido automaticamente — a decisão é sua.</p></div>
    ${pend.map((x, i) => `<div style="padding:10px 16px;border-top:1px solid var(--line-2);display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <div style="min-width:0"><span class="sku">${esc(x.skuAntigo)}</span> → <span class="sku"><b>${esc(x.skuNovo)}</b></span>
        <div class="s">diferença: ${esc(x.dif.de)} → ${esc(x.dif.para)}${x.descricaoNova ? ` · ${esc(x.descricaoNova.slice(0, 50))}` : ""}</div></div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn sm primary" data-sku-mesmo="${i}">É o mesmo produto — atualizar SKU</button>
        <button class="btn sm" data-sku-prod-novo="${i}">É um produto novo</button></div></div>`).join("")}
  </div>` : "";
  return `${cardProv}${cardTrocas}<div class="card">
    <div class="filters">
      <div class="search">${svg(IC.busca)}<input class="inp" id="q-prod-cad" style="width:250px" placeholder="Buscar SKU, produto, processo" value="${esc(v.busca)}"></div>
      ${[["todos", "Todos"], ["comop", "Com produção"], ["pendcfg", `Config. de produção pendente${S.produtos.filter(producaoPendente).length ? " " + n0(S.produtos.filter(producaoPendente).length) : ""}`], ["revisar", `Revisar após troca de SKU${S.produtos.filter((p) => p.revisarProducao).length ? " " + n0(S.produtos.filter((p) => p.revisarProducao).length) : ""}`], ["provisorio", `Provisórios${provisorios().length ? " " + n0(provisorios().length) : ""}`], ["semfoto", "Sem foto"], ["semlink", "Sem link da loja"]].map(([id, n]) => `<button class="chip ${v.filtro === id ? "on" : ""}" data-fp="${id}">${n}</button>`).join("")}
      <span class="divider"></span>
      <button class="chip ${v.modo === "grade" ? "on" : ""}" data-modo="grade">Grade</button>
      <button class="chip ${v.modo === "lista" ? "on" : ""}" data-modo="lista">Lista</button>
      <span style="margin-left:auto;font-size:12.5px;color:var(--ink-3)" class="mono">${total.toLocaleString("pt-BR")} produtos · ${n0(S.produtos.filter((p) => p.foto).length)} com foto</span>
      <button class="btn sm ghost" data-act="deduzir-etapas" title="Preenche as etapas dos SKUs sem definição a partir das conferências já feitas no app">${svg(IC.varinha)}Deduzir etapas</button>
      <button class="btn sm ghost" data-act="fornecedores" title="Cadastre os fornecedores e o prazo médio de cada um">${svg(IC.caminhao)}Fornecedores</button>
      <button class="btn sm ghost" data-act="tamanhos-emb" title="Cadastre os tamanhos e as quantidades de embalagem que existem na empresa">${svg(IC.etiqueta)}Embalagens</button>
      <button class="btn primary sm" data-act="novo-produto">${svg(IC.mais)}Novo produto</button>
    </div>
    ${(() => { /* ---------- a barra de seleção ----------
         Antes, selecionar era uma caixinha escondida em cada cartão e as ações
         ficavam espremidas na barra de filtros, que já tinha nove controles.
         Aqui a seleção tem lugar próprio: o que está marcado, como marcar mais,
         e o que dá para fazer com o que está marcado — nessa ordem. */
      const ids = vis.map((p) => p.id).filter(Boolean);
      if (!ids.length) return "";
      const marcadosNaTela = ids.filter((id) => S.selProd.has(id)).length;
      const todosDaTela = marcadosNaTela === ids.length;
      const n = S.selProd.size;
      const foraDaTela = total - ids.length;
      /* só nomeia o filtro quando ele de fato filtra: em "Todos" a frase é
         "Selecionar todos os 842", e não "todos os 842 todos os produtos" */
      const busca = String(v.busca || "").trim();
      const rotFiltro = busca ? `com “${busca}”` : (FILTRO_PROD_NOME[v.filtro] || "");
      return `<div class="selbar selbar-prod">
        <label class="selbar-chk" title="${todosDaTela ? "Desmarcar" : "Marcar"} os ${n0(ids.length)} produtos desta tela">
          <input type="checkbox" class="chk" data-selprod-all="${ids.join(",")}" ${todosDaTela ? "checked" : ""}>
          <span>${todosDaTela ? "Desmarcar" : "Selecionar"} os <b>${n0(ids.length)}</b> desta tela</span></label>
        ${foraDaTela > 0 ? `<button class="btn sm" data-act="selprod-filtro"
          title="Marca os ${n0(total)} produtos que passam pelo filtro de agora, inclusive os ${n0(foraDaTela)} que ainda não foram mostrados">
          Selecionar todos os ${n0(total)}${rotFiltro ? " " + esc(rotFiltro) : ""}</button>` : ""}
        ${n ? `<span class="selbar-n"><b>${n0(n)}</b> ${n === 1 ? "selecionado" : "selecionados"}</span>
          <button class="btn sm ghost" data-act="limpar-selprod">Limpar</button>
          <span class="selbar-acoes">
            <button class="btn sm" data-act="lote-embalagem">${svg(IC.caixa)}Definir embalagem em lote</button>
            <button class="btn sm danger" data-act="excluir-produtos-lote">${svg(IC.lixeira)}Excluir ${n0(n)}</button>
          </span>`
        : `<span class="hint" style="margin-left:auto">Marque produtos para definir embalagem em lote ou excluir de uma vez.</span>`}
      </div>`; })()}
    ${v.modo === "grade" ? grade : tabela}
    ${total > v.limite ? `<div style="padding:14px;text-align:center;border-top:1px solid var(--line-2)"><button class="btn" data-act="mais-produtos">Mostrar mais</button></div>` : ""}
  </div>`;
}

