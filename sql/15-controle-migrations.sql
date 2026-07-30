-- =========================================================================
-- NORTE — Controle de migrations já aplicadas
-- =========================================================================
-- Rode este script no SQL Editor do Supabase, DEPOIS do
-- 14-preparacao-notificacoes-email.sql.
--
-- Por que isso existe: até aqui, a única forma de saber "já rodei essa SQL
-- ou não" era lembrar de cabeça ou vasculhar o histórico de conversa. Essa
-- tabela simples resolve isso — cada script novo, a partir de agora,
-- registra a si mesmo aqui ao final da execução. Pra conferir o que já foi
-- aplicado, basta rodar:
--
--   select * from migrations_aplicadas order by aplicada_em;
-- =========================================================================

create table if not exists migrations_aplicadas (
  arquivo text primary key,
  aplicada_em timestamptz default now()
);

-- Registra as migrations anteriores retroativamente (pra o controle já
-- nascer com o histórico completo, não só a partir de agora).
insert into migrations_aplicadas (arquivo) values
  ('01-schema.sql'),
  ('02-auth-trigger.sql'),
  ('03-dados-sistema.sql'),
  ('04-perfis-acesso.sql'),
  ('05-empresa-avancado.sql'),
  ('06-usuarios-permissoes.sql'),
  ('07-fix-desativar-usuario.sql'),
  ('08-escopo-estendido.sql'),
  ('09-auditoria-append-only.sql'),
  ('10-eventos-dominio.sql'),
  ('11-licenciamento-empresas.sql'),
  ('12-suspensao-empresas.sql'),
  ('13-metricas-super-admin.sql'),
  ('14-preparacao-notificacoes-email.sql'),
  ('15-controle-migrations.sql')
on conflict (arquivo) do nothing;

-- =========================================================================
-- FIM — a partir daqui, todo novo arquivo de migration deve terminar com:
--
--   insert into migrations_aplicadas (arquivo) values ('NOME-DO-ARQUIVO.sql')
--     on conflict (arquivo) do nothing;
--
-- O "on conflict do nothing" também serve de proteção extra: se alguém
-- rodar o mesmo script duas vezes sem querer, essa linha não quebra nem
-- duplica nada.
-- =========================================================================
