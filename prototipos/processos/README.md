# Protótipo · Processos / Como fazer

**Prova de conceito. Não é módulo do PCP.** Fica fora do build: `build.js` e `manifesto.json` não sabem desta pasta, e a versão do PCP não muda por causa dela. Não fala com o Supabase.

**Começa vazio.** Não há classificação, lista, processo ou padrão pronto: tudo é criado por quem usa. O que você cria fica guardado **só neste navegador** (localStorage) e sobrevive a um recarregar. O botão **Recomeçar do zero** apaga tudo. Os produtos e insumos que aparecem são de exemplo (SKU `EX-…`) e só simulam o cadastro do PCP.

É uma biblioteca de instruções de trabalho, e só isso. Não baixa nem reserva estoque, não gera consumo, não movimenta insumos e não altera produto, pedido, OP ou demanda. O SKU de insumo é só referência de qual material usar.

## Como abrir

Abra `processos.html` no navegador. É um arquivo só e não precisa de servidor.

Para remontar depois de mexer em `processos.js` ou `processos.css`, rode na raiz do repositório:

```bash
node prototipos/processos/montar.js
```

Os estilos e os helpers de desenho (`esc`, `IC`, `svg`, `kpi`) saem do próprio `src/` do repositório, sem alteração. O visual acompanha o app.

## O modelo

- **Classificação:** criada pela administradora (setor, fornecedor, tipo de produto, tipo de estampa…).
- **Lista de opções compartilhada:** usada por vários campos. Editar a lista muda as opções de todos os campos que a usam.
- **Tipo de processo:** um formulário montado no construtor. Tipos de campo: texto, número, medida, quantidade, seleção única, seleção múltipla, sim/não, observação longa, SKU de insumo, passo a passo e grupo repetível (um nível).
- **Padrão:** configuração preenchida e salva, pronta para aplicar.
- **Configuração no produto:** aplicar um padrão **copia** os valores para o produto. Não há sincronização: editar um produto não muda outro nem o padrão, e editar o padrão não muda produto nenhum. A origem fica registrada, e aparece "padrão editado depois" quando for o caso.

O código só conhece os tipos de campo. Nenhum nome de processo, campo, opção ou classificação está no código. A classificação pode ser criada ali mesmo, na janela do processo ou do padrão, com os valores um por linha.

- **Campo Medida:** valor e unidade juntos ("20 cm", "25 mm"). A unidade pode ser fixa ou escolhida por quem preenche. As unidades aceitas são configuradas pela usuária em cada campo; nenhuma vem fixa no código.
- **Quem usa este processo:** consulta que mostra os produtos vinculados a um processo, com origem e estado, e permite abrir o produto ou a instrução dele. É só consulta: não altera nada.

## Na produção

- **Modo bancada:** as instruções do produto abrem em tela cheia para consulta na produção. Tem navegação entre os processos e dá para marcar os passos com o toque. A marcação é temporária: fica só na tela, some ao fechar e não é gravada.
- **Campo de insumo:** busca por SKU ou pelo nome. É só referência de qual material usar: não movimenta estoque.

## Arquivos

| Arquivo | O que é |
|---|---|
| `processos.html` | o protótipo montado (abrir este) |
| `processos.js` · `processos.css` | o código e os estilos do protótipo |
| `montar.js` | junta os estilos do app + o protótipo em um HTML |
| `anterior/` | a primeira amostra (ficha com 8 seções fixas + personalização item a item), guardada para comparação |
