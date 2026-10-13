-- =========================================================================
-- NORTE — Vídeo de apresentação do candidato (etapa do processo seletivo)
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL, depois do 41-remover-provas.sql.
--
-- rs_videos        -> cada pedido de vídeo a um candidato (link pessoal, prazo, situação) e os dados do vídeo
--                     enviado. O código do link só existe como HASH (o banco nunca tem o código em texto).
-- bucket privado   -> "videos-candidatos": onde ficam os arquivos. Privado (só link temporário), com LIMITE DE
--                     TAMANHO (40 MB — cabe no plano gratuito, que aceita até ~50 MB por arquivo) e só os formatos
--                     MP4, WebM e MOV, impostos pelo próprio armazenamento (não dependem de ninguém programar certo).
--
-- SEGURANÇA: RLS ligado e SEM nenhuma política: nem o navegador do RH nem o do candidato leem ou escrevem aqui
-- direto. Tudo passa pela Edge Function "video-rs" (login + papel + empresa, ou o código do candidato).
-- RETENÇÃO: 6 meses (a rotina diária apaga o arquivo e o registro).
-- =========================================================================

create table if not exists rs_videos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  candidato_ref text not null,
  candidato_nome text not null,
  candidato_email text,
  token_hash text not null unique,
  status text not null default 'solicitado' check (status in ('solicitado', 'enviado', 'expirado', 'cancelado')),
  instrucoes text check (instrucoes is null or char_length(instrucoes) <= 2000),
  prazo_ate timestamptz not null,
  video_path text,
  mime text,
  tamanho_bytes bigint,
  duracao_s integer,
  enviado_em timestamptz,
  criado_por uuid references perfis(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_rs_videos_candidato on rs_videos (empresa_id, candidato_ref);
create index if not exists idx_rs_videos_status on rs_videos (empresa_id, status);
create index if not exists idx_rs_videos_prazo on rs_videos (prazo_ate) where status = 'solicitado';
create index if not exists idx_rs_videos_criado on rs_videos (criado_em);

alter table rs_videos enable row level security;
revoke all on table rs_videos from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos-candidatos', 'videos-candidatos', false, 41943040, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into migrations_aplicadas (arquivo) values ('42-videos-rs.sql')
  on conflict (arquivo) do nothing;
