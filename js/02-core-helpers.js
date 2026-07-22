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
        ${valorAtual ? `<img src="${valorAtual}" style="max-height:60px;max-width:200px;border:1px solid var(--line);border-radius:6px;background:#fff;padding:4px;">` : '<span class="small-muted">Nenhum logotipo definido ainda.</span>'}
      </div>
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
  if(preview){
    preview.innerHTML = valor
      ? `<img src="${valor}" style="max-height:60px;max-width:200px;border:1px solid var(--line);border-radius:6px;background:#fff;padding:4px;">`
      : '<span class="small-muted">Nenhum logotipo definido ainda.</span>';
  }
  if(valor) adaptarCoresAoLogo(valor, fieldId);
}
function logoDefinirURL(fieldId, url){ logoAtualizarPreview(fieldId, url.trim()); }

/* ---------- Adaptação automática de cor a partir do logotipo ----------
   Ao definir um logotipo (em qualquer um dos dois campos — Empresa ou
   Identidade Visual), tenta extrair a cor dominante da imagem e aplica
   como cor primária do tema (o destaque usado em botões, abas ativas
   etc.). As cores de classificação IDA (Iniciar/Desenvolver/Alavancar)
   NÃO mudam — são semânticas da metodologia, não da marca da empresa. */
function rgbParaHex(r,g,b){
  return '#' + [r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}
function corMaisClara(hex, fator){
  const h = (hex||'').replace('#','');
  if(h.length!==6) return hex;
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  const clarear = (v) => v + (255-v)*fator;
  return rgbParaHex(clarear(r), clarear(g), clarear(b));
}
function extrairCorDominante(urlOuDataUrl, callback){
  const img = new Image();
  img.crossOrigin = 'anonymous'; // necessário pra conseguir ler pixels de URLs externas com CORS liberado
  img.onload = () => {
    try{
      const canvas = document.createElement('canvas');
      const w = canvas.width = 50, h = canvas.height = 50;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0,0,w,h).data;
      let r=0,g=0,b=0,count=0;
      for(let i=0;i<data.length;i+=4){
        const rr=data[i], gg=data[i+1], bb=data[i+2], aa=data[i+3];
        if(aa < 100) continue; // pixel transparente
        const luminancia = 0.299*rr + 0.587*gg + 0.114*bb;
        if(luminancia > 240 || luminancia < 15) continue; // ignora fundo quase-branco/quase-preto do logo
        r+=rr; g+=gg; b+=bb; count++;
      }
      if(!count){ callback(null); return; }
      callback(rgbParaHex(r/count, g/count, b/count));
    }catch(e){
      // Canvas "manchado" por CORS — típico de link externo sem cabeçalho
      // liberando leitura de pixel. Sem solução no cliente; a pessoa pode
      // ajustar a cor manualmente, ou usar "Colar imagem"/"Enviar arquivo"
      // (que não têm esse problema, pois viram base64 local).
      callback(null);
    }
  };
  img.onerror = () => callback(null);
  img.src = urlOuDataUrl;
}
function aplicarTemaCores(corPrimaria){
  if(!corPrimaria || !/^#[0-9a-f]{6}$/i.test(corPrimaria)) return;
  const h = corPrimaria.replace('#','');
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  document.documentElement.style.setProperty('--gold', corPrimaria);
  document.documentElement.style.setProperty('--gold-soft', `rgba(${r},${g},${b},.16)`);
}
function adaptarCoresAoLogo(valorLogo, origemPagina){
  if(!valorLogo) return;
  extrairCorDominante(valorLogo, (hex) => {
    if(!hex) return;
    const corSecund = corMaisClara(hex, 0.35);
    state.configuracoes = state.configuracoes || {};
    state.configuracoes.identidadeVisual = {
      ...(state.configuracoes.identidadeVisual||{}),
      logoUrl: valorLogo, corPrimaria: hex, corSecundaria: corSecund,
    };
    aplicarTemaCores(hex);
    // Se os seletores de cor estiverem na tela (Configurações), reflete lá
    // também — só no DOM, sem re-renderizar a página inteira (evitaria
    // perder outros campos do formulário ainda não salvos pela pessoa).
    const corCor1 = document.getElementById('cfg_cor1');
    const corCor2 = document.getElementById('cfg_cor2');
    if(corCor1) corCor1.value = hex;
    if(corCor2) corCor2.value = corSecund;
    registrarAuditoria('configuracoes.tema_adaptado_ao_logo', { origemPagina });
    agendarSalvamento(); // persiste em segundo plano, sem redesenhar a tela
    showToast('Cores do sistema adaptadas ao logotipo. Ajuste manualmente em Configurações, se quiser.');
  });
}
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
  if(!file.type.startsWith('image/')){ showToast('Selecione um arquivo de imagem.'); return; }
  logoRedimensionarEConverter(file, (dataUrl) => {
    logoAtualizarPreview(fieldId, dataUrl);
    showToast('Logotipo carregado.');
  });
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
}
