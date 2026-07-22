-- =========================================================================
-- NORTE — Escopo estendido para Gestores (extensão de RBAC — PRD Cap. 3, sem RN própria)
-- =========================================================================
-- Por padrão, um Gestor só vê dados agregados da própria equipe. Esta coluna
-- permite ao Administrador conceder, caso a caso, uma exceção explícita para
-- um Gestor específico ver o dashboard consolidado da empresa toda.
-- =========================================================================

alter table perfis add column if not exists escopo_estendido boolean default false;
