/* =========================================================
   CONFERÊNCIA DE PONTO (RH/Admin)
   -----------------------------------------------------------
   Tabela pra o RH conferir as batidas com a foto (selfie) de cada
   uma: nome da conta de login, data/hora, tipo e a imagem. As fotos
   vêm por URL assinada temporária (bucket é privado) da Edge Function
   "ponto" (action conferencia). Agrupável por colaborador.
   ========================================================= */

let _confRegistros = [];
let _confCarregando = false;
let _confJaCarregou = false;
let _confInicio = null; // AAAA-MM-DD
let _confFim = null;
let _confAgruparPorPessoa = true;
let _confFotoAmpliada = null; // URL da foto aberta em tela cheia

function _confDatasPadrao() {
  // Padrão: últimos 7 dias.
  const hoje = new Date();
  const seteAtras = new Date(hoje);
  seteAtras.setDate(seteAtras.getDate() - 6);
  if (!_confInicio) _confInicio = seteAtras.toISOString().slice(0, 10);
  if (!_confFim) _confFim = hoje.toISOString().slice(0, 10);
}

async function carregarConferencia() {
  _confCarregando = true;
  render();
  const inicio = new Date(`${_confInicio}T00:00:00`);
  const fim = new Date(`${_confFim}T00:00:00`);
  fim.setDate(fim.getDate() + 1); // inclui o dia final inteiro
  const { data, error } = await sb.functions.invoke('ponto', {
    body: { action: 'conferencia', inicioISO: inicio.toISOString(), fimISO: fim.toISOString() },
  });
  _confCarregando = false;
  if (error || data?.error) {
    console.error('Falha ao carregar conferência', error || data?.error);
    showToast((data && data.error) || 'Não foi possível carregar a conferência.');
    render();
    return;
  }
  _confRegistros = data.registros || [];
  render();
}

function _confFmtDataHora(iso) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
}

function _confLinhaHTML(r) {
  const tipoPill = r.tipo === 'entrada' ? 'pill-alavancar' : 'pill-iniciar';
  const foto = r.selfieUrl
    ? `<img src="${r.selfieUrl}" alt="selfie" class="conf-foto" onclick="_confFotoAmpliada='${r.selfieUrl}';render();">`
    : '<span class="small-muted">sem foto</span>';
  return `
    <tr>
      <td><b>${escaparHtml(r.nome)}</b></td>
      <td style="font-family:var(--mono);">${_confFmtDataHora(r.registrado_em)}</td>
      <td><span class="pill ${tipoPill}">${r.tipo === 'entrada' ? 'Entrada' : 'Saída'}</span></td>
      <td>${r.validado_qr ? '<span class="pill pill-neutral">QR</span>' : '<span class="small-muted">—</span>'}</td>
      <td>${foto}</td>
    </tr>`;
}

function pageConferenciaPonto() {
  _confDatasPadrao();
  if (!_confJaCarregou) {
    _confJaCarregou = true;
    carregarConferencia();
  }

  let corpo;
  if (_confCarregando) {
    corpo = '<div class="empty">Carregando…</div>';
  } else if (!_confRegistros.length) {
    corpo = '<div class="empty">Nenhuma batida no período selecionado.</div>';
  } else if (_confAgruparPorPessoa) {
    // Agrupa por nome (conta de login).
    const grupos = {};
    _confRegistros.forEach((r) => {
      (grupos[r.nome] = grupos[r.nome] || []).push(r);
    });
    corpo = Object.keys(grupos)
      .sort((a, b) => a.localeCompare(b))
      .map(
        (nome) => `
        <div class="conf-grupo">
          <div class="conf-grupo-titulo">${escaparHtml(nome)} <span class="small-muted">· ${grupos[nome].length} batida${grupos[nome].length === 1 ? '' : 's'}</span></div>
          <table>
            <thead><tr><th>Conta</th><th>Data e hora</th><th>Tipo</th><th>Validação</th><th>Foto</th></tr></thead>
            <tbody>${grupos[nome].map(_confLinhaHTML).join('')}</tbody>
          </table>
        </div>`
      )
      .join('');
  } else {
    corpo = `
      <table>
        <thead><tr><th>Conta</th><th>Data e hora</th><th>Tipo</th><th>Validação</th><th>Foto</th></tr></thead>
        <tbody>${_confRegistros.map(_confLinhaHTML).join('')}</tbody>
      </table>`;
  }

  return `
    <div class="page-head">
      <div class="eyebrow">Pessoas · Ponto</div>
      <h1>Conferência de Ponto</h1>
      <p class="page-desc">Confira as batidas com a foto de cada registro. A identificação é pela conta de login; a foto serve para o RH validar visualmente quem bateu.</p>
    </div>

    <div class="card">
      <div class="grid3" style="align-items:end;">
        <div class="field"><label>De</label><input type="date" value="${_confInicio}" onchange="_confInicio=this.value;"></div>
        <div class="field"><label>Até</label><input type="date" value="${_confFim}" onchange="_confFim=this.value;"></div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="carregarConferencia()">Buscar</button>
          <button class="btn btn-ghost" onclick="_confAgruparPorPessoa=!_confAgruparPorPessoa;render();">${_confAgruparPorPessoa ? 'Ver em lista' : 'Agrupar por pessoa'}</button>
        </div>
      </div>
    </div>

    <div class="card">
      ${corpo}
    </div>

    ${
      _confFotoAmpliada
        ? `
      <div class="conf-lightbox" onclick="_confFotoAmpliada=null;render();">
        <img src="${_confFotoAmpliada}" alt="selfie ampliada">
        <div class="conf-lightbox-dica">Toque para fechar</div>
      </div>`
        : ''
    }
  `;
}
