/* =========================================================
   R&S — MOVER E REPROVAR EM LOTE
   -----------------------------------------------------------
   No quadro da vaga, "Selecionar vários" liga caixas de seleção nos cartões. Com candidatos marcados, o Administrador ou o RH
   pode: AVANÇAR cada um para a próxima etapa DA VAGA; MOVER todos para uma etapa escolhida; ou REPROVAR todos (com um motivo).

   Cada candidato é tratado EXATAMENTE como na movimentação individual: o mesmo código (aplicarMovimentoRS e
   aplicarReprovacaoRS) muda a etapa, registra o histórico e manda o e-mail da etapa (ou cria o pedido de vídeo/resultado, com o
   link pessoal de cada um). Não existe um segundo caminho que possa divergir.

   Garantias:
     - nada acontece sem uma confirmação que mostra quantos vão para onde, quantos recebem e-mail e quais avisos valem;
     - um candidato por vez, com uma pausa entre eles (não estoura o limite de envio de e-mails);
     - se um e-mail não sair, o resumo final diz QUEM e oferece tentar de novo (a movimentação não é desfeita nem bloqueada);
     - quem mudou de etapa enquanto o painel estava aberto é pulado, não movido por engano;
     - no máximo LOTE_RS_MAXIMO por vez; só Administrador e RH; a Auditoria guarda só as contagens, nunca nomes.

   O planejamento (planejarLoteRS) é uma função PURA, testada. A tela e a execução vêm depois.
   ========================================================= */

const LOTE_RS_MAXIMO = 50;
let LOTE_RS_PAUSA_MS = 400; // entre um candidato e outro (os testes zeram)

let _rsSelecaoAtiva = false; // o modo "selecionar vários" está ligado
let _rsSelecionados = []; // ids dos candidatos marcados
let _rsLote = null; // o painel: { vagaId, acao, destino, motivo, fase: 'confirmar'|'executando'|'pronto', plano, progresso, resultado }

function loteGestorRS() {
  return ['owner', 'rh'].includes(meuPapelReal);
}

// Os mesmos avisos que a movimentação individual faz por pergunta, agora uma vez só para o lote.
function avisosDestinoLoteRS(vaga, etapa) {
  const avisos = [];
  if (
    ETAPAS_QUE_PRECISAM_ORIENTACAO_RS.includes(etapa) &&
    !temOrientacoesEtapaRS(configEfetivaEtapaRS(vaga, etapa), etapa)
  )
    avisos.push(
      `A etapa ${etapaNomeRS(etapa)} ainda não tem links nem orientações configurados: os candidatos receberão só o passo a passo padrão, sem o endereço do teste.`
    );
  if (etapa === 'prova_pratica' && !provaPraticaDefinidaRS(vaga))
    avisos.push(
      'Esta vaga ainda não tem a prova prática definida (enunciado, prazo e critérios): os candidatos receberão o e-mail da etapa sem a tarefa.'
    );
  return avisos;
}

// O que vai acontecer com cada candidato marcado. acao: 'avancar' | 'mover' | 'reprovar'.
function planejarLoteRS({ candidatos, vaga, acao, destino }) {
  const itens = [];
  const ignorados = [];
  for (const c of candidatos) {
    const base = { id: c.id, nome: c.nome, de: c.etapa, temEmail: !!c.email };
    if (c.reprovado) {
      ignorados.push({ ...base, motivo: 'já está reprovado(a)' });
      continue;
    }
    if (c.convertidoEm) {
      ignorados.push({ ...base, motivo: 'já foi contratado(a)' });
      continue;
    }
    if (acao === 'reprovar') {
      itens.push({ ...base, para: null });
      continue;
    }
    let para;
    if (acao === 'avancar') {
      const proxima = c.etapa === 'aprovado' ? null : proximaEtapaDaVagaRS(vaga, c.etapa);
      if (!proxima) {
        ignorados.push({ ...base, motivo: 'já está na última etapa' });
        continue;
      }
      para = proxima.id;
    } else {
      para = destino;
      if (c.etapa === para) {
        ignorados.push({ ...base, motivo: 'já está nessa etapa' });
        continue;
      }
    }
    itens.push({ ...base, para });
  }
  let erro = null;
  if (acao === 'mover') {
    if (!destino) erro = 'Escolha a etapa de destino.';
    else if (!etapasAtivasDaVagaRS(vaga).some((e) => e.id === destino)) erro = 'Essa etapa não faz parte desta vaga.';
  }
  if (!erro && itens.length > LOTE_RS_MAXIMO) erro = `Selecione no máximo ${LOTE_RS_MAXIMO} candidatos por vez.`;
  if (!erro && !itens.length) erro = 'Nenhum dos selecionados pode ser movido desta forma.';
  const etapaDoEmail = (i) => (acao === 'reprovar' ? 'reprovado' : i.para);
  const recebem = itens.filter((i) => RS_EMAIL_POR_ETAPA[etapaDoEmail(i)]);
  const destinos = acao === 'reprovar' ? [] : [...new Set(itens.map((i) => i.para))];
  return {
    acao,
    itens,
    ignorados,
    erro,
    grupos:
      acao === 'reprovar'
        ? [{ etapa: 'reprovado', nome: 'Reprovados', total: itens.length }]
        : destinos.map((e) => ({ etapa: e, nome: etapaNomeRS(e), total: itens.filter((i) => i.para === e).length })),
    comEmail: recebem.filter((i) => i.temEmail).length,
    semEmail: recebem.filter((i) => !i.temEmail).length,
    avisos: destinos.flatMap((e) => avisosDestinoLoteRS(vaga, e)),
  };
}

// ---------- a seleção ----------
function candidatosSelecionadosRS(vagaId) {
  return state.rs.candidatos.filter((c) => c.vagaId === vagaId && _rsSelecionados.includes(c.id));
}
// Sai do modo de seleção sem redesenhar a tela (quem chama decide).
function encerrarSelecaoRS() {
  _rsSelecaoAtiva = false;
  _rsSelecionados = [];
  _rsLote = null;
}
function alternarSelecaoRS() {
  if (!loteGestorRS()) return;
  if (_rsSelecaoAtiva) encerrarSelecaoRS();
  else _rsSelecaoAtiva = true;
  render();
}
function marcarCandidatoLoteRS(candidatoId, marcado) {
  _rsSelecionados = _rsSelecionados.filter((id) => id !== candidatoId);
  if (marcado) _rsSelecionados.push(candidatoId);
  if (_rsLote && _rsLote.fase === 'confirmar') recalcularLoteRS();
  render();
}
function marcarFaseLoteRS(faseId, marcado) {
  const vaga = vagaSelecionadaRS();
  const fase = FASES_PROCESSO_RS.find((f) => f.id === faseId);
  if (!vaga || !fase) return;
  const ids = state.rs.candidatos
    .filter((c) => c.vagaId === vaga.id && !c.reprovado && fase.etapas.includes(c.etapa))
    .map((c) => c.id);
  _rsSelecionados = _rsSelecionados.filter((id) => !ids.includes(id));
  if (marcado) _rsSelecionados.push(...ids);
  if (_rsLote && _rsLote.fase === 'confirmar') recalcularLoteRS();
  render();
}
function limparSelecaoRS() {
  _rsSelecionados = [];
  _rsLote = null;
  render();
}

// ---------- o painel ----------
function recalcularLoteRS() {
  const l = _rsLote;
  const vaga = state.rs.requisicoes.find((r) => r.id === l.vagaId);
  l.plano = planejarLoteRS({ candidatos: candidatosSelecionadosRS(l.vagaId), vaga, acao: l.acao, destino: l.destino });
}
function abrirLoteRS(acao) {
  if (!loteGestorRS() || !['avancar', 'mover', 'reprovar'].includes(acao)) return;
  const vaga = vagaSelecionadaRS();
  if (!vaga || !candidatosSelecionadosRS(vaga.id).length) return;
  _rsLote = {
    vagaId: vaga.id,
    acao,
    destino: '',
    motivo: '',
    fase: 'confirmar',
    plano: null,
    progresso: null,
    resultado: null,
  };
  recalcularLoteRS();
  render();
}
function mudarDestinoLoteRS(etapaId) {
  if (!_rsLote || _rsLote.fase !== 'confirmar') return;
  _rsLote.destino = etapaId || '';
  recalcularLoteRS();
  render();
}
// Guarda o que a pessoa digita SEM redesenhar (redesenhar tiraria o cursor do campo).
function mudarMotivoLoteRS(texto) {
  if (_rsLote && _rsLote.fase === 'confirmar') _rsLote.motivo = String(texto || '').slice(0, 300);
}
function cancelarLoteRS() {
  _rsLote = null;
  render();
}
function fecharResultadoLoteRS() {
  _rsLote = null;
  render();
}

const esperarLoteRS = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function executarLoteRS() {
  const lote = _rsLote;
  // Só confirma uma vez: depois do primeiro clique a fase deixa de ser "confirmar" (duplo clique não dobra os e-mails).
  if (!loteGestorRS() || !lote || lote.fase !== 'confirmar' || !lote.plano || lote.plano.erro) return;
  const itens = lote.plano.itens;
  const motivo = String(lote.motivo || '').trim();
  lote.fase = 'executando';
  lote.progresso = { feitos: 0, total: itens.length };
  render();
  const resultado = {
    movidos: 0,
    falhasEmail: [],
    pulados: lote.plano.ignorados.map((i) => ({ nome: i.nome, motivo: i.motivo })),
    erros: [],
  };
  for (let n = 0; n < itens.length; n++) {
    const item = itens[n];
    const cand = state.rs.candidatos.find((c) => c.id === item.id);
    // Pode ter mudado enquanto o painel estava aberto (outra pessoa, outra aba): só mexe se ainda estiver como no plano.
    if (!cand || cand.reprovado || cand.convertidoEm || cand.etapa !== item.de || cand.vagaId !== lote.vagaId) {
      resultado.pulados.push({ nome: item.nome, motivo: 'mudou enquanto isso' });
    } else {
      try {
        const r =
          lote.acao === 'reprovar'
            ? await aplicarReprovacaoRS(cand, motivo, { silencioso: true })
            : await aplicarMovimentoRS(cand, item.para, { silencioso: true });
        resultado.movidos++;
        if (r && r.enviado === false) {
          const etapaEmail = lote.acao === 'reprovar' ? 'reprovado' : item.para;
          resultado.falhasEmail.push({
            id: cand.id,
            nome: cand.nome,
            etapa: etapaEmail,
            tipo: etapaEmail === 'video' ? 'video' : ETAPAS_COM_ENTREGA_RS.includes(etapaEmail) ? 'entrega' : 'etapa',
          });
        }
      } catch (e) {
        console.warn('Falha inesperada ao processar um candidato do lote', e);
        resultado.erros.push({ nome: item.nome, motivo: 'erro inesperado' });
      }
    }
    lote.progresso.feitos = n + 1;
    render();
    if (n < itens.length - 1) await esperarLoteRS(LOTE_RS_PAUSA_MS);
  }
  // As listas de vídeo e de resultado vêm do servidor: uma recarga no fim, em vez de uma por candidato.
  try {
    if (itens.some((i) => i.para === 'video') && typeof carregarVideosRS === 'function') await carregarVideosRS(true);
    if (itens.some((i) => ETAPAS_COM_ENTREGA_RS.includes(i.para)) && typeof carregarEntregasRS === 'function')
      await carregarEntregasRS(true);
  } catch (e) {
    console.warn('Falha ao recarregar as listas depois do lote', e);
  }
  lote.resultado = resultado;
  lote.fase = 'pronto';
  _rsSelecionados = [];
  registrarAuditoria('rs.lote', {
    acao: lote.acao,
    vagaId: lote.vagaId,
    total: itens.length,
    movidos: resultado.movidos,
    falhasEmail: resultado.falhasEmail.length,
    pulados: resultado.pulados.length,
  });
  showToast(
    `${resultado.movidos} candidato(s) ${lote.acao === 'reprovar' ? 'reprovado(s)' : 'movido(s)'}${resultado.falhasEmail.length ? `; ${resultado.falhasEmail.length} e-mail(s) não saíram` : ''}.`
  );
  render();
}

// Tenta de novo só os e-mails que falharam (os de vídeo e de resultado têm "Reenviar" na própria ficha).
async function reenviarFalhasLoteRS() {
  const lote = _rsLote;
  if (!loteGestorRS() || !lote || lote.fase !== 'pronto' || !lote.resultado) return;
  const restantes = [];
  for (const f of lote.resultado.falhasEmail) {
    const cand = state.rs.candidatos.find((c) => c.id === f.id);
    if (!cand || f.tipo !== 'etapa') {
      restantes.push(f);
      continue;
    }
    const ok = await enviarEmailEtapaRS(cand, f.etapa);
    if (ok !== true) restantes.push(f);
    await esperarLoteRS(LOTE_RS_PAUSA_MS);
  }
  const reenviados = lote.resultado.falhasEmail.length - restantes.length;
  lote.resultado.falhasEmail = restantes;
  showToast(reenviados ? `${reenviados} e-mail(s) enviado(s).` : 'Nenhum e-mail saiu. Tente de novo mais tarde.');
  render();
}

// ---------- o que aparece na tela ----------
function caixaSelecaoCartaoHtml(c) {
  if (!_rsSelecaoAtiva || !loteGestorRS() || c.reprovado) return '';
  const id = escaparParaOnclick(c.id);
  return `<label style="display:flex;gap:6px;align-items:center;font-size:12px;margin-bottom:4px;"><input type="checkbox" ${_rsSelecionados.includes(c.id) ? 'checked' : ''} onchange="marcarCandidatoLoteRS('${id}', this.checked)" aria-label="Selecionar ${escaparHtml(c.nome)}"> Selecionar</label>`;
}

function cabecalhoFaseLoteHtml(fase, lista) {
  if (!_rsSelecaoAtiva || !loteGestorRS() || !lista.length) return '';
  const todos = lista.every((c) => _rsSelecionados.includes(c.id));
  return `<label style="display:flex;gap:6px;align-items:center;font-size:12px;margin-bottom:6px;"><input type="checkbox" ${todos ? 'checked' : ''} onchange="marcarFaseLoteRS('${escaparParaOnclick(fase.id)}', this.checked)" aria-label="Selecionar todos de ${escaparHtml(fase.nome)}"> Selecionar todos desta fase</label>`;
}

function barraLoteHtml(vaga) {
  if (!loteGestorRS()) return '';
  const temCandidatos = state.rs.candidatos.some((c) => c.vagaId === vaga.id && !c.reprovado);
  if (!temCandidatos) return '';
  const painel = painelLoteHtml(vaga);
  if (!_rsSelecaoAtiva)
    return `<div style="margin:0 0 10px;"><button class="btn btn-ghost btn-sm" onclick="alternarSelecaoRS()">Selecionar vários</button> <span class="small-muted">para avançar ou reprovar vários candidatos de uma vez</span></div>${painel}`;
  const n = candidatosSelecionadosRS(vaga.id).filter((c) => !c.reprovado).length;
  const ocupado = !!_rsLote && _rsLote.fase !== 'pronto';
  const desligado = n === 0 || ocupado ? 'disabled' : '';
  return `<div role="region" aria-label="Seleção de candidatos" style="position:sticky;top:0;z-index:5;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin:0 0 10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
    <span aria-live="polite" style="font-weight:600;font-size:13px;">${n} selecionado(s)</span>
    <button class="btn btn-primary btn-sm" onclick="abrirLoteRS('avancar')" ${desligado}>Avançar para a próxima etapa</button>
    <button class="btn btn-ghost btn-sm" onclick="abrirLoteRS('mover')" ${desligado}>Mover para…</button>
    <button class="btn btn-ghost btn-sm" onclick="abrirLoteRS('reprovar')" ${desligado}>Reprovar</button>
    <button class="btn btn-ghost btn-sm" onclick="limparSelecaoRS()" ${ocupado ? 'disabled' : ''}>Limpar seleção</button>
    <button class="btn btn-ghost btn-sm" onclick="alternarSelecaoRS()" ${ocupado ? 'disabled' : ''}>Sair da seleção</button>
  </div>${painel}`;
}

function tituloLoteRS(l) {
  const n = l.plano ? l.plano.itens.length : 0;
  if (l.acao === 'avancar') return `Avançar ${n} candidato(s) para a próxima etapa`;
  if (l.acao === 'reprovar') return `Reprovar ${n} candidato(s)`;
  return `Mover ${n} candidato(s)${l.destino ? ` para ${etapaNomeRS(l.destino)}` : ''}`;
}

function painelLoteHtml(vaga) {
  const l = _rsLote;
  if (!l || l.vagaId !== vaga.id) return '';
  const e = escaparHtml;
  const moldura = (corpo) =>
    `<div class="card" role="region" aria-label="Movimentação em lote" style="border:2px solid var(--line);">${corpo}</div>`;

  if (l.fase === 'executando') {
    const { feitos, total } = l.progresso;
    return moldura(`<h3 style="margin:0 0 6px;">${e(tituloLoteRS(l))}</h3>
      <div role="status" aria-live="polite"><p style="margin:0 0 8px;">Processando ${feitos} de ${total}… Não feche esta página até terminar.</p>
      <div aria-hidden="true" style="background:var(--surface-2);border-radius:99px;height:10px;"><div style="width:${total ? Math.round((feitos / total) * 100) : 0}%;height:100%;background:var(--gold);border-radius:99px;"></div></div></div>`);
  }

  if (l.fase === 'pronto') {
    const r = l.resultado;
    const nomes = (lista) => lista.map((x) => e(x.nome)).join(', ');
    const id = (x) => e(x.nome);
    return moldura(`<h3 style="margin:0 0 6px;">Pronto</h3>
      <div role="status"><p style="margin:0 0 8px;"><b>${r.movidos}</b> candidato(s) ${l.acao === 'reprovar' ? 'reprovado(s)' : 'movido(s)'}.</p>
      ${
        r.falhasEmail.length
          ? `<div class="notice info" style="margin:0 0 8px;"><b>${r.falhasEmail.length} e-mail(s) não saíram:</b> ${nomes(r.falhasEmail)}.<br><span class="small-muted">A movimentação foi feita. ${r.falhasEmail.some((f) => f.tipo !== 'etapa') ? 'Para vídeo e resultado, use "Reenviar" na ficha do candidato.' : ''}</span>
            ${r.falhasEmail.some((f) => f.tipo === 'etapa') ? '<div style="margin-top:6px;"><button class="btn btn-sm btn-primary" onclick="reenviarFalhasLoteRS()">Tentar enviar de novo</button></div>' : ''}</div>`
          : ''
      }
      ${r.pulados.length ? `<details style="margin:0 0 8px;"><summary style="cursor:pointer;font-size:13px;">${r.pulados.length} não foram movidos</summary><ul style="margin:6px 0 0 18px;font-size:13px;">${r.pulados.map((x) => `<li>${id(x)} — ${e(x.motivo)}</li>`).join('')}</ul></details>` : ''}
      ${r.erros.length ? `<div class="notice info" style="margin:0 0 8px;">Houve erro inesperado em: ${nomes(r.erros)}. Confira a ficha de cada um.</div>` : ''}
      </div>
      <button class="btn btn-sm btn-primary" onclick="fecharResultadoLoteRS()">Fechar</button>`);
  }

  // confirmação
  const p = l.plano;
  const seletor =
    l.acao === 'mover'
      ? `<div style="margin:0 0 8px;"><label for="rs_lote_destino" class="small-muted">Mover para </label><select id="rs_lote_destino" onchange="mudarDestinoLoteRS(this.value)" style="max-width:260px;"><option value="">Escolha a etapa…</option>${etapasAtivasDaVagaRS(
          vaga
        )
          .map((et) => `<option value="${e(et.id)}" ${l.destino === et.id ? 'selected' : ''}>${e(et.nome)}</option>`)
          .join('')}</select></div>`
      : '';
  const campoMotivo =
    l.acao === 'reprovar'
      ? `<div style="margin:0 0 8px;"><label for="rs_lote_motivo" class="small-muted">Motivo (fica no histórico de cada candidato; aparece nos relatórios)</label><textarea id="rs_lote_motivo" rows="2" maxlength="300" oninput="mudarMotivoLoteRS(this.value)" style="width:100%;">${e(l.motivo)}</textarea></div>`
      : '';
  const explicacao =
    l.acao === 'reprovar'
      ? 'Cada candidato recebe o e-mail de reprovação e o motivo fica no histórico dele.'
      : 'Cada candidato é tratado como se você tivesse feito um por um: o histórico é registrado e o e-mail da etapa é enviado (com o link pessoal de cada um, nas etapas de vídeo e de resultado).';
  return moldura(`<h3 style="margin:0 0 6px;">${e(tituloLoteRS(l))}</h3>
    <p class="small-muted" style="margin:0 0 8px;">${explicacao}</p>
    ${seletor}${campoMotivo}
    ${p.erro ? `<div class="notice info" role="alert" style="margin:0 0 8px;">${e(p.erro)}</div>` : ''}
    ${p.grupos.length && !p.erro ? `<p style="margin:0 0 6px;font-size:13px;"><b>Vão para:</b> ${p.grupos.map((g) => `${e(g.nome)} (${g.total})`).join(', ')}</p>` : ''}
    ${!p.erro ? `<p style="margin:0 0 6px;font-size:13px;"><b>${p.comEmail}</b> candidato(s) vão receber e-mail.${p.semEmail ? ` ${p.semEmail} não têm e-mail cadastrado: serão movidos, mas não recebem aviso.` : ''}</p>` : ''}
    ${p.avisos.map((a) => `<div class="notice info" style="margin:0 0 6px;"><b>Atenção:</b> ${e(a)}</div>`).join('')}
    ${p.ignorados.length ? `<details style="margin:0 0 8px;"><summary style="cursor:pointer;font-size:13px;">${p.ignorados.length} serão ignorados</summary><ul style="margin:6px 0 0 18px;font-size:13px;">${p.ignorados.map((x) => `<li>${e(x.nome)} — ${e(x.motivo)}</li>`).join('')}</ul></details>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-sm btn-primary" onclick="executarLoteRS()" ${p.erro ? 'disabled' : ''}>${l.acao === 'reprovar' ? 'Confirmar reprovação' : 'Confirmar e enviar'}</button>
      <button class="btn btn-sm btn-ghost" onclick="cancelarLoteRS()">Cancelar</button>
    </div>`);
}
