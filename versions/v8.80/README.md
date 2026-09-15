# Sistema Moda Bicho PCP — v8.80

Data de registro: 14/09/2026.

**MD5 informado:** `ba9253aae0cf60c770fce3e9334740ae`.

**Base:** v8.79.

> Observação: nesta conversa não foi recebido o arquivo HTML da v8.80, portanto tamanho e marcador interno não foram verificados aqui. O MD5 acima foi informado no relatório de entrega.

## Objetivo

Reduzir o tempo de `Aplicar análise` quando há centenas de OPs para atualizar e corrigir a falha de criação em lote acima do limite aceito pelo servidor.

## Gargalo medido

A medição mostrou que o custo estava em `demEnviarIntencoes`: os patches de OP eram enviados em série, com `await dmOpPatch(...)` dentro do laço, fazendo uma ida ao servidor por OP.

Todo o restante da análise — prévia, cálculo das OPs, cascata de prioridade, histórico e render — teve custo pequeno em comparação.

## Corrigido — patches em janela de concorrência

Os patches passaram a ser enviados com uma janela de até **8 requisições em paralelo**.

Regras preservadas:

- intenções do mesmo `id` continuam em ordem, percorridas em série;
- cada patch mantém sua própria `revision` e `p_operation_id`;
- conflito/revisão continua protegido;
- prioridade em cascata, `prioridadeTravada`, `avisar`, histórico e a trava de reentrada da v8.79 permanecem intactos;
- falha de uma OP é isolada e não transforma as demais em falha nem em falso sucesso;
- o limite de concorrência ficou centralizado em `DEM_JANELA`, podendo ser reduzido se produção apresentar 429/throttling.

### Medição v8.79 × v8.80

Mesma máquina e mesma semente:

| cenário | versão | idas | total | `demEnviarIntencoes` |
|---|---|---:|---:|---:|
| 400 atualizadas | v8.79 série | 421 | 9.021 ms | 7.682 ms |
| 400 atualizadas | v8.80 janela 8 | 421 | 5.812 ms | 4.474 ms |
| 815 atualizadas | v8.79 série | 840 | 18.646 ms | 17.236 ms |
| 815 atualizadas | v8.80 janela 8 | 838 | 10.433 ms | 9.152 ms |

Nos quatro ensaios: **zero conflitos e zero falhas**.

A bancada local é limitada por CPU/processo de `psql`, então o ganho medido não representa diretamente a produção. Em produção, onde a latência domina, a expectativa informada foi reduzir 815 patches de aproximadamente 1,5–4 minutos para algo na ordem de 12–30 segundos. O número real deve ser confirmado no primeiro uso publicado.

## Corrigido — teto de 500 na criação em lote

O servidor rejeita mais de 500 itens em uma chamada de `pcp_op_criar`. Na v8.79, 815 necessidades novas podiam resultar em resposta `invalido` e deixar `pcp_op` sem linhas.

A v8.80 passou a dividir `dmOpCriar`/`dmFaltaCriar` em blocos seguros antes do envio.

Resultados informados:

| novas | resultado |
|---:|---|
| 499 | 499 gravadas · 2 chamadas · 0 problemas |
| 500 | 500 gravadas · 2 chamadas · 0 problemas |
| 501 | 501 gravadas · 2 chamadas · 0 problemas |
| 815 | 815 gravadas · 3 chamadas · 0 problemas |

Na v8.79, o cenário de 815 novas retornava `invalido` e deixava a tabela vazia.

## Isolamento de conflito

Em ensaio com uma OP alterada externamente entre duas análises:

```text
{"enviadas":41,"problemas":1,"quaisProblemas":[{"id":"op-5","status":"conflito-de-campo"}],"okPatches":39}
op-5 no banco: 77
```

O valor externo foi preservado; uma falha ficou isolada e as demais gravações concluíram.

## Regressão dirigida

- 20 baterias: **zero regressão nova**;
- `analise-toast-duplo`: **15 ok · 0 falhas**;
- `falso-conflito-papel`: **25 ok · 0 falhas**.

## Observação de produção

Se houver erro 429/throttling, reduzir `DEM_JANELA`. A arquitetura não depende do número 8.
