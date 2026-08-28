-- =========================================================================
-- NORTE — Ponto habilitado por Empresa (escolhido ao gerar o código de licença)
-- =========================================================================
-- Rode este script no SQL Editor do projeto PRINCIPAL (o de sempre,
-- mgkmvrgfmuexgxkuslur), DEPOIS do 14-preparacao-notificacoes-email.sql.
--
-- Ideia: em vez do módulo de Ponto aparecer pra toda empresa sempre (como
-- estava), agora cada Empresa tem uma chave liga/desliga. O Super Admin
-- decide isso na hora de gerar o código de licença (sim/não), e a escolha
-- é copiada pra Empresa nova quando o código é usado no cadastro.
-- =========================================================================

-- 1) A chave definitiva mora na Empresa. É ela que o sistema lê no login.
alter table empresas
  add column if not exists ponto_habilitado boolean not null default false;

-- Empresas que já existem estavam com o Ponto visível pra todo mundo
-- (comportamento anterior). Preserva isso pra não sumir o módulo de quem já
-- usava — as NOVAS é que passam a nascer desligadas, a não ser que a licença
-- diga sim.
update empresas set ponto_habilitado = true;

-- 2) O código de licença carrega a escolha feita pelo Super Admin.
alter table codigos_licenca_empresa
  add column if not exists ponto_habilitado boolean not null default false;

-- 3) Trigger de cadastro: mesma da migration 14, com uma única adição —
--    ao criar a Empresa a partir do código de licença, copia o
--    ponto_habilitado da licença pra Empresa nova.
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

    -- ÚNICA MUDANÇA em relação à migration 14: copia a escolha de Ponto da
    -- licença pra Empresa nova.
    insert into empresas (nome_fantasia, ponto_habilitado)
      values (new.raw_user_meta_data->>'nome_empresa', coalesce(licenca_encontrada.ponto_habilitado, false))
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

insert into migrations_aplicadas (arquivo) values ('21-ponto-por-empresa.sql')
  on conflict (arquivo) do nothing;

-- =========================================================================
-- FIM
-- =========================================================================
