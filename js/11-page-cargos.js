let _verTodosCargosCBO = false;
let _previewImportacaoCargos = null; // linhas validadas da planilha de cargos, aguardando confirmação
function pageCargos() {
  const segmentoEmpresa = state.empresa?.segmento || '';
  // Filtro estrito: só mostra cargos marcados pro segmento escolhido pela
  // empresa. Cargos genuinamente universais (Gerente, Recepcionista etc.)
  // já vêm marcados em todos os segmentos na própria base (js/04-data-cbo.js),
  // então continuam aparecendo — mas não existe mais nenhum "fallback"
  // automático misturando segmentos diferentes por trás das cortinas.
  const cbosFiltrados =
    !segmentoEmpresa || _verTodosCargosCBO ? CBO_MOCK : CBO_MOCK.filter((c) => c.segmentos.includes(segmentoEmpresa));

  return `
    <div class="page-head">
      <div class="eyebrow">Etapa 04 · Cargos</div>
      <h1>Base de Cargos (CBO)</h1>
      <p class="page-desc">Importe da Classificação Brasileira de Ocupações e adapte — o cargo-modelo original nunca é editado, apenas copiado para a empresa.</p>
    </div>

    <div class="card">
      <h3>Importar cargos por planilha <small>Excel/CSV — cadastre vários cargos de uma vez</small></h3>
      <p class="page-desc">Baixe o modelo, preencha um cargo por linha e importe. Os cargos entram como rascunho para você revisar e publicar o Desenho depois.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button class="btn btn-ghost btn-sm" onclick="baixarModeloCargos()">Baixar modelo de planilha</button>
        <input type="file" id="arquivo_importacao_cargos" accept=".xlsx,.xls,.csv" onchange="processarArquivoCargos(this)">
      </div>
      ${
        _previewImportacaoCargos
          ? `
        <div style="margin-top:14px;">
          <div class="small-muted" style="margin-bottom:8px;">${_previewImportacaoCargos.filter((l) => !l.erros.length).length} cargo(s) válido(s) de ${_previewImportacaoCargos.length} — os com erro são ignorados.</div>
          ${_previewImportacaoCargos
            .map(
              (l) =>
                `<div class="import-preview-row" style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--line);">
              <span>${escaparHtml(l.nome || '(sem nome)')}</span>
              ${l.erros.length ? `<span class="import-preview-erro">${l.erros.join('; ')}</span>` : '<span style="color:var(--alavancar);font-size:12.5px;">ok</span>'}
            </div>`
            )
            .join('')}
          <button class="btn btn-primary" style="margin-top:12px;" onclick="confirmarImportacaoCargos()" ${_previewImportacaoCargos.some((l) => !l.erros.length) ? '' : 'disabled'}>Importar ${_previewImportacaoCargos.filter((l) => !l.erros.length).length} cargo(s)</button>
        </div>`
          : ''
      }
    </div>

    <div class="card">
      <h3>Consultar a base oficial da CBO <small>2.725 ocupações — pesquise por nome, código ou outra denominação</small></h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <input id="cbo_busca" value="${escaparHtml(_cboBusca)}" placeholder="Ex: pedreiro, auxiliar de loja, 5211-40..." style="flex:1;min-width:220px;" onkeydown="if(event.key==='Enter'){garantirCboEbuscar(this.value);}">
        <button class="btn btn-primary" onclick="garantirCboEbuscar(document.getElementById('cbo_busca').value)">Buscar no CBO</button>
      </div>
      ${
        _cboOficialCarregando
          ? '<div class="empty">Carregando a base oficial da CBO (só na primeira vez)…</div>'
          : _cboBusca && _cboResultados.length === 0
            ? '<div class="empty">Nenhuma ocupação encontrada para essa busca.</div>'
            : _cboResultados.length
              ? `<div style="margin-top:12px;">${_cboResultados.map((oc) => renderResultadoCbo(oc)).join('')}</div>`
              : '<div class="notice" style="margin-top:12px;">Digite o nome de um cargo, um código CBO ou uma denominação alternativa e clique em "Buscar no CBO". A base oficial completa é carregada na primeira busca.</div>'
      }
    </div>

    <div class="card">
      <h3>Biblioteca CBO <small>${segmentoEmpresa && !_verTodosCargosCBO ? `Filtrado para o segmento "${segmentoEmpresa}"${segmentoEmpresa === 'Outro' && state.empresa?.segmentoDetalhe ? ` (${state.empresa.segmentoDetalhe})` : ''}` : 'Selecione um cargo para importar e adaptar'}</small></h3>
      ${
        segmentoEmpresa
          ? `<label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink-dim);margin-bottom:12px;">
        <input type="checkbox" ${_verTodosCargosCBO ? 'checked' : ''} onchange="_verTodosCargosCBO=this.checked; render();">
        Ver cargos de todos os segmentos (não só "${segmentoEmpresa}")
      </label>`
          : '<div class="notice">Defina o Segmento da empresa em Cadastro da Empresa para filtrar a biblioteca automaticamente.</div>'
      }
      ${
        cbosFiltrados.length
          ? cbosFiltrados
              .map(
                (c) => `
        <div class="cbo-item">
          <div><b>${escaparHtml(c.nome)}</b><br><span>CBO ${escaparHtml(c.codigo)} · ${escaparHtml(c.familia)} · ${escaparHtml(c.natureza)}</span></div>
          <button class="btn btn-sm" onclick="importarCargo('${c.codigo}')">Importar cargo →</button>
        </div>
      `
              )
              .join('')
          : '<div class="empty">Nenhum cargo cadastrado para esse segmento ainda — marque "Ver cargos de todos os segmentos" acima, ou crie um cargo do zero abaixo.</div>'
      }
    </div>

    <div class="card">
      <h3>Ou crie um cargo do zero</h3>
      <div class="grid2">
        <div class="field"><label>Nome do cargo</label><input id="cg_nome" placeholder="Ex: Analista Comercial Pleno"></div>
        <div class="field"><label>Família</label>
          <select id="cg_familia">
            ${['Liderança', 'Coordenação', 'Operacional', 'Administrativo/Financeiro', 'Comercial', 'Público', 'Saúde', 'Educação', 'Tecnologia', 'Jurídico', 'Construção Civil', 'Agronegócio', 'Logística'].map((f) => `<option>${f}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Natureza</label>
          <select id="cg_natureza">
            ${['Operacional', 'Apoio', 'Estratégica'].map((f) => `<option>${f}</option>`).join('')}
          </select>
        </div>
      </div>
      <button class="btn btn-primary" onclick="criarCargoDoZero()">Criar cargo</button>
    </div>

    <div class="card">
      <h3>Cargos da empresa</h3>
      ${
        state.cargos.length
          ? `<table><thead><tr><th>Cargo</th><th>CBO</th><th>Família</th><th>Desenho</th><th></th></tr></thead><tbody>
        ${state.cargos
          .map(
            (c) => `
          <tr style="${c.descontinuado ? 'opacity:.55;' : ''}">
            <td><b>${escaparHtml(c.nome)}</b></td>
            <td class="small-muted">${c.cbo || '—'}</td>
            <td class="small-muted">${escaparHtml(c.familia)}</td>
            <td>${c.descontinuado ? '<span class="pill pill-iniciar">Descontinuado</span>' : c.desenho.aprovado ? '<span class="pill pill-alavancar">Publicado v' + c.desenho.versao + '</span>' : '<span class="pill pill-desenvolver">Rascunho</span>'}</td>
            <td>
              <button class="btn btn-sm btn-ghost" onclick="goto('desenho'); state.cargoEditando='${c.id}'">Editar desenho →</button>
              ${c.desenho.aprovado ? `<button class="btn btn-sm btn-ghost" onclick="alternarDescontinuarCargo('${c.id}')">${c.descontinuado ? 'Reativar' : 'Descontinuar'}</button>` : ''}
            </td>
          </tr>
        `
          )
          .join('')}
      </tbody></table>`
          : '<div class="empty">Nenhum cargo cadastrado.</div>'
      }
    </div>
  `;
}
function alternarDescontinuarCargo(cargoId) {
  const cargo = state.cargos.find((c) => c.id === cargoId);
  const vinculados = state.colaboradores.filter((p) => p.cargoId === cargoId).length;
  cargo.descontinuado = !cargo.descontinuado;
  atualizarCarimbo(cargo);
  registrarAuditoria(cargo.descontinuado ? 'cargo.descontinuado' : 'cargo.reativado', {
    nome: cargo.nome,
    colaboradoresVinculados: vinculados,
  });
  showToast(
    cargo.descontinuado
      ? `Cargo descontinuado. ${vinculados > 0 ? `Os ${vinculados} colaborador(es) já vinculados e seu histórico continuam intactos — só não é possível abrir novos ciclos para este cargo.` : 'Não é mais possível vincular novos colaboradores a este cargo.'}`
      : 'Cargo reativado.'
  );
  render();
}
function importarCargo(codigo) {
  const src = CBO_MOCK.find((c) => c.codigo === codigo);
  const banco = BANCO_INTELIGENCIA[src.familia];
  const novo = {
    id: uid(),
    nome: src.nome,
    familia: src.familia,
    natureza: src.natureza,
    cbo: src.codigo,
    origemCBO: true,
    indicadoresN: [],
    indicadoresO: [],
    indicadoresR: [],
    sugestoes: banco
      ? {
          competencias: banco.competencias.map((nome) => ({ id: uid(), nome, marcado: true })),
          indicadoresN: banco.indicadoresN.map((item) => ({
            id: uid(),
            nome: item.nome,
            competencia: item.competencia,
            marcado: true,
          })),
          indicadoresO: banco.indicadoresO.map((item) => ({
            id: uid(),
            nome: item.nome,
            competencia: item.competencia,
            marcado: true,
          })),
          indicadoresR: banco.indicadoresR.map((item) => ({
            id: uid(),
            nome: item.nome,
            competencia: item.competencia,
            marcado: true,
          })),
        }
      : null,
    desenho: {
      versao: 1,
      aprovado: false,
      area: src.area,
      nivelHierarquico: src.nivelHierarquico,
      regimeTrabalho: src.regimeTrabalho,
      subordinacao: src.subordinacao,
      subordinadosDiretos: src.subordinadosDiretos,
      localTrabalho: src.localTrabalho,
      missao: src.missao,
      responsabilidades: [...src.responsabilidades], // RN028: cópia editável — a empresa pode ajustar livremente após importar
      culturaPostura: '', // obrigatório (RN030) — cada empresa preenche a sua própria Cultura e Postura Institucional
      formacaoAcademica: src.formacaoAcademica,
      experienciaProfissional: src.experienciaProfissional,
      conhecimentosTecnicos: src.conhecimentosTecnicos,
      idiomas: src.idiomas,
      competenciasComportamentais: [...src.competenciasComportamentais],
      ferramentasSistemas: [...src.ferramentasSistemas],
      kpis: [...src.kpis],
      condicoesTrabalho: src.condicoesTrabalho,
      perspectivasCarreira: [...src.perspectivasCarreira],
    },
    versoes: [],
    descontinuado: false,
    ...novoCarimbo(),
  };
  state.cargos.push(novo);
  state.cargoEditando = novo.id;
  showToast('Cargo importado. Revise as sugestões do Banco de Inteligência antes de aplicar (RN028).');
  goto('desenho');
}
function atualizarSugestoesCargo(cargoId) {
  const cargo = state.cargos.find((c) => c.id === cargoId);
  const banco = BANCO_INTELIGENCIA[cargo.familia];
  if (!banco) {
    showToast('Nenhuma sugestão disponível para esta família de cargo.');
    return;
  }
  cargo.sugestoes = {
    competencias: banco.competencias.map((nome) => ({ id: uid(), nome, marcado: true })),
    indicadoresN: banco.indicadoresN.map((item) => ({
      id: uid(),
      nome: item.nome,
      competencia: item.competencia,
      marcado: true,
    })),
    indicadoresO: banco.indicadoresO.map((item) => ({
      id: uid(),
      nome: item.nome,
      competencia: item.competencia,
      marcado: true,
    })),
    indicadoresR: banco.indicadoresR.map((item) => ({
      id: uid(),
      nome: item.nome,
      competencia: item.competencia,
      marcado: true,
    })),
  };
  showToast('Sugestões atualizadas — revise e marque só o que fizer sentido antes de aplicar (RN028).');
  render();
}
function toggleSugestao(cargoId, grupo, sugestaoId) {
  const cargo = state.cargos.find((c) => c.id === cargoId);
  const item = cargo.sugestoes[grupo].find((s) => s.id === sugestaoId);
  item.marcado = !item.marcado;
  render();
}
function aplicarSugestoesCargo(cargoId) {
  const cargo = state.cargos.find((c) => c.id === cargoId);
  ['indicadoresN', 'indicadoresO', 'indicadoresR'].forEach((key) => {
    const selecionados = cargo.sugestoes[key].filter((s) => s.marcado);
    selecionados.forEach((s) => cargo[key].push({ id: uid(), nome: s.nome, competencia: s.competencia }));
  });
  cargo.sugestoes = null;
  showToast('Sugestões aplicadas ao cargo — já podem ser editadas normalmente.');
  render();
}
function descartarSugestoesCargo(cargoId) {
  const cargo = state.cargos.find((c) => c.id === cargoId);
  cargo.sugestoes = null;
  showToast('Sugestões descartadas.');
  render();
}
function criarCargoDoZero() {
  const nome = document.getElementById('cg_nome').value.trim();
  if (!nome) {
    showToast('Informe o nome do cargo.');
    return;
  }
  const novo = {
    id: uid(),
    nome,
    familia: document.getElementById('cg_familia').value,
    natureza: document.getElementById('cg_natureza').value,
    cbo: null,
    origemCBO: false,
    indicadoresN: [],
    indicadoresO: [],
    indicadoresR: [],
    desenho: {
      versao: 1,
      aprovado: false,
      area: '',
      nivelHierarquico: '',
      regimeTrabalho: '',
      subordinacao: '',
      subordinadosDiretos: '',
      localTrabalho: '',
      missao: '',
      responsabilidades: [],
      culturaPostura: '',
      formacaoAcademica: '',
      experienciaProfissional: '',
      conhecimentosTecnicos: '',
      idiomas: '',
      competenciasComportamentais: [],
      ferramentasSistemas: [],
      kpis: [],
      condicoesTrabalho: '',
      perspectivasCarreira: [],
    },
    versoes: [],
    descontinuado: false,
    ...novoCarimbo(),
  };
  state.cargos.push(novo);
  state.cargoEditando = novo.id;
  showToast('Cargo criado. Complete o Desenho de Cargo para poder publicá-lo.');
  goto('desenho');
}

/* ===================== 5. DESENHO DE CARGO ===================== */

/* ===================== IMPORTAÇÃO DE CARGOS POR PLANILHA =====================
   Mesmo padrão da importação de colaboradores (js/13): baixar modelo, ler o
   arquivo, mostrar preview validado, confirmar. Campos de lista (responsabi-
   lidades, competências, ferramentas, KPIs, carreira) são separados por ";".
   Os cargos entram como rascunho (desenho não publicado) pra revisão. */

const _CARGOS_COLUNAS = [
  'Nome do cargo',
  'Natureza',
  'Área',
  'Nível hierárquico',
  'Regime de trabalho',
  'Local de trabalho',
  'Reporta-se a',
  'Subordinados diretos',
  'Missão',
  'Responsabilidades (separadas por ;)',
  'Cultura e Postura Institucional',
  'Formação acadêmica',
  'Experiência profissional',
  'Conhecimentos técnicos',
  'Idiomas',
  'Competências comportamentais (separadas por ;)',
  'Ferramentas e sistemas (separados por ;)',
  'KPIs (separados por ;)',
  'Condições de trabalho',
  'Perspectivas de carreira (separadas por ;)',
];

async function baixarModeloCargos() {
  await garantirXLSX();
  const exemplo = [
    'Analista de RH',
    'Apoio',
    'Recursos Humanos',
    'Analista',
    'CLT — 40h semanais',
    'Sede / Híbrido',
    'Coordenador(a) de RH',
    'Nenhum',
    'Apoiar os processos de gestão de pessoas da empresa.',
    'Conduzir recrutamento; Acompanhar avaliações; Organizar treinamentos',
    'Atua com ética, sigilo e respeito no trato com colaboradores.',
    'Ensino superior em Administração, Psicologia ou áreas afins',
    'Mínimo de 1 ano em rotinas de RH',
    'Legislação trabalhista; folha de pagamento',
    'Português',
    'Comunicação; Organização; Empatia',
    'Excel; Sistema de folha; Plataforma NORTE',
    'Tempo médio de fechamento de vagas; Índice de satisfação interna',
    'Ambiente de escritório, com uso de computador.',
    'Analista Sênior; Coordenador de RH',
  ];
  const linhas = [_CARGOS_COLUNAS, exemplo];
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cargos');
  XLSX.writeFile(wb, 'modelo-importacao-cargos.xlsx');
}

async function processarArquivoCargos(inputEl) {
  const arquivo = inputEl.files[0];
  if (!arquivo) return;
  await garantirXLSX();
  const leitor = new FileReader();
  leitor.onload = (e) => {
    const dados = new Uint8Array(e.target.result);
    const workbook = XLSX.read(dados, { type: 'array' });
    const primeiraAba = workbook.Sheets[workbook.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(primeiraAba, { defval: '' });
    _previewImportacaoCargos = linhas.map((linha) => validarLinhaCargo(linha));
    render();
  };
  leitor.readAsArrayBuffer(arquivo);
}

// Aceita tanto o cabeçalho do modelo quanto variações simples (sem acento).
function _campoCargo(linha, ...nomes) {
  for (const n of nomes) {
    if (linha[n] !== undefined && String(linha[n]).trim() !== '') return String(linha[n]).trim();
  }
  return '';
}
function _listaCargo(texto) {
  return String(texto || '')
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function validarLinhaCargo(linha) {
  const nome = _campoCargo(linha, 'Nome do cargo', 'Nome', 'Cargo');
  let natureza = _campoCargo(linha, 'Natureza');
  // Normaliza a natureza pros valores aceitos; padrão "Operacional".
  const natOk = ['Operacional', 'Apoio', 'Estratégica'];
  const natEncontrada = natOk.find((n) => n.toLowerCase() === natureza.toLowerCase());
  natureza = natEncontrada || 'Operacional';

  const erros = [];
  if (!nome) erros.push('nome do cargo vazio');
  if (state.cargos.some((c) => c.nome.toLowerCase() === nome.toLowerCase() && !c.descontinuado))
    erros.push(`já existe um cargo "${nome}"`);

  return {
    nome,
    natureza,
    erros,
    dados: {
      area: _campoCargo(linha, 'Área', 'Area'),
      nivelHierarquico: _campoCargo(linha, 'Nível hierárquico', 'Nivel hierarquico', 'Nível'),
      regimeTrabalho: _campoCargo(linha, 'Regime de trabalho', 'Regime'),
      localTrabalho: _campoCargo(linha, 'Local de trabalho', 'Local'),
      subordinacao: _campoCargo(linha, 'Reporta-se a', 'Subordinação', 'Subordinacao'),
      subordinadosDiretos: _campoCargo(linha, 'Subordinados diretos'),
      missao: _campoCargo(linha, 'Missão', 'Missao'),
      responsabilidades: _listaCargo(_campoCargo(linha, 'Responsabilidades (separadas por ;)', 'Responsabilidades')),
      culturaPostura: _campoCargo(linha, 'Cultura e Postura Institucional', 'Cultura e Postura'),
      formacaoAcademica: _campoCargo(linha, 'Formação acadêmica', 'Formacao academica', 'Formação'),
      experienciaProfissional: _campoCargo(linha, 'Experiência profissional', 'Experiencia profissional'),
      conhecimentosTecnicos: _campoCargo(linha, 'Conhecimentos técnicos', 'Conhecimentos tecnicos'),
      idiomas: _campoCargo(linha, 'Idiomas'),
      competenciasComportamentais: _listaCargo(
        _campoCargo(linha, 'Competências comportamentais (separadas por ;)', 'Competências comportamentais')
      ),
      ferramentasSistemas: _listaCargo(
        _campoCargo(linha, 'Ferramentas e sistemas (separados por ;)', 'Ferramentas e sistemas')
      ),
      kpis: _listaCargo(_campoCargo(linha, 'KPIs (separados por ;)', 'KPIs')),
      condicoesTrabalho: _campoCargo(linha, 'Condições de trabalho', 'Condicoes de trabalho'),
      perspectivasCarreira: _listaCargo(
        _campoCargo(linha, 'Perspectivas de carreira (separadas por ;)', 'Perspectivas de carreira')
      ),
    },
  };
}

function confirmarImportacaoCargos() {
  const validos = (_previewImportacaoCargos || []).filter((l) => !l.erros.length);
  if (!validos.length) return;
  let criados = 0;
  validos.forEach((l) => {
    const d = l.dados;
    state.cargos.push({
      id: uid(),
      nome: l.nome,
      natureza: l.natureza,
      familia: null,
      cbo: null,
      origemImportacao: 'planilha',
      bancoInteligencia: null,
      desenho: {
        versao: 1,
        aprovado: false, // entra como rascunho pra revisão
        area: d.area,
        nivelHierarquico: d.nivelHierarquico,
        regimeTrabalho: d.regimeTrabalho,
        subordinacao: d.subordinacao,
        subordinadosDiretos: d.subordinadosDiretos,
        localTrabalho: d.localTrabalho,
        missao: d.missao,
        responsabilidades: d.responsabilidades,
        culturaPostura: d.culturaPostura,
        formacaoAcademica: d.formacaoAcademica,
        experienciaProfissional: d.experienciaProfissional,
        conhecimentosTecnicos: d.conhecimentosTecnicos,
        idiomas: d.idiomas,
        competenciasComportamentais: d.competenciasComportamentais,
        ferramentasSistemas: d.ferramentasSistemas,
        kpis: d.kpis,
        condicoesTrabalho: d.condicoesTrabalho,
        perspectivasCarreira: d.perspectivasCarreira,
      },
      versoes: [],
      descontinuado: false,
      ...novoCarimbo(),
    });
    criados++;
  });
  registrarAuditoria('cargos.importados_planilha', { quantidade: criados });
  _previewImportacaoCargos = null;
  showToast(`${criados} cargo(s) importado(s) como rascunho. Revise e publique o Desenho de cada um.`);
  render();
}
