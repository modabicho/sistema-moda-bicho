# v8.108 — Processos vira a casa do Projeto de Corte

**Data:** 20/09/2026
**Arquivo:** `PCP-v8.108.html`
**MD5 (LF):** `9ffcd71be18dd6a69cf3fcd0db3cfba2`
**Tamanho:** 2.156.459 bytes · 32.878 linhas
**Marcador:** `<!--PCP:8.108-->` · `VERSAO = "8.108"`
**Base:** v8.107 (`3655510abf2a51a1a35d67a7ac4d8576`)
**Banco:** migrations 147 e 148 aplicadas · `corte_escrita` = false

## Por que esta versão existe

A v8.107 entregou o Cadastro de Fitas como **aba principal do PCP**. Estava
errado: Fitas é infraestrutura do Projeto de Corte, não um módulo irmão de
Pedidos. O desenho aprovado é o do protótipo `prototipos/corte/`:

```
Cadastros
  Produtos
  Processos     ← aba principal
  Insumos
  Prestadoras

Processos
  [ Projeto de corte ] [ Fitas ]
```

Esta versão corrige **só a navegação e o desenho**. Nenhuma linha de
persistência mudou.

## Mudança

| Arquivo | O que mudou |
|---|---|
| `src/telas/processos.js` | **novo**, 106 linhas: barra de sub-abas, despacho e o estado vazio do Projeto de corte |
| `src/telas/fitas.js` | reescrito: deixa de ser tela principal e vira a área Fitas, em **cartões**, como no protótipo |
| `src/styles/fitas.css` → `src/styles/processos.css` | porte de `.pc-subs`, `.cr-fitas`, `.cr-fita*`, `.cr-foto`, `.cr-ajuda`, `.cr-int`, `.cr-tag` |
| `src/sessao/acesso.js` | `fitas` sai de `ABAS_TODAS`; `processos` entra entre Produtos e Insumos |
| `src/relatorios/relatorios.js` | título, entrada do menu, despacho e a lista de telas que vivem com a base vazia |
| `src/nucleo/utilidades.js` | `IC.fitas` → `IC.processos` |
| `src/acoes/clique.js` | entra a porta `data-proc` (sub-abas), ao lado de `data-fita` |
| `manifesto.json`, cascas | 1 CSS renomeado, 1 JS novo, versão |

## Reaproveitado sem uma linha de alteração

```
migration 147 · migration 148 · pcp_fita · as 6 RPCs
src/corte/outbox.js · src/corte/fitas.js · src/corte/modelo.js
src/persistencia/pedidos.js · src/persistencia/tela.js
testes/corte-persistencia.js
```

O `git status` prova: nenhum desses arquivos aparece como modificado. A camada
de persistência foi escrita sem saber onde a tela morava — é por isso que uma
correção de navegação não a alcançou.

## Diferenças conscientes em relação ao protótipo

| # | Protótipo | v8.108 | Por quê |
|---|---|---|---|
| 1 | Botão **Importar catálogo** | não entra | a importação é de uma versão futura; botão que não faz nada é promessa que a tela não cumpre |
| 2 | Sub-aba **OPs (simulado)** | não entra | era simulação do protótipo |
| 3 | **"em 3 regras" / "sem uso"** no cartão | não entra | não há projeto nenhum ainda: seria sempre "sem uso", precisão falsa. Volta quando a ficha existir |
| 4 | Foto do catálogo (`<img>`) | só o desenho de cor/estampa | não há bucket de Storage ainda; o placeholder colorido é o mesmo do protótipo |
| 5 | Busca filtra **a cada tecla** | botão **Buscar** e **Limpar** | filtrar ao vivo exigiria entrar nos despachantes de input do app; e o formulário não controlado foi decisão de projeto |
| 6 | Formulário da fita em **modal** | cartão dentro da área | modal exigiria entrar no sistema de janelas do app. Fica para quando a ficha do projeto precisar de janela |
| 7 | `.cr-ajuda` em `display:flex` | `display:block` | em flex, cada `<b>` vira item e abre 8px entre as palavras; o bloco é texto corrido |
| 8 | Cabeçalho sem quebra | `flex-wrap` | em tela estreita o protótipo cortava a busca |
| 9 | Título "Processos · Projeto de corte" | "Processos" | o protótipo só tinha uma tela; aqui a sub-aba ativa já diz onde você está |
| 10 | Ficha completa do projeto | estado vazio + lista de consulta | a ficha é a próxima versão |

## Testes (v8.107 × v8.108)

| Bateria | v8.107 | v8.108 |
|---|---|---|
| `corte-persistencia` | 15 ok · 0 falhas | 15 ok · 0 falhas |
| `corte-modelo` | 35 ok · 0 falhas | 35 ok · 0 falhas |
| `numeracao-pedido` | 18 ok · 0 falhas | 18 ok · 0 falhas |
| `conflito-pedido` | 8 ok · 0 falhas | 8 ok · 0 falhas |
| `datas-festivas-uniao` | 78 ok · 0 falhas | 78 ok · 0 falhas |

A `corte-persistencia` passa sem uma linha alterada — ela nunca tocou em tela,
e é essa separação que deixou a correção ser barata.

## Permissão

Processos fica **só para a administradora**: `podeAba` libera tudo para
`ehAdm()` e ninguém tem `processos` na lista de abas. Dar acesso a outra pessoa
é marcar a aba no cadastro dela — sem mudança de código.

## Riscos conhecidos

- A gravação continua sem nunca ter sido exercida contra o Supabase real:
  `corte_escrita` está desligada. O primeiro teste de verdade é ligá-la com uma
  fita de ensaio.
- O estado vazio do Projeto de corte lê `pcp_projeto_corte` direto da tela,
  porque ainda não existe `src/corte/projetos.js`. Essa leitura muda de
  endereço quando a ficha nascer.
- A v8.107 chegou a `origin/main` com a aba Fitas. Quem abriu o app naquele
  intervalo viu a aba; ela some nesta versão.

## Próximas etapas

`v8.109` ficha do Projeto de Corte (criar, versionar, herdar) · `v8.110` seção
no Novo pedido · `v8.111` vínculo e snapshot · `v8.112` bloco no papel ·
`v8.113+` importação de catálogo e foto da fita.
