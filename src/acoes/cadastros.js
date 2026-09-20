async function acoesCadastros(act, t, e) {
    let el = t;
    if (act === "gerar-papeis") {
      const modo = $("#pp-fmt-cupom")?.checked ? "cupom" : "a4";
      if (S.cfg.formatoPapel !== modo) { S.cfg.formatoPapel = modo; salvarCfg(); }
      if (modo === "cupom") {
        const L = Number($("#pp-larg")?.value);
        if (L >= 40 && L <= 78 && L !== S.cfg.larguraCupom) { S.cfg.larguraCupom = L; salvarCfg(); }
        /* as duas escolhas do corte ficam guardadas: é configuração de máquina,
           não decisão de cada impressão */
        const A = Math.round(Number($("#pp-alt")?.value) || 0);
        if (A >= 100 && A <= 400 && A !== S.cfg.alturaCupom) { S.cfg.alturaCupom = A; salvarCfg(); }
        const corta = $("#pp-corta") ? !!$("#pp-corta").checked : S.cfg.cortarPorPedido !== false;
        const marca = $("#pp-marca") ? !!$("#pp-marca").checked : !!S.cfg.marcaCorte;
        if (corta !== (S.cfg.cortarPorPedido !== false) || marca !== !!S.cfg.marcaCorte) {
          S.cfg.cortarPorPedido = corta; S.cfg.marcaCorte = marca; salvarCfg();
        }
      }
      const avancar = $("#pp-avancar")?.checked;
      const lista = listaPapeis(S.modal?.ids);
      /* -----------------------------------------------------------------
         v8.110 · O CONGELAMENTO VEM ANTES DA IMPRESSÃO
         -----------------------------------------------------------------
         É ele que fixa a receita que o papel imprime: depois disso, mexer no
         projeto não muda mais este pedido. E é ele que decide se a liberação
         pode acontecer — `na-fila` imprime o papel e NÃO libera, porque a fila
         é durável só neste navegador.
         ----------------------------------------------------------------- */
      let corte = null;
      if (typeof pcPrepararPapeis === "function") {
        try { corte = await pcPrepararPapeis(lista); }
        catch (e2) { corte = pcFalhouConferir(e2); }
      }
      S.modal = null;
      render();   /* fecha a janela ANTES de imprimir: sem isto ela ficava na tela e parecia que o clique não fez nada */
      imprimir(folhaPapeis(lista, modo), modo === "cupom" ? "cupom" : null);
      let n = 0;
      const travado = !!(corte && !corte.podeLiberar);
      if (avancar && !travado) {
        for (const x of lista) {
          const r = pedidoPorId(x.id);
          if (!r || r.status !== "papel") continue;
          registrar(r.opId, `pedido ${r.numero}: papel de produção impresso`, { status: "papel" }, { status: "aberto" });
          r.status = "aberto"; n++;
        }
        if (n) { S.sel.clear(); await salvarPedidos(); }
      }
      /* confirmação sempre, mesmo quando nenhum pedido muda de etapa */
      toast(`${n0(lista.length)} ${lista.length === 1 ? "canhoto enviado" : "canhotos enviados"} para a impressão${
        n ? ` · ${n0(n)} ${n === 1 ? "pedido entrou" : "pedidos entraram"} na fila de corte` : ""}.`);
      /* nunca em silêncio: se o corte travou a liberação, ela é dita em voz
         alta, com o número do pedido e o que fazer */
      if (avancar && travado) toast(pcPorQueNaoLibera(corte), "erro");
    }
    else if (act === "papel-ok-nada") {}
    else if (act === "print-corte") {
      if (!S.calc.fila.length) return toast("A fila está vazia — nada para imprimir.", "erro");
      imprimir(folhaOrdemCorte());
      toast(`Ordem de corte enviada para a impressão · ${n0(S.calc.fila.length)} ${S.calc.fila.length === 1 ? "pedido" : "pedidos"}.`);
    }
    else if (act === "print-romaneio") {
      const h = folhaRomaneio();
      if (!h) return toast("Nenhum pedido cortado com prestadora definida.", "erro");
      imprimir(h);
      toast("Romaneio de envio enviado para a impressão.");
    }
    else if (act === "print-conferencia") {
      if (!podeVerValores()) return toast("Esta folha traz os valores de cada etapa — peça para a administração.", "erro");
      const mes = S.prestView.mes || (S.calc?.mesesCompetencia || [])[0];
      const h = folhaConferencia(mes, S.prestView.prest);
      if (!h) return toast("Sem pedidos conferidos no mês escolhido.", "erro");
      imprimir(h);
      toast(`Folha de conferência de ${mes} enviada para a impressão.`);
    }
    else if (act === "exp-processos") {
      await precisaXlsx().catch(() => { toast("Não consegui carregar a biblioteca de planilha — verifique a internet.", "erro"); });
      if (typeof XLSX === "undefined") return;
      /* a planilha segue o mesmo filtro da tela: sem isso, exportar de dentro da
         conferência de UMA prestadora entregava o valor de todas */
      const soP = S.prestView.prest;
      const confs = S.pedidos.filter((r) => r.status === "retornada").map(conferenciaDe)
        .filter((x) => S.prestView.mesProc === "todos" || x.competencia === (S.prestView.mes || (S.calc?.mesesCompetencia || [])[0]))
        .filter((x) => !soP || soP === "todas" || x.pedido.prestadora === soP);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(confs.map((x) => {
        const l = { "Pedido": x.pedido.numero, "SKU": x.sku, "Prestadora": x.pedido.prestadora,
          "Processo": x.pedido.processo, "Qtd Enviada": x.enviada };
        x.etapas.forEach((e, i) => { l[`Processo ${i + 1}`] = e.nome; l[`VU P${i + 1}`] = e.vu || "";
          l[`Qtd P${i + 1}`] = e.qtd ?? ""; l[`Valor P${i + 1}`] = e.valor ?? ""; });
        l["Produzido"] = x.produzido ?? ""; l["Total"] = x.total ?? "";
        l["Mês Pagamento"] = x.competencia || "";
        l["Conferência"] = x.alertas.map((a) => a.txt).join(" | ") || "confere";
        return l;
      })), "ControleProcessos");
      XLSX.writeFile(wb, `INTERNO-conferencia${soP && soP !== "todas" ? "-" + String(soP).replace(/\W+/g, "-").toLowerCase() : ""}-${iso(hoje())}.xlsx`);
      toast(`${n0(confs.length)} pedidos exportados.`);
    }
    else if (act === "print-recibo") {
      if (!podeVerValores()) return toast("O recibo tem valores — peça para a administração.", "erro");
      const so = S.prestView.prestFech;
      const mes = S.prestView.mes || (S.calc.mesesCompetencia || [])[0];
      const h = folhaRecibo(mes, so);
      if (!h) return toast(so && so !== "todas" ? `${so} não tem valor a receber em ${mes}.` : "Nenhuma prestadora com valor a receber neste mês.", "erro");
      imprimir(h);
      toast(so && so !== "todas" ? `Recibo de ${so} — duas vias na mesma folha, é só recortar.`
        : "Recibos em duas vias, um por prestadora. Imprima e recorte — o arquivo inteiro tem o valor de todas.");
    }
    else if (act === "print-fechamento") {
      if (!podeVerValores()) return toast("Esta folha tem valores — peça para a administração.", "erro");
      const so = S.prestView.prestFech;
      const h = folhaFechamento(S.prestView.mes || (S.calc.mesesCompetencia || [])[0], so);
      if (!h) return toast(so && so !== "todas" ? `${so} não tem movimento no mês escolhido.` : "Sem movimento de prestadoras no mês escolhido.", "erro");
      imprimir(h);
      toast(so && so !== "todas" ? `Folha de ${so} enviada para a impressão — só a dela.`
        : "Uma folha por prestadora. Imprima e recorte: o arquivo inteiro tem o pagamento de todas.");
    }
    else if (act === "rel-abrir") {
      /* o relatório abre já enxergando o que a pessoa estava olhando na Demanda —
         depois disso os filtros são dele, e mexer aqui não mexe lá */
      const d2 = S.demanda;
      S.rel = { ...S.rel, aberto: true, limite: 80, sel: new Set(),
        busca: d2.busca || "", abc: d2.abc || "todos", processo: d2.processo || "todos",
        setor: d2.setor || "todos", fornecedor: d2.fornecedor || "todos" };
      S.aba = "demanda"; render();
    }
    else if (act === "conflito-recarregar") {
      const sec = S.modal?.sec;          /* antes de fechar a janela, senão some */
      S.modal = null;
      if (sec) _pendentes.delete(sec);
      await recarregarDoServidor();
      toast("Tela atualizada com a versão do servidor.");
    }
    /* v8.30 · "Gravar a minha por cima" NÃO EXISTE MAIS.
       Ele gravava a seção inteira da memória por cima da do servidor, sem
       fundir: em `produtos`, `cad`, `equipe` e `festivas` isso apagava os
       registros que a outra pessoa tinha acabado de criar, em silêncio. Não há
       caminho que sobrescreva uma seção inteira. O que existe é escolher, dado
       a dado, na janela de conflito. */
    /* v8.35 · a conferência do lote. Cancelar tem de significar CANCELAR:
       larga as intenções paradas e não manda nada para o servidor. */
    else if (act === "limpeza-ops-cancelar") {
      const n = typeof demLoteDescartar === "function" ? demLoteDescartar() : 0;
      S.modal = null; render();
      toast(n ? `Limpeza cancelada · ${n0(n)} ${n === 1 ? "necessidade continua" : "necessidades continuam"} como estavam no servidor.`
              : "Limpeza cancelada.");
    }
    else if (act === "limpeza-ops-confirmar") {
      const alvo = S.modal;
      S.modal = null; render();
      const r = typeof demLoteExecutar === "function" ? await demLoteExecutar() : null;
      if (!r || r.status !== "ok") {
        return toast("A limpeza não foi aceita pelo servidor: " + ((r && (r.msg || r.status)) || "sem resposta"), "erro");
      }
      const partes = [];
      if (r.canceladas) partes.push(`${n0(r.canceladas)} ${r.canceladas === 1 ? "cancelada" : "canceladas"}`);
      if (r.ja_canceladas) partes.push(`${n0(r.ja_canceladas)} já ${r.ja_canceladas === 1 ? "estava cancelada" : "estavam canceladas"}`);
      if (r.apagadas) partes.push(`${n0(r.apagadas)} ${r.apagadas === 1 ? "apagada" : "apagadas"}`);
      if (r.recusadas) partes.push(`${n0(r.recusadas)} ${r.recusadas === 1 ? "recusada" : "recusadas"}`);
      toast(partes.length ? "Limpeza aplicada · " + partes.join(" · ") : "Nada a fazer.",
        r.recusadas ? "erro" : "ok");
      if (alvo) render();
    }
    else if (act === "conflito-dado-servidor" || act === "conflito-dado-meu") {
      const i = Number(e.target.closest("[data-i]")?.dataset.i);
      const itens = (S.modal?.itens || []).slice();
      const it = itens[i];
      if (!it) return;
      const ficarComMeu = act === "conflito-dado-meu";
      /* a escolha vale para ESTE dado. Se for "ficar com a dela", basta soltar
         o meu valor: a releitura da gravação seguinte traz o dela. */
      if (!ficarComMeu && it.sec === "cfg" && it.chave) { try { delete S.cfg[it.chave]; } catch (e2) {} }
      itens.splice(i, 1);
      if (itens.length) { S.modal = { ...S.modal, itens }; render(); return; }
      S.modal = null; render();
      const ok2 = await salvarTudo(it.sec);
      toast(ok2 ? "Conflito resolvido e gravado." : "Ainda não gravou — tente de novo em Dados.", ok2 ? "" : "erro");
    }
    else if (act === "rel-quanto") {
      /* mesma tela de sempre, agora com dois caminhos: pela Demanda e por aqui.
         Abrindo daqui, ela já nasce com os filtros do topo de Relatórios. */
      const rv = S.relView;
      S.rel = { ...S.rel, aberto: true, limite: 80, sel: new Set(), busca: "",
        abc: rv.abc || "todos", processo: rv.processo || "todos",
        setor: rv.setor || "todos", fornecedor: "todos" };
      S.aba = "demanda"; lembrarAba(); render();
    }
    else if (act === "rel-filtros") { S.rel.filtrosAbertos = !S.rel.filtrosAbertos; render(); }
    else if (act === "rel-limpar-filtros") { relLimparFiltros(); S.rel.limite = 80; render(); }
    else if (act === "rel-sel-limpar") { S.rel.sel = new Set(); render(); }
    else if (act === "rel-fechar") { S.rel.aberto = false; render(); }
    else if (act === "rel-mais") { S.rel.limite += 80; render(); }
    else if (act === "mais-conf") { S.prestView.limiteConf = (S.prestView.limiteConf || 120) + 120; render(); }
    else if (act === "rel-limpar-excecoes") { S.rel.porSku = {}; render(); }
    else if (act === "rel-imprimir") {
      if (!relEscolhidas().some((x) => x.produzir > 0)) return toast("Não há nada a produzir para imprimir.", "erro");
      imprimir(folhaRelatorio());
    }
    else if (act === "rel-planilha") { await exportarRelatorio().catch(() => {}); }
    else if (act === "rel-criar-todos") {
      const linhas = relEscolhidas().filter((x) => x.produzir > 0);
      if (!linhas.length) return toast("Nada a produzir com os filtros de agora.", "erro");
      const qtd = new Map(linhas.map((x) => [x.l.sku, x.produzir]));
      abrirCriarPedidos([...qtd.keys()], (l) => qtd.get(l.sku) || 0);
    }
    else if (act === "estruturas") { S.modal = { tipo: "estruturas", busca: "" }; render(); }
    else if (act === "estrutura-bloqueada") { toast("A estrutura dos processos é definida pela administração.", "erro"); }
    else if (act === "receita-prod-add") {
      colherProduto();
      (S.modal.receitaProd ||= []).push({ insumoId: "", qtd: null });
      render();
    }
    else if (act === "receita-prod-propria") {
      colherProduto();
      /* começa pela do processo: sobrepor é mudar o que já existe, não recomeçar do zero */
      const base = (receitaDoProcesso(S.modal.produto.processo)?.itens || [])
        .filter((x) => x.insumoId).map((x) => ({ insumoId: x.insumoId, qtd: x.qtd }));
      S.modal.receitaProd = base.length ? base : [{ insumoId: "", qtd: null }];
      render();
    }
    else if (act === "receita-prod-processo") {
      colherProduto();
      S.modal.receitaProd = null;
      render();
    }
    else if (act === "receita-add") {
      colherEstrutura();
      (S.modal.receita ||= []).push({ insumoId: "", qtd: null });
      render();
    }
    else if (act === "imprimir-valores") {
      const prest = $("#estr-prest")?.value || "todas";
      if (S.modal?.tipo === "estruturas") S.modal.prest = prest;
      imprimir(folhaValores(prest));
    }
    else if (act === "estrutura-nova") {
      S.modal = { tipo: "estrutura", novo: true, original: null, e: { processo: "", obs: null, etapas: [{ ordem: 1, nome: "", valor: null }] } };
      render();
    }
    else if (act === "etapa-add") {
      colherEstrutura();
      const e = S.modal.e;
      if ((e.etapas || []).length >= 6) return toast("Máximo de 6 etapas por processo.", "erro");
      e.etapas = [...(e.etapas || []), { ordem: (e.etapas || []).length + 1, nome: "", valor: null }];
      render();
    }
    else if (act === "salvar-estrutura") {
      if (!podeEditar("estruturas")) return recusaPerm("estruturas");
      colherEstrutura();
      const e = S.modal.e;
      const nome = normProc(e.processo).trim();
      if (!nome) return toast("Dê um código ao processo.", "erro");
      const etapas = (e.etapas || []).filter((x) => String(x.nome || "").trim())
        .map((x, i) => ({ ordem: i + 1, nome: String(x.nome).trim().toUpperCase(), valor: x.valor === "" || x.valor == null ? null : Number(x.valor) }));
      if (!etapas.length) return toast("Um processo precisa de pelo menos uma etapa.", "erro");
      const choque = (S.cad.estruturas || []).find((x) => normProc(x.processo) === nome && normProc(x.processo) !== normProc(S.modal.original));
      if (choque) return toast(`Já existe um processo chamado ${choque.processo}.`, "erro");
      const nova = { processo: nome, obs: e.obs || null, etapas };
      const lista = (S.cad.estruturas || []).slice();
      const i = lista.findIndex((x) => normProc(x.processo) === normProc(S.modal.original));
      if (i >= 0) lista[i] = nova; else lista.push(nova);
      S.cad.estruturas = lista;
      /* a receita segue o processo, inclusive quando ele é renomeado */
      const rec = (S.modal.receita || []).filter((x) => x.insumoId && Number(x.qtd) > 0)
        .map((x) => ({ insumoId: x.insumoId, qtd: Number(x.qtd) }));
      S.cad.receitas = (S.cad.receitas || []).filter((r2) => normProc(r2.processo) !== nome
        && normProc(r2.processo) !== normProc(S.modal.original));
      if (rec.length) S.cad.receitas.push({ processo: nome, itens: rec });
      /* renomeou: leva junto os produtos e os pedidos ainda abertos que apontavam para o nome antigo */
      let renomeados = 0;
      if (S.modal.original && normProc(S.modal.original) !== nome) {
        for (const p of S.produtos) if (normProc(p.processo) === normProc(S.modal.original)) { p.processo = nome; renomeados++; }
        for (const r of S.pedidos) if (PED_VIVO.includes(r.status) && normProc(r.processo) === normProc(S.modal.original)) r.processo = nome;
      }
      S.modal = { tipo: "estruturas", busca: "" };
      await salvarTudo("cad", "produtos", "nucleo");
      render();
      toast(`Processo ${nome} salvo · ${etapas.length} etapa${etapas.length > 1 ? "s" : ""} · ${fmoeda(etapas.reduce((s2, x) => s2 + (Number(x.valor) || 0), 0))} por peça${renomeados ? ` · ${n0(renomeados)} produtos renomeados` : ""}.`);
    }
    else if (act === "excluir-estrutura") {
      const orig = S.modal.original;
      const usados = S.produtos.filter((p) => normProc(p.processo) === normProc(orig)).length;
      const vivos = S.pedidos.filter((r) => PED_VIVO.includes(r.status) && normProc(r.processo) === normProc(orig)).length;
      if (usados || vivos) return toast(`Não dá para excluir: ${n0(usados)} produtos e ${n0(vivos)} pedidos abertos ainda usam ${orig}. Troque o processo deles antes.`, "erro");
      S.cad.estruturas = (S.cad.estruturas || []).filter((x) => normProc(x.processo) !== normProc(orig));
      S.modal = { tipo: "estruturas", busca: "" };
      await salvarTudo("cad", "nucleo");
      render();
      toast(`Processo ${orig} excluído.`);
    }
    else if (act === "fechar-mes") {
      const mes = S.prestView.mes || (S.calc?.mesesCompetencia || [])[0];
      if (!mes) return toast("Escolha o mês antes de fechar.", "erro");
      if (mesFechado(mes)) return toast(`${mes} já está fechado.`);
      const fechs = (S.calc?.prestadoras || []).map((p) => fechamentoDe(p, mes, p.porMes?.[mes])).filter((x) => x.pecas > 0 || x.valor > 0);
      const pedidos = fechs.reduce((s2, x) => s2 + x.pedidosMes.length, 0);
      const total = fechs.reduce((s2, x) => s2 + x.total, 0);
      const bonus = fechs.reduce((s2, x) => s2 + (x.bonus || 0), 0);
      const comBonus = fechs.filter((x) => x.pct > 0).length;
      const semMes = S.pedidos.filter((r) => r.status === "retornada" && competenciaDe(r) === mes && !r.mesPagamento).length;
      S.modal = { tipo: "fecharMes", mes, prestadoras: fechs.length, pedidos, total, bonus, comBonus, semMes };
      render();
    }
    else if (act === "confirmar-fechar-mes") {
      if (S.modal?.tipo !== "fecharMes") return;
      const { mes, pedidos, total } = S.modal;

      /* CAMINHO NOVO · uma chamada, uma transação. O servidor carimba os
         pedidos, grava o mês e a trilha, e audita — tudo dentro dela. Antes
         eram N patches em série, e um conflito no meio deixava o mês
         parcialmente carimbado com o documento já dizendo "fechado". */
      if (typeof mesEscreveNaTabela === "function" && mesEscreveNaTabela()) {
        const r = await mesFecharNoServidor(mes, pedidos, total);
        if (!r || (r.status !== "ok" && r.status !== "ja-fechado")) {
          return toast("Não consegui fechar o mês: "
            + ((r && (r.motivo || r.texto || r.status)) || "o servidor não respondeu"), "erro");
        }
        const n = mesRefletirNaTela(mes, true);
        S.modal = null;
        await salvarTudo("cad", "nucleo");   /* o documento vira espelho */
        render();
        return toast(`${mes} fechado · ${n0(pedidos)} pedidos · ${freal(total)}`
          + (n ? ` · ${n0(n)} carimbados` : "")
          + `. Dá para reabrir a qualquer momento — nada fica gravado em definitivo.`);
      }

      /* carimba o mês nos pedidos que ainda não tinham — mas marca o carimbo como automático,
         para que reabrir o mês desfaça exatamente isto e nada mais */
      let carimbados = 0;
      for (const r of S.pedidos) {
        if (r.status !== "retornada" || competenciaDe(r) !== mes || r.mesPagamento) continue;
        r.mesPagamento = mes; r.mesPagamentoAuto = true; carimbados++;
      }
      S.cad.mesesFechados = [...mesesFechados().filter((x) => x.mes !== mes),
        { mes, em: new Date().toISOString(), por: usuarioAtual()?.nome || null, pedidos, total, carimbados }];
      S.cad.historicoFechamentos = [...(S.cad.historicoFechamentos || []),
        { mes, acao: "fechou", em: new Date().toISOString(), por: usuarioAtual()?.nome || null, pedidos, total }];
      S.modal = null;
      await salvarTudo("cad", "nucleo");
      render();
      toast(`${mes} fechado · ${n0(pedidos)} pedidos · ${freal(total)}. Dá para reabrir a qualquer momento — nada fica gravado em definitivo.`);
    }
    else if (act === "reabrir-mes") {
      const mes = S.prestView.mes || (S.calc?.mesesCompetencia || [])[0];
      if (!mesFechado(mes)) return toast(`${mes} não está fechado.`);
      if (!ehAdm()) return toast("Só a administração pode reabrir um mês fechado.", "erro");
      const carimbos = S.pedidos.filter((r) => r.mesPagamentoAuto && r.mesPagamento === mes).length;
      S.modal = { tipo: "reabrirMes", mes, trava: infoFechamento(mes), carimbos };
      render();
    }
    else if (act === "confirmar-reabrir-mes") {
      if (S.modal?.tipo !== "reabrirMes") return;
      const mes = S.modal.mes;

      if (typeof mesEscreveNaTabela === "function" && mesEscreveNaTabela()) {
        const r = await mesReabrirNoServidor(mes);
        if (!r || (r.status !== "ok" && r.status !== "nao-esta-fechado")) {
          return toast("Não consegui reabrir o mês: "
            + ((r && (r.motivo || r.texto || r.status)) || "o servidor não respondeu"), "erro");
        }
        const n = mesRefletirNaTela(mes, false);
        S.modal = null;
        await salvarTudo("cad", "nucleo");
        render();
        return toast(`${mes} reaberto — tudo voltou a como estava`
          + (n ? ` (${n0(n)} carimbos automáticos desfeitos)` : "") + ".");
      }

      /* desfaz o carimbo automático: os pedidos voltam a seguir a data de retorno.
         Mês escolhido a dedo na conferência não é tocado — aquilo foi decisão de alguém. */
      let limpos = 0;
      for (const r of S.pedidos) {
        if (!r.mesPagamentoAuto || r.mesPagamento !== mes) continue;
        r.mesPagamento = null; delete r.mesPagamentoAuto; limpos++;
      }
      S.cad.mesesFechados = mesesFechados().filter((x) => x.mes !== mes);
      S.cad.historicoFechamentos = [...(S.cad.historicoFechamentos || []),
        { mes, acao: "reabriu", em: new Date().toISOString(), por: usuarioAtual()?.nome || null }];
      S.modal = null;
      await salvarTudo("cad", "nucleo");
      render();
      toast(`${mes} reaberto — tudo voltou a como estava${limpos ? ` (${n0(limpos)} carimbos automáticos desfeitos)` : ""}.`);
    }
    else if (act === "regras-bonus") { S.modal = { tipo: "bonus", regras: JSON.parse(JSON.stringify(S.cad.bonus || BONUS_PADRAO)) }; render(); }
    else if (act === "bonus-add") { S.modal.regras.push({ alvo: "processo", processo: "", minPecas: 0, minValor: 0, pct: 0 }); render(); }
    else if (act === "salvar-bonus") {
      const regras = S.modal.regras.filter((b2) => {
        const alvo = b2.alvo || (b2.processo ? "processo" : "todas");
        /* regra que mira um processo precisa dizer qual */
        return alvo === "todas" || String(b2.processo || "").trim();
      });
      const semCond = regras.filter((b2) => !(Number(b2.minPecas) > 0) && !(Number(b2.minValor) > 0)
        && (Number(b2.pctInt ?? (b2.pct || 0) * 100) || 0) > 0);
      if (semCond.length) return toast("Regra com percentual mas sem mínimo de peças nem de valor não vale para ninguém — preencha uma das duas condições.", "erro");
      S.cad.bonus = regras.map((b2) => ({
        alvo: b2.alvo || (b2.processo ? "processo" : "todas"),
        processo: String(b2.processo || "").trim().toUpperCase(),
        minPecas: Number(b2.minPecas) || 0,
        minValor: Number(b2.minValor) || 0,
        pct: (Number(b2.pctInt ?? (b2.pct || 0) * 100) || 0) / 100 }));
      S.modal = null; await salvarCad();
      toast(`${n0(S.cad.bonus.length)} ${S.cad.bonus.length === 1 ? "regra de bônus salva" : "regras de bônus salvas"}.`);
    }
    else if (act === "aplicar-import") {
      const plano = S.modal?.plano;
      if (!plano) return;
      S.modal = null;
      /* A PORTA ÚNICA DAS 7 IMPORTAÇÕES. Todas passam por aqui, e é aqui que a
         guarda contra remoção em massa é armada: as portas trocam listas
         inteiras, e lista trocada não é gente apagando cadastro. */
      /* v8.74 · P7 · a MESMA guarda para as NECESSIDADES. A frase acima vale
         igual: lista trocada não é gente apagando necessidade de operação. */
      const trocandoCad = typeof cadDuranteTrocaDeListas === "function"
        ? cadDuranteTrocaDeListas : (f) => f();
      const trocandoDem = typeof demDuranteTrocaDeListas === "function"
        ? demDuranteTrocaDeListas : (f) => f();
      const trocando = (f) => trocandoCad(() => trocandoDem(f));
      /* v8.50 · o lote fica REGISTRADO no servidor antes de ser aplicado: qual
         porta, qual arquivo, o hash dele e o plano. Reimportar o mesmo arquivo
         passa a ser reconhecido em vez de repetido em silêncio — e os
         "sumidos" ficam guardados para decisão, porque importação não remove
         sozinha. */
      const loteId = typeof uid === "function" ? uid() : String(Date.now());
      if (typeof impPlanejar === "function") {
        try { await impPlanejar(loteId, plano); } catch (e) { console.error("registro do lote:", e); }
      }
      try { const rel = await trocando(() => plano.aplicar());
        if (typeof impAplicado === "function") { try { await impAplicado(loteId, rel); } catch (e) {} }
        S.modal = { tipo: "resultImport", rel }; }
      catch (e2) { console.error(e2); S.modal = { tipo: "resultImport", rel: { titulo: plano.titulo, ok: false,
        linhas: ["A importação falhou no meio do caminho: " + (e2?.message || e2), "Nada além do relatado acima foi alterado — tire um print e me mande."] } }; }
      render();
    }
    else if (act === "salvar-conferencia") await salvarConferencia();
    else if (act === "destino-resto") {
      /* o número que sobrou é clicável e faz o que diz: soma no mix. Sem render
         inteiro — a janela continua exatamente onde a pessoa a deixou. */
      const d = destinoDaJanela();
      const campo = document.querySelector('[data-m="qtdMix"]');
      if (!campo || !d.resto) return;
      campo.value = String(d.mix + d.resto);
      repintarDestino();
      return;
    }
    else if (act === "salvar-pedido") {
      /* v8.22 · antes de qualquer coisa, garantir que estamos gravando no
         objeto que está NA LISTA. Se o app releu do servidor enquanto a janela
         estava aberta, `S.modal.pedido` virou um órfão: gravar nele não dá
         erro, não avisa, e a alteração some — nem no documento, nem em lugar
         nenhum. Reancorar aqui protege contra QUALQUER caminho que troque a
         lista, não só o da releitura. */
      if (typeof reancorarJanelaNoPedido === "function") reancorarJanelaNoPedido();
      const r = S.modal.pedido;
      if (S.pedidos.indexOf(r) < 0) { S._solta?.();
        return toast(`O pedido ${r.numero || ""} saiu da lista enquanto você editava — feche e abra de novo para não gravar por cima de outra coisa.`, "erro"); }
      const briga = await outroMexeu(r, S.modal.foto);
      if (briga) { S.modal = { tipo: "conflito", pedido: r, briga, volta: { tipo: "pedido", pedido: r, foto: fotoPedido(briga.servidor) } }; return render(); }
      const compAntes = r.status === "retornada" ? competenciaDe(r) : null;
      if (compAntes && mesFechado(compAntes)) { S._solta?.();
        return toast(`Pedido ${r.numero} está no fechamento de ${compAntes}, que já foi fechado. Reabra o mês em Prestadoras para editar.`, "erro"); }
      const antes = { prioridade: r.prioridade, status: r.status };
      $$("[data-m]").forEach((el2) => {
        const k = el2.dataset.m;
        if (el2.type === "checkbox") r[k] = el2.checked;
        else if (el2.type === "number") r[k] = el2.value === "" ? null : Number(el2.value);
        else r[k] = el2.value || null;
      });
      const chipsEt = $$("[data-m-et]");
      if (chipsEt.length) {
        const marcadas = chipsEt.filter((x) => x.checked).map((x) => String(x.value).toUpperCase());
        /* v8.87 · a lista por extenso, como na criação. `null` fica só para o
           caso sem informação (nenhuma marcada), e continua sendo lido como
           "todas as etapas do processo" — que é o que os pedidos antigos dizem. */
        r.etapasUsadas = marcadas.length ? marcadas : null;
      }
      r.prioridade = Number.isFinite(Number(r.prioridade)) ? Number(r.prioridade) : 4;
      /* tirar o pedido de "Produzido" por aqui é reabrir a conferência por outro
         caminho: o material precisa voltar ao estoque do mesmo jeito, senão ele
         sai duas vezes quando o pedido for conferido de novo */
      let insumoMexeu = false;
      if (antes.status === "retornada" && r.status !== "retornada" && r.consumoBaixado) {
        const desfeitos = desfazerConsumo(r);
        if (desfeitos) {
          /* a gravação vai junto com a do pedido, mais abaixo: separar as duas
             deixava o pedido gravado e o insumo não */
          insumoMexeu = true;
          toast(`${desfeitos} ${desfeitos === 1 ? "baixa de insumo desfeita" : "baixas de insumo desfeitas"} — o material voltou ao estoque.`);
        }
      }
      r.mesPagamento = normalizarComp(r.mesPagamento, r.retornadaEm);
      delete r.mesPagamentoAuto;
      /* toda saída solta o botão: sem isto ele fica em "Aguarde…" para sempre e
         a pessoa acha que gravou. É a mesma regra da 7.80, que faltava aqui. */
      if (r.mesPagamento && mesFechado(r.mesPagamento)) { S._solta?.();
        return toast(`${r.mesPagamento} está fechado — escolha outro mês de pagamento ou reabra o mês em Prestadoras.`, "erro"); }
      if (!String(r.numero || "").trim()) r.numero = "s/nº";
      r.numero = String(r.numero).trim().toUpperCase();
      const duplicado = numeroEmUso(r.numero, r.id);
      if (duplicado) { S._solta?.();
        return toast(`O número ${r.numero} já é do pedido de ${duplicado.prestadora || "prestadora não definida"} (${P_LABEL[duplicado.status] || duplicado.status}${duplicado.status === "cancelado" ? " — procure no chip Cancelados" : ""}). Para o mesmo produto em outra prestadora com processo diferente, use ${proximaContinuacao(r.numero)}.`, "erro"); }
      if (r.qtdMix != null || r.qtdEmbalar != null) {
        /* NÃO recalcular `qtdEmbalar` a partir do mix: era isto que jogava o
           número digitado de volta para a quantidade produzida. Cada campo é a
           decisão de quem está preenchendo; o app só limita ao que existe. */
        const qtdT = Math.max(0, Number(r.qtd) || 0);
        r.qtdMix = Math.max(0, Math.min(Number(r.qtdMix) || 0, qtdT));
        r.qtdEmbalar = Math.max(0, Math.min(Number(r.qtdEmbalar ?? qtdT) || 0, qtdT));
        if (r.qtdEmbalar + r.qtdMix > qtdT) { S._solta?.();
          return toast(`Embalar ${n0(r.qtdEmbalar)} + mix ${n0(r.qtdMix)} dá ${n0(r.qtdEmbalar + r.qtdMix)}, e o pedido tem ${n0(qtdT)} peças. Ajuste um dos dois.`, "erro"); }
      }
      r.atualizadoEm = new Date().toISOString();
      if (antes.prioridade !== r.prioridade) registrar(r.opId, `pedido ${r.numero} repriorizado`, { prioridade: antes.prioridade }, { prioridade: r.prioridade });
      /* a embalagem editada aqui pertence ao PRODUTO — grava nele e avisa,
         porque o efeito vale para todos os pedidos daquele SKU */
      let mudouEmb = false;
      const prodEmb = produtoDe(opPorId(r.opId)?.sku || r.sku);
      if (prodEmb) {
        prodEmb.producao = prodEmb.producao || {};
        $$("[data-pp]").forEach((el2) => {
          const k = el2.dataset.pp;
          const v2 = el2.value === "" ? null : (k === "qtdPorEmbalagem" ? Number(el2.value) : el2.value);
          if ((prodEmb.producao[k] ?? null) !== v2) { prodEmb.producao[k] = v2; mudouEmb = true; }
        });
        if (prodEmb.producao.embalagemTipo === "filipeta") prodEmb.producao.embalagemTamanho = null;
      }
      recalcularOP(opPorId(r.opId));
      /* ABA DE REGISTRO (v8.62 · etapa 3): salvar fecha a janela — então fecha
         também a aba dela, e a pessoa volta para a lista de onde saiu, com o
         filtro e a rolagem intactos. Precisa ser lido ANTES da linha abaixo,
         que zera `S.modal`. */
      const abaDoPedido = (typeof abaDeRegistroAtiva === "function" ? abaDeRegistroAtiva() : null);
      const fecharAbaDoPedido = abaDoPedido && abaDoPedido.alvo === r.id ? abaDoPedido.id : null;
      S.modal = S.modal?.voltarPara || null;   /* veio da janela dos papéis: volta para ela */
      if (fecharAbaDoPedido && typeof abasLimparRascunho === "function") {
        abasLimparRascunho(r.id);
        if (typeof abasFechar === "function") abasFechar(fecharAbaDoPedido);
      }
      render();
      /* tudo o que esta janela mexeu vai numa fila de gravação só: pedido,
         devolução de insumo e embalagem do produto. Se falhar, falha inteiro e
         o indicador acende — não fica meio gravado */
      if (mudouEmb) S.produtos = S.produtos;
      await salvarTudo("nucleo", ...(insumoMexeu ? ["insumos"] : []), ...(mudouEmb ? ["produtos"] : []));
      toast(mudouEmb ? `Pedido atualizado · embalagem gravada no produto ${prodEmb.sku}.` : "Pedido atualizado.");
    }
    else return false;
    return true;
}

