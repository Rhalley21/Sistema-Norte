/* =========================================================
   MÓDULO RELATÓRIOS (4.13)
   -----------------------------------------------------------
   Exportação de avaliações individuais e PDI em PDF, e
   relatórios consolidados / comparativos históricos em Excel.

   Nota de transparência técnica: aqui a geração roda no próprio
   navegador (client-side). Para o volume descrito no PRD como
   "sugestão técnica" (relatório anual com milhares de
   colaboradores, processado de forma assíncrona com fila e
   notificação), seria necessário um backend com fila de
   processamento — o que este projeto, hoje, não tem. Para o
   volume de uma empresa cliente individual isso funciona bem;
   é um ponto de evolução caso o volume cresça muito.
   ========================================================= */

let _tipoRelatorio = 'avaliacao';

// BUG CORRIGIDO: a seção "Identidade visual em relatórios exportados"
// (Configurações) salvava o logotipo, mas nenhum PDF gerado aqui de fato
// usava a imagem — só as cores (corPrimaria/corSecundaria) eram aplicadas.
// Esta função tenta desenhar o logotipo no topo do PDF, no canto superior
// direito, ao lado do título.
function desenharLogoNoPDF(doc, x, y, larguraMax, alturaMax){
  const logo = state.configuracoes?.identidadeVisual?.logoUrl || state.empresa?.logotipo || '';
  if(!logo) return;
  const m = /^data:image\/(png|jpe?g);base64,/i.exec(logo);
  if(!m){
    // Logotipo veio de um link (URL) externo, não de upload/colagem — o
    // jsPDF não consegue embutir uma URL remota de forma síncrona (o mesmo
    // tipo de limitação de CORS que já existia na extração de cor). Nesse
    // caso, o PDF sai sem o logotipo em vez de quebrar a exportação inteira.
    return;
  }
  const formato = m[1].toLowerCase().startsWith('jp') ? 'JPEG' : 'PNG';
  try{
    doc.addImage(logo, formato, x, y, larguraMax, alturaMax);
  }catch(e){
    // Imagem corrompida/formato inesperado — não deixa a exportação inteira falhar por causa do logotipo.
  }
}

function pageRelatorios(){
  const ciclosComDiagnostico = state.ciclos.filter(c=>c.diagnostico && cicloVisivelParaMim(c));
  const unidades = state.estrutura.filter(n=>n.tipo==='unidade');
  const setores = state.estrutura.filter(n=>n.tipo==='setor'||n.tipo==='equipe'||n.tipo==='departamento');

  return `
    <div class="page-head">
      <div class="eyebrow">Base do sistema</div>
      <h1>Relatórios</h1>
      <p class="page-desc">Exportação de avaliações individuais e PDI (PDF), e relatórios consolidados / comparativos históricos (Excel).</p>
    </div>

    <div class="card">
      <h3>Tipo de relatório</h3>
      <div class="filtro-categorias">
        ${[
          ['avaliacao','Avaliação individual (PDF)'],
          ['pdi','PDI individual (PDF)'],
          ['dossie','Dossiê completo — Desenho + Avaliação + PDI (PDF)'],
          ['consolidado','Consolidado por Unidade/Setor (Excel)'],
          ['comparativo','Comparativo histórico do colaborador (Excel)'],
        ].map(([v,l])=>`<button class="filtro-pill ${_tipoRelatorio===v?'active':''}" onclick="_tipoRelatorio='${v}'; render();">${l}</button>`).join('')}
      </div>
    </div>

    ${_tipoRelatorio==='avaliacao' || _tipoRelatorio==='pdi' || _tipoRelatorio==='dossie' ? `
      <div class="card">
        <h3>${_tipoRelatorio==='avaliacao' ? 'Avaliação individual' : _tipoRelatorio==='pdi' ? 'PDI individual' : 'Dossiê completo do Colaborador'}</h3>
        ${_tipoRelatorio==='dossie' ? '<p class="page-desc">Um único PDF com Desenho de Cargo, Avaliação e PDI — pronto para arquivo formal e reuniões de feedback.</p>' : ''}
        ${ciclosComDiagnostico.length ? `
          <div class="field"><label>Ciclo (colaborador)</label>
            <select id="rel_ciclo">
              ${ciclosComDiagnostico.map(c=>{
                const p = state.colaboradores.find(x=>x.id===c.colaboradorId);
                return `<option value="${c.id}">${p?p.nome:'—'} — ${c.dataAbertura} (${c.estado})</option>`;
              }).join('')}
            </select>
          </div>
          <button class="btn btn-primary" onclick="${_tipoRelatorio==='avaliacao' ? 'exportarAvaliacaoPDF' : _tipoRelatorio==='pdi' ? 'exportarPDIPDF' : 'exportarDossiePDF'}(document.getElementById('rel_ciclo').value)">Exportar PDF</button>
        ` : '<div class="empty">Nenhum ciclo com diagnóstico gerado ainda.</div>'}
      </div>
    ` : ''}

    ${_tipoRelatorio==='consolidado' ? `
      <div class="card">
        <h3>Consolidado por Unidade/Setor</h3>
        <div class="grid2">
          <div class="field"><label>Unidade <small>(opcional)</small></label>
            <select id="rel_unidade"><option value="">— todas —</option>${unidades.map(n=>`<option value="${n.id}">${n.nome}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Setor/Equipe <small>(opcional)</small></label>
            <select id="rel_setor"><option value="">— todos —</option>${setores.map(n=>`<option value="${n.id}">${n.nome}</option>`).join('')}</select>
          </div>
        </div>
        <button class="btn btn-primary" onclick="exportarConsolidadoExcel()">Exportar Excel</button>
      </div>
    ` : ''}

    ${_tipoRelatorio==='comparativo' ? `
      <div class="card">
        <h3>Comparativo histórico entre ciclos</h3>
        ${state.colaboradores.length ? `
          <div class="field"><label>Colaborador</label>
            <select id="rel_colab">${state.colaboradores.map(p=>`<option value="${p.id}">${p.nome}</option>`).join('')}</select>
          </div>
          <button class="btn btn-primary" onclick="exportarComparativoExcel(document.getElementById('rel_colab').value)">Exportar Excel</button>
        ` : '<div class="empty">Nenhum colaborador cadastrado ainda.</div>'}
      </div>
    ` : ''}

    <div class="notice">Processamento roda no navegador — para relatórios muito grandes (milhares de colaboradores), o ideal seria uma fila assíncrona no servidor com notificação de conclusão (ponto de evolução, ainda não construído).</div>
  `;
}

function exportarAvaliacaoPDF(cicloId){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  const p = state.colaboradores.find(x=>x.id===ciclo.colaboradorId);
  const cargo = state.cargos.find(c=>c.id===ciclo.cargoId);
  const d = ciclo.diagnostico;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16); doc.text('Avaliação de Desempenho — Metodologia NORTE', 14, 18);
  doc.setFontSize(10); doc.setTextColor(120);
  doc.text(state.empresa?.nomeFantasia || '', 14, 24);
  doc.setTextColor(0); doc.setFontSize(11);
  desenharLogoNoPDF(doc, 165, 10, 30, 18);
  doc.text(`Colaborador: ${p.nome}`, 14, 34);
  doc.text(`Cargo: ${cargo.nome} (versão ${p.versaoCargoVinculada||ciclo.cargoId})`, 14, 40);
  doc.text(`Ciclo aberto em: ${ciclo.dataAbertura}    Estado: ${ciclo.estado}`, 14, 46);
  doc.text(`Classificação geral: ${pillLabel(d.geral)}`, 14, 52);

  doc.setFontSize(11); doc.text('Resumo executivo', 14, 62);
  doc.setFontSize(9.5);
  const linhasResumo = doc.splitTextToSize(d.resumoExecutivo, 180);
  doc.text(linhasResumo, 14, 68);

  const y0 = 68 + linhasResumo.length*5 + 8;
  doc.autoTable({
    startY: y0,
    head: [['Indicador','Pilar','Classificação']],
    body: Object.values(d.porIndicador).map(i=>[i.nome, i.pilar, i.sigla?pillLabel(i.sigla):'—']),
    styles:{ fontSize:9 }, headStyles:{ fillColor: hexParaRgb(state.configuracoes?.identidadeVisual?.corPrimaria) },
  });

  doc.save(`avaliacao_${p.nome.replace(/\s+/g,'_')}_${ciclo.dataAbertura}.pdf`);
  registrarAuditoria('relatorio.exportado', { tipo:'avaliacao_individual', cicloId });
  showToast('PDF da avaliação exportado.');
}

function exportarPDIPDF(cicloId){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  const p = state.colaboradores.find(x=>x.id===ciclo.colaboradorId);
  const cargo = state.cargos.find(c=>c.id===ciclo.cargoId);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16); doc.text('Plano de Desenvolvimento Individual (PDI)', 14, 18);
  doc.setFontSize(11);
  desenharLogoNoPDF(doc, 165, 8, 30, 18);
  doc.text(`Colaborador: ${p.nome}    Cargo: ${cargo.nome}`, 14, 28);
  doc.text(`Ciclo: ${ciclo.dataAbertura} — ${ciclo.estado}`, 14, 34);

  doc.setFontSize(12); doc.text('PDI de Desenvolvimento', 14, 46);
  if(ciclo.pdiDesenvolvimento && ciclo.pdiDesenvolvimento.length){
    doc.autoTable({
      startY: 50,
      head: [['Indicador','Ação sugerida','Evidência esperada','Prazo','Status']],
      body: ciclo.pdiDesenvolvimento.map(i=>[i.indicador, i.acaoSugerida, i.evidenciaSugerida, i.prazo, i.status]),
      styles:{ fontSize:8 }, headStyles:{ fillColor: hexParaRgb(state.configuracoes?.identidadeVisual?.corPrimaria) },
    });
  } else {
    doc.setFontSize(10); doc.text('Todos os indicadores em Alavancar — nenhuma ação necessária.', 14, 54);
  }

  let y = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 60) + 12;
  doc.setFontSize(12); doc.text('PDI de Mentalidade', 14, y);
  y += 6;
  if(ciclo.pdiMentalidade){
    doc.autoTable({
      startY: y,
      head: [['Eixo','Onde estou hoje','Onde quero chegar','O que vou fazer','Prazo']],
      body: ['Conhecimento','Ambiente','Relacoes'].map(eixo=>{
        const v = ciclo.pdiMentalidade[eixo];
        return [eixo==='Relacoes'?'Relações':eixo, v.ondeEstou||'—', v.ondeQueroChegar||'—', v.oQueVouFazer||'—', v.prazo||'—'];
      }),
      styles:{ fontSize:8 }, headStyles:{ fillColor: hexParaRgb(state.configuracoes?.identidadeVisual?.corSecundaria) },
    });
  }

  doc.save(`pdi_${p.nome.replace(/\s+/g,'_')}_${ciclo.dataAbertura}.pdf`);
  registrarAuditoria('relatorio.exportado', { tipo:'pdi_individual', cicloId });
  showToast('PDF do PDI exportado.');
}

function exportarDossiePDF(cicloId){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  const p = state.colaboradores.find(x=>x.id===ciclo.colaboradorId);
  const cargo = state.cargos.find(c=>c.id===ciclo.cargoId);
  const d = ciclo.diagnostico;
  const desenho = cargo.desenho;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const corPrimaria = hexParaRgb(state.configuracoes?.identidadeVisual?.corPrimaria);
  const corSecundaria = hexParaRgb(state.configuracoes?.identidadeVisual?.corSecundaria);

  function tituloSecao(texto, y){
    doc.setFontSize(13); doc.setTextColor(...corPrimaria);
    doc.text(texto, 14, y);
    doc.setTextColor(0);
    return y + 6;
  }

  // Capa
  doc.setFontSize(17); doc.text('Dossiê do Colaborador — Metodologia NORTE', 14, 18);
  doc.setFontSize(10); doc.setTextColor(120);
  doc.text(state.empresa?.nomeFantasia || '', 14, 24);
  doc.setTextColor(0); doc.setFontSize(11);
  desenharLogoNoPDF(doc, 160, 8, 35, 20);
  doc.text(`Colaborador: ${p.nome}`, 14, 34);
  doc.text(`Cargo: ${cargo.nome} (${cargo.natureza})`, 14, 40);
  doc.text(`Ciclo aberto em: ${ciclo.dataAbertura}    Estado: ${ciclo.estado}`, 14, 46);
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text('Este documento reúne Desenho de Cargo, Avaliação de Desempenho e PDI — arquivo formal para reuniões de feedback.', 14, 52);
  doc.setTextColor(0);

  // 1) Desenho de Cargo
  let y = tituloSecao('1. Desenho de Cargo (versão ' + (desenho.versao||1) + (desenho.aprovado?', aprovado':', rascunho') + ')', 62);
  doc.setFontSize(9.5);
  const linhasSumario = doc.splitTextToSize(`Sumário: ${desenho.sumario || '—'}`, 180);
  doc.text(linhasSumario, 14, y);
  y += linhasSumario.length*5 + 4;
  const linhasRequisitos = doc.splitTextToSize(`Requisitos mínimos: ${desenho.requisitos || '—'}`, 180);
  doc.text(linhasRequisitos, 14, y);
  y += linhasRequisitos.length*5 + 4;
  const linhasCultura = doc.splitTextToSize(`Cultura e Postura Institucional: ${desenho.culturaPostura || '—'}`, 180);
  doc.text(linhasCultura, 14, y);
  y += linhasCultura.length*5 + 6;
  if((desenho.atividadesEspecificas||[]).length){
    doc.autoTable({
      startY: y,
      head: [['Atividades específicas do cargo']],
      body: desenho.atividadesEspecificas.map(a=>[a]),
      styles:{ fontSize:8.5 }, headStyles:{ fillColor: corPrimaria },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // 2) Avaliação / Diagnóstico
  if(y > 250){ doc.addPage(); y = 20; }
  y = tituloSecao('2. Avaliação de Desempenho — Diagnóstico', y);
  doc.setFontSize(10);
  doc.text(`Classificação geral: ${pillLabel(d.geral)}`, 14, y); y += 6;
  if(d.dimensaoSigla){
    doc.text(`Resultado: ${d.dimensaoSigla.Resultado?pillLabel(d.dimensaoSigla.Resultado):'—'}   Comportamento: ${d.dimensaoSigla.Comportamento?pillLabel(d.dimensaoSigla.Comportamento):'—'}   Potencial: ${d.dimensaoSigla.Potencial?pillLabel(d.dimensaoSigla.Potencial):'—'}`, 14, y);
    y += 8;
  }
  doc.autoTable({
    startY: y,
    head: [['Indicador','Pilar','Classificação']],
    body: Object.values(d.porIndicador).map(i=>[i.nome, i.pilar, i.sigla?pillLabel(i.sigla):'—']),
    styles:{ fontSize:9 }, headStyles:{ fillColor: corPrimaria },
  });
  y = doc.lastAutoTable.finalY + 10;

  // 3) PDI de Desenvolvimento
  if(y > 240){ doc.addPage(); y = 20; }
  y = tituloSecao('3. PDI de Desenvolvimento', y);
  if(ciclo.pdiDesenvolvimento && ciclo.pdiDesenvolvimento.length){
    doc.autoTable({
      startY: y,
      head: [['Indicador','Ação sugerida','Evidência esperada','Prazo','Status']],
      body: ciclo.pdiDesenvolvimento.map(i=>[i.indicador, i.acaoSugerida, i.evidenciaSugerida, i.prazo, i.status]),
      styles:{ fontSize:8 }, headStyles:{ fillColor: corPrimaria },
    });
    y = doc.lastAutoTable.finalY + 10;
  } else {
    doc.setFontSize(10); doc.text('Todos os indicadores em Alavancar — nenhuma ação necessária.', 14, y);
    y += 10;
  }

  // 4) PDI de Mentalidade
  if(y > 240){ doc.addPage(); y = 20; }
  y = tituloSecao('4. PDI de Mentalidade', y);
  if(ciclo.pdiMentalidade){
    doc.autoTable({
      startY: y,
      head: [['Eixo','Onde estou hoje','Onde quero chegar','O que vou fazer','Prazo']],
      body: ['Conhecimento','Ambiente','Relacoes'].map(eixo=>{
        const v = ciclo.pdiMentalidade[eixo];
        return [eixo==='Relacoes'?'Relações':eixo, v.ondeEstou||'—', v.ondeQueroChegar||'—', v.oQueVouFazer||'—', v.prazo||'—'];
      }),
      styles:{ fontSize:8 }, headStyles:{ fillColor: corSecundaria },
    });
  }

  doc.save(`dossie_${p.nome.replace(/\s+/g,'_')}_${ciclo.dataAbertura}.pdf`);
  registrarAuditoria('relatorio.exportado', { tipo:'dossie_completo', cicloId });
  showToast('Dossiê completo (Desenho + Avaliação + PDI) exportado em PDF.');
}

function exportarConsolidadoExcel(){
  const unidadeId = document.getElementById('rel_unidade').value;
  const setorId = document.getElementById('rel_setor').value;
  let lista = state.colaboradores;
  if(unidadeId) lista = lista.filter(p=>p.unidadeId===unidadeId);
  if(setorId) lista = lista.filter(p=>p.setorId===setorId);

  const linhas = lista.map(p=>{
    const cargo = state.cargos.find(c=>c.id===p.cargoId);
    const ciclosDoColab = state.ciclos.filter(c=>c.colaboradorId===p.id);
    const ultimo = ciclosDoColab.slice().sort((a,b)=>a.dataAbertura.localeCompare(b.dataAbertura)).pop();
    return {
      'Colaborador': p.nome,
      'Cargo': cargo?cargo.nome:'—',
      'Unidade': nomeEstruturaPara(p.unidadeId),
      'Setor': nomeEstruturaPara(p.setorId),
      'Gestor direto': _perfisEmpresa.find(pf=>pf.id===p.gestorPerfilId)?.nome || '—',
      'Último ciclo': ultimo ? ultimo.dataAbertura : '—',
      'Estado do último ciclo': ultimo ? ultimo.estado : '—',
      'Classificação geral': ultimo && ultimo.diagnostico ? pillLabel(ultimo.diagnostico.geral) : '—',
    };
  });

  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Consolidado');
  XLSX.writeFile(wb, `consolidado_${new Date().toISOString().slice(0,10)}.xlsx`);
  registrarAuditoria('relatorio.exportado', { tipo:'consolidado_unidade_setor', unidadeId, setorId });
  showToast('Relatório consolidado exportado em Excel.');
}

function exportarComparativoExcel(colabId){
  const p = state.colaboradores.find(x=>x.id===colabId);
  const ciclosDoColab = state.ciclos.filter(c=>c.colaboradorId===colabId && c.diagnostico)
    .slice().sort((a,b)=>a.dataAbertura.localeCompare(b.dataAbertura));

  const linhas = ciclosDoColab.map(c=>{
    const cargo = state.cargos.find(x=>x.id===c.cargoId);
    return {
      'Data de abertura': c.dataAbertura,
      'Cargo na época': cargo?cargo.nome:'—',
      'Estado': c.estado,
      'Classificação geral': pillLabel(c.diagnostico.geral),
      'N': c.diagnostico.pilarSigla.N ? pillLabel(c.diagnostico.pilarSigla.N) : '—',
      'O': c.diagnostico.pilarSigla.O ? pillLabel(c.diagnostico.pilarSigla.O) : '—',
      'R': c.diagnostico.pilarSigla.R ? pillLabel(c.diagnostico.pilarSigla.R) : '—',
      'T': c.diagnostico.pilarSigla.T ? pillLabel(c.diagnostico.pilarSigla.T) : '—',
      'E': c.diagnostico.pilarSigla.E ? pillLabel(c.diagnostico.pilarSigla.E) : '—',
    };
  });

  if(!linhas.length){ showToast('Este colaborador ainda não tem nenhum ciclo com diagnóstico gerado.'); return; }

  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Histórico');
  XLSX.writeFile(wb, `historico_${p.nome.replace(/\s+/g,'_')}.xlsx`);
  registrarAuditoria('relatorio.exportado', { tipo:'comparativo_historico', colaboradorId: colabId });
  showToast('Comparativo histórico exportado em Excel.');
}

function nomeEstruturaPara(id){
  return state.estrutura.find(n=>n.id===id)?.nome || '—';
}
function hexParaRgb(hex){
  const h = (hex||'#0a2647').replace('#','');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
