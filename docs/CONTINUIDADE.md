# Continuidade: o que fazer se só uma pessoa conhece o sistema

Hoje o sistema depende de **uma única pessoa**. Este documento existe para reduzir esse risco: onde estão as coisas, como se recuperar e quem procurar. **Preencha as tabelas** (só você sabe) e guarde uma cópia **fora** do computador de trabalho.

## 1. Contas e acessos (preencha)

| Serviço | Para quê | E-mail da conta | Quem mais tem acesso | Verificação em duas etapas | Como recuperar |
|---|---|---|---|---|---|
| GitHub | código e site | | | ☐ ligada | |
| Supabase | banco, usuários, arquivos, funções | | | ☐ ligada | |
| Resend | envio de e-mails | | | ☐ ligada | |
| Registro do domínio | endereço `inetris.com.br` | | | ☐ ligada | |
| E-mail principal | recuperação de todas as contas acima | | | ☐ ligada | |
| Anthropic (IA) | assistente (desligado) | | | ☐ ligada | |

**Faça já:** (1) ligue a **verificação em duas etapas** em todas essas contas, **começando pelo e-mail**; (2) use um **gerenciador de senhas**; (3) crie um **segundo e-mail de recuperação** e anote os **códigos de backup** da verificação; (4) deixe uma pessoa de **confiança** sabendo **onde** está a lista (não as senhas em texto solto).

## 2. Se algo quebrar depois de uma atualização

1. **Voltar o site:** no repositório, baixe o zip da versão anterior (cada versão foi entregue como zip) e repita os passos de `docs/CI-E-IMPLANTACAO.md`; ou, no GitHub, use **Revert** no último commit.
2. **Ver o que o banco recusou:** `select papel, detalhes, criado_em from seguranca_log order by criado_em desc limit 20;`
3. **Voltar a segurança (emergência):** rode `sql/emergencia/reverter-45.sql` no SQL Editor. **Isso reabre as brechas** corrigidas: use só para o sistema voltar a funcionar e reaplique o `sql/45` assim que possível.
4. **Funções do servidor:** em Supabase → Edge Functions → a função → **Logs**.

## 3. Segredos

- Para **trocar** um segredo: Supabase → Edge Functions → Secrets (crie o novo valor, **nunca** o cole em conversa ou e-mail).
- O `CRON_SECRET` **foi exposto em conversa** e precisa ser trocado (e os dois agendamentos refeitos). Peça ajuda para isso antes de ter clientes reais.

## 4. Incidente com dados pessoais (LGPD)

Se houver suspeita de vazamento ou acesso indevido:
1. **Contenha:** suspenda o acesso afetado (desative a conta; para uma empresa inteira, o painel do super admin tem "suspender").
2. **Registre:** o que aconteceu, quando, quais dados e de quem (a Auditoria do sistema ajuda).
3. **Consulte um advogado de proteção de dados.** A LGPD exige comunicar a ANPD e os titulares em caso de risco relevante, com prazo curto (a regulamentação da ANPD fala em poucos dias úteis: **confirme o prazo atual com o advogado**).
4. A empresa **cliente** é a controladora dos dados: avise-a primeiro, conforme o contrato.

## 5. Quem pode assumir ou revisar

Procure um(a) desenvolvedor(a) **full-stack com experiência em Supabase/Postgres e Edge Functions (Deno)**. Para segurança, alguém com experiência em **testes de intrusão em aplicações web com Supabase**. Entregue a ele(a) o **docs/REVISAO-SEGURANCA.md** (pacote do revisor) e o acesso **somente leitura** ao repositório. Dê acesso às contas de produção só depois de um acordo de confidencialidade.

## 6. Mapa da documentação

| Quero saber... | Leia |
|---|---|
| Como subir uma versão | `docs/CI-E-IMPLANTACAO.md` |
| Ambientes, migrações, site de testes | `docs/AMBIENTES.md` |
| Como a segurança por papel funciona | `docs/SEGURANCA-PAPEIS.md`, `docs/MATRIZ-RLS.md` |
| Salvamento e conflitos | `docs/SALVAMENTO-SEGURO.md` |
| Processo seletivo, vídeo, resultados, relatórios | `docs/PROCESSO-SELETIVO.md`, `docs/VIDEO-RS.md`, `docs/ENTREGA-RS.md`, `docs/RELATORIOS-RS.md` |
| Rotinas diárias | `docs/ROTINAS-AGENDADAS.md` |
| Acessibilidade | `docs/ACESSIBILIDADE.md` |
| Histórico de mudanças | `CHANGELOG.md` |
