# Agenda das entrevistas e movimentação em lote

Duas funções do recrutamento, para Administrador e RH. As duas usam o mesmo caminho que a movimentação de um candidato por vez: o histórico é registrado, o e-mail da etapa sai e as regras de cada etapa valem do mesmo jeito.

## Mover ou reprovar vários candidatos de uma vez

No quadro da vaga (R&S — Processo seletivo), clique em **Selecionar vários**. Cada cartão ganha uma caixa de seleção, e cada fase ganha "Selecionar todos desta fase". Com candidatos marcados, a barra de cima oferece:

- **Avançar para a próxima etapa:** cada candidato vai para a próxima etapa **da vaga** (as etapas desligadas são puladas).
- **Mover para…:** todos vão para a etapa que você escolher.
- **Reprovar:** todos são reprovados, com um motivo (opcional, até 300 caracteres) que fica no histórico de cada um e aparece nos relatórios.

Antes de executar, um painel mostra **quantos vão para onde, quantos recebem e-mail, quantos não têm e-mail cadastrado** e os **avisos** que valem (por exemplo, a etapa de DISC/GALT sem links, ou a prova prática sem definição). Quem não pode ser movido (já reprovado, já contratado, na última etapa) aparece como **ignorado**, com o motivo. Só depois de **Confirmar** o sistema age.

**Como funciona por dentro**
- Um candidato por vez, com uma pausa entre eles. Isso evita estourar o limite de envio de e-mails. Com 50 candidatos, leva cerca de 20 segundos.
- Nas etapas de **vídeo** e de **resultado** (DISC/GALT, testes, prova prática), cada candidato recebe o **seu** link pessoal.
- Se um e-mail **não sair**, a movimentação **não é desfeita**. O resumo final diz **quem** ficou sem aviso e oferece "Tentar enviar de novo". Para vídeo e resultado, use "Reenviar" na ficha da pessoa.
- Quem mudou de etapa **enquanto o painel estava aberto** (outra pessoa, outra aba) é **pulado**, e aparece no resumo.
- Máximo de **50 candidatos por vez**. Não feche a página enquanto o andamento aparece.
- A Auditoria guarda só as **contagens** (quantos, de que ação, em qual vaga), nunca nomes.
- **Reprovar também avisa o candidato por e-mail**, como na reprovação individual.

## Agenda das entrevistas

**Agendar:** abra a ficha do candidato numa etapa de entrevista (fit cultural ou final) e use **Agendar entrevista**. Informe data, hora, duração, fuso (Brasília por padrão), formato (online, presencial ou telefone), o link ou o local, o entrevistador (opcional) e uma observação para o candidato (opcional).

**O que o candidato recebe** (se a caixa de e-mail estiver marcada e ele tiver e-mail): data por extenso, hora com o fuso, duração, formato, link ou local, entrevistador, a observação e dois botões, **Google Agenda** e **Outlook**. O e-mail **só mostra o que você preencheu**: não inventa endereço, nome de empresa nem contato.

**Na ficha:** cada entrevista aparece com a situação (agendada, realizada, faltou, cancelada) e, enquanto agendada, os botões **Remarcar**, **Realizada**, **Faltou**, **Reenviar e-mail**, **Baixar .ics** (para o seu calendário) e **Cancelar**. Remarcar e cancelar avisam o candidato por e-mail (o cancelamento só se ele já tinha sido avisado antes).

**Conflitos:** se o mesmo candidato ou o mesmo entrevistador já tem outra entrevista no horário, o sistema **avisa** e oferece "Agendar mesmo assim". Uma entrevista que começa quando a outra termina não conflita.

**Página R&S — Agenda** (menu Pessoas):
- **Para atualizar:** entrevistas que já passaram e ainda estão como "agendada". Marque **Realizada** ou **Faltou**.
- **Hoje** e **próximos 30 dias**, agrupados por dia, com **Enviar lembrete** (e-mail manual ao candidato).
- **Em etapa de entrevista, sem data marcada**, com botão **Agendar**.
- **Baixar a agenda (.ics):** um arquivo com todas as entrevistas dos próximos 30 dias, para importar no Google Agenda, Outlook ou Apple Calendar.

**No painel inicial e na tela do Processo seletivo**, "o que fazer hoje" avisa de entrevistas hoje, entrevistas para atualizar e candidatos sem data.

**Reprovar um candidato cancela** as entrevistas que ainda estavam agendadas (sem e-mail de cancelamento: ele já recebe o de reprovação).

## Limites

- O **lembrete é manual** (botão). Um lembrete automático exigiria que o servidor gravasse no documento da empresa, o que hoje só o navegador faz.
- O e-mail leva **links de calendário**, não o arquivo .ics anexado.
- O candidato **não escolhe o horário** nem confirma pela tela. Hoje a confirmação é por contato direto com a empresa.
- Se duas pessoas agendarem **ao mesmo tempo**, as duas entrevistas ficam (cada entrevista é um item próprio no salvamento seguro).
- Os horários são de relógio de parede num fuso escolhido (Brasília, Manaus, Rio Branco ou Fernando de Noronha).

## Teste real (10 minutos, antes de usar com candidatos)

Use **contas de e-mail suas** (ou um alias) como candidatos de teste, numa vaga de teste.

1. Crie 3 candidatos de teste com e-mails seus diferentes e leve-os para a etapa **Triagem**.
2. Em **Selecionar vários**, marque os 3 e use **Avançar para a próxima etapa**. Confira o painel de confirmação e confirme. Cada caixa de e-mail deve receber **um** e-mail.
3. Leve um deles para **Entrevista de fit cultural** e clique em **Agendar entrevista** (data de amanhã, formato online, um link qualquer). O e-mail deve chegar com data por extenso, o link e os dois botões.
4. Clique em **Google Agenda** no e-mail: o evento deve abrir já preenchido, no horário certo.
5. Na ficha, **Baixar .ics** e abra o arquivo no seu calendário.
6. **Remarcar** para outra hora: deve chegar um e-mail "Horário da entrevista alterado" com o horário antigo riscado.
7. Abra **R&S — Agenda**: a entrevista aparece em "Próximos 30 dias". Use **Enviar lembrete**.
8. **Cancelar** a entrevista: deve chegar o e-mail de cancelamento.
9. Marque os outros 2 candidatos e use **Reprovar** com um motivo. Cada um deve receber o e-mail de reprovação, e o motivo deve aparecer no histórico e em **R&S — Relatórios**.

Se algo não bater, anote a tela, o que clicou e a hora, e me mande.
