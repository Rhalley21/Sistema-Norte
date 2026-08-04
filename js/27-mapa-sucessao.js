/* =========================================================
   MAPA DE SUCESSÃO
   -----------------------------------------------------------
   Reaproveita Estrutura Organizacional + Cargos + histórico de
   avaliação já existentes — sugestão automática de sucessores em
   potencial para posições-chave (cargos de natureza "Estratégica").
   Não substitui decisão humana (Princípio 6 da Metodologia) — é só
   uma sugestão de ponto de partida pra conversa de sucessão.
   ========================================================= */
function ultimoPotencialDoColaborador(colaboradorId){
  const ultimoCiclo = state.ciclos
    .filter(c=>c.colaboradorId===colaboradorId && c.diagnostico?.dimensaoMedia?.Potencial!=null)
    .slice().sort((a,b)=>b.dataAbertura.localeCompare(a.dataAbertura))[0];
  return ultimoCiclo ? ultimoCiclo.diagnostico.dimensaoMedia.Potencial : null;
}

function calcularMapaSucessao(){
  const colaboradoresAtivos = state.colaboradores.filter(c=>!c.inativo);
  const posicoesChave = colaboradoresAtivos.filter(p=>{
    const cargo = state.cargos.find(c=>c.id===p.cargoId);
    return cargo?.natureza === 'Estratégica';
  });

  return posicoesChave.map(ocupante=>{
    const cargo = state.cargos.find(c=>c.id===ocupante.cargoId);
    // Candidatos: mesma unidade (prioridade) ou mesmo setor, excluindo o próprio ocupante.
    const candidatos = colaboradoresAtivos
      .filter(p=>p.id!==ocupante.id && (p.unidadeId===ocupante.unidadeId || p.setorId===ocupante.setorId))
      .map(p=>({ nome:p.nome, potencial: ultimoPotencialDoColaborador(p.id), cargoAtual: state.cargos.find(c=>c.id===p.cargoId)?.nome }))
      .filter(c=>c.potencial!=null)
      .sort((a,b)=>b.potencial-a.potencial)
      .slice(0,3);
    return { ocupanteNome: ocupante.nome, cargoNome: cargo?.nome||'—', candidatos };
  });
}

function pageMapaSucessao(){
  const mapa = calcularMapaSucessao();
  return `
    <div class="page-head">
      <div class="eyebrow">Planejamento de Pessoas</div>
      <h1>Mapa de Sucessão</h1>
      <p class="page-desc">Sugestão automática de sucessores em potencial para posições-chave (cargos de natureza Estratégica), baseada na Estrutura Organizacional e no histórico de Diagnóstico. É um ponto de partida pra conversa — a decisão final é sempre humana (Princípio 6 da Metodologia).</p>
    </div>

    ${mapa.length ? mapa.map(item=>`
      <div class="card">
        <h3>${item.cargoNome} <small>Ocupante atual: ${item.ocupanteNome}</small></h3>
        ${item.candidatos.length ? `
          <table><thead><tr><th>Sucessor sugerido</th><th>Cargo atual</th><th>Potencial (último ciclo)</th></tr></thead><tbody>
            ${item.candidatos.map(c=>`<tr><td><b>${c.nome}</b></td><td class="small-muted">${c.cargoAtual||'—'}</td><td><span class="pill ${pillClass(classificar(c.potencial))}">${pillLabel(classificar(c.potencial))}</span></td></tr>`).join('')}
          </tbody></table>
        ` : '<div class="empty">Nenhum candidato com diagnóstico disponível na mesma unidade/setor ainda.</div>'}
      </div>
    `).join('') : '<div class="empty">Nenhuma posição-chave (cargo de natureza Estratégica) com colaborador vinculado ainda.</div>'}
  `;
}
