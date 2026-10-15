# Rotinas agendadas (o que roda sozinho no servidor)

Algumas coisas só funcionam de verdade se rodarem **sozinhas**, todo dia, sem depender de alguém abrir uma
tela. O sistema tem duas rotinas para isso. **Elas só funcionam depois de agendadas** (veja "Agendar",
abaixo) — o painel **Super Admin → Rotinas automáticas** mostra se estão rodando.

## O que cada rotina faz

| Rotina | Quando | O que faz |
|---|---|---|
| **Diária** (`rotinas-agendadas`) | Todo dia às 8h (Brasília) | **1) Lembretes de avaliação:** e-mail para quem está com a avaliação pendente, 5 dias antes, 2 dias antes e no dia do prazo (D-5, D-2, D-0). **2) Escalonamento do Ponto:** justificativa parada há 3+ dias sobe para o substituto do gestor e o RH. **3) Banco de talentos:** remove quem passou de 24 meses. **4) Fim do teste grátis:** e-mail ao Administrador (2 dias antes, no último dia, 1 e 7 dias depois) e um resumo diário para a equipe. **5) NR1:** encerra campanhas vencidas e avisa o Administrador e o RH. **6) Vídeos dos candidatos:** pedido vencido vira "expirado" e o arquivo + o registro são apagados depois de 6 meses. **7) Resultados dos candidatos:** pedido vencido vira "expirado" e os arquivos + o registro são apagados depois de 6 meses. **8) Limpeza** de registros de limite com mais de 35 dias. |
| **Chamados** (`chamado-automatico`) | De hora em hora | Lembra a equipe de chamado parado há mais de 24h. (Com o assistente de IA ligado, também encerra chamado respondido pela IA sem retorno em 3 dias e manda o resumo diário das 8h; com a IA desligada, que é o padrão, só o lembrete tem efeito.) |

### Detalhes que vale saber
- **Lembretes de avaliação:** só para avaliação **assíncrona** em andamento (a sessão "Ao Vivo" não tem etapa do avaliador). Vão para quem está com a vez: o colaborador (autoavaliação), o líder direto ou o RH. Cada lembrete sai **uma única vez** (rodar a rotina duas vezes no mesmo dia não duplica e-mail). A empresa pode desligar em *Configurações → notificações → lembretes de prazo*.
- **Quem não recebe:** empresa suspensa e empresa com teste grátis vencido que não virou cliente.
- **Fim do teste grátis:** só o **Administrador** da empresa recebe, e só quem ainda é teste (não virou cliente nem foi suspenso). Os e-mails saem **2 dias antes** do fim, **no último dia**, **1 dia depois** e **7 dias depois**, cada um com um texto próprio e links para os planos e o WhatsApp comercial. A equipe recebe **um resumo por dia** (para decidir quem procurar). Os textos dizem que **os dados continuam guardados** — hoje isso é verdade, porque nada é apagado automaticamente; se um dia você criar uma exclusão automática de testes não convertidos, ajuste esses textos.
- **NR1:** a data final da campanha é **inclusiva** — ela encerra na rotina da manhã seguinte (horário de Brasília). O Administrador e o RH recebem o aviso de encerramento. Os resultados continuam respeitando o anonimato mínimo.
- **A rotina nunca altera os dados da empresa** — só lê. Escrever ali do servidor poderia sobrescrever o que alguém estivesse editando na tela.
- **Se uma tarefa falhar**, as outras continuam e a equipe recebe um e-mail ("Falha na rotina diária do sistema").

## Agendar (uma vez só)

**1. Ative as extensões.** No Supabase: **Database → Extensions** → ative `pg_cron` e `pg_net`.

**2. Implante as funções.** `rotinas-agendadas` e `chamado-automatico` (pelo deploy automático — já estão no `supabase/config.toml` — ou pelo painel, com **"Verify JWT" desligado**). Elas também precisam de `enviar-email` e `ponto` implantadas.

**3. Crie o secret.** Em **Edge Functions → Secrets**, crie `CRON_SECRET` com um texto longo e aleatório (o **mesmo** valor nas duas funções). Opcional: `EMAIL_EQUIPE` (padrão: `inetris25@gmail.com`) e `URL_SITE` (endereço do site, usado nos links dos e-mails de fim de teste; padrão: `https://rhalley21.github.io/testes/`).

**4. Agende.** No **SQL Editor** do projeto Principal, troque `<PROJETO>` e `<CRON_SECRET>` e rode os dois comandos:

```sql
-- Rotina DIÁRIA: 11h UTC = 8h em Brasília
select cron.schedule(
  'rotinas-diarias',
  '0 11 * * *',
  $$ select net.http_post(
       url := 'https://<PROJETO>.supabase.co/functions/v1/rotinas-agendadas',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
       body := '{"action":"diaria"}'::jsonb
     ) $$
);

-- Rotina de CHAMADOS: de hora em hora
select cron.schedule(
  'ajuda-rotina',
  '0 * * * *',
  $$ select net.http_post(
       url := 'https://<PROJETO>.supabase.co/functions/v1/chamado-automatico',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
       body := '{"action":"rotina"}'::jsonb
     ) $$
);
```

**5. Teste agora, sem esperar o horário.** Rode uma vez no SQL Editor (mesma troca de `<PROJETO>` e `<CRON_SECRET>`):

```sql
select net.http_post(
  url := 'https://<PROJETO>.supabase.co/functions/v1/rotinas-agendadas',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
  body := '{"action":"diaria"}'::jsonb
);
```

Depois abra **Super Admin → Rotinas automáticas**: a "Rotina diária" deve aparecer como **rodando**. A resposta completa fica em `select * from net._http_response order by created desc limit 1;`.

**Conferir / desligar**
```sql
select jobname, schedule, active from cron.job;      -- o que está agendado
select cron.unschedule('rotinas-diarias');            -- desligar a diária
select cron.unschedule('ajuda-rotina');               -- desligar a de chamados
```

## Se algo der errado
- **Painel mostra "nunca rodou":** a rotina não foi agendada (passo 4) ou o `CRON_SECRET` do comando é diferente do secret da função. Rode o teste do passo 5 e veja a resposta em `net._http_response`.
- **Resposta 401 "Não autorizado":** o segredo não bate. Confira o valor nos dois lugares.
- **Painel mostra "atrasada":** o agendador parou — confira `select * from cron.job_run_details order by start_time desc limit 5;`.
- **"escalonamento_ponto" com erro:** a função `ponto` precisa estar implantada com a versão que tem a ação `rotina_escalonamento` (v0.109.0 ou mais nova).
- **Não chegam e-mails de lembrete:** confira se a função `enviar-email` está implantada (versão 0.105.0+) e se o domínio do Resend continua verificado.
