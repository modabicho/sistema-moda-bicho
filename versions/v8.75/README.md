# PCP v8.75

Data registrada: 14/09/2026

MD5: `6a3af0a178717493d856b11457ea31e1`

Tamanho informado: 2.062 KB · 31.800 linhas.

A v8.75 contém integralmente v8.74.

## Validação

Comparativo v8.74 × v8.75 em 42 baterias:

- 41/42 deram exatamente o mesmo resultado;
- a única diferença foi o teste que conferia literalmente o rótulo da versão (`8.74` → `8.75`);
- falhas remanescentes tiveram listas idênticas item a item.

## Mudanças/ajustes validados

- numeração de pedido alinhada ao contador oficial `pcp_ciclo` do Supabase;
- no cenário medido, “Criar pedidos” deveria mostrar 2726 em vez de 2817, com confirmação de gravação;
- marca d'água da numeração mantida como fallback;
- correção de redesenho de embalagem: filipeta sem tamanho e plástico mostrando tamanho imediatamente;
- correção estrutural do caminho de volta associado ao BUG 3, embora o print original não tenha sido reproduzido exatamente;
- incorpora os consertos da v8.74 relacionados a `pxdrenar-janela`, `demanda-remocao-fantasma` e `abas-*`.

## Dívidas conhecidas

Algumas baterias antigas quebram antes do placar porque ainda apontam para seletores removidos da interface. Isso ocorre igualmente nas versões comparadas e não foi classificado como regressão da v8.75.

## Fora da versão

- falso conflito / identificação incorreta de “outra pessoa”;
- rascunho de aba sobrescrevendo silenciosamente;
- carimbo que não grava quando o documento falha;
- `ultima_operacao`;
- carga da planilha;
- sondas de produção.

Veja também `docs/CHANGELOG.md`.
