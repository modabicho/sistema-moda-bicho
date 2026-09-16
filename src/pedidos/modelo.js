/* ---------- regras do modelo OP + Pedido ---------- */
const OP_ATIVA = ["pendente", "em_producao"];
/* TODOS os SKUs pelos quais este produto já passou — o atual primeiro.
   `opSku` é montado só com `o.sku` exato: sem isto, renomear o SKU fazia o
   pedido seguinte NÃO achar a OP viva e nascer uma OP PARALELA, partindo o
   histórico de programado × produzido. E em silêncio, porque `produtoDe`
   continuava achando o produto pelo `skusAnteriores`. */
function skusDoProduto(sku) {
  const p = typeof produtoDe === "function" ? produtoDe(sku) : null;
  if (!p) return [sku];
  const l = [p.sku];
  for (const h of (p.skusAnteriores || [])) { const sk = (h && h.sku) || h; if (sk) l.push(sk); }
  if (!l.includes(sku)) l.push(sku);
  return Array.from(new Set(l.filter(Boolean)));
}
const opAtivaDe = (sku) => {
  const i = idx();
  for (const sk of skusDoProduto(sku)) {
    const achou = (i.opSku.get(sk) || []).find((o) => OP_ATIVA.includes(o.status));
    if (achou) return achou;
  }
  return null;
};
const opPorId = (id) => idx().opId.get(id) || null;
const pedidosDe = (opId) => (idx().pedPorOp.get(opId) || []).filter((r) => r.status !== "cancelado");
const pedidoPorId = (id) => idx().pedId.get(id) || null;
const arredPacote = (q, pac) => { const p = Math.max(1, Number(pac) || 1); return Math.ceil(Math.max(0, q) / p) * p; };

/* ---------- um número, uma sequência ----------
   A remessa para prestadora tira número daqui também. Duas sequências paralelas
   dariam duas coisas diferentes com o mesmo número — e "o 1549" deixaria de ser
   uma resposta. Por isso o próximo livre olha os pedidos E as remessas. */
/* ---------------------------------------------------------------------------
   O NÚMERO NÃO VOLTA · e por que isto precisou de três camadas
   ---------------------------------------------------------------------------
   Esta função deduzia o próximo número do que estava na lista: `max + 1`. Isso
   funciona enquanto nada sai da lista — e para de funcionar no dia em que um
   pedido é excluído. Medido, com esta mesma função, antes de mexer nela:

     120,121,122 ativos ................. próximo 123   ok
     121 cancelado (fica na lista) ...... próximo 123   ok
     121 excluído (sai da lista) ........ próximo 123   ok
     122 excluído (sai da lista) ........ próximo 122   O NÚMERO VOLTOU
     121 e 122 excluídos ................ próximo 121   O NÚMERO VOLTOU

   Excluir o maior devolvia o número dele. Agora são três camadas, e cada uma
   cobre uma falha diferente:

   1. O CONTADOR DO SERVIDOR (`pcp_ciclo.proximo_numero`) é a fonte oficial. Ele
      é um número guardado, não uma dedução: não recua com rollback, nem com
      cancelamento, nem com exclusão, porque não olha os pedidos.
   2. A MARCA D'ÁGUA local, para o caminho legado e para quando o contador ainda
      não chegou. Ela só sobe, e é gravada junto com a configuração.
   3. O MAIOR DA LISTA, que era o único critério e agora é o piso mínimo.

   O resultado era o maior dos três — e foi aí que o desenho errou.

   v8.75 · O CONTADOR OFICIAL MANDA SOZINHO.
   `Math.max` das três camadas parecia seguro porque "nenhuma faz o número
   voltar". O preço apareceu depois do reset da base: a marca d'água guardava
   2816 de um mundo que não existe mais, a sequência do servidor estava em 2726,
   e a tela prometia 2817 — 91 números adiante do que o banco ia gravar. Uma
   camada que só sobe não erra para baixo, mas erra para cima para sempre, e não
   existe caminho para corrigi-la.

   Agora: quando o contador do servidor respondeu, ELE É A RESPOSTA — sem
   Math.max com a lista e sem Math.max com a marca d'água. As camadas 2 e 3
   viram o que sempre deveriam ter sido: o caminho legado, para quando não há
   contador nenhum (documento, sem camada de tabela, leitura que falhou).
   --------------------------------------------------------------------------- */

/* o contador do servidor, quando a leitura pela tabela está ligada */
let PED_CICLO = null;

/* A marca d'água mora em `S.cfg`, que é documento gravado — então ela
   atravessa o F5 e a troca de máquina. Ela NUNCA desce: `Math.max` é a função
   inteira, e é de propósito que não existe caminho para diminuí-la. */
function numeroMarcarUsado(n) {
  const m = String(n == null ? "" : n).match(/^(\d+)/);
  if (!m) return;
  const v = +m[1];
  if (!S.cfg) return;
  const atual = Number(S.cfg.maiorNumeroUsado) || 0;
  if (v > atual) { S.cfg.maiorNumeroUsado = v; _pendentes.add("cfg"); }
}

/* Existe contador oficial nesta sessão? Quem pergunta é a tela, para saber se
   promete um número ou avisa que quem decide é a gravação. */
const numeroTemContadorOficial = () => !!(PED_CICLO && Number(PED_CICLO.proximo) > 0);

function proximoNumeroPedido() {
  /* CAMADA 1 · o contador do servidor. Quando ele respondeu, é ele e ponto:
     nenhum Math.max com a lista, nenhum Math.max com a marca d'água. */
  if (numeroTemContadorOficial()) return Number(PED_CICLO.proximo);
  /* --- daqui para baixo é o CAMINHO LEGADO: sem contador nenhum --- */
  let max = 0;
  const olhar = (n) => { const m = String(n || "").match(/^(\d+)/); if (m) max = Math.max(max, +m[1]); };
  for (const r of S.pedidos) olhar(r.numero);
  for (const r of (S.remessas || [])) olhar(r.numero);
  olhar(S.cfg && S.cfg.maiorNumeroUsado);          /* camada 2 */
  /* REGISTRA O QUE VIU. Sem isto a marca dependia de alguém lembrar de
     atualizá-la antes de cada remoção — e "lembrar" é exatamente o que falha
     no caminho que ninguém previu (uma releitura do servidor que já não traz o
     pedido excluído, por exemplo). Escrever aqui é barato: `numeroMarcarUsado`
     só grava quando o valor SOBE, então nos renders seguintes não faz nada. */
  numeroMarcarUsado(max);
  return max + 1;
}

/* Lê o contador oficial. Só leitura, e falha calada: se não vier, as camadas 2
   e 3 continuam valendo e o app não para por causa disso. */
async function pedCarregarCiclo() {
  try {
    if (!(typeof telaLeDaTabela === "function" && telaLeDaTabela())) return null;
    if (typeof persLer !== "function") return null;
    const r = await persLer("pcp_ciclo?select=ciclo,proximo_numero&atual=is.true");
    if (!r || !r.ok) return null;
    const l = (typeof persLista === "function" ? persLista(r.corpo) : (r.corpo || []))[0];
    if (!l) return null;
    PED_CICLO = { ciclo: Number(l.ciclo), proximo: Number(l.proximo_numero) || 0 };
    /* o contador do servidor também alimenta a marca d'água: ele é a autoridade,
       então o que ele já entregou não pode voltar nem no caminho legado */
    numeroMarcarUsado(PED_CICLO.proximo - 1);
    return PED_CICLO;
  } catch { return null; }
}

/* ---------------------------------------------------------------------------
   RELER O CONTADOR NA HORA DE ABRIR A JANELA (v8.75)
   ---------------------------------------------------------------------------
   `pedCarregarCiclo()` era lido uma vez, no boot. A aba fica aberta o dia
   inteiro: se outra pessoa criar quinze pedidos, o número que esta tela mostra
   envelhece calado. Aqui a leitura é refeita quando a janela sobe, e a tela só
   é redesenhada se o número REALMENTE mudou — redesenhar à toa faz piscar.
   Falha calada de propósito: sem resposta, vale o que já estava.
   --------------------------------------------------------------------------- */
function pedCicloRefrescar(tiposDeModal) {
  try {
    if (typeof pedCarregarCiclo !== "function") return;
    const antes = PED_CICLO && PED_CICLO.proximo;
    pedCarregarCiclo().then((c) => {
      if (!c || c.proximo === antes) return;
      const t2 = S.modal && S.modal.tipo;
      if (!t2 || !(tiposDeModal || []).includes(t2)) return;
      /* -----------------------------------------------------------------
         v8.91 · O CONTADOR CHEGA SEM DERRUBAR A JANELA
         -----------------------------------------------------------------
         Aqui havia `render()` — a TELA INTEIRA. Medido: a janela acabava de
         nascer e, 37 ms depois, a resposta do `pcp_ciclo` reescrevia o `#app`,
         destruía o `.ov` recém-criado e punha outro no lugar. As animações de
         abertura (`fade` e `pop`) recomeçavam do zero, com a primeira janela
         tendo vivido 36 ms sem chegar a aparecer. Era a piscada de abrir — e
         era mais forte nas primeiras vezes porque só há segundo desenho quando
         o contador VOLTA DIFERENTE, o que acontece uma vez por sessão.
         O que mudou é a janela, não a tela de trás: quem repinta é
         `repintarModal`, que troca só o véu e (desde a v8.90) não reanima.
         O `render()` fica para quando não há janela de pé.
         ----------------------------------------------------------------- */
      try {
        /* Na janela do pedido avulso, o contador muda DUAS coisinhas: a dica
           embaixo do campo do número e o botão "Usar o sugerido". `npNumRefrescar`
           (v8.83) escreve as duas no lugar onde elas estão — nada é trocado, a
           janela nem pisca, e o número novo chega igual. É o caminho mais barato
           e o único que deixa a animação de abertura terminar inteira. */
        if (t2 === "novoPedido" && typeof npNumRefrescar === "function" && npNumRefrescar()) return;
        /* Nas outras (a da Demanda mostra "números 0003 a 0007"), o desenho
           depende do contador em mais de um ponto: repinta a janela — e só ela. */
        if (typeof repintarModal === "function"
            && typeof document !== "undefined" && document.querySelector(".ov")) repintarModal();
        else render();
      } catch (e) {}
    }).catch(() => {});
  } catch (e) {}
}
/* Regra: número de pedido é único. A única exceção é a continuação — mesmo pedido,
   processo seguinte, outra prestadora: 1217 na Tati (máquina) e 1217-A na Andreia (cola
   e embalagem). O sufixo é o que separa as duas, e cada uma recebe pelo seu processo. */
const RAIZ_PEDIDO = (n) => String(n || "").trim().toUpperCase().replace(/-[A-Z]$/, "");
const SUFIXO_PEDIDO = (n) => (String(n || "").trim().toUpperCase().match(/-([A-Z])$/) || [])[1] || "";
function numeroEmUso(numero, ignoraId) {
  const alvo = String(numero || "").trim().toUpperCase();
  if (!alvo) return null;
  const p = S.pedidos.find((r) => r.id !== ignoraId && String(r.numero || "").trim().toUpperCase() === alvo);
  if (p) return p;
  /* a remessa segura o número igual a um pedido: devolve no mesmo formato para
     as mensagens de conflito continuarem legíveis sem cada uma saber disso */
  const rm = (S.remessas || []).find((r) => r.id !== ignoraId && String(r.numero || "").trim().toUpperCase() === alvo);
  return rm ? { id: rm.id, numero: rm.numero, status: "remessa", prestadora: rm.prestadora, _remessa: rm } : null;
}
/* próximo sufixo livre para uma continuação: -A, depois -B, e assim por diante */
function proximaContinuacao(numero) {
  const raiz = RAIZ_PEDIDO(numero);
  for (let i = 0; i < 26; i++) {
    const cand = `${raiz}-${String.fromCharCode(65 + i)}`;
    if (!numeroEmUso(cand)) return cand;
  }
  return `${raiz}-${uid().slice(-3).toUpperCase()}`;
}

/* Recalcula a OP a partir dos pedidos. Fonte única da verdade. */
function recalcularOP(op) {
  if (!op) return op;
  const rs = pedidosDe(op.id);
  /* E2 · A MESMA REGRA DA DEMANDA, e não uma paralela.
     Esta linha contava TODO pedido vivo, continuação inclusive — enquanto a
     Demanda descartava toda continuação. Dois números diferentes para o mesmo
     SKU, na mesma tela: `op.qtdProgramada` aparece na lista de Produtos e no
     Histórico; o da Demanda, na Demanda. Agora as duas perguntam a mesma coisa,
     no mesmo lugar (`contaNaDemanda`, em `nucleo/utilidades.js`). */
  op.qtdProgramada = rs.filter((r) => contaNaDemanda(r, S.pedidos)).reduce((s, r) => s + (Number(r.qtd) || 0), 0);
  /* peça com defeito não é produção: não dá para vender, então o saldo dela
     volta a aparecer na Demanda para ser refeito */
  op.qtdProduzida = rs.filter((r) => r.status === "retornada")
    .reduce((s, r) => s + (boasDe(r) ?? 0), 0);
  op.saldoSemPedido = arredPacote(Math.max(0, (Number(op.qtdNecessaria) || 0) - op.qtdProgramada), op.qtdPacote);

  if (op.status === "cancelada") return op;
  if (op.saldoSemPedido > 0) op.status = "pendente";
  else if (op.qtdProgramada > 0) op.status = "em_producao";
  else if (op.qtdProduzida > 0) { op.status = "concluida"; op.encerradaEm = op.encerradaEm || iso(hoje()); }
  else { op.status = "suprida"; op.encerradaEm = op.encerradaEm || iso(hoje()); }
  return op;
}

/* ---------------------------------------------------------------------------
   A PRIORIDADE AUTOMÁTICA DOS PEDIDOS DA OP (v8.76)
   ---------------------------------------------------------------------------
   O caso que trouxe isto: `020.10.RES.FUNDO.MAR` com estoque zerado, a OP em
   Crítico, e um pedido vivo dela parado em P2 com `prioridadeTravada: false`.
   A OP andou; o filho ficou.

   POR QUE NÃO ESTÁ DENTRO DE `recalcularOP`. Ela é chamada em 25 lugares — três
   deles na ABERTURA do app, mais importação, exportação, fusão de conflito,
   conferência, cancelamento e a reconciliação de OPs. Prioridade de pedido vivo
   mudando em qualquer um desses seria mudança silenciosa de dado, e a abertura
   marcaria dezenas de pedidos como sujos a cada F5. `recalcularOP` continua
   fazendo só quantidade e status.

   POR QUE NÃO É `r.prioridade = op.prioridade`. Irmãos da mesma OP NÃO têm a
   mesma urgência, de propósito: cada pedido é julgado pelo estoque PROJETADO
   depois dos que vêm à frente dele na fila (`prioridadesEmCascata`). Zerado com
   dois pedidos de 600: o primeiro é Crítico, o segundo já é julgado com as 600
   que o primeiro devolve. Achatar isso apagaria a informação de qual rompe
   primeiro. Quem manda aqui é a MESMA cascata que a prévia da análise mostra.

   `linha` é a linha da Demanda do SKU (`S.calc.porSku`). Sem ela não há estoque
   projetado — e sem estoque projetado esta função não inventa nada: devolve
   `sem-linha` e não toca em pedido nenhum.
   --------------------------------------------------------------------------- */
function sincronizarPrioridadeDosPedidos(op, linha, analiseId) {
  const vazio = (motivo) => ({ mexidos: [], motivo });
  if (!op || !op.id) return vazio("sem op");
  if (typeof prioridadesEmCascata !== "function") return vazio("sem cascata");
  let l = linha;
  if (!l) { try { l = S.calc && S.calc.porSku ? S.calc.porSku.get(op.sku) : null; } catch (e) { l = null; } }
  if (!l) return vazio("sem-linha");
  let cascata;
  try { cascata = prioridadesEmCascata(l); } catch (e) { return vazio("cascata falhou"); }
  if (!cascata || !cascata.size) return vazio("cascata vazia");
  const agora = new Date().toISOString();
  const mexidos = [];
  for (const r of pedidosDe(op.id)) {
    if (!PED_VIVO.includes(r.status)) continue;   /* retornada, cancelada, excluída: não se mexe */
    if (r.prioridadeTravada) continue;            /* trava manual é a última palavra */
    const c = cascata.get(r.id);
    if (!c || c.prioridade == null) continue;     /* fora da cascata: não chuto */
    const antes = r.prioridade;
    if (c.prioridade === antes) continue;         /* só grava o que mudou de verdade */
    /* Pedido que JÁ ESTÁ FORA só muda de verdade quando alguém liga para a
       prestadora. A marca fica de lembrete — subiu, para pedir urgência;
       desceu, para liberar ela a deixar de lado e pegar o urgente. */
    if (r.status === "enviada" || r.status === "chegou") {
      r.avisar = { de: antes, para: c.prioridade, em: iso(hoje()),
        sentido: c.prioridade < antes ? "subiu" : "desceu" };
    }
    r.prioridade = c.prioridade;
    r.atualizadoEm = agora;
    registrar(op.id, `pedido ${r.numero} acompanhou a prioridade automática`,
      { prioridade: antes }, { prioridade: r.prioridade }, analiseId || null);
    mexidos.push({ id: r.id, numero: r.numero, de: antes, para: r.prioridade,
      avisar: !!r.avisar });
  }
  return { mexidos, motivo: "ok" };
}

function registrar(opId, tipo, de, para, analiseId) {
  S.eventos.push({ id: uid(), opId, tipo, de, para, analiseId: analiseId || null, em: new Date().toISOString(),
    por: (typeof usuarioAtual === "function" && usuarioAtual()?.nome) || null });
  /* A PODA SÓ VALE ENQUANTO A TRILHA É DOCUMENTO. Com `eventos_escrita`
     ligada, cada evento já foi (ou vai ser) para `pcp_evento`, que é
     append-only e não corta — cortar aqui só faria a TELA esquecer, e a tela
     esquecer é o que sempre disfarçou a perda. */
  const podar = !(typeof evEscreveNaTabela === "function" && evEscreveNaTabela());
  if (podar && S.eventos.length > 4000) S.eventos = S.eventos.slice(-3000);
  _pendentes.add("eventos");   /* grava no documento próprio, fora do núcleo */
}

/* Prioridade derivada da situação do estoque. Corte 1 é o que rompe antes de ficar pronto. */
function prioridadeDe(l) {
  /* bandas do %Estoque (real ÷ mínimo), fechadas no CENTÉSIMO — o número redondo abre a faixa seguinte:
     0 -> Crítico · 0,01%–24,99% Urgente · 25,00%–49,99% P1 · 50,00%–74,99% P2 · 75,00%–100% P3 */
  /* sem venda no período (item de data festiva, lançamento) não é emergência: ele precisa ser
     produzido, mas não pode furar a fila na frente de quem está zerando de verdade. */
  if (l.semVenda) return 4;
  if ((l.estoqueReal ?? 0) <= 0) return 0;
  const pct = l.pctEstoque;
  if (pct == null) return 4;
  const cent = Math.round(pct * 10000) / 100; /* % com duas casas */
  if (cent < 25) return 1;
  if (cent < 50) return 2;
  if (cent < 75) return 3;
  return 4;
}
/* dados antigos usavam 3 níveis; sobe tudo um degrau (P1 antigo vira P1 novo etc.) */
function remapEscala4() {
  for (const o of S.ops) o.prioridade = Math.min(4, (Number(o.prioridade) || 3) + 1);
  for (const r of S.pedidos) r.prioridade = Math.min(4, (Number(r.prioridade) || 3) + 1);
  S.cfg.escala4 = true;
}


/* ---------- pontos de restauração: uma foto por dia, dois dias guardados ---------- */
function dumpPonto() {
  return { em: new Date().toISOString(), nucleo: dumpSecao("nucleo"), produtos: S.produtos,
    cad: S.cad, cfg: S.cfg, equipe: S.equipe };
}
async function pontoCriarSePrecisar() {
  try {
    if (!S.pedidos.length && !S.produtos.length) return;
    if (usoStorage().pct > 75) return; /* sem espaço para fotos — o medidor em Dados avisa */
    const hojeStr = iso(hoje());
    const p0 = await lerDoc(NS + ":resto0");
    if (p0 && String(p0.em).slice(0, 10) === hojeStr) return; /* já tem a de hoje */
    if (p0) await gravarDoc(NS + ":resto1", p0); /* a de hoje vira a de ontem */
    await gravarDoc(NS + ":resto0", dumpPonto());
    S.falhaPonto = null;
  } catch (e) {
    /* o ponto de restauração é a rede de segurança do dia. Ele já falhou em
       silêncio uma vez (7.76) e ninguém percebeu — agora fica no console e no
       diagnóstico, que é onde se procura quando algo dá errado. */
    console.error("ponto de restauração", e);
    S.falhaPonto = { em: new Date().toISOString(), erro: String(e?.message || e).slice(0, 120) };
  }
}
async function pontosListar() {
  const [a, b] = await Promise.all([lerDoc(NS + ":resto0"), lerDoc(NS + ":resto1")]);
  return [a, b].filter(Boolean);
}
async function pontoRestaurar(idx) {
  const p = await lerDoc(NS + (idx === 0 ? ":resto0" : ":resto1"));
  if (!p) return false;
  /* restaurar um ponto TROCA listas inteiras — é o mesmo perigo da importação:
     com a escrita de cadastro ligada, o que o ponto não tem viraria remoção no
     servidor. A guarda retém em vez de remover. */
  /* v8.74 · P7 · as NECESSIDADES entram na mesma guarda: restaurar um ponto
     troca `S.ops` inteiro, e o que o ponto não tem não é remoção da pessoa. */
  const trocandoCad = typeof cadDuranteTrocaDeListas === "function"
    ? cadDuranteTrocaDeListas : (f) => f();
  const trocandoDem = typeof demDuranteTrocaDeListas === "function"
    ? demDuranteTrocaDeListas : (f) => f();
  const trocando = (f) => trocandoCad(() => trocandoDem(f));
  return await trocando(async () => {
    S.ops = p.nucleo?.ops || []; S.pedidos = p.nucleo?.pedidos || []; S.analises = p.nucleo?.analises || [];
    S.eventos = p.nucleo?.eventos || []; S.faltas = p.nucleo?.faltas || [];
    S.produtos = p.produtos || []; S.cad = p.cad || S.cad; S.cfg = { ...CFG_PADRAO, ...(p.cfg || {}) }; S.equipe = p.equipe || [];
    S.ops.forEach(recalcularOP);
    S.calc = calcular();
    await salvarTudo("nucleo", "produtos", "cad", "cfg", "equipe");
    return true;
  });
}
/* ---------- previsões da série histórica ---------- */
function diasAteZerar(l) {
  const vd = Number(l?.vendaDia) || 0;
  if (vd <= 0) return null;
  return Math.max(0, Math.round((Number(l.estoqueReal) || 0) / vd));
}
function tendenciaVendas(sku) {
  const pts = histDoSku(sku);
  if (pts.length < 2) return null;
  const a = pts[0].vendas, b = pts[pts.length - 1].vendas;
  if (!a) return null;
  return Math.round(((b - a) / a) * 100);
}


/* ---------- conserto das continuações antigas ----------
   Até a 7.39, todo pedido -A nascia com `processo: "COLA"`. Como "COLA" é etapa e
   não processo, esses pedidos ficaram sem setor (ninguém recebia a tarefa) e sem
   as etapas certas para marcar. Aqui eles voltam ao processo do produto, com as
   etapas que faltavam. Só mexe em pedido ainda vivo: o que já foi produzido fica
   como está, para não alterar fechamento nem histórico. */
function migrarEspelhosCola() {
  let n = 0;
  for (const r of S.pedidos) {
    if (!ehEspelho(r) || String(r.processo || "").toUpperCase() !== "COLA") continue;
    if (!PED_VIVO.includes(r.status)) continue;
    const prod = produtoDe(opPorId(r.opId)?.sku || r.sku);
    const proc = prod?.processo;
    if (!proc || String(proc).toUpperCase() === "COLA") continue;
    const todas = (tplDoProcesso(proc).etapas || []).map((e) => String(e).toUpperCase());
    if (!todas.length) continue;
    const pai = S.pedidos.find((x) => x.numero === String(r.numero).replace(/-A$/i, ""));
    const feitas = new Set(pai ? etapasDoPedido(pai).map((e) => String(e).toUpperCase()) : []);
    const restantes = todas.filter((e) => !feitas.has(e));
    r.processo = proc;
    if (!Array.isArray(r.etapasUsadas) || !r.etapasUsadas.length)
      r.etapasUsadas = restantes.length ? restantes : (todas.length > 1 ? todas.slice(1) : null);
    n++;
  }
  return n;
}

/* etapas que ESTE pedido usa: escolha do pedido > padrão do produto > estrutura completa */
function etapasDoPedido(r) {
  const sku = (typeof opPorId === "function" && opPorId(r.opId)?.sku) || r.sku;
  const prod = produtoDe(sku);
  const tpl = tplDoProcesso(r.processo || prod?.processo);
  const todas = tpl.etapas;
  const escolha = (Array.isArray(r.etapasUsadas) && r.etapasUsadas.length ? r.etapasUsadas
    : Array.isArray(prod?.etapasUsadas) && prod.etapasUsadas.length ? prod.etapasUsadas : null);
  if (!escolha) return todas;
  const norm = (x) => String(x).toUpperCase();
  const set = new Set(escolha.map(norm));
  const filtradas = todas.filter((e) => set.has(norm(e)));
  return filtradas.length ? filtradas : todas;
}
