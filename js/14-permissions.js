function podeEditarEtapa(ciclo){
  const etapa = ciclo.etapa || 'colaborador';
  const colaborador = state.colaboradores.find(c=>c.id===ciclo.colaboradorId);
  if(etapa === 'colaborador') return meuPapelReal === 'colaborador' && colaborador?.perfilId === meuPerfilId;
  if(etapa === 'lider') return meuPapelReal === 'lider' && colaborador?.gestorPerfilId === meuPerfilId;
  if(etapa === 'rh') return meuPapelReal === 'rh';
  return false;
}
function cicloVisivelParaMim(ciclo){
  if(meuPapelReal === 'owner' || meuPapelReal === 'rh') return true;
  if(meuPapelReal === 'lider' && meuEscopoEstendido) return true; // RN029: exceção explícita do Administrador
  if(meuPapelReal === 'lider' && ciclo.gestorAnteriorTransicao === meuPerfilId) return true; // RN006: nota de transição
  const colaborador = state.colaboradores.find(c=>c.id===ciclo.colaboradorId);
  if(meuPapelReal === 'lider') return colaborador?.gestorPerfilId === meuPerfilId;
  if(meuPapelReal === 'colaborador') return colaborador?.perfilId === meuPerfilId;
  return false;
}
/* ===================== 7. CICLOS DE AVALIAÇÃO ===================== */
