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
