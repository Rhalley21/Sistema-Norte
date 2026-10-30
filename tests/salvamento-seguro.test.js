// =========================================================================
// Salvamento seguro (js/18-persistence.js + js/53-merge-estado.js + sql/44): duas pessoas usando ao mesmo tempo não
// apagam o trabalho uma da outra. Testado com um servidor simulado que se comporta como o banco real: a versão sobe
// sozinha a cada atualização, a gravação só vale se a versão bater, e criar um documento que já existe dá erro de duplicidade.
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

// ---------- o servidor simulado ----------
function payloadInicial() {
  return {
    empresa: { nome: 'Loja X' },
    estrutura: [],
    cultura: {
      missao: 'M',
      indicadoresT: [],
      indicadoresE: [],
      indicadoresPadraoRemovidosT: true,
      indicadoresPadraoRemovidosE: true,
    },
    cargos: [],
    colaboradores: [{ id: 'c1', nome: 'Ana' }],
    bancoAcoes: [],
    ciclos: [{ id: 'k1', nota: null }],
    configuracoes: {},
    feedbackContinuo: [],
    pesquisasClima: [],
    nr1: {},
    rs: {
      requisicoes: [],
      candidatos: [
        { id: 'a', etapa: 'nova', historico: [] },
        { id: 'b', etapa: 'nova', historico: [] },
      ],
    },
  };
}
function criarServidor({ semColuna = false, comLinha = true } = {}) {
  const s = {
    linha: comLinha ? { empresa_id: 'e1', payload: payloadInicial(), versao: 1 } : null,
    chamadas: [],
    hook: null,
    falhar: null,
  };
  const copia = (x) => JSON.parse(JSON.stringify(x));
  s.from = (tabela) => {
    assert.equal(tabela, 'dados_sistema');
    const q = { op: 'select', filtros: {}, cols: '', valores: null };
    const exec = async () => {
      s.chamadas.push({ op: q.op, filtros: { ...q.filtros }, cols: q.cols });
      if (s.falhar && q.op !== 'select') {
        const erro = s.falhar;
        s.falhar = null;
        return { data: null, error: erro };
      }
      if (semColuna && (/versao/.test(q.cols) || 'versao' in q.filtros))
        return { data: null, error: { code: '42703', message: 'column dados_sistema.versao does not exist' } };
      if (q.op === 'select') {
        if (!s.linha) return { data: null, error: null };
        return {
          data: /versao/.test(q.cols)
            ? { payload: copia(s.linha.payload), versao: s.linha.versao }
            : { payload: copia(s.linha.payload) },
          error: null,
        };
      }
      if (q.op === 'insert') {
        if (s.linha) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        s.linha = { empresa_id: 'e1', payload: copia(q.valores.payload), versao: 1 };
        return { data: [{ versao: 1 }], error: null };
      }
      if (q.op === 'update') {
        if (s.hook) s.hook(); // outra pessoa grava ANTES de mim, no mesmo instante
        if (!s.linha || (q.filtros.versao !== undefined && s.linha.versao !== q.filtros.versao))
          return { data: [], error: null };
        s.linha.payload = copia(q.valores.payload);
        s.linha.versao += 1; // o gatilho do SQL 44
        return { data: [{ versao: s.linha.versao }], error: null };
      }
      if (q.op === 'upsert') {
        if (s.linha) {
          s.linha.payload = copia(q.valores.payload);
          if (!semColuna) s.linha.versao += 1;
        } else s.linha = { empresa_id: 'e1', payload: copia(q.valores.payload), versao: 1 };
        return { error: null };
      }
    };
    const b = {
      select(cols) {
        q.cols = cols;
        return b;
      },
      eq(c, v) {
        q.filtros[c] = v;
        return b;
      },
      maybeSingle() {
        return exec();
      },
      insert(v) {
        q.op = 'insert';
        q.valores = v;
        return b;
      },
      update(v) {
        q.op = 'update';
        q.valores = v;
        return b;
      },
      upsert(v) {
        q.op = 'upsert';
        q.valores = v;
        return b;
      },
      then(res, rej) {
        return exec().then(res, rej);
      },
    };
    return b;
  };
  // sem o sql/45 o banco não tem a função de gravação por área: o navegador cai para a gravação direta (o caminho que estes testes cobrem)
  s.rpc = async () => ({
    data: null,
    error: { code: 'PGRST202', message: 'Could not find the function public.salvar_dados_areas in the schema cache' },
  });
  s.gravacoes = () => s.chamadas.filter((x) => x.op !== 'select');
  return s;
}
// outra pessoa grava direto no servidor (como se fosse outro navegador): aplica a mudança e sobe a versão
function outraPessoaGrava(s, mudar) {
  mudar(s.linha.payload);
  s.linha.versao += 1;
}

// ---------- um "navegador" ----------
function criarCliente(servidor) {
  const c = carregarArquivos(['js/53-merge-estado.js', 'js/18-persistence.js']);
  Object.assign(c, {
    sb: servidor,
    empresaIdAtual: 'e1',
    meuPapelReal: 'owner',
    __toasts: [],
    __auditoria: [],
    __timers: [],
    __console: [],
  });
  c.state = {
    empresa: null,
    estrutura: [],
    cultura: { missao: '', indicadoresT: [], indicadoresE: [] },
    cargos: [],
    colaboradores: [],
    bancoAcoes: [],
    ciclos: [],
    configuracoes: {},
    feedbackContinuo: [],
    pesquisasClima: [],
    nr1: {},
    rs: { requisicoes: [], candidatos: [] },
  };
  c.setTimeout = (fn, ms) => (c.__timers.push({ fn, ms }), c.__timers.length);
  c.clearTimeout = () => {};
  c.showToast = (t) => c.__toasts.push(t);
  c.renderBotaoAtualizar = () => {};
  c.registrarAuditoria = (e, d) => c.__auditoria.push([e, d]);
  c.console = {
    log() {},
    warn: (...a) => c.__console.push(['warn', ...a]),
    error: (...a) => c.__console.push(['error', ...a]),
  };
  return c;
}
const rodar = (c, codigo) => vm.runInContext(codigo, c);
const rodarAsync = (c, codigo) => vm.runInContext(`(async () => { ${codigo} })()`, c);
async function cliente(servidor) {
  const c = criarCliente(servidor);
  await rodarAsync(c, 'await carregarEstado();');
  return c;
}
const candidato = (c, id) => rodar(c, `state.rs.candidatos.find((x) => x.id === ${J(id)})`);

// ======================= carga e "o que mudei" =======================
test('carga: guarda a versão e a base do servidor; logo depois da carga nada está "não salvo"', async () => {
  const s = criarServidor();
  const c = await cliente(s);
  assert.equal(rodar(c, '_versaoCarregada'), 1);
  assert.deepEqual(plano(rodar(c, 'areasAlteradasNoEstado()')), []);
  assert.equal(rodar(c, 'temAlteracoesNaoSalvas()'), false);
  assert.equal(rodar(c, 'state.colaboradores[0].nome'), 'Ana');
});

test('se nada mudou, salvar NÃO grava nada e ninguém recebe aviso à toa (menos barulho em tempo real)', async () => {
  const s = criarServidor();
  const c = await cliente(s);
  await rodarAsync(c, 'await salvarEstado(); await salvarEstado();');
  assert.equal(s.gravacoes().length, 0);
  assert.equal(s.linha.versao, 1);
});

test('mudou uma área: grava com a condição "versão igual à que eu carreguei", sobe a versão e passa a ser "salvo"', async () => {
  const s = criarServidor();
  const c = await cliente(s);
  rodar(c, "state.rs.candidatos[0].etapa = 'triagem'");
  assert.deepEqual(plano(rodar(c, 'areasAlteradasNoEstado()')), ['rs']);
  assert.equal(rodar(c, 'temAlteracoesNaoSalvas()'), true);
  await rodarAsync(c, 'await salvarEstado();');
  const g = s.gravacoes();
  assert.equal(g.length, 1);
  assert.deepEqual([g[0].op, g[0].filtros], ['update', { empresa_id: 'e1', versao: 1 }]);
  assert.equal(s.linha.versao, 2);
  assert.equal(s.linha.payload.rs.candidatos[0].etapa, 'triagem');
  assert.equal(rodar(c, '_versaoCarregada'), 2);
  assert.equal(rodar(c, 'temAlteracoesNaoSalvas()'), false);
});

test('duas alterações seguidas minhas: a segunda usa a versão nova e não dá conflito', async () => {
  const s = criarServidor();
  const c = await cliente(s);
  rodar(c, "state.rs.candidatos[0].etapa = 'triagem'");
  await rodarAsync(c, 'await salvarEstado();');
  rodar(c, "state.colaboradores[0].nome = 'Ana Maria'");
  await rodarAsync(c, 'await salvarEstado();');
  assert.deepEqual(
    s.gravacoes().map((x) => x.filtros.versao),
    [1, 2]
  );
  assert.equal(s.linha.versao, 3);
  assert.equal(c.__toasts.length, 0);
});

test('o documento gravado é o INTEIRO (todas as áreas), como antes: nada some para quem ler direto', async () => {
  const s = criarServidor();
  const c = await cliente(s);
  rodar(c, 'state.configuracoes = { x: 1 }');
  await rodarAsync(c, 'await salvarEstado();');
  assert.deepEqual(Object.keys(s.linha.payload).sort(), plano(rodar(c, 'PERSIST_KEYS')).sort());
});

// ======================= o caso real: duas pessoas ao mesmo tempo =======================
test('O CASO REAL: o RH com a tela velha move um candidato DEPOIS de o líder salvar a avaliação — as duas coisas ficam', async () => {
  const s = criarServidor();
  const rh = await cliente(s);
  const lider = await cliente(s);
  rodar(lider, 'state.ciclos[0].nota = 8');
  await rodarAsync(lider, 'await salvarEstado();');
  assert.equal(s.linha.payload.ciclos[0].nota, 8);
  rodar(rh, "state.rs.candidatos[0].etapa = 'triagem'"); // a tela do RH ainda não sabe da avaliação
  await rodarAsync(rh, 'await salvarEstado();');
  assert.equal(s.linha.payload.ciclos[0].nota, 8, 'a avaliação do líder NÃO pode sumir');
  assert.equal(s.linha.payload.rs.candidatos[0].etapa, 'triagem', 'o movimento do RH também fica');
  assert.equal(rodar(rh, 'state.ciclos[0].nota'), 8, 'o RH passa a ter a avaliação na memória');
  assert.equal(rodar(rh, '_versaoCarregada'), s.linha.versao);
  assert.ok(rh.__toasts.some((t) => t.includes('combinadas com as que outra pessoa fez')));
  assert.equal(rodar(rh, '_haDadosNovos'), true, 'o botão Atualizar avisa; a tela não é redesenhada sozinha');
  assert.deepEqual(plano(rodar(rh, 'areasAlteradasNoEstado()')), []);
});

test('dois RHs movem candidatos DIFERENTES ao mesmo tempo: os dois movimentos ficam, sem conflito', async () => {
  const s = criarServidor();
  const rh1 = await cliente(s);
  const rh2 = await cliente(s);
  rodar(rh1, "state.rs.candidatos[0].etapa = 'triagem'");
  rodar(rh2, "state.rs.candidatos[1].etapa = 'video'");
  await rodarAsync(rh1, 'await salvarEstado();');
  await rodarAsync(rh2, 'await salvarEstado();');
  assert.deepEqual(
    s.linha.payload.rs.candidatos.map((x) => x.etapa),
    ['triagem', 'video']
  );
  assert.deepEqual(rh2.__auditoria, [], 'sem conflito de campo, nada vai para a Auditoria');
});

test('candidato NOVO de um RH e outro candidato NOVO de outro: entram os dois', async () => {
  const s = criarServidor();
  const rh1 = await cliente(s);
  const rh2 = await cliente(s);
  rodar(rh1, "state.rs.candidatos.push({ id: 'n1', etapa: 'nova', historico: [] })");
  rodar(rh2, "state.rs.candidatos.push({ id: 'n2', etapa: 'nova', historico: [] })");
  await rodarAsync(rh1, 'await salvarEstado();');
  await rodarAsync(rh2, 'await salvarEstado();');
  assert.deepEqual(s.linha.payload.rs.candidatos.map((x) => x.id).sort(), ['a', 'b', 'n1', 'n2']);
});

test('os dois mudam o MESMO campo do mesmo item: vale o de quem salvou por último, o toast avisa e a Auditoria guarda só o número e as áreas', async () => {
  const s = criarServidor();
  const a = await cliente(s);
  const b = await cliente(s);
  rodar(a, "state.rs.candidatos[0].etapa = 'video'");
  rodar(b, "state.rs.candidatos[0].etapa = 'prova'");
  await rodarAsync(a, 'await salvarEstado();');
  await rodarAsync(b, 'await salvarEstado();');
  assert.equal(s.linha.payload.rs.candidatos[0].etapa, 'prova');
  assert.ok(b.__toasts.some((t) => t.includes('1 ponto(s)') && t.includes('prevaleceu a sua')));
  assert.deepEqual(plano(b.__auditoria), [['dados.alteracoes_combinadas', { pontos: 1, areas: ['rs'] }]]);
  assert.ok(
    !J(b.__auditoria).includes('prova') && !J(b.__auditoria).includes('video'),
    'a Auditoria não guarda valores'
  );
});

test('histórico (lista que só cresce) de um candidato mexido pelos dois: os dois registros ficam', async () => {
  const s = criarServidor();
  const a = await cliente(s);
  const b = await cliente(s);
  rodar(a, "state.rs.candidatos[0].historico.push({ para: 'triagem', por: 'a' })");
  rodar(b, "state.rs.candidatos[0].historico.push({ para: 'video', por: 'b' })");
  await rodarAsync(a, 'await salvarEstado();');
  await rodarAsync(b, 'await salvarEstado();');
  assert.deepEqual(s.linha.payload.rs.candidatos[0].historico.map((h) => h.por).sort(), ['a', 'b']);
});

test('o outro apagou um candidato que eu movi: o candidato FICA (não se perde dado) e o conflito é avisado', async () => {
  const s = criarServidor();
  const a = await cliente(s);
  const b = await cliente(s);
  rodar(a, "state.rs.candidatos = state.rs.candidatos.filter((x) => x.id !== 'a')");
  rodar(b, "state.rs.candidatos[0].etapa = 'triagem'");
  await rodarAsync(a, 'await salvarEstado();');
  await rodarAsync(b, 'await salvarEstado();');
  assert.deepEqual(
    s.linha.payload.rs.candidatos.map((x) => [x.id, x.etapa]),
    [
      ['b', 'nova'],
      ['a', 'triagem'],
    ].sort((x, y) => (x[0] === 'b' ? -1 : 1))
  );
  assert.equal(rodar(b, "state.rs.candidatos.some((x) => x.id === 'a')"), true);
});

test('três pessoas ao mesmo tempo: todas as alterações sobrevivem', async () => {
  const s = criarServidor();
  const [a, b, d] = [await cliente(s), await cliente(s), await cliente(s)];
  rodar(a, "state.rs.candidatos[0].etapa = 'x1'");
  rodar(b, "state.colaboradores[0].nome = 'Nome B'");
  rodar(d, 'state.ciclos[0].nota = 9');
  await rodarAsync(a, 'await salvarEstado();');
  await rodarAsync(b, 'await salvarEstado();');
  await rodarAsync(d, 'await salvarEstado();');
  assert.deepEqual(
    [s.linha.payload.rs.candidatos[0].etapa, s.linha.payload.colaboradores[0].nome, s.linha.payload.ciclos[0].nota],
    ['x1', 'Nome B', 9]
  );
});

test('sem a minha edição o outro não é tocado: gravo só o que mudei, mas o documento sai completo e atualizado', async () => {
  const s = criarServidor();
  const a = await cliente(s);
  outraPessoaGrava(s, (p) => (p.empresa = { nome: 'Nome novo da empresa' }));
  rodar(a, "state.rs.candidatos[0].etapa = 'triagem'");
  await rodarAsync(a, 'await salvarEstado();');
  assert.equal(s.linha.payload.empresa.nome, 'Nome novo da empresa', 'a mudança do outro em outra área não é desfeita');
  assert.equal(s.linha.payload.rs.candidatos[0].etapa, 'triagem');
});

// ======================= corrida de verdade (o outro grava no meio) =======================
test('o outro grava NO MEIO da minha gravação (depois que eu conferi): o banco recusa, eu combino e tento de novo', async () => {
  const s = criarServidor();
  const a = await cliente(s);
  rodar(a, "state.rs.candidatos[0].etapa = 'triagem'");
  let vez = 0;
  s.hook = () => {
    if (vez++ === 0) outraPessoaGrava(s, (p) => (p.ciclos[0].nota = 7));
  };
  await rodarAsync(a, 'await salvarEstado();');
  assert.equal(s.linha.payload.ciclos[0].nota, 7);
  assert.equal(s.linha.payload.rs.candidatos[0].etapa, 'triagem');
  assert.equal(s.gravacoes().filter((x) => x.op === 'update').length, 2, 'uma recusada e uma aceita');
});

test('o outro grava sem parar (4 tentativas seguidas): paro com aviso, não perco a minha alteração e ela continua marcada como "não salva"', async () => {
  const s = criarServidor();
  const a = await cliente(s);
  rodar(a, "state.rs.candidatos[0].etapa = 'triagem'");
  s.hook = () => outraPessoaGrava(s, (p) => (p.empresa = { nome: `v${s.linha.versao}` }));
  await rodarAsync(a, 'await salvarEstado();');
  assert.equal(s.gravacoes().length, 4);
  assert.ok(a.__toasts.some((t) => t.includes('Não foi possível salvar agora')));
  assert.equal(rodar(a, 'state.rs.candidatos[0].etapa'), 'triagem', 'a alteração continua na tela');
  assert.equal(rodar(a, 'temAlteracoesNaoSalvas()'), true);
  assert.equal(a.__timers.at(-1).ms, 15000, 'tenta de novo em 15 segundos');
  s.hook = null;
  await rodarAsync(a, 'await salvarEstado();');
  assert.equal(s.linha.payload.rs.candidatos[0].etapa, 'triagem', 'quando o outro para de gravar, a minha vai');
});

test('uma alteração minha feita DURANTE a gravação não é marcada como salva (e vai na próxima)', async () => {
  const s = criarServidor();
  const a = await cliente(s);
  rodar(a, "state.rs.candidatos[0].etapa = 'triagem'");
  s.hook = () => {
    s.hook = null;
    rodar(a, "state.colaboradores[0].nome = 'Mudei durante a gravação'");
  };
  await rodarAsync(a, 'await salvarEstado();');
  assert.equal(s.linha.payload.colaboradores[0].nome, 'Ana', 'a gravação em curso levava o retrato de antes');
  assert.deepEqual(plano(rodar(a, 'areasAlteradasNoEstado()')), ['colaboradores']);
  await rodarAsync(a, 'await salvarEstado();');
  assert.equal(s.linha.payload.colaboradores[0].nome, 'Mudei durante a gravação');
});

test('gravações simultâneas são feitas UMA DE CADA VEZ (e a segunda, sem nada novo, não grava)', async () => {
  const s = criarServidor();
  const a = await cliente(s);
  rodar(a, "state.rs.candidatos[0].etapa = 'triagem'");
  await rodarAsync(a, 'await Promise.all([salvarEstado(), salvarEstado(), salvarEstado()]);');
  assert.equal(s.gravacoes().length, 1);
  assert.equal(s.linha.versao, 2);
});

// ======================= falhas =======================
test('falha de rede ao gravar: avisa UMA vez, mantém a alteração como "não salva" e agenda nova tentativa; depois grava', async () => {
  const s = criarServidor();
  const a = await cliente(s);
  rodar(a, "state.rs.candidatos[0].etapa = 'triagem'");
  s.falhar = { code: '08006', message: 'rede' };
  await rodarAsync(a, 'await salvarEstado();');
  assert.equal(a.__toasts.filter((t) => t.includes('Não foi possível salvar agora')).length, 1);
  assert.equal(rodar(a, 'temAlteracoesNaoSalvas()'), true);
  assert.equal(s.linha.versao, 1);
  s.falhar = { code: '08006', message: 'rede' };
  await rodarAsync(a, 'await salvarEstado();');
  assert.equal(
    a.__toasts.filter((t) => t.includes('Não foi possível salvar agora')).length,
    1,
    'não repete o aviso em 30 segundos'
  );
  await rodarAsync(a, 'await salvarEstado();');
  assert.equal(s.linha.payload.rs.candidatos[0].etapa, 'triagem');
  assert.equal(rodar(a, 'temAlteracoesNaoSalvas()'), false);
});

test('erro inesperado dentro do salvamento nunca estoura para quem espera (await salvarEstado())', async () => {
  const s = criarServidor();
  const a = await cliente(s);
  rodar(a, "state.rs.candidatos[0].etapa = 'triagem'");
  a.sb = {
    from: () => {
      throw new Error('explodiu');
    },
  };
  await assert.doesNotReject(rodarAsync(a, 'await salvarEstado();'));
  assert.ok(a.__console.some((x) => x[0] === 'error'));
});

test('ao combinar, se não der para buscar a versão do servidor: avisa a falha e não perde nada', async () => {
  const s = criarServidor();
  const a = await cliente(s);
  rodar(a, "state.rs.candidatos[0].etapa = 'triagem'");
  outraPessoaGrava(s, (p) => (p.empresa = { nome: 'Outro' }));
  const original = s.from;
  let leituras = 0;
  s.from = (t) => {
    const b = original(t);
    const sel = b.select.bind(b);
    b.select = (cols) => {
      if (/payload, versao/.test(cols) && leituras++ >= 0) {
        const falso = {
          eq: () => falso,
          maybeSingle: async () => ({ data: null, error: { code: 'x', message: 'falhou' } }),
        };
        return falso;
      }
      return sel(cols);
    };
    return b;
  };
  await rodarAsync(a, 'await salvarEstado();');
  assert.ok(a.__toasts.some((t) => t.includes('Não foi possível salvar agora')));
  assert.equal(rodar(a, 'state.rs.candidatos[0].etapa'), 'triagem');
});

// ======================= empresa nova =======================
test('empresa nova (sem documento ainda): a primeira gravação CRIA o documento (versão 1)', async () => {
  const s = criarServidor({ comLinha: false });
  const a = await cliente(s);
  assert.equal(rodar(a, '_versaoCarregada'), 0);
  rodar(a, "state.empresa = { nome: 'Nova' }");
  await rodarAsync(a, 'await salvarEstado();');
  assert.equal(s.gravacoes()[0].op, 'insert');
  assert.equal(s.linha.versao, 1);
  assert.equal(s.linha.payload.empresa.nome, 'Nova');
  assert.equal(rodar(a, '_versaoCarregada'), 1);
});

test('dois navegadores criam o documento da empresa nova ao mesmo tempo: o segundo toma a duplicidade, combina e grava por cima da versão do primeiro', async () => {
  const s = criarServidor({ comLinha: false });
  const a = await cliente(s);
  const b = await cliente(s);
  rodar(a, "state.empresa = { nome: 'Nova' }");
  rodar(b, "state.colaboradores = [{ id: 'z', nome: 'Zé' }]");
  await rodarAsync(a, 'await salvarEstado();');
  await rodarAsync(b, 'await salvarEstado();');
  assert.equal(s.linha.payload.empresa.nome, 'Nova');
  assert.deepEqual(
    s.linha.payload.colaboradores.map((x) => x.id),
    ['z']
  );
});

// ======================= proteções antigas continuam =======================
test('a trava antiga continua: sem carga bem-sucedida NADA é gravado; falha ao carregar bloqueia e propaga o erro', async () => {
  const s = criarServidor();
  const c = criarCliente(s);
  rodar(c, 'state.rs.candidatos = []'); // o "estado vazio do seed" que já causou perda de dados
  await rodarAsync(c, 'await salvarEstado();');
  assert.equal(s.gravacoes().length, 0);
  assert.equal(rodar(c, 'temAlteracoesNaoSalvas()'), false);
  rodar(c, 'agendarSalvamento()');
  assert.equal(c.__timers.length, 0, 'nem agenda');
  s.from = () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: 'x', message: 'rede' } }) }),
    }),
  });
  await assert.rejects(rodarAsync(c, 'await carregarEstado();'), /Não foi possível carregar/);
  assert.equal(rodar(c, '_cargaInicialOk'), false);
  assert.equal(s.gravacoes().length, 0);
});

test('agendar o salvamento espera 500 ms e grava (o caminho que o sistema usa a cada tela)', async () => {
  const s = criarServidor();
  const a = await cliente(s);
  rodar(a, "state.rs.candidatos[0].etapa = 'triagem'; agendarSalvamento();");
  assert.equal(a.__timers.at(-1).ms, 500);
  await a.__timers.at(-1).fn();
  assert.equal(s.linha.payload.rs.candidatos[0].etapa, 'triagem');
});

test('recarregar (botão Atualizar) reinicia a versão e a base: nada fica "não salvo" e o próximo salvamento usa a versão nova', async () => {
  const s = criarServidor();
  const a = await cliente(s);
  outraPessoaGrava(s, (p) => (p.ciclos[0].nota = 5));
  await rodarAsync(a, 'await carregarEstado();');
  assert.deepEqual(
    [rodar(a, '_versaoCarregada'), rodar(a, 'state.ciclos[0].nota'), rodar(a, 'temAlteracoesNaoSalvas()')],
    [2, 5, false]
  );
  rodar(a, "state.rs.candidatos[0].etapa = 'x'");
  await rodarAsync(a, 'await salvarEstado();');
  assert.equal(s.gravacoes().at(-1).filtros.versao, 2);
});

// ======================= site antes do SQL (ordem de subida) =======================
test('SITE ANTES DO SQL 44: o sistema continua funcionando no modo antigo (carrega sem a coluna, grava com upsert), com aviso no console', async () => {
  const s = criarServidor({ semColuna: true });
  const a = await cliente(s);
  assert.equal(rodar(a, '_semControleDeVersao'), true);
  assert.ok(a.__console.some((x) => x[0] === 'warn' && String(x[1]).includes('sql/44-dados-sistema-versao.sql')));
  rodar(a, "state.rs.candidatos[0].etapa = 'triagem'");
  await rodarAsync(a, 'await salvarEstado();');
  assert.equal(s.gravacoes().at(-1).op, 'upsert');
  assert.equal(s.linha.payload.rs.candidatos[0].etapa, 'triagem');
  assert.equal(
    rodar(a, 'temAlteracoesNaoSalvas()'),
    false,
    'no modo antigo não há "não salvo" para avisar ao fechar a aba'
  );
});

test('a coluna some no meio (erro de coluna inexistente ao gravar): volta para o modo antigo sem perder a gravação', async () => {
  const s = criarServidor();
  const a = await cliente(s);
  rodar(a, "state.rs.candidatos[0].etapa = 'triagem'");
  s.falhar = { code: '42703', message: 'column versao does not exist' };
  await rodarAsync(a, 'await salvarEstado();');
  assert.equal(rodar(a, '_semControleDeVersao'), true);
  assert.equal(s.linha.payload.rs.candidatos[0].etapa, 'triagem');
});

test('depois de o SQL 44 rodar, o próximo carregamento volta ao modo seguro', async () => {
  const s = criarServidor({ semColuna: true });
  const a = await cliente(s);
  assert.equal(rodar(a, '_semControleDeVersao'), true);
  const s2 = criarServidor();
  a.sb = s2;
  await rodarAsync(a, 'await carregarEstado();');
  assert.equal(rodar(a, '_semControleDeVersao'), false);
  assert.equal(rodar(a, '_versaoCarregada'), 1);
});

// ======================= contrato com o SQL e com a página =======================
test('SQL 44: coluna "versao", gatilho que sobe a versão em QUALQUER atualização, sem mexer nas políticas, registrado e re-executável', () => {
  const sql = ler('sql/44-dados-sistema-versao.sql');
  assert.ok(/alter table dados_sistema add column if not exists versao bigint not null default 1;/.test(sql));
  assert.ok(/new\.versao := old\.versao \+ 1;/.test(sql));
  assert.ok(/create trigger trg_dados_sistema_versao\s+before update on dados_sistema\s+for each row/.test(sql));
  assert.ok(/drop trigger if exists trg_dados_sistema_versao/.test(sql) && /create or replace function/.test(sql));
  assert.ok(!/create policy|drop policy|disable row level security/i.test(sql));
  assert.ok(/insert into migrations_aplicadas \(arquivo\) values \('44-dados-sistema-versao\.sql'\)/.test(sql));
});

test('o navegador usa exatamente o contrato do SQL: coluna "versao", gravação condicional, e o upsert sem versão só no modo antigo', () => {
  const js = ler('js/18-persistence.js');
  assert.ok(js.includes(".eq('versao', versao)") && js.includes("select('payload, versao')"));
  const usosUpsert = js.split('\n').filter((l) => /\.upsert\(/.test(l));
  assert.equal(usosUpsert.length, 1, 'só o modo antigo grava por upsert');
  assert.ok(js.indexOf('async function salvarModoAntigo') < js.indexOf('.upsert('));
  assert.ok(ler('app.html').includes('js/53-merge-estado.js'));
  for (const fn of ['mesclarEstadoRemoto', 'canonicoEstado', 'canonPorChave', 'clonarPayloadEstado'])
    assert.ok(js.includes(fn) && ler('js/53-merge-estado.js').includes(`function ${fn}`), fn);
});

test('nenhuma outra parte do navegador grava no documento da empresa (só a persistência)', () => {
  for (const f of fs.readdirSync(path.join(raiz, 'js'))) {
    if (!f.endsWith('.js') || f === '18-persistence.js') continue;
    assert.ok(
      !/from\('dados_sistema'\)\s*\.(upsert|update|insert|delete)/.test(ler(`js/${f}`).replace(/\s+/g, ' ')),
      `js/${f} grava direto em dados_sistema`
    );
  }
});

test('as funções do servidor só LEEM o documento da empresa (se alguma passar a gravar, o controle de versão precisa ser revisto)', () => {
  for (const f of ['nr1', 'ponto', 'rotinas-agendadas']) {
    const src = ler(`supabase/functions/${f}/index.ts`).replace(/\s+/g, ' ');
    const grava = /dados_sistema'\)\s*\.(upsert|insert|delete)|dados_sistema'\)\s*\.update/.test(src);
    assert.equal(grava, false, `${f} grava em dados_sistema`);
  }
});
