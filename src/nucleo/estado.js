/* ---------- o destino das peças produzidas ----------
   Produzir 250 e embalar 200 é NORMAL: as outras 50 vão soltas para o pacote
   de mix, ou simplesmente ficam sem embalagem individual. Até a 7.98 o app não
   deixava: `qtdEmbalar` era recalculado como `qtd − qtdMix` na hora de salvar,
   então digitar 200 ali não adiantava nada — o número voltava para 250 sozinho.

   Agora os dois são números que a pessoa decide, e o app só faz duas coisas:
   diz a conta em voz alta e impede o impossível (embalar + mix maior do que o
   que foi produzido). O que sobra tem nome — "sem embalagem" — e aparece. */

/* a conta do destino, escrita para gente ler. Fica no escopo do arquivo porque
   o ouvinte global de `input` a chama a cada tecla — declarada dentro do desenho
   da janela, ela existiria para desenhar e sumiria na hora de repintar. */
function destinoFrase(d) {
  if (d.embalar + d.mix > d.qtd) {
    return `<b style="color:var(--red)">Não cabe:</b> ${n0(d.embalar)} embalar + ${n0(d.mix)} mix dá <b>${n0(d.embalar + d.mix)}</b>, e o pedido tem <b>${n0(d.qtd)}</b> peças.`;
  }
  const partes = [`<b>${n0(d.qtd)}</b> produzidas = <b>${n0(d.embalar)}</b> embaladas`];
  if (d.mix) partes.push(`<b>${n0(d.mix)}</b> no mix`);
  if (d.resto) partes.push(`<b>${n0(d.resto)}</b> sem embalagem`);
  const frase = partes.join(" + ");
  const soltas = d.mix + d.resto;
  const rodape = soltas
    ? `<div style="margin-top:2px">As <b>${n0(soltas)}</b> que não são embaladas voltam soltas — o papel da prestadora vai pedir <b>${n0(d.embalar)}</b> na etapa EMBALAGEM.</div>` : "";
  return d.resto
    ? `${frase} &nbsp; <button type="button" class="btn sm ghost" data-act="destino-resto" title="Marca as ${n0(d.resto)} que sobraram como destinadas ao pacote mix">mandar as ${n0(d.resto)} para o mix</button>${rodape}`
    : frase + rodape;
}
/* lê os dois campos da janela como eles estão agora, sem passar pelo pedido */
function destinoDaJanela() {
  const qtd = Math.max(0, Number($("#destino-resumo")?.dataset.qtd) || 0);
  const num = (sel) => { const el2 = document.querySelector(sel); if (!el2) return 0;
    return Math.max(0, Math.min(Number(el2.value) || 0, qtd)); };
  const embalar = num('[data-m="qtdEmbalar"]'), mix = num('[data-m="qtdMix"]');
  return { definido: true, qtd, embalar, mix, resto: Math.max(0, qtd - embalar - mix) };
}
function repintarDestino() {
  const alvo = $("#destino-resumo"); if (!alvo) return;
  alvo.innerHTML = destinoFrase(destinoDaJanela());
}

function destinoPecas(r) {
  const qtd = Math.max(0, Number(r?.qtd) || 0);
  const definido = r?.qtdMix != null || r?.qtdEmbalar != null;
  if (!definido) return { definido: false, qtd, embalar: qtd, mix: 0, resto: 0 };
  const mix = Math.max(0, Math.min(Number(r.qtdMix) || 0, qtd));
  /* pedido antigo que só guardou o mix continua valendo o que valia: embalar era
     o resto. Quem tem o número gravado manda nele. */
  const embalar = r.qtdEmbalar == null ? Math.max(0, qtd - mix)
    : Math.max(0, Math.min(Number(r.qtdEmbalar) || 0, qtd));
  return { definido: true, qtd, embalar, mix, resto: Math.max(0, qtd - embalar - mix) };
}
const splitAdesivo = (r) => { const d = destinoPecas(r);
  if (!d.definido) return null;
  return `${n0(d.embalar)} embalar · ${n0(d.mix)} mix${d.resto ? ` · ${n0(d.resto)} sem embalagem` : ""}`; };

const S = {
  sessao: null,
  aba: ABA_PADRAO, pronto: false,
  /* ABAS INTERNAS (v8.62). `S.aba` continua decidindo QUAL tela desenha — estas
     duas dizem quais estão abertas na barra e qual está em foco. Só a ativa fica
     montada no DOM; as outras são estado. */
  abas: [], abaAtiva: null,
  /* segundo fator: tudo em memória, de propósito. `mfa.desafio` é o protocolo
     do servidor — nunca o código, que não é guardado em lugar nenhum. */
  mfa: null, mfaErro: null, mfaEnviando: false,
  /* cadastro em andamento: QR e segredo vivem AQUI e só aqui, e morrem no F5 */
  mfaCad: null,
  /* o portão desta abertura: "livre" | "checando" | "codigo" | "cadastro" | "erro".
     Começa em "checando" quando há sessão guardada — assim o app NUNCA aparece
     antes de o servidor dizer quem é a pessoa. */
  mfaGate: "livre", mfaGateErro: null, mfaFatores: [], mfaExigida: false,
  produtos: [], ops: [], pedidos: [], analises: [], eventos: [], equipe: [], estoque: null, faltas: [],
  cad: { prestadoras: [], estruturas: [] },
  cfg: { ...CFG_PADRAO },
  calc: null, sel: new Set(), drawer: null, modal: null,
  /* limite = quantas linhas vão para o DOM de uma vez. O custo de um render é
     quase todo cálculo de estilo e layout do navegador, e ele cresce com o
     número de nós: 250 linhas custam ~7x mais que 60. O resto entra sozinho
     conforme a pessoa rola (ver ligarRolagemInfinita). */
  demanda:      { busca: "", filtro: "acao", abc: "todos", ord: "score", dir: -1, limite: 60,
                  modo: "sku", ordPed: "numero", dirPed: 1, processo: "todos", etapaPed: "todas", statusPed: "todos" },
  pedView:      { busca: "", etapa: "andamento", corte: "todos", setor: "todos", abc: "todos", processo: "todos",
                  fornecedor: "todos", prestadora: "todas",
                  limite: 50, ord: null, dir: 1, ancora: null, ultimo: null },
  historico:    { busca: "", tipo: "pedidos", limite: 60 },
  comprasView:  { filtro: "aberta", busca: "" },
  produtosView: { busca: "", modo: "grade", filtro: "todos", limite: 60 },
  /* relatório de produção: base = qual mínimo manda (uso · sugerido · maior),
     porSku = as exceções decididas linha a linha */
  /* o relatório tem os próprios filtros: quem monta uma planilha de compra
     filtra de um jeito e não quer que isso mexa na tela de Demanda atrás */
  rel:          { aberto: false, base: "uso", porSku: {}, so: "produzir", ord: "produzir", dir: -1, limite: 80,
                  busca: "", categoria: "todas", processo: "todos", abc: "todos", setor: "todos",
                  fornecedor: "todos", filtrosAbertos: false, sel: new Set() },
  drawerOrd:    { ord: "", dir: 1 },
  ord:          {},
  prestView:    { busca: "", so: "ativas", mes: "", modo: "prestadoras", mesProc: "mes", confFiltro: "todos", prest: "todas", prestFech: "todas", editarCel: true, limiteConf: 120, kpi: "todos" },
  tarefas:      { quem: "" },
  /* só a pré-visualização da ADM ("ver como a equipe vê"). Não guarda trabalho
     nenhum: as pendências continuam sendo lidas de S.calc. */
  /* `abertos` guarda quais frentes do "Depois" estão expandidas. Some ao
     recarregar de propósito: a tela abre igual toda manhã — as 3 de agora à
     vista e o resto guardado. Previsível vale mais que esperto aqui. */
  /* só a dobra dos avisos secundários. O aviso crítico não passa por aqui: ele
     não recolhe, não fecha e não guarda estado — some quando o problema some. */
  avisos:       { abrir: false },
  /* preenchido quando a gravação sai do servidor e cai para o navegador —
     ver `anotarQueda`. Não é preferência nem cadastro: é um estado do momento. */
  servidorCaiu: null,
  /* espelho de `lerSoLocal()` para a tela poder nomear as seções presas */
  soLocal:      [],
  /* `ancora` guarda a ordem fotografada da etapa aberta; `ultimo` é o pedido que
     a pessoa acabou de abrir, para ela reencontrá-lo de relance */
  insumos: [], movInsumo: [], entradas: [], posse: [],
  /* o terceiro estoque: o catálogo do que a empresa empresta e cada saída dele */
  bens: [], posseItens: [],
  /* ---------- o quarto estoque: semiacabados ----------
     São quatro estoques, e eles NÃO se misturam nunca:
       1. insumos          — o que a fábrica compra para consumir (S.insumos)
       2. produtos prontos — o SKU comercial, que a loja vende (S.estoque)
       3. em posse         — o material da empresa que está com a prestadora (S.posse/S.bens)
       4. semiacabados     — a bandana pronta que AINDA NÃO É SKU  (aqui)
     Um saldo nunca soma com o outro, e um movimento de um nunca vira movimento
     do outro. O código interno (BAND-P-DD) parece um SKU e não é: ele não vende,
     não entra na Demanda, não entra na conta de estoque de produto pronto. */
  /* qual caixinha de "+ novo" está aberta em cada bloco de embalagem — estado de
     tela, some ao fechar a janela */
  embNovo:      null,
  semiTipos:    [],   /* o catálogo dos códigos internos */
  remessas:     [],   /* cada ida para a prestadora, com os retornos dentro */
  semiAjustes:  [],   /* correção de saldo à mão, com motivo */
  semiView:     { modo: "remessas", filtro: "abertas", busca: "", prest: "todas", limite: 40,
                  ord: "em", dir: -1, aberta: null },
  /* datas festivas: campanhas sazonais. Fica fora da Demanda de propósito —
     produto de data festiva não vende como o resto do ano. */
  festivas:     { campanhas: [] },
  festivasView: { campanha: null, filtro: "ativas", modo: "planejar", busca: "", buscaBase: "",
                  /* a tela de planejamento tem os mesmos controles da Demanda — e estado próprio,
                     porque as duas não se falam */
                  /* seleção em lote: os marcados na busca e os marcados na tabela */
                  selAdd: [], selProd: [], compAdd: "exclusivo",
                  filtro2: "acao", buscaPlano: "", abcF: "todos", procF: "todos",
                  ord: "produzir", dir: -1, limite: 60, impIni: null, impFim: null },
  /* Relatórios: o filtro do topo vale para a aba inteira, não por gráfico */
  relView:      { painel: "geral", periodo: "30d", ini: null, fim: null,
                  processo: "todos", setor: "todos", prestadora: "todas", abc: "todos" },
  insumosView:  { busca: "", filtro: "todos", fornecedor: "todas", categoria: "todas", ord: null, dir: 1, limite: 80 },
  posseView:    { prest: "todas", sit: "abertas", busca: "", limite: 120 },
  /* quem mais está no app agora — lido do documento `presenca`, nunca digitado */
  presenca:     { lista: [], em: null, avisados: [], jaAbriu: false },
};

const normPrest = (l) => (l || []).map((p) => (typeof p === "string" ? { nome: p, processos: [], telefone: "", ativo: true } : { ativo: true, processos: [], telefone: "", ...p }));
/* fornecedor de um SKU — fica no produto, vinculado pela marca na importação */
const fornecedorDeSku = (sku) => {
  const p = produtoDe(sku);
  const fid = p?.producao?.fornecedorId;
  if (!fid) return null;
  return (S.cad.fornecedores || []).find((f) => f.id === fid) || null;
};
const fornecedoresEmUso = () => {
  const ids = new Set(S.produtos.map((p) => p.producao?.fornecedorId).filter(Boolean));
  return (S.cad.fornecedores || []).filter((f) => ids.has(f.id)).sort((a, b) => a.nome.localeCompare(b.nome));
};

const nomesPrest = () => S.cad.prestadoras.filter((p) => p.ativo !== false).map((p) => p.nome);
const optPrest = (sel) => nomesPrest().map((p) => `<option ${sel === p ? "selected" : ""}>${esc(p)}</option>`).join("");
const optEquipe = (sel) => S.equipe.filter((p) => p.ativo !== false).map((p) => `<option value="${esc(p.nome)}" ${sel === p.nome ? "selected" : ""}>${esc(p.nome)}</option>`).join("");
