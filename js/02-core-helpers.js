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
function pillClass(sig){ return sig==='I'?'pill-iniciar':sig==='D'?'pill-desenvolver':'pill-alavancar'; }
function pillLabel(sig){ return IDA_LABEL[sig]; }

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
}
function logoRemover(fieldId){
  logoAtualizarPreview(fieldId, '');
  // Limpa também os controles de entrada, pra não ficar um valor "fantasma"
  // parado neles (ex.: um link antigo ainda visível no campo de URL).
  const inputUrl = document.querySelector(`#modo_url_${fieldId} input`);
  if(inputUrl) inputUrl.value = '';
  const inputArquivo = document.querySelector(`#modo_arquivo_${fieldId} input`);
  if(inputArquivo) inputArquivo.value = '';
  showToast('Logotipo removido.');
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
