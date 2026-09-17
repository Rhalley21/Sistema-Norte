-- =========================================================================
-- NORTE — PONTO — Justificativas / Abonos (faltas, atrasos, ajustes, atestados)
-- =========================================================================
-- Rode no SQL Editor do BANCO DE PONTO (projeto separado, vpfesgdeykpaomewqqsm),
-- depois do 02-seguranca-batida.sql.
--
-- Fluxo: o colaborador cria uma justificativa (falta, atraso/saída antecipada,
-- esquecimento de bater ponto, ou atestado com foto) → o gestor/RH aprova ou
-- rejeita. Quando aprovada, o cálculo de horas passa a ABONAR aquele dia
-- (não conta atraso/falta). A validação de quem pode criar/aprovar é feita na
-- Edge Function "ponto" (confere o papel no projeto principal).
-- =========================================================================

create table if not exists justificativas_ponto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  perfil_id uuid not null,          -- quem pediu (colaborador)
  colaborador_id uuid,              -- referência lógica ao cadastro
  tipo text not null check (tipo in ('falta', 'atraso_saida', 'ajuste_ponto', 'atestado')),
  data_ref date not null,           -- o dia que a justificativa cobre
  motivo text not null,
  hora_ajuste text,                 -- só p/ ajuste_ponto: horário correto (HH:MM), opcional
  atestado_path text,               -- caminho da foto no bucket "atestados-ponto", se houver
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'rejeitada')),
  motivo_decisao text,              -- observação de quem aprovou/rejeitou
  decidido_por uuid,                -- perfil do gestor/RH que decidiu
  decidido_em timestamptz,
  criado_em timestamptz not null default now()
);

create index if not exists idx_justificativas_empresa on justificativas_ponto (empresa_id, data_ref);
create index if not exists idx_justificativas_perfil on justificativas_ponto (perfil_id, data_ref);
create index if not exists idx_justificativas_status on justificativas_ponto (empresa_id, status);

alter table justificativas_ponto enable row level security;
-- Sem políticas: só a Edge Function (service_role) acessa; o navegador nunca
-- fala direto com esta tabela. Mesma proteção da tabela registros_ponto.

-- =========================================================================
-- BUCKET DE STORAGE PARA OS ATESTADOS
-- -------------------------------------------------------------------------
-- Crie um bucket PRIVADO para as fotos de atestado (documentos pessoais):
--   1) No projeto de PONTO, menu "Storage".
--   2) "New bucket" -> nome EXATO:  atestados-ponto
--   3) Deixe PRIVADO (não público). A Edge Function usa a service_role key
--      para subir e gerar URLs temporárias de leitura (LGPD: documento médico
--      é dado sensível — nunca exposto por URL pública).
-- =========================================================================
