# v8.103 — Número de pedido sugerido já em uso

**Data:** 17/09/2026
**Arquivo:** `PCP-v8.103.html` (montado por `node build.js`)
**MD5 (LF):** `a80abae863687cdc90834d135c35b096`
**Tamanho:** 2.105.351 bytes · 31.870 linhas
**Marcador:** `<!--PCP:8.103-->` · `VERSAO = "8.103"`
**Base:** v8.102 (`70fccff211db98df5787eeb4e6297fbb`)

## Sintoma

A janela de criar pedido sugeria `2778` e, no mesmo formulário, avisava `Já existe: 2778 · 2. Separar/Cortar`. A validação de duplicidade acertava; o gerador do número sugerido não.

## Causa raiz

Duas coisas no navegador, e nenhuma no servidor.

1. **A releitura do contador não chegava ao campo.** Ao desenhar a janela, a sugestão é gravada em `data-sug`. `pedCicloRefrescar` relê `pcp_ciclo` e chama `npNumRefrescar()`, mas `npNumRefrescar` passava `inp.dataset.sug` como `sugPronta`, e `npNumVeredito` **prefere esse valor** a recalcular. O contador andava e a tela continuava com o número velho.
2. **A sugestão não conferia a lista.** Desde a v8.75, `proximoNumeroPedido()` devolve só `PED_CICLO.proximo` quando há contador. Se esse valor estiver atrasado — a releitura falhou (por exemplo, 401 com o token vencido), ou existem pedidos à frente dele —, a tela sugere um número ocupado enquanto durar.

Fontes divergentes: a sugestão vinha de uma cópia em memória do contador; a validação (`numeroEmUso`) lê `S.pedidos` e `S.remessas`, sempre atualizados.

Medido na cópia de teste, com dados reais: contador do servidor em **2778**, pedidos até **2784** na lista, sugestão da v8.102 = **2778, em uso**.

## Correção (só cliente)

- **`pedidos/modelo.js`** · nova `numeroLivreDesde(n)`: o primeiro número livre a partir de `n`, pulando o que já é de um pedido ou de uma remessa na memória. Não sobe além do que existe — não é a marca d'água que a v8.75 removeu.
- **`proximoNumeroPedido()`** · o caminho com contador começa em `PED_CICLO.proximo` e avança enquanto `numeroEmUso` responder verdadeiro. O contador **à frente** da lista continua prevalecendo.
- **`npNumRefrescar(contadorMudou)`** · quando a releitura traz número novo, recalcula a sugestão, atualiza `data-sug` e o botão, e troca o valor do campo **só se ele ainda for a sugestão antiga**. Número digitado à mão nunca é tocado. Se a pessoa tinha clicado em "Usar o sugerido", `S.modal.v.num` acompanha.
- **`pedidos/criar.js`** · a criação em lote da Demanda usa a mesma `numeroLivreDesde`, em vez de `num++` cego.

**Não alterado:** `pcp_pedido_criar`, `pcp_proximo_numero`, a sequência do servidor, Supabase, remessas, o caminho legado sem contador, e a reorganização estrutural.

## O que continua valendo

O navegador **não** é autoridade da numeração. `pxCriar` descarta o número da tela (ele vai só em `extra.numeroSugerido`) e quem grava é `pcp_pedido_criar`, com `pcp_proximo_numero` e o índice único `pcp_pedido_numero_uk`.

## Pendente, fora desta versão

**Pedido × remessa ainda pode duplicar.** A remessa de semiacabados pega o número pelo navegador e não passa pela sequência do servidor; `pcp_semi_remessa` não tem índice único em `numero` e não há proteção cruzada. Esta versão apenas **pula** números de remessa na sugestão. A correção de verdade é no servidor e precisa de uma etapa própria.

## Testes

Bateria nova `testes/numeracao-pedido.js`: troca só a leitura do contador e as saídas de tela; o resto é o código do app, inclusive `confirmarPedidos`.

| Bateria | v8.102 | v8.103 |
|---|---|---|
| `numeracao-pedido` | 7 ok · 11 falhas | **18 ok · 0 falhas** |
| `conflito-pedido` | 8 ok · 0 | **8 ok · 0** (mesmos avisos por cenário) |
| `datas-festivas-uniao` | 78 ok · 0 | **78 ok · 0** |
| Fotografia de identidade (17 campos) | referência | **idêntica, 0 diferenças** |
| Boot | 179 requisições Supabase, todas 200; 1.766 pedidos; sem "Erro ao calcular" | **igual** |

Casos cobertos: o caso da imagem; contador que muda com a janela aberta; número digitado à mão preservado; "Usar o sugerido" acompanhando o contador; contador atrasado com pedidos e remessa ocupando números; leitura do contador falhando; número com zero à esquerda; contador à frente prevalecendo; caminho legado sem contador; e o lote da Demanda pulando ocupados (na v8.102 ele gerava número repetido).

**Com dados reais, na mesma sessão:** contador 2778 e lista até 2784 — v8.102 sugeria `2778` (em uso), v8.103 sugere `2785` (livre).

Hashes iguais nas duas versões: `produtoDe` `7a85faf7`, `skusDoProduto` `ef7b72d3`, `opAtivaDe` `674aa399`, Demanda `1bd0373b`, Festivas `5ff11f7e`. A fila real do navegador de teste ficou intacta (36 → 36).

## Limite conhecido

A janela "Criar pedidos" mostra a faixa estimada ("números X a Y") a partir do primeiro livre, sem pular os ocupados no meio da faixa. É só o texto de previsão: a criação pula corretamente, e o número final é do servidor.
