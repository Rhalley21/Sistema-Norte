/* =========================================================
   MEU CARGO (visão do colaborador — só leitura)
   -----------------------------------------------------------
   O colaborador vê o desenho completo do próprio cargo: missão,
   responsabilidades, cultura e postura, requisitos, competências,
   ferramentas, KPIs, condições e carreira. Transparência pra
   evitar o "isso não é minha função". Só leitura; só mostra o
   desenho se estiver publicado.
   ========================================================= */

function _blocoMeuCargoTexto(titulo, texto) {
  if (!texto || !String(texto).trim()) return '';
  return `
    <div class="meu-cargo-bloco">
      <div class="meu-cargo-bloco-titulo">${titulo}</div>
      <p class="meu-cargo-bloco-texto">${escaparHtml(texto).replace(/\n/g, '<br>')}</p>
    </div>`;
}

function _mcTextoItem(i) {
  // Aceita item como string (formato novo) ou objeto (cargos antigos podem
  // ter {nome}, {texto}, {descricao}, {titulo}, {item}...).
  if (i == null) return '';
  if (typeof i === 'string') return i;
  if (typeof i === 'object') return i.nome || i.texto || i.descricao || i.titulo || i.item || i.valor || '';
  return String(i);
}

function _blocoMeuCargoLista(titulo, itens) {
  const lista = (itens || []).map(_mcTextoItem).filter((t) => t && t.trim());
  if (!lista.length) return '';
  return `
    <div class="meu-cargo-bloco">
      <div class="meu-cargo-bloco-titulo">${titulo}</div>
      <ul class="meu-cargo-lista">
        ${lista.map((t) => `<li>${escaparHtml(t)}</li>`).join('')}
      </ul>
    </div>`;
}

function pageMeuCargo() {
  const meuRegistro = state.colaboradores.find((c) => c.perfilId === meuPerfilId);
  if (!meuRegistro) {
    return `
      <div class="page-head"><div class="eyebrow">Minha função</div><h1>Meu Cargo</h1></div>
      <div class="empty">Sua conta ainda não foi vinculada a um registro de colaborador. Peça ao RH ou Administrador para fazer essa vinculação.</div>`;
  }

  const cargo = state.cargos.find((c) => c.id === meuRegistro.cargoId);
  if (!cargo) {
    return `
      <div class="page-head"><div class="eyebrow">Minha função</div><h1>Meu Cargo</h1></div>
      <div class="empty">Você ainda não tem um cargo atribuído. Assim que o RH definir seu cargo, o descritivo completo aparecerá aqui.</div>`;
  }

  const d = cargo.desenho || {};
  // Só mostra o conteúdo se o desenho estiver publicado — rascunho não vale.
  if (!d.aprovado) {
    return `
      <div class="page-head"><div class="eyebrow">Minha função</div><h1>Meu Cargo</h1></div>
      <div class="card">
        <h3>${escaparHtml(cargo.nome)}</h3>
        <div class="notice info">O descritivo do seu cargo ainda está sendo finalizado pela empresa. Assim que for publicado, você verá aqui todas as responsabilidades, requisitos e indicadores da sua função.</div>
      </div>`;
  }

  return `
    <div class="page-head">
      <div class="eyebrow">Minha função</div>
      <h1>Meu Cargo</h1>
      <p class="page-desc">Tudo o que se espera da sua função — responsabilidades, requisitos e indicadores. Em caso de dúvida sobre suas atribuições, este é o documento oficial.</p>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
        <div>
          <h3 style="margin:0;">${escaparHtml(cargo.nome)}</h3>
          <div class="small-muted" style="margin-top:4px;">
            ${cargo.natureza ? `Natureza: ${escaparHtml(cargo.natureza)}` : ''}${d.area ? ` · Área: ${escaparHtml(d.area)}` : ''}${d.nivelHierarquico ? ` · Nível: ${escaparHtml(d.nivelHierarquico)}` : ''}${cargo.cbo ? ` · CBO: ${escaparHtml(cargo.cbo)}` : ''}
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="exportarDesenhoCargoPDF('${cargo.id}')" style="display:inline-flex;align-items:center;gap:6px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/></svg>
          Baixar PDF
        </button>
      </div>

      ${_blocoMeuCargoTexto('Missão do cargo', d.missao)}
      ${_blocoMeuCargoTexto('Reporta-se a', d.subordinacao)}
      ${_blocoMeuCargoLista('Responsabilidades e atribuições', d.responsabilidades)}
      ${_blocoMeuCargoTexto('Cultura e postura institucional', d.culturaPostura)}
      ${_blocoMeuCargoTexto('Formação acadêmica', d.formacaoAcademica)}
      ${_blocoMeuCargoTexto('Experiência profissional', d.experienciaProfissional)}
      ${_blocoMeuCargoTexto('Conhecimentos técnicos', d.conhecimentosTecnicos)}
      ${_blocoMeuCargoTexto('Idiomas', d.idiomas)}
      ${_blocoMeuCargoLista('Competências comportamentais', d.competenciasComportamentais)}
      ${_blocoMeuCargoLista('Ferramentas e sistemas', d.ferramentasSistemas)}
      ${_blocoMeuCargoLista('Indicadores de desempenho (KPIs)', d.kpis)}
      ${_blocoMeuCargoTexto('Condições de trabalho', d.condicoesTrabalho)}
      ${_blocoMeuCargoLista('Perspectivas de carreira', d.perspectivasCarreira)}
    </div>
  `;
}
