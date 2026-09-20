/* ---------- modais ---------- */
/* recado da prestadora: o que ela deve puxar para a frente e o que pode deixar de lado */
function textoRecado(nome, lista) {
  const sobe = lista.filter((r) => r.avisar?.sentido === "subiu").sort((a, b) => a.prioridade - b.prioridade);
  const desce = lista.filter((r) => r.avisar?.sentido === "desceu");
  const linha = (r) => { const sku = opPorId(r.opId)?.sku || r.sku; const p = produtoDe(sku);
    return `${r.numero} · ${sku}${p?.descricao ? ` (${p.descricao.slice(0, 34)})` : ""} · ${n0(r.qtd)} pçs`; };
  const t = [`Oi ${String(nome).split(/\s+/)[0]}, tudo bem? Mudou a ordem aqui de prioridade:`];
  if (sobe.length) t.push("", "*Priorizar — precisamos com urgência:*", ...sobe.map((r) => `• ${linha(r)}`));
  if (desce.length) t.push("", "*Pode deixar para depois:*", ...desce.map((r) => `• ${linha(r)}`));
  t.push("", "Qualquer coisa me chama. Obrigada!");
  return t.join("\n");
}

/* campo rotulado com dica opcional — usado por todas as janelas */
const f = (label, html, hint) => `<label class="fld" style="margin-bottom:14px"><span>${label}</span>${html}${hint ? `<div class="hint" style="margin-top:5px">${hint}</div>` : ""}</label>`;

/* ---------------------------------------------------------------------------
   v8.83 · O VEREDITO DO NÚMERO DO PEDIDO, EM UM LUGAR SÓ
   ---------------------------------------------------------------------------
   Digitar o número mudava duas coisinhas na janela — a dica embaixo do campo e
   o botão "Usar o sugerido" — e para isso a janela INTEIRA era repintada
   (`repintarModal` troca o nó do véu: é isso que se vê como piscar).
   O texto passa a ser calculado aqui, e `npNumRefrescar` escreve as duas
   coisinhas no lugar onde elas estão, sem tocar no resto da janela. Desenho e
   atualização usam a MESMA função — não há dois textos para divergirem.
   --------------------------------------------------------------------------- */
function npNumVeredito(numDoRascunho, sugPronta) {
  const ofic = typeof numeroTemContadorOficial === "function" && numeroTemContadorOficial();
  /* `sugPronta` é a sugestão que JÁ está desenhada (o `data-sug` do campo). No
     caminho legado `proximoNumeroPedido()` carimba a marca d'água em `S.cfg` —
     barato, mas é escrita. A cada tecla ninguém precisa dela: a sugestão só
     muda quando o contador do servidor responde, e isso já redesenha a janela. */
  const sug = sugPronta != null && sugPronta !== ""
    ? String(sugPronta) : String(proximoNumeroPedido()).padStart(4, "0");
  const atual = numDoRascunho ?? sug;
  const conflito = numeroEmUso(atual);
  const igualAoSugerido = String(atual).trim().toUpperCase() === sug;
  const dica = conflito
    ? `<span style="color:var(--red);font-weight:600">Já existe: ${esc(conflito.numero)} · ${esc(P_LABEL[conflito.status] || conflito.status)}${conflito.prestadora ? " · " + esc(conflito.prestadora) : ""}</span>`
    : igualAoSugerido
      ? (ofic ? `é o próximo da sequência do servidor — quem grava o número é ele`
        : `sem o contador do servidor agora: conta pela lista desta tela · o número final sai na gravação`)
      : `sugerido pelo app: ${esc(sug)}`;
  return { sug, atual, conflito, igualAoSugerido, dica };
}
/* devolve true se conseguiu atualizar em pé; false se a janela não está lá */
function npNumRefrescar(contadorMudou) {
  const inp = document.getElementById("np-num");
  if (!inp) return false;
  /* v8.103 · o contador do servidor mudou com a janela aberta: a sugestão
     desenhada (`data-sug`) envelheceu. Recalcula — e troca o CAMPO só se ele
     ainda está com a sugestão velha. Número digitado pela pessoa não é tocado. */
  if (contadorMudou) {
    const velha = inp.dataset.sug;
    const nova = String(proximoNumeroPedido()).padStart(4, "0");
    if (nova !== velha) {
      if (inp.value.trim().toUpperCase() === String(velha || "").trim().toUpperCase()) {
        inp.value = nova;
        if (S.modal && S.modal.v && S.modal.v.num === velha) S.modal.v.num = undefined;
      }
      inp.dataset.sug = nova;
    }
  }
  /* a checagem é LOCAL — `numeroEmUso` olha `S.pedidos` e `S.remessas`, que já
     estão na memória. Responde na tecla, sem ida ao servidor e sem debounce. */
  const vd = npNumVeredito(inp.value, inp.dataset.sug);
  const caixa = inp.closest("label.fld");
  const dv = caixa ? caixa.querySelector(".hint") : null;
  if (dv && dv.innerHTML !== vd.dica) dv.innerHTML = vd.dica;
  const bt = document.querySelector("[data-npnum]");
  if (bt) {
    bt.disabled = !!vd.igualAoSugerido;
    if (bt.dataset.npnum !== vd.sug) {
      bt.dataset.npnum = vd.sug;
      bt.textContent = `Usar o sugerido (${vd.sug})`;
    }
  }
  return true;
}

/* Redesenhar a tela inteira a cada clique dentro de uma janela faz a página
   piscar — atrás dela pode haver 700 linhas de tabela. Isto troca só a janela,
   mantendo a rolagem e o campo onde o cursor estava. */
/* guarda o que já foi digitado antes de redesenhar a janela do novo pedido */
/* ==========================================================================
   OS BLOCOS QUE VALEM PARA CRIAR E PARA EDITAR
   Eram três trechos escritos dentro da janela de editar, e por isso não
   existiam na de criar: embalagem, etapas e o destino das peças. Quem criava um
   pedido tinha de salvar, procurar na lista e reabrir para completar — e, se
   imprimisse antes, o papel saía mandando embalar TUDO mesmo quando parte era
   para o pacote mix.
   Viraram funções para as duas janelas lerem do mesmo lugar. Copiar o markup
   resolveria hoje e voltaria a divergir no primeiro campo novo.
   Todos leem de um objeto de pedido `r` — na criação ele é um RASCUNHO, que só
   vira pedido de verdade quando ela clica em Criar.
   ========================================================================== */
function blocoDestinoPecas(r, f) {
  const proc = r.processo || produtoDe(opPorId(r.opId)?.sku || r.sku)?.processo;
  if (!ehAdesivo(proc)) return "";
  const d = destinoPecas(r);
  /* mandar produzir a mais e embalar menos é rotina, não erro. Os dois
     campos são livres; a linha de baixo faz a conta em voz alta para
     ninguém precisar fazê-la de cabeça. */
  /* -------------------------------------------------------------------------
     v8.86 · `data-sug` AQUI TAMBÉM
     -------------------------------------------------------------------------
     `capturarNovoPedido` guardava estes dois campos como "mexidos pela pessoa"
     mesmo quando o valor era o que o PRÓPRIO app tinha acabado de desenhar.
     Medido: escolher o SKU adesivo antes da quantidade fazia o bloco nascer com
     embalar=0 (a quantidade ainda era zero); ao digitar 150, o rascunho levava
     esse 0 junto e `reporMexidosNovoPedido` o repunha por cima do 150 recém
     desenhado. O pedido nascia com 150 peças e o papel mandava embalar 0 — e
     não se recuperava: digitar a quantidade de novo recapturava o 0.
     A defesa já existia desde a v8.77 (`data-sug`, usada no responsável e no
     número): campo que está com a SUGESTÃO do app não é "mexido". Aqui ela é
     só aplicada a mais dois campos — nenhuma regra nova. Quem digitar outro
     número continua sendo respeitado: aí o valor difere da sugestão e volta
     normalmente.
     ------------------------------------------------------------------------- */
  return `<div class="rowform">
    ${f("Quantos embalar", `<input type="number" class="inp num" min="0" max="${d.qtd}" data-m="qtdEmbalar" data-sug="${esc(d.embalar)}" data-destino="1" value="${d.embalar}">`, "é este número que sai na etapa EMBALAGEM do papel")}
    ${f("Quantos p/ pacote mix", `<input type="number" class="inp num" min="0" max="${d.qtd}" data-m="qtdMix" data-sug="${esc(d.mix)}" data-destino="1" value="${d.mix}">`, "voltam soltas — o pacote mix é um pedido depois")}
  </div>
  <div class="hint" id="destino-resumo" data-qtd="${d.qtd}" style="margin:-8px 0 14px;line-height:1.6">${destinoFrase(d)}</div>`;
}

function blocoEmbalagem(r, f) {
  const prod2 = produtoDe(opPorId(r.opId)?.sku || r.sku);
  if (!prod2) return `<div class="aviso" style="margin-bottom:14px">Este SKU não está no cadastro de produtos, então não dá para definir a embalagem por aqui.</div>`;
  const pr3 = prod2.producao || {};
  if (!podeEditar("prodEmbalagem")) return `<div class="secao" style="margin-top:2px">Embalagem
      <span class="hint" style="font-weight:400;text-transform:none;letter-spacing:0">· sai impressa no canhoto</span></div>
    ${f("Como embalar", soLeitura(false, [pr3.embalagemTipo, pr3.embalagemTamanho].filter(Boolean).join(" ") + (pr3.qtdPorEmbalagem ? ` · ${n0(pr3.qtdPorEmbalagem)} por embalagem` : ""), "A embalagem vale para todos os pedidos deste SKU — só a administração muda"))}`;
  return `<div class="secao" style="margin-top:2px">Embalagem
      <span class="hint" style="font-weight:400;text-transform:none;letter-spacing:0">· sai impressa no canhoto · vale para <b>todos</b> os pedidos deste SKU</span></div>
    ${camposEmbalagem(prod2, f)}`;
}

function blocoEtapasPedido(r, f) {
  /* A lista de etapas vinha SÓ da estrutura importada. O canhoto, não: ele usa
     `tplDoProcesso`, que cai no gabarito do processo quando não há estrutura.
     As duas discordavam — o papel imprimia COLA e a janela não deixava marcar.
     Agora as duas leem da mesma fonte. */
  const proc = r.processo || produtoDe(opPorId(r.opId)?.sku || r.sku)?.processo;
  const tplEt = tplDoProcesso(proc);
  const todas = (tplEt.etapas || []).map((e2) => String(e2).toUpperCase());
  if (todas.length < 2) return "";
  const usadas = new Set(etapasDoPedido(r).map((e2) => String(e2).toUpperCase()));
  const livre = podeEditar("pedEtapas");
  return `<div class="fld" style="margin-bottom:14px"><span>Etapas deste pedido (saem no papel e na conferência)${livre ? "" : ` ${svg(IC.cadeado)}`}</span>
    <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:6px">${todas.map((nome) => {
      const on = cobreEtapa(r, nome, usadas);
      /* sem a permissão a etapa continua à vista — ela precisa saber o que
         esta prestadora faz — mas apagada e sem caixinha para clicar */
      return livre
        ? `<label class="chip ${on ? "on" : ""}" style="cursor:pointer"><input type="checkbox" class="chk" data-m-et value="${esc(nome)}" ${on ? "checked" : ""} style="margin-right:5px">${esc(nome)}</label>`
        : `<span class="chip ${on ? "on" : ""}" style="opacity:${on ? "1" : ".45"}">${esc(nome)}</span>`; }).join("")}</div>
    <div class="hint" style="margin-top:6px">Processo <b>${esc(proc || "—")}</b>${tplEt.daEstrutura ? " · etapas da estrutura cadastrada" : " · sem estrutura para este processo, usando o gabarito da fábrica"}${livre ? "" : " · quem muda as etapas é a administração"}</div></div>`;
}

function capturarNovoPedido() {
  const g = (id) => ($("#" + id)?.value ?? undefined);
  /* v8.77 · igual ao responsável: campo que está com a SUGESTÃO do app não é
     "mexido". O número era congelado no rascunho na primeira repintada — se o
     contador do servidor andasse depois disso (outra pessoa criou um pedido, ou
     a releitura da abertura chegou), a janela continuava oferecendo o número
     velho e o Criar batia em "esse número já é do pedido de fulana". */
  const gSug = (id) => { const el = $("#" + id); if (!el) return undefined;
    return (el.dataset.sug != null && el.value === el.dataset.sug) ? undefined : el.value; };
  /* Só os campos de identidade. O que a pessoa mexe nos blocos compartilhados
     (embalar, mix, etapas, embalagem) NÃO passa por aqui de propósito: fica no
     formulário e é lido direto do DOM na hora de criar. Passar por este estado
     fazia o número dar uma volta e voltar normalizado. */
  /* v8.20 · o que a pessoa mexeu nos blocos compartilhados vai junto, mas CRU,
     exatamente como está no campo. O motivo do comentário acima continua
     valendo — o que estragava era normalizar no caminho de volta, não guardar.
     Sem guardar, trocar o SKU ou a quantidade apagava a embalagem que ela
     acabara de preencher, e ela só descobria quando o papel saía errado. */
  const mexidos = {};
  $$("[data-m]").forEach((el2) => {
    /* v8.77 · campo que está com a SUGESTÃO do app não é "mexido": repor a
       sugestão velha por cima da nova era o que fazia o responsável ficar o do
       processo anterior depois de a pessoa trocar o processo na janela. Quem
       digitou outro nome continua sendo respeitado — aí o valor difere da
       sugestão e volta normalmente. */
    if (el2.dataset.sug != null && el2.value === el2.dataset.sug) return;
    mexidos[el2.dataset.m] = el2.type === "checkbox" ? el2.checked : el2.value;
  });
  const emb = {};
  $$("[data-emb]").forEach((el2) => { emb[el2.dataset.emb] = el2.value; });
  const etapas = $$("[data-m-et]").filter((el2) => el2.checked).map((el2) => el2.value);
  return { sku: g("np-sku"), cod: g("np-cod"), desc: g("np-desc"), proc: g("np-proc"), pac: g("np-pac"),
    forn: g("np-forn"), obsProd: g("np-obsprod"), qtd: g("np-qtd"), prio: g("np-prio"),
    prest: g("np-prest"), obs: g("np-obs"), obsInt: g("np-obs-int"), num: gSug("np-num"),
    mexidos, emb, etapas: etapas.length ? etapas : undefined };
}

/* Repõe no formulário, depois do repaint, o que a pessoa já tinha mexido.
   Roda DEPOIS de o HTML novo estar no lugar — por isso é uma função separada,
   e não parte da montagem: os blocos precisam existir para receber de volta. */
function reporMexidosNovoPedido(v) {
  if (!v) return;
  const qtdMax = Number(v.qtd) || 0;
  if (v.mexidos) {
    $$("[data-m]").forEach((el2) => {
      const k = el2.dataset.m;
      if (!(k in v.mexidos)) return;
      if (el2.type === "checkbox") { el2.checked = !!v.mexidos[k]; return; }
      const val = v.mexidos[k];
      /* embalar/mix são divisão da quantidade: se ela DIMINUIU, a divisão
         antiga não cabe mais e o padrão volta a valer — é a regra que já
         existia, e ela continua. */
      if ((k === "qtdEmbalar" || k === "qtdMix") && qtdMax && Number(val) > qtdMax) return;
      el2.value = val;
    });
  }
  if (v.emb) $$("[data-emb]").forEach((el2) => {
    const k = el2.dataset.emb;
    if (k in v.emb) el2.value = v.emb[k];
  });
  if (v.etapas) $$("[data-m-et]").forEach((el2) => { el2.checked = v.etapas.includes(el2.value); });
  if (typeof repintarDestino === "function") repintarDestino();
}

/* ---------- o rascunho ----------
   Um pedido que ainda não existe. Serve só para os blocos compartilhados terem
   de onde ler — processo, quantidade, etapas já marcadas. Ele NÃO entra em
   S.pedidos: quem cria é o botão Criar pedido, num clique só. */
/* ---------- os processos que ESTE SKU conhece ----------
   v8.20. Na criação, o processo de um produto já cadastrado não aparecia em
   lugar nenhum: ele era lido de `prod.processo` e pronto. Só que o processo
   decide o canhoto, o setor e quem recebe a tarefa — e há SKU que roda em mais
   de um. Quem criava o pedido não via qual seria, e não tinha como trocar sem
   salvar, procurar na lista e reabrir.
   A lista sai em ordem de proximidade: o do produto primeiro, depois os que as
   estruturas daquele SKU usam, depois todos os outros. */
function processosDoSku(sku) {
  const alvo = String(sku || "").trim().toUpperCase();
  const doProduto = (produtoDe(alvo) || {}).processo || null;
  /* só estrutura DESTE sku conta como "perto". Estrutura sem sku é genérica —
     vale para todo mundo, e por isso não diz nada sobre este produto. */
  const daEstrutura = (S.cad.estruturas || [])
    .filter((e) => e.sku && String(e.sku).trim().toUpperCase() === alvo)
    .map((e) => e.processo).filter(Boolean);
  const todos = [...new Set([...S.produtos.map((p) => p.processo),
    ...(S.cad.estruturas || []).map((e) => e.processo)].filter(Boolean))].sort();
  const perto = [...new Set([doProduto, ...daEstrutura].filter(Boolean))];
  return { doProduto, perto, todos: [...perto, ...todos.filter((x) => !perto.includes(x))] };
}

/* ---------- a busca de SKU, com a correspondência EXATA na frente ----------
   O `datalist` do navegador ordena pela ordem que a gente entrega, e a gente
   entregava a lista inteira em ordem alfabética. Digitar um código que existe
   deixava o exato no meio de vinte parecidos. Agora: exato, depois quem começa
   com o que foi digitado, depois quem contém, e por último o resto. */
function ordenarSkusPara(texto, lista) {
  const q = String(texto || "").trim().toUpperCase();
  if (!q) return lista;
  const peso = (p) => {
    const sku = String(p.sku || "").toUpperCase();
    const desc = String(p.descricao || "").toUpperCase();
    if (sku === q) return 0;
    if (sku.startsWith(q)) return 1;
    if (sku.includes(q)) return 2;
    if (desc.startsWith(q)) return 3;
    if (desc.includes(q)) return 4;
    return 5;
  };
  return lista.map((p, i) => ({ p, w: peso(p), i }))
    .sort((a, b) => (a.w - b.w) || (a.i - b.i))
    .map((x) => x.p);
}

function rascunhoNovoPedido(m) {
  const v = m.v || {};
  const sku = (m.novo ? (v.cod ?? m.codSugerido) : (v.sku || "")).trim().toUpperCase();
  const prod = produtoDe(sku);
  /* o processo escolhido na janela manda; o do produto é só o padrão */
  const proc = ((m.novo ? (v.proc || "") : (v.proc || prod?.processo || "")) || "").trim().toUpperCase() || null;
  return {
    id: "__rascunho", numero: v.num ?? "", sku, opId: null,
    qtd: Number(v.qtd) || 0, status: "papel", processo: proc, etapas: [],
    prestadora: (v.prest || "").trim() || null,
    obs: (v.obs || "").trim() || null,
    obsInterna: (v.obsInt || "").trim() || null,
    /* nulos de propósito: os blocos partem do padrão (embalar tudo, etapas do
       processo) e o que a pessoa mexer fica no formulário até o Criar */
    qtdEmbalar: null, qtdMix: null, etapasUsadas: null,
  };
}

/* ---------------------------------------------------------------------------
   ABRIR E FECHAR A JANELA SEM REDESENHAR A TELA DE BAIXO (v8.61)
   ---------------------------------------------------------------------------
   Abrir a janela de um pedido chamava `render()` da tela inteira. Medido, com
   600 linhas na lista: 747 ms para abrir e 1.001 ms para fechar e abrir outro —
   dos quais 683 ms eram `repor()`, o layout forçado da lista inteira. A lista
   não muda quando uma janela abre; ela só fica atrás.

   `repintarModal` já sabia trocar uma janela ABERTA em pé. Faltava o caso de
   ABRIR (não existe `.ov` ainda) e o de FECHAR (o `.ov` some). É só isso.

   Devolve `false` quando não deu conta — e aí quem chamou faz o render
   completo de sempre. A rede continua lá.
   --------------------------------------------------------------------------- */
function janelaPintar() {
  try {
    const app = document.getElementById("app");
    if (!app) return false;
    const ov = document.querySelector(".ov");
    const html = renderModal();
    if (!html) { if (ov) ov.remove(); return true; }   /* fechar */
    if (ov) { repintarModal(); return true; }          /* trocar a que já está aberta */
    app.insertAdjacentHTML("beforeend", html);         /* abrir por cima */
    return true;
  } catch { return false; }
}

function repintarModal() {
  const ov = document.querySelector(".ov");
  const html = renderModal();
  if (!ov || !html) return render();
  /* ---------------------------------------------------------------------------
     v8.84 · O QUE ESTÁ NOS CAMPOS SOBREVIVE AO REPAINT DA JANELA
     ---------------------------------------------------------------------------
     `render()` já fazia isto desde a v8.62 (colher antes, repor depois). O
     `repintarModal` não fazia — ele contava só com `S.modal.v`, e `S.modal.v`
     é atualizado apenas quando muda um dos cinco campos de identidade. Medido:
     preencher prestadora, prioridade e as duas observações e depois clicar em
     "+ tamanho" devolvia a janela com esses quatro campos vazios, porque o
     desenho saiu de um rascunho velho.
     Colher aqui é a mesma rede do render, no mesmo lugar do ciclo.
     --------------------------------------------------------------------------- */
  const _digitadoJanela = (typeof colherDigitadoDaJanela === "function") ? colherDigitadoDaJanela() : null;
  const foco = document.activeElement;
  /* Antes só voltava o foco de um tipo de campo (`data-cp`). Enquanto a janela
     repintava uma vez só — no campo do número — isso passava. Agora ela repinta
     ao trocar SKU e quantidade, e `change` dispara no BLUR: quando o repaint
     acontece, o foco já está no campo SEGUINTE. Sem guardar por `id`, tabular
     de um campo para o outro fazia o cursor sumir no meio do preenchimento. */
  const chave = foco && ov.contains(foco)
    ? (foco.dataset?.cp ? `[data-cp="${foco.dataset.cp}"][data-g="${foco.dataset.g}"][data-l="${foco.dataset.l}"]`
      : foco.id ? `#${CSS.escape(foco.id)}`
      : foco.dataset?.m ? `[data-m="${foco.dataset.m}"]`
      : null) : null;
  const pos = foco && typeof foco.selectionStart === "number" ? foco.selectionStart : null;
  const rolMod = ov.querySelector(".modal-b")?.scrollTop || 0;
  const rolOv = ov.scrollTop || 0;
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const novo = tmp.firstElementChild;
  if (!novo) return render();
  /* ---------------------------------------------------------------------------
     v8.90 · REPINTAR NÃO É REABRIR
     ---------------------------------------------------------------------------
     `.ov` e `.modal` têm animação de ABERTURA no CSS (`fade` e `pop`). Trocar o
     nó faz o navegador ver um elemento NOVO entrando na página — e tocar as duas
     de novo. Medido ao escolher o SKU no Novo pedido: o véu reaparecia de
     `opacity 0` e o modal nascia em `scale(.99) translateY(10px)`, passando por
     quatro larguras (554,4 · 556,3 · 559,5 · 560) e quatro posições em 195 ms.
     Era isso o "pulo" — não render a mais, não releitura, não barra de rolagem.

     A marca abaixo diz ao CSS que esta janela não está abrindo: está sendo
     repintada. Quem ABRE de verdade (`janelaPintar`, que insere o `.ov` pela
     primeira vez) não passa por aqui e continua animando como sempre.
     --------------------------------------------------------------------------- */
  try { novo.classList.add("sem-reabrir"); } catch (e) {}
  /* Dois repaints em sequência (dois campos perdendo o foco quase juntos) e o
     segundo carrega uma referência já trocada: `replaceWith` estoura com
     "node is no longer a child of this node". Redesenhar a tela inteira é a
     saída segura — e o erro nunca chega à pessoa. */
  if (!ov.isConnected || !ov.parentNode) return render();
  /* E mesmo conectado ele pode sair do lugar entre a conferência e a troca — o
     `focus()` de um repaint anterior dispara blur, que dispara change, que
     dispara outro repaint. Em vez de tentar prever a corrida, o caminho seguro
     é: se a troca cirúrgica falhar, redesenha a tela inteira. A pessoa não vê
     diferença; o erro não chega nela. */
  try { ov.replaceWith(novo); } catch { return render(); }
  const corpo = novo.querySelector(".modal-b");
  if (corpo) corpo.scrollTop = rolMod;
  novo.scrollTop = rolOv;
  /* v8.20 · o que ela já tinha preenchido nos blocos volta para o formulário.
     Tem de ser AQUI, depois de o HTML novo estar no lugar: os campos precisam
     existir para receber de volta. */
  if (S.modal?.tipo === "novoPedido") { try { reporMexidosNovoPedido(S.modal.v); repintarDestino(); } catch {} }
  /* e por último o que estava nos campos AGORA: ele ganha do rascunho, porque é
     o mais recente — o rascunho pode ser de dois campos atrás. */
  if (_digitadoJanela && typeof reporDigitadoNaJanela === "function") {
    try { reporDigitadoNaJanela(_digitadoJanela); if (typeof repintarDestino === "function") repintarDestino(); } catch (e) {}
  }
  if (chave) { const alvo = novo.querySelector(chave);
    if (alvo) { alvo.focus(); try { if (pos != null) alvo.setSelectionRange(pos, pos); } catch {} } }
}

/* ---------------------------------------------------------------------------
   v8.84 · ABRIR UMA JANELA POR CIMA DE OUTRA SEM PERDER O QUE ESTÁ PREENCHIDO
   ---------------------------------------------------------------------------
   "Gerenciar opções de embalagem" fazia `S.modal = { tipo: "tamEmb" }` e um
   `render()`. Medido na bancada: a janela do pedido, com SKU, quantidade,
   etapas e observação preenchidos, virava `tamEmb` com `voltarPara: null` — o
   rascunho inteiro ia embora e não havia para onde voltar.

   Aqui a janela de baixo é guardada INTEIRA (o próprio objeto `S.modal`, com
   tudo o que ela carrega: grupos, pedido, foto, modo) e o que está nos CAMPOS
   é colhido antes de sair:
     · `capturarNovoPedido()` — o rascunho que o desenho da janela usa para
       saber quais blocos existem (SKU, processo, quantidade, número…);
     · `colherDigitadoDaJanela()` — a rede genérica, campo a campo, que repõe o
       que o rascunho não carrega.
   A volta acontece no `render()` (ver `__rascunho` lá), depois de a janela de
   baixo estar desenhada de novo — os campos precisam existir para receber.
   --------------------------------------------------------------------------- */
function abrirPorCimaDaJanela(nova) {
  const debaixo = S.modal;
  let alvo = nova;
  if (debaixo) {
    try {
      if (debaixo.tipo === "novoPedido" && typeof capturarNovoPedido === "function") {
        debaixo.v = capturarNovoPedido();
      }
      if (typeof colherDigitadoDaJanela === "function") {
        const g = colherDigitadoDaJanela();
        if (g) debaixo.__rascunho = g;
      }
    } catch (e) { console.error("rascunho da janela de baixo:", e); }
    alvo = { ...nova, voltarPara: debaixo };
  }
  S.modal = alvo;
  render();
}

/* Repõe o que ficou guardado quando a janela de baixo volta a aparecer. Roda no
   fim do `render()`, uma vez — o `__rascunho` é consumido. */
function janelaReporRascunhoDaVolta() {
  const m = S.modal;
  if (!m) return 0;
  /* o rascunho do novo pedido não é só valor de campo: é ele que diz quais
     blocos o desenho monta. O desenho já usou `m.v`; aqui voltam os blocos
     compartilhados (etapas, embalagem, embalar/mix, responsável). */
  if (m.tipo === "novoPedido" && m.__rascunho && typeof reporMexidosNovoPedido === "function") {
    try { reporMexidosNovoPedido(m.v); } catch (e) {}
  }
  if (!m.__rascunho) return 0;
  const g = m.__rascunho;
  m.__rascunho = null;
  try { return (typeof reporDigitadoNaJanela === "function" ? reporDigitadoNaJanela(g) : 0) || 0; }
  catch (e) { return 0; }
}

function renderModal() {
  const m = S.modal;
  if (!m) return "";

  /* dividido por assunto: cada grupo devolve null se a janela não for dele.
     A ordem não importa porque cada tipo existe em um grupo só. */
  for (const g of [modaisProducao, modaisCadastro, modaisFabrica, modaisInsumos, modaisFestivas, modaisSistema]) {
    const html = g(m);
    if (html) return html;
  }
  return "";
}

/* janelas de pedidos, conferência e papéis */
function modaisProducao(m) {
  if (m.tipo === "previa") {
    const p = m.previa;
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(1180px, 96vw)" role="dialog" aria-label="Aplicar análise">
      <div class="modal-h"><h2>Aplicar análise</h2><button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <dl class="kv" style="border:0">
          <dt>Necessidades novas</dt><dd>${n0(p.novas.length)}</dd>
          <dt>Necessidades atualizadas</dt><dd>${n0(p.atualiza.length)}</dd>
          <dt>Necessidades a encerrar</dt><dd>${n0(p.encerra.length)}</dd>
        </dl>
        <div class="secao">Distribuição por prioridade</div>
        <div style="display:flex;gap:9px;margin-bottom:16px;flex-wrap:wrap">${CORTES.map((i, ix) => `<span class="tag ${i === 0 && p.porCorte[ix] ? "red" : ""}">${CORTE[i]}: <b>${p.porCorte[ix]}</b></span>`).join("")}</div>
        ${p.pedidosPromoviveis.length ? `
        <div class="aviso" style="margin:0 0 14px"><b>${p.pedidosPromoviveis.length} ${p.pedidosPromoviveis.length === 1 ? "pedido vivo muda de prioridade" : "pedidos vivos mudam de prioridade"}</b>, para cima e para baixo. Quando o mesmo SKU tem vários pedidos, cada um é julgado pelo estoque <b>projetado</b> depois dos que vêm antes dele na fila — por isso pedidos do mesmo produto podem sair com prioridades diferentes.</div>
        <div class="tw" style="max-height:min(46vh, 460px);margin-bottom:14px"><table class="t" style="font-size:12px">
          <thead><tr><th>Pedido</th><th>SKU</th><th class="num">Qtd</th><th>Curva</th><th>Processo</th><th>Prestadora</th><th class="num" title="%Estoque projetado no momento em que este pedido é julgado">%Est. proj.</th><th>De</th><th>Para</th></tr></thead>
          <tbody>${p.pedidosPromoviveis.slice(0, 60).map((x) => `<tr>
            <td class="sku">${esc(x.numero)}</td>
            <td class="sku" style="font-size:12px">${esc(x.sku)}</td>
            <td class="num">${n0(x.qtd)}</td>
            <td><span class="abc ${x.abc}">${x.abc}</span></td>
            <td style="font-size:11.5px">${esc(x.etapa)}</td>
            <td style="font-size:11.5px">${x.prestadora ? esc(x.prestadora) : "—"}</td>
            <td class="num mono" style="font-size:11px" title="estoque projetado: ${x.projetado != null ? n0(x.projetado) : "—"}">${x.pctProj != null ? pct(x.pctProj) : "—"}</td>
            <td>${corteCurto(x.de)}</td>
            <td><b>${corteCurto(x.para)}</b></td></tr>`).join("")}</tbody></table></div>
        <div class="hint" style="margin-bottom:12px;line-height:1.6">Esta lista é <b>informativa</b>: ao aplicar, todo pedido vivo sem prioridade travada é recalculado pela mesma regra automática — cada um no degrau que o estoque projetado lhe dá. A data original de criação não muda, só a prioridade. <b>Para segurar a prioridade de um pedido, trave a prioridade dele.</b></div>` : ""}
        <label style="display:flex;gap:9px;align-items:flex-start;font-size:12.5px;line-height:1.6;cursor:pointer">
          <input type="checkbox" class="chk" id="mod-blocos" ${S.cfg.dividirBlocos ? "checked" : ""} style="margin-top:2px">
          <span>Dividir em blocos, um por prioridade<br><span style="color:var(--ink-3)">Só afeta necessidades novas.</span></span></label>
        <p class="hint" style="margin-top:16px">A análise nunca cria pedidos sozinha — criar é sempre decisão sua na Demanda. As prioridades seguem as bandas fechadas no centésimo: zerado = Crítico · 0,01–24,99% = Urgente · 25,00–49,99% = P1 · 50,00–74,99% = P2 · 75,00–100% = P3.</p>
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="confirmar-analise">Aplicar</button></div></div></div>`;
  }

  if (m.tipo === "criarPedidos") {
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(1080px, 96vw)" role="dialog" aria-label="Criar pedidos de produção">
      <div class="modal-h"><h2>Criar pedidos de produção</h2>
        <span class="tag">${m.grupos.length === 1 ? "1 produto" : m.grupos.length + " produtos"}</span>
        ${(() => { /* que números vão sair daqui — a fábrica fala por número, e
             saber isso antes de imprimir evita ter que voltar para conferir */
          const n = m.grupos.reduce((t2, g) => t2 + (g.linhas || []).filter((l) => (+l.qtd || 0) > 0).length, 0);
          if (!n) return "";
          const ini = proximoNumeroPedido();
          const fmt = (x) => String(x).padStart(4, "0");
          /* v8.75 · quem dá o número é o servidor (`pcp_proximo_numero`). A tela
             mostra o que o contador oficial diz agora, e diz em voz alta que o
             número final sai na gravação. Sem contador (documento, leitura que
             falhou), ela avisa que aquilo é estimativa da lista local. */
          const oficial = typeof numeroTemContadorOficial === "function" && numeroTemContadorOficial();
          return `<span class="tag" title="${oficial
            ? "Vem do contador do servidor. Ele reserva os números na hora de criar — se alguém criar antes, estes andam."
            : "Sem o contador do servidor agora: esta é uma conta pela lista desta tela. O número final é o que o servidor gravar."}">${
            n === 1 ? `número ${fmt(ini)}` : `números ${fmt(ini)} a ${fmt(ini + n - 1)}`}${
            oficial ? " · confirmado na gravação" : " · estimado · o servidor define na gravação"}</span>`; })()}
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p class="hint" style="margin:0 0 16px">Divida o saldo em quantos pedidos precisar — cada um com sua quantidade, prioridade e, se já souber, a prestadora. As recomendadas vêm do histórico: quem já produziu a referência, com que média por lote e quanta capacidade livre tem.</p>
        ${m.grupos.map((g, gi) => `
        <div style="border:1px solid var(--line);border-radius:9px;margin-bottom:16px;overflow:hidden">
          <div style="padding:11px 14px;background:var(--paper-2);display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <span class="sku">${esc(g.sku)}</span><b style="font-size:13px">${esc(g.descricao)}</b>
            <span class="tag">saldo sem pedido: ${n0(g.saldo)}</span>
            <span class="tag ${totalLinhas(g) > g.saldo ? "red" : ""}" data-plan="${gi}">planejado: ${n0(totalLinhas(g))}</span>
            ${g.setor ? `<span class="tag">${esc(g.setor.nome)}${g.setor.responsavel ? " · " + esc(g.setor.responsavel) : ""}</span>` : ""}
            ${g.adesivo ? `<span class="tag amber">adesivo: divida entre embalar e pacote mix</span>` : ""}
            <button class="btn sm ghost" style="margin-left:auto" data-addlinha="${gi}">${svg(IC.mais)}Dividir</button>
          </div>
          ${(() => { const es = estruturaDe(g.processo); if (!es || (es.etapas || []).length < 2) return "";
            const prod2 = produtoDe(g.sku);
            const padrao = Array.isArray(prod2?.etapasUsadas) && prod2.etapasUsadas.length ? prod2.etapasUsadas.map((e2) => String(e2).toUpperCase()) : null;
            return `<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:2px 0 6px">
              <span style="font-size:9.5px;letter-spacing:.1em;font-weight:800;color:var(--ink-4)">ETAPAS DESTE SKU</span>
              ${es.etapas.map((et) => { const nome = String(et.nome).toUpperCase();
                const on = !padrao || padrao.includes(nome) || /EMBALA/.test(nome);
                return `<label class="chip ${on ? "on" : ""}" style="cursor:pointer"><input type="checkbox" class="chk" data-etuso="${gi}" value="${esc(nome)}" ${on ? "checked" : ""} style="margin-right:5px">${esc(nome)}</label>`; }).join("")}
              <span class="hint" style="font-size:11px">só as marcadas saem no papel e na conferência — fica salvo para a próxima</span>
            </div>`; })()}
          ${(() => { /* embalagem à mão aqui também: é neste momento que se percebe
               que falta. São campos do PRODUTO — valem para todos os pedidos do SKU. */
            const prod3 = produtoDe(g.sku);
            if (!prod3) return "";
            const pr3 = prod3.producao || {};
            const falta = !pr3.embalagemTipo && !pr3.qtdPorEmbalagem;
            return `<div style="margin:2px 14px 8px;padding:9px 11px;border:1px solid ${falta ? "var(--amber)" : "var(--line)"};border-radius:9px;background:${falta ? "var(--amber-soft)" : "transparent"}">
              <div style="font-size:9.5px;letter-spacing:.1em;font-weight:800;color:var(--ink-4);margin-bottom:5px">EMBALAGEM${falta ? " — ainda não definida" : ""}
                <span style="font-weight:400;letter-spacing:0;text-transform:none;color:var(--ink-3)"> · sai impressa no canhoto · vale para todos os pedidos deste SKU</span></div>
              ${camposEmbalagem(prod3, f, gi)}</div>`; })()}
          ${(() => { /* PROJETO DE CORTE · um bloco por SKU, com a decisão dentro
               do PRÓPRIO grupo. É isto que impede o projeto (ou o "seguir sem")
               de um SKU de valer para o seguinte. */
            if (typeof pcSecao !== "function") return "";
            try { return `<div style="margin:2px 14px 8px">${pcSecao(g.sku, g.corte, "lote", gi)}</div>`; }
            catch (e2) { return ""; }
          })()}
          <div style="display:none">
          </div>
          ${g.abertos.length ? `<div class="aviso" style="margin:10px 14px 4px;padding:10px 12px">
            <b>Este produto já possui ${g.abertos.length === 1 ? "1 pedido de produção em aberto" : g.abertos.length + " pedidos de produção em aberto"}</b> — ajuste a prioridade deles aqui em vez de duplicar:
            <table class="t" style="font-size:12px;margin-top:8px"><thead><tr><th>Pedido</th><th>Criado</th><th class="num">Qtd</th><th>Etapa</th><th>Prioridade</th></tr></thead>
            <tbody>${g.abertos.map((r) => `<tr><td class="sku">${esc(r.numero)}</td>
              <td class="mono" style="font-size:11px">${fdate(r.criadoEm)}</td>
              <td class="num">${n0(r.qtd)}</td><td><span class="tag">${P_LABEL[r.status]}</span></td>
              <td><select class="sel" style="padding:4px 8px;font-size:12px" data-reprio="${esc(r.id)}">
                ${CORTES.map((pp) => `<option value="${pp}" ${r.prioridade === pp ? "selected" : ""}>${CORTE[pp]}</option>`).join("")}
              </select></td></tr>`).join("")}</tbody></table></div>` : ""}
          <table class="t"><thead><tr><th class="num">Quantidade</th>${g.adesivo ? '<th class="num">Embalar</th><th class="num">P/ pacote mix</th>' : ""}<th>Prioridade</th><th>Prestadora (opcional)</th><th></th></tr></thead>
          <tbody>${g.linhas.map((l, li) => `<tr>
            <td class="num"><input class="inp num" style="width:100px" type="number" min="0" step="${g.qtdPacote || 1}" value="${l.qtd}" data-cp="qtd" data-g="${gi}" data-l="${li}"></td>
            ${g.adesivo ? `<td class="num mono" style="color:var(--teal);font-weight:700">${n0(Math.max(0, (+l.qtd || 0) - (+l.mix || 0)))}</td>
            <td class="num"><input class="inp num" style="width:90px" type="number" min="0" max="${+l.qtd || 0}" value="${l.mix || 0}" data-cp="mix" data-g="${gi}" data-l="${li}"></td>` : ""}
            <td><select class="sel" data-cp="prioridade" data-g="${gi}" data-l="${li}">
              ${CORTES.map((pp) => `<option value="${pp}" ${l.prioridade === pp ? "selected" : ""}>${CORTE[pp]}</option>`).join("")}</select></td>
            <td><select class="sel" style="max-width:280px" data-cp="prestadora" data-g="${gi}" data-l="${li}">${optPrestRecomendado(g.sku, g.processo, +l.qtd || 0, l.prestadora)}</select></td>
            <td>${g.linhas.length > 1 ? `<button class="btn sm ghost" data-rmlinha="${gi}:${li}">Remover</button>` : ""}</td></tr>`).join("")}
          </tbody></table>
          ${g.recomendadas.length ? `<div style="padding:8px 14px 12px;font-size:11.5px;color:var(--ink-3);line-height:1.6">
            ${g.recomendadas.slice(0, 3).map((r) => `<b>${esc(r.nome)}</b>: ${esc(r.motivos.slice(0, 3).join(" · "))}`).join("<br>")}</div>` : ""}
        </div>`).join("")}
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="confirmar-pedidos">Criar pedidos</button></div></div></div>`;
  }

  if (m.tipo === "conferir") {
    const r = m.pedido;
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:560px" role="dialog" aria-label="Conferir retorno">
      <div class="modal-h"><h2>Conferir retorno</h2><span class="tag">Pedido ${esc(r.numero)}</span>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        ${(() => { const sku2 = opPorId(r.opId)?.sku || r.sku; const pr2 = produtoDe(sku2);
          const nome2 = pr2?.descricao || opPorId(r.opId)?.descricao || "";
          const der2 = pr2?.derivacao || "";
          return `<div style="display:flex;gap:9px;align-items:flex-start;padding:11px 13px;border:1px solid var(--line);border-radius:9px;margin-bottom:14px;background:var(--surface-2)">
            <div style="flex:1;min-width:0">
              <div class="sku" style="font-size:14px;font-weight:800;letter-spacing:-.01em">${esc(sku2 || "SKU não informado")}</div>
              ${nome2 || der2 ? `<div style="font-size:12px;color:var(--ink-2);margin-top:2px">${esc([nome2, der2].filter(Boolean).join(" · "))}</div>` : ""}
              <div style="font-size:11.5px;color:var(--ink-3);margin-top:3px">
                ${esc(r.processo || pr2?.processo || "processo não definido")}${pr2?.qtdPacote ? ` · pacote de ${n0(pr2.qtdPacote)}` : ""}
              </div>
            </div>
            ${sku2 ? `<button class="btn sm ghost" data-loja="${esc(sku2)}" title="Copiar o SKU e abrir na loja">${svg(IC.busca)}</button>` : ""}
          </div>`; })()}
        <p class="hint" style="margin:0 0 16px">${esc(r.prestadora || "sem prestadora")} · enviadas <b>${n0(r.qtd)}</b> peças em ${fdate(r.enviadaEm || r.separadaEm)}.${splitAdesivo(r) ? ` Destino combinado: <b>${splitAdesivo(r)}</b>.` : ""}</p>
        ${(() => { if (r.status !== "retornada" && !(r.etapas || []).length) return "";
          const cf = conferenciaDe(r);
          if (!cf.alertas.length) return `<div class="tag ok" style="display:block;padding:7px 11px;margin-bottom:14px">Conferência sem divergências — as quantidades batem com o que foi enviado.</div>`;
          return `<div class="aviso" style="margin:0 0 14px"><b>Confira antes de fechar:</b>
            ${cf.alertas.map((a) => `<div style="margin-top:5px">• ${esc(a.txt)}</div>`).join("")}</div>`; })()}
        ${(() => { const es = estruturaDe(r.processo || produtoDe(opPorId(r.opId)?.sku || r.sku)?.processo);
          if (!es || !(es.etapas || []).length) return "";
          const usadas = new Set(etapasDoPedido(r).map((e2) => String(e2).toUpperCase()));
          const esF = { ...es, etapas: es.etapas.filter((et) => cobreEtapa(r, String(et.nome).toUpperCase(), usadas)) };
          const ant = r.etapas || [];
          return `<div class="fld" style="margin-bottom:6px"><span>Quantidade por etapa (${esc(normProc(esF.processo))}) — igual ao ControleProcessos</span></div>
          <div class="rowform" style="flex-wrap:wrap">
            ${esF.etapas.map((et, i) => { const v = ant.find((a) => a.nome === String(et.nome).toUpperCase())?.qtd;
              return f(`${esc(et.nome)}${et.valor ? ` <span style="text-transform:none;letter-spacing:0;color:var(--ink-4)">${fmoeda(et.valor)}</span>` : ""}`,
              `<input type="number" class="inp num" data-cq="${i}" data-cq-nome="${esc(String(et.nome).toUpperCase())}" data-cq-vu="${et.valor || 0}" value="${v ?? ""}" placeholder="—">`); }).join("")}
          </div>
          <p class="hint" style="margin:0 0 12px">Preencha só as etapas que <b>esta prestadora</b> fez — a quantidade pode variar entre etapas. A última preenchida vira o <b>Produzido</b> do pedido (como na planilha).</p>`; })()}
        <div class="rowform">
          ${(() => { /* ---------- o que voltou pronto não se digita ----------
              Ele É a última etapa preenchida. Ter um campo à parte criava duas
              versões do mesmo número, e quando elas discordavam ninguém sabia
              qual mandava. Onde há etapas, o número é lido delas; o campo só
              sobrevive no processo que não tem estrutura, onde não há de onde ler. */
            const temEstr = !!estruturaDe(r.processo || produtoDe(opPorId(r.opId)?.sku || r.sku)?.processo)?.etapas?.length;
            if (!temEstr) return f("Peças prontas que voltaram", `<input type="number" class="inp num" data-c="qtdConferida" value="${r.qtdConferida ?? r.qtd}">`,
              `este processo não tem estrutura cadastrada, então o número vem daqui · enviadas ${n0(r.qtd)}`);
            const cf3 = conferenciaDe(r);
            return f("Peças prontas", `<div class="travado" style="cursor:default" title="Sai da última etapa preenchida acima">${cf3.produzido != null ? n0(cf3.produzido) : "—"}${cf3.naoTerminadas ? ` <span style="color:var(--ink-3);font-weight:400;font-size:12px">de ${n0(cf3.trabalhadas)} trabalhadas</span>` : ""}</div>`,
              `vem da última etapa preenchida acima · é o que conta como produzido e abate a Demanda`); })()}
          ${f("Peças com defeito", `<input type="number" class="inp num" data-c="qtdDefeito" min="0" value="${defeitoDe(r) || 0}">`,
            "estão dentro das que voltaram · não contam como produzidas nem são pagas")}
          ${f("Data do retorno", `<input type="date" class="inp" data-c="retornadaEm" value="${r.retornadaEm || iso(hoje())}">`)}
          ${(() => { const atual = competenciaDe(r) || compFmt(pdate(r.retornadaEm) || hoje());
            const ops = [...new Set([...compsVizinhas(r.retornadaEm || iso(hoje())), atual].filter(Boolean))]
              .sort((a2, b2) => ordemComp(a2) - ordemComp(b2));
            return f("Mês de pagamento", `<select class="sel" data-c="mesPagamento">${ops.map((c2) =>
              `<option value="${esc(c2)}" ${c2 === atual ? "selected" : ""}${mesFechado(c2) ? " disabled" : ""}>${esc(c2)}${mesFechado(c2) ? " · fechado" : ""}</option>`).join("")}</select>`,
              "é ele que decide em qual fechamento esta prestadora recebe — na virada do mês, escolha o mês anterior"); })()}
        </div>
        <div id="cf-resumo">${(() => {
          const cf2 = conferenciaDe(r);
          const voltou = Number(r.qtdConferida ?? cf2.produzido ?? r.qtd) || 0;
          const def = defeitoDe(r);
          const sobra = cf2.naoTerminadas || 0;
          if (!def && !sobra) return "";
          const linhas = [];
          if (sobra) linhas.push(`<b>${n0(cf2.trabalhadas)} passaram pela maior etapa e ${n0(cf2.produzido)} chegaram ao fim</b> — ${n0(sobra)} ${sobra === 1 ? "peça ficou" : "peças ficaram"} pelo caminho. Ela <b>recebe pelas ${n0(cf2.trabalhadas)}</b>, na etapa em que passaram; ${n0(cf2.produzido)} ${cf2.produzido === 1 ? "conta" : "contam"} como ${cf2.produzido === 1 ? "produzida" : "produzidas"} e ${cf2.produzido === 1 ? "abate" : "abatem"} a Demanda. As ${n0(sobra)} ficam registradas aqui, no pedido.`);
          if (def) linhas.push(`<b>${n0(voltou)} voltaram · ${n0(def)} com defeito · ${n0(Math.max(0, voltou - def))} boas.</b> As com defeito não contam como produzidas e não são pagas — o saldo delas volta a aparecer na Demanda. O material, esse já foi: a baixa de insumo sai pelas ${n0(voltou)}.`);
          return `<div class="aviso" style="margin:2px 0 14px;padding:9px 12px">${linhas.join("<br><br>")}</div>`; })()}</div>
        ${!ehEspelho(r) && !S.pedidos.some((x) => x.numero === r.numero + "-A") && !(S.cad.prestadoras || []).find((pp) => pp.nome === r.prestadora)?.fazTudo ? `
        <label style="display:flex;gap:9px;align-items:flex-start;cursor:pointer;margin-top:6px;padding-top:12px;border-top:1px solid var(--line-2)">
          <input type="checkbox" class="chk" id="cf-espelho" style="margin-top:2px">
          <span><b>Criar a continuação ${esc(r.numero)}-A</b> para o próximo processo (cola/embalagem)<br>
          <span style="color:var(--ink-3);font-size:12px">Só marque quando outra prestadora vai continuar este pedido. Nasce com a quantidade conferida, em ${P_LABEL.papel} — e no fechamento cada uma recebe pelo seu processo.</span></span></label>` : ""}
        <div class="rowform" style="display:none">
        </div>
        <p class="hint">O programado do produto é recalculado na hora; se ainda faltar, o saldo reaparece na Demanda.</p>
      </div>
      <div class="modal-f">
        ${r.status === "retornada" ? `<button class="btn sm" data-reabrir-conf="${esc(r.id)}" title="Devolve o pedido para 'Conferir', desfaz a baixa de insumo e deixa lançar de novo">${svg(IC.atualizar)}Reabrir conferência</button>` : ""}
        <button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="salvar-conferencia">${r.status === "retornada" ? "Salvar correção" : "Registrar retorno"}</button></div></div></div>`;
  }

  if (m.tipo === "pedido") {
    const r = m.pedido;
    const op = opPorId(r.opId) || {};
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:620px" role="dialog" aria-label="Editar pedido">
      <div class="modal-h"><h2>Pedido ${esc(r.numero)}</h2><span class="tag">${esc(op.sku || r.sku || "")}</span>
        <span class="tag">${P_LABEL[r.status]}</span>${etiquetaPedidoCampanha(r)}${r.aguardandoMaterial ? '<span class="tag red">falta material</span>' : ""}
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        ${typeof avisoRascunhoRecuperado === "function" ? avisoRascunhoRecuperado() : ""}
        <div class="rowform">
          ${f("Prioridade", `<select class="sel" data-m="prioridade">${CORTES.map((p) => `<option value="${p}" ${r.prioridade === p ? "selected" : ""}>${CORTE[p]}</option>`).join("")}</select>`)}
          ${f("Quantidade", `<input type="number" class="inp num" data-m="qtd" value="${r.qtd}">`)}
          ${f("Prestadora", `<select class="sel" data-m="prestadora">${optPrestRecomendado(op.sku || r.sku, r.processo || op.processo, r.qtd, r.prestadora)}</select>`)}
          ${f("Responsável", (() => {
            const nomes = [...new Set(S.equipe.filter((p) => p.ativo !== false).map((p) => p.nome))].sort();
            return `<input class="inp" data-m="responsavel" list="lista-resp" value="${esc(r.responsavel || "")}" placeholder="Quem cuida deste pedido"><datalist id="lista-resp">${nomes.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>`;
          })(), "sugestões vêm da aba Equipe — pode digitar outro nome")}
          ${f("Etapa", `<select class="sel" data-m="status">${P_STATUS.map((s) => `<option value="${s}" ${r.status === s ? "selected" : ""}>${P_LABEL[s]}</option>`).join("")}</select>`)}
          ${f("Processo", soLeitura(podeEditar("pedProcesso"), r.processo || op.processo, "O processo decide as etapas e o pagamento — só a administração muda")
            || `<input class="inp" data-m="processo" list="lista-procs" value="${esc(r.processo || op.processo || "")}"><datalist id="lista-procs">${[...new Set(S.produtos.map((p) => p.processo).filter(Boolean))].sort().map((p2) => `<option value="${esc(p2)}">`).join("")}</datalist>`)}
          ${f("Número do pedido", soLeitura(podeEditar("pedProcesso"), r.numero, "É a identidade do pedido nos relatórios — só a administração muda")
            || `<input class="inp" data-m="numero" value="${esc(r.numero || "")}">`, podeEditar("pedProcesso") ? "cuidado: é a identidade do pedido nos relatórios" : "")}
          ${f("Setor", soLeitura(podeEditar("pedProcesso"), r.setor || setorDe(r.processo || op.processo)?.nome || "automático pelo processo")
            || `<select class="sel" data-m="setor"><option value="">— automático pelo processo —</option>${setores().map((st) => `<option ${(r.setor || setorDe(r.processo || op.processo)?.nome) === st.nome ? "selected" : ""}>${esc(st.nome)}</option>`).join("")}</select>`)}
          ${f("Separado em", `<input type="date" class="inp" data-m="separadaEm" value="${r.separadaEm || ""}">`)}
          ${f("Enviado em", `<input type="date" class="inp" data-m="enviadaEm" value="${r.enviadaEm || ""}">`)}
          ${f("Retornado em", `<input type="date" class="inp" data-m="retornadaEm" value="${r.retornadaEm || ""}">`)}
          ${(() => { const atual = normalizarComp(r.mesPagamento, r.retornadaEm);
            const ops = [...new Set([...compsVizinhas(r.retornadaEm || iso(hoje())), atual].filter(Boolean))]
              .sort((a2, b2) => ordemComp(a2) - ordemComp(b2));
            return f("Mês de pagamento", `<select class="sel" data-m="mesPagamento"><option value="">— pelo mês do retorno —</option>${ops.map((c2) =>
              `<option value="${esc(c2)}" ${c2 === atual ? "selected" : ""}>${esc(c2)}${mesFechado(c2) ? " · fechado" : ""}</option>`).join("")}</select>`,
              atual && mesFechado(atual) ? "este pedido está num mês fechado — reabra em Prestadoras para editar" : "em qual fechamento a prestadora recebe"); })()}
          <div class="rowform">
          ${(() => { const cf4 = conferenciaDe(r);
            const temEt = (r.etapas || []).some((e2) => e2.qtd != null);
            return temEt
              ? f("Peças prontas", `<div class="travado" style="cursor:default" title="Sai da última etapa lançada na conferência">${cf4.produzido != null ? n0(cf4.produzido) : "—"}</div>`, "vem da conferência, da última etapa lançada")
              : f("Peças prontas", `<input type="number" class="inp num" data-m="qtdConferida" value="${r.qtdConferida ?? ""}">`, "sem etapas lançadas, o número vem daqui"); })()}
          ${f("Peças com defeito", `<input type="number" class="inp num" data-m="qtdDefeito" min="0" value="${r.qtdDefeito ?? r.qtdSegunda ?? ""}">`, "dentro das conferidas")}
          </div>
        </div>
        ${blocoDestinoPecas(r, f)}
        ${f("Obs. p/ prestadora", `<input class="inp" data-m="obs" value="${esc(r.obs || "")}">`)}
        ${f("Obs. controle interno (MB)", `<input class="inp" data-m="obsInterna" value="${esc(r.obsInterna || "")}">`)}
        ${blocoEmbalagem(r, f)}
        ${blocoEtapasPedido(r, f)}
        <label style="display:flex;gap:9px;align-items:flex-start;font-size:12.5px;line-height:1.6;cursor:pointer;margin-bottom:8px">
          <input type="checkbox" class="chk" data-m="prioridadeTravada" ${r.prioridadeTravada ? "checked" : ""} style="margin-top:2px">
          <span>Travar prioridade — as análises não promovem este pedido</span></label>
        <label style="display:flex;gap:9px;align-items:flex-start;font-size:12.5px;line-height:1.6;cursor:pointer;margin-bottom:14px">
          <input type="checkbox" class="chk" data-m="aguardandoMaterial" ${r.aguardandoMaterial ? "checked" : ""} style="margin-top:2px">
          <span>Aguardando material</span></label>
        <dl class="kv"><dt>Criado em (imutável)</dt><dd>${fdate(r.criadoEm)}</dd>
          <dt>Bloco da necessidade</dt><dd>${esc((S.analises.find((a) => a.id === op.analiseOrigemId) || {}).rotulo || "migração")}</dd></dl>
      </div>
      <div class="modal-f">${(() => {
        /* O que aparece aqui depende do estado do pedido, e só disso:
             ativo     → Cancelar
             cancelado → Reativar · Excluir
           "Excluir" nunca aparece num pedido ativo — é o segundo passo de uma
           decisão que começou no cancelamento. */
        if (pedPodeReativar(r)) return `<button class="btn sm primary" data-act="reativar-pedido">Reativar pedido</button>
          <button class="btn danger sm" data-act="excluir-pedido">Excluir pedido</button>`;
        return `<button class="btn danger sm" data-act="cancelar-pedido">Cancelar pedido</button>
          <button class="btn sm" data-falta="${esc(r.id)}">Falta material</button>`;
      })()}
        <button class="btn" style="margin-left:auto" data-fechar="1">Fechar</button>
        ${pedPodeReativar(r) ? "" : '<button class="btn primary" data-act="salvar-pedido">Salvar</button>'}</div></div></div>`;
  }

  /* -------------------------------------------------------------------------
     CONFIRMAR · uma pergunta, duas saídas, e o perigo do lado que estraga.
     Genérica de propósito: título, texto e o rótulo da ação vêm de quem chama,
     então a próxima ação que precisar de confirmação não inventa outra janela.
     `perigo` pinta o botão da ação; `Voltar` é sempre a saída neutra e é ela
     que fica com o foco, para o Enter distraído não confirmar nada.
     ------------------------------------------------------------------------- */
  /* -------------------------------------------------------------------------
     PARA ONDE ELE VOLTA · só aparece quando o pedido foi cancelado ANTES de o
     sistema passar a guardar o estágio anterior.
     A regra é não inventar: o app mostra o que os registros do pedido dizem, e
     por que dizem isso, e a pessoa escolhe. A sugestão vem pré-marcada; a
     escolha é dela, e fica gravada — a pergunta não volta uma segunda vez.
     ------------------------------------------------------------------------- */
  if (m.tipo === "reativarPedido") {
    const r = m.pedido;
    const sug = m.sugestao || pedEstagioAnterior(r);
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:480px" role="dialog" aria-label="Reativar pedido">
      <div class="modal-h"><h2>Reativar o pedido ${esc(r.numero)}</h2></div>
      <div class="modal-b">
        <p style="margin:0 0 12px;font-size:13.5px;line-height:1.65;color:var(--ink-2)">Este pedido foi cancelado antes de o sistema passar a guardar de qual etapa ele saiu.</p>
        ${sug.porque ? `<div class="aviso" style="margin:0 0 14px">Pelos registros dele — ${esc(sug.porque)} — ele estava em <b>${esc(P_LABEL[sug.status] || sug.status)}</b>.</div>` : ""}
        <label class="lbl" style="display:block;margin-bottom:6px">Para qual etapa ele volta?</label>
        <select class="sel" data-reativar-status style="width:100%">
          ${P_STATUS.map((st) => `<option value="${st}" ${st === sug.status ? "selected" : ""}>${esc(P_LABEL[st])}</option>`).join("")}
        </select>
        <p class="hint" style="margin:10px 0 0">O número, os dados e o histórico do pedido não mudam. Só a etapa.</p>
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Voltar</button>
        <button class="btn primary" data-act="confirmar-reativacao">Reativar pedido</button></div>
    </div></div>`;
  }

  if (m.tipo === "confirmar") {
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:440px" role="dialog" aria-label="${esc(m.titulo || "Confirmar")}">
      <div class="modal-h"><h2>${esc(m.titulo || "Confirmar")}</h2></div>
      <div class="modal-b"><p style="margin:0;font-size:13.5px;line-height:1.65;color:var(--ink-2)">${esc(m.texto || "")}</p>
        ${m.detalhe ? `<div class="aviso" style="margin-top:14px">${m.detalhe}</div>` : ""}</div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1" autofocus>Voltar</button>
        <button class="btn ${m.perigo === false ? "primary" : "danger"}" data-act="confirmar-sim">${esc(m.acao || "Confirmar")}</button></div>
    </div></div>`;
  }

  if (m.tipo === "atalhos") {
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:520px" role="dialog" aria-label="Atalhos do teclado">
      <div class="modal-h"><h2>Atalhos do teclado</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p class="hint" style="margin:0 0 14px">As letras funcionam quando o cursor não está num campo de texto. Durante uma leitura do bipe elas ficam desligadas.</p>
        <dl class="kv" style="border:0;padding:0">
          ${ATALHOS.map(([t2, d2]) => `<dt style="text-align:left"><kbd>${esc(t2)}</kbd></dt><dd style="text-align:left;font-family:inherit;font-weight:500">${esc(d2)}</dd>`).join("")}
        </dl>
      </div>
      <div class="modal-f"><button class="btn primary" style="margin-left:auto" data-fechar="1">Entendi</button></div></div></div>`;
  }

  if (m.tipo === "novoPedido") {
    const skus = S.produtos.slice(0, 4000);
    const novo = !!m.novo;
    const v = m.v || {};
    if (!m.codSugerido) m.codSugerido = proximoCodigoProvisorio().codigo;
    const procs = [...new Set([...S.produtos.map((p) => p.processo), ...(S.cad.estruturas || []).map((e) => e.processo)].filter(Boolean))].sort();
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:560px" role="dialog" aria-label="Novo pedido">
      <div class="modal-h"><h2>Novo pedido de produção</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p class="hint" style="margin:0 0 12px">Cria um pedido direto, sem passar pela análise — para encomendas, reposições avulsas ou produto novo. Ele nasce em <b>${P_LABEL.papel}</b> e entra na fila quando o papel sair da impressora.</p>
        <div class="fb-grupo" style="margin-bottom:15px">
          <button class="chip ${!novo ? "on" : ""}" data-npmodo="existente">Produto já cadastrado</button>
          <button class="chip ${novo ? "on" : ""}" data-npmodo="novo" title="Produto que a fábrica vai produzir antes de existir na loja">Produto novo, ainda sem SKU</button>
        </div>
        ${novo ? `
        <div class="aviso" style="margin:0 0 14px;line-height:1.7">O produto roda com um <b>código provisório</b> até ganhar SKU na Magazord. Depois, em <b>Produtos</b>, você vincula os dois — o histórico de pedidos segue junto e nada do que você preencher aqui é perdido.</div>
        <div class="rowform">
        ${f("Código provisório", `<input class="inp" id="np-cod" value="${esc(v.cod ?? m.codSugerido)}" autocomplete="off">`, "gerado pelo app — troque se preferir um código seu")}
        ${f("Quantidade por pacote", `<input class="inp num" id="np-pac" type="number" min="1" step="1" value="${esc(v.pac ?? 1)}">`)}
        </div>
        ${f("Nome do produto", `<input class="inp" id="np-desc" value="${esc(v.desc ?? "")}" placeholder="ex.: Bandana Xadrez Vermelha G" autocomplete="off">`, "é o que sai no canhoto da prestadora")}
        <div class="rowform">
        ${f("Processo", `<input class="inp" id="np-proc" list="lista-np-proc" value="${esc(v.proc ?? "")}" placeholder="ex.: BANDANA" autocomplete="off"><datalist id="lista-np-proc">${procs.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>`, "define o canhoto, o setor e quem recebe a tarefa")}
        ${f("Fornecedor do material (opcional)", `<input class="inp" id="np-forn" list="lista-np-forn" value="${esc(v.forn ?? "")}" autocomplete="off"><datalist id="lista-np-forn">${(S.cad.fornecedores || []).map((x) => `<option value="${esc(x.nome)}">`).join("")}</datalist>`)}
        </div>
        ${f("O que ainda falta neste produto (opcional)", `<input class="inp" id="np-obsprod" value="${esc(v.obsProd ?? "")}" placeholder="ex.: falta foto e cadastro no site">`)}
        ` : `
        ${f("SKU / código do produto", (() => {
          /* exata primeiro: o navegador respeita a ordem que recebe */
          const ord = ordenarSkusPara(v.sku, skus);
          const exato = ord[0] && String(ord[0].sku).toUpperCase() === String(v.sku || "").trim().toUpperCase();
          return `<input class="inp" id="np-sku" list="lista-np" value="${esc(v.sku ?? "")}" placeholder="digite ou escolha" autocomplete="off"><datalist id="lista-np">${ord.map((p) => `<option value="${esc(p.sku)}">${esc((p.descricao || "").slice(0, 40))}</option>`).join("")}</datalist>`
            + (exato ? `<div class="hint" id="np-sku-exato" style="margin-top:4px">${esc(ord[0].descricao || ord[0].sku)}</div>` : "");
        })(),
          "se o código não existir no cadastro, o produto é criado com pacote 1 para você completar depois")}
        ${(() => {
          /* v8.20 · o processo do SKU aparece na criação, e dá para trocar.
             Antes ele era decidido calado a partir do cadastro do produto. */
          const skuEsc = (v.sku || "").trim().toUpperCase();
          if (!skuEsc || !produtoDe(skuEsc)) return "";
          const pr = processosDoSku(skuEsc);
          const atual = (v.proc || pr.doProduto || "").toUpperCase();
          return f("Processo", `<select class="sel" id="np-proc">`
            + `<option value="">— sem processo —</option>`
            + pr.todos.map((x) => `<option value="${esc(x)}" ${x === atual ? "selected" : ""}>${esc(x)}${x === pr.doProduto ? " · do cadastro" : ""}</option>`).join("")
            + `</select>`,
            pr.perto.length > 1
              ? `este SKU roda em ${pr.perto.length} processos — o do cadastro vem marcado`
              : "define o canhoto, o setor e quem recebe a tarefa");
        })()}
        `}
        <div class="rowform">
        ${f("Quantidade", `<input class="inp num" id="np-qtd" type="number" min="1" placeholder="0" value="${esc(v.qtd ?? "")}">`)}
        ${f("Prioridade", `<select class="sel" id="np-prio"><option value="auto" ${(v.prio ?? "auto") === "auto" ? "selected" : ""}>Automática (pela banda do estoque)</option>${CORTES.map((p) => `<option value="${p}" ${String(v.prio) === String(p) ? "selected" : ""}>${CORTE[p]}</option>`).join("")}</select>`)}
        </div>
        <div class="rowform">
        ${f("Prestadora (opcional)", `<input class="inp" id="np-prest" list="lista-np-prest" value="${esc(v.prest ?? "")}"><datalist id="lista-np-prest">${(S.cad.prestadoras || []).filter((p) => p.ativo !== false).map((p) => `<option value="${esc(p.nome)}">`).join("")}</datalist>`)}
        ${f("Obs. p/ prestadora (opcional)", `<input class="inp" id="np-obs" value="${esc(v.obs ?? "")}" placeholder="vai impressa no papel — ex.: laço duplo">`)}
        </div>
        <div class="rowform">
        ${f("Obs. controle interno (opcional)", `<input class="inp" id="np-obs-int" value="${esc(v.obsInt ?? "")}" placeholder="também sai no papel, como OBS MB">`)}
        </div>
        ${(() => {
          /* ---------- daqui para baixo, os MESMOS blocos da janela de editar ----------
             Não é cópia: são as funções blocoDestinoPecas / blocoEmbalagem /
             blocoEtapasPedido, lendo de um rascunho. Assim o pedido nasce com a
             embalagem, as etapas e o destino das peças já certos — e o papel,
             que sai logo depois, imprime o que ela decidiu, não o padrão.
             Sem produto escolhido não há o que mostrar: processo, etapas e
             embalagem todos dependem dele. */
          const rasc = rascunhoNovoPedido(m);
          if (!rasc.sku || (!m.novo && !produtoDe(rasc.sku))) return "";
          return `<div class="secao" style="margin-top:10px">O que sai no papel</div>
            ${blocoDestinoPecas(rasc, f)}
            ${m.novo ? "" : blocoEmbalagem(rasc, f)}
            ${blocoEtapasPedido(rasc, f)}
            ${f("Responsável", (() => {
              const nomes = [...new Set(S.equipe.filter((pp) => pp.ativo !== false).map((pp) => pp.nome))].sort();
              const sug = (() => { const st = setores().find((s2) => (s2.processos || []).includes(String(rasc.processo || "").toUpperCase()));
                return respDoSetor(st)[0] || padraoResp("destinar", "separar") || ""; })();
              /* `data-sug` diz qual é a sugestão ATUAL — ver `capturarNovoPedido` */
              return `<input class="inp" data-m="responsavel" data-sug="${esc(sug)}" list="lista-resp-np" value="${esc(sug)}" placeholder="Quem cuida deste pedido"><datalist id="lista-resp-np">${nomes.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>`;
            })(), "sugestões vêm da aba Equipe — pode digitar outro nome")}
            <label style="display:flex;gap:9px;align-items:flex-start;font-size:12.5px;line-height:1.6;cursor:pointer;margin-bottom:8px">
              <input type="checkbox" class="chk" data-m="prioridadeTravada" style="margin-top:2px">
              <span>Travar prioridade — as análises não promovem este pedido</span></label>
            <label style="display:flex;gap:9px;align-items:flex-start;font-size:12.5px;line-height:1.6;cursor:pointer;margin-bottom:6px">
              <input type="checkbox" class="chk" data-m="aguardandoMaterial" style="margin-top:2px">
              <span>Aguardando material — nasce travado, esperando a compra chegar</span></label>`;
        })()}
        ${(() => {
          /* O número é o que a fábrica usa para falar do pedido — ela precisa
             saber qual é ANTES de mandar imprimir, não depois. E é editável
             porque o próximo livre nem sempre é o que ela quer.
             v8.75 · a sugestão vem do CONTADOR DO SERVIDOR quando ele
             respondeu; só sem ele é que volta a conta pela lista local.
             v8.83 · o veredito (dica + botão) sai de `npNumVeredito`, a MESMA
             função que a atualização em pé usa — ver `npNumRefrescar`. */
          const vd = npNumVeredito(v.num);
          return `<div class="rowform" style="margin-top:4px">
            ${f("Número do pedido", `<input class="inp mono" id="np-num" data-sug="${esc(vd.sug)}" value="${esc(vd.atual)}" autocomplete="off" style="font-weight:700">`, vd.dica)}
            <div class="fld"><span>&nbsp;</span>
              <button class="btn sm" data-npnum="${esc(vd.sug)}" ${vd.igualAoSugerido ? "disabled" : ""}>Usar o sugerido (${esc(vd.sug)})</button></div>
          </div>`; })()}
        ${(() => { /* PROJETO DE CORTE · a mesma seção do lote, com o SKU que
             está no campo agora. Ela se redesenha junto com o resto da janela
             quando o SKU muda (`repintarDestino`). */
          if (typeof pcSecao !== "function") return "";
          const skuNp = m.novo ? String(v.cod || m.codSugerido || "") : String(v.sku || "");
          try { return pcSecao(skuNp, m.corte, "np"); } catch (e2) { return ""; }
        })()}
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="salvar-novo-pedido">Criar pedido</button></div></div></div>`;
  }

  /* ---------------------------------------------------------------------------
     A FICHA DO PROJETO, POR CIMA DO PEDIDO
     ---------------------------------------------------------------------------
     A MESMA ficha da tela de Processos (`pjcResolvido`), em modo janela: sem o
     "← Voltar" e sem o "Abrir regra", que levariam para outra tela e deixariam
     o rascunho do pedido atrás de uma navegação que ninguém pediu. Quem fecha é
     o Fechar, e o `voltarPara` devolve a janela de baixo inteira.
     --------------------------------------------------------------------------- */
  /* ---------------------------------------------------------------------------
     TROCAR O PROJETO DE CORTE (v8.110) · só para ESTE pedido
     ---------------------------------------------------------------------------
     A lista não é filtrada pelo SKU de propósito: trocar existe justamente para
     usar um projeto que sozinho não casaria com ele. O que casa vem em cima,
     marcado, porque é o caso comum — e o automático de agora aparece com a
     etiqueta, para ninguém escolher achando que está trocando quando não está.
     Escolher aqui NÃO altera regra nenhuma: a decisão vive no rascunho do
     pedido e vira `origem='manual'` no vínculo, depois que ele existir.
     --------------------------------------------------------------------------- */
  if (m.tipo === "trocarProjetoCorte") {
    const sku = String(m.sku || "");
    const e = typeof pcEstadoDoSku === "function" ? pcEstadoDoSku(sku, m.decisao) : {};
    const lista = typeof pjEscolhiveis === "function" ? pjEscolhiveis() : [];
    const casa = (p) => (typeof crtCasa === "function" ? crtCasa(p, sku) : false);
    const ord = lista.slice().sort((a, b) => (casa(b) - casa(a))
      || String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(620px, 96vw)" role="dialog" aria-label="Trocar projeto de corte">
      <div class="modal-h"><h2>Trocar o Projeto de Corte</h2><span class="tag mono">${esc(sku)}</span>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p class="hint" style="margin:0 0 14px">A escolha vale <b>só para este pedido</b>. As regras de família, combinação e exceção do SKU não são alteradas, e nenhum projeto é modificado.</p>
        ${!ord.length ? `<div class="empty" style="padding:30px"><h3>Nenhum projeto publicado</h3>
            <p>Só aparecem aqui projetos ativos e com versão publicada.</p></div>`
        : `<div style="border:1px solid var(--line);border-radius:9px;overflow:hidden">
          ${ord.map((p) => { const atual = e.projetoId === p.id;
            const auto = e.automatico && e.automatico.projetoId === p.id;
            return `<div style="display:flex;gap:9px;align-items:center;padding:9px 12px;border-bottom:1px solid var(--line-2)">
              <div style="flex:1;min-width:0">
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                  <b style="font-size:13px">${esc(p.nome || "sem nome")}</b>
                  <span class="tag">${esc(PJC_NOME && PJC_NOME[p.escopo] ? PJC_NOME[p.escopo] : p.escopo)}</span>
                  ${p.versao && p.versao.versao ? `<span class="tag">v${esc(String(p.versao.versao))}</span>` : ""}
                  ${auto ? `<span class="tag">automático deste SKU</span>` : ""}
                  ${casa(p) && !auto ? `<span class="tag">casa com ${esc(sku)}</span>` : ""}</div>
              </div>
              ${atual ? `<span class="tag ok">em uso</span>`
                : `<button class="btn sm primary" data-pjc-ped="escolher" data-pjc-v="${esc(p.id)}"
                     data-pjc-ctx="${esc(m.ctx || "np")}"${m.gi == null ? "" : ` data-pjc-g="${esc(String(m.gi))}"`}>Usar este</button>`}
            </div>`; }).join("")}</div>`}
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button></div></div></div>`;
  }

  if (m.tipo === "projetoCorte") {
    const sku = String(m.sku || "");
    /* CRIAR é o editor de verdade — o mesmo `pjcFicha` da tela de Processos,
       com o rascunho já preso a este SKU. Um botão "Criar" que abrisse a ficha
       em leitura seria botão morto, e destes o PCP já teve o bastante. */
    const editando = !!(m.criar && typeof pjcFicha === "function" && PJC_VIEW && PJC_VIEW.rascunho);
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(760px, 96vw)" role="dialog" aria-label="Projeto de corte">
      <div class="modal-h"><h2>${editando ? "Novo projeto de corte" : "Projeto de corte"}</h2>
        <span class="tag mono">${esc(sku)}</span>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        ${editando ? `<p class="hint" style="margin:0 0 12px">O pedido que você estava criando continua aí atrás, com tudo o que já foi preenchido — este projeto salva sozinho e você volta para ele.</p>${pjcFicha()}`
          : typeof pjcResolvido === "function" ? pjcResolvido(sku, true)
          : `<div class="hint">A tela de Projeto de corte não está disponível.</div>`}
      </div>
      <div class="modal-f"><button class="btn primary" style="margin-left:auto" data-fechar="1">Voltar ao pedido</button></div></div></div>`;
  }

  if (m.tipo === "papeis") {
    const n = m.qtd;
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:460px" role="dialog" aria-label="Papéis de produção">
      <div class="modal-h"><h2>Papéis de produção</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        ${m.origem === "demanda" ? `<div class="aviso" style="margin:0 0 14px"><b>${n0(n)} ${n === 1 ? "pedido criado" : "pedidos criados"}.</b> Eles só entram na fila de corte quando o papel de produção sai da impressora — gere agora ou encontre-os depois em Pedidos › 1. Papel de Produção.</div>` : ""}
        ${m.origem === "reimpressao" ? `<div class="aviso" style="margin:0 0 14px">Reimpressão: o pedido <b>continua na etapa em que está</b>. Serve para papel perdido, rasgado, ou para padronizar tudo no cupom.</div>` : ""}
        ${(() => { /* Editar sem sair daqui: quem acabou de criar costuma lembrar de
             uma observação ou de trocar a prestadora, e ter de ir até Pedidos para
             isso — e depois voltar — quebra o fluxo. */
          const rs = (m.ids || []).map(pedidoPorId).filter(Boolean);
          if (!rs.length || rs.length > 12) return "";
          return `<div style="margin:0 0 14px;border:1px solid var(--line);border-radius:9px;overflow:hidden">
            ${rs.map((r2) => `<div style="display:flex;align-items:center;gap:9px;padding:7px 11px;border-bottom:1px solid var(--line-2)">
              <span class="sku" style="font-size:12px">${esc(r2.numero)}</span>
              <span style="font-size:11.5px;color:var(--ink-2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(opPorId(r2.opId)?.sku || r2.sku)}</span>
              <span class="tag" style="font-size:10px">${n0(r2.qtd)} pçs</span>
              <button class="btn sm ghost" data-editar-criado="${esc(r2.id)}" title="Ajustar prestadora, observação ou prioridade sem sair daqui">Editar</button>
            </div>`).join("")}</div>`; })()}
        <p class="hint" style="margin:0 0 14px"><b>${n0(n)} ${n === 1 ? "canhoto" : "canhotos"}</b> já ${n === 1 ? "preenchido" : "preenchidos"} com pedido, SKU, descrição, quantidade e o checklist do processo. Só falta a caneta nas conferências.</p>
        ${(() => { const cupom = (S.cfg.formatoPapel || "cupom") === "cupom"; return `
        <label style="display:flex;gap:9px;align-items:flex-start;cursor:pointer;margin-bottom:10px">
          <input type="radio" name="pp-fmt" id="pp-fmt-cupom" ${cupom ? "checked" : ""} style="margin-top:3px">
          <span><b>Cupom 80mm</b> — um canhoto por corte, na impressora térmica.</span></label>
        <div style="margin:0 0 8px 27px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-size:12px;color:var(--ink-2)">Largura do canhoto</span>
          <input type="number" class="inp num" id="pp-larg" min="40" max="78" step="1" style="width:78px"
            value="${Number(S.cfg.larguraCupom) || 68}"> <span style="font-size:12px;color:var(--ink-3)">mm</span>
          <span class="hint" style="margin:0">a bobina de 80mm imprime uns 72mm — 68 deixa folga dos dois lados. Se ainda sair torto, baixe de 2 em 2.</span>
        </div>
        <div style="margin:0 0 12px 27px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-size:12px;color:var(--ink-2)">Altura da página</span>
          <input type="number" class="inp num" id="pp-alt" min="100" max="400" step="10" style="width:78px"
            value="${Number(S.cfg.alturaCupom) || 200}"> <span style="font-size:12px;color:var(--ink-3)">mm</span>
          <span class="hint" style="margin:0">é o pedaço de papel que cada canhoto ocupa antes do corte. <b>Canhoto saindo partido ao meio?</b> aumente. <b>Sobrando papel em branco antes do corte?</b> diminua.</span>
        </div>
        <div style="margin:0 0 12px 27px">
          <label style="display:flex;gap:9px;align-items:flex-start;cursor:pointer">
            <input type="checkbox" class="chk" id="pp-corta" ${S.cfg.cortarPorPedido !== false ? "checked" : ""} style="margin-top:2px">
            <span><b>Cortar entre um pedido e outro</b> <span style="color:var(--ink-3)">— manda cada canhoto como uma página separada, para a impressora cortar no lugar certo.</span></span></label>
          <label style="display:flex;gap:9px;align-items:flex-start;cursor:pointer;margin-top:7px">
            <input type="checkbox" class="chk" id="pp-marca" ${S.cfg.marcaCorte ? "checked" : ""} style="margin-top:2px">
            <span><b>Imprimir a linha de rasgar</b> <span style="color:var(--ink-3)">— a tesourinha pontilhada entre os canhotos, para quando a impressora não corta sozinha.</span></span></label>
          <div class="hint" style="margin-top:9px;line-height:1.65">
            O navegador <b>não consegue</b> mandar a guilhotina cortar — quem corta é o driver da impressora.
            O que o app faz é entregar <b>cada pedido como uma página</b>. Para a térmica cortar entre eles, o driver dela precisa estar em
            <b>Corte de papel: Por página</b>.</div>
          ${porque("Onde mudar isso no Windows", `
            <div><b>Painel de Controle › Dispositivos e Impressoras</b> › botão direito na térmica › <b>Preferências de impressão</b> › procure <b>Corte de papel</b> (ou <i>Paper Cut</i>, <i>Cutter</i>) e escolha <b>Por página</b> (<i>After each page</i> / <i>Cut per page</i>).</div>
            <div>Se lá só existir <b>No fim do documento</b>, ela corta uma vez só no fim — nesse caso marque <b>Imprimir a linha de rasgar</b> aqui em cima.</div>
            <div>Na janela de impressão do navegador, deixe as <b>margens em Nenhuma</b> e <b>desmarque</b> cabeçalhos e rodapés: eles empurram o conteúdo e fazem sobrar papel entre um canhoto e outro.</div>`)}
        </div>
        <label style="display:flex;gap:9px;align-items:flex-start;cursor:pointer">
          <input type="radio" name="pp-fmt" id="pp-fmt-a4" ${cupom ? "" : "checked"} style="margin-top:3px">
          <span><b>Folha A4</b> — 6 canhotos por página, para recortar.</span></label>`; })()}
        ${m.nPapel ? `<label style="display:flex;gap:9px;align-items:flex-start;cursor:pointer;margin-top:14px;padding-top:12px;border-top:1px solid var(--line-2)">
          <input type="checkbox" class="chk" id="pp-avancar" checked style="margin-top:2px">
          <span>Depois de gerar, <b>avançar ${m.nPapel === 1 ? "este pedido" : `os ${n0(m.nPapel)} pedidos`} de "${P_LABEL.papel}" para "${P_LABEL.aberto}"</b> — eles entram na fila de corte.</span></label>` : ""}
        <p class="hint" style="margin-top:12px">Na janela que abrir, escolha a impressora — ou "Salvar como PDF" para mandar por WhatsApp.</p>
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="gerar-papeis">Gerar</button></div></div></div>`;
  }

  /* v8.30 · A JANELA DE CONFLITO DE DADO
     Não existe mais janela de "seção inteira", e não existe mais botão que
     grava a minha versão por cima da dela. Tudo o que dava para juntar já foi
     juntado antes de chegar aqui — o que sobra é o dado exato em briga, com
     nome e os dois valores, e a escolha é UMA A UMA. */
  /* v8.35 · CONFERÊNCIA DO LOTE ANTES DE LIMPAR NECESSIDADES
     Uma pergunta só, com os números contados pelo SERVIDOR — não um popup por
     OP. Quem some fisicamente é só o que nunca foi usado; o resto é cancelado
     e continua no histórico, e isso está dito na cara da pessoa. */
  if (m.tipo === "limpezaOps") {
    const p = m.previa || {};
    const n = (x) => n0(Number(x) || 0);
    const linha = (rot, v, cor) => Number(v) ? `<tr><td>${rot}</td>
      <td class="num"${cor ? ` style="color:${cor}"` : ""}><b>${n(v)}</b></td></tr>` : "";
    return `<div class="ov"><div class="modal" style="max-width:min(560px, 96vw)" role="dialog" aria-label="Confirmar limpeza de necessidades">
      <div class="modal-h"><h2 style="display:inline-flex;align-items:center;gap:9px">${svg(IC.alerta)}Tirar ${n(p.total)} ${Number(p.total) === 1 ? "necessidade" : "necessidades"} da operação</h2></div>
      <div class="modal-b">
        <table class="t" style="font-size:13px"><tbody>
          ${linha("Necessidades atingidas", p.total)}
          ${linha("Vão ser canceladas", p.a_cancelar, "var(--amber)")}
          ${linha("Têm pedidos ligados", p.com_pedidos)}
          ${linha("Vieram de uma análise", p.com_analise)}
          ${linha("Já estavam canceladas", p.ja_canceladas)}
          ${linha("Vão ser apagadas de vez", p.apagaveis, "var(--red)")}
          ${linha("Não foram encontradas", p.nao_encontradas)}
        </tbody></table>
        <div class="aviso" style="margin:14px 0 0;border-color:var(--amber)">
          <b>Necessidade que já foi usada NÃO é apagada.</b> Ela é cancelada: sai da fila,
          mas continua no histórico, com os pedidos dela ligados — senão o que já foi
          produzido ficaria sem dono.
        </div>
        ${Number(p.apagaveis) ? `<p class="hint" style="margin:10px 0 0">As ${n(p.apagaveis)} apagadas de vez
        são as que nasceram e nunca foram usadas: sem pedido, sem análise e sem alteração nenhuma.</p>` : ""}
      </div>
      <div class="modal-f">
        <button class="btn" data-act="limpeza-ops-cancelar">Cancelar</button>
        <button class="btn primary" data-act="limpeza-ops-confirmar">Confirmar</button>
      </div></div></div>`;
  }

  if (m.tipo === "conflitoDados") {
    const itens = m.itens || [];
    const valor = (v) => v === undefined ? "—"
      : typeof v === "object" ? esc(JSON.stringify(v).slice(0, 120)) : esc(String(v));
    const rotulo = (it) => {
      const nome = SECAO_NOME[it.sec] || it.sec;
      return it.lista && it.lista !== "(a seção)" ? `${nome} · ${it.lista}` : nome;
    };
    return `<div class="ov"><div class="modal" style="max-width:min(680px, 96vw)" role="dialog" aria-label="Dado em conflito">
      <div class="modal-h"><h2 style="display:inline-flex;align-items:center;gap:9px">${svg(IC.alerta)}${itens.length === 1 ? "Um dado" : `${itens.length} dados`} em conflito</h2></div>
      <div class="modal-b">
        <div class="aviso" style="margin:0 0 14px;border-color:var(--amber)">
          <b>Nada foi gravado por cima.</b> Tudo o que dava para juntar já foi juntado —
          o que está aqui embaixo é o que as duas mexeram ao mesmo tempo, e só isso.
        </div>
        <table class="t" style="font-size:12.5px"><thead><tr>
          <th>O quê</th><th>No servidor</th><th>Na sua tela</th><th></th></tr></thead>
        <tbody>${itens.map((it, i) => `<tr>
          <td><b>${esc(String(it.chave))}</b><div class="hint">${esc(rotulo(it))}</div></td>
          <td class="num">${valor(it.dele)}</td>
          <td class="num" style="color:var(--teal)">${valor(it.meu)}</td>
          <td style="white-space:nowrap">
            <button class="btn sm" data-act="conflito-dado-servidor" data-i="${i}">Ficar com a dela</button>
            <button class="btn sm primary" data-act="conflito-dado-meu" data-i="${i}">Ficar com o meu</button>
          </td></tr>`).join("")}</tbody></table>
        <p class="hint" style="margin:12px 0 0">Escolher aqui não apaga mais nada:
        cada linha é um dado só, e o resto das duas versões já está guardado.</p>
      </div>
      <div class="modal-f">
        <button class="btn" data-act="conflito-recarregar">${svg(IC.atualizar)}Recarregar do servidor</button>
      </div></div></div>`;
  }

  if (m.tipo === "conflito") {
    const r = m.pedido, sv = m.briga.servidor;
    const linha = (rot, meu, dele, fmt = (v) => v == null || v === "" ? "—" : String(v)) => {
      const dif = JSON.stringify(meu) !== JSON.stringify(dele);
      return `<tr${dif ? ' style="background:var(--amber-soft)"' : ""}>
        <td style="color:var(--ink-3);font-size:12px">${rot}</td>
        <td class="num"${dif ? ' style="font-weight:800"' : ""}>${esc(fmt(dele))}</td>
        <td class="num"${dif ? ' style="font-weight:800;color:var(--teal)"' : ""}>${esc(fmt(meu))}</td></tr>`; };
    const etp = (x) => (x.etapas || []).filter((e) => e.qtd != null).map((e) => `${e.nome} ${n0(e.qtd)}`).join(" · ") || "—";
    return `<div class="ov"><div class="modal" style="max-width:min(680px, 96vw)" role="dialog" aria-label="Conflito de edição">
      <div class="modal-h"><h2>Outra pessoa mexeu neste pedido</h2><span class="tag">${esc(r.numero)}</span></div>
      <div class="modal-b">
        <p style="margin:0 0 14px;font-size:13.5px"><b>${esc(m.briga.por || "Outra pessoa")}</b> salvou o pedido ${esc(r.numero)} em ${fdataHora(m.briga.em)}, enquanto esta tela estava aberta. Nada foi gravado — as duas versões estão aqui para você decidir.</p>
        <table class="t" style="font-size:12.5px"><thead><tr><th></th><th class="num">No servidor<br><span style="font-weight:400;font-size:10px;color:var(--ink-3)">${esc(m.briga.por || "outra pessoa")}</span></th><th class="num">Na sua tela</th></tr></thead>
        <tbody>
          ${linha("Etapa", P_LABEL[r.status], P_LABEL[sv.status])}
          ${linha("Prestadora", r.prestadora, sv.prestadora)}
          ${linha("Quantidade enviada", r.qtd, sv.qtd, n0)}
          ${linha("Peças que voltaram", r.qtdConferida, sv.qtdConferida, (v) => v == null ? "—" : n0(v))}
          ${linha("Peças com defeito", defeitoDe(r), sv.qtdDefeito ?? sv.qtdSegunda, (v) => v == null ? "—" : n0(v))}
          ${linha("Quantidades por etapa", etp(r), etp(sv))}
          ${linha("Data do retorno", r.retornadaEm, sv.retornadaEm, (v) => v ? fdate(v) : "—")}
          ${linha("Mês de pagamento", r.mesPagamento, sv.mesPagamento)}
        </tbody></table>
        <div class="aviso" style="margin-top:14px">Se os números forem diferentes, confira o papel antes de escolher — não dá para saber qual está certo pelo app.</div>
      </div>
      <div class="modal-f">
        <button class="btn" data-act="conflito-ficar-servidor">Ficar com a versão de ${esc(String(m.briga.por || "outra pessoa").split(/\\s+/)[0])}</button>
        <button class="btn primary" style="margin-left:auto" data-act="conflito-usar-meu">Gravar a minha por cima</button></div></div></div>`;
  }

  if (m.tipo === "furaFila") {
    const r = m.pedido;
    const sku = opPorId(r.opId)?.sku || r.sku;
    const p2 = produtoDe(sku);
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(680px, 96vw)" role="dialog" aria-label="Pedido mais antigo esperando">
      <div class="modal-h"><h2>Tem pedido mais antigo esperando</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p style="margin:0 0 12px;font-size:13.5px">Você está enviando o <b>${esc(r.numero)}</b>${r.prestadora ? ` para <b>${esc(r.prestadora)}</b>` : ""} — ${n0(r.qtd)} peças de <span class="sku">${esc(sku || "—")}</span>${p2?.descricao ? ` · ${esc(p2.descricao.slice(0, 40))}` : ""}.</p>
        <p style="margin:0 0 10px;font-size:13.5px">Deste mesmo produto, ${m.atras.length === 1 ? "há um pedido mais antigo" : `há ${n0(m.atras.length)} pedidos mais antigos`} que ainda não ${m.atras.length === 1 ? "saiu" : "saíram"}:</p>
        <table class="t" style="font-size:12.5px"><tbody>${m.atras.slice(0, 8).map((x) => `<tr>
          <td class="sku">${esc(x.numero)}</td><td>${corteCurto(x.prioridade)}</td>
          <td class="num">${n0(x.qtd)} pçs</td><td><span class="tag">${P_LABEL[x.status]}</span></td>
          <td style="font-size:11px;color:var(--ink-3)">parado há ${n0(Math.max(0, dias(pdate(x.criadoEm) || hoje(), hoje())))}d</td></tr>`).join("")}</tbody></table>
        ${m.atras.length > 8 ? `<p class="hint" style="margin-top:6px">e mais ${n0(m.atras.length - 8)}…</p>` : ""}
        <div class="aviso" style="margin-top:14px">Se o mais novo sair primeiro, a fita antiga encalha e volta depois da nova — e é aí que dá erro na produção. Se for por decisão sua (urgência combinada, material que só chegou agora), pode seguir.</div>
      </div>
      <div class="modal-f">
        <button class="btn" data-act="enviar-o-antigo">Enviar o ${esc(m.atras[0].numero)} no lugar</button>
        <button class="btn ghost" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="enviar-mesmo-assim">Enviar o ${esc(r.numero)} assim mesmo</button></div></div></div>`;
  }

  if (m.tipo === "etapasPedido") {
    const r = m.pedido;
    const estr = estruturaDe(r.processo || produtoDe(opPorId(r.opId)?.sku || r.sku)?.processo);
    const todas = estr?.etapas || [];
    const sel = new Set((m.sel || []).map((x) => String(x).toUpperCase()));
    const irmaos = (indiceIrmaos().get(RAIZ_PEDIDO(r.numero)) || []).filter((x) => x.id !== r.id);
    const feitoPor = new Map();
    for (const ir of irmaos) for (const e of (ir.etapas || []))
      if (Number(e.qtd) > 0) feitoPor.set(String(e.nome).toUpperCase(), ir);
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:520px" role="dialog" aria-label="Etapas do pedido">
      <div class="modal-h"><h2>Etapas do pedido ${esc(r.numero)}</h2><span class="tag">${esc(r.prestadora || "sem prestadora")}</span>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        ${(() => { const sku2 = opPorId(r.opId)?.sku || r.sku; const pr2 = produtoDe(sku2);
          return `<div style="display:flex;gap:11px;align-items:flex-start;padding:11px 13px;border:1px solid var(--line);border-radius:9px;margin-bottom:14px;background:var(--surface-2)">
            ${pr2?.foto ? `<img src="${esc(pr2.foto)}" alt="" style="width:46px;height:46px;object-fit:cover;border-radius:7px;flex:0 0 auto" onerror="this.remove()">` : ""}
            <div style="flex:1;min-width:0">
              <div class="sku" style="font-size:13.5px;font-weight:800">${esc(sku2 || "SKU não informado")}</div>
              ${pr2?.descricao ? `<div style="font-size:12px;color:var(--ink-2);margin-top:2px">${esc(pr2.descricao.slice(0, 60))}</div>` : ""}
              <div style="font-size:11.5px;color:var(--ink-3);margin-top:3px">${esc(r.processo || pr2?.processo || "processo não definido")} · ${n0(r.qtd)} peças enviadas${r.enviadaEm ? ` em ${fdate(r.enviadaEm)}` : ""}</div>
            </div></div>`; })()}
        <p class="hint" style="margin:0 0 14px">Marque só o que <b>esta prestadora</b> faz neste pedido. Quando o trabalho é dividido — uma faz a máquina, outra faz cola e embalagem — cada pedido responde pela sua parte, e o app para de cobrar as etapas da outra.</p>
        ${todas.length ? todas.map((et) => { const nome = String(et.nome).toUpperCase(); const ir = feitoPor.get(nome);
          return `<label style="display:flex;gap:10px;align-items:center;padding:9px 11px;border:1px solid var(--line);border-radius:9px;margin-bottom:7px;cursor:pointer">
            <input type="checkbox" class="chk" data-etp="${esc(nome)}" ${sel.has(nome) ? "checked" : ""}>
            <span style="flex:1"><b>${esc(nome)}</b>${et.valor ? ` <span style="color:var(--ink-3);font-size:12px">${fmoeda(et.valor)}/peça</span>` : ""}</span>
            ${ir ? `<span class="tag" title="já lançada na continuação">feita no ${esc(ir.numero)}${ir.prestadora ? ` · ${esc(ir.prestadora)}` : ""}</span>` : ""}</label>`; }).join("")
          : `<div class="aviso">O processo <b>${esc(r.processo || "—")}</b> não tem estrutura cadastrada. Cadastre em Prestadoras › Estruturas de processo antes.</div>`}
        ${irmaos.length ? `<p class="hint" style="margin-top:12px">Continuações deste pedido: ${irmaos.map((x) => `<b>${esc(x.numero)}</b>${x.prestadora ? ` (${esc(x.prestadora)})` : ""}`).join(" · ")}.</p>` : ""}
      </div>
      <div class="modal-f">
        <button class="btn ghost" data-act="etapas-todas">Marcar todas</button>
        <button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="salvar-etapas-pedido">Salvar</button></div></div></div>`;
  }

  if (m.tipo === "recados") {
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(780px, 96vw)" role="dialog" aria-label="Recados para as prestadoras">
      <div class="modal-h"><h2>Avisar as prestadoras</h2><span class="tag">${n0(m.grupos.length)} ${m.grupos.length === 1 ? "prestadora" : "prestadoras"}</span>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p class="hint" style="margin:0 0 14px">Estes pedidos já estão na mão delas, então a nova prioridade só vale se alguém avisar. Copie o recado, mande no WhatsApp e marque como avisada — aí o pedido sai desta lista.</p>
        ${m.grupos.map(([nome, lista], i) => { const sobe = lista.filter((r) => r.avisar?.sentido === "subiu").length;
          const desce = lista.length - sobe;
          return `<div style="border:1px solid var(--line);border-radius:11px;padding:12px 14px;margin-bottom:11px">
            <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">
              <b style="font-size:14px">${esc(nome)}</b>
              ${sobe ? `<span class="tag atencao">${n0(sobe)} para priorizar</span>` : ""}
              ${desce ? `<span class="tag">${n0(desce)} pode esperar</span>` : ""}
              <span style="margin-left:auto;display:flex;gap:7px">
                <button class="btn sm" data-act="copiar-recado" data-idx="${i}">Copiar recado</button>
                <button class="btn sm primary" data-act="recado-feito" data-idx="${i}">Já avisei</button></span>
            </div>
            <pre style="margin:0;white-space:pre-wrap;font:inherit;font-size:12.5px;line-height:1.65;color:var(--ink-2);background:var(--surface-2);border-radius:8px;padding:10px 12px">${esc(textoRecado(nome, lista))}</pre>
          </div>`; }).join("")}
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Fechar</button></div></div></div>`;
  }

  return null;
}

/* janelas de produtos, prestadoras e equipe */
function modaisCadastro(m) {
  /* ---------- revisar o estoque mínimo, um produto por vez ----------
     A pergunta é sempre a mesma: o número do ERP ainda descreve o que este
     produto vende? A tela junta tudo que ajuda a responder e deixa três saídas
     honestas — aceitar a sugestão, manter o do ERP, ou digitar o seu número. */
  if (m.tipo === "revisarMin") {
    const c = S.calc;
    if (!c) return "";
    const pulados = m.pulados || (m.pulados = []);
    const fila = c.minRevisar.filter((x) => !pulados.includes(x.sku));
    const l = (m.sku && c.porSku.get(m.sku)) || fila[0] || null;
    const pend = (c.minAEnviar || []).length;
    const jaFoi = (c.minEnviados || []).length;
    const rodape = `<div class="modal-f">
      ${pend ? `<span class="tag amber">${n0(pend)} ${pend === 1 ? "mínimo esperando" : "mínimos esperando"} você levar para a Magazord</span>
        <button class="btn sm" data-act="exportar-minimos" title="Planilha com SKU, mínimo antigo e mínimo novo — para aplicar no ERP">${svg(IC.dados)}Exportar lista</button>`
        : jaFoi ? `<span class="tag">${n0(jaFoi)} já ${jaFoi === 1 ? "foi" : "foram"} no arquivo, esperando a Magazord confirmar</span>`
        : `<span style="font-size:12.5px;color:var(--ink-3)">Nenhum ajuste aguardando a Magazord.</span>`}
      <button class="btn" style="margin-left:auto" data-fechar="1">Fechar</button></div>`;

    if (!l) return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(760px,96vw)" role="dialog" aria-label="Revisar mínimos">
      <div class="modal-h"><h2>Revisar estoque mínimo</h2><button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b"><div class="empty" style="padding:34px 10px"><div class="ic">${svg(IC.ok)}</div>
        <h3 style="margin:10px 0 0">${pulados.length ? "Fila vazia por agora" : "Nenhum mínimo para revisar"}</h3>
        <p style="max-width:430px;margin:8px auto 0;line-height:1.7;color:var(--ink-3)">${pulados.length
          ? `Você pulou ${n0(pulados.length)} ${pulados.length === 1 ? "produto" : "produtos"} nesta rodada — eles continuam na fila para a próxima vez.`
          : `Nenhum produto com o mínimo divergindo mais de ${Math.round(TOL_MIN * 100)}% do que as vendas sugerem.`}</p>
        ${pulados.length ? `<button class="btn sm" style="margin-top:16px" data-act="min-despular">Rever os ${n0(pulados.length)} pulados</button>` : ""}
      </div></div>${rodape}</div></div>`;

    const sug = l.estMinCalc, atual = l.estMin;
    const dif = atual > 0 ? (sug - atual) / atual : null;
    const sobe = sug > atual;
    const total = c.minRevisar.length, restam = fila.length;
    const feitos = Math.max(0, total - restam);
    const tend = tendenciaVendas(l.sku), dz = diasAteZerar(l);
    const nec = (min) => l.estoqueReal >= min ? 0 : Math.round((min - l.estoqueReal) * (l.qtdPacote || 1));
    const vivos = (l.pedidosAbertos || []).length;
    const caixa = (rot, val, sub, cor, borda) => `<div style="flex:1;min-width:150px;border:1.5px solid ${borda};border-radius:11px;padding:13px 14px;background:${borda === "var(--line)" ? "var(--surface-2)" : "transparent"}">
      <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);font-weight:700">${rot}</div>
      <div class="mono" style="font-size:27px;font-weight:800;line-height:1.15;margin:5px 0 2px;color:${cor}">${n0(val)}</div>
      <div style="font-size:11.5px;color:var(--ink-3);line-height:1.5">${sub}</div></div>`;

    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(760px,96vw)" role="dialog" aria-label="Revisar mínimos">
      <div class="modal-h"><h2>Revisar estoque mínimo</h2>
        <span class="tag" style="margin-left:10px">${n0(feitos + 1)} de ${n0(total)}</span>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px">
          <span class="abc ${l.abc}">${l.abc}</span>
          <span class="sku" style="font-size:13px">${esc(l.sku)}</span>
          <span class="tag dot ${CORCLASSE[l.classe]}">${l.classe}</span>
          ${l.processo ? `<span class="tag">${esc(l.processo)}</span>` : ""}
        </div>
        <p style="margin:2px 0 15px;font-size:13px;color:var(--ink-2)">${esc(l.descricao || "")}</p>

        <div style="display:flex;gap:12px;flex-wrap:wrap">
          ${caixa("Mínimo hoje", atual, l.minAjuste ? `ajustado aqui · ERP tem ${n0(l.estMinErp)}` : "vindo da Magazord", "var(--ink)", "var(--line)")}
          ${caixa("Sugerido pelas vendas", sug, dif == null ? "&nbsp;" : `${sobe ? "▲" : "▼"} ${Math.abs(Math.round(dif * 100))}% ${sobe ? "acima" : "abaixo"} do atual`, sobe ? "var(--red)" : "var(--teal)", sobe ? "var(--coral)" : "var(--teal2)")}
        </div>

        <div class="secao">De onde sai a sugestão</div>
        <p style="margin:0;font-size:12.5px;color:var(--ink-2);line-height:1.75">
          ${n0(l.vendas)} peças vendidas em ${Math.round(c.diasPeriodo)} dias
          (${(l.vendas / Math.max(1, c.mesesPeriodo)).toFixed(0)}/mês) × <b>${nMeses(l.mesesSeg)} ${l.mesesSeg === 1 ? "mês" : "meses"}</b> de segurança
          = <b>${n0(sug)}</b>.${l.qtdPacote > 1 ? ` O produto sai em pacote de ${n0(l.qtdPacote)}.` : ""}
          <br><span style="color:var(--ink-3)">${l.regraMeses
            ? `Regra do processo <b>${esc(l.regraMeses)}</b> para a curva ${l.abc} — o padrão da casa (${nMeses(S.cfg.mesesEstoqueSeguranca)}) não se aplica aqui.`
            : l.externo ? `Padrão da casa (${nMeses(S.cfg.mesesEstoqueSeguranca)}) + 1 mês porque o fornecimento é externo.`
            : `Padrão da casa, sem exceção para este processo.`}</span>
        </p>

        <div class="secao">O que muda na prática</div>
        <dl class="kv">
          <dt>Estoque real</dt><dd>${n0(l.estoqueReal)}${dz != null ? ` · zera em ~${n0(dz)} dias no ritmo atual` : ""}</dd>
          <dt>Vendas no período</dt><dd>${n0(l.vendas)}${tend != null ? ` · tendência ${tend >= 0 ? "+" : ""}${tend}%` : ""}</dd>
          <dt>Cobertura x prazo de produção</dt><dd>${l.cobertura >= 999 ? "sem venda" : `${Math.round(l.cobertura)} dias de estoque · produzir leva ${Math.round(l.lead)}`}</dd>
          <dt>Pedidos vivos deste SKU</dt><dd>${vivos ? `${n0(vivos)} · ${n0(l.qtdProgramada)} peças em produção` : "nenhum"}</dd>
          <dt>Falta programar com <b>${n0(atual)}</b></dt><dd>${n0(Math.max(0, nec(atual) - l.qtdProgramada))} peças</dd>
          <dt>Falta programar com <b>${n0(sug)}</b></dt><dd style="color:${sobe ? "var(--red)" : "var(--teal)"};font-weight:700">${n0(Math.max(0, nec(sug) - l.qtdProgramada))} peças</dd>
        </dl>
      </div>
      <div class="modal-f" style="flex-wrap:wrap">
        <button class="btn primary" data-min-aceitar="${esc(l.sku)}">Aceitar ${n0(sug)}</button>
        <button class="btn" data-min-manter="${esc(l.sku)}" title="Mantém o número atual e tira este produto da fila até o ERP ou a sugestão mudarem">Manter ${n0(atual)}</button>
        <span class="divider"></span>
        <input class="inp" id="min-outro" type="number" min="0" step="1" style="width:96px" placeholder="outro" aria-label="Outro valor de mínimo">
        <button class="btn" data-min-outro="${esc(l.sku)}">Usar este</button>
        <button class="btn ghost" style="margin-left:auto" data-min-pular="${esc(l.sku)}">Pular ${restam > 1 ? `· faltam ${n0(restam - 1)}` : ""}</button>
      </div>
      ${rodape}</div></div>`;
  }

  if (m.tipo === "produto") {
    const p = m.produto, novo = m.novo;
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:720px" role="dialog" aria-label="Produto">
      <div class="modal-h"><h2>${novo ? "Novo produto" : "Editar produto"}</h2>${novo ? "" : `<span class="tag">${esc(p.sku)}</span>`}
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <div style="display:flex;gap:18px;align-items:flex-start;margin-bottom:6px">
          <div style="width:130px;flex:0 0 130px">${p.foto ? `<img class="foto-lg" src="${esc(p.foto)}" alt="" onerror="this.style.display='none'">` : `<div class="foto-lg" style="display:grid;place-items:center;color:var(--ink-4);font-size:11.5px">sem foto</div>`}</div>
          <div style="flex:1;min-width:0">
            <div class="rowform">
              ${f("SKU", novo || podeEditar("prodProcesso") ? `<input class="inp sku" data-p="sku" value="${esc(p.sku || "")}" ${novo ? "" : "readonly"}>` : soLeitura(false, p.sku, "O SKU é a identidade do produto"))}
              ${f("Peças por pacote", `<input type="number" class="inp num" data-p="qtdPacote" value="${p.qtdPacote ?? ""}">`)}
            </div>
            ${f("Descrição", `<input class="inp" data-p="descricao" value="${esc(p.descricao || "")}">`)}
            <div class="rowform">
              ${f("Categoria", `<input class="inp" data-p="categoria" value="${esc(p.categoria || "")}">`)}
              ${f("Processo", soLeitura(podeEditar("prodProcesso"), p.processo, "O processo decide as etapas e o pagamento — só a administração muda")
                || `<input class="inp" data-p="processo" list="lista-proc" value="${esc(p.processo || "")}"><datalist id="lista-proc">${(S.cad.estruturas || []).map((e) => `<option value="${esc(e.processo)}">`).join("")}</datalist>`)}
            </div>
            <div class="rowform">
              ${f("Derivação", `<input class="inp" data-p="derivacao" value="${esc(p.derivacao || "")}">`)}
              ${f("Fornecimento", `<select class="sel" data-p="fornecimento"><option value="">Interno</option><option ${p.fornecimento === "Externo" ? "selected" : ""}>Externo</option></select>`)}
            </div>
          </div>
        </div>
        ${p.revisarProducao ? `<div class="aviso" style="margin:0 0 12px;padding:9px 12px">${svg(IC.alerta)} <b>O SKU deste produto mudou</b>${(p.skusAnteriores || []).length ? ` (antes: ${esc(p.skusAnteriores[p.skusAnteriores.length - 1].sku)})` : ""} — confira se a embalagem e as instruções abaixo continuam valendo. Salvar limpa este aviso.</div>` : ""}
        <div class="secao" style="margin-top:4px">Produção interna <span class="hint" style="font-weight:400;text-transform:none;letter-spacing:0">· a importação da Magazord nunca altera estes campos · saem impressos no papel</span></div>
        ${camposEmbalagem(p, f)}
        ${(() => { const es = estruturaDe(p.processo); if (!es || (es.etapas || []).length < 2) return "";
          const escolha = Array.isArray(p.etapasUsadas) && p.etapasUsadas.length ? p.etapasUsadas.map((e2) => String(e2).toUpperCase()) : null;
          /* isto é o padrão de TODO pedido novo do SKU — não confundir com as
             etapas de um pedido, que são a decisão do dia e ficam liberadas */
          const livreEt = podeEditar("prodEtapas");
          return `<div class="fld" style="margin-bottom:14px"><span>Etapas deste SKU (padrão dos pedidos novos — saem no papel e na conferência)${livreEt ? "" : ` ${svg(IC.cadeado)}`}</span>
            <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:6px">${es.etapas.map((et) => { const nome = String(et.nome).toUpperCase();
              const on = !escolha ? true : escolha.includes(nome) || /EMBALA/.test(nome);
              return livreEt
                ? `<label class="chip ${on ? "on" : ""}" style="cursor:pointer"><input type="checkbox" class="chk" data-prod-et value="${esc(nome)}" ${on ? "checked" : ""} style="margin-right:5px">${esc(nome)}</label>`
                : `<span class="chip ${on ? "on" : ""}" style="opacity:${on ? "1" : ".45"}">${esc(nome)}</span>`; }).join("")}</div>
            ${livreEt ? "" : `<div class="hint" style="margin-top:6px">O padrão do SKU é definido pela administração — as etapas de <b>cada pedido</b> você muda normalmente, na janela do pedido.</div>`}</div>`; })()}
        <div class="rowform">
          ${f("Fornecedor", (() => {
            const fs2 = S.cad.fornecedores || [];
            const atual = p.producao?.fornecedorId || "";
            return `<select class="sel" data-pp="fornecedorId"><option value="">— não definido —</option>${fs2.map((f2) => `<option value="${esc(f2.id)}" ${atual === f2.id ? "selected" : ""}>${esc(f2.nome)}${f2.prazoDias ? ` (~${f2.prazoDias}d)` : ""}</option>`).join("")}<option value="__novo">＋ cadastrar novo fornecedor…</option></select>`; })())}
          <div></div>
        </div>
        ${(() => { /* ---------- os insumos deste produto ----------
            A receita mora no processo: são ~1.700 SKUs contra uma dúzia de
            processos, e a diferença entre uma bandana azul e uma vermelha quase
            nunca está no que ela consome. Aqui é a exceção — quando ESTE produto
            consome outra coisa, ele passa a mandar. Enquanto isso não acontece,
            a pessoa vê exatamente o que ele consome hoje, sem campo nenhum. */
          const lista = insumos().filter((x) => x.ativo !== false);
          const cabec = `<div class="secao">Insumos deste produto <span class="hint" style="font-weight:400;text-transform:none;letter-spacing:0">· o que UMA peça consome</span></div>`;
          if (!lista.length) return `${cabec}<p class="hint" style="margin:0 0 14px">Cadastre os insumos primeiro, na aba <b>Insumos</b>. Com eles vinculados aqui, um pedido reserva o material assim que nasce e dá baixa quando é conferido.</p>`;
          if (m.receitaProd === undefined) m.receitaProd = Array.isArray(p.receita) && p.receita.length ? p.receita.map((x) => ({ ...x })) : null;
          const doProc = receitaDoProcesso(p.processo);
          const itensProc = (doProc?.itens || []).filter((x) => x.insumoId);
          const custoDe = (itens) => itens.filter((x) => x.insumoId && x.qtd).reduce((s2, x) => {
            const cu = custoInsumo(x.insumoId); return s2 + (cu ? cu.medio * Number(x.qtd) : 0); }, 0);

          if (!Array.isArray(m.receitaProd)) return `${cabec}
            ${itensProc.length ? `<p class="hint" style="margin:0 0 9px">Ele segue a receita do processo <b>${esc(doProc.processo)}</b> — mudou lá, muda aqui também. É quase sempre o que você quer.</p>
              <table class="t" style="font-size:12.5px"><thead><tr><th>Insumo</th><th class="num" style="width:110px">Por peça</th><th style="width:80px">Unidade</th></tr></thead>
              <tbody>${itensProc.map((it) => { const ins = insumoPorId(it.insumoId);
                return `<tr><td>${esc(ins?.nome || "insumo apagado")}</td><td class="num mono">${nDec(it.qtd)}</td>
                <td style="font-size:11.5px;color:var(--ink-3)">${esc(ins?.unidade || "—")}</td></tr>`; }).join("")}</tbody></table>`
              : `<p class="hint" style="margin:0 0 9px">O processo <b>${esc(p.processo || "—")}</b> ainda não tem receita, então este produto não desconta insumo nenhum do estoque. Dê a receita ao processo em <b>Prestadoras › Estruturas</b> e ela vale para todos os SKUs de uma vez.</p>`}
            <div style="display:flex;align-items:center;gap:12px;margin:10px 0 16px;flex-wrap:wrap">
              <button class="btn sm" ${podeEditar("prodReceita") ? 'data-act="receita-prod-propria"' : 'disabled title="Só a administração muda a receita"'}>${itensProc.length ? "Este SKU é exceção — receita própria" : "Definir os insumos só deste SKU"}</button>
              ${itensProc.length ? `<span style="margin-left:auto;font-size:12.5px">Material por peça: <b>${fmoeda(custoDe(itensProc))}</b> <span class="hint" style="display:inline">pela média das compras</span></span>` : ""}
            </div>`;

          const rec = m.receitaProd;
          return `${cabec}
          <p class="hint" style="margin:0 0 10px">Receita própria: vale <b>só para este SKU</b>${doProc ? ` e ignora a do processo ${esc(doProc.processo)}` : ""}. Um pedido de 500 peças reserva o material na hora em que nasce e dá baixa quando é conferido.</p>
          <table class="t" style="font-size:12.5px"><thead><tr><th>Insumo</th><th class="num" style="width:104px">Por peça</th><th style="width:70px">Unidade</th><th class="num" style="width:98px">Em 100 peças</th><th style="width:36px"></th></tr></thead>
          <tbody>${rec.map((it, i) => { const ins = insumoPorId(it.insumoId);
            return `<tr>
            <td>${pickInsumo(it.insumoId, `data-prc="${i}|insumoId"`)}</td>
            <td><input class="inp num" style="padding:6px 9px;width:92px" type="number" step="any" min="0" data-prc="${i}|qtd" value="${it.qtd ?? ""}" placeholder="0"></td>
            <td style="font-size:11.5px;color:var(--ink-3)">${esc(ins?.unidade || "—")}</td>
            <td class="num mono" style="color:var(--ink-3)">${it.qtd ? nDec(Number(it.qtd) * 100) : "—"}</td>
            <td><button class="btn sm ghost" data-prcdel="${i}" title="Tirar da receita">×</button></td></tr>`; }).join("")
            || vazioLinha("nada", "Nenhum insumo ainda", "Adicione o primeiro aqui embaixo.")}
          </tbody></table>
          <div style="display:flex;align-items:center;gap:12px;margin:10px 0 16px;flex-wrap:wrap">
            <button class="btn sm" data-act="receita-prod-add">+ Insumo</button>
            <button class="btn sm ghost" data-act="receita-prod-processo">Voltar a usar a do processo</button>
            ${(() => { const c = custoDe(rec); return c ? `<span style="margin-left:auto;font-size:12.5px">Material por peça: <b>${fmoeda(c)}</b> <span class="hint" style="display:inline">pela média das compras</span></span>` : ""; })()}
          </div>`; })()}
        ${novo ? "" : `<div class="secao">Identidade e Magazord</div>
        <div class="kv" style="margin:0"><span>ID interno (permanente)</span><b class="mono">${esc(p.id || "—")}</b></div>
        ${(p.skusAnteriores || []).length ? `<div class="kv" style="margin:0"><span>SKUs anteriores</span><b>${p.skusAnteriores.map((h) => `${esc(h.sku)} (até ${fdate(h.ate)})`).join(" · ")}</b></div>` : ""}
        ${p.magazord?.atualizadoEm ? `<div class="kv" style="margin:0 0 10px"><span>Última atualização da Magazord</span><b>${fdate(p.magazord.atualizadoEm)}</b></div>` : ""}`}
        ${f("Endereço na loja", `<input class="inp" data-p="urlSite" value="${esc(p.urlSite || "")}" placeholder="https://www.modabicho.com.br/...">`)}
        ${f("Foto", `<input class="inp" data-p="foto" value="${esc(p.foto || "")}">`, "Botão direito na foto do site → Copiar endereço da imagem.")}
      </div>
      <div class="modal-f">${novo ? "" : `<button class="btn danger sm" data-act="excluir-produto">Excluir</button>`}
        ${linkSite(p) ? `<a class="btn sm" href="${esc(linkSite(p))}" target="_blank" rel="noopener">${svg(IC.link)}Abrir na loja</a>` : ""}
        <button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="salvar-produto">Salvar</button></div></div></div>`;
  }

  if (m.tipo === "prestadora") {
    const p = m.prest, novo = m.novo;
    const perfil = !novo && S.calc ? S.calc.prestMap.get(m.original) : null;
    const procs = [...new Set([...(S.cad.estruturas || []).map((e) => e.processo), ...(p.processos || []), ...((perfil?.procsAuto) || [])])].filter(Boolean);
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:620px" role="dialog" aria-label="Prestadora">
      <div class="modal-h">${novo ? "" : avatar(p.nome, "lg")}<h2>${novo ? "Nova prestadora" : esc(p.nome)}</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        ${f("Nome", `<input class="inp" data-pr="nome" value="${esc(p.nome || "")}">`)}
        ${f("Telefone / WhatsApp", `<input class="inp" data-pr="telefone" value="${esc(p.telefone || "")}">`)}
        <label style="display:flex;gap:9px;align-items:flex-start;cursor:pointer;margin:2px 0 14px">
          <input type="checkbox" class="chk" data-pr-chk="fazTudo" ${p.fazTudo ? "checked" : ""} style="margin-top:2px">
          <span><b>Faz o processo completo</b> — um papel só, sem continuação -A<br>
          <span style="color:var(--ink-3);font-size:12px">Desmarcada: ela faz parte das etapas e outra prestadora conclui — na conferência o app oferece criar o pedido -A para a segunda.</span></span></label>
        <div class="fld" style="margin-bottom:14px"><span>Processos ${perfil?.procsAuto?.length ? `<span style="color:var(--ink-4);text-transform:none;letter-spacing:0">(• = detectado no histórico)</span>` : ""}</span>
          <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:3px">
            ${procs.map((pc) => { const auto = (perfil?.procsAuto || []).includes(pc);
              const on = auto ? !(p.procsExcluidos || []).includes(pc) : (p.processos || []).includes(pc);
              return `<label class="chip ${on ? "on" : ""}" style="cursor:pointer" title="${auto ? "detectado no histórico — desmarque se ela não faz mais" : ""}">
              <input type="checkbox" data-prproc="${esc(pc)}" data-prauto="${auto ? 1 : 0}" ${on ? "checked" : ""} style="display:none">${auto ? "• " : ""}${esc(pc)}</label>`; }).join("")}
          </div></div>
        ${f("Capacidade mensal (peças)", `<input type="number" class="inp num" data-pr="capacidadeManual" value="${p.capacidadeManual ?? ""}" placeholder="${perfil?.mediaMensal ? "estimada pelo histórico: " + n0(perfil.mediaMensal) : "sem histórico"}">`,
          "Deixe em branco para o app usar a média mensal do histórico. Preencha para sobrepor.")}
        ${f("Observação", `<input class="inp" data-pr="obs" value="${esc(p.obs || "")}">`)}
        <label style="display:flex;gap:9px;align-items:center;font-size:13px;cursor:pointer">
          <input type="checkbox" class="chk" data-pr="ativo" ${p.ativo !== false ? "checked" : ""}> Ativa</label>

        ${novo ? "" : (() => { /* ---------- o que está com ela ----------
             A pergunta da retirada, respondida antes de alguém precisar dela. */
          const nome = m.original;
          const mats = emPosseDaPrestadora(nome);
          const prods = posseNaMao(nome);
          const ult = ultimaMovPrestadora(nome);
          const min = minsPrest()[nome] || {};
          const comMin = bens().filter((b) => b.ativo !== false && (min[b.id] > 0 || mats.some((x) => x.bem.id === b.id)));
          return `<div class="secao">Em posse de ${esc(primeiroNome(nome))}</div>
          ${prods.length ? `<div class="hint" style="margin:0 0 10px;line-height:1.9">
            ${prods.map((x) => `<div>• <b>${esc(posseRotulo(x))}</b> <span style="color:var(--ink-4)">desde ${fdate(x.data || x.em)}</span>
              <button class="btn sm ghost" data-posse-fim="${esc(x.id)}" title="Encerrar esta produção — use quando não houver pedido para conferir">encerrar</button></div>`).join("")}
          </div>` : `<p class="hint" style="margin:0 0 10px">Nenhuma produção registrada com ela.</p>`}
          ${comMin.length ? `<div class="tw"><table class="t" style="font-size:12.5px">
            <thead><tr><th>Item</th><th class="num">Com ela</th><th class="num">Mínimo desejado</th><th class="num">Falta</th></tr></thead>
            <tbody>${comMin.map((b) => { const com = emPosseDoBemCom(b.id, nome); const mn = Number(min[b.id]) || 0;
              const falta = Math.max(0, mn - com);
              return `<tr>
                <td><b>${esc(b.nome)}</b>${b.tipo === "equipamento" ? ' <span class="tag">equipamento</span>' : ""}</td>
                <td class="num">${nDec(com)} ${esc(b.unidade || "un")}</td>
                <td class="num"><input type="number" min="0" step="any" class="inp num" data-minprest="${esc(b.id)}" value="${mn || ""}" style="width:96px" placeholder="—"></td>
                <td class="num">${falta ? `<b style="color:var(--red)">${nDec(falta)}</b>` : '<span style="color:var(--ink-4)">—</span>'}</td></tr>`; }).join("")}
            </tbody></table></div>
            <div class="hint" style="margin-top:6px">O mínimo é o que você quer que fique <b>com ela</b>. Abaixo disso, ela aparece em <b>O que enviar</b>.</div>`
          : `<p class="hint" style="margin:0">Nenhum item registrado com ela ainda.</p>`}
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button class="btn primary sm" data-act="nova-retirada" data-prest="${esc(nome)}">${svg(IC.mais)}Registrar saída</button>
            <button class="btn sm" data-hist-prest="${esc(nome)}">Ver histórico${ult ? ` · último em ${fdate(ult)}` : ""}</button>
          </div>`; })()}
      </div>
      <div class="modal-f">${novo ? "" : `<button class="btn danger sm" data-act="excluir-prestadora">Excluir</button>`}
        <button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="salvar-prestadora">Salvar</button></div></div></div>`;
  }

  if (m.tipo === "presenca") {
    const outras = outrasPessoas(), abas = minhasOutrasAbas();
    const desde = (x) => { const min = Math.round((Date.now() - new Date(x.em).getTime()) / 60000);
      return min < 2 ? "agora" : `visto há ${min} min`; };
    const ondeEsta = (x) => { const rot = (TITULOS[x.aba] || [])[0]; return rot ? ` · em ${rot}` : ""; };
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:460px" role="dialog" aria-label="Quem está no app">
      <div class="modal-h"><h2>Quem está no app agora</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <div class="kv" style="border:0;padding-top:0">
          <span><b>${esc(usuarioAtual()?.nome || "Você")}</b> <span style="color:var(--ink-3)">(você)</span></span><b>agora</b>
        </div>
        ${outras.map((x) => `<div class="kv" style="border:0">
          <span><span class="pessoa">${avatar(x.nome || "?")}<b>${esc(x.nome || "Sem nome")}</b></span>${esc(ondeEsta(x))}</span>
          <b style="font-weight:500;color:var(--ink-3)">${esc(desde(x))}</b></div>`).join("")}
        ${abas.length ? `<div class="aviso" style="margin:12px 0 0">
          <b>Você está com o app aberto em ${abas.length === 1 ? "outra aba" : `mais ${abas.length} abas`}.</b>
          Trabalhar nas duas é o jeito mais fácil de uma sobrescrever a outra — feche a que não estiver usando.</div>` : ""}
        ${outras.length ? `<p class="hint" style="margin:12px 0 0;line-height:1.65">O app avisa quando alguém grava, e a tela se atualiza sozinha.
          Só tome cuidado com <b>a mesma prestadora, o mesmo pedido ou o mesmo mês</b> ao mesmo tempo: aí as duas versões podem se misturar.</p>`
        : `<p class="hint" style="margin:12px 0 0">Ninguém mais está no app agora.</p>`}
      </div></div></div>`;
  }

  if (m.tipo === "devolverPosse") {
    const x = posseItemPorId(m.itemId);
    if (!x) return "";
    const b = bemPorId(x.bemId);
    const resta = emPosseDe(x);
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:440px" role="dialog" aria-label="Registrar devolução">
      <div class="modal-h"><h2>${esc(b?.nome || "Item")} voltou</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p style="margin:0 0 14px;font-size:13.5px;line-height:1.6">Saiu <b>${nDec(x.qtd)} ${esc(b?.unidade || "un")}</b>
          para <b>${esc(x.prestadora)}</b> em ${fdate(x.saiuEm)}. Ainda com ela: <b>${nDec(resta)}</b>.</p>
        <label class="fld"><span>Quanto voltou</span>
          <input type="number" min="0" max="${resta}" step="any" class="inp num" id="dev-qtd" value="${resta}" style="width:120px"></label>
        <label class="fld" style="margin-top:12px"><span>Data</span>
          <input type="date" class="inp" id="dev-em" value="${esc(iso(hoje()))}"></label>
        <label class="fld" style="margin-top:12px"><span>Observação</span>
          <input class="inp" id="dev-obs" placeholder="opcional — ex.: veio com a trava quebrada"></label>
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="salvar-devolucao">Registrar devolução</button></div></div></div>`;
  }

  if (m.tipo === "histPrest") {
    const linhas = linhaDoTempoPrestadora(m.nome, 300);
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:660px" role="dialog" aria-label="Histórico da prestadora">
      <div class="modal-h">${avatar(m.nome, "lg")}<h2>${esc(m.nome)} · histórico</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        ${linhas.length ? `<div class="tl">${linhas.map((x) => `<div class="tl-i ${esc(x.classe)}">
          <div class="tl-d">${fdate(x.quando)}</div>
          <div class="tl-c"><b>${esc(x.rotulo)}</b> ${esc(x.texto)}
            ${x.doc?.numero ? `<span class="sku" style="font-size:10.5px">${esc(x.doc.numero)}</span>` : ""}
            <i>${x.por ? esc(x.por) : "—"} · ${fdataHora(x.em)}</i></div>
        </div>`).join("")}</div>`
        : vazio("nada", "Nada registrado ainda", "A primeira linha aparece assim que você registrar uma retirada.")}
      </div>
      <div class="modal-f"><button class="btn primary" style="margin-left:auto" data-act="nova-retirada" data-prest="${esc(m.nome)}">Registrar retirada</button></div>
    </div></div>`;
  }

  if (m.tipo === "retirada") {
    /* ---------- a prestadora está de pé no balcão ----------
       Uma tela, uma ação. Se isto não vencer o caderno, ela volta para o caderno.
       Por isso o que a empresa não sabe não é obrigatório: bandana sai sem SKU e
       sem contagem, e a tela não finge o contrário. */
    const r = m.r;
    /* a mesma tela nos dois sentidos: o que ela leva e o que ela devolve são o
       mesmo gesto de balcão, e duas telas quase iguais seriam duas chances de
       abrir a errada. O sentido troca os verbos e o lado do movimento. */
    const volta = r.sentido === "volta";
    const ativas = (S.cad.prestadoras || []).filter((p) => p.ativo !== false)
      .slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
    const f = (rot, dentro, dica) => `<label class="fld"><span>${rot}</span>${dentro}${dica ? `<div class="hint" style="margin-top:4px">${dica}</div>` : ""}</label>`;
    const chip = (on, attr, txt) => `<button type="button" class="chip ${on ? "on" : ""}" ${attr}>${txt}</button>`;

    const blocoProd = (p, ix) => `<div class="rt-bloco">
      <div class="rt-bloco-h"><b>Produção ${ix + 1}</b>
        <span class="rt-resumo">${esc(posseRotulo(p) || "—")}</span>
        <button type="button" class="ic-btn" data-rt-delprod="${ix}" title="Tirar esta produção" aria-label="Remover">${svg(IC.lixeira)}</button></div>
      <div class="rt-chips">${POSSE_CATS.map(([id, nome]) => chip(p.categoria === id, `data-rt-cat="${ix}|${id}"`, nome)).join("")}</div>
      ${p.categoria === "festiva"
        ? `<div style="margin-top:9px">${f("Campanha", `<input class="inp" data-rtp="${ix}|campanha" value="${esc(p.campanha || "")}" placeholder="Halloween, Natal, Páscoa…">`)}</div>`
        : `<div class="rt-chips" style="margin-top:9px">${POSSE_VARS.map(([id, nome]) => chip(p.variante === id, `data-rt-var="${ix}|${id}"`, nome)).join("")}</div>`}
      <div class="rt-lab">Tamanhos que foram</div>
      <div class="rt-chips">${POSSE_TAMS.map((tm) => chip((p.tamanhos || []).includes(tm), `data-rt-tam="${ix}|${tm}"`, tm)).join("")}</div>
      <details class="pq"><summary>Coleção, SKU e quantidade — se souber</summary><div>
        <div class="grid2" style="gap:10px">
          ${f("Coleção / estampa", `<input class="inp" data-rtp="${ix}|colecao" value="${esc(p.colecao || "")}">`)}
          ${f("SKU", `<input class="inp" data-rtp="${ix}|sku" value="${esc(p.sku || "")}">`)}
        </div>
        <div class="grid2" style="gap:10px;margin-top:10px">
          ${f("Quantidade", `<input type="number" min="0" step="1" class="inp num" data-rtp="${ix}|qtd" value="${p.qtd ?? ""}">`, "em branco quando não se conta")}
          ${f("Observação", `<input class="inp" data-rtp="${ix}|obs" value="${esc(p.obs || "")}">`)}
        </div></div></details>
    </div>`;

    const blocoMat = (x, ix) => { const bem = bemPorId(x.bemId);
      const emCaixa = !!x.emb && temEmbalagem(bem);
      const base = emCaixa ? emBase(bem, x.qtd) : (Number(x.qtd) || 0);
      /* Na devolução vale conferir contra o que consta com ela — é o número
         desta mesma tabela, e devolver mais do que saiu quer dizer que uma saída
         não foi anotada. Na saída não há teto: o app não sabe, nem precisa
         saber, quantas caixas existem na fábrica. */
      const comEla = bem && volta ? emPosseDoBemCom(bem.id, r.prestadora) : Infinity;
      return `<div class="rt-mat">
        <div class="rt-mat-in">${pickBem(x.bemId || "", `data-rtm="${ix}|bemId"`, { criar: true, placeholder: "caixa, máquina, linha, tesoura…" })}</div>
        <input type="number" min="0" step="any" class="inp num" data-rtm="${ix}|qtd" value="${x.qtd ?? ""}" style="width:92px" placeholder="0">
        ${bem && temEmbalagem(bem)
          ? `<button type="button" class="chip ${emCaixa ? "on" : ""}" data-rt-emb="${ix}" title="Alternar entre ${esc(bem.embalagem.nome)} e ${esc(bem.unidade || "un")}">${esc(emCaixa ? bem.embalagem.nome : (bem.unidade || "un"))}</button>`
          : `<span class="rt-un">${esc(bem?.unidade || "un")}</span>`}
        <span class="rt-conf">${base > 0 && bem ? `${nDec(base)} ${esc(bem.unidade || "un")}${base > comEla ? ` · <b style="color:var(--red)">consta ${nDec(comEla)} com ela</b>` : ""}` : ""}</span>
        <button type="button" class="ic-btn" data-rt-delmat="${ix}" title="Tirar este item" aria-label="Remover">${svg(IC.lixeira)}</button>
      </div>`; };

    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:720px" role="dialog" aria-label="Registrar retirada">
      <div class="modal-h"><h2>${volta ? "Prestadora devolveu material" : "Prestadora veio buscar"}</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <div class="grid2" style="gap:12px">
          ${f("Prestadora", `<select class="sel" data-rt="prestadora"><option value="">— escolha —</option>
            ${ativas.map((p) => `<option value="${esc(p.nome)}" ${r.prestadora === p.nome ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}</select>`)}
          ${f("Data", `<input type="date" class="inp" data-rt="data" value="${esc(r.data || iso(hoje()))}">`)}
        </div>

        ${volta ? (() => { const abertas = r.prestadora ? posseNaMao(r.prestadora) : [];
          return `<div class="secao">Produção que voltou</div>
          ${abertas.length ? abertas.map((p) => `<label style="display:flex;gap:9px;align-items:flex-start;font-size:13px;cursor:pointer;margin-bottom:8px">
            <input type="checkbox" class="chk" data-rt-fim="${esc(p.id)}" ${(r.encerrar || []).includes(p.id) ? "checked" : ""} style="margin-top:2px">
            <span><b>${esc(posseRotulo(p))}</b><br><span style="color:var(--ink-3);font-size:12px">com ela desde ${fdate(p.data || p.em)}</span></span></label>`).join("")
          : `<p class="hint" style="margin:0 0 10px">${r.prestadora ? "Nenhuma produção aberta com ela." : "Escolha a prestadora para ver o que está com ela."}</p>`}
          <div class="hint" style="margin:0 0 4px">Quando a produção tem pedido, quem encerra é a <b>Conferência</b> — marque aqui só o que voltou sem pedido.</div>`; })()
        : `<div class="secao">Produção que está saindo</div>
        ${(r.prods || []).map(blocoProd).join("") || `<p class="hint" style="margin:0 0 10px">Nenhuma ainda — use o botão abaixo se ela está levando bandana.</p>`}
        <button class="btn sm" data-act="rt-add-prod">${svg(IC.mais)}Adicionar produção</button>`}

        <div class="secao">${volta ? "Itens que voltaram" : "Itens que vão junto"}</div>
        ${(r.mats || []).length ? `<div class="rt-mats">${r.mats.map(blocoMat).join("")}</div>` : `<p class="hint" style="margin:0 0 10px">Nenhum material ainda.</p>`}
        <button class="btn sm" data-act="rt-add-mat">${svg(IC.mais)}Adicionar material</button>
        ${(() => { const s2 = r.sugerido;
          return s2 ? `<div class="hint" style="margin-top:9px;color:var(--teal)">Sugeri <b>${nDec(s2.qtd)} ${esc(s2.nome)}</b> porque ${esc(s2.motivo)} — mude ou apague se não for o caso.</div>` : ""; })()}

        ${r.prestadora ? (() => { const posse = emPosseDaPrestadora(r.prestadora);
          return posse.length ? `<div class="secao">O que já está com ${esc(primeiroNome(r.prestadora))}</div>
          <div class="hint" style="line-height:1.9">${posse.map((x) => `${esc(x.bem.nome)}: <b>${nDec(x.qtd)} ${esc(x.bem.unidade || "un")}</b> <span style="color:var(--ink-4)">desde ${fdate(x.desde)}</span>`).join(" · ")}</div>` : ""; })() : ""}
      </div>
      <div class="modal-f">
        <button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="salvar-retirada">${volta ? "Registrar devolução" : "Registrar retirada"}</button></div></div></div>`;
  }

  if (m.tipo === "pessoa") {
    /* ---------- DUAS FICHAS, DUAS NATUREZAS ----------
       ACESSO             e-mail e permissões. É quem entra no PCP.
       PESSOA OPERACIONAL nome, funções e ativa. Trabalha, mas não entra.

       Antes era uma ficha só, com tudo dentro — e por isso a ficha da operária
       pedia e-mail de login, PIN e permissões de sistema que nunca foram dela.
       O PIN saiu dos dois lados: deixou de ser porta de entrada na v8.56. */
    const p = m.pessoa, novo = m.novo;
    const acesso = m.acesso === true || (typeof ehAcesso === "function" && ehAcesso(p));

    if (acesso) return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:520px" role="dialog" aria-label="Acesso ao PCP">
      <div class="modal-h">${avatar(p.nome, "lg")}<h2>${esc(p.nome)}</h2>
        <span class="sub" style="margin-left:8px">acesso ao PCP</span>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        ${f("Nome", `<input class="inp" data-pe="nome" value="${esc(p.nome || "")}">`)}
        ${f("E-mail de entrada", `<input class="inp" data-pe="email" type="email" value="${esc(p.email || "")}">`, "é com este e-mail e a senha dele que se entra no PCP")}
        ${ehAdm() ? `<div class="fld" style="margin-bottom:14px"><span>O que este acesso pode fazer</span>
          <label style="display:flex;gap:9px;align-items:center;font-size:13px;cursor:pointer;margin:7px 0">
            <input type="checkbox" class="chk" data-pe-chk="adm" ${p.adm ? "checked" : ""}> <b>Administradora</b> — vê tudo e decide o acesso das outras</label>
          <label style="display:flex;gap:9px;align-items:center;font-size:13px;cursor:pointer;margin:0 0 7px">
            <input type="checkbox" class="chk" data-pe-chk="verValores" ${p.verValores ? "checked" : ""}> Pode ver valores (R$ e fechamentos)</label>
          ${(() => {
            const marcado = (id) => { const e2 = p.edit || {};
              if (p.editarEstrutura === true) return true;
              return Object.prototype.hasOwnProperty.call(e2, id) ? !!e2[id] : !!PERM_PADRAO[id]; };
            const nMarc = PERM_IDS.filter(marcado).length;
            return `<div class="perms">
            <div class="perms-h"><span>O que pode mudar</span>
              <span class="perms-n">${nMarc} de ${PERM_IDS.length}</span>
              <button class="btn sm ghost" data-perm-tudo="${nMarc === PERM_IDS.length ? "0" : "1"}">${nMarc === PERM_IDS.length ? "Desmarcar tudo" : "Marcar tudo"}</button></div>
            ${PERMS.map(([g, titulo, itens]) => `<div class="perms-g">
              <div class="perms-gt">${esc(titulo)}</div>
              ${itens.map(([id, nome, expl]) => `<label class="perm">
                <input type="checkbox" class="chk" data-pe-edit="${esc(id)}" ${marcado(id) ? "checked" : ""}>
                <span><b>${esc(nome)}</b><i>${esc(expl)}</i></span></label>`).join("")}
            </div>`).join("")}
            <div class="hint" style="margin:9px 0 0">Desmarcado, o campo continua <b>à vista</b> na tela — com cadeado, para dar para ver o que é sem poder digitar por cima.</div>
          </div>`; })()}
          <div style="font-size:11.5px;color:var(--ink-3);margin:6px 0 4px">ABAS QUE ESTE ACESSO VÊ (nenhuma marcada = só Pedidos e Tarefas):</div>
          <div style="display:flex;flex-wrap:wrap;gap:7px">${ABAS_TODAS.map(([id, nome]) => `<label class="chip" style="cursor:pointer">
            <input type="checkbox" class="chk" data-pe-aba="${id}" ${(p.abas || []).includes(id) ? "checked" : ""} style="margin-right:5px">${nome}</label>`).join("")}</div>
        </div>` : `<div class="hint">Só a administradora muda permissões.</div>`}
        <label style="display:flex;gap:9px;align-items:center;font-size:13px;cursor:pointer;margin-top:14px">
          <input type="checkbox" class="chk" data-pe="ativo" ${p.ativo !== false ? "checked" : ""}> Ativo</label>
        <div class="hint" style="margin-top:10px">Este acesso não recebe tarefa. Quem recebe tarefa são as <b>pessoas da equipe</b>, no quadro ao lado.</div>
      </div>
      <div class="modal-f">
        <button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="salvar-pessoa">Salvar</button></div></div></div>`;

    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:520px" role="dialog" aria-label="Pessoa da equipe">
      <div class="modal-h">${novo ? "" : avatar(p.nome, "lg")}<h2>${novo ? "Nova pessoa" : esc(p.nome)}</h2>
        <span class="sub" style="margin-left:8px">pessoa da equipe</span>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        ${f("Nome", `<input class="inp" data-pe="nome" value="${esc(p.nome || "")}">`, "é por ele que setores, pedidos e histórico se referem a ela")}
        <div class="fld" style="margin-bottom:16px"><span>Do que ela cuida</span>
          <div class="hint" style="margin:4px 0 8px">É daqui que sai o responsável automático de cada etapa. Quando mais de uma pessoa cuida da mesma, a <b>primeira da lista da Equipe</b> recebe a tarefa e as outras aparecem como alternativa — dá para trocar em qualquer pedido.</div>
          <div style="display:flex;flex-direction:column;gap:9px;margin-top:5px">
            ${FUNCOES.map(([id, nome]) => { const outras = padraoLista(id).filter((x) => x !== p.nome);
              return `<label style="display:flex;gap:9px;align-items:center;font-size:13px;cursor:pointer">
              <input type="checkbox" class="chk" data-pefun="${id}" ${(p.funcoes || []).includes(id) ? "checked" : ""}> ${esc(nome)}
              ${outras.length ? `<span class="hint" style="margin:0 0 0 auto;font-size:11px">também: ${esc(outras.join(", "))}</span>` : ""}</label>`; }).join("")}
          </div></div>
        <label style="display:flex;gap:9px;align-items:center;font-size:13px;cursor:pointer">
          <input type="checkbox" class="chk" data-pe="ativo" ${p.ativo !== false ? "checked" : ""}> Ativa</label>
        <div class="hint" style="margin-top:10px">Quem entra no PCP entra por um <b>acesso</b>, com e-mail e senha — no quadro de cima. Esta ficha é de quem trabalha.</div>
      </div>
      <div class="modal-f">${novo ? "" : `<button class="btn danger sm" data-act="excluir-pessoa">Excluir</button>`}
        <button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="salvar-pessoa">Salvar</button></div></div></div>`;
  }

  if (m.tipo === "setor") {
    const st = m.setor, novo = m.novo;
    const procs = [...new Set([...(S.cad.estruturas || []).map((e) => e.processo),
      ...S.produtos.map((p) => p.processo).filter(Boolean).map((p) => String(p).trim().toUpperCase())])].filter(Boolean).sort();
    const usados = new Map();
    setores().forEach((o) => { if (o.id !== st.id) (o.processos || []).forEach((p) => usados.set(p, o.nome)); });
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:620px" role="dialog" aria-label="Setor">
      <div class="modal-h"><h2>${novo ? "Novo setor" : esc(st.nome)}</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        ${f("Nome do setor", `<input class="inp" data-st="nome" value="${esc(st.nome || "")}">`)}
        ${(() => { const sel = respDoSetor(st); const nomes = S.equipe.filter((p2) => p2.ativo !== false).map((p2) => p2.nome);
          const orfas = sel.filter((n2) => !nomes.includes(n2));
          return `<div class="fld" style="margin-bottom:14px"><span>Responsáveis pelo setor</span>
            <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:4px">
              ${nomes.map((n2) => `<label class="chip" style="cursor:pointer;gap:6px"><input type="checkbox" class="chk" data-stresp="${esc(n2)}" ${sel.includes(n2) ? "checked" : ""}> ${esc(n2)}</label>`).join("")
                || '<span class="hint">Nenhuma pessoa ativa na equipe — cadastre alguém primeiro.</span>'}
            </div>
            ${orfas.length ? `<div class="aviso" style="margin-top:9px">${esc(orfas.join(", "))} ${orfas.length === 1 ? "não está mais" : "não estão mais"} na equipe. Ao salvar, ${orfas.length === 1 ? "sai" : "saem"} deste setor.</div>` : ""}
            <div class="hint" style="margin-top:5px">A lista sai da equipe interna — assim o setor nunca aponta para quem não existe. Novos pedidos do setor nascem com a primeira marcada como responsável.</div></div>`; })()}

        <div class="fld" style="margin-bottom:14px"><span>Processos que caem neste setor</span>
          <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:3px">
            ${procs.map((pc) => { const on = (st.processos || []).includes(pc); const outro = usados.get(pc);
              return `<label class="chip ${on ? "on" : ""}" style="cursor:pointer" title="${outro ? "hoje em: " + esc(outro) : ""}">
              <input type="checkbox" data-stproc="${esc(pc)}" ${on ? "checked" : ""} style="display:none">${esc(pc)}${outro ? " ·" : ""}</label>`; }).join("")}
          </div>
          <div class="hint" style="margin-top:6px">Marcar um processo já usado em outro setor transfere-o para este.</div></div>
      </div>
      <div class="modal-f">${novo ? "" : `<button class="btn danger sm" data-act="excluir-setor">Excluir</button>`}
        <button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="salvar-setor">Salvar</button></div></div></div>`;
  }

  if (m.tipo === "fornecedores") {
    const fs2 = S.cad.fornecedores || [];
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:620px" role="dialog" aria-label="Fornecedores">
      <div class="modal-h"><h2>Fornecedores</h2><button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p class="hint" style="margin:0 0 12px">Cada fornecedor com o prazo médio de chegada — vai alimentar a estimativa de estoque por fornecedor. O prazo edita direto na lista.</p>
        ${fs2.length ? fs2.map((f2) => { /* o mesmo fornecedor manda produto para revenda e insumo
             para produção: mostrar as duas listas aqui evita ter de abrir duas telas
             para responder "o que eu compro dele?" */
          const prods = S.produtos.filter((pp) => pp.producao?.fornecedorId === f2.id);
          const ins = insumos().filter((x) => x.ativo !== false
            && (x.fornecedorId === f2.id || (x.outrosFornecedores || []).includes(f2.id)));
          const nfs = entradasNF().filter((e2) => e2.fornecedorId === f2.id);
          return `<div class="forn-bloco">
          <div style="display:flex;gap:8px;align-items:center">
            <input class="inp" data-forn-n="${esc(f2.id)}" value="${esc(f2.nome)}" style="flex:1">
            <input type="number" class="inp num" data-forn-p="${esc(f2.id)}" value="${f2.prazoDias ?? ""}" placeholder="prazo" style="width:86px" title="Prazo médio em dias">
            <span class="hint" style="font-size:11px">dias</span>
            <button class="lupa" data-forn-rm="${esc(f2.id)}" title="Remover">×</button></div>
          ${prods.length || ins.length || nfs.length ? `<div class="forn-listas">
            ${prods.length ? `<div><span>Produtos</span>${prods.slice(0, 6).map((pp) => `<b>${esc(pp.descricao || pp.sku)}</b>`).join("")}${prods.length > 6 ? `<i>+${prods.length - 6}</i>` : ""}</div>` : ""}
            ${ins.length ? `<div><span>Insumos</span>${ins.slice(0, 6).map((x) => { const cod = (x.codigosFornecedor || []).find((c) => c.fornecedorId === f2.id);
              return `<b>${esc(x.nome)}${cod ? ` <em>${esc(cod.codigo)}</em>` : ""}</b>`; }).join("")}${ins.length > 6 ? `<i>+${ins.length - 6}</i>` : ""}</div>` : ""}
            ${nfs.length ? `<div><span>Notas</span><b>${n0(nfs.length)} ${nfs.length === 1 ? "entrada registrada" : "entradas registradas"} · última ${fdate(nfs[nfs.length - 1].entradaEm)}</b></div>` : ""}
          </div>` : '<div class="forn-listas"><div><span>Nada vinculado ainda</span></div></div>'}
        </div>`; }).join("") : `<p class="hint" style="margin:0 0 12px">Nenhum fornecedor cadastrado ainda.</p>`}
        <div style="display:flex;gap:8px;margin-top:14px">
          <input class="inp" id="forn-nome" placeholder="Nome do fornecedor" style="flex:1">
          <input type="number" class="inp num" id="forn-prazo" placeholder="prazo (dias)" style="width:110px">
          <button class="btn primary sm" data-act="forn-add">Adicionar</button>
        </div>
      </div></div></div>`;
  }
  if (m.tipo === "tamEmb") {
    const tams = tamanhosEmbalagemOrdenados();
    const qtds = qtdsEmbalagemOrdenadas();
    const adm = ehAdm();
    /* ---------- gerenciar, não "cadastre aqui" ----------
       A lixeira fica NESTA tela, nunca dentro do seletor: no `<select>` a pessoa
       quer escolher 6x12 e apagaria 6x12 por um pixel de diferença. Aqui o gesto
       é deliberado, e a exclusão diz o impacto antes de acontecer. */
    const linha = (valor, rot, uso, attr) => `<div style="display:flex;align-items:center;gap:10px;padding:7px 2px;border-bottom:1px solid var(--line-2)">
      <b class="sku" style="font-size:12.5px;min-width:72px">${esc(rot)}</b>
      <span class="hint" style="margin:0;flex:1">${uso ? `${n0(uso)} ${uso === 1 ? "produto usa" : "produtos usam"}` : "não está em uso"}</span>
      ${adm ? `<button class="btn sm ghost" ${attr} title="Remover da lista">${svg(IC.lixeira)}</button>` : ""}
    </div>`;
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:520px" role="dialog" aria-label="Embalagens da empresa">
      <div class="modal-h"><h2>Gerenciar embalagens</h2><button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p class="hint" style="margin:0 0 14px">Cadastre aqui o que existe de verdade — no produto você só escolhe destas listas, sem margem para digitar de dois jeitos.
          <b>9x9</b>, <b>9X9</b> e <b>9 x 9</b> são a mesma coisa: o app guarda um só.</p>
        ${adm ? `<div class="rowform" style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap">
          <input class="inp" id="tam-novo" placeholder="Novo tamanho — ex.: 12x12" style="flex:1;min-width:170px">
          <button class="btn primary sm" data-act="tam-add">Cadastrar</button>
        </div>` : ""}
        <div class="secao" style="margin-top:${adm ? "12px" : "0"}">Tamanhos ${tams.length ? `<span style="font-weight:500;color:var(--ink-3)">· ${n0(tams.length)}</span>` : ""}</div>
        ${tams.length ? tams.map((t2) => linha(t2, t2, usoDoTamanhoEmb(t2), `data-tam-rm="${esc(t2)}"`)).join("")
          : `<p class="hint" style="margin:0 0 10px">Nenhum tamanho cadastrado ainda.</p>`}

        ${adm ? `<div class="rowform" style="display:flex;gap:8px;margin:18px 0 6px;flex-wrap:wrap">
          <input type="number" class="inp num" id="qtd-nova" placeholder="Nova quantidade — ex.: 50" style="flex:1;min-width:170px">
          <button class="btn primary sm" data-act="qtd-add">Cadastrar</button>
        </div>` : ""}
        <div class="secao" style="margin-top:${adm ? "12px" : "18px"}">Quantidades por embalagem ${qtds.length ? `<span style="font-weight:500;color:var(--ink-3)">· ${n0(qtds.length)}</span>` : ""}</div>
        ${qtds.length ? qtds.map((q2) => linha(q2, n0(q2), usoDaQtdEmb(q2), `data-qtd-rm="${esc(String(q2))}"`)).join("")
          : `<p class="hint" style="margin:0 0 10px">Nenhuma quantidade cadastrada ainda.</p>`}

        ${adm ? "" : `<p class="hint" style="margin:16px 0 0">Cadastrar e remover destas listas é da administração — o que vale para um produto vale para todos.</p>`}
        ${porque("Como o app trata estas listas", `
          <div><b>Normaliza antes de gravar.</b> <b>9X9</b>, <b>9 x 9</b> e <b>09x09</b> viram <b>9x9</b>. Não existe cadastrar a mesma coisa duas vezes.</div>
          <div><b>Ordena sozinho, por número.</b> Alfabeticamente <b>10x10</b> viria antes de <b>6x7</b>; aqui vem a primeira medida crescente e, quando ela empata, a segunda.</div>
          <div><b>Recusa o que não é medida.</b> Tamanho é <b>AxB</b>; quantidade é um inteiro maior que zero.</div>
          <div><b>Remover não mexe em produto nenhum.</b> Quem já usa aquele tamanho continua com ele — o que some é a opção para novos cadastros.</div>`)}
      </div></div></div>`;
  }
  if (m.tipo === "removerEmb") {
    /* a confirmação que diz o tamanho do estrago antes de ele acontecer */
    const tam = m.qual === "tamanho";
    const rot = tam ? m.valor : n0(m.valor);
    const uso = tam ? usoDoTamanhoEmb(m.valor) : usoDaQtdEmb(m.valor);
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:470px" role="dialog" aria-label="Remover da lista">
      <div class="modal-h"><h2>Remover ${esc(rot)} da lista</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        ${uso ? `<p style="margin:0 0 12px;font-size:13.5px;line-height:1.65">
            <b>${esc(rot)}</b> está sendo usado por <b>${n0(uso)}</b> ${uso === 1 ? "produto" : "produtos"}.
            Remover ${tam ? "este tamanho" : "esta quantidade"} da lista <b>não altera esses produtos</b> — eles continuam como estão.
            O que muda é que ${tam ? "ele" : "ela"} deixa de aparecer para novos cadastros.</p>`
          : `<p style="margin:0 0 12px;font-size:13.5px;line-height:1.65"><b>${esc(rot)}</b> não está sendo usado por nenhum produto. Pode sair da lista sem efeito nenhum.</p>`}
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn danger" data-act="confirmar-remover-emb">Remover da lista</button></div></div></div>`;
  }
  if (m.tipo === "loteEmb") {
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:480px" role="dialog" aria-label="Embalagem em lote">
      <div class="modal-h"><h2>Definir embalagem em lote</h2><span class="tag">${n0(m.qtd)} produtos</span>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p class="hint" style="margin:0 0 12px">A mesma configuração vale para todos os selecionados. Campo deixado em branco <b>não mexe</b> no que cada produto já tem.</p>
        ${f("Tipo de embalagem", `<select class="sel" id="lote-tipo">${[["", "— não mexer —"], ["plástico", "plástico"], ["filipeta", "filipeta"], ["outro", "outro"]].map(([v2, n2]) => `<option value="${v2}" ${(m.v?.tipo || "") === v2 ? "selected" : ""}>${n2}</option>`).join("")}</select>`)}
        <div id="fld-lote-tam" style="${m.v?.tipo === "filipeta" ? "display:none" : ""}">${f("Tamanho da embalagem", `<select class="sel" id="lote-tam"><option value="">— não mexer —</option>${tamanhosEmbalagemOrdenados().map((t2) => `<option ${m.v?.tam === t2 ? "selected" : ""}>${esc(t2)}</option>`).join("")}<option value="__novo">＋ cadastrar novo tamanho…</option></select>`)}</div>
        ${f("Fornecedor", `<select class="sel" id="lote-forn"><option value="">— não mexer —</option>${(S.cad.fornecedores || []).map((f2) => `<option value="${esc(f2.id)}" ${m.v?.forn === f2.id ? "selected" : ""}>${esc(f2.nome)}${f2.prazoDias ? ` (~${f2.prazoDias}d)` : ""}</option>`).join("")}</select>`)}
        ${f("Quantidade por embalagem", `<select class="sel" id="lote-qtd"><option value="">— não mexer —</option>${qtdsEmbalagemOrdenadas().map((q2) => `<option value="${q2}" ${String(m.v?.qtd) === String(q2) ? "selected" : ""}>${n0(q2)}</option>`).join("")}<option value="__novo">＋ cadastrar nova quantidade…</option></select>`)}
      </div>
      <div class="modal-f"><button class="btn" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="salvar-lote-emb">Aplicar aos ${n0(m.qtd)}</button></div>
    </div></div>`;
  }
  if (m.tipo === "excluirProdutos") {
    const { podem, barrados } = m;
    const comHist = podem.filter((x) => x.feitos > 0);
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:560px" role="dialog" aria-label="Excluir produtos">
      <div class="modal-h"><h2>Excluir ${podem.length + barrados.length === 1 ? "produto" : `${n0(podem.length + barrados.length)} produtos`}</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        ${barrados.length ? `<div class="aviso" style="margin:0 0 14px"><b>${n0(barrados.length)} ${barrados.length === 1 ? "produto não pode" : "produtos não podem"} ser ${barrados.length === 1 ? "excluído" : "excluídos"}</b> — ${barrados.length === 1 ? "tem" : "têm"} pedido em aberto, com papel já impresso ou peça na mão da prestadora. Conclua ou cancele o pedido antes.
          <div style="margin-top:8px;font-size:12px">${barrados.slice(0, 8).map((b2) => `<div class="sku">${esc(b2.p.sku)} — ${n0(b2.vivos.length)} ${b2.vivos.length === 1 ? "pedido" : "pedidos"}: ${esc(b2.vivos.slice(0, 4).map((r) => r.numero).join(", "))}</div>`).join("")}
          ${barrados.length > 8 ? `<div style="color:var(--ink-3)">e mais ${n0(barrados.length - 8)}…</div>` : ""}</div></div>` : ""}
        ${podem.length ? `<p style="margin:0 0 12px;font-size:13.5px">Serão excluídos <b>${n0(podem.length)}</b> ${podem.length === 1 ? "produto" : "produtos"}:</p>
          <div style="max-height:200px;overflow:auto;border:1px solid var(--line);border-radius:9px;padding:8px 11px;font-size:12.5px">
            ${podem.slice(0, 60).map((x) => `<div style="padding:2px 0"><span class="sku">${esc(x.sku)}</span> <span style="color:var(--ink-3)">${esc((x.descricao || "").slice(0, 44))}</span>${x.feitos ? ` <span class="tag amber" style="font-size:10px">${n0(x.feitos)} pedidos no histórico</span>` : ""}</div>`).join("")}
            ${podem.length > 60 ? `<div style="color:var(--ink-3);padding-top:4px">e mais ${n0(podem.length - 60)}…</div>` : ""}
          </div>
          ${comHist.length ? `<div class="aviso" style="margin-top:12px">${n0(comHist.length)} ${comHist.length === 1 ? "deles já teve pedido produzido" : "deles já tiveram pedidos produzidos"}. Os pedidos continuam no histórico e no fechamento das prestadoras, mas ficam sem cadastro de produto — a descrição e a foto somem das telas.</div>` : ""}
          <p class="hint" style="margin-top:12px">Não dá para desfazer. Se tiver dúvida, baixe o backup em Dados antes.</p>`
        : `<p style="margin:0;font-size:13.5px;color:var(--ink-3)">Nenhum produto pode ser excluído agora.</p>`}
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        ${podem.length ? `<button class="btn danger" data-act="confirmar-excluir-produtos">Excluir ${n0(podem.length)}</button>` : ""}</div></div></div>`;
  }

  if (m.tipo === "excluirProdutosPlaceholder") return "";

  if (m.tipo === "verPrest") {
    const p = m.prest;
    const abertas = S.calc.emCampo.filter((r) => r.prestadora === p.nome)
      .concat(S.calc.fila.filter((r) => r.prestadora === p.nome));
    const ms = S.calc.mesesCompetencia[0];
    const d = p.porMes?.[ms] || { pecas: 0, custo: 0 };
    const refs = [...p.refs.entries()].map(([sku, r]) => ({ sku, ...r, media: Math.round(r.total / r.vezes), prazo: mediana(r.leads) }))
      .sort((a, b) => b.vezes - a.vezes || b.total - a.total).slice(0, 10);
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(1080px, 96vw)" role="dialog" aria-label="Perfil da prestadora">
      <div class="modal-h">${avatar(p.nome, "lg")}<div><h2>${esc(p.nome)}</h2>
        <p style="margin:2px 0 0;font-size:12.5px;color:var(--ink-3)">${esc(p.telefone || "sem telefone")} · ${esc((p.procsTodos || []).join(", ") || "sem processos")} · com a Moda Bicho há ${Math.round(p.mesesAtivos)} ${Math.round(p.mesesAtivos) === 1 ? "mês" : "meses"} de histórico</p></div>
        <button class="btn sm" style="margin-left:auto" data-editar-prest="${esc(p.nome)}">Editar</button>
        <button class="btn sm ghost" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <div class="kpis" style="margin-bottom:16px">
          ${kpi("Carga atual", n0(p.pecasAbertas), p.abertas + " pedidos" + (p.pecasP1 ? " · " + n0(p.pecasP1) + " P1" : ""), p.atrasadas ? "amber" : "teal")}
          ${kpi("Capacidade/mês", p.capacidade ? n0(p.capacidade) : "—", p.capacidadeManual ? "definida manualmente" : "média do histórico")}
          ${kpi("Prazo médio", p.prazoMedio != null ? Math.round(p.prazoMedio) + "d" : "—", "separação → conferência")}
          ${kpi("Aproveitamento", p.aproveitamento != null ? Math.round(p.aproveitamento * 100) + "%" : "—", n0(p.retornado) + " de " + n0(p.enviado) + " pçs")}
        </div>
        <div class="secao">O que ela mais produz — montado do histórico</div>
        ${refs.length ? `<table class="t"><thead><tr><th>SKU</th><th class="num">Vezes</th><th class="num">Total</th><th class="num">Média/lote</th><th class="num">Prazo</th><th>Última</th><th>Recomendar?</th></tr></thead>
          <tbody>${refs.map((r) => { const fora = (p.refsExcluidas || []).includes(r.sku); return `<tr style="${fora ? "opacity:.45;text-decoration:line-through" : ""}" title="${fora ? "Excluída das recomendações" : "Conta nas recomendações"}">
            <td class="sku clickable" data-sku="${esc(r.sku)}">${esc(r.sku)}</td>
            <td class="num">${r.vezes}</td><td class="num">${n0(r.total)}</td><td class="num"><b>${n0(r.media)}</b></td>
            <td class="num">${r.prazo != null ? Math.round(r.prazo) + "d" : "—"}</td>
            <td class="mono" style="font-size:11.5px">${r.ultima ? r.ultima.toLocaleDateString("pt-BR") : "—"}</td>
            <td><button class="btn sm ${fora ? "" : "ghost"}" data-nao-faz="${esc(r.sku)}" title="${fora ? "Excluída das recomendações — clique para voltar a considerar" : "Marque se ela NÃO faz esta referência (o histórico pode ter lançamento errado)"}">${fora ? "Voltar a considerar" : "Marcar: não faz"}</button></td></tr>`; }).join("")}</tbody></table>
          <p class="hint" style="margin-top:8px">Estas são as referências que ela <b>já produziu</b> — todas contam nas recomendações. O botão <b>Marcar: não faz</b> serve para excluir uma delas, quando o histórico veio de lançamento errado; a linha então fica riscada e some das sugestões.</p>` : '<p class="hint">Sem histórico de produção conferida.</p>'}
        <div class="secao">Pedidos com ela agora</div>
        ${abertas.length ? `<table class="t"><thead><tr><th>Pedido</th><th>SKU</th><th>Prio</th><th class="num">Qtd</th><th>Etapa</th></tr></thead>
          <tbody>${abertas.map((r) => `<tr><td class="sku">${esc(r.numero)}</td><td class="sku">${esc(r.sku)}</td>
            <td>${corteCurto(r.prioridade)}</td><td class="num">${n0(r.qtd)}</td>
            <td><span class="tag">${P_LABEL[r.status]}</span>${r.atraso > 0 ? ` <span class="tag red">+${r.atraso}d</span>` : ""}</td></tr>`).join("")}</tbody></table>` : '<p class="hint">Nenhum pedido aberto.</p>'}
      </div></div></div>`;
  }

  if (m.tipo === "reatribuir") {
    const equipe = [...new Set(S.equipe.filter((p) => p.ativo !== false).map((p) => p.nome))].sort();
    /* Quem aparece como responsável em qualquer lugar — inclusive quem já saiu da
       equipe. São esses nomes órfãos que travam a tela quando alguém é renomeado
       ou excluído, e é por eles que a substituição precisa começar. */
    const onde = new Map();
    const marca = (n, lugar) => { if (!n) return; const o = onde.get(n) || { pedidos: 0, setores: [], padroes: [] };
      if (lugar === "pedido") o.pedidos++; else if (lugar.tipo === "setor") o.setores.push(lugar.nome); else o.padroes.push(lugar.nome);
      onde.set(n, o); };
    S.pedidos.forEach((r) => { if (PED_VIVO.includes(r.status)) marca(r.responsavel, "pedido"); });
    setores().forEach((st) => respDoSetor(st).forEach((n) => marca(n, { tipo: "setor", nome: st.nome })));
    for (const [fid, rot] of FUNCOES) padraoLista(fid).forEach((n) => marca(n, { tipo: "funcao", nome: rot }));
    const nomes = [...onde.keys()].sort((a, b) => a.localeCompare(b));
    const orfaos = nomes.filter((n) => !S.equipe.some((p) => p.nome === n));
    const de = m.de && onde.has(m.de) ? m.de : (orfaos[0] || nomes[0] || "");
    const o = onde.get(de) || { pedidos: 0, setores: [], padroes: [] };
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(600px, 96vw)" role="dialog" aria-label="Substituir pessoa">
      <div class="modal-h"><h2>Substituir pessoa</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p class="hint" style="margin:0 0 14px">Troca uma pessoa por outra <b>em tudo de uma vez</b>: pedidos em aberto, setores de produção e as funções que ela cuidava. Pedidos já produzidos ficam com o histórico intacto.</p>
        ${orfaos.length ? `<div class="aviso" style="margin:0 0 14px"><b>${orfaos.length === 1 ? "1 nome aparece" : n0(orfaos.length) + " nomes aparecem"} no app mas não ${orfaos.length === 1 ? "está" : "estão"} mais na equipe:</b> ${esc(orfaos.join(", "))}. Substitua ${orfaos.length === 1 ? "ele" : "eles"} por alguém do time — ou por "ninguém", para limpar.</div>` : ""}
        ${f("Tirar de", `<select class="sel" id="re-de">${nomes.map((n) => { const x = onde.get(n);
          const tot = x.pedidos + x.setores.length + x.padroes.length;
          return `<option value="${esc(n)}" ${n === de ? "selected" : ""}>${esc(n)}${S.equipe.some((p) => p.nome === n) ? "" : " · fora da equipe"} — ${n0(tot)} ${tot === 1 ? "lugar" : "lugares"}</option>`; }).join("")
          || '<option value="">ninguém aparece como responsável</option>'}</select>`)}
        ${de ? `<div style="border:1px solid var(--line);border-radius:9px;padding:11px 13px;margin-bottom:14px;font-size:12.5px">
          <b>${esc(de)}</b> aparece em:
          <div style="margin-top:5px;color:var(--ink-2)">
            ${o.pedidos ? `<div>· <b>${n0(o.pedidos)}</b> ${o.pedidos === 1 ? "pedido em aberto" : "pedidos em aberto"}</div>` : ""}
            ${o.setores.length ? `<div>· setor: ${esc(o.setores.join(", "))}</div>` : ""}
            ${o.padroes.length ? `<div>· responsável por: ${esc(o.padroes.join(", "))}</div>` : ""}
            ${!o.pedidos && !o.setores.length && !o.padroes.length ? "<div>· nenhum lugar</div>" : ""}
          </div></div>` : ""}
        ${f("Passar para", `<select class="sel" id="re-para"><option value="">— ninguém (deixa livre) —</option>
          ${equipe.filter((n) => n !== de).map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}</select>`,
          "escolher ninguém apaga o nome dos setores e padrões, e deixa os pedidos livres para quem pegar")}
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="aplicar-reatribuir">Substituir em tudo</button></div></div></div>`;
  }

  return null;
}

/* janelas de estruturas, fechamento e bônus */
function modaisFabrica(m) {
  if (m.tipo === "estruturas") {
    const b2 = (m.busca || "").trim().toLowerCase();
    let lista = (S.cad.estruturas || []).slice().sort((a, y) => String(a.processo).localeCompare(String(y.processo)));
    if (b2) lista = lista.filter((e) => [e.processo, e.obs, ...(e.etapas || []).map((x) => x.nome)].some((v) => String(v || "").toLowerCase().includes(b2)));
    const usoProc = new Map();
    S.produtos.forEach((p) => { const k = normProc(p.processo); if (k) usoProc.set(k, (usoProc.get(k) || 0) + 1); });
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(1080px, 96vw)" role="dialog" aria-label="Estruturas de processo">
      <div class="modal-h"><h2>Estruturas de processo</h2><span class="tag">${n0((S.cad.estruturas || []).length)} processos</span>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p class="hint" style="margin:0 0 14px">É o antigo <b>LinkEstrutura</b> da planilha, agora dentro do app. Cada processo tem até 6 etapas na ordem em que a produção acontece, e o valor unitário que a prestadora recebe por peça em cada etapa. Daqui saem os campos de quantidade por etapa na conferência e a conta do fechamento do mês.</p>
        <div class="filters" style="padding:0 0 12px">
          <div class="search">${svg(IC.busca)}<input class="inp" id="q-estr" style="width:260px" placeholder="Buscar processo ou etapa" value="${esc(m.busca || "")}"></div>
          <select class="sel" id="estr-prest" style="margin-left:auto;min-width:190px" title="Uma tabela só com os processos que esta prestadora faz">
            <option value="todas">Tabela de todos os processos</option>
            ${(S.cad.prestadoras || []).filter((p) => p.ativo !== false).map((p) =>
              `<option value="${esc(p.nome)}"${m.prest === p.nome ? " selected" : ""}>Só o que ${esc(p.nome)} faz</option>`).join("")}
          </select>
          <button class="btn sm" data-act="imprimir-valores" title="Abre a folha pronta para imprimir — na janela de impressão, escolha “Salvar como PDF” para mandar por WhatsApp">${svg(IC.impressora)}Tabela de valores (PDF)</button>
          <button class="btn primary sm" data-act="estrutura-nova">${svg(IC.mais)}Novo processo</button>
        </div>
        <div class="tw"><table class="t"><thead><tr><th>Processo</th><th>Etapas (na ordem)</th><th class="num">Valor por peça</th><th class="num">Produtos</th><th>Ação</th></tr></thead>
        <tbody>${lista.map((e) => { const soma = (e.etapas || []).reduce((s2, x) => s2 + (Number(x.valor) || 0), 0);
          const semValor = (e.etapas || []).filter((x) => !(Number(x.valor) > 0)).length;
          return `<tr>
          <td><b>${esc(e.processo)}</b>${e.obs ? `<div style="font-size:11px;color:var(--ink-3)">${esc(String(e.obs))}</div>` : ""}</td>
          <td style="font-size:11.5px">${(e.etapas || []).map((x) => `<span class="tag" style="margin-right:4px">${esc(x.nome)}${Number(x.valor) > 0 ? ` · ${fmoeda(x.valor)}` : ""}</span>`).join("") || '<span style="color:var(--ink-3)">sem etapas</span>'}</td>
          <td class="num">${soma > 0 ? `<b>${fmoeda(soma)}</b>` : "—"}${semValor ? `<div style="font-size:10.5px;color:var(--amber)">${semValor} etapa${semValor > 1 ? "s" : ""} sem valor</div>` : ""}</td>
          <td class="num">${usoProc.get(normProc(e.processo)) || "—"}</td>
          <td style="white-space:nowrap"><button class="btn sm" data-estr-edit="${esc(e.processo)}">Editar</button></td></tr>`; }).join("")
          || (b2 ? vazioLinha("filtro", "Nenhum resultado", "Nenhum processo encontrado com esta busca.")
            : vazioLinha("nada", "Ainda não há processos", "Um processo guarda as etapas pelas quais o produto passa — é o que o canhoto imprime.", `<button class="btn sm" data-act="estrutura-nova">Novo processo</button>`))}
        </tbody></table></div>
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Fechar</button></div></div></div>`;
  }

  if (m.tipo === "estrutura") {
    const e = m.e, novo = m.novo;
    const etapas = e.etapas || [];
    const soma = etapas.reduce((s2, x) => s2 + (Number(x.valor) || 0), 0);
    const usados = S.produtos.filter((p) => normProc(p.processo) === normProc(m.original)).length;
    const pedidosVivos = S.pedidos.filter((r) => PED_VIVO.includes(r.status) && normProc(r.processo) === normProc(m.original)).length;
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(760px, 96vw)" role="dialog" aria-label="Estrutura de processo">
      <div class="modal-h"><h2>${novo ? "Novo processo" : esc(m.original)}</h2>
        ${!novo && usados ? `<span class="tag">${n0(usados)} produtos</span>` : ""}
        ${!novo && pedidosVivos ? `<span class="tag amber">${n0(pedidosVivos)} pedidos abertos</span>` : ""}
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        ${f("Código do processo", `<input class="inp" data-ep="processo" value="${esc(e.processo || "")}" placeholder="ex.: GRAVATA">`,
          "é o mesmo nome que aparece no cadastro do produto — sempre em maiúsculas")}
        ${f("Observação (opcional)", `<input class="inp" data-ep="obs" value="${esc(e.obs == null ? "" : String(e.obs))}" placeholder="ex.: 220 — anotação livre">`)}
        <div class="fld" style="margin-bottom:6px"><span>Etapas, na ordem da produção (até 6)</span></div>
        <table class="t"><thead><tr><th style="width:38px">#</th><th>Etapa</th><th class="num" style="width:130px">Valor por peça</th><th style="width:40px"></th></tr></thead>
        <tbody>${etapas.map((et, i) => `<tr>
          <td class="mono" style="color:var(--ink-3)">P${i + 1}</td>
          <td><input class="inp" style="padding:6px 9px" data-ex="${i}|nome" value="${esc(et.nome || "")}" placeholder="ex.: COLA"></td>
          <td><label class="rs-in"><input class="inp num" style="padding:6px 9px" type="number" step="0.001" min="0" data-ex="${i}|valor" value="${et.valor ?? ""}" placeholder="0,00"></label></td>
          <td><button class="btn sm ghost" data-exdel="${i}" title="Remover etapa">×</button></td></tr>`).join("")
          || vazioLinha("nada", "Ainda não há etapas", "Comece adicionando a primeira abaixo.")}
        </tbody></table>
        <div style="display:flex;align-items:center;gap:12px;margin-top:10px">
          ${etapas.length < 6 ? `<button class="btn sm" data-act="etapa-add">+ Nova etapa</button>` : `<span class="hint">Limite de 6 etapas, como na planilha.</span>`}
          <span style="margin-left:auto;font-size:12.5px">Total por peça: <b>${fmoeda(soma)}</b></span>
        </div>
        <p class="hint" style="margin-top:12px">O valor é <b>por peça</b> em cada etapa: uma prestadora que faz só a COLA de 500 peças recebe 500 × o valor da COLA. Alterar um valor aqui vale para as conferências <b>daqui pra frente</b> — fechamentos já feitos guardam o valor da época.</p>

        ${(() => { /* ---------- a receita ----------
            Fica aqui, no processo, e não no produto: são ~1.700 SKUs contra uma
            dúzia de processos, e a diferença entre uma bandana azul e uma
            vermelha quase nunca está no que ela consome. */
          const rec = (m.receita ||= (receitaDoProcesso(m.original)?.itens || []).map((x) => ({ ...x })));
          const lista = insumos().filter((x) => x.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome));
          if (!lista.length) return `<div class="secao">Receita — o que uma peça consome</div>
            <p class="hint" style="margin:0">Cadastre os insumos primeiro, em <b>Insumos</b>. Com a receita aqui, o app passa a saber sozinho quanto material um pedido vai levar — e desconta do estoque quando ele é conferido.</p>`;
          return `<div class="secao">Receita — o que UMA peça consome</div>
          <p class="hint" style="margin:0 0 10px">Com isso preenchido, um pedido de 500 peças reserva o material na hora em que nasce e dá baixa quando é conferido. Sem isso, o estoque de insumos só se mexe à mão.</p>
          <table class="t" style="font-size:12.5px"><thead><tr><th>Insumo</th><th class="num" style="width:120px">Por peça</th><th style="width:90px">Unidade</th><th class="num" style="width:110px">Em 100 peças</th><th style="width:40px"></th></tr></thead>
          <tbody>${rec.map((it, i) => { const ins = insumoPorId(it.insumoId);
            return `<tr>
            <td>${pickInsumo(it.insumoId, `data-rc="${i}|insumoId"`)}</td>
            <td><input class="inp num" style="padding:6px 9px;width:92px" type="number" step="any" min="0" data-rc="${i}|qtd" value="${it.qtd ?? ""}" placeholder="0"></td>
            <td style="font-size:11.5px;color:var(--ink-3)">${esc(ins?.unidade || "—")}</td>
            <td class="num mono" style="color:var(--ink-3)">${it.qtd ? nDec(Number(it.qtd) * 100) : "—"}</td>
            <td><button class="btn sm ghost" data-rcdel="${i}" title="Remover">×</button></td></tr>`; }).join("")
            || vazioLinha("nada", "Sem receita ainda", "Este processo não desconta insumo nenhum do estoque.")}
          </tbody></table>
          <div style="display:flex;align-items:center;gap:12px;margin-top:10px">
            <button class="btn sm" data-act="receita-add">+ Insumo na receita</button>
            ${(() => { const c = rec.filter((x) => x.insumoId && x.qtd).reduce((s2, x) => {
                const cu = custoInsumo(x.insumoId); return s2 + (cu ? cu.medio * Number(x.qtd) : 0); }, 0);
              return c ? `<span style="margin-left:auto;font-size:12.5px">Material por peça: <b>${fmoeda(c)}</b> <span class="hint" style="display:inline">pela média das compras</span></span>` : ""; })()}
          </div>`; })()}
      </div>
      <div class="modal-f">
        ${!novo ? `<button class="btn ghost" data-act="excluir-estrutura">Excluir processo</button>` : ""}
        <button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="salvar-estrutura">Salvar</button></div></div></div>`;
  }

  if (m.tipo === "fecharMes") {
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:520px" role="dialog" aria-label="Fechar mês">
      <div class="modal-h"><h2>Fechar ${esc(m.mes)}</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p class="hint" style="margin:0 0 14px">Fechar o mês trava o que entra neste pagamento: os pedidos deixam de aceitar alteração de data, quantidade conferida ou mês. É o que evita que um acerto já pago mude sozinho depois — e <b>é reversível</b>: reabrir devolve tudo exatamente como estava.</p>
        <table class="t"><tbody>
          <tr><td>Prestadoras no fechamento</td><td class="num"><b>${n0(m.prestadoras)}</b></td></tr>
          <tr><td>Pedidos</td><td class="num"><b>${n0(m.pedidos)}</b></td></tr>
          ${m.bonus ? `<tr><td>Serviço</td><td class="num">${freal(m.total - m.bonus)}</td></tr>
          <tr><td>Bônus${m.comBonus ? ` · ${n0(m.comBonus)} ${m.comBonus === 1 ? "prestadora" : "prestadoras"}` : ""}</td><td class="num" style="color:var(--teal)">+ ${freal(m.bonus)}</td></tr>` : ""}
          <tr><td>Total a pagar${m.bonus ? " (com bônus)" : ""}</td><td class="num"><b>${freal(m.total)}</b></td></tr>
        </tbody></table>
        ${m.semMes ? `<div class="aviso" style="margin-top:14px">${n0(m.semMes)} ${m.semMes === 1 ? "pedido está caindo aqui" : "pedidos estão caindo aqui"} pela data de retorno, sem mês próprio. Ao fechar, ${m.semMes === 1 ? "ele recebe" : "eles recebem"} o carimbo <b>${esc(m.mes)}</b> — e <b>reabrir o mês apaga esse carimbo</b>, voltando ${m.semMes === 1 ? "ele" : "eles"} a seguir a data de retorno.</div>` : ""}
        <p class="hint" style="margin-top:14px">Enquanto vocês ainda estão moldando o app, feche e reabra à vontade: nada aqui é definitivo.</p>
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="confirmar-fechar-mes">${svg(IC.cadeado)}Fechar ${esc(m.mes)}</button></div></div></div>`;
  }

  if (m.tipo === "reabrirMes") {
    const t2 = m.trava || {};
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:500px" role="dialog" aria-label="Reabrir mês">
      <div class="modal-h"><h2>Reabrir ${esc(m.mes)}</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p class="hint" style="margin:0 0 12px">Este mês foi fechado em ${fdataHora(t2.em)}${t2.por ? ` por <b>${esc(t2.por)}</b>` : ""} com ${n0(t2.pedidos || 0)} pedidos e ${freal(t2.total || 0)}.</p>
        <p style="margin:0 0 12px;font-size:13px">Reabrir devolve o mês ao estado anterior: os pedidos voltam a aceitar correção${m.carimbos ? ` e os <b>${n0(m.carimbos)} carimbos automáticos</b> de ${esc(m.mes)} são desfeitos, voltando esses pedidos a seguir a data de retorno` : ""}. Meses escolhidos à mão na conferência continuam como estão — aquilo foi decisão de alguém, não do fechamento.</p>
        <div class="aviso">Se o pagamento deste mês já saiu, qualquer alteração daqui pra frente vai divergir do que a prestadora recebeu. Reabrir para ajustar o app é tranquilo; reabrir para mudar valor já pago, não.</div>
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="confirmar-reabrir-mes">${svg(IC.cadeadoAberto)}Reabrir mesmo assim</button></div></div></div>`;
  }

  if (m.tipo === "bonus") {
    const regras = m.regras;
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(720px, 96vw)" role="dialog" aria-label="Regras de bônus">
      <div class="modal-h"><h2>Regras de bônus</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p class="hint" style="margin:0 0 4px">No fim do mês, o valor da prestadora ganha o percentual quando ela se encaixa na regra. Uma regra pode mirar <b>quem faz</b> um processo, <b>quem não faz</b>, ou todas — e a condição pode ser de peças, de valor, ou as duas juntas.</p>
        <p class="hint" style="margin:0 0 14px">Casando mais de uma regra, vale a de <b>maior percentual</b>: a ordem em que você cadastrou não decide quanto alguém recebe.</p>
        <table class="t"><thead><tr><th style="width:158px">Aplica a</th><th>Processo</th>
          <th class="num" style="width:110px">Mín. peças/mês</th><th class="num" style="width:120px">Mín. valor/mês</th>
          <th class="num" style="width:82px">Bônus %</th><th style="width:36px"></th></tr></thead>
        <tbody>${regras.map((b2, i) => { const alvo = b2.alvo || (b2.processo ? "processo" : "todas");
          return `<tr>
          <td><select class="sel" style="padding:6px 9px;width:100%" data-bx="${i}|alvo">
            ${BONUS_ALVOS.map(([id, nome]) => `<option value="${id}" ${alvo === id ? "selected" : ""}>${nome}</option>`).join("")}</select></td>
          <td>${alvo === "todas" ? `<span class="hint" style="margin:0">qualquer processo</span>`
            : `<input class="inp" style="padding:6px 9px;width:100%" data-bx="${i}|processo" list="lista-proc-bonus" value="${esc(b2.processo || "")}" placeholder="ex.: BANDANA">`}</td>
          <td><input class="inp" style="padding:6px 9px;text-align:right;width:100%" type="number" min="0" data-bx="${i}|minPecas" value="${b2.minPecas || ""}" placeholder="—"></td>
          <td><label class="rs-in"><input class="inp" style="padding:6px 9px;width:100%" type="number" min="0" step="0.01" data-bx="${i}|minValor" value="${b2.minValor || ""}" placeholder="—"></label></td>
          <td><input class="inp" style="padding:6px 9px;text-align:right;width:100%" type="number" step="1" min="0" data-bx="${i}|pctInt" value="${Math.round((b2.pct || 0) * 100) || ""}" placeholder="0"></td>
          <td><button class="btn sm ghost" data-bxdel="${i}">×</button></td></tr>`; }).join("")
          || vazioLinha("nada", "Nenhuma regra", "Sem regra cadastrada, ninguém recebe bônus.")}</tbody></table>
        <datalist id="lista-proc-bonus">${[...new Set((S.cad.estruturas || []).map((e2) => e2.processo).concat(S.produtos.map((p2) => p2.processo)).filter(Boolean))].sort().map((x) => `<option value="${esc(x)}">`).join("")}</datalist>
        <button class="btn sm" style="margin-top:10px" data-act="bonus-add">+ Nova regra</button>
        ${(() => { const semCond = regras.filter((b2) => !(Number(b2.minPecas) > 0) && !(Number(b2.minValor) > 0) && Number(b2.pct) > 0).length;
          return semCond ? `<div class="aviso" style="margin-top:12px">${n0(semCond)} ${semCond === 1 ? "regra está" : "regras estão"} sem condição nenhuma — regra sem mínimo de peças e sem mínimo de valor não vale para ninguém.</div>` : ""; })()}
        ${(() => { /* mostra quem ganharia hoje, com o mês que está na tela */
          const ms = S.prestView.mes || (S.calc?.mesesCompetencia || [])[0];
          if (!ms || !S.calc) return "";
          const guarda = S.cad.bonus;
          S.cad.bonus = regras.map((b2) => ({ ...b2, pct: (Number(b2.pctInt ?? (b2.pct || 0) * 100) || 0) / 100 }));
          const linhas = (S.calc.prestadoras || []).map((p2) => {
            const f2 = fechamentoDe(p2, ms, p2.porMes?.[ms]);
            return f2.pct ? { nome: p2.nome, f: f2 } : null; }).filter(Boolean);
          S.cad.bonus = guarda;
          return `<div class="secao" style="margin-top:18px">Quem ganharia em ${esc(ms)}</div>
            ${linhas.length ? `<table class="t" style="font-size:12.5px"><thead><tr><th>Prestadora</th><th class="num">Peças</th><th class="num">Valor</th><th class="num">Bônus</th><th class="num">A pagar</th></tr></thead>
            <tbody>${linhas.map(({ nome, f: f2 }) => `<tr><td><b>${esc(nome)}</b></td>
              <td class="num">${n0(f2.pecas)}</td><td class="num">${freal(f2.valor)}</td>
              <td class="num"><span class="tag ok">+${Math.round(f2.pct * 100)}%</span></td>
              <td class="num"><b>${freal(f2.total)}</b></td></tr>`).join("")}</tbody></table>`
            : `<p class="hint" style="margin:0">Ninguém atinge as regras acima com o fechamento de ${esc(ms)}.</p>`}`; })()}
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="salvar-bonus">Salvar</button></div></div></div>`;
  }

  if (m.tipo === "falta") {
    const fx = m.falta;
    const fornecedores = [...new Set(S.faltas.map((x) => x.fornecedor).filter(Boolean))];
    const peds = (fx.pedidoIds || []).map((id) => pedidoPorId(id)).filter(Boolean);
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:560px" role="dialog" aria-label="Material em falta">
      <div class="modal-h"><h2>${m.novo ? "Anotar material em falta" : "Editar item em falta"}</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        ${peds.length ? `<p class="hint" style="margin:0 0 14px">Vinculado ${peds.length === 1 ? "ao pedido" : "aos pedidos"} ${peds.map((p) => `<b>${esc(p.numero)}</b>`).join(", ")} — ${peds.length === 1 ? "ele fica marcado" : "eles ficam marcados"} como <b>aguardando material</b> até o item chegar.</p>` : ""}
        ${f("Item / material em falta", `<input class="inp" data-fx="item" value="${esc(fx.item || "")}" placeholder="Ex.: fivela 20mm preta, cadarço 10mm...">`)}
        ${f("Fornecedor", `<input class="inp" data-fx="fornecedor" list="lista-forn" value="${esc(fx.fornecedor || "")}" placeholder="De quem comprar"><datalist id="lista-forn">${fornecedores.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>`, "a aba Compras agrupa por fornecedor")}
        <div class="rowform">
          ${f("Quantidade", `<input type="number" class="inp num" data-fx="qtd" value="${fx.qtd ?? ""}">`)}
          ${f("Unidade", `<input class="inp" data-fx="unidade" value="${esc(fx.unidade || "")}" placeholder="pç, m, rolo...">`)}
        </div>
        ${f("Observação", `<input class="inp" data-fx="obs" value="${esc(fx.obs || "")}">`)}
      </div>
      <div class="modal-f">${m.novo ? "" : `<button class="btn danger sm" data-act="excluir-falta">Excluir</button>`}
        <button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="salvar-falta">Salvar</button></div></div></div>`;
  }

  return null;
}

/* janelas de importação, limpeza e diagnóstico */
function modaisSistema(m) {
  /* ---------- não atualize por cima de trabalho que não subiu ----------
     Esta janela existe porque o gatilho mais provável de perda de dados no PCP
     era o aviso MENOS urgente de todos: "versão nova · Atualizar agora". */
  if (m.tipo === "riscoRecarregar") {
    const oQue = m.oQue === "atualizar" ? "buscar os dados do servidor" : "atualizar o app";
    const pend = [..._pendentes].map((x) => SECAO_NOME[x] || x);
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(560px,96vw)" role="dialog" aria-label="Risco de perder alterações">
      <div class="modal-h"><h2>Você tem alterações que ainda não subiram</h2></div>
      <div class="modal-b">
        <p style="margin:0 0 12px;line-height:1.7">Se você ${esc(oQue)} agora, <b>o que está nesta tela e ainda não foi gravado se perde</b>. Não dá para desfazer.</p>
        ${pend.length ? `<div class="aviso" style="margin:0 0 12px"><b>Esperando gravar:</b> ${esc(pend.join(", "))}.</div>` : ""}
        ${SALVO.ok === false ? `<div class="aviso" style="margin:0 0 12px;border-color:var(--perigo-borda);background:var(--perigo-fundo);color:var(--perigo)">A última gravação foi recusada pelo servidor. Tente salvar antes de sair.</div>` : ""}
        <p class="hint" style="margin:0">O caminho seguro é salvar primeiro. Se não der, baixe um backup — ele guarda tudo num arquivo e você não perde o trabalho.</p>
      </div>
      <div class="modal-f">
        <button class="btn sm ghost" data-act="backup">Baixar backup</button>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button class="btn" data-fechar="1">Continuar trabalhando</button>
          <button class="btn primary" data-act="tentar-sincronizar">Tentar salvar primeiro</button>
        </div>
      </div>
    </div></div>`;
  }

  if (m.tipo === "remocoesRetidas") {
    const itens = Array.isArray(m.itens) ? m.itens : [];
    const porCad = {};
    for (const r of itens) (porCad[r.cadastro] = porCad[r.cadastro] || []).push(r);
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:560px" role="dialog" aria-label="Remoções barradas">
      <div class="modal-h"><h2 style="display:inline-flex;align-items:center;gap:9px">${svg(IC.alerta)}Remoções barradas por segurança</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p>Uma troca de listas inteiras pediria para o servidor remover estes cadastros.
        <b>Nada foi removido.</b> Eles continuam guardados no servidor, e é de lá que a tela lê —
        na próxima abertura eles voltam a aparecer.</p>
        ${Object.keys(porCad).map((cad) => `
          <h3 style="margin:14px 0 6px">${esc(cad)} · ${porCad[cad].length}</h3>
          <div style="max-height:180px;overflow:auto;border:1px solid var(--linha);border-radius:8px">
            <table class="tb"><tbody>${porCad[cad].slice(0, 200).map((r) => `<tr>
              <td style="font-family:monospace;font-size:11.5px">${esc(r.id)}</td>
              <td>${esc(r.rotulo || "")}</td>
              <td style="opacity:.7;font-size:11.5px">${esc(r.motivo || "")}</td></tr>`).join("")}
            </tbody></table>
          </div>
          ${porCad[cad].length > 200 ? `<p style="opacity:.7;font-size:12px">…e mais ${porCad[cad].length - 200}.</p>` : ""}
        `).join("")}
        <p style="margin-top:14px">Se era mesmo para remover, apague um a um pela tela — assim cada um
        passa pela confirmação de sempre e o servidor decide entre cancelar e apagar.</p>
      </div>
      <div class="modal-f">
        <button class="btn" data-act="limpar-remocoes-retidas">Já conferi, pode limpar o aviso</button>
        <button class="btn" data-fechar="1">Fechar</button>
      </div></div></div>`;
  }

  if (m.tipo === "gravacao") {
    const e = estadoGravacao();
    const pend = [..._pendentes].map((x) => SECAO_NOME[x] || x);
    const ruim = e.tom === "erro";
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:470px" role="dialog" aria-label="Gravação">
      <div class="modal-h"><h2 style="display:inline-flex;align-items:center;gap:9px">${svg(ruim ? IC.alerta : IC.ok)}${ruim ? "Não sincronizado" : "Gravação"}</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        ${ruim ? `<div class="aviso" style="margin:0 0 14px">O que você fez continua aqui na tela, mas <b>ainda não foi gravado</b>. Não feche esta aba antes de sincronizar ou baixar um backup.</div>` : ""}
        <dl class="kv" style="border:0">
          <dt>Última sincronização</dt><dd>${SALVO.quando ? horaCurta(SALVO.quando) : "nunca"}</dd>
          <dt>Alterações pendentes</dt><dd>${n0(_pendentes.size)}</dd>
          <dt>Gravando em</dt><dd style="font-family:inherit;font-weight:600">${esc(CAMADA_NOME[CAMADA] || "verificando…")}</dd>
        </dl>
        ${pend.length ? `<div class="secao">O que falta gravar</div>
          <div style="display:flex;gap:7px;flex-wrap:wrap">${pend.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div>` : ""}
        ${SALVO.erro ? `<div class="secao">Motivo</div>
          <p class="hint mono" style="margin:0;font-size:11.5px;word-break:break-word">${esc(SALVO.erro)}</p>` : ""}
        <!-- ---------- centro de status ----------
             O resto do que o app sabe sobre si mesmo mora aqui, e não em mais
             um banner no topo: quem está junto, se saiu versão, se esta é a
             cópia de teste. Contexto tem lugar; problema tem tela. É por isso
             que o aviso CRÍTICO nunca entra nesta lista — ele fica lá fora. -->
        <div class="secao">Status do sistema</div>
        <dl class="kv" style="border:0">
          <dt>Servidor</dt><dd style="font-family:inherit;font-weight:600">${CAMADA === "supabase" ? "conectado" : CAMADA === "memoria" ? "sem gravação" : "gravando neste navegador"}</dd>
          <dt>Quem está no app</dt><dd style="font-family:inherit;font-weight:600">${(() => { const o = (typeof outrasPessoas === "function" ? outrasPessoas() : []) || [];
            return o.length ? esc(o.map((x) => x.nome).join(", ")) : "só você"; })()}</dd>
          <dt>Versão</dt><dd style="font-family:inherit;font-weight:600">${VERSAO}${S.versaoNova ? ` · <b style="color:var(--atencao)">${esc(S.versaoNova.versao)} publicada</b>` : " · em dia"}</dd>
          ${MODO_TESTE ? `<dt>Cópia de teste</dt><dd style="font-family:inherit;font-weight:600;color:var(--atencao)">o que você faz aqui NÃO vai para o app das meninas</dd>` : ""}
        </dl>
      </div>
      <div class="modal-f">
        <button class="btn" data-act="backup">Baixar backup</button>
        <button class="btn primary" style="margin-left:auto" data-act="tentar-sincronizar" ${_gravando ? "disabled" : ""}>${_gravando ? "Sincronizando…" : "Tentar sincronizar"}</button>
      </div></div></div>`;
  }

  if (m.tipo === "confirmImport") {
    const p = m.plano;
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:600px" role="dialog" aria-label="${esc(p.titulo)}">
      <div class="modal-h"><h2>${esc(p.titulo)}</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <p class="hint" style="margin:0 0 12px">Nada foi alterado ainda — confira o resumo e confirme:</p>
        ${p.linhas.filter(Boolean).map((l) => `<p style="margin:0 0 9px;font-size:13.5px;line-height:1.55">${l}</p>`).join("")}
        ${(p.opcoes || []).map((o) => `<label style="display:flex;gap:9px;align-items:flex-start;font-size:13px;line-height:1.55;cursor:pointer;margin-top:10px">
          <input type="checkbox" class="chk" id="op-${o.id}" ${o.checked ? "checked" : ""} style="margin-top:2px"><span>${o.label}</span></label>`).join("")}
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        <button class="btn primary" data-act="aplicar-import">OK, importar</button></div></div></div>`;
  }

  if (m.tipo === "resultImport") {
    const r = m.rel;
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:600px" role="dialog" aria-label="${esc(r.titulo)}">
      <div class="modal-h"><h2 style="display:inline-flex;align-items:center;gap:8px">${svg(r.ok ? IC.ok : IC.alerta)}${esc(r.titulo)}</h2>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        ${r.linhas.map((l) => `<p style="margin:0 0 9px;font-size:13.5px;line-height:1.55">${l}</p>`).join("")}
      </div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Fechar</button></div></div></div>`;
  }

  if (m.tipo === "limpeza") {
    const alvo = m.alvo || "pedidos";
    const fl = m.fl || (m.fl = {});
    const procsTodos = [...new Set([...(S.cad.estruturas || []).map((e) => e.processo),
      ...S.produtos.map((p) => p.processo).filter(Boolean)])].filter(Boolean).sort();

    /* ---- quem entra na faxina, já com as travas de segurança aplicadas ---- */
    const alvos = {
      pedidos: () => {
        let r = S.pedidos.slice();
        if (fl.origem === "app") r = r.filter((x) => x.criadoNoApp);
        else if (fl.origem === "planilha") r = r.filter((x) => !x.criadoNoApp);
        else if (fl.origem === "forauda") r = r.filter((x) => foraDaPlanilha(x));
        else if (fl.origem === "numdif") r = r.filter((x) => numeroComOutroSku(x));
        if (fl.procs?.length) r = r.filter((x) => fl.procs.includes(String(x.processo || "").toUpperCase()));
        if (fl.etapas?.length) r = r.filter((x) => fl.etapas.includes(x.status));
        if (fl.prest) r = r.filter((x) => (x.prestadora || "—") === fl.prest);
        if (fl.antesDe) r = r.filter((x) => String(x.criadoEm || "") < fl.antesDe);
        return r;
      },
      produtos: () => {
        let r = S.produtos.slice();
        if (fl.procs?.length) r = r.filter((p) => fl.procs.includes(String(p.processo || "").toUpperCase()));
        if (fl.semProc) r = r.filter((p) => !p.processo);
        if (fl.semUso) r = r.filter((p) => !S.pedidos.some((x) => (opPorId(x.opId)?.sku || x.sku) === p.sku));
        if (fl.semFoto) r = r.filter((p) => !p.foto);
        return r;
      },
      estoque: () => (S.estoque?.itens || []),
      estruturas: () => (S.cad.estruturas || []).filter((e) => !fl.procs?.length || fl.procs.includes(String(e.processo).toUpperCase())),
      prestadoras: () => (S.cad.prestadoras || []).filter((p) => !fl.soInativas || p.ativo === false),
      equipe: () => S.equipe.filter((p) => !fl.soInativas || p.ativo === false),
      compras: () => S.faltas.filter((f) => !fl.soRecebidas || f.status === "recebida"),
      fechamentos: () => (S.cad.mesesFechados || []),
      tudo: () => [...S.pedidos, ...S.produtos, ...(S.estoque?.itens || []), ...(S.cad.estruturas || []),
        ...(S.cad.prestadoras || []), ...S.equipe, ...S.faltas],
    };
    let lista = alvos[alvo]();

    /* ---- travas: nada aqui pode ser apagado, e o app diz por quê ---- */
    const travados = [];
    if (alvo === "pedidos") {
      const fech = lista.filter((r) => r.status === "retornada" && mesFechado(competenciaDe(r)));
      if (fech.length) travados.push({ n: fech.length, txt: "em meses já fechados — reabra o mês antes" });
      lista = lista.filter((r) => !(r.status === "retornada" && mesFechado(competenciaDe(r))));
    }
    if (alvo === "produtos") {
      const vivos = lista.filter((p) => S.pedidos.some((x) => PED_VIVO.includes(x.status) && (opPorId(x.opId)?.sku || x.sku) === p.sku));
      if (vivos.length) travados.push({ n: vivos.length, txt: "com pedido em aberto — conclua ou cancele antes" });
      const ids = new Set(vivos.map((p) => p.id));
      lista = lista.filter((p) => !ids.has(p.id));
    }
    const comHistorico = alvo === "pedidos" ? lista.filter((r) => r.status === "retornada").length : 0;

    const ABAS_ALVO = [["pedidos", "Pedidos", "Pedidos e Conferência"], ["produtos", "Produtos", "Cadastro de produtos"],
      ["estoque", "Estoque", "Demanda"], ["estruturas", "Estruturas", "Prestadoras › Estruturas"],
      ["prestadoras", "Prestadoras", "Cadastro de prestadoras"], ["equipe", "Equipe", "Equipe e setores"],
      ["compras", "Compras", "Itens em falta"], ["fechamentos", "Fechamentos", "Meses travados"],
      ["tudo", "TUDO", "Apaga a base inteira e devolve o app ao estado de fábrica"]];
    const chipF = (on, dado, rot) => `<label class="chip" style="cursor:pointer;gap:6px;${on ? "border-color:var(--red);background:var(--red-soft)" : ""}"><input type="checkbox" class="chk" ${dado} ${on ? "checked" : ""}> ${rot}</label>`;

    const filtros = {
      pedidos: `
        <div class="fld" style="margin-bottom:11px"><span>De onde veio</span>
          <div style="display:flex;gap:7px;margin-top:4px">
            ${[["todos", "Qualquer origem"], ["forauda", "Não estão na planilha"], ["numdif", "Mesmo nº, SKU diferente"],
               ["app", "Criados no app"], ["planilha", "Vieram da planilha"]]
              .map(([o, rot]) => `<button class="chip ${(fl.origem || "todos") === o ? "on" : ""}" data-lf="origem|${o}">${rot}</button>`).join("")}
          </div>
          ${S.cad.retratoPlanilha ? `<div class="hint" style="margin-top:5px">Comparando com a planilha importada em ${fdataHora(S.cad.retratoPlanilha.em)} · ${n0((S.cad.retratoPlanilha.chaves || []).length)} linhas.</div>`
            : `<div class="aviso" style="margin-top:7px">Importe o .xlsm uma vez para o app saber o que a planilha contém — só assim ele consegue comparar.</div>`}</div>
        <div class="fld" style="margin-bottom:11px"><span>Etapa</span>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
            ${P_STATUS.map((st) => chipF((fl.etapas || []).includes(st), `data-lfm="etapas|${st}"`, esc(P_LABEL[st] || st))).join("")}
          </div></div>
        <div class="fld" style="margin-bottom:11px"><span>Processo</span>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
            ${procsTodos.map((pr) => chipF((fl.procs || []).includes(pr), `data-lfm="procs|${esc(pr)}"`, esc(pr))).join("") || '<span class="hint">nenhum processo cadastrado</span>'}
          </div></div>
        <div class="rowform">
          ${f("Criados antes de", `<input type="date" class="inp" data-lfv="antesDe" value="${esc(fl.antesDe || "")}">`, "deixe vazio para não filtrar por data")}
          ${f("Prestadora", `<select class="sel" data-lfv="prest"><option value="">— qualquer —</option>${nomesPrest().map((n) => `<option ${fl.prest === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>`)}
        </div>`,
      produtos: `
        <div class="fld" style="margin-bottom:11px"><span>Processo</span>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
            ${procsTodos.map((pr) => chipF((fl.procs || []).includes(pr), `data-lfm="procs|${esc(pr)}"`, esc(pr))).join("")}
          </div></div>
        <div style="display:flex;flex-wrap:wrap;gap:7px">
          ${chipF(fl.semProc, 'data-lfb="semProc"', "Só os sem processo definido")}
          ${chipF(fl.semUso, 'data-lfb="semUso"', "Só os que nunca tiveram pedido")}
          ${chipF(fl.semFoto, 'data-lfb="semFoto"', "Só os sem foto")}
        </div>`,
      estruturas: `<div class="fld"><span>Processo</span><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
          ${procsTodos.map((pr) => chipF((fl.procs || []).includes(pr), `data-lfm="procs|${esc(pr)}"`, esc(pr))).join("")}
        </div></div>`,
      prestadoras: `<div style="display:flex;gap:7px">${chipF(fl.soInativas, 'data-lfb="soInativas"', "Só as inativas")}</div>`,
      equipe: `<div style="display:flex;gap:7px">${chipF(fl.soInativas, 'data-lfb="soInativas"', "Só as inativas")}</div>
        <p class="hint" style="margin:9px 0 0">As contas de acesso ao servidor não são apagadas — só a divisão de tarefas dentro do app.</p>`,
      compras: `<div style="display:flex;gap:7px">${chipF(fl.soRecebidas, 'data-lfb="soRecebidas"', "Só as já recebidas")}</div>`,
      estoque: `<p class="hint" style="margin:0">Apaga a fotografia inteira do Faderim — não dá para escolher parte dela. A Demanda fica vazia até você subir o CSV de novo.</p>`,
      tudo: `<div class="aviso" style="border-color:var(--red);background:var(--red-soft);margin:0 0 12px">
          <b>Isto zera o aplicativo.</b> Somem pedidos, produtos, estoque, estruturas, prestadoras, equipe, setores, compras e configurações — inclusive as travas de fechamento.
          As contas de acesso no servidor continuam existindo.</div>
        <dl class="kv" style="border:0;margin:0 0 12px">
          <dt>Pedidos</dt><dd>${n0(S.pedidos.length)}</dd>
          <dt>Produtos</dt><dd>${n0(S.produtos.length)}</dd>
          <dt>SKUs no estoque</dt><dd>${n0(S.estoque?.itens?.length || 0)}</dd>
          <dt>Estruturas</dt><dd>${n0((S.cad.estruturas || []).length)}</dd>
          <dt>Prestadoras</dt><dd>${n0((S.cad.prestadoras || []).length)}</dd>
          <dt>Equipe</dt><dd>${n0(S.equipe.length)}</dd></dl>
        ${f("Para confirmar, escreva APAGAR", `<input class="inp" data-lfv="palavra" value="${esc(fl.palavra || "")}" placeholder="APAGAR" autocomplete="off" spellcheck="false">`,
          "digitar a palavra é de propósito: é a única ação do app que apaga tudo de uma vez")}`,
      fechamentos: `<p class="hint" style="margin:0">Destrava todos os meses fechados. Pedidos, valores e conferências continuam intactos — só a trava sai.</p>`,
    };

    const rotulo = (x) => alvo === "pedidos" ? `${x.numero} · ${esc(skuDoPedido(x) || "—")} · ${esc(P_LABEL[x.status] || x.status)}${numeroComOutroSku(x) ? "  ← na planilha este nº é de outro SKU" : foraDaPlanilha(x) ? "  ← não existe na planilha" : ""}`
      : alvo === "produtos" ? `${x.sku} · ${esc((x.descricao || "").slice(0, 34))}`
      : alvo === "estruturas" ? x.processo : alvo === "estoque" ? x.sku
      : alvo === "fechamentos" ? x.mes : (x.nome || x.item || "—");

    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(780px, 96vw)" role="dialog" aria-label="Faxina de dados">
      <div class="modal-h"><h2>Apagar dados</h2><span class="tag red">não tem volta</span>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b">
        <div class="aviso" style="margin:0 0 13px;display:flex;align-items:center;gap:10px">
          <span><b>Baixe um backup antes.</b> É o único caminho de volta.</span>
          <button class="btn sm" style="margin-left:auto" data-act="backup">Baixar backup</button></div>
        ${(() => { /* outra sessão aberta regrava os dados por cima do que você apagar */
          const o = m.outraSessao;
          if (!o) return "";
          return `<div class="aviso" style="margin:0 0 13px;border-color:var(--red);background:var(--red-soft)">
            <b>Tem outra pessoa (ou outra aba) com o app aberto.</b> Última gravação: ${esc(o.por || "alguém")} em ${fdataHora(o.em)}.
            Se apagar agora, a tela dela ainda tem os dados na memória e vai regravá-los por cima assim que fizer qualquer coisa.
            <b>Feche as outras abas e peça para todas saírem antes de apagar.</b></div>`; })()}

        <div class="fld" style="margin-bottom:13px"><span>O que você quer limpar</span>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:5px">
            ${ABAS_ALVO.map(([id, rot, onde]) => `<button class="chip ${alvo === id ? "on" : ""}" data-lalvo="${id}" title="${esc(onde)}">${rot}</button>`).join("")}
          </div></div>

        <div style="border:1px solid var(--line);border-radius:10px;padding:12px 13px;margin-bottom:13px">
          ${filtros[alvo] || ""}
        </div>

        ${travados.map((t2) => `<div class="aviso" style="margin:0 0 9px"><b>${n0(t2.n)} protegidos</b> — ${esc(t2.txt)}. Eles ficam fora desta faxina.</div>`).join("")}

        <div style="border:1.5px solid ${lista.length ? "var(--red)" : "var(--line)"};background:${lista.length ? "var(--red-soft)" : "var(--surface-2)"};border-radius:10px;padding:12px 14px">
          <div style="font-size:14px"><b>${n0(lista.length)}</b> ${lista.length === 1 ? "registro será apagado" : "registros serão apagados"}${comHistorico ? ` · <b>${n0(comHistorico)}</b> já foram produzidos e pagos` : ""}</div>
          ${lista.length ? `<div style="max-height:150px;overflow:auto;margin-top:8px;font-size:12px;font-family:var(--mono);color:var(--ink-2);line-height:1.6">
            ${lista.slice(0, 80).map((x) => `<div>${esc(rotulo(x))}</div>`).join("")}
            ${lista.length > 80 ? `<div style="color:var(--ink-3)">e mais ${n0(lista.length - 80)}…</div>` : ""}</div>` : ""}
          ${comHistorico ? `<div class="hint" style="margin-top:8px">Apagar pedido já produzido tira ele do fechamento das prestadoras e do histórico. Se foi pago, o registro do pagamento some junto.</div>` : ""}
        </div>
      </div>
      <div class="modal-f">
        <button class="btn" style="margin-left:auto" data-fechar="1">Cancelar</button>
        ${alvo === "tudo"
          ? (String(fl.palavra || "").trim().toUpperCase() === "APAGAR"
            ? `<button class="btn danger" data-act="confirmar-limpeza">Apagar TUDO e recomeçar</button>`
            : `<button class="btn" disabled>Escreva APAGAR para liberar</button>`)
          : lista.length ? `<button class="btn danger" data-act="confirmar-limpeza">Apagar ${n0(lista.length)}</button>` : `<button class="btn" disabled>Nada selecionado</button>`}</div></div></div>`;
  }

  if (m.tipo === "diagnostico") {
    return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:560px" role="dialog" aria-label="Diagnóstico">
      <div class="modal-h"><h2>Diagnóstico</h2><button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div class="modal-b"><pre style="white-space:pre-wrap;font-family:var(--mono);font-size:12px;line-height:1.7;margin:0">${esc(m.linhas.join("\n"))}</pre>
      <p class="hint" style="margin-top:14px">Tire um print deste quadro e me mande — cada linha testa um pedaço do app de verdade.</p></div>
      <div class="modal-f"><button class="btn" style="margin-left:auto" data-fechar="1">Fechar</button></div></div></div>`;
  }

  return null;
}


/* ===========================================================================
   v8.22 · O QUE ESTÁ DIGITADO NUMA JANELA ABERTA NÃO SE PERDE NUM REDESENHO
   ---------------------------------------------------------------------------
   O defeito que isto conserta, medido em `testes/regressao-2304-documento.js`:
   com a janela do pedido aberta, um `render()` qualquer reescrevia a janela a
   partir do objeto — e o número recém-digitado, que só existia no campo,
   sumia. A pessoa clicava em Salvar sem perceber e gravava o valor VELHO, com
   a data de alteração NOVA. Foi o que aconteceu com o pedido 2304: 182 na
   tela, 150 gravado, `atualizadoEm` avançado.

   Guarda o que está nos campos, e repõe depois de a tela ser reescrita. Guarda
   por CHAVE (o `data-m`, o `data-emb`, o id), não por posição: a janela pode
   voltar com um campo a mais ou a menos.

   Só campos que a pessoa MEXEU entram — comparados com o valor que o HTML
   trouxe (`defaultValue`). Repor um campo intocado por cima do valor novo do
   objeto seria o defeito ao contrário: a novidade do servidor nunca apareceria.
   =========================================================================== */
function colherDigitadoDaJanela() {
  if (typeof document === "undefined" || !document.querySelector(".ov")) return null;
  const ov = document.querySelector(".ov");
  const guardado = [];
  ov.querySelectorAll("input, textarea, select").forEach((el2) => {
    /* v8.84 · `data-m-et` é escrito SEM valor (`<input data-m-et value="COLA">`),
       então `dataset.mEt` vale "" — que é falso. A cadeia caía para o `id`, e as
       etapas não tinham id: elas nunca eram guardadas. Resultado: desmarcar
       COLA e fazer a janela redesenhar devolvia COLA marcada, e o papel saía
       com uma etapa que a pessoa tinha tirado. Aqui a pergunta passa a ser se o
       atributo EXISTE, não se ele tem conteúdo. */
    /* v8.110 · O GRUPO FAZ PARTE DA IDENTIDADE DO CAMPO
       Na janela de criar pedidos há um bloco por SKU. Os campos de embalagem
       carregam o índice do grupo em `data-ppg`, mas a chave olhava só o
       `data-pp`: com dois SKUs na janela os dois viravam `pp:embalagemTipo`, e
       na volta os dois valores caíam no PRIMEIRO campo do documento — a
       embalagem de um SKU ia parar no outro, e ela sai impressa no canhoto.
       Sem grupo (a janela de um pedido, o cadastro do produto) a chave
       continua sendo a de antes. */
    const chave = el2.dataset.m ? "m:" + el2.dataset.m
      : el2.dataset.emb ? "emb:" + el2.dataset.emb
      : el2.dataset.pp ? "pp:" + el2.dataset.pp + (el2.dataset.ppg != null ? ":" + el2.dataset.ppg : "")
      : el2.dataset.mEt != null ? "et:" + el2.value
      /* v8.110 · e os chips de etapa da MESMA janela não casavam com chave
         nenhuma: eles são `data-etuso`, não `data-m-et`. Não eram guardados —
         desmarcar uma etapa, abrir outra janela e voltar devolvia a etapa
         marcada, e o papel saía mandando fazer trabalho que ninguém pediu. */
      : el2.dataset.etuso != null ? "etuso:" + el2.dataset.etuso + ":" + el2.value
      : el2.id ? "id:" + el2.id : null;
    if (!chave) return;
    if (el2.type === "checkbox" || el2.type === "radio") {
      if (el2.checked !== el2.defaultChecked) guardado.push({ chave, marcado: el2.checked });
      return;
    }
    /* `defaultValue` é o que veio no HTML. Diferente dele = a pessoa mexeu. */
    if (el2.tagName === "SELECT") {
      const padrao = Array.from(el2.options).find((o) => o.defaultSelected);
      /* v8.84 · quando NENHUMA option veio marcada no HTML, o padrão é a
         PRIMEIRA — é o que o navegador mostra. Sem esta linha, um select
         desenhado sem `selected` nunca era guardado: "Tipo de embalagem" num
         produto que ainda não tem embalagem cai exatamente nesse caso, e a
         escolha da pessoa sumia no primeiro redesenho da janela. A regra
         continua a mesma — só entra o que está DIFERENTE do que o HTML trouxe. */
      const valorPadrao = padrao ? padrao.value : (el2.options[0] ? el2.options[0].value : "");
      if (el2.value !== valorPadrao) guardado.push({ chave, valor: el2.value });
      return;
    }
    if (el2.value !== el2.defaultValue) guardado.push({ chave, valor: el2.value });
  });
  if (!guardado.length) return null;
  /* A divisão embalar/mix é guardada À PARTE, com os DOIS valores, mexidos ou
     não. Sem isso, quando só um dos dois tinha sido alterado, a soma saía pela
     metade e a divisão velha voltava a caber num pedido que encolheu — o teste
     `criar-completo` pegou exatamente esse buraco. */
  const leia = (sel) => { const el3 = ov.querySelector(sel); return el3 ? el3.value : null; };
  const divisao = { embalar: leia('[data-m="qtdEmbalar"]'), mix: leia('[data-m="qtdMix"]') };
  const foco = document.activeElement;
  return { guardado, divisao,
    foco: foco && ov.contains(foco) && foco.id ? "#" + foco.id : null,
    cursor: foco && typeof foco.selectionStart === "number" ? foco.selectionStart : null };
}

function reporDigitadoNaJanela(g) {
  if (!g || !g.guardado || typeof document === "undefined") return 0;
  const ov = document.querySelector(".ov");
  if (!ov) return 0;
  let repostos = 0;
  /* `qtdEmbalar` e `qtdMix` são uma DIVISÃO, não dois números soltos: eles só
     fazem sentido juntos. Se a quantidade do pedido diminuiu, a divisão antiga
     não cabe mais — e repor um dos dois, ou os dois, seria fazer o papel sair
     mandando embalar mais do que o pedido tem. Quando a soma não cabe, nenhum
     dos dois volta e o padrão do bloco vale. É a regra que já existia desde a
     v8.20; ela quase morreu neste conserto, e o teste `criar-completo` pegou. */
  let divisaoNaoCabe = false;
  if (g.divisao && (g.divisao.embalar != null || g.divisao.mix != null)) {
    const campo = ov.querySelector('[data-m="qtdEmbalar"]') || ov.querySelector('[data-m="qtdMix"]');
    const teto = campo && campo.getAttribute("max");
    if (teto !== null && teto !== "" && teto !== undefined) {
      const soma = (Number(g.divisao.embalar) || 0) + (Number(g.divisao.mix) || 0);
      if (soma > Number(teto)) divisaoNaoCabe = true;
    }
  }
  for (const item of g.guardado) {
    const [tipo, resto] = [item.chave.slice(0, item.chave.indexOf(":")), item.chave.slice(item.chave.indexOf(":") + 1)];
    /* o par do que a chave guardou. `pp` vem com o grupo no fim quando há
       grupo; sem ele, `:not([data-ppg])` separa a janela de um pedido só da
       janela de vários — é a mesma regra que `pedLerEmbalagemDoForm` já usa. */
    const parte = (s2) => { const i = s2.indexOf(":");
      return i < 0 ? [s2, null] : [s2.slice(0, i), s2.slice(i + 1)]; };
    const sel = tipo === "m" ? `[data-m="${CSS.escape(resto)}"]`
      : tipo === "emb" ? `[data-emb="${CSS.escape(resto)}"]`
      : tipo === "pp" ? (() => { const i = resto.lastIndexOf(":");
          return i < 0 ? `[data-pp="${CSS.escape(resto)}"]:not([data-ppg])`
            : `[data-pp="${CSS.escape(resto.slice(0, i))}"][data-ppg="${CSS.escape(resto.slice(i + 1))}"]`; })()
      : tipo === "et" ? `[data-m-et][value="${CSS.escape(resto)}"]`
      : tipo === "etuso" ? (() => { const [gi, val] = parte(resto);
          return `[data-etuso="${CSS.escape(gi)}"][value="${CSS.escape(val == null ? "" : val)}"]`; })()
      : `#${CSS.escape(resto)}`;
    let el2 = null;
    try { el2 = ov.querySelector(sel); } catch { el2 = null; }
    if (!el2) continue;
    if ("marcado" in item) {
      el2.checked = item.marcado;
      /* v8.89 · a MESMA sincronia do `change`, no caminho do repaint.
         Medido: marcar COLA e a janela repintar por outro motivo devolvia a
         caixa marcada e o chip APAGADO — o desenho novo saiu do estado (que
         ainda não tem a etapa) e só o `checked` foi reposto. Quem desenha o
         chip aceso é a classe `on`; ela acompanha aqui também. Só visual: quem
         lê as etapas na gravação continua lendo o `checked`. */
      try {
        const rot = el2.closest && el2.closest("label.chip");
        if (rot && rot.classList) rot.classList.toggle("on", !!item.marcado);
      } catch (e) {}
      repostos++; continue;
    }
    if (divisaoNaoCabe && (item.chave === "m:qtdEmbalar" || item.chave === "m:qtdMix")) continue;
    /* O campo pode ter voltado com um limite MENOR: é o caso de embalar/mix
       quando a quantidade do pedido diminuiu. Repor 100 num campo cujo máximo
       agora é 30 seria desfazer uma regra que existe desde a v8.20 — a divisão
       antiga não cabe mais e o padrão volta a valer. Quem manda é o `max` do
       próprio campo, que os blocos já escrevem. */
    const teto = el2.getAttribute && el2.getAttribute("max");
    if (teto !== null && teto !== "" && Number(item.valor) > Number(teto)) continue;
    const piso = el2.getAttribute && el2.getAttribute("min");
    if (piso !== null && piso !== "" && item.valor !== "" && Number(item.valor) < Number(piso)) continue;
    el2.value = item.valor;
    repostos++;
  }
  if (g.foco) {
    let alvo = null; try { alvo = ov.querySelector(g.foco); } catch {}
    if (alvo) { alvo.focus(); try { if (g.cursor != null) alvo.setSelectionRange(g.cursor, g.cursor); } catch {} }
  }
  return repostos;
}

/* ---------------------------------------------------------------------------
   v8.22 · a janela aberta não pode ficar apontando para um pedido que saiu da
   lista. Quando o app relê do servidor, `S.pedidos` é TROCADO por objetos
   novos; a janela segura o antigo, e o que for gravado nele vai para um
   registro que ninguém mais enxerga — a gravação some sem erro e sem rastro.
   Reproduzido no cenário 5 da bateria do 2304.
   --------------------------------------------------------------------------- */
function reancorarJanelaNoPedido() {
  const m = (typeof S !== "undefined" && S.modal) || null;
  if (!m || !m.pedido || !m.pedido.id) return false;
  const lista = (typeof S !== "undefined" && S.pedidos) || [];
  if (lista.indexOf(m.pedido) >= 0) return false;          /* ainda é o mesmo */
  const novo = lista.find((p) => p && p.id === m.pedido.id);
  if (!novo) return false;                                  /* sumiu de vez */
  m.pedido = novo;
  return true;
}
