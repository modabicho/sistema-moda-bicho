/* ===========================================================================
   BATERIA · corte-modelo (v8.106)
   ---------------------------------------------------------------------------
   Mede SÓ `src/corte/modelo.js`: funções puras, sem estado global, sem tela,
   sem servidor. Nada é trocado, nada é restaurado — se esta bateria precisar
   mexer em `S`, o modelo deixou de ser puro e isso é o defeito.

     (0, eval)(await (await fetch("testes/corte-modelo.js")).text());
     await bateriaCorteModelo();
   =========================================================================== */
async function bateriaCorteModelo() {
  const res = [];
  const ok = (nome, cond, detalhe) => res.push({ nome, ok: !!cond, detalhe: cond ? undefined : String(detalhe) });
  const antesDoTeste = { pedidos: S && S.pedidos && S.pedidos.length, modal: S && S.modal };

  /* ---------- o cenário: o mesmo do protótipo, escrito à mão ----------
     família M02 · combinação M02.AD · exceção 470 · família 3xx + exceção 380 */
  const CH = { laco: "ct_laco01", perna: "ct_perna1", extra: "ct_extra1", cam: "cm_cam001" };

  const familiaM02 = {
    id: "prj_m02", nome: "Família M02", escopo: "familia", ativo: true,
    regras: [{ campo: "sku", operador: "comeca", valor: "M02" }],
    versao: { id: "prv_m02_1", versao: 1, cortesModo: "substitui", fitilhoModo: "substitui", sortimentoModo: "substitui",
      cortes: [{ chave: CH.laco, ordem: 1, operacao: "define", fitaId: "ft9", comprimentoMm: 220,
                 tipoCorte: "reto", qtd: 1, identificacao: "Laço",
                 camadas: [{ chave: CH.cam, ordem: 1, operacao: "define", fitaId: "ft9",
                             comprimentoMm: null, tipoCorte: "reto", cortarJuntas: true, condicao: null }] }],
      fitilho: { partes: 1, comprimentoMm: 700 },
      sortimento: { modo: "exato", variedade: null, itens: [] } },
  };
  const combinacaoAD = {
    id: "prj_ad", nome: "M02.AD · adulto", escopo: "combinacao", ativo: true,
    regras: [{ campo: "sku", operador: "comeca", valor: "M02.AD" }],
    versao: { id: "prv_ad_1", versao: 1, cortesModo: "ajusta", fitilhoModo: "herda", sortimentoModo: "herda",
      cortes: [{ chave: CH.laco, operacao: "substitui", comprimentoMm: 260 }] },
  };
  const familia3xx = {
    id: "prj_3xx", nome: "Família 3xx", escopo: "familia", ativo: true,
    regras: [{ campo: "sku", operador: "comeca", valor: "3" }],
    versao: { id: "prv_3xx_1", versao: 1, cortesModo: "substitui", fitilhoModo: "substitui", sortimentoModo: "herda",
      cortes: [{ chave: "ct_corpo1", ordem: 1, operacao: "define", fitaId: "ft12", comprimentoMm: 220, tipoCorte: "biqueira", qtd: 1 }],
      fitilho: { partes: 1, comprimentoMm: 800 } },
  };
  const excecao380 = {
    id: "prj_380", nome: "380 · exceção", escopo: "sku", ativo: true,
    regras: [{ campo: "sku", operador: "igual", valor: "380" }],
    versao: { id: "prv_380_1", versao: 1, cortesModo: "substitui", fitilhoModo: "herda", sortimentoModo: "substitui",
      cortes: [{ chave: "ct_corpo2", ordem: 1, operacao: "define", fitaId: "ft12", comprimentoMm: 240, tipoCorte: "biqueira", qtd: 1 }],
      sortimento: { modo: "sortido", variedade: "estampado",
        itens: [{ genero: "macho", qtd: 2 }, { genero: "neutro", qtd: 1 }, { genero: "femea", qtd: 2 }] } },
  };
  const semFitilho = {
    id: "prj_m02pr", nome: "M02.PR · sem fitilho", escopo: "sku", ativo: true,
    regras: [{ campo: "sku", operador: "igual", valor: "M02.PR" }],
    versao: { id: "prv_pr_1", versao: 1, cortesModo: "herda", fitilhoModo: "remove", sortimentoModo: "herda" },
  };
  const BASE = [familiaM02, combinacaoAD, familia3xx, excecao380, semFitilho];

  try {
    /* 1 · família < combinação < SKU */
    const apl = crtAplicaveis(BASE, "M02.AD");
    ok("1.1 duas regras casam com M02.AD, da mais geral para a mais específica",
      apl.length === 2 && apl[0].id === "prj_m02" && apl[1].id === "prj_ad",
      apl.map((p) => p.id).join(" → "));
    ok("1.2 o peso ordena família < combinação < SKU",
      crtPeso(familiaM02) < crtPeso(combinacaoAD) && crtPeso(combinacaoAD) < crtPeso(excecao380),
      `${crtPeso(familiaM02)} < ${crtPeso(combinacaoAD)} < ${crtPeso(excecao380)}`);
    ok("1.3 SKU que não casa com nada não puxa projeto",
      crtAplicaveis(BASE, "ZZ9").length === 0);

    /* 2 · herança por bloco: 380 tem cortes e sortimento próprios e herda o fitilho da família 3xx */
    const r380 = crtResolver(BASE, "380");
    ok("2.1 cortes vieram da exceção do SKU",
      r380.origem.cortes.projetoId === "prj_380" && r380.cortes.length === 1 && r380.cortes[0].comprimentoMm === 240,
      JSON.stringify(r380.origem.cortes));
    ok("2.2 fitilho continua o da família 3xx (herança por bloco)",
      r380.origem.fitilho.projetoId === "prj_3xx" && r380.fitilho.comprimentoMm === 800,
      JSON.stringify({ origem: r380.origem.fitilho, fitilho: r380.fitilho }));
    ok("2.3 sortimento veio da exceção", r380.origem.sortimento.projetoId === "prj_380"
      && r380.sortimento.modo === "sortido" && r380.sortimento.itens.length === 3);

    /* 3 · modo "herda": o projeto não define nada e não apaga o que veio antes */
    const rAD = crtResolver(BASE, "M02.AD");
    ok("3.1 herda mantém o fitilho da família",
      rAD.fitilho && rAD.fitilho.comprimentoMm === 700 && rAD.origem.fitilho.projetoId === "prj_m02");

    /* 4 · modo "substitui" troca o bloco inteiro */
    ok("4.1 substitui troca os cortes inteiros",
      crtResolver([familiaM02, familia3xx], "370").cortes[0].fitaId === "ft12");

    /* 5 · modo "remove" apaga o bloco sem inventar "não usa" */
    const rPR = crtResolver(BASE, "M02.PR");
    ok("5.1 remove deixa o fitilho nulo", rPR.fitilho === null && rPR.origem.fitilho.modo === "remove");
    ok("5.2 e não mexe nos cortes herdados", rPR.cortes.length === 1 && rPR.cortes[0].chave === CH.laco);

    /* 6 · ajuste parcial: o SKU guarda só o que mudou */
    ok("6.1 M02.AD ajustou só o comprimento", rAD.cortes[0].comprimentoMm === 260, JSON.stringify(rAD.cortes[0]));
    ok("6.2 e continua herdando fita, tipo, quantidade e identificação",
      rAD.cortes[0].fitaId === "ft9" && rAD.cortes[0].tipoCorte === "reto"
      && rAD.cortes[0].qtd === 1 && rAD.cortes[0].identificacao === "Laço",
      JSON.stringify(rAD.cortes[0]));
    ok("6.3 o ajuste diz de onde herdou", rAD.origem.cortes.modo === "ajusta" && rAD.origem.cortes.herdadoDe === "prj_m02",
      JSON.stringify(rAD.origem.cortes));

    /* 7 · chave estável: renomear a identificação não quebra o ajuste */
    const renomeada = JSON.parse(JSON.stringify(familiaM02));
    renomeada.versao.cortes[0].identificacao = "Laço principal";
    const rRen = crtResolver([renomeada, combinacaoAD], "M02.AD");
    ok("7.1 renomear na família não quebra o ajuste do SKU",
      rRen.cortes.length === 1 && rRen.cortes[0].comprimentoMm === 260
      && rRen.cortes[0].identificacao === "Laço principal",
      JSON.stringify(rRen.cortes[0]));

    /* 8 · chave estável: reordenar/inserir corte não muda identidade */
    const reordenada = JSON.parse(JSON.stringify(familiaM02));
    reordenada.versao.cortes[0].ordem = 2;
    reordenada.versao.cortes.push({ chave: CH.extra, ordem: 1, operacao: "define",
      fitaId: "ft5", comprimentoMm: 130, tipoCorte: "45", qtd: 2, identificacao: "Lateral", camadas: [] });
    const rOrd = crtResolver([reordenada, combinacaoAD], "M02.AD");
    ok("8.1 o corte novo entra e o ajuste continua achando o dele pela chave",
      rOrd.cortes.length === 2
      && rOrd.cortes[0].chave === CH.extra                       /* ordem 1 aparece primeiro */
      && rOrd.cortes[1].chave === CH.laco && rOrd.cortes[1].comprimentoMm === 260,
      rOrd.cortes.map((c) => `${c.chave}:${c.ordem}:${c.comprimentoMm}`).join(" | "));

    /* 9 · camada herdada acompanha a mudança da família */
    const familiaNova = JSON.parse(JSON.stringify(familiaM02));
    familiaNova.versao.cortes[0].camadas[0].fitaId = "ft12";      /* a família trocou a fita da camada */
    const rCam = crtResolver([familiaNova, combinacaoAD], "M02.AD");
    ok("9.1 a camada do SKU ajustado passou a usar a fita nova da família",
      rCam.cortes[0].camadas.length === 1 && rCam.cortes[0].camadas[0].fitaId === "ft12"
      && rCam.cortes[0].comprimentoMm === 260,
      JSON.stringify(rCam.cortes[0].camadas[0]));
    ok("9.2 a chave da camada não mudou", rCam.cortes[0].camadas[0].chave === CH.cam);

    /* 10 · o ajuste preserva só o campo sobrescrito, inclusive em camada */
    const ajusteCamada = { id: "prj_ad2", nome: "AD camada", escopo: "combinacao", ativo: true,
      regras: [{ campo: "sku", operador: "comeca", valor: "M02.AD" }],
      versao: { id: "prv_ad2", versao: 1, cortesModo: "ajusta", fitilhoModo: "herda", sortimentoModo: "herda",
        cortes: [{ chave: CH.laco, operacao: "substitui",
                   camadas: [{ chave: CH.cam, operacao: "substitui", cortarJuntas: false }] }] } };
    const rCam2 = crtResolver([familiaM02, ajusteCamada], "M02.AD");
    ok("10.1 ajustar a camada muda só o campo tocado",
      rCam2.cortes[0].camadas[0].cortarJuntas === false
      && rCam2.cortes[0].camadas[0].fitaId === "ft9"
      && rCam2.cortes[0].comprimentoMm === 220,
      JSON.stringify(rCam2.cortes[0]));
    ok("10.2 acrescentar corte não apaga o herdado",
      (() => { const add = { id: "prj_add", nome: "add", escopo: "sku", ativo: true,
          regras: [{ campo: "sku", operador: "igual", valor: "M02" }],
          versao: { id: "prv_add", versao: 1, cortesModo: "ajusta", fitilhoModo: "herda", sortimentoModo: "herda",
            cortes: [{ chave: "ct_novo1", ordem: 2, operacao: "acrescenta", fitaId: "ft5", comprimentoMm: 150, tipoCorte: "reto", qtd: 1 }] } };
        const r = crtResolver([familiaM02, add], "M02");
        return r.cortes.length === 2 && r.cortes[0].chave === CH.laco && r.cortes[1].chave === "ct_novo1"; })());
    ok("10.3 remover corte pela chave tira só ele",
      (() => { const rm = { id: "prj_rm", nome: "rm", escopo: "sku", ativo: true,
          regras: [{ campo: "sku", operador: "igual", valor: "M02" }],
          versao: { id: "prv_rm", versao: 1, cortesModo: "ajusta", fitilhoModo: "herda", sortimentoModo: "herda",
            cortes: [{ chave: CH.laco, operacao: "remove" }] } };
        return crtResolver([familiaM02, rm], "M02").cortes.length === 0; })());

    /* 11 · fitilho ausente = não usa (sem "usa: false") */
    const semBloco = crtResolver([{ id: "prj_x", nome: "x", escopo: "familia", ativo: true,
      regras: [{ campo: "sku", operador: "comeca", valor: "X" }],
      versao: { id: "v", versao: 1, cortesModo: "substitui", fitilhoModo: "herda", sortimentoModo: "herda",
        cortes: [{ chave: "ct_x", ordem: 1, operacao: "define", fitaId: "ft9", comprimentoMm: 100, tipoCorte: "reto", qtd: 1 }] } }], "X1");
    ok("11.1 sem fitilho definido, o bloco é nulo e não aparece na origem",
      semBloco.fitilho === null && semBloco.origem.fitilho === undefined,
      JSON.stringify({ fitilho: semBloco.fitilho, origem: Object.keys(semBloco.origem) }));
    ok("11.2 e o projeto continua válido para a bancada", crtTemProjeto(semBloco) === true);

    /* 12 · sortimento é separado da geometria */
    const antesGeo = JSON.stringify(r380.cortes);
    const so80 = JSON.parse(JSON.stringify(excecao380));
    so80.versao.sortimento.itens = [{ genero: "macho", qtd: 9 }];
    const r380b = crtResolver([familia3xx, so80], "380");
    ok("12.1 mudar o sortimento não mexe em corte nenhum",
      JSON.stringify(r380b.cortes) === antesGeo && r380b.sortimento.itens[0].qtd === 9,
      `${r380b.sortimento.itens[0].qtd} macho`);
    ok("12.2 sortimento exato sem composição não conta como projeto sozinho",
      crtTemProjeto({ cortes: [], fitilho: null, sortimento: { modo: "exato", itens: [] } }) === false);

    /* 13 · SKU sem projeto: vazio, sem exceção */
    let erro13 = null, vazio = null;
    try { vazio = crtResolver(BASE, "SEM-PROJETO"); } catch (e) { erro13 = String(e && e.stack || e); }
    ok("13.1 resolver sem projeto não levanta erro", !erro13, erro13);
    ok("13.2 devolve vazio, não nulo",
      vazio && vazio.cortes.length === 0 && vazio.fitilho === null && vazio.sortimento === null
      && vazio.cadeia.length === 0 && Object.keys(vazio.origem).length === 0,
      JSON.stringify(vazio));
    ok("13.3 lista de projetos vazia também responde",
      (() => { const r = crtResolver([], "M02"); return r.cortes.length === 0 && r.cadeia.length === 0; })());
    ok("13.4 crtTemProjeto de um vazio é falso", crtTemProjeto(vazio) === false);

    /* 14 · medida: milímetro inteiro; centímetro é apresentação */
    ok("14.1 cm vira mm inteiro", crtMm("22") === 220 && crtMm("22,5") === 225 && crtMm(22.5) === 225);
    ok("14.2 mm continua mm", crtMm("220", "mm") === 220);
    ok("14.3 o que não dá para ler vira nulo, não zero",
      crtMm("") === null && crtMm(null) === null && crtMm("abc") === null);
    ok("14.4 a volta é só apresentação", crtCm(260) === 26 && crtMedida(225) === "22,5 cm" && crtMedida(220) === "22 cm");

    /* 15 · chave: nasce uma vez e é única */
    const k1 = crtChave("ct"), k2 = crtChave("ct");
    ok("15.1 chave nova a cada corte criado", k1 !== k2 && /^ct_[0-9a-z]{8}$/.test(k1), `${k1} · ${k2}`);
    ok("15.2 o prefixo separa corte de camada", /^cm_/.test(crtChave("cm")));

    /* 16 · o modelo é puro: não encostou em nada do app */
    ok("16.1 nada foi alterado em S",
      (S && S.pedidos && S.pedidos.length) === antesDoTeste.pedidos && (S && S.modal) === antesDoTeste.modal);
  } catch (e) {
    res.push({ nome: "EXCEÇÃO", ok: false, detalhe: String(e && e.stack || e) });
  }

  const falhas = res.filter((r) => !r.ok);
  return { versao: VERSAO, resumo: `corte-modelo: ${res.length - falhas.length} ok · ${falhas.length} falhas`, falhas, res };
}
