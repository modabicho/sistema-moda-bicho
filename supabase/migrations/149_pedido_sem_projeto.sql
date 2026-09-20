-- ===========================================================================
-- 149_pedido_sem_projeto.sql · "sem Projeto de Corte" vira uma decisão gravada
-- ---------------------------------------------------------------------------
-- PROPOSTA PARA REVISÃO. Não aplicada.
--
-- O PROBLEMA QUE ELA RESOLVE
--   Hoje, um pedido sem linha em `pcp_pedido_projeto_corte` é ambíguo: pode
--   ser alguém que escolheu seguir sem projeto, ou um pedido anterior ao
--   módulo, ou uma falha de gravação. No momento de liberar para produção,
--   essa diferença importa — a primeira segue, as outras duas têm de parar.
--   Ausência de linha não sabe dizer qual é qual. Uma escolha explícita
--   precisa de um lugar onde ser escrita.
--
-- O QUE MUDA
--   origem = 'sem'  →  projeto_id IS NULL  e  versao_id IS NULL
--   origem <> 'sem' →  projeto_id NOT NULL e  versao_id NOT NULL
--   As duas metades são garantidas por um CHECK só, não pela aplicação.
--
-- O QUE NÃO MUDA
--   · a PK continua sendo `pedido_id`;
--   · as FKs para pcp_projeto_corte e pcp_projeto_corte_versao continuam,
--     apenas passam a aceitar NULL (FK não valida linha nula);
--   · `pcp_pedido_corte_congelar` NÃO é tocada: ela já aceita qualquer objeto
--     jsonb como snapshot, então `{"sem_projeto": true}` passa sem alteração;
--   · a assinatura de `pcp_pedido_corte_vincular` continua
--     (text, text, text, text, int, uuid) — o app não muda de chamada;
--   · a idempotência continua sendo `pcp_operacao` + `pcp_operacao_registrar`
--     + `pcp_recusa_reuso`, sem ledger paralelo;
--   · RLS, policies e grants ficam como estão. Nenhuma linha sobre eles aqui.
--
-- O QUE GANHA PROTEÇÃO
--   `origem` entra na imutabilidade do vínculo congelado. Sem isso, um pedido
--   já liberado poderia ter a origem trocada para 'sem' e passar a parecer que
--   nunca teve projeto — com o snapshot ainda gravado ao lado, contando outra
--   história.
--
-- REVERSÃO: as duas colunas voltam a NOT NULL, o CHECK de coerência sai e o
--   CHECK de origem volta sem 'sem'. Só é possível enquanto não houver nenhuma
--   linha com origem='sem' — o rollback recusa nesse caso, em vez de apagar a
--   decisão de alguém. Está em 149_pedido_sem_projeto_rollback.sql.
--
-- CONFERÊNCIA (só leitura): supabase/diagnostico/149_smoke.sql
-- ENSAIO (escreve e desfaz):  supabase/diagnostico/149_ensaio.sql
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0 · guardas: a 149 só faz sentido sobre a 147 aplicada
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.pcp_pedido_projeto_corte') is null then
    raise exception '149 abortada: aplique a 147 antes — pcp_pedido_projeto_corte nao existe';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'pcp_pedido_corte_vincular') then
    raise exception '149 abortada: pcp_pedido_corte_vincular nao existe';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1 · as duas colunas passam a aceitar nulo
--     A FK continua existindo e continua valendo: chave estrangeira nula não é
--     validada, é ignorada. Nenhuma FK é recriada aqui.
-- ---------------------------------------------------------------------------
alter table public.pcp_pedido_projeto_corte alter column projeto_id drop not null;
alter table public.pcp_pedido_projeto_corte alter column versao_id  drop not null;

-- ---------------------------------------------------------------------------
-- 2 · o CHECK de origem passa a aceitar 'sem'
--     O nome do CHECK antigo foi gerado pelo Postgres (ele nasceu inline na
--     147), então ele é procurado pela definição, não pelo nome — inventar o
--     nome seria apostar no que o servidor escolheu.
-- ---------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.pcp_pedido_projeto_corte'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%origem%'
  loop
    execute format('alter table public.pcp_pedido_projeto_corte drop constraint %I', c.conname);
    raise notice '149: CHECK de origem antigo removido (%)', c.conname;
  end loop;
end $$;

alter table public.pcp_pedido_projeto_corte
  add constraint pcp_pedido_projeto_corte_origem_ck
  check (origem in ('familia','combinacao','sku','manual','sem'));

-- ---------------------------------------------------------------------------
-- 3 · a coerência entre origem e as duas colunas, em um CHECK só
--     Escrito nos dois sentidos de propósito: assim nem "sem com projeto" nem
--     "com projeto sem versão" passam, e a regra fica legível para quem abrir
--     a tabela daqui a um ano.
-- ---------------------------------------------------------------------------
alter table public.pcp_pedido_projeto_corte
  drop constraint if exists pcp_pedido_projeto_corte_sem_ck;
alter table public.pcp_pedido_projeto_corte
  add constraint pcp_pedido_projeto_corte_sem_ck
  check (
    (origem =  'sem' and projeto_id is null     and versao_id is null)
    or
    (origem <> 'sem' and projeto_id is not null and versao_id is not null)
  );

-- ---------------------------------------------------------------------------
-- 4 · a imutabilidade do congelado passa a cobrir `origem`
--     Mesma função, mesmo gatilho: só a lista do que não pode mudar cresce.
-- ---------------------------------------------------------------------------
create or replace function public.pcp_pedido_corte_congelado_imutavel()
returns trigger
language plpgsql
as $$
begin
  if old.congelado_em is not null then
    if new.projeto_id is distinct from old.projeto_id
       or new.versao_id is distinct from old.versao_id
       /* 149 · origem entra aqui: um pedido liberado com projeto não pode
          passar a dizer que nunca teve um, com o snapshot ainda ao lado */
       or new.origem   is distinct from old.origem
       or new.snapshot is distinct from old.snapshot
       or new.congelado_em is distinct from old.congelado_em then
      raise exception 'vinculo-congelado: pedido % ja foi liberado', old.pedido_id;
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 5 · a RPC aceita 'sem'
--     MESMA assinatura, MESMA idempotência, MESMO formato de resposta. O que
--     muda é a validação de entrada e o que vai para as colunas.
--
--     Com origem='sem', projeto e versão têm de vir VAZIOS. Mandar os três
--     juntos é uma intenção contraditória — "este pedido não tem projeto, e o
--     projeto dele é este" — e isso é bug de integração, não caso de uso.
--     Silenciar limpando os campos esconderia o bug até alguém descobrir pelo
--     papel errado. Então volta `invalido`.
--
--     E volta ANTES do ledger: validação recusada não registra operação, que é
--     a regra do contrato (147, §14) — o app corrige e reenvia com o MESMO
--     operation_id, sem queimar a ação.
-- ---------------------------------------------------------------------------
create or replace function public.pcp_pedido_corte_vincular(
  p_pedido_id text, p_projeto_id text, p_versao_id text, p_origem text,
  p_expected_revision int default null, p_operation_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rev int; v_cong timestamptz; v_reg jsonb; v_res jsonb;
  v_sem  boolean := (coalesce(p_origem,'') = 'sem');
  /* nada é forçado: o que chega é o que se valida */
  v_proj text := nullif(p_projeto_id,'');
  v_ver  text := nullif(p_versao_id,'');
begin
  if not public.pcp_sou_da_casa() then raise exception 'sem-permissao'; end if;

  -- validações ANTES do registro
  if coalesce(p_pedido_id,'') = '' then
    return jsonb_build_object('status','invalido','motivo','pedido obrigatorio');
  end if;
  if coalesce(p_origem,'') not in ('familia','combinacao','sku','manual','sem') then
    return jsonb_build_object('status','invalido','motivo','origem desconhecida');
  end if;
  /* contradição: "sem projeto" junto com um projeto. Erro, não conveniência. */
  if v_sem and (v_proj is not null or v_ver is not null) then
    return jsonb_build_object('status','invalido',
      'motivo','origem=sem nao aceita projeto nem versao',
      'projeto_id', v_proj, 'versao_id', v_ver);
  end if;
  if not v_sem and (v_proj is null or v_ver is null) then
    return jsonb_build_object('status','invalido','motivo','projeto e versao sao obrigatorios fora de origem=sem');
  end if;

  if p_operation_id is not null then
    v_reg := public.pcp_operacao_registrar(p_operation_id, 'corte_vincular',
               'pedido_corte', p_pedido_id,
               jsonb_build_object('projeto', v_proj, 'versao', v_ver,
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
    values (p_pedido_id, v_proj, v_ver, p_origem);
    select revision into v_rev from public.pcp_pedido_projeto_corte where pedido_id = p_pedido_id;
    v_res := jsonb_build_object('status','ok','pedido_id',p_pedido_id,'revision',v_rev,'origem',p_origem);
  elsif p_expected_revision is not null and p_expected_revision <> v_rev then
    v_res := jsonb_build_object('status','conflito','pedido_id',p_pedido_id,'revision',v_rev);
  else
    update public.pcp_pedido_projeto_corte
       set projeto_id = v_proj, versao_id = v_ver, origem = p_origem
     where pedido_id = p_pedido_id;
    select revision into v_rev from public.pcp_pedido_projeto_corte where pedido_id = p_pedido_id;
    v_res := jsonb_build_object('status','ok','pedido_id',p_pedido_id,'revision',v_rev,'origem',p_origem);
  end if;

  if p_operation_id is not null then
    update public.pcp_operacao set resultado = v_res where operation_id = p_operation_id;
  end if;
  return v_res;
end $$;

-- a concessão é reafirmada porque `create or replace` de função com a MESMA
-- assinatura preserva os grants — mas reafirmar é barato e tira a dúvida
grant execute on function public.pcp_pedido_corte_vincular(text,text,text,text,int,uuid) to authenticated;

commit;

-- ===========================================================================
-- NOTA SOBRE O CONGELAMENTO
--   `pcp_pedido_corte_congelar` continua exatamente como a 147 a deixou. Ela
--   exige `jsonb_typeof(p_snapshot) = 'object'`, então o snapshot de um pedido
--   sem projeto é `{"sem_projeto": true}` e passa sem nenhuma alteração de
--   código. O congelamento de um pedido sem projeto continua sendo um
--   congelamento de verdade: data gravada, imutável depois, e o papel antigo
--   continua contando a mesma história.
-- ===========================================================================
