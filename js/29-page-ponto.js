/* =========================================================
   MÓDULO PONTO — bater ponto online
   -----------------------------------------------------------
   Os registros de ponto ficam num projeto Supabase SEPARADO do
   resto do sistema (ver sql-ponto-db/01-schema.sql pro motivo:
   volume/append-only — não faz sentido pesar o banco principal).
   Por isso esta tela nunca fala direto com um banco: tudo passa
   pela Edge Function "ponto" (supabase/functions/ponto/index.ts),
   que confere a sessão de login no projeto principal e só então
   lê/grava no projeto de ponto. Os dados chegam aqui de forma
   assíncrona, via sb.functions.invoke — nunca de `state`.
   ========================================================= */

const PONTO_DIAS_HISTORICO = 7;

let _meusRegistrosPontoHoje = [];
let _meuHistoricoPonto = []; // últimos PONTO_DIAS_HISTORICO dias, incluindo hoje
let _pontoCarregando = false;
let _pontoBatendoAgora = false;
let _pontoJaCarregouUmaVez = false;

function inicioDoDiaISO(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function carregarDadosPonto() {
  _pontoCarregando = true;
  const hoje = new Date();
  const desde = new Date(hoje);
  desde.setDate(desde.getDate() - (PONTO_DIAS_HISTORICO - 1));

  const [respHoje, respHistorico] = await Promise.all([
    sb.functions.invoke('ponto', { body: { action: 'hoje', inicioDoDiaISO: inicioDoDiaISO(hoje) } }),
    sb.functions.invoke('ponto', {
      body: { action: 'periodo', desdeISO: inicioDoDiaISO(desde), ateISO: new Date().toISOString() },
    }),
  ]);
  _pontoCarregando = false;

  if (respHoje.error || respHoje.data?.error) {
    console.error('Falha ao carregar registros de hoje', respHoje.error || respHoje.data.error);
  } else {
    _meusRegistrosPontoHoje = respHoje.data.registros || [];
  }
  if (respHistorico.error || respHistorico.data?.error) {
    console.error('Falha ao carregar histórico de ponto', respHistorico.error || respHistorico.data.error);
  } else {
    _meuHistoricoPonto = respHistorico.data.registros || [];
  }
  render();
}

function proximoTipoPonto() {
  if (_meusRegistrosPontoHoje.length === 0) return 'entrada';
  return _meusRegistrosPontoHoje[_meusRegistrosPontoHoje.length - 1].tipo === 'entrada' ? 'saida' : 'entrada';
}

function minutosTrabalhadosEm(registros) {
  let minutos = 0;
  let aberta = null;
  registros.forEach((r) => {
    if (r.tipo === 'entrada') {
      aberta = r.registrado_em;
    } else if (r.tipo === 'saida' && aberta) {
      minutos += (new Date(r.registrado_em) - new Date(aberta)) / 60000;
      aberta = null;
    }
  });
  return Math.round(minutos);
}
function formatarMinutos(mins) {
  if (!mins) return '0h00';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}
function formatarHora(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

async function baterPonto() {
  if (_pontoBatendoAgora) return; // trava contra duplo-clique/duplo-toque
  _pontoBatendoAgora = true;
  render();
  const colaborador = state.colaboradores.find((c) => c.perfilId === meuPerfilId);
  const { data, error } = await sb.functions.invoke('ponto', {
    body: { action: 'bater', colaboradorId: colaborador ? colaborador.id : null },
  });
  _pontoBatendoAgora = false;
  if (error || data?.error) {
    console.error('Falha ao bater ponto', error || data.error);
    showToast('Não foi possível registrar o ponto. Tente novamente.');
    render();
    return;
  }
  // O tipo (entrada/saída) é decidido pela Edge Function, não aqui — evita
  // que duas abas/toques quase simultâneos gerem duas entradas seguidas.
  showToast(data.registro.tipo === 'entrada' ? 'Entrada registrada.' : 'Saída registrada.');
  await carregarDadosPonto();
}

function iconePonto(nome) {
  const icones = {
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendario: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 9h18"/>',
    entrada:
      '<path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/><polyline points="9 16 14 12 9 8"/><line x1="14" y1="12" x2="2" y2="12"/>',
    saida:
      '<path d="M9 21H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/><polyline points="15 8 20 12 15 16"/><line x1="20" y1="12" x2="8" y2="12"/>',
  };
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icones[nome]}</svg>`;
}

// Total trabalhado por dia, dos últimos PONTO_DIAS_HISTORICO dias — usado
// tanto pro gráfico quanto pro KPI "trabalhado na semana".
function totaisPorDia() {
  const hoje = new Date();
  const dias = [];
  for (let i = PONTO_DIAS_HISTORICO - 1; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    const chave = d.toISOString().slice(0, 10);
    const doDia = _meuHistoricoPonto.filter((r) => r.registrado_em.slice(0, 10) === chave);
    dias.push({ data: d, chave, minutos: minutosTrabalhadosEm(doDia) });
  }
  return dias;
}

function pagePonto() {
  // Primeira renderização da tela: dispara o carregamento em segundo plano
  // e a tela já reaparece sozinha (render() ao final de carregarDadosPonto).
  if (!_pontoJaCarregouUmaVez) {
    _pontoJaCarregouUmaVez = true;
    carregarDadosPonto();
  }

  const proximo = proximoTipoPonto();
  const agora = new Date();
  const minutosHoje = minutosTrabalhadosEm(_meusRegistrosPontoHoje);
  const dias = totaisPorDia();
  const minutosSemana = dias.reduce((soma, d) => soma + d.minutos, 0);
  const ultimaBatida = _meusRegistrosPontoHoje[_meusRegistrosPontoHoje.length - 1];
  const maxMinutosGrafico = Math.max(480, ...dias.map((d) => d.minutos)); // piso de 8h pra escala não ficar exagerada em dias curtos

  return `
    <div class="page-head">
      <div class="eyebrow">Pessoas</div>
      <h1>Ponto</h1>
      <p class="page-desc">Registre sua entrada e saída. O RH exporta o consolidado da semana em Relatórios.</p>
    </div>

    <div class="grid2" style="align-items:stretch;">
      <div class="card ponto-hero">
        <div class="ponto-hero-relogio">${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
        <div class="small-muted" style="text-transform:capitalize;">
          ${agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
        </div>
        <span class="pill ${proximo === 'entrada' ? 'pill-alavancar' : 'pill-iniciar'}" style="margin-top:14px;">
          ${iconePonto(proximo)} Próximo registro: ${proximo === 'entrada' ? 'entrada' : 'saída'}
        </span>
        <button class="btn btn-primary ponto-btn-bater" ${_pontoBatendoAgora || _pontoCarregando ? 'disabled' : ''} onclick="baterPonto()">
          ${_pontoBatendoAgora ? 'Registrando…' : 'Bater ponto'}
        </button>
      </div>

      <div class="ponto-kpis">
        <div class="kpi-card-inetris">
          <div class="kpi-card-icone">${iconePonto('relogio')}</div>
          <div>
            <div class="kpi-card-label">Trabalhado hoje</div>
            <div class="kpi-card-valor">${formatarMinutos(minutosHoje)}</div>
          </div>
        </div>
        <div class="kpi-card-inetris">
          <div class="kpi-card-icone">${iconePonto(ultimaBatida?.tipo === 'saida' ? 'saida' : 'entrada')}</div>
          <div>
            <div class="kpi-card-label">Última batida</div>
            <div class="kpi-card-valor" style="font-size:18px;">
              ${ultimaBatida ? `${ultimaBatida.tipo === 'entrada' ? 'Entrada' : 'Saída'} · ${formatarHora(ultimaBatida.registrado_em)}` : '—'}
            </div>
          </div>
        </div>
        <div class="kpi-card-inetris">
          <div class="kpi-card-icone">${iconePonto('calendario')}</div>
          <div>
            <div class="kpi-card-label">Trabalhado nos últimos ${PONTO_DIAS_HISTORICO} dias</div>
            <div class="kpi-card-valor">${formatarMinutos(minutosSemana)}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Últimos ${PONTO_DIAS_HISTORICO} dias</h3>
      ${
        _pontoCarregando
          ? '<div class="empty">Carregando…</div>'
          : `
        <div class="ponto-grafico">
          ${dias
            .map((d) => {
              const alturaPct = Math.max(4, Math.round((d.minutos / maxMinutosGrafico) * 100));
              const ehHoje = d.chave === new Date().toISOString().slice(0, 10);
              return `
              <div class="ponto-grafico-col" title="${d.data.toLocaleDateString('pt-BR')} — ${formatarMinutos(d.minutos)}">
                <div class="ponto-grafico-valor">${d.minutos ? formatarMinutos(d.minutos) : ''}</div>
                <div class="ponto-grafico-barra-trilha">
                  <div class="ponto-grafico-barra ${ehHoje ? 'hoje' : ''}" style="height:${alturaPct}%;"></div>
                </div>
                <div class="ponto-grafico-label ${ehHoje ? 'hoje' : ''}">${d.data.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</div>
              </div>
            `;
            })
            .join('')}
        </div>
      `
      }
    </div>

    <div class="card">
      <h3>Hoje</h3>
      ${
        _pontoCarregando
          ? '<div class="empty">Carregando…</div>'
          : _meusRegistrosPontoHoje.length === 0
            ? '<div class="empty">Nenhum registro ainda hoje.</div>'
            : `
        <div class="ponto-timeline">
          ${_meusRegistrosPontoHoje
            .map(
              (r) => `
            <div class="ponto-timeline-item">
              <div class="ponto-timeline-icone ${r.tipo === 'entrada' ? 'in' : 'out'}">${iconePonto(r.tipo)}</div>
              <div>
                <div class="ponto-timeline-tipo">${r.tipo === 'entrada' ? 'Entrada' : 'Saída'}</div>
                <div class="small-muted" style="font-family:var(--mono);">${formatarHora(r.registrado_em)}</div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `
      }
    </div>
  `;
}
