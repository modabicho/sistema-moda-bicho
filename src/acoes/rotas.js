const ROTA_ACAO = (() => {
  const mapa = new Map();
  for (const grupo of [acoesPedidos, acoesCadastros, acoesFabrica, acoesInsumos, acoesSistema])
    for (const m of String(grupo).matchAll(/act === "([\w-]+)"/g))
      if (!mapa.has(m[1])) mapa.set(m[1], grupo);
  return mapa;
})();
