-- =========================================================================
-- NORTE — Passo 2: criação automática de empresa + perfil no cadastro
-- =========================================================================
-- Rode este script no SQL Editor do Supabase DEPOIS do norte-schema.sql.
-- Ele faz o seguinte: toda vez que alguém se cadastra (auth.users),
-- o banco automaticamente:
--   1) cria uma linha nova em "empresas" com o nome informado no cadastro
--   2) cria o "perfil" dessa pessoa, ligando-a a essa empresa como 'owner'
-- =========================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  nova_empresa_id uuid;
begin
  insert into empresas (nome_fantasia)
    values (new.raw_user_meta_data->>'nome_empresa')
    returning id into nova_empresa_id;

  insert into perfis (id, empresa_id, nome, papel)
    values (new.id, nova_empresa_id, new.raw_user_meta_data->>'nome', 'owner');

  return new;
end;
$$;

-- Liga a função ao evento de "novo usuário criado"
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================================
-- FIM — a partir de agora, todo cadastro feito pela tela de login já cria
-- a empresa e o perfil de dono automaticamente, sem você precisar fazer
-- nada manual no banco.
-- =========================================================================
