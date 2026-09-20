-- ===========================================================================
-- 147_projeto_corte_rollback.sql · desfaz a 147 por inteiro
-- ---------------------------------------------------------------------------
-- NÃO é uma migration nova: é a reversão da 147, guardada junto dela.
--
-- O que ela apaga: as 11 tabelas do módulo, as 6 RPCs e as 6 funções de apoio.
-- Nada fora do módulo é tocado — pcp_pedido, pcp_op, pcp_cad_tipo e
-- pcp_cad_item continuam como estavam, porque a 147 nunca escreveu neles.
--
-- pcp_operacao NÃO É TOCADA. Nem drop, nem delete, nem alteração de policy: é
-- infraestrutura compartilhada com pedido, cadastro, OP, estoque, insumos,
-- posse, semiacabados e ciclos, com 117 mil operações registradas. Se algum
-- dia as linhas de corte precisarem sair de lá, isso é uma limpeza própria,
-- decidida à parte — não um efeito colateral de reverter uma migration.
--
-- A GUARDA (pcp_corte_rollback_guarda, criada pela própria 147)
--   Este arquivo só serve para desfazer uma aplicação que ainda não produziu
--   nada. Se QUALQUER tabela do módulo tiver uma linha — fita, projeto, regra,
--   versão, corte, camada, fitilho, sortimento, item ou vínculo — ou se houver
--   operação de corte registrada em pcp_operacao (entidades `fita`,
--   `projeto_corte`, `pedido_corte`, e só elas), a guarda levanta exceção e a
--   transação inteira volta atrás. Não existe atalho nem variável de sessão
--   para ignorar: destruir dado real exige backup e um rollback manual escrito
--   para aquele caso.
--
--   pcp_corte_tipo fica de fora da guarda: são os seeds do domínio.
-- ===========================================================================

begin;

-- Recusa tudo se houver dado. O detalhe da exceção lista tabela e contagem.
select public.pcp_corte_rollback_guarda();

-- ---------------------------------------------------------------------------
-- 1 · RPCs (assinatura exata — se alguém tiver recriado com outros tipos de
--     parâmetro, o DROP não acha e a função sobra; o smoke acusa)
-- ---------------------------------------------------------------------------
drop function if exists public.pcp_pedido_corte_congelar(text,jsonb,uuid);
drop function if exists public.pcp_pedido_corte_vincular(text,text,text,text,int,uuid);
drop function if exists public.pcp_projeto_corte_arquivar(text,int,uuid);
drop function if exists public.pcp_projeto_corte_salvar(jsonb,jsonb,jsonb,boolean,int,uuid);
drop function if exists public.pcp_fita_apagar(text,int,uuid);
drop function if exists public.pcp_fita_salvar(jsonb,int,uuid);

-- ---------------------------------------------------------------------------
-- 2 · tabelas, na ordem inversa da criação.
--     DROP TABLE não dispara trigger, então a imutabilidade da versão
--     publicada não atrapalha a reversão — ela protege UPDATE e DELETE de
--     linha, não a remoção da tabela.
--     CASCADE aqui só alcança o que a própria 147 criou (policies, índices,
--     triggers e as FKs internas do módulo). Nenhuma FK de fora aponta para
--     estas tabelas — inclusive porque a FK para pcp_pedido ficou de fora.
-- ---------------------------------------------------------------------------
drop table if exists public.pcp_pedido_projeto_corte          cascade;
drop table if exists public.pcp_projeto_corte_sortimento_item cascade;
drop table if exists public.pcp_projeto_corte_sortimento      cascade;
drop table if exists public.pcp_projeto_corte_fitilho         cascade;
drop table if exists public.pcp_projeto_corte_camada          cascade;
drop table if exists public.pcp_projeto_corte_corte           cascade;
drop table if exists public.pcp_projeto_corte_versao          cascade;
drop table if exists public.pcp_projeto_corte_regra           cascade;
drop table if exists public.pcp_projeto_corte                 cascade;
drop table if exists public.pcp_fita                          cascade;
drop table if exists public.pcp_corte_tipo                    cascade;

-- ---------------------------------------------------------------------------
-- 3 · funções, só depois que nenhuma tabela as usa.
--     A guarda sai por último: ela acabou de ser executada acima.
-- ---------------------------------------------------------------------------
drop function if exists public.pcp_pedido_corte_congelado_imutavel();
drop function if exists public.pcp_corte_filha_imutavel();
drop function if exists public.pcp_corte_versao_imutavel();
drop function if exists public.pcp_corte_marca_operacao();
drop function if exists public.pcp_corte_carimbo();
drop function if exists public.pcp_corte_rollback_guarda();

commit;

-- DEPOIS DO ROLLBACK o smoke não roda mais: ele lê as tabelas do módulo e
-- falha com "relation ... does not exist" — o que já é a prova. Para conferir
-- que não sobrou nada, use esta consulta, que não depende delas:
--
--   select coalesce(jsonb_agg(x order by x), '[]'::jsonb) as sobrou from (
--     select c.relname as x from pg_class c join pg_namespace n on n.oid = c.relnamespace
--      where n.nspname = 'public'
--        and c.relname ~ '^pcp_(fita|corte_|projeto_corte|pedido_projeto_corte)'
--     union all
--     select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public'
--        and (p.proname ~ 'corte' or p.proname ~ '^pcp_fita_')) s;
--
-- Tem que voltar []. E pcp_operacao continua lá, intacta.
