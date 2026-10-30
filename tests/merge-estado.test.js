// =========================================================================
// Combinar alterações em três vias (js/53-merge-estado.js). É o que impede duas pessoas de apagarem o trabalho uma da
// outra. Casos escritos à mão para CADA regra, mais cenários aleatórios que verificam que nenhuma alteração se perde.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregarArquivos } = require('./helpers/carregar-arquivos.js');

const c = carregarArquivos(['js/53-merge-estado.js']);
const plano = (x) => JSON.parse(JSON.stringify(x));
const vm = require('vm');
const J = JSON.stringify;
// roda a função dentro do contexto e devolve { valor, conflitos } já como dados simples
function mescla(base, meu, remoto) {
  c.__b = base;
  c.__m = meu;
  c.__r = remoto;
  return plano(
    vm.runInContext(
      '(() => { const conflitos = []; const valor = mesclarValor(__b, __m, __r, "x", conflitos); return { valor, conflitos }; })()',
      c
    )
  );
}
const estado = (base, meu, remoto, chaves) => {
  c.__b = base;
  c.__m = meu;
  c.__r = remoto;
  return plano(
    vm.runInContext(
      `mesclarEstadoRemoto({ base: __b, meu: __m, remoto: __r${chaves ? `, chaves: ${J(chaves)}` : ''} })`,
      c
    )
  );
};
const canon = (v) => {
  c.__v = v;
  return vm.runInContext('canonicoEstado(__v)', c);
};

// ======================= o texto canônico =======================
test('canônico: a ordem das chaves não importa; a ordem de lista importa; propriedades undefined não contam; tipos não se confundem', () => {
  assert.equal(canon({ a: 1, b: 2 }), canon({ b: 2, a: 1 }));
  assert.notEqual(canon([1, 2]), canon([2, 1]));
  assert.equal(canon({ a: 1, b: undefined }), canon({ a: 1 }));
  assert.notEqual(canon(1), canon('1'));
  assert.notEqual(canon(null), canon(undefined));
  assert.notEqual(canon({ a: null }), canon({}));
  assert.equal(canon({ a: { y: [1, { q: 1, p: 2 }], x: 'z' } }), canon({ a: { x: 'z', y: [1, { p: 2, q: 1 }] } }));
  assert.notEqual(canon({ a: 1 }), canon({ a: 2 }));
  assert.notEqual(canon([]), canon({}));
});

test('canônico: datas e objetos com toJSON viram o que seriam ao gravar', () => {
  c.__d = new Date('2026-10-20T12:00:00Z');
  assert.equal(
    vm.runInContext('canonicoEstado(__d)', c),
    vm.runInContext('canonicoEstado("2026-10-20T12:00:00.000Z")', c)
  );
});

test('clonar o payload: cópia profunda e independente', () => {
  c.__o = { a: [{ b: 1 }] };
  const copia = vm.runInContext('clonarPayloadEstado(__o)', c);
  copia.a[0].b = 99;
  assert.equal(c.__o.a[0].b, 1);
  assert.deepEqual(plano(vm.runInContext('clonarPayloadEstado(undefined)', c)), {});
});

// ======================= regras de valor =======================
test('só eu mudei -> vale o meu; só o outro mudou -> vale o dele; os dois igual -> esse; nada mudou -> o mesmo', () => {
  assert.deepEqual(mescla(1, 2, 1), { valor: 2, conflitos: [] });
  assert.deepEqual(mescla(1, 1, 3), { valor: 3, conflitos: [] });
  assert.deepEqual(mescla(1, 5, 5), { valor: 5, conflitos: [] });
  assert.deepEqual(mescla(1, 1, 1), { valor: 1, conflitos: [] });
  assert.deepEqual(mescla({ a: 1 }, { a: 1 }, { a: 1 }), { valor: { a: 1 }, conflitos: [] });
});

test('o mesmo campo mudado de jeitos diferentes é CONFLITO: vale o meu e o ponto é registrado', () => {
  assert.deepEqual(mescla('a', 'b', 'c'), { valor: 'b', conflitos: ['x'] });
  assert.deepEqual(mescla(1, 2, 3), { valor: 2, conflitos: ['x'] });
});

test('objetos: campos DIFERENTES mudados por cada um ficam os dois; campo IGUAL mudado por ambos é conflito só nele', () => {
  const r = mescla(
    { nome: 'A', tel: '1', cidade: 'X' },
    { nome: 'B', tel: '1', cidade: 'X' },
    { nome: 'A', tel: '2', cidade: 'X' }
  );
  assert.deepEqual(r, { valor: { nome: 'B', tel: '2', cidade: 'X' }, conflitos: [] });
  const c2 = mescla({ nome: 'A', tel: '1' }, { nome: 'B', tel: '1' }, { nome: 'C', tel: '2' });
  assert.deepEqual(c2.valor, { nome: 'B', tel: '2' });
  assert.deepEqual(c2.conflitos, ['x.nome']);
});

test('objetos aninhados: combina em qualquer profundidade e informa o caminho do conflito', () => {
  const base = { a: { b: { c: 1, d: 1 } } };
  const r = mescla(base, { a: { b: { c: 2, d: 1 } } }, { a: { b: { c: 3, d: 9 } } });
  assert.deepEqual(r.valor, { a: { b: { c: 2, d: 9 } } });
  assert.deepEqual(r.conflitos, ['x.a.b.c']);
});

test('campo novo criado por um lado e outro campo novo do outro: ficam os dois; campo apagado por um e intocado pelo outro some', () => {
  assert.deepEqual(mescla({ a: 1 }, { a: 1, b: 2 }, { a: 1, c: 3 }).valor, { a: 1, b: 2, c: 3 });
  assert.deepEqual(mescla({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 2 }).valor, { a: 1 });
  assert.deepEqual(mescla({ a: 1, b: 2 }, { a: 1, b: 2 }, { a: 1 }).valor, { a: 1 });
});

test('apagar x alterar: o campo FICA (alterado) e registra conflito — nunca se perde dado', () => {
  assert.deepEqual(mescla({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 99 }), { valor: { a: 1, b: 99 }, conflitos: ['x.b'] });
  assert.deepEqual(mescla({ a: 1, b: 2 }, { a: 1, b: 77 }, { a: 1 }), { valor: { a: 1, b: 77 }, conflitos: ['x.b'] });
});

// ======================= listas com id =======================
const item = (id, extra) => ({ id, nome: `P${id}`, etapa: 'nova', ...extra });
const ids = (r) => r.valor.map((x) => x.id);

test('listas com id: cada um mexe em um item DIFERENTE -> os dois alterados ficam, sem conflito', () => {
  const base = [item('a'), item('b'), item('c')];
  const r = mescla(
    base,
    [item('a', { etapa: 'triagem' }), item('b'), item('c')],
    [item('a'), item('b'), item('c', { nome: 'Carla' })]
  );
  assert.deepEqual(r.conflitos, []);
  assert.deepEqual(r.valor, [item('a', { etapa: 'triagem' }), item('b'), item('c', { nome: 'Carla' })]);
});

test('listas com id: cada um mexe em CAMPOS diferentes do MESMO item -> os dois campos ficam, sem conflito', () => {
  const base = [item('a')];
  const r = mescla(base, [item('a', { etapa: 'triagem' })], [item('a', { nome: 'Ana' })]);
  assert.deepEqual(r.valor, [item('a', { etapa: 'triagem', nome: 'Ana' })]);
  assert.deepEqual(r.conflitos, []);
});

test('listas com id: o MESMO campo do mesmo item mudado pelos dois -> vale o meu e só aquele ponto é conflito', () => {
  const r = mescla([item('a')], [item('a', { etapa: 'video' })], [item('a', { etapa: 'prova' })]);
  assert.equal(r.valor[0].etapa, 'video');
  assert.deepEqual(r.conflitos, ['x[id=a].etapa']);
});

test('listas com id: item NOVO de cada lado -> os dois entram, na ordem do servidor e depois os meus', () => {
  const base = [item('a')];
  const r = mescla(base, [item('a'), item('meu1'), item('meu2')], [item('a'), item('dele')]);
  assert.deepEqual(ids(r), ['a', 'dele', 'meu1', 'meu2']);
  assert.deepEqual(r.conflitos, []);
});

test('listas com id: item apagado por um e intocado pelo outro some; apagado pelos dois some', () => {
  const base = [item('a'), item('b'), item('c')];
  assert.deepEqual(
    ids(mescla(base, [item('a'), item('c')], [item('a'), item('b'), item('c')])),
    ['a', 'c'],
    'eu apaguei b'
  );
  assert.deepEqual(
    ids(mescla(base, [item('a'), item('b'), item('c')], [item('b'), item('c')])),
    ['b', 'c'],
    'o outro apagou a'
  );
  assert.deepEqual(ids(mescla(base, [item('a'), item('c')], [item('a'), item('c')])), ['a', 'c'], 'os dois apagaram b');
});

test('listas com id: apaguei um item que o outro ALTEROU -> o item fica (alterado) e há conflito; e o inverso', () => {
  const base = [item('a'), item('b')];
  const eu = mescla(base, [item('a')], [item('a'), item('b', { nome: 'Alterado' })]);
  assert.deepEqual(ids(eu), ['a', 'b']);
  assert.equal(eu.valor[1].nome, 'Alterado');
  assert.deepEqual(eu.conflitos, ['x[id=b]']);
  const ele = mescla(base, [item('a'), item('b', { nome: 'Meu' })], [item('a')]);
  assert.deepEqual(ids(ele), ['a', 'b']);
  assert.equal(ele.valor[1].nome, 'Meu');
});

test('listas com id: ids numéricos e textuais funcionam; item com id 0 conta como id', () => {
  const r = mescla(
    [
      { id: 0, v: 1 },
      { id: 1, v: 1 },
    ],
    [
      { id: 0, v: 2 },
      { id: 1, v: 1 },
    ],
    [
      { id: 0, v: 1 },
      { id: 1, v: 3 },
    ]
  );
  assert.deepEqual(r.valor, [
    { id: 0, v: 2 },
    { id: 1, v: 3 },
  ]);
});

test('listas com id: lista que veio vazia/ausente na base (primeiros itens dos dois lados) combina sem perder', () => {
  assert.deepEqual(ids(mescla(undefined, [item('x')], [item('y')])), ['y', 'x']);
  assert.deepEqual(ids(mescla([], [item('x')], [item('y')])), ['y', 'x']);
});

// ======================= listas sem id =======================
test('lista que só cresce (histórico): junta os acréscimos dos dois lados, sem repetir e sem conflito', () => {
  const base = [{ para: 'nova' }];
  const r = mescla(base, [{ para: 'nova' }, { para: 'triagem' }], [{ para: 'nova' }, { para: 'video' }]);
  assert.deepEqual(r.valor, [{ para: 'nova' }, { para: 'video' }, { para: 'triagem' }]);
  assert.deepEqual(r.conflitos, []);
  const igual = mescla(base, [{ para: 'nova' }, { para: 'x' }], [{ para: 'nova' }, { para: 'x' }, { para: 'y' }]);
  assert.deepEqual(
    igual.valor,
    [{ para: 'nova' }, { para: 'x' }, { para: 'y' }],
    'o mesmo acréscimo dos dois lados não duplica'
  );
});

test('lista de textos que os dois aumentaram: junta; se um REMOVEU e o outro acrescentou, é conflito e vale a minha', () => {
  assert.deepEqual(mescla(['A', 'B'], ['A', 'B', 'C'], ['A', 'B', 'D']).valor, ['A', 'B', 'D', 'C']);
  const r = mescla(['A', 'B'], ['B'], ['A', 'B', 'D']);
  assert.deepEqual(r.valor, ['B']);
  assert.deepEqual(r.conflitos, ['x']);
});

test('itens sem id (ou com id repetido) são tratados como um bloco: conflito, vale o meu', () => {
  const semId = mescla([{ v: 1 }], [{ v: 2 }], [{ v: 3 }]);
  assert.deepEqual(semId.valor, [{ v: 2 }]);
  assert.deepEqual(semId.conflitos, ['x']);
  const repetido = mescla(
    [
      { id: 'a', v: 1 },
      { id: 'a', v: 1 },
    ],
    [
      { id: 'a', v: 2 },
      { id: 'a', v: 1 },
    ],
    [
      { id: 'a', v: 1 },
      { id: 'a', v: 3 },
    ]
  );
  assert.deepEqual(repetido.conflitos, ['x'], 'ids repetidos: não dá para identificar os itens');
});

test('tipos diferentes dos dois lados (lista x objeto x texto): conflito, vale o meu', () => {
  assert.deepEqual(mescla({ a: 1 }, [1], { b: 2 }).conflitos, ['x']);
  assert.deepEqual(mescla('t', { a: 1 }, 'u').valor, { a: 1 });
});

// ======================= campo que a base nunca teve =======================
test('campo AUSENTE na base: um valor vazio (nulo, texto vazio, lista ou objeto vazio) de um lado NÃO conta como alteração e não apaga o dado real do outro', () => {
  for (const vazio of [null, '', [], {}]) {
    assert.deepEqual(
      mescla(undefined, vazio, { nome: 'Real' }),
      { valor: { nome: 'Real' }, conflitos: [] },
      `vazio do meu lado: ${J(vazio)}`
    );
    assert.deepEqual(
      mescla(undefined, { nome: 'Meu' }, vazio),
      { valor: { nome: 'Meu' }, conflitos: [] },
      `vazio do outro lado: ${J(vazio)}`
    );
  }
});

test('campo AUSENTE na base e com valor real dos dois lados e diferente: continua sendo conflito (vale o meu)', () => {
  assert.deepEqual(mescla(undefined, 'a', 'b'), { valor: 'a', conflitos: ['x'] });
});

test('o vazio só é "padrão" quando a base NUNCA teve o campo: se a base tinha valor, esvaziar é uma alteração de verdade', () => {
  assert.deepEqual(
    mescla({ a: 1 }, {}, { a: 2 }).valor,
    { a: 2 },
    'eu esvaziei, o outro alterou: o campo alterado fica'
  );
  assert.deepEqual(mescla(['x'], [], ['x', 'y']).conflitos, ['x'], 'esvaziar uma lista que existia é alteração');
});

// ======================= o documento inteiro =======================
const AREAS = ['empresa', 'colaboradores', 'ciclos', 'rs'];
test('documento: áreas diferentes mexidas por cada um ficam as duas (o caso do RH desatualizado x o líder)', () => {
  const base = {
    empresa: { nome: 'X' },
    colaboradores: [item('c1')],
    ciclos: [{ id: 'k1', nota: null }],
    rs: { candidatos: [item('a')] },
  };
  const lider = { ...base, ciclos: [{ id: 'k1', nota: 8 }] }; // o líder enviou a avaliação (o servidor já tem isso)
  const rh = { ...base, rs: { candidatos: [item('a', { etapa: 'triagem' })] } }; // o RH, com a tela velha, moveu um candidato
  const r = estado(base, rh, lider, AREAS);
  assert.deepEqual(r.conflitos, []);
  assert.equal(r.estado.ciclos[0].nota, 8, 'a avaliação do líder NÃO pode sumir');
  assert.equal(r.estado.rs.candidatos[0].etapa, 'triagem', 'o movimento do RH também fica');
});

test('documento: área nova que só o servidor tem (ou só eu tenho) entra; as áreas pedidas são as únicas combinadas', () => {
  assert.deepEqual(estado({}, {}, { nr1: { a: 1 } }, ['nr1']).estado, { nr1: { a: 1 } });
  assert.deepEqual(estado({}, { rs: { v: 1 } }, {}, ['rs']).estado, { rs: { v: 1 } });
  assert.deepEqual(Object.keys(estado({ a: 1, b: 1 }, { a: 2, b: 1 }, { a: 1, b: 3 }, ['a']).estado), ['a']);
  assert.deepEqual(estado(null, null, null, ['x']), { estado: {}, conflitos: [] });
});

test('documento: os caminhos de conflito levam o nome da área', () => {
  const r = estado({ empresa: { nome: 'A' } }, { empresa: { nome: 'B' } }, { empresa: { nome: 'C' } }, ['empresa']);
  assert.deepEqual(r.conflitos, ['empresa.nome']);
});

// ======================= propriedades (aleatório, com semente fixa) =======================
function prng(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function cenarioAleatorio(rnd) {
  const n = 5 + Math.floor(rnd() * 25);
  const base = {
    pessoas: Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      nome: `Nome ${i}`,
      nota: i,
      etapa: 'nova',
      hist: [],
    })),
    config: { a: 1, b: 2, c: 3 },
  };
  const meu = JSON.parse(JSON.stringify(base));
  const remoto = JSON.parse(JSON.stringify(base));
  const indices = Array.from({ length: n }, (_, i) => i).sort(() => rnd() - 0.5);
  const meia = Math.floor(n / 2);
  const meus = indices.slice(0, meia);
  const deles = indices.slice(meia);
  const esperado = {
    meusEditados: [],
    delesEditados: [],
    meusNovos: [],
    delesNovos: [],
    apagadosPorMim: [],
    apagadosPorEle: [],
  };
  for (const i of meus.slice(0, Math.max(1, Math.floor(meus.length / 2)))) {
    meu.pessoas[i].etapa = 'minha';
    esperado.meusEditados.push(`p${i}`);
  }
  for (const i of meus.slice(Math.floor(meus.length / 2), Math.floor(meus.length / 2) + 2)) {
    meu.pessoas[i] = null; // marcado para apagar abaixo
    esperado.apagadosPorMim.push(`p${i}`);
  }
  meu.pessoas = meu.pessoas.filter(Boolean);
  for (const i of deles.slice(0, Math.max(1, Math.floor(deles.length / 2)))) {
    remoto.pessoas[i].nota = 1000 + i;
    esperado.delesEditados.push(`p${i}`);
  }
  for (const i of deles.slice(Math.floor(deles.length / 2), Math.floor(deles.length / 2) + 2)) {
    remoto.pessoas[i] = null;
    esperado.apagadosPorEle.push(`p${i}`);
  }
  remoto.pessoas = remoto.pessoas.filter(Boolean);
  const k = 1 + Math.floor(rnd() * 3);
  for (let j = 0; j < k; j++) {
    meu.pessoas.push({ id: `novo-meu-${j}`, nome: 'm', nota: 0, etapa: 'nova', hist: [] });
    esperado.meusNovos.push(`novo-meu-${j}`);
    remoto.pessoas.push({ id: `novo-dele-${j}`, nome: 'd', nota: 0, etapa: 'nova', hist: [] });
    esperado.delesNovos.push(`novo-dele-${j}`);
  }
  meu.config.a = 'minha';
  remoto.config.b = 'dele';
  return { base, meu, remoto, esperado };
}

test('PROPRIEDADE (300 cenários): edições em itens diferentes + itens novos + apagados dos dois lados NUNCA perdem nada e nunca dão conflito', () => {
  const rnd = prng(20261029);
  for (let i = 0; i < 300; i++) {
    const { base, meu, remoto, esperado } = cenarioAleatorio(rnd);
    const r = estado(base, meu, remoto, ['pessoas', 'config']);
    assert.deepEqual(r.conflitos, [], `cenário ${i}: não deveria haver conflito`);
    const porId = new Map(r.estado.pessoas.map((p) => [p.id, p]));
    for (const id of esperado.meusEditados)
      assert.equal(porId.get(id).etapa, 'minha', `cenário ${i}: perdi minha edição em ${id}`);
    for (const id of esperado.delesEditados)
      assert.equal(porId.get(id).nota, 1000 + Number(id.slice(1)), `cenário ${i}: perdi a edição dele em ${id}`);
    for (const id of [...esperado.meusNovos, ...esperado.delesNovos])
      assert.ok(porId.has(id), `cenário ${i}: perdi o item novo ${id}`);
    for (const id of [...esperado.apagadosPorMim, ...esperado.apagadosPorEle])
      assert.ok(!porId.has(id), `cenário ${i}: ${id} deveria ter sido apagado`);
    assert.equal(r.estado.config.a, 'minha');
    assert.equal(r.estado.config.b, 'dele');
    assert.equal(
      new Set(r.estado.pessoas.map((p) => p.id)).size,
      r.estado.pessoas.length,
      `cenário ${i}: item duplicado`
    );
  }
});

test('PROPRIEDADE: trocar quem é "eu" e quem é "o outro" dá o mesmo conjunto de itens com os mesmos valores (sem depender de quem salvou primeiro)', () => {
  const rnd = prng(7);
  const ordenado = (e) => J(e.pessoas.slice().sort((a, b) => a.id.localeCompare(b.id)));
  for (let i = 0; i < 100; i++) {
    const { base, meu, remoto } = cenarioAleatorio(rnd);
    assert.equal(
      ordenado(estado(base, meu, remoto, ['pessoas']).estado),
      ordenado(estado(base, remoto, meu, ['pessoas']).estado),
      `cenário ${i}`
    );
  }
});

test('PROPRIEDADE: sem mudança do outro o resultado é exatamente o meu; sem mudança minha é exatamente o dele; duas versões iguais não mudam nada', () => {
  const rnd = prng(99);
  for (let i = 0; i < 50; i++) {
    const { base, meu, remoto } = cenarioAleatorio(rnd);
    assert.equal(
      canon(estado(base, meu, base, ['pessoas', 'config']).estado),
      canon({ pessoas: meu.pessoas, config: meu.config })
    );
    assert.equal(
      canon(estado(base, base, remoto, ['pessoas', 'config']).estado),
      canon({ pessoas: remoto.pessoas, config: remoto.config })
    );
    assert.equal(
      canon(estado(base, meu, meu, ['pessoas', 'config']).estado),
      canon({ pessoas: meu.pessoas, config: meu.config })
    );
  }
});

test('o resultado não altera as entradas (base, meu e remoto continuam como eram)', () => {
  const rnd = prng(5);
  const { base, meu, remoto } = cenarioAleatorio(rnd);
  const antes = [J(base), J(meu), J(remoto)];
  estado(base, meu, remoto, ['pessoas', 'config']);
  assert.deepEqual([J(base), J(meu), J(remoto)], antes);
});

test('lista grande (3000 itens, poucos alterados) combina rápido', () => {
  const grande = Array.from({ length: 3000 }, (_, i) => ({ id: `i${i}`, v: i, tags: ['a', 'b'] }));
  const meu = JSON.parse(JSON.stringify(grande));
  const remoto = JSON.parse(JSON.stringify(grande));
  meu[10].v = 'meu';
  remoto[2000].v = 'dele';
  const t0 = Date.now();
  const r = estado({ x: grande }, { x: meu }, { x: remoto }, ['x']);
  assert.ok(Date.now() - t0 < 1500, `levou ${Date.now() - t0} ms`);
  assert.equal(r.estado.x[10].v, 'meu');
  assert.equal(r.estado.x[2000].v, 'dele');
  assert.deepEqual(r.conflitos, []);
});
