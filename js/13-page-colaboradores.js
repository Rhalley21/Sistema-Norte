let _movimentarColabId = null;

let _previewImportacao = null;

function renderImportacaoLote(){
  return `
    <div class="card">
      <h3>Importar colaboradores em lote <small>Planilha Excel/CSV — útil para cadastrar vários de uma vez</small></h3>
      <p class="page-desc">Colunas esperadas: <b>Nome, Cargo, Unidade, Setor, Gestor, Admissão</b> (data no formato AAAA-MM-DD, opcional). Cargo/Unidade/Setor/Gestor precisam ter o <b>nome exatamente igual</b> ao já cadastrado no sistema.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button class="btn btn-ghost btn-sm" onclick="baixarModeloImportacao()">Baixar modelo de planilha</button>
        <input type="file" id="arquivo_importacao" accept=".xlsx,.xls,.csv" onchange="processarArquivoImportacao(this)">
      </div>
      ${_previewImportacao ? renderPreviewImportacao() : ''}
    </div>
  `;
}

function baixarModeloImportacao(){
  const linhas = [
    ['Nome','Cargo','Unidade','Setor','Gestor','Admissão'],
    ['Maria Silva','Analista de Recursos Humanos','Unidade Central','Setor Financeiro','João Souza','2026-01-15'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Colaboradores');
  XLSX.writeFile(wb, 'modelo-importacao-colaboradores.xlsx');
}

function processarArquivoImportacao(inputEl){
  const arquivo = inputEl.files[0];
  if(!arquivo) return;
  const leitor = new FileReader();
  leitor.onload = (e) => {
    const dados = new Uint8Array(e.target.result);
    const workbook = XLSX.read(dados, { type: 'array' });
    const primeiraAba = workbook.Sheets[workbook.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(primeiraAba, { defval: '' });
    _previewImportacao = linhas.map(linha => validarLinhaImportacao(linha));
    render();
  };
  leitor.readAsArrayBuffer(arquivo);
}

function validarLinhaImportacao(linha){
  const nome = String(linha['Nome']||'').trim();
  const cargoNome = String(linha['Cargo']||'').trim();
  const unidadeNome = String(linha['Unidade']||'').trim();
  const setorNome = String(linha['Setor']||'').trim();
  const gestorNome = String(linha['Gestor']||'').trim();
  const admissao = String(linha['Admissão']||linha['Admissao']||'').trim();

  const cargo = state.cargos.find(c=>c.nome.toLowerCase()===cargoNome.toLowerCase() && c.desenho.aprovado && !c.descontinuado);
  const unidade = state.estrutura.find(n=>n.tipo==='unidade' && n.nome.toLowerCase()===unidadeNome.toLowerCase());
  const setor = state.estrutura.find(n=>['setor','equipe','departamento'].includes(n.tipo) && n.nome.toLowerCase()===setorNome.toLowerCase());
  const gestor = _perfisEmpresa.find(pf=>['lider','owner','rh'].includes(pf.papel) && (pf.nome||'').toLowerCase()===gestorNome.toLowerCase());

  const erros = [];
  if(!nome) erros.push('nome vazio');
  if(!cargo) erros.push(`cargo "${cargoNome}" não encontrado ou sem Desenho publicado`);
  if(!unidade) erros.push(`unidade "${unidadeNome}" não encontrada`);
  if(!setor) erros.push(`setor "${setorNome}" não encontrado`);
  if(!gestor) erros.push(`gestor "${gestorNome}" não encontrado`);

  return { nome, cargo, unidade, setor, gestor, admissao, erros };
}

function renderPreviewImportacao(){
  const validas = _previewImportacao.filter(l=>l.erros.length===0);
  const invalidas = _previewImportacao.filter(l=>l.erros.length>0);
  return `
    <div style="margin-top:14px;">
      <div class="notice ${invalidas.length?'':'info'}">${validas.length} linha(s) prontas para importar${invalidas.length?`, ${invalidas.length} com erro (não serão importadas)`:''}.</div>

      <div class="import-preview-list">
        ${_previewImportacao.map(l=>`
          <div class="import-preview-row ${l.erros.length?'com-erro':''}">
            <div class="import-preview-status">${l.erros.length ? '<span class="pill pill-iniciar">Erro</span>' : '<span class="pill pill-alavancar">OK</span>'}</div>
            <div class="import-preview-info">
              <div class="import-preview-nome">${l.nome||'<span class="small-muted">(sem nome)</span>'}</div>
              <div class="import-preview-campos">
                <span><b>Cargo:</b> ${l.cargo?l.cargo.nome:'<span style="color:var(--iniciar);">—</span>'}</span>
                <span><b>Unidade:</b> ${l.unidade?l.unidade.nome:'<span style="color:var(--iniciar);">—</span>'}</span>
                <span><b>Setor:</b> ${l.setor?l.setor.nome:'<span style="color:var(--iniciar);">—</span>'}</span>
                <span><b>Gestor:</b> ${l.gestor?l.gestor.nome:'<span style="color:var(--iniciar);">—</span>'}</span>
              </div>
              ${l.erros.length ? `<div class="import-preview-erro">${l.erros.join(' · ')}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>

      <div style="display:flex;gap:8px;margin-top:14px;">
        <button class="btn btn-primary" onclick="confirmarImportacaoLote()" ${validas.length?'':'disabled'}>Confirmar importação (${validas.length})</button>
        <button class="btn btn-ghost" onclick="_previewImportacao=null; render();">Cancelar</button>
      </div>
    </div>
  `;
}

function confirmarImportacaoLote(){
  const validas = _previewImportacao.filter(l=>l.erros.length===0);
  validas.forEach(l=>{
    state.colaboradores.push({
      id: uid(), nome: l.nome, cargoId: l.cargo.id, unidadeId: l.unidade.id, setorId: l.setor.id,
      gestorPerfilId: l.gestor.id, versaoCargoVinculada: l.cargo.desenho.versao,
      perfilId: null, admissao: l.admissao || '',
      movimentacoes: [{ id: uid(), data: new Date().toISOString().slice(0,10), tipo:'Cadastro inicial',
        detalhes: `Cadastrado via importação em lote no cargo "${l.cargo.nome}" (v${l.cargo.desenho.versao})` }],
      ...novoCarimbo(),
    });
  });
  registrarAuditoria('colaboradores.importados_em_lote', { quantidade: validas.length });
  emitirEvento('colaboradores.importados_em_lote', { quantidade: validas.length });
  showToast(`${validas.length} colaborador(es) importado(s) com sucesso.`);
  _previewImportacao = null;
  render();
}

function pageColaboradoresGestor(){
  const minhaEquipe = state.colaboradores.filter(p=>p.gestorPerfilId===meuPerfilId && !p.anonimizado);
  const cargosAprovados = state.cargos.filter(c=>c.desenho.aprovado && !c.descontinuado);
  const unidades = state.estrutura.filter(n=>n.tipo==='unidade');
  const setores = state.estrutura.filter(n=>n.tipo==='setor' || n.tipo==='equipe' || n.tipo==='departamento');
  const contasGestor = _perfisEmpresa.filter(pf => pf.papel === 'lider' || pf.papel === 'owner' || pf.papel === 'rh');
  const nomeEstrutura = (id) => state.estrutura.find(n=>n.id===id)?.nome || '—';

  return `
    <div class="page-head">
      <div class="eyebrow">Etapa 06 · Pessoas</div>
      <h1>Minha Equipe</h1>
      <p class="page-desc">Você só vê e movimenta os colaboradores vinculados a você como gestor direto — cadastro, desligamento e anonimização de dados continuam exclusivos de RH/Administrador.</p>
    </div>
    <div class="card">
      <h3>Colaboradores da minha equipe</h3>
      ${minhaEquipe.length ? `<table><thead><tr><th>Nome</th><th>Cargo</th><th>Unidade</th><th>Setor</th><th></th></tr></thead><tbody>
        ${minhaEquipe.map(p=>{
          const cargo = state.cargos.find(c=>c.id===p.cargoId);
          const emMovimento = _movimentarColabId === p.id;
          return `
          <tr>
            <td><b>${p.nome}</b></td>
            <td class="small-muted">${cargo?cargo.nome+' (v'+(p.versaoCargoVinculada||'—')+')':'—'}</td>
            <td class="small-muted">${nomeEstrutura(p.unidadeId)}</td>
            <td class="small-muted">${nomeEstrutura(p.setorId)}</td>
            <td>
              <button class="btn btn-ghost btn-sm" onclick="_movimentarColabId='${emMovimento?'':p.id}'; render();">${emMovimento?'Cancelar':'Promover / Movimentar'}</button>
              ${p.movimentacoes?.length ? `<button class="btn btn-ghost btn-sm" onclick="_verHistoricoColabId = _verHistoricoColabId==='${p.id}'?null:'${p.id}'; render();">Histórico (${p.movimentacoes.length})</button>` : ''}
            </td>
          </tr>
          ${emMovimento ? renderFormMovimentacao(p, cargosAprovados, unidades, setores, contasGestor) : ''}
          ${_verHistoricoColabId===p.id ? renderHistoricoMovimentacao(p) : ''}
          `;
        }).join('')}
      </tbody></table>` : '<div class="empty">Nenhum colaborador vinculado a você como gestor direto ainda.</div>'}
    </div>
  `;
}

function pageColaboradores(){
  if(meuPapelReal === 'lider') return pageColaboradoresGestor();

  const cargosAprovados = state.cargos.filter(c=>c.desenho.aprovado && !c.descontinuado);
  const unidades = state.estrutura.filter(n=>n.tipo==='unidade');
  const setores = state.estrutura.filter(n=>n.tipo==='setor' || n.tipo==='equipe' || n.tipo==='departamento');
  const contasColaborador = _perfisEmpresa.filter(pf => pf.papel === 'colaborador');
  const contasGestor = _perfisEmpresa.filter(pf => pf.papel === 'lider' || pf.papel === 'owner' || pf.papel === 'rh');
  const nomePerfil = (id) => _perfisEmpresa.find(pf=>pf.id===id)?.nome || '—';
  const nomeEstrutura = (id) => state.estrutura.find(n=>n.id===id)?.nome || '—';

  const podeCadastrar = cargosAprovados.length && unidades.length && setores.length && contasGestor.length;

  return `
    <div class="page-head">
      <div class="eyebrow">Etapa 06 · Pessoas</div>
      <h1>Colaboradores</h1>
      <p class="page-desc">Vínculo obrigatório (RN020): unidade, setor, gestor direto, cargo e versão do Desenho de Cargo. Sem todos esses campos preenchidos, o colaborador não pode participar de um ciclo de avaliação.</p>
    </div>

    <div class="card">
      <h3>Cadastrar colaborador</h3>
      ${podeCadastrar ? `
      <div class="grid2">
        <div class="field"><label>Nome completo</label><input id="p_nome"></div>
        <div class="field"><label>Cargo (Desenho publicado)</label>
          <select id="p_cargo">${cargosAprovados.map(c=>`<option value="${c.id}">${c.nome} (v${c.desenho.versao})</option>`).join('')}</select>
        </div>
        <div class="field"><label>Unidade</label>
          <select id="p_unidade">${unidades.map(n=>`<option value="${n.id}">${n.nome}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Setor / equipe</label>
          <select id="p_setor">${setores.map(n=>`<option value="${n.id}">${n.nome} (${NIVEL_LABEL[n.tipo]})</option>`).join('')}</select>
        </div>
        <div class="field"><label>Gestor direto <small>(obrigatório — conta de login já convidada)</small></label>
          <select id="p_gestor_perfil">${contasGestor.map(pf=>`<option value="${pf.id}">${pf.nome || '(sem nome)'} — ${PAPEL_LABEL_UI[pf.papel]}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Conta de login deste colaborador <small>(opcional)</small></label>
          <select id="p_perfil">
            <option value="">— sem conta vinculada —</option>
            ${contasColaborador.map(pf=>`<option value="${pf.id}">${pf.nome || '(sem nome)'}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Data de admissão</label><input id="p_admissao" type="date"></div>
      </div>
      <button class="btn btn-primary" onclick="addColaborador()">Cadastrar colaborador</button>
      ` : `
      <div class="empty">
        Antes de cadastrar um colaborador, complete: ${!cargosAprovados.length?'<b>ao menos um Desenho de Cargo publicado</b>, ':''}${!unidades.length?'<b>ao menos uma Unidade</b> (Estrutura Organizacional), ':''}${!setores.length?'<b>ao menos um Setor/Equipe</b>, ':''}${!contasGestor.length?'<b>ao menos uma conta de Dono/RH/Gestor convidada</b> (Usuários & Acesso)':''}.
      </div>`}
    </div>

    ${podeCadastrar ? renderImportacaoLote() : ''}

    <div class="card">
      <h3>Colaboradores cadastrados</h3>
      ${state.colaboradores.length? `<table><thead><tr><th>Nome</th><th>Cargo</th><th>Unidade</th><th>Setor</th><th>Gestor direto</th><th>Status</th><th></th></tr></thead><tbody>
        ${state.colaboradores.map(p=>{
          const cargo = state.cargos.find(c=>c.id===p.cargoId);
          const emMovimento = _movimentarColabId === p.id;
          return `
          <tr style="${p.inativo?'opacity:.6;':''}">
            <td><b>${p.nome}</b></td>
            <td class="small-muted">${cargo ? cargo.nome + (p.versaoCargoVinculada ? ' (v'+p.versaoCargoVinculada+')' : ' <span style="color:var(--iniciar);">(vínculo desatualizado — use Movimentar)</span>') : '—'}</td>
            <td class="small-muted">${nomeEstrutura(p.unidadeId)}</td>
            <td class="small-muted">${nomeEstrutura(p.setorId)}</td>
            <td class="small-muted">${p.gestorPerfilId ? nomePerfil(p.gestorPerfilId) : '—'}</td>
            <td>${p.anonimizado ? '<span class="pill pill-neutral">Anonimizado</span>' : (p.inativo ? '<span class="pill pill-iniciar">Desligado</span>' : '<span class="pill pill-alavancar">Ativo</span>')}</td>
            <td>
              ${!p.anonimizado ? `
                <button class="btn btn-ghost btn-sm" onclick="_movimentarColabId='${emMovimento?'':p.id}'; render();">${emMovimento?'Cancelar':'Movimentar'}</button>
                ${p.movimentacoes && p.movimentacoes.length ? `<button class="btn btn-ghost btn-sm" onclick="_verHistoricoColabId = _verHistoricoColabId==='${p.id}'?null:'${p.id}'; render();">Histórico (${p.movimentacoes.length})</button>` : ''}
                ${!p.inativo ? `<button class="btn btn-ghost btn-sm" onclick="desligarColaborador('${p.id}')">Desligar</button>` : `<button class="btn btn-ghost btn-sm" style="color:var(--iniciar);" onclick="confirmarAnonimizacao('${p.id}')">Anonimizar (LGPD)</button>`}
              ` : '<span class="small-muted">Dados pessoais removidos — histórico estatístico preservado</span>'}
            </td>
          </tr>
          ${emMovimento ? renderFormMovimentacao(p, cargosAprovados, unidades, setores, contasGestor) : ''}
          ${_verHistoricoColabId===p.id ? renderHistoricoMovimentacao(p) : ''}
          `;
        }).join('')}
      </tbody></table>` : '<div class="empty">Nenhum colaborador cadastrado.</div>'}
    </div>
  `;
}

function addColaborador(){
  const nome = document.getElementById('p_nome').value.trim();
  if(!nome){ showToast('Informe o nome do colaborador.'); return; }
  const cargoId = document.getElementById('p_cargo').value;
  const unidadeId = document.getElementById('p_unidade').value;
  const setorId = document.getElementById('p_setor').value;
  const gestorPerfilId = document.getElementById('p_gestor_perfil').value;
  if(!cargoId || !unidadeId || !setorId || !gestorPerfilId){
    showToast('Todos os vínculos (cargo, unidade, setor, gestor direto) são obrigatórios — RN020.'); return;
  }
  const cargo = state.cargos.find(c=>c.id===cargoId);
  const unidade = state.estrutura.find(n=>n.id===unidadeId);
  const setor = state.estrutura.find(n=>n.id===setorId);
  const gestor = _perfisEmpresa.find(pf=>pf.id===gestorPerfilId);
  const hoje = new Date().toISOString().slice(0,10);
  state.colaboradores.push({
    id: uid(), nome, cargoId, unidadeId, setorId, gestorPerfilId,
    versaoCargoVinculada: cargo.desenho.versao,
    perfilId: document.getElementById('p_perfil').value || null,
    admissao: document.getElementById('p_admissao').value,
    movimentacoes: [{ id: uid(), data: hoje, tipo: 'Cadastro inicial',
      detalhes: `Cadastrado no cargo "${cargo.nome}" (v${cargo.desenho.versao})` }],
    // Documento 03, Cap. 6 — abre a vigência inicial de cada vínculo desde já.
    historicoVinculos: [
      { id: uid(), campo:'cargo', valorAnteriorId:null, valorAnteriorNome:null, novoValorId:cargoId, novoValorNome:cargo.nome, vigenteDe:hoje, vigenteAte:null },
      { id: uid(), campo:'unidade', valorAnteriorId:null, valorAnteriorNome:null, novoValorId:unidadeId, novoValorNome:unidade?.nome, vigenteDe:hoje, vigenteAte:null },
      { id: uid(), campo:'setor', valorAnteriorId:null, valorAnteriorNome:null, novoValorId:setorId, novoValorNome:setor?.nome, vigenteDe:hoje, vigenteAte:null },
      { id: uid(), campo:'gestor', valorAnteriorId:null, valorAnteriorNome:null, novoValorId:gestorPerfilId, novoValorNome:gestor?.nome, vigenteDe:hoje, vigenteAte:null },
    ],
    ...novoCarimbo(),
  });
  showToast('Colaborador cadastrado com todos os vínculos da RN020. Já pode participar de um ciclo de avaliação.');
  render();
}

let _verHistoricoColabId = null;

function renderFormMovimentacao(p, cargosAprovados, unidades, setores, contasGestor){
  return `
    <tr>
      <td colspan="6">
        <div class="card" style="background:var(--surface-2);margin:0;">
          <h3 style="font-size:14px;">Movimentar ${p.nome} <small>Toda mudança fica registrada no histórico — nada é sobrescrito silenciosamente</small></h3>
          <div class="grid2">
            <div class="field"><label>Tipo de movimentação</label>
              <select id="mv_tipo_${p.id}">
                <option>Promoção</option>
                <option>Mudança de setor</option>
                <option>Troca de gestor</option>
                <option>Mudança de unidade</option>
                <option>Outra</option>
              </select>
            </div>
            <div class="field"><label>Novo cargo</label>
              <select id="mv_cargo_${p.id}">${cargosAprovados.map(c=>`<option value="${c.id}" ${c.id===p.cargoId?'selected':''}>${c.nome} (v${c.desenho.versao})</option>`).join('')}</select>
            </div>
            <div class="field"><label>Nova unidade</label>
              <select id="mv_unidade_${p.id}">${unidades.map(n=>`<option value="${n.id}" ${n.id===p.unidadeId?'selected':''}>${n.nome}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Novo setor</label>
              <select id="mv_setor_${p.id}">${setores.map(n=>`<option value="${n.id}" ${n.id===p.setorId?'selected':''}>${n.nome}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Novo gestor direto</label>
              <select id="mv_gestor_${p.id}">${contasGestor.map(pf=>`<option value="${pf.id}" ${pf.id===p.gestorPerfilId?'selected':''}>${pf.nome||'(sem nome)'}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Motivo <small>(opcional)</small></label><input id="mv_motivo_${p.id}" placeholder="Ex: promovido após ciclo de avaliação"></div>
          </div>
          <button class="btn btn-primary" onclick="confirmarMovimentacao('${p.id}')">Confirmar movimentação</button>
        </div>
      </td>
    </tr>`;
}

function renderHistoricoMovimentacao(p){
  const CAMPO_LABEL = { cargo:'Cargo', unidade:'Unidade', setor:'Setor', gestor:'Gestor direto' };
  return `
    <tr><td colspan="6">
      <div class="card" style="margin:0;">
        <h3 style="font-size:14px;">Histórico de movimentações — ${p.nome}</h3>
        <table>
          <thead><tr><th>Data</th><th>Tipo</th><th>Detalhes</th></tr></thead>
          <tbody>
            ${p.movimentacoes.slice().reverse().map(m=>`
              <tr><td class="small-muted">${m.data}</td><td><span class="tag">${m.tipo}</span></td><td class="small-muted">${m.detalhes}</td></tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${p.historicoVinculos?.length ? `
      <div class="card" style="margin:12px 0 0;">
        <h3 style="font-size:14px;">Vigência de vínculos <small>Documento 03, Cap. 6 — quem era o quê, e quando (nunca sobrescrito)</small></h3>
        <table>
          <thead><tr><th>Campo</th><th>De</th><th>Para</th><th>Vigente de</th><th>Vigente até</th></tr></thead>
          <tbody>
            ${p.historicoVinculos.slice().reverse().map(v=>`
              <tr>
                <td><span class="tag">${CAMPO_LABEL[v.campo]}</span></td>
                <td class="small-muted">${v.valorAnteriorNome || '—'}</td>
                <td class="small-muted">${v.novoValorNome || '—'}</td>
                <td class="small-muted">${v.vigenteDe}</td>
                <td>${v.vigenteAte ? `<span class="small-muted">${v.vigenteAte}</span>` : '<span class="pill pill-alavancar">vigente</span>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>` : ''}
    </td></tr>`;
}

// Documento 03, Cap. 6 — histórico de vínculo com vigência: cada mudança de
// cargo/unidade/setor/gestor fecha a vigência anterior (vigenteAte) e abre uma
// nova (vigenteDe), sem apagar nada — permite reconstruir "quem era o quê, quando".
function registrarVinculoHistorico(p, campo, valorAnteriorId, valorAnteriorNome, novoValorId, novoValorNome){
  p.historicoVinculos = p.historicoVinculos || [];
  const hoje = new Date().toISOString().slice(0,10);
  const vigenteAnterior = p.historicoVinculos.find(v=>v.campo===campo && v.vigenteAte===null);
  if(vigenteAnterior) vigenteAnterior.vigenteAte = hoje;
  p.historicoVinculos.push({
    id: uid(), campo, valorAnteriorId, valorAnteriorNome, novoValorId, novoValorNome,
    vigenteDe: hoje, vigenteAte: null,
  });
}

function confirmarMovimentacao(colabId){
  const p = state.colaboradores.find(c=>c.id===colabId);
  const cargoIdAntigo = p.cargoId;
  const novoCargoId = document.getElementById(`mv_cargo_${colabId}`).value;
  const novaUnidadeId = document.getElementById(`mv_unidade_${colabId}`).value;
  const novoSetorId = document.getElementById(`mv_setor_${colabId}`).value;
  const novoGestorId = document.getElementById(`mv_gestor_${colabId}`).value;
  const tipo = document.getElementById(`mv_tipo_${colabId}`).value;
  const motivo = document.getElementById(`mv_motivo_${colabId}`).value.trim();

  const mudancas = [];
  const alteracoesEstruturadas = [];
  if(novoCargoId !== p.cargoId){
    const cargoAntigo = state.cargos.find(c=>c.id===p.cargoId);
    const cargoNovo = state.cargos.find(c=>c.id===novoCargoId);
    mudancas.push(`Cargo: "${cargoAntigo?cargoAntigo.nome:'—'}" → "${cargoNovo.nome}" (v${cargoNovo.desenho.versao})`);
    alteracoesEstruturadas.push({ campo:'cargo_id', valorAnterior: p.cargoId, novoValor: novoCargoId });
    registrarVinculoHistorico(p, 'cargo', p.cargoId, cargoAntigo?.nome, novoCargoId, cargoNovo.nome);
    p.cargoId = novoCargoId;
    p.versaoCargoVinculada = cargoNovo.desenho.versao;
  }
  if(novaUnidadeId !== p.unidadeId){
    const unidadeAntiga = state.estrutura.find(n=>n.id===p.unidadeId);
    const unidadeNova = state.estrutura.find(n=>n.id===novaUnidadeId);
    mudancas.push(`Unidade: "${unidadeAntiga?.nome||'—'}" → "${unidadeNova?.nome}"`);
    alteracoesEstruturadas.push({ campo:'unidade_id', valorAnterior: p.unidadeId, novoValor: novaUnidadeId });
    registrarVinculoHistorico(p, 'unidade', p.unidadeId, unidadeAntiga?.nome, novaUnidadeId, unidadeNova?.nome);
    p.unidadeId = novaUnidadeId;
  }
  if(novoSetorId !== p.setorId){
    const setorAntigo = state.estrutura.find(n=>n.id===p.setorId);
    const setorNovo = state.estrutura.find(n=>n.id===novoSetorId);
    mudancas.push(`Setor: "${setorAntigo?.nome||'—'}" → "${setorNovo?.nome}"`);
    alteracoesEstruturadas.push({ campo:'setor_id', valorAnterior: p.setorId, novoValor: novoSetorId });
    registrarVinculoHistorico(p, 'setor', p.setorId, setorAntigo?.nome, novoSetorId, setorNovo?.nome);
    p.setorId = novoSetorId;
  }
  if(novoGestorId !== p.gestorPerfilId){
    const gestorAntigo = _perfisEmpresa.find(pf=>pf.id===p.gestorPerfilId);
    const gestorNovo = _perfisEmpresa.find(pf=>pf.id===novoGestorId);
    mudancas.push(`Gestor direto: "${gestorAntigo?.nome||'—'}" → "${gestorNovo?.nome}"`);
    alteracoesEstruturadas.push({ campo:'gestor_perfil_id', valorAnterior: p.gestorPerfilId, novoValor: novoGestorId });
    registrarVinculoHistorico(p, 'gestor', p.gestorPerfilId, gestorAntigo?.nome, novoGestorId, gestorNovo?.nome);
    // RN006: se há um ciclo em andamento, o gestor anterior pode registrar uma
    // nota de transição não vinculante (não entra no cálculo da média ponderada).
    const cicloEmAndamento = state.ciclos.find(c=>c.colaboradorId===p.id && (c.estado==='Aberto'||c.estado==='Em Consolidação'));
    if(cicloEmAndamento){
      cicloEmAndamento.gestorAnteriorTransicao = p.gestorPerfilId;
    }
    p.gestorPerfilId = novoGestorId;
  }

  // Autocorreção: se o vínculo de versão do cargo estava faltando (dado
  // antigo, de antes da RN020 completa), sincroniza com a versão atual.
  const cargoAtual = state.cargos.find(c=>c.id===p.cargoId);
  if(cargoAtual && p.versaoCargoVinculada !== cargoAtual.desenho.versao){
    mudancas.push(`Vínculo de versão do cargo corrigido para v${cargoAtual.desenho.versao}`);
    p.versaoCargoVinculada = cargoAtual.desenho.versao;
  }

  if(mudancas.length === 0){ showToast('Nenhuma mudança foi feita.'); return; }
  atualizarCarimbo(p);

  p.movimentacoes = p.movimentacoes || [];
  p.movimentacoes.push({ id: uid(), data: new Date().toISOString().slice(0,10), tipo, detalhes: mudancas.join(' · ') + (motivo?` — Motivo: ${motivo}`:'') });

  registrarAuditoria('colaborador.movimentado', { colaboradorId: p.id, nome: p.nome, tipo, mudancas, alteracoes: alteracoesEstruturadas });
  _movimentarColabId = null;

  // RN012/RN013 (UC008) — promoção dispara agendamento automático de um
  // ciclo extraordinário 3 meses depois, independente do ciclo anual em curso.
  if(tipo === 'Promoção' && novoCargoId !== cargoIdAntigo){
    agendarCicloExtraordinarioPromocao(p);
  }

  showToast('Movimentação registrada no histórico. Nenhum dado anterior foi perdido.');
  render();
}

function agendarCicloExtraordinarioPromocao(p){
  const data = new Date();
  data.setMonth(data.getMonth()+3);
  const prazo = data.toISOString().slice(0,10);
  p.proximaAvaliacaoObrigatoria = prazo;

  const jaTemCicloAberto = state.ciclos.some(c=>c.colaboradorId===p.id && c.estado!=='Encerrado');
  if(!jaTemCicloAberto && p.unidadeId && p.setorId && p.gestorPerfilId){
    const cargo = state.cargos.find(c=>c.id===p.cargoId);
    const ciclo = {
      id: uid(), colaboradorId: p.id, cargoId: p.cargoId, estado:'Aberto', etapa:'colaborador',
      dataAbertura: new Date().toISOString().slice(0,10), prazoLimite: prazo,
      extraordinario: true, motivoExtraordinario: 'Promoção — avaliação obrigatória em 3 meses (RN012/RN013)',
      ausencias: [], notas:{colaborador:{}, gestor:{}, rh:{}},
      indicadoresSnapshot: todosIndicadores(cargo),
      diagnostico:null, pdiDesenvolvimento:null, pdiMentalidade:null, ...novoCarimbo(),
    };
    state.ciclos.push(ciclo);
    emitirEvento('ciclo.extraordinario_agendado', { colaboradorId: p.id, motivo:'promocao', prazo });
    showToast(`Promoção registrada. Ciclo extraordinário agendado automaticamente para ${prazo} (regra dos 3 meses).`);
  } else {
    showToast(`Promoção registrada. Próxima avaliação obrigatória: ${prazo} (o colaborador já tem um ciclo em andamento).`);
  }
}

/* ---------- RNF011 (LGPD) — desligamento e anonimização ----------
   O histórico de avaliações nunca pode ser fisicamente apagado (RN030),
   mas a LGPD prevê direito de exclusão. Solução: anonimizar os dados
   pessoais identificáveis (nome) de um colaborador já desligado,
   preservando o histórico estatístico/estrutural (ciclos, diagnósticos,
   indicadores) para fins de auditoria e comparação histórica. */
function desligarColaborador(colabId){
  const p = state.colaboradores.find(c=>c.id===colabId);
  p.inativo = true;
  atualizarCarimbo(p);
  p.movimentacoes = p.movimentacoes || [];
  p.movimentacoes.push({ id: uid(), data: new Date().toISOString().slice(0,10), tipo:'Desligamento', detalhes:'Colaborador marcado como desligado (inativo).' });
  registrarAuditoria('colaborador.desligado', { colaboradorId: colabId });
  showToast('Colaborador marcado como desligado. Para solicitações de exclusão de dados (LGPD), use "Anonimizar".');
  render();
}
function confirmarAnonimizacao(colabId){
  const p = state.colaboradores.find(c=>c.id===colabId);
  const confirmado = confirm(`Isso vai remover permanentemente o nome e outros dados pessoais identificáveis de "${p.nome}", mantendo apenas o histórico estatístico (diagnósticos, indicadores, ciclos) para fins de comparação histórica. Esta ação não pode ser desfeita. Confirmar anonimização?`);
  if(!confirmado) return;
  anonimizarColaborador(colabId);
}
function anonimizarColaborador(colabId){
  const p = state.colaboradores.find(c=>c.id===colabId);
  const codigo = colabId.slice(0,6).toUpperCase();
  p.nome = `Colaborador Anônimo #${codigo}`;
  p.anonimizado = true;
  p.anonimizadoEm = new Date().toISOString().slice(0,10);
  p.perfilId = null; // remove qualquer vínculo restante com uma conta de login pessoal
  atualizarCarimbo(p);
  registrarAuditoria('colaborador.anonimizado', { colaboradorId: colabId });
  emitirEvento('lgpd.dados_anonimizados', { colaboradorId: colabId });
  showToast('Dados pessoais removidos. O histórico estatístico do cargo/ciclo foi preservado.');
  render();
}