# Pacote para o revisor de segurança

Documento para quem for revisar o sistema NORTE (Instituto INETRIS). O autor **não é da área técnica** e boa parte do código foi escrita com apoio de IA, então a revisão independente é importante. Tudo abaixo foi escrito para ser **conferido**, não para ser aceito.

## 1. O que é

Sistema web de gestão de pessoas para pequenas e médias empresas (recrutamento, avaliação, ponto, NR-1, cargos). Multiempresa: cada cliente é uma "empresa" e os papéis são **Administrador (owner), RH, líder e colaborador**, mais o **super admin** (equipe INETRIS).

- **Front-end:** JavaScript puro, sem framework, hospedado no GitHub Pages. ~55 arquivos em `js/`, páginas públicas em `*.html` (vaga, vídeo, resultado, entrada, planos).
- **Back-end:** Supabase (Postgres, Auth, Storage, Edge Functions em Deno). Um projeto principal e um projeto separado só para o Ponto.
- **Dados da empresa:** um **documento JSON por empresa** (`dados_sistema.payload`) com 12 áreas; mais tabelas próprias (convites, perfis, empresas, vagas públicas, candidaturas, vídeos, resultados, auditoria...). Mapa completo das regras: **docs/MATRIZ-RLS.md** (gerado do código).

## 2. Como a segurança funciona (e onde olhar)

| Tema | Onde |
|---|---|
| Papel e empresa de cada pessoa | `perfis`; funções `empresa_do_usuario()` e `meu_papel()` em `sql/01`, `sql/07`, `sql/45` |
| Regras por tabela (RLS) | todos os `sql/*.sql`; **matriz gerada** em `docs/MATRIZ-RLS.md` (`python3 scripts/matriz-rls.py`) |
| Proteção de colunas de `perfis` e `empresas` | gatilhos em `sql/45-seguranca-papeis.sql` |
| Gravação do documento da empresa | função `salvar_dados_areas` (`sql/45`), cliente em `js/18-persistence.js` |
| Controle de versão e combinação de alterações | `sql/44`, `js/53-merge-estado.js` |
| Funções públicas (sem login) | seção 3 |
| Testes | seção 6 |

## 3. Edge Functions (13)

As **7 públicas** têm "Verify JWT" **desligado** de propósito (visitante sem login) e precisam se proteger sozinhas: `supabase/config.toml` lista todas, e um teste confere que são exatamente estas.

| Função | Pública | O que faz | Onde ler a proteção |
|---|:-:|---|---|
| `teste-gratis` | sim | cria empresa de teste | `supabase/functions/teste-gratis/index.ts` |
| `login-bloqueio` | sim | bloqueio de tentativas de login (no servidor) | `.../login-bloqueio/index.ts` |
| `rs` | sim | candidatura pública, banco de talentos | `.../rs/index.ts` |
| `chamado-automatico` | sim | chamados de suporte | `.../chamado-automatico/index.ts` |
| `rotinas-agendadas` | sim | rotinas diárias; ação `diaria` exige o segredo `CRON_SECRET` | `.../rotinas-agendadas/index.ts` |
| `video-rs` | sim (candidato) + login (RH) | vídeo do candidato | código secreto de 256 bits (só o hash no banco), limite por IP, confere o tipo real do arquivo |
| `entrega-rs` | sim (candidato) + login (RH) | resultado de testes do candidato | idem, com teste |
| `acesso-sem-email`, `assistente-ajuda`, `enviar-email`, `nr1`, `ponto`, `folha-ponto` | não | exigem login | `.../<função>/index.ts` |

## 4. Segredos (nomes, nunca valores)

Supabase: chave pública (no site, é pública por desenho) e chave de serviço (só nas funções). Nas funções: `RESEND_API_KEY` (e-mail), `CRON_SECRET` (**foi exposto em conversa: precisa ser trocado**), `URL_SITE`, `ANTHROPIC_API_KEY` (IA, opcional), `EMAIL_EQUIPE`. No GitHub: `SUPABASE_ACCESS_TOKEN` (deploy e migrações). Confirme que **nenhuma chave secreta está no código**: há um teste (`tests/ambientes.test.js`).

## 5. Falhas conhecidas (declaradas pelo autor)

1. **Leitura do documento da empresa** ainda é por empresa (qualquer pessoa logada lê todas as áreas). Etapas 2 e 3 planejadas (docs/SEGURANCA-PAPEIS.md).
2. **Dentro de uma área permitida**, um colaborador consegue alterar dados de outros (ex.: `ciclos`).
3. **Sem verificação em duas etapas** nas contas.
4. **`CRON_SECRET` comprometido** (trocar e refazer os 2 agendamentos).
5. **Supabase no plano gratuito**: sem backup garantido nem teste de restauração.
6. Política de Privacidade e Termos **sem revisão de advogado**; a NR-1 não foi validada por profissional de SST.
7. **Não testado contra o Supabase real:** envio direto de vídeo e de resultados ao Storage, entrega de e-mail, e as regras de segurança (só contra um Postgres simulado com as mesmas migrações).
8. Código com **muitas variáveis globais** entre arquivos (225 mutáveis; 20 alteradas por arquivos diferentes dos que as criam).
9. Documento único por empresa: limite prático ~60 colaboradores.

## 6. Como rodar e o que os testes cobrem

```
npm ci
npm test                       # ~800 testes
python3 scripts/matriz-rls.py --check   # regra de segurança sem controle de papel falha
npm run lint && npm run check:tipos
```

- **Regras de segurança** (`tests/seguranca-banco.test.js`): rodam contra um Postgres de verdade (PGlite) com as **migrações reais**. Os mesmos ataques funcionam no banco antigo e falham no novo.
- **Funções do servidor:** testadas com banco e armazenamento simulados (`tests/*servidor*.test.js`).
- **Telas:** testadas em um DOM simulado; algumas em Chromium (não estão no CI).
- **Mutação:** os erros mais importantes foram plantados de propósito para conferir que os testes os detectam (registrado no `CHANGELOG.md`).

## 7. O que pedimos ao revisor

1. Tentar **ler ou alterar dados de outra empresa** e **escalar de papel** por todos os caminhos (API REST, RPC, Storage, Realtime, Edge Functions).
2. Revisar as **7 funções públicas** (abuso, enumeração, limites, tokens).
3. Revisar o **modelo de documento único** e a função `salvar_dados_areas`.
4. Opinar sobre **LGPD**: dados sensíveis, retenção, canal do titular, transferência para provedores no exterior (Supabase, Resend, IA).
5. Indicar o que **bloqueia a venda** e o que pode esperar.

Arquivos para ler primeiro: `sql/45-seguranca-papeis.sql`, `docs/MATRIZ-RLS.md`, `js/18-persistence.js`, `supabase/functions/rs/index.ts`, `supabase/functions/entrega-rs/index.ts`, `supabase/config.toml`.
