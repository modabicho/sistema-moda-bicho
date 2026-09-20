-- ===========================================================================
-- 149_ensaio.sql · prova de COMPORTAMENTO da 149 — escreve e desfaz
-- ---------------------------------------------------------------------------
-- Não é migration. Complementa o 149_smoke.sql: o smoke prova a estrutura por
-- leitura; aqui se prova o que só aparece escrevendo — o que o banco aceita e
-- o que ele recusa.
--
-- SEGURANÇA: tudo roda dentro de uma transação que termina em ROLLBACK. Nada
-- fica: nem o projeto de ensaio, nem o vínculo, nem os registros em
-- pcp_operacao. Interromper no meio tem o mesmo efeito.
--
-- DOIS GRUPOS, E POR QUÊ
--   · CONSTRAINTS (1 a 10): escrevem direto na tabela para provar o que o
--     CHECK aceita e recusa. Precisam de permissão de escrita na tabela — o
--     SQL Editor do Supabase tem;
--   · RPC (11 a 15, mais 9001 e 9002): passam por pcp_pedido_corte_vincular e
--     pcp_pedido_corte_congelar, que exigem pcp_sou_da_casa(). Se a sessão não
--     passar nessa função, esses quatro voltam como NÃO CONCLUSIVOS, com o
--     motivo escrito — em vez de falharem como se o banco estivesse errado.
--
-- SAÍDA: uma tabela com um passo por linha e a coluna `ok` (true, false ou
-- null = não conclusivo).
-- ===========================================================================

begin;

create temp table ensaio_149 (
  n int, passo text, esperado text, obtido text, ok boolean
) on commit drop;

do $$
declare
  PRJ  text := 'prj_ens149';
  VER  text := 'prj_ens149_v1';
  PED  text := 'ped_ens149';
  PED2 text := 'ped_ens149b';
  op_a uuid := '0149a000-0000-4000-8000-000000000001';
  op_b uuid := '0149b000-0000-4000-8000-000000000002';
  op_c uuid := '0149c000-0000-4000-8000-000000000003';
  v_n  bigint;
  casa boolean := false;
  r    jsonb;
  v_o  text;
  v_c  timestamptz;
  v_s  jsonb;
begin
  begin casa := public.pcp_sou_da_casa(); exception when others then casa := false; end;

  /* base do ensaio: um projeto com uma versão, para as FKs terem a quem
     apontar. Some no rollback. */
  insert into public.pcp_projeto_corte (id, nome, escopo, ativo)
  values (PRJ, 'Ensaio 149', 'familia', true);
  insert into public.pcp_projeto_corte_versao (id, projeto_id, versao, status)
  values (VER, PRJ, 1, 'publicada');

  -- 1 ---------------------------------------------------------------------
  begin
    insert into public.pcp_pedido_projeto_corte (pedido_id, projeto_id, versao_id, origem)
    values (PED, null, null, 'sem');
    insert into ensaio_149 values (1, 'origem=sem com projeto e versao nulos', 'aceita', 'aceitou', true);
  exception when others then
    insert into ensaio_149 values (1, 'origem=sem com projeto e versao nulos', 'aceita', sqlerrm, false);
  end;

  -- 2 ---------------------------------------------------------------------
  begin
    insert into public.pcp_pedido_projeto_corte (pedido_id, projeto_id, versao_id, origem)
    values (PED2, PRJ, null, 'sem');
    insert into ensaio_149 values (2, 'origem=sem com projeto preenchido', 'recusa', 'ACEITOU — o CHECK falhou', false);
  exception when check_violation then
    insert into ensaio_149 values (2, 'origem=sem com projeto preenchido', 'recusa', sqlerrm, true);
  when others then
    insert into ensaio_149 values (2, 'origem=sem com projeto preenchido', 'recusa por CHECK', sqlerrm, false);
  end;

  -- 3 ---------------------------------------------------------------------
  begin
    insert into public.pcp_pedido_projeto_corte (pedido_id, projeto_id, versao_id, origem)
    values (PED2, null, VER, 'sem');
    insert into ensaio_149 values (3, 'origem=sem com versao preenchida', 'recusa', 'ACEITOU — o CHECK falhou', false);
  exception when check_violation then
    insert into ensaio_149 values (3, 'origem=sem com versao preenchida', 'recusa', sqlerrm, true);
  when others then
    insert into ensaio_149 values (3, 'origem=sem com versao preenchida', 'recusa por CHECK', sqlerrm, false);
  end;

  -- 4 ---------------------------------------------------------------------
  begin
    insert into public.pcp_pedido_projeto_corte (pedido_id, projeto_id, versao_id, origem)
    values (PED2, null, VER, 'sku');
    insert into ensaio_149 values (4, 'origem normal sem projeto', 'recusa', 'ACEITOU — o CHECK falhou', false);
  exception when check_violation then
    insert into ensaio_149 values (4, 'origem normal sem projeto', 'recusa', sqlerrm, true);
  when others then
    insert into ensaio_149 values (4, 'origem normal sem projeto', 'recusa por CHECK', sqlerrm, false);
  end;

  -- 5 ---------------------------------------------------------------------
  begin
    insert into public.pcp_pedido_projeto_corte (pedido_id, projeto_id, versao_id, origem)
    values (PED2, PRJ, null, 'sku');
    insert into ensaio_149 values (5, 'origem normal sem versao', 'recusa', 'ACEITOU — o CHECK falhou', false);
  exception when check_violation then
    insert into ensaio_149 values (5, 'origem normal sem versao', 'recusa', sqlerrm, true);
  when others then
    insert into ensaio_149 values (5, 'origem normal sem versao', 'recusa por CHECK', sqlerrm, false);
  end;

  -- 6 ---------------------------------------------------------------------
  begin
    insert into public.pcp_pedido_projeto_corte (pedido_id, projeto_id, versao_id, origem)
    values (PED2, PRJ, VER, 'familia');
    insert into ensaio_149 values (6, 'vinculo normal continua funcionando', 'aceita', 'aceitou', true);
  exception when others then
    insert into ensaio_149 values (6, 'vinculo normal continua funcionando', 'aceita', sqlerrm, false);
  end;

  -- 7 ---------------------------------------------------------------------
  begin
    update public.pcp_pedido_projeto_corte
       set origem = 'sem', projeto_id = null, versao_id = null
     where pedido_id = PED2;
    select origem into v_o from public.pcp_pedido_projeto_corte where pedido_id = PED2;
    insert into ensaio_149 values (7, 'trocar vinculo nao congelado para sem', 'aceita', 'origem=' || v_o, v_o = 'sem');
  exception when others then
    insert into ensaio_149 values (7, 'trocar vinculo nao congelado para sem', 'aceita', sqlerrm, false);
  end;

  -- 8 ---------------------------------------------------------------------
  begin
    update public.pcp_pedido_projeto_corte
       set origem = 'combinacao', projeto_id = PRJ, versao_id = VER
     where pedido_id = PED2;
    select origem into v_o from public.pcp_pedido_projeto_corte where pedido_id = PED2;
    insert into ensaio_149 values (8, 'trocar sem nao congelado para vinculo normal', 'aceita',
      'origem=' || v_o, v_o = 'combinacao');
  exception when others then
    insert into ensaio_149 values (8, 'trocar sem nao congelado para vinculo normal', 'aceita', sqlerrm, false);
  end;

  /* congela os dois, direto — é um UPDATE onde congelado_em ainda era nulo,
     que é o único momento em que o gatilho deixa passar */
  update public.pcp_pedido_projeto_corte
     set congelado_em = now(), snapshot = '{"sem_projeto": true}'::jsonb
   where pedido_id = PED;
  update public.pcp_pedido_projeto_corte
     set congelado_em = now(), snapshot = '{"cortes": []}'::jsonb
   where pedido_id = PED2;

  -- 9 ---------------------------------------------------------------------
  begin
    update public.pcp_pedido_projeto_corte set origem = 'sem', projeto_id = null, versao_id = null
     where pedido_id = PED2;
    insert into ensaio_149 values (9, 'depois de congelado, origem nao muda', 'recusa',
      'ACEITOU — a imutabilidade nao cobriu origem', false);
  exception when others then
    insert into ensaio_149 values (9, 'depois de congelado, origem nao muda', 'recusa', sqlerrm,
      sqlerrm like '%vinculo-congelado%');
  end;

  -- 10 --------------------------------------------------------------------
  begin
    update public.pcp_pedido_projeto_corte set versao_id = null where pedido_id = PED2;
    insert into ensaio_149 values (10, 'depois de congelado, projeto/versao imutaveis', 'recusa',
      'ACEITOU', false);
  exception when others then
    insert into ensaio_149 values (10, 'depois de congelado, projeto/versao imutaveis', 'recusa', sqlerrm,
      sqlerrm like '%vinculo-congelado%' or sqlerrm like '%check%');
  end;

  -- 11 a 14 · pelo caminho da RPC ------------------------------------------
  if not casa then
    insert into ensaio_149 values (9001, 'RPC: origem=sem com projeto preenchido', 'invalido',
      'nao conclusivo: esta sessao nao passa em pcp_sou_da_casa()', null);
    insert into ensaio_149 values (9002, 'RPC: origem=sem com versao preenchida', 'invalido',
      'nao conclusivo', null);
    insert into ensaio_149 values (11, 'RPC: vincular com origem=sem', 'ok',
      'nao conclusivo: esta sessao nao passa em pcp_sou_da_casa()', null);
    insert into ensaio_149 values (12, 'RPC: congelar sem projeto', 'ok', 'nao conclusivo', null);
    insert into ensaio_149 values (13, 'RPC: retry com o mesmo operation_id', 'duplicada', 'nao conclusivo', null);
    insert into ensaio_149 values (14, 'RPC: mesmo id com outra intencao', 'operacao-reutilizada', 'nao conclusivo', null);
  else
    /* 11a e 11b · a contradição é recusada ANTES do ledger: o operation_id
       não é queimado, e a mesma ação corrigida passa com ele depois */
    r := public.pcp_pedido_corte_vincular('ped_ens149c', PRJ, null, 'sem', null, op_c);
    select count(*) into v_n from public.pcp_operacao where operation_id = op_c;
    insert into ensaio_149 values (9001, 'RPC: origem=sem com projeto preenchido',
      'invalido e NENHUM registro em pcp_operacao', r::text || ' | registros=' || v_n::text,
      r->>'status' = 'invalido' and v_n = 0);

    r := public.pcp_pedido_corte_vincular('ped_ens149c', null, VER, 'sem', null, op_c);
    select count(*) into v_n from public.pcp_operacao where operation_id = op_c;
    insert into ensaio_149 values (9002, 'RPC: origem=sem com versao preenchida',
      'invalido e NENHUM registro em pcp_operacao', r::text || ' | registros=' || v_n::text,
      r->>'status' = 'invalido' and v_n = 0);

    -- 11 · corrigida, com o MESMO id que as duas recusas usaram
    r := public.pcp_pedido_corte_vincular('ped_ens149c', null, null, 'sem', null, op_c);
    select origem, projeto_id into v_o, v_s
      from (select origem, to_jsonb(projeto_id) as projeto_id from public.pcp_pedido_projeto_corte
             where pedido_id = 'ped_ens149c') x;
    insert into ensaio_149 values (11, 'RPC: vincular com origem=sem (projeto e versao sao ignorados)',
      'ok e colunas nulas', r::text || ' | origem=' || coalesce(v_o,'?'),
      r->>'status' = 'ok' and v_o = 'sem' and v_s = 'null'::jsonb);

    -- 12
    r := public.pcp_pedido_corte_congelar('ped_ens149c', '{"sem_projeto": true}'::jsonb, null);
    select congelado_em, snapshot into v_c, v_s
      from public.pcp_pedido_projeto_corte where pedido_id = 'ped_ens149c';
    insert into ensaio_149 values (12, 'RPC: congelar pedido sem projeto', 'ok com snapshot objeto',
      r::text, r->>'status' = 'ok' and v_c is not null and (v_s->>'sem_projeto') = 'true');

    -- 13 · o mesmo id, a mesma intenção
    r := public.pcp_pedido_corte_vincular('ped_ens149c', null, null, 'sem', null, op_c);
    insert into ensaio_149 values (13, 'RPC: retry com o mesmo operation_id', 'resultado guardado + duplicada',
      r::text, (r->>'duplicada')::boolean is true);

    -- 14 · o mesmo id, outra intenção
    r := public.pcp_pedido_corte_vincular('ped_ens149c', PRJ, VER, 'familia', null, op_c);
    insert into ensaio_149 values (14, 'RPC: mesmo id com outra intencao', 'operacao-reutilizada',
      r::text, r->>'status' = 'operacao-reutilizada');
  end if;

  /* 15 · a prova de que a 149 não encostou no congelamento: a mesma chamada
     idempotente que a 147 entregou continua idempotente */
  if casa then
    r := public.pcp_pedido_corte_congelar('ped_ens149c', '{"outro": true}'::jsonb, op_b);
    insert into ensaio_149 values (15, 'congelar de novo nao troca o snapshot', 'ja_congelado true',
      r::text, (r->>'ja_congelado')::boolean is true);
  else
    insert into ensaio_149 values (15, 'congelar de novo nao troca o snapshot', 'ja_congelado true',
      'nao conclusivo', null);
  end if;
end $$;

/* 9001 e 9002 são as duas recusas por contradição; ficam logo depois dos
   testes de CHECK e antes dos de RPC, na leitura */
select row_number() over (order by case when n > 9000 then 10.5 + (n - 9001) / 10.0 else n end) as ordem,
       n, passo, esperado, obtido, ok
  from ensaio_149 order by ordem;

-- nada disto fica
rollback;
