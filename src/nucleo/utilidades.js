/* =========================================================
   PCP — Ordens de Produção e Remessas · arquivo único
   Uma OP ativa por produto. Fila por bloco cronológico + prioridade.
   ========================================================= */

/* ---------- utilidades ---------- */
const DIA = 86400000;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hoje = () => new Date(new Date().toDateString());
const pdate = (s) => { if (!s) return null; const d = new Date(String(s).length <= 10 ? s + "T00:00:00" : s); return isNaN(d) ? null : d; };
const fdataHora = (v) => {
  if (!v) return "—";
  const d = new Date(String(v).length <= 10 ? v + "T12:00:00" : v);
  if (isNaN(d)) return "—";
  const dia = d.toLocaleDateString("pt-BR");
  return String(v).length <= 10 ? dia : `${dia} às ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const fdate = (s) => { const d = pdate(s); return d ? d.toLocaleDateString("pt-BR") : "—"; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dias = (a, b) => Math.round((b - a) / DIA);
const n0 = (v) => (v == null || isNaN(v) ? "—" : Math.round(v).toLocaleString("pt-BR"));
/* valores de etapa são centavos por peça (0,04) — precisam de casas decimais, ao contrário de n0 */
const fmoeda = (v) => (v == null || v === "" || isNaN(v) ? "—" : "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 }));
/* ---------- dinheiro nunca se arredonda ----------
   `n0` existe para CONTAR coisa inteira — peças, pedidos, dias — e arredonda de
   propósito. Usar `n0` em real transformava R$ 50,60 em "51" na folha que a
   prestadora assina: quatro centavos aqui, oitenta ali, e no fim do mês o papel
   não bate com a conta. `fdin` é o formato do dinheiro: duas casas, sempre.
   `freal` é o mesmo com o R$ na frente. */
const fdin = (v) => (v == null || v === "" || isNaN(v) ? "—"
  : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const freal = (v) => (v == null || v === "" || isNaN(v) ? "—" : "R$ " + fdin(v));
const numBR = (s) => { if (s == null || s === "") return 0; if (typeof s === "number") return s; const t = String(s).trim().replace(/\./g, "").replace(",", ".").replace(/[^\d.\-]/g, ""); const v = parseFloat(t); return isNaN(v) ? 0 : v; };
const mediana = (a) => { const x = a.filter((v) => v != null && isFinite(v)).sort((p, q) => p - q); if (!x.length) return null; const m = x.length >> 1; return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const MESES = ["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];

/* estados do PEDIDO — exatamente os Status da planilha ControlePedidos */
const P_STATUS = ["papel", "aberto", "separando", "enviada", "chegou", "retornada"];
const P_LABEL = { papel: "1. Papel de Produção", aberto: "2. Separar/Cortar", separando: "3. Cortado/Enviar", enviada: "4. Em Produção", chegou: "5. Conferir", retornada: "6. Produzido", cancelado: "Cancelado",
  /* a remessa de semiacabado usa a MESMA sequência de números dos pedidos, mas
     não é um pedido de produção: não tem SKU, não tem quantidade na saída e não
     entra na Demanda. Ela mora em `S.remessas` — um registro só, visto de dois
     lugares. Este rótulo existe para as mensagens de "número já em uso". */
  remessa: "Remessa para prestadora" };
const PED_VIVO = ["papel", "aberto", "separando", "enviada", "chegou"];
/* Etapa física, como na aba Listas: Inicial / Cortado / Com a prestadora */
const ETAPA_FISICA = { papel: "Inicial", aberto: "Inicial", separando: "Cortado", enviada: "Com a prestadora", chegou: "Com a prestadora" };
const etapaFisica = (r) => ETAPA_FISICA[r.status] || null;
/* ===========================================================================
   E2 · LINHAGEM DA CONTINUAÇÃO
   ---------------------------------------------------------------------------
   Antes isto era uma pergunta de TEXTO — `/-A$/` — e por isso errava duas vezes:

     1 · só reconhecia `-A`. A numeração emite de `-A` até `-Z`
         (`pedidos/modelo.js`), e um `2358-B` não era continuação em lugar
         nenhum: contava em dobro na Demanda, em Festivas e no consumo.
     2 · texto não sabe QUEM é o pai, e sem o pai não dá para responder a
         pergunta que a operação faz: "esta peça já está sendo contada?".

   Agora são três degraus, e cada um faz uma coisa só:

     ehEspelho(r)          · é uma continuação?  (agora `-A`..`-Z`)
     paiDaContinuacao(r)   · QUEM é o original dela
     contaNaDemanda(r)     · esta linha entra na conta do SKU?

   O PAI é procurado por dois caminhos, nesta ordem:
     1º `extra.continuacao_de` — o vínculo que o SERVIDOR grava (SQL 155). É o
        que existe nas continuações nascidas pelo fluxo certo.
     2º a raiz do número, no MESMO ciclo — `2358-A` → `2358`. É o único vínculo
        que as continuações históricas têm, e por isso ele continua valendo.
   Vínculo de dado primeiro, texto só como queda. Nunca o contrário.

   A REGRA DA CONTA, dita em uma frase:
     Uma linhagem conta UMA vez. Quem conta é o ORIGINAL enquanto ele estiver
     vivo; quando ele sai de cena, as continuações vivas assumem.

   Os quatro casos, que são os da Ana:
     · só o original vivo .................. conta o original
     · original vivo + continuação viva .... conta só o original (uma vez)
     · original encerrado + continuação viva  conta a continuação
     · continuação órfã (sem pai achável) .. conta — a peça existe e está com
       alguém; deixá-la fora era o defeito, não a correção.
   =========================================================================== */
const numeroRaiz = (n) => String(n == null ? "" : n).trim().toUpperCase().replace(/-[A-Z]$/, "");
const ehEspelho = (r) => /-[A-Z]$/i.test(String((r && r.numero) || ""));

function paiDaContinuacao(r, lista) {
  if (!r) return null;
  const L = lista || (typeof S !== "undefined" ? S.pedidos : []) || [];
  const porExtra = r.extra && r.extra.continuacao_de;
  if (porExtra) { const p = L.find((x) => x && x.id === porExtra); if (p) return p; }
  if (!ehEspelho(r)) return null;
  const raiz = numeroRaiz(r.numero);
  /* o ciclo só entra na comparação quando os DOIS lados o têm: pedido antigo
     pode não carregar `cicloPcp`, e exigi-lo deixaria a linhagem sem pai */
  const candidatos = L.filter((x) => x && !ehEspelho(x) && numeroRaiz(x.numero) === raiz
    && (x.cicloPcp == null || r.cicloPcp == null || x.cicloPcp === r.cicloPcp));
  /* ---------------------------------------------------------------------
     MAIS DE UM CANDIDATO NÃO É UM PAI. Isto era um `.find`, que devolve o
     PRIMEIRO da lista — a mesma escolha arbitrária que o `Map` da importação
     fazia na E1, e que eu não tinha aplicado aqui. Produção TEM número
     repetido: com dois pedidos `2137`, o pai saía por ordem de array, e a
     continuação era suprimida ou não conforme o azar.
     Ambíguo → sem pai. Sem pai, a continuação CONTA: a peça existe e está com
     alguém, e esconder é o defeito que estamos consertando.
     Medido em `testes/demanda-render-2137.js`, forma I.
     --------------------------------------------------------------------- */
  return candidatos.length === 1 ? candidatos[0] : null;
}

/* o SKU que a Demanda usa para somar: o da OP quando existe, senão o do pedido.
   É a MESMA expressão de `demanda/calculo.js` — se as duas divergissem, a
   dedução da linhagem aconteceria numa linha e a soma noutra.

   O nome `skuDoPedido` JÁ EXISTE em `conferencia/conferencia.js`, e o build é
   concatenação num escopo só: declarar um segundo derrubava a página inteira
   com `Identifier 'skuDoPedido' has already been declared`. Este aqui tem nome
   próprio e compara NORMALIZADO — caixa e espaço não podem separar linhagem. */
const skuParaLinhagem = (r) => {
  const o = (typeof opPorId === "function" && r && r.opId) ? opPorId(r.opId) : null;
  return String((o && o.sku) || (r && r.sku) || "").trim().toUpperCase();
};

function contaNaDemanda(r, lista) {
  if (!r || !PED_VIVO.includes(r.status)) return false;
  /* NÃO se pergunta antes se o número tem sufixo. Se o pedido carrega
     `extra.continuacao_de`, ele É continuação mesmo com número sequencial —
     e é justamente esse o caso que o defeito antigo produzia. O vínculo de
     DADO vence o texto do número, sempre, nos dois sentidos. */
  const pai = paiDaContinuacao(r, lista);
  if (!pai) return true;
  /* ---------------------------------------------------------------------
     SKU DIFERENTE ENTRE PAI E FILHO · medido em produção, 2 pares:
        1317 · M02.AD.10.LISO.CANDY → M02.AD.10.LISO.MIX
        1975 · ELASTICO             → PR.M03.10.LISA
     A dedução por linhagem existe para não contar A MESMA PEÇA duas vezes no
     MESMO SKU. Quando os SKUs diferem, são DUAS linhas diferentes da Demanda:
     suprimir o filho não tira nada do SKU do pai — só esconde peças do SKU do
     filho, que continuam existindo e com alguém.
     Então a dedução vale DENTRO de um SKU. SKU diferente, cada um conta o seu.
     --------------------------------------------------------------------- */
  if (skuParaLinhagem(pai) !== skuParaLinhagem(r)) return true;
  return !PED_VIVO.includes(pai.status);
}
/* estados da OP — a necessidade agregada do produto */
const O_LABEL = { pendente: "Pendente", em_producao: "Em produção", concluida: "Concluída", suprida: "Suprida", cancelada: "Cancelada" };
const CORTE = { 0: "Crítico · Zerado", 1: "Urgente", 2: "P1", 3: "P2", 4: "P3" };
/* código curto e de largura previsível: 20 linhas se comparam de relance.
   A palavra inteira continua no title e na legenda de cada tela. */
const CORTE_CURTO = { 0: "CRÍT", 1: "URG", 2: "P1", 3: "P2", 4: "P3" };
const CORTES = [0, 1, 2, 3, 4];
const ABC_RANK = { A: 0, B: 1, C: 2 };

const FLUXO = {
  aberto:    { titulo: "Separar e cortar",     acao: "Separar",  funcao: "separar" },
  separando: { titulo: "Enviar à prestadora",  acao: "Enviar",   funcao: "enviar" },
  enviada:   { titulo: "Receber da prestadora", acao: "Chegou",  funcao: "conferir" },
  chegou:    { titulo: "Conferir o retorno",   acao: "Conferir", funcao: "conferir" },
};
const FUNCOES = [["destinar", "Destinar"], ["separar", "Separar / Cortar"], ["enviar", "Enviar às prestadoras"],
  ["acompanhar", "Cobrar atrasos"], ["receber", "Receber"], ["conferir", "Conferir"]];
/* Cada papel aceita várias pessoas: a primeira recebe a tarefa automática, as
   outras entram como opção. Quem responde por um papel é lido direto das funções
   marcadas na pessoa (Equipe › Editar) — antes a mesma informação existia em dois
   lugares (a função da pessoa e uma lista de padrões), e mantê-los combinando era
   trabalho manual que ninguém fazia. A ordem é a da lista da Equipe. */
const padraoLista = (id) => S.equipe.filter((p) => p.ativo !== false && (p.funcoes || []).includes(id)).map((p) => p.nome);
const padraoResp = (id, fb) => padraoLista(id)[0] || (fb ? padraoLista(fb)[0] : null) || null;

/* os três ícones do tema, e o que cada estado quer dizer. Ficam aqui, junto
   dos outros, para o alternador não carregar SVG solto no meio da ação. */
const TEMA_ICONE = {
  auto:   '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none"/>',
  claro:  '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  escuro: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
};
const TEMA_TITULO = {
  auto:   "Tema: acompanha o sistema — clique para fixar no claro",
  claro:  "Tema: claro — clique para fixar no escuro",
  escuro: "Tema: escuro — clique para voltar a acompanhar o sistema",
};
const TEMA_AVISO = {
  auto:   "Tema acompanhando o sistema.",
  claro:  "Tema claro fixado nesta máquina.",
  escuro: "Tema escuro fixado nesta máquina.",
};

const IC = {
  pedidos:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  demanda:'<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/>',
  fila:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="2" cy="6" r="1"/><circle cx="2" cy="12" r="1"/><circle cx="2" cy="18" r="1"/>',
  producao:'<path d="M4 20V9l5 3V9l5 3V9l6 4v7z"/><path d="M4 20h16"/>',
  tarefas:'<path d="M9 5h11M9 12h11M9 19h11"/><path d="m3 5 1.4 1.4L7 3.8"/><path d="m3 12 1.4 1.4L7 10.8"/><path d="m3 19 1.4 1.4L7 17.8"/>',
  produtos:'<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5"/><path d="M12 12v9"/>',
  prestadoras:'<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><path d="M8.1 7.5 20 18"/><path d="M8.1 16.5 20 6"/>',
  equipe:'<circle cx="8.5" cy="8" r="3"/><circle cx="17" cy="9.5" r="2.2"/><path d="M2.5 19c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2"/><path d="M16 19c0-1.9-.5-3.3-1.5-4.3 2.9-.6 5.5 1.1 5.5 4.3"/>',
  conferencia:'<path d="M5 4h11l3 3v13H5z"/><path d="m9 13 2 2 4-4"/>',
  historico:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  dados:'<path d="M12 3v13"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/>',
  busca:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  upload:'<path d="M12 17V4"/><path d="m7 9 5-5 5 5"/><path d="M4 20h16"/>',
  vazio:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
  ok:'<path d="m5 12 4.5 4.5L19 7"/>',
  link:'<path d="M10 13a4 4 0 0 0 5.7.4l2.6-2.6a4 4 0 0 0-5.6-5.7l-1.5 1.4"/><path d="M14 11a4 4 0 0 0-5.7-.4L5.7 13.2a4 4 0 0 0 5.6 5.7l1.5-1.4"/>',
  mais:'<path d="M12 5v14M5 12h14"/>',
  /* "Mais" da barra do telefone: três pontos empilhados. O `mais` de cima é
     sinal de CRIAR e já significa isso em vinte lugares — reaproveitá-lo na
     navegação faria a barra prometer um cadastro novo. */
  reticencias:'<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  foto:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>',
  raio:'<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
  compras:'<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M3 4h2.4l2.2 11.5a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.6-1.3L20.5 8H6"/>',
  editar:'<path d="M4 20h4l10-10a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M13.5 6.5l3 3"/>',
  alerta:'<path d="M12 3 2.7 19.5h18.6z"/><path d="M12 10v4"/><path d="M12 17.4v.1"/>',
  filtro:'<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  impressora:'<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="2"/><path d="M7 14h10v6H7z"/>',
  regua2:'<path d="M4 8h16"/><path d="M12 5v6"/><path d="M6 11l-2 5a4 4 0 0 0 8 0l-2-5"/><path d="M18 11l-2 5a4 4 0 0 0 8 0l-2-5" transform="translate(-2)"/>',
  setaEsq:'<path d="M14.5 5 8 12l6.5 7"/>',
  insumos:'<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5"/><path d="M12 12v9"/>',
  festivas:'<path d="M12 3l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.3l5-.7z"/>',
  semiacabados:'<path d="M4 6h10v12H4z"/><path d="M14 9h3l3 3v6h-6z"/><path d="M4 12h10"/>',
  relatorios:'<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
  arquivar:'<rect x="3" y="4" width="18" height="4.5" rx="1"/><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5"/><path d="M10 12.5h4"/>',
  setaCima:'<path d="M5 14.5 12 8l7 6.5"/>',
  setaBaixo:'<path d="M5 9.5 12 16l7-6.5"/>',
  setaDir:'<path d="M9.5 5 16 12l-6.5 7"/>',
  cadeado:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  cadeadoAberto:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  caminhao:'<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18.5" r="1.7"/><circle cx="17" cy="18.5" r="1.7"/>',
  lixeira:'<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  varinha:'<path d="M4 20 16 8"/><path d="m17 3 1 2.5L20.5 6 18 7l-1 2.5L16 7l-2.5-1L16 5z"/>',
  etiqueta:'<path d="M3 12.5V4h8.5L21 13.5 12.5 22z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  caixa:'<path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5z"/><path d="M3 8.5 12 13l9-4.5"/><path d="M12 13v7"/>',
  engrenagem:'<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/>',
  atualizar:'<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>',
  telefone:'<path d="M6.5 4h3l1.5 4-2 1.4a11 11 0 0 0 5.6 5.6L16 13l4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4z"/>',
  fechar:'<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  /* mostrar/ocultar a senha — o olho aberto MOSTRA, o riscado ESCONDE */
  olho:'<path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>',
  olhoRiscado:'<path d="M9.9 5.7A10.6 10.6 0 0 1 12 5.5c6.2 0 10 6.5 10 6.5a18 18 0 0 1-3.3 4"/><path d="M6.3 7.9A18.4 18.4 0 0 0 2 12s3.8 6.5 10 6.5a10.7 10.7 0 0 0 4-.75"/><path d="M10.1 10.1a2.8 2.8 0 0 0 3.8 3.8"/><path d="M3.5 3.5 20.5 20.5"/>',
};
/* A classe `ic` dá um tamanho de partida a todo ícone. Sem ela, um ícone usado
   num lugar que ainda não tinha regra de CSS assumia o padrão do navegador —
   300x150px — e estourava o botão. Qualquer regra específica (.btn svg, .chip svg…)
   continua vencendo, porque é mais específica que `.ic`. */
/* ==========================================================================
   A GRAMÁTICA DE CORES, EM CÓDIGO
   Cinco significados chegavam aqui com CINCO vocabulários diferentes:
     salvamento   erro · andando · espera · ok
     insumos      erro · aviso · ok · off
     semiacabados amber · teal            (nome de COR, não de significado)
     etiquetas    red · amber · teal      (idem)
   A mesma situação recebia vermelho numa tela e âmbar em outra porque ninguém
   tinha como saber que eram a mesma situação. `tom()` é o tradutor: entra
   qualquer um desses nomes, sai um dos cinco.

   O que cada um quer dizer para quem está usando:
     perigo   quebrou, venceu, travou → RESOLVA
     atencao  ainda não quebrou → PRESTE ATENÇÃO
     ok       deu certo, conferido, saudável
     acao     é clicável, é a etapa ativa (não é elogio nem alarme)
     neutro   normal, contexto, aguardando sem problema

   Regra que vem junto e não é opcional: cor NUNCA carrega sozinha o
   significado. Toda etiqueta colorida sai com palavra ou ícone ao lado, senão
   quem não distingue vermelho de verde perde a informação inteira.
   ========================================================================== */
const TONS = ["perigo", "atencao", "ok", "acao", "neutro"];
const TOM_SINONIMO = {
  perigo: "perigo", erro: "perigo", red: "perigo", urg: "perigo", urgente: "perigo",
  atrasado: "perigo", atrasada: "perigo", critico: "perigo", vencido: "perigo",
  atencao: "atencao", aviso: "atencao", amber: "atencao", espera: "atencao",
  hoje: "atencao", risco: "atencao", recusada: "atencao", parcial: "atencao",
  ok: "ok", teal: "ok", concluido: "ok", concluida: "ok", saudavel: "ok", encerrada: "ok",
  acao: "acao", ativo: "acao", andando: "acao", em_andamento: "acao", primary: "acao",
  neutro: "neutro", off: "neutro", nova: "neutro", lida: "neutro", cancelada: "neutro",
};
const tom = (x) => TOM_SINONIMO[String(x == null ? "" : x).trim().toLowerCase()] || "neutro";

/* ---------- endereço que sai do app ----------
   `window.open("modabicho.com.br/x")` NÃO abre a loja: sem o protocolo o
   navegador trata aquilo como um CAMINHO DENTRO do site, e a aba nova cai num
   404 do próprio PCP. Foi assim que digitar o e-mail no login abriu
   `modabicho.netlify.app/modabicho.com.` numa aba nova.
   Devolve "" para o que não deve ser aberto — `javascript:`, `data:`, `mailto:`
   e qualquer outro esquema — porque abrir isso a partir de um texto lido de fora
   é justamente o que não se pode fazer. */
const urlExterna = (u) => {
  const t = String(u || "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return "";
  return "https://" + t.replace(/^\/+/, "");
};
const svg = (p, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

const CORES_AV = ["#0E6E68","#B45309","#4B5563","#7A3E8F","#1D5B96","#9B2C4E","#2F7A46","#8A5A1E"];
const corDe = (n) => CORES_AV[[...String(n || "?")].reduce((a, c) => a + c.charCodeAt(0), 0) % CORES_AV.length];
const iniciais = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
const avatar = (n, cls = "") => `<span class="av ${cls}" style="background:${corDe(n)}">${esc(iniciais(n))}</span>`;
const pessoa = (n) => n ? `<span class="pessoa">${avatar(n)}<span>${esc(n)}</span></span>` : '<span class="tag amber">a definir</span>';
const corte = (p) => `<span class="corte c${p}">${CORTE[p] || "—"}</span>`;
const corteCurto = (p) => `<span class="corte c${p}" title="${esc(CORTE[p] || "sem prioridade")}">${CORTE_CURTO[p] || "—"}</span>`;

