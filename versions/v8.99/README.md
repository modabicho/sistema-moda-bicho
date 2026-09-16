# v8.99 — Falso conflito de pedido consigo mesmo

**Data:** 16/09/2026
**Arquivo:** `PCP-v8.99.html`
**MD5 (repositório, LF):** `8ba314bba0c39ece264951bf6826bbfb`
**Tamanho:** 2.104.305 bytes · 31.849 linhas
**Marcador:** `<!--PCP:8.99-->` · `VERSAO = "8.99"`
**Base:** v8.98 (`bde01e39c6e0abc8d71db6b2aa7e35dd`)

## Como foi reproduzido

A cópia de teste não grava no Supabase, e reproduzir no app publicado mexeria num pedido real. A bancada `testes/conflito-pedido-bancada.js` troca **só a porta do servidor** (`persRpc`, `pxPorId`) por um servidor falso que segue o contrato documentado no próprio app:

- `p_expected_revision` diferente da revisão da linha → `conflito` com o registro atual;
- igual → aplica, `revision + 1`, `updated_by` = quem gravou;
- o mesmo `operation_id` devolve o resultado guardado;
- conflito não registra operação;
- cada gravação aceita gera um evento de Realtime.

Todo o resto é o código real do app: `salvarTudo`, `telaRegistrarIntencoes`, fila, `telaEnviarIntencoes`, `mgClassificar`, `rtChegou` e os textos dos toasts. O `salvarTudoMiolo`, que grava o documento, foi reduzido à forma dele (quem chega com gravação em curso espera a mesma promessa). As outras camadas (Demanda, cadastros etc.) ficaram desligadas na bancada.

Condições: uma pessoa, uma aba, pedido já existente. A sequência da captura é gravar o pedido N; criar o N+1 com o N ainda no ar; salvar um produto; nova alteração no N.

## Sequência de revisões que reproduzia (trilha da bancada na v8.98, resumida: repetições da mesma op omitidas)

```
ENVIO patch op=b654 nº2768 esperada=5 srv=5 quer={prioridade:1}         (várias rodadas enviam a MESMA op)
   ← b654 ok rev=6 por=eu                                               (as outras recebem o replay: ok rev=6)
ENVIO patch op=fc6b nº2768 esperada=5 srv=6 quer={prioridade:2,obs:"fila"}  (intenção registrada antes da resposta)
   ← fc6b conflito rev=6 por=eu                                         (em CADA rodada)
ENVIO patch op=37f4 esperada=6 (substitui fc6b)  ← rodada 1: ok rev=7
ENVIO patch op=82a3 esperada=6 (substitui fc6b)  ← rodada 2: conflito rev=7 — servidor JÁ tem prioridade 2 e obs "fila"
ENVIO patch op=d09d nº2768 esperada=5 srv=7 quer={prioridade:3}
ENVIO patch op=a3b5 esperada=7 (substitui d09d)  ← ok rev=8
ENVIO patch op=4210 esperada=7 (substitui d09d)  ← conflito rev=8 — servidor JÁ tem prioridade 3
TOAST … "alterado por outra pessoa"   (registro rev 7/8 por=eu, revisão não anotada como desta sessão)
```

## Causa raiz

1. **Rodadas simultâneas.** `telaEnviarIntencoes` é chamada no `finally` de **todo** `salvarTudo` e não tinha trava. Criar pedido e salvar produto sobrepõem dois ou três `salvarTudo`, então rodavam duas ou três rodadas em paralelo, cada uma com a sua cópia da fila. A mesma intenção velha do N era reprocessada por todas, e cada uma criava o seu próprio reenvio (id novo, mesma revisão esperada). Só um vence; os outros levam conflito contra a gravação da própria aba.
2. **Perdedor virava mensagem sem conferir valores.** O teste "o servidor já tem o que eu quero" (v8.74, P4) só existia no primeiro conflito. O conflito do reenvio (`r2`/`r3`) ia direto para `problemas`, mesmo com `servidor[campo] === desejado[campo]` em todos os campos.
3. **Revisão desta aba não anotada.** O sucesso do reenvio de merge automático (`r2`) não chamava `minhaRevisaoGuardar`/`meuUidAprender`, e o dreno (`pxSincronizarConfirmado`) também não. Um conflito contra essa revisão falhava em `gravacaoEhMinha`.
4. **Revisão andando para trás.** O `ok` de um replay devolve o resultado **guardado**, que pode ser mais velho do que a foto (ex.: `ok rev=7` com a foto em 8). O caminho `ok` e o `telaDesfazerNaoConfirmados` gravavam isso na foto e no pedido, e a gravação seguinte saía com a revisão esperada errada.

### Condição exata do 1º toast — "alterado por outra pessoa"

Um conflito do pedido N chega a `problemas` com `registro.updated_by` preenchido e `gravacaoEhMinha(registro)` **falso**. Isso acontece porque a revisão do registro foi produzida por esta aba num caminho que não a anota (sucesso do `r2`), ou porque a resposta que a anotaria ainda não foi processada quando o texto é montado.

### Condição exata do 2º toast — "tinha uma gravação sua mais nova"

Um conflito do mesmo pedido chega a `problemas` com `gravacaoEhMinha(registro)` **verdadeiro**: a revisão vencedora saiu do envio normal ou do reenvio `r3`, que anotam. O conflito só chega a `problemas` porque é a falha de um reenvio (`r2`/`r3`), onde não havia o teste de operação satisfeita.

### Por que os dois apareciam juntos

As rodadas paralelas produzem vários perdedores para o mesmo pedido, e cada perdedor aponta para uma revisão vencedora diferente. Quando uma dessas revisões foi gravada por caminho que anota e outra por caminho que não anota, a mesma leva de `problemas` gera os dois textos. Nada agrupava as mensagens por pedido.

Na varredura com a ordem da rede sorteada (captura; 75 execuções medidas), a v8.98 teve:
- **70/75** com falso conflito;
- **5** com os dois textos juntos e **1** só com "gravação sua" repetido;
- **2 perdas de dado**: a última alteração (prioridade 3) foi desfeita pela tela, e o servidor ficou com 2.

## Correção (só cliente; Supabase não foi tocado)

- **1 · Uma rodada por vez.** `telaEnviarIntencoes` virou porta única: quem chega com envio em curso não abre outra rodada, pede uma rodada a mais, que roda em seguida sobre a fila atualizada. O miolo passou para `telaEnviarIntencoesUmaRodada`. O dreno da abertura (`pxDrenar`) espera uma rodada em curso, e a rodada espera o dreno.
- **2 · A revisão nunca anda para trás, e gravação desta aba é anotada.** Novo `telaAplicarRegistro(id, reg, {minha, base, eco})`, usado pelo envio normal, pelos dois reenvios, pelo caso satisfeito e pelo dreno.
  - Resposta aceita desta aba é sempre anotada como minha.
  - Registro mais velho que a foto não rebaixa foto, base nem `pedido.revision`.
  - `telaDesfazerNaoConfirmados` também não volta a tela para um registro mais velho que a foto.
- **3 · Operação satisfeita não é conflito.** `telaOperacaoSatisfeita(patch, registro)`, a mesma comparação valor a valor de `mgClassificar`, agora também vale para a falha do reenvio `r2` e do `r3`. Se o servidor já tem tudo, a operação sai da fila, a foto se atualiza e não há mensagem.
- **4 · Uma mensagem por pedido e situação.** Entre conflitos do mesmo pedido na mesma rodada, sai uma mensagem. Se uma delas tem prova de ser desta sessão, "outra pessoa" não aparece.

**O que não mudou:**
- `p_expected_revision` continua vindo do registro verificado no conflito (nunca de uma revisão "mais nova" sem classificação);
- `mgClassificar`, `gravacaoEhMinha` (duas provas), textos das mensagens, Realtime monotônico, Supabase;
- Produto, Demanda, Datas Festivas e união.

## Arquivos

- `PCP-v8.99.html` (novo; v8.98 preservada): `telaEnviarIntencoes` + `telaEnviarIntencoesUmaRodada`, `telaAplicarRegistro`, `telaOperacaoSatisfeita`, `telaDesfazerNaoConfirmados`, `pxSincronizarConfirmado`, `pxDrenar`.
- `testes/conflito-pedido-bancada.js` (novo; MD5 LF `f5fb3024aef96a0dea1e0531d7f27e37`).

## Testes

| Bateria | v8.98 | v8.99 |
|---|---|---|
| `conflito-pedido` (A, B, C, C2, D, D2, E) | 4 ok · 3 falhas (B, D2, E) | **7 ok · 0 falhas** |
| Captura com ordem de rede sorteada | 75 medidas: 70 com falso conflito · 5 com os dois textos · 2 perdas | **80/80 sem toast · 0 perdas** |
| Conflito verdadeiro com ordem sorteada (D, D2, C, C2 × 12) | — | **48/48** |
| `datas-festivas-uniao` | 78 ok · 0 | **78 ok · 0** |

Cenários:
- **A.** A própria aba gravou e a operação repetida já está no servidor: sem conflito.
- **B.** O eco do Realtime da própria gravação chega antes da resposta, com operação antiga na fila: sem conflito. Falhava na v8.98 ("outra pessoa").
- **C / C2.** Outra pessoa altera outro campo, antes ou depois do registro da minha intenção: merge sem conflito.
- **D.** Outra pessoa altera o mesmo campo para outro valor: **conflito vermelho "outra pessoa"**, valor dela preservado.
- **D2.** Outra pessoa altera o mesmo campo entre o meu conflito e o meu reenvio: **um** conflito vermelho "outra pessoa". Na v8.98 eram dois toasts.
- **E.** A captura: sem conflito, e o N termina com a última alteração. Falhava na v8.98.

A fila real do navegador de teste (36 ações antigas da cópia) ficou intacta antes e depois de todas as execuções. Console sem erros.

## Limites e riscos

- **O servidor foi simulado pelo contrato escrito no app.** O repositório não tem o SQL de `pcp_pedido_patch`. Se o servidor real guardar e devolver conflitos por `operation_id` (a bancada supõe que não), o caminho continua coberto pela regra de operação satisfeita, mas isso não foi medido contra o Supabase.
- **Falta confirmar no app publicado**, com os dados reais: criar pedido N, criar N+1 e salvar um produto, conferindo `PED_CONFLITOS` e os toasts.
- **Outra aba ou outra máquina com o mesmo login** continua produzindo conflito real. É o comportamento documentado na v8.78.
- **Vários reenvios deixam de ser paralelos.** Uma rodada longa (rede lenta) faz a rodada seguinte esperar; nada se perde, porque a intenção já está na fila.
