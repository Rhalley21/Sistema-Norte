-- =========================================================================
-- NORTE — PONTO — Segurança na batida (QR do local + selfie)
-- =========================================================================
-- Rode este script no SQL Editor do BANCO DE PONTO (o projeto separado,
-- vpfesgdeykpaomewqqsm), DEPOIS do 01-schema.sql de lá.
-- =========================================================================

-- Marca se a batida foi validada pelo QR Code do local, e guarda o caminho
-- da selfie tirada na hora (dentro do bucket de Storage "selfies-ponto").
alter table registros_ponto
  add column if not exists validado_qr boolean not null default false;

alter table registros_ponto
  add column if not exists selfie_path text;

-- =========================================================================
-- BUCKET DE STORAGE PARA AS SELFIES
-- -------------------------------------------------------------------------
-- As selfies NÃO cabem numa coluna de tabela — vão para o Storage do
-- Supabase. Crie o bucket assim (uma vez):
--
--   1) No painel do projeto de PONTO, menu "Storage".
--   2) "New bucket" -> nome EXATO:  selfies-ponto
--   3) Deixe o bucket PRIVADO (não público) — as fotos são pessoais (LGPD).
--
-- A Edge Function "ponto" faz upload e leitura usando a service_role key
-- (que ignora as políticas de Storage), então NÃO é preciso criar políticas
-- públicas — e é melhor assim, pra ninguém acessar as fotos direto pela URL.
-- =========================================================================

