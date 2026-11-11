-- =========================================================================
-- 46 - COBRANCA POR LINK DE PAGAMENTO (base independente do provedor)
-- -------------------------------------------------------------------------
-- O teste gratis continua SEM cartao. No fim dos 7 dias, a pessoa recebe o link de pagamento do plano dela (a primeira mensalidade,
-- sem fidelidade; a implantacao e combinada com o cliente por WhatsApp e fica fora do sistema) e PAGA se quiser continuar.
-- Nada e cobrado sem a pessoa pagar por conta propria.
--
-- Esta migracao guarda so o que o sistema precisa saber:
--   assinaturas         o plano escolhido, os valores, a data do fim do teste, a situacao e o ACEITE (o texto exato que a
--                       pessoa viu, a versao, quem confirmou e quando): e a prova do que foi combinado;
--   assinaturas_eventos o que aconteceu (plano escolhido, avisos enviados, cancelamento, pagamento confirmado): e o historico
--                       e o que impede de mandar o mesmo aviso duas vezes;
--   links_pagamento     o link de pagamento de cada plano. SO o servidor le (nenhum usuario, nem o Super Admin pela API):
--                       quem precisa do link recebe so o do proprio plano, na hora certa, pela funcao cobranca.
-- Numero de cartao nunca passa pelo sistema: a pessoa paga na pagina do provedor.
--
-- Quem le assinaturas e eventos: o Administrador (owner) da propria empresa e o Super Admin. Quem escreve: so o servidor.
-- Seguro rodar mais de uma vez.
-- =========================================================================

create table if not exists assinaturas (
  empresa_id uuid primary key references empresas (id) on delete cascade,
  plano text not null check (plano in ('essencial', 'gestao', 'estrategico')),
  mensalidade_centavos integer not null check (mensalidade_centavos > 0),
  implantacao_centavos integer not null check (implantacao_centavos >= 0),
  primeira_cobranca_centavos integer not null,
  primeira_cobranca_em date not null,
  proxima_cobranca_em date,
  ultima_cobranca_em date,
  status text not null default 'agendada'
    check (status in ('agendada', 'aguardando_pagamento', 'ativa', 'em_atraso', 'suspensa', 'cancelada')),
  aceite_em timestamptz not null,
  aceite_por uuid references auth.users (id) on delete set null,
  aceite_versao text not null,
  aceite_texto text not null,
  pago_em timestamptz,
  pago_confirmado_por uuid references auth.users (id) on delete set null,
  cancelada_em timestamptz,
  cancelada_por uuid references auth.users (id) on delete set null,
  motivo_cancelamento text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint assinaturas_primeira_soma check (primeira_cobranca_centavos = mensalidade_centavos + implantacao_centavos),
  constraint assinaturas_cancelada_coerente check ((status = 'cancelada') = (cancelada_em is not null))
);

create table if not exists assinaturas_eventos (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references empresas (id) on delete cascade,
  tipo text not null,
  chave text not null default '',
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  constraint assinaturas_eventos_unico unique (empresa_id, tipo, chave)
);

create table if not exists links_pagamento (
  plano text not null check (plano in ('essencial', 'gestao', 'estrategico')),
  tipo text not null check (tipo in ('primeira', 'mensalidade')),
  url text not null check (url ~ '^https://.' and url !~ '[[:space:]]'),
  atualizado_em timestamptz not null default now(),
  primary key (plano, tipo)
);

-- atualizado_em acompanha qualquer alteracao
create or replace function assinaturas_atualiza_data()
returns trigger
language plpgsql
as $fn$
begin
  new.atualizado_em := now();
  return new;
end;
$fn$;
drop trigger if exists trg_assinaturas_atualizado on assinaturas;
create trigger trg_assinaturas_atualizado before update on assinaturas
  for each row execute function assinaturas_atualiza_data();

-- ---------- quem le (e ninguem escreve pela API) ----------
alter table assinaturas enable row level security;
alter table assinaturas_eventos enable row level security;
alter table links_pagamento enable row level security; -- sem nenhuma politica: nenhum usuario le nem escreve pela API

drop policy if exists assinaturas_le_dono on assinaturas;
create policy assinaturas_le_dono on assinaturas for select
  using (empresa_id = empresa_do_usuario() and meu_papel() = 'owner');
drop policy if exists assinaturas_le_super on assinaturas;
create policy assinaturas_le_super on assinaturas for select
  using (sou_super_admin());

drop policy if exists assinaturas_eventos_le_dono on assinaturas_eventos;
create policy assinaturas_eventos_le_dono on assinaturas_eventos for select
  using (empresa_id = empresa_do_usuario() and meu_papel() = 'owner');
drop policy if exists assinaturas_eventos_le_super on assinaturas_eventos;
create policy assinaturas_eventos_le_super on assinaturas_eventos for select
  using (sou_super_admin());

revoke all on table assinaturas, assinaturas_eventos, links_pagamento from anon;
revoke all on table links_pagamento from authenticated;
revoke insert, update, delete, truncate on table assinaturas, assinaturas_eventos from authenticated;
grant select on table assinaturas, assinaturas_eventos to authenticated;

insert into migrations_aplicadas (arquivo) values ('46-cobranca.sql')
  on conflict (arquivo) do nothing;
