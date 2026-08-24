/* =========================================================
   REESTRUTURAÇÃO — Líder, RH e Administrador também podem ser avaliados
   -----------------------------------------------------------
   Até aqui, as funções abaixo verificavam o PAPEL DE SISTEMA da pessoa
   logada (colaborador/líder/rh/owner) pra decidir permissão — o que
   funcionava bem quando só quem tinha papel "colaborador" podia ser
   avaliado, mas quebrava completamente se um Líder, RH ou Administrador
   também precisasse passar pelo próprio ciclo (como colaborador DENTRO
   daquele ciclo específico, mesmo continuando Líder/RH/Owner no resto
   do sistema).

   A correção separa duas coisas que antes estavam misturadas:
   1) Papel de sistema (o que a pessoa PODE FAZER no sistema em geral)
   2) Papel dentro DESTE ciclo específico (se ela é a pessoa avaliada, a
      gestora direta dela, ou nenhum dos dois)
   Duas funções auxiliares abaixo (souOColaboradorDoCiclo/souOGestorDoCiclo)
   capturam o item 2 — usadas em vez de comparar só o papel de sistema.
   ========================================================= */
function souOColaboradorDoCiclo(ciclo) {
  const colaborador = state.colaboradores.find((c) => c.id === ciclo.colaboradorId);
  return colaborador?.perfilId === meuPerfilId;
}
function souOGestorDoCiclo(ciclo) {
  const colaborador = state.colaboradores.find((c) => c.id === ciclo.colaboradorId);
  return colaborador?.gestorPerfilId === meuPerfilId;
}

function podeEditarEtapa(ciclo) {
  const etapa = ciclo.etapa || 'colaborador';
  // Autoavaliação: qualquer pessoa pode preencher a própria — Colaborador,
  // Líder, RH ou Administrador, contanto que seja literalmente ela mesma
  // sendo avaliada neste ciclo (não o papel de sistema que decide isso).
  if (etapa === 'colaborador') return souOColaboradorDoCiclo(ciclo);
  // Etapa do Líder: quem estiver cadastrado como gestor direto deste
  // colaborador no organograma — pode ser um Líder, o Administrador
  // (comum em empresas pequenas) ou o RH (cenário novo: RH avaliando um
  // Líder ou um Administrador, no combinado de "avaliação mútua" entre
  // RH e Administrador no topo da hierarquia).
  if (etapa === 'lider')
    return (meuPapelReal === 'lider' || meuPapelReal === 'owner' || meuPapelReal === 'rh') && souOGestorDoCiclo(ciclo);
  // Etapa do RH: função de empresa toda, não vinculada a um colaborador
  // específico — Administrador já tem esse mesmo poder (comum em empresas
  // pequenas onde o dono também faz o papel de RH).
  if (etapa === 'rh') return meuPapelReal === 'rh' || meuPapelReal === 'owner';
  return false;
}
function cicloVisivelParaMim(ciclo) {
  if (meuPapelReal === 'owner' || meuPapelReal === 'rh') return true;
  // Sempre posso ver meu próprio ciclo, seja eu Colaborador, Líder, RH ou
  // Administrador — antes, isso só valia pra quem tinha papel de sistema
  // "colaborador", o que deixava um Líder/RH/Admin sem conseguir nem abrir
  // o próprio ciclo quando estava sendo avaliado.
  if (souOColaboradorDoCiclo(ciclo)) return true;
  if (meuPapelReal === 'lider' && meuEscopoEstendido) return true; // Escopo estendido: exceção explícita do Administrador (extensão de RBAC — PRD Cap. 3)
  if (ciclo.gestorAnteriorTransicao === meuPerfilId) return true; // Nota de transição do gestor anterior (regra interna, sem RN correspondente no PRD)
  // Sou o gestor direto deste colaborador — inclui Líder avaliando a
  // própria equipe, e também RH/Administrador avaliando um Líder/RH/Admin
  // específico, quando registrados como gestorPerfilId dele.
  if (souOGestorDoCiclo(ciclo)) return true;
  return false;
}
/* ===================== 7. CICLOS DE AVALIAÇÃO ===================== */
