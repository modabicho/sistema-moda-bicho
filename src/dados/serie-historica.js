/* ---------- série histórica: o app acumula as fotografias de estoque+vendas ----------
   Cada CSV aplicado vira um ponto da série (compacto: arrays paralelos por SKU).
   É daqui que nascem médias, tendências e a curva ao longo do tempo — sem planilha. */
const HIST_MAX = 18; /* ~2 meses a 2-3 importações/semana */
function histRegistrar() {
  if (!S.estoque?.itens?.length) return;
  S.hist = S.hist || { serie: [] };
  const skus = [], vendas = [], est = [], minimo = [];
  for (const it of S.estoque.itens) {
    skus.push(it.sku);
    vendas.push(Number(it.vendas) || 0);
    est.push(Math.round((Number(it.estDisponivel) || 0) - (Number(it.estReservado) || 0)));
    minimo.push(Number(it.estMinimo) || 0);
  }
  const ponto = { em: S.estoque.importadoEm, periodoIni: S.estoque.periodoIni, periodoFim: S.estoque.periodoFim,
    skus, vendas, est, minimo };
  /* substitui ponto do mesmo dia (reimportação corrige, não duplica) */
  const dia = String(ponto.em).slice(0, 10);
  S.hist.serie = (S.hist.serie || []).filter((p) => String(p.em).slice(0, 10) !== dia);
  S.hist.serie.push(ponto);
  while (S.hist.serie.length > HIST_MAX) S.hist.serie.shift();
}
function histDoSku(sku) {
  return (S.hist?.serie || []).map((p) => { const i = p.skus.indexOf(sku);
    return i < 0 ? null : { em: p.em, vendas: p.vendas[i], est: p.est[i] }; }).filter(Boolean);
}
/* migração 7.46: padrões antigos viram funções da pessoa e a lista morre */
function migrarPadroesParaFuncoes() {
  const pad = S.cfg?.padroes;
  if (!pad || S.cfg.padroesMigrados) return 0;
  let n = 0;
  for (const [fid] of FUNCOES) {
    const v = pad[fid];
    for (const nome of (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean)) {
      const pe = S.equipe.find((x) => x.nome === nome);
      if (!pe) continue;
      pe.funcoes = pe.funcoes || [];
      if (!pe.funcoes.includes(fid)) { pe.funcoes.push(fid); n++; }
    }
  }
  /* a ordem da lista antiga era quem recebia a tarefa; agora quem decide é a ordem
     da Equipe. Sobe quem estava em primeiro em mais etapas, para ninguém perder a
     vez sem ser avisado. */
  if (n) {
    const peso = new Map();
    for (const [fid] of FUNCOES) {
      const v = pad[fid]; const primeiro = (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean)[0];
      if (primeiro) peso.set(primeiro, (peso.get(primeiro) || 0) + 1);
    }
    if (peso.size) S.equipe = S.equipe
      .map((pe, i) => ({ pe, i, w: peso.get(pe.nome) || 0 }))
      .sort((a, b) => b.w - a.w || a.i - b.i)
      .map((x) => x.pe);
  }
  S.cfg.padroes = {};
  S.cfg.padroesMigrados = true;
  return n;
}
function usoStorage() {
  try {
    let bytes = 0;
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); bytes += (k.length + (localStorage.getItem(k) || "").length) * 2; }
    return { bytes, pct: Math.round((bytes / 5242880) * 100) };
  } catch { return { bytes: 0, pct: 0 }; }
}
/* fila de gravação: nunca duas em paralelo; seções pendentes acumulam */
let _gravando = false;
const _pendentes = new Set();
const SALVO = { ok: null, quando: null, erro: null };
/* ---------- a rede: nenhum "pronto" logo depois de um "não gravou" ----------
   O contrato de `salvarTudo` (devolver true/false) resolve para quem PERGUNTA.
   Mas há 55 pontos no app que já anunciam o fim de uma operação logo depois de
   gravar — "Produção encerrada.", "Pedido atualizado." — e nenhum deles
   perguntava. O resultado era duas frases se contradizendo na mesma tela: o
   aviso vermelho no topo dizendo que nada foi salvo e o toast verde dizendo que
   deu certo.

   Editar os 55 resolveria hoje e voltaria a falhar na primeira chamada nova.
   Então a checagem mora onde a frase é impressa: um aviso de SUCESSO criado no
   mesmo instante em que uma gravação falhou não pode sair verde. Ele sai
   vermelho e completa a frase — "…mas não foi gravado no servidor".

   O sinal dura um macrotask. A linha que anuncia o sucesso roda numa microtask
   logo depois do `await`, então ela pega o sinal; qualquer coisa posterior,
   não. Falso positivo aqui é inofensivo: se uma gravação acabou de falhar,
   "não foi gravado no servidor" é verdade de qualquer jeito. */
let _falhouAgora = false;
function marcarFalhaAgora() {
  _falhouAgora = true;
  setTimeout(() => { _falhouAgora = false; }, 0);
}
const gravacaoAcabouDeFalhar = () => _falhouAgora;
function marcarSalvo(ok, erro) {
  SALVO.ok = ok; SALVO.quando = new Date(); SALVO.erro = ok ? null : (erro || SALVO.erro);
  repintarSalvo();
}
/* o rótulo é relativo ("há 18 s"), então precisa se refrescar sozinho */
function repintarSalvo() {
  const el = document.getElementById("st-salvo");
  if (el) el.outerHTML = statusSalvo();
  /* a janela aberta mostra os mesmos números: se ela está na tela, acompanha */
  if (typeof S !== "undefined" && S.modal?.tipo === "gravacao" && typeof render === "function") render();
}
setInterval(() => { if (!document.hidden) repintarSalvo(); }, 10000);
