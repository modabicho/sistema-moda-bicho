# v8.79 — trava de reentrância da análise

**Data:** 14/09/2026

**Artefato:** `PCP-v8.79.html`

**MD5 verificado:** `f4b9a5003a7535a93352abb0191e81a2`

**Tamanho verificado:** 2.134.151 bytes

**Linhas informadas:** 32.207

**Marcador interno verificado:** `<!--PCP:8.79-->`

**Base:** contém v8.78, v8.77, v8.76, v8.75 e v8.74.

## Bug corrigido — análise podia rodar duas vezes

O problema visual de dois toasts de “Análise aplicada” não era causado por dois emissores nem por um resumo prematuro. A medição mostrou que havia um único emissor relevante e que o toast era o último passo da execução.

A causa real era uma **segunda execução inteira da análise**.

No binário antigo publicado, a trava de clique morava apenas no nó DOM do botão: `data-ocupado="1"`, `disabled=true` e texto “Aguarde…”. Como a janela de prévia continua aberta durante a análise, qualquer `render()` intermediário — por sincronização, Realtime ou gravação — podia recriar o botão e remover a trava visual. Um segundo clique então entrava novamente em `aplicarAnalise()`.

A segunda rodada encontrava tudo já processado pela primeira e, por isso, mostrava corretamente zeros. Os toasts ficavam empilhados na tela e davam a impressão de que o resumo zerado havia ocorrido antes.

## Correção estrutural

A correção foi feita em duas camadas.

### 1. Trava da ação em estado

Em `acoes/clique.js`, a trava deixa de depender do elemento visual e passa a usar `ACOES_RODANDO`, sobrevivendo a qualquer `render()`.

Conceito:

```js
if (ACOES_RODANDO.has(act)) return;
ACOES_RODANDO.add(act);
try {
  await grupo(act, t, e);
} finally {
  ACOES_RODANDO.delete(act);
}
```

A proteção cobre a classe de ações `confirmar-*`, `aplicar-*` e `salvar-*` contra reentrada durante repaint.

### 2. Trava própria da análise

Em `demanda/calculo.js`, `aplicarAnalise()` ganhou defesa de reentrância própria:

```js
let ANALISE_RODANDO = false;
async function aplicarAnalise(...) {
  if (ANALISE_RODANDO) return { status: "ja-rodando" };
  ANALISE_RODANDO = true;
  try {
    return await aplicarAnaliseMiolo(...);
  } finally {
    ANALISE_RODANDO = false;
  }
}
```

O miolo da análise, a ordem dos cálculos, os contadores e o toast não foram alterados.

## Evidência da causa

No binário publicado antigo foi reproduzido:

```text
botão após clique 1 → ocupado/desabilitado
render() no meio
botão novo → habilitado novamente
chamadas a aplicarAnalise → 2
toasts → 2
```

Na v8.79, o mesmo cenário com render intermediário e tentativa de segundo clique produz **1 chamada e 1 toast**.

## Testes

Nova bateria `testes/analise-toast-duplo.js`:

**15 ok · 0 falhas**.

Cobertura informada:

- análise com alterações → um toast com números reais;
- análise sem alterações → um toast zerado;
- repriorização sem novas necessidades → um toast correto;
- execuções separadas → um toast por execução;
- `render()`/persistência/callback → nenhum toast extra;
- prioridade em cascata da v8.76 preservada;
- reprodução do defeito no binário antigo e bloqueio na v8.79.

## Regressão dirigida v8.78 × v8.79

Sem regressão nova nas baterias informadas. Permaneceram idênticas, entre outras:

- `janelas`: 531 ok · 0;
- `conflito-falso`: 12 ok · 0;
- `duas-abas`: 25 ok · 0;
- `e3-documento-protegido`: 32 ok · 0;
- `concorrencia-demanda`: 43 ok · 0;
- `falso-conflito-papel`: 25 ok · 0;
- `v877-equivalencia-criacao`: 33 ok · 0;
- `v876-prioridade-cascata`: 27 ok · 0;
- `v875-tres-bugs`: 36 ok · 0.

As falhas já existentes em baterias como `conflito-revisao` e `limpeza-lote` permaneceram iguais e não são regressões da v8.79.

## Observação de publicação

O print que levou à investigação mostrava o texto “pedidos promovidos”, presente até v8.75. A medição apontou que o ambiente publicado ainda estava em uma versão antiga (v8.73), portanto as correções v8.74–v8.79 estavam acumuladas e ainda não publicadas naquele momento.
