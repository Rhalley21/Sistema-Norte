const uid = () => Math.random().toString(36).slice(2,9);

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
/* ---------- RN031: campos de auditoria padrão em toda entidade principal ----------
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
    modoAvaliacaoRH: 'com_nota', // 'com_nota' (25%) | 'sem_nota' (RH só revisa)
    multiplosAvaliadoresRH: false, // RN004 — permite mais de um RH avaliando (média simples entre eles)
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
   RN028: estas sugestões nunca são aplicadas automaticamente — sempre
   apresentadas como rascunho editável, exigindo confirmação humana. ---------- */
