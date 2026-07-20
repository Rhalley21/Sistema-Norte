-- =========================================================================
-- NORTE — Perfis de acesso: convites e visibilidade entre colegas
-- =========================================================================
-- Rode este script no SQL Editor do Supabase (New query > colar > Run).
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) Tabela de convites
-- -------------------------------------------------------------------------
create table convites (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  codigo text unique not null,
  papel text check (papel in ('rh','lider','colaborador')) not null,
  usado boolean default false,
  criado_por uuid references perfis(id),
  criado_em timestamptz default now()
);

alter table convites enable row level security;

-- Só quem já é da empresa pode ver/criar convites daquela empresa
create policy "acesso por empresa - convites"
  on convites for all
  using (empresa_id = empresa_do_usuario());

-- -------------------------------------------------------------------------
-- 2) Perfis: agora dá pra ver os colegas da mesma empresa (não só a si mesmo)
-- -------------------------------------------------------------------------
drop policy if exists "usuario ve o proprio perfil" on perfis;

create policy "ve perfis da mesma empresa"
  on perfis for select
  using (empresa_id = empresa_do_usuario());

-- -------------------------------------------------------------------------
-- 3) Trigger atualizada: suporta cadastro com código de convite
-- -------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nova_empresa_id uuid;
  convite_encontrado record;
  codigo_recebido text;
begin
  codigo_recebido := new.raw_user_meta_data->>'codigo_convite';

  if codigo_recebido is not null and codigo_recebido <> '' then
    -- Cadastro via convite: entra numa empresa já existente
    select * into convite_encontrado
      from convites
      where codigo = codigo_recebido and usado = false
      limit 1;

    if convite_encontrado is null then
      raise exception 'Código de convite inválido ou já utilizado.';
    end if;

    insert into perfis (id, empresa_id, nome, papel)
      values (new.id, convite_encontrado.empresa_id, new.raw_user_meta_data->>'nome', convite_encontrado.papel);

    update convites set usado = true where id = convite_encontrado.id;
  else
    -- Cadastro normal: cria empresa nova e vira dono
    insert into empresas (nome_fantasia)
      values (new.raw_user_meta_data->>'nome_empresa')
      returning id into nova_empresa_id;

    insert into perfis (id, empresa_id, nome, papel)
      values (new.id, nova_empresa_id, new.raw_user_meta_data->>'nome', 'owner');
  end if;

  return new;
end;
$$;

-- =========================================================================
-- FIM
-- =========================================================================
