-- ===========================================================================
-- 150_smoke.sql · conferência da migration 150 — SOMENTE LEITURA
-- ---------------------------------------------------------------------------
-- Não é migration. Só SELECT em catálogo: não cria, não altera, não apaga e
-- não envia arquivo nenhum.
--
-- Rodar DEPOIS de aplicar a 150. Devolve um JSON único.
--
-- ESPERADO:
--   bucket.existe .................... true
--   bucket.publico ................... false     (privado, com URL assinada)
--   bucket.limite_bytes .............. 10485760
--   bucket.mimes ..................... jpeg, png, webp, pdf
--   rls.ligada ....................... true      (do projeto, não desta migration)
--   policies.quantas ................. 4
--   policies.select_tem_using ........ true
--   policies.insert_tem_with_check ... true
--   policies.insert_sem_using ........ true      (INSERT não avalia USING)
--   policies.update_tem_os_dois ...... true
--   policies.delete_tem_using ........ true
--   policies.todas_com_sou_da_casa ... true
--   policies.todas_so_authenticated .. true
--   policies.alguma_sem_filtro_bucket  false     (nenhuma vale fora de `fitas`)
--   coluna_foto_path ................. existe, text
--   dados.fitas_com_foto ............. quantas fitas já apontam para um objeto
--   dados.objetos_no_bucket .......... quantos objetos existem
--   dados.orfaos ..................... foto_path apontando para objeto ausente
--   dados.soltos ..................... objeto sem nenhuma fita apontando
-- ===========================================================================

select jsonb_pretty(jsonb_build_object(

  'bucket', (select jsonb_build_object(
      'existe', true, 'publico', b.public,
      'limite_bytes', b.file_size_limit,
      'mimes', to_jsonb(b.allowed_mime_types))
    from storage.buckets b where b.id = 'fitas'),

  'rls', jsonb_build_object(
    'ligada', (select relrowsecurity from pg_class
                where oid = 'storage.objects'::regclass)),

  'policies', (with p as (
      select policyname, cmd,
             coalesce(qual, '')       as usando,
             coalesce(with_check, '') as checando
        from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and policyname in ('fitas_ler','fitas_enviar','fitas_trocar','fitas_apagar'))
    select jsonb_build_object(
      'quantas', (select count(*) from p),
      'nomes', (select coalesce(jsonb_agg(policyname order by policyname), '[]'::jsonb) from p),
      'select_tem_using',      (select usando   <> '' from p where cmd = 'SELECT'),
      'insert_tem_with_check', (select checando <> '' from p where cmd = 'INSERT'),
      /* INSERT não tem linha anterior: USING ali não restringe nada, e uma
         policy de escrita escrita só com USING seria uma porta aberta */
      'insert_sem_using',      (select usando    = '' from p where cmd = 'INSERT'),
      'update_tem_os_dois',    (select usando <> '' and checando <> '' from p where cmd = 'UPDATE'),
      'delete_tem_using',      (select usando   <> '' from p where cmd = 'DELETE'),
      'todas_com_sou_da_casa', (select bool_and((usando || checando) like '%pcp_sou_da_casa%') from p),
      'alguma_sem_filtro_bucket',
          (select bool_or((usando || checando) not like '%fitas%') from p),
      'cru', (select coalesce(jsonb_object_agg(policyname,
                 jsonb_build_object('cmd', cmd, 'using', usando, 'with_check', checando)), '{}'::jsonb) from p))),

  /* papéis de cada policy: nenhuma pode valer para `public`/anon */
  'papeis', (select coalesce(jsonb_object_agg(policyname, to_jsonb(roles)), '{}'::jsonb)
      from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname in ('fitas_ler','fitas_enviar','fitas_trocar','fitas_apagar')),

  'policies_estranhas_no_bucket', (select coalesce(jsonb_agg(policyname order by policyname), '[]'::jsonb)
      from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname not in ('fitas_ler','fitas_enviar','fitas_trocar','fitas_apagar')
       and (coalesce(qual,'') || coalesce(with_check,'')) like '%fitas%'),

  'coluna_foto_path', (select jsonb_build_object('tipo', format_type(a.atttypid, a.atttypmod),
      'not_null', a.attnotnull)
    from pg_attribute a
   where a.attrelid = 'public.pcp_fita'::regclass
     and a.attname = 'foto_path' and a.attnum > 0 and not a.attisdropped),

  'dados', jsonb_build_object(
    'fitas_com_foto', (select count(*) from public.pcp_fita
                        where coalesce(foto_path,'') <> '' and deleted_at is null),
    'objetos_no_bucket', (select count(*) from storage.objects where bucket_id = 'fitas'),
    /* fita apontando para objeto que não existe: a troca de foto falhou no meio */
    'orfaos', (select count(*) from public.pcp_fita f
                where coalesce(f.foto_path,'') <> '' and f.deleted_at is null
                  and not exists (select 1 from storage.objects o
                                   where o.bucket_id = 'fitas' and o.name = f.foto_path)),
    /* objeto que ninguém referencia: sobra de troca, esperado e inofensivo */
    'soltos', (select count(*) from storage.objects o
                where o.bucket_id = 'fitas'
                  and o.name like 'fita/%'
                  and not exists (select 1 from public.pcp_fita f
                                   where f.foto_path = o.name and f.deleted_at is null)),
    'por_pasta', (select coalesce(jsonb_object_agg(pasta, n), '{}'::jsonb) from (
        select split_part(name, '/', 1) as pasta, count(*) as n
          from storage.objects where bucket_id = 'fitas'
         group by 1) x))

)) as smoke_150;
