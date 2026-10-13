/* =========================================================
   R&S — VÍDEO DE APRESENTAÇÃO (lado do RH)
   -----------------------------------------------------------
   No funil da vaga, o Administrador e o RH pedem o vídeo ao candidato (o candidato recebe um link),
   acompanham, ASSISTEM e excluem. O vídeo tem no máximo 2 MINUTOS e fica guardado por 6 meses.
   Tudo passa pela função "video-rs" (login + papel + empresa): o navegador do RH nunca lê as tabelas
   nem o armazenamento direto. Assistir usa um link temporário (10 minutos) e fica na Auditoria.

   Mover um candidato para a etapa "Vídeo de apresentação" já cria o pedido e manda o link por e-mail,
   com as orientações da vaga (ou da empresa).

   O começo do arquivo são funções PURAS (sem tela), testadas.
   ========================================================= */

const VIDEO_STATUS_RS = {
  enviado: { texto: 'Vídeo enviado', classe: 'pill-alavancar' },
  solicitado: { texto: 'Aguardando o candidato', classe: 'pill-desenvolver' },
  expirado: { texto: 'Prazo vencido', classe: 'pill-iniciar' },
  cancelado: { texto: 'Pedido cancelado', classe: 'pill-neutral' },
};

let _rsVideos = null; // lista que veio do servidor (null = ainda não carregou)
let _rsVideosCarregando = false;
let _rsVideosErro = '';
const _rsVideoLinks = {}; // id do pedido -> link (aparece uma vez; não fica guardado em lugar nenhum)
const _rsVideoPlayers = {}; // id do pedido -> { url, mime }

function rsVideoHabilitado() {
  return ['owner', 'rh'].includes(meuPapelReal);
}
function vagaUsaVideoRS(vaga) {
  return etapasAtivasDaVagaRS(vaga).some((e) => e.id === 'video');
}
// O pedido mais recente do candidato (a lista do servidor já vem do mais novo para o mais antigo).
function videoDoCandidatoRS(candidatoId) {
  return (_rsVideos || []).find((v) => v.candidato_ref === candidatoId) || null;
}
function videoStatusRotuloRS(status) {
  return VIDEO_STATUS_RS[status] || { texto: status, classe: 'pill-neutral' };
}
function videoTamanhoTextoRS(bytes) {
  if (bytes === null || bytes === undefined) return '';
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
function videoDuracaoTextoRS(seg) {
  if (seg === null || seg === undefined) return '';
  const s = Math.max(0, Math.round(seg));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function videoDataTextoRS(iso) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '';
}

// ---------- chamadas à função ----------
async function chamarVideoRS(action, corpo) {
  try {
    const { data, error } = await sb.functions.invoke('video-rs', { body: { action, ...(corpo || {}) } });
    if (error) {
      let msg = error.message || 'Falha ao falar com o servidor.';
      try {
        const d = await error.context.json();
        if (d && d.error) msg = d.error;
      } catch (e) {
        /* mantém a mensagem genérica */
      }
      return { ok: false, erro: msg };
    }
    if (data && data.error) return { ok: false, erro: data.error };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, erro: 'Falha ao falar com o servidor.' };
  }
}

async function carregarVideosRS(forcar) {
  if (_rsVideosCarregando || (_rsVideos !== null && !forcar)) return;
  _rsVideosCarregando = true;
  const r = await chamarVideoRS('video_listar', {});
  _rsVideosCarregando = false;
  if (r.ok) {
    _rsVideos = r.data.videos || [];
    _rsVideosErro = '';
  } else {
    _rsVideos = []; // não tenta de novo a cada tela (e não fica piscando erro)
    _rsVideosErro = r.erro;
  }
  render();
}

// URL da pasta do site em que o RH está (o servidor só aceita o próprio site).
function urlBaseVideoRS() {
  return `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`;
}

async function pedirVideoRS(candidatoId, opcoes) {
  const cand = state.rs.candidatos.find((c) => c.id === candidatoId);
  if (!cand) return;
  const vaga = state.rs.requisicoes.find((r) => r.id === cand.vagaId);
  const cfg = configEfetivaEtapaRS(vaga, 'video');
  const r = await chamarVideoRS('video_solicitar', {
    candidato_ref: cand.id,
    candidato_nome: cand.nome,
    candidato_email: cand.email || '',
    instrucoes: cfg.instrucoes || '',
    enviar_email: !!cand.email,
    url_base: urlBaseVideoRS(),
  });
  if (!r.ok) {
    showToast(`Não foi possível pedir o vídeo: ${r.erro}`);
    if (opcoes && opcoes.automatico) enviarEmailEtapaRS(cand, 'video'); // pelo menos o aviso da etapa sai
    return;
  }
  _rsVideoLinks[r.data.pedido.id] = r.data.link;
  registrarAuditoria('rs.video_solicitado', { candidatoId: cand.id, pedidoId: r.data.pedido.id });
  showToast(
    r.data.emailEnviado
      ? `Pedido de vídeo enviado por e-mail a ${cand.nome}.`
      : 'Pedido criado. Copie o link e envie ao candidato.'
  );
  await carregarVideosRS(true);
}

async function reenviarVideoRS(id) {
  const v = (_rsVideos || []).find((x) => x.id === id);
  if (!v) return;
  const r = await chamarVideoRS('video_reenviar', {
    id,
    enviar_email: !!v.candidato_email,
    url_base: urlBaseVideoRS(),
  });
  if (!r.ok) return showToast(`Não foi possível reenviar: ${r.erro}`);
  _rsVideoLinks[id] = r.data.link;
  registrarAuditoria('rs.video_link_reenviado', { pedidoId: id });
  showToast(
    r.data.emailEnviado
      ? 'Novo link enviado por e-mail (o anterior deixou de valer).'
      : 'Novo link criado (o anterior deixou de valer). Copie e envie ao candidato.'
  );
  await carregarVideosRS(true);
}

async function cancelarVideoRS(id) {
  if (!confirm('Cancelar este pedido de vídeo? O link enviado ao candidato deixa de funcionar.')) return;
  const r = await chamarVideoRS('video_cancelar', { id });
  if (!r.ok) return showToast(r.erro);
  delete _rsVideoLinks[id];
  registrarAuditoria('rs.video_cancelado', { pedidoId: id });
  await carregarVideosRS(true);
}

// Abre o vídeo por um link temporário (10 minutos). Cada abertura fica na Auditoria.
async function assistirVideoRS(id) {
  const r = await chamarVideoRS('video_assistir', { id });
  if (!r.ok) return showToast(r.erro);
  _rsVideoPlayers[id] = { url: r.data.url, mime: r.data.mime };
  registrarAuditoria('rs.video_assistido', { pedidoId: id });
  render();
}
function fecharVideoRS(id) {
  delete _rsVideoPlayers[id];
  render();
}

async function excluirVideoRS(id) {
  if (!confirm('Excluir este vídeo? O arquivo é apagado de vez e não dá para desfazer.')) return;
  const r = await chamarVideoRS('video_excluir', { id });
  if (!r.ok) return showToast(r.erro);
  delete _rsVideoPlayers[id];
  delete _rsVideoLinks[id];
  registrarAuditoria('rs.video_excluido', { pedidoId: id });
  showToast('Vídeo excluído.');
  await carregarVideosRS(true);
}

async function copiarLinkVideoRS(id) {
  const link = _rsVideoLinks[id];
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    showToast('Link copiado.');
  } catch (e) {
    prompt('Copie o link:', link);
  }
}

// ---------- o painel no funil (por candidato) ----------
function videoPainelRS(c, vaga) {
  if (!rsVideoHabilitado() || !vaga || !vagaUsaVideoRS(vaga)) return '';
  const e = escaparHtml;
  const caixa = (conteudo) =>
    `<div style="margin-top:10px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;"><b style="font-size:13px;">Vídeo de apresentação</b> <span class="small-muted">(até 2 minutos · guardado por 6 meses)</span>${conteudo}</div>`;
  if (_rsVideos === null) {
    carregarVideosRS();
    return caixa('<div class="small-muted" style="margin-top:6px;">Carregando…</div>');
  }
  if (_rsVideosErro)
    return caixa(
      `<div class="small-muted" style="margin-top:6px;">Não foi possível carregar os vídeos agora: ${e(_rsVideosErro)}</div>`
    );
  const v = videoDoCandidatoRS(c.id);
  const id = v ? escaparParaOnclick(v.id) : '';
  const botao = (rotulo, fn, extra) =>
    `<button class="btn btn-sm ${extra || 'btn-ghost'}" onclick="${fn}">${rotulo}</button>`;
  if (!v || v.status === 'cancelado') {
    return caixa(`<div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      ${v ? `<span class="pill ${videoStatusRotuloRS(v.status).classe}">${e(videoStatusRotuloRS(v.status).texto)}</span>` : ''}
      ${botao(c.email ? 'Pedir vídeo (envia o link por e-mail)' : 'Pedir vídeo (gera um link para copiar)', `pedirVideoRS('${escaparParaOnclick(c.id)}')`, 'btn-primary')}
    </div>`);
  }
  const rot = videoStatusRotuloRS(v.status);
  let detalhes = '';
  if (v.status === 'enviado') {
    detalhes = `<span class="small-muted">enviado em ${e(videoDataTextoRS(v.enviado_em))}${v.duracao_s !== null ? ` · ${e(videoDuracaoTextoRS(v.duracao_s))}` : ''}${v.tamanho_bytes !== null ? ` · ${e(videoTamanhoTextoRS(v.tamanho_bytes))}` : ''}</span>`;
    if (v.acima_do_limite)
      detalhes +=
        ' <span class="pill pill-iniciar" title="A duração é informada pelo navegador do candidato">acima de 2 min</span>';
  } else if (v.status === 'solicitado') {
    detalhes = `<span class="small-muted">link válido até ${e(videoDataTextoRS(v.prazo_ate))}</span>`;
  }
  const acoes =
    v.status === 'enviado'
      ? botao('Assistir', `assistirVideoRS('${id}')`, 'btn-primary') + botao('Excluir vídeo', `excluirVideoRS('${id}')`)
      : v.status === 'solicitado'
        ? botao('Reenviar link', `reenviarVideoRS('${id}')`) + botao('Cancelar pedido', `cancelarVideoRS('${id}')`)
        : botao('Reenviar link', `reenviarVideoRS('${id}')`);
  const link =
    _rsVideoLinks[v.id] && v.status === 'solicitado'
      ? `<div style="margin-top:8px;font-size:12.5px;" class="small-muted">Link do candidato (aparece só agora): <b>${e(_rsVideoLinks[v.id])}</b> ${botao('Copiar', `copiarLinkVideoRS('${id}')`)}</div>`
      : '';
  const player = _rsVideoPlayers[v.id]
    ? `<div style="margin-top:10px;"><video controls playsinline src="${e(_rsVideoPlayers[v.id].url)}" style="width:100%;max-width:420px;background:#000;border-radius:8px;"></video>
        <div class="small-muted" style="font-size:12px;">Link temporário (10 minutos). ${botao('Fechar', `fecharVideoRS('${id}')`)}</div></div>`
    : '';
  return caixa(`<div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <span class="pill ${rot.classe}">${e(rot.texto)}</span> ${detalhes} ${acoes}</div>${link}${player}`);
}
