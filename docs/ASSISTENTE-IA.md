# Assistente de IA da Central de Ajuda (desligado)

**Situação atual: DESLIGADO.** A Central de Ajuda tem só o que não custa nada: **perguntas frequentes (FAQ)**,
**sugestões automáticas** enquanto a pessoa escreve o chamado e **chamados respondidos pela equipe**. Nenhum texto de
cliente sai do sistema e não há custo de API.

## O que está desligado
- O **chat com o assistente de IA** (o cartão "Assistente de ajuda").
- A **resposta automática da IA** aos chamados (status "Respondido (IA)", botões "Resolveu / Ainda preciso de ajuda").
- A pergunta do FAQ que explica o status "Respondido (IA)".

O código continua no projeto, pronto para religar. Os documentos legais (Política de Privacidade e Termos de Uso) foram
ajustados para **não** citar o assistente enquanto ele estiver desligado.

## Duas travas (as duas precisam estar ligadas)
1. **No site:** `ASSISTENTE_IA_VISIVEL` no arquivo `js/41-page-central-ajuda.js` (`false` = escondido).
2. **No servidor:** o secret `ASSISTENTE_AJUDA_ATIVO` (só o valor `true` liga). **Ter a chave `ANTHROPIC_API_KEY` não liga o
   assistente** — essa chave também é usada pela leitura de folha de ponto por foto, e criar a chave para esse recurso não
   pode ativar o chat (e a cobrança) sem você decidir.

## Para religar (se um dia quiser)
1. Crie uma chave de API no Console da Anthropic (cobrança por uso; precisa de crédito) e defina um limite de gastos lá.
2. No Supabase (**Edge Functions → Secrets**): crie `ANTHROPIC_API_KEY` (a chave) e `ASSISTENTE_AJUDA_ATIVO` = `true`.
3. Reimplante as funções `assistente-ajuda` e `chamado-automatico`.
4. No projeto, troque `ASSISTENTE_IA_VISIVEL = false` por `true` em `js/41-page-central-ajuda.js` e publique.
5. **Restaure os trechos do assistente** na Política de Privacidade (item 2.6 e a menção à Anthropic) e nos Termos de Uso (itens
   sobre a Central de Ajuda e limitação de responsabilidade) — peça a mim e eu refaço, e revise com o advogado. Um teste
   automático avisa se o site e os documentos ficarem em desacordo.

## Custo (estimativa, para decidir)
Cada pergunta envia cerca de **3.400 tokens** (a base de conhecimento é a maior parte) e a resposta tem no máximo 700 tokens.
O limite atual é de 30 perguntas por pessoa por hora e 400 por empresa por mês. Multiplique pelo preço do modelo na página de
preços da Anthropic para estimar o valor.
