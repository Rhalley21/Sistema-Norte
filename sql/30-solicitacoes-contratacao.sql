-- =========================================================================
-- NORTE — Solicitações de contratação direta (landing, antes do login)
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL, depois do 29-super-admin-definir-plano.sql.
--
-- Mesmo padrão do sql/24-teste-gratis.sql: visitante sem login pode CRIAR
-- uma solicitação (é a tela pública), mas só o Super Admin lê e decide.
-- Fase 1: fica registrado pro Instituto entrar em contato e fechar o
-- pagamento manualmente — sem link de pagamento automático ainda.
-- =========================================================================

create table if not exists solicitacoes_contratacao (
  id uuid primary key default gen_random_uuid(),
  nome_solicitante text not null,
  email text not null,
  nome_empresa text not null,
  telefone text,
  plano_desejado text not null,
  observacoes text,
  status text not null default 'pendente' check (status in ('pendente', 'em_contato', 'fechada', 'perdida')),
  criado_em timestamptz not null default now(),
  decidido_em timestamptz,
  decidido_por uuid references perfis(id)
);

alter table solicitacoes_contratacao enable row level security;

-- Qualquer visitante (mesmo sem login) pode CRIAR uma solicitação — é o
-- formulário público da landing. Ninguém anônimo lê a lista.
create policy "qualquer um cria solicitacao de contratacao"
  on solicitacoes_contratacao for insert
  with check (true);

create policy "super admin le solicitacoes de contratacao"
  on solicitacoes_contratacao for select
  using (sou_super_admin());
create policy "super admin atualiza solicitacoes de contratacao"
  on solicitacoes_contratacao for update
  using (sou_super_admin());

insert into migrations_aplicadas (arquivo) values ('30-solicitacoes-contratacao.sql')
  on conflict (arquivo) do nothing;
