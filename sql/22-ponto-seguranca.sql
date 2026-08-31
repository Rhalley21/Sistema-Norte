-- =========================================================================
-- NORTE — Segurança do Ponto por Empresa (segredo do QR + chaves liga/desliga)
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL (mgkmvrgfmuexgxkuslur), depois do
-- 21-ponto-por-empresa.sql.
--
-- Por que uma tabela À PARTE, e não colunas em `empresas`: o segredo que
-- assina os QR Codes NÃO pode ser lido pelo navegador — senão qualquer
-- funcionário leria o segredo pela API e geraria códigos válidos de casa,
-- derrubando toda a proteção. Como qualquer membro consegue dar SELECT na
-- própria `empresas` (ver política em 01-schema.sql), o segredo não pode
-- morar lá. Aqui, a tabela tem RLS ligado e NENHUMA política: o navegador
-- não lê nada: só a Edge Function "ponto" (que usa a service_role key e
-- ignora RLS) enxerga o segredo. As chaves liga/desliga são lidas/gravadas
-- pela própria Edge Function, com checagem de papel (owner/rh).
-- =========================================================================

create table if not exists empresa_ponto_seguranca (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  qr_secret text not null default encode(gen_random_bytes(32), 'hex'),
  exige_qr boolean not null default false,
  exige_selfie boolean not null default false,
  atualizado_em timestamptz not null default now()
);

alter table empresa_ponto_seguranca enable row level security;
-- Sem nenhuma policy de propósito (ver comentário acima).

insert into migrations_aplicadas (arquivo) values ('22-ponto-seguranca.sql')
  on conflict (arquivo) do nothing;

-- =========================================================================
-- FIM
-- =========================================================================
