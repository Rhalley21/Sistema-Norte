-- =========================================================================
-- NORTE — PONTO — banco SEPARADO — jornada com 4 marcações + justificativa
-- =========================================================================
-- Este arquivo roda no MESMO projeto Supabase separado do sql-ponto-db/01-schema.sql
-- (não no projeto principal do NORTE) — é uma continuação daquele schema,
-- não um substituto. Cole no SQL Editor do projeto de ponto.
--
-- O que muda:
-- 1) `tipo` passa de 2 valores (entrada/saida) pra 4 — entrada, saída pro
--    almoço, volta do almoço, saída final — batendo com a "Jornada de
--    trabalho" configurada por colaborador (js/13-page-colaboradores.js).
-- 2) Nova coluna `motivo_atraso`: quando alguém bate um desses 4 marcos
--    depois do horário da própria jornada (+ 5 min de tolerância), a tela
--    pede uma explicação antes de registrar — guardada aqui, e mostrada
--    de volta no relatório semanal de ponto (RH/Administrador).
-- =========================================================================

-- Remove a restrição antiga (só entrada/saida) e cria uma nova, com os 4
-- tipos. `alter table ... drop constraint` exige o nome exato da
-- constraint — o Postgres gera esse nome automaticamente a partir do
-- nome da coluna quando declarada como `tipo text not null check (...)`
-- sem nome explícito, no padrão `<tabela>_<coluna>_check`.
alter table registros_ponto drop constraint if exists registros_ponto_tipo_check;
alter table registros_ponto add constraint registros_ponto_tipo_check
  check (tipo in ('entrada', 'saida_almoco', 'volta_almoco', 'saida'));

alter table registros_ponto add column if not exists motivo_atraso text;

comment on column registros_ponto.motivo_atraso is
  'Preenchido só quando a batida aconteceu depois do horário da jornada da pessoa (+5min de tolerância) — explicação que ela mesma digitou na hora de bater. Nulo quando a batida foi no horário.';

-- =========================================================================
-- FIM
-- =========================================================================
