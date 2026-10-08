-- =========================================================================
-- NORTE — Folha de ponto em papel (foto lida por IA, conferida pelo RH)
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL, depois do 36-aceite-termos.sql.
--
-- Guarda, por colaborador e competência (mês), as marcações de uma folha
-- de ponto preenchida à mão: a(s) foto(s) original(is) ficam num bucket
-- PRIVADO (prova do documento de papel) e os horários lidos ficam em
-- `dias`, só depois de o RH conferir e confirmar.
--
-- Formato de cada item de `dias` (jsonb):
--   { "dia": 1..31, "marcacoes": ["08:02","12:05","13:01","17:10"],
--     "tipo": "trabalhado|falta|folga|atestado|feriado|ferias",
--     "observacao": "texto curto", "confianca": "alta|media|baixa" }
-- `marcacoes` é uma lista em ordem: entrada, saída, entrada, saída...
-- (comporta folhas com 2, 4 ou mais marcações por dia).
-- =========================================================================

create table if not exists folhas_ponto_papel (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  colaborador_id text not null,          -- id do colaborador dentro de dados_sistema (não é perfil de login)
  colaborador_nome text not null,        -- cópia do nome na hora, pra relatório não depender de cadastro futuro
  competencia text not null check (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), -- 'AAAA-MM'
  imagens jsonb not null default '[]'::jsonb,  -- [{ "path": "...", "enviadaEm": "..." }]
  dias jsonb not null default '[]'::jsonb,
  status text not null default 'rascunho' check (status in ('rascunho', 'confirmada')),
  confirmada_por uuid references perfis(id),
  confirmada_em timestamptz,
  criado_por uuid references perfis(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, colaborador_id, competencia)
);

create index if not exists idx_folhas_ponto_papel_empresa on folhas_ponto_papel (empresa_id, competencia);

alter table folhas_ponto_papel enable row level security;

-- Só Administrador e RH da própria empresa mexem nisso (dado de jornada de
-- outras pessoas — não é pra líder nem colaborador comum ver).
create policy "gestor ve folhas de ponto em papel da empresa"
  on folhas_ponto_papel for select
  using (empresa_id = empresa_do_usuario() and meu_papel() in ('owner', 'rh'));

create policy "gestor cria folhas de ponto em papel da empresa"
  on folhas_ponto_papel for insert
  with check (empresa_id = empresa_do_usuario() and meu_papel() in ('owner', 'rh'));

create policy "gestor edita folhas de ponto em papel da empresa"
  on folhas_ponto_papel for update
  using (empresa_id = empresa_do_usuario() and meu_papel() in ('owner', 'rh'))
  with check (empresa_id = empresa_do_usuario() and meu_papel() in ('owner', 'rh'));

-- Só dá pra apagar rascunho — folha confirmada tem valor de registro de
-- jornada; pra mexer nela, precisa reabrir antes (o que fica no log).
create policy "gestor apaga so rascunho de folha de ponto em papel"
  on folhas_ponto_papel for delete
  using (empresa_id = empresa_do_usuario() and meu_papel() in ('owner', 'rh') and status = 'rascunho');

-- Trava de integridade: uma folha confirmada não muda de conteúdo em
-- silêncio (nem direto pela API) — só depois de reaberta.
create or replace function folhas_ponto_papel_protege_confirmada()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'confirmada' and new.status = 'confirmada'
     and (new.dias is distinct from old.dias or new.imagens is distinct from old.imagens) then
    raise exception 'Folha confirmada não pode ser alterada — reabra a folha antes de editar.';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_folhas_ponto_papel_protege on folhas_ponto_papel;
create trigger trg_folhas_ponto_papel_protege
  before update on folhas_ponto_papel
  for each row execute function folhas_ponto_papel_protege_confirmada();

-- Bucket PRIVADO das fotos (sem nenhuma policy de storage: só a Edge Function
-- "folha-ponto", com a chave de serviço, grava e gera link temporário).
-- Se o seu projeto não permitir esse insert, crie manualmente em
-- Storage → New bucket → nome "folhas-ponto-papel" → deixe "Public" DESLIGADO.
insert into storage.buckets (id, name, public)
  values ('folhas-ponto-papel', 'folhas-ponto-papel', false)
  on conflict (id) do nothing;

insert into migrations_aplicadas (arquivo) values ('37-folha-ponto-papel.sql')
  on conflict (arquivo) do nothing;
