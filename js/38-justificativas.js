/* =========================================================
   JUSTIFICATIVAS / ABONOS DE PONTO
   -----------------------------------------------------------
   Colaborador cria pedidos (falta, atraso/saída, ajuste de ponto,
   atestado com foto) na tela de Ponto; gestor/RH aprova/rejeita na
   Conferência de Ponto. Justificativa aprovada abona o dia (o
   cálculo de atraso/falta ignora). Tudo passa pela Edge Function
   "ponto" (ações justificativa_*).
   ========================================================= */

const JUSTIF_TIPOS = {
  falta: 'Falta (dia inteiro)',
  atraso_saida: 'Atraso / saída antecipada',
  ajuste_ponto: 'Esqueci de bater o ponto (ajuste)',
  atestado: 'Atestado médico',
};

let _minhasJustificativas = [];
let _justifCarregando = false;
let _justifJaCarregou = false;
let _justifForm = { tipo: 'falta', dataRef: '', motivo: '', horaAjuste: '' };
let _justifFotoBase64 = null; // foto do atestado capturada
let _justifStreamFoto = null;
let _justifCameraAberta = false; // intenção de abrir a câmera do atestado (quebra o ciclo render/câmera)
let _justifEnviando = false;

async function carregarMinhasJustificativas() {
  _justifCarregando = true;
  const { data, error } = await sb.functions.invoke('ponto', { body: { action: 'justificativa_minhas' } });
  _justifCarregando = false;
  if (!error && data && !data.error) _minhasJustificativas = data.justificativas || [];
  render();
}

function _justifStatusPill(s) {
  if (s === 'aprovada') return 'pill-alavancar';
  if (s === 'rejeitada') return 'pill-iniciar';
  return 'pill-desenvolver';
}
function _justifStatusLabel(s) {
  return s === 'aprovada' ? 'Aprovada' : s === 'rejeitada' ? 'Rejeitada' : 'Pendente';
}

// ---- Foto do atestado (câmera) ----
// Fluxo correto: marca a intenção → render() cria o <video> → aí liga a
// câmera (senão tenta abrir num elemento que ainda não existe).
// Alternativa à câmera ao vivo: no celular, o seletor de arquivo com
// accept=image/* já abre a câmera nativa ou a galeria — mais confiável.
function fotoAtestadoDeArquivo(input) {
  const arquivo = input.files && input.files[0];
  if (!arquivo) return;
  const leitor = new FileReader();
  leitor.onload = (e) => {
    _justifFotoBase64 = e.target.result;
    _justifCameraAberta = false;
    render();
  };
  leitor.readAsDataURL(arquivo);
}

function abrirCameraAtestado() {
  _justifCameraAberta = true;
  render();
  setTimeout(iniciarCameraAtestado, 80);
}
function cancelarCameraAtestado() {
  pararCameraAtestado();
  _justifCameraAberta = false;
  render();
}
function iniciarCameraAtestado() {
  const video = document.getElementById('atestado-video');
  if (!video || !navigator.mediaDevices?.getUserMedia) {
    showToast('A câmera não está disponível neste navegador.');
    _justifCameraAberta = false;
    render();
    return;
  }
  // Câmera traseira de preferência; se falhar, tenta qualquer câmera.
  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: 'environment' } })
    .then((stream) => {
      _justifStreamFoto = stream;
      video.srcObject = stream;
      video.play();
    })
    .catch(() => {
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((stream) => {
          _justifStreamFoto = stream;
          video.srcObject = stream;
          video.play();
        })
        .catch((e) => {
          const nome = e && (e.name || e.toString());
          if (String(nome).includes('NotAllowed') || String(nome).includes('Permission')) {
            showToast('Permissão de câmera negada. Autorize no cadeado ao lado do endereço e tente de novo.');
          } else if (String(nome).includes('NotReadable') || String(nome).includes('Track')) {
            showToast('Câmera ocupada por outro app. Feche-os e tente de novo.');
          } else {
            showToast('Não foi possível abrir a câmera. Você pode enviar sem a foto.');
          }
          _justifCameraAberta = false;
          render();
        });
    });
}
function pararCameraAtestado() {
  if (_justifStreamFoto) {
    _justifStreamFoto.getTracks().forEach((t) => t.stop());
    _justifStreamFoto = null;
  }
}
function capturarFotoAtestado() {
  const video = document.getElementById('atestado-video');
  if (!video) return;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  _justifFotoBase64 = canvas.toDataURL('image/jpeg', 0.7);
  pararCameraAtestado();
  _justifCameraAberta = false;
  render();
}
function removerFotoAtestado() {
  _justifFotoBase64 = null;
  _justifCameraAberta = false;
  render();
}

async function enviarJustificativa() {
  const tipo = _justifForm.tipo || 'falta';
  const dataRef = document.getElementById('justif_data').value;
  const motivo = document.getElementById('justif_motivo').value.trim();
  const horaAjuste = document.getElementById('justif_hora')?.value || '';
  const qtdDias = parseInt(document.getElementById('justif_dias')?.value, 10) || 1;
  if (!dataRef || !motivo) {
    showToast('Preencha a data e o motivo.');
    return;
  }
  _justifEnviando = true;
  render();
  const colaborador = state.colaboradores.find((c) => c.perfilId === meuPerfilId);
  const { data, error } = await sb.functions.invoke('ponto', {
    body: {
      action: 'justificativa_criar',
      tipo,
      dataRef,
      motivo,
      horaAjuste: horaAjuste || undefined,
      qtdDias,
      colaboradorId: colaborador ? colaborador.id : null,
      atestadoBase64: _justifFotoBase64 || undefined,
    },
  });
  _justifEnviando = false;
  if (error || data?.error) {
    showToast((data && data.error) || 'Não foi possível enviar. Tente novamente.');
    render();
    return;
  }
  _justifForm = { tipo: 'falta', dataRef: '', motivo: '', horaAjuste: '' };
  _justifFotoBase64 = null;
  showToast(
    tipo === 'atestado'
      ? 'Atestado registrado e abonado automaticamente. O RH ainda poderá conferir a foto.'
      : 'Justificativa enviada. Aguarde a decisão do seu gestor.'
  );
  await carregarMinhasJustificativas();
}

// Card mostrado na tela de Ponto (visão do colaborador).
function renderCardJustificativas() {
  if (!_justifJaCarregou) {
    _justifJaCarregou = true;
    carregarMinhasJustificativas();
  }
  const tipoAtual = _justifForm.tipo || 'falta';
  return `
    <div class="card">
      <h3>Justificativas e abonos <small>faltas, atrasos, ajustes e atestados</small></h3>

      <div class="grid2" style="align-items:start;">
        <div class="field"><label>Tipo</label>
          <select id="justif_tipo" onchange="_justifForm.tipo=this.value;render();">
            ${Object.entries(JUSTIF_TIPOS)
              .map(([v, l]) => `<option value="${v}" ${v === tipoAtual ? 'selected' : ''}>${l}</option>`)
              .join('')}
          </select>
        </div>
        <div class="field"><label>Data${tipoAtual === 'falta' || tipoAtual === 'atestado' ? ' de início' : ''}</label><input id="justif_data" type="date"></div>
      </div>
      <div class="field" id="justif_dias_wrap" style="${tipoAtual === 'falta' || tipoAtual === 'atestado' ? '' : 'display:none;'}">
        <label>Quantos dias? <small>(ex: uma viagem de 3 dias)</small></label>
        <input id="justif_dias" type="number" min="1" max="60" value="1">
      </div>
      <div class="field" id="justif_hora_wrap" style="${tipoAtual === 'ajuste_ponto' ? '' : 'display:none;'}">
        <label>Horário correto <small>(HH:MM — o horário que deveria ter batido)</small></label>
        <input id="justif_hora" type="time">
      </div>
      <div class="field"><label>Motivo / descrição</label><textarea id="justif_motivo" placeholder="Explique o que aconteceu"></textarea></div>

      ${
        tipoAtual === 'atestado'
          ? `
        <div class="field">
          <label>Foto do atestado ${_justifFotoBase64 ? '' : '(opcional)'}</label>
          ${
            _justifFotoBase64
              ? `<div style="display:flex;gap:10px;align-items:center;">
                   <img src="${_justifFotoBase64}" alt="atestado" style="width:90px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--line);">
                   <button class="btn btn-ghost btn-sm" onclick="removerFotoAtestado()">Trocar foto</button>
                 </div>`
              : `<label class="btn btn-ghost btn-sm" style="cursor:pointer;margin:0;display:inline-block;">Tirar foto ou escolher da galeria<input type="file" accept="image/*" style="display:none;" onchange="fotoAtestadoDeArquivo(this)"></label>`
          }
        </div>`
          : ''
      }

      <button class="btn btn-primary" onclick="enviarJustificativa()" ${_justifEnviando ? 'disabled' : ''}>${_justifEnviando ? 'Enviando…' : 'Enviar justificativa'}</button>

      <div style="margin-top:18px;">
        <div class="small-muted" style="text-transform:uppercase;letter-spacing:.06em;font-size:11px;margin-bottom:8px;">Meus pedidos</div>
        ${
          _justifCarregando
            ? '<div class="empty">Carregando…</div>'
            : !_minhasJustificativas.length
              ? '<div class="empty">Você ainda não enviou nenhuma justificativa.</div>'
              : `<table><thead><tr><th>Tipo</th><th>Data</th><th>Status</th></tr></thead><tbody>
                ${_minhasJustificativas
                  .map(
                    (j) =>
                      `<tr><td>${JUSTIF_TIPOS[j.tipo] || j.tipo}</td><td class="small-muted">${new Date(`${j.data_ref}T00:00:00`).toLocaleDateString('pt-BR')}${j.qtd_dias > 1 ? ' (' + j.qtd_dias + ' dias)' : ''}</td><td><span class="pill ${_justifStatusPill(j.status)}">${_justifStatusLabel(j.status)}</span>${j.motivo_decisao ? `<br><span class="small-muted" style="font-size:11px;">${escaparHtml(j.motivo_decisao)}</span>` : ''}</td></tr>`
                  )
                  .join('')}
              </tbody></table>`
        }
      </div>
    </div>`;
}

/* =========== Aprovação (gestor/RH) — usada na Conferência de Ponto =========== */
let _justifPendentes = [];
let _justifPendCarregando = false;
let _justifPendJaCarregou = false;
let _justifFiltroStatus = 'pendente';

async function carregarJustificativasPendentes() {
  _justifPendCarregando = true;
  render();
  const { data, error } = await sb.functions.invoke('ponto', {
    body: { action: 'justificativa_pendentes', status: _justifFiltroStatus },
  });
  _justifPendCarregando = false;
  if (!error && data && !data.error) _justifPendentes = data.justificativas || [];
  render();
}

async function decidirJustificativa(id, aprovar) {
  const motivoDecisao = aprovar ? '' : prompt('Motivo da recusa (opcional):') || '';
  const { data, error } = await sb.functions.invoke('ponto', {
    body: { action: 'justificativa_decidir', justificativaId: id, aprovar, motivoDecisao },
  });
  if (error || data?.error) {
    showToast((data && data.error) || 'Não foi possível decidir.');
    return;
  }
  showToast(aprovar ? 'Justificativa aprovada.' : 'Justificativa rejeitada.');
  await carregarJustificativasPendentes();
}

function renderSecaoAprovacaoJustificativas() {
  if (!_justifPendJaCarregou) {
    _justifPendJaCarregou = true;
    carregarJustificativasPendentes();
  }
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <h3 style="margin:0;">Justificativas da equipe <small>aprovar ou rejeitar pedidos</small></h3>
        <select onchange="_justifFiltroStatus=this.value;carregarJustificativasPendentes();" style="max-width:180px;">
          <option value="pendente" ${_justifFiltroStatus === 'pendente' ? 'selected' : ''}>Pendentes</option>
          <option value="aprovada" ${_justifFiltroStatus === 'aprovada' ? 'selected' : ''}>Aprovadas</option>
          <option value="rejeitada" ${_justifFiltroStatus === 'rejeitada' ? 'selected' : ''}>Rejeitadas</option>
          <option value="todas" ${_justifFiltroStatus === 'todas' ? 'selected' : ''}>Todas</option>
        </select>
      </div>
      ${
        _justifPendCarregando
          ? '<div class="empty">Carregando…</div>'
          : !_justifPendentes.length
            ? '<div class="empty">Nenhuma justificativa nesse filtro.</div>'
            : `<table><thead><tr><th>Colaborador</th><th>Tipo</th><th>Data</th><th>Motivo</th><th>Atestado</th><th></th></tr></thead><tbody>
              ${_justifPendentes
                .map(
                  (j) => `<tr>
                <td><b>${escaparHtml(j.nome)}</b></td>
                <td>${JUSTIF_TIPOS[j.tipo] || j.tipo}${j.hora_ajuste ? `<br><span class="small-muted">${j.hora_ajuste}</span>` : ''}</td>
                <td class="small-muted">${new Date(`${j.data_ref}T00:00:00`).toLocaleDateString('pt-BR')}${j.qtd_dias > 1 ? ' (' + j.qtd_dias + ' dias)' : ''}</td>
                <td class="small-muted">${escaparHtml(j.motivo || '—')}</td>
                <td>${j.atestadoUrl ? `<img src="${j.atestadoUrl}" alt="atestado" class="conf-foto" onclick="_confFotoAmpliada='${j.atestadoUrl}';render();">` : '<span class="small-muted">—</span>'}</td>
                <td style="white-space:nowrap;">${
                  j.status === 'pendente'
                    ? `<button class="btn btn-sm btn-primary" onclick="decidirJustificativa('${j.id}',true)">Aprovar</button>
                       <button class="btn btn-sm btn-ghost" onclick="decidirJustificativa('${j.id}',false)">Rejeitar</button>`
                    : j.tipo === 'atestado' && j.status === 'aprovada'
                      ? `<span class="pill pill-alavancar">Abonado</span> <button class="btn btn-sm btn-ghost" style="color:var(--iniciar);" onclick="decidirJustificativa('${j.id}',false)" title="Reverter se o atestado for inválido">Reverter</button>`
                      : `<span class="pill ${_justifStatusPill(j.status)}">${_justifStatusLabel(j.status)}</span>`
                }</td>
              </tr>`
                )
                .join('')}
            </tbody></table>`
      }
    </div>
    ${
      typeof _confFotoAmpliada !== 'undefined' && _confFotoAmpliada
        ? `<div class="conf-lightbox" onclick="_confFotoAmpliada=null;render();"><img src="${_confFotoAmpliada}" alt="ampliada"><div class="conf-lightbox-dica">Toque para fechar</div></div>`
        : ''
    }`;
}
