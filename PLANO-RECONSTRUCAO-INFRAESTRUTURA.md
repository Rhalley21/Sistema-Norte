# Plano de Reconstrução de Infraestrutura — Plataforma NORTE

> Este é um plano de **referência futura**, não uma tarefa urgente. Só faz
> sentido começar quando o volume de uso justificar (ver
> `ALERTA-ESCALABILIDADE.md`). Cada fase pode ser feita de forma independente
> e incremental — não precisa (nem deve) ser tudo de uma vez.

## Antes de começar: o que NÃO muda

- As telas, fluxos e regras de negócio que você já testou com a equipe
  continuam as mesmas. Essa reconstrução é "por baixo do capô" — muda como
  os dados são guardados e processados, não a experiência de quem usa.
- Nenhum dado existente é apagado. Toda migração deve ser uma **cópia**
  dos dados atuais para o novo formato, com o formato antigo preservado até
  a migração ser validada.
- O Supabase continua sendo a base (login, banco de dados) — a mudança é
  como as tabelas são organizadas dentro dele, e a adição de um backend.

---

## Fase 0 — Preparação (antes de qualquer código)

1. Decidir a stack técnica definitiva (Documento 08, Capítulo 8 sugere
   Node.js/NestJS ou Python/Django para o backend, PostgreSQL para o banco
   — que já é o banco por trás do Supabase, então isso já está resolvido).
2. Definir quem vai executar esse projeto (você mesmo, um freelancer, uma
   equipe) — esse é um projeto de programação backend "de verdade", não um
   ajuste incremental de frontend.
3. Fazer um backup completo do banco atual (Supabase já oferece isso, mas
   vale um backup manual extra antes de começar).

## Fase 1 — Modelagem relacional (Documento 03)

1. Criar as tabelas reais no Postgres/Supabase para cada entidade que hoje
   vive dentro do JSON único: `cargos`, `desenhos_cargo` (com versionamento
   próprio), `colaboradores`, `ciclos`, `avaliacoes`, `respostas_avaliacao`,
   `diagnosticos`, `pdis_desenvolvimento`, `pdis_mentalidade`, `acoes`,
   `evidencias`.
2. Cada tabela nova segue o modelo do **Documento 03** (chaves primárias em
   UUID — já usamos isso —, chaves estrangeiras, `empresa_id` obrigatório
   em todas).
3. Criar as políticas de RLS (Row Level Security) equivalentes às que já
   existem hoje para `empresas`/`perfis`/`auditoria`, agora para cada
   tabela nova.

## Fase 2 — Script de migração de dados

1. Escrever um script (pode ser em Node.js, Python, ou até SQL puro) que lê
   o JSON de `dados_sistema` de cada empresa e insere os dados nas tabelas
   novas, mantendo os mesmos IDs (já são UUIDs) para não quebrar nenhuma
   referência.
2. Rodar esse script primeiro num ambiente de teste/cópia — nunca direto
   na base de produção.
3. Validar linha por linha: número de colaboradores, ciclos e diagnósticos
   migrados deve bater exatamente com o que existe hoje no JSON.
4. Só depois de validado, rodar na base real — e mesmo assim, manter o
   JSON antigo intacto por um tempo, como rede de segurança.

## Fase 3 — Backend e API

1. Criar um servidor backend (Node.js ou Python) que expõe uma API REST
   (Documento 08, Capítulo 4): um endpoint por entidade principal
   (`/colaboradores`, `/avaliacoes`, `/pdis`, etc.).
2. Mover a lógica de negócio que hoje vive no navegador (cálculo de médias
   ponderadas, geração de diagnóstico, geração de PDI, validações de RN)
   para esse backend — o frontend passa a só exibir dados e chamar a API,
   em vez de calcular tudo localmente.
3. Autenticação via token (JWT), reaproveitando o login que já existe no
   Supabase Auth.
4. Nenhum endpoint deve permitir exclusão física — só arquivamento lógico
   (mesma regra que já seguimos hoje).

## Fase 4 — Performance (Documento 03, Cap. 9)

1. Criar índices nas colunas mais consultadas: `empresa_id`,
   `colaborador_id`, `ciclo_id`.
2. Criar uma tabela de agregação (ex: resumo de diagnóstico por ciclo),
   atualizada automaticamente sempre que um novo Diagnóstico é gerado —
   para os Dashboards lerem dados prontos, em vez de recalcular tudo.
3. Mover a geração de relatórios grandes (PDF/Excel) para um processo
   assíncrono (fila), notificando o usuário quando terminar.

## Fase 5 — Notificações reais (Documento 08, Cap. 5)

1. Configurar um serviço de fila (ex: SQS, RabbitMQ, ou equivalente mais
   simples se o volume não justificar algo tão robusto).
2. Configurar um serviço de e-mail transacional (ex: Resend, SendGrid).
3. Implementar os gatilhos já mapeados no documento: novo ciclo aberto,
   prazo próximo do vencimento, diagnóstico gerado, PDI de Mentalidade
   parado, evidência enviada, ciclo extraordinário disparado.

## Fase 6 — Só depois de tudo validado: desligar o modo antigo

1. Rodar os dois sistemas em paralelo por um tempo (o antigo lendo o JSON,
   o novo lendo as tabelas), comparando resultados.
2. Só depois de uma janela de confiança, desligar a leitura do JSON antigo
   — sem apagá-lo, apenas parar de usá-lo.

---

## Ordem recomendada de prioridade

Se o volume crescer de forma desigual, vale migrar primeiro **as tabelas
mais pesadas primeiro** — normalmente `respostas_avaliacao` e
`auditoria`/`eventos_dominio`, que crescem mais rápido que o resto (uma
linha por indicador × avaliador × ciclo, multiplicado pelo número de
colaboradores e anos de histórico).

## Referência

Este plano segue os documentos: **03 — Arquitetura do Banco de Dados**
(modelagem, versionamento, performance) e **08 — Arquitetura da
Plataforma** (backend, API, notificações, stack tecnológica).
