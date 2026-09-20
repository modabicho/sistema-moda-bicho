# v8.109 — a ficha do Projeto de Corte

**Data:** 20/09/2026
**Arquivo:** `PCP-v8.109.html`
**MD5 (LF):** `4fb2036c11ade4c31747b2882c7494c9`
**Tamanho:** 2.233.215 bytes · 34.143 linhas
**Marcador:** `<!--PCP:8.109-->` · `VERSAO = "8.109"`
**Base:** v8.108 (`9ffcd71be18dd6a69cf3fcd0db3cfba2`)
**Banco:** migrations 147 e 148 aplicadas · `corte_escrita` = false

## Escopo

A sub-aba **Projeto de corte** passa a existir de verdade: lista de regras,
visão por SKU, ficha de edição e o resultado resolvido com a herança à mostra.
Nada de Novo pedido, OP, impressão, congelamento ou `pcp_pedido`.

## Mudança

| Arquivo | O quê |
|---|---|
| `src/corte/projetos.js` | **novo**, 482 linhas: lê as cinco tabelas, monta a forma do modelo, decide alteração material e grava pela fila |
| `src/telas/projeto-corte.js` | **novo**, 772 linhas: lista, ficha em cinco seções, resolvido e cadeia de herança |
| `testes/corte-projetos.js` | **novo**, 28 casos |
| `src/telas/processos.js` | encolheu para 44 linhas: só a barra e o despacho |
| `src/styles/processos.css` | +74 linhas: porte da ficha |
| `src/acoes/clique.js` | porta `data-pjc` |
| `manifesto.json`, cascas | 1 CSS, 2 JS, versão |

## O contrato que manda no desenho

`pcp_projeto_corte_salvar`, lido do arquivo da migration:

```sql
-- versão NOVA sempre que vier receita: publicada não se edita
if p_receita is not null then ...
```

**`p_receita: null` não cria versão.** É a alavanca de "versão nova só quando
houver alteração material": `pjMudouMaterial` compara a receita que sairia com
a da versão publicada, em forma canônica. Renomear a regra ou mexer na condição
salva sem publicar v2 — e a tela diz qual dos dois aconteceu, no toast.

Outras três coisas vieram do arquivo, não de suposição: `p_regras` não-nulo
apaga e regrava as condições (por isso condição não versiona); `p_publicar` só
age dentro do `if p_receita`; e o id da linha do corte é derivado da chave
(`versao_id || '_' || chave`) — a chave manda, nunca o contrário.

## Os invariantes, e onde cada um mora

| Invariante | Onde |
|---|---|
| família < combinação < SKU | `crtPeso`, no modelo da v8.106 — não reimplementado |
| chaves estáveis, invisíveis | nascem em `pjNovoCorte`/`pjNovaCamada`; viajam no `name` dos campos; nenhuma aparece em tela |
| herança por bloco | `cortesModo`/`fitilhoModo`/`sortimentoModo`, separados de ponta a ponta |
| ajuste parcial por chave | preservado na gravação; `ajusta` carregado do banco não vira `substitui` ao salvar |
| ausência de fitilho = ausência de linha | bloco fora de `substitui`/`ajusta` não vira chave no jsonb |
| versão publicada imutável | nunca se edita uma; salva-se outra |

## Os modos de herança, completos

A seção "2 · O que esta regra define" mostra, por bloco, os modos reais:

```
Cortes      [ herda ] [ substitui ] [ ajusta ] [ remove ]
Fitilho     [ herda ] [ substitui ] [ remove ]
Sortimento  [ herda ] [ substitui ] [ remove ]
```

`ajusta` não existe para fitilho nem sortimento: os dois são blocos de um valor
só, e ajustar parcialmente um valor único é substituí-lo.

**`remove` não é `herda`.** Herdar é deixar a regra de cima valer; remover é
dizer "aqui este bloco não existe", contra o herdado. Na ficha resolvida isso
aparece escrito — *"Removido de propósito por Exceção 380.AD — não é herança
vazia"* — em vez de o bloco simplesmente não ser desenhado.

### O editor de ajuste

Em **Cortes → ajusta**, a tela mostra a **base herdada** (resolvida a partir de
um SKU representativo, dito na tela) e, por corte, três decisões:
**Manter · Ajustar · Remover**. Em "Ajustar", campo em branco continua vindo de
cima, e o herdado aparece como placeholder — `— mantém: Reto —`, `— mantém a
herdada —`. Dá para acrescentar corte novo e mexer nas camadas pela chave
delas, com as mesmas três decisões.

O que se grava é **só a diferença**: ajustar um comprimento numa família de
dois cortes com uma camada grava **uma linha**, sem fita, sem tipo, sem
quantidade e sem camada nenhuma. Nenhuma cópia do bloco da família é
materializada — e há um caso de bateria que prova exatamente isso.

Duas armadilhas do modelo ficaram tratadas, e estão comentadas no código:
`crtMesclar` só ignora `undefined`, `null` e `""` — **`0` e `false` contam como
preenchidos**. Por isso a `ordem` de uma operação viaja com o valor herdado (0
empurraria o corte para a frente da lista) e o "cortar juntas" do ajuste tem
três estados (`""` não toca; `true`/`false` trocam).

### Um defeito achado olhando a tela

`pjRascunhoDe` preenchia os brancos com padrões (`tipoCorte: "reto"`,
`qtd: 1`, `cortarJuntas: true`) e **descartava a `operacao`**. Em `substitui`
isso é certo; em `ajusta` seria corrupção silenciosa: reabrir e salvar uma
regra transformaria "não toquei" em "troque para isto", e um `remove` viraria
`substitui` — ressuscitando o corte que a regra existia para tirar. O rascunho
passou a ser montado conforme o modo, e duas provas novas seguram isso.

## Como o rascunho sobrevive aos cliques

O formulário não é controlado, mas "Adicionar corte" redesenha a tela. Toda
ação estrutural chama `pjcColher()` antes de mexer: o DOM inteiro volta para o
rascunho, e só então a estrutura muda. Medido na bancada: digitar nome,
comprimento e identificação, clicar em "Adicionar outro corte" e encontrar os
três valores intactos, o corte antigo com a mesma chave e a camada no lugar.

## Testes

| Bateria | v8.108 | v8.109 |
|---|---|---|
| `corte-projetos` | **não existe** | **28 ok · 0 falhas** |
| `corte-persistencia` | 15 ok · 0 falhas | 15 ok · 0 falhas |
| `corte-modelo` | 35 ok · 0 falhas | 35 ok · 0 falhas |
| `numeracao-pedido` | 18 ok · 0 falhas | 18 ok · 0 falhas |
| `conflito-pedido` | 8 ok · 0 falhas | 8 ok · 0 falhas |
| `datas-festivas-uniao` | 78 ok · 0 falhas | 78 ok · 0 falhas |

## Diferenças conscientes em relação a `prototipos/corte/`

| # | Protótipo | v8.109 | Por quê |
|---|---|---|---|
| 1 | Ficha em modal de 920 px | embutida, com "← Voltar" | o modal do app está entranhado no sistema de janelas do pedido; entrar nele por esta tela é risco desproporcional |
| 2 | Busca de fita ao vivo, com sugestões | `select` de fitas | sugerir enquanto digita exige entrar nos despachantes de input; com a biblioteca pequena, o `select` resolve |
| 3 | Identificação e "partes iguais" nascem escondidas, atrás de `+` | sempre visíveis, marcadas como opcionais | os botões `+` do protótipo dependiam de estado por campo (`__uso`, `__qtd`); dois campos a mais custam menos que esse estado |
| 4 | Blocos como caixas de marcar | botões por bloco com os modos reais | a caixa só sabe dizer sim/não, e o modelo tem quatro modos |
| 4b | **Sem editor de ajuste** — o protótipo só tinha substituição | editor de operações por chave | o modelo tem ajuste parcial desde a v8.106; a tela agora cobre o modelo, e não o contrário |
| 5 | Gênero do sortimento em `select` livre | três botões (macho/neutro/femea) | é o CHECK da 147; um `select` que aceita o que o banco recusa é armadilha |
| 6 | "OPs (simulado)" e "Modo bancada" | fora | simulação do protótipo |
| 7 | Foto da fita no cartão do corte | só o texto da fita | a foto tem bucket próprio, que ainda não existe |
| 8 | `E.tiposCorte` no código | `pcp_corte_tipo` do banco | decisão D4: tipo de corte é domínio, não constante. Queda para os três semeados só quando a leitura falha |

Mantidos: o guia dos três níveis, [Regras] [Por SKU], as colunas das duas
tabelas, as cinco seções numeradas, as frases que separam "outro corte" de
"fita no mesmo corte", o fitilho sem escolha de fita nem tipo, "1 × 70 cm ·
fita nº 1 · reto", as etiquetas de origem por bloco e a cadeia dizendo o que
vale e o que foi substituído.

## Riscos conhecidos

- A gravação nunca foi exercida contra o Supabase real: `corte_escrita` está
  desligada. O primeiro teste de verdade é ligá-la com uma regra de ensaio.
- `pjCarregar` faz nove leituras na abertura da aba. Com as tabelas vazias ou
  pequenas isso é barato; quando crescerem, vira uma leitura com embutidos.
- A visão "Por SKU" resolve cada linha na hora, com teto de 200 linhas e busca.
  Acima disso a conta é por SKU visível, não pela base inteira.

## Próximas etapas

`v8.110` seção no Novo pedido · `v8.111` vínculo e snapshot · `v8.112` bloco no
papel · `v8.113+` importação de catálogo e foto da fita.

## Nota de inventário

Seis contagens de `linhas` do `manifesto.json` estavam defasadas — cinco delas
desde a v8.107/v8.108, quando editei os arquivos e não atualizei o inventário
(`nucleo/utilidades.js`, `persistencia/pedidos.js`, `persistencia/tela.js`,
`relatorios/relatorios.js`, `acoes/clique.js`). O campo é metadado: o `build.js`
concatena os arquivos inteiros e o artefato não muda por causa dele. Corrigidas
nesta versão.
