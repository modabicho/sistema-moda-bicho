# Migrations

A partir desta pasta, cada mudança nova do banco do PCP deve ficar em um arquivo SQL próprio e versionado.

## Importante sobre o histórico antigo

O Supabase conectado não retorna migrations registradas, embora o banco já contenha toda a estrutura atual do PCP. Por isso, não vamos fabricar migrations antigas como se fossem o histórico original.

As alterações antigas serão tratadas como **baseline reconstruído do estado real do banco** quando necessário.

## Próxima numeração

A próxima migration nova deve continuar após a 146, usando `147_...sql`.

## Princípios

- banco em produção é a fonte real do baseline atual;
- mudanças futuras ficam no GitHub;
- DDL deve ser aplicada como migration;
- consultas de diagnóstico não entram como migration;
- nenhum segredo deve ser salvo aqui.
