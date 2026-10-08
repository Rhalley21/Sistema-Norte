-- =========================================================================
-- NORTE — R&S: perfil detalhado do candidato (página pública)
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL, depois do 30-solicitacoes-contratacao.sql.
--
-- Em vez de criar uma coluna por pergunta (o que exigiria uma migration
-- nova toda vez que o formulário mudar), guarda as respostas extras do
-- candidato num único campo flexível (jsonb). O que vai dentro dele está
-- documentado no comentário da coluna.
-- =========================================================================

alter table rs_candidaturas_publicas add column if not exists perfil jsonb default '{}'::jsonb;

comment on column rs_candidaturas_publicas.perfil is
  'Respostas extras do candidato, formato livre. Campos usados hoje: '
  'maior18 (bool), cidadeAtual (text), formacaoSuperior (cursando|completo|nao_possui), '
  'experienciaAnteriorFuncao (text), possuiMoto/possuiNotebook/possuiSmartphone (bool), '
  'intimidadeTecnologia (basico|intermediario|avancado), '
  'conhecimentoExcel/conhecimentoWord/conhecimentoPowerpoint (nao_possui|basico|intermediario|avancado), '
  'disponibilidadeHorarios (text), linkedin (text, opcional).';

insert into migrations_aplicadas (arquivo) values ('31-rs-perfil-candidato.sql')
  on conflict (arquivo) do nothing;
