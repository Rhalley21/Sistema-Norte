-- =========================================================================
-- NORTE — PONTO — banco de dados SEPARADO, só para o ponto
-- =========================================================================
-- Este arquivo NÃO roda no mesmo projeto Supabase do resto do NORTE.
-- Ele é pra um projeto Supabase novo e independente, criado só pra isso —
-- é essa separação que tira o peso do ponto de cima do banco principal.
--
-- PASSO A PASSO:
-- 1) No painel do Supabase, crie um projeto novo (ex: "norte-ponto").
--    Pode ser o plano gratuito — o volume de uma tabela de ponto é leve.
-- 2) Nesse projeto NOVO, abra o SQL Editor e cole este arquivo inteiro.
-- 3) Guarde a "Project URL" e a "service_role key" desse projeto novo
--    (Settings → API) — elas vão virar secrets da Edge Function
--    "ponto" (ver supabase/functions/ponto/index.ts), NUNCA do front-end.
-- =========================================================================

create extension if not exists "pgcrypto";

create table registros_ponto (
  id uuid primary key default gen_random_uuid(),
  -- empresa_id e perfil_id são "referências lógicas" ao projeto principal
  -- (empresas.id / perfis.id) — não podem ser chaves estrangeiras de
  -- verdade porque são bancos de dados diferentes. Quem garante que os
  -- valores gravados aqui são legítimos é a Edge Function "ponto", que
  -- confere a sessão de login no projeto principal antes de gravar.
  empresa_id uuid not null,
  perfil_id uuid not null,
  colaborador_id uuid,
  tipo text not null check (tipo in ('entrada', 'saida')),
  registrado_em timestamptz not null default now(),
  origem text not null default 'web',
  created_at timestamptz not null default now()
);

create index idx_registros_ponto_empresa_semana on registros_ponto (empresa_id, registrado_em);
create index idx_registros_ponto_perfil on registros_ponto (perfil_id, registrado_em);

-- Segurança: este banco só é acessado pela Edge Function, usando a
-- "service_role key" (que ignora RLS por natureza). Mesmo assim, deixamos
-- o RLS ligado e SEM NENHUMA política — isso bloqueia por padrão qualquer
-- tentativa de acesso direto a esta tabela usando a chave "anon" deste
-- projeto, caso ela algum dia vaze ou seja usada por engano.
alter table registros_ponto enable row level security;

-- Sem política de UPDATE/DELETE de propósito — o histórico de ponto é
-- append-only: nem a Edge Function apaga ou altera uma batida já feita.

-- =========================================================================
-- FIM — depois de rodar isso, guarde a Project URL e a service_role key
-- deste projeto novo. Elas vão como secrets da Edge Function no PRÓXIMO
-- passo (ver instruções no final de supabase/functions/ponto/index.ts).
-- =========================================================================
