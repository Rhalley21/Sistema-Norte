-- =========================================================================
-- NORTE — Teste grátis de 7 dias (solicitação → aprovação → trial → bloqueio)
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL, depois do 23-super-admin-link-pagamento.sql.
--
-- Fluxo: visitante solicita teste (grava em solicitacoes_teste) → Super Admin
-- aprova (gera um código de licença marcado com trial_dias) → a pessoa se
-- cadastra com esse código → a Empresa nasce com trial_ate = agora + 7 dias.
-- No login, se trial_ate já passou e a empresa não virou pagante, o acesso é
-- bloqueado. A exclusão de dados é manual (Super Admin), nunca automática.
-- =========================================================================

-- 1) Tabela de solicitações de teste (o "pedido" que chega pra você aprovar).
create table if not exists solicitacoes_teste (
  id uuid primary key default gen_random_uuid(),
  nome_solicitante text not null,
  email text not null,
  nome_empresa text not null,
  telefone text,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada')),
  codigo_gerado text, -- o código de licença gerado ao aprovar
  criado_em timestamptz not null default now(),
  decidido_em timestamptz,
  decidido_por uuid references perfis(id)
);

alter table solicitacoes_teste enable row level security;

-- Qualquer visitante (mesmo sem login) pode CRIAR uma solicitação — é o
-- formulário público da tela de entrada. Mas ninguém anônimo LÊ a lista.
create policy "qualquer um cria solicitacao de teste"
  on solicitacoes_teste for insert
  with check (true);

-- Só Super Admin vê e decide as solicitações.
create policy "super admin le solicitacoes"
  on solicitacoes_teste for select
  using (sou_super_admin());
create policy "super admin atualiza solicitacoes"
  on solicitacoes_teste for update
  using (sou_super_admin());

-- 2) Campos de trial na Empresa e no código de licença.
alter table empresas
  add column if not exists trial_ate timestamptz,        -- quando o teste expira (null = não é teste)
  add column if not exists is_pagante boolean not null default false; -- virou cliente pagante?

alter table codigos_licenca_empresa
  add column if not exists trial_dias integer; -- se preenchido, a licença é de teste (nº de dias)

-- 3) Trigger de cadastro: além do ponto (migration 21), agora também define
--    trial_ate quando o código de licença é de teste.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nova_empresa_id uuid;
  convite_encontrado record;
  codigo_convite_recebido text;
  codigo_licenca_recebido text;
  licenca_encontrada record;
  trial_expira timestamptz;
begin
  codigo_convite_recebido := new.raw_user_meta_data->>'codigo_convite';
  codigo_licenca_recebido := new.raw_user_meta_data->>'codigo_licenca';

  if codigo_convite_recebido is not null and codigo_convite_recebido <> '' then
    select * into convite_encontrado
      from convites
      where codigo = codigo_convite_recebido and usado = false
      limit 1;

    if convite_encontrado is null then
      raise exception 'Código de convite inválido ou já utilizado.';
    end if;

    insert into perfis (id, empresa_id, nome, papel, email)
      values (new.id, convite_encontrado.empresa_id, new.raw_user_meta_data->>'nome', convite_encontrado.papel, new.email);

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

    -- Se a licença é de teste (trial_dias preenchido), calcula quando expira.
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

    insert into perfis (id, empresa_id, nome, papel, email)
      values (new.id, nova_empresa_id, new.raw_user_meta_data->>'nome', 'owner', new.email);

    update codigos_licenca_empresa
      set usado = true, empresa_id = nova_empresa_id, usado_em = now()
      where id = licenca_encontrada.id;
  end if;

  return new;
end;
$$;

insert into migrations_aplicadas (arquivo) values ('24-teste-gratis.sql')
  on conflict (arquivo) do nothing;

-- 4) Exclusão de dados de uma empresa (manual, só Super Admin). Apaga o
--    payload (dados_sistema), os registros de ponto ficam no outro projeto
--    (não são tocados aqui), e por fim a própria empresa (cascata leva
--    perfis, convites, etc.). É irreversível — por isso só roda pra Super
--    Admin e é chamada com dupla confirmação no front.
create or replace function super_admin_apagar_empresa(p_empresa_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not sou_super_admin() then
    raise exception 'Apenas o Super Admin pode apagar dados de uma empresa.';
  end if;
  delete from dados_sistema where empresa_id = p_empresa_id;
  delete from empresas where id = p_empresa_id;
end;
$$;

grant execute on function super_admin_apagar_empresa(uuid) to authenticated;

-- =========================================================================
-- FIM
-- =========================================================================
