/* ===========================================================================
   src/telas/importar-fita.js · A JANELA DA IMPORTAÇÃO
   ---------------------------------------------------------------------------
   O percurso inteiro numa janela só, em passos visíveis:

     escolher → recortar → conferir → salvar

   O passo "recortar" nunca some: mesmo quando o automático acerta, a caixa
   continua ali para ser arrastada. Um recorte automático que não pode ser
   corrigido é pior que nenhum.

   NADA daqui grava sozinho. `imfSalvar` só entra no último clique, e só leva
   o que estiver MARCADO na conferência.

   PDF não é recortado aqui — ele sobe como catálogo de origem e é aberto pelo
   visualizador do navegador. Está dito na própria tela, para ninguém procurar
   um botão que não existe.
   =========================================================================== */

/* a imagem carregada vive fora do `S.modal`: bitmap não é estado de tela e não
   deve viajar em clone nenhum */
let IMF_IMG = null;

async function imfEscolherArquivo(arquivo) {
  const m = S.modal;
  if (!m || m.tipo !== "importarFita") return;

  const ruim = typeof foConferirArquivo === "function" ? foConferirArquivo(arquivo) : null;
  if (ruim) { m.erro = ruim.motivo; render(); return; }

  m.erro = null;
  m.nomeArquivo = arquivo.name;
  m.tipoArquivo = arquivo.type;

  /* PDF: guarda como catálogo e para por aí — sem prévia recortável */
  if (String(arquivo.type).toLowerCase() === "application/pdf") {
    m.passo = "pdf";
    m.subindo = true; render();
    const r = await foGuardarCatalogo(arquivo);
    m.subindo = false;
    if (r.status === "ok") { m.catalogoPath = r.caminho; m.erro = null; }
    else m.erro = r.motivo || `Não consegui guardar o PDF (${r.status}).`;
    render();
    return;
  }

  try {
    const lido = await imfLer(arquivo);
    IMF_IMG = lido.img;
    m.arquivoOriginal = arquivo;
    m.dataUrl = lido.dataUrl;
    m.larg = lido.img.naturalWidth; m.alt = lido.img.naturalHeight;
    const auto = imfAutoRecorte(lido.img);
    m.caixa = auto.caixa;
    m.autoAchou = auto.achou;
    m.autoMotivo = auto.motivo || null;
    m.passo = "recortar";
  } catch (e) {
    m.erro = String((e && e.message) || e);
    m.passo = "escolher";
  }
  render();
}

/* ---------------------------------------------------------------------------
   PASSO 2 · o recorte. A caixa é desenhada em porcentagem sobre a prévia, e os
   quatro números são editáveis à mão: arrastar é bom para ajustar, digitar é
   melhor para repetir o mesmo enquadramento em dez fotos do mesmo catálogo.
   --------------------------------------------------------------------------- */
function imfViewRecorte(m) {
  const c = m.caixa || { x: 0, y: 0, w: m.larg, h: m.alt };
  const pc = (v, total) => (total ? (v / total) * 100 : 0);
  return `
    <div class="aviso ${m.autoAchou ? "" : "amber"}" style="margin:0 0 12px">
      ${m.autoAchou
        ? `<b>Recorte automático aplicado.</b> Confira e ajuste se precisar — a fita tem de caber inteira, com uma folga.`
        : `<b>Não consegui recortar sozinho${m.autoMotivo ? ` (${esc(m.autoMotivo)})` : ""}.</b> A imagem está inteira; ajuste a área à mão.`}
    </div>
    <div class="imf-palco">
      <img src="${esc(m.dataUrl)}" alt="prévia">
      <div class="imf-caixa" style="left:${pc(c.x, m.larg)}%;top:${pc(c.y, m.alt)}%;
        width:${pc(c.w, m.larg)}%;height:${pc(c.h, m.alt)}%"></div>
    </div>
    <div class="imf-num">
      ${["x", "y", "w", "h"].map((k) => `<label class="fld"><span>${k.toUpperCase()}</span>
        <input class="inp num" type="number" min="0" data-imf-caixa="${k}" value="${Math.round(c[k])}"></label>`).join("")}
    </div>
    <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px">
      <button class="btn sm" data-imf="auto">${svg(IC.atualizar)}Recortar de novo</button>
      <button class="btn sm ghost" data-imf="inteira">Usar a imagem inteira</button>
    </div>`;
}

/* ---------------------------------------------------------------------------
   PASSO 3 · a conferência. Uma linha por campo: o que está lá, o que foi
   proposto, e a caixinha que decide. Campo corrigido à mão vem DESMARCADO e
   com o aviso — é a promessa que o módulo inteiro faz.
   --------------------------------------------------------------------------- */
function imfViewConferencia(m) {
  const cf = m.conferencia;
  if (!cf) return "";
  const manuais = cf.campos.filter((c) => c.manual).length;
  return `
    <div class="aviso" style="margin:0 0 12px">
      ${cf.nova
        ? `<b>Fita nova.</b> Nada será sobrescrito — ela ainda não existe no cadastro.`
        : `<b>Casou com a fita "${esc(cf.fita.nome || "")}"</b> pelo ${esc(cf.casadaPor)}. Só entra o que você marcar.`}
      <div class="hint" style="margin-top:4px">Sugestões tiradas do ${esc(cf.origemDaSugestao)} — não há leitura de texto na imagem. Confira tudo.</div>
    </div>
    ${manuais ? `<div class="aviso amber" style="margin:0 0 12px">
      <b>${manuais === 1 ? "1 campo foi corrigido à mão" : manuais + " campos foram corrigidos à mão"}.</b>
      ${manuais === 1 ? "Ele vem" : "Eles vêm"} desmarcado${manuais === 1 ? "" : "s"}: a importação não desfaz correção de ninguém sem que alguém mande.</div>` : ""}
    ${!cf.campos.length ? `<div class="hint">Não consegui propor nenhum campo a partir deste arquivo. Você pode subir a foto mesmo assim e preencher a ficha à mão.</div>`
    : `<table class="t" style="font-size:12.5px">
      <thead><tr><th style="width:26px"></th><th>Campo</th><th>Está</th><th>Proposto</th></tr></thead>
      <tbody>${cf.campos.map((c, i) => `<tr class="${c.manual ? "imf-manual" : ""}">
        <td><input type="checkbox" class="chk" data-imf-aplicar="${i}" ${c.aplicar ? "checked" : ""}
          ${c.igual ? "disabled" : ""}></td>
        <td><b>${esc(c.rotulo)}</b>${c.aviso ? `<div class="hint" style="color:var(--amber)">${esc(c.aviso)}</div>` : ""}</td>
        <td class="${c.atual == null ? "hint" : ""}">${c.atual == null ? "vazio" : esc(String(c.atual))}</td>
        <td><b>${esc(String(c.proposto))}</b>${c.igual ? ` <span class="hint">(igual)</span>` : ""}</td>
      </tr>`).join("")}</tbody></table>`}
    <label style="display:flex;gap:9px;align-items:flex-start;cursor:pointer;margin-top:12px">
      <input type="checkbox" class="chk" data-imf="anexar-foto" ${m.anexarFoto !== false ? "checked" : ""} style="margin-top:2px">
      <span>Anexar a imagem recortada como <b>foto desta fita</b></span></label>`;
}

function viewImportarFita(m) {
  const passo = m.passo || "escolher";
  const titulo = { escolher: "Importar fita", recortar: "Recortar a imagem",
                   conferir: "Conferir antes de gravar", pdf: "Catálogo em PDF" }[passo] || "Importar fita";
  const trilha = ["escolher", "recortar", "conferir"];
  return `<div class="ov" data-fechar="1"><div class="modal" style="max-width:min(680px, 96vw)" role="dialog" aria-label="Importar fita">
    <div class="modal-h"><h2>${esc(titulo)}</h2>
      ${passo !== "pdf" ? `<span class="tag">${trilha.indexOf(passo) + 1} de 3</span>` : `<span class="tag">PDF</span>`}
      <button class="btn sm ghost" style="margin-left:auto" data-fechar="1">Fechar</button></div>
    <div class="modal-b">
      ${m.erro ? `<div class="aviso erro" style="margin:0 0 12px">${esc(m.erro)}</div>` : ""}

      ${passo === "escolher" ? `
        <p class="hint" style="margin:0 0 14px">Escolha a foto de uma fita, ou a imagem de uma página do catálogo. Nada é gravado agora: você confere tudo antes.</p>
        <label class="btn primary" style="cursor:pointer">${svg(IC.mais)}Escolher arquivo
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style="display:none" data-imf-arquivo></label>
        <div class="hint" style="margin-top:12px;line-height:1.7">
          <b>JPG, PNG e WEBP</b> passam pelo recorte e pela conferência.<br>
          <b>PDF</b> é guardado como catálogo de origem e aberto pelo visualizador do navegador — recortar página de PDF dentro do app fica para uma versão futura. Para importar uma página agora, use uma imagem dela.
        </div>` : ""}

      ${passo === "pdf" ? `
        ${m.subindo ? `<div class="hint">Guardando o PDF…</div>`
        : m.catalogoPath ? `<div class="aviso" style="margin:0 0 12px"><b>PDF guardado como catálogo de origem.</b>
            <div class="hint mono" style="margin-top:4px;word-break:break-all">${esc(m.catalogoPath)}</div></div>
          <p class="hint">Ele fica no servidor como prova do que foi importado. Para trazer uma fita deste catálogo para o cadastro, envie uma imagem da página.</p>`
        : `<div class="hint">Não foi guardado.</div>`}` : ""}

      ${passo === "recortar" ? imfViewRecorte(m) : ""}
      ${passo === "conferir" ? imfViewConferencia(m) : ""}
    </div>
    <div class="modal-f">
      ${passo === "recortar" ? `<button class="btn" data-imf="voltar-escolher">← Trocar arquivo</button>` : ""}
      ${passo === "conferir" ? `<button class="btn" data-imf="voltar-recorte">← Recorte</button>` : ""}
      <span style="margin-left:auto"></span>
      <button class="btn" data-fechar="1">Cancelar</button>
      ${passo === "recortar" ? `<button class="btn primary" data-imf="conferir">Continuar</button>` : ""}
      ${passo === "conferir" ? `<button class="btn primary" data-imf="salvar" ${m.salvando ? "disabled" : ""}>
        ${m.salvando ? "Gravando…" : "Gravar"}</button>` : ""}
    </div></div></div>`;
}

/* ---------------------------------------------------------------------------
   OS CLIQUES DA JANELA
   --------------------------------------------------------------------------- */
async function imfClique(alvo) {
  const m = S.modal;
  if (!m || m.tipo !== "importarFita") return false;
  const a = alvo.dataset.imf;

  if (a === "voltar-escolher") { m.passo = "escolher"; m.erro = null; render(); return true; }
  if (a === "voltar-recorte")  { m.passo = "recortar"; m.erro = null; render(); return true; }
  if (a === "inteira") { m.caixa = { x: 0, y: 0, w: m.larg, h: m.alt }; render(); return true; }
  if (a === "auto") {
    if (!IMF_IMG) return true;
    const r = imfAutoRecorte(IMF_IMG);
    m.caixa = r.caixa; m.autoAchou = r.achou; m.autoMotivo = r.motivo || null;
    render(); return true;
  }
  if (a === "anexar-foto") { m.anexarFoto = !!alvo.checked; return true; }

  if (a === "conferir") {
    const sug = imfDoNome(m.nomeArquivo);
    m.conferencia = imfMontarConferencia(sug, imfCasar(sug));
    m.passo = "conferir";
    render(); return true;
  }

  if (a === "salvar") {
    if (m.salvando) return true;
    m.salvando = true; m.erro = null; render();

    let caminhoFoto = null;
    /* a foto sobe ANTES de gravar: um caminho que não existe não pode ser
       gravado em `foto_path` — é o `orfaos` do smoke */
    if (m.anexarFoto !== false && IMF_IMG) {
      try {
        const recortada = await imfRecortar(IMF_IMG, m.caixa, m.tipoArquivo, m.nomeArquivo);
        const alvoFita = m.conferencia && m.conferencia.fita;
        const destino = typeof foCaminhoDaFita === "function"
          ? foCaminhoDaFita(alvoFita ? alvoFita.id : "nova", recortada.type) : null;
        const sub = await foSubir(recortada, destino);
        if (sub.status !== "ok") {
          m.salvando = false;
          m.erro = `${sub.motivo || "Não consegui enviar a imagem."} Os campos não foram gravados — nada se perdeu.`;
          render(); return true;
        }
        caminhoFoto = sub.caminho;
      } catch (e) {
        m.salvando = false;
        m.erro = "Não consegui recortar a imagem: " + String((e && e.message) || e);
        render(); return true;
      }
    }

    const r = await imfSalvar(m.conferencia, caminhoFoto);
    m.salvando = false;
    if (r.status === "ok" || r.status === "na-fila" || r.status === "sem-mudanca") {
      const n = imfQuantasAplicam(m.conferencia);
      toast(r.status === "na-fila"
        ? "Guardado aqui. Vai ao servidor quando a fila drenar."
        : r.status === "sem-mudanca" ? "Nada mudou — nenhum campo estava marcado."
        : `Fita gravada${n ? ` · ${n} ${n === 1 ? "campo" : "campos"}` : ""}${caminhoFoto ? " · com foto" : ""}.`);
      S.modal = null; IMF_IMG = null;
      render(); return true;
    }
    m.erro = r.motivo || `O servidor não confirmou (${r.status}). Nada foi perdido.`;
    render(); return true;
  }
  return false;
}
