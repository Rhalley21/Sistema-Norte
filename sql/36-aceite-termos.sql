-- =========================================================================
-- NORTE — Registro do aceite dos Termos de Uso / Política de Privacidade
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL.
--
-- Adiciona a coluna que guarda QUANDO a pessoa aceitou os Termos (não só
-- um "sim/não" — a data exata, que serve de prova em caso de disputa), e
-- atualiza a trigger de cadastro (handle_new_user) pra gravar isso
-- automaticamente, a partir do que o formulário de cadastro já manda.
-- =========================================================================

alter table perfis add column if not exists termos_aceitos_em timestamptz;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  nova_empresa_id uuid;
  convite_encontrado record;
  codigo_convite_recebido text;
  codigo_licenca_recebido text;
  licenca_encontrada record;
  trial_expira timestamptz;
  aceite_termos_recebido timestamptz;
begin
  codigo_convite_recebido := new.raw_user_meta_data->>'codigo_convite';
  codigo_licenca_recebido := new.raw_user_meta_data->>'codigo_licenca';
  -- Se o front-end não mandar a data exata (aceite_termos_em), mas mandar
  -- aceite_termos=true, usa o momento do cadastro como data do aceite.
  aceite_termos_recebido := coalesce(
    (new.raw_user_meta_data->>'aceite_termos_em')::timestamptz,
    case when (new.raw_user_meta_data->>'aceite_termos')::boolean is true then now() else null end
  );

  if codigo_convite_recebido is not null and codigo_convite_recebido <> '' then
    select * into convite_encontrado
      from convites
      where codigo = codigo_convite_recebido and usado = false
      limit 1;

    if convite_encontrado is null then
      raise exception 'Código de convite inválido ou já utilizado.';
    end if;

    insert into perfis (id, empresa_id, nome, papel, email, termos_aceitos_em)
      values (new.id, convite_encontrado.empresa_id, new.raw_user_meta_data->>'nome', convite_encontrado.papel, new.email, aceite_termos_recebido);

    update convites set usado = true where id = convite_encontrado.id;
  else
    if codigo_licenca_recebido is null or codigo_licenca_recebido = '' then
      raise exception 'É necessário um código de licença para cadastrar uma nova Empresa. Entre em contato com o Instituto INETRIS.';
    end if;

    select * into licenca_encontrada
      from codigos_licenca_empresa
      where codigo = codigo_licenca_recebido and usado = false
      limit 1;

    if licenca_encontrada is null then
      raise exception 'Código de licença inválido ou já utilizado. Entre em contato com o Instituto INETRIS.';
    end if;

    if licenca_encontrada.trial_dias is not null then
      trial_expira := now() + (licenca_encontrada.trial_dias || ' days')::interval;
    else
      trial_expira := null;
    end if;

    insert into empresas (nome_fantasia, ponto_habilitado, trial_ate)
      values (
        new.raw_user_meta_data->>'nome_empresa',
        coalesce(licenca_encontrada.ponto_habilitado, false),
        trial_expira
      )
      returning id into nova_empresa_id;

    insert into perfis (id, empresa_id, nome, papel, email, termos_aceitos_em)
      values (new.id, nova_empresa_id, new.raw_user_meta_data->>'nome', 'owner', new.email, aceite_termos_recebido);

    update codigos_licenca_empresa
      set usado = true, empresa_id = nova_empresa_id, usado_em = now()
      where id = licenca_encontrada.id;
  end if;

  return new;
end;
$function$;

insert into migrations_aplicadas (arquivo) values ('36-aceite-termos.sql')
  on conflict (arquivo) do nothing;
