function pageDiagnostico(){
  const comDiag = state.ciclos.filter(c=>c.diagnostico && cicloVisivelParaMim(c));
  return `
    <div class="page-head">
      <div class="eyebrow">Etapa 08 · Ciclo NORTE</div>
      <h1>Diagnóstico & PDI — visão consolidada</h1>
      <p class="page-desc">Todo diagnóstico gera obrigatoriamente dois PDIs: Desenvolvimento e Mentalidade.</p>
    </div>
    ${comDiag.length? comDiag.map(c=>{
      const p = state.colaboradores.find(x=>x.id===c.colaboradorId);
      const cargo = state.cargos.find(x=>x.id===c.cargoId);
      return `
      <div class="card">
        <h3>${p.nome} <small>${cargo.nome} · ${c.estado}</small></h3>
        ${diagnosticoSummaryHTML(c)}
        <button class="btn btn-sm" style="margin-top:12px;" onclick="abrirCiclo('${c.id}')">Ver PDI completo →</button>
      </div>`;
    }).join('') : '<div class="empty">Nenhum diagnóstico gerado ainda. Consolide uma avaliação em <b>Ciclos de Avaliação</b>.</div>'}
  `;
}

/* ===================== 9. BANCO DE INTELIGÊNCIA ===================== */
