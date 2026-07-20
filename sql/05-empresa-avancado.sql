-- =========================================================================
-- NORTE — Módulo Empresa (Cap. 4.1 do PRD): CNPJ único + auditoria
-- =========================================================================
-- Rode no SQL Editor do Supabase (New query > colar > Run).
-- =========================================================================

-- 1) Coluna de CNPJ na tabela empresas (fonte de verdade para checar duplicidade
--    entre TENANTS diferentes — os detalhes ricos da empresa continuam no
--    payload de dados_sistema, só o CNPJ também é espelhado aqui).
alter table empresas add column if not exists cnpj text;

-- 2) Índice único: impede que duas empresas (tenants) diferentes usem o
--    mesmo CNPJ. Ignora CNPJ vazio/nulo (empresa ainda não configurada).
create unique index if not exists empresas_cnpj_uidx
  on empresas (cnpj)
  where cnpj is not null and cnpj <> '';

-- 3) Tabela de auditoria — registra eventos importantes do sistema
--    (ex: "empresa.criada"), com quem fez e quando.
create table if not exists auditoria (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  evento text not null,
  detalhes jsonb default '{}',
  criado_por uuid references perfis(id),
  criado_em timestamptz default now()
);

alter table auditoria enable row level security;

create policy "acesso por empresa - auditoria"
  on auditoria for all
  using (empresa_id = empresa_do_usuario());

-- =========================================================================
-- FIM
-- =========================================================================
