# Changelog — Plataforma NORTE

Registro de versões da própria plataforma (não confundir com o versionamento
de Desenho de Cargo, que é por cargo/empresa — ver RN024).

## v0.24.1 — Natureza do cargo agora é editável no Desenho de Cargo
Lacuna encontrada: o campo "Natureza" (Operacional / Apoio / Estratégica)
só era definido na hora de importar um cargo da Base CBO ou criar do
zero — depois disso, não existia nenhum jeito de mudar, mesmo sendo
exibido na tela de Desenho de Cargo. Isso impedia, por exemplo, promover
um cargo pra "Estratégica" depois de já criado — necessário pra ele
aparecer no Mapa de Sucessão (v0.21.0), que só considera posições-chave
com essa natureza.

Adicionado um campo de seleção editável na seção "1. Identificação do
Cargo", salvo tanto ao gravar rascunho quanto ao publicar uma nova versão.

## v0.24.0 — CI: sintaxe, lint e formatação em todo push/PR
Até agora, nada impedia um código quebrado de ir pra `main` — cada
verificação dependia de eu (ou você) lembrar de testar manualmente antes
de subir. Agora existe um pipeline de CI (`.github/workflows/ci.yml`) que
roda automaticamente em todo `push` e Pull Request pra `main`, com 3
checagens: sintaxe de todo arquivo `.js`, ESLint (erros reais de código) e
Prettier (formatação consistente).

- **Bug real encontrado pelo ESLint**: `js/08-page-empresa.js` tinha uma
  variável (`e`) que não existia — quebraria o salvamento do Cadastro da
  Empresa toda vez que alguém salvasse, desde a v0.18.3. Corrigido pra
  usar `empresaAnterior` (o valor correto, já capturado antes na mesma
  função). Ninguém tinha notado ainda porque `node --check` (o que eu
  vinha fazendo manualmente) só pega erro de sintaxe, não esse tipo de
  referência a variável inexistente.
- **`package.json`, `.eslintrc.json`, `.prettierrc.json`**: configuração
  do projeto. O ESLint foi ajustado especificamente pra esse tipo de
  projeto (~29 arquivos JS sem sistema de módulos, compartilhando
  propositalmente o mesmo escopo global) — a lista de mais de 300
  funções/variáveis compartilhadas foi extraída automaticamente do
  próprio código, pra não dar falso positivo em cada uso legítimo entre
  arquivos.
- **Todo o código foi formatado pelo Prettier por padrão, uma única vez**,
  já que era a primeira vez que uma ferramenta de formatação entrava no
  projeto — confirmei que nenhuma correção de segurança (v0.23.0) foi
  alterada nesse processo, comparando antes/depois.
- **`README.md`**: nova seção explicando como rodar essas checagens
  localmente, e — importante — **como ativar a proteção de branch no
  GitHub** (passo manual, só quem tem acesso de administrador do
  repositório consegue fazer, que transforma isso de "só avisa" pra
  "impede o merge de verdade").

## v0.23.0 — Correções de segurança: XSS armazenado e tokens fracos
A partir de uma revisão de segurança externa, dois problemas de alto risco
foram identificados e corrigidos.

**1) XSS armazenado (stored XSS)** — quase toda a interface montava HTML
via interpolação direta de texto vindo de campos livres (nome de
colaborador, comentário, título, URL etc.), sem nenhum escape. Alguém
mal-intencionado podia colocar algo como `<img src=x onerror="...">` num
campo de texto livre, e esse código executaria na tela de **qualquer
pessoa que visse aquele texto depois** — inclusive RH ou Administrador,
um caminho de escalonamento de privilégio dentro da própria empresa.

Corrigido com duas funções novas em `js/02-core-helpers.js`:
- `escaparHtml()` — para texto de usuário indo pro meio do HTML.
- `escaparParaOnclick()` — para texto de usuário usado como argumento
  dentro de um `onclick`/`onchange` (precisa de tratamento em duas
  camadas: escape JavaScript primeiro, depois escape HTML — só usar
  `escaparHtml()` ali não bastava, e alguns lugares já tinham um escape
  manual incompleto que só tratava aspas simples, não aspas duplas).

Aplicado em praticamente todas as telas do sistema: Colaboradores,
Webhooks, Empresa, Cultura Organizacional, Desenho de Cargo (incluindo a
comparação entre versões), Base de Cargos, Ciclos de Avaliação (PDI,
Mentalidade, indicadores), Notificações in-app, Banco de Inteligência,
Pesquisa de Clima, Super Admin (incluindo a tabela de analytics entre
empresas), Auditoria (corrigido na origem — `nomePorPerfilId()` já
protege todos os lugares que a usam), Usuários & Acesso, Estrutura
Organizacional, Mapa de Sucessão, Diagnóstico & PDI, os 3 e-mails que o
sistema envia (convite, boas-vindas, avaliação pendente), o gráfico SVG
da Matriz 9-Box, e os dashboards de todos os papéis.

Testado com os 3 padrões de ataque reais: `<img onerror>` num campo de
texto, aspas duplas tentando quebrar um atributo `onclick`, e aspas
simples tentando quebrar a string JavaScript dentro do `onclick` — os
três ficaram neutralizados, e o caso legítimo (nome com apóstrofo, tipo
"O'Brien") continua funcionando normalmente.

**2) Tokens gerados com `Math.random()`** — não é criptograficamente
seguro, usado nos códigos de convite (`js/06-page-usuarios.js`) e de
licença de empresa (`js/23-page-super-admin.js`). Como esses códigos dão
acesso a criar conta/empresa na plataforma, trocado por
`crypto.getRandomValues()` — a mesma família segura que já era usada
corretamente em outro lugar (`uid()`, via `crypto.randomUUID()`). Mesmo
formato de código de antes, só a fonte de aleatoriedade mudou.

## v0.22.3 — Segundo bug de contraste corrigido (texto sumindo no menu "Ver como")
A correção da v0.22.2 resolveu o botão principal (fundo mudava de cor
junto com o texto), mas não cobria outro caso: em vários lugares — menu
"Ver como (pré-visualização)", abas de avaliador, rótulos "eyebrow" — a
mesma cor personalizável era usada como texto em cima do fundo **escuro e
fixo** da barra lateral (que nunca muda). Se a empresa escolhesse uma cor
também escura (ou parecida com o próprio fundo escuro do sistema), o
texto ficava invisível — o "algumas cores brancas... desaparecem" que foi
relatado.

Corrigido em `js/02-core-helpers.js` e `css/style.css`: nova variável
`--gold-on-dark`, calculada a partir da cor escolhida — se ela for escura
demais pra contrastar com o fundo fixo, usa uma versão clareada
automaticamente só nesses lugares específicos (menu de papéis, abas,
rótulos, badges). Testei com a cor exata do próprio fundo do sistema
(`#0a2647`) e com preto puro — os dois casos agora geram uma versão clara
e legível, em vez de ficarem invisíveis.

## v0.22.2 — Bug corrigido: texto dos botões ficava ilegível com cores escuras (white-label)
A funcionalidade de white-label na interface (v0.21.1) mudava a cor de
fundo dos botões principais, mas o texto tinha uma cor **fixa e escura**
— pensada só pra funcionar com a cor padrão (dourado, um tom claro). Se a
empresa escolhesse uma cor escura pra Identidade Visual, o resultado era
texto escuro em cima de fundo escuro — praticamente ilegível.

Corrigido em `js/02-core-helpers.js` e `css/style.css`: agora calcula
automaticamente o contraste (luminância) da cor escolhida e usa texto
claro ou escuro, o que fizer mais sentido. Testei com a própria cor azul
marinho padrão do sistema (bem escura) e confirmei que o texto vira claro
automaticamente — o cenário exato que causava o bug.

## v0.22.1 — Webhooks: formato amigável pro Slack
O Slack só entende mensagens no formato `{"text": "..."}` — diferente do
JSON genérico que os outros webhooks recebem. Agora o gatilho detecta
sozinho se a URL cadastrada é do Slack (contém `hooks.slack.com`) e, nesse
caso, manda uma mensagem de texto legível em vez do JSON bruto. Pra
qualquer outra URL, continua mandando o mesmo JSON de sempre — nada muda
pra quem já está usando (testado com webhook.site na conversa).

- **`sql/19-webhooks-formato-slack.sql`** (rodar depois do
  `18-webhooks-eventos-dominio.sql`).
- Tela de cadastro de webhook agora mostra um aviso "✅ URL do Slack
  detectada" assim que você cola uma URL do Slack no campo.

## v0.22.0 — Webhooks públicos sobre eventos de domínio
Reaproveita o barramento de eventos de domínio que já existe desde a
v0.7.0 (`eventos_dominio` — ciclo.aberto, pdi.aprovado, diagnostico.gerado
etc.). Agora dá pra cadastrar uma URL de webhook por Empresa, e o sistema
chama essa URL automaticamente sempre que um dos eventos escolhidos
acontece — sem precisar construir uma integração sob medida pra cada
sistema externo (folha de pagamento, ATS, Slack).

- **`sql/18-webhooks-eventos-dominio.sql`** (rodar no SQL Editor, depois
  do `17-notificacoes-in-app.sql`): ativa a extensão `pg_net`, cria a
  tabela `webhooks_configurados`, e um gatilho no banco que dispara os
  webhooks direto — **não depende do navegador de ninguém estar aberto**,
  já que roda no próprio Postgres.
- **Nova tela "Webhooks (integrações)"** (Administrador/RH): cadastra
  webhooks com nome, URL e quais eventos escutar (ou todos), mostra a
  chave de assinatura (pra quem recebe confirmar que a chamada veio do
  NORTE de verdade), ativa/desativa/exclui.
- **Importante**: depois de rodar a SQL, teste com uma URL de teste (ex.:
  webhook.site) antes de usar em produção — a sintaxe exata do `pg_net`
  pode variar um pouco conforme a versão do Supabase.

**Sobre o item "PWA / instalável no celular"**: isso já foi implementado
na v0.20.0 (manifest, ícones, service worker) — nada novo a fazer aqui.

## v0.21.1 — White-label na interface + onboarding com barra de progresso

**White-label na interface**: as cores de Identidade Visual (Configurações),
que até agora só afetavam os PDFs exportados, agora também repintam a
interface do sistema ao vivo (botões, abas ativas etc.) assim que a empresa
salva sua cor escolhida. Diferente da tentativa anterior (v0.12.0,
removida na v0.12.1) — aqui não tem nenhuma extração automática de cor a
partir do logo, é só a cor que a própria empresa escolhe manualmente. As
cores de classificação IDA continuam fixas, nunca mudam.

**Onboarding com barra de progresso**: o checklist de primeiros passos
("Onboarding do tenant") já existia, mas ficava discreto entre outros
cartões de pendência. Agora mostra uma barra de progresso visual (X de 5
passos), marca visualmente os passos já concluídos (✅) ao lado dos
pendentes, e na primeira visita (0 passos feitos) troca a saudação por
"Bem-vindo(a) à Plataforma NORTE!". Continua desaparecendo sozinho quando
os 5 passos são concluídos.

## v0.21.0 — 4 módulos novos: Check-in, Clima/eNPS, 9-Box, Sucessão

**1) Feedback contínuo (check-ins 1:1)** — registro informal de conversas
entre Gestor e Colaborador fora do ciclo formal. **Não pontua, não afeta
a média 25/50/25 (RN003)** — é só um histórico de acompanhamento contínuo.
Aparece na tela de Colaboradores (Gestor registra) e no Dashboard do
Colaborador (vê o que foi registrado sobre ele).

**2) Pesquisa de Clima / eNPS** — módulo novo e separado da Avaliação de
Desempenho (não usa escala IDA). RH cria uma pesquisa com pergunta
customizável (padrão eNPS: nota 0-10 de recomendação), colaboradores
respondem, RH acompanha o score eNPS calculado automaticamente
(promotores − detratores), distribuição e comentários recebidos.

**3) Matriz 9-Box** — gráfico de dispersão (SVG próprio) cruzando
Desempenho (dimensão Resultado) × Potencial, reaproveitando 100% dos
dados já calculados no Diagnóstico. Adicionado na tela de Diagnóstico &
PDI, respeitando a visibilidade por papel (Gestor só vê a própria equipe).

**4) Mapa de Sucessão** — nova tela, sugerindo automaticamente sucessores
em potencial pra cargos de natureza Estratégica (posições-chave),
baseado em quem tem o Potencial mais alto na mesma Unidade/Setor. É
sugestão de ponto de partida — a decisão final continua sendo humana
(Princípio 6 da Metodologia).

Nenhum desses 4 precisa de SQL nova — todos guardam dados dentro do
mesmo blob flexível já usado pelo resto do sistema. Testei a lógica de
cálculo dos 4 isoladamente antes de entregar.

## v0.20.1 — Bug corrigido: painel de notificações cortado pela barra lateral
O painel que abre ao clicar no sino 🔔 (320px de largura) ficava presa
dentro da barra lateral (250px de largura fixa) — o painel era mais largo
que o espaço onde estava posicionado, então aparecia cortado/apertado.

Corrigido em `js/25-notificacoes.js`: o painel agora usa posicionamento
fixo relativo à tela inteira (não mais relativo à barra lateral), então
flutua livremente por cima de todo o conteúdo, sem ser cortado por nada.
Também adicionei um jeito de fechar o painel clicando em qualquer lugar
fora dele.

## v0.20.0 — PWA: instalável no celular
O sistema virou um PWA (Progressive Web App) de verdade — dá pra instalar
no celular (ícone na tela inicial, abre em tela cheia, sem barra de
navegador), tanto no Android quanto no iPhone.

- **`manifest.json`**: nome, ícones, cor do tema.
- **`icons/icon-192.png` e `icons/icon-512.png`**: gerados a partir do
  logo padrão atual do sistema.
- **`sw.js`** (Service Worker): estratégia deliberadamente simples —
  "rede primeiro, cache só como reserva pra quando estiver sem internet".
  Isso é importante: um Service Worker mal feito poderia trazer de volta o
  problema de cache que já corrigimos antes (v0.15.6, o "?v=" nas URLs) —
  esse aqui nunca esconde uma versão nova por trás de cache.
- Melhorei o tamanho dos botões de Iniciar/Desenvolver/Alavancar no celular
  (na tela de preenchimento de avaliação) pra ficar mais fácil de tocar
  certo — já existia responsividade ali, só ajustei a altura mínima.

**Como instalar**: no Android (Chrome), abre o site e toca em "Adicionar à
tela inicial" (ou o navegador sugere isso automaticamente depois de usar
um pouco). No iPhone (Safari), toca em Compartilhar → "Adicionar à Tela de
Início".

## v0.19.3 — Relatório Institucional Consolidado (PDF)
Novo tipo de relatório em Relatórios: um "raio-x" da empresa toda, num PDF
único, pensado pro RH apresentar à diretoria — diferente dos relatórios
existentes, que são sempre por colaborador/ciclo específico.

**5 seções**: Resumo Executivo (colaboradores ativos, ciclos abertos/
encerrados), Distribuição por Classificação IDA (com percentuais),
Adoção de PDI (% de ciclos com PDI ativo, PDIs já aprovados), Comparação
por Unidade/Setor (média de classificação por setor), e Alertas de
Acompanhamento (PDIs de Mentalidade pendentes, colaboradores sem ciclo
aberto).

Reaproveita os mesmos cálculos já usados no Dashboard Executivo e no
Super Admin — nenhuma lógica nova de agregação, só reorganizada num
documento único.

## v0.19.2 — Gráfico de trajetória IDA entre ciclos
Novo gráfico de linha (SVG próprio, sem biblioteca externa) mostrando a
evolução de Resultado, Comportamento e Potencial ao longo dos ciclos com
diagnóstico — aproveitando que cada ciclo já é um "retrato congelado"
(RN024) que nunca muda depois de gerado.

- **Dashboard do Colaborador**: seção "Minha trajetória", com a própria
  evolução ao longo do tempo (aparece quando já tem 2+ ciclos).
- **Diagnóstico & PDI**: seção "Trajetória por colaborador", agrupando os
  ciclos de cada pessoa e mostrando o gráfico de quem já tem histórico
  suficiente — sem alterar os cards individuais por ciclo que já existiam.
- Com só 1 ciclo, mostra uma mensagem clara em vez de um gráfico quebrado
  ou vazio.

## v0.19.1 — Notificações in-app (sino de alertas)
Complementar ao e-mail (v0.15.2/v0.15.3): agora existe um sino 🔔 no topo
do menu lateral, com contador de não lidas, que abre um painel com o
histórico de notificações — diferente dos cartões de "pendências" dos
dashboards (que são calculados na hora e desaparecem quando resolvidos),
essas ficam guardadas e podem ser marcadas como lidas.

- **`sql/17-notificacoes-in-app.sql`** (rodar no SQL Editor, depois do
  `16-ativar-realtime.sql`): cria a tabela `notificacoes`, com RLS
  garantindo que cada pessoa só vê as próprias, e ativa Realtime nela.
- **`js/25-notificacoes.js`**: o sino, o painel, e a lógica de carregar/
  marcar como lida — chegam em tempo real via Realtime, igual ao aviso de
  atualização (v0.16.0), sem precisar recarregar a tela.
- Conectado nos mesmos 2 pontos que já disparam e-mail: **avaliação
  pendente** (quando o ciclo passa de etapa) e **PDI aprovado** — mesmo
  evento, dois canais (e-mail + sino), um não depende do outro.
- Clicar numa notificação marca ela como lida e já navega pra tela
  relevante (Ciclos de Avaliação, ou Diagnóstico & PDI).

## v0.19.0 — Dashboard de analytics entre Empresas-clientes (Super Admin)
Nova seção "Analytics entre Empresas-clientes" na tela de Super Admin,
calculada a partir dos mesmos dados já carregados pras métricas agregadas
(sem consulta nova ao banco):

- **Churn**: % de empresas suspensas ou com pagamento cancelado.
- **Engajamento médio no ciclo**: % de ciclos que chegam a "Encerrado"
  (em vez de ficarem abandonados no meio do caminho).
- **Adoção média de PDI**: dos ciclos que geraram diagnóstico, quantos de
  fato têm um PDI de Desenvolvimento ou Mentalidade preenchido (mede se a
  empresa está só avaliando, ou também usando a parte de desenvolvimento).
- **Tabela comparativa de maturidade entre empresas**: colaboradores,
  conclusão de ciclo, adoção de PDI, cobertura (% de colaboradores que já
  participaram de algum ciclo), última atividade registrada, e um "score
  de maturidade" (média dos indicadores acima, 0-100) — ordenada da mais
  madura pra menos madura. Empresas em churn aparecem esmaecidas na lista.

**Importante**: esses indicadores são de produto (pra você acompanhar
adoção entre clientes), não fazem parte da Metodologia NORTE nem de
nenhuma RN oficial — são cálculos nossos, específicos dessa tela.

## v0.18.3 — Status de pagamento (preparação pro gateway de pagamento)
Preparação pra quando a integração com um gateway de pagamento (Asaas ou
outro) for conectada — por enquanto, tudo controlado manualmente.

- **Cadastro da Empresa → Dados de faturamento**: campos novos "Status"
  (Em dia / Pendente / Atrasado / Cancelado) e "Próxima cobrança" (data).
- **Tela de Super Admin**: nova coluna "Pagamento" na lista de empresas,
  mostrando o status de cada uma — dá pra ver de relance quem está em dia
  e quem está atrasado, sem precisar entrar empresa por empresa.
- Guardado também um campo `idAssinaturaGateway` (vazio por enquanto) —
  reservado pra quando a integração de cobrança automática for conectada,
  sem precisar mudar a estrutura de novo nesse momento.

**Ainda não faz nada sozinho**: esse status é preenchido manualmente por
enquanto. A cobrança automática (Pix/Cartão/Boleto recorrente via Asaas)
fica pra quando você criar a conta no gateway e voltarmos a essa parte.

## v0.18.2 — Periodicidade do plano contratual
Novo campo "Periodicidade do plano" em Cadastro da Empresa → Dados de
faturamento do contrato, com as opções **Mensal**, **Semestral** e
**Anual**. Fica ao lado do "Plano contratado" (Essencial/Profissional/
Enterprise) — um define o nível do plano, o outro define o ciclo de
cobrança.

## v0.18.1 — Segmento: opção "Outro" ganhou campo de texto livre
O campo Segmento (Cadastro da Empresa) virou uma lista fixa na v0.17.0
pra fazer o filtro da Base de Cargos funcionar de forma confiável — mas
isso tirou a flexibilidade de descrever um segmento que não está na
lista. Agora tem os dois: escolhe uma das 13 opções fixas, e se escolher
**"Outro"**, aparece um campo de texto pra descrever livremente.

- O filtro da Base de Cargos continua funcionando normalmente (usa sempre
  uma das 13 categorias fixas — "Outro" mostra os cargos gerais).
- O texto livre é só descritivo — aparece ao lado do nome do segmento na
  tela de Base de Cargos, mas não interfere no filtro.

## v0.18.0 — Desenho de Cargo no padrão completo (baseado em documento de referência)
Reconstrução completa do modelo de Desenho de Cargo, a partir de um
documento de referência real (Desenho de Cargo — Analista de Dados) que
segue um padrão de mercado bem mais detalhado do que o formato anterior
(que só tinha sumário, atividades e requisitos em texto livre).

**Estrutura nova, em 9 seções** (tanto na tela de edição quanto na base
CBO): Identificação do Cargo (área/departamento, nível hierárquico, regime
de trabalho, local de trabalho, subordinação, subordinados diretos),
Missão do Cargo, Responsabilidades e Atribuições (+ Cultura e Postura
Institucional, RN030), Requisitos (formação acadêmica, experiência,
conhecimentos técnicos, idiomas), Competências Comportamentais,
Ferramentas e Sistemas Utilizados, Indicadores de Desempenho (KPIs do
Cargo), Condições de Trabalho, e Perspectivas de Carreira.

- **`js/12-page-desenho.js`**: tela de edição inteira reconstruída nesse
  formato, com as 9 seções.
- **`js/04-data-cbo.js`**: os 42 cargos da base CBO já vêm com todo esse
  conteúdo preenchido — o "Analista de Dados" segue quase palavra por
  palavra o documento de referência enviado; os demais 41 seguem o mesmo
  padrão, com conteúdo ajustado ao contexto de cada função (ex.: Pedreiro
  tem menos "ferramentas de sistema" que um cargo de escritório, o que
  faz sentido pela natureza do trabalho).
- **`js/11-page-cargos.js`** (`importarCargo`): atualizado para copiar
  todos os campos novos da base CBO pro cargo importado pela empresa.

## v0.17.1 — Filtro de segmento agora é estrito (sem mistura de "gerais")
Ajuste no comportamento da v0.17.0, a pedido: em vez de misturar cargos
"gerais" com os do segmento escolhido através de uma regra especial no
código, agora o filtro é direto — só mostra cargos marcados pro segmento
que a empresa escolheu.

- Removido o "sentinela" `Geral` da lógica de filtro (`js/11-page-cargos.js`).
- Os cargos genuinamente universais (Gerente, Recepcionista, Auxiliar
  Administrativo etc.) continuam aparecendo em qualquer segmento — mas
  agora porque estão marcados explicitamente em **todos os 13 segmentos**
  na própria base (`js/04-data-cbo.js`), não por causa de uma exceção
  escondida no filtro. Os cargos específicos (Enfermeiro, Pedreiro,
  Professor etc.) continuam só nos segmentos certos.
- Os números totais por segmento continuam idênticos aos da v0.17.0 (24 a
  27 cargos, dependendo do segmento) — só a forma de calcular ficou mais
  simples e transparente.

## v0.17.0 — Base de Cargos (CBO) filtrada pelo segmento da empresa
Em vez de simplesmente ampliar a lista de cargos sem critério, o pedido foi
melhor que isso: filtrar os cargos sugeridos pela área de atuação da
empresa (ex.: uma empresa de Saúde só ver cargos relevantes pra Saúde, não
uma lista genérica misturada com Pedreiro ou Professor).

- **`js/04-data-cbo.js`**: campo novo `segmentos` em cada cargo, marcando a
  qual área ele pertence. Cargos "Geral" (Gerente, Recepcionista, Auxiliar
  Administrativo etc.) aparecem pra qualquer segmento. Foram adicionados
  18 cargos novos cobrindo áreas que antes não tinham nenhuma
  representação: Saúde, Educação, Tecnologia, Jurídico, Construção Civil,
  Agronegócio e Logística — total foi de 24 para 42 cargos.
- **Cadastro da Empresa**: o campo "Segmento" deixou de ser texto livre e
  virou uma lista fixa de 13 áreas — isso é o que permite o filtro
  funcionar de forma confiável (texto livre como "saude" vs "Saúde" vs
  "Hospital" não dava pra casar com precisão).
- **Base de Cargos**: filtra automaticamente pelos cargos "Geral" + os do
  segmento escolhido pela empresa. Tem uma opção pra "ver cargos de todos
  os segmentos" a qualquer momento, se quiser.

**Importante sobre os códigos CBO usados**: não tive acesso à base de
dados oficial completa do governo nesse ambiente (sem internet aberta) —
os códigos e descrições foram escritos com base em conhecimento geral
sobre ocupações comuns no Brasil, com boa confiança, mas **não foram
verificados contra o registro oficial do Ministério do Trabalho**. Vale
conferir o código exato antes de usar em algo formal (ex.: registro em
carteira de trabalho), se isso for relevante pro caso de uso.

## v0.16.2 — Segunda correção do aviso de atualização (janela de tempo)
A correção da v0.16.1 (comparar o carimbo exato do salvamento) não era
suficiente: se a pessoa clica em várias coisas seguidas, cada clique
dispara seu próprio salvamento, e o aviso de um mais antigo podia chegar
depois do carimbo já ter mudado pra um mais novo — dando falso positivo
mesmo sendo tudo ação da própria pessoa.

Trocado por uma abordagem mais tolerante em `js/18-persistence.js` e
`js/02-core-helpers.js`: em vez de comparar um carimbo exato, o sistema
agora marca "última vez que eu fiz alguma ação" a cada interação, e só
mostra o aviso se **nenhuma ação minha aconteceu nos últimos 4 segundos**
— cobrindo com folga o caso de vários cliques rápidos seguidos. Testei os
3 cenários (ação isolada, ação de outra pessoa depois de um tempo, e
vários cliques rápidos em sequência) e confirmei o comportamento certo
nos três.

## v0.16.1 — Bug corrigido: aviso de atualização aparecia toda hora
O aviso "Alguém mais atualizou os dados" (v0.16.0) disparava até quando a
mudança era da própria pessoa — o sistema salva sozinho toda vez que
qualquer coisa é feita (agendarSalvamento), e isso também contava como
"atualização" pro Realtime. Resultado: o aviso ficava aparecendo o tempo
todo, sem servir de aviso real de nada.

Corrigido em `js/18-persistence.js` e `js/02-core-helpers.js`: cada
salvamento agora carimba um identificador próprio, e o aviso só aparece
quando o carimbo recebido pelo Realtime **não bate** com o do nosso
último salvamento — ou seja, só quando é mudança de outra pessoa de
verdade. Testei os dois cenários (eco próprio vs. mudança alheia) e
confirmei o comportamento certo nos dois.

## v0.16.0 — Aviso automático quando outra pessoa atualiza os dados (Realtime)
Resolve o ponto #4 identificado na revisão geral: duas pessoas da mesma
empresa usando o sistema ao mesmo tempo sem saber que os dados mudaram —
o caso real que já aconteceu nessa mesma conversa (RH vendo "etapa 2"
enquanto o Líder já via "etapa 3"). O botão "Atualizar" já resolvia isso,
mas exigia que a pessoa soubesse que precisava clicar nele.

Agora, usando o **Supabase Realtime**, o navegador é avisado sozinho
sempre que os dados da empresa mudam (por qualquer pessoa, em qualquer
tela) — aparece uma faixa discreta no topo da tela: "Alguém mais atualizou
os dados da empresa", com botão para atualizar na hora ou ignorar por
enquanto.

**Decisão importante de segurança**: o aviso não atualiza os dados
sozinho automaticamente — só avisa. Atualizar sozinho correria o risco de
apagar um formulário que a pessoa esteja preenchendo bem naquele momento
(o mesmo tipo de problema já corrigido antes na tela de login). Quem
decide quando atualizar continua sendo a pessoa, agora só que avisada.

**Precisa rodar uma SQL nova**: `sql/16-ativar-realtime.sql` (depois do
`15-controle-migrations.sql`) — ativa o Realtime na tabela `dados_sistema`.

## v0.15.6 — Rede de segurança pro processo de publicar atualizações
Não é uma mudança de funcionalidade — é sobre reduzir o risco do processo
manual de subir cada atualização (baixar zip → substituir arquivos →
git push → esperar deploy → dar refresh forçado no navegador).

- **Cache-busting automático** (`index.html`): todo arquivo `.js`/`.css`
  local agora carrega com `?v=X.Y.Z` na URL. Isso resolve de vez o
  problema do navegador (ou do GitHub Pages) mostrar a versão antiga do
  código depois de um `git push` — não depende mais de lembrar de dar
  Ctrl+Shift+R. **Mas exige disciplina**: a cada nova versão publicada, o
  número em `?v=` precisa ser atualizado em todas as linhas do
  `index.html` (tem um comentário lá explicando isso).
- **Controle de migrations SQL** (`sql/15-controle-migrations.sql`): nova
  tabela `migrations_aplicadas`, que registra quais scripts já foram
  rodados. Resolve a dúvida de "já rodei essa SQL ou não" — é só rodar
  `select * from migrations_aplicadas order by aplicada_em;` no SQL
  Editor pra ver o histórico completo. Toda migration nova, a partir de
  agora, deve terminar registrando a si mesma nessa tabela.

## v0.15.5 — Coluna "Detalhes" da Auditoria menos poluída
A coluna de detalhes de cada evento mostrava o JSON bruto (com chaves,
aspas e IDs completos de 36 caracteres) — ficava larga e difícil de ler.
Agora mostra só "chave: valor" separado por ponto, e IDs longos (UUIDs)
aparecem encurtados (só os 8 primeiros caracteres).

## v0.15.4 — Bug de segurança corrigido: Super Admin podia se auto-bloquear
Um Super Admin que também está cadastrado como colaborador de uma empresa
(caso comum, já que é a mesma pessoa fazendo os dois papéis) conseguia
suspender a própria empresa pela tela — e a trava de suspensão vale pra
qualquer um vinculado a ela, sem exceção pro Super Admin. Resultado: a
pessoa se bloqueava do próprio sistema, sem conseguir nem entrar de volta
pra reverter (já que reverter exige estar logado como Super Admin).

Corrigido em `js/23-page-super-admin.js`: o botão "Suspender" não aparece
mais para a própria empresa do Super Admin (mostra uma nota explicando por
quê), e a lista marca visualmente qual empresa é "sua empresa". Se for
realmente necessário suspender a própria empresa por algum motivo, ainda
dá pra fazer direto via SQL — só não é mais um clique acidental.

## v0.15.3 — E-mail de boas-vindas ao criar conta
Complementa a v0.15.2: agora, assim que alguém termina de criar a conta
(seja usando um código de convite pra entrar numa empresa já existente, ou
um código de licença pra cadastrar uma empresa nova), recebe um e-mail de
boas-vindas confirmando que deu certo. Usa a mesma Edge Function
`enviar-email` já implantada — nenhuma configuração nova é necessária além
da que já foi feita pra v0.15.2.

## v0.15.2 — Notificações por e-mail (convite, avaliação pendente, PDI aprovado)
Primeira leva de notificações por e-mail, usando o Resend como serviço de
envio. Como o app é um site estático (GitHub Pages), o envio não pode
acontecer direto do navegador — isso exigiria expor a chave secreta do
Resend pra qualquer pessoa que abrisse o código-fonte da página. A solução
é uma **Edge Function** do Supabase: um pedacinho de código que roda no
servidor do Supabase, guarda a chave em segredo, e só ele conversa com o
Resend.

**O que foi implementado:**
- **Convite de acesso gerado**: a tela de convite (Usuários & Acesso) agora
  tem um campo opcional de e-mail — se preenchido, o código do convite é
  enviado automaticamente pra pessoa, além de continuar disponível pra
  copiar manualmente.
- **Sua avaliação está pendente**: sempre que um ciclo passa a etapa (abre
  pela primeira vez, avança do Colaborador pro Líder, do Líder pro RH),
  a pessoa responsável pela nova etapa recebe um e-mail avisando.
- **PDI aprovado**: o colaborador recebe um e-mail quando o Gestor/RH
  aprova o PDI dele.

**Arquivos novos:**
- `supabase/functions/enviar-email/index.ts` — a Edge Function em si (tem
  instruções completas de implantação no final do próprio arquivo).
- `sql/14-preparacao-notificacoes-email.sql` — adiciona uma cópia do
  e-mail em `perfis` (o app não consegue ler `auth.users` diretamente por
  segurança) e um campo de e-mail em `convites`.
- `enviarEmailNotificacao()` e `emailWrapperHTML()` em
  `js/02-core-helpers.js` — funções reutilizáveis pra qualquer notificação
  futura.

**Nenhum e-mail falhando trava o sistema**: se o envio não funcionar por
qualquer motivo (Edge Function ainda não implantada, chave errada, etc.),
a ação principal (gerar convite, avançar etapa, aprovar PDI) continua
funcionando normalmente — só o e-mail em si não sai, com um aviso no
console do navegador.

### ⚠️ 3 passos manuais obrigatórios antes de funcionar de verdade
1. Criar conta gratuita em **resend.com** e pegar a API Key.
2. Rodar **`sql/14-preparacao-notificacoes-email.sql`** no SQL Editor do
   Supabase (depois do `13-metricas-super-admin.sql`).
3. Implantar a Edge Function e configurar a chave do Resend como secret —
   instruções completas dentro de
   `supabase/functions/enviar-email/index.ts`.

Sem esses 3 passos, os e-mails simplesmente não saem (mas nada quebra).

## v0.15.1 — Métricas agregadas no Super Admin
A tela de Super Admin só listava empresas uma a uma — agora mostra também
números consolidados de toda a plataforma no topo: empresas ativas,
empresas suspensas, total de colaboradores (somando todas as empresas),
ciclos em andamento e ciclos já encerrados (histórico).

Como esses números vivem dentro do "payload" de cada empresa (blob JSON em
`dados_sistema`, não uma tabela separada), foi necessária uma nova permissão
de leitura pro Super Admin — ver `sql/13-metricas-super-admin.sql` (rodar
no SQL Editor, depois do `12-suspensao-empresas.sql`). É só leitura: o
Super Admin nunca ganha permissão de editar os dados operacionais de uma
empresa-cliente.

## v0.15.0 — Tela de Auditoria + Suspender empresas (Super Admin)

**1) Tela de Auditoria** (`js/24-page-auditoria.js`, visível pra
Administrador e RH): o sistema já registrava mais de 40 tipos de evento
diferentes (login, desligamento, mudança de papel, aprovação de PDI,
exportação de relatório etc.) numa tabela append-only desde o início —
só não existia nenhuma tela pra ver isso. Agora tem, com filtro por tipo
de evento e por pessoa, mostrando os últimos 500 registros com data/hora,
quem fez e detalhes técnicos de cada um.

**2) Suspender acesso de Empresas ativas** (Super Admin): até aqui, o
Super Admin só controlava a criação de Empresas novas (código de
licença) — não existia jeito de suspender uma Empresa já ativa (ex.:
parou de pagar, contrato encerrado). Agora existe um botão
"Suspender"/"Reativar" na lista de Empresas, e ninguém daquela Empresa
consegue entrar no sistema enquanto estiver suspensa.

- **`sql/12-suspensao-empresas.sql`** (rodar no SQL Editor, depois do
  `11-licenciamento-empresas.sql`): adiciona as colunas de suspensão em
  `empresas` e a permissão do Super Admin pra atualizá-las.
- Bug corrigido de passagem: a consulta de empresas na tela de Super
  Admin usava um nome de coluna que não existe (`criado_em` — o certo é
  `created_at`), então a lista de empresas nunca aparecia direito.

## v0.14.7 — Corrigido de vez: tela de nova senha aparecia e sumia em 1 segundo
A v0.14.6 eliminou a disputa entre duas rotinas, mas sobrou uma disputa de
**ordem** dentro da própria rotina: a trava que impede outros eventos de
assumir a tela (`_tratandoLinkDeRecuperacao`) só era ligada DEPOIS de trocar
o token pela sessão — mas essa troca em si (`setSession`/
`exchangeCodeForSession`) já dispara o evento de "sessão mudou" NO MEIO do
processo, antes da trava existir. Resultado exato relatado: a tela de nova
senha chegava a aparecer por um instante, e o app normal (que já tinha sido
disparado por baixo dos panos, sem trava nenhuma barrando) tomava conta da
tela logo em seguida.

Corrigido em `js/19-auth.js`: a trava agora liga de forma síncrona, lendo a
URL diretamente, **antes** de qualquer troca de token começar — nunca mais
depois. Simulei o cenário exato (evento disparando no meio do processo) e
confirmei que agora fica bloqueado corretamente.

## v0.14.6 — Disputa de tempo no link de recuperação eliminada de vez
As correções anteriores (v0.13.6, v0.13.7) reduziram a disputa, mas não
eliminaram — o link ainda funcionava só às vezes, porque duas rotinas
diferentes competiam pra processar o mesmo link ao mesmo tempo: a detecção
automática do próprio supabase-js (ligada por padrão) e o código específico
que escrevemos pra tratar o link de recuperação. Dependendo de qual
"ganhasse a corrida" primeiro, ora funcionava, ora abria o sistema direto.

Corrigido de raiz em `js/01-supabase-client.js` e `js/19-auth.js`:
- **Desligada a detecção automática do supabase-js** (`detectSessionInUrl:
  false`) — agora só existe UM caminho processando qualquer link recebido
  por e-mail, nunca dois ao mesmo tempo.
- O app passou a processar os tokens da URL manualmente e sequencialmente
  (`processarTokensDaUrlSeHouver`), cobrindo os dois formatos possíveis
  (PKCE `?code=...` e implícito `#access_token=...`), antes de qualquer
  outra decisão ser tomada.
- Como efeito colateral necessário: qualquer outro tipo de link com token
  na URL (ex.: confirmação de cadastro por e-mail, se algum dia for
  ativada) também passou a ser tratado explicitamente pelo mesmo código —
  antes dependia da mesma detecção automática que foi desligada.

## v0.14.5 — Mensagem de e-mail duplicado cobre mais variações
A garantia em si já existia (o Supabase impede, no nível do banco, duas
contas com o mesmo e-mail — isso nunca dependeu do código do front-end).
O que foi ajustado foi só a detecção da mensagem de erro para mostrar o
aviso amigável: o texto exato que o Supabase retorna varia um pouco
("User already registered", "already been registered", "already in use"),
e a checagem só cobria uma dessas variações — nas outras, a pessoa via o
erro técnico em inglês em vez da explicação em português. Agora cobre
todas as variações conhecidas.

## v0.14.4 — Mudar o papel de uma conta já existente
Até aqui, o papel (RH/Gestor/Colaborador) só podia ser definido no momento
do convite — não existia jeito de promover ou rebaixar alguém que já
tivesse conta criada, sem desativar e recriar do zero.

- Nova opção **"Mudar papel para…"** em Usuários & Acesso, ao lado de cada
  pessoa (exceto o próprio Administrador da empresa, que não muda).
- Mesma regra do convite: só o Administrador pode promover alguém a RH —
  RH pode promover/rebaixar entre Gestor e Colaborador livremente.
- Não precisou de mudança no banco — a política de segurança que já
  permite Dono/RH administrarem qualquer perfil da empresa (criada na
  correção `07-fix-desativar-usuario.sql`) já cobre esse caso.

## v0.14.3 — Correção retroativa: colaboradores desligados antes da v0.14.2
A correção da v0.14.2 (Desligar também remove o login) só vale para
desligamentos feitos depois dela — quem já tinha sido desligado antes
ficou com o cadastro inativo, mas o login continuava ativo, sem nenhum
jeito automático de perceber isso.

Adicionado em `js/13-page-colaboradores.js`: a tela de Colaboradores agora
detecta automaticamente esses casos (desligado + login ainda ativo) e
mostra um alerta com botão "Desativar login agora" pra cada um — corrige
com um clique, sem precisar ir em Usuários & Acesso manualmente.

## v0.14.2 — Desligar colaborador agora remove o acesso de login também
Gap de segurança real corrigido em `js/13-page-colaboradores.js`: clicar em
"Desligar" só marcava o registro de RH do colaborador como inativo — a
conta de login dela continuava funcionando normalmente, ela ainda
conseguia entrar no sistema depois de desligada.

- `desligarColaborador` agora, além de marcar o colaborador como desligado,
  desativa também a conta de login vinculada (se houver uma) — a pessoa
  perde o acesso ao sistema imediatamente. Pede confirmação antes de agir.
- Novo botão **"Religar"**, ao lado de "Anonimizar (LGPD)", pra quando o
  colaborador é recontratado pela mesma Empresa: reativa o cadastro dele e
  reativa o acesso de login junto (se havia um vinculado).
- Se o colaborador for "religado" numa **outra** Empresa (não a mesma),
  isso continua exigindo uma conta nova com um e-mail diferente — é a
  mesma limitação de e-mail único por conta em toda a plataforma já
  documentada em `RECONCILIACAO-RN.md`, não algo resolvido nesta versão.

## v0.14.1 — Bug corrigido: tela de Super Admin travava em "Carregando…"
A condição que decidia buscar os dados verificava se as listas de empresas
e códigos estavam vazias — mas lista vazia também é o estado normal antes
de existir qualquer empresa ou código gerado (como é o caso logo depois de
configurar o Super Admin pela primeira vez). Isso fazia a tela recarregar
os dados a cada render, pra sempre, sem nunca aceitar "zero resultados"
como uma resposta válida — travando em "Carregando…" eternamente.

Corrigido em `js/23-page-super-admin.js`: agora existe uma flag separada
(`_superAdminJaCarregou`) que só controla "já tentei carregar uma vez",
independente de quantos resultados vieram. Também adicionado aviso de erro
explícito caso a consulta ao Supabase falhe (antes falhava em silêncio).

## v0.14.0 — Licenciamento de Empresas (controle do dono da plataforma)
Até aqui, qualquer pessoa que chegasse na tela de cadastro e escolhesse
"não tenho convite" conseguia criar uma Empresa nova sozinha, sem nenhum
controle — qualquer um tinha acesso à plataforma. Agora isso exige
aprovação prévia do Instituto INETRIS (dono da Metodologia NORTE).

- **Novo conceito: Super Admin da plataforma** — um nível acima do
  Administrador de cada Empresa. O Administrador só enxerga a própria
  Empresa; o Super Admin enxerga e gerencia todas.
- **`sql/11-licenciamento-empresas.sql`** (rodar no SQL Editor do Supabase,
  depois de todos os scripts anteriores): cria as tabelas `super_admins` e
  `codigos_licenca_empresa`, e atualiza a trigger de cadastro — criar uma
  Empresa nova (sem convite) agora exige um código de licença válido e
  ainda não usado; sem isso, o cadastro é recusado com uma mensagem clara.
- **Tela nova "Super Admin — Empresas"** (`js/23-page-super-admin.js`),
  visível só pra quem está na tabela `super_admins`: gera códigos de
  licença (formato legível, tipo `NORTE-XXXX-XXXX`, fácil de ditar por
  telefone/WhatsApp), lista todas as Empresas cadastradas na plataforma,
  mostra quais códigos já foram usados e por qual Empresa, e permite
  revogar um código ainda não usado.
- Tela de cadastro atualizada: quem for criar uma Empresa nova agora
  também precisa preencher o código de licença, além do nome da empresa.

**Ação manual obrigatória, uma única vez**, depois de rodar o script SQL:
insira a própria conta (a do Instituto INETRIS) na tabela `super_admins`
rodando, no SQL Editor do Supabase:
```sql
insert into super_admins (id, nome) values ('SEU-USER-ID-AQUI', 'Seu nome');
```
O ID do usuário fica visível em Authentication → Users, no painel do
Supabase. Sem essa linha, ninguém tem acesso de Super Admin — nem o dono
da conta.

## v0.13.7 — Bug corrigido (de vez, esperamos): link de recuperação continuava não mostrando a tela de nova senha
A correção da v0.13.6 não foi suficiente — o link continuava abrindo o
sistema normal em vez da tela de nova senha, mesmo em aba anônima com link
recém-gerado. Causa provável: o projeto Supabase pode estar usando o fluxo
"PKCE" para o link de recuperação (`?code=...`), que — diferente do fluxo
"implícito" mais antigo (`#access_token=...`) — não gera uma sessão
sozinho: o app precisa trocar esse código manualmente por uma sessão
(`exchangeCodeForSession`). Sem isso, o Supabase às vezes dispara um evento
genérico (`SIGNED_IN`) em vez de `PASSWORD_RECOVERY`, e o app só via "tem
uma sessão válida" e entrava direto no dashboard.

Reescrito em `js/19-auth.js`:
- Detecção do link de recuperação agora acontece de forma síncrona e
  explícita ao carregar a página (não depende só do evento do Supabase).
- Cobre os dois formatos possíveis: PKCE (`?code=...&type=recovery`, com
  troca manual via `exchangeCodeForSession`) e implícito
  (`#access_token=...&type=recovery`).
- Uma trava (`_tratandoLinkDeRecuperacao`) impede que qualquer outro evento
  de autenticação (como `SIGNED_IN`) atropele a tela de nova senha depois
  que ela já foi decidida.
- Se nenhum dos dois formatos funcionar (link expirado ou já usado — os
  links de recuperação só funcionam uma vez), mostra uma mensagem de erro
  clara em vez de simplesmente cair no login sem explicação.

## v0.13.6 — Bug corrigido: link de redefinição de senha entrava direto no site
Mesmo com o link do e-mail chegando certo (v0.13.5), clicar nele levava
direto pro dashboard normal em vez de mostrar a tela "Defina sua nova
senha". Causa: o link de recuperação já cria uma sessão temporária válida
no Supabase — e o código tinha duas verificações rodando em paralelo no
carregamento da página (`onAuthStateChange` com o evento
`PASSWORD_RECOVERY`, e um `getSession()` inicial): o `getSession()` via
essa sessão temporária e entrava direto no site, ganhando a corrida contra
a tela de nova senha.

Corrigido em `js/19-auth.js`: antes de decidir entrar direto no site, o
código agora confere se a própria URL indica um link de recuperação
(`type=recovery`, nos dois formatos que o Supabase pode usar) e, se for o
caso, mostra a tela de nova senha em vez de pular direto pro dashboard.

## v0.13.5 — Bug corrigido: "Esqueci minha senha" não completava a troca
Duas causas, as duas em `js/19-auth.js`:

1. **Link do e-mail sem destino explícito.** `resetPasswordForEmail` estava
   sendo chamado sem `redirectTo` — nesse caso o Supabase usa a "Site URL"
   configurada no painel do projeto como destino do link. Se esse endereço
   estiver desatualizado (ex.: ainda apontando pra `localhost` ou uma URL
   antiga), o link do e-mail leva a um endereço que não existe — exatamente
   o erro relatado ("não é possível acessar o site"). Agora o link é gerado
   sempre com `redirectTo` = o endereço de onde o site está rodando no
   momento, então nunca aponta pra um lugar errado.
2. **Faltava a tela para completar a troca.** Mesmo que o link chegasse
   certo, o app não tinha nenhuma tela de "defina sua nova senha" — o
   evento de recuperação de senha do Supabase caía direto no fluxo normal
   de login. Agora existe `renderRedefinirSenha()`, com validação de senha
   mínima e confirmação, que aparece automaticamente quando alguém chega
   pelo link do e-mail.

**Ação manual necessária no painel do Supabase** (não dá pra fazer isso
pelo código): em Authentication → URL Configuration, confirme que a "Site
URL" e a lista de "Redirect URLs" incluem o endereço real onde o site está
hospedado (ex.: a URL do GitHub Pages) — o Supabase só aceita redirecionar
para endereços que estejam nessa lista.

## v0.13.4 — Bug corrigido: qualquer clique jogava a página pro topo
`js/05-navigation.js` tinha um `window.scrollTo(0,0)` incondicional dentro
de `render()` — e como praticamente toda ação do sistema (marcar uma nota
Iniciar/Desenvolver/Alavancar, editar um campo, abrir um painel) chama
`render()`, a página voltava pro topo a cada clique. Ficava especialmente
incômodo em telas longas, como preencher uma avaliação com muitos
indicadores — cada nota marcada jogava a pessoa de volta pro topo, tendo
que rolar tudo de novo pra continuar.

Corrigido: `render()` agora só rola pro topo quando a pessoa realmente
muda de tela (rota) ou abre/fecha um ciclo específico — nunca por causa
de uma interação dentro da mesma tela. Testei a sequência real (carregar
→ navegar → abrir ciclo → marcar várias notas → voltar pra lista) e só
rola nos momentos que fazem sentido como "nova tela".

## v0.13.3 — Bug corrigido: RH via a etapa desatualizada (dados não sincronizavam entre pessoas)
Cenário relatado: o Líder já tinha enviado a avaliação (sua própria tela
mostrava "Etapa 3 de 3 — RH"), mas a tela do RH continuava mostrando
"Etapa 2 de 3 — Líder", como se a etapa ainda não tivesse mudado. Não era
um problema de permissão (o papel do RH estava certo) — era sincronização:
o sistema carrega os dados uma única vez, no login, e não busca atualização
depois disso. Se o RH já estava com a tela aberta antes do Líder enviar,
ficava vendo a versão antiga do ciclo indefinidamente, sem nenhum jeito de
perceber isso a não ser dando F5 na página inteira.

Corrigido:
- Nova função `atualizarDadosAoVivo()` (`js/05-navigation.js`), que busca
  os dados mais recentes do servidor e atualiza a tela sem precisar
  recarregar a página inteira (não perde o lugar onde a pessoa estava).
- Chamada automaticamente sempre que alguém entra na tela de **Ciclos de
  Avaliação**.
- Botão "↻ Atualizar" visível tanto na lista de Ciclos quanto dentro de um
  ciclo específico, para quem já está com a tela aberta esperando a vez.
- A mensagem "Esta etapa ainda não é sua" agora sugere clicar em
  "↻ Atualizar" como primeiro passo, já que essa costuma ser a causa real.

Limitação que continua existindo (não é bug, é característica da
arquitetura atual): o sistema não tem sincronização em tempo real — a
atualização só acontece quando alguém pede (ao entrar na tela ou clicar em
"Atualizar"), não automaticamente enquanto a tela está parada. Para tempo
real de verdade, seria necessário usar Realtime do Supabase — fora do
escopo atual.

## v0.13.2 — Bug corrigido: Administrador não conseguia concluir a etapa do RH
Mesma família do bug da v0.13.1, agora na última etapa do ciclo (RH). A
etapa só liberava para quem tinha o papel de sistema `rh` exato — se o
Administrador estava fazendo esse papel na prática (comum em empresas sem
RH separado), a tela mostrava "Esta etapa ainda não é sua".

Corrigido em `js/14-permissions.js` (`podeEditarEtapa`): a etapa do RH
agora libera também para o Administrador. Diferente da etapa do Líder
(vinculada a um colaborador específico via `gestorPerfilId`), a etapa do
RH é uma função de empresa toda — e o Administrador já tinha acesso
irrestrito para ver todos os ciclos, construir e aprovar PDI (RN
`cicloVisivelParaMim`, `podeConstruirPDI`, `podeAprovarPDI`); faltava só
essa etapa específica de preenchimento seguir a mesma regra.

## v0.13.1 — Bug corrigido: Administrador que também é gestor direto não conseguia avaliar
Cenário relatado: Colaborador concluiu a autoavaliação, o ciclo passou para
a etapa do Líder Direto — mas a pessoa logada, apesar de estar cadastrada
como gestor direto daquele colaborador, tinha o papel de sistema
"Administrador" (`owner`), não "Gestor" (`lider`). A tela mostrava "Esta
etapa ainda não é sua" e os botões de avaliação apareciam desabilitados.

Corrigido em `js/14-permissions.js` (`podeEditarEtapa`) e
`js/15-page-ciclos-avaliacao.js` (`souGestorDoCiclo`): agora a etapa do
Líder Direto é liberada tanto para quem tem o papel `lider` quanto para o
Administrador, **desde que** o vínculo de gestor já esteja cadastrado no
organograma daquele colaborador especificamente (`gestorPerfilId` apontando
para essa pessoa). Isso é diferente de liberar avaliação para qualquer
Administrador em qualquer ciclo — só vale quando a própria empresa já
cadastrou essa pessoa como gestor direto de alguém, um cenário comum em
empresas pequenas onde o dono também lidera parte da equipe diretamente.

Nota técnica: encontrei e corrigi de passagem uma duplicação perigosa —
existiam duas funções `souGestorDoCiclo` diferentes (uma em
`js/14-permissions.js`, outra em `js/15-page-ciclos-avaliacao.js`); a
segunda, por carregar depois, sempre sobrescrevia silenciosamente a
primeira. Consolidado em uma única definição.

A etapa do RH e a construção/aprovação do PDI não foram alteradas nesta
correção — o Administrador já podia atuar nelas sem restrição.

## v0.13.0 — Novo logo padrão do sistema
- Substituído o logo padrão exibido no canto superior esquerdo do menu (e
  na tela de login) quando nenhuma empresa definiu um logotipo próprio —
  agora usa a nova marca fornecida (fundo azul, ícone de conexões em branco
  e dourado), redimensionada para 200×200 e otimizada em PNG (~11KB, contra
  ~64KB do logo anterior).
- A cor de fundo da nova imagem (~#072444) é praticamente idêntica à cor de
  fundo do menu lateral (`--surface: #0a2647`), então ela se funde sem
  parecer uma caixa recortada.
- `js/00-logo-asset.js` — mesma constante `LOGO_INETRIS_B64`, conteúdo
  trocado (não renomeei a constante para não precisar alterar todas as
  referências em `js/05-navigation.js` e `js/19-auth.js` sem necessidade).

## v0.12.6 — Bug corrigido: remover o logotipo não voltava ao padrão
Duas causas encontradas e corrigidas em `js/02-core-helpers.js` e
`js/05-navigation.js`:

1. **Duas fontes de logo, um só botão de remover.** O logo do menu lateral
   podia vir de dois campos diferentes (Cadastro de Empresa ou
   Configurações → Identidade Visual — um servindo de reserva do outro).
   Remover em um lugar só não limpava o outro, então se os dois estivessem
   preenchidos, o logo "sobrevivia" à remoção. Agora o botão "Remover
   logotipo" limpa os dois de uma vez, em qualquer uma das duas telas.
2. **Definir/remover só valia depois de clicar em "Salvar".** Nenhuma das
   duas ações realmente escrevia no estado do sistema — só no campo
   escondido do formulário — então o menu lateral só refletia a mudança se
   a pessoa depois clicasse no botão "Salvar" geral da tela (que atualiza
   várias coisas de uma vez). Agora definir ou remover o logotipo grava no
   estado, atualiza o menu lateral na hora (sem re-renderizar a tela
   inteira, pra não apagar outros campos do formulário ainda não salvos) e
   salva em segundo plano — nenhum dos dois depende mais do botão "Salvar".

## v0.12.5 — Bug corrigido: campos de login/cadastro se apagavam sozinhos
Bug pré-existente (não introduzido nesta conversa) em `js/19-auth.js`: os
campos de e-mail e senha do formulário de login não guardavam o que a
pessoa tinha digitado. Toda vez que a tela re-renderizava — o que acontece
em qualquer erro de login, ao ficar bloqueada, ou ao clicar em "Esqueci
minha senha" — os dois campos voltavam vazios, obrigando a redigitar tudo
de novo a cada tentativa. O mesmo acontecia no formulário de cadastro
(nome, empresa, código de convite): marcar/desmarcar "Tenho um código de
convite" apagava o nome já digitado.

- Todos os campos do formulário (e-mail, senha, nome, empresa, código de
  convite) agora preservam o valor digitado através de qualquer
  re-renderização da tela.
- A senha digitada é limpa da memória assim que o login tem sucesso (não
  fica residindo em uma variável além do necessário).

Esta correção veio de uma segunda revisão geral do código, a pedido do
usuário, procurando especificamente por esse tipo de problema (formulário
que perde o que foi digitado por causa de uma re-renderização). Não
encontrei o mesmo padrão em nenhuma outra tela do sistema — as demais só
re-renderizam ao abrir/fechar painéis que não têm campo de texto ao lado
ainda não salvo.

## v0.12.4 — Bug corrigido: logotipo não aparecia nos PDFs exportados
A seção "Identidade visual em relatórios exportados" (Configurações) salvava
o logotipo desde a v0.11.1, mas nenhum dos 3 PDFs gerados (`js/20-page-relatorios.js`
— Avaliação individual, PDI individual, Dossiê completo) de fato desenhava a
imagem no documento — só as cores (`corPrimaria`/`corSecundaria`) eram
aplicadas nos cabeçalhos de tabela. O nome da seção prometia um efeito que
não existia.

- Nova função `desenharLogoNoPDF()`, que embute o logotipo no topo de cada
  PDF quando ele veio de **Colar imagem** ou **Enviar arquivo** (base64).
- Logotipos definidos por **link (URL)** externo continuam aparecendo
  normalmente na tela, mas não são embutidos no PDF — o navegador não
  consegue ler os pixels de uma URL remota de forma síncrona (mesma
  limitação de CORS já documentada na tentativa de extração de cor da
  v0.12.0, removida na v0.12.1). Isso agora está explicado na própria tela
  de Configurações, em vez de falhar silenciosamente.
- Falha ao desenhar uma imagem corrompida/inesperada não derruba mais a
  exportação inteira do PDF (blindado com try/catch).

## v0.12.3 — Revisão de bugs
Revisão completa do código: toda chamada de função foi cruzada com sua
definição (nenhuma referência quebrada encontrada), e os cálculos de
diagnóstico/classificação foram testados isoladamente. Encontrados e
corrigidos 4 bugs reais, todos da mesma família — um "else" genérico que,
na ausência de dado, acabava afirmando a MELHOR classificação possível
(Alavancar) em vez de admitir que não havia dado:

1. `consolidarCiclo` (`js/15-page-ciclos-avaliacao.js`): se um diagnóstico
   fosse gerado sem nenhum pilar com média válida (caso extremo, hoje
   bloqueado pela validação do Desenho de Cargo, mas não pelo cálculo em
   si), a divisão virava `NaN` e `classificar(NaN)` retornava `'A'` por
   acaso — `NaN <= x` é sempre falso, então a comparação caía no último
   `return`. Agora fica `null` explicitamente.
2. `pillClass`/`pillLabel` (`js/02-core-helpers.js`): mesmo problema, um
   nível abaixo — qualquer valor que não fosse `'I'` nem `'D'` (incluindo
   `null`/`undefined`) virava visualmente "Alavancar". Agora existe uma
   checagem explícita para `'A'`, e o caso sem dado usa o estilo neutro
   (`pill-neutral`) com o texto "Sem dado".
3. `renderDistribuicaoIDA` (`js/07-router-dashboard.js`, dashboards do RH
   e Administrador): a contagem "% por classificação" somava qualquer
   diagnóstico sem `geral` reconhecido como Alavancar. Agora exclui esses
   casos da contagem.
4. Consolidado mensal "Evolução organizacional" (mesmo arquivo): um
   diagnóstico com `geralMedia` nula (mesmo caso extremo do item 1) entraria
   na média do mês como `0` (coerção de `null` em soma), puxando a média
   pra baixo silenciosamente. Agora é excluído do cálculo.

Nenhum desses bugs muda o comportamento em uso normal — em todos os casos
reais (cargo com Desenho aprovado, indicadores respondidos) o resultado
antes e depois é idêntico. O problema só aparecia num cenário praticamente
inatingível pela interface hoje; ainda assim, o sistema não deveria inventar
uma nota boa por falta de dado, então valia corrigir.

## v0.12.2 — Remover logotipo + correção de bug ao trocar mais de uma vez
- **Botão "Remover logotipo"**: aparece junto do preview sempre que há um
  logotipo definido, nos dois lugares (Cadastro de Empresa e Configurações
  → Identidade Visual). Limpa o valor e os campos de URL/arquivo.
- **Corrigido: trocar o logotipo mais de uma vez não fazia nada.** Duas
  causas encontradas e corrigidas em `js/02-core-helpers.js`:
  - O `<input type="file">` não tinha seu valor resetado depois de ler o
    arquivo — navegadores não disparam o evento de novo ao escolher o
    mesmo arquivo (ou às vezes nem outro) sem esse reset.
  - A área de "Colar imagem" não limpava o próprio conteúdo depois de cada
    colagem, deixando o elemento num estado que atrapalhava a tentativa
    seguinte.

## v0.12.1 — Removida a adaptação automática de cor
- Removida a extração automática de cor do logotipo introduzida na v0.12.0
  (funções `extrairCorDominante`, `aplicarTemaCores`, `adaptarCoresAoLogo`,
  `rgbParaHex`, `corMaisClara`) — por decisão de produto, as cores do tema
  voltam a ser só as escolhidas manualmente em Configurações → Identidade
  Visual (como já era antes da v0.12.0).
- **Mantido**: o logotipo da empresa no canto superior esquerdo do menu
  (substituindo o símbolo do Instituto INETRIS quando definido), introduzido
  também na v0.12.0.

## v0.12.0 — Adaptação de cor ao logotipo + logo da empresa no menu
- **Cores do sistema adaptadas ao logotipo**: ao definir um logotipo (em
  Cadastro de Empresa ou em Configurações → Identidade Visual, pelos 3
  modos da v0.11.1), o sistema tenta extrair a cor dominante da imagem via
  canvas e aplica como cor de destaque do tema (botões, abas ativas, etc.)
  — as cores de classificação IDA (Iniciar/Desenvolver/Alavancar) não
  mudam, pois são semânticas da metodologia, não da marca da empresa.
  Quando o logotipo veio de um link (URL) externo sem CORS liberado, a
  extração de cor pode não funcionar (limitação do navegador, não do
  sistema) — nesse caso as cores continuam ajustáveis manualmente em
  Configurações. O tema escolhido é salvo e reaplicado automaticamente a
  cada novo login.
- **Logotipo da empresa no canto superior esquerdo**: o menu lateral agora
  mostra o logotipo da empresa (quando definido) no lugar do símbolo do
  Instituto INETRIS, com o nome fantasia da empresa como título — mantendo
  "Metodologia NORTE" como crédito. Sem logotipo definido, continua exibindo
  a marca padrão do Instituto INETRIS, como sempre foi.

## v0.11.1 — Upload de logotipo com 3 opções
- Novo componente reutilizável (`logoUploadWidgetHTML`, em
  `js/02-core-helpers.js`) usado tanto no Cadastro de Empresa quanto em
  Configurações → Identidade Visual. Antes só dava para colar um link
  (URL) da imagem; agora tem 3 opções lado a lado:
  - **Link (URL)** — como já era.
  - **Colar imagem** — cola (Ctrl+V) uma imagem copiada de qualquer lugar.
  - **Enviar arquivo** — escolhe um arquivo de imagem do computador.
  Nos dois novos modos, a imagem é redimensionada no próprio navegador
  (máx. 300px no maior lado) e guardada como base64 — não depende de
  nenhum servidor de upload de arquivos. Preview do logotipo atual sempre
  visível abaixo dos controles.

## v0.11.0 — Integração do Documento 07 (Backlog de Desenvolvimento)
- **Dossiê completo em PDF** (História 5.4, MVP): novo tipo de relatório em
  `js/20-page-relatorios.js` que consolida **Desenho de Cargo + Avaliação +
  PDI (Desenvolvimento e Mentalidade)** de um colaborador em um único PDF —
  antes só existiam PDFs separados de Avaliação e de PDI, e nenhum incluía
  o Desenho de Cargo.
- **% de colaboradores por classificação no dashboard do RH** (História
  5.3): o card "Distribuição por classificação IDA" (que já existia só no
  dashboard do Administrador) agora também aparece no dashboard do RH, e
  passou a mostrar percentual além da contagem absoluta.
- **Mensagem de erro melhorada** para e-mail duplicado no cadastro
  (`js/19-auth.js`): em vez do erro genérico do Supabase, explica que
  e-mail é único em toda a plataforma (não por Empresa) e orienta o que
  fazer. A limitação de arquitetura em si (não dá pra usar o mesmo e-mail
  em duas Empresas) não foi resolvida — está documentada no
  `RECONCILIACAO-RN.md` como decisão pendente de avaliação futura.

## v0.10.0 — Integração do Documento 06 (Protótipos/Wireframes)
- **Cartões de Dimensão (Resultado/Comportamento/Potencial)**: o Diagnóstico
  calculava só por Pilar (N,O,R,T,E) — faltava a agregação por Dimensão que
  as Telas 02 e 06 exigem (RN008/009/010: N+O+R → Resultado, T →
  Comportamento, E → Potencial). Agora `consolidarCiclo` calcula
  `dimensaoMedia`/`dimensaoSigla`, e `diagnosticoSummaryHTML` mostra os 3
  cartões de Dimensão no topo, com o detalhamento por Pilar logo abaixo —
  igual ao layout da Tela 06.
- **"Esqueci minha senha"** (Tela 01): link na tela de login, usando
  `resetPasswordForEmail` do Supabase Auth.
- **Escolher ação do Banco de Ações no PDI** (Tela 08): antes só dava para
  editar o texto livre da ação sugerida automaticamente. Agora o Gestor
  pode trocar por qualquer ação compatível do Banco de Ações (filtrada por
  pilar), que já preenche evidência e prazo sugeridos.
- **RN017 explícito** na tela de Diagnóstico ("somente leitura, nunca
  editável"), como no rodapé da Tela 06.
- **Alerta "N PDIs de Mentalidade pendentes"** no Dashboard do Gestor
  (Tela 03), além do destaque que já existia na tela de Diagnóstico & PDI.
- **Alinhamento de mensagens de estado vazio**: "Sua primeira avaliação
  ainda não foi concluída" (Dashboard Colaborador, Tela 02).

## v0.9.0 — Integração do Documento 05 (Fluxo de Navegação)
Este documento serviu como validação externa da reconciliação de RN feita na
v0.8.0 (todos os códigos citados nele batem com o que já tínhamos corrigido)
e revelou lacunas novas, agora implementadas:

- **Bloqueio de login após 5 tentativas falhas** (Cap. 1.2): implementado no
  cliente (`js/19-auth.js`), com bloqueio de 15 minutos por e-mail. Nota
  importante: isso é uma camada de UX — não substitui rate-limiting real no
  backend/Supabase Auth Hooks, que é o único mecanismo que resiste a alguém
  chamando a API diretamente, fora desta tela.
- **RN022 (toda Ação do PDI precisa de responsável e prazo)**: antes, um
  Gestor podia aprovar um PDI com ações sem prazo definido (o campo aceitava
  ficar como "A combinar" silenciosamente). Agora `aprovarPDI` bloqueia a
  aprovação e lista quais indicadores/eixos ainda estão pendentes, com a
  mensagem oficial do Documento 05.
- **Alerta de ciclo pendente há mais de 15 dias** e **aviso de ciclo
  extraordinário pós-promoção vencendo em 7 dias** (Cap. 2.3/2.5): novos
  itens no painel de pendências do RH.
- **Confirmação antes de desativar usuário** (Cap. 1.3): texto oficial
  "Deseja realmente remover este usuário? Esta ação não apaga seu histórico
  (RN025)."
- **Alinhamento de textos de sistema** com o Documento 05: cadastro de
  empresa, erro de CNPJ duplicado, evidência enviada/recebida.
- **Progresso da avaliação da equipe** no painel do Gestor: "Sua avaliação
  da equipe está X% concluída. Faltam N colaborador(es)."
- **Sugestões de UX oficiais implementadas** (marcadas no documento como
  "não alteram a metodologia"):
  - Destaque visual (borda de alerta) para PDIs de Mentalidade não
    iniciados, no painel "Diagnóstico & PDI".
  - Comparação lado a lado (ciclo atual vs. anterior) na tabela de
    desempenho da equipe do Gestor, com indicador de evolução (↑/→/↓).
  - Frase de reforço da filosofia junto ao PDI de Mentalidade.
  - Checklist de onboarding (Estrutura → Cultura → Cargos → Colaboradores)
    já existia como "Onboarding do tenant" no Dashboard do Administrador —
    confirmado que já atende a sugestão do documento.

## v0.8.1 — Pesos dos avaliadores travados conforme RN003
- **Decisão de produto**: em vez de formalizar a exceção no PRD, os pesos
  dos avaliadores foram travados em Colaborador 25% / Líder Direto 50% /
  RH 25%, exatamente como especifica a RN003 do Documento 04.
- Removidos: o seletor "Modo de avaliação do RH" (RH revisar sem pontuar)
  e o suporte a múltiplos avaliadores de RH — não são mais configuráveis
  em Configurações nem existem mais no cálculo de consolidação do ciclo.
- O RH agora sempre pontua normalmente, como Colaborador e Líder — a única
  forma de o peso de um avaliador ser redistribuído é a ausência formal
  já prevista (avaliador não respondeu dentro do prazo), que continua
  funcionando como antes.
- `RECONCILIACAO-RN.md` atualizado para refletir que a divergência foi
  fechada por travamento, não por atualização do PRD.

## v0.8.0 — Reconciliação com o PRD (Documento 04)
- **Correção RN013**: limite de indicadores personalizados por pilar (T, E)
  ajustado de 5 para 2, conforme o PRD (2 personalizados + 2 padrão da
  metodologia = 4 no total). Antes o sistema divergia do documento oficial.
- **Reconciliação de numeração de RN**: até esta versão, os comentários do
  código e este changelog usavam uma numeração própria de RN001–RN031 que
  não coincidia com a numeração oficial do PRD (Documento 04, Cap. 6) — os
  mesmos códigos apontavam para regras diferentes nos dois lugares (ex.:
  "RN004" no código era o modo de avaliação do RH, mas no PRD é a regra de
  conclusão da Avaliação com os 3 avaliadores). Todas as citações de RN no
  código, no CHANGELOG e no checklist de QA foram revisadas e corrigidas
  para apontar para o código oficial do PRD, ou removidas/reescritas como
  "regra interna" quando não existe RN correspondente no documento. Ver
  `RECONCILIACAO-RN.md` para a tabela completa de correspondência.
- **Extensão documentada (não é mais um RN inventado)**: o modo "RH revisa
  sem pontuar" e o suporte a múltiplos avaliadores de RH (peso redistribuído)
  são uma flexibilização de produto que diverge da RN003 do PRD (pesos fixos
  25/50/25, sem exceção prevista). A funcionalidade foi mantida, mas agora
  está claramente sinalizada na tela de Configurações como uma extensão
  pendente de decisão formal — atualizar o PRD para prevê-la, ou remover a
  flexibilização e travar os pesos em 25/50/25.

## v0.7.0
- RNF011 (LGPD): desligamento e anonimização de colaboradores, preservando
  histórico estatístico agregado.
- RNF012: barramento interno de eventos de domínio (`ciclo.aberto`,
  `diagnostico.gerado`, `pdi.criado`, `pdi.aprovado`, `avaliacao.encerrada`,
  `cargo.desenho_publicado`, `lgpd.dados_anonimizados`), preparando o núcleo
  para integrações futuras sem necessidade de refatoração.

## v0.6.0
- RNF008: correções de responsividade mobile (tabelas com rolagem
  horizontal, linha de avaliação IDA empilhada em telas pequenas).
- RNF003: log de auditoria tornado verdadeiramente append-only (sem UPDATE/
  DELETE, nem para o Administrador).
- RNF002: painel de permissões configuráveis pelo Administrador (Gestor
  abrir ciclo, Gestor acessar Cargos/Desenho, RH acessar Cadastro da Empresa).
- Checklist de QA para testes manuais de isolamento entre tenants e perfis.

## v0.5.0
- Fechamento do fluxo de PDI: construção editável (ação, evidência, prazo,
  responsável), adição de ações personalizadas sempre vinculadas a um
  indicador de origem, e aprovação formal do PDI antes do Acompanhamento.

## v0.4.0
- Dashboards distintos por perfil (Administrador, RH, Gestor, Colaborador),
  cada um com o escopo de dados correto.
- Escopo estendido: permissão de "escopo estendido" para Gestores, concedida
  explicitamente pelo Administrador (extensão de RBAC — PRD Cap. 3, sem RN
  própria; nota: nas versões anteriores este item aparecia rotulado como
  "RN029", código que no PRD pertence a outra regra — natureza do cargo).
- RN025/RN026: confirmação de que nenhuma entidade histórica é excluída
  fisicamente; carimbo de auditoria padrão (criado/atualizado por/em) nas
  principais entidades (nota: rotulado anteriormente como "RN030/RN031").
- Central de pendências por perfil na tela inicial (Cap. 9).
- Registro de reunião de feedback no ciclo.

## v0.3.0
- Módulo de Relatórios: exportação de avaliação e PDI em PDF, consolidado
  por Unidade/Setor e comparativo histórico em Excel.
- Módulo de Configurações: periodicidade de ciclo, modo de avaliação do RH
  (extensão além da RN003 do PRD, não é a regra RN004 do documento oficial),
  identidade visual em relatórios.
- Banco de Ações customizável pela empresa, com sinalização visual de
  origem (metodologia vs. customizada).

## v0.2.0
- Módulo de Usuários e Permissões completo: vínculo à estrutura
  organizacional, desativação de conta sem perda de histórico.
- Módulo de Cultura Organizacional com retrato congelado por ciclo — mudanças
  não afetam retroativamente ciclos já abertos/encerrados (extensão do
  princípio de versionamento, RN024; nota: rotulado anteriormente como
  "RN017", código que no PRD pertence à automação do Diagnóstico).
- Desenho de Cargo com versionamento real (RN024), motivo obrigatório a
  partir da 2ª versão, comparação visual entre versões (diff), e
  "descontinuar" em vez de excluir (nota: rotulado anteriormente como
  "RN019", código que no PRD pertence à listagem de indicadores no PDI de
  Desenvolvimento).
- Módulo de Colaboradores com vínculo completo (critério de aceite do módulo
  — PRD Cap. 5, sem RN própria) e histórico de movimentações (promoção,
  troca de setor/gestor).
- Prazos de avaliação com lembretes (D-5/D-2/D-0) e estado de "Pendência de
  Avaliador" (regra interna, sem RN correspondente no PRD), com opções de
  estender prazo ou registrar ausência formal.
- Reabertura formal de ciclo consolidado (regra interna, sem RN
  correspondente no PRD).

## v0.1.0
- Primeira versão organizada em múltiplos arquivos (antes, tudo vivia em um
  único `index.html`).
- Login e cadastro com código de convite, perfis de acesso (Dono, RH,
  Gestor, Colaborador).
- Módulos de Empresa, Estrutura Organizacional, Banco de Inteligência
  (sugestões por família de cargo — Cap. 11.5, Governança de IA, sempre
  como rascunho editável).
- Botão de gerar dados de teste.
