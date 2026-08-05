let _compararA = '';
let _compararB = '';

function pageDesenho() {
  if (!state.cargos.length)
    return `<div class="page-head"><h1>Desenho de Cargo</h1></div><div class="empty">Cadastre ao menos um cargo primeiro.</div>`;
  const cargoId = state.cargoEditando || state.cargos[0].id;
  const cargo = state.cargos.find((c) => c.id === cargoId) || state.cargos[0];
  const d = cargo.desenho;
  const jaPublicadoAntes = cargo.desenho.aprovado;

  return `
    <div class="page-head">
      <div class="eyebrow">Etapa 05 · Cargos</div>
      <h1>Desenho de Cargo</h1>
      <p class="page-desc">Documento-mestre que sustenta a avaliação. Nenhum colaborador é avaliado sem um Desenho de Cargo publicado (RN001), e toda alteração gera nova versão, nunca sobrescreve (RN024).</p>
    </div>

    <div class="card">
      <h3>Selecionar cargo</h3>
      <select onchange="state.cargoEditando=this.value; render();" style="width:100%;padding:9px 11px;background:var(--surface-2);border:1px solid var(--line);border-radius:7px;color:var(--ink);">
        ${state.cargos.map((c) => `<option value="${c.id}" ${c.id === cargo.id ? 'selected' : ''}>${escaparHtml(c.nome)}${c.descontinuado ? ' (descontinuado)' : ''}</option>`).join('')}
      </select>
    </div>

    ${cargo.descontinuado ? '<div class="notice">Este cargo está descontinuado — o Desenho pode ser consultado, mas não é possível abrir novos ciclos para ele. Reative-o na aba "Base de Cargos" se precisar voltar a usá-lo.</div>' : ''}

    <div class="card">
      <h3>${escaparHtml(cargo.nome)} <small>${escaparHtml(cargo.familia)} · ${escaparHtml(cargo.natureza)} ${cargo.cbo ? '· CBO ' + cargo.cbo : ''} ${d.aprovado ? '· versão publicada v' + d.versao : '· rascunho'}</small></h3>

      <div class="small-muted" style="text-transform:uppercase;letter-spacing:.06em;font-size:11px;margin:16px 0 8px;">1. Identificação do Cargo</div>
      <div class="grid2">
        <div class="field"><label>Área / Departamento</label><input id="d_area" value="${escaparHtml(d.area)}" placeholder="Ex: Tecnologia da Informação"></div>
        <div class="field"><label>Nível Hierárquico</label><input id="d_nivel" value="${escaparHtml(d.nivelHierarquico)}" placeholder="Ex: Técnico / Analista"></div>
        <div class="field"><label>Regime de Trabalho</label><input id="d_regime" value="${escaparHtml(d.regimeTrabalho)}" placeholder="Ex: CLT — Jornada de 40h semanais"></div>
        <div class="field"><label>Local de Trabalho</label><input id="d_local" value="${escaparHtml(d.localTrabalho)}" placeholder="Ex: Sede da empresa / Modelo híbrido"></div>
        <div class="field"><label>Subordinação (reporta-se a)</label><input id="d_subordinacao" value="${escaparHtml(d.subordinacao)}" placeholder="Ex: Coordenador(a) de Dados"></div>
        <div class="field"><label>Subordinados Diretos</label><input id="d_subordinados" value="${escaparHtml(d.subordinadosDiretos)}" placeholder="Ex: Nenhum"></div>
        <div class="field"><label>Natureza do cargo <small>(usada no Mapa de Sucessão — só cargos "Estratégica" viram posição-chave)</small></label>
          <select id="d_natureza">
            ${['Operacional', 'Apoio', 'Estratégica'].map((n) => `<option ${cargo.natureza === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="small-muted" style="text-transform:uppercase;letter-spacing:.06em;font-size:11px;margin:16px 0 8px;">2. Missão do Cargo</div>
      <div class="field"><label>Missão</label><textarea id="d_missao">${escaparHtml(d.missao)}</textarea></div>

      <div class="small-muted" style="text-transform:uppercase;letter-spacing:.06em;font-size:11px;margin:16px 0 8px;">3. Responsabilidades e Atribuições</div>
      <div class="field"><label>Responsabilidades (uma por linha)</label><textarea id="d_responsabilidades" rows="6">${(d.responsabilidades || []).map(escaparHtml).join('\n')}</textarea></div>
      <div class="field"><label>Categoria obrigatória: Cultura e Postura Institucional <small>(RN030)</small></label><textarea id="d_cultura">${escaparHtml(d.culturaPostura)}</textarea></div>

      <div class="small-muted" style="text-transform:uppercase;letter-spacing:.06em;font-size:11px;margin:16px 0 8px;">4. Requisitos do Cargo</div>
      <div class="field"><label>Formação Acadêmica</label><textarea id="d_formacao">${escaparHtml(d.formacaoAcademica)}</textarea></div>
      <div class="field"><label>Experiência Profissional</label><textarea id="d_experiencia">${escaparHtml(d.experienciaProfissional)}</textarea></div>
      <div class="field"><label>Conhecimentos Técnicos</label><textarea id="d_conhecimentos">${escaparHtml(d.conhecimentosTecnicos)}</textarea></div>
      <div class="field"><label>Idiomas</label><textarea id="d_idiomas">${escaparHtml(d.idiomas)}</textarea></div>

      <div class="small-muted" style="text-transform:uppercase;letter-spacing:.06em;font-size:11px;margin:16px 0 8px;">5. Competências Comportamentais</div>
      <div class="field"><label>Competências (uma por linha)</label><textarea id="d_competencias" rows="5">${(d.competenciasComportamentais || []).map(escaparHtml).join('\n')}</textarea></div>

      <div class="small-muted" style="text-transform:uppercase;letter-spacing:.06em;font-size:11px;margin:16px 0 8px;">6. Ferramentas e Sistemas Utilizados</div>
      <div class="field"><label>Ferramentas/Sistemas (um por linha)</label><textarea id="d_ferramentas" rows="4">${(d.ferramentasSistemas || []).map(escaparHtml).join('\n')}</textarea></div>

      <div class="small-muted" style="text-transform:uppercase;letter-spacing:.06em;font-size:11px;margin:16px 0 8px;">7. Indicadores de Desempenho (KPIs do Cargo)</div>
      <div class="field"><label>KPIs (um por linha)</label><textarea id="d_kpis" rows="4">${(d.kpis || []).map(escaparHtml).join('\n')}</textarea></div>

      <div class="small-muted" style="text-transform:uppercase;letter-spacing:.06em;font-size:11px;margin:16px 0 8px;">8. Condições de Trabalho</div>
      <div class="field"><label>Condições</label><textarea id="d_condicoes">${escaparHtml(d.condicoesTrabalho)}</textarea></div>

      <div class="small-muted" style="text-transform:uppercase;letter-spacing:.06em;font-size:11px;margin:16px 0 8px;">9. Perspectivas de Carreira</div>
      <div class="field"><label>Trilha de carreira (uma por linha)</label><textarea id="d_carreira" rows="3">${(d.perspectivasCarreira || []).map(escaparHtml).join('\n')}</textarea></div>

      ${jaPublicadoAntes ? `<div class="field"><label>Motivo da alteração <small>(obrigatório — toda nova versão precisa registrar por que mudou, RN024)</small></label><textarea id="d_motivo" placeholder="Ex: Ajuste de indicadores após revisão do RH em conjunto com a liderança da área."></textarea></div>` : ''}
      <button class="btn" onclick="salvarRascunhoDesenho('${cargo.id}')">Salvar rascunho</button>
      <button class="btn btn-primary" onclick="publicarDesenho('${cargo.id}')" ${indicadoresOk(cargo) ? '' : 'disabled'}>Publicar versão ${jaPublicadoAntes ? d.versao + 1 : d.versao}</button>
      ${!indicadoresOk(cargo) ? '<div class="small-muted" style="margin-top:8px;">É preciso ao menos um indicador em cada pilar (N, O, R) para publicar.</div>' : ''}
    </div>

    ${
      cargo.sugestoes
        ? renderSugestoesBanco(cargo)
        : `
      <div class="card">
        <h3>Banco de Inteligência <small>Puxe sugestões atualizadas de indicadores para este cargo (RN028 — sempre como rascunho editável)</small></h3>
        <button class="btn" onclick="atualizarSugestoesCargo('${cargo.id}')">Atualizar sugestões de indicadores</button>
      </div>
    `
    }

    <div class="grid3">
      ${indicadorCargoCard(cargo, 'N', 'indicadoresN', 'Nível Técnico (específico do cargo)')}
      ${indicadorCargoCard(cargo, 'O', 'indicadoresO', 'Operação (específico do cargo)')}
      ${indicadorCargoCard(cargo, 'R', 'indicadoresR', 'Resultado (cargo + metas)')}
    </div>

    <div class="card">
      <h3>Pilares herdados da empresa <small>T e E são universais — não editáveis por cargo (RN012)</small></h3>
      <div class="grid2">
        <div><b class="tag tag-t">T · Time</b><div class="chip-row">${state.cultura.indicadoresT.map((i) => `<div class="chip">${escaparHtml(i.nome)}</div>`).join('') || '<span class="small-muted">Configure em Cultura Organizacional</span>'}</div></div>
        <div><b class="tag tag-e">E · Evolução</b><div class="chip-row">${state.cultura.indicadoresE.map((i) => `<div class="chip">${escaparHtml(i.nome)}</div>`).join('') || '<span class="small-muted">Configure em Cultura Organizacional</span>'}</div></div>
      </div>
    </div>

    ${cargo.versoes && cargo.versoes.length ? renderHistoricoVersoes(cargo) : ''}
  `;
}

function renderHistoricoVersoes(cargo) {
  return `
    <div class="card">
      <h3>Histórico de versões <small>Versões anteriores nunca são apagadas (RN024)</small></h3>
      <table>
        <thead><tr><th>Versão</th><th>Publicada em</th><th>Motivo</th></tr></thead>
        <tbody>
          ${cargo.versoes
            .slice()
            .reverse()
            .map(
              (v) => `
            <tr>
              <td><b>v${v.versao}</b></td>
              <td class="small-muted">${v.data}</td>
              <td class="small-muted">${v.motivo}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>

      <div style="margin-top:16px;">
        <div class="small-muted" style="margin-bottom:8px;">Comparar duas versões lado a lado</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <select onchange="_compararA=this.value; render();">
            <option value="">Versão A…</option>
            ${cargo.versoes.map((v) => `<option value="${v.versao}" ${_compararA == v.versao ? 'selected' : ''}>v${v.versao}</option>`).join('')}
          </select>
          <span class="small-muted">vs.</span>
          <select onchange="_compararB=this.value; render();">
            <option value="">Versão B…</option>
            ${cargo.versoes.map((v) => `<option value="${v.versao}" ${_compararB == v.versao ? 'selected' : ''}>v${v.versao}</option>`).join('')}
          </select>
        </div>
        ${_compararA && _compararB && _compararA !== _compararB ? renderDiffVersoes(cargo, _compararA, _compararB) : ''}
      </div>
    </div>
  `;
}

function renderDiffVersoes(cargo, va, vb) {
  const A = cargo.versoes.find((v) => String(v.versao) === String(va));
  const B = cargo.versoes.find((v) => String(v.versao) === String(vb));
  if (!A || !B) return '';

  const linhaTexto = (label, a, b) => `
    <tr class="${a === b ? '' : 'diff-mudou'}">
      <td class="small-muted">${label}</td>
      <td>${a ? escaparHtml(a) : '<span class="small-muted">—</span>'}</td>
      <td>${b ? escaparHtml(b) : '<span class="small-muted">—</span>'}</td>
    </tr>`;
  const linhaLista = (label, listaA, listaB) => {
    const nomesA = (listaA || []).map((i) => i.nome || i);
    const nomesB = (listaB || []).map((i) => i.nome || i);
    const render1 = nomesA
      .map((n) => `<span class="chip ${!nomesB.includes(n) ? 'diff-removido' : ''}">${escaparHtml(n)}</span>`)
      .join(' ');
    const render2 = nomesB
      .map((n) => `<span class="chip ${!nomesA.includes(n) ? 'diff-adicionado' : ''}">${escaparHtml(n)}</span>`)
      .join(' ');
    return `<tr><td class="small-muted">${label}</td><td>${render1 || '—'}</td><td>${render2 || '—'}</td></tr>`;
  };

  return `
    <table style="margin-top:14px;">
      <thead><tr><th></th><th>v${A.versao} <span class="small-muted">(${A.data})</span></th><th>v${B.versao} <span class="small-muted">(${B.data})</span></th></tr></thead>
      <tbody>
        ${linhaTexto('Missão', A.missao, B.missao)}
        ${linhaTexto('Cultura e Postura', A.culturaPostura, B.culturaPostura)}
        ${linhaTexto('Formação Acadêmica', A.formacaoAcademica, B.formacaoAcademica)}
        ${linhaTexto('Experiência Profissional', A.experienciaProfissional, B.experienciaProfissional)}
        ${linhaLista('Responsabilidades', A.responsabilidades, B.responsabilidades)}
        ${linhaLista('Competências Comportamentais', A.competenciasComportamentais, B.competenciasComportamentais)}
        ${linhaLista('Ferramentas e Sistemas', A.ferramentasSistemas, B.ferramentasSistemas)}
        ${linhaLista('KPIs', A.kpis, B.kpis)}
        ${linhaLista('Perspectivas de Carreira', A.perspectivasCarreira, B.perspectivasCarreira)}
        ${linhaLista('Indicadores N', A.indicadoresN, B.indicadoresN)}
        ${linhaLista('Indicadores O', A.indicadoresO, B.indicadoresO)}
        ${linhaLista('Indicadores R', A.indicadoresR, B.indicadoresR)}
      </tbody>
    </table>
    <div class="small-muted" style="margin-top:8px;">
      <span class="chip diff-adicionado">verde</span> = adicionado na versão mais nova ·
      <span class="chip diff-removido">vermelho</span> = existia e foi removido · linha destacada = texto diferente entre as versões.
    </div>
  `;
}

function indicadoresOk(cargo) {
  return cargo.indicadoresN.length > 0 && cargo.indicadoresO.length > 0 && cargo.indicadoresR.length > 0;
}
function renderSugestoesBanco(cargo) {
  const s = cargo.sugestoes;
  const grupo = (titulo, pilarClasse, itens) => `
    <div style="margin-bottom:14px;">
      <div class="small-muted" style="text-transform:uppercase;letter-spacing:.06em;font-size:11px;margin-bottom:6px;">${titulo}</div>
      ${
        itens
          .map(
            (i) => `
        <label style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px;cursor:pointer;">
          <input type="checkbox" ${i.marcado ? 'checked' : ''} onchange="toggleSugestao('${cargo.id}','${pilarClasse}','${i.id}')">
          ${escaparHtml(i.nome)}${i.competencia ? ` <small class="small-muted">— ${escaparHtml(i.competencia)}</small>` : ''}
        </label>
      `
          )
          .join('') || '<div class="small-muted">Nenhuma sugestão nesta categoria.</div>'
      }
    </div>`;
  return `
    <div class="card" style="border-left:3px solid var(--gold);">
      <h3>Sugestões do Banco de Inteligência <small>Baseadas na família "${escaparHtml(cargo.familia)}" — revise e confirme antes de aplicar (RN028)</small></h3>
      <div class="notice">Estas sugestões ainda NÃO fazem parte do cargo. Desmarque o que não fizer sentido e clique em "Aplicar selecionadas" — nada é adicionado automaticamente.</div>
      ${grupo('Competências sugeridas (referência)', 'competencias', s.competencias)}
      ${grupo('Indicadores sugeridos — N (Nível Técnico)', 'indicadoresN', s.indicadoresN)}
      ${grupo('Indicadores sugeridos — O (Operação)', 'indicadoresO', s.indicadoresO)}
      ${grupo('Indicadores sugeridos — R (Resultado)', 'indicadoresR', s.indicadoresR)}
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn btn-primary" onclick="aplicarSugestoesCargo('${cargo.id}')">Aplicar selecionadas</button>
        <button class="btn btn-ghost" onclick="descartarSugestoesCargo('${cargo.id}')">Descartar sugestões</button>
      </div>
    </div>`;
}
function indicadorCargoCard(cargo, pilar, key, titulo) {
  return `
  <div class="card">
    <h3><span class="tag tag-${pilar.toLowerCase()}">${pilar}</span> ${titulo}</h3>
    ${cargo[key].map((i) => `<div class="chip">${escaparHtml(i.nome)}${i.competencia ? ` <span class="small-muted">(${escaparHtml(i.competencia)})</span>` : ''}</div>`).join('') || '<p class="small-muted">Nenhum indicador ainda.</p>'}
    <div class="grid2" style="margin-top:12px;">
      <input id="ni_${pilar}_${cargo.id}" placeholder="Novo indicador ${pilar}" style="padding:9px 11px;background:var(--surface-2);border:1px solid var(--line);border-radius:7px;color:var(--ink);">
      <input id="nc_${pilar}_${cargo.id}" placeholder="Competência (opcional)" style="padding:9px 11px;background:var(--surface-2);border:1px solid var(--line);border-radius:7px;color:var(--ink);">
    </div>
    <button class="btn btn-sm" style="margin-top:8px;" onclick="addIndicadorCargo('${cargo.id}','${key}','${pilar}')">+ Adicionar</button>
  </div>`;
}
function addIndicadorCargo(cargoId, key, pilar) {
  const cargo = state.cargos.find((c) => c.id === cargoId);
  const input = document.getElementById(`ni_${pilar}_${cargoId}`);
  const inputComp = document.getElementById(`nc_${pilar}_${cargoId}`);
  const nome = input.value.trim();
  const competencia = inputComp.value.trim();
  if (!nome) return;
  cargo[key].push({ id: uid(), nome, competencia: competencia || undefined });
  render();
}
function salvarRascunhoDesenho(cargoId, silencioso) {
  const cargo = state.cargos.find((c) => c.id === cargoId);
  const d = cargo.desenho;
  cargo.natureza = document.getElementById('d_natureza').value;
  d.area = document.getElementById('d_area').value;
  d.nivelHierarquico = document.getElementById('d_nivel').value;
  d.regimeTrabalho = document.getElementById('d_regime').value;
  d.localTrabalho = document.getElementById('d_local').value;
  d.subordinacao = document.getElementById('d_subordinacao').value;
  d.subordinadosDiretos = document.getElementById('d_subordinados').value;
  d.missao = document.getElementById('d_missao').value;
  d.responsabilidades = document
    .getElementById('d_responsabilidades')
    .value.split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  d.culturaPostura = document.getElementById('d_cultura').value;
  d.formacaoAcademica = document.getElementById('d_formacao').value;
  d.experienciaProfissional = document.getElementById('d_experiencia').value;
  d.conhecimentosTecnicos = document.getElementById('d_conhecimentos').value;
  d.idiomas = document.getElementById('d_idiomas').value;
  d.competenciasComportamentais = document
    .getElementById('d_competencias')
    .value.split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  d.ferramentasSistemas = document
    .getElementById('d_ferramentas')
    .value.split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  d.kpis = document
    .getElementById('d_kpis')
    .value.split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  d.condicoesTrabalho = document.getElementById('d_condicoes').value;
  d.perspectivasCarreira = document
    .getElementById('d_carreira')
    .value.split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!silencioso) {
    showToast('Rascunho salvo.');
    render();
  }
}
function publicarDesenho(cargoId) {
  const cargo = state.cargos.find((c) => c.id === cargoId);
  const jaPublicadoAntes = cargo.desenho.aprovado;

  salvarRascunhoDesenho(cargoId, /*silencioso=*/ true);

  let motivo = 'Publicação inicial do Desenho de Cargo.';
  if (jaPublicadoAntes) {
    motivo = document.getElementById('d_motivo').value.trim();
    if (!motivo) {
      showToast('Informe o motivo da alteração para publicar uma nova versão (RN024).');
      return;
    }
  }

  if (!indicadoresOk(cargo)) {
    showToast('É preciso ao menos um indicador em cada pilar (N, O, R) para publicar.');
    return;
  }

  const novaVersao = jaPublicadoAntes ? cargo.desenho.versao + 1 : cargo.desenho.versao;
  const dataPublicacao = new Date().toISOString().slice(0, 10);
  const d = cargo.desenho;

  // RN024: guarda um retrato imutável desta versão no histórico — nunca é apagado.
  cargo.versoes = cargo.versoes || [];
  cargo.versoes.push({
    versao: novaVersao,
    data: dataPublicacao,
    motivo,
    area: d.area,
    nivelHierarquico: d.nivelHierarquico,
    regimeTrabalho: d.regimeTrabalho,
    subordinacao: d.subordinacao,
    subordinadosDiretos: d.subordinadosDiretos,
    localTrabalho: d.localTrabalho,
    missao: d.missao,
    responsabilidades: [...d.responsabilidades],
    culturaPostura: d.culturaPostura,
    formacaoAcademica: d.formacaoAcademica,
    experienciaProfissional: d.experienciaProfissional,
    conhecimentosTecnicos: d.conhecimentosTecnicos,
    idiomas: d.idiomas,
    competenciasComportamentais: [...d.competenciasComportamentais],
    ferramentasSistemas: [...d.ferramentasSistemas],
    kpis: [...d.kpis],
    condicoesTrabalho: d.condicoesTrabalho,
    perspectivasCarreira: [...d.perspectivasCarreira],
    indicadoresN: cargo.indicadoresN.map((i) => ({ ...i })),
    indicadoresO: cargo.indicadoresO.map((i) => ({ ...i })),
    indicadoresR: cargo.indicadoresR.map((i) => ({ ...i })),
  });

  cargo.desenho.versao = novaVersao;
  cargo.desenho.aprovado = true;
  atualizarCarimbo(cargo);
  cargo.desenho.dataAprovacao = dataPublicacao;

  registrarAuditoria('cargo.versao_publicada', { nome: cargo.nome, versao: novaVersao, motivo });
  emitirEvento('cargo.desenho_publicado', { cargoId: cargo.id, versao: novaVersao });
  showToast(
    `Desenho de Cargo publicado (v${novaVersao}). Ciclos abertos a partir de agora usam esta versão — os que já estavam em andamento continuam na versão anterior (RN024).`
  );
  render();
}

/* ===================== 6. COLABORADORES ===================== */
