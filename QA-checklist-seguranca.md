# Checklist de QA — RNF002 (acesso cruzado entre tenants e perfis)

Isso não é algo que dá pra "programar" como uma tela — é um roteiro de testes
manuais pra confirmar que o isolamento de dados está funcionando 100% das vezes.
Rode isso sempre que mexer em permissões ou nas regras de segurança do banco (RLS).

## 1) Isolamento entre empresas (tenants)

- [ ] Crie a Empresa A (cadastro completo, um cargo, um colaborador).
- [ ] Crie a Empresa B (conta de e-mail diferente, cadastro do zero).
- [ ] Logado na Empresa B, confirme que **não aparece nenhum dado da Empresa A**
      em nenhuma tela (Colaboradores, Cargos, Ciclos, Dashboards, Usuários).
- [ ] No SQL Editor do Supabase, rode:
      `select * from dados_sistema;`
      Confirme que existe uma linha por empresa, cada uma com seu próprio `payload`.

## 2) Isolamento entre perfis, dentro da mesma empresa

- [ ] Crie 1 conta de cada papel: Dono, RH, Gestor, Colaborador (via convite).
- [ ] Vincule 2 colaboradores a gestores diferentes (Gestor 1 e Gestor 2).
- [ ] Logado como **Gestor 1**: confirme que só vê o colaborador vinculado a ele
      em Ciclos, Diagnóstico e Dashboard — nunca o do Gestor 2.
- [ ] Logado como **Colaborador**: confirme que só vê o próprio ciclo/histórico,
      nunca dados de outro colaborador.
- [ ] Logado como **RH**: confirme que vê todos os colaboradores/ciclos da empresa.

## 3) Tentativa de acesso indevido (forçar a barra)

- [ ] Logado como Gestor, tente digitar/forçar a URL ou usar o console do
      navegador para chamar `goto('empresa')` ou `goto('usuarios')` —
      confirme que a navegação é bloqueada (mensagem "Você não tem acesso").
- [ ] Logado como Colaborador, tente abrir o ciclo de outro colaborador pelo
      console (`state.cicloAtivo = 'algum-id-de-outro-ciclo'`) — confirme
      que ele é redirecionado de volta (RLS ou `cicloVisivelParaMim` deve barrar).
- [ ] Com a conta de RH, tente gerar um convite de papel "RH" — confirme que
      é bloqueado (só o Dono pode).

## 4) Escopo estendido (extensão de RBAC — PRD Cap. 3, sem RN própria)

- [ ] Sem conceder escopo estendido, confirme que o Gestor só vê a própria equipe.
- [ ] Conceda escopo estendido a esse Gestor (Usuários & Acesso) e confirme que
      o dashboard dele passa a mostrar a empresa toda — mas que ele **ainda não
      consegue editar** ciclos fora da própria equipe.
- [ ] Revogue o escopo estendido e confirme que ele volta a ver só a equipe.

## 5) Contas desativadas

- [ ] Desative uma conta de Colaborador.
- [ ] Confirme que essa pessoa não consegue mais logar (mensagem de conta desativada).
- [ ] Confirme que o histórico de avaliações dela continua visível pra quem
      tinha acesso antes (RH, Gestor) — nada foi apagado.

---
Se algum item desta lista falhar, é uma prioridade de segurança — trate como
bug crítico antes de qualquer outra coisa.
