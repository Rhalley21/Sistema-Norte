/* =========================================================
   PERSISTÊNCIA — só os dados de negócio da empresa são salvos
   (navegação/preview de papel ficam só na sessão do navegador)
   ========================================================= */
const PERSIST_KEYS = ['empresa','estrutura','cultura','cargos','colaboradores','bancoAcoes','ciclos','configuracoes'];

let _salvarTimer = null;
function agendarSalvamento(){
  if(!empresaIdAtual) return;
  clearTimeout(_salvarTimer);
  _salvarTimer = setTimeout(salvarEstado, 500);
}
async function salvarEstado(){
  const payload = {};
  PERSIST_KEYS.forEach(k => payload[k] = state[k]);
  const { error } = await sb.from('dados_sistema').upsert({
    empresa_id: empresaIdAtual, payload, atualizado_em: new Date().toISOString()
  });
  if(error) console.error('Falha ao salvar', error);
}
async function carregarEstado(){
  const { data, error } = await sb.from('dados_sistema').select('payload').eq('empresa_id', empresaIdAtual).maybeSingle();
  if(error){ console.error('Falha ao carregar', error); return; }
  if(data && data.payload && Object.keys(data.payload).length){
    PERSIST_KEYS.forEach(k => { if(data.payload[k] !== undefined) state[k] = data.payload[k]; });
  }
  garantirIndicadoresPadraoCultura();
}
// Auto-correção: empresas cadastradas antes da introdução dos indicadores
// padrão de T/E ganham eles automaticamente, sem apagar os personalizados já criados.
function garantirIndicadoresPadraoCultura(){
  const padroesT = [
    {id:'t-padrao-1', nome:'Respeito e ética nas relações de trabalho', origem:'padrão'},
    {id:'t-padrao-2', nome:'Colaboração e trabalho em equipe', origem:'padrão'},
  ];
  const padroesE = [
    {id:'e-padrao-1', nome:'Interesse em aprender e se desenvolver continuamente', origem:'padrão'},
    {id:'e-padrao-2', nome:'Disposição para assumir novos desafios', origem:'padrão'},
  ];
  if(!state.cultura.indicadoresT.some(i=>i.origem==='padrão')){
    state.cultura.indicadoresT = [...padroesT, ...state.cultura.indicadoresT];
  }
  if(!state.cultura.indicadoresE.some(i=>i.origem==='padrão')){
    state.cultura.indicadoresE = [...padroesE, ...state.cultura.indicadoresE];
  }
}

/* =========================================================
   AUTENTICAÇÃO — login, cadastro (com ou sem código de
   convite) e a tela exibida enquanto não há sessão.
   ========================================================= */
