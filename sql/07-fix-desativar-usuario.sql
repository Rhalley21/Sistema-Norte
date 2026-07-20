-- =========================================================================
-- NORTE — Correção: permitir que Dono/RH desativem/reativem outras contas
-- =========================================================================
-- Problema: a única política de UPDATE em "perfis" permitia que cada pessoa
-- editasse só o PRÓPRIO perfil. Por isso, ao clicar em "Desativar" no perfil
-- de outra pessoa, o banco bloqueava silenciosamente a atualização (sem
-- erro visível), e a tela continuava mostrando "Ativo".
-- =========================================================================

-- Função auxiliar: descobre o papel de quem está fazendo a requisição.
create or replace function public.meu_papel()
returns text
language sql
security definer
stable
as $$
  select papel from perfis where id = auth.uid()
$$;

-- Nova política: Dono ou RH podem atualizar qualquer perfil da própria empresa
-- (usada para desativar/reativar contas e, no futuro, outras edições administrativas).
create policy "dono ou rh administram perfis da empresa"
  on perfis for update
  using (
    empresa_id = empresa_do_usuario()
    and meu_papel() in ('owner','rh')
  );

-- =========================================================================
-- FIM
-- =========================================================================
