# PCP v8.77

Data de registro: 14/09/2026

**MD5 verificado do arquivo recebido:** `fba537a880ca64ca5dbb7db075aec685`

**Tamanho verificado:** 2.122.922 bytes

**Marcador interno verificado:** `<!--PCP:8.77-->`

**Base:** contém v8.76, v8.75 e v8.74.

## Objetivo da versão

Corrigir estruturalmente a divergência entre os dois fluxos de criação de pedido:

- pela Demanda: `abrirCriarPedidos()` → `confirmarPedidos()`;
- pedido avulso: `novo-pedido` → `salvar-novo-pedido`.

O problema não era apenas um campo ausente. Os dois caminhos haviam evoluído separadamente e passaram a usar contratos diferentes para etapas, embalagem, setor, responsável e metadados do pedido.

## Causa encontrada

### Embalagem do pedido avulso

O fluxo avulso ainda procurava os campos por `[data-emb]`, mas a janela atual já desenhava a embalagem com `data-pp`. Como consequência:

- nenhum campo de embalagem era encontrado;
- `mudouEmb` permanecia falso;
- alterações pareciam existir na tela, mas não eram persistidas corretamente no cadastro do produto.

### Etapas

O fluxo avulso gravava `pedido.etapasUsadas`, mas não atualizava `produto.etapasUsadas` como o fluxo da Demanda.

### Setor e responsável

- o pedido avulso não preenchia `setor` de forma equivalente ao fluxo da Demanda;
- a Demanda consultava `setor.responsavel` no singular, enquanto o cadastro pode usar a lista `responsaveis`;
- ao trocar o processo no avulso, o rascunho podia reaplicar por cima a sugestão antiga de responsável.

### Número sugerido do pedido

`#np-num` podia ficar congelado no rascunho após a primeira repintada. Se o contador avançasse em seguida — por outra pessoa ou por releitura do servidor — a janela continuava oferecendo o número antigo e podia colidir com um pedido já criado.

## Implementação

Foi criada uma camada compartilhada em `pedidos/criar.js` para os campos comuns dos dois fluxos. Funções informadas na implementação:

- `pedEsqueleto`
- `pedDestinoDoProcesso`
- `pedLerEmbalagemDoForm`
- `pedLerEtapasDoForm`
- `pedAplicarPadraoDoProduto`
- `pedAplicarComuns`
- `pedDestinoConfere`

> Observação: o relatório original chamou o conjunto de “seis funções”, mas listou sete nomes. O registro preserva os sete nomes efetivamente informados.

Os dois caminhos passam a compartilhar a montagem/aplicação dos campos equivalentes, sem unificar regras que são propositalmente específicas de cada tela.

## Regras específicas preservadas

Continuam exclusivas do fluxo da Demanda, quando aplicável:

- saldo da Demanda;
- prioridade em cascata;
- divisão automática do saldo;
- recomendação de prestadora;
- vínculo com campanha.

Continuam exclusivas do avulso, quando aplicável:

- produto provisório;
- SKU novo;
- número informado manualmente.

## Responsável sugerido × responsável digitado

O campo passou a distinguir sugestão automática de valor realmente escolhido pela pessoa, usando `data-sug`.

Assim:

- trocar o processo pode recalcular a sugestão de responsável;
- o rascunho não congela a sugestão anterior;
- se a pessoa substituir o responsável manualmente, a escolha dela continua sendo preservada.

## Número sugerido

O número automático deixou de ser congelado como se fosse uma edição manual do rascunho. Isso reduz colisões quando o contador oficial avança enquanto a janela está aberta.

## Etapas e embalagem

Os dois fluxos agora aplicam de forma equivalente os campos comuns de:

- `qtdEmbalar`;
- `qtdMix`;
- `pedido.etapasUsadas`;
- `produto.etapasUsadas`;
- `produto.producao`;
- processo;
- setor;
- responsável;
- prestadora;
- prioridade / trava, quando aplicável;
- observações e demais metadados comuns.

A regra de embalagem do tipo `filipeta` permanece: o tamanho não é mantido quando não se aplica.

## Diferença de etapas mantida intencionalmente

As duas janelas ainda podem oferecer listas de etapas diferentes.

`tplDoProcesso` retira `CORTE` de propósito porque é uma etapa interna da Moda Bicho e possui tratamento próprio no canhoto. A janela da Demanda não passa pela mesma regra e pode apresentar essa etapa.

Essa diferença não foi alterada na v8.77 para não misturar uma decisão funcional de interface com a correção de persistência.

## Testes informados

- equivalência entre pedido pela Demanda e pedido avulso nos campos comuns: **33 ok · 0 falhas**;
- após reload completo, os dados persistidos permaneceram equivalentes;
- cadastro do produto ficou equivalente pelos dois caminhos;
- regressão dirigida em **22 baterias**: placar idêntico, sem regressão nova.

## Relação com versões anteriores

A v8.77 incorpora integralmente as correções da:

- v8.76 — sincronização automática de prioridades pela cascata;
- v8.75;
- v8.74.

## Pendências fora da v8.77

Permanecem separadas desta correção:

- falso conflito “outra pessoa” após gravação feita pelo próprio usuário/app;
- regra final para incorporar `prazoDias` do fornecedor ao mínimo sugerido sem dupla contagem com a regra histórica de fornecimento externo;
- eventual decisão futura sobre igualar ou não a lista de etapas exibida entre as duas janelas.
