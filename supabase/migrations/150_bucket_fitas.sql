-- ===========================================================================
-- 150_bucket_fitas.sql · o lugar onde a foto da fita mora
-- ---------------------------------------------------------------------------
-- PROPOSTA PARA REVISÃO. Não aplicada.
--
-- O QUE FALTAVA
--   A 147 já criou `pcp_fita.foto_path` (§5) e a RPC `pcp_corte_fita_salvar`
--   já grava e PRESERVA esse caminho (`coalesce(p_dados->>'foto_path',
--   foto_path)`: nunca anula em silêncio). O que nunca foi criado é o bucket
--   — a 147 o deixou de fora de propósito, e a v8.107 não chegou a fazê-lo.
--   Esta migration cria só isso.
--
-- O QUE ELA NÃO FAZ
--   · não cria coluna, tabela, índice, trigger ou RPC — nada em `public`;
--   · não altera `pcp_fita` nem nenhuma policy do módulo;
--   · não reconfigura um bucket que já exista: se ele estiver diferente do
--     combinado, ela PARA e diz o que está diferente (§1);
--   · não torna nada público: o bucket é PRIVADO, e a interface usa URL
--     assinada de curta duração. Bucket público furaria a regra do módulo
--     inteiro, que é `pcp_sou_da_casa()`.
--
-- POR QUE PRIVADO E POR QUE ESTAS POLICIES
--   Em `storage.objects`, `USING` decide o que a pessoa PODE VER/ALCANÇAR e
--   `WITH CHECK` decide o que ela PODE ESCREVER. Uma policy de INSERT só com
--   `USING` não restringe coisa nenhuma — INSERT não tem linha anterior para
--   `USING` avaliar. Por isso:
--       SELECT  → USING
--       INSERT  → WITH CHECK
--       UPDATE  → USING + WITH CHECK   (de onde sai E para onde vai)
--       DELETE  → USING
--   O UPDATE leva os dois porque sem o `WITH CHECK` alguém poderia mover um
--   objeto legítimo do bucket `fitas` para outro bucket qualquer.
--
-- ESTRUTURA DE CAMINHOS (convenção do app, não imposta aqui)
--   fita/<fita_id>/<uuid>.<jpg|png|webp>   a foto de uma fita
--   catalogo/<aaaa-mm>/<uuid>.pdf          o catálogo de origem, como veio
--
-- PDF: aceito e guardado, pré-visualizado pelo visualizador do navegador.
--   Renderizar e recortar página de PDF dentro do app fica para depois — está
--   registrado no README, não é promessa desta versão.
--
-- REVERSÃO: 150_bucket_fitas_rollback.sql. Ela RECUSA se houver qualquer
--   objeto no bucket — apagar foto de fita não é rollback de estrutura.
--
-- CONFERÊNCIA (só leitura): supabase/diagnostico/150_smoke.sql
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0 · guardas
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise exception '150 abortada: storage.buckets nao existe — Storage nao esta habilitado neste projeto';
  end if;
  if to_regclass('public.pcp_fita') is null then
    raise exception '150 abortada: aplique a 147 antes — pcp_fita nao existe';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'pcp_sou_da_casa') then
    raise exception '150 abortada: pcp_sou_da_casa() nao existe — as policies dependem dela';
  end if;
  -- a coluna que dá sentido ao bucket
  if not exists (select 1 from pg_attribute
                  where attrelid = 'public.pcp_fita'::regclass
                    and attname = 'foto_path' and attnum > 0 and not attisdropped) then
    raise exception '150 abortada: pcp_fita.foto_path nao existe — a 147 deveria te-la criado';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1 · o bucket
--     Não existe → cria com a configuração aprovada.
--     Já existe  → CONFERE campo a campo e aborta se divergir.
--
--     `on conflict do nothing` ficaria calado diante de um bucket público, ou
--     com 100 MB de limite, ou aceitando qualquer MIME — e o smoke logo em
--     seguida diria "bucket.existe: true" sem que ninguém notasse. O bucket é
--     parte do contrato: ou ele é o combinado, ou a migration para e diz o que
--     está diferente. Reconfigurar por cima também não serve: apagaria uma
--     decisão que alguém pode ter tomado de propósito.
-- ---------------------------------------------------------------------------
do $$
declare
  b            record;
  mimes_ok     text[] := array['image/jpeg','image/png','image/webp','application/pdf'];
  limite_ok    bigint := 10485760;
  divergencias text[] := '{}';
begin
  select * into b from storage.buckets where id = 'fitas';

  if not found then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('fitas', 'fitas', false, limite_ok, mimes_ok);
    raise notice '150: bucket fitas criado (privado, % bytes, % tipos)', limite_ok, array_length(mimes_ok, 1);
    return;
  end if;

  -- já existe: cada diferença é anotada, para o erro dizer TODAS de uma vez
  if b.public is distinct from false then
    divergencias := divergencias || format('public=%s (esperado false)', b.public);
  end if;
  if b.file_size_limit is distinct from limite_ok then
    divergencias := divergencias || format('file_size_limit=%s (esperado %s)',
                                           coalesce(b.file_size_limit::text, 'null'), limite_ok);
  end if;
  /* "contém exatamente": nem a mais nem a menos, e a ordem não importa */
  if b.allowed_mime_types is null
     or not (b.allowed_mime_types @> mimes_ok and b.allowed_mime_types <@ mimes_ok) then
    divergencias := divergencias || format('allowed_mime_types=%s (esperado %s)',
                                           coalesce(b.allowed_mime_types::text, 'null'), mimes_ok::text);
  end if;

  if array_length(divergencias, 1) > 0 then
    raise exception using
      errcode = 'raise_exception',
      message = format('150 abortada: o bucket fitas ja existe com outra configuracao — %s',
                       array_to_string(divergencias, '; ')),
      detail  = 'A migration nao sobrescreve configuracao existente: isso apagaria uma decisao que alguem pode ter tomado.',
      hint    = 'Ajuste o bucket para a configuracao aprovada (privado, 10485760 bytes, jpeg/png/webp/pdf) ou revise o combinado antes de aplicar.';
  end if;

  raise notice '150: bucket fitas ja existia e confere com o combinado';
end $$;

-- ---------------------------------------------------------------------------
-- 2 · as policies
--     Nomes próprios e explícitos: `drop policy if exists` antes de cada uma
--     deixa a migration reexecutável sem duplicar.
--     `to authenticated` e não `to public`: a chave anônima não alcança nada.
-- ---------------------------------------------------------------------------
drop policy if exists "fitas_ler"     on storage.objects;
drop policy if exists "fitas_enviar"  on storage.objects;
drop policy if exists "fitas_trocar"  on storage.objects;
drop policy if exists "fitas_apagar"  on storage.objects;

-- LER · baixar e assinar URL
create policy "fitas_ler" on storage.objects
  for select to authenticated
  using (bucket_id = 'fitas' and public.pcp_sou_da_casa());

-- ENVIAR · só WITH CHECK faz sentido: não há linha anterior num INSERT
create policy "fitas_enviar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fitas' and public.pcp_sou_da_casa());

-- TROCAR · os dois lados. Sem o WITH CHECK, um objeto de `fitas` poderia ser
-- movido para outro bucket por quem só deveria poder editá-lo aqui dentro.
create policy "fitas_trocar" on storage.objects
  for update to authenticated
  using      (bucket_id = 'fitas' and public.pcp_sou_da_casa())
  with check (bucket_id = 'fitas' and public.pcp_sou_da_casa());

-- APAGAR · a foto velha sai depois que a nova já está gravada (regra do app)
create policy "fitas_apagar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fitas' and public.pcp_sou_da_casa());

commit;

-- ===========================================================================
-- NOTA SOBRE `storage.objects` E RLS
--   O RLS de `storage.objects` é ligado pelo próprio Supabase na criação do
--   projeto; esta migration NÃO o liga nem o desliga. Se por algum motivo ele
--   estiver desligado neste banco, o smoke acusa (`rls.ligada`), e a correção
--   é uma decisão de infraestrutura — não algo para uma migration de módulo
--   fazer por conta própria.
--
-- NOTA SOBRE A TROCA DE FOTO
--   O app sobe a nova, confirma a gravação de `foto_path` e SÓ ENTÃO apaga a
--   antiga. Uma falha no meio deixa uma foto órfã no bucket — que é barato — e
--   nunca uma fita sem foto, que é o que doeria. Nada disso é imposto aqui:
--   é regra do cliente, e está dita em `src/corte/fotos.js`.
-- ===========================================================================
