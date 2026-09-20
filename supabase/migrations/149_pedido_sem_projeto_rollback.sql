-- ===========================================================================
-- 149_pedido_sem_projeto_rollback.sql · desfaz a 149
-- ---------------------------------------------------------------------------
-- NÃO é migration nova: é a reversão da 149, guardada junto dela, como a 147
-- tem a sua. (Extra em relação aos três arquivos pedidos — se não quiser, é
-- só não commitar este.)
--
-- A GUARDA: se já existir QUALQUER linha com origem='sem', a reversão recusa.
-- Voltar as colunas para NOT NULL apagaria uma decisão que alguém tomou — e
-- pior, uma decisão que pode estar congelada num pedido já liberado. Nesse
-- caso a saída é decidir o que fazer com cada pedido, não desfazer a coluna.
--
-- O que ela NÃO desfaz: a `origem` dentro da imutabilidade do congelado. Tirar
-- essa proteção deixaria o banco pior do que antes da 149, e ela não depende
-- de 'sem' existir para fazer sentido.
-- ===========================================================================

begin;

do $$
declare n bigint;
begin
  select count(*) into n from public.pcp_pedido_projeto_corte where origem = 'sem';
  if n > 0 then
    raise exception using
      errcode = 'raise_exception',
      message = 'rollback 149 recusado: existem % vinculo(s) com origem=sem',
      detail  = 'Voltar projeto_id/versao_id para NOT NULL apagaria a decisao registrada.',
      hint    = 'Decida o que fazer com esses pedidos antes de reverter a estrutura.';
  end if;
end $$;

alter table public.pcp_pedido_projeto_corte
  drop constraint if exists pcp_pedido_projeto_corte_sem_ck;

alter table public.pcp_pedido_projeto_corte
  drop constraint if exists pcp_pedido_projeto_corte_origem_ck;
alter table public.pcp_pedido_projeto_corte
  add constraint pcp_pedido_projeto_corte_origem_ck
  check (origem in ('familia','combinacao','sku','manual'));

alter table public.pcp_pedido_projeto_corte alter column projeto_id set not null;
alter table public.pcp_pedido_projeto_corte alter column versao_id  set not null;

-- a RPC volta a recusar 'sem'
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

grant execute on function public.pcp_pedido_corte_vincular(text,text,text,text,int,uuid) to authenticated;

commit;
