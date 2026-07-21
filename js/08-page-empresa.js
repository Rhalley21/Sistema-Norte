/* ---------- Validação de CNPJ (algoritmo de dígito verificador) ---------- */
function validarCNPJ(cnpjBruto){
  const cnpj = (cnpjBruto||'').replace(/\D/g,'');
  if(cnpj.length !== 14) return false;
  if(/^(\d)\1{13}$/.test(cnpj)) return false; // todos os dígitos iguais
  const calcularDigito = (base, pesos) => {
    const soma = base.split('').reduce((acc,d,i)=>acc + parseInt(d,10)*pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const pesos1 = [5,4,3,2,9,8,7,6,5,4,3,2];
  const pesos2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
  const d1 = calcularDigito(cnpj.slice(0,12), pesos1);
  if(d1 !== parseInt(cnpj[12],10)) return false;
  const d2 = calcularDigito(cnpj.slice(0,12)+d1, pesos2);
  if(d2 !== parseInt(cnpj[13],10)) return false;
  return true;
}

/* ---------- Auditoria ---------- */
/* ---------- RNF012 — Barramento de eventos de domínio ----------
   Emite eventos de negócio (ex: "avaliacao.encerrada", "pdi.criado") para
   uma tabela própria, mesmo sem nenhum consumidor externo hoje. A ideia é
   que integrações futuras (ERP, LMS, Power BI, API pública) consigam se
   conectar a esse fluxo sem precisar alterar o núcleo do sistema. */
async function emitirEvento(nomeEvento, payload){
  try{
    await sb.from('eventos_dominio').insert({ empresa_id: empresaIdAtual, evento: nomeEvento, payload });
  }catch(e){ console.error('Falha ao emitir evento de domínio', e); }
}

async function registrarAuditoria(evento, detalhes){
  try{
    await sb.from('auditoria').insert({ empresa_id: empresaIdAtual, evento, detalhes, criado_por: meuPerfilId });
  }catch(e){ console.error('Falha ao registrar auditoria', e); }
}

function pageEmpresa(){
  const e = state.empresa || {};
  const enderecos = e.enderecos && e.enderecos.length ? e.enderecos : [''];
  return `
    <div class="page-head">
      <div class="eyebrow">Etapa 01 · Fundação</div>
      <h1>Cadastro da Empresa</h1>
      <p class="page-desc">Nó raiz do sistema (Cap. 4.1 do PRD). Toda estrutura, cargo e colaborador se vincula a este cadastro. ${e.estado==='Ativa'?'<span class="pill pill-alavancar" style="margin-left:6px;">Ativa</span>':'<span class="pill pill-neutral" style="margin-left:6px;">Pendente</span>'}</p>
    </div>

    <div class="card">
      <h3>Dados institucionais</h3>
      <div class="grid2">
        <div class="field"><label>Razão social</label><input id="f_razao" value="${e.razaoSocial||''}"></div>
        <div class="field"><label>Nome fantasia</label><input id="f_fantasia" value="${e.nomeFantasia||''}"></div>
        <div class="field"><label>CNPJ</label><input id="f_cnpj" value="${e.cnpj||''}" placeholder="00.000.000/0000-00"></div>
        <div class="field"><label>Segmento</label><input id="f_segmento" value="${e.segmento||''}"></div>
        <div class="field"><label>Porte</label>
          <select id="f_porte">
            ${['pequena','media','grande'].map(v=>`<option value="${v}" ${e.porte===v?'selected':''}>${v.charAt(0).toUpperCase()+v.slice(1)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Tipo</label>
          <select id="f_tipo">
            ${['privada','publica'].map(v=>`<option value="${v}" ${e.tipo===v?'selected':''}>${v==='privada'?'Privada':'Pública'}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Logotipo <small>(cole o link/URL da imagem)</small></label><input id="f_logo" value="${e.logotipo||''}" placeholder="https://..."></div>
      </div>
    </div>

    <div class="card">
      <h3>Endereços <small>Uma ou mais unidades/endereços da empresa</small></h3>
      <div id="lista_enderecos">
        ${enderecos.map((end,i)=>`
          <div class="field" style="display:flex;gap:8px;align-items:flex-end;">
            <div style="flex:1;"><input class="end_input" value="${end}" placeholder="Endereço completo"></div>
            <button class="btn btn-ghost btn-sm" onclick="removerEndereco(${i})">Remover</button>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="adicionarEnderecoTemp()">+ Adicionar outro endereço</button>
    </div>

    <div class="card">
      <h3>Dados de faturamento do contrato</h3>
      <div class="grid2">
        <div class="field"><label>Plano contratado</label>
          <select id="f_plano">
            ${['Essencial','Profissional','Enterprise'].map(v=>`<option value="${v}" ${e.faturamento?.plano===v?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Valor mensal (R$)</label><input id="f_valor" type="number" step="0.01" value="${e.faturamento?.valorMensal||''}"></div>
        <div class="field"><label>Início do contrato</label><input id="f_data_contrato" type="date" value="${e.faturamento?.dataInicio||''}"></div>
        <div class="field"><label>Forma de pagamento</label>
          <select id="f_pagamento">
            ${['Boleto','Cartão de crédito','Pix','Transferência'].map(v=>`<option value="${v}" ${e.faturamento?.formaPagamento===v?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <button class="btn btn-primary" onclick="salvarEmpresa()">Salvar e ativar empresa</button>
    <div id="erro_empresa"></div>

    <div class="notice info">RN009 (PRD): nenhum ciclo de avaliação pode abrir sem empresa ativa, unidade cadastrada, Desenho de Cargo publicado e colaborador vinculado. O módulo Estrutura Organizacional só é liberado quando a empresa está em estado "Ativa".</div>
  `;
}

// Endereços são editados em inputs soltos (sem re-render a cada tecla, pra não
// perder o foco) e só consolidados no array quando salva ou adiciona/remove.
function lerEnderecosDaTela(){
  return Array.from(document.querySelectorAll('.end_input')).map(i=>i.value).filter(v=>v.trim()!=='');
}
function adicionarEnderecoTemp(){
  const atuais = lerEnderecosDaTela();
  atuais.push('');
  state.empresa = state.empresa || {};
  state.empresa.enderecos = atuais;
  render();
}
function removerEndereco(idx){
  const atuais = lerEnderecosDaTela();
  atuais.splice(idx,1);
  state.empresa = state.empresa || {};
  state.empresa.enderecos = atuais.length?atuais:[''];
  render();
}

async function salvarEmpresa(){
  const erroEl = document.getElementById('erro_empresa');
  erroEl.innerHTML = '';

  const cnpj = document.getElementById('f_cnpj').value.trim();
  if(!validarCNPJ(cnpj)){
    erroEl.innerHTML = '<p class="small-muted" style="color:var(--iniciar);margin-top:8px;">CNPJ inválido — confira o número digitado (dígito verificador não confere).</p>';
    return;
  }

  const jaEstavaAtiva = state.empresa && state.empresa.estado === 'Ativa';
  const empresaAnterior = jaEstavaAtiva ? { ...state.empresa } : null;

  // 1) Tenta sincronizar o CNPJ na tabela empresas (fonte de verdade multi-tenant).
  //    Se outro tenant já usa esse CNPJ, o banco recusa (índice único) e
  //    devolve erro — é assim que detectamos duplicidade ENTRE empresas.
  const { error: erroCnpj } = await sb.from('empresas').update({ cnpj }).eq('id', empresaIdAtual);
  if(erroCnpj){
    if(erroCnpj.code === '23505' || /duplicate|unique/i.test(erroCnpj.message||'')){
      erroEl.innerHTML = '<p class="small-muted" style="color:var(--iniciar);margin-top:8px;">Este CNPJ já está cadastrado no sistema por outra empresa. Se isso for um erro, entre em contato com o suporte.</p>';
    } else {
      erroEl.innerHTML = '<p class="small-muted" style="color:var(--iniciar);margin-top:8px;">Não foi possível salvar agora. Tente novamente.</p>';
    }
    return;
  }

  const carimboAnterior = state.empresa && state.empresa.criadoEm
    ? { tenantId: state.empresa.tenantId, criadoPor: state.empresa.criadoPor, criadoEm: state.empresa.criadoEm }
    : { tenantId: empresaIdAtual, criadoPor: meuPerfilId, criadoEm: new Date().toISOString() };

  state.empresa = {
    razaoSocial: document.getElementById('f_razao').value || 'Empresa sem nome',
    nomeFantasia: document.getElementById('f_fantasia').value,
    cnpj, segmento: document.getElementById('f_segmento').value,
    porte: document.getElementById('f_porte').value,
    tipo: document.getElementById('f_tipo').value,
    logotipo: document.getElementById('f_logo').value,
    enderecos: lerEnderecosDaTela(),
    faturamento: {
      plano: document.getElementById('f_plano').value,
      valorMensal: document.getElementById('f_valor').value,
      dataInicio: document.getElementById('f_data_contrato').value,
      formaPagamento: document.getElementById('f_pagamento').value,
    },
    estado: 'Ativa',
    ...carimboAnterior,
    atualizadoPor: meuPerfilId, atualizadoEm: new Date().toISOString(),
  };

  if(!jaEstavaAtiva){
    registrarAuditoria('empresa.criada', { razaoSocial: state.empresa.razaoSocial, cnpj });
    showToast('Empresa ativada. Módulo Estrutura Organizacional liberado.');
  } else {
    const camposComparar = ['razaoSocial','nomeFantasia','cnpj','segmento','porte','tipo','logotipo'];
    const alteracoes = camposComparar
      .filter(campo => empresaAnterior[campo] !== state.empresa[campo])
      .map(campo => ({ campo, valorAnterior: empresaAnterior[campo], novoValor: state.empresa[campo] }));
    registrarAuditoria('empresa.atualizada', { razaoSocial: state.empresa.razaoSocial, alteracoes });
    showToast('Dados da empresa atualizados.');
  }
  render();
}

/* ===================== 2. ESTRUTURA ===================== */
