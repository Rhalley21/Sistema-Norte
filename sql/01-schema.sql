-- =========================================================================
-- NORTE — Desenho inicial do banco de dados (Supabase / Postgres)
-- Passo 1 do roadmap: banco de dados real + isolamento multiempresa
-- =========================================================================
-- Como usar: cole este arquivo inteiro no SQL Editor do seu projeto
-- Supabase e clique em "Run". Ele cria todas as tabelas de uma vez.
-- =========================================================================

-- Extensão necessária para gerar IDs únicos (uuid) automaticamente
create extension if not exists "pgcrypto";

-- -------------------------------------------------------------------------
-- 1) EMPRESAS — a tabela raiz. Cada empresa cliente = uma linha aqui.
-- -------------------------------------------------------------------------
create table empresas (
  id uuid primary key default gen_random_uuid(),
  razao_social text,
  nome_fantasia text,
  cnpj text,
  segmento text,
  porte text,       -- 'Pequena' | 'Média' | 'Grande'
  tipo text,        -- 'Pública' | 'Privada'
  created_at timestamptz default now()
);

-- -------------------------------------------------------------------------
-- 2) PERFIS — liga cada usuário logado (auth.users, do Supabase Auth)
--    a uma empresa e a um papel dentro dela.
-- -------------------------------------------------------------------------
create table perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid references empresas(id) on delete cascade,
  nome text,
  papel text check (papel in ('owner','rh','lider','colaborador')) default 'owner',
  created_at timestamptz default now()
);

-- -------------------------------------------------------------------------
-- 3) CULTURAS — missão, visão, valores e os indicadores dos pilares T e E
--    (relação 1 para 1 com empresa)
-- -------------------------------------------------------------------------
create table culturas (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  missao text,
  visao text,
  valores text,
  indicadores_t jsonb default '[]',   -- ex: [{ "id": "...", "nome": "...", "origem": "padrão" }]
  indicadores_e jsonb default '[]'
);

-- -------------------------------------------------------------------------
-- 4) CARGOS — o desenho de cada cargo dentro da empresa
-- -------------------------------------------------------------------------
create table cargos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  nome text,
  cbo text,
  familia text,
  natureza text,
  nucleo text,
  superior_direto text,
  sumario text,
  atividades_especificas jsonb default '[]',
  atividades_gerais text,
  requisitos text,
  condicoes text,
  responsabilidades text,
  indicadores_n jsonb default '[]',
  indicadores_o jsonb default '[]',
  indicadores_r jsonb default '[]',
  aprovado boolean default false,
  versao int default 1,
  created_at timestamptz default now()
);

-- -------------------------------------------------------------------------
-- 5) COLABORADORES
-- -------------------------------------------------------------------------
create table colaboradores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  cargo_id uuid references cargos(id),
  nome text,
  email text,
  created_at timestamptz default now()
);

-- -------------------------------------------------------------------------
-- 6) AVALIACOES — cada ciclo de avaliação de um colaborador
-- -------------------------------------------------------------------------
create table avaliacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  colaborador_id uuid references colaboradores(id) on delete cascade,
  data date default current_date,
  respostas jsonb default '{}',            -- { "colaborador": {...}, "lider": {...}, "rh": {...} }
  pdi_desenvolvimento jsonb,
  pdi_mentalidade jsonb,
  created_at timestamptz default now()
);

-- -------------------------------------------------------------------------
-- 7) BANCO DE AÇÕES — biblioteca de ações sugeridas para o PDI
-- -------------------------------------------------------------------------
create table banco_acoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  categoria text,
  descricao text,
  prazo_sugerido int,
  created_at timestamptz default now()
);

-- =========================================================================
-- SEGURANÇA MULTIEMPRESA (Row Level Security)
-- A partir daqui, o próprio banco passa a barrar qualquer tentativa de
-- uma empresa ler ou escrever dados de outra empresa — mesmo que haja
-- um erro no código do front-end ou da API.
-- =========================================================================

alter table empresas enable row level security;
alter table perfis enable row level security;
alter table culturas enable row level security;
alter table cargos enable row level security;
alter table colaboradores enable row level security;
alter table avaliacoes enable row level security;
alter table banco_acoes enable row level security;

-- Função auxiliar: descobre a empresa do usuário logado a partir do perfil
create or replace function empresa_do_usuario()
returns uuid
language sql
security definer
stable
as $$
  select empresa_id from perfis where id = auth.uid()
$$;

-- Perfis: cada usuário só vê/edita o próprio perfil
create policy "usuario ve o proprio perfil"
  on perfis for select
  using (id = auth.uid());

create policy "usuario edita o proprio perfil"
  on perfis for update
  using (id = auth.uid());

-- Empresas: só vê a própria empresa
create policy "ve a propria empresa"
  on empresas for select
  using (id = empresa_do_usuario());

create policy "edita a propria empresa"
  on empresas for update
  using (id = empresa_do_usuario());

-- Demais tabelas: mesmo padrão, repetido para cada uma
create policy "acesso por empresa - culturas select"
  on culturas for all
  using (empresa_id = empresa_do_usuario());

create policy "acesso por empresa - cargos"
  on cargos for all
  using (empresa_id = empresa_do_usuario());

create policy "acesso por empresa - colaboradores"
  on colaboradores for all
  using (empresa_id = empresa_do_usuario());

create policy "acesso por empresa - avaliacoes"
  on avaliacoes for all
  using (empresa_id = empresa_do_usuario());

create policy "acesso por empresa - banco_acoes"
  on banco_acoes for all
  using (empresa_id = empresa_do_usuario());

-- =========================================================================
-- FIM — depois de rodar este script, as 7 tabelas + as regras de segurança
-- já existem no seu projeto Supabase, prontas para o próximo passo:
-- a tela de login (Supabase Auth) + criação automática do perfil e da
-- empresa quando alguém se cadastra.
-- =========================================================================
