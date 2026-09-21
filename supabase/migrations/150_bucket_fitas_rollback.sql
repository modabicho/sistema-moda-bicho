-- ===========================================================================
-- 150_bucket_fitas_rollback.sql · desfaz a 150
-- ---------------------------------------------------------------------------
-- NÃO é migration nova: é a reversão da 150, guardada junto dela.
--
-- A GUARDA: se houver QUALQUER objeto no bucket, a reversão recusa. Apagar
-- foto de fita não é reverter estrutura — é perder o trabalho de alguém que
-- fotografou e subiu. Nesse caso a saída é decidir o que fazer com as fotos
-- antes, não deixar o rollback decidir.
--
-- O que ela NÃO desfaz: `pcp_fita.foto_path`. A coluna é da 147, não desta
-- migration, e um caminho gravado continua sendo informação verdadeira sobre
-- onde a foto esteve.
-- ===========================================================================

begin;

do $$
declare n bigint;
begin
  if to_regclass('storage.objects') is null then
    raise exception 'rollback 150 abortado: storage.objects nao existe';
  end if;

  select count(*) into n from storage.objects where bucket_id = 'fitas';
  if n > 0 then
    raise exception using
      errcode = 'raise_exception',
      message = format('rollback 150 recusado: existem %s objeto(s) no bucket fitas', n),
      detail  = 'Apagar o bucket levaria junto as fotos das fitas e os catalogos de origem.',
      hint    = 'Baixe ou apague os objetos conscientemente antes de reverter a estrutura.';
  end if;

  -- referência viva na tabela, mesmo com o bucket vazio: é sinal de que algo
  -- ficou pela metade, e apagar o bucket esconderia o problema
  select count(*) into n from public.pcp_fita
   where coalesce(foto_path, '') <> '' and deleted_at is null;
  if n > 0 then
    raise exception using
      errcode = 'raise_exception',
      message = format('rollback 150 recusado: %s fita(s) ainda apontam para uma foto', n),
      detail  = 'O bucket esta vazio mas pcp_fita.foto_path tem caminho gravado.',
      hint    = 'Limpe foto_path dessas fitas, ou descubra por que o objeto sumiu, antes de reverter.';
  end if;
end $$;

drop policy if exists "fitas_ler"    on storage.objects;
drop policy if exists "fitas_enviar" on storage.objects;
drop policy if exists "fitas_trocar" on storage.objects;
drop policy if exists "fitas_apagar" on storage.objects;

delete from storage.buckets where id = 'fitas';

commit;
