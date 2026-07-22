# Reconciliação de Regras de Negócio — Código interno × PRD (Documento 04)

> Criado na v0.8.0. Antes desta versão, os comentários do código e o
> CHANGELOG usavam uma numeração própria de "RN001–RN031" que **não
> coincidia** com a numeração oficial do PRD (Documento 04, Cap. 6 —
> Regras de Negócio). Os mesmos códigos apontavam para regras diferentes
> nos dois lugares. Esta tabela documenta a correspondência para quem
> precisar entender o histórico ou auditar commits anteriores a esta versão.

## Como ler esta tabela

- **Código antigo**: como a regra era citada no código/CHANGELOG antes da v0.8.0.
- **O que a regra realmente faz**: descrição funcional, independente de numeração.
- **RN oficial (PRD)**: o código correto do Documento 04, quando existe uma
  regra equivalente. Quando não existe, está marcado como **"sem RN no PRD"**
  — significa que é uma regra real do sistema, só que não foi formalizada
  como RN numerada no PRD (pode valer a pena incluir na próxima revisão do
  Documento 04, ou é apenas um detalhe de implementação que não precisa virar RN).

| Código antigo (código-fonte) | O que a regra realmente faz | RN oficial (PRD) |
|---|---|---|
| RN004 (config. RH) | Modo "RH revisa sem pontuar" / múltiplos avaliadores de RH | **Sem RN no PRD** — é uma extensão que diverge da RN003 (pesos fixos 25/50/25). Ver nota abaixo. |
| RN004 (múltiplos RH) | Média simples entre avaliadores de RH antes de ponderar | mesma extensão acima |
| RN006 | Nota de transição do gestor anterior, não vinculante | Sem RN no PRD |
| RN009 | Pré-requisitos para abrir um ciclo (empresa ativa, unidade, desenho publicado, colaborador vinculado) | Parcialmente RN001 (desenho de cargo aprovado); o restante é regra interna |
| RN010 | Reabertura formal de ciclo, só o Administrador | Sem RN no PRD |
| RN011 | Prazo de 30 dias para reabertura; preserva revisão original | Sem RN no PRD (o "preservar revisão original" é extensão de RN024) |
| RN012/RN013 (ciclo extraordinário) | Promoção dispara ciclo extraordinário em 3 meses | **RN016** |
| RN013 (limite de indicadores) | Limite de indicadores personalizados por pilar T/E | **RN013** (mesmo código — mas o *valor* estava errado: 5 em vez de 2; corrigido na v0.8.0) |
| RN014 | PDI de Mentalidade compartilhado quando a pessoa está em outro cargo | Sem RN no PRD |
| RN015 | Hierarquia da Estrutura Organizacional (Unidade → Departamento → Setor → Equipe) | Sem RN no PRD (é critério de aceite do módulo, PRD Cap. 5) |
| RN016 (desativar conta) | Desativar conta nunca apaga histórico | **RN025** |
| RN017 (cultura) | Mudança na Cultura não afeta ciclos já abertos/encerrados | Extensão do princípio de **RN024** |
| RN017/RN018 (desenho) | "Retrato congelado" dos indicadores no momento da abertura do ciclo | Extensão do princípio de **RN024** |
| RN018 (T/E universais) | Indicadores de T/E vêm da Cultura Organizacional, não editáveis por cargo | **RN012** |
| RN018/RN019 (avaliação sem desenho) | Nenhum colaborador avaliado sem Desenho de Cargo publicado | **RN001** |
| RN019 (versionamento) | Nova versão do Desenho de Cargo, motivo obrigatório, histórico nunca apagado | **RN024** |
| RN020 (vínculo colaborador) | Colaborador precisa de unidade/setor/gestor/cargo para participar de ciclo | Sem RN no PRD (critério de aceite do módulo, PRD Cap. 5) |
| RN020 (PDI Mentalidade) — *estava rotulado como RN026* | PDI de Mentalidade obrigatório em todo ciclo | **RN020** (corrigido — o código antigo usava RN026 para isso) |
| RN021 | PDI de Mentalidade cobre os 3 pilares (Conhecimento, Ambiente, Relações) | **RN021** (adicionada a citação, antes não estava marcada) |
| RN022 (média ponderada) | Cálculo 25/50/25 com redistribuição de peso em ausências | **RN003** |
| RN022 (faixas) | Faixas de classificação IDA não editáveis pelo cliente | **RN007** / **RN031** |
| RN023 (prazos/pendência) | Lembretes D-5/D-2/D-0, pendência de avaliador | Sem RN no PRD |
| RN023/RN024/RN025 (ação do PDI) | Ação do Banco de Ações vinculada ao indicador/pilar, com evidência específica | **RN019** (lista só Iniciar/Desenvolver) + **RN023** (evidência validada) |
| RN025 (evidência por ação) | Ação personalizada sempre vinculada a um indicador de origem | **RN019** / **RN023** |
| RN027 | Pilar aplicável obrigatório para matching automático de ações customizadas | Sem RN no PRD |
| RN028 | Sugestões nunca aplicadas automaticamente | Cap. 11.5 (Governança de IA), não é a RN028 do PRD |
| RN028 (CBO) | Cargo importado do CBO gera cópia, original nunca editado | **RN028** (este já estava correto) |
| RN029 (escopo estendido) | Exceção de escopo concedida pelo Administrador a um Gestor | Sem RN no PRD (extensão de RBAC, Cap. 3) |
| RN029 (natureza do cargo) | Operacional / Apoio / Estratégica | **RN029** (este já estava correto) |
| RN030 (natureza) | — | **RN030** (categoria "Cultura e Postura Institucional" — já estava correto) |
| RN030 (histórico) | Nenhuma entidade histórica excluída fisicamente | **RN025** |
| RN031 (auditoria) | Campos de carimbo (criado/atualizado por/em) | **RN026** |
| RN031 (pilar→dimensão) | — | **RN031** (já estava correto, quando citado) |

## Extensão de produto — decisão tomada na v0.8.1: travado conforme RN003

Duas funcionalidades do sistema **divergiam deliberadamente** da RN003 do
PRD (pesos fixos Colaborador 25% / Líder 50% / RH 25%, sem exceção
prevista no documento):

1. **Modo "RH revisa sem pontuar"** — peso do RH redistribuído entre
   Colaborador e Líder.
2. **Múltiplos avaliadores de RH** — média simples entre eles antes de
   ponderar os 25%.

Na v0.8.1, a decisão foi **travar os pesos em 25/50/25 conforme a RN003**,
em vez de formalizar a exceção no PRD. As duas funcionalidades foram
removidas do código: o seletor de modo de avaliação do RH e o checkbox de
múltiplos avaliadores de RH não existem mais em Configurações, e o cálculo
de consolidação do ciclo (`consolidarCiclo`) sempre lê a nota do RH
diretamente, sem ramificação. O único mecanismo de redistribuição de peso
que continua ativo é a ausência formal (avaliador que não respondeu dentro
do prazo) — que já fazia parte do RN003 original ("se algum avaliador
ficou sem nota, o peso é redistribuído proporcionalmente entre quem de
fato avaliou").

## O que foi corrigido de fato (não só relabeling)

- **RN013**: limite de indicadores personalizados por pilar (T, E) ajustado
  de 5 para 2 — agora bate com "2 personalizados + 2 padrão = 4 no total",
  conforme o PRD.

Todo o resto listado acima foi correção de **rótulo/comentário** — a regra
de negócio em si já estava implementada corretamente, só a citação do
código RN é que apontava para o número errado.

## Limitação de arquitetura conhecida: e-mail único é global, não por Empresa

O Backlog (Documento 07, Épico 1.3) pede "e-mail único **por Empresa**".
O sistema usa o Supabase Auth para autenticação, que garante e-mail único
**em toda a plataforma** (uma linha em `auth.users` por e-mail) — mais
restritivo do que "por Empresa": uma mesma pessoa não consegue usar o
mesmo e-mail para acessar duas Empresas (tenants) diferentes, por exemplo
um consultor que atende dois clientes NORTE ao mesmo tempo.

Isso **não foi corrigido** nesta versão porque não é um bug — é uma
característica da forma como a autenticação está desenhada hoje, e mudar
isso exigiria uma arquitetura de auth multi-tenant mais complexa (ex.:
permitir múltiplos vínculos empresa↔pessoa para o mesmo e-mail, com troca
de contexto após login). Na v0.11.0, a mensagem de erro de cadastro foi
melhorada (`js/19-auth.js`) para explicar essa limitação com clareza em vez
de mostrar o erro genérico do Supabase — mas a decisão de arquitetura em
si segue pendente, para ser avaliada se aparecer um caso de uso real que
precise disso.
