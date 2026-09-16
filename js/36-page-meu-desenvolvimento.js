/* =========================================================
   MEU DESENVOLVIMENTO (visão do colaborador — só leitura)
   -----------------------------------------------------------
   Junta o que é do próprio colaborador: PDI (ações de
   desenvolvimento), a autoavaliação que ele preencheu, e o
   RESULTADO do diagnóstico — este último só aparece DEPOIS que o
   gestor realizou a reunião de feedback (reuniaoFeedback.realizada).
   Antes disso, mostra um aviso de que o resultado sai após a conversa.
   ========================================================= */

function _mdPilarNome(p) {
  return typeof PILAR_LABEL !== 'undefined' && PILAR_LABEL[p] ? PILAR_LABEL[p] : p;
}

function _mdStatusPill(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('conclu')) return 'pill-alavancar';
  if (s.includes('andamento') || s.includes('iniciad')) return 'pill-desenvolver';
  return 'pill-neutral';
}

function pageMeuDesenvolvimento() {
  const meu = state.colaboradores.find((c) => c.perfilId === meuPerfilId);
  if (!meu) {
    return `
      <div class="page-head"><div class="eyebrow">Minha evolução</div><h1>Meu Desenvolvimento</h1></div>
      <div class="empty">Sua conta ainda não foi vinculada a um registro de colaborador. Peça ao RH ou Administrador.</div>`;
  }

  // Ciclos do colaborador, do mais recente pro mais antigo.
  const meusCiclos = state.ciclos
    .filter((c) => c.colaboradorId === meu.id)
    .slice()
    .sort((a, b) => (b.dataAbertura || '').localeCompare(a.dataAbertura || ''));

  if (!meusCiclos.length) {
    return `
      <div class="page-head"><div class="eyebrow">Minha evolução</div><h1>Meu Desenvolvimento</h1></div>
      <div class="card"><div class="empty">Você ainda não participou de nenhum ciclo de avaliação. Quando seu gestor iniciar um, seu desenvolvimento aparecerá aqui.</div></div>`;
  }

  const ciclo = meusCiclos[0]; // foca no ciclo mais recente
  const feedbackFeito = !!ciclo.reuniaoFeedback?.realizada;

  // ---- Bloco: Resultado (só após reunião de feedback) ----
  let blocoResultado;
  if (!ciclo.diagnostico) {
    blocoResultado = `<div class="notice info">Seu ciclo atual ainda está em andamento. O resultado aparecerá aqui quando a avaliação for concluída e seu gestor conversar com você.</div>`;
  } else if (!feedbackFeito) {
    blocoResultado = `<div class="notice info">🔒 Seu resultado já foi calculado, mas será liberado após a <b>reunião de feedback</b> com seu gestor. Isso garante que os números venham acompanhados de uma conversa.</div>`;
  } else {
    const dm = ciclo.diagnostico.dimensaoMedia || {};
    const geral = ciclo.diagnostico.geralMedia;
    blocoResultado = `
      <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
        <div style="font-family:var(--mono);font-size:30px;font-weight:600;">${geral !== null && geral !== undefined ? geral.toFixed(2) : '—'}</div>
        <div class="small-muted">de 1,00 · <span class="pill ${pillClass(ciclo.diagnostico.geral)}">${pillLabel(ciclo.diagnostico.geral)}</span></div>
      </div>
      <table><thead><tr><th>Dimensão</th><th>Sua nota</th><th>Nível</th></tr></thead><tbody>
        ${['N', 'O', 'R', 'T', 'E']
          .map((p) => {
            const v = dm[p];
            if (v === null || v === undefined)
              return `<tr><td>${_mdPilarNome(p)}</td><td class="small-muted">—</td><td class="small-muted">—</td></tr>`;
            const sig = classificar(v);
            const nivel = sig === 'I' ? 'Baixo' : sig === 'D' ? 'Médio' : 'Alto';
            return `<tr><td>${_mdPilarNome(p)}</td><td style="font-family:var(--mono);">${v.toFixed(2)}</td><td><span class="pill ${sig === 'I' ? 'pill-iniciar' : sig === 'D' ? 'pill-desenvolver' : 'pill-alavancar'}">${nivel}</span></td></tr>`;
          })
          .join('')}
      </tbody></table>`;
  }

  // ---- Bloco: PDI (plano de desenvolvimento) ----
  let blocoPdi;
  const pdi = ciclo.pdiDesenvolvimento;
  if (!pdi || !pdi.length) {
    blocoPdi = `<div class="empty">Seu plano de desenvolvimento ainda não foi gerado para este ciclo.</div>`;
  } else {
    blocoPdi = `
      <table><thead><tr><th>Foco</th><th>Ação sugerida</th><th>Prazo</th><th>Status</th></tr></thead><tbody>
        ${pdi
          .map(
            (a) => `<tr>
          <td><b>${escaparHtml(a.indicador || _mdPilarNome(a.pilar))}</b>${a.competencia ? `<br><span class="small-muted">${escaparHtml(a.competencia)}</span>` : ''}</td>
          <td>${escaparHtml(a.acaoSugerida || '—')}${a.evidenciaSugerida ? `<br><span class="small-muted">Evidência: ${escaparHtml(a.evidenciaSugerida)}</span>` : ''}</td>
          <td class="small-muted">${escaparHtml(a.prazo || '—')}</td>
          <td><span class="pill ${_mdStatusPill(a.status)}">${escaparHtml(a.status || 'não iniciado')}</span></td>
        </tr>`
          )
          .join('')}
      </tbody></table>`;
  }

  // ---- Bloco: Autoavaliação ----
  let blocoAuto;
  const auto = ciclo.autoavaliacao;
  if (!auto || !Object.keys(auto).length) {
    blocoAuto = `<div class="empty">Você ainda não preencheu sua autoavaliação neste ciclo${ciclo.estado === 'Aberto' ? ' — ela está disponível na tela de avaliação.' : '.'}</div>`;
  } else {
    blocoAuto = `<div class="notice info">Você preencheu sua autoavaliação neste ciclo. Ela é considerada no diagnóstico junto com a avaliação do gestor.</div>`;
  }

  return `
    <div class="page-head">
      <div class="eyebrow">Minha evolução</div>
      <h1>Meu Desenvolvimento</h1>
      <p class="page-desc">Seu plano de desenvolvimento, sua autoavaliação e — após a conversa com seu gestor — o resultado da sua avaliação. Ciclo: ${escaparHtml(ciclo.dataAbertura || '—')}.</p>
    </div>

    <div class="card">
      <h3>Meu resultado</h3>
      ${blocoResultado}
    </div>

    <div class="card">
      <h3>Meu PDI — Plano de Desenvolvimento Individual <small>as ações para você evoluir</small></h3>
      ${blocoPdi}
    </div>

    <div class="card">
      <h3>Minha autoavaliação</h3>
      ${blocoAuto}
    </div>

    ${
      meusCiclos.length > 1
        ? `<div class="card"><h3>Histórico</h3><div class="small-muted">Você participou de ${meusCiclos.length} ciclos. Esta tela mostra o mais recente.</div></div>`
        : ''
    }
  `;
}
