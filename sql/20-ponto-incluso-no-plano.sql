-- ============================================================
-- Ponto — controle de acesso por plano (Super Admin decide)
-- ------------------------------------------------------------
-- Antes, a tela "Ponto" era visível pra qualquer empresa, qualquer papel
-- — mas nem toda empresa contratou o plano com esse módulo. Essa coluna
-- guarda, por empresa, se o Ponto está incluso — só o Super Admin da
-- plataforma (dono do NORTE) pode alterar, na tela "Super Admin —
-- Empresas" (js/23-page-super-admin.js), do mesmo jeito que já
-- controla acesso_suspenso (ver sql/12-suspensao-empresas.sql).
-- ============================================================

alter table empresas add column if not exists ponto_incluso boolean not null default false;

comment on column empresas.ponto_incluso is
  'Se true, a empresa tem acesso ao módulo Ponto (bater ponto, relatório de ponto). Só o Super Admin da plataforma altera isso — nenhuma empresa se autoconcede esse acesso.';

-- -------------------------------------------------------------------------
-- BUG DE SEGURANÇA EVITADO: a política antiga "edita a propria empresa"
-- (sql/01-schema.sql) permite que qualquer pessoa da empresa atualize
-- QUALQUER coluna da própria linha em `empresas` — sem restrição por
-- coluna. Isso inclui a coluna nova `ponto_incluso`: mesmo a tela de
-- Empresa nunca expondo esse campo como editável, nada impediria alguém
-- de chamar `supabase.from('empresas').update({ponto_incluso: true})`
-- direto pelo console do navegador e conceder o próprio acesso, burlando
-- o controle do Super Admin. RLS por si só não restringe por coluna — a
-- forma correta é um trigger que barra a mudança quando quem está
-- editando não é o Super Admin.
-- -------------------------------------------------------------------------
create or replace function bloquear_alteracao_ponto_incluso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ponto_incluso is distinct from old.ponto_incluso and not sou_super_admin() then
    new.ponto_incluso := old.ponto_incluso;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_alteracao_ponto_incluso on empresas;
create trigger trg_bloquear_alteracao_ponto_incluso
  before update on empresas
  for each row
  execute function bloquear_alteracao_ponto_incluso();

-- RLS: qualquer pessoa logada precisa conseguir LER esse campo da própria
-- empresa, pra decidir se mostra o menu "Ponto" — a política de SELECT já
-- existente em `empresas` (mesma usada por acesso_suspenso) já cobre isso,
-- porque é a mesma tabela/linha, sem coluna nova de política necessária.

insert into migrations_aplicadas (arquivo) values ('20-ponto-incluso-no-plano.sql')
  on conflict (arquivo) do nothing;

-- =========================================================================
-- FIM
-- =========================================================================
