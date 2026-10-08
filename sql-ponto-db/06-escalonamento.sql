-- =========================================================================
-- NORTE — PONTO — Escalonamento de justificativas paradas
-- =========================================================================
-- Rode no SQL Editor do BANCO DE PONTO, depois do 05-banco-horas-competencia.sql.
--
-- Marca quando uma justificativa pendente passa de 3 dias sem decisão —
-- a Edge Function calcula isso sob demanda (toda vez que alguém abre a
-- lista de pendentes) e, na primeira vez que cruza o limite, envia um
-- aviso por e-mail ao substituto do gestor e ao RH.
-- =========================================================================

alter table justificativas_ponto
  add column if not exists escalonado boolean not null default false,
  add column if not exists escalonado_em timestamptz;
