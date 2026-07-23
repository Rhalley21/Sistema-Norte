function pageCiclos(){
  const souAdminOuRh = meuPapelReal === 'owner' || meuPapelReal === 'rh' || (meuPapelReal==='lider' && state.configuracoes?.permissoesExtras?.gestorAbreCiclo);
  const colaboradoresElegiveis = state.colaboradores.filter(p=>{
    const cargo = state.cargos.find(c=>c.id===p.cargoId);
    const cargoOk = cargo && cargo.desenho.aprovado && !cargo.descontinuado;
    // Critério de aceite do módulo Colaboradores (PRD Cap. 5): nenhuma avaliação sem todos os vínculos completos.
    return cargoOk && p.unidadeId && p.setorId && p.gestorPerfilId;
  });
  const semCicloAberto = colaboradoresElegiveis.filter(p=>!state.ciclos.some(c=>c.colaboradorId===p.id && c.estado!=='Encerrado'));

  // Regra interna de prazos (sem RN correspondente no PRD): antes de listar, verifica se algum ciclo estourou o prazo sem concluir.
  state.ciclos.forEach(verificarPendenciaCiclo);
  const ciclosVisiveis = state.ciclos.filter(cicloVisivelParaMim);

  if(state.cicloAtivo){
    const ciclo = state.ciclos.find(c=>c.id===state.cicloAtivo);
    if(ciclo && cicloVisivelParaMim(ciclo)) return pageAvaliacao(ciclo);
    if(ciclo && !cicloVisivelParaMim(ciclo)) state.cicloAtivo = null;
  }

  const dataPadraoPrazo = new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0,10);

  return `
    <div class="page-head">
      <div class="eyebrow">Etapa 07 · Ciclo NORTE</div>
      <h1>Ciclos de Avaliação</h1>
      <p class="page-desc">Fluxo sequencial: o Colaborador faz a autoavaliação e envia para o Líder Direto; o Líder avalia e envia para o RH; o RH avalia e consolida o veredito final. Pesos: Colaborador 25%, Líder 50%, RH 25%.</p>
    </div>

    ${souAdminOuRh ? `
    <div class="card">
      <h3>Abrir novo ciclo</h3>
      ${semCicloAberto.length? `
      <div class="grid2">
        <div class="field"><label>Colaborador</label>
          <select id="cy_colab">${semCicloAberto.map(p=>`<option value="${p.id}">${p.nome}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Prazo final da avaliação <small>(lembretes em D-5, D-2 e D-0)</small></label>
          <input id="cy_prazo" type="date" value="${dataPadraoPrazo}">
        </div>
      </div>
      <button class="btn btn-primary" onclick="abrirNovoCiclo()">Abrir ciclo de avaliação</button>
      ` : '<div class="empty">Todos os colaboradores elegíveis já possuem ciclo em andamento, ou nenhum colaborador está apto — pré-requisitos internos de abertura de ciclo.</div>'}
    </div>
    ` : ''}

    <div class="card">
      <h3>${souAdminOuRh ? 'Ciclos' : 'Seus ciclos'}</h3>
      ${ciclosVisiveis.length? renderCiclosTableInteractive(ciclosVisiveis) : '<div class="empty">Nenhum ciclo aberto no momento.</div>'}
    </div>
  `;
}

/* ---------- Prazos, lembretes e pendência de avaliador (regra interna, sem RN correspondente no PRD) ---------- */
function diasAteVencimento(ciclo){
  if(!ciclo.prazoLimite) return null;
  const hoje = new Date(new Date().toISOString().slice(0,10));
  const prazo = new Date(ciclo.prazoLimite);
  return Math.round((prazo - hoje) / (1000*60*60*24));
}
function verificarPendenciaCiclo(ciclo){
  if(ciclo.estado !== 'Aberto' && ciclo.estado !== 'Em Consolidação') return;
  const dias = diasAteVencimento(ciclo);
  if(dias !== null && dias < 0 && ciclo.estado !== 'Pendência de Avaliador'){
    ciclo.estado = 'Pendência de Avaliador';
    registrarAuditoria('ciclo.pendencia_avaliador', { cicloId: ciclo.id, etapaTravada: ciclo.etapa });
  }
}
function estenderPrazoCiclo(cicloId){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  const novoPrazo = document.getElementById('novo_prazo_ciclo').value;
  if(!novoPrazo){ showToast('Escolha uma nova data.'); return; }
  ciclo.prazoLimite = novoPrazo;
  ciclo.estado = 'Em Consolidação';
  registrarAuditoria('ciclo.prazo_estendido', { cicloId, novoPrazo });
  showToast('Prazo estendido. O ciclo voltou ao andamento normal.');
  render();
}
function registrarAusenciaCiclo(cicloId){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  const motivo = document.getElementById('motivo_ausencia_ciclo').value.trim();
  if(!motivo){ showToast('Descreva o motivo da ausência formal antes de registrar.'); return; }
  ciclo.ausencias = ciclo.ausencias || [];
  ciclo.ausencias.push({ id: uid(), etapa: ciclo.etapa, motivo, registradoPor: meuPerfilId, data: new Date().toISOString().slice(0,10) });
  // A ausência formal é o que desbloqueia o fechamento: avança a etapa mesmo
  // sem as notas do avaliador ausente. O cálculo da média ponderada (RN003) já lida
  // com notas faltantes redistribuindo o peso entre quem avaliou de fato.
  const info = ETAPA_INFO[ciclo.etapa];
  if(info.proxima){ ciclo.etapa = info.proxima; ciclo.estado = 'Em Consolidação'; }
  else { ciclo.estado = 'Em Consolidação'; }
  registrarAuditoria('ciclo.ausencia_registrada', { cicloId, etapa: ciclo.etapa, motivo });
  showToast('Ausência registrada formalmente. O ciclo pode avançar.');
  render();
}
function reabrirCiclo(cicloId){
  if(meuPapelReal !== 'owner'){ showToast('Só o Administrador pode reabrir um ciclo encerrado (regra interna de reabertura, sem RN correspondente no PRD).'); return; }

  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  if(ciclo.dataConsolidacao){
    const dias = Math.round((new Date() - new Date(ciclo.dataConsolidacao)) / (1000*60*60*24));
    if(dias > 30){ showToast(`Prazo de reabertura expirado — já se passaram ${dias} dias desde a consolidação (limite: 30 dias, regra interna).`); return; }
  }

  const justificativa = document.getElementById('justificativa_reabertura').value.trim();
  if(!justificativa){ showToast('Informe a justificativa da reabertura.'); return; }

  // Preserva a revisão original — nunca sobrescreve o diagnóstico anterior (extensão do princípio de versionamento, RN024).
  ciclo.revisoes = ciclo.revisoes || [];
  ciclo.revisoes.push({
    numero: ciclo.revisoes.length + 1,
    reabertoEm: new Date().toISOString().slice(0,10),
    justificativa,
    diagnosticoOriginal: ciclo.diagnostico,
    pdiDesenvolvimentoOriginal: ciclo.pdiDesenvolvimento,
    pdiMentalidadeOriginal: ciclo.pdiMentalidade,
    notasOriginais: JSON.parse(JSON.stringify(ciclo.notas)),
  });

  ciclo.estado = 'Em Consolidação';
  ciclo.etapa = 'rh';
  atualizarCarimbo(ciclo);
  registrarAuditoria('ciclo.reaberto', { cicloId, justificativa });
  emitirEvento('ciclo.reaberto', { cicloId, justificativa });
  showToast('Ciclo reaberto formalmente para o RH. A versão anterior foi preservada no histórico de revisões.');
  render();
}
function renderCiclosTableInteractive(lista){
  const ETAPA_LABEL = { colaborador:'Aguardando Colaborador', lider:'Aguardando Líder', rh:'Aguardando RH' };
  return `<table><thead><tr><th>Colaborador</th><th>Estado</th><th>Etapa atual</th><th></th></tr></thead><tbody>
    ${lista.map(c=>{
      const p = state.colaboradores.find(x=>x.id===c.colaboradorId);
      const emAndamento = c.estado==='Aberto' || c.estado==='Em Consolidação';
      const pendente = c.estado==='Pendência de Avaliador';
      return `<tr>
        <td><b>${p?p.nome:'—'}</b>${c.extraordinario?' <span class="tag" style="background:var(--gold-soft);color:var(--gold);">Extraordinário</span>':''}</td>
        <td><span class="pill ${pendente?'pill-iniciar':'pill-neutral'}">${c.estado}</span></td>
        <td class="small-muted">${(emAndamento||pendente) ? (ETAPA_LABEL[c.etapa||'colaborador']) : '—'}</td>
        <td><button class="btn btn-sm" onclick="abrirCiclo('${c.id}')">Abrir ciclo →</button></td>
      </tr>`;
    }).join('')}
  </tbody></table>`;
}
function abrirCiclo(id){ state.cicloAtivo = id; state.route='ciclos'; render(); }
function abrirNovoCiclo(){
  const colabId = document.getElementById('cy_colab').value;
  const prazo = document.getElementById('cy_prazo').value;
  const p = state.colaboradores.find(x=>x.id===colabId);
  const cargo = state.cargos.find(c=>c.id===p.cargoId);
  const ciclo = {
    id: uid(), colaboradorId: p.id, cargoId: p.cargoId, estado:'Aberto',
    etapa: 'colaborador', // colaborador -> lider -> rh -> (consolidado via consolidarCiclo)
    dataAbertura: new Date().toISOString().slice(0,10),
    prazoLimite: prazo || null,
    ausencias: [],
    notas:{colaborador:{}, gestor:{}, rh:{}},
    // Extensão do princípio de versionamento (RN024): retrato congelado dos indicadores válidos no momento da abertura.
    // Mudanças futuras na Cultura Organizacional ou no Desenho de Cargo não
    // afetam este ciclo — só valem a partir do próximo ciclo aberto depois da alteração.
    indicadoresSnapshot: todosIndicadores(cargo),
    diagnostico:null, pdiDesenvolvimento:null, pdiMentalidade:null, ...novoCarimbo()
  };
  state.ciclos.push(ciclo);
  state.cicloAtivo = ciclo.id;
  emitirEvento('ciclo.aberto', { cicloId: ciclo.id, colaboradorId: p.id });
  showToast('Ciclo aberto. O colaborador já pode iniciar a autoavaliação.');
  render();
}

function todosIndicadores(cargo, ciclo){
  // Extensão do princípio de versionamento (RN024): se o ciclo já tem um "retrato" congelado dos indicadores (tirado
  // no momento em que foi aberto), usamos ele — assim, mudanças posteriores
  // na Cultura Organizacional (Valores, indicadores T/E) não alteram
  // retroativamente avaliações já em andamento ou encerradas.
  if(ciclo && ciclo.indicadoresSnapshot) return ciclo.indicadoresSnapshot;
  return [
    ...cargo.indicadoresN.map(i=>({...i, pilar:'N'})),
    ...cargo.indicadoresO.map(i=>({...i, pilar:'O'})),
    ...cargo.indicadoresR.map(i=>({...i, pilar:'R'})),
    ...state.cultura.indicadoresT.map(i=>({...i, pilar:'T'})),
    ...state.cultura.indicadoresE.map(i=>({...i, pilar:'E'})),
  ];
}

const ETAPA_INFO = {
  colaborador: { chaveNotas:'colaborador', titulo:'Etapa 1 de 3 — Autoavaliação do Colaborador', peso:'25%', proxima:'lider', botao:'Enviar para o Líder Direto', msg:'Autoavaliação enviada para o Líder Direto.' },
  lider:       { chaveNotas:'gestor',      titulo:'Etapa 2 de 3 — Avaliação do Líder Direto',     peso:'50%', proxima:'rh',    botao:'Enviar para o RH',            msg:'Avaliação enviada para o RH.' },
  rh:          { chaveNotas:'rh',          titulo:'Etapa 3 de 3 — Avaliação do RH e Veredito Final', peso:'25%', proxima:null,    botao:'Consolidar avaliação e gerar Diagnóstico', msg:null },
};

function renderNotaTransicaoGestor(ciclo){
  if(!ciclo.gestorAnteriorTransicao) return '';
  const souGestorAnterior = meuPapelReal==='lider' && ciclo.gestorAnteriorTransicao===meuPerfilId;
  if(!souGestorAnterior && !ciclo.notaTransicaoGestorAnterior) return '';
  return `
    <div class="card" style="border-left:3px solid var(--gold);">
      <h3>Nota de transição do gestor anterior <small>Não vinculante — não entra no cálculo da avaliação</small></h3>
      ${ciclo.notaTransicaoGestorAnterior ? `
        <p class="small-muted">${ciclo.notaTransicaoGestorAnterior}</p>
      ` : (souGestorAnterior ? `
        <p class="page-desc">O colaborador mudou de gestor durante este ciclo. O peso de 50% da etapa de Líder vai para quem está no cargo no fechamento — mas você pode deixar uma observação de contexto, sem peso no cálculo.</p>
        <div class="field"><label>Observação de transição (opcional)</label><textarea id="nota_transicao_${ciclo.id}" placeholder="Contexto que o novo gestor deveria saber"></textarea></div>
        <button class="btn btn-sm" onclick="registrarNotaTransicao('${ciclo.id}')">Registrar observação</button>
      ` : '')}
    </div>`;
}
function registrarNotaTransicao(cicloId){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  ciclo.notaTransicaoGestorAnterior = document.getElementById(`nota_transicao_${cicloId}`).value.trim();
  atualizarCarimbo(ciclo);
  showToast('Observação de transição registrada (não vinculante).');
  render();
}

function pageAvaliacao(ciclo){
  const p = state.colaboradores.find(x=>x.id===ciclo.colaboradorId);
  const cargo = state.cargos.find(c=>c.id===ciclo.cargoId);
  const indicadores = todosIndicadores(cargo, ciclo);
  const notaTransicaoHTML = renderNotaTransicaoGestor(ciclo);

  if(ciclo.estado==='Pendência de Avaliador'){
    return notaTransicaoHTML + renderPendenciaAvaliador(ciclo, p, cargo);
  }
  if(ciclo.estado==='Aberto' || ciclo.estado==='Em Consolidação'){
    return notaTransicaoHTML + renderEtapaSequencial(ciclo, p, cargo, indicadores);
  }
  return notaTransicaoHTML + `
    <div class="page-head">
      <div class="eyebrow">Ciclo de Avaliação · ${ciclo.estado}</div>
      <h1>${p.nome} <span style="color:var(--ink-faint);font-weight:400;font-size:18px;">— ${cargo.nome}</span></h1>
      <button class="btn btn-ghost btn-sm" onclick="state.cicloAtivo=null; render();">← Voltar para lista de ciclos</button>
    </div>
    ${renderFlowCiclo(ciclo)}
    ${renderResultadoCiclo(ciclo, cargo, indicadores)}
    ${meuPapelReal==='owner' && ['Diagnóstico Gerado','PDI Gerado','Em Acompanhamento'].includes(ciclo.estado) ? renderPainelReabertura(ciclo) : ''}
    ${ciclo.revisoes && ciclo.revisoes.length ? renderHistoricoRevisoes(ciclo) : ''}
  `;
}

const ETAPA_NOME_PENDENTE = { colaborador:'o Colaborador', lider:'o Líder Direto', rh:'o RH' };
function renderPendenciaAvaliador(ciclo, p, cargo){
  const souAdminOuRh = meuPapelReal === 'owner' || meuPapelReal === 'rh';
  return `
    <div class="page-head">
      <div class="eyebrow">Ciclo de Avaliação · Pendência de Avaliador</div>
      <h1>${p.nome} <span style="color:var(--ink-faint);font-weight:400;font-size:18px;">— ${cargo.nome}</span></h1>
      <button class="btn btn-ghost btn-sm" onclick="state.cicloAtivo=null; render();">← Voltar para lista de ciclos</button>
    </div>
    ${renderFlowCiclo(ciclo)}
    <div class="notice" style="border-left-color:var(--iniciar);">
      O prazo desta avaliação venceu (${ciclo.prazoLimite}) e ${ETAPA_NOME_PENDENTE[ciclo.etapa]} ainda não concluiu sua etapa.
      O ciclo não avança para o Diagnóstico automaticamente até essa pendência ser resolvida.
    </div>
    ${souAdminOuRh ? `
      <div class="card">
        <h3>Estender o prazo</h3>
        <div class="field"><label>Novo prazo final</label><input id="novo_prazo_ciclo" type="date"></div>
        <button class="btn btn-primary" onclick="estenderPrazoCiclo('${ciclo.id}')">Estender prazo e retomar o ciclo</button>
      </div>
      <div class="card">
        <h3>Ou registrar ausência formal</h3>
        <p class="page-desc">Isso documenta que ${ETAPA_NOME_PENDENTE[ciclo.etapa]} não respondeu dentro do prazo e permite o ciclo avançar sem essa nota — o cálculo da média ponderada (RN003) se ajusta automaticamente entre quem avaliou de fato.</p>
        <div class="field"><label>Motivo da ausência</label><textarea id="motivo_ausencia_ciclo" placeholder="Ex: colaborador afastado por licença médica durante toda a janela do ciclo."></textarea></div>
        <button class="btn" onclick="registrarAusenciaCiclo('${ciclo.id}')">Registrar ausência e avançar o ciclo</button>
      </div>
      ${ciclo.ausencias && ciclo.ausencias.length ? `
        <div class="card">
          <h3>Ausências já registradas neste ciclo</h3>
          ${ciclo.ausencias.map(a=>`<div class="small-muted" style="padding:6px 0;border-bottom:1px dashed var(--line);">${a.data} — etapa "${a.etapa}": ${a.motivo}</div>`).join('')}
        </div>
      ` : ''}
    ` : `<div class="empty">Aguardando o RH decidir entre estender o prazo ou registrar a ausência formalmente.</div>`}
  `;
}

function renderPainelReabertura(ciclo){
  const dias = ciclo.dataConsolidacao ? Math.round((new Date() - new Date(ciclo.dataConsolidacao)) / (1000*60*60*24)) : null;
  const prazoExpirado = dias !== null && dias > 30;
  return `
    <div class="card">
      <h3>Reabertura formal <small>Só o Administrador — até 30 dias após a consolidação, com justificativa obrigatória (regra interna, sem RN correspondente no PRD)</small></h3>
      ${dias !== null ? `<p class="small-muted">Consolidado há ${dias} dia(s).</p>` : ''}
      ${prazoExpirado ? `<div class="notice" style="border-left-color:var(--iniciar);">Prazo de reabertura expirado (mais de 30 dias desde a consolidação).</div>` : `
        <div class="field"><label>Justificativa da reabertura</label><textarea id="justificativa_reabertura" placeholder="Ex: RH identificou nota lançada incorretamente e precisa corrigir antes do fechamento definitivo."></textarea></div>
        <button class="btn" onclick="reabrirCiclo('${ciclo.id}')">Reabrir ciclo para o RH</button>
      `}
    </div>
  `;
}
function renderHistoricoRevisoes(ciclo){
  return `
    <div class="card">
      <h3>Histórico de revisões <small>A versão original é sempre preservada, mesmo após reabertura (RN024)</small></h3>
      ${ciclo.revisoes.map(r=>`
        <div style="padding:10px 0;border-bottom:1px dashed var(--line);">
          <b>Revisão ${r.numero}</b> — reaberto em ${r.reabertoEm}
          <div class="small-muted">Motivo: ${r.justificativa}</div>
          <div class="small-muted">Classificação geral na versão anterior: <span class="pill ${pillClass(r.diagnosticoOriginal.geral)}">${pillLabel(r.diagnosticoOriginal.geral)}</span></div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderFlowCiclo(ciclo){
  return `
    <div class="flow">
      ${['Aberto','Em Consolidação','Diagnóstico Gerado','PDI Gerado','Em Acompanhamento'].map(s=>{
        const order = ['Aberto','Em Consolidação','Diagnóstico Gerado','PDI Gerado','Em Acompanhamento','Encerrado'];
        const curIdx = order.indexOf(ciclo.estado);
        const sIdx = order.indexOf(s);
        const cls = sIdx<curIdx?'done':sIdx===curIdx?'now':'';
        return `<span class="flow-item ${cls}">${s}</span>`;
      }).join('<span class="flow-arrow">→</span>')}
    </div>`;
}

function renderResumoEtapaAnterior(etapaId, ciclo, indicadores){
  const info = ETAPA_INFO[etapaId];
  const notas = ciclo.notas[info.chaveNotas];
  const label = etapaId==='colaborador' ? 'Autoavaliação do Colaborador' : 'Avaliação do Líder Direto';
  return `
    <div class="card">
      <h3>${label} <small>Já enviada — somente leitura</small></h3>
      <div class="chip-row">
        ${indicadores.map(ind => `
          <div class="chip">
            <span class="tag tag-${ind.pilar.toLowerCase()}">${ind.pilar}</span> ${ind.nome}:
            <b style="margin-left:4px;">${IDA_LABEL[notas[ind.id]] || '—'}</b>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function renderEtapaSequencial(ciclo, p, cargo, indicadores){
  const etapa = ciclo.etapa || 'colaborador';
  const info = ETAPA_INFO[etapa];
  const notasAtual = ciclo.notas[info.chaveNotas];
  const totalPreenchido = Object.keys(notasAtual).length;
  const completo = totalPreenchido === indicadores.length;
  const editavel = podeEditarEtapa(ciclo);
  const dias = diasAteVencimento(ciclo);
  let lembretePrazo = '';
  if(dias !== null && state.configuracoes?.notificacoes?.lembretesPrazo !== false){
    if(dias <= 0) lembretePrazo = `<div class="notice" style="border-left-color:var(--iniciar);">O prazo desta avaliação vence hoje.</div>`;
    else if(dias <= 2) lembretePrazo = `<div class="notice" style="border-left-color:var(--iniciar);">Lembrete D-${dias}: faltam ${dias} dia(s) para o prazo desta avaliação.</div>`;
    else if(dias <= 5) lembretePrazo = `<div class="notice">Lembrete D-${dias}: faltam ${dias} dias para o prazo desta avaliação.</div>`;
  }

  let resumosAnteriores = '';
  if(etapa==='lider') resumosAnteriores = renderResumoEtapaAnterior('colaborador', ciclo, indicadores);
  if(etapa==='rh') resumosAnteriores = renderResumoEtapaAnterior('colaborador', ciclo, indicadores) + renderResumoEtapaAnterior('lider', ciclo, indicadores);

  return `
    <div class="page-head">
      <div class="eyebrow">Ciclo de Avaliação · ${ciclo.estado}</div>
      <h1>${p.nome} <span style="color:var(--ink-faint);font-weight:400;font-size:18px;">— ${cargo.nome}</span></h1>
      ${lembretePrazo}
      <button class="btn btn-ghost btn-sm" onclick="state.cicloAtivo=null; render();">← Voltar para lista de ciclos</button>
    </div>
    ${renderFlowCiclo(ciclo)}

    <div class="notice info">${info.titulo} <small style="display:block;margin-top:2px;">Peso desta etapa no cálculo final: ${info.peso}</small></div>

    ${!editavel ? `<div class="notice">Esta etapa ainda não é sua — você pode acompanhar, mas só quem está com a etapa atual consegue preencher.</div>` : ''}

    ${resumosAnteriores}

    <div class="card">
      <h3>Lançamento de notas — Escala IDA <small>Iniciar · Desenvolver · Alavancar, por indicador</small></h3>
      ${['N','O','R','T','E'].map(pilar=>{
        const doGrupo = indicadores.filter(ind=>ind.pilar===pilar);
        if(!doGrupo.length) return '';
        return `
        <div class="pilar-grupo">
          <div class="pilar-grupo-titulo">
            <span class="tag tag-${pilar.toLowerCase()}">${pilar}</span> ${PILAR_LABEL[pilar]} <small>${PILAR_TAGLINE[pilar]}</small>
          </div>
          ${doGrupo.map(ind=>`
            <div class="ida-row">
              <div class="ida-info">
                <b>${ind.nome}</b>
              </div>
              <div class="ida-choices">
                ${['I','D','A'].map(v=>`
                  <button class="ida-choice sel-${v.toLowerCase()} ${notasAtual[ind.id]===v?'active':''}" ${editavel?'':'disabled style="opacity:.5;cursor:not-allowed;"'}
                    onclick="${editavel ? `lancarNota('${ciclo.id}','${ind.id}','${v}')` : ''}">${v}</button>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>`;
      }).join('')}
      <hr class="sep">
      <div class="small-muted">${totalPreenchido}/${indicadores.length} indicadores preenchidos.</div>
      ${completo && editavel ? `<button class="btn btn-primary" style="margin-top:14px;" onclick="avancarEtapa('${ciclo.id}')">${info.botao}</button>` : ''}
    </div>
  `;
}

function avancarEtapa(cicloId){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  const info = ETAPA_INFO[ciclo.etapa || 'colaborador'];
  if(info.proxima){
    ciclo.etapa = info.proxima;
    ciclo.estado = 'Em Consolidação';
    showToast(info.msg);
    render();
  } else {
    // etapa RH concluída — consolida de vez (calcula diagnóstico e gera os PDIs)
    consolidarCiclo(cicloId);
  }
}
function lancarNota(cicloId, indicadorId, valor){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  const etapa = ciclo.etapa || 'colaborador';
  const chave = ETAPA_INFO[etapa].chaveNotas;
  ciclo.notas[chave][indicadorId] = valor;
  render();
}
function consolidarCiclo(cicloId){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  const cargo = state.cargos.find(c=>c.id===ciclo.cargoId);
  const indicadores = todosIndicadores(cargo, ciclo);

  const porIndicador = {};
  const porPilar = {N:[],O:[],R:[],T:[],E:[]};
  indicadores.forEach(ind=>{
    const vc = IDA_VAL[ciclo.notas.colaborador[ind.id]];
    const vg = IDA_VAL[ciclo.notas.gestor[ind.id]];
    const vr = IDA_VAL[ciclo.notas.rh[ind.id]];
    // RN003: média ponderada 25/50/25. Se algum avaliador ficou sem nota
    // (ausência formal registrada), o peso dele é redistribuído
    // proporcionalmente entre quem de fato avaliou, em vez de quebrar o cálculo.
    const pesos = [
      { valor: vc, peso: 0.25 },
      { valor: vg, peso: 0.50 },
      { valor: vr, peso: 0.25 },
    ].filter(p => p.valor !== undefined);
    const pesoTotal = pesos.reduce((a,p)=>a+p.peso, 0);
    const media = pesoTotal>0 ? pesos.reduce((a,p)=>a+(p.valor*p.peso),0) / pesoTotal : null;
    const sigla = media!==null ? classificar(media) : null;
    porIndicador[ind.id] = {nome:ind.nome, pilar:ind.pilar, competencia:ind.competencia, media, sigla};
    if(media!==null) porPilar[ind.pilar].push(media);
  });
  const pilarMedia = {};
  Object.keys(porPilar).forEach(p=>{
    const arr = porPilar[p];
    pilarMedia[p] = arr.length? arr.reduce((a,b)=>a+b,0)/arr.length : null;
  });
  const mediasValidas = Object.values(pilarMedia).filter(v=>v!==null);
  // BUG CORRIGIDO: se por algum motivo nenhum pilar tiver média válida
  // (ex.: cargo sem nenhum indicador respondido), a divisão por
  // mediasValidas.length (0) resultava em NaN — e classificar(NaN) caía
  // silenciosamente em "Alavancar" (a MELHOR classificação possível),
  // por acaso da comparação `NaN <= x` sempre ser falsa. Agora fica null
  // explicitamente, e a classificação também fica null (nunca inventa
  // uma nota boa por falta de dado).
  const geralMedia = mediasValidas.length ? mediasValidas.reduce((a,b)=>a+b,0)/mediasValidas.length : null;

  const diagnostico = {
    porIndicador, pilarMedia,
    pilarSigla: Object.fromEntries(Object.entries(pilarMedia).map(([p,m])=>[p, m!==null?classificar(m):null])),
    // Dimensões (Telas 02/06 do Documento 06): RN008 — N, O, R alimentam Resultado;
    // RN009 — T alimenta exclusivamente Comportamento; RN010 — E alimenta exclusivamente Potencial.
    dimensaoMedia: (()=>{
      const nor = ['N','O','R'].map(p=>pilarMedia[p]).filter(v=>v!==null);
      return {
        Resultado: nor.length ? nor.reduce((a,b)=>a+b,0)/nor.length : null,
        Comportamento: pilarMedia.T,
        Potencial: pilarMedia.E,
      };
    })(),
    geral: geralMedia!==null ? classificar(geralMedia) : null,
    geralMedia,
    pontosFortes: Object.values(porIndicador).filter(i=>i.sigla==='A').map(i=>i.nome),
    oportunidades: Object.values(porIndicador).filter(i=>i.sigla && i.sigla!=='A').map(i=>i.nome),
    // 4.9 — competências críticas: indicadores em Iniciar nos pilares de maior
    // peso estratégico (Comportamento/T e Resultado/R — a metodologia trata
    // esses dois como não-negociáveis, diferente de N/O que são mais técnicos).
    competenciasCriticas: Object.values(porIndicador).filter(i=>i.sigla==='I' && (i.pilar==='T' || i.pilar==='R')).map(i=>i.nome),
    // Potencial de desenvolvimento — leitura específica do pilar E, que é o
    // que alimenta o PDI de Mentalidade.
    potencialDesenvolvimento: pilarMedia.E!==null ? { sigla: classificar(pilarMedia.E), media: pilarMedia.E } : null,
  };
  diagnostico.dimensaoSigla = Object.fromEntries(
    Object.entries(diagnostico.dimensaoMedia).map(([d,m])=>[d, m!==null?classificar(m):null])
  );
  diagnostico.resumoExecutivo = gerarResumoExecutivo(diagnostico);
  ciclo.diagnostico = diagnostico;
  ciclo.estado = 'Diagnóstico Gerado';
  ciclo.dataConsolidacao = new Date().toISOString().slice(0,10);

  // PDI Desenvolvimento — RN019 (só indicadores Iniciar/Desenvolver) e RN023 (evidência específica por ação): ação do Banco de Ações compatível com
  // o pilar do indicador, com evidência específica (nunca genérica).
  // Prioriza casamento por Competência em comum (Dicionário de Dados, Cap. 4)
  // antes de cair no casamento genérico por pilar.
  const elegiveis = Object.values(porIndicador).filter(i=>i.sigla!=='A');
  const pdiDesenvolvimento = elegiveis.map(item=>{
    const porCompetencia = item.competencia
      ? state.bancoAcoes.filter(a=>a.pilares.includes(item.pilar) && a.competencias?.includes(item.competencia))
      : [];
    const acoesCompat = porCompetencia.length ? porCompetencia : state.bancoAcoes.filter(a=>a.pilares.includes(item.pilar));
    const acao = acoesCompat[Math.floor(Math.random()*acoesCompat.length)] || state.bancoAcoes[0];
    return {
      indicador: item.nome, pilar: item.pilar, competencia: item.competencia, classificacao: item.sigla,
      acaoSugerida: acao.titulo, categoriaAcao: acao.categoria,
      evidenciaSugerida: gerarEvidenciaEspecifica(acao, item),
      prazo: acao.prazoSugerido, responsavel: 'Colaborador', status:'não iniciado'
    };
  });
  ciclo.pdiDesenvolvimento = pdiDesenvolvimento;
  ciclo.pdiAprovado = false;

  // PDI Mentalidade — RN020, sempre gerado, independente da nota.
  // Regra interna (sem RN correspondente no PRD): se este colaborador é a mesma PESSOA em outro cargo (mesma conta
  // de login vinculada), reaproveita o PDI de Mentalidade mais recente dela,
  // porque a mentalidade é única por pessoa, não por cargo.
  const colaboradorAtual = state.colaboradores.find(c=>c.id===ciclo.colaboradorId);
  let pdiMentalidadeCompartilhado = null;
  if(colaboradorAtual?.perfilId){
    const outrosCargos = state.colaboradores.filter(c=>c.perfilId===colaboradorAtual.perfilId && c.id!==colaboradorAtual.id);
    const cicloMentalidadeExistente = state.ciclos
      .filter(c=>outrosCargos.some(o=>o.id===c.colaboradorId) && c.pdiMentalidade)
      .sort((a,b)=>b.dataAbertura.localeCompare(a.dataAbertura))[0];
    if(cicloMentalidadeExistente) pdiMentalidadeCompartilhado = cicloMentalidadeExistente;
  }

  ciclo.pdiMentalidade = pdiMentalidadeCompartilhado
    ? JSON.parse(JSON.stringify(pdiMentalidadeCompartilhado.pdiMentalidade))
    : {
        Conhecimento: {ondeEstou:'', ondeQueroChegar:'', oQueVouFazer:'', prazo:'', responsavel:'Colaborador'},
        Ambiente: {ondeEstou:'', ondeQueroChegar:'', oQueVouFazer:'', prazo:'', responsavel:'Colaborador'},
        Relacoes: {ondeEstou:'', ondeQueroChegar:'', oQueVouFazer:'', prazo:'', responsavel:'Colaborador'},
      };
  ciclo.pdiMentalidadeCompartilhadoDe = pdiMentalidadeCompartilhado ? pdiMentalidadeCompartilhado.id : null;
  ciclo.estado = 'PDI Gerado';
  atualizarCarimbo(ciclo);

  emitirEvento('diagnostico.gerado', { cicloId: ciclo.id, classificacaoGeral: ciclo.diagnostico.geral });
  emitirEvento('pdi.criado', { cicloId: ciclo.id, acoesDesenvolvimento: ciclo.pdiDesenvolvimento.length });
  showToast('Diagnóstico e PDIs (Desenvolvimento + Mentalidade) gerados automaticamente.');
  render();
}

/* ---------- 4.9 — Resumo executivo (motor de templates, sem IA) ----------
   Sugestão técnica do PRD: no MVP, o resumo é gerado por templates
   determinísticos — evolui para IA generativa só na V3.0, quando houver
   volume histórico suficiente para treinar algo consistente com o
   vocabulário da metodologia. Linguagem sempre voltada a "onde chegar",
   nunca a "onde está atrasado". */
function gerarResumoExecutivo(d){
  const frases = [];
  const nivelTexto = { A:'em nível Alavancar', D:'em desenvolvimento', I:'no início da jornada neste ciclo' };

  frases.push(`O resultado geral deste ciclo está ${nivelTexto[d.geral]}.`);

  if(d.pontosFortes.length){
    frases.push(`Os principais pontos fortes identificados são: ${d.pontosFortes.slice(0,3).join(', ')}${d.pontosFortes.length>3?' entre outros':''}.`);
  }

  if(d.competenciasCriticas.length){
    frases.push(`Vale atenção prioritária a: ${d.competenciasCriticas.join(', ')} — indicadores de Comportamento ou Resultado com maior espaço para evolução.`);
  } else if(d.oportunidades.length){
    frases.push(`Há oportunidades de evolução em: ${d.oportunidades.slice(0,3).join(', ')}.`);
  } else {
    frases.push('Não há oportunidades de desenvolvimento pendentes nos pilares avaliados neste ciclo.');
  }

  if(d.potencialDesenvolvimento){
    const textoPotencial = { A:'um potencial de evolução já bem desenvolvido — bom momento para desafios maiores', D:'um potencial de evolução em construção', I:'um potencial de evolução ainda a ser destravado' };
    frases.push(`Em relação a onde este colaborador pode chegar, o pilar de Evolução aponta para ${textoPotencial[d.potencialDesenvolvimento.sigla]}.`);
  }

  frases.push('O PDI de Desenvolvimento e o PDI de Mentalidade abaixo traduzem esta leitura em ações concretas para o próximo passo.');

  return frases.join(' ');
}

/* ---------- 4.10 — Evidência específica por ação (RN023) ----------
   Nunca uma frase genérica: combina a ação do Banco de Ações com o
   indicador de origem, e adapta o tipo de evidência esperada à categoria
   da ação (uma certificação não se comprova do mesmo jeito que uma mentoria). */
function gerarEvidenciaEspecifica(acao, indicadorItem){
  const porCategoria = {
    'Conteúdo': `Certificado ou comprovante de conclusão de "${acao.titulo}"`,
    'Formação': `Certificado de participação em "${acao.titulo}", com carga horária`,
    'Prática': `Relato ou registro (foto/documento) da aplicação prática de "${acao.titulo}" no dia a dia`,
    'Experiência': `Relato do gestor confirmando a participação em "${acao.titulo}" e o resultado observado`,
    'Desenvolvimento': `Registro das conversas/check-ins de "${acao.titulo}" e percepção de evolução do próprio colaborador`,
    'Inovação': `Documento da proposta/entrega gerada em "${acao.titulo}", com aprovação da liderança`,
  };
  const base = porCategoria[acao.categoria] || `Evidência de conclusão de "${acao.titulo}"`;
  return `${base}, relacionada ao indicador "${indicadorItem.nome}".`;
}

function diagnosticoSummaryHTML(ciclo){
  const d = ciclo.diagnostico;
  const DIMENSAO_LABEL = { Resultado:'Resultado', Comportamento:'Comportamento', Potencial:'Potencial' };
  return `
    <div style="margin:14px 0;">
      <span class="pill ${pillClass(d.geral)}" style="font-size:13px;padding:6px 14px;">Classificação geral: ${pillLabel(d.geral)}</span>
    </div>
    <div class="grid3">
      ${Object.entries(d.dimensaoSigla||{}).map(([dim,sig])=>sig?`
        <div class="card" style="margin-bottom:0;padding:14px;">
          <div style="font-family:var(--serif-display);font-size:14px;">${DIMENSAO_LABEL[dim]}</div>
          <span class="pill ${pillClass(sig)}" style="margin-top:8px;">${pillLabel(sig)}</span>
        </div>
      `:'').join('')}
    </div>
    <div class="small-muted" style="margin:12px 0 4px;">Detalhamento por Pilar</div>
    <div class="grid3">
      ${Object.entries(d.pilarSigla).map(([p,sig])=>sig?`
        <div class="card" style="margin-bottom:0;padding:14px;">
          <div class="tag tag-${p.toLowerCase()}">${p}</div>
          <div style="font-family:var(--serif-display);font-size:14px;margin-top:6px;">${PILAR_LABEL[p]}</div>
          <span class="pill ${pillClass(sig)}" style="margin-top:8px;">${pillLabel(sig)}</span>
        </div>
      `:'').join('')}
    </div>
  `;
}

function renderCardReuniaoFeedback(ciclo){
  const rf = ciclo.reuniaoFeedback || { realizada:false, data:'', notas:'' };
  return `
    <div class="card" style="${rf.realizada?'':'border-left:3px solid var(--gold);'}">
      <h3>Reunião de feedback <small>Etapa da jornada entre a Avaliação e a construção do PDI (Cap. 9.3/9.4)</small></h3>
      ${rf.realizada ? `
        <p class="page-desc">Realizada em <b>${rf.data}</b>.</p>
        ${rf.notas ? `<p class="small-muted">${rf.notas}</p>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="editarReuniaoFeedback('${ciclo.id}')">Editar registro</button>
      ` : `
        <div class="grid2">
          <div class="field"><label>Data da reunião</label><input id="rf_data_${ciclo.id}" type="date" value="${rf.data||new Date().toISOString().slice(0,10)}"></div>
          <div class="field"><label>Anotações da conversa <small>(opcional)</small></label><input id="rf_notas_${ciclo.id}" value="${rf.notas||''}" placeholder="Pontos combinados na conversa"></div>
        </div>
        <button class="btn btn-primary" onclick="registrarReuniaoFeedback('${ciclo.id}')">Registrar reunião realizada</button>
      `}
    </div>`;
}
function registrarReuniaoFeedback(cicloId){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  ciclo.reuniaoFeedback = {
    realizada: true,
    data: document.getElementById(`rf_data_${cicloId}`).value,
    notas: document.getElementById(`rf_notas_${cicloId}`).value,
  };
  atualizarCarimbo(ciclo);
  registrarAuditoria('ciclo.reuniao_feedback_registrada', { cicloId });
  showToast('Reunião de feedback registrada.');
  render();
}
function editarReuniaoFeedback(cicloId){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  ciclo.reuniaoFeedback.realizada = false;
  render();
}

function podeConstruirPDI(ciclo){
  if(ciclo.pdiAprovado) return false;
  if(meuPapelReal === 'owner') return true;
  const colaborador = state.colaboradores.find(c=>c.id===ciclo.colaboradorId);
  if(meuPapelReal === 'lider') return colaborador?.gestorPerfilId === meuPerfilId;
  if(meuPapelReal === 'colaborador') return colaborador?.perfilId === meuPerfilId;
  return false;
}
function podeAprovarPDI(ciclo){
  if(ciclo.pdiAprovado) return false;
  if(meuPapelReal === 'owner') return true;
  const colaborador = state.colaboradores.find(c=>c.id===ciclo.colaboradorId);
  return meuPapelReal === 'lider' && colaborador?.gestorPerfilId === meuPerfilId;
}

function renderResultadoCiclo(ciclo, cargo, indicadores){
  const d = ciclo.diagnostico;
  if(!d) return '<div class="empty">Consolidação em andamento.</div>';
  const editavelPDI = podeConstruirPDI(ciclo);
  const podeAprovar = podeAprovarPDI(ciclo);
  const elegiveisPDI = Object.entries(d.porIndicador).filter(([,i])=>i.sigla && i.sigla!=='A');

  return `
    ${renderCardReuniaoFeedback(ciclo)}
    <div class="card">
      <h3>Diagnóstico automático <small>Não editável manualmente — resultado sempre calculado (regra do Diagnóstico)</small></h3>
      ${diagnosticoSummaryHTML(ciclo)}
      <p style="margin-top:14px;line-height:1.6;">${d.resumoExecutivo||''}</p>
      <hr class="sep">
      <div class="grid2">
        <div>
          <b style="font-size:13px;">Pontos fortes</b>
          <div class="chip-row">${d.pontosFortes.length?d.pontosFortes.map(n=>`<div class="chip" style="color:var(--alavancar);border-color:var(--alavancar);">${n}</div>`).join(''):'<span class="small-muted">Nenhum indicador em Alavancar ainda.</span>'}</div>
        </div>
        <div>
          <b style="font-size:13px;">Oportunidades de melhoria</b>
          <div class="chip-row">${d.oportunidades.length?d.oportunidades.map(n=>`<div class="chip" style="color:var(--desenvolver);border-color:var(--desenvolver);">${n}</div>`).join(''):'<span class="small-muted">Nenhuma oportunidade identificada.</span>'}</div>
        </div>
      </div>
      ${(d.competenciasCriticas||[]).length ? `
      <div style="margin-top:14px;">
        <b style="font-size:13px;">Prioridades de atenção <small style="font-weight:400;">(Comportamento/Resultado em Iniciar — maior peso estratégico)</small></b>
        <div class="chip-row">${d.competenciasCriticas.map(n=>`<div class="chip" style="color:var(--iniciar);border-color:var(--iniciar);">${n}</div>`).join('')}</div>
      </div>` : ''}
      ${d.potencialDesenvolvimento ? `
      <div style="margin-top:14px;">
        <b style="font-size:13px;">Potencial de desenvolvimento (pilar E)</b>
        <div><span class="pill ${pillClass(d.potencialDesenvolvimento.sigla)}" style="margin-top:6px;">${pillLabel(d.potencialDesenvolvimento.sigla)}</span></div>
      </div>` : ''}
    </div>

    <div class="card">
      <h3>PDI de Desenvolvimento <small>${ciclo.pdiAprovado ? 'Aprovado — construção encerrada' : 'Em construção — Gestor e Colaborador ajustam juntos antes da aprovação'}</small></h3>
      ${ciclo.pdiDesenvolvimento.length? ciclo.pdiDesenvolvimento.map((item,idx)=>`
        <div class="action-card">
          <div class="top">
            <div>
              <b>${item.indicador}</b>
              <div class="meta"><span class="tag tag-${item.pilar.toLowerCase()}">${item.pilar}</span> ${item.categoriaAcao||'Personalizada'}${item.competencia?` <span class="small-muted">· ${item.competencia}</span>`:''}</div>
            </div>
            <span class="pill ${pillClass(item.classificacao)}">${pillLabel(item.classificacao)}</span>
          </div>
          ${editavelPDI ? `
            <div class="field"><label>Trocar por outra ação do Banco de Ações <small>(filtrado por pilar ${item.pilar})</small></label>
              <select onchange="escolherAcaoDoBanco('${ciclo.id}',${idx},this.value)">
                <option value="">— manter ação atual / personalizada —</option>
                ${state.bancoAcoes.filter(a=>a.pilares.includes(item.pilar)).map(a=>`<option value="${a.id}">${a.titulo} (${a.categoria})</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Ação</label><input value="${item.acaoSugerida}" onchange="editarItemPDI('${ciclo.id}',${idx},'acaoSugerida',this.value)"></div>
            <div class="field"><label>Evidência esperada</label><input value="${item.evidenciaSugerida}" onchange="editarItemPDI('${ciclo.id}',${idx},'evidenciaSugerida',this.value)"></div>
            <div class="grid2">
              <div class="field"><label>Prazo</label><input value="${item.prazo}" onchange="editarItemPDI('${ciclo.id}',${idx},'prazo',this.value)"></div>
              <div class="field"><label>Responsável</label>
                <select onchange="editarItemPDI('${ciclo.id}',${idx},'responsavel',this.value)">
                  ${['Colaborador','Gestor','Colaborador e Gestor'].map(r=>`<option ${item.responsavel===r?'selected':''}>${r}</option>`).join('')}
                </select>
              </div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="removerItemPDI('${ciclo.id}',${idx})">Remover esta ação</button>
          ` : `
            <p style="font-size:13px;margin:10px 0 6px;">Ação: <b>${item.acaoSugerida}</b> <span class="small-muted">— responsável: ${item.responsavel||'Colaborador'}</span></p>
            <p class="small-muted" style="margin:0 0 8px;">${item.evidenciaSugerida} · prazo: ${item.prazo}</p>
          `}
          <div class="pdi-acompanhamento">
            ${renderAcompanhamentoItemPDI(ciclo, item, idx)}
          </div>
        </div>
      `).join('') : '<div class="notice">Todos os indicadores estão em Alavancar — nenhuma ação de Desenvolvimento foi necessária neste ciclo.</div>'}

      ${editavelPDI ? `
        <div class="card" style="background:var(--surface-2);margin-top:14px;">
          <h3 style="font-size:14px;">Adicionar ação personalizada ao PDI <small>Sempre vinculada a um indicador de origem (RN019) — nunca solta</small></h3>
          ${elegiveisPDI.length ? `
            <div class="field"><label>Indicador de origem</label>
              <select id="novo_pdi_indicador_${ciclo.id}">
                ${elegiveisPDI.map(([nome,i])=>`<option value="${nome}" data-pilar="${i.pilar}" data-classificacao="${i.sigla}">${i.nome} (${i.pilar})</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Ação combinada</label><input id="novo_pdi_acao_${ciclo.id}" placeholder="Ex: Acompanhamento semanal com o gestor sobre X"></div>
            <div class="field"><label>Evidência esperada</label><input id="novo_pdi_evidencia_${ciclo.id}" placeholder="Como isso será comprovado"></div>
            <div class="grid2">
              <div class="field"><label>Prazo</label><input id="novo_pdi_prazo_${ciclo.id}" placeholder="Ex: 30 dias"></div>
              <div class="field"><label>Responsável</label>
                <select id="novo_pdi_responsavel_${ciclo.id}">
                  ${['Colaborador','Gestor','Colaborador e Gestor'].map(r=>`<option>${r}</option>`).join('')}
                </select>
              </div>
            </div>
            <button class="btn" onclick="adicionarItemPDI('${ciclo.id}')">Adicionar ao PDI</button>
          ` : '<div class="small-muted">Nenhum indicador elegível (fora de Alavancar) para vincular uma ação nova.</div>'}
        </div>
      ` : ''}
    </div>

    <div class="card">
      <h3>PDI de Mentalidade <small>Obrigatório para todo colaborador, todo ciclo, independentemente da nota (RN020)</small></h3>
      <p class="small-muted" style="font-style:italic;margin:-4px 0 12px;">"Nível se constrói. Este PDI vale mesmo quando você está indo bem."</p>
      ${ciclo.pdiMentalidadeCompartilhadoDe ? `<div class="notice">Esta pessoa também está vinculada a outro cargo. Este PDI de Mentalidade começou com os valores mais recentes registrados no outro cargo (mentalidade é única por pessoa, não por cargo) — ajustes feitos aqui não sincronizam automaticamente de volta.</div>` : ''}
      ${/* RN021: PDI de Mentalidade cobre obrigatoriamente os 3 pilares */ ['Conhecimento','Ambiente','Relacoes'].map(eixo=>{
        const v = ciclo.pdiMentalidade[eixo];
        return `
        <div class="pdi-axis">
          <h4>${eixo === 'Relacoes' ? 'Relações' : eixo}</h4>
          <div class="hint">Reflexão conduzida entre colaborador e liderança — a leitura sobre "o que precisa mudar em mim" permanece humana.</div>
          <div class="grid2">
            <div class="field"><label>Onde estou hoje</label><textarea ${editavelPDI?'':'disabled'} onchange="atualizarPDIMentalidade('${ciclo.id}','${eixo}','ondeEstou',this.value)">${v.ondeEstou}</textarea></div>
            <div class="field"><label>Onde preciso chegar</label><textarea ${editavelPDI?'':'disabled'} onchange="atualizarPDIMentalidade('${ciclo.id}','${eixo}','ondeQueroChegar',this.value)">${v.ondeQueroChegar}</textarea></div>
            <div class="field"><label>O que vou fazer</label><textarea ${editavelPDI?'':'disabled'} onchange="atualizarPDIMentalidade('${ciclo.id}','${eixo}','oQueVouFazer',this.value)">${v.oQueVouFazer}</textarea></div>
            <div class="field"><label>Prazo</label><input type="date" ${editavelPDI?'':'disabled'} onchange="atualizarPDIMentalidade('${ciclo.id}','${eixo}','prazo',this.value)" value="${v.prazo}"></div>
            <div class="field"><label>Responsável</label>
              <select ${editavelPDI?'':'disabled'} onchange="atualizarPDIMentalidade('${ciclo.id}','${eixo}','responsavel',this.value)">
                ${['Colaborador','Líder/RH','Colaborador e Líder/RH'].map(r=>`<option ${(v.responsavel||'Colaborador')===r?'selected':''}>${r}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>

    <div class="card">
      <h3>Aprovação do PDI</h3>
      ${ciclo.pdiAprovado ? `
        <span class="pill pill-alavancar">PDI aprovado</span>
        <p class="small-muted" style="margin-top:8px;">Aprovado em ${ciclo.dataAprovacaoPDI||''}. A construção está encerrada — o PDI agora só recebe atualizações de status/evidência em acompanhamento.</p>
      ` : `
        <p class="page-desc">Enquanto não for aprovado, Gestor e Colaborador ainda podem ajustar o PDI juntos.</p>
        ${(()=>{
          const { semPrazoDesenvolvimento, semPrazoMentalidade } = acoesPDISemPrazoOuResponsavel(ciclo);
          if(!semPrazoDesenvolvimento.length && !semPrazoMentalidade.length) return '';
          return `<div class="notice">RN022: toda ação precisa de responsável e prazo definidos antes da aprovação. Pendente em: ${
            [...semPrazoDesenvolvimento.map(i=>i.indicador), ...semPrazoMentalidade].join(', ')
          }.</div>`;
        })()}
        ${podeAprovar ? `<button class="btn btn-primary" onclick="aprovarPDI('${ciclo.id}')">Aprovar PDI e encerrar construção</button>` : '<div class="small-muted">Só o Gestor (ou o Administrador) pode aprovar.</div>'}
      `}
    </div>

    <div class="card">
      <h3>Acompanhamento</h3>
      ${ciclo.estado==='PDI Gerado' && ciclo.pdiAprovado ? `<button class="btn btn-primary" onclick="iniciarAcompanhamento('${ciclo.id}')">Iniciar acompanhamento</button>` : ''}
      ${ciclo.estado==='PDI Gerado' && !ciclo.pdiAprovado ? `<div class="small-muted">Aprove o PDI acima para liberar o acompanhamento.</div>` : ''}
      ${ciclo.estado==='Em Acompanhamento' ? `
        <p class="page-desc">Ciclo em execução. Registre evidências das ações do PDI conforme forem concluídas.</p>
        <button class="btn" onclick="encerrarCiclo('${ciclo.id}')">Encerrar ciclo e habilitar Nova Avaliação</button>
      `: ''}
      ${ciclo.estado==='Encerrado' ? `<span class="pill pill-alavancar">Ciclo encerrado — disponível no histórico</span>` : ''}
    </div>
  `;
}
function souColaboradorDoCiclo(ciclo){
  const p = state.colaboradores.find(c=>c.id===ciclo.colaboradorId);
  return meuPapelReal==='colaborador' && p?.perfilId===meuPerfilId;
}
function souGestorDoCiclo(ciclo){
  const p = state.colaboradores.find(c=>c.id===ciclo.colaboradorId);
  return meuPapelReal==='lider' && p?.gestorPerfilId===meuPerfilId;
}

function renderAcompanhamentoItemPDI(ciclo, item, idx){
  if(item.validadoPeloGestor){
    return `
      <div class="notice" style="border-left-color:var(--alavancar);">
        <b>Concluído e validado</b> em ${item.validadoEm}.
        ${item.evidenciaRegistrada ? `<div class="small-muted" style="margin-top:6px;">Evidência: ${item.evidenciaRegistrada}</div>` : ''}
      </div>`;
  }
  if(item.evidenciaRegistrada){
    const podeValidar = souGestorDoCiclo(ciclo) || meuPapelReal==='owner';
    const nomeColaborador = state.colaboradores.find(c=>c.id===ciclo.colaboradorId)?.nome || 'colaborador';
    return `
      <div class="notice">
        <b>${podeValidar ? `Evidência recebida de ${nomeColaborador}. Validar agora?` : 'Aguardando validação do Gestor'}</b>
        <div class="small-muted" style="margin-top:6px;">Evidência registrada: ${item.evidenciaRegistrada}</div>
      </div>
      ${podeValidar ? `<button class="btn btn-primary btn-sm" onclick="validarEvidenciaPDI('${ciclo.id}',${idx})">Validar evidência</button>` : '<div class="small-muted">Aguardando o Gestor validar.</div>'}
    `;
  }
  const podeRegistrar = souColaboradorDoCiclo(ciclo) || meuPapelReal==='owner';
  if(podeRegistrar){
    return `
      <div class="field" style="margin-bottom:8px;"><label>Registrar evidência de conclusão</label><textarea id="ev_${ciclo.id}_${idx}" placeholder="Descreva o que foi feito, ou cole um link/comprovante"></textarea></div>
      <button class="btn btn-sm" onclick="registrarEvidenciaPDI('${ciclo.id}',${idx})">Registrar evidência e enviar para validação</button>
    `;
  }
  return '<div class="small-muted">Ação ainda não iniciada.</div>';
}
function registrarEvidenciaPDI(cicloId, idx){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  const texto = document.getElementById(`ev_${cicloId}_${idx}`).value.trim();
  if(!texto){ showToast('Descreva a evidência antes de enviar.'); return; }
  ciclo.pdiDesenvolvimento[idx].evidenciaRegistrada = texto;
  ciclo.pdiDesenvolvimento[idx].status = 'aguardando validação';
  atualizarCarimbo(ciclo);
  showToast('Evidência enviada. Aguardando validação do seu gestor.');
  render();
}
function validarEvidenciaPDI(cicloId, idx){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  ciclo.pdiDesenvolvimento[idx].validadoPeloGestor = true;
  ciclo.pdiDesenvolvimento[idx].validadoEm = new Date().toISOString().slice(0,10);
  ciclo.pdiDesenvolvimento[idx].status = 'concluído';
  atualizarCarimbo(ciclo);
  registrarAuditoria('pdi.evidencia_validada', { cicloId, indicador: ciclo.pdiDesenvolvimento[idx].indicador });
  showToast('Evidência validada. Ação marcada como concluída.');
  render();
}

function editarItemPDI(cicloId, idx, campo, valor){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  ciclo.pdiDesenvolvimento[idx][campo] = valor;
  atualizarCarimbo(ciclo);
}
function escolherAcaoDoBanco(cicloId, idx, acaoId){
  if(!acaoId) return;
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  const acao = state.bancoAcoes.find(a=>a.id===acaoId);
  if(!acao) return;
  const item = ciclo.pdiDesenvolvimento[idx];
  item.acaoSugerida = acao.titulo;
  item.categoriaAcao = acao.categoria;
  item.evidenciaSugerida = gerarEvidenciaEspecifica(acao, { nome: item.indicador, pilar: item.pilar });
  item.prazo = acao.prazoSugerido;
  atualizarCarimbo(ciclo);
  showToast('Ação substituída pela escolhida no Banco de Ações.');
  render();
}
function removerItemPDI(cicloId, idx){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  ciclo.pdiDesenvolvimento.splice(idx,1);
  atualizarCarimbo(ciclo);
  showToast('Ação removida do PDI.');
  render();
}
function adicionarItemPDI(cicloId){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  const selectIndicador = document.getElementById(`novo_pdi_indicador_${cicloId}`);
  const opcaoSelecionada = selectIndicador.options[selectIndicador.selectedIndex];
  const acao = document.getElementById(`novo_pdi_acao_${cicloId}`).value.trim();
  const evidencia = document.getElementById(`novo_pdi_evidencia_${cicloId}`).value.trim();
  const prazo = document.getElementById(`novo_pdi_prazo_${cicloId}`).value.trim();
  const responsavel = document.getElementById(`novo_pdi_responsavel_${cicloId}`).value;
  if(!acao){ showToast('Descreva a ação combinada.'); return; }
  ciclo.pdiDesenvolvimento.push({
    indicador: opcaoSelecionada.value, pilar: opcaoSelecionada.dataset.pilar, classificacao: opcaoSelecionada.dataset.classificacao,
    acaoSugerida: acao, categoriaAcao: 'Personalizada', evidenciaSugerida: evidencia || 'A combinar', prazo: prazo || 'A combinar',
    responsavel, status: 'não iniciado',
  });
  atualizarCarimbo(ciclo);
  showToast('Ação personalizada adicionada ao PDI.');
  render();
}
function acoesPDISemPrazoOuResponsavel(ciclo){
  // RN022: toda Ação do PDI precisa de responsável e prazo definidos para ser
  // considerada "ativa". 'A combinar' é um placeholder, não um prazo real.
  const semPrazoDesenvolvimento = (ciclo.pdiDesenvolvimento||[]).filter(item =>
    !item.responsavel || !item.prazo || item.prazo === 'A combinar'
  );
  const eixosMentalidade = ['Conhecimento','Ambiente','Relacoes'];
  const semPrazoMentalidade = ciclo.pdiMentalidade
    ? eixosMentalidade.filter(eixo => {
        const v = ciclo.pdiMentalidade[eixo];
        return v && v.oQueVouFazer && (!v.responsavel || !v.prazo);
      })
    : [];
  return { semPrazoDesenvolvimento, semPrazoMentalidade };
}
function aprovarPDI(cicloId){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  const { semPrazoDesenvolvimento, semPrazoMentalidade } = acoesPDISemPrazoOuResponsavel(ciclo);
  if(semPrazoDesenvolvimento.length || semPrazoMentalidade.length){
    showToast('Toda ação precisa de responsável e prazo (RN022). Complete os campos pendentes antes de aprovar.');
    return;
  }
  ciclo.pdiAprovado = true;
  ciclo.dataAprovacaoPDI = new Date().toISOString().slice(0,10);
  atualizarCarimbo(ciclo);
  registrarAuditoria('pdi.aprovado', { cicloId });
  emitirEvento('pdi.aprovado', { cicloId });
  showToast('PDI aprovado. A construção está encerrada — agora é só acompanhar a execução.');
  render();
}
function atualizarStatusPDI(cicloId, idx, status){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  ciclo.pdiDesenvolvimento[idx].status = status;
  render();
}
function atualizarPDIMentalidade(cicloId, eixo, campo, valor){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  ciclo.pdiMentalidade[eixo][campo] = valor;
}
function iniciarAcompanhamento(cicloId){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  if(!ciclo.pdiAprovado){ showToast('O PDI precisa ser aprovado antes de iniciar o acompanhamento.'); return; }
  ciclo.estado = 'Em Acompanhamento';
  showToast('Acompanhamento iniciado.');
  render();
}
function encerrarCiclo(cicloId){
  const ciclo = state.ciclos.find(c=>c.id===cicloId);
  if(!ciclo.pdiMentalidade){ showToast('Não é possível encerrar: o PDI de Mentalidade precisa existir para todo ciclo (RN020).'); return; }
  ciclo.estado = 'Encerrado';
  emitirEvento('avaliacao.encerrada', { cicloId });
  showToast('Ciclo encerrado. Dados preservados no histórico — nunca apagados (regra de histórico).');
  render();
}

/* ===================== 8. DIAGNÓSTICO & PDI (visão consolidada) ===================== */
