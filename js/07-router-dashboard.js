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
    case 'meu_cargo':
      return pageMeuCargo();
    case 'meu_desenvolvimento':
      return pageMeuDesenvolvimento();
    case 'acompanhamento':
      return pageAcompanhamento();
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
    case 'conferencia_ponto':
      return pontoHabilitado
        ? pageConferenciaPonto()
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
    case 'central_ajuda':
      return pageCentralAjuda();
    case 'folha_papel':
      return pageFolhaPapel();
    case 'rs_talentos':
      return pageBancoTalentos();
    case 'rs_processo':
      return pageProcessoSeletivoRS();
    case 'rs_relatorios':
      return pageRelatoriosRS();
    case 'clima':
      return pageClima();
    case 'nr1':
      return pageNr1();
    case 'rs':
      return pageRS();
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

function diasDesdeAbertura(ciclo) {
  const hoje = new Date(hojeLocalISO());
  const abertura = new Date(ciclo.dataAbertura);
  return Math.round((hoje - abertura) / (1000 * 60 * 60 * 24));
}
// Pendências operacionais que vêm de fora dos ciclos de avaliação —
// justificativas de ponto aguardando decisão (RH e líder aprovam ambos),
// substituto de aprovador não definido, competência anterior aberta, e o
// próprio saldo do banco de horas. Carregado uma vez por sessão de
// dashboard, em segundo plano.
let _dashPontoPendencias = null; // { total, escalonadas } | null enquanto carrega
let _dashJustifRaw = null; // lista completa (com nome e perfil_id) das justificativas pendentes — pra contar por pessoa
let _dashAlertas = null; // { substitutoDefinido, competenciaAnteriorFechada, mesAnteriorLabel } | null
let _dashSaldoBancoHoras = null; // minutos (pode ser negativo) | null enquanto carrega
let _dashPontoJaCarregou = false;
async function carregarDashPontoPendencias() {
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicioProxMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
  const [respJustif, respAlertas, respSaldo] = await Promise.all([
    sb.functions.invoke('ponto', { body: { action: 'justificativa_pendentes', status: 'pendente' } }),
    sb.functions.invoke('ponto', { body: { action: 'dashboard_alertas' } }),
    sb.functions.invoke('ponto', {
      body: { action: 'banco_horas_saldo', inicioISO: inicioMes.toISOString(), fimISO: inicioProxMes.toISOString() },
    }),
  ]);
  if (!respJustif.error && respJustif.data && !respJustif.data.error) {
    const lista = respJustif.data.justificativas || [];
    _dashPontoPendencias = { total: lista.length, escalonadas: lista.filter((j) => j.escalonado).length };
    _dashJustifRaw = lista; // guarda a lista (com perfil_id) pra contar por pessoa na tabela da equipe
  } else {
    _dashPontoPendencias = { total: 0, escalonadas: 0 };
  }
  if (!respAlertas.error && respAlertas.data && !respAlertas.data.error) _dashAlertas = respAlertas.data;
  if (!respSaldo.error && respSaldo.data && !respSaldo.data.error && !respSaldo.data.semJornada) {
    _dashSaldoBancoHoras = respSaldo.data.saldoMin;
  }
  render();
}

// Painel visual com gráficos das áreas operacionais (justificativas de
// ponto, ciclos por status, riscos NR1) — complementa os cards de texto de
// pendências com uma visão gráfica, no mesmo estilo dos outros painéis.
// KPIs do RH — mesmo padrão do dashboard do Admin: cada card com uma nota
// extra de contexto, e clicável quando faz sentido. Aparece ANTES dos
// gráficos (o dado calculado dentro de renderDashboardRH, lido daqui).
function renderKpisRH() {
  const k = _dadosGraficosDashboardRH?.kpis;
  if (!k) return '';
  return `
    <div class="painel-kpi-inetris">
      <div class="kpi-card-inetris" style="flex-direction:column;align-items:stretch;">
        <div style="display:flex;gap:12px;">
          <div class="kpi-card-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 12l2 2 4-4"/></svg></div>
          <div>
            <div class="kpi-card-label">Avaliações em andamento</div>
            <div class="kpi-card-valor">${k.emAndamentoTotal}</div>
            <div class="kpi-card-nota">${k.emAndamentoAbertos} aberta(s) · ${k.emAndamentoConsolidacao} em consolidação</div>
          </div>
        </div>
      </div>
      <div class="kpi-card-inetris kpi-clicavel" style="flex-direction:column;align-items:stretch;cursor:pointer;" onclick="goto('ciclos')" title="Ver ciclos com pendência de avaliador">
        <div style="display:flex;gap:12px;">
          <div class="kpi-card-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg></div>
          <div>
            <div class="kpi-card-label">Pendências de avaliador</div>
            <div class="kpi-card-valor">${k.pendentesTotal}</div>
            <div class="kpi-card-nota">${k.pendentesTotal ? '<span style="color:var(--iniciar-texto);">Precisam de decisão</span> · ver →' : 'Nenhuma pendência agora'}</div>
          </div>
        </div>
      </div>
      <div class="kpi-card-inetris kpi-clicavel" style="flex-direction:column;align-items:stretch;cursor:pointer;" onclick="_acompAba='pdi';goto('acompanhamento')" title="Ver todos os colaboradores e o status do PDI">
        <div style="display:flex;gap:12px;">
          <div class="kpi-card-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></div>
          <div>
            <div class="kpi-card-label">PDIs ativos</div>
            <div class="kpi-card-valor">${k.pdisAtivosTotal}</div>
            <div class="kpi-card-nota">${k.comDiagTotal ? Math.round((k.pdisAtivosTotal / k.comDiagTotal) * 100) : 0}% dos ${k.comDiagTotal} avaliados · ver →</div>
          </div>
        </div>
      </div>
      <div class="kpi-card-inetris" style="flex-direction:column;align-items:stretch;">
        <div style="display:flex;gap:12px;">
          <div class="kpi-card-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/></svg></div>
          <div>
            <div class="kpi-card-label">Colaboradores sem risco</div>
            <div class="kpi-card-valor">${k.pctSemRisco}%</div>
            <div class="kpi-card-nota">${k.totalColabAtivos - k.colaboradoresEmRiscoTotal} de ${k.totalColabAtivos} · fora do critério 7.2</div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderPainelOperacionalRH() {
  const justif = _dashAlertas?.justificativasPorStatus;
  const temJustif = justif && justif.pendente + justif.aprovada + justif.rejeitada > 0;
  const temRiscos = state.nr1?.riscos?.length > 0;
  const ciclosStatus = _dadosGraficosDashboardRH?.ciclosPorStatus;
  const totalCiclosRH = ciclosStatus ? Object.values(ciclosStatus).reduce((a, b) => a + b, 0) : 0;
  const d = _dadosGraficosDashboardRH;
  if (!temJustif && !temRiscos && !totalCiclosRH && !d?.temPilares && !d?.totalIda) return '';
  return `
    <div class="painel-visao-geral" style="grid-template-columns:1.2fr 0.8fr;">
      <div class="grafico-card">
        <h4>Desempenho por dimensão <small>Média da empresa, escala 0 a 1</small></h4>
        ${d?.temPilares ? `<div style="position:relative;width:100%;height:260px;"><canvas id="radarRH" role="img" aria-label="Radar de 5 pilares da empresa"></canvas></div>` : '<div class="empty">Sem diagnósticos ainda.</div>'}
      </div>
      <div class="grafico-card">
        <h4>Classificação geral <small>${d?.totalIda || 0} colaboradores com diagnóstico</small></h4>
        ${
          d?.totalIda
            ? `<div class="grafico-donut-wrap">
          <div class="grafico-donut-canvas"><canvas id="rhDonutIda" role="img" aria-label="Rosca com a distribuição geral: ${d.ida[0]} Iniciar, ${d.ida[1]} Desenvolver, ${d.ida[2]} Alavancar"></canvas>
            <div class="grafico-donut-centro">${d.totalColabAtivos}<span class="grafico-donut-centro-legenda">colaboradores</span></div>
          </div>
          <div class="grafico-legenda">
            <span><span class="dot" style="background:var(--iniciar);"></span>Iniciar ${Math.round((d.ida[0] / d.totalIda) * 100)}%</span>
            <span><span class="dot" style="background:var(--desenvolver);"></span>Desenvolver ${Math.round((d.ida[1] / d.totalIda) * 100)}%</span>
            <span><span class="dot" style="background:var(--alavancar);"></span>Alavancar ${Math.round((d.ida[2] / d.totalIda) * 100)}%</span>
          </div>
        </div>`
            : '<div class="empty">Sem diagnósticos ainda.</div>'
        }
      </div>
    </div>
    <div class="painel-visao-geral" style="grid-template-columns:1fr 1fr 1fr;">
      ${
        totalCiclosRH
          ? `<div class="card" style="margin-bottom:0;">
        <h3>Ciclos por status</h3>
        <div class="grafico-donut-canvas"><canvas id="donutCiclosRH" role="img" aria-label="Ciclos de avaliação por status"></canvas>
          <div class="grafico-donut-centro">${totalCiclosRH}<span class="grafico-donut-centro-legenda">ciclos</span></div>
        </div>
        <div class="grafico-legenda">
          <span><span class="dot" style="background:var(--desenvolver);"></span>Aberto (${ciclosStatus['Aberto']})</span>
          <span><span class="dot" style="background:var(--iniciar);"></span>Pendência (${ciclosStatus['Pendência de Avaliador']})</span>
          <span><span class="dot" style="background:var(--alavancar);"></span>Encerrado (${ciclosStatus['Encerrado']})</span>
        </div>
      </div>`
          : ''
      }
      ${
        temJustif
          ? `<div class="card" style="margin-bottom:0;">
        <h3>Justificativas de ponto <small>últimos 30 dias</small></h3>
        <div class="grafico-canvas-lg" style="height:140px;"><canvas id="barJustifRH" role="img" aria-label="Justificativas por status nos últimos 30 dias"></canvas></div>
      </div>`
          : ''
      }
      ${
        temRiscos
          ? `<div class="card" style="margin-bottom:0;">
        <h3>Riscos NR1 <small>por nível, inventário atual</small></h3>
        <div class="grafico-donut-canvas"><canvas id="donutRiscosNr1" role="img" aria-label="Riscos NR1 por nível"></canvas>
          <div class="grafico-donut-centro">${state.nr1.riscos.length}<span class="grafico-donut-centro-legenda">riscos</span></div>
        </div>
        <div class="grafico-legenda">
          <span><span class="dot" style="background:var(--alavancar);"></span>Baixo (${_dadosGraficosDashboardRH?.riscosPorNivel?.Baixo || 0})</span>
          <span><span class="dot" style="background:var(--desenvolver);"></span>Médio (${_dadosGraficosDashboardRH?.riscosPorNivel?.Médio || 0})</span>
          <span><span class="dot" style="background:var(--iniciar);"></span>Alto/Crítico (${(_dadosGraficosDashboardRH?.riscosPorNivel?.Alto || 0) + (_dadosGraficosDashboardRH?.riscosPorNivel?.Crítico || 0)})</span>
        </div>
      </div>`
          : ''
      }
    </div>`;
}
function renderPainelOperacionalGestor() {
  const justif = _dashAlertas?.justificativasPorStatus;
  const temJustif = justif && justif.pendente + justif.aprovada + justif.rejeitada > 0;
  const ciclosStatus = _dadosGraficosDashboardGestor?.ciclosPorStatus;
  const totalCiclosGestor = ciclosStatus ? Object.values(ciclosStatus).reduce((a, b) => a + b, 0) : 0;
  const d = _dadosGraficosDashboardGestor;
  if (!temJustif && !totalCiclosGestor && !d?.temPilares && !d?.totalIda && !d?.potencial?.length) return '';
  return `
    <div class="painel-visao-geral" style="grid-template-columns:1.2fr 0.8fr;">
      <div class="grafico-card">
        <h4>Desempenho por dimensão <small>Média da equipe, escala 0 a 1</small></h4>
        ${d?.temPilares ? `<div style="position:relative;width:100%;height:260px;"><canvas id="radarGestor" role="img" aria-label="Radar de 5 pilares da equipe"></canvas></div>` : '<div class="empty">Sem diagnósticos ainda.</div>'}
      </div>
      <div class="grafico-card">
        <h4>Classificação da minha equipe <small>${d?.totalIda || 0} avaliações com diagnóstico</small></h4>
        ${
          d?.totalIda
            ? `<div class="grafico-donut-wrap">
          <div class="grafico-donut-canvas"><canvas id="gestorDonutIda" role="img" aria-label="Rosca com a distribuição da equipe: ${d.ida[0]} Iniciar, ${d.ida[1]} Desenvolver, ${d.ida[2]} Alavancar"></canvas>
            <div class="grafico-donut-centro">${d.totalEquipe}<span class="grafico-donut-centro-legenda">na equipe</span></div>
          </div>
          <div class="grafico-legenda">
            <span><span class="dot" style="background:var(--iniciar);"></span>Iniciar ${Math.round((d.ida[0] / d.totalIda) * 100)}%</span>
            <span><span class="dot" style="background:var(--desenvolver);"></span>Desenvolver ${Math.round((d.ida[1] / d.totalIda) * 100)}%</span>
            <span><span class="dot" style="background:var(--alavancar);"></span>Alavancar ${Math.round((d.ida[2] / d.totalIda) * 100)}%</span>
          </div>
        </div>`
            : '<div class="empty">Sem diagnósticos ainda.</div>'
        }
      </div>
    </div>
    ${
      d?.potencial?.length
        ? `<div class="card">
      <h3>Potencial da equipe <small>Ranking pela última Dimensão de Potencial medida</small></h3>
      <div class="grafico-canvas-lg" style="height:${Math.max(110, d.potencial.length * 34)}px;"><canvas id="gestorBarPotencial" role="img" aria-label="Ranking dos colaboradores da equipe por Potencial"></canvas></div>
    </div>`
        : ''
    }
    <div class="painel-visao-geral" style="grid-template-columns:1fr 1fr;">
      ${
        totalCiclosGestor
          ? `<div class="card" style="margin-bottom:0;">
        <h3>Ciclos da equipe por status</h3>
        <div class="grafico-donut-canvas"><canvas id="donutCiclosGestor" role="img" aria-label="Ciclos da equipe por status"></canvas>
          <div class="grafico-donut-centro">${totalCiclosGestor}<span class="grafico-donut-centro-legenda">ciclos</span></div>
        </div>
        <div class="grafico-legenda">
          <span><span class="dot" style="background:var(--desenvolver);"></span>Aberto (${ciclosStatus['Aberto']})</span>
          <span><span class="dot" style="background:var(--iniciar);"></span>Pendência (${ciclosStatus['Pendência de Avaliador']})</span>
          <span><span class="dot" style="background:var(--alavancar);"></span>Encerrado (${ciclosStatus['Encerrado']})</span>
        </div>
      </div>`
          : ''
      }
      ${
        temJustif
          ? `<div class="card" style="margin-bottom:0;">
        <h3>Justificativas de ponto <small>últimos 30 dias</small></h3>
        <div class="grafico-canvas-lg" style="height:140px;"><canvas id="barJustifGestor" role="img" aria-label="Justificativas por status nos últimos 30 dias"></canvas></div>
      </div>`
          : ''
      }
    </div>`;
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
  // Justificativas de ponto pendentes (RH e líder aprovam) — carregado à parte.
  if (pontoHabilitado && !_dashPontoJaCarregou) {
    _dashPontoJaCarregou = true;
    carregarDashPontoPendencias();
  }

  // NR1: ações atrasadas e ações aguardando verificação de eficácia —
  // dados já disponíveis no navegador (não é sensível, é gestão de risco).
  const hojeIso = hojeLocalISO();
  const nr1AcoesAtrasadas = (state.nr1?.acoes || []).filter(
    (a) => a.status !== 'concluida' && a.status !== 'cancelada' && a.prazo && a.prazo < hojeIso
  ).length;
  const nr1AguardandoEficacia = (state.nr1?.acoes || []).filter((a) => a.status === 'concluida' && !a.eficacia).length;

  const competenciaAnteriorPendente =
    pontoHabilitado && _dashAlertas && _dashAlertas.competenciaAnteriorFechada === false;
  const substitutoNaoDefinido = pontoHabilitado && _dashAlertas && _dashAlertas.substitutoDefinido === false;
  const saldoNegativo = pontoHabilitado && typeof _dashSaldoBancoHoras === 'number' && _dashSaldoBancoHoras < 0;

  if (
    !aguardandoRH.length &&
    !pendencias.length &&
    !semCiclo.length &&
    !ciclosAntigos.length &&
    !promocaoVencendo.length &&
    !(pontoHabilitado && _dashPontoPendencias && _dashPontoPendencias.total) &&
    !nr1AcoesAtrasadas &&
    !nr1AguardandoEficacia &&
    !competenciaAnteriorPendente &&
    !substitutoNaoDefinido &&
    !saldoNegativo
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
      ${
        pontoHabilitado && _dashPontoPendencias && _dashPontoPendencias.total
          ? `<div class="pendencia-item"><span><b>${_dashPontoPendencias.total}</b> justificativa(s) de ponto aguardando decisão${_dashPontoPendencias.escalonadas ? ` — <b style="color:var(--iniciar-texto);">${_dashPontoPendencias.escalonadas} escalonada(s)</b> (mais de 3 dias sem resposta)` : ''}</span><button class="btn btn-sm" onclick="goto('conferencia_ponto')">Decidir →</button></div>`
          : ''
      }
      ${nr1AcoesAtrasadas ? `<div class="pendencia-item"><span><b>${nr1AcoesAtrasadas}</b> ação(ões) do plano NR1 com prazo vencido</span><button class="btn btn-sm" onclick="goto('nr1')">Ver →</button></div>` : ''}
      ${nr1AguardandoEficacia ? `<div class="pendencia-item"><span><b>${nr1AguardandoEficacia}</b> ação(ões) NR1 concluída(s) aguardando verificação de eficácia</span><button class="btn btn-sm" onclick="goto('nr1')">Verificar →</button></div>` : ''}
      ${competenciaAnteriorPendente ? `<div class="pendencia-item"><span>A competência de <b>${_dashAlertas.mesAnteriorLabel}</b> ainda não foi fechada</span><button class="btn btn-sm" onclick="goto('conferencia_ponto')">Fechar →</button></div>` : ''}
      ${substitutoNaoDefinido ? `<div class="pendencia-item"><span>Você ainda não definiu um <b>substituto</b> para aprovar no seu lugar quando estiver ausente</span><button class="btn btn-sm" onclick="goto('conferencia_ponto')">Definir →</button></div>` : ''}
      ${saldoNegativo ? `<div class="pendencia-item"><span>Seu <b>banco de horas</b> está negativo este mês (${Math.floor(Math.abs(_dashSaldoBancoHoras) / 60)}h${String(Math.abs(_dashSaldoBancoHoras) % 60).padStart(2, '0')} a compensar)</span><button class="btn btn-sm" onclick="goto('ponto')">Ver →</button></div>` : ''}
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

  // Justificativas de ponto pendentes (líder também aprova) — carregado à parte.
  if (pontoHabilitado && !_dashPontoJaCarregou) {
    _dashPontoJaCarregou = true;
    carregarDashPontoPendencias();
  }

  const substitutoNaoDefinidoGestor = pontoHabilitado && _dashAlertas && _dashAlertas.substitutoDefinido === false;
  const saldoNegativoGestor = pontoHabilitado && typeof _dashSaldoBancoHoras === 'number' && _dashSaldoBancoHoras < 0;

  if (
    !aguardandoMim.length &&
    !semFeedback.length &&
    !progressoEquipe &&
    !(pontoHabilitado && _dashPontoPendencias && _dashPontoPendencias.total) &&
    !substitutoNaoDefinidoGestor &&
    !saldoNegativoGestor
  )
    return '';
  return `
    <div class="card" style="border-left:3px solid var(--gold);">
      <h3>Você tem pendências</h3>
      ${progressoEquipe}
      ${aguardandoMim.length ? `<div class="pendencia-item"><span>Você tem <b>${aguardandoMim.length}</b> avaliação(ões) da equipe aguardando você</span><button class="btn btn-sm" onclick="goto('ciclos')">Avaliar →</button></div>` : ''}
      ${semFeedback.length ? `<div class="pendencia-item"><span><b>${semFeedback.length}</b> reunião(ões) de feedback ainda não registrada(s)</span><button class="btn btn-sm" onclick="goto('ciclos')">Registrar →</button></div>` : ''}
      ${
        pontoHabilitado && _dashPontoPendencias && _dashPontoPendencias.total
          ? `<div class="pendencia-item"><span><b>${_dashPontoPendencias.total}</b> justificativa(s) de ponto aguardando decisão${_dashPontoPendencias.escalonadas ? ` — <b style="color:var(--iniciar-texto);">${_dashPontoPendencias.escalonadas} escalonada(s)</b> (mais de 3 dias sem resposta)` : ''}</span><button class="btn btn-sm" onclick="goto('conferencia_ponto')">Decidir →</button></div>`
          : ''
      }
      ${substitutoNaoDefinidoGestor ? `<div class="pendencia-item"><span>Você ainda não definiu um <b>substituto</b> para aprovar no seu lugar quando estiver ausente</span><button class="btn btn-sm" onclick="goto('conferencia_ponto')">Definir →</button></div>` : ''}
      ${saldoNegativoGestor ? `<div class="pendencia-item"><span>Seu <b>banco de horas</b> está negativo este mês (${Math.floor(Math.abs(_dashSaldoBancoHoras) / 60)}h${String(Math.abs(_dashSaldoBancoHoras) % 60).padStart(2, '0')} a compensar)</span><button class="btn btn-sm" onclick="goto('ponto')">Ver →</button></div>` : ''}
    </div>`;
}
// Dados pessoais do colaborador — minhas justificativas de ponto e meu
// banco de horas. Carregado uma vez por sessão de dashboard.
let _dashColabJustif = null; // array de justificativas próprias | null enquanto carrega
let _dashColabSaldo = null; // minutos (pode ser negativo) | null enquanto carrega
let _dashColabJaCarregou = false;
async function carregarDashColaboradorExtra() {
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicioProxMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
  const [respJustif, respSaldo] = await Promise.all([
    sb.functions.invoke('ponto', { body: { action: 'justificativa_minhas' } }),
    sb.functions.invoke('ponto', {
      body: { action: 'banco_horas_saldo', inicioISO: inicioMes.toISOString(), fimISO: inicioProxMes.toISOString() },
    }),
  ]);
  if (!respJustif.error && respJustif.data && !respJustif.data.error)
    _dashColabJustif = respJustif.data.justificativas || [];
  if (!respSaldo.error && respSaldo.data && !respSaldo.data.error && !respSaldo.data.semJornada) {
    _dashColabSaldo = respSaldo.data.saldoMin;
  }
  render();
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

  if (pontoHabilitado && !_dashColabJaCarregou) {
    _dashColabJaCarregou = true;
    carregarDashColaboradorExtra();
  }
  const justifPendentesColab = (_dashColabJustif || []).filter((j) => j.status === 'pendente').length;

  // NR1: campanhas ativas que este colaborador ainda não respondeu. Reaproveita
  // os mesmos carregadores da página NR1 (dados já globais na sessão).
  if (!_nr1JaCarregouCampanhas) {
    _nr1JaCarregouCampanhas = true;
    carregarCampanhasNr1();
    carregarMeuStatusNr1();
  }
  const pesquisasNr1Pendentes = (_nr1Campanhas || []).filter(
    (c) =>
      c.status === 'ativa' &&
      !_nr1MeuStatus.respondidas.includes(c.id) &&
      nr1ColaboradorElegivel(meuRegistro, c.publico)
  ).length;

  if (!minhaAutoavaliacao.length && !semFeedback.length && !justifPendentesColab && !pesquisasNr1Pendentes) return '';
  return `
    <div class="card" style="border-left:3px solid var(--gold);">
      <h3>Você tem pendências</h3>
      ${minhaAutoavaliacao.length ? `<div class="pendencia-item"><span>Sua <b>autoavaliação</b> está aguardando você</span><button class="btn btn-sm" onclick="abrirCiclo('${minhaAutoavaliacao[0].id}')">Responder →</button></div>` : ''}
      ${semFeedback.length ? `<div class="pendencia-item"><span>Sua reunião de feedback ainda não foi registrada</span><button class="btn btn-sm" onclick="abrirCiclo('${semFeedback[0].id}')">Ver ciclo →</button></div>` : ''}
      ${justifPendentesColab ? `<div class="pendencia-item"><span>Você tem <b>${justifPendentesColab}</b> justificativa(s) de ponto aguardando decisão do seu gestor</span><button class="btn btn-sm" onclick="goto('ponto')">Ver →</button></div>` : ''}
      ${pesquisasNr1Pendentes ? `<div class="pendencia-item"><span>Você tem <b>${pesquisasNr1Pendentes}</b> pesquisa(s) NR1 aguardando sua resposta</span><button class="btn btn-sm" onclick="goto('nr1')">Responder →</button></div>` : ''}
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
    const corpoGestor = renderDashboardGestor(); // roda primeiro pra calcular os dados que o painel de gráficos usa
    body = renderMinhaAvaliacaoPendente() + renderPendenciasGestor() + renderPainelOperacionalGestor() + corpoGestor;
  } else if (state.role === 'gestor' && meuEscopoEstendido) {
    body =
      `<div class="notice info">Escopo estendido: você tem uma exceção explícita concedida pelo Administrador para ver os dados consolidados de toda a empresa, além da sua própria equipe.</div>` +
      renderMinhaAvaliacaoPendente() +
      renderPendenciasGestor() +
      renderDashboardAdmin(abertos, pdisAtivos, encerrados);
  } else if (state.role === 'rh') {
    const corpoRH = renderDashboardRH(); // roda primeiro pra calcular os dados que os KPIs e o painel de gráficos usam
    body =
      renderMinhaAvaliacaoPendente() +
      renderPendenciasRecrutamento() +
      renderPendenciasRH() +
      renderKpisRH() +
      renderPainelOperacionalRH() +
      corpoRH;
  } else {
    body =
      renderMinhaAvaliacaoPendente() +
      renderPrimeirosPassos() +
      renderPendenciasRecrutamento() +
      renderDashboardAdmin(abertos, pdisAtivos, encerrados);
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

  // Aviso de teste grátis: mostra os dias restantes quando a empresa está em trial.
  let bannerTrial = '';
  if (trialAte) {
    const diasRestantes = Math.ceil((new Date(trialAte) - new Date()) / (1000 * 60 * 60 * 24));
    if (diasRestantes >= 0) {
      bannerTrial = `<div class="notice info" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <span>🎁 Você está no <b>teste grátis</b> — ${diasRestantes === 0 ? 'último dia hoje' : `faltam ${diasRestantes} dia(s)`}. Para continuar após o teste, assine um plano.</span>
        ${meuPapelReal === 'owner' ? `<button class="btn btn-sm btn-primary" onclick="goto('pagamento')">Ver planos</button>` : ''}
      </div>`;
    }
  }

  return `
    ${bannerTrial}
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

  // Desempenho médio por setor: junta a última nota de cada colaborador e
  // agrupa pelo setor dele (setorId na estrutura).
  const notaPorColab = {};
  state.ciclos
    .filter((c) => c.diagnostico && c.diagnostico.geralMedia !== null && c.diagnostico.geralMedia !== undefined)
    .forEach((c) => {
      const at = notaPorColab[c.colaboradorId];
      if (!at || (c.dataAbertura || '').localeCompare(at.dataAbertura || '') > 0) notaPorColab[c.colaboradorId] = c;
    });
  const setoresMap = {};
  Object.values(notaPorColab).forEach((c) => {
    const p = state.colaboradores.find((x) => x.id === c.colaboradorId);
    if (!p) return;
    const setorNome = state.estrutura.find((n) => n.id === p.setorId)?.nome || 'Sem setor';
    (setoresMap[setorNome] = setoresMap[setorNome] || []).push(c.diagnostico.geralMedia);
  });
  const desempenhoSetores = Object.entries(setoresMap)
    .map(([nome, notas]) => ({ nome, media: notas.reduce((a, b) => a + b, 0) / notas.length, qtd: notas.length }))
    .sort((a, b) => b.media - a.media);

  _dadosGraficosDashboardAdmin = {
    ida: [contagemIda.I, contagemIda.D, contagemIda.A],
    pilares: mediaPorPilar,
    cargosRisco: porCargo.slice(0, 4),
    sparkline: mesesOrdenados,
    setores: desempenhoSetores,
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
    ${
      pontoHabilitado
        ? `<div class="painel-visao-geral dash-equipe-ponto" style="grid-template-columns:1fr 1fr;align-items:stretch;">
      ${renderCardColaboradores()}
      ${renderCardPontoDashboard()}
    </div>`
        : renderCardColaboradores()
    }
    ${renderCardRankingDashboard()}
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
      <div class="kpi-card-inetris kpi-clicavel" style="flex-direction:column;align-items:stretch;cursor:pointer;" onclick="_acompAba='avaliacao';goto('acompanhamento')" title="Ver todos os colaboradores e o status da avaliação">
        <div style="display:flex;gap:12px;">
          <div class="kpi-card-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 12l2 2 4-4"/></svg></div>
          <div>
            <div class="kpi-card-label">Colaboradores avaliados</div>
            <div class="kpi-card-valor">${totalIda ? Math.round((totalIda / state.colaboradores.length) * 100) : 0}%</div>
            <div class="kpi-card-nota">${totalIda} de ${state.colaboradores.length}</div>
          </div>
        </div>
        <div class="kpi-progresso-trilha"><div class="kpi-progresso-fill" style="width:${totalIda ? Math.min(100, Math.round((totalIda / state.colaboradores.length) * 100)) : 0}%;"></div></div>
        <div class="kpi-card-rodape">Meta: 90% · <span style="color:var(--gold-on-light);">ver detalhes →</span></div>
      </div>
      <div class="kpi-card-inetris kpi-clicavel" style="cursor:pointer;" onclick="_acompAba='pdi';goto('acompanhamento')" title="Ver todos os colaboradores e o status do PDI">
        <div class="kpi-card-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></div>
        <div>
          <div class="kpi-card-label">PDIs em andamento</div>
          <div class="kpi-card-valor">${pdisAtivos}</div>
          <div class="kpi-card-nota">Em progresso</div>
          <div class="kpi-card-nota">Total de ativos: ${ciclosComPdi.length} · <span style="color:var(--gold-on-light);">ver →</span></div>
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

    <div class="card">
      <h3>Desempenho por setor <small>Nota média de cada setor (escala 0 a 1)</small></h3>
      ${
        desempenhoSetores.length
          ? `<div class="grafico-canvas-lg" style="height:${Math.max(120, desempenhoSetores.length * 36)}px;"><canvas id="barSetores" role="img" aria-label="Desempenho médio por setor"></canvas></div>`
          : '<div class="empty">Ainda não há setores com colaboradores avaliados.</div>'
      }
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

  // Ciclos por status (empresa toda) — pro gráfico de rosca do painel operacional.
  const ciclosPorStatusRH = { Aberto: 0, 'Em Consolidação': 0, 'Pendência de Avaliador': 0, Encerrado: 0 };
  state.ciclos.forEach((c) => {
    const chave = c.estado === 'PDI Gerado' || c.estado === 'Em Acompanhamento' ? 'Encerrado' : c.estado;
    if (ciclosPorStatusRH[chave] !== undefined) ciclosPorStatusRH[chave]++;
  });
  // Riscos NR1 por nível — dados já no navegador (registros de gestão do RH/SST).
  const riscosPorNivelRH = { Baixo: 0, Médio: 0, Alto: 0, Crítico: 0 };
  (state.nr1?.riscos || []).forEach((r) => {
    const nivel = nivelRiscoNr1(r.probabilidade, r.severidade).nivel;
    riscosPorNivelRH[nivel] = (riscosPorNivelRH[nivel] || 0) + 1;
  });

  _dadosGraficosDashboardRH = {
    ida: [contagemIdaRH.I, contagemIdaRH.D, contagemIdaRH.A],
    totalIda: totalIdaRH,
    totalColabAtivos,
    temPilares: somaPorPilarRH.N.length > 0,
    criticas: criticasOrdenadas.slice(0, 6),
    pctSemRisco,
    pilares: mediaPorPilarRH,
    ciclosPorStatus: ciclosPorStatusRH,
    riscosPorNivel: riscosPorNivelRH,
    kpis: {
      emAndamentoAbertos: state.ciclos.filter((c) => c.estado === 'Aberto').length,
      emAndamentoConsolidacao: state.ciclos.filter((c) => c.estado === 'Em Consolidação').length,
      emAndamentoTotal: emAndamento.length,
      pendentesTotal: pendentes.length,
      pdisAtivosTotal: pdisAtivos.length,
      comDiagTotal: comDiagRH.length,
      colaboradoresEmRiscoTotal: colaboradoresEmRisco.length,
      totalColabAtivos,
      pctSemRisco,
    },
  };

  return `
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
          ${criticasOrdenadas.map(([nome, n]) => `<tr><td>${escaparHtml(nome)}</td><td class="small-muted">${n}</td></tr>`).join('')}
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

  // Ciclos da equipe por status — pro gráfico de rosca do painel operacional.
  const ciclosPorStatusEquipe = { Aberto: 0, 'Em Consolidação': 0, 'Pendência de Avaliador': 0, Encerrado: 0 };
  meusCiclos.forEach((c) => {
    const chave = c.estado === 'PDI Gerado' || c.estado === 'Em Acompanhamento' ? 'Encerrado' : c.estado;
    if (ciclosPorStatusEquipe[chave] !== undefined) ciclosPorStatusEquipe[chave]++;
  });

  _dadosGraficosDashboardGestor = {
    ida: [contagemIdaEquipe.I, contagemIdaEquipe.D, contagemIdaEquipe.A],
    totalIda: totalIdaEquipe,
    totalEquipe: minhaEquipe.length,
    temPilares: somaPorPilarEquipe.N.length > 0,
    potencial: potencialEquipe,
    pilares: mediaPorPilarEquipe,
    ciclosPorStatus: ciclosPorStatusEquipe,
  };

  // Tabela completa da equipe: cargo, setor, status do ciclo mais recente e
  // nível de desempenho — tudo num lugar só, sem precisar visitar Colaboradores.
  const linhasEquipe = minhaEquipe
    .map((p) => {
      const cargo = state.cargos.find((c) => c.id === p.cargoId);
      const setor = state.estrutura.find((n) => n.id === p.setorId);
      const ciclosDoColaborador = meusCiclos
        .filter((c) => c.colaboradorId === p.id)
        .sort((a, b) => (b.dataAbertura || '').localeCompare(a.dataAbertura || ''));
      const cicloRecente = ciclosDoColaborador[0];
      let statusCiclo, corStatus;
      if (!cicloRecente) {
        statusCiclo = 'Sem ciclo';
        corStatus = 'pill-neutral';
      } else if (cicloRecente.estado === 'Encerrado' || cicloRecente.diagnostico) {
        statusCiclo = 'Avaliado';
        corStatus = 'pill-alavancar';
      } else if (cicloRecente.estado === 'Pendência de Avaliador') {
        statusCiclo = 'Pendência';
        corStatus = 'pill-iniciar';
      } else {
        statusCiclo = 'Em andamento';
        corStatus = 'pill-desenvolver';
      }
      const nivel = cicloRecente?.diagnostico?.geral || null;
      const justifPendentesPessoa = (_dashJustifRaw || []).filter((j) => j.perfil_id === p.perfilId).length;
      return {
        nome: p.nome,
        cargo: cargo?.nome || '—',
        setor: setor?.nome || '—',
        statusCiclo,
        corStatus,
        nivel,
        justifPendentesPessoa,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return `
    <div class="card">
      <h3>Minha equipe <small>${minhaEquipe.length} colaborador(es)</small></h3>
      <table><thead><tr><th>Colaborador</th><th>Cargo</th><th>Setor</th><th>Ciclo atual</th><th>Nível</th><th>Justificativas</th></tr></thead><tbody>
        ${linhasEquipe
          .map(
            (l) => `<tr>
          <td><b>${escaparHtml(l.nome)}</b></td>
          <td class="small-muted">${escaparHtml(l.cargo)}</td>
          <td class="small-muted">${escaparHtml(l.setor)}</td>
          <td><span class="pill ${l.corStatus}">${l.statusCiclo}</span></td>
          <td>${l.nivel ? `<span class="pill ${pillClass(l.nivel)}">${pillLabel(l.nivel)}</span>` : '<span class="small-muted">—</span>'}</td>
          <td>${l.justifPendentesPessoa ? `<span class="pill pill-desenvolver">${l.justifPendentesPessoa} pendente(s)</span>` : '<span class="small-muted">—</span>'}</td>
        </tr>`
          )
          .join('')}
      </tbody></table>
    </div>

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
                  ? '<span style="color:var(--alavancar-texto);">↑ Melhorou</span>'
                  : diff < 0
                    ? '<span style="color:var(--iniciar-texto);">↓ Piorou</span>'
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
  _dadosGraficosDashboardColaborador = {
    pctPdiPessoal,
    justifPorStatus: _dashColabJustif
      ? {
          pendente: _dashColabJustif.filter((j) => j.status === 'pendente').length,
          aprovada: _dashColabJustif.filter((j) => j.status === 'aprovada').length,
          rejeitada: _dashColabJustif.filter((j) => j.status === 'rejeitada').length,
        }
      : null,
  };

  return `
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
      pontoHabilitado && (_dashColabJustif?.length || typeof _dashColabSaldo === 'number')
        ? `
    <div class="painel-visao-geral" style="grid-template-columns:1fr 1fr;">
      ${
        _dashColabJustif?.length
          ? `<div class="card" style="margin-bottom:0;">
        <h3>Minhas justificativas <small>histórico de pedidos de ponto</small></h3>
        <div class="grafico-donut-canvas"><canvas id="donutJustifColab" role="img" aria-label="Minhas justificativas por status"></canvas>
          <div class="grafico-donut-centro">${_dashColabJustif.length}<span class="grafico-donut-centro-legenda">pedidos</span></div>
        </div>
        <div class="grafico-legenda">
          <span><span class="dot" style="background:var(--desenvolver);"></span>Pendente (${_dadosGraficosDashboardColaborador.justifPorStatus.pendente})</span>
          <span><span class="dot" style="background:var(--alavancar);"></span>Aprovada (${_dadosGraficosDashboardColaborador.justifPorStatus.aprovada})</span>
          <span><span class="dot" style="background:var(--iniciar);"></span>Rejeitada (${_dadosGraficosDashboardColaborador.justifPorStatus.rejeitada})</span>
        </div>
      </div>`
          : ''
      }
      ${
        typeof _dashColabSaldo === 'number'
          ? `<div class="card" style="margin-bottom:0;">
        <h3>Meu banco de horas <small>saldo deste mês</small></h3>
        <div style="display:flex;align-items:baseline;gap:8px;margin-top:10px;">
          <div style="font-family:var(--mono);font-size:30px;font-weight:600;color:${_dashColabSaldo >= 0 ? 'var(--alavancar)' : 'var(--iniciar)'};">${_dashColabSaldo >= 0 ? '+' : '−'}${Math.floor(Math.abs(_dashColabSaldo) / 60)}h${String(Math.abs(_dashColabSaldo) % 60).padStart(2, '0')}</div>
          <div class="small-muted">${_dashColabSaldo >= 0 ? 'de saldo' : 'a compensar'}</div>
        </div>
        <button class="btn btn-ghost btn-sm" style="margin-top:10px;" onclick="goto('ponto')">Ver detalhes →</button>
      </div>`
          : ''
      }
    </div>`
        : ''
    }
    ${
      historico.length > 1
        ? `
    <div class="card">
      <h3>Minha trajetória <small>Resultado, Comportamento e Potencial ao longo dos ciclos</small></h3>
      ${renderGraficoTrajetoriaIDA(historico)}
    </div>`
        : ''
    }

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
      historico.length > 1
        ? `
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
