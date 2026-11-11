# Cobrança por link de pagamento

O teste grátis **continua sem cartão**. No fim dos 7 dias a pessoa recebe o **link de pagamento do plano dela** e **paga se quiser continuar**. **Nada é cobrado automaticamente**: quem não paga fica com o acesso pausado e os dados guardados.

Decisões tomadas: **sem fidelidade** (só a mensalidade normal), pagamento pelo **link do InfinitePay** de cada plano, e a **implantação combinada com o cliente por WhatsApp** (fora do sistema).

| Plano | Colaboradores | Primeiro pagamento (mensalidade) |
|---|---|---|
| Essencial | até 10 | **R$ 297,00** |
| Gestão | 11 a 30 | **R$ 597,00** |
| Estratégico | 31 a 60 | **R$ 997,00** |

Acima de 60 colaboradores não há plano de tabela (proposta personalizada). O sistema mostra "Implantação: combinada pelo WhatsApp" e **não cobra nem cita valor de implantação**.

## O caminho do cliente

1. **Escolher o plano** (tela Pagamento do Administrador). O sistema sugere o plano pela quantidade de colaboradores cadastrados, mostra o valor, a data do fim do teste e repete que nada é cobrado automaticamente. A pessoa confirma, e o sistema **guarda o texto exato que ela viu** (o aceite, versão `v2`), quem confirmou e quando.
2. **Avisos por e-mail ao Administrador**, com o link do plano: **3 dias antes**, **1 dia antes**, **no dia do fim do teste (8º dia)** e **2 dias depois** (acesso pausado). O mesmo aviso nunca sai duas vezes.
3. **O link aparece também na tela Pagamento** a partir de 3 dias antes do fim do teste, e na **tela de entrada** quando o teste já terminou (botão "Pagar agora e continuar").
4. **Você confirma o pagamento** no Super Admin (botão **Confirmar pagamento** na linha da empresa). Isso ativa a assinatura, marca a empresa como cliente e libera o acesso. A **implantação** você combina e cobra por fora, pelo WhatsApp.
5. Quem **cancelar** não recebe mais avisos. Quem já tem assinatura **não recebe** os avisos antigos de fim de teste, e quem já é cliente **não é cobrado de novo**.

O link de cada plano fica numa tabela que **só o servidor lê**: cada empresa recebe apenas o link do **próprio plano**, na hora certa.

## O ciclo mensal (automático)

Depois do primeiro pagamento confirmado, a assinatura passa a ter um **vencimento todo mês, no mesmo dia**. A rotina diária cuida de tudo sozinha, usando o link de **mensalidade** do plano:

| Quando | O que acontece |
|---|---|
| **3 dias antes** do vencimento | E-mail ao Administrador com o link. O link aparece também na tela Pagamento. |
| **No dia** | A assinatura passa a "Aguardando pagamento" e sai o aviso "vence hoje". |
| **1 a 6 dias depois** | "Em atraso". No 3º dia de atraso sai o aviso com a **data em que o acesso será suspenso**. |
| **7 dias depois** | **Suspensão automática**: o acesso é pausado (os dados ficam guardados) e sai o aviso de suspensão. Se esse e-mail falhar, é reenviado nos dias seguintes (até 14 dias). |

- **Você confirma o pagamento** no Super Admin. A assinatura volta a "Ativa", o vencimento sobe **um mês** (no mesmo dia, mesmo que a pessoa tenha pago atrasada) e, se estava suspensa **pela cobrança**, o acesso volta na hora. Uma suspensão feita à mão por outro motivo **não** é desfeita pela cobrança.
- **Pagamento adiantado** é aceito: dentro dos 3 dias antes do vencimento você já pode confirmar.
- **Quem cancela depois de pagar** mantém o acesso **até o fim do período já pago**; no dia seguinte ao vencimento o acesso é encerrado sozinho (dados guardados). Quem cancela antes de pagar segue o prazo normal do teste.
- Nenhum aviso é mandado em dobro, e quem já pagou ou cancelou não recebe cobrança.

## O que ainda NÃO existe (leia antes de divulgar)

- **Cobrança automática**: não existe. Com link de pagamento a pessoa paga quando quiser.
- **Confirmação automática do pagamento**: não existe. Você confirma cada pagamento (um clique no Super Admin) depois de ver que caiu no InfinitePay. Se o InfinitePay oferecer aviso automático de pagamento (webhook), dá para automatizar também.
- **Cobrança automática no cartão**: continua não existindo. O que é automático é o **ciclo**: lembrar, marcar atraso e suspender. O pagamento em si é feito pela pessoa, pelo link.
- **Nota fiscal**, **devolução de valores** e **cancelamento depois do pagamento** não são tratados pelo sistema: combine com o seu contador e o seu advogado.
- **Página de planos**: ainda mostra os valores de implantação (R$ 590, R$ 990 e R$ 1.490) como "cobrada uma única vez na contratação". Se a implantação passa a ser só combinada por WhatsApp, vale revisar esse texto da página.
- **Termos de Uso**: ainda citam "condição de fidelidade" e não descrevem esta cobrança. É texto jurídico, então **não foi alterado**: precisa de revisão do advogado, junto com o texto do aceite (em `supabase/functions/cobranca/index.ts`, função `textoDoAceite`).

## Para ligar (nesta ordem)

O site **já vem com a cobrança ligada** (`cobrancaAtiva: true` no `ambiente.js`), mas o bloco **só aparece quando o servidor responde**: se você subir o site antes dos passos abaixo, o cliente não vê nada (e nada de erro).

1. **SQL 46**: no Supabase, SQL Editor, rode `46-cobranca-sem-aspas.sql`. Cria as tabelas e as proteções. Pode rodar mais de uma vez.
2. **SQL dos links**: rode `links-pagamento-sem-aspas.sql` (os seus três links, como primeiro pagamento e como mensalidade). Para trocar um link depois, use a ferramenta, que **recusa** o link se o valor escrito no fim do endereço não for o do plano:

   ```
   python3 scripts/gerar-sql-links.py essencial:primeira=LINK-297 gestao:primeira=LINK-597 estrategico:primeira=LINK-997
   ```
3. **Funções no Supabase** (se a implantação automática estiver desligada): `cobranca` (**Verify JWT LIGADO**) e `rotinas-agendadas` (**Verify JWT DESLIGADO**, como sempre). Os códigos estão no zip.
4. **Segredo**: Edge Functions, Secrets, `COBRANCA_ATIVA` = `true`.
5. **Site** (versão 0.131.0), se ainda não subiu.

**Para desligar**: `COBRANCA_ATIVA` = `false` (ou apague o segredo). A tela some e as funções recusam. Os dados já gravados ficam.

## Teste real antes de divulgar

Com uma empresa de teste (use um e-mail seu):

1. Crie a conta pelo teste grátis, abra **Pagamento** e escolha um plano. Deve aparecer "Sua assinatura", com o valor, "Implantação: combinada pelo WhatsApp" e a data.
2. Troque de plano e depois cancele: os dois devem funcionar. Escolha o plano de novo.
3. Para ver o link e os avisos sem esperar 7 dias, no SQL Editor: `update assinaturas set primeira_cobranca_em = current_date + 3 where empresa_id = 'ID-DA-EMPRESA';` e recarregue a tela: o botão **Pagar** deve aparecer. O e-mail sai na próxima rotina diária.
4. **Abra o link de pagamento** e confira que o valor cobrado é o do plano.
5. No Super Admin, a linha da empresa deve mostrar a situação da cobrança e o botão **Confirmar pagamento**. Confirme: a empresa vira cliente.
6. **Ciclo mensal**: depois de confirmar o primeiro pagamento, simule o vencimento: `update assinaturas set proxima_cobranca_em = current_date + 3 where empresa_id = 'ID-DA-EMPRESA';` (aviso e link), depois `current_date` (vence hoje), `current_date - 3` (atraso) e `current_date - 7` (suspensão). O e-mail e a mudança de situação saem na próxima rotina diária. Confirme o pagamento no Super Admin e veja o vencimento subir um mês.
7. Teste o bloqueio: `update empresas set trial_ate = now() - interval '1 day', is_pagante = false where id = 'ID-DA-EMPRESA';` (e `update assinaturas set status = 'aguardando_pagamento' ...`), saia e tente entrar: a tela deve mostrar "Pagar agora e continuar".

## Segurança e privacidade

- Número de cartão **nunca** passa pelo sistema: a pessoa paga na página do InfinitePay.
- A assinatura, o aceite e os eventos **só o servidor grava**. O Administrador e o Super Admin só leem. Nem o dono da empresa consegue alterar o próprio valor, cancelar direto pelo banco ou apagar a prova do aceite.
- O texto do aceite, o valor e o link vêm sempre do servidor, nunca do navegador.
- Testes: `tests/cobranca-banco.test.js` (Postgres de verdade), `tests/cobranca-edge.test.js` (função), `tests/cobranca-rotinas.test.js` (avisos), `tests/cobranca-cliente.test.js` (telas) e `tests/gerar-sql-links.test.js` (ferramenta dos links).
