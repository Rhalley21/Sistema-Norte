let _categoriaAcaoAtiva = 'Todas';
const CATEGORIAS_BANCO_ACOES = ['Conteúdo','Formação','Prática','Experiência','Desenvolvimento','Inovação'];

function pageInteligencia(){
  const categorias = [...new Set(state.bancoAcoes.map(a=>a.categoria))];
  const familias = Object.keys(BANCO_INTELIGENCIA);
  const acoesFiltradas = _categoriaAcaoAtiva==='Todas' ? state.bancoAcoes : state.bancoAcoes.filter(a=>a.categoria===_categoriaAcaoAtiva);
  const totalMetodologia = state.bancoAcoes.filter(a=>a.origem!=='empresa').length;
  const totalCustomizadas = state.bancoAcoes.filter(a=>a.origem==='empresa').length;
  const souAdminOuRh = meuPapelReal === 'owner' || meuPapelReal === 'rh';

  return `
    <div class="page-head">
      <div class="eyebrow">Base do sistema</div>
      <h1>Banco de Inteligência</h1>
      <p class="page-desc">Base CBO, competências, indicadores e Banco de Ações — conteúdo reutilizável entre cargos e ciclos. Sugestões nunca são aplicadas sem confirmação humana (RN028).</p>
    </div>

    <div class="section-label">Biblioteca por família de cargo <small>Consultada automaticamente ao importar um cargo da Base CBO</small></div>
    <div class="grid2">
      ${familias.map(fam=>{
        const b = BANCO_INTELIGENCIA[fam];
        return `
        <div class="card familia-card">
          <h3 style="margin-bottom:12px;">${fam}</h3>
          <div class="small-muted" style="text-transform:uppercase;letter-spacing:.06em;font-size:10.5px;margin-bottom:6px;">Competências</div>
          <div class="chip-row" style="margin-bottom:16px;">${b.competencias.map(c=>`<div class="chip">${c}</div>`).join('')}</div>
          <div class="indicador-col-group">
            <div class="indicador-col">
              <div class="small-muted" style="margin-bottom:6px;"><span class="tag tag-n">N</span> Nível Técnico</div>
              ${b.indicadoresN.map(i=>`<div class="indicador-item">${i.nome} <small style="opacity:.6;">— ${i.competencia}</small></div>`).join('')}
            </div>
            <div class="indicador-col">
              <div class="small-muted" style="margin-bottom:6px;"><span class="tag tag-o">O</span> Operação</div>
              ${b.indicadoresO.map(i=>`<div class="indicador-item">${i.nome} <small style="opacity:.6;">— ${i.competencia}</small></div>`).join('')}
            </div>
            <div class="indicador-col">
              <div class="small-muted" style="margin-bottom:6px;"><span class="tag tag-r">R</span> Resultado</div>
              ${b.indicadoresR.map(i=>`<div class="indicador-item">${i.nome} <small style="opacity:.6;">— ${i.competencia}</small></div>`).join('')}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>

    <div class="section-label" style="margin-top:28px;">Banco de Ações <small>${totalMetodologia} da metodologia + ${totalCustomizadas} customizada(s) da empresa, em ${categorias.length} categorias</small></div>

    ${souAdminOuRh ? `
    <div class="card">
      <h3>Adicionar ação customizada da empresa <small>Fica claramente sinalizada como extensão local, sem se misturar com a curadoria original da metodologia (regra interna, sem RN correspondente no PRD)</small></h3>
      <div class="grid2">
        <div class="field"><label>Título da ação</label><input id="na_titulo" placeholder="Ex: Job rotation de 1 semana na área comercial"></div>
        <div class="field"><label>Categoria</label>
          <select id="na_categoria">${CATEGORIAS_BANCO_ACOES.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Prazo sugerido</label><input id="na_prazo" placeholder="Ex: 30 dias"></div>
        <div class="field"><label>Competências relacionadas <small>(opcional, separadas por vírgula)</small></label><input id="na_competencias" placeholder="Ex: Negociação, Comunicação"></div>
        <div class="field"><label>Pilares aplicáveis</label>
          <div style="display:flex;gap:10px;padding-top:6px;">
            ${['N','O','R','T','E'].map(p=>`<label style="display:flex;align-items:center;gap:4px;font-size:12.5px;"><input type="checkbox" class="na_pilar" value="${p}"> ${p}</label>`).join('')}
          </div>
        </div>
      </div>
      <button class="btn btn-primary" onclick="addAcaoCustomizada()">Adicionar ao Banco de Ações</button>
    </div>
    ` : ''}

    <div class="card">
      <div class="filtro-categorias">
        <button class="filtro-pill ${_categoriaAcaoAtiva==='Todas'?'active':''}" onclick="filtrarAcoes('Todas')">Todas <span class="count">${state.bancoAcoes.length}</span></button>
        ${categorias.map(cat=>`
          <button class="filtro-pill ${_categoriaAcaoAtiva===cat?'active':''}" onclick="filtrarAcoes('${cat}')">${cat} <span class="count">${state.bancoAcoes.filter(a=>a.categoria===cat).length}</span></button>
        `).join('')}
      </div>
      <div class="acoes-grid">
        ${acoesFiltradas.map(a=>`
          <div class="action-card" style="${a.origem==='empresa'?'border-color:var(--gold);':''}">
            <div class="top">
              <b>${a.titulo}</b>
              <span class="small-muted">${a.prazoSugerido}</span>
            </div>
            <div class="meta">
              <span class="tag" style="background:var(--gold-soft);color:var(--gold);">${a.categoria}</span>
              ${a.pilares.map(p=>`<span class="tag tag-${p.toLowerCase()}">${p}</span>`).join(' ')}
              ${a.origem==='empresa'
                ? `<span class="tag" style="background:rgba(233,150,16,0.18);color:var(--gold);border:1px dashed var(--gold);">★ Ação customizada da empresa</span>`
                : `<span class="tag" style="background:var(--surface-2);color:var(--ink-faint);">Metodologia NORTE</span>`}
            </div>
            ${a.competencias?.length ? `<div class="small-muted" style="margin-top:6px;">Competências: ${a.competencias.join(', ')}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
function filtrarAcoes(cat){ _categoriaAcaoAtiva = cat; render(); }
function addAcaoCustomizada(){
  const titulo = document.getElementById('na_titulo').value.trim();
  const prazo = document.getElementById('na_prazo').value.trim();
  const categoria = document.getElementById('na_categoria').value;
  const competencias = document.getElementById('na_competencias').value.split(',').map(s=>s.trim()).filter(Boolean);
  const pilares = Array.from(document.querySelectorAll('.na_pilar:checked')).map(el=>el.value);
  if(!titulo){ showToast('Informe o título da ação.'); return; }
  if(!pilares.length){ showToast('Selecione ao menos um pilar aplicável (necessário para o matching automático do PDI).'); return; }
  state.bancoAcoes.push({ id: uid(), categoria, titulo, pilares, competencias, prazoSugerido: prazo||'a combinar', origem:'empresa' });
  registrarAuditoria('banco_acoes.customizada_criada', { titulo, categoria });
  showToast('Ação customizada adicionada — já disponível para sugestão em novos PDIs.');
  render();
}

