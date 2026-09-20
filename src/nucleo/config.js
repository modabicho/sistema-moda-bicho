/* ---------- estado ---------- */
const CFG_PADRAO = {
  mesesEstoqueSeguranca: 4,
  /* processos que não sustentam os 4 meses — valor agregado alto prende dinheiro parado */
  regrasMeses: [{ processo: "BANDANA", A: 2, B: 1.5, C: 1 }],
  buscaSite: "https://www.modabicho.com.br/pesquisa?q={sku}",
  padroes: { destinar: [], separar: [], enviar: [], acompanhar: [], receber: [], conferir: [] },
  dividirBlocos: true,
  toleranciaAtraso: 3, /* dias de folga além do prazo antes de considerar atraso */
  prazoConferencia: 3, /* dias entre chegar e ser conferido */
  formatoPapel: "cupom", /* a operação imprime em bobina; o A4 virou exceção */
  larguraCupom: 68, /* mm úteis na bobina de 80mm — ajustável na hora de imprimir */
  /* ---------- o corte entre um pedido e outro ----------
     O navegador NÃO consegue mandar a guilhotina cortar: o comando de corte é
     ESC/POS, e o que sai daqui é uma página para o driver da impressora. O que
     dá para fazer — e é o que faltava — é entregar CADA PEDIDO COMO UMA PÁGINA.
     Aí o driver, configurado para cortar por página, corta no lugar certo.

     Sem isso o conteúdo escorria em fluxo contínuo e a paginação caía onde
     desse: três canhotos viravam duas páginas, e o corte automático rasgava um
     pedido pela metade — pior do que não cortar. */
  cortarPorPedido: true,
  /* `@page{size:80mm auto}` parecia certo e não é: altura `auto` não é suportada,
     e o Chrome cai silenciosamente em A4 — a bobina recebia uma página de 210mm
     de largura. Agora a altura é um número, e ela é ajustável porque canhoto de
     processo com muitas etapas é mais alto que o de processo simples.
     Alta demais = papel em branco antes do corte. Baixa demais = canhoto
     partido ao meio. 200mm cobre o canhoto completo com folga. */
  alturaCupom: 200,
  /* para driver que não sabe cortar por página: imprime a linha pontilhada e a
     tesoura, para rasgar na mão no lugar certo */
  marcaCorte: false,
  capacidadeFila: 40,
  /* O MAIOR NÚMERO DE PEDIDO JÁ ENTREGUE. Não é preferência: é memória.
     Existe porque `proximoNumeroPedido()` deduzia o próximo do que estava na
     lista, e pedido excluído sai da lista — o número dele voltava para a fila.
     Este campo só sobe. Ver `numeroMarcarUsado()`. */
  maiorNumeroUsado: 0,
};
const VERSAO = "8.106";

/* ---------------------------------------------------------------------------
   railMini · o menu recolhido é preferência DE QUEM ESTÁ NESTA MÁQUINA
   ---------------------------------------------------------------------------
   Ele morava em `S.cfg`, que é um documento compartilhado por toda a equipe:
   recolher o menu numa máquina PROPUNHA a mudança para todas. Agora mora aqui,
   no navegador, e nunca sai daqui. */
const RAIL_CHAVE = "pcp5:rail-mini";
function railMini() {
  try { return localStorage.getItem(RAIL_CHAVE) === "1"; } catch { return false; }
}
function railMiniGravar(v) {
  try { if (v) localStorage.setItem(RAIL_CHAVE, "1"); else localStorage.removeItem(RAIL_CHAVE); } catch {}
}
/* ---------------------------------------------------------------------------
   tema · claro, escuro, ou o que a máquina pedir
   ---------------------------------------------------------------------------
   Mesma regra do menu recolhido: é preferência DE QUEM ESTÁ NESTA MÁQUINA, e
   por isso mora no navegador e nunca sai daqui. Três valores:

     "auto"    (padrão) segue o sistema operacional
     "claro"   fica claro mesmo com o sistema no escuro
     "escuro"  fica escuro mesmo com o sistema no claro

   O escuro é NATIVO: uma paleta própria no `tokens.css`, não uma inversão do
   claro. Inverter daria cinza chapado e texto branco puro, que o manual da
   marca proíbe. Aqui a superfície elevada fica mais CLARA que a base — o
   contrário do tema claro, e é isso que dá profundidade sem sombra.

   `document.documentElement` recebe `data-tema`; quando é "auto" o atributo
   sai, e aí quem decide é o `@media (prefers-color-scheme)`. */
const TEMA_CHAVE = "pcp5:tema";
const TEMAS = ["auto", "claro", "escuro"];
function temaEscolhido() {
  try { const v = localStorage.getItem(TEMA_CHAVE); return TEMAS.includes(v) ? v : "auto"; }
  catch { return "auto"; }
}
/* o que está VALENDO agora — "auto" resolvido contra o sistema */
function temaValendo() {
  const t = temaEscolhido();
  if (t !== "auto") return t;
  try { return matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro"; }
  catch { return "claro"; }
}
function temaAplicar() {
  try {
    const t = temaEscolhido();
    const raiz = document.documentElement;
    if (t === "auto") raiz.removeAttribute("data-tema");
    else raiz.setAttribute("data-tema", t);
    /* a barra do navegador/sistema acompanha, senão o topo do celular fica
       claro com o app escuro */
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", temaValendo() === "escuro" ? "#060B17" : "#2A3551");
  } catch (e) {}
}
function temaGravar(t) {
  try { if (t === "auto") localStorage.removeItem(TEMA_CHAVE); else localStorage.setItem(TEMA_CHAVE, t); } catch {}
  temaAplicar();
}
/* aplica ANTES do primeiro render, para a tela não piscar clara e virar escura */
try { temaAplicar(); } catch (e) {}
/* e acompanha o sistema enquanto estiver em "auto" */
try {
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (temaEscolhido() === "auto") temaAplicar();
  });
} catch (e) {}

const ABERTO_EM = new Date().toISOString(); /* quando ESTE arquivo foi carregado no navegador */
