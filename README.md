# NORTE — Instituto INETRIS

Sistema de gestão de desempenho baseado na Metodologia NORTE.

## Estrutura do projeto

```
norte-organizado/
├── index.html              → só a estrutura da página (praticamente vazio de propósito)
├── css/
│   └── style.css           → todo o visual do sistema (cores, tipografia, layout)
├── js/                      → a lógica, dividida por responsabilidade
│   ├── 00-logo-asset.js            → logo do Instituto INETRIS (em base64)
│   ├── 01-supabase-client.js       → conexão com o banco de dados (Supabase)
│   ├── 02-core-helpers.js          → funções utilitárias e o "estado" inicial do sistema
│   ├── 03-data-banco-inteligencia.js → biblioteca de competências/indicadores por família
│   ├── 04-data-cbo.js              → biblioteca de cargos (Base CBO)
│   ├── 05-navigation.js            → menu lateral, roteamento entre telas
│   ├── 06-page-usuarios.js         → tela "Usuários & Acesso" (convites)
│   ├── 07-router-dashboard.js      → roteador de páginas + Dashboard
│   ├── 08-page-empresa.js          → tela "Cadastro da Empresa"
│   ├── 09-page-estrutura.js        → tela "Estrutura Organizacional"
│   ├── 10-page-cultura.js          → tela "Cultura Organizacional"
│   ├── 11-page-cargos.js           → tela "Base de Cargos (CBO)"
│   ├── 12-page-desenho.js          → tela "Desenho de Cargo"
│   ├── 13-page-colaboradores.js    → tela "Colaboradores"
│   ├── 14-permissions.js           → regras de quem pode ver/editar o quê
│   ├── 15-page-ciclos-avaliacao.js → o fluxo completo de avaliação (maior arquivo)
│   ├── 16-page-diagnostico.js      → tela "Diagnóstico & PDI"
│   ├── 17-page-inteligencia.js     → tela "Banco de Inteligência"
│   ├── 18-persistence.js          → salvar/carregar dados do Supabase
│   └── 19-auth.js                  → login, cadastro, sessão
└── sql/                     → scripts para rodar no SQL Editor do Supabase, NESSA ORDEM
    ├── 01-schema.sql              → cria as tabelas principais
    ├── 02-auth-trigger.sql        → cadastro cria empresa + perfil automaticamente
    ├── 03-dados-sistema.sql       → tabela onde os dados do sistema ficam salvos
    └── 04-perfis-acesso.sql       → tabela de convites + permissão de ver colegas
```

## Como rodar

Como agora são vários arquivos (não mais um só), **não dá pra abrir clicando duas vezes**
no `index.html` — precisa de um servidor local, do mesmo jeito que já fizemos antes:

```
npx serve .
```

E abrir o endereço que aparecer (ex: `http://localhost:3000`).

## Por que essa divisão

- **`index.html`** fica só com a estrutura, sem lógica nem estilo misturado.
- **`css/style.css`** você mexe quando quiser ajustar cores, espaçamento, fontes — sem
  precisar procurar em meio a código JavaScript.
- **Cada arquivo em `js/`** corresponde a uma tela ou responsabilidade específica do
  sistema. Se quiser mudar algo em "Colaboradores", por exemplo, é só abrir
  `13-page-colaboradores.js` — não precisa abrir um arquivo de 1900 linhas pra achar o
  trecho certo.
- A ordem dos números no nome dos arquivos JS é a ordem que eles são carregados na
  página — mantenha essa ordem se for adicionar algo novo no `index.html`.

## CI (integração contínua) — v0.24.0

Desde a v0.24.0, todo `push` e Pull Request pra branch `main` roda
automaticamente 3 verificações (arquivo `.github/workflows/ci.yml`):

1. **Sintaxe** — confirma que todo arquivo `.js` está sintaticamente válido.
2. **ESLint** — pega erros reais de código (variável/função duplicada,
   chave duplicada num objeto, etc.) — já pegou pelo menos um bug real
   escondido em produção (`js/08-page-empresa.js`, variável `e` que não
   existia, quebrando o salvamento do Cadastro da Empresa).
3. **Prettier** — confirma que o código está formatado de um jeito
   consistente (não formata sozinho no CI, só avisa se estiver fora do
   padrão).

Você vê o resultado direto na aba **"Actions"** do repositório no GitHub,
ou como um ✅/❌ ao lado de cada commit/Pull Request.

### Rodando localmente, antes de subir

```bash
npm install        # só precisa rodar uma vez (ou quando adicionar dependência nova)
npm run check:sintaxe
npm run lint
npm run format:check   # ou "npm run format" pra já corrigir automaticamente
```

### Importante: isso hoje só AVISA, não BLOQUEIA

Por padrão, o GitHub só mostra o resultado (✅/❌) — não impede ninguém de
dar merge numa `main` com o CI vermelho. Pra transformar isso numa
trava de verdade (ninguém consegue mergear com CI falhando), é preciso
ativar manualmente, uma vez, nas configurações do repositório:

1. No GitHub, vai em **Settings** → **Branches** (ou **Rules** → **Rulesets**,
   dependendo da versão da interface).
2. Adiciona uma regra de proteção pra branch `main`.
3. Ativa **"Require status checks to pass before merging"**.
4. Marca o check **"Sintaxe, Lint e Formatação"** (o nome do job definido
   em `ci.yml`) como obrigatório.
5. Salva.

Sem esse passo manual (que só quem tem acesso de administrador do
repositório consegue fazer), o CI roda e avisa, mas não impede
tecnicamente um código quebrado de ir pra `main` — é só esse último passo
que fecha essa porta de vez.
