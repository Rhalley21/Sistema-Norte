# Changelog — Plataforma NORTE

Registro de versões da própria plataforma (não confundir com o versionamento
de Desenho de Cargo, que é por cargo/empresa — ver RN024).

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
