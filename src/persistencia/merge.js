/* ===========================================================================
   src/persistencia/merge.js · CONFLITO POR CAMPO, NÃO POR PEDIDO
   ---------------------------------------------------------------------------
   Item 12 da fase E.

   Duas pessoas no mesmo pedido quase nunca estão mexendo na MESMA coisa: uma
   ajusta a quantidade, a outra escreve a observação. Tratar isso como "conflito
   no pedido 1549" faz a segunda perder o trabalho por nada.

   A regra:
     · campos DIFERENTES  → junta sozinho e reenvia (com id novo: a intenção
       agora é outra, porque a base mudou debaixo dela);
     · MESMO campo        → conflito explícito, com os três valores na mão da
       pessoa: o que ela digitou, o que está no servidor, e o que havia antes
       de as duas começarem.

   Nada aqui decide por ninguém no caso do mesmo campo. "Último a salvar vence"
   é o que a Ana disse que não quer, e adivinhar qual dos dois valores é o certo
   é exatamente isso com outro nome.
   =========================================================================== */

/* `base`     — o pedido como estava quando esta pessoa começou a editar
   `meu`      — o patch que ela quer gravar (colunas snake_case)
   `servidor` — a linha atual que voltou junto com o `conflito` */
function mgClassificar(base, meu, servidor) {
  const iguais = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const automatico = {};      /* campos que só eu mexi → seguem */
  const disputados = [];      /* mesmo campo, valores diferentes → a pessoa decide */
  const jaIgual = [];         /* o outro já gravou exatamente o que eu queria */

  for (const [col, meuValor] of Object.entries(meu || {})) {
    const doServidor = servidor ? servidor[col] : undefined;
    const daBase = base ? base[col] : undefined;

    if (iguais(meuValor, doServidor)) { jaIgual.push(col); continue; }
    if (iguais(daBase, doServidor)) { automatico[col] = meuValor; continue; }
    disputados.push({ campo: col, meu: meuValor, deles: doServidor, base: daBase });
  }
  return {
    automatico,
    disputados,
    jaIgual,
    podeSozinho: disputados.length === 0,
    /* nada a fazer: o outro já gravou tudo que eu queria, campo por campo */
    nadaAFazer: disputados.length === 0 && Object.keys(automatico).length === 0,
  };
}

/* O texto que a tela mostra. Fica aqui, e não na tela, para a mesma situação
   não ganhar duas redações diferentes em dois lugares do app. */
function mgComoContar(disputados, quemMexeu) {
  const nome = (typeof PED_COLUNA !== "undefined" && PED_COLUNA) || {};
  const bonito = (c) => nome[c] || c;
  if (!disputados.length) return "";
  if (disputados.length === 1) {
    const d = disputados[0];
    return `${quemMexeu || "Outra pessoa"} mudou ${bonito(d.campo)} enquanto você editava. `
         + `Você quer ${JSON.stringify(d.meu)}; lá está ${JSON.stringify(d.deles)}.`;
  }
  return `${quemMexeu || "Outra pessoa"} mudou ${disputados.length} campos que você também mexeu: `
       + disputados.map((d) => bonito(d.campo)).join(", ") + ".";
}
