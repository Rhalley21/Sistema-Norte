-- =========================================================================
-- NORTE — Remove o recurso de provas de conhecimento (retirado na v0.114.0)
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL, SE você já tinha rodado o 40-provas-rs.sql.
-- ATENÇÃO: apaga as tabelas das provas e TODOS os resultados guardados nelas. Não dá pra desfazer.
-- (Se nunca aplicou nenhuma prova a um candidato, não há nada a perder.)
--
-- Depois, no Supabase: Edge Functions > provas-rs > apague a função.
-- =========================================================================

drop table if exists rs_provas_aplicacoes;
drop table if exists rs_provas;

insert into migrations_aplicadas (arquivo) values ('41-remover-provas.sql')
  on conflict (arquivo) do nothing;
