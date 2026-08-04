-- =========================================================================
-- NORTE — Notificações in-app (sino de alertas)
-- =========================================================================
-- Rode este script no SQL Editor do Supabase, DEPOIS do
-- 16-ativar-realtime.sql.
--
-- Diferente dos cartões de "pendências" que já existem nos dashboards
-- (calculados na hora, sempre a partir do estado atual), isso aqui é um
-- histórico de verdade: cada notificação é um registro que fica guardado,
-- pode ser marcado como lida, e chega em tempo real via Realtime — o sino
-- no menu mostra a contagem de não lidas sem precisar recarregar a tela.
-- =========================================================================

create table notificacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  perfil_id uuid references perfis(id) on delete cascade, -- destinatário
  tipo text not null, -- ex.: 'avaliacao_pendente', 'pdi_aprovado'
  titulo text not null,
  mensagem text,
  rota text, -- rota interna pra abrir ao clicar (ex.: 'ciclos')
  lida boolean default false,
  criado_em timestamptz default now()
);

alter table notificacoes enable row level security;

-- Cada pessoa só vê as próprias notificações.
create policy "cada um ve suas proprias notificacoes"
  on notificacoes for select
  using (perfil_id = auth.uid());

-- Cada pessoa só marca como lida (ou apaga) as próprias notificações.
create policy "cada um marca como lida suas proprias notificacoes"
  on notificacoes for update
  using (perfil_id = auth.uid());

create policy "cada um apaga suas proprias notificacoes"
  on notificacoes for delete
  using (perfil_id = auth.uid());

-- Qualquer pessoa da MESMA empresa pode criar uma notificação pra outra
-- pessoa da empresa (ex.: quando o Líder envia a avaliação, o sistema cria
-- uma notificação pro RH — quem dispara a ação não é o destinatário).
create policy "qualquer um da empresa cria notificacao pra empresa"
  on notificacoes for insert
  with check (empresa_id = empresa_do_usuario());

alter publication supabase_realtime add table notificacoes;

insert into migrations_aplicadas (arquivo) values ('17-notificacoes-in-app.sql')
  on conflict (arquivo) do nothing;

-- =========================================================================
-- FIM
-- =========================================================================
