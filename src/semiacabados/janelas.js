
/* ---------- semiacabados: as janelas ----------
   A remessa NÃO tem campo de quantidade de peças. Não é opcional: não existe.
   Quem digitasse um número aqui estaria inventando, e o app inteiro passaria a
   acreditar nele. O que se conta na saída é volume; peça só na volta. */
function modaisSemi(m) {
  if (m.tipo === "remessa") {
    const r = m.r || {};
    const nova = !r.id;
    const ativas = (S.cad.prestadoras || []).filter((p) => p.ativo !== false)
      .slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
    const tipos = semiAtivos();
    const marcados = new Set(r.itens || []);
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(640px, 96vw)" role="dialog" aria-label="Remessa">
      <div class="modal-h"><h2>${nova ? `Nova remessa · pedido ${esc(proximoNumeroRemessa())}` : `Pedido ${esc(r.numero)} · remessa`}</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label class="fld"><span>Prestadora</span>
            <select class="inp" id="rm-prest">
              <option value="">escolha…</option>
              ${ativas.map((p) => `<option value="${esc(p.nome)}"${r.prestadora === p.nome ? " selected" : ""}>${esc(p.nome)}</option>`).join("")}
            </select></label>
          <label class="fld"><span>Dia em que saiu</span>
            <input class="inp" type="date" id="rm-data" value="${esc(r.data || iso(hoje()))}"></label>
        </div>
        ${(() => { /* o processo é de onde sai o valor por peça no fechamento —
             sem ele a remessa controla material e não paga ninguém */
          const procs = [...new Set((S.cad.estruturas || []).map((x) => x.processo).filter(Boolean))].sort();
          const atual = r.processo || "";
          return `<label class="fld"><span>Processo (para o pagamento)</span>
            <select class="inp" id="rm-proc">
              <option value="">— não pagar por esta remessa —</option>
              ${procs.map((x) => `<option value="${esc(x)}"${atual === x ? " selected" : ""}>${esc(x)}</option>`).join("")}
            </select>
            <div class="hint" style="margin-top:4px">É daqui que saem as etapas e o valor por peça quando a remessa for conferida. Sem processo, ela continua controlando o material — só não entra no fechamento da prestadora.</div></label>`; })()}
        <div class="secao" style="margin-top:6px">Volume enviado</div>
        <div style="display:grid;grid-template-columns:120px 1fr;gap:12px">
          <label class="fld"><span>Quantos</span>
            <input class="inp num" type="number" min="0" step="1" id="rm-vol" value="${r.volumeQtd || ""}" placeholder="1"></label>
          <label class="fld"><span>De quê</span>
            <select class="inp" id="rm-volun">
              ${SEMI_UNS.map((u) => `<option value="${u}"${(r.volumeUn || "caixa") === u ? " selected" : ""}>${u}</option>`).join("")}
            </select></label>
        </div>
        <div class="aviso" style="margin:0 0 14px;border-color:var(--teal);background:var(--teal-soft)">
          <b>Aqui não se conta peça.</b> Uma caixa é uma caixa — o app nunca vai traduzir isso em bandanas.
          A quantidade só existe quando a prestadora devolver e contar.
          ${nova ? `<div style="margin-top:6px">O que <b>não</b> fica em aberto é a identificação: esta remessa nasce com o número
            <b>${esc(proximoNumeroRemessa())}</b>, da mesma sequência dos pedidos, e ele acompanha tudo até o encerramento.</div>` : ""}</div>
        <div class="secao">O que foi na remessa <span style="font-weight:500;color:var(--ink-3)">— opcional, e pode misturar tamanhos</span></div>
        ${tipos.length ? `<div style="display:flex;flex-wrap:wrap;gap:7px">
          ${tipos.map((tp) => `<button type="button" class="chip ${marcados.has(tp.id) ? "on" : ""}" data-rmitem="${esc(tp.id)}"
            title="${esc(semiRotulo(tp))}">${esc(tp.codigo)}</button>`).join("")}
        </div>
        <div class="hint" style="margin-top:6px">Marcar ajuda a saber o que esperar de volta. Se você não souber, deixe em branco — o retorno aceita qualquer código do mesmo jeito.</div>`
        : `<p class="hint" style="margin:0">Nenhum código interno cadastrado ainda. Dá para registrar a remessa assim mesmo e cadastrar depois, em <b>Códigos</b>.</p>`}
        <label class="fld" style="margin-top:14px"><span>Observação</span>
          <input class="inp" id="rm-obs" value="${esc(r.obs || "")}" placeholder="opcional — ex.: bandana cortada do lote de setembro"></label>
      </div>
      <div class="modal-f">
        ${nova ? "" : `<button class="btn danger sm" data-excluirrem="${esc(r.id)}">${svg(IC.lixeira)}Excluir</button>`}
        <div style="margin-left:auto;display:flex;gap:8px">
          <button class="btn" data-fechar="1">Cancelar</button>
          <button class="btn primary" data-act="salvar-remessa">${nova ? "Registrar remessa" : "Salvar"}</button></div>
      </div></div></div>`;
  }

  if (m.tipo === "retornoSemi") {
    const r = remessaPorId(m.remId);
    if (!r) return "";
    const vt = voltouNaRemessa(r);
    /* os códigos que a remessa declarou vêm primeiro, mas a lista é a inteira:
       o que voltou é o que voltou, e recusar um código porque ele não foi
       marcado na saída obrigaria a mentir na hora de anotar. */
    const decl = (r.itens || []).filter((id) => semiPorId(id));
    const resto = semiAtivos().filter((tp) => !decl.includes(tp.id)).map((tp) => tp.id);
    const linha = (id, destaque) => { const tp = semiPorId(id); if (!tp) return "";
      return `<div style="display:grid;grid-template-columns:1fr 120px;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line-2)">
        <div><span class="sku">${esc(tp.codigo)}</span> <span style="font-size:12.5px;color:var(--ink-2)">${esc(semiRotulo(tp))}</span>
          ${destaque && vt.porTipo.get(id) ? `<div class="hint" style="margin:0">já voltaram ${n0(vt.porTipo.get(id))}</div>` : ""}</div>
        <input class="inp num" type="number" min="0" step="1" data-retq="${esc(id)}" placeholder="—" style="width:110px">
      </div>`; };
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(600px, 96vw)" role="dialog" aria-label="Registrar retorno">
      <div class="modal-h"><h2>Retorno do pedido ${esc(r.numero)}</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p style="margin:0 0 14px;font-size:13.5px;line-height:1.6">
          Saiu para <b>${esc(r.prestadora)}</b> em ${fdate(r.data || r.em)}${r.volumeQtd ? ` · ${n0(r.volumeQtd)} ${esc(r.volumeUn)}${r.volumeQtd > 1 ? "s" : ""}` : ""}.
          ${vt.total ? `Já voltaram <b>${n0(vt.total)}</b> peças.` : "Ainda não voltou nada."}</p>
        <div class="secao">Quantas peças voltaram, por código</div>
        ${decl.map((id) => linha(id, true)).join("")}
        ${resto.length ? `<details class="pq" style="margin-top:10px"><summary>Voltou algo que não foi marcado na saída (${n0(resto.length)} ${resto.length === 1 ? "código" : "códigos"})</summary>
          <div>${resto.map((id) => linha(id, false)).join("")}</div></details>` : ""}
        ${!decl.length && !resto.length ? `<p class="hint" style="margin:0">Nenhum código interno cadastrado. Cadastre em <b>Códigos</b> antes de registrar o retorno — é ele que diz de que tamanho é a peça.</p>` : ""}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
          <label class="fld"><span>Dia em que voltou</span>
            <input class="inp" type="date" id="rt-data" value="${esc(iso(hoje()))}"></label>
          <label class="fld"><span>Observação</span>
            <input class="inp" id="rt-obs" placeholder="opcional"></label>
        </div>
        <div class="aviso" style="margin:0">
          <b>Registrar o retorno não encerra a remessa.</b> Ela fica em <i>Retorno parcial</i> e continua aceitando o que vier depois.
          Encerrar é decisão sua, no botão da remessa.</div>
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="salvar-retorno">Registrar retorno</button></div></div></div>`;
  }

  if (m.tipo === "encerrarRem") {
    const r = remessaPorId(m.remId);
    if (!r) return "";
    const vt = voltouNaRemessa(r);
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:480px" role="dialog" aria-label="Encerrar remessa">
      <div class="modal-h"><h2>Encerrar o pedido ${esc(r.numero)}</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p style="margin:0 0 14px;font-size:13.5px;line-height:1.6">
          Voltaram <b>${n0(vt.total)}</b> ${vt.total === 1 ? "peça" : "peças"} de ${esc(primeiroNome(r.prestadora))}.
          Encerrar quer dizer: <b>não vem mais nada desta remessa</b>. Ela sai da lista de abertas e para de cobrar retorno.</p>
        ${vt.total ? "" : `<div class="aviso" style="margin:0 0 14px;border-color:var(--amber);background:var(--amber-soft)">
          <b>Nada voltou desta remessa.</b> Se ela está sendo encerrada assim, vale escrever o motivo — daqui a três meses ninguém lembra.</div>`}
        <label class="fld"><span>Motivo${vt.total ? " (opcional)" : ""}</span>
          <input class="inp" id="er-motivo" placeholder="ex.: o resto foi perdido no corte / conferido com a Cida"></label>
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="confirmar-encerrar-remessa">Encerrar remessa</button></div></div></div>`;
  }

  if (m.tipo === "semiTipo") {
    const tp = m.t || {};
    const novo = !tp.id;
    const fest = (m.cat || tp.categoria) === "festiva";
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(560px, 96vw)" role="dialog" aria-label="Código interno">
      <div class="modal-h"><h2>${novo ? "Novo código interno" : "Editar " + esc(tp.codigo)}</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <div class="aviso" style="margin:0 0 14px;border-color:var(--amber);background:var(--amber-soft)">
          <b>Isto não é um SKU.</b> É o nome que a fábrica dá à bandana pronta antes de ela virar produto acabado.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label class="fld"><span>Tipo</span>
            <input class="inp" id="st-tipo" value="${esc(tp.tipo || "Bandana")}"></label>
          <label class="fld"><span>Tamanho</span>
            <select class="inp" id="st-tam">
              <option value="">—</option>
              ${SEMI_TAMS.map((x) => `<option value="${x}"${tp.tamanho === x ? " selected" : ""}>${x}</option>`).join("")}
            </select></label>
        </div>
        <label class="fld"><span>Grupo</span>
          <div style="display:flex;gap:7px">
            ${SEMI_CATS.map(([id, nome]) => `<button type="button" class="chip ${fest === (id === "festiva") ? "on" : ""}" data-stcat="${id}">${nome}</button>`).join("")}
          </div></label>
        ${fest
          ? `<label class="fld"><span>Campanha</span><input class="inp" id="st-camp" value="${esc(tp.campanha || "")}" placeholder="Halloween, Natal…"></label>`
          : `<label class="fld"><span>Variante</span>
              <select class="inp" id="st-var">
                ${SEMI_VARS.map(([id, nome]) => `<option value="${id}"${(tp.variante || "digital") === id ? " selected" : ""}>${nome}</option>`).join("")}
              </select></label>`}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label class="fld"><span>Código interno</span>
            <input class="inp" id="st-cod" value="${esc(tp.codigo || "")}" placeholder="${esc(semiCodigoSugerido({ tipo: tp.tipo, tamanho: tp.tamanho, categoria: fest ? "festiva" : "dia", variante: tp.variante, campanha: tp.campanha }))}" style="font-family:var(--mono)">
            <div class="hint" style="margin-top:4px">Deixe em branco e o app sugere um a partir do que está acima.</div></label>
          <label class="fld"><span>Mínimo desejado</span>
            <input class="inp num" type="number" min="0" step="1" id="st-min" value="${Number(tp.minimo) > 0 ? n0(tp.minimo) : ""}" placeholder="—">
            <div class="hint" style="margin-top:4px">Abaixo disso ele aparece marcado no estoque.</div></label>
        </div>
        ${novo ? "" : `<label class="fld"><span>Situação</span>
          <div style="display:flex;gap:7px">
            <button type="button" class="chip ${tp.ativo !== false ? "on" : ""}" data-stativo="1">Em uso</button>
            <button type="button" class="chip ${tp.ativo === false ? "on" : ""}" data-stativo="0">Inativo</button>
          </div></label>`}
      </div>
      <div class="modal-f">
        ${novo || saldoSemi(tp.id) || entradasSemi(tp.id) ? "" : `<button class="btn danger sm" data-excluirsemi="${esc(tp.id)}">${svg(IC.lixeira)}Excluir</button>`}
        <div style="margin-left:auto;display:flex;gap:8px">
          <button class="btn" data-fechar="1">Cancelar</button>
          <button class="btn primary" data-act="salvar-semi">Salvar</button></div>
      </div></div></div>`;
  }

  if (m.tipo === "ajusteSemi") {
    const tipos = semiAtivos();
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:480px" role="dialog" aria-label="Ajustar saldo">
      <div class="modal-h"><h2>Ajustar saldo à mão</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        ${tipos.length ? `<label class="fld"><span>Semiacabado</span>
          <select class="inp" id="aj-semi">
            ${tipos.map((tp) => `<option value="${esc(tp.id)}"${m.semiId === tp.id ? " selected" : ""}>${esc(tp.codigo)} · ${esc(semiRotulo(tp))} (${n0(saldoSemi(tp.id))} em estoque)</option>`).join("")}
          </select></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label class="fld"><span>Quantidade</span>
            <input class="inp num" type="number" step="1" id="aj-qtd" placeholder="ex.: -12">
            <div class="hint" style="margin-top:4px">Negativo tira, positivo põe.</div></label>
          <label class="fld"><span>Dia</span><input class="inp" type="date" id="aj-data" value="${esc(iso(hoje()))}"></label>
        </div>
        <label class="fld"><span>Motivo</span>
          <input class="inp" id="aj-motivo" placeholder="ex.: contagem de prateleira / 12 peças com defeito"></label>
        <div class="hint" style="line-height:1.6">O ajuste não some: ele vira uma linha no extrato, com seu nome e o motivo. É assim que daqui a um mês dá para entender por que o número mudou.</div>`
        : `<p class="hint" style="margin:0">Nenhum código interno cadastrado ainda.</p>`}
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        ${tipos.length ? `<button class="btn primary" data-act="salvar-ajuste-semi">Lançar ajuste</button>` : ""}</div></div></div>`;
  }

  if (m.tipo === "extratoSemi") {
    const tp = semiPorId(m.semiId);
    if (!tp) return "";
    const lin = movimentosSemi(tp.id, 300);
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(620px, 96vw)" role="dialog" aria-label="Extrato do semiacabado">
      <div class="modal-h"><h2><span class="sku">${esc(tp.codigo)}</span> · ${esc(semiRotulo(tp))}</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <dl class="kv" style="border:0;padding-top:0">
          <dt>Voltou das remessas</dt><dd>+${n0(entradasSemi(tp.id))}</dd>
          <dt>Ajustes à mão</dt><dd>${ajustesSemi(tp.id) >= 0 ? "+" : ""}${n0(ajustesSemi(tp.id))}</dd>
          <dt>Virou produto acabado</dt><dd>−${n0(consumoSemi(tp.id))}</dd>
          <dt><b>Em estoque agora</b></dt><dd><b>${n0(saldoSemi(tp.id))}</b></dd>
        </dl>
        ${lin.length ? `<div class="tl">${lin.map((x) => `<div class="tl-i ${x.qtd < 0 ? "saida" : "ok"}">
          <div class="tl-d">${fdate(x.quando)}</div>
          <div class="tl-c"><b>${x.qtd >= 0 ? "+" : ""}${n0(x.qtd)}</b> ${x.remessaId
            ? `<button class="btn sm ghost" data-abrirrem="${esc(x.remessaId)}" title="Abrir o pedido que originou esta entrada">${esc(x.texto)}</button>`
            : esc(x.texto)}
            ${x.obs ? `<div style="color:var(--ink-3)">${esc(x.obs)}</div>` : ""}
            <i>${x.por ? esc(x.por) : "—"} · ${fdataHora(x.em)}</i></div>
        </div>`).join("")}</div>`
        : `<p class="hint" style="margin:0">Nenhum movimento ainda. A primeira linha aparece quando uma remessa voltar com este código.</p>`}
      </div>
      <div class="modal-f"><button class="btn sm" data-ajustesemi="${esc(tp.id)}">Ajustar saldo</button>
        <button class="btn" style="margin-left:auto" data-fechar="1">Fechar</button></div></div></div>`;
  }

  if (m.tipo === "campanha") {
    const c = m.campanha || {};
    const nova = !c.id;
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(680px, 96vw)" role="dialog" aria-label="Campanha">
      <div class="modal-h"><h2>${nova ? "Nova campanha" : "Editar campanha"}</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <label class="fld"><span>Nome</span>
          <input class="inp" id="c-nome" value="${esc(c.nome || "")}" placeholder="Halloween, Natal, Outubro Rosa…"></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label class="fld"><span>Ano</span>
            <input class="inp" id="c-ano" type="number" inputmode="numeric" value="${esc(String(c.ano || new Date().getFullYear()))}"></label>
          <label class="fld"><span>Crescimento projetado (%)</span>
            <input class="inp" id="c-cres" type="number" inputmode="decimal" step="1" value="${c.crescimento == null ? "" : esc(String(c.crescimento))}" placeholder="20">
            <div class="hint" style="margin-top:4px">Cada campanha tem o seu. Dá para mudar quando quiser.</div></label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label class="fld"><span>Campanha começa</span><input class="inp" id="c-ini" type="date" value="${esc(c.ini || "")}"></label>
          <label class="fld"><span>Campanha termina</span><input class="inp" id="c-fim" type="date" value="${esc(c.fim || "")}"></label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label class="fld"><span>Preparação começa</span><input class="inp" id="c-pini" type="date" value="${esc(c.prepIni || "")}">
            <div class="hint" style="margin-top:4px">É a partir daqui que a campanha entra no planejamento do dia a dia.</div></label>
          <label class="fld"><span>Preparação termina</span><input class="inp" id="c-pfim" type="date" value="${esc(c.prepFim || "")}"></label>
        </div>
        <label class="fld"><span>Observação</span><input class="inp" id="c-obs" value="${esc(c.obs || "")}" placeholder="opcional"></label>
      </div>
      <div class="modal-f">
        ${nova ? "" : `<button class="btn danger sm" data-excluircamp="${esc(c.id)}">${svg(IC.lixeira)}Excluir</button>`}
        <div style="margin-left:auto;display:flex;gap:8px">
          <button class="btn" data-fechar="1">Cancelar</button>
          <button class="btn primary" data-act="salvar-campanha">Salvar</button></div>
      </div></div></div>`;
  }
  return null;
}

