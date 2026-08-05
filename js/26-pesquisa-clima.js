/* =========================================================
   PESQUISA DE CLIMA / eNPS
   -----------------------------------------------------------
   Módulo separado da Avaliação de Desempenho — mede engajamento
   periodicamente, sem escala IDA, sem afetar nenhuma RN de avaliação.
   Cruza naturalmente com os dados de Cultura Organizacional já
   existentes (mesma tela onde a empresa já define seus valores).
   ========================================================= */
let _climaNovaAberta = false;
let _climaTituloNovo = '';
let _climaPerguntaNova = 'De 0 a 10, o quanto você recomendaria esta empresa como um bom lugar para trabalhar?';

function calcularENPS(pesquisa) {
  const respostas = pesquisa.respostas || [];
  if (!respostas.length) return null;
  const promotores = respostas.filter((r) => r.nota >= 9).length;
  const detratores = respostas.filter((r) => r.nota <= 6).length;
  const score = Math.round(((promotores - detratores) / respostas.length) * 100);
  return {
    score,
    promotores,
    detratores,
    neutros: respostas.length - promotores - detratores,
    total: respostas.length,
  };
}

function criarPesquisaClima() {
  if (!_climaTituloNovo.trim() || !_climaPerguntaNova.trim()) {
    showToast('Preencha o título e a pergunta.');
    return;
  }
  state.pesquisasClima.push({
    id: uid(),
    titulo: _climaTituloNovo.trim(),
    pergunta: _climaPerguntaNova.trim(),
    tipo: 'eNPS',
    ativa: true,
    criadoEm: new Date().toISOString(),
    criadoPor: meuPerfilId,
    respostas: [],
  });
  registrarAuditoria('pesquisa_clima.criada', { titulo: _climaTituloNovo.trim() });
  _climaNovaAberta = false;
  _climaTituloNovo = '';
  showToast('Pesquisa de clima criada e já está disponível para os colaboradores responderem.');
  render();
}
function encerrarPesquisaClima(id) {
  const p = state.pesquisasClima.find((x) => x.id === id);
  if (!p) return;
  if (!confirm(`Encerrar a pesquisa "${p.titulo}"? Ninguém mais vai poder responder.`)) return;
  p.ativa = false;
  registrarAuditoria('pesquisa_clima.encerrada', { pesquisaId: id });
  showToast('Pesquisa encerrada.');
  render();
}
function responderPesquisaClima(id, nota) {
  const p = state.pesquisasClima.find((x) => x.id === id);
  if (!p) return;
  const comentario = document.getElementById(`clima_comentario_${id}`)?.value.trim() || '';
  p.respostas.push({ perfilId: meuPerfilId, nota, comentario, respondidoEm: new Date().toISOString() });
  registrarAuditoria('pesquisa_clima.respondida', { pesquisaId: id });
  showToast('Resposta registrada. Obrigado!');
  render();
}

function pageClima() {
  const souRHOuAdmin = meuPapelReal === 'owner' || meuPapelReal === 'rh';
  const pesquisasAtivas = state.pesquisasClima.filter((p) => p.ativa);
  const pesquisasEncerradas = state.pesquisasClima.filter((p) => !p.ativa);

  return `
    <div class="page-head">
      <div class="eyebrow">Engajamento</div>
      <h1>Pesquisa de Clima / eNPS</h1>
      <p class="page-desc">Mede engajamento periodicamente, separado da Avaliação de Desempenho — não usa a escala IDA, não afeta nenhuma nota formal.</p>
    </div>

    ${
      souRHOuAdmin
        ? `
    <div class="card">
      <h3>Nova pesquisa</h3>
      ${
        !_climaNovaAberta
          ? `<button class="btn btn-primary" onclick="_climaNovaAberta=true; render();">+ Criar pesquisa</button>`
          : `
        <div class="field"><label>Título (interno, só a empresa vê)</label><input value="${escaparHtml(_climaTituloNovo)}" oninput="_climaTituloNovo=this.value;" placeholder="Ex: eNPS — 1º trimestre 2026"></div>
        <div class="field"><label>Pergunta (o que o colaborador vê)</label><textarea oninput="_climaPerguntaNova=this.value;">${escaparHtml(_climaPerguntaNova)}</textarea></div>
        <button class="btn btn-primary btn-sm" onclick="criarPesquisaClima()">Disparar pesquisa</button>
        <button class="btn btn-ghost btn-sm" onclick="_climaNovaAberta=false; render();">Cancelar</button>
      `
      }
    </div>
    `
        : ''
    }

    ${
      pesquisasAtivas.length
        ? pesquisasAtivas
            .map((p) => {
              const jaRespondi = (p.respostas || []).some((r) => r.perfilId === meuPerfilId);
              const enps = calcularENPS(p);
              return `
      <div class="card">
        <h3>${escaparHtml(p.titulo)} <small>${p.ativa ? 'Ativa' : 'Encerrada'}</small></h3>
        <p class="page-desc">${escaparHtml(p.pergunta)}</p>
        ${
          !souRHOuAdmin && !jaRespondi
            ? `
          <div class="field"><label>Nota (0 = nunca recomendaria, 10 = recomendaria com certeza)</label>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              ${Array.from({ length: 11 }, (_, i) => i)
                .map(
                  (n) =>
                    `<button class="btn btn-sm ${n <= 6 ? '' : n <= 8 ? '' : ''}" style="min-width:36px;${n <= 6 ? 'border-color:var(--iniciar);' : n <= 8 ? 'border-color:var(--desenvolver);' : 'border-color:var(--alavancar);'}" onclick="responderPesquisaClima('${p.id}', ${n})">${n}</button>`
                )
                .join('')}
            </div>
          </div>
          <div class="field"><label>Comentário (opcional)</label><textarea id="clima_comentario_${p.id}" placeholder="Quer contar mais alguma coisa?"></textarea></div>
        `
            : ''
        }
        ${!souRHOuAdmin && jaRespondi ? '<div class="notice">Você já respondeu essa pesquisa. Obrigado pela participação!</div>' : ''}
        ${
          souRHOuAdmin
            ? `
          <div class="kpi-grid">
            <div class="kpi"><div class="n">${enps ? enps.score : '—'}</div><div class="l">Score eNPS</div></div>
            <div class="kpi"><div class="n">${enps ? enps.total : 0}</div><div class="l">Respostas</div></div>
            <div class="kpi"><div class="n">${enps ? enps.promotores : 0}</div><div class="l">Promotores (9-10)</div></div>
            <div class="kpi"><div class="n">${enps ? enps.detratores : 0}</div><div class="l">Detratores (0-6)</div></div>
          </div>
          ${
            (p.respostas || []).filter((r) => r.comentario).length
              ? `
            <div class="small-muted" style="margin-top:8px;margin-bottom:4px;">Comentários recebidos:</div>
            ${p.respostas
              .filter((r) => r.comentario)
              .map(
                (r) =>
                  `<div class="small-muted" style="padding:6px 0;border-top:1px solid var(--line);">"${escaparHtml(r.comentario)}" <span style="opacity:.6;">— nota ${r.nota}</span></div>`
              )
              .join('')}
          `
              : ''
          }
          <button class="btn btn-ghost btn-sm" style="margin-top:10px;" onclick="encerrarPesquisaClima('${p.id}')">Encerrar pesquisa</button>
        `
            : ''
        }
      </div>`;
            })
            .join('')
        : '<div class="empty">Nenhuma pesquisa de clima ativa no momento.</div>'
    }

    ${
      souRHOuAdmin && pesquisasEncerradas.length
        ? `
    <div class="card">
      <h3>Pesquisas encerradas <small>Histórico</small></h3>
      <table><thead><tr><th>Título</th><th>Score eNPS</th><th>Respostas</th><th>Criada em</th></tr></thead><tbody>
        ${pesquisasEncerradas
          .map((p) => {
            const e = calcularENPS(p);
            return `<tr><td>${escaparHtml(p.titulo)}</td><td>${e ? e.score : '—'}</td><td>${e ? e.total : 0}</td><td class="small-muted">${new Date(p.criadoEm).toLocaleDateString('pt-BR')}</td></tr>`;
          })
          .join('')}
      </tbody></table>
    </div>
    `
        : ''
    }
  `;
}
