-- ===========================================================================
-- 147_smoke.sql · conferência da migration 147 — SOMENTE LEITURA
-- ---------------------------------------------------------------------------
-- Não é migration (o README manda: diagnóstico não vira migration).
-- Só SELECT em catálogo e contagem de linhas: não cria, não altera, não apaga
-- e não chama nenhuma RPC do módulo.
--
-- Rodar DEPOIS de aplicar a 147. Devolve um JSON único.
--
-- O QUE ELE PROVA, E O QUE NÃO PROVA
--   Prova por leitura: estrutura, RLS, grants, ausência de FK para pcp_pedido,
--   ausência de dependência de pcp_pedido_carimbo/operacao, ausência de ledger
--   paralelo, e que as 6 RPCs usam o ledger compartilhado do jeito certo
--   (registrar + recusa de reuso + gravação do resultado).
--   NÃO prova por leitura que "operation_id duplicado não reaplica": isso é
--   comportamento, e comprovar exige executar as RPCs. Essa parte está em
--   147_ensaio.sql, que escreve dentro de uma transação e termina em ROLLBACK.
--
-- ESPERADO em uma aplicação limpa:
--   tabelas.total ..................... 11
--   tabelas.sem_rls ................... []      (vazio)
--   tabelas.sem_policy_leitura ........ []      (vazio)
--   tabelas.policies_de_escrita ....... []      (vazio)
--   grants.com_escrita_direta ......... []      (vazio — ninguém grava sem RPC)
--   ids_text.nao_text ................. []      (vazio)
--   fks.total ......................... 14
--   fks.aponta_para_pcp_pedido ........ []      (vazio de propósito)
--   indices.total ..................... 31
--   triggers.total .................... 13
--   funcoes.rpc ....................... 6       todas [definer]
--   funcoes.apoio ..................... 6
--   funcoes.usa_pcp_pedido_carimbo_ou_operacao ... []   (vazio)
--   idempotencia.ledger_proprio ....... false   (pcp_corte_operacao NÃO existe)
--   idempotencia.helpers_proprios ..... []      (vazio)
--   idempotencia.compartilhado ........ tudo true
--   idempotencia.rpcs_sem_registrar ... []      (vazio)
--   idempotencia.rpcs_sem_recusa_reuso  []      (vazio)
--   idempotencia.rpcs_sem_gravar_resultado ..... []   (vazio)
--   idempotencia.operacoes_do_corte ... 0       (nenhuma ainda)
--   seeds.tipos ....................... ["45","biqueira","reto"]
--   linhas ............................ tudo 0, menos pcp_corte_tipo = 3
--   rollback.travaria ................. false
--   pedido_intacto.colunas_do_corte ... []      (vazio)
--   pedido_intacto.triggers ........... os 5 de sempre, nenhum do corte
-- ===========================================================================

with mod_tabelas(nome) as (
  values ('pcp_corte_tipo'), ('pcp_fita'), ('pcp_projeto_corte'),
         ('pcp_projeto_corte_regra'), ('pcp_projeto_corte_versao'),
         ('pcp_projeto_corte_corte'), ('pcp_projeto_corte_camada'),
         ('pcp_projeto_corte_fitilho'), ('pcp_projeto_corte_sortimento'),
         ('pcp_projeto_corte_sortimento_item'), ('pcp_pedido_projeto_corte')
),
existentes as (
  select c.oid, c.relname, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname in (select nome from mod_tabelas)
),
rpcs(nome) as (
  values ('pcp_fita_salvar'), ('pcp_fita_apagar'), ('pcp_projeto_corte_salvar'),
         ('pcp_projeto_corte_arquivar'), ('pcp_pedido_corte_vincular'),
         ('pcp_pedido_corte_congelar')
),
-- as mesmas tabelas que a guarda do rollback olha (tudo menos os seeds)
operacionais(nome) as (
  select nome from mod_tabelas where nome <> 'pcp_corte_tipo'
),
-- a mesma conta que pcp_corte_rollback_guarda() faz, feita só com leitura:
-- a função levanta exceção de propósito e abortaria este SELECT
operacional_total(n) as (
  select (select count(*) from pcp_fita)
       + (select count(*) from pcp_projeto_corte)
       + (select count(*) from pcp_projeto_corte_regra)
       + (select count(*) from pcp_projeto_corte_versao)
       + (select count(*) from pcp_projeto_corte_corte)
       + (select count(*) from pcp_projeto_corte_camada)
       + (select count(*) from pcp_projeto_corte_fitilho)
       + (select count(*) from pcp_projeto_corte_sortimento)
       + (select count(*) from pcp_projeto_corte_sortimento_item)
       + (select count(*) from pcp_pedido_projeto_corte)
       + (select count(*) from pcp_operacao
           where entidade in ('fita','projeto_corte','pedido_corte'))
)
select jsonb_pretty(jsonb_build_object(

  'tabelas', jsonb_build_object(
    'total',     (select count(*) from existentes),
    'faltando',  (select coalesce(jsonb_agg(nome order by nome), '[]'::jsonb)
                    from mod_tabelas where nome not in (select relname from existentes)),
    'sem_rls',   (select coalesce(jsonb_agg(relname order by relname), '[]'::jsonb)
                    from existentes where not relrowsecurity),
    'sem_policy_leitura', (select coalesce(jsonb_agg(e.relname order by e.relname), '[]'::jsonb)
        from existentes e
       where not exists (select 1 from pg_policies p
                          where p.schemaname = 'public' and p.tablename = e.relname
                            and p.cmd = 'SELECT' and p.qual like '%pcp_sou_da_casa%')),
    'policies_de_escrita', (select coalesce(jsonb_agg(p.tablename || '/' || p.policyname), '[]'::jsonb)
        from pg_policies p
       where p.schemaname = 'public' and p.tablename in (select relname from existentes)
         and p.cmd <> 'SELECT')
  ),

  'grants', jsonb_build_object(
    'select_authenticated', (select coalesce(jsonb_agg(distinct table_name), '[]'::jsonb)
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'authenticated'
         and privilege_type = 'SELECT'
         and table_name in (select relname from existentes)),
    'com_escrita_direta', (select coalesce(jsonb_agg(distinct table_name), '[]'::jsonb)
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'authenticated'
         and privilege_type in ('INSERT','UPDATE','DELETE')
         and table_name in (select relname from existentes))
  ),

  'ids_text', jsonb_build_object(
    'nao_text', (select coalesce(jsonb_agg(a.attrelid::regclass::text || '.' || a.attname), '[]'::jsonb)
        from pg_attribute a
       where a.attrelid in (select oid from existentes) and a.attnum > 0 and not a.attisdropped
         and a.attname in ('id','pedido_id','projeto_id','versao_id','corte_id','fita_id','codigo','tipo_corte')
         and format_type(a.atttypid, null) <> 'text')
  ),

  'fks', jsonb_build_object(
    'total', (select count(*) from pg_constraint
               where contype = 'f' and conrelid in (select oid from existentes)),
    'lista', (select coalesce(jsonb_agg(conrelid::regclass::text || ' → ' || confrelid::regclass::text
                                        order by conrelid::regclass::text), '[]'::jsonb)
                from pg_constraint
               where contype = 'f' and conrelid in (select oid from existentes)),
    -- tem que ser vazio: a FK para pedido só entra no cutover de escrita
    'aponta_para_pcp_pedido', (select coalesce(jsonb_agg(conname), '[]'::jsonb)
                from pg_constraint
               where contype = 'f' and conrelid in (select oid from existentes)
                 and confrelid = 'public.pcp_pedido'::regclass)
  ),

  'constraints_check', (select coalesce(jsonb_agg(conname order by conname), '[]'::jsonb)
      from pg_constraint where contype = 'c' and conrelid in (select oid from existentes)),

  'indices', jsonb_build_object(
    'total', (select count(*) from pg_index where indrelid in (select oid from existentes)),
    'unicos_parciais', (select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
        from pg_index i join pg_class c on c.oid = i.indexrelid
       where i.indrelid in (select oid from existentes)
         and i.indisunique and i.indpred is not null)
  ),

  'triggers', jsonb_build_object(
    'total', (select count(*) from pg_trigger
               where tgrelid in (select oid from existentes) and not tgisinternal),
    'lista', (select coalesce(jsonb_agg(tgname order by tgname), '[]'::jsonb)
                from pg_trigger
               where tgrelid in (select oid from existentes) and not tgisinternal)
  ),

  'funcoes', jsonb_build_object(
    'rpc', (select coalesce(jsonb_agg(p.proname || case when p.prosecdef then ' [definer]' else ' [INVOKER!]' end
                                      order by p.proname), '[]'::jsonb)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in (select nome from rpcs)),
    'apoio', (select coalesce(jsonb_agg(p.proname order by p.proname), '[]'::jsonb)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('pcp_corte_carimbo','pcp_corte_marca_operacao',
                           'pcp_corte_versao_imutavel','pcp_corte_filha_imutavel',
                           'pcp_pedido_corte_congelado_imutavel','pcp_corte_rollback_guarda')),
    -- nenhuma função do módulo pode chamar o carimbo/operação do pedido
    'usa_pcp_pedido_carimbo_ou_operacao', (select coalesce(jsonb_agg(p.proname), '[]'::jsonb)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and (p.proname like '%corte%' or p.proname like 'pcp_fita%')
         and p.prosrc ~ 'pcp_pedido_(carimbo|operacao)\s*\(')
  ),

  'idempotencia', jsonb_build_object(
    -- 1 · não pode ter nascido ledger paralelo
    'ledger_proprio', (to_regclass('public.pcp_corte_operacao') is not null),
    'helpers_proprios', (select coalesce(jsonb_agg(p.proname), '[]'::jsonb)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'pcp_corte_op\_%'),
    -- 2 · a infraestrutura compartilhada está de pé
    'compartilhado', jsonb_build_object(
      'pcp_operacao', (to_regclass('public.pcp_operacao') is not null),
      'registrar', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                            where n.nspname = 'public' and p.proname = 'pcp_operacao_registrar'),
      'recusa_reuso', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                               where n.nspname = 'public' and p.proname = 'pcp_recusa_reuso')),
    -- 3 · as 6 RPCs usam o contrato inteiro, não só um pedaço
    'rpcs_sem_registrar', (select coalesce(jsonb_agg(p.proname order by p.proname), '[]'::jsonb)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in (select nome from rpcs)
         and p.prosrc not like '%pcp_operacao_registrar%'),
    'rpcs_sem_recusa_reuso', (select coalesce(jsonb_agg(p.proname order by p.proname), '[]'::jsonb)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in (select nome from rpcs)
         and p.prosrc not like '%pcp_recusa_reuso%'),
    'rpcs_sem_gravar_resultado', (select coalesce(jsonb_agg(p.proname order by p.proname), '[]'::jsonb)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in (select nome from rpcs)
         and p.prosrc !~ 'update\s+public\.pcp_operacao\s+set\s+resultado'),
    -- 4 · o que o módulo já registrou no ledger compartilhado
    'operacoes_do_corte', (select count(*) from pcp_operacao
                            where entidade in ('fita','projeto_corte','pedido_corte')),
    'tipos_do_corte', (select coalesce(jsonb_agg(distinct tipo order by tipo), '[]'::jsonb)
                         from pcp_operacao
                        where entidade in ('fita','projeto_corte','pedido_corte'))
  ),

  'seeds', jsonb_build_object(
    'tipos', (select coalesce(jsonb_agg(codigo order by codigo), '[]'::jsonb) from pcp_corte_tipo)
  ),

  'linhas', jsonb_build_object(
    'pcp_corte_tipo',                    (select count(*) from pcp_corte_tipo),
    'pcp_fita',                          (select count(*) from pcp_fita),
    'pcp_projeto_corte',                 (select count(*) from pcp_projeto_corte),
    'pcp_projeto_corte_regra',           (select count(*) from pcp_projeto_corte_regra),
    'pcp_projeto_corte_versao',          (select count(*) from pcp_projeto_corte_versao),
    'pcp_projeto_corte_corte',           (select count(*) from pcp_projeto_corte_corte),
    'pcp_projeto_corte_camada',          (select count(*) from pcp_projeto_corte_camada),
    'pcp_projeto_corte_fitilho',         (select count(*) from pcp_projeto_corte_fitilho),
    'pcp_projeto_corte_sortimento',      (select count(*) from pcp_projeto_corte_sortimento),
    'pcp_projeto_corte_sortimento_item', (select count(*) from pcp_projeto_corte_sortimento_item),
    'pcp_pedido_projeto_corte',          (select count(*) from pcp_pedido_projeto_corte)
  ),

  'rollback', jsonb_build_object(
    'guarda_existe', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public' and p.proname = 'pcp_corte_rollback_guarda'),
    'linhas_operacionais', (select n from operacional_total),
    'travaria',            (select n > 0 from operacional_total),
    'tabelas_vigiadas', (select coalesce(jsonb_agg(nome order by nome), '[]'::jsonb) from operacionais),
    'pcp_operacao_vigiada_por_entidade', jsonb_build_array('fita','projeto_corte','pedido_corte')
  ),

  -- a prova de que a 147 não encostou no pedido
  'pedido_intacto', jsonb_build_object(
    'colunas_do_corte', (select coalesce(jsonb_agg(attname), '[]'::jsonb)
        from pg_attribute
       where attrelid = 'public.pcp_pedido'::regclass and attnum > 0 and not attisdropped
         and (attname like '%corte%' or attname like '%projeto%')),
    'triggers', (select coalesce(jsonb_agg(tgname order by tgname), '[]'::jsonb)
        from pg_trigger where tgrelid = 'public.pcp_pedido'::regclass and not tgisinternal),
    'policies', (select count(*) from pg_policies
                  where schemaname = 'public' and tablename = 'pcp_pedido')
  )

)) as smoke_147;
