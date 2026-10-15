-- =========================================================================
-- NORTE — Resultado/entrega do candidato em uma etapa do processo seletivo
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL (depois do 42-videos-rs.sql).
--
-- rs_entregas      -> cada pedido de resultado a um candidato (link pessoal, prazo, situação) e o que ele enviou
--                     (texto e a lista de arquivos). O código do link só existe como HASH.
-- bucket privado   -> "entregas-candidatos": os arquivos (PDF, PNG, JPG, WEBP). Privado (só link temporário), com
--                     LIMITE DE 5 MB por arquivo e só esses formatos, impostos pelo próprio armazenamento.
--
-- SEGURANÇA: RLS ligado e SEM nenhuma política: tudo passa pela Edge Function "entrega-rs".
-- RETENÇÃO: 6 meses (a rotina diária apaga os arquivos e o registro).
-- =========================================================================

create table if not exists rs_entregas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  candidato_ref text not null,
  candidato_nome text not null,
  candidato_email text,
  etapa text not null check (etapa in ('disc_galt', 'teste_logico', 'prova_teorica', 'prova_pratica')),
  token_hash text not null unique,
  status text not null default 'solicitado' check (status in ('solicitado', 'enviado', 'expirado', 'cancelado')),
  instrucoes text check (instrucoes is null or char_length(instrucoes) <= 2000),
  prazo_ate timestamptz not null,
  texto_resposta text check (texto_resposta is null or char_length(texto_resposta) <= 3000),
  arquivos jsonb not null default '[]'::jsonb,
  enviado_em timestamptz,
  criado_por uuid references perfis(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_rs_entregas_candidato on rs_entregas (empresa_id, candidato_ref, etapa);
create index if not exists idx_rs_entregas_status on rs_entregas (empresa_id, status);
create index if not exists idx_rs_entregas_prazo on rs_entregas (prazo_ate) where status = 'solicitado';
create index if not exists idx_rs_entregas_criado on rs_entregas (criado_em);

alter table rs_entregas enable row level security;
revoke all on table rs_entregas from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entregas-candidatos', 'entregas-candidatos', false, 5242880, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into migrations_aplicadas (arquivo) values ('43-entregas-rs.sql')
  on conflict (arquivo) do nothing;
