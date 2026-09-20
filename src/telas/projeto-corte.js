/* ===========================================================================
   src/telas/projeto-corte.js · A SUB-ABA PROJETO DE CORTE
   ---------------------------------------------------------------------------
   v8.109. A ficha técnica do corte: lista de regras, a ficha embutida e o
   resultado resolvido por SKU. Fala só com `src/corte/projetos.js` e
   `src/corte/fitas.js`.

   O desenho vem do protótipo aprovado (`prototipos/corte/corte.js:271` e
   `:480`): guia dos três níveis no topo, [Regras] [Por SKU], e a ficha em
   cinco seções numeradas.

   COMO O RASCUNHO SOBREVIVE AOS CLIQUES
     O formulário não é controlado — os campos são HTML comum. Mas "Adicionar
     corte" redesenha a tela, e o que estava digitado morreria junto. Por isso
     TODA ação estrutural chama `pjcColher()` antes de mexer: o DOM inteiro
     volta para o rascunho, e só então a estrutura muda. É o mesmo princípio
     do `colherDigitadoDaJanela` dos pedidos.

   A CHAVE ESTÁVEL NÃO APARECE
     Ela é o endereço de cada corte e de cada camada no `name` dos campos, e é
     o que faz renomear e reordenar não quebrarem a herança. Em tela, ninguém
     vê: o que se lê é "Corte 1" ou a identificação que a pessoa escreveu.

   OS MODOS DE HERANÇA
     Cortes:     herda · substitui · ajusta · remove
     Fitilho:    herda · substitui · remove
     Sortimento: herda · substitui · remove

     `ajusta` não existe para fitilho nem para sortimento: os dois são blocos
     de um valor só, e ajustar parcialmente um valor único é substituí-lo.

     `remove` NÃO é `herda`. Herdar é deixar a regra de cima valer; remover é
     dizer "aqui este bloco não existe" — e isso vale contra o herdado.

     Em `ajusta`, a tela mostra a BASE herdada e grava só a diferença, por
     chave. Nenhuma cópia do bloco da família é materializada.
   =========================================================================== */

let PJC_VIEW = { sub: "regras", busca: "", rascunho: null, verSkus: false,
                 verSku: null, verHeranca: false, erro: null, carregou: false };

const PJC_NIVEL = Object.freeze({ familia: 1, combinacao: 2, sku: 3 });
const PJC_NOME  = Object.freeze({ familia: "Família", combinacao: "Combinação", sku: "Exceção do SKU" });
const PJC_CURTO = Object.freeze({ familia: "Família", combinacao: "Combinação", sku: "SKU" });
const PJC_BLOCOS = Object.freeze([["cortes", "Cortes"], ["fitilho", "Fitilho"], ["sortimento", "Sortimento"]]);
const PJC_MODOS_BLOCO = Object.freeze({
  cortes: ["herda", "substitui", "ajusta", "remove"],
  fitilho: ["herda", "substitui", "remove"],
  sortimento: ["herda", "substitui", "remove"],
});
const PJC_MODO_AJUDA = Object.freeze({
  herda: "vem da regra mais geral",
  substitui: "troca o bloco inteiro",
  ajusta: "guarda só a diferença, por corte",
  remove: "zera o que foi herdado",
});
const PJC_TETO = 200;

function pjcGarantirCarga() {
  if (PJC_VIEW.carregou) return;
  PJC_VIEW.carregou = true;
  const tudo = [];
  if (typeof pjCarregar === "function") tudo.push(pjCarregar());
  if (typeof ftCarregar === "function" && typeof ftQuantas === "function" && !ftQuantas()) tudo.push(ftCarregar());
  if (!tudo.length) return;
  Promise.all(tudo).then((rs) => {
    const ruim = rs.find((r) => r && r.status !== "ok");
    PJC_VIEW.erro = ruim ? "Não consegui ler os projetos agora." : null;
    if (ruim) PJC_VIEW.carregou = false;
    render();
  }).catch(() => { PJC_VIEW.carregou = false; });
}

/* ---------------------------------------------------------------------------
   PEDAÇOS DE TEXTO
   --------------------------------------------------------------------------- */
const pjcTag = (escopo, titulo) =>
  `<span class="cr-tag n${PJC_NIVEL[escopo] || 1}"${titulo ? ` title="${esc(titulo)}"` : ""}>${esc(PJC_NOME[escopo] || escopo)}</span>`;

const PJC_OPERADOR = { comeca: "começa com", contem: "contém", igual: "é" };
const pjcCondTxt = (p) => (p.regras || []).map((c) => `${PJC_OPERADOR[c.operador] || c.operador} ${c.valor}`).join(" e ") || "—";

const pjcMedida = (mm) => (mm == null ? "—" : `${String(Number(mm) / 10).replace(".", ",")} cm`);
const pjcNomeFita = (id) => {
  const f = typeof ftAchar === "function" ? ftAchar(id) : null;
  if (!f) return id ? "fita não encontrada" : "sem fita";
  return `${f.numero ? "nº " + f.numero + " · " : ""}${f.nome || ""}`;
};
const pjcTipoNome = (cod) => {
  const t = (typeof pjTipos === "function" ? pjTipos() : []).find((x) => x.codigo === cod);
  return t ? t.rotulo : (cod || "—");
};

/* o que a versão publicada define, em uma linha */
function pjcDefineTxt(p) {
  const v = p.versao;
  if (!v) return `<span class="hint">sem versão publicada</span>`;
  const ms = PJC_BLOCOS.map(([b, n]) => {
    const m = v[b + "Modo"];
    return m && m !== "herda" ? `<span class="cr-tag n${PJC_NIVEL[p.escopo]}" title="${esc(n)}: ${esc(m)}">${esc(n.toLowerCase())}: ${esc(m)}</span>` : "";
  }).filter(Boolean);
  return ms.length ? ms.join(" ") : `<span class="hint">só herda</span>`;
}

const pjcSkus = () => (typeof S !== "undefined" && Array.isArray(S.produtos) ? S.produtos : [])
  .filter((p) => p && p.sku);

/* ---------------------------------------------------------------------------
   A TELA
   --------------------------------------------------------------------------- */
function viewProjetoCorte() {
  pjcGarantirCarga();
  const aviso = (txt, tom) => `<div class="aviso ${tom || ""}">${esc(txt)}</div>`;
  const paradas = typeof pjParadas === "function" ? pjParadas() : [];
  const escrevendo = typeof corteEscreve === "function" ? corteEscreve() : false;

  const guia = `<div class="cr-guia">
    <div class="cr-nivel n1"><b>1 · Família</b><small>a base, herdada por todos os SKUs que casam com a condição</small></div>
    <div class="cr-nivel n2"><b>2 · Combinação</b><small>refina só o que muda</small></div>
    <div class="cr-nivel n3"><b>3 · Exceção do SKU</b><small>só quando aquele SKU foge da regra</small></div>
  </div>`;

  if (PJC_VIEW.rascunho) return `<section class="tela-pjc">${guia}${pjcFicha()}</section>`;
  if (PJC_VIEW.verSku)   return `<section class="tela-pjc">${guia}${pjcResolvido(PJC_VIEW.verSku)}</section>`;

  return `<section class="tela-pjc">
    ${guia}
    <div class="pc-subs">
      <button class="btn sm ${PJC_VIEW.sub === "regras" ? "primary" : ""}" data-pjc="sub" data-v="regras">Regras (${pjQuantos()})</button>
      <button class="btn sm ${PJC_VIEW.sub === "sku" ? "primary" : ""}" data-pjc="sub" data-v="sku">Por SKU (${pjcSkus().length})</button>
    </div>
    <section class="card">
      <div class="card-h"><h2>${PJC_VIEW.sub === "regras" ? "Regras de projeto de corte" : "Projeto de corte por SKU"}</h2>
        <div class="filters" style="border:0;padding:0;margin-left:auto">
          <div class="search">${svg(IC.busca)}<input class="inp" id="q-pjc" style="width:230px"
            placeholder="${PJC_VIEW.sub === "regras" ? "Buscar regra" : "Buscar SKU ou produto"}"
            value="${esc(PJC_VIEW.busca)}" aria-label="Buscar"></div>
          <button class="btn sm" data-pjc="buscar">Buscar</button>
          ${PJC_VIEW.busca ? `<button class="btn sm ghost" data-pjc="limpar">Limpar</button>` : ""}
          ${PJC_VIEW.sub === "regras" ? `<button class="btn primary" data-pjc="nova">${svg(IC.mais)}Nova regra</button>` : ""}
        </div></div>
      ${!escrevendo ? aviso("A gravação do corte está desligada. Dá para cadastrar: o que você salvar fica guardado e vai quando ela for ligada.", "atencao") : ""}
      ${paradas.length ? aviso(`${paradas.length} alteração(ões) esperando decisão: ${paradas.map((p) => p.status).join(", ")}. Nada foi perdido.`, "erro") : ""}
      ${PJC_VIEW.erro ? aviso(PJC_VIEW.erro, "erro") : ""}
      ${PJC_VIEW.sub === "regras" ? pjcTabelaRegras() : pjcTabelaSkus()}
    </section>
  </section>`;
}

function pjcTabelaRegras() {
  const q = String(PJC_VIEW.busca || "").toLowerCase();
  const l = pjLista().filter((p) => !q || `${p.nome} ${pjcCondTxt(p)}`.toLowerCase().includes(q));
  if (!l.length) {
    return `<div class="empty" style="padding:40px">
      <h3>${pjQuantos() ? "Nenhuma regra com esse texto" : "Nenhuma regra"}</h3>
      <p>${pjQuantos() ? "Tente outro termo." : "Comece pela família: uma regra que vale para todos os SKUs que começam com o mesmo código."}</p>
      ${pjQuantos() ? "" : `<button class="btn primary" data-pjc="nova">${svg(IC.mais)}Nova regra</button>`}</div>`;
  }
  const skus = pjcSkus().map((p) => p.sku);
  return `<div class="tw"><table class="t"><thead><tr>
      <th>Nível</th><th>Regra</th><th>Vale para</th><th>Define</th><th>SKUs</th><th></th></tr></thead><tbody>
    ${l.map((p) => {
      const casam = typeof pjQuemCasa === "function" ? pjQuemCasa(p, skus) : [];
      return `<tr>
        <td>${pjcTag(p.escopo)}</td>
        <td><b>${esc(p.nome || "(sem nome)")}</b>${p.versao ? ` <span class="hint">v${esc(String(p.versao.versao))}</span>` : ""}</td>
        <td class="mono">${esc(pjcCondTxt(p))}</td>
        <td>${pjcDefineTxt(p)}</td>
        <td>${casam.length ? `${casam.length}` : `<span class="hint">nenhum</span>`}</td>
        <td><button class="btn sm" data-pjc="editar" data-v="${esc(p.id)}">${svg(IC.editar)}Editar</button></td>
      </tr>`;
    }).join("")}
  </tbody></table></div>`;
}

function pjcTabelaSkus() {
  const q = String(PJC_VIEW.busca || "").toLowerCase();
  const l = pjcSkus().filter((p) => !q || `${p.sku} ${p.descricao || ""} ${p.categoria || ""}`.toLowerCase().includes(q));
  if (!l.length) return `<div class="empty" style="padding:40px"><h3>Nenhum produto</h3>
    <p>${pjcSkus().length ? "Tente outro termo." : "O cadastro de produtos está vazio."}</p></div>`;

  const origem = (res, b) => {
    const o = res.origem && res.origem[b];
    return o ? pjcOrigemChip(o) : `<span class="hint">—</span>`;
  };
  return `<div class="tw"><table class="t"><thead><tr>
      <th>SKU</th><th>Produto</th><th>Projeto de corte</th>
      <th>Cortes</th><th>Fitilho</th><th>Sortimento</th><th></th></tr></thead><tbody>
    ${l.slice(0, PJC_TETO).map((p) => {
      const res = pjResolver(p.sku);
      const tem = crtTemProjeto(res);
      return `<tr>
        <td class="mono"><b>${esc(p.sku)}</b></td>
        <td>${esc(p.descricao || "")}${p.categoria ? `<div class="hint">${esc(p.categoria)}</div>` : ""}</td>
        <td>${tem ? esc(pjcResumo(res)) : `<span class="hint">sem regra que case</span>`}</td>
        <td>${origem(res, "cortes")}</td><td>${origem(res, "fitilho")}</td><td>${origem(res, "sortimento")}</td>
        <td>${tem ? `<button class="btn sm" data-pjc="ver-sku" data-v="${esc(p.sku)}">${svg(IC.olho || IC.busca)}Ver projeto</button>` : ""}</td>
      </tr>`;
    }).join("")}
  </tbody></table>
  ${l.length > PJC_TETO ? `<div class="hint" style="padding:0 14px 16px">Mostrando ${PJC_TETO} de ${l.length} — use a busca.</div>` : ""}</div>`;
}

/* campo que não se aplica não entra no resumo */
const pjcResumo = (res) => [
  res.cortes && res.cortes.length ? `${res.cortes.length} corte${res.cortes.length > 1 ? "s" : ""}` : "",
  res.fitilho ? `fitilho ${pjcMedida(res.fitilho.comprimentoMm)}${Number(res.fitilho.partes) === 2 ? " × 2" : ""}` : "",
  res.sortimento && res.sortimento.modo === "sortido" ? "sortido" : "",
].filter(Boolean).join(" · ");

/* ---------------------------------------------------------------------------
   O RESULTADO RESOLVIDO · origem por bloco e a cadeia inteira
   --------------------------------------------------------------------------- */
/* `semAcoes` é o modo JANELA: a mesma ficha, aberta por cima de um pedido que
   está sendo criado. Ali o "← Voltar" e o "Abrir regra" levariam para a tela de
   Processos, e o rascunho do pedido ficaria atrás de uma navegação que ninguém
   pediu — na janela quem fecha é o Fechar dela. */
function pjcResolvido(sku, semAcoes) {
  const res = pjResolver(sku);
  const prod = pjcSkus().find((p) => p.sku === sku);
  const bloco = (b, nome, corpo) => {
    const o = res.origem && res.origem[b];
    return `<section class="cr-bloco"><h3>${esc(nome)}
      ${o ? pjcOrigemChip(o) : ""}</h3>${corpo}</section>`;
  };
  /* remover é uma decisão, não ausência: quando um bloco foi removido por uma
     regra mais específica, a ficha diz isso em vez de simplesmente não
     desenhar nada. */
  const removido = (b, nome) => {
    const o = res.origem && res.origem[b];
    if (!o || o.modo !== "remove") return "";
    return `<section class="cr-bloco"><h3>${esc(nome)} ${pjcOrigemChip(o)}</h3>
      <div class="hint">Removido de propósito por <b>${esc(o.nome || "")}</b> — não é herança vazia.</div></section>`;
  };

  return `<div class="pjc-topo">
      ${semAcoes ? "" : `<button class="btn sm" data-pjc="voltar">← Voltar</button>`}
      <h2 class="mono">${esc(sku)}</h2><span class="hint">${esc((prod && prod.descricao) || "")}</span>
      <button class="btn sm ghost" style="margin-left:auto" data-pjc="heranca">${PJC_VIEW.verHeranca ? "Esconder herança" : "Ver herança"}</button>
    </div>
    <section class="card" style="padding:14px">
    ${!crtTemProjeto(res) ? `<div class="empty" style="padding:30px"><h3>Sem projeto de corte</h3>
        <p>Nenhuma regra casa com este SKU. Crie uma regra de família ou uma exceção só dele.</p></div>` : `
      ${bloco("cortes", "Cortes", (res.cortes || []).length
        ? `<div class="cr-cortes">${res.cortes.map((c, i) => pjcCardCorte(c, i)).join("")}</div>`
        : `<div class="hint">Nenhum corte.</div>`)}
      ${removido("fitilho", "Fitilho")}${removido("sortimento", "Sortimento")}
      ${res.fitilho ? bloco("fitilho", "Fitilho", `<div class="cr-fitilho"><b>${Number(res.fitilho.partes) === 2
          ? `2 × ${pjcMedida(res.fitilho.comprimentoMm)}` : `${pjcMedida(res.fitilho.comprimentoMm)} · inteiro`}</b>
        <div class="hint">fita nº 1 · corte reto (fixos)</div></div>`) : ""}
      ${res.sortimento && res.sortimento.modo === "sortido" ? bloco("sortimento", "Sortimento",
        `<div class="cr-sort"><b>Sortido / PR</b>
          <div class="cr-sort-l">${(res.sortimento.itens || []).map((i) => `<span class="cr-pill">${esc(String(i.qtd))} ${esc(String(i.genero).toLowerCase())}</span>`).join("") || `<span class="hint">sem composição</span>`}</div>
          ${res.sortimento.variedade ? `<div class="hint">Variedade: <b>${esc(res.sortimento.variedade)}</b></div>` : ""}
          <div class="hint">Sortimento não muda a geometria do corte.</div></div>`) : ""}
      ${PJC_VIEW.verHeranca ? pjcHeranca(res, semAcoes) : ""}`}
    </section>`;
}

/* "SKU · ajusta Combinação": diz de quem é a decisão e sobre o que ela agiu.
   `herdadoDe` vem do resolvedor (crtResolver) quando o modo é ajusta. */
function pjcOrigemChip(o) {
  if (!o) return "";
  const base = o.modo === "ajusta" && o.herdadoDe ? pjAchar(o.herdadoDe) : null;
  const extra = o.modo === "ajusta" ? ` · ajusta${base ? " " + (PJC_CURTO[base.escopo] || "") : ""}`
    : o.modo === "remove" ? " · remove" : "";
  return `<span class="cr-tag n${PJC_NIVEL[o.escopo] || 1}" title="Regra: ${esc(o.nome || "")}">${esc(PJC_CURTO[o.escopo] || o.escopo)}${esc(extra)}</span>`;
}

function pjcCardCorte(c, i) {
  const f = typeof ftAchar === "function" ? ftAchar(c.fitaId) : null;
  return `<article class="cr-corte">
    <div class="cr-corte-h"><span class="pf-num">${i + 1}</span>
      <b>${esc(c.identificacao || `Corte ${i + 1}`)}</b>
      <span class="cr-med">${pjcMedida(c.comprimentoMm)}${Number(c.qtd) > 1 ? ` · ${c.qtd} partes` : ""}</span></div>
    <div class="cr-lin"><div><b>${esc(pjcNomeFita(c.fitaId))}</b>
      <div class="hint">${f ? `${esc(f.cor || "")} · ${esc(f.estampa || "")} · <span class="mono">${esc(f.codigo || "")}</span>${f.local ? " · " + esc(f.local) : ""}` : "escolha uma fita do cadastro"}</div></div>
      <span class="cr-tc">${esc(pjcTipoNome(c.tipoCorte))}</span></div>
    ${(c.camadas || []).map((m, j) => `<div class="cr-camada">
      <div class="cr-cam-h">Fita sobreposta ${(c.camadas.length > 1 ? j + 1 : "")} · mesmo corte</div>
      <div class="cr-lin"><div><b>${esc(pjcNomeFita(m.fitaId))}</b>
        <div class="hint">${m.comprimentoMm == null ? "mesmo comprimento do corte" : pjcMedida(m.comprimentoMm)} · ${esc(pjcTipoNome(m.tipoCorte))} · ${m.cortarJuntas !== false ? "cortar juntas" : "cortar separado"}</div></div></div>
      ${m.condicao ? `<div class="cr-cond">${esc(m.condicao)}</div>` : ""}</div>`).join("")}
  </article>`;
}

function pjcHeranca(res, semAcoes) {
  if (!res.cadeia || !res.cadeia.length) return `<section class="cr-bloco"><h3>Herança</h3><div class="hint">Nenhuma regra casa com este SKU.</div></section>`;
  return `<section class="cr-bloco cr-heranca"><h3>Herança deste SKU</h3>
    <ol class="cr-cad">${res.cadeia.map((c) => {
      const define = PJC_BLOCOS.filter(([b]) => c.modos && c.modos[b] && c.modos[b] !== "herda");
      const venceu = define.filter(([b]) => res.origem[b] && res.origem[b].projetoId === c.projetoId).map(([, n]) => n.toLowerCase());
      const perdeu = define.filter(([b]) => !res.origem[b] || res.origem[b].projetoId !== c.projetoId).map(([, n]) => n.toLowerCase());
      return `<li>${pjcTag(c.escopo)} <b>${esc(c.nome || "")}</b>
        ${c.versao ? `<span class="hint">v${esc(String(c.versao))}</span>` : ""}
        <div>${define.map(([b, n]) => `<span class="cr-tag n${PJC_NIVEL[c.escopo]}">${esc(n.toLowerCase())}: ${esc(c.modos[b])}</span>`).join(" ") || `<span class="hint">só herda</span>`}</div>
        <div>${venceu.length ? `vale: <b>${venceu.join(", ")}</b>` : ""}${perdeu.length ? ` <span class="hint">· substituído em ${perdeu.join(", ")} por regra mais específica</span>` : ""}</div>
        ${semAcoes ? "" : `<button class="btn sm ghost" data-pjc="editar" data-v="${esc(c.projetoId)}">Abrir regra</button>`}</li>`;
    }).join("")}</ol></section>`;
}

/* ---------------------------------------------------------------------------
   A FICHA · cinco seções, como no protótipo
   --------------------------------------------------------------------------- */
function pjcFicha() {
  const r = PJC_VIEW.rascunho;
  const skus = pjcSkus().map((p) => p.sku);
  const casam = typeof crtCasa === "function"
    ? skus.filter((s) => crtCasa({ regras: pjParaRegras(r), ativo: true }, s)) : [];

  const modoSeg = (b, nome) => {
    const atual = (r.modo && r.modo[b]) || "herda";
    const opcoes = PJC_MODOS_BLOCO[b].slice();
    if (!opcoes.includes(atual)) opcoes.push(atual);        /* remove/ajusta que já vieram do banco */
    return `<div class="pjc-bloco">
      <b>${esc(nome)}</b>
      <div class="seg" role="group" aria-label="Modo de ${esc(nome)}">
        ${opcoes.map((m) => `<button type="button" class="${atual === m ? "on" : ""}" data-pjc="modo" data-v="${b}" data-k="${m}"
          title="${esc(PJC_MODO_AJUDA[m] || "")}">${esc(m)}</button>`).join("")}
      </div>
      <small class="hint">${esc(PJC_MODO_AJUDA[atual] || "")}</small></div>`;
  };

  return `<form class="pjc-form card" data-pjc-form style="padding:14px">
    <div class="pjc-topo">
      <button type="button" class="btn sm" data-pjc="voltar">← Voltar</button>
      <h2>${r.novo ? "Nova regra de projeto de corte" : esc(r.nome || "Regra")}</h2>
      ${r.versaoAtual ? `<span class="hint">versão publicada v${esc(String(r.versaoAtual))}</span>` : ""}
    </div>
    ${PJC_VIEW.erro ? `<div class="aviso erro">${esc(PJC_VIEW.erro)}</div>` : ""}

    <label class="fld"><span>Nome da regra</span>
      <input class="inp" name="r|nome" value="${esc(r.nome || "")}" placeholder="Ex.: Família M02 · laço borboleta"></label>

    <section class="cr-sec"><h3>1 · Para quem vale</h3>
      <div class="seg" role="group" aria-label="Nível da regra">
        ${["familia", "combinacao", "sku"].map((k) => `<button type="button" class="${r.escopo === k ? "on" : ""}" data-pjc="escopo" data-v="${k}">${esc(PJC_NOME[k])}</button>`).join("")}</div>
      <p class="hint">${r.escopo === "familia" ? "A base: tudo que casar com a condição herda esta regra."
        : r.escopo === "combinacao" ? "Refinamento: mais de uma condição juntas, para um recorte dentro da família."
        : "Exceção: vale só para um SKU e ganha de qualquer regra mais geral."}</p>
      ${r.escopo === "sku"
        ? `<label class="fld" style="max-width:280px"><span>SKU</span>
            <input class="inp mono" name="sku|valor" value="${esc((r.regras[0] && r.regras[0].valor) || "")}" placeholder="Ex.: 470"></label>`
        : `<div class="cr-conds">${(r.regras || []).map((c, i) => `<div class="cr-cond-l">
              <span class="cr-cond-n">SKU</span>
              <select class="sel" name="cond|${i}|operador">
                <option value="comeca" ${c.operador === "comeca" ? "selected" : ""}>começa com</option>
                <option value="contem" ${c.operador === "contem" ? "selected" : ""}>contém</option></select>
              <input class="inp mono" name="cond|${i}|valor" value="${esc(c.valor || "")}" placeholder="Ex.: M02">
              <button type="button" class="btn sm ghost" data-pjc="cond-del" data-v="${i}" ${r.regras.length > 1 ? "" : "disabled"}>remover</button>
            </div>`).join("")}
            <button type="button" class="btn sm" data-pjc="cond-add">${svg(IC.mais)}Adicionar condição</button></div>`}
      <div class="cr-afeta">${casam.length
        ? `<b>${casam.length} SKU${casam.length > 1 ? "s serão afetados" : " será afetado"}</b>
           <button type="button" class="btn sm ghost" data-pjc="ver-skus">${PJC_VIEW.verSkus ? "Esconder" : "Ver lista"}</button>
           ${PJC_VIEW.verSkus ? `<div class="cr-skus">${casam.slice(0, 60).map((s) => `<span class="cr-pill mono">${esc(s)}</span>`).join("")}</div>` : ""}`
        : `<span class="hint">Nenhum SKU casa com esta condição ainda.</span>`}</div>
    </section>

    <section class="cr-sec"><h3>2 · O que esta regra define</h3>
      <p class="hint">O que estiver em <b>herda</b> continua vindo da regra mais geral. Um SKU pode herdar o fitilho da família e ter cortes só dele.</p>
      <div class="pjc-blocos">${PJC_BLOCOS.map(([b, n]) => modoSeg(b, n)).join("")}</div>
    </section>

    ${pjcSecCortes(r)}
    ${pjcSecFitilho(r)}
    ${pjcSecSortimento(r)}

    <div class="fita-acoes">
      <button type="button" class="btn primary" data-pjc="salvar">Salvar regra</button>
      <button type="button" class="btn" data-pjc="voltar">Cancelar</button>
      ${r.novo ? "" : `<button type="button" class="btn sm perigo" data-pjc="arquivar" data-v="${esc(r.id)}">Arquivar</button>`}
    </div>
  </form>`;
}

function pjcOpcoesFita(sel) {
  const fitas = typeof ftLista === "function" ? ftLista() : [];
  return `<option value="">— escolha a fita —</option>` + fitas.map((f) =>
    `<option value="${esc(f.id)}" ${f.id === sel ? "selected" : ""}>${esc((f.numero ? "nº " + f.numero + " · " : "") + (f.nome || "") + (f.codigo ? " · " + f.codigo : ""))}</option>`).join("");
}
const pjcOpcoesTipo = (sel) => (typeof pjTipos === "function" ? pjTipos() : [])
  .map((t) => `<option value="${esc(t.codigo)}" ${t.codigo === sel ? "selected" : ""}>${esc(t.rotulo)}</option>`).join("");

function pjcSecCortes(r) {
  const modo = (r.modo && r.modo.cortes) || "herda";
  if (modo === "herda" || modo === "remove") {
    return `<section class="cr-sec"><h3>3 · Cortes</h3>
      <p class="hint">${modo === "herda" ? "Em <b>herda</b>: os cortes vêm da regra mais geral, sem nada gravado aqui."
        : "Em <b>remove</b>: esta regra <b>apaga</b> os cortes herdados. É diferente de herdar — aqui o SKU fica sem corte de propósito."}</p></section>`;
  }
  if (modo === "ajusta") return pjcSecAjuste(r);
  return `<section class="cr-sec"><h3>3 · Cortes</h3>
    <p class="hint"><b>Outro corte</b> = outra peça física. <b>Fita no mesmo corte</b> = sobreposição: as fitas ficam em camadas e podem ser cortadas juntas.</p>
    ${(r.cortes || []).length ? (r.cortes || []).map((c, i) => pjcEdCorte(c, i, r.cortes.length)).join("") : `<div class="hint">Nenhum corte ainda.</div>`}
    <div class="as-botoes" style="margin-top:10px">
      <button type="button" class="btn primary" data-pjc="ct-add">${svg(IC.mais)}${(r.cortes || []).length ? "Adicionar outro corte" : "Adicionar corte"}</button></div>
  </section>`;
}

/* ---------------------------------------------------------------------------
   AJUSTE · edita OPERAÇÕES sobre as chaves herdadas. O que se vê é a base que
   vem da regra mais geral; o que se grava é só a diferença. Campo em branco
   quer dizer "mantém o herdado", e o herdado aparece como placeholder para
   ninguém precisar adivinhar o que está mantendo.
   --------------------------------------------------------------------------- */
function pjcSecAjuste(r) {
  const skus = pjcSkus().map((p) => p.sku);
  const sku = pjSkuExemplo(r, skus);
  const base = pjBaseHerdada(r, sku);
  const ops = r.cortes || [];
  const novos = ops.filter((o) => o.operacao === "acrescenta");

  if (!sku) return `<section class="cr-sec"><h3>3 · Cortes <span class="cr-tag n2">ajusta</span></h3>
    <div class="aviso atencao">Nenhum SKU casa com esta condição ainda, então não há base herdada para ajustar.
      Escreva a condição primeiro.</div></section>`;
  if (!base.cortes.length && !novos.length) return `<section class="cr-sec"><h3>3 · Cortes <span class="cr-tag n2">ajusta</span></h3>
    <div class="aviso atencao">A regra mais geral não define nenhum corte para <b class="mono">${esc(sku)}</b>,
      então não há o que ajustar. Use <b>substitui</b> para definir os cortes aqui.</div></section>`;

  return `<section class="cr-sec"><h3>3 · Cortes <span class="cr-tag n2">ajusta</span></h3>
    <p class="hint">Esta regra <b>não copia</b> os cortes da regra mais geral: ela guarda só o que muda,
      por corte. Campo em branco continua vindo de cima.
      <br>Base calculada a partir do SKU <b class="mono">${esc(sku)}</b>${base.origem.cortes ? ` · cortes de <b>${esc(base.origem.cortes.nome || "")}</b>` : ""}.</p>
    ${base.cortes.map((c, i) => pjcAjusteCorte(c, i, pjOpDe(ops, c.chave))).join("")}
    ${novos.map((o, i) => pjcAjusteNovo(o, base.cortes.length + i)).join("")}
    <div class="as-botoes" style="margin-top:10px">
      <button type="button" class="btn primary" data-pjc="aj-add">${svg(IC.mais)}Acrescentar corte novo</button></div>
  </section>`;
}

const PJC_ESTADOS = [["manter", "Manter"], ["substitui", "Ajustar"], ["remove", "Remover"]];

function pjcAjusteCorte(c, i, op) {
  const estado = op ? (op.operacao === "remove" ? "remove" : "substitui") : "manter";
  const herdado = `${esc(pjcNomeFita(c.fitaId))} · ${pjcMedida(c.comprimentoMm)} · ${esc(pjcTipoNome(c.tipoCorte))}${Number(c.qtd) > 1 ? " · " + c.qtd + " partes" : ""}`;
  const barra = `<div class="seg" role="group" aria-label="O que fazer com este corte">
    ${PJC_ESTADOS.map(([k, n]) => `<button type="button" class="${estado === k ? "on" : ""}" data-pjc="aj-estado" data-v="${esc(c.chave)}" data-k="${k}" data-j="${i + 1}">${n}</button>`).join("")}</div>`;

  if (estado !== "substitui") {
    return `<article class="cr-ed-corte ${estado === "remove" ? "pjc-removido" : ""}">
      <div class="cr-ed-h"><span class="pf-num">${i + 1}</span>
        <b>${esc(c.identificacao || `Corte ${i + 1}`)}</b>
        <span class="hint">${herdado}</span>
        <span style="margin-left:auto">${barra}</span></div>
      ${estado === "remove" ? `<div class="hint">Este corte herdado <b>não sai</b> para quem casar com esta regra.</div>` : ""}
    </article>`;
  }

  const o = op;
  return `<article class="cr-ed-corte">
    <div class="cr-ed-h"><span class="pf-num">${i + 1}</span>
      <b>${esc(c.identificacao || `Corte ${i + 1}`)}</b>
      <span class="hint">herdado: ${herdado}</span>
      <span style="margin-left:auto">${barra}</span></div>
    <div class="cr-ed-g">
      <label class="fld"><span>Fita</span><select class="sel" name="ct|${esc(c.chave)}|fitaId">
        <option value="">— mantém a herdada —</option>${pjcOpcoesFita(o.fitaId).replace(/^<option value="">[^<]*<\/option>/, "")}</select></label>
      <label class="fld"><span>Comprimento</span><div class="pc-un-w">
        <input class="inp" inputmode="decimal" name="ct|${esc(c.chave)}|comprimentoCm" value="${esc(o.comprimentoCm || "")}"
          placeholder="${esc(pjcMedida(c.comprimentoMm))}"><span class="pc-un">cm</span></div></label>
      <label class="fld"><span>Tipo de corte</span><select class="sel" name="ct|${esc(c.chave)}|tipoCorte">
        <option value="">— mantém: ${esc(pjcTipoNome(c.tipoCorte))} —</option>${pjcOpcoesTipo(o.tipoCorte)}</select></label>
    </div>
    <div class="cr-ed-g">
      <label class="fld"><span>Identificação</span>
        <input class="inp" name="ct|${esc(c.chave)}|identificacao" value="${esc(o.identificacao || "")}" placeholder="${esc(c.identificacao || "mantém a herdada")}"></label>
      <label class="fld"><span>Partes iguais</span>
        <input class="inp" style="width:90px" inputmode="numeric" name="ct|${esc(c.chave)}|qtd" value="${esc(String(o.qtd == null ? "" : o.qtd))}" placeholder="${esc(String(c.qtd == null ? 1 : c.qtd))}"></label>
    </div>
    ${pjcAjusteCamadas(c, o)}
  </article>`;
}

/* as camadas herdadas, com as mesmas três decisões, pela chave delas */
function pjcAjusteCamadas(c, op) {
  const ops = op.camadas || [];
  const novas = ops.filter((m) => m.operacao === "acrescenta");
  const herdadas = (c.camadas || []).map((m, j) => {
    const mo = pjOpDe(ops, m.chave);
    const estado = mo ? (mo.operacao === "remove" ? "remove" : "substitui") : "manter";
    const barra = `<div class="seg" role="group">${PJC_ESTADOS.map(([k, n]) =>
      `<button type="button" class="${estado === k ? "on" : ""}" data-pjc="aj-cm-estado" data-v="${esc(c.chave)}" data-k="${esc(m.chave)}" data-j="${k}">${n}</button>`).join("")}</div>`;
    const cab = `<div class="cr-cam-h">Fita sobreposta ${(c.camadas.length > 1 ? j + 1 : "")} · ${esc(pjcNomeFita(m.fitaId))}
      <span style="margin-left:auto">${barra}</span></div>`;
    if (estado !== "substitui") return `<div class="cr-ed-cam ${estado === "remove" ? "pjc-removido" : ""}">${cab}
      ${estado === "remove" ? `<div class="hint">Esta camada herdada não sai.</div>` : ""}</div>`;
    return `<div class="cr-ed-cam">${cab}
      <div class="cr-ed-g">
        <label class="fld"><span>Fita</span><select class="sel" name="cm|${esc(c.chave)}|${esc(m.chave)}|fitaId">
          <option value="">— mantém a herdada —</option>${pjcOpcoesFita(mo.fitaId).replace(/^<option value="">[^<]*<\/option>/, "")}</select></label>
        <label class="fld"><span>Comprimento</span><div class="pc-un-w">
          <input class="inp" inputmode="decimal" name="cm|${esc(c.chave)}|${esc(m.chave)}|comprimentoCm" value="${esc(mo.comprimentoCm || "")}"
            placeholder="${esc(m.comprimentoMm == null ? "igual ao corte" : pjcMedida(m.comprimentoMm))}"><span class="pc-un">cm</span></div></label>
        <label class="fld"><span>Cortar juntas</span><select class="sel" name="cm|${esc(c.chave)}|${esc(m.chave)}|cortarJuntas">
          <option value="" ${mo.cortarJuntas === "" ? "selected" : ""}>— mantém: ${m.cortarJuntas !== false ? "juntas" : "separado"} —</option>
          <option value="true" ${mo.cortarJuntas === true ? "selected" : ""}>Cortar juntas</option>
          <option value="false" ${mo.cortarJuntas === false ? "selected" : ""}>Cortar separado</option></select></label>
      </div></div>`;
  }).join("");

  return `${herdadas}
    ${novas.map((m) => `<div class="cr-ed-cam">
      <div class="cr-cam-h">Fita sobreposta <b>nova</b>
        <button type="button" class="btn sm ghost" style="margin-left:auto" data-pjc="aj-cm-del" data-v="${esc(c.chave)}" data-k="${esc(m.chave)}">${svg(IC.lixeira)}</button></div>
      <div class="cr-ed-g">
        <label class="fld"><span>Fita</span><select class="sel" name="cm|${esc(c.chave)}|${esc(m.chave)}|fitaId">${pjcOpcoesFita(m.fitaId)}</select></label>
        <label class="fld"><span>Comprimento</span><div class="pc-un-w">
          <input class="inp" inputmode="decimal" name="cm|${esc(c.chave)}|${esc(m.chave)}|comprimentoCm" value="${esc(m.comprimentoCm || "")}" placeholder="igual ao corte"><span class="pc-un">cm</span></div></label>
        <label class="fld"><span>Cortar juntas</span><select class="sel" name="cm|${esc(c.chave)}|${esc(m.chave)}|cortarJuntas">
          <option value="true" ${m.cortarJuntas !== false ? "selected" : ""}>Cortar juntas</option>
          <option value="false" ${m.cortarJuntas === false ? "selected" : ""}>Cortar separado</option></select></label>
      </div></div>`).join("")}
    <div class="as-botoes">
      <button type="button" class="btn sm" data-pjc="aj-cm-add" data-v="${esc(c.chave)}">${svg(IC.mais)}Acrescentar fita ao mesmo corte</button></div>`;
}

/* corte que NASCE no ajuste: aqui não há herdado, então vai completo */
function pjcAjusteNovo(o, i) {
  return `<article class="cr-ed-corte pjc-novo">
    <div class="cr-ed-h"><span class="pf-num">${i + 1}</span><b>Corte novo</b>
      <span class="cr-tag n2">acrescenta</span>
      <button type="button" class="btn sm ghost" style="margin-left:auto" data-pjc="aj-del" data-v="${esc(o.chave)}">${svg(IC.lixeira)}</button></div>
    <div class="cr-ed-g">
      <label class="fld"><span>Fita</span><select class="sel" name="ct|${esc(o.chave)}|fitaId">${pjcOpcoesFita(o.fitaId)}</select></label>
      <label class="fld"><span>Comprimento</span><div class="pc-un-w">
        <input class="inp" inputmode="decimal" name="ct|${esc(o.chave)}|comprimentoCm" value="${esc(o.comprimentoCm || "")}" placeholder="Ex.: 20"><span class="pc-un">cm</span></div></label>
      <label class="fld"><span>Tipo de corte</span><select class="sel" name="ct|${esc(o.chave)}|tipoCorte">${pjcOpcoesTipo(o.tipoCorte || "reto")}</select></label>
    </div>
    <label class="fld"><span>Identificação</span>
      <input class="inp" name="ct|${esc(o.chave)}|identificacao" value="${esc(o.identificacao || "")}" placeholder="Opcional"></label>
  </article>`;
}

function pjcEdCorte(c, i, total) {
  return `<article class="cr-ed-corte">
    <div class="cr-ed-h"><span class="pf-num">${i + 1}</span><b>${esc(c.identificacao || `Corte ${i + 1}`)}</b>
      <div class="bc-acoes">
        <button type="button" class="btn sm ghost" data-pjc="ct-mv" data-v="${esc(c.chave)}" data-k="-1" ${i ? "" : "disabled"}>↑</button>
        <button type="button" class="btn sm ghost" data-pjc="ct-mv" data-v="${esc(c.chave)}" data-k="1" ${i < total - 1 ? "" : "disabled"}>↓</button>
        <button type="button" class="btn sm ghost" data-pjc="ct-del" data-v="${esc(c.chave)}">${svg(IC.lixeira)}</button></div></div>
    <div class="cr-ed-g">
      <label class="fld"><span>Fita</span><select class="sel" name="ct|${esc(c.chave)}|fitaId">${pjcOpcoesFita(c.fitaId)}</select></label>
      <label class="fld"><span>Comprimento</span><div class="pc-un-w">
        <input class="inp" inputmode="decimal" name="ct|${esc(c.chave)}|comprimentoCm" value="${esc(c.comprimentoCm || "")}" placeholder="Ex.: 20"><span class="pc-un">cm</span></div></label>
      <label class="fld"><span>Tipo de corte</span><select class="sel" name="ct|${esc(c.chave)}|tipoCorte">${pjcOpcoesTipo(c.tipoCorte)}</select></label>
    </div>
    <div class="cr-ed-g">
      <label class="fld"><span>Identificação (onde entra na peça)</span>
        <input class="inp" name="ct|${esc(c.chave)}|identificacao" value="${esc(c.identificacao || "")}" placeholder="Opcional · Ex.: Laço liso"></label>
      <label class="fld"><span>Partes iguais</span>
        <input class="inp" style="width:90px" inputmode="numeric" name="ct|${esc(c.chave)}|qtd" value="${esc(String(c.qtd == null ? 1 : c.qtd))}"></label>
    </div>
    <div class="as-botoes">
      <button type="button" class="btn sm" data-pjc="cm-add" data-v="${esc(c.chave)}">${svg(IC.mais)}Adicionar fita ao mesmo corte</button></div>
    ${(c.camadas || []).map((m, j) => pjcEdCamada(c, m, j)).join("")}
  </article>`;
}

function pjcEdCamada(c, m, j) {
  return `<div class="cr-ed-cam">
    <div class="cr-cam-h">Fita sobreposta ${c.camadas.length > 1 ? j + 1 : ""} · mesmo corte
      <button type="button" class="btn sm ghost" style="margin-left:auto" data-pjc="cm-del" data-v="${esc(c.chave)}" data-k="${esc(m.chave)}">${svg(IC.lixeira)}</button></div>
    <div class="cr-ed-g">
      <label class="fld"><span>Fita</span><select class="sel" name="cm|${esc(c.chave)}|${esc(m.chave)}|fitaId">${pjcOpcoesFita(m.fitaId)}</select></label>
      <label class="fld"><span>Comprimento</span><div class="pc-un-w">
        <input class="inp" inputmode="decimal" name="cm|${esc(c.chave)}|${esc(m.chave)}|comprimentoCm" value="${esc(m.comprimentoCm || "")}" placeholder="igual ao corte"><span class="pc-un">cm</span></div></label>
      <label class="fld"><span>Tipo de corte</span><select class="sel" name="cm|${esc(c.chave)}|${esc(m.chave)}|tipoCorte">${pjcOpcoesTipo(m.tipoCorte)}</select></label>
    </div>
    <label class="selbar-chk"><input type="checkbox" name="cm|${esc(c.chave)}|${esc(m.chave)}|cortarJuntas" ${m.cortarJuntas !== false ? "checked" : ""}> Cortar juntas (as duas fitas saem no mesmo corte)</label>
    <label class="fld"><span>Condição de uso</span>
      <input class="inp" name="cm|${esc(c.chave)}|${esc(m.chave)}|condicao" value="${esc(m.condicao || "")}" placeholder="Opcional · Ex.: só quando a fita nº 12 for lisa"></label>
  </div>`;
}

function pjcSecFitilho(r) {
  const modo = (r.modo && r.modo.fitilho) || "herda";
  if (modo !== "substitui") {
    return `<section class="cr-sec"><h3>4 · Fitilho</h3>
      <p class="hint">${modo === "herda" ? "Em <b>herda</b>: o fitilho vem da regra mais geral." : "Em <b>remove</b>: esta regra tira o fitilho herdado."}</p></section>`;
  }
  const fl = r.fitilho || { partes: 1, comprimentoCm: "" };
  return `<section class="cr-sec"><h3>4 · Fitilho</h3>
    <p class="hint">O fitilho é sempre <b>fita nº 1</b> e <b>corte reto</b>. Não se escolhe fita nem tipo — só se usa e quanto.</p>
    <div class="seg" role="group" aria-label="Inteiro ou partes">
      <button type="button" class="${Number(fl.partes) === 2 ? "" : "on"}" data-pjc="fl-partes" data-v="1">Inteiro</button>
      <button type="button" class="${Number(fl.partes) === 2 ? "on" : ""}" data-pjc="fl-partes" data-v="2">2 partes</button></div>
    <label class="fld" style="max-width:260px"><span>${Number(fl.partes) === 2 ? "Medida de cada parte" : "Comprimento"}</span>
      <div class="pc-un-w"><input class="inp" inputmode="decimal" name="fl|comprimentoCm" value="${esc(fl.comprimentoCm || "")}" placeholder="Ex.: 70"><span class="pc-un">cm</span></div></label>
  </section>`;
}

function pjcSecSortimento(r) {
  const modo = (r.modo && r.modo.sortimento) || "herda";
  if (modo !== "substitui") {
    return `<section class="cr-sec"><h3>5 · Sortimento</h3>
      <p class="hint">${modo === "herda" ? "Em <b>herda</b>: o sortimento vem da regra mais geral." : "Em <b>remove</b>: esta regra zera o sortimento herdado."}</p></section>`;
  }
  const st = r.sortimento || { modo: "exato", variedade: "", itens: [] };
  return `<section class="cr-sec"><h3>5 · Sortimento</h3>
    <p class="hint">Sortimento é a <b>mistura da caixa</b> — não é geometria. Mudar aqui não muda comprimento nem tipo de corte.</p>
    <div class="seg" role="group" aria-label="Tipo de sortimento">
      <button type="button" class="${st.modo === "exato" ? "on" : ""}" data-pjc="st-modo" data-v="exato">Exato</button>
      <button type="button" class="${st.modo === "sortido" ? "on" : ""}" data-pjc="st-modo" data-v="sortido">Sortido / PR</button></div>
    ${st.modo !== "sortido" ? `<div class="hint">Cada peça sai igual.</div>` : `
      <div class="cr-st-l">${(st.itens || []).map((x) => `<div class="cr-st-i">
        <input class="inp" style="width:70px" inputmode="numeric" name="sc|${esc(x.genero)}|qtd" value="${esc(String(x.qtd))}" aria-label="Quantidade">
        <span>${esc(x.genero)}</span>
        <button type="button" class="btn sm ghost" data-pjc="sc-del" data-v="${esc(x.genero)}">remover</button></div>`).join("")}</div>
      <div class="as-botoes">${["macho", "neutro", "femea"].filter((g) => !(st.itens || []).some((x) => x.genero === g))
        .map((g) => `<button type="button" class="btn sm" data-pjc="sc-add" data-v="${g}">${svg(IC.mais)}${g}</button>`).join("")}</div>
      <label class="fld" style="max-width:240px;margin-top:10px"><span>Variedade</span>
        <select class="sel" name="st|variedade"><option value="">—</option>
          ${["liso", "estampado", "misto"].map((v) => `<option ${st.variedade === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>`}
  </section>`;
}

/* ---------------------------------------------------------------------------
   COLHER · o DOM inteiro volta para o rascunho antes de qualquer ação que
   redesenhe. Sem isto, "Adicionar corte" apagaria o que estava digitado.
   --------------------------------------------------------------------------- */
function pjcColher() {
  const r = PJC_VIEW.rascunho;
  const f = document.querySelector("[data-pjc-form]");
  if (!r || !f) return;
  const acharCorte = (ch) => (r.cortes || []).find((c) => c.chave === ch);
  for (const el of f.querySelectorAll("[name]")) {
    const p = String(el.name).split("|");
    const v = el.type === "checkbox" ? el.checked : el.value;
    if (p[0] === "r" && p[1] === "nome") r.nome = v;
    else if (p[0] === "sku") { r.regras = [{ campo: "sku", operador: "igual", valor: v }]; }
    else if (p[0] === "cond") { const c = r.regras[Number(p[1])]; if (c) c[p[2]] = v; }
    else if (p[0] === "ct") { const c = acharCorte(p[1]); if (c) c[p[2]] = v; }
    else if (p[0] === "cm") { const c = acharCorte(p[1]);
      const m = c && (c.camadas || []).find((x) => x.chave === p[2]);
      /* no ajuste, "cortar juntas" vem de um select de três estados: ""
         mantém o herdado, "true"/"false" trocam. Sem esta conversão o texto
         "false" chegaria ao modelo como verdadeiro. */
      if (m) m[p[3]] = (p[3] === "cortarJuntas" && el.tagName === "SELECT")
        ? (v === "" ? "" : v === "true") : v; }
    else if (p[0] === "fl") { r.fitilho = Object.assign({ partes: 1 }, r.fitilho, { [p[1]]: v }); }
    else if (p[0] === "st") { r.sortimento = Object.assign({ modo: "sortido", itens: [] }, r.sortimento, { [p[1]]: v }); }
    else if (p[0] === "sc") { const x = ((r.sortimento || {}).itens || []).find((y) => y.genero === p[1]); if (x) x.qtd = Number(v) || 0; }
  }
}

/* ---------------------------------------------------------------------------
   OS CLIQUES
   --------------------------------------------------------------------------- */
async function pjcClique(alvo) {
  const a = alvo.dataset.pjc, v = alvo.dataset.v, k = alvo.dataset.k;
  const r = PJC_VIEW.rascunho;
  const redesenha = () => { render(); return true; };

  if (a === "sub")    { PJC_VIEW.sub = v; PJC_VIEW.busca = ""; return redesenha(); }
  if (a === "buscar" || a === "limpar") {
    const campo = document.getElementById("q-pjc");
    PJC_VIEW.busca = a === "limpar" ? "" : String((campo && campo.value) || "").trim();
    return redesenha();
  }
  if (a === "nova")    { PJC_VIEW.rascunho = pjNovo("familia"); PJC_VIEW.erro = null; return redesenha(); }
  if (a === "editar")  { const p = pjAchar(v); if (!p) return true;
    PJC_VIEW.rascunho = pjRascunhoDe(p); PJC_VIEW.verSku = null; PJC_VIEW.erro = null; return redesenha(); }
  if (a === "voltar")  { PJC_VIEW.rascunho = null; PJC_VIEW.verSku = null; PJC_VIEW.erro = null; return redesenha(); }
  if (a === "ver-sku") { PJC_VIEW.verSku = v; PJC_VIEW.verHeranca = false; return redesenha(); }
  if (a === "heranca") { PJC_VIEW.verHeranca = !PJC_VIEW.verHeranca; return redesenha(); }
  if (a === "ver-skus"){ pjcColher(); PJC_VIEW.verSkus = !PJC_VIEW.verSkus; return redesenha(); }

  if (!r) return false;
  pjcColher();                       /* daqui para baixo, tudo redesenha */

  if (a === "escopo") {
    r.escopo = v;
    if (v === "sku" && (!r.regras.length || r.regras.length > 1)) r.regras = [{ campo: "sku", operador: "igual", valor: (r.regras[0] || {}).valor || "" }];
    if (v !== "sku" && r.regras.length === 1 && r.regras[0].operador === "igual") r.regras[0].operador = "comeca";
    return redesenha();
  }
  if (a === "modo")     {
    const antes = (r.modo || {})[v];
    r.modo = Object.assign({}, r.modo, { [v]: k });
    /* substitui guarda RECEITA; ajusta guarda OPERAÇÃO. A mesma lista de
       cortes significaria coisas diferentes nos dois, então trocar entre eles
       limpa — em silêncio seria pior: a pessoa salvaria a família inteira
       achando que ajustou um comprimento. */
    if (v === "cortes" && antes !== k && (antes === "ajusta" || k === "ajusta") && (r.cortes || []).length) {
      r.cortes = [];
      toast("Os cortes foram limpos: substituir guarda a receita inteira, ajustar guarda só a diferença.", "aviso");
    }
    if (v === "fitilho" && k === "substitui" && !r.fitilho) r.fitilho = { partes: 1, comprimentoCm: "" };
    if (v === "sortimento" && k === "substitui" && !r.sortimento) r.sortimento = { modo: "exato", variedade: "", itens: [] };
    return redesenha(); }
  if (a === "cond-add") { r.regras.push({ campo: "sku", operador: "comeca", valor: "" }); return redesenha(); }
  if (a === "cond-del") { r.regras.splice(Number(v), 1); return redesenha(); }
  if (a === "ct-add")   { r.cortes.push(pjNovoCorte()); return redesenha(); }
  if (a === "ct-del")   { r.cortes = r.cortes.filter((c) => c.chave !== v); return redesenha(); }
  if (a === "ct-mv")    {
    const i = r.cortes.findIndex((c) => c.chave === v), j = i + Number(k);
    if (i >= 0 && j >= 0 && j < r.cortes.length) { const t = r.cortes[i]; r.cortes[i] = r.cortes[j]; r.cortes[j] = t; }
    return redesenha();
  }
  if (a === "cm-add")   { const c = r.cortes.find((x) => x.chave === v); if (c) c.camadas.push(pjNovaCamada()); return redesenha(); }

  /* ---- ajuste: operações por chave herdada ---- */
  if (a === "aj-estado") {
    const i = (r.cortes || []).findIndex((o) => o.chave === v);
    if (k === "manter") { if (i >= 0) r.cortes.splice(i, 1); }
    else if (i >= 0) { r.cortes[i].operacao = k; }
    else r.cortes.push(pjNovaOpCorte(v, k, Number(alvo.dataset.j) || 0));
    return redesenha();
  }
  if (a === "aj-add") {
    const skus = pjcSkus().map((p) => p.sku);
    const base = pjBaseHerdada(r, pjSkuExemplo(r, skus));
    r.cortes.push(pjNovaOpCorte(null, "acrescenta", base.cortes.length + (r.cortes || []).length + 1));
    return redesenha();
  }
  if (a === "aj-del")    { r.cortes = (r.cortes || []).filter((o) => o.chave !== v); return redesenha(); }
  if (a === "aj-cm-estado") {
    const estado = alvo.dataset.j;
    let op = pjOpDe(r.cortes, v);
    if (!op) { op = pjNovaOpCorte(v, "substitui", 0); r.cortes.push(op); }
    op.camadas = op.camadas || [];
    const i = op.camadas.findIndex((m) => m.chave === k);
    if (estado === "manter") { if (i >= 0) op.camadas.splice(i, 1); }
    else if (i >= 0) { op.camadas[i].operacao = estado; }
    else op.camadas.push(pjNovaOpCamada(k, estado, 0));
    return redesenha();
  }
  if (a === "aj-cm-add") {
    let op = pjOpDe(r.cortes, v);
    if (!op) { op = pjNovaOpCorte(v, "substitui", 0); r.cortes.push(op); }
    op.camadas = (op.camadas || []).concat([pjNovaOpCamada(null, "acrescenta", (op.camadas || []).length + 1)]);
    return redesenha();
  }
  if (a === "aj-cm-del") {
    const op = pjOpDe(r.cortes, v);
    if (op) op.camadas = (op.camadas || []).filter((m) => m.chave !== k);
    return redesenha();
  }
  if (a === "cm-del")   { const c = r.cortes.find((x) => x.chave === v);
    if (c) c.camadas = c.camadas.filter((m) => m.chave !== k); return redesenha(); }
  if (a === "fl-partes"){ r.fitilho = Object.assign({ comprimentoCm: "" }, r.fitilho, { partes: Number(v) }); return redesenha(); }
  if (a === "st-modo")  { r.sortimento = Object.assign({ variedade: "", itens: [] }, r.sortimento, { modo: v }); return redesenha(); }
  if (a === "sc-add")   { r.sortimento = r.sortimento || { modo: "sortido", itens: [] };
    r.sortimento.itens = (r.sortimento.itens || []).concat([{ genero: v, qtd: 1 }]); return redesenha(); }
  if (a === "sc-del")   { r.sortimento.itens = (r.sortimento.itens || []).filter((x) => x.genero !== v); return redesenha(); }

  if (a === "salvar") {
    const res = await pjSalvar(r);
    if (res.status === "invalido") { PJC_VIEW.erro = res.motivo; return redesenha(); }
    if (res.status === "ok") {
      PJC_VIEW.erro = null; PJC_VIEW.rascunho = null; PJC_VIEW.carregou = false;
      toast(res.material ? "Regra salva — versão nova publicada." : "Regra salva. Nada mudou na receita, então não houve versão nova.");
    } else if (res.status === "na-fila") {
      PJC_VIEW.erro = null; PJC_VIEW.rascunho = null;
      toast("Guardado aqui. Vai para o servidor quando a gravação do corte for ligada.", "aviso");
    } else if (res.status === "conflito") {
      PJC_VIEW.erro = `Alguém alterou esta regra antes (revisão ${res.revision}). Recarregue e refaça — a sua alteração continua guardada.`;
      toast("Conflito: nada foi perdido.", "erro");
    } else {
      PJC_VIEW.erro = `O servidor não confirmou (${String(res.status || "erro")}). A alteração continua guardada.`;
      toast("Não confirmado. A alteração ficou guardada.", "erro");
    }
    return redesenha();
  }

  if (a === "arquivar") {
    if (!confirm(`Arquivar a regra "${r.nome}"? Ela para de valer para novos pedidos; os pedidos já feitos não mudam.`)) return true;
    const res = await pjArquivar(v);
    if (res.status === "ok") { PJC_VIEW.rascunho = null; PJC_VIEW.carregou = false; toast("Regra arquivada."); }
    else if (res.status === "na-fila") { PJC_VIEW.rascunho = null; toast("Guardado aqui. Vai quando a gravação for ligada.", "aviso"); }
    else toast(`Não consegui arquivar (${res.status}).`, "erro");
    return redesenha();
  }
  return false;
}
