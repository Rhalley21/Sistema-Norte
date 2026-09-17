/* =========================================================
   ACOMPANHAMENTO (RH/Admin/Gestor)
   -----------------------------------------------------------
   Duas listas com TODOS os colaboradores: status do PDI (quem
   está fazendo e quem não) e status da avaliação (quem foi
   avaliado e quem não). Aberta pelos botões dos cards de PDI e
   Avaliações no dashboard.
   ========================================================= */

let _acompAba = 'pdi'; // 'pdi' | 'avaliacao'

function _acompCicloMaisRecentePorColab() {
  const porColab = {};
  state.ciclos.forEach((c) => {
    const at = porColab[c.colaboradorId];
    if (!at || (c.dataAbertura || '').localeCompare(at.dataAbertura || '') > 0) porColab[c.colaboradorId] = c;
  });
  return porColab;
}

function _acompStatusPdi(ciclo) {
  const acoes = ciclo?.pdiDesenvolvimento;
  if (!acoes || !acoes.length) return { texto: 'Sem PDI', cor: 'pill-neutral', prog: '—' };
  const concluidas = acoes.filter((a) => (a.status || '').toLowerCase().includes('conclu')).length;
  const iniciadas = acoes.filter((a) => {
    const s = (a.status || '').toLowerCase();
    return s.includes('andamento') || s.includes('iniciad');
  }).length;
  if (concluidas === acoes.length)
    return { texto: 'Concluído', cor: 'pill-alavancar', prog: `${concluidas}/${acoes.length}` };
  if (concluidas > 0 || iniciadas > 0)
    return { texto: 'Em andamento', cor: 'pill-desenvolver', prog: `${concluidas}/${acoes.length}` };
  return { texto: 'Não iniciado', cor: 'pill-iniciar', prog: `${concluidas}/${acoes.length}` };
}

function _acompStatusAvaliacao(ciclo) {
  if (ciclo && ciclo.diagnostico) return { texto: 'Avaliado', cor: 'pill-alavancar' };
  if (ciclo) return { texto: 'Pendente', cor: 'pill-desenvolver' };
  return { texto: 'Não iniciada', cor: 'pill-iniciar' };
}

function pageAcompanhamento() {
  const porColab = _acompCicloMaisRecentePorColab();
  const ativos = state.colaboradores.filter((p) => !p.inativo);

  const linhasPdi = ativos
    .map((p) => {
      const cargo = state.cargos.find((c) => c.id === p.cargoId);
      const st = _acompStatusPdi(porColab[p.id]);
      return { nome: p.nome, cargo: cargo?.nome || '—', ...st };
    })
    // Ordena: não iniciado e sem PDI primeiro (o que precisa de ação).
    .sort((a, b) => {
      const ordem = { 'Não iniciado': 0, 'Sem PDI': 1, 'Em andamento': 2, Concluído: 3 };
      return (ordem[a.texto] ?? 9) - (ordem[b.texto] ?? 9) || a.nome.localeCompare(b.nome);
    });

  const linhasAval = ativos
    .map((p) => {
      const cargo = state.cargos.find((c) => c.id === p.cargoId);
      const st = _acompStatusAvaliacao(porColab[p.id]);
      return { nome: p.nome, cargo: cargo?.nome || '—', ...st };
    })
    .sort((a, b) => {
      const ordem = { Pendente: 0, 'Não iniciada': 1, Avaliado: 2 };
      return (ordem[a.texto] ?? 9) - (ordem[b.texto] ?? 9) || a.nome.localeCompare(b.nome);
    });

  // Contadores pro resumo de cada aba.
  const pdiFazendo = linhasPdi.filter((l) => l.texto === 'Em andamento' || l.texto === 'Concluído').length;
  const avalFeitas = linhasAval.filter((l) => l.texto === 'Avaliado').length;

  const tabela = (linhas, colStatus) => `
    <table><thead><tr><th>Colaborador</th><th>Cargo</th>${colStatus}</tr></thead><tbody>
      ${linhas
        .map(
          (l) =>
            `<tr><td><b>${escaparHtml(l.nome)}</b></td><td class="small-muted">${escaparHtml(l.cargo)}</td>${
              l.prog !== undefined ? `<td class="small-muted" style="font-family:var(--mono);">${l.prog}</td>` : ''
            }<td><span class="pill ${l.cor}">${l.texto}</span></td></tr>`
        )
        .join('')}
    </tbody></table>`;

  return `
    <div class="page-head">
      <div class="eyebrow">Acompanhamento</div>
      <h1>PDIs e Avaliações</h1>
      <p class="page-desc">Situação de cada colaborador: quem está com o PDI em dia e quem foi avaliado — e quem ainda falta.</p>
    </div>

    <div class="card">
      <div class="filtro-tabs" style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
        <button class="btn ${_acompAba === 'pdi' ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="_acompAba='pdi';render();">PDIs em andamento (${pdiFazendo}/${ativos.length})</button>
        <button class="btn ${_acompAba === 'avaliacao' ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="_acompAba='avaliacao';render();">Colaboradores avaliados (${avalFeitas}/${ativos.length})</button>
      </div>
      ${
        !ativos.length
          ? '<div class="empty">Nenhum colaborador cadastrado ainda.</div>'
          : _acompAba === 'pdi'
            ? tabela(linhasPdi, '<th>Progresso</th><th>Status do PDI</th>')
            : tabela(linhasAval, '<th>Avaliação</th>')
      }
    </div>
  `;
}
