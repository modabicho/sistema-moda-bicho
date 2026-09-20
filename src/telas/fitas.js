/* ===========================================================================
   src/telas/fitas.js · A ÁREA FITAS, DENTRO DE PROCESSOS
   ---------------------------------------------------------------------------
   v8.108. Não é tela principal: é a segunda sub-aba de Processos, e a barra de
   sub-abas mora em `src/telas/processos.js`. Aqui fica o miolo.

   O desenho vem do protótipo aprovado (`prototipos/corte/corte.js:330`), não
   de um desenho novo: cartões em grade, busca única, o bloco de ajuda que
   explica o que é a biblioteca, e o cadeado marcando o que é dado nosso.

   Fala só com `src/corte/fitas.js` — nenhuma linha daqui conhece PostgREST.

   DUAS ESCOLHAS QUE EXPLICAM O RESTO

   1. O formulário NÃO é controlado. Os campos são HTML comum e só são lidos
      quando a pessoa manda salvar. Controlado, redesenharia a tela a cada
      tecla — o piscar do protótipo — e exigiria mexer nos despachantes de
      input do app inteiro.

   2. A busca filtra a lista já carregada. O índice de busca do servidor existe
      (147) e entra quando a biblioteca passar do que cabe na memória da tela.

   O QUE A TELA PRECISA DIZER, SEMPRE
     · com `corte_escrita` desligada, a alteração fica GUARDADA, não perdida;
     · quando o servidor recusou, a ação continua na fila e aparece como aviso.
   =========================================================================== */

let FITA_VIEW = { busca: "", aberta: null, erro: null, carregou: false };

/* teto de cartões desenhados de uma vez: o protótipo parou em 48 e a busca
   resolve o resto. Desenhar mil cartões trava a rolagem sem ajudar ninguém. */
const FITA_TETO = 48;

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
const fitaSemAcento = (x) => String(x == null ? "" : x).toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "");

/* A foto pertence à fita, e ainda não existe bucket. Até lá, a cor e a estampa
   desenham uma — é o mesmo recurso do protótipo, e diz mais que um quadrado
   cinza igual para todas. */
const FITA_COR_HEX = Object.freeze({ vermelho: "#c0392b", rosa: "#d6608f", azul: "#2f6fb5",
  verde: "#2e8b57", bege: "#c8a96a", neutro: "#8a8f98", preto: "#333", amarelo: "#d8a90f",
  branco: "#e8e8e8", lilas: "#9b7ede" });
const fitaCorHex = (f) => FITA_COR_HEX[fitaSemAcento(f && f.cor)] || "#8a8f98";
const fitaFoto = (f) => `<span class="cr-foto g" style="--c:${fitaCorHex(f)}" data-est="${esc(f.estampa || "lisa")}"
  role="img" aria-label="Fita ${esc(f.cor || "")} ${esc(f.estampa || "")}"></span>`;

function cardFita(f) {
  const linha2 = [fitaMedida(f.larguraMm), f.cor, f.estampa].filter(Boolean).join(" · ");
  return `<article class="cr-fita">${fitaFoto(f)}
    <div class="cr-fita-b">
      <b>${f.numero ? `nº ${esc(f.numero)} · ` : ""}${esc(f.nome || "")}</b>
      ${linha2 ? `<div class="hint">${esc(linha2)}</div>` : ""}
      <div class="cr-fita-m">
        <span class="mono" title="Código oficial do fornecedor${f.fornecedor ? " · " + esc(f.fornecedor) : ""}">${esc(f.codigo || "—")}</span>
        ${f.origem === "catalogo" ? `<span class="cr-tag n2" title="Veio do catálogo${f.fornecedor ? " da " + esc(f.fornecedor) : ""}">catálogo</span>` : ""}
        <span class="cr-int" title="Classificação interna — dado nosso, nenhuma importação sobrescreve">${svg(IC.cadeado)}${esc(f.classe || "—")}</span>
        <span class="cr-int" title="Localização física — dado nosso, nenhuma importação sobrescreve">${svg(IC.cadeado)}${esc(f.local || "—")}</span>
      </div>
      <div class="cr-fita-a">
        <button class="btn sm" data-fita="abrir" data-id="${esc(f.id)}">${svg(IC.editar)}Editar</button>
      </div>
    </div></article>`;
}

function viewFitasArea() {
  fitaGarantirCarga();
  const lista = ftBuscar(FITA_VIEW.busca);
  const total = ftQuantas();
  const paradas = typeof ftParadas === "function" ? ftParadas() : [];
  const guardadas = typeof cxPendentes === "function" ? cxPendentes().length : 0;
  const escrevendo = typeof corteEscreve === "function" ? corteEscreve() : false;
  const aviso = (txt, tom) => `<div class="aviso ${tom || ""}">${esc(txt)}</div>`;

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
      <p class="hint">Sem foto. A foto da fita chega com a importação de catálogo.</p>
      <div class="fita-acoes">
        <button type="button" class="btn sm primary" data-fita="salvar">Salvar</button>
        <button type="button" class="btn sm" data-fita="fechar">Cancelar</button>
        ${nova ? "" : `<button type="button" class="btn sm perigo" data-fita="apagar" data-id="${esc(f.id)}">Excluir</button>`}
      </div>
    </form>`;
  };

  return `<section class="card">
    <div class="card-h"><h2>Cadastro de fitas</h2>
      <div class="filters" style="border:0;padding:0;margin-left:auto">
        <div class="search">${svg(IC.busca)}<input class="inp" id="q-fita" style="width:280px"
          placeholder="Buscar por número, nome, cor, código ou lugar"
          value="${esc(FITA_VIEW.busca)}" aria-label="Buscar fita"></div>
        <button class="btn sm" data-fita="buscar">Buscar</button>
        ${FITA_VIEW.busca ? `<button class="btn sm ghost" data-fita="limpar">Limpar</button>` : ""}
        <button class="btn primary" data-fita="nova">${svg(IC.mais)}Nova fita</button>
      </div></div>

    <div class="cr-ajuda">Esta é a <b>biblioteca de referências</b>: o que está aqui só sai quando
      você mandar excluir — fechar a janela ou recarregar a página não apaga nada.
      A receita de corte <b>referencia</b> a fita, não copia. O <b>código do fornecedor</b> é
      preservado como origem; <b>classificação</b>, <b>localização</b> e <b>observações</b> são
      dados nossos e nenhuma importação os sobrescreve.</div>

    ${!escrevendo ? aviso(guardadas
      ? `A gravação do corte está desligada: ${guardadas} alteração(ões) guardada(s) aqui no navegador. Elas vão sozinhas quando a gravação for ligada.`
      : "A gravação do corte está desligada. Dá para cadastrar: o que você salvar fica guardado e vai quando ela for ligada.", "atencao") : ""}
    ${paradas.length ? aviso(`${paradas.length} alteração(ões) esperando decisão: ${paradas.map((p) => p.status).join(", ")}. Nada foi perdido — abra a fita e salve de novo com o valor certo.`, "erro") : ""}
    ${FITA_VIEW.erro && !FITA_VIEW.aberta ? aviso(FITA_VIEW.erro, "erro") : ""}

    ${FITA_VIEW.aberta ? `<div style="padding:0 14px">${form()}</div>` : ""}

    ${lista.length ? `<div class="cr-fitas">${lista.slice(0, FITA_TETO).map(cardFita).join("")}</div>
      ${lista.length > FITA_TETO ? `<div class="hint" style="padding:0 14px 16px">Mostrando ${FITA_TETO} de ${lista.length} fitas — use a busca para achar a que você quer.</div>` : ""}`
      : `<div class="empty" style="padding:36px">
          <h3>${total ? "Nenhuma fita com esse texto" : "Nenhuma fita cadastrada"}</h3>
          <p>${total ? "Busque por “9”, “gorgurão”, “azul”, “GX-00” ou “prateleira”."
                     : "Cadastre a primeira à mão em <b>Nova fita</b>. A importação de catálogo chega em uma versão próxima."}</p>
        </div>`}
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
   importação de catálogo não passar por cima do que foi corrigido */
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
  if (acao === "abrir")  { FITA_VIEW.aberta = alvo.dataset.id; FITA_VIEW.erro = null; render(); return true; }

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
