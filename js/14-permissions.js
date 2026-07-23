function podeEditarEtapa(ciclo){
  const etapa = ciclo.etapa || 'colaborador';
  const colaborador = state.colaboradores.find(c=>c.id===ciclo.colaboradorId);
  if(etapa === 'colaborador') return meuPapelReal === 'colaborador' && colaborador?.perfilId === meuPerfilId;
  // BUG CORRIGIDO: se o Administrador está registrado como gestor direto de
  // alguém (colaborador.gestorPerfilId === o próprio Administrador — um
  // cenário comum em empresas pequenas, onde o dono também lidera parte da
  // equipe), a etapa "líder" ficava travada, mesmo sendo literalmente essa
  // pessoa quem precisa avaliar. Isso não é "Administrador virando avaliador
  // de todo mundo" (o que a RN002/Cap. 2.1 do PRD não permite) — é honrar o
  // vínculo de gestor já cadastrado no organograma, seja qual for o papel
  // de sistema de quem está logado.
  if(etapa === 'lider') return (meuPapelReal === 'lider' || meuPapelReal === 'owner') && colaborador?.gestorPerfilId === meuPerfilId;
  // BUG CORRIGIDO: a etapa do RH só liberava para quem tinha o papel de
  // sistema "rh" exato. Diferente da etapa do líder (que é vinculada a um
  // colaborador específico via gestorPerfilId), a etapa do RH é uma função
  // de empresa toda — e o Administrador já tem visibilidade total sobre
  // todos os ciclos (ver cicloVisivelParaMim) e já pode construir/aprovar o
  // PDI sem restrição (ver podeConstruirPDI/podeAprovarPDI). Faltava só
  // essa etapa específica de preenchimento acompanhar a mesma regra — comum
  // em empresas pequenas onde o dono também faz o papel de RH.
  if(etapa === 'rh') return meuPapelReal === 'rh' || meuPapelReal === 'owner';
  return false;
}
function cicloVisivelParaMim(ciclo){
  if(meuPapelReal === 'owner' || meuPapelReal === 'rh') return true;
  if(meuPapelReal === 'lider' && meuEscopoEstendido) return true; // Escopo estendido: exceção explícita do Administrador (extensão de RBAC — PRD Cap. 3)
  if(meuPapelReal === 'lider' && ciclo.gestorAnteriorTransicao === meuPerfilId) return true; // Nota de transição do gestor anterior (regra interna, sem RN correspondente no PRD)
  const colaborador = state.colaboradores.find(c=>c.id===ciclo.colaboradorId);
  if(meuPapelReal === 'lider') return colaborador?.gestorPerfilId === meuPerfilId;
  if(meuPapelReal === 'colaborador') return colaborador?.perfilId === meuPerfilId;
  return false;
}
/* ===================== 7. CICLOS DE AVALIAÇÃO ===================== */
