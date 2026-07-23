/* =========================================================
   MÓDULO CONFIGURAÇÕES (4.14)
   ========================================================= */

function pageConfiguracoes(){
  const c = state.configuracoes || {};
  const iv = c.identidadeVisual || {};
  return `
    <div class="page-head">
      <div class="eyebrow">Base do sistema</div>
      <h1>Configurações</h1>
      <p class="page-desc">Parametrizações do tenant — só o Administrador acessa esta tela.</p>
    </div>

    <div class="card">
      <h3>Ciclo de Avaliação</h3>
      <div class="field"><label>Periodicidade padrão do ciclo</label>
        <select id="cfg_periodicidade">
          ${['Anual','Semestral','Trimestral'].map(v=>`<option value="${v}" ${c.periodicidadeCiclo===v?'selected':''}>${v}</option>`).join('')}
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
        <input type="checkbox" id="cfg_lembretes" ${c.notificacoes?.lembretesPrazo?'checked':''}>
        Mostrar lembretes visuais de prazo (D-5, D-2, D-0) nas telas de avaliação
      </label>
      <p class="small-muted" style="margin-top:8px;">Nota: são lembretes visuais, exibidos quando alguém abre a tela — não são e-mails/push reais (isso exigiria um servidor com fila de notificações, que este projeto ainda não tem).</p>
    </div>

    <div class="card">
      <h3>Identidade visual em relatórios exportados</h3>
      <div class="field"><label>Logotipo</label>${logoUploadWidgetHTML('cfg_logo', iv.logoUrl||'')}</div>
      <p class="small-muted" style="margin-top:4px;">O logotipo aparece no topo dos PDFs exportados quando definido por <b>Colar imagem</b> ou <b>Enviar arquivo</b>. Um link (URL) externo funciona para exibição na tela, mas o navegador não consegue embuti-lo no PDF de forma confiável (limitação de CORS) — nesse caso o PDF sai sem o logotipo.</p>
      <div class="grid2" style="margin-top:12px;">
        <div class="field"><label>Cor primária</label><input id="cfg_cor1" type="color" value="${iv.corPrimaria||'#0a2647'}"></div>
        <div class="field"><label>Cor secundária</label><input id="cfg_cor2" type="color" value="${iv.corSecundaria||'#e99610'}"></div>
      </div>
    </div>

    <div class="card">
      <h3>Permissões (RNF002) <small>Exceções ao modelo padrão de papéis, concedidas caso a caso pelo Administrador</small></h3>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;padding:6px 0;">
        <input type="checkbox" id="cfg_perm_gestor_ciclo" ${c.permissoesExtras?.gestorAbreCiclo?'checked':''}>
        Permitir que Gestores abram novos ciclos de avaliação (padrão: só Dono/RH)
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;padding:6px 0;">
        <input type="checkbox" id="cfg_perm_gestor_desenho" ${c.permissoesExtras?.gestorPublicaDesenho?'checked':''}>
        Permitir que Gestores acessem Base de Cargos e Desenho de Cargo (padrão: só Dono/RH)
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;padding:6px 0;">
        <input type="checkbox" id="cfg_perm_rh_empresa" ${c.permissoesExtras?.rhCadastraEmpresa?'checked':''}>
        Permitir que RH acesse o Cadastro da Empresa (padrão: só Dono)
      </label>
      <div class="notice">Estas exceções afetam só o que está listado aqui. As demais regras (ex: quem avalia, quem aprova PDI) continuam fixas pela metodologia.</div>
    </div>

    <button class="btn btn-primary" onclick="salvarConfiguracoes()">Salvar configurações</button>
  `;
}

function salvarConfiguracoes(){
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
  showToast('Configurações salvas.');
  render();
}
