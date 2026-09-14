# Changelog — Sistema Moda Bicho PCP

Registro resumido das mudanças por versão. Este arquivo deve ser atualizado a cada publicação para que o histórico funcional fique fácil de consultar.

> Regra: não registrar como concluído o que ainda estiver apenas em diagnóstico. Itens pendentes ficam explicitamente marcados.

---

## v8.76 — 14/09/2026

**MD5:** `30de5847f68661d58d209c958122d834`

**Base:** contém integralmente v8.75 e v8.74.

### Corrigido — prioridade automática de pedidos filhos

Causa identificada: a prioridade da OP era atualizada pela análise, mas a promoção/repriorização dos pedidos filhos dependia da caixa opcional **“Recalcular a prioridade desses pedidos”**. Com a caixa desmarcada, a OP mudava e pedidos vivos não travados podiam ficar com prioridade antiga.

Implementação:

- nova função `sincronizarPrioridadeDosPedidos(op, linha, analiseId)` em `pedidos/modelo.js`;
- usa a regra já existente de `prioridadesEmCascata`;
- percorre apenas pedidos vivos e não travados;
- preserva `prioridadeTravada === true`;
- atualiza somente quando a prioridade realmente mudou;
- registra cada mudança com `registrar()`;
- atualiza `atualizadoEm` apenas dos pedidos alterados;
- pedidos já com prestadora recebem `avisar` quando a urgência sobe;
- se não houver linha da Demanda, retorna `sem-linha` em vez de inventar prioridade;
- `recalcularOP()` não foi alterada e continua sem efeitos colaterais de prioridade.

A caixa **“Recalcular a prioridade desses pedidos”** foi removida. A prévia continua informativa, mas a prioridade automática deixa de depender de ação manual.

### Regra preservada — cascata

Pedidos irmãos da mesma OP **não** são achatados para a mesma prioridade. Cada pedido é julgado pelo estoque projetado depois dos pedidos anteriores na fila.

Exemplo medido:

- primeiro pedido: Crítico;
- segundo pedido: pode cair para P2/P3 conforme o estoque projetado;
- pedido travado manualmente: mantém prioridade;
- pedido retornado: não muda.

### Testes informados

- bateria focada: **27 ok · 0 falhas**;
- regressão dirigida v8.75 × v8.76 em 20 baterias: placar idêntico;
- `v875-tres-bugs`: **36 ok · 0 falhas**;
- repetir a análise sem mudança não cria evento nem gravação desnecessária.

### Comportamento esperado na primeira análise após publicação

Pode haver vários pedidos repriorizados de uma vez. Isso é o acúmulo de pedidos que ficaram com prioridade antiga enquanto o recálculo dependia da caixa opcional. Cada mudança deve deixar histórico na OP.

---

## v8.75 — 14/09/2026

**MD5:** `6a3af0a178717493d856b11457ea31e1`

**Tamanho informado:** 2.062 KB · 31.800 linhas.

**Base:** contém integralmente v8.74.

### Validação de regressão

Comparativo v8.74 × v8.75 em 42 baterias:

- 41 de 42 deram o mesmo resultado;
- a única diferença foi a bateria que conferia literalmente o rótulo da versão (`8.74` → `8.75`);
- nas baterias ainda vermelhas, as listas de falhas ficaram idênticas item a item.

### Ajustes validados

- numeração de pedido passou a conferir o contador oficial `pcp_ciclo` no Supabase;
- teste de publicação esperado: janela **Criar pedidos** mostrar `2726` no cenário medido, em vez de `2817`, com indicação de confirmação na gravação;
- preservação da marca d'água de numeração como fallback;
- correção do redesenho dos campos de embalagem: filipeta não mostra tamanho; ao trocar para plástico, tamanho aparece imediatamente;
- correção estrutural do caminho de volta/redesenho relacionado ao BUG 3, embora o print original não tenha sido reproduzido exatamente;
- correções incorporadas da v8.74 para `pxdrenar-janela`, `demanda-remocao-fantasma` e baterias `abas-*`.

### Bancadas antigas que quebram antes do placar

Algumas baterias legadas continuam quebrando nas duas versões por apontarem para seletores que já não existem. Isso foi classificado como dívida da bancada, não regressão da v8.75.

### Pendências que não faziam parte da v8.75

- falso conflito / mensagem “outra pessoa” sem validar corretamente `updated_by` e baseline local;
- rascunho de aba sobrescrevendo silenciosamente;
- carimbo que não grava quando o documento falha;
- `ultima_operacao`;
- carga da planilha;
- sondas de produção.

---

## v8.74 — incorporada nas versões seguintes

A v8.75 foi validada contendo integralmente a v8.74. O comparativo informado mostrou que os consertos da v8.74 permaneceram sem regressão na v8.75.

Correções confirmadas por baterias mencionadas no comparativo:

- `pxdrenar-janela` — defeito anterior removido;
- `demanda-remocao-fantasma` — defeito anterior removido;
- correções das baterias `abas-*`;
- base dos consertos validada pela bateria `v874-consertos` (a única diferença posterior foi o rótulo de versão).

O MD5 da v8.74 não foi registrado neste changelog porque não foi informado no material usado para esta atualização.

---

# Diagnósticos e bugs em acompanhamento após v8.76

## Pedido avulso × pedido criado pela Demanda

Foi identificado que existem dois fluxos independentes:

- Demanda: `abrirCriarPedidos()` → `confirmarPedidos()`;
- avulso: `novo-pedido` → `salvar-novo-pedido`.

O fluxo da Demanda persiste corretamente campos como etapas e embalagem; o fluxo avulso possui implementação separada e foi relatado perdendo informações após salvar/recarregar.

Direção acordada para correção:

- extrair rotina compartilhada de montagem/persistência dos campos comuns;
- preservar regras específicas da Demanda;
- testar equivalência após reload/Supabase;
- atenção especial a `qtdEmbalar`, `qtdMix`, `etapasUsadas`, `produto.etapasUsadas`, `produto.producao`, processo, setor, responsável, prestadora, prioridade e observações;
- no avulso, responsável deve ser calculado pelo processo final escolhido na janela, não pelo processo antigo do cadastro.

**Status:** diagnosticado / correção ainda não registrada como concluída neste changelog.

## Falso conflito ao editar pedido recém-criado/impresso

Reprodução observada: criar pedido → imprimir papel → editar logo em seguida pode exibir mensagem vermelha afirmando que “outra pessoa” alterou o pedido, embora a alteração anterior tenha sido feita pelo próprio usuário/app.

Direção para correção:

- revisar `outroMexeu()`;
- distinguir alteração própria de alteração realmente feita por outra pessoa usando identidade da gravação (`updated_by`) e baseline/revision atualizados após confirmação do servidor;
- não remover a proteção de concorrência real.

**Status:** reproduzido / pendente.

## Prazo do fornecedor na estimativa de estoque sugerido

Diagnóstico feito no código:

- `prazoDias` é salvo corretamente no fornecedor;
- é exibido em telas e seletores;
- a necessidade bruta é derivada de `estMin`;
- `estMinCalc` usa atualmente `(vendas / mesesPeriodo) * mesesSeg`;
- não foi comprovada ainda a incorporação de `prazoDias` à fórmula do mínimo sugerido;
- existe regra histórica de “+ 1 mês de fornecimento externo”, portanto qualquer correção precisa evitar contagem dupla.

**Status:** diagnosticado / regra final ainda precisa ser definida e implementada.

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
