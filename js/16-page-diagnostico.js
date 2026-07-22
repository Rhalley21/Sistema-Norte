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
  return `
    <div class="page-head">
      <div class="eyebrow">Etapa 08 · Ciclo NORTE</div>
      <h1>Diagnóstico & PDI — visão consolidada</h1>
      <p class="page-desc">Todo diagnóstico gera obrigatoriamente dois PDIs: Desenvolvimento e Mentalidade. Tela somente leitura — o Diagnóstico nunca é editável manualmente (RN017).</p>
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
