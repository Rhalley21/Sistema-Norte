-- =========================================================================
-- NORTE — R&S: página pública de candidatura
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL, depois do 27-nr1-servidor.sql.
--
-- Mesma lógica de segurança já usada no NR1: os dados que um estranho na
-- internet (sem login) pode enviar/ler vivem em tabelas PRÓPRIAS, sem
-- nenhuma política de acesso para "authenticated" nem "anon" — só a Edge
-- Function "rs" (com a chave de serviço) toca nelas. Isso evita dois
-- problemas: (1) expor o resto dos dados da empresa pra internet, e (2)
-- duas pessoas se candidatando ao mesmo tempo "atropelarem" uma à outra
-- (o que aconteceria se escrevêssemos direto no blob JSON da empresa).
-- =========================================================================

-- Espelho público de cada vaga publicada — só o que pode ser visto de
-- fora. A requisição completa continua vivendo no blob da empresa; aqui
-- fica uma cópia resumida e com controle de exibição.
create table if not exists rs_vagas_publicas (
  id uuid primary key default gen_random_uuid(),
  requisicao_id uuid not null, -- id da requisição no blob (state.rs.requisicoes[].id)
  empresa_id uuid not null,
  titulo text not null,
  descricao text,
  requisitos text,
  local text,
  modalidade text,
  mostrar_salario boolean not null default false,
  faixa_salarial text,
  mostrar_empresa boolean not null default true,
  nome_empresa_exibicao text,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_rs_vagas_publicas_empresa on rs_vagas_publicas (empresa_id);

-- Candidaturas recebidas pela página pública.
create table if not exists rs_candidaturas_publicas (
  id uuid primary key default gen_random_uuid(),
  vaga_publica_id uuid not null references rs_vagas_publicas(id) on delete cascade,
  empresa_id uuid not null,
  nome text not null,
  email text not null,
  telefone text,
  curriculo_path text, -- caminho no bucket "curriculos-rs"
  aceite_privacidade boolean not null default false,
  aceite_banco_talentos boolean not null default false,
  origem text not null default 'pagina_publica',
  importada boolean not null default false, -- já foi trazida pro pipeline do RH?
  importada_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists idx_rs_candidaturas_vaga on rs_candidaturas_publicas (vaga_publica_id, importada);

-- Banco de talentos: quem aceitou ficar disponível pra futuras vagas,
-- independente da candidatura específica.
create table if not exists rs_banco_talentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  candidatura_id uuid references rs_candidaturas_publicas(id) on delete set null,
  nome text not null,
  email text not null,
  telefone text,
  curriculo_path text,
  criado_em timestamptz not null default now()
);
create index if not exists idx_rs_banco_talentos_empresa on rs_banco_talentos (empresa_id);

alter table rs_vagas_publicas enable row level security;
alter table rs_candidaturas_publicas enable row level security;
alter table rs_banco_talentos enable row level security;
-- De propósito: NENHUMA política para "authenticated" nem "anon". Só a
-- Edge Function "rs" (service_role, que ignora RLS) acessa — tanto pro
-- visitante sem login (que passa pela função) quanto pro RH autenticado.

insert into migrations_aplicadas (arquivo) values ('28-rs-pagina-publica.sql')
  on conflict (arquivo) do nothing;

-- =========================================================================
-- BUCKET DE STORAGE PARA OS CURRÍCULOS
-- -------------------------------------------------------------------------
-- Crie um bucket PRIVADO para os currículos enviados pela página pública:
--   1) No projeto PRINCIPAL, menu "Storage".
--   2) "New bucket" -> nome EXATO:  curriculos-rs
--   3) Deixe PRIVADO (não público). A Edge Function usa a service_role key
--      para subir e gerar URLs temporárias de leitura pro RH.
-- =========================================================================
