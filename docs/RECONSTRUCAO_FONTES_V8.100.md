# Reconstrução das fontes da v8.100

**Data:** 16/09/2026 · **Tipo:** infraestrutura (sem versão funcional nova)

## O que é

A árvore `src/` + `manifesto.json` foi recuperada a partir de `PCP-v8.100.html`. A última árvore de fontes disponível era a da v8.53; da v8.54 à v8.100 só existiam os HTML montados.

O `build.js` é o mesmo da v8.53, sem alteração: concatenação pura, na ordem do manifesto, de `casca-topo.html` + CSS + `casca-meio.html` + JS + `casca-fim.html`.

- **Arquivos em `src/`:** 95 (3 cascas, 8 CSS, 84 JS).
- **Build byte a byte idêntico** ao blob de `PCP-v8.100.html`:
  - MD5 de referência: `3296f5a1de067bdee9481d5c5058d4af`;
  - 2.103.807 bytes, 31.843 linhas;
  - `cmp`: zero diferenças.
- **Reprodutível no Windows:** `.gitattributes` fixa LF em `src/**`. Um clone novo com `core.autocrlf=true` gera o mesmo blob.

```bash
node build.js saida.html   # deve dar MD5 3296f5a1de067bdee9481d5c5058d4af
```

## Como foi recortado

- Fatias contíguas de bytes, cortadas só em fim de linha. Nenhum byte foi reescrito, reordenado ou normalizado.
- Cada divisa foi provada pela primeira linha do arquivo correspondente da v8.53 ou, quando o cabeçalho mudou, pela última linha reconhecível do arquivo anterior e pela primeira do seguinte.
- Linhas em branco nas divisas ficam com o arquivo anterior, convenção medida na v8.53 (45 de 83 arquivos terminam em branco; 2 começam).

## Arquivos recuperados (não existiam no manifesto da v8.53)

| Arquivo | Evidência |
|---|---|
| `nucleo/sentry.js` | Bloco "SENTRY · SÓ MONITORAMENTO (v8.88)", que se descreve como "Este arquivo…"; nome citado na casca; `nucleo/config.js` da v8.53 termina logo antes. |
| `pedidos/cancelamento.js` | Cabeçalho `src/pedidos/cancelamento.js · …`; `pedidos/modelo.js` termina logo antes. |
| `insumos/preambulo.js` | 33 linhas idênticas ao fim do `notificacoes.js` da v8.53, na posição registrada em `versions/v8.92/README.md`. |
| `ui/abas.js` | Cabeçalho `src/ui/abas.js · …` (v8.62); fica entre o fim de `ui/teclado.js` e o cabeçalho de `ui/rolagem.js`. |

## Arquivos removidos historicamente

- `notificacoes/notificacoes.js` — Notificações, v8.92.
- `telas/painel.js` — Painel/Hoje, v8.93.
- `telas/meu-trabalho.js` — Meu trabalho, v8.93.

## Zonas com atribuição historicamente incerta

Em qual arquivo estas linhas ficam é uma escolha documentada, não uma prova. **A escolha não altera o blob final:** qualquer divisão contígua na mesma ordem gera o mesmo HTML.

1. **`ACOES_RODANDO` e `ACOES_LOG`**, no início de `acoes/clique.js`. O CHANGELOG e o README da v8.79 põem `ACOES_RODANDO` em `acoes/clique.js`. `ACOES_LOG` (v8.81) não tem citação própria e foi junto por estar no mesmo bloco contíguo.
2. **Auxiliar `janelaPintar`/`abasRepintarBarra`**, no fim de `ui/abas.js`. Vem antes do cabeçalho de `ui/rolagem.js`, mas também poderia ser um acréscimo ao início da rolagem.
3. **Blocos grandes acrescentados depois da v8.53 sem nome de arquivo no código.** Ficaram dentro do arquivo onde estão:
   - `dados/persistencia.js` (portão de MFA, v8.55);
   - `persistencia/tela.js`;
   - `produtos/provisorios.js` (união de produtos, v8.97–v8.98);
   - `pedidos/modelo.js` (numeração e prioridade);
   - `impressao/tabela-valores.js` ("A parte comum das duas criações", v8.77);
   - `componentes/modal.js`, `dados/importar.js`, `ui/rolagem.js`, `acoes/fabrica.js` e `sessao/presenca.js`.

   Podem ter sido arquivos próprios na árvore perdida; sem nome no código, nenhum nome foi inventado.

## O que não mudou

Nenhuma regra funcional foi alterada. Nenhuma linha de código, nenhum símbolo, nenhuma ordem de carregamento. `PCP-v8.97.html` a `PCP-v8.100.html` continuam intactos. Não há versão nova do app.
