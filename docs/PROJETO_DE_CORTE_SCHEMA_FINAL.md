# Projeto de Corte — schema final, herança, outbox, carregamento e snapshot

**Base:** v8.105 (`394fda2d56dfac786d6499135c7aef60`) · **Data:** 19/09/2026
**Decisões aplicadas:** D1 tabela como fonte oficial · D2 congela no primeiro
`papel → aberto` · D3 `comprimento_mm` inteiro · D4 tipo de corte em tabela de
domínio · D5 herança por bloco · D6 v8.106 com modelo real em `src/`.
**Não feito nesta rodada:** migration, alteração no Supabase, commit, edição de `src/`.

---

## 1 · Leitura do DDL real: o que aconteceu

Tentei, com a chave publicável que já está no código
(`src/dados/persistencia.js:38`), em modo leitura:

| Tentativa | Resposta do servidor |
|---|---|
| `GET /rest/v1/` (OpenAPI, lista tabelas e colunas) | `401 · {"message":"Secret API key required","hint":"Only secret API keys can be used for this endpoint."}` |
| `GET /rest/v1/pcp_cad_tipo?select=*&limit=1` | `401 · {"code":"42501", hint:"Grant the required privileges to the current role with: GRANT SELECT ON public.pcp_…"}` |
| idem `pcp_cad_item`, `pcp_pedido`, `pcp_flag` | mesmo `42501` |

**Conclusão técnica:** a role anônima não tem `SELECT` em nada; tudo depende de
sessão autenticada (o app exige `persToken()`, `servidor.js:46`), e a
introspecção exige chave secreta — que, pela regra do `supabase/README.md`, não
pode estar aqui. **Não consigo ler o DDL desta máquina, e não vou inventar
baseline.**

O que dá para fazer, e está abaixo: (a) o inventário **derivado do código**,
com o nível de confiança de cada item; (b) uma consulta pronta, só de leitura,
para você rodar no SQL Editor do Supabase e me devolver o resultado.

---

## 2 · Inventário derivado do código — **não é baseline**

### 2.1 `pcp_pedido` · confiança **alta**
Fonte: `src/persistencia/mapa.js`, que se declara espelho de
`pcp_pedido_do_item()` do `60-migracao.sql` ("Não é uma segunda opinião: é a
mesma, escrita do lado de cá" — `mapa.js:8-12`).

**Colunas (ordem do mapa):**
`id · numero · op_id · sku · processo · status · qtd · qtd_embalar · qtd_mix ·
qtd_conferida · qtd_segunda · qtd_defeito · prioridade · prioridade_travada ·
prestadora · prestadora_id · setor · responsavel · separada_em · enviada_em ·
retornada_em · aguardando_material · obs · campanha_id · criado_no_app ·
custo_real · mes_pagamento · mes_pagamento_auto · consumo_baixado · etapas ·
etapas_usadas · chaves · consumo_movs · extra · criado_em · ciclo`

**Só do servidor** (`mapa.js:65`): `revision · updated_at · updated_by ·
migrado_em · deleted_at · deleted_by · duplicidade_historica · arquivado_em ·
arquivado_por · prestadora_id`.
**Proibidos na criação** (`:109`): `numero · duplicidade_historica · revision · ciclo`.
**Datas** (`:121`): `separada_em, enviada_em, retornada_em` (texto ISO curto).
**Números** (`:122`): `qtd, qtd_embalar, qtd_mix, qtd_conferida, qtd_segunda, qtd_defeito, prioridade, custo_real`.
**Booleanos** (`:124`): `prioridade_travada, aguardando_material, criado_no_app, consumo_baixado, mes_pagamento_auto`.
**Trigger conhecido:** `pcp_pedido_prest_id` deriva `prestadora_id` do nome
(`mapa.js:33` e `:69`) — o app lê, nunca escreve.
**View:** `pcp_pedido_operacional` é a fonte de leitura quando o cutover liga
(`tela.js:32`).

### 2.2 `pcp_cad_tipo` · confiança **alta** (colunas), **nenhuma** (tipos/constraints)
Fonte: `cadastros.js:33` e `:37`.
`cadastro · rotulo · doc_chave · doc_lista · chave · campos · obrigatorios ·
gera_id · prefixo_id · ordem` + (migração 114) `chave_composta · doc_sublista ·
sub_chave · pai_campo`.
O app tolera as quatro últimas não existirem (`cadCarregarTipos`, `:47-52`).

### 2.3 `pcp_cad_item` · confiança **alta** (colunas)
Fonte: `cadastros.js:242` — `cadastro · id · dados · ativo · motivo · revision ·
criado_em · updated_at · extra`.
`dados` guarda só os campos declarados no registro, normalizados por
`pcp_cad_normalizar` (`cadastros.js:380`).

### 2.4 Funções/RPCs que o app chama (89 identificadores `pcp_*`)
**De pedido (escrita):** `pcp_pedido_criar · pcp_pedido_patch ·
pcp_pedido_apagar · pcp_pedido_continuar · pcp_pedido_arquivar ·
pcp_pedido_liberar_numero` (`pedidos.js:249`).
**De pedido (apoio):** `pcp_pedido_do_item · pcp_pedido_campos_criaveis ·
pcp_pedido_campos_editaveis · pcp_pedido_operacional · pcp_pedido_prest_id ·
pcp_proximo_numero · pcp_proxima_continuacao · pcp_historico_pedidos`.
**De cadastro:** `pcp_cad_criar · pcp_cad_patch · pcp_cad_apagar ·
pcp_cad_reativar · pcp_cad_remover · pcp_cad_cancelar · pcp_cad_normalizar ·
pcp_cad_do_documento · pcp_cad_painel · pcp_cad_previa · pcp_cad_vinculos`.
**De OP:** `pcp_op_criar · pcp_op_patch · pcp_op_cancelar · pcp_op_apagar ·
pcp_op_lote_previa · pcp_op_lote_remover · pcp_op_vinculos`.
**Sessão/permissão:** `pcp_eu · pcp_sou_adm · pcp_sou_da_casa · pcp_tem_adm ·
pcp_mfa_exigida · pcp_pin_definir · pcp_pin_conferir`.

### 2.5 O que **só o banco** responde
Tipos exatos, `NOT NULL`, defaults, PKs, FKs, índices, constraints, triggers,
RLS/policies, assinatura das RPCs, e se já existe algo chamado `pcp_fita`,
`pcp_projeto*` ou `pcp_corte*`.

---

## 3 · Consulta pronta (só leitura) para você rodar

No **SQL Editor** do Supabase, um bloco só; devolve uma linha JSON. Não altera
nada.

```sql
select jsonb_pretty(jsonb_build_object(
  'colunas', (select jsonb_agg(to_jsonb(c) order by c.table_name, c.ordinal_position)
     from (select table_name, ordinal_position, column_name, data_type,
                  is_nullable, column_default
             from information_schema.columns
            where table_schema='public'
              and table_name in ('pcp_pedido','pcp_cad_tipo','pcp_cad_item')) c),
  'constraints', (select jsonb_agg(to_jsonb(k))
     from (select con.conrelid::regclass::text as tabela, con.conname as nome,
                  pg_get_constraintdef(con.oid) as definicao, con.contype as tipo
             from pg_constraint con
            where con.conrelid::regclass::text in
                  ('pcp_pedido','pcp_cad_tipo','pcp_cad_item')) k),
  'indices', (select jsonb_agg(to_jsonb(i))
     from (select tablename as tabela, indexname as nome, indexdef as definicao
             from pg_indexes
            where schemaname='public'
              and tablename in ('pcp_pedido','pcp_cad_tipo','pcp_cad_item')) i),
  'triggers', (select jsonb_agg(to_jsonb(t))
     from (select c.relname as tabela, tg.tgname as nome,
                  pg_get_triggerdef(tg.oid) as definicao
             from pg_trigger tg join pg_class c on c.oid=tg.tgrelid
            where not tg.tgisinternal
              and c.relname in ('pcp_pedido','pcp_cad_tipo','pcp_cad_item')) t),
  'rls', (select jsonb_agg(to_jsonb(p))
     from (select tablename as tabela, policyname as politica, cmd, roles::text,
                  qual, with_check
             from pg_policies
            where schemaname='public'
              and tablename in ('pcp_pedido','pcp_cad_tipo','pcp_cad_item')) p),
  'funcoes_pedido', (select jsonb_agg(to_jsonb(f))
     from (select p.proname as nome,
                  pg_get_function_identity_arguments(p.oid) as argumentos,
                  pg_get_function_result(p.oid) as retorno
             from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public'
              and (p.proname like 'pcp_pedido%' or p.proname like 'pcp_cad%')) f),
  'ja_existe', (select jsonb_agg(table_name)
     from information_schema.tables
    where table_schema='public'
      and (table_name like 'pcp_fita%' or table_name like 'pcp_projeto%'
           or table_name like 'pcp_corte%'))
)) as ddl;
```

Cole o resultado aqui e eu fecho a migration 147 contra o banco de verdade.

---

## 4 · Schema final proposto

Convenções seguidas do que já existe: prefixo `pcp_`, `id text`, `revision int`,
`criado_em/updated_at`, apagado lógico, e RPC para escrita.

### 4.1 Domínio (D4)
```sql
pcp_corte_tipo
  codigo     text PK            -- 'reto' | '45' | 'biqueira' | …
  rotulo     text NOT NULL      -- 'Reto', '45°', 'Biqueira'
  ordem      int  NOT NULL DEFAULT 0
  ativo      bool NOT NULL DEFAULT true
```
Tipo novo = uma linha, sem deploy.

### 4.2 Fita
```sql
pcp_fita
  id            text PK                     -- ft_…
  fornecedor    text
  codigo        text                        -- código oficial do fornecedor
  ref           text
  numero        text
  largura_mm    int                         -- largura nominal, inteiro
  nome          text NOT NULL
  cor           text                        -- família de cor
  estampa       text NOT NULL DEFAULT 'lisa'
  classe        text                        -- nossa
  local         text                        -- nossa
  obs           text                        -- nossa
  foto_path     text                        -- caminho no Storage; bytes não
  ativo         bool NOT NULL DEFAULT true
  origem        text                        -- 'manual' | 'catalogo'
  importado_em  timestamptz
  editado       jsonb NOT NULL DEFAULT '{}' -- campos corrigidos à mão
  revision      int  NOT NULL DEFAULT 1
  criado_em     timestamptz NOT NULL DEFAULT now()
  updated_at    timestamptz
  deleted_at    timestamptz
  CHECK (estampa IN ('lisa','estampada'))
  UNIQUE (fornecedor, codigo) WHERE codigo IS NOT NULL AND deleted_at IS NULL
  INDEX (numero) · (cor) · (ativo)
  INDEX GIN (to_tsvector('simple', coalesce(nome,'')||' '||coalesce(codigo,'')||' '||
             coalesce(cor,'')||' '||coalesce(local,'')||' '||coalesce(fornecedor,'')))
```

### 4.3 Projeto, regra, versão
```sql
pcp_projeto_corte
  id                  text PK               -- prj_…
  nome                text NOT NULL
  escopo              text NOT NULL         -- 'familia' | 'combinacao' | 'sku'
  ativo               bool NOT NULL DEFAULT true
  versao_publicada_id text                  -- FK -> pcp_projeto_corte_versao(id)
  revision, criado_em, updated_at, deleted_at
  CHECK (escopo IN ('familia','combinacao','sku'))

pcp_projeto_corte_regra                     -- condições; todas em AND
  id           text PK
  projeto_id   text NOT NULL FK -> pcp_projeto_corte(id) ON DELETE CASCADE
  campo        text NOT NULL DEFAULT 'sku'
  operador     text NOT NULL                -- 'comeca' | 'contem' | 'igual'
  valor        text NOT NULL
  ordem        int  NOT NULL DEFAULT 0
  CHECK (operador IN ('comeca','contem','igual'))
  INDEX (projeto_id) · (operador, valor)

pcp_projeto_corte_versao
  id            text PK                     -- prv_…
  projeto_id    text NOT NULL FK -> pcp_projeto_corte(id)
  versao        int  NOT NULL
  status        text NOT NULL DEFAULT 'rascunho'  -- 'rascunho'|'publicada'|'arquivada'
  -- D5: quais blocos ESTA versão define, e como
  cortes_modo     text NOT NULL DEFAULT 'herda'   -- 'herda'|'substitui'|'ajusta'
  fitilho_modo    text NOT NULL DEFAULT 'herda'   -- 'herda'|'substitui'|'remove'
  sortimento_modo text NOT NULL DEFAULT 'herda'   -- 'herda'|'substitui'|'remove'
  publicada_em  timestamptz · publicada_por uuid · motivo text
  criado_em
  UNIQUE (projeto_id, versao)
  UNIQUE (projeto_id) WHERE status='publicada'
  CHECK (status IN ('rascunho','publicada','arquivada'))
  TRIGGER: recusa UPDATE/DELETE quando status='publicada'
           (exceto status → 'arquivada'), e recusa qualquer escrita nas filhas
           de uma versão publicada
```

### 4.4 Receita (filhas da **versão**, nunca do projeto)
```sql
pcp_projeto_corte_corte
  id             text PK
  versao_id      text NOT NULL FK -> pcp_projeto_corte_versao(id) ON DELETE CASCADE
  chave          text NOT NULL        -- identidade ESTÁVEL entre versões/projetos
  ordem          int  NOT NULL
  operacao       text NOT NULL DEFAULT 'define'  -- 'define'|'substitui'|'remove'|'acrescenta'
  fita_id        text FK -> pcp_fita(id)         -- NULL só quando operacao='remove'
  comprimento_mm int  CHECK (comprimento_mm > 0)
  tipo_corte     text FK -> pcp_corte_tipo(codigo)
  qtd            int  NOT NULL DEFAULT 1 CHECK (qtd >= 1)
  identificacao  text
  UNIQUE (versao_id, chave) · UNIQUE (versao_id, ordem)
  INDEX (fita_id)

pcp_projeto_corte_camada
  id             text PK
  corte_id       text NOT NULL FK -> pcp_projeto_corte_corte(id) ON DELETE CASCADE
  chave          text NOT NULL
  ordem          int  NOT NULL
  operacao       text NOT NULL DEFAULT 'define'
  fita_id        text FK -> pcp_fita(id)
  comprimento_mm int                              -- NULL = igual ao corte
  tipo_corte     text FK -> pcp_corte_tipo(codigo)
  cortar_juntas  bool NOT NULL DEFAULT true
  condicao       text
  UNIQUE (corte_id, chave) · UNIQUE (corte_id, ordem)

pcp_projeto_corte_fitilho                 -- sem linha = não usa
  versao_id      text PK FK -> pcp_projeto_corte_versao(id) ON DELETE CASCADE
  partes         int NOT NULL DEFAULT 1 CHECK (partes IN (1,2))
  comprimento_mm int NOT NULL CHECK (comprimento_mm > 0)

pcp_projeto_corte_sortimento              -- sem linha = exato, sem composição
  versao_id      text PK FK -> pcp_projeto_corte_versao(id) ON DELETE CASCADE
  modo           text NOT NULL            -- 'exato' | 'sortido'
  variedade      text                     -- 'liso' | 'estampado' (futuro 'misto')
  CHECK (modo IN ('exato','sortido'))

pcp_projeto_corte_sortimento_item
  id             text PK
  versao_id      text NOT NULL FK -> pcp_projeto_corte_sortimento(versao_id) ON DELETE CASCADE
  genero         text NOT NULL            -- 'macho' | 'neutro' | 'femea'
  qtd            int  NOT NULL CHECK (qtd > 0)
  UNIQUE (versao_id, genero)
```

### 4.5 Vínculo (D1 · D2)
```sql
pcp_pedido_projeto_corte
  pedido_id     text PK                   -- 1 projeto por pedido
  projeto_id    text NOT NULL FK -> pcp_projeto_corte(id)
  versao_id     text NOT NULL FK -> pcp_projeto_corte_versao(id)
  origem        text NOT NULL             -- 'familia'|'combinacao'|'sku'|'manual'
  congelado_em  timestamptz
  snapshot      jsonb                     -- receita RESOLVIDA, só ao congelar
  revision      int NOT NULL DEFAULT 1
  criado_em · updated_at
  INDEX (projeto_id) · (versao_id) · (congelado_em)
  CHECK ((congelado_em IS NULL) = (snapshot IS NULL))
  TRIGGER: com congelado_em preenchido, recusa UPDATE de projeto_id/versao_id/snapshot
```
**Sem FK para `pcp_pedido`** enquanto `pedidos_linha_escrita` estiver
desligada: o pedido pode ainda não existir na tabela. Quando a flag ligar,
acrescenta-se a FK em migration própria.

### 4.6 RPCs novas (escrita sempre por RPC, como o resto)
| RPC | Assinatura |
|---|---|
| `pcp_projeto_corte_salvar` | `(p_projeto jsonb, p_regras jsonb, p_receita jsonb, p_publicar bool, p_expected_revision int, p_operation_id uuid)` — **transacional**: cria/atualiza projeto, regras, versão e filhas de uma vez |
| `pcp_projeto_corte_arquivar` | `(p_id text, p_expected_revision int, p_operation_id uuid)` |
| `pcp_pedido_corte_vincular` | `(p_pedido_id text, p_projeto_id text, p_versao_id text, p_origem text, p_expected_revision int, p_operation_id uuid)` |
| `pcp_pedido_corte_congelar` | `(p_pedido_id text, p_snapshot jsonb, p_operation_id uuid)` — **idempotente**: se já congelado, devolve o existente sem alterar |
| `pcp_fita_salvar` / `pcp_fita_apagar` | padrão dos cadastros |

### 4.7 Comparação com o que já existe

| Existente | Como o novo se relaciona |
|---|---|
| `pcp_pedido` | **intacta** — nenhuma coluna nova, nenhum campo novo em `PED_CAMPO`, `PED_CRIAVEIS`, `PED_EDITAVEIS`, `pcp_pedido_do_item()` |
| `pcp_op` | **intacta** — o vínculo é do pedido |
| `pcp_cad_tipo` / `pcp_cad_item` | **não usados** para fita (D: tabela própria, por causa das FKs); nenhum registro novo |
| `pcp_flag` | **uma flag nova**, `corte_escrita`, para ligar a gravação depois da leitura |
| Outbox / `PX_RPC` | ganha 4 tipos de ação (§6) |
| `pcp_pedido_operacional` (view) | **intacta**; o vínculo é lido à parte (§7) |

---

## 5 · Blocos de herança (D5, detalhado)

### 5.1 Quais blocos são herdáveis
| Bloco | Herdável | Modos |
|---|---|---|
| `cortes` (receita) | **sim** | `herda` · `substitui` · **`ajusta`** |
| `fitilho` | **sim** | `herda` · `substitui` · `remove` |
| `sortimento` | **sim** | `herda` · `substitui` · `remove` |
| `regras/condições` | **não** | condição **seleciona** qual projeto se aplica; não se herda. Um projeto de SKU não "herda a condição" da família — ele vence por ser mais específico |

`remove` existe porque "o SKU não usa fitilho, embora a família use" precisa ser
dizível sem inventar `usa = false`.

### 5.2 Herança parcial dentro dos cortes — sem copiar tudo
Cada corte e cada camada tem **`chave`**: identidade estável (`laco-liso`,
`perna-direita`, `sobreposta-1`). Com `cortes_modo = 'ajusta'`, a versão do SKU
guarda **só as diferenças**, uma linha por operação:

| `operacao` | Efeito sobre o herdado |
|---|---|
| `substitui` | troca os campos preenchidos do corte de mesma `chave` (campo `NULL` = mantém o herdado) |
| `acrescenta` | corte novo, que não existe na base |
| `remove` | tira da receita o corte de mesma `chave` |
| `define` | usado quando `cortes_modo='substitui'`: a lista é a receita inteira |

**Exemplo real do protótipo** — família `M02` define 1 corte (`laco`,
nº 9, 220 mm, reto); o SKU `M02.AD` só muda o comprimento:

```
versao(M02.AD).cortes_modo = 'ajusta'
  corte: chave='laco', operacao='substitui', comprimento_mm=260
         (fita_id, tipo_corte, qtd, identificacao = NULL → herdados)
```
Trocar a fita da família depois muda o M02.AD junto — que é o comportamento
desejado, e é impossível se o SKU copiar a receita inteira.

Camadas seguem a mesma regra dentro do corte: `chave` + `operacao`, aplicadas
depois da resolução do corte pai.

### 5.3 Ordem de resolução (a mesma do protótipo, agora com ajuste)
```
1. projetos aplicáveis ao SKU  = regras casam (AND dentro do projeto)
2. ordena por peso = 1000 × nivel + Σ tamanho dos valores
      nivel: familia=1, combinacao=2, sku=3
3. bloco a bloco, do mais geral para o mais específico:
      'substitui' → o bloco passa a ser o desta versão
      'ajusta'    → aplica as operações sobre o que veio antes
      'remove'    → o bloco deixa de existir
      'herda'     → não faz nada
4. resultado = receita resolvida + de onde veio cada bloco (para a ficha)
```

### 5.4 Risco
`ajusta` é o ponto mais delicado do modelo: é o que permite não copiar, e é o
que pode virar regra invisível. Mitigação já prevista: a ficha mostra, por
bloco e por corte, **se veio herdado, ajustado ou próprio** — e a bateria
`corte-heranca` cobre os quatro casos do protótipo (M02, M02.AD, 380 herdando
fitilho da família 3xx, 470 exceção).

---

## 6 · Estratégia de outbox

### CONFIRMADO NO CÓDIGO
- `obEnfileirar(tipo, entidadeId, dados)` é **genérico** (`outbox.js:44`), grava
  em `localStorage` (`pcp5:outbox`, máx. 500) e sobrevive ao navegador;
- `pxEnviar(acao)` traduz `acao.tipo` por `PX_RPC` e devolve
  `{status:"invalido"}` para tipo desconhecido (`pedidos.js:259-260`);
- **`pxDrenar()` só roda quando `telaEscreveNaTabela()` é verdadeiro**
  (`tela.js:566`) — hoje, com o cutover desligado, a fila **não é drenada**;
- o reenvio automático do ciclo de 15 s (`ui/render-de-fundo.js:146-160`) trata
  **seções do documento**, não ações da outbox.

### PROPOSTA
1. **Mesma fila** (um lugar só que sobrevive ao navegador), com 4 tipos novos
   registrados em `PX_RPC`:
   `corte_projeto_salvar · corte_projeto_arquivar · corte_uso_vincular · corte_uso_congelar`;
2. **drenagem própria e independente do cutover de pedidos:** `cxDrenar()`,
   que envia **apenas** ações `corte_*`, chamada (a) na abertura, (b) no ciclo
   de 15 s quando houver pendência, (c) logo após cada gravação;
3. **`pxDrenar()` passa a ignorar ações `corte_*`** (uma linha de filtro) —
   sem isso, quando o cutover de pedidos ligar, ele tentaria enviar ação de
   corte e a marcaria como `parada`;
4. mesma disciplina de id: `operation_id` nasce com a ação; retry leva o mesmo
   id; intenção nova leva id novo.

### RISCO
**Médio-baixo.** O ponto de atenção é o item 3: é alteração em arquivo de
pedidos (`pedidos.js`), ainda que de uma linha. Alternativa sem tocar em
pedidos: fila separada (`pcp5:outbox-corte`), ao custo de parametrizar
`outbox.js`. **Recomendo a fila única com o filtro**, e a bateria cobrindo
"ação de corte não é enviada pelo drenador de pedidos".

---

## 7 · Carregamento junto ao pedido

### PROPOSTA (D1 · uma fonte só, cache em memória)
- **Na abertura**, depois dos pedidos: `persLer("pcp_pedido_projeto_corte?select=*")`
  paginado (mesmo padrão de `pxListar`, `PX_PAGINA = 1000`), para
  `S.corteUso = Map(pedido_id → vínculo)`. Com ~1.600 pedidos, é **uma**
  requisição;
- **o documento não guarda o vínculo.** Se um espelho no documento for
  necessário para alguma tela legada, ele é **derivado** e marcado como tal —
  nunca autoridade, nunca base de diff;
- **invalidação:** depois de cada gravação confirmada, e ao abrir a janela de um
  pedido (releitura de uma linha só, `?pedido_id=eq.…`);
- **falha de leitura não quebra tela:** sem o cache, a seção mostra
  "não consegui ler o vínculo agora" — nunca "sem projeto", que seria mentira;
- **Realtime:** fora desta etapa. O vínculo muda pouco e a releitura por pedido
  cobre o caso real.

### RISCO
**Baixo.** O risco de verdade seria o espelho no documento virar autoridade —
que a decisão D1 já proíbe, e que a bateria deve verificar ("mudar o documento
à mão não muda o que a tela mostra").

---

## 8 · Momento exato do snapshot (D2)

### CONFIRMADO NO CÓDIGO — `papel → aberto` acontece em dois lugares, e só dois
| Onde | Arquivo | Condição |
|---|---|---|
| Impressão em lote | `src/acoes/cadastros.js:26-33` | dentro de `gerar-papeis`, se `#pp-avancar` estiver marcada; faz `registrar(...)`, `r.status = "aberto"`, e no fim `await salvarPedidos()` |
| Confirmação individual | `src/acoes/clique.js:379-389` | `data-papel-ok`; mesma sequência |

### PROPOSTA
Nos dois pontos, **imediatamente antes** de `r.status = "aberto"`:

```js
if (r.status === "papel") await crtCongelar(r);   /* idempotente */
```

`crtCongelar(r)`:
1. se já existe `congelado_em` para o pedido → **não faz nada** (primeiro papel
   manda; reimpressão não recongela);
2. resolve a receita **agora** (mesma função da ficha e do papel);
3. enfileira `corte_uso_congelar` com `snapshot` + `congelado_em`;
4. atualiza o cache em memória, para o papel que está sendo impresso **já sair
   com a versão congelada**.

Ordem importa: congelar **antes** de mudar o status e antes de `imprimir(...)`
em `cadastros.js` — assim o canhoto impresso e o snapshot são a mesma coisa.

### RISCO
- **Baixo/médio:** offline no momento do congelamento. O `snapshot` vai para a
  outbox e sobe depois; o papel sai com a receita correta porque ela foi
  resolvida localmente. O que **não** pode acontecer é o status virar `aberto`
  sem a ação de congelamento enfileirada — por isso a chamada vem antes.
- **Baixo:** pedido criado antes da v8.110 e impresso depois: não tem vínculo,
  `crtCongelar` não faz nada, o papel sai como hoje.

---

## 9 · O que falta para começar a v8.106

**Bloqueia a migration (não bloqueia a v8.106):** o resultado da consulta do §3.

**v8.106 — conteúdo proposto** (modelo real em `src/`, sem interface):
| Arquivo | O que entra |
|---|---|
| `src/corte/modelo.js` (novo) | `crtPeso()`, `crtAplicaSku()`, `crtResolver()` (blocos + `ajusta`), `crtMm()`/`crtCm()` (D3), `crtChave()`, tudo **função pura**, sem estado global e **sem chamador** |
| `manifesto.json` | uma entrada, depois de `produtos/identidade.js` |
| `src/casca-topo.html` · `src/nucleo/config.js` | `8.105` → `8.106` |
| `testes/corte-modelo.js` (novo) | bateria própria: herança por bloco, `ajusta` por chave, precedência, mm↔cm, casos M02 / M02.AD / 380 / 427 / 470 |
| `versions/v8.106/README.md` | versão, MD5, diff, testes, riscos |

Efeito no comportamento: **nenhum** — código não chamado. O que muda é o MD5,
e a v8.106 passa a ter bateria própria, como você pediu.

**Confirmações que peço antes de escrever a v8.106:**
1. o nome do módulo — proponho `corte` (`src/corte/`, prefixo `crt`), porque
   `processos` colide com `viewProcessos`, que hoje é a **Conferência**;
2. `chave` de corte gerada a partir da identificação (`laço liso` → `laco-liso`)
   ou sequencial estável (`c1`, `c2`)? Recomendo derivar da identificação e cair
   para sequencial quando ela não existir.
