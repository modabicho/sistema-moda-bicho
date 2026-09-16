/* ---------- Dados ---------- */
function viewDados() {
  const c = S.calc;
  const prazos = c ? [...c.leadProc.entries()].map(([k, v]) => `${k} ${Math.round(v)}d`).join(" · ") : "";
  const analises = S.analises.slice().sort((a, b) => b.id - a.id).slice(0, 8);
  const uso = usoStorage();
  const ps = S.pontosCache || [];
  const nHist = (S.hist?.serie || []).length;
  return `
  <div class="grid-dados">
    <div class="col">
    <div class="card" style="border-top:3px solid var(--coral)">
      <div class="card-h"><h2>Passo 1 · Consulta Dinâmica</h2><span class="sub">dia sim, dia não — sempre antes de analisar</span></div>
      <div style="padding:12px 14px">
        <div style="display:flex;gap:11px;margin-bottom:12px">
          <label class="fld" style="flex:1"><span>Período — início</span><input type="date" class="inp" id="per-ini" value="${S.estoque?.periodoIni || new Date().getFullYear() + "-01-01"}"></label>
          <label class="fld" style="flex:1"><span>Fim</span><input type="date" class="inp" id="per-fim" value="${S.estoque?.periodoFim || iso(hoje())}"></label>
        </div>
        <div class="dz" id="dz-csv">${svg(IC.upload)}
          <div style="font-size:13px;font-weight:600;margin:8px 0 3px">Arraste o CSV aqui</div>
          <div style="font-size:12px;color:var(--ink-3);margin-bottom:12px">ou</div>
          <button class="btn primary" data-act="pick-csv">Escolher arquivo</button></div>
        ${S.estoque ? `<div style="margin-top:11px;font-size:12.5px;color:var(--ink-3)">Atualizado em ${fdataHora(S.estoque.importadoEm)} · ${n0(S.estoque.itens.length)} SKUs</div>` : ""}
        ${porque("O que este arquivo traz", `Relatório exportado do <b>faderim da Magazord</b>: vendas do período, estoque mínimo, reserva e estoque virtual.
          A demanda é recalculada na hora; pedidos e prioridades só mudam quando você aplicar a análise.
          O <b>Consultar Estoque</b> do passo 2 também entra por aqui — o app reconhece qual é pelo cabeçalho.`)}
      </div>
    </div>
    <div class="card" style="border-top:3px solid var(--bege)">
      <div class="card-h"><h2>Passo 2 · Planilhas de produtos</h2><span class="sub">cerca de uma vez por semana</span></div>
      <div style="padding:12px 14px">
        <div class="dz-grupo">
        <div class="dz" id="dz-vinculo">${svg(IC.produtos)}
          <div style="font-size:13px;font-weight:600;margin:6px 0 2px">Lista de produtos</div>
          <div style="font-size:11.5px;color:var(--ink-3);margin-bottom:9px">código/SKU · produto · derivação · marca (vira o fornecedor)</div>
          <button class="btn primary sm" data-act="pick-vinculo">Escolher arquivo</button></div>
        <div class="dz" id="dz-catalogo">${svg(IC.link)}
          <div style="font-size:13px;font-weight:600;margin:6px 0 2px">Catálogo da loja</div>
          <div style="font-size:11.5px;color:var(--ink-3);margin-bottom:9px">código · título · URL da página · preço · custo médio</div>
          <button class="btn primary sm" data-act="pick-catalogo">Escolher arquivo</button></div>
        <div class="dz" id="dz-fotos">${svg(IC.foto)}
          <div style="font-size:13px;font-weight:600;margin:6px 0 2px">Fotos e links da loja</div>
          <div style="font-size:11.5px;color:var(--ink-3);margin-bottom:9px">código/SKU · imagem/foto (url) · link/url do produto</div>
          <button class="btn primary sm" data-act="pick-fotos">Escolher arquivo</button></div>
        </div>
        ${(() => { const cf = S.produtos.filter((p) => p.foto).length, cl = S.produtos.filter((p) => p.linkLoja).length, cm = S.produtos.filter((p) => p.magazord?.marca || p.fornecedorId).length;
          return S.produtos.length ? `<div class="hint" style="margin-top:10px">Hoje: <b>${n0(cf)}</b> de ${n0(S.produtos.length)} com foto · <b>${n0(cl)}</b> com link · <b>${n0(cm)}</b> com marca/fornecedor.</div>` : ""; })()}
        ${porque("Pode subir uma só ou as três", `Planilhas da Magazord, cada uma no seu lugar. <b>Tudo casa pelo SKU</b>, e o que já existe no app não é apagado.
          O catálogo não mexe no fornecedor nem na embalagem.`)}
      </div>
    </div>
    <div class="card" style="border-top:3px solid var(--teal)">
      <div class="card-h"><h2>Passo 3 · Planilha da fábrica (.xlsm) e backup</h2><span class="sub">temporário — sai de cena na virada</span></div>
      <div style="padding:12px 14px">
        <div style="display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn primary" data-act="pick-xlsm">Importar planilha (.xlsm)</button>
          <button class="btn" data-act="pick-seed">Importar dados (.json)</button>
          <button class="btn" data-act="backup">Baixar backup</button>
        </div>
        ${S.cfg.imports?.planilha || S.cfg.imports?.dados ? `<div style="margin-top:10px;font-size:12.5px;color:var(--ink-3)">${S.cfg.imports?.planilha ? `Planilha: <b>${fdataHora(S.cfg.imports.planilha)}</b>` : ""}${S.cfg.imports?.planilha && S.cfg.imports?.dados ? " · " : ""}${S.cfg.imports?.dados ? `Dados (.json): <b>${fdataHora(S.cfg.imports.dados)}</b>` : ""}</div>` : ""}
        ${CAMADA === "memoria" ? '<div style="margin-top:10px;font-size:12.5px;color:var(--red);font-weight:600">Nenhuma camada de gravação respondeu — baixe backup antes de fechar.</div>' : ""}
        ${porque("O que a carga faz com o que já existe", `A carga substitui tudo pelo conteúdo do arquivo. Formatos antigos (planilha ou versão anterior do app) são convertidos automaticamente.<br><br>
          A planilha .xlsm lê <b>ControlePedidos</b> (compara e atualiza sem duplicar), <b>ControleProcessos</b> (o que cada prestadora faz), <b>Produtos</b> (complemento de cadastro; fotos e links são preservados) e <b>Demanda</b> (só validação).
          Listas, GerarPedido e Import.Estoque ficam de fora — o estoque vem apenas do CSV do passo 1.`)}
      </div>
    </div>
    ${(() => {
      /* ---------- Passo 4 · devolver o mínimo decidido aqui para o ERP ----------
         O app não escreve na Magazord. O que ele faz é entregar o arquivo no
         formato que o importador dela pede, e mostrar exatamente o que vai dentro. */
      const pend = c?.minAEnviar || [];
      const jaFoi = c?.minEnviados || [];
      const naFila = c?.minRevisar?.length || 0;
      const comCab = S.cfg.csvMinCabecalho !== false;
      const previa = [...(comCab ? ["SKU;Quantidade de Estoque Mínimo"] : []), ...linhasCsvMinimos().slice(0, 3)];
      /* o bloco dos que já foram: some da fila de trabalho e continua à vista,
         porque a importação lá pode ter falhado e o arquivo precisa poder voltar */
      const blocoEnviados = jaFoi.length ? `
        <details class="pq" style="margin-top:${pend.length ? "14px" : "12px"}">
          <summary>${n0(jaFoi.length)} ${jaFoi.length === 1 ? "já foi no arquivo e espera" : "já foram no arquivo e esperam"} a Magazord confirmar</summary>
          <div>
            <p style="margin:0 0 10px;font-size:13px;line-height:1.65">Estes saíram daqui num CSV. Assim que você trouxer o estoque da Magazord no <b>passo 1</b> com o valor já aplicado, cada um some sozinho desta lista — é assim que o app sabe que chegou lá de verdade.</p>
            <div class="tw" style="max-height:200px"><table class="t" style="font-size:12.5px">
              <thead><tr><th>SKU</th><th class="num">Na Magazord</th><th class="num">Vai virar</th><th>Enviado em</th></tr></thead>
              <tbody>${jaFoi.slice(0, 40).map((l) => `<tr>
                <td class="sku" style="font-size:12px">${esc(l.sku)}</td>
                <td class="num">${n0(l.estMinErp)}</td>
                <td class="num"><b>${n0(l.estMin)}</b></td>
                <td style="font-size:11.5px;color:var(--ink-3)">${fdate(l.minAjuste.exportadoEm)}</td>
              </tr>`).join("")}</tbody></table></div>
            ${jaFoi.length > 40 ? `<p class="hint" style="margin:8px 0 0">Mostrando 40 de ${n0(jaFoi.length)}.</p>` : ""}
            <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:12px">
              <button class="btn sm" data-act="csv-minimos-denovo" title="Refaz o mesmo arquivo, sem mudar nada aqui — use se a importação na Magazord falhou">Baixar o mesmo arquivo de novo</button>
              <button class="btn sm ghost" data-act="min-nao-enviados" title="Devolve estes ${n0(jaFoi.length)} para a lista de a enviar">Não foram enviados — voltar para a fila</button>
            </div>
          </div></details>` : "";
      return `<div class="card" style="border-top:3px solid var(--coral)">
      <div class="card-h"><h2>Passo 4 · Devolver o mínimo para a Magazord</h2><span class="sub">depois de revisar os mínimos</span></div>
      <div style="padding:12px 14px">
      ${!pend.length ? `
        <p style="margin:0;font-size:13px;color:var(--ink-2);line-height:1.65">${jaFoi.length
          ? `<b>Nada para levar agora.</b> Tudo que foi decidido aqui já saiu num arquivo.`
          : `Nenhum estoque mínimo alterado aqui esperando a Magazord.`}${naFila ? ` Há <b>${n0(naFila)}</b> ${naFila === 1 ? "produto" : "produtos"} na fila de revisão.` : ""}</p>
        ${naFila ? `<button class="btn primary sm" style="margin-top:12px" data-act="revisar-min">${svg(IC.regua2)}Revisar mínimos (${n0(naFila)})</button>` : ""}
        ${blocoEnviados}`
      : `
        <p style="margin:0 0 12px;font-size:13px;color:var(--ink-2);line-height:1.65">
          <b>${n0(pend.length)}</b> ${pend.length === 1 ? "produto teve" : "produtos tiveram"} o estoque mínimo alterado aqui e a Magazord ainda não sabe.</p>
        <div class="tw" style="max-height:260px"><table class="t" style="font-size:12.5px">
          <thead><tr><th>SKU</th><th>Produto</th><th class="num">Na Magazord</th><th class="num">Vai virar</th><th>Decidido</th></tr></thead>
          <tbody>${pend.slice(0, 40).map((l) => `<tr>
            <td class="sku" style="font-size:12px">${esc(l.sku)}</td>
            <td style="font-size:12px;color:var(--ink-3);max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.descricao || "")}</td>
            <td class="num">${n0(l.estMinErp)}</td>
            <td class="num"><b style="color:${l.estMin > l.estMinErp ? "var(--red)" : "var(--teal)"}">${n0(l.estMin)}</b></td>
            <td style="font-size:11.5px;color:var(--ink-3)">${fdate(l.minAjuste?.em)}${l.minAjuste?.por ? ` · ${esc(l.minAjuste.por)}` : ""}</td>
          </tr>`).join("")}</tbody></table></div>
        ${pend.length > 40 ? `<p class="hint" style="margin:8px 0 0">Mostrando 40 de ${n0(pend.length)} — o arquivo leva todos.</p>` : ""}
        <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:14px">
          <button class="btn primary" data-act="csv-minimos">Baixar CSV para a Magazord</button>
          <button class="btn" data-act="exportar-minimos" title="Mesmos produtos, com vendas, curva, sugestão e quem decidiu — para conferência">Planilha completa (.xlsx)</button>
          ${naFila ? `<button class="btn ghost" data-act="revisar-min">Revisar mais ${n0(naFila)}</button>` : ""}
        </div>
        <label style="display:flex;gap:9px;align-items:flex-start;font-size:12.5px;line-height:1.6;cursor:pointer;margin:12px 0 0">
          <input type="checkbox" class="chk" id="cfg-csvcab" ${comCab ? "checked" : ""} style="margin-top:2px">
          <span>Incluir a linha de cabeçalho <span style="color:var(--ink-3)">— se a Magazord recusar o arquivo, desmarque e baixe de novo.</span></span></label>
        ${blocoEnviados}
        ${porque("Como o arquivo sai e onde importar", `Sai no formato que o importador dela pede: <b>SKU</b> e <b>Quantidade de Estoque Mínimo</b>, separados por ponto e vírgula.
          <pre style="margin:8px 0;background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:9px 11px;font-size:12px;line-height:1.7;overflow-x:auto;color:var(--ink-2)">${esc(previa.join("\n"))}${pend.length > previa.length - (comCab ? 1 : 0) ? "\n…" : ""}</pre>
          <b>Onde importar:</b> Magazord › Estoque › <b>Movimentação de Campos Adicionais Estoque</b> — Depósito <b>Padrão Moda Bicho</b>, Campo Adicional <b>Quantidade de Estoque Mínimo</b>.<br>
          Depois de gravar lá e trazer o CSV do passo 1 para cá, o app percebe que o ERP alcançou o ajuste e encerra sozinho: o mínimo volta a ser lido da Magazord.`)}`}
      </div></div>`; })()}
    <div class="card">
      <div class="card-h"><h2>Leitor de código e loja</h2><span class="sub">o que o bipe faz e para onde o link aponta</span></div>
      <div style="padding:12px 14px">
        <div class="fld" style="margin-bottom:14px"><span>O que vai no 2º QR do canhoto</span>
          <div style="display:flex;gap:7px;margin-top:5px;flex-wrap:wrap">
            <button class="chip ${(S.cfg.qrProduto || "sku") === "sku" ? "on" : ""}" data-qrprod="sku">SKU do produto</button>
            <button class="chip ${S.cfg.qrProduto === "loja" ? "on" : ""}" data-qrprod="loja">Endereço da loja</button>
          </div>
          ${porque("Qual dos dois escolher", `<b>SKU</b> — só letras e números: o leitor entrega certo em qualquer teclado e o app abre o produto na hora.<br>
            <b>Endereço da loja</b> — a câmera do celular abre a página. No leitor de mesa só funciona se ele estiver em <b>modo ALT</b> (procure "ALT Mode" no manual); fora disso o teclado come a barra e os dois-pontos.`)}
        </div>
        <div class="fld" style="margin-bottom:14px"><span>Ao bipar o código do produto</span>
          <div style="display:flex;gap:7px;margin-top:5px;flex-wrap:wrap">
            <button class="chip ${(S.cfg.aoBiparProduto || "app") === "app" ? "on" : ""}" data-aobipar="app">Abrir no app</button>
            <button class="chip ${S.cfg.aoBiparProduto === "loja" ? "on" : ""}" data-aobipar="loja">Abrir a loja</button>
            <button class="chip ${S.cfg.aoBiparProduto === "ambos" ? "on" : ""}" data-aobipar="ambos">Os dois</button>
          </div>
          ${porque("Por que abrir pelo app", `Quem abre a loja é o app, então o endereço sai correto — não passa pelo teclado, que é onde a barra se perde. Requer o app aberto e em foco na hora de bipar.`)}
        </div>
        <label class="fld" style="margin-bottom:12px"><span>Domínio da loja</span>
          <input class="inp" id="cfg-dominio" value="${esc(S.cfg.dominioLoja || "www.modabicho.com.br")}" placeholder="www.modabicho.com.br">
          <div class="hint" style="margin-top:5px">A planilha de catálogo traz a URL sem o domínio — o app junta os dois.</div></label>
        <label class="fld"><span>Link de busca da loja</span>
          <input class="inp" id="cfg-busca" value="${esc(S.cfg.buscaSite || "")}">
          <div class="hint" style="margin-top:5px">O trecho <b>{sku}</b> vira o código do produto.</div></label>
      </div>
    </div>
    </div>
    <div class="col">

    <div class="bloco">
      <div class="bloco-h"><h3>Versão do aplicativo</h3><span class="sub">confira antes de reportar um problema</span></div>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div><div style="font-size:26px;font-weight:800;letter-spacing:-.03em;line-height:1">v${VERSAO}</div>
          <div class="hint" style="margin:2px 0 0">aberto ${fdataHora(ABERTO_EM)}</div></div>
        <div style="flex:1;min-width:200px;font-size:12.5px;color:var(--ink-2);line-height:1.7">
          <div>${S.versaoNova ? `<b style="color:var(--coral-2)">Publicada: ${esc(S.versaoNova.versao)} — atualize</b>`
            : S.versaoPublicada ? `<span style="color:var(--teal)">Publicada: ${esc(S.versaoPublicada)} — você está em dia</span>`
            : `<span style="color:var(--ink-3)">Publicada: — (abra pelo endereço do Netlify para conferir)</span>`}</div>
          <div style="color:var(--ink-3)">${esc(usuarioAtual()?.nome || "—")}${usuarioAtual()?.adm ? " · administradora" : ""} · gravando em <b style="font-weight:600">${esc(CAMADA_NOME[CAMADA] || "…")}</b>${temJanelaReal && SUPA_URL && !supaSessao()?.access ? ` · <span style="color:var(--coral-2)">sem login no servidor</span>` : ""}</div>
        </div>
        <button class="btn ${S.versaoNova ? "primary" : ""}" data-act="recarregar-app" title="Baixa o arquivo do servidor ignorando o que está guardado no navegador">${svg(IC.atualizar)}Buscar versão nova</button>
      </div>
      ${porque("A equipe está vendo coisas diferentes?", `O navegador guarda uma cópia do aplicativo para abrir mais rápido. Depois que a versão nova sobe para o Netlify, pode levar um tempo até ela chegar — o botão acima força a busca.
        <b>Quase sempre é isso:</b> alguém está numa versão anterior. Compare este número entre os computadores.`)}
    </div>

    <div class="card">
      <div class="card-h"><h2>Parâmetros do cálculo</h2><span class="sub">mexa só se a regra da fábrica mudar</span></div>
      <div style="padding:12px 14px">
        <label class="fld" style="margin-bottom:12px"><span>Estoque de segurança (meses de venda)</span>
          <input type="number" min="1" max="12" step="1" class="inp num" id="cfg-meses" style="width:90px" value="${S.cfg.mesesEstoqueSeguranca}">
          <div class="hint" style="margin-top:5px">Vale para todo produto sem regra própria. Fornecimento <b>externo</b> soma mais 1 mês.</div></label>
        <div class="fld" style="margin-bottom:14px"><span>Exceções por processo</span>
          <div class="tw" style="margin-top:6px"><table class="t" style="font-size:12.5px">
            <thead><tr><th>Processo</th><th class="num">Curva A</th><th class="num">Curva B</th><th class="num">Curva C</th><th></th></tr></thead>
            <tbody>${regrasMeses().map((r, i) => `<tr>
              <td><input class="inp" data-regmeses="${i}|processo" value="${esc(r.processo || "")}" placeholder="BANDANA" style="width:200px;text-transform:uppercase"></td>
              ${["A", "B", "C"].map((k) => `<td class="num"><input class="inp num" type="number" min="0" max="12" step="0.5" data-regmeses="${i}|${k}" value="${r[k] ?? ""}" style="width:78px" placeholder="—"></td>`).join("")}
              <td><button class="btn sm ghost" data-regmeses-del="${i}" title="Remover esta exceção">Remover</button></td></tr>`).join("")
            || vazioLinha("pronto", "Sem exceções", `Todo produto usa os ${S.cfg.mesesEstoqueSeguranca} meses acima.`)}</tbody>
          </table></div>
          <button class="btn sm" style="margin-top:9px" data-act="regmeses-nova">${svg(IC.mais)}Adicionar processo</button>
          ${porque("Quando vale a pena criar uma exceção", `Processo de valor agregado alto não sustenta os meses acima — o dinheiro fica parado na prateleira.
            Aqui cada um ganha a sua régua, e ela muda por curva: o que gira mais merece mais cobertura.
            <b>Quando o processo tem regra, ela vale ao pé da letra</b> — nem o +1 mês do fornecimento externo entra.
            A regra pega todo processo cujo nome contenha o texto escrito aqui; a mais específica ganha.`)}
        </div>
        <label class="fld" style="margin-bottom:12px"><span>Tolerância de atraso da prestadora (dias)</span>
          <input type="number" min="0" max="30" step="1" class="inp num" id="cfg-tolatraso" style="width:90px" value="${Number(S.cfg.toleranciaAtraso) ?? 3}">
          <div class="hint" style="margin-top:5px">Folga antes de o pedido entrar em "Atrasadas".</div></label>
        <label class="fld" style="margin-bottom:12px"><span>Prazo para conferir o retorno (dias)</span>
          <input type="number" min="1" max="30" step="1" class="inp num" id="cfg-prazoconf" style="width:90px" value="${Number(S.cfg.prazoConferencia) || 3}">
          <div class="hint" style="margin-top:5px">Passado isso, o pedido aparece em "Atraso Conferência".</div></label>
        <label class="fld" style="margin-bottom:12px"><span>Capacidade da fila (tarefas de corte visíveis)</span>
          <input type="number" class="inp num" style="width:90px" id="cfg-cap" min="10" step="5" value="${S.cfg.capacidadeFila}">
          <div class="hint" style="margin-top:5px">Quantos pedidos a Fila mostra de uma vez.</div></label>
        <!-- Havia TRES labels abertos aqui, e um deles emendado no meio de um
             input. O navegador conserta aninhando, e o conserto dele jogava o
             botao "Exportar demanda" para DENTRO deste label: meio botao fora
             da tela no telefone. Um label, bem fechado. -->
        <label style="display:flex;gap:9px;align-items:flex-start;font-size:12.5px;line-height:1.6;cursor:pointer;margin-bottom:12px">
          <input type="checkbox" class="chk" id="cfg-blocos" ${S.cfg.dividirBlocos ? "checked" : ""} style="margin-top:2px">
          <span>Dividir cada análise em três blocos, um por prioridade<br>
            <span style="color:var(--ink-3)">Necessidades P1 novas entram num bloco anterior às P2 e P3 da mesma análise.</span></span></label>
        ${porque("O que estes prazos fazem no resto do app", `O prazo de cada processo é a <b>mediana</b> dos pedidos já conferidos, não uma promessa — um ou dois dias a mais não é atraso.
          Só depois da tolerância o pedido entra em "Atrasadas" e a prestadora aparece para cobrança.<br><br>
          Peça parada na conferência não conta como produzida e a prestadora não recebe — e se virar o mês, o pagamento dela escorrega para o fechamento seguinte.<br><br>
          Prazo de produção${c ? `: <b>${Math.round(c.leadGeral)} dias</b> no geral` : ""}.${prazos ? `<br><span style="color:var(--ink-4)">${esc(prazos)}</span>` : ""}`)}
        <button class="btn" style="margin-top:12px" data-act="exp-demanda">Exportar demanda .xlsx</button>
      </div>
    </div>

    <div class="bloco">
      <div class="bloco-h"><h3>Base atual</h3><span class="sub">o que está carregado agora</span></div>
      <dl class="kv" style="padding-top:0">
        <dt>Produtos</dt><dd>${n0(S.produtos.length)}</dd>
        <dt>SKUs no estoque</dt><dd>${n0(S.estoque?.itens?.length || 0)}</dd>
        <dt>Pedidos de produção</dt><dd>${n0(S.pedidos.length)}</dd>
        <dt>Pedidos vivos</dt><dd>${n0(S.pedidos.filter((r) => PED_VIVO.includes(r.status)).length)}</dd>
        <dt>Necessidades ativas</dt><dd>${n0(S.ops.filter((o) => OP_ATIVA.includes(o.status)).length)}</dd>
        <dt>Itens em falta</dt><dd>${n0(S.faltas.filter((f) => f.status !== "recebida").length)}</dd>
        <dt>Prestadoras</dt><dd>${n0(S.cad.prestadoras.length)}</dd>
        <dt>Equipe</dt><dd>${n0(S.equipe.length)}</dd>
        <dt>Histórico acumulado</dt><dd>${nHist ? `${nHist} fotografias` : "—"}</dd>
        <dt>Espaço do navegador</dt><dd style="${uso.pct > 70 ? "color:var(--red)" : ""}">${(uso.bytes / 1048576).toFixed(1)} MB · ${uso.pct}%</dd>
      </dl>
      ${uso.pct > 70 ? `<div class="hint" style="color:var(--red);margin-top:8px">Espaço apertado — exporte um backup e me avise.</div>` : ""}
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn sm" data-act="diagnostico">Diagnóstico</button>
        ${temJanelaReal && SUPA_URL ? `<button class="btn sm" data-act="testar-servidor">Testar conexão</button>` : ""}
        <button class="btn danger sm" data-act="limpeza">${svg(IC.lixeira)}Apagar dados…</button>
        ${MODO_TESTE ? `<button class="btn sm" data-act="zerar-teste" title="Joga fora o que você mexeu nesta cópia e recarrega os dados de verdade do servidor">Recomeçar a cópia de teste</button>` : ""}
      </div>
      ${porque(`Pontos de restauração${ps.length ? ` (${ps.length})` : ""} e análises aplicadas`, `<div style="font-weight:700;color:var(--ink-3);margin-bottom:5px">Pontos de restauração — automáticos, 1 por dia</div>
        ${ps.length ? ps.map((p, i) => `<div class="kv" style="padding:6px 0"><span>${fdataHora(p.em)} · ${n0((p.nucleo?.pedidos || []).length)} pedidos</span>
          <button class="btn sm" data-restaurar="${i}">Restaurar</button></div>`).join("")
        : `<div style="padding:2px 0">A primeira foto sai na próxima abertura do app com dados.</div>`}
        <div style="font-weight:700;color:var(--ink-3);margin:14px 0 5px">Análises aplicadas</div>
        <div class="tw" style="max-height:260px"><table class="t" style="font-size:12px"><thead><tr><th>#</th><th>Bloco</th><th>Data</th>
          <th class="num">Novas</th><th class="num">Atualizadas</th><th class="num">Promovidos</th><th class="num">Encerradas</th></tr></thead>
        <tbody>${analises.map((a) => `<tr><td class="mono">${a.id}</td><td>${esc(a.rotulo)}</td>
          <td class="mono" style="font-size:11.5px">${fdataHora(a.executadaEm)}</td>
          <td class="num">${a.novas || "—"}</td><td class="num">${a.atualizadas || "—"}</td>
          <td class="num">${a.promovidos || "—"}</td><td class="num">${a.encerradas || "—"}</td></tr>`).join("")
          || vazioLinha("nada", "Ainda não há análises", "A primeira aparece aqui assim que você aplicar uma na Demanda.")}
        </tbody></table></div>`)}
    </div>

    </div>
  </div>`;
}

/* ---------- os três vazios ----------
   nada   = nunca teve dado nenhum   -> "Ainda não há pedidos."
   filtro = tem dado, o filtro comeu -> "Nenhum pedido encontrado com estes filtros."
   pronto = tinha trabalho, acabou   -> "Nada pendente aqui."
   Sempre pela mesma porta, para que as três nunca voltem a se parecer. */
/* ---------- explicação que não ocupa a tela ----------
   O texto continua ali; o que muda é que ele só aparece quando alguém
   quiser lê-lo. Mesma gramática do "Como ler esta tabela" das tabelas,
   só que inline, dentro de um card, sem virar barra. */
const porque = (titulo, html) => `<details class="pq"><summary>${titulo}</summary><div>${html}</div></details>`;

/* Quanto já foi planejado num grupo da janela "Criar pedidos". Mora aqui fora, e
   não dentro do desenho da janela, porque quem também precisa dela é o ouvinte
   global de `change` — que roda noutro escopo e não enxergava o de lá. Declarada
   lá dentro, ela existia para desenhar e sumia na hora de repintar: mudar a
   quantidade de um pedido estourava "totalLinhas is not defined". */
const totalLinhas = (g) => (g?.linhas || []).reduce((t, l) => t + (Number(l.qtd) || 0), 0);

const VAZIO_IC = { nada: "vazio", filtro: "filtro", pronto: "ok" };
function vazio(tipo, titulo, texto, acao) {
  return `<div class="vaz v-${tipo}">
    <div class="vaz-ic">${svg(IC[VAZIO_IC[tipo]] || IC.vazio)}</div>
    <div>
      <h4>${titulo}</h4>
      ${texto ? `<p${tipo === "pronto" ? ' class="mostra"' : ""}>${texto}</p>` : ""}
    </div>
    ${acao ? `<div class="vaz-fez">${acao}</div>` : ""}
  </div>`;
}
/* colspan 99: o navegador corta no número real de colunas. Contar à mão dava
   errado toda vez que uma coluna era condicional, e o recado nascia torto,
   ocupando meia tabela. */
const vazioLinha = (tipo, titulo, texto, acao) =>
  `<tr class="tr-vazio"><td colspan="99">${vazio(tipo, titulo, texto, acao)}</td></tr>`;

function viewVazio() {
  return `<div class="card"><div class="empty"><div class="ic">${svg(IC.vazio)}</div>
    <h3>Tudo começa na aba Dados</h3>
    <p style="max-width:430px;margin:6px auto 16px;line-height:1.7">É lá que mora toda importação — a planilha da fábrica, o CSV do estoque e a planilha da loja — cada uma explicada passo a passo, com data e hora da última subida.</p>
    <button class="btn primary" data-ir="dados">Abrir a aba Dados</button></div></div>`;
}

/* ---------- drawer do SKU ---------- */
function renderDrawer() {
  const sku = S.drawer;
  if (!sku || !S.calc) return "";
  const x = S.calc.porSku.get(sku);
  if (!x) return "";
  const prod = produtoDe(sku);
  const historico = S.pedidos.filter((r) => (opPorId(r.opId)?.sku || r.sku) === sku)
    .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm))).slice(0, 10);
  const cobPct = Math.max(0, Math.min(1, x.estMin ? x.estoqueReal / x.estMin : 1));
  return `<div class="ov" data-fechar="1" style="justify-content:flex-end;padding:0;align-items:stretch"></div>
  <aside class="drawer" role="dialog" aria-label="Detalhe do SKU">
    <div class="drawer-h">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="abc ${x.abc}">${x.abc}</span><span class="sku" style="font-size:13px">${esc(x.sku)}</span>
        <span class="tag dot ${CORCLASSE[x.classe]}">${x.classe}</span>
        <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
      <div style="display:flex;gap:13px;align-items:flex-start;margin-top:12px">${thumb(prod)}
        <div style="flex:1;min-width:0">
          <h2 style="margin:0 0 3px;font-size:16px;font-weight:700;letter-spacing:-.02em;line-height:1.3">${esc(x.descricao)}</h2>
          <p style="margin:0 0 5px;font-size:12.5px;color:var(--ink-3)">${esc(x.motivo)}</p>
          <button class="btn sm" data-loja="${esc(x.sku)}" title="Copia o SKU e abre a loja com a busca pronta">${svg(IC.link)} ${prod?.urlSite ? "Ver na loja" : "Buscar na loja"} · copia o SKU</button>
        </div></div>
    </div>
    <div class="drawer-b">
      <div class="secao">Cobertura</div>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:6px">${regua(x.cobertura, x.lead, x.classe)}
        <span style="font-size:12.5px;color:var(--ink-3)">${x.cobertura >= 999 ? "sem venda no período" : `dura ${Math.round(x.cobertura)} dias · produzir leva ${Math.round(x.lead)}`}</span></div>
      <div class="bar" style="margin:12px 0 4px"><i style="width:${cobPct * 100}%;background:${x.estoqueReal < x.estMin ? "var(--amber)" : "var(--teal)"}"></i></div>
      <div style="font-size:11.5px;color:var(--ink-3)">${n0(x.estoqueReal)} de ${n0(x.estMin)} pacotes do mínimo</div>
      <div class="secao">Números</div>
      <dl class="kv">
        <dt>Vendas no período</dt><dd>${n0(x.vendas)}</dd>
        <dt>Estoque real</dt><dd>${n0(x.estoqueReal)}</dd>
        <dt>Estoque mínimo em uso</dt><dd>${n0(x.estMin)}${x.minAjuste ? ` <span class="tag" title="Ajustado aqui em ${fdate(x.minAjuste.em)}${x.minAjuste.por ? " por " + esc(x.minAjuste.por) : ""}">ajustado aqui</span>` : ""}</dd>
        ${x.minAjuste ? `<dt>· na Magazord ainda</dt><dd>${n0(x.estMinErp)}</dd>` : ""}
        <dt>Mínimo sugerido (vendas)</dt><dd>${n0(x.estMinCalc)}${x.divergeMin ? ' <span class="tag amber">diverge</span>' : ""}
          <button class="btn sm" style="margin-left:6px" data-minsku="${esc(x.sku)}" title="Comparar e decidir o mínimo deste produto">Revisar</button></dd>
        <dt>%Estoque</dt><dd>${x.pctEstoque != null ? Math.round(x.pctEstoque * 100) + "%" : "—"}</dd>
        <dt>%Estoque + produção</dt><dd>${x.pctComProducao != null ? Math.round(x.pctComProducao * 100) + "%" : "—"}</dd>
        <dt>Necessidade (Pcs)</dt><dd>${n0(x.necessidadeBruta)}</dd>
        <dt>Em produção (Pcs)</dt><dd>${n0(x.qtdProgramada)}</dd>
        <dt>· Inicial / Cortado / Prestadora</dt><dd>${n0(x.etapas.Inicial || 0)} / ${n0(x.etapas.Cortado || 0)} / ${n0(x.etapas["Com a prestadora"] || 0)}</dd>
        <dt>Demanda de Produção</dt><dd><b>${n0(x.saldoSemPedido)}</b></dd>
        <dt>Programado em pedidos</dt><dd>${n0(x.qtdProgramada)} pçs</dd>
        <dt>Saldo sem pedido</dt><dd>${x.saldoSemPedido ? "<b>" + n0(x.saldoSemPedido) + " pçs</b>" : "—"}</dd>
        <dt>Peças por pacote</dt><dd>${n0(x.qtdPacote)}</dd>
        <dt>Processo</dt><dd>${esc(x.processo || "—")}</dd></dl>
      ${x.saldoSemPedido > 0 ? `<button class="btn primary" style="width:100%;justify-content:center;margin-top:4px" data-criar-pedidos="${esc(x.sku)}">Criar pedidos do saldo (${n0(x.saldoSemPedido)})</button>` : ""}
      ${x.pedidosAbertos.length ? (() => {
        const o = S.drawerOrd || (S.drawerOrd = { ord: "", dir: 1 });
        /* monta as linhas já calculadas: assim a ordenação enxerga o mesmo que a tela mostra */
        const linhas = x.pedidosAbertos.map((r) => {
          const fora = r.status === "enviada" || r.status === "chegou";
          const saida = pdate(r.enviadaEm || r.separadaEm);
          const idade = fora && saida ? dias(saida, hoje()) : null;
          const lead = x.lead ?? leadDe(r.processo);
          return { r, fora, idade, lead, atrasado: idade != null && idade > lead,
            quem: fora ? (r.prestadora || "a definir") : (r.responsavel || respDoSetor(setorDoPedido(r))[0] || "—") };
        });
        if (o.ord) {
          const val = (z) => o.ord === "numero" ? numeroDoPedido(z.r.numero)
            : o.ord === "prio" ? (z.r.prioridade ?? 9)
            : o.ord === "qtd" ? (Number(z.r.qtd) || 0)
            : o.ord === "etapa" ? P_STATUS.indexOf(z.r.status)
            : o.ord === "quem" ? String(z.quem).toLowerCase()
            : (z.idade ?? -1);
          linhas.sort((a, b) => { const va = val(a), vb = val(b);
            return (typeof va === "string" ? va.localeCompare(vb) : va - vb) * o.dir; });
        } else linhas.sort((a, b) => ordemDaFila(a.r, b.r));
        const thd = (campo, lbl, cls = "") => `<th class="s ${cls}" data-orddw="${campo}" title="Ordenar — o 3º clique volta à ordem da fila">${lbl}${o.ord === campo ? `<span class="ar">${o.dir === -1 ? "↓" : "↑"}</span>` : ""}</th>`;
        return `<div class="secao">Pedidos em aberto</div>
        <table class="t" style="font-size:12px"><thead><tr>${thd("numero", "Pedido")}${thd("prio", "Prio")}${thd("qtd", "Qtd", "num")}${thd("etapa", "Etapa")}${thd("quem", "Com quem")}${thd("dias", "Dias", "num")}<th></th></tr></thead>
        <tbody>${linhas.map(({ r, fora, idade, lead, atrasado, quem }) => `<tr><td class="sku">${esc(r.numero)}</td><td>${corteCurto(r.prioridade)}</td>
          <td class="num">${n0(r.qtd)}</td><td><span class="tag ${fora ? "teal" : ""}">${P_LABEL[r.status]}</span></td>
          <td style="font-size:11.5px">${esc(quem)}${r.avisar ? `<div class="tag ${r.avisar.sentido === "subiu" ? "red" : ""}" style="margin-top:2px;font-size:9.5px" title="Prioridade mudou depois que saiu — precisa avisar">avisar</div>` : ""}</td>
          <td class="num" style="${atrasado ? "color:var(--red);font-weight:700" : "color:var(--ink-3)"}" title="${idade != null ? `prazo típico deste processo: ${Math.round(lead)}d` : "ainda não saiu"}">${idade != null ? `${idade}d` : "—"}</td>
          <td><button class="btn sm ghost" data-editar-pedido="${esc(r.id)}">Editar</button></td></tr>`).join("")}</tbody></table>
        <p class="hint" style="margin:6px 0 0">${o.ord ? "Ordenado por coluna — clique de novo para inverter, e mais uma vez para voltar à fila." : "Na ordem da fila: primeiro os que já saíram, depois os de número menor — os mais antigos vão para a prestadora antes."}</p>`; })() : ""}
      ${(() => { const fid = prod?.producao?.fornecedorId;
        const f2 = fid ? (S.cad.fornecedores || []).find((x2) => x2.id === fid) : null;
        return f2 ? `<div class="kv" style="margin:0 0 8px"><span>Fornecedor</span><b>${esc(f2.nome)}${f2.prazoDias ? ` · chega em ~${f2.prazoDias} dias` : ""}</b></div>` : ""; })()}
      <div class="secao">Histórico de pedidos</div>
      ${(() => { const ult = historico.filter((r) => r.status === "retornada" && r.retornadaEm)
          .sort((a, b) => String(b.retornadaEm).localeCompare(String(a.retornadaEm)))[0];
        return ult ? `<div class="kv" style="margin:0 0 8px"><span>Última produção conferida</span>
          <b>${fdate(ult.retornadaEm)} · ${n0(ult.qtdConferida ?? ult.qtd)} pçs${ult.prestadora ? ` · ${esc(ult.prestadora)}` : ""}</b></div>` : ""; })()}
      ${historico.length ? `<table class="t" style="font-size:12px"><thead><tr><th>Pedido</th><th>Prestadora</th><th class="num">Qtd</th><th>Etapa</th><th title="Produzido/conferido: data do retorno · Em produção: data do envio · demais: criação">Quando</th></tr></thead>
        <tbody>${historico.map((r) => { const quando = r.status === "retornada" && r.retornadaEm ? { d: r.retornadaEm, t: "conferido em" }
            : (r.status === "enviada" || r.status === "chegou") && r.enviadaEm ? { d: r.enviadaEm, t: "enviado em" }
            : r.separadaEm ? { d: r.separadaEm, t: "cortado em" }
            : { d: r.criadoEm, t: "criado em" };
          return `<tr><td class="sku">${esc(r.numero)}</td><td>${esc(r.prestadora || "—")}</td>
          <td class="num">${n0(r.status === "retornada" ? (r.qtdConferida ?? r.qtd) : r.qtd)}</td><td><span class="tag ${r.status === "retornada" ? "teal" : ""}">${P_LABEL[r.status]}</span></td>
          <td class="mono" style="font-size:11px;white-space:nowrap" title="${quando.t} ${fdate(quando.d)}">${fdate(quando.d)}</td></tr>`; }).join("")}</tbody></table>`
        : `<p class="hint">Nenhum pedido registrado.</p>`}
    </div></aside>`;
}

