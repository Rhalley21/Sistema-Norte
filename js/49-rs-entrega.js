/* =========================================================
   R&S — RESULTADO ENVIADO PELO CANDIDATO (lado do RH)
   -----------------------------------------------------------
   Nas etapas com teste ou entrega (DISC/GALT, teste lógico, prova teórica e prova prática), o e-mail da etapa traz o
   link do teste (se você configurou) E um botão "Enviar meu resultado". O candidato abre uma página pessoal, anexa até
   3 arquivos (PDF, PNG, JPG ou WEBP, 5 MB cada) e/ou escreve um texto, e envia uma única vez. O Administrador e o RH
   veem o resultado na ficha do candidato; os arquivos abrem por link temporário (10 minutos), e cada abertura fica
   na Auditoria. Guardado por 6 meses.

   Tudo passa pela função "entrega-rs" (login + papel + empresa): o navegador do RH nunca lê as tabelas nem o
   armazenamento direto. O começo do arquivo são funções PURAS (sem tela), testadas.
   ========================================================= */

const ENTREGA_STATUS_RS = {
  enviado: { texto: 'Resultado enviado', classe: 'pill-alavancar' },
  solicitado: { texto: 'Aguardando o candidato', classe: 'pill-desenvolver' },
  expirado: { texto: 'Prazo vencido', classe: 'pill-iniciar' },
  cancelado: { texto: 'Pedido cancelado', classe: 'pill-neutral' },
};

let _rsEntregas = null; // lista do servidor (null = ainda não carregou)
let _rsEntregasCarregando = false;
let _rsEntregasErro = '';
const _rsEntregaLinks = {}; // id do pedido -> link (aparece uma vez)
const _rsEntregaVista = {}; // id do pedido -> resultado aberto (texto e arquivos com link temporário)

function rsEntregaHabilitado() {
  return ['owner', 'rh'].includes(meuPapelReal);
}
function etapaTemEntregaRS(etapaId) {
  return ETAPAS_COM_ENTREGA_RS.includes(etapaId);
}
function entregaStatusRotuloRS(status) {
  return ENTREGA_STATUS_RS[status] || { texto: status, classe: 'pill-neutral' };
}
// Os pedidos de resultado de um candidato (do mais novo para o mais antigo).
function entregasDoCandidatoRS(candidatoId) {
  return (_rsEntregas || []).filter((x) => x.candidato_ref === candidatoId);
}
function entregaDataTextoRS(iso) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '';
}
function entregaTamanhoTextoRS(bytes) {
  if (bytes === null || bytes === undefined) return '';
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ---------- chamadas à função ----------
async function chamarEntregaRS(action, corpo) {
  try {
    const { data, error } = await sb.functions.invoke('entrega-rs', { body: { action, ...(corpo || {}) } });
    if (error) {
      let msg = error.message || 'Falha ao falar com o servidor.';
      let jaEnviado = false;
      try {
        const d = await error.context.json();
        if (d && d.error) msg = d.error;
        jaEnviado = !!(d && d.jaEnviado);
      } catch (e) {
        /* mantém a mensagem genérica */
      }
      return { ok: false, erro: msg, jaEnviado };
    }
    if (data && data.error) return { ok: false, erro: data.error, jaEnviado: !!data.jaEnviado };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, erro: 'Falha ao falar com o servidor.' };
  }
}

async function carregarEntregasRS(forcar) {
  if (_rsEntregasCarregando || (_rsEntregas !== null && !forcar)) return;
  _rsEntregasCarregando = true;
  const r = await chamarEntregaRS('entrega_listar', {});
  _rsEntregasCarregando = false;
  if (r.ok) {
    _rsEntregas = r.data.entregas || [];
    _rsEntregasErro = '';
  } else {
    _rsEntregas = []; // não tenta de novo a cada tela
    _rsEntregasErro = r.erro;
  }
  render();
}

// Cria o pedido de resultado e devolve o link (que vai DENTRO do e-mail da etapa). Se o candidato já enviou o resultado
// desta etapa, devolve jaEnviado e nenhum link.
async function pedirEntregaRS(candidatoId, etapa) {
  const cand = state.rs.candidatos.find((c) => c.id === candidatoId);
  if (!cand) return { ok: false, erro: 'Candidato não encontrado.' };
  const vaga = state.rs.requisicoes.find((r) => r.id === cand.vagaId);
  const cfg = configEfetivaEtapaRS(vaga, etapa);
  const r = await chamarEntregaRS('entrega_solicitar', {
    candidato_ref: cand.id,
    candidato_nome: cand.nome,
    candidato_email: cand.email || '',
    etapa,
    instrucoes: cfg.instrucoes || '',
    validade_dias: etapa === 'prova_pratica' && cfg.prazoDias ? cfg.prazoDias : undefined,
    enviar_email: false,
    url_base: urlBaseVideoRS(),
  });
  if (!r.ok) return { ok: false, erro: r.erro, jaEnviado: !!r.jaEnviado };
  if (!r.data || !r.data.pedido || !r.data.link) return { ok: false, erro: 'Resposta inesperada do servidor.' };
  _rsEntregaLinks[r.data.pedido.id] = r.data.link;
  registrarAuditoria('rs.entrega_solicitada', { candidatoId: cand.id, pedidoId: r.data.pedido.id, etapa });
  return { ok: true, link: r.data.link, prazoISO: r.data.pedido.prazo_ate, pedidoId: r.data.pedido.id };
}

// Entrou numa etapa com entrega: cria o pedido e manda o e-mail da etapa JÁ com o botão "Enviar meu resultado".
// Se o pedido falhar, o e-mail da etapa sai mesmo assim (sem o botão) e o RH é avisado.
async function enviarEtapaComEntregaRS(cand, etapa) {
  const r = await pedirEntregaRS(cand.id, etapa);
  if (!r.ok && !r.jaEnviado)
    showToast(`O pedido de resultado não foi criado (${r.erro}). O e-mail da etapa foi enviado sem o botão de envio.`);
  await enviarEmailEtapaRS(cand, etapa, r.ok ? { entrega: { link: r.link, prazoISO: r.prazoISO } } : {});
  showToast(
    r.ok
      ? `Etapa atualizada — e-mail enviado a ${cand.nome}, com o botão para enviar o resultado.`
      : `Etapa atualizada — e-mail enviado a ${cand.nome}.`
  );
  await carregarEntregasRS(true);
}

async function pedirEntregaAgoraRS(candidatoId, etapa) {
  const cand = state.rs.candidatos.find((c) => c.id === candidatoId);
  if (!cand) return;
  await enviarEtapaComEntregaRS(cand, etapa);
}

async function reenviarEntregaRS(id) {
  const x = (_rsEntregas || []).find((e) => e.id === id);
  if (!x) return;
  const r = await chamarEntregaRS('entrega_reenviar', {
    id,
    enviar_email: !!x.candidato_email,
    url_base: urlBaseVideoRS(),
  });
  if (!r.ok) return showToast(`Não foi possível reenviar: ${r.erro}`);
  _rsEntregaLinks[id] = r.data.link;
  registrarAuditoria('rs.entrega_link_reenviado', { pedidoId: id });
  showToast(
    r.data.emailEnviado
      ? 'Novo link enviado por e-mail (o anterior deixou de valer).'
      : 'Novo link criado (o anterior deixou de valer). Copie e envie ao candidato.'
  );
  await carregarEntregasRS(true);
}

async function cancelarEntregaRS(id) {
  if (!confirm('Cancelar este pedido de resultado? O link enviado ao candidato deixa de funcionar.')) return;
  const r = await chamarEntregaRS('entrega_cancelar', { id });
  if (!r.ok) return showToast(r.erro);
  delete _rsEntregaLinks[id];
  registrarAuditoria('rs.entrega_cancelada', { pedidoId: id });
  await carregarEntregasRS(true);
}

// Abre o resultado: texto e arquivos (links temporários de 10 minutos). Cada abertura fica na Auditoria.
async function verEntregaRS(id) {
  const r = await chamarEntregaRS('entrega_ver', { id });
  if (!r.ok) return showToast(r.erro);
  _rsEntregaVista[id] = { texto: r.data.texto || '', arquivos: r.data.arquivos || [] };
  registrarAuditoria('rs.entrega_vista', { pedidoId: id });
  render();
}
function fecharEntregaVistaRS(id) {
  delete _rsEntregaVista[id];
  render();
}

async function excluirEntregaRS(id) {
  if (!confirm('Excluir este resultado? Os arquivos são apagados de vez e não dá para desfazer.')) return;
  const r = await chamarEntregaRS('entrega_excluir', { id });
  if (!r.ok) return showToast(r.erro);
  delete _rsEntregaVista[id];
  delete _rsEntregaLinks[id];
  registrarAuditoria('rs.entrega_excluida', { pedidoId: id });
  showToast('Resultado excluído.');
  await carregarEntregasRS(true);
}

async function copiarLinkEntregaRS(id) {
  const link = _rsEntregaLinks[id];
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    showToast('Link copiado.');
  } catch (e) {
    prompt('Copie o link:', link);
  }
}

// ---------- o painel na ficha do candidato ----------
function entregaPainelRS(c, vaga) {
  if (!rsEntregaHabilitado() || !vaga) return '';
  const e = escaparHtml;
  const caixa = (conteudo) =>
    `<div style="margin-top:10px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;"><b style="font-size:13px;">Resultados enviados pelo candidato</b> <span class="small-muted">(até 3 arquivos e/ou texto · guardado por 6 meses)</span>${conteudo}</div>`;
  const botao = (rotulo, fn, extra) =>
    `<button class="btn btn-sm ${extra || 'btn-ghost'}" onclick="${fn}">${rotulo}</button>`;
  if (_rsEntregas === null) {
    carregarEntregasRS();
    return caixa('<div class="small-muted" style="margin-top:6px;">Carregando…</div>');
  }
  if (_rsEntregasErro)
    return caixa(
      `<div class="small-muted" style="margin-top:6px;">Não foi possível carregar os resultados agora: ${e(_rsEntregasErro)}</div>`
    );
  const lista = entregasDoCandidatoRS(c.id);
  const naEtapaSemPedido =
    etapaTemEntregaRS(c.etapa) &&
    !c.reprovado &&
    !lista.some((x) => x.etapa === c.etapa && ['solicitado', 'enviado'].includes(x.status));
  if (!lista.length && !naEtapaSemPedido) return '';
  const linhas = lista
    .map((x) => {
      const id = escaparParaOnclick(x.id);
      const rot = entregaStatusRotuloRS(x.status);
      const detalhe =
        x.status === 'enviado'
          ? `<span class="small-muted">enviado em ${e(entregaDataTextoRS(x.enviado_em))} · ${x.qtd_arquivos} arquivo(s)${x.tem_texto ? ' · com texto' : ''}</span>`
          : x.status === 'solicitado'
            ? `<span class="small-muted">link válido até ${e(entregaDataTextoRS(x.prazo_ate))}</span>`
            : '';
      const acoes =
        x.status === 'enviado'
          ? botao('Ver resultado', `verEntregaRS('${id}')`, 'btn-primary') +
            botao('Excluir', `excluirEntregaRS('${id}')`)
          : x.status === 'solicitado'
            ? botao('Reenviar link', `reenviarEntregaRS('${id}')`) +
              botao('Cancelar pedido', `cancelarEntregaRS('${id}')`)
            : x.status === 'expirado'
              ? botao('Reenviar link', `reenviarEntregaRS('${id}')`)
              : '';
      const link =
        _rsEntregaLinks[x.id] && x.status === 'solicitado'
          ? `<div class="small-muted" style="margin-top:6px;font-size:12.5px;">Link do candidato (aparece só agora): <b>${e(_rsEntregaLinks[x.id])}</b> ${botao('Copiar', `copiarLinkEntregaRS('${id}')`)}</div>`
          : '';
      const vista = _rsEntregaVista[x.id];
      const aberto = vista
        ? `<div style="margin-top:8px;padding:8px 10px;background:var(--surface-2);border-radius:8px;">
            ${vista.texto ? `<div style="white-space:pre-wrap;font-size:13px;margin-bottom:6px;">${e(vista.texto)}</div>` : ''}
            ${vista.arquivos.map((a) => `<div style="font-size:13px;">${urlSegura(a.url) ? `<a href="${e(urlSegura(a.url))}" target="_blank" rel="noopener noreferrer">${e(a.nome)}</a>` : e(a.nome)} <span class="small-muted">(${e(entregaTamanhoTextoRS(a.tamanho))})</span></div>`).join('')}
            <div class="small-muted" style="font-size:12px;margin-top:4px;">Links temporários (10 minutos). ${botao('Fechar', `fecharEntregaVistaRS('${id}')`)}</div>
          </div>`
        : '';
      return `<div style="margin-top:8px;"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><b style="font-size:13px;">${e(etapaNomeRS(x.etapa))}</b> <span class="pill ${rot.classe}">${e(rot.texto)}</span> ${detalhe} ${acoes}</div>${link}${aberto}</div>`;
    })
    .join('');
  const pedirAgora = naEtapaSemPedido
    ? `<div style="margin-top:8px;">${botao(`Pedir o resultado de "${e(etapaNomeRS(c.etapa))}" agora`, `pedirEntregaAgoraRS('${escaparParaOnclick(c.id)}', '${escaparParaOnclick(c.etapa)}')`, 'btn-primary')}</div>`
    : '';
  return caixa(linhas + pedirAgora);
}
