-- =========================================================================
-- NORTE — Métricas agregadas para o Super Admin
-- =========================================================================
-- Rode este script no SQL Editor do Supabase, DEPOIS do
-- 12-suspensao-empresas.sql.
--
-- O que muda: o dashboard do Super Admin passa a mostrar números
-- consolidados de toda a plataforma (total de colaboradores, ciclos
-- abertos etc.). Como esses dados vivem dentro do "payload" (o blob de
-- dados por Empresa, na tabela dados_sistema), o Super Admin precisa de
-- permissão de LEITURA nessa tabela pra todas as Empresas — hoje ele só
-- enxerga a própria (o que nem se aplica, já que Super Admin não tem
-- Empresa de negócio própria necessariamente).
-- =========================================================================

create policy "super admin le dados_sistema de todas as empresas"
  on dados_sistema for select
  using (sou_super_admin());

-- Nenhuma permissão de escrita é concedida aqui de propósito — o Super
-- Admin só consulta, nunca edita os dados operacionais de uma Empresa.

-- =========================================================================
-- FIM
-- =========================================================================
