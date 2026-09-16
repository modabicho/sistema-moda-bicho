/* ===========================================================================
   src/persistencia/mapa.js · O MAPA ÚNICO camelCase ↔ snake_case
   ---------------------------------------------------------------------------
   O app fala camelCase. A tabela fala snake_case. Se essa tradução existir em
   dois lugares, um dia os dois discordam — e o pedido nasce órfão sem ninguém
   perceber, que foi exatamente o que acontecia antes: `opId` era ignorado em
   silêncio e o pedido ficava sem OP.

   Este mapa é o MESMO de `pcp_pedido_do_item()` no 60-migracao.sql, que é o que
   migrou 1.593 pedidos com validação zerada. Não é uma segunda opinião: é a
   mesma, escrita do lado de cá. A bateria compara os dois lados campo a campo
   contra o banco de verdade, para eles nunca se separarem.
   =========================================================================== */

/* camelCase do app → coluna da tabela. A ordem é a das colunas. */
const PED_CAMPO = Object.freeze({
  id: "id",
  numero: "numero",
  opId: "op_id",
  sku: "sku",
  processo: "processo",
  status: "status",
  qtd: "qtd",
  qtdEmbalar: "qtd_embalar",
  qtdMix: "qtd_mix",
  qtdConferida: "qtd_conferida",
  qtdSegunda: "qtd_segunda",
  qtdDefeito: "qtd_defeito",
  prioridade: "prioridade",
  prioridadeTravada: "prioridade_travada",
  prestadora: "prestadora",
  /* v8.40 · o id estável da prestadora. LER, SIM; ESCREVER, NÃO — quem o
     deriva é o gatilho `pcp_pedido_prest_id` no servidor, a partir do nome.
     Sem esta linha o id existia na tabela e NUNCA chegava à tela: o
     fechamento voltava a resolver por nome toda vez, e o documento legado
     (que é escrito a partir de `S.pedidos`) nunca ganhava o campo. */
  prestadoraId: "prestadora_id",
  setor: "setor",
  responsavel: "responsavel",
  separadaEm: "separada_em",
  enviadaEm: "enviada_em",
  retornadaEm: "retornada_em",
  aguardandoMaterial: "aguardando_material",
  obs: "obs",
  campanhaId: "campanha_id",
  criadoNoApp: "criado_no_app",
  custoReal: "custo_real",
  mesPagamento: "mes_pagamento",
  mesPagamentoAuto: "mes_pagamento_auto",
  consumoBaixado: "consumo_baixado",
  etapas: "etapas",
  etapasUsadas: "etapas_usadas",
  chaves: "chaves",
  consumoMovs: "consumo_movs",
  extra: "extra",
  criadoEm: "criado_em",
  cicloPcp: "ciclo",
});
const PED_COLUNA = Object.freeze(Object.fromEntries(
  Object.entries(PED_CAMPO).map(([k, v]) => [v, k])));

/* Colunas que o servidor gerencia e o app NUNCA envia. Ler, sim; escrever, não.
   `duplicidade_historica` está aqui por decisão de negócio: quem marca é a
   migração, a partir da lista nominal de pares autorizados. */
const PED_SO_SERVIDOR = Object.freeze([
  "revision", "updated_at", "updated_by", "migrado_em",
  "deleted_at", "deleted_by", "duplicidade_historica",
  "arquivado_em", "arquivado_por",
  /* o id da prestadora é derivado do nome pelo gatilho. Se o app pudesse
     mandá-lo, existiriam duas fontes para a mesma verdade — e a primeira vez
     que discordassem alguém seria pago no lugar de outra pessoa. */
  "prestadora_id",
]);
/* Os mesmos nomes como o app os escreveria. Sem esta lista, mandar
   `duplicidadeHistorica` (ou o snake_case direto) não era RECUSADO: caía no
   ramo "campo que o app inventou" e ia parar dentro de `extra`, calado — o
   pior dos dois mundos, porque some sem erro e reaparece depois como se fosse
   dado. Foi a bateria que apontou. */
const PED_SO_SERVIDOR_APELIDOS = Object.freeze({
  revision: "revision", updatedAt: "updated_at", updatedBy: "updated_by",
  migradoEm: "migrado_em", deletedAt: "deleted_at", deletedBy: "deleted_by",
  duplicidadeHistorica: "duplicidade_historica",
  arquivadoEm: "arquivado_em", arquivadoPor: "arquivado_por",
  prestadoraId: "prestadora_id",
});

/* As duas listas do servidor, copiadas de pcp_pedido_campos_criaveis() e
   pcp_pedido_campos_editaveis(). A bateria confere que são iguais às de lá. */
const PED_CRIAVEIS = Object.freeze([
  "id", "op_id", "sku", "processo", "status", "qtd", "qtd_embalar", "qtd_mix",
  "qtd_conferida", "qtd_segunda", "qtd_defeito", "prioridade", "prioridade_travada",
  "prestadora", "setor", "responsavel", "separada_em", "enviada_em", "retornada_em",
  "aguardando_material", "obs", "campanha_id", "custo_real", "etapas", "etapas_usadas",
  "chaves", "extra",
]);
const PED_EDITAVEIS = Object.freeze([
  "numero", "op_id", "sku", "processo", "status", "qtd", "qtd_embalar", "qtd_mix",
  "qtd_conferida", "qtd_segunda", "qtd_defeito", "prioridade", "prioridade_travada",
  "prestadora", "setor", "responsavel", "separada_em", "enviada_em", "retornada_em",
  "aguardando_material", "obs", "campanha_id", "custo_real", "mes_pagamento",
  "mes_pagamento_auto", "consumo_baixado", "etapas", "etapas_usadas", "chaves",
  "consumo_movs", "extra",
]);

/* `numero` e `duplicidade_historica` na criação: os dois nomes que NÃO podem
   escapar, nem em camelCase nem em snake_case. É o item 4 da fase E, e está
   aqui em vez de espalhado porque uma regra que mora em três lugares vira três
   regras diferentes. */
const PED_PROIBIDOS_NA_CRIACAO = Object.freeze([
  "numero", "duplicidade_historica", "revision", "ciclo",
]);

/* Datas viajam como texto ISO curto (AAAA-MM-DD). O servidor tem pcp_data()
   para a migração; daqui em diante quem manda formato errado é o app. */
function so_data(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
const PED_DATAS = Object.freeze(["separada_em", "enviada_em", "retornada_em"]);
const PED_NUMEROS = Object.freeze(["qtd", "qtd_embalar", "qtd_mix", "qtd_conferida",
  "qtd_segunda", "qtd_defeito", "prioridade", "custo_real"]);
const PED_BOOLEANOS = Object.freeze(["prioridade_travada", "aguardando_material",
  "criado_no_app", "consumo_baixado", "mes_pagamento_auto"]);

/* Um número que veio da tela pode ser "1.234,50" ou "" ou já um número.
   Nunca arredonda: a Ana foi explícita sobre isso. */
function so_numero(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\s/g, "");
  if (!s) return null;
  /* 1.234,50 → 1234.50 · 1234.50 → 1234.50 */
  const n = Number(/,/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
}

/* ---------------------------------------------------------------------------
   app → servidor. Devolve { linha, desconhecidos, proibidos }.
   NÃO lança: quem chama decide o que fazer, e a bateria consegue medir cada
   caso sem depender de try/catch.
   --------------------------------------------------------------------------- */
function paraServidor(obj, opcoes) {
  const o = opcoes || {};
  const permitidos = o.permitidos || null;          /* lista de colunas aceitas */
  const proibidos = o.proibidos || [];
  const linha = {};
  const desconhecidos = [];
  const recusados = [];
  const extra = {};

  for (const [chave, valor] of Object.entries(obj || {})) {
    const col = PED_CAMPO[chave]
      || (PED_COLUNA[chave] ? chave : null)
      || PED_SO_SERVIDOR_APELIDOS[chave]
      || (PED_SO_SERVIDOR.includes(chave) ? chave : null);
    if (!col) { desconhecidos.push(chave); extra[chave] = valor; continue; }
    if (proibidos.includes(col)) { recusados.push(col); continue; }
    if (PED_SO_SERVIDOR.includes(col) && !proibidos.includes(col)) { recusados.push(col); continue; }
    if (permitidos && !permitidos.includes(col)) { recusados.push(col); continue; }
    linha[col] = PED_DATAS.includes(col) ? so_data(valor)
      : PED_NUMEROS.includes(col) ? so_numero(valor)
      : PED_BOOLEANOS.includes(col) ? (valor == null ? null : !!valor)
      : valor;
  }
  /* campo que o app inventou não vira erro: vai para `extra`, que é o lugar
     desenhado para isso. O que NÃO pode é ele chegar solto na RPC. */
  if (Object.keys(extra).length && (!permitidos || permitidos.includes("extra"))) {
    linha.extra = Object.assign({}, obj.extra || {}, linha.extra || {}, extra);
    delete linha.extra.extra;
  }
  return { linha, desconhecidos, recusados };
}

/* servidor → app. A volta é direta: cada coluna conhecida vira o camelCase
   dela, e o que estiver em `extra` é devolvido no nível de cima, que é onde o
   app sempre leu. */
function paraApp(linha) {
  if (!linha) return null;
  const o = {};
  for (const [col, valor] of Object.entries(linha)) {
    if (col === "extra") continue;
    const chave = PED_COLUNA[col];
    if (chave) o[chave] = valor;
    else o[col] = valor;            /* revision, deleted_at, ... vêm crus */
  }
  if (linha.extra && typeof linha.extra === "object") {
    for (const [k, v] of Object.entries(linha.extra)) if (!(k in o)) o[k] = v;
  }
  return o;
}

/* Só o que MUDOU, comparado campo a campo com o que veio do servidor.
   Item 9 da fase E: salvar o pedido inteiro é o que faz duas pessoas se
   atropelarem em campos que nenhuma das duas tocou. */
function diferenca(antes, depois) {
  const a = paraServidor(antes || {}, { permitidos: PED_EDITAVEIS }).linha;
  const b = paraServidor(depois || {}, { permitidos: PED_EDITAVEIS }).linha;
  const patch = {};
  for (const col of Object.keys(b)) {
    if (JSON.stringify(a[col] ?? null) !== JSON.stringify(b[col] ?? null)) patch[col] = b[col];
  }
  return patch;
}
