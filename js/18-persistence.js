/* =========================================================
   PERSISTÊNCIA — só os dados de negócio da empresa são salvos
   (navegação/preview de papel ficam só na sessão do navegador)
   ========================================================= */
const PERSIST_KEYS = [
  'empresa',
  'estrutura',
  'cultura',
  'cargos',
  'colaboradores',
  'bancoAcoes',
  'ciclos',
  'configuracoes',
  'feedbackContinuo',
  'pesquisasClima',
  'nr1',
  'rs',
];

let _salvarTimer = null;
let _minhaUltimaAtividadeEm = 0; // Date.now() da última vez que EU fiz alguma ação (qualquer render())
// PROTEÇÃO CRÍTICA (incidente real de perda de dados): antes, se carregarEstado()
// falhasse silenciosamente (erro de rede, instabilidade, etc.), o "state" ficava
// nos valores vazios do seed() -- e o próximo render() agendava um salvamento
// automático que GRAVAVA esse estado vazio por cima dos dados reais da empresa,
// apagando tudo sem nenhum aviso. Agora, NENHUM salvamento pode acontecer nesta
// sessão até que carregarEstado() confirme, sem erro, que os dados foram lidos.
let _cargaInicialOk = false;

/* ---------- SALVAMENTO SEGURO (docs/SALVAMENTO-SEGURO.md e docs/SEGURANCA-PAPEIS.md) ----------
   Os dados da empresa são UM documento. Antes, quem salvava sobrescrevia tudo e duas pessoas usando ao mesmo tempo
   apagavam o trabalho uma da outra sem aviso. Agora:
   - cada gravação sobe a VERSÃO do documento (sql/44) e só vale se a versão ainda for a que EU carreguei;
   - se outra pessoa gravou antes, busco a versão nova e COMBINO as alterações (js/53-merge-estado.js);
   - só gravo as ÁREAS que EU mudei E que o meu papel pode gravar (se nada mudou, não grava, e ninguém é avisado à toa);
   - a gravação é feita por uma FUNÇÃO DO BANCO (sql/45) que confere de novo o papel e só aceita as áreas permitidas;
   - gravações são feitas uma de cada vez; se falhar, a alteração continua marcada como "não salva" e tenta de novo. */
let _versaoCarregada = 0; // versão do documento que EU carreguei (0 = ainda não existe no servidor)
let _baseEstado = null; // cópia do que está no servidor nessa versão: a "base" da combinação
let _baseCanon = {}; // texto canônico de cada área da base: serve para saber o que EU mudei
let _semControleDeVersao = false; // banco sem a coluna "versao" (sql/44 ainda não rodou): volta ao modo antigo
let _rpcIndisponivel = false; // banco sem a função salvar_dados_areas (sql/45 ainda não rodou): grava o documento direto
let _filaSalvamento = Promise.resolve();
let _ultimaFalhaSalvarEm = 0;
const SALVAMENTO_TENTATIVAS = 4;

// Quais áreas do documento cada papel pode GRAVAR. É o espelho do sql/45 (um teste confere que os dois são iguais).
const AREAS_GRAVAVEIS_POR_PAPEL = {
  owner: [
    'empresa',
    'estrutura',
    'cultura',
    'cargos',
    'colaboradores',
    'bancoAcoes',
    'ciclos',
    'configuracoes',
    'feedbackContinuo',
    'pesquisasClima',
    'nr1',
    'rs',
  ],
  rh: [
    'estrutura',
    'cultura',
    'cargos',
    'colaboradores',
    'bancoAcoes',
    'ciclos',
    'configuracoes',
    'feedbackContinuo',
    'pesquisasClima',
    'nr1',
    'rs',
  ],
  lider: ['colaboradores', 'bancoAcoes', 'ciclos', 'feedbackContinuo', 'pesquisasClima', 'rs'],
  colaborador: ['colaboradores', 'bancoAcoes', 'ciclos', 'feedbackContinuo', 'pesquisasClima'],
};
function areasGravaveisDoPapel() {
  return AREAS_GRAVAVEIS_POR_PAPEL[meuPapelReal] || [];
}

function payloadAtualDoEstado() {
  const payload = {};
  PERSIST_KEYS.forEach((k) => (payload[k] = state[k]));
  return payload;
}
// A base inteira (o que o servidor tem nessa versão): na carga, depois de combinar e no modo antigo.
function marcarBaseDoServidor(payload, versao) {
  _baseEstado = clonarPayloadEstado(payload);
  _baseCanon = canonPorChave(_baseEstado, PERSIST_KEYS);
  _versaoCarregada = versao || 0;
}
// Só as áreas que acabei de gravar passam a ser a nova base; as outras continuam como estavam.
function marcarBaseDasAreas(areas, versao) {
  _baseEstado = _baseEstado || {};
  Object.keys(areas).forEach((k) => {
    _baseEstado[k] = areas[k];
    _baseCanon[k] = canonicoEstado(areas[k]);
  });
  _versaoCarregada = versao || 0;
}
// As áreas que EU mudei desde que carreguei (ou desde a última gravação) e que posso gravar. No modo antigo (sem sql/44) vale tudo.
function areasAlteradasNoEstado() {
  const podem = _semControleDeVersao ? PERSIST_KEYS : areasGravaveisDoPapel();
  return PERSIST_KEYS.filter((k) => podem.includes(k) && canonicoEstado(state[k]) !== _baseCanon[k]);
}
function temAlteracoesNaoSalvas() {
  return _cargaInicialOk && !_semControleDeVersao && areasAlteradasNoEstado().length > 0;
}
if (typeof window !== 'undefined' && window.addEventListener) {
  // fechar a aba antes de a gravação terminar (ou com falha de rede) perderia a alteração: pede confirmação
  window.addEventListener('beforeunload', (ev) => {
    if (temAlteracoesNaoSalvas()) {
      ev.preventDefault();
      ev.returnValue = '';
    }
  });
}

function agendarSalvamento() {
  if (!empresaIdAtual) return;
  if (!_cargaInicialOk) {
    console.warn('Salvamento bloqueado: os dados desta empresa ainda não foram carregados com sucesso nesta sessão.');
    return;
  }
  _minhaUltimaAtividadeEm = Date.now();
  clearTimeout(_salvarTimer);
  _salvarTimer = setTimeout(salvarEstado, 500);
}

// Grava de uma em uma (quem espera o resultado, como "await salvarEstado()", espera a fila inteira).
function salvarEstado() {
  _filaSalvamento = _filaSalvamento.then(salvarEstadoUmaVez, salvarEstadoUmaVez);
  return _filaSalvamento;
}

function avisarFalhaAoSalvar(erro) {
  console.error('Falha ao salvar', erro);
  if (Date.now() - _ultimaFalhaSalvarEm > 30000)
    showToast('Não foi possível salvar agora. Suas alterações continuam na tela e o sistema vai tentar de novo.');
  _ultimaFalhaSalvarEm = Date.now();
  clearTimeout(_salvarTimer);
  _salvarTimer = setTimeout(salvarEstado, 15000); // a alteração segue marcada como "não salva": a próxima tentativa a leva
}
// O banco recusou por falta de permissão (acesso mudou, conta desativada ou página antiga): tentar de novo não adianta.
function avisarSemPermissao(erro) {
  console.error('Gravação recusada por permissão', erro);
  if (Date.now() - _ultimaFalhaSalvarEm > 30000)
    showToast(
      'Não foi possível salvar: o seu acesso não permite esta alteração. Atualize a página (Ctrl+F5) ou entre de novo no sistema.'
    );
  _ultimaFalhaSalvarEm = Date.now();
}

// Caminho principal: a FUNÇÃO DO BANCO grava só as áreas enviadas e permitidas. Devolve
// { ok, versao, rejeitadas } | { conflito } | { semRpc } | { semPermissao } | { erro }.
async function gravarAreasPelaFuncao(areas, versao) {
  const { data, error } = await sb.rpc('salvar_dados_areas', { p_areas: areas, p_versao: versao || 0 });
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function|salvar_dados_areas/i.test(error.message || ''))
      return { semRpc: true };
    if (error.code === '42501' || /sem_acesso/.test(error.message || '')) return { semPermissao: true, erro: error };
    return { erro: error };
  }
  if (data && data.conflito) return { conflito: true };
  return { ok: true, versao: data && data.versao, rejeitadas: (data && data.rejeitadas) || [] };
}

// Caminho antigo (só existe para o site continuar funcionando se subir ANTES do sql/45): grava o documento direto, inteiro.
async function gravarComVersao(payload, versao) {
  const agora = new Date().toISOString();
  if (!versao) {
    // o documento ainda não existe (empresa nova): cria. Se alguém criou antes, é conflito.
    const { data, error } = await sb
      .from('dados_sistema')
      .insert({ empresa_id: empresaIdAtual, payload, atualizado_em: agora })
      .select('versao');
    if (error) return error.code === '23505' ? { conflito: true } : { erro: error };
    return { ok: true, versao: (data && data[0] && data[0].versao) || 1 };
  }
  // só grava se a versão ainda for a que eu carreguei (o próprio banco confere, de forma atômica)
  const { data, error } = await sb
    .from('dados_sistema')
    .update({ payload, atualizado_em: agora })
    .eq('empresa_id', empresaIdAtual)
    .eq('versao', versao)
    .select('versao');
  if (error) return { erro: error };
  if (!data || !data.length) return { conflito: true };
  return { ok: true, versao: data[0].versao };
}

// O banco recusou áreas que o meu papel não pode gravar: volto essas áreas ao que o servidor tem (senão ficariam "não salvas" para sempre).
async function reverterAreasRejeitadas(areas) {
  const { data, error } = await sb
    .from('dados_sistema')
    .select('payload')
    .eq('empresa_id', empresaIdAtual)
    .maybeSingle();
  if (!error && data && data.payload) {
    areas.forEach((k) => {
      if (data.payload[k] !== undefined) state[k] = data.payload[k];
      _baseEstado[k] = clonarPayloadEstado({ v: state[k] }).v;
      _baseCanon[k] = canonicoEstado(state[k]);
    });
  }
  showToast(`Algumas alterações não foram salvas porque o seu perfil não pode alterar: ${areas.join(', ')}.`);
}

// Alguém gravou antes de mim: busca a versão nova e combina as duas alterações. A tela NÃO é redesenhada sozinha (poderia
// apagar um formulário em preenchimento): o botão "Atualizar" ganha o aviso, e a próxima ação já mostra o resultado combinado.
async function combinarComServidor() {
  const { data, error } = await sb
    .from('dados_sistema')
    .select('payload, versao')
    .eq('empresa_id', empresaIdAtual)
    .maybeSingle();
  if (error) {
    avisarFalhaAoSalvar(error);
    return false;
  }
  const remoto = (data && data.payload) || {};
  const { estado, conflitos } = mesclarEstadoRemoto({
    base: _baseEstado,
    meu: payloadAtualDoEstado(),
    remoto,
    chaves: PERSIST_KEYS,
  });
  PERSIST_KEYS.forEach((k) => {
    if (estado[k] !== undefined) state[k] = estado[k];
  });
  marcarBaseDoServidor(remoto, data ? data.versao : 0);
  _haDadosNovos = true;
  renderBotaoAtualizar();
  if (conflitos.length) {
    showToast(
      `Suas alterações foram combinadas com as de outra pessoa. Em ${conflitos.length} ponto(s) as duas mexeram no mesmo campo e prevaleceu a sua.`
    );
    if (typeof registrarAuditoria === 'function')
      registrarAuditoria('dados.alteracoes_combinadas', {
        pontos: conflitos.length,
        areas: [...new Set(conflitos.map((c) => c.split(/[.[]/)[0]))],
      });
  } else {
    showToast('Suas alterações foram combinadas com as que outra pessoa fez ao mesmo tempo.');
  }
  return true;
}

// Modo antigo (sem controle de versão): só existe para o sistema continuar funcionando se o site subir ANTES do SQL 44.
async function salvarModoAntigo() {
  const { error } = await sb
    .from('dados_sistema')
    .upsert({ empresa_id: empresaIdAtual, payload: payloadAtualDoEstado(), atualizado_em: new Date().toISOString() });
  if (error) console.error('Falha ao salvar', error);
}

async function salvarEstadoUmaVez() {
  try {
    if (!_cargaInicialOk) {
      console.error(
        'Salvamento bloqueado: tentativa de salvar sem confirmação de carga bem-sucedida. Isso não deveria acontecer -- investigar.'
      );
      return;
    }
    if (_semControleDeVersao) return await salvarModoAntigo();
    for (let tentativa = 1; tentativa <= SALVAMENTO_TENTATIVAS; tentativa++) {
      const alteradas = areasAlteradasNoEstado();
      if (!alteradas.length) return; // nada novo (ou só áreas que o meu papel não grava): não grava nem avisa os outros
      // o que vai ser gravado É o que fica marcado como salvo: um retrato do documento tirado AGORA (alterações feitas durante a gravação ficam para a próxima)
      const instantaneo = clonarPayloadEstado(payloadAtualDoEstado());
      const areas = {};
      alteradas.forEach((k) => (areas[k] = instantaneo[k]));
      let r = _rpcIndisponivel ? { semRpc: true } : await gravarAreasPelaFuncao(areas, _versaoCarregada);
      if (r.semRpc) {
        _rpcIndisponivel = true; // o banco ainda não tem a função (sql/45): grava o documento direto, como antes
        r = await gravarComVersao(instantaneo, _versaoCarregada);
        if (r.ok) {
          marcarBaseDoServidor(instantaneo, r.versao);
          return;
        }
      } else if (r.ok) {
        marcarBaseDasAreas(areas, r.versao);
        if (r.rejeitadas.length) await reverterAreasRejeitadas(r.rejeitadas);
        return;
      }
      if (r.semPermissao) return avisarSemPermissao(r.erro);
      if (r.conflito) {
        if (!(await combinarComServidor())) return;
        continue;
      }
      if (r.erro && (r.erro.code === '42703' || /versao/i.test(r.erro.message || ''))) {
        _semControleDeVersao = true; // o banco ainda não tem a coluna: volta ao modo antigo
        console.warn('Banco sem a coluna "versao": rode sql/44-dados-sistema-versao.sql. Salvando no modo antigo.');
        return await salvarModoAntigo();
      }
      if (r.erro && (r.erro.code === '42501' || r.erro.code === 'PGRST301')) return avisarSemPermissao(r.erro);
      return avisarFalhaAoSalvar(r.erro);
    }
    avisarFalhaAoSalvar(new Error('Muitas alterações simultâneas de outras pessoas.'));
  } catch (erro) {
    avisarFalhaAoSalvar(erro);
  }
}

async function carregarEstado() {
  _cargaInicialOk = false; // trava salvamentos até confirmar que carregou de verdade
  _rpcIndisponivel = false; // descobre de novo se o banco já tem a função de gravação por área (sql/45)
  let { data, error } = await sb
    .from('dados_sistema')
    .select('payload, versao')
    .eq('empresa_id', empresaIdAtual)
    .maybeSingle();
  if (error && (error.code === '42703' || /versao/i.test(error.message || ''))) {
    // banco sem a coluna "versao" (o site subiu antes do SQL 44): carrega do jeito antigo e salva no modo antigo
    _semControleDeVersao = true;
    console.warn('Banco sem a coluna "versao": rode sql/44-dados-sistema-versao.sql. Funcionando no modo antigo.');
    ({ data, error } = await sb.from('dados_sistema').select('payload').eq('empresa_id', empresaIdAtual).maybeSingle());
  } else if (!error) {
    _semControleDeVersao = false;
  }
  if (error) {
    console.error('Falha ao carregar', error);
    // Propaga o erro -- quem chamou precisa saber que falhou e NÃO deve
    // seguir como se os dados estivessem carregados (ver iniciarComSessao).
    throw new Error('Não foi possível carregar os dados da empresa. Verifique sua conexão e tente novamente.');
  }
  if (data && data.payload && Object.keys(data.payload).length) {
    PERSIST_KEYS.forEach((k) => {
      if (data.payload[k] !== undefined) state[k] = data.payload[k];
    });
  }
  garantirIndicadoresPadraoCultura();
  marcarBaseDoServidor((data && data.payload) || {}, data && data.versao);
  _cargaInicialOk = true; // só agora é seguro permitir salvamentos automáticos
}
// Auto-correção: empresas cadastradas antes da introdução dos indicadores
// padrão de T/E ganham eles automaticamente, sem apagar os personalizados já criados.
function garantirIndicadoresPadraoCultura() {
  const padroesT = [
    { id: 't-padrao-1', nome: 'Respeito e ética nas relações de trabalho', origem: 'padrão' },
    { id: 't-padrao-2', nome: 'Colaboração e trabalho em equipe', origem: 'padrão' },
  ];
  const padroesE = [
    { id: 'e-padrao-1', nome: 'Interesse em aprender e se desenvolver continuamente', origem: 'padrão' },
    { id: 'e-padrao-2', nome: 'Disposição para assumir novos desafios', origem: 'padrão' },
  ];
  if (!state.cultura.indicadoresT.some((i) => i.origem === 'padrão') && !state.cultura.indicadoresPadraoRemovidosT) {
    state.cultura.indicadoresT = [...padroesT, ...state.cultura.indicadoresT];
  }
  if (!state.cultura.indicadoresE.some((i) => i.origem === 'padrão') && !state.cultura.indicadoresPadraoRemovidosE) {
    state.cultura.indicadoresE = [...padroesE, ...state.cultura.indicadoresE];
  }
}

/* =========================================================
   AUTENTICAÇÃO — login, cadastro (com ou sem código de
   convite) e a tela exibida enquanto não há sessão.
   ========================================================= */
