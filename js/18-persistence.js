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
// nos valores vazios do seed() — e o próximo render() agendava um salvamento
// automático que GRAVAVA esse estado vazio por cima dos dados reais da empresa,
// apagando tudo sem nenhum aviso. Agora, NENHUM salvamento pode acontecer nesta
// sessão até que carregarEstado() confirme, sem erro, que os dados foram lidos.
let _cargaInicialOk = false;
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
async function salvarEstado() {
  if (!_cargaInicialOk) {
    console.error(
      'Salvamento bloqueado: tentativa de salvar sem confirmação de carga bem-sucedida. Isso não deveria acontecer — investigar.'
    );
    return;
  }
  const payload = {};
  PERSIST_KEYS.forEach((k) => (payload[k] = state[k]));
  const { error } = await sb.from('dados_sistema').upsert({
    empresa_id: empresaIdAtual,
    payload,
    atualizado_em: new Date().toISOString(),
  });
  if (error) console.error('Falha ao salvar', error);
}
async function carregarEstado() {
  _cargaInicialOk = false; // trava salvamentos até confirmar que carregou de verdade
  const { data, error } = await sb
    .from('dados_sistema')
    .select('payload')
    .eq('empresa_id', empresaIdAtual)
    .maybeSingle();
  if (error) {
    console.error('Falha ao carregar', error);
    // Propaga o erro — quem chamou precisa saber que falhou e NÃO deve
    // seguir como se os dados estivessem carregados (ver iniciarComSessao).
    throw new Error('Não foi possível carregar os dados da empresa. Verifique sua conexão e tente novamente.');
  }
  if (data && data.payload && Object.keys(data.payload).length) {
    PERSIST_KEYS.forEach((k) => {
      if (data.payload[k] !== undefined) state[k] = data.payload[k];
    });
  }
  garantirIndicadoresPadraoCultura();
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
