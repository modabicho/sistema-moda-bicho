# PCP v8.66

## Artefato certificado

- Arquivo: `PCP-v8.66.html`
- Versão embutida: `<!--PCP:8.66-->`
- MD5: `7acbcf7b878cfc663dcc56ca5152ed24`
- Tamanho lógico: 31.796 linhas na contagem de referência
- Estado de banco compatível: migrações 147, 149, 150, 151, 152, 153 e 154 instaladas e conferidas em produção

## Principais alterações

A v8.66 consolida o pacote de correções de interface e operação já certificado em bancada, incluindo os ajustes de navegação interna, criação/edição de pedidos, importação numerada com prévia obrigatória, proteção de evidências históricas, rastreabilidade por `operation_id`/`ultima_operacao`, correções de concorrência/realtime e correções no fluxo de processos do SKU.

A publicação também leva a nova regra de bônus BANDANA: somente prestadoras que efetivamente realizam BANDANA entram no cálculo, considerando apenas peças de Bandana, com mínimo de 15.000 peças no mês e bônus de 10%. Na reavaliação dos 82 fechamentos reais, 0 grupos passam a receber, 14 deixam de receber e 7 continuam recebendo. O impacto aprovado em Jun+Jul+Ago é de R$ 2.372,02 a menos.

## Situação da numeração e importação

O banco foi endurecido para separar pedidos nascidos no PCP de pedidos já numerados/importados. O importador oficial usa a assinatura de 6 argumentos, exige prévia confirmada, rejeita número repetido no mesmo lote e preserva a origem de importação. O histórico conhecido foi congelado antes das correções: 235 evidências, sendo 223 casos de número humano descartado e 12 continuações que viraram número novo da sequência.

O mapa de continuações da migração 153 identifica 12 ocorrências em 8 famílias, incluindo o caso recente em que o pedido 2687 deveria ter sido `2358-A`. Nenhum desses casos foi reparado automaticamente.

## P0 conhecido — continuação `-A`

A v8.66 **não corrige** o defeito de criação de continuação pela tela normal. O cliente ainda monta o número pretendido `NNNN-A`, mas o fluxo cai em criação de pedido novo; `pxCriar` remove o número e `pcp_pedido_criar` entrega o próximo número sequencial. As RPCs corretas `pcp_pedido_continuar` e `pcp_proxima_continuacao` já existem no banco, mas o caminho do cliente ainda não está ligado a elas.

Este defeito fica explicitamente aberto como P0 para a v8.67. Enquanto ele não for corrigido, não deve ser feito saneamento dos 12 casos históricos de `-A`, porque a fonte do problema continua aberta.

## Rollback de produção

Antes da publicação da v8.66, a produção estava no deploy Netlify `6aa1b1df4fa7d0f13a251f8a`, correspondente à v8.62. Esse deploy histórico deve ser preservado como rollback imutável. A cópia baixada do HTML atual também foi guardada antes da troca.

## Fora de escopo deste pacote

Continuam fora deste rollout: baseline `true`, importação real da planilha, reparo/saneamento dos 12 `-A` já identificados e decisão automática dos cinco números duplicados históricos que permanecem pendentes (2067, 2070, 2073, 2074 e 2225).
