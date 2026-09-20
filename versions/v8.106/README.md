# v8.106 — Projeto de Corte, Etapa A: o modelo de herança ganha dono e bateria

**Data:** 19/09/2026
**Arquivo:** `PCP-v8.106.html` (montado por `node build.js PCP-v8.106.html`)
**MD5 (LF):** `09ce7eb67e296cac88f95021775e8f14`
**Tamanho:** 2.116.726 bytes · 32.105 linhas
**Marcador:** `<!--PCP:8.106-->` · `VERSAO = "8.106"`
**Base:** v8.105 (`394fda2d56dfac786d6499135c7aef60`)

## Escopo

Entra **só o modelo** do Projeto de Corte: `src/corte/modelo.js`, com funções
puras de resolução de herança, medida e chave. **Nenhuma função nova é chamada
por ninguém** — não há tela, tabela, gravação, migration ou mudança de
comportamento. O objetivo é a regra ter dono, versão e bateria antes de existir
interface.

Não mexido: Pedidos, OPs, impressão, Demanda, Supabase, Realtime, cadastros,
manifesto de CSS, cascas (além do número da versão).

## Mudança

| Arquivo | O que mudou |
|---|---|
| `src/corte/modelo.js` | **novo**, 230 linhas: `crtSku`, `crtMm`, `crtCm`, `crtMedida`, `crtChave`, `crtCasaCondicao`, `crtCasa`, `crtPeso`, `crtAplicaveis`, `crtMesclar`, `crtAplicarCamadas`, `crtAplicarCortes`, `crtOrdenados`, `crtResolver`, `crtTemProjeto` |
| `manifesto.json` | uma entrada nova no fim da lista de JS: `corte/modelo.js`, 230 linhas |
| `src/casca-topo.html` | `<!--PCP:8.105-->` → `<!--PCP:8.106-->` |
| `src/nucleo/config.js` | `VERSAO = "8.105"` → `"8.106"` |
| `testes/corte-modelo.js` | **novo**: bateria de 35 verificações |

**Diff do HTML montado (v8.105 → v8.106)**, completo — três hunks:

```
1c1              <!--PCP:8.105-->  →  <!--PCP:8.106-->
11134c11134      const VERSAO = "8.105";  →  "8.106"
31872a31873,32102   as 230 linhas de corte/modelo.js, no fim do bundle
```

A entrada foi para o **fim** do manifesto de propósito: o arquivo só declara
funções (hoisting garante que a posição não importa) e assim o diff do HTML é
um acréscimo puro, sem deslocar linha de nenhum arquivo existente.

## O modelo, em uma frase

`crtResolver(projetos, sku)` empilha os projetos que casam com o SKU, do mais
geral para o mais específico (`família < combinação < SKU`, peso calculado), e
aplica **bloco a bloco** (`cortes`, `fitilho`, `sortimento`) o modo declarado
pela versão: `herda`, `substitui`, `remove` ou — só para cortes — `ajusta`,
que altera por **chave** apenas os campos preenchidos e mantém o resto herdado,
inclusive as camadas.

Decisões implementadas: **D3** medida em milímetro inteiro (cm é apresentação);
**D5** herança por bloco com ajuste parcial; chave técnica estável, criada uma
vez, que não muda ao renomear nem ao reordenar.

## Por que este movimento é seguro

1. Nenhuma função do arquivo é chamada por código existente
   (`grep -o "crt[A-Za-z]*" src` fora de `src/corte/` não devolve nada);
2. o arquivo não tem efeito colateral: só declarações e três `const` com
   inicializador puro;
3. a única dependência externa é `skuNormal`, protegida por `typeof` — e é a
   função central pedida pelo item 9 do CLAUDE.md, não uma cópia;
4. as três baterias existentes dão o mesmo resultado em v8.105 e v8.106.

## Checagens estáticas

```
node --check src/corte/modelo.js          ok
node --check testes/corte-modelo.js       ok
node build.js  (v8.105, antes da mudança) → MD5 394fda2d56dfac786d6499135c7aef60  (igual ao publicado)
node build.js  (v8.106)                   → MD5 09ce7eb67e296cac88f95021775e8f14
diff v8.105 × v8.106                      → 3 hunks (acima)
```

## Testes (v8.105 × v8.106, mesmo navegador, cópia de teste, sem sessão)

| Bateria | v8.105 | v8.106 |
|---|---|---|
| `corte-modelo` | **não existe** (`crtResolver` indefinido) | **35 ok · 0 falhas** |
| `numeracao-pedido` | 18 ok · 0 falhas | 18 ok · 0 falhas |
| `conflito-pedido` | 8 ok · 0 falhas | 8 ok · 0 falhas |
| `datas-festivas-uniao` | 78 ok · 0 falhas | 78 ok · 0 falhas |

O que a `corte-modelo` prova, ponto a ponto:

1. resolução família < combinação < SKU, e SKU sem regra não puxa projeto;
2. herança **por bloco**: o 380 tem cortes e sortimento próprios e continua com
   o fitilho da família 3xx;
3. `herda` não apaga o que veio antes;
4. `substitui` troca o bloco inteiro;
5. `remove` zera o bloco sem inventar "não usa";
6. `ajusta` parcial: o M02.AD guarda 260 mm e herda fita, tipo, quantidade e
   identificação;
7. **chave estável ao renomear**: a família passa a chamar o corte de "Laço
   principal" e o ajuste do SKU continua valendo;
8. **chave estável ao reordenar/inserir**: entra um corte novo em primeiro
   lugar e o ajuste continua achando o dele;
9. **camada herdada acompanha a família**: a família troca a fita da camada e o
   SKU ajustado passa a usar a fita nova, mantendo só os 260 mm dele;
10. ajuste de camada muda só o campo tocado; `acrescenta` não apaga o herdado;
    `remove` tira só o corte da chave;
11. fitilho ausente = bloco nulo, sem entrada de origem;
12. sortimento é separado da geometria (mudar a composição não mexe em corte) e
    exato sem composição não conta como projeto;
13. SKU sem projeto devolve vazio, sem exceção; lista de projetos vazia também;
14. medida: cm → mm inteiro, mm continua mm, entrada ilegível vira `null` (não
    zero), volta só na apresentação;
15. chave nova a cada corte, com prefixo separando corte de camada;
16. pureza: `S.pedidos` e `S.modal` intactos depois da bateria inteira.

## Confirmação

O comportamento visível do PCP permanece **idêntico** ao da v8.105: o único
código novo não é chamado por lugar nenhum, e as três baterias existentes
respondem o mesmo nas duas versões.

## Riscos conhecidos

- O modelo ainda não tem consumidor: se a interface (v8.107+) divergir dele,
  a divergência só aparece lá. A bateria fixa o contrato agora.
- `crtChave` usa `crypto.randomUUID` quando existe e `Math.random` como queda;
  para identidade de corte isso basta, mas não é chave criptográfica.
- A migration **147 continua bloqueada** até o DDL real do Supabase ser lido
  (ver `docs/PROJETO_DE_CORTE_SCHEMA_FINAL.md`, §3).

## Próximas etapas

`v8.107` cadastro mestre de fitas · `v8.108` Projeto de Corte (ficha, versões,
regras) · `v8.109` seção no Novo pedido · `v8.110` vínculo e snapshot ·
`v8.111` bloco no papel · `v8.112+` importação de catálogo.
