# CLAUDE.md — Sistema Moda Bicho / PCP

Este arquivo define as regras de trabalho para qualquer alteração feita com Claude Code neste repositório.

Leia este arquivo inteiro antes de alterar código.

---

# 1. Objetivo do sistema

Este projeto é o PCP da Moda Bicho.

O sistema controla e relaciona, entre outras áreas:

- Produtos / SKUs
- Pedidos
- OPs
- Demanda
- Estoque
- Tarefas
- Prestadoras
- Compras
- Insumos
- Semiacabados
- Datas Festivas
- Relatórios
- Usuários / permissões
- Supabase
- Realtime
- presença/conflitos
- autenticação

É um sistema em produção.

Mudanças aparentemente pequenas podem afetar outras áreas.

Por isso, antes de alterar qualquer comportamento, é obrigatório entender o fluxo real existente.

---

# 2. Regra principal de trabalho

## INVESTIGAR → CORRIGIR → TESTAR → VERSIONAR

Nunca começar uma alteração importante diretamente pelo código.

Antes:

1. localizar os arquivos envolvidos;
2. localizar as funções envolvidas;
3. identificar quem chama essas funções;
4. identificar estado global usado;
5. identificar leitura/gravação no Supabase;
6. identificar handlers, renders, timers e listeners relacionados;
7. identificar possíveis dependências escondidas;
8. reproduzir o problema quando possível.

Depois alterar somente o necessário.

---

# 3. Não fazer alterações além do pedido

Não aproveitar uma correção para:

- refatorar arquivos próximos;
- renomear funções sem necessidade;
- reorganizar pastas;
- remover código morto;
- trocar padrões do projeto;
- alterar CSS não relacionado;
- corrigir outros bugs encontrados;
- mudar Supabase;
- mudar autenticação;
- alterar regras de negócio próximas.

Se encontrar outro problema:

DOCUMENTAR.

Não corrigir junto, salvo autorização explícita.

---

# 4. Uma mudança por vez

Mudanças funcionais e reorganização estrutural devem ser separadas.

Exemplo:

ERRADO:

- corrigir Datas Festivas;
- reorganizar Produtos;
- mudar estoque;
- limpar código morto;
- alterar renderização;

tudo na mesma versão.

CORRETO:

v8.xx
→ correção específica

v8.xx+1
→ próxima correção

v8.xx+2
→ reorganização estrutural isolada

Isso é importante para permitir identificar exatamente qual versão criou uma regressão.

---

# 5. Baseline e regressões

Antes de uma alteração relevante:

- identificar versão atual;
- registrar MD5;
- rodar as baterias relacionadas;
- registrar falhas já existentes.

Uma falha que já existia na versão anterior NÃO deve ser apresentada como regressão nova.

Sempre que uma bateria falhar:

1. rodar na versão nova;
2. rodar exatamente a mesma bateria na versão anterior;
3. comparar resultado.

Só chamar de regressão quando houver diferença causada pela alteração atual.

Nunca “arrumar o teste” apenas para fazê-lo passar.

Se o teste estiver errado, demonstrar por quê antes de alterá-lo.

---

# 6. Versionamento

Nunca sobrescrever uma versão validada.

Cada versão nova deve gerar:

- número da versão;
- MD5;
- quantidade aproximada de linhas;
- lista dos arquivos alterados;
- resumo da causa raiz;
- resumo da correção;
- testes executados;
- resultado antes/depois;
- regressões encontradas;
- riscos conhecidos.

Preservar versões anteriores.

---

# 7. Git

Antes de mudanças importantes:

```bash
git status
git branch
git log --oneline -10
```

Não apagar alterações existentes do usuário.

Não executar operações destrutivas como:

```bash
git reset --hard
git clean -fd
```

sem autorização explícita.

Depois de uma alteração validada, registrar claramente o que mudou.

---

# 8. Áreas sensíveis

As áreas abaixo exigem atenção especial.

Não alterar incidentalmente.

## 8.1 Numeração de pedidos

A numeração oficial é definida pelo servidor/Supabase.

Não transformar o cliente em autoridade do número do pedido.

Não criar lógica paralela de numeração.

---

## 8.2 Conflito e revisão

Existe controle de revisão e conflito entre clientes.

Não mexer incidentalmente em:

- revision;
- PCP_ANTES;
- fila de gravação;
- patch;
- Realtime;
- presença;
- aviso de conflito.

Uma alteração nessa área precisa de bateria específica.

---

## 8.3 Prioridade

Prioridade possui regras em cascata.

Não alterar regras de prioridade junto com correções de Pedido, Demanda ou OP sem autorização explícita.

---

## 8.4 Etapas

Distinguir:

- processo principal do produto;
- processo do pedido;
- etapas utilizadas pelo pedido;
- etapas padrão do produto.

Não normalizar listas completas para `null` sem verificar o contrato legado.

---

## 8.5 Estoque

Estoque é área crítica.

Não:

- somar estoques de SKUs diferentes automaticamente;
- fabricar saldo agregado;
- transferir estoque durante união de produtos;
- assumir que ausência de estoque significa ausência do produto.

O estoque deve continuar associado à origem real do SKU.

---

# 9. Produtos e SKU

SKU deve ser tratado cuidadosamente.

Distinguir:

- valor original do SKU;
- chave normalizada para busca/comparação;
- SKU atual;
- SKUs anteriores.

Não destruir o valor original apenas para facilitar comparação.

Quando houver normalização, preferir uma função central.

Conceitualmente:

```js
skuNormal(x) = String(x || "").trim().toUpperCase()
```

Mas antes de aplicar em novos pontos, verificar se algum contrato depende do texto original.

---

# 10. União de produtos

O sistema possui conceito de:

```js
skusAnteriores
```

Quando dois registros representam o mesmo produto ao longo do tempo, a união deve usar a estrutura existente e não criar uma segunda estrutura paralela.

## Produto principal

Na união, deve existir escolha explícita de qual produto permanece como canônico.

O produto absorvido passa a ser histórico do principal.

## Preservar

Preservar:

- SKU histórico;
- vendas históricas;
- pedidos concluídos;
- OPs encerradas;
- histórico de produção;
- dados necessários para auditoria.

## Não fazer

NÃO:

- somar estoque dos dois SKUs;
- apagar histórico;
- trocar indiscriminadamente SKU de pedidos antigos;
- apagar vendas históricas;
- decidir automaticamente qual produto sobrevive quando a interface permite escolha.

## OPs e pedidos vivos

Quando necessário para evitar duplicação da Demanda, referências ativas podem precisar migrar para o SKU canônico.

Esse comportamento deve ser testado especificamente.

---

# 11. Datas Festivas

Datas Festivas possui dois conceitos diferentes.

## 11.1 Produto da campanha

Produto que participa da campanha.

Estar em:

"Produtos da campanha"

deve definir que o item pertence à campanha.

## 11.2 Base histórica

`baseSkus` serve para somar vendas históricas na projeção.

Isso NÃO significa união global dos cadastros.

Base histórica é específica da campanha.

## 11.3 União de produtos

"Unir produtos" significa que dois SKUs representam o mesmo produto ao longo do tempo.

É diferente de simplesmente usar um SKU como base histórica.

---

# 12. Planejamento de Datas Festivas

Regra obrigatória:

TODOS os produtos vinculados à campanha devem aparecer no Planejamento.

A fonte de verdade para existência das linhas deve ser conceitualmente:

```js
itensDaCampanha(c)
```

Outras fontes apenas enriquecem a linha:

- vendas do ano anterior;
- vendas atuais;
- estoque;
- produção;
- pronto;
- meta;
- cálculo da Demanda.

Ausência nessas fontes NÃO pode fazer o produto desaparecer.

## Produto novo

Um produto que:

- está na campanha;
- não existia no ano anterior;

deve continuar aparecendo.

Situações possíveis:

### Com vendas atuais

Pode usar a regra existente de ritmo da campanha.

### Sem venda anterior e sem venda atual

Deve aparecer como:

"Sem base"

e permitir decisão manual.

### Fora do estoque / sem S.calc.porSku

Também deve continuar visível no Planejamento.

Ausência de linha de estoque não significa ausência do produto da campanha.

---

# 13. Produtos da campanha x Planejamento

Em uma campanha sem filtros adicionais:

```text
Produtos da campanha
=
universo de produtos do Planejamento em "Todos"
```

Filtros podem esconder visualmente itens.

Mas nenhum filtro deve remover permanentemente um item da fonte original.

---

# 14. Base histórica — validações

Ao manipular `baseSkus`, proteger contra:

- auto-vínculo;
- duplicidade;
- circularidade;
- mesmo SKU histórico alimentando dois produtos diferentes na mesma campanha.

A validação deve existir na regra/modelo.

Não depender somente de esconder opções na interface.

---

# 15. Pedidos históricos

Não atualizar automaticamente pedidos concluídos apenas para trocar o SKU pelo SKU atual.

O histórico deve representar o que aconteceu naquela época.

Quando necessário, utilizar mecanismos como:

```js
skusAnteriores
skusDoProduto()
produtoDe()
```

para reconhecer a identidade atual sem destruir o registro histórico.

---

# 16. Demanda

Demanda é uma área crítica.

Antes de mudar Produto/SKU/OP/Pedido, verificar como a Demanda calcula:

- estoque;
- já programado;
- em produção;
- pedidos vivos;
- OPs abertas;
- necessidade de produção.

Especialmente importante:

um produto unido não pode provocar o sistema a ignorar uma OP ativa antiga e mandar produzir novamente a mesma necessidade.

---

# 17. Supabase

Não alterar:

- tabelas;
- policies;
- triggers;
- RPCs;
- índices;
- autenticação;

como consequência indireta de uma mudança de frontend.

Mudanças no Supabase precisam ser explicitamente solicitadas.

Antes de mudar persistência, mapear:

- leitura;
- escrita;
- patch;
- revision;
- Realtime;
- fila local;
- estado em memória.

---

# 18. Renderização

Evitar criar novos:

- `render()` globais;
- `renderDeFundo()`;
- repaints gerais;
- recriação de modal;

quando uma atualização localizada resolver.

Mudanças de renderização precisam verificar:

- perda de foco;
- reinício de animação;
- flicker;
- perda de texto digitado;
- recriação de modal;
- listeners duplicados.

---

# 19. Timers e listeners

Qualquer reorganização ou funcionalidade nova deve verificar:

- número de timers;
- listeners globais;
- visibilitychange;
- Realtime subscriptions;
- polling.

Não aumentar silenciosamente a quantidade de processos de fundo.

---

# 20. Modal

Ao atualizar conteúdo de modal, evitar destruir/recriar a janela inteira sem necessidade.

Verificar:

- foco;
- campos digitados;
- animações;
- backdrop;
- scroll;
- event handlers.

---

# 21. Autenticação

Mudanças visuais de login/MFA não devem alterar lógica de autenticação.

Preservar:

- Supabase Auth;
- MFA;
- troca de conta;
- validação;
- tratamento de erros.

Não implementar funcionalidades falsas.

Exemplo:

não adicionar visualmente "Esqueci minha senha" se não existir fluxo funcional correspondente.

---

# 22. Interface

Mudanças visuais devem preservar comportamento.

Antes de alterar um componente:

1. localizar handlers;
2. identificar IDs/data-* usados;
3. verificar atalhos de teclado;
4. verificar desktop;
5. verificar mobile.

Não mudar atributo usado por JS apenas para melhorar HTML/CSS.

---

# 23. Código aparentemente morto

Nunca apagar apenas porque uma função parece não ser usada.

Antes:

```bash
grep
rg
```

e procurar:

- chamadas diretas;
- chamadas via HTML/data-*;
- chamadas por strings;
- manifest;
- timers;
- listeners;
- código carregado por ordem;
- dependências globais.

O projeto já teve dependências escondidas em arquivos aparentemente não relacionados.

---

# 24. Manifesto e ordem de carregamento

Este sistema possui dependências por ordem de carregamento/global.

Antes de mover um arquivo:

- verificar manifesto;
- verificar símbolos globais fornecidos;
- verificar símbolos consumidos;
- verificar se outro arquivo depende dele ter sido carregado antes.

Mover arquivo não é apenas operação de organização visual.

---

# 25. Reorganização estrutural

A reorganização deve ser incremental.

Objetivo futuro aproximado:

```text
src/
  nucleo/
  sessao/
  persistencia/
  produtos/
  estoque/
  pedidos/
  demanda/
  tarefas/
  insumos/
  compras/
  prestadoras/
  integracoes/
  ui/
```

Isso é somente direção conceitual.

Não reorganizar tudo de uma vez.

Cada movimento:

1. mapear dependências;
2. mover uma responsabilidade;
3. rodar testes;
4. comparar baseline;
5. gerar versão;
6. só então avançar.

---

# 26. Magazord

Existe intenção futura de integrar estoque com a API da Magazord.

Ainda não implementar sem solicitação explícita.

Arquitetura desejada conceitualmente:

```text
Magazord
   ↓
camada servidor
   ↓
normalização por SKU
   ↓
módulo de estoque
   ↓
Supabase / PCP
```

NUNCA expor token da Magazord diretamente no navegador.

A integração deverá utilizar camada de servidor, por exemplo:

- Netlify Function;
- Supabase Edge Function;
- outra camada backend aprovada.

Primeira etapa futura deve ser somente leitura.

Antes de sincronização automática:

- validar autenticação;
- endpoint oficial;
- paginação;
- rate limit;
- significado de estoque;
- reservado;
- disponível;
- físico;
- erros;
- retry;
- timestamp;
- divergências por SKU.

---

# 27. Testes

Toda correção precisa de teste específico para o bug.

Não confiar apenas nas baterias antigas.

Para cada bug:

1. criar reprodução que falha na versão anterior;
2. aplicar correção;
3. provar que passa na nova;
4. rodar regressões próximas.

Quando possível, testar diretamente a regra/modelo e não somente clicar pela UI.

---

# 28. Teste ruim também é bug

Se um teste:

- restaura estado incorretamente;
- mede objeto errado;
- não aguarda async;
- não testa o valor real;
- passa mesmo com código quebrado;

corrigir o teste, mas explicar claramente.

Nunca apresentar "81 ok" se a própria bateria não estava medindo o comportamento real.

---

# 29. Relatório obrigatório após alteração

Sempre entregar ao final:

## Versão

Exemplo:

```text
v8.98
```

## MD5

```text
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Causa raiz

Explicação objetiva.

## Correção

O que foi alterado.

## Arquivos alterados

Lista.

## Testes

Exemplo:

```text
datas-festivas-uniao: 81 ok · 0 falhas
janelas: 507 ok · 0 falhas
...
```

## Comparação com versão anterior

Explicar qualquer diferença.

## Alterações não feitas

Dizer explicitamente o que ficou fora do escopo.

## Riscos conhecidos

Listar pendências.

---

# 30. Estado atual do projeto

Antes de iniciar qualquer nova tarefa, descobrir pelo repositório qual é a versão realmente mais recente.

Não assumir que este arquivo contém sempre o número final.

No momento em que este CLAUDE.md foi criado, o desenvolvimento havia chegado à família:

```text
v8.97
```

com trabalho ativo em:

- união de produtos em Datas Festivas;
- melhoria da interface dessa união;
- regressão de produtos novos ausentes no Planejamento.

Antes de continuar, confirmar se existe versão posterior.

---

# 31. Documentação do histórico

Antes de mudanças grandes, consultar quando existirem:

```text
docs/CHANGELOG.md
docs/WORKLOG_2026-09-15.md
docs/
versions/
```

Também consultar README/relatórios das versões imediatamente anteriores.

O código é a fonte principal.

A documentação serve para entender decisões e evitar reintroduzir bugs antigos.

---

# 32. Regra de resposta ao usuário

O usuário prefere respostas objetivas.

Ao terminar uma tarefa:

- explicar causa;
- explicar o que mudou;
- mostrar testes;
- mostrar versão/MD5;
- destacar riscos reais.

Não despejar longos raciocínios internos.

Não dizer apenas "corrigido".

Provar a correção.

---

# 33. Quando parar

Pare e peça decisão antes de continuar quando:

- existir ambiguidade de regra de negócio;
- houver duas formas legítimas de migrar dados;
- uma alteração puder apagar histórico;
- precisar mudar banco/Supabase;
- houver risco de somar/mover estoque;
- for necessário escolher qual cadastro deve sobreviver;
- a correção exigir refatoração ampla não solicitada.

Não tomar essas decisões silenciosamente.

---

# 34. Princípio final

O objetivo não é produzir o código mais elegante possível.

O objetivo é:

**melhorar o sistema sem quebrar o que já funciona.**

Prioridades:

1. integridade dos dados;
2. comportamento correto;
3. rastreabilidade;
4. testes;
5. simplicidade;
6. organização do código.

Refatoração vem depois da segurança.
