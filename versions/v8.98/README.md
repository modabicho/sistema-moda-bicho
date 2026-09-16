# v8.98 — Unir produtos em Datas Festivas: interface por seleção + conta consolidada

**Data:** 16/09/2026
**Arquivo:** `PCP-v8.98.html`
**MD5:** `675754aeb660047452a6e33c827323cc`
**Tamanho:** 2.129.046 bytes · 31.730 linhas
**Marcador:** `<!--PCP:8.98-->` · `VERSAO = "8.98"`
**Base:** v8.97 (`ec592e045ce407cc846a880cce454687`, 31.525 linhas)

## Causa raiz

1. **A interface decidia quem permanecia.** Na v8.97 a união começava na busca da base histórica, dentro da janela de um produto, e o principal era sempre o produto aberto.
2. **A conta da campanha ignorava o produto unido.** `festLinha` lia só `it.sku`: `vendasAtual[it.sku]`, pedidos da campanha com `sku === it.sku` e `vendasBase` de `it.sku + baseSkus`. Depois da união, a venda, o pronto e os pedidos concluídos que ficaram no SKU absorvido (corretamente, sem reescrita) saíam da linha do principal, e o "A produzir" inflava. Reproduzido na v8.97: no cenário da bateria, "A produzir" do principal ia para **150 peças** em vez de **0**.
3. **O absorvido voltava para a Demanda.** O único filtro da Demanda ligado a Datas festivas é `skusSoFestivos()`, e `calcular()` o comparava com o SKU exato da linha de estoque (`fora.has(l.sku)`). Depois da união o absorvido deixa de ser item da campanha, mas a Magazord ainda manda a linha de estoque dele, que reaparecia na Demanda como produto independente. Reproduzido na v8.97 e na v8.98 antes desta correção (teste 8.5).

## Correção

- **Produtos da campanha:** com **exatamente 2** itens em `selProd`, aparece **Unir produtos (2)** na barra da seleção. "Tirar da campanha" e "Mudar comportamento" continuam iguais. Não foi criada outra seleção.
- **Janela `modalFestUnir`:**
  - compara lado a lado SKU, descrição, comportamento, venda anterior, meta, estoque, em produção, pronto, vendido, a produzir, `skusAnteriores`, OP ativa e pedido vivo;
  - pergunta **"Qual produto deve permanecer?"** com **Manter [SKU A]** e **Manter [SKU B]**, sem opção marcada e com o botão desabilitado até a escolha;
  - a escolha mostra a prévia daquele sentido sem redesenhar a janela.
- **Regra de quem pode ficar** (`festUnirOpcoes`, no modelo, e não só na tela):
  - dois com cadastro: qualquer um;
  - só um com cadastro: só ele pode ficar, e a outra opção aparece desabilitada com o motivo;
  - nenhum com cadastro: bloqueado. Nenhum cadastro é criado automaticamente.
- **`festUnirAplicar`:**
  - sem escolha, não une;
  - executa `unirProdutos` (inalterada) e limpa `selProd`;
  - não aplica análise e só **sinaliza** (`reaplicar`) quando a meta sugerida do principal deixou de bater com a aplicada.
- **Conta da campanha** (`festSkusDoItem` e `festSomaSkus`): o produto passa a ser o SKU atual mais `skusAnteriores`, com comparação por `skuNormal`. Isso vale para venda anterior, vendido, em produção, pronto, pronto novo e pedidos abertos.
  - **Estoque fica de fora** (CLAUDE.md 8.5).
  - Um SKU com linha própria na campanha não entra na linha de outro, para não haver dupla contagem.
- **Depois de confirmar:** fecha a janela, `render()` recalcula `S.calc` e toda a campanha, grava `produtos`, `festivas` e `nucleo` numa chamada e mostra um toast avisando quando é preciso reaplicar a análise.
- **Demanda** (`skusSoFestivos` + `calcular`): além do SKU exato, os SKUs de `skusDoProduto()` de cada item "só na data" também ficam fora da Demanda, comparados por `skuNormal`.
  - A linha de estoque do absorvido continua em `linhas`, com o próprio saldo. Nada é somado ou transferido.
  - Essa identidade fica num conjunto à parte (`fora.identidade`), então `fora.size` e o aviso "N em Datas festivas" continuam contando produtos da campanha, e a regra do SKU exato não mudou.
  - Um item explícito "ano todo + reforço" não é escondido só por ser SKU anterior de outro produto.
  - Campanha arquivada continua devolvendo tudo à Demanda.
  - `campanhasDoSku`/`etiquetaCampanhas` só montam etiqueta, não filtram, e não foram alteradas.
- **Base histórica:** a janela "base e meta" mantém só "Usar como base histórica", com uma dica apontando para Unir produtos. A mensagem de `festBaseConferir` quando o SKU já é produto da campanha passou a indicar o caminho da seleção.

## Arquivos alterados

- `PCP-v8.98.html` (novo; a v8.97 foi preservada):
  - CSS da comparação;
  - `festBaseConferir` (texto) e comentário de `unirProdutos`;
  - `festUnirOpcoes` e `festUnirAplicar` (novas);
  - `festSkusDoItem`, `festSomaSkus` e `festVendaAnterior`;
  - `skusSoFestivos` e a linha `l.soFestivo` em `calcular`;
  - `festLinha` (vendido e pedidos da campanha);
  - `telaCampanhaProdutos` (botão);
  - `modalFestItem` (sem o botão de unir);
  - `modalFestUnir` (reescrita);
  - handlers: removido `data-festunir`; novo `fest-unir-sel`; `fest-unir` reescrito; `change` de `[data-festunirfica]`.
- `testes/datas-festivas-uniao.js` (novo; MD5 `fb7d104779fde6e37ebdf77c36577366`).

## Testes

| Bateria | v8.97 | v8.98 antes da correção da Demanda | v8.98 final |
|---|---|---|---|
| `datas-festivas-uniao` | 45 ok · 12 falhas (as seções 5 e 6 dependem de funções novas) | 76 ok · 2 falhas | **78 ok · 0 falhas** |

Falhas da v8.97, todas esperadas e reproduzindo o problema:
- 1.1 e 1.2: `skusAnteriores` fora da venda;
- 2.14 a 2.18 e 2.21: vendido, pronto e base do absorvido fora da linha; A produzir = 150;
- 3.2: vendido no sentido inverso;
- 5.0 e 6.1: escolha explícita e botão inexistentes;
- 7.2: unir oferecido pela busca da base;
- 8.5: o absorvido reaparece na Demanda.

**Seção 8 (Demanda)** roda o `calcular()` real sobre o cenário:
- A e B "só na data", cada um com estoque próprio; B absorve A;
- A continua no estoque (9) e B também (4), separados;
- A não aparece em `linhasDemanda`;
- `produtoDe("T.A")` devolve B e `skusDoProduto("T.B")` inclui T.A;
- o reforço explícito continua na Demanda;
- campanha arquivada devolve à Demanda.

Das 2 falhas da v8.98 antes da correção, a 8.5 era o defeito. A 8.13 era **erro do teste**: esperava 1, mas o cenário tem 4 itens "só na data" e sobram 3 depois da união. A expectativa foi corrigida para 3; ela garante que os SKUs anteriores não inflam o aviso.

Demanda com dados reais (cópia de teste), antes × depois da correção:
- **idêntica**: 1.683 linhas, 1.617 na Demanda, as mesmas 66 escondidas como "só na data" e `foraDaDemanda` = 90;
- console sem erros com a aba Demanda aberta.

Dados reais (cópia de teste, campanha Halloween, sem união executada):
- 90 itens geram 90 linhas nas duas versões;
- **zero diferença** em base, meta calculada, meta, vendido, estoque, em produção, pronto, pronto novo, a produzir e situação;
- nenhum item da Halloween tem `skusAnteriores` hoje;
- `festLinhas` leva cerca de 4 ms.

Interface, na cópia de teste:
- selecionar 2 mostra o botão;
- a janela abre sem escolha e com o botão desabilitado;
- a escolha mostra a prévia e libera o botão;
- trocar a escolha troca a prévia;
- cancelar não altera nada;
- no celular a tabela rola dentro da janela, sem rolagem lateral na página;
- console sem erros.

**Não executado nesta versão:** as baterias antigas citadas no CHANGELOG (`janelas`, `conflito-falso`, `duas-abas` etc.) não estão no repositório. A confirmação final pelo clique não foi feita com dados reais, porque ela gravaria a união na cópia local; o caminho foi coberto por `festUnirAplicar` na bateria.

## Fora do escopo (não alterado)

- Produto novo que "some" do Planejamento: não reproduzido e não mexido.
- `unirProdutos`: migração de OP e pedido, fusão das campanhas e validações seguem iguais à v8.97.
- Reorganização estrutural.

## Riscos conhecidos

1. **Decisões manuais do absorvido.** Meta à mão, base à mão e meta aplicada da linha absorvida não passam para o principal, como já acontecia na v8.97. A janela avisa antes de confirmar.
2. **Venda anterior pode mudar em outras campanhas.** Ela agora inclui `skusAnteriores`. Uma campanha futura com produto que já tinha SKU anterior verá a meta sugerida mudar, sem mudar a meta aplicada. Na Halloween atual, zero efeito.
3. **Principal "ano todo + reforço".** Se o principal é "ano todo + reforço", a linha de estoque do absorvido segue a regra geral da Demanda para SKU anterior: aparece como linha própria, igual a qualquer SKU renomeado fora de campanha. Essa regra geral não foi alterada. O caso "só na data" está resolvido nesta versão.
4. **Legado.** Um item da campanha cujo SKU já seja anterior de outro cadastro é tratado pelo cadastro. A dupla contagem é evitada, mas a união nesse caso pode deixar duas linhas.
