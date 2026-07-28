-- =========================================================================
-- NORTE — Suspender acesso de Empresas já ativas (Super Admin)
-- =========================================================================
-- Rode este script no SQL Editor do Supabase, DEPOIS do
-- 11-licenciamento-empresas.sql.
--
-- O que muda: até aqui, o Super Admin só controlava quem consegue CRIAR
-- uma Empresa nova (código de licença). Não existia jeito de suspender o
-- acesso de uma Empresa já ativa (ex.: parou de pagar, contrato encerrado).
-- Agora existe.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) Nova coluna: acesso_suspenso
-- -------------------------------------------------------------------------
alter table empresas add column if not exists acesso_suspenso boolean default false;
alter table empresas add column if not exists suspensa_em timestamptz;
alter table empresas add column if not exists suspensa_por uuid references super_admins(id);

-- -------------------------------------------------------------------------
-- 2) Super Admin pode atualizar qualquer Empresa (pra suspender/reativar) —
--    a política de SELECT "super admin ve todas as empresas" já existia
--    desde o script anterior; faltava a de UPDATE.
-- -------------------------------------------------------------------------
create policy "super admin atualiza qualquer empresa"
  on empresas for update
  using (sou_super_admin())
  with check (sou_super_admin());

-- -------------------------------------------------------------------------
-- 3) Bloqueio de login pra Empresas suspensas
-- -------------------------------------------------------------------------
-- A checagem de "esta Empresa está suspensa?" acontece no front-end, no
-- momento do login (iniciarComSessao, em js/19-auth.js) — não precisa de
-- trigger nova aqui, só da coluna e da permissão de update acima. O
-- front-end consulta `empresas.acesso_suspenso` pela mesma empresa_id do
-- perfil de quem está logando, e barra o acesso se estiver suspenso.

-- =========================================================================
-- FIM
-- =========================================================================
