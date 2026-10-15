/* =========================================================
   R&S — QUADRO DA VAGA (a forma simples de trabalhar o processo seletivo)
   -----------------------------------------------------------
   Em vez de uma tabela com uma lista de 13 etapas por candidato, a vaga vira um QUADRO de 4 fases:
     1. Entrada   2. Avaliação   3. Entrevistas e provas   4. Decisão
   Cada candidato é um cartão com um botão AVANÇAR (vai direto para a próxima etapa DESTA vaga — as etapas que a
   vaga desligou são puladas). Clicar no nome abre a FICHA da pessoa, com os dados, o histórico e a ação da
   etapa em que ela está (vídeo, scorecard, prova prática...). No topo da tela, "Para você fazer agora" mostra só o
   que pede ação.

   O catálogo de etapas e as regras por vaga ficam em js/45; o vídeo, em js/46; as vagas, em js/40.
   O começo do arquivo são funções PURAS (sem tela), testadas.
   ========================================================= */

// As 13 etapas (mais "nova", "proposta" e "aprovado") agrupadas em 4 fases.
const FASES_PROCESSO_RS = [
  { id: 'entrada', nome: '1. Entrada', etapas: ['nova', 'triagem'] },
  { id: 'avaliacao', nome: '2. Avaliação', etapas: ['disc_galt', 'video', 'redes_sociais', 'checagem_curriculo'] },
  {
    id: 'entrevistas',
    nome: '3. Entrevistas e provas',
    etapas: ['entrevista_fit', 'teste_logico', 'prova_teorica', 'prova_pratica', 'entrevista_final'],
  },
  { id: 'decisao', nome: '4. Decisão', etapas: ['escolha', 'proposta', 'aprovado'] },
];

function faseDaEtapaRS(etapaId) {
  return FASES_PROCESSO_RS.find((f) => f.etapas.includes(etapaId)) || null;
}

// Separa os candidatos de uma vaga por fase (na ordem das etapas) e à parte os reprovados/desistentes.
function agruparPorFaseRS(candidatos) {
  const ordem = ETAPAS_RS.map((e) => e.id);
  const ativos = (candidatos || []).filter((c) => !c.reprovado);
  const porNome = (a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR');
  return {
    fases: FASES_PROCESSO_RS.map((fase) => ({
      fase,
      candidatos: ativos
        .filter((c) => fase.etapas.includes(c.etapa))
        .sort((a, b) => ordem.indexOf(a.etapa) - ordem.indexOf(b.etapa) || porNome(a, b)),
    })),
    reprovados: (candidatos || []).filter((c) => c.reprovado).sort(porNome),
  };
}

// "Para você fazer agora": só o que pede ação, com a vaga onde resolver.
function acoesPendentesRS({
  requisicoes,
  candidatos,
  videos,
  entregas,
  candidaturasPendentes,
  vagaSelecionadaId,
  gestor,
}) {
  const abertas = (requisicoes || []).filter((r) => r.status === 'aprovada' && !r.encerrada);
  const idsAbertas = new Set(abertas.map((r) => r.id));
  const naVaga = (c) => c.vagaId && idsAbertas.has(c.vagaId) && !c.reprovado;
  const acoes = [];
  const paraAprovar = (requisicoes || []).filter((r) => r.status === 'pendente').length;
  if (gestor && paraAprovar)
    acoes.push({ chave: 'aprovar', total: paraAprovar, texto: `${paraAprovar} vaga(s) para aprovar`, vagaId: null });
  const novas =
    vagaSelecionadaId && candidaturasPendentes ? (candidaturasPendentes[vagaSelecionadaId] || []).length : 0;
  if (novas)
    acoes.push({
      chave: 'importar',
      total: novas,
      texto: `${novas} candidatura(s) nova(s) pelo link para importar`,
      vagaId: vagaSelecionadaId,
    });
  const paraTriar = (candidatos || []).filter((c) => naVaga(c) && c.etapa === 'nova');
  if (paraTriar.length)
    acoes.push({
      chave: 'triar',
      total: paraTriar.length,
      texto: `${paraTriar.length} candidato(s) para triar`,
      vagaId: paraTriar[0].vagaId,
    });
  const recebidos = (videos || []).filter((v) => v.status === 'enviado').length;
  if (recebidos) {
    const refs = new Set((videos || []).filter((v) => v.status === 'enviado').map((v) => v.candidato_ref));
    const alvo = (candidatos || []).find((c) => refs.has(c.id) && naVaga(c));
    acoes.push({
      chave: 'videos',
      total: recebidos,
      texto: `${recebidos} vídeo(s) recebido(s)`,
      vagaId: alvo ? alvo.vagaId : null,
    });
  }
  const refsEntregas = new Set((entregas || []).filter((x) => x.status === 'enviado').map((x) => x.candidato_ref));
  if (refsEntregas.size) {
    const totalEntregas = (entregas || []).filter((x) => x.status === 'enviado').length;
    const alvo = (candidatos || []).find((c) => refsEntregas.has(c.id) && naVaga(c));
    acoes.push({
      chave: 'resultados',
      total: totalEntregas,
      texto: `${totalEntregas} resultado(s) enviado(s) pelo candidato`,
      vagaId: alvo ? alvo.vagaId : null,
    });
  }
  const semProva = abertas.filter(
    (r) => typeof situacaoProvaPraticaRS === 'function' && situacaoProvaPraticaRS(r) === 'pendente'
  );
  if (semProva.length)
    acoes.push({
      chave: 'prova',
      total: semProva.length,
      texto: `${semProva.length} vaga(s) sem a prova prática definida`,
      vagaId: semProva[0].id,
    });
  const paraContratar = (candidatos || []).filter((c) => naVaga(c) && c.etapa === 'aprovado' && !c.convertidoEm);
  if (paraContratar.length)
    acoes.push({
      chave: 'contratar',
      total: paraContratar.length,
      texto: `${paraContratar.length} aprovado(s) para contratar`,
      vagaId: paraContratar[0].vagaId,
    });
  return acoes;
}

// ---------- estado e ações ----------
let _psFichaAberta = null; // id do candidato com a ficha aberta
let _psVagasAberto = false; // a seção "Vagas" (criar, aprovar, publicar) aberta

// A vaga que o quadro mostra: a escolhida; senão a primeira vaga aprovada e aberta; senão nenhuma.
function vagaSelecionadaRS() {
  const todas = state.rs.requisicoes;
  return (
    todas.find((r) => r.id === _rsRequisicaoExpandida && r.status === 'aprovada') ||
    todas.find((r) => r.status === 'aprovada' && !r.encerrada) ||
    null
  );
}
function selecionarVagaRS(vagaId) {
  _rsRequisicaoExpandida = vagaId || null;
  _psFichaAberta = null;
  render();
}
function abrirSecaoVagasRS() {
  _psVagasAberto = true;
  render();
}
function abrirFichaRS(candidatoId) {
  _psFichaAberta = _psFichaAberta === candidatoId ? null : candidatoId;
  render();
}
function fecharFichaRS() {
  _psFichaAberta = null;
  render();
}
// Leva o candidato para a próxima etapa DESTA vaga (o mesmo caminho do seletor antigo: e-mail, vídeo e prova prática incluídos).
function avancarCandidatoRS(candidatoId) {
  const cand = state.rs.candidatos.find((c) => c.id === candidatoId);
  if (!cand || cand.reprovado) return;
  const vaga = state.rs.requisicoes.find((r) => r.id === cand.vagaId);
  const proxima = vaga && proximaEtapaDaVagaRS(vaga, cand.etapa);
  if (!proxima) return showToast('Este candidato já está na última etapa.');
  moverEtapaCandidatoRS(candidatoId, proxima.id);
}
// Clicou numa pendência: vai para a vaga onde resolver (e abre a configuração, se for a prova prática).
function resolverPendenciaRS(chave, vagaId) {
  if (chave === 'aprovar') return abrirSecaoVagasRS();
  if (chave === 'prova' && vagaId) _rsOrientacoesVagaAberta = vagaId;
  selecionarVagaRS(vagaId);
}

// ---------- telas ----------
function faixaPendenciasHtml(gestor) {
  const vaga = vagaSelecionadaRS();
  const acoes = acoesPendentesRS({
    requisicoes: state.rs.requisicoes,
    candidatos: state.rs.candidatos,
    videos: typeof _rsVideos !== 'undefined' && gestor ? _rsVideos || [] : [],
    entregas: typeof _rsEntregas !== 'undefined' && gestor ? _rsEntregas || [] : [],
    candidaturasPendentes: _rsCandidaturasPendentes,
    vagaSelecionadaId: vaga ? vaga.id : null,
    gestor,
  });
  const e = escaparHtml;
  return `<div class="card" style="padding:12px 16px;">
    <div style="font-size:13px;font-weight:600;margin-bottom:8px;">Para você fazer agora</div>
    ${
      acoes.length
        ? `<div style="display:flex;gap:8px;flex-wrap:wrap;">${acoes.map((a) => `<button class="btn btn-sm btn-ghost" onclick="resolverPendenciaRS('${a.chave}', ${a.vagaId ? `'${escaparParaOnclick(a.vagaId)}'` : 'null'})">${e(a.texto)} →</button>`).join('')}</div>`
        : '<div class="small-muted">Nada pendente agora. Quando chegar candidato novo, vídeo ou vaga para aprovar, aparece aqui.</div>'
    }
  </div>`;
}

function statusVideoDoCartaoRS(c) {
  if (
    c.etapa !== 'video' ||
    typeof videoDoCandidatoRS !== 'function' ||
    typeof rsVideoHabilitado !== 'function' ||
    !rsVideoHabilitado() ||
    _rsVideos === null
  )
    return '';
  const v = videoDoCandidatoRS(c.id);
  if (!v) return '<div class="small-muted">Vídeo: ainda não pedido</div>';
  return `<div class="small-muted">${escaparHtml(videoStatusRotuloRS(v.status).texto)}</div>`;
}

function cartaoDoCandidatoRS(c, vaga) {
  const e = escaparHtml;
  const id = escaparParaOnclick(c.id);
  const proxima = c.etapa === 'aprovado' ? null : proximaEtapaDaVagaRS(vaga, c.etapa);
  const principal =
    c.etapa === 'aprovado'
      ? c.convertidoEm
        ? '<span class="pill pill-alavancar">Contratado(a)</span>'
        : `<button class="btn btn-sm btn-primary" style="width:100%;" onclick="converterCandidatoEmColaboradorRS('${id}')">Converter em colaborador</button>`
      : proxima
        ? `<button class="btn btn-sm btn-primary" style="width:100%;" onclick="avancarCandidatoRS('${id}')">Avançar → ${e(proxima.nome)}</button>`
        : '';
  return `<div style="border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin-bottom:8px;background:var(--surface-2);">
    <a href="#" onclick="abrirFichaRS('${id}');return false;" style="font-weight:600;font-size:14px;">${e(c.nome)}</a>
    <div style="margin:4px 0 6px;"><span class="pill pill-desenvolver">${e(etapaNomeRS(c.etapa))}</span></div>
    ${statusVideoDoCartaoRS(c)}
    <div style="display:flex;gap:6px;align-items:center;margin-top:6px;">${principal}${c.etapa === 'aprovado' && c.convertidoEm ? '' : `<button class="btn btn-sm btn-ghost" title="Reprovar ou desistência" onclick="reprovarCandidatoRS('${id}')">Reprovar</button>`}</div>
  </div>`;
}

// O que a pessoa precisa ver/fazer na etapa em que está.
function blocoDaEtapaRS(c, vaga) {
  const e = escaparHtml;
  const aviso = (t) => `<div class="notice info" style="font-size:12.5px;">${t}</div>`;
  switch (c.etapa) {
    case 'video':
      return typeof videoPainelRS === 'function'
        ? videoPainelRS(c, vaga) || aviso('O vídeo de apresentação só aparece para Administrador e RH.')
        : '';
    case 'prova_pratica': {
      const cfg = configEtapaSanitizada(vaga.etapasConfig?.prova_pratica, 'prova_pratica');
      if (!cfg.instrucoes)
        return aviso(
          'Esta vaga ainda não tem a prova prática definida. Defina em <b>Configurar esta vaga</b>, logo abaixo do quadro.'
        );
      return `<div style="font-size:13px;"><b>Prova prática desta vaga</b>
        <div style="white-space:pre-wrap;margin:6px 0;">${e(cfg.instrucoes)}</div>
        ${cfg.prazoDias ? `<div class="small-muted">Prazo de entrega: ${cfg.prazoDias} dia(s)</div>` : ''}
        ${cfg.links.length ? `<div class="small-muted">Links: ${cfg.links.map((l) => e(l.rotulo)).join(', ')}</div>` : ''}
        ${cfg.criterios.length ? `<div style="margin-top:6px;"><b>Critérios de avaliação</b> <span class="small-muted">(só você vê)</span><ul style="margin:4px 0 0 18px;">${cfg.criterios.map((k) => `<li>${e(k.descricao)} <span class="small-muted">(peso ${k.peso})</span></li>`).join('')}</ul></div>` : ''}
      </div>`;
    }
    case 'disc_galt': {
      const cfg = configEfetivaEtapaRS(vaga, 'disc_galt');
      return aviso(
        `O DISC e o GALT são feitos fora do sistema, pelos links enviados ao candidato. ${cfg.links.length ? `Links indicados: ${cfg.links.map((l) => e(l.rotulo)).join(', ')}.` : 'Você ainda não indicou os links (em Orientações e links das etapas).'} Avalie o resultado e avance.`
      );
    }
    case 'redes_sociais':
    case 'checagem_curriculo':
      return aviso('Etapa só sua: o candidato não recebe e-mail. Use apenas o que se relaciona com a vaga.');
    case 'entrevista_fit':
    case 'entrevista_final':
      return aviso('Converse com o candidato e preencha o scorecard abaixo.');
    case 'escolha':
      return aviso(
        'Compare os finalistas e decida quem será contratado: avance quem for escolhido e reprove os demais.'
      );
    case 'proposta':
      return aviso('Faça a proposta ao candidato escolhido. Quando ele aceitar, avance para "Aprovado".');
    case 'aprovado':
      return aviso('O candidato aceitou. Converta em colaborador para concluir a contratação.');
    default:
      return '';
  }
}

function fichaDoCandidatoHtml(c, vaga) {
  const e = escaparHtml;
  const id = escaparParaOnclick(c.id);
  const historico = (c.historico || [])
    .slice()
    .reverse()
    .slice(0, 8)
    .map(
      (h) =>
        `<li>${e(h.em ? new Date(h.em).toLocaleDateString('pt-BR') : '—')} — ${h.para ? `${h.de ? `${e(etapaNomeRS(h.de))} → ` : ''}${e(etapaNomeRS(h.para))}` : 'Cadastro'}${h.observacao ? ` <span class="small-muted">(${e(h.observacao)})</span>` : ''}</li>`
    )
    .join('');
  const acoes = c.reprovado
    ? `<button class="btn btn-sm btn-ghost" onclick="reabrirCandidatoRS('${id}')">Reabrir</button>`
    : `<select onchange="moverEtapaCandidatoRS('${id}', this.value)" style="max-width:220px;"><option value="">Mover para outra etapa…</option>${etapasParaSelecaoRS(
        vaga,
        c
      )
        .filter((et) => et.id !== c.etapa)
        .map((et) => `<option value="${e(et.id)}">${e(et.nome)}</option>`)
        .join(
          ''
        )}</select> <button class="btn btn-sm btn-ghost" onclick="reprovarCandidatoRS('${id}')">Reprovar</button>`;
  return `<div class="card" style="border:2px solid var(--line);">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
      <div><h3 style="margin:0;">${e(c.nome)}</h3>
        <div class="small-muted">${e(c.email || '—')}${c.telefone ? ` · ${e(c.telefone)}` : ''} · Origem: ${e(c.origem || '—')}</div>
        <div style="margin-top:6px;">${c.reprovado ? '<span class="pill pill-iniciar">Reprovado(a) / desistiu</span>' : `<span class="pill pill-desenvolver">Etapa: ${e(etapaNomeRS(c.etapa))}</span>`}</div></div>
      <button class="btn btn-sm btn-ghost" onclick="fecharFichaRS()">Fechar</button>
    </div>
    <div style="margin:10px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">${acoes}</div>
    ${c.reprovado ? '' : blocoDaEtapaRS(c, vaga)}
    ${typeof entregaPainelRS === 'function' ? entregaPainelRS(c, vaga) : ''}
    ${c.curriculo ? `<details style="margin-top:10px;"><summary style="cursor:pointer;font-weight:600;font-size:13px;">Currículo / resumo</summary><div style="white-space:pre-wrap;font-size:13px;margin-top:6px;">${e(c.curriculo)}</div></details>` : ''}
    ${c.perfil && typeof renderPerfilCandidatoRS === 'function' ? renderPerfilCandidatoRS(c) : ''}
    <details style="margin-top:10px;" ${['entrevista_fit', 'entrevista_final'].includes(c.etapa) ? 'open' : ''}><summary style="cursor:pointer;font-weight:600;font-size:13px;">Scorecards de entrevista</summary>${renderScorecardRS(c.id)}</details>
    <details style="margin-top:10px;"><summary style="cursor:pointer;font-weight:600;font-size:13px;">Histórico</summary><ul style="margin:6px 0 0 18px;font-size:13px;">${historico || '<li class="small-muted">Sem eventos.</li>'}</ul></details>
  </div>`;
}

function quadroDaVagaHtml(vaga) {
  const e = escaparHtml;
  const candidatos = state.rs.candidatos.filter((c) => c.vagaId === vaga.id);
  const { fases, reprovados } = agruparPorFaseRS(candidatos);
  const ficha = candidatos.find((c) => c.id === _psFichaAberta);
  const colunas = fases
    .map(
      ({ fase, candidatos: lista }) => `<div style="min-width:0;">
      <div style="font-size:13px;font-weight:600;padding:0 2px 6px;border-bottom:2px solid var(--line);margin-bottom:8px;">${e(fase.nome)} <span class="small-muted">(${lista.length})</span></div>
      ${lista.length ? lista.map((c) => cartaoDoCandidatoRS(c, vaga)).join('') : '<div class="small-muted" style="font-size:12px;">Ninguém aqui.</div>'}
    </div>`
    )
    .join('');
  return `
    ${ficha ? fichaDoCandidatoHtml(ficha, vaga) : ''}
    ${candidatos.length ? '' : '<div class="empty" style="margin-bottom:10px;">Nenhum candidato nesta vaga ainda. Quem se candidata pelo link aparece acima para importar; ou leve pessoas do <a href="#" onclick="goto(\'rs\');return false;">Recrutamento</a>.</div>'}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;align-items:start;">${colunas}</div>
    ${
      reprovados.length
        ? `<details style="margin-top:12px;"><summary style="cursor:pointer;font-size:13px;font-weight:600;">Reprovados e desistências (${reprovados.length})</summary>
        <div style="margin-top:6px;">${reprovados.map((c) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid var(--line);font-size:13px;"><a href="#" onclick="abrirFichaRS('${escaparParaOnclick(c.id)}');return false;">${e(c.nome)}</a><button class="btn btn-sm btn-ghost" onclick="reabrirCandidatoRS('${escaparParaOnclick(c.id)}')">Reabrir</button></div>`).join('')}</div></details>`
        : ''
    }`;
}

// "+ Nova vaga": abre a seção das vagas já com o formulário aberto.
function iniciarNovaVagaRS() {
  _psVagasAberto = true;
  abrirNovaRequisicaoRS();
}
