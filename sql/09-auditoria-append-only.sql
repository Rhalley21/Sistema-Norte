-- =========================================================================
-- NORTE — RNF003: log de auditoria verdadeiramente imutável (append-only)
-- =========================================================================
-- Problema: a política atual de "auditoria" usava "for all", o que incluía
-- UPDATE e DELETE — violando o critério de aceite de que o log não pode
-- ser alterado ou apagado por ninguém, nem pelo Administrador.
--
-- Correção: substituímos por duas políticas específicas — uma de SELECT
-- (ver o próprio histórico) e uma de INSERT (adicionar novos registros).
-- Sem política de UPDATE/DELETE, o Postgres bloqueia essas operações por
-- padrão para todo mundo, inclusive donos de linha.
-- =========================================================================

drop policy if exists "acesso por empresa - auditoria" on auditoria;

create policy "auditoria - consulta por empresa"
  on auditoria for select
  using (empresa_id = empresa_do_usuario());

create policy "auditoria - insercao por empresa"
  on auditoria for insert
  with check (empresa_id = empresa_do_usuario());

-- Nenhuma política de UPDATE ou DELETE é criada de propósito —
-- isso torna o log append-only mesmo para o Administrador.

-- =========================================================================
-- FIM
-- =========================================================================
