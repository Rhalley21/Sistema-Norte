const PAPEL_LABEL_UI = { owner:'Dono', rh:'RH', lider:'Gestor/Líder', colaborador:'Colaborador' };
let _perfisEmpresa = [];
let _convitesEmpresa = [];
let _papelNovoConvite = 'colaborador';
let _estruturaNovoConvite = '';
let _erroConvite = null;
let _gerandoConvite = false;

let _historicoAcessos = [];

async function carregarUsuarios(){
  const { data: perfis } = await sb.from('perfis').select('id, nome, papel, desativado, estrutura_nome, escopo_estendido').eq('empresa_id', empresaIdAtual);
  _perfisEmpresa = perfis || [];
  const { data: convites } = await sb.from('convites').select('id, codigo, papel, criado_em, estrutura_nome')
    .eq('empresa_id', empresaIdAtual).eq('usado', false).order('criado_em', { ascending:false });
  _convitesEmpresa = convites || [];
  const { data: acessos } = await sb.from('auditoria').select('criado_por, criado_em')
    .eq('empresa_id', empresaIdAtual).eq('evento', 'usuario.login').order('criado_em', { ascending:false }).limit(50);
  _historicoAcessos = acessos || [];
  render();
}
function ultimoAcessoDe(perfilId){
  const registro = _historicoAcessos.find(a=>a.criado_por===perfilId);
  return registro ? registro.criado_em : null;
}
function formatarDataHora(iso){
  if(!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString('pt-BR');
}
function gerarCodigoConvite(){
  return Math.random().toString(36).slice(2,8).toUpperCase() + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
}
async function gerarConvite(){
  if(meuPapelReal !== 'owner' && _papelNovoConvite === 'rh'){
    _erroConvite = 'Apenas o Administrador pode convidar um novo RH.'; render(); return;
  }
  _gerandoConvite = true; _erroConvite = null; render();
  const codigo = gerarCodigoConvite();
  const nodeEstrutura = state.estrutura.find(n=>n.id===_estruturaNovoConvite);
  const { error } = await sb.from('convites').insert({
    empresa_id: empresaIdAtual, codigo, papel: _papelNovoConvite, criado_por: meuPerfilId,
    estrutura_id: nodeEstrutura ? nodeEstrutura.id : null,
    estrutura_nome: nodeEstrutura ? nodeEstrutura.nome : null,
  });
  _gerandoConvite = false;
  if(error){ _erroConvite = 'Não foi possível gerar o convite. Tente novamente.'; render(); }
  else { await carregarUsuarios(); }
}
function copiarCodigo(codigo){
  navigator.clipboard?.writeText(codigo);
  showToast('Código copiado!');
}
async function alternarAtivoPerfil(perfilId, desativarAgora){
  if(desativarAgora && !confirm('Deseja realmente remover este usuário? Esta ação não apaga seu histórico (RN025).')) return;
  const { error } = await sb.from('perfis').update({ desativado: desativarAgora }).eq('id', perfilId);
  if(error){ showToast('Não foi possível atualizar o status da conta.'); return; }
  registrarAuditoria(desativarAgora ? 'usuario.desativado' : 'usuario.reativado', { perfilId });
  showToast(desativarAgora ? 'Conta desativada. Todo o histórico de avaliações dessa pessoa continua preservado.' : 'Conta reativada.');
  await carregarUsuarios();
}
async function alternarEscopoEstendido(perfilId, concederAgora){
  const { error } = await sb.from('perfis').update({ escopo_estendido: concederAgora }).eq('id', perfilId);
  if(error){ showToast('Não foi possível atualizar a permissão.'); return; }
  registrarAuditoria(concederAgora ? 'escopo_estendido.concedido' : 'escopo_estendido.revogado', { perfilId });
  showToast(concederAgora ? 'Escopo estendido concedido — este Gestor agora vê o dashboard consolidado da empresa toda (exceção explícita do Administrador).' : 'Escopo estendido revogado — o Gestor volta a ver só a própria equipe.');
  await carregarUsuarios();
}
function pageUsuarios(){
  const souOwner = meuPapelReal === 'owner';
  const opcoesPapel = souOwner
    ? [['colaborador','Colaborador'],['lider','Gestor/Líder'],['rh','RH']]
    : [['colaborador','Colaborador'],['lider','Gestor/Líder']];
  return `
    <div class="page-head">
      <div class="eyebrow">Fundação</div>
      <h1>Usuários & Acesso</h1>
      <p class="page-desc">Convide RH, Gestores e Colaboradores para acessar esta empresa, cada um com o papel correto e (opcionalmente) já vinculado a uma unidade/setor.${souOwner?'':' Como RH, você pode convidar Gestores e Colaboradores — apenas o Administrador pode criar outro usuário de RH.'}</p>
    </div>

    <div class="card">
      <h3>Pessoas com acesso</h3>
      <table>
        <thead><tr><th>Nome</th><th>Papel</th><th>Vínculo na estrutura</th><th>Status</th><th>Escopo estendido</th><th>Último acesso</th><th></th></tr></thead>
        <tbody>
          ${_perfisEmpresa.map(p => `
            <tr style="${p.desativado?'opacity:.55;':''}">
              <td>${p.nome || '(sem nome)'}${p.id === meuPerfilId ? ' (você)' : ''}</td>
              <td><span class="tag">${PAPEL_LABEL_UI[p.papel] || p.papel}</span></td>
              <td class="small-muted">${p.estrutura_nome || '—'}</td>
              <td>${p.desativado ? '<span class="pill pill-iniciar">Desativado</span>' : '<span class="pill pill-alavancar">Ativo</span>'}</td>
              <td class="small-muted">${p.papel==='lider' ? (p.escopo_estendido ? '<span class="pill pill-alavancar">Estendido (empresa toda)</span>' : 'Própria equipe') : '—'}</td>
              <td class="small-muted">${formatarDataHora(ultimoAcessoDe(p.id)) || 'nunca'}</td>
              <td>
                ${p.id !== meuPerfilId ? `
                  <button class="btn btn-ghost btn-sm" onclick="alternarAtivoPerfil('${p.id}', ${!p.desativado})">${p.desativado?'Reativar':'Desativar'}</button>
                  ${souOwner && p.papel==='lider' ? `<button class="btn btn-ghost btn-sm" onclick="alternarEscopoEstendido('${p.id}', ${!p.escopo_estendido})">${p.escopo_estendido?'Revogar escopo estendido':'Conceder escopo estendido'}</button>` : ''}
                ` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="notice" style="margin-top:12px;">RN025: desativar uma conta nunca apaga dados — todo o histórico de avaliações em que essa pessoa participou (como avaliador ou avaliado) permanece intacto. A pessoa só perde o acesso ao sistema.</div>
      <div class="notice info">Por padrão, todo Gestor só vê dados agregados da própria equipe. O Administrador pode conceder, caso a caso, uma exceção explícita (escopo estendido) para um Gestor ver o dashboard consolidado da empresa toda.</div>
    </div>

    ${souOwner && _historicoAcessos.length ? `
    <div class="card">
      <h3>Histórico de acessos recentes <small>Últimos 50 logins — quem entrou e quando (não pode ser apagado nem editado)</small></h3>
      <table>
        <thead><tr><th>Pessoa</th><th>Papel</th><th>Data/hora</th></tr></thead>
        <tbody>
          ${_historicoAcessos.map(a=>{
            const p = _perfisEmpresa.find(pf=>pf.id===a.criado_por);
            return `<tr><td>${p?p.nome:'(pessoa removida)'}</td><td><span class="tag">${p?PAPEL_LABEL_UI[p.papel]:'—'}</span></td><td class="small-muted">${formatarDataHora(a.criado_em)}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <div class="card">
      <h3>Convidar nova pessoa <small>Gere um código e compartilhe por WhatsApp/e-mail. A pessoa usa esse código na tela de cadastro.</small></h3>
      <div class="grid3" style="align-items:end;">
        <div class="field" style="margin:0;"><label>Papel</label>
          <select onchange="_papelNovoConvite=this.value;">
            ${opcoesPapel.map(([v,l])=>`<option value="${v}" ${_papelNovoConvite===v?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="margin:0;"><label>Vínculo na estrutura <small>(opcional)</small></label>
          <select onchange="_estruturaNovoConvite=this.value;">
            <option value="">— sem vínculo —</option>
            ${state.estrutura.map(n=>`<option value="${n.id}" ${_estruturaNovoConvite===n.id?'selected':''}>${n.nome} (${NIVEL_LABEL[n.tipo]})</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary" onclick="gerarConvite()" ${_gerandoConvite?'disabled':''}>Gerar convite</button>
      </div>
      ${_erroConvite ? `<p style="color:var(--iniciar);font-size:12.5px;margin-top:8px;">${_erroConvite}</p>` : ''}
      ${_convitesEmpresa.length ? `
        <table style="margin-top:14px;">
          <thead><tr><th>Código</th><th>Papel</th><th>Vínculo</th><th></th></tr></thead>
          <tbody>
            ${_convitesEmpresa.map(c => `
              <tr>
                <td style="font-family:var(--mono);">${c.codigo}</td>
                <td><span class="tag">${PAPEL_LABEL_UI[c.papel] || c.papel}</span></td>
                <td class="small-muted">${c.estrutura_nome || '—'}</td>
                <td><button class="btn btn-sm btn-ghost" onclick="copiarCodigo('${c.codigo}')">Copiar</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<div class="empty" style="margin-top:14px;">Nenhum convite pendente.</div>'}
    </div>

    <div class="notice info">Um usuário pode existir sem estar vinculado a um cargo (ex.: um Administrador puramente técnico). Mas todo Colaborador só participa de um ciclo de avaliação depois de ter um cargo vinculado — isso é garantido na aba <b>Colaboradores</b> (critério de aceite do módulo, PRD Cap. 5).</div>
  `;
}

