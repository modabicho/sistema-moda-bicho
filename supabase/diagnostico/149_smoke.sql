-- ===========================================================================
-- 149_smoke.sql · conferência da migration 149 — SOMENTE LEITURA
-- ---------------------------------------------------------------------------
-- Não é migration. Só SELECT em catálogo: não cria, não altera, não apaga e
-- não chama RPC nenhuma.
--
-- Rodar DEPOIS de aplicar a 149. Devolve um JSON único.
--
-- ESPERADO:
--   colunas.projeto_id_nullable ........... true
--   colunas.versao_id_nullable ............ true
--   colunas.origem_not_null ............... true    (origem continua obrigatória)
--   origem.aceita_sem ..................... true
--   origem.lista .......................... familia, combinacao, sku, manual, sem
--   coerencia.existe ...................... true
--   coerencia.definicao ................... o CHECK nos dois sentidos
--   pk .................................... ["pedido_id"]
--   fks ................................... 2 · projeto e versao, ambas vivas
--   trigger_congelado ..................... presente, BEFORE UPDATE
--   trigger_congelado_cobre_origem ........ true    (a 149 ampliou a proteção)
--   rpc.assinatura ........................ text, text, text, text, integer, uuid
--   rpc.definer ........................... true
--   rpc.execute_authenticated ............. true
--   rpc.aceita_sem ........................ true
--   congelar_intacta ...................... true    (a 149 não tocou nela)
--   rls.ligada ............................ true
--   rls.policies .......................... 1 · só leitura, com pcp_sou_da_casa
--   rls.policies_de_escrita ............... []      (vazio)
--   dados.por_origem ...................... contagem por origem
-- ===========================================================================

select jsonb_pretty(jsonb_build_object(

  'colunas', (select jsonb_object_agg(a.attname, jsonb_build_object(
      'tipo', format_type(a.atttypid, a.atttypmod), 'not_null', a.attnotnull))
    from pg_attribute a
   where a.attrelid = 'public.pcp_pedido_projeto_corte'::regclass
     and a.attnum > 0 and not a.attisdropped
     and a.attname in ('pedido_id','projeto_id','versao_id','origem','congelado_em','snapshot','revision')),

  'origem', jsonb_build_object(
    'definicao', (select pg_get_constraintdef(oid) from pg_constraint
                   where conrelid = 'public.pcp_pedido_projeto_corte'::regclass and contype = 'c'
                     and pg_get_constraintdef(oid) ilike '%origem in%'),
    'aceita_sem', (select bool_or(pg_get_constraintdef(oid) ilike '%''sem''%') from pg_constraint
                    where conrelid = 'public.pcp_pedido_projeto_corte'::regclass and contype = 'c'),
    'quantos_checks_de_origem', (select count(*) from pg_constraint
                    where conrelid = 'public.pcp_pedido_projeto_corte'::regclass and contype = 'c'
                      and pg_get_constraintdef(oid) ilike '%origem in%')),

  'coerencia', jsonb_build_object(
    'existe', exists (select 1 from pg_constraint
                       where conrelid = 'public.pcp_pedido_projeto_corte'::regclass
                         and conname = 'pcp_pedido_projeto_corte_sem_ck'),
    'definicao', (select pg_get_constraintdef(oid) from pg_constraint
                   where conrelid = 'public.pcp_pedido_projeto_corte'::regclass
                     and conname = 'pcp_pedido_projeto_corte_sem_ck')),

  'pk', (select coalesce(jsonb_agg(a.attname order by a.attnum), '[]'::jsonb)
           from pg_constraint c join pg_attribute a
             on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
          where c.contype = 'p' and c.conrelid = 'public.pcp_pedido_projeto_corte'::regclass),

  'fks', (select coalesce(jsonb_agg(jsonb_build_object(
            'nome', conname, 'para', confrelid::regclass::text,
            'def', pg_get_constraintdef(oid)) order by conname), '[]'::jsonb)
          from pg_constraint
         where conrelid = 'public.pcp_pedido_projeto_corte'::regclass and contype = 'f'),

  'trigger_congelado', jsonb_build_object(
    'nome', (select tgname from pg_trigger
              where tgrelid = 'public.pcp_pedido_projeto_corte'::regclass
                and tgname = 'pcp_pedido_projeto_corte_congelado_t' and not tgisinternal),
    'cobre_origem', (select prosrc ~ 'new\.origem\s+is distinct from\s+old\.origem'
                       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'pcp_pedido_corte_congelado_imutavel'),
    'cobre_snapshot', (select prosrc ~ 'new\.snapshot' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'pcp_pedido_corte_congelado_imutavel')),

  'rpc', (select jsonb_build_object(
            'assinatura', pg_get_function_identity_arguments(p.oid),
            'definer', p.prosecdef,
            'aceita_sem', p.prosrc ~ '''sem''',
            'usa_ledger', p.prosrc like '%pcp_operacao_registrar%' and p.prosrc like '%pcp_recusa_reuso%',
            'grava_resultado', p.prosrc ~ 'update\s+public\.pcp_operacao\s+set\s+resultado',
            'execute_authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'))
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'pcp_pedido_corte_vincular'),

  /* a 149 não podia encostar no congelamento: aqui está a prova pelo corpo */
  'congelar_intacta', (select jsonb_build_object(
            'assinatura', pg_get_function_identity_arguments(p.oid),
            'exige_objeto', p.prosrc ~ 'jsonb_typeof\(p_snapshot\)',
            'idempotente', p.prosrc ~ 'ja_congelado')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'pcp_pedido_corte_congelar'),

  'rls', jsonb_build_object(
    'ligada', (select relrowsecurity from pg_class
                where oid = 'public.pcp_pedido_projeto_corte'::regclass),
    'policies', (select coalesce(jsonb_agg(jsonb_build_object(
                    'nome', policyname, 'cmd', cmd, 'qual', qual)), '[]'::jsonb)
                  from pg_policies where schemaname = 'public'
                    and tablename = 'pcp_pedido_projeto_corte'),
    'policies_de_escrita', (select coalesce(jsonb_agg(policyname), '[]'::jsonb)
                  from pg_policies where schemaname = 'public'
                    and tablename = 'pcp_pedido_projeto_corte' and cmd <> 'SELECT'),
    'grants_authenticated', (select coalesce(jsonb_agg(distinct privilege_type), '[]'::jsonb)
                  from information_schema.role_table_grants
                 where table_schema = 'public' and table_name = 'pcp_pedido_projeto_corte'
                   and grantee = 'authenticated')),

  'dados', jsonb_build_object(
    'total', (select count(*) from pcp_pedido_projeto_corte),
    'por_origem', (select coalesce(jsonb_object_agg(origem, n), '{}'::jsonb)
                    from (select origem, count(*) as n from pcp_pedido_projeto_corte group by origem) x),
    'incoerentes', (select count(*) from pcp_pedido_projeto_corte
                     where (origem =  'sem' and (projeto_id is not null or versao_id is not null))
                        or (origem <> 'sem' and (projeto_id is null     or versao_id is null))))

)) as smoke_149;
