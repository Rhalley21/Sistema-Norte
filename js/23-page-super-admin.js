/* =========================================================
   SUPER ADMIN — licenciamento de novas Empresas
   -----------------------------------------------------------
   Tela visível só pra quem está na tabela `super_admins` (o dono da
   plataforma NORTE — Instituto INETRIS). Diferente de tudo mais no
   sistema, aqui NÃO se trabalha com o `state` normal (que é sempre
   isolado por empresa_id) — as consultas aqui são feitas direto ao
   Supabase, sem passar pelo blob de estado de uma Empresa específica.
   ========================================================= */
let _superAdminCarregando = false;
let _superAdminEmpresas = [];
let _superAdminCodigos = [];
let _superAdminNovoRotulo = '';

async function carregarDadosSuperAdmin(){
  _superAdminCarregando = true; render();
  const [{ data: empresas }, { data: codigos }] = await Promise.all([
    sb.from('empresas').select('id, nome_fantasia, cnpj, estado, criado_em').order('criado_em', { ascending:false }),
    sb.from('codigos_licenca_empresa').select('id, codigo, nome_empresa_sugerido, usado, empresa_id, criado_em, usado_em').order('criado_em', { ascending:false }),
  ]);
  _superAdminEmpresas = empresas || [];
  _superAdminCodigos = codigos || [];
  _superAdminCarregando = false;
  render();
}

function gerarCodigoLicencaLetras(){
  // Código legível, fácil de ditar/copiar por telefone ou WhatsApp pro cliente.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I pra evitar confusão
  let c = 'NORTE-';
  for(let i=0;i<8;i++){
    if(i===4) c += '-';
    c += chars[Math.floor(Math.random()*chars.length)];
  }
  return c;
}

async function gerarNovoCodigoLicenca(){
  const codigo = gerarCodigoLicencaLetras();
  const rotulo = _superAdminNovoRotulo.trim() || null;
  const { error } = await sb.from('codigos_licenca_empresa').insert({
    codigo, nome_empresa_sugerido: rotulo, criado_por: meuPerfilId,
  });
  if(error){ showToast('Não foi possível gerar o código: ' + error.message); return; }
  _superAdminNovoRotulo = '';
  showToast('Código de licença gerado.');
  await carregarDadosSuperAdmin();
}

function copiarCodigoLicenca(codigo){
  navigator.clipboard?.writeText(codigo);
  showToast('Código copiado!');
}

async function revogarCodigoLicenca(id){
  if(!confirm('Revogar este código? Ele deixa de poder ser usado (só funciona se ainda não tiver sido usado).')) return;
  const { error } = await sb.from('codigos_licenca_empresa').delete().eq('id', id).eq('usado', false);
  if(error){ showToast('Não foi possível revogar — talvez já tenha sido usado.'); return; }
  showToast('Código revogado.');
  await carregarDadosSuperAdmin();
}

function pageSuperAdmin(){
  if(!_superAdminEmpresas.length && !_superAdminCodigos.length && !_superAdminCarregando){
    carregarDadosSuperAdmin();
  }
  const codigosDisponiveis = _superAdminCodigos.filter(c=>!c.usado);
  const codigosUsados = _superAdminCodigos.filter(c=>c.usado);

  return `
    <div class="page-head">
      <div class="eyebrow">Plataforma NORTE · Instituto INETRIS</div>
      <h1>Super Admin — Empresas licenciadas</h1>
      <p class="page-desc">Controla quais Empresas conseguem se cadastrar na plataforma. Sem um código de licença válido gerado aqui, ninguém consegue criar uma Empresa nova sozinho.</p>
      <button class="btn btn-ghost btn-sm" onclick="carregarDadosSuperAdmin()">↻ Atualizar</button>
    </div>

    ${_superAdminCarregando ? '<div class="empty">Carregando…</div>' : `

    <div class="card">
      <h3>Gerar novo código de licença</h3>
      <p class="page-desc">Cria um código de uso único. Envie por WhatsApp/e-mail pra empresa-cliente — ela usa esse código na tela de cadastro, no lugar de "Nome da empresa" sozinho.</p>
      <div class="field"><label>Rótulo (opcional, só pra você identificar depois — ex.: "Lacle")</label>
        <input value="${_superAdminNovoRotulo}" oninput="_superAdminNovoRotulo=this.value;" placeholder="Nome do cliente prospectado">
      </div>
      <button class="btn btn-primary" onclick="gerarNovoCodigoLicenca()">Gerar código</button>
    </div>

    <div class="card">
      <h3>Códigos disponíveis <small>${codigosDisponiveis.length} ainda não usado(s)</small></h3>
      ${codigosDisponiveis.length ? `
        <table><thead><tr><th>Código</th><th>Rótulo</th><th>Gerado em</th><th></th></tr></thead><tbody>
          ${codigosDisponiveis.map(c=>`<tr>
            <td style="font-family:var(--mono);">${c.codigo}</td>
            <td class="small-muted">${c.nome_empresa_sugerido||'—'}</td>
            <td class="small-muted">${new Date(c.criado_em).toLocaleDateString('pt-BR')}</td>
            <td style="display:flex;gap:6px;">
              <button class="btn btn-sm btn-ghost" onclick="copiarCodigoLicenca('${c.codigo}')">Copiar</button>
              <button class="btn btn-sm btn-ghost" onclick="revogarCodigoLicenca('${c.id}')">Revogar</button>
            </td>
          </tr>`).join('')}
        </tbody></table>
      ` : '<div class="empty">Nenhum código disponível — gere um acima.</div>'}
    </div>

    <div class="card">
      <h3>Empresas cadastradas na plataforma <small>${_superAdminEmpresas.length} no total</small></h3>
      ${_superAdminEmpresas.length ? `
        <table><thead><tr><th>Empresa</th><th>CNPJ</th><th>Estado</th><th>Cadastrada em</th></tr></thead><tbody>
          ${_superAdminEmpresas.map(e=>`<tr>
            <td><b>${e.nome_fantasia||'(sem nome ainda)'}</b></td>
            <td class="small-muted">${e.cnpj||'—'}</td>
            <td><span class="pill pill-neutral">${e.estado||'—'}</span></td>
            <td class="small-muted">${new Date(e.criado_em).toLocaleDateString('pt-BR')}</td>
          </tr>`).join('')}
        </tbody></table>
      ` : '<div class="empty">Nenhuma empresa cadastrada ainda.</div>'}
    </div>

    ${codigosUsados.length ? `
    <div class="card">
      <h3>Histórico de códigos já usados <small>${codigosUsados.length}</small></h3>
      <table><thead><tr><th>Código</th><th>Rótulo</th><th>Empresa que usou</th><th>Usado em</th></tr></thead><tbody>
        ${codigosUsados.map(c=>{
          const empresa = _superAdminEmpresas.find(e=>e.id===c.empresa_id);
          return `<tr>
            <td style="font-family:var(--mono);" class="small-muted">${c.codigo}</td>
            <td class="small-muted">${c.nome_empresa_sugerido||'—'}</td>
            <td>${empresa?empresa.nome_fantasia:'—'}</td>
            <td class="small-muted">${c.usado_em?new Date(c.usado_em).toLocaleDateString('pt-BR'):'—'}</td>
          </tr>`;
        }).join('')}
      </tbody></table>
    </div>
    ` : ''}
    `}
  `;
}
