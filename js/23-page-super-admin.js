/* =========================================================
   SUPER ADMIN — licenciamento de novas Empresas
   -----------------------------------------------------------
   Tela visível só pra quem está na tabela `super_admins` (o dono da
   plataforma NORTE — Instituto INETRIS). Diferente de tudo mais no
   sistema, aqui NÃO se trabalha com o `state` normal (que é sempre
   isolado por empresa_id) — as consultas aqui são feitas direto ao
   Supabase, sem passar pelo blob de estado de uma Empresa específica.
   ========================================================= */
let _superAdminCarregando = false;
let _superAdminJaCarregou = false; // BUG CORRIGIDO abaixo (ver pageSuperAdmin)
let _superAdminEmpresas = [];
let _superAdminCodigos = [];
let _superAdminMetricas = null;
let _superAdminPayloads = [];
let _superAdminNovoRotulo = '';
let _superAdminNovoPonto = false; // escolha sim/não do módulo Ponto pra empresa que usar este código

async function carregarDadosSuperAdmin() {
  _superAdminCarregando = true;
  render();
  const [
    { data: empresas, error: erroEmpresas },
    { data: codigos, error: erroCodigos },
    { data: payloads, error: erroPayloads },
  ] = await Promise.all([
    sb
      .from('empresas')
      .select('id, nome_fantasia, cnpj, acesso_suspenso, suspensa_em, created_at')
      .order('created_at', { ascending: false }),
    sb
      .from('codigos_licenca_empresa')
      .select('id, codigo, nome_empresa_sugerido, usado, empresa_id, criado_em, usado_em, ponto_habilitado')
      .order('criado_em', { ascending: false }),
    // Métricas agregadas: os dados operacionais de cada Empresa vivem dentro
    // do "payload" (blob JSON), não em tabelas separadas — por isso a
    // consulta é direto em dados_sistema. Precisa da política de leitura
    // nova (ver sql/13-metricas-super-admin.sql).
    sb.from('dados_sistema').select('empresa_id, payload, atualizado_em'),
  ]);
  if (erroEmpresas || erroCodigos || erroPayloads)
    showToast(
      'Não foi possível carregar os dados: ' + (erroEmpresas?.message || erroCodigos?.message || erroPayloads?.message)
    );
  _superAdminEmpresas = empresas || [];
  _superAdminCodigos = codigos || [];

  const listaPayloads = payloads || [];
  _superAdminPayloads = listaPayloads;
  _superAdminMetricas = {
    empresasAtivas: _superAdminEmpresas.filter((e) => !e.acesso_suspenso).length,
    empresasSuspensas: _superAdminEmpresas.filter((e) => e.acesso_suspenso).length,
    totalColaboradores: listaPayloads.reduce((soma, d) => soma + (d.payload?.colaboradores?.length || 0), 0),
    totalCiclosAbertos: listaPayloads.reduce(
      (soma, d) => soma + (d.payload?.ciclos?.filter((c) => c.estado !== 'Encerrado').length || 0),
      0
    ),
    totalCiclosEncerrados: listaPayloads.reduce(
      (soma, d) => soma + (d.payload?.ciclos?.filter((c) => c.estado === 'Encerrado').length || 0),
      0
    ),
  };
  const analytics = calcularAnalyticsPorEmpresa();
  const media = (campo) => {
    const valores = analytics.map((a) => a[campo]).filter((v) => v !== null);
    return valores.length ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length) : null;
  };
  _superAdminMetricas.taxaChurn = _superAdminEmpresas.length
    ? Math.round((analytics.filter((a) => a.emChurn).length / _superAdminEmpresas.length) * 100)
    : 0;
  _superAdminMetricas.engajamentoMedio = media('taxaConclusao');
  _superAdminMetricas.adocaoPDIMedia = media('taxaAdocaoPDI');

  _superAdminCarregando = false;
  _superAdminJaCarregou = true;
  render();
}

/* ---------- Analytics entre Empresas-clientes ----------
   Calcula, por empresa, indicadores de churn, engajamento no ciclo,
   adoção de PDI e um "score de maturidade" comparativo — tudo a partir
   dos mesmos payloads já carregados (sem consulta nova ao banco). */
function calcularAnalyticsPorEmpresa() {
  return _superAdminEmpresas.map((e) => {
    const registro = _superAdminPayloads.find((p) => p.empresa_id === e.id);
    const payload = registro?.payload || {};
    const colaboradores = payload.colaboradores || [];
    const ciclos = payload.ciclos || [];
    const colaboradoresAtivos = colaboradores.filter((c) => !c.inativo);

    const ciclosEncerrados = ciclos.filter((c) => c.estado === 'Encerrado');
    const taxaConclusao = ciclos.length ? Math.round((ciclosEncerrados.length / ciclos.length) * 100) : null;

    const ciclosComDiagnostico = ciclos.filter((c) => c.diagnostico);
    const ciclosComPDIAtivo = ciclosComDiagnostico.filter(
      (c) => (c.pdiDesenvolvimento || []).length || c.pdiMentalidade
    );
    const taxaAdocaoPDI = ciclosComDiagnostico.length
      ? Math.round((ciclosComPDIAtivo.length / ciclosComDiagnostico.length) * 100)
      : null;

    const pdisAprovados = ciclos.filter((c) => c.pdiAprovado).length;
    const taxaAprovacaoPDI = ciclosComPDIAtivo.length
      ? Math.round((pdisAprovados / ciclosComPDIAtivo.length) * 100)
      : null;

    // Cobertura: quantos colaboradores ativos já participaram de algum ciclo alguma vez.
    const colaboradoresComCiclo = new Set(ciclos.map((c) => c.colaboradorId));
    const taxaCobertura = colaboradoresAtivos.length
      ? Math.round(
          (colaboradoresAtivos.filter((c) => colaboradoresComCiclo.has(c.id)).length / colaboradoresAtivos.length) * 100
        )
      : null;

    // Última atividade registrada (proxy de engajamento recente).
    const ultimaAtividade = registro?.atualizado_em ? new Date(registro.atualizado_em) : null;
    const diasDesdeUltimaAtividade = ultimaAtividade
      ? Math.round((Date.now() - ultimaAtividade.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Churn: suspensa ou com pagamento cancelado.
    const statusPagamento = payload.empresa?.faturamento?.statusPagamento;
    const emChurn = !!e.acesso_suspenso || statusPagamento === 'Cancelado';

    // Score de maturidade (0-100): média simples dos indicadores disponíveis
    // (RN da metodologia não define isso — é um indicador de produto nosso,
    // só pra comparar tenants entre si, não é nenhuma regra oficial).
    const indicadoresValidos = [taxaConclusao, taxaAdocaoPDI, taxaCobertura].filter((v) => v !== null);
    const scoreMaturidade = indicadoresValidos.length
      ? Math.round(indicadoresValidos.reduce((a, b) => a + b, 0) / indicadoresValidos.length)
      : null;

    return {
      id: e.id,
      nome: e.nome_fantasia || '(sem nome)',
      totalColaboradores: colaboradoresAtivos.length,
      totalCiclos: ciclos.length,
      taxaConclusao,
      taxaAdocaoPDI,
      taxaAprovacaoPDI,
      taxaCobertura,
      diasDesdeUltimaAtividade,
      emChurn,
      scoreMaturidade,
    };
  });
}

function gerarCodigoLicencaLetras() {
  // Código legível, fácil de ditar/copiar por telefone ou WhatsApp pro cliente.
  // BUG DE SEGURANÇA CORRIGIDO: Math.random() não é criptograficamente
  // seguro. Como esse código dá acesso pra criar uma Empresa nova na
  // plataforma, usamos crypto.getRandomValues() — a mesma família segura
  // já usada em uid() (via crypto.randomUUID()).
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I pra evitar confusão
  const bytes = new Uint8Array(8);
  (window.crypto || window.msCrypto).getRandomValues(bytes);
  let c = 'NORTE-';
  for (let i = 0; i < 8; i++) {
    if (i === 4) c += '-';
    c += chars[bytes[i] % chars.length];
  }
  return c;
}

async function gerarNovoCodigoLicenca() {
  const codigo = gerarCodigoLicencaLetras();
  const rotulo = _superAdminNovoRotulo.trim() || null;
  const { error } = await sb.from('codigos_licenca_empresa').insert({
    codigo,
    nome_empresa_sugerido: rotulo,
    criado_por: meuPerfilId,
    ponto_habilitado: _superAdminNovoPonto,
  });
  if (error) {
    showToast('Não foi possível gerar o código: ' + error.message);
    return;
  }
  _superAdminNovoRotulo = '';
  _superAdminNovoPonto = false;
  showToast('Código de licença gerado.');
  await carregarDadosSuperAdmin();
}

async function suspenderEmpresa(empresaId, nomeEmpresa) {
  // BUG DE SEGURANÇA CORRIGIDO: nada impedia o Super Admin de suspender a
  // própria empresa onde ele também está cadastrado como colaborador — o
  // que bloqueava o próprio login dele (a trava de suspensão vale pra
  // qualquer um vinculado àquela empresa, sem exceção pro Super Admin).
  if (empresaId === empresaIdAtual) {
    showToast(
      'Você não pode suspender a própria empresa por aqui — isso bloquearia seu próprio acesso. Se for realmente necessário, faça isso direto no banco de dados (SQL Editor do Supabase).'
    );
    return;
  }
  if (
    !confirm(
      `Suspender o acesso de "${nomeEmpresa}"? Ninguém dessa empresa consegue entrar no sistema até você reativar.`
    )
  )
    return;
  const { error } = await sb
    .from('empresas')
    .update({
      acesso_suspenso: true,
      suspensa_em: new Date().toISOString(),
      suspensa_por: meuPerfilId,
    })
    .eq('id', empresaId);
  if (error) {
    showToast('Não foi possível suspender: ' + error.message);
    return;
  }
  showToast(`Acesso de "${nomeEmpresa}" suspenso.`);
  await carregarDadosSuperAdmin();
}
async function reativarEmpresa(empresaId, nomeEmpresa) {
  if (!confirm(`Reativar o acesso de "${nomeEmpresa}"?`)) return;
  const { error } = await sb
    .from('empresas')
    .update({
      acesso_suspenso: false,
      suspensa_em: null,
      suspensa_por: null,
    })
    .eq('id', empresaId);
  if (error) {
    showToast('Não foi possível reativar: ' + error.message);
    return;
  }
  showToast(`Acesso de "${nomeEmpresa}" reativado.`);
  await carregarDadosSuperAdmin();
}

function copiarCodigoLicenca(codigo) {
  navigator.clipboard?.writeText(codigo);
  showToast('Código copiado!');
}

async function revogarCodigoLicenca(id) {
  if (!confirm('Revogar este código? Ele deixa de poder ser usado (só funciona se ainda não tiver sido usado).'))
    return;
  const { error } = await sb.from('codigos_licenca_empresa').delete().eq('id', id).eq('usado', false);
  if (error) {
    showToast('Não foi possível revogar — talvez já tenha sido usado.');
    return;
  }
  showToast('Código revogado.');
  await carregarDadosSuperAdmin();
}

function pageSuperAdmin() {
  // BUG CORRIGIDO: antes, a condição pra buscar os dados era "os arrays
  // estão vazios" — mas arrays vazios também é o estado normal quando
  // ainda não existe nenhuma empresa ou código gerado! Isso fazia a tela
  // tentar carregar de novo a cada render, pra sempre, sem nunca "aceitar"
  // que zero resultados é uma resposta válida — travando em "Carregando…"
  // eternamente. Agora só carrega uma vez (`_superAdminJaCarregou`).
  if (!_superAdminJaCarregou && !_superAdminCarregando) {
    carregarDadosSuperAdmin();
  }
  const codigosDisponiveis = _superAdminCodigos.filter((c) => !c.usado);
  const codigosUsados = _superAdminCodigos.filter((c) => c.usado);

  return `
    <div class="page-head">
      <div class="eyebrow">Plataforma NORTE · Instituto INETRIS</div>
      <h1>Super Admin — Empresas licenciadas</h1>
      <p class="page-desc">Controla quais Empresas conseguem se cadastrar na plataforma. Sem um código de licença válido gerado aqui, ninguém consegue criar uma Empresa nova sozinho.</p>
      <button class="btn btn-ghost btn-sm" onclick="carregarDadosSuperAdmin()">↻ Atualizar</button>
    </div>

    ${
      _superAdminCarregando
        ? '<div class="empty">Carregando…</div>'
        : `

    <div class="kpi-grid">
      <div class="kpi"><div class="n">${_superAdminMetricas?.empresasAtivas ?? 0}</div><div class="l">Empresas ativas</div></div>
      <div class="kpi"><div class="n">${_superAdminMetricas?.empresasSuspensas ?? 0}</div><div class="l">Empresas suspensas</div></div>
      <div class="kpi"><div class="n">${_superAdminMetricas?.totalColaboradores ?? 0}</div><div class="l">Colaboradores na plataforma</div></div>
      <div class="kpi"><div class="n">${_superAdminMetricas?.totalCiclosAbertos ?? 0}</div><div class="l">Ciclos em andamento</div></div>
      <div class="kpi"><div class="n">${_superAdminMetricas?.totalCiclosEncerrados ?? 0}</div><div class="l">Ciclos encerrados (histórico)</div></div>
    </div>

    <div class="card">
      <h3>Analytics entre Empresas-clientes <small>Indicadores de produto — não fazem parte da metodologia NORTE, servem só pra você acompanhar adoção entre clientes</small></h3>
      <div class="kpi-grid">
        <div class="kpi"><div class="n" style="color:${(_superAdminMetricas?.taxaChurn || 0) > 20 ? 'var(--iniciar)' : 'inherit'};">${_superAdminMetricas?.taxaChurn ?? 0}%</div><div class="l">Churn (suspensas ou pagamento cancelado)</div></div>
        <div class="kpi"><div class="n">${_superAdminMetricas?.engajamentoMedio ?? '—'}${_superAdminMetricas?.engajamentoMedio !== null ? '%' : ''}</div><div class="l">Engajamento médio no ciclo (taxa de conclusão)</div></div>
        <div class="kpi"><div class="n">${_superAdminMetricas?.adocaoPDIMedia ?? '—'}${_superAdminMetricas?.adocaoPDIMedia !== null ? '%' : ''}</div><div class="l">Adoção média de PDI</div></div>
      </div>
      ${(() => {
        const analytics = calcularAnalyticsPorEmpresa().sort(
          (a, b) => (b.scoreMaturidade || 0) - (a.scoreMaturidade || 0)
        );
        if (!analytics.length) return '<div class="empty">Nenhuma empresa pra comparar ainda.</div>';
        return `
        <table><thead><tr>
          <th>Empresa</th><th>Colaboradores</th><th>Conclusão de ciclo</th><th>Adoção de PDI</th><th>Cobertura</th><th>Última atividade</th><th>Maturidade</th>
        </tr></thead><tbody>
          ${analytics
            .map(
              (a) => `<tr ${a.emChurn ? 'style="opacity:.55;"' : ''}>
            <td><b>${escaparHtml(a.nome)}</b>${a.emChurn ? ' <span class="pill pill-iniciar">Churn</span>' : ''}</td>
            <td>${a.totalColaboradores}</td>
            <td>${a.taxaConclusao !== null ? a.taxaConclusao + '%' : '<span class="small-muted">sem ciclo ainda</span>'}</td>
            <td>${a.taxaAdocaoPDI !== null ? a.taxaAdocaoPDI + '%' : '<span class="small-muted">—</span>'}</td>
            <td>${a.taxaCobertura !== null ? a.taxaCobertura + '%' : '<span class="small-muted">—</span>'}</td>
            <td class="small-muted">${a.diasDesdeUltimaAtividade !== null ? `há ${a.diasDesdeUltimaAtividade} dia(s)` : '—'}</td>
            <td>${a.scoreMaturidade !== null ? `<span class="pill ${a.scoreMaturidade >= 70 ? 'pill-alavancar' : a.scoreMaturidade >= 34 ? 'pill-desenvolver' : 'pill-iniciar'}">${a.scoreMaturidade}</span>` : '<span class="small-muted">—</span>'}</td>
          </tr>`
            )
            .join('')}
        </tbody></table>`;
      })()}
    </div>

    <div class="card">
      <h3>Cobrança por WhatsApp <small>Envie o link de pagamento da InfinitePay direto pro WhatsApp de cada empresa</small></h3>
      ${(() => {
        // Junta cada empresa (tabela) com o payload dela (faturamento + whatsapp).
        const porId = {};
        _superAdminPayloads.forEach((d) => (porId[d.empresa_id] = d.payload || {}));
        const linhas = _superAdminEmpresas.map((e) => {
          const p = porId[e.id] || {};
          const emp = p.empresa || {}; // os dados da empresa ficam em payload.empresa
          const f = emp.faturamento || {};
          return {
            id: e.id,
            nome: emp.nomeFantasia || e.nome_fantasia || 'Empresa',
            whatsapp: emp.whatsappCobranca || null,
            link: f.linkPagamento || null,
            status: f.statusPagamento || 'Pendente',
            valor: f.valorMensal || null,
          };
        });
        if (!linhas.length) return '<div class="empty">Nenhuma empresa cadastrada ainda.</div>';
        return `
        <table><thead><tr><th>Empresa</th><th>WhatsApp</th><th>Status</th><th>Link</th><th></th></tr></thead><tbody>
          ${linhas
            .map((l) => {
              const podeCobrar = l.whatsapp && l.link;
              return `<tr>
              <td><b>${escaparHtml(l.nome)}</b></td>
              <td class="small-muted">${l.whatsapp ? escaparHtml(l.whatsapp) : '<span style="color:var(--iniciar);">sem WhatsApp</span>'}</td>
              <td><span class="pill ${l.status === 'Em dia' ? 'pill-alavancar' : l.status === 'Atrasado' || l.status === 'Cancelado' ? 'pill-iniciar' : 'pill-neutral'}">${l.status}</span></td>
              <td>${l.link ? '<span class="small-muted">configurado</span>' : '<span style="color:var(--iniciar);">sem link</span>'}</td>
              <td style="text-align:right;">
                <button class="btn btn-sm btn-primary" ${podeCobrar ? '' : 'disabled'} onclick="cobrarViaWhatsApp('${l.id}')">Cobrar via WhatsApp</button>
              </td>
            </tr>`;
            })
            .join('')}
        </tbody></table>
        <div class="notice info" style="margin-top:12px;">O botão abre o WhatsApp com a mensagem e o link já prontos — você confere e aperta enviar. As empresas sem WhatsApp ou sem link de pagamento aparecem com o botão desabilitado (preencha esses dados no Cadastro da Empresa).</div>`;
      })()}
    </div>

    <div class="card">
      <h3>Gerar novo código de licença</h3>
      <p class="page-desc">Cria um código de uso único. Envie por WhatsApp/e-mail pra empresa-cliente — ela usa esse código na tela de cadastro, no lugar de "Nome da empresa" sozinho.</p>
      <div class="field"><label>Rótulo (opcional, só pra você identificar depois — ex.: "Lacle")</label>
        <input value="${escaparHtml(_superAdminNovoRotulo)}" oninput="_superAdminNovoRotulo=this.value;" placeholder="Nome do cliente prospectado">
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:14px;">
        <input type="checkbox" ${_superAdminNovoPonto ? 'checked' : ''} onchange="_superAdminNovoPonto=this.checked;">
        Habilitar o módulo de <b>Ponto</b> para esta empresa
      </label>
      <button class="btn btn-primary" onclick="gerarNovoCodigoLicenca()">Gerar código</button>
    </div>

    <div class="card">
      <h3>Códigos disponíveis <small>${codigosDisponiveis.length} ainda não usado(s)</small></h3>
      ${
        codigosDisponiveis.length
          ? `
        <table><thead><tr><th>Código</th><th>Rótulo</th><th>Ponto</th><th>Gerado em</th><th></th></tr></thead><tbody>
          ${codigosDisponiveis
            .map(
              (c) => `<tr>
            <td style="font-family:var(--mono);">${c.codigo}</td>
            <td class="small-muted">${escaparHtml(c.nome_empresa_sugerido) || '—'}</td>
            <td>${c.ponto_habilitado ? '<span class="pill pill-alavancar">Sim</span>' : '<span class="pill pill-neutral">Não</span>'}</td>
            <td class="small-muted">${new Date(c.criado_em).toLocaleDateString('pt-BR')}</td>
            <td style="display:flex;gap:6px;">
              <button class="btn btn-sm btn-ghost" onclick="copiarCodigoLicenca('${c.codigo}')">Copiar</button>
              <button class="btn btn-sm btn-ghost" onclick="revogarCodigoLicenca('${c.id}')">Revogar</button>
            </td>
          </tr>`
            )
            .join('')}
        </tbody></table>
      `
          : '<div class="empty">Nenhum código disponível — gere um acima.</div>'
      }
    </div>

    <div class="card">
      <h3>Empresas cadastradas na plataforma <small>${_superAdminEmpresas.length} no total</small></h3>
      ${
        _superAdminEmpresas.length
          ? `
        <table><thead><tr><th>Empresa</th><th>CNPJ</th><th>Status</th><th>Pagamento</th><th>Cadastrada em</th><th></th></tr></thead><tbody>
          ${_superAdminEmpresas
            .map((e) => {
              const statusPagamento = _superAdminPayloads.find((p) => p.empresa_id === e.id)?.payload?.empresa
                ?.faturamento?.statusPagamento;
              const corPagamento = {
                'Em dia': 'pill-alavancar',
                Pendente: 'pill-desenvolver',
                Atrasado: 'pill-iniciar',
                Cancelado: 'pill-neutral',
              };
              return `<tr>
            <td><b>${escaparHtml(e.nome_fantasia) || '(sem nome ainda)'}</b>${e.id === empresaIdAtual ? ' <span class="pill pill-neutral">sua empresa</span>' : ''}</td>
            <td class="small-muted">${e.cnpj || '—'}</td>
            <td>${e.acesso_suspenso ? '<span class="pill pill-iniciar">Suspensa</span>' : '<span class="pill pill-alavancar">Ativa</span>'}</td>
            <td>${statusPagamento ? `<span class="pill ${corPagamento[statusPagamento] || 'pill-neutral'}">${statusPagamento}</span>` : '<span class="small-muted">—</span>'}</td>
            <td class="small-muted">${e.created_at ? new Date(e.created_at).toLocaleDateString('pt-BR') : '—'}</td>
            <td>${
              e.id === empresaIdAtual
                ? '<span class="small-muted">Não é possível suspender aqui</span>'
                : e.acesso_suspenso
                  ? `<button class="btn btn-sm btn-ghost" onclick="reativarEmpresa('${e.id}','${escaparParaOnclick(e.nome_fantasia)}')">Reativar</button>`
                  : `<button class="btn btn-sm btn-ghost" style="color:var(--iniciar);" onclick="suspenderEmpresa('${e.id}','${escaparParaOnclick(e.nome_fantasia)}')">Suspender</button>`
            }</td>
          </tr>`;
            })
            .join('')}
        </tbody></table>
      `
          : '<div class="empty">Nenhuma empresa cadastrada ainda.</div>'
      }
    </div>

    ${
      codigosUsados.length
        ? `
    <div class="card">
      <h3>Histórico de códigos já usados <small>${codigosUsados.length}</small></h3>
      <table><thead><tr><th>Código</th><th>Rótulo</th><th>Empresa que usou</th><th>Usado em</th></tr></thead><tbody>
        ${codigosUsados
          .map((c) => {
            const empresa = _superAdminEmpresas.find((e) => e.id === c.empresa_id);
            return `<tr>
            <td style="font-family:var(--mono);" class="small-muted">${c.codigo}</td>
            <td class="small-muted">${escaparHtml(c.nome_empresa_sugerido) || '—'}</td>
            <td>${empresa ? empresa.nome_fantasia : '—'}</td>
            <td class="small-muted">${c.usado_em ? new Date(c.usado_em).toLocaleDateString('pt-BR') : '—'}</td>
          </tr>`;
          })
          .join('')}
      </tbody></table>
    </div>
    `
        : ''
    }
    `
    }
  `;
}

/* ---------- Cobrança por WhatsApp (Fase 1) ----------
   Monta a mensagem com o link de pagamento e abre o WhatsApp "clique para
   conversar" (wa.me). Não envia sozinho — abre a conversa com o texto pronto
   pra você conferir e enviar. Grátis, sem API, sem risco de banimento. */
function cobrarViaWhatsApp(empresaId) {
  const empresa = _superAdminEmpresas.find((e) => e.id === empresaId);
  const payload = (_superAdminPayloads.find((d) => d.empresa_id === empresaId) || {}).payload || {};
  const emp = payload.empresa || {}; // os dados da empresa ficam em payload.empresa
  const f = emp.faturamento || {};
  const nome = emp.nomeFantasia || empresa?.nome_fantasia || 'Empresa';
  const whatsapp = emp.whatsappCobranca;
  const link = f.linkPagamento;

  if (!whatsapp || !link) {
    showToast('Esta empresa está sem WhatsApp ou sem link de pagamento. Preencha no Cadastro da Empresa.');
    return;
  }

  // Só dígitos; se não vier com código do país (55), adiciona.
  let numero = String(whatsapp).replace(/\D/g, '');
  if (numero.length <= 11) numero = '55' + numero;

  const valor = f.valorMensal
    ? parseFloat(f.valorMensal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : null;

  const mensagem =
    `Olá! Aqui é do Instituto INETRIS. 👋\n\n` +
    `Segue o link para pagamento da sua assinatura da plataforma NORTE` +
    (nome ? ` (${nome})` : '') +
    (valor ? ` — mensalidade de ${valor}` : '') +
    `:\n\n${link}\n\n` +
    `Qualquer dúvida, estamos à disposição. Obrigado!`;

  const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
  window.open(url, '_blank', 'noopener');
  registrarAuditoria('cobranca.whatsapp_aberta', { empresaId, nome });
}
