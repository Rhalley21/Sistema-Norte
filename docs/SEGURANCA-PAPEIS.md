# Segurança por papel (correção urgente, versão 0.126.0)

## O que foi encontrado

Uma auditoria automática de todas as regras de segurança do banco (hoje em **docs/MATRIZ-RLS.md**) e testes contra um **Postgres de verdade** mostraram que **a tela escondia o que o banco deixava fazer**. Qualquer pessoa logada, inclusive um colaborador, usando o navegador (F12) ou a API, conseguia:

| # | Brecha | Provada em teste? |
|---|---|---|
| 1 | **Virar Administrador** (mudar o próprio papel) | Sim, funciona no banco antigo |
| 2 | **Criar convite para o papel RH** e, com ele, criar uma conta de RH | Sim |
| 3 | **Sobrescrever ou apagar o documento inteiro** de dados da empresa | Sim |
| 4 | **Editar a própria empresa**: ligar o módulo pago, estender o teste grátis, tirar a suspensão | Sim |
| 5 | Uma conta **desativada** continuava lendo os dados | Sim |
| 6 | **Tabelas antigas** abertas a qualquer pessoa da empresa | Sim |

**Correção de uma afirmação anterior:** eu tinha dito que também era possível "entrar em outra empresa" mudando o `empresa_id` do próprio perfil. **Isso não era possível**: o banco recusa. O teste contra o Postgres real mostrou que eu estava errado, e agora há um teste que garante que continua impossível.

## O que a correção faz (`sql/45-seguranca-papeis.sql`)

- **Perfis:** o papel só muda assim. O **Administrador** promove a RH, líder ou colaborador; o **RH** troca entre líder e colaborador; **ninguém** vira Administrador, muda o próprio papel nem mexe no papel do Administrador. Só Administrador e RH desativam (o RH só líder e colaborador; ninguém desativa a si mesmo nem o Administrador). Coluna nova ou não prevista é **negada por padrão**.
- **Empresas:** só o **Administrador** edita o cadastro (razão social, nome fantasia, CNPJ, segmento, porte, tipo). **Plano, licença, teste grátis, suspensão e pagamento** só o **super admin** (e o servidor) mudam.
- **Convites:** só Administrador e RH veem e criam; **só o Administrador convida RH**. O cadastro por convite continua funcionando (testado).
- **Documento da empresa:** **ninguém grava direto na tabela**. A gravação passa por uma função do banco (`salvar_dados_areas`) que **confere o papel de novo** e só aceita as áreas que ele pode gravar (tabela abaixo). Áreas recusadas são **registradas** (`seguranca_log`) e o resto grava.
- **Conta desativada:** sem empresa, sem papel e sem dados na hora (a regra é consultada a cada pedido). Ela ainda enxerga o próprio perfil, para o sistema dizer "conta desativada".
- **Tabelas antigas** (substituídas pelo documento): sem acesso pela API.

### Quem grava qual área do documento

| Área | Administrador | RH | Líder | Colaborador |
|---|:-:|:-:|:-:|:-:|
| empresa | ✓ | | | |
| estrutura, cultura, cargos, configuracoes, nr1 | ✓ | ✓ | | |
| rs (recrutamento) | ✓ | ✓ | ✓ | |
| colaboradores, bancoAcoes, ciclos, feedbackContinuo, pesquisasClima | ✓ | ✓ | ✓ | ✓ |

O navegador tem a mesma tabela (`AREAS_GRAVAVEIS_POR_PAPEL`), e um teste confere que as duas são **idênticas**. O navegador envia **só as áreas que a pessoa mudou**, o que também elimina o risco de uma tela velha apagar áreas que ela nem mexeu.

## Ordem para ativar: SITE PRIMEIRO, SQL DEPOIS

1. **Suba o site** (`git push` com o zip **0.126.0**). Ele funciona nos dois mundos: se o banco ainda não tem a função, grava como antes.
2. Rode o **`sql/44`** (se ainda não rodou), e depois o **`sql/45`**, **os dois na versão sem aspas** (copie do arquivo, não do chat).
3. Faça o teste abaixo.

**Por que essa ordem:** se o SQL 45 rodar **antes** de o site novo estar no ar, o site antigo tenta gravar direto na tabela, o banco recusa, e **ninguém consegue salvar** até o site subir.

Depois do passo 2, páginas antigas ainda abertas em navegadores mostram "Não foi possível salvar... Atualize a página (Ctrl+F5)": é o esperado.

## Conferências no Supabase (SQL Editor)

select tgname from pg_trigger where tgrelid = $$perfis$$::regclass and not tgisinternal;

**O que ler:** `trg_perfis_proteger_colunas`.

select proname from pg_proc where proname = $$salvar_dados_areas$$;

**O que ler:** uma linha com o nome da função.

select policyname from pg_policies where tablename = $$convites$$ order by policyname;

**O que ler:** quatro regras, `convites_apaga`, `convites_atualiza`, `convites_cria` e `convites_le`.

## Teste real com três contas (obrigatório)

Use **contas de teste**, uma de **Administrador**, uma de **RH** e uma de **colaborador**. Eu só consegui testar contra um Postgres simulado, não contra o Supabase de vocês.

**1. Uso normal (o que não pode quebrar):**
- Como **Administrador**: edite o cadastro da empresa, convide um colaborador e convide um RH. Tudo deve funcionar.
- Como **RH**: convide um líder (deve funcionar); tente convidar RH (a tela já bloqueia).
- Como **colaborador**: abra suas avaliações, responda algo e **espere 3 segundos**. Recarregue a página (F5): a alteração deve ter ficado.

**2. Tentativas de abuso (todas devem FALHAR).** Logado como **colaborador de teste**, aperte **F12**, abra **Console** e cole um comando por vez:

await sb.from('perfis').update({ papel: 'owner' }).eq('id', meuPerfilId)

**O que ler:** um erro com `sem_permissao:papel`. Se vier `error: null`, a correção **não** está valendo e essa conta virou Administrador: reverta em Usuários, como Administrador.

await sb.from('convites').insert({ empresa_id: empresaIdAtual, codigo: 'TESTE-' + Date.now(), papel: 'rh' })

**O que ler:** um erro de "row-level security". Se não vier erro, foi criado um convite `TESTE-...`: apague-o no Supabase.

await sb.from('dados_sistema').update({ atualizado_em: new Date().toISOString() }).eq('empresa_id', empresaIdAtual)

**O que ler:** `permission denied for table dados_sistema`. (Este comando é inofensivo mesmo se funcionar: só muda a data.)

**3. Desativar:** como Administrador, desative uma conta de teste. Em outro navegador, com essa conta, tente abrir o sistema: deve aparecer "conta desativada" (e nenhum dado).

## Se algo der errado

- **Ninguém consegue salvar:** o site novo não está no ar, ou a página está em cache. Confira a versão no rodapé, aperte Ctrl+F5.
- **Uma ação de um papel "não persiste":** veja o que o banco recusou: `select papel, detalhes, criado_em from seguranca_log order by criado_em desc limit 20;`. Se for uma área que aquele papel **deveria** poder gravar, me mande o resultado e ajusto a tabela (nos dois lados, com teste).
- **Emergência (o 45 impede o sistema de funcionar):** rode `sql/emergencia/reverter-45.sql` (**isso reabre as brechas**). Instruções em `docs/CONTINUIDADE.md`.

## O que AINDA não está resolvido (seja honesto com o cliente)

1. **Leitura:** qualquer pessoa da empresa ainda **lê todas as áreas** do documento pela API (CPF e telefone de colaboradores, avaliações de todos, candidatos, NR1). É a **etapa 2** (cada papel recebe só as áreas que pode ler) e a **etapa 3** (filtro por equipe e por pessoa).
2. **Dentro de uma área permitida, ainda dá para mexer no que é de outro.** Um colaborador pode alterar `ciclos` e `colaboradores` pela API (as áreas que a tela dele usa). A etapa 3 resolve.
3. **O RH é de confiança total** (ele grava quase tudo e vê todos os dados).
4. **Sem verificação em duas etapas** (decisão: opcional por enquanto, ainda não construída).
5. Os testes são contra um **Postgres simulado com as mesmas migrações**. O que muda no Supabase real (extensões, permissões padrão) foi reproduzido, mas **só o teste real com três contas** confirma.
