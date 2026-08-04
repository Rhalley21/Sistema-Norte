-- =========================================================================
-- NORTE — Webhooks públicos sobre eventos de domínio
-- =========================================================================
-- Rode este script no SQL Editor do Supabase, DEPOIS do
-- 17-notificacoes-in-app.sql.
--
-- O que isso faz: o sistema já grava, desde a v0.7.0, todo evento
-- importante (ciclo.aberto, pdi.aprovado, diagnostico.gerado etc.) na
-- tabela eventos_dominio — mas até agora ninguém "de fora" era avisado
-- disso. Agora, quando uma empresa cadastra uma URL de webhook, TODA vez
-- que um evento relevante acontecer, o Supabase chama essa URL sozinho
-- (via um gatilho no banco, usando a extensão pg_net) — sem precisar do
-- navegador da pessoa estar aberto, e sem vocês terem que construir uma
-- integração específica pra cada sistema externo (folha, ATS, Slack etc.
-- ficam do lado de fora, "escutando" o webhook).
--
-- IMPORTANTE — teste depois de rodar: a sintaxe exata de pg_net pode
-- variar um pouco conforme a versão do Supabase. Depois de rodar este
-- script, cadastre um webhook de teste (ex.: usando um site como
-- webhook.site, que gera uma URL só pra você ver o que chega) e confirme
-- que os dados chegam certinho antes de usar em produção.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) Extensão pg_net — permite o Postgres fazer chamadas HTTP (assíncronas)
-- -------------------------------------------------------------------------
create extension if not exists pg_net;

-- -------------------------------------------------------------------------
-- 2) Tabela de webhooks configurados por Empresa
-- -------------------------------------------------------------------------
create table webhooks_configurados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  nome text, -- rótulo livre (ex.: "Slack do RH", "Integração folha XPTO")
  url text not null,
  eventos text[], -- null ou vazio = recebe TODOS os eventos da empresa
  secreto text not null default encode(gen_random_bytes(24), 'hex'),
  ativo boolean default true,
  criado_por uuid references perfis(id),
  criado_em timestamptz default now(),
  ultima_chamada_em timestamptz
);

alter table webhooks_configurados enable row level security;

create policy "dono/rh gerencia webhooks da propria empresa"
  on webhooks_configurados for all
  using (empresa_id = empresa_do_usuario() and meu_papel() in ('owner','rh'))
  with check (empresa_id = empresa_do_usuario() and meu_papel() in ('owner','rh'));

-- -------------------------------------------------------------------------
-- 3) Gatilho: sempre que um evento de domínio é gravado, dispara os
--    webhooks cadastrados daquela empresa que estejam interessados nele
-- -------------------------------------------------------------------------
create or replace function disparar_webhooks_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  webhook record;
begin
  for webhook in
    select * from webhooks_configurados
    where empresa_id = new.empresa_id
      and ativo = true
      and (eventos is null or array_length(eventos,1) is null or new.evento = any(eventos))
  loop
    perform net.http_post(
      url := webhook.url,
      body := jsonb_build_object(
        'evento', new.evento,
        'payload', new.payload,
        'empresa_id', new.empresa_id,
        'criado_em', new.criado_em
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-NORTE-Signature', webhook.secreto
      )
    );
    update webhooks_configurados set ultima_chamada_em = now() where id = webhook.id;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_disparar_webhooks on eventos_dominio;
create trigger trg_disparar_webhooks
  after insert on eventos_dominio
  for each row execute function disparar_webhooks_evento();

insert into migrations_aplicadas (arquivo) values ('18-webhooks-eventos-dominio.sql')
  on conflict (arquivo) do nothing;

-- =========================================================================
-- FIM
-- =========================================================================
