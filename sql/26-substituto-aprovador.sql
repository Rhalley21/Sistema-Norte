-- =========================================================================
-- NORTE — Substituto de aprovador (para quando o gestor está ausente)
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL, depois do 25-acesso-sem-email.sql.
--
-- Cada líder (ou RH/owner) pode indicar um substituto — outro líder ou RH
-- da mesma empresa — que também poderá aprovar justificativas quando o
-- pedido demorar demais sem decisão (ver Edge Function "ponto", ação
-- justificativa_pendentes: escalona após 3 dias sem decisão).
-- =========================================================================

alter table perfis
  add column if not exists substituto_perfil_id uuid references perfis(id) on delete set null;

insert into migrations_aplicadas (arquivo) values ('26-substituto-aprovador.sql')
  on conflict (arquivo) do nothing;
