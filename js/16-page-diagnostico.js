function pdiMentalidadeNaoIniciado(ciclo){
  if(!ciclo.pdiMentalidade) return true;
  const eixos = ['Conhecimento','Ambiente','Relacoes'];
  return eixos.every(eixo => {
    const v = ciclo.pdiMentalidade[eixo] || {};
    return !v.ondeEstou && !v.ondeQueroChegar && !v.oQueVouFazer;
  });
}
function pageDiagnostico(){
  const comDiag = state.ciclos.filter(c=>c.diagnostico && cicloVisivelParaMim(c));

  // Agrupa por colaborador pra mostrar a trajetória de quem já tem 2+
  // ciclos com diagnóstico — os cards individuais abaixo continuam
  // mostrando ciclo a ciclo, isso aqui é só a visão de trajetória.
  const porColaborador = {};
  comDiag.forEach(c=>{
    porColaborador[c.colaboradorId] = porColaborador[c.colaboradorId] || [];
    porColaborador[c.colaboradorId].push(c);
  });
  const comTrajetoria = Object.entries(porColaborador).filter(([,ciclos])=>ciclos.length>1);

  return `
    <div class="page-head">
      <div class="eyebrow">Etapa 08 · Ciclo NORTE</div>
      <h1>Diagnóstico & PDI — visão consolidada</h1>
      <p class="page-desc">Todo diagnóstico gera obrigatoriamente dois PDIs: Desenvolvimento e Mentalidade. Tela somente leitura — o Diagnóstico nunca é editável manualmente (RN017).</p>
    </div>

    ${comTrajetoria.length ? `
    <div class="card">
      <h3>Trajetória por colaborador <small>Só aparece quem já tem 2 ou mais ciclos com diagnóstico</small></h3>
      ${comTrajetoria.map(([colabId, ciclos])=>{
        const p = state.colaboradores.find(x=>x.id===colabId);
        return `
        <div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--line);">
          <div class="small-muted" style="margin-bottom:6px;"><b style="color:var(--ink);">${p?.nome||'—'}</b> · ${ciclos.length} ciclos</div>
          ${renderGraficoTrajetoriaIDA(ciclos)}
        </div>`;
      }).join('')}
    </div>
    ` : ''}

    <div class="card">
      <h3>Matriz 9-Box <small>Desempenho × Potencial — visão consolidada da equipe</small></h3>
      ${(() => {
        const colaboradoresVisiveis = state.colaboradores.filter(c => {
          if(c.inativo) return false;
          if(meuPapelReal === 'owner' || meuPapelReal === 'rh') return true;
          if(meuPapelReal === 'lider') return c.gestorPerfilId === meuPerfilId;
          return c.perfilId === meuPerfilId;
        });
        return renderMatriz9Box(colaboradoresVisiveis, state.ciclos);
      })()}
    </div>

    ${comDiag.length? comDiag.map(c=>{
      const p = state.colaboradores.find(x=>x.id===c.colaboradorId);
      const cargo = state.cargos.find(x=>x.id===c.cargoId);
      const mentalidadeAtrasada = pdiMentalidadeNaoIniciado(c) && c.estado !== 'Encerrado';
      return `
      <div class="card" ${mentalidadeAtrasada ? 'style="border-left:3px solid var(--iniciar);"' : ''}>
        <h3>${p.nome} <small>${cargo.nome} · ${c.estado}</small></h3>
        ${diagnosticoSummaryHTML(c)}
        ${mentalidadeAtrasada ? `<div class="notice" style="border-left-color:var(--iniciar);margin-top:10px;">⚠ PDI de Mentalidade ainda não iniciado — é obrigatório em todo ciclo (RN020), independente da classificação.</div>` : ''}
        <button class="btn btn-sm" style="margin-top:12px;" onclick="abrirCiclo('${c.id}')">Ver PDI completo →</button>
      </div>`;
    }).join('') : '<div class="empty">Nenhum diagnóstico gerado ainda. Consolide uma avaliação em <b>Ciclos de Avaliação</b>.</div>'}
  `;
}

/* ===================== 9. BANCO DE INTELIGÊNCIA ===================== */
