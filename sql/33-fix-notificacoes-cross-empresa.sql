-- =========================================================================
-- NORTE — Correção de segurança: notificação cross-empresa
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL.
--
-- FALHA ENCONTRADA (auditoria de segurança, 30/09/2026): a política de
-- criar notificação conferia só `empresa_id = empresa_do_usuario()` — mas
-- nunca conferia se o `perfil_id` (destinatário) pertence de fato a essa
-- mesma empresa. Como a leitura de notificações é só por
-- `perfil_id = auth.uid()` (sem checar empresa), isso permitia, na teoria,
-- qualquer usuário autenticado criar uma notificação pra QUALQUER pessoa
-- de QUALQUER empresa, bastando saber o id do perfil dela — um vetor de
-- phishing interno (mensagem falsa aparecendo no sino de alguém de outra
-- empresa). Corrigido: agora também confere que o perfil de destino é
-- realmente da mesma empresa de quem está criando a notificação.
-- =========================================================================

drop policy if exists "qualquer um da empresa cria notificacao pra empresa" on notificacoes;

create policy "qualquer um da empresa cria notificacao pra empresa"
  on notificacoes for insert
  with check (
    empresa_id = empresa_do_usuario()
    and exists (
      select 1 from perfis
      where perfis.id = notificacoes.perfil_id
        and perfis.empresa_id = empresa_do_usuario()
    )
  );

insert into migrations_aplicadas (arquivo) values ('33-fix-notificacoes-cross-empresa.sql')
  on conflict (arquivo) do nothing;

-- =========================================================================
-- FIM
-- =========================================================================
