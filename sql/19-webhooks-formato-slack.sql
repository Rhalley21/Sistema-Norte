-- =========================================================================
-- NORTE — Formato amigável pro Slack nos Webhooks
-- =========================================================================
-- Rode este script no SQL Editor do Supabase, DEPOIS do
-- 18-webhooks-eventos-dominio.sql.
--
-- O que muda: o Slack só entende mensagens no formato {"text": "..."} —
-- diferente do JSON genérico ({"evento":..., "payload":...}) que os
-- outros webhooks recebem. Esta atualização detecta automaticamente se a
-- URL cadastrada é do Slack (contém "hooks.slack.com") e, nesse caso,
-- manda uma mensagem de texto legível em vez do JSON bruto. Pra qualquer
-- outra URL (webhook.site, Zapier, ATS etc.), continua mandando o mesmo
-- JSON de sempre — nada muda pra quem já está usando.
-- =========================================================================

create or replace function disparar_webhooks_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  webhook record;
  eh_slack boolean;
  mensagem_texto text;
  corpo_chamada jsonb;
begin
  for webhook in
    select * from webhooks_configurados
    where empresa_id = new.empresa_id
      and ativo = true
      and (eventos is null or array_length(eventos,1) is null or new.evento = any(eventos))
  loop
    eh_slack := webhook.url ilike '%hooks.slack.com%';

    if eh_slack then
      mensagem_texto := '📋 *Plataforma NORTE* — evento: `' || new.evento || '`' ||
        case when new.payload is not null and new.payload != '{}'::jsonb
          then E'\n' || new.payload::text
          else ''
        end;
      corpo_chamada := jsonb_build_object('text', mensagem_texto);
    else
      corpo_chamada := jsonb_build_object(
        'evento', new.evento,
        'payload', new.payload,
        'empresa_id', new.empresa_id,
        'criado_em', new.criado_em
      );
    end if;

    perform net.http_post(
      url := webhook.url,
      body := corpo_chamada,
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

insert into migrations_aplicadas (arquivo) values ('19-webhooks-formato-slack.sql')
  on conflict (arquivo) do nothing;

-- =========================================================================
-- FIM
-- =========================================================================
