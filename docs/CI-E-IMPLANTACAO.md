# CI e implantação automática

Este projeto tem dois "robôs" no GitHub (pasta `.github/workflows/`):

| Robô | Quando roda | O que faz |
|---|---|---|
| **CI** | A cada `git push` e pull request | Roda lint, formatação, sintaxe, tipos das Edge Functions, sintaxe dos SQL, conferência de tabelas/colunas e os testes. Mostra ✅ ou ❌ ao lado do commit. |
| **Implantar Edge Functions** | Manualmente, ou a cada push que mexe em `supabase/functions/` (se você ligar) | Implanta no Supabase **só as funções que mudaram**, e só depois que o CI passar. Substitui o "colar o código no painel e clicar em Deploy". |

## O que o robô NÃO faz

- **Não aplica os arquivos SQL** (`sql/NN-*.sql`). Eles continuam sendo rodados por você no SQL Editor — mexer no banco automaticamente é arriscado demais por enquanto.
- **Não mexe nos secrets das funções** (chaves de API ficam no Supabase, veja a tabela abaixo).
- **Não publica o site.** O GitHub Pages continua funcionando exatamente como antes.

## Configuração (uma vez só)

**1. Suba os arquivos novos.** Extraia o zip por cima da sua pasta e faça `git add .`, `git commit`, `git push` como de costume. Vão junto a pasta `.github/` (os robôs) e o `.gitignore`.

**2. Confira o CI.** No GitHub, abra a aba **Actions** do repositório: o workflow **CI** deve aparecer rodando e terminar com ✅. Se aparecer ❌, clique nele para ver qual etapa falhou.

**3. Crie um token no Supabase.** Na sua conta do Supabase (não no projeto), procure a área de **Access Tokens** e gere um token novo (por exemplo, com o nome `github-ci`). Copie o valor — ele só aparece uma vez.

**4. Guarde o token no GitHub.** No repositório: **Settings → Secrets and variables → Actions → New repository secret**. Nome: `SUPABASE_ACCESS_TOKEN`. Valor: o token copiado.

**5. Faça uma simulação.** Aba **Actions → Implantar Edge Functions → Run workflow**. Deixe `funcoes = todas` e **deixe "executar" desmarcado**. No resumo da execução aparece a lista de funções e se o "Verify JWT" de cada uma ficará ligado ou desligado. Nada é implantado.

**6. Compare com o painel do Supabase.** Para cada função, o "Verify JWT" do painel precisa ser o mesmo do arquivo `supabase/config.toml`. Atenção especial às 6 públicas, que precisam ficar **desligadas**: `teste-gratis`, `login-bloqueio`, `rs`, `chamado-automatico`, `rotinas-agendadas` e `video-rs`. Se alguma divergir do que você quer, mude no `config.toml` **antes** do próximo passo.

**7. Implante uma função de verdade, de teste.** Run workflow de novo, com `funcoes = login-bloqueio` e **"executar" marcado**. Confira no painel do Supabase que ela foi atualizada e teste o login.

**8. (Opcional) Ligue o automático.** **Settings → Secrets and variables → Actions → aba Variables → New repository variable**: nome `DEPLOY_AUTOMATICO`, valor `true`. A partir daí, todo push que alterar uma função (e passar nos testes) implanta sozinho. Para desligar, apague a variável ou mude para `false`.

## No dia a dia

- Mexeu em código → `git push` → olhe o ✅/❌ do CI.
- Mexeu em uma Edge Function → com o automático ligado, ela sobe sozinha depois do CI passar. Sem o automático, use **Run workflow** (passo 7).
- Criou uma função nova → **adicione uma seção `[functions.nome]` no `supabase/config.toml`** (um teste falha se esquecer) e documente os secrets dela na tabela abaixo.
- Rodar tudo no seu computador antes do push: `npm run verificar`.

## Voltar atrás (rollback)

Faça `git revert <commit>` do commit que causou o problema e dê push: com o automático ligado, a versão anterior volta sozinha. Sem o automático, rode o **Run workflow** depois do revert.

## Secrets de cada função

Ficam no Supabase (**Edge Functions → a função → Secrets**), não no GitHub. O Supabase já entrega `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` a todas elas.

| Função | Secrets que você configura |
|---|---|
| `acesso-sem-email` | nenhum |
| `assistente-ajuda` | `ASSISTENTE_AJUDA_ATIVO` (só `true` liga o assistente — padrão desligado) · `ANTHROPIC_API_KEY` · opcional: `ANTHROPIC_MODEL_AJUDA` |
| `chamado-automatico` | `CRON_SECRET` · opcional: `EMAIL_EQUIPE`, `ASSISTENTE_AJUDA_ATIVO` (só `true` liga a resposta automática por IA — padrão desligado) |
| `enviar-email` | `RESEND_API_KEY` |
| `folha-ponto` | `ANTHROPIC_API_KEY` · opcional: `ANTHROPIC_MODEL` |
| `login-bloqueio` | nenhum |
| `nr1` | nenhum |
| `ponto` | `PONTO_SUPABASE_URL` · `PONTO_SUPABASE_SERVICE_ROLE_KEY` |
| `video-rs` | opcional: `URL_SITE` (endereço de reserva do link do vídeo) |
| `rotinas-agendadas` | `CRON_SECRET` · opcional: `EMAIL_EQUIPE`, `URL_SITE` |
| `rs` | `RECAPTCHA_SECRET_KEY` |
| `teste-gratis` | `RECAPTCHA_SECRET_KEY` |

## Se algo der errado

- **CI vermelho:** clique no ❌, abra a etapa que falhou e leia a mensagem. Quase sempre é um teste ou o lint avisando de algo real.
- **Implantação falhou com "Falta o secret SUPABASE_ACCESS_TOKEN":** refaça os passos 3 e 4.
- **Uma função pública parou de responder (erro 401) depois de implantar:** o "Verify JWT" dela ficou ligado. Confira o `supabase/config.toml` (deve estar `false`) e implante de novo.
- **Quero parar tudo:** apague a variável `DEPLOY_AUTOMATICO`. O CI continua rodando, só a implantação para.

> **Aviso honesto:** esta automação foi escrita e validada (YAML, `actionlint`, scripts e testes), mas a implantação real no seu Supabase só pode ser comprovada rodando-a. Por isso a ordem dos passos acima: simulação, depois uma função de teste, depois o automático.
