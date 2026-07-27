-- =========================================================================
-- NORTE — Licenciamento de novas Empresas (controle do dono da plataforma)
-- =========================================================================
-- Rode este script no SQL Editor do Supabase, DEPOIS de todos os scripts
-- anteriores (01 a 10).
--
-- O que muda: hoje, qualquer pessoa que chega na tela de cadastro e escolhe
-- "não tenho convite" consegue criar uma Empresa nova sozinha, sem nenhum
-- controle. Isso deixa de existir — a partir de agora, criar uma Empresa
-- nova exige um "código de licença", que só o Instituto INETRIS (dono da
-- Metodologia NORTE) consegue gerar, através de uma conta marcada como
-- "Super Admin" da plataforma (um nível ACIMA do Administrador de cada
-- Empresa — o Super Admin enxerga todas as Empresas, o Administrador comum
-- só enxerga a própria).
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) Quem é Super Admin da plataforma (não confundir com Administrador de
--    uma Empresa — isso aqui é o dono do NORTE em si)
-- -------------------------------------------------------------------------
create table super_admins (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  criado_em timestamptz default now()
);

alter table super_admins enable row level security;

create or replace function sou_super_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists(select 1 from super_admins where id = auth.uid())
$$;

-- Um Super Admin só enxerga a lista de Super Admins (pra saber quem mais
-- tem esse acesso) — ninguém de fora vê essa tabela.
create policy "so super admin ve super admins"
  on super_admins for select
  using (sou_super_admin());

-- IMPORTANTE — passo manual único: depois de rodar este script, você
-- (dono da conta que representa o Instituto INETRIS) precisa se inserir
-- manualmente nesta tabela pelo menos uma vez, rodando (com seu próprio
-- user id, visível em Authentication > Users no painel do Supabase):
--
--   insert into super_admins (id, nome) values ('SEU-USER-ID-AQUI', 'Seu nome');
--
-- Sem essa linha, ninguém tem acesso de Super Admin — nem você.

-- -------------------------------------------------------------------------
-- 2) Códigos de licença — um código por Empresa nova autorizada
-- -------------------------------------------------------------------------
create table codigos_licenca_empresa (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nome_empresa_sugerido text, -- rótulo livre, só pra você lembrar pra quem foi gerado (ex.: "Lacle")
  usado boolean default false,
  empresa_id uuid references empresas(id) on delete set null, -- preenchido quando o código é de fato usado no cadastro
  criado_por uuid references super_admins(id),
  criado_em timestamptz default now(),
  usado_em timestamptz
);

alter table codigos_licenca_empresa enable row level security;

create policy "so super admin mexe em codigos de licenca"
  on codigos_licenca_empresa for all
  using (sou_super_admin())
  with check (sou_super_admin());

-- -------------------------------------------------------------------------
-- 3) Super Admin enxerga TODAS as Empresas (além da política já existente
--    de "cada Empresa só vê a si mesma", que continua valendo pra todo
--    mundo que não for Super Admin)
-- -------------------------------------------------------------------------
create policy "super admin ve todas as empresas"
  on empresas for select
  using (sou_super_admin());

-- -------------------------------------------------------------------------
-- 4) Trigger de cadastro atualizada: cadastro sem convite agora exige um
--    código de licença válido e ainda não usado
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
  codigo_convite_recebido text;
  codigo_licenca_recebido text;
  licenca_encontrada record;
begin
  codigo_convite_recebido := new.raw_user_meta_data->>'codigo_convite';
  codigo_licenca_recebido := new.raw_user_meta_data->>'codigo_licenca';

  if codigo_convite_recebido is not null and codigo_convite_recebido <> '' then
    -- Cadastro via convite: entra numa empresa já existente (sem mudança aqui)
    select * into convite_encontrado
      from convites
      where codigo = codigo_convite_recebido and usado = false
      limit 1;

    if convite_encontrado is null then
      raise exception 'Código de convite inválido ou já utilizado.';
    end if;

    insert into perfis (id, empresa_id, nome, papel)
      values (new.id, convite_encontrado.empresa_id, new.raw_user_meta_data->>'nome', convite_encontrado.papel);

    update convites set usado = true where id = convite_encontrado.id;
  else
    -- BUG DE SEGURANÇA CORRIGIDO: antes, qualquer pessoa sem convite conseguia
    -- criar uma Empresa nova sozinha. Agora isso exige um código de licença
    -- válido, gerado por um Super Admin da plataforma (ver seção 2 acima).
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

    insert into empresas (nome_fantasia)
      values (new.raw_user_meta_data->>'nome_empresa')
      returning id into nova_empresa_id;

    insert into perfis (id, empresa_id, nome, papel)
      values (new.id, nova_empresa_id, new.raw_user_meta_data->>'nome', 'owner');

    update codigos_licenca_empresa
      set usado = true, empresa_id = nova_empresa_id, usado_em = now()
      where id = licenca_encontrada.id;
  end if;

  return new;
end;
$$;

-- =========================================================================
-- FIM — a partir de agora, criar uma Empresa nova exige um código de
-- licença válido. A tela de "Super Admin" no front-end (nova aba, visível
-- só pra quem está na tabela super_admins) é onde esses códigos são
-- gerados e acompanhados.
-- =========================================================================
