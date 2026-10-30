# Salvamento seguro: duas pessoas usando ao mesmo tempo

## O problema que isto resolve

Todos os dados de uma empresa ficam em **um documento** no banco. Antes, quem salvava **sobrescrevia o documento inteiro** com o que estava na tela dele, sem nenhuma verificação. Exemplo:

> A (RH) abre o sistema às 9h. B (líder) salva uma avaliação às 9h05. A, que ainda tem a tela das 9h, move um candidato. O sistema de A grava o documento inteiro, e **a avaliação de B desaparece, sem aviso**.

O aviso em tempo real ("Atualizar" com um pontinho) só avisava, não impedia nada, e nem aparecia se você estivesse trabalhando nos últimos 4 segundos.

## Como funciona agora

1. **Versão.** Cada gravação sobe um número de versão do documento (`dados_sistema.versao`, criado pelo `sql/44`). Um gatilho do banco faz isso em **qualquer** atualização, inclusive de navegadores antigos ou de funções do servidor.
2. **Gravação condicional.** O navegador só grava se a versão ainda for a que ele carregou. Quem confere é o próprio banco, de forma atômica (`UPDATE ... WHERE versao = ...`).
3. **Combinar em vez de sobrescrever.** Se outra pessoa gravou antes, o sistema busca a versão nova e **combina** as duas alterações, comparando três versões (a que você carregou, a que está na sua tela e a que está no servidor):
   - só você mudou → vale o seu; só o outro mudou → vale o dele;
   - objetos → combina campo a campo;
   - **listas de itens com `id`** (candidatos, colaboradores, ciclos, vagas...) → combina **item por item**: dois RHs movendo candidatos diferentes não se atrapalham, e candidato novo de cada um entra;
   - listas que só crescem (histórico) → junta os acréscimos dos dois;
   - **mesmo campo do mesmo item mudado pelos dois** → é conflito: **vale o seu** e a pessoa é avisada (a Auditoria guarda só o número de pontos e as áreas, nunca os valores);
   - um apagou e o outro **alterou** → o item **fica** (perder dado é pior do que sobrar um item).
4. **Só grava o que você mudou.** Se nada mudou, não grava e ninguém recebe o aviso do pontinho à toa.
5. **Uma gravação de cada vez**, com até 4 tentativas se outras pessoas gravarem sem parar. Se falhar (por exemplo, sem internet), a alteração continua marcada como "não salva", o sistema avisa uma vez e tenta de novo; **fechar a aba com alteração não salva pede confirmação**.
6. **A tela não é redesenhada sozinha** depois de combinar (poderia apagar um formulário que você esteja preenchendo). O botão **Atualizar** ganha o pontinho, e a próxima ação já mostra o resultado combinado.

O que você vê quando acontece: uma mensagem curta, "Suas alterações foram combinadas com as que outra pessoa fez ao mesmo tempo."

## Para ativar (nesta ordem)

1. Rode `sql/44-dados-sistema-versao.sql` (use o arquivo **sem aspas** para colar do computador). Pode rodar de novo sem problema.
2. Suba o site (`git push`).

**A ordem é segura nos dois sentidos:**
- Se o **site subir antes do SQL**, o sistema percebe que a coluna ainda não existe e funciona no **modo antigo** (como antes), com um aviso no console. Quando o SQL rodar, o próximo carregamento já volta ao modo seguro.
- Um navegador **antigo**, com a página em cache, continua funcionando; as gravações dele também sobem a versão (pelo gatilho), então os navegadores novos detectam e combinam.

**Para desfazer** (se algo der errado): `drop trigger trg_dados_sistema_versao on dados_sistema;`. O sistema continua gravando; só deixa de detectar conflitos.

## Teste real em duas janelas (obrigatório antes de depender disto)

Eu só consegui testar com um banco simulado. Faça uma vez:

1. Abra o sistema em **dois navegadores** (ou uma janela normal e uma anônima), entrando como dois usuários ou como o mesmo usuário.
2. Na janela **B**: em **Recrutamento**, cadastre a pessoa **"Teste B"** e espere 3 segundos.
3. Na janela **A** (sem atualizar a tela): cadastre a pessoa **"Teste A"** e espere 3 segundos.
   **O que ler:** na janela A deve aparecer "Suas alterações foram combinadas com as que outra pessoa fez ao mesmo tempo." e o botão Atualizar ganha um pontinho.
4. Nas duas janelas, clique em **Atualizar** (ou aperte F5). **As duas pessoas, "Teste A" e "Teste B", devem existir nas duas janelas.**
5. Conflito de verdade: nas duas janelas abra a mesma pessoa e troque o nome (A para "Nome A", B para "Nome B"), salvando B primeiro e A depois. **O que ler:** A recebe "...em 1 ponto(s) as duas mexeram no mesmo campo e prevaleceu a sua." e o nome final é "Nome A".
6. Limpe: exclua as pessoas de teste.

Conferências no Supabase (SQL Editor):

select column_name from information_schema.columns where table_name = $$dados_sistema$$ and column_name = $$versao$$;

**O que ler:** uma linha com `versao`.

select tgname from pg_trigger where tgrelid = $$dados_sistema$$::regclass and not tgisinternal;

**O que ler:** `trg_dados_sistema_versao`.

select empresa_id, versao, atualizado_em from dados_sistema order by atualizado_em desc limit 5;

**O que ler:** a coluna `versao` aumenta a cada alteração.

## Limites (seja honesto com o cliente)

- **Mesmo campo, ao mesmo tempo:** vale o último a gravar; quem perdeu é avisado, mas a alteração dele naquele campo é descartada. É o caso mais raro (as duas pessoas mexendo exatamente no mesmo campo no mesmo minuto).
- **Texto longo editado por duas pessoas** (por exemplo, o currículo de um candidato) não é combinado palavra a palavra: vale o último.
- **Listas de objetos sem `id`** que as duas pessoas alteram viram um bloco: vale a lista de quem gravou por último. As listas principais do sistema têm `id`.
- **Reordenar** listas não é combinado (vale a ordem do servidor).
- **Tamanho:** cada gravação ainda envia o documento inteiro (não só a diferença). O desempenho é como antes; empresas muito grandes continuam sendo um limite do desenho atual (um documento por empresa).
- **Telas e dados que ficam em tabelas próprias** (ponto, NR1 no servidor, vídeos, resultados de candidatos) **não** passam por este mecanismo; cada um tem o seu controle.
- **Não foi testado com o Supabase de verdade.** Veja o teste real acima.
