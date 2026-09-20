# Projeto de Corte — ETAPA A · diagnóstico técnico e proposta de schema

**Base:** v8.105 (`394fda2d56dfac786d6499135c7aef60`) · **Data:** 19/09/2026
**Escopo desta rodada:** diagnóstico, mapa, schema, riscos.
**Não foi feito:** SQL, edição de `src/`, mudança no Supabase, mudança de versão, commit.
Referência funcional: `prototipos/corte/` (fora do build e do manifesto).

Cada item traz **CONFIRMADO NO CÓDIGO** (com arquivo:linha), **PROPOSTA**,
**RISCO** e **DECISÃO NECESSÁRIA**.

---

## 1 · Novo pedido

### CONFIRMADO NO CÓDIGO

| O quê | Onde |
|---|---|
| Abertura | `src/acoes/pedidos.js:366` — `act === "novo-pedido"` → `S.modal = { tipo: "novoPedido" }` |
| Desenho da janela | `src/componentes/modal.js:795` — bloco `m.tipo === "novoPedido"`, modal de 560 px; campos `np-sku`, `np-proc`, `np-qtd`, `np-prio`, `np-prest`, `np-obs`, `np-obs-int`, `np-num`; helper de campo `f()` em `modal.js:16` |
| Botão que salva | `modal.js:902` — `data-act="salvar-novo-pedido"` |
| **Handler que salva** | `src/acoes/pedidos.js:368–490` — `act === "salvar-novo-pedido"` |
| Montagem do pedido | `pedEsqueleto()` (`src/impressao/tabela-valores.js:119`) + `pedAplicarComuns()` (`:232`), chamados em `acoes/pedidos.js:446–458` — **as mesmas funções do caminho da Demanda** (`src/pedidos/criar.js:83–86`) |
| Fim do handler | `acoes/pedidos.js:462` `S.pedidos.push(r)` → `recalcularOP(op)` → `S.modal = { tipo: "papeis", … }` → `render()` → `await salvarTudo(…)` |

**Infraestrutura de janela sobre janela — as seis funções existem:**

| Função | Linha | Papel |
|---|---|---|
| `abrirPorCimaDaJanela(nova)` | `modal.js:414` | guarda a janela de baixo inteira em `voltarPara`; antes de sair, chama `capturarNovoPedido()` (se for a janela do pedido) e `colherDigitadoDaJanela()` |
| `capturarNovoPedido()` | `modal.js:162` | colhe os campos de identidade (SKU, processo, qtd, prioridade, número…) para `m.v` |
| `colherDigitadoDaJanela()` | `modal.js:2421` | rede genérica: colhe campo a campo o que `m.v` não carrega |
| `reporDigitadoNaJanela(g)` | `modal.js:2470` | devolve o colhido aos campos |
| `janelaReporRascunhoDaVolta()` | `modal.js:435` | roda no fim do `render()`; consome `__rascunho` uma vez |
| `reporMexidosNovoPedido(v)` | `modal.js:202` | repõe os blocos compartilhados (etapas, embalagem, embalar/mix, responsável) |

O caminho de volta já é usado em produção: `src/acoes/cadastros.js:515`
(`S.modal = S.modal?.voltarPara || null`) e `src/acoes/clique.js:913`.

### PROPOSTA
Inserir a seção **PROJETO DE CORTE** em **um único ponto** de `modal.js`, dentro
do bloco `novoPedido`, logo depois do campo **Processo** (que já só aparece
quando o SKU existe no cadastro) e antes de Quantidade/Prioridade:

```js
${(() => {
  const sku = String(v.sku || "").trim().toUpperCase();
  return (!sku || !produtoDe(sku)) ? "" : crtSecaoNoPedido(sku, v.crt);
})()}
```

`Criar agora` → `abrirPorCimaDaJanela({ tipo: "corteFicha", sku, voltaCrt: true })`.
Ao salvar a ficha: `S.modal = S.modal.voltarPara`, marcando
`S.modal.v.crt = { projetoId, versao, origem }`. **Nenhum mecanismo novo.**

### RISCO
Baixo **desde que** o caminho novo não chame `render()` direto nem monte
`S.modal` à mão (foi exatamente o defeito descrito em `modal.js:395–412`: a
janela virava outra com `voltarPara: null` e o rascunho sumia). O campo `crt`
precisa entrar em `capturarNovoPedido()` — hoje ela colhe só identidade — ou
viajar em `S.modal.v` sem passar pelo DOM (preferível: não é campo de
formulário).

### DECISÃO NECESSÁRIA
Nenhuma. Reaproveitamento confirmado.

---

## 2 · Criação da OP

### CONFIRMADO NO CÓDIGO
No avulso, `src/acoes/pedidos.js:409–413`:

```js
let op = opAtivaDe(sku);
if (!op) {
  op = { id: uid(), sku, status: "em_producao", prioridade: 4, criadoEm: iso(hoje()), origem: "manual" };
  S.ops.push(op);
}
```

No lote, o mesmo desenho em `src/pedidos/criar.js:55–61` (`opAtivaDe`, e cria
com `origem: "demanda"` quando não há OP viva). O pedido recebe `opId: op.id`
em `pedEsqueleto({ … opId … })`.

### PROPOSTA
O Projeto de Corte **não toca nessas linhas**. Ele não lê `opAtivaDe()`, não
cria OP, não altera `recalcularOP()`. O vínculo é **pedido ↔ versão**, nunca
OP ↔ versão. Se um dia a OP precisar exibir o projeto, ela o obtém pelos
pedidos dela — leitura, não escrita.

### RISCO
Nenhum nesta etapa. O risco existiria se o vínculo fosse pendurado na OP —
não é o que está proposto.

### DECISÃO NECESSÁRIA
Nenhuma.

---

## 3 · Persistência do vínculo

### CONFIRMADO NO CÓDIGO

1. **Campo desconhecido não quebra a gravação.** `src/persistencia/mapa.js:151–171`:
   campo fora de `PED_CAMPO` entra em `desconhecidos[]` **e** é copiado para
   `linha.extra` (jsonb). `extra` está em `PED_CRIAVEIS` (`mapa.js:94`) e em
   `PED_EDITAVEIS` (`mapa.js:102`).
2. **A diferença é por campo, com comparação por JSON.** `mapa.js:198–205`:
   `diferenca()` compara `JSON.stringify(a[col]) !== JSON.stringify(b[col])`.
   Um objeto dentro de `extra` entra nessa conta **inteiro**.
3. **O cutover está desligado por padrão e é reversível.** `src/persistencia/tela.js:25–58`:
   `pedidos_linha_leitura` e `pedidos_linha_escrita` vêm de `pcp_flag`, falham
   para o lado seguro (desligadas) e "desligar volta ao documento na hora —
   não existe migração de volta, porque o documento nunca deixou de ser gravado".
4. **O documento continua sendo gravado sempre** (`tela.js:842`): `pcp5:nucleo`
   é de onde `S.pedidos` é montado na abertura. Logo, **um campo no objeto do
   pedido é persistido hoje, sem tabela nenhuma**.
5. **Escrita por RPC com `operation_id` + `expected_revision`**
   (`src/persistencia/pedidos.js:249–263`), fila/outbox por ação.
6. **Coluna nova é tolerada antes da migration** — padrão `prestadora_id`
   (`persistencia/pedidos.js:60–80`): se o PostgREST recusar a coluna (42703),
   o app refaz o `select` sem ela em vez de deixar a tela vazia.
7. **Precedente de tabela satélite:** `pcp_estoque_foto` (`persistencia/auxiliares.js:130`)
   — tabela própria, lida sob demanda, fora do documento.

### PROPOSTA
**Sua preferência (`pcp_pedido_projeto_corte`) é a escolha certa**, por três
razões objetivas:

- não toca `PED_CAMPO`, `PED_CRIAVEIS`, `PED_EDITAVEIS` nem
  `pcp_pedido_do_item()` — o contrato de pedido fica **byte a byte** como está;
- o `extra` seria compartilhado com o ensaio (`telaTravaDoEnsaio`, `tela.js:64`)
  e entraria no `diferenca()` como objeto inteiro: mudar a versão do projeto
  marcaria `extra` como campo alterado, e um conflito em `extra` viraria
  conflito de tudo que estiver lá dentro;
- o snapshot é grande (a receita resolvida inteira). Dentro de `extra` ele
  viajaria em **todo** patch de pedido.

Compatibilidade, ponto a ponto:

| Requisito | Veredito |
|---|---|
| Criação | OK — grava depois de `S.pedidos.push(r)`, com o `id` do pedido já definido |
| Edição | OK — troca de projeto antes da liberação é `update` na linha do vínculo |
| Revisão otimista | OK — a tabela tem `revision` própria; o pedido **não** muda de revisão quando o vínculo muda (é uma vantagem, não um efeito colateral) |
| Conflitos | OK e mais limpo: conflito de vínculo não vira conflito de pedido |
| Pedidos antigos | OK — ausência de linha = sem projeto, que é o estado de hoje |
| Cutover atual | **Atenção**: enquanto `pedidos_linha_leitura` estiver desligada, a tela lê pedidos do documento. O vínculo **não estará no documento** — precisa de leitura própria na abertura (um `persLer` paginado, como `pcp_estoque_foto`) ou de leitura sob demanda ao abrir o pedido |

### RISCO
- **Médio:** o vínculo passa a ser a primeira informação do pedido que **não**
  vive no documento. Se o Supabase estiver fora, o pedido é criado e o vínculo
  não — a tela precisa saber dizer "projeto não registrado" em vez de mentir.
  Mitigação: escrever pela **outbox** (mesma fila das ações de pedido), para o
  vínculo sair quando a rede voltar.
- **Baixo:** ordem de gravação (pedido antes do vínculo) e FK — se a FK apontar
  para `pcp_pedido` e o cutover de escrita estiver desligado, **a linha do
  pedido pode não existir ainda na tabela**. Mitigação: FK como
  `deferrable`/sem FK rígida, ou gravar o vínculo só quando
  `telaEscreveNaTabela()` for verdadeiro, guardando-o no documento enquanto não
  for. **É a decisão 3 abaixo.**

### DECISÃO NECESSÁRIA
**(D1)** Enquanto o cutover de escrita estiver desligado, o vínculo:
**(a)** vive só no documento (campo `r.corte`) e migra para a tabela quando a
flag ligar; **(b)** vive só na tabela desde já, com FK solta; ou **(c)** os
dois (documento como fonte da tela, tabela como destino final).
Recomendo **(c)**: é o mesmo desenho que o PCP já usa para pedidos durante o
cutover, e é o único que não depende da ordem em que as flags forem ligadas.

---

## 4 · Impressão

### CONFIRMADO NO CÓDIGO — fluxo completo

```
[Pedidos] botão "Gerar papéis"           → S.modal = { tipo: "papeis", ids: […] }
   ↓  (janela com formato, largura, altura, cortar, marca, "avançar etapa")
data-act="gerar-papeis"                  → src/acoes/cadastros.js:3
   ↓  lê/salva S.cfg.formatoPapel, larguraCupom (40–78), alturaCupom (100–400),
      cortarPorPedido, marcaCorte                       cadastros.js:4–18
   ↓  const lista = listaPapeis(S.modal?.ids)           src/telas/historico.js:201
   ↓  S.modal = null; render()                          cadastros.js:21–22
   ↓  imprimir(folhaPapeis(lista, modo), modo === "cupom" ? "cupom" : null)
                                                        cadastros.js:23
        folhaPapeis(pedidos, modo)                      src/telas/historico.js:196
          → `${cab}<div class="papeis">${pedidos.map(canhoto).join("")}</div>`
        canhoto(r)                                      src/telas/historico.js:105
          → UM canhoto por pedido (a função que monta o HTML do papel)
        imprimir(html, modo)                            src/impressao/folhas.js:7
          → #folha.innerHTML = html
          → body.classList.add("imprimindo") + toggle("cupom")
          → <style id="page-cupom">@page{size:80mm ${A}mm;margin:0}
             body.imprimindo.cupom .folha{width:${L}mm !important}
             body.imprimindo.cupom .slip{width:${L}mm !important}</style>
          → classes `corta` (S.cfg.cortarPorPedido) e `marca` (S.cfg.marcaCorte)
          → window.print(); onafterprint remove tudo
```

**CSS:** `src/styles/impressao.css` — `.slip*`, `.papeis`, `.cxbox`, `.ckl`,
`.emb-*` dentro de `@media print`; ajustes de 80 mm em
`body.imprimindo.cupom .slip` (linhas 93–110).

**Onde o pedido muda de `papel` para `aberto` — dois pontos, e só dois:**

| Ponto | Onde | Quando |
|---|---|---|
| Impressão em lote | `src/acoes/cadastros.js:26–33` | dentro de `gerar-papeis`, se a caixa `#pp-avancar` estiver marcada; faz `registrar(...)`, `r.status = "aberto"`, `await salvarPedidos()` |
| Confirmação individual | `src/acoes/clique.js:379–389` | `data-papel-ok`, mesmo `registrar(...)` + `r.status = "aberto"` + `await salvarPedidos()` |

### PROPOSTA
- **ETAPA F:** uma chamada em `canhoto(r)` — `${crtBlocoDoPapel(r)}` — que
  devolve `""` quando o pedido não tem projeto. Nenhuma outra linha do canhoto
  muda; o CSS do bloco entra no `@media print` existente.
- **Congelamento (ETAPA E):** nos **dois** pontos acima, porque são os dois que
  fazem `papel → aberto`. Melhor ainda: extrair uma função
  `pedEntrouNaFila(r)` chamada pelos dois — mas isso é refatoração e, pelo
  item 3 do CLAUDE.md, não entra junto. Nesta etapa: duas chamadas iguais.

### RISCO
- **Médio:** mudar o papel de quem **não** usa Projeto de Corte. Mitigação: a
  bateria compara o HTML de `canhoto(r)` sem projeto contra a versão anterior —
  igualdade byte a byte.
- **Baixo:** o canhoto cresce e passa de dois trechos de 200 mm (no protótipo o
  SKU 470 ficou em 341 mm). Não quebra nada: a bobina é contínua e
  `cortarPorPedido` já separa por pedido.

### DECISÃO NECESSÁRIA
**(D2)** Congelar no `papel → aberto` (recomendado — é quando o papel sai e o
corte acontece) ou no envio à prestadora (`enviada`)?

---

## 5 · Schema

### Avaliação da sua proposta

| Tabela proposta | Veredito |
|---|---|
| `pcp_fita` | **Manter.** Só ela permite FK a partir das camadas; o motor genérico de cadastros (`pcp_cad_tipo`/`pcp_cad_item`) não dá integridade referencial. |
| `pcp_projeto_corte` | **Manter** — identidade permanente. |
| `pcp_projeto_corte_regra` | **Manter** — N regras por projeto, sem família no JavaScript (item 7). |
| `pcp_projeto_corte_versao` | **Manter** — imutável depois de publicada. |
| `pcp_projeto_corte_corte` | **Manter**, mas pendurado na **versão**, nunca no projeto. |
| `pcp_projeto_corte_camada` | **Manter** — filha do corte. |
| `pcp_projeto_corte_fitilho` | **Manter** — 0..1 por versão. |
| `pcp_pedido_projeto_corte` | **Manter** — vínculo + snapshot. |
| **falta** `pcp_projeto_corte_sortimento` | **Acrescentar** — sua lista não cobre Exato/Sortido-PR. |

### PROPOSTA — relações

```
pcp_fita ──┐
           ├──< pcp_projeto_corte_corte.fita_id
           └──< pcp_projeto_corte_camada.fita_id

pcp_projeto_corte ──< pcp_projeto_corte_regra        (N regras por projeto)
        │
        └──< pcp_projeto_corte_versao                (1..N versões; 1 publicada por vez)
                    ├──< pcp_projeto_corte_corte ──< pcp_projeto_corte_camada
                    ├──1 pcp_projeto_corte_fitilho
                    └──1 pcp_projeto_corte_sortimento ──< _sortimento_item

pcp_pedido ──1 pcp_pedido_projeto_corte >── pcp_projeto_corte_versao
```

#### `pcp_fita`
```
id            text PK            -- ft_…
fornecedor    text NULL
codigo        text NULL          -- código oficial do fornecedor
ref           text NULL
numero        text NULL
largura       text NULL
nome          text NOT NULL
cor           text NULL          -- família de cor
estampa       text NOT NULL DEFAULT 'lisa'   -- CHECK (estampa IN ('lisa','estampada'))
classe        text NULL          -- classificação interna (nossa)
local         text NULL          -- localização física (nossa)
obs           text NULL          -- observações (nossas)
foto_path     text NULL          -- caminho no Storage; o banco NÃO guarda bytes
ativo         bool NOT NULL DEFAULT true
origem        text NULL          -- 'manual' | 'catalogo'
importado_em  timestamptz NULL
editado       jsonb NOT NULL DEFAULT '{}'  -- campos corrigidos à mão (não sobrescrever na importação)
revision      int  NOT NULL DEFAULT 1
criado_em / atualizado_em / apagado_em
```
Índices: `unique (fornecedor, codigo) where codigo is not null and apagado_em is null`;
`index (numero)`; `index (cor)`; `index gin (to_tsvector('simple', nome||' '||coalesce(local,'')))`
para a busca única.

#### `pcp_projeto_corte`
```
id            text PK            -- prj_…
nome          text NOT NULL
escopo        text NOT NULL      -- CHECK IN ('familia','combinacao','sku')
ativo         bool NOT NULL DEFAULT true
versao_publicada_id text NULL FK -> pcp_projeto_corte_versao(id)
revision, criado_em, atualizado_em, apagado_em
```

#### `pcp_projeto_corte_regra`
```
id            text PK
projeto_id    text NOT NULL FK -> pcp_projeto_corte(id) ON DELETE CASCADE
campo         text NOT NULL DEFAULT 'sku'     -- hoje só 'sku'
operador      text NOT NULL                   -- CHECK IN ('comeca','contem','igual')
valor         text NOT NULL
ordem         int  NOT NULL DEFAULT 0
```
Índice: `(projeto_id)`; `(operador, valor)`.
**Todas as condições de uma regra são E (AND).** Duas linhas com a mesma
`ordem`… não existem: combinação = várias linhas do mesmo projeto.

#### `pcp_projeto_corte_versao`
```
id            text PK            -- prv_…
projeto_id    text NOT NULL FK -> pcp_projeto_corte(id)
versao        int  NOT NULL
status        text NOT NULL DEFAULT 'rascunho'  -- CHECK IN ('rascunho','publicada','arquivada')
publicada_em  timestamptz NULL
publicada_por uuid NULL
motivo        text NULL
criado_em
UNIQUE (projeto_id, versao)
UNIQUE (projeto_id) WHERE status = 'publicada'   -- uma publicada por vez
```
**Imutabilidade:** trigger `BEFORE UPDATE/DELETE` que recusa qualquer alteração
em versão `publicada` (e nas filhas dela), exceto `status → 'arquivada'`.
É isso que faz "editar projeto publicado cria nova versão" ser regra do banco,
não do JavaScript.

#### `pcp_projeto_corte_corte`
```
id            text PK
versao_id     text NOT NULL FK -> pcp_projeto_corte_versao(id) ON DELETE CASCADE
ordem         int  NOT NULL
fita_id       text NOT NULL FK -> pcp_fita(id)
comprimento_mm int NOT NULL CHECK (> 0)        -- inteiro em mm, sem float
tipo_corte    text NOT NULL                    -- 'reto' | '45' | 'biqueira' (tabela de domínio opcional)
qtd           int  NOT NULL DEFAULT 1 CHECK (>= 1)
identificacao text NULL
UNIQUE (versao_id, ordem)
```

#### `pcp_projeto_corte_camada`
```
id            text PK
corte_id      text NOT NULL FK -> pcp_projeto_corte_corte(id) ON DELETE CASCADE
ordem         int  NOT NULL
fita_id       text NOT NULL FK -> pcp_fita(id)
comprimento_mm int NULL                        -- NULL = igual ao corte
tipo_corte    text NULL
cortar_juntas bool NOT NULL DEFAULT true
condicao      text NULL
UNIQUE (corte_id, ordem)
```

#### `pcp_projeto_corte_fitilho`
```
versao_id     text PK FK -> pcp_projeto_corte_versao(id) ON DELETE CASCADE
partes        int  NOT NULL DEFAULT 1 CHECK (partes IN (1,2))
comprimento_mm int NOT NULL CHECK (> 0)
```
Sem linha = não usa fitilho. **Não existe "usa = false".** Fita nº 1 e corte
reto são fixos e **não** são colunas.

#### `pcp_projeto_corte_sortimento` (falta na sua lista)
```
versao_id     text PK FK -> pcp_projeto_corte_versao(id) ON DELETE CASCADE
modo          text NOT NULL       -- CHECK IN ('exato','sortido')
variedade     text NULL           -- 'liso' | 'estampado' (futuro 'misto')
```
```
pcp_projeto_corte_sortimento_item
id            text PK
versao_id     text NOT NULL FK -> pcp_projeto_corte_sortimento(versao_id) ON DELETE CASCADE
genero        text NOT NULL       -- 'macho' | 'neutro' | 'femea'
qtd           int  NOT NULL CHECK (> 0)
UNIQUE (versao_id, genero)
```
Sem linha = exato sem composição → **não aparece em lugar nenhum** (regra 16 da
sua especificação).

#### `pcp_pedido_projeto_corte`
```
pedido_id     text PK                         -- 1 projeto por pedido
projeto_id    text NOT NULL FK -> pcp_projeto_corte(id)
versao_id     text NOT NULL FK -> pcp_projeto_corte_versao(id)
origem        text NOT NULL                   -- 'familia'|'combinacao'|'sku'|'manual'
congelado_em  timestamptz NULL
snapshot      jsonb NULL                      -- receita resolvida na liberação
revision      int NOT NULL DEFAULT 1
criado_em, atualizado_em
```
Índices: `(projeto_id)`, `(versao_id)`, `(congelado_em)`.
**Sem FK rígida para `pcp_pedido`** enquanto o cutover de escrita estiver
desligado (ver decisão D1).
**Imutabilidade do congelado:** trigger que recusa `UPDATE` quando
`congelado_em IS NOT NULL` (exceto o próprio congelamento).

### RISCO
- **Médio:** 9 tabelas são mais superfície do que o protótipo precisou. O ganho
  real é integridade (FK de fita) e imutabilidade por trigger. O custo é que
  **salvar uma ficha vira transação com várias tabelas** — precisa de uma RPC
  `pcp_projeto_corte_publicar(p_projeto, p_receita jsonb, …)` que faz tudo
  dentro de uma transação, senão uma queda no meio deixa versão sem cortes.
- **Baixo:** `comprimento_mm` como inteiro muda o vocabulário do protótipo
  (que usa cm como texto). É a decisão certa (nada de float em medida), mas a
  conversão precisa de teste.

### DECISÃO NECESSÁRIA
**(D3)** Confirmar `comprimento_mm` inteiro (recomendado) ou manter cm
decimal.
**(D4)** `tipo_corte` como texto livre com CHECK, ou tabela de domínio
`pcp_corte_tipo` (permite a operação cadastrar "biqueira dupla" sem deploy)?
Recomendo tabela de domínio — o protótipo já tratava a lista como dado.

---

## 6 · Receita

### CONFIRMADO NO PROTÓTIPO (validado em uso, `prototipos/corte/corte.js`)
`corte` → `camadas[]`, `comprimento`, `tipo`, `qtd` (oculta quando 1),
`identificacao` opcional; **outro corte = outra peça física**; **outra camada =
sobreposição no mesmo corte**, com `cortar juntas` e `condição`; fitilho à
parte porque fita nº 1 e corte reto são fixos.

### PROPOSTA
O schema acima atende integralmente:
- "uma ou mais camadas" → `pcp_projeto_corte_camada` (0..N por corte);
- "quantidade" → `qtd` com default 1 (a interface some com ela quando é 1 —
  regra de exibição, não de dado);
- "identificação opcional" → `identificacao NULL`;
- fitilho separado → tabela própria, sem coluna de fita nem de tipo de corte.

### RISCO
Baixo. Único ponto de atenção: **camada sem comprimento** (`NULL` = igual ao
corte) tem de ser resolvida na leitura, não gravada duplicada — senão mudar o
corte deixa a camada desatualizada.

### DECISÃO NECESSÁRIA
Nenhuma.

---

## 7 · Família / SKU — sem família no JavaScript

### PROPOSTA
As condições ficam **em linhas de `pcp_projeto_corte_regra`**, nunca em código:

```
projeto "Família M02"       → (sku, comeca, 'M02')
projeto "M02.AD"            → (sku, comeca, 'M02.AD')
projeto "M02 + PR"          → (sku, comeca, 'M02') AND (sku, contem, 'PR')
projeto "exceção 470"       → (sku, igual,  '470')
```

**Especificidade (quem vence), calculada, não cadastrada:**

```
peso(projeto) = 1000 × nivel + soma(tamanho dos valores das condições)
   nivel: familia=1, combinacao=2, sku=3
```

A resolução é um `filter` + `sort` em memória (é o que o protótipo faz e o que
a Demanda já faz para prioridade). Vence o maior peso; empate resolve pelo
projeto mais recente. **Nenhum nome de família aparece no JavaScript.**

Para a prévia "37 SKUs serão afetados", a conta é local sobre `S.produtos` —
não precisa de servidor.

### RISCO
- **Médio:** regra em cascata invisível é exatamente o que o CLAUDE.md (8.3)
  manda tratar com cuidado. Mitigação: bateria `corte-heranca` com os casos do
  protótipo (M02 / M02.AD / 380 herdando fitilho da família 3xx / 470 exceção),
  e a ficha mostrando **de onde veio cada bloco** (já existe no protótipo).
- **Baixo:** `contem` é caro se um dia houver 50 mil SKUs. Hoje são centenas.

### DECISÃO NECESSÁRIA
**(D5)** Herança é **por bloco** (cortes / fitilho / sortimento — como o
protótipo faz: o 380 tem cortes próprios e herda o fitilho da família) ou
**tudo ou nada** (a regra mais específica substitui a receita inteira)?
Isso muda o schema: por bloco exige que a versão declare **quais blocos ela
define** (3 colunas booleanas em `pcp_projeto_corte_versao`).
**Recomendo por bloco** — foi o que você validou no protótipo.

---

## 8 · Ordem de implementação

### CONFIRMADO NO CÓDIGO
- Uma versão do PCP é um `PCP.html` montado por `node build.js` a partir de
  `src/` + `manifesto.json`, com MD5 e pasta em `versions/` (ver
  `versions/v8.105/README.md`);
- baterias ficam em `testes/*.js` e são carregadas com
  `(0,eval)(await (await fetch("testes/x.js")).text())`.

### PROPOSTA — a divisão que você escreveu está correta, com um ajuste

| Versão | Escopo | Toca `src/`? |
|---|---|---|
| **(sem versão)** | migration `147_projeto_corte.sql` + registro da fita, aplicadas no Supabase | **não** |
| **v8.106** | adaptadores puros: `src/corte/modelo.js` (resolução, peso, normalização de medida) **sem ninguém chamar**, + linha no `manifesto.json` | sim, mas sem efeito |
| v8.107 | cadastro mestre de fitas (aba, busca, CRUD, foto) | sim |
| v8.108 | Projeto de Corte: ficha, versões, regras, prévia de impacto | sim |
| v8.109 | seção no Novo pedido + criar por cima | sim |
| v8.110 | vínculo, versão, congelamento, tela do pedido salvo | sim |
| v8.111 | papel atual + bloco Projeto de Corte | sim |
| v8.112+ | importação de catálogo | sim |

**O ajuste:** "Etapa A" como você a descreveu (schema/modelo, sem mudança
visual) **não gera versão do app se não tocar `src/`** — o HTML montado sairia
idêntico e o MD5 igual ao da v8.105. Duas saídas honestas:
**(a)** a Etapa A é só banco + documento, e a v8.106 é o cadastro de fitas; ou
**(b)** a v8.106 existe e contém os **adaptadores puros** (funções sem chamador,
testáveis pela bateria, com risco praticamente nulo).

### RISCO
Baixo em (b): código não chamado não muda comportamento, mas **entra no
bundle** — o MD5 muda e a pasta `versions/v8.106/` precisa registrar o porquê.

### DECISÃO NECESSÁRIA
**(D6)** v8.106 = adaptadores puros (b) ou pular direto para o cadastro de
fitas (a)?

---

## 9 · Veredito da Etapa A

**A Etapa A está segura para virar a v8.106 — com uma ressalva e três
pendências.**

**Segura porque:**
- nada do que está proposto reescreve Pedidos, OP ou impressão;
- o vínculo em tabela separada mantém `pcp_pedido` intacto — sem mudança em
  `PED_CAMPO`, `PED_CRIAVEIS`, `PED_EDITAVEIS` ou `pcp_pedido_do_item()`;
- o mecanismo de janela sobre janela já existe, está em produção e não precisa
  de substituto;
- a criação de OP não é tocada em nenhum ponto do plano;
- pedido antigo sem vínculo continua funcionando por ausência de linha, não por
  migração.

**Ressalva:** se a Etapa A não tocar `src/`, ela **não é uma versão** — é banco
+ documento. Só vale numerar v8.106 se entrarem os adaptadores puros (D6).

**Pendências que bloqueiam a escrita do SQL:**
1. **DDL real** de `pcp_cad_tipo`, `pcp_cad_item` e `pcp_pedido` — o
   `supabase/README.md` diz que o baseline não está registrado como migration;
   preciso ver as definições instaladas para não propor coluna que já existe
   com outro nome, e para saber a convenção de `revision`/RLS das tabelas
   novas.
2. **Storage**: bucket, política e quem faz upload (o app usa `persFetch` como
   única porta; Storage é outra API — é código novo, ainda que pequeno).
3. **Decisões D1 a D6** acima.

**O que eu não fiz e continua fora:** SQL, `src/`, Supabase, versão, commit.
