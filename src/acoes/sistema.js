async function acoesSistema(act, t, e) {
    let el = t;
    if (act === "excluir-prestadora") {
      S.cad.prestadoras = S.cad.prestadoras.filter((x) => x.nome !== S.modal.original);
      S.modal = null; await salvarCad(); toast("Prestadora excluída.");
    }
    else if (act === "avisos-mais") { S.avisos.abrir = !S.avisos.abrir; render(); }
    /* ---------- mostrar/ocultar a senha ----------
       SEM `render()`, de propósito: a tela de entrada é escrita direto no
       `#app` e o que foi digitado mora no DOM, não em `S`. Um render aqui
       apagaria a senha na cara de quem clicou no olho. Isto é só a troca do
       `type` do campo e do ícone do botão — nada de autenticação passa aqui. */
    else if (act === "ver-senha") {
      const campo = document.getElementById(t.dataset.alvo || "sp-senha");
      if (!campo) return;
      const mostrando = campo.type === "text";
      campo.type = mostrando ? "password" : "text";
      t.setAttribute("aria-pressed", mostrando ? "false" : "true");
      const rotulo = mostrando ? "Mostrar a senha" : "Ocultar a senha";
      t.setAttribute("aria-label", rotulo); t.setAttribute("title", rotulo);
      t.innerHTML = svg(mostrando ? IC.olho : IC.olhoRiscado);
      try { campo.focus(); const n = campo.value.length; campo.setSelectionRange(n, n); } catch (e) {}
    }
    else if (act === "novo-setor") { S.modal = { tipo: "setor", setor: { id: uid(), processos: [] }, novo: true }; render(); }
    else if (act === "salvar-setor") {
      const st = S.modal.setor;
      $$("[data-st]").forEach((el2) => { st[el2.dataset.st] = el2.value.trim() || null; });
      /* vem das caixas marcadas: só gente que existe na equipe entra aqui */
      st.responsaveis = $$("[data-stresp]").filter((x) => x.checked).map((x) => x.dataset.stresp);
      delete st.responsaveisTxt;
      st.responsavel = st.responsaveis[0] || null;
      st.processos = $$("[data-stproc]").filter((x) => x.checked).map((x) => x.dataset.stproc);
      if (!st.nome) return toast("Informe o nome do setor.", "erro");
      if (!S.cad.setores) S.cad.setores = [];
      /* um processo pertence a um setor só: remove dos demais */
      for (const outro of S.cad.setores) if (outro.id !== st.id)
        outro.processos = (outro.processos || []).filter((p) => !st.processos.includes(p));
      const idx = S.cad.setores.findIndex((x) => x.id === st.id);
      if (idx >= 0) S.cad.setores[idx] = st; else S.cad.setores.push(st);
      S.modal = null; await salvarCad(); toast("Setor salvo.");
    }
    else if (act === "excluir-setor") {
      S.cad.setores = setores().filter((x) => x.id !== S.modal.setor.id);
      S.modal = null; await salvarCad(); toast("Setor excluído.");
    }
    else if (act === "nova-pessoa") { S.modal = { tipo: "pessoa", pessoa: { id: uid(), ativo: true, funcoes: [] }, novo: true }; render(); }
    else if (act === "salvar-pessoa") {
      if (ehAdm()) {
        const p0 = S.modal.pessoa;
        $$("[data-pe-chk]").forEach((el2) => { p0[el2.dataset.peChk] = !!el2.checked; });
        const caixas = $$("[data-pe-edit]");
        if (caixas.length) {
          /* grava a lista inteira, para "não marcado" ser uma decisão registrada e
             não a ausência de um campo — e some com a permissão antiga, que valia
             para tudo de uma vez */
          p0.edit = {};
          caixas.forEach((el2) => { p0.edit[el2.dataset.peEdit] = !!el2.checked; });
          delete p0.editarEstrutura;
        }
        /* As caixas de aba só existem na ficha de ACESSO. Na ficha da pessoa
           operacional não há nenhuma — e escrever `[]` ali apagaria a permissão
           de um acesso editado por engano. Só grava se as caixas existirem. */
        const caixasAba = $$("[data-pe-aba]");
        if (caixasAba.length) p0.abas = caixasAba.filter((x) => x.checked).map((x) => x.dataset.peAba);
      }
      const p = S.modal.pessoa;
      const ehAcessoAqui = S.modal.acesso === true || (typeof ehAcesso === "function" && ehAcesso(p));
      const nomeAntes = S.equipe.find((x) => x.id === p.id)?.nome || null;
      $$("[data-pe]").forEach((el2) => { const k = el2.dataset.pe; p[k] = el2.type === "checkbox" ? el2.checked : (el2.value.trim() || null); });
      /* Só a ficha da pessoa tem funções. Ler a lista vazia da ficha de acesso
         apagaria as funções de quem tem login E trabalha (a Ana, por exemplo). */
      const caixasFun = $$("[data-pefun]");
      if (caixasFun.length) p.funcoes = caixasFun.filter((x) => x.checked).map((x) => x.dataset.pefun);
      if (!p.nome) return toast("Informe o nome.", "erro");
      const idx = S.equipe.findIndex((x) => x.id === p.id);
      /* Uma CONTA de setor não mora em `S.equipe` — e não pode passar a morar,
         senão a conta vira gente, que é exatamente o que o modelo separou. */
      if (idx >= 0) S.equipe[idx] = p; else if (!ehAcessoAqui || !p.ehConta) S.equipe.push(p);
      /* v8.50 · com a escrita ligada, quem manda é `pcp_pessoa`. A recusa mais
         importante que ela traz: tirar o `adm` da ÚLTIMA administradora ativa
         não passa — e a pessoa vê o motivo em vez de descobrir depois. */
      if (typeof eqEscreveNaTabela === "function" && eqEscreveNaTabela()) {
        const rEq = await eqSalvarPessoa(p, idx < 0);
        /* Gravou, e o barulho veio de uma etapa posterior: a tela diz SALVO, e
           o aviso — se houver — é discreto e não destrutivo. */
        if (rEq && rEq.conferidoNoServidor) {
          S.modal = null;
          await salvarEquipe();
          /* UM feedback por ação. O aviso, quando existe, entra NA MESMA frase:
             duas mensagens para o mesmo clique é o começo do problema que esta
             correção veio resolver. */
          toast(rEq.aviso ? "Pessoa salva. (o servidor ainda reclamou de um passo seguinte: "
              + rEq.aviso + " — o dado está gravado)" : "Pessoa salva.");
          return;
        }
        if (rEq && rEq.status !== "ok" && rEq.status !== "desligado") {
          if (idx >= 0) S.equipe[idx] = S.equipe[idx]; else S.equipe.pop();
          render();
          /* `msg` faltava nesta lista, e é justamente onde o servidor escreve o
             motivo. Sem ela a frase caía em `rEq.status`, que é a palavra
             "erro" — a tela dizia "Não consegui salvar: erro" e engolia a
             explicação que estava ali do lado. */
          const porque = /ULTIMA_ADM/.test(String(rEq.texto || rEq.motivo || rEq.msg || ""))
            ? "isto deixaria o sistema sem nenhuma administradora ativa"
            : (rEq.motivo || rEq.texto || rEq.msg || rEq.status);
          return toast("Não consegui salvar: " + porque, "erro");
        }
      }
      /* nome mudou: leva junto setores, pedidos, tarefas e responsáveis padrão.
         Vale só para PESSOA — o nome de uma conta de setor não é responsável de
         nada, e reescrever setores por causa dele seria mexer no roteamento. */
      const alcance = !p.ehConta && nomeAntes && nomeAntes !== p.nome ? renomearPessoa(nomeAntes, p.nome) : 0;
      S.modal = null;
      /* a conta vive na lista das contas, não em `S.equipe`; a tela lê de lá */
      if (p.ehConta && typeof eqAtualizarConta === "function") eqAtualizarConta(p);
      await salvarEquipe();
      if (alcance) await salvarTudo("cad", "nucleo", "cfg");
      toast(alcance ? `Pessoa salva · ${nomeAntes} virou ${p.nome} em ${n0(alcance)} ${alcance === 1 ? "lugar" : "lugares"} (setores, pedidos e padrões).` : "Pessoa salva.");
    }
    else if (act === "excluir-pessoa") {
      const nomeEx = S.modal.pessoa.nome;
      /* com a escrita ligada, excluir vira DESATIVAR: a pessoa é referenciada
         por nome em vinte lugares (pedidos, movimentos, remessas, trilha), e
         apagar a linha deixaria esse passado sem dono. */
      if (typeof eqEscreveNaTabela === "function" && eqEscreveNaTabela()) {
        const alvo = Object.assign({}, S.modal.pessoa, { ativo: false });
        const rEq = await eqSalvarPessoa(alvo, false);
        if (rEq && rEq.status !== "ok" && rEq.status !== "desligado") {
          return toast("Não consegui remover: "
            + (/ULTIMA_ADM/.test(String(rEq.texto || rEq.motivo || ""))
               ? "isto deixaria o sistema sem nenhuma administradora ativa"
               : (rEq.motivo || rEq.texto || rEq.status)), "erro");
        }
        const i2 = S.equipe.findIndex((x) => x.id === alvo.id);
        if (i2 >= 0) S.equipe[i2] = alvo;
        S.modal = null; render();
        return toast(`${nomeEx} foi desativada — o histórico dela continua com nome.`);
      }
      S.equipe = S.equipe.filter((x) => x.id !== S.modal.pessoa.id);
      /* limpa dos setores para não voltar como sugestão nem como responsável automático */
      for (const st of setores()) {
        st.responsaveis = respDoSetor(st).filter((n) => n !== nomeEx);
        st.responsavel = st.responsaveis[0] || null;
      }
      const vivosDela = S.pedidos.filter((r) => PED_VIVO.includes(r.status) && r.responsavel === nomeEx).length;
      await salvarEquipe(); await salvarCad();
      if (vivosDela) {
        S.modal = { tipo: "reatribuir", de: nomeEx };
        toast(`${nomeEx} excluída. Ela ainda tinha ${vivosDela} ${vivosDela === 1 ? "pedido vivo" : "pedidos vivos"} — reatribua abaixo.`);
        render();
      } else {
        S.modal = null;
        toast(`${nomeEx} excluída — removida também dos setores.`);
      }
    }
    else if (act === "mais-dem") { S.demanda.limite += 120; render(); }
    else if (act === "mais-ped") { S.pedView.limite += 120; render(); }
    else if (act === "mais-hist") { S.historico.limite += 120; render(); }
    else if (act === "mais-produtos") { S.produtosView.limite += 120; render(); }
    else if (act === "pick-seed") escolherArquivo(".json", importarSeed);
    else if (act === "pick-xlsm") escolherArquivo(".xlsm,.xlsx", importarXlsm);
    else if (act === "pick-csv") escolherArquivo(".csv,.txt", importarCsv);
    else if (act === "pick-vinculo") escolherArquivo(".csv,.txt,.xlsx,.xls,.xlsm", (f) => importarVinculo(f, "produtos"));
    else if (act === "pick-fotos") escolherArquivo(".csv,.txt,.xlsx,.xls,.xlsm", (f) => importarVinculo(f, "fotos"));
    else if (act === "pick-catalogo") escolherArquivo(".csv,.txt,.xlsx,.xls,.xlsm", (f) => importarVinculo(f, "catalogo"));
    else if (act === "exp-hist") await exportarHistorico();
    else if (act === "exp-demanda") await exportarDemanda();
    else if (act === "exp-compras") await exportarCompras();
    else if (act === "backup") baixarBackup();
    else if (act === "ver-gravacao") { S.modal = { tipo: "gravacao" }; render(); }
    else if (act === "ver-remocoes-retidas") {
      S.modal = { tipo: "remocoesRetidas",
        itens: typeof cadRemocoesRetidas === "function" ? cadRemocoesRetidas() : [] };
      render();
    }
    else if (act === "limpar-remocoes-retidas") {
      /* limpa o AVISO, não a tabela: o cadastro nunca foi removido. */
      if (typeof cadRetidasLimpar === "function") cadRetidasLimpar();
      toast("Aviso limpo. Nenhum cadastro foi removido — eles continuam no servidor.");
      render();
    }
    else if (act === "tentar-sincronizar") {
      /* Re-sonda antes de tentar: se o app caiu para o navegador, insistir sem
         reconferir só grava de novo no mesmo lugar e o botão parece quebrado. */
      if (secoesSoLocais().length || CAMADA !== "supabase") { try { await sondarCamada(); } catch {} }
      if (secoesSoLocais().length) { for (const s of secoesSoLocais()) _pendentes.add(s); }
      /* se nada estava pendente, força um ciclo completo: quem clica aqui
         quer a certeza de que está tudo no servidor, não uma fila vazia */
      const secs = _pendentes.size ? [..._pendentes] : ["nucleo", "produtos", "estoque", "cad", "cfg", "equipe", "festivas"];
      if (S.modal?.tipo === "gravacao") render();
      await salvarTudo(...secs);
      if (S.modal?.tipo === "gravacao") render();
      toast(SALVO.ok ? "Sincronizado." : "Ainda não deu — baixe um backup para não perder o trabalho.", SALVO.ok ? "" : "erro");
    }
    else if (act === "zerar-teste") {
      if (!MODO_TESTE) return;
      if (!confirm("Jogar fora tudo o que você mexeu nesta cópia de teste e carregar de novo os dados de verdade do servidor?\n\nO app das meninas não é tocado.")) return;
      try {
        const chaves = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(NS + ":") && k !== NS + ":supa") chaves.push(k);
        }
        chaves.forEach((k) => { try { localStorage.removeItem(k); } catch {} });
      } catch {}
      location.reload();
    }
    else if (act === "limpeza") {
      S.modal = { tipo: "limpeza", alvo: "pedidos", fl: {} };
      render();
      /* quem gravou por último: se não fui eu e foi há pouco, tem gente com o app aberto */
      try {
        const car = await carimboAtual();
        if (car && car.sessao !== SESSAO_APP && Date.now() - new Date(car.em).getTime() < 20 * 60000) {
          if (S.modal?.tipo === "limpeza") { S.modal.outraSessao = car; render(); }
        }
      } catch {}
    }
    else if (act === "confirmar-limpeza") {
      /* Recalcula a MESMA lista que a tela mostrou. Guardar a lista da prévia seria
         mais rápido, mas se algo mudasse no meio o app apagaria coisa diferente do
         que a pessoa viu — e aqui não há desfazer. */
      const { alvo, fl } = S.modal;
      const antes = { ped: S.pedidos.length, prod: S.produtos.length };
      let n = 0;
      if (alvo === "pedidos") {
        let alvos = S.pedidos.slice();
        if (fl.origem === "app") alvos = alvos.filter((x) => x.criadoNoApp);
        else if (fl.origem === "planilha") alvos = alvos.filter((x) => !x.criadoNoApp);
        else if (fl.origem === "forauda") alvos = alvos.filter((x) => foraDaPlanilha(x));
        else if (fl.origem === "numdif") alvos = alvos.filter((x) => numeroComOutroSku(x));
        if (fl.procs?.length) alvos = alvos.filter((x) => fl.procs.includes(String(x.processo || "").toUpperCase()));
        if (fl.etapas?.length) alvos = alvos.filter((x) => fl.etapas.includes(x.status));
        if (fl.prest) alvos = alvos.filter((x) => (x.prestadora || "—") === fl.prest);
        if (fl.antesDe) alvos = alvos.filter((x) => String(x.criadoEm || "") < fl.antesDe);
        alvos = alvos.filter((r) => !(r.status === "retornada" && mesFechado(competenciaDe(r))));
        const ids = new Set(alvos.map((x) => x.id));
        S.pedidos = S.pedidos.filter((x) => !ids.has(x.id));
        n = ids.size;
        /* D · se a limpeza esvaziou a lista, quem esvaziou foi a pessoa, aqui,
           de propósito. A sentinela precisa ouvir isso em voz alta — senão ela
           barra a gravação achando que a lista sumiu sozinha. */
        if (!S.pedidos.length && typeof nucleoAutorizarListaVazia === "function")
          nucleoAutorizarListaVazia("limpeza em lote de pedidos (" + n + ")");
        S.ops.forEach(recalcularOP);
        /* v8.74 · P7 · DECLARAÇÃO · a limpeza em lote é pedido da pessoa */
        if (typeof demDeclararRemocao === "function") {
          demDeclararRemocao(S.ops.filter((o) => !(o.qtdProgramada > 0 || o.qtdProduzida > 0
            || o.qtdNecessaria > 0)).map((o) => o.id), "limpeza em lote de pedidos");
        }
        S.ops = S.ops.filter((o) => o.qtdProgramada > 0 || o.qtdProduzida > 0 || o.qtdNecessaria > 0);
      }
      else if (alvo === "produtos") {
        let alvos = S.produtos.slice();
        if (fl.procs?.length) alvos = alvos.filter((p) => fl.procs.includes(String(p.processo || "").toUpperCase()));
        if (fl.semProc) alvos = alvos.filter((p) => !p.processo);
        if (fl.semUso) alvos = alvos.filter((p) => !S.pedidos.some((x) => (opPorId(x.opId)?.sku || x.sku) === p.sku));
        if (fl.semFoto) alvos = alvos.filter((p) => !p.foto);
        alvos = alvos.filter((p) => !S.pedidos.some((x) => PED_VIVO.includes(x.status) && (opPorId(x.opId)?.sku || x.sku) === p.sku));
        const ids = new Set(alvos.map((p) => p.id));
        const skus = new Set(alvos.map((p) => p.sku));
        S.produtos = S.produtos.filter((p) => !ids.has(p.id));
        /* v8.74 · P7 · DECLARAÇÃO · limpeza em lote de produtos */
        if (typeof demDeclararRemocao === "function") {
          demDeclararRemocao(S.ops.filter((o) => skus.has(o.sku)).map((o) => o.id),
            "limpeza em lote de produtos");
        }
        S.ops = S.ops.filter((o) => !skus.has(o.sku));
        n = ids.size;
      }
      else if (alvo === "estoque") { n = S.estoque?.itens?.length || 0; S.estoque = null; }
      else if (alvo === "estruturas") {
        const antesN = (S.cad.estruturas || []).length;
        S.cad.estruturas = (S.cad.estruturas || []).filter((e) => fl.procs?.length && !fl.procs.includes(String(e.processo).toUpperCase()));
        if (!fl.procs?.length) S.cad.estruturas = [];
        n = antesN - S.cad.estruturas.length;
      }
      else if (alvo === "prestadoras") {
        const antesN = (S.cad.prestadoras || []).length;
        S.cad.prestadoras = fl.soInativas ? S.cad.prestadoras.filter((p) => p.ativo !== false) : [];
        n = antesN - S.cad.prestadoras.length;
      }
      else if (alvo === "equipe") {
        const antesN = S.equipe.length;
        S.equipe = fl.soInativas ? S.equipe.filter((p) => p.ativo !== false) : [];
        n = antesN - S.equipe.length;
        if (!S.equipe.length) { S.cad.setores = JSON.parse(JSON.stringify(SETORES_PADRAO)); S.cfg.padroes = {}; }
      }
      else if (alvo === "compras") {
        const antesN = S.faltas.length;
        S.faltas = fl.soRecebidas ? S.faltas.filter((f) => f.status !== "recebida") : [];
        n = antesN - S.faltas.length;
      }
      else if (alvo === "fechamentos") { n = (S.cad.mesesFechados || []).length; S.cad.mesesFechados = []; S.cad.historicoFechamentos = []; }
      else if (alvo === "tudo") {
        if (String(fl.palavra || "").trim().toUpperCase() !== "APAGAR") { S._solta?.(); return toast("Escreva APAGAR para confirmar.", "erro"); }
        n = S.pedidos.length + S.produtos.length + (S.estoque?.itens?.length || 0);
        /* a sincronia recarregaria o servidor no meio da limpeza e desfaria parte dela */
        try { clearInterval(_sincTimer); _sincTimer = null; } catch {}
        const chaves = [...Object.values(DOCS), NS + ":carimbo", NS + ":resto0", NS + ":resto1"];
        let i = 0;
        for (const k of chaves) { i++; S._passo?.(`Apagando ${i}/${chaves.length}…`); try { await apagarDoc(k); } catch {} }
        S._passo?.("Limpando registros antigos…");
        for (const k of KEYS_LEGADO) { try { await del(k); } catch {} }
        /* v8.74 · P7 · DECLARAÇÃO · a pessoa digitou APAGAR para chegar aqui */
        if (typeof demDeclararRemocao === "function") {
          demDeclararRemocao((S.ops || []).map((o) => o.id), "base zerada pela pessoa");
        }
        S.produtos = []; S.ops = []; S.pedidos = []; S.analises = []; S.eventos = [];
        S.equipe = []; S.estoque = null; S.faltas = [];
        /* D · zerar a base é esvaziar de propósito, e a pessoa digitou APAGAR
           para chegar aqui. A sentinela precisa ser avisada. */
        if (typeof nucleoAutorizarListaVazia === "function")
          nucleoAutorizarListaVazia("zerar a base inteira (APAGAR confirmado)");
        S.festivas = { campanhas: [] }; S.festivasView.campanha = null;
        S.cad = { prestadoras: [], estruturas: [], setores: JSON.parse(JSON.stringify(SETORES_PADRAO)),
          bonus: JSON.parse(JSON.stringify(BONUS_PADRAO)), mesesFechados: [], historicoFechamentos: [] };
        S.cfg = { ...CFG_PADRAO, padroes: {} };
        S.aba = "dados";
        S._passo?.("Gravando base vazia…");
        try { localStorage.setItem("pcp:aba", "dados"); } catch {}
        try { localStorage.setItem("pcp:zerado", JSON.stringify({ n, em: Date.now() })); } catch {}
        await salvarTudo("nucleo", "produtos", "estoque", "cad", "cfg", "equipe");
        S._passo?.("Pronto — recarregando…");
        return window.location.reload();   /* garante que nada sobrou na memória */
      }

      S.sel.clear(); S.selProd = new Set(); S.drawer = null; S.modal = null; S.calc = null;
      await salvarTudo("nucleo", "produtos", "estoque", "cad", "cfg", "equipe");
      render();
      const sobra = alvo === "pedidos" ? ` · ${n0(S.pedidos.length)} pedidos continuam`
        : alvo === "produtos" ? ` · ${n0(S.produtos.length)} produtos continuam` : "";
      S._solta?.();
      toast(`${n0(n)} ${n === 1 ? "registro apagado" : "registros apagados"}${sobra}.`);
    }
    else return false;
    return true;
}


