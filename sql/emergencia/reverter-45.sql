-- =========================================================================
-- EMERGÊNCIA — desfaz o sql/45 (segurança por papel)
-- =========================================================================
-- USE SÓ SE o 45 impedir o sistema de funcionar e não houver tempo de corrigir. ISTO REABRE AS BRECHAS corrigidas: qualquer
-- usuário logado volta a poder virar Administrador, criar convite de RH e sobrescrever o documento da empresa. Corrija e
-- reaplique o 45 o quanto antes (veja docs/CONTINUIDADE.md).
-- Cole a partir deste ARQUIVO (não do chat: as aspas curvas do chat quebram o SQL). Pode rodar de novo.
-- =========================================================================

drop trigger if exists trg_perfis_proteger_colunas on perfis;
drop trigger if exists trg_empresas_proteger_colunas on empresas;
drop policy if exists perfis_le_o_proprio on perfis;

-- "qual é a minha empresa / meu papel" como eram (sem olhar se a conta está desativada)
create or replace function empresa_do_usuario()
returns uuid
language sql
security definer
stable
as $$
  select empresa_id from perfis where id = auth.uid()
$$;

create or replace function public.meu_papel()
returns text
language sql
security definer
stable
as $$
  select papel from perfis where id = auth.uid()
$$;

-- convites como eram
drop policy if exists convites_le on convites;
drop policy if exists convites_cria on convites;
drop policy if exists convites_atualiza on convites;
drop policy if exists convites_apaga on convites;
drop policy if exists "acesso por empresa - convites" on convites;
create policy "acesso por empresa - convites" on convites for all using (empresa_id = empresa_do_usuario());

-- documento da empresa como era (leitura e gravação direta por qualquer pessoa da empresa)
drop policy if exists dados_sistema_le on dados_sistema;
drop policy if exists "acesso por empresa - dados_sistema" on dados_sistema;
create policy "acesso por empresa - dados_sistema" on dados_sistema for all using (empresa_id = empresa_do_usuario());
grant insert, update, delete on table dados_sistema to authenticated;

-- tabelas antigas como eram
grant all on table avaliacoes, banco_acoes, cargos, colaboradores, culturas to authenticated;

delete from migrations_aplicadas where arquivo = '45-seguranca-papeis.sql';
