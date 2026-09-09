# Supabase do Sistema Moda Bicho

Este diretório versiona a estrutura e as mudanças do banco do PCP.

## Projeto conectado

- Projeto: `pcp-modabicho`
- Região: `sa-east-1`
- PostgreSQL: 17

## Estado inicial em 2026-09-09

O projeto do Supabase está ativo, mas a lista de migrations rastreadas pelo próprio Supabase está vazia. Isso significa que o banco já possui bastante estrutura criada, porém essas mudanças antigas não foram registradas como migrations formais no histórico do Supabase.

Inventário PCP atual encontrado no schema `public`:

- 32 tabelas `pcp_*`
- 5 views `pcp_*`
- 198 funções `pcp_*`

## Regra daqui para frente

Toda alteração nova de estrutura ou função do banco deve ser salva em `supabase/migrations/` no GitHub antes ou junto da aplicação no Supabase.

Use nomes como:

- `147_nome_da_mudanca.sql`
- `148_outra_mudanca.sql`

Nunca colocar neste repositório:

- senha do banco
- service role key
- tokens
- segredos de Edge Functions
- credenciais do Magazord

## Baseline

As migrations históricas 145 e 146 existiram no projeto, mas não aparecem no histórico de migrations do Supabase conectado. Elas devem ser reconstruídas a partir das definições reais atualmente instaladas no banco, em vez de inventar conteúdo retroativo.
