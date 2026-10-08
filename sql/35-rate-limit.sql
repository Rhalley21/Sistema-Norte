-- =========================================================================
-- NORTE — Limite de taxa (rate limit) para Edge Functions públicas
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL.
--
-- Registra cada tentativa de ação sensível (gerar teste grátis, enviar
-- candidatura) por IP. As próprias Edge Functions conferem, antes de
-- processar, quantas tentativas aquele IP já fez na janela de tempo — se
-- passou do limite, recusa com erro 429 (Too Many Requests).
-- =========================================================================

create table if not exists rate_limit_log (
  id uuid primary key default gen_random_uuid(),
  chave text not null, -- normalmente o IP do requisitante
  acao text not null,  -- 'teste_gratis' | 'candidatura_rs' | outras no futuro
  criado_em timestamptz not null default now()
);

create index if not exists idx_rate_limit_chave_acao on rate_limit_log (chave, acao, criado_em);

alter table rate_limit_log enable row level security;
-- De propósito: nenhuma política pra ninguém — só a service_role (as
-- próprias Edge Functions) lê e escreve aqui.

-- Limpeza automática: apaga registros com mais de 35 dias (os limites de uso contam
-- até 30 dias — apagar antes zeraria esses contadores), pra tabela não
-- crescer pra sempre. Roda via pg_cron, se a extensão já estiver ativa no
-- projeto; se não estiver, não quebra nada — só não limpa sozinho (dá pra
-- rodar o delete manualmente de vez em quando, sem problema nenhum).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'limpar-rate-limit-log',
      '0 3 * * *', -- todo dia às 3h
      $cron$delete from rate_limit_log where criado_em < now() - interval '35 days'$cron$
    );
  end if;
end $$;

insert into migrations_aplicadas (arquivo) values ('35-rate-limit.sql')
  on conflict (arquivo) do nothing;
