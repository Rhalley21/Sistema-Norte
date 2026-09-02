-- =========================================================================
-- NORTE — Super Admin edita SÓ o link de pagamento de cada Empresa
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL, depois do 13-metricas-super-admin.sql.
--
-- Por que uma função, e não uma policy de UPDATE ampla: dar UPDATE do
-- dados_sistema inteiro ao Super Admin deixaria ele sobrescrever QUALQUER
-- coisa da Empresa (colaboradores, ciclos, tudo) — poder demais só pra
-- editar um link. Esta função troca cirurgicamente apenas
-- payload->'empresa'->'faturamento'->>'linkPagamento', sem tocar em mais
-- nada, e só roda se quem chamou for Super Admin. O WhatsApp de cobrança
-- continua sendo o dono da Empresa quem preenche (não é mexido aqui).
-- =========================================================================

create or replace function super_admin_definir_link_pagamento(
  p_empresa_id uuid,
  p_link text
)
returns void
language plpgsql
security definer
as $$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o Super Admin pode definir o link de pagamento.';
  end if;

  update dados_sistema
     set payload = jsonb_set(
           -- garante que o caminho empresa->faturamento exista antes de setar
           jsonb_set(
             coalesce(payload, '{}'::jsonb),
             '{empresa,faturamento}',
             coalesce(payload->'empresa'->'faturamento', '{}'::jsonb),
             true
           ),
           '{empresa,faturamento,linkPagamento}',
           to_jsonb(p_link),
           true
         ),
         atualizado_em = now()
   where empresa_id = p_empresa_id;
end;
$$;

-- Permite que usuários autenticados CHAMEM a função (a checagem de Super
-- Admin acontece dentro dela — quem não for, recebe erro).
grant execute on function super_admin_definir_link_pagamento(uuid, text) to authenticated;

insert into migrations_aplicadas (arquivo) values ('23-super-admin-link-pagamento.sql')
  on conflict (arquivo) do nothing;

-- =========================================================================
-- FIM
-- =========================================================================
