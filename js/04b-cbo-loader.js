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
    if (_cboOficialCarregando) {
      // Já está carregando — espera terminar.
      const iv = setInterval(() => {
        if (typeof CBO_OFICIAL !== 'undefined') {
          clearInterval(iv);
          _cboOficialCarregado = true;
          resolve();
        }
      }, 120);
      return;
    }
    _cboOficialCarregando = true;
    const s = document.createElement('script');
    // mesma versão de cache-busting do resto dos assets
    s.src = 'js/04a-data-cbo-oficial.js?v=0.60.0';
    s.onload = () => {
      _cboOficialCarregando = false;
      _cboOficialCarregado = true;
      resolve();
    };
    s.onerror = () => {
      _cboOficialCarregando = false;
      reject(new Error('Falha ao carregar a base do CBO.'));
    };
    document.head.appendChild(s);
  });
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
      showToast('Não foi possível carregar a base do CBO. Recarregue a página.');
      return;
    }
  }
  _cboResultados = buscarCboOficial(termo);
  render();
}

// Cartão de um resultado da busca no CBO oficial.
function renderResultadoCbo(oc) {
  const sinonimos = oc.sinonimos && oc.sinonimos.length ? oc.sinonimos.slice(0, 6).join(', ') : null;
  const nAtiv = oc.atividades ? oc.atividades.length : 0;
  return `
    <div class="cbo-item" style="align-items:flex-start;">
      <div style="flex:1;">
        <b>${escaparHtml(oc.titulo)}</b><br>
        <span>CBO ${escaparHtml(oc.codigo)} · ${escaparHtml(oc.familia)}</span>
        ${sinonimos ? `<br><span class="small-muted" style="font-size:11.5px;">Também chamado de: ${escaparHtml(sinonimos)}${oc.sinonimos.length > 6 ? '…' : ''}</span>` : ''}
        ${nAtiv ? `<br><span class="small-muted" style="font-size:11.5px;">${nAtiv} atividade${nAtiv === 1 ? '' : 's'} descrita${nAtiv === 1 ? '' : 's'} na CBO</span>` : ''}
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
      vinculadoEm: new Date().toISOString(),
    },
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
      // Atividades oficiais da CBO viram responsabilidades iniciais (a empresa edita).
      responsabilidades: (oc.atividades || []).slice(0, 20),
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
  // Gera automaticamente os indicadores de avaliação (5 por nível) a partir
  // da CBO vinculada — a empresa não precisa cadastrar perguntas à mão.
  const ind = gerarIndicadoresDoCargo(novo);
  novo.indicadoresN = ind.indicadoresN;
  novo.indicadoresO = ind.indicadoresO;
  novo.indicadoresR = ind.indicadoresR;
  state.cargoEditando = novo.id;
  registrarAuditoria('cargo.criado_do_cbo', { codigo: oc.codigo, titulo: oc.titulo });
  showToast(`Cargo criado a partir da CBO ${oc.codigo}. Personalize o desenho e publique.`);
  goto('desenho');
}
