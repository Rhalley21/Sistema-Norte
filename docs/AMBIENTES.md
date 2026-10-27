# Ambientes (produção e teste), deploy e migrações

## O que existe hoje e o que vem depois

- **Produção:** o projeto Supabase Principal e o site de hoje. É o que está no ar.
- **Teste:** um **segundo** projeto Supabase (dados fictícios) e um **segundo** site (outro repositório do GitHub). **Ainda não existe**: o plano gratuito do Supabase não comporta mais um projeto. Tudo o que depende dele está **preparado e desligado**, e liga quando o Supabase Pro chegar.

O fluxo final:

> mudança → ramo `teste` → o CI roda os testes e publica o **site de testes** → você confere no ambiente de testes → só então a mudança vai para o ramo `main` (**produção**)

## Como o site sabe em qual ambiente está

O arquivo **`ambiente.js`** guarda os dois ambientes (endereço e chave **pública** do Supabase de cada um) e escolhe pelo **endereço do site**: endereço com `teste.` ou `staging.` no começo, ou com `-teste` no caminho (por exemplo, `.../Sistema-Norte-teste/`), é o ambiente de **teste**; qualquer outro é **produção**. Não dá para trocar de ambiente por parâmetro da URL: o site de produção nunca fala com o banco de testes. Enquanto o projeto de testes não existir, o site de testes mostra uma faixa vermelha e **não fala com ninguém**.

A chave que aparece em `ambiente.js` é a chave **pública** (publishable), feita para ficar no navegador. A chave secreta do Supabase **nunca** vai para o site (um teste confere).

## Variáveis e segredos do GitHub

Em **Settings → Secrets and variables → Actions**.

| Nome | Tipo | Para quê | Quando criar |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Secret | Permite implantar funções e consultar o banco pelo GitHub | Antes de usar o deploy automático ou o verificador de migrações |
| `DEPLOY_AUTOMATICO` | Variável (`true`) | Implanta as funções a cada push na `main` | Só depois de ver uma simulação correta |
| `PROJETO_PRODUCAO` | Variável (opcional) | Código do projeto de produção (se vazio, usa o atual) | Não precisa |
| `PROJETO_TESTE` | Variável | Código do projeto Supabase de testes | Quando ele existir |
| `MIGRACOES_AUTOMATICAS_PRODUCAO` | Variável (`true`) | **Libera** aplicar SQL em produção pelo GitHub | **Só** depois do Supabase Pro e de testar no ambiente de testes |
| `PUBLICAR_TESTE` | Variável (`true`) | Liga a publicação do site de testes | Quando o repositório de testes existir |
| `REPO_TESTE` | Variável | Repositório do site de testes (ex.: `Rhalley21/Sistema-Norte-teste`) | Idem |
| `TOKEN_REPO_TESTE` | Secret | Token com permissão de escrita **só** no repositório de testes | Idem |

## Migrações do banco: como funcionaria "sozinho"

Cada arquivo da pasta `sql/` a partir do **15** se registra, no fim, na tabela `migrations_aplicadas`. O fluxo **Migrações do banco** (Actions → Run workflow) faz o que você faz à mão, mas sem esquecer de nada:

1. Lê os arquivos `sql/` que se registram sozinhos.
2. Pergunta ao banco quais já estão registrados.
3. **Lista os que faltam**, na ordem numérica.
4. **Só se você mandar** (caixinha "executar"): aplica um por um, na ordem, **para no primeiro erro** e confere se cada arquivo se registrou.

Travas:
- Por padrão é **simulação** (só lista). Foi o que teria avisado sobre a coluna `perfil` e as migrações 34 e 38.
- Aplicar em **produção** exige, além da caixinha, a variável `MIGRACOES_AUTOMATICAS_PRODUCAO = true`. Sem ela, o fluxo recusa.
- Nunca imprime o token nem o conteúdo do SQL.
- É **só manual**: não roda sozinho a cada push.

**Atenção:** o formato da API do Supabase usada aqui **não foi verificado contra o Supabase de verdade**. Por isso a primeira execução deve ser uma **simulação**, para você conferir se a lista bate com o que você sabe que está aplicado. Em um projeto no plano gratuito **não há backup**: só libere a aplicação automática em produção depois do Supabase Pro (que tem backup diário) e depois de passar pelo ambiente de testes.

## Passo a passo quando o Supabase Pro chegar

1. Contratar o Supabase Pro. Anotar o custo de um projeto adicional.
2. Criar o **projeto Supabase de testes**. Rodar à mão os arquivos `sql/01` a `sql/14` (base do sistema) e, depois, usar o fluxo **Migrações do banco** (ambiente `teste`) para aplicar do 15 em diante.
3. Implantar as Edge Functions no projeto de testes (fluxo **Implantar Edge Functions**, ambiente `teste`) e criar os segredos delas. **Cuidado com e-mails:** use uma chave de e-mail de teste no projeto de testes, para o ambiente de testes não mandar e-mail de verdade a candidatos.
4. Criar o repositório de testes e ligar o GitHub Pages nele. Criar `REPO_TESTE`, `TOKEN_REPO_TESTE` e `PUBLICAR_TESTE = true`.
5. Preencher o ambiente `teste` em `ambiente.js` (endereço e chave **pública** do projeto de testes) e criar `PROJETO_TESTE`.
6. No projeto de testes: configurar a URL do site em **Authentication → URL Configuration** e liberar o endereço de testes na chave do reCAPTCHA.
7. Criar o ramo `teste` e fazer o primeiro push nele. O CI roda e o site de testes é publicado.

## Rotina de trabalho depois disso

1. A mudança vai para o ramo `teste`. O CI roda os testes e publica o site de testes.
2. Você confere no site de testes (com dados fictícios).
3. Estando certo, a mudança vai para `main` (produção). Se o SQL mudou, rode **Migrações do banco** como simulação, confira a lista e aplique.

## O que não foi testado

- A API de consulta do banco usada pelo verificador de migrações.
- A publicação do site de testes e o deploy no projeto de testes, que dependem do segundo projeto e do repositório de testes.
- O comportamento do site de testes em um navegador de verdade.
