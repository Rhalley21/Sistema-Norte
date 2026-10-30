-- =========================================================================
-- NORTE — Segurança por papel (correção urgente)
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL (depois do 44-dados-sistema-versao.sql) e SÓ DEPOIS de o site novo estar no ar
-- (veja docs/SEGURANCA-PAPEIS.md: a ordem importa). Pode rodar de novo sem problema.
--
-- O QUE CORRIGE (auditoria das regras do banco; cada item tem teste contra um Postgres de verdade):
--  1. Qualquer usuário podia mudar o PRÓPRIO papel (virar Administrador) e até o empresa_id (entrar em outra empresa).
--  2. Qualquer usuário podia editar a PRÓPRIA empresa, inclusive plano, suspensão e pagamento.
--  3. Qualquer usuário podia criar convite para o papel RH (e, com ele, criar uma conta de RH).
--  4. Qualquer usuário da empresa podia LER, SOBRESCREVER e APAGAR o documento inteiro de dados da empresa.
--  5. Uma conta DESATIVADA continuava com acesso pela API (as funções de "qual é a minha empresa/papel" ignoravam isso).
--  6. Tabelas antigas (substituídas pelo documento) estavam abertas a qualquer usuário da empresa.
-- A leitura do documento ainda é por empresa (próxima etapa: devolver a cada papel só as áreas que ele pode ler).
-- =========================================================================

-- ---------- 5) conta desativada = sem empresa e sem papel ----------
create or replace function empresa_do_usuario()
returns uuid
language sql
security definer
stable
set search_path = public
as $fn$
  select empresa_id from perfis where id = auth.uid() and coalesce(desativado, false) = false
$fn$;

create or replace function public.meu_papel()
returns text
language sql
security definer
stable
set search_path = public
as $fn$
  select papel from perfis where id = auth.uid() and coalesce(desativado, false) = false
$fn$;

-- a própria pessoa sempre enxerga o próprio perfil (o sistema precisa dele para dizer "conta desativada")
drop policy if exists perfis_le_o_proprio on perfis;
create policy perfis_le_o_proprio on perfis for select using (id = auth.uid());

-- ---------- 1) perfis: cada coluna só muda por quem pode ----------
create or replace function perfis_proteger_colunas()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_papel text;
  v_mudou text[];
  v_col text;
begin
  -- serviço do servidor (sem usuário) e super admin: sem restrição
  if v_uid is null or sou_super_admin() then
    return new;
  end if;
  v_papel := meu_papel();
  select coalesce(array_agg(n.key), array[]::text[]) into v_mudou
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o on o.key = n.key
   where n.value is distinct from o.value;
  foreach v_col in array v_mudou loop
    if v_col in ('id', 'empresa_id', 'email', 'created_at') then
      raise exception 'coluna_protegida:%', v_col using errcode = '42501';
    elsif v_col = 'nome' then
      if not (old.id = v_uid or v_papel in ('owner', 'rh')) then
        raise exception 'sem_permissao:%', v_col using errcode = '42501';
      end if;
    elsif v_col = 'senha_provisoria' then
      if not ((old.id = v_uid and new.senha_provisoria = false) or v_papel in ('owner', 'rh')) then
        raise exception 'sem_permissao:%', v_col using errcode = '42501';
      end if;
    elsif v_col = 'termos_aceitos_em' then
      if old.id <> v_uid then
        raise exception 'sem_permissao:%', v_col using errcode = '42501';
      end if;
    elsif v_col = 'papel' then
      -- só o Administrador promove a RH; o RH troca entre líder e colaborador; ninguém mexe no papel de Administrador nem no próprio
      if not (
        old.id <> v_uid
        and old.papel <> 'owner'
        and new.papel in ('rh', 'lider', 'colaborador')
        and (v_papel = 'owner' or (v_papel = 'rh' and old.papel in ('lider', 'colaborador') and new.papel in ('lider', 'colaborador')))
      ) then
        raise exception 'sem_permissao:%', v_col using errcode = '42501';
      end if;
    elsif v_col = 'desativado' then
      -- só Administrador e RH desativam, nunca a si mesmos, nunca o Administrador; o RH só desativa líder e colaborador
      if not (
        old.id <> v_uid
        and old.papel <> 'owner'
        and (v_papel = 'owner' or (v_papel = 'rh' and old.papel in ('lider', 'colaborador')))
      ) then
        raise exception 'sem_permissao:%', v_col using errcode = '42501';
      end if;
    elsif v_col in ('escopo_estendido', 'estrutura_id', 'estrutura_nome') then
      if v_papel not in ('owner', 'rh') then
        raise exception 'sem_permissao:%', v_col using errcode = '42501';
      end if;
    else
      raise exception 'coluna_protegida:%', v_col using errcode = '42501'; -- coluna que ninguém previu: nega
    end if;
  end loop;
  return new;
end;
$fn$;

drop trigger if exists trg_perfis_proteger_colunas on perfis;
create trigger trg_perfis_proteger_colunas
  before update on perfis
  for each row
  execute function perfis_proteger_colunas();

-- ---------- 2) empresas: só o Administrador edita o cadastro; plano, suspensão e pagamento só o super admin ----------
create or replace function empresas_proteger_colunas()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_mudou text[];
  v_col text;
begin
  if v_uid is null or sou_super_admin() then
    return new;
  end if;
  select coalesce(array_agg(n.key), array[]::text[]) into v_mudou
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o on o.key = n.key
   where n.value is distinct from o.value;
  foreach v_col in array v_mudou loop
    if v_col in ('razao_social', 'nome_fantasia', 'cnpj', 'segmento', 'porte', 'tipo') then
      if meu_papel() is distinct from 'owner' then
        raise exception 'somente_administrador:%', v_col using errcode = '42501';
      end if;
    else
      raise exception 'coluna_protegida:%', v_col using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$fn$;

drop trigger if exists trg_empresas_proteger_colunas on empresas;
create trigger trg_empresas_proteger_colunas
  before update on empresas
  for each row
  execute function empresas_proteger_colunas();

-- ---------- 3) convites: só Administrador e RH; só o Administrador convida RH ----------
do $x$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'convites' loop
    execute format('drop policy %I on convites', r.policyname);
  end loop;
end
$x$;

create policy convites_le on convites for select
  using (empresa_id = empresa_do_usuario() and meu_papel() in ('owner', 'rh'));

create policy convites_cria on convites for insert
  with check (
    empresa_id = empresa_do_usuario()
    and meu_papel() in ('owner', 'rh')
    and (papel in ('lider', 'colaborador') or meu_papel() = 'owner')
  );

create policy convites_atualiza on convites for update
  using (empresa_id = empresa_do_usuario() and meu_papel() in ('owner', 'rh'))
  with check (
    empresa_id = empresa_do_usuario()
    and meu_papel() in ('owner', 'rh')
    and (papel in ('lider', 'colaborador') or meu_papel() = 'owner')
  );

create policy convites_apaga on convites for delete
  using (
    empresa_id = empresa_do_usuario()
    and meu_papel() in ('owner', 'rh')
    and (papel in ('lider', 'colaborador') or meu_papel() = 'owner')
  );

-- ---------- 4) documento de dados da empresa: leitura por empresa; GRAVAÇÃO só pela função abaixo ----------
do $x$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'dados_sistema' and policyname like 'acesso por empresa%' loop
    execute format('drop policy %I on dados_sistema', r.policyname);
  end loop;
end
$x$;

drop policy if exists dados_sistema_le on dados_sistema;
create policy dados_sistema_le on dados_sistema for select using (empresa_id = empresa_do_usuario());

revoke insert, update, delete on table dados_sistema from anon, authenticated;

-- registro do que o sistema recusou (para ajustar as regras sem adivinhar); ninguém lê pela API
create table if not exists seguranca_log (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid,
  perfil_id uuid,
  papel text,
  evento text not null,
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
alter table seguranca_log enable row level security;
revoke all on table seguranca_log from anon, authenticated;

-- Grava SÓ as áreas enviadas, SÓ as que o papel pode gravar, e só se a versão ainda for a que a pessoa carregou.
-- Devolve { conflito, versao, rejeitadas }: as áreas que o papel não pode gravar são recusadas e registradas (o resto grava).
create or replace function salvar_dados_areas(p_areas jsonb, p_versao bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_emp uuid := empresa_do_usuario();
  v_papel text := meu_papel();
  v_permitidas text[];
  v_gravar jsonb := '{}'::jsonb;
  v_rejeitadas text[] := array[]::text[];
  v_chave text;
  v_versao bigint;
begin
  if v_emp is null or v_papel is null then
    raise exception 'sem_acesso' using errcode = '42501';
  end if;
  if p_areas is null or jsonb_typeof(p_areas) <> 'object' then
    raise exception 'areas_invalidas' using errcode = '22023';
  end if;
  v_permitidas := case v_papel
    when 'owner' then array['empresa', 'estrutura', 'cultura', 'cargos', 'colaboradores', 'bancoAcoes', 'ciclos', 'configuracoes', 'feedbackContinuo', 'pesquisasClima', 'nr1', 'rs']
    when 'rh' then array['estrutura', 'cultura', 'cargos', 'colaboradores', 'bancoAcoes', 'ciclos', 'configuracoes', 'feedbackContinuo', 'pesquisasClima', 'nr1', 'rs']
    when 'lider' then array['colaboradores', 'bancoAcoes', 'ciclos', 'feedbackContinuo', 'pesquisasClima', 'rs']
    else array['colaboradores', 'bancoAcoes', 'ciclos', 'feedbackContinuo', 'pesquisasClima']
  end;
  for v_chave in select jsonb_object_keys(p_areas) loop
    if v_chave = any(v_permitidas) then
      v_gravar := v_gravar || jsonb_build_object(v_chave, p_areas -> v_chave);
    else
      v_rejeitadas := v_rejeitadas || v_chave;
    end if;
  end loop;
  if cardinality(v_rejeitadas) > 0 then
    insert into seguranca_log (empresa_id, perfil_id, papel, evento, detalhes)
    values (v_emp, auth.uid(), v_papel, 'area_rejeitada', jsonb_build_object('areas', to_jsonb(v_rejeitadas)));
  end if;
  if v_gravar = '{}'::jsonb then
    return jsonb_build_object('conflito', false, 'versao', p_versao, 'rejeitadas', to_jsonb(v_rejeitadas));
  end if;
  if coalesce(p_versao, 0) = 0 then
    -- o documento ainda não existe (empresa nova): só Administrador e RH criam
    if v_papel not in ('owner', 'rh') then
      raise exception 'sem_acesso' using errcode = '42501';
    end if;
    begin
      insert into dados_sistema (empresa_id, payload) values (v_emp, v_gravar) returning versao into v_versao;
    exception when unique_violation then
      return jsonb_build_object('conflito', true, 'rejeitadas', to_jsonb(v_rejeitadas));
    end;
  else
    update dados_sistema
       set payload = payload || v_gravar, atualizado_em = now()
     where empresa_id = v_emp and versao = p_versao
    returning versao into v_versao;
    if v_versao is null then
      return jsonb_build_object('conflito', true, 'rejeitadas', to_jsonb(v_rejeitadas));
    end if;
  end if;
  return jsonb_build_object('conflito', false, 'versao', v_versao, 'rejeitadas', to_jsonb(v_rejeitadas));
end;
$fn$;

revoke all on function salvar_dados_areas(jsonb, bigint) from public, anon;
grant execute on function salvar_dados_areas(jsonb, bigint) to authenticated;

-- ---------- 6) tabelas antigas (o documento as substituiu; o sistema não as usa) ----------
revoke all on table avaliacoes, banco_acoes, cargos, colaboradores, culturas from anon, authenticated;

insert into migrations_aplicadas (arquivo) values ('45-seguranca-papeis.sql')
  on conflict (arquivo) do nothing;
