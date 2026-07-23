function renderRoute(){
  switch(state.route){
    case 'empresa': return pageEmpresa();
    case 'estrutura': return pageEstrutura();
    case 'cultura': return pageCultura();
    case 'usuarios': return pageUsuarios();
    case 'cargos': return pageCargos();
    case 'desenho': return pageDesenho();
    case 'colaboradores': return pageColaboradores();
    case 'ciclos': return pageCiclos();
    case 'diagnostico': return pageDiagnostico();
    case 'inteligencia': return pageInteligencia();
    case 'relatorios': return pageRelatorios();
    case 'configuracoes': return pageConfiguracoes();
    case 'dashboard_role': return pageDashboard();
    default: return pageDashboard();
  }
}
state.route = 'dashboard_role';

/* ===================== DASHBOARD ===================== */
/* ---------- Cap. 9 — Central de pendências por perfil (sugestão técnica) ----------
   Cada jornada ganha uma "home" com as ações pendentes em destaque, pra
   reduzir cliques: a pessoa já vê o que precisa fazer, sem precisar navegar. */
function renderPendenciasAdmin(){
  const itens = [];
  if(!state.empresa || state.empresa.estado!=='Ativa') itens.push({texto:'Ativar o cadastro da empresa', rota:'empresa'});
  if(state.empresa && state.empresa.estado==='Ativa' && !state.estrutura.length) itens.push({texto:'Cadastrar ao menos uma Unidade na Estrutura Organizacional', rota:'estrutura'});
  if(!state.cultura.missao) itens.push({texto:'Preencher a Cultura Organizacional (missão, visão, valores)', rota:'cultura'});
  if(!state.cargos.some(c=>c.desenho.aprovado)) itens.push({texto:'Publicar ao menos um Desenho de Cargo', rota:'cargos'});
  if(_perfisEmpresa.length < 2) itens.push({texto:'Convidar ao menos mais uma pessoa (RH, Gestor ou Colaborador)', rota:'usuarios'});
  if(!itens.length) return '';
  return `
    <div class="card" style="border-left:3px solid var(--gold);">
      <h3>Onboarding do tenant <small>Passos ainda pendentes pra deixar o sistema pronto pra operar</small></h3>
      ${itens.map(i=>`<div class="pendencia-item"><span>${i.texto}</span><button class="btn btn-sm" onclick="goto('${i.rota}')">Resolver →</button></div>`).join('')}
    </div>`;
}
function diasDesdeAbertura(ciclo){
  const hoje = new Date(new Date().toISOString().slice(0,10));
  const abertura = new Date(ciclo.dataAbertura);
  return Math.round((hoje - abertura) / (1000*60*60*24));
}
function renderPendenciasRH(){
  const aguardandoRH = state.ciclos.filter(c=>c.etapa==='rh' && (c.estado==='Aberto'||c.estado==='Em Consolidação'));
  const pendencias = state.ciclos.filter(c=>c.estado==='Pendência de Avaliador');
  const semCiclo = state.colaboradores.filter(p=>{
    const cargo = state.cargos.find(c=>c.id===p.cargoId);
    return cargo?.desenho.aprovado && !cargo.descontinuado && p.unidadeId && p.setorId && p.gestorPerfilId
      && !state.ciclos.some(c=>c.colaboradorId===p.id && c.estado!=='Encerrado');
  });
  // Alerta: ciclos abertos há mais de 15 dias sem conclusão.
  const ciclosAntigos = state.ciclos.filter(c=>
    (c.estado==='Aberto'||c.estado==='Em Consolidação'||c.estado==='Pendência de Avaliador') && diasDesdeAbertura(c) > 15
  );
  // Ciclo extraordinário (pós-promoção) com prazo vencendo nos próximos 7 dias.
  const promocaoVencendo = state.ciclos.filter(c=>{
    if(!c.extraordinario || c.estado==='Encerrado') return false;
    const dias = diasAteVencimento(c);
    return dias !== null && dias >= 0 && dias <= 7;
  });
  if(!aguardandoRH.length && !pendencias.length && !semCiclo.length && !ciclosAntigos.length && !promocaoVencendo.length) return '';
  return `
    <div class="card" style="border-left:3px solid var(--gold);">
      <h3>Suas pendências agora</h3>
      ${aguardandoRH.length? `<div class="pendencia-item"><span>Você tem <b>${aguardandoRH.length}</b> avaliação(ões) aguardando sua etapa</span><button class="btn btn-sm" onclick="goto('ciclos')">Avaliar →</button></div>` : ''}
      ${pendencias.length? `<div class="pendencia-item"><span><b>${pendencias.length}</b> ciclo(s) com pendência de avaliador vencida</span><button class="btn btn-sm" onclick="goto('ciclos')">Resolver →</button></div>` : ''}
      ${semCiclo.length? `<div class="pendencia-item"><span><b>${semCiclo.length}</b> colaborador(es) elegível(is) ainda sem ciclo aberto</span><button class="btn btn-sm" onclick="goto('ciclos')">Abrir ciclo →</button></div>` : ''}
      ${ciclosAntigos.length? `<div class="pendencia-item"><span><b>${ciclosAntigos.length}</b> colaborador(es) estão com Ciclo pendente há mais de 15 dias</span><button class="btn btn-sm" onclick="goto('ciclos')">Ver →</button></div>` : ''}
      ${promocaoVencendo.length? `<div class="pendencia-item"><span><b>${promocaoVencendo.length}</b> ciclo(s) extraordinário(s) pós-promoção (RN016) vencendo nos próximos 7 dias</span><button class="btn btn-sm" onclick="goto('ciclos')">Ver →</button></div>` : ''}
    </div>`;
}
function renderPendenciasGestor(){
  const minhaEquipe = state.colaboradores.filter(p=>p.gestorPerfilId===meuPerfilId);
  const aguardandoMim = state.ciclos.filter(c=>c.etapa==='lider' && (c.estado==='Aberto'||c.estado==='Em Consolidação') && minhaEquipe.some(p=>p.id===c.colaboradorId));
  const semFeedback = state.ciclos.filter(c=>c.diagnostico && !c.reuniaoFeedback?.realizada && minhaEquipe.some(p=>p.id===c.colaboradorId));

  // Progresso da avaliação da equipe nesta rodada (Fluxo de Navegação, Cap. 3.3).
  const ciclosDaEquipe = state.ciclos.filter(c=>minhaEquipe.some(p=>p.id===c.colaboradorId) && c.estado!=='Encerrado');
  let progressoEquipe = '';
  if(ciclosDaEquipe.length){
    // Já avaliado pelo Gestor quando o ciclo já passou da etapa 'lider' (está em 'rh') ou já tem diagnóstico.
    const concluidosPorMim = ciclosDaEquipe.filter(c => c.etapa==='rh' || !!c.diagnostico).length;
    const faltam = ciclosDaEquipe.length - concluidosPorMim;
    const percentual = Math.round((concluidosPorMim / ciclosDaEquipe.length) * 100);
    if(faltam > 0){
      progressoEquipe = `<div class="pendencia-item"><span>Sua avaliação da equipe está <b>${percentual}%</b> concluída. Faltam <b>${faltam}</b> colaborador(es).</span><button class="btn btn-sm" onclick="goto('ciclos')">Continuar →</button></div>`;
    }
  }

  if(!aguardandoMim.length && !semFeedback.length && !progressoEquipe) return '';
  return `
    <div class="card" style="border-left:3px solid var(--gold);">
      <h3>Você tem pendências</h3>
      ${progressoEquipe}
      ${aguardandoMim.length? `<div class="pendencia-item"><span>Você tem <b>${aguardandoMim.length}</b> avaliação(ões) da equipe aguardando você</span><button class="btn btn-sm" onclick="goto('ciclos')">Avaliar →</button></div>` : ''}
      ${semFeedback.length? `<div class="pendencia-item"><span><b>${semFeedback.length}</b> reunião(ões) de feedback ainda não registrada(s)</span><button class="btn btn-sm" onclick="goto('ciclos')">Registrar →</button></div>` : ''}
    </div>`;
}
function renderPendenciasColaborador(){
  const meuRegistro = state.colaboradores.find(c=>c.perfilId===meuPerfilId);
  if(!meuRegistro) return '';
  const meusCiclos = state.ciclos.filter(c=>c.colaboradorId===meuRegistro.id);
  const minhaAutoavaliacao = meusCiclos.filter(c=>c.etapa==='colaborador' && (c.estado==='Aberto'||c.estado==='Em Consolidação'));
  const semFeedback = meusCiclos.filter(c=>c.diagnostico && !c.reuniaoFeedback?.realizada);
  if(!minhaAutoavaliacao.length && !semFeedback.length) return '';
  return `
    <div class="card" style="border-left:3px solid var(--gold);">
      <h3>Você tem pendências</h3>
      ${minhaAutoavaliacao.length? `<div class="pendencia-item"><span>Sua <b>autoavaliação</b> está aguardando você</span><button class="btn btn-sm" onclick="abrirCiclo('${minhaAutoavaliacao[0].id}')">Responder →</button></div>` : ''}
      ${semFeedback.length? `<div class="pendencia-item"><span>Sua reunião de feedback ainda não foi registrada</span><button class="btn btn-sm" onclick="abrirCiclo('${semFeedback[0].id}')">Ver ciclo →</button></div>` : ''}
    </div>`;
}

function pageDashboard(){
  const totalCiclos = state.ciclos.length;
  const abertos = state.ciclos.filter(c=>c.estado==='Aberto'||c.estado==='Em Consolidação').length;
  const pdisAtivos = state.ciclos.filter(c=>c.pdiDesenvolvimento||c.pdiMentalidade).length;
  const encerrados = state.ciclos.filter(c=>c.estado==='Encerrado'||c.estado==='PDI Gerado'||c.estado==='Em Acompanhamento').length;

  const roleTitle = {
    admin:'Visão geral da organização — Administrador',
    rh:'Painel operacional da metodologia — RH',
    gestor:'Painel da minha equipe — Gestor',
    colaborador:'Minha evolução — Colaborador'
  }[state.role];

  let body = '';
  if(state.role==='colaborador'){
    body = renderPendenciasColaborador() + renderDashboardColaborador();
  } else if(state.role==='gestor' && !meuEscopoEstendido){
    body = renderPendenciasGestor() + renderDashboardGestor();
  } else if(state.role==='gestor' && meuEscopoEstendido){
    body = `<div class="notice info">Escopo estendido: você tem uma exceção explícita concedida pelo Administrador para ver os dados consolidados de toda a empresa, além da sua própria equipe.</div>` + renderPendenciasGestor() + renderDashboardAdmin(abertos, pdisAtivos, encerrados);
  } else if(state.role==='rh'){
    body = renderPendenciasRH() + renderDashboardRH();
  } else {
    body = renderPendenciasAdmin() + renderDashboardAdmin(abertos, pdisAtivos, encerrados);
  }

  return `
    <div class="page-head">
      <div class="eyebrow">Dashboard · ${state.role.toUpperCase()}</div>
      <h1>${roleTitle}</h1>
      <p class="page-desc">A plataforma organiza, calcula e sugere — a decisão final permanece sempre humana.</p>
    </div>
    ${body}
  `;
}

/* ---------- Administrador: visão geral da empresa, indicadores estratégicos, evolução consolidada ---------- */
function renderDashboardAdmin(abertos, pdisAtivos, encerrados){
  const unidades = state.estrutura.filter(n=>n.tipo==='unidade');
  const porUnidade = unidades.map(u=>{
    const colabs = state.colaboradores.filter(p=>p.unidadeId===u.id);
    const comDiag = colabs.map(p=>{
      const ultimo = state.ciclos.filter(c=>c.colaboradorId===p.id && c.diagnostico).slice().sort((a,b)=>a.dataAbertura.localeCompare(b.dataAbertura)).pop();
      return ultimo ? ultimo.diagnostico.geral : null;
    }).filter(Boolean);
    const alavancar = comDiag.filter(g=>g==='A').length;
    return { nome:u.nome, total:colabs.length, avaliados:comDiag.length, alavancar };
  });

  // 7.5 — Indicadores Organizacionais: cargos com maior concentração de "Iniciar".
  const porCargo = state.cargos.map(cargo=>{
    const colabs = state.colaboradores.filter(p=>p.cargoId===cargo.id);
    const ultimasClassificacoes = colabs.map(p=>{
      const ultimo = state.ciclos.filter(c=>c.colaboradorId===p.id && c.diagnostico).slice().sort((a,b)=>a.dataAbertura.localeCompare(b.dataAbertura)).pop();
      return ultimo ? ultimo.diagnostico.geral : null;
    }).filter(Boolean);
    const iniciar = ultimasClassificacoes.filter(g=>g==='I').length;
    return { nome:cargo.nome, avaliados:ultimasClassificacoes.length, iniciar, percentual: ultimasClassificacoes.length ? Math.round((iniciar/ultimasClassificacoes.length)*100) : 0 };
  }).filter(c=>c.avaliados>0 && c.iniciar>0).sort((a,b)=>b.percentual-a.percentual);

  // Evolução organizacional consolidada: média geral por mês de abertura do ciclo.
  const porMes = {};
  state.ciclos.filter(c=>c.diagnostico && c.diagnostico.geralMedia!==null).forEach(c=>{
    const mes = c.dataAbertura.slice(0,7);
    porMes[mes] = porMes[mes] || [];
    porMes[mes].push(c.diagnostico.geralMedia);
  });
  const meses = Object.keys(porMes).sort();

  return `
    ${meuPapelReal==='owner' ? `
    <div class="card" style="border-left:3px solid var(--gold);">
      <h3>Ambiente de testes <small>Preenche a empresa com estrutura, cultura, cargos publicados, colaboradores e um ciclo aberto — não apaga nada existente</small></h3>
      <button class="btn" onclick="gerarDadosTeste()">Gerar dados de teste</button>
    </div>
    ` : ''}
    <div class="kpi-grid">
      <div class="kpi"><div class="n">${state.colaboradores.length}</div><div class="l">Colaboradores cadastrados</div></div>
      <div class="kpi"><div class="n">${abertos}</div><div class="l">Ciclos em andamento</div></div>
      <div class="kpi"><div class="n">${pdisAtivos}</div><div class="l">PDIs ativos</div></div>
      <div class="kpi"><div class="n">${encerrados}</div><div class="l">Ciclos com diagnóstico gerado</div></div>
    </div>
    <div class="card">
      <h3>Distribuição por classificação IDA <small>Consolidado de todos os ciclos com diagnóstico — indicador estratégico</small></h3>
      ${renderDistribuicaoIDA()}
    </div>
    ${unidades.length ? `
    <div class="card">
      <h3>Indicadores estratégicos por Unidade</h3>
      <table><thead><tr><th>Unidade</th><th>Colaboradores</th><th>Já avaliados</th><th>Em Alavancar</th></tr></thead><tbody>
        ${porUnidade.map(u=>`<tr><td><b>${u.nome}</b></td><td class="small-muted">${u.total}</td><td class="small-muted">${u.avaliados}</td><td class="small-muted">${u.alavancar}</td></tr>`).join('')}
      </tbody></table>
    </div>` : ''}
    ${porCargo.length ? `
    <div class="card">
      <h3>Cargos com maior concentração de "Iniciar" <small>Indicador organizacional (7.5) — pode sinalizar problema do cargo/treinamento, não só da pessoa</small></h3>
      <table><thead><tr><th>Cargo</th><th>Colaboradores avaliados</th><th>Em Iniciar</th><th>%</th></tr></thead><tbody>
        ${porCargo.map(c=>`<tr><td><b>${c.nome}</b></td><td class="small-muted">${c.avaliados}</td><td class="small-muted">${c.iniciar}</td><td><span class="pill pill-iniciar">${c.percentual}%</span></td></tr>`).join('')}
      </tbody></table>
    </div>` : ''}
    ${meses.length ? `
    <div class="card">
      <h3>Evolução organizacional consolidada <small>Média geral ponderada, por mês de abertura do ciclo</small></h3>
      <table><thead><tr><th>Mês</th><th>Ciclos com diagnóstico</th><th>Média geral</th><th>Classificação</th></tr></thead><tbody>
        ${meses.map(m=>{
          const arr = porMes[m];
          const media = arr.reduce((a,b)=>a+b,0)/arr.length;
          return `<tr><td>${m}</td><td class="small-muted">${arr.length}</td><td class="small-muted">${media.toFixed(2)}</td><td><span class="pill ${pillClass(classificar(media))}">${pillLabel(classificar(media))}</span></td></tr>`;
        }).join('')}
      </tbody></table>
    </div>` : ''}
    <div class="card">
      <h3>Ciclos recentes</h3>
      ${state.ciclos.length? renderCiclosTable() : '<div class="empty">Nenhum ciclo aberto ainda. Vá em <b>Ciclos de Avaliação</b> para iniciar o primeiro.</div>'}
    </div>
  `;
}

/* ---------- RH: avaliações em andamento, PDIs ativos, competências críticas, relatórios de desenvolvimento ---------- */
function renderDashboardRH(){
  const emAndamento = state.ciclos.filter(c=>c.estado==='Aberto'||c.estado==='Em Consolidação');
  const pendentes = state.ciclos.filter(c=>c.estado==='Pendência de Avaliador');
  const pdisAtivos = state.ciclos.filter(c=>c.pdiDesenvolvimento?.length || c.pdiMentalidade);

  const contagemCriticas = {};
  state.ciclos.filter(c=>c.diagnostico).forEach(c=>{
    (c.diagnostico.competenciasCriticas || []).forEach(nome=>{ contagemCriticas[nome] = (contagemCriticas[nome]||0)+1; });
  });
  const criticasOrdenadas = Object.entries(contagemCriticas).sort((a,b)=>b[1]-a[1]).slice(0,8);

  // 7.2 — Colaboradores em risco: classificação baixa (fora de Alavancar) em
  // pelo menos os 2 últimos ciclos consolidados, não só um resultado isolado.
  const colaboradoresEmRisco = state.colaboradores.filter(p=>{
    const ciclosDoColab = state.ciclos.filter(c=>c.colaboradorId===p.id && c.diagnostico)
      .slice().sort((a,b)=>b.dataAbertura.localeCompare(a.dataAbertura));
    if(ciclosDoColab.length < 2) return false;
    return ciclosDoColab.slice(0,2).every(c=>c.diagnostico.geral !== 'A');
  });

  // 5.4 — alerta de ciclo anual vencido: mais de 12 meses sem nenhum ciclo.
  const hoje = new Date();
  const cicloVencido = state.colaboradores.filter(p=>{
    const ciclosDoColab = state.ciclos.filter(c=>c.colaboradorId===p.id).slice().sort((a,b)=>b.dataAbertura.localeCompare(a.dataAbertura));
    if(!ciclosDoColab.length) return false; // nunca avaliado é outra situação, não "vencido"
    const dias = Math.round((hoje - new Date(ciclosDoColab[0].dataAbertura)) / (1000*60*60*24));
    return dias > 365;
  });

  return `
    <div class="kpi-grid">
      <div class="kpi"><div class="n">${emAndamento.length}</div><div class="l">Avaliações em andamento</div></div>
      <div class="kpi"><div class="n">${pendentes.length}</div><div class="l">Pendências de avaliador</div></div>
      <div class="kpi"><div class="n">${pdisAtivos.length}</div><div class="l">PDIs ativos</div></div>
      <div class="kpi"><div class="n">${criticasOrdenadas.length}</div><div class="l">Competências críticas distintas</div></div>
    </div>
    <div class="card">
      <h3>Distribuição por classificação IDA <small>% de colaboradores por classificação — consolidado de todos os ciclos com diagnóstico</small></h3>
      ${renderDistribuicaoIDA()}
    </div>
    ${pendentes.length ? `
    <div class="card" style="border-left:3px solid var(--iniciar);">
      <h3>Requer sua ação — Pendências de avaliador</h3>
      ${renderCiclosTableInteractive(pendentes)}
    </div>` : ''}
    <div class="card">
      <h3>Avaliações em andamento</h3>
      ${emAndamento.length ? renderCiclosTableInteractive(emAndamento) : '<div class="empty">Nenhuma avaliação em andamento no momento.</div>'}
    </div>
    ${colaboradoresEmRisco.length ? `
    <div class="card" style="border-left:3px solid var(--iniciar);">
      <h3>Colaboradores em risco <small>Classificação fora de Alavancar nos 2 últimos ciclos consolidados (7.2)</small></h3>
      <table><thead><tr><th>Colaborador</th><th>Cargo</th><th>Últimas classificações</th></tr></thead><tbody>
        ${colaboradoresEmRisco.map(p=>{
          const cargo = state.cargos.find(c=>c.id===p.cargoId);
          const ultimos = state.ciclos.filter(c=>c.colaboradorId===p.id && c.diagnostico).slice().sort((a,b)=>b.dataAbertura.localeCompare(a.dataAbertura)).slice(0,2);
          return `<tr><td><b>${p.nome}</b></td><td class="small-muted">${cargo?cargo.nome:'—'}</td>
            <td>${ultimos.map(c=>`<span class="pill ${pillClass(c.diagnostico.geral)}" style="margin-right:4px;">${pillLabel(c.diagnostico.geral)}</span>`).join('')}</td></tr>`;
        }).join('')}
      </tbody></table>
    </div>` : ''}
    ${cicloVencido.length ? `
    <div class="card" style="border-left:3px solid var(--desenvolver);">
      <h3>Ciclo anual vencido <small>Mais de 12 meses sem nenhuma avaliação (regra 5.4)</small></h3>
      <table><thead><tr><th>Colaborador</th><th>Última avaliação</th></tr></thead><tbody>
        ${cicloVencido.map(p=>{
          const ultimo = state.ciclos.filter(c=>c.colaboradorId===p.id).slice().sort((a,b)=>b.dataAbertura.localeCompare(a.dataAbertura))[0];
          return `<tr><td><b>${p.nome}</b></td><td class="small-muted">${ultimo.dataAbertura}</td></tr>`;
        }).join('')}
      </tbody></table>
    </div>` : ''}
    <div class="card">
      <h3>Competências críticas mais recorrentes <small>Base para priorizar ações de desenvolvimento (relatório de desenvolvimento)</small></h3>
      ${criticasOrdenadas.length ? `
        <table><thead><tr><th>Indicador</th><th>Ocorrências</th></tr></thead><tbody>
          ${criticasOrdenadas.map(([nome,n])=>`<tr><td>${nome}</td><td class="small-muted">${n}</td></tr>`).join('')}
        </tbody></table>
      ` : '<div class="empty">Nenhuma competência crítica recorrente identificada ainda.</div>'}
      <button class="btn btn-sm btn-ghost" style="margin-top:10px;" onclick="goto('relatorios')">Ver relatórios completos →</button>
    </div>
  `;
}

/* ---------- Gestor: desempenho da equipe, evolução dos colaboradores diretos, PDIs ---------- */
function renderDashboardGestor(){
  const minhaEquipe = state.colaboradores.filter(p=>p.gestorPerfilId===meuPerfilId);
  if(!minhaEquipe.length) return '<div class="empty">Nenhum colaborador está vinculado a você como gestor direto ainda. Peça ao RH ou Administrador para fazer essa vinculação em "Colaboradores".</div>';

  const meusCiclos = state.ciclos.filter(c=>minhaEquipe.some(p=>p.id===c.colaboradorId));
  const abertosEquipe = meusCiclos.filter(c=>c.estado==='Aberto'||c.estado==='Em Consolidação').length;
  const pdisEquipe = meusCiclos.filter(c=>c.pdiDesenvolvimento?.length || c.pdiMentalidade);
  const mentalidadePendentes = meusCiclos.filter(c=>c.diagnostico && pdiMentalidadeNaoIniciado(c) && c.estado!=='Encerrado').length;

  return `
    <div class="kpi-grid">
      <div class="kpi"><div class="n">${minhaEquipe.length}</div><div class="l">Colaboradores na minha equipe</div></div>
      <div class="kpi"><div class="n">${abertosEquipe}</div><div class="l">Ciclos em andamento</div></div>
      <div class="kpi"><div class="n">${pdisEquipe.length}</div><div class="l">PDIs ativos na equipe</div></div>
    </div>
    ${mentalidadePendentes ? `<div class="notice" style="border-left-color:var(--iniciar);">⚠ ${mentalidadePendentes} PDI(s) de Mentalidade pendente(s) — obrigatórios em todo ciclo (RN020).</div>` : ''}
    <div class="card">
      <h3>Desempenho e evolução da equipe <small>Última classificação de cada colaborador, comparada com o ciclo anterior</small></h3>
      <table><thead><tr><th>Colaborador</th><th>Cargo</th><th>Ciclo anterior</th><th>Ciclo atual</th><th>Evolução</th><th>PDI</th></tr></thead><tbody>
        ${minhaEquipe.map(p=>{
          const cargo = state.cargos.find(c=>c.id===p.cargoId);
          const historico = state.ciclos.filter(c=>c.colaboradorId===p.id && c.diagnostico).slice().sort((a,b)=>a.dataAbertura.localeCompare(b.dataAbertura));
          const ultimo = historico[historico.length-1];
          const anterior = historico[historico.length-2];
          const temPdi = ultimo && (ultimo.pdiDesenvolvimento?.length || ultimo.pdiMentalidade);
          const ordemIDA = {I:0,D:1,A:2};
          let evolucao = '<span class="small-muted">—</span>';
          if(ultimo && anterior){
            const diff = ordemIDA[ultimo.diagnostico.geral] - ordemIDA[anterior.diagnostico.geral];
            evolucao = diff>0 ? '<span style="color:var(--alavancar);">↑ Melhorou</span>' : diff<0 ? '<span style="color:var(--iniciar);">↓ Piorou</span>' : '<span class="small-muted">→ Manteve</span>';
          }
          return `<tr>
            <td><b>${p.nome}</b></td>
            <td class="small-muted">${cargo?cargo.nome:'—'}</td>
            <td>${anterior ? `<span class="pill ${pillClass(anterior.diagnostico.geral)}">${pillLabel(anterior.diagnostico.geral)}</span>` : '<span class="small-muted">Sem ciclo anterior</span>'}</td>
            <td>${ultimo ? `<span class="pill ${pillClass(ultimo.diagnostico.geral)}">${pillLabel(ultimo.diagnostico.geral)}</span>` : '<span class="small-muted">Sem diagnóstico ainda</span>'}</td>
            <td>${evolucao}</td>
            <td class="small-muted">${temPdi ? 'Ativo — acompanhar' : '—'}</td>
          </tr>`;
        }).join('')}
      </tbody></table>
    </div>
    <div class="card">
      <h3>Minha equipe — ciclos</h3>
      ${meusCiclos.length? renderCiclosTableInteractive(meusCiclos) : '<div class="empty">Nenhum ciclo aberto para sua equipe ainda.</div>'}
    </div>
  `;
}

/* ---------- Colaborador: histórico pessoal, resultados, evolução, PDI próprio ---------- */
function renderDashboardColaborador(){
  const meuRegistro = state.colaboradores.find(c=>c.perfilId===meuPerfilId);
  if(!meuRegistro) return '<div class="empty">Sua conta ainda não foi vinculada a um registro de colaborador. Peça ao RH ou Administrador para fazer essa vinculação em "Colaboradores".</div>';

  const meuCargo = state.cargos.find(c=>c.id===meuRegistro.cargoId);
  const meusCiclos = state.ciclos.filter(c=>c.colaboradorId===meuRegistro.id).slice().sort((a,b)=>a.dataAbertura.localeCompare(b.dataAbertura));
  const cicloAtual = meusCiclos.find(c=>c.estado!=='Encerrado') || meusCiclos[meusCiclos.length-1];
  const historico = meusCiclos.filter(c=>c.diagnostico);

  return `
    <div class="card">
      <h3>${meuRegistro.nome} <small>${meuCargo?meuCargo.nome:'—'}</small></h3>
      ${cicloAtual ? `
        <p class="page-desc">Ciclo atual: <b>${cicloAtual.estado}</b></p>
        ${cicloAtual.diagnostico? diagnosticoSummaryHTML(cicloAtual) : '<p class="small-muted">Sua primeira avaliação ainda não foi concluída.</p>'}
        ${cicloAtual.diagnostico ? `<button class="btn btn-sm" style="margin-top:10px;" onclick="abrirCiclo('${cicloAtual.id}')">Ver meu PDI completo →</button>` : ''}
      `: '<div class="empty">Nenhum ciclo de avaliação aberto no momento.</div>'}
    </div>
    ${historico.length>1 ? `
    <div class="card">
      <h3>Minha evolução ao longo do tempo</h3>
      <table><thead><tr><th>Data</th><th>Classificação geral</th></tr></thead><tbody>
        ${historico.map(c=>`<tr><td class="small-muted">${c.dataAbertura}</td><td><span class="pill ${pillClass(c.diagnostico.geral)}">${pillLabel(c.diagnostico.geral)}</span></td></tr>`).join('')}
      </tbody></table>
    </div>` : ''}
  `;
}

function renderDistribuicaoIDA(){
  const comDiag = state.ciclos.filter(c=>c.diagnostico && c.diagnostico.geral); // BUG CORRIGIDO: exclui geral null/undefined em vez de somar como Alavancar
  if(!comDiag.length) return '<div class="empty">Ainda não há diagnósticos gerados para consolidar.</div>';
  let I=0,D=0,A=0;
  comDiag.forEach(c=>{
    const g = c.diagnostico.geral;
    if(g==='I')I++; else if(g==='D')D++; else if(g==='A')A++;
  });
  const total = I+D+A;
  return `
  <div style="display:flex;gap:10px;">
    ${[['Iniciar',I,'iniciar'],['Desenvolver',D,'desenvolver'],['Alavancar',A,'alavancar']].map(([l,n,cls])=>`
      <div style="flex:1;background:var(--${cls}-soft);border:1px solid var(--${cls});border-radius:8px;padding:14px;text-align:center;">
        <div style="font-family:var(--serif-display);font-size:22px;color:var(--${cls});font-weight:700;">${n} <span style="font-size:14px;font-weight:400;">(${total?Math.round((n/total)*100):0}%)</span></div>
        <div class="small-muted">${l}</div>
      </div>
    `).join('')}
  </div>`;
}

function renderCiclosTable(){
  return `<table><thead><tr><th>Colaborador</th><th>Cargo</th><th>Estado</th><th>Abertura</th><th></th></tr></thead><tbody>
    ${state.ciclos.map(c=>{
      const p = state.colaboradores.find(x=>x.id===c.colaboradorId);
      const cargo = state.cargos.find(x=>x.id===c.cargoId);
      return `<tr>
        <td>${p?p.nome:'—'}</td>
        <td>${cargo?cargo.nome:'—'}</td>
        <td><span class="pill pill-neutral">${c.estado}</span></td>
        <td class="small-muted">${c.dataAbertura}</td>
        <td><button class="btn btn-sm btn-ghost" onclick="abrirCiclo('${c.id}')">Ver ciclo →</button></td>
      </tr>`;
    }).join('')}
  </tbody></table>`;
}

/* ===================== 1. EMPRESA ===================== */
