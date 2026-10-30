# Relatórios do recrutamento

Em **R&S — Relatórios** (menu Pessoas, só **Administrador** e **RH**) você vê como o recrutamento está andando: onde os candidatos avançam, onde ficam **parados** e de onde eles vêm. Tudo é calculado do **histórico de movimentações** que o sistema já guarda (cada vez que um candidato muda de etapa, a data fica registrada). Não é preciso preencher nada a mais.

Filtros: **uma vaga** ou todas; **todo o período** ou os últimos 30, 90 ou 365 dias (pela data em que o candidato entrou no processo). O botão **Exportar para planilha (CSV)** baixa tudo o que está na tela.

## O que cada bloco mostra

**Resumo:** candidatos (e quantos estão em andamento), contratados (e reprovados ou desistentes), **tempo de contratação**, **aceite da proposta** e quantos candidatos estão **parados**.

**Funil:** quantos candidatos **chegaram** a cada etapa, a porcentagem do total e a porcentagem **da etapa anterior**. Quem foi reprovado continua contando nas etapas que alcançou. Com uma vaga escolhida, só aparecem as etapas que ela usa.

**Tempo em cada etapa:** a **média** e a **mediana** de dias que os candidatos levaram em cada etapa, **só dos movimentos já concluídos**. Quem ainda está na etapa aparece à parte ("estão na etapa agora") e, se estiver há **mais de 7 dias**, entra em **parados** (com o botão "Abrir ficha"). É aqui que se enxerga o gargalo.

**Origem dos candidatos:** quantos vêm de cada canal (LinkedIn, indicação...), quantos chegam à decisão (escolha, proposta ou aprovado), quantos são contratados e quantos são reprovados. "LinkedIn", "linkedin " e "Linkedin" contam como a mesma origem.

**Reprovações:** em que etapa os candidatos saem e por qual **motivo**. O motivo é o **texto que quem reprovou digitou**, então o sistema só consegue agrupar textos iguais (sem diferenciar maiúscula ou acento).

**Por vaga:** os números de cada vaga aprovada.

## Como os números são calculados

- **"Chegou" a uma etapa:** passou por ela em algum momento (está no histórico) ou está nela agora.
- **Tempo concluído:** da entrada na etapa até a próxima movimentação (avançar, voltar ou reprovar).
- **Mediana:** o valor do meio. É mais confiável que a média quando poucos casos demoram muito.
- **Tempo de contratação:** da **publicação da vaga** até a **contratação** (a conversão em colaborador). É o mesmo critério do indicador que já existia no Processo seletivo.
- **Aceite da proposta:** dos candidatos que receberam proposta, quantos chegaram a "Aprovado".

## Cuidados ao ler (a tela também avisa)

- **Candidatos antigos podem ter lacunas** no histórico (movidos antes de o registro existir, ou criados por importação). Para eles faltam datas.
- **Amostras com menos de 5 casos** aparecem com "poucos dados": são só uma indicação.
- **"Reabrir" um candidato só passou a deixar registro** a partir desta versão. Quem foi reaberto antes não entra na contagem de "em andamento".
- Candidatos **sem data de entrada** ficam de fora quando você escolhe um período (a tela diz quantos).
- O **motivo da reprovação é texto livre**: pode haver variações do mesmo motivo escritas de jeitos diferentes. Não digite dados pessoais sensíveis nesse campo.
- A planilha exportada traz **números agregados** e o texto dos motivos, **não** traz nomes de candidatos. Células que o Excel leria como fórmula saem protegidas.

## Para conferir (5 minutos)

1. Abra **R&S — Relatórios** e confira se o número de **Candidatos** bate com o total dos quadros em **Processo seletivo**.
2. Escolha **uma vaga**: o funil deve mostrar só as etapas dela.
3. Em **Parados**, clique em "Abrir ficha" e confirme que o candidato está mesmo naquela etapa há tanto tempo.
4. Clique em **Exportar para planilha (CSV)** e abra no Excel: os acentos devem estar certos e as colunas separadas.
5. Em **Processo seletivo**, reprove e depois **reabra** um candidato de teste: na ficha, o histórico deve mostrar "Reaberto".

## O que ainda não existe

Previsão de contratação, custo por contratação, comparação entre períodos e gráficos de linha. Se algum for importante, me diga.
