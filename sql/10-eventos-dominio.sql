-- =========================================================================
-- NORTE — RNF011 (LGPD) e RNF012 (barramento de eventos de domínio)
-- =========================================================================

-- 1) Tabela de eventos de domínio — um "barramento" simples, guardando
--    cada evento relevante (ex: avaliacao.encerrada, pdi.criado) para que
--    futuras integrações (ERP, LMS, Power BI, etc.) consumam sem precisar
--    mexer no núcleo do sistema.
create table if not exists eventos_dominio (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  evento text not null,
  payload jsonb default '{}',
  criado_em timestamptz default now()
);

alter table eventos_dominio enable row level security;

create policy "eventos_dominio - consulta por empresa"
  on eventos_dominio for select
  using (empresa_id = empresa_do_usuario());

create policy "eventos_dominio - insercao por empresa"
  on eventos_dominio for insert
  with check (empresa_id = empresa_do_usuario());

-- Sem UPDATE/DELETE de propósito — mesmo princípio de imutabilidade da auditoria.

-- =========================================================================
-- FIM
-- =========================================================================
