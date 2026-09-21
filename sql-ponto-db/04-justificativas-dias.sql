-- =========================================================================
-- NORTE — PONTO — Adiciona quantidade de dias às justificativas
-- =========================================================================
-- Rode no SQL Editor do BANCO DE PONTO (projeto vpfesgdeykpaomewqqsm).
-- Só adiciona uma coluna nova; não mexe em nada existente.
-- Se você ainda NÃO rodou o 03-justificativas.sql, rode ele primeiro
-- (a versão nova dele já inclui esta coluna, então este arquivo é
-- desnecessário nesse caso).
-- =========================================================================

alter table justificativas_ponto
  add column if not exists qtd_dias integer default 1;
