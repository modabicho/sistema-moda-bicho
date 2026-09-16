/* ---------- mês de pagamento (competência do fechamento) ----------
   Na planilha era a coluna "Mês Pagamento": é ela, e não a data de retorno,
   que decide em qual fechamento o pedido é pago. Aqui vale o mesmo:
   se o pedido tem mês definido, ele manda; senão, cai no mês do retorno. */
const compFmt = (d) => (d ? `${MESES[d.getMonth()]} ${d.getFullYear()}` : null);
function normalizarComp(txt, refData) {
  const t = normProc(txt).trim();
  if (!t) return null;
  const partes = t.split(/\s+/);
  const i = MESES.findIndex((x) => normProc(x) === partes[0]);
  if (i < 0) return null;
  const ano = /^\d{4}$/.test(partes[1] || "") ? Number(partes[1]) : (pdate(refData) || hoje()).getFullYear();
  return `${MESES[i]} ${ano}`;
}
const competenciaDe = (r) => normalizarComp(r?.mesPagamento, r?.retornadaEm) || compFmt(pdate(r?.retornadaEm));
const ordemComp = (m2) => { const [n, a] = String(m2 || "").split(" "); return (Number(a) || 0) * 100 + MESES.indexOf(n); };
const mesesFechados = () => (S.cad?.mesesFechados || []);
const mesFechado = (comp) => !!comp && mesesFechados().some((x) => x.mes === comp);
const infoFechamento = (comp) => mesesFechados().find((x) => x.mes === comp) || null;
/* opções do seletor: mês anterior, o do retorno e o seguinte — cobre a virada do mês */
function compsVizinhas(dataIso) {
  const d = pdate(dataIso) || hoje();
  return [-1, 0, 1].map((k) => compFmt(new Date(d.getFullYear(), d.getMonth() + k, 1)));
}

/* Quando o pedido tem etapas escolhidas à mão, elas valem ao pé da letra.
   Sem escolha, o EMBALAR entra por padrão — quase toda prestadora embala. */
const etapasExplicitas = (r) => Array.isArray(r?.etapasUsadas) && r.etapasUsadas.length > 0;
const cobreEtapa = (r, nome, usadas) => usadas.has(nome) || (!etapasExplicitas(r) && /EMBALA/.test(nome));

/* O nome exato manda. Quando não há exato, o app ainda aceita um parecido —
   é o que segura os processos cujo nome andou mudando —, mas só quando existe
   UM parecido: com dois, quem ganhava era quem estivesse primeiro no array, ou
   seja, a ordem de importação decidia o valor por peça de um pagamento.
   `estruturaAproximada` diz quando o casamento não foi exato, para a conferência
   poder avisar em vez de calcular calada. */
function estruturaDe(proc) {
  const p = normProc(proc);
  if (!p) return null;
  const todas = S.cad?.estruturas || [];
  const exata = todas.find((e) => normProc(e.processo) === p);
  if (exata) return exata;
  const perto = todas.filter((e) => normProc(e.processo)
    && (p.includes(normProc(e.processo)) || normProc(e.processo).includes(p)));
  return perto.length === 1 ? perto[0] : null;
}
const estruturaAproximada = (proc) => {
  const p = normProc(proc);
  if (!p) return null;
  const todas = S.cad?.estruturas || [];
  if (todas.some((e) => normProc(e.processo) === p)) return null;
  const perto = todas.filter((e) => normProc(e.processo)
    && (p.includes(normProc(e.processo)) || normProc(e.processo).includes(p)));
  return perto.length === 1 ? perto[0].processo : perto.length > 1 ? "__ambiguo" : null;
};
function tplDoProcesso(proc) {
  const norm = normProc;
  const p = norm(proc);
  /* 1º: a estrutura real importada do LinkEstrutura (etapas na ordem oficial) */
  const estr = estruturaDe(proc);
  const chk = (() => { for (const k of Object.keys(PAPEL_TPL)) if (p.includes(k)) return PAPEL_TPL[k].check; return ["EMBALAGEM", "ETIQUETA", "AMOSTRA"]; })();
  if (estr && (estr.etapas || []).length) {
    let ets = estr.etapas.map((e) => String(e.nome).toUpperCase());
    /* o CORTE é etapa interna da MB (campo próprio no topo do canhoto) — só fica como coluna no processo CORTE */
    if (norm(estr.processo) !== "CORTE") ets = ets.filter((e) => !/^CORTE\b/.test(norm(e)));
    if (ets.length) return { nome: norm(estr.processo), etapas: ets, check: chk, daEstrutura: true };
  }
  for (const k of Object.keys(PAPEL_TPL)) if (p.includes(k)) return { nome: k, ...PAPEL_TPL[k] };
  return { nome: p || "PRODUÇÃO", etapas: ["PRODUÇÃO", "ACABAMENTO"], check: chk };
}

/* setores internos de produção — direcionamento dos pedidos */
const SETORES_PADRAO = [
  { id: "adesivos", nome: "Adesivos", responsavel: "Naiane", processos: ["ADESIVO", "SOMENTE COLA"] },
  { id: "fitas", nome: "Fitas", responsavel: "Suellen", processos: ["CARTELA", "GRAVATA"] },
  { id: "bandana", nome: "Bandana e Laço Tecido", responsavel: "Bibi", processos: ["BANDANA", "LACO TECIDO"] },
  { id: "chucas", nome: "Chucas", responsavel: "Gabriela", processos: ["CHUCA", "CHUCA SIMPLES"] },
];
const setores = () => (S.cad.setores || []);
/* A exportação de catálogo da Magazord traz a URL SEM o domínio
   ("elasticos/elastico-fino-p"). Aqui ela vira endereço completo. */
function urlCompleta(u) {
  const t = String(u || "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  const base = String(S.cfg.dominioLoja || "www.modabicho.com.br").replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return "https://" + base + "/" + t.replace(/^\/+/, "");
}

function linkLoja(sku) {
  const p = produtoDe(sku);
  if (p?.urlSite) return p.urlSite;
  return (S.cfg.buscaSite || "https://www.modabicho.com.br/pesquisa?q={sku}").replace("{sku}", encodeURIComponent(sku));
}
/* Copiar texto: a API do navegador só funciona em https ou localhost, e o app roda
   como arquivo local — por isso o plano B com o campo temporário, que funciona sempre. */
async function copiar(txt, aviso) {
  const t = String(txt || "").trim();
  if (!t) return false;
  /* clique duplo dispara dois cliques: não repete o aviso na tela */
  const agora = Date.now();
  const repetido = copiar._ultimo === t && agora - (copiar._quando || 0) < 500;
  copiar._ultimo = t; copiar._quando = agora;
  const diga = (msg, tipo) => { if (!repetido) toast(msg, tipo); };
  try { if (navigator?.clipboard?.writeText) { await navigator.clipboard.writeText(t); diga(aviso || `${t} copiado.`); return true; } } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = t; ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-999px;opacity:0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (ok) { diga(aviso || `${t} copiado.`); return true; }
  } catch {}
  diga("Não consegui copiar — selecione o texto e use Ctrl+C.", "erro");
  return false;
}

async function abrirNaLoja(sku) {
  let copiou = false;
  try { if (typeof navigator !== "undefined" && navigator.clipboard) { await navigator.clipboard.writeText(sku); copiou = true; } } catch {}
  try { const u = urlExterna(linkLoja(sku)); if (u && typeof window !== "undefined" && window.open) window.open(u, "_blank"); } catch {}
  toast(copiou ? `SKU ${sku} copiado — abrindo a loja com a busca pronta.` : `Abrindo a loja com a busca de ${sku}.`);
}
const respDoSetor = (st) => (st?.responsaveis?.length ? st.responsaveis : st?.responsavel ? [st.responsavel] : []);
/* ---------- regras de bônus ----------
   A planilha tinha duas, de naturezas diferentes: quem faz BANDANA e fecha o mês
   com 15.000 peças ganha 10%; e quem NÃO faz bandana, passando de R$ 1.200 no
   mês, também ganha 10%. Uma olha quantidade, a outra olha valor; uma mira um
   processo, a outra mira justamente quem não o faz. Daí os três campos: a quem
   se aplica, e as condições — que podem ser de peças, de valor, ou as duas. */
const BONUS_PADRAO = [
  { alvo: "processo", processo: "BANDANA", minPecas: 15000, minValor: 0, pct: 0.10 },
  { alvo: "exceto", processo: "BANDANA", minPecas: 0, minValor: 1200, pct: 0.10 },
];
const BONUS_ALVOS = [["processo", "Quem faz"], ["exceto", "Quem NÃO faz"], ["todas", "Todas as prestadoras"]];
/* a regra escrita em uma linha, para o papel dizer POR QUE o bônus entrou */
function bonusPorque(regra) {
  if (!regra) return "";
  const cond = [];
  if (Number(regra.minPecas) > 0) cond.push(`${n0(regra.minPecas)} peças no mês`);
  if (Number(regra.minValor) > 0) cond.push(`${freal(regra.minValor)} no mês`);
  const alvo = regra.alvo || (regra.processo ? "processo" : "todas");
  const quem = alvo === "processo" ? `quem faz ${regra.processo}`
    : alvo === "exceto" ? `quem não faz ${regra.processo}` : "todas as prestadoras";
  return `${quem}, a partir de ${cond.join(" e ") || "nenhuma condição"}`;
}
/* qual regra vale para esta prestadora neste mês. Quando mais de uma casa, vale
   a de maior percentual — assim a ordem em que foram cadastradas não decide
   quanto alguém recebe. */
function bonusDe(procsTodos, pecas, valor) {
  const procs = (procsTodos || []).map((x) => String(x).toUpperCase());
  const casa = (b2) => {
    const pct = Number(b2.pct) || 0;
    if (pct <= 0) return false;
    const alvo = b2.alvo || (b2.processo ? "processo" : "todas");
    const proc = String(b2.processo || "").toUpperCase();
    if (alvo === "processo" && !(proc && procs.includes(proc))) return false;
    if (alvo === "exceto" && (!proc || procs.includes(proc))) return false;
    const mp = Number(b2.minPecas) || 0, mv = Number(b2.minValor) || 0;
    if (mp > 0 && !(pecas >= mp)) return false;
    if (mv > 0 && !(valor >= mv)) return false;
    if (mp <= 0 && mv <= 0) return false;   /* regra sem condição não vale nada */
    return true;
  };
  const boas = (S.cad.bonus || []).filter(casa);
  if (!boas.length) return null;
  return boas.reduce((m2, b2) => ((Number(b2.pct) || 0) > (Number(m2.pct) || 0) ? b2 : m2));
}
const setorDe = (processo) => processo ? setores().find((st) => (st.processos || []).includes(String(processo).trim().toUpperCase())) || null : null;
/* o processo pode estar no proprio pedido ou so no cadastro do produto */
const procDoPedido = (r) => (r.processo || produtoDe(opPorId(r.opId)?.sku || r.sku)?.processo || null);
const setorDoPedido = (r) => { const nome = r.setor || setorDe(r.processo)?.nome; return nome ? setores().find((st) => st.nome === nome) || { nome } : null; };
const ehAdesivo = (processo) => { const p = String(processo || "").toUpperCase(); if (p.includes("ADESIVO")) return true; const st = setorDe(processo); return !!st && st.nome.toUpperCase().includes("ADESIV"); };
