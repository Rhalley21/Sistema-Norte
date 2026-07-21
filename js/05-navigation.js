const STEPS_BASE = [
  {id:'empresa', label:'Cadastro da Empresa', group:'Fundação', papeis:['owner']},
  {id:'estrutura', label:'Estrutura Organizacional', group:'Fundação', papeis:['owner','rh']},
  {id:'cultura', label:'Cultura Organizacional', group:'Fundação', papeis:['owner','rh']},
  {id:'usuarios', label:'Usuários & Acesso', group:'Fundação', papeis:['owner','rh']},
  {id:'cargos', label:'Base de Cargos (CBO)', group:'Cargos', papeis:['owner','rh']},
  {id:'desenho', label:'Desenho de Cargo', group:'Cargos', papeis:['owner','rh']},
  {id:'colaboradores', label:'Colaboradores', group:'Pessoas', papeis:['owner','rh','lider']},
  {id:'ciclos', label:'Ciclos de Avaliação', group:'Ciclo NORTE'},
  {id:'diagnostico', label:'Diagnóstico & PDI', group:'Ciclo NORTE'},
  {id:'inteligencia', label:'Banco de Inteligência', group:'Base', papeis:['owner','rh']},
  {id:'relatorios', label:'Relatórios', group:'Base', papeis:['owner','rh']},
  {id:'configuracoes', label:'Configurações', group:'Base', papeis:['owner']},
  {id:'dashboard_role', label:'Dashboards', group:'Base'},
];
function stepsVisiveis(){
  const perm = state.configuracoes?.permissoesExtras || {};
  return STEPS_BASE.filter(s => {
    if(!s.papeis) return true;
    if(s.papeis.includes(meuPapelReal)) return true;
    // RNF002 — exceções configuráveis pelo Administrador
    if(s.id==='desenho' && meuPapelReal==='lider' && perm.gestorPublicaDesenho) return true;
    if(s.id==='cargos' && meuPapelReal==='lider' && perm.gestorPublicaDesenho) return true;
    if(s.id==='empresa' && meuPapelReal==='rh' && perm.rhCadastraEmpresa) return true;
    return false;
  });
}
Object.defineProperty(window, 'STEPS', { get: stepsVisiveis });

function stepUnlocked(id){
  switch(id){
    case 'empresa': return true;
    case 'estrutura': return state.empresa?.estado === 'Ativa';
    case 'cultura': return state.estrutura.length>0;
    case 'usuarios': return true;
    case 'cargos': return !!state.cultura.missao;
    case 'desenho': return state.cargos.length>0;
    case 'colaboradores': return state.cargos.some(c=>c.desenho.aprovado && !c.descontinuado);
    case 'ciclos': return state.colaboradores.length>0;
    case 'diagnostico': return state.ciclos.length>0;
    case 'inteligencia': return true;
    case 'relatorios': return true;
    case 'configuracoes': return true;
    case 'dashboard_role': return true;
    default: return true;
  }
}

/* ---------- Render root ---------- */
function render(){
  const app = document.getElementById('app');
  app.innerHTML = `
    ${renderSidebar()}
    <main>${renderRoute()}</main>
  `;
  window.scrollTo(0,0);
  agendarSalvamento();
}

function compassSVG(){
  const stageIdx = STEPS.findIndex(s=>s.id===state.route);
  const total = STEPS.length || 1;
  const progresso = stageIdx>=0 ? Math.round(((stageIdx+1)/total)*100) : 0;
  return `
  <div class="compass-wrap" title="Ciclo NORTE — ${progresso}% navegado">
    <img src="data:image/png;base64,${LOGO_INETRIS_B64}" alt="Instituto INETRIS" style="width:100%;height:100%;object-fit:contain;" />
  </div>`;
}

let _menuMobileAberto = false;

function renderSidebar(){
  const roles = [
    {id:'admin', label:'Administrador'},
    {id:'rh', label:'RH'},
    {id:'gestor', label:'Gestor'},
    {id:'colaborador', label:'Colaborador'},
  ];
  const podeAlternarPapel = meuPapelReal === 'owner';
  const groups = [...new Set(STEPS.map(s=>s.group))];
  return `
  <aside class="sidebar">
    <div class="brand">
      ${compassSVG()}
      <div>
        <div class="brand-name">NORTE</div>
        <div class="brand-sub">Instituto INETRIS</div>
      </div>
      <button class="menu-hamburguer" onclick="_menuMobileAberto=!_menuMobileAberto; render();" aria-label="Abrir menu">
        ${_menuMobileAberto ? '✕' : '☰'}
      </button>
    </div>

    <div class="sidebar-nav-content ${_menuMobileAberto ? 'aberto' : ''}">
      <div class="role-switcher">
        <div class="role-label">${podeAlternarPapel ? 'Ver como (pré-visualização)' : 'Seu papel'}</div>
        ${podeAlternarPapel
          ? roles.map(r=>`
              <button class="role-btn ${state.role===r.id?'active':''}" onclick="setRole('${r.id}')">
                <span class="dot"></span>${r.label}
              </button>
            `).join('')
          : `<div class="role-btn active" style="cursor:default;"><span class="dot"></span>${roles.find(r=>r.id===state.role)?.label || state.role}</div>`
        }
      </div>

      <nav class="steps">
        ${groups.map(g=>`
          <div class="step-group-label">${g}</div>
          ${STEPS.filter(s=>s.group===g).map(s=>{
            const unlocked = stepUnlocked(s.id);
            const idx = STEPS.indexOf(s)+1;
            const clickAction = unlocked ? ("goto('"+s.id+"')") : ("showToast('Complete a etapa anterior primeiro — o NORTE não permite pular passos.')");
            return `<button class="step-btn ${state.route===s.id?'active':''} ${unlocked?'':'locked'}"
              onclick="${clickAction}">
              <span class="num">${String(idx).padStart(2,'0')}</span>${s.label}
            </button>`;
          }).join('')}
        `).join('')}
      </nav>

      <button class="step-btn" style="margin-top:8px;opacity:.75;" onclick="sair()">
        <span class="num">⏻</span>Sair
      </button>

      <div class="footer-note">
        “Desempenho se mede.<br>Nível se constrói.”<br>
        <span style="opacity:.7">— Metodologia NORTE, Leilane Mendes</span>
      </div>
    </div>
  </aside>`;
}

function setRole(r){ state.role = r; _menuMobileAberto = false; render(); }
function goto(id){
  if(!STEPS.find(s=>s.id===id)){ showToast('Você não tem acesso a essa área.'); return; }
  state.route = id;
  _menuMobileAberto = false;
  if(id === 'usuarios') carregarUsuarios();
  render();
}

/* ---------- Usuários & Acesso ---------- */
