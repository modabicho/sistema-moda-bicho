# Plano de reorganização estrutural — base v8.93

Objetivo: reorganizar o PCP sem alterar comportamento funcional, preparando a base para integrações externas como a API da Magazord.

## Princípios

- Base congelada: v8.93 (`e07b7890839cc4d98c54590f16e81472`).
- Claude implementa; ChatGPT audita, diagnostica e revisa.
- Nada de reescrita total.
- Cada etapa deve ser pequena, reversível e comparável com a v8.93.
- Primeiro mover código e preservar comportamento; só depois mudar regras.
- Não misturar reorganização estrutural com integração Magazord na mesma versão.
- Não alterar schema Supabase, RPCs, RLS ou autenticação durante a reorganização, salvo se uma etapa específica for aprovada separadamente.

## Fase 0 — congelar baseline

Registrar e rodar as baterias principais da v8.93 antes de mover qualquer arquivo. Medir também boot, timers, requisições, renderizações de fundo e erros de console. Guardar MD5 e resultados para comparação.

Critério de saída: baseline reproduzível e lista explícita de falhas antigas que não contam como regressão nova.

## Fase 1 — inventário de arquitetura real

Mapear o manifesto e todos os arquivos por responsabilidade atual. Para cada função/constante/estado relevante, identificar: onde é definida, quem chama, se é exclusiva ou compartilhada, se toca DOM, estado global, Supabase, Realtime, persistência ou regras de negócio.

Entregar um mapa antes/depois proposto, sem mover código ainda.

Critério de saída: nenhuma função deve ser movida apenas pelo nome do arquivo; dependências reais precisam estar provadas por busca e bancada.

## Fase 2 — separar infraestrutura compartilhada

Organizar primeiro as peças transversais: estado, acesso/permissões, persistência Supabase, Realtime/presença, renderização, modais, toasts/avisos e utilidades. O objetivo é evitar que módulos de negócio precisem conhecer detalhes de transporte ou UI.

Não mudar contratos públicos das funções nesta fase, salvo wrappers compatíveis.

Critério de saída: mesmas chamadas externas e mesmo comportamento, com zero regressão nova.

## Fase 3 — consolidar domínio de Produtos e Estoque

Criar um dono claro para regras de produto/SKU e outro para estoque. Mapear todas as leituras/escritas de estoque real, estoque sugerido, cadastros, SKU e cálculos derivados.

Preparar uma interface interna estável para estoque, por exemplo funções conceituais como obter estoque por SKU, atualizar estoque conhecido e identificar origem/data da leitura, sem ainda conectar a Magazord.

Critério de saída: telas não devem depender diretamente de detalhes de onde o estoque veio.

## Fase 4 — consolidar domínio de Pedidos

Centralizar criação, edição, normalização e persistência de pedidos. Revisar caminhos duplicados entre Novo pedido, pedido avulso e Criar pedidos da Demanda, sem unificá-los à força quando o comportamento for diferente.

Dar dono claro para regras já sensíveis: prioridade, etapas usadas, embalagem, numeração, revisão/conflito e sincronização com OP.

Critério de saída: baterias de criação, prioridade, embalagem, etapas e conflito idênticas à baseline.

## Fase 5 — Demanda, Tarefas e demais telas

Separar cálculo de regra de negócio da renderização. Telas devem consumir funções do domínio, e não carregar regras escondidas dentro de handlers ou HTML.

Remover apenas código morto comprovado por busca + teste, seguindo a lição das versões v8.92 e v8.93.

Critério de saída: nenhuma mudança funcional perceptível.

## Fase 6 — criar camada de integrações externas

Somente depois da reorganização interna, criar um espaço explícito para integrações, por exemplo `integracoes/`.

A Magazord deverá entrar por essa fronteira e nunca diretamente por componentes de tela. Credenciais não podem ficar no front-end. A camada externa deverá normalizar dados da Magazord para o contrato interno de estoque.

Fluxo alvo: Magazord -> função de servidor -> normalização -> contrato interno de estoque -> Supabase/PCP.

Critério de saída: estrutura pronta para receber Magazord sem alterar telas.

## Fase 7 — integrar Magazord em modo somente leitura

Implementar primeiro consulta de estoque por SKU, sem escrever de volta na Magazord. Comparar estoque Magazord x estoque atual do PCP/Supabase e registrar divergências antes de automatizar qualquer atualização.

Começar com execução manual e observável. Só depois aprovar sincronização automática.

Critério de saída: correspondência de SKU validada e tratamento claro de SKU inexistente, duplicado, erro de API, rate limit e indisponibilidade.

## Estratégia de versionamento

Cada fase que altera código gera versão nova e MD5 próprio. Não reescrever binários fechados. Para mudanças grandes, preferir subetapas pequenas com bateria específica e regressão dirigida contra a versão imediatamente anterior e contra a baseline v8.93.

## Regra de segurança

Se uma movimentação de arquivo revelar dependência inesperada, parar, documentar, restaurar a função no dono correto e só então continuar. Não mascarar falhas ajustando testes ao binário novo sem provar que o teste anterior media comportamento removido por decisão de produto.