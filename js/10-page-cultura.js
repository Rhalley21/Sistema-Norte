function pageCultura(){
  const c = state.cultura;
  return `
    <div class="page-head">
      <div class="eyebrow">Etapa 03 · Fundação</div>
      <h1>Cultura Organizacional</h1>
      <p class="page-desc">Alimenta diretamente os pilares <b>T (Time)</b> e <b>E (Evolução)</b> — universais para todos os cargos da empresa (RN012).</p>
    </div>
    <div class="card">
      <h3>Missão, visão e valores</h3>
      <div class="field"><label>Missão</label><textarea id="c_missao">${c.missao}</textarea></div>
      <div class="field"><label>Visão</label><textarea id="c_visao">${c.visao}</textarea></div>
      <div class="field"><label>Valores</label><textarea id="c_valores">${c.valores}</textarea></div>
      <button class="btn btn-primary" onclick="salvarCultura()">Salvar cultura organizacional</button>
    </div>

    <div class="grid2">
      ${indicadorPilarCard('T','Time (Comportamento)', c.indicadoresT)}
      ${indicadorPilarCard('E','Evolução (Potencial)', c.indicadoresE)}
    </div>
    <div class="notice">RN013 (PRD Cap. 6): máximo de 2 indicadores personalizados por pilar (T e E), somados aos 2 indicadores padrão da metodologia — total de até 4 indicadores por pilar.</div>
    <div class="notice info">Extensão do princípio de versionamento (RN024): alterar Valores ou indicadores comportamentais aqui não muda avaliações já abertas ou encerradas — cada ciclo guarda o retrato dos indicadores válidos no momento em que foi aberto. Toda mudança feita aqui só passa a valer nos próximos ciclos abertos depois desta edição.</div>
  `;
}
function indicadorPilarCard(pilar, titulo, lista){
  const personalizados = lista.filter(i=>i.origem==='personalizado').length;
  const bloqueado = personalizados>=2; // RN013: máximo de 2 personalizados por pilar (+2 padrão = 4 no total)
  return `
  <div class="card">
    <h3>${titulo} <small>Pilar ${pilar} — indicadores universais da empresa</small></h3>
    ${lista.map(i=>`<div class="chip">${i.nome} <span class="small-muted">(${i.origem})</span></div>`).join('') || '<p class="small-muted">Nenhum indicador ainda.</p>'}
    <div style="margin-top:14px;display:flex;gap:8px;">
      <input id="novo_${pilar}" placeholder="Novo indicador personalizado" ${bloqueado?'disabled':''} style="flex:1;padding:9px 11px;background:var(--surface-2);border:1px solid var(--line);border-radius:7px;color:var(--ink);">
      <button class="btn btn-sm" onclick="addIndicadorCultura('${pilar}')" ${bloqueado?'disabled':''}>Adicionar</button>
    </div>
    ${bloqueado?'<div class="small-muted" style="margin-top:6px;">Limite de 2 indicadores personalizados atingido para este pilar (RN013) — total de 4 com os 2 padrão da metodologia.</div>':''}
  </div>`;
}
function salvarCultura(){
  state.cultura.missao = document.getElementById('c_missao').value;
  state.cultura.visao = document.getElementById('c_visao').value;
  state.cultura.valores = document.getElementById('c_valores').value;
  showToast('Cultura organizacional salva. Módulo Base de Cargos liberado.');
  render();
}
function addIndicadorCultura(pilar){
  const input = document.getElementById('novo_'+pilar);
  const nome = input.value.trim();
  if(!nome){ showToast('Digite o nome do indicador.'); return; }
  const listKey = pilar==='T'?'indicadoresT':'indicadoresE';
  const personalizados = state.cultura[listKey].filter(i=>i.origem==='personalizado').length;
  if(personalizados>=2){ showToast('Limite de 2 indicadores personalizados atingido para este pilar (RN013) — total de 4 com os 2 padrão da metodologia.'); return; }
  state.cultura[listKey].push({id:uid(), nome, origem:'personalizado'});
  render();
}

/* ===================== 4. CARGOS (CBO) ===================== */
