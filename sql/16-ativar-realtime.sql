-- =========================================================================
-- NORTE — Ativar Realtime para avisar quando outra pessoa atualiza os dados
-- =========================================================================
-- Rode este script no SQL Editor do Supabase, DEPOIS do
-- 15-controle-migrations.sql.
--
-- O que resolve: hoje, se duas pessoas da mesma empresa usam o sistema ao
-- mesmo tempo (ex.: Líder avalia e envia pro RH), quem já estava com a
-- tela aberta antes não sabia que precisava clicar em "Atualizar" — só
-- percebia se desconfiasse e clicasse por conta própria. Com o Realtime
-- ativado, o navegador passa a ser avisado sozinho sempre que os dados da
-- empresa mudam, e mostra um aviso pra pessoa atualizar quando quiser (não
-- atualiza sozinho, pra não correr o risco de apagar algo que a pessoa
-- esteja digitando no momento).
-- =========================================================================

alter publication supabase_realtime add table dados_sistema;

insert into migrations_aplicadas (arquivo) values ('16-ativar-realtime.sql')
  on conflict (arquivo) do nothing;

-- =========================================================================
-- FIM
-- =========================================================================
