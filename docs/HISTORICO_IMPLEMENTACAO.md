# Histórico de implementação — Sistema Moda Bicho

Atualizado em: 09/09/2026

Este documento consolida o que já foi implementado, validado, corrigido e decidido no PCP até esta data. Ele serve como memória técnica e funcional do projeto.

---

# 1. Visão geral do sistema

O Sistema Moda Bicho é um PCP web interno para substituir a operação baseada em planilhas e centralizar demanda, pedidos, produção, conferência, compras, produtos, equipe, auditoria e integrações.

Arquitetura atual:

- SPA monolítica em HTML/CSS/JS.
- Supabase como backend, autenticação e PostgreSQL.
- Dados operacionais prioritariamente em tabelas row-based.
- Realtime usado como notificação, não como substituto de fonte de verdade.
- Servidor/banco como fonte oficial para identidade, permissões, revisões e numeração.

Princípios arquiteturais já adotados:

- Todo registro editável relevante possui `revision`.
- Concorrência otimista com `expected_revision` e conflito explícito.
- Salvamento somente dos campos alterados.
- Three-way merge base/local/remote nos pontos necessários.
- Operações compostas devem ser transacionais/RPC.
- `operation_id` usado para idempotência e rastreabilidade.
- `localStorage`/`sessionStorage` não são considerados confirmação de gravação no servidor.
- Auditoria registra antes/depois, usuário, operação e revisões.
- RLS e RPCs são a proteção real; frontend não é tratado como segurança.
- Arquivar é diferente de apagar.
- IDs internos são globais; número humano do pedido pertence ao contexto/ciclo.

Regra semântica importante: **número do pedido é identificador humano, nunca quantidade.**

---

# 2. Migração do legado para modelo row-based

A migração principal foi concluída e conferida.

Resultado do cutover:

**PODE TIRAR O LEGADO DO CAMINHO CRÍTICO — zero bloqueio e zero divergência.**

Estado consolidado:

- 21/21 entidades operacionais migradas para modelo row-based.
- 0 bloqueios de cutover.
- 0 divergências críticas encontradas na conferência.
- `bonus` e `festivas_itens` permanecem document-read de forma intencional por limitação do motor.
- Documentos legados ficaram apenas como espelho/compatibilidade, não como fonte operacional principal.

Débito conhecido:

- uso alto de armazenamento do navegador em alguns fluxos antigos; limpeza futura ainda recomendada.

---

# 3. Produtos e cadastro de SKU

O cadastro de produtos foi migrado para modelo row-based.

Implementações e correções relevantes:

## v8.47 — desempenho do cadastro

Foi corrigido um problema de download excessivo no cadastro e removidos espelhos legados bloqueantes do caminho crítico.

## v8.48 — proteção contra remoção em massa

Foi adicionada proteção para evitar exclusões acidentais de grande volume no cadastro:

- troca de lista não dispara remoções indevidas;
- remoção acima de 3 itens ou acima de 10% do conjunto é bloqueada;
- itens retidos recebem aviso;
- remoções pequenas e legítimas continuam permitidas.

Regra de segurança: não aceitar remoção em massa silenciosa decorrente de reordenação/troca de lista.

---

# 4. UI/UX do PCP

A interface foi redesenhada para o contexto industrial/PCP, com maior densidade e consistência visual.

## v8.51 — design system

Implementado:

- tokens de cor, tipografia e espaçamento;
- modo claro/escuro;
- breakpoints responsivos;
- navegação mobile;
- padronização de cores semânticas;
- fontes da identidade visual.

## v8.52 — painéis operacionais

Ajustes de:

- densidade de tabelas;
- gramática visual de estados;
- painéis operacionais;
- prioridades e decisões.

## v8.53 — acessibilidade e impressão

Incluído:

- melhorias de foco e navegação;
- acessibilidade de janelas/modais;
- impressão;
- login;
- aplicação correta das marcas/logos;
- focus trap onde necessário.

Essa frente foi aceita e publicada.

---

# 5. Segurança, autenticação e MFA

O PCP usa Supabase Auth sem depender do `supabase-js` no frontend, com integração manual via API.

Sessão do sistema mantida sob namespace próprio do PCP.

## MFA da administradora

MFA foi implementada e ativada em produção.

Flag de produção:

- `mfa_adm_obrigatoria = true`

Comportamento esperado:

- administradora precisa de segundo fator;
- contas operacionais não precisam de MFA administrativo;
- manutenção/serviço possuem regras específicas de bypass controlado.

## v8.55 — correção de persistência indevida do MFA

O bypass de MFA que antes podia persistir foi removido do armazenamento permanente e passou para `sessionStorage`, valendo apenas para a abertura atual.

## Identidades de login

As seis identidades oficiais de login são:

- Ana Laura
- João Augusto
- Atendimento
- Contato
- Produção
- Separação

Regra de arquitetura:

**Pessoa física ≠ conta de acesso ≠ setor.**

Não copiar e-mails de contas de setor para pessoas físicas.

A auditoria pode registrar “Produção alterou”, enquanto a responsabilidade operacional pode estar atribuída a uma pessoa como Suellen.

---

# 6. Equipe

O módulo Equipe foi reorganizado em três blocos conceituais:

1. Acessos do PCP
2. Pessoas da equipe
3. Roteamento de produção

O modelo antigo baseado em PIN foi removido.

O resolvedor de contas deve usar a fonte oficial `EQ_CONTAS`, não misturar com a lista de pessoas físicas.

Foi criada a migração SQL146 para refatorar `pcp_pessoa_salvar`, garantindo validação antes de escrever.

A conferência da SQL146 foi concluída com sucesso.

---

# 7. Pedidos cancelados, reativação e arquivamento

Essa frente foi concluída e publicada com sucesso.

Regras implementadas:

- cancelar pede confirmação;
- reativar restaura o status imediatamente anterior;
- apagar pedido cancelado é lógico/arquivamento, nunca `DELETE` físico;
- número humano do pedido continua consumido dentro do ciclo;
- reativar não repete baixa de insumo;
- todas as ações são auditadas.

## Legado sem `status_antes_cancelamento`

Foi implementada recuperação por evidência histórica:

- `retornadaEm` → Produzido
- `qtdConferida` sem retorno → Conferir
- `enviadaEm` → Em Produção
- `separadaEm` → Cortado/Enviar
- sem carimbos suficientes → pedir decisão, sem preseleção silenciosa

A escolha é gravada uma única vez e auditada.

## v8.59

Entregue com:

- cancelar/reativar/arquivar logicamente;
- watermark frontend protegido;
- contador oficial no servidor via `pcp_ciclo`;
- sequência monotônica;
- 71 asserts, 0 falhas em bateria focada.

Publicação validada em uso real.

---

# 8. Performance — Demanda

## v8.60

Problema encontrado:

- scroll infinito chamava `render()` completo;
- DOM crescia excessivamente;
- layout consumia grande parte do tempo.

Antes:

- cerca de 5,3–5,5 s acumulados em cinco descidas;
- 8 renders completos;
- DOM chegando a ~39 mil nós.

Correção:

- crescimento incremental de linhas;
- molde compartilhado `demLinhaSku(x)`;
- lock após RAF;
- teto de 900 linhas/~32 mil nós;
- “Mostrar mais” preservado.

Depois:

- 0 renders completos nas descidas;
- blocos em ~9–14 ms;
- abertura ~163 ms;
- busca ~344 ms.

Bateria: 29 asserts verdes.

---

# 9. Performance — Pedidos

Três gargalos principais foram corrigidos.

## Salvamento

Antes:

- ~12,4 s;
- 2.226 `setItem`;
- ~433 MB de escrita acumulada em espelho diagnóstico.

Causa:

- divergências eram persistidas uma a uma no espelho local inteiro.

Correção:

- acumular divergências em memória;
- fazer flush único ao final.

Depois:

- ~1,9 s;
- 25 `setItem`;
- ~2,2 MB escritos.

## Scroll

Correção por crescimento incremental e teto de 600 linhas.

Depois:

- 0 renders em cinco scrolls;
- ~25 ms.

## Modal de pedido

Antes:

- abrir/fechar provocava render global de ~650–730 ms.

Correção:

- `repintarModal` isolado.

Depois:

- abertura ~15 ms;
- fechar/reabrir ~11 ms.

Bateria final dessa frente: 32 asserts verdes, com regressões vizinhas também verdes.

---

# 10. Navegação interna por abas — v8.62

A navegação estilo ERP por abas foi implementada e publicada.

Objetivos atendidos:

- preservar busca, filtros, scroll e contexto;
- abrir Pedido em aba própria;
- ao abrir o mesmo Pedido, ativar a aba existente;
- confirmação ao fechar aba suja;
- botão `x` para fechar;
- destaque da aba ativa;
- overflow de abas;
- abas inativas não renderizam em background;
- uma única conexão realtime;
- F5 restaura rascunho local claramente marcado como não enviado.

Arquitetura adotada:

**somente a aba ativa existe no DOM; as demais ficam guardadas como estado em memória.**

Metáfora usada no projeto: uma tela ativa na bancada; as demais ficam guardadas como ficha.

Contextos inicialmente suportados:

- Pedidos
- Demanda
- Conferência
- Compras
- Pedido N

Resultados de teste:

- 104 asserts, 0 falhas;
- um render por troca de aba, nunca dois;
- 0 renders ao abrir/fechar Pedido;
- 11–17 ms em operações de aba/modal convertido;
- um único socket realtime;
- scroll/filtros/busca preservados;
- rascunho local não dispara escrita no banco.

A versão recebida foi identificada como `<!--PCP:8.62-->`.

Foi registrado no GitHub um manifesto verificável da v8.62 em `versions/v8.62-tabs/README.md`.

---

# 11. Bug crítico de login / autorização — v8.63

Após a publicação das abas, foi encontrado um problema de corrida no boot da identidade.

Sintoma visto em uso real:

- login de conta operacional podia mostrar falsamente “Falta ligar esta conta a uma pessoa”;
- ao trocar de aba do navegador e voltar, o sistema entrava corretamente.

Diagnóstico aprofundado encontrou um problema mais grave:

**com a fonte de equipe atrasada, `atendimento` chegou a ser promovido temporariamente para ADMINISTRADORA no frontend.**

Causa:

- resolvedor de identidade executava antes de `EQ_CONTAS`/`pcp_pessoa` terminar de carregar;
- ramo de “primeira conta sem ninguém no comando” podia ser alcançado durante a corrida.

Correção v8.63:

- `eqCarregar()` passou a expor estado explícito;
- nenhum ramo de identidade executa enquanto fonte não estiver `ready`;
- carregando → “Confirmando seu acesso”;
- erro → mensagem de falha de carregamento, sem acusar falta de vínculo;
- retry explícito;
- re-render ao terminar o carregamento;
- sem depender de `focus`/`visibilitychange` para concluir login;
- contas operacionais nunca promovidas por fallback.

Teste comparativo:

- v8.62: 7 ok / 10 falhas
- v8.63: 18 ok / 0 falhas

As seis identidades entram no primeiro login na bateria focada.

Observação: uma bateria de abas falhou uma vez sob execução paralela e passou nas três execuções isoladas seguintes; classificado como instabilidade de bancada, não regressão comprovada.

---

# 12. GitHub

Repositório criado e conectado:

- `modabicho/sistema-moda-bicho`
- privado
- branch principal: `main`

Estrutura já criada:

- arquivo principal histórico do PCP no repositório;
- `README.md`;
- `supabase/README.md`;
- `supabase/migrations/README.md`;
- `versions/v8.62-tabs/README.md`;
- este arquivo `docs/HISTORICO_IMPLEMENTACAO.md`.

Regra adotada:

- todo SQL novo deve ser versionado no GitHub;
- nunca versionar tokens, senhas, service-role, credenciais Magazord ou segredos.

O histórico formal de migrations do Supabase estava vazio quando conectado; por isso não foi inventado histórico antigo.

Convenção definida:

- banco atual vira baseline;
- migrations formais novas seguem a partir da 147;
- SQL145/146 podem ser reconstruídas/documentadas separadamente quando necessário.

---

# 13. Supabase

Projeto conectado:

- nome: `pcp-modabicho`
- região: `sa-east-1`
- PostgreSQL 17.6.x

Inventário consultado na conexão inicial:

- 198 funções `pcp_*`;
- 32 tabelas `pcp_*`;
- 5 views `pcp_*`.

Uso acordado:

- leitura/diagnóstico/conferência podem ser feitos diretamente;
- mudanças importantes/destrutivas em produção devem ser explicitamente revisadas antes da execução.

---

# 14. Integração Magazord

Frente atualmente em espera.

Endpoint oficial identificado:

- `GET /v1/listEstoque`

Arquitetura desejada:

**Magazord → Supabase Edge Function segura → Supabase → PCP**

Regras:

- nunca colocar credenciais no frontend;
- nunca gravar credenciais no `localStorage`;
- nunca versionar credenciais no GitHub;
- autenticação Basic Auth deve ficar no backend seguro.

Hipótese de estoque em estudo:

- físico menos reservado, somando depósitos escolhidos;
- ainda precisa de comprovação antes de virar regra de produção.

---

# 15. Auditoria da importação da planilha — em andamento

Arquivo de referência funcional:

- `CONTROLE PEDIDOS_V02.xlsm`

Decisão de projeto:

**a planilha é a especificação funcional do processo atual.**

O app deve substituí-la sem mudar o resultado operacional, exceto quando houver mudança deliberada aprovada.

Critério de equivalência:

`mesma situação na planilha → mesmo resultado no app`

## Achados já confirmados

### Sufixo `-A`

Na planilha:

- 247 linhas com `-A`;
- zero `-B`;
- zero `-C`.

Regra funcional:

- `NNNN-A` não é pedido novo;
- é o mesmo pedido com segunda prestadora;
- executa processos restantes;
- pertence à mesma operação/família.

Exemplo confirmado em `ControleProcessos`:

- `0384`: MÁQUINA = 197
- `0384-A`: COLA = 197, COLA DUPLO = 197, EMBALAR = 197

O app já possui o conceito de continuação em `criar.js`, mas o caminho de gravação estava descartando o número humano.

### Causa raiz da renumeração indevida

Fluxo atual problemático encontrado:

`entrada numerada → telaSalvarPedidos apaga numero → servidor gera outro → patch tenta recolocar numero`

Isso explica:

- `2244-A` virar número novo;
- `2246-A` virar número novo;
- reimportação duplicar;
- número digitado ser descartado;
- criação concluir e depois aparecer erro de renumeração.

Reprodução real em bancada:

- `2247` criado a partir de `2244-A`;
- `2248` criado a partir de `2246-A`;
- `2249` e `2250` criados na reimportação das mesmas linhas;
- `2251` criado a partir de um número escrito `9999`.

### Importação não idempotente

Reimportar a mesma linha cria outra operação porque o número original desaparece no primeiro ciclo.

Nova importação precisa ter identidade estável no banco e ser idempotente no servidor.

### Número digitado

A planilha não gera número por fórmula nem VBA; a pessoa digita o número.

Decisão tomada para o PCP:

- manter a possibilidade de informar número manual;
- servidor valida e grava;
- não usar `criar → patch numero`;
- pedido automático continua numerado pelo servidor.

### Duplicidades históricas

Cinco números aparecem duplicados na planilha e já são conhecidos pelo banco:

- 2067
- 2070
- 2073
- 2074
- 2225

Essas exceções são preservadas via `pcp_duplicidade_historica`.

Não criar regra genérica `|2` que transforme duplicidade nova em exceção válida.

### `ControleProcessos`

Foi descoberto que a importação atual não lê a aba `ControleProcessos`.

Isso é crítico porque essa aba contém:

- quantidade produzida por processo;
- divisão do trabalho entre prestadoras;
- base para quantidade realizada;
- parte do financeiro operacional.

Foram encontrados:

- 1.397 pedidos com controle de processos;
- 16 processos distintos, incluindo COLA, EMBALAR, MÁQUINA, COLA DUPLO, COLA ESPECIAL, DOBRAR, TRAVA/AGULHA, COSTURA OVER etc.

Decisão:

- importar processo por processo e quantidade por processo;
- `etapas` não pode ficar vazio quando a planilha possui informação.

### Status da planilha

Foi construído um oráculo da fórmula de Status da planilha.

Resultado:

**1.606/1.606 linhas reproduzidas corretamente.**

Achados:

- existem 10 status alcançáveis pela fórmula;
- `4. Conferir` é válido mesmo não aparecendo no retrato atual;
- `Atraso Conferência`, `Indicar Quantidade` e `5. Aguardando Processos` também são regras válidas;
- `Atraso Produção` = 10 dias fixos a partir da saída;
- `Avaliar` = processo do SKU não cadastrado;
- processo vem do cadastro do produto, não da linha do pedido;
- `Qtde. Realiz` vem de `ControleProcessos[Produzido]`;
- `Estrutura / Processo` é um portão de qualidade.

Regra de `Estrutura / Processo`:

- enquanto não for `OK`, quantidade realizada não é preenchida;
- status trava em `5. Aguardando Processos`;
- pedido não pode ser tratado como produzido.

Decisões aprovadas:

- processo operacional obedece ao cadastro do SKU;
- divergência da linha pode ser registrada em `extra`/auditoria;
- `Atraso Produção` usa 10 dias fixos;
- mediana pode continuar como indicador analítico, não como regra de status;
- `Avaliar` vira pendência de cadastro;
- `ControleProcessos` deve ser importado.

### Mudança deliberada em relação à planilha

A regra “número consumido dentro do ciclo não volta a ficar livre” não existe na planilha, porque lá a pessoa pode redigitar qualquer número.

No PCP essa proteção é deliberada e deve continuar documentada como mudança de segurança, não como reprodução literal da planilha.

## SQL147

Arquivo em desenvolvimento:

- `147-importacao-numerada.sql`

Estado informado durante a auditoria:

- livro append-only;
- identidade de importação sem `|2` genérico;
- Parte 1 de validação concluída;
- nada é gravado e contador não avança se houver pendência;
- Parte 2 ainda em desenvolvimento;
- nada executado no banco de produção até a última atualização.

### `2525` e `2526`

Permanecem intocados.

Há consulta somente leitura para identificar origem usando evidência histórica em `extra.numeroSugerido`.

Não apagar, renumerar nem devolver número ao contador sem conferência individual.

---

# 16. Bugs conhecidos ainda não enviados para a mesma frente de implementação

Foi decidido não misturar estes bugs enquanto a importação/status/processos está sendo fechada.

Ordem planejada depois:

## 1. Família `NNNN` / `NNNN-A` no cálculo de produção

Regra necessária:

- base + `-A` representam uma única cobertura operacional;
- não somar em dobro;
- se a base estiver encerrada e só o `-A` continuar ativo, considerar o `-A`;
- consolidar pela família/operação, não só pela string do número.

Caso real observado:

- necessidade = 550;
- já existem 400 em produção na família;
- sugestão correta = 150;
- app estava sugerindo 550 quando só o `-A` permanecia.

Esse bug pode causar superprodução e é prioridade alta.

## 2. Etapas do SKU não aparecem no novo pedido

Foi observado cadastro de produto com etapas padrão preenchidas, mas o modal “Novo pedido de produção” não exibia corretamente os processos/etapas do SKU.

Regra esperada:

- novo pedido deve carregar a estrutura cadastrada no produto;
- etapas devem aparecer para seleção e seguir para papel/conferência conforme regra vigente.

## 3. Falso conflito de revisão ao salvar

Mensagem observada:

“o pedido foi alterado por outra pessoa enquanto você editava”.

Ocorrência aconteceu em edição normal, sugerindo possível conflito gerado pela própria gravação/realtime.

A correção deve preservar optimistic concurrency e distinguir:

- evento da própria `operation_id`/save;
- alteração realmente concorrente de outra revisão.

---

# 17. Backlog de segurança

Itens ainda relevantes:

- recuperação de senha;
- gestão de sessões/dispositivos/revogação;
- auditoria completa de RLS/RPC;
- revisão de policies de leitura e grants;
- tratamento de contas compartilhadas em auditoria;
- secrets/uploads/rate limits;
- CSP/headers;
- backup e restore testado;
- limpeza do armazenamento do navegador.

---

# 18. Regras funcionais que não podem ser quebradas

- número do pedido é identificador humano;
- número humano pode ser alterado por ação deliberada, mas não por patch automático oculto;
- número consumido no ciclo permanece consumido mesmo se cancelado/arquivado;
- `id` interno é a identidade técnica real;
- `-A` é continuação da base e não pedido independente para cálculo de cobertura;
- pessoa, conta e setor são entidades diferentes;
- frontend não decide privilégio administrativo por fallback;
- servidor é fonte de verdade para identidade, autorização e numeração;
- reativar não repete consumo de insumo;
- arquivar não é apagar;
- Realtime não deve sobrescrever rascunho local sem resolução de conflito;
- importação precisa ser idempotente e transacional;
- a planilha é a referência funcional da migração, salvo mudanças deliberadas aprovadas.

---

# 19. Status atual resumido

Concluído e publicado:

- migração principal row-based;
- cadastro de produtos e guardas de remoção;
- redesign UI/UX;
- MFA e segurança de sessão;
- Equipe sem PIN;
- cancelamento/reativação/arquivamento;
- performance de Demanda e Pedidos;
- navegação por abas v8.62;
- correção de corrida de identidade/login v8.63 em bateria focada.

Em andamento:

- importação numerada baseada na planilha;
- equivalência de status/processos/quantidades com `CONTROLE PEDIDOS_V02.xlsm`;
- SQL147.

Bloqueado para uso normal até fechar:

- importação da planilha.

Próximos bugs após fechar a importação:

1. cálculo da família base/`-A`;
2. etapas padrão do SKU no novo pedido;
3. falso conflito de revisão ao salvar.

---

# 20. Regra de manutenção deste documento

Sempre que uma frente relevante for:

- implementada;
- publicada;
- rejeitada;
- alterada por decisão funcional;
- migrada no banco;
- ou descobrir uma regra nova da planilha,

atualizar este arquivo no mesmo ciclo de versionamento.

O objetivo é que nenhuma decisão importante do PCP dependa apenas de conversa, memória local ou conhecimento de uma única pessoa.
