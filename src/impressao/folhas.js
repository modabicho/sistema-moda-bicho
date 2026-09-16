/* ---------- folhas de impressão ---------- */
function cabFolha(titulo, sub) {
  return `<div class="cab-f"><div class="lg"></div>
    <div><h1>${titulo}</h1><div class="sub-f">Moda Bicho Acessórios · ${sub}</div></div>
    <div class="dt">Emitido em ${fdataHora(new Date().toISOString())}<br>PCP v${VERSAO}</div></div>`;
}
function imprimir(html, modo) {
  const alvo = document.getElementById("folha");
  if (alvo) alvo.innerHTML = html;
  try {
    document.body.classList.add("imprimindo");
    document.body.classList.toggle("cupom", modo === "cupom");
    /* @page não aceita classe, então a folha térmica entra como estilo temporário */
    document.getElementById("page-cupom")?.remove();
    document.body.classList.remove("corta", "marca");
    if (modo === "cupom") {
      const L = Math.max(40, Math.min(78, Number(S.cfg.larguraCupom) || 68));
      const A = Math.max(100, Math.min(400, Number(S.cfg.alturaCupom) || 200));
      /* `corta` = cada canhoto vira uma página; `marca` = linha pontilhada.
         As duas convivem: driver que corta sozinho ignora a linha, e quem não
         corta ganha onde rasgar. */
      if (S.cfg.cortarPorPedido !== false) document.body.classList.add("corta");
      if (S.cfg.marcaCorte) document.body.classList.add("marca");
      const st = document.createElement("style");
      st.id = "page-cupom";
      st.textContent = `@page{size:80mm ${A}mm;margin:0;}
        body.imprimindo.cupom .folha{width:${L}mm !important;margin:0 auto !important;}
        body.imprimindo.cupom .slip{width:${L}mm !important;}`;
      document.head.appendChild(st);
    }
  } catch {}
  try {
    if (typeof window !== "undefined" && window.print) {
      window.onafterprint = () => { try { document.body.classList.remove("imprimindo", "cupom", "corta", "marca"); document.getElementById("page-cupom")?.remove(); } catch {} };
      window.print();
    }
  } catch {}
}
function folhaOrdemCorte() {
  const fila = S.calc.fila;
  return `${cabFolha("ORDEM DE CORTE", "fila oficial de produção")}
    <div class="obs-f">Ordem de execução: Crítico → Urgente → P1 → P2 → P3 · dentro da prioridade, curva A antes de B e C · depois o mais antigo. É só seguir de cima para baixo.</div>
    <table><thead><tr><th style="width:26px">#</th><th>Prioridade</th><th>SKU</th><th>Produto</th><th style="width:64px">Qtd</th><th>Curva</th><th>Processo</th><th>Responsável</th><th style="width:34px">Feito</th></tr></thead>
    <tbody>${fila.map((x, i) => `<tr>
      <td>${i + 1}</td>
      <td><span class="pill ${x.prioridade === 0 ? "critico" : ""}">${CORTE_CURTO[x.prioridade] || ""}</span></td>
      <td class="sku-f">${esc(x.sku || "")}</td>
      <td style="font-size:10.5px">${esc((x.linha?.descricao || "").slice(0, 46))}</td>
      <td class="qtd-g">${n0(x.qtd)}</td>
      <td>${x.abc || ""}</td>
      <td style="font-size:10px">${esc(x.linha?.processo || "")}</td>
      <td style="font-size:10px">${esc(x.responsavel || "")}</td>
      <td><span class="cx"></span></td></tr>`).join("")}</tbody></table>
    <div class="tot-f"><span>${n0(fila.length)} pedidos</span><span><b>${n0(fila.reduce((a, x) => a + (Number(x.qtd) || 0), 0))}</b> peças</span></div>`;
}
function folhaRomaneio() {
  const prontos = S.pedidos.filter((r) => r.status === "separando" && r.prestadora)
    .map((r) => ({ ...r, sku: opPorId(r.opId)?.sku || r.sku }));
  const semDestino = S.pedidos.filter((r) => r.status === "separando" && !r.prestadora).length;
  const porPrest = new Map();
  prontos.forEach((r) => { (porPrest.get(r.prestadora) || porPrest.set(r.prestadora, []).get(r.prestadora)).push(r); });
  const grupos = [...porPrest.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (!grupos.length) return null;
  return grupos.map(([nome, rs], gi) => `
    ${cabFolha("ROMANEIO DE ENVIO", `prestadora: ${esc(nome)}`)}
    <table><thead><tr><th>Pedido</th><th>SKU</th><th>Produto</th><th style="width:70px">Qtd</th><th>Processo</th><th style="width:34px">Conf.</th></tr></thead>
    <tbody>${rs.map((r) => `<tr>
      <td class="sku-f">${esc(r.numero)}</td>
      <td class="sku-f">${esc(r.sku || "")}</td>
      <td style="font-size:10.5px">${esc((produtoDe(r.sku)?.descricao || "").slice(0, 44))}</td>
      <td class="qtd-g">${n0(r.qtd)}</td>
      <td style="font-size:10px">${esc(r.processo || "")}</td>
      <td><span class="cx"></span></td></tr>`).join("")}</tbody></table>
    <div class="tot-f"><span>${n0(rs.length)} pedidos</span><span><b>${n0(rs.reduce((a, r) => a + (Number(r.qtd) || 0), 0))}</b> peças</span></div>
    <div class="ass"><div>Enviado por · data</div><div>Recebido por (${esc(nome)}) · data</div></div>
    ${gi < grupos.length - 1 ? '<div class="quebra"></div>' : ""}`).join("") +
    (semDestino ? `<div class="obs-f" style="margin-top:14px">Atenção: ${semDestino} ${semDestino === 1 ? "pedido cortado ainda está" : "pedidos cortados ainda estão"} sem prestadora definida e ${semDestino === 1 ? "ficou" : "ficaram"} fora deste romaneio.</div>` : "");
}
/* folha de conferência: as etapas de cada pedido, para bater contra o papel da ordem */
function folhaConferencia(mesSel, soPrest) {
  let confs = S.pedidos.filter((r) => r.status === "retornada").map(conferenciaDe)
    .filter((x) => x.competencia === mesSel);
  if (soPrest && soPrest !== "todas") confs = confs.filter((x) => x.pedido.prestadora === soPrest);
  if (!confs.length) return null;
  const porPrest = new Map();
  confs.forEach((x) => { const k = x.pedido.prestadora || "Sem prestadora";
    (porPrest.get(k) || porPrest.set(k, []).get(k)).push(x); });
  const grupos = [...porPrest.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return grupos.map(([nome, lista], gi) => {
    lista.sort((a, b) => String(a.pedido.numero).localeCompare(String(b.pedido.numero), undefined, { numeric: true }));
    const somaPecas = lista.reduce((s, x) => s + (x.produzido || 0), 0);
    const somaValor = lista.reduce((s, x) => s + (x.total || 0), 0);
    const somaDefeito = lista.reduce((s, x) => s + (x.defeito || 0), 0);
    const somaTrab = lista.reduce((s, x) => s + (x.trabalhadas || 0), 0);
    const somaSobra = lista.reduce((s, x) => s + (x.naoTerminadas || 0), 0);
    const problemas = lista.filter((x) => x.erro || x.aviso);
    /* ---------- uma tabela por processo ----------
       O cabeçalho dizia "P1 P2 P3" e os nomes das etapas saíam numa observação
       embaixo, como a união de TODOS os processos do grupo. Se a prestadora fez
       dois processos no mesmo mês, "P1" queria dizer coisas diferentes em linhas
       diferentes — na folha que ela assina. Separando por processo, a coluna
       ganha o nome da etapa de verdade. */
    const porProc = new Map();
    lista.forEach((x) => { const k = x.pedido.processo || "sem processo";
      (porProc.get(k) || porProc.set(k, []).get(k)).push(x); });
    const tabelas = [...porProc.entries()].sort((x, y) => String(x[0]).localeCompare(String(y[0])))
      .map(([proc, itens]) => {
        /* os nomes das etapas na ordem da estrutura daquele processo */
        const nomes = [];
        itens.forEach((x) => x.etapas.forEach((e) => { if (!nomes.includes(e.nome)) nomes.push(e.nome); }));
        const cols = nomes.length ? nomes : ["ETAPA"];
        /* as larguras somam 100 de verdade: com seis etapas a folha estourava o A4
           e a coluna "OK" — a que ela marca — saía cortada na direita */
        const wSku = cols.length >= 5 ? 15 : 20;
        const wEt = Math.max(4, Math.floor((100 - 51 - wSku) / cols.length));
        return `<table class="f-larga">
          <colgroup><col style="width:11%"><col style="width:${wSku}%"><col style="width:8%">
            ${cols.map(() => `<col style="width:${wEt}%">`).join("")}
            <col style="width:9%"><col style="width:7%"><col style="width:11%"><col style="width:5%"></colgroup>
          <thead>
          <tr class="cab-rep"><th colspan="${cols.length + 7}">${esc(nome)} · ${esc(mesSel)} · processo ${esc(proc)}</th></tr>
          <tr><th>Pedido</th><th>SKU</th><th>Enviada</th>
          ${cols.map((c2) => `<th>${esc(c2)}</th>`).join("")}
          <th>Produzido</th><th>Defeito</th><th>Valor</th><th>OK</th></tr></thead>
        <tbody>${itens.map((x) => `<tr>
          <td class="sku-f">${esc(x.pedido.numero)}</td>
          <td class="sku-f">${esc(x.sku || "")}</td>
          <td class="qtd-g">${n0(x.enviada)}</td>
          ${cols.map((c2) => { const e = x.etapas.find((y) => y.nome === c2);
            if (!e) return "<td></td>";
            const marca = e.zeroAMais || e.zeroAMenos ? "font-weight:800;text-decoration:underline" : "";
            return `<td class="qtd-g" style="${marca}">${e.qtd != null ? n0(e.qtd) : (e.usa ? "—" : "")}</td>`; }).join("")}
          <td class="qtd-g">${x.produzido != null ? n0(x.produzido) : "—"}${x.naoTerminadas ? `<div style="font-size:7.5px;color:#5B6583">de ${n0(x.trabalhadas)}</div>` : ""}</td>
          <td class="qtd-g">${x.defeito ? n0(x.defeito) : ""}</td>
          <td style="text-align:right;font-family:var(--mono)">${x.total != null ? freal(x.total) : "—"}</td>
          <td><span class="cx"></span></td></tr>`).join("")}</tbody></table>`; }).join("");
    return `
    ${cabFolha("CONFERÊNCIA DE PROCESSOS", `${esc(mesSel)} · prestadora: ${esc(nome)}`)}
    ${tabelas}
    <div class="tot-f"><span>${n0(lista.length)} pedidos</span><span>Prontas: <b>${n0(somaPecas)}</b></span>
      ${somaSobra ? `<span>Trabalhadas: <b>${n0(somaTrab)}</b> <span style="color:#5B6583">(${n0(somaSobra)} sem terminar)</span></span>` : ""}
      ${somaDefeito ? `<span>Com defeito: <b>${n0(somaDefeito)}</b></span>` : ""}
      <span class="apagar-f">Valor: <b>${freal(somaValor)}</b></span></div>
    ${somaDefeito ? `<div class="obs-f">Peça com defeito não conta como produzida e não é paga — o valor acima já está sem elas.</div>` : ""}
    ${problemas.length ? `<div class="obs-f"><b>Conferir antes de pagar:</b><br>${problemas.map((x) =>
      `${esc(x.pedido.numero)} — ${x.alertas.map((a) => esc(a.txt)).join("; ")}`).join("<br>")}</div>` : `<div class="obs-f">Nenhuma divergência entre o lançado e o enviado.</div>`}
    <div class="ass"><div>Conferido por · data</div><div>De acordo (${esc(nome)}) · data</div></div>
    ${gi < grupos.length - 1 ? '<div class="quebra"></div>' : ""}`; }).join("");
}

/* soPrest: o nome de uma prestadora, para sair UMA folha só.
   Sem isso, o PDF sai com o pagamento de todo mundo dentro — o que é útil para
   imprimir e recortar, e é um vazamento quando alguém manda o arquivo inteiro
   por WhatsApp. Quem envia por mensagem precisa poder gerar a folha de uma. */
/* ---------- valor por extenso ----------
   Um recibo sem o valor escrito não é um recibo: é onde se acrescenta um zero
   depois de assinado. */
function porExtenso(n) {
  const U = ["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove","dez","onze","doze",
    "treze","quatorze","quinze","dezesseis","dezessete","dezoito","dezenove"];
  const D = ["","","vinte","trinta","quarenta","cinquenta","sessenta","setenta","oitenta","noventa"];
  const C = ["","cento","duzentos","trezentos","quatrocentos","quinhentos","seiscentos","setecentos","oitocentos","novecentos"];
  const ate999 = (v) => {
    if (v === 0) return "";
    if (v === 100) return "cem";
    const c = Math.floor(v / 100), d = v % 100;
    const p1 = c ? C[c] : "";
    const p2 = d < 20 ? (d ? U[d] : "") : D[Math.floor(d / 10)] + (d % 10 ? " e " + U[d % 10] : "");
    return [p1, p2].filter(Boolean).join(" e ");
  };
  const inteiro = (v) => {
    if (v === 0) return "zero";
    const mi = Math.floor(v / 1e6), mil = Math.floor((v % 1e6) / 1000), res = v % 1000;
    const partes = [];
    if (mi) partes.push(ate999(mi) + (mi === 1 ? " milhão" : " milhões"));
    if (mil) partes.push(mil === 1 ? "mil" : ate999(mil) + " mil");
    if (res) partes.push(ate999(res));
    /* "e" antes da última parte quando ela é menor que cem ou redonda */
    if (partes.length > 1 && res && (res < 100 || res % 100 === 0)) {
      const ult = partes.pop(); return partes.join(", ") + " e " + ult;
    }
    return partes.join(", ");
  };
  const val = Math.round((Number(n) || 0) * 100) / 100;
  const reais = Math.floor(val), cent = Math.round((val - reais) * 100);
  const p1 = `${inteiro(reais)} ${reais === 1 ? "real" : "reais"}`;
  return cent ? `${p1} e ${inteiro(cent)} ${cent === 1 ? "centavo" : "centavos"}` : p1;
}

/* ---------- recibo de pagamento, em duas vias ----------
   A folha de fechamento é um demonstrativo: mostra a conta e pede "de acordo".
   Recibo é outra coisa — é o papel que prova que o dinheiro foi entregue, com
   valor por extenso, data e a assinatura de QUEM RECEBEU. Duas vias na mesma
   folha, uma para ela e o canhoto para a Moda Bicho. */
function folhaRecibo(mesSel, soPrest) {
  const prests = (S.calc?.prestadoras || []).map((pp) => ({ p: pp, f: fechamentoDe(pp, mesSel, pp.porMes?.[mesSel]) }))
    .filter((x) => x.f.total > 0)
    .filter((x) => !soPrest || soPrest === "todas" || x.p.nome === soPrest);
  if (!prests.length) return null;
  /* número do recibo: ano-mês e as iniciais da prestadora — dá para achar o
     papel depois sem depender de mais nada */
  const num = (nome) => {
    const ano = (String(mesSel).match(/\d{4}/) || ["0000"])[0];
    const mi = MESES.findIndex((m2) => String(mesSel).toUpperCase().includes(m2));
    const mm = mi >= 0 ? String(mi + 1).padStart(2, "0") : "00";
    const ini = String(nome).trim().split(/\s+/).map((w) => w[0] || "").join("").slice(0, 3).toUpperCase();
    return `${ano}${mm}-${ini || "XX"}`;
  };
  const via = (pp, f, qual) => `
    <div class="recibo">
      <div class="rec-cab">
        <div class="lg"></div>
        <div><h1>RECIBO DE PAGAMENTO</h1>
          <div class="rec-sub">Moda Bicho Acessórios · serviço de produção · competência ${esc(mesSel)}</div></div>
        <div class="rec-n">Nº ${esc(num(pp.nome))}<br><span>${qual}</span></div>
      </div>
      <p class="rec-txt">Recebi de <b>Moda Bicho Acessórios</b> a importância de
        <b class="rec-val">${freal(f.total)}</b> (${esc(porExtenso(f.total))}),
        referente ao serviço de produção prestado na competência <b>${esc(mesSel)}</b>,
        conforme os pedidos abaixo, dando plena quitação pelo período.</p>
      <table class="rec-t"><thead><tr><th style="width:16%">Pedido</th><th>SKU</th><th style="width:20%">Processo</th>
        <th style="width:13%">Peças</th><th style="width:16%">Valor</th></tr></thead>
      <tbody>${f.pedidosMes.map((r2) => { const v2 = valorDoPedido(r2);
        return `<tr><td class="sku-f">${esc(r2.numero)}</td>
        <td class="sku-f">${esc(opPorId(r2.opId)?.sku || r2.sku || "")}</td>
        <td style="font-size:9.5px">${esc(r2.processo || "")}</td>
        <td class="qtd-g">${n0(pecasDoPedido(r2))}</td>
        <td style="text-align:right;font-family:var(--mono)">${v2.fonte ? freal(v2.valor) : "—"}</td></tr>`; }).join("")}</tbody></table>
      <div class="rec-tot">
        <span>Peças no mês: <b>${n0(f.pecas)}</b></span>
        <span>Serviço: <b>${freal(f.valor)}</b></span>
        ${f.pct ? `<span>Bônus (+${Math.round(f.pct * 100)}%): <b>${freal(f.bonus)}</b></span>` : ""}
        <span class="rec-apagar">TOTAL RECEBIDO: <b>${freal(f.total)}</b></span>
      </div>
      <div class="rec-ass">
        <div><span class="rec-linha"></span>${esc(pp.nome)}${pp.telefone ? ` · ${esc(pp.telefone)}` : ""}<br><i>assinatura de quem recebeu</i></div>
        <div><span class="rec-linha"></span>Data<br><i>dia / mês / ano</i></div>
      </div>
    </div>`;
  return prests.map(({ p: pp, f }, gi) => `
    ${via(pp, f, "1ª via · prestadora")}
    <div class="rec-corte"><span>recorte aqui</span></div>
    ${via(pp, f, "2ª via · Moda Bicho")}
    ${gi < prests.length - 1 ? '<div class="quebra"></div>' : ""}`).join("");
}

/* ---------- o fechamento por processo, com o valor de cada etapa ----------
   A planilha antiga mostrava, em cada linha, as etapas executadas e o preço de
   cada uma — "TRAVA/AGULHA R$ 0,08 · COLA/LIXA R$ 0,05 · EMBALAGEM R$ 0,02" —
   repetido pedido a pedido, em colunas genéricas P1..P5. A informação estava
   certa e a organização não: o preço é do PROCESSO, não do pedido, e repeti-lo
   em cada linha só empurra o que interessa para fora da folha.
   Aqui ele sobe uma vez para o cabeçalho da coluna, e cada processo ganha o seu
   bloco com subtotal. A prestadora consegue refazer a conta no papel: quantidade
   × preço da coluna, somado na linha. */
function blocosPorProcesso(pedidos) {
  const porProc = new Map();
  const semDetalhe = [];
  pedidos.forEach((r) => {
    const x = conferenciaDe(r);
    if (!x.etapas.some((e) => e.qtd != null)) { semDetalhe.push({ r, x }); return; }
    const k = r.processo || "sem processo";
    (porProc.get(k) || porProc.set(k, []).get(k)).push({ r, x });
  });
  const blocos = [...porProc.entries()].sort((u, w) => String(u[0]).localeCompare(String(w[0])))
    .map(([proc, itens]) => {
      /* as etapas que ESTE grupo lançou, na ordem da estrutura, cada uma com o
         preço por peça que valeu no mês */
      const cols = [];
      itens.forEach(({ x }) => x.etapas.forEach((e) => {
        if (e.qtd == null) return;
        const achou = cols.find((c) => c.nome === e.nome);
        if (achou) { if (achou.vu == null && e.vu) achou.vu = e.vu; }
        else cols.push({ nome: e.nome, vu: e.vu || null });
      }));
      const pecas = itens.reduce((sm, { x }) => sm + (x.produzido || 0), 0);
      const valor = itens.reduce((sm, { r }) => sm + valorDoPedido(r).valor, 0);
      const defeito = itens.reduce((sm, { x }) => sm + (x.defeito || 0), 0);
      /* trabalhadas = o volume de trabalho dela; prontas = o que chegou ao fim.
         A diferença é o controle interno, e é o que ninguém enxergava. */
      const trabalhadas = itens.reduce((sm, { x }) => sm + (x.trabalhadas || 0), 0);
      const sobra = itens.reduce((sm, { x }) => sm + (x.naoTerminadas || 0), 0);
      return { proc, itens, cols, pecas, valor, defeito, trabalhadas, sobra };
    });
  return { blocos, semDetalhe };
}

function folhaFechamento(mesSel, soPrest) {
  const prests = (S.calc?.prestadoras || []).map((p) => ({ p, f: fechamentoDe(p, mesSel, p.porMes?.[mesSel]) }))
    .filter((x) => x.f.pecas > 0 || x.f.valor > 0)
    .filter((x) => !soPrest || soPrest === "todas" || x.p.nome === soPrest);
  if (!prests.length) return null;
  return prests.map(({ p, f }, gi) => {
    const { blocos, semDetalhe } = blocosPorProcesso(f.pedidosMes);
    const tabela = ({ proc, itens, cols, pecas, valor, defeito, trabalhadas, sobra }) => {
      const nc = cols.length;
      const wEt = Math.max(6, Math.floor((100 - 12 - 26 - 8 - 14 - (defeito ? 7 : 0)) / Math.max(1, nc)));
      return `<div class="bloco-proc">
      <table class="f-larga">
        <colgroup><col style="width:12%"><col style="width:26%"><col style="width:8%">
          ${cols.map(() => `<col style="width:${wEt}%">`).join("")}
          ${defeito ? '<col style="width:7%">' : ""}<col style="width:14%"></colgroup>
        <thead>
          <tr class="cab-rep"><th colspan="${nc + 4 + (defeito ? 1 : 0)}">${esc(p.nome)} · ${esc(mesSel)} · processo <b>${esc(proc)}</b></th></tr>
          <tr><th>Pedido</th><th>SKU</th><th>Enviada</th>
          ${cols.map((c2) => `<th>${esc(c2.nome)}<div class="th-vu">${c2.vu ? fmoeda(c2.vu) + "/peça" : "sem valor"}</div></th>`).join("")}
          ${defeito ? "<th>Defeito</th>" : ""}<th>Valor</th></tr></thead>
        <tbody>${itens.map(({ r, x }) => { const v = valorDoPedido(r);
          return `<tr>
          <td class="sku-f">${esc(r.numero)}</td>
          <td class="sku-f">${esc(opPorId(r.opId)?.sku || r.sku || "")}</td>
          <td class="qtd-g">${n0(x.enviada)}</td>
          ${cols.map((c2) => { const e = x.etapas.find((y) => y.nome === c2.nome);
            return `<td class="qtd-g">${e && e.qtd != null ? n0(e.qtd) : ""}</td>`; }).join("")}
          ${defeito ? `<td class="qtd-g">${x.defeito ? n0(x.defeito) : ""}</td>` : ""}
          <td style="text-align:right;font-family:var(--mono)">${v.fonte ? freal(v.valor) : "—"}</td></tr>`; }).join("")}
        </tbody>
        <tfoot><tr class="sub-proc">
          <td colspan="${3 + nc + (defeito ? 1 : 0)}">Subtotal ${esc(proc)} · ${n0(itens.length)} ${itens.length === 1 ? "pedido" : "pedidos"} · <b>${n0(pecas)}</b> ${pecas === 1 ? "peça pronta" : "peças prontas"}${sobra ? ` · ${n0(trabalhadas)} trabalhadas (${n0(sobra)} não ${sobra === 1 ? "chegou" : "chegaram"} ao fim)` : ""}${defeito ? ` · ${n0(defeito)} com defeito` : ""}</td>
          <td style="text-align:right;font-family:var(--mono)"><b>${freal(valor)}</b></td>
        </tr></tfoot></table></div>`;
    };
    const legado = semDetalhe.length ? `<div class="bloco-proc">
      <table class="f-larga">
        <colgroup><col style="width:14%"><col style="width:40%"><col style="width:18%"><col style="width:12%"><col style="width:16%"></colgroup>
        <thead><tr class="cab-rep"><th colspan="5">${esc(p.nome)} · ${esc(mesSel)} · sem lançamento por etapa</th></tr>
        <tr><th>Pedido</th><th>SKU</th><th>Processo</th><th>Peças</th><th>Valor</th></tr></thead>
        <tbody>${semDetalhe.map(({ r }) => { const v = valorDoPedido(r);
          return `<tr><td class="sku-f">${esc(r.numero)}</td>
          <td class="sku-f">${esc(opPorId(r.opId)?.sku || r.sku || "")}</td>
          <td style="font-size:9px">${esc(r.processo || "")}</td>
          <td class="qtd-g">${n0(pecasDoPedido(r))}</td>
          <td style="text-align:right;font-family:var(--mono)">${v.fonte ? freal(v.valor) : "—"}</td></tr>`; }).join("")}</tbody></table>
      <div class="obs-f" style="margin-top:4px">Estes vieram do histórico da planilha, sem as quantidades por etapa — por isso não aparecem num bloco de processo.</div></div>` : "";
    return `
    ${cabFolha("FECHAMENTO DO MÊS", `${esc(mesSel)} · prestadora: ${esc(p.nome)}`)}
    ${blocos.length || semDetalhe.length ? blocos.map(tabela).join("") + legado
      : `<div class="obs-f">Nenhum pedido retornado registrado neste mês — o total abaixo é estimativa pelas estruturas.</div>`}
    ${blocos.length > 1 ? `<div class="obs-f">Resumo por processo: ${blocos.map((b2) => `<b>${esc(b2.proc)}</b> ${n0(b2.pecas)} pçs · ${freal(b2.valor)}`).join(" &nbsp;·&nbsp; ")}</div>` : ""}
    <div class="tot-f" style="align-items:center">
      <span>Peças no mês: <b>${n0(f.pecas)}</b></span>
      <span>Serviço: <b>${freal(f.valor)}</b></span>
      <span>Bônus${f.pct ? ` (+${Math.round(f.pct * 100)}%)` : ""}: <b>${f.pct ? freal(f.bonus) : "—"}</b></span>
      <span class="apagar-f">A PAGAR: <b>${freal(f.total)}</b></span></div>
    <div class="obs-f">${f.planilha
      ? `Valores das conferências registradas no app${f.doLegado ? ` · ${n0(f.doLegado)} ${f.doLegado === 1 ? "pedido antigo ainda sem lançamento por etapa, usando o total que veio da planilha" : "pedidos antigos ainda sem lançamento por etapa, usando o total que veio da planilha"}` : ""}.`
      : "Nenhuma conferência lançada neste mês — valores estimados pelas estruturas."}${f.pct ? ` Bônus de <b>${Math.round(f.pct * 100)}%</b> sobre ${freal(f.valor)} = <b>${freal(f.bonus)}</b>.` : ""}
      ${f.fechado ? `<b>Mês fechado em ${fdataHora(f.trava?.em)}${f.trava?.por ? ` por ${esc(f.trava.por)}` : ""} — valores travados.</b>` : "Mês ainda aberto: os números podem mudar até o fechamento."}</div>
    <div class="ass"><div>Conferido por · data</div><div>De acordo (${esc(p.nome)}) · data</div></div>
    ${gi < prests.length - 1 ? '<div class="quebra"></div>' : ""}`;
  }).join("");
}

