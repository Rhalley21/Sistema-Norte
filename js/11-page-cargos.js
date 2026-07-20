function pageCargos(){
  return `
    <div class="page-head">
      <div class="eyebrow">Etapa 04 · Cargos</div>
      <h1>Base de Cargos (CBO)</h1>
      <p class="page-desc">Importe da Classificação Brasileira de Ocupações e adapte — o cargo-modelo original nunca é editado, apenas copiado para a empresa.</p>
    </div>

    <div class="card">
      <h3>Biblioteca CBO <small>Selecione um cargo para importar e adaptar</small></h3>
      ${CBO_MOCK.map(c=>`
        <div class="cbo-item">
          <div><b>${c.nome}</b><br><span>CBO ${c.codigo} · ${c.familia} · ${c.natureza}</span></div>
          <button class="btn btn-sm" onclick="importarCargo('${c.codigo}')">Importar cargo →</button>
        </div>
      `).join('')}
    </div>

    <div class="card">
      <h3>Ou crie um cargo do zero</h3>
      <div class="grid2">
        <div class="field"><label>Nome do cargo</label><input id="cg_nome" placeholder="Ex: Analista Comercial Pleno"></div>
        <div class="field"><label>Família</label>
          <select id="cg_familia">
            ${['Liderança','Coordenação','Operacional','Administrativo/Financeiro','Comercial','Público'].map(f=>`<option>${f}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Natureza</label>
          <select id="cg_natureza">
            ${['Operacional','Apoio','Estratégica'].map(f=>`<option>${f}</option>`).join('')}
          </select>
        </div>
      </div>
      <button class="btn btn-primary" onclick="criarCargoDoZero()">Criar cargo</button>
    </div>

    <div class="card">
      <h3>Cargos da empresa</h3>
      ${state.cargos.length? `<table><thead><tr><th>Cargo</th><th>CBO</th><th>Família</th><th>Desenho</th><th></th></tr></thead><tbody>
        ${state.cargos.map(c=>`
          <tr style="${c.descontinuado?'opacity:.55;':''}">
            <td><b>${c.nome}</b></td>
            <td class="small-muted">${c.cbo||'—'}</td>
            <td class="small-muted">${c.familia}</td>
            <td>${c.descontinuado?'<span class="pill pill-iniciar">Descontinuado</span>':(c.desenho.aprovado?'<span class="pill pill-alavancar">Publicado v'+c.desenho.versao+'</span>':'<span class="pill pill-desenvolver">Rascunho</span>')}</td>
            <td>
              <button class="btn btn-sm btn-ghost" onclick="goto('desenho'); state.cargoEditando='${c.id}'">Editar desenho →</button>
              ${c.desenho.aprovado ? `<button class="btn btn-sm btn-ghost" onclick="alternarDescontinuarCargo('${c.id}')">${c.descontinuado?'Reativar':'Descontinuar'}</button>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody></table>` : '<div class="empty">Nenhum cargo cadastrado.</div>'}
    </div>
  `;
}
function alternarDescontinuarCargo(cargoId){
  const cargo = state.cargos.find(c=>c.id===cargoId);
  const vinculados = state.colaboradores.filter(p=>p.cargoId===cargoId).length;
  cargo.descontinuado = !cargo.descontinuado; atualizarCarimbo(cargo);
  registrarAuditoria(cargo.descontinuado?'cargo.descontinuado':'cargo.reativado', { nome: cargo.nome, colaboradoresVinculados: vinculados });
  showToast(cargo.descontinuado
    ? `Cargo descontinuado. ${vinculados>0?`Os ${vinculados} colaborador(es) já vinculados e seu histórico continuam intactos — só não é possível abrir novos ciclos para este cargo.`:'Não é mais possível vincular novos colaboradores a este cargo.'}`
    : 'Cargo reativado.');
  render();
}
function importarCargo(codigo){
  const src = CBO_MOCK.find(c=>c.codigo===codigo);
  const banco = BANCO_INTELIGENCIA[src.familia];
  const novo = {
    id: uid(), nome: src.nome, familia: src.familia, natureza: src.natureza, cbo: src.codigo, origemCBO:true,
    indicadoresN:[], indicadoresO:[], indicadoresR:[],
    sugestoes: banco ? {
      competencias: banco.competencias.map(nome=>({id:uid(), nome, marcado:true})),
      indicadoresN: banco.indicadoresN.map(item=>({id:uid(), nome:item.nome, competencia:item.competencia, marcado:true})),
      indicadoresO: banco.indicadoresO.map(item=>({id:uid(), nome:item.nome, competencia:item.competencia, marcado:true})),
      indicadoresR: banco.indicadoresR.map(item=>({id:uid(), nome:item.nome, competencia:item.competencia, marcado:true})),
    } : null,
    desenho:{
      versao:1, aprovado:false,
      sumario: src.sumario,
      atividadesEspecificas: src.atividades.split(';').map(s=>s.trim()).filter(Boolean),
      culturaPostura:'',
      requisitos: src.requisitos
    },
    versoes: [],
    descontinuado: false, ...novoCarimbo(),
  };
  state.cargos.push(novo);
  state.cargoEditando = novo.id;
  showToast('Cargo importado. Revise as sugestões do Banco de Inteligência antes de aplicar (RN028).');
  goto('desenho');
}
function atualizarSugestoesCargo(cargoId){
  const cargo = state.cargos.find(c=>c.id===cargoId);
  const banco = BANCO_INTELIGENCIA[cargo.familia];
  if(!banco){ showToast('Nenhuma sugestão disponível para esta família de cargo.'); return; }
  cargo.sugestoes = {
    competencias: banco.competencias.map(nome=>({id:uid(), nome, marcado:true})),
    indicadoresN: banco.indicadoresN.map(item=>({id:uid(), nome:item.nome, competencia:item.competencia, marcado:true})),
    indicadoresO: banco.indicadoresO.map(item=>({id:uid(), nome:item.nome, competencia:item.competencia, marcado:true})),
    indicadoresR: banco.indicadoresR.map(item=>({id:uid(), nome:item.nome, competencia:item.competencia, marcado:true})),
  };
  showToast('Sugestões atualizadas — revise e marque só o que fizer sentido antes de aplicar (RN028).');
  render();
}
function toggleSugestao(cargoId, grupo, sugestaoId){
  const cargo = state.cargos.find(c=>c.id===cargoId);
  const item = cargo.sugestoes[grupo].find(s=>s.id===sugestaoId);
  item.marcado = !item.marcado;
  render();
}
function aplicarSugestoesCargo(cargoId){
  const cargo = state.cargos.find(c=>c.id===cargoId);
  ['indicadoresN','indicadoresO','indicadoresR'].forEach(key=>{
    const selecionados = cargo.sugestoes[key].filter(s=>s.marcado);
    selecionados.forEach(s=> cargo[key].push({id:uid(), nome:s.nome, competencia:s.competencia}));
  });
  cargo.sugestoes = null;
  showToast('Sugestões aplicadas ao cargo — já podem ser editadas normalmente.');
  render();
}
function descartarSugestoesCargo(cargoId){
  const cargo = state.cargos.find(c=>c.id===cargoId);
  cargo.sugestoes = null;
  showToast('Sugestões descartadas.');
  render();
}
function criarCargoDoZero(){
  const nome = document.getElementById('cg_nome').value.trim();
  if(!nome){ showToast('Informe o nome do cargo.'); return; }
  const novo = {
    id: uid(), nome, familia: document.getElementById('cg_familia').value, natureza: document.getElementById('cg_natureza').value,
    cbo:null, origemCBO:false,
    indicadoresN:[], indicadoresO:[], indicadoresR:[],
    desenho:{versao:1, aprovado:false, sumario:'', atividadesEspecificas:[], culturaPostura:'', requisitos:''},
    versoes: [],
    descontinuado: false, ...novoCarimbo(),
  };
  state.cargos.push(novo);
  state.cargoEditando = novo.id;
  showToast('Cargo criado. Complete o Desenho de Cargo para poder publicá-lo.');
  goto('desenho');
}

/* ===================== 5. DESENHO DE CARGO ===================== */
