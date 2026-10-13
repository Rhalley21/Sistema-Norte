# Etapas do processo seletivo (R&S)

Tudo isto fica no menu **Pessoas → R&S — Processo seletivo** (Administrador e RH): as etapas na ordem, quantos candidatos estão em cada uma, as orientações e links de cada etapa e as etapas de cada vaga. O funil de candidatos de cada vaga continua em **R&S**.

> **Provas de conhecimento:** o recurso de provas automáticas (v0.112.0) foi **retirado** na v0.114.0. As etapas "Teste lógico", "Prova teórica" e "Prova prática" continuam no processo, como etapas de registro: o RH aplica a prova pelo meio que preferir (inclusive um link externo, indicado nas orientações) e registra o resultado.

O funil de candidatos segue as etapas abaixo, **na ordem**. Cada **vaga escolhe quais etapas usa** (por padrão, todas).

| # | Etapa | Tipo | E-mail ao candidato |
|---|---|---|---|
| — | Nova candidatura _(fixa)_ | — | sim |
| 3 | Triagem dos currículos | — | sim |
| 4 | Teste DISC e GALT | registro | sim |
| 5 | Vídeo de apresentação | vídeo (veja [VIDEO-RS.md](VIDEO-RS.md)) | sim — já com o link para enviar o vídeo |
| 6 | Verificação nas redes sociais | registro, **interna** | **não** |
| 7 | Checagem de informações do currículo | registro, **interna** | **não** |
| 8 | Entrevista de fit cultural | entrevista | sim |
| 9 | Teste lógico | registro | sim |
| 10 | Prova teórica | registro | sim |
| 11 | Prova prática | registro | sim |
| 12 | Entrevista final | entrevista | sim |
| 13 | Escolha do candidato | — | sim |
| — | Proposta · Aprovado _(fixas)_ | — | sim |

As etapas **1 (perfil da vaga)** e **2 (divulgação)** são da **vaga**, e não do candidato: já existem na requisição de vaga e na página pública de candidatura.

## Etapas por vaga

- Ao **criar a vaga**, todas as etapas vêm marcadas; desmarque as que a vaga não usa.
- Depois, no funil da vaga, abra **Etapas do processo desta vaga** para mudar, ou use **Copiar de outra vaga**.
- _Nova candidatura_, _Proposta_ e _Aprovado_ valem para toda vaga e não se desligam.
- O seletor de etapa de cada candidato mostra só as etapas da vaga (mais a etapa em que ele já está, se a vaga a desligar depois).
- Vagas criadas antes desta versão usam **todas** as etapas.

## O que aconteceu com os candidatos que já estavam no funil

O funil antigo tinha 8 etapas. Quem estava em uma etapa que deixou de existir é movido sozinho, **com uma linha no histórico**, na primeira vez que a tela de R&S é aberta:

| Etapa antiga | Passa para |
|---|---|
| Contato inicial | Triagem dos currículos |
| Avaliação | Teste DISC e GALT |
| Entrevista | Entrevista de fit cultural |
| Finalista | Escolha do candidato |

_Nova candidatura_, _Triagem_, _Proposta_ e _Aprovado_ continuam como eram. Reprovações e históricos não mudam. Se o mapeamento não for o que você quer para algum candidato, é só mover a etapa dele no seletor.

## Cuidados com as etapas de verificação (6 e 7)

- Redes sociais podem expor informações que a lei protege (religião, opinião política, saúde, orientação sexual). **Registre e decida só com base no que se relaciona com a vaga.** Peça ao advogado que revise esse procedimento.
- A página de candidatura e a Política de Privacidade **avisam o candidato** de que o currículo e perfis profissionais públicos podem ser verificados.
- Essas etapas **não mandam e-mail** ao candidato.

## Prova prática: criada em cada vaga

A prova prática **não tem texto geral da empresa**: o que se pede a um vendedor não é o que se pede a um analista financeiro. Cada vaga que usa a etapa define a sua, no funil da vaga, em **R&S → a vaga → Orientações e prova prática desta vaga**:

- **Enunciado** (até 2000 caracteres): a tarefa que o candidato deve fazer, o que entregar e **como entregar** (por exemplo, "envie o arquivo para rh@suaempresa.com.br").
- **Prazo de entrega** (de 1 a 30 dias): o e-mail mostra a data limite, contada a partir do dia em que o candidato entra na etapa.
- **Links** de apoio (até 3, só `https://`), como o briefing ou os dados da tarefa.
- **Critérios de avaliação** (até 6, cada um com peso de 1 a 10): servem para o RH avaliar a entrega com o mesmo critério para todos os candidatos da vaga. **Eles são só do RH e não vão no e-mail do candidato.** (O registro da nota por critério chega na tela de registro dos resultados.)
- O formulário mostra a **Referência desta vaga** (responsabilidades do cargo e habilidades desejadas) para ajudar a criar uma prova coerente com ela.

O candidato recebe o enunciado **da vaga em que está**, quando entra na etapa. Se a vaga usa a prova prática e ainda não definiu o enunciado, ela aparece como **pendente** (no funil da vaga e na tela do Processo seletivo) e, ao mover um candidato para essa etapa, o sistema **pergunta** antes, porque o e-mail sairia sem a tarefa.

As **outras etapas** também aceitam orientações por vaga; quando a vaga tem as suas, elas valem **no lugar** das da empresa (que ficam em R&S — Processo seletivo).

## Orientações e links por etapa

No menu **R&S — Processo seletivo** (Administrador e RH), na área **Orientações e links das etapas**. Para cada etapa que manda e-mail ao candidato você escreve as **orientações** (até 500 caracteres) e cola **até 3 links**. Isso vai no fim do e-mail que o candidato recebe quando entra na etapa (se a etapa não tiver orientações, o e-mail continua dizendo que a equipe enviará em breve).

- Só endereços que começam com **https://** são aceitos; os demais são ignorados (a tela avisa).
- Os links **não ficam no código**: cada empresa cola os seus.
- O e-mail avisa o candidato de que os links levam a **sites externos**, com a própria política de privacidade — **confira a política do site antes de indicar** (os dados que o candidato digita lá ficam com o site, não com o sistema).
- Vale para: triagem, DISC/GALT, vídeo, entrevistas, teste lógico, prova teórica e escolha. A **prova prática** é criada em cada vaga (veja acima). As etapas internas (redes sociais e checagem) não têm e-mail, então não têm orientações.
- A configuração vale para **e-mails enviados daqui para frente**: quem já entrou na etapa antes de você configurar não recebe o e-mail de novo.
- O candidato ainda **não tem como devolver o resultado pelo sistema**. Escreva nas orientações para onde ele deve enviar (por exemplo, "envie o resultado em PDF ou print para rh@suaempresa.com.br").

## DISC e GALT

O sistema **não aplica nem corrige** esses testes. Eles são feitos fora do sistema (por quem tem habilitação ou em uma plataforma externa indicada pelos links acima), e o RH registra o resultado na etapa. Testes online gratuitos não são instrumentos psicológicos validados: use o resultado como complemento, nunca como único critério. Testes psicológicos são privativos de psicólogos; o DISC, até onde sei, não consta como instrumento aprovado como teste psicológico — confirme com um psicólogo (CRP).

## Vídeo de apresentação

O candidato grava (ou escolhe) um vídeo de **no máximo 2 minutos** por um link pessoal; o RH assiste no funil, por link temporário. Mover o candidato para a etapa já envia o link. Guardado por **6 meses**. Detalhes, limites e o teste real obrigatório em **docs/VIDEO-RS.md**.

## O que ainda NÃO existe (próximas partes)

1. **Registro do resultado de cada etapa** (DISC/GALT, redes sociais, checagem, prova prática): hoje o funil move o candidato de etapa, mas o resultado ainda não tem onde ser registrado. Será uma tabela nova, acessível só por Administrador e RH (esses dados são sensíveis).
