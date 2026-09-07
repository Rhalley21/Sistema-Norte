/* =========================================================
   CBO OFICIAL — carregamento sob demanda + busca
   -----------------------------------------------------------
   A base oficial da CBO (js/04a-data-cbo-oficial.js) tem ~8 MB.
   Carregá-la junto com o sistema deixaria a home lenta, então ela
   é baixada só quando a tela de Cargos precisa (primeira busca ou
   ao abrir a aba de vínculo). Depois fica em cache do navegador.
   ========================================================= */

let _cboOficialCarregando = false;
let _cboOficialCarregado = typeof CBO_OFICIAL !== 'undefined';
let _cboBusca = '';
let _cboResultados = [];

// Carrega o arquivo de dados injetando um <script> na página. Resolve
// quando CBO_OFICIAL fica disponível. Reaproveita se já estiver carregado.
function carregarCboOficial() {
  return new Promise((resolve, reject) => {
    if (typeof CBO_OFICIAL !== 'undefined') {
      _cboOficialCarregado = true;
      resolve();
      return;
    }
    // Se já existe um <script> do CBO na página (de uma tentativa anterior),
    // remove antes de tentar de novo, pra não acumular e pra permitir retry.
    const antigo = document.getElementById('cbo-oficial-script');
    if (antigo) antigo.remove();

    _cboOficialCarregando = true;
    const s = document.createElement('script');
    s.id = 'cbo-oficial-script';
    s.src = 'js/04a-data-cbo-oficial.js?v=0.62.0';

    // Timeout de segurança: se em 45s o arquivo não carregar (rede lenta ou
    // falha silenciosa), desiste em vez de ficar "Carregando" pra sempre.
    const timeout = setTimeout(() => {
      _cboOficialCarregando = false;
      reject(new Error('A base do CBO demorou demais para carregar. Verifique a conexão e tente de novo.'));
    }, 45000);

    s.onload = () => {
      clearTimeout(timeout);
      _cboOficialCarregando = false;
      // O script carregou — confirma que a variável realmente ficou definida.
      if (typeof CBO_OFICIAL !== 'undefined') {
        _cboOficialCarregado = true;
        resolve();
      } else {
        reject(new Error('O arquivo do CBO carregou, mas os dados não foram reconhecidos.'));
      }
    };
    s.onerror = () => {
      clearTimeout(timeout);
      _cboOficialCarregando = false;
      reject(new Error('Falha ao carregar a base do CBO (arquivo não encontrado ou bloqueado).'));
    };
    document.head.appendChild(s);
  });
}

// Gera RASCUNHOS de texto para os campos que a CBO não traz (missão,
// formação, experiência, etc.), a partir do que existe (título, família,
// áreas/atividades). São textos genéricos de ponto de partida — a empresa
// revisa e ajusta. Nunca inventa dados específicos (idiomas, ferramentas,
// KPIs ficam com a empresa).
function gerarRascunhosCbo(oc, areasTecnicas, competenciasCbo) {
  const titulo = (oc.titulo || 'profissional').toLowerCase();
  const familia = (oc.familia || '').toLowerCase();
  const nomesAreas = (areasTecnicas || []).map((ar) => ar.a.toLowerCase());
  const listaAreas = nomesAreas.length
    ? nomesAreas.slice(0, 4).join(', ') + (nomesAreas.length > 4 ? ' entre outras' : '')
    : 'suas atribuições';

  const missao =
    `Executar as atividades de ${titulo}${familia ? `, no âmbito de ${familia}` : ''}, ` +
    `com foco em ${listaAreas}, seguindo os procedimentos, prazos e padrões de qualidade da empresa.`;

  const formacao =
    'Escolaridade compatível com a natureza do cargo (a empresa define o mínimo exigido). ' +
    (familia ? `Formação, curso técnico ou qualificação em ${familia} é desejável.` : '');

  const experiencia =
    'Experiência prévia na função ou em atividades correlatas é desejável. ' +
    'A empresa define o tempo mínimo de experiência conforme o nível do cargo.';

  const conhecimentos = (competenciasCbo && competenciasCbo.length ? [] : nomesAreas)
    .concat(nomesAreas)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 6)
    .map((a) => `Conhecimento em ${a}`)
    .join('; ');

  const condicoes =
    'Condições e jornada conforme a rotina da empresa e a legislação vigente. ' +
    'Detalhar ambiente (interno/externo), turnos e eventuais riscos específicos da função.';

  const perspectivas = [
    `Evolução dentro da própria área (${familia || 'área de atuação'})`,
    'Assumir atividades de maior complexidade ou coordenação',
  ];

  return { missao, formacao, experiencia, conhecimentos, condicoes, perspectivas };
}

// Deriva a lista plana de atividades a partir das áreas de uma ocupação.
// (a base guarda as atividades dentro de cada área {a: nome, i: [ativ]}).
function cboAtividadesPlanas(oc) {
  if (!oc || !Array.isArray(oc.areas)) return [];
  const todas = [];
  oc.areas.forEach((ar) => (ar.i || []).forEach((atv) => todas.push(atv)));
  return todas;
}

// Normaliza texto pra busca: minúsculas, sem acentos.
function _normalizarBusca(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Busca por código, título oficial OU sinônimo (outras denominações).
// Retorna no máximo 40 resultados pra não travar a tela.
function buscarCboOficial(termo) {
  if (typeof CBO_OFICIAL === 'undefined') return [];
  const q = _normalizarBusca(termo).trim();
  if (q.length < 2) return [];
  const soDigitos = q.replace(/\D/g, '');
  const buscaPorCodigo = soDigitos.length >= 3;
  const res = [];
  for (const oc of CBO_OFICIAL) {
    let bate = false;
    if (buscaPorCodigo && oc.codigo.replace(/\D/g, '').includes(soDigitos)) {
      bate = true;
    } else {
      if (_normalizarBusca(oc.titulo).includes(q)) bate = true;
      else if (oc.sinonimos.some((s) => _normalizarBusca(s).includes(q))) bate = true;
    }
    if (bate) {
      res.push(oc);
      if (res.length >= 40) break;
    }
  }
  return res;
}

async function garantirCboEbuscar(termo) {
  _cboBusca = termo;
  if (!_cboOficialCarregado) {
    _cboOficialCarregando = true;
    render(); // mostra "carregando base..."
    try {
      await carregarCboOficial();
    } catch (e) {
      console.error(e);
      _cboOficialCarregando = false; // destrava a tela do "Carregando"
      showToast(e.message || 'Não foi possível carregar a base do CBO. Recarregue a página.');
      render();
      return;
    }
  }
  _cboResultados = buscarCboOficial(termo);
  render();
}

// Cartão de um resultado da busca no CBO oficial.
function renderResultadoCbo(oc) {
  const sinonimos = oc.sinonimos && oc.sinonimos.length ? oc.sinonimos.slice(0, 6).join(', ') : null;
  const nAtiv = cboAtividadesPlanas(oc).length;
  const nAreas = (oc.areas || []).length;
  return `
    <div class="cbo-item" style="align-items:flex-start;">
      <div style="flex:1;">
        <b>${escaparHtml(oc.titulo)}</b><br>
        <span>CBO ${escaparHtml(oc.codigo)} · ${escaparHtml(oc.familia)}</span>
        ${sinonimos ? `<br><span class="small-muted" style="font-size:11.5px;">Também chamado de: ${escaparHtml(sinonimos)}${oc.sinonimos.length > 6 ? '…' : ''}</span>` : ''}
        ${nAtiv ? `<br><span class="small-muted" style="font-size:11.5px;">${nAtiv} atividade${nAtiv === 1 ? '' : 's'} em ${nAreas} área${nAreas === 1 ? '' : 's'} de atuação (CBO)</span>` : ''}
      </div>
      <button class="btn btn-sm" onclick="criarCargoDeCbo('${oc.codigo}')">Usar este cargo →</button>
    </div>`;
}

// Cria um cargo interno já vinculado a esta ocupação da CBO. O nome interno
// começa igual ao título oficial (a empresa pode renomear depois), e as
// atividades da CBO entram como responsabilidades iniciais do desenho — que
// a empresa personaliza. Guarda o vínculo oficial em cargo.cboOficial.
function criarCargoDeCbo(codigo) {
  const oc = typeof CBO_OFICIAL !== 'undefined' ? CBO_OFICIAL.find((o) => o.codigo === codigo) : null;
  if (!oc) {
    showToast('Ocupação não encontrada.');
    return;
  }
  // Separa a área "Competências pessoais" (comportamental) das demais (técnicas).
  const areas = oc.areas || [];
  const areaComp = areas.find((ar) => /compet[êe]ncias?\s+pessoa/i.test(ar.a));
  const areasTecnicas = areas.filter((ar) => ar !== areaComp);
  const competenciasCbo = areaComp ? areaComp.i || [] : [];

  // Responsabilidades: as atividades técnicas, organizadas por área (a área
  // vira um marcador em MAIÚSCULAS pra dar contexto, seguida das atividades).
  const responsabilidades = [];
  areasTecnicas.forEach((ar) => {
    responsabilidades.push(`— ${ar.a.toUpperCase()} —`);
    (ar.i || []).forEach((atv) => responsabilidades.push(atv));
  });

  // Rascunhos gerados para os campos que a CBO não traz (a empresa ajusta).
  const rasc = gerarRascunhosCbo(oc, areasTecnicas, competenciasCbo);

  const novo = {
    id: uid(),
    nome: oc.titulo, // nome interno (editável) — começa igual ao oficial
    familia: oc.familia || 'Operacional',
    natureza: 'Operacional',
    cbo: oc.codigo,
    origemCBO: true,
    // Vínculo oficial da CBO, preservado à parte do nome interno.
    cboOficial: {
      codigo: oc.codigo,
      tituloOficial: oc.titulo,
      familia: oc.familia,
      sinonimos: oc.sinonimos || [],
      areas: areas.map((ar) => ar.a),
      vinculadoEm: new Date().toISOString(),
    },
    indicadoresN: [],
    indicadoresO: [],
    indicadoresR: [],
    desenho: {
      versao: 1,
      aprovado: false,
      area: oc.familia || '', // área/família ocupacional da CBO
      nivelHierarquico: '',
      regimeTrabalho: '',
      subordinacao: '',
      subordinadosDiretos: '',
      localTrabalho: '',
      missao: rasc.missao,
      // Atividades técnicas da CBO, agrupadas por área, viram responsabilidades.
      responsabilidades,
      culturaPostura: '',
      formacaoAcademica: rasc.formacao,
      experienciaProfissional: rasc.experiencia,
      conhecimentosTecnicos: rasc.conhecimentos,
      idiomas: '', // Grupo 3 — específico da empresa, fica em branco
      // Competências pessoais da CBO viram as competências comportamentais
      // (o campo é uma lista de textos — uma competência por linha).
      competenciasComportamentais: competenciasCbo.slice(),
      ferramentasSistemas: [], // Grupo 3 — específico da empresa
      kpis: [], // Grupo 3 — metas são decisão da empresa
      condicoesTrabalho: rasc.condicoes,
      perspectivasCarreira: rasc.perspectivas,
    },
    versoes: [],
    descontinuado: false,
    ...novoCarimbo(),
  };
  state.cargos.push(novo);
  // Gera automaticamente os indicadores de avaliação (5 por nível) a partir
  // das áreas da CBO — a empresa não precisa cadastrar perguntas à mão.
  novo._cboAreasParaIndicadores = areas;
  const ind = gerarIndicadoresDoCargo(novo);
  delete novo._cboAreasParaIndicadores; // não persiste esse campo auxiliar
  novo.indicadoresN = ind.indicadoresN;
  novo.indicadoresO = ind.indicadoresO;
  novo.indicadoresR = ind.indicadoresR;
  state.cargoEditando = novo.id;
  registrarAuditoria('cargo.criado_do_cbo', { codigo: oc.codigo, titulo: oc.titulo });
  showToast(`Cargo criado a partir da CBO ${oc.codigo}. Personalize o desenho e publique.`);
  goto('desenho');
}
