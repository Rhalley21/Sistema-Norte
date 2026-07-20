-- =========================================================================
-- NORTE — Módulo Usuários e Permissões (Cap. 4.3 do PRD)
-- =========================================================================
-- Rode no SQL Editor do Supabase (New query > colar > Run).
-- =========================================================================

-- 1) Desativação de usuário (RN: nunca exclusão física — histórico de
--    avaliações em que participou como avaliador/avaliado é preservado,
--    porque só marcamos a conta como desativada, sem apagar nada).
alter table perfis add column if not exists desativado boolean default false;

-- 2) Vínculo à Estrutura Organizacional (unidade/setor) no momento do convite.
--    Obs.: a Estrutura Organizacional vive no payload JSON de dados_sistema
--    (não é uma tabela relacional própria), então guardamos aqui apenas a
--    referência (id + nome) para exibição — não é uma foreign key de banco.
alter table convites add column if not exists estrutura_id text;
alter table convites add column if not exists estrutura_nome text;
alter table perfis add column if not exists estrutura_id text;
alter table perfis add column if not exists estrutura_nome text;

-- 3) Trigger de cadastro atualizada: agora também copia o vínculo de
--    estrutura do convite para o perfil criado.
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
    select * into convite_encontrado
      from convites
      where codigo = codigo_recebido and usado = false
      limit 1;

    if convite_encontrado is null then
      raise exception 'Código de convite inválido ou já utilizado.';
    end if;

    insert into perfis (id, empresa_id, nome, papel, estrutura_id, estrutura_nome)
      values (
        new.id, convite_encontrado.empresa_id, new.raw_user_meta_data->>'nome',
        convite_encontrado.papel, convite_encontrado.estrutura_id, convite_encontrado.estrutura_nome
      );

    update convites set usado = true where id = convite_encontrado.id;
  else
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
