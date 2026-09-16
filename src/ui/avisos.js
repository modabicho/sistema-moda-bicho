/* ==========================================================================
   AVISOS DO SISTEMA
   (classe `avs-`, não `av-`: `.av` já é o AVATAR das pessoas. Escrevi `.av`
   primeiro e o aviso crítico saiu com 38px de largura, herdando o CSS de um
   círculo de iniciais. Nome de classe é namespace: colidir é silencioso.) — uma fila, com hierarquia
   Antes eram quatro banners montados em ordem FIXA, e a ordem estava ao
   contrário do que importa:

       ${alertaTeste}${alertaVersao}${alertaNovidade}${alertaMem}${corpo}
         informativo    informativo    atenção        CRÍTICO

   Ou seja: "seus dados não estão sendo salvos" aparecia por último, depois de
   três avisos que ninguém precisa ler agora, e empurrado para fora da primeira
   tela justamente quando havia mais coisa acontecendo. Quanto pior a situação,
   mais escondido ficava o aviso que importa.

   Agora é uma fila só, ordenada por RISCO:
     1 crítico    o dado pode se perder. Nunca recolhe, nunca some.
     2 atenção    não perde nada agora, mas trabalhar por cima gera problema.
     3 info       pode esperar o fim do que você está fazendo.

   E a altura tem teto: o primeiro da fila abre inteiro, o resto vira UMA linha
   "mais N avisos". Quatro banners empilhados empurram a tela para baixo — e uma
   tela empurrada para baixo é uma tela onde ninguém lê nada.

   O que NÃO mudou: nenhum estado novo, nenhuma regra de negócio. Isto lê
   CAMADA, SALVO, _pendentes, S.novidade e S.versaoNova, que já existiam.
   ========================================================================== */
const AVISO_NIVEL = { critico: 0, atencao: 1, info: 2 };

/* ---------- risco de perder trabalho ao recarregar ----------
   Uma pergunta só, usada pelo aviso E pela ação. Se ela vivesse só no visual,
   o botão continuaria recarregando por cima de gravação pendente. */
const temTrabalhoNaoGravado = () => SALVO.ok === false || CAMADA === "memoria" || _pendentes.size > 0;

function avisosDoSistema() {
  const av = [];

  /* ---- 1. CRÍTICO: o dado pode se perder ----
     Os dois casos são a MESMA notícia para quem usa ("o que eu fiz pode não
     estar guardado") e por isso são um aviso só, não dois. O detalhe técnico
     — em que camada o app está, qual foi o erro do servidor — vive atrás de
     "Ver detalhes", que é onde detalhe técnico deve viver. */
  if (CAMADA === "memoria" || SALVO.ok === false) {
    const naMemoria = CAMADA === "memoria";
    av.push({
      id: "gravacao", nivel: "critico",
      titulo: "Suas alterações não foram salvas",
      texto: naMemoria
        ? "O app não conseguiu gravar em lugar nenhum deste aparelho. Tudo o que você fizer vale só nesta tela e some se ela fechar."
        : "O servidor não confirmou a gravação. O que você fez continua aqui na tela, mas pode não estar guardado para as outras pessoas.",
      acoes: [
        { act: "tentar-sincronizar", rot: "Tentar salvar de novo", primaria: true },
        { act: "backup", rot: "Baixar backup agora" },
        { act: "ver-gravacao", rot: "Ver detalhes" },
      ],
    });
  }

  /* ---- 1b. CRÍTICO: está gravando, mas só neste computador ----
     Quando o servidor recusa, o app re-sonda e encontra o navegador: grava lá e
     devolve sucesso. O dado não se perde — mas passa a existir só NESTA
     máquina, e as outras pessoas não veem nada. Isso era invisível: o indicador
     dizia "Salvo" e a única pista ficava dentro da janela de status. */
  const presas = (typeof secoesSoLocais === "function" ? secoesSoLocais() : []);
  if (presas.length && CAMADA !== "memoria" && SALVO.ok !== false) {
    const nomes = presas.map((s) => SECAO_NOME[s] || s);
    av.push({
      id: "semServidor", nivel: "critico",
      titulo: presas.length === 1 ? "Uma alteração está só neste computador" : `${presas.length} alterações estão só neste computador`,
      /* nomear o que ficou preso é a diferença entre "algo deu errado" e
         "isto aqui é o que ainda não subiu" */
      texto: `O servidor recusou e o app gravou aqui no navegador — ${nomes.join(", ")}. Você não perde o que fez, mas as outras pessoas não estão vendo. O app tenta reenviar sozinho a cada 15 segundos; enquanto não subir, este computador é o único lugar onde isso existe.`,
      acoes: [
        { act: "tentar-sincronizar", rot: "Tentar o servidor agora", primaria: true },
        { act: "backup", rot: "Baixar backup" },
        { act: "ver-gravacao", rot: "Ver detalhes" },
      ],
    });
  }

  /* ---- 1c. CRÍTICO: remoções de cadastro foram RETIDAS ----
     A guarda barrou remoções em massa vindas de uma troca de listas
     (restaurar backup, reimportar planilha) ou de um número alto demais para
     ser gente clicando. Nada foi perdido: o registro continua na tabela. Mas a
     tela e a tabela estão diferentes AGORA, e isso não pode ficar mudo. */
  const retidas = (typeof cadRemocoesRetidas === "function" ? cadRemocoesRetidas() : []);
  if (retidas.length) {
    const porCad = {};
    for (const r of retidas) porCad[r.cadastro] = (porCad[r.cadastro] || 0) + 1;
    const resumo = Object.keys(porCad).map((k) => porCad[k] + " de " + k).join(", ");
    av.push({
      id: "remocoesRetidas", nivel: "critico",
      titulo: retidas.length === 1
        ? "Uma remoção de cadastro foi barrada por segurança"
        : `${retidas.length} remoções de cadastro foram barradas por segurança`,
      texto: `Uma troca de listas inteiras (restaurar backup ou reimportar planilha) pediria para o servidor remover ${resumo}. `
        + `O app NÃO removeu nada: o cadastro continua guardado no servidor, e é de lá que a tela lê. `
        + `Se era mesmo para remover, apague um a um pela tela — assim cada um passa pela confirmação de sempre.`,
      acoes: [
        { act: "ver-remocoes-retidas", rot: "Ver o que foi barrado", primaria: true },
        { act: "limpar-remocoes-retidas", rot: "Já conferi, pode limpar o aviso" },
      ],
    });
  }

  /* ---- 2. ATENÇÃO: sua tela está velha ----
     Outra pessoa gravou. Não perdeu nada ainda — mas continuar editando por
     cima do estado antigo é exatamente como nasce um conflito. Note que isto
     NÃO é "tem gente no app": ter companhia é contexto e mora no cabeçalho. */
  if (S.novidade) {
    av.push({
      id: "novidade", nivel: "atencao",
      titulo: `${S.novidade.por || "Outra pessoa"} gravou alterações`,
      texto: `Foi às ${fdataHora(S.novidade.em).split(" ").pop()}. Sua tela ainda mostra o estado anterior — termine o que está fazendo e atualize antes de mexer nos mesmos pedidos.`,
      acoes: [{ act: "atualizar-agora", rot: "Atualizar os dados", primaria: true }],
    });
  }

  /* ---- 3. INFORMATIVO: versão nova ----
     Pode esperar. E quando há gravação pendente, atualizar é justamente o pior
     momento — por isso o botão passa pelo mesmo portão da ação (ver o guarda
     em `recarregar-app`), e não só por este texto. */
  if (S.versaoNova) {
    av.push({
      id: "versao", nivel: "info",
      titulo: `Versão ${S.versaoNova.versao} publicada`,
      texto: `Você está usando a ${VERSAO}. O navegador só troca ao recarregar.`,
      acoes: [
        { act: "recarregar-app", rot: "Atualizar agora", primaria: true },
        { act: "versao-depois", rot: "Depois" },
      ],
    });
  }

  return av.sort((a, b) => AVISO_NIVEL[a.nivel] - AVISO_NIVEL[b.nivel]);
}

const avisoIcone = (n) => n === "critico" ? IC.alerta : n === "atencao" ? IC.historico : IC.atualizar;
const AVISO_ROTULO = { critico: "AÇÃO NECESSÁRIA", atencao: "ATENÇÃO", info: "INFORMAÇÃO" };

function avisoAberto(a) {
  return `<div class="avs-i avs-${a.nivel}" role="${a.nivel === "critico" ? "alert" : "status"}">
    <div class="avs-ic">${svg(avisoIcone(a.nivel))}</div>
    <div class="avs-corpo">
      <div class="avs-nivel">${AVISO_ROTULO[a.nivel]}</div>
      <h4 class="avs-tit">${esc(a.titulo)}</h4>
      <p class="avs-txt">${esc(a.texto)}</p>
    </div>
    <div class="avs-acoes">
      ${a.acoes.map((x) => `<button class="btn sm ${x.primaria ? "primary" : "ghost"}" data-act="${x.act}">${esc(x.rot)}</button>`).join("")}
    </div>
  </div>`;
}

/* recolhido: uma linha, com a ação principal ainda ao alcance */
function avisoCompacto(a) {
  const p = a.acoes.find((x) => x.primaria);
  return `<div class="avs-i avs-min avs-${a.nivel}">
    <span class="avs-ponto"></span>
    <span class="avs-tit-min">${esc(a.titulo)}</span>
    <span class="avs-txt-min">${esc(a.texto)}</span>
    ${p ? `<button class="btn sm ghost" style="margin-left:auto" data-act="${p.act}">${esc(p.rot)}</button>` : ""}
  </div>`;
}

function barraDeAvisos() {
  const av = avisosDoSistema();
  if (!av.length) return "";
  const [primeiro, ...resto] = av;
  /* O primeiro da fila abre sempre. Se ele é crítico, os outros ficam
     recolhidos mesmo que a pessoa tenha aberto antes: quando há risco de perder
     dado, a tela não é o lugar de mostrar mais três coisas. */
  const abrirResto = S.avisos.abrir && primeiro.nivel !== "critico";
  return `<div class="avs">
    ${avisoAberto(primeiro)}
    ${resto.length ? `<button class="avs-mais" data-act="avisos-mais" aria-expanded="${abrirResto}">
        ${svg(abrirResto ? IC.setaCima : IC.setaBaixo)}
        ${abrirResto ? "Esconder" : `Mais ${resto.length} ${resto.length === 1 ? "aviso" : "avisos"}`}
        ${abrirResto ? "" : `<span class="avs-mais-t">${esc(resto.map((x) => x.titulo).join(" · "))}</span>`}
      </button>${abrirResto ? resto.map(avisoCompacto).join("") : ""}` : ""}
  </div>`;
}

/* ---------- o crachá da cópia de teste ----------
   Era um banner de três linhas repetido em TODAS as telas, para dizer uma coisa
   que a tela já grita de dois outros jeitos: a borda laranja em volta e a faixa
   fixa no rodapé. Três avisos para o mesmo fato, e o do meio ocupava a primeira
   dobra. Vira crachá; a explicação inteira continua a um toque. */
const crachaTeste = () => MODO_TESTE
  ? `<button class="cracha-teste" data-act="ver-gravacao"
      title="Esta cópia está aberta do seu computador, não do site. Ela LÊ os dados de verdade, mas nada do que você fizer aqui vai para o app das meninas — fica só neste navegador. Toque para ver o status do sistema.">MODO TESTE</button>`
  : "";
