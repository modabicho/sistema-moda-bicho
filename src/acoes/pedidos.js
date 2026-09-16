async function acoesPedidos(act, t, e) {
    let el = t;
    if (act === "busca-rapida") { abrirBuscaRapida(); }
    else if (act === "menu-conta") { S.menuConta = !S.menuConta; render(); }
    /* a folha do "Mais" é navegação, não formulário: abre, escolhe, fecha.
       Ela não guarda estado nenhum além de estar aberta. */
    else if (act === "menu-mais") { S.menuMais = !S.menuMais; render(); }
    else if (act === "fechar-mais") { S.menuMais = false; render(); }
    /* TEMA · gira auto → claro → escuro → auto. Preferência desta máquina, e
       aplicada no atributo da raiz — sem `render()`, porque trocar o tema não
       muda dado nenhum: muda só de onde as cores vêm. */
    else if (act === "girar-tema") {
      const ordem = ["auto", "claro", "escuro"];
      const prox = ordem[(ordem.indexOf(temaEscolhido()) + 1) % ordem.length];
      temaGravar(prox);
      const b3 = document.querySelector('[data-act="girar-tema"]');
      if (b3) {
        b3.setAttribute("title", TEMA_TITULO[prox]);
        b3.setAttribute("aria-label", TEMA_TITULO[prox]);
        b3.innerHTML = svg(TEMA_ICONE[prox]);
      }
      if (typeof toast === "function") toast(TEMA_AVISO[prox]);
    }
    else if (act === "ped-filtros") { S.pedView.filtrosAbertos = !S.pedView.filtrosAbertos; render(); }
    else if (act === "dem-filtros") { S.demanda.filtrosAbertos = !S.demanda.filtrosAbertos; render(); }
    else if (act === "regmeses-nova") { S.cfg.regrasMeses = [...regrasMeses(), { processo: "", A: "", B: "", C: "" }]; await salvarCfg(); render(); }
    else if (act === "revisar-min") { S.modal = { tipo: "revisarMin", sku: null, pulados: [] }; render(); }
    else if (act === "min-despular") { if (S.modal) { S.modal.pulados = []; S.modal.sku = null; } render(); }
    else if (act === "exportar-minimos") { exportarMinimos(); }
    else if (act === "csv-minimos") { baixarCsvMinimos(); }
    else if (act === "csv-minimos-denovo") { baixarCsvMinimos(true); }
    else if (act === "min-nao-enviados") {
      /* a importação lá falhou: eles voltam para a fila de trabalho. Tirar o
         carimbo é o oposto de apagar — é dizer a verdade sobre onde a coisa está. */
      const jaFoi = S.calc?.minEnviados || [];
      if (!jaFoi.length) return;
      for (const l of jaFoi) { const prod = produtoDe(l.sku); if (prod?.minAjuste) delete prod.minAjuste.exportadoEm; }
      S.calc = null;
      await salvarTudo("produtos");
      render();
      toast(`${n0(jaFoi.length)} ${jaFoi.length === 1 ? "mínimo voltou" : "mínimos voltaram"} para a lista de a enviar.`);
    }
    else if (act === "limpar-sel") { S.sel.clear(); render(); }
    else if (act === "criar-pedidos-sel") abrirCriarPedidos([...S.sel]);
    else if (act === "confirmar-pedidos") await confirmarPedidos();
    else if (act === "separar-sel") {
      const ids = [...S.sel].filter((id) => S.calc.fila.some((o) => o.id === id));
      if (!ids.length) return toast("Selecione pedidos que estejam na fila.", "erro");
      const agora = iso(hoje());
      for (const id of ids) { const r = pedidoPorId(id); if (r && r.status === "aberto") { r.status = "separando"; r.separadaEm = r.separadaEm || agora; if (padraoResp("enviar")) r.responsavel = padraoResp("enviar"); recalcularOP(opPorId(r.opId)); } }
      S.sel.clear(); await salvarPedidos(); toast(`${ids.length} pedidos em separação.`);
    }
    else if (act === "previa-analise") {
      const p = previaAnalise();
      if (!p) return toast("Sem estoque carregado — importe o CSV ou a planilha na aba Dados antes de analisar.", "erro");
      S.modal = { tipo: "previa", previa: p }; render();
    }
    else if (act === "diagnostico") {
      const linhas = [];
      const ponto = (nome, fn) => { try { const r = fn(); linhas.push("[ok] " + nome + (r != null ? ": " + r : "")); }
        catch (e2) { linhas.push("[erro] " + nome + ": " + (e2.message || e2)); } };
      linhas.push("versão " + VERSAO + " · " + new Date().toLocaleString("pt-BR"));
      linhas.push("gravação: " + (CAMADA_NOME[CAMADA] || CAMADA) + (SALVO.quando ? " · último salvar " + SALVO.quando.toLocaleTimeString("pt-BR") + (SALVO.ok ? " ok" : " FALHOU") : " · nunca salvou"));
      linhas.push("base: " + S.produtos.length + " produtos · " + S.pedidos.length + " pedidos · " + S.ops.length + " necessidades · estoque " + (S.estoque ? S.estoque.itens.length + " SKUs" : "AUSENTE"));
      /* de onde veio o próximo número — a pergunta "por que pulou de 2080 para
         2183" se responde aqui, sem precisar caçar na tela */
      (() => {
        const comNum = S.pedidos.map((r2) => ({ r: r2, n: +(String(r2.numero || "").match(/^(\d+)/) || [])[1] || 0 }))
          .filter((x) => x.n > 0).sort((a, b2) => b2.n - a.n);
        if (S.falhaPonto) linhas.push("[ERRO] ponto de restauração falhou em " + fdataHora(S.falhaPonto.em) + ": " + S.falhaPonto.erro);
      linhas.push("numeração: próximo = " + proximoNumeroPedido()
        + (typeof numeroTemContadorOficial === "function" && numeroTemContadorOficial()
          ? " (contador do servidor · pcp_ciclo.proximo_numero)"
          : " (SEM contador do servidor: maior número em uso + 1, contando cancelados e produzidos)"));
      linhas.push("  marca d'água local (só vale sem contador): " + (Number(S.cfg && S.cfg.maiorNumeroUsado) || 0));
        const vivos = comNum.filter((x) => PED_VIVO.includes(x.r.status));
        if (vivos.length) linhas.push("  maior número entre os pedidos vivos: " + vivos[0].n + " (" + (vivos[0].r.numero) + ")");
        linhas.push("  10 maiores números em uso:");
        comNum.slice(0, 10).forEach((x) => {
          const r2 = x.r;
          linhas.push("   " + String(r2.numero).padEnd(9) + " " + String(P_LABEL[r2.status] || r2.status).padEnd(22)
            + (r2.criadoNoApp ? "criado no app" : "importado/migrado")
            + (r2.criadoEm ? " · " + String(r2.criadoEm).slice(0, 10) : "")
            + (r2.prestadora ? " · " + r2.prestadora : ""));
        });
        const fora = comNum.filter((x) => !PED_VIVO.includes(x.r.status) && x.r.status !== "retornada").length;
        if (fora) linhas.push("  " + fora + " pedidos cancelados continuam segurando número (aparecem no chip Cancelados)");
      })();
      ponto("calcular()", () => { const c = calcular(); return c ? c.linhas.length + " linhas, fila " + c.fila.length : "nulo (sem estoque)"; });
      ponto("previaAnalise()", () => { const p2 = previaAnalise(); return p2 ? p2.novas.length + " novas, " + p2.pedidosPromoviveis.length + " promovíveis" : "nulo"; });
      ponto("modal da prévia", () => { const g = S.modal; S.modal = { tipo: "previa", previa: previaAnalise() }; const n = renderModal().length; S.modal = g; return n + " chars"; });
      ponto("modal criar pedidos", () => { const l = (S.calc?.linhas || []).find((x) => x.saldoSemPedido > 0); if (!l) return "sem saldo p/ testar";
        const g = S.modal; S.modal = { tipo: "criarPedidos", grupos: [{ sku: l.sku, descricao: l.descricao, processo: l.processo, qtdPacote: l.qtdPacote, saldo: l.saldoSemPedido, abertos: l.pedidosAbertos, adesivo: ehAdesivo(l.processo), setor: setorDe(l.processo), recomendadas: [], linhas: [{ qtd: l.saldoSemPedido, prioridade: 3, prestadora: "", mix: 0 }] }], reprios: {} }; const n = renderModal().length; S.modal = g; return n + " chars"; });
      S.modal = { tipo: "diagnostico", linhas };
      render();
    }
    else if (act === "confirmar-analise") {
      const div = $("#mod-blocos")?.checked ?? S.cfg.dividirBlocos;
      S.cfg.dividirBlocos = div; await salvarCfg();
      /* v8.76 · a caixa "Recalcular a prioridade desses pedidos" saiu: pedido
         vivo sem trava manual é sempre recalculado. Ver `aplicarAnalise`. */
      await aplicarAnalise(div);
    }
    else if (act === "reatribuir") { S.modal = { tipo: "reatribuir", de: S.modal?.de || "" }; render(); }
    else if (act === "aplicar-reatribuir") {
      const de = $("#re-de")?.value;
      const para = ($("#re-para")?.value || "").trim();  /* vazio = deixar livre */
      if (!de) return toast("Escolha quem sai.", "erro");
      if (de === para) return toast("A pessoa é a mesma — nada a fazer.");
      let nPed = 0, nSet = 0, nPad = 0;
      for (const r of S.pedidos) {
        if (!PED_VIVO.includes(r.status) || r.responsavel !== de) continue;
        registrar(r.opId, `pedido ${r.numero} reatribuído`, { responsavel: r.responsavel }, { responsavel: para || null });
        r.responsavel = para || null; nPed++;
      }
      for (const st of setores()) {
        const lista = respDoSetor(st);
        if (!lista.includes(de)) continue;
        /* sem substituto o nome só sai; com substituto ele assume o lugar, sem duplicar */
        let nova = para ? lista.map((x) => (x === de ? para : x)) : lista.filter((x) => x !== de);
        nova = [...new Set(nova)];
        st.responsaveis = nova;
        st.responsavel = nova[0] || null;
        nSet++;
      }
      S.cfg.padroes = S.cfg.padroes || {};
      for (const [fid] of FUNCOES) {
        const lista = padraoLista(fid);
        if (!lista.includes(de)) continue;
        let nova = para ? lista.map((x) => (x === de ? para : x)) : lista.filter((x) => x !== de);
        S.cfg.padroes[fid] = [...new Set(nova)];
        nPad++;
      }
      if (S.tarefas?.quem === de) S.tarefas.quem = para || "";
      S.modal = null;
      await salvarTudo("nucleo", "cad", "cfg");
      render();
      const partes = [nPed ? `${n0(nPed)} ${nPed === 1 ? "pedido" : "pedidos"}` : null,
        nSet ? `${n0(nSet)} ${nSet === 1 ? "setor" : "setores"}` : null,
        nPad ? `${n0(nPad)} ${nPad === 1 ? "padrão" : "padrões"}` : null].filter(Boolean);
      toast(partes.length
        ? `${de} → ${para || "ninguém"} · ${partes.join(" · ")}.`
        : `${de} não aparecia em lugar nenhum.`);
    }
    else if (act === "entrar-supa") {
      const email = ($("#sp-email")?.value || "").trim();
      const senha = $("#sp-senha")?.value || "";
      if (!email || !senha) return toast("Preencha e-mail e senha.", "erro");
      S.supaEntrando = true; render();
      try {
        await supaEntrar(email, senha);
        marcarSaida(false); /* entrar com e-mail e senha é entrada deliberada: desfaz o "saí à mão" */
        /* Segundo fator, quando for o caso. A decisão é tomada AQUI, com a
           sessão recém-criada na mão, e não no `render()`: assim o app não
           chega a montar antes de saber se pode. Falha aberto de propósito —
           ver o comentário no `mfa.js`. */
        /* A conferência do portão é a MESMA da abertura — uma função só, um
           caminho só. Antes havia duas: uma para depois da senha e outra para
           o boot, e foi exatamente essa duplicidade que deixou o navegador
           normal entrar direto com sessão guardada. */
        let estado = "livre";
        try { estado = await mfaConferirAbertura(); } catch { estado = "livre"; }
        toast(estado === "livre" ? "Conectada ao servidor da empresa." : "Senha conferida. Falta confirmar sua identidade.");
        location.reload(); /* reabre já gravando no servidor */
      } catch (e) {
        S.supaEntrando = false; render();
        toast("Não entrou: " + String(e.message || e).slice(0, 90), "erro");
      }
    }
    else if (act === "vincular-adm") {
      const emailSupa = String(supaSessao()?.email || "").trim().toLowerCase();
      const dona = S.equipe.find((p) => p.adm && p.ativo !== false && !String(p.email || "").trim());
      if (!emailSupa || !dona) return toast("Não há administradora sem e-mail para vincular.", "erro");
      if (dona.pinHash) {
        const pin = prompt(`Confirme com o PIN da administradora ${dona.nome}:`) || "";
        if (hashPin(pin.trim()) !== dona.pinHash) return toast("PIN errado.", "erro");
      } else if (!confirm(`Vincular a conta ${emailSupa} como a administradora ${dona.nome}? Confirme apenas se esta conta é SUA.`)) return;
      dona.email = emailSupa;
      S.sessao = { pessoaId: dona.id, email: emailSupa, em: new Date().toISOString() };
      gravarSessao(S.sessao); marcarSaida(false);
      await salvarEquipe();
      registrar(null, `conta ${emailSupa} vinculada à administradora ${dona.nome}`, null, null);
      render();
      toast(`Bem-vinda, ${dona.nome} — conta vinculada. Agora confira o e-mail de cada pessoa na Equipe.`);
    }
    else if (act === "ver-presenca") { await lerPresenca(); S.modal = { tipo: "presenca" }; render(); }
    else if (act === "testar-servidor") {
      toast("Testando o servidor…");
      const d = await supaDiagnostico();
      toast(d.msg, d.ok ? undefined : "erro");
    }
    else if (act === "sair-supa") {
      /* Sair apaga tudo o que diz respeito a ENTRAR — sessão do servidor,
         autorização desta abertura, lembrete de papel, cadastro em andamento,
         autenticador escolhido. E nada do que diz respeito ao TRABALHO:
         documentos, cache e configuração ficam onde estão. */
      supaGravarSessao(null); gravarSessao(null);
      if (typeof mfaEsquecerTudo === "function") mfaEsquecerTudo();
      location.reload();
    }
    else if (act === "mfa-tentar-de-novo") {
      S.mfaEnviando = true; render();
      try { await mfaConferirAbertura(); } catch {}
      S.mfaEnviando = false; render();
    }
    /* ---------- cadastro do autenticador (etapa 3) ---------- */
    else if (act === "mfa-cad-comecar") {
      const nome = ($("#mfa-nome")?.value || "").trim() || mfaNomeSugerido();
      S.mfaEnviando = true; S.mfaErro = null; S.mfaCad = { nome }; render();
      try {
        /* Antes de criar um, apaga os que ficaram pelo caminho. É aqui, e só
           aqui, que dá para saber que um fator `unverified` foi abandonado. */
        const lixo = await mfaLimparNaoVerificados();
        const f = await mfaCadastrar(nome);
        /* Segredo e QR ficam em memória, e só enquanto isto está em andamento. */
        S.mfaCad = { etapa: "qr", nome, id: f.id,
          qr: f.totp?.qr_code || "", segredo: f.totp?.secret || "", uri: f.totp?.uri || "" };
        S.mfaEnviando = false; render();
        if (lixo) toast(lixo === 1 ? "Um cadastro que ficou pela metade foi descartado."
          : `${lixo} cadastros que ficaram pela metade foram descartados.`);
      } catch (e) { S.mfaEnviando = false; S.mfaCad = { nome }; S.mfaErro = mfaRecado(e); render(); }
    }
    else if (act === "mfa-cad-confirmar") {
      const cad = S.mfaCad;
      if (!cad?.id) return;
      const campo = $("#mfa-codigo");
      const codigo = String(campo?.value || "").replace(/\D/g, "");
      if (campo) campo.value = "";      /* o código não volta para lugar nenhum */
      if (codigo.length !== 6) { S.mfaErro = "O código tem seis números. Confira no aplicativo e digite de novo."; return render(); }
      S.mfaEnviando = true; S.mfaErro = null; render();
      try {
        const d = await mfaDesafiar(cad.id);
        await mfaConferir(cad.id, d.id, codigo);
        /* A mesma regra da etapa 2, e pelo mesmo motivo: 200 não é prova. Só o
           token em aal2 diz que o fator foi aceito de verdade. */
        if (mfaNivelDaSessao() !== "aal2") {
          S.mfaEnviando = false;
          S.mfaErro = "Não foi possível confirmar sua identidade. Gere um novo código e tente novamente.";
          return render();
        }
        mfaRegistrarFator({ id: cad.id, nome: cad.nome });
        mfaLiberar();   /* cadastrar E confirmar o código vale como confirmação desta abertura */
        /* O segredo e o QR morrem AQUI. Não servem mais para nada e não têm por
           que continuar existindo nem na memória. */
        S.mfaCad = { etapa: "feito" };
        S.mfaEnviando = false; render();
        toast(`Identidade confirmada. “${cad.nome}” cadastrado.`);
      } catch (e) {
        /* Código errado: o fator continua `unverified` no servidor e NÃO conta
           como cadastrado. Ela tenta de novo com o mesmo QR. */
        S.mfaEnviando = false; S.mfaErro = mfaRecado(e); render();
      }
    }
    else if (act === "mfa-cad-cancelar") {
      const cad = S.mfaCad;
      S.mfaEnviando = true; render();
      /* Desistir apaga o fator inacabado na hora, em vez de deixar para a
         próxima tentativa limpar. */
      if (cad?.id) { try { await mfaDescadastrar(cad.id); } catch {} }
      S.mfaCad = mfaFatoresDoPortao().length ? { etapa: "feito" } : null;
      S.mfaEnviando = false; S.mfaErro = null; render();
    }
    else if (act === "mfa-cad-segundo") { S.mfaCad = { nome: mfaNomeSugerido() }; S.mfaErro = null; render(); }
    else if (act === "mfa-entrar-agora") { mfaLiberar(); S.mfaCad = null; render(); }
    /* ---------- segundo fator ---------- */
    else if (act === "mfa-fator") {
      S.mfa = { fator: el.dataset.id }; S.mfaErro = null; render();
      try { await mfaPedirDesafio(el.dataset.id); } catch (e) { S.mfaErro = mfaRecado(e); render(); }
    }
    else if (act === "mfa-novo-desafio") {
      const f = mfaEscolhido(); if (!f) return;
      S.mfaEnviando = true; S.mfaErro = null; render();
      try { await mfaPedirDesafio(f.id); S.mfaEnviando = false; render();
        toast("Pronto. Digite o código que está no aplicativo agora."); }
      catch (e) { S.mfaEnviando = false; S.mfaErro = mfaRecado(e); render(); }
    }
    else if (act === "mfa-conferir") {
      const f = mfaEscolhido(); if (!f) return;
      const campo = $("#mfa-codigo");
      const codigo = String(campo?.value || "").replace(/\D/g, "");
      /* O código sai do campo e não volta para lugar nenhum: nem estado, nem
         storage, nem log. Limpar antes da chamada é o que garante isso mesmo
         se a chamada demorar ou estourar. */
      if (campo) campo.value = "";
      if (codigo.length !== 6) { S.mfaErro = "O código tem seis números. Confira no aplicativo e digite de novo."; return render(); }
      S.mfaEnviando = true; S.mfaErro = null; render();
      try {
        /* Sem desafio vivo (primeira tentativa, ou o anterior venceu), pede um
           agora. É o mesmo caminho para os dois casos, então não há um "estado
           de desafio expirado" que precise de tratamento próprio. */
        if (!S.mfa?.desafio || S.mfa.fator !== f.id || (S.mfa.expira && Date.now() > S.mfa.expira)) {
          await mfaPedirDesafio(f.id);
        }
        await mfaConferir(f.id, S.mfa.desafio, codigo);
        /* A regra que não se negocia: se o token que voltou NÃO está em aal2, a
           entrada não é liberada. O servidor pode ter respondido 200 e mesmo
           assim não ter subido o nível — e nesse caso quem confiasse no 200
           deixaria entrar uma sessão que o banco vai recusar em tudo. */
        if (mfaNivelDaSessao() !== "aal2") {
          S.mfa = null; S.mfaEnviando = false;
          S.mfaErro = "Não foi possível confirmar sua identidade. Gere um novo código e tente novamente.";
          return render();
        }
        mfaLiberar();
        location.reload();
      } catch (e) {
        /* Código errado NÃO derruba a sessão: ela continua servindo, só não
           subiu de nível. Derrubar faria a pessoa digitar a senha de novo por
           causa de um dígito trocado. */
        S.mfa = S.mfa ? { ...S.mfa, desafio: null } : null;
        S.mfaEnviando = false; S.mfaErro = mfaRecado(e); render();
      }
    }
    else if (act === "entrar") {
      const p = S.equipe.find((x) => x.id === $("#lg-quem")?.value);
      const pin = ($("#lg-pin")?.value || "").trim();
      if (!p) return toast("Escolha quem está entrando.", "erro");
      /* PIN em branco NÃO entra. Antes, quem ainda não tinha PIN era acessível a
         qualquer um: bastava escolher o nome e dar Enter — inclusive o nome da
         administradora. Quem não tem PIN cria o dela aqui, uma vez, confirmando. */
      let criouPin = false;
      if (p.pinHash) {
        if (hashPin(pin) !== p.pinHash) return toast("PIN errado.", "erro");
      } else {
        if (!/^[0-9]{4,6}$/.test(pin))
          return toast(`${primeiroNome(p.nome)} ainda não tem PIN. Digite um de 4 a 6 números para criar o dela agora.`, "erro");
        if (!confirm(`Criar o PIN de ${p.nome} com estes números?\n\nConfirme só se você é ${p.nome} — depois disso, só quem souber este PIN entra no perfil dela.`)) return;
        p.pinHash = hashPin(pin); criouPin = true;
      }
      /* `email` guarda a CONTA DO SERVIDOR sob a qual esta entrada aconteceu — é o que
         permite derrubar a sessão quando a conta do servidor muda. Não é o e-mail da pessoa. */
      S.sessao = { pessoaId: p.id, email: String(supaSessao()?.email || "").trim().toLowerCase() || null, em: new Date().toISOString() };
      gravarSessao(S.sessao); marcarSaida(false);
      if (criouPin) { registrar(null, `PIN de ${p.nome} criado na tela de entrada`, null, null); await salvarEquipe(); }
      /* operadora cai direto nas tarefas DELA; administradora na aba de partida */
      if (!p.adm && podeAba("tarefas")) { S.aba = "tarefas"; S.tarefas.quem = p.nome; }
      else if (!podeAba(S.aba)) S.aba = abaPadrao();
      render();
      toast(`Bom trabalho, ${p.nome}!`);
    }
    else if (act === "criar-adm") {
      const nome = ($("#lg-nome")?.value || "").trim();
      const pin = ($("#lg-pin")?.value || "").trim();
      if (!nome) return toast("Diga o nome.", "erro");
      if (pin.length < 4) return toast("PIN de 4 a 6 números.", "erro");
      const p = { id: uid(), nome, ativo: true, funcoes: [], adm: true, verValores: true, pinHash: hashPin(pin) };
      S.equipe.push(p);
      S.sessao = { pessoaId: p.id, em: new Date().toISOString() };
      gravarSessao(S.sessao); marcarSaida(false);
      await salvarEquipe();
      render();
      toast(`Administradora criada. Cadastre a equipe em Equipe e defina o acesso de cada uma.`);
    }
    else if (act === "sair") {
      S.sessao = null; gravarSessao(null); marcarSaida(true); S.menuConta = false;
      /* o que é de pessoa não fica para a próxima: aba aberta e filtro de tarefas */
      S.aba = abaPadrao(); S.tarefas = { quem: "" }; S.modal = null;
      render();
      toast("Você saiu. Escolha o nome para entrar de novo.");
    }
    else if (act === "reanalisar-prioridades") {
      const r = await reanalisarPrioridades();
      toast(r.total ? `Prioridades reanalisadas: ${r.subiram} ${r.subiram === 1 ? "subiu" : "subiram"}, ${r.desceram} ${r.desceram === 1 ? "desceu" : "desceram"} — a fila já se reordenou.`
        : "Prioridades reanalisadas: nada mudou — todo mundo já estava na faixa certa.");
    }
    else if (act === "novo-pedido") { S.modal = { tipo: "novoPedido" }; render();
      if (typeof pedCicloRefrescar === "function") pedCicloRefrescar(["novoPedido"]); }
    else if (act === "salvar-novo-pedido") {
      const ehNovo = !!S.modal?.novo;
      const qtd = Number($("#np-qtd")?.value) || 0;
      let sku, prod;
      if (ehNovo) {
        /* produto que ainda não existe na loja: nasce com código provisório */
        const desc = ($("#np-desc")?.value || "").trim();
        sku = ($("#np-cod")?.value || "").trim().toUpperCase() || S.modal.codSugerido;
        if (!desc) return toast("Dê um nome ao produto novo — é ele que sai no canhoto.", "erro");
        if (produtoDe(sku)) return toast(`Já existe um produto com o código ${sku}.`, "erro");
        if (qtd <= 0) return toast("Quantidade precisa ser maior que zero.", "erro");
        const fornNome = ($("#np-forn")?.value || "").trim();
        const forn = fornNome ? fornecedorPorNome(fornNome) : null;
        prod = { id: proximoIdProduto(), sku, skuAtual: sku, skusAnteriores: [], descricao: desc,
          categoria: null, qtdPacote: Math.max(1, Number($("#np-pac")?.value) || 1),
          processo: (($("#np-proc")?.value || "").trim().toUpperCase()) || null,
          producao: forn ? { fornecedorId: forn.id } : {},
          obsInterna: ($("#np-obsprod")?.value || "").trim() || null,
          provisorio: true, cadastroIncompleto: true, criadoEm: iso(hoje()), origem: "app" };
        S.produtos.push(prod);
        /* só consome a sequência quando o código sugerido foi mesmo usado */
        if (sku === S.modal.codSugerido) S.cfg.novoSeq = proximoCodigoProvisorio().seq;
        registrar(null, `produto provisório ${sku} criado — ${desc}`, null, null);
        toast(`${sku} criado como provisório. Quando o SKU sair na Magazord, vincule em Produtos.`);
      } else {
        sku = ($("#np-sku")?.value || "").trim().toUpperCase();
        if (!sku) return toast("Diga o SKU do produto.", "erro");
        if (qtd <= 0) return toast("Quantidade precisa ser maior que zero.", "erro");
        prod = produtoDe(sku);
        if (!prod) {
          /* NASCIA SEM `id`. E produto sem id é DESCARTADO em silêncio pela
             fusão multiusuário (`dados/conflito.js:375` conta `semChave++` e
             segue) — some sem erro e sem aviso. Era perda de dado, não risco
             de migração. */
          prod = { id: proximoIdProduto(), sku, skuAtual: sku, skusAnteriores: [],
                   descricao: sku, qtdPacote: 1, processo: null, producao: {},
                   criadoEm: iso(hoje()), origem: "app", cadastroIncompleto: true };
          S.produtos.push(prod);
          toast(`Produto ${sku} criado no cadastro (pacote 1) — complete depois em Produtos.`);
        }
      }
      let op = opAtivaDe(sku);
      if (!op) {
        op = { id: uid(), sku, status: "em_producao", prioridade: 4, criadoEm: iso(hoje()), origem: "manual" };
        S.ops.push(op);
      }
      const prioSel = $("#np-prio")?.value;
      const linha = S.calc.porSku.get(sku);
      const prioridade = prioSel === "auto" || prioSel == null || prioSel === ""
        ? (linha ? prioridadeDe(linha) : 4)
        : Number(prioSel);
      /* o número que ela viu na tela é o número que o pedido recebe — nada de
         recalcular aqui e sair diferente do que estava escrito */
      const numDigitado = ($("#np-num")?.value || "").trim().toUpperCase();
      const numero = numDigitado || String(proximoNumeroPedido()).padStart(4, "0");
      const jaEh = numeroEmUso(numero);
      if (jaEh) { S._solta?.(); return toast(`O número ${numero} já é do pedido de ${jaEh.prestadora || "prestadora não definida"} (${P_LABEL[jaEh.status] || jaEh.status}). Use ${proximaContinuacao(numero)} para uma continuação, ou deixe o sugerido.`, "erro"); }
      /* ---------- a montagem, agora COMPARTILHADA com a Demanda (v8.77) ----------
         Era outra implementação dos mesmos campos, e as duas divergiram: este
         caminho lia a embalagem por `[data-emb]` (vocabulário que a janela já
         não desenha), nunca gravava `prod.etapasUsadas`, nunca preenchia
         `setor`, e tirava o responsável do processo do CADASTRO em vez do
         processo escolhido na janela. Agora quem monta é `pedEsqueleto` +
         `pedAplicarComuns`, as mesmas funções de `confirmarPedidos`. */
      const cap = {};
      $$("[data-m]").forEach((el2) => {
        const k = el2.dataset.m;
        if (el2.type === "checkbox") cap[k] = el2.checked;
        else if (el2.type === "number") cap[k] = el2.value === "" ? null : Number(el2.value);
        else cap[k] = el2.value.trim() || null;
      });
      /* v8.20 · o processo é escolhido NA JANELA, e é ele que manda. E é DELE
         que saem o setor e o responsável — trocar o processo e receber o
         responsável do processo antigo era o defeito. */
      const processoFinal = (($("#np-proc")?.value || "").trim().toUpperCase()) || prod.processo || null;
      const etapas = pedLerEtapasDoForm(null);
      const embalagem = pedLerEmbalagemDoForm(null);
      pedAplicarPadraoDoProduto(prod, { etapas, embalagem });

      const r = pedEsqueleto({ numero, opId: op.id, sku, qtd, prioridade, criadoEm: iso(hoje()) });
      pedAplicarComuns(r, {
        processo: processoFinal,
        prestadora: $("#np-prest")?.value || null,
        responsavel: cap.responsavel || null,
        prioridadeTravada: !!cap.prioridadeTravada,
        aguardandoMaterial: !!cap.aguardandoMaterial,
        qtdEmbalar: cap.qtdEmbalar != null ? cap.qtdEmbalar : null,
        qtdMix: cap.qtdMix != null ? cap.qtdMix : null,
        obs: $("#np-obs")?.value || null,
        obsInterna: $("#np-obs-int")?.value || null,
        etapas,
      });
      const erroDestino = pedDestinoConfere(r);
      if (erroDestino) { S._solta?.(); return toast(erroDestino, "erro"); }
      S.pedidos.push(r);
      /* irmãos vivos do mesmo SKU herdam a prioridade melhor, como na criação pela Demanda */
      for (const irm of S.pedidos) {
        if (irm.opId !== op.id || irm.id === r.id || !PED_VIVO.includes(irm.status) || irm.prioridadeTravada) continue;
        if (irm.prioridade > prioridade) {
          registrar(op.id, `pedido ${irm.numero} alinhado à prioridade do novo pedido`, { prioridade: irm.prioridade }, { prioridade });
          irm.prioridade = prioridade;
        }
      }
      registrar(op.id, `pedido ${r.numero} criado manualmente (sem análise)`, null, { qtd, prioridade });
      recalcularOP(op);
      /* Uma janela só: ela decide tudo e clica em Criar. A impressão vem em
         seguida porque é o próximo passo do fluxo, não porque falta algo. */
      S.modal = { tipo: "papeis", qtd: 1, nPapel: 1, ids: [r.id], origem: "demanda" };
      /* -----------------------------------------------------------------
         v8.85 · DESENHAR A TROCA ANTES DE ESPERAR A GRAVAÇÃO
         -----------------------------------------------------------------
         `S.modal` virava "papeis" aqui e o `await` de baixo levava 290 ms —
         só que sem um `render()` a TELA não sabia. Medido: o botão saía de
         "Aguarde…", o pedido ficava gravado, e a janela do pedido continuava
         de pé até alguma outra coisa redesenhar. Não era lentidão; era
         redesenho que nunca acontecia.
         `confirmarPedidos` (pedidos/criar.js) sempre fez assim: troca a
         janela, desenha, e só então espera a gravação. `S.pedidos.push(r)` e
         `recalcularOP(op)` já rodaram acima — o estado local está completo e
         consistente antes desta linha. A gravação continua idêntica: mesmo
         `await`, mesma ordem, mesma outbox, e se falhar o aviso de "não
         salvo" aparece como sempre.
         ----------------------------------------------------------------- */
      render();
      /* `produtos` só entrava na gravação quando a EMBALAGEM tinha mudado. Só
         que este mesmo handler CRIA produto (provisório, ou o do SKU digitado
         que não existia). Sem mexer na embalagem, o pedido era gravado e o
         produto ficava só na memória: ao recarregar, pedido órfão apontando
         para um SKU que não existe no cadastro. A seção `produtos` passa a ir
         sempre — gravar de novo o que não mudou é barato; perder o produto
         recém-criado não é. */
      await salvarTudo("nucleo", "produtos");
      toastPasso(`Pedido ${r.numero} criado`, P_LABEL.papel, "próxima: imprimir o papel para entrar na fila");
    }
    else if (act === "novo-pedido-nada") {}
    else if (act === "toggle-rail") {
      /* preferência DESTA máquina: não vai para o documento da equipe */
      railMiniGravar(!railMini());
      const shell = document.querySelector(".shell");
      if (shell) {
        /* anima no elemento que já existe — sem render(), sem piscar */
        shell.classList.toggle("mini", railMini());
        const b2 = shell.querySelector(".rail-toggle");
        if (b2) { b2.innerHTML = svg(railMini() ? IC.setaDir : IC.setaEsq);
          b2.title = railMini() ? "Expandir o menu" : "Recolher o menu (mais campo de visão)"; }
      } else render();
    }
    else if (act === "print-papeis-sel") {
      const ids = [];
      for (const l of S.calc.linhas) {
        if (!S.sel.has(l.sku)) continue;
        for (const r of l.pedidosAbertos || []) ids.push(r.id);
      }
      if (!ids.length) return toast("Nenhum pedido vivo nos produtos selecionados.", "erro");
      S.modal = { tipo: "papeis", qtd: ids.length, ids,
        nPapel: ids.filter((id) => pedidoPorId(id)?.status === "papel").length };
      render();
    }
    else if (act === "print-papeis") {
      const lista = listaPapeis();
      if (!lista.length) return toast("Nenhum pedido nesta etapa com esses filtros.", "erro");
      S.modal = { tipo: "papeis", qtd: lista.length, nPapel: lista.filter((x) => x.status === "papel").length };
      render();
    }
    else return false;
    return true;
}

