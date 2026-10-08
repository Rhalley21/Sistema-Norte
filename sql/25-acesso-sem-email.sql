-- =========================================================================
-- NORTE — Acesso sem e-mail (login provisório gerado pelo RH)
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL, depois do 23-super-admin-link-pagamento.sql.
--
-- Para quem não tem e-mail/celular corporativo: o RH gera um "login" (uma
-- espécie de matrícula) e uma senha provisória. Por baixo, o Supabase Auth
-- exige um e-mail tecnicamente — usamos um formato interno
-- (login@empresa.acesso.norte.local) que nunca é enviado a lugar nenhum,
-- só serve de identificador. A pessoa troca a senha provisória por uma
-- própria no primeiro login (aqui marcamos que é obrigatório).
-- =========================================================================

alter table perfis
  add column if not exists senha_provisoria boolean not null default false;

-- Função que gera o acesso: cria o convite (reaproveitando o mecanismo já
-- existente) e devolve o código pra Edge Function usar no cadastro do
-- usuário. Só Super Admin/owner/rh podem chamar (checado pela política da
-- tabela convites, que já restringe por empresa_do_usuario()).
-- (Nenhuma função nova necessária aqui — a Edge Function insere direto na
-- tabela convites com a service role key, e a trigger handle_new_user já
-- existente faz o resto quando o usuário é criado.)

insert into migrations_aplicadas (arquivo) values ('25-acesso-sem-email.sql')
  on conflict (arquivo) do nothing;
