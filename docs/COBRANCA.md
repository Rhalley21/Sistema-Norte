# Cobrança por link de pagamento

O teste grátis **continua sem cartão**. No fim dos 7 dias a pessoa recebe o **link de pagamento do plano dela** e **paga se quiser continuar**. **Nada é cobrado automaticamente**: quem não paga fica com o acesso pausado e os dados guardados.

Decisões tomadas: **sem fidelidade** (só a mensalidade normal), primeira cobrança = **mensalidade + implantação**, pagamento pelo **link do InfinitePay** de cada valor.

| Plano | Colaboradores | Mensalidade | Implantação (única vez) | Primeiro pagamento |
|---|---|---|---|---|
| Essencial | até 10 | R$ 297,00 | R$ 590,00 | **R$ 887,00** |
| Gestão | 11 a 30 | R$ 597,00 | R$ 990,00 | **R$ 1.587,00** |
| Estratégico | 31 a 60 | R$ 997,00 | R$ 1.490,00 | **R$ 2.487,00** |

Acima de 60 colaboradores não há plano de tabela (proposta personalizada).

## O caminho do cliente

1. **Escolher o plano** (tela Pagamento do Administrador). O sistema sugere o plano pela quantidade de colaboradores cadastrados, mostra os valores, a data do fim do teste e repete que nada é cobrado automaticamente. A pessoa confirma, e o sistema **guarda o texto exato que ela viu** (o aceite), a versão, quem confirmou e quando.
2. **Avisos por e-mail ao Administrador**, com o link do plano: **3 dias antes**, **1 dia antes**, **no dia do fim do teste** e **2 dias depois** (acesso pausado). O mesmo aviso nunca sai duas vezes.
3. **O link aparece também na tela Pagamento** a partir de 3 dias antes do fim do teste, e na **tela de entrada** quando o teste já terminou (botão "Pagar agora e continuar").
4. **Você confirma o pagamento** no Super Admin (botão **Confirmar pagamento** na linha da empresa). Isso ativa a assinatura, marca a empresa como cliente e libera o acesso.
5. Quem **cancelar** não recebe mais avisos. Quem já tem assinatura **não recebe** os avisos antigos de fim de teste (senão seriam dois e-mails dizendo coisas diferentes).

O link de pagamento de cada plano fica numa tabela que **só o servidor lê**: cada empresa recebe apenas o link do **próprio plano**, na hora certa, e nunca a lista inteira.

## O que ainda NÃO existe (leia antes de divulgar)

- **Cobrança automática**: não existe. Com link de pagamento a pessoa paga quando quiser. (Se o seu link do InfinitePay for de **assinatura recorrente**, o fluxo muda: avise.)
- **Confirmação automática do pagamento**: não existe. Você confirma à mão no Super Admin depois de ver o pagamento no InfinitePay. A confirmação pode levar algumas horas do ponto de vista do cliente.
- **Mensalidades seguintes**: esta versão cuida só do **primeiro pagamento**. Os meses seguintes, lembrete e link de cada mensalidade, ainda não são automáticos.
- **Nota fiscal**, **devolução de valores** e **cancelamento depois do pagamento** não são tratados pelo sistema: combine com o seu contador e o seu advogado.
- **Termos de Uso**: ainda citam "condição de fidelidade" e não descrevem esta cobrança. É texto jurídico, então **não foi alterado**: precisa de revisão do advogado, junto com o texto do aceite (o texto está em `supabase/functions/cobranca/index.ts`, função `textoDoAceite`).

## Para ligar (nesta ordem)

A cobrança vem **desligada**. Enquanto não ligar, o sistema se comporta como antes.

1. **Suba o site** (versão 0.131.0) e espere o CI ficar verde.
2. **SQL 46**: no Supabase, SQL Editor, rode o arquivo `46-cobranca-sem-aspas.sql`. Cria as tabelas, as proteções e se registra sozinho. Pode rodar mais de uma vez.
3. **Cadastre os links de pagamento.** No InfinitePay crie **três links de valor fixo**: **R$ 887,00** (Essencial), **R$ 1.587,00** (Gestão) e **R$ 2.487,00** (Estratégico), que são o primeiro pagamento (mensalidade + implantação). O valor aparece no fim do endereço do link. Me mande os três, ou rode a ferramenta (ela **recusa** o link se o valor escrito nele não for o esperado para o plano, para não entrar por engano o link de R$ 297 no lugar do de R$ 887):

   ```
   python3 scripts/gerar-sql-links.py essencial:primeira=LINK-887 gestao:primeira=LINK-1587 estrategico:primeira=LINK-2487
   ```

   Cole o SQL que ela imprime no SQL Editor do Supabase. Os links de **mensalidade** (R$ 297, 597 e 997) usam o tipo `mensalidade` e ficam guardados para os meses seguintes (`links-mensalidade-sem-aspas.sql`). Para trocar um link depois, gere de novo: ele troca o do mesmo plano e tipo. O banco só aceita endereço `https://` sem espaços.
4. **Funções no Supabase** (se a implantação automática estiver desligada): `cobranca` (**Verify JWT LIGADO**) e `rotinas-agendadas` (**Verify JWT DESLIGADO**, como sempre). Os códigos estão no zip.
5. **Segredo**: Edge Functions, Secrets, `COBRANCA_ATIVA` = `true`.
6. **No site**: em `ambiente.js`, troque `cobrancaAtiva: false` por `cobrancaAtiva: true` (só em `producao`) e faça o push.

**Para desligar**: coloque `COBRANCA_ATIVA` = `false` (ou apague o segredo). A tela some e as funções recusam. Os dados já gravados ficam.

## Teste real antes de divulgar

Com uma empresa de teste (use um e-mail seu):

1. Crie a conta pelo teste grátis, abra **Pagamento** e escolha um plano. Deve aparecer "Sua assinatura", com os valores e a data.
2. Troque de plano e depois cancele: os dois devem funcionar. Escolha o plano de novo.
3. Para ver o link e os avisos sem esperar 7 dias, no SQL Editor: `update assinaturas set primeira_cobranca_em = current_date + 3 where empresa_id = 'ID-DA-EMPRESA';` e recarregue a tela: o botão **Pagar** deve aparecer. O e-mail sai na próxima rotina diária.
4. No Super Admin, a linha da empresa deve mostrar a situação da cobrança e o botão **Confirmar pagamento**. Confirme: a empresa vira cliente.
5. Teste o bloqueio: `update empresas set trial_ate = now() - interval '1 day', is_pagante = false where id = 'ID-DA-EMPRESA';` (e `update assinaturas set status = 'aguardando_pagamento' ...`), saia e tente entrar: a tela deve mostrar "Pagar agora e continuar".

## Segurança e privacidade

- Número de cartão **nunca** passa pelo sistema: a pessoa paga na página do InfinitePay.
- A assinatura, o aceite e os eventos **só o servidor grava**. O Administrador e o Super Admin só leem. Nem o dono da empresa consegue alterar o próprio preço, cancelar direto pelo banco ou apagar a prova do aceite.
- O texto do aceite, os valores e o link vêm sempre do servidor, nunca do navegador.
- Testes: `tests/cobranca-banco.test.js` (Postgres de verdade), `tests/cobranca-edge.test.js` (função), `tests/cobranca-rotinas.test.js` (avisos) e `tests/cobranca-cliente.test.js` (telas).
