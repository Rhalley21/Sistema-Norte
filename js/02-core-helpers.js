// UUID v4 real — permite futura sincronização entre ambientes sem colisão de IDs
// (Documento 03, Cap. 4 — Chaves Primárias). Usa crypto.randomUUID() quando
// disponível (todo navegador moderno), com um gerador manual como reserva.
const uid = () => {
  if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random()*16|0, v = c==='x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
};

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>t.classList.remove('show'), 2600);
}

/* ---------- Estado (simulando o banco multi-tenant) ---------- */
const state = {
  role: 'admin', // admin | rh | gestor | colaborador
  route: 'dashboard',
  empresa: null,
  estrutura: [], // {id,nome,tipo,paiId,responsavel}
  cultura: { missao:'', visao:'', valores:'',
    indicadoresT:[
      {id:'t-padrao-1', nome:'Respeito e ética nas relações de trabalho', origem:'padrão'},
      {id:'t-padrao-2', nome:'Colaboração e trabalho em equipe', origem:'padrão'},
    ],
    indicadoresE:[
      {id:'e-padrao-1', nome:'Interesse em aprender e se desenvolver continuamente', origem:'padrão'},
      {id:'e-padrao-2', nome:'Disposição para assumir novos desafios', origem:'padrão'},
    ],
  },
  cargos: [], // {id,nome,familia,natureza,cbo,indicadoresN:[],indicadoresO:[],desenho:{versao,atividades,aprovado}}
  colaboradores: [], // {id,nome,cargoId,setorId,gestorNome,admissao}
  bancoAcoes: [],
  feedbackContinuo: [], // check-ins 1:1 fora do ciclo formal — RN003 não é afetada (não pontua)
  pesquisasClima: [], // pesquisas de clima/eNPS, módulo separado da avaliação de desempenho
  ciclos: [], // {id,colaboradorId,cargoId,estado,dataAbertura,notas:{colaborador:{},gestor:{},rh:{}},diagnostico,pdiDesenvolvimento,pdiMentalidade}
  ciclosSelecionado: null,
  avaliadorAtivo: 'colaborador'
};

const PILAR_LABEL = {N:'Nível Técnico', O:'Operação', R:'Resultado', T:'Time', E:'Evolução'};
const PILAR_TAGLINE = {
  N:'O que você precisa saber',
  O:'O que você precisa executar',
  R:'O que você precisa entregar',
  T:'Como você vive a cultura',
  E:'Para onde você quer ir',
};
const IDA_VAL = {I:0, D:0.5, A:1};
const IDA_LABEL = {I:'Iniciar', D:'Desenvolver', A:'Alavancar'};

function classificar(media){
  if(media <= 0.33) return 'I';
  if(media <= 0.66) return 'D';
  return 'A';
}
// BUG CORRIGIDO: antes, qualquer valor que não fosse exatamente 'I' ou 'D'
// caía no `else` final e virava 'pill-alavancar' — incluindo null/undefined
// (sem dado). Um diagnóstico incompleto podia aparecer visualmente como
// "Alavancar" (a melhor nota possível) em vez de mostrar que não há dado.
function pillClass(sig){ return sig==='I'?'pill-iniciar':sig==='D'?'pill-desenvolver':sig==='A'?'pill-alavancar':'pill-neutral'; }
function pillLabel(sig){ return IDA_LABEL[sig] || 'Sem dado'; }

/* ---------- Estado inicial em branco (dados reais vêm do Supabase) ---------- */
/* ---------- RN026: campos de auditoria padrão em toda entidade principal ----------
   criado_por / criado_em / atualizado_por / atualizado_em + vínculo ao tenant. */
function novoCarimbo(){
  const agora = new Date().toISOString();
  return { tenantId: empresaIdAtual, criadoPor: meuPerfilId, criadoEm: agora, atualizadoPor: meuPerfilId, atualizadoEm: agora };
}
function atualizarCarimbo(obj){
  obj.atualizadoPor = meuPerfilId;
  obj.atualizadoEm = new Date().toISOString();
}

function seed(){
  state.empresa = null;
  state.estrutura = [];
  state.cultura = { missao:'', visao:'', valores:'',
    indicadoresT:[
      {id:'t-padrao-1', nome:'Respeito e ética nas relações de trabalho', origem:'padrão'},
      {id:'t-padrao-2', nome:'Colaboração e trabalho em equipe', origem:'padrão'},
    ],
    indicadoresE:[
      {id:'e-padrao-1', nome:'Interesse em aprender e se desenvolver continuamente', origem:'padrão'},
      {id:'e-padrao-2', nome:'Disposição para assumir novos desafios', origem:'padrão'},
    ],
  };
  state.cargos = [];
  state.colaboradores = [];
  state.bancoAcoes = [
    {id:'a1', categoria:'Conteúdo', titulo:'Curso de atualização técnica relacionado ao cargo', pilares:['N'], prazoSugerido:'30 dias', origem:'metodologia', competencias:['Raciocínio analítico']},
    {id:'a2', categoria:'Conteúdo', titulo:'Leitura guiada: manual de boas práticas da função', pilares:['N','O'], prazoSugerido:'15 dias', origem:'metodologia', competencias:['Organização e atenção a detalhes']},
    {id:'a3', categoria:'Conteúdo', titulo:'Trilha e-learning sobre sistemas utilizados no dia a dia', pilares:['N'], prazoSugerido:'20 dias', origem:'metodologia', competencias:['Raciocínio analítico']},
    {id:'a4', categoria:'Formação', titulo:'Workshop interno de excelência operacional', pilares:['O','R'], prazoSugerido:'45 dias', origem:'metodologia', competencias:['Organização de equipes','Agilidade na execução']},
    {id:'a5', categoria:'Formação', titulo:'Treinamento de gestão do tempo e prazos', pilares:['O'], prazoSugerido:'30 dias', origem:'metodologia', competencias:['Gestão de prazos']},
    {id:'a6', categoria:'Formação', titulo:'Formação em qualidade e redução de falhas', pilares:['R'], prazoSugerido:'40 dias', origem:'metodologia', competencias:['Atenção a detalhes']},
    {id:'a7', categoria:'Prática', titulo:'Simulação supervisionada de processo crítico', pilares:['N','O'], prazoSugerido:'20 dias', origem:'metodologia', competencias:['Disciplina e cumprimento de normas']},
    {id:'a8', categoria:'Prática', titulo:'Aplicação prática de checklist de qualidade', pilares:['O'], prazoSugerido:'15 dias', origem:'metodologia', competencias:['Atenção a detalhes']},
    {id:'a9', categoria:'Prática', titulo:'Rodízio assistido em etapa complementar do processo', pilares:['N'], prazoSugerido:'30 dias', origem:'metodologia', competencias:['Trabalho em equipe']},
    {id:'a10', categoria:'Experiência', titulo:'Participação em projeto interdepartamental', pilares:['T','R'], prazoSugerido:'60 dias', origem:'metodologia', competencias:['Comunicação com múltiplos níveis','Trabalho em equipe']},
    {id:'a11', categoria:'Experiência', titulo:'Vivência em rotina crítica com mentor designado', pilares:['O'], prazoSugerido:'30 dias', origem:'metodologia', competencias:['Resiliência']},
    {id:'a12', categoria:'Experiência', titulo:'Representação da equipe em comitê de melhoria', pilares:['T'], prazoSugerido:'45 dias', origem:'metodologia', competencias:['Comunicação institucional']},
    {id:'a13', categoria:'Desenvolvimento', titulo:'Mentoria com liderança técnica sênior', pilares:['N','E'], prazoSugerido:'60 dias', origem:'metodologia', competencias:['Visão estratégica']},
    {id:'a14', categoria:'Desenvolvimento', titulo:'Plano de autodesenvolvimento com check-ins mensais', pilares:['E'], prazoSugerido:'90 dias', origem:'metodologia', competencias:['Tomada de decisão']},
    {id:'a15', categoria:'Desenvolvimento', titulo:'Feedback estruturado 360 com pares', pilares:['T','E'], prazoSugerido:'30 dias', origem:'metodologia', competencias:['Comunicação com múltiplos níveis']},
    {id:'a16', categoria:'Inovação', titulo:'Proposta de melhoria contínua (kaizen) do próprio processo', pilares:['R','E'], prazoSugerido:'45 dias', origem:'metodologia', competencias:['Resolução de problemas do dia a dia']},
    {id:'a17', categoria:'Inovação', titulo:'Participação em hackathon interno de processos', pilares:['E'], prazoSugerido:'30 dias', origem:'metodologia', competencias:['Resolução de problemas do dia a dia']},
    {id:'a18', categoria:'Inovação', titulo:'Estudo de caso e proposta de automação de rotina', pilares:['N','R'], prazoSugerido:'60 dias', origem:'metodologia', competencias:['Raciocínio analítico']},
    {id:'a19', categoria:'Formação', titulo:'Certificação técnica externa relacionada ao cargo', pilares:['N'], prazoSugerido:'90 dias', origem:'metodologia', competencias:['Raciocínio analítico']},
    {id:'a20', categoria:'Prática', titulo:'Condução assistida de reunião de time', pilares:['T'], prazoSugerido:'20 dias', origem:'metodologia', competencias:['Gestão de pessoas e equipes','Comunicação com múltiplos níveis']},
  ];
  state.ciclos = [];
  state.configuracoes = {
    periodicidadeCiclo: 'Anual',
    // Pesos dos avaliadores travados em 25/50/25 (RN003, PRD Documento 04) —
    // não é mais configurável (era uma extensão fora do PRD; removida por decisão de produto).
    notificacoes: { lembretesPrazo: true },
    identidadeVisual: { logoUrl:'', corPrimaria:'#0a2647', corSecundaria:'#e99610' },
    // RNF002 — permissões configuráveis pelo Administrador (exceções ao
    // modelo padrão de papéis; por padrão, tudo desligado = comportamento fixo de sempre).
    permissoesExtras: {
      gestorAbreCiclo: false,
      gestorPublicaDesenho: false,
      rhCadastraEmpresa: false,
    },
  };
}

/* ---------- Banco de Inteligência — biblioteca de competências e
   indicadores sugeridos por família de cargo (Cap. 6 do doc. funcional).
   Cap. 11.5 (Governança de IA): estas sugestões nunca são aplicadas automaticamente — sempre
   apresentadas como rascunho editável, exigindo confirmação humana. ---------- */

/* =========================================================
   COMPONENTE REUTILIZÁVEL — upload de logotipo
   -----------------------------------------------------------
   3 formas de definir o logotipo: colar um link (URL), colar uma
   imagem copiada (Ctrl+V) ou enviar um arquivo do computador.
   Nos dois últimos casos, a imagem é redimensionada no navegador
   (máx. 300px no maior lado) e guardada como data URL (base64) —
   não depende de nenhum servidor de upload de arquivos.
   ========================================================= */
function logoUploadWidgetHTML(fieldId, valorAtual){
  const ehUrlHttp = valorAtual && /^https?:\/\//i.test(valorAtual);
  return `
    <div id="wrap_${fieldId}">
      <input type="hidden" id="${fieldId}" value="${valorAtual||''}">
      <div class="filtro-categorias" style="margin-bottom:8px;">
        <button type="button" class="filtro-pill active" data-modo="url" onclick="logoTrocarModo('${fieldId}','url')">Link (URL)</button>
        <button type="button" class="filtro-pill" data-modo="colar" onclick="logoTrocarModo('${fieldId}','colar')">Colar imagem</button>
        <button type="button" class="filtro-pill" data-modo="arquivo" onclick="logoTrocarModo('${fieldId}','arquivo')">Enviar arquivo</button>
      </div>
      <div id="modo_url_${fieldId}">
        <input type="text" placeholder="https://..." value="${ehUrlHttp?valorAtual:''}" onchange="logoDefinirURL('${fieldId}', this.value)">
      </div>
      <div id="modo_colar_${fieldId}" style="display:none;">
        <div contenteditable="true" onpaste="logoColarImagem(event,'${fieldId}')" style="border:1px dashed var(--line);border-radius:8px;padding:16px;text-align:center;color:var(--ink-faint);font-size:13px;cursor:text;outline:none;">Clique aqui e cole (Ctrl+V) uma imagem copiada</div>
      </div>
      <div id="modo_arquivo_${fieldId}" style="display:none;">
        <input type="file" accept="image/*" onchange="logoDefinirArquivo(event,'${fieldId}')">
      </div>
      <div id="preview_${fieldId}" style="margin-top:10px;">
        ${logoPreviewInternoHTML(fieldId, valorAtual)}
      </div>
    </div>`;
}
function logoPreviewInternoHTML(fieldId, valor){
  if(!valor) return '<span class="small-muted">Nenhum logotipo definido ainda.</span>';
  return `
    <div style="display:flex;align-items:center;gap:10px;">
      <img src="${valor}" style="max-height:60px;max-width:200px;border:1px solid var(--line);border-radius:6px;background:#fff;padding:4px;">
      <button type="button" class="btn btn-ghost btn-sm" onclick="logoRemover('${fieldId}')">Remover logotipo</button>
    </div>`;
}
function logoTrocarModo(fieldId, modo){
  ['url','colar','arquivo'].forEach(m=>{
    const painel = document.getElementById(`modo_${m}_${fieldId}`);
    if(painel) painel.style.display = (m===modo ? '' : 'none');
  });
  document.querySelectorAll(`#wrap_${fieldId} .filtro-pill`).forEach(b=>b.classList.toggle('active', b.dataset.modo===modo));
}
function logoAtualizarPreview(fieldId, valor){
  const campo = document.getElementById(fieldId);
  if(campo) campo.value = valor;
  const preview = document.getElementById(`preview_${fieldId}`);
  if(preview) preview.innerHTML = logoPreviewInternoHTML(fieldId, valor);
  // BUG CORRIGIDO: antes, o logotipo só passava a valer no menu lateral
  // depois de clicar no botão "Salvar" da tela (Empresa ou Configurações) —
  // e remover o logotipo não tinha efeito nenhum ali, porque a função só
  // mexia no campo escondido do formulário, nunca no estado de verdade.
  // Agora toda mudança de logotipo (definir ou remover) grava direto no
  // estado, atualiza o menu lateral na hora, e salva em segundo plano —
  // sem depender do botão "Salvar" do resto do formulário.
  if(fieldId === 'f_logo'){
    state.empresa = state.empresa || {};
    state.empresa.logotipo = valor;
  } else if(fieldId === 'cfg_logo'){
    state.configuracoes = state.configuracoes || {};
    state.configuracoes.identidadeVisual = { ...(state.configuracoes.identidadeVisual||{}), logoUrl: valor };
  }
  if(typeof atualizarLogoSidebarAoVivo === 'function') atualizarLogoSidebarAoVivo();
  if(typeof agendarSalvamento === 'function') agendarSalvamento();
}
function logoRemover(fieldId){
  // Remove dos DOIS campos possíveis (Cadastro de Empresa e Identidade
  // Visual) — os dois alimentam o mesmo logo do menu lateral (um serve de
  // reserva pro outro), então remover só um deles deixava o outro
  // aparecendo, dando a falsa impressão de que "remover" não funcionava.
  logoAtualizarPreview('f_logo', '');
  logoAtualizarPreview('cfg_logo', '');
  ['f_logo','cfg_logo'].forEach(fid=>{
    const inputUrl = document.querySelector(`#modo_url_${fid} input`);
    if(inputUrl) inputUrl.value = '';
    const inputArquivo = document.querySelector(`#modo_arquivo_${fid} input`);
    if(inputArquivo) inputArquivo.value = '';
  });
  showToast('Logotipo removido — voltou ao símbolo padrão do sistema.');
}
function logoDefinirURL(fieldId, url){ logoAtualizarPreview(fieldId, url.trim()); }
function logoRedimensionarEConverter(file, callback){
  const leitor = new FileReader();
  leitor.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const maxLado = 300;
      let { width, height } = img;
      if(width > maxLado || height > maxLado){
        const escala = maxLado / Math.max(width, height);
        width = Math.round(width*escala); height = Math.round(height*escala);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL('image/png'));
    };
    img.src = e.target.result;
  };
  leitor.readAsDataURL(file);
}
function logoDefinirArquivo(event, fieldId){
  const file = event.target.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')){ showToast('Selecione um arquivo de imagem.'); event.target.value = ''; return; }
  logoRedimensionarEConverter(file, (dataUrl) => {
    logoAtualizarPreview(fieldId, dataUrl);
    showToast('Logotipo carregado.');
  });
  // Reseta o valor do <input type="file"> — sem isso, escolher o MESMO
  // arquivo de novo (ex.: pra trocar de novo) não dispara o evento "change"
  // uma segunda vez, dando a impressão de que nada aconteceu.
  event.target.value = '';
}
function logoColarImagem(event, fieldId){
  const itens = (event.clipboardData || window.clipboardData)?.items || [];
  let achouImagem = false;
  for(const item of itens){
    if(item.type && item.type.startsWith('image/')){
      achouImagem = true;
      const file = item.getAsFile();
      logoRedimensionarEConverter(file, (dataUrl) => {
        logoAtualizarPreview(fieldId, dataUrl);
        showToast('Imagem colada como logotipo.');
      });
      break;
    }
  }
  if(!achouImagem) showToast('Não encontrei nenhuma imagem na área de transferência — copie uma imagem (não um link de texto) antes de colar aqui.');
  event.preventDefault();
  // Reseta o conteúdo da área de colar — sem isso, o texto/imagem colado
  // pode ficar "grudado" ali dentro, e uma segunda tentativa de colar às
  // vezes parece não fazer nada porque o navegador já vê aquele elemento
  // como preenchido.
  event.currentTarget.innerHTML = 'Clique aqui e cole (Ctrl+V) uma imagem copiada';
}

/* =========================================================
   NOTIFICAÇÕES POR E-MAIL
   -----------------------------------------------------------
   Chama a Edge Function "enviar-email" (supabase/functions/enviar-email),
   que manda pro Resend mantendo a chave de API em segredo no servidor.
   Nunca falha "alto" — se o e-mail não sair, a ação principal (aprovar
   PDI, avançar etapa etc.) continua funcionando normalmente; só mostra um
   aviso discreto no console.
   ========================================================= */
async function enviarEmailNotificacao(destinatario, assunto, corpoHtml){
  if(!destinatario) return false;
  try{
    const { data, error } = await sb.functions.invoke('enviar-email', {
      body: { destinatario, assunto, corpoHtml },
    });
    if(error){ console.error('Falha ao enviar e-mail de notificação:', error); return false; }
    return true;
  }catch(e){
    console.error('Falha ao enviar e-mail de notificação:', e);
    return false;
  }
}
function emailWrapperHTML(tituloInterno, corpoTexto, botaoTexto, botaoUrl){
  // Template simples e consistente pra todos os e-mails da plataforma.
  return `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0a2647;color:#e9edf3;border-radius:8px;">
      <div style="font-size:20px;font-weight:700;margin-bottom:4px;">NORTE</div>
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9fb0c7;margin-bottom:20px;">Metodologia NORTE · Instituto INETRIS</div>
      <h2 style="font-size:17px;margin:0 0 12px;">${tituloInterno}</h2>
      <p style="font-size:14px;line-height:1.5;color:#e9edf3;">${corpoTexto}</p>
      ${botaoUrl ? `<a href="${botaoUrl}" style="display:inline-block;margin-top:16px;padding:10px 18px;background:#e99610;color:#0a2647;text-decoration:none;border-radius:6px;font-weight:700;font-size:13px;">${botaoTexto||'Acessar'}</a>` : ''}
    </div>`;
}

/* =========================================================
   AVISO DE ATUALIZAÇÃO EM TEMPO REAL (Supabase Realtime)
   -----------------------------------------------------------
   Resolve o problema de duas pessoas da mesma empresa usando o sistema ao
   mesmo tempo sem saber que os dados mudaram (ex.: o caso real que
   aconteceu — RH via "etapa 2" enquanto o Líder já via "etapa 3", porque
   o RH só carregou os dados antes do Líder enviar).

   Importante: isso AVISA a pessoa, mas não atualiza sozinho. Atualizar
   automaticamente correria o risco de apagar um formulário que a pessoa
   esteja preenchendo bem naquele momento — o mesmo tipo de problema já
   corrigido antes na tela de login. Por isso o aviso fica num elemento
   separado do #app (não participa do render() principal), e quem decide
   quando atualizar é a pessoa, com um clique.
   ========================================================= */
let _canalRealtimeDadosSistema = null;

function assinarAtualizacoesAoVivo(){
  if(_canalRealtimeDadosSistema || !empresaIdAtual) return; // já assinado, evita duplicar
  _canalRealtimeDadosSistema = sb
    .channel(`dados_sistema_${empresaIdAtual}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'dados_sistema', filter: `empresa_id=eq.${empresaIdAtual}`,
    }, () => {
      // BUG CORRIGIDO (segunda tentativa): comparar o carimbo exato do
      // salvamento não bastava — se a pessoa clica em várias coisas
      // seguidas, cada clique dispara seu próprio salvamento, e o aviso de
      // um mais antigo podia chegar depois do carimbo já ter mudado pra
      // um mais novo, dando falso positivo. Agora usa uma janela de tempo:
      // se eu mesmo fiz qualquer ação nos últimos 4 segundos, assume que a
      // mudança é minha e não mostra o aviso.
      const segundosDesdeMinhaUltimaAtividade = (Date.now() - _minhaUltimaAtividadeEm) / 1000;
      if(segundosDesdeMinhaUltimaAtividade < 4) return;
      mostrarAvisoAtualizacao();
    })
    .subscribe();
}
function mostrarAvisoAtualizacao(){
  const el = document.getElementById('aviso-atualizacao');
  if(!el) return;
  el.innerHTML = `
    <div class="aviso-atualizacao-banner">
      <span>Alguém mais atualizou os dados da empresa.</span>
      <button class="btn btn-primary btn-sm" onclick="atualizarDadosAoVivo(); esconderAvisoAtualizacao();">Atualizar agora</button>
      <button class="btn btn-ghost btn-sm" onclick="esconderAvisoAtualizacao();">Depois</button>
    </div>`;
}
function esconderAvisoAtualizacao(){
  const el = document.getElementById('aviso-atualizacao');
  if(el) el.innerHTML = '';
}

/* =========================================================
   GRÁFICO DE TRAJETÓRIA IDA — evolução ao longo de múltiplos ciclos
   -----------------------------------------------------------
   SVG simples, sem biblioteca externa — plota Resultado, Comportamento e
   Potencial (as 3 Dimensões) ao longo dos ciclos com diagnóstico, na
   ordem cronológica. Cada ciclo já é um "retrato congelado" (RN024) — os
   valores aqui nunca mudam depois de gerados, só a lista de pontos cresce
   conforme novos ciclos são consolidados.
   ========================================================= */
function renderGraficoTrajetoriaIDA(ciclosComDiagnostico){
  const pontos = ciclosComDiagnostico
    .filter(c=>c.diagnostico?.dimensaoMedia)
    .slice().sort((a,b)=>a.dataAbertura.localeCompare(b.dataAbertura));

  if(pontos.length < 2){
    return '<p class="small-muted">Precisa de pelo menos 2 ciclos com diagnóstico pra desenhar uma trajetória — hoje só tem ' + pontos.length + '.</p>';
  }

  const W = 640, H = 220, PAD_L = 40, PAD_R = 16, PAD_T = 16, PAD_B = 34;
  const areaW = W - PAD_L - PAD_R, areaH = H - PAD_T - PAD_B;
  const passoX = pontos.length > 1 ? areaW / (pontos.length - 1) : 0;
  const yDoValor = (v) => PAD_T + areaH - (v==null ? 0 : v) * areaH;
  const xDoIndice = (i) => PAD_L + i * passoX;

  const SERIES = [
    { chave:'Resultado', cor:'var(--alavancar)' },
    { chave:'Comportamento', cor:'var(--gold)' },
    { chave:'Potencial', cor:'var(--iniciar)' },
  ];

  function linhaSVG(chave){
    const coords = pontos.map((c,i)=>{
      const v = c.diagnostico.dimensaoMedia[chave];
      return v==null ? null : `${xDoIndice(i)},${yDoValor(v)}`;
    }).filter(Boolean);
    return coords.length>1 ? `<polyline points="${coords.join(' ')}" fill="none" stroke="${SERIES.find(s=>s.chave===chave).cor}" stroke-width="2.5" />` : '';
  }
  function pontosSVG(chave){
    return pontos.map((c,i)=>{
      const v = c.diagnostico.dimensaoMedia[chave];
      if(v==null) return '';
      return `<circle cx="${xDoIndice(i)}" cy="${yDoValor(v)}" r="3.5" fill="${SERIES.find(s=>s.chave===chave).cor}" />`;
    }).join('');
  }

  const linhasGuia = [0, 0.33, 0.66, 1].map(v=>`
    <line x1="${PAD_L}" x2="${W-PAD_R}" y1="${yDoValor(v)}" y2="${yDoValor(v)}" stroke="var(--line)" stroke-width="1" />
    <text x="${PAD_L-6}" y="${yDoValor(v)+3}" font-size="9" fill="var(--ink-faint)" text-anchor="end">${v===0?'I':v===1?'A':'D'}</text>
  `).join('');

  const rotulosX = pontos.map((c,i)=>`
    <text x="${xDoIndice(i)}" y="${H-PAD_B+16}" font-size="9" fill="var(--ink-faint)" text-anchor="middle">${new Date(c.dataAbertura).toLocaleDateString('pt-BR',{month:'short',year:'2-digit'})}</text>
  `).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;max-width:640px;">
      ${linhasGuia}
      ${SERIES.map(s=>linhaSVG(s.chave)+pontosSVG(s.chave)).join('')}
      ${rotulosX}
    </svg>
    <div style="display:flex;gap:16px;margin-top:6px;flex-wrap:wrap;">
      ${SERIES.map(s=>`<span style="font-size:11.5px;color:var(--ink-dim);"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.cor};margin-right:5px;"></span>${s.chave}</span>`).join('')}
    </div>`;
}

/* =========================================================
   MATRIZ 9-BOX — Desempenho (Resultado) × Potencial
   -----------------------------------------------------------
   Visualização clássica de RH, reaproveitando dados já calculados no
   Diagnóstico: eixo X = Resultado (Dimensão), eixo Y = Potencial
   (Dimensão) — cada colaborador plotado pelo último ciclo com
   diagnóstico que ele tiver.
   ========================================================= */
function calcularPosicoes9Box(colaboradores, ciclos){
  return colaboradores.map(p=>{
    const ultimoCiclo = ciclos.filter(c=>c.colaboradorId===p.id && c.diagnostico?.dimensaoMedia)
      .slice().sort((a,b)=>b.dataAbertura.localeCompare(a.dataAbertura))[0];
    if(!ultimoCiclo) return null;
    const desempenho = ultimoCiclo.diagnostico.dimensaoMedia.Resultado;
    const potencial = ultimoCiclo.diagnostico.dimensaoMedia.Potencial;
    if(desempenho==null || potencial==null) return null;
    return { nome:p.nome, desempenho, potencial };
  }).filter(Boolean);
}

const QUADRANTES_9BOX = [
  ['Enigma','Comprometido','Forte desempenho'],
  ['Questionável','Mantenedor','Alto potencial'],
  ['Risco','Eficaz','Estrela'],
];

function renderMatriz9Box(colaboradores, ciclos){
  const pontos = calcularPosicoes9Box(colaboradores, ciclos);
  if(!pontos.length) return '<div class="empty">Nenhum colaborador com diagnóstico ainda para plotar.</div>';

  const W = 480, H = 480, PAD = 50;
  const area = W - PAD*2;
  const xDoValor = (v) => PAD + v*area;
  const yDoValor = (v) => H - PAD - v*area; // potencial cresce pra cima

  const celulas = [];
  for(let col=0; col<3; col++){
    for(let lin=0; lin<3; lin++){
      const x0 = PAD + col*(area/3), y0 = PAD + lin*(area/3);
      celulas.push(`<rect x="${x0}" y="${y0}" width="${area/3}" height="${area/3}" fill="none" stroke="var(--line)" stroke-width="1" />
        <text x="${x0+8}" y="${y0+16}" font-size="9" fill="var(--ink-faint)">${QUADRANTES_9BOX[2-lin][col]}</text>`);
    }
  }

  const bolinhas = pontos.map(p=>{
    const cor = p.desempenho>=0.67 && p.potencial>=0.67 ? 'var(--alavancar)' : (p.desempenho<=0.33 && p.potencial<=0.33 ? 'var(--iniciar)' : 'var(--gold)');
    return `<circle cx="${xDoValor(p.desempenho)}" cy="${yDoValor(p.potencial)}" r="6" fill="${cor}" fill-opacity=".85" stroke="var(--surface)" stroke-width="1.5">
      <title>${p.nome}</title>
    </circle>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:480px;height:auto;">
      ${celulas.join('')}
      <text x="${W/2}" y="${H-14}" font-size="11" fill="var(--ink-dim)" text-anchor="middle">Desempenho (Resultado) →</text>
      <text x="14" y="${H/2}" font-size="11" fill="var(--ink-dim)" text-anchor="middle" transform="rotate(-90 14 ${H/2})">Potencial →</text>
      ${bolinhas}
    </svg>
    <div class="small-muted" style="margin-top:6px;">Passe o mouse sobre cada ponto pra ver o nome. ${pontos.length} colaborador(es) plotado(s).</div>
  `;
}

/* =========================================================
   WHITE-LABEL NA INTERFACE — cores da Identidade Visual, ao vivo
   -----------------------------------------------------------
   Diferente da tentativa anterior (v0.12.0, removida na v0.12.1 por
   decisão do usuário) — aquela tentava EXTRAIR a cor automaticamente do
   logo. Esta aqui só usa as cores que a própria empresa escolhe
   manualmente nos seletores de cor de Configurações → Identidade Visual
   (que já existiam e já afetavam só os PDFs) — agora também repinta a
   interface ao vivo. Nunca mexe nas cores semânticas de classificação
   IDA (Iniciar/Desenvolver/Alavancar), que continuam fixas da metodologia.
   ========================================================= */
function aplicarTemaCoresInterface(corPrimaria){
  if(!corPrimaria || !/^#[0-9a-f]{6}$/i.test(corPrimaria)) return;
  const h = corPrimaria.replace('#','');
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  document.documentElement.style.setProperty('--gold', corPrimaria);
  document.documentElement.style.setProperty('--gold-soft', `rgba(${r},${g},${b},.16)`);
  // BUG CORRIGIDO: o texto do botão principal (.btn-primary) tinha uma cor
  // fixa e escura, pensada só pra funcionar com a cor padrão (dourado). Se
  // a empresa escolhesse uma cor escura pra Identidade Visual, o texto
  // escuro ficava quase invisível em cima de um botão também escuro (texto
  // preto sobre fundo escuro). Agora calcula o contraste (luminância) da
  // cor escolhida e usa texto claro ou escuro, o que fizer mais sentido.
  const luminancia = (0.299*r + 0.587*g + 0.114*b) / 255;
  const corTexto = luminancia > 0.6 ? '#1a1305' : '#ffffff';
  document.documentElement.style.setProperty('--gold-text', corTexto);
}
