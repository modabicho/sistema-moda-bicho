/* ---------- leitor de código (bipe) ----------
   O leitor se comporta como teclado: digita o conteúdo muito rápido e manda Enter.
   É essa velocidade que o distingue de alguém digitando — daí a janela de 45ms
   entre teclas. Sem isso, qualquer digitação viraria uma tentativa de abrir pedido.

   O código impresso é só letras e números (PCP1502) porque o leitor emula teclado
   americano: num teclado ABNT2 a tecla dos dois-pontos é a do ç, e o "PCP:1502"
   chegava como "PCPç1502". Letra, número e hífen são iguais nos dois layouts. */
/* ---------- leitura independente do layout do teclado ----------
   O leitor de código manda TECLAS FÍSICAS. O Windows converte pelo layout ativo:
   no inglês sai ":" e "/", no ABNT2 sai "Ç" e ";". Em vez de adivinhar a tradução,
   lemos a tecla física (ev.code), que é a mesma nos dois, e remontamos o caractere
   como o leitor pretendeu. Funciona em português, inglês ou qualquer outro layout. */
const TECLA_FISICA = {
  Digit1: ["1", "!"], Digit2: ["2", "@"], Digit3: ["3", "#"], Digit4: ["4", "$"],
  Digit5: ["5", "%"], Digit6: ["6", "^"], Digit7: ["7", "&"], Digit8: ["8", "*"],
  Digit9: ["9", "("], Digit0: ["0", ")"], Minus: ["-", "_"], Equal: ["=", "+"],
  BracketLeft: ["[", "{"], BracketRight: ["]", "}"], Period: [".", ">"],
  Slash: ["/", "?"], Semicolon: [";", ":"], Comma: [",", "<"], Space: [" ", " "],
};
function charDaTecla(ev) {
  const cod = String(ev.code || "");
  if (/^Key[A-Z]$/.test(cod)) { const l = cod.slice(3); return ev.shiftKey ? l : l.toLowerCase(); }
  if (/^Digit\d$/.test(cod) || TECLA_FISICA[cod]) { const par = TECLA_FISICA[cod]; return par ? par[ev.shiftKey ? 1 : 0] : null; }
  if (/^Numpad\d$/.test(cod)) return cod.slice(6);
  return null;   /* tecla sem equivalente conhecido: usa o que o navegador deu */
}

const PREFIXO_BIPE = "PCP";
/* prefixo do código de PRODUTO: só letras, para sobreviver a qualquer teclado */
const PREFIXO_PROD = "PRD";
const RE_PROD = /^PRD[^A-Z0-9]?/i;
const ehProdBipe = (t) => RE_PROD.test(String(t || "")) && String(t).length > 4;
/* aceita também os canhotos antigos, em que a pontuação virou ç, ; ou : */
const RE_BIPE = /^PCP[^A-Z0-9]?/i;
/* O leitor "digita" o conteúdo do código, e o Windows interpreta pelo teclado
   brasileiro: onde o código traz ":" sai "Ç", e onde traz "/" sai ";".
   "https://..." chega como "httpsÇ;;...". Aqui a bagunça é desfeita. */
function desABNT2(t) {
  const orig = String(t || "");
  /* O leitor manda a TECLA física e o Windows converte pelo layout brasileiro:
     onde o código traz ":" sai "Ç", onde traz "/" sai ";".
     Só converte quando o texto está REALMENTE embaralhado — uma URL que já veio
     correta ("https://") não pode ser mexida, senão vira "https?//". */
  if (!/[Çç]/.test(orig) && !/^https?;/i.test(orig)) return orig;
  const MAPA = { "Ç": ":", "ç": ";", ";": "/", "´": "'", "`": '"', "^": "&" };
  return [...orig].map((c) => (c in MAPA ? MAPA[c] : c)).join("");
}
const RE_URL_BIPE = /^https?(:|Ç)/i;
/* começo plausível de leitura: serve para não descartar o acúmulo numa pausa */
const comecoDeBipe = (t) => { const x = String(t || "");
  return x.length > 2 && (/^PCP/i.test(x) || /^PRD/i.test(x) || /^h?t?t?p?s?[:Ç;]/i.test(x) || /^https?/i.test(x)
    || /^www/i.test(x) || /modabicho/i.test(x)); };
const ehUrlBipe = (t) => { const x = String(t || "").trim();
  /* e-mail NÃO é endereço de produto. "contato@modabicho.com.br" tem mais de 12
     caracteres e contém "modabicho" — passava por aqui como se fosse uma leitura
     de código, e o app abria uma aba para um endereço que não existe. O "@" é o
     que separa as duas coisas, e nenhum link de produto tem um. */
  if (x.includes("@")) return false;
  /* aceita a URL mesmo sem o "https://" na frente — a pontuação é justamente o
     que o teclado come, então o endereço pode chegar só como "www..." */
  return x.length > 12 && (RE_URL_BIPE.test(x) || /^www\./i.test(x) || /modabicho/i.test(x)); };
/* tira o prefixo do texto: serve para o atalho e para qualquer campo de busca,
   já que o pedido é gravado só com o número */
const semPrefixoBipe = (t) => String(t || "").replace(RE_BIPE, "");
const ehCodigoBipe = (t) => (RE_BIPE.test(String(t || "")) && String(t).length > 3) || ehProdBipe(t) || ehUrlBipe(t);
const bipe = { buf: "", t: 0, timer: null, alvo: null, ritmo: [] };

/* ---------- o que é leitura e o que é gente digitando ----------
   O leitor digita em torno de 15ms por tecla; uma pessoa, 100ms ou mais. Entre
   os dois há um vale largo, e 60ms fica no meio dele com folga para os dois lados.

   Isto NÃO vale para os códigos com prefixo (PCP…, PRD…): ninguém digita
   "PCP1502" por acidente, então eles continuam valendo em qualquer ritmo — se a
   leitora estiver lenta num computador mais velho, o canhoto continua abrindo.
   A exigência de ritmo cai só sobre o palpite de URL, que é o ambíguo: é ele que
   colide com e-mail, endereço de site e qualquer texto com "modabicho" dentro. */
const ritmoDeMaquina = (g) => {
  if (!g || g.length < 3) return false;    /* material de menos para afirmar */
  const s = g.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] <= 60;
};

function dispararBipe() {
  clearTimeout(bipe.timer);
  const cod = bipe.buf, alvo = bipe.alvo, comPrefixo = RE_BIPE.test(cod) || ehProdBipe(cod);
  bipe.buf = ""; bipe.alvo = null;
  const ritmo = bipe.ritmo; bipe.ritmo = [];
  if (!ehCodigoBipe(cod)) return;
  if (!comPrefixo && !ritmoDeMaquina(ritmo)) return;
  /* o leitor digitou o código dentro do campo que estava com o cursor: limpa antes de sair */
  try { if (alvo && "value" in alvo) alvo.value = alvo.value.replace(cod, "").replace(RE_BIPE, ""); } catch {}
  abrirPorBipe(cod);
}

function ligarLeitor() {
  document.addEventListener("keydown", (ev) => {
    /* Eventos sintéticos — gerenciador de senha preenchendo o campo, autocompletar do
       navegador, teclado virtual — chegam SEM a propriedade key. Ler .length dela
       derrubava o app na tela de login, onde o preenchimento automático acontece. */
    const tecla = typeof ev.key === "string" ? ev.key : "";
    if (!tecla) return;
    const alvo = ev.target;
    /* Campo de e-mail e campo de senha nunca recebem leitura de código: ali só
       entra gente digitando. Zerar o acúmulo aqui é o que impede que metade do
       e-mail sobreviva e vire "código" depois, num campo qualquer. */
    const tipoCampo = String(alvo && alvo.type || "").toLowerCase();
    if (tipoCampo === "password" || tipoCampo === "email") { bipe.buf = ""; bipe.ritmo = []; return; }
    const agora = Date.now();
    const desdeAUltima = agora - bipe.t;
    /* Pausa longa recomeça o acúmulo — era gente digitando, não o leitor.
       Mas 120ms era apertado: uma leitura de 70 caracteres com Shift no meio
       (o "Ç" exige Shift) passa disso e o código era descartado pela metade.
       Com 400ms cabe a leitura inteira, e quem digita à mão dificilmente
       mantém esse ritmo por um código todo. E se o acúmulo JÁ parece um
       código, a pausa não o descarta. */
    if (agora - bipe.t > 400 && !comecoDeBipe(bipe.buf)) { bipe.buf = ""; bipe.ritmo = []; }
    bipe.t = agora;
    if (tecla === "Enter") {
      if (ehCodigoBipe(bipe.buf)) { ev.preventDefault(); bipe.alvo = alvo; dispararBipe(); }
      else { bipe.buf = ""; bipe.ritmo = []; }
      return;
    }
    if (tecla.length === 1) {
      /* prefere a tecla FÍSICA: igual em qualquer layout, então o código chega
         íntegro tanto no teclado inglês quanto no ABNT2 */
      /* o intervalo só conta a partir da SEGUNDA tecla: o da primeira mede a
         pausa desde qualquer coisa que a pessoa fez antes, e não diz nada */
      if (bipe.buf) { bipe.ritmo.push(desdeAUltima); if (bipe.ritmo.length > 90) bipe.ritmo.shift(); }
      bipe.buf += (charDaTecla(ev) ?? tecla);
      bipe.alvo = alvo;
      /* nem todo leitor manda Enter no fim; se parar de chegar tecla, dispara sozinho */
      clearTimeout(bipe.timer);
      if (ehCodigoBipe(bipe.buf)) bipe.timer = setTimeout(dispararBipe, 220);
    }
  }, true);
}

function abrirPorBipe(cod) {
  /* código do PRODUTO: o leitor entrega a URL, embaralhada pelo teclado brasileiro.
     Desfaz a bagunça e abre o produto no app, que é mais útil na fábrica do que
     a loja — mostra estoque, pedidos em aberto e histórico. */
  /* código de PRODUTO (PRD + SKU): só letras e números, imune ao layout do teclado */
  if (ehProdBipe(cod)) {
    const sk = String(cod).replace(RE_PROD, "").trim();
    const so = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const p = produtoDe(sk) || S.produtos.find((x) => so(x.sku) === so(sk));
    if (!p) return toast(`SKU ${sk} não está no cadastro de produtos.`, "erro");
    /* Quem abre a loja é o APP, não o leitor. Assim o endereço sai íntegro:
       não passa pelo teclado, que é onde a barra e os dois-pontos se perdiam. */
    const acao = S.cfg.aoBiparProduto || "app";
    const url = p.urlSite || linkSite(p) || "";
    const fora = urlExterna(url);
    if (acao !== "app" && fora) { try { if (window.open) window.open(fora, "_blank"); } catch {} }
    if (acao === "loja") return toast(`${p.sku} — abrindo na loja.`);
    S.modal = null; S.drawer = p.sku; render();
    return toast(`${p.sku} · ${(p.descricao || "").slice(0, 40)}${acao === "ambos" ? " — abrindo na loja também." : ""}`);
  }
  /* A pontuação é o que o teclado bagunça: ":" vira "Ç", "/" vira ";" ou some.
     Então a comparação IGNORA toda pontuação — sobram só letras e números, que
     são iguais em qualquer layout. "modabicho.com.br/adesivos-pet/lacinho-10-un"
     e "modabichocombradesivospetlacinho10un" viram a mesma coisa. */
  const soLetras = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const cru = soLetras(cod);
  if (cru.includes("modabicho") || ehUrlBipe(cod)) {
    const alvo = S.produtos.find((x) => x.urlSite && soLetras(x.urlSite).endsWith(cru.replace(/^https?/, "")))
      || S.produtos.find((x) => x.urlSite && cru.endsWith(soLetras(x.urlSite).replace(/^https?wwwmodabichocombr/, "")))
      || S.produtos.find((x) => { const u = soLetras(x.urlSite); return u && (u.includes(cru) || cru.includes(u)); });
    if (alvo) { S.modal = null; S.drawer = alvo.sku; render();
      return toast(`${alvo.sku} · ${(alvo.descricao || "").slice(0, 40)}`); }
  }
  if (ehUrlBipe(cod)) {
    const url = desABNT2(String(cod).trim());
    const caminho = url.replace(/^https?:\/\//i, "").replace(/^[^/]+\//, "").replace(/\/+$/, "").toLowerCase();
    const p = S.produtos.find((x) => {
      const u = String(x.urlSite || "").replace(/^https?:\/\//i, "").replace(/^[^/]+\//, "").replace(/\/+$/, "").toLowerCase();
      return u && caminho && u === caminho; });
    if (p) { S.modal = null; S.drawer = p.sku; render();
      return toast(`${p.sku} · ${(p.descricao || "").slice(0, 40)}`); }
    /* mesmo sem casar com um produto, a URL corrigida é útil: abre a loja */
    const porSku = S.produtos.find((x) => caminho.includes(String(x.sku || "").toLowerCase()));
    if (porSku) { S.modal = null; S.drawer = porSku.sku; render();
      return toast(`${porSku.sku} — encontrado pelo código dentro do link.`); }
    const fora = urlExterna(url);
    if (!fora) return toast(`Código lido não parece um endereço da loja.`, "erro");
    try { if (window.open) window.open(fora, "_blank"); } catch {}
    return toast(`Nenhum produto com este link no app — abrindo a loja. Importe o catálogo em Dados para o app reconhecer.`, "erro");
  }
  const num = String(cod).replace(RE_BIPE, "").trim().toUpperCase();
  if (!num) return toast("Código lido sem número de pedido.", "erro");
  const r = S.pedidos.find((x) => String(x.numero || "").trim().toUpperCase() === num)
    /* canhoto com zero à esquerda (0982) x pedido gravado sem ele */
    || S.pedidos.find((x) => String(x.numero || "").trim().toUpperCase().replace(/^0+/, "") === num.replace(/^0+/, ""));
  if (!r) return toast(`Pedido ${num} não encontrado. Confira se o canhoto é deste app.`, "erro");
  S.modal = null;
  if (r.status === "enviada" || r.status === "chegou" || r.status === "retornada") {
    S.modal = { tipo: "conferir", pedido: r, foto: fotoPedido(r) };
    render();
    toast(`Pedido ${num} · ${r.prestadora || "sem prestadora"} · ${n0(r.qtd)} enviadas.`);
  } else {
    S.aba = "pedidos"; S.pedView.busca = num;
    S.modal = { tipo: "pedido", pedido: r, foto: fotoPedido(r) };
    render();
    toast(`Pedido ${num} está em "${P_LABEL[r.status]}" — ainda não voltou da prestadora.`);
  }
}

