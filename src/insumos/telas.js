/* ---------- Insumos ---------- */
function viewInsumos() {
  const v = S.insumosView;
  const lista0 = insumos().filter((i) => i.ativo !== false);
  /* as colunas de reserva só aparecem quando existe receita de onde tirá-las —
     antes disso seriam três colunas de zero ocupando a largura dos dados reais */
  const temAlgumaReceita = receitas().some((r) => (r.itens || []).length)
    || S.produtos.some((p) => (p.receita || []).length);
  const abaixo = insumosAbaixo();
  const semMin = lista0.filter((i) => !Number(i.minimo));
  const zerados = lista0.filter((i) => (temAlgumaReceita ? disponivelInsumo(i.id) : saldoInsumo(i.id)) <= 0).length;

  const passa = (i) => {
    const sit = situacaoInsumo(i);
    if (v.filtro === "abaixo") return sit.faltam > 0;
    if (v.filtro === "zerado") return (temReceitaEmAlgumLugar() ? disponivelInsumo(i.id) : saldoInsumo(i.id)) <= 0;
    if (v.filtro === "semmin") return !Number(i.minimo);
    return true;
  };
  const b = normIns(v.busca);
  const lista = lista0.filter(passa)
    .filter((i) => v.fornecedor === "todas" || i.fornecedorId === v.fornecedor
      || (i.outrosFornecedores || []).includes(v.fornecedor))
    .filter((i) => v.categoria === "todas" || i.categoria === v.categoria)
    .filter((i) => !b || [i.codigo, i.nome, i.categoria, i.local].some((x) => normIns(x).includes(b)));

  const kpiI = (lbl, val, foot, tone, filtro) =>
    `<div class="kpi ${tone || ""} clicavel ${(v.filtro || "todos") === filtro ? "ativo" : ""}" data-finsumo="${filtro}" role="button" tabindex="0" title="Mostrar só estes na lista abaixo">
      <div class="lbl">${lbl}</div><div class="val mono">${n0(val)}</div><div class="foot">${foot}</div></div>`;

  const forns = (S.cad.fornecedores || []).slice().sort((a, c) => a.nome.localeCompare(c.nome));
  const cats = [...new Set(lista0.map((i) => i.categoria).filter(Boolean))].sort();

  const ordenado = ordenarPor("insumo", lista, (i, campo) =>
    campo === "codigo" ? i.codigo : campo === "nome" ? i.nome : campo === "categoria" ? i.categoria
    : campo === "unidade" ? i.unidade : campo === "saldo" ? saldoInsumo(i.id)
    : campo === "minimo" ? (Number(i.minimo) || 0) : campo === "reservado" ? reservadoInsumo(i.id)
    : campo === "disp" ? disponivelInsumo(i.id) : campo === "forn" ? (fornecedorPorId(i.fornecedorId)?.nome || "")
    : campo === "custo" ? (custoInsumo(i.id)?.ultimo || 0) : null);

  /* Tela sem nenhum insumo cadastrado mostrava quatro contadores em zero por
     cima de um "ainda não há insumos". Contador em zero não é informação: é a
     mesma frase escrita quatro vezes, em cima da frase que já a diz. Com a
     lista vazia, a faixa de contadores sai e sobra a única coisa que importa
     ali, que é a explicação e o botão. */
  return `
  ${lista0.length ? `<div class="kpis">
    ${kpiI("Insumos", lista0.length, "cadastrados e ativos", "", "todos")}
    ${kpiI("Abaixo do mínimo", abaixo.length, "precisam de compra", abaixo.length ? "red" : "", "abaixo")}
    ${kpiI("Sem mínimo definido", semMin.length, "não avisam quando acabar", semMin.length ? "amber" : "", "semmin")}
    <div class="kpi-info">${kpi("Notas registradas", entradasNF().length, entradasNF().length ? `última em ${fdate((entradasNF()[entradasNF().length - 1] || {}).entradaEm)}` : "nenhuma entrada ainda")}</div>
  </div>` : ""}

  ${!lista0.length ? `<div class="card">${vazio("nada", "Ainda não há insumos",
      "Insumo é o que a fábrica <b>compra para produzir</b> — tecido, EVA, elástico, cola, embalagem, etiqueta. Diferente de Produtos, que é o que a Moda Bicho vende.<br>Comece cadastrando um, ou deixe a primeira nota fiscal criar todos de uma vez.",
      `<button class="btn primary sm" data-act="novo-insumo">${svg(IC.mais)}Novo insumo</button>
       <button class="btn sm" data-act="entrada-nf">${svg(IC.upload)}Entrada por NF</button>`)}</div>`
  : `<div class="card">
    <div class="filters">
      <div class="fb-linha fb-topo">
        <div class="search">${svg(IC.busca)}<input class="inp" id="q-insumo" style="width:250px" placeholder="Buscar insumo, código ou local" value="${esc(v.busca)}"></div>
        <span style="font-size:12.5px;color:var(--ink-3)" class="mono">${lista.length} de ${lista0.length}</span>
        ${forns.length ? `<select class="sel" id="f-ins-forn"><option value="todas">Todo fornecedor</option>
          ${forns.map((f) => `<option value="${esc(f.id)}" ${v.fornecedor === f.id ? "selected" : ""}>${esc(f.nome)}</option>`).join("")}</select>` : ""}
        ${cats.length ? `<select class="sel" id="f-ins-cat"><option value="todas">Toda categoria</option>
          ${cats.map((c) => `<option ${v.categoria === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>` : ""}
        <div class="fb-grupo" style="margin-left:auto">
          <button class="btn sm" data-act="ajuste-insumo" title="Inventário, perda ou correção — vira um movimento, não uma edição do saldo">${svg(IC.regua2)}Ajustar estoque</button>
          <button class="btn sm" data-act="entrada-nf" title="Registrar a compra: manual ou lendo o XML da NF-e">${svg(IC.upload)}Entrada por NF</button>
          <button class="btn primary sm" data-act="novo-insumo">${svg(IC.mais)}Novo insumo</button>
        </div>
      </div>
    </div>
    <div class="tw"><table class="t t-ins">
      <thead><tr>
        ${thOrd("insumo", "codigo", "Código")}${thOrd("insumo", "nome", "Insumo")}${thOrd("insumo", "categoria", "Categoria")}
        ${thOrd("insumo", "unidade", "Un.")}${thOrd("insumo", "saldo", "Físico", "num")}
        ${temAlgumaReceita ? `${thOrd("insumo", "reservado", "Reservado", "num")}${thOrd("insumo", "disp", "Disponível", "num")}` : ""}
        ${thOrd("insumo", "minimo", "Mínimo", "num")}
        <th class="num">Comprar</th>${thOrd("insumo", "forn", "Fornecedor")}${thOrd("insumo", "custo", "Última compra", "num")}<th>Ação</th></tr></thead>
      <tbody>${ordenado.slice(0, v.limite).map((i) => { const sit = situacaoInsumo(i); const saldo = saldoInsumo(i.id);
        const c = custoInsumo(i.id); const f = fornecedorPorId(i.fornecedorId);
        return `<tr class="clickable ${sit.tom === "erro" ? "linha-atraso" : ""}" data-insumo="${esc(i.id)}">
        <td class="sku">${esc(i.codigo || "—")}</td>
        <td><b>${esc(i.nome)}</b>${i.local ? `<div class="hint" style="margin:2px 0 0">${esc(i.local)}</div>` : ""}</td>
        <td style="font-size:11.5px;color:var(--ink-3)">${esc(i.categoria || "—")}</td>
        <td style="font-size:11.5px;color:var(--ink-3)">${esc(i.unidade || "un")}</td>
        <td class="num"><b>${nDec(saldo)}</b>${!temAlgumaReceita ? `<div class="ins-sit s-${sit.tom}">${sit.nome}</div>` : ""}</td>
        ${temAlgumaReceita ? (() => { const res = reservadoInsumo(i.id);
          return `<td class="num" style="color:var(--ink-3)">${res ? nDec(res) : "—"}</td>
          <td class="num"><b>${nDec(saldo - res)}</b><div class="ins-sit s-${sit.tom}">${sit.nome}</div></td>`; })() : ""}
        <td class="num" style="color:var(--ink-3)">${i.minimo ? nDec(i.minimo) : "—"}</td>
        <td class="num">${sit.faltam > 0 ? `<b style="color:var(--red)">${nDec(sit.faltam)}</b>` : '<span style="color:var(--ink-4)">—</span>'}</td>
        <td style="font-size:11.5px">${f ? esc(f.nome) : '<span style="color:var(--ink-4)">—</span>'}</td>
        <td class="num" style="font-size:11.5px">${c ? `${fmoeda(c.ultimo)}${c.compras > 1 ? `<div class="hint" style="margin:2px 0 0">méd. ${fmoeda(c.medio)}</div>` : ""}` : '<span style="color:var(--ink-4)">—</span>'}</td>
        <td style="white-space:nowrap"><button class="btn sm ghost" data-ins-extrato="${esc(i.id)}" title="De onde veio este número">Extrato</button>
          <button class="btn sm ghost" data-ins-editar="${esc(i.id)}">Editar</button></td></tr>`; }).join("")
        || (lista0.length ? vazioLinha("filtro", "Nenhum resultado", "Nenhum insumo com estes filtros.",
              `<button class="btn primary sm" data-finsumo="todos">Ver todos</button>`) : "")}
      </tbody></table></div>
    ${lista.length > v.limite ? `<div style="padding:14px;text-align:center;border-top:1px solid var(--line-2)"><button class="btn" data-act="mais-insumo">Mostrar mais</button></div>` : ""}
    <details class="legenda"><summary>Como ler esta tabela</summary><div class="legenda-in">
      <span><b>Em estoque</b> não é um campo digitado: é a soma de todos os movimentos do insumo — entradas de nota, consumo, ajustes de inventário. Toque em <b>Extrato</b> para ver de onde veio cada peça do número.</span>
      <span><b>Comprar</b> é quanto falta para voltar ao mínimo. Esses itens aparecem também na aba <b>Compras</b>, junto com o que a produção anotou como falta.</span>
      <span><b>Última compra</b> vem das entradas de nota. A média é ponderada pela quantidade — uma compra de 500 pesa mais que uma de 5.</span>
    </div></details>
  </div>`}`;
}

/* números de insumo aceitam fração (0,5 m de tecido), mas não devem virar
   "515,00" quando são inteiros: a tabela fica ilegível */
const nDec = (x) => { const n = Number(x) || 0;
  return Number.isInteger(n) ? n0(n) : n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 3 }); };

/* ---------- janelas dos insumos ---------- */
function modaisInsumos(m) {
  if (m.tipo === "entradaNF") return modalEntradaNF(m);
  /* ---------- cadastro ---------- */
  if (m.tipo === "insumo") {
    const i = m.i;
    const novo = !!m.novo;
    const forns = (S.cad.fornecedores || []).slice().sort((a, b) => a.nome.localeCompare(b.nome));
    const f = (rot, dentro, dica) => `<label class="fld"><span>${rot}</span>${dentro}${dica ? `<div class="hint" style="margin-top:4px">${dica}</div>` : ""}</label>`;
    const saldo = novo ? 0 : saldoInsumo(i.id);
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:600px" role="dialog" aria-label="${novo ? "Novo insumo" : "Editar insumo"}">
      <div class="modal-h"><h2>${novo ? "Novo insumo" : esc(i.nome || "Insumo")}</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <div class="grid2" style="gap:12px">
          ${f("Código interno", `<input class="inp" data-ins="codigo" value="${esc(i.codigo || "")}" placeholder="INS-001">`, "o seu código, não o do fornecedor")}
          ${f("Unidade de medida", `<select class="sel" data-ins="unidade">
            ${INS_UNIDADES.map((u) => `<option ${i.unidade === u ? "selected" : ""}>${u}</option>`).join("")}</select>`)}
        </div>
        <div style="margin-top:12px">${f("Nome", `<input class="inp" data-ins="nome" value="${esc(i.nome || "")}" placeholder="Ex.: EVA azul 3 mm">`)}</div>
        <div class="grid2" style="gap:12px;margin-top:12px">
          ${f("Categoria", `<select class="sel" data-ins="categoria"><option value="">—</option>
            ${INS_CATEGORIAS.map((c) => `<option ${i.categoria === c ? "selected" : ""}>${c}</option>`).join("")}</select>`)}
          ${f("Onde fica", `<input class="inp" data-ins="local" value="${esc(i.local || "")}" placeholder="Ex.: prateleira 3, sala de corte">`)}
        </div>
        <div class="grid2" style="gap:12px;margin-top:12px">
          ${f("Estoque mínimo", `<input type="number" step="any" min="0" class="inp num" data-ins="minimo" value="${i.minimo ?? ""}">`,
            "abaixo disso o insumo aparece em Compras")}
          ${f("Fornecedor principal", `<select class="sel" data-ins="fornecedorId"><option value="">—</option>
            ${forns.map((x) => `<option value="${esc(x.id)}" ${i.fornecedorId === x.id ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select>`)}
        </div>
        <div style="margin-top:12px">${f("Observação", `<textarea class="inp" data-ins="obs" rows="2">${esc(i.obs || "")}</textarea>`)}</div>

        <div class="secao">Como este material é manuseado</div>
        <div class="grid2" style="gap:12px">
          ${f("Embalagem fechada", `<input class="inp" data-ins="embNome" value="${esc(i.embalagem?.nome || "")}" placeholder="caixa, fardo, cone…">`,
            "deixe em branco se o material é sempre contado na unidade")}
          ${f(`Quantas ${esc(i.unidade || "un")} vêm nela`, `<input type="number" step="any" min="0" class="inp num" data-ins="embFator" value="${i.embalagem?.fator ?? ""}" placeholder="9000">`)}
        </div>
        ${temEmbalagem(i) ? `<div class="hint" style="margin:-6px 0 12px">1 ${esc(i.embalagem.nome)} = <b>${nDec(i.embalagem.fator)} ${esc(i.unidade || "un")}</b>. O saldo continua sendo contado em ${esc(i.unidade || "un")} — a ${esc(i.embalagem.nome)} é só o jeito de digitar.</div>` : ""}


        ${novo ? `<div class="secao">Saldo inicial</div>
          <div class="grid2" style="gap:12px">
            ${f("Quanto tem hoje", `<input type="number" step="any" class="inp num" data-ins="saldoInicial" value="">`,
              "vira um movimento de ajuste com a data de hoje — dá para ver no extrato depois")}
          </div>`
        : `<div class="secao">Estoque</div>
          <dl class="kv" style="border:0">
            <dt>Em estoque agora</dt><dd>${nDec(saldo)} ${esc(i.unidade || "un")}</dd>
            <dt>Movimentos registrados</dt><dd>${n0(movsDoInsumo(i.id).length)}</dd>
            ${(() => { const c = custoInsumo(i.id); return c ? `<dt>Última compra</dt><dd>${fmoeda(c.ultimo)}</dd>
              <dt>Média ponderada</dt><dd>${fmoeda(c.medio)}</dd>` : ""; })()}
          </dl>
          <p class="hint" style="margin:8px 0 0">O saldo não se edita aqui: ele é a soma dos movimentos. Para corrigir, use <b>Ajustar estoque</b> — a correção fica registrada com motivo e autor.</p>
          ${(i.codigosFornecedor || []).length ? `<div class="secao">Como este insumo chega nas notas</div>
            <div class="tw"><table class="t" style="font-size:12px"><thead><tr><th>Fornecedor</th><th>Código na nota</th><th>Descrição</th><th></th></tr></thead>
            <tbody>${i.codigosFornecedor.map((c, ix) => `<tr>
              <td>${esc(fornecedorPorId(c.fornecedorId)?.nome || "—")}</td>
              <td class="sku">${esc(c.codigo)}</td>
              <td style="font-size:11px;color:var(--ink-3)">${esc(c.descricao || "—")}</td>
              <td><button class="ic-btn" data-ins-descod="${ix}" title="Desfazer o vínculo" aria-label="Remover">${svg(IC.lixeira)}</button></td></tr>`).join("")}
            </tbody></table></div>
            <p class="hint" style="margin:6px 0 0">Esse vínculo se forma sozinho na primeira nota. Da segunda em diante o item entra já reconhecido.</p>` : ""}`}
      </div>
      <div class="modal-f">
        ${!novo ? `<button class="btn danger" data-ins-excluir="${esc(i.id)}">Excluir</button>` : ""}
        <button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="salvar-insumo">Salvar</button></div></div></div>`;
  }

  /* ---------- extrato: de onde veio esse número ---------- */
  if (m.tipo === "extratoInsumo") {
    const i = insumoPorId(m.id);
    if (!i) return "";
    const filtro = m.filtro || "todos";
    const todos = extratoInsumo(i.id);
    const passa = (x) => filtro === "entradas" ? x.qtd > 0 && x.tipo === "entrada"
      : filtro === "saidas" ? x.qtd < 0 && x.tipo !== "ajuste"
      : filtro === "ajustes" ? x.tipo === "ajuste" : true;
    const lista = todos.filter(passa);
    const c = custoInsumo(i.id);
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(760px,96vw)" role="dialog" aria-label="Extrato do insumo">
      <div class="modal-h"><h2>${esc(i.nome)}</h2>
        <span class="tag">${nDec(saldoInsumo(i.id))} ${esc(i.unidade || "un")} em estoque</span>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        ${(() => { const res = reservadoInsumo(i.id); if (!res) return "";
          const pedidos = (reservasInsumo().get(i.id) || {}).pedidos || [];
          return `<div class="aviso" style="margin:0 0 12px;border-color:var(--teal);background:var(--teal-soft)">
            <b>${nDec(res)} ${esc(i.unidade || "un")} reservados</b> para ${pedidos.length} ${pedidos.length === 1 ? "pedido que ainda vai acontecer" : "pedidos que ainda vão acontecer"} — sobram <b>${nDec(saldoInsumo(i.id) - res)}</b> disponíveis.
            <div class="hint" style="margin:5px 0 0">${pedidos.slice(0, 6).map((x) => `${esc(x.numero)} (${nDec(x.qtd)})`).join(" · ")}${pedidos.length > 6 ? ` e mais ${pedidos.length - 6}` : ""}</div>
            <div class="hint" style="margin:4px 0 0">A reserva sai da receita do processo. O desconto de verdade acontece quando o pedido é conferido.</div></div>`; })()}
        ${c ? `<dl class="kv" style="border:0;margin-bottom:6px">
          <dt>Última compra</dt><dd>${fmoeda(c.ultimo)} · ${fdate(c.ultimoEm)}</dd>
          <dt>Média ponderada</dt><dd>${fmoeda(c.medio)}</dd>
          <dt>Menor · maior pago</dt><dd>${fmoeda(c.menor)} · ${fmoeda(c.maior)}</dd>
        </dl>` : ""}
        <div class="seg" style="margin:12px 0">
          ${[["todos", "Todos"], ["entradas", "Entradas"], ["saidas", "Saídas"], ["ajustes", "Ajustes"]]
            .map(([id, nome]) => `<button class="${filtro === id ? "on" : ""}" data-ins-fmov="${id}">${nome}</button>`).join("")}
        </div>
        <div class="tw" style="max-height:min(52vh,440px)"><table class="t" style="font-size:12.5px">
          <thead><tr><th>Quando</th><th>O que foi</th><th>Documento</th><th class="num">Qtd</th><th class="num">Saldo</th><th>Quem</th></tr></thead>
          <tbody>${lista.map((x) => `<tr>
            <td class="mono" style="font-size:11.5px;white-space:nowrap">${fdate(x.em)}</td>
            <td><span class="ins-mov m-${INS_TIPOS[x.tipo]?.tom || "ajuste"}">${INS_TIPOS[x.tipo]?.nome || x.tipo}</span>
              ${x.obs ? `<div class="hint" style="margin:2px 0 0">${esc(x.obs)}</div>` : ""}</td>
            <td style="font-size:11.5px">${x.doc?.tipo === "nf" ? `NF ${esc(x.doc.numero || "")}${x.doc.fornecedor ? `<div class="hint" style="margin:1px 0 0">${esc(x.doc.fornecedor)}</div>` : ""}`
              : x.doc?.tipo === "op" ? `Pedido ${esc(x.doc.numero || "")}`
              : x.doc?.tipo === "inv" ? "Inventário" : '<span style="color:var(--ink-4)">—</span>'}</td>
            <td class="num"><b style="color:${x.qtd > 0 ? "var(--teal)" : "var(--red)"}">${x.qtd > 0 ? "+" : ""}${nDec(x.qtd)}</b></td>
            <td class="num mono">${nDec(x.saldo)}</td>
            <td style="font-size:11.5px;color:var(--ink-3)">${esc(x.por || "—")}</td></tr>`).join("")
            || (todos.length ? vazioLinha("filtro", "Nenhum resultado", "Nenhum movimento deste tipo.")
                : vazioLinha("nada", "Nenhum movimento ainda", "O estoque deste insumo começa a existir na primeira entrada de nota ou no primeiro ajuste."))}
          </tbody></table></div>
      </div>
      <div class="modal-f">
        <button class="btn" data-ins-ajustar="${esc(i.id)}">Ajustar estoque</button>
        <button class="btn" style="margin-left:auto" data-fechar="1">Fechar</button></div></div></div>`;
  }

  /* ---------- ajuste: corrigir é registrar, não sobrescrever ---------- */
  if (m.tipo === "ajusteInsumo") {
    const i = m.id ? insumoPorId(m.id) : null;
    const lista = insumos().filter((x) => x.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome));
    const alvo = i || insumoPorId(m.escolhido);
    const saldo = alvo ? saldoInsumo(alvo.id) : 0;
    const contado = m.contado;
    const dif = contado === "" || contado == null ? null : Number(contado) - saldo;
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:520px" role="dialog" aria-label="Ajustar estoque">
      <div class="modal-h"><h2>Ajustar estoque</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p class="hint" style="margin:0 0 14px">Contagem de inventário, perda ou correção. O saldo não é reescrito: entra um <b>movimento de ajuste</b> com a diferença, e o extrato passa a mostrar quem corrigiu, quando e por quê.</p>
        <label class="fld"><span>Insumo</span>
          <select class="sel" id="aj-insumo">${!alvo ? '<option value="">Selecionar…</option>' : ""}
            ${lista.map((x) => `<option value="${esc(x.id)}" ${alvo?.id === x.id ? "selected" : ""}>${esc(x.codigo ? x.codigo + " · " : "")}${esc(x.nome)}</option>`).join("")}</select></label>
        ${alvo ? `
        <div class="grid2" style="gap:12px;margin-top:14px">
          <div class="fld"><span>O app diz que tem</span>
            <div style="font-size:23px;font-weight:800;font-family:var(--mono);padding-top:4px">${nDec(saldo)} <span style="font-size:13px;font-weight:500;color:var(--ink-3)">${esc(alvo.unidade || "un")}</span></div></div>
          <label class="fld"><span>Você contou</span>
            <input type="number" step="any" class="inp num" id="aj-contado" value="${contado ?? ""}" placeholder="0" autofocus></label>
        </div>
        ${dif != null && dif !== 0 ? `<div class="aviso" style="margin:14px 0 0;${dif < 0 ? "border-color:var(--red);background:var(--red-soft)" : "border-color:var(--teal);background:var(--teal-soft)"}">
          Vai entrar um ajuste de <b>${dif > 0 ? "+" : ""}${nDec(dif)}</b>. ${dif < 0 ? "Sobrou no papel e faltou na prateleira — vale anotar o motivo." : "Havia mais do que o app contava."}</div>` : ""}
        ${dif === 0 ? '<div class="aviso" style="margin:14px 0 0;border-color:var(--teal);background:var(--teal-soft)">Bateu certo — não há o que ajustar.</div>' : ""}
        <label class="fld" style="margin-top:14px"><span>Motivo</span>
          <select class="sel" id="aj-motivo">
            <option value="inventario">Contagem de inventário</option>
            <option value="perda">Perda, quebra ou sobra de corte</option>
            <option value="erro">Erro de lançamento anterior</option>
            <option value="outro">Outro</option>
          </select></label>
        <label class="fld" style="margin-top:12px"><span>Observação</span>
          <input class="inp" id="aj-obs" maxlength="200" placeholder="Ex.: contagem do fim do mês, prateleira 3"></label>` : ""}
      </div>
      <div class="modal-f"><button class="btn" data-fechar="1">Cancelar</button>
        <button class="btn primary" style="margin-left:auto" data-act="salvar-ajuste" ${alvo && dif != null && dif !== 0 ? "" : "disabled"}>Registrar ajuste</button></div></div></div>`;
  }

  return null;
}

/* ---------- entrada por nota fiscal ----------
   Duas portas para o mesmo lugar: ler o XML (que já vem conferido pela SEFAZ e
   elimina a digitação) ou preencher à mão quando não há XML. As duas terminam
   na mesma tela de conferência, porque o passo perigoso é o mesmo: dizer qual
   item da nota é qual insumo daqui. */
function modalEntradaNF(m) {
  const forns = (S.cad.fornecedores || []).slice().sort((a, b) => a.nome.localeCompare(b.nome));
  const nf = m.nf;

  if (!nf) return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:560px" role="dialog" aria-label="Entrada por nota fiscal">
    <div class="modal-h"><h2>Entrada de insumos</h2>
      <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
    <div class="modal-b">
      <p class="hint" style="margin:0 0 16px">A entrada não edita o saldo: ela cria um movimento por item. É o que permite, meses depois, abrir o insumo e ver que aquelas 500 chapas vieram da NF 541.</p>
      <div class="dz-grupo">
        <div class="dz" id="dz-nfe">${svg(IC.upload)}
          <div style="font-size:13px;font-weight:600;margin:6px 0 2px">Arraste o XML da NF-e</div>
          <div style="font-size:11.5px;color:var(--ink-3);margin-bottom:9px">fornecedor, número, data, chave, itens, quantidades e custos — tudo lido de uma vez</div>
          <button class="btn primary sm" data-act="pick-nfe">Escolher arquivo</button></div>
        <div class="dz">${svg(IC.editar)}
          <div style="font-size:13px;font-weight:600;margin:6px 0 2px">Preencher à mão</div>
          <div style="font-size:11.5px;color:var(--ink-3);margin-bottom:9px">quando não há XML — compra no balcão, sem nota, ou nota em papel</div>
          <button class="btn sm" data-act="nf-manual">Começar em branco</button></div>
      </div>
      <p class="hint" style="margin:14px 0 0">O <b>XML</b> é o arquivo que o fornecedor manda por e-mail junto com a nota. Guardamos os dados e a <b>chave de 44 dígitos</b> — a DANFE se consulta a qualquer momento no portal da SEFAZ por ela.</p>
    </div></div></div>`;

  /* --- conferência: o único passo que precisa de gente --- */
  const fid = m.fornecedorId || null;
  const vinculados = nf.itens.filter((i) => i.insumoId).length;
  const pendentes = nf.itens.length - vinculados;
  const lista = insumos().filter((x) => x.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome));
  const total = nf.itens.filter((i) => i.insumoId).reduce((s2, i) => s2 + (Number(i.vTotal) || 0), 0);

  return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(1000px,96vw)" role="dialog" aria-label="Conferir a nota">
    <div class="modal-h"><h2>${m.manual ? "Entrada manual" : `Nota ${esc(nf.numero || "")}`}</h2>
      ${nf.fornecedorNome ? `<span class="tag">${esc(nf.fornecedorNome)}</span>` : ""}
      <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
    <div class="modal-b">
      ${!m.manual ? `<div class="nf-resumo">
        <div><span>Nota</span><b>${esc(nf.numero || "—")}${nf.serie ? ` · série ${esc(nf.serie)}` : ""}</b></div>
        <div><span>Emitida em</span><b>${nf.emitidaEm ? fdate(nf.emitidaEm) : "—"}</b></div>
        <div><span>Itens</span><b>${n0(nf.itens.length)}</b></div>
        <div><span>Total da nota</span><b>${freal(nf.total)}</b></div>
        ${nf.chave ? `<div style="flex-basis:100%"><span>Chave</span><b class="mono" style="font-size:11px;word-break:break-all">${esc(nf.chave)}</b></div>` : ""}
      </div>` : ""}

      <div class="grid2" style="gap:12px;margin-bottom:6px">
        <label class="fld"><span>Fornecedor</span>
          <select class="sel" id="nf-forn"><option value="">Selecionar…</option>
            ${forns.map((f) => `<option value="${esc(f.id)}" ${fid === f.id ? "selected" : ""}>${esc(f.nome)}</option>`).join("")}
          </select>
          ${!fid && nf.fornecedorNome ? `<div class="hint" style="margin-top:4px">A nota veio de <b>${esc(nf.fornecedorNome)}</b>${nf.cnpj ? ` (${esc(nf.cnpj)})` : ""}. <button class="btn sm ghost" data-act="nf-criar-forn">Criar este fornecedor</button></div>` : ""}
        </label>
        <label class="fld"><span>Data de entrada no estoque</span>
          <input type="date" class="inp" id="nf-data" value="${esc(nf.entradaEm || iso(hoje()))}">
          <div class="hint" style="margin-top:4px">quando o material chegou aqui — pode ser depois da emissão</div></label>
      </div>

      ${m.manual ? "" : (() => {
        const porCod = nf.itens.filter((i) => i.origem === "codigo").length;
        const porPal = nf.itens.filter((i) => i.origem === "palpite").length;
        const atencao = pendentes || porPal;
        return `<div class="aviso" style="margin:14px 0 10px;${atencao ? "border-color:var(--amber);background:var(--amber-soft)" : "border-color:var(--teal);background:var(--teal-soft)"}">
        <b>${n0(nf.itens.length)} ${nf.itens.length === 1 ? "item lido" : "itens lidos"}</b>${porCod ? ` · ${n0(porCod)} reconhecido${porCod > 1 ? "s" : ""} pelo código do fornecedor` : ""}${porPal ? ` · <b>${n0(porPal)}</b> ${porPal === 1 ? "preenchido por palpite" : "preenchidos por palpite"}` : ""}${pendentes ? ` · <b>${n0(pendentes)}</b> sem vínculo` : ""}${!atencao ? " — está tudo pronto" : ""}
        ${porPal ? "<br>Palpite é o app comparando nomes, não o seu código: <b>confira as linhas marcadas</b> antes de gravar — errar aqui soma no estoque do insumo errado." : ""}
        ${pendentes ? "<br>O código do fornecedor não é o seu: diga qual insumo é cada um e o app aprende para a próxima nota." : ""}</div>`; })()}

      <div class="tw" style="max-height:min(46vh,400px)"><table class="t" style="font-size:12.5px">
        <thead><tr><th>Item na nota</th><th style="width:36%">É qual insumo daqui</th><th class="num">Qtd</th><th>Un.</th><th class="num">Custo un.</th><th class="num">Total</th><th></th></tr></thead>
        <tbody>${nf.itens.map((it, ix) => `<tr class="${!it.insumoId ? "nf-pend" : it.origem === "palpite" ? "nf-palpite" : ""}">
          <td>${m.manual ? `<input class="inp" data-nfi="${ix}|descricao" value="${esc(it.descricao || "")}" placeholder="o que é" style="font-size:12px">`
            : `<b>${esc(it.descricao || "—")}</b>${it.codigoForn ? `<div class="sku" style="font-size:10.5px;margin-top:2px">${esc(it.codigoForn)}</div>` : ""}`}</td>
          <td>${pickInsumo(it.insumoId, `data-nfi="${ix}|insumoId"`, { criar: true, placeholder: "digite o nome do insumo…" })}
            ${it.origem === "palpite" ? `<div class="hint" style="margin:3px 0 0;color:var(--amber);font-weight:600">palpite pelo nome — confira antes de gravar</div>` : ""}
            ${it.origem === "codigo" ? `<div class="hint" style="margin:3px 0 0;color:var(--teal)">reconhecido pelo código do fornecedor</div>` : ""}</td>
          <td class="num"><input type="number" step="any" class="inp num" data-nfi="${ix}|qtd" value="${it.qtd || ""}" style="width:82px;font-size:12px"></td>
          <td style="font-size:11px;color:var(--ink-3)">${esc(it.unidade || "—")}</td>
          <td class="num"><label class="rs-in"><input type="number" step="any" class="inp num" data-nfi="${ix}|vUnit" value="${it.vUnit || ""}" style="width:100px;font-size:12px"></label></td>
          <td class="num mono">${freal((Number(it.qtd) || 0) * (Number(it.vUnit) || 0))}</td>
          <td>${m.manual ? `<button class="ic-btn" data-nfi-rm="${ix}" title="Tirar da nota" aria-label="Remover">${svg(IC.lixeira)}</button>` : ""}</td>
        </tr>`).join("")}
        </tbody></table></div>
      ${m.manual ? `<button class="btn sm" style="margin-top:10px" data-act="nf-add-item">${svg(IC.mais)}Adicionar item</button>` : ""}

      <div class="nf-total">
        <span>${n0(vinculados)} ${vinculados === 1 ? "item entra" : "itens entram"} no estoque</span>
        <b>${freal(total)}</b>
      </div>
      ${nf.frete || nf.desconto ? `<p class="hint" style="margin:8px 0 0">A nota tem ${nf.frete ? `frete de ${freal(nf.frete)}` : ""}${nf.frete && nf.desconto ? " e " : ""}${nf.desconto ? `desconto de ${freal(nf.desconto)}` : ""}. Eles ficam guardados na entrada, mas não são rateados no custo de cada item.</p>` : ""}
    </div>
    <div class="modal-f"><button class="btn" data-fechar="1">Cancelar</button>
      <button class="btn primary" style="margin-left:auto" data-act="nf-registrar" ${vinculados ? "" : "disabled"}>Registrar entrada${vinculados ? ` de ${n0(vinculados)}` : ""}</button></div></div></div>`;
}

/* ---------- colher o que está digitado ----------
   A tela é redesenhada a cada clique, então o que está nos campos precisa ser
   recolhido ANTES de qualquer render — o mesmo cuidado da tela de estruturas. */
const INS_NUM = ["minimo", "saldoInicial", "embFator"];
function colherInsumo() {
  const m = S.modal; if (m?.tipo !== "insumo") return null;
  document.querySelectorAll("[data-ins]").forEach((el) => {
    const k = el.dataset.ins;
    m.i[k] = INS_NUM.includes(k) ? (el.value === "" ? null : Number(el.value)) : el.value;
  });
  /* os campos soltos da tela viram os dois objetos que o resto do app lê. Os
     avulsos somem: sobrando, um dia alguém leria `i.embFator` achando que vale. */
  const nome = String(m.i.embNome || "").trim(), fator = Number(m.i.embFator) || 0;
  m.i.embalagem = (nome && fator > 0) ? { nome, fator } : null;
  ["embNome", "embFator"].forEach((k) => delete m.i[k]);
  return m.i;
}
/* ---------- a retirada ----------
   O formulário inteiro vira estado antes de qualquer decisão: assim o desenho da
   tela pode mudar (uma linha a mais, um chip trocado) sem perder o que já foi
   digitado, que é o jeito de um formulário longo não punir quem o preenche. */
function colherRetirada() {
  const m = S.modal; if (m?.tipo !== "retirada") return null;
  const r = m.r;
  $$("[data-rt]").forEach((el) => { r[el.dataset.rt] = el.value; });
  $$("[data-rtp]").forEach((el) => {
    const [i, k] = String(el.dataset.rtp).split("|"); const p = (r.prods || [])[Number(i)]; if (!p) return;
    p[k] = k === "qtd" ? (el.value === "" ? null : Number(el.value)) : el.value;
  });
  $$("[data-rtm]").forEach((el) => {
    const [i, k] = String(el.dataset.rtm).split("|"); const x = (r.mats || [])[Number(i)]; if (!x) return;
    x[k] = k === "qtd" ? (el.value === "" ? null : Number(el.value)) : el.value;
  });
  return r;
}
/* a quantidade que de fato vai virar movimento, já convertida da embalagem */
function qtdBaseDaLinha(x) {
  const b = bemPorId(x?.bemId); if (!b) return 0;
  return (x.emb && temEmbalagem(b)) ? emBase(b, x.qtd) : (Number(x.qtd) || 0);
}
/* sugestão, nunca obrigação: a linha do par nasce preenchida e editável */
function sugerirPar(r, ix) {
  const x = (r.mats || [])[ix]; if (!x?.bemId) return null;
  const b = bemPorId(x.bemId); if (!b) return null;
  const sug = sugestaoJunto(b, qtdBaseDaLinha(x)); if (!sug) return null;
  if (r.mats.some((y, j) => j !== ix && y.bemId === sug.bem.id)) return null;  /* já está na lista */
  r.mats.push({ bemId: sug.bem.id, qtd: sug.qtd, emb: false, sugerida: true });
  return { nome: sug.bem.nome, qtd: sug.qtd,
    motivo: `a cada ${nDec(sug.aCada)} de ${b.nome} vai ${nDec(sug.sugerir)}` };
}
async function salvarRetirada() {
  const r = colherRetirada(); if (!r) return;
  const prest = String(r.prestadora || "").trim();
  if (!prest) return toast("Escolha a prestadora.", "erro");
  const quando = String(r.data || iso(hoje()));
  const volta = r.sentido === "volta";
  /* produção sem nenhum sinal (nem tamanho, nem campanha, nem SKU, nem quantidade)
     não é registro, é linha esquecida na tela */
  const prods = (r.prods || []).filter((p) => (p.tamanhos || []).length
    || String(p.campanha || "").trim() || String(p.sku || "").trim() || Number(p.qtd) > 0);
  const itens = (r.mats || []).map((x) => { const b = bemPorId(x.bemId);
    const q = qtdBaseDaLinha(x); return b && q > 0 ? { bem: b, q } : null; }).filter(Boolean);
  if (!prods.length && !itens.length && !(r.encerrar || []).length)
    return toast(volta ? "Nada para registrar — marque a produção que voltou ou informe o item."
      : "Nada para registrar — adicione uma produção ou um item.", "erro");

  /* a anotação inteira tem um id: é o que permite listá-la como um evento só e
     desfazê-la inteira quando a pessoa errou ao digitar */
  const rid = uid();
  let n = 0, sobrou = [];
  for (const { bem, q } of itens) {
    if (volta) {
      const res = baixarPosse({ bemId: bem.id, prestadora: prest, qtd: q, tipo: "devolucao",
        obs: `devolvido em ${fdate(quando)}` });
      res.ids.forEach(() => {});
      /* carimba o rid nas baixas recém-criadas, para o desfazer achá-las */
      for (const x of posseItens()) for (const bx of baixasDe(x)) if (res.ids.includes(bx.id)) bx.rid = rid;
      if (res.baixado) n++;
      if (res.sobrou > 0) sobrou.push(`${bem.nome} (${nDec(res.sobrou)} a mais do que constava com ela)`);
    } else {
      if (novaSaidaPosse({ bemId: bem.id, prestadora: prest, qtd: q, saiuEm: quando, rid })) n++;
    }
  }
  if (!volta) for (const p of prods) novaPosse({ ...p, prestadora: prest, data: quando, rid });
  let nFim = 0;
  if (volta) for (const id of (r.encerrar || [])) if (encerrarPosse(id, `devolvida em ${fdate(quando)}`)) nFim++;

  const resumo = [prods.length && !volta ? `${n0(prods.length)} ${prods.length === 1 ? "produção" : "produções"}` : "",
    n ? `${n0(n)} ${n === 1 ? "item" : "itens"}` : "",
    nFim ? `${n0(nFim)} ${nFim === 1 ? "produção encerrada" : "produções encerradas"}` : ""].filter(Boolean).join(" e ");
  registrar(null, `${volta ? "devolução de" : "saída para"} ${prest}: ${resumo}`, null, null);
  S.modal = null;
  await salvarTudo("insumos");
  render();
  toast(`${volta ? "Devolução" : "Saída"} de ${prest} registrada — ${resumo}.`
    + (sobrou.length ? ` Atenção: ${sobrou.join("; ")}.` : ""));
}

async function salvarInsumo() {
  const m = S.modal; const i = colherInsumo(); if (!i) return;
  if (!String(i.nome || "").trim()) return toast("O insumo precisa de um nome.", "erro");
  const cod = String(i.codigo || "").trim();
  const outro = cod ? insumos().find((x) => x.id !== i.id && String(x.codigo || "").toLowerCase() === cod.toLowerCase()) : null;
  if (outro) return toast(`O código ${cod} já é do insumo "${outro.nome}".`, "erro");
  const inicial = i.saldoInicial; delete i.saldoInicial;
  if (m.novo) {
    i.codigo = cod || proximoCodigoInsumo();
    i.criadoEm = iso(hoje()); i.ativo = true;
    insumos().push(i);
    /* o saldo inicial entra como ajuste, não como campo: assim ele aparece no
       extrato e a primeira linha da conta tem origem, como todas as outras */
    if (inicial != null && Number(inicial) !== 0)
      moverInsumo({ insumoId: i.id, tipo: "ajuste", qtd: Number(inicial),
        doc: { tipo: "inv" }, obs: "Saldo inicial do cadastro" });
  } else {
    const alvo = insumoPorId(i.id);
    if (alvo) Object.assign(alvo, i);
  }
  S.modal = null;
  await salvarInsumos();
  toast(m.novo ? `${i.nome} cadastrado.` : "Insumo salvo.");
}
async function salvarAjuste() {
  const m = S.modal; if (m?.tipo !== "ajusteInsumo") return;
  const id = document.getElementById("aj-insumo")?.value;
  const i = insumoPorId(id); if (!i) return toast("Escolha o insumo.", "erro");
  const contado = Number(document.getElementById("aj-contado")?.value);
  if (isNaN(contado)) return toast("Escreva quanto você contou.", "erro");
  const dif = contado - saldoInsumo(id);
  if (!dif) return toast("O contado bate com o saldo — não há o que ajustar.");
  const motivo = document.getElementById("aj-motivo")?.value || "inventario";
  const obs = document.getElementById("aj-obs")?.value || "";
  const MOT = { inventario: "Contagem de inventário", perda: "Perda, quebra ou sobra", erro: "Erro de lançamento anterior", outro: "Ajuste" };
  moverInsumo({ insumoId: id, tipo: "ajuste", qtd: dif, doc: { tipo: "inv" },
    obs: [MOT[motivo], obs].filter(Boolean).join(" — ") });
  S.modal = null;
  await salvarInsumos();
  toast(`${i.nome}: ajuste de ${dif > 0 ? "+" : ""}${nDec(dif)}. Saldo agora ${nDec(saldoInsumo(id))} ${i.unidade || "un"}.`);
}

/* ---------- a nota ---------- */
function colherNF() {
  const m = S.modal; if (m?.tipo !== "entradaNF" || !m.nf) return;
  const fid = document.getElementById("nf-forn")?.value;
  if (fid != null) m.fornecedorId = fid || null;
  const d = document.getElementById("nf-data")?.value;
  if (d) m.nf.entradaEm = d;
  document.querySelectorAll("[data-nfi]").forEach((el) => {
    const [ix, campo] = el.dataset.nfi.split("|");
    const it = m.nf.itens[Number(ix)];
    if (!it) return;
    if (campo === "insumoId") { if (el.value !== "__novo") it.insumoId = el.value || null; }
    else if (campo === "qtd" || campo === "vUnit") it[campo] = el.value === "" ? 0 : Number(el.value);
    else it[campo] = el.value;
  });
  m.nf.itens.forEach((it) => { it.vTotal = (Number(it.qtd) || 0) * (Number(it.vUnit) || 0); });
}
async function importarXmlNFe(file) {
  try {
    const texto = await file.text();
    const nf = lerXmlNFe(texto);
    /* o fornecedor se reconhece pelo CNPJ ou pelo nome — quem já mandou nota
       antes não precisa ser escolhido de novo */
    const forns = S.cad.fornecedores || [];
    const achado = forns.find((f) => f.cnpj && nf.cnpj && String(f.cnpj).replace(/\D/g, "") === String(nf.cnpj).replace(/\D/g, ""))
      || forns.find((f) => normIns(f.nome) === normIns(nf.fornecedorNome));
    const fid = achado?.id || null;
    const r = casarItensNF(nf, fid);
    S.modal = { tipo: "entradaNF", nf, fornecedorId: fid, manual: false };
    render();
    toast(r.pendentes
      ? `Nota lida: ${nf.itens.length} ${nf.itens.length === 1 ? "item" : "itens"}, ${r.pendentes} ${r.pendentes === 1 ? "precisa" : "precisam"} de vínculo.`
      : `Nota lida: ${nf.itens.length} ${nf.itens.length === 1 ? "item" : "itens"}, todos reconhecidos.`);
  } catch (e) {
    toast("Não consegui ler este XML: " + String(e?.message || e).slice(0, 110), "erro");
  }
}
async function registrarNF() {
  const m = S.modal; colherNF();
  if (m?.tipo !== "entradaNF" || !m.nf) return;
  if (!m.fornecedorId) return toast("Escolha o fornecedor da nota.", "erro");
  const r = registrarEntradaNF(m.nf, m.fornecedorId);
  if (r.erro) return toast(r.erro, "erro");
  S.modal = null;
  await salvarInsumos();
  toast(`Entrada registrada: ${r.n} ${r.n === 1 ? "insumo teve" : "insumos tiveram"} o estoque somado. Aparece no extrato de cada um.`);
}

async function acoesInsumos(act, t, e) {
  /* ---------- semiacabados ----------
     Bloco próprio, com return em cada ação: o encadeamento if/else-if abaixo é
     dos insumos, e enfiar semiacabado no meio dele misturaria dois assuntos que
     não têm nada a ver — que é exatamente o que esta aba existe para evitar. */
  if (act === "nova-remessa") { S.modal = { tipo: "remessa", r: { volumeQtd: 1, volumeUn: "caixa", itens: [] } }; render(); return; }
  if (act === "novo-semi") { S.modal = { tipo: "semiTipo", t: { tipo: "Bandana", categoria: "dia", variante: "digital" }, cat: "dia" }; render(); return; }
  if (act === "ajustar-semi") { S.modal = { tipo: "ajusteSemi" }; render(); return; }
  if (act === "semi-voltar") { S.semiView.aberta = null; render(); return; }
  if (act === "semi-mais") { S.semiView.limite = (S.semiView.limite || 40) + 40; render(); return; }
  if (act === "salvar-remessa") { await salvarRemessa(); return; }
  if (act === "salvar-retorno") { await salvarRetornoSemi(); return; }
  if (act === "confirmar-encerrar-remessa") { await confirmarEncerrarRemessa(); return; }
  if (act === "salvar-semi") { await salvarSemiTipo(); return; }
  if (act === "salvar-ajuste-semi") { await salvarAjusteSemi(); return; }
  if (act === "novo-insumo") {
    S.modal = { tipo: "insumo", novo: true, i: { id: uid(), codigo: proximoCodigoInsumo(), unidade: "un" } };
    render();
  }
  else if (act === "salvar-insumo") await salvarInsumo();
  else if (act === "ajuste-insumo") { S.modal = { tipo: "ajusteInsumo" }; render(); }
  else if (act === "salvar-ajuste") await salvarAjuste();
  else if (act === "entrada-nf") { S.modal = { tipo: "entradaNF" }; render(); }
  else if (act === "pick-nfe") escolherArquivo(".xml", importarXmlNFe);
  else if (act === "nf-manual") {
    S.modal = { tipo: "entradaNF", manual: true, nf: { itens: [{ descricao: "", qtd: null, vUnit: null, insumoId: null }],
      entradaEm: iso(hoje()), numero: null, total: 0 } };
    render();
  }
  else if (act === "nf-add-item") { colherNF();
    S.modal.nf.itens.push({ descricao: "", qtd: null, vUnit: null, insumoId: null }); render(); }
  else if (act === "nf-criar-forn") { colherNF();
    const nome = S.modal.nf.fornecedorNome; if (!nome) return;
    S.cad.fornecedores = S.cad.fornecedores || [];
    const f = { id: uid(), nome, cnpj: S.modal.nf.cnpj || null, prazoDias: null };
    S.cad.fornecedores.push(f);
    S.modal.fornecedorId = f.id;
    casarItensNF(S.modal.nf, f.id);
    await salvarTudo("cad"); render();
    toast(`${nome} cadastrado como fornecedor.`);
  }
  else if (act === "nf-registrar") await registrarNF();
  else if (act === "mais-insumo") { S.insumosView.limite += 80; render(); }
  else return false;
  return true;
}

/* ==========================================================================
   RECEITA DE PRODUÇÃO
   Quanto de cada insumo UMA peça consome. É a ponte que faltava entre o
   estoque de insumos e a produção: com ela o app sabe, sem ninguém contar,
   que 100 bandanas vão levar 100 embalagens, 200 adesivos e 50 m de tecido.

   Ela mora no PROCESSO, não no produto. São ~1.700 SKUs contra uma dúzia de
   processos: cadastrar receita produto a produto seria um trabalho que nunca
   terminaria, e a diferença entre uma bandana azul e uma vermelha quase nunca
   está no que ela consome. O produto pode ter receita própria quando de fato
   for exceção — e aí ela manda. Mesma lógica das estruturas de etapa.
   ========================================================================== */
const receitas = () => S.cad.receitas || (S.cad.receitas = []);
const receitaDoProcesso = (proc) => receitas().find((r) => normProc(r.processo) === normProc(proc)) || null;

/* resolve para um produto: a própria, senão a do processo, senão nada */
function receitaDe(prod) {
  if (!prod) return { itens: [], origem: null };
  if (Array.isArray(prod.receita) && prod.receita.length) return { itens: prod.receita, origem: "produto" };
  const r = receitaDoProcesso(prod.processo);
  if (r && (r.itens || []).length) return { itens: r.itens, origem: "processo", processo: r.processo };
  return { itens: [], origem: null };
}
const temReceita = (prod) => receitaDe(prod).itens.length > 0;

/* o que um pedido consome: a receita da peça vezes a quantidade dele.
   Pedido espelho (-A) não conta: é a continuação do mesmo lote noutro processo,
   e o material já saiu do estoque quando o pedido original foi feito. */
function consumoDoPedido(r, qtd) {
  if (!r || ehEspelho(r)) return [];
  const prod = produtoDe(opPorId(r.opId)?.sku || r.sku);
  const rec = receitaDe(prod);
  if (!rec.itens.length) return [];
  const q = Number(qtd ?? r.qtdConferida ?? r.qtd) || 0;
  return rec.itens
    .filter((i) => i.insumoId && (Number(i.qtd) || 0) > 0)
    .map((i) => ({ insumoId: i.insumoId, qtd: (Number(i.qtd) || 0) * q }));
}

/* ---------- reservado ----------
   O que já está prometido para pedidos que ainda vão acontecer. É a diferença
   entre "tenho 515 chapas" e "posso contar com 395": sem isso a compra chega
   sempre atrasada, porque o mínimo só dispara quando o material já sumiu.
   Só conta pedido VIVO e que ainda não deu baixa. */
let _cacheReserva = { rev: -1, mapa: null };
function reservasInsumo() {
  if (_cacheReserva.rev === _rev && _cacheReserva.mapa) return _cacheReserva.mapa;
  const mapa = new Map();
  for (const r of S.pedidos) {
    if (!PED_VIVO.includes(r.status) || r.consumoBaixado) continue;
    for (const c of consumoDoPedido(r, r.qtd)) {
      const a = mapa.get(c.insumoId) || { qtd: 0, pedidos: [] };
      a.qtd += c.qtd; a.pedidos.push({ numero: r.numero, qtd: c.qtd });
      mapa.set(c.insumoId, a);
    }
  }
  _cacheReserva = { rev: _rev, mapa };
  return mapa;
}
const reservadoInsumo = (id) => (reservasInsumo().get(id) || { qtd: 0 }).qtd;
const disponivelInsumo = (id) => saldoInsumo(id) - reservadoInsumo(id);
const esquecerReservas = () => { _cacheReserva = { rev: -1, mapa: null }; };

/* ---------- baixa automática ----------
   Quando dar baixa é uma escolha, e ela muda o significado do estoque:

   • na separação, o material sai fisicamente — mas ainda não se sabe quanto
     virou peça de verdade;
   • na conferência, sabe-se exatamente quanto voltou pronto.

   Escolhemos a conferência, e o RESERVADO cobre o intervalo: enquanto o pedido
   vive, o insumo aparece comprometido; quando ele volta, o consumo é lançado
   pela quantidade conferida. Assim o "disponível" nunca mente, e o consumo
   registrado é o real, não o previsto.

   A baixa é idempotente: conferir de novo não desconta duas vezes. */
function baixarConsumo(r) {
  if (!r || r.consumoBaixado || ehEspelho(r)) return null;
  const itens = consumoDoPedido(r, r.qtdConferida ?? r.qtd);
  if (!itens.length) return null;
  const ids = [];
  for (const c of itens) {
    if (!insumoPorId(c.insumoId)) continue;
    const mov = moverInsumo({ insumoId: c.insumoId, tipo: "consumo", qtd: c.qtd,
      doc: { tipo: "op", numero: r.numero, pedidoId: r.id },
      obs: `${n0(r.qtdConferida ?? r.qtd)} ${(r.qtdConferida ?? r.qtd) === 1 ? "peça" : "peças"} conferidas` });
    if (mov) ids.push(mov.id);
  }
  if (!ids.length) return null;
  r.consumoBaixado = true; r.consumoMovs = ids;
  esquecerReservas();
  return { n: ids.length, itens };
}
/* ---------- e o que estava com ela ----------
   O estoque de insumo da fábrica já baixou acima. Aqui baixa a POSSE: as
   etiquetas que estavam na mão da prestadora e viraram peça. São contas
   separadas de propósito — uma responde "quanto tenho para produzir", a outra
   "preciso mandar mais para ela?". O elo é `bem.insumoId`, e só existe para os
   itens que são as duas coisas. */
function baixarPosseDaConferencia(r) {
  if (!r || r.posseBaixada || ehEspelho(r)) return null;
  const prest = String(r.prestadora || "").trim(); if (!prest) return null;
  const itens = consumoDoPedido(r, r.qtdConferida ?? r.qtd);
  if (!itens.length) return null;
  const ids = []; const nomes = [];
  for (const c of itens) {
    const b = bemDoInsumo(c.insumoId); if (!b) continue;
    if (!emPosseDoBemCom(b.id, prest)) continue;   /* ela não tem esse item na mão */
    const res = baixarPosse({ bemId: b.id, prestadora: prest, qtd: c.qtd, tipo: "consumo",
      doc: { tipo: "op", numero: r.numero, pedidoId: r.id },
      obs: `${n0(r.qtdConferida ?? r.qtd)} ${(r.qtdConferida ?? r.qtd) === 1 ? "peça" : "peças"} conferidas` });
    if (res.baixado) { ids.push(...res.ids); nomes.push(b.nome); }
  }
  if (!ids.length) return null;
  r.posseBaixada = true; r.posseBaixas = ids;
  return { n: ids.length, nomes };
}

/* reabrir a conferência desfaz a baixa: senão o material sairia duas vezes
   quando o pedido fosse conferido de novo */
function desfazerConsumo(r) {
  let n = 0;
  if (r?.posseBaixada) {
    n += desfazerBaixasPosse(r.posseBaixas || []);
    delete r.posseBaixada; delete r.posseBaixas;
  }
  if (!r?.consumoBaixado) return n;
  const ids = new Set(r.consumoMovs || []);
  const antes = movsInsumo().length;
  S.movInsumo = movsInsumo().filter((m) => !ids.has(m.id));
  delete r.consumoBaixado; delete r.consumoMovs;
  esquecerSaldos(); esquecerReservas();
  return n + (antes - movsInsumo().length);
}

/* ---------- reabrir a conferência ----------
   Existia a intenção (o comentário acima está lá desde sempre) mas não existia o
   caminho: `desfazerConsumo` só era chamada pelo botão "chegou", que nunca
   aparece para um pedido já conferido. Sem isto, todo erro de conferência era
   permanente no estoque de insumo — o material saía e não voltava nunca. */
async function reabrirConferencia(r, destino = "chegou") {
  if (!r) return false;
  const comp = competenciaDe(r);
  if (r.status === "retornada" && mesFechado(comp)) {
    toast(`Pedido ${r.numero} está no fechamento de ${comp}, que já foi fechado. Reabra o mês em Prestadoras primeiro.`, "erro");
    return false;
  }
  const desfeitos = desfazerConsumo(r);
  possesDoPedido(r.id).forEach((p) => reabrirPosse(p.id));
  r.status = destino;
  if (destino === "chegou") { r.chegouEm = r.chegouEm || iso(hoje()); if (padraoResp("conferir")) r.responsavel = padraoResp("conferir"); }
  /* o mês de pagamento carimbado automaticamente volta a ser automático */
  if (r.mesPagamentoAuto) { delete r.mesPagamento; delete r.mesPagamentoAuto; }
  r.atualizadoEm = new Date().toISOString();
  registrar(r.opId, `conferência do pedido ${r.numero} reaberta`, { status: "retornada" }, { status: destino });
  const o = opPorId(r.opId);
  if (o) recalcularOP(o);
  /* insumo e pedido são o MESMO fato: o material voltou porque a conferência
     foi reaberta. Gravar em duas chamadas, a primeira dentro de um `catch {}`,
     permitia o pedido gravar e a devolução do insumo não — e ninguém ficava
     sabendo. Numa chamada só, ou as duas seções entram na fila de gravação, ou
     as duas ficam pendentes e o indicador de "falta gravar" acende. */
  render();
  await salvarTudo(...(desfeitos ? ["nucleo", "insumos"] : ["nucleo"]));
  toast(desfeitos
    ? `Conferência de ${r.numero} reaberta · ${desfeitos} ${desfeitos === 1 ? "baixa de insumo desfeita" : "baixas de insumo desfeitas"} — o material voltou ao estoque.`
    : `Conferência de ${r.numero} reaberta — lance de novo e registre o retorno.`);
  return true;
}

