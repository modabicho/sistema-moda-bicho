-- ===========================================================================
-- 147_projeto_corte.sql · Projeto de Corte — estrutura, RLS e RPCs
-- ---------------------------------------------------------------------------
-- Baseline real lido no Supabase em 19-20/09/2026:
--   · pcp_pedido.id = text · pcp_cad_item.id = text
--   · pcp_cad_item PK = (cadastro, id) · pcp_cad_tipo PK = cadastro
--   · RLS ligada; leitura = authenticated + pcp_sou_da_casa(); authenticated
--     tem SELECT nas três tabelas
--   · pcp_pedido tem revision, updated_at, updated_by, extra, ciclo,
--     arquivado_em, arquivado_por, prestadora_id, ultima_operacao
--   · triggers de pcp_pedido: pcp_extra_nao_perde_t, pcp_pedido_carimbo_t,
--     pcp_pedido_mes_travado_t, pcp_pedido_operacao_t, pcp_pedido_prest_id
--   · JÁ EXISTE o ledger compartilhado pcp_operacao + pcp_operacao_registrar()
--     + pcp_recusa_reuso(), usado por pcp_pedido_*, pcp_cad_*, pcp_op_*,
--     estoque, insumos, posse, semiacabados e ciclos — 117.665 operações com
--     resultado gravado. Infraestrutura madura.
--   · não existe nenhum objeto pcp_fita*, pcp_projeto*, pcp_corte*
--
-- O QUE ESTA MIGRATION NÃO FAZ
--   · não altera pcp_pedido, pcp_op, pcp_cad_tipo, pcp_cad_item — nenhuma
--     coluna, índice, trigger ou policy;
--   · NÃO cria ledger de operação: usa o pcp_operacao que já existe, com as
--     funções que já existem. Um segundo ledger seria um contrato paralelo;
--   · não depende de nenhuma função pcp_pedido_*: o carimbo de revisão e a
--     marca de operação na linha são do módulo;
--   · não cria FK para pcp_pedido: enquanto `pedidos_linha_escrita` estiver
--     desligada o pedido pode não existir na tabela. A FK entra no cutover;
--   · não cria bucket de Storage nem flag `corte_escrita` — v8.107;
--   · não mexe em RPC existente e não move dado nenhum.
--
-- IDEMPOTÊNCIA · o contrato é o do PCP, copiado de pcp_pedido_patch
--   Toda RPC mutável segue esta ordem, e a ordem é parte do contrato:
--     1. permissão;
--     2. o que pode dar `invalido` é validado ANTES de registrar — é assim que
--        "recusa por validação não queima o operation_id" continua verdade
--        (pcp_cad_patch faz igual);
--     3. pcp_operacao_registrar(op, tipo, entidade, entidade_id, intencao);
--          estado 'reutilizada' → return pcp_recusa_reuso(v_reg)
--          estado 'duplicada'   → devolve o resultado anterior + duplicada:true
--          estado 'nova'        → segue
--     4. o efeito;
--     5. update pcp_operacao set resultado = v_res;
--     6. return v_res.
--   Registro e efeito na MESMA transação: se a transação cair, o registro cai
--   junto e o retry é um retry de verdade, não uma segunda aplicação.
--
--   `tipo`     · corte_fita_salvar, corte_fita_apagar, corte_projeto_salvar,
--                corte_projeto_arquivar, corte_vincular, corte_congelar
--   `entidade` · fita, projeto_corte, pedido_corte
--
-- CONVENÇÕES SEGUIDAS DO QUE JÁ EXISTE
--   · id `text` gerado no app com prefixo (ft_, prj_, prv_, ct_, cm_), como o
--     pedido — é isso que deixa a outbox reenviar a mesma ação sem duplicar;
--   · revision + updated_at + updated_by por linha, carimbados por trigger;
--     escrita sempre por RPC com p_expected_revision;
--   · `ultima_operacao` na linha é AUDITORIA ("quem mexeu por último"), lida do
--     mesmo `pcp.operacao` que pcp_operacao_registrar já publica na transação;
--   · RLS ligada, SELECT para authenticated com pcp_sou_da_casa(), e NENHUMA
--     policy de escrita: gravar é só pelas RPCs security definer.
--
-- ORDEM DE CRIAÇÃO (as dependências mandam)
--    1 guarda de reexecução
--    2 funções de carimbo e de marca de operação
--    3 idempotência — nada a criar (ver a seção)
--    4 pcp_corte_tipo + seeds        (domínio, ninguém depende dele ainda)
--    5 pcp_fita                      (referenciada pela receita)
--    6 pcp_projeto_corte             (sem a FK da versão publicada)
--    7 pcp_projeto_corte_regra
--    8 pcp_projeto_corte_versao  → e só então a FK de 6 para 8 (circular)
--    9 receita: corte → camada → fitilho → sortimento → sortimento_item
--   10 pcp_pedido_projeto_corte
--   11 triggers de imutabilidade
--   12 guarda do rollback (função, usada pelo rollback e pelo ensaio)
--   13 RLS, policies e grants
--   14 RPCs e grants de execução
--
-- REVERSÃO: supabase/migrations/147_projeto_corte_rollback.sql
-- CONFERÊNCIA (só leitura): supabase/diagnostico/147_smoke.sql
-- ENSAIO (escreve e desfaz):  supabase/diagnostico/147_ensaio.sql
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · guarda: tudo aqui é IF NOT EXISTS / OR REPLACE, mas o aviso é honesto
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.pcp_fita') is not null then
    raise notice '147: pcp_fita ja existe — nada sera recriado; rode o smoke antes de confiar';
  end if;
  -- o módulo depende da infraestrutura compartilhada: se ela não estiver aqui,
  -- é melhor parar agora do que descobrir na primeira gravação
  if to_regclass('public.pcp_operacao') is null then
    raise exception '147 abortada: pcp_operacao nao existe neste banco';
  end if;
  if (select count(distinct p.proname) <> 2
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('pcp_operacao_registrar','pcp_recusa_reuso')) then
    raise exception '147 abortada: falta pcp_operacao_registrar ou pcp_recusa_reuso';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2 · carimbo e marca de operação — do MÓDULO, sem depender de pcp_pedido_*
-- ---------------------------------------------------------------------------

-- revisão e auditoria: mesma ideia do carimbo do pedido, escrita aqui.
create or replace function public.pcp_corte_carimbo()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.revision  := 1;
    new.criado_em := coalesce(new.criado_em, now());
  else
    new.revision  := coalesce(old.revision, 0) + 1;
    new.criado_em := old.criado_em;               -- criação não se reescreve
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- Carimbo de AUDITORIA do operation_id na linha: responde "quem mexeu por
-- último" no suporte. Lê `pcp.operacao`, que pcp_operacao_registrar já publica
-- na transação — por isso a RPC não precisa anunciar nada por conta própria.
-- Não é o mecanismo de idempotência: esse é pcp_operacao (§3).
create or replace function public.pcp_corte_marca_operacao()
returns trigger
language plpgsql
as $$
declare v_op text := nullif(current_setting('pcp.operacao', true), '');
begin
  if v_op is not null then
    new.ultima_operacao := v_op::uuid;
  elsif tg_op = 'UPDATE' then
    new.ultima_operacao := old.ultima_operacao;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 3 · IDEMPOTÊNCIA · nada a criar aqui, e isso é uma decisão
--     A autoridade é `pcp_operacao`, com pcp_operacao_registrar() e
--     pcp_recusa_reuso(). São compartilhadas com pedido, cadastro, OP,
--     estoque, insumos, posse, semiacabados e ciclos.
--     Um ledger só do corte teria outra tabela, outra purga, outro jeito de
--     investigar um retry e duas verdades sobre a mesma pergunta. O módulo
--     entra no que já funciona; o uso é conferido pelo smoke.
--     A purga também já existe do lado de lá (pcp_operacao_idade_ix).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 4 · domínio dos tipos de corte (D4: tabela, não CHECK fechado)
-- ---------------------------------------------------------------------------
create table if not exists public.pcp_corte_tipo (
  codigo  text primary key check (codigo <> ''),
  rotulo  text not null,
  ordem   int  not null default 0,
  ativo   boolean not null default true
);

-- seeds: só os três que a bancada usa hoje. Reexecutar não sobrescreve rótulo
-- que alguém tenha corrigido depois.
insert into public.pcp_corte_tipo (codigo, rotulo, ordem) values
  ('reto',     'Reto',     1),
  ('45',       '45°',      2),
  ('biqueira', 'Biqueira', 3)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
-- 5 · FITA · cadastro mestre. A foto fica no Storage; aqui só o caminho.
-- ---------------------------------------------------------------------------
create table if not exists public.pcp_fita (
  id              text primary key check (id <> ''),
  fornecedor      text,
  codigo          text,                       -- código oficial do fornecedor
  ref             text,
  numero          text,
  largura_mm      int check (largura_mm is null or largura_mm > 0),
  nome            text not null check (nome <> ''),
  cor             text,
  estampa         text not null default 'lisa' check (estampa in ('lisa','estampada')),
  classe          text,                       -- classificação interna (nossa)
  local           text,                       -- localização física (nossa)
  obs             text,                       -- observações (nossas)
  foto_path       text,                       -- caminho no Storage (bucket vem depois)
  ativo           boolean not null default true,
  origem          text check (origem is null or origem in ('manual','catalogo')),
  importado_em    timestamptz,
  -- campos corrigidos à mão: importação futura NÃO os sobrescreve sozinha
  editado         jsonb not null default '{}'::jsonb,
  revision        int not null default 1,
  ultima_operacao uuid,                       -- auditoria; autoridade é pcp_operacao
  criado_em       timestamptz not null default now(),
  updated_at      timestamptz,
  updated_by      uuid,
  deleted_at      timestamptz,
  deleted_by      uuid
);

-- o mesmo código do mesmo fornecedor não entra duas vezes; fita sem código pode
create unique index if not exists pcp_fita_forn_codigo_uk
  on public.pcp_fita (fornecedor, codigo)
  where codigo is not null and deleted_at is null;
create index if not exists pcp_fita_numero_ix on public.pcp_fita (numero);
create index if not exists pcp_fita_cor_ix    on public.pcp_fita (cor);
create index if not exists pcp_fita_ativo_ix  on public.pcp_fita (ativo) where deleted_at is null;
-- busca única (código, nome, cor, lugar, fornecedor) em um campo só
create index if not exists pcp_fita_busca_ix on public.pcp_fita
  using gin (to_tsvector('simple',
    coalesce(nome,'') || ' ' || coalesce(codigo,'') || ' ' || coalesce(ref,'') || ' ' ||
    coalesce(cor,'') || ' ' || coalesce(local,'') || ' ' || coalesce(fornecedor,'')));

drop trigger if exists pcp_fita_carimbo_t  on public.pcp_fita;
drop trigger if exists pcp_fita_operacao_t on public.pcp_fita;
create trigger pcp_fita_carimbo_t  before insert or update on public.pcp_fita
  for each row execute function public.pcp_corte_carimbo();
create trigger pcp_fita_operacao_t before insert or update on public.pcp_fita
  for each row execute function public.pcp_corte_marca_operacao();

-- ---------------------------------------------------------------------------
-- 6 · PROJETO · identidade permanente
-- ---------------------------------------------------------------------------
create table if not exists public.pcp_projeto_corte (
  id                  text primary key check (id <> ''),
  nome                text not null check (nome <> ''),
  escopo              text not null check (escopo in ('familia','combinacao','sku')),
  ativo               boolean not null default true,
  versao_publicada_id text,                    -- FK adiada: a versão nasce depois
  revision            int not null default 1,
  ultima_operacao     uuid,
  criado_em           timestamptz not null default now(),
  updated_at          timestamptz,
  updated_by          uuid,
  deleted_at          timestamptz,
  deleted_by          uuid
);
create index if not exists pcp_projeto_corte_escopo_ix
  on public.pcp_projeto_corte (escopo) where deleted_at is null and ativo;

drop trigger if exists pcp_projeto_corte_carimbo_t  on public.pcp_projeto_corte;
drop trigger if exists pcp_projeto_corte_operacao_t on public.pcp_projeto_corte;
create trigger pcp_projeto_corte_carimbo_t  before insert or update on public.pcp_projeto_corte
  for each row execute function public.pcp_corte_carimbo();
create trigger pcp_projeto_corte_operacao_t before insert or update on public.pcp_projeto_corte
  for each row execute function public.pcp_corte_marca_operacao();

-- ---------------------------------------------------------------------------
-- 7 · REGRA · as condições. Nenhuma família mora no código: aqui é dado.
--     Todas as condições de um projeto valem em E (AND).
--     Pertencem ao PROJETO, não à versão: mudar o recorte não cria versão.
-- ---------------------------------------------------------------------------
create table if not exists public.pcp_projeto_corte_regra (
  id         text primary key check (id <> ''),
  projeto_id text not null references public.pcp_projeto_corte(id) on delete cascade,
  campo      text not null default 'sku',
  operador   text not null check (operador in ('comeca','contem','igual')),
  valor      text not null check (valor <> ''),
  ordem      int  not null default 0
);
create index if not exists pcp_projeto_corte_regra_projeto_ix
  on public.pcp_projeto_corte_regra (projeto_id);
create index if not exists pcp_projeto_corte_regra_valor_ix
  on public.pcp_projeto_corte_regra (operador, valor);

-- ---------------------------------------------------------------------------
-- 8 · VERSÃO · publicada é imutável. Editar projeto publicado cria versão nova.
--     `*_modo` é a herança por bloco (D5).
-- ---------------------------------------------------------------------------
create table if not exists public.pcp_projeto_corte_versao (
  id              text primary key check (id <> ''),
  projeto_id      text not null references public.pcp_projeto_corte(id) on delete cascade,
  versao          int  not null check (versao > 0),
  status          text not null default 'rascunho'
                  check (status in ('rascunho','publicada','arquivada')),
  cortes_modo     text not null default 'herda'
                  check (cortes_modo in ('herda','substitui','ajusta','remove')),
  fitilho_modo    text not null default 'herda'
                  check (fitilho_modo in ('herda','substitui','remove')),
  sortimento_modo text not null default 'herda'
                  check (sortimento_modo in ('herda','substitui','remove')),
  motivo          text,
  publicada_em    timestamptz,
  publicada_por   uuid,
  criado_em       timestamptz not null default now(),
  criado_por      uuid,
  constraint pcp_projeto_corte_versao_uk unique (projeto_id, versao)
);
-- uma publicada por projeto, no máximo — garantido pelo banco, não pela tela
create unique index if not exists pcp_projeto_corte_versao_pub_uk
  on public.pcp_projeto_corte_versao (projeto_id) where status = 'publicada';

-- a circular resolvida: projeto → versão publicada
alter table public.pcp_projeto_corte
  drop constraint if exists pcp_projeto_corte_versao_fk;
alter table public.pcp_projeto_corte
  add constraint pcp_projeto_corte_versao_fk
  foreign key (versao_publicada_id) references public.pcp_projeto_corte_versao(id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- 9 · RECEITA · filhas da VERSÃO, nunca do projeto.
--     `chave` = identidade estável do corte/camada: nasce uma vez, não muda ao
--     renomear nem ao reordenar — é ela que faz a herança parcial funcionar.
--     `ordem` é apresentação. `operacao` é o ajuste sobre o herdado.
-- ---------------------------------------------------------------------------
create table if not exists public.pcp_projeto_corte_corte (
  id             text primary key check (id <> ''),
  versao_id      text not null references public.pcp_projeto_corte_versao(id) on delete cascade,
  chave          text not null check (chave <> ''),
  ordem          int  not null default 0,
  operacao       text not null default 'define'
                 check (operacao in ('define','substitui','acrescenta','remove')),
  fita_id        text references public.pcp_fita(id),
  comprimento_mm int  check (comprimento_mm is null or comprimento_mm > 0),
  tipo_corte     text references public.pcp_corte_tipo(codigo),
  qtd            int  check (qtd is null or qtd >= 1),
  identificacao  text,
  constraint pcp_projeto_corte_corte_chave_uk unique (versao_id, chave),
  -- corte que nasce precisa de fita; ajuste e remoção, não
  constraint pcp_projeto_corte_corte_fita_ck
    check (operacao <> 'define' or fita_id is not null)
);
create index if not exists pcp_projeto_corte_corte_versao_ix
  on public.pcp_projeto_corte_corte (versao_id, ordem);
create index if not exists pcp_projeto_corte_corte_fita_ix
  on public.pcp_projeto_corte_corte (fita_id);

create table if not exists public.pcp_projeto_corte_camada (
  id             text primary key check (id <> ''),
  corte_id       text not null references public.pcp_projeto_corte_corte(id) on delete cascade,
  chave          text not null check (chave <> ''),
  ordem          int  not null default 0,
  operacao       text not null default 'define'
                 check (operacao in ('define','substitui','acrescenta','remove')),
  fita_id        text references public.pcp_fita(id),
  comprimento_mm int  check (comprimento_mm is null or comprimento_mm > 0), -- null = igual ao corte
  tipo_corte     text references public.pcp_corte_tipo(codigo),
  cortar_juntas  boolean,
  condicao       text,
  constraint pcp_projeto_corte_camada_chave_uk unique (corte_id, chave),
  constraint pcp_projeto_corte_camada_fita_ck
    check (operacao <> 'define' or fita_id is not null)
);
create index if not exists pcp_projeto_corte_camada_corte_ix
  on public.pcp_projeto_corte_camada (corte_id, ordem);
create index if not exists pcp_projeto_corte_camada_fita_ix
  on public.pcp_projeto_corte_camada (fita_id);

-- fitilho: fita nº 1 e corte reto são FIXOS e por isso não são colunas.
-- sem linha = não usa. Não existe "usa = false".
create table if not exists public.pcp_projeto_corte_fitilho (
  versao_id      text primary key references public.pcp_projeto_corte_versao(id) on delete cascade,
  partes         int not null default 1 check (partes in (1,2)),
  comprimento_mm int not null check (comprimento_mm > 0)
);

-- sortimento: separado da geometria. Sem linha = exato, sem composição.
create table if not exists public.pcp_projeto_corte_sortimento (
  versao_id  text primary key references public.pcp_projeto_corte_versao(id) on delete cascade,
  modo       text not null check (modo in ('exato','sortido')),
  variedade  text check (variedade is null or variedade in ('liso','estampado','misto'))
);

create table if not exists public.pcp_projeto_corte_sortimento_item (
  id        text primary key check (id <> ''),
  versao_id text not null references public.pcp_projeto_corte_sortimento(versao_id) on delete cascade,
  genero    text not null check (genero in ('macho','neutro','femea')),
  qtd       int  not null check (qtd > 0),
  constraint pcp_projeto_corte_sortimento_item_uk unique (versao_id, genero)
);

-- ---------------------------------------------------------------------------
-- 10 · VÍNCULO pedido ↔ versão. Fonte oficial (D1).
--      SEM FK para pcp_pedido enquanto o cutover de escrita estiver desligado.
--      Congelado (D2) não muda mais: pedido antigo nunca muda retroativamente.
-- ---------------------------------------------------------------------------
create table if not exists public.pcp_pedido_projeto_corte (
  pedido_id       text primary key check (pedido_id <> ''),
  projeto_id      text not null references public.pcp_projeto_corte(id),
  versao_id       text not null references public.pcp_projeto_corte_versao(id),
  origem          text not null check (origem in ('familia','combinacao','sku','manual')),
  congelado_em    timestamptz,
  snapshot        jsonb,
  revision        int not null default 1,
  ultima_operacao uuid,
  criado_em       timestamptz not null default now(),
  updated_at      timestamptz,
  updated_by      uuid,
  -- congelado e foto existem juntos ou não existem
  constraint pcp_pedido_projeto_corte_snapshot_ck
    check ((congelado_em is null) = (snapshot is null))
);
create index if not exists pcp_pedido_projeto_corte_projeto_ix
  on public.pcp_pedido_projeto_corte (projeto_id);
create index if not exists pcp_pedido_projeto_corte_versao_ix
  on public.pcp_pedido_projeto_corte (versao_id);
create index if not exists pcp_pedido_projeto_corte_congelado_ix
  on public.pcp_pedido_projeto_corte (congelado_em);

drop trigger if exists pcp_pedido_projeto_corte_carimbo_t  on public.pcp_pedido_projeto_corte;
drop trigger if exists pcp_pedido_projeto_corte_operacao_t on public.pcp_pedido_projeto_corte;
create trigger pcp_pedido_projeto_corte_carimbo_t
  before insert or update on public.pcp_pedido_projeto_corte
  for each row execute function public.pcp_corte_carimbo();
create trigger pcp_pedido_projeto_corte_operacao_t
  before insert or update on public.pcp_pedido_projeto_corte
  for each row execute function public.pcp_corte_marca_operacao();

-- ---------------------------------------------------------------------------
-- 11 · IMUTABILIDADE · é isto que faz "editar projeto publicado cria versão
--      nova" ser regra do banco, e não promessa do JavaScript.
-- ---------------------------------------------------------------------------
create or replace function public.pcp_corte_versao_imutavel()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'publicada' then
      raise exception 'versao-publicada-imutavel: % v%', old.projeto_id, old.versao;
    end if;
    return old;
  end if;
  if old.status = 'publicada' then
    -- a única mudança permitida é aposentar a versão
    if new.status = 'arquivada'
       and new.projeto_id is not distinct from old.projeto_id
       and new.versao is not distinct from old.versao
       and new.cortes_modo is not distinct from old.cortes_modo
       and new.fitilho_modo is not distinct from old.fitilho_modo
       and new.sortimento_modo is not distinct from old.sortimento_modo then
      return new;
    end if;
    raise exception 'versao-publicada-imutavel: % v%', old.projeto_id, old.versao;
  end if;
  return new;
end $$;

drop trigger if exists pcp_projeto_corte_versao_imutavel_t on public.pcp_projeto_corte_versao;
create trigger pcp_projeto_corte_versao_imutavel_t
  before update or delete on public.pcp_projeto_corte_versao
  for each row execute function public.pcp_corte_versao_imutavel();

-- filhas: recusam escrita quando a versão dona já está publicada
create or replace function public.pcp_corte_filha_imutavel()
returns trigger
language plpgsql
as $$
declare
  v_versao text;
  v_status text;
  v_linha  record;
begin
  -- NEW não existe em DELETE e OLD não existe em INSERT: em PL/pgSQL, tocar no
  -- campo do que não foi atribuído é erro de execução, não null. Por isso a
  -- linha é escolhida por TG_OP antes de qualquer campo ser lido.
  if tg_op = 'DELETE' then v_linha := old; else v_linha := new; end if;

  if tg_table_name = 'pcp_projeto_corte_camada' then
    select c.versao_id into v_versao
      from public.pcp_projeto_corte_corte c
     where c.id = v_linha.corte_id;
  else
    v_versao := v_linha.versao_id;
  end if;

  select status into v_status
    from public.pcp_projeto_corte_versao where id = v_versao;

  if v_status = 'publicada' then
    raise exception 'versao-publicada-imutavel: receita de % nao pode mudar', v_versao;
  end if;
  return v_linha;
end $$;

do $$
declare t text;
begin
  foreach t in array array['pcp_projeto_corte_corte','pcp_projeto_corte_camada',
                           'pcp_projeto_corte_fitilho','pcp_projeto_corte_sortimento',
                           'pcp_projeto_corte_sortimento_item']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_imutavel_t', t);
    execute format('create trigger %I before insert or update or delete on public.%I
                    for each row execute function public.pcp_corte_filha_imutavel()',
                   t || '_imutavel_t', t);
  end loop;
end $$;

create or replace function public.pcp_pedido_corte_congelado_imutavel()
returns trigger
language plpgsql
as $$
begin
  if old.congelado_em is not null then
    if new.projeto_id   is distinct from old.projeto_id
       or new.versao_id is distinct from old.versao_id
       or new.snapshot  is distinct from old.snapshot
       or new.congelado_em is distinct from old.congelado_em then
      raise exception 'vinculo-congelado: pedido % ja foi liberado', old.pedido_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists pcp_pedido_projeto_corte_congelado_t on public.pcp_pedido_projeto_corte;
create trigger pcp_pedido_projeto_corte_congelado_t
  before update on public.pcp_pedido_projeto_corte
  for each row execute function public.pcp_pedido_corte_congelado_imutavel();

-- ---------------------------------------------------------------------------
-- 12 · GUARDA DO ROLLBACK · só conta e recusa; não apaga nada.
--      Mora aqui, e não dentro do arquivo de rollback, por dois motivos: o
--      rollback e o ensaio usam a MESMA regra, e assim a guarda é testável.
--      Qualquer dado operacional em qualquer tabela do módulo trava o
--      rollback. pcp_corte_tipo fica de fora: só tem os seeds do domínio.
--      De pcp_operacao ela olha SOMENTE as entidades do corte — a tabela é
--      infraestrutura compartilhada, e as 117 mil operações dos outros módulos
--      não têm nada a ver com este rollback.
--      É SECURITY DEFINER de propósito: sob RLS, uma sessão que não passe em
--      pcp_sou_da_casa() contaria zero linha e liberaria o rollback com dado
--      dentro. A guarda precisa enxergar o banco inteiro para poder recusar.
-- ---------------------------------------------------------------------------
create or replace function public.pcp_corte_rollback_guarda()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t       text;
  n       bigint;
  achados jsonb := '{}'::jsonb;
  total   bigint := 0;
begin
  foreach t in array array['pcp_fita','pcp_projeto_corte','pcp_projeto_corte_regra',
                           'pcp_projeto_corte_versao','pcp_projeto_corte_corte',
                           'pcp_projeto_corte_camada','pcp_projeto_corte_fitilho',
                           'pcp_projeto_corte_sortimento','pcp_projeto_corte_sortimento_item',
                           'pcp_pedido_projeto_corte']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then
        achados := achados || jsonb_build_object(t, n);
        total := total + n;
      end if;
    end if;
  end loop;

  -- do ledger compartilhado, só o que é do corte
  select count(*) into n from public.pcp_operacao
   where entidade in ('fita','projeto_corte','pedido_corte');
  if n > 0 then
    achados := achados || jsonb_build_object('pcp_operacao (entidades do corte)', n);
    total := total + n;
  end if;

  if total > 0 then
    raise exception using
      errcode = 'raise_exception',
      message = 'rollback 147 recusado: existe dado operacional no modulo',
      detail  = achados::text,
      hint    = 'Destruir dado real exige backup e um rollback manual proprio, '
                'escrito para aquele caso. Este arquivo nao faz isso.';
  end if;
  return jsonb_build_object('status','ok','vazio',true);
end $$;

-- ---------------------------------------------------------------------------
-- 13 · RLS, POLICIES e GRANTS · a mesma regra das três tabelas do baseline.
--      pcp_operacao não entra: já tem RLS própria e não é nossa.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['pcp_corte_tipo','pcp_fita','pcp_projeto_corte',
                           'pcp_projeto_corte_regra','pcp_projeto_corte_versao',
                           'pcp_projeto_corte_corte','pcp_projeto_corte_camada',
                           'pcp_projeto_corte_fitilho','pcp_projeto_corte_sortimento',
                           'pcp_projeto_corte_sortimento_item','pcp_pedido_projeto_corte']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_leitura', t);
    execute format('create policy %I on public.%I for select to authenticated
                    using (public.pcp_sou_da_casa())', t || '_leitura', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 14 · RPCs · o contrato é o de pcp_pedido_patch, passo a passo:
--      permissão → validação que dá `invalido` → pcp_operacao_registrar →
--      reutilizada/duplicada → efeito → grava resultado → devolve.
-- ---------------------------------------------------------------------------

-- 14.1 · fita
create or replace function public.pcp_fita_salvar(
  p_dados jsonb, p_expected_revision int default null, p_operation_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   text := nullif(p_dados->>'id','');
  v_rev  int;
  v_reg  jsonb;
  v_res  jsonb;
begin
  if not public.pcp_sou_da_casa() then raise exception 'sem-permissao'; end if;

  -- validação ANTES do registro: `invalido` não queima o operation_id
  if v_id is null then
    return jsonb_build_object('status','invalido','motivo','id obrigatorio');
  end if;
  if coalesce(nullif(p_dados->>'nome',''), '') = '' then
    return jsonb_build_object('status','invalido','motivo','nome obrigatorio');
  end if;

  if p_operation_id is not null then
    v_reg := public.pcp_operacao_registrar(p_operation_id, 'corte_fita_salvar',
               'fita', v_id, jsonb_build_object('dados', p_dados, 'rev', p_expected_revision));
    if v_reg->>'estado' = 'reutilizada' then
      return public.pcp_recusa_reuso(v_reg);
    end if;
    if v_reg->>'estado' = 'duplicada' then
      return coalesce(v_reg->'resultado', jsonb_build_object('status','em-andamento'))
             || jsonb_build_object('duplicada', true);
    end if;
  end if;

  select revision into v_rev from public.pcp_fita where id = v_id;

  if v_rev is null then
    insert into public.pcp_fita (id, fornecedor, codigo, ref, numero, largura_mm, nome, cor,
      estampa, classe, local, obs, foto_path, ativo, origem, importado_em, editado)
    values (v_id, p_dados->>'fornecedor', p_dados->>'codigo', p_dados->>'ref', p_dados->>'numero',
      (p_dados->>'largura_mm')::int, p_dados->>'nome', p_dados->>'cor',
      coalesce(p_dados->>'estampa','lisa'), p_dados->>'classe', p_dados->>'local', p_dados->>'obs',
      p_dados->>'foto_path', coalesce((p_dados->>'ativo')::boolean, true), p_dados->>'origem',
      (p_dados->>'importado_em')::timestamptz, coalesce(p_dados->'editado','{}'::jsonb));
    select revision into v_rev from public.pcp_fita where id = v_id;
    v_res := jsonb_build_object('status','ok','id',v_id,'revision',v_rev);

  elsif p_expected_revision is not null and p_expected_revision <> v_rev then
    v_res := jsonb_build_object('status','conflito','id',v_id,'revision',v_rev);

  else
    update public.pcp_fita set
      fornecedor = coalesce(p_dados->>'fornecedor', fornecedor),
      codigo     = coalesce(p_dados->>'codigo', codigo),
      ref        = coalesce(p_dados->>'ref', ref),
      numero     = coalesce(p_dados->>'numero', numero),
      largura_mm = coalesce((p_dados->>'largura_mm')::int, largura_mm),
      nome       = coalesce(p_dados->>'nome', nome),
      cor        = coalesce(p_dados->>'cor', cor),
      estampa    = coalesce(p_dados->>'estampa', estampa),
      classe     = coalesce(p_dados->>'classe', classe),
      local      = coalesce(p_dados->>'local', local),
      obs        = coalesce(p_dados->>'obs', obs),
      foto_path  = coalesce(p_dados->>'foto_path', foto_path),
      ativo      = coalesce((p_dados->>'ativo')::boolean, ativo),
      editado    = coalesce(p_dados->'editado', editado)
    where id = v_id;
    select revision into v_rev from public.pcp_fita where id = v_id;
    v_res := jsonb_build_object('status','ok','id',v_id,'revision',v_rev);
  end if;

  if p_operation_id is not null then
    update public.pcp_operacao set resultado = v_res where operation_id = p_operation_id;
  end if;
  return v_res;
end $$;

create or replace function public.pcp_fita_apagar(
  p_id text, p_expected_revision int default null, p_operation_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_rev int; v_uso int; v_reg jsonb; v_res jsonb;
begin
  if not public.pcp_sou_da_casa() then raise exception 'sem-permissao'; end if;

  if coalesce(p_id,'') = '' then
    return jsonb_build_object('status','invalido','motivo','id obrigatorio');
  end if;

  if p_operation_id is not null then
    v_reg := public.pcp_operacao_registrar(p_operation_id, 'corte_fita_apagar',
               'fita', p_id, jsonb_build_object('rev', p_expected_revision));
    if v_reg->>'estado' = 'reutilizada' then
      return public.pcp_recusa_reuso(v_reg);
    end if;
    if v_reg->>'estado' = 'duplicada' then
      return coalesce(v_reg->'resultado', jsonb_build_object('status','em-andamento'))
             || jsonb_build_object('duplicada', true);
    end if;
  end if;

  select revision into v_rev from public.pcp_fita where id = p_id and deleted_at is null;
  -- fita em uso não some: a receita que a referencia ficaria órfã
  select count(*) into v_uso from (
    select 1 from public.pcp_projeto_corte_corte  where fita_id = p_id
    union all
    select 1 from public.pcp_projeto_corte_camada where fita_id = p_id) u;

  if v_rev is null then
    v_res := jsonb_build_object('status','nao-encontrado','id',p_id);
  elsif p_expected_revision is not null and p_expected_revision <> v_rev then
    v_res := jsonb_build_object('status','conflito','id',p_id,'revision',v_rev);
  elsif v_uso > 0 then
    v_res := jsonb_build_object('status','em-uso','id',p_id,'quantos',v_uso);
  else
    update public.pcp_fita
       set deleted_at = now(), deleted_by = auth.uid(), ativo = false
     where id = p_id;
    v_res := jsonb_build_object('status','ok','id',p_id);
  end if;

  if p_operation_id is not null then
    update public.pcp_operacao set resultado = v_res where operation_id = p_operation_id;
  end if;
  return v_res;
end $$;

-- 14.2 · projeto + versão + receita, em UMA transação
--        p_receita = { "cortes":[{chave,ordem,operacao,fita_id,comprimento_mm,
--                                 tipo_corte,qtd,identificacao,
--                                 "camadas":[{chave,ordem,operacao,fita_id,
--                                             comprimento_mm,tipo_corte,
--                                             cortar_juntas,condicao}]}],
--                      "fitilho": {partes,comprimento_mm} | null,
--                      "sortimento": {modo,variedade,itens:[{genero,qtd}]} | null,
--                      "cortes_modo","fitilho_modo","sortimento_modo","motivo" }
create or replace function public.pcp_projeto_corte_salvar(
  p_projeto jsonb, p_regras jsonb, p_receita jsonb,
  p_publicar boolean default false,
  p_expected_revision int default null,
  p_operation_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id        text := nullif(p_projeto->>'id','');
  v_rev       int;
  v_reg       jsonb;
  v_res       jsonb;
  v_versao    int;
  v_versao_id text;
  v_corte     jsonb;
  v_camada    jsonb;
  v_corte_id  text;
  v_item      jsonb;
begin
  if not public.pcp_sou_da_casa() then raise exception 'sem-permissao'; end if;

  -- validações ANTES do registro
  if v_id is null then
    return jsonb_build_object('status','invalido','motivo','id obrigatorio');
  end if;
  if coalesce(nullif(p_projeto->>'nome',''), '') = '' then
    return jsonb_build_object('status','invalido','motivo','nome obrigatorio');
  end if;
  if coalesce(p_projeto->>'escopo','') not in ('familia','combinacao','sku') then
    return jsonb_build_object('status','invalido','motivo','escopo desconhecido');
  end if;

  if p_operation_id is not null then
    v_reg := public.pcp_operacao_registrar(p_operation_id, 'corte_projeto_salvar',
               'projeto_corte', v_id,
               jsonb_build_object('projeto', p_projeto, 'regras', p_regras,
                                  'receita', p_receita, 'publicar', p_publicar,
                                  'rev', p_expected_revision));
    if v_reg->>'estado' = 'reutilizada' then
      return public.pcp_recusa_reuso(v_reg);
    end if;
    if v_reg->>'estado' = 'duplicada' then
      return coalesce(v_reg->'resultado', jsonb_build_object('status','em-andamento'))
             || jsonb_build_object('duplicada', true);
    end if;
  end if;

  select revision into v_rev from public.pcp_projeto_corte where id = v_id;

  if v_rev is null then
    insert into public.pcp_projeto_corte (id, nome, escopo, ativo)
    values (v_id, p_projeto->>'nome', p_projeto->>'escopo',
            coalesce((p_projeto->>'ativo')::boolean, true));
  elsif p_expected_revision is not null and p_expected_revision <> v_rev then
    -- saída antecipada: nada foi escrito, mas a operação já está registrada
    v_res := jsonb_build_object('status','conflito','projeto_id',v_id,'revision',v_rev);
    if p_operation_id is not null then
      update public.pcp_operacao set resultado = v_res where operation_id = p_operation_id;
    end if;
    return v_res;
  else
    update public.pcp_projeto_corte
       set nome   = coalesce(p_projeto->>'nome', nome),
           escopo = coalesce(p_projeto->>'escopo', escopo),
           ativo  = coalesce((p_projeto->>'ativo')::boolean, ativo)
     where id = v_id;
  end if;

  -- as condições são do PROJETO: trocar o recorte não cria versão
  if p_regras is not null then
    delete from public.pcp_projeto_corte_regra where projeto_id = v_id;
    insert into public.pcp_projeto_corte_regra (id, projeto_id, campo, operador, valor, ordem)
    select coalesce(nullif(r->>'id',''), v_id || '_r' || ordinality::text), v_id,
           coalesce(r->>'campo','sku'), r->>'operador', r->>'valor',
           coalesce((r->>'ordem')::int, ordinality::int)
      from jsonb_array_elements(p_regras) with ordinality as x(r, ordinality);
  end if;

  -- versão NOVA sempre que vier receita: publicada não se edita
  if p_receita is not null then
    select coalesce(max(versao),0) + 1 into v_versao
      from public.pcp_projeto_corte_versao where projeto_id = v_id;
    v_versao_id := v_id || '_v' || v_versao::text;

    insert into public.pcp_projeto_corte_versao (
      id, projeto_id, versao, status, cortes_modo, fitilho_modo, sortimento_modo,
      motivo, criado_por)
    values (v_versao_id, v_id, v_versao, 'rascunho',
      coalesce(p_receita->>'cortes_modo','herda'),
      coalesce(p_receita->>'fitilho_modo','herda'),
      coalesce(p_receita->>'sortimento_modo','herda'),
      p_receita->>'motivo', auth.uid());

    for v_corte in select * from jsonb_array_elements(coalesce(p_receita->'cortes','[]'::jsonb)) loop
      v_corte_id := v_versao_id || '_' || (v_corte->>'chave');
      insert into public.pcp_projeto_corte_corte (
        id, versao_id, chave, ordem, operacao, fita_id, comprimento_mm, tipo_corte, qtd, identificacao)
      values (v_corte_id, v_versao_id, v_corte->>'chave',
        coalesce((v_corte->>'ordem')::int, 0), coalesce(v_corte->>'operacao','define'),
        nullif(v_corte->>'fita_id',''), (v_corte->>'comprimento_mm')::int,
        nullif(v_corte->>'tipo_corte',''), (v_corte->>'qtd')::int, v_corte->>'identificacao');

      for v_camada in select * from jsonb_array_elements(coalesce(v_corte->'camadas','[]'::jsonb)) loop
        insert into public.pcp_projeto_corte_camada (
          id, corte_id, chave, ordem, operacao, fita_id, comprimento_mm, tipo_corte,
          cortar_juntas, condicao)
        values (v_corte_id || '_' || (v_camada->>'chave'), v_corte_id, v_camada->>'chave',
          coalesce((v_camada->>'ordem')::int, 0), coalesce(v_camada->>'operacao','define'),
          nullif(v_camada->>'fita_id',''), (v_camada->>'comprimento_mm')::int,
          nullif(v_camada->>'tipo_corte',''), (v_camada->>'cortar_juntas')::boolean,
          v_camada->>'condicao');
      end loop;
    end loop;

    if jsonb_typeof(p_receita->'fitilho') = 'object' then
      insert into public.pcp_projeto_corte_fitilho (versao_id, partes, comprimento_mm)
      values (v_versao_id, coalesce((p_receita->'fitilho'->>'partes')::int, 1),
              (p_receita->'fitilho'->>'comprimento_mm')::int);
    end if;

    if jsonb_typeof(p_receita->'sortimento') = 'object' then
      insert into public.pcp_projeto_corte_sortimento (versao_id, modo, variedade)
      values (v_versao_id, p_receita->'sortimento'->>'modo',
              nullif(p_receita->'sortimento'->>'variedade',''));
      for v_item in select * from jsonb_array_elements(
          coalesce(p_receita->'sortimento'->'itens','[]'::jsonb)) loop
        insert into public.pcp_projeto_corte_sortimento_item (id, versao_id, genero, qtd)
        values (v_versao_id || '_' || (v_item->>'genero'), v_versao_id,
                v_item->>'genero', (v_item->>'qtd')::int);
      end loop;
    end if;

    if p_publicar then
      update public.pcp_projeto_corte_versao
         set status = 'arquivada'
       where projeto_id = v_id and status = 'publicada';
      update public.pcp_projeto_corte_versao
         set status = 'publicada', publicada_em = now(), publicada_por = auth.uid()
       where id = v_versao_id;
      update public.pcp_projeto_corte
         set versao_publicada_id = v_versao_id
       where id = v_id;
    end if;
  end if;

  select revision into v_rev from public.pcp_projeto_corte where id = v_id;
  v_res := jsonb_build_object('status','ok','projeto_id',v_id,'revision',v_rev,
                              'versao_id',v_versao_id,'versao',v_versao,
                              'publicada',coalesce(p_publicar,false));
  if p_operation_id is not null then
    update public.pcp_operacao set resultado = v_res where operation_id = p_operation_id;
  end if;
  return v_res;
end $$;

create or replace function public.pcp_projeto_corte_arquivar(
  p_id text, p_expected_revision int default null, p_operation_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_rev int; v_uso int; v_reg jsonb; v_res jsonb;
begin
  if not public.pcp_sou_da_casa() then raise exception 'sem-permissao'; end if;

  if coalesce(p_id,'') = '' then
    return jsonb_build_object('status','invalido','motivo','id obrigatorio');
  end if;

  if p_operation_id is not null then
    v_reg := public.pcp_operacao_registrar(p_operation_id, 'corte_projeto_arquivar',
               'projeto_corte', p_id, jsonb_build_object('rev', p_expected_revision));
    if v_reg->>'estado' = 'reutilizada' then
      return public.pcp_recusa_reuso(v_reg);
    end if;
    if v_reg->>'estado' = 'duplicada' then
      return coalesce(v_reg->'resultado', jsonb_build_object('status','em-andamento'))
             || jsonb_build_object('duplicada', true);
    end if;
  end if;

  select revision into v_rev from public.pcp_projeto_corte where id = p_id and deleted_at is null;

  if v_rev is null then
    v_res := jsonb_build_object('status','nao-encontrado','id',p_id);
  elsif p_expected_revision is not null and p_expected_revision <> v_rev then
    v_res := jsonb_build_object('status','conflito','id',p_id,'revision',v_rev);
  else
    -- projeto de pedido congelado continua existindo: o histórico precisa dele
    select count(*) into v_uso from public.pcp_pedido_projeto_corte
     where projeto_id = p_id and congelado_em is not null;
    update public.pcp_projeto_corte
       set ativo = false,
           deleted_at = case when v_uso = 0 then now() else null end,
           deleted_by = case when v_uso = 0 then auth.uid() else null end
     where id = p_id;
    v_res := jsonb_build_object('status','ok','id',p_id,'usado_por_pedidos',v_uso);
  end if;

  if p_operation_id is not null then
    update public.pcp_operacao set resultado = v_res where operation_id = p_operation_id;
  end if;
  return v_res;
end $$;

-- 14.3 · vínculo e congelamento
create or replace function public.pcp_pedido_corte_vincular(
  p_pedido_id text, p_projeto_id text, p_versao_id text, p_origem text,
  p_expected_revision int default null, p_operation_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_rev int; v_cong timestamptz; v_reg jsonb; v_res jsonb;
begin
  if not public.pcp_sou_da_casa() then raise exception 'sem-permissao'; end if;

  -- validações ANTES do registro
  if coalesce(p_pedido_id,'') = '' or coalesce(p_projeto_id,'') = ''
     or coalesce(p_versao_id,'') = '' then
    return jsonb_build_object('status','invalido','motivo','pedido, projeto e versao sao obrigatorios');
  end if;
  if coalesce(p_origem,'') not in ('familia','combinacao','sku','manual') then
    return jsonb_build_object('status','invalido','motivo','origem desconhecida');
  end if;

  if p_operation_id is not null then
    v_reg := public.pcp_operacao_registrar(p_operation_id, 'corte_vincular',
               'pedido_corte', p_pedido_id,
               jsonb_build_object('projeto', p_projeto_id, 'versao', p_versao_id,
                                  'origem', p_origem, 'rev', p_expected_revision));
    if v_reg->>'estado' = 'reutilizada' then
      return public.pcp_recusa_reuso(v_reg);
    end if;
    if v_reg->>'estado' = 'duplicada' then
      return coalesce(v_reg->'resultado', jsonb_build_object('status','em-andamento'))
             || jsonb_build_object('duplicada', true);
    end if;
  end if;

  select revision, congelado_em into v_rev, v_cong
    from public.pcp_pedido_projeto_corte where pedido_id = p_pedido_id;

  if v_cong is not null then
    v_res := jsonb_build_object('status','congelado','pedido_id',p_pedido_id,'congelado_em',v_cong);
  elsif v_rev is null then
    insert into public.pcp_pedido_projeto_corte (pedido_id, projeto_id, versao_id, origem)
    values (p_pedido_id, p_projeto_id, p_versao_id, p_origem);
    select revision into v_rev from public.pcp_pedido_projeto_corte where pedido_id = p_pedido_id;
    v_res := jsonb_build_object('status','ok','pedido_id',p_pedido_id,'revision',v_rev);
  elsif p_expected_revision is not null and p_expected_revision <> v_rev then
    v_res := jsonb_build_object('status','conflito','pedido_id',p_pedido_id,'revision',v_rev);
  else
    update public.pcp_pedido_projeto_corte
       set projeto_id = p_projeto_id, versao_id = p_versao_id, origem = p_origem
     where pedido_id = p_pedido_id;
    select revision into v_rev from public.pcp_pedido_projeto_corte where pedido_id = p_pedido_id;
    v_res := jsonb_build_object('status','ok','pedido_id',p_pedido_id,'revision',v_rev);
  end if;

  if p_operation_id is not null then
    update public.pcp_operacao set resultado = v_res where operation_id = p_operation_id;
  end if;
  return v_res;
end $$;

-- Duas proteções, de propósito: o ledger impede a MESMA ação de rodar duas
-- vezes, e `congelado_em` impede QUALQUER recongelamento — inclusive por outra
-- ação, de outro usuário, anos depois. O primeiro papel congela; reimprimir não.
create or replace function public.pcp_pedido_corte_congelar(
  p_pedido_id text, p_snapshot jsonb, p_operation_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_cong timestamptz; v_rev int; v_snap jsonb; v_reg jsonb; v_res jsonb;
begin
  if not public.pcp_sou_da_casa() then raise exception 'sem-permissao'; end if;

  -- validações ANTES do registro
  if coalesce(p_pedido_id,'') = '' then
    return jsonb_build_object('status','invalido','motivo','pedido obrigatorio');
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    return jsonb_build_object('status','invalido','motivo','snapshot obrigatorio');
  end if;

  if p_operation_id is not null then
    v_reg := public.pcp_operacao_registrar(p_operation_id, 'corte_congelar',
               'pedido_corte', p_pedido_id, jsonb_build_object('snapshot', p_snapshot));
    if v_reg->>'estado' = 'reutilizada' then
      return public.pcp_recusa_reuso(v_reg);
    end if;
    if v_reg->>'estado' = 'duplicada' then
      return coalesce(v_reg->'resultado', jsonb_build_object('status','em-andamento'))
             || jsonb_build_object('duplicada', true);
    end if;
  end if;

  select congelado_em, revision, snapshot into v_cong, v_rev, v_snap
    from public.pcp_pedido_projeto_corte where pedido_id = p_pedido_id;

  if v_rev is null then
    v_res := jsonb_build_object('status','nao-encontrado','pedido_id',p_pedido_id);
  elsif v_cong is not null then
    v_res := jsonb_build_object('status','ok','pedido_id',p_pedido_id,'revision',v_rev,
                                'congelado_em',v_cong,'ja_congelado',true,'snapshot',v_snap);
  else
    update public.pcp_pedido_projeto_corte
       set congelado_em = now(), snapshot = p_snapshot
     where pedido_id = p_pedido_id;
    select revision, congelado_em into v_rev, v_cong
      from public.pcp_pedido_projeto_corte where pedido_id = p_pedido_id;
    v_res := jsonb_build_object('status','ok','pedido_id',p_pedido_id,'revision',v_rev,
                                'congelado_em',v_cong,'ja_congelado',false);
  end if;

  if p_operation_id is not null then
    update public.pcp_operacao set resultado = v_res where operation_id = p_operation_id;
  end if;
  return v_res;
end $$;

-- execução para quem entra no app; a checagem de casa está dentro de cada uma
grant execute on function public.pcp_fita_salvar(jsonb,int,uuid)                              to authenticated;
grant execute on function public.pcp_fita_apagar(text,int,uuid)                               to authenticated;
grant execute on function public.pcp_projeto_corte_salvar(jsonb,jsonb,jsonb,boolean,int,uuid) to authenticated;
grant execute on function public.pcp_projeto_corte_arquivar(text,int,uuid)                    to authenticated;
grant execute on function public.pcp_pedido_corte_vincular(text,text,text,text,int,uuid)      to authenticated;
grant execute on function public.pcp_pedido_corte_congelar(text,jsonb,uuid)                   to authenticated;

commit;

-- ===========================================================================
-- PENDÊNCIAS REGISTRADAS (não são desta migration)
--   1. FK de pcp_pedido_projeto_corte.pedido_id → pcp_pedido(id): entra quando
--      `pedidos_linha_escrita` for ligada;
--   2. bucket `fitas` no Storage + policies da foto — v8.107;
--   3. flag `corte_escrita` em pcp_flag — v8.107.
--   (A purga do ledger não é pendência nossa: pcp_operacao já tem a dela.)
-- ===========================================================================
