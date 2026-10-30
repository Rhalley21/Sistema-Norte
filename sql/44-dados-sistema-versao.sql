-- =========================================================================
-- NORTE — Salvamento seguro: versão do documento da empresa
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL (depois do 43-entregas-rs.sql). Pode rodar de novo sem problema.
--
-- O QUE RESOLVE: todos os dados de uma empresa ficam em UM documento (dados_sistema.payload). Antes, quem salvava
-- sobrescrevia o documento inteiro, e duas pessoas usando ao mesmo tempo podiam apagar o trabalho uma da outra sem aviso.
-- Agora cada gravação sobe um número de VERSÃO. O sistema só grava se a versão ainda for a que a pessoa carregou; se
-- outra pessoa gravou antes, o sistema busca a versão nova e COMBINA as duas alterações (veja docs/SALVAMENTO-SEGURO.md).
--
-- O gatilho abaixo sobe a versão em QUALQUER atualização (do navegador, de um navegador antigo com a página em cache, ou de
-- uma função do servidor), então nenhuma gravação passa sem ser notada.
-- =========================================================================

alter table dados_sistema add column if not exists versao bigint not null default 1;

create or replace function dados_sistema_subir_versao()
returns trigger
language plpgsql
as $fn$
begin
  new.versao := old.versao + 1;
  return new;
end;
$fn$;

drop trigger if exists trg_dados_sistema_versao on dados_sistema;
create trigger trg_dados_sistema_versao
  before update on dados_sistema
  for each row
  execute function dados_sistema_subir_versao();

insert into migrations_aplicadas (arquivo) values ('44-dados-sistema-versao.sql')
  on conflict (arquivo) do nothing;
