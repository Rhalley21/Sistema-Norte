# Resultado enviado pelo candidato (R&S)

Nas etapas com teste ou entrega — **Teste DISC e GALT, teste lógico, prova teórica e prova prática** — o candidato **devolve o resultado pelo sistema**: ele anexa até **3 arquivos** (PDF, PNG, JPG ou WEBP, de até **5 MB** cada) e/ou escreve um **texto**, e envia **uma única vez**. Só o **Administrador** e o **RH** veem.

## Como funciona

1. Você move o candidato para a etapa (pelo **Avançar** do quadro ou pelo seletor da ficha).
2. O sistema cria o pedido e o candidato recebe **um e-mail** com: o aviso da etapa, o **Como fazer**, as **orientações e links** que você configurou (por exemplo, onde fazer o teste DISC) e, no fim, o botão **Enviar meu resultado**.
3. O botão abre uma página pessoal (sem login). O candidato anexa os arquivos, vê a lista, pode remover um arquivo, escreve um texto se quiser e clica em **Enviar resultado**.
4. Na **ficha do candidato**, o painel **Resultados enviados pelo candidato** mostra a situação (aguardando, enviado, prazo vencido, cancelado). **Ver resultado** abre o texto e os arquivos por **links temporários de 10 minutos**; cada abertura fica na **Auditoria**. Em "Para você fazer agora", aparece quantos resultados foram enviados.

O link vale **7 dias** (na **prova prática**, vale o prazo de entrega que você definiu na vaga, de 1 a 30 dias). Se o candidato voltar para a mesma etapa, o link anterior é cancelado e um novo é gerado. Quem já enviou o resultado de uma etapa não recebe outro pedido para ela. Se o pedido de resultado falhar, o e-mail da etapa sai mesmo assim, sem o botão, e o RH é avisado.

Painel do RH: **Reenviar link** (gera um novo e invalida o anterior), **Cancelar pedido**, **Excluir** (apaga os arquivos de vez, inclusive a pedido do candidato) e **Pedir o resultado agora** (se o candidato já está na etapa e não tem pedido).

## Regras e segurança

- **O servidor confere cada arquivo:** os primeiros bytes precisam ser de um PDF, PNG, JPG ou WEBP de verdade, do mesmo tipo que o candidato declarou. Arquivo falso (HTML, ZIP, GIF, imagem disfarçada de PDF), vazio, grande demais ou que não chegou faz o servidor **apagar todos os arquivos daquela tentativa** e pedir que o candidato envie de novo. Os **5 MB por arquivo e os formatos** são impostos também pelo próprio armazenamento.
- Os arquivos vão **direto do aparelho do candidato para o armazenamento privado**; a função só autoriza o envio de caminhos específicos e depois confere. Ninguém lê o armazenamento direto: só a função, por link temporário.
- O código do link tem 256 bits e **só o hash fica no banco**. Uma única entrega por pedido. A página do candidato não usa Sentry nem analytics e não envia o endereço adiante.
- O botão no e-mail só aparece com um link **https** de verdade.
- **Retenção: 6 meses.** A rotina diária apaga os arquivos e o registro 6 meses depois do envio (pedidos que nunca receberam nada, 6 meses depois do pedido) e marca como "expirado" os pedidos vencidos.
- Não dá para **excluir a pessoa** do cadastro enquanto houver resultado enviado: exclua o resultado antes (para os arquivos não ficarem órfãos).
- Dados tratados: o que o candidato enviar (por exemplo, o resultado de um teste de perfil), mais o nome e o e-mail informados pela empresa. A empresa é a controladora; o Instituto INETRIS é operador. Veja a Política de Privacidade (item 2.7).

## Para ativar (nesta ordem)

1. Rode `sql/43-entregas-rs.sql` no projeto Principal (cria a tabela e o armazenamento privado **com limite de 5 MB por arquivo**).
2. Implante a Edge Function `entrega-rs` com **"Verify JWT" desligado** (o deploy automático já faz isso pelo `supabase/config.toml`) e **reimplante a `rotinas-agendadas`** (ela passa a mexer na tabela nova, então o SQL vem antes).
3. Suba o site (`git push`).
4. **Faça o teste real abaixo antes de usar com candidatos.**

## Teste real (obrigatório antes de usar)

O envio direto ao armazenamento **não foi possível testar com o Supabase de verdade** no ambiente de desenvolvimento (só com um armazenamento simulado). Faça uma vez:

1. Configure um link de teste em **Orientações e links** (etapa DISC/GALT) e crie um candidato de teste com o **seu e-mail** numa vaga.
2. Mova o candidato para **Teste DISC e GALT** e abra o e-mail. Confira: aviso, "Como fazer", seu link e o botão **Enviar meu resultado**.
3. Clique no botão, anexe um **PDF** e um **print (PNG)**, escreva um texto e envie. Deve aparecer "Resultado enviado!".
4. Na ficha do candidato, clique em **Ver resultado** e confira que o texto aparece e os arquivos abrem.
5. Em Supabase → Storage → `entregas-candidatos`, confira que os arquivos estão lá e que o bucket é **privado**.
6. Teste também um arquivo de mais de 5 MB (deve ser recusado) e exclua o resultado de teste.

## Espaço (plano gratuito)

Cada candidato pode enviar até 15 MB (3 arquivos de 5 MB) por etapa. O plano gratuito do Supabase tem pouco espaço (pelo que sei, cerca de 1 GB no total, dividido com currículos, fotos e vídeos). Acompanhe em Supabase → Storage e **exclua os resultados de quem já foi decidido**. O Supabase Pro resolve com folga.

## Se algo der errado

- **"Link inválido ou expirado":** use **Reenviar link** na ficha.
- **O botão não veio no e-mail:** o pedido falhou (o RH vê um aviso) — confira se a função `entrega-rs` foi implantada com "Verify JWT" desligado e use **Pedir o resultado agora**.
- **O painel diz que não consegue carregar os resultados:** a função `entrega-rs` ainda não foi implantada.
- **O candidato no iPhone não consegue anexar:** fotos em formato HEIC não são aceitas; ele deve tirar um print da tela (PNG) ou exportar em JPG.
