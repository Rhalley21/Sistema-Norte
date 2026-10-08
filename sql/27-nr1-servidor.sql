-- =========================================================================
-- NORTE — NR1 no servidor (campanhas, respostas, participação, log)
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL, depois do 26-substituto-aprovador.sql.
--
-- Por que isso existe: até aqui, campanhas/respostas/quem-já-respondeu do
-- NR1 viviam no mesmo bloco JSON que qualquer usuário logado da empresa
-- baixa no navegador (dados_sistema). Tecnicamente, alguém no Console do
-- navegador poderia ver a LISTA DE QUEM RESPONDEU (não o que respondeu).
-- Aqui a parte sensível passa a viver só no servidor: sem política de RLS
-- para "authenticated", só a Edge Function "nr1" (com a chave de serviço)
-- consegue ler ou escrever. O navegador só recebe o que a função decide
-- mandar — nunca um despejo bruto da tabela.
--
-- O que fica NO SERVIDOR (aqui): campanhas, respostas (sem perfil_id — nem
-- o servidor liga resposta a pessoa), participação (perfil_id, sem
-- conteúdo), consentimento de privacidade, log de visualização do
-- resultado.
-- O que continua no navegador (state.nr1, sem mudança): SST, dimensões/
-- perguntas, inventário de risco, plano de ação — não são dados sensíveis
-- de resposta anônima, são registros de gestão do RH/SST.
-- =========================================================================

create table if not exists nr1_campanhas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  nome text not null,
  data_inicio date not null,
  data_fim date not null,
  anonimato_minimo integer not null default 5,
  publico jsonb not null default '{"tipo":"todos","valor":null}'::jsonb,
  dimensoes_snapshot jsonb, -- perguntas "congeladas" no momento da publicação
  status text not null default 'rascunho' check (status in ('rascunho', 'ativa', 'encerrada')),
  auto_encerrada boolean not null default false,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  publicada_em timestamptz,
  encerrada_em timestamptz
);
create index if not exists idx_nr1_campanhas_empresa on nr1_campanhas (empresa_id, status);

create table if not exists nr1_respostas (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references nr1_campanhas(id) on delete cascade,
  -- SEM perfil_id — nem o servidor liga a resposta a uma pessoa.
  setor_id uuid,
  unidade_id uuid,
  por_dimensao jsonb not null,
  respondido_em timestamptz not null default now()
);
create index if not exists idx_nr1_respostas_campanha on nr1_respostas (campanha_id);

create table if not exists nr1_participantes (
  campanha_id uuid not null references nr1_campanhas(id) on delete cascade,
  perfil_id uuid not null,
  respondeu_em timestamptz not null default now(),
  primary key (campanha_id, perfil_id)
);

create table if not exists nr1_consentimentos (
  campanha_id uuid not null references nr1_campanhas(id) on delete cascade,
  perfil_id uuid not null,
  aceito_em timestamptz not null default now(),
  primary key (campanha_id, perfil_id)
);

create table if not exists nr1_visualizacoes (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references nr1_campanhas(id) on delete cascade,
  perfil_id uuid not null,
  visualizado_em timestamptz not null default now()
);
create index if not exists idx_nr1_visualizacoes_campanha on nr1_visualizacoes (campanha_id, visualizado_em desc);

alter table nr1_campanhas enable row level security;
alter table nr1_respostas enable row level security;
alter table nr1_participantes enable row level security;
alter table nr1_consentimentos enable row level security;
alter table nr1_visualizacoes enable row level security;
-- De propósito: NENHUMA política para "authenticated" nessas 5 tabelas.
-- Só a Edge Function "nr1" (service_role, que ignora RLS) acessa. O
-- navegador nunca faz select direto aqui — sempre por uma ação da função,
-- que decide o que devolver (números consolidados, nunca a lista bruta).

insert into migrations_aplicadas (arquivo) values ('27-nr1-servidor.sql')
  on conflict (arquivo) do nothing;
