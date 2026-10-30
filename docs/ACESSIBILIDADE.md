# Acessibilidade e facilidade de uso

Meta: o sistema ser utilizável por quem usa **só o teclado**, **leitor de tela**, **zoom** ou tem **baixa visão**, seguindo as diretrizes **WCAG 2.1 nível AA** no que dá para garantir por código. Este documento diz o que foi feito, como conferir e **o que ainda não foi verificado**.

## O que foi feito

**Para todo o sistema (um módulo só, `js/51-acessibilidade.js`):** depois de cada desenho de tela, o módulo completa atributos (nunca muda texto nem estrutura) e nunca derruba a tela:

- **Rótulos:** liga cada `<label>` ao seu campo (antes não havia nenhuma ligação em todo o sistema). Campo sem rótulo usa o `placeholder` ou o `title` como nome.
- **Teclado:** elemento clicável que não é botão (célula, item de lista, `div`) passa a receber foco e responde a **Enter** e **Espaço**. Linhas de tabela clicáveis ganham foco e mantêm o papel de tabela.
- **Nomes:** botão só com ícone ou emoji (como o sino) usa o título como nome; `×` vira "Fechar"; imagem sem `alt` vira decorativa; `<th>` ganha `scope`.
- **Menu:** o item atual diz "página atual", o bloqueado diz "desativado", o grupo recolhível diz se está aberto; o menu tem nome.

**No CSS e na página (`css/style.css`, `app.html`):**
- **Contraste:** o cinza de apoio passou de 2,5:1 para mais de 4,5:1; vermelho, laranja e verde de status, quando usados como **texto**, passaram a tons mais escuros (`--iniciar-texto`, `--desenvolver-texto`, `--alavancar-texto`). Os tons vivos continuam em fundos e bordas.
- **Foco visível** em todo elemento (antes os campos de texto escondiam o foco).
- **"Pular para o conteúdo"**: primeiro Tab da página.
- **Avisos na tela** (as mensagens que aparecem e somem) agora são anunciados por leitores de tela.
- **Movimento reduzido:** quem pede menos animação no sistema operacional não vê transições.

**Nas telas do recrutamento:** seis seletores e filtros que não tinham nome ganharam `aria-label`.

## Como conferir (5 minutos, só com o teclado)

1. Abra o sistema e aperte **Tab**: o primeiro item é o link **"Pular para o conteúdo"**. **Enter** leva o foco ao conteúdo.
2. Continue com **Tab**: em todo botão, link e campo deve aparecer um **anel azul de foco**.
3. Em **Recrutamento**, vá com Tab até um cartão ou linha clicável e acione com **Enter** e **Espaço**.
4. Aumente o zoom do navegador para **200%** (Ctrl e +): nada deve ficar cortado nem exigir rolagem para os lados.
5. No Windows, ligue o **Narrador** (Ctrl+Win+Enter) e ouça um formulário: cada campo deve ser lido com o seu nome.

## Verificação automática

- 22 testes em uma página de verdade (jsdom), incluindo as **telas reais** do recrutamento: nenhum campo pode ficar sem nome.
- Um teste confere o **contraste mínimo de 4,5:1** das cores de texto e impede que os tons vivos voltem a ser usados como texto.
- O verificador **axe-core**, rodado em Chromium nas telas de Recrutamento e Processo seletivo, passou de **24 e 31 problemas para 0 e 0** (regras de contraste, campos sem nome e seletores sem nome).

## O que NÃO foi verificado (seja honesto com o cliente)

- **Leitor de tela de verdade** (NVDA, JAWS, VoiceOver): só foi conferido por código e por verificador automático. Verificadores automáticos encontram só uma parte dos problemas; teste manual com um usuário de leitor de tela é o passo seguinte.
- **As demais telas do sistema** (empresa, cargos, avaliações, ponto, NR1...) só receberam as correções gerais do módulo. Não foram medidas em navegador real com o axe.
- **Gráficos** (barras e linhas dos painéis) e **PDFs** gerados não foram revisados para leitor de tela.
- **Zoom de 200% e telas pequenas (celular):** ainda não medidos nas telas internas. É o próximo item do plano.

## Regras para telas novas

1. Todo campo precisa de `<label>` (basta o rótulo vir antes do campo) ou de `aria-label`. O teste "TELAS REAIS" falha se um campo ficar sem nome: **inclua as telas novas nele**.
2. Prefira `<button>` a `div` com `onclick`. O módulo ajuda, mas botão de verdade é melhor.
3. Para texto, use `--ink`, `--ink-dim`, `--ink-faint`, `--gold` ou as versões `-texto` dos status. Nunca `color: var(--iniciar)`, `--desenvolver` ou `--alavancar` (um teste impede).
4. Nunca remova o contorno de foco (`outline: none`) sem substituir por outro indicador visível.
