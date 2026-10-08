/* =========================================================
   R&S — BANCO DE TALENTOS
   -----------------------------------------------------------
   Candidatos que, ao se candidatar, marcaram "aceito ficar disponível no
   banco de talentos para futuras vagas compatíveis". Só Administrador e RH
   veem (o servidor confere o papel e filtra pela empresa).

   Regras de privacidade (LGPD) embutidas:
   - só entra quem autorizou; a mesma pessoa aparece UMA vez, mesmo tendo
     se candidatado a várias vagas;
   - fica por um prazo (BANCO_TALENTOS_MESES no servidor — o mesmo número do
     formulário e da Política de Privacidade) e depois sai sozinho;
   - dá pra remover a qualquer momento (inclusive a pedido do candidato);
   - o currículo só abre por link temporário (10 min), e cada abertura e
     cada remoção ficam na Auditoria.

   O começo do arquivo são funções PURAS (sem tela), testadas.
   ========================================================= */

function talentoNormalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Filtra a lista: todas as palavras da busca precisam aparecer (nome, contato,
// cidade, experiência, vaga de origem, LinkedIn); selects e caixas refinam.
function talentosFiltrar(lista, filtros) {
  const f = filtros || {};
  const palavras = talentoNormalizar(f.busca).split(/\s+/).filter(Boolean);
  return (lista || []).filter((t) => {
    const p = t.perfil || {};
    if (f.formacao && p.formacaoSuperior !== f.formacao) return false;
    if (f.disponibilidade && p.disponibilidadeHorarios !== f.disponibilidade) return false;
    if (f.moto && !p.possuiMoto) return false;
    if (f.notebook && !p.possuiNotebook) return false;
    if (!palavras.length) return true;
    const palheiro = talentoNormalizar(
      [t.nome, t.email, t.telefone, p.cidadeAtual, p.experienciaAnteriorFuncao, p.linkedin, t.vagaTitulo].join(' ')
    );
    return palavras.every((w) => palheiro.includes(w));
  });
}

// Dias até a pessoa sair do banco (negativo = já deveria ter saído).
function talentoDiasParaExpirar(expiraEm, agora = new Date()) {
  return Math.ceil((new Date(expiraEm).getTime() - agora.getTime()) / 86400000);
}

/* ---------- Estado e carregamento ---------- */

let _talentos = [];
let _talentosCarregados = false;
let _talentosCarregando = false;
let _talentosPrazoMeses = 24;
let _talentosErro = '';
let _talFiltros = { busca: '', formacao: '', disponibilidade: '', moto: false, notebook: false };
let _talPerfilAberto = null; // chave (e-mail) da pessoa com o perfil aberto

async function carregarTalentos() {
  if (_talentosCarregando) return;
  _talentosCarregando = true;
  _talentosErro = '';
  const { data, error } = await sb.functions.invoke('rs', { body: { action: 'listar_banco_talentos' } });
  if (error || !data || data.error) {
    _talentosErro = await mensagemDeErroFuncao(error, data, 'Não foi possível carregar o banco de talentos agora.');
    _talentos = [];
  } else {
    _talentos = data.talentos || [];
    _talentosPrazoMeses = data.prazoMeses || _talentosPrazoMeses;
  }
  _talentosCarregando = false;
  _talentosCarregados = true;
  render();
}

function talentoPorChave(chave) {
  return _talentos.find((t) => t.chave === chave);
}

/* ---------- Ações ---------- */

function talentoBuscar(valor) {
  _talFiltros.busca = valor;
  talentoAtualizarLista();
}
function talentoFiltro(campo, valor) {
  _talFiltros[campo] = valor;
  talentoAtualizarLista();
}
function talentoAlternarPerfil(chave) {
  _talPerfilAberto = _talPerfilAberto === chave ? null : chave;
  talentoAtualizarLista();
}

// Atualiza só a lista (sem refazer a tela) pra o cursor não sair do campo de busca.
function talentoAtualizarLista() {
  const caixa = document.getElementById('tal_lista');
  if (caixa) caixa.innerHTML = talentosListaHtml();
  const contagem = document.getElementById('tal_contagem');
  if (contagem) contagem.textContent = talentosContagemTexto();
}

async function talentoCurriculo(chave) {
  const t = talentoPorChave(chave);
  if (!t || !t.idCurriculo) return;
  const { data, error } = await sb.functions.invoke('rs', { body: { action: 'curriculo_talento', id: t.idCurriculo } });
  if (error || !data || !data.url) {
    showToast(await mensagemDeErroFuncao(error, data, 'Não foi possível abrir o currículo agora.'));
    return;
  }
  registrarAuditoria('rs.talento_curriculo_acessado', { talentoId: t.idCurriculo });
  window.open(data.url, '_blank', 'noopener');
}

async function talentoRemover(chave) {
  const t = talentoPorChave(chave);
  if (!t) return;
  // Texto puro numa caixa do navegador (não interpreta HTML) — por isso o nome entra sem escape.
  const nomeParaConfirmar = t.nome;
  const aviso = `Remover ${nomeParaConfirmar} do banco de talentos?\n\nA pessoa deixa de aparecer aqui para futuras vagas. A candidatura original continua no histórico.`;
  if (!confirm(aviso)) return;
  const { data, error } = await sb.functions.invoke('rs', { body: { action: 'remover_talentos', ids: t.ids } });
  if (error || !data || data.error) {
    showToast(await mensagemDeErroFuncao(error, data, 'Não foi possível remover agora.'));
    return;
  }
  registrarAuditoria('rs.talento_removido', { quantidade: t.ids.length });
  showToast('Removido do banco de talentos.');
  _talPerfilAberto = null;
  _talentosCarregados = false;
  render();
}

/* ---------- Renderização ---------- */

function talentosContagemTexto() {
  const mostrados = talentosFiltrar(_talentos, _talFiltros).length;
  return mostrados === _talentos.length
    ? `${_talentos.length} pessoa(s)`
    : `${mostrados} de ${_talentos.length} pessoa(s)`;
}

function talentoPerfilHtml(t) {
  const p = t.perfil || {};
  const linkedin = /^https?:\/\//i.test(p.linkedin || '')
    ? `<a href="${escaparHtml(p.linkedin)}" target="_blank" rel="noopener noreferrer">${escaparHtml(p.linkedin)}</a>`
    : escaparHtml(p.linkedin || '—');
  const linhas = [
    ['Cidade atual', escaparHtml(p.cidadeAtual || '—')],
    ['Formação superior', escaparHtml(RS_LABEL_FORMACAO[p.formacaoSuperior] || '—')],
    ['Disponibilidade', escaparHtml(RS_LABEL_DISPONIBILIDADE[p.disponibilidadeHorarios] || '—')],
    [
      'Possui',
      escaparHtml(
        [p.possuiMoto && 'Moto', p.possuiNotebook && 'Notebook', p.possuiSmartphone && 'Smartphone']
          .filter(Boolean)
          .join(', ') || 'Nenhum informado'
      ),
    ],
    ['Intimidade com tecnologia', escaparHtml(RS_LABEL_NIVEL[p.intimidadeTecnologia] || '—')],
    [
      'Excel / Word / PowerPoint',
      escaparHtml(
        `${RS_LABEL_NIVEL[p.conhecimentoExcel] || '—'} / ${RS_LABEL_NIVEL[p.conhecimentoWord] || '—'} / ${RS_LABEL_NIVEL[p.conhecimentoPowerpoint] || '—'}`
      ),
    ],
    ['LinkedIn', linkedin],
  ];
  if (p.experienciaAnteriorFuncao) linhas.push(['Experiência anterior', escaparHtml(p.experienciaAnteriorFuncao)]);
  return `<div class="card" style="margin-top:10px;font-size:12.5px;">
    ${linhas.map(([rotulo, valor]) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:1px solid var(--line);"><span class="small-muted">${rotulo}</span><span style="text-align:right;">${valor}</span></div>`).join('')}
  </div>`;
}

function talentosListaHtml() {
  const lista = talentosFiltrar(_talentos, _talFiltros);
  if (!_talentos.length)
    return '<div class="empty">Nenhum candidato no banco de talentos ainda. Entram aqui os candidatos que marcarem a autorização ao se candidatar pela página pública da vaga.</div>';
  if (!lista.length) return '<div class="empty">Nenhuma pessoa corresponde aos filtros.</div>';
  return lista
    .map((t) => {
      const p = t.perfil || {};
      const dias = talentoDiasParaExpirar(t.expiraEm);
      const expira = `${new Date(t.expiraEm).toLocaleDateString('pt-BR')}${dias <= 60 ? ` · <span style="color:var(--desenvolver);">faltam ${Math.max(dias, 0)} dia(s)</span>` : ''}`;
      const chave = escaparParaOnclick(t.chave);
      return `<div class="card" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-size:15px;font-weight:600;">${escaparHtml(t.nome)}</div>
            <div class="small-muted" style="margin-top:2px;">
              <a href="mailto:${escaparHtml(t.email)}">${escaparHtml(t.email)}</a>${t.telefone ? ` · ${escaparHtml(t.telefone)}` : ''}
            </div>
            <div class="small-muted" style="margin-top:4px;font-size:12.5px;">
              ${[p.cidadeAtual && `📍 ${escaparHtml(p.cidadeAtual)}`, p.formacaoSuperior && `🎓 ${escaparHtml(RS_LABEL_FORMACAO[p.formacaoSuperior] || '')}`, p.disponibilidadeHorarios && `🕘 ${escaparHtml(RS_LABEL_DISPONIBILIDADE[p.disponibilidadeHorarios] || '')}`].filter(Boolean).join(' · ') || 'Sem perfil detalhado'}
            </div>
            <div class="small-muted" style="margin-top:4px;font-size:12px;">
              ${t.vagaTitulo ? `Veio da vaga: ${escaparHtml(t.vagaTitulo)} · ` : ''}entrou em ${new Date(t.entrouEm).toLocaleDateString('pt-BR')}${t.candidaturas > 1 ? ` (${t.candidaturas} candidaturas)` : ''} · fica até ${expira}
            </div>
          </div>
          <div style="display:flex;gap:6px;align-items:flex-start;flex-wrap:wrap;">
            ${t.temCurriculo ? `<button class="btn btn-sm btn-primary" onclick="talentoCurriculo('${chave}')">Currículo</button>` : ''}
            <button class="btn btn-sm btn-ghost" onclick="talentoAlternarPerfil('${chave}')">${_talPerfilAberto === t.chave ? 'Ocultar perfil' : 'Ver perfil'}</button>
            <button class="btn btn-sm btn-ghost" style="color:var(--iniciar);" onclick="talentoRemover('${chave}')">Remover</button>
          </div>
        </div>
        ${_talPerfilAberto === t.chave ? talentoPerfilHtml(t) : ''}
      </div>`;
    })
    .join('');
}

function pageBancoTalentos() {
  if (!_talentosCarregados && !_talentosCarregando) carregarTalentos();
  const opcoes = (mapa, atual) =>
    Object.entries(mapa)
      .map(([v, rotulo]) => `<option value="${v}" ${atual === v ? 'selected' : ''}>${escaparHtml(rotulo)}</option>`)
      .join('');
  return `
    <div class="page-head">
      <div class="eyebrow">Pessoas</div>
      <h1>R&S — Banco de talentos</h1>
      <p class="page-desc">Candidatos que autorizaram ficar disponíveis para futuras vagas compatíveis. Consulte aqui antes de abrir uma nova divulgação.</p>
      <div class="notice info" style="margin-top:10px;">🔒 Só entra quem marcou a autorização. Cada pessoa fica por até <b>${_talentosPrazoMeses} meses</b> a partir da autorização mais recente e depois sai sozinha. Você pode remover alguém a qualquer momento (inclusive a pedido do candidato). A abertura de currículos e as remoções ficam registradas na Auditoria.</div>
    </div>

    <div class="card">
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
        <div class="field" style="margin:0;flex:1;min-width:220px;"><label>Buscar</label><input type="text" value="${escaparHtml(_talFiltros.busca)}" placeholder="Nome, cidade, experiência, vaga…" oninput="talentoBuscar(this.value)"></div>
        <div class="field" style="margin:0;"><label>Formação superior</label><select onchange="talentoFiltro('formacao', this.value)"><option value="">Todas</option>${opcoes({ nao_possui: RS_LABEL_FORMACAO.nao_possui, cursando: RS_LABEL_FORMACAO.cursando, completo: RS_LABEL_FORMACAO.completo }, _talFiltros.formacao)}</select></div>
        <div class="field" style="margin:0;"><label>Disponibilidade</label><select onchange="talentoFiltro('disponibilidade', this.value)"><option value="">Todas</option>${opcoes(RS_LABEL_DISPONIBILIDADE, _talFiltros.disponibilidade)}</select></div>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;"><input type="checkbox" ${_talFiltros.moto ? 'checked' : ''} onchange="talentoFiltro('moto', this.checked)"> Tem moto</label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;"><input type="checkbox" ${_talFiltros.notebook ? 'checked' : ''} onchange="talentoFiltro('notebook', this.checked)"> Tem notebook</label>
        <span class="small-muted" id="tal_contagem" style="margin-left:auto;">${talentosContagemTexto()}</span>
      </div>
    </div>

    ${_talentosErro ? `<div class="card" style="border-left:3px solid var(--iniciar);">${escaparHtml(_talentosErro)} <button class="btn btn-sm btn-ghost" onclick="_talentosCarregados=false;render();">Tentar de novo</button></div>` : ''}
    ${!_talentosCarregados && !_talentosErro ? '<div class="empty">Carregando…</div>' : `<div id="tal_lista">${talentosListaHtml()}</div>`}
  `;
}
