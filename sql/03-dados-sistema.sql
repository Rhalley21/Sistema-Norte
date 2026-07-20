-- =========================================================================
-- NORTE — Passo 3: tabela para os dados do sistema (cargos, colaboradores,
-- avaliações, cultura, banco de ações) ligados à empresa logada.
-- =========================================================================

create table dados_sistema (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  payload jsonb not null default '{}',
  atualizado_em timestamptz default now()
);

alter table dados_sistema enable row level security;

create policy "acesso por empresa - dados_sistema"
  on dados_sistema for all
  using (empresa_id = empresa_do_usuario());
