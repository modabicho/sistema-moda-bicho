« v8.93 · a aba Hoje saiu inteira »

`entrega-v893/PCP-v8.93.html` · md5 **`e07b7890839cc4d98c54590f16e81472`** · 30.971 linhas
(a v8.92 tinha 31.633 — **662 linhas a menos**)
Bateria nova `testes/v893-sem-hoje.js` — **65 ok · 0 falhas**

**O binário da v8.92 não foi tocado** — `c7866c5ccf059758923bb99a1ce3d2f7` continua o mesmo.

Suas duas decisões, aplicadas como vieram:
**"Meu trabalho agora" morreu junto com o Hoje** · **a aba padrão passou a ser Pedidos**.

---

# 1 · O levantamento, antes de apagar

## 1.1 · O que era exclusivo do Hoje

| item | onde estava na v8.92 |
|---|---|
| item do menu | `relatorios.js:416` — `["painel", "Hoje", null]` |
| entrada em `ABAS_TODAS` | `acesso.js:2` — `["painel", "Hoje"]`, o **primeiro** da lista |
| mapa de views | `relatorios.js:492` — `painel: viewPainel` |
| título da tela | `relatorios.js:297` — `TITULOS.painel` |
| **função que renderiza** | `telas/painel.js` · `viewPainel()` |
| helpers exclusivos | `painelFluxo()` · `hojeExcecoes()` · `hojeGargalos()` · `painelAdm()` — **os quatro só usados dentro do próprio arquivo** |
| estado exclusivo | `S.meuTrab.comoEquipe` (`estado.js:105`) · `S.aba = "painel"` (`estado.js:59`) |
| handlers | `data-pipe` (`clique.js:105`) · `data-mtgrupo` (`clique.js:112`) · `ver-como-equipe` / `ver-como-adm` (`sistema.js:8-9`) |
| ícone | `IC.painel` (`utilidades.js:193`) |
| CSS exclusivo | `.hj-*` · `.passo-fluxo` · `.fluxo` · `.pc/.pn/.pt/.pv/.ps` · `.t-hoje` · `.mt-*` · `.pos` — espalhado por **quatro** folhas |
| aba padrão | `estado.js:59` · `abas.js:136` · `acoes/pedidos.js:337` e `:357` · `ABAS_PADRAO_OPERACAO` |
| barra mobile | `relatorios.js:455` — `acha("painel")` era o **primeiro** dos três fixos |
| navegação que levava lá | busca rápida (varre `ABAS_TODAS`), trilho, barra mobile, `restaurarAba()` |

**Atalho de teclado: não existia.** `?`, `a`, `n`, `d`, `p`, `t`, `f` — nenhum apontava para o Hoje.

## 1.2 · O que o `data-pipe` fazia — e por que não se perde nada

A barra de urgências do Hoje levava para a aba Pedidos com o filtro já posto: `atraso`,
`atrasoconf`, `avisar`, `adiantar`, `material`, `problema`, `demanda`, `papel`, `fila`,
`cortando`, `prestadora`, `andamento`. Fui conferir se algum desses filtros **só** era
alcançável por ali. Não é: `telas/pedidos.js:310-331` tem a própria fileira de alertas
(`data-fe`), que cobre **os sete**:

```
fila (críticos) · atraso · adiantar · atrasoconf · avisar · material · problema
```

e os chips de etapa cobrem `papel · fila · cortando · prestadora · chegou · andamento`.
O bloco C2 da bateria nova roda os **oito** filtros de exceção um a um e exige que
nenhum estoure.

**Uma sobra honesta:** o filtro `cobrar` (`pedidos.js:152`) **já não tinha entrada** na
v8.92 — o passo 6 do Hoje apontava para `atraso`, não para `cobrar`. Não é algo que a
remoção criou; é código morto que já estava lá. Deixei como está e registro aqui.

## 1.3 · O que estava dentro do módulo mas era de outro dono

Você mandou olhar isso com atenção depois da v8.92. Olhei, e desta vez **a direção é a
inversa**:

**`telas/painel.js` é 100% dele mesmo** — as cinco funções, nenhuma usada fora do arquivo.
Nada a mover.

**`telas/meu-trabalho.js` também não exportava nada para fora** — conferi os 15 nomes de
topo (`MT_FAIXAS`, `mtEhHoje`, `mtItens`, `mtFaixa`, `mtOrdem`, `mtTom`, `MT_ETIQUETA`,
`mtMotivoPedido`, `mtAcaoPedido`, `mtLinha`, `MT_TETO_AGORA`, `mtGrupoDe`, `mtGrupos`,
`mtAberto`, `viewMeuTrabalho`) e **os 15 dão zero usos fora dos dois arquivos**. Ele
*consome* `vazio`, `thumb`, `pessoa` e `avatar`, que são de outros donos e ficaram.

**O que era ao contrário:** `viewMeuTrabalho()` mora em `meu-trabalho.js`, mas **o único
lugar do app que a chamava era `painel.js:16`**. A aba Tarefas nunca usou essa função —
ela usa `viewTarefas()`, que vive em `telas/pedidos.js:601`. Era a tela do Hoje para quem
não é ADM, e por isso é ela, e não a aba Tarefas, que sai junto. Foi a decisão que você
tomou.

## 1.4 · O risco de tela branca, medido antes

`relatorios.js:483` faz `const [t, sub] = TITULOS[S.aba];` — **desestruturação direta**.
Com `painel` fora de `TITULOS`, qualquer caminho que deixasse `S.aba = "painel"` não
degradaria: dá `undefined is not iterable` e a tela fica branca na hora. Eram cinco
caminhos, e o pior deles é o navegador de quem já usa o app com `pcp:aba = "painel"`
guardado.

Esse crash **está provado**: a bateria da v8.92, rodada sem ajuste na v8.93, acusou
exatamente `"erro:undefined is not iterable"` ao forçar `S.aba = "painel"`. É por isso que
a rede de segurança abaixo não é enfeite.

---

# 2 · O que foi feito

## 2.1 · Removido

| arquivo | o que saiu |
|---|---|
| `telas/painel.js` | **apagado** · 267 linhas |
| `telas/meu-trabalho.js` | **apagado** · 215 linhas |
| `manifesto.json` | as duas entradas |
| `relatorios/relatorios.js` | título, item do menu, mapa de views, barra mobile |
| `sessao/acesso.js` | `["painel","Hoje"]` de `ABAS_TODAS`; `"painel"` de `ABAS_PADRAO_OPERACAO` |
| `nucleo/estado.js` | `S.meuTrab` inteiro; `aba: "painel"` → `aba: ABA_PADRAO` |
| `acoes/clique.js` | handlers `data-pipe` e `data-mtgrupo` |
| `acoes/sistema.js` | `ver-como-equipe` e `ver-como-adm` |
| `nucleo/utilidades.js` | `IC.painel` |
| `ui/abas.js` | `S.aba = "painel"` ao fechar a última aba |
| `acoes/pedidos.js` | os dois `S.aba = "painel"` (entrar e sair) |
| `styles/telas.css` | 515 → **375** linhas (`.mt-*`, `.hj-*`, `.t-hoje`, `.fluxo`) |
| `styles/gramatica.css` | 548 → **532** (`.passo-fluxo`, `.fluxo`) |
| `styles/impressao.css` | 296 → **284** (`.passo-fluxo`, `.fluxo`, `.pos`, `.hj-barra` do `@media print`) |
| `styles/refino.css` | 382 → **381** |
| `componentes/modal.js` | o texto "nenhuma marcada = só **Hoje**, Pedidos e Tarefas" |

## 2.2 · A aba de partida

Você escolheu **sempre Pedidos**. Foi o que ficou — com uma rede de segurança de uma
linha, porque você mesma pediu "sem tela branca" e Pedidos não é de todo mundo:

```js
/* sessao/acesso.js */
const ABA_PADRAO = "pedidos";
const abaPadrao = () => (typeof podeAba === "function" && !podeAba(ABA_PADRAO))
  ? ((ABAS_TODAS.find(([id]) => podeAba(id)) || [ABA_PADRAO])[0]) : ABA_PADRAO;
```

Para 99% dos casos ela devolve `"pedidos"` e ponto. Ela só faz outra coisa quando a
pessoa **não pode abrir Pedidos** — por exemplo, alguém com acesso só a Tarefas. O bloco
B2 da bateria prova os dois lados.

`restaurarAba()` não precisou mudar: ele já exigia que a aba salva existisse em
`ABAS_TODAS`. Com `painel` fora da lista, um `pcp:aba = "painel"` guardado é simplesmente
recusado e o app fica na aba de partida.

## 2.3 · A barra do celular

Era `Hoje · Pedidos · Tarefas · Mais`. Ficou:

```js
const fixos = [acha("pedidos")  || acha("tarefas"),
               acha("tarefas")  || acha("demanda"),
               acha("demanda")  || acha("conferencia") || acha("compras")]
```

**Pedidos · Tarefas · Demanda · Mais** — quatro alvos, com o mesmo encadeamento de
reserva que já existia, para a barra nunca ficar com buraco. Medido no bloco D, com
viewport de telefone (390×780).

## 2.4 · O que NÃO foi tocado

Você disse: retirar a view Hoje, não os cálculos que usam a data de hoje. Ficaram todos,
e o bloco C prova um a um:

| o que | por quê |
|---|---|
| `hoje()` · `iso()` · `dias()` · `fdate()` | a **data** de hoje — usada em ~30 arquivos |
| `mtEhHoje` | morreu junto, mas era do módulo Hoje, não regra de negócio |
| `REL_PERIODOS` com `["hoje", "Hoje"]` | o filtro de período dos Relatórios |
| `S.relView.painel`, `REL_PAINEIS`, `relPainelGeral`, `relPainelProducao` | são os painéis **internos** da aba Relatórios — nome parecido, dono outro |
| `.fb-painel` | o painel de "Mais filtros" de Pedidos e Demanda |
| `viewTarefas` e a aba Tarefas | intactos |

---

# 3 · A busca depois · o que sobrou e por quê

`viewPainel`, `painelFluxo`, `hojeExcecoes`, `hojeGargalos`, `painelAdm`,
`viewMeuTrabalho`, `meuTrab`, `data-pipe`, `data-mtgrupo`, `ver-como-equipe`,
`ver-como-adm`, `mtItens`, `MT_*`, `IC.painel` — **zero ocorrências em código**.

Sobrou `ABAS_PADRAO_OPERACAO`, que é legítimo e agora vale `["pedidos", "tarefas"]`.

Reescrevi quatro comentários que descreviam o mundo antigo:
`presenca.js:274` ("volta para o Hoje"), `abas.js:158` ("uma tela fora da lista (Hoje,
Dados, Equipe)"), `pedidos/criar.js:261` ('o alerta "críticos na fila" do painel') e o
bloco da barra mobile em `relatorios.js`.

---

# 4 · A bateria nova · 65 ok · 0 falhas

`testes/v893-sem-hoje.js`, em quatro blocos.

**A · o que saiu** (14) — versão 8.93 · aba fora do menu · rótulo "Hoje" fora do trilho ·
fora de `ABAS_TODAS` · **fora de `TITULOS`** · `S.meuTrab` inexistente · **nenhuma das 19
funções do módulo sobrou** · `IC.painel` fora · zero `data-pipe` · zero `data-mtgrupo` ·
zero "ver como a equipe" · **zero regras CSS de `.hj-` / `.mt-` / `.passo-fluxo` /
`.t-hoje` / `.fluxo`, lidas do `document.styleSheets` do binário** · o app abre em Pedidos
· zero erros no boot.

**B · a queda sem tela branca** (10):

| caso | resultado |
|---|---|
| navegador com `pcp:aba = "painel"` guardado | cai em **Pedidos**, tela desenha, zero erros |
| operadora que só pode abrir Tarefas | `podeAba("pedidos")` falso → `abaPadrao()` devolve **`tarefas`** |
| fechar a última aba interna | aba válida, tela desenha |
| sair da conta | volta para Pedidos |
| **toda aba de `ABAS_TODAS` tem título** | nada desestrutura `undefined` |

**C · o que não podia ir junto** (31) — as seis views vivas · a data de hoje intacta e
`iso(hoje())` rodando · o período "Hoje" dos Relatórios · os painéis internos dos
Relatórios · `toast`/`renderDeFundo`/`vazioLinha`/`calcular` · `setorDoPedido`/
`corteCurto`/`tagMaterial`/`chipPresenca` · **os sete alertas da aba Pedidos e os oito
filtros de exceção** · **as 14 telas restantes desenhando** · `+ Novo pedido` abrindo com
SKU e número · a busca rápida não oferecendo mais o Hoje.

**D · mobile** (9) — barra com quatro alvos, sem buraco · Hoje fora dela **e fora da folha
do "Mais"** · ordem `pedidos · tarefas · demanda · menu-mais` · com `painel` salvo o
telefone também cai em Pedidos · zero erros.

---

# 5 · Regressão dirigida · v8.92 × v8.93

| bateria | v8.92 | v8.93 | regressão nova? |
|---|---|---|---|
| `janelas` (as janelas) | 507 · 0 | **507 · 0** | não |
| `baseline-numeracao` | 37 · 0 | **37 · 0** | não |
| `novopedido-pisca` | 31 · 0 | **31 · 0** | não |
| `v890-repintar-nao-reabre` | 16 · 0 | **16 · 0** | não |
| `v884-janela-por-cima` | 36 · 0 | **36 · 0** | não |
| `modal-fecha-ou-nao` | 28 · 0 | **28 · 0** | não |
| `v886-prioridade-e-embalar` | 19 · 0 | **19 · 0** | não |
| `dois-bugs-chip-e-tamanho` | 11 · 0 | **11 · 0** | não |
| `etapas-usadas-contrato` | 21 · 0 | **21 · 0** | não |
| `v891-abrir-sem-piscar` | 26 · 0 | **26 · 0** | não |
| `render-em-excesso` | 8 · 0 | **8 · 0** | não |
| `v885-janela-fecha` | 7 · 0 | **7 · 0** | não |
| `conflito-falso` | 12 · 0 | **12 · 0** | não |
| `demanda-guarda-remocao` | 37 · 0 | **37 · 0** | não |
| **`v892-sem-notificacoes`** | 42 · 0 | **41 · 0** | **não** — um teste a menos é a tela `painel`, que deixou de existir |
| `abas-de-tela-estado` | 44 · 2 | **44 · 2** | não *(ver abaixo)* |
| `conflito-revisao` | 39 · 2 | **39 · 2** | não |
| `v893-sem-hoje` (nova) | — | **65 · 0** | — |

`conflito-falso` e `conflito-revisao` verdes importam: a proteção por revisão e
`p_expected_revision` **não foram tocadas**.

## 5.1 · Três bancadas que eu reescrevi — e não o produto

Digo isto explicitamente porque é o tipo de coisa que dá para esconder:

- **`abas-de-tela-estado`** foi para 42 · **4**. As duas falhas novas eram os testes 1.4 e
  4.0, que navegavam para o Hoje como exemplo de "área sem aba". Troquei o exemplo por
  **Produtos** (`ABAS_COM_ABA` = pedidos, demanda, conferencia, compras). Voltou a
  44 · 2 — **e dá 44 · 2 também na v8.92 com a bancada nova**, que é a prova de que eu
  não ajustei o teste ao binário novo.
- **`v892-sem-notificacoes`** prendia a versão em `"8.92"`, chamava `mtItens()` e
  desenhava a tela `painel`. Passou a aceitar 8.92 **ou mais nova**, a medir a aba Tarefas
  pelo que ela desenha (e só checar `mtItens` onde ela existir) e a montar a lista de
  telas a partir de `ABAS_TODAS`. Verde nas duas versões.
- **`presenca`** fazia `S.aba = 'painel'` na semeadura — e foi ela que me mostrou o crash
  do `TITULOS`. Trocado por `'pedidos'`. Depois disso ela quebra **exatamente igual** nas
  duas versões (4 falhas antigas sobre o chip de presença), então: baseline antigo.

## 5.2 · Baseline antigo · quebram igual nas duas, parei de investigar

| bateria | v8.92 | v8.93 |
|---|---|---|
| `abas-de-tela-estado` 3.4 e 8.4 | falham | **igual** |
| `conflito-revisao` 10.1 e 10.2 | falham | **igual** |
| `presenca` (4 testes do chip) | falham | **igual** |
| `criar-pedidos` | estoura em `[data-plan="0"]` | **igual** |

## 5.3 · Uma bancada aposentada

`testes/meu-trabalho.js` media a tela que você mandou deixar morrer. Renomeei para
**`meu-trabalho.RETIRADO.js`** com um cabeçalho dizendo por quê e para onde foi a
cobertura (`v893-sem-hoje.js` bloco C3 e `v892-sem-notificacoes.js` bloco B3). Não apaguei
— o arquivo continua sendo o registro do que aquela tela fazia.

---

| arquivo | o que é |
|---|---|
| `entrega-v893/PCP-v8.93.html` | md5 `e07b7890839cc4d98c54590f16e81472` |
| `testes/v893-sem-hoje.js` | os quatro blocos · **65 ok · 0** |
| `testes/meu-trabalho.RETIRADO.js` | a bancada da tela que saiu, guardada como registro |
