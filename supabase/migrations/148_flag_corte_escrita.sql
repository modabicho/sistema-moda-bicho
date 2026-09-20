-- ===========================================================================
-- 148_flag_corte_escrita.sql · o interruptor de gravação do Projeto de Corte
-- ---------------------------------------------------------------------------
-- A 147 criou tabelas e RPCs. Esta cria o interruptor que deixa o app usá-las.
--
-- Nasce DESLIGADA, e isso é o desenho, não cautela: a v8.107 vai a produção
-- com a tela de Fitas lendo e com a gravação guardada na fila. Ligar é um
-- update de uma linha; desligar de volta também, e a fila não se perde nos
-- dois sentidos.
--
-- O app lê esta linha pelo `telaFlag()` que já existe (src/persistencia/tela.js),
-- o mesmo que lê `pedidos_linha_leitura` e `pedidos_linha_escrita`. Nenhuma
-- linha de código novo é necessária para a flag ser lida.
--
-- Uma flag só, não duas. As de cadastro são `_leitura` + `_escrita` porque lá
-- existem duas fontes de verdade para reconciliar. A fita só existe em
-- `pcp_fita`: não há documento para comparar, e uma flag de leitura só serviria
-- para esconder a tela.
--
-- Reexecutar não muda nada: `on conflict do nothing` preserva o valor que
-- estiver lá, inclusive uma flag já ligada à mão.
--
-- Para ligar (não é parte desta migration):
--   update public.pcp_flag set ligada = true where nome = 'corte_escrita';
-- ===========================================================================

begin;

do $$
begin
  if to_regclass('public.pcp_flag') is null then
    raise exception '148 abortada: pcp_flag nao existe neste banco';
  end if;
  if to_regclass('public.pcp_fita') is null then
    raise exception '148 abortada: aplique a 147 antes — pcp_fita nao existe';
  end if;
end $$;

-- O `on conflict` vai SEM alvo de propósito: não conferi daqui se `nome` tem
-- unique, e `on conflict (nome)` erraria com 42P10 se não tiver. Sem alvo, ele
-- respeita qualquer constraint que exista; e o `where not exists` cobre o caso
-- de não existir nenhuma, que é onde a reexecução duplicaria a linha.
insert into public.pcp_flag (nome, ligada)
select 'corte_escrita', false
 where not exists (select 1 from public.pcp_flag where nome = 'corte_escrita')
on conflict do nothing;

commit;

-- Conferência (só leitura):
--   select nome, ligada from public.pcp_flag where nome = 'corte_escrita';
-- Esperado logo após aplicar: uma linha, ligada = false.
