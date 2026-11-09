# Teste grátis: como funciona e o que mudou

O teste grátis é a porta de entrada dos leads: a pessoa preenche um formulário na página inicial e recebe um código para criar a conta da empresa dela, com **7 dias** de uso completo, sem compromisso.

## O caminho do lead

1. **Página inicial**: nome, e-mail, empresa e (opcional) telefone, mais o "não sou um robô". Perto do botão há o aviso de privacidade, com os links dos Termos e da Política.
2. **Tela de sucesso**: mostra o **código na tela** (com botão de copiar) e o botão **Criar minha conta agora**. O e-mail com o código vai junto, como reforço.
3. **Cadastro no sistema**: abre já na aba Cadastrar, com o código, o nome, o e-mail e a empresa preenchidos. Falta só a senha e o aceite dos Termos. Se a pessoa vier só pelo botão do e-mail (outro aparelho), vem preenchido o código.
4. **Os 7 dias** contam a partir do cadastro. O sistema mostra "faltam X dias".
5. **Avisos automáticos ao Administrador da empresa** (e-mail, com link do WhatsApp e dos planos): 2 dias antes do fim, no último dia, 1 dia depois e 7 dias depois. Você recebe um resumo diário dos testes perto do fim.
6. **No 8º dia** o acesso é pausado, **sem apagar nenhum dado**. A tela de entrada diz "Seus dados continuam guardados" e mostra o botão **Falar no WhatsApp para continuar**. Para liberar, use **Marcar como pagante** no Super Admin.

## O que mudou na versão 0.130.0

| Antes | Agora |
|---|---|
| O código só chegava por e-mail. Se o e-mail falhasse ou caísse no spam, **ninguém ficava sabendo** e a tela dizia "Teste liberado!". | O código aparece **na tela** e vai por e-mail. O servidor **confere se o e-mail saiu**. Se não saiu, **você recebe um aviso com o código** para entregar à mão. |
| O e-mail dizia "acesse o sistema" (sem link) e "responda este e-mail" (as respostas não chegam a ninguém). | O e-mail tem o botão **Criar minha conta agora** (com o código já preenchido) e o link do **WhatsApp** para dúvidas. |
| O lead digitava de novo nome, e-mail, empresa e o código, à mão, no celular. | Vem preenchido. **Só o código** vai no endereço; nome, e-mail e empresa passam pela sessão do navegador e nunca pelo endereço (que aparece em histórico e em ferramentas de erro). |
| Limite de **3 pedidos por IP a cada 24 h**, contando até pedidos com erro. Celulares de uma operadora compartilham o IP e leads legítimos eram barrados. | Pedidos com erro **não gastam a cota**. Limites: 10 pedidos válidos por IP por dia, **2 por e-mail por dia** (evita encher a caixa de alguém) e 30 tentativas por hora por IP (barra quem martela). |
| Quem perdia o e-mail pedia de novo e gerava **outro** código. | Se pedir de novo em 24 h e o código ainda não foi usado, **recebe o mesmo código** e o e-mail de novo. Sem aviso duplicado à equipe. |
| Você só via o lead no Super Admin. | **Cada teste novo manda um e-mail à equipe** (nome, e-mail, empresa, telefone e código). |
| A mensagem do 8º dia não dizia como contratar. | Mostra o botão de WhatsApp. |
| O e-mail de boas-vindas, os convites, os e-mails de avaliação e a tela de nova senha diziam "Plataforma **NORTE**". | Todos dizem **INETRIS**. |
| A mensagem de erro da tela de entrada ia **sem escape** para o HTML. | Escapada. |

## Para ativar (nesta ordem)

1. **Suba o site** com o zip 0.130.0.
2. **Atualize a função `teste-gratis`** no Supabase: Edge Functions, `teste-gratis`, cole o código novo e faça o Deploy. **Confira de novo que "Verify JWT" está DESLIGADO** (colar código pode religar).
3. **Segredos** (Edge Functions, Secrets):
   - `URL_SITE`: o endereço do site com a barra no fim. Hoje é `https://rhalley21.github.io/Sistema-Norte/`. **Quando o domínio novo estiver no ar, troque para `https://sistema.inetris.com.br/`.**
   - `EMAIL_EQUIPE`: quem recebe o aviso de cada teste novo. Sem ele, vai para `inetris25@gmail.com`.
4. Não há SQL novo nesta versão.

## Teste real (10 minutos, antes de divulgar)

Use um e-mail seu que você consiga abrir.

1. Na página inicial, peça o teste. **O código deve aparecer na tela.**
2. Confira o seu e-mail: o código e o botão **Criar minha conta agora** devem estar lá (veja também o spam). **E o aviso de teste novo deve chegar à equipe.**
3. Clique no botão da tela. O cadastro deve abrir na aba **Cadastrar**, preenchido.
4. Abra o botão do **e-mail** em outro aparelho: só o código deve vir preenchido.
5. Peça o teste de novo com o **mesmo e-mail**: deve vir o **mesmo código**. Um terceiro pedido no dia deve ser barrado com a mensagem sobre "duas vezes hoje".
6. Crie a conta, entre e confirme o aviso "faltam X dias".

## O que continua dependendo de você (eu não consigo ver nem fazer)

- **reCAPTCHA**: a chave da página inicial precisa listar `sistema.inetris.com.br` no painel do Google. **Sem isso o "não sou um robô" falha e ninguém consegue se cadastrar.**
- **Supabase, Authentication, URL Configuration**: o "Site URL" e as URLs de redirecionamento precisam apontar para o domínio novo (os links de **redefinir senha** dependem disso).
- **Entrega de e-mail**: testar se os e-mails de `notificacoes@inetris.com.br` chegam na caixa de entrada (Gmail, Outlook, Hotmail) e não no spam.
- **Caixa de e-mail** do domínio, para as respostas dos leads.

## O que ainda não foi feito

- O bloqueio do 8º dia vale **só no navegador** (quem fica logado continua usando, e o banco não confere o prazo).
- Não há política de **limpeza dos dados** de testes abandonados.
- Senha mínima de 6 caracteres.
- O sistema **depois do login, no celular**, ainda não foi medido (a página inicial e as telas de entrada e de cadastro foram).
- Os e-mails de lembrete de ciclo (função `rotinas-agendadas`) ainda dizem "Plataforma NORTE": mexer neles exige reimplantar outra função.
