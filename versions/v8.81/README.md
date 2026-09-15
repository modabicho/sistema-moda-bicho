# Sistema Moda Bicho PCP — v8.81

Data de registro: 14/09/2026.

**MD5:** não informado no material recebido.

**Base:** v8.80.

> Observação: nesta conversa não foi recebido o arquivo HTML da v8.81. Portanto MD5, tamanho e marcador interno não foram verificados. O relatório técnico usado neste registro chama a correção de v8.81, mas contém uma frase isolada citando “v8.82... na v8.81”; isso foi tratado como possível erro de rótulo do relatório, não como evidência de uma versão v8.82.

## Corrigido — tela piscando por render de presença

A causa do piscar periódico da interface foi localizada no mecanismo de presença.

`aplicarPresenca()` terminava chamando `renderDeFundo()` a cada ciclo de aproximadamente 20 segundos, mesmo quando a lista de pessoas presentes não havia mudado. Como a presença não é exibida na tela principal e só é usada em janelas específicas, isso provocava redesenhos globais sem efeito visual útil.

### Medição antes da correção

Com o sistema parado por 60 segundos:

```text
3 renders em 60 s

20975ms   8ms  mudou=true    render ← aplicarPresenca ← lerPresenca
40977ms  12ms  mudou=false   render ← aplicarPresenca ← lerPresenca
61038ms  15ms  mudou=false   render ← aplicarPresenca ← baterPonto
```

Origem dos renders:

- 3 → presença;
- 0 → sincronia periódica de 15 s;
- 0 → callback de persistência.

Dos três renders, apenas um correspondia a mudança real. Dois redesenhavam HTML idêntico.

## Correção

Foi criada uma digital ordenada da presença, baseada em sessão + nome. O dado de presença continua sendo lido e atualizado normalmente, mas `renderDeFundo()` só é chamado quando a digital muda de fato — entrada ou saída de alguém.

Não foram usados CSS, debounce visual ou supressão artificial do piscar. A lógica de sincronização e conflito não foi alterada.

## Resultado

Após a correção:

- sistema parado por 60 s: **0 renders**;
- janela aberta por 40 s: **0 renders**;
- digitando 18 teclas: **0 renders**, com foco preservado;
- quando outra pessoa grava, o caso que antes produzia 2 renders passou a produzir **1 render**, o legítimo da releitura.

## Limitação da bancada

A bancada usada no diagnóstico não possui Realtime/WebSocket do Supabase. Portanto renders disparados por Realtime em produção não aparecem nessa medição. O relógio de notificações também não chegou a rodar no ensaio.

Se o piscar persistir após publicação, a orientação é ativar temporariamente `RENDER_LOG` no app e medir por cerca de um minuto para identificar a origem real dos renders restantes.

## Regressão dirigida

Foi informado **zero regressão nova**.

A bateria `v875-tres-bugs` aparece como **36 ok · 0 falhas** após correção da própria bateria. O relatório contém uma referência textual ambígua a “v8.82... na v8.81”; até o arquivo correspondente ser recebido, este histórico não cria nem declara uma v8.82.
