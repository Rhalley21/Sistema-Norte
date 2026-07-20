# Changelog — Plataforma NORTE

Registro de versões da própria plataforma (não confundir com o versionamento
de Desenho de Cargo, que é por cargo/empresa — ver RN019).

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
- RN029: permissão de "escopo estendido" para Gestores, concedida
  explicitamente pelo Administrador.
- RN030/RN031: confirmação de que nenhuma entidade histórica é excluída
  fisicamente; carimbo de auditoria padrão (criado/atualizado por/em) nas
  principais entidades.
- Central de pendências por perfil na tela inicial (Cap. 9).
- Registro de reunião de feedback no ciclo.

## v0.3.0
- Módulo de Relatórios: exportação de avaliação e PDI em PDF, consolidado
  por Unidade/Setor e comparativo histórico em Excel.
- Módulo de Configurações: periodicidade de ciclo, modo de avaliação do RH
  (RN004), identidade visual em relatórios.
- Banco de Ações customizável pela empresa, com sinalização visual de
  origem (metodologia vs. customizada).

## v0.2.0
- Módulo de Usuários e Permissões completo: vínculo à estrutura
  organizacional, desativação de conta sem perda de histórico.
- Módulo de Cultura Organizacional com RN017 (mudanças não afetam
  retroativamente ciclos já abertos/encerrados).
- Desenho de Cargo com versionamento real (RN019), motivo obrigatório a
  partir da 2ª versão, comparação visual entre versões (diff), e
  "descontinuar" em vez de excluir.
- Módulo de Colaboradores com vínculo completo (RN020) e histórico de
  movimentações (promoção, troca de setor/gestor).
- Prazos de avaliação com lembretes (D-5/D-2/D-0) e estado de "Pendência de
  Avaliador" (RN023), com opções de estender prazo ou registrar ausência
  formal.
- Reabertura formal de ciclo consolidado (RN010).

## v0.1.0
- Primeira versão organizada em múltiplos arquivos (antes, tudo vivia em um
  único `index.html`).
- Login e cadastro com código de convite, perfis de acesso (Dono, RH,
  Gestor, Colaborador).
- Módulos de Empresa, Estrutura Organizacional, Banco de Inteligência
  (sugestões por família de cargo, RN028 — sempre como rascunho editável).
- Botão de gerar dados de teste.
