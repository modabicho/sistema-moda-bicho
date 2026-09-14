# PCP v8.76

Data registrada: 14/09/2026

MD5: `30de5847f68661d58d209c958122d834`

A v8.76 contém integralmente v8.75 e v8.74.

## Mudança principal

Correção da sincronização automática de prioridade entre OP e pedidos filhos.

### Causa

A OP era atualizada pela análise, mas a prioridade dos pedidos filhos dependia da caixa opcional “Recalcular a prioridade desses pedidos”. Com a caixa desmarcada, a OP podia avançar de prioridade e os pedidos vivos não travados ficavam para trás.

### Implementação

Nova função:

`sincronizarPrioridadeDosPedidos(op, linha, analiseId)`

Local informado: `pedidos/modelo.js`.

Regras:

- usa `prioridadesEmCascata`;
- só altera pedidos vivos e não travados;
- preserva prioridade manual (`prioridadeTravada === true`);
- grava apenas mudanças reais;
- registra histórico com `registrar()`;
- atualiza `atualizadoEm` somente quando muda;
- mantém a marca `avisar` para pedido já com prestadora quando a urgência sobe;
- sem linha da Demanda, não inventa prioridade;
- `recalcularOP()` permaneceu intocada.

A caixa opcional de recálculo saiu. A prévia continua informativa.

## Cascata preservada

Irmãos vivos da mesma OP não recebem obrigatoriamente a mesma prioridade. Cada um é julgado pelo estoque projetado após os pedidos anteriores na fila.

Exemplo validado:

- 2700: projetado 0 → Crítico (0);
- 2701: projetado 300 → P2 (3);
- 2702 travado → permanece 4;
- 2703 retornado → permanece 4;
- 2710 enviado: 4 → 0 e recebe `avisar {sentido:"subiu"}`.

## Testes informados

- bateria focada: 27 ok · 0 falhas;
- regressão dirigida v8.75 × v8.76 em 20 baterias: placar idêntico;
- `v875-tres-bugs`: 36 ok · 0 falhas;
- repetir análise sem mudança não cria novos eventos;
- `atualizadoEm` muda só nos pedidos realmente alterados.

## Publicação

Na primeira análise após publicar, pode haver vários pedidos repriorizados de uma vez. Isso é esperado: são pedidos acumulados de análises anteriores em que a caixa opcional não promoveu os filhos.

## Pendências fora desta versão

- falso conflito “outra pessoa alterou” após gravação feita pelo próprio usuário/app;
- divergência entre criação avulsa de pedido e criação pela Demanda;
- prazo do fornecedor ainda precisa ser incorporado/definido corretamente na estimativa de estoque sugerido, evitando dupla contagem com a regra antiga de fornecimento externo.

Veja também `docs/CHANGELOG.md`.
