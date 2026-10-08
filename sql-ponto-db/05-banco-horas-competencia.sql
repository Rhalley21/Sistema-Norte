-- =========================================================================
-- NORTE — PONTO — Banco de Horas e Fechamento de Competência
-- =========================================================================
-- Rode no SQL Editor do BANCO DE PONTO (projeto vpfesgdeykpaomewqqsm),
-- depois do 04-justificativas-dias.sql.
--
-- Banco de horas: saldo acumulado (positivo ou negativo) por colaborador,
-- calculado a partir do atraso/extra de cada dia (dias abonados não entram).
-- Fechamento de competência: o RH "fecha" um mês; depois de fechado, aquele
-- período fica travado — não dá para criar/editar justificativa (inclusive
-- ajuste de ponto) que caia dentro dele, exceto reabertura por owner/rh,
-- que fica registrada.
-- =========================================================================

-- Competências (meses) fechadas, por empresa.
create table if not exists competencias_fechadas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  competencia date not null, -- sempre o dia 1º do mês fechado (ex: 2026-06-01)
  fechado_em timestamptz not null default now(),
  fechado_por uuid not null,
  reaberto boolean not null default false,
  reaberto_em timestamptz,
  reaberto_por uuid,
  motivo_reabertura text,
  unique (empresa_id, competencia)
);

create index if not exists idx_competencias_empresa on competencias_fechadas (empresa_id, competencia);

alter table competencias_fechadas enable row level security;
-- Sem políticas: só a Edge Function (service_role) acessa.

-- =========================================================================
-- Observação: o SALDO do banco de horas não precisa de uma tabela própria —
-- é calculado a partir de registros_ponto + jornada (que vive no cadastro do
-- colaborador, no banco principal) + justificativas_ponto (abonos), somando
-- atraso/extra de cada dia dentro do período. A Edge Function calcula isso
-- sob demanda (ação banco_horas_saldo), então o saldo é sempre consistente
-- com as batidas reais — não há um número "solto" para desincronizar.
-- =========================================================================
