-- =========================================================================
-- NORTE — R&S: idade mínima por tipo de contratação (Jovem Aprendiz)
-- =========================================================================
-- Rode no SQL Editor do projeto PRINCIPAL, depois do 31-rs-perfil-candidato.sql.
--
-- A idade mínima legal de trabalho no Brasil é 16 anos — exceto para
-- contrato de Jovem Aprendiz (Lei 10.097/2000), onde pode ser 14. Aqui
-- simplificamos pra 16 (o mais comum na prática) vs 18 (demais formatos),
-- só pra ajustar a confirmação de elegibilidade na página pública — não é
-- uma verificação de idade de verdade (isso continua sendo feito com
-- documento, na contratação).
-- =========================================================================

alter table rs_vagas_publicas add column if not exists jovem_aprendiz boolean not null default false;

insert into migrations_aplicadas (arquivo) values ('32-rs-jovem-aprendiz.sql')
  on conflict (arquivo) do nothing;
