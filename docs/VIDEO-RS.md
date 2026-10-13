# Vídeo de apresentação do candidato (R&S)

Etapa **Vídeo de apresentação** do processo seletivo: o candidato grava (ou escolhe) um vídeo de **no máximo 2 minutos** e envia por um link pessoal, sem login. Só o **Administrador** e o **RH** assistem.

## Como usar (RH)

1. A vaga precisa usar a etapa **Vídeo de apresentação** (em R&S → a vaga → "Etapas do processo desta vaga").
2. **Mover o candidato para a etapa "Vídeo de apresentação"** já cria o pedido e **envia o link por e-mail**, com as orientações da vaga (ou da empresa) — veja "Orientações e links das etapas" em R&S — Processo seletivo. Se o candidato não tem e-mail, o sistema gera o link para você copiar.
3. No funil, o painel **Vídeo de apresentação** do candidato mostra a situação: _aguardando o candidato_, _vídeo enviado_, _prazo vencido_ ou _cancelado_.
4. **Assistir** abre o vídeo por um link temporário de **10 minutos**; cada abertura fica na **Auditoria**.
5. **Reenviar link** (gera um link novo e invalida o anterior), **Cancelar pedido** e **Excluir vídeo** (apaga o arquivo de vez — por exemplo, a pedido do candidato).

O link vale **7 dias**. Cada candidato tem uma única entrega: depois de enviado, o vídeo não pode ser trocado (para pedir outro, o RH exclui o atual).

## Como funciona para o candidato

- Escolhe **Gravar agora** (pela câmera do aparelho; fica em torno de 15 MB para 2 minutos, e **para sozinho aos 2 minutos**) ou **Escolher um arquivo** (MP4, WebM ou MOV de até **40 MB**).
- Assiste ao vídeo antes de enviar e pode gravar de novo.
- A página confere a duração do arquivo escolhido (no máximo 2 minutos) e o tamanho **antes** de enviar.
- Vê um aviso: o vídeo será visto só pela equipe de recrutamento, usado só neste processo e guardado por **6 meses**.

## Regras e segurança

- **2 minutos:** conferido no navegador do candidato. O servidor não "assiste" o vídeo, então a trava de verdade é o **tamanho máximo de 40 MB**, imposto pelo próprio armazenamento. A duração informada fica registrada e o RH vê um aviso quando passa de 2 minutos.
- **O arquivo é conferido pelo servidor:** os primeiros bytes precisam ser de um vídeo MP4/MOV/WebM de verdade. Imagem, PDF, arquivo vazio ou arquivo de formato diferente do declarado é **apagado** e recusado.
- O vídeo vai **direto do aparelho do candidato para o armazenamento privado** (a função só autoriza o envio de _um_ caminho e depois confere). Ninguém lê o armazenamento direto: só a função, por link temporário.
- O código do link tem 256 bits e **só o hash fica no banco**. A página do candidato não usa Sentry nem analytics e não envia o endereço adiante.
- **Retenção: 6 meses.** A rotina diária apaga o arquivo e o registro 6 meses depois do envio (pedidos que nunca receberam vídeo, 6 meses depois do pedido). Pedidos vencidos viram "expirado".
- Dados tratados: imagem e voz do candidato, nome e e-mail informados pela empresa. A empresa é a controladora; o Instituto INETRIS é operador. Veja a Política de Privacidade (item 2.7).

## Para ativar

1. Rode `sql/42-videos-rs.sql` no projeto Principal (cria a tabela e o armazenamento privado **com limite de 40 MB**).
2. Implante a Edge Function `video-rs` com **"Verify JWT" desligado** (a porta do candidato não tem login; o deploy automático já faz isso pelo `supabase/config.toml`). Reimplante também a `rotinas-agendadas`.
3. Opcional: secret `URL_SITE`.
4. Suba o site (`git push`).
5. **Faça o teste real abaixo antes de usar com candidatos.**

## Teste real (obrigatório antes de usar)

O envio direto ao armazenamento **não foi possível testar com o Supabase de verdade** no ambiente de desenvolvimento (só com um armazenamento simulado). Faça uma vez:

1. Crie uma vaga de teste que use a etapa de vídeo e um candidato com o **seu e-mail**.
2. Mova o candidato para **Vídeo de apresentação** e abra o link que chegou.
3. Grave 10 segundos pela página, confira a prévia e **envie**. Deve aparecer "Vídeo enviado!".
4. No funil, o painel deve mostrar _Vídeo enviado_; clique em **Assistir** e confira que o vídeo toca.
5. Em Supabase → Storage → `videos-candidatos`, confira que o arquivo está lá e que o bucket é **privado**.
6. Teste também **Escolher um arquivo** com um vídeo curto do celular e com um de mais de 40 MB (deve ser recusado).
7. Exclua o vídeo de teste.

Se o envio falhar com erro de tamanho, confira em Supabase → Storage → Settings se o **limite global de arquivo** do seu plano é pelo menos 40 MB.

## Espaço (plano gratuito)

O plano gratuito do Supabase tem pouco espaço de armazenamento (pelo que sei, cerca de 1 GB no total, dividido com currículos e fotos do sistema). Cada vídeo de 2 minutos gravado pela página fica em torno de 15 MB; um arquivo escolhido pode chegar a 40 MB. Ou seja: algumas dezenas de vídeos já enchem o espaço. Acompanhe em Supabase → Storage e **exclua os vídeos de quem já foi decidido**. O Supabase Pro resolve com folga.

## Se algo der errado

- **"Link inválido ou expirado":** o link vale 7 dias e só o link mais recente funciona. Use **Reenviar link**.
- **O candidato não consegue gravar:** o navegador precisa permitir câmera e microfone; ele pode escolher um arquivo.
- **O painel diz que não consegue carregar os vídeos:** a função `video-rs` ainda não foi implantada (ou está com "Verify JWT" ligado).
