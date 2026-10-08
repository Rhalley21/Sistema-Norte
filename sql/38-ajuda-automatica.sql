-- =========================================================================
-- NORTE — Central de Ajuda automática
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL, depois do 37-folha-ponto-papel.sql.
--
-- O que muda nos chamados de suporte:
--   * novo status "respondido_ia": a IA respondeu e o chamado espera o cliente
--     dizer se resolveu (se não disser nada, é encerrado sozinho em 3 dias);
--   * colunas pra saber quem respondeu, o que o cliente achou, se foi encerrado
--     automaticamente e quando a equipe foi lembrada pela última vez.
-- O cliente NÃO atualiza chamados direto (continua só inserindo e lendo): o
-- "resolveu / não resolveu" passa pela Edge Function "chamado-automatico".
-- =========================================================================

alter table chamados_suporte drop constraint if exists chamados_suporte_status_check;
alter table chamados_suporte
  add constraint chamados_suporte_status_check
  check (status in ('aberto', 'respondido_ia', 'em_andamento', 'resolvido'));

alter table chamados_suporte
  add column if not exists respondido_por_ia boolean not null default false,
  add column if not exists respondido_em timestamptz,
  add column if not exists ia_tentativas integer not null default 0,
  add column if not exists feedback_cliente text check (feedback_cliente in ('resolveu', 'nao_resolveu')),
  add column if not exists fechado_automaticamente boolean not null default false,
  add column if not exists lembrete_enviado_em timestamptz;

create index if not exists idx_chamados_suporte_status_criado on chamados_suporte (status, criado_em);

insert into migrations_aplicadas (arquivo) values ('38-ajuda-automatica.sql')
  on conflict (arquivo) do nothing;

-- =========================================================================
-- AGENDAMENTO DA ROTINA (encerrar chamados sem retorno, lembrar a equipe,
-- resumo diário). NÃO roda sozinho — precisa de 3 passos, uma vez só:
--
--  1) Database > Extensions: ative "pg_cron" e "pg_net".
--  2) Edge Functions > chamado-automatico > Secrets: crie CRON_SECRET com um
--     texto longo e aleatório (o mesmo que você vai colar abaixo).
--  3) Troque <PROJETO> e <CRON_SECRET> abaixo, tire os "-- " e rode:
--
-- select cron.schedule(
--   'ajuda-rotina',
--   '0 * * * *',  -- de hora em hora
--   $$ select net.http_post(
--        url := 'https://<PROJETO>.supabase.co/functions/v1/chamado-automatico',
--        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
--        body := '{"action":"rotina"}'::jsonb
--      ) $$
-- );
--
-- Pra conferir:  select * from cron.job;
-- Pra desligar:  select cron.unschedule('ajuda-rotina');
-- =========================================================================
