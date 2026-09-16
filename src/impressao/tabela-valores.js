/* ---------- tabela de valores para a prestadora ----------
   O papel que ela leva para casa e consulta quando tem dúvida: quanto vale cada
   etapa e quanto sai a peça pronta. Sai da MESMA estrutura que paga o
   fechamento, então não existe versão da tabela diferente da que paga.

   O que NÃO entra aqui, por regra: bônus, política interna e qualquer conta
   nossa. A prestadora vê o valor por etapa. O resto é assunto de dentro. */
function folhaValores(soPrest) {
  const prest = soPrest && soPrest !== "todas" ? soPrest : null;
  /* quando é para uma prestadora só, a tabela traz os processos que ELA faz —
     ninguém precisa procurar a própria linha numa lista de dezessete */
  let lista = (S.cad.estruturas || []).slice()
    .filter((e) => (e.etapas || []).length)
    .sort((a, b) => String(a.processo).localeCompare(String(b.processo)));
  if (prest) {
    const dela = new Set();
    (S.cad.prestadoras || []).filter((p) => p.nome === prest)
      .forEach((p) => (p.processos || []).forEach((x) => dela.add(normProc(x))));
    S.pedidos.forEach((r) => { if (r.prestadora === prest && r.processo) dela.add(normProc(r.processo)); });
    if (dela.size) lista = lista.filter((e) => dela.has(normProc(e.processo)));
  }
  const maxEt = Math.max(1, ...lista.map((e) => (e.etapas || []).length));
  return `${cabFolha("TABELA DE VALORES POR PROCESSO", prest ? `para ${prest}` : "todos os processos")}
    <div class="obs-f">O valor é <b>por peça</b> em cada etapa. O total é quanto vale a peça quando passa por todas as etapas do processo. Quando o pedido cobre só parte das etapas, vale a soma das etapas feitas.</div>
    <table><thead><tr><th style="width:22%">Processo</th>
      ${Array.from({ length: maxEt }, (_, i) => `<th>Etapa ${i + 1}</th>`).join("")}
      <th style="width:96px;white-space:nowrap">Peça pronta</th></tr></thead>
    <tbody>${lista.map((e) => {
      const et = e.etapas || [];
      const soma = et.reduce((t, x) => t + (Number(x.valor) || 0), 0);
      return `<tr>
        <td><b>${esc(e.processo)}</b>${e.obs ? `<div style="font-size:9.5px;color:#666">${esc(e.obs)}</div>` : ""}</td>
        ${Array.from({ length: maxEt }, (_, i) => { const x = et[i];
          return `<td style="font-size:10px">${x ? `${esc(x.nome)}<div style="font-weight:700">${fmoeda(x.valor)}</div>` : ""}</td>`; }).join("")}
        <td class="qtd-g" style="white-space:nowrap">${fmoeda(soma)}</td></tr>`; }).join("")
      || `<tr><td colspan="${maxEt + 2}" style="text-align:center;padding:14px">Nenhum processo com etapas cadastradas${prest ? ` para ${esc(prest)}` : ""}.</td></tr>`}
    </tbody></table>
    <div class="tot-f"><span>${n0(lista.length)} ${lista.length === 1 ? "processo" : "processos"}</span>
      <span>Valores vigentes em ${fdate(iso(hoje()))}</span></div>
    <div class="obs-f" style="margin-top:10px">Dúvida sobre algum valor, fale com a Moda Bicho antes de produzir.</div>`;
}

function folhaRelatorio() {
  const linhas = relEscolhidas().filter((x) => x.produzir > 0);
  const t = relTotais(linhas);
  const nome = (REL_BASES.find(([id]) => id === S.rel.base) || [, "mínimo em uso"])[1];
  return `${cabFolha("QUANTO PRODUZIR", `alvo: ${String(nome).toLowerCase()}`)}
    <div class="obs-f">Produzir = alvo − estoque disponível − o que já está em produção, arredondado para cima no pacote. Disponível = físico − reservado.</div>
    <table><thead><tr><th>SKU</th><th>Produto</th><th style="width:44px">Curva</th><th style="width:56px">Mín.</th><th style="width:56px">Sug.</th><th style="width:56px">Alvo</th><th style="width:56px">Físico</th><th style="width:62px">Dispon.</th><th style="width:62px">Em prod.</th><th style="width:66px">Produzir</th><th style="width:34px">Feito</th></tr></thead>
    <tbody>${linhas.map((x) => `<tr>
      <td class="sku-f">${esc(x.l.sku)}</td>
      <td style="font-size:10.5px">${esc((x.l.descricao || "").slice(0, 40))}</td>
      <td>${esc(x.l.abc || "")}</td>
      <td>${n0(x.l.estMin)}</td>
      <td>${x.l.semVenda ? "—" : n0(x.l.estMinCalc)}</td>
      <td><b>${n0(x.alvo)}</b></td>
      <td>${x.l.estFisico == null ? "—" : n0(x.l.estFisico)}</td>
      <td>${n0(x.l.estoqueReal)}</td>
      <td>${x.emProd ? n0(x.emProd) : "—"}</td>
      <td class="qtd-g">${n0(x.produzir)}</td>
      <td><span class="cx"></span></td></tr>`).join("")}</tbody></table>
    <div class="tot-f"><span>${n0(t.skus)} produtos</span><span><b>${n0(t.pecas)}</b> peças a produzir</span></div>`;
}

async function exportarRelatorio() {
  await precisaXlsx().catch(() => { toast("Não consegui carregar a biblioteca de planilha — verifique a internet.", "erro"); throw new Error("sem lib"); });
  const linhas = relEscolhidas().map((x) => ({
    "SKU": x.l.sku, "Produto": x.l.descricao, "Curva": x.l.abc, "Processo": x.l.processo || "",
    "Mínimo em uso": x.l.estMin, "Sugerido pelas vendas": x.l.semVenda ? "" : x.l.estMinCalc,
    "Alvo usado": x.alvo, "Régua": REL_BASE_CURTA[x.base],
    "Estoque físico": x.l.estFisico == null ? "" : x.l.estFisico,
    "Estoque disponível": x.l.estoqueReal, "Em produção": x.emProd,
    "Peças por pacote": x.pac, "Produzir": x.produzir,
    "Produzir pelo mínimo em uso": x.l.saldoSemPedido || 0,
  }));
  if (!linhas.length) return toast("Nada para exportar com os filtros de agora.", "erro");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "Produzir");
  XLSX.writeFile(wb, `INTERNO-quanto-produzir-${iso(hoje())}.xlsx`);
  toast(`${n0(linhas.length)} ${linhas.length === 1 ? "linha exportada" : "linhas exportadas"}.`);
}

/* ===========================================================================
   A PARTE COMUM DAS DUAS CRIAÇÕES (v8.77)
   ---------------------------------------------------------------------------
   Existem dois caminhos para nascer um pedido, e são diferentes de propósito:

     · pela DEMANDA  · `abrirCriarPedidos` → `confirmarPedidos`
       sabe de saldo, cascata de prioridade, campanha, divisão do saldo,
       recomendação de prestadora — nada disso muda aqui;
     · AVULSO        · "Criar pedido avulso" → `salvar-novo-pedido`
       sabe de produto provisório, número digitado à mão, SKU novo.

   O que NÃO devia ser diferente é a parte de baixo: quais campos o pedido tem,
   de onde sai o setor e o responsável, como a embalagem e as etapas viram
   cadastro do produto. Eram duas implementações, e elas divergiram. Medido,
   antes desta unificação:

     · a embalagem do avulso lia `[data-emb]` — vocabulário que a janela NÃO
       desenha mais (ela usa `data-pp` desde que `camposEmbalagem` foi unificada).
       Zero campos encontrados, `mudouEmb` sempre falso;
     · `prod.etapasUsadas` só era gravado pela Demanda: no avulso a escolha
       ficava no pedido e sumia como padrão do SKU;
     · `setor` nunca era preenchido no avulso;
     · `criadoNoApp` e `campanhaId` só existiam no pedido da Demanda;
     · o responsável do avulso saía do processo do CADASTRO, não do processo
       escolhido na janela;
     · a Demanda lia `setor.responsavel` (singular) e o avulso `respDoSetor()`
       (que também cobre `responsaveis`, no plural) — setor cadastrado com a
       lista nova deixava o pedido da Demanda sem responsável.

   Daqui para baixo, a montagem é UMA. Cada fluxo continua decidindo o QUE
   passar; quem aplica é a mesma função.
   =========================================================================== */

/* O esqueleto. Todo campo que um pedido novo tem nasce aqui, com o mesmo valor
   inicial nos dois caminhos — foi a ausência disto que fez um ter `setor` e
   `campanhaId` e o outro não. */
function pedEsqueleto({ numero, opId, sku, qtd, prioridade, criadoEm }) {
  const em = criadoEm || new Date().toISOString();
  return {
    id: uid(), criadoNoApp: true, numero, opId, sku, qtd: Number(qtd) || 0,
    prioridade: prioridade == null ? 4 : Number(prioridade), prioridadeTravada: false,
    status: "papel", criadoEm: em, atualizadoEm: em,
    prestadora: null, processo: null, setor: null, responsavel: null,
    qtdEmbalar: null, qtdMix: null,
    qtdConferida: null, qtdSegunda: 0,
    separadaEm: null, enviadaEm: null, retornadaEm: null,
    aguardandoMaterial: false, obs: null, obsInterna: null,
    etapasUsadas: null, campanhaId: null,
  };
}

/* Setor e responsável saem do PROCESSO DO PEDIDO — o que a pessoa escolheu na
   janela —, nunca do processo que está no cadastro do produto. Trocar o
   processo e receber o responsável do processo antigo era o defeito. */
function pedDestinoDoProcesso(processo) {
  let st = null;
  try { st = typeof setorDe === "function" ? setorDe(processo) : null; } catch (e) { st = null; }
  const resp = st
    ? ((typeof respDoSetor === "function" ? respDoSetor(st)[0] : null) || st.responsavel || null)
    : null;
  return { setor: st ? (st.nome || null) : null, responsavel: resp };
}

/* A EMBALAGEM, lida do formulário, seja qual for o vocabulário da janela.
   `escopo` é o índice do grupo na tela de criar pedidos (`data-ppg`); sem ele,
   é a janela de um pedido só. `data-emb` fica aceito porque ainda existe em
   janelas antigas — aceitar os dois é o que impede a próxima divergência. */
function pedLerEmbalagemDoForm(escopo) {
  const campos = escopo != null
    ? $$(`[data-pp][data-ppg="${escopo}"]`)
    : [...$$("[data-pp]:not([data-ppg])"), ...$$("[data-emb]")];
  if (!campos.length) return null;
  const emb = {};
  for (const el of campos) {
    const k = el.dataset.pp || el.dataset.emb;
    if (!k) continue;
    emb[k] = el.value === "" ? null : (k === "qtdPorEmbalagem" ? Number(el.value) : el.value);
  }
  return Object.keys(emb).length ? emb : null;
}

/* AS ETAPAS. `null` quer dizer "as do processo" — e é assim que o pedido
   acompanha a estrutura se ela mudar depois. Lista só quando é PARCIAL.
   Esta é a regra que a Demanda já usava; o avulso gravava a lista inteira. */
function pedLerEtapasDoForm(escopo) {
  const cx = escopo != null
    ? $$("[data-etuso]").filter((el) => String(el.dataset.etuso) === String(escopo))
    : $$("[data-m-et]");
  if (!cx.length) return { tem: false, etapas: null };
  const marcadas = cx.filter((el) => el.checked).map((el) => String(el.value).toUpperCase());
  /* -------------------------------------------------------------------------
     v8.87 · TODAS MARCADAS É UMA LISTA, NÃO A FALTA DE UMA
     -------------------------------------------------------------------------
     Era `marcadas.length < cx.length ? marcadas : null`: marcar tudo gravava
     `null`, e `null` já significava "as do processo". Os dois casos — "ela
     escolheu todas" e "ninguém disse nada" — viravam o mesmo valor, e o pedido
     perdia o registro de que a escolha foi feita.
     Agora a escolha vai por extenso. `null` fica reservado para o caso em que
     não há informação: nenhuma etapa marcada (ou janela sem os chips). A
     LEITURA não mudou — `etapasDoPedido` continua tratando `null` como "todas",
     que é o que os pedidos antigos querem dizer.
     ------------------------------------------------------------------------- */
  return { tem: true, etapas: marcadas.length ? marcadas : null };
}

/* A EMBALAGEM NO PRODUTO. Um lugar só, com a regra da filipeta junto — ela
   estava escrita duas vezes, e duas cópias de uma regra é uma divergência
   esperando acontecer. Devolve `true` se o produto mudou. */
function pedAplicarEmbalagemNoProduto(prod, emb) {
  if (!prod || !emb) return false;
  prod.producao = prod.producao || {};
  let mudou = false;
  for (const k of Object.keys(emb)) {
    const v = emb[k] === "" ? null : emb[k];
    if ((prod.producao[k] ?? null) !== (v ?? null)) { prod.producao[k] = v; mudou = true; }
  }
  if (prod.producao.embalagemTipo === "filipeta" && prod.producao.embalagemTamanho != null) {
    prod.producao.embalagemTamanho = null; mudou = true;
  }
  return mudou;
}

/* O PADRÃO DO SKU. Etapas e embalagem escolhidas na janela de criação são do
   PRODUTO — valem para todos os pedidos dele. Chamada UMA vez por SKU, pelos
   dois fluxos. Era só a Demanda que gravava o padrão de etapas; no avulso a
   escolha existia no pedido e sumia como padrão. */
function pedAplicarPadraoDoProduto(prod, d) {
  if (!prod || !d) return false;
  let mudou = false;
  /* -------------------------------------------------------------------------
     v8.87 · CRIAR PEDIDO NÃO MEXE MAIS NO PADRÃO DO SKU
     -------------------------------------------------------------------------
     Aqui havia `prod.etapasUsadas = d.etapas.etapas || null`. Quem é dona desse
     campo é a tela de Produtos — o rótulo diz "padrão dos pedidos novos", e o
     app tem uma permissão só para ele (`prodEtapas`, restrita). Esta linha
     rodava na criação de pedido, que exige apenas `pedEtapas` (que todo mundo
     tem), e SOBRESCREVIA a escolha existente: desmarcar uma etapa para UM
     pedido mudava o padrão do SKU inteiro, sem a pessoa ver.
     A escolha do dia agora fica onde é dela: no pedido (`pedAplicarComuns`).
     A embalagem continua subindo para o produto — ela é cadastro do SKU, vale
     para todos os pedidos dele, e isso a janela diz com todas as letras.
     ------------------------------------------------------------------------- */
  if (pedAplicarEmbalagemNoProduto(prod, d.embalagem)) mudou = true;
  return mudou;
}

/* O APLICADOR DO PEDIDO. Recebe a intenção já normalizada — cada fluxo monta a
   sua a partir do próprio formulário — e escreve no pedido.
   Só mexe no que veio: campo ausente de `d` fica como estava. */
function pedAplicarComuns(r, d) {
  if (!r) return r;
  d = d || {};
  const tem = (k) => Object.prototype.hasOwnProperty.call(d, k);

  if (tem("processo")) r.processo = String(d.processo || "").trim().toUpperCase() || null;
  /* setor e responsável, sempre pelo processo FINAL do pedido */
  const dest = pedDestinoDoProcesso(r.processo);
  r.setor = (tem("setor") && d.setor) ? d.setor : dest.setor;
  r.responsavel = (tem("responsavel") && d.responsavel) ? d.responsavel
    : (dest.responsavel || padraoResp("destinar", "separar") || null);

  if (tem("prestadora")) r.prestadora = (d.prestadora || "").toString().trim() || null;
  if (tem("prioridade") && d.prioridade != null) r.prioridade = Number(d.prioridade);
  if (tem("prioridadeTravada")) r.prioridadeTravada = !!d.prioridadeTravada;
  if (tem("aguardandoMaterial")) r.aguardandoMaterial = !!d.aguardandoMaterial;
  if (tem("qtdEmbalar")) r.qtdEmbalar = d.qtdEmbalar == null ? null : Number(d.qtdEmbalar);
  if (tem("qtdMix")) r.qtdMix = d.qtdMix == null ? null : Number(d.qtdMix);
  if (tem("obs")) r.obs = (d.obs || "").toString().trim() || null;
  if (tem("obsInterna")) r.obsInterna = (d.obsInterna || "").toString().trim() || null;
  if (tem("campanhaId")) r.campanhaId = d.campanhaId || null;

  /* as etapas escolhidas na janela também são as do pedido. O padrão do SKU
     quem grava é `pedAplicarPadraoDoProduto`, uma vez por SKU. */
  if (tem("etapas") && d.etapas && d.etapas.tem) r.etapasUsadas = d.etapas.etapas || null;
  return r;
}

/* A conta em voz alta, antes de existir pedido errado no banco. Vale para os
   dois caminhos: o da Demanda calcula embalar/mix e o avulso deixa a pessoa
   digitar, mas a soma não pode passar do pedido em nenhum dos dois. */
function pedDestinoConfere(r) {
  if (r.qtdEmbalar == null || r.qtdMix == null) return null;
  const soma = Number(r.qtdEmbalar) + Number(r.qtdMix);
  if (soma <= Number(r.qtd)) return null;
  return `Embalar ${n0(r.qtdEmbalar)} + mix ${n0(r.qtdMix)} dá ${n0(soma)}, e o pedido tem ${n0(r.qtd)} peças. Ajuste um dos dois.`;
}

