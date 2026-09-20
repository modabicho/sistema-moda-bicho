/* ===========================================================================
   src/telas/fitas.js · A ABA FITAS
   ---------------------------------------------------------------------------
   v8.107. A biblioteca de fitas: lista, busca, cadastro e correção. Fala só
   com `src/corte/fitas.js` — nenhuma linha daqui conhece PostgREST.

   DUAS ESCOLHAS QUE EXPLICAM O RESTO

   1. O formulário NÃO é controlado. Os campos são HTML comum e só são lidos
      quando a pessoa manda salvar. Um formulário controlado redesenharia a
      tela a cada tecla — foi o que causou o piscar do protótipo — e exigiria
      mexer nos despachantes de input do app inteiro. Aqui o estado da tela é
      só: o que está aberto, o texto buscado e o último erro.

   2. A busca filtra a lista já carregada. O índice de busca do servidor existe
      (147) e entra quando a biblioteca passar do que cabe na memória da tela.
      Enquanto forem centenas de fitas, ir ao servidor a cada letra seria pior.

   O QUE A TELA PRECISA DIZER, SEMPRE
     · quando `corte_escrita` está desligada, a alteração fica GUARDADA, não
       perdida — e a tela diz isso em vez de fingir que gravou;
     · quando o servidor recusou (conflito, em uso, reuso), a ação continua na
       fila e aparece como aviso. Ninguém descobre uma gravação perdida depois.
   =========================================================================== */

let FITA_VIEW = { busca: "", aberta: null, erro: null, carregou: false };

/* A aba abre e busca a lista uma vez. `render()` de novo no fim porque a
   chegada da lista muda a tela — e a tela já está desenhada quando ela chega. */
function fitaGarantirCarga() {
  if (FITA_VIEW.carregou) return;
  FITA_VIEW.carregou = true;
  if (typeof ftCarregar !== "function") return;
  ftCarregar().then((r) => {
    if (r.status === "ok") { FITA_VIEW.erro = null; }
    else {
      /* não consegui agora (sem sessão, sem rede): deixa a próxima abertura
         tentar de novo, em vez de a aba ficar vazia para sempre */
      FITA_VIEW.erro = "Não consegui ler o cadastro de fitas agora.";
      FITA_VIEW.carregou = false;
    }
    render();
  }).catch(() => { FITA_VIEW.carregou = false; });
}

const fitaMedida = (mm) => (mm == null || mm === "" ? "" : `${Number(mm) / 10}`.replace(".", ",") + " cm");

function viewFitas() {
  fitaGarantirCarga();
  const lista = ftBuscar(FITA_VIEW.busca);
  const total = ftQuantas();
  const paradas = typeof ftParadas === "function" ? ftParadas() : [];
  const guardadas = typeof cxPendentes === "function" ? cxPendentes().length : 0;
  const escrevendo = typeof corteEscreve === "function" ? corteEscreve() : false;

  const aviso = (txt, tom) => `<div class="aviso ${tom || ""}">${esc(txt)}</div>`;

  const linha = (f) => `<tr data-fita="abrir" data-id="${esc(f.id)}" class="${FITA_VIEW.aberta === f.id ? "on" : ""}">
    <td>${esc(f.codigo || "—")}</td>
    <td><b>${esc(f.nome || "")}</b>${f.ref ? ` <span class="sub">${esc(f.ref)}</span>` : ""}</td>
    <td>${esc(f.numero || "")}</td>
    <td>${esc(fitaMedida(f.larguraMm))}</td>
    <td>${esc(f.cor || "")}</td>
    <td>${esc(f.local || "")}</td>
    <td>${esc(f.fornecedor || "")}</td>
  </tr>`;

  const campo = (nome, rot, valor, extra) =>
    `<label class="fld"><span>${esc(rot)}</span>
      <input class="inp" name="${nome}" value="${esc(valor == null ? "" : String(valor))}" ${extra || ""}></label>`;

  const form = () => {
    const nova = FITA_VIEW.aberta === "nova";
    const f = nova ? {} : (ftAchar(FITA_VIEW.aberta) || {});
    return `<form class="fita-form" data-fita-form>
      <h3>${nova ? "Nova fita" : "Fita " + esc(f.nome || "")}</h3>
      ${FITA_VIEW.erro ? aviso(FITA_VIEW.erro, "erro") : ""}
      <div class="fita-grade">
        ${campo("codigo", "Código do fornecedor", f.codigo)}
        ${campo("nome", "Nome", f.nome, "required")}
        ${campo("ref", "Referência", f.ref)}
        ${campo("numero", "Número", f.numero)}
        ${campo("larguraCm", "Largura (cm)", f.larguraMm == null ? "" : String(Number(f.larguraMm) / 10).replace(".", ","), 'inputmode="decimal"')}
        ${campo("cor", "Cor", f.cor)}
        <label class="fld"><span>Tipo</span>
          <select class="inp" name="estampa">
            <option value="lisa" ${f.estampa !== "estampada" ? "selected" : ""}>Lisa</option>
            <option value="estampada" ${f.estampa === "estampada" ? "selected" : ""}>Estampada</option>
          </select></label>
        ${campo("fornecedor", "Fornecedor", f.fornecedor)}
        ${campo("classe", "Classificação interna", f.classe)}
        ${campo("local", "Localização", f.local)}
      </div>
      <label class="fld"><span>Observações</span>
        <textarea class="inp" name="obs" rows="2">${esc(f.obs || "")}</textarea></label>
      ${f.fotoPath ? "" : `<p class="sub">Sem foto. A foto da fita entra com a importação de catálogo.</p>`}
      <div class="fita-acoes">
        <button type="button" class="btn sm primary" data-fita="salvar">Salvar</button>
        <button type="button" class="btn sm" data-fita="fechar">Cancelar</button>
        ${nova ? "" : `<button type="button" class="btn sm perigo" data-fita="apagar" data-id="${esc(f.id)}">Excluir</button>`}
      </div>
    </form>`;
  };

  return `<section class="tela-fitas">
    <div class="barra">
      <input id="q-fita" name="q-fita" class="inp" placeholder="código, nome, cor, número, lugar…"
             value="${esc(FITA_VIEW.busca)}">
      <button class="btn sm" data-fita="buscar">Buscar</button>
      ${FITA_VIEW.busca ? `<button class="btn sm ghost" data-fita="limpar">Limpar</button>` : ""}
      <button class="btn sm primary" data-fita="nova">+ Nova fita</button>
      <span class="hint">${lista.length === total ? `${total} fitas` : `${lista.length} de ${total}`}</span>
    </div>

    ${!escrevendo && guardadas
      ? aviso(`A gravação do corte está desligada: ${guardadas} alteração(ões) guardada(s) aqui no navegador. Elas vão sozinhas quando a gravação for ligada.`, "atencao")
      : ""}
    ${!escrevendo && !guardadas
      ? aviso("A gravação do corte está desligada. Dá para cadastrar: o que você salvar fica guardado e vai quando ela for ligada.", "atencao")
      : ""}
    ${paradas.length
      ? aviso(`${paradas.length} alteração(ões) esperando decisão: ${paradas.map((p) => p.status).join(", ")}. Nada foi perdido — abra a fita e salve de novo com o valor certo.`, "erro")
      : ""}
    ${FITA_VIEW.erro && !FITA_VIEW.aberta ? aviso(FITA_VIEW.erro, "erro") : ""}

    ${FITA_VIEW.aberta ? form() : ""}

    ${lista.length ? `<table class="lista fitas">
      <thead><tr><th>Código</th><th>Nome</th><th>Nº</th><th>Largura</th><th>Cor</th><th>Local</th><th>Fornecedor</th></tr></thead>
      <tbody>${lista.map(linha).join("")}</tbody></table>`
      : `<p class="hint">${total ? "Nenhuma fita com esse texto." : "Nenhuma fita cadastrada ainda."}</p>`}
  </section>`;
}

/* ---------------------------------------------------------------------------
   OS CLIQUES · um ponto de entrada só, chamado por acoes/clique.js.
   --------------------------------------------------------------------------- */
function fitaLerForm() {
  const f = document.querySelector("[data-fita-form]");
  if (!f) return null;
  const v = (n) => {
    const el = f.elements[n];
    return el ? String(el.value || "").trim() : "";
  };
  const cm = v("larguraCm").replace(",", ".");
  return {
    codigo: v("codigo"), nome: v("nome") || v("codigo"), ref: v("ref"), numero: v("numero"),
    larguraMm: cm === "" ? null : Math.round(Number(cm) * 10),
    cor: v("cor"), estampa: v("estampa") || "lisa", fornecedor: v("fornecedor"),
    classe: v("classe"), local: v("local"), obs: v("obs"),
  };
}

/* quais campos a pessoa mexeu: é o que fica anotado em `editado`, para a
   importação de catálogo (v8.108+) não passar por cima do que foi corrigido */
function fitaCamposMexidos(antes, agora) {
  const mexidos = [];
  for (const k of Object.keys(agora)) {
    const a = antes ? antes[k] : null;
    const b = agora[k];
    const vazio = (x) => x == null || x === "";
    if (vazio(a) && vazio(b)) continue;
    if (String(a == null ? "" : a) !== String(b == null ? "" : b)) mexidos.push(k);
  }
  return mexidos;
}

async function fitaClique(alvo) {
  const acao = alvo.dataset.fita;

  if (acao === "buscar" || acao === "limpar") {
    const campo = document.getElementById("q-fita");
    FITA_VIEW.busca = acao === "limpar" ? "" : String((campo && campo.value) || "").trim();
    render();
    return true;
  }
  if (acao === "nova")   { FITA_VIEW.aberta = "nova"; FITA_VIEW.erro = null; render(); return true; }
  if (acao === "fechar") { FITA_VIEW.aberta = null;   FITA_VIEW.erro = null; render(); return true; }
  if (acao === "abrir") {
    FITA_VIEW.aberta = alvo.dataset.id; FITA_VIEW.erro = null; render(); return true;
  }

  if (acao === "salvar") {
    const dados = fitaLerForm();
    if (!dados) return true;
    const nova = FITA_VIEW.aberta === "nova";
    const antes = nova ? null : ftAchar(FITA_VIEW.aberta);
    const fita = Object.assign({}, antes || {}, dados);
    if (!nova) fita.id = FITA_VIEW.aberta;

    const r = await ftSalvar(fita, fitaCamposMexidos(antes, dados));
    if (r.status === "invalido") { FITA_VIEW.erro = r.motivo; render(); return true; }
    if (r.status === "ok")      { FITA_VIEW.erro = null; FITA_VIEW.aberta = null; toast("Fita salva."); }
    else if (r.status === "na-fila") {
      FITA_VIEW.erro = null; FITA_VIEW.aberta = null;
      toast("Guardado aqui. Vai para o servidor quando a gravação do corte for ligada.", "aviso");
    }
    else if (r.status === "conflito") {
      FITA_VIEW.erro = `Alguém alterou esta fita antes (revisão ${r.revision}). Recarregue e refaça a sua alteração — ela continua guardada.`;
      toast("Conflito: nada foi perdido.", "erro");
    }
    else {
      FITA_VIEW.erro = `O servidor não confirmou (${esc(String(r.status || "erro"))}). A alteração continua guardada.`;
      toast("Não confirmado. A alteração ficou guardada.", "erro");
    }
    render();
    return true;
  }

  if (acao === "apagar") {
    const f = ftAchar(alvo.dataset.id);
    if (!f) return true;
    if (!confirm(`Excluir a fita "${f.nome}"? Ela sai da lista, mas continua no histórico de quem já a usou.`)) return true;
    const r = await ftApagar(f.id);
    if (r.status === "ok") { FITA_VIEW.aberta = null; toast("Fita excluída."); }
    else if (r.status === "em-uso") toast(`Esta fita está em ${r.quantos} corte(s) e por isso não pode ser excluída.`, "erro");
    else if (r.status === "na-fila") { FITA_VIEW.aberta = null; toast("Guardado aqui. Vai quando a gravação for ligada.", "aviso"); }
    else toast(`Não consegui excluir (${r.status}).`, "erro");
    render();
    return true;
  }
  return false;
}
