-- =========================================================================
-- NORTE — Preparação para notificações por e-mail
-- =========================================================================
-- Rode este script no SQL Editor do Supabase, DEPOIS do
-- 13-metricas-super-admin.sql.
--
-- Por que isso é necessário: o e-mail de cada pessoa fica guardado dentro
-- da autenticação (auth.users), que o aplicativo NÃO consegue consultar
-- diretamente por segurança (senão qualquer pessoa logada poderia
-- descobrir o e-mail de qualquer outra). Para poder enviar notificações,
-- guardamos uma cópia do e-mail em `perfis` (preenchida automaticamente no
-- cadastro) e adicionamos um campo de e-mail em `convites`, pra poder
-- mandar o código de convite direto pra pessoa certa.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) E-mail salvo em cada perfil (preenchido automaticamente no cadastro)
-- -------------------------------------------------------------------------
alter table perfis add column if not exists email text;

-- Preenche os perfis que já existem (cadastros feitos antes desta migration)
update perfis p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- -------------------------------------------------------------------------
-- 2) Convites passam a poder ter um e-mail de destino (opcional)
-- -------------------------------------------------------------------------
alter table convites add column if not exists email_destino text;

-- -------------------------------------------------------------------------
-- 3) Trigger de cadastro atualizada — passa a gravar o e-mail no perfil
--    automaticamente, junto com tudo que já gravava antes
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

    insert into empresas (nome_fantasia)
      values (new.raw_user_meta_data->>'nome_empresa')
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

-- =========================================================================
-- FIM
-- =========================================================================
