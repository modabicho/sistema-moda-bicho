document.addEventListener("change", async (e) => {
  const el2 = e.target;

  /* ---------- v8.110 · a foto de uma fita ----------
     Escolher arquivo é um `change`, não um clique — por isso mora aqui e não
     no despachante de cliques. A ORDEM da troca (sobe → grava → só então
     apaga a antiga) é de `foTrocarDaFita`; aqui só se conta o que aconteceu. */
  if (el2.matches("[data-fita-foto]")) {
    const idFita = el2.dataset.fitaFoto;
    const arq = el2.files && el2.files[0];
    el2.value = "";        /* escolher o MESMO arquivo de novo precisa disparar */
    if (!arq || typeof foTrocarDaFita !== "function") return;
    FITA_SUBINDO = idFita;
    render();
    let rf;
    try { rf = await foTrocarDaFita(idFita, arq); }
    catch (err) { rf = { status: "erro", motivo: String((err && err.message) || err) }; }
    FITA_SUBINDO = null;
    if (rf.status === "ok") toast("Foto enviada.");
    else if (rf.status === "na-fila") toast("Foto enviada. O cadastro vai ao servidor quando a fila drenar.", "aviso");
    else toast(rf.motivo || `Não consegui enviar a foto (${rf.status}).`, "erro");
    if (rf.antigaSobrou) toast("A foto anterior ficou no servidor — a fita já aponta para a nova.", "aviso");
    if (rf.caminhoSolto) toast("A imagem subiu, mas o cadastro não confirmou: a foto anterior continua valendo.", "erro");
    render();
    return;
  }

  /* o arquivo da importação de catálogo */
  if (el2.matches("[data-imf-arquivo]")) {
    const arq = el2.files && el2.files[0];
    el2.value = "";
    if (arq && typeof imfEscolherArquivo === "function") await imfEscolherArquivo(arq);
    return;
  }
  /* os quatro números do recorte, digitados à mão */
  if (el2.matches("[data-imf-caixa]") && S.modal?.tipo === "importarFita") {
    const k = el2.dataset.imfCaixa;
    const m = S.modal;
    m.caixa = Object.assign({}, m.caixa);
    const v = Math.max(0, Math.round(Number(el2.value) || 0));
    /* a caixa não pode sair da imagem: digitar 9999 em W não aumenta a foto */
    if (k === "x") m.caixa.x = Math.min(v, m.larg - 1);
    if (k === "y") m.caixa.y = Math.min(v, m.alt - 1);
    if (k === "w") m.caixa.w = Math.max(1, Math.min(v, m.larg - m.caixa.x));
    if (k === "h") m.caixa.h = Math.max(1, Math.min(v, m.alt - m.caixa.y));
    if (k === "x") m.caixa.w = Math.min(m.caixa.w, m.larg - m.caixa.x);
    if (k === "y") m.caixa.h = Math.min(m.caixa.h, m.alt - m.caixa.y);
    m.autoAchou = false; m.autoMotivo = "ajustado à mão";
    render();
    return;
  }
  /* a caixinha de cada campo da conferência */
  if (el2.matches("[data-imf-aplicar]") && S.modal?.tipo === "importarFita") {
    const i = Number(el2.dataset.imfAplicar);
    const c = S.modal.conferencia && S.modal.conferencia.campos[i];
    if (c) c.aplicar = !!el2.checked;
    return;
  }

  if (el2.matches("[data-resp]")) {
    const r = pedidoPorId(el2.dataset.resp);
    if (r) { r.responsavel = el2.value || null; await salvarTudo(); toast("Responsável atualizado."); }
    return;
  }
  /* ---------- a janela de criar pedido se redesenha ----------
     Antes só o campo do NÚMERO repintava — era o único que tinha algo a dizer
     de volta ("esse número já existe"). Agora a janela mostra embalagem, etapas
     e o destino das peças, e todos dependem do PRODUTO e da QUANTIDADE: sem
     repintar ao trocar o SKU, ela escolhia o produto e os blocos não apareciam.
     Os `data-m`/`data-emb`/`data-m-et` também entram, senão o que já foi
     marcado se perde no repaint seguinte. */
  /* SÓ os campos de identidade repintam: produto, processo, quantidade, número.
     São eles que mudam QUAIS blocos aparecem e com que limites. Repintar também
     a cada mexida em embalar/mix/etapas fazia o valor dar uma volta pelo estado
     e voltar normalizado — a pessoa digitava mix 100 e via 0. O que ela mexe
     nos blocos fica no formulário até o Criar; quem lê é o salvar, direto do
     DOM. Mudar a quantidade REFAZ a divisão de propósito: 250 peças divididas
     em 200+50 não valem mais quando o pedido passa a ter 100. */
  if (S.modal?.tipo === "novoPedido"
      && ["np-num", "np-sku", "np-qtd", "np-proc", "np-cod"].includes(el2.id)) {
    /* -----------------------------------------------------------------------
       v8.83 · GUARDAR O RASCUNHO SEMPRE; REDESENHAR SÓ QUANDO MUDA O DESENHO
       -----------------------------------------------------------------------
       Os cinco campos repintavam a janela INTEIRA — `repintarModal` troca o nó
       do véu, e é isso que a pessoa vê como piscar. Medido, campo a campo:

         SKU .......... repaint 1   ← legítimo: troca os blocos dependentes
         processo ..... repaint 1   ← legítimo: troca etapas e canhoto
         quantidade ... repaint 1   ← só muda o desenho no processo ADESIVO
         número ....... repaint 1   ← só muda a dica e o botão do sugerido
         prioridade / prestadora / observação / obs. interna .... 0

       O rascunho (`S.modal.v`) continua sendo guardado em TODOS — é ele que
       preserva o preenchimento quando a janela repinta por outro motivo. O que
       passa a depender de necessidade real é só o repaint.
       ----------------------------------------------------------------------- */
    S.modal.v = capturarNovoPedido();
    const v = S.modal.v;
    /* identidade do produto: muda QUAIS blocos existem */
    let precisa = el2.id === "np-sku" || el2.id === "np-proc" || el2.id === "np-cod";
    if (!precisa && el2.id === "np-qtd") {
      /* a quantidade só muda o que está desenhado quando existe o bloco de
         destino das peças (embalar / pacote mix), que é do processo adesivo:
         ele tem o limite e a conta em voz alta. Sem esse bloco, mudar a
         quantidade não muda um pixel — e o valor é lido do campo na hora de
         criar, não deste estado. */
      const prodQ = typeof produtoDe === "function"
        ? produtoDe(String(v.sku || "").trim().toUpperCase()) : null;
      const procQ = String(v.proc || (prodQ && prodQ.processo) || "");
      precisa = typeof ehAdesivo === "function" && ehAdesivo(procQ);
    }
    if (!precisa && el2.id === "np-num") {
      /* o número muda DUAS coisinhas: a dica embaixo do campo ("já existe" /
         "é o próximo da sequência" / "sugerido pelo app") e o botão "Usar o
         sugerido". Nada mais na janela depende dele. Então não se repinta a
         janela: escreve-se as duas coisinhas no lugar delas. Se por algum
         motivo a janela não estiver em pé, cai no repaint como antes. */
      if (typeof npNumRefrescar === "function" && npNumRefrescar()) return;
      precisa = true;
    }
    if (precisa) repintarModal();
    return;
  }
  if (el2.id === "rel-proc") { S.relView.processo = el2.value; render(); return; }
  if (el2.id === "rel-setor") { S.relView.setor = el2.value; render(); return; }
  if (el2.id === "rel-prest") { S.relView.prestadora = el2.value; render(); return; }
  if (el2.id === "rel-ini") { S.relView.ini = el2.value || null; render(); return; }
  if (el2.id === "rel-fim") { S.relView.fim = el2.value || null; render(); return; }
  if (S.modal?.tipo === "semiTipo" && ["st-tipo", "st-tam", "st-camp", "st-var"].includes(el2.id)) {
    colherSemiTipo(); repintarModal(); return;
  }
  /* v8.98 · a escolha de quem permanece na união. Não redesenha a janela: guarda
     a escolha no estado (para um render de fundo não perdê-la), mostra a prévia
     daquele sentido e libera o botão. */
  if (el2.matches("[data-festunirfica]")) {
    if (S.modal?.tipo !== "festUnir" || el2.disabled) return;
    S.modal.fica = el2.value;
    document.querySelectorAll("[data-uniao-previa]").forEach((d) => { d.hidden = d.dataset.uniaoPrevia !== el2.value; });
    const bt = document.querySelector('[data-act="fest-unir"]');
    if (bt) bt.disabled = false;
    return;
  }
  if (el2.id === "fest-comp-add") { S.festivasView.compAdd = el2.value; return; }
  if (el2.id === "fest-comp-lote") {
    const comp = el2.value;
    if (!comp) return;
    const c = campanhaPorId(S.festivasView.campanha);
    const sel = S.festivasView.selProd || [];
    if (!c || !sel.length) return;
    itensDaCampanha(c).forEach((i) => { if (sel.includes(i.sku)) i.comportamento = comp; });
    S.festivasView.selProd = [];
    await gravarFestivas(`${sel.length} produtos viraram “${FEST_COMP_NOME[comp]}” em ${c.nome}`);
    toast(`${n0(sel.length)} ${sel.length === 1 ? "produto" : "produtos"} agora ${sel.length === 1 ? "é" : "são"} “${FEST_COMP_NOME[comp]}”.`);
    return;
  }
  if (el2.matches("[data-festcomp]")) {
    const c = campanhaPorId(S.festivasView.campanha);
    const it = itensDaCampanha(c).find((i) => i.sku === el2.dataset.festcomp);
    if (it) { it.comportamento = el2.value; await gravarFestivas(null);
      toast(el2.value === "reforco" ? "Vai continuar na Demanda o ano todo e receber reforço na data." : "Marcado como produto só desta data."); }
    return;
  }
  if (el2.matches("[data-reprio]")) { S.modal.reprios[el2.dataset.reprio] = Number(el2.value); return; }
  /* chips com checkbox escondido: acende/apaga na hora, sem re-render (que perderia as marcações) */
  /* ---------------------------------------------------------------------------
     v8.89 · AS ETAPAS ENTRAM NESTA LISTA
     ---------------------------------------------------------------------------
     `data-m-et` (etapas do pedido) e `data-etuso` (etapas na janela da Demanda)
     são desenhados como chip — `<label class="chip on">` quando a etapa está
     marcada — mas não estavam aqui. Medido no navegador, nas três janelas que
     têm esses chips: a caixa mudava e a classe `on` ficava onde estava. Como
     `.chip.on` é o fundo coral, o chip continuava aceso com a etapa desmarcada
     (e apagado com ela marcada) — foi o que aconteceu com a COLA DUPLO.
     Só a classe visual, no nó que já está na tela. Sem `render()`, sem
     `repintarModal()`: quem lê as etapas na hora de gravar continua lendo o
     `checked` da caixa, não a classe.
     --------------------------------------------------------------------------- */
  if (el2.matches("[data-stproc],[data-prproc],[data-pefun],[data-m-et],[data-etuso]")) {
    const rotulo = el2.closest && el2.closest("label");
    if (rotulo && rotulo.classList) rotulo.classList.toggle("on", el2.checked);
    return;
  }
  if (el2.matches("[data-bx]")) {
    const [i, campo] = el2.dataset.bx.split("|");
    const reg = S.modal.regras[+i];
    reg[campo] = campo === "processo" || campo === "alvo" ? el2.value : (el2.value === "" ? 0 : Number(el2.value));
    /* trocar "quem faz / quem não faz / todas" muda a linha inteira (o campo do
       processo some quando é "todas") e a prévia de quem ganharia; e o mínimo
       digitado precisa aparecer na prévia na hora */
    render();
    return;
  }
  if ((el2.closest && el2.closest("[data-bxdel]"))) { return; }
  if (el2.matches('[data-pp="fornecedorId"]') && S.modal?.tipo === "produto" && el2.value === "__novo") {
    const nome = (prompt("Nome do fornecedor:") || "").trim();
    if (nome) {
      const prazo = Number((prompt("Prazo médio de chegada, em dias (pode deixar vazio):") || "").trim()) || null;
      S.cad.fornecedores = S.cad.fornecedores || [];
      let f2 = S.cad.fornecedores.find((x) => x.nome.toLowerCase() === nome.toLowerCase());
      if (!f2) { f2 = { id: uid(), nome, prazoDias: prazo }; S.cad.fornecedores.push(f2); salvarTudo("cad"); }
      const op = document.createElement("option"); op.value = f2.id; op.textContent = `${f2.nome}${f2.prazoDias ? ` (~${f2.prazoDias}d)` : ""}`;
      el2.insertBefore(op, el2.querySelector('option[value="__novo"]'));
      el2.value = f2.id;
    } else el2.value = "";
    const p = S.modal.produto; p.producao = p.producao || {};
    p.producao.fornecedorId = el2.value || null;
    return;
  }
  if (el2.matches("[data-forn-n], [data-forn-p]") && S.modal?.tipo === "fornecedores") {
    const id = el2.dataset.fornN || el2.dataset.fornP;
    const f2 = (S.cad.fornecedores || []).find((x) => x.id === id);
    if (f2) {
      if (el2.dataset.fornN) f2.nome = el2.value.trim() || f2.nome;
      else f2.prazoDias = el2.value === "" ? null : Number(el2.value) || null;
      salvarTudo("cad");
    }
    return;
  }
  if (el2.matches('[data-pp="qtdPorEmbalagem"]') && S.modal?.tipo === "produto" && el2.value === "__novo") {
    const t2 = (prompt("Nova quantidade por embalagem (ex.: 10):") || "").trim();
    const q2 = Number(t2);
    S.cad.qtdsEmbalagem = S.cad.qtdsEmbalagem || [];
    if (t2 && Number.isFinite(q2) && q2 > 0) {
      if (!S.cad.qtdsEmbalagem.includes(q2)) { S.cad.qtdsEmbalagem.push(q2); salvarTudo("cad"); }
      const op = document.createElement("option"); op.value = String(q2); op.textContent = String(q2);
      el2.insertBefore(op, el2.querySelector('option[value="__novo"]'));
      el2.value = String(q2);
    } else el2.value = "";
    const p = S.modal.produto; p.producao = p.producao || {};
    p.producao.qtdPorEmbalagem = el2.value === "" ? null : Number(el2.value);
    return;
  }
  if (el2.matches("[data-pp]")) {
    /* Um handler só para os três lugares onde a embalagem aparece (cadastro do
       produto, edição do pedido e criação de pedidos). Grava no produto CERTO:
       na tela de criar pedidos há vários, distinguidos por data-ppg. */
    const escopo = el2.dataset.ppg;
    /* -----------------------------------------------------------------------
       v8.89 · A TELA PRIMEIRO, O PRODUTO DEPOIS
       -----------------------------------------------------------------------
       Este bloco começava resolvendo o produto-alvo e saía com `return` quando
       não achava — e só DEPOIS mexia na visibilidade do tamanho. Medido nas
       quatro janelas de embalagem: na do pedido avulso (`novoPedido`) o produto
       não era achado, o `return` disparava, e o campo do tamanho — desenhado
       escondido porque o produto está como filipeta — ficava escondido para
       sempre, mesmo escolhendo plástico.
       Mostrar ou esconder o tamanho depende SÓ do que está escolhido no
       formulário. Então essa parte sobe para cá, antes de qualquer `return`:
       ela vale nas quatro janelas, inclusive onde não há produto para gravar.
       ----------------------------------------------------------------------- */
    const selTipo = escopo != null ? $(`[data-pp="embalagemTipo"][data-ppg="${escopo}"]`) : $('[data-pp="embalagemTipo"]');
    const selTam = escopo != null ? $(`[data-pp="embalagemTamanho"][data-ppg="${escopo}"]`) : $('[data-pp="embalagemTamanho"]');
    const cxTam = selTam && (selTam.closest('[data-fld="embalagemTamanho"]') || selTam.closest(".fld"));
    /* Filipeta não tem tamanho: o campo some da tela e o valor vai a null.
       O campo é desenhado SEMPRE (ver `camposEmbalagem`), então os dois sentidos
       funcionam sem redesenhar — inclusive voltar de filipeta para plástico, que
       antes exigia fechar e reabrir a janela. */
    const ehFilipeta = String((selTipo && selTipo.value) || "").trim() === "filipeta";
    if (ehFilipeta) {
      if (selTam) selTam.value = "";              /* limpa ANTES de ler os campos abaixo */
      if (cxTam) cxTam.style.display = "none";
    } else if (cxTam) cxTam.style.display = "";

    /* Agora sim, o produto — e só para GRAVAR. Se não houver produto, a tela já
       está certa e não há o que persistir. */
    const prodAlvo = escopo != null
      ? produtoDe((S.modal?.grupos || [])[Number(escopo)]?.sku)
      : (S.modal?.tipo === "produto" ? S.modal.produto
        : S.modal?.pedido ? produtoDe(opPorId(S.modal.pedido.opId)?.sku || S.modal.pedido.sku)
        /* v8.89 · a janela do pedido AVULSO: o pedido ainda não existe, mas o
           produto existe — é o SKU escolhido no campo de cima. Embalagem é dado
           do PRODUTO, então a escolha feita aqui tem de chegar nele, como já
           chega pelas outras três janelas. No modo "produto novo" o SKU ainda
           não está no cadastro: `produtoDe` devolve nada, o bloco de embalagem
           nem é desenhado, e quem aplica é a criação (`pedAplicarEmbalagemNoProduto`). */
        : S.modal?.tipo === "novoPedido" ? produtoDe(String($("#np-sku")?.value || "").trim().toUpperCase())
        : null);
    if (!prodAlvo) return;
    prodAlvo.producao = prodAlvo.producao || {};
    const campos = escopo != null ? $$(`[data-pp][data-ppg="${escopo}"]`) : $$("[data-pp]:not([data-ppg])");
    campos.forEach((x) => { const k = x.dataset.pp;
      prodAlvo.producao[k] = x.value === "" ? null : (k === "qtdPorEmbalagem" ? Number(x.value) : x.value.trim()); });
    if (ehFilipeta) prodAlvo.producao.embalagemTamanho = null;
    /* Grava já, mas SEM redesenhar a tela: salvarProdutos() chama render(), e
       redesenhar tudo a cada escolha faz a janela piscar. Aqui o DOM já está
       correto — só o dado precisa ir para o servidor. */
    mudouDados();
    await salvarTudo("produtos");
    return;
  }
  if (el2.matches("#lote-qtd") && S.modal?.tipo === "loteEmb" && el2.value === "__novo") {
    const t2 = (prompt("Nova quantidade por embalagem (ex.: 10):") || "").trim();
    const q2 = Number(t2);
    S.cad.qtdsEmbalagem = S.cad.qtdsEmbalagem || [];
    if (t2 && Number.isFinite(q2) && q2 > 0) {
      if (!S.cad.qtdsEmbalagem.includes(q2)) { S.cad.qtdsEmbalagem.push(q2); salvarTudo("cad"); }
      const op = document.createElement("option"); op.value = String(q2); op.textContent = String(q2);
      el2.insertBefore(op, el2.querySelector('option[value="__novo"]'));
      el2.value = String(q2);
    } else el2.value = "";
    (S.modal.v = S.modal.v || {}).qtd = el2.value;
    return;
  }
  if (el2.matches("#lote-tipo, #lote-tam") && S.modal?.tipo === "loteEmb") {
    const m2 = S.modal; m2.v = m2.v || {};
    if (el2.id === "lote-tam" && el2.value === "__novo") {
      const digitado = (prompt("Novo tamanho de embalagem (ex.: 6x12):") || "").trim();
      const r2 = digitado ? cadastrarTamanhoEmb(digitado) : { erro: "" };
      if (r2.erro && !r2.jaTinha) { el2.value = ""; if (r2.erro) toast(r2.erro, "erro"); }
      else {
        const t2 = r2.valor;
        if (!r2.erro) salvarTudo("cad");
        if (!Array.from(el2.options).some((o) => o.textContent === t2)) {
          const op = document.createElement("option"); op.textContent = t2;
          el2.insertBefore(op, el2.querySelector('option[value="__novo"]'));
        }
        el2.value = t2;
      }
    }
    m2.v.tipo = $("#lote-tipo")?.value || "";
    m2.v.tam = $("#lote-tam")?.value || "";
    m2.v.qtd = $("#lote-qtd")?.value ?? "";
    const ehFilipeta = m2.v.tipo === "filipeta";
    if (ehFilipeta) { m2.v.tam = ""; const sel2 = $("#lote-tam"); if (sel2) sel2.value = ""; }
    const w = $("#fld-lote-tam"); if (w) w.style.display = ehFilipeta ? "none" : "";
    return;
  }
  if (el2.matches("[data-embnovo]")) {
    const txt = String(el2.value || "").trim();
    if (!txt) return;
    const qtd = el2.dataset.embnovo === "qtd";
    const esc3 = el2.dataset.ppg;
    if (qtd) {
      /* a MESMA porta de todos: normaliza, recusa duplicado, ordena */
      const r2 = cadastrarQtdEmb(txt);
      if (r2.erro && !r2.jaTinha) { el2.value = ""; return toast(r2.erro, "erro"); }
      const n2 = r2.valor;
      if (!r2.erro) await salvarTudo("cad");
      /* já deixa escolhido no produto que está sendo editado */
      /* acrescenta a opção no próprio seletor: sem redesenhar, sem piscar */
      const sel3 = document.querySelector(`[data-pp="qtdPorEmbalagem"]${esc3 != null ? `[data-ppg="${esc3}"]` : ""}`);
      if (sel3 && !Array.from(sel3.options).some((o) => o.value === String(n2))) {
        const op3 = document.createElement("option"); op3.value = String(n2); op3.textContent = n0(n2);
        const depois = Array.from(sel3.options).find((o) => o.value && Number(o.value) > n2);
        sel3.insertBefore(op3, depois || null);
      }
      if (sel3) { sel3.value = String(n2); sel3.dispatchEvent(new Event("change", { bubbles: true })); }
      el2.value = "";
      toast(`Quantidade ${n0(n2)} cadastrada e escolhida.`);
    } else {
      const r3 = cadastrarTamanhoEmb(txt);
      if (r3.erro && !r3.jaTinha) { el2.value = ""; return toast(r3.erro, "erro"); }
      const val = r3.valor;
      if (!r3.erro) await salvarTudo("cad");
      const sel3 = document.querySelector(`[data-pp="embalagemTamanho"]${esc3 != null ? `[data-ppg="${esc3}"]` : ""}`);
      if (sel3 && !Array.from(sel3.options).some((o) => o.textContent === val)) {
        const op3 = document.createElement("option"); op3.textContent = val;
        const depois = Array.from(sel3.options).find((o) => o.textContent && compararTamanhos(o.textContent, val) > 0);
        sel3.insertBefore(op3, depois || null);
      }
      if (sel3) { sel3.value = val; sel3.dispatchEvent(new Event("change", { bubbles: true })); }
      el2.value = "";
      toast(`Tamanho ${txt} cadastrado e escolhido.`);
    }
    return;
  }
  if (el2.matches("[data-lfm]")) {   /* filtro de vários valores (processo, etapa) */
    const [k, v] = String(el2.dataset.lfm).split("|");
    const fl = S.modal.fl || (S.modal.fl = {});
    const lista = fl[k] || (fl[k] = []);
    const i = lista.indexOf(v);
    el2.checked ? (i < 0 && lista.push(v)) : (i >= 0 && lista.splice(i, 1));
    repintarModal(); return;
  }
  if (el2.matches("[data-lfb]")) {   /* filtro de sim/não */
    const fl = S.modal.fl || (S.modal.fl = {});
    fl[el2.dataset.lfb] = el2.checked; repintarModal(); return;
  }
  if (el2.matches("[data-lfv]")) {   /* filtro de valor único (data, prestadora) */
    const fl = S.modal.fl || (S.modal.fl = {});
    fl[el2.dataset.lfv] = el2.value || null; repintarModal(); return;
  }
  if (el2.matches("[data-selprod]")) {
    S.selProd = S.selProd || new Set();
    el2.checked ? S.selProd.add(el2.dataset.selprod) : S.selProd.delete(el2.dataset.selprod);
    render(); return;
  }
  if (el2.matches("[data-selprod-all]")) {
    S.selProd = S.selProd || new Set();
    const ids = String(el2.dataset.selprodAll || "").split(",").filter(Boolean);
    el2.checked ? ids.forEach((id) => S.selProd.add(id)) : ids.forEach((id) => S.selProd.delete(id));
    render(); return;
  }
  if (el2.matches("[data-selall]")) {
    const ids = String(el2.dataset.selall || "").split(",").filter(Boolean);
    if (el2.checked) ids.forEach((id) => S.sel.add(id));
    else ids.forEach((id) => S.sel.delete(id));
    render();
    return;
  }
  if (el2.matches("[data-cp]")) {
    const g = S.modal.grupos[+el2.dataset.g], l = g.linhas[+el2.dataset.l];
    l[el2.dataset.cp] = el2.dataset.cp === "prestadora" ? el2.value : Number(el2.value);
    if (l.mix > l.qtd) l.mix = l.qtd;
    /* Nada de repintar a janela: mexer na quantidade é o campo mais usado desta
       tela, e redesenhar tudo a cada seta ou tecla faz a tela tremer. Só os dois
       pedaços que dependem do número mudam, direto no lugar. */
    if (["qtd", "mix"].includes(el2.dataset.cp)) {
      const gi = el2.dataset.g;
      const chip = document.querySelector(`[data-plan="${gi}"]`);
      if (chip) { const t2 = totalLinhas(g);
        chip.textContent = `planejado: ${n0(t2)}`;
        chip.classList.toggle("red", t2 > g.saldo); }
      /* o campo do mix não pode passar da quantidade da linha */
      const cmix = document.querySelector(`[data-cp="mix"][data-g="${gi}"][data-l="${el2.dataset.l}"]`);
      if (cmix) { cmix.max = String(l.qtd || 0); if (Number(cmix.value) > l.qtd) cmix.value = String(l.qtd); }
      const cemb = document.querySelector(`[data-emb="${gi}.${el2.dataset.l}"]`);
      if (cemb) cemb.textContent = n0(Math.max(0, (Number(l.qtd) || 0) - (Number(l.mix) || 0)));
    }
    return;
  }
  if (el2.matches("[data-prproc]")) { el2.closest("label").classList.toggle("on", el2.checked); return; }
  if (el2.id === "lg-quem") {
    const h2 = document.getElementById("lg-ola");
    const p2 = S.equipe.find((x) => x.id === el2.value);
    if (h2 && p2) h2.textContent = `${saudacao()}, ${primeiroNome(p2.nome)}!`;
    return;
  }
  if (el2.id === "f-ins-forn") { S.insumosView.fornecedor = el2.value; render(); return; }
  if (el2.id === "f-ins-cat") { S.insumosView.categoria = el2.value; render(); return; }
  if (el2.id === "aj-insumo") { if (S.modal) { S.modal.escolhido = el2.value; S.modal.contado = ""; } render(); return; }
  if (el2.id === "aj-contado") { if (S.modal) S.modal.contado = el2.value; render();
    setTimeout(() => { const c = document.getElementById("aj-contado"); if (c) { c.focus(); try { c.setSelectionRange(c.value.length, c.value.length); } catch {} } }, 0); return; }
  if (el2.matches("[data-rc]") && el2.dataset.rc.endsWith("|insumoId")) { colherEstrutura(); render(); return; }
  if (el2.matches("[data-prc]") && el2.dataset.prc.endsWith("|insumoId")) { colherProduto(); render(); return; }
  if (el2.matches("[data-nfi]")) {
    /* trocar o insumo de um item redesenha (o contador do rodapé muda), então o
       que já estava digitado nos outros campos tem de ser recolhido antes */
    if (el2.dataset.nfi.endsWith("|insumoId")) {
      colherNF();
      const ixSel = Number(el2.dataset.nfi.split("|")[0]);
      const itSel = S.modal?.nf?.itens?.[ixSel];
      if (itSel && itSel.origem === "palpite") itSel.origem = "conferido";   /* gente olhou */
      if (el2.value === "__novo") {
        const ix = Number(el2.dataset.nfi.split("|")[0]);
        const it = S.modal.nf.itens[ix];
        const nv = { id: uid(), codigo: proximoCodigoInsumo(), nome: it.descricao || "Novo insumo",
          unidade: String(it.unidade || "un").toLowerCase(), ativo: true, criadoEm: iso(hoje()),
          fornecedorId: S.modal.fornecedorId || null };
        insumos().push(nv);
        it.insumoId = nv.id;
        await salvarInsumos();
        toast(`${nv.nome} cadastrado como insumo. Confira a unidade e o mínimo depois.`);
        return;
      }
      render();
    }
    return;
  }
  if (el2.id === "q-posse") { S.posseView.busca = el2.value; render(); return; }
  if (el2.id === "f-posse-prest") { S.posseView.prest = el2.value; render(); return; }
  if (el2.matches("[data-bem-insumo]")) {
    const i = insumoPorId(el2.value); if (!i) return;
    /* o mesmo objeto do mundo em duas tabelas, de propósito: o insumo continua
       sendo comprado e consumido na fábrica; o bem conta o que está com ela. */
    const b = criarBem({ nome: i.nome, unidade: i.unidade, tipo: "material", insumoId: i.id,
      embalagem: i.embalagem || null });
    if (b) { b.insumoId = i.id; await salvarTudo("insumos"); render();
      toast(`${b.nome} entrou na lista, ligado ao insumo — a Conferência vai abater sozinha o que virar peça.`); }
    return;
  }
  if (el2.matches("[data-bem]")) {
    const [id, campo] = String(el2.dataset.bem).split("|");
    const b = bemPorId(id); if (!b) return;
    if (campo === "nome") { const n = el2.value.trim(); if (!n) return toast("O item precisa de um nome.", "erro"); b.nome = n; }
    else if (campo === "unidade") b.unidade = el2.value;
    else if (campo === "tipo") b.tipo = el2.value === "equipamento" ? "equipamento" : "material";
    else if (campo === "embNome" || campo === "embFator") {
      const nome = campo === "embNome" ? el2.value.trim() : (b.embalagem?.nome || "");
      const fator = campo === "embFator" ? (Number(el2.value) || 0) : (Number(b.embalagem?.fator) || 0);
      b.embalagem = (nome && fator > 0) ? { nome, fator } : null;
    }
    else if (campo === "juntoId") {
      const alvo = el2.value && el2.value !== "__novo" ? el2.value : "";
      b.junto = (alvo && alvo !== b.id) ? { bemId: alvo, aCada: b.junto?.aCada || 2, sugerir: b.junto?.sugerir || 1 } : null;
    }
    else if (campo === "juntoACada" || campo === "juntoSugerir") {
      if (b.junto) b.junto[campo === "juntoACada" ? "aCada" : "sugerir"] = Number(el2.value) || 0;
      if (b.junto && (!b.junto.aCada || !b.junto.sugerir)) b.junto = null;
    }
    await salvarTudo("insumos");
    if (["embNome", "embFator", "juntoId", "juntoACada", "juntoSugerir", "tipo"].includes(campo)) render();
    return;
  }
  if (el2.matches("[data-rtm]")) {
    const ix = Number(String(el2.dataset.rtm).split("|")[0]);
    /* "＋ criar com este nome": cadastro mínimo no meio do atendimento. A pessoa
       está de pé no balcão — pedir código, tipo e unidade aqui é o que faz
       alguém desistir e voltar para o caderno. */
    if (el2.value === "__novo") {
      const nome = el2.dataset.novoNome || "";
      const r0 = colherRetirada();
      const nv = criarBem({ nome, unidade: "un" });
      if (!nv) { if (r0?.mats?.[ix]) r0.mats[ix].bemId = ""; render(); return toast("Escreva o nome do item antes de criar.", "erro"); }
      if (r0?.mats?.[ix]) r0.mats[ix].bemId = nv.id;
      /* redesenhar aqui não é enfeite: sem isso o campo escondido da linha
         continua com "__novo" e a próxima leitura da tela desfaz a escolha que
         a pessoa acabou de fazer. */
      render();
      await salvarTudo("insumos");
      toast(`${nv.nome} criado. Ajuste unidade e tipo em Materiais em posse › Itens, quando sobrar tempo.`);
      return;
    }
    const r = colherRetirada();
    if (r) { const nova = sugerirPar(r, ix);
      /* a explicação fica de pé enquanto a linha sugerida existir. Sumir no
         primeiro reajuste da quantidade deixaria a pessoa sem saber de onde
         aquela linha tinha vindo — que é justamente o que a frase responde. */
      if (nova) r.sugerido = nova;
      else if (!(r.mats || []).some((y) => y.sugerida)) r.sugerido = null;
      render(); }
    return;
  }
  if (el2.matches("[data-rt]")) { colherRetirada(); render(); return; }
  if (el2.id === "nf-forn") { colherNF();
    if (S.modal?.nf) casarItensNF(S.modal.nf, el2.value || null);
    render(); return; }
  if (el2.id === "cfg-cap") { S.cfg.capacidadeFila = Math.max(10, Number(el2.value) || 40); await salvarCfg(); render(); return; }
  if (el2.id === "cfg-meses") { S.cfg.mesesEstoqueSeguranca = Math.max(1, Number(el2.value) || 3); await salvarCfg(); render(); return; }
  if (el2.matches("[data-regmeses]")) {
    const [i, campo] = String(el2.dataset.regmeses).split("|");
    const lista = regrasMeses().slice();
    const r = lista[Number(i)];
    if (!r) return;
    if (campo === "processo") r.processo = String(el2.value || "").trim().toUpperCase();
    else if (el2.value === "") delete r[campo];
    else r[campo] = Math.max(0, Math.min(12, Number(el2.value) || 0));
    S.cfg.regrasMeses = lista;
    await salvarCfg(); render();
    return;
  }
  if (el2.id === "cfg-tolatraso") { S.cfg.toleranciaAtraso = Math.max(0, Math.min(30, Number(el2.value) || 0)); await salvarCfg(); render(); return; }
  if (el2.id === "cfg-dominio") { S.cfg.dominioLoja = (el2.value || "").trim() || null; await salvarCfg(); toast("Domínio salvo."); return; }
  if (el2.id === "cfg-prazoconf") { S.cfg.prazoConferencia = Math.max(1, Math.min(30, Number(el2.value) || 3)); await salvarCfg(); render(); return; }
  if (el2.id === "cfg-blocos") { S.cfg.dividirBlocos = el2.checked; await salvarCfg(); return; }
  if (el2.id === "cfg-csvcab") { S.cfg.csvMinCabecalho = el2.checked; await salvarCfg(); render(); return; }
  if (el2.id === "cfg-busca") { S.cfg.buscaSite = el2.value.trim(); await salvarCfg(); toast("Link de busca salvo."); return; }
  if (el2.matches("[data-etq]")) {
    const [id, nome] = String(el2.dataset.etq).split("|");
    /* a mesma célula serve pedido e remessa: um registro, várias telas */
    const r = pedidoPorId(id) || remessaPorId(id);
    if (r) await aplicarEtapaQtd(r, nome, el2.value);
    return;
  }
  if (el2.id === "mes-prest" || el2.id === "mes-conf") { S.prestView.mes = el2.value; render(); return; }
  if (el2.id === "f-prest-conf") { S.prestView.prest = el2.value; render(); return; }
  if (el2.id === "f-prest-fech") { S.prestView.prestFech = el2.value; render(); return; }
  if (el2.id === "f-rel-cat") { S.rel.categoria = el2.value; S.rel.limite = 80; render(); return; }
  if (el2.id === "f-rel-proc") { S.rel.processo = el2.value; S.rel.limite = 80; render(); return; }
  if (el2.id === "f-rel-forn") { S.rel.fornecedor = el2.value; S.rel.limite = 80; render(); return; }
  if (el2.id === "f-proc") { S.demanda.processo = el2.value; render(); return; }
  if (el2.id === "f-forn") { S.demanda.fornecedor = el2.value; render(); return; }
  if (el2.id === "p-forn") { S.pedView.fornecedor = el2.value; S.pedView.limite = 50; render(); return; }
  if (el2.id === "p-proc") { S.pedView.processo = el2.value; S.pedView.limite = 50; render(); return; }
  if (el2.id === "f-etped") { S.demanda.etapaPed = el2.value; render(); return; }
  if (el2.id === "f-stped") { S.demanda.statusPed = el2.value; render(); return; }
  if (el2.id === "per-ini" || el2.id === "per-fim") {
    if (S.estoque) {
      S.estoque.periodoIni = $("#per-ini").value; S.estoque.periodoFim = $("#per-fim").value;
      render(); await salvarTudo("estoque");
    }
    return;
  }
});

