/* =========================================================
   MÓDULO CONFIGURAÇÕES (4.14)
   ========================================================= */

// Espelho local das configurações de segurança do ponto (moram na Edge
// Function, não no state). Carregado ao abrir a tela.
let _segurancaPontoUI = { exigeQr: false, exigeSelfie: false };
let _segurancaPontoCarregada = false;

async function carregarSegurancaPonto() {
  const { data, error } = await sb.functions.invoke('ponto', { body: { action: 'seguranca_ler' } });
  if (!error && data && !data.error) {
    _segurancaPontoUI = { exigeQr: !!data.exigeQr, exigeSelfie: !!data.exigeSelfie };
    render();
  }
}

async function salvarSegurancaPonto() {
  const exigeQr = document.getElementById('cfg_ponto_qr').checked;
  const exigeSelfie = document.getElementById('cfg_ponto_selfie').checked;
  const { data, error } = await sb.functions.invoke('ponto', {
    body: { action: 'seguranca_salvar', exigeQr, exigeSelfie },
  });
  if (error || data?.error) {
    showToast((data && data.error) || 'Não foi possível salvar.');
    return;
  }
  _segurancaPontoUI = { exigeQr, exigeSelfie };
  showToast('Segurança do ponto atualizada.');
}

function pageConfiguracoes() {
  // Carrega as configs de segurança uma vez ao abrir a tela.
  if (pontoHabilitado && !_segurancaPontoCarregada) {
    _segurancaPontoCarregada = true;
    carregarSegurancaPonto();
  }
  const c = state.configuracoes || {};
  const iv = c.identidadeVisual || {};
  return `
    <div class="page-head">
      <div class="eyebrow">Base do sistema</div>
      <h1>Configurações</h1>
      <p class="page-desc">Parametrizações do tenant — só o Administrador acessa esta tela.</p>
    </div>

    ${
      pontoHabilitado
        ? `
    <div class="card">
      <h3>Segurança do Ponto</h3>
      <p class="page-desc" style="margin-bottom:12px;">Controle onde e como os colaboradores podem bater o ponto. As configurações abaixo valem para toda a empresa.</p>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:10px;">
        <input type="checkbox" id="cfg_ponto_qr" ${_segurancaPontoUI.exigeQr ? 'checked' : ''}>
        Exigir escanear o <b>QR Code do local</b> para bater o ponto
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:12px;">
        <input type="checkbox" id="cfg_ponto_selfie" ${_segurancaPontoUI.exigeSelfie ? 'checked' : ''}>
        Exigir <b>selfie</b> no momento da batida
      </label>
      <button class="btn btn-primary" onclick="salvarSegurancaPonto()">Salvar segurança do ponto</button>
      <div class="notice info" style="margin-top:12px;">Com o QR ligado, deixe a tela <b>Totem de ponto</b> aberta na entrada da empresa. A selfie fica registrada junto de cada batida para conferência do RH (atenção à LGPD ao usar imagens).</div>
    </div>
    `
        : ''
    }

    <div class="card">
      <h3>Ciclo de Avaliação</h3>
      <div class="field"><label>Periodicidade padrão do ciclo</label>
        <select id="cfg_periodicidade">
          ${['Anual', 'Semestral', 'Trimestral'].map((v) => `<option value="${v}" ${c.periodicidadeCiclo === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="notice">Avaliadores e pesos: Colaborador 25% / Líder Direto 50% / RH 25% — fixo conforme RN003 do PRD (Documento 04), sem exceção configurável.</div>
    </div>

    <div class="card">
      <h3>Escala IDA <small>Faixas de corte — definidas pela metodologia, não editáveis pelo cliente</small></h3>
      <table>
        <thead><tr><th>Classificação</th><th>Faixa (média ponderada)</th></tr></thead>
        <tbody>
          <tr><td><span class="pill pill-iniciar">Iniciar</span></td><td class="small-muted">0,00 a 0,33</td></tr>
          <tr><td><span class="pill pill-desenvolver">Desenvolver</span></td><td class="small-muted">0,34 a 0,66</td></tr>
          <tr><td><span class="pill pill-alavancar">Alavancar</span></td><td class="small-muted">0,67 a 1,00</td></tr>
        </tbody>
      </table>
      <div class="notice">RN007/RN031 (PRD): estas faixas são definidas pela metodologia e a relação Pilar → Dimensão é fixa — não configuráveis pelo cliente — por isso aparecem aqui só como consulta, sem opção de edição.</div>
    </div>

    <div class="card">
      <h3>Notificações</h3>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
        <input type="checkbox" id="cfg_lembretes" ${c.notificacoes?.lembretesPrazo ? 'checked' : ''}>
        Mostrar lembretes visuais de prazo (D-5, D-2, D-0) nas telas de avaliação
      </label>
      <p class="small-muted" style="margin-top:8px;">Nota: são lembretes visuais, exibidos quando alguém abre a tela — não são e-mails/push reais (isso exigiria um servidor com fila de notificações, que este projeto ainda não tem).</p>
    </div>

    <div class="card">
      <h3>Identidade visual <small>Cores aparecem na interface do sistema e nos relatórios exportados</small></h3>
      <div class="field"><label>Logotipo</label>${logoUploadWidgetHTML('cfg_logo', iv.logoUrl || '')}</div>
      <p class="small-muted" style="margin-top:4px;">O logotipo aparece no topo dos PDFs exportados quando definido por <b>Colar imagem</b> ou <b>Enviar arquivo</b>. Um link (URL) externo funciona para exibição na tela, mas o navegador não consegue embuti-lo no PDF de forma confiável (limitação de CORS) — nesse caso o PDF sai sem o logotipo.</p>
      <div class="grid2" style="margin-top:12px;">
        <div class="field"><label>Cor primária</label><input id="cfg_cor1" type="color" value="${iv.corPrimaria || '#2563eb'}"></div>
        <div class="field"><label>Cor secundária</label><input id="cfg_cor2" type="color" value="${iv.corSecundaria || '#0d1b33'}"></div>
      </div>
    </div>

    <div class="card">
      <h3>Permissões (RNF002) <small>Exceções ao modelo padrão de papéis, concedidas caso a caso pelo Administrador</small></h3>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;padding:6px 0;">
        <input type="checkbox" id="cfg_perm_gestor_ciclo" ${c.permissoesExtras?.gestorAbreCiclo ? 'checked' : ''}>
        Permitir que Gestores abram novos ciclos de avaliação (padrão: só Dono/RH)
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;padding:6px 0;">
        <input type="checkbox" id="cfg_perm_gestor_desenho" ${c.permissoesExtras?.gestorPublicaDesenho ? 'checked' : ''}>
        Permitir que Gestores acessem Base de Cargos e Desenho de Cargo (padrão: só Dono/RH)
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;padding:6px 0;">
        <input type="checkbox" id="cfg_perm_rh_empresa" ${c.permissoesExtras?.rhCadastraEmpresa ? 'checked' : ''}>
        Permitir que RH acesse o Cadastro da Empresa (padrão: só Dono)
      </label>
      <div class="notice">Estas exceções afetam só o que está listado aqui. As demais regras (ex: quem avalia, quem aprova PDI) continuam fixas pela metodologia.</div>
    </div>

    <button class="btn btn-primary" onclick="salvarConfiguracoes()">Salvar configurações</button>
  `;
}

function salvarConfiguracoes() {
  state.configuracoes = {
    periodicidadeCiclo: document.getElementById('cfg_periodicidade').value,
    notificacoes: { lembretesPrazo: document.getElementById('cfg_lembretes').checked },
    identidadeVisual: {
      logoUrl: document.getElementById('cfg_logo').value,
      corPrimaria: document.getElementById('cfg_cor1').value,
      corSecundaria: document.getElementById('cfg_cor2').value,
    },
    permissoesExtras: {
      gestorAbreCiclo: document.getElementById('cfg_perm_gestor_ciclo').checked,
      gestorPublicaDesenho: document.getElementById('cfg_perm_gestor_desenho').checked,
      rhCadastraEmpresa: document.getElementById('cfg_perm_rh_empresa').checked,
    },
  };
  registrarAuditoria('configuracoes.atualizadas', { ...state.configuracoes });
  aplicarTemaCoresInterface(state.configuracoes.identidadeVisual.corPrimaria);
  showToast('Configurações salvas. As cores da interface já foram atualizadas.');
  render();
}
