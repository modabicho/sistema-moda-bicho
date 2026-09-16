# Changelog — Sistema Moda Bicho PCP

Registro resumido das mudanças por versão. Este arquivo deve ser atualizado a cada publicação para que o histórico funcional fique fácil de consultar.

> Regra: não registrar como concluído o que ainda estiver apenas em diagnóstico. Itens pendentes ficam explicitamente marcados.

---

## v8.98 — 16/09/2026

**MD5:** `675754aeb660047452a6e33c827323cc` · **Tamanho:** 2.129.046 bytes · **Linhas:** 31.730 · **Marcador:** `<!--PCP:8.98-->` · **Base:** v8.97 (`ec592e045ce407cc846a880cce454687`)

> v8.94–v8.97 não foram registradas neste arquivo; a v8.97 está em `PCP-v8.97.html`.

### Datas Festivas — Unir produtos

- A união passa a ser feita em **Produtos da campanha**: com exatamente 2 selecionados (`selProd`), aparece **Unir produtos (2)**.
- A janela compara os dois lado a lado e pergunta **"Qual produto deve permanecer?"**, sem escolha automática. Só um SKU com cadastro pode permanecer; se nenhum dos dois tiver cadastro, a união é bloqueada.
- O botão "Unir produtos" saiu da busca da base histórica, onde o principal era sempre o produto aberto. "Usar como base histórica" continua.
- **Corrigido:** depois da união, a conta da campanha reconhece o SKU atual mais `skusAnteriores` em venda anterior, vendido, em produção, pronto e pedidos. Antes, o "A produzir" inflava. O estoque continua por SKU. Pedido concluído, OP encerrada e `vendasBase`/`vendasAtual` não são reescritos.
- A análise não é reaplicada sozinha: o app avisa quando a meta sugerida do principal mudou.
- **Corrigido:** o SKU absorvido não volta mais à Demanda como produto independente. `skusSoFestivos` passa a considerar também `skusDoProduto()` dos itens "só na data". O estoque de cada SKU continua separado, o aviso "N em Datas festivas" conta os mesmos produtos e o reforço explícito continua na Demanda.

### Testes

- `testes/datas-festivas-uniao.js`: v8.97 **45 ok · 12 falhas** → v8.98 **78 ok · 0 falhas**.
- Halloween com dados reais: 90/90 linhas e zero diferença numérica entre v8.97 e v8.98.
- Demanda com dados reais: 1.617 linhas visíveis, as mesmas 66 escondidas e `foraDaDemanda` = 90, idênticos antes e depois.

Detalhes, fora do escopo e riscos: `versions/v8.98/README.md`.

---

## v8.79 — 14/09/2026

**MD5 verificado do arquivo recebido:** `f4b9a5003a7535a93352abb0191e81a2`

**Tamanho verificado:** 2.134.151 bytes.

**Marcador interno verificado:** `<!--PCP:8.79-->`.

**Linhas informadas:** 32.207.

**Base:** contém v8.78, v8.77, v8.76, v8.75 e v8.74.

### Corrigido — análise podia executar duas vezes

A investigação descartou a hipótese de dois emissores de toast ou de um resumo prematuro. Existe um único emissor relevante de `Análise aplicada` no fluxo da Demanda, e o toast ocorre no fim da execução.

A causa real era uma segunda execução inteira da análise. A trava de clique ficava apenas no nó DOM do botão (`data-ocupado`, `disabled`, texto `Aguarde…`). Como a janela da prévia permanece aberta durante a análise, qualquer `render()` intermediário por sincronização, Realtime ou gravação podia recriar o botão sem a trava. Um segundo clique então chamava `aplicarAnalise()` novamente.

A segunda rodada encontrava o trabalho já feito pela primeira e, por isso, devolvia corretamente contadores zerados. Como os toasts ficam empilhados, a ordem visual induzia a leitura errada.

### Correção em duas camadas

- `acoes/clique.js`: nova trava por estado `ACOES_RODANDO`, sobrevivendo a qualquer `render()` e protegendo ações `confirmar-*`, `aplicar-*` e `salvar-*` contra reentrada;
- `demanda/calculo.js`: `aplicarAnalise()` ganhou trava própria de reentrância por `ANALISE_RODANDO`;
- o miolo da análise, a ordem dos cálculos, os contadores e o toast foram preservados.

### Testes informados

- nova bateria `testes/analise-toast-duplo.js`: **15 ok · 0 falhas**;
- cenário com render intermediário + segundo clique: **1 chamada e 1 toast** na v8.79; no binário antigo eram 2 chamadas e 2 toasts;
- sincronização de prioridade da v8.76 preservada;
- regressão dirigida v8.78 × v8.79: **zero regressão nova**;
- `janelas`: 531 ok · 0;
- `conflito-falso`: 12 ok · 0;
- `duas-abas`: 25 ok · 0;
- `falso-conflito-papel`: 25 ok · 0;
- `v877-equivalencia-criacao`: 33 ok · 0;
- `v876-prioridade-cascata`: 27 ok · 0;
- `v875-tres-bugs`: 36 ok · 0.

### Observação de publicação

O print que originou a investigação mostrava o texto `pedidos promovidos`, presente até v8.75. A medição indicou que o ambiente publicado ainda estava em v8.73, portanto as correções v8.74–v8.79 estavam acumuladas e ainda não publicadas naquele momento.

Detalhes completos: `versions/v8.79/README.md`.

---

## v8.78 — 14/09/2026

**MD5 verificado do arquivo recebido:** `9d9e312cf8b140dce904f562b2f24eb5`

**Tamanho verificado:** 2.131.965 bytes.

**Marcador interno verificado:** `<!--PCP:8.78-->`.

**Base:** contém as correções das v8.77, v8.76, v8.75 e v8.74.

### Corrigido — mensagem e diagnóstico de conflito de revisão

Foi corrigida a rota do diagnóstico do alerta vermelho de conflito de pedido. A mensagem não vem de `outroMexeu()`: esse mecanismo abre a janela de conflito com duas versões e já ignora a própria sessão. O toast vermelho vem da trava otimista de revisão do `pcp_pedido_patch`, quando uma gravação chega com revisão esperada antiga.

`outroMexeu()` não foi alterado nesta versão.

A causa original do caso criar → imprimir → editar ainda **não foi reproduzida**. O fluxo foi testado em v8.73, v8.74 e v8.77 com **14 ok · 0 falhas** em cada binário. A fila baseada em `TELA_FOTO` avança após gravações confirmadas e a RPC continua recusando revisão velha corretamente.

### Autoria do conflito com prova

A mensagem passou a distinguir:

- `updated_by` de outro usuário → pode informar “outra pessoa”;
- uid do próprio usuário + prova de que a revisão exata saiu da sessão atual → informa que havia uma gravação sua mais nova no servidor;
- autoria não comprovada → não acusa ninguém.

Também passou a mostrar o número humano do pedido, em vez do id interno.

O app passou a obter o próprio uid pelo retorno de `updated_by` das gravações e, como fallback, pelo JWT.

### Segurança preservada — duas provas

Uma tentativa baseada apenas em `updated_by` fez a bateria `releitura-concorrente` cair de **12·0 para 9·3**, permitindo sobrescrever alteração externa feita por SQL/carga/script quando o `updated_by` permanecia com assinatura antiga.

A regra final exige duas provas simultâneas: uid do usuário atual e revisão exata produzida pela sessão atual. Com isso, `releitura-concorrente` voltou a **12·0**. Outra aba, outra máquina e alterações externas continuam protegidas como conflito.

### Telemetria nova

Todo conflito de revisão agora deixa diagnóstico em `PED_CONFLITOS`, incluindo:

- `updatedBy`;
- `revisaoDaFoto`;
- `revisaoDoServidor`;
- `reviSaiuDestaSessao`.

Quando o caso original reaparecer, esse objeto deve ser coletado para fechar a causa com evidência.

### Status do bug original

**Em investigação.** A v8.78 corrige a atribuição indevida da mensagem, fortalece a identificação de gravações da própria sessão e adiciona telemetria, mas não declara resolvida uma causa que ainda não foi reproduzida.

Detalhes completos: `versions/v8.78/README.md`.

---

## v8.77 — 14/09/2026

**MD5:** `fba537a880ca64ca5dbb7db075aec685`

**Tamanho verificado:** 2.122.922 bytes.

**Marcador interno verificado:** `<!--PCP:8.77-->`.

**Base:** contém integralmente v8.76, v8.75 e v8.74.

### Corrigido — pedido avulso × pedido criado pela Demanda

A causa era estrutural: os dois caminhos de criação haviam evoluído separadamente e deixaram de compartilhar o mesmo contrato de montagem/persistência.

Fluxos envolvidos:

- Demanda: `abrirCriarPedidos()` → `confirmarPedidos()`;
- avulso: `novo-pedido` → `salvar-novo-pedido`.

Problemas medidos antes da correção:

- o avulso ainda procurava embalagem por `[data-emb]`, mas a janela atual usa `data-pp`, portanto encontrava zero campos e não persistia corretamente as alterações;
- `produto.etapasUsadas` não era gravado pelo avulso;
- `setor` não era preenchido de forma equivalente;
- `criadoNoApp` e `campanhaId` existiam apenas no objeto criado pela Demanda;
- a Demanda consultava `setor.responsavel` no singular, enquanto o cadastro pode trabalhar com `responsaveis`;
- trocar o processo no avulso podia repor por cima a sugestão antiga de responsável porque o rascunho não distinguia sugestão automática de edição manual;
- `#np-num` também podia ficar congelado no rascunho, oferecendo número antigo caso o contador avançasse enquanto a janela estivesse aberta.

### Implementação compartilhada

Foi criada uma camada comum em `pedidos/criar.js`, com as funções informadas:

- `pedEsqueleto`;
- `pedDestinoDoProcesso`;
- `pedLerEmbalagemDoForm`;
- `pedLerEtapasDoForm`;
- `pedAplicarPadraoDoProduto`;
- `pedAplicarComuns`;
- `pedDestinoConfere`.

Os dois fluxos passaram a compartilhar a aplicação dos campos equivalentes, preservando as regras específicas de cada tela.

Campos comuns cobertos incluem, quando aplicável:

- processo;
- setor;
- responsável;
- prestadora;
- prioridade e trava;
- `qtdEmbalar`;
- `qtdMix`;
- `pedido.etapasUsadas`;
- `produto.etapasUsadas`;
- `produto.producao` / embalagem;
- observações e demais metadados comuns.

### Regras específicas preservadas

Continuam próprias da Demanda: saldo, cascata de prioridade, divisão automática, recomendação de prestadora e vínculo com campanha.

Continuam próprias do avulso: produto provisório, SKU novo e número informado manualmente.

### Responsável e número sugerido

O responsável sugerido passou a ser marcado por `data-sug`, permitindo diferenciar o que o app sugeriu do que a pessoa realmente digitou. O número automático deixou de ser congelado pelo rascunho como se fosse edição manual.

### Diferença de etapas mantida intencionalmente

As duas janelas ainda podem exibir listas de etapas diferentes. `tplDoProcesso` retira `CORTE` de propósito porque é etapa interna da Moda Bicho com tratamento próprio no canhoto; a janela da Demanda não passa por essa mesma regra.

### Testes informados

- equivalência entre os dois fluxos nos campos comuns: **33 ok · 0 falhas**;
- reload completo preservou os dados persistidos;
- cadastro do produto ficou equivalente pelos dois caminhos;
- regressão dirigida em 22 baterias: placar idêntico, zero regressão nova.

---

## v8.76 — 14/09/2026

**MD5:** `30de5847f68661d58d209c958122d834`

**Base:** contém integralmente v8.75 e v8.74.

### Corrigido — prioridade automática de pedidos filhos

A prioridade da OP era atualizada pela análise, mas a repriorização dos pedidos filhos dependia da caixa opcional “Recalcular a prioridade desses pedidos”. A v8.76 criou `sincronizarPrioridadeDosPedidos(op, linha, analiseId)`, preservou `prioridadesEmCascata`, respeita `prioridadeTravada`, atualiza só quem mudou e mantém `recalcularOP()` sem efeitos colaterais de prioridade.

A caixa foi removida; a prévia continua informativa e a prioridade automática deixou de depender de ação manual.

### Testes informados

- bateria focada: **27 ok · 0 falhas**;
- regressão dirigida v8.75 × v8.76 em 20 baterias: placar idêntico;
- `v875-tres-bugs`: **36 ok · 0 falhas**.

---

## v8.75 — 14/09/2026

**MD5:** `6a3af0a178717493d856b11457ea31e1`

**Tamanho informado:** 2.062 KB · 31.800 linhas.

**Base:** contém integralmente v8.74.

### Validação e ajustes

Comparativo v8.74 × v8.75 em 42 baterias: 41 de 42 deram o mesmo resultado; a única diferença foi o rótulo literal da versão.

Ajustes validados incluem numeração baseada no contador oficial `pcp_ciclo`, redesenho dos campos de embalagem, correção estrutural do caminho de volta/redesenho do BUG 3 e incorporação das correções da v8.74 para `pxdrenar-janela`, `demanda-remocao-fantasma` e baterias `abas-*`.

---

## v8.74 — incorporada nas versões seguintes

A v8.75 foi validada contendo integralmente a v8.74. Correções confirmadas por baterias incluem `pxdrenar-janela`, `demanda-remocao-fantasma`, correções `abas-*` e base dos consertos da bateria `v874-consertos`.

O MD5 da v8.74 não foi registrado porque não foi informado no material usado para este histórico.

---

# Diagnósticos e bugs em acompanhamento após v8.79

## Pedido avulso × pedido criado pela Demanda

**Status:** corrigido na v8.77.

## Execução duplicada da análise / dois toasts

**Status:** corrigido na v8.79.

A causa era reentrância: `render()` podia recriar o botão durante a análise e apagar a trava que vivia apenas no DOM. A v8.79 moveu a proteção para estado (`ACOES_RODANDO`) e adicionou uma segunda defesa dentro de `aplicarAnalise()` (`ANALISE_RODANDO`).

## Conflito de revisão ao editar pedido recém-criado/impresso

**Status:** causa original não reproduzida; diagnóstico fortalecido na v8.78.

A mensagem deixou de acusar “outra pessoa” sem prova. `PED_CONFLITOS` deve ser coletado na próxima ocorrência real para determinar a origem da revisão divergente. `outroMexeu()` não foi alterado porque não é a origem do toast observado.

## Prazo do fornecedor na estimativa de estoque sugerido

- `prazoDias` é salvo corretamente no fornecedor e exibido no sistema;
- `estMinCalc` usa atualmente `(vendas / mesesPeriodo) * mesesSeg`;
- ainda não foi comprovada a incorporação de `prazoDias` à fórmula;
- existe regra histórica de “+ 1 mês de fornecimento externo”, portanto qualquer correção precisa evitar contagem dupla.

**Status:** diagnosticado / regra final ainda precisa ser definida e implementada.

## Lista de etapas entre Demanda e avulso

A v8.77 manteve intencionalmente a diferença de apresentação das etapas entre os dois fluxos. `CORTE` possui tratamento próprio em `tplDoProcesso`/canhoto e não foi unificado apenas para forçar igualdade visual.

**Status:** decisão funcional em aberto, não classificada como bug de persistência.

---

# Convenção para próximas versões

A cada nova versão registrar:

1. número da versão;
2. data;
3. MD5 do arquivo publicado;
4. base/versão anterior;
5. bugs corrigidos e regra funcional resultante;
6. testes/baterias executados;
7. regressões conhecidas;
8. pendências explicitamente fora da versão;
9. observações de publicação/migração.
