# Provas de conhecimento no processo seletivo (R&S)

Permite ao **Administrador** e ao **RH** montar provas de múltipla escolha com **nota automática**, aplicá-las a candidatos do funil e acompanhar o resultado. O candidato faz a prova por um link, **sem login**, em **uma única tentativa**.

## O que é — e o que não é

- São provas de **conhecimento** (português, matemática, Excel, procedimentos da vaga...).
- **Não são testes psicológicos.** Testes psicológicos são privativos de psicólogos e exigem instrumentos próprios; não monte esse tipo de avaliação aqui.
- A nota é um **apoio à decisão**. O sistema **nunca reprova** ninguém: mostra apenas se o candidato _atingiu_ ou ficou _abaixo_ da nota mínima que a própria empresa definiu. A decisão é sempre de pessoas (isso também atende ao direito de revisão previsto na LGPD para decisões automatizadas).

## Como usar

1. Menu **Pessoas → R&S — Provas**. Crie uma prova do zero ou comece por um **modelo** (Português básico, Matemática básica, Excel básico — 10 questões cada, para você editar).
2. Cada questão tem de 2 a 6 alternativas, **uma** correta e um **peso** (1 a 10). A prova tem de 1 a 60 questões, tempo limite de 5 a 240 minutos e uma nota mínima (referência sua).
3. No **funil do R&S**, abra o candidato e clique em **Aplicar prova**: escolha a prova, por quantos dias o link vale (3, 7, 14 ou 30) e se quer enviar por e-mail. O link só aparece **uma vez** na tela (se perder, use **Reenviar link** em Resultados — isso gera um link novo e invalida o anterior).
4. Acompanhe em **Resultados**: situação, nota, se atingiu a mínima, tempo gasto e, em **Ver detalhes**, as respostas questão a questão (com o gabarito).

## Como a nota é calculada

Nota = pontos das questões certas ÷ pontos possíveis (cada questão vale o seu peso), em %, com uma casa decimal. Questão em branco ou inválida conta como errada.

## Como a prova funciona para o candidato

- O tempo só começa quando ele clica em **Iniciar prova** e **não para**, mesmo que ele feche a página. As respostas são salvas automaticamente; se a página recarregar, ele continua de onde parou, com o relógio correndo.
- A ordem das questões e das alternativas é **sorteada por candidato**.
- Se o tempo acabar, a prova é enviada sozinha com o que foi respondido. Um envio até 60 segundos depois do tempo é aceito (folga de rede) e marcado como "enviada fora do tempo"; depois disso valem só as respostas já salvas.
- Ele **não vê a nota nem o gabarito**: só a confirmação de que a prova foi enviada.

## Segurança e privacidade

- O **gabarito nunca vai ao navegador do candidato**; a correção e o cronômetro são do servidor.
- O link leva um código aleatório de 256 bits; no banco fica só o **hash** dele. A página da prova não usa Sentry, analytics nem envia o endereço adiante (o endereço contém o código).
- Só Administrador e RH criam provas e veem resultados; **abrir um resultado fica na Auditoria**.
- Cada aplicação guarda uma **cópia da prova**: editar a prova depois não muda a correção de quem já fez.
- **Retenção: 24 meses.** Os resultados são apagados automaticamente 24 meses depois da aplicação (rotina diária). O RH pode excluir um resultado antes, a qualquer momento (por exemplo, a pedido do candidato).
- Dados tratados: nome e e-mail do candidato (informados pela empresa), respostas, horários de início e envio e a nota. A empresa é a controladora; o Instituto INETRIS é operador. Veja a Política de Privacidade (item 2.7).

## Para ativar

1. Rode `sql/40-provas-rs.sql` no projeto Principal.
2. Implante a Edge Function `provas-rs` com **"Verify JWT" desligado** (a porta do candidato não tem login; o deploy automático já faz isso pelo `supabase/config.toml`). Ela precisa da função `enviar-email` (o envio por e-mail é opcional).
3. Opcional: secret `URL_SITE` com o endereço do site. O link do e-mail usa o endereço do site em que o RH está usando; o `URL_SITE` é o endereço de reserva.
4. A rotina diária (`rotinas-agendadas`) já cuida de expirar links vencidos e de apagar resultados antigos.

## Limites e o que não existe (ainda)

- Só múltipla escolha com **uma** correta (sem questões abertas, imagens ou sorteio entre bancos de questões).
- Até 300 provas aplicadas por empresa por dia e 100 provas cadastradas por empresa.
- Aplicação em lote (vários candidatos de uma vez) e vincular a prova direto à vaga ainda não existem.
- O sistema não impede consulta externa durante a prova (não há monitoramento de câmera ou de tela, de propósito). Use o tempo limite e provas objetivas como referência.
