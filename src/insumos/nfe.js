/* ---------- ler a NF-e ----------
   O XML da nota é a fonte mais confiável que existe para uma entrada: fornecedor,
   número, data, chave, itens, quantidades e valores já vêm conferidos pela SEFAZ.
   Digitar isso à mão é onde nasce o erro de quantidade que só aparece no
   inventário, três meses depois.

   Guardamos os DADOS e a CHAVE, não o arquivo: a DANFE se consulta a qualquer
   momento no portal da SEFAZ pela chave, e o XML dentro do app engordaria o
   pacote que carrega junto com pedidos e produtos toda vez que alguém abre a tela. */
function lerXmlNFe(texto) {
  const doc = new DOMParser().parseFromString(texto, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("Este arquivo não é um XML válido.");
  const t = (no, tag) => no?.getElementsByTagName(tag)?.[0]?.textContent?.trim() || null;
  const num = (no, tag) => { const v = t(no, tag); return v == null ? null : Number(String(v).replace(",", ".")); };

  const inf = doc.getElementsByTagName("infNFe")[0];
  if (!inf) throw new Error("Não achei a nota dentro deste XML. Ele é mesmo uma NF-e?");
  const ide = doc.getElementsByTagName("ide")[0];
  const emit = doc.getElementsByTagName("emit")[0];
  const tot = doc.getElementsByTagName("ICMSTot")[0];
  const chave = String(inf.getAttribute("Id") || "").replace(/^NFe/i, "");
  const dh = t(ide, "dhEmi") || t(ide, "dEmi");

  const itens = [...doc.getElementsByTagName("det")].map((det) => {
    const prod = det.getElementsByTagName("prod")[0];
    return {
      n: Number(det.getAttribute("nItem")) || null,
      codigoForn: t(prod, "cProd"),
      descricao: t(prod, "xProd"),
      ncm: t(prod, "NCM"),
      unidade: t(prod, "uCom"),
      qtd: num(prod, "qCom") || 0,
      vUnit: num(prod, "vUnCom") || 0,
      vTotal: num(prod, "vProd") || 0,
      frete: num(prod, "vFrete") || 0,
      desconto: num(prod, "vDesc") || 0,
      insumoId: null,
    };
  });
  if (!itens.length) throw new Error("A nota não tem itens.");

  return {
    chave: chave || null,
    numero: t(ide, "nNF"), serie: t(ide, "serie"),
    emitidaEm: dh ? String(dh).slice(0, 10) : null,
    fornecedorNome: t(emit, "xNome") || t(emit, "xFant"),
    cnpj: t(emit, "CNPJ"),
    frete: num(tot, "vFrete") || 0,
    desconto: num(tot, "vDesc") || 0,
    total: num(tot, "vNF") || itens.reduce((s2, i) => s2 + i.vTotal, 0),
    itens,
  };
}

/* casa o que veio na nota com o cadastro: primeiro pelo código do fornecedor
   (vínculo já feito), depois por palpite de nome — que sugere, nunca decide */
function casarItensNF(nf, fornecedorId) {
  let porCodigo = 0, porPalpite = 0;
  for (const it of nf.itens) {
    it.origem = null; it.insumoId = null;
    const cod = fornecedorId ? insumoPorCodigoFornecedor(fornecedorId, it.codigoForn) : null;
    if (cod) { it.insumoId = cod.id; it.origem = "codigo"; porCodigo++; continue; }
    /* O palpite JÁ preenche o campo — deixá-lo escolhido na tela mas fora da
       conta fazia o rodapé dizer "1 item entra" com três campos preenchidos.
       Ele entra, mas a linha continua marcada até alguém confirmar: velocidade
       sem esconder que aquilo foi chute do app, não decisão de gente. */
    const p = palpiteInsumo(it.descricao);
    if (p) { it.insumoId = p.id; it.origem = "palpite"; porPalpite++; }
  }
  return { jaVinculados: porCodigo, porPalpite, pendentes: nf.itens.filter((i) => !i.insumoId).length };
}

/* ---------- registrar a entrada ----------
   Uma nota vira: um registro de entrada (o documento) + um movimento por item
   (o estoque). Os dois nascem juntos ou nenhum nasce — se metade entrasse, o
   saldo ficaria contando uma nota que ninguém consegue achar. */
function registrarEntradaNF(nf, fornecedorId) {
  const itens = nf.itens.filter((i) => i.insumoId && (Number(i.qtd) || 0) > 0);
  if (!itens.length) return { erro: "Nenhum item vinculado a um insumo." };
  if (nf.chave && entradasNF().some((e) => e.chave && e.chave === nf.chave))
    return { erro: "Esta nota já foi registrada — a chave é a mesma." };

  const ent = {
    id: uid(), numero: nf.numero, serie: nf.serie, chave: nf.chave || null,
    fornecedorId: fornecedorId || null, fornecedorNome: nf.fornecedorNome, cnpj: nf.cnpj,
    emitidaEm: nf.emitidaEm, entradaEm: nf.entradaEm || iso(hoje()),
    frete: nf.frete || 0, desconto: nf.desconto || 0, total: nf.total || 0,
    criadaEm: new Date().toISOString(), por: usuarioAtual()?.nome || null,
    itens: itens.map((i) => ({ codigoForn: i.codigoForn, descricao: i.descricao, ncm: i.ncm,
      unidade: i.unidade, qtd: Number(i.qtd) || 0, vUnit: Number(i.vUnit) || 0,
      vTotal: Number(i.vTotal) || 0, insumoId: i.insumoId })),
  };
  entradasNF().push(ent);

  for (const i of ent.itens) {
    moverInsumo({ insumoId: i.insumoId, tipo: "entrada", qtd: i.qtd, custoUnit: i.vUnit,
      doc: { tipo: "nf", numero: ent.numero, entradaId: ent.id, fornecedor: ent.fornecedorNome },
      obs: i.descricao !== insumoPorId(i.insumoId)?.nome ? i.descricao : null });
    /* a ponte fornecedor↔insumo se forma sozinha na primeira nota: da segunda
       em diante o item entra vinculado, sem ninguém escolher de novo */
    if (fornecedorId && i.codigoForn) vincularCodigoFornecedor(i.insumoId, fornecedorId, i.codigoForn, i.descricao);
  }
  return { entrada: ent, n: ent.itens.length };
}

