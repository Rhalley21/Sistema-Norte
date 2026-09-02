const STEPS_BASE = [
  { id: 'empresa', label: 'Cadastro da Empresa', group: 'Fundação', papeis: ['owner'] },
  { id: 'estrutura', label: 'Estrutura Organizacional', group: 'Fundação', papeis: ['owner', 'rh'] },
  { id: 'cultura', label: 'Cultura Organizacional', group: 'Fundação', papeis: ['owner', 'rh'] },
  { id: 'usuarios', label: 'Usuários & Acesso', group: 'Fundação', papeis: ['owner', 'rh'] },
  { id: 'cargos', label: 'Base de Cargos (CBO)', group: 'Cargos', papeis: ['owner', 'rh'] },
  { id: 'desenho', label: 'Desenho de Cargo', group: 'Cargos', papeis: ['owner', 'rh'] },
  { id: 'colaboradores', label: 'Colaboradores', group: 'Pessoas', papeis: ['owner', 'rh', 'lider'] },
  { id: 'ponto', label: 'Ponto', group: 'Pessoas', apenasSePontoHabilitado: true }, // liga/desliga por Empresa (Super Admin decide ao gerar a licença). Sem `papeis`: quando ligado, todo mundo bate o próprio ponto.
  {
    id: 'totem_ponto',
    label: 'Totem de ponto',
    group: 'Pessoas',
    papeis: ['owner'],
    apenasSePontoHabilitado: true,
  }, // tela do QR pra deixar na entrada — só o Administrador (owner)
  { id: 'clima', label: 'Pesquisa de Clima / eNPS', group: 'Pessoas' },
  { id: 'sucessao', label: 'Mapa de Sucessão', group: 'Pessoas', papeis: ['owner', 'rh'] },
  { id: 'ciclos', label: 'Ciclos de Avaliação', group: 'Ciclo NORTE' },
  { id: 'diagnostico', label: 'Diagnóstico & PDI', group: 'Ciclo NORTE' },
  { id: 'inteligencia', label: 'Banco de Inteligência', group: 'Base', papeis: ['owner', 'rh'] },
  { id: 'relatorios', label: 'Relatórios', group: 'Base', papeis: ['owner', 'rh'] },
  { id: 'webhooks', label: 'Webhooks (integrações)', group: 'Base', papeis: ['owner', 'rh'] },
  { id: 'configuracoes', label: 'Configurações', group: 'Base', papeis: ['owner'] },
  { id: 'pagamento', label: 'Pagamento', group: 'Base', papeis: ['owner'] }, // assinatura/mensalidade — só o Administrador da empresa
  { id: 'auditoria', label: 'Auditoria', group: 'Base', papeis: ['owner', 'rh'] },
  { id: 'dashboard_role', label: 'Dashboards', group: 'Base' },
  // Só visível pra quem é Super Admin da PLATAFORMA (dono do NORTE) — não
  // tem relação com o papel dentro de uma Empresa (owner/rh/lider/colaborador).
  { id: 'super_admin', label: 'Super Admin — Empresas', group: 'Plataforma', apenasSuperAdmin: true },
];
function stepsVisiveis() {
  const perm = state.configuracoes?.permissoesExtras || {};
  return STEPS_BASE.filter((s) => {
    if (s.apenasSuperAdmin) return souSuperAdmin;
    if (s.apenasSePontoHabilitado && !pontoHabilitado) return false;
    if (!s.papeis) return true;
    if (s.papeis.includes(meuPapelReal)) return true;
    // RNF002 — exceções configuráveis pelo Administrador
    if (s.id === 'desenho' && meuPapelReal === 'lider' && perm.gestorPublicaDesenho) return true;
    if (s.id === 'cargos' && meuPapelReal === 'lider' && perm.gestorPublicaDesenho) return true;
    if (s.id === 'empresa' && meuPapelReal === 'rh' && perm.rhCadastraEmpresa) return true;
    return false;
  });
}
Object.defineProperty(window, 'STEPS', { get: stepsVisiveis });

function stepUnlocked(id) {
  switch (id) {
    case 'empresa':
      return true;
    case 'estrutura':
      return state.empresa?.estado === 'Ativa';
    case 'cultura':
      return state.estrutura.length > 0;
    case 'usuarios':
      return true;
    case 'cargos':
      return !!state.cultura.missao;
    case 'desenho':
      return state.cargos.length > 0;
    case 'colaboradores':
      return state.cargos.some((c) => c.desenho.aprovado && !c.descontinuado);
    case 'ponto':
      return true;
    case 'totem_ponto':
      return true;
    case 'ciclos':
      return state.colaboradores.length > 0;
    case 'diagnostico':
      return state.ciclos.length > 0;
    case 'inteligencia':
      return true;
    case 'relatorios':
      return true;
    case 'configuracoes':
      return true;
    case 'pagamento':
      return true;
    case 'dashboard_role':
      return true;
    case 'super_admin':
      return true;
    case 'auditoria':
      return true;
    default:
      return true;
  }
}

/* ---------- Render root ---------- */
let _ultimaRotaRenderizada = null;
let _ultimoCicloAtivoRenderizado = undefined;
function render() {
  const app = document.getElementById('app');
  app.innerHTML = `
    ${renderSidebar()}
    <main>${renderRoute()}</main>
  `;
  // BUG CORRIGIDO: antes, TODA chamada de render() forçava a rolagem pro
  // topo da página — inclusive ações simples dentro da mesma tela (ex.:
  // marcar uma nota Iniciar/Desenvolver/Alavancar numa avaliação longa),
  // fazendo a pessoa perder a posição e ter que rolar de novo a cada clique.
  // Agora só rola pro topo quando a pessoa realmente muda de tela (rota) ou
  // abre/fecha um ciclo — nunca por causa de uma interação dentro da mesma tela.
  const mudouDeTela = state.route !== _ultimaRotaRenderizada || state.cicloAtivo !== _ultimoCicloAtivoRenderizado;
  if (mudouDeTela) window.scrollTo(0, 0);
  _ultimaRotaRenderizada = state.route;
  _ultimoCicloAtivoRenderizado = state.cicloAtivo;
  agendarSalvamento();
  aplicarMarcaDagua();
  // Gráficos (Chart.js) precisam ser montados depois do HTML já estar na
  // tela — inicializarGraficosDashboard() sozinha detecta se os canvas
  // existem (só quando estamos no dashboard do Administrador) e não faz
  // nada nas outras telas.
  inicializarGraficosDashboard();
}

function logoEmpresaAtual() {
  return state.configuracoes?.identidadeVisual?.logoUrl || state.empresa?.logotipo || '';
}
// Atualiza o logo/nome do menu lateral na hora, sem precisar de um render()
// completo da página (que apagaria campos ainda não salvos em outros
// formulários abertos ao mesmo tempo). Chamada sempre que o logotipo muda
// (definido ou removido), em qualquer uma das duas telas que o editam.
function atualizarLogoSidebarAoVivo() {
  const img = document.getElementById('sidebar-logo-img');
  const nome = document.getElementById('sidebar-brand-name');
  const sub = document.getElementById('sidebar-brand-sub');
  const logo = logoEmpresaAtual();
  if (img) img.src = logo || `data:image/png;base64,${LOGO_INETRIS_B64}`;
  if (nome) nome.textContent = logo && state.empresa?.nomeFantasia ? state.empresa.nomeFantasia : 'INETRIS';
  if (sub) sub.textContent = logo ? 'Metodologia NORTE' : 'Sistema de Avaliação e Desempenho';
}
function compassSVG() {
  const stageIdx = STEPS.findIndex((s) => s.id === state.route);
  const total = STEPS.length || 1;
  const progresso = stageIdx >= 0 ? Math.round(((stageIdx + 1) / total) * 100) : 0;
  const logoEmpresa = logoEmpresaAtual();
  if (logoEmpresa) {
    return `
    <div class="compass-wrap" title="Ciclo NORTE — ${progresso}% navegado">
      <img id="sidebar-logo-img" src="${logoEmpresa}" alt="Logotipo da empresa" style="width:100%;height:100%;object-fit:contain;background:#fff;border-radius:6px;" />
    </div>`;
  }
  return `
  <div class="compass-wrap" title="Ciclo NORTE — ${progresso}% navegado">
    <img id="sidebar-logo-img" src="data:image/png;base64,${LOGO_INETRIS_B64}" alt="Instituto INETRIS" style="width:100%;height:100%;object-fit:contain;" />
  </div>`;
}

let _menuMobileAberto = false;
// Grupos do menu que estão expandidos — por padrão, nenhum (só os nomes
// principais aparecem); o grupo que contém a rota atual abre automático,
// pra pessoa não perder onde está ao navegar.
let _gruposExpandidos = new Set();
let _gruposFechadosManualmente = new Set(); // grupos que o usuário fechou de propósito
function toggleGrupoMenu(nome) {
  // Um grupo aparece aberto quando está em _gruposExpandidos OU contém a rota
  // ativa. Por isso, pra FECHAR um grupo que contém a rota ativa, não basta
  // tirar de _gruposExpandidos — precisamos marcar que foi fechado de
  // propósito. Este toggle decide com base no estado VISÍVEL atual.
  const itensDoGrupo = STEPS.filter((s) => s.group === nome);
  const temRotaAtiva = itensDoGrupo.some((s) => s.id === state.route);
  const estaVisivelmenteAberto = (_gruposExpandidos.has(nome) || temRotaAtiva) && !_gruposFechadosManualmente.has(nome);

  if (estaVisivelmenteAberto) {
    _gruposExpandidos.delete(nome);
    _gruposFechadosManualmente.add(nome);
  } else {
    _gruposExpandidos.add(nome);
    _gruposFechadosManualmente.delete(nome);
  }
  render();
}

function renderSidebar() {
  const roles = [
    { id: 'admin', label: 'Administrador' },
    { id: 'rh', label: 'RH' },
    { id: 'gestor', label: 'Gestor' },
    { id: 'colaborador', label: 'Colaborador' },
  ];
  const podeAlternarPapel = meuPapelReal === 'owner';
  const groups = [...new Set(STEPS.map((s) => s.group))];
  return `
  <aside class="sidebar">
    <div class="brand">
      ${compassSVG()}
      <div>
        <div class="brand-name" id="sidebar-brand-name">${logoEmpresaAtual() && state.empresa?.nomeFantasia ? escaparHtml(state.empresa.nomeFantasia) : 'INETRIS'}</div>
        <div class="brand-sub" id="sidebar-brand-sub">${logoEmpresaAtual() ? 'Metodologia NORTE' : 'Sistema de Avaliação e Desempenho'}</div>
      </div>
      ${renderSinoNotificacoes()}
      <button class="menu-hamburguer" onclick="_menuMobileAberto=!_menuMobileAberto; render();" aria-label="Abrir menu">
        ${_menuMobileAberto ? '✕' : '☰'}
      </button>
    </div>

    <div class="sidebar-nav-content ${_menuMobileAberto ? 'aberto' : ''}">
      <div class="role-switcher">
        <div class="role-label">${podeAlternarPapel ? 'Ver como (pré-visualização)' : 'Seu papel'}</div>
        ${
          podeAlternarPapel
            ? `<select class="role-select" onchange="setRole(this.value)">
              ${roles.map((r) => `<option value="${r.id}" ${state.role === r.id ? 'selected' : ''}>${r.label}</option>`).join('')}
            </select>`
            : `<div class="role-btn active" style="cursor:default;"><span class="dot"></span>${roles.find((r) => r.id === state.role)?.label || state.role}</div>`
        }
      </div>

      <nav class="steps">
        ${groups
          .map((g) => {
            const itensDoGrupo = STEPS.filter((s) => s.group === g);
            const grupoTemRotaAtiva = itensDoGrupo.some((s) => s.id === state.route);
            const expandido = (_gruposExpandidos.has(g) || grupoTemRotaAtiva) && !_gruposFechadosManualmente.has(g);
            return `
          <button class="step-group-label step-group-toggle" onclick="toggleGrupoMenu('${g}')">
            <span class="step-group-chevron ${expandido ? 'aberto' : ''}">▸</span>${g}
          </button>
          ${
            expandido
              ? itensDoGrupo
                  .map((s) => {
                    const unlocked = stepUnlocked(s.id);
                    const idx = STEPS.indexOf(s) + 1;
                    const clickAction = unlocked
                      ? "goto('" + s.id + "')"
                      : "showToast('Complete a etapa anterior primeiro — o NORTE não permite pular passos.')";
                    return `<button class="step-btn ${state.route === s.id ? 'active' : ''} ${unlocked ? '' : 'locked'}"
              onclick="${clickAction}">
              <span class="num">${String(idx).padStart(2, '0')}</span>${s.label}
            </button>`;
                  })
                  .join('')
              : ''
          }
        `;
          })
          .join('')}
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

function setRole(r) {
  state.role = r;
  _menuMobileAberto = false;
  // BUG CORRIGIDO: trocar o "Ver como" só mudava o papel guardado, sem
  // levar pro Dashboard — se a pessoa estivesse em qualquer outra tela
  // (que não depende de state.role pra mudar de aparência), parecia que
  // nada tinha acontecido, mesmo a troca tendo funcionado por baixo dos
  // panos. Agora troca de papel e já mostra o Dashboard desse papel, sem
  // precisar clicar em mais nada.
  state.route = 'dashboard_role';
  render();
}
async function atualizarDadosAoVivo(silencioso) {
  // BUG CORRIGIDO: o sistema carregava os dados uma única vez, no login, e
  // nunca mais buscava atualização — sem sincronização em tempo real entre
  // usuários diferentes. Se o Líder enviasse a avaliação enquanto o RH já
  // estava com a tela aberta, o RH continuava vendo a versão antiga do
  // ciclo (ainda na etapa do Líder) até dar um F5 na página inteira.
  if (!silencioso) showToast('Atualizando dados…');
  await carregarEstado();
  esconderAvisoAtualizacao();
  render();
}
function goto(id) {
  if (!STEPS.find((s) => s.id === id)) {
    showToast('Você não tem acesso a essa área.');
    return;
  }
  state.route = id;
  _menuMobileAberto = false;
  // Se a pessoa navegou pra um item, o grupo dele deve aparecer aberto —
  // desfaz um eventual "fechado manualmente" desse grupo.
  const item = STEPS.find((s) => s.id === id);
  if (item) _gruposFechadosManualmente.delete(item.group);
  if (id === 'usuarios') carregarUsuarios();
  if (id === 'colaboradores') carregarUsuarios(); // usado pra detectar inconsistências (ver banner de "desligado mas com login ativo")
  if (id === 'auditoria') carregarUsuarios(); // usado pra resolver nome de quem fez cada evento
  if (id === 'ciclos') atualizarDadosAoVivo(true); // busca o estado mais recente sempre que entra na tela de Ciclos
  render();
}

/* ---------- Usuários & Acesso ---------- */
