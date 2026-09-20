-- ===========================================================================
-- 147_ensaio.sql · prova de COMPORTAMENTO da 147 — escreve e desfaz
-- ---------------------------------------------------------------------------
-- Não é migration. Complementa o 147_smoke.sql: o smoke prova estrutura por
-- leitura, e há coisas que só se provam executando — "o mesmo operation_id não
-- reaplica" é a principal.
--
-- SEGURANÇA: tudo roda dentro de uma transação que termina em ROLLBACK. Nada
-- fica no banco. Isso vale inclusive para as linhas que entram em pcp_operacao
-- (infraestrutura compartilhada): elas são inseridas por pcp_operacao_registrar
-- dentro desta mesma transação e somem com ela — que é exatamente a garantia
-- que o contrato oferece em produção quando uma transação falha.
-- Se você interromper no meio, a transação cai sozinha e o efeito é o mesmo.
-- Ainda assim: rode primeiro em um ambiente de teste, se houver.
--
-- QUEM RODA: precisa ser uma sessão que passe em pcp_sou_da_casa(). O SQL
-- Editor como service role normalmente NÃO passa (não há usuário logado) — o
-- ensaio para na primeira linha e diz isso, em vez de dar erro confuso.
--
-- SAÍDA: uma tabela com um passo por linha e a coluna `ok`. Todos têm que ser
-- verdadeiros.
-- ===========================================================================

begin;

create temp table ensaio_147 (
  n int, passo text, esperado text, obtido text, ok boolean
) on commit drop;

do $$
declare
  -- ids fixos: o ensaio é reprodutível e não sobra nada (rollback no fim)
  op_a uuid := '000a0000-0000-4000-8000-000000000001';
  op_b uuid := '000b0000-0000-4000-8000-000000000002';
  op_c uuid := '000c0000-0000-4000-8000-000000000003';
  op_d uuid := '000d0000-0000-4000-8000-000000000004';
  op_e uuid := '000e0000-0000-4000-8000-000000000005';
  op_f uuid := '000f0000-0000-4000-8000-000000000006';
  op_g uuid := '0a0a0000-0000-4000-8000-000000000007';
  fita_a  jsonb := '{"id":"ft_ensaio147","nome":"ENSAIO A","numero":"9"}'::jsonb;
  fita_b  jsonb := '{"id":"ft_ensaio147","nome":"ENSAIO B","numero":"9"}'::jsonb;
  receita jsonb;
  r     jsonb;
  v_txt text;
  v_int int;
  v_uid uuid;
  v_bool boolean;
  v_c1  timestamptz;
  v_c2  timestamptz;
begin
  if not public.pcp_sou_da_casa() then
    raise exception 'ensaio 147 nao rodou: esta sessao nao passa em pcp_sou_da_casa(). '
                    'Rode como um usuario do app, nao como service role.';
  end if;

  -- 1 · a operação A cria a fita ------------------------------------------
  r := public.pcp_fita_salvar(fita_a, null, op_a);
  insert into ensaio_147 values (1, 'A cria a fita', 'ok/revision 1',
    r::text, r->>'status' = 'ok' and (r->>'revision')::int = 1);

  -- 2 · a operação foi parar no ledger COMPARTILHADO -----------------------
  select tipo || '/' || entidade, resultado is not null
    into v_txt, v_bool
    from public.pcp_operacao where operation_id = op_a;
  insert into ensaio_147 values (2, 'registro em pcp_operacao',
    'corte_fita_salvar/fita com resultado gravado',
    coalesce(v_txt,'(nao achou)') || ' | resultado=' || coalesce(v_bool::text,'null'),
    v_txt = 'corte_fita_salvar/fita' and coalesce(v_bool, false));

  -- 3 · a operação B altera a mesma fita, e carimba a linha ----------------
  r := public.pcp_fita_salvar(fita_b, 1, op_b);
  select ultima_operacao into v_uid from public.pcp_fita where id = 'ft_ensaio147';
  insert into ensaio_147 values (3, 'B altera a fita',
    'ok/revision 2 e ultima_operacao = B',
    r::text || ' | ultima_operacao=' || coalesce(v_uid::text,'null'),
    r->>'status' = 'ok' and (r->>'revision')::int = 2 and v_uid = op_b);

  -- 4 · A CHEGA DE NOVO DEPOIS DE B — o cenário do retry perdido -----------
  --     Devolve o resultado guardado, marcado como duplicada, e NÃO reaplica:
  --     a fita continua sendo B.
  r := public.pcp_fita_salvar(fita_a, null, op_a);
  select nome, revision into v_txt, v_int from public.pcp_fita where id = 'ft_ensaio147';
  insert into ensaio_147 values (4, 'A reenviada depois de B',
    'resultado guardado (revision 1) + duplicada:true, fita intacta em ENSAIO B/2',
    r::text || ' | fita=' || v_txt || '/' || v_int::text,
    r->>'status' = 'ok' and (r->>'revision')::int = 1
      and (r->>'duplicada')::boolean = true
      and v_txt = 'ENSAIO B' and v_int = 2);

  -- 5 · mesmo id, intenção DIFERENTE: recusa de propósito ------------------
  r := public.pcp_fita_salvar(fita_a || '{"cor":"outra coisa"}'::jsonb, null, op_a);
  insert into ensaio_147 values (5, 'mesmo id com outra intencao',
    'operacao-reutilizada', r::text, r->>'status' = 'operacao-reutilizada');

  -- 6 · projeto com receita, publicado ------------------------------------
  receita := jsonb_build_object(
    'cortes_modo','substitui',
    'cortes', jsonb_build_array(jsonb_build_object(
      'chave','ct_ens1','ordem',1,'operacao','define',
      'fita_id','ft_ensaio147','comprimento_mm',100,'tipo_corte','reto','qtd',1,
      'identificacao','Laco do ensaio')),
    'fitilho', jsonb_build_object('partes',1,'comprimento_mm',80));
  r := public.pcp_projeto_corte_salvar(
         '{"id":"prj_ensaio147","nome":"Ensaio","escopo":"sku"}'::jsonb,
         '[{"operador":"igual","valor":"ENS01"}]'::jsonb,
         receita, true, null, op_c);
  insert into ensaio_147 values (6, 'projeto salvo e publicado', 'ok/versao 1',
    r::text, r->>'status' = 'ok' and (r->>'versao')::int = 1);

  -- 7 · o mesmo salvamento reenviado NÃO cria uma segunda versão -----------
  r := public.pcp_projeto_corte_salvar(
         '{"id":"prj_ensaio147","nome":"Ensaio","escopo":"sku"}'::jsonb,
         '[{"operador":"igual","valor":"ENS01"}]'::jsonb,
         receita, true, null, op_c);
  select count(*) into v_int from public.pcp_projeto_corte_versao
   where projeto_id = 'prj_ensaio147';
  insert into ensaio_147 values (7, 'salvar reenviado',
    'duplicada:true e continua com 1 versao',
    r::text || ' | versoes=' || v_int::text,
    r->>'status' = 'ok' and (r->>'duplicada')::boolean = true and v_int = 1);

  -- 8 · vínculo do pedido --------------------------------------------------
  r := public.pcp_pedido_corte_vincular('ped_ensaio147', 'prj_ensaio147',
         'prj_ensaio147_v1', 'sku', null, op_d);
  insert into ensaio_147 values (8, 'vinculo criado', 'ok',
    r::text, r->>'status' = 'ok');

  -- 9 · primeiro papel congela --------------------------------------------
  r := public.pcp_pedido_corte_congelar('ped_ensaio147',
         '{"cortes":[{"fita":"9","mm":100}]}'::jsonb, op_e);
  v_c1 := (r->>'congelado_em')::timestamptz;
  insert into ensaio_147 values (9, 'primeiro congelamento', 'ok/ja_congelado false',
    r::text, r->>'status' = 'ok' and (r->>'ja_congelado')::boolean = false);

  -- 10 · reimprimir NÃO recongela, mesmo com operação nova -----------------
  --      (aqui o id é outro de propósito: quem protege é congelado_em)
  r := public.pcp_pedido_corte_congelar('ped_ensaio147',
         '{"cortes":[{"fita":"OUTRA","mm":999}]}'::jsonb, op_f);
  v_c2 := (r->>'congelado_em')::timestamptz;
  insert into ensaio_147 values (10, 'segundo congelamento, operacao nova',
    'ja_congelado true e o mesmo congelado_em',
    r::text, (r->>'ja_congelado')::boolean = true and v_c1 = v_c2);

  -- 11 · recusa por validação não queima o id ------------------------------
  --      (a validação vem ANTES de pcp_operacao_registrar, como em pcp_cad_patch)
  r := public.pcp_fita_salvar('{"nome":"sem id"}'::jsonb, null, op_g);
  select count(*) into v_int from public.pcp_operacao where operation_id = op_g;
  insert into ensaio_147 values (11, 'salvar invalido',
    'invalido e NENHUM registro em pcp_operacao',
    r::text || ' | registros=' || v_int::text,
    r->>'status' = 'invalido' and v_int = 0);

  r := public.pcp_fita_salvar('{"id":"ft_ensaio147b","nome":"Corrigida"}'::jsonb, null, op_g);
  insert into ensaio_147 values (12, 'corrigir e reenviar com o MESMO id',
    'ok (o id nao ficou queimado)', r::text, r->>'status' = 'ok');

  -- 13 · a guarda do rollback trava diante de dado -------------------------
  begin
    perform public.pcp_corte_rollback_guarda();
    insert into ensaio_147 values (13, 'guarda do rollback',
      'excecao', 'passou sem reclamar', false);
  exception when others then
    insert into ensaio_147 values (13, 'guarda do rollback',
      'excecao recusando o rollback', sqlerrm,
      sqlerrm like '%recusado%');
  end;
end $$;

select n, passo, esperado, obtido, ok from ensaio_147 order by n;

-- nada disto fica: a transação inteira volta atrás, inclusive os registros
-- que entraram em pcp_operacao
rollback;
