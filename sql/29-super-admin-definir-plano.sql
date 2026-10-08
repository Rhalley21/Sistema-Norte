-- =========================================================================
-- NORTE — Super Admin define o PLANO de cada Empresa
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL, depois do 23-super-admin-link-pagamento.sql.
--
-- Mesmo princípio da função de link de pagamento: em vez de dar ao Super
-- Admin permissão de UPDATE amplo em dados_sistema (que deixaria sobrescrever
-- qualquer coisa da empresa), esta função troca cirurgicamente só
-- payload->'empresa'->'faturamento'->>'plano' — nada mais.
-- =========================================================================

create or replace function super_admin_definir_plano(
  p_empresa_id uuid,
  p_plano text
)
returns void
language plpgsql
security definer
as $$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o Super Admin pode definir o plano da empresa.';
  end if;

  if p_plano not in ('Essencial', 'Gestão', 'Estratégico') then
    raise exception 'Plano inválido: %', p_plano;
  end if;

  update dados_sistema
     set payload = jsonb_set(
           jsonb_set(
             coalesce(payload, '{}'::jsonb),
             '{empresa,faturamento}',
             coalesce(payload->'empresa'->'faturamento', '{}'::jsonb),
             true
           ),
           '{empresa,faturamento,plano}',
           to_jsonb(p_plano),
           true
         ),
         atualizado_em = now()
   where empresa_id = p_empresa_id;
end;
$$;

grant execute on function super_admin_definir_plano(uuid, text) to authenticated;

insert into migrations_aplicadas (arquivo) values ('29-super-admin-definir-plano.sql')
  on conflict (arquivo) do nothing;

-- =========================================================================
-- FIM
-- =========================================================================
