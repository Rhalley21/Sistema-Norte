-- =========================================================================
-- NORTE — Central de Ajuda / Suporte estruturado
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL, depois do 33-fix-notificacoes-cross-empresa.sql.
--
-- Qualquer usuário logado abre um chamado pra própria empresa. Todo mundo
-- da mesma empresa consegue ver os chamados dela (transparência interna).
-- Só o Super Admin vê e atualiza o status de chamados de QUALQUER empresa.
-- =========================================================================

create table if not exists chamados_suporte (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  criado_por uuid references perfis(id),
  nome_solicitante text not null,
  email text not null,
  assunto text not null,
  mensagem text not null,
  status text not null default 'aberto' check (status in ('aberto', 'em_andamento', 'resolvido')),
  resposta text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references super_admins(id)
);

create index if not exists idx_chamados_suporte_empresa on chamados_suporte (empresa_id, status);

alter table chamados_suporte enable row level security;

-- Qualquer usuário autenticado cria chamado — só pra própria empresa.
create policy "usuario cria chamado para a propria empresa"
  on chamados_suporte for insert
  with check (empresa_id = empresa_do_usuario());

-- Todo mundo da empresa vê os chamados dela (transparência interna).
create policy "empresa ve os proprios chamados"
  on chamados_suporte for select
  using (empresa_id = empresa_do_usuario());

-- Só Super Admin vê tudo e atualiza status/resposta de qualquer chamado.
create policy "super admin ve todos os chamados"
  on chamados_suporte for select
  using (sou_super_admin());
create policy "super admin atualiza qualquer chamado"
  on chamados_suporte for update
  using (sou_super_admin());

insert into migrations_aplicadas (arquivo) values ('34-central-de-ajuda.sql')
  on conflict (arquivo) do nothing;
