/* ---------- acesso por pessoa: perfis, PIN e permissões (organização operacional) ---------- */
const ABAS_TODAS = [["demanda", "Demanda"], ["pedidos", "Pedidos"], ["conferencia", "Conferência"], ["tarefas", "Tarefas"],
  ["compras", "Compras"], ["produtos", "Produtos"], ["insumos", "Insumos"], ["fitas", "Fitas"], ["prestadoras", "Prestadoras"],
  /* "posse" abre Prestadoras mostrando SÓ Materiais em posse: anotar o que a
     prestadora levou não pode exigir acesso a pagamento e fechamento. */
  /* "semiacabados" é o QUARTO estoque: a bandana cortada e costurada que ainda
     não virou SKU. Aba própria, permissão própria — quem anota remessa não
     precisa enxergar pagamento, e quem cuida de pedido não precisa enxergar
     remessa. */
  ["posse", "Materiais em posse"], ["semiacabados", "Semiacabados"], ["festivas", "Datas festivas"], ["relatorios", "Relatórios"], ["equipe", "Equipe"],
  ["historico", "Histórico"], ["dados", "Dados"]];
const ABAS_PADRAO_OPERACAO = ["pedidos", "tarefas"];
/* ---------- o rodapé das telas de entrada ----------
   Uma linha só, pequena e discreta, embaixo do cartão — igual nas quatro telas
   de `.auth`. Estava escrito quatro vezes, palavra por palavra; agora é um lugar
   só, que é o que mantém as telas consistentes quando uma delas muda.
   A versão saiu daqui a pedido (v8.95). Ela continua visível DENTRO do app, no
   menu da conta — "Dados e versão · v8.xx" — e no aviso de atualização do boot,
   então ninguém perdeu como conferir qual versão está no ar.
   `desenvolvido por` é texto; o nome da SINAL é a MARCA dela, imagem — recriar
   a marca de alguém em CSS é desenhar outra marca. */
const authRodape = () => `<div class="auth-foot">© ${new Date().getFullYear()} · Desenvolvido por <span class="sinal-marca" role="img" aria-label="SINAL"></span></div>`;
/* ---------- a aba de partida ----------
   O Hoje era o ponto de partida do app e saiu na v8.93. Quem assume é Pedidos.
   A rede de segurança existe porque `TITULOS[S.aba]` é desestruturado direto no
   render: uma aba que a pessoa não pode abrir não degrada, dá tela branca. Então
   se Pedidos não for dela, cai na primeira que for. */
const ABA_PADRAO = "pedidos";
const abaPadrao = () => (typeof podeAba === "function" && !podeAba(ABA_PADRAO))
  ? ((ABAS_TODAS.find(([id]) => podeAba(id)) || [ABA_PADRAO])[0]) : ABA_PADRAO;
const hashPin = (t) => { let h = 5381; const x = String(t || ""); for (let i = 0; i < x.length; i++) h = ((h << 5) + h + x.charCodeAt(i)) >>> 0; return String(h); };
/* ---------- as duas naturezas da Equipe ----------
   ACESSO             entra no PCP. Tem e-mail de login e permissões.
                      São as contas de setor (Atendimento, Contato, Produção,
                      Separação) e as pessoas com login próprio (Ana, João).
   PESSOA OPERACIONAL trabalha e recebe tarefa, mas não entra no sistema.

   O login nunca foi da operária — era da conta. Misturar os dois na mesma ficha
   é o que fazia a tela pedir PIN e e-mail de quem não entra em lugar nenhum. */
function ehAcesso(p) {
  if (!p) return false;
  if (p.ehConta) return true;                       /* conta de setor */
  if (p.temConta) return true;                      /* pessoa com login (auth_uid) */
  return !!String(p.email || "").trim();            /* sem servidor: o e-mail decide */
}
const acessosDoPcp = () => [
  ...(S.equipe || []).filter(ehAcesso),
  ...(typeof eqContas === "function" ? eqContas() : []),
];
const pessoasDaEquipe = () => (S.equipe || []).filter((p) => !ehAcesso(p));
/* A frase que a tela mostra no lugar de uma grade de caixinhas. */
function resumoDoAcesso(p) {
  /* a etiqueta ao lado já diz "Administradora" — repetir a palavra na frase
     gasta a linha duas vezes com a mesma informação */
  if (p.adm) return "vê tudo e decide o acesso das outras";
  const abas = (p.abas || []).map((id) => (ABAS_TODAS.find((x) => x[0] === id) || [])[1]).filter(Boolean);
  const base = abas.length ? abas.join(", ")
    : ABAS_PADRAO_OPERACAO.map((id) => (ABAS_TODAS.find((x) => x[0] === id) || [])[1]).filter(Boolean).join(", ");
  return base + (p.verValores ? " · vê valores" : "");
}

/* A sessão pode apontar para uma PESSOA (Ana, João) ou para uma CONTA de setor
   (Atendimento, Contato, Produção, Separação). As contas não moram em
   `S.equipe` — são outra coisa, e continuam sendo. Por isso a busca tem dois
   lugares, e não um: procurar só em `S.equipe` era o que deixava a conta de
   setor sem identidade nenhuma depois de entrar. */
function usuarioAtual() {
  const id = S.sessao?.pessoaId;
  if (!id) return null;
  const pessoa = S.equipe.find((p) => p.id === id);
  if (pessoa) return pessoa;
  if (typeof eqContas === "function") {
    const c = eqContas().find((x) => x.id === id);
    /* a conta entra como identidade de leitura: nome e e-mail, e nada de `adm`.
       Quem manda continua sendo o servidor (`pcp_sou_adm`), como já era. */
    if (c) return { id: c.id, nome: c.nome, email: c.email, conta: true, ativo: true, funcoes: [] };
  }
  return null;
}
/* ---------------------------------------------------------------------------
   ehAdm · a resposta é do SERVIDOR quando a leitura da equipe está ligada
   ---------------------------------------------------------------------------
   O `|| !S.equipe.some(...)` era um fail-open: com a lista vazia ou o documento
   ilegível, TODO MUNDO virava administradora. Ele existia porque, sem ninguém
   com `adm`, ninguém conseguiria devolver o `adm` a alguém — buraco que agora o
   servidor fecha de outro jeito: `pcp_pessoa_salvar` RECUSA tirar o `adm` da
   última administradora ativa.
   Com a flag desligada, a regra antiga continua valendo palavra por palavra. */
function ehAdm() {
  const doServidor = typeof eqAdmDoServidor === "function" ? eqAdmDoServidor() : null;
  if (doServidor !== null) return doServidor;
  return !!usuarioAtual()?.adm || !S.equipe.some((p) => p.adm && p.ativo !== false);
}
function podeAba(aba) {
  if (ehAdm()) return true;
  const u = usuarioAtual();
  if (!u) return false;
  const abas = Array.isArray(u.abas) && u.abas.length ? u.abas : ABAS_PADRAO_OPERACAO;
  /* quem só tem "posse" precisa que a aba Prestadoras apareça — mas ela abre
     mostrando só Materiais em posse (ver `soPosse`). É assim que anotar o que a
     prestadora levou deixa de exigir acesso a pagamento e fechamento. */
  if (aba === "prestadoras") return abas.includes("prestadoras") || abas.includes("posse");
  return abas.includes(aba);
}
/* a marcação crua, sem o atalho acima */
function temAbaMarcada(aba) {
  const u = usuarioAtual(); if (!u) return false;
  const abas = Array.isArray(u.abas) && u.abas.length ? u.abas : ABAS_PADRAO_OPERACAO;
  return abas.includes(aba);
}
/* true quando a pessoa entra em Prestadoras só para cuidar de material */
const soPosse = () => !ehAdm() && !temAbaMarcada("prestadoras") && temAbaMarcada("posse");
const podePosse = () => ehAdm() || temAbaMarcada("posse") || temAbaMarcada("prestadoras");
const podeVerValores = () => ehAdm() || !!usuarioAtual()?.verValores;
/* ---------- o que é estrutura e o que é operação ----------
   Lançar quantidade conferida é operação: é para isso que a pessoa está ali.
   Mudar o PROCESSO de um produto, as ETAPAS de um pedido ou a estrutura de um
   processo é outra coisa — muda como o app calcula pagamento e demanda para
   sempre, e um clique errado na correria não se desfaz sozinho. Por padrão só
   a administração mexe; a permissão se dá pessoa a pessoa na aba Equipe. */
/* ---------- o que cada uma pode mudar ----------
   Uma permissão só era grossa demais: mexer nas etapas DE UM PEDIDO é operação
   do dia (esta prestadora fez a cola, aquela não), e mexer nas etapas PADRÃO DO
   PRODUTO é cadastro que vale para todos os pedidos daquele SKU para sempre. Uma
   coisa a Jéssica faz o tempo todo; a outra não deveria fazer nunca sem combinar.
   Daí a lista abaixo, marcada pessoa a pessoa pela administração. */
const PERMS = [
  ["produto", "O produto — vale para todos os pedidos daquele SKU", [
    ["prodProcesso", "Processo e SKU", "trocar o processo muda as etapas, o setor e o valor por peça de tudo que for produzido daquele SKU"],
    ["prodEtapas", "Etapas padrão do SKU", "quais etapas todo pedido novo daquele produto vai ter"],
    ["prodEmbalagem", "Embalagem", "sai impressa no canhoto de todos os pedidos do SKU"],
    ["prodReceita", "Insumos da receita", "quanto de cada insumo uma peça consome — mexe no estoque e na compra"],
  ]],
  ["pedido", "O pedido — vale só para aquele pedido", [
    ["pedEtapas", "Etapas do pedido", "quais etapas ESTA prestadora fez neste pedido — é decisão do dia a dia"],
    ["pedProcesso", "Processo, número e setor do pedido", "o número é a identidade do pedido nos relatórios"],
  ]],
  ["fabrica", "A fábrica", [
    ["estruturas", "Estruturas de processo", "as etapas de cada processo e quanto vale a peça em cada uma — é daqui que sai o pagamento"],
  ]],
];
const PERM_IDS = PERMS.flatMap(([, , itens]) => itens.map(([id]) => id));
/* o padrão de quem é da operação: o pedido do dia sim, o cadastro não */
const PERM_PADRAO = { pedEtapas: true };
const PERM_NOME = Object.fromEntries(PERMS.flatMap(([, , itens]) => itens.map(([id, nome]) => [id, nome])));
function podeEditar(id) {
  if (ehAdm()) return true;
  const u = usuarioAtual();
  if (!u) return false;
  /* quem já tinha a permissão antiga, que valia para tudo, continua com tudo */
  if (u.editarEstrutura === true) return true;
  if (u.edit && Object.prototype.hasOwnProperty.call(u.edit, id)) return !!u.edit[id];
  return !!PERM_PADRAO[id];
}
const recusaPerm = (id) => toast(`${PERM_NOME[id] || "Isto"} é coisa que a administração define — peça para a Ana liberar na aba Equipe se você precisa mexer.`, "erro");
/* rende um campo como leitura quando a pessoa não tem a permissão: o valor
   continua à vista (ela precisa saber qual é), só não dá para digitar por cima */
const soLeitura = (podeMexer, valor, dica) => podeMexer ? null
  : `<div class="travado" title="${esc(dica || "Só a administração muda isto")}">${esc(valor || "—")}${svg(IC.cadeado)}</div>`;
/* ---------- cumprimento na entrada ----------
   A tela de login acontece ANTES de o app falar com o servidor, então a Equipe
   ainda não está carregada. Para chamar a pessoa pelo nome, o app guarda neste
   navegador o par nome + e-mail de quem já entrou aqui — nada além disso, e
   nada disso vai para o banco. */
const CONHECIDOS = NS + ":conhecidos";
function conhecidos() { try { return JSON.parse(localStorage.getItem(CONHECIDOS) || "[]"); } catch { return []; } }
function lembrarPessoa(email, nome) {
  const e = String(email || "").trim().toLowerCase();
  if (!e || !nome) return;
  const lista = conhecidos().filter((x) => x.email !== e);
  lista.unshift({ email: e, nome, em: Date.now() });
  try { localStorage.setItem(CONHECIDOS, JSON.stringify(lista.slice(0, 12))); } catch {}
}
/* o nome pode vir da Equipe (quando já carregou) ou da lembrança local */
function nomeDoEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  const daEquipe = (S.equipe || []).find((p) => String(p.email || "").trim().toLowerCase() === e);
  if (daEquipe?.nome) return daEquipe.nome;
  return (conhecidos().find((x) => x.email === e) || {}).nome || null;
}
const primeiroNome = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };
/* "Bom dia, Ana!" quando o app sabe quem é; só "Bom dia!" quando não sabe */
const ola = (email) => { const n = primeiroNome(nomeDoEmail(email)); return n ? `${saudacao()}, ${esc(n)}!` : `${saudacao()}!`; };

function lerSessao() { try { return JSON.parse(localStorage.getItem(NS + ":sessao") || "null"); } catch { return null; } }
function gravarSessao(v) { try { v ? localStorage.setItem(NS + ":sessao", JSON.stringify(v)) : localStorage.removeItem(NS + ":sessao"); } catch {} }
/* ---------- saiu à mão ----------
   "Sair do meu acesso" apagava a sessão e o render seguinte a recriava na hora:
   com a conta do servidor ligada a uma pessoa, o app reconhecia o e-mail e
   entrava de novo, sozinho. O botão não fazia nada visível.
   Este carimbo diz "foi decisão de gente" e segura o religamento automático até
   alguém escolher um nome de novo. Fica no navegador: fechar e reabrir não
   devolve o acesso de quem saiu — que é o ponto de um botão de sair. */
const SAIU = NS + ":saiu";
const saiuAMao = () => { try { return localStorage.getItem(SAIU) === "1"; } catch { return false; } };
const marcarSaida = (v) => { try { v ? localStorage.setItem(SAIU, "1") : localStorage.removeItem(SAIU); } catch {} };
/* papéis de produção — gabarito por processo, fiel aos PDFs da fábrica */
const PAPEL_TPL = {
  BANDANA:     { etapas: ["COSTURA", "ACABAMENTO"], check: [] },
  ADESIVO:     { etapas: ["DOBRAR/CORTAR", "COLA"], check: ["ACABAMENTO", "ADESIVO", "EMBALAGEM", "ETIQUETA", "AMOSTRA"] },
  GARGANTILHA: { etapas: ["PASSAR/COLAR FITILHO", "COLA"], check: ["ACABAMENTO", "FITILHO", "EMBALAGEM", "ETIQUETA", "AMOSTRA"] },
  GRAVATA:     { etapas: ["PASSAR/COLAR FITILHO", "COLA"], check: ["PÉROLA", "ACABAMENTO", "FITILHO", "EMBALAGEM", "ETIQUETA", "AMOSTRA"] },
  CHUCA:       { etapas: ["AGULHA/TRAVA/FITILHO", "COLA"], check: ["ACABAMENTO", "BORRACHA", "TRAVA", "EMBALAGEM", "ETIQUETA", "AMOSTRA"] },
  MAQUINA:     { etapas: ["MÁQUINA", "COLA"], check: ["ACABAMENTO", "FITILHO", "BORRACHA", "EMBALAGEM", "ETIQUETA", "AMOSTRA"] },
};
const normProc = (x) => String(x || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

