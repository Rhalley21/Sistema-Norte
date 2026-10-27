# Changelog — Plataforma NORTE

Registro de versões da própria plataforma (não confundir com o versionamento
de Desenho de Cargo, que é por cargo/empresa — ver RN024).

## v0.122.0 — Importar pessoas de uma planilha (Recrutamento)
Primeiro dos itens que faltavam no recrutamento: **cadastrar várias pessoas de uma vez**.

- Botão **Importar planilha** no Recrutamento: baixa um **modelo CSV**, lê o arquivo **no navegador** (nada vai ao servidor antes da
  confirmação) e mostra uma **prévia** com a situação de cada linha: será importada, repetida na planilha, já cadastrada (mesmo
  e-mail ou telefone, inclusive de quem já está em processo seletivo) ou erro (sem nome, e-mail inválido, campo grande demais).
- Entende **CSV de verdade**: separador `;` `,` ou tabulação, aspas, aspas duplicadas, quebras de linha dentro de aspas, CRLF/LF, e
  arquivos em UTF-8 ou **Windows-1252** (o CSV do Excel brasileiro). Reconhece as colunas em qualquer ordem e com sinônimos
  (nome, e-mail, telefone/celular/WhatsApp, origem/fonte, currículo/resumo). Limite de **500 linhas e 1 MB**; `.xlsx` é recusado com
  a orientação de salvar como CSV.
- As pessoas entram **"só cadastradas"**: sem vaga, **sem e-mail ao candidato** e **fora do banco de talentos**. Rodar o mesmo arquivo
  de novo não duplica ninguém. O texto das células nunca é executado (HTML e fórmulas de planilha ficam como texto puro). A
  Auditoria registra só a quantidade.

**Ativar:** só subir o site (sem SQL nem função nova). **Testes:** 27 novos, com 14 regressões plantadas e detectadas (e 1 mutação
sem efeito real). Não foi visto em navegador de verdade: confira o fluxo depois de subir (veja o roteiro abaixo no guia).

## v0.121.0 — Preparação do ambiente de testes e verificador de migrações
Item 7 do caminho para vender o sistema: **ambiente de testes separado** e **deploy/migrações automáticos**. O segundo projeto Supabase
ainda não existe (depende do plano Pro), então tudo o que depende dele está **pronto e desligado**; o que não depende, já funciona.

- **`ambiente.js`:** um arquivo único com o endereço e a chave PÚBLICA de cada ambiente, que escolhe o ambiente pelo **endereço do
  site** (`teste.`/`staging.` no começo, ou `-teste` no caminho = teste; o resto = produção). **Não dá para trocar de ambiente por
  parâmetro da URL**, então o site de produção nunca fala com o banco de testes. Enquanto o projeto de testes não existe, o site de
  testes mostra uma faixa vermelha e não fala com ninguém. As seis telas que tinham o endereço e a chave escritos (app, entrada,
  planos, vaga, vídeo e resultado) agora leem desse arquivo; um teste garante que nenhuma volta a escrevê-los e que **não há chave
  secreta no site**.
- **Deploy das funções por ambiente:** o fluxo manual ganhou a escolha `producao`/`teste` (teste exige a variável `PROJETO_TESTE`);
  em push continua sendo sempre produção, e o automático continua desligado até a variável `DEPLOY_AUTOMATICO`.
- **Verificador de migrações (`scripts/migracoes.js` + fluxo "Migrações do banco"):** lê os SQL da pasta `sql/` (do 15 em diante, que
  se registram sozinhos), pergunta ao banco quais já estão registrados e **lista os pendentes, em ordem numérica**. Por padrão só
  **simula**. Aplicar de verdade exige a caixinha "executar" e, **em produção, a variável `MIGRACOES_AUTOMATICAS_PRODUCAO = true`**.
  Aplica um por vez, **para no primeiro erro**, confere se cada arquivo se registrou e **nunca imprime o token nem o SQL**. Só manual,
  nunca em push. Entende banco novo (tabela de controle ainda inexistente).
- **Publicação do site de testes (`publicar-teste.yml`):** a cada push no ramo `teste`, depois do CI, copia só o site para o
  repositório de testes. Desligado até `PUBLICAR_TESTE = true`.
- **docs/AMBIENTES.md:** como tudo funciona, as variáveis e os segredos do GitHub, e o passo a passo para quando o Pro chegar.

**Ativar:** só subir o site (sem SQL nem função nova). Para usar o verificador: criar o secret `SUPABASE_ACCESS_TOKEN` e rodar o
fluxo "Migrações do banco" como **simulação**.

**NÃO testado com o Supabase de verdade:** a API de consulta ao banco usada pelo verificador, a publicação do site de testes e o
deploy no projeto de testes. Por isso a primeira execução do verificador deve ser uma simulação.

**Testes:** 32 novos (ambientes, telas, fluxos do GitHub e verificador com API simulada), com 15 regressões plantadas e detectadas.

## v0.120.0 — O candidato devolve o resultado do teste pelo sistema
Nas etapas com teste ou entrega (**DISC/GALT, teste lógico, prova teórica e prova prática**), o e-mail da etapa traz, além do link do
teste e do "Como fazer", o botão **Enviar meu resultado**. Ele abre uma página pessoal (`entrega.html`, sem login) onde o candidato
anexa **até 3 arquivos** (PDF, PNG, JPG ou WEBP, **5 MB** cada) e/ou escreve um **texto**, e envia **uma única vez**.

**Para o RH:** mover o candidato (Avançar ou seletor da ficha) para uma dessas etapas cria o pedido e manda **um só e-mail**, já com o
botão. Na **ficha do candidato**, o painel **Resultados enviados pelo candidato** lista os pedidos de todas as etapas, com **Ver
resultado** (texto + arquivos por links temporários de 10 minutos, registrado na Auditoria), **Reenviar link**, **Cancelar**,
**Excluir** e **Pedir o resultado agora**. "Para você fazer agora" conta os resultados enviados. Se o pedido falhar, o e-mail da
etapa sai mesmo assim, sem o botão, e o RH é avisado. Não dá para excluir a pessoa do cadastro com resultado enviado.

**Garantias (cada uma tem teste):**
- O servidor **confere o tipo real de cada arquivo** pelos primeiros bytes (PDF, PNG, JPEG, WEBP); arquivo falso, vazio, grande
  demais, que não chegou ou de formato diferente do declarado **apaga todos os arquivos da tentativa**. Tamanho (5 MB) e formatos são
  impostos também pelo armazenamento privado. Na confirmação vale o tamanho REAL guardado, não o que o navegador disse.
- Os arquivos vão direto do aparelho ao armazenamento; o código do link tem 256 bits e só o hash vai ao banco; uma única entrega
  (duas confirmações simultâneas valem uma vez); voltar para a etapa cancela o link antigo; o caminho interno dos arquivos nunca
  vai ao navegador; o botão do e-mail só aceita link https; a Auditoria só leva IDs.
- **Retenção de 6 meses:** a rotina diária apaga os arquivos e depois o registro, e expira pedidos vencidos. Política de Privacidade
  (HTML e Word) atualizada.
- O passo a passo padrão do e-mail agora diz "da forma indicada neste e-mail" (cobre o botão e as orientações).

**Ativar — NESTA ORDEM** (docs/ENTREGA-RS.md): (1) rodar `sql/43-entregas-rs.sql`; (2) implantar a função `entrega-rs` com **Verify
JWT desligado** e **reimplantar a `rotinas-agendadas`** (o SQL vem antes); (3) subir o site; (4) **fazer o teste real** do guia.

**NÃO testado com o Supabase de verdade:** o envio direto ao armazenamento (link de envio assinado) e a entrega do e-mail — só com
armazenamento simulado e Chromium (31 verificações de navegador). Faça o teste real do guia antes de usar com candidatos.

**Testes:** 52 novos (servidor, página e RH) e 5 da rotina, com 20 regressões plantadas e detectadas.

## v0.119.0 — O e-mail de cada etapa ensina o candidato a fazer
Ao mover o candidato de etapa, o e-mail dele passa a ter **três partes, nesta ordem**: o aviso da etapa, o **"Como fazer"**
(passo a passo padrão, escrito para cada etapa) e as **orientações e links** da vaga (ou da empresa).

- **Passo a passo para todas as etapas que mandam e-mail** (nova candidatura, triagem, DISC/GALT, vídeo, entrevistas, teste
  lógico, prova teórica, prova prática, escolha, proposta e aprovado). É **genérico de propósito**: não inventa links, endereços
  nem datas (um teste confere). As etapas internas continuam sem e-mail.
- As frases "nossa equipe enviará as orientações em breve" agora vêm **junto** do passo a passo, e não no lugar dele.
- **Montador único do e-mail** (`montarEmailEtapaRS`): o mesmo código monta o e-mail enviado e a pré-visualização.
- **Pré-visualização** em cada etapa ("Ver o e-mail que o candidato recebe"), na configuração da empresa e na da vaga, refletindo o
  que está salvo.
- **Aviso antes de mover** para DISC/GALT, teste lógico ou prova teórica quando ainda não há links nem orientações (da vaga ou da
  empresa): sem eles o candidato receberia só o passo a passo, sem o endereço do teste. Vale também para o botão Avançar.
- O e-mail do **vídeo** continua sendo o do pedido de vídeo (já traz link pessoal, limite de 2 minutos e prazo).

**Ativar**: só subir o site (sem SQL nem função nova). **Testes**: 16 novos do e-mail (e 6 ajustados), com 10 regressões plantadas e
detectadas. O envio real do e-mail (entrega, caixa de spam, aparência no Gmail/Outlook) não foi testado daqui: mande um e-mail de
teste para você mesmo (candidato de teste com o seu e-mail) antes de usar com candidatos.

## v0.118.0 — Processo seletivo mais simples: o quadro da vaga
A tela do Processo seletivo deixou de ser uma pilha de seções e virou **um quadro por vaga**.

1. **Quadro em 4 fases** (Entrada · Avaliação · Entrevistas e provas · Decisão). Cada candidato é um cartão com **Avançar → próxima
   etapa DA VAGA** (as etapas que a vaga desligou são puladas), **Reprovar** e, no fim, **Converter em colaborador**. Acabou a
   lista de 13 etapas por candidato. O Avançar usa o mesmo caminho de antes (histórico, e-mail da etapa, pedido do vídeo e
   aviso da prova prática). Reprovados ficam numa lista recolhida, com Reabrir.
2. **"Para você fazer agora"** no topo: vagas para aprovar, candidaturas novas, candidatos para triar, vídeos recebidos, vagas
   sem a prova prática definida e aprovados para contratar — cada item leva para a vaga onde resolver.
3. **Ficha da pessoa** (clique no nome): dados, currículo, perfil, histórico e **a ação da etapa atual** (vídeo, prova prática com
   enunciado/prazo/critérios, links do DISC/GALT, scorecards das entrevistas). Substitui os painéis soltos embaixo de cada linha.
4. **Criar a vaga em poucos campos:** cargo, unidade, setor, quantidade, motivo e prazo à vista; **modelo de processo**
   (Completo, Enxuto ou Operacional) no lugar de marcar 11 caixinhas; perfil, remuneração e requisitos em "Mais detalhes";
   ajuste fino das etapas em "Ajustar as etapas deste processo".
5. **Configuração separada do dia a dia:** "Configurar esta vaga" (etapas, orientações e prova prática) fica recolhido embaixo do
   quadro; "Vagas", "Como funciona" e as orientações da empresa são seções recolhidas.

Nada muda nos dados, nas etapas, nos e-mails nem no vídeo: só a forma de mexer. A tabela de candidatos e o seletor de 13 etapas
saíram (a ficha ainda tem "Mover para outra etapa…" para casos fora do comum).

**Ativar**: só subir o site (sem SQL nem função nova). **Testes**: 27 novos do quadro (e 5 ajustados), com 12 regressões
plantadas e detectadas. Não foi testado em navegador de verdade: confira o fluxo do quadro depois de subir.

## v0.117.0 — Recrutamento = cadastro de pessoas; Processo seletivo = tudo da vaga
Reorganização para ficar simples: cada tela tem **uma** função.

- **R&S — Recrutamento** (só Administrador e RH) passa a ser o **cadastro de pessoas**: guarda os dados e mostra a situação.
  Cada pessoa aparece **uma vez só** (os registros de várias vagas são juntados pelo e-mail ou telefone), com todos os
  processos dela. Tem **+ Pessoa**, **Editar**, **Excluir** (pedido de exclusão do candidato; bloqueado se houver vídeo enviado),
  busca, filtro de situação e **Levar para a vaga…**, que coloca a pessoa no processo de uma vaga aprovada e aberta (quem
  era só cadastrada entra pelo mesmo registro; quem já passou por outro processo ganha um registro novo e o histórico anterior
  fica intacto; quem já está em processo ou foi contratado não pode ser levado). Mostra "No banco" para quem está no banco de talentos.
- **R&S — Processo seletivo** (Administrador, RH e líder) passa a ter **tudo do processo**: o **passo a passo** na ordem da
  empresa (1 a 13, com quem faz cada etapa, o que acontece e quantos candidatos estão em cada uma), as **vagas** (nova
  requisição, aprovar, publicar, encerrar) com o **funil** de cada uma, e as orientações e links das etapas (só Administrador e
  RH). Saíram a tabela "etapas por vaga" e o cartão-ponteiro.
- **Candidatura pelo link da vaga** continua entrando **direto no processo daquela vaga** (e aparece também no Recrutamento).
- **Banco de talentos** continua só com quem marcou a autorização no formulário (entra sozinho); não dá para levar quem não autorizou.
- **Saiu o "+ Candidato" de dentro da vaga:** todo cadastro novo é feito só no Recrutamento. Os indicadores contam só quem está num processo.
- O **líder** continua pedindo vagas (a tela das vagas agora fica no Processo seletivo).

**Ativar**: só subir o site (sem SQL nem função nova). **Dados existentes:** nada é perdido — todos os candidatos que já estavam
em vagas aparecem no Recrutamento, agrupados por pessoa.

**Testes**: 40 novos/reescritos (cadastro e Processo seletivo), com 14 regressões plantadas e detectadas.

## v0.116.0 — Vídeo de apresentação do candidato (máximo 2 minutos)
Nova etapa funcional do processo seletivo: o candidato grava (ou escolhe) um vídeo de **no máximo 2 minutos** e envia por um
link pessoal, **sem login**. Só o Administrador e o RH assistem. Guardado por **6 meses**.

**Candidato** (`video.html`): **gravar pela própria página** (câmera do aparelho, ~1 Mbps: 2 minutos ficam em torno de
15 MB, e a gravação **para sozinha aos 2 minutos**) ou **escolher um arquivo** (MP4, WebM ou MOV de até 40 MB). A página
confere formato, tamanho e duração **antes** de enviar, mostra a prévia (dá para gravar de novo) e avisa que o vídeo será
visto só pela equipe de recrutamento e guardado por 6 meses. Funciona no celular. Sem Sentry, sem analytics, sem Referer.

**RH** (painel no funil da vaga): **mover o candidato para a etapa "Vídeo de apresentação"** já cria o pedido e envia o link
por e-mail, com as orientações da vaga (ou da empresa). O painel mostra a situação (aguardando, enviado, prazo vencido,
cancelado) e tem **Assistir** (link temporário de 10 minutos, registrado na Auditoria), **Reenviar link**, **Cancelar
pedido** e **Excluir vídeo** (apaga o arquivo de vez, inclusive a pedido do candidato).

**Garantias (cada uma tem teste)**
- **Os limites da página e da função são os mesmos** (2 min, 40 MB, formatos); o limite de **40 MB e os formatos são impostos
  pelo próprio armazenamento**. A duração é conferida no navegador do candidato (o servidor não "assiste" o vídeo): a trava de
  verdade é o tamanho; o RH vê um aviso se a duração informada passar de 2 minutos.
- O servidor **confere o tipo real do arquivo** pelos primeiros bytes: imagem, PDF, vazio, grande demais ou de formato
  diferente do declarado é **apagado** e recusado.
- O vídeo vai **direto do aparelho para o armazenamento privado**; a função só autoriza o envio de **um** caminho e depois
  confere. O código do link tem 256 bits e **só o hash fica no banco**; uma única entrega por pedido (duas confirmações ao
  mesmo tempo marcam "enviado" uma vez só). O caminho interno do arquivo nunca vai ao navegador.
- **Retenção de 6 meses:** a rotina diária apaga o **arquivo e depois o registro** (se não conseguir apagar o arquivo, o
  registro fica e ela tenta de novo no dia seguinte) e expira pedidos vencidos. Política de Privacidade (HTML e Word)
  atualizada. A Auditoria só guarda IDs (nunca nome, e-mail ou link).

**Ativar — NESTA ORDEM** (docs/VIDEO-RS.md): (1) rodar `sql/42-videos-rs.sql`; (2) implantar a função `video-rs` com **Verify JWT
desligado** e **reimplantar a `rotinas-agendadas`** (ela passa a mexer na tabela nova, então o SQL vem antes); (3) subir o
site; (4) **fazer o teste real** do guia. Sem o passo 1 antes do 2, a rotina diária acusa falha.

**NÃO testado com o Supabase de verdade**: o envio direto ao armazenamento (link de envio assinado) e o limite de tamanho do
armazenamento — só com um armazenamento simulado e com a câmera simulada do Chromium (28 verificações no navegador). **Faça o
teste real do guia antes de usar com candidatos.** O plano gratuito do Supabase tem pouco espaço: cada vídeo ocupa 15 a 40 MB.

**Testes**: 411 no total (os de vídeo: servidor, página, painel do RH e rotina), com 22 regressões plantadas e detectadas.

## v0.115.0 — A prova prática é criada em cada vaga
A prova prática deixa de ser um texto geral da empresa: **cada vaga define a sua**, porque o que se pede a um vendedor não é
o que se pede a um analista financeiro.

**Na vaga** (funil da vaga em R&S → "Orientações e prova prática desta vaga"):
- **enunciado** (até 2000 caracteres: a tarefa, o que entregar e como entregar), **prazo de entrega** (1 a 30 dias, mostrado
  como data no e-mail), até 3 **links** (https) e até 6 **critérios de avaliação** com peso (1 a 10);
- **"Referência desta vaga"**: as responsabilidades do cargo e as habilidades desejadas aparecem ao lado do formulário, para
  criar uma prova coerente com a vaga;
- os **critérios são só do RH e nunca vão no e-mail do candidato** (um teste garante); servirão para avaliar cada entrega
  com o mesmo critério na tela de registro dos resultados (próxima parte).

**O candidato recebe o enunciado DA VAGA em que está** (testado: duas vagas, dois e-mails diferentes). A prova prática
**nunca usa o texto geral da empresa**: o painel da empresa (R&S — Processo seletivo) não tem mais a prova prática e avisa
que ela é criada em cada vaga. Vaga que usa a etapa e não definiu o enunciado aparece como **pendente** (no funil e na tela
do Processo seletivo, com uma coluna nova) e, ao **mover um candidato** para a prova prática, o sistema **pergunta** antes —
o e-mail sairia sem a tarefa.

**As outras etapas também aceitam orientações por vaga**, que valem no lugar das da empresa; sem as da vaga, valem as da empresa.

**Ativar**: só subir o site (sem SQL nem função nova). **Testes**: 26 novos (344 no total), com regressões plantadas e detectadas.

## v0.114.0 — Provas de conhecimento retiradas; entra a tela "R&S — Processo seletivo"
**Retirado por inteiro** o recurso de provas automáticas da v0.112.0: o menu "R&S — Provas", a coluna e o botão
"Aplicar prova" no funil, a página pública do candidato (`prova.html`), a Edge Function `provas-rs`, a tarefa das provas na
rotina diária, as 3 perguntas do FAQ, os trechos da Política de Privacidade e dos Termos (HTML e Word) e a documentação.
As etapas **Teste lógico**, **Prova teórica** e **Prova prática** continuam no processo como etapas de registro (o RH aplica
a prova pelo meio que preferir, inclusive um link externo indicado nas orientações). Os e-mails dessas etapas deixaram de
prometer "link da prova". Um teste impede que restos do recurso (arquivos, função, tabelas, rotas) voltem por engano.

**Nova tela "R&S — Processo seletivo"** (menu Pessoas, no lugar das provas; Administrador e RH):
- as **etapas na ordem da empresa** (3 a 13; nova candidatura, proposta e aprovado sem número), com o **tipo**, se manda
  e-mail ao candidato, se tem orientações configuradas e **quantos candidatos estão em cada etapa agora** (reprovados não contam);
- o painel de **orientações e links por etapa** (onde fazer o teste DISC etc.), que antes ficava num cartão em R&S — o cartão
  em R&S agora só leva a esta tela;
- **etapas por vaga**: quais etapas cada vaga em andamento usa e quantos candidatos ativos tem (as etapas se alteram na
  própria vaga, em R&S → "Etapas do processo desta vaga");
- aviso sobre as etapas 1 e 2 (são da vaga), DISC/GALT (feitos fora do sistema) e redes sociais (só o que se relaciona com a vaga).
Candidatos do funil antigo são migrados antes de contar, então nenhum fica "invisível".

**Para desativar no Supabase — NESTA ORDEM** (a ordem importa):
1. **Reimplante a função `rotinas-agendadas`** com o código novo (ela ainda tem a tarefa das provas e, sem as tabelas, essa
   tarefa falharia e mandaria e-mail de erro à equipe todos os dias).
2. Se você já rodou o `40-provas-rs.sql`: rode o **`41-remover-provas.sql`** — **apaga as tabelas das provas e todos os
   resultados**. Se nunca aplicou prova a ninguém, não há o que perder.
3. Em Edge Functions, **apague a função `provas-rs`**.
4. Suba o site (`git push`). Sem o passo 1 feito antes do 2, a rotina diária vai acusar falha.

**Testes**: 318 no total; 10 regressões plantadas na tela nova e na retirada, todas detectadas.

## v0.113.1 — R&S: orientações e links por etapa (onde fazer o teste DISC/GALT)
Cada empresa cola, por etapa, as **orientações** e até **3 links** (por exemplo, onde fazer o teste DISC e o GALT em um
site externo, o endereço da entrevista, as instruções da prova prática). Isso vai no e-mail que o candidato recebe quando
entra na etapa. Fica em **R&S → Orientações e links das etapas → Configurar** (Administrador e RH).

- **Os links não estão no código**: cada empresa escolhe os seus (um teste impede que um link de terceiro seja escrito no código).
- **Só https://** — são recusados http, `javascript:`, espaços, aspas, endereço sem domínio e o truque `usuario@endereco`.
- Texto e rótulos entram escapados no e-mail; o e-mail avisa que os links levam a **sites externos, com política de
  privacidade própria**. A Política de Privacidade (HTML e Word) também cita as etapas feitas em sites de terceiros.
- Os textos de DISC/GALT, vídeo e prova prática dizem "as orientações estão logo abaixo" quando há orientações (e continuam
  "em breve" quando não há). Valem para e-mails enviados daqui para frente.
- 1 pergunta nova no FAQ.

**Atenção**: o candidato ainda não devolve o resultado pelo sistema — escreva nas orientações para onde ele deve enviar. Não
foi possível abrir os endereços dos testes a partir do ambiente de desenvolvimento: confira o conteúdo e a política de
privacidade de cada site antes de indicar.

**Ativar**: só subir o site (sem SQL nem função nova). **Testes**: 8 novos (380 no total), 7 regressões plantadas e detectadas.

## v0.113.0 — R&S: etapas do processo seletivo da empresa (parte 1 de 3)
O funil de candidatos passa a seguir as etapas definidas pela empresa, e **cada vaga escolhe quais usa**.

**Etapas** (nesta ordem): triagem dos currículos · teste DISC e GALT · vídeo de apresentação · verificação nas redes
sociais · checagem de informações do currículo · entrevista de fit cultural · teste lógico · prova teórica · prova prática ·
entrevista final · escolha do candidato — além de nova candidatura, proposta e aprovado (fixas). As etapas 1 (perfil da
vaga) e 2 (divulgação) já existiam na requisição de vaga e na página pública.

**Por vaga**: ao criar a vaga vêm todas marcadas; dá para mudar depois ("Etapas do processo desta vaga") ou copiar de outra
vaga. O seletor de etapa do candidato mostra só as da vaga (e a etapa em que ele já está). Vagas antigas usam todas.

**Candidatos que já estavam no funil** são movidos sozinhos para a etapa equivalente, com uma linha no histórico (Contato
inicial→Triagem, Avaliação→DISC/GALT, Entrevista→Entrevista de fit, Finalista→Escolha). A migração é idempotente.

**E-mails**: cada etapa visível ao candidato tem e-mail próprio; as etapas **internas** (redes sociais e checagem do
currículo) **nunca mandam e-mail** (um teste garante). As etapas de prova avisam que o link chega em e-mail separado.

**Transparência (LGPD)**: a página de candidatura e a Política de Privacidade (HTML e Word) avisam que o currículo e perfis
profissionais públicos podem ser verificados, e que os registros das etapas ficam só com Administrador e RH. Peça ao
advogado que revise, principalmente as etapas de redes sociais e checagem.

**NÃO inclui ainda** (próximas partes): (1) registro do resultado de cada etapa — hoje o funil move o candidato, mas o
resultado do DISC/GALT, das redes sociais, da checagem e da prova prática ainda não tem onde ser registrado; (2) vídeo de
apresentação enviado pelo candidato (6 meses de guarda; atenção aos limites do plano gratuito do Supabase); (3) aplicar a
prova automaticamente ao entrar nas etapas de prova. Detalhes em docs/PROCESSO-SELETIVO.md.

**Ativar**: só subir o site (nenhum SQL nem função nova). **Testes**: 19 novos (372 no total), com 6 regressões plantadas
e detectadas.

## v0.112.0 — R&S: provas de conhecimento no processo seletivo
Novo recurso: o Administrador e o RH montam **provas de múltipla escolha com nota automática**, aplicam a candidatos do
funil e acompanham o resultado. O candidato faz a prova por um link, **sem login**, em **uma única tentativa**.

**Para o RH** (menu Pessoas → *R&S — Provas*): editor de provas (2 a 6 alternativas por questão, uma correta, peso de 1 a
10, 1 a 60 questões, 5 a 240 minutos, nota mínima), **3 modelos prontos** (Português, Matemática e Excel básicos, 10 questões
cada, com o gabarito conferido por teste), duplicar/arquivar/excluir, e aba **Resultados** com filtros e detalhe questão a
questão. No funil do R&S ganhou a coluna **Prova** e o botão **Aplicar prova** (envio do link por e-mail ou cópia do link).

**Para o candidato** (`prova.html`): tela de instruções, relógio, respostas salvas automaticamente, recarregar sem perder
nada (o relógio continua), confirmação antes de enviar, envio automático quando o tempo acaba. Funciona no celular. **Não
mostra nota nem gabarito.**

**Garantias (cada uma tem teste)**
- O **gabarito nunca vai ao navegador do candidato**; a correção e o cronômetro são do servidor.
- O código do link tem 256 bits e **só o hash fica no banco**. A página não usa Sentry/analytics e não envia o endereço adiante.
- **Uma tentativa**: não reinicia o relógio, não corrige duas vezes (inclusive com requisições simultâneas), não aceita
  respostas depois do tempo (há 60 s de folga de rede, marcada como "fora do prazo").
- Cada aplicação guarda uma **cópia da prova**; editar a prova depois não muda a correção. Ordem das questões e alternativas
  sorteada por candidato, com ids opacos.
- Só Administrador/RH; toda consulta é filtrada pela empresa; abrir um resultado fica na **Auditoria**.
- As tabelas têm RLS ligado **sem nenhuma política** (só a Edge Function acessa).
- **A nota é apoio à decisão**: a tela nunca diz "reprovado" (mostra "atingiu / abaixo da nota mínima"). Aviso explícito de que
  são provas de **conhecimento** — testes psicológicos são privativos de psicólogos.

**Retenção e LGPD**: resultados ficam **24 meses**; a rotina diária expira links vencidos e apaga resultados antigos; o RH
pode excluir antes. Política de Privacidade (novo item 2.7 e retenção) e Termos de Uso atualizados (HTML e Word). Um teste
confere que os 24 meses são o mesmo número na função, na rotina, na Política e na documentação.

**Para ativar** (docs/PROVAS-RS.md): rodar `sql/40-provas-rs.sql`; implantar a Edge Function `provas-rs` (**Verify JWT
desligado**; o deploy automático já faz isso) e reimplantar `rotinas-agendadas`; subir o site. Opcional: secret `URL_SITE`.

**Também**: 3 perguntas novas no FAQ; helper de testes `banco-falso` (banco simulado compartilhado, agora devolvendo cópias
como um banco de verdade); `provas-rs` entra na lista de funções públicas do `config.toml`.

**Testes**: 353 no total (89 novos). Validados plantando erros de propósito: 7 no servidor (vazar o gabarito, reiniciar o
relógio, corrigir duas vezes, aceitar resposta tardia, gravar o código em texto, permitir duplicar, abrir a porta do RH a
qualquer perfil) e 7 no navegador (gabarito de modelo errado, validador diferente do servidor, limite diferente, HTML sem
escape, "reprovado" na tela, líder vendo provas, rastreador na página do candidato) — todos detectados. Achados no caminho,
já corrigidos: uma consulta sem filtro de empresa no reenvio do link; testes de corrida que na verdade rodavam em
sequência; IDs em `onclick` escapados de forma que não protegia.

**Verificado em navegador de verdade** (Chromium, página real contra o código real da função com banco simulado): 27
verificações — fluxo completo, recarregar no meio, envio automático no fim do tempo, links vencido/cancelado/inválido,
celular a 390 px, enunciado com HTML malicioso, e que nenhuma resposta do servidor ao navegador contém o gabarito nem a nota.

**NÃO testado**: a execução real no Supabase (tabelas, RLS, envio do e-mail do link). Faça o roteiro do PROVAS-RS.md com uma
prova curta e um candidato seu antes de usar com candidatos de verdade.

## v0.111.0 — Central de Ajuda só com FAQ e chamados (assistente de IA desligado)
O assistente de IA exige uma chave de API paga (cobrança por uso). Decisão: a Central de Ajuda fica só com o que
não custa nada e não envia texto de cliente a terceiros.

**O que fica**: perguntas frequentes (FAQ), sugestões automáticas enquanto a pessoa escreve o chamado, abertura de
chamados com resposta da equipe (e-mail de confirmação, aviso à equipe, lembrete automático de chamado parado há
24h) e o canal de LGPD (a Política de Privacidade promete esse canal, por isso os chamados NÃO foram removidos).

**O que fica desligado (e escondido)**: o chat com o assistente, a resposta automática por IA aos chamados e a pergunta
do FAQ que explica o status "Respondido (IA)". Abrir um chamado agora vai direto para a equipe, e o e-mail de
confirmação aponta para o FAQ (e não promete assistente).

**Duas travas, as duas desligadas por padrão**:
- no site: `ASSISTENTE_IA_VISIVEL = false` em `js/41-page-central-ajuda.js`;
- no servidor: o secret `ASSISTENTE_AJUDA_ATIVO` (só o valor `true` liga) nas funções `assistente-ajuda` e
  `chamado-automatico`. **Por quê**: a chave `ANTHROPIC_API_KEY` também é usada pela leitura de folha de ponto por foto;
  sem esta trava, criar a chave para esse recurso ligaria o chat (e a cobrança) sem decisão sua.

**Documentos legais ajustados** (HTML e Word): a Política de Privacidade e os Termos não citam mais o assistente nem a
leitura de chamados por IA; a Anthropic continua citada apenas para a leitura de folha de ponto por foto. Um teste impede
que site e documentos fiquem em desacordo (se um dia o assistente for religado, o teste cobra a atualização).

**Para religar um dia**: docs/ASSISTENTE-IA.md (chave, 2 secrets, reimplantar, trocar o interruptor, restaurar os textos
legais). O código do assistente permanece no projeto.

**Para ativar esta versão**: subir o site (git push); reimplantar `assistente-ajuda` e `chamado-automatico` (a trava de
servidor); baixar os dois Word atualizados. Sem SQL novo.

**Testes**: 276 no total (12 novos). Cobrem os dois modos (desligado e ligado) com um app simulado — inclusive que abrir
um chamado NÃO aciona a IA quando desligado e aciona quando ligado —, as travas do servidor, a coerência com os
documentos legais e que a leitura de folha de ponto continua independente. Cinco regressões plantadas foram todas detectadas.

## v0.110.0 — Rotina diária: aviso de fim do teste grátis e encerramento automático das campanhas do NR1
Dois itens da lista "deveria rodar sozinho" que ainda dependiam de alguém abrir uma tela. (Os outros dois
da mesma lista — prazo do banco de talentos e rotina dos chamados — já estavam na v0.109.0; ambos só passam a
rodar quando o agendamento for feito, passo 4 de docs/ROTINAS-AGENDADAS.md.)

**Aviso de fim do teste grátis.** Antes só havia um banner dentro do sistema: nenhum e-mail "seu teste acaba
em 2 dias" e nenhum contato depois que ele acabava — a venda mais fácil de perder. Agora o **Administrador**
da empresa recebe e-mail **2 dias antes** do fim, **no último dia**, **1 dia depois** e **7 dias depois**
(textos diferentes, com links para os planos e o WhatsApp comercial). Só para quem ainda é teste: não recebem
clientes pagantes, empresas suspensas, nem o RH. Cada e-mail sai uma única vez, e e-mail que falha é tentado
de novo na rodada seguinte. A **equipe recebe um resumo por dia** com as empresas perto do fim (ou recém-
terminadas) e o contato do Administrador de cada uma, para decidir quem procurar. O dia do fim é contado no
calendário de Brasília (um teste que acaba às 23h30 ainda é "último dia").

**Encerramento automático das campanhas do NR1.** Antes só encerrava quando alguém chamava a função, e só para
a empresa de quem chamava. Agora a rotina encerra, para todas as empresas, as campanhas ativas cuja data final
já passou (a data final é inclusiva: encerra na manhã seguinte, horário de Brasília), de forma atômica (nunca
fecha duas vezes) e **avisa o Administrador e o RH**. Empresa suspensa tem a campanha encerrada, mas não recebe
e-mail. A função `nr1` continua encerrando também ao ser chamada (rede de segurança); um teste garante que as
duas usam a mesma regra.

**Estrutura**: cada tarefa da rotina virou uma função que recebe o banco e o envio de e-mail, o que permitiu
testar o COMPORTAMENTO (não só regras soltas) com um banco simulado: quem recebe, quem não recebe, nada duplicado,
fronteiras de data. Isso também cobriu retroativamente os lembretes de avaliação da v0.109.0.

**Decisão sua**: os e-mails dizem que "seus dados continuam guardados" depois do teste. Hoje é verdade (nada é
apagado sozinho), mas é uma promessa. Se um dia você quiser excluir automaticamente testes não convertidos após
N dias, é preciso ajustar esses textos junto.

**Para ativar**: reimplantar `rotinas-agendadas` e `assistente-ajuda` (e `ponto`/`chamado-automatico` se ainda não
fez a v0.109.0) e agendar a rotina (docs/ROTINAS-AGENDADAS.md). Novo secret opcional `URL_SITE`.

**Testes**: 264 no total (29 novos), com seis regressões plantadas para provar que os testes as pegam (e-mail
duplicado, campanha já encerrada reaberta no filtro, data em UTC, pessoa desativada, e-mail pro RH em vez do
Administrador, retenção curta). **Não testado**: a execução real no Supabase.

## v0.109.0 — Rotinas agendadas: lembretes por e-mail, escalonamento do Ponto e prazo do banco de talentos
Três coisas que o sistema "prometia" só aconteciam quando alguém abria uma tela — justamente quando
mais precisavam rodar sozinhas. Agora rodam todo dia às 8h (Brasília), no servidor:

**1) Lembretes de prazo das avaliações, por e-mail.** Antes, "lembretes em D-5, D-2 e D-0" era só um
aviso dentro da tela do avaliador: quem não entrava no sistema nunca era lembrado. Agora quem está
**com a avaliação pendente** (o colaborador na autoavaliação, o líder direto ou o RH — a mesma regra
do aviso "avaliação pendente") recebe e-mail 5 dias antes, 2 dias antes e no dia do prazo. Cada lembrete
sai uma única vez; só avaliação assíncrona em andamento; respeita o botão de desligar lembretes nas
Configurações; empresa suspensa ou com teste vencido não recebe. A contagem de dias é a mesma da tela
(um teste compara as duas).

**2) Escalonamento das justificativas do Ponto.** A regra "3 dias parada sobe pro substituto do gestor e
pro RH" já existia, mas só executava quando alguém abria a tela de conferência — se o aprovador estava
sumido, nada subia. A lógica foi extraída para uma função única, usada pela tela e pela rotina diária
(nova ação interna `rotina_escalonamento` na função `ponto`, só com a chave de serviço).

**3) Prazo do banco de talentos (24 meses).** A remoção dos vencidos só acontecia quando o RH abria a tela.
Agora a rotina remove todo dia, mesmo que ninguém abra — o prazo é uma promessa feita ao candidato.

**Segurança e cuidado**: a rotina **nunca escreve** nos dados da empresa (só lê — escrever ali do servidor
poderia sobrescrever o que alguém estivesse editando); cada tarefa é isolada (uma falha não derruba as
outras) e a falha manda e-mail à equipe; só aceita o segredo do agendador ou a chave de serviço.

**Visibilidade**: novo cartão **Super Admin → Rotinas automáticas** mostra a última execução de cada rotina
(rodando / atrasada / nunca rodou). É o que impede o pior cenário: a rotina nunca ter sido agendada e
ninguém perceber.

**Correções de passagem**
- A base do assistente dizia "lembretes automáticos" sem explicar; agora descreve exatamente como funciona.
- A limpeza do `rate_limit_log` (sql/35 e rotina) apagava com 7 dias, mas vários limites contam 30 dias
  (leituras de folha de ponto, perguntas ao assistente) — se o agendador de limpeza estivesse ativo, esses
  contadores zerariam toda semana. Agora a retenção é de 35 dias.

**Para ativar** (docs/ROTINAS-AGENDADAS.md):
1. Ativar as extensões `pg_cron` e `pg_net` no Supabase.
2. Implantar `rotinas-agendadas` (já está no config.toml e no deploy automático; **Verify JWT desligado**) e
   reimplantar `ponto`, `chamado-automatico`, `assistente-ajuda`. Secret `CRON_SECRET` (o mesmo nas duas rotinas).
3. Rodar os dois comandos `cron.schedule` do documento (diária e de chamados) e o teste imediato do passo 5.
4. Conferir o cartão no painel Super Admin.
**Sem o agendamento (passo 3) nada disto roda sozinho.**

**Testes**: 235 no total (25 novos), validados plantando cinco regressões (rotina escrevendo nos dados da
empresa, lembrete no dia errado, nome sem escape, aviso ao RH de outra empresa, ação interna sem
autenticação). Inclui teste de comportamento do escalonamento com banco e e-mail simulados e a conferência
de que o servidor e a tela contam os dias até o prazo do mesmo jeito.

**Não testado**: a execução real no Supabase (pg_cron + pg_net + envio de e-mail) — por isso o teste imediato
do passo 5 e o cartão de status.

## v0.108.0 — CI e implantação automática das Edge Functions
Antes, nada conferia sozinho se uma mudança quebrou algo (os testes só valiam se alguém
lembrasse de rodar) e cada Edge Function precisava ser colada à mão no painel do Supabase —
sem como saber qual versão estava de fato no ar.

**CI (`.github/workflows/ci.yml`)** — a cada push e pull request o GitHub roda: lint,
formatação, sintaxe dos JS, **tipos das Edge Functions** (TypeScript, agora uma etapa de
verdade e não um filtro improvisado), **sintaxe dos 43 SQL** (parser do PostgreSQL),
**tabelas e colunas usadas no código x banco** e os testes. Vira ✅/❌ ao lado do commit.

**Implantação (`.github/workflows/implantar-funcoes.yml`)** — implanta no Supabase só as
funções que mudaram, e só depois do CI passar:
- manual (Actions > Run workflow): por padrão é uma **simulação** (mostra o que seria feito);
- automática a cada push: **desligada** até você criar a variável `DEPLOY_AUTOMATICO = true`;
- o "Verify JWT" de cada função fica gravado em `supabase/config.toml` (as 4 públicas —
  teste-gratis, login-bloqueio, rs, chamado-automatico — ficam desligadas), então uma
  implantação nunca mais religa isso sem querer;
- entradas do usuário passam por variável de ambiente e só nomes de funções que existem são
  aceitos (sem injeção de comando); token só via secret; permissões mínimas.

**Também novo**: `.gitignore` (antes não existia — `node_modules` podia estar indo pro
repositório), `npm run verificar` (tudo local num comando), scripts multiplataforma (o
`check:sintaxe` antigo usava um laço de shell que não rodava no Windows), TypeScript declarado
no `package.json`, `engines` (Node 22.13+), e `docs/CI-E-IMPLANTACAO.md` com o passo a passo,
a tabela de secrets de cada função, rollback e solução de problemas.

**Testes**: 210 no total (23 novos): seleção do que implantar (inclusive com um repositório git
de verdade), toda função tem configuração explícita, só as 4 públicas sem JWT e cada uma se
protege sozinha, workflows sem segredo escrito nem injeção, `package-lock` em dia, e **um
scanner que impede chave secreta (Anthropic, Resend, Supabase, GitHub, AWS, service_role)
de entrar no código**. Cada um foi validado plantando uma falha de propósito.

**Como foi validado**: simulação do CI do zero (cópia sem `node_modules`, `npm ci`, todas as
etapas em ordem), `actionlint` nos workflows e YAML válido. **NÃO foi possível testar a
implantação real no Supabase** a partir daqui — por isso a ordem recomendada: simulação, uma
função de teste, só então o automático.

**Para ativar**: ver `docs/CI-E-IMPLANTACAO.md` (8 passos; os 4 primeiros bastam pra ter o CI).
**Atenção**: a pasta `.github/` é oculta em alguns sistemas — confira que subiu com `git add .`.

## v0.107.0 — Central de Ajuda 100% automática (com a equipe só quando precisa)
O que era manual na Central de Ajuda passou a ser automático:

- **A IA tenta responder cada chamado novo na hora** (dúvida de uso, usando a
  mesma base do chat) e o cliente recebe a resposta por e-mail.
- **Assuntos que NUNCA vão pra IA**, mesmo que ela quisesse: cobrança/boleto/
  nota fiscal/reembolso, cancelamento de plano/contrato, LGPD e exclusão de
  dados (inclusive o botão "Solicitar meus dados"), jurídico e incidente de
  segurança. Esses vão direto pra uma pessoa. Se a IA disser que não sabe, ou
  estiver fora do ar, o chamado também segue pra equipe, sem prejuízo ao cliente.
- **O cliente decide com um clique**: novo status "Respondido (IA)" com os botões
  "Resolveu" (fecha) e "Ainda preciso de ajuda" (a equipe assume e é avisada por
  e-mail na hora, com o chamado e a resposta que a IA deu).
- **Encerramento automático**: respondido pela IA sem retorno em 3 dias → encerrado,
  com e-mail ao cliente.
- **Lembrete automático pra equipe**: chamado parado esperando uma pessoa há mais de
  24h gera e-mail (e repete a cada 24h), mais um **resumo diário às 8h de Brasília**
  do que a IA respondeu, pra conferir.
- **Toda mudança de status avisa o cliente por e-mail** (antes só saía quando havia
  texto de resposta). Quando uma pessoa responde, a resposta deixa de contar como "IA".
- Painel Super Admin: selo "IA" e "pediu humano" nos chamados, contagem separada
  (esperando a equipe × respondidos pela IA).

**Segurança e privacidade**: reserva atômica (nunca duas respostas automáticas ao
mesmo chamado); só o autor (ou Admin/RH) da MESMA empresa mexe no chamado; o cliente
continua sem permissão de alterar chamados direto no banco; a rotina exige um segredo
do agendador. Política de Privacidade e Termos atualizados (o texto do chamado pode ser
lido pela IA; respostas automáticas são informativas) — Word regerado.

**Para ativar** (4 passos, uma vez só):
1. Rodar `sql/38-ajuda-automatica.sql`.
2. Criar a Edge Function `chamado-automatico` (**"Verify JWT" desligado**) e o secret
   `CRON_SECRET` (texto longo aleatório). Precisa de `assistente-ajuda` e `enviar-email`
   já implantadas.
3. Agendar a rotina: ativar as extensões `pg_cron` e `pg_net` e rodar o comando que está
   comentado no fim do sql/38 (de hora em hora). **Sem este passo, o encerramento
   automático e os lembretes não rodam** — o resto funciona sem ele.
4. Subir o zip; reimplantar `assistente-ajuda` (base atualizada).

**Testes**: 187 no total (15 novos). Escrevendo-os, o filtro de assuntos sensíveis falhou
com "quero cancelar o meu plano" (só aceitava um artigo antes de "plano") — corrigido.

## v0.106.0 — R&S: Banco de talentos (tela para o RH)
Os candidatos que marcavam "aceito ficar disponível no banco de talentos"
tinham os dados guardados, mas o RH não tinha onde ver — e a Política de
Privacidade prometia esse uso. Agora existe a página **R&S — Banco de
talentos** (menu Pessoas, só Administrador e RH; atalho no topo do R&S).

- **O que o RH vê**: nome, e-mail, telefone, cidade, formação, disponibilidade,
  vaga de onde veio, data de entrada e quando sai do banco; "Ver perfil" abre o
  perfil completo (equipamentos, Excel/Word/PowerPoint, LinkedIn, experiência).
  Busca por nome/cidade/experiência/vaga, filtros (formação, disponibilidade,
  moto, notebook) e botão **Currículo** (link temporário de 10 minutos).
- **A mesma pessoa aparece uma vez**, mesmo tendo se candidatado a várias vagas
  (com os dados mais recentes e o número de candidaturas).
- **Prazo (LGPD): 24 meses** a partir da autorização mais recente; depois a
  pessoa sai sozinha. É uma constante só (`BANCO_TALENTOS_MESES`, no servidor) e
  um teste garante que o MESMO número está no servidor, no texto do formulário
  ("por até 24 meses"), na Política de Privacidade (seção 7), no FAQ e na base do
  assistente. Para mudar o prazo, mude nos cinco lugares — o teste avisa se
  esquecer algum.
- **Remover a qualquer momento** (inclusive a pedido do candidato). A abertura de
  currículo e a remoção ficam na **Auditoria** (sem dado pessoal no registro).
- **Segurança**: o navegador nunca recebe o caminho do arquivo (pede o currículo
  pelo id do talento, validado como UUID); tudo filtrado pela empresa e só
  Administrador/RH; texto de candidato escapado na tela (teste de regressão).
- Política de Privacidade (HTML e Word) e texto do formulário atualizados com o prazo.

**Para ativar**: reimplantar a Edge Function `rs` e subir o zip. Sem SQL novo.
Os candidatos que já estavam no banco passam a contar o prazo da data em que
autorizaram; quem já passou de 24 meses sai na primeira abertura da tela.
**Atenção**: o prazo de 24 meses é um padrão escolhido por nós — confirme com o
advogado que revisar a Política de Privacidade.

**Testes**: 172 no total (10 novos).

## v0.105.0 — Revisão completa: segurança, fuso horário e correções
Releitura de todo o código e da lógica. Primeiro, varreduras automáticas
(todas validadas com erros plantados de propósito): nenhuma tabela/coluna
usada no código que não exista no SQL; toda ação pedida a uma Edge
Function existe nela; os 42 SQL têm sintaxe válida no parser do
PostgreSQL; sem declarações duplicadas. Depois, os bugs abaixo.

**Segurança**
- **`enviar-email` era um canal aberto** (qualquer destinatário e qualquer
  remetente @inetris.com.br, sem login e sem limite — pior agora que o teste
  grátis é automático). Agora exige usuário logado (ou outra função nossa),
  remetente fixo, um único e-mail válido, tamanhos máximos e limites:
  150/hora por usuário; 500/dia por empresa paga, 30/dia em teste grátis.
- **XSS armazenado** corrigido (motivo de alteração do cargo, justificativa
  de reprovação, nome na auditoria, competências críticas, logotipo).
- **HTML injetado em e-mails**: nome do candidato (formulário público) ia cru
  em 9 modelos de e-mail do R&S, na confirmação de candidatura, no teste grátis
  e no escalonamento do Ponto. Tudo escapado.
- **Candidatura**: e-mail validado, tamanhos limitados, perfil só aceita os
  campos do formulário (antes: qualquer JSON), currículo exigido no servidor.
- **`login-bloqueio`**: qualquer pessoa podia travar a conta de outra (bastava
  chamar registrar_falha 5x). Agora o bloqueio é por e-mail + IP e há teto de
  falhas por IP.
- **Senha provisória e código de convite** saíam de `Math.random()`; agora
  sorteio criptográfico sem viés (senha com 12 caracteres).
- **Selfie e foto de atestado**: aceitavam qualquer conteúdo e tamanho. Pior:
  a regra "selfie obrigatória" só olhava se veio algum texto — mandando lixo,
  a batida era registrada sem selfie. Agora a imagem é conferida pelos bytes e
  tamanho, e empresa que exige selfie não registra sem uma imagem válida e
  guardada. A foto do atestado é reduzida no navegador antes de enviar.
- Aprovação manual de teste (Super Admin): o e-mail nunca saía (campos com
  nome errado); corrigido.

**Fuso horário** (o sistema é do Brasil, UTC−3; servidor e toISOString() são UTC)
- **Banco de horas errado no servidor**: a hora da batida era lida em UTC e
  comparada com a jornada em horário de Brasília. Chegar 30 min cedo dava +30
  min de crédito falso por dia (~11 h/mês) e a tolerância se perdia. Corrigido
  e coberto por testes. **Os saldos exibidos vão mudar para o valor correto.**
- "Hoje" calculado em UTC em 50+ lugares (das 21h à meia-noite já era o dia
  seguinte): ciclo aberto com data errada, batida da noite no dia seguinte,
  desconto de almoço no dia errado, abono conferido com a data errada,
  relatórios semanais. Novos helpers `hojeLocalISO`, `dataLocalISO`,
  `diaLocalDoRegistro`, `dataDeExibicao`; um teste impede o padrão antigo de voltar.
- NR1: a campanha encerrava 3 horas antes do fim do último dia.
- Dados de demonstração do Ponto eram gerados às 05:00 locais; mês anterior
  do painel errava na virada do mês.

**Outros**
- Câmera e leitor de QR ficavam ligados em segundo plano ao trocar de tela
  pelo menu; agora liberados na troca de tela e no logout (com teste que cobre
  qualquer câmera nova).
- ESLint: removidas 5 "globais" que não existiam.

**Para ativar**: reimplantar as Edge Functions `enviar-email`, `rs`,
`teste-gratis`, `login-bloqueio`, `ponto`, `nr1` e `acesso-sem-email`; subir o zip.
Sem SQL novo. Funções públicas (`teste-gratis`, `login-bloqueio`, `rs`):
se o projeto usa as chaves `sb_publishable_...`, deixar "Verify JWT" DESLIGADO.
O e-mail de boas-vindas do cadastro agora exige sessão ativa.

**Testes**: de 116 para 162 (fuso, segurança das funções, câmeras, imagens).

**Achados NÃO resolvidos (precisam de decisão)**: banco de talentos sem tela
para o RH; aceite dos Termos só é exigido por quem se cadastra pela tela
(contas "sem e-mail" e usuários antigos nunca aceitam); 9 funções sem nenhum
chamador (sobras, não quebram nada): abrirCameraAtestado,
cancelarCameraAtestado, capturarFotoAtestado, atualizarStatusPDI,
pdiMentalidadeNaoIniciado, renderCiclosTable, mostrarAvisoAtualizacao,
_rotuloIndicador, _rsEtapaNome.

## v0.104.0 — Central de Ajuda: resposta automática + assistente de IA
A Central de Ajuda agora responde sozinha em três camadas, da mais barata
pra mais cara:

**1. Sem IA (custo zero)**
- **E-mail de confirmação na hora**: ao abrir um chamado, a pessoa recebe
  "Recebemos seu chamado #PROTOCOLO" (o protocolo também aparece na tela e
  no aviso pra equipe).
- **Sugestões enquanto digita**: ao escrever o assunto/mensagem do chamado,
  aparecem as respostas do FAQ que combinam ("Talvez isto já resolva:"),
  mostrando só as que chegam perto da melhor — sem ruído de uma palavra solta.
- O FAQ foi ampliado (de 3 para 18 perguntas) e virou dados, usados também
  nas sugestões.

**2. Assistente de IA** (nova Edge Function `assistente-ajuda`)
- Responde "como faço X no sistema?" **só com base numa base de
  conhecimento** escrita a partir do que o sistema realmente tem. Se a base
  não cobre, ou o assunto exige a equipe (erro, cobrança, liberação de
  acesso, exclusão de dados), diz que não sabe e oferece **"Abrir chamado com
  esta conversa"** (já preenchido, a equipe não precisa perguntar tudo de novo).
- **Não vê nenhum dado da empresa**, não executa nada no sistema e não
  guarda a conversa (só conta perguntas pra aplicar limite). CPF, CNPJ e
  números longos são removidos antes de ir pra IA. Não dá aconselhamento
  jurídico/trabalhista/médico/de SST. Ignora pedidos pra mudar suas regras.
- Limites: 30 perguntas por pessoa por hora e 400 por empresa a cada 30 dias.
  Modelo pequeno e barato por padrão (`ANTHROPIC_MODEL_AJUDA` pra trocar).
- Aviso claro na tela de que é IA e pode errar.

**Anti-defasagem**: a base do assistente e o FAQ são conferidos por testes
contra o código real — limites de plano, regra de bloqueio de login, pesos
e lembretes do ciclo, e se cada nome de menu citado ainda existe. Se uma
tela for renomeada, o teste falha em vez do assistente ensinar o caminho
errado em silêncio.

**Erro corrigido de passagem**: o FAQ antigo dizia que o acesso sem e-mail
ficava em "Usuários & Acesso" — na verdade é em **Colaboradores** ("Criar
acesso sem e-mail"). Corrigido (e agora há teste que garante isso).

**Documentos legais**: Política de Privacidade (nova seção 2.6, Anthropic
também pro assistente) e Termos (respostas do assistente são informativas e
podem errar) atualizados; Word regerado. Revisão por advogado continua pendente.

**Para ativar**
1. Criar a Edge Function `assistente-ajuda` (código em
   `supabase/functions/assistente-ajuda/index.ts`). Usa o MESMO secret
   `ANTHROPIC_API_KEY` da leitura de folha de ponto.
2. Subir o zip. Sem SQL novo (o limite usa a tabela do sql/35, que já
   precisa estar aplicada).

**Testes**: 116 no total (26 novos).

**Manutenção**: quando uma tela ou regra do sistema mudar, atualizar a
`BASE_CONHECIMENTO` dentro da Edge Function — é o que o assistente sabe.

## v0.103.0 — Folha de ponto em papel: lista de presença do dia
Feedback de uso real: muitas empresas não têm folha mensal por pessoa —
têm uma **lista do dia**, onde cada funcionário escreve o nome e a hora,
sem colunas, e o mesmo nome aparece de novo na saída. A primeira versão só
entendia a folha mensal organizada; este fluxo cobre o outro formato.

**Como funciona**
- Botão **Importar lista do dia** na tela Folha de Ponto (papel). A IA lê
  a **data do topo** e agrupa os horários por nome.
- Entrada/saída não dependem da posição na folha: os horários de cada
  pessoa são colocados **na ordem do relógio** (1º = entrada, 2º = saída,
  3º = volta do almoço...), então linhas fora de ordem não atrapalham.
- O sistema **sugere quem é cada nome** (ignora acento e "de/da", aceita
  nome parcial, inicial "S." e uma letra trocada em nome longo) e mostra a
  sugestão pra conferência. Regras que protegem de erro silencioso:
  só "Maria" com duas Marias fica **sem sugestão**; "Mario" não vira
  "Maria"; abreviação ou letra aproximada nunca conta como "exato";
  nome que ninguém tem fica como "não identificado".
- Tabela de conferência: escolher o colaborador de cada nome (ou ignorar),
  corrigir horários, ver o total do dia (com ⚠ quando falta um par).
  Linhas duvidosas ficam destacadas até serem conferidas.
- **Aplicar às folhas**: cada pessoa recebe esse **dia** na folha do mês
  dela — como **rascunho** (nada é confirmado automaticamente). Quem já
  tinha horários naquele dia escolhe **Somar** (junta sem repetir — importar
  a mesma foto duas vezes não duplica nada) ou **Substituir**. Folha já
  confirmada fica bloqueada (é preciso reabrir). Nomes escritos de dois
  jeitos que apontam pro mesmo colaborador são somados.
- A foto da lista fica ligada à folha de cada pessoa ("Ver foto (dia 10)").
  Como é uma foto só para várias folhas, apagar um rascunho **não** apaga a
  foto enquanto outra folha ainda a usa (checagem feita no servidor).
- Os totais, o PDF e o Excel do mês já existentes funcionam sem mudança.

**Para ativar**: só reimplantar a Edge Function `folha-ponto` e subir o
zip. Sem SQL novo, sem secret novo.

**Testes**: 90 no total (31 novos): sanitização da lista (ordem dos
horários, nomes repetidos, data inválida, entrada hostil), data do
Brasil, casamento de nomes (incluindo os casos ambíguos), e mesclar/
aplicar dia. Escrevendo os testes, um deles apontou uma falha real da
primeira regra de sugestão ("Maria S." era tratado como exato para
Maria Silva por causa da inicial) — corrigida antes da entrega.

**Limites conhecidos**: turno que atravessa a meia-noite não é pareado
entre folhas de dias diferentes (a saída da madrugada cai na lista do dia
seguinte e aparece como horário sem par); se alguém esquece de assinar
uma vez, os pares podem ficar trocados — o ⚠ de "horário sem par" e a
conferência do RH existem pra isso.

## v0.102.0 — Folha de ponto em papel (foto lida por IA, conferida pelo RH)
Pra empresas que ainda registram o ponto à mão: o RH fotografa a folha, o
sistema lê os horários, o RH confere e confirma, e saem os totais e
relatórios do mês.

**Como funciona**
- Nova tela **Folha de Ponto (papel)** (Administrador e RH; liga junto
  com o módulo Ponto). Escolhe a competência e o colaborador, envia a
  foto (a foto é reduzida no navegador antes de subir).
- Edge Function nova **`folha-ponto`**: confere que o arquivo é imagem de
  verdade pela assinatura dos bytes (mesma lição do currículo), guarda no
  bucket **privado** `folhas-ponto-papel` e pede ao Claude (visão) a
  transcrição. A resposta da IA é tratada como dado não confiável: horários
  inválidos, dias fora do mês, tipos inventados e textos longos são
  descartados/limitados antes de chegar ao navegador.
- A IA **só sugere**. Tudo aparece numa tabela editável dia a dia; dias com
  leitura duvidosa ficam destacados (amarelo/vermelho) até alguém conferir.
  Nada vira registro até o RH clicar em **Confirmar**.
- Avisos automáticos: nome lido na folha diferente do colaborador escolhido,
  mês diferente da competência, marcação sem par, período maior que 16h,
  dias úteis sem marcação.
- Folha **confirmada fica travada** (inclusive contra edição direta pela
  API — trigger no banco). Pra alterar: Reabrir, com motivo obrigatório,
  tudo registrado na auditoria (lida / confirmada / reaberta / excluída).
- Totais por colaborador: dias, horas trabalhadas, atrasos, horas extras,
  saldo, faltas e pendências — mesma regra de atraso/extra (com
  tolerância) do ponto eletrônico, pra os dois ficarem comparáveis. Turno
  que atravessa a meia-noite é tratado à parte.
- Relatórios: **PDF da folha** (com linhas de assinatura) e **Excel do mês**
  com todos os colaboradores (horas em h:mm e em decimal, pra folha de
  pagamento).
- Foto muito pequena/letra miúda? Dá pra enviar meia folha por vez
  (dias 1–16 e 17–31): as leituras se somam.

**Custo e limites** — cada leitura é uma chamada paga à API da Anthropic
(na SUA conta). Teto de 150 leituras por empresa a cada 30 dias
(`LIMITE_LEITURAS` na função), pra um cliente não gerar uso sem limite.

**Documentos legais atualizados**: Anthropic entra como prestador de
serviço na Política de Privacidade (a foto é enviada a ela só quando o
recurso é usado); os Termos passam a dizer que o Cliente confere a
transcrição e guarda o papel original; a página de vendas cita o recurso.
Continua pendente a revisão por advogado.

**Testes**: 40 novos (59 no total) — cálculos de horas/atraso/extra/falta,
turno noturno, tolerância, checagens de nome e mês, e a validação de
imagem e a sanitização da resposta da IA (que rodam sobre o código real
da Edge Function).

**Para ativar**
1. Rodar `sql/37-folha-ponto-papel.sql` (tabela, travas e bucket privado).
2. Implantar a Edge Function `folha-ponto` e configurar o secret
   `ANTHROPIC_API_KEY` (opcional: `ANTHROPIC_MODEL`, padrão
   `claude-sonnet-5-5`).
3. Testar com UMA foto real antes de liberar pros clientes.

**Limites desta primeira versão**: a folha em papel fica numa tabela
própria e **não alimenta** o banco de horas/fechamento de competência do
ponto eletrônico (os relatórios dela são os da própria tela); líder e
colaborador não enxergam essas folhas.

## v0.101.2 — Correção real: "Começar teste grátis" ia pro WhatsApp
Achado arquitetural: ao longo da sessão, construímos um fluxo de teste
grátis 100% automático (Edge Function "teste-gratis", reCAPTCHA, geração
de código na hora) — mas ele vivia em `js/35-tela-entrada.js`, usado
dentro do `app.html`. Quando a landing nova (`index.html`/`planos.html`,
estática e independente) virou a porta de entrada do site, e a landing
interna do `app.html` foi desativada (foi pra direto o login), esse
fluxo automático ficou "órfão" — nenhuma página viva apontava mais pra
ele. Enquanto isso, **todos** os botões da landing nova (incluindo os de
teste grátis) estavam ligados ao mesmo link de WhatsApp, sem distinção.

Corrigido: a landing nova agora tem o formulário de teste grátis de
verdade (nome, e-mail, empresa, telefone, reCAPTCHA), chamando a mesma
Edge Function "teste-gratis" que já existe — direto nela, sem depender
de mais nenhum arquivo. Só os 4 botões de "teste grátis"/"conhecer o
INETRIS" foram redirecionados pro formulário; os de "Quero contratar
agora" e "Fale com a gente" continuam indo pro WhatsApp, como já estava.
Testado: os 4 apontam pro formulário, os outros 4 continuam pro
WhatsApp — nenhum dos dois grupos se confundiu.

`planos.html` (a cópia que também fica acessível) foi sincronizado com
o mesmo conteúdo.

Sem mudança de banco, sem mudança de Edge Function (só reaproveita a que
já existia).

## v0.101.1 — Dois reforços de segurança: currículo de verdade + bloqueio no servidor

**1) Validação real do arquivo de currículo:** antes, o sistema confiava
no que o navegador dizia que o arquivo era ("Content-Type: PDF"), sem
checar o conteúdo de verdade — alguém podia renomear qualquer arquivo
pra ".pdf" e o sistema aceitava. Agora confere a assinatura real do
arquivo (todo PDF de verdade começa com os bytes `%PDF-`) antes de
aceitar — se não bater, recusa a candidatura com um aviso claro. Testado
com PDF de verdade, HTML disfarçado e executável disfarçado.

**2) Bloqueio de login movido pro servidor:** o bloqueio após 5 tentativas
erradas vivia só no `localStorage` do navegador — limpar o navegador ou
trocar de dispositivo contornava completamente. Nova Edge Function
"login-bloqueio" torna isso real: o contador vive no banco, por e-mail,
e vale em qualquer lugar. Testada a lógica de bloqueio na 6ª tentativa.

**Limitação que continua existindo, por transparência:** nenhuma das duas
camadas (localStorage + banco) impede alguém de chamar a API de
autenticação do Supabase diretamente, por fora da nossa tela de login —
fechar essa brecha específica exigiria configurar um Auth Hook direto no
painel do Supabase (um passo mais avançado, não feito nesta rodada).

Requer rodar sql/35-rate-limit.sql (se ainda não tiver rodado — a tabela
já existia, só reaproveitamos) e reimplantar a Edge Function "rs" e a
nova "login-bloqueio".

## v0.101.0 — Termos de Uso / Privacidade ligados ao sistema + canal LGPD
Os dois últimos itens pendentes da revisão de "pronto pra vender":

**Termos e Política de Privacidade:**
- Campos em colchetes preenchidos: data (30/09/2026) e Encarregado de
  Dados (Instituto INETRIS — halleyrafael78@gmail.com).
- Publicados como páginas do site: `termos.html` e `privacidade.html`,
  linkadas no rodapé da landing e dentro da Central de Ajuda.
- **Checkbox obrigatório** no formulário de cadastro ("Li e aceito os
  Termos de Uso e a Política de Privacidade") — sem marcar, não cria
  conta.
- A data exata do aceite fica registrada por pessoa (`perfis.termos_aceitos_em`),
  como prova em caso de disputa — não é só um "sim/não".
- **Continua pendente**: revisão por advogado antes de qualquer contrato
  real (texto em si não mudou, só os campos que estavam em aberto).

**Canal de direitos da LGPD:**
- Botão **"Solicitar meus dados (LGPD)"** na Central de Ajuda, que já
  abre um chamado com o pedido pré-formatado (acesso, correção, exclusão,
  portabilidade) — só preencher o detalhe.
- Candidatos do R&S (que não logam no sistema) têm o e-mail do
  Encarregado de Dados diretamente no aviso de privacidade da página
  pública de candidatura, e um link pra Política completa.

Requer rodar sql/36-aceite-termos.sql (adiciona a coluna e atualiza a
trigger de cadastro). Sem mudança de Edge Function.

## v0.100.0 — Super Admin: botão "Marcar como pagante"
Investigando a pergunta sobre o que acontece depois dos 7 dias de teste,
confirmei que o comportamento já estava certo desde que o módulo foi
construído: o acesso é bloqueado automaticamente quando o teste expira
(`trial_ate` vencido e `is_pagante` ainda falso), mas **os dados nunca
são apagados** — ficam intactos, prontos pra quando o cliente decidir
assinar.

**Mas encontrei uma lacuna real**: não existia, em lugar nenhum da
interface, um jeito de marcar uma empresa como "virou cliente pagante" —
a única forma de reverter o bloqueio era um UPDATE manual direto no
banco. Corrigido: nova coluna de ação no painel do Super Admin, **"Marcar
como pagante"**, que aparece pra qualquer empresa ainda em teste grátis
(expirado ou não) e libera o acesso de vez, sem depender mais do prazo.

Sem mudança de banco (só usa a coluna `is_pagante` que já existia).

## v0.99.9 — Limite de taxa (rate limit) nas Edge Functions públicas
Camada extra de proteção contra abuso, pra complementar o reCAPTCHA (que
sozinho não é à prova de bots profissionais):

- **Teste grátis**: no máximo 3 solicitações por IP a cada 24 horas.
- **Candidatura do R&S**: no máximo 10 candidaturas por IP a cada 1 hora.

Quem passar do limite recebe um aviso claro pra tentar mais tarde (erro
429), em vez de travar silenciosamente. Testei a lógica (permite até o
limite, bloqueia depois, e IPs diferentes não se afetam entre si).

Requer rodar sql/35-rate-limit.sql e reimplantar as Edge Functions
"teste-gratis" e "rs".

## v0.99.8 — Teste grátis 100% automático (decisão: sem revisão manual)
Antes, cada pedido de teste grátis exigia você clicar em "Aprovar" no
painel do Super Admin. A partir de agora, quem preenche o formulário na
landing recebe o código de acesso **na hora**, por e-mail — sem esperar
ninguém.

- Nova Edge Function pública (`teste-gratis`): gera o código de licença,
  registra a solicitação já aprovada, e envia o e-mail — tudo numa
  chamada só, sem exigir login.
- O formulário de teste grátis ganhou um **reCAPTCHA** (a única proteção
  contra abuso, já que não existe mais revisão humana — decisão tomada
  conscientemente).
- **Bug real corrigido de passagem**: o e-mail de aprovação manual (o
  fluxo antigo) usava os nomes de campo errados (`para`/`html` em vez de
  `destinatario`/`corpoHtml`) — o mesmo tipo de bug já corrigido em outro
  lugar do sistema, mas que tinha passado despercebido aqui. Como esse
  fluxo manual deixa de ser usado, o bug fica sem efeito prático, mas o
  texto da confirmação na tela (que ainda dizia "o Instituto vai analisar
  e enviar em breve") também foi atualizado pra refletir a entrega
  instantânea.

Requer reimplantar a Edge Function nova "teste-gratis" (e configurar o
secret RECAPTCHA_SECRET_KEY nela, o mesmo valor já usado na função "rs").
Sem mudança de SQL.

## v0.99.7 — Testes automatizados: primeiros 19, nas contas mais críticas
Item 2 do "que falta pra vender" — começando pelos cálculos onde um erro
silencioso seria mais grave: classificação de desempenho (Iniciar/
Desenvolver/Alavancar), matriz de risco do NR1, e preço/limite de
colaboradores por plano.

**Como funciona:** os testes carregam os arquivos JS **de verdade** do
sistema (não uma cópia reescrita da lógica, que poderia divergir com o
tempo) dentro de uma "caixa de areia" do Node, com `document`/`state`
simulados só o suficiente pra rodar. Roda com `npm test`, usando o test
runner que já vem embutido no Node — sem dependência nova nenhuma.

Durante a escrita, um dos testes que eu mesmo escrevi errado apontou pra
um comportamento real do cálculo de fidelidade (usa hora exata, não só a
data) — corrigido o teste, não o código, depois de confirmar que o
comportamento real estava certo. Fica registrado como exemplo de como
testes ajudam a entender o sistema, não só a pegar bug.

19 testes, 19 passando. Cobertura inicial — mais cálculos críticos (banco
de horas, indicadores de R&S) ficam pra uma próxima rodada.

Sem mudança de banco, sem mudança em nenhum arquivo que roda no navegador
— só arquivos novos dentro de `tests/`.

## v0.99.6 — Suporte estruturado: Central de Ajuda
Item 1 do "que falta pra vender" — antes, todo suporte era você
respondendo direto por fora. Agora:

- **Nova página "Central de Ajuda"**, visível pra qualquer usuário
  logado, com FAQ (perguntas frequentes já escritas) e um botão pra
  **abrir chamado** (assunto + mensagem).
- Cada chamado tem status (Aberto → Em andamento → Resolvido), visível
  pra toda a empresa que abriu — não se perde mais numa conversa de
  WhatsApp.
- Você recebe um e-mail assim que um chamado novo é aberto.
- **Painel do Super Admin**: nova seção com todos os chamados de todas
  as empresas, num só lugar — você muda o status e escreve uma resposta,
  que já dispara um e-mail de volta pro cliente automaticamente.

Também corrigido, de passagem: a consulta de perfis da empresa nunca
buscava o campo `email` — usado agora pela Central de Ajuda, mas que
também deixa esse dado disponível pra outras partes do sistema que
precisarem.

Requer rodar sql/34-central-de-ajuda.sql no projeto principal.

## v0.99.5 — Onboarding: checklist de primeiros passos
Empresa nova, sem ninguém do lado ajudando, agora vê um card no topo do
Dashboard do Administrador: "Primeiros passos", com uma barra de
progresso e 5 itens — cadastro da empresa, estrutura organizacional,
publicar um cargo, cadastrar colaboradores, abrir o primeiro ciclo de
avaliação. Cada item tem um botão "Ir" direto pra tela certa. O
progresso é calculado a partir dos dados reais (não é um contador manual
que pode dessincronizar) — testei os cenários de empresa vazia, empresa
completa, e o caso de borda de colaborador cadastrado mas inativo (não
conta como concluído). O card some sozinho quando os 5 passos estiverem
feitos, e também pode ser ocultado manualmente antes disso.

Sem mudança de banco.

## v0.99.4 — Auditoria de segurança + monitoramento de erros (Sentry)
Dois itens da lista de "o que falta pra vender", ambos concluídos:

**Auditoria de segurança (RLS entre empresas):** revisei as 34 políticas
de acesso do sistema, uma por uma. Encontrada 1 falha real: a política de
criar notificação só conferia a empresa de quem cria, nunca conferia se o
destinatário pertencia à mesma empresa — permitindo, em teoria, notificar
qualquer pessoa de qualquer empresa. Corrigida (`33-fix-notificacoes-cross-empresa.sql`),
testada com o cenário de ataque simulado. As outras 33 políticas foram
conferidas e estão corretas.

**Monitoramento de erros (Sentry):** adicionado em todas as páginas do
site (sistema, planos, candidatura pública) — qualquer erro real de
JavaScript que acontecer pra qualquer pessoa agora é capturado
automaticamente e aparece no painel do Sentry, com detalhes de onde e
quando aconteceu. Antes, só se ficava sabendo se o cliente avisasse.

Requer rodar sql/33-fix-notificacoes-cross-empresa.sql no projeto
principal. O Sentry já está ativo assim que subir os arquivos HTML —
sem configuração adicional.

## v0.99.3 — Revisão completa do código: 1 bug real encontrado e corrigido
A pedido, reli o projeto inteiro procurando bugs, com vários métodos:
cruzamento de toda função chamada (onclick/onchange) contra toda função
declarada, IDs duplicados de formulário, nomes de coluna do código
comparados com as restrições reais do banco (`check` constraints), e
todo `getElementById` comparado com os IDs de fato criados no HTML —
em cada arquivo e no projeto inteiro.

**Encontrado 1 bug real:** o gerador de "dados de teste" do Ponto criava
uma justificativa com `tipo: 'atraso'` — valor que não existe na lista
permitida pelo banco (só `'atraso_saida'`, `'falta'`, `'ajuste_ponto'`,
`'atestado'`). Isso fazia essa parte específica da geração de dados de
demonstração falhar sempre. Corrigido pra `'atraso_saida'`. Não afetava
justificativas reais criadas por colaboradores — só o gerador de teste.

Os outros achados da varredura (2 pares de IDs duplicados, algumas
funções aparentemente "não declaradas") foram todos conferidos e
confirmados como falsos positivos — código correto, só padrões que
minha varredura automática não reconhecia de primeira.

Requer reimplantar a Edge Function "ponto".

## v0.99.2 — R&S: tela de publicar não pede mais info repetida
A tela "Configurar página pública" pedia pra digitar de novo descrição,
requisitos e cidade — coisas que já tinham sido preenchidas no perfil
desejado da requisição. Agora isso é montado automaticamente: descrição
vem das principais atividades, requisitos juntam hard skills, soft
skills, experiência e formação (só o que fizer sentido, nada de campo
vazio ou "não exigido" aparecendo à toa), e cidade vem direto da
requisição. Sobrou só o essencial pra decidir na hora de publicar:
título, modalidade, e se mostra salário/nome da empresa.

## v0.99.1 — R&S: idade mínima de 16 anos para vagas de Jovem Aprendiz
Diferente de coletar a idade exata (que é sobre perfil demográfico e cai
na Lei 9.029/1995), isso é uma exigência legal de elegibilidade por tipo
de contrato — a CLT permite Jovem Aprendiz a partir de 16 anos, mas exige
18 nos demais formatos. Agora:
- "Formato de contratação" na requisição ganhou a opção **Jovem
  Aprendiz**.
- Ao publicar a vaga, o sistema detecta sozinho esse formato e ajusta a
  página pública automaticamente: mostra "Tenho 16 anos ou mais" nessas
  vagas, e "Tenho 18 anos ou mais" em todas as outras — sem precisar de
  nenhum passo extra do RH.

Continua sendo só uma confirmação de elegibilidade (não substitui a
conferência de documento na contratação de verdade). Requer rodar
sql/32-rs-jovem-aprendiz.sql e reimplantar a Edge Function "rs".

## v0.99.0 — R&S: perfil detalhado — vaga e candidato
Expansão grande, a pedido, dividida em duas partes:

**O que a vaga pede** (formulário de requisição, preenchido pelo RH):
nível de maturidade, perfil DISC desejado, outro teste de personalidade,
hard skills, soft skills, principais atividades, salário fixo,
remuneração variável, formato de contratação, disponibilidade de
horários, interno/externo, cidade, experiência anterior necessária,
requisitos técnicos (moto/notebook/smartphone), intimidade com
tecnologia, formação superior necessária, e nível exigido de
Excel/Word/PowerPoint.

**O que o candidato informa** (página pública, mantido simples e rápido
de preencher): cidade atual, formação superior, experiência anterior,
disponibilidade de horários, o que possui (moto/notebook/smartphone),
intimidade com tecnologia, conhecimento em Excel/Word/PowerPoint, e
LinkedIn (opcional). O RH vê tudo isso num botão "Ver perfil do
candidato", dentro do pipeline.

**Duas informações da lista original ficaram de fora, de propósito:**
idade exata e gênero — coletar isso no formulário de candidatura fere a
Lei 9.029/1995 (que proíbe usar sexo, idade e outros critérios
protegidos como filtro de contratação). Mantido o checkbox "Tenho 18
anos ou mais" no lugar de idade — confirma elegibilidade sem coletar o
número.

Requer rodar sql/31-rs-perfil-candidato.sql (adiciona uma coluna
flexível pras respostas do candidato) e reimplantar a Edge Function "rs".

## v0.98.4 — Correção: link público da vaga dava 404 (app.htmlvaga.html)
Quando o sistema passou a rodar em `app.html` em vez de `index.html`
(v0.98.1), o link público de cada vaga do R&S quebrou — a função que o
monta trocava "index.html" por vazio, e como esse nome não existe mais,
o resultado virava `app.htmlvaga.html` (sem barra nenhuma), um endereço
que não existe. Corrigido pra usar só a pasta atual, não importa o nome
do arquivo. Testei com "app.html", "index.html" e sem nome de arquivo —
os três geram o link certo agora. Vale imediatamente pras vagas já
publicadas antes, sem precisar republicar nada.

## v0.98.3 — Landing interna removida de vez (não depende mais de configuração)
A correção anterior (v0.98.2) só mudava o padrão — ainda era possível a
landing interna aparecer em certas condições. Agora `renderTelaAuth()`
vai **sempre** direto pro login, sem exceção: a página `planos.html` é a
única landing do sistema a partir de agora. As funções antigas
(`renderLanding`, `irParaLanding`) continuam no arquivo, só não são mais
chamadas por nenhum caminho de entrada.

## v0.98.2 — Removida a landing interna redundante do app.html
Com a página `planos.html` (agora `index.html`) fazendo o papel de landing
comercial completa, a landing interna antiga (dentro do próprio sistema,
mostrada por padrão pra quem não estava logado) ficou redundante e
confusa — quem chegasse em `app.html` via link direto via de novo os
planos, só que numa versão mais simples e desatualizada. Agora
`app.html` vai direto pro login quando não há sessão — sem passar por
nenhuma landing intermediária. A função interna continua existindo no
código, só não é mais a porta de entrada padrão.

Requer reimplantar só o arquivo (sem SQL nem Edge Function). Importante:
o número de versão dos `<script>` do app.html também foi atualizado
(v0.98.2), pra garantir que o navegador busque os arquivos novos e não
fique preso em cache antigo.

## v0.98.1 — A página de planos virou a porta de entrada do site
Reorganização de endereços, a pedido: agora quem visita o endereço
principal (`/`) vê primeiro a **página de planos** (recursos, preços,
FAQ) — não a tela de login. O sistema em si continua funcionando
normalmente, só que agora no endereço **`/app.html`**.

- `index.html` → passou a ser a página de planos (era `planos.html`).
- `app.html` → o sistema completo (login, dashboard, todos os módulos) —
  cópia exata do que antes vivia em `index.html`.
- A página de planos ganhou um botão **"Já sou cliente · Entrar"** no
  menu, ao lado de "Testar grátis", levando direto pro `/app.html`.

Quem acessa `/app.html` direto (link salvo, favorito) continua
funcionando exatamente como antes — nada mudou ali além do endereço.

## v0.98.0 — Nova página pública: planos.html
Adicionada a landing page completa de planos e recursos (`planos.html`),
lado a lado com `index.html` e `vaga.html` no mesmo site. Todos os botões
de contato ("Testar grátis", "Quero contratar agora", etc.) abrem o
WhatsApp direto, em nova aba, com uma mensagem inicial já preenchida, pro
número (55) 89 9985-7062.

Essa página é independente do sistema logado — pode ser divulgada
separadamente (redes sociais, anúncios) sem exigir login. Sem SQL, sem
Edge Function.

## v0.97.4 — Redesign da seção de preços da landing
Trocado o layout genérico de 3 cards soltos (com selo flutuante, texto em
caixa alta, escala no card do meio) por um **painel único de preços**,
mais parecido com uma ficha comercial de verdade: colunas separadas por
linhas verticais, plano recomendado destacado só por um fundo suave (sem
badge nem escala), preço com números tabulares, rótulos em minúscula.

A implantação (única vez) deixou de ser um "+ R$X" solto e virou uma linha
própria, separada por um traço, com a palavra "implantação" por extenso —
mais claro que é um valor separado da mensalidade. Testei o resultado
renderizado (desktop e mobile) com um navegador de verdade antes de
finalizar.

## v0.97.3 — Correção real: tela branca (ReferenceError: renderTelaAuth is not defined)
A correção anterior (v0.97.2) causou um erro novo, capturado certinho pelo
print do console: `renderTelaAuth is not defined`. Causa real: o Supabase
dispara o evento inicial de sessão **muito cedo** — antes mesmo de todos
os arquivos `<script>` da página terminarem de carregar. Como
`renderTelaAuth` só existe depois que `js/35-tela-entrada.js` (carregado
bem mais tarde na lista) termina de rodar, esse evento early podia
disparar ANTES dela existir, quebrando a página inteira (tela branca).

Corrigido com o mesmo tipo de proteção já usada antes pro reCAPTCHA: antes
de chamar `renderTelaAuth()`, o código agora confere se ela já existe — se
não existir ainda, tenta de novo a cada 50ms, até existir de verdade.
Testada a lógica de espera.

## v0.97.2 — Correção real: landing não aparecia nem em aba anônima
A correção anterior (v0.96.0) estava certa, mas incompleta: existe um
SEGUNDO ponto no código que decide o que mostrar na abertura — o listener
`onAuthStateChange` do Supabase, que dispara sozinho assim que a página
carrega, mesmo sem nenhuma sessão. Esse segundo ponto chamava
`renderLogin()` direto, sobrescrevendo a landing que o primeiro ponto já
tinha decidido mostrar — por isso continuava só login, até em aba anônima
(confirmado com print). Corrigido: os dois pontos agora concordam
(`renderTelaAuth()`), e testei os três cenários (visita nova, clicar em
Entrar, fazer logout) — todos mostram a tela certa.

## v0.97.1 — Valores reais dos planos + taxa de implantação + regra dos 12 meses
Os preços mensais já estavam certos (Essencial 297/197, Gestão 597/397,
Estratégico 997/697). O que faltava:
- **Taxa de implantação** (única vez): R$ 590 (até 10), R$ 990 (11 a 30),
  R$ 1.490 (31 a 60) — mostrada na landing, junto com cada plano.
- **Nota sobre acima de 60 colaboradores**: "proposta personalizada",
  com link direto pro formulário de contratação.
- **Correção real**: a tela de Pagamento (dentro do sistema, pra quem já é
  cliente) estava mostrando o preço de **cliente novo** — errado, já que
  quem está logado ali já é cliente. Agora calcula o preço certo com base
  na data de início do contrato: **preço de cliente atual** (com desconto)
  durante os primeiros 12 meses, e volta pro **valor cheio** depois disso
  — exatamente como a regra diz. Testei os três cenários (dentro dos 12
  meses, depois dos 12 meses, sem data de início cadastrada) e todos batem
  certo.

Sem mudança de banco.

## v0.97.0 — Landing: "Quero contratar agora" (Fase 1, sem pagamento automático ainda)
Cada plano na landing ganhou um botão **"Quero contratar agora"**, além do
fluxo de teste grátis já existente — pra quem já decidiu e quer pular
direto pra contratação. Abre um formulário (nome, e-mail, empresa,
telefone, observações), grava a solicitação, e avisa o Instituto INETRIS
por e-mail.

Fase 1: **sem link de pagamento automático ainda** — fica registrado pro
Instituto entrar em contato e combinar o pagamento manualmente (mesmo
modelo já usado na cobrança por WhatsApp). Quando os valores/forma de
pagamento forem definidos, entra a Fase 2 com o link automático.

**Painel do Super Admin**: nova seção "Solicitações de contratação direta",
com status (Pendente → Em contato → Fechada/Perdida) que você atualiza
conforme conversa com o cliente.

Requer rodar sql/30-solicitacoes-contratacao.sql no projeto principal.

## v0.96.1 — Correção: tela "fantasma" ao trocar de página (visível a olho nu)
Reportado por vídeo: ao trocar de tela pra uma página pesada (o Dashboard,
com vários gráficos e cards), por uma fração de segundo a tela antiga
aparecia sobreposta à nova, como um efeito de "fantasma". Analisei quadro
a quadro e confirmei: acontecia só nessa transição específica (a mais
pesada de montar), não nas outras — reproduzindo exatamente o padrão de
uma tela demorando mais tempo pra ser pintada pelo navegador enquanto a
antiga ainda não tinha sumido da tela.

Corrigido: ao trocar de rota (não em toda atualização de tela — só quando
muda de página de verdade), o sistema agora limpa a tela primeiro e só
desenha o conteúdo novo no próximo quadro de pintura do navegador. Isso
garante que a tela antiga já sumiu antes do conteúdo pesado começar a
aparecer, eliminando a sobreposição. Testada a lógica: confirma que limpa
antes de desenhar ao trocar de tela, e que NÃO limpa à toa quando é só
uma atualização dentro da mesma tela (evita um "flash" branco desnecessário
em ações do dia a dia).

## v0.96.0 — Reativada a tela de entrada comercial (landing + teste grátis)
Antes de logar, o sistema volta a mostrar a landing comercial (hero, planos
com preços reais vindos de `PLANOS_NORTE`, formulário de solicitação de
teste grátis de 7 dias) — em vez de abrir direto na tela de login. Quem já
é cliente clica em "Entrar" e vai pro login normal.

No processo de reativar, encontrei e corrigi um bug real que essa tela
tinha desde que foi construída (só nunca tinha sido notado, porque estava
desativada): o aviso por e-mail pro Instituto sobre uma nova solicitação
usava nomes de campo errados (`para`/`html` em vez de
`destinatario`/`corpoHtml`) — a solicitação era salva certinho, mas o
e-mail de aviso falhava **em silêncio**, sem avisar ninguém. Corrigido.

Conferido: a tabela `solicitacoes_teste` e as políticas de acesso público
(sql/24-teste-gratis.sql) já existiam e continuam corretas — sem mudança
de banco necessária, contanto que esse arquivo já tenha sido aplicado
antes.

## v0.95.1 — Trocar o plano da empresa: agora tem tela, sem precisar de SQL
Corrige a falta que causou o bloqueio ao cadastrar colaboradores: até aqui,
o plano de uma empresa (Essencial/Gestão/Estratégico, que define o limite
de colaboradores) só podia ser ajustado direto no banco.

- **Super Admin**: nova coluna "Plano" na tabela de Cobrança por WhatsApp —
  escolhe o plano de qualquer empresa e salva. Segue o mesmo padrão de
  segurança já usado pro link de pagamento: uma função SQL que só mexe
  nesse campo específico, e só roda se quem chamou for Super Admin (nunca
  dá acesso de escrita a mais nada da empresa).
- **Cliente**: na tela de Pagamento, cada plano que não é o atual ganhou o
  botão "Solicitar este plano" — registra o pedido na auditoria (a
  cobrança continua manual, então não muda sozinho; o Instituto INETRIS
  vê o pedido e ajusta).

Requer rodar sql/29-super-admin-definir-plano.sql no projeto principal.

## v0.95.0 — R&S completo: scorecard de entrevista e indicadores
Fecha os dois itens que faltavam do módulo de Recrutamento e Seleção:

- **Scorecard de entrevista**: em cada candidato, um botão "+ Novo
  scorecard" abre um formulário com as **competências comportamentais já
  cadastradas no desenho do cargo** (não inventa critério novo) — cada uma
  avaliada de 1 a 5, mais uma recomendação (avançar / neutro / não
  avançar) e observações. Vários avaliadores podem registrar o próprio
  scorecard pro mesmo candidato; a lista mostra a média de cada um e quem
  avaliou.
- **Indicadores de recrutamento**: três KPIs no topo da tela —
  **tempo médio de contratação** (da publicação da vaga até a conversão em
  colaborador), **taxa de aceite** (dos candidatos que chegaram a receber
  proposta, quantos realmente aceitaram), e candidatos por vaga. Calculado
  sob demanda a partir dos dados que já existem — testei as duas contas
  principais e batem certo.

Com isso, o módulo R&S está completo conforme a especificação original.
Sem mudança de banco.

## v0.94.4 — R&S: aviso da tela atualizado
O aviso dizia "ainda não há página pública de candidatura" — desatualizado
desde que ela foi construída e testada com sucesso. Agora reflete o que
realmente já funciona (requisição, pipeline, página pública, e-mails por
etapa) e o que ainda falta (scorecard de entrevista, indicadores).

## v0.94.3 — Correção: "Converter em colaborador" não fazia nada
A função inteira tinha sido apagada por acidente numa edição anterior
(mesma classe de erro que já aconteceu antes nesta sessão: só o botão
sobrou, chamando uma função que não existia mais no arquivo — por isso
não dava erro visível, só não fazia nada). Restaurada, e fiz uma varredura
em **todo o projeto** cruzando toda função chamada em onclick/onchange
contra toda função declarada — confirmando que não sobrou mais nenhuma
faltando em lugar nenhum.

## v0.94.2 — Correção: reCAPTCHA travava o envio ("No reCAPTCHA clients exist")
O formulário da página pública é montado depois que os dados da vaga
carregam — mas o reCAPTCHA só escaneia a página automaticamente uma vez,
no carregamento inicial, e nunca via mais tarde. Resultado: o widget nunca
era registrado de verdade, e ao tentar validar, o erro "No reCAPTCHA
clients exist" travava o botão em "Enviando…" pra sempre. Corrigido:
agora o widget é renderizado explicitamente por código (esperando o
script do Google carregar, com nova tentativa a cada 200ms se precisar),
depois que o formulário já está na tela. Testada a lógica de espera.

## v0.94.1 — R&S: e-mail automático ao candidato em toda mudança de etapa
O candidato agora é avisado por e-mail sempre que o RH move ele pelo
pipeline (nova candidatura, triagem, contato inicial, avaliação,
entrevista, finalista, proposta, aprovado) e também quando é reprovado —
com uma mensagem específica pra cada etapa, explicando o que está
acontecendo. A confirmação de recebimento agora dispara **na hora**, direto
da página pública, sem esperar o RH importar a candidatura. Envio é
best-effort: se falhar (e-mail inválido, serviço fora do ar), não trava o
pipeline — só registra no console.

Requer reimplantar a Edge Function "rs" (ganhou o envio de confirmação).
Sem mudança de SQL.

## v0.94.0 — "Gerar dados de teste" agora cobre o sistema inteiro
Pra usar em apresentações, sem faltar nada. Antes gerava só o básico
(estrutura mínima, 2 cargos, 2 colaboradores, 1 ciclo aberto). Agora gera:
- **Estrutura** com 7 níveis (unidade, 2 departamentos, 2 setores, 2 equipes).
- **7 cargos** publicados, de famílias variadas (Liderança, Comercial,
  Administrativo/Financeiro, Coordenação, Operacional).
- **10 colaboradores**, distribuídos pela estrutura e pelos cargos.
- **10 ciclos de avaliação em estados variados**: 2 abertos, 2 com
  pendência de avaliador, e 6 **consolidados de verdade** — reaproveitando
  a função real de cálculo do sistema (`consolidarCiclo`), com resultados
  variados (bom/misto/fraco) pra popular os gráficos do dashboard com
  distribuição realista. Metade já tem reunião de feedback registrada e
  uma ação do PDI marcada como concluída.
- **3 check-ins** de feedback contínuo.
- **1 pesquisa de clima encerrada**, com 12 respostas anônimas de exemplo.
- **NR1**: SST cadastrado, 1 risco + 1 ação de exemplo, e (via Edge
  Function, melhor esforço) uma campanha encerrada com respostas reais no
  servidor — um setor com volume suficiente pra mostrar resultado, outros
  pequenos pra mostrar a agregação em ação.
- **R&S**: 1 requisição aprovada e publicada, com 4 candidatos em etapas
  diferentes do pipeline.
- **Ponto** (se o módulo estiver habilitado): uma semana de registros
  (com um dia de atraso de propósito, pra aparecer no banco de horas) e 2
  justificativas de exemplo (uma pendente, uma já aprovada).

Continua sem apagar nada que já exista — só adiciona por cima. As partes
de NR1 e Ponto são melhor esforço: se a Edge Function correspondente ainda
não estiver implantada, essa parte é só ignorada (com aviso no console),
sem quebrar o resto da geração.

Requer reimplantar as Edge Functions "nr1" e "ponto" (ambas ganharam uma
ação nova de seed). Sem mudança de SQL.

## v0.93.2 — CORREÇÃO CRÍTICA: risco real de perda de dados no login
Encontrada a causa provável de um incidente real onde os dados de uma
empresa foram substituídos por um estado vazio.

**O bug:** se `carregarEstado()` falhasse silenciosamente (instabilidade de
rede, timeout, etc. — algo mais provável de acontecer com várias pessoas
logando ao mesmo tempo), o erro era só registrado no console e o app
seguia normalmente, como se os dados tivessem carregado. O `state` ficava
nos valores vazios do `seed()`, e o próximo `render()` agendava um
salvamento automático — que **gravava esse estado vazio por cima dos
dados reais da empresa**, sem nenhum aviso.

**A correção (duas camadas):**
1. `carregarEstado()` agora lança um erro explícito se a leitura falhar,
   em vez de retornar em silêncio.
2. Uma trava nova (`_cargaInicialOk`) bloqueia **qualquer** salvamento
   automático até que a carga tenha sido confirmada como bem-sucedida
   nesta sessão — tanto no login quanto no botão de atualizar. Se a carga
   falhar, aparece um aviso claro ("não foi possível carregar, tente de
   novo — nada foi alterado") em vez de deixar o app seguir com dados
   incompletos.

Testado o cenário exato do incidente: com a trava, uma falha de carga
agora bloqueia o salvamento (nada é perdido); só depois de uma carga
confirmada é que o salvamento volta a funcionar normalmente.

**Aplicar com urgência** — sem SQL, é só o novo `norte-organizado.zip`.

## v0.93.1 — R&S: chave pública do reCAPTCHA configurada
A Site Key do reCAPTCHA já está no `vaga.html`. Falta só configurar a
Secret Key como segredo (`RECAPTCHA_SECRET_KEY`) na Edge Function "rs", no
painel do Supabase — sem isso, toda candidatura continua sendo rejeitada.

## v0.93.0 — R&S: página pública de candidatura
Quem se candidata a uma vaga não precisa mais ser cadastrado manualmente:
- **Página pública nova** (`vaga.html?v=<id>`), fora do app logado — sem
  exigir login. Mostra título, descrição, requisitos, local, modalidade, e
  opcionalmente salário e nome da empresa (configurável por vaga, incluindo
  vaga confidencial). Formulário com nome, e-mail, telefone, upload de
  currículo em PDF (até 5MB), aviso de privacidade (aceite obrigatório),
  consentimento separado para banco de talentos, e reCAPTCHA do Google.
- **Ao publicar uma vaga** (RH), agora abre um formulário pra configurar o
  conteúdo público, e o sistema gera um **link único** pra divulgar — com
  botão de copiar.
- **Candidaturas recebidas** aparecem destacadas na tela do RH, com botão
  "Importar" que traz pro pipeline normal (mesma esteira dos candidatos
  cadastrados manualmente).
- **Arquitetura de segurança**: como no NR1, os dados públicos (vaga
  espelhada, candidaturas, banco de talentos) vivem em tabelas próprias,
  sem nenhuma política de acesso direto — só a Edge Function nova "rs"
  (com a chave de serviço) toca nelas. Isso evita expor o resto dos dados
  da empresa pra internet e evita duas candidaturas simultâneas se
  atropelarem.

Requer rodar sql/28-rs-pagina-publica.sql, criar o bucket privado
"curriculos-rs", implantar a Edge Function "rs", e configurar o secret
RECAPTCHA_SECRET_KEY (sem isso, toda candidatura é rejeitada). Também é
necessário editar vaga.html e colocar a Site Key pública do reCAPTCHA.

## v0.92.0 — Módulo R&S (Fase 1: requisição, aprovação, pipeline)
Início do módulo de Recrutamento e Seleção, no menu "Pessoas":
- **Requisição de vaga**: vinculada a um cargo já publicado — a vaga herda
  missão e responsabilidades do desenho de cargo, sem alterar o cargo
  original. Campos: unidade, setor, quantidade, motivo, prazo,
  confidencialidade.
- **Aprovação**: toda requisição nasce "pendente"; owner/rh aprovam ou
  reprovam antes de qualquer publicação — nenhuma vaga abre sem passar por
  aprovação.
- **Publicação e encerramento**: depois de aprovada, a vaga é publicada
  (cadastro manual de candidatos — ainda sem página pública) e pode ser
  encerrada com motivo registrado.
- **Pipeline de candidatos**: cadastro manual (nome, contato, origem,
  currículo/resumo), com aviso de possível duplicidade por e-mail/telefone
  sem apagar histórico. Etapas fixas (Nova candidatura → Triagem → Contato
  inicial → Avaliação → Entrevista → Finalista → Proposta → Aprovado), com
  histórico completo de cada mudança (quem, quando, de onde pra onde).
  Reprovação com motivo registrado, reversível.
- **Conversão em colaborador**: candidato aprovado gera um novo cadastro em
  Colaboradores, reaproveitando cargo/unidade/setor da vaga.

Fase 1 é a fundação — scorecards de entrevista, comunicação por e-mail,
página pública de candidatura e indicadores ainda não existem nesta versão.
Sem mudança de banco — vive no mesmo blob por empresa, com compatibilidade
automática para empresas já existentes.

## v0.91.0 — NR1: exportar relatório em PDF (para enviar ao SST)
Como o SST não tem conta no sistema, agora há um botão **"Exportar PDF"**
em cada campanha publicada, que gera um relatório com: resultado
consolidado por dimensão (empresa toda e por grupo, já respeitando o
mínimo de anonimato e a agregação hierárquica de grupos pequenos),
inventário de riscos, e plano de ação com status e eficácia. O RH baixa e
envia ao profissional de SST por fora do sistema. Segue o mesmo padrão
visual dos outros relatórios em PDF (logo, cores da identidade visual).
Sem mudança de banco.

## v0.90.1 — RH: KPIs acima dos gráficos, com detalhe extra (como no Admin)
Os 4 cards do topo do dashboard do RH (Avaliações em andamento, Pendências
de avaliador, PDIs ativos, Colaboradores sem risco) subiram para ANTES dos
gráficos (ficavam depois) e ganharam uma linha extra de contexto em cada
um, no mesmo padrão do dashboard do Admin: "Avaliações em andamento" mostra
quantas estão abertas vs em consolidação; "Pendências de avaliador" e "PDIs
ativos" ficaram clicáveis, levando direto para resolver; "Colaboradores sem
risco" mostra a proporção (ex: 23 de 25). Sem mudança de banco.

## v0.90.0 — Dashboards reorganizados: pendências → gráficos → resto
Os três dashboards (RH, Líder e Colaborador) passaram a seguir a mesma
ordem visual em todos: primeiro as pendências, depois todos os gráficos
juntos, e por último as tabelas/listas/informações complementares. Antes
os gráficos apareciam espalhados entre KPIs e tabelas; agora ficam
concentrados logo após as pendências, e "Minha equipe" (líder), "Meu
cargo/ciclo" (colaborador) e as tabelas de competências/risco (RH) vêm
depois, todos juntos. Nenhum gráfico ou informação foi removido — só a
ordem mudou. Sem mudança de banco nem de Edge Function.

## v0.89.2 — Dashboards do RH, Líder e Colaborador muito mais completos
Os três dashboards passaram a reunir tudo que foi construído nas últimas
sessões (justificativas de ponto, banco de horas, competência, substituto
de aprovador, NR1), que antes ficava "escondido" em telas que só apareciam
se a pessoa lembrasse de checar.

**RH — "Suas pendências agora" ganhou:** justificativas de ponto
aguardando decisão (com as escalonadas em destaque), ações do NR1 com
prazo vencido, ações NR1 aguardando verificação de eficácia, aviso de
competência do mês anterior não fechada, aviso de substituto de aprovador
não definido, e alerta de banco de horas próprio negativo.

**RH — novo "Painel operacional" com 3 gráficos:** ciclos por status
(rosca), justificativas dos últimos 30 dias por status (barras), riscos
NR1 por nível (rosca) — cada um só aparece se houver dado real.

**Líder — pendências ganharam:** justificativas de ponto da equipe,
substituto não definido, banco de horas próprio negativo.

**Líder — nova tabela "Minha equipe":** cada colaborador com cargo, setor,
status do ciclo atual, nível de desempenho e justificativas de ponto
pendentes — tudo num lugar só, sem precisar visitar outras telas.

**Líder — novo painel com 2 gráficos:** ciclos da equipe por status
(rosca), justificativas da equipe por status (barras).

**Colaborador — pendências ganharam:** justificativas de ponto próprias
aguardando decisão, pesquisas NR1 aguardando resposta.

**Colaborador — novo painel com gráfico + saldo:** rosca "Minhas
justificativas" (histórico por status) e card do saldo do banco de horas
do mês (colorido, verde se positivo, vermelho se negativo).

Requer rodar reimplantar a Edge Function "ponto" (nova ação
`dashboard_alertas`, que verifica substituto, competência anterior e conta
justificativas por status). Sem mudança de banco.

## v0.88.1 — NR1: removido o campo "Origem" do SST
O cadastro do responsável técnico (SST) tinha um campo "Origem" (nomeado
pelo cliente / serviço contratado do INETRIS). Removido — o cadastro agora
é só nome e contato.

## v0.88.0 — Indicadores dos pilares NORTE agora podem ser removidos
Até aqui, uma vez que um indicador era adicionado a um pilar (N/O/R/T/E) —
tanto no Desenho de Cargo quanto na Cultura Organizacional — não havia
como removê-lo. Agora cada indicador tem um botão "×" pra remover, com
confirmação. Na Cultura Organizacional, remover um indicador padrão da
metodologia é permitido (é uma escolha da empresa), mas com aviso — e,
diferente de antes, a remoção não é desfeita automaticamente na próxima
vez que o sistema abrir (havia uma proteção pra empresas antigas que
recolocava os indicadores padrão sozinha; agora ela respeita quando a
remoção foi intencional). Sem mudança de banco.

## v0.87.1 — Correções de segurança encontradas na revisão (NR1)
Revisão do código da Edge Function "nr1" encontrou e corrigiu dois problemas
reais:
- **Vazamento entre empresas**: a ação de ver o log de visualização de uma
  campanha não conferia se a campanha pertencia à empresa de quem
  perguntava — em teoria, alguém sabendo o id de uma campanha de outra
  empresa poderia consultar quem viu o resultado dela. Corrigido: agora
  confirma que a campanha é da mesma empresa antes de responder.
- **Elegibilidade não validada no servidor**: a segmentação de público
  (por unidade/setor/cargo/lista) só era conferida na tela — o servidor
  aceitava qualquer resposta de qualquer pessoa da empresa. Corrigido:
  agora o servidor confere a elegibilidade antes de aceitar a resposta.

Também corrigido: a lista de campanhas mostrava "Nenhuma campanha criada
ainda" por um instante enquanto ainda carregava do servidor, antes de
aparecer a lista real — agora mostra "Carregando campanhas…" nesse meio-tempo.

## v0.87.0 — NR1: campanhas e respostas movidas para o servidor
Corrige a limitação de privacidade apontada: até aqui, campanhas, respostas
e a lista de quem já respondeu viviam no mesmo bloco de dados que qualquer
usuário logado da empresa baixa no navegador — tecnicamente dava para ver
no Console quem participou (não o quê) de uma campanha NR1.

Agora essas partes vivem só no **servidor**, numa Edge Function nova
("nr1") com 5 tabelas próprias, sem nenhuma política de acesso direto do
navegador — só a função (com a chave de serviço) toca nesses dados:
- Campanhas, respostas (sem ligação com quem respondeu — nem o servidor
  sabe), participação (quem já respondeu, separado do conteúdo),
  consentimento de privacidade, e o log de visualização do resultado.
- O navegador só recebe o que cada ação decide devolver: números
  consolidados, ou "só sobre a própria pessoa" (se ela já respondeu/
  aceitou) — nunca um despejo bruto das listas.
- Toda a experiência (criar/publicar/encerrar campanha, responder, aceitar
  o aviso de privacidade, ver resultado consolidado, salvar rascunho,
  fechamento automático) continua igual — só a forma como os dados viajam
  e são guardados mudou.

SST, dimensões/perguntas, inventário de risco e plano de ação continuam no
navegador (não são dados sensíveis de resposta anônima — são registros de
gestão do RH/SST), sem mudança.

Requer rodar sql/27-nr1-servidor.sql no projeto principal e implantar a
nova Edge Function "nr1" (arquivo à parte).

## v0.86.1 — NR1: aviso de privacidade e log de visualização
- **Aviso de privacidade**: antes de responder, aparece um aviso explicando
  a finalidade da coleta (avaliar condições de trabalho, nunca a pessoa) e
  a garantia de anonimato. É preciso aceitar para continuar. O aceite fica
  registrado (quem e quando) — separado da resposta em si, então não quebra
  o anonimato, no mesmo princípio de "quem já respondeu" que já existia.
- **Log de visualização do resultado**: toda vez que um owner/rh abre o
  resultado consolidado de uma campanha, fica registrado quem viu e quando
  — exigência de auditoria da norma. Fechar e reabrir gera um novo
  registro; só reabrir sem fechar (nova renderização) não duplica. As
  últimas 5 visualizações aparecem no rodapé do card de resultado.

Sem mudança de banco.

## v0.86.0 — NR1: público segmentado, salvar rascunho, fechamento automático
- **Público segmentado**: ao criar uma campanha, escolha se ela vai para
  todos os colaboradores, uma unidade, um setor, um cargo, ou uma lista
  específica de pessoas — com a **quantidade de elegíveis mostrada em tempo
  real** antes de publicar. A lista de campanhas mostra o público e quantos
  são elegíveis; "Minhas pesquisas" só mostra campanhas para as quais a
  pessoa é elegível. A adesão do painel executivo passou a considerar o
  público de cada campanha, não mais o total de colaboradores da empresa.
- **Salvar e continuar**: ao responder, o progresso é salvo automaticamente
  no navegador da própria pessoa (nunca no servidor — não afeta o
  anonimato). Se ela saltar fora, a lista mostra "(rascunho salvo)" e o
  botão muda para "Continuar", retomando de onde parou. O rascunho é
  apagado ao enviar a resposta.
- **Fechamento automático**: campanhas ativas cuja data de fim já passou
  são encerradas automaticamente ao abrir a tela, sem depender de alguém
  lembrar — a lista sinaliza quando isso aconteceu.

Sem mudança de banco.

## v0.85.2 — Agregação hierárquica de grupos pequenos (NR1)
Setores com menos respostas que o mínimo de anonimato deixaram de ser só
ocultados: agora sobem para o nível de cima na Estrutura (ex: a Unidade) e
se juntam com outros setores pequenos do mesmo pai. Se a soma atingir o
mínimo, mostra o resultado agregado nesse nível ("Setor X (agregado dos
setores menores)"); se ainda não atingir, sobe mais um nível, até "toda a
empresa" como último recurso — em vez de descartar o dado, como o
documento recomendava. Testado com um cenário de dois setores pequenos que
se combinam corretamente.

## v0.85.1 — Resultado da pesquisa ligado à matriz de risco
Corrige a desconexão entre o resultado da pesquisa (média com cor) e o
inventário de riscos (matriz probabilidade × severidade) — eram dois
sistemas que não se falavam. Agora, toda dimensão com resultado abaixo do
esperado (média < 3,5), tanto na visão "empresa toda" quanto por setor,
ganha um botão **"+ Registrar risco"** que abre o formulário do inventário
já com a descrição, a dimensão e o grupo preenchidos — e uma probabilidade
sugerida conforme a gravidade da média (só sugestão; a probabilidade e a
severidade continuam sendo definidas por julgamento humano do responsável
técnico, nunca calculadas automaticamente pela pesquisa).

## v0.85.0 — Módulo NR1 (Fases 3 e 4: risco, plano de ação e painel)
- **Inventário de riscos**: registre um risco (descrição, dimensão
  relacionada, grupo afetado, decisão) e defina probabilidade e severidade
  (1 a 5 cada) — o sistema calcula o **nível** pela matriz de risco
  (Baixo/Médio/Alto/Crítico). É julgamento humano do responsável técnico; o
  sistema só organiza e calcula, não decide.
- **Plano de ação**: cada risco pode ter várias ações (tipo, responsável,
  prazo). Status calculado automaticamente — uma ação com prazo vencido e
  não concluída aparece como "Atrasada". Ações concluídas ganham um botão
  **"Verificar eficácia"**: registra se realmente funcionou (melhorou /
  parcial / não melhorou) — concluir a tarefa não fecha o risco
  automaticamente, como a norma exige.
- **Painel executivo**: contagem de riscos por nível, ações atrasadas,
  ações aguardando verificação de eficácia, e a adesão média das campanhas
  publicadas.

Com isso, o ciclo completo do NR1 está fechado: campanha → coleta anônima →
resultado consolidado → risco → ação → verificação de eficácia → painel.
Sem mudança de banco. Continua valendo: conteúdo e anonimato precisam de
validação por SST antes de uso com cliente real.

## v0.84.0 — Módulo NR1 (Fase 2: coleta anônima e consolidação)
- **"Minhas pesquisas"**: todo colaborador (qualquer papel) vê as campanhas
  ativas que ainda não respondeu, e responde direto no sistema — escala de
  1 a 5 por afirmação. A resposta **não leva o nome de quem respondeu**, só
  o setor/unidade (pra permitir agrupar sem identificar a pessoa), seguindo
  o mesmo princípio de anonimato da Pesquisa de Clima.
- **Resultado consolidado** (owner/rh): botão "Ver resultado" em cada
  campanha publicada, mostrando a média por dimensão — para a empresa toda,
  e também por setor. **Grupos com menos respostas que o mínimo definido
  ficam ocultos** ("dados insuficientes"), protegendo o anonimato mesmo em
  setores pequenos. Cores indicam o nível: vermelho (risco), laranja
  (atenção), verde (adequado).

Ainda faltam (próxima fase): registro formal de risco a partir do
resultado, plano de ação e verificação de eficácia. Continua valendo o
aviso: conteúdo e regras de anonimato precisam de validação por SST antes
de uso com cliente real. Sem mudança de banco.

## v0.83.0 — Módulo NR1 (Fase 1: fundação)
Início do módulo de Riscos Psicossociais (NR1), no menu "Pessoas" (owner/rh):
- **Responsável técnico (SST)**: cadastro simples (nome, contato, se é do
  cliente ou serviço contratado do INETRIS). **Sem SST nomeado, nenhuma
  campanha pode ser publicada** — só fica em rascunho.
- **Dimensões e perguntas**: modelo genérico com 9 dimensões (demandas e
  carga, autonomia, clareza de papel, apoio e liderança, reconhecimento,
  relações e violência, mudanças e segurança, trabalho e vida, condições de
  execução), com perguntas redigidas do zero pelo INETRIS — não é cópia de
  nenhum instrumento comercial/protegido.
- **Campanhas**: criar (nome, período, mínimo de respondentes por grupo —
  padrão 5), publicar (trava sem SST) e encerrar. As perguntas ficam
  "congeladas" no momento da publicação, então editar o modelo depois não
  afeta campanhas já publicadas.

⚠️ Fase 1 é só a fundação: a coleta anônima de respostas, a consolidação por
grupo com a trava de anonimato, e o registro de risco/plano de ação ainda
não existem — entram nas próximas fases. Este módulo ainda não deve ser
usado com um cliente real: o conteúdo das perguntas e as regras de
anonimato precisam de homologação por um profissional de SST antes disso
(aviso também exibido na própria tela). Sem mudança de banco — vive no
mesmo blob por empresa (dados_sistema), com compatibilidade automática para
empresas já existentes.

## v0.82.0 — Substituto de aprovador e escalonamento
Resolve o risco de justificativas ficarem paradas quando o gestor está
ausente:
- Na Conferência de Ponto, uma seção **"Meu substituto"** onde o líder/RH
  escolhe outro líder ou RH da empresa que também pode aprovar por ele.
- Uma justificativa **pendente há 3 dias ou mais** é marcada como
  **escalonada**: aparece destacada (fundo vermelho claro, selo "⚠ Atrasado
  (Xd) — escalonado") na lista, e dispara um e-mail avisando o substituto do
  gestor do colaborador (se definido) e o RH/Admin da empresa — best-effort,
  não bloqueia a tela se o e-mail falhar.

Requer rodar sql/26-substituto-aprovador.sql (principal) e
sql-ponto-db/06-escalonamento.sql (ponto), e reimplantar a Edge Function
"ponto".

## v0.81.0 — Acesso sem e-mail (para quem não tem e-mail/celular corporativo)
Na tela de Colaboradores, quem ainda não tem conta vinculada ganhou o botão
"Criar acesso sem e-mail". O RH informa um login (matrícula) e o papel
(colaborador/líder/RH); o sistema gera um identificador técnico interno (não
é um e-mail de verdade — nunca é enviado a lugar nenhum) e uma senha
provisória, mostrados **uma única vez** para o RH copiar e entregar à
pessoa. No primeiro login com a senha provisória, o sistema obriga a criar
uma senha própria antes de continuar. Reaproveita o mecanismo de convites já
existente — a trigger de cadastro não foi alterada. Nova Edge Function
"acesso-sem-email".

Requer rodar sql/25-acesso-sem-email.sql no projeto principal e implantar a
nova Edge Function "acesso-sem-email" (arquivo à parte).

## v0.80.0 — Banco de horas e fechamento de competência
Motor de ponto mais completo:
- **Banco de horas**: card na tela de Ponto mostrando o saldo acumulado do
  mês (positivo = fez mais horas, verde; negativo = a compensar, vermelho).
  Calculado a partir do atraso/extra de cada dia com jornada, ignorando dias
  abonados por justificativa aprovada.
- **Fechamento de competência**: na Conferência de Ponto, o RH/Admin escolhe
  um mês e fecha. Depois de fechada, novas justificativas (inclusive ajuste
  de ponto) para datas daquele mês são bloqueadas, com aviso claro. Reabrir
  é possível (só owner/rh), pedindo um motivo que fica registrado. A lista
  mostra todas as competências fechadas/reabertas.

Requer rodar sql-ponto-db/05-banco-horas-competencia.sql no banco de PONTO e
reimplantar a Edge Function "ponto".

## v0.79.0 — Relatório semanal de ponto reflete os abonos
O PDF do relatório semanal agora considera as justificativas aprovadas: um
dia abonado (atestado, falta justificada, etc.) deixa de contar atraso ou
saída antecipada no cálculo daquela pessoa — igual já acontecia na tela de
Ponto do colaborador. Dias sem batida mas abonados aparecem marcados como
"abon." na grade, em vez de "·" (que passa a significar só ausência não
justificada). A hora extra, se houver, continua contando normalmente.

Requer reimplantar a Edge Function "ponto" (nova opção todaEmpresa na ação
justificativa_abonos, para o relatório buscar os abonos de todos de uma vez).

## v0.78.4 — Correção: seleção do tipo de justificativa ficava bagunçada
Ao trocar o "Tipo" na tela de Justificativas, o select não guardava a
seleção: a cada re-renderização voltava para a primeira opção, mesmo com os
campos abaixo já tendo mudado — dando a impressão de bagunça. Corrigido: o
tipo escolhido agora fica guardado corretamente, e o select mostra a opção
certa sempre.

## v0.78.3 — Atestado médico abona automaticamente
Justificativa do tipo atestado médico agora é aprovada automaticamente ao
enviar (não conta como falta e não espera decisão do gestor) — é um direito,
não uma falta a julgar. O RH/gestor continua vendo o atestado na lista, com o
selo "Abonado", e pode reverter (rejeitar) caso a foto seja inválida. Os
demais tipos (falta, atraso, ajuste) seguem precisando de aprovação.

Requer reimplantar a Edge Function "ponto".

## v0.78.2 — Justificativas: quantidade de dias + foto simplificada
- Novo campo "Quantos dias?" (digitável) nas justificativas de falta e
  atestado — permite justificar um período (ex: viagem de 3 dias) num pedido
  só. A quantidade aparece nas listas do colaborador e do gestor.
- A foto do atestado passou a ter só o botão "Tirar foto ou escolher da
  galeria" (o seletor nativo, que funciona bem no celular). O botão de câmera
  ao vivo, que estava com bug, foi removido.

Requer rodar sql-ponto-db/04-justificativas-dias.sql no banco de PONTO (só
adiciona a coluna qtd_dias) e reimplantar a Edge Function "ponto".

## v0.78.1 — Correção: foto do atestado não abria a câmera
O botão "Tirar foto do atestado" não fazia nada: a câmera era acionada antes
do elemento de vídeo existir na tela (a ordem estava trocada). Corrigido — a
câmera abre em vez de travar, com botão Cancelar e o mesmo plano B de câmera
do ponto (tenta traseira, depois qualquer câmera). Também foi adicionada a
opção "Escolher da galeria" (o seletor de arquivo, que no celular abre a
câmera nativa ou a galeria) como alternativa mais confiável.

## v0.78.0 — Justificativas e abonos de ponto
Funcionalidade completa de justificativas/abonos:
- Na tela de **Ponto**, o colaborador tem um card "Justificativas e abonos"
  onde cria pedidos: falta (dia inteiro), atraso/saída antecipada,
  esquecimento de bater ponto (com o horário correto), ou atestado médico
  (com foto do documento pela câmera). Ele acompanha o status de cada pedido.
- Na **Conferência de Ponto** (RH/gestor), uma seção lista os pedidos, mostra
  o atestado (clicável para ampliar) e permite aprovar ou rejeitar, com
  filtro por status.
- Quando **aprovada**, a justificativa **abona o dia**: o cálculo de atraso na
  tela de Ponto passa a ignorar aquele dia (a hora extra, se houver, continua
  contando a favor). Aprovar/rejeitar é permitido a owner, RH e gestor.

Requer: rodar sql-ponto-db/03-justificativas.sql no banco de PONTO, criar o
bucket privado "atestados-ponto" nesse projeto, e reimplantar a Edge Function
"ponto". Observação: o abono já vale na tela de Ponto do colaborador; refletir
o abono também no relatório semanal (por empresa) fica para um ajuste seguinte.

## v0.77.3 — Câmera do ponto mais robusta (plano B de câmera)
O scanner de QR exigia estritamente a câmera traseira, o que fazia alguns
celulares/navegadores falharem por completo (dando "câmera ocupada" mesmo sem
estar). Agora, se a câmera traseira não abrir na primeira tentativa, o sistema
lista as câmeras do aparelho e usa a traseira pelo nome — ou a primeira
disponível — em vez de desistir. Isso resolve casos em que a câmera não abria
mesmo após fechar apps e reiniciar.

## v0.77.2 — Mensagem de câmera ocupada mais clara
Quando a câmera do ponto (QR/selfie) não abre por estar ocupada por outro app
(WhatsApp, Zoom, Meet, outra aba), a mensagem agora diz isso claramente e
orienta a fechar esses apps ou reiniciar o aparelho — em vez do genérico "não
foi possível abrir a câmera". Também melhora as mensagens de permissão negada.
(As telas de Justificativas estão em desenvolvimento e ainda desativadas.)

## v0.77.1 — Correção: mensagem "atualizando" escondida atrás do botão
As mensagens (toasts), incluindo a de "atualizando dados", apareciam no mesmo
canto do botão fixo de atualizar e ficavam escondidas atrás dele. Agora o
toast aparece acima do botão e por cima dele, ficando sempre visível.

## v0.77.0 — Pesquisa de clima anônima
A pesquisa de clima (eNPS) passou a ser anônima. A nota e o comentário são
salvos SEM ligação com quem respondeu — o admin/RH vê só as respostas e os
comentários, nunca o nome de quem escreveu. Para não perder o controle, quem
já respondeu fica numa lista separada (só IDs, sem nota nem comentário),
usada apenas para impedir resposta dupla e mostrar a participação (X de Y
colaboradores). O colaborador vê um aviso de que a resposta é anônima, para
responder com sinceridade. Sem mudança de banco (a estrutura vive no state).

## v0.76.1 — Dashboard: card de ranking de colaboradores
Novo card "Ranking de colaboradores" no dashboard, no mesmo estilo do card de
Ponto: dois mini-cards lado a lado — "Melhores" (top 3, verde) e "Precisam de
atenção" (os 3 de menor nota, vermelho) — cada um listando nome e nota do
último diagnóstico. Aparece quando há pelo menos 2 colaboradores avaliados.

## v0.76.0 — Estrutura: cards de resumo clicáveis
Os quatro cards do topo da Estrutura Organizacional (Unidades, Departamentos,
Setores, Colaboradores) ficaram clicáveis, como no dashboard. Ao clicar, abre
logo abaixo uma lista com os detalhes: para Unidades/Departamentos/Setores, o
nome, código, responsável e quantos colaboradores; para Colaboradores, cada
pessoa e onde trabalha (unidade e setor). Clicar de novo fecha; o card ativo
fica destacado.

## v0.75.1 — Planilhas de importação com colunas na largura certa
Os modelos de importação (colaboradores e cargos) agora têm cada coluna
ajustada automaticamente à largura do maior nome que ela contém — nomes
longos (ex: "Coordenador Administrativo") deixam de ficar cortados ou
espremidos. Colunas curtas respeitam uma largura mínima, e há um teto para
não ficarem exageradas. A planilha fica limpa e legível.

## v0.75.0 — Meu Cargo e Meu Desenvolvimento para todos os papéis
As telas "Meu Cargo" e "Meu Desenvolvimento" passaram a ser acessíveis a
todos os papéis (Administrador, RH, Líder e Colaborador), não só colaborador
e líder. Quem tiver um cargo próprio vinculado vê o descritivo/o
desenvolvimento; quem não tiver (comum em contas de RH/Admin que só
gerenciam) vê o aviso pedindo a vinculação. Nenhuma mudança de banco.

## v0.74.1 — Correção: Meu Cargo não mostrava o conteúdo (cargos antigos)
Na tela "Meu Cargo", o descritivo (responsabilidades, KPIs, competências)
aparecia vazio para cargos criados antes das mudanças recentes, embora o PDF
mostrasse tudo. Causa: cargos antigos guardam os itens das listas como
objetos ({nome}, {texto}...) e a tela só lia strings. Agora a tela aceita os
dois formatos (string e objeto), então o cargo aparece completo dentro do
sistema, para cargos antigos e novos. O botão de PDF continua igual.

## v0.74.0 — Botão "Voltar" automático em todas as telas
Todas as telas (menos o painel) agora têm um botão "Voltar" no topo, que
retorna à tela anterior — como o botão voltar do navegador. É automático: o
sistema guarda o histórico de navegação e o botão volta na ordem certa; se
não houver para onde voltar, vai ao painel. O botão manual que havia sido
adicionado à tela de Acompanhamento foi substituído por esse global.

## v0.73.3 — Botão "Voltar ao painel" na tela de Acompanhamento
A tela de Acompanhamento (PDIs e Avaliações) ganhou um botão "Voltar ao
painel" no topo, para retornar ao dashboard sem precisar usar o menu.

## v0.73.2 — Cards de Equipe e Ponto com a mesma altura
Ajuste visual: os cards "Equipe" e "Ponto — últimos 30 dias", que ficam lado
a lado no dashboard, agora têm a mesma altura (antes o de Ponto ficava mais
alto, com espaço vazio embaixo).

## v0.73.1 — Fim do banner "alguém atualizou"; botão discreto de atualizar
O aviso "Alguém mais atualizou os dados da empresa" deixou de aparecer como
banner que interrompe. No lugar, um botão discreto e fixo "Atualizar" no
canto inferior direito, sempre disponível — a pessoa atualiza quando quiser.
Quando outra pessoa salva algo, o botão ganha só um pontinho pulsante de
aviso, sem atrapalhar. No celular vira apenas o ícone.

## v0.73.0 — Dashboard: card de Equipe e resumo de ponto menor
Novo card "Equipe" no dashboard: total de colaboradores cadastrados e
quantos são Líderes/Gestores (por papel de login), com o percentual da
equipe em liderança. O card de "Ponto — últimos 30 dias" ficou menor: agora
divide a linha lado a lado com o card de Equipe (ocupa metade da largura em
vez da tela toda), sem reduzir a fonte. Quando o módulo de Ponto está
desligado, o card de Equipe ocupa a linha inteira.

## v0.72.1 — Dashboard mais limpo: KPIs clicáveis
Removidos do dashboard os dois cards de lista grandes ("PDIs — quem está
fazendo" e "Avaliações — quem fez") e os rankings de colaboradores, que
estavam poluindo a tela. Em vez disso, os KPIs "Colaboradores avaliados" e
"PDIs em andamento" ficaram clicáveis: clicar abre a tela de Acompanhamento
já na aba certa (Avaliações ou PDIs), com a lista completa. O gráfico de
Desempenho por setor foi mantido e agora ocupa a largura toda.

## v0.72.0 — Tela de Acompanhamento (PDIs e Avaliações completos)
Os cards "PDIs em andamento" e "Avaliações" no dashboard agora mostram só um
resumo (top 6) e ganharam um botão "Ver todos os colaboradores →" que abre a
tela nova de Acompanhamento. Nela, duas abas: uma lista TODOS os
colaboradores com o status do PDI (Concluído / Em andamento / Não iniciado /
Sem PDI) e outra com o status da avaliação (Avaliado / Pendente / Não
iniciada) — com quem falta no topo, pra facilitar a cobrança. A tela é
acessada pelos botões, não ocupa espaço no menu.

## v0.71.1 — Tela de entrada comercial desativada (temporário)
A landing comercial (planos + teste grátis) foi desativada por ora — o
sistema volta a abrir direto no login, como antes. O código da landing
continua no projeto (js/35-tela-entrada.js); para religar, basta trocar
renderLogin() por renderTelaAuth() na inicialização (js/19-auth.js). Nada
foi apagado.

## v0.71.0 — Dashboard do Admin reorganizado
Substituições no dashboard do Administrador conforme pedido:
- "Desempenho por dimensão" (tabela) → **gráfico de desempenho por setor**
  (nota média de cada setor, barras coloridas por nível).
- "Oportunidades de desenvolvimento" → **ranking dos melhores colaboradores**
  (tabela com posição, nome, cargo e nota).
- Novo card **"PDIs — quem está fazendo"**: lista de colaboradores com o
  progresso (X/Y ações) e status (Concluído / Em andamento / Não iniciado).
- Novo card **"Avaliações — quem fez e quem falta"**: lista de colaboradores
  com o status da avaliação (Feita / Pendente / Não iniciada), com os
  pendentes no topo para facilitar a cobrança.

## v0.70.0 — "Meu Desenvolvimento": colaborador acompanha o próprio PDI
Nova tela "Meu Desenvolvimento" no menu do colaborador (e do gestor),
reunindo: o PDI (plano de desenvolvimento com as ações, prazos e status), a
situação da autoavaliação, e o resultado da avaliação. Regra importante de
RH: o resultado/nota só é liberado ao colaborador DEPOIS que o gestor realiza
a reunião de feedback — antes disso, mostra um aviso de que os números virão
acompanhados da conversa. Junto com a tela "Meu Cargo" (já existente), o
colaborador passa a ter transparência total sobre função e desenvolvimento.
Sem mudança de banco.

## v0.69.0 — Dashboard: ranking de colaboradores e cores corrigidas
- Novo card "Melhores e piores colaboradores" no dashboard do Administrador:
  ranking por nota do último diagnóstico de cada pessoa, com os 3 melhores
  desempenhos (verde) e os 3 que precisam de atenção (vermelho), lado a lado.
- Correção das cores em "Desempenho por dimensão": a coluna agora mostra o
  Nível (Baixo/Médio/Alto) seguindo o desempenho — baixo em vermelho, médio
  em laranja, alto em verde. Antes a coluna "Impacto" invertia os rótulos e
  causava a impressão de "baixo aparecendo verde".

## v0.68.1 — Importação por planilha mais fácil (nomes reais + tolerância)
O "não encontrado" na importação de colaboradores acontecia porque os nomes
de Unidade, Setor e Gestor na planilha precisavam bater exatamente com o
cadastro. Duas melhorias:
- O modelo de colaboradores agora vem com os dados REAIS da empresa: a linha
  de exemplo usa nomes que existem, e uma aba "Nomes válidos" lista todos os
  cargos publicados, unidades, setores e gestores para copiar sem errar.
- A validação passou a ignorar acentos, maiúsculas/minúsculas e espaços
  extras — "unidade central " agora bate com "Unidade Central". A natureza do
  cargo na importação de cargos também ficou tolerante a acento.

## v0.68.0 — Teste grátis de 7 dias (entrada comercial + aprovação + bloqueio)
Funcionalidade completa de teste grátis:
- **Tela de entrada comercial** antes do login: hero, os três planos com
  destaque nos preços (Gestão em evidência) e um formulário "Solicitar teste
  grátis de 7 dias". Quem já é cliente clica em "Entrar" e vai ao login normal.
- **Solicitação**: grava em `solicitacoes_teste` e envia e-mail de aviso ao
  INETRIS (via Resend).
- **Aprovação no painel do Super Admin**: nova seção lista as solicitações;
  ao aprovar, o sistema gera um código de licença de teste (7 dias) e envia
  e-mail com o código para o solicitante. A empresa nasce com a data de
  expiração calculada (trigger).
- **Durante o teste**: banner no dashboard mostrando os dias restantes e
  atalho para os planos.
- **No dia 8**: o login é bloqueado automaticamente (dados preservados), com
  mensagem para assinar.
- **Exclusão manual e segura**: empresas com teste expirado ganham um botão
  "Apagar dados" no painel do Super Admin, com dupla confirmação (digitar o
  nome). Nada é apagado automaticamente. Usa uma função SQL restrita a Super
  Admin. Coluna "Teste" mostra a situação de cada empresa (Teste · Xd,
  Expirado, Pagante).

Requer rodar sql/24-teste-gratis.sql no projeto principal.

## v0.67.0 — Planos reais e limite de colaboradores
Os planos foram atualizados para os valores reais: Essencial (até 10 · R$
297,00/mês), Gestão (11 a 30 · R$ 597,00/mês) e Estratégico (31 a 60 · R$
997,00/mês) — exibindo o preço de cliente novo. O limite de colaboradores de
cada plano passou a valer de verdade: o cadastro de colaborador é bloqueado
ao atingir o teto do plano, com mensagem clara pedindo upgrade (fale com o
INETRIS). A importação em lote respeita o mesmo teto (importa só até
preencher as vagas). A tela de Colaboradores mostra um indicador "Plano X: N
de LIMITE colaboradores (restam Y)". Empresa sem plano definido usa Essencial
(até 10) como padrão. Os nomes de plano no cadastro da empresa foram
atualizados (Essencial/Gestão/Estratégico).

## v0.66.0 — "Meu Cargo": colaborador vê o descritivo da própria função
Nova tela "Meu Cargo" no menu do colaborador (e do gestor), mostrando o
desenho completo do próprio cargo em modo leitura: missão, responsabilidades,
cultura e postura, requisitos, competências, ferramentas, KPIs, condições e
carreira — com botão para baixar o PDF. Dá transparência sobre o que se
espera da função, reduzindo o "isso não é minha obrigação". Só exibe o
conteúdo se o desenho estiver publicado; se ainda for rascunho ou não houver
cargo atribuído, mostra um aviso claro. Sem mudança de banco.

## v0.65.0 — Card de Ponto no dashboard do Admin
O dashboard do Administrador (e do RH) ganhou um card de Ponto com os
últimos 30 dias: atraso médio e hora extra média por colaborador, mais
quantos colaboradores tiveram atraso e quantos fizeram hora extra. Considera
só quem tem jornada cadastrada. O card carrega em segundo plano — aparece
com "carregando…" e se atualiza sozinho quando os dados chegam, sem deixar a
abertura do dashboard mais lenta. Só aparece se o módulo de Ponto estiver
habilitado para a empresa. Reaproveita a Edge Function existente (sem
redeploy) e as funções de cálculo da tela de Ponto.

## v0.64.0 — Desenho de cargo: imprimir/PDF e importar por planilha
Duas novidades na Base de Cargos e no Desenho:
- Botão "Imprimir / PDF" na tela do Desenho de Cargo: gera um PDF completo
  só daquele cargo (identificação, missão, responsabilidades, cultura e
  postura, requisitos, competências, ferramentas, KPIs, condições e
  carreira) — pronto pra salvar ou imprimir.
- Importação de cargos por planilha (Excel/CSV): um card novo na Base de
  Cargos com "Baixar modelo" e seleção de arquivo. Preenche-se um cargo por
  linha (campos de lista separados por ";"), o sistema mostra um preview
  validado e importa os cargos como rascunho para revisão/publicação do
  Desenho. Mesmo padrão da importação de colaboradores. Word não é importado
  direto (formato livre, frágil) — o caminho é converter o Word em planilha
  antes e usar o modelo.

## v0.63.1 — Novo subtítulo do sistema
O subtítulo passou de "Sistema de Avaliação e Desempenho" para "Sistema de
Gestão de Pessoas", mantendo o título "INETRIS". Atualizado no menu lateral,
tela de login, cabeçalho dos e-mails e título da aba do navegador. As
expressões "Metodologia NORTE" e "Ciclo NORTE" seguem inalteradas.

## v0.63.0 — Abertura mais rápida (consultas em paralelo no login)
O sistema demorava 5-10s para abrir porque, ao entrar, fazia seis consultas
ao servidor em fila — cada uma esperando a anterior. Agora, depois de buscar
o perfil (que as demais precisam), as consultas independentes (checagem da
empresa, super admin, dados do sistema e usuários) rodam todas em paralelo
com Promise.all, e as notificações carregam em segundo plano sem travar a
tela. O tempo de abertura passa a ser o da consulta mais lenta, não a soma de
todas. A verificação de empresa suspensa continua acontecendo antes de exibir
qualquer tela, então a segurança não muda. Observação: o plano Pro do Supabase
não afetaria isso — o gargalo era a sequência de consultas, não o banco.

## v0.62.0 — PDI de Mentalidade (perguntas novas) e avaliação estruturada pelo NORTE
Duas frentes:

PDI de Mentalidade — os textos de orientação dos três pilares (Conhecimento,
Ambiente, Relacionamento) foram atualizados com as perguntas reflexivas mais
diretas ("Como avalio meu conhecimento atual para o desempenho da minha
função?", etc.), incluindo Prazo estimado e Responsável. Continua opcional.

Avaliação por cargo — os itens de avaliação deixaram de ser cópia crua das
atividades e passam a ser perguntas avaliativas bem formuladas, alinhadas ao
pilar NORTE de cada nível: N (Nível Técnico) "Com que domínio técnico o
colaborador...?", O (Operação) "Com que consistência e organização...?", R
(Resultado/comportamental) "Em que medida o colaborador demonstra a
competência...?". Os verbos das atividades (que a CBO traz no infinitivo) são
conjugados para a 3ª pessoa, deixando as perguntas naturais. Tudo continua
editável e respeitando os ciclos já abertos (RN024).

## v0.61.2 — Correção: competências apareciam como "[object Object]"
As competências comportamentais geradas do CBO estavam sendo criadas como
objetos, mas o campo do desenho espera uma competência por linha (texto).
Por isso apareciam como "[object Object]". Corrigido: agora vêm como texto
limpo. Também blindei o gerador de indicadores para nunca mais produzir
"[object Object]", aceitando tanto texto quanto objeto.

## v0.61.1 — CBO: rascunho automático dos campos que faltavam
Ao usar um cargo do CBO, o Desenho agora também vem com rascunho gerado nos
campos que a CBO não fornece: Missão, Formação Acadêmica, Experiência
Profissional, Conhecimentos Técnicos, Condições de Trabalho e Perspectivas
de Carreira — textos genéricos de ponto de partida, montados a partir do
título, família e áreas de atividade, que a empresa revisa e ajusta.
Idiomas, Ferramentas/Sistemas e KPIs continuam em branco de propósito
(são específicos da empresa — gerar isso seria inventar). Somado ao que já
vinha (responsabilidades por área e competências comportamentais reais),
agora quase todo o desenho já vem preenchido ao escolher o cargo.

## v0.61.0 — CBO: áreas de atividade e mais campos preenchidos
A base do CBO passou a incluir as "áreas de atividade" (o agrupamento
temático das atividades). Com isso, ao usar um cargo do CBO, o Desenho de
Cargo vem com muito mais coisa preenchida automaticamente:
- Responsabilidades organizadas por área (cada área vira um marcador em
  maiúsculas, com suas atividades embaixo), em vez de uma lista solta.
- Competências comportamentais preenchidas a partir da área "Competências
  pessoais" da CBO.
- Área/família ocupacional preenchida no campo de identificação.
- Um bloco visível "Vínculo oficial da CBO" no topo do desenho, mostrando
  código, título oficial, família, sinônimos e áreas — deixando claro o
  vínculo oficial e a diferença para o nome interno do cargo.

Continua valendo o aviso honesto: formação, experiência e condições de
trabalho NÃO vêm nos arquivos de download da CBO (só no site/PDF), então
esses campos seguem em branco para a empresa preencher.

## v0.60.1 — Correção: base do CBO travando em "Carregando"
O carregador da base oficial do CBO podia ficar preso em "Carregando… (só na
primeira vez)" para sempre quando o download falhava ou não era reconhecido,
porque não havia timeout nem tratamento de falha no modo de espera. Agora o
carregamento tem timeout de 45s, confirma que os dados foram realmente
reconhecidos após o download, remove tentativas anteriores presas, e em caso
de erro destrava a tela e mostra uma mensagem clara em vez de girar sem fim.

## v0.60.0 — Avaliação gerada automaticamente a partir do cargo
A empresa não precisa mais cadastrar perguntas/indicadores de avaliação à
mão. Ao criar um cargo, o sistema monta a avaliação sozinho — 5 indicadores
por nível (N, O, R): N (Conhecimento) a partir dos conhecimentos técnicos /
atividades técnicas da CBO; O (Organização) a partir das responsabilidades /
atividades; R (Relações) a partir das competências comportamentais. Usa a
base oficial da CBO quando o cargo veio dela; senão, usa o desenho do cargo.

A geração acontece ao criar o cargo pela CBO e ao publicar o desenho (quando
ainda não há indicadores). Na tela de Desenho, a seção de indicadores passou
a explicar que é automática e ganhou o botão "Gerar automaticamente do
cargo" — os itens continuam totalmente editáveis (ajustar, remover,
acrescentar). Nada muda nos ciclos já abertos, que seguem seu retrato
congelado (RN024).

## v0.59.0 — PDI de Mentalidade: opcional e com orientação completa
O PDI de Mentalidade deixou de ser obrigatório (a antiga regra RN020): os
avisos de "pendente/obrigatório" foram removidos do dashboard, do
diagnóstico e do relatório, e nada mais é bloqueado por causa dele. O
módulo continua disponível em todo ciclo, agora rotulado como opcional.

Cada um dos três pilares ganhou o texto de significado e as orientações de
preenchimento fornecidas pela metodologia (como texto de apoio e como
placeholder de cada campo — "Onde estou hoje?", "Onde preciso chegar?", "O
que vou fazer?"), o que resolve o conteúdo que estava raso. O terceiro
pilar passou a ser exibido como "Relacionamento" (o campo interno segue
sendo o mesmo, para não afetar dados já salvos).

## v0.58.0 — Integração com a base oficial da CBO (2.725 ocupações)
Incorporada a base oficial da Classificação Brasileira de Ocupações (CBO2002,
arquivos do Ministério do Trabalho): 2.725 ocupações com código, título
oficial, família ocupacional, sinônimos (outras denominações) e atividades.
Na tela de Cargos, uma seção nova "Consultar a base oficial da CBO" permite
pesquisar por nome, código ou denominação alternativa. Ao escolher uma
ocupação, o sistema cria um cargo já vinculado: guarda código, título oficial
e família em cargo.cboOficial (o nome interno começa igual ao oficial, mas é
editável), e traz as atividades da CBO como responsabilidades iniciais do
desenho — que a empresa personaliza normalmente.

Por questão de peso (a base tem ~8 MB), o arquivo de dados NÃO é carregado
junto com o sistema: ele é baixado sob demanda na primeira busca da tela de
Cargos e fica em cache do navegador, mantendo a home leve. Os 42 cargos-modelo
detalhados que já existiam continuam disponíveis como material rico para
importar; a base oficial é um complemento para busca e vínculo.

## v0.57.2 — Marca d'água calibrada para ultrawide
Ajuste fino da marca d'água para o monitor ultrawide 2560x1080 (21:9): agora
ela é dimensionada pela altura da tela, com um ajuste específico para telas
muito largas, ficando na posição e proporção do print de referência tanto no
ultrawide quanto em telas 16:9.

## v0.57.1 — Marca d'água consistente entre telas
A marca d'água (a rede de moléculas ao fundo) era posicionada com valores
fixos em pixels, então só ficava bonita numa resolução específica — em
telas maiores ou menores aparecia deslocada ou cortada. Agora ela é ancorada
à direita e escala com a largura da tela, ficando igual ao layout de
referência em qualquer monitor, e mais discreta no celular.

## v0.57.0 — Conferência de Ponto (RH vê as fotos)
Nova tela "Conferência de Ponto" (menu Pessoas, só RH/Admin): uma tabela
com as batidas do período mostrando o nome da conta de login, data e hora,
tipo (entrada/saída), se foi validada por QR, e a foto (selfie) de cada
batida. Dá pra filtrar por período, agrupar por colaborador e clicar na
foto pra ampliar. Antes as selfies só eram acessíveis baixando pastas no
Storage do Supabase; agora o RH confere tudo dentro do sistema. As imagens
vêm por URL assinada temporária (o bucket continua privado — a foto não
fica exposta publicamente). A Edge Function ganhou a ação "conferencia" e
precisa de redeploy.

## v0.56.1 — Estrutura: botão "Adicionar estrutura" no topo
Acrescentado o botão azul "Adicionar estrutura" no canto superior direito da
tela (como na referência), ao lado do título. Ele abre/fecha o formulário de
novo nível hierárquico, que antes ficava sempre visível como um card. O
botão "Expandir tudo" (com ícone) foi mantido junto da árvore.

## v0.56.0 — Estrutura com cards de resumo e novo nome do sistema
A tela de Estrutura Organizacional ganhou quatro cards de resumo no topo
(Unidades, Departamentos, Setores, Colaboradores) e um botão "Expandir
tudo / Recolher tudo" ao lado da árvore, no estilo da referência enviada.
A árvore hierárquica (com avatares e responsáveis) foi mantida.

O nome principal do sistema passou de "NORTE" para "INETRIS — Sistema de
Avaliação e Desempenho" no menu lateral, na tela de login, no cabeçalho dos
e-mails e no título da aba. As expressões "Metodologia NORTE" e "Ciclo
NORTE" foram mantidas onde apareciam, conforme solicitado.

## v0.55.0 — Super Admin edita o link de pagamento das empresas
Agora o link de pagamento de cada empresa é editável direto no painel do
Super Admin (seção "Cobrança por WhatsApp"): um campo por empresa com botão
"Salvar link". Assim você controla os links de todas as empresas de um lugar
só, sem precisar entrar no cadastro de cada uma. O WhatsApp continua sendo
o dono da empresa quem preenche. Para não abrir um buraco de segurança
(dar escrita ampla ao Super Admin), a gravação passa por uma função SQL
(super_admin_definir_link_pagamento) que altera SÓ esse campo e só roda pra
Super Admin. Requer rodar sql/23-super-admin-link-pagamento.sql no projeto
principal.

## v0.54.1 — Correção: WhatsApp/link não apareciam no Super Admin
Na seção "Cobrança por WhatsApp", as empresas apareciam como "sem WhatsApp"
e "sem link" mesmo com os dados preenchidos. Causa: os dados da empresa
ficam aninhados em `payload.empresa` dentro do blob salvo, e o painel os
lia da raiz do payload. Corrigido para ler de `payload.empresa` (tanto na
tabela quanto no botão de cobrança).

## v0.54.0 — Cobrança por WhatsApp no painel do Super Admin
Novo campo "WhatsApp de cobrança" no Cadastro da Empresa. E no painel do
Super Admin, uma seção "Cobrança por WhatsApp": lista todas as empresas com
seu WhatsApp, status de pagamento e se têm link configurado, com um botão
"Cobrar via WhatsApp" por empresa. O botão monta a mensagem com o link de
pagamento da InfinitePay já pronto e abre o WhatsApp (wa.me) para você
conferir e enviar — semi-automático, sem API paga e sem risco de banimento.
Empresas sem WhatsApp ou sem link aparecem com o botão desabilitado. O
Super Admin já lia o payload de todas as empresas (métricas), então não foi
preciso mexer em permissões de banco.

## v0.53.0 — Pagamento (Fase 1): planos e link da InfinitePay
Primeira fase do pagamento dentro da plataforma. No Cadastro da Empresa, um
campo novo guarda o link de pagamento da InfinitePay daquela empresa. E uma
tela nova "Pagamento" (menu Base, só o Administrador da empresa) mostra os
planos (Essencial, Profissional, Enterprise), destaca o plano contratado,
exibe valor e status, e traz o botão "Pagar mensalidade" que abre o link da
InfinitePay. Por enquanto a confirmação do pagamento é manual (o status vem
de faturamento.statusPagamento); a automação por webhook fica para a Fase 2,
quando a documentação do webhook da InfinitePay estiver disponível. Nenhuma
mudança de banco — tudo mora no faturamento que já existia no state.

## v0.52.2 — Relatório de ponto: resumo da empresa em bloco separado
O total geral da empresa saiu da linha de rodapé e virou um bloco próprio
embaixo da grade ("Resumo da empresa na semana"), com os números em
destaque: total de horas trabalhadas, total de atrasos e total de horas
extras da equipe. Fica igual à estrutura de dois blocos (detalhe em cima,
consolidado embaixo) do restante dos relatórios do sistema.

## v0.52.1 — Relatório de ponto: linha de TOTAL GERAL
Adicionada uma linha "TOTAL GERAL" no rodapé da grade semanal, somando toda
a empresa: total de horas por dia, total de horas da semana, total de
atrasos e total de horas extras da equipe inteira. Assim o RH vê o
individual (cada linha) e o consolidado da empresa num relatório só.

## v0.52.0 — Relatório de ponto em grade semanal
O PDF do consolidado semanal foi reformatado: em vez de uma linha por dia
com as batidas, agora é uma grade com uma linha por colaborador e uma
coluna por dia (Seg a Dom) mostrando as horas trabalhadas naquele dia (com
almoço já descontado; "·" nos dias sem batida). No fim de cada linha, três
colunas fecham a semana: Total de horas, Atrasos (em vermelho) e Extras (em
verde). O PDF passou a sair em paisagem para caber os sete dias com folga.
Fica muito mais fácil bater o olho e ver quem trabalhou em quais dias.

## v0.51.1 — Correção do menu lateral (grupos travados)
Corrigido o bug em que um grupo do menu "não respondia ao comando": quando
o grupo continha a tela aberta no momento, ele ficava forçado a permanecer
aberto — tentar fechá-lo pelo cabeçalho não fazia nada, porque a lógica o
reabria na hora. Agora um clique explícito no cabeçalho do grupo tem
prioridade: fecha mesmo que contenha a tela atual, e reabre normalmente.
Ao navegar para um item, o grupo dele volta a aparecer aberto como esperado.

## v0.51.0 — Totem: só o Administrador
A tela "Totem de ponto" (que exibe o QR Code do local) passou a ser
exclusiva do Administrador (owner) da empresa — o RH deixou de vê-la no
menu. A restrição vale também no servidor: a ação `qr_atual` da Edge
Function agora só gera o código para o owner, então nem forçando a URL um
RH consegue exibir o QR. Ligar/desligar a segurança em Configurações
continua acessível a RH e Admin (só a exibição do totem foi restrita).
Requer redeploy da Edge Function "ponto".

## v0.50.1 — Ponto: mensagens claras quando a câmera não abre
O painel de escanear passava a impressão de estar "vazio" quando a câmera
falhava, porque o erro era engolido. Agora ele mostra na própria tela o
motivo — permissão negada, nenhuma câmera no aparelho (caso de PC sem
webcam), câmera em uso por outro app, ou biblioteca de leitura não
carregada — para o usuário saber o que fazer.

## v0.50.0 — Organização geral para celular
Passada ampla de responsividade, tratando os problemas na raiz em vez de
tela por tela: tabelas largas (colaboradores, relatórios, licenças) agora
rolam só na própria tabela sem espremer o card; todos os grids de 2/3/4
colunas (KPIs, jornada, papéis do totem, módulos) empilham em 1 no celular;
as barras de ação e a busca do topo ocupam a largura toda e empilham;
campos de formulário viram 100% de largura com fonte 16px (evita o zoom
automático do iOS ao focar); botões ganham alvo de toque de no mínimo 44px;
relógio do ponto, KPIs e o QR do totem foram redimensionados para caber bem.
Inclui um ajuste extra para telas bem estreitas (≤ 380px).

## v0.49.1 — Correção: QR do totem não aparecia
A biblioteca de geração de QR escolhida na 0.49.0 (pacote `qrcode`) é feita
para uso com empacotador e não expunha o `QRCode` global quando carregada
direto no navegador — por isso o totem não desenhava o código. Troquei pela
`qrcodejs` (feita para rodar direto no browser) e ajustei a chamada para a
API dela. Testado: gera o QR com o token do servidor corretamente.

## v0.49.0 — Ponto seguro: QR do local + selfie
Novo: a empresa pode exigir que o ponto só seja batido presencialmente,
escaneando um QR Code exibido na entrada, e/ou com uma selfie na hora.

- **Totem** (nova tela, só RH/Admin): exibe um QR Code que se renova sozinho
  a cada poucos segundos. É pra deixar aberto num tablet/monitor na entrada.
- **Bater ponto**: quando o QR é exigido, o colaborador abre a câmera, lê o
  código do totem e (se exigido) tira uma selfie; só então a batida é
  registrada. Quem tenta de fora não consegue — o código do momento só
  existe na tela da empresa.
- **Configurações → Segurança do Ponto**: chaves liga/desliga para "exigir
  QR" e "exigir selfie".
- **Segurança de verdade, no servidor**: o QR é um token assinado por tempo
  (HMAC) com um segredo por empresa que o navegador nunca vê — mora numa
  tabela sem acesso do cliente (sql/22-ponto-seguranca.sql), lida só pela
  Edge Function. A validação acontece no servidor, não dá pra burlar pelo
  front. As selfies vão para um bucket de Storage privado no banco de ponto.

Requer, uma vez: rodar sql/22-ponto-seguranca.sql no projeto principal;
rodar sql-ponto-db/02-seguranca-batida.sql e criar o bucket "selfies-ponto"
no projeto de ponto; e reimplantar a Edge Function "ponto". Também passa a
carregar duas bibliotecas (geração e leitura de QR) via CDN no index.html.

Observação honesta: nenhuma trava só-software é infalível (o print do QR
compartilhado em tempo real é o furo possível) — a selfie existe justamente
para cobrir esse caso. Para valor jurídico pleno, o caminho é um REP
homologado (hardware).

## v0.48.1 — Jornada: horários digitáveis
Os campos de horário da jornada (entrada, saída e almoço) deixaram de ser o
seletor de relógio do navegador e viraram campos de texto, pra digitar
direto. Aceita vários formatos e arruma sozinho ao salvar: "8" vira 08:00,
"830" vira 08:30, "1300" vira 13:00, "8h30" vira 08:30. Valor inválido
(ex: 25:00) é descartado. Vale no cadastro e no editor "Jornada".

## v0.48.0 — Jornada agora tem intervalo de almoço
A jornada do colaborador ganhou dois campos novos: início e fim do almoço
(ex: 12:00 às 13:00), preenchíveis no cadastro e no editor "Jornada" da
lista de colaboradores. Deixar os campos vazios significa "sem almoço".

O almoço é descontado automaticamente das horas trabalhadas: como a pessoa
não bate ponto no intervalo, o sistema desconta a parte do almoço previsto
que cai dentro do período trabalhado. A regra é robusta — se um dia a
pessoa bater ponto na saída/volta do almoço, o intervalo não é descontado
em dobro; e uma saída no meio do horário de almoço desconta só a parte
sobreposta. Vale na tela de Ponto (total do dia, gráfico dos 7 dias) e no
PDF semanal do RH. Nenhuma mudança de banco — jornada é config no state.

## v0.47.0 — Ponto liga/desliga por Empresa (na geração da licença)
Antes o módulo de Ponto aparecia pra toda Empresa, sempre. Agora é uma
chave por Empresa, decidida pelo Super Admin na hora de gerar o código de
licença: a tela "Super Admin — Empresas" ganhou um campo sim/não
("Habilitar o módulo de Ponto para esta empresa"), e a lista de códigos
disponíveis passou a mostrar uma coluna Ponto (Sim/Não).

A escolha viaja com o código: quando a Empresa-cliente usa o código no
cadastro, a trigger de criação copia a flag pra Empresa nova. No login, o
sistema lê `empresas.ponto_habilitado` e só mostra o menu "Ponto" (e libera
a rota) se estiver ligado. Requer rodar sql/21-ponto-por-empresa.sql no
projeto principal — ele adiciona as colunas, atualiza a trigger e, para não
quebrar quem já usava, marca todas as Empresas EXISTENTES como
ponto_habilitado = true (só as novas nascem desligadas por padrão).

## v0.46.0 — Ponto ligado à jornada do colaborador
Cada colaborador agora tem uma jornada prevista (entrada, saída e tolerância
em minutos), editável na tela de Colaboradores — no cadastro e num botão
"Jornada" por linha da lista. É dado de configuração, então fica no
cadastro dentro do state (banco principal), não no banco de ponto.

Com isso, o ponto passa a comparar a batida real com o previsto:
- Na tela "Ponto", um card novo mostra a entrada e a saída de hoje com um
  selo de "No horário", "X de atraso", "+X extra" ou "X antes", já
  descontada a tolerância. Quem ainda não tem jornada cadastrada vê um
  aviso pedindo pro RH definir.
- No PDF semanal do RH, a tabela ganhou colunas de Atraso e Extra por dia,
  e o resumo por pessoa passou a mostrar total de atrasos e de horas extras
  na semana. Quem bate ponto sem ter cadastro/jornada aparece como
  "s/ jornada" nessas colunas, sem quebrar o relatório.

## v0.45.2 — Ponto: relógio agora anda em tempo real
Correção: o relógio da tela de Ponto estava "congelado" na hora em que a
tela abria — só mostrava a hora certa se a pessoa saísse e voltasse (era um
texto desenhado uma vez, sem nada atualizando). Agora ele anda a cada
segundo (passou a mostrar também os segundos), atualizando só o próprio
texto, sem redesenhar a página. O timer se desliga sozinho quando a pessoa
sai do Ponto (quando o elemento some do DOM), então não fica rodando à toa
nas outras telas. De quebra, ao sair e voltar pro Ponto os dados são
recarregados — útil se a pessoa bateu ponto em outro dispositivo.

## v0.45.1 — Ponto: layout reorganizado
Tela "Ponto" redesenhada, seguindo os mesmos componentes visuais já usados
no resto do sistema (`.kpi-card-inetris`, ícones em SVG no estilo Feather,
paleta e tipografia da identidade INETRIS) — sem inventar um estilo novo:
- Card principal com relógio maior, e o botão "Bater ponto" como o único
  elemento em destaque da tela (assinatura visual da página).
- Três KPIs ao lado do relógio: horas trabalhadas hoje, última batida, e
  total dos últimos 7 dias.
- Gráfico de barras dos últimos 7 dias (novo — a Edge Function "ponto"
  ganhou a ação `periodo`, que busca um intervalo livre de datas da
  própria pessoa, generalizando a ação `hoje`).
- Histórico de hoje virou uma linha do tempo com ícones de entrada/saída,
  em vez da tabela simples de antes.

## v0.45.0 — Ponto passa a viver num banco de dados separado
Reversão de arquitetura da v0.44.0: os registros de ponto (`registros_ponto`)
saem do projeto Supabase principal e passam a viver num **projeto Supabase
totalmente separado**, criado só para isso (ver sql-ponto-db/01-schema.sql)
— o motivo direto foi o banco principal já estar pesado, e ponto ser
justamente o tipo de dado que mais cresce (2+ linhas por pessoa, todo dia).

Como o navegador só tem sessão de login do projeto principal (nunca deve
ter chave do banco de ponto), a ligação entre os dois passa a ser feita
por uma Edge Function nova, `supabase/functions/ponto/index.ts`: ela
confere a sessão da pessoa no projeto principal (quem é, qual empresa,
qual papel) e só então lê/grava no projeto de ponto, usando a
service_role key dele — guardada como secret da função, nunca exposta no
front-end. `js/29-page-ponto.js` (bater ponto) e `exportarPontoSemanalPDF`
em `js/20-page-relatorios.js` (PDF do RH) passaram a chamar essa função
em vez de acessar `registros_ponto` direto — o `sql/20-registros-ponto.sql`
da v0.44.0 foi removido, não roda mais no banco principal.

## v0.44.0 — Novo módulo: Ponto
Nova tela **Ponto** (grupo "Pessoas", visível pra todo mundo, qualquer
papel) — cada pessoa bate a própria entrada/saída, com relógio e total do
dia. Diferente do resto do sistema, os registros NÃO ficam dentro do JSON
de `dados_sistema`: é uma tabela própria (`registros_ponto`,
sql/20-registros-ponto.sql), pelo mesmo motivo já registrado no
ALERTA-ESCALABILIDADE.md — é um evento de alto volume, todo dia, pra todo
mundo, e inflaria o blob rapidamente. A tabela é append-only (mesmo
princípio da tabela `auditoria`): ninguém, nem o Administrador, pode
alterar ou apagar uma batida já registrada pelo próprio banco (sem
política de UPDATE/DELETE) — só RLS de SELECT (a própria pessoa, ou
RH/Administrador vendo a empresa toda) e INSERT (só em nome de si mesmo).

Em Relatórios, novo tipo **"Ponto — consolidado semanal (PDF)"**: RH ou
Administrador escolhe a segunda-feira da semana e baixa um PDF com todas
as batidas da empresa naquela semana, agrupadas por colaborador, com o
total de horas de cada um — mesmo padrão client-side (jsPDF + autotable)
já usado nos outros relatórios em PDF do sistema, sem infraestrutura nova.

## v0.43.8 — Marca d'água mais pra esquerda
Deslocada mais pra esquerda — mostra bem mais da estrutura da logo do
que antes. Confirmei visualmente antes de fechar.

## v0.43.7 — Marca d'água recalibrada pra bater com a referência
Comparando com a referência enviada, entendi o efeito certo: a logo é
gigante o bastante pra o CENTRO dela ficar fora da tela, à direita — só
uma fatia esparsa da borda esquerda aparece, com folgas (a própria logo
tem espaços vazios na estrutura dela). Renderizei várias combinações de
tamanho/posição lado a lado com a referência (mesma largura de tela,
1456px) até chegar numa versão bem mais próxima do efeito esparso.

Como isso foi calibrado visualmente a partir de um print (não de um
valor exato), pode não bater 100% ainda — se precisar de mais ajuste
fino (mais alto/baixo, mais fatia visível ou menos), é só apontar a
direção que eu corrijo.

## v0.43.6 — Marca d'água mais pra direita e maior (1700px)
Empurrada mais pra direita (menos sobreposta com os cartões) e aumentada
de 1300px pra 1700px. Confirmei visualmente antes de fechar.

## v0.43.5 — Marca d'água bem maior (1300px)
Aumentada de 620px pra 1300px, ocupando bem mais do espaço vazio à
direita. Regenerei a imagem de origem na resolução original (1254px, a
imagem enviada) em vez de reaproveitar a versão de 900px de antes, pra
não borrar com esse tamanho maior — mesma técnica de compressão de
paleta reduzida, ficou em 33KB mesmo nessa resolução total.

Nesse tamanho, a marca d'água pode se estender além da parte visível da
tela em monitores mais baixos — isso é esperado nesse tamanho grande (a
parte que mais aparece, perto dos cartões do topo, é a que mais
importa). Confirmei visualmente antes de fechar.

## v0.43.4 — Bug corrigido: marca d'água cortada (só 2 bolinhas apareciam)
Reportado com print real: só 2 bolinhas douradas apareciam no topo, em
vez da logo inteira. Causa: a marca d'água (1100px) estava centralizada
verticalmente (`center`) num espaço que só existe de verdade em telas
bem altas — em monitores mais baixos/widescreen (como o do print), a
imagem ficava maior que a altura da tela, cortada por cima e por baixo,
sobrando só um pedacinho visível.

Corrigido: tamanho reduzido pra 620px (cabe em qualquer tela comum,
mesmo mais baixa) e posição fixada a partir do topo, em vez de
centralizada — garante que a logo inteira sempre aparece, independente
da altura da tela de quem está usando.

Testei renderizando na mesma proporção larga e baixa do monitor do
print antes de fechar, pra confirmar que não corta mais.

## v0.43.3 — Marca d'água maior (1100px)
Aumentada de 760px pra 1100px. Como a imagem de origem tinha sido salva
num tamanho menor pra economizar espaço, aumentar só no CSS deixaria
borrado — regenerei a imagem de origem em resolução mais alta antes de
aumentar. No processo, comprimi com paleta reduzida (a logo só usa
navy/dourado/branco/transparente, então 32 cores é mais que suficiente)
— o arquivo caiu de ~310KB pra ~24KB nesse tamanho maior, sem perda
visível de nitidez.

Confirmei visualmente antes de fechar.

## v0.43.2 — Marca d'água: logo navy/dourado, maior, no lado direito
Trocada a marca d'água pra usar a mesma logo navy/dourado da barra
lateral (fundo tornado transparente), em vez da versão cinza clara
anterior. Aumentada (760px) e reposicionada — antes ficava só no canto
superior direito, agora fica centralizada verticalmente no lado direito,
no espaço mais vazio da tela.

Confirmei visualmente o resultado antes de fechar.

## v0.43.1 — Marca d'água simplificada: só uma logo grande
Ajuste direto: em vez de 4 cópias em tamanhos diferentes espalhadas, agora
é só uma logo grande (640px), uma única vez, no canto superior direito.
Confirmei visualmente antes de fechar.

## v0.43.0 — Marca d'água implementada
Logo em tons claros (já com fundo transparente) conectada como marca
d'água — várias cópias em tamanhos diferentes, espalhadas no canto
superior direito da área de conteúdo, em baixa opacidade, atrás de todo
o resto. Nunca aparece na barra lateral (o fundo branco sólido dela
cobre por cima) nem atrapalha a leitura dos cartões (que também têm
fundo branco sólido — a marca d'água só aparece nos espaços vazios entre
eles).

Detalhe técnico: como JavaScript não consegue manipular pseudo-elementos
(`::before`) diretamente, a imagem foi conectada através de variáveis
CSS (`--marca-dagua-1` a `--marca-dagua-4`), definidas uma vez na
inicialização — não em toda tela nova, só quando o sistema abre.

Renderizei o resultado real (barra lateral + conteúdo) num navegador
antes de fechar, ajustando a opacidade pra ficar discreta o bastante
pra não competir com o conteúdo.

## v0.42.2 — Logo trocada (a antiga tinha ficado invisível)
Confirmado o motivo: a logo anterior tinha sido feita pra aparecer bem
num fundo escuro — quando o sistema passou pro tema claro (v0.35.0), a
barra lateral virou branca e a logo ficou praticamente invisível (fundo
claro em cima de fundo claro).

Logo nova conectada, já pronta pra fundo branco. Processamento aplicado
antes de conectar: fundo quase-branco da imagem original convertido pra
transparente de verdade (em vez de deixar um quadrado branco sólido por
trás), garantindo que funcione bem mesmo se o fundo ao redor não for
100% branco puro — confirmado pixel a pixel antes de fechar.

Ainda falta a versão da logo pra marca d'água, que a empresa vai mandar
separado.

## v0.42.1 — Bug corrigido: trocar "Ver como" parecia não fazer nada
Reportado: escolher outro papel no "Ver como (pré-visualização)" não
mudava nada na tela, a não ser que a pessoa clicasse manualmente em
"Dashboard" depois. Causa: `setRole()` só trocava o papel guardado, sem
levar pro Dashboard — em qualquer outra tela que não muda de aparência
conforme o papel, parecia que a troca não tinha funcionado (mesmo tendo
funcionado por baixo dos panos).

Corrigido: trocar o papel agora já leva direto pro Dashboard daquele
papel, sem precisar clicar em mais nada. Testei a lógica isoladamente
antes de fechar.

## v0.42.0 — Menu lateral em acordeão + busca de verdade
Dois ajustes pedidos direto:

**1) Menu lateral menos poluído.** Os grupos (Fundação, Cargos, Pessoas,
Ciclo NORTE, Base) agora aparecem só pelo nome — clicar num grupo expande
e mostra as opções dele, clicar de novo recolhe. O grupo que contém a
tela em que você está aberto automaticamente, pra não se perder ao
navegar — os outros ficam fechados até você clicar.

**2) Busca do cabeçalho agora funciona.** Antes estava propositalmente
desativada (nenhuma busca tinha sido implementada ainda). Agora: digita
o nome de um colaborador e aperta Enter — leva pra tela de Colaboradores
já filtrada por esse nome, com um aviso mostrando o filtro ativo e um
botão pra limpar. Funciona tanto pra quem vê todos os colaboradores
(Admin/RH) quanto pra quem só vê a própria equipe (Gestor/Líder) — cada
um filtra dentro do que já tem acesso.

A busca só aparece pra quem tem acesso à tela de Colaboradores — um
Colaborador comum não veria o campo, porque pra ele buscar outra pessoa
resultaria só num erro de acesso, sem utilidade real.

Testei a lógica do filtro isoladamente (busca com correspondência,
busca vazia, busca sem resultado) e confirmei visualmente o menu
recolhido/expandido e a busca habilitada antes de fechar.

## v0.41.1 — Menu lateral menos poluído: "Ver como" em dropdown
O seletor "Ver como (pré-visualização)" — visível só pro Administrador,
usado para testar a visão de RH/Gestor/Colaborador — ocupava 4 linhas
inteiras no topo do menu lateral, com o mesmo peso visual da navegação
real embaixo. Trocado por um dropdown compacto (uma linha só, mesma
função) — o menu de navegação agora aparece bem mais rápido e menos
poluído visualmente.

Confirmei o resultado renderizando o CSS real antes de fechar (antes:
4 linhas cheias · depois: 1 linha).

## v0.41.0 — Valores exatos do documento identidade-visual-inetris.html
Diferente das vezes anteriores (print e prompt de texto), esse era um
documento HTML de verdade — com CSS extraível, não só interpretável.
Corrigidas as diferenças que ainda restavam, agora com precisão exata:

- **Cor de borda** (`--line`): #E3E6EB (era #E5E7EB — bem próximo, mas
  não idêntico).
- **Sombra dos cartões**: adicionada a sombra exata do documento
  (`0 1px 2px rgba(13,27,51,.04), 0 8px 24px rgba(13,27,51,.06)`) —
  antes os cartões não tinham nenhuma sombra.
- **Cantos dos cartões**: 16px (era 12px) — o documento usa 3 níveis de
  raio (6/10/16px) e os cartões externos usam o maior.
- **Painéis internos** (dentro de um cartão, ex.: os gráficos do
  dashboard): corrigido pra fundo branco com borda — estavam com fundo
  cinza claro sem borda.
- **Cores do gráfico de 5 dimensões**: valores exatos da seção "Telas de
  referência" do documento (a versão real de tela, não a decorativa) —
  Nível Técnico #2563EB · Operacional #0EA5E9 · Resultado #16A34A · Time
  #7C3AED · Evolução #65A30D. A linha que conecta os pontos voltou a ser
  azul com preenchimento azul claro (documento usa isso na tela real,
  diferente do cinza neutro que eu tinha usado antes).

Confirmei que o mecanismo de cor personalizada por empresa (white-label)
continua funcionando normalmente — os valores fixos agora são só o
padrão de fábrica, sobrescrito automaticamente quando uma empresa
escolhe suas próprias cores.

Renderizei o resultado final (sombra + cores do radar) com o CSS e o
Chart.js reais antes de fechar.

## v0.40.0 — Detalhes pixel a pixel da referência (sem mudar a metodologia)
Pedido explícito: copiar a referência sem alterações. Importante: a
referência é um guia de estilo, e o próprio manual diz que não deve ser
replicado pixel a pixel — a escala de 0 a 5 com 5 níveis
(Excelente/Bom/Regular/Atenção/Crítico) e os nomes de exemplo (Ana
Martins, Carlos Souza) são ilustrativos, não a metodologia real. Copiar
isso literalmente mudaria a metodologia NORTE (0 a 1, 3 níveis:
Iniciar/Desenvolver/Alavancar) e mostraria dados fictícios em vez dos
reais.

O que dava pra copiar pixel a pixel — e não tinha sido feito ainda —
foi implementado agora:

- **Sparkline** no card "Resultado geral", com a evolução dos últimos
  meses.
- **Barra de progresso com meta** no card "Colaboradores avaliados"
  ("Meta: 90%").
- **PDIs em andamento** com duas linhas de nota ("Em progresso" +
  "Total de ativos: N"), igual à referência.
- **Ícone de informação** ao lado de "Desempenho por dimensão", com
  explicação ao passar o mouse.
- **Links "Ver todas..."** no rodapé das 3 tabelas (Dimensões,
  Oportunidades, Avaliações), levando pra tela correspondente.
- **Avatar com iniciais + menu de três pontos** em cada linha da tabela
  "Avaliações Recentes".

No caminho, encontrei e corrigi um erro que eu mesmo teria introduzido:
os links "Ver todas as dimensões"/"Ver todas as oportunidades" apontavam
pra rotas que não existem no sistema (`diagnosticos`, `pdis`, no plural)
— a rota certa é `diagnostico` (singular, tela combinada de
Diagnóstico & PDI). Corrigido antes de fechar.

Renderizei o resultado final com o Chart.js de verdade antes de entregar.

## v0.39.1 — Gráfico de rosca mais elegante
Refinamento visual nos 3 gráficos de "Classificação geral" (Admin, RH e
Gestor) — Iniciar/Desenvolver/Alavancar:

- Espaçamento entre as fatias (antes ficavam coladas).
- Pontas arredondadas em cada fatia, em vez de retas.
- Efeito sutil ao passar o mouse (a fatia "respira" um pouco).
- Texto central em duas linhas — o número em destaque, com um rótulo
  pequeno embaixo ("avaliados", "colaboradores", "na equipe", conforme o
  dashboard) — antes era só o número solto.

Confirmei o resultado renderizando o Chart.js de verdade antes de fechar.

## v0.39.0 — Ajustes finos conforme o Manual de Marca INETRIS
Revisão ponto a ponto contra o Manual de Marca completo (o prompt de
identidade visual), corrigindo diferenças reais que ainda restavam:

- **Cantos**: cartões agora 12px (estavam 10px), botões e campos de
  formulário agora 10px (estavam 8px e 7px) — valores exatos do manual.
- **Gráfico de 5 dimensões, cor por dimensão**: o manual pede uma cor
  própria pra cada uma das 5 dimensões (Nível Técnico: azul · Operação:
  azul petróleo · Resultado: verde · Time: roxo suave · Evolução: verde
  claro) — antes o radar inteiro era só azul. Agora cada ponto do radar
  tem a cor certa, e a linha que conecta os pontos passou pra um cinza
  neutro, pra não competir visualmente com as cores dos pontos.
- **Ícone de estrela**: estava preenchido (sólido) — o manual pede ícones
  de traço fino (outline), então corrigido pra contorno.
- **Cabeçalho**: o manual especifica que deve conter busca, notificações,
  empresa, usuário e avatar — faltava o nome da empresa, adicionado.

Testei a lógica de cor por dimensão isoladamente (incluindo o caso de
uma dimensão sem dado) e renderizei o radar com as cores reais antes de
fechar, confirmando visualmente.

## v0.38.0 — Dashboard mais fiel à referência: cabeçalho, tabelas e colunas exatas
Ajustes finos pra aproximar ainda mais da imagem de referência enviada:

- **Cabeçalho de topo novo** (só na tela de Dashboard) — título, subtítulo,
  campo de busca, sino de notificações (reaproveitando o que já existia)
  e avatar com as iniciais de quem está logado.
- **"Desempenho por Dimensão" e "Oportunidades de desenvolvimento"**
  viraram duas tabelas lado a lado, com as colunas exatas da referência
  (Dimensão/Resultado/Impacto e Dimensão/Oportunidade/Prioridade) — antes
  eram duas tabelas com estrutura diferente uma da outra.
- **"Avaliações Recentes"** ganhou as colunas "Área" (setor do
  colaborador) e "Dimensão" (a dimensão com pior resultado naquele ciclo
  — Resultado, Comportamento ou Potencial) — antes só tinha
  Colaborador/Cargo/Avaliador/Nota/Status/Data.

Testei a lógica de "pior dimensão" isoladamente (incluindo o caso de uma
dimensão sem dado ainda) e renderizei o cabeçalho + tabelas com o CSS
real antes de fechar.

## v0.37.0 — Dashboards do RH e do Gestor também reconstruídos
A v0.36.0 só tinha reconstruído o Dashboard do Administrador na estrutura
da referência — RH e Gestor continuavam com o layout antigo (cartões de
KPI simples, sem ícone, sem o gráfico de 5 dimensões). Essa versão aplica
o mesmo tratamento nos outros dois:

- **RH**: cartões de KPI com ícone (Avaliações em andamento, Pendências
  de avaliador, PDIs ativos, Colaboradores sem risco), gráfico de 5
  dimensões (empresa toda) ao lado da Classificação Geral, e
  "Competências críticas" virou tabela (antes era gráfico de barra, que
  cortava nomes longos).
- **Gestor**: mesmo padrão, com o gráfico de 5 dimensões calculado só com
  a própria equipe (não a empresa toda) — o ranking de Potencial e a
  tabela de evolução da equipe continuam como estavam, sem mudança.

Cores dos gráficos de rosca (Iniciar/Desenvolver/Alavancar) dos dois
dashboards também corrigidas — ainda usavam os tons antigos (antes da
v0.35.0), mesmo depois da troca de identidade.

## v0.36.0 — Dashboard do Administrador reconstruído no layout da referência
A v0.35.0 trocou as cores, mas o layout continuava o antigo. Essa versão
reconstrói o Dashboard do Administrador seguindo a estrutura exata da
referência que a empresa mandou (imagem do guia visual INETRIS), com
dados reais do NORTE:

- **3 cartões de KPI com ícone** — Resultado Geral (média da empresa,
  0 a 1, com a classificação IDA embaixo), Colaboradores Avaliados (%),
  PDIs em Andamento.
- **Gráfico de 5 dimensões (N·O·R·T·E) como elemento principal** — agora
  em nível consolidado da empresa inteira (antes só existia por ciclo
  individual, na tela de Diagnóstico).
- **Distribuição das Avaliações** — rosca com total no centro, mesma
  posição da referência.
- **Tabela "Desempenho por Pilar"** — média e classificação de cada um
  dos 5 pilares.
- **Tabela "Oportunidades de desenvolvimento"** — cargos com maior
  concentração de "Iniciar" (reaproveita o indicador 7.5 que já existia).
- **Tabela "Avaliações Recentes"** — colaborador, cargo, avaliador, nota,
  status e data dos últimos ciclos consolidados.

Os gráficos antigos que não faziam parte da referência (comparação por
trimestre, evolução mensal, gauge de PDI, ranking de cargos em gráfico)
foram removidos dessa tela — as informações mais importantes continuam
disponíveis nas tabelas novas.

Usei ícones SVG embutidos no código (não uma fonte de ícones externa) —
adicionar uma fonte de ícones inteira só pra 3 ícones seria o mesmo tipo
de problema de performance que já corrigimos na v0.30.0 (bibliotecas
pesadas carregando sem necessidade).

Testei os cálculos (média geral da empresa, média por pilar) isoladamente,
e renderizei o resultado final com o Chart.js de verdade antes de fechar.

## v0.35.0 — Nova identidade visual INETRIS
Implementação da identidade visual documentada no Manual do Sistema
INETRIS (Seções 7 a 10) — mudança grande, de tema escuro pra um tema
claro, com azul só como destaque pontual (princípio central do manual:
"o sistema não deve ser azul — azul é assinatura e interação, não massa
visual").

- **Paleta de cores** — fundo agora branco/cinza muito claro, cartões
  brancos com borda cinza suave, azul (#2563EB) usado só em botões,
  menu selecionado, links e números-chave. Cores funcionais realinhadas:
  Vermelho #EF4444 (Iniciar), Âmbar #F59E0B (Desenvolver), Verde #16A34A
  (Alavancar) — direto do manual.
- **Tipografia** — Inter agora cobre também os títulos (antes usava
  Space Grotesk pra isso).
- **Logo** — atualizado pro logo oficial do Instituto INETRIS.
- **Gráfico das 5 dimensões (N·O·R·T·E)** — o elemento visual "assinatura"
  do manual, implementado na tela de Diagnóstico (resultado individual),
  reaproveitando os dados já calculados (`pilarMedia`) — mantém a
  escala real do NORTE (0 a 1, IDA de 3 níveis), sem trocar pela escala
  de 0 a 5 do manual, já que isso mudaria a metodologia em si, não só a
  aparência.

**Dois bugs reais corrigidos no processo:**
1. Um mecanismo de contraste que eu tinha construído antes (v0.29.0)
   assumia que a barra lateral seria sempre escura, e clareava cores
   escolhidas pela empresa que fossem escuras demais. Com o fundo agora
   branco, a lógica precisava ser o oposto — corrigida e renomeada
   (`--gold-on-dark` → `--gold-on-light`), testada com os casos
   extremos (branco puro, por exemplo).
2. O item selecionado do menu lateral não batia com o manual (usava
   cinza claro com texto escuro, em vez de azul claro com texto azul) —
   corrigido, confirmado visualmente.

Além disso, corrigidas ~15 cores fixas espalhadas pelo CSS e por 3
arquivos JS (gráficos, e-mails, tags de pilar) que tinham tons claros
demais, pensados só pra funcionar num fundo escuro — ficariam
ilegíveis no fundo branco novo.

**Validação**: renderizei o CSS e os componentes reais (não só teoricamente)
num navegador headless antes de fechar, incluindo o menu lateral, os
cartões de diagnóstico, o gráfico de 5 dimensões e os avisos — confirmando
contraste e legibilidade em cada um.

## v0.34.0 — Líder, RH e Administrador também podem ser avaliados
Até aqui, só quem tinha papel de sistema "Colaborador" podia ter um ciclo
de avaliação — Líder, RH e Administrador existiam só como contas de
acesso, sem vínculo a cargo/unidade/setor/gestor. Combinado o desenho
com você: quando um Líder é avaliado, quem faz o papel de "Líder" (peso
50%) é o gestor dele (outro Líder ou o Administrador); RH e
Administrador se avaliam mutuamente nesse mesmo papel.

**O que mudou:**
- **Vínculo de conta** (`js/13-page-colaboradores.js`): agora qualquer
  conta (não só papel "Colaborador") pode ser vinculada a um registro de
  colaborador — inclusive Líder, RH e Administrador. O rótulo do campo
  foi atualizado, mostrando o papel de cada conta na lista.
- **Trava de integridade**: impedido cadastrar (ou mover) alguém como
  gestor de si mesmo — isso anularia a avaliação por 3 pessoas (RN003),
  já que a mesma pessoa preencheria tanto a própria etapa quanto a do
  "Líder".
- **Permissões reescritas** (`js/14-permissions.js`): a lógica de quem
  pode preencher/ver cada etapa dependia do papel de sistema ser
  exatamente "colaborador"/"lider" — o que bloqueava completamente um
  Líder/RH/Admin de preencher a própria avaliação, mesmo depois de ter o
  vínculo. Agora depende da relação real com aquele ciclo específico (é
  a própria pessoa sendo avaliada? é o gestor cadastrado dela?), não do
  papel de sistema. Corrigido em 4 funções + uma dupla de funções
  duplicada/desatualizada encontrada em `js/15-page-ciclos-avaliacao.js`
  (usada pra registrar/validar evidência do PDI), com o mesmo problema.
- **Dashboard**: como Líder/RH/Admin não veem o dashboard de
  "Colaborador" (veem o próprio, de gestor/RH/admin), adicionado um
  aviso "Você também está sendo avaliado(a) neste ciclo" nesses
  dashboards quando aplicável — sem isso, a pessoa nunca ficaria sabendo
  que precisa agir, mesmo já podendo.

Testei isoladamente: autoavaliação de um Líder, gestor preenchendo a
etapa dele, e o bloqueio de auto-gestão — nos três casos, comportamento
esperado. CI completo (sintaxe, ESLint, Prettier) passando limpo.

## v0.33.0 — Explicação da escala IDA na tela de avaliação
Antes de lançar as notas (Iniciar/Desenvolver/Alavancar), a tela agora
mostra um aviso explicando o que cada letra significa — pra quem nunca
usou o sistema (ou esqueceu) entender antes de começar a avaliar, em vez
de precisar adivinhar ou perguntar pra alguém.

Adicionado nos dois modelos de avaliação (Assíncrono e Ao Vivo), como uma
função reutilizável (`explicacaoEscalaIDA()`) — se o texto precisar
mudar no futuro, é um lugar só pra ajustar, não dois.

## v0.32.1 — Bug corrigido: nomes longos cortados nos gráficos de barra
Reportado com print real do dashboard do RH: nomes de competência
("Colaboração e trabalho em equipe", "Ética nas relações de trabalho"
etc.) apareciam cortados no meio do texto — o espaço da coluna do
gráfico não é largo o suficiente pra caber o nome inteiro, e o Chart.js
desenhava só o que cabia, sem nenhum aviso visual de que faltava parte
do nome. Esse era um bug diferente do da v0.31.1 (aquele era sobre
altura, esse é sobre largura).

Corrigido nos 3 gráficos de barra horizontal que podem ter nomes longos
(Competências críticas do RH, Cargos em risco do Admin, Potencial da
equipe do Gestor): o texto agora é encurtado de forma controlada, sempre
com "…" no final quando não cabe tudo — nunca mais corta no meio de uma
palavra sem aviso. **O nome completo continua aparecendo ao passar o
mouse** sobre a barra (o tooltip usa o texto original, não o encurtado).

Testei a lógica de truncamento isoladamente com os nomes reais do print,
e depois renderizei o Chart.js de verdade na mesma largura de cartão
usada no sistema, pra confirmar visualmente antes de fechar.

## v0.32.0 — Árvore organizacional: navegação progressiva (só Unidade de cara)
Ajuste na árvore, refinando a v0.31.0: agora, ao abrir a tela, **só as
Unidades aparecem** — Departamento, Setor e Equipe ficam escondidos até
alguém clicar pra expandir. Antes, a árvore inteira já vinha toda aberta
de uma vez, o que ficava poluído em empresas com muitos níveis.

- Clicar numa **Unidade** revela o que tem dentro dela (Departamento,
  Setor, Equipe) — mas não mostra colaboradores direto nesse nível, já
  que Unidade é só o local físico (reforçado na v0.31.0).
- Clicar num **Departamento, Setor ou Equipe** revela os colaboradores
  vinculados ali (e, se tiver, os níveis ainda mais internos).

O contador de colaboradores no cabeçalho de cada nó continua aparecendo
sempre, mesmo fechado — só a lista detalhada é que fica escondida até
expandir.

Confirmei visualmente o comportamento (estado inicial só com Unidades, e
o passo a passo de expansão) renderizando o HTML/CSS de verdade num
navegador antes de fechar.

## v0.31.1 — Bug corrigido: gráfico de barras cortando informação
No dashboard do RH, "Competências críticas mais recorrentes" (e também,
pelo mesmo motivo, "Cargos com mais Iniciar" no Admin e "Potencial da
equipe" no Gestor) usava uma altura fixa de 150px pro gráfico, pensada
pra poucos itens — mas esses gráficos podem mostrar até 6 barras, com
nomes de competência que costumam ser frases longas. Resultado: barras
espremidas e informação cortada.

Corrigido: a altura do gráfico agora é calculada de acordo com a
quantidade real de itens (mínimo de 110px, crescendo conforme mais
barras aparecem), em vez de um valor fixo pra todo caso. Renderizei o
Chart.js de verdade, comparando lado a lado a versão antiga (fixa) com a
nova (dinâmica), usando nomes de competência realistas, pra confirmar a
diferença antes de fechar.

## v0.31.0 — Árvore organizacional: clique pra ver colaboradores + clareza sobre "Unidade"
Dois ajustes na Estrutura Organizacional, a partir de um print real do
sistema em uso:

**1) Clicar em qualquer nó agora mostra os colaboradores dele.** Cada
nível (Unidade, Departamento, Setor, Equipe) ganhou um contador
("· 3 colaboradores") e expande a lista com nome, iniciais e cargo ao
clicar. Como colaboradores só se vinculam diretamente a Unidade e Setor
(Departamento e Equipe são níveis puramente estruturais), clicar num
Departamento ou Equipe junta automaticamente todos os colaboradores dos
Setores dentro dele — não precisa entrar setor por setor pra ver o
time completo. Testei essa lógica isoladamente nos 4 tipos de nível
antes de fechar, incluindo o caso de colaboradores inativos (não contam)
e Equipe sem Setor descendente (mostra vazio, comportamento esperado
dado como o vínculo funciona hoje).

**2) "Unidade" deixou de sugerir nome confuso.** O campo de nome agora
muda o texto de exemplo dependendo do tipo escolhido — pra Unidade,
sugere um local físico de verdade (ex: "Matriz São Paulo") em vez do
antigo "Unidade Rio de Janeiro", que incentivava repetir a palavra
"Unidade" dentro do próprio nome (a origem da confusão vista no print).
A descrição da página também reforça: Unidade é o local físico onde a
empresa funciona — os demais níveis organizam quem trabalha dentro dela.

Isso não renomeia nada que já existe — cargos/nomes já cadastrados
continuam como estão até alguém editar manualmente.

## v0.30.0 — Correção de performance: sistema demorando pra abrir
Relato: o NORTE começou a demorar mais pra abrir. Causa raiz encontrada:
4 bibliotecas externas pesadas (XLSX, jsPDF, jsPDF-autotable, Chart.js)
eram baixadas em **todo carregamento da página, pra todo mundo** — mesmo
um Colaborador que só ia responder uma autoavaliação e nunca exportaria
Excel/PDF nem veria um gráfico naquela sessão.

Corrigido: essas 4 bibliotecas agora carregam **sob demanda**, só no
momento em que a funcionalidade correspondente é realmente usada:
- Exportar Excel (Consolidado, Comparativo, importação em lote de
  colaboradores) → carrega XLSX nesse momento.
- Gerar qualquer PDF (Avaliação, PDI, Institucional, Dossiê) → carrega
  jsPDF nesse momento.
- Entrar num dashboard com gráfico (Admin, RH, Gestor, Colaborador) →
  carrega Chart.js nesse momento — o resto da tela já aparece normal,
  só os gráficos surgem com uma pequena espera na primeira vez daquela
  sessão (depois fica em cache do navegador, sem baixar de novo).

O Supabase continua carregando sempre, sem essa otimização — login e
dados básicos dependem dele em toda tela, então não faria sentido
adiar.

Implementado com `carregarScript()` (cria a tag `<script>` só quando
chamado, e guarda em cache pra nunca baixar a mesma biblioteca duas
vezes, mesmo se duas funções pedirem ao mesmo tempo — testei essa parte
isoladamente) + 3 funções de conveniência (`garantirXLSX`,
`garantirJsPDF`, `garantirChart`).

## v0.29.0 — Árvore Organizacional redesenhada
A árvore em Estrutura Organizacional era só uma lista de caixas simples,
com indentação e linha pontilhada. Redesenhada com visual de organograma
de verdade:

- **Ícone colorido por nível** (U/D/S/E) — cada tipo (Unidade,
  Departamento, Setor, Equipe) tem sua própria cor, com legenda no topo.
- **Conectores visuais** — linha vertical guia + "cotovelo" horizontal
  ligando cada nó ao pai, como um organograma de verdade, não só
  indentação com borda pontilhada.
- **Responsável com avatar** — iniciais num círculo, em vez de só texto.
- **Cartões com hover** — feedback visual mais claro de qual nível está
  sendo olhado.

**Testei visualmente antes de fechar** — renderizei o CSS de verdade num
navegador headless (Puppeteer) com dados de exemplo, em telas desktop e
mobile, pra confirmar que os conectores alinham certinho e nada quebra
em tela estreita.

Nesse processo, encontrei e corrigi um problema de acessibilidade que eu
mesmo ia introduzir: a primeira versão escondia o botão "Mover" até
passar o mouse por cima (hover) — funciona bem no computador, mas
**não existe hover em celular/tablet**, o que deixaria esse botão
impossível de encontrar em quem usa o sistema pelo celular. Corrigido
antes de fechar: o botão agora fica sempre visível.

## v0.28.1 — Nota numérica (0 a 1) agora aparece junto da classificação
Até agora, ao terminar uma avaliação, só a classificação (Iniciar /
Desenvolver / Alavancar) aparecia na tela e nos PDFs — a nota numérica de
0 a 1 já era calculada internamente pra decidir essa classificação, mas
nunca era mostrada pra ninguém.

Corrigido em 4 lugares, todos lendo o mesmo valor que já era calculado
(nenhum cálculo novo foi criado):
- **Tela de resultado do ciclo** (`diagnosticoSummaryHTML`) — geral, as 3
  Dimensões e os 5 pilares agora mostram a nota ao lado da classificação.
  Essa mesma função também é usada no dashboard do Colaborador, então o
  ajuste vale nos dois lugares.
- **PDF de Avaliação individual** — classificação geral com a nota, e
  nova coluna "Nota" na tabela de indicadores.
- **PDF do Dossiê completo** — mesmo ajuste, nas 3 Dimensões e na tabela
  de indicadores.

Quando um indicador não tem nota aplicável (ex.: ausência formal do
avaliador sem substituto), continua mostrando "—" em vez de um número
que não existe de fato — testei esse caso isoladamente antes de fechar.

## v0.28.0 — Relatório de avaliação em PDF agora com gráficos
O PDF de "Avaliação de Desempenho" (exportado depois de consolidar um
ciclo) só tinha texto e tabela. Agora inclui 2 gráficos, gerados a partir
do mesmo diagnóstico:

- **As 3 Dimensões** — barras com Resultado, Comportamento e Potencial.
- **Médias por pilar (N·O·R·T·E)** — ranking horizontal.

Como o jsPDF não sabe desenhar um gráfico do Chart.js diretamente (só
aceita imagens), a solução foi: desenhar o gráfico num `<canvas>`
temporário que nunca aparece na tela, "fotografar" esse desenho como PNG,
e colar essa imagem no PDF — o gráfico nunca existe de fato na interface,
só dentro do arquivo final.

Se algum pilar ou Dimensão não tiver indicador aplicável naquele cargo
(ex.: um cargo sem nenhum indicador do pilar E), ele simplesmente não
aparece no gráfico — em vez de mostrar uma barra zerada, que pareceria
uma nota ruim quando na real é "não se aplica". Testei esse cenário
isoladamente antes de fechar.

## v0.27.0 — Gráficos em todos os dashboards (RH, Gestor e Colaborador)
O painel visual com gráficos da v0.26.0 era só do Administrador. Agora
todo papel tem sua própria versão, com dados relevantes pro que cada um
precisa decidir — e cada dashboard ganhou pelo menos um gráfico novo que
não existia nem como tabela antes.

- **RH**: rosca de classificação geral, medidor de "% colaboradores sem
  risco" (novo — antes só existia a lista, sem visão consolidada), e
  ranking das competências críticas mais recorrentes (antes só tabela).
- **Gestor**: rosca de classificação da própria equipe (nova visão — antes
  só existia a tabela linha a linha), e ranking da equipe por Potencial
  (novo — reaproveita o mesmo cálculo que já alimenta o Mapa de Sucessão,
  agora também visível aqui).
- **Colaborador**: medidor mostrando quantas ações do próprio PDI de
  Desenvolvimento já foram concluídas no ciclo atual (novo).

Na implementação, encontrei um campo (`status` no PDI de Desenvolvimento)
que parecia ser o jeito certo de checar conclusão, mas na real nunca é
usado em lugar nenhum do sistema — a conclusão de verdade é marcada por
`validadoEm` (a data em que o Gestor/RH valida a evidência). Usei o campo
certo; o `status`/`atualizarStatusPDI()` parecem ser código morto de uma
versão anterior — não removi agora, mas vale uma limpeza futura.

Todos os gráficos novos passam pela mesma função central
(`inicializarGraficosDashboard`) — ela já verifica sozinha quais telas
estão na tela antes de montar cada gráfico, então não há conflito entre
os 4 dashboards.

Testei os cálculos de ranking (Gestor) e percentual de conclusão
(Colaborador) isoladamente antes de fechar.

## v0.26.0 — Dashboard do Administrador com gráficos de verdade
O dashboard do Administrador, que antes só mostrava tabelas, agora tem uma
seção visual com 6 gráficos — baseado num modelo de referência (estilo
"painel de controle" escuro, com medidor semicircular, rosca com total no
centro, ranking horizontal), adaptado com a identidade visual do próprio
NORTE (mesmo azul marinho e dourado já usados no sistema).

- **Classificação geral** — rosca com o total de colaboradores no centro,
  dividida por Iniciar/Desenvolver/Alavancar.
- **Ciclos: trimestre atual vs anterior** — barras comparando volume.
- **Evolução da média geral** — linha com os últimos 6 meses com
  diagnóstico.
- **Cargos com mais "Iniciar"** — ranking horizontal (indicador 7.5).
- **PDIs aprovados** — medidor semicircular com o percentual.
- **Cobertura por Unidade** — barras de progresso, % já avaliado.

Adicionado o **Chart.js** ao sistema (`index.html`) — nenhuma biblioteca
de gráficos existia até agora. Como gráficos precisam de código
JavaScript executado depois que o HTML já está na tela (diferente de
texto/tabela, que só precisa existir no HTML), foi criada uma função
(`inicializarGraficosDashboard`) chamada automaticamente pelo próprio
`render()` — sem isso, os `<canvas>` apareceriam vazios.

Nenhum cálculo foi refeito do zero — todos os números continuam vindo da
mesma lógica que já existia (distribuição IDA, cargos em risco, evolução
mensal), só reorganizados visualmente. As tabelas antigas equivalentes
foram substituídas pelos gráficos correspondentes.

**Sobre o PDI de Mentalidade no modelo Ao Vivo**: já corrigido na v0.25.2
(RH ganhou permissão de escrever, não só aprovar) — incluído nesta mesma
entrega. Se ainda aparecer bloqueado depois de atualizar pra esta versão,
é um problema novo, não o mesmo de antes — nesse caso, avise com um print
de qual campo especificamente.

## v0.25.2 — Bug corrigido: PDI de Mentalidade bloqueado no modelo Ao Vivo
No modelo assíncrono, quem escreve o PDI (Desenvolvimento e Mentalidade) é
o Colaborador e o Líder — o RH só aprova depois. A função que decide quem
pode editar (`podeConstruirPDI`) nunca incluía o RH, porque isso nunca
tinha sido necessário. No modelo Ao Vivo, porém, não existe essa fase
separada — os 3 decidem juntos na sessão presencial, e é o RH quem
registra tudo no sistema (a mesma pessoa que já lança a nota combinada).
Resultado: os campos do PDI de Mentalidade apareciam bloqueados pro RH,
sem ninguém conseguir preencher.

Corrigido em `js/15-page-ciclos-avaliacao.js`: RH também pode construir e
aprovar o PDI (Desenvolvimento e Mentalidade) quando o ciclo é do modelo
Ao Vivo — no modelo assíncrono, nada muda, continua exatamente como
antes. Testei os 4 cenários relevantes (RH em Ao Vivo, RH em Assíncrono,
Líder em Assíncrono, e PDI já aprovado bloqueando todo mundo) antes de
fechar.

## v0.25.1 — Revisão de código: 4 bugs reais encontrados e corrigidos
Pedido de revisão geral em cima da v0.25.0 (modelo "Ao Vivo"). Usei o CI
(sintaxe + ESLint) como primeira passada, depois revisão manual dos
pontos de maior risco — telas e funções que assumiam o fluxo de 3 etapas
do modelo assíncrono, sem considerar o modelo novo.

1. **Ciclo extraordinário (RN016) e dados de teste** desatualizados — o
   ciclo agendado automaticamente após uma promoção, e o gerador de dados
   de teste, ainda criavam o objeto de ciclo no formato antigo (sem
   `tipoAvaliacao` e sem `notas.consolidado`). Não quebrava nada na hora,
   mas deixava esses ciclos inconsistentes com o resto do sistema.

2. **Tela de "Pendência de Avaliador" com mensagem errada pra Ao Vivo** —
   quando o prazo de um ciclo Ao Vivo vencia, a tela mostrava a mensagem
   do modelo assíncrono ("etapa X não concluiu"), e oferecia "registrar
   ausência formal com redistribuição de peso" — um conceito que não
   existe no Ao Vivo (a sessão precisa dos 3 presentes, não tem como
   redistribuir peso de quem faltou). Agora mostra mensagem própria, só
   com a opção de estender o prazo e reagendar.

3. **RH nunca via ciclos Ao Vivo como pendência no Dashboard** — o
   cartão de "suas pendências" do RH filtrava por `etapa === 'rh'`, mas
   um ciclo Ao Vivo nunca muda de etapa (esse conceito não existe nesse
   modelo) — então o RH podia ter ciclos Ao Vivo esperando a nota
   combinada há dias, sem nenhum aviso no Dashboard.

4. **Colaborador via um botão sem saída em ciclo Ao Vivo** — o Dashboard
   do Colaborador mostrava "Sua autoavaliação está aguardando você" com
   um botão "Responder" também para ciclos Ao Vivo — mas ao clicar, a
   tela não deixa o Colaborador editar nada (só o RH registra a nota
   combinada nesse modelo). Removido esse aviso enganoso para Ao Vivo.

De brinde, corrigidos 2 campos de texto livre que tinham passado sem
escape na varredura de segurança da v0.23.0 (nome de colaborador na
lista de ciclos, e motivo de ausência formal).

Testei cada correção isoladamente (filtros de pendência com cenários
mistos dos dois modelos, incluindo retrocompatibilidade com ciclos
antigos sem `tipoAvaliacao` definido) antes de fechar. CI completo
(sintaxe + ESLint + Prettier) passando limpo.

## v0.25.0 — Novo modelo de avaliação: "Ao Vivo"
Até agora só existia um jeito de avaliar: 3 etapas separadas (Colaborador
→ Líder → RH), cada uma em um momento diferente, com média ponderada
25/50/25 (RN003). Agora existe um segundo modelo, escolhido na hora de
abrir cada ciclo — os dois convivem no sistema, empresa por empresa,
ciclo por ciclo.

**Modelo "Ao Vivo"**: os mesmos indicadores e a mesma escala IDA de
sempre, mas numa sessão presencial — Colaborador, Líder e RH se reúnem,
discutem cada indicador juntos, e chegam numa nota já combinada. Só o RH
(ou Administrador) registra essa nota no sistema — não existem 3 notas
separadas nem cálculo de peso aqui, é uma nota só, já acordada pelos 3.

- **Abrir novo ciclo**: novo campo "Modelo de avaliação" (Assíncrono ou
  Ao Vivo).
- **Tela Ao Vivo**: registro simples da sessão (data + confirmação de
  presença dos 3, não vinculante — só apoio de auditoria) antes de liberar
  a consolidação, e o lançamento da nota combinada por indicador.
- **Cálculo do diagnóstico**: para ciclos Ao Vivo, usa a nota combinada
  diretamente — o cálculo de peso 25/50/25 (RN003) não se aplica a esse
  modelo, por desenho, não é uma variação dele.
- **Lista de ciclos**: nova coluna "Modelo", mostrando Assíncrono ou Ao
  Vivo em cada linha.
- De brinde, corrigido um nome de colaborador que não estava escapado
  nessa mesma lista (risco de XSS que passou despercebido na varredura da
  v0.23.0).

Testei a lógica de cálculo isolada nos dois modelos (incluindo o caso de
um ciclo Ao Vivo ainda sem nenhuma nota lançada) — nenhum comportamento
antigo do modelo Assíncrono foi alterado.

## v0.24.1 — Natureza do cargo agora é editável no Desenho de Cargo
Lacuna encontrada: o campo "Natureza" (Operacional / Apoio / Estratégica)
só era definido na hora de importar um cargo da Base CBO ou criar do
zero — depois disso, não existia nenhum jeito de mudar, mesmo sendo
exibido na tela de Desenho de Cargo. Isso impedia, por exemplo, promover
um cargo pra "Estratégica" depois de já criado — necessário pra ele
aparecer no Mapa de Sucessão (v0.21.0), que só considera posições-chave
com essa natureza.

Adicionado um campo de seleção editável na seção "1. Identificação do
Cargo", salvo tanto ao gravar rascunho quanto ao publicar uma nova versão.

## v0.24.0 — CI: sintaxe, lint e formatação em todo push/PR
Até agora, nada impedia um código quebrado de ir pra `main` — cada
verificação dependia de eu (ou você) lembrar de testar manualmente antes
de subir. Agora existe um pipeline de CI (`.github/workflows/ci.yml`) que
roda automaticamente em todo `push` e Pull Request pra `main`, com 3
checagens: sintaxe de todo arquivo `.js`, ESLint (erros reais de código) e
Prettier (formatação consistente).

- **Bug real encontrado pelo ESLint**: `js/08-page-empresa.js` tinha uma
  variável (`e`) que não existia — quebraria o salvamento do Cadastro da
  Empresa toda vez que alguém salvasse, desde a v0.18.3. Corrigido pra
  usar `empresaAnterior` (o valor correto, já capturado antes na mesma
  função). Ninguém tinha notado ainda porque `node --check` (o que eu
  vinha fazendo manualmente) só pega erro de sintaxe, não esse tipo de
  referência a variável inexistente.
- **`package.json`, `.eslintrc.json`, `.prettierrc.json`**: configuração
  do projeto. O ESLint foi ajustado especificamente pra esse tipo de
  projeto (~29 arquivos JS sem sistema de módulos, compartilhando
  propositalmente o mesmo escopo global) — a lista de mais de 300
  funções/variáveis compartilhadas foi extraída automaticamente do
  próprio código, pra não dar falso positivo em cada uso legítimo entre
  arquivos.
- **Todo o código foi formatado pelo Prettier por padrão, uma única vez**,
  já que era a primeira vez que uma ferramenta de formatação entrava no
  projeto — confirmei que nenhuma correção de segurança (v0.23.0) foi
  alterada nesse processo, comparando antes/depois.
- **`README.md`**: nova seção explicando como rodar essas checagens
  localmente, e — importante — **como ativar a proteção de branch no
  GitHub** (passo manual, só quem tem acesso de administrador do
  repositório consegue fazer, que transforma isso de "só avisa" pra
  "impede o merge de verdade").

## v0.23.0 — Correções de segurança: XSS armazenado e tokens fracos
A partir de uma revisão de segurança externa, dois problemas de alto risco
foram identificados e corrigidos.

**1) XSS armazenado (stored XSS)** — quase toda a interface montava HTML
via interpolação direta de texto vindo de campos livres (nome de
colaborador, comentário, título, URL etc.), sem nenhum escape. Alguém
mal-intencionado podia colocar algo como `<img src=x onerror="...">` num
campo de texto livre, e esse código executaria na tela de **qualquer
pessoa que visse aquele texto depois** — inclusive RH ou Administrador,
um caminho de escalonamento de privilégio dentro da própria empresa.

Corrigido com duas funções novas em `js/02-core-helpers.js`:
- `escaparHtml()` — para texto de usuário indo pro meio do HTML.
- `escaparParaOnclick()` — para texto de usuário usado como argumento
  dentro de um `onclick`/`onchange` (precisa de tratamento em duas
  camadas: escape JavaScript primeiro, depois escape HTML — só usar
  `escaparHtml()` ali não bastava, e alguns lugares já tinham um escape
  manual incompleto que só tratava aspas simples, não aspas duplas).

Aplicado em praticamente todas as telas do sistema: Colaboradores,
Webhooks, Empresa, Cultura Organizacional, Desenho de Cargo (incluindo a
comparação entre versões), Base de Cargos, Ciclos de Avaliação (PDI,
Mentalidade, indicadores), Notificações in-app, Banco de Inteligência,
Pesquisa de Clima, Super Admin (incluindo a tabela de analytics entre
empresas), Auditoria (corrigido na origem — `nomePorPerfilId()` já
protege todos os lugares que a usam), Usuários & Acesso, Estrutura
Organizacional, Mapa de Sucessão, Diagnóstico & PDI, os 3 e-mails que o
sistema envia (convite, boas-vindas, avaliação pendente), o gráfico SVG
da Matriz 9-Box, e os dashboards de todos os papéis.

Testado com os 3 padrões de ataque reais: `<img onerror>` num campo de
texto, aspas duplas tentando quebrar um atributo `onclick`, e aspas
simples tentando quebrar a string JavaScript dentro do `onclick` — os
três ficaram neutralizados, e o caso legítimo (nome com apóstrofo, tipo
"O'Brien") continua funcionando normalmente.

**2) Tokens gerados com `Math.random()`** — não é criptograficamente
seguro, usado nos códigos de convite (`js/06-page-usuarios.js`) e de
licença de empresa (`js/23-page-super-admin.js`). Como esses códigos dão
acesso a criar conta/empresa na plataforma, trocado por
`crypto.getRandomValues()` — a mesma família segura que já era usada
corretamente em outro lugar (`uid()`, via `crypto.randomUUID()`). Mesmo
formato de código de antes, só a fonte de aleatoriedade mudou.

## v0.22.3 — Segundo bug de contraste corrigido (texto sumindo no menu "Ver como")
A correção da v0.22.2 resolveu o botão principal (fundo mudava de cor
junto com o texto), mas não cobria outro caso: em vários lugares — menu
"Ver como (pré-visualização)", abas de avaliador, rótulos "eyebrow" — a
mesma cor personalizável era usada como texto em cima do fundo **escuro e
fixo** da barra lateral (que nunca muda). Se a empresa escolhesse uma cor
também escura (ou parecida com o próprio fundo escuro do sistema), o
texto ficava invisível — o "algumas cores brancas... desaparecem" que foi
relatado.

Corrigido em `js/02-core-helpers.js` e `css/style.css`: nova variável
`--gold-on-dark`, calculada a partir da cor escolhida — se ela for escura
demais pra contrastar com o fundo fixo, usa uma versão clareada
automaticamente só nesses lugares específicos (menu de papéis, abas,
rótulos, badges). Testei com a cor exata do próprio fundo do sistema
(`#0a2647`) e com preto puro — os dois casos agora geram uma versão clara
e legível, em vez de ficarem invisíveis.

## v0.22.2 — Bug corrigido: texto dos botões ficava ilegível com cores escuras (white-label)
A funcionalidade de white-label na interface (v0.21.1) mudava a cor de
fundo dos botões principais, mas o texto tinha uma cor **fixa e escura**
— pensada só pra funcionar com a cor padrão (dourado, um tom claro). Se a
empresa escolhesse uma cor escura pra Identidade Visual, o resultado era
texto escuro em cima de fundo escuro — praticamente ilegível.

Corrigido em `js/02-core-helpers.js` e `css/style.css`: agora calcula
automaticamente o contraste (luminância) da cor escolhida e usa texto
claro ou escuro, o que fizer mais sentido. Testei com a própria cor azul
marinho padrão do sistema (bem escura) e confirmei que o texto vira claro
automaticamente — o cenário exato que causava o bug.

## v0.22.1 — Webhooks: formato amigável pro Slack
O Slack só entende mensagens no formato `{"text": "..."}` — diferente do
JSON genérico que os outros webhooks recebem. Agora o gatilho detecta
sozinho se a URL cadastrada é do Slack (contém `hooks.slack.com`) e, nesse
caso, manda uma mensagem de texto legível em vez do JSON bruto. Pra
qualquer outra URL, continua mandando o mesmo JSON de sempre — nada muda
pra quem já está usando (testado com webhook.site na conversa).

- **`sql/19-webhooks-formato-slack.sql`** (rodar depois do
  `18-webhooks-eventos-dominio.sql`).
- Tela de cadastro de webhook agora mostra um aviso "✅ URL do Slack
  detectada" assim que você cola uma URL do Slack no campo.

## v0.22.0 — Webhooks públicos sobre eventos de domínio
Reaproveita o barramento de eventos de domínio que já existe desde a
v0.7.0 (`eventos_dominio` — ciclo.aberto, pdi.aprovado, diagnostico.gerado
etc.). Agora dá pra cadastrar uma URL de webhook por Empresa, e o sistema
chama essa URL automaticamente sempre que um dos eventos escolhidos
acontece — sem precisar construir uma integração sob medida pra cada
sistema externo (folha de pagamento, ATS, Slack).

- **`sql/18-webhooks-eventos-dominio.sql`** (rodar no SQL Editor, depois
  do `17-notificacoes-in-app.sql`): ativa a extensão `pg_net`, cria a
  tabela `webhooks_configurados`, e um gatilho no banco que dispara os
  webhooks direto — **não depende do navegador de ninguém estar aberto**,
  já que roda no próprio Postgres.
- **Nova tela "Webhooks (integrações)"** (Administrador/RH): cadastra
  webhooks com nome, URL e quais eventos escutar (ou todos), mostra a
  chave de assinatura (pra quem recebe confirmar que a chamada veio do
  NORTE de verdade), ativa/desativa/exclui.
- **Importante**: depois de rodar a SQL, teste com uma URL de teste (ex.:
  webhook.site) antes de usar em produção — a sintaxe exata do `pg_net`
  pode variar um pouco conforme a versão do Supabase.

**Sobre o item "PWA / instalável no celular"**: isso já foi implementado
na v0.20.0 (manifest, ícones, service worker) — nada novo a fazer aqui.

## v0.21.1 — White-label na interface + onboarding com barra de progresso

**White-label na interface**: as cores de Identidade Visual (Configurações),
que até agora só afetavam os PDFs exportados, agora também repintam a
interface do sistema ao vivo (botões, abas ativas etc.) assim que a empresa
salva sua cor escolhida. Diferente da tentativa anterior (v0.12.0,
removida na v0.12.1) — aqui não tem nenhuma extração automática de cor a
partir do logo, é só a cor que a própria empresa escolhe manualmente. As
cores de classificação IDA continuam fixas, nunca mudam.

**Onboarding com barra de progresso**: o checklist de primeiros passos
("Onboarding do tenant") já existia, mas ficava discreto entre outros
cartões de pendência. Agora mostra uma barra de progresso visual (X de 5
passos), marca visualmente os passos já concluídos (✅) ao lado dos
pendentes, e na primeira visita (0 passos feitos) troca a saudação por
"Bem-vindo(a) à Plataforma NORTE!". Continua desaparecendo sozinho quando
os 5 passos são concluídos.

## v0.21.0 — 4 módulos novos: Check-in, Clima/eNPS, 9-Box, Sucessão

**1) Feedback contínuo (check-ins 1:1)** — registro informal de conversas
entre Gestor e Colaborador fora do ciclo formal. **Não pontua, não afeta
a média 25/50/25 (RN003)** — é só um histórico de acompanhamento contínuo.
Aparece na tela de Colaboradores (Gestor registra) e no Dashboard do
Colaborador (vê o que foi registrado sobre ele).

**2) Pesquisa de Clima / eNPS** — módulo novo e separado da Avaliação de
Desempenho (não usa escala IDA). RH cria uma pesquisa com pergunta
customizável (padrão eNPS: nota 0-10 de recomendação), colaboradores
respondem, RH acompanha o score eNPS calculado automaticamente
(promotores − detratores), distribuição e comentários recebidos.

**3) Matriz 9-Box** — gráfico de dispersão (SVG próprio) cruzando
Desempenho (dimensão Resultado) × Potencial, reaproveitando 100% dos
dados já calculados no Diagnóstico. Adicionado na tela de Diagnóstico &
PDI, respeitando a visibilidade por papel (Gestor só vê a própria equipe).

**4) Mapa de Sucessão** — nova tela, sugerindo automaticamente sucessores
em potencial pra cargos de natureza Estratégica (posições-chave),
baseado em quem tem o Potencial mais alto na mesma Unidade/Setor. É
sugestão de ponto de partida — a decisão final continua sendo humana
(Princípio 6 da Metodologia).

Nenhum desses 4 precisa de SQL nova — todos guardam dados dentro do
mesmo blob flexível já usado pelo resto do sistema. Testei a lógica de
cálculo dos 4 isoladamente antes de entregar.

## v0.20.1 — Bug corrigido: painel de notificações cortado pela barra lateral
O painel que abre ao clicar no sino 🔔 (320px de largura) ficava presa
dentro da barra lateral (250px de largura fixa) — o painel era mais largo
que o espaço onde estava posicionado, então aparecia cortado/apertado.

Corrigido em `js/25-notificacoes.js`: o painel agora usa posicionamento
fixo relativo à tela inteira (não mais relativo à barra lateral), então
flutua livremente por cima de todo o conteúdo, sem ser cortado por nada.
Também adicionei um jeito de fechar o painel clicando em qualquer lugar
fora dele.

## v0.20.0 — PWA: instalável no celular
O sistema virou um PWA (Progressive Web App) de verdade — dá pra instalar
no celular (ícone na tela inicial, abre em tela cheia, sem barra de
navegador), tanto no Android quanto no iPhone.

- **`manifest.json`**: nome, ícones, cor do tema.
- **`icons/icon-192.png` e `icons/icon-512.png`**: gerados a partir do
  logo padrão atual do sistema.
- **`sw.js`** (Service Worker): estratégia deliberadamente simples —
  "rede primeiro, cache só como reserva pra quando estiver sem internet".
  Isso é importante: um Service Worker mal feito poderia trazer de volta o
  problema de cache que já corrigimos antes (v0.15.6, o "?v=" nas URLs) —
  esse aqui nunca esconde uma versão nova por trás de cache.
- Melhorei o tamanho dos botões de Iniciar/Desenvolver/Alavancar no celular
  (na tela de preenchimento de avaliação) pra ficar mais fácil de tocar
  certo — já existia responsividade ali, só ajustei a altura mínima.

**Como instalar**: no Android (Chrome), abre o site e toca em "Adicionar à
tela inicial" (ou o navegador sugere isso automaticamente depois de usar
um pouco). No iPhone (Safari), toca em Compartilhar → "Adicionar à Tela de
Início".

## v0.19.3 — Relatório Institucional Consolidado (PDF)
Novo tipo de relatório em Relatórios: um "raio-x" da empresa toda, num PDF
único, pensado pro RH apresentar à diretoria — diferente dos relatórios
existentes, que são sempre por colaborador/ciclo específico.

**5 seções**: Resumo Executivo (colaboradores ativos, ciclos abertos/
encerrados), Distribuição por Classificação IDA (com percentuais),
Adoção de PDI (% de ciclos com PDI ativo, PDIs já aprovados), Comparação
por Unidade/Setor (média de classificação por setor), e Alertas de
Acompanhamento (PDIs de Mentalidade pendentes, colaboradores sem ciclo
aberto).

Reaproveita os mesmos cálculos já usados no Dashboard Executivo e no
Super Admin — nenhuma lógica nova de agregação, só reorganizada num
documento único.

## v0.19.2 — Gráfico de trajetória IDA entre ciclos
Novo gráfico de linha (SVG próprio, sem biblioteca externa) mostrando a
evolução de Resultado, Comportamento e Potencial ao longo dos ciclos com
diagnóstico — aproveitando que cada ciclo já é um "retrato congelado"
(RN024) que nunca muda depois de gerado.

- **Dashboard do Colaborador**: seção "Minha trajetória", com a própria
  evolução ao longo do tempo (aparece quando já tem 2+ ciclos).
- **Diagnóstico & PDI**: seção "Trajetória por colaborador", agrupando os
  ciclos de cada pessoa e mostrando o gráfico de quem já tem histórico
  suficiente — sem alterar os cards individuais por ciclo que já existiam.
- Com só 1 ciclo, mostra uma mensagem clara em vez de um gráfico quebrado
  ou vazio.

## v0.19.1 — Notificações in-app (sino de alertas)
Complementar ao e-mail (v0.15.2/v0.15.3): agora existe um sino 🔔 no topo
do menu lateral, com contador de não lidas, que abre um painel com o
histórico de notificações — diferente dos cartões de "pendências" dos
dashboards (que são calculados na hora e desaparecem quando resolvidos),
essas ficam guardadas e podem ser marcadas como lidas.

- **`sql/17-notificacoes-in-app.sql`** (rodar no SQL Editor, depois do
  `16-ativar-realtime.sql`): cria a tabela `notificacoes`, com RLS
  garantindo que cada pessoa só vê as próprias, e ativa Realtime nela.
- **`js/25-notificacoes.js`**: o sino, o painel, e a lógica de carregar/
  marcar como lida — chegam em tempo real via Realtime, igual ao aviso de
  atualização (v0.16.0), sem precisar recarregar a tela.
- Conectado nos mesmos 2 pontos que já disparam e-mail: **avaliação
  pendente** (quando o ciclo passa de etapa) e **PDI aprovado** — mesmo
  evento, dois canais (e-mail + sino), um não depende do outro.
- Clicar numa notificação marca ela como lida e já navega pra tela
  relevante (Ciclos de Avaliação, ou Diagnóstico & PDI).

## v0.19.0 — Dashboard de analytics entre Empresas-clientes (Super Admin)
Nova seção "Analytics entre Empresas-clientes" na tela de Super Admin,
calculada a partir dos mesmos dados já carregados pras métricas agregadas
(sem consulta nova ao banco):

- **Churn**: % de empresas suspensas ou com pagamento cancelado.
- **Engajamento médio no ciclo**: % de ciclos que chegam a "Encerrado"
  (em vez de ficarem abandonados no meio do caminho).
- **Adoção média de PDI**: dos ciclos que geraram diagnóstico, quantos de
  fato têm um PDI de Desenvolvimento ou Mentalidade preenchido (mede se a
  empresa está só avaliando, ou também usando a parte de desenvolvimento).
- **Tabela comparativa de maturidade entre empresas**: colaboradores,
  conclusão de ciclo, adoção de PDI, cobertura (% de colaboradores que já
  participaram de algum ciclo), última atividade registrada, e um "score
  de maturidade" (média dos indicadores acima, 0-100) — ordenada da mais
  madura pra menos madura. Empresas em churn aparecem esmaecidas na lista.

**Importante**: esses indicadores são de produto (pra você acompanhar
adoção entre clientes), não fazem parte da Metodologia NORTE nem de
nenhuma RN oficial — são cálculos nossos, específicos dessa tela.

## v0.18.3 — Status de pagamento (preparação pro gateway de pagamento)
Preparação pra quando a integração com um gateway de pagamento (Asaas ou
outro) for conectada — por enquanto, tudo controlado manualmente.

- **Cadastro da Empresa → Dados de faturamento**: campos novos "Status"
  (Em dia / Pendente / Atrasado / Cancelado) e "Próxima cobrança" (data).
- **Tela de Super Admin**: nova coluna "Pagamento" na lista de empresas,
  mostrando o status de cada uma — dá pra ver de relance quem está em dia
  e quem está atrasado, sem precisar entrar empresa por empresa.
- Guardado também um campo `idAssinaturaGateway` (vazio por enquanto) —
  reservado pra quando a integração de cobrança automática for conectada,
  sem precisar mudar a estrutura de novo nesse momento.

**Ainda não faz nada sozinho**: esse status é preenchido manualmente por
enquanto. A cobrança automática (Pix/Cartão/Boleto recorrente via Asaas)
fica pra quando você criar a conta no gateway e voltarmos a essa parte.

## v0.18.2 — Periodicidade do plano contratual
Novo campo "Periodicidade do plano" em Cadastro da Empresa → Dados de
faturamento do contrato, com as opções **Mensal**, **Semestral** e
**Anual**. Fica ao lado do "Plano contratado" (Essencial/Profissional/
Enterprise) — um define o nível do plano, o outro define o ciclo de
cobrança.

## v0.18.1 — Segmento: opção "Outro" ganhou campo de texto livre
O campo Segmento (Cadastro da Empresa) virou uma lista fixa na v0.17.0
pra fazer o filtro da Base de Cargos funcionar de forma confiável — mas
isso tirou a flexibilidade de descrever um segmento que não está na
lista. Agora tem os dois: escolhe uma das 13 opções fixas, e se escolher
**"Outro"**, aparece um campo de texto pra descrever livremente.

- O filtro da Base de Cargos continua funcionando normalmente (usa sempre
  uma das 13 categorias fixas — "Outro" mostra os cargos gerais).
- O texto livre é só descritivo — aparece ao lado do nome do segmento na
  tela de Base de Cargos, mas não interfere no filtro.

## v0.18.0 — Desenho de Cargo no padrão completo (baseado em documento de referência)
Reconstrução completa do modelo de Desenho de Cargo, a partir de um
documento de referência real (Desenho de Cargo — Analista de Dados) que
segue um padrão de mercado bem mais detalhado do que o formato anterior
(que só tinha sumário, atividades e requisitos em texto livre).

**Estrutura nova, em 9 seções** (tanto na tela de edição quanto na base
CBO): Identificação do Cargo (área/departamento, nível hierárquico, regime
de trabalho, local de trabalho, subordinação, subordinados diretos),
Missão do Cargo, Responsabilidades e Atribuições (+ Cultura e Postura
Institucional, RN030), Requisitos (formação acadêmica, experiência,
conhecimentos técnicos, idiomas), Competências Comportamentais,
Ferramentas e Sistemas Utilizados, Indicadores de Desempenho (KPIs do
Cargo), Condições de Trabalho, e Perspectivas de Carreira.

- **`js/12-page-desenho.js`**: tela de edição inteira reconstruída nesse
  formato, com as 9 seções.
- **`js/04-data-cbo.js`**: os 42 cargos da base CBO já vêm com todo esse
  conteúdo preenchido — o "Analista de Dados" segue quase palavra por
  palavra o documento de referência enviado; os demais 41 seguem o mesmo
  padrão, com conteúdo ajustado ao contexto de cada função (ex.: Pedreiro
  tem menos "ferramentas de sistema" que um cargo de escritório, o que
  faz sentido pela natureza do trabalho).
- **`js/11-page-cargos.js`** (`importarCargo`): atualizado para copiar
  todos os campos novos da base CBO pro cargo importado pela empresa.

## v0.17.1 — Filtro de segmento agora é estrito (sem mistura de "gerais")
Ajuste no comportamento da v0.17.0, a pedido: em vez de misturar cargos
"gerais" com os do segmento escolhido através de uma regra especial no
código, agora o filtro é direto — só mostra cargos marcados pro segmento
que a empresa escolheu.

- Removido o "sentinela" `Geral` da lógica de filtro (`js/11-page-cargos.js`).
- Os cargos genuinamente universais (Gerente, Recepcionista, Auxiliar
  Administrativo etc.) continuam aparecendo em qualquer segmento — mas
  agora porque estão marcados explicitamente em **todos os 13 segmentos**
  na própria base (`js/04-data-cbo.js`), não por causa de uma exceção
  escondida no filtro. Os cargos específicos (Enfermeiro, Pedreiro,
  Professor etc.) continuam só nos segmentos certos.
- Os números totais por segmento continuam idênticos aos da v0.17.0 (24 a
  27 cargos, dependendo do segmento) — só a forma de calcular ficou mais
  simples e transparente.

## v0.17.0 — Base de Cargos (CBO) filtrada pelo segmento da empresa
Em vez de simplesmente ampliar a lista de cargos sem critério, o pedido foi
melhor que isso: filtrar os cargos sugeridos pela área de atuação da
empresa (ex.: uma empresa de Saúde só ver cargos relevantes pra Saúde, não
uma lista genérica misturada com Pedreiro ou Professor).

- **`js/04-data-cbo.js`**: campo novo `segmentos` em cada cargo, marcando a
  qual área ele pertence. Cargos "Geral" (Gerente, Recepcionista, Auxiliar
  Administrativo etc.) aparecem pra qualquer segmento. Foram adicionados
  18 cargos novos cobrindo áreas que antes não tinham nenhuma
  representação: Saúde, Educação, Tecnologia, Jurídico, Construção Civil,
  Agronegócio e Logística — total foi de 24 para 42 cargos.
- **Cadastro da Empresa**: o campo "Segmento" deixou de ser texto livre e
  virou uma lista fixa de 13 áreas — isso é o que permite o filtro
  funcionar de forma confiável (texto livre como "saude" vs "Saúde" vs
  "Hospital" não dava pra casar com precisão).
- **Base de Cargos**: filtra automaticamente pelos cargos "Geral" + os do
  segmento escolhido pela empresa. Tem uma opção pra "ver cargos de todos
  os segmentos" a qualquer momento, se quiser.

**Importante sobre os códigos CBO usados**: não tive acesso à base de
dados oficial completa do governo nesse ambiente (sem internet aberta) —
os códigos e descrições foram escritos com base em conhecimento geral
sobre ocupações comuns no Brasil, com boa confiança, mas **não foram
verificados contra o registro oficial do Ministério do Trabalho**. Vale
conferir o código exato antes de usar em algo formal (ex.: registro em
carteira de trabalho), se isso for relevante pro caso de uso.

## v0.16.2 — Segunda correção do aviso de atualização (janela de tempo)
A correção da v0.16.1 (comparar o carimbo exato do salvamento) não era
suficiente: se a pessoa clica em várias coisas seguidas, cada clique
dispara seu próprio salvamento, e o aviso de um mais antigo podia chegar
depois do carimbo já ter mudado pra um mais novo — dando falso positivo
mesmo sendo tudo ação da própria pessoa.

Trocado por uma abordagem mais tolerante em `js/18-persistence.js` e
`js/02-core-helpers.js`: em vez de comparar um carimbo exato, o sistema
agora marca "última vez que eu fiz alguma ação" a cada interação, e só
mostra o aviso se **nenhuma ação minha aconteceu nos últimos 4 segundos**
— cobrindo com folga o caso de vários cliques rápidos seguidos. Testei os
3 cenários (ação isolada, ação de outra pessoa depois de um tempo, e
vários cliques rápidos em sequência) e confirmei o comportamento certo
nos três.

## v0.16.1 — Bug corrigido: aviso de atualização aparecia toda hora
O aviso "Alguém mais atualizou os dados" (v0.16.0) disparava até quando a
mudança era da própria pessoa — o sistema salva sozinho toda vez que
qualquer coisa é feita (agendarSalvamento), e isso também contava como
"atualização" pro Realtime. Resultado: o aviso ficava aparecendo o tempo
todo, sem servir de aviso real de nada.

Corrigido em `js/18-persistence.js` e `js/02-core-helpers.js`: cada
salvamento agora carimba um identificador próprio, e o aviso só aparece
quando o carimbo recebido pelo Realtime **não bate** com o do nosso
último salvamento — ou seja, só quando é mudança de outra pessoa de
verdade. Testei os dois cenários (eco próprio vs. mudança alheia) e
confirmei o comportamento certo nos dois.

## v0.16.0 — Aviso automático quando outra pessoa atualiza os dados (Realtime)
Resolve o ponto #4 identificado na revisão geral: duas pessoas da mesma
empresa usando o sistema ao mesmo tempo sem saber que os dados mudaram —
o caso real que já aconteceu nessa mesma conversa (RH vendo "etapa 2"
enquanto o Líder já via "etapa 3"). O botão "Atualizar" já resolvia isso,
mas exigia que a pessoa soubesse que precisava clicar nele.

Agora, usando o **Supabase Realtime**, o navegador é avisado sozinho
sempre que os dados da empresa mudam (por qualquer pessoa, em qualquer
tela) — aparece uma faixa discreta no topo da tela: "Alguém mais atualizou
os dados da empresa", com botão para atualizar na hora ou ignorar por
enquanto.

**Decisão importante de segurança**: o aviso não atualiza os dados
sozinho automaticamente — só avisa. Atualizar sozinho correria o risco de
apagar um formulário que a pessoa esteja preenchendo bem naquele momento
(o mesmo tipo de problema já corrigido antes na tela de login). Quem
decide quando atualizar continua sendo a pessoa, agora só que avisada.

**Precisa rodar uma SQL nova**: `sql/16-ativar-realtime.sql` (depois do
`15-controle-migrations.sql`) — ativa o Realtime na tabela `dados_sistema`.

## v0.15.6 — Rede de segurança pro processo de publicar atualizações
Não é uma mudança de funcionalidade — é sobre reduzir o risco do processo
manual de subir cada atualização (baixar zip → substituir arquivos →
git push → esperar deploy → dar refresh forçado no navegador).

- **Cache-busting automático** (`index.html`): todo arquivo `.js`/`.css`
  local agora carrega com `?v=X.Y.Z` na URL. Isso resolve de vez o
  problema do navegador (ou do GitHub Pages) mostrar a versão antiga do
  código depois de um `git push` — não depende mais de lembrar de dar
  Ctrl+Shift+R. **Mas exige disciplina**: a cada nova versão publicada, o
  número em `?v=` precisa ser atualizado em todas as linhas do
  `index.html` (tem um comentário lá explicando isso).
- **Controle de migrations SQL** (`sql/15-controle-migrations.sql`): nova
  tabela `migrations_aplicadas`, que registra quais scripts já foram
  rodados. Resolve a dúvida de "já rodei essa SQL ou não" — é só rodar
  `select * from migrations_aplicadas order by aplicada_em;` no SQL
  Editor pra ver o histórico completo. Toda migration nova, a partir de
  agora, deve terminar registrando a si mesma nessa tabela.

## v0.15.5 — Coluna "Detalhes" da Auditoria menos poluída
A coluna de detalhes de cada evento mostrava o JSON bruto (com chaves,
aspas e IDs completos de 36 caracteres) — ficava larga e difícil de ler.
Agora mostra só "chave: valor" separado por ponto, e IDs longos (UUIDs)
aparecem encurtados (só os 8 primeiros caracteres).

## v0.15.4 — Bug de segurança corrigido: Super Admin podia se auto-bloquear
Um Super Admin que também está cadastrado como colaborador de uma empresa
(caso comum, já que é a mesma pessoa fazendo os dois papéis) conseguia
suspender a própria empresa pela tela — e a trava de suspensão vale pra
qualquer um vinculado a ela, sem exceção pro Super Admin. Resultado: a
pessoa se bloqueava do próprio sistema, sem conseguir nem entrar de volta
pra reverter (já que reverter exige estar logado como Super Admin).

Corrigido em `js/23-page-super-admin.js`: o botão "Suspender" não aparece
mais para a própria empresa do Super Admin (mostra uma nota explicando por
quê), e a lista marca visualmente qual empresa é "sua empresa". Se for
realmente necessário suspender a própria empresa por algum motivo, ainda
dá pra fazer direto via SQL — só não é mais um clique acidental.

## v0.15.3 — E-mail de boas-vindas ao criar conta
Complementa a v0.15.2: agora, assim que alguém termina de criar a conta
(seja usando um código de convite pra entrar numa empresa já existente, ou
um código de licença pra cadastrar uma empresa nova), recebe um e-mail de
boas-vindas confirmando que deu certo. Usa a mesma Edge Function
`enviar-email` já implantada — nenhuma configuração nova é necessária além
da que já foi feita pra v0.15.2.

## v0.15.2 — Notificações por e-mail (convite, avaliação pendente, PDI aprovado)
Primeira leva de notificações por e-mail, usando o Resend como serviço de
envio. Como o app é um site estático (GitHub Pages), o envio não pode
acontecer direto do navegador — isso exigiria expor a chave secreta do
Resend pra qualquer pessoa que abrisse o código-fonte da página. A solução
é uma **Edge Function** do Supabase: um pedacinho de código que roda no
servidor do Supabase, guarda a chave em segredo, e só ele conversa com o
Resend.

**O que foi implementado:**
- **Convite de acesso gerado**: a tela de convite (Usuários & Acesso) agora
  tem um campo opcional de e-mail — se preenchido, o código do convite é
  enviado automaticamente pra pessoa, além de continuar disponível pra
  copiar manualmente.
- **Sua avaliação está pendente**: sempre que um ciclo passa a etapa (abre
  pela primeira vez, avança do Colaborador pro Líder, do Líder pro RH),
  a pessoa responsável pela nova etapa recebe um e-mail avisando.
- **PDI aprovado**: o colaborador recebe um e-mail quando o Gestor/RH
  aprova o PDI dele.

**Arquivos novos:**
- `supabase/functions/enviar-email/index.ts` — a Edge Function em si (tem
  instruções completas de implantação no final do próprio arquivo).
- `sql/14-preparacao-notificacoes-email.sql` — adiciona uma cópia do
  e-mail em `perfis` (o app não consegue ler `auth.users` diretamente por
  segurança) e um campo de e-mail em `convites`.
- `enviarEmailNotificacao()` e `emailWrapperHTML()` em
  `js/02-core-helpers.js` — funções reutilizáveis pra qualquer notificação
  futura.

**Nenhum e-mail falhando trava o sistema**: se o envio não funcionar por
qualquer motivo (Edge Function ainda não implantada, chave errada, etc.),
a ação principal (gerar convite, avançar etapa, aprovar PDI) continua
funcionando normalmente — só o e-mail em si não sai, com um aviso no
console do navegador.

### ⚠️ 3 passos manuais obrigatórios antes de funcionar de verdade
1. Criar conta gratuita em **resend.com** e pegar a API Key.
2. Rodar **`sql/14-preparacao-notificacoes-email.sql`** no SQL Editor do
   Supabase (depois do `13-metricas-super-admin.sql`).
3. Implantar a Edge Function e configurar a chave do Resend como secret —
   instruções completas dentro de
   `supabase/functions/enviar-email/index.ts`.

Sem esses 3 passos, os e-mails simplesmente não saem (mas nada quebra).

## v0.15.1 — Métricas agregadas no Super Admin
A tela de Super Admin só listava empresas uma a uma — agora mostra também
números consolidados de toda a plataforma no topo: empresas ativas,
empresas suspensas, total de colaboradores (somando todas as empresas),
ciclos em andamento e ciclos já encerrados (histórico).

Como esses números vivem dentro do "payload" de cada empresa (blob JSON em
`dados_sistema`, não uma tabela separada), foi necessária uma nova permissão
de leitura pro Super Admin — ver `sql/13-metricas-super-admin.sql` (rodar
no SQL Editor, depois do `12-suspensao-empresas.sql`). É só leitura: o
Super Admin nunca ganha permissão de editar os dados operacionais de uma
empresa-cliente.

## v0.15.0 — Tela de Auditoria + Suspender empresas (Super Admin)

**1) Tela de Auditoria** (`js/24-page-auditoria.js`, visível pra
Administrador e RH): o sistema já registrava mais de 40 tipos de evento
diferentes (login, desligamento, mudança de papel, aprovação de PDI,
exportação de relatório etc.) numa tabela append-only desde o início —
só não existia nenhuma tela pra ver isso. Agora tem, com filtro por tipo
de evento e por pessoa, mostrando os últimos 500 registros com data/hora,
quem fez e detalhes técnicos de cada um.

**2) Suspender acesso de Empresas ativas** (Super Admin): até aqui, o
Super Admin só controlava a criação de Empresas novas (código de
licença) — não existia jeito de suspender uma Empresa já ativa (ex.:
parou de pagar, contrato encerrado). Agora existe um botão
"Suspender"/"Reativar" na lista de Empresas, e ninguém daquela Empresa
consegue entrar no sistema enquanto estiver suspensa.

- **`sql/12-suspensao-empresas.sql`** (rodar no SQL Editor, depois do
  `11-licenciamento-empresas.sql`): adiciona as colunas de suspensão em
  `empresas` e a permissão do Super Admin pra atualizá-las.
- Bug corrigido de passagem: a consulta de empresas na tela de Super
  Admin usava um nome de coluna que não existe (`criado_em` — o certo é
  `created_at`), então a lista de empresas nunca aparecia direito.

## v0.14.7 — Corrigido de vez: tela de nova senha aparecia e sumia em 1 segundo
A v0.14.6 eliminou a disputa entre duas rotinas, mas sobrou uma disputa de
**ordem** dentro da própria rotina: a trava que impede outros eventos de
assumir a tela (`_tratandoLinkDeRecuperacao`) só era ligada DEPOIS de trocar
o token pela sessão — mas essa troca em si (`setSession`/
`exchangeCodeForSession`) já dispara o evento de "sessão mudou" NO MEIO do
processo, antes da trava existir. Resultado exato relatado: a tela de nova
senha chegava a aparecer por um instante, e o app normal (que já tinha sido
disparado por baixo dos panos, sem trava nenhuma barrando) tomava conta da
tela logo em seguida.

Corrigido em `js/19-auth.js`: a trava agora liga de forma síncrona, lendo a
URL diretamente, **antes** de qualquer troca de token começar — nunca mais
depois. Simulei o cenário exato (evento disparando no meio do processo) e
confirmei que agora fica bloqueado corretamente.

## v0.14.6 — Disputa de tempo no link de recuperação eliminada de vez
As correções anteriores (v0.13.6, v0.13.7) reduziram a disputa, mas não
eliminaram — o link ainda funcionava só às vezes, porque duas rotinas
diferentes competiam pra processar o mesmo link ao mesmo tempo: a detecção
automática do próprio supabase-js (ligada por padrão) e o código específico
que escrevemos pra tratar o link de recuperação. Dependendo de qual
"ganhasse a corrida" primeiro, ora funcionava, ora abria o sistema direto.

Corrigido de raiz em `js/01-supabase-client.js` e `js/19-auth.js`:
- **Desligada a detecção automática do supabase-js** (`detectSessionInUrl:
  false`) — agora só existe UM caminho processando qualquer link recebido
  por e-mail, nunca dois ao mesmo tempo.
- O app passou a processar os tokens da URL manualmente e sequencialmente
  (`processarTokensDaUrlSeHouver`), cobrindo os dois formatos possíveis
  (PKCE `?code=...` e implícito `#access_token=...`), antes de qualquer
  outra decisão ser tomada.
- Como efeito colateral necessário: qualquer outro tipo de link com token
  na URL (ex.: confirmação de cadastro por e-mail, se algum dia for
  ativada) também passou a ser tratado explicitamente pelo mesmo código —
  antes dependia da mesma detecção automática que foi desligada.

## v0.14.5 — Mensagem de e-mail duplicado cobre mais variações
A garantia em si já existia (o Supabase impede, no nível do banco, duas
contas com o mesmo e-mail — isso nunca dependeu do código do front-end).
O que foi ajustado foi só a detecção da mensagem de erro para mostrar o
aviso amigável: o texto exato que o Supabase retorna varia um pouco
("User already registered", "already been registered", "already in use"),
e a checagem só cobria uma dessas variações — nas outras, a pessoa via o
erro técnico em inglês em vez da explicação em português. Agora cobre
todas as variações conhecidas.

## v0.14.4 — Mudar o papel de uma conta já existente
Até aqui, o papel (RH/Gestor/Colaborador) só podia ser definido no momento
do convite — não existia jeito de promover ou rebaixar alguém que já
tivesse conta criada, sem desativar e recriar do zero.

- Nova opção **"Mudar papel para…"** em Usuários & Acesso, ao lado de cada
  pessoa (exceto o próprio Administrador da empresa, que não muda).
- Mesma regra do convite: só o Administrador pode promover alguém a RH —
  RH pode promover/rebaixar entre Gestor e Colaborador livremente.
- Não precisou de mudança no banco — a política de segurança que já
  permite Dono/RH administrarem qualquer perfil da empresa (criada na
  correção `07-fix-desativar-usuario.sql`) já cobre esse caso.

## v0.14.3 — Correção retroativa: colaboradores desligados antes da v0.14.2
A correção da v0.14.2 (Desligar também remove o login) só vale para
desligamentos feitos depois dela — quem já tinha sido desligado antes
ficou com o cadastro inativo, mas o login continuava ativo, sem nenhum
jeito automático de perceber isso.

Adicionado em `js/13-page-colaboradores.js`: a tela de Colaboradores agora
detecta automaticamente esses casos (desligado + login ainda ativo) e
mostra um alerta com botão "Desativar login agora" pra cada um — corrige
com um clique, sem precisar ir em Usuários & Acesso manualmente.

## v0.14.2 — Desligar colaborador agora remove o acesso de login também
Gap de segurança real corrigido em `js/13-page-colaboradores.js`: clicar em
"Desligar" só marcava o registro de RH do colaborador como inativo — a
conta de login dela continuava funcionando normalmente, ela ainda
conseguia entrar no sistema depois de desligada.

- `desligarColaborador` agora, além de marcar o colaborador como desligado,
  desativa também a conta de login vinculada (se houver uma) — a pessoa
  perde o acesso ao sistema imediatamente. Pede confirmação antes de agir.
- Novo botão **"Religar"**, ao lado de "Anonimizar (LGPD)", pra quando o
  colaborador é recontratado pela mesma Empresa: reativa o cadastro dele e
  reativa o acesso de login junto (se havia um vinculado).
- Se o colaborador for "religado" numa **outra** Empresa (não a mesma),
  isso continua exigindo uma conta nova com um e-mail diferente — é a
  mesma limitação de e-mail único por conta em toda a plataforma já
  documentada em `RECONCILIACAO-RN.md`, não algo resolvido nesta versão.

## v0.14.1 — Bug corrigido: tela de Super Admin travava em "Carregando…"
A condição que decidia buscar os dados verificava se as listas de empresas
e códigos estavam vazias — mas lista vazia também é o estado normal antes
de existir qualquer empresa ou código gerado (como é o caso logo depois de
configurar o Super Admin pela primeira vez). Isso fazia a tela recarregar
os dados a cada render, pra sempre, sem nunca aceitar "zero resultados"
como uma resposta válida — travando em "Carregando…" eternamente.

Corrigido em `js/23-page-super-admin.js`: agora existe uma flag separada
(`_superAdminJaCarregou`) que só controla "já tentei carregar uma vez",
independente de quantos resultados vieram. Também adicionado aviso de erro
explícito caso a consulta ao Supabase falhe (antes falhava em silêncio).

## v0.14.0 — Licenciamento de Empresas (controle do dono da plataforma)
Até aqui, qualquer pessoa que chegasse na tela de cadastro e escolhesse
"não tenho convite" conseguia criar uma Empresa nova sozinha, sem nenhum
controle — qualquer um tinha acesso à plataforma. Agora isso exige
aprovação prévia do Instituto INETRIS (dono da Metodologia NORTE).

- **Novo conceito: Super Admin da plataforma** — um nível acima do
  Administrador de cada Empresa. O Administrador só enxerga a própria
  Empresa; o Super Admin enxerga e gerencia todas.
- **`sql/11-licenciamento-empresas.sql`** (rodar no SQL Editor do Supabase,
  depois de todos os scripts anteriores): cria as tabelas `super_admins` e
  `codigos_licenca_empresa`, e atualiza a trigger de cadastro — criar uma
  Empresa nova (sem convite) agora exige um código de licença válido e
  ainda não usado; sem isso, o cadastro é recusado com uma mensagem clara.
- **Tela nova "Super Admin — Empresas"** (`js/23-page-super-admin.js`),
  visível só pra quem está na tabela `super_admins`: gera códigos de
  licença (formato legível, tipo `NORTE-XXXX-XXXX`, fácil de ditar por
  telefone/WhatsApp), lista todas as Empresas cadastradas na plataforma,
  mostra quais códigos já foram usados e por qual Empresa, e permite
  revogar um código ainda não usado.
- Tela de cadastro atualizada: quem for criar uma Empresa nova agora
  também precisa preencher o código de licença, além do nome da empresa.

**Ação manual obrigatória, uma única vez**, depois de rodar o script SQL:
insira a própria conta (a do Instituto INETRIS) na tabela `super_admins`
rodando, no SQL Editor do Supabase:
```sql
insert into super_admins (id, nome) values ('SEU-USER-ID-AQUI', 'Seu nome');
```
O ID do usuário fica visível em Authentication → Users, no painel do
Supabase. Sem essa linha, ninguém tem acesso de Super Admin — nem o dono
da conta.

## v0.13.7 — Bug corrigido (de vez, esperamos): link de recuperação continuava não mostrando a tela de nova senha
A correção da v0.13.6 não foi suficiente — o link continuava abrindo o
sistema normal em vez da tela de nova senha, mesmo em aba anônima com link
recém-gerado. Causa provável: o projeto Supabase pode estar usando o fluxo
"PKCE" para o link de recuperação (`?code=...`), que — diferente do fluxo
"implícito" mais antigo (`#access_token=...`) — não gera uma sessão
sozinho: o app precisa trocar esse código manualmente por uma sessão
(`exchangeCodeForSession`). Sem isso, o Supabase às vezes dispara um evento
genérico (`SIGNED_IN`) em vez de `PASSWORD_RECOVERY`, e o app só via "tem
uma sessão válida" e entrava direto no dashboard.

Reescrito em `js/19-auth.js`:
- Detecção do link de recuperação agora acontece de forma síncrona e
  explícita ao carregar a página (não depende só do evento do Supabase).
- Cobre os dois formatos possíveis: PKCE (`?code=...&type=recovery`, com
  troca manual via `exchangeCodeForSession`) e implícito
  (`#access_token=...&type=recovery`).
- Uma trava (`_tratandoLinkDeRecuperacao`) impede que qualquer outro evento
  de autenticação (como `SIGNED_IN`) atropele a tela de nova senha depois
  que ela já foi decidida.
- Se nenhum dos dois formatos funcionar (link expirado ou já usado — os
  links de recuperação só funcionam uma vez), mostra uma mensagem de erro
  clara em vez de simplesmente cair no login sem explicação.

## v0.13.6 — Bug corrigido: link de redefinição de senha entrava direto no site
Mesmo com o link do e-mail chegando certo (v0.13.5), clicar nele levava
direto pro dashboard normal em vez de mostrar a tela "Defina sua nova
senha". Causa: o link de recuperação já cria uma sessão temporária válida
no Supabase — e o código tinha duas verificações rodando em paralelo no
carregamento da página (`onAuthStateChange` com o evento
`PASSWORD_RECOVERY`, e um `getSession()` inicial): o `getSession()` via
essa sessão temporária e entrava direto no site, ganhando a corrida contra
a tela de nova senha.

Corrigido em `js/19-auth.js`: antes de decidir entrar direto no site, o
código agora confere se a própria URL indica um link de recuperação
(`type=recovery`, nos dois formatos que o Supabase pode usar) e, se for o
caso, mostra a tela de nova senha em vez de pular direto pro dashboard.

## v0.13.5 — Bug corrigido: "Esqueci minha senha" não completava a troca
Duas causas, as duas em `js/19-auth.js`:

1. **Link do e-mail sem destino explícito.** `resetPasswordForEmail` estava
   sendo chamado sem `redirectTo` — nesse caso o Supabase usa a "Site URL"
   configurada no painel do projeto como destino do link. Se esse endereço
   estiver desatualizado (ex.: ainda apontando pra `localhost` ou uma URL
   antiga), o link do e-mail leva a um endereço que não existe — exatamente
   o erro relatado ("não é possível acessar o site"). Agora o link é gerado
   sempre com `redirectTo` = o endereço de onde o site está rodando no
   momento, então nunca aponta pra um lugar errado.
2. **Faltava a tela para completar a troca.** Mesmo que o link chegasse
   certo, o app não tinha nenhuma tela de "defina sua nova senha" — o
   evento de recuperação de senha do Supabase caía direto no fluxo normal
   de login. Agora existe `renderRedefinirSenha()`, com validação de senha
   mínima e confirmação, que aparece automaticamente quando alguém chega
   pelo link do e-mail.

**Ação manual necessária no painel do Supabase** (não dá pra fazer isso
pelo código): em Authentication → URL Configuration, confirme que a "Site
URL" e a lista de "Redirect URLs" incluem o endereço real onde o site está
hospedado (ex.: a URL do GitHub Pages) — o Supabase só aceita redirecionar
para endereços que estejam nessa lista.

## v0.13.4 — Bug corrigido: qualquer clique jogava a página pro topo
`js/05-navigation.js` tinha um `window.scrollTo(0,0)` incondicional dentro
de `render()` — e como praticamente toda ação do sistema (marcar uma nota
Iniciar/Desenvolver/Alavancar, editar um campo, abrir um painel) chama
`render()`, a página voltava pro topo a cada clique. Ficava especialmente
incômodo em telas longas, como preencher uma avaliação com muitos
indicadores — cada nota marcada jogava a pessoa de volta pro topo, tendo
que rolar tudo de novo pra continuar.

Corrigido: `render()` agora só rola pro topo quando a pessoa realmente
muda de tela (rota) ou abre/fecha um ciclo específico — nunca por causa
de uma interação dentro da mesma tela. Testei a sequência real (carregar
→ navegar → abrir ciclo → marcar várias notas → voltar pra lista) e só
rola nos momentos que fazem sentido como "nova tela".

## v0.13.3 — Bug corrigido: RH via a etapa desatualizada (dados não sincronizavam entre pessoas)
Cenário relatado: o Líder já tinha enviado a avaliação (sua própria tela
mostrava "Etapa 3 de 3 — RH"), mas a tela do RH continuava mostrando
"Etapa 2 de 3 — Líder", como se a etapa ainda não tivesse mudado. Não era
um problema de permissão (o papel do RH estava certo) — era sincronização:
o sistema carrega os dados uma única vez, no login, e não busca atualização
depois disso. Se o RH já estava com a tela aberta antes do Líder enviar,
ficava vendo a versão antiga do ciclo indefinidamente, sem nenhum jeito de
perceber isso a não ser dando F5 na página inteira.

Corrigido:
- Nova função `atualizarDadosAoVivo()` (`js/05-navigation.js`), que busca
  os dados mais recentes do servidor e atualiza a tela sem precisar
  recarregar a página inteira (não perde o lugar onde a pessoa estava).
- Chamada automaticamente sempre que alguém entra na tela de **Ciclos de
  Avaliação**.
- Botão "↻ Atualizar" visível tanto na lista de Ciclos quanto dentro de um
  ciclo específico, para quem já está com a tela aberta esperando a vez.
- A mensagem "Esta etapa ainda não é sua" agora sugere clicar em
  "↻ Atualizar" como primeiro passo, já que essa costuma ser a causa real.

Limitação que continua existindo (não é bug, é característica da
arquitetura atual): o sistema não tem sincronização em tempo real — a
atualização só acontece quando alguém pede (ao entrar na tela ou clicar em
"Atualizar"), não automaticamente enquanto a tela está parada. Para tempo
real de verdade, seria necessário usar Realtime do Supabase — fora do
escopo atual.

## v0.13.2 — Bug corrigido: Administrador não conseguia concluir a etapa do RH
Mesma família do bug da v0.13.1, agora na última etapa do ciclo (RH). A
etapa só liberava para quem tinha o papel de sistema `rh` exato — se o
Administrador estava fazendo esse papel na prática (comum em empresas sem
RH separado), a tela mostrava "Esta etapa ainda não é sua".

Corrigido em `js/14-permissions.js` (`podeEditarEtapa`): a etapa do RH
agora libera também para o Administrador. Diferente da etapa do Líder
(vinculada a um colaborador específico via `gestorPerfilId`), a etapa do
RH é uma função de empresa toda — e o Administrador já tinha acesso
irrestrito para ver todos os ciclos, construir e aprovar PDI (RN
`cicloVisivelParaMim`, `podeConstruirPDI`, `podeAprovarPDI`); faltava só
essa etapa específica de preenchimento seguir a mesma regra.

## v0.13.1 — Bug corrigido: Administrador que também é gestor direto não conseguia avaliar
Cenário relatado: Colaborador concluiu a autoavaliação, o ciclo passou para
a etapa do Líder Direto — mas a pessoa logada, apesar de estar cadastrada
como gestor direto daquele colaborador, tinha o papel de sistema
"Administrador" (`owner`), não "Gestor" (`lider`). A tela mostrava "Esta
etapa ainda não é sua" e os botões de avaliação apareciam desabilitados.

Corrigido em `js/14-permissions.js` (`podeEditarEtapa`) e
`js/15-page-ciclos-avaliacao.js` (`souGestorDoCiclo`): agora a etapa do
Líder Direto é liberada tanto para quem tem o papel `lider` quanto para o
Administrador, **desde que** o vínculo de gestor já esteja cadastrado no
organograma daquele colaborador especificamente (`gestorPerfilId` apontando
para essa pessoa). Isso é diferente de liberar avaliação para qualquer
Administrador em qualquer ciclo — só vale quando a própria empresa já
cadastrou essa pessoa como gestor direto de alguém, um cenário comum em
empresas pequenas onde o dono também lidera parte da equipe diretamente.

Nota técnica: encontrei e corrigi de passagem uma duplicação perigosa —
existiam duas funções `souGestorDoCiclo` diferentes (uma em
`js/14-permissions.js`, outra em `js/15-page-ciclos-avaliacao.js`); a
segunda, por carregar depois, sempre sobrescrevia silenciosamente a
primeira. Consolidado em uma única definição.

A etapa do RH e a construção/aprovação do PDI não foram alteradas nesta
correção — o Administrador já podia atuar nelas sem restrição.

## v0.13.0 — Novo logo padrão do sistema
- Substituído o logo padrão exibido no canto superior esquerdo do menu (e
  na tela de login) quando nenhuma empresa definiu um logotipo próprio —
  agora usa a nova marca fornecida (fundo azul, ícone de conexões em branco
  e dourado), redimensionada para 200×200 e otimizada em PNG (~11KB, contra
  ~64KB do logo anterior).
- A cor de fundo da nova imagem (~#072444) é praticamente idêntica à cor de
  fundo do menu lateral (`--surface: #0a2647`), então ela se funde sem
  parecer uma caixa recortada.
- `js/00-logo-asset.js` — mesma constante `LOGO_INETRIS_B64`, conteúdo
  trocado (não renomeei a constante para não precisar alterar todas as
  referências em `js/05-navigation.js` e `js/19-auth.js` sem necessidade).

## v0.12.6 — Bug corrigido: remover o logotipo não voltava ao padrão
Duas causas encontradas e corrigidas em `js/02-core-helpers.js` e
`js/05-navigation.js`:

1. **Duas fontes de logo, um só botão de remover.** O logo do menu lateral
   podia vir de dois campos diferentes (Cadastro de Empresa ou
   Configurações → Identidade Visual — um servindo de reserva do outro).
   Remover em um lugar só não limpava o outro, então se os dois estivessem
   preenchidos, o logo "sobrevivia" à remoção. Agora o botão "Remover
   logotipo" limpa os dois de uma vez, em qualquer uma das duas telas.
2. **Definir/remover só valia depois de clicar em "Salvar".** Nenhuma das
   duas ações realmente escrevia no estado do sistema — só no campo
   escondido do formulário — então o menu lateral só refletia a mudança se
   a pessoa depois clicasse no botão "Salvar" geral da tela (que atualiza
   várias coisas de uma vez). Agora definir ou remover o logotipo grava no
   estado, atualiza o menu lateral na hora (sem re-renderizar a tela
   inteira, pra não apagar outros campos do formulário ainda não salvos) e
   salva em segundo plano — nenhum dos dois depende mais do botão "Salvar".

## v0.12.5 — Bug corrigido: campos de login/cadastro se apagavam sozinhos
Bug pré-existente (não introduzido nesta conversa) em `js/19-auth.js`: os
campos de e-mail e senha do formulário de login não guardavam o que a
pessoa tinha digitado. Toda vez que a tela re-renderizava — o que acontece
em qualquer erro de login, ao ficar bloqueada, ou ao clicar em "Esqueci
minha senha" — os dois campos voltavam vazios, obrigando a redigitar tudo
de novo a cada tentativa. O mesmo acontecia no formulário de cadastro
(nome, empresa, código de convite): marcar/desmarcar "Tenho um código de
convite" apagava o nome já digitado.

- Todos os campos do formulário (e-mail, senha, nome, empresa, código de
  convite) agora preservam o valor digitado através de qualquer
  re-renderização da tela.
- A senha digitada é limpa da memória assim que o login tem sucesso (não
  fica residindo em uma variável além do necessário).

Esta correção veio de uma segunda revisão geral do código, a pedido do
usuário, procurando especificamente por esse tipo de problema (formulário
que perde o que foi digitado por causa de uma re-renderização). Não
encontrei o mesmo padrão em nenhuma outra tela do sistema — as demais só
re-renderizam ao abrir/fechar painéis que não têm campo de texto ao lado
ainda não salvo.

## v0.12.4 — Bug corrigido: logotipo não aparecia nos PDFs exportados
A seção "Identidade visual em relatórios exportados" (Configurações) salvava
o logotipo desde a v0.11.1, mas nenhum dos 3 PDFs gerados (`js/20-page-relatorios.js`
— Avaliação individual, PDI individual, Dossiê completo) de fato desenhava a
imagem no documento — só as cores (`corPrimaria`/`corSecundaria`) eram
aplicadas nos cabeçalhos de tabela. O nome da seção prometia um efeito que
não existia.

- Nova função `desenharLogoNoPDF()`, que embute o logotipo no topo de cada
  PDF quando ele veio de **Colar imagem** ou **Enviar arquivo** (base64).
- Logotipos definidos por **link (URL)** externo continuam aparecendo
  normalmente na tela, mas não são embutidos no PDF — o navegador não
  consegue ler os pixels de uma URL remota de forma síncrona (mesma
  limitação de CORS já documentada na tentativa de extração de cor da
  v0.12.0, removida na v0.12.1). Isso agora está explicado na própria tela
  de Configurações, em vez de falhar silenciosamente.
- Falha ao desenhar uma imagem corrompida/inesperada não derruba mais a
  exportação inteira do PDF (blindado com try/catch).

## v0.12.3 — Revisão de bugs
Revisão completa do código: toda chamada de função foi cruzada com sua
definição (nenhuma referência quebrada encontrada), e os cálculos de
diagnóstico/classificação foram testados isoladamente. Encontrados e
corrigidos 4 bugs reais, todos da mesma família — um "else" genérico que,
na ausência de dado, acabava afirmando a MELHOR classificação possível
(Alavancar) em vez de admitir que não havia dado:

1. `consolidarCiclo` (`js/15-page-ciclos-avaliacao.js`): se um diagnóstico
   fosse gerado sem nenhum pilar com média válida (caso extremo, hoje
   bloqueado pela validação do Desenho de Cargo, mas não pelo cálculo em
   si), a divisão virava `NaN` e `classificar(NaN)` retornava `'A'` por
   acaso — `NaN <= x` é sempre falso, então a comparação caía no último
   `return`. Agora fica `null` explicitamente.
2. `pillClass`/`pillLabel` (`js/02-core-helpers.js`): mesmo problema, um
   nível abaixo — qualquer valor que não fosse `'I'` nem `'D'` (incluindo
   `null`/`undefined`) virava visualmente "Alavancar". Agora existe uma
   checagem explícita para `'A'`, e o caso sem dado usa o estilo neutro
   (`pill-neutral`) com o texto "Sem dado".
3. `renderDistribuicaoIDA` (`js/07-router-dashboard.js`, dashboards do RH
   e Administrador): a contagem "% por classificação" somava qualquer
   diagnóstico sem `geral` reconhecido como Alavancar. Agora exclui esses
   casos da contagem.
4. Consolidado mensal "Evolução organizacional" (mesmo arquivo): um
   diagnóstico com `geralMedia` nula (mesmo caso extremo do item 1) entraria
   na média do mês como `0` (coerção de `null` em soma), puxando a média
   pra baixo silenciosamente. Agora é excluído do cálculo.

Nenhum desses bugs muda o comportamento em uso normal — em todos os casos
reais (cargo com Desenho aprovado, indicadores respondidos) o resultado
antes e depois é idêntico. O problema só aparecia num cenário praticamente
inatingível pela interface hoje; ainda assim, o sistema não deveria inventar
uma nota boa por falta de dado, então valia corrigir.

## v0.12.2 — Remover logotipo + correção de bug ao trocar mais de uma vez
- **Botão "Remover logotipo"**: aparece junto do preview sempre que há um
  logotipo definido, nos dois lugares (Cadastro de Empresa e Configurações
  → Identidade Visual). Limpa o valor e os campos de URL/arquivo.
- **Corrigido: trocar o logotipo mais de uma vez não fazia nada.** Duas
  causas encontradas e corrigidas em `js/02-core-helpers.js`:
  - O `<input type="file">` não tinha seu valor resetado depois de ler o
    arquivo — navegadores não disparam o evento de novo ao escolher o
    mesmo arquivo (ou às vezes nem outro) sem esse reset.
  - A área de "Colar imagem" não limpava o próprio conteúdo depois de cada
    colagem, deixando o elemento num estado que atrapalhava a tentativa
    seguinte.

## v0.12.1 — Removida a adaptação automática de cor
- Removida a extração automática de cor do logotipo introduzida na v0.12.0
  (funções `extrairCorDominante`, `aplicarTemaCores`, `adaptarCoresAoLogo`,
  `rgbParaHex`, `corMaisClara`) — por decisão de produto, as cores do tema
  voltam a ser só as escolhidas manualmente em Configurações → Identidade
  Visual (como já era antes da v0.12.0).
- **Mantido**: o logotipo da empresa no canto superior esquerdo do menu
  (substituindo o símbolo do Instituto INETRIS quando definido), introduzido
  também na v0.12.0.

## v0.12.0 — Adaptação de cor ao logotipo + logo da empresa no menu
- **Cores do sistema adaptadas ao logotipo**: ao definir um logotipo (em
  Cadastro de Empresa ou em Configurações → Identidade Visual, pelos 3
  modos da v0.11.1), o sistema tenta extrair a cor dominante da imagem via
  canvas e aplica como cor de destaque do tema (botões, abas ativas, etc.)
  — as cores de classificação IDA (Iniciar/Desenvolver/Alavancar) não
  mudam, pois são semânticas da metodologia, não da marca da empresa.
  Quando o logotipo veio de um link (URL) externo sem CORS liberado, a
  extração de cor pode não funcionar (limitação do navegador, não do
  sistema) — nesse caso as cores continuam ajustáveis manualmente em
  Configurações. O tema escolhido é salvo e reaplicado automaticamente a
  cada novo login.
- **Logotipo da empresa no canto superior esquerdo**: o menu lateral agora
  mostra o logotipo da empresa (quando definido) no lugar do símbolo do
  Instituto INETRIS, com o nome fantasia da empresa como título — mantendo
  "Metodologia NORTE" como crédito. Sem logotipo definido, continua exibindo
  a marca padrão do Instituto INETRIS, como sempre foi.

## v0.11.1 — Upload de logotipo com 3 opções
- Novo componente reutilizável (`logoUploadWidgetHTML`, em
  `js/02-core-helpers.js`) usado tanto no Cadastro de Empresa quanto em
  Configurações → Identidade Visual. Antes só dava para colar um link
  (URL) da imagem; agora tem 3 opções lado a lado:
  - **Link (URL)** — como já era.
  - **Colar imagem** — cola (Ctrl+V) uma imagem copiada de qualquer lugar.
  - **Enviar arquivo** — escolhe um arquivo de imagem do computador.
  Nos dois novos modos, a imagem é redimensionada no próprio navegador
  (máx. 300px no maior lado) e guardada como base64 — não depende de
  nenhum servidor de upload de arquivos. Preview do logotipo atual sempre
  visível abaixo dos controles.

## v0.11.0 — Integração do Documento 07 (Backlog de Desenvolvimento)
- **Dossiê completo em PDF** (História 5.4, MVP): novo tipo de relatório em
  `js/20-page-relatorios.js` que consolida **Desenho de Cargo + Avaliação +
  PDI (Desenvolvimento e Mentalidade)** de um colaborador em um único PDF —
  antes só existiam PDFs separados de Avaliação e de PDI, e nenhum incluía
  o Desenho de Cargo.
- **% de colaboradores por classificação no dashboard do RH** (História
  5.3): o card "Distribuição por classificação IDA" (que já existia só no
  dashboard do Administrador) agora também aparece no dashboard do RH, e
  passou a mostrar percentual além da contagem absoluta.
- **Mensagem de erro melhorada** para e-mail duplicado no cadastro
  (`js/19-auth.js`): em vez do erro genérico do Supabase, explica que
  e-mail é único em toda a plataforma (não por Empresa) e orienta o que
  fazer. A limitação de arquitetura em si (não dá pra usar o mesmo e-mail
  em duas Empresas) não foi resolvida — está documentada no
  `RECONCILIACAO-RN.md` como decisão pendente de avaliação futura.

## v0.10.0 — Integração do Documento 06 (Protótipos/Wireframes)
- **Cartões de Dimensão (Resultado/Comportamento/Potencial)**: o Diagnóstico
  calculava só por Pilar (N,O,R,T,E) — faltava a agregação por Dimensão que
  as Telas 02 e 06 exigem (RN008/009/010: N+O+R → Resultado, T →
  Comportamento, E → Potencial). Agora `consolidarCiclo` calcula
  `dimensaoMedia`/`dimensaoSigla`, e `diagnosticoSummaryHTML` mostra os 3
  cartões de Dimensão no topo, com o detalhamento por Pilar logo abaixo —
  igual ao layout da Tela 06.
- **"Esqueci minha senha"** (Tela 01): link na tela de login, usando
  `resetPasswordForEmail` do Supabase Auth.
- **Escolher ação do Banco de Ações no PDI** (Tela 08): antes só dava para
  editar o texto livre da ação sugerida automaticamente. Agora o Gestor
  pode trocar por qualquer ação compatível do Banco de Ações (filtrada por
  pilar), que já preenche evidência e prazo sugeridos.
- **RN017 explícito** na tela de Diagnóstico ("somente leitura, nunca
  editável"), como no rodapé da Tela 06.
- **Alerta "N PDIs de Mentalidade pendentes"** no Dashboard do Gestor
  (Tela 03), além do destaque que já existia na tela de Diagnóstico & PDI.
- **Alinhamento de mensagens de estado vazio**: "Sua primeira avaliação
  ainda não foi concluída" (Dashboard Colaborador, Tela 02).

## v0.9.0 — Integração do Documento 05 (Fluxo de Navegação)
Este documento serviu como validação externa da reconciliação de RN feita na
v0.8.0 (todos os códigos citados nele batem com o que já tínhamos corrigido)
e revelou lacunas novas, agora implementadas:

- **Bloqueio de login após 5 tentativas falhas** (Cap. 1.2): implementado no
  cliente (`js/19-auth.js`), com bloqueio de 15 minutos por e-mail. Nota
  importante: isso é uma camada de UX — não substitui rate-limiting real no
  backend/Supabase Auth Hooks, que é o único mecanismo que resiste a alguém
  chamando a API diretamente, fora desta tela.
- **RN022 (toda Ação do PDI precisa de responsável e prazo)**: antes, um
  Gestor podia aprovar um PDI com ações sem prazo definido (o campo aceitava
  ficar como "A combinar" silenciosamente). Agora `aprovarPDI` bloqueia a
  aprovação e lista quais indicadores/eixos ainda estão pendentes, com a
  mensagem oficial do Documento 05.
- **Alerta de ciclo pendente há mais de 15 dias** e **aviso de ciclo
  extraordinário pós-promoção vencendo em 7 dias** (Cap. 2.3/2.5): novos
  itens no painel de pendências do RH.
- **Confirmação antes de desativar usuário** (Cap. 1.3): texto oficial
  "Deseja realmente remover este usuário? Esta ação não apaga seu histórico
  (RN025)."
- **Alinhamento de textos de sistema** com o Documento 05: cadastro de
  empresa, erro de CNPJ duplicado, evidência enviada/recebida.
- **Progresso da avaliação da equipe** no painel do Gestor: "Sua avaliação
  da equipe está X% concluída. Faltam N colaborador(es)."
- **Sugestões de UX oficiais implementadas** (marcadas no documento como
  "não alteram a metodologia"):
  - Destaque visual (borda de alerta) para PDIs de Mentalidade não
    iniciados, no painel "Diagnóstico & PDI".
  - Comparação lado a lado (ciclo atual vs. anterior) na tabela de
    desempenho da equipe do Gestor, com indicador de evolução (↑/→/↓).
  - Frase de reforço da filosofia junto ao PDI de Mentalidade.
  - Checklist de onboarding (Estrutura → Cultura → Cargos → Colaboradores)
    já existia como "Onboarding do tenant" no Dashboard do Administrador —
    confirmado que já atende a sugestão do documento.

## v0.8.1 — Pesos dos avaliadores travados conforme RN003
- **Decisão de produto**: em vez de formalizar a exceção no PRD, os pesos
  dos avaliadores foram travados em Colaborador 25% / Líder Direto 50% /
  RH 25%, exatamente como especifica a RN003 do Documento 04.
- Removidos: o seletor "Modo de avaliação do RH" (RH revisar sem pontuar)
  e o suporte a múltiplos avaliadores de RH — não são mais configuráveis
  em Configurações nem existem mais no cálculo de consolidação do ciclo.
- O RH agora sempre pontua normalmente, como Colaborador e Líder — a única
  forma de o peso de um avaliador ser redistribuído é a ausência formal
  já prevista (avaliador não respondeu dentro do prazo), que continua
  funcionando como antes.
- `RECONCILIACAO-RN.md` atualizado para refletir que a divergência foi
  fechada por travamento, não por atualização do PRD.

## v0.8.0 — Reconciliação com o PRD (Documento 04)
- **Correção RN013**: limite de indicadores personalizados por pilar (T, E)
  ajustado de 5 para 2, conforme o PRD (2 personalizados + 2 padrão da
  metodologia = 4 no total). Antes o sistema divergia do documento oficial.
- **Reconciliação de numeração de RN**: até esta versão, os comentários do
  código e este changelog usavam uma numeração própria de RN001–RN031 que
  não coincidia com a numeração oficial do PRD (Documento 04, Cap. 6) — os
  mesmos códigos apontavam para regras diferentes nos dois lugares (ex.:
  "RN004" no código era o modo de avaliação do RH, mas no PRD é a regra de
  conclusão da Avaliação com os 3 avaliadores). Todas as citações de RN no
  código, no CHANGELOG e no checklist de QA foram revisadas e corrigidas
  para apontar para o código oficial do PRD, ou removidas/reescritas como
  "regra interna" quando não existe RN correspondente no documento. Ver
  `RECONCILIACAO-RN.md` para a tabela completa de correspondência.
- **Extensão documentada (não é mais um RN inventado)**: o modo "RH revisa
  sem pontuar" e o suporte a múltiplos avaliadores de RH (peso redistribuído)
  são uma flexibilização de produto que diverge da RN003 do PRD (pesos fixos
  25/50/25, sem exceção prevista). A funcionalidade foi mantida, mas agora
  está claramente sinalizada na tela de Configurações como uma extensão
  pendente de decisão formal — atualizar o PRD para prevê-la, ou remover a
  flexibilização e travar os pesos em 25/50/25.

## v0.7.0
- RNF011 (LGPD): desligamento e anonimização de colaboradores, preservando
  histórico estatístico agregado.
- RNF012: barramento interno de eventos de domínio (`ciclo.aberto`,
  `diagnostico.gerado`, `pdi.criado`, `pdi.aprovado`, `avaliacao.encerrada`,
  `cargo.desenho_publicado`, `lgpd.dados_anonimizados`), preparando o núcleo
  para integrações futuras sem necessidade de refatoração.

## v0.6.0
- RNF008: correções de responsividade mobile (tabelas com rolagem
  horizontal, linha de avaliação IDA empilhada em telas pequenas).
- RNF003: log de auditoria tornado verdadeiramente append-only (sem UPDATE/
  DELETE, nem para o Administrador).
- RNF002: painel de permissões configuráveis pelo Administrador (Gestor
  abrir ciclo, Gestor acessar Cargos/Desenho, RH acessar Cadastro da Empresa).
- Checklist de QA para testes manuais de isolamento entre tenants e perfis.

## v0.5.0
- Fechamento do fluxo de PDI: construção editável (ação, evidência, prazo,
  responsável), adição de ações personalizadas sempre vinculadas a um
  indicador de origem, e aprovação formal do PDI antes do Acompanhamento.

## v0.4.0
- Dashboards distintos por perfil (Administrador, RH, Gestor, Colaborador),
  cada um com o escopo de dados correto.
- Escopo estendido: permissão de "escopo estendido" para Gestores, concedida
  explicitamente pelo Administrador (extensão de RBAC — PRD Cap. 3, sem RN
  própria; nota: nas versões anteriores este item aparecia rotulado como
  "RN029", código que no PRD pertence a outra regra — natureza do cargo).
- RN025/RN026: confirmação de que nenhuma entidade histórica é excluída
  fisicamente; carimbo de auditoria padrão (criado/atualizado por/em) nas
  principais entidades (nota: rotulado anteriormente como "RN030/RN031").
- Central de pendências por perfil na tela inicial (Cap. 9).
- Registro de reunião de feedback no ciclo.

## v0.3.0
- Módulo de Relatórios: exportação de avaliação e PDI em PDF, consolidado
  por Unidade/Setor e comparativo histórico em Excel.
- Módulo de Configurações: periodicidade de ciclo, modo de avaliação do RH
  (extensão além da RN003 do PRD, não é a regra RN004 do documento oficial),
  identidade visual em relatórios.
- Banco de Ações customizável pela empresa, com sinalização visual de
  origem (metodologia vs. customizada).

## v0.2.0
- Módulo de Usuários e Permissões completo: vínculo à estrutura
  organizacional, desativação de conta sem perda de histórico.
- Módulo de Cultura Organizacional com retrato congelado por ciclo — mudanças
  não afetam retroativamente ciclos já abertos/encerrados (extensão do
  princípio de versionamento, RN024; nota: rotulado anteriormente como
  "RN017", código que no PRD pertence à automação do Diagnóstico).
- Desenho de Cargo com versionamento real (RN024), motivo obrigatório a
  partir da 2ª versão, comparação visual entre versões (diff), e
  "descontinuar" em vez de excluir (nota: rotulado anteriormente como
  "RN019", código que no PRD pertence à listagem de indicadores no PDI de
  Desenvolvimento).
- Módulo de Colaboradores com vínculo completo (critério de aceite do módulo
  — PRD Cap. 5, sem RN própria) e histórico de movimentações (promoção,
  troca de setor/gestor).
- Prazos de avaliação com lembretes (D-5/D-2/D-0) e estado de "Pendência de
  Avaliador" (regra interna, sem RN correspondente no PRD), com opções de
  estender prazo ou registrar ausência formal.
- Reabertura formal de ciclo consolidado (regra interna, sem RN
  correspondente no PRD).

## v0.1.0
- Primeira versão organizada em múltiplos arquivos (antes, tudo vivia em um
  único `index.html`).
- Login e cadastro com código de convite, perfis de acesso (Dono, RH,
  Gestor, Colaborador).
- Módulos de Empresa, Estrutura Organizacional, Banco de Inteligência
  (sugestões por família de cargo — Cap. 11.5, Governança de IA, sempre
  como rascunho editável).
- Botão de gerar dados de teste.
