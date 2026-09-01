function renderRoute() {
  switch (state.route) {
    case 'empresa':
      return pageEmpresa();
    case 'estrutura':
      return pageEstrutura();
    case 'cultura':
      return pageCultura();
    case 'usuarios':
      return pageUsuarios();
    case 'cargos':
      return pageCargos();
    case 'desenho':
      return pageDesenho();
    case 'colaboradores':
      return pageColaboradores();
    case 'ponto':
      return pontoHabilitado
        ? pagePonto()
        : '<div class="notice info">O módulo de Ponto não está habilitado para esta empresa.</div>';
    case 'totem_ponto':
      return pontoHabilitado
        ? pageTotemPonto()
        : '<div class="notice info">O módulo de Ponto não está habilitado para esta empresa.</div>';
    case 'ciclos':
      return pageCiclos();
    case 'diagnostico':
      return pageDiagnostico();
    case 'inteligencia':
      return pageInteligencia();
    case 'relatorios':
      return pageRelatorios();
    case 'configuracoes':
      return pageConfiguracoes();
    case 'pagamento':
      return pagePagamento();
    case 'auditoria':
      return pageAuditoria();
    case 'clima':
      return pageClima();
    case 'sucessao':
      return pageMapaSucessao();
    case 'webhooks':
      return pageWebhooks();
    case 'dashboard_role':
      return pageDashboard();
    case 'super_admin':
      return souSuperAdmin ? pageSuperAdmin() : pageDashboard();
    default:
      return pageDashboard();
  }
}
state.route = 'dashboard_role';

/* ===================== DASHBOARD ===================== */
/* ---------- Cap. 9 — Central de pendências por perfil (sugestão técnica) ----------
   Cada jornada ganha uma "home" com as ações pendentes em destaque, pra
   reduzir cliques: a pessoa já vê o que precisa fazer, sem precisar navegar. */
/* Mostra um aviso se a pessoa logada também está sendo avaliada em algum
   ciclo aberto — necessário agora que Líder, RH e Administrador também
   podem ter seu próprio ciclo (antes, só quem tinha papel "colaborador"
   passava por isso, e via esse aviso automaticamente no próprio dashboard
   de Colaborador). Sem isso, um Líder/RH/Admin sendo avaliado nunca
   ficaria sabendo, porque o dashboard dele é outro. */
function renderMinhaAvaliacaoPendente() {
  const meuCiclo = state.ciclos.find(
    (c) =>
      souOColaboradorDoCiclo(c) &&
      (c.estado === 'Aberto' || c.estado === 'Em Consolidação' || c.estado === 'Pendência de Avaliador')
  );
  if (!meuCiclo) return '';
  const precisaAgir = meuCiclo.tipoAvaliacao !== 'ao_vivo' && meuCiclo.etapa === 'colaborador';
  return `<div class="notice info">
    <b>Você também está sendo avaliado(a) neste ciclo.</b>
    ${precisaAgir ? ' Sua autoavaliação está aguardando você.' : ' Acompanhe o andamento quando quiser.'}
    <button class="btn btn-sm" style="margin-left:8px;" onclick="abrirCiclo('${meuCiclo.id}')">Abrir meu ciclo →</button>
  </div>`;
}

function renderPendenciasAdmin() {
  const passos = [
    {
      texto: 'Ativar o cadastro da empresa',
      rota: 'empresa',
      feito: !!(state.empresa && state.empresa.estado === 'Ativa'),
    },
    {
      texto: 'Cadastrar ao menos uma Unidade na Estrutura Organizacional',
      rota: 'estrutura',
      feito: state.estrutura.length > 0,
    },
    {
      texto: 'Preencher a Cultura Organizacional (missão, visão, valores)',
      rota: 'cultura',
      feito: !!state.cultura.missao,
    },
    {
      texto: 'Publicar ao menos um Desenho de Cargo',
      rota: 'cargos',
      feito: state.cargos.some((c) => c.desenho.aprovado),
    },
    {
      texto: 'Convidar ao menos mais uma pessoa (RH, Gestor ou Colaborador)',
      rota: 'usuarios',
      feito: _perfisEmpresa.length >= 2,
    },
  ];
  const feitos = passos.filter((p) => p.feito).length;
  if (feitos === passos.length) return ''; // onboarding completo — some daqui, não fica poluindo o dashboard pra sempre

  const percentual = Math.round((feitos / passos.length) * 100);
  const primeiroAcesso = feitos === 0;
  return `
    <div class="card" style="border-left:3px solid var(--gold);">
      <h3>${primeiroAcesso ? 'Bem-vindo(a) à Plataforma NORTE! 👋' : 'Onboarding do tenant'} <small>${feitos} de ${passos.length} passos concluídos — siga a ordem abaixo pra deixar o sistema pronto pra operar</small></h3>
      <div style="background:var(--surface-2);border-radius:20px;height:8px;overflow:hidden;margin:10px 0 16px;">
        <div style="background:var(--gold);height:100%;width:${percentual}%;transition:width .3s ease;"></div>
      </div>
      ${passos
        .map(
          (p) => `
        <div class="pendencia-item" style="${p.feito ? 'opacity:.55;' : ''}">
          <span>${p.feito ? '✅' : '◻'} ${p.texto}</span>
          ${!p.feito ? `<button class="btn btn-sm" onclick="goto('${p.rota}')">Resolver →</button>` : ''}
        </div>
      `
        )
        .join('')}
    </div>`;
}
function diasDesdeAbertura(ciclo) {
  const hoje = new Date(new Date().toISOString().slice(0, 10));
  const abertura = new Date(ciclo.dataAbertura);
  return Math.round((hoje - abertura) / (1000 * 60 * 60 * 24));
}
function renderPendenciasRH() {
  const aguardandoRH = state.ciclos.filter(
    (c) =>
      (c.estado === 'Aberto' || c.estado === 'Em Consolidação') &&
      (c.tipoAvaliacao === 'ao_vivo' ? true : c.etapa === 'rh')
  );
  const pendencias = state.ciclos.filter((c) => c.estado === 'Pendência de Avaliador');
  const semCiclo = state.colaboradores.filter((p) => {
    const cargo = state.cargos.find((c) => c.id === p.cargoId);
    return (
      cargo?.desenho.aprovado &&
      !cargo.descontinuado &&
      p.unidadeId &&
      p.setorId &&
      p.gestorPerfilId &&
      !state.ciclos.some((c) => c.colaboradorId === p.id && c.estado !== 'Encerrado')
    );
  });
  // Alerta: ciclos abertos há mais de 15 dias sem conclusão.
  const ciclosAntigos = state.ciclos.filter(
    (c) =>
      (c.estado === 'Aberto' || c.estado === 'Em Consolidação' || c.estado === 'Pendência de Avaliador') &&
      diasDesdeAbertura(c) > 15
  );
  // Ciclo extraordinário (pós-promoção) com prazo vencendo nos próximos 7 dias.
  const promocaoVencendo = state.ciclos.filter((c) => {
    if (!c.extraordinario || c.estado === 'Encerrado') return false;
    const dias = diasAteVencimento(c);
    return dias !== null && dias >= 0 && dias <= 7;
  });
  if (
    !aguardandoRH.length &&
    !pendencias.length &&
    !semCiclo.length &&
    !ciclosAntigos.length &&
    !promocaoVencendo.length
  )
    return '';
  return `
    <div class="card" style="border-left:3px solid var(--gold);">
      <h3>Suas pendências agora</h3>
      ${aguardandoRH.length ? `<div class="pendencia-item"><span>Você tem <b>${aguardandoRH.length}</b> avaliação(ões) aguardando sua etapa</span><button class="btn btn-sm" onclick="goto('ciclos')">Avaliar →</button></div>` : ''}
      ${pendencias.length ? `<div class="pendencia-item"><span><b>${pendencias.length}</b> ciclo(s) com pendência de avaliador vencida</span><button class="btn btn-sm" onclick="goto('ciclos')">Resolver →</button></div>` : ''}
      ${semCiclo.length ? `<div class="pendencia-item"><span><b>${semCiclo.length}</b> colaborador(es) elegível(is) ainda sem ciclo aberto</span><button class="btn btn-sm" onclick="goto('ciclos')">Abrir ciclo →</button></div>` : ''}
      ${ciclosAntigos.length ? `<div class="pendencia-item"><span><b>${ciclosAntigos.length}</b> colaborador(es) estão com Ciclo pendente há mais de 15 dias</span><button class="btn btn-sm" onclick="goto('ciclos')">Ver →</button></div>` : ''}
      ${promocaoVencendo.length ? `<div class="pendencia-item"><span><b>${promocaoVencendo.length}</b> ciclo(s) extraordinário(s) pós-promoção (RN016) vencendo nos próximos 7 dias</span><button class="btn btn-sm" onclick="goto('ciclos')">Ver →</button></div>` : ''}
    </div>`;
}
function renderPendenciasGestor() {
  const minhaEquipe = state.colaboradores.filter((p) => p.gestorPerfilId === meuPerfilId);
  const aguardandoMim = state.ciclos.filter(
    (c) =>
      c.etapa === 'lider' &&
      (c.estado === 'Aberto' || c.estado === 'Em Consolidação') &&
      minhaEquipe.some((p) => p.id === c.colaboradorId)
  );
  const semFeedback = state.ciclos.filter(
    (c) => c.diagnostico && !c.reuniaoFeedback?.realizada && minhaEquipe.some((p) => p.id === c.colaboradorId)
  );

  // Progresso da avaliação da equipe nesta rodada (Fluxo de Navegação, Cap. 3.3).
  const ciclosDaEquipe = state.ciclos.filter(
    (c) => minhaEquipe.some((p) => p.id === c.colaboradorId) && c.estado !== 'Encerrado'
  );
  let progressoEquipe = '';
  if (ciclosDaEquipe.length) {
    // Já avaliado pelo Gestor quando o ciclo já passou da etapa 'lider' (está em 'rh') ou já tem diagnóstico.
    const concluidosPorMim = ciclosDaEquipe.filter((c) => c.etapa === 'rh' || !!c.diagnostico).length;
    const faltam = ciclosDaEquipe.length - concluidosPorMim;
    const percentual = Math.round((concluidosPorMim / ciclosDaEquipe.length) * 100);
    if (faltam > 0) {
      progressoEquipe = `<div class="pendencia-item"><span>Sua avaliação da equipe está <b>${percentual}%</b> concluída. Faltam <b>${faltam}</b> colaborador(es).</span><button class="btn btn-sm" onclick="goto('ciclos')">Continuar →</button></div>`;
    }
  }

  if (!aguardandoMim.length && !semFeedback.length && !progressoEquipe) return '';
  return `
    <div class="card" style="border-left:3px solid var(--gold);">
      <h3>Você tem pendências</h3>
      ${progressoEquipe}
      ${aguardandoMim.length ? `<div class="pendencia-item"><span>Você tem <b>${aguardandoMim.length}</b> avaliação(ões) da equipe aguardando você</span><button class="btn btn-sm" onclick="goto('ciclos')">Avaliar →</button></div>` : ''}
      ${semFeedback.length ? `<div class="pendencia-item"><span><b>${semFeedback.length}</b> reunião(ões) de feedback ainda não registrada(s)</span><button class="btn btn-sm" onclick="goto('ciclos')">Registrar →</button></div>` : ''}
    </div>`;
}
function renderPendenciasColaborador() {
  const meuRegistro = state.colaboradores.find((c) => c.perfilId === meuPerfilId);
  if (!meuRegistro) return '';
  const meusCiclos = state.ciclos.filter((c) => c.colaboradorId === meuRegistro.id);
  const minhaAutoavaliacao = meusCiclos.filter(
    (c) =>
      c.etapa === 'colaborador' &&
      c.tipoAvaliacao !== 'ao_vivo' &&
      (c.estado === 'Aberto' || c.estado === 'Em Consolidação')
  );
  const semFeedback = meusCiclos.filter((c) => c.diagnostico && !c.reuniaoFeedback?.realizada);
  if (!minhaAutoavaliacao.length && !semFeedback.length) return '';
  return `
    <div class="card" style="border-left:3px solid var(--gold);">
      <h3>Você tem pendências</h3>
      ${minhaAutoavaliacao.length ? `<div class="pendencia-item"><span>Sua <b>autoavaliação</b> está aguardando você</span><button class="btn btn-sm" onclick="abrirCiclo('${minhaAutoavaliacao[0].id}')">Responder →</button></div>` : ''}
      ${semFeedback.length ? `<div class="pendencia-item"><span>Sua reunião de feedback ainda não foi registrada</span><button class="btn btn-sm" onclick="abrirCiclo('${semFeedback[0].id}')">Ver ciclo →</button></div>` : ''}
    </div>`;
}

function pageDashboard() {
  const totalCiclos = state.ciclos.length;
  const abertos = state.ciclos.filter((c) => c.estado === 'Aberto' || c.estado === 'Em Consolidação').length;
  const pdisAtivos = state.ciclos.filter((c) => c.pdiDesenvolvimento || c.pdiMentalidade).length;
  const encerrados = state.ciclos.filter(
    (c) => c.estado === 'Encerrado' || c.estado === 'PDI Gerado' || c.estado === 'Em Acompanhamento'
  ).length;

  const roleTitle = {
    admin: 'Visão geral da organização — Administrador',
    rh: 'Painel operacional da metodologia — RH',
    gestor: 'Painel da minha equipe — Gestor',
    colaborador: 'Minha evolução — Colaborador',
  }[state.role];

  let body = '';
  if (state.role === 'colaborador') {
    body = renderPendenciasColaborador() + renderDashboardColaborador();
  } else if (state.role === 'gestor' && !meuEscopoEstendido) {
    body = renderMinhaAvaliacaoPendente() + renderPendenciasGestor() + renderDashboardGestor();
  } else if (state.role === 'gestor' && meuEscopoEstendido) {
    body =
      `<div class="notice info">Escopo estendido: você tem uma exceção explícita concedida pelo Administrador para ver os dados consolidados de toda a empresa, além da sua própria equipe.</div>` +
      renderMinhaAvaliacaoPendente() +
      renderPendenciasGestor() +
      renderDashboardAdmin(abertos, pdisAtivos, encerrados);
  } else if (state.role === 'rh') {
    body = renderMinhaAvaliacaoPendente() + renderPendenciasRH() + renderDashboardRH();
  } else {
    body =
      renderMinhaAvaliacaoPendente() + renderPendenciasAdmin() + renderDashboardAdmin(abertos, pdisAtivos, encerrados);
  }

  const meuNome = nomePorPerfilId(meuPerfilId);
  const iniciaisMeuNome =
    meuNome && meuNome !== 'Alguém (conta removida)'
      ? meuNome
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0])
          .join('')
          .toUpperCase()
      : '—';

  return `
    <div class="topo-pagina-inetris">
      <div>
        <h1>${roleTitle}</h1>
        <p class="page-desc" style="margin:2px 0 0;">A plataforma organiza, calcula e sugere — a decisão final permanece sempre humana.</p>
      </div>
      <div class="topo-pagina-acoes">
        ${
          STEPS.find((s) => s.id === 'colaboradores')
            ? `<div class="topo-pagina-busca"><input type="text" id="campoBuscaGlobal" placeholder="Buscar colaborador..." value="${escaparHtml(_termoBuscaGlobal)}" onkeydown="if(event.key==='Enter'){_termoBuscaGlobal=this.value.trim();goto('colaboradores');}" title="Digite o nome e pressione Enter" /></div>`
            : ''
        }
        <div class="topo-pagina-empresa" title="Empresa atual">${escaparHtml(state.empresa?.nomeFantasia) || 'Minha empresa'}</div>
        ${renderSinoNotificacoes()}
        <div class="topo-pagina-avatar" title="${escaparHtml(meuNome)}">${iniciaisMeuNome}</div>
      </div>
    </div>
    ${body}
  `;
}

/* ---------- Administrador: visão geral da empresa, indicadores estratégicos, evolução consolidada ---------- */
function renderDashboardAdmin(abertos, pdisAtivos, encerrados) {
  const unidades = state.estrutura.filter((n) => n.tipo === 'unidade');
  const porUnidade = unidades.map((u) => {
    const colabs = state.colaboradores.filter((p) => p.unidadeId === u.id && !p.inativo);
    const comDiag = colabs
      .map((p) => {
        const ultimo = state.ciclos
          .filter((c) => c.colaboradorId === p.id && c.diagnostico)
          .slice()
          .sort((a, b) => a.dataAbertura.localeCompare(b.dataAbertura))
          .pop();
        return ultimo ? ultimo.diagnostico.geral : null;
      })
      .filter(Boolean);
    const alavancar = comDiag.filter((g) => g === 'A').length;
    return {
      nome: u.nome,
      total: colabs.length,
      avaliados: comDiag.length,
      alavancar,
      coberturaPct: colabs.length ? Math.round((comDiag.length / colabs.length) * 100) : 0,
    };
  });

  // 7.5 — Indicadores Organizacionais: cargos com maior concentração de "Iniciar".
  const porCargo = state.cargos
    .map((cargo) => {
      const colabs = state.colaboradores.filter((p) => p.cargoId === cargo.id);
      const ultimasClassificacoes = colabs
        .map((p) => {
          const ultimo = state.ciclos
            .filter((c) => c.colaboradorId === p.id && c.diagnostico)
            .slice()
            .sort((a, b) => a.dataAbertura.localeCompare(b.dataAbertura))
            .pop();
          return ultimo ? ultimo.diagnostico.geral : null;
        })
        .filter(Boolean);
      const iniciar = ultimasClassificacoes.filter((g) => g === 'I').length;
      return {
        nome: cargo.nome,
        avaliados: ultimasClassificacoes.length,
        iniciar,
        percentual: ultimasClassificacoes.length ? Math.round((iniciar / ultimasClassificacoes.length) * 100) : 0,
      };
    })
    .filter((c) => c.avaliados > 0 && c.iniciar > 0)
    .sort((a, b) => b.percentual - a.percentual);

  // Distribuição geral por classificação IDA (mesmo cálculo do renderDistribuicaoIDA).
  const ciclosComDiag = state.ciclos.filter((c) => c.diagnostico && c.diagnostico.geral);
  const contagemIda = { I: 0, D: 0, A: 0 };
  ciclosComDiag.forEach((c) => contagemIda[c.diagnostico.geral]++);
  const totalIda = contagemIda.I + contagemIda.D + contagemIda.A;

  // Média geral da empresa (0 a 1) — usada no KPI "Resultado Geral".
  const mediasGerais = ciclosComDiag.map((c) => c.diagnostico.geralMedia).filter((v) => v !== null);
  const mediaGeralEmpresa = mediasGerais.length ? mediasGerais.reduce((a, b) => a + b, 0) / mediasGerais.length : null;

  // Média por pilar (N·O·R·T·E) de toda a empresa — alimenta o gráfico de
  // 5 dimensões (elemento assinatura da identidade INETRIS) no nível
  // consolidado, e a tabela "Desempenho por Pilar" logo abaixo.
  const somaPorPilar = { N: [], O: [], R: [], T: [], E: [] };
  ciclosComDiag.forEach((c) => {
    ['N', 'O', 'R', 'T', 'E'].forEach((p) => {
      const v = c.diagnostico.pilarMedia?.[p];
      if (v !== null && v !== undefined) somaPorPilar[p].push(v);
    });
  });
  const mediaPorPilar = {};
  ['N', 'O', 'R', 'T', 'E'].forEach((p) => {
    mediaPorPilar[p] = somaPorPilar[p].length
      ? somaPorPilar[p].reduce((a, b) => a + b, 0) / somaPorPilar[p].length
      : null;
  });

  // PDIs aprovados: dos ciclos com PDI gerado, quantos já foram aprovados.
  const ciclosComPdi = state.ciclos.filter((c) => c.pdiDesenvolvimento);
  const pdisAprovadosCount = ciclosComPdi.filter((c) => c.pdiAprovado).length;
  const pctPdiAprovados = ciclosComPdi.length ? Math.round((pdisAprovadosCount / ciclosComPdi.length) * 100) : 0;

  // Avaliações recentes — últimos ciclos consolidados, mais novo primeiro.
  const avaliacoesRecentes = state.ciclos
    .filter((c) => c.diagnostico)
    .slice()
    .sort((a, b) => b.dataAbertura.localeCompare(a.dataAbertura))
    .slice(0, 6)
    .map((c) => {
      const p = state.colaboradores.find((x) => x.id === c.colaboradorId);
      const cargo = state.cargos.find((x) => x.id === c.cargoId);
      const gestor = p ? nomePorPerfilId(p.gestorPerfilId) : '—';
      return { p, cargo, gestor, ciclo: c };
    });

  // Guarda os dados calculados pra os gráficos serem montados depois que o
  // HTML já estiver na tela (ver inicializarGraficosDashboard em 02-core-helpers.js)
  // Sparkline dos últimos 12 meses — mesmo elemento do card "Resultado Geral" na referência.
  const porMesAdmin = {};
  ciclosComDiag.forEach((c) => {
    const mes = c.dataAbertura.slice(0, 7);
    porMesAdmin[mes] = porMesAdmin[mes] || [];
    porMesAdmin[mes].push(c.diagnostico.geralMedia);
  });
  const mesesOrdenados = Object.keys(porMesAdmin)
    .sort()
    .slice(-12)
    .map((m) => porMesAdmin[m].reduce((a, b) => a + b, 0) / porMesAdmin[m].length);

  _dadosGraficosDashboardAdmin = {
    ida: [contagemIda.I, contagemIda.D, contagemIda.A],
    pilares: mediaPorPilar,
    cargosRisco: porCargo.slice(0, 4),
    sparkline: mesesOrdenados,
  };

  return `
    ${
      meuPapelReal === 'owner'
        ? `
    <div class="card" style="border-left:3px solid var(--gold);">
      <h3>Ambiente de testes <small>Preenche a empresa com estrutura, cultura, cargos publicados, colaboradores e um ciclo aberto — não apaga nada existente</small></h3>
      <button class="btn" onclick="gerarDadosTeste()">Gerar dados de teste</button>
    </div>
    `
        : ''
    }
    <div class="painel-kpi-inetris">
      <div class="kpi-card-inetris" style="flex-direction:column;align-items:stretch;">
        <div style="display:flex;gap:12px;">
          <div class="kpi-card-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z"/></svg></div>
          <div>
            <div class="kpi-card-label">Resultado geral</div>
            <div class="kpi-card-valor">${mediaGeralEmpresa !== null ? mediaGeralEmpresa.toFixed(2) : '—'} <span class="kpi-card-meta">/ 1,00</span></div>
            <div class="kpi-card-nota ${mediaGeralEmpresa !== null && mediaGeralEmpresa >= 0.67 ? 'boa' : ''}">${mediaGeralEmpresa !== null ? pillLabel(classificar(mediaGeralEmpresa)) : 'Sem diagnóstico ainda'}</div>
          </div>
        </div>
        ${mesesOrdenados.length > 1 ? '<div class="kpi-sparkline-wrap"><canvas id="sparklineAdmin"></canvas></div><div class="kpi-card-rodape">Últimos ' + mesesOrdenados.length + ' meses</div>' : ''}
      </div>
      <div class="kpi-card-inetris" style="flex-direction:column;align-items:stretch;">
        <div style="display:flex;gap:12px;">
          <div class="kpi-card-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 12l2 2 4-4"/></svg></div>
          <div>
            <div class="kpi-card-label">Colaboradores avaliados</div>
            <div class="kpi-card-valor">${totalIda ? Math.round((totalIda / state.colaboradores.length) * 100) : 0}%</div>
            <div class="kpi-card-nota">${totalIda} de ${state.colaboradores.length}</div>
          </div>
        </div>
        <div class="kpi-progresso-trilha"><div class="kpi-progresso-fill" style="width:${totalIda ? Math.min(100, Math.round((totalIda / state.colaboradores.length) * 100)) : 0}%;"></div></div>
        <div class="kpi-card-rodape">Meta: 90%</div>
      </div>
      <div class="kpi-card-inetris">
        <div class="kpi-card-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></div>
        <div>
          <div class="kpi-card-label">PDIs em andamento</div>
          <div class="kpi-card-valor">${pdisAtivos}</div>
          <div class="kpi-card-nota">Em progresso</div>
          <div class="kpi-card-nota">Total de ativos: ${ciclosComPdi.length}</div>
        </div>
      </div>
    </div>

    <div class="painel-visao-geral" style="grid-template-columns:1.2fr 0.8fr;">
      <div class="grafico-card">
        <h4>Desempenho por dimensão <span class="info-icone" title="Média de cada pilar N·O·R·T·E, escala IDA de 0 a 1, considerando todos os ciclos com diagnóstico já gerado.">i</span> <small>Média da empresa, escala 0 a 1</small></h4>
        ${somaPorPilar.N.length ? `<div style="position:relative;width:100%;height:260px;"><canvas id="radarAdmin" role="img" aria-label="Radar de 5 pilares da empresa"></canvas></div>` : '<div class="empty">Sem diagnósticos ainda.</div>'}
      </div>
      <div class="grafico-card">
        <h4>Distribuição das avaliações</h4>
        ${
          totalIda
            ? `<div class="grafico-donut-wrap">
          <div class="grafico-donut-canvas"><canvas id="donutIda" role="img" aria-label="Rosca com a distribuição geral: ${contagemIda.I} Iniciar, ${contagemIda.D} Desenvolver, ${contagemIda.A} Alavancar"></canvas>
            <div class="grafico-donut-centro">${totalIda}<span class="grafico-donut-centro-legenda">avaliados</span></div>
          </div>
          <div class="grafico-legenda">
            <span><span class="dot" style="background:var(--iniciar);"></span>Iniciar ${Math.round((contagemIda.I / totalIda) * 100)}% (${contagemIda.I})</span>
            <span><span class="dot" style="background:var(--desenvolver);"></span>Desenvolver ${Math.round((contagemIda.D / totalIda) * 100)}% (${contagemIda.D})</span>
            <span><span class="dot" style="background:var(--alavancar);"></span>Alavancar ${Math.round((contagemIda.A / totalIda) * 100)}% (${contagemIda.A})</span>
          </div>
        </div>`
            : '<div class="empty">Sem diagnósticos ainda.</div>'
        }
      </div>
    </div>

    <div class="painel-visao-geral" style="grid-template-columns:1fr 1fr;">
      <div class="card" style="margin-bottom:0;">
        <h3>Desempenho por dimensão</h3>
        <table><thead><tr><th>Dimensão</th><th>Resultado</th><th>Impacto</th></tr></thead><tbody>
          ${['N', 'O', 'R', 'T', 'E']
            .map((p) => {
              const v = mediaPorPilar[p];
              if (v === null)
                return `<tr><td>${PILAR_LABEL[p]}</td><td class="small-muted">Sem dado</td><td class="small-muted">—</td></tr>`;
              const sig = classificar(v);
              const resultado =
                sig === 'A' ? 'Domínio consolidado' : sig === 'D' ? 'Em desenvolvimento' : 'Abaixo do esperado';
              const impacto = sig === 'I' ? 'Alto' : sig === 'D' ? 'Médio' : 'Baixo';
              return `<tr><td>${PILAR_LABEL[p]}</td><td class="small-muted">${resultado}</td><td><span class="pill ${sig === 'I' ? 'pill-iniciar' : sig === 'D' ? 'pill-desenvolver' : 'pill-alavancar'}">${impacto}</span></td></tr>`;
            })
            .join('')}
        </tbody></table>
        <button class="btn btn-ghost btn-sm ver-todas-link" onclick="goto('diagnostico')">Ver todas as dimensões →</button>
      </div>
      <div class="card" style="margin-bottom:0;">
        <h3>Oportunidades de desenvolvimento</h3>
        <table><thead><tr><th>Dimensão</th><th>Oportunidade</th><th>Prioridade</th></tr></thead><tbody>
          ${['N', 'O', 'R', 'T', 'E']
            .map((p) => {
              const v = mediaPorPilar[p];
              if (v === null)
                return `<tr><td>${PILAR_LABEL[p]}</td><td class="small-muted">Sem dado ainda</td><td class="small-muted">—</td></tr>`;
              const sig = classificar(v);
              const oportunidade =
                sig === 'A'
                  ? 'Manter reconhecimento e continuidade'
                  : sig === 'D'
                    ? 'Reforçar ações do Banco de Ações'
                    : 'Priorizar PDI de Desenvolvimento';
              const prioridade = sig === 'I' ? 'Alta' : sig === 'D' ? 'Média' : 'Baixa';
              return `<tr><td>${PILAR_LABEL[p]}</td><td class="small-muted">${oportunidade}</td><td><span class="pill ${sig === 'I' ? 'pill-iniciar' : sig === 'D' ? 'pill-desenvolver' : 'pill-alavancar'}">${prioridade}</span></td></tr>`;
            })
            .join('')}
        </tbody></table>
        <button class="btn btn-ghost btn-sm ver-todas-link" onclick="goto('diagnostico')">Ver todas as oportunidades →</button>
      </div>
    </div>

    <div class="card">
      <h3>Avaliações recentes</h3>
      ${
        avaliacoesRecentes.length
          ? `<table><thead><tr><th></th><th>Colaborador</th><th>Cargo</th><th>Área</th><th>Avaliador</th><th>Dimensão</th><th>Nota</th><th>Status</th><th>Data</th><th></th></tr></thead><tbody>
        ${avaliacoesRecentes
          .map((a) => {
            const area = state.estrutura.find((n) => n.id === a.p?.setorId)?.nome || '—';
            const dm = a.ciclo.diagnostico.dimensaoMedia || {};
            const dimensoesValidas = Object.entries(dm).filter(([, v]) => v !== null);
            const piorDimensao = dimensoesValidas.length ? dimensoesValidas.sort((x, y) => x[1] - y[1])[0][0] : 'Geral';
            const iniciaisAval = a.p
              ? a.p.nome
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((s) => s[0])
                  .join('')
                  .toUpperCase()
              : '—';
            return `<tr><td><span class="tree-node-avatar">${iniciaisAval}</span></td><td><b>${a.p ? escaparHtml(a.p.nome) : '—'}</b></td><td class="small-muted">${a.cargo ? escaparHtml(a.cargo.nome) : '—'}</td><td class="small-muted">${escaparHtml(area)}</td><td class="small-muted">${a.gestor}</td><td class="small-muted">${piorDimensao}</td><td class="small-muted" style="font-family:var(--mono);">${a.ciclo.diagnostico.geralMedia !== null ? a.ciclo.diagnostico.geralMedia.toFixed(2) : '—'}</td><td><span class="pill ${pillClass(a.ciclo.diagnostico.geral)}">${pillLabel(a.ciclo.diagnostico.geral)}</span></td><td class="small-muted">${a.ciclo.dataAbertura}</td><td><button class="btn-menu-pontos" onclick="abrirCiclo('${a.ciclo.id}')" title="Abrir ciclo">⋮</button></td></tr>`;
          })
          .join('')}
      </tbody></table>
      <button class="btn btn-ghost btn-sm ver-todas-link" onclick="goto('ciclos')">Ver todas as avaliações →</button>`
          : '<div class="empty">Nenhum ciclo aberto ainda. Vá em <b>Ciclos de Avaliação</b> para iniciar o primeiro.</div>'
      }
    </div>
  `;
}

/* ---------- RH: avaliações em andamento, PDIs ativos, competências críticas, relatórios de desenvolvimento ---------- */
function renderDashboardRH() {
  const emAndamento = state.ciclos.filter((c) => c.estado === 'Aberto' || c.estado === 'Em Consolidação');
  const pendentes = state.ciclos.filter((c) => c.estado === 'Pendência de Avaliador');
  const pdisAtivos = state.ciclos.filter((c) => c.pdiDesenvolvimento?.length || c.pdiMentalidade);

  const contagemCriticas = {};
  state.ciclos
    .filter((c) => c.diagnostico)
    .forEach((c) => {
      (c.diagnostico.competenciasCriticas || []).forEach((nome) => {
        contagemCriticas[nome] = (contagemCriticas[nome] || 0) + 1;
      });
    });
  const criticasOrdenadas = Object.entries(contagemCriticas)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // 7.2 — Colaboradores em risco: classificação baixa (fora de Alavancar) em
  // pelo menos os 2 últimos ciclos consolidados, não só um resultado isolado.
  const colaboradoresEmRisco = state.colaboradores.filter((p) => {
    const ciclosDoColab = state.ciclos
      .filter((c) => c.colaboradorId === p.id && c.diagnostico)
      .slice()
      .sort((a, b) => b.dataAbertura.localeCompare(a.dataAbertura));
    if (ciclosDoColab.length < 2) return false;
    return ciclosDoColab.slice(0, 2).every((c) => c.diagnostico.geral !== 'A');
  });

  // 5.4 — alerta de ciclo anual vencido: mais de 12 meses sem nenhum ciclo.
  const hoje = new Date();
  const cicloVencido = state.colaboradores.filter((p) => {
    const ciclosDoColab = state.ciclos
      .filter((c) => c.colaboradorId === p.id)
      .slice()
      .sort((a, b) => b.dataAbertura.localeCompare(a.dataAbertura));
    if (!ciclosDoColab.length) return false; // nunca avaliado é outra situação, não "vencido"
    const dias = Math.round((hoje - new Date(ciclosDoColab[0].dataAbertura)) / (1000 * 60 * 60 * 24));
    return dias > 365;
  });

  const comDiagRH = state.ciclos.filter((c) => c.diagnostico && c.diagnostico.geral);
  const contagemIdaRH = { I: 0, D: 0, A: 0 };
  comDiagRH.forEach((c) => contagemIdaRH[c.diagnostico.geral]++);
  const totalIdaRH = contagemIdaRH.I + contagemIdaRH.D + contagemIdaRH.A;
  const totalColabAtivos = state.colaboradores.filter((p) => !p.inativo).length;
  const pctSemRisco = totalColabAtivos
    ? Math.round(((totalColabAtivos - colaboradoresEmRisco.length) / totalColabAtivos) * 100)
    : 100;

  // Média por pilar (N·O·R·T·E) — mesmo elemento assinatura do Admin,
  // aqui em nível de toda a empresa (RH também acompanha isso de perto).
  const somaPorPilarRH = { N: [], O: [], R: [], T: [], E: [] };
  comDiagRH.forEach((c) => {
    ['N', 'O', 'R', 'T', 'E'].forEach((p) => {
      const v = c.diagnostico.pilarMedia?.[p];
      if (v !== null && v !== undefined) somaPorPilarRH[p].push(v);
    });
  });
  const mediaPorPilarRH = {};
  ['N', 'O', 'R', 'T', 'E'].forEach((p) => {
    mediaPorPilarRH[p] = somaPorPilarRH[p].length
      ? somaPorPilarRH[p].reduce((a, b) => a + b, 0) / somaPorPilarRH[p].length
      : null;
  });

  _dadosGraficosDashboardRH = {
    ida: [contagemIdaRH.I, contagemIdaRH.D, contagemIdaRH.A],
    criticas: criticasOrdenadas.slice(0, 6),
    pctSemRisco,
    pilares: mediaPorPilarRH,
  };

  return `
    <div class="painel-kpi-inetris">
      <div class="kpi-card-inetris">
        <div class="kpi-card-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 12l2 2 4-4"/></svg></div>
        <div>
          <div class="kpi-card-label">Avaliações em andamento</div>
          <div class="kpi-card-valor">${emAndamento.length}</div>
        </div>
      </div>
      <div class="kpi-card-inetris">
        <div class="kpi-card-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg></div>
        <div>
          <div class="kpi-card-label">Pendências de avaliador</div>
          <div class="kpi-card-valor">${pendentes.length}</div>
        </div>
      </div>
      <div class="kpi-card-inetris">
        <div class="kpi-card-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></div>
        <div>
          <div class="kpi-card-label">PDIs ativos</div>
          <div class="kpi-card-valor">${pdisAtivos.length}</div>
        </div>
      </div>
      <div class="kpi-card-inetris">
        <div class="kpi-card-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/></svg></div>
        <div>
          <div class="kpi-card-label">Colaboradores sem risco</div>
          <div class="kpi-card-valor">${pctSemRisco}%</div>
          <div class="kpi-card-nota">Fora do critério 7.2</div>
        </div>
      </div>
    </div>

    <div class="painel-visao-geral" style="grid-template-columns:1.2fr 0.8fr;">
      <div class="grafico-card">
        <h4>Desempenho por dimensão <small>Média da empresa, escala 0 a 1</small></h4>
        ${somaPorPilarRH.N.length ? `<div style="position:relative;width:100%;height:260px;"><canvas id="radarRH" role="img" aria-label="Radar de 5 pilares da empresa"></canvas></div>` : '<div class="empty">Sem diagnósticos ainda.</div>'}
      </div>
      <div class="grafico-card">
        <h4>Classificação geral <small>${totalIdaRH} colaboradores com diagnóstico</small></h4>
        ${
          totalIdaRH
            ? `<div class="grafico-donut-wrap">
          <div class="grafico-donut-canvas"><canvas id="rhDonutIda" role="img" aria-label="Rosca com a distribuição geral: ${contagemIdaRH.I} Iniciar, ${contagemIdaRH.D} Desenvolver, ${contagemIdaRH.A} Alavancar"></canvas>
            <div class="grafico-donut-centro">${totalColabAtivos}<span class="grafico-donut-centro-legenda">colaboradores</span></div>
          </div>
          <div class="grafico-legenda">
            <span><span class="dot" style="background:var(--iniciar);"></span>Iniciar ${Math.round((contagemIdaRH.I / totalIdaRH) * 100)}%</span>
            <span><span class="dot" style="background:var(--desenvolver);"></span>Desenvolver ${Math.round((contagemIdaRH.D / totalIdaRH) * 100)}%</span>
            <span><span class="dot" style="background:var(--alavancar);"></span>Alavancar ${Math.round((contagemIdaRH.A / totalIdaRH) * 100)}%</span>
          </div>
        </div>`
            : '<div class="empty">Sem diagnósticos ainda.</div>'
        }
      </div>
    </div>

    <div class="card">
      <h3>Competências críticas mais recorrentes <small>Base pra priorizar ações de desenvolvimento</small></h3>
      ${
        criticasOrdenadas.length
          ? `<table><thead><tr><th>Indicador</th><th>Ocorrências</th></tr></thead><tbody>
        ${criticasOrdenadas.map(([nome, n]) => `<tr><td>${escaparHtml(nome)}</td><td class="small-muted">${n}</td></tr>`).join('')}
      </tbody></table>`
          : '<div class="empty">Nenhuma competência crítica recorrente identificada ainda.</div>'
      }
    </div>

    ${
      pendentes.length
        ? `
    <div class="card" style="border-left:3px solid var(--iniciar);">
      <h3>Requer sua ação — Pendências de avaliador</h3>
      ${renderCiclosTableInteractive(pendentes)}
    </div>`
        : ''
    }
    <div class="card">
      <h3>Avaliações em andamento</h3>
      ${emAndamento.length ? renderCiclosTableInteractive(emAndamento) : '<div class="empty">Nenhuma avaliação em andamento no momento.</div>'}
    </div>
    ${
      colaboradoresEmRisco.length
        ? `
    <div class="card" style="border-left:3px solid var(--iniciar);">
      <h3>Colaboradores em risco <small>Classificação fora de Alavancar nos 2 últimos ciclos consolidados (7.2)</small></h3>
      <table><thead><tr><th>Colaborador</th><th>Cargo</th><th>Últimas classificações</th></tr></thead><tbody>
        ${colaboradoresEmRisco
          .map((p) => {
            const cargo = state.cargos.find((c) => c.id === p.cargoId);
            const ultimos = state.ciclos
              .filter((c) => c.colaboradorId === p.id && c.diagnostico)
              .slice()
              .sort((a, b) => b.dataAbertura.localeCompare(a.dataAbertura))
              .slice(0, 2);
            return `<tr><td><b>${escaparHtml(p.nome)}</b></td><td class="small-muted">${cargo ? escaparHtml(cargo.nome) : '—'}</td>
            <td>${ultimos.map((c) => `<span class="pill ${pillClass(c.diagnostico.geral)}" style="margin-right:4px;">${pillLabel(c.diagnostico.geral)}</span>`).join('')}</td></tr>`;
          })
          .join('')}
      </tbody></table>
    </div>`
        : ''
    }
    ${
      cicloVencido.length
        ? `
    <div class="card" style="border-left:3px solid var(--desenvolver);">
      <h3>Ciclo anual vencido <small>Mais de 12 meses sem nenhuma avaliação (regra 5.4)</small></h3>
      <table><thead><tr><th>Colaborador</th><th>Última avaliação</th></tr></thead><tbody>
        ${cicloVencido
          .map((p) => {
            const ultimo = state.ciclos
              .filter((c) => c.colaboradorId === p.id)
              .slice()
              .sort((a, b) => b.dataAbertura.localeCompare(a.dataAbertura))[0];
            return `<tr><td><b>${escaparHtml(p.nome)}</b></td><td class="small-muted">${ultimo.dataAbertura}</td></tr>`;
          })
          .join('')}
      </tbody></table>
    </div>`
        : ''
    }
    <div class="card">
      <h3>Competências críticas — detalhe <small>Base para priorizar ações de desenvolvimento (relatório de desenvolvimento)</small></h3>
      ${
        criticasOrdenadas.length
          ? `
        <table><thead><tr><th>Indicador</th><th>Ocorrências</th></tr></thead><tbody>
          ${criticasOrdenadas.map(([nome, n]) => `<tr><td>${nome}</td><td class="small-muted">${n}</td></tr>`).join('')}
        </tbody></table>
      `
          : '<div class="empty">Nenhuma competência crítica recorrente identificada ainda.</div>'
      }
      <button class="btn btn-sm btn-ghost" style="margin-top:10px;" onclick="goto('relatorios')">Ver relatórios completos →</button>
    </div>
  `;
}

/* ---------- Gestor: desempenho da equipe, evolução dos colaboradores diretos, PDIs ---------- */
function renderDashboardGestor() {
  const minhaEquipe = state.colaboradores.filter((p) => p.gestorPerfilId === meuPerfilId);
  if (!minhaEquipe.length)
    return '<div class="empty">Nenhum colaborador está vinculado a você como gestor direto ainda. Peça ao RH ou Administrador para fazer essa vinculação em "Colaboradores".</div>';

  const meusCiclos = state.ciclos.filter((c) => minhaEquipe.some((p) => p.id === c.colaboradorId));
  const abertosEquipe = meusCiclos.filter((c) => c.estado === 'Aberto' || c.estado === 'Em Consolidação').length;
  const pdisEquipe = meusCiclos.filter((c) => c.pdiDesenvolvimento?.length || c.pdiMentalidade);
  const mentalidadePendentes = meusCiclos.filter(
    (c) => c.diagnostico && pdiMentalidadeNaoIniciado(c) && c.estado !== 'Encerrado'
  ).length;

  const comDiagEquipe = meusCiclos.filter((c) => c.diagnostico && c.diagnostico.geral);
  const contagemIdaEquipe = { I: 0, D: 0, A: 0 };
  comDiagEquipe.forEach((c) => contagemIdaEquipe[c.diagnostico.geral]++);
  const totalIdaEquipe = contagemIdaEquipe.I + contagemIdaEquipe.D + contagemIdaEquipe.A;

  // Ranking da equipe por Potencial (última medição) — mesma lógica do Mapa de Sucessão.
  const potencialEquipe = minhaEquipe
    .map((p) => ({ nome: p.nome, potencial: ultimoPotencialDoColaborador(p.id) }))
    .filter((p) => p.potencial !== null)
    .sort((a, b) => b.potencial - a.potencial)
    .slice(0, 6);

  // Média por pilar (N·O·R·T·E) da própria equipe — mesmo elemento
  // assinatura usado no Admin e no RH, aqui restrito a quem o Gestor avalia.
  const somaPorPilarEquipe = { N: [], O: [], R: [], T: [], E: [] };
  comDiagEquipe.forEach((c) => {
    ['N', 'O', 'R', 'T', 'E'].forEach((p) => {
      const v = c.diagnostico.pilarMedia?.[p];
      if (v !== null && v !== undefined) somaPorPilarEquipe[p].push(v);
    });
  });
  const mediaPorPilarEquipe = {};
  ['N', 'O', 'R', 'T', 'E'].forEach((p) => {
    mediaPorPilarEquipe[p] = somaPorPilarEquipe[p].length
      ? somaPorPilarEquipe[p].reduce((a, b) => a + b, 0) / somaPorPilarEquipe[p].length
      : null;
  });

  _dadosGraficosDashboardGestor = {
    ida: [contagemIdaEquipe.I, contagemIdaEquipe.D, contagemIdaEquipe.A],
    potencial: potencialEquipe,
    pilares: mediaPorPilarEquipe,
  };

  return `
    <div class="painel-kpi-inetris">
      <div class="kpi-card-inetris">
        <div class="kpi-card-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
        <div>
          <div class="kpi-card-label">Colaboradores na minha equipe</div>
          <div class="kpi-card-valor">${minhaEquipe.length}</div>
        </div>
      </div>
      <div class="kpi-card-inetris">
        <div class="kpi-card-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 12l2 2 4-4"/></svg></div>
        <div>
          <div class="kpi-card-label">Ciclos em andamento</div>
          <div class="kpi-card-valor">${abertosEquipe}</div>
        </div>
      </div>
      <div class="kpi-card-inetris">
        <div class="kpi-card-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></div>
        <div>
          <div class="kpi-card-label">PDIs ativos na equipe</div>
          <div class="kpi-card-valor">${pdisEquipe.length}</div>
        </div>
      </div>
    </div>
    ${mentalidadePendentes ? `<div class="notice" style="border-left-color:var(--iniciar);">⚠ ${mentalidadePendentes} PDI(s) de Mentalidade pendente(s) — obrigatórios em todo ciclo (RN020).</div>` : ''}

    <div class="painel-visao-geral" style="grid-template-columns:1.2fr 0.8fr;">
      <div class="grafico-card">
        <h4>Desempenho por dimensão <small>Média da equipe, escala 0 a 1</small></h4>
        ${somaPorPilarEquipe.N.length ? `<div style="position:relative;width:100%;height:260px;"><canvas id="radarGestor" role="img" aria-label="Radar de 5 pilares da equipe"></canvas></div>` : '<div class="empty">Sem diagnósticos ainda.</div>'}
      </div>
      <div class="grafico-card">
        <h4>Classificação da minha equipe <small>${totalIdaEquipe} avaliações com diagnóstico</small></h4>
        ${
          totalIdaEquipe
            ? `<div class="grafico-donut-wrap">
          <div class="grafico-donut-canvas"><canvas id="gestorDonutIda" role="img" aria-label="Rosca com a distribuição da equipe: ${contagemIdaEquipe.I} Iniciar, ${contagemIdaEquipe.D} Desenvolver, ${contagemIdaEquipe.A} Alavancar"></canvas>
            <div class="grafico-donut-centro">${minhaEquipe.length}<span class="grafico-donut-centro-legenda">na equipe</span></div>
          </div>
          <div class="grafico-legenda">
            <span><span class="dot" style="background:var(--iniciar);"></span>Iniciar ${Math.round((contagemIdaEquipe.I / totalIdaEquipe) * 100)}%</span>
            <span><span class="dot" style="background:var(--desenvolver);"></span>Desenvolver ${Math.round((contagemIdaEquipe.D / totalIdaEquipe) * 100)}%</span>
            <span><span class="dot" style="background:var(--alavancar);"></span>Alavancar ${Math.round((contagemIdaEquipe.A / totalIdaEquipe) * 100)}%</span>
          </div>
        </div>`
            : '<div class="empty">Sem diagnósticos ainda.</div>'
        }
      </div>
    </div>

    <div class="card">
      <h3>Potencial da equipe <small>Ranking pela última Dimensão de Potencial medida</small></h3>
      ${potencialEquipe.length ? `<div class="grafico-canvas-lg" style="height:${Math.max(110, potencialEquipe.length * 34)}px;"><canvas id="gestorBarPotencial" role="img" aria-label="Ranking dos colaboradores da equipe por Potencial"></canvas></div>` : '<div class="empty">Nenhum colaborador da equipe com diagnóstico ainda.</div>'}
    </div>

    <div class="card">
      <h3>Desempenho e evolução da equipe <small>Última classificação de cada colaborador, comparada com o ciclo anterior</small></h3>
      <table><thead><tr><th>Colaborador</th><th>Cargo</th><th>Ciclo anterior</th><th>Ciclo atual</th><th>Evolução</th><th>PDI</th></tr></thead><tbody>
        ${minhaEquipe
          .map((p) => {
            const cargo = state.cargos.find((c) => c.id === p.cargoId);
            const historico = state.ciclos
              .filter((c) => c.colaboradorId === p.id && c.diagnostico)
              .slice()
              .sort((a, b) => a.dataAbertura.localeCompare(b.dataAbertura));
            const ultimo = historico[historico.length - 1];
            const anterior = historico[historico.length - 2];
            const temPdi = ultimo && (ultimo.pdiDesenvolvimento?.length || ultimo.pdiMentalidade);
            const ordemIDA = { I: 0, D: 1, A: 2 };
            let evolucao = '<span class="small-muted">—</span>';
            if (ultimo && anterior) {
              const diff = ordemIDA[ultimo.diagnostico.geral] - ordemIDA[anterior.diagnostico.geral];
              evolucao =
                diff > 0
                  ? '<span style="color:var(--alavancar);">↑ Melhorou</span>'
                  : diff < 0
                    ? '<span style="color:var(--iniciar);">↓ Piorou</span>'
                    : '<span class="small-muted">→ Manteve</span>';
            }
            return `<tr>
            <td><b>${escaparHtml(p.nome)}</b></td>
            <td class="small-muted">${cargo ? cargo.nome : '—'}</td>
            <td>${anterior ? `<span class="pill ${pillClass(anterior.diagnostico.geral)}">${pillLabel(anterior.diagnostico.geral)}</span>` : '<span class="small-muted">Sem ciclo anterior</span>'}</td>
            <td>${ultimo ? `<span class="pill ${pillClass(ultimo.diagnostico.geral)}">${pillLabel(ultimo.diagnostico.geral)}</span>` : '<span class="small-muted">Sem diagnóstico ainda</span>'}</td>
            <td>${evolucao}</td>
            <td class="small-muted">${temPdi ? 'Ativo — acompanhar' : '—'}</td>
          </tr>`;
          })
          .join('')}
      </tbody></table>
    </div>
    <div class="card">
      <h3>Minha equipe — ciclos</h3>
      ${meusCiclos.length ? renderCiclosTableInteractive(meusCiclos) : '<div class="empty">Nenhum ciclo aberto para sua equipe ainda.</div>'}
    </div>
  `;
}

/* ---------- Colaborador: histórico pessoal, resultados, evolução, PDI próprio ---------- */
function renderDashboardColaborador() {
  const meuRegistro = state.colaboradores.find((c) => c.perfilId === meuPerfilId);
  if (!meuRegistro)
    return '<div class="empty">Sua conta ainda não foi vinculada a um registro de colaborador. Peça ao RH ou Administrador para fazer essa vinculação em "Colaboradores".</div>';

  const meuCargo = state.cargos.find((c) => c.id === meuRegistro.cargoId);
  const meusCiclos = state.ciclos
    .filter((c) => c.colaboradorId === meuRegistro.id)
    .slice()
    .sort((a, b) => a.dataAbertura.localeCompare(b.dataAbertura));
  const cicloAtual = meusCiclos.find((c) => c.estado !== 'Encerrado') || meusCiclos[meusCiclos.length - 1];
  const historico = meusCiclos.filter((c) => c.diagnostico);

  let pctPdiPessoal = null;
  if (cicloAtual?.pdiDesenvolvimento?.length) {
    const concluidas = cicloAtual.pdiDesenvolvimento.filter((a) => !!a.validadoEm).length;
    pctPdiPessoal = Math.round((concluidas / cicloAtual.pdiDesenvolvimento.length) * 100);
  }
  _dadosGraficosDashboardColaborador = { pctPdiPessoal };

  return `
    <div class="card">
      <h3>${escaparHtml(meuRegistro.nome)} <small>${meuCargo ? escaparHtml(meuCargo.nome) : '—'}</small></h3>
      ${
        cicloAtual
          ? `
        <p class="page-desc">Ciclo atual: <b>${cicloAtual.estado}</b></p>
        ${cicloAtual.diagnostico ? diagnosticoSummaryHTML(cicloAtual) : '<p class="small-muted">Sua primeira avaliação ainda não foi concluída.</p>'}
        ${cicloAtual.diagnostico ? `<button class="btn btn-sm" style="margin-top:10px;" onclick="abrirCiclo('${cicloAtual.id}')">Ver meu PDI completo →</button>` : ''}
      `
          : '<div class="empty">Nenhum ciclo de avaliação aberto no momento.</div>'
      }
    </div>
    ${
      pctPdiPessoal !== null
        ? `
    <div class="card" style="align-items:center;display:flex;flex-direction:column;">
      <h4 style="align-self:flex-start;margin-bottom:8px;">Meu PDI de Desenvolvimento <small>Ações já concluídas no ciclo atual</small></h4>
      <div class="grafico-gauge-wrap"><canvas id="colabGaugePdi" role="img" aria-label="Medidor mostrando ${pctPdiPessoal}% das ações do meu PDI já concluídas"></canvas>
        <div class="grafico-gauge-numero">${pctPdiPessoal}%</div>
      </div>
    </div>`
        : ''
    }
    ${
      historico.length > 1
        ? `
    <div class="card">
      <h3>Minha trajetória <small>Resultado, Comportamento e Potencial ao longo dos ciclos</small></h3>
      ${renderGraficoTrajetoriaIDA(historico)}
    </div>
    <div class="card">
      <h3>Minha evolução ao longo do tempo</h3>
      <table><thead><tr><th>Data</th><th>Classificação geral</th></tr></thead><tbody>
        ${historico.map((c) => `<tr><td class="small-muted">${c.dataAbertura}</td><td><span class="pill ${pillClass(c.diagnostico.geral)}">${pillLabel(c.diagnostico.geral)}</span></td></tr>`).join('')}
      </tbody></table>
    </div>`
        : ''
    }
    ${(() => {
      const meusCheckins = state.feedbackContinuo
        .filter((f) => f.colaboradorId === meuRegistro.id)
        .slice()
        .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
      if (!meusCheckins.length) return '';
      return `
      <div class="card">
        <h3>Meus check-ins <small>Registro informal do meu Gestor — não pontua, não afeta minha avaliação formal</small></h3>
        ${meusCheckins
          .map(
            (f) => `
          <div style="padding:10px 0;border-top:1px solid var(--line);">
            <div class="small-muted" style="font-size:11px;">${new Date(f.criadoEm).toLocaleString('pt-BR')}</div>
            <div style="font-size:13px;margin-top:4px;">${escaparHtml(f.texto)}</div>
          </div>
        `
          )
          .join('')}
      </div>`;
    })()}
  `;
}

function renderDistribuicaoIDA() {
  const comDiag = state.ciclos.filter((c) => c.diagnostico && c.diagnostico.geral); // BUG CORRIGIDO: exclui geral null/undefined em vez de somar como Alavancar
  if (!comDiag.length) return '<div class="empty">Ainda não há diagnósticos gerados para consolidar.</div>';
  let I = 0,
    D = 0,
    A = 0;
  comDiag.forEach((c) => {
    const g = c.diagnostico.geral;
    if (g === 'I') I++;
    else if (g === 'D') D++;
    else if (g === 'A') A++;
  });
  const total = I + D + A;
  return `
  <div style="display:flex;gap:10px;">
    ${[
      ['Iniciar', I, 'iniciar'],
      ['Desenvolver', D, 'desenvolver'],
      ['Alavancar', A, 'alavancar'],
    ]
      .map(
        ([l, n, cls]) => `
      <div style="flex:1;background:var(--${cls}-soft);border:1px solid var(--${cls});border-radius:8px;padding:14px;text-align:center;">
        <div style="font-family:var(--serif-display);font-size:22px;color:var(--${cls});font-weight:700;">${n} <span style="font-size:14px;font-weight:400;">(${total ? Math.round((n / total) * 100) : 0}%)</span></div>
        <div class="small-muted">${l}</div>
      </div>
    `
      )
      .join('')}
  </div>`;
}

function renderCiclosTable() {
  return `<table><thead><tr><th>Colaborador</th><th>Cargo</th><th>Estado</th><th>Abertura</th><th></th></tr></thead><tbody>
    ${state.ciclos
      .map((c) => {
        const p = state.colaboradores.find((x) => x.id === c.colaboradorId);
        const cargo = state.cargos.find((x) => x.id === c.cargoId);
        return `<tr>
        <td>${p ? p.nome : '—'}</td>
        <td>${cargo ? cargo.nome : '—'}</td>
        <td><span class="pill pill-neutral">${c.estado}</span></td>
        <td class="small-muted">${c.dataAbertura}</td>
        <td><button class="btn btn-sm btn-ghost" onclick="abrirCiclo('${c.id}')">Ver ciclo →</button></td>
      </tr>`;
      })
      .join('')}
  </tbody></table>`;
}

/* ===================== 1. EMPRESA ===================== */
