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
