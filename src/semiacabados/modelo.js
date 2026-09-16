/* ---------- as remessas ---------- */
const remessas = () => S.remessas || (S.remessas = []);
const remessaPorId = (id) => remessas().find((r) => r.id === id) || null;
const retornosDe = (r) => (r?.retornos || []);
/* ---------- o número da remessa É um número de pedido ----------
   Sai da mesma sequência dos pedidos de produção, no mesmo formato de quatro
   dígitos, e nunca se repete — nem com outra remessa, nem com um pedido, nem
   com um cancelado. Uma sequência paralela faria "o 1549" deixar de ser uma
   resposta: duas coisas diferentes atenderiam pelo mesmo nome.

   O que fica em aberto é a QUANTIDADE, nunca a identificação. */
const proximoNumeroRemessa = () => String(proximoNumeroPedido()).padStart(4, "0");

/* remessas criadas na 7.96/7.97 tinham numeração própria (1, 2, 3…). Elas passam
   uma única vez para a sequência geral, guardando de onde vieram — renumerar sem
   deixar rastro seria trocar a identidade de um registro pelas costas de quem o
   anotou. Roda no fim do boot, quando os pedidos já estão na memória. */
/* remessas criadas antes da 8.00 não tinham processo, etapas nem `retornadaEm`.
   Sem `retornadaEm` elas não têm mês, e sem mês não entram em fechamento nenhum —
   ficariam invisíveis no dinheiro para sempre. O processo vem da prestadora
   quando ela tem um só; com duas ou mais o app não adivinha e deixa em branco,
   que é o estado honesto: "falta dizer". */
function migrarRemessasParaConferencia() {
  let n = 0;
  for (const r of remessas()) {
    let mexeu = false;
    if (!Array.isArray(r.etapas)) { r.etapas = []; mexeu = true; }
    if (r.tipo !== "remessa") { r.tipo = "remessa"; mexeu = true; }
    if (r.processo === undefined) {
      const p = (S.cad.prestadoras || []).find((x) => x.nome === r.prestadora);
      const procs = (p?.processos || []).filter(Boolean);
      r.processo = procs.length === 1 ? String(procs[0]).toUpperCase() : null;
      mexeu = true;
    }
    if (r.status === "encerrada" && !r.retornadaEm) {
      r.retornadaEm = ultimoRetornoEm(r) || r.encerradaEm || null;
      mexeu = true;
    }
    if (mexeu) n++;
  }
  return n;
}

function migrarNumerosRemessa() {
  const antigas = remessas().filter((r) => !r.seqGeral);
  if (!antigas.length) return 0;
  antigas.sort((a, b) => String(a.em).localeCompare(String(b.em)));
  for (const r of antigas) {
    r.numeroAntigo = r.numero;
    r.numero = proximoNumeroRemessa();
    r.tipo = "remessa";
    r.seqGeral = true;
  }
  return antigas.length;
}

/* ==========================================================================
   A REMESSA É TRABALHO DA PRESTADORA
   ==========================================================================
   Daiana recebeu uma caixa de bandana cortada e devolveu 1.890 costuradas. Isso
   é trabalho: tem etapa, tem valor por peça e tem de entrar no fechamento dela
   como qualquer pedido. Até a 7.99 a remessa era só um controle de material —
   ela aparecia em Semiacabados, não aparecia em lugar nenhum do dinheiro.

   A ponte é curta de propósito. A remessa já tem número da sequência dos
   pedidos, prestadora e data; faltavam três coisas:

     processo      qual estrutura de etapas ela usa (de onde sai o valor/peça)
     etapas        o que foi lançado na conferência — o mesmo formato do pedido
     retornadaEm   a data que define o mês de pagamento

   Com isso, `conferenciaDe`, `valorDoPedido` e `fechamentoDe` funcionam sobre a
   remessa sem nenhuma cópia: continua sendo UM registro, agora visto de três
   lugares (Semiacabados, Pedidos e Conferência).

   QUANDO ela entra no dinheiro: ao ser ENCERRADA. É a mesma regra manual que a
   fábrica já escolheu para o material — o app não decide sozinho que acabou, e
   o mês é o do último retorno. Enquanto está com a prestadora, ela não tem o
   que pagar, porque ainda não se sabe quanto voltou. */
const ehRemessa = (r) => r?.tipo === "remessa";
/* a quantidade sobre a qual o trabalho é medido. No pedido é o que saiu no
   papel; na remessa é o que voltou — na saída não existe quantidade. */
const qtdTrabalhada = (r) => ehRemessa(r) ? voltouNaRemessa(r).total : (Number(r?.qtd) || 0);
/* encerradas e com retorno: é o que tem trabalho medido para pagar */
const remessasConferiveis = () => remessas().filter((r) => r.status === "encerrada" && retornosDe(r).length);
const ultimoRetornoEm = (r) => retornosDe(r).reduce((mx, x) => {
  const d = x.data || x.em; return !mx || String(d) > String(mx) ? d : mx; }, null);
/* os retornos caíram em meses diferentes? o fechamento é mensal, e pagar tudo
   no mês do último retorno seria empurrar trabalho de agosto para setembro */
function mesesDosRetornos(r) {
  return [...new Set(retornosDe(r).map((x) => compFmt(pdate(x.data || x.em))).filter(Boolean))];
}

/* o que saiu, em uma frase: "Bandana M · Dia a dia" ou "Bandana G · Halloween".
   Sai da leitura dos códigos internos ligados à remessa — não é campo copiado,
   então nunca fica dizendo uma coisa enquanto o vínculo diz outra. */
function remessaResumo(r) {
  const ts = (r?.itens || []).map(semiPorId).filter(Boolean);
  if (!ts.length) return "";
  const tipos = [...new Set(ts.map((t) => String(t.tipo || "Bandana").trim()))];
  const tams = [...new Set(ts.map((t) => t.tamanho).filter(Boolean))];
  const grupos = [...new Set(ts.map((t) => t.categoria === "festiva"
    ? (String(t.campanha || "").trim() || "Data festiva") : "Dia a dia"))];
  return [tipos.join("/"), tams.join("/"), grupos.join(" e ")].filter(Boolean).join(" · ");
}
function novaRemessa(d) {
  const prestadora = String(d?.prestadora || "").trim();
  if (!prestadora) return null;
  const r = { id: uid(), numero: proximoNumeroRemessa(), tipo: "remessa", seqGeral: true, prestadora,
    em: new Date().toISOString(), por: usuarioAtual()?.nome || null,
    data: d?.data || null,                       /* o dia que ela informou */
    /* VOLUME: o que se conta na saída. Duas caixas são duas caixas — e ponto.
       Não existe conversão para peças, aqui nem em lugar nenhum. */
    volumeQtd: Number(d?.volumeQtd) > 0 ? Number(d.volumeQtd) : null,
    volumeUn: SEMI_UNS.includes(d?.volumeUn) ? d.volumeUn : "caixa",
    /* o processo é de onde sai o valor por peça no fechamento. Sem ele a remessa
       ainda funciona como controle de material — só não tem o que pagar. */
    processo: String(d?.processo || "").trim().toUpperCase() || null,
    etapas: [],
    /* o que foi na remessa, por tamanho, SEM quantidade. Pode misturar: P, M e
       G na mesma caixa é o normal, e cada um volta contado separado. */
    itens: [...new Set((d?.itens || []).filter(Boolean))].filter((id) => semiPorId(id)),
    obs: String(d?.obs || "").trim() || null,
    status: "aberta", retornos: [], atualizado: new Date().toISOString() };
  remessas().push(r);
  return r;
}
/* uma remessa em aberto aceita quantos retornos vierem. Nenhum deles a encerra:
   quem encerra é gente, no botão, quando souber que acabou. */
function registrarRetorno(remId, dados) {
  const r = remessaPorId(remId);
  if (!r || r.status === "encerrada") return null;
  const itens = (dados?.itens || [])
    .map((x) => ({ semiId: x.semiId, qtd: Number(x.qtd) || 0 }))
    .filter((x) => x.semiId && semiPorId(x.semiId) && x.qtd > 0);
  if (!itens.length) return null;
  const ret = { id: uid(), em: new Date().toISOString(), data: dados?.data || null,
    por: usuarioAtual()?.nome || null, itens, obs: String(dados?.obs || "").trim() || null };
  r.retornos = [...retornosDe(r), ret];
  r.atualizado = ret.em;
  return ret;
}
function desfazerRetorno(remId, retId) {
  const r = remessaPorId(remId); if (!r) return false;
  const antes = retornosDe(r).length;
  r.retornos = retornosDe(r).filter((x) => x.id !== retId);
  if (r.retornos.length === antes) return false;
  r.atualizado = new Date().toISOString();
  return true;
}
function encerrarRemessa(id, motivo) {
  const r = remessaPorId(id); if (!r || r.status === "encerrada") return false;
  r.status = "encerrada"; r.encerradaEm = new Date().toISOString();
  r.encerradaPor = usuarioAtual()?.nome || null;
  r.encerradaMotivo = String(motivo || "").trim() || null;
  /* é esta data que `competenciaDe` lê para dizer em que mês a prestadora
     recebe. O dia do ÚLTIMO retorno, não o de hoje: encerrar em outubro uma
     remessa que voltou em agosto não move o trabalho de mês. */
  r.retornadaEm = ultimoRetornoEm(r) || r.encerradaEm;
  r.atualizado = r.encerradaEm;
  return true;
}
function reabrirRemessa(id) {
  const r = remessaPorId(id); if (!r || r.status !== "encerrada") return false;
  /* mês fechado é mês fechado: reabrir uma remessa já paga tiraria valor de um
     fechamento que a prestadora assinou */
  const comp = competenciaDe(r);
  if (comp && mesFechado(comp)) return { erro: `A remessa ${r.numero} está no fechamento de ${comp}, que já foi fechado. Reabra o mês em Prestadoras primeiro.` };
  r.status = "aberta";
  delete r.encerradaEm; delete r.encerradaPor; delete r.encerradaMotivo;
  delete r.retornadaEm;
  r.atualizado = new Date().toISOString();
  return true;
}
/* três situações, e só uma delas o app decide sozinho */
function situacaoRemessa(r) {
  /* "Com a prestadora" e não "Em aberto": o que está aberto é a quantidade, e
     dizer isso no lugar da situação confundia as duas coisas. A situação
     responde ONDE a bandana está. */
  /* ---------- etapa é neutra; só a exceção tem cor ----------
     "Com a prestadora" era âmbar e "Encerrada" era neutra: exatamente ao
     contrário. Estar com a prestadora é o caminho normal de toda remessa — se
     isso pisca, tudo pisca. Retorno parcial também é etapa: a remessa está
     voltando aos poucos, que é o previsto. Quem merece cor é o fim (deu certo)
     e a remessa PARADA, que já tinha a etiqueta própria. */
  const fora = { id: "aberta", nome: "Com a prestadora", tom: "neutro" };
  if (!r) return fora;
  if (r.status === "encerrada") return { id: "encerrada", nome: "Encerrada", tom: "ok" };
  return retornosDe(r).length ? { id: "parcial", nome: "Retorno parcial", tom: "neutro" } : fora;
}
const remessaAberta = (r) => r && r.status !== "encerrada";
const remessasAbertas = () => remessas().filter(remessaAberta);
const remessasDaPrestadora = (nome) => remessas().filter((r) => String(r.prestadora) === String(nome || "").trim());
/* quantas peças já voltaram numa remessa, no total e por tamanho */
function voltouNaRemessa(r) {
  const porTipo = new Map(); let total = 0;
  for (const ret of retornosDe(r)) for (const it of ret.itens || []) {
    const q = Number(it.qtd) || 0; if (!q) continue;
    porTipo.set(it.semiId, (porTipo.get(it.semiId) || 0) + q); total += q;
  }
  return { total, porTipo };
}
/* dias parada em aberto — é o que faz uma remessa esquecida aparecer */
const diasDaRemessa = (r) => { const d = pdate(r?.data || r?.em); return d ? dias(d, hoje()) : null; };

/* ---------- ajustes de saldo à mão ---------- */
const semiAjustes = () => S.semiAjustes || (S.semiAjustes = []);
function novoAjusteSemi(d) {
  const semiId = d?.semiId; const qtd = Number(d?.qtd) || 0;
  if (!semiId || !semiPorId(semiId) || !qtd) return null;
  const a = { id: uid(), semiId, qtd, data: d?.data || null,
    motivo: String(d?.motivo || "").trim() || null,
    em: new Date().toISOString(), por: usuarioAtual()?.nome || null };
  semiAjustes().push(a);
  return a;
}

/* ---------- o saldo, lido do que aconteceu ----------
   Regra da casa: saldo não é campo, é conta. Nada aqui guarda um número de
   estoque — ele nasce toda vez da soma dos retornos, mais os ajustes, menos o
   que já virou produto acabado. Assim não existe saldo que "descolou". */
function entradasSemi(semiId) {
  let t = 0;
  for (const r of remessas()) for (const ret of retornosDe(r)) for (const it of ret.itens || [])
    if (it.semiId === semiId) t += Number(it.qtd) || 0;
  return t;
}
const ajustesSemi = (semiId) => semiAjustes().reduce((t, a) => a.semiId === semiId ? t + (Number(a.qtd) || 0) : t, 0);
/* a conversão semiacabado -> SKU é o próximo bloco. Enquanto ela não existe,
   isto devolve zero — e o saldo já está montado para descontar sem mexer em
   mais nada quando ela chegar. */
const consumoSemi = (semiId) => (S.semiConsumos || []).reduce((t, c) => c.semiId === semiId ? t + (Number(c.qtd) || 0) : t, 0);
const saldoSemi = (semiId) => entradasSemi(semiId) + ajustesSemi(semiId) - consumoSemi(semiId);
const totalSemiEmEstoque = () => semiTipos().reduce((t, x) => t + saldoSemi(x.id), 0);
const semiAbaixoDoMinimo = () => semiAtivos().filter((t) => Number(t.minimo) > 0 && saldoSemi(t.id) < Number(t.minimo));

/* o extrato de um semiacabado: de onde veio cada peça */
function movimentosSemi(semiId, limite = 200) {
  const lin = [];
  for (const r of remessas()) for (const ret of retornosDe(r)) {
    const q = (ret.itens || []).reduce((t, it) => it.semiId === semiId ? t + (Number(it.qtd) || 0) : t, 0);
    if (!q) continue;
    lin.push({ em: ret.em, quando: ret.data || ret.em, tipo: "retorno", qtd: q,
      /* auditoria: a entrada no estoque diz de qual pedido e de quem ela veio.
         Sem isso, um saldo estranho vira arqueologia. */
      texto: `pedido ${r.numero} · retorno de ${primeiroNome(r.prestadora)}`,
      remessaId: r.id, por: ret.por, obs: ret.obs });
  }
  for (const a of semiAjustes()) {
    if (a.semiId !== semiId) continue;
    lin.push({ em: a.em, quando: a.data || a.em, tipo: "ajuste", qtd: Number(a.qtd) || 0,
      texto: a.motivo || "ajuste de saldo", por: a.por, obs: null });
  }
  return lin.sort((a, b) => String(b.em).localeCompare(String(a.em))).slice(0, limite);
}

async function gravarSemi(msg) {
  if (msg) registrar(null, msg, null, null);
  render();
  await salvarTudo("semi");
}

/* ---------- a linha do tempo de uma prestadora ----------
   Não é log novo: é leitura do que já fica gravado. Todo movimento nasce com
   `em` e `por`, e toda posse também — a linha do tempo só junta as duas
   histórias e ordena. */
function linhaDoTempoPrestadora(nome, limite = 200) {
  const alvo = String(nome || "").trim(); if (!alvo) return [];
  const itens = [];
  for (const x of saidasDaPrestadora(alvo)) {
    const b = bemPorId(x.bemId);
    const rot = `${b ? b.nome : "item removido"} · ${nDec(x.qtd)} ${b?.unidade || "un"}`;
    itens.push({ em: x.em, quando: x.saiuEm, por: x.por, rotulo: "Saiu", texto: rot, classe: "saida" });
    for (const bx of baixasDe(x)) {
      itens.push({ em: bx.em, quando: bx.em, por: bx.por, classe: "ok",
        rotulo: bx.tipo === "consumo" ? "Consumo na produção" : "Devolvido",
        texto: `${b ? b.nome : "item removido"} · ${nDec(bx.qtd)} ${b?.unidade || "un"}`,
        doc: bx.doc || null });
    }
  }
  for (const p of posses()) {
    if (String(p.prestadora || "") !== alvo) continue;
    itens.push({ em: p.em, quando: p.data || p.em, por: p.por, rotulo: "Produção enviada",
      texto: posseRotulo(p), classe: "saida", posseId: p.id });
    if (p.status === "encerrada" && p.encerradaEm)
      itens.push({ em: p.encerradaEm, quando: p.encerradaEm, por: p.encerradaPor, rotulo: "Produção encerrada",
        texto: `${posseRotulo(p)}${p.encerradaMotivo ? ` — ${p.encerradaMotivo}` : ""}`, classe: "ok", posseId: p.id });
  }
  return itens.sort((a, b) => String(b.em).localeCompare(String(a.em))).slice(0, limite);
}

/* ---------- o de-para com o fornecedor ----------
   O código que vem na nota é do fornecedor, não seu. "EVA-3MM-AZ" na NF é o
   "INS-001" aqui dentro. Guardar essa ponte é o que faz a segunda nota do mesmo
   fornecedor entrar sozinha. */
function vincularCodigoFornecedor(insumoId, fornecedorId, codigo, descricao) {
  const i = insumoPorId(insumoId);
  if (!i || !codigo) return;
  i.codigosFornecedor = i.codigosFornecedor || [];
  const cod = String(codigo).trim();
  if (i.codigosFornecedor.some((c) => c.fornecedorId === fornecedorId && c.codigo === cod)) return;
  i.codigosFornecedor.push({ fornecedorId, codigo: cod, descricao: descricao || null, em: iso(hoje()) });
  if (!i.fornecedorId) i.fornecedorId = fornecedorId;
  else if (i.fornecedorId !== fornecedorId) {
    i.outrosFornecedores = [...new Set([...(i.outrosFornecedores || []), fornecedorId])];
  }
}
function insumoPorCodigoFornecedor(fornecedorId, codigo) {
  const cod = String(codigo || "").trim().toLowerCase();
  if (!cod) return null;
  return insumos().find((i) => (i.codigosFornecedor || [])
    .some((c) => c.fornecedorId === fornecedorId && String(c.codigo).toLowerCase() === cod)) || null;
}
/* palpite quando não há vínculo: nome parecido. Nunca liga sozinho — só sugere,
   porque errar aqui contamina o estoque de dois insumos ao mesmo tempo. */
function palpiteInsumo(descricao) {
  const alvo = normIns(descricao);
  if (!alvo) return null;
  const pal = alvo.split(/\s+/).filter((p) => p.length > 2);
  let melhor = null, melhorN = 0;
  for (const i of insumos()) {
    const meu = normIns(i.nome).split(/\s+/);
    const n = pal.filter((p) => meu.some((m) => m.includes(p) || p.includes(m))).length;
    if (n > melhorN) { melhorN = n; melhor = i; }
  }
  return melhorN >= 2 ? melhor : null;
}

const salvarInsumos = async () => { render(); await salvarTudo("insumos"); };

