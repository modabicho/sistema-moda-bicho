/* ---------- cadastrar: um caminho só, para todos os lugares que cadastram ----------
   Havia quatro trechos diferentes empurrando valor para dentro dessas listas —
   a janela de embalagens, o campo dentro do produto, o "＋ cadastrar novo" do
   lote e o do seletor. Cada um validava do seu jeito. Agora todos passam por
   aqui, e a regra é a mesma em qualquer porta de entrada. */
function cadastrarTamanhoEmb(txt) {
  const v = normalizarTamanho(txt);
  if (!v) return { erro: "Informe o tamanho no formato 6x12." };
  S.cad.tamanhosEmbalagem = S.cad.tamanhosEmbalagem || [];
  if (tamanhosEmbalagemOrdenados().includes(v)) return { erro: `Este tamanho já está cadastrado (${v}).`, valor: v, jaTinha: true };
  S.cad.tamanhosEmbalagem = [...tamanhosEmbalagemOrdenados(), v].sort(compararTamanhos);
  return { valor: v };
}
function cadastrarQtdEmb(txt) {
  const v = normalizarQtdEmb(txt);
  if (!v) return { erro: "Informe uma quantidade inteira maior que zero." };
  S.cad.qtdsEmbalagem = S.cad.qtdsEmbalagem || [];
  if (qtdsEmbalagemOrdenadas().includes(v)) return { erro: `Esta quantidade já está cadastrada (${n0(v)}).`, valor: v, jaTinha: true };
  S.cad.qtdsEmbalagem = [...qtdsEmbalagemOrdenadas(), v].sort((a, b) => a - b);
  return { valor: v };
}

/* ---------- a migração ----------
   Conserta o CADASTRO, não só a aparência: a lista e o valor gravado dentro de
   cada produto. Sem a segunda parte, a lista fica limpa e os produtos continuam
   com `9X9` — e o seletor do produto abriria sem nada selecionado, porque o
   valor dele não bate com nenhuma opção. */
function migrarEmbalagens() {
  const antesT = (S.cad?.tamanhosEmbalagem || []).slice();
  const antesQ = (S.cad?.qtdsEmbalagem || []).slice();
  S.cad = S.cad || {};
  S.cad.tamanhosEmbalagem = tamanhosEmbalagemOrdenados();
  S.cad.qtdsEmbalagem = qtdsEmbalagemOrdenadas();
  let prods = 0;
  for (const p of (S.produtos || [])) {
    const pr = p.producao; if (!pr) continue;
    const t = pr.embalagemTamanho;
    if (t != null && t !== "") {
      const nv = normalizarTamanho(t);
      /* valor que não obedece à regra fica como está: apagar o dado de alguém
         para fazer a lista fechar seria pior do que a inconsistência */
      if (nv && nv !== t) { pr.embalagemTamanho = nv; prods++; }
    }
    const q = pr.qtdPorEmbalagem;
    if (q != null && q !== "") {
      const nq = normalizarQtdEmb(q);
      if (nq && nq !== q) { pr.qtdPorEmbalagem = nq; prods++; }
    }
  }
  const listas = (antesT.length !== S.cad.tamanhosEmbalagem.length || antesT.join("|") !== S.cad.tamanhosEmbalagem.join("|"))
    || (antesQ.length !== S.cad.qtdsEmbalagem.length || antesQ.join("|") !== S.cad.qtdsEmbalagem.join("|"));
  return { listas, prods,
    tamanhosAntes: antesT.length, tamanhosDepois: S.cad.tamanhosEmbalagem.length,
    qtdsAntes: antesQ.length, qtdsDepois: S.cad.qtdsEmbalagem.length };
}

