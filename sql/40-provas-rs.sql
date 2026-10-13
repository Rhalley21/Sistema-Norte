-- =========================================================================
-- NORTE — Provas de conhecimento no processo seletivo (R&S)
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL, depois do 39-rotinas-agendadas.sql.
--
-- rs_provas             -> as provas que a empresa monta (questões de múltipla escolha,
--                          peso por questão, tempo limite e nota mínima).
-- rs_provas_aplicacoes  -> cada vez que uma prova é aplicada a um candidato. Guarda uma
--                          CÓPIA da prova (com o gabarito) no momento da aplicação — editar
--                          a prova depois não muda a correção de quem já fez.
--
-- SEGURANÇA: estas tabelas têm o gabarito. Por isso o RLS fica LIGADO e SEM nenhuma política:
-- nem o navegador do RH nem o do candidato leem ou escrevem aqui direto. Tudo passa pela Edge
-- Function "provas-rs", que confere o papel (Administrador/RH), a empresa e o código do candidato.
-- O código (token) do candidato é guardado só como hash — o banco nunca tem o código em texto.
-- =========================================================================

create table if not exists rs_provas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 3 and 120),
  descricao text check (descricao is null or char_length(descricao) <= 1000),
  tempo_limite_min integer not null check (tempo_limite_min between 5 and 240),
  nota_minima numeric(5, 2) not null default 60 check (nota_minima between 0 and 100),
  questoes jsonb not null default '[]'::jsonb,
  arquivada boolean not null default false,
  criado_por uuid references perfis(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_rs_provas_empresa on rs_provas (empresa_id, arquivada);

create table if not exists rs_provas_aplicacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  prova_id uuid references rs_provas(id) on delete set null,
  prova_titulo text not null,
  candidato_ref text not null,
  candidato_nome text not null,
  candidato_email text,
  token_hash text not null unique,
  status text not null default 'enviada' check (status in ('enviada', 'iniciada', 'concluida', 'expirada', 'cancelada')),
  prazo_ate timestamptz not null,
  tempo_limite_min integer not null check (tempo_limite_min between 5 and 240),
  nota_minima numeric(5, 2) not null check (nota_minima between 0 and 100),
  questoes_snapshot jsonb not null,
  respostas jsonb not null default '{}'::jsonb,
  iniciada_em timestamptz,
  concluida_em timestamptz,
  fora_do_prazo boolean not null default false,
  acertos integer,
  total integer,
  pontos integer,
  pontos_max integer,
  nota numeric(5, 2),
  criado_por uuid references perfis(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_rs_provas_aplic_candidato on rs_provas_aplicacoes (empresa_id, candidato_ref);
create index if not exists idx_rs_provas_aplic_status on rs_provas_aplicacoes (empresa_id, status);
create index if not exists idx_rs_provas_aplic_prazo on rs_provas_aplicacoes (prazo_ate) where status in ('enviada', 'iniciada');
create index if not exists idx_rs_provas_aplic_criado on rs_provas_aplicacoes (criado_em);

alter table rs_provas enable row level security;
alter table rs_provas_aplicacoes enable row level security;

-- Nenhuma política de propósito: só a Edge Function (chave de serviço) acessa. E tira qualquer permissão
-- direta dos papéis do navegador, por garantia.
revoke all on table rs_provas from anon, authenticated;
revoke all on table rs_provas_aplicacoes from anon, authenticated;

insert into migrations_aplicadas (arquivo) values ('40-provas-rs.sql')
  on conflict (arquivo) do nothing;
