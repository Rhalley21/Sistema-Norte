# Alerta de Escalabilidade — Arquitetura de Dados

> Guardado aqui como lembrete futuro. Não é uma pendência urgente — é um
> gatilho a observar conforme o uso do sistema crescer.

## Como funciona hoje

Todos os dados de uma empresa (cargos, colaboradores, ciclos, avaliações,
diagnósticos, PDIs) ficam guardados como **um único bloco JSON** por empresa,
numa linha da tabela `dados_sistema`. Ao entrar no sistema, esse bloco inteiro
é carregado para a memória do navegador, e todos os cálculos (dashboards,
relatórios, filtros) são feitos ali mesmo, em JavaScript — não em consultas
otimizadas de banco de dados.

Isso foi uma escolha deliberada: permite evoluir o sistema rapidamente e
funciona muito bem para uma empresa individual, do porte testado até aqui
(dezenas de colaboradores).

## O limite real

Esse modelo começa a mostrar sinais de lentidão quando:
- Uma empresa acumula **algumas centenas de colaboradores**:e/ou
- **Vários anos de histórico de ciclos** acumulados; **e**
- As telas (principalmente Dashboards e Relatórios) começam a demorar
  perceptivelmente para carregar.

Até esse ponto, não há necessidade de mudar nada — o ganho de uma
reestruturação não compensaria o esforço e o risco.

## O que precisaria mudar, quando chegar a hora

Migrar de "um JSON por empresa" para um banco relacional de verdade:
- Cada entidade (cargo, colaborador, ciclo, avaliação, diagnóstico, PDI,
  ação) vira sua própria tabela no Supabase/Postgres, com relacionamentos
  reais (chaves estrangeiras), em vez de viver dentro de um blob.
- Índices nas colunas mais consultadas (`empresa_id`, `colaborador_id`,
  `ciclo_id`).
- Tabelas de agregação (ex: uma tabela só com a nota geral de cada ciclo já
  calculada), atualizadas automaticamente a cada novo Diagnóstico gerado —
  para que os Dashboards leiam dados prontos, em vez de recalcular tudo.
- Relatórios de grande volume processados de forma assíncrona (fila +
  notificação de conclusão), em vez de rodar inteiramente no navegador.

Essa é uma reconstrução da camada de dados, não um ajuste incremental — feita
de uma vez, como um projeto próprio, quando o volume real justificar.

## Referência

Esse ponto foi levantado formalmente no **Documento 03 — Arquitetura do
Banco de Dados** da Metodologia NORTE (Capítulos 9 e 10, Performance e
Escalabilidade), que já descreve esse modelo relacional completo como o
destino final da arquitetura.
