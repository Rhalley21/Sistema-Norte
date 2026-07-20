let _compararA = '';
let _compararB = '';

function pageDesenho(){
  if(!state.cargos.length) return `<div class="page-head"><h1>Desenho de Cargo</h1></div><div class="empty">Cadastre ao menos um cargo primeiro.</div>`;
  const cargoId = state.cargoEditando || state.cargos[0].id;
  const cargo = state.cargos.find(c=>c.id===cargoId) || state.cargos[0];
  const d = cargo.desenho;
  const jaPublicadoAntes = cargo.desenho.aprovado;

  return `
    <div class="page-head">
      <div class="eyebrow">Etapa 05 · Cargos</div>
      <h1>Desenho de Cargo</h1>
      <p class="page-desc">Documento-mestre que sustenta a avaliação. Nenhum colaborador é avaliado sem um Desenho de Cargo publicado (RN018/RN019).</p>
    </div>

    <div class="card">
      <h3>Selecionar cargo</h3>
      <select onchange="state.cargoEditando=this.value; render();" style="width:100%;padding:9px 11px;background:var(--surface-2);border:1px solid var(--line);border-radius:7px;color:var(--ink);">
        ${state.cargos.map(c=>`<option value="${c.id}" ${c.id===cargo.id?'selected':''}>${c.nome}${c.descontinuado?' (descontinuado)':''}</option>`).join('')}
      </select>
    </div>

    ${cargo.descontinuado ? '<div class="notice">Este cargo está descontinuado — o Desenho pode ser consultado, mas não é possível abrir novos ciclos para ele. Reative-o na aba "Base de Cargos" se precisar voltar a usá-lo.</div>' : ''}

    <div class="card">
      <h3>${cargo.nome} <small>${cargo.familia} · ${cargo.natureza} ${cargo.cbo?'· CBO '+cargo.cbo:''} ${d.aprovado?'· versão publicada v'+d.versao:'· rascunho'}</small></h3>
      <div class="field"><label>Sumário do cargo</label><textarea id="d_sumario">${d.sumario}</textarea></div>
      <div class="field"><label>Atividades específicas (uma por linha)</label><textarea id="d_atividades">${d.atividadesEspecificas.join('\\n')}</textarea></div>
      <div class="field"><label>Categoria obrigatória: Cultura e Postura Institucional</label><textarea id="d_cultura">${d.culturaPostura}</textarea></div>
      <div class="field"><label>Requisitos mínimos</label><textarea id="d_requisitos">${d.requisitos}</textarea></div>
      ${jaPublicadoAntes ? `<div class="field"><label>Motivo da alteração <small>(obrigatório — toda nova versão precisa registrar por que mudou, RN019)</small></label><textarea id="d_motivo" placeholder="Ex: Ajuste de indicadores após revisão do RH em conjunto com a liderança da área."></textarea></div>` : ''}
      <button class="btn" onclick="salvarRascunhoDesenho('${cargo.id}')">Salvar rascunho</button>
      <button class="btn btn-primary" onclick="publicarDesenho('${cargo.id}')" ${indicadoresOk(cargo)?'':'disabled'}>Publicar versão ${jaPublicadoAntes ? d.versao+1 : d.versao}</button>
      ${!indicadoresOk(cargo)?'<div class="small-muted" style="margin-top:8px;">É preciso ao menos um indicador em cada pilar (N, O, R) para publicar.</div>':''}
    </div>

    ${cargo.sugestoes ? renderSugestoesBanco(cargo) : `
      <div class="card">
        <h3>Banco de Inteligência <small>Puxe sugestões atualizadas de indicadores para este cargo (RN028 — sempre como rascunho editável)</small></h3>
        <button class="btn" onclick="atualizarSugestoesCargo('${cargo.id}')">Atualizar sugestões de indicadores</button>
      </div>
    `}

    <div class="grid3">
      ${indicadorCargoCard(cargo,'N','indicadoresN','Nível Técnico (específico do cargo)')}
      ${indicadorCargoCard(cargo,'O','indicadoresO','Operação (específico do cargo)')}
      ${indicadorCargoCard(cargo,'R','indicadoresR','Resultado (cargo + metas)')}
    </div>

    <div class="card">
      <h3>Pilares herdados da empresa <small>T e E são universais — não editáveis por cargo (RN018)</small></h3>
      <div class="grid2">
        <div><b class="tag tag-t">T · Time</b><div class="chip-row">${state.cultura.indicadoresT.map(i=>`<div class="chip">${i.nome}</div>`).join('')||'<span class="small-muted">Configure em Cultura Organizacional</span>'}</div></div>
        <div><b class="tag tag-e">E · Evolução</b><div class="chip-row">${state.cultura.indicadoresE.map(i=>`<div class="chip">${i.nome}</div>`).join('')||'<span class="small-muted">Configure em Cultura Organizacional</span>'}</div></div>
      </div>
    </div>

    ${cargo.versoes && cargo.versoes.length ? renderHistoricoVersoes(cargo) : ''}
  `;
}

function renderHistoricoVersoes(cargo){
  return `
    <div class="card">
      <h3>Histórico de versões <small>Versões anteriores nunca são apagadas (RN019)</small></h3>
      <table>
        <thead><tr><th>Versão</th><th>Publicada em</th><th>Motivo</th></tr></thead>
        <tbody>
          ${cargo.versoes.slice().reverse().map(v=>`
            <tr>
              <td><b>v${v.versao}</b></td>
              <td class="small-muted">${v.data}</td>
              <td class="small-muted">${v.motivo}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="margin-top:16px;">
        <div class="small-muted" style="margin-bottom:8px;">Comparar duas versões lado a lado</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <select onchange="_compararA=this.value; render();">
            <option value="">Versão A…</option>
            ${cargo.versoes.map(v=>`<option value="${v.versao}" ${_compararA==v.versao?'selected':''}>v${v.versao}</option>`).join('')}
          </select>
          <span class="small-muted">vs.</span>
          <select onchange="_compararB=this.value; render();">
            <option value="">Versão B…</option>
            ${cargo.versoes.map(v=>`<option value="${v.versao}" ${_compararB==v.versao?'selected':''}>v${v.versao}</option>`).join('')}
          </select>
        </div>
        ${_compararA && _compararB && _compararA!==_compararB ? renderDiffVersoes(cargo, _compararA, _compararB) : ''}
      </div>
    </div>
  `;
}

function renderDiffVersoes(cargo, va, vb){
  const A = cargo.versoes.find(v=>String(v.versao)===String(va));
  const B = cargo.versoes.find(v=>String(v.versao)===String(vb));
  if(!A || !B) return '';

  const linhaTexto = (label, a, b) => `
    <tr class="${a===b?'':'diff-mudou'}">
      <td class="small-muted">${label}</td>
      <td>${a || '<span class="small-muted">—</span>'}</td>
      <td>${b || '<span class="small-muted">—</span>'}</td>
    </tr>`;
  const linhaLista = (label, listaA, listaB) => {
    const nomesA = listaA.map(i=>i.nome||i);
    const nomesB = listaB.map(i=>i.nome||i);
    const render1 = nomesA.map(n=>`<span class="chip ${!nomesB.includes(n)?'diff-removido':''}">${n}</span>`).join(' ');
    const render2 = nomesB.map(n=>`<span class="chip ${!nomesA.includes(n)?'diff-adicionado':''}">${n}</span>`).join(' ');
    return `<tr><td class="small-muted">${label}</td><td>${render1||'—'}</td><td>${render2||'—'}</td></tr>`;
  };

  return `
    <table style="margin-top:14px;">
      <thead><tr><th></th><th>v${A.versao} <span class="small-muted">(${A.data})</span></th><th>v${B.versao} <span class="small-muted">(${B.data})</span></th></tr></thead>
      <tbody>
        ${linhaTexto('Sumário', A.sumario, B.sumario)}
        ${linhaTexto('Cultura e Postura', A.culturaPostura, B.culturaPostura)}
        ${linhaTexto('Requisitos', A.requisitos, B.requisitos)}
        ${linhaLista('Atividades', A.atividadesEspecificas, B.atividadesEspecificas)}
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

function indicadoresOk(cargo){
  return cargo.indicadoresN.length>0 && cargo.indicadoresO.length>0 && cargo.indicadoresR.length>0;
}
function renderSugestoesBanco(cargo){
  const s = cargo.sugestoes;
  const grupo = (titulo, pilarClasse, itens) => `
    <div style="margin-bottom:14px;">
      <div class="small-muted" style="text-transform:uppercase;letter-spacing:.06em;font-size:11px;margin-bottom:6px;">${titulo}</div>
      ${itens.map(i=>`
        <label style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px;cursor:pointer;">
          <input type="checkbox" ${i.marcado?'checked':''} onchange="toggleSugestao('${cargo.id}','${pilarClasse}','${i.id}')">
          ${i.nome}${i.competencia?` <small class="small-muted">— ${i.competencia}</small>`:''}
        </label>
      `).join('') || '<div class="small-muted">Nenhuma sugestão nesta categoria.</div>'}
    </div>`;
  return `
    <div class="card" style="border-left:3px solid var(--gold);">
      <h3>Sugestões do Banco de Inteligência <small>Baseadas na família "${cargo.familia}" — revise e confirme antes de aplicar (RN028)</small></h3>
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
function indicadorCargoCard(cargo, pilar, key, titulo){
  return `
  <div class="card">
    <h3><span class="tag tag-${pilar.toLowerCase()}">${pilar}</span> ${titulo}</h3>
    ${cargo[key].map(i=>`<div class="chip">${i.nome}${i.competencia?` <span class="small-muted">(${i.competencia})</span>`:''}</div>`).join('') || '<p class="small-muted">Nenhum indicador ainda.</p>'}
    <div class="grid2" style="margin-top:12px;">
      <input id="ni_${pilar}_${cargo.id}" placeholder="Novo indicador ${pilar}" style="padding:9px 11px;background:var(--surface-2);border:1px solid var(--line);border-radius:7px;color:var(--ink);">
      <input id="nc_${pilar}_${cargo.id}" placeholder="Competência (opcional)" style="padding:9px 11px;background:var(--surface-2);border:1px solid var(--line);border-radius:7px;color:var(--ink);">
    </div>
    <button class="btn btn-sm" style="margin-top:8px;" onclick="addIndicadorCargo('${cargo.id}','${key}','${pilar}')">+ Adicionar</button>
  </div>`;
}
function addIndicadorCargo(cargoId,key,pilar){
  const cargo = state.cargos.find(c=>c.id===cargoId);
  const input = document.getElementById(`ni_${pilar}_${cargoId}`);
  const inputComp = document.getElementById(`nc_${pilar}_${cargoId}`);
  const nome = input.value.trim();
  const competencia = inputComp.value.trim();
  if(!nome) return;
  cargo[key].push({id:uid(), nome, competencia: competencia || undefined});
  render();
}
function salvarRascunhoDesenho(cargoId, silencioso){
  const cargo = state.cargos.find(c=>c.id===cargoId);
  cargo.desenho.sumario = document.getElementById('d_sumario').value;
  cargo.desenho.atividadesEspecificas = document.getElementById('d_atividades').value.split('\\n').filter(Boolean);
  cargo.desenho.culturaPostura = document.getElementById('d_cultura').value;
  cargo.desenho.requisitos = document.getElementById('d_requisitos').value;
  if(!silencioso){ showToast('Rascunho salvo.'); render(); }
}
function publicarDesenho(cargoId){
  const cargo = state.cargos.find(c=>c.id===cargoId);
  const jaPublicadoAntes = cargo.desenho.aprovado;

  salvarRascunhoDesenho(cargoId, /*silencioso=*/true);

  let motivo = 'Publicação inicial do Desenho de Cargo.';
  if(jaPublicadoAntes){
    motivo = document.getElementById('d_motivo').value.trim();
    if(!motivo){ showToast('Informe o motivo da alteração para publicar uma nova versão (RN019).'); return; }
  }

  if(!indicadoresOk(cargo)){ showToast('É preciso ao menos um indicador em cada pilar (N, O, R) para publicar.'); return; }

  const novaVersao = jaPublicadoAntes ? cargo.desenho.versao + 1 : cargo.desenho.versao;
  const dataPublicacao = new Date().toISOString().slice(0,10);

  // RN019: guarda um retrato imutável desta versão no histórico — nunca é apagado.
  cargo.versoes = cargo.versoes || [];
  cargo.versoes.push({
    versao: novaVersao,
    data: dataPublicacao,
    motivo,
    sumario: cargo.desenho.sumario,
    atividadesEspecificas: [...cargo.desenho.atividadesEspecificas],
    culturaPostura: cargo.desenho.culturaPostura,
    requisitos: cargo.desenho.requisitos,
    indicadoresN: cargo.indicadoresN.map(i=>({...i})),
    indicadoresO: cargo.indicadoresO.map(i=>({...i})),
    indicadoresR: cargo.indicadoresR.map(i=>({...i})),
  });

  cargo.desenho.versao = novaVersao;
  cargo.desenho.aprovado = true; atualizarCarimbo(cargo);
  cargo.desenho.dataAprovacao = dataPublicacao;

  registrarAuditoria('cargo.versao_publicada', { nome: cargo.nome, versao: novaVersao, motivo });
  emitirEvento('cargo.desenho_publicado', { cargoId: cargo.id, versao: novaVersao });
  showToast(`Desenho de Cargo publicado (v${novaVersao}). Ciclos abertos a partir de agora usam esta versão — os que já estavam em andamento continuam na versão anterior (RN019).`);
  render();
}

/* ===================== 6. COLABORADORES ===================== */
