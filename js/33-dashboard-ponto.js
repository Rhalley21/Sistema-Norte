/* =========================================================
   CARD DE PONTO NO DASHBOARD (Admin/RH)
   -----------------------------------------------------------
   Mostra, dos últimos 30 dias: média de atraso e de hora extra
   POR COLABORADOR, e quantos colaboradores tiveram atraso/extra.
   Carrega em SEGUNDO PLANO (não trava a abertura do dashboard):
   o card aparece com "carregando…" e se atualiza sozinho quando
   os dados chegam. Reaproveita a ação "semana" da Edge Function
   (que aceita qualquer intervalo) e as funções de cálculo da tela
   de Ponto (analisarDiaVsJornada etc.), sem mexer no servidor.
   ========================================================= */

const DASH_PONTO_DIAS = 30;
let _dashPontoStatus = 'idle'; // idle | carregando | pronto | erro | vazio
let _dashPontoResumo = null;

async function carregarDashPonto() {
  if (_dashPontoStatus === 'carregando' || _dashPontoStatus === 'pronto') return;
  _dashPontoStatus = 'carregando';
  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - (DASH_PONTO_DIAS - 1));
  inicio.setHours(0, 0, 0, 0);

  const { data, error } = await sb.functions.invoke('ponto', {
    body: { action: 'semana', inicioISO: inicio.toISOString(), fimISO: new Date().toISOString() },
  });
  if (error || data?.error) {
    console.error('Falha ao carregar stats de ponto', error || data?.error);
    _dashPontoStatus = 'erro';
    render();
    return;
  }
  const registros = data.registros || [];
  if (!registros.length) {
    _dashPontoStatus = 'vazio';
    render();
    return;
  }

  // Agrupa por perfil (colaborador) e por dia, e soma atraso/extra usando a
  // jornada de cada um (que vive no cadastro, em state.colaboradores).
  const porPerfil = {};
  registros.forEach((r) => {
    (porPerfil[r.perfil_id] = porPerfil[r.perfil_id] || []).push(r);
  });

  let totalAtraso = 0;
  let totalExtra = 0;
  let comAtraso = 0;
  let comExtra = 0;
  let colaboradoresContados = 0;

  Object.keys(porPerfil).forEach((perfilId) => {
    const colaborador = state.colaboradores.find((c) => c.perfilId === perfilId);
    const jornada = colaborador?.jornada || null;
    if (!jornada) return; // sem jornada não dá pra medir atraso/extra
    colaboradoresContados++;

    const porDia = {};
    porPerfil[perfilId].forEach((r) => {
      const dia = r.registrado_em.slice(0, 10);
      (porDia[dia] = porDia[dia] || []).push(r);
    });

    let atrasoPessoa = 0;
    let extraPessoa = 0;
    Object.keys(porDia).forEach((dia) => {
      const analise = analisarDiaVsJornada(porDia[dia], jornada);
      if (analise) {
        atrasoPessoa += analise.atrasoMin;
        extraPessoa += analise.extraMin;
      }
    });
    totalAtraso += atrasoPessoa;
    totalExtra += extraPessoa;
    if (atrasoPessoa > 0) comAtraso++;
    if (extraPessoa > 0) comExtra++;
  });

  _dashPontoResumo = {
    mediaAtraso: colaboradoresContados ? Math.round(totalAtraso / colaboradoresContados) : 0,
    mediaExtra: colaboradoresContados ? Math.round(totalExtra / colaboradoresContados) : 0,
    comAtraso,
    comExtra,
    colaboradores: colaboradoresContados,
  };
  _dashPontoStatus = 'pronto';
  render();
}

function _dashFmtMin(m) {
  if (!m) return '0h00';
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, '0')}`;
}

// Card exibido no dashboard. Dispara o carregamento em segundo plano na
// primeira renderização e mostra "carregando…" enquanto isso.
function renderCardPontoDashboard() {
  if (!pontoHabilitado) return ''; // só quando a empresa usa o módulo de Ponto
  if (_dashPontoStatus === 'idle') {
    setTimeout(carregarDashPonto, 0); // não bloqueia a abertura do dashboard
  }

  let conteudo;
  if (_dashPontoStatus === 'carregando' || _dashPontoStatus === 'idle') {
    conteudo = '<div class="empty">Carregando dados de ponto…</div>';
  } else if (_dashPontoStatus === 'erro') {
    conteudo = '<div class="empty">Não foi possível carregar os dados de ponto agora.</div>';
  } else if (_dashPontoStatus === 'vazio') {
    conteudo = '<div class="empty">Nenhuma batida de ponto nos últimos 30 dias.</div>';
  } else {
    const r = _dashPontoResumo;
    if (!r.colaboradores) {
      conteudo =
        '<div class="empty">Nenhum colaborador com jornada cadastrada. Defina a jornada em Colaboradores para acompanhar atrasos e horas extras.</div>';
    } else {
      conteudo = `
        <div class="kpi-grid" style="grid-template-columns:1fr 1fr;">
          <div class="kpi-card-inetris">
            <div class="kpi-card-icone" style="color:var(--iniciar);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            </div>
            <div>
              <div class="kpi-card-label">Atraso médio por colaborador</div>
              <div class="kpi-card-valor" style="color:var(--iniciar);">${_dashFmtMin(r.mediaAtraso)}</div>
              <div class="small-muted" style="font-size:11px;">${r.comAtraso} de ${r.colaboradores} tiveram atraso</div>
            </div>
          </div>
          <div class="kpi-card-inetris">
            <div class="kpi-card-icone" style="color:var(--alavancar);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v6M12 22v-6M4.9 4.9l4.2 4.2M14.9 14.9l4.2 4.2M2 12h6M22 12h-6M4.9 19.1l4.2-4.2M14.9 9.1l4.2-4.2"/></svg>
            </div>
            <div>
              <div class="kpi-card-label">Hora extra média por colaborador</div>
              <div class="kpi-card-valor" style="color:var(--alavancar);">${_dashFmtMin(r.mediaExtra)}</div>
              <div class="small-muted" style="font-size:11px;">${r.comExtra} de ${r.colaboradores} fizeram hora extra</div>
            </div>
          </div>
        </div>`;
    }
  }

  return `
    <div class="card">
      <h3>Ponto — últimos 30 dias <small>média por colaborador, entre os que têm jornada cadastrada</small></h3>
      ${conteudo}
    </div>`;
}

// Card de ranking no mesmo estilo do card de ponto: dois mini-cards lado a
// lado (Melhores / Precisam de atenção), cada um com o top 3 por nota do
// último diagnóstico de cada colaborador.
function renderCardRankingDashboard() {
  // Um resultado por colaborador: o ciclo mais recente com diagnóstico.
  const porColab = {};
  state.ciclos
    .filter((c) => c.diagnostico && c.diagnostico.geralMedia !== null && c.diagnostico.geralMedia !== undefined)
    .forEach((c) => {
      const at = porColab[c.colaboradorId];
      if (!at || (c.dataAbertura || '').localeCompare(at.dataAbertura || '') > 0) porColab[c.colaboradorId] = c;
    });
  const ranking = Object.values(porColab)
    .map((c) => {
      const p = state.colaboradores.find((x) => x.id === c.colaboradorId);
      return { nome: p?.nome || '—', nota: c.diagnostico.geralMedia };
    })
    .sort((a, b) => b.nota - a.nota);

  let conteudo;
  if (ranking.length < 2) {
    conteudo =
      '<div class="empty">É preciso pelo menos 2 colaboradores com diagnóstico gerado para montar o ranking.</div>';
  } else {
    const melhores = ranking.slice(0, 3);
    const atencao = ranking.slice(-3).reverse();
    const linha = (r, cor) =>
      `<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--line);font-size:13px;">
        <span>${escaparHtml(r.nome)}</span>
        <span style="font-family:var(--mono);color:${cor};font-weight:600;">${r.nota.toFixed(2)}</span>
      </div>`;
    conteudo = `
      <div class="kpi-grid" style="grid-template-columns:1fr 1fr;">
        <div class="kpi-card-inetris" style="flex-direction:column;align-items:stretch;">
          <div class="kpi-card-label" style="color:var(--alavancar);display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg> Melhores
          </div>
          ${melhores.map((r) => linha(r, 'var(--alavancar)')).join('')}
        </div>
        <div class="kpi-card-inetris" style="flex-direction:column;align-items:stretch;">
          <div class="kpi-card-label" style="color:var(--iniciar);display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg> Precisam de atenção
          </div>
          ${atencao.map((r) => linha(r, 'var(--iniciar)')).join('')}
        </div>
      </div>`;
  }

  return `
    <div class="card">
      <h3>Ranking de colaboradores <small>por nota do último diagnóstico (0 a 1)</small></h3>
      ${conteudo}
    </div>`;
}

// Card com a contagem de colaboradores e quantos são líderes/gestores.
// "Líder" = quem tem papel 'lider' na conta de login (_perfisEmpresa).
function renderCardColaboradores() {
  const ativos = state.colaboradores.filter((p) => !p.inativo).length;
  const lideres =
    typeof _perfisEmpresa !== 'undefined'
      ? _perfisEmpresa.filter((pf) => pf.papel === 'lider' && !pf.desativado).length
      : 0;
  const outros = Math.max(0, ativos - lideres);
  return `
    <div class="card">
      <h3>Equipe <small>colaboradores cadastrados</small></h3>
      <div class="kpi-grid" style="grid-template-columns:1fr 1fr;">
        <div class="kpi-card-inetris">
          <div class="kpi-card-icone">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11"/></svg>
          </div>
          <div>
            <div class="kpi-card-label">Total de colaboradores</div>
            <div class="kpi-card-valor">${ativos}</div>
            <div class="small-muted" style="font-size:11px;">${outros} sem função de liderança</div>
          </div>
        </div>
        <div class="kpi-card-inetris">
          <div class="kpi-card-icone" style="color:var(--gold-on-light);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 3 7v6c0 5 3.8 8.3 9 10 5.2-1.7 9-5 9-10V7Z"/><path d="m9 12 2 2 4-4"/></svg>
          </div>
          <div>
            <div class="kpi-card-label">Líderes / Gestores</div>
            <div class="kpi-card-valor" style="color:var(--gold-on-light);">${lideres}</div>
            <div class="small-muted" style="font-size:11px;">${ativos ? Math.round((lideres / ativos) * 100) : 0}% da equipe</div>
          </div>
        </div>
      </div>
    </div>`;
}
