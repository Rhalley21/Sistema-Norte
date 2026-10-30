// =========================================================================
// "Recrutamento: o que fazer hoje" no painel inicial do Administrador e do RH. Garantias: só aparece para quem usa o
// recrutamento, é Administrador ou RH e tem algo a fazer; cada botão leva à vaga e à seção certas; as listas do servidor
// carregam uma vez só e só quando há recrutamento; os outros papéis não veem.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { carregarArquivos } = require('./helpers/carregar-arquivos.js');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const plano = (x) => JSON.parse(JSON.stringify(x));
const J = JSON.stringify;
const esperar = (ms = 30) => new Promise((r) => setTimeout(r, ms));

function ctx(papel = 'rh') {
  const c = carregarArquivos([
    'js/02-core-helpers.js',
    'js/40-page-rs.js',
    'js/44-page-processo-seletivo.js',
    'js/45-rs-etapas.js',
    'js/46-rs-video.js',
    'js/47-rs-cadastro.js',
    'js/48-rs-quadro.js',
    'js/49-rs-entrega.js',
    'js/50-rs-importacao.js',
  ]);
  Object.assign(c, { meuPapelReal: papel, meuPerfilId: 'p1', URL, __gotos: [], __chamadas: [], __renders: 0 });
  c.goto = (id) => c.__gotos.push(id);
  c.render = () => c.__renders++;
  c.showToast = () => {};
  c.registrarAuditoria = () => {};
  c.sb = {
    functions: {
      invoke: async (nome, o) => (
        c.__chamadas.push({ nome, acao: o.body && o.body.action }),
        { data: { entregas: [], videos: [] }, error: null }
      ),
    },
  };
  return c;
}
const rodar = (c, codigo) => vm.runInContext(codigo, c);
const cand = (extra) => ({
  id: 'x',
  vagaId: 'v1',
  nome: 'Pessoa',
  email: 'p@x.com',
  etapa: 'triagem',
  reprovado: false,
  historico: [],
  scorecards: [],
  ...extra,
});

function cenario(c, { requisicoes, candidatos = [], entregas = [], videos = [] } = {}) {
  rodar(
    c,
    `state.cargos = [{ id: 'cg', nome: 'Vendedor' }]; state.estrutura = [];
    state.rs = { requisicoes: ${J(requisicoes || [{ id: 'v1', codigo: 'REQ-001', cargoId: 'cg', status: 'aprovada', etapasAtivas: ['triagem', 'video'] }])}, candidatos: ${J(candidatos)}, configEtapas: {} };
    _rsEntregas = ${J(entregas)}; _rsVideos = ${J(videos)}; _rsEntregasErro = ''; _rsRequisicaoExpandida = null; _psFichaAberta = null; _psVagasAberto = false; _rsOrientacoesVagaAberta = null;`
  );
}
const cartao = (c) => rodar(c, 'renderPendenciasRecrutamento()');

test('mostra o que há para fazer, com a contagem, para Administrador e RH', () => {
  for (const papel of ['owner', 'rh']) {
    const c = ctx(papel);
    cenario(c, {
      requisicoes: [
        { id: 'v1', codigo: 'R1', cargoId: 'cg', status: 'aprovada', etapasAtivas: ['triagem'] },
        { id: 'v2', codigo: 'R2', cargoId: 'cg', status: 'pendente' },
      ],
      candidatos: [
        cand({ id: 'a', etapa: 'nova' }),
        cand({ id: 'b', etapa: 'nova' }),
        cand({ id: 'd', etapa: 'aprovado' }),
      ],
      entregas: [{ candidato_ref: 'b', status: 'enviado' }],
    });
    const h = cartao(c);
    assert.ok(h.includes('Recrutamento: o que fazer hoje'), papel);
    assert.ok(
      h.includes('1 vaga(s) para aprovar') &&
        h.includes('2 candidato(s) para triar') &&
        h.includes('1 resultado(s) enviado(s) pelo candidato') &&
        h.includes('1 aprovado(s) para contratar'),
      papel
    );
  }
});

test('cada botão leva à pendência certa: chave e vaga no onclick', () => {
  const c = ctx('rh');
  cenario(c, {
    requisicoes: [
      { id: 'v1', codigo: 'R1', cargoId: 'cg', status: 'aprovada', etapasAtivas: ['triagem'] },
      { id: 'v2', codigo: 'R2', cargoId: 'cg', status: 'pendente' },
    ],
    candidatos: [cand({ id: 'a', etapa: 'nova' })],
  });
  const h = cartao(c);
  assert.ok(h.includes("irParaPendenciaRS('aprovar', null)") && h.includes("irParaPendenciaRS('triar', 'v1')"));
});

test('NÃO aparece para líder, colaborador, papel desconhecido ou sem papel (só Administrador e RH)', () => {
  for (const papel of ['lider', 'colaborador', null, 'xyz']) {
    const c = ctx(papel);
    cenario(c, { candidatos: [cand({ etapa: 'nova' })] });
    assert.equal(cartao(c), '', String(papel));
  }
});

test('NÃO aparece quando a empresa não usa o recrutamento, nem quando não há nada a fazer (e não consulta o servidor)', async () => {
  const c = ctx('rh');
  cenario(c, { requisicoes: [], candidatos: [] });
  rodar(c, '_rsEntregas = null; _rsVideos = null;');
  assert.equal(cartao(c), '');
  await esperar();
  assert.equal(c.__chamadas.length, 0, 'empresa sem recrutamento não gera chamadas ao servidor');
  cenario(c, {
    requisicoes: [{ id: 'v1', codigo: 'R1', cargoId: 'cg', status: 'aprovada', etapasAtivas: ['triagem'] }],
    candidatos: [cand({ etapa: 'triagem' })],
  });
  assert.equal(cartao(c), '', 'em dia: o cartão some');
});

test('as listas do servidor (resultados e vídeos) carregam UMA vez e só quando a empresa usa o recrutamento', async () => {
  const c = ctx('owner');
  cenario(c, { candidatos: [cand({ etapa: 'triagem' })] });
  rodar(c, '_rsEntregas = null;');
  cartao(c);
  cartao(c);
  cartao(c);
  await esperar();
  assert.equal(c.__chamadas.filter((x) => x.acao === 'entrega_listar').length, 1);
  // depois de carregada, não pede de novo
  cartao(c);
  await esperar();
  assert.equal(c.__chamadas.filter((x) => x.acao === 'entrega_listar').length, 1);
});

test('quem NÃO é Administrador/RH nunca dispara carga de resultados', async () => {
  const c = ctx('lider');
  cenario(c, { candidatos: [cand({ etapa: 'nova' })] });
  rodar(c, '_rsEntregas = null;');
  cartao(c);
  await esperar();
  assert.equal(c.__chamadas.length, 0);
});

test('ir para a pendência: abre o Processo seletivo na vaga certa, fecha a ficha e abre a seção certa', () => {
  const c = ctx('rh');
  cenario(c, {});
  rodar(c, "_psFichaAberta = 'x'; irParaPendenciaRS('triar', 'v1')");
  assert.deepEqual(plano(c.__gotos), ['rs_processo']);
  assert.equal(rodar(c, '_rsRequisicaoExpandida'), 'v1');
  assert.equal(rodar(c, '_psFichaAberta'), null);
  assert.equal(rodar(c, '_psVagasAberto'), false);
  rodar(c, "irParaPendenciaRS('aprovar', null)");
  assert.equal(rodar(c, '_psVagasAberto'), true, 'vagas para aprovar abre a seção das vagas');
  assert.equal(rodar(c, '_rsRequisicaoExpandida'), null);
  rodar(c, "irParaPendenciaRS('prova', 'v1')");
  assert.equal(rodar(c, '_rsOrientacoesVagaAberta'), 'v1', 'a prova prática abre a configuração da vaga');
  assert.deepEqual(plano(c.__gotos), ['rs_processo', 'rs_processo', 'rs_processo']);
});

test('o painel do RH e o do Administrador incluem o cartão do recrutamento; gestor e colaborador não', () => {
  const src = ler('js/07-router-dashboard.js');
  assert.ok(
    /renderMinhaAvaliacaoPendente\(\) \+\s*renderPendenciasRecrutamento\(\) \+\s*renderPendenciasRH\(\)/.test(src)
  );
  assert.ok(/renderPrimeirosPassos\(\) \+\s*renderPendenciasRecrutamento\(\) \+\s*renderDashboardAdmin\(/.test(src));
  assert.equal(
    (src.match(/renderPendenciasRecrutamento\(\)/g) || []).length,
    2,
    'só nos painéis do RH e do Administrador'
  );
  const colab = /state\.role === 'colaborador'\) \{\s*body = ([^;]+);/.exec(src)[1];
  assert.ok(!colab.includes('Recrutamento'));
});

test('regressão: a faixa do próprio Processo seletivo continua igual (mesma lista de pendências)', () => {
  const c = ctx('rh');
  cenario(c, {
    candidatos: [cand({ id: 'a', etapa: 'nova' })],
    requisicoes: [{ id: 'v1', codigo: 'R1', cargoId: 'cg', status: 'aprovada', etapasAtivas: ['triagem'] }],
  });
  assert.ok(rodar(c, 'faixaPendenciasHtml(true)').includes('1 candidato(s) para triar'));
});
