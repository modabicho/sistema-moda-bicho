async function acoesFabrica(act, t, e) {
    let el = t;
    /* ---------------------------------------------------------------------
       CANCELAR · REATIVAR · EXCLUIR
       ---------------------------------------------------------------------
       Antes, `cancelar-pedido` executava no clique: sete linhas entre o clique
       e o pedido cancelado, sem pergunta nenhuma. Agora as três ações que tiram
       um pedido do fluxo passam por uma pergunta, e quem executa de verdade é
       `confirmar-sim` — o botão da janela de confirmação.
       --------------------------------------------------------------------- */
    if (act === "cancelar-pedido") {
      const r = S.modal.pedido;
      if (!pedPodeCancelar(r)) return toast("Este pedido não está no fluxo de produção.", "erro");
      S.modal = { tipo: "confirmar", voltarPara: S.modal,
        titulo: "Cancelar este pedido?",
        texto: "O pedido sairá do fluxo de produção, mas poderá ser reativado depois.",
        acao: "Cancelar pedido", perigo: true,
        aoConfirmar: async () => {
          const rr = await pedCancelar(r);
          S.modal = null;
          if (rr.status !== "ok") return toast("Não consegui cancelar este pedido.", "erro");
          toast(`Pedido ${r.numero} cancelado — a quantidade volta como saldo na Demanda.`);
        } };
      render();
    }
    else if (act === "excluir-pedido") {
      const r = S.modal.pedido;
      if (!pedPodeExcluir(r)) return toast("Só um pedido cancelado pode ser excluído.", "erro");
      S.modal = { tipo: "confirmar", voltarPara: S.modal,
        titulo: "Excluir este pedido?",
        texto: "O pedido será removido da operação e não poderá ser reativado.",
        acao: "Excluir pedido", perigo: true,
        detalhe: `O número <b>${esc(r.numero)}</b> continua consumido — ele não volta para a fila e nenhum pedido novo vai recebê-lo.`,
        aoConfirmar: async () => {
          const rr = await pedExcluir(r);
          S.modal = null;
          if (!rr || rr.status !== "ok") return toast(telaTextoDoProblema({ id: r.id, resposta: rr }) || "Não consegui excluir este pedido.", "erro");
          toast(`Pedido ${r.numero} removido da operação. O histórico e o número continuam guardados.`);
        } };
      render();
    }
    else if (act === "reativar-pedido") {
      const r = S.modal.pedido;
      if (!pedPodeReativar(r)) return toast("Este pedido não está cancelado.", "erro");
      const est = pedEstagioAnterior(r);
      /* Estágio guardado: reativa direto — não há o que perguntar. Sem estágio
         guardado: pergunta, com a sugestão e o motivo dela. Nunca escolhe
         calado. */
      if (est.guardado) {
        const rr = await pedReativar(r, est.status);
        S.modal = null; render();
        if (rr.status !== "ok") return toast("Não consegui reativar este pedido.", "erro");
        return toast(`Pedido ${r.numero} reativado em ${P_LABEL[rr.para] || rr.para}.`);
      }
      S.modal = { tipo: "reativarPedido", pedido: r, sugestao: est, voltarPara: S.modal };
      render();
    }
    else if (act === "confirmar-reativacao") {
      const r = S.modal.pedido;
      const escolhido = $("[data-reativar-status]")?.value || pedEstagioAnterior(r).status;
      const rr = await pedReativar(r, escolhido);
      S.modal = null; render();
      if (rr.status !== "ok") return toast("Não consegui reativar este pedido.", "erro");
      toast(`Pedido ${r.numero} reativado em ${P_LABEL[rr.para] || rr.para}.`);
    }
    else if (act === "confirmar-sim") {
      const fn = S.modal && S.modal.aoConfirmar;
      if (typeof fn !== "function") { S.modal = null; return render(); }
      await fn();
      render();
    }
    else if (act === "nova-falta") abrirFalta(null);
    else if (act === "salvar-falta") {
      const fx = S.modal.falta;
      $$("[data-fx]").forEach((el2) => { const k = el2.dataset.fx; fx[k] = el2.type === "number" ? (el2.value === "" ? null : Number(el2.value)) : (el2.value.trim() || null); });
      if (!fx.item) return toast("Descreva o item em falta.", "erro");
      if (S.modal.novo) S.faltas.push(fx);
      for (const pid of fx.pedidoIds || []) { const r = pedidoPorId(pid); if (r && fx.status === "aberta") r.aguardandoMaterial = true; }
      S.modal = null; await salvarFaltas();
      toast(`"${fx.item}" anotado para compra${fx.fornecedor ? ` · ${fx.fornecedor}` : ""}.`);
    }
    else if (act === "excluir-falta") {
      const fx = S.modal.falta;
      S.faltas = S.faltas.filter((x) => x.id !== fx.id);
      for (const pid of fx.pedidoIds || []) {
        const r = pedidoPorId(pid);
        if (r && !S.faltas.some((o) => o.status !== "recebida" && (o.pedidoIds || []).includes(pid))) r.aguardandoMaterial = false;
      }
      S.modal = null; await salvarFaltas(); toast("Item removido.");
    }
    /* v8.84 · abre POR CIMA da janela que está aberta, guardando o rascunho
       dela inteiro. Antes trocava `S.modal` sem `voltarPara` e o que estava
       preenchido no pedido sumia — ver `abrirPorCimaDaJanela`. */
    else if (act === "tamanhos-emb") { abrirPorCimaDaJanela({ tipo: "tamEmb" }); }
    else if (act === "tam-add") {
      if (!ehAdm()) return toast("Cadastrar tamanho de embalagem é da administração.", "erro");
      const r2 = cadastrarTamanhoEmb($("#tam-novo")?.value);
      if (r2.erro) return toast(r2.erro, "erro");
      await salvarTudo("cad");
      render();
      toast(`Tamanho ${r2.valor} cadastrado.`);
    }
    else if (act === "deduzir-etapas") {
      migrarProdutosV2();
      const uso = new Map();
      for (const r of S.pedidos) {
        if (!Array.isArray(r.etapas)) continue;
        const sku2 = opPorId(r.opId)?.sku || r.sku;
        for (const e2 of r.etapas) if (Number(e2.qtd) > 0) {
          if (!uso.has(sku2)) uso.set(sku2, new Set());
          uso.get(sku2).add(String(e2.nome).toUpperCase());
        }
      }
      let n = 0;
      for (const p of S.produtos) {
        if (Array.isArray(p.etapasUsadas) && p.etapasUsadas.length) continue;
        const u = uso.get(p.sku);
        if (!u || !u.size) continue;
        const tpl2 = tplDoProcesso(p.processo);
        const marcadas = tpl2.etapas.filter((e2) => u.has(String(e2).toUpperCase()) || /EMBALA/.test(String(e2).toUpperCase()));
        if (marcadas.length && marcadas.length < tpl2.etapas.length) { p.etapasUsadas = marcadas; n++; }
      }
      await salvarProdutos(S.produtos);
      toast(n ? `Etapas deduzidas das conferências para ${n} SKUs (quem já tinha escolha manual não mudou).` : "Nada novo a deduzir — os SKUs com histórico de conferência já têm etapas definidas.");
    }
    else if (act === "fornecedores") { S.modal = { tipo: "fornecedores" }; render(); }
    else if (act === "forn-add") {
      const nome = ($("#forn-nome")?.value || "").trim();
      if (!nome) return toast("Digite o nome do fornecedor.", "erro");
      S.cad.fornecedores = S.cad.fornecedores || [];
      if (S.cad.fornecedores.some((x) => x.nome.toLowerCase() === nome.toLowerCase())) return toast("Esse fornecedor já existe.", "erro");
      const prazo = Number(($("#forn-prazo")?.value || "").trim()) || null;
      S.cad.fornecedores.push({ id: uid(), nome, prazoDias: prazo });
      await salvarTudo("cad");
      render();
      toast(`Fornecedor ${nome} cadastrado${prazo ? ` (~${prazo} dias)` : ""}.`);
    }
    else if (act === "qtd-add") {
      if (!ehAdm()) return toast("Cadastrar quantidade de embalagem é da administração.", "erro");
      const r2 = cadastrarQtdEmb($("#qtd-nova")?.value);
      if (r2.erro) return toast(r2.erro, "erro");
      await salvarTudo("cad");
      render();
      toast(`Quantidade ${n0(r2.valor)} cadastrada.`);
    }
    else if (act === "confirmar-remover-emb") {
      const m2 = S.modal; if (!m2) return;
      if (!ehAdm()) { S._solta?.(); return toast("Remover destas listas é da administração.", "erro"); }
      const rot = m2.qual === "tamanho" ? m2.valor : n0(m2.valor);
      if (m2.qual === "tamanho") S.cad.tamanhosEmbalagem = tamanhosEmbalagemOrdenados().filter((x) => x !== m2.valor);
      else S.cad.qtdsEmbalagem = qtdsEmbalagemOrdenadas().filter((x) => x !== Number(m2.valor));
      S.modal = { tipo: "tamEmb" };
      await salvarTudo("cad");
      render();
      toast(`${rot} saiu da lista. Os produtos que já usavam continuam como estavam.`);
    }
    else if (act === "lote-embalagem") { S.modal = { tipo: "loteEmb", qtd: (S.selProd || new Set()).size, v: {} }; render(); }
    else if (act === "salvar-lote-emb") {
      const tipo = $("#lote-tipo")?.value || "", tam = ($("#lote-tam")?.value || "").trim(), qtd2 = $("#lote-qtd")?.value;
      const forn = $("#lote-forn")?.value || "";
      let n = 0;
      for (const id of S.selProd || []) {
        const p = produtoPorIdProd(id);
        if (!p) continue;
        p.producao = p.producao || {};
        if (tipo) p.producao.embalagemTipo = tipo;
        if (tipo === "filipeta") p.producao.embalagemTamanho = null;
        else if (tam) p.producao.embalagemTamanho = tam;
        if (qtd2 !== "" && qtd2 != null && Number(qtd2) > 0) p.producao.qtdPorEmbalagem = Number(qtd2);
        if (forn && forn !== "__novo") p.producao.fornecedorId = forn;
        n++;
      }
      registrar(null, `embalagem definida em lote para ${n} produtos`, null, null);
      S.selProd = new Set(); S.modal = null;
      await salvarProdutos(S.produtos);
      toast(`Embalagem aplicada a ${n} produtos.`);
    }
    else if (act === "novo-produto") { S.modal = { tipo: "produto", produto: { qtdPacote: 1 }, novo: true }; render(); }
    else if (act === "salvar-produto") {
      colherProduto();
      const p = S.modal.produto;
      /* receita própria: linha sem insumo ou sem quantidade não é receita, é
         rascunho — e uma lista que sobrou vazia volta a ser "segue o processo" */
      if (Array.isArray(S.modal.receitaProd)) {
        const limpa = S.modal.receitaProd.filter((x) => x.insumoId && Number(x.qtd) > 0)
          .map((x) => ({ insumoId: x.insumoId, qtd: Number(x.qtd) }));
        p.receita = limpa.length ? limpa : null;
      } else if (S.modal.receitaProd === null) p.receita = null;
      if (p.producao.embalagemTipo === "filipeta") p.producao.embalagemTamanho = null;
      if (p.producao.qtdPorEmbalagem != null && p.producao.qtdPorEmbalagem !== "") p.producao.qtdPorEmbalagem = Number(p.producao.qtdPorEmbalagem) || null;
      else p.producao.qtdPorEmbalagem = null;
      if (!p.sku) return toast("Informe o SKU.", "erro");
      if (!p.id) { p.id = proximoIdProduto(); p.skuAtual = p.sku; p.skusAnteriores = []; }
      /* ---------- trocar o SKU aqui não pode romper o vínculo ----------
         As necessidades e os pedidos guardam o SKU de quando nasceram. O índice
         casa SKU antigo com produto por meio de `skusAnteriores` — e a troca
         feita pela Magazord alimentava essa lista, mas a troca feita AQUI, na
         mão, não. Resultado: mudar o SKU no cadastro fazia o pedido perder o
         produto, e ele sumia da fila e da Demanda como se não existisse. */
      const anterior = S.produtos.find((x) => x.id === p.id)?.sku;
      if (anterior && anterior !== p.sku) {
        p.skusAnteriores = [...(p.skusAnteriores || []), { sku: anterior, ate: iso(hoje()) }];
        registrar(null, `SKU do produto ${p.id} alterado à mão: ${anterior} → ${p.sku}`, null, null);
      }
      p.skuAtual = p.sku;
      p.revisarProducao = false;
      const idx = S.produtos.findIndex((x) => x.id === p.id || x.sku === p.sku);
      if (S.modal.novo && idx >= 0) return toast("Já existe produto com esse SKU.", "erro");
      if (idx >= 0) S.produtos[idx] = p; else S.produtos.push(p);
      S.modal = null; await salvarProdutos(S.produtos); toast("Produto salvo.");
    }
    else if (act === "excluir-produto") {
      const p = S.modal.produto;
      S.modal = null;
      abrirExclusaoProdutos([p.id].filter(Boolean).length ? [p.id] : S.produtos.filter((x) => x.sku === p.sku).map((x) => x.id));
    }
    else if (act === "etapas-todas") {
      const r = S.modal.pedido;
      const estr = estruturaDe(r.processo || produtoDe(opPorId(r.opId)?.sku || r.sku)?.processo);
      S.modal.sel = (estr?.etapas || []).map((e2) => String(e2.nome).toUpperCase());
      repintarModal();
    }
    else if (act === "salvar-etapas-pedido") {
      if (!podeEditar("pedEtapas")) return recusaPerm("pedEtapas");
      const r = S.modal.pedido;
      const marcadas = $$("[data-etp]").filter((x) => x.checked).map((x) => x.dataset.etp);
      if (!marcadas.length) return toast("Marque ao menos uma etapa — senão o pedido não gera pagamento.", "erro");
      const estr = estruturaDe(r.processo || produtoDe(opPorId(r.opId)?.sku || r.sku)?.processo);
      const todas = (estr?.etapas || []).map((e2) => String(e2.nome).toUpperCase());
      /* v8.87 · marcou tudo é UMA LISTA, não a falta de uma. Antes isto gravava
         `null` e o pedido voltava a "seguir a estrutura" — o que dava no mesmo
         resultado, mas apagava o registro de que alguém decidiu. Pior: um
         pedido criado com a lista por extenso voltava a `null` na primeira vez
         que estas etapas fossem salvas, desfazendo a separação pela porta de
         trás. A leitura não mudou: `null` nos pedidos antigos continua valendo
         por todas as etapas do processo. */
      r.etapasUsadas = marcadas;
      S.modal = null;
      await salvarPedidos();
      toast(`Pedido ${r.numero}: ${marcadas.length === todas.length ? "todas as etapas do processo" : marcadas.join(" · ")}.`);
    }
    else if (act === "enviar-mesmo-assim") {
      if (S.modal?.tipo !== "furaFila") return;
      const r = S.modal.pedido; S.modal = null;
      enviarPedido(r.id, true);
    }
    else if (act === "enviar-o-antigo") {
      const { atras, pedido } = S.modal;
      const antigo = atras[0];
      S.modal = null;
      if (!antigo.prestadora && pedido.prestadora) antigo.prestadora = pedido.prestadora;
      if (antigo.status === "separando") enviarPedido(antigo.id, true);
      else { S.modal = { tipo: "pedido", pedido: antigo }; render();
        toast(`${antigo.numero} ainda está em "${P_LABEL[antigo.status]}" — avance até "${P_LABEL.separando}" para poder enviar.`); }
    }
    else if (act === "conflito-ficar-servidor") {
      if (S.modal?.tipo !== "conflito") return;
      const { pedido, briga } = S.modal;
      /* traz do servidor só os campos do pedido em disputa, sem mexer no resto */
      Object.assign(pedido, briga.servidor);
      S.carimboVisto = new Date().toISOString();
      S.modal = null; render();
      toast(`Pedido ${pedido.numero} ficou com a versão de ${briga.por || "quem salvou antes"}. Sua tela foi atualizada.`);
    }
    else if (act === "conflito-usar-meu") {
      if (S.modal?.tipo !== "conflito") return;
      const { volta } = S.modal;
      /* a foto passa a ser a do servidor: ao salvar de novo, não acusa o mesmo conflito */
      S.carimboVisto = new Date().toISOString();
      S.modal = volta; render();
      toast("Confira os campos e clique em salvar de novo — agora vai gravar por cima.");
    }
    else if (act === "atualizar-agora") {
      /* Buscar do servidor joga fora o que está na tela e ainda não subiu. */
      if (temTrabalhoNaoGravado()) { S.modal = { tipo: "riscoRecarregar", oQue: "atualizar" }; return render(); }
      await recarregarDoServidor();
    }
    else if (act === "versao-depois") { S.versaoNova = null; render(); toast("Ok — o aviso volta na próxima vez que você abrir o app."); }
    else if (act === "recarregar-app") {
      /* ---------- não atualize por cima de trabalho que não subiu ----------
         Recarregar troca o arquivo e limpa a memória da página. Se ainda há
         gravação pendente ou o servidor recusou a última, o que está na tela
         morre aqui — e o aviso de versão nova, que é o MENOS urgente de todos,
         seria o gatilho. O portão fica na AÇÃO e não no texto do banner, senão
         qualquer outro caminho (aba Dados, atalho) continuaria passando reto. */
      if (temTrabalhoNaoGravado()) { S.modal = { tipo: "riscoRecarregar", oQue: "recarregar" }; return render(); }
      /* Recarregar joga a pessoa de volta ao início sem dizer o que aconteceu.
         Então: pergunta a versão publicada ANTES. Se já está em dia, avisa e não
         recarrega. Se há versão nova, deixa um recado que o app lê ao voltar. */
      const el0 = t; if (el0) { el0.disabled = true; el0.textContent = "Conferindo…"; }
      const pub = await versaoPublicada();
      if (pub && versaoNum(pub) <= versaoNum(VERSAO)) {
        S.versaoNova = null; S.versaoPublicada = pub;
        render();
        return toast(`Você já está na versão mais recente (${VERSAO}). Nada a atualizar.`);
      }
      try { localStorage.setItem("pcp:atualizando", JSON.stringify({ de: VERSAO, para: pub || null, em: Date.now() })); } catch {}
      try { if (window.caches?.keys) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } } catch {}
      try { const rs = await navigator.serviceWorker?.getRegistrations?.(); if (rs) await Promise.all(rs.map((r) => r.unregister())); } catch {}
      window.location.reload();
    }
    else if (act === "avisar-prestadoras") {
      const alvo = S.pedidos.filter((r) => r.avisar && (r.status === "enviada" || r.status === "chegou"));
      if (!alvo.length) return toast("Nenhum pedido com a prestadora mudou de prioridade.");
      const grupos = new Map();
      for (const r of alvo) {
        const k = r.prestadora || "Sem prestadora";
        (grupos.get(k) || grupos.set(k, []).get(k)).push(r);
      }
      S.modal = { tipo: "recados", grupos: [...grupos.entries()].sort((a, b2) => a[0].localeCompare(b2[0])) };
      render();
    }
    else if (act === "copiar-recado") {
      const nome = S.modal.grupos[Number(el.dataset.idx)][0];
      await copiar(textoRecado(nome, S.modal.grupos[Number(el.dataset.idx)][1]), `Recado para ${nome} copiado — cole no WhatsApp.`);
    }
    else if (act === "recado-feito") {
      if (S.modal?.tipo !== "recados") return;
      const [nome, lista] = S.modal.grupos[Number(el.dataset.idx)];
      for (const r of lista) delete r.avisar;
      S.modal.grupos = S.modal.grupos.filter((g) => g[0] !== nome);
      if (!S.modal.grupos.length) S.modal = null;
      await salvarPedidos();
      render();
      toast(`${nome} avisada — ${n0(lista.length)} pedidos saíram da lista.`);
    }
    else if (act === "copiar-producao") {
      const v2 = S.pedView, c2 = S.calc;
      const nomeF = v2.fornecedor === "__sem" ? "Sem fornecedor"
        : ((S.cad.fornecedores || []).find((f2) => f2.id === v2.fornecedor)?.nome || "");
      const meus = [...c2.papel, ...c2.fila, ...c2.emCampo].filter((x) => {
        const fid = produtoDe(opPorId(x.opId)?.sku || x.sku)?.producao?.fornecedorId || null;
        return v2.fornecedor === "__sem" ? !fid : fid === v2.fornecedor; })
        .sort((a2, b2) => P_STATUS.indexOf(b2.status) - P_STATUS.indexOf(a2.status));
      const txt = [`Em produção — ${nomeF} — ${fdate(hoje())}`, ""]
        .concat(meus.map((x) => `${x.numero} · ${opPorId(x.opId)?.sku || x.sku} · ${n0(x.qtd)} pçs · ${P_LABEL[x.status]}${x.prestadora ? ` · ${x.prestadora}` : ""}`))
        .concat(["", `Total: ${n0(meus.reduce((t2, x) => t2 + (Number(x.qtd) || 0), 0))} peças em ${n0(meus.length)} pedidos`]).join("\n");
      await copiar(txt, `Lista de ${nomeF} copiada — ${n0(meus.length)} pedidos.`);
    }
    else if (act === "copiar-compra") {
      const d2 = S.demanda;
      const nomeF = d2.fornecedor === "__sem" ? "Sem fornecedor"
        : ((S.cad.fornecedores || []).find((f2) => f2.id === d2.fornecedor)?.nome || "");
      const linhas = (S.calc?.linhas || []).filter((x) => {
        const fid = produtoDe(x.sku)?.producao?.fornecedorId || null;
        return d2.fornecedor === "__sem" ? !fid : fid === d2.fornecedor; })
        .map((x) => ({ sku: x.sku, q: Math.max(0, (x.necessidadeBruta || 0) - ((x.etapas?.Cortado || 0) + (x.etapas?.["Com a prestadora"] || 0))) }))
        .filter((x) => x.q > 0).sort((a2, b2) => b2.q - a2.q);
      const txt = [`Compra — ${nomeF} — ${fdate(hoje())}`, ""]
        .concat(linhas.map((x) => `${x.sku} — ${n0(x.q)} pçs`))
        .concat(["", `Total: ${n0(linhas.reduce((t2, x) => t2 + x.q, 0))} peças`]).join("\n");
      await copiar(txt, `Lista de ${nomeF} copiada — ${n0(linhas.length)} produtos.`);
    }
    else if (act === "selprod-filtro") {
      /* marca TODOS os que passam pelo filtro, não só os que couberam na tela —
         é a mesma regra do "marcar todos" das Datas festivas. Marcar só o que
         está à vista seria a pessoa achar que selecionou 842 e ter selecionado 60. */
      const alvo = produtosFiltrados().map((p) => p.id).filter(Boolean);
      S.selProd = new Set(alvo);
      render();
      toastPasso(`${n0(alvo.length)} ${alvo.length === 1 ? "produto selecionado" : "produtos selecionados"}.`,
        "eles continuam marcados se você rolar ou mostrar mais",
        "use as ações da barra ou limpe a seleção");
    }
    else if (act === "limpar-selprod") { S.selProd = new Set(); render(); }
    else if (act === "excluir-produtos-lote") { abrirExclusaoProdutos([...(S.selProd || [])]); }
    else if (act === "confirmar-excluir-produtos") {
      if (S.modal?.tipo !== "excluirProdutos") return;
      const { podem } = S.modal;
      const skus = new Set(podem.map((x) => x.sku));
      const ids = new Set(podem.map((x) => x.id));
      S.modal = null;
      /* limpa também as OPs órfãs: OP sem produto não aparece em lugar nenhum e
         só engorda o arquivo. Pedidos vivos já foram barrados antes de chegar aqui. */
      const opsAntes = S.ops.length;
      /* v8.74 · P7 · DECLARAÇÃO. Estas OPs somem porque a PESSOA excluiu o
         produto — é remoção de verdade, e tem de continuar sendo enviada.
         Sem dizer isso em voz alta, a camada não teria como distinguir desta
         mesma ausência causada por uma sincronização. */
      if (typeof demDeclararRemocao === "function") {
        demDeclararRemocao(S.ops.filter((o) => skus.has(o.sku)).map((o) => o.id),
          "produto excluído");
      }
      S.ops = S.ops.filter((o) => !skus.has(o.sku));
      for (const id of ids) S.selProd.delete(id);
      await salvarProdutos(S.produtos.filter((x) => !ids.has(x.id)));
      await salvarTudo("nucleo");
      toast(`${n0(podem.length)} ${podem.length === 1 ? "produto excluído" : "produtos excluídos"}${opsAntes - S.ops.length ? ` · ${n0(opsAntes - S.ops.length)} necessidades removidas junto` : ""}.`);
    }
    else if (act === "bem-add") {
      const nome = ($("#bem-nome")?.value || "").trim();
      if (!nome) return toast("Escreva o nome do item.", "erro");
      const b = criarBem({ nome, unidade: $("#bem-un")?.value || "un", tipo: $("#bem-tipo")?.value });
      if (!b) return toast("Não deu para criar o item.", "erro");
      await salvarTudo("insumos"); render();
      toast(`${b.nome} entrou na lista.`);
    }
    else if (act === "mais-posse") { S.posseView.limite += 120; render(); }
    else if (act === "reordenar-fila") { S.pedView.ancora = null; render();
      toast("Lista reordenada pela prioridade de agora."); }
    else if (act === "salvar-devolucao") {
      const x = posseItemPorId(S.modal?.itemId); if (!x) return true;
      const b = bemPorId(x.bemId);
      const q = Number($("#dev-qtd")?.value) || 0;
      const resta = emPosseDe(x);
      if (q <= 0) return toast("Quanto voltou?", "erro");
      if (q > resta) return toast(`Só constam ${nDec(resta)} com ${x.prestadora}. Se voltou mais, falta anotar uma saída.`, "erro");
      const em = $("#dev-em")?.value || iso(hoje());
      const obs = ($("#dev-obs")?.value || "").trim() || null;
      x.baixas = [...baixasDe(x), { id: uid(), qtd: q, tipo: "devolucao", em,
        por: usuarioAtual()?.nome || null, obs, rid: uid() }];
      registrar(null, `${b?.nome || "item"} devolvido por ${x.prestadora}: ${nDec(q)}`, null, null);
      S.modal = null;
      await salvarTudo("insumos"); render();
      toast(`Devolução registrada — ${nDec(q)} ${b?.unidade || "un"} de ${b?.nome || "item"}.`);
    }
    else if (act === "nova-retirada" || act === "nova-devolucao") {
      S.modal = { tipo: "retirada", r: { sentido: act === "nova-devolucao" ? "volta" : "saida",
        prestadora: t?.dataset?.prest || "", data: iso(hoje()), prods: [], mats: [], encerrar: [] } };
      render();
    }
    else if (act === "rt-add-prod") { const r = colherRetirada(); if (!r) return true;
      r.prods = r.prods || []; r.prods.push({ categoria: "dia", variante: "normal", tamanhos: [] }); r.sugerido = null; render(); }
    else if (act === "rt-add-mat") { const r = colherRetirada(); if (!r) return true;
      r.mats = r.mats || []; r.mats.push({ bemId: "", qtd: null, emb: true }); r.sugerido = null; render(); }
    else if (act === "salvar-retirada") await salvarRetirada();
    else if (act === "nova-prestadora") { S.modal = { tipo: "prestadora", prest: { ativo: true, processos: [] }, novo: true }; render(); }
    else if (act === "nova-campanha") { S.modal = { tipo: "campanha", campanha: {} }; render(); }
    else if (act === "rel-limpar") {
      Object.assign(S.relView, { processo: "todos", setor: "todos", prestadora: "todas", abc: "todos" });
      render();
    }
    else if (act === "fest-criar-sel") {
      const c = campanhaPorId(S.festivasView.campanha);
      if (!c) return;
      const skus = itensDaCampanha(c).map((i) => i.sku).filter((sk) => S.sel.has(sk));
      if (!skus.length) return toast("Nenhum produto selecionado.", "erro");
      /* em PEÇAS, como o pedido de produção espera — e com piso de um pacote */
      const ls = festLinhas(c);
      const produzir = new Map(ls.map((x) => [x.sku, x.produzir]));
      const pisos = new Map(ls.map((x) => [x.sku, Math.max(1, x.pac)]));
      abrirCriarPedidos(skus, (l) => Math.max(pisos.get(l.sku) || 1, produzir.get(l.sku) || 0), c.id);
    }
    else if (act === "fest-marcar-todos") {
      const c = campanhaPorId(S.festivasView.campanha);
      const jaTem = itensDaCampanha(c).map((i) => i.sku);
      const achados = festBuscaSku(S.festivasView.busca, jaTem, 60).todos.map((a) => a.sku);
      const v2 = S.festivasView;
      /* marca TODOS os achados, não só os que couberam na tela */
      v2.selAdd = achados.every((sk) => (v2.selAdd || []).includes(sk)) ? [] : achados;
      render();
    }
    else if (act === "fest-add-lote") {
      const c = campanhaPorId(S.festivasView.campanha);
      if (!c) { S._solta?.(); return; }
      const jaTem = new Set(itensDaCampanha(c).map((i) => i.sku));
      const comp = $("#fest-comp-add")?.value || S.festivasView.compAdd || "exclusivo";
      const novos = (S.festivasView.selAdd || []).filter((sk) => sk && !jaTem.has(sk));
      if (!novos.length) { S._solta?.(); return toast("Nenhum produto novo marcado.", "erro"); }
      const em = new Date().toISOString();
      c.itens = [...itensDaCampanha(c), ...novos.map((sku) => ({ sku, comportamento: comp,
        baseSkus: [], baseManual: null, metaManual: null, meta: null, em }))];
      S.festivasView.selAdd = []; S.festivasView.busca = "";
      await gravarFestivas(`${novos.length} produtos entraram na campanha ${c.nome}`);
      toast(`${n0(novos.length)} ${novos.length === 1 ? "produto vinculado" : "produtos vinculados"} como “${FEST_COMP_NOME[comp]}”.`);
    }
    else if (act === "fest-tirar-lote") {
      const c = campanhaPorId(S.festivasView.campanha);
      const sel = S.festivasView.selProd || [];
      if (!c || !sel.length) { S._solta?.(); return; }
      if (!confirm(`Tirar ${sel.length} ${sel.length === 1 ? "produto" : "produtos"} da campanha ${c.nome}?\n\nOs produtos e os pedidos não são tocados — só o vínculo com a campanha.`)) { S._solta?.(); return; }
      c.itens = itensDaCampanha(c).filter((i) => !sel.includes(i.sku));
      S.festivasView.selProd = [];
      await gravarFestivas(`${sel.length} produtos saíram da campanha ${c.nome}`);
      toast(`${n0(sel.length)} ${sel.length === 1 ? "produto saiu" : "produtos saíram"} da campanha.`);
    }
    else if (act === "fest-limpar-sel") { S.festivasView.selProd = []; render(); }
    else if (act === "fest-unir-sel") {
      /* exatamente dois, e os dois desta campanha — a seleção pode carregar
         SKU que já saiu da campanha, e a tela filtra, mas o estado não */
      const c = campanhaPorId(S.festivasView.campanha);
      const daCampanha = new Set(itensDaCampanha(c).map((i) => i.sku));
      const sel = (S.festivasView.selProd || []).filter((sk) => daCampanha.has(sk));
      if (!c || sel.length !== 2) return toast("Selecione exatamente 2 produtos da campanha para unir.", "erro");
      S.modal = { tipo: "festUnir", campanhaId: c.id, skus: sel, fica: null };
      render();
    }
    else if (act === "fest-unir") {
      const m2 = S.modal;
      if (!m2 || m2.tipo !== "festUnir") return;
      const r = festUnirAplicar(m2.campanhaId, m2.skus, m2.fica);
      if (!r.ok) { toast(r.erro, "erro"); return; }
      S.modal = null;
      /* o render recalcula `S.calc` (a união o zerou) e, com ele, toda a conta
         da campanha: venda, estoque, em produção, pronto, a produzir, situação
         e os totais. A análise NÃO é reaplicada — ver festUnirAplicar. */
      render();
      /* DUAS seções: o cadastro do produto e as campanhas. Uma chamada só —
         meio gravado é o pior dos estados possíveis. */
      registrar(null, `${r.skuAntigo} unido a ${r.produto.sku}`, null, null);
      await salvarTudo("produtos", "festivas", "nucleo");
      toast(`${r.absorvido} agora é SKU anterior de ${r.principal}.`
        + (r.opsMigradas || r.pedidosMigrados ? ` ${n0(r.opsMigradas + r.pedidosMigrados)} em produção recebeu o código novo.` : "")
        + " Estoques não foram somados."
        + (r.reaplicar ? ` A meta sugerida de ${r.principal} mudou com o histórico unido — confira no Planejamento e use “Aplicar análise” se concordar.` : ""));
    }
    else if (act === "fest-vendas") { S.modal = { tipo: "festVendas", campanhaId: S.festivasView.campanha }; render(); }
    else if (act === "fest-analise") { S.modal = { tipo: "festAnalise", campanhaId: S.festivasView.campanha }; render(); }
    else if (act === "fest-aplicar") {
      const c = campanhaPorId(S.modal?.campanhaId);
      if (!c) { S._solta?.(); return; }
      await festAplicarAnalise(c);
    }
    else if (act === "salvar-festitem") {
      const c = campanhaPorId(S.modal?.campanhaId);
      const it = itensDaCampanha(c).find((i) => i.sku === S.modal?.sku);
      if (!it) { S._solta?.(); return; }
      const num = (id) => { const cru = ($("#" + id)?.value || "").trim();
        return cru === "" ? null : Math.max(0, Number(cru.replace(",", ".")) || 0); };
      it.baseManual = num("fi-base");
      it.metaManual = num("fi-meta");
      S.modal = null;
      await gravarFestivas(`${it.sku}: base e meta ajustadas em ${c.nome}`);
      toast("Salvo.");
    }
    else if (act === "fest-limpar") {
      Object.assign(S.festivasView, { buscaPlano: "", abcF: "todos", procF: "todos" });
      render();
    }
    else if (act === "fest-mais") { S.festivasView.limite = (S.festivasView.limite || 60) + 60; render(); }
    else if (act === "fest-voltar") { S.festivasView.campanha = null; S.festivasView.busca = ""; render(); }
    else if (act === "salvar-campanha") {
      const val = (id) => ($("#" + id)?.value || "").trim();
      const nome = val("c-nome");
      if (!nome) { S._solta?.(); return toast("A campanha precisa de um nome.", "erro"); }
      const ini = val("c-ini"), fim = val("c-fim"), pIni = val("c-pini"), pFim = val("c-pfim");
      /* datas invertidas viram planejamento errado calado — melhor barrar aqui */
      if (ini && fim && ini > fim) { S._solta?.(); return toast("A campanha termina antes de começar — confira as datas.", "erro"); }
      if (pIni && pFim && pIni > pFim) { S._solta?.(); return toast("A preparação termina antes de começar — confira as datas.", "erro"); }
      if (pIni && ini && pIni > ini) { S._solta?.(); return toast("A preparação começa depois da campanha. Ela é a janela de produção, vem antes.", "erro"); }
      const cres = val("c-cres");
      const base = S.modal.campanha || {};
      const dados = { nome, ano: Number(val("c-ano")) || null, ini: ini || null, fim: fim || null,
        prepIni: pIni || null, prepFim: pFim || null,
        crescimento: cres === "" ? 0 : Number(String(cres).replace(",", ".")) || 0,
        obs: val("c-obs") || null };
      if (base.id) {
        const c = campanhaPorId(base.id);
        if (c) Object.assign(c, dados);
        S.modal = null;
        await gravarFestivas(`Campanha ${nome} alterada`);
        toast("Campanha salva.");
      } else {
        const nova = { id: uid(), ...dados, itens: [], arquivada: false,
          criadoEm: new Date().toISOString(), por: usuarioAtual()?.nome || null };
        S.festivas.campanhas = [...festCampanhas(), nova];
        S.modal = null;
        S.festivasView.campanha = nova.id;
        await gravarFestivas(`Campanha ${nome} criada`);
        toast("Campanha criada — agora vincule os produtos.");
      }
    }
    else if (act === "salvar-festbase") {
      const c = campanhaPorId(S.modal?.campanhaId);
      const it = itensDaCampanha(c).find((i) => i.sku === S.modal?.sku);
      if (!it) { S._solta?.(); return; }
      const cru = ($("#fb-mao")?.value || "").trim();
      it.baseManual = cru === "" ? null : Math.max(0, Number(cru.replace(",", ".")) || 0);
      S.modal = null;
      await gravarFestivas(`Base histórica de ${it.sku} atualizada`);
      toast("Base histórica salva.");
    }
    else if (act === "salvar-prestadora") {
      const p = S.modal.prest;
      let renomeou = false;
      $$("[data-pr]").forEach((el2) => { const k = el2.dataset.pr; p[k] = el2.type === "checkbox" ? el2.checked : el2.type === "number" ? (el2.value === "" ? null : Number(el2.value)) : (el2.value.trim() || null); });
      $$("[data-pr-chk]").forEach((el2) => { p[el2.dataset.prChk] = !!el2.checked; });
      const chips2 = $$("[data-prproc]");
      p.processos = chips2.filter((x) => x.checked && x.dataset.prauto !== "1").map((x) => x.dataset.prproc);
      p.procsExcluidos = chips2.filter((x) => !x.checked && x.dataset.prauto === "1").map((x) => x.dataset.prproc);
      if (!p.nome) return toast("Informe o nome.", "erro");
      /* os mínimos são da prestadora, mas moram no cadastro geral — colhidos aqui
         para não precisarem de uma segunda tela */
      let mexeuMin = false;
      $$("[data-minprest]").forEach((el2) => {
        definirMinPrestadora(S.modal.original || p.nome, el2.dataset.minprest, el2.value === "" ? 0 : Number(el2.value));
        mexeuMin = true;
      });
      if (S.modal.novo) S.cad.prestadoras.push(p);
      else {
        const idx = S.cad.prestadoras.findIndex((x) => x.nome === S.modal.original);
        if (idx >= 0) S.cad.prestadoras[idx] = p;
        if (S.modal.original !== p.nome) {
          /* v8.39 · o nome ANTERIOR fica guardado no próprio registro. Com ele,
             quem ainda aponta pelo nome velho continua resolvendo para a mesma
             prestadora — é isto que faz renomear deixar de ser migração de
             dados. A reescrita abaixo continua por enquanto, para a janela em
             que o histórico ainda não está carimbado; ela sai quando a grade
             de referências fechar com `sem_id = 0`. */
          if (typeof prestAnotarNomeAnterior === "function") prestAnotarNomeAnterior(p, S.modal.original);
          /* a prestadora É o nome no PCP inteiro: renomear precisa levar junto os
             pedidos, o material que está com ela, a produção em posse e os mínimos
             — senão o histórico dela fica órfão de um nome que não existe mais. */
          S.pedidos.forEach((r) => { if (r.prestadora === S.modal.original) r.prestadora = p.nome; });
          posseItens().forEach((x) => { if (x.prestadora === S.modal.original) x.prestadora = p.nome; });
          posses().forEach((x) => { if (x.prestadora === S.modal.original) x.prestadora = p.nome; });
          const tab = minsPrest();
          if (tab[S.modal.original]) { tab[p.nome] = tab[S.modal.original]; delete tab[S.modal.original]; }
          /* AS DUAS QUE FICAVAM PARA TRÁS (medido no levantamento da v8.38):
             as remessas de semiacabados e `procsPrestadora`. A remessa órfã
             sumia de `remessasDaPrestadora` e do fechamento dela. */
          (S.remessas || []).forEach((x) => { if (x.prestadora === S.modal.original) x.prestadora = p.nome; });
          const pp = S.cad.procsPrestadora;
          if (pp && pp[S.modal.original]) {
            pp[p.nome] = [...new Set([...(pp[p.nome] || []), ...pp[S.modal.original]])];
            delete pp[S.modal.original];
          }
          /* renomear toca três seções ao mesmo tempo (cadastro, pedidos e o que
             está em posse dela). Gravar uma por uma, com a do meio engolindo o
             erro, deixava o nome novo no cadastro e o antigo no histórico. */
          renomeou = true;
        } else if (mexeuMin) { /* nada a mover, os mínimos já foram gravados no cad */ }
      }
      S.modal = null;
      render();
      /* `semi` faltava nesta lista: mesmo quando as remessas eram reescritas,
         elas não eram GRAVADAS. */
      await salvarTudo(...(renomeou ? ["cad", "insumos", "nucleo", "semi"] : ["cad"]));
      toast("Prestadora salva.");
    }
    else return false;
    return true;
}

